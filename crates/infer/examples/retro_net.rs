//! Round 3: the bundled net's moves against the solved uncapped game
//! (`docs/experiments/v3-solve.md`, answers e and f).
//!
//! Plays net-vs-net games under `lc1-2` (100 simulations, the first 10 plies
//! sampled at temperature 1 from the visit counts, the most-visited move
//! afterwards) and, at every position, asks the table whether the net's
//! most-visited move keeps the position's uncapped value, compared with
//! greedy (expected over its tie-break) and random (expected over all moves)
//! on the same positions.
//!
//! ```text
//! cargo run --release -p pogofish-infer --example retro_net -- models/v3-solve \
//!   --games 400 --seed 1 --out docs/experiments/v3-solve/net.json
//! ```

use pogofish_engine::{
    apply_move, apply_move_under, initial_state, is_terminal, legal_moves, GameState, Outcome,
    RuleSet, StateKey,
};
use pogofish_infer::mcts::{sample, search, visit_distribution, MctsConfig};
use pogofish_infer::mlp::Mlp;
use pogofish_search::players::top_difference;
use pogofish_search::retro::{decode, load_solved, principle_comparison, Board, Game, Value};
use pogofish_search::rng::SplitMix64;
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

const NET: &str = "crates/cli/assets/az-lc1-s1.pfw";
const RULES: RuleSet = RuleSet::LC1 { repetitions: 2 };
const SIMS: u32 = 100;
const SAMPLED_PLIES: u16 = 10;
const MAX_PLIES: u16 = 1000;
const THREADS: usize = 4;
const PHASES: [(u16, u16, &str); 4] = [
    (0, 10, "plies 0-9"),
    (10, 20, "plies 10-19"),
    (20, 30, "plies 20-29"),
    (30, MAX_PLIES, "plies 30+"),
];

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

/// A game's positions and its winner (`None`: unfinished).
type Played = (Vec<Seen>, Option<pogofish_engine::Color>);

/// One position met in a net game.
struct Seen {
    state: GameState,
    ply: u16,
    /// No position of the game so far (this one included) has occurred twice,
    /// so no move can make a third occurrence on any line that follows.
    clean: bool,
    value: Value,
    net_keeps: bool,
    net_move: pogofish_engine::Move,
    greedy_keeps: f64,
    random_keeps: f64,
}

/// Does moving to `child` keep `value` (the mover's uncapped value)? A win is
/// kept by a move to a position the opponent loses; a draw by a move to one
/// the opponent does not win.
fn keeps(value: Value, child: Value) -> bool {
    match value {
        Value::Win(_) => matches!(child, Value::Loss(_)),
        Value::Draw => !matches!(child, Value::Win(_)),
        _ => true,
    }
}

fn greedy_best(s: &GameState) -> Vec<pogofish_engine::Move> {
    let mover = s.to_move();
    let mut best = i32::MIN;
    let mut tied = Vec::new();
    for m in legal_moves(s) {
        let next = apply_move(s, m).expect("legal");
        let score = match is_terminal(&next, &RULES) {
            Some(Outcome::DrawEarned) => 0,
            Some(o) if o.winner() == Some(mover) => i32::MAX,
            Some(_) => i32::MIN + 1,
            None => top_difference(&next, mover),
        };
        if score > best {
            best = score;
            tied.clear();
        }
        if score == best {
            tied.push(m);
        }
    }
    tied
}

fn play(net: &Mlp, g: &Game, t: &[u16], seed: u64) -> Played {
    let cfg = MctsConfig {
        num_simulations: SIMS,
        ..MctsConfig::default()
    };
    let value_of = |s: &GameState| decode(t[g.rank(&Board::from_state(s)) as usize]);
    let mut rng = SplitMix64::new(seed);
    let mut s = initial_state();
    let mut out = Vec::new();
    let mut counts: HashMap<StateKey, u32> = HashMap::new();
    let mut twice = false;
    let winner = loop {
        let c = counts.entry(s.key()).or_default();
        *c += 1;
        twice |= *c >= 2;
        if let Some(o) = is_terminal(&s, &RULES) {
            break o.winner();
        }
        if s.move_count() >= MAX_PLIES {
            break None;
        }
        let r = search(net, &s, &RULES, &cfg, None);
        let best = r.best_move();
        let value = value_of(&s);
        let child_value = |m| {
            let mut c = apply_move(&s, m).expect("legal");
            c.forget_history();
            value_of(&c)
        };
        let moves = legal_moves(&s);
        let share = |ms: &[pogofish_engine::Move]| {
            ms.iter().filter(|&&m| keeps(value, child_value(m))).count() as f64 / ms.len() as f64
        };
        out.push(Seen {
            state: s.clone(),
            ply: s.move_count(),
            clean: !twice,
            value,
            net_keeps: keeps(value, child_value(best)),
            net_move: best,
            greedy_keeps: share(&greedy_best(&s)),
            random_keeps: share(&moves),
        });
        let m = if s.move_count() < SAMPLED_PLIES {
            let counts: Vec<u32> = r.visits.iter().map(|&(_, v)| v).collect();
            r.visits[sample(&visit_distribution(&counts, 1.0), &mut rng)].0
        } else {
            best
        };
        s = apply_move_under(&s, m, &RULES).expect("legal");
    };
    (out, winner)
}

#[derive(Default, Clone, Copy)]
struct Acc {
    n: u64,
    net: f64,
    greedy: f64,
    random: f64,
}

impl Acc {
    fn add(&mut self, x: &Seen) {
        self.n += 1;
        self.net += x.net_keeps as u8 as f64;
        self.greedy += x.greedy_keeps;
        self.random += x.random_keeps;
    }

    fn json(&self) -> serde_json::Value {
        let n = self.n.max(1) as f64;
        json!({"positions": self.n, "net": self.net / n, "greedy": self.greedy / n, "random": self.random / n})
    }
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = std::path::PathBuf::from(args.first().ok_or_else(|| anyhow::anyhow!("table dir"))?);
    let games: usize = arg(&args, "--games").map_or(Ok(400), |s| s.parse())?;
    let seed: u64 = arg(&args, "--seed").map_or(Ok(1), |s| s.parse())?;
    let out_path = arg(&args, "--out");
    let t0 = Instant::now();
    let g = Game::published();
    let t = load_solved(&g, &dir)?;
    let net = Mlp::from_bytes(&std::fs::read(NET)?)?;

    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<(usize, Played)>> =
        Mutex::new(Vec::new());
    std::thread::scope(|sc| {
        for _ in 0..THREADS {
            sc.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= games {
                    break;
                }
                let (seen, w) = play(&net, &g, &t, seed * 1_000_003 + i as u64);
                results.lock().unwrap().push((i, (seen, w)));
            });
        }
    });
    let mut results = results.into_inner().unwrap();
    results.sort_by_key(|r| r.0);

    // Accuracy tables: (value kind, phase, clean filter) → accumulator.
    let mut acc: BTreeMap<(String, String, String), Acc> = BTreeMap::new();
    let mut unfinished = 0;
    let mut white_wins = 0;
    let mut by_value: BTreeMap<String, u64> = BTreeMap::new();
    let mut positions = 0u64;
    let mut clean_positions = 0u64;
    let mut won_for_principles: HashMap<StateKey, GameState> = HashMap::new();
    // Clean positions already counted: the net's choice there depends on the
    // board only (its repetition input is 0), so repeats across games add no
    // information.
    let mut distinct: std::collections::HashSet<StateKey> = std::collections::HashSet::new();
    for (_, (seen, w)) in &results {
        match w {
            None => unfinished += 1,
            Some(pogofish_engine::Color::White) => white_wins += 1,
            _ => {}
        }
        for x in seen {
            positions += 1;
            clean_positions += x.clean as u64;
            let kind = match x.value {
                Value::Win(_) => "win",
                Value::Draw => "draw",
                Value::Loss(_) => "loss",
                _ => "other",
            };
            *by_value.entry(kind.into()).or_default() += 1;
            if kind == "loss" || kind == "other" {
                continue;
            }
            if matches!(x.value, Value::Win(d) if d >= 3) {
                let mut s = x.state.clone();
                s.forget_history();
                won_for_principles.entry(s.key()).or_insert(s);
            }
            let phase = PHASES
                .iter()
                .find(|p| x.ply >= p.0 && x.ply < p.1)
                .map_or("?", |p| p.2);
            let first_time = x.clean && distinct.insert(x.state.key());
            for filter in ["all", "clean", "clean, distinct"] {
                if (filter == "clean" && !x.clean) || (filter == "clean, distinct" && !first_time) {
                    continue;
                }
                for k in [kind, "win or draw"] {
                    for ph in [phase, "all plies"] {
                        acc.entry((k.into(), ph.into(), filter.into()))
                            .or_default()
                            .add(x);
                    }
                }
            }
        }
    }
    let table: Vec<serde_json::Value> = acc
        .iter()
        .map(|((k, ph, f), a)| json!({"value": k, "phase": ph, "positions_filter": f, "keeps_value": a.json()}))
        .collect();

    // Start-of-game check: how often the first position after the sampled
    // opening is decided, and for whom the table says it is.
    let mut after_opening: BTreeMap<String, u64> = BTreeMap::new();
    for (_, (seen, _)) in &results {
        if let Some(x) = seen.iter().find(|x| x.ply == SAMPLED_PLIES) {
            let k = match x.value {
                Value::Win(_) => "mover wins",
                Value::Loss(_) => "mover loses",
                Value::Draw => "draw",
                _ => "other",
            };
            *after_opening.entry(k.into()).or_default() += 1;
        }
    }

    let mut won: Vec<GameState> = won_for_principles.into_values().collect();
    won.sort_by(|a, b| a.key().0.cmp(&b.key().0));
    let value = |s: &GameState| decode(t[g.rank(&Board::from_state(s)) as usize]);
    let principles = json!({
        "all_moves": principle_comparison(&won, value, false),
        "greedy_ties_only": principle_comparison(&won, value, true),
    });

    let out = json!({
        "net": NET, "rules": RULES.to_string(), "simulations": SIMS,
        "sampled_plies_at_temperature_1": SAMPLED_PLIES, "games": games, "seed": seed,
        "net_move_evaluated": "most-visited move (played from ply 10 on; the first 10 plies play a sample)",
        "greedy": "share of greedy's tied best moves (lc1-2 greedy: immediate win first, avoids an immediate loss) that keep the value",
        "random": "share of all legal moves that keep the value",
        "clean": "no position of the game so far, the current one included, has occurred twice",
        "clean_distinct": "clean positions counted once each (first encounter's ply sets the phase)",
        "net_move_at_start": results.first().and_then(|r| r.1.0.first()).map(|x| json!({"move": pogofish_engine::notation::move_to_notation(x.net_move), "keeps_the_draw": x.net_keeps})),
        "distinct_clean_positions": distinct.len(),
        "unfinished_games": unfinished, "white_wins": white_wins,
        "positions": positions, "clean_positions": clean_positions,
        "positions_by_uncapped_value": by_value,
        "value_at_ply_10": after_opening,
        "keeps_value": table,
        "principles_on_net_game_positions": principles,
        "seconds": t0.elapsed().as_secs_f64(),
    });
    let text = serde_json::to_string_pretty(&out)? + "\n";
    match out_path {
        Some(p) => std::fs::write(&p, text)?,
        None => print!("{text}"),
    }
    Ok(())
}
