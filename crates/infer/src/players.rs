//! The players of the v4 bench (`v4bench`), each described by its *tied
//! set*: the moves it would pick from uniformly at random. One protocol then
//! measures every player two ways — the value it keeps on positions of the
//! solved uncapped game, and its score against greedy in the arena — and
//! needs no libtorch.
//!
//! Specs read by [`player_from_spec`]:
//!
//! - `random`: every legal move, after taking a move that wins at once and
//!   avoiding one that loses at once (round 3's `Policy::Random`, the
//!   definition behind its 0.360 / 0.112 control);
//! - `greedy`: the most tops after the move (round 3's list `[top_diff up]`,
//!   which reproduces `Scripted::Greedy` move for move);
//! - `greedy-2ply`: [`GreedyTwoPly`];
//! - `table`: perfect play of the uncapped game, read from the solved table
//!   (see [`TablePlayer`]);
//! - `net:<pfw>[:sims]`: the net's most-visited move(s) after `sims`
//!   simulations (default 100), or with `:0` the move(s) of highest prior;
//! - `td:<pfv>` and `qtab:<file>`: parsed, not yet available.

use crate::mcts::{search, Evaluator, MctsConfig};
use crate::mlp::Mlp;
use anyhow::{bail, Context};
use pogofish_engine::{apply_move, is_terminal, legal_moves, GameState, Move, RuleSet};
use pogofish_search::arena::Agent;
use pogofish_search::perfect::{Criterion, Policy, PolicyPlayer, Sample, Solved};
use pogofish_search::principles::GreedyTwoPly;
use pogofish_search::retro::Value;
use pogofish_search::rng::SplitMix64;
use serde::Serialize;

/// Default simulations of a `net:` player (the round-2 protocol).
pub const DEFAULT_SIMS: u32 = 100;

/// The table player's tie-break, as recorded in the bench's JSON.
pub const TABLE_TIEBREAK: &str = "Moves that lose at once under the live rules (a third \
occurrence under lc1-2) are set aside unless every candidate does. Among the rest: from a won \
position, the moves to Loss(d) with the smallest d; from a drawn position, the moves whose child \
is not Win; from a lost position, the moves to Win(d) with the largest d. Uniform pick among them.";

/// A player described by the set of moves it picks from uniformly.
pub trait TiedChooser: Send {
    fn name(&self) -> String;
    /// The moves the player picks from uniformly, never empty for a position
    /// with a legal move.
    fn tied(&mut self, s: &GameState, rules: &RuleSet) -> Vec<Move>;
}

/// Any tied chooser as an arena agent: a uniform pick from its tied set
/// with the arena's generator.
pub struct TiedAgent<'a>(pub Box<dyn TiedChooser + 'a>);

impl Agent for TiedAgent<'_> {
    fn name(&self) -> String {
        self.0.name()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        let tied = self.0.tied(state, rules);
        tied[rng.below(tied.len())]
    }
}

struct Scripted {
    name: &'static str,
    policy: PolicyPlayer,
}

impl TiedChooser for Scripted {
    fn name(&self) -> String {
        self.name.into()
    }

    fn tied(&mut self, s: &GameState, rules: &RuleSet) -> Vec<Move> {
        self.policy.best_moves(s, rules)
    }
}

struct TwoPly;

impl TiedChooser for TwoPly {
    fn name(&self) -> String {
        "greedy-2ply".into()
    }

    fn tied(&mut self, s: &GameState, rules: &RuleSet) -> Vec<Move> {
        GreedyTwoPly.best_moves(s, rules)
    }
}

/// Perfect play of the uncapped game, read from the table. A position's
/// value is the uncapped one: the table ignores repetition. So the moves
/// that lose at once under the live rules (a third occurrence under `lc1-2`)
/// are set aside first, unless every candidate does; then from a won
/// position it takes the moves to `Loss(d)` with the smallest `d`, from a
/// drawn one the moves whose child is not `Win`, from a lost one the moves
/// to `Win(d)` with the largest `d` (the longest defence). See
/// [`TABLE_TIEBREAK`].
pub struct TablePlayer<'a> {
    pub sv: &'a Solved,
}

impl TablePlayer<'_> {
    /// The class rule applied to `(move, child value)` pairs.
    fn by_value(parent: Value, cands: &[(Move, Value)]) -> Vec<Move> {
        let pick = |key: &dyn Fn(Value) -> Option<i32>| -> Vec<Move> {
            let best = cands.iter().filter_map(|&(_, v)| key(v)).max();
            cands
                .iter()
                .filter(|&&(_, v)| best.is_some() && key(v) == best)
                .map(|&(m, _)| m)
                .collect()
        };
        match parent {
            Value::Win(_) => pick(&|v| match v {
                Value::Loss(d) => Some(-(d as i32)),
                _ => None,
            }),
            Value::Draw => pick(&|v| (!matches!(v, Value::Win(_))).then_some(0)),
            _ => pick(&|v| match v {
                Value::Win(d) => Some(d as i32),
                _ => None,
            }),
        }
    }
}

impl TiedChooser for TablePlayer<'_> {
    fn name(&self) -> String {
        "table".into()
    }

    fn tied(&mut self, s: &GameState, rules: &RuleSet) -> Vec<Move> {
        let mover = s.to_move();
        let parent = self.sv.state_value(s);
        let mut all = Vec::new();
        let mut safe = Vec::new();
        for m in legal_moves(s) {
            let next = apply_move(s, m).expect("legal move");
            let v = self.sv.state_value(&next);
            all.push((m, v));
            let loses_at_once = matches!(is_terminal(&next, rules),
                Some(o) if o.winner().is_some() && o.winner() != Some(mover));
            if !loses_at_once {
                safe.push((m, v));
            }
        }
        let tied = Self::by_value(parent, &safe);
        if !tied.is_empty() {
            return tied;
        }
        let tied = Self::by_value(parent, &all);
        if tied.is_empty() {
            all.into_iter().map(|(m, _)| m).collect()
        } else {
            tied
        }
    }
}

/// Round 3's anti-oracle control: every move that does *not* keep the
/// uncapped value (from a win, a move to a non-loss; from a draw, a move to
/// a win), or every move when all keep it. Its keep rate must equal the
/// share of positions where every move keeps the value.
pub struct AntiOracle<'a> {
    pub sv: &'a Solved,
}

impl TiedChooser for AntiOracle<'_> {
    fn name(&self) -> String {
        "anti-oracle".into()
    }

    fn tied(&mut self, s: &GameState, _rules: &RuleSet) -> Vec<Move> {
        let won = matches!(self.sv.state_value(s), Value::Win(_));
        let all = legal_moves(s);
        let picked: Vec<Move> = all
            .iter()
            .copied()
            .filter(|&m| {
                let v = self.sv.state_value(&apply_move(s, m).expect("legal move"));
                let keeps = if won {
                    matches!(v, Value::Loss(_))
                } else {
                    !matches!(v, Value::Win(_))
                };
                !keeps
            })
            .collect();
        if picked.is_empty() {
            all
        } else {
            picked
        }
    }
}

/// A pure-Rust net: its most-visited move(s) after `sims` simulations (no
/// root noise), or with `sims == 0` the legal move(s) of highest prior.
pub struct NetPlayer {
    pub net: Mlp,
    pub sims: u32,
    pub label: String,
}

/// Indices of the maximum values (exact ties).
fn argmax_all<T: PartialOrd + Copy>(xs: &[T]) -> Vec<usize> {
    let mut best: Vec<usize> = Vec::new();
    for (i, &x) in xs.iter().enumerate() {
        match best.first() {
            Some(&b) if x < xs[b] => {}
            Some(&b) if x == xs[b] => best.push(i),
            _ => best = vec![i],
        }
    }
    best
}

impl TiedChooser for NetPlayer {
    fn name(&self) -> String {
        format!("net:{}:{}", self.label, self.sims)
    }

    fn tied(&mut self, s: &GameState, rules: &RuleSet) -> Vec<Move> {
        if self.sims == 0 {
            let moves = legal_moves(s);
            let (priors, _) = self.net.evaluate(s, &moves);
            return argmax_all(&priors).into_iter().map(|i| moves[i]).collect();
        }
        let cfg = MctsConfig {
            num_simulations: self.sims,
            ..MctsConfig::default()
        };
        let r = search(&self.net, s, rules, &cfg, None);
        let visits: Vec<u32> = r.visits.iter().map(|&(_, v)| v).collect();
        argmax_all(&visits)
            .into_iter()
            .map(|i| r.visits[i].0)
            .collect()
    }
}

/// A player from its spec (see the module documentation). `table` needs
/// the solved table.
pub fn player_from_spec<'a>(
    spec: &str,
    sv: Option<&'a Solved>,
) -> anyhow::Result<Box<dyn TiedChooser + 'a>> {
    let scripted = |name: &'static str, policy: Policy| -> Box<dyn TiedChooser + 'a> {
        Box::new(Scripted {
            name,
            policy: PolicyPlayer {
                name: name.into(),
                policy,
            },
        })
    };
    match spec {
        "random" => return Ok(scripted("random", Policy::Random)),
        "greedy" => {
            return Ok(scripted(
                "greedy",
                Policy::List(vec![Criterion {
                    feature: 0,
                    sign: 1.0,
                }]),
            ))
        }
        "greedy-2ply" => return Ok(Box::new(TwoPly)),
        "table" => {
            let sv = sv.context("the table player needs the solved table")?;
            return Ok(Box::new(TablePlayer { sv }));
        }
        _ => {}
    }
    let (kind, rest) = spec.split_once(':').unwrap_or((spec, ""));
    match kind {
        "net" if !rest.is_empty() => {
            let (path, sims) = match rest.rsplit_once(':') {
                Some((p, n)) if !p.is_empty() && n.parse::<u32>().is_ok() => {
                    (p, n.parse().expect("checked"))
                }
                _ => (rest, DEFAULT_SIMS),
            };
            let bytes = std::fs::read(path).with_context(|| format!("reading {path}"))?;
            let net = Mlp::from_bytes(&bytes).with_context(|| format!("loading {path}"))?;
            Ok(Box::new(NetPlayer {
                net,
                sims,
                label: path.to_string(),
            }))
        }
        "td" if !rest.is_empty() => bail!("td: player arrives in Task 4"),
        "qtab" if !rest.is_empty() => bail!("qtab: player arrives in Task 7"),
        _ => bail!(
            "unknown player '{spec}': expected random, greedy, greedy-2ply, table, \
             net:<pfw>[:sims], td:<pfv> or qtab:<file>"
        ),
    }
}

/// The chance that a uniform pick from `tied` keeps the sample's value.
pub fn keep_of(sample: &Sample, tied: &[Move]) -> f64 {
    let kept = tied
        .iter()
        .filter(|m| {
            let i = sample
                .moves
                .iter()
                .position(|x| x == *m)
                .expect("a legal move");
            sample.keeps[i]
        })
        .count();
    kept as f64 / tied.len() as f64
}

/// Mean over positions with its 95 % interval: mean ± 1.96 · s / √n, with
/// the sample standard deviation (round 3's `rate_json`, not clipped).
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct RateStat {
    pub rate: f64,
    pub ci95: [f64; 2],
    pub n: usize,
}

pub fn rate_stat(xs: &[f64]) -> RateStat {
    let n = xs.len() as f64;
    let m = xs.iter().sum::<f64>() / n;
    let v = xs.iter().map(|x| (x - m).powi(2)).sum::<f64>() / (n - 1.0);
    let h = 1.96 * (v / n).sqrt();
    RateStat {
        rate: m,
        ci95: [m - h, m + h],
        n: xs.len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actions::{move_to_index, ACTION_SIZE};
    use crate::features::Features;
    use crate::mlp::Linear;
    use pogofish_engine::testing::state_with_repeated_key;
    use pogofish_engine::{initial_state, Outcome};
    use pogofish_search::perfect::{build_sample, held_out, keeps_value};
    use pogofish_search::retro::{solve_in_memory, Bitset, Game, MoveRule};

    const LC1_2: RuleSet = RuleSet::LC1 { repetitions: 2 };

    /// A small variant (3 White, 3 Red), solved in memory, every index
    /// counted as reachable.
    fn small_solved() -> Solved {
        let g = Game::new(3, 3, MoveRule::published());
        let (t, _) = solve_in_memory(&g, 1);
        let reach = Bitset::new(g.size());
        for i in 0..g.size() {
            reach.set(i);
        }
        Solved { g, t, reach }
    }

    #[test]
    fn table_tied_set_avoids_repetition_loss() {
        let sv = small_solved();
        // A drawn position with at least two draw-keeping moves.
        let (s, keeping) = (0..sv.g.size())
            .find_map(|i| {
                if sv.t[i as usize] == pogofish_search::retro::DRAW {
                    let s = sv.g.unrank(i).to_state();
                    if is_terminal(&s, &LC1_2).is_some() {
                        return None;
                    }
                    let keeping: Vec<Move> = legal_moves(&s)
                        .into_iter()
                        .filter(|&m| {
                            let v = sv.state_value(&apply_move(&s, m).unwrap());
                            keeps_value(Value::Draw, v).unwrap()
                        })
                        .collect();
                    (keeping.len() >= 2).then_some((s, keeping))
                } else {
                    None
                }
            })
            .expect("the small game has such a position");
        let m0 = keeping[0];
        let mut table = TablePlayer { sv: &sv };
        // Without history the move keeps the draw and is in the set.
        assert!(table.tied(&s, &LC1_2).contains(&m0));
        // Its child already occurred twice: playing it is a third occurrence.
        let child = apply_move(&s, m0).unwrap();
        let s = state_with_repeated_key(&s, child.key(), 2);
        let repeated = apply_move(&s, m0).unwrap();
        let o = is_terminal(&repeated, &LC1_2).expect("third occurrence ends the game");
        assert_ne!(o.winner(), Some(s.to_move()));
        assert_ne!(o, Outcome::DrawEarned);
        let tied = table.tied(&s, &LC1_2);
        assert!(!tied.contains(&m0), "{tied:?}");
        assert!(!tied.is_empty());
        for m in tied {
            let v = sv.state_value(&apply_move(&s, m).unwrap());
            assert!(keeps_value(Value::Draw, v).unwrap());
        }
    }

    #[test]
    fn lost_position_has_no_keeping_move() {
        for d in [0, 1, 7] {
            for child in [Value::Win(3), Value::Loss(2), Value::Draw] {
                assert_eq!(keeps_value(Value::Loss(d), child), None);
            }
        }
        let sv = small_solved();
        let (won, drawn) = held_out(&sv, 50, 50, 31);
        assert_eq!((won.len(), drawn.len()), (50, 50));
        for &i in won.iter().chain(&drawn) {
            let v = sv.value(&sv.g.unrank(i));
            assert!(
                matches!(v, Value::Win(d) if d >= 3) || v == Value::Draw,
                "index {i}: {v:?}"
            );
        }
        // Falsification: the small game does have lost positions to avoid.
        assert!((0..sv.g.size()).any(|i| matches!(
            pogofish_search::retro::decode(sv.t[i as usize]),
            Value::Loss(_)
        )));
    }

    fn zero(inputs: usize, outputs: usize) -> Linear {
        Linear {
            inputs,
            outputs,
            weight: vec![0.0; inputs * outputs],
            bias: vec![0.0; outputs],
        }
    }

    /// A net whose policy logits are `logits` whatever the input.
    fn constant_net(logits: Vec<f32>) -> Mlp {
        let size = Features::MoverRelative.size();
        let mut out = zero(1, ACTION_SIZE);
        out.bias = logits;
        Mlp {
            features: Features::MoverRelative,
            trunk: Vec::new(),
            policy: [zero(size, 1), out],
            value: [zero(size, 1), zero(1, 1)],
        }
    }

    #[test]
    fn net_zero_sims_is_policy_argmax() {
        let s = initial_state();
        let moves = legal_moves(&s);
        let (a, b, c) = (moves[3], moves[7], moves[1]);
        let mut logits = vec![0.0; ACTION_SIZE];
        logits[move_to_index(&a)] = 2.0;
        logits[move_to_index(&b)] = 2.0;
        logits[move_to_index(&c)] = 1.5;
        // An illegal action with the highest logit must not count.
        let illegal = (0..ACTION_SIZE)
            .find(|&i| !moves.iter().any(|m| move_to_index(m) == i))
            .unwrap();
        logits[illegal] = 9.0;
        let mut p = NetPlayer {
            net: constant_net(logits),
            sims: 0,
            label: "constant".into(),
        };
        let mut tied = p.tied(&s, &LC1_2);
        tied.sort_by_key(move_to_index);
        let mut want = vec![a, b];
        want.sort_by_key(move_to_index);
        assert_eq!(tied, want);
        // With a search, the set is the most-visited moves instead.
        p.sims = 50;
        let r = search(
            &p.net,
            &s,
            &LC1_2,
            &MctsConfig {
                num_simulations: 50,
                ..MctsConfig::default()
            },
            None,
        );
        let most = r.visits.iter().map(|&(_, v)| v).max().unwrap();
        for m in p.tied(&s, &LC1_2) {
            assert!(r.visits.iter().any(|&(x, v)| x == m && v == most));
        }
    }

    #[test]
    fn spec_parsing_rejects_unknown_player() {
        for bad in ["", "minimax", "net:", "net", "td", "qtab", "greedy-3ply"] {
            assert!(player_from_spec(bad, None).is_err(), "{bad}");
        }
        let e = player_from_spec("td:x.pfv", None)
            .err()
            .unwrap()
            .to_string();
        assert_eq!(e, "td: player arrives in Task 4");
        let e = player_from_spec("qtab:x.bin", None)
            .err()
            .unwrap()
            .to_string();
        assert_eq!(e, "qtab: player arrives in Task 7");
        assert!(player_from_spec("table", None).is_err());
        for good in ["random", "greedy", "greedy-2ply"] {
            assert_eq!(player_from_spec(good, None).unwrap().name(), good);
        }
    }

    #[test]
    fn net_spec_reads_simulations_and_defaults_to_100() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../cli/assets/az-lc1-s1.pfw");
        let p = player_from_spec(&format!("net:{path}"), None).unwrap();
        assert_eq!(p.name(), format!("net:{path}:100"));
        let p = player_from_spec(&format!("net:{path}:0"), None).unwrap();
        assert_eq!(p.name(), format!("net:{path}:0"));
        assert!(player_from_spec("net:/no/such/file.pfw", None).is_err());
    }

    #[test]
    fn keep_rate_is_the_share_of_the_tied_set_that_keeps() {
        let sv = small_solved();
        let (won, _) = held_out(&sv, 5, 5, 31);
        let s = build_sample(&sv, won[0]);
        let keeping: Vec<Move> = s
            .moves
            .iter()
            .zip(&s.keeps)
            .filter(|(_, &k)| k)
            .map(|(&m, _)| m)
            .collect();
        let losing: Vec<Move> = s
            .moves
            .iter()
            .zip(&s.keeps)
            .filter(|(_, &k)| !k)
            .map(|(&m, _)| m)
            .collect();
        assert!(!keeping.is_empty() && !losing.is_empty());
        assert_eq!(keep_of(&s, &keeping), 1.0);
        assert_eq!(keep_of(&s, &losing), 0.0);
        assert_eq!(keep_of(&s, &[keeping[0], losing[0]]), 0.5);

        let st = rate_stat(&[1.0, 0.0, 1.0, 0.0]);
        assert_eq!(st.rate, 0.5);
        let h = 1.96 * (1.0f64 / 3.0 / 4.0).sqrt();
        assert!((st.ci95[0] - (0.5 - h)).abs() < 1e-12 && (st.ci95[1] - (0.5 + h)).abs() < 1e-12);
    }

    #[test]
    fn table_player_keeps_every_won_and_drawn_value_without_history() {
        let sv = small_solved();
        let (won, drawn) = held_out(&sv, 20, 20, 31);
        let mut table = TablePlayer { sv: &sv };
        let mut anti = AntiOracle { sv: &sv };
        for &i in won.iter().chain(&drawn) {
            let s = build_sample(&sv, i);
            assert_eq!(keep_of(&s, &table.tied(&s.state, &LC1_2)), 1.0);
            let all_keep = s.keeps.iter().all(|&k| k);
            assert_eq!(
                keep_of(&s, &anti.tied(&s.state, &LC1_2)),
                all_keep as u8 as f64
            );
        }
    }
}
