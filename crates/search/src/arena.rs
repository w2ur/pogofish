//! Evaluation harness (plan task 3.1): two players, colours swapped over
//! randomised openings, with a confidence interval and a collapse detector.
//!
//! Games come in pairs. Each pair draws a random opening of `opening_plies`
//! moves from the initial position, then plays it twice with colours
//! swapped. Scoring is per pair (the mean of player A's two results), so the
//! confidence interval accounts for the two games of a pair sharing an
//! opening. A pair with an unfinished game (safety limit reached) is left out
//! of the score and counted separately: a truncation is not a result.

use crate::mcts::{Mcts, MctsConfig};
use crate::players::Scripted;
use crate::rng::SplitMix64;
use pogofish_engine::{
    apply_move, apply_move_under, initial_state, is_terminal, legal_moves, Color, GameState, Move,
    Outcome, RuleSet, StateKey,
};
use serde::Serialize;
use std::collections::HashSet;

/// Anything that can pick a move.
pub trait Agent {
    fn name(&self) -> String;
    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move;
}

impl Agent for Scripted {
    fn name(&self) -> String {
        Scripted::name(*self).to_string()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        Scripted::choose(*self, state, rules, rng)
    }
}

/// Uniform-prior MCTS from `pogofish-search`, with `simulations` per move.
pub struct UniformMcts {
    pub simulations: u32,
}

impl Agent for UniformMcts {
    fn name(&self) -> String {
        format!("mcts-uniform:{}", self.simulations)
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, _rng: &mut SplitMix64) -> Move {
        Mcts::new(MctsConfig {
            simulations: self.simulations,
            c_puct: 1.5,
        })
        .search(state, rules)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ArenaConfig {
    pub rules: RuleSet,
    /// Number of openings; each is played twice (colours swapped).
    pub pairs: u32,
    /// Random plies before the players take over.
    pub opening_plies: u32,
    /// Safety limit on the whole game, opening included.
    pub max_plies: u32,
    pub seed: u64,
    /// Always true in real use. False plays both games of a pair with A as
    /// White; it exists so tests can show the harness catching a colour bias.
    #[serde(skip)]
    pub swap_colours: bool,
}

impl ArenaConfig {
    pub fn new(rules: RuleSet, pairs: u32, opening_plies: u32, max_plies: u32, seed: u64) -> Self {
        Self {
            rules,
            pairs,
            opening_plies,
            max_plies,
            seed,
            swap_colours: true,
        }
    }
}

/// Wins, draws, losses and unfinished games, from one player's side.
#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
pub struct Record {
    pub wins: u32,
    pub draws: u32,
    pub losses: u32,
    pub unfinished: u32,
}

impl Record {
    fn add(&mut self, result: Option<f64>) {
        match result {
            None => self.unfinished += 1,
            Some(x) if x > 0.5 => self.wins += 1,
            Some(x) if x < 0.5 => self.losses += 1,
            Some(_) => self.draws += 1,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ArenaReport {
    pub player_a: String,
    pub player_b: String,
    pub config: ArenaConfig,
    pub games: u32,
    /// A's results over all games.
    pub a: Record,
    pub a_as_white: Record,
    pub a_as_red: Record,
    /// Pairs whose two games both finished; the score uses only these.
    pub scored_pairs: u32,
    /// A's mean score per scored pair (win 1, draw ½, loss 0).
    pub score: f64,
    /// 95 % interval on `score`: mean ± 1.96 · (sample sd of pair scores) / √n,
    /// clipped to [0, 1].
    pub ci95: [f64; 2],
    /// True when the interval excludes 0.5.
    pub significant: bool,
    /// Share of finished games won by White, whoever played it.
    pub white_score: f64,
    pub distinct_openings: usize,
    /// Distinct full move sequences, opening included.
    pub distinct_games: usize,
    /// Distinct positions reached after the opening, over all games. Close to
    /// the number of openings times a handful means the players collapsed
    /// onto one line from each opening.
    pub distinct_positions_after_opening: usize,
}

struct GameLog {
    moves: Vec<Move>,
    /// White's result: 1, ½ or 0; `None` if unfinished.
    white_result: Option<f64>,
}

/// Give up drawing an opening after this many tries (each try ended the game).
pub const MAX_OPENING_TRIES: u32 = 10_000;

/// Draw an opening: `plies` uniformly random moves that do not end the game.
/// Retries with the next draw from `rng` if one does, and errors after
/// [`MAX_OPENING_TRIES`] (for example LC2 with a cap no longer than the
/// opening, where every opening ends the game).
pub fn random_opening(
    rules: &RuleSet,
    plies: u32,
    rng: &mut SplitMix64,
) -> Result<(GameState, Vec<Move>), String> {
    'draw: for _ in 0..MAX_OPENING_TRIES {
        let mut s = initial_state();
        let mut moves = Vec::new();
        for _ in 0..plies {
            let legal = legal_moves(&s);
            let m = legal[rng.below(legal.len())];
            s = apply_move(&s, m).expect("legal");
            moves.push(m);
            if is_terminal(&s, rules).is_some() {
                continue 'draw;
            }
        }
        return Ok((s, moves));
    }
    Err(format!(
        "no {plies}-ply opening that leaves the game running under {rules} in {MAX_OPENING_TRIES} tries"
    ))
}

fn play(
    start: &GameState,
    white: &mut dyn Agent,
    red: &mut dyn Agent,
    cfg: &ArenaConfig,
    already_played: u32,
    rng: &mut SplitMix64,
    seen_after_opening: &mut HashSet<StateKey>,
) -> GameLog {
    let mut s = start.clone();
    let mut moves = Vec::new();
    loop {
        if let Some(o) = is_terminal(&s, &cfg.rules) {
            let white_result = match o {
                Outcome::WinWhite => 1.0,
                Outcome::WinRed => 0.0,
                Outcome::DrawEarned => 0.5,
            };
            return GameLog {
                moves,
                white_result: Some(white_result),
            };
        }
        if already_played + moves.len() as u32 >= cfg.max_plies {
            return GameLog {
                moves,
                white_result: None,
            };
        }
        let agent: &mut dyn Agent = match s.to_move() {
            Color::White => &mut *white,
            Color::Red => &mut *red,
        };
        let m = agent.choose(&s, &cfg.rules, rng);
        s = apply_move_under(&s, m, &cfg.rules).expect("agents must play legal moves");
        moves.push(m);
        seen_after_opening.insert(s.key());
    }
}

/// Play the match. `a` and `b` must be distinct objects; to play a player
/// against itself, build it twice. Errors if no opening can be drawn.
pub fn run_match(
    a: &mut dyn Agent,
    b: &mut dyn Agent,
    cfg: &ArenaConfig,
) -> Result<ArenaReport, String> {
    let mut rec = Record::default();
    let mut as_white = Record::default();
    let mut as_red = Record::default();
    let mut pair_scores = Vec::new();
    let mut white_points = 0.0;
    let mut finished = 0u32;
    let mut openings = HashSet::new();
    let mut sequences = HashSet::new();
    let mut positions = HashSet::new();

    for pair in 0..cfg.pairs {
        let mut rng = SplitMix64::new(crate::measure::game_seed(cfg.seed, 7, pair as u64));
        let (start, opening) = random_opening(&cfg.rules, cfg.opening_plies, &mut rng)?;
        openings.insert(opening.clone());
        let mut a_results = [None; 2];
        for (game, slot) in a_results.iter_mut().enumerate() {
            let a_white = game == 0 || !cfg.swap_colours;
            let log = if a_white {
                play(
                    &start,
                    a,
                    b,
                    cfg,
                    opening.len() as u32,
                    &mut rng,
                    &mut positions,
                )
            } else {
                play(
                    &start,
                    b,
                    a,
                    cfg,
                    opening.len() as u32,
                    &mut rng,
                    &mut positions,
                )
            };
            let a_result = log.white_result.map(|w| if a_white { w } else { 1.0 - w });
            rec.add(a_result);
            if a_white {
                as_white.add(a_result)
            } else {
                as_red.add(a_result)
            }
            if let Some(w) = log.white_result {
                white_points += w;
                finished += 1;
            }
            let mut seq = opening.clone();
            seq.extend(log.moves);
            sequences.insert(seq);
            *slot = a_result;
        }
        if let [Some(x), Some(y)] = a_results {
            pair_scores.push((x + y) / 2.0);
        }
    }

    let n = pair_scores.len();
    let score = if n == 0 {
        f64::NAN
    } else {
        pair_scores.iter().sum::<f64>() / n as f64
    };
    let ci95 = if n < 2 {
        [f64::NAN, f64::NAN]
    } else {
        let var = pair_scores.iter().map(|x| (x - score).powi(2)).sum::<f64>() / (n - 1) as f64;
        let half = 1.96 * (var / n as f64).sqrt();
        [(score - half).max(0.0), (score + half).min(1.0)]
    };
    Ok(ArenaReport {
        player_a: a.name(),
        player_b: b.name(),
        config: cfg.clone(),
        games: cfg.pairs * 2,
        a: rec,
        a_as_white: as_white,
        a_as_red: as_red,
        scored_pairs: n as u32,
        score,
        ci95,
        significant: ci95[0] > 0.5 || ci95[1] < 0.5,
        white_score: if finished == 0 {
            f64::NAN
        } else {
            white_points / finished as f64
        },
        distinct_openings: openings.len(),
        distinct_games: sequences.len(),
        distinct_positions_after_opening: positions.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(pairs: u32) -> ArenaConfig {
        ArenaConfig::new(RuleSet::Uncapped, pairs, 4, 1000, 1)
    }

    #[test]
    fn openings_are_legal_non_terminal_and_reproducible() {
        for seed in 0..50 {
            let (s, moves) =
                random_opening(&RuleSet::Uncapped, 6, &mut SplitMix64::new(seed)).unwrap();
            let (s2, moves2) =
                random_opening(&RuleSet::Uncapped, 6, &mut SplitMix64::new(seed)).unwrap();
            assert_eq!(moves, moves2);
            assert_eq!(s.key(), s2.key());
            assert_eq!(moves.len(), 6);
            assert_eq!(is_terminal(&s, &RuleSet::Uncapped), None);
        }
    }

    #[test]
    fn counts_add_up_and_colours_alternate() {
        let r = run_match(&mut Scripted::Greedy, &mut Scripted::Random, &cfg(50)).unwrap();
        assert_eq!(r.games, 100);
        let total = |x: Record| x.wins + x.draws + x.losses + x.unfinished;
        assert_eq!(total(r.a), 100);
        assert_eq!(total(r.a_as_white), 50);
        assert_eq!(total(r.a_as_red), 50);
        assert!(r.distinct_openings <= 50 && r.distinct_openings > 40);
        assert!(r.distinct_games <= 100);
    }

    #[test]
    fn a_match_is_reproducible_from_its_seed() {
        let x = run_match(&mut Scripted::Random, &mut Scripted::Random, &cfg(30)).unwrap();
        let y = run_match(&mut Scripted::Random, &mut Scripted::Random, &cfg(30)).unwrap();
        assert_eq!((x.a, x.distinct_games), (y.a, y.distinct_games));
    }

    /// Plan task 3.2, check 1: a real gap is detected.
    #[test]
    fn greedy_beats_random_significantly() {
        let r = run_match(&mut Scripted::Greedy, &mut Scripted::Random, &cfg(100)).unwrap();
        assert!(r.significant && r.ci95[0] > 0.5, "{r:?}");
    }

    /// Plan task 3.2, check 2: a player against itself lands within its CI
    /// of 50 %.
    #[test]
    fn self_matches_are_not_significant() {
        for p in [Scripted::Random, Scripted::Greedy, Scripted::FirstLegal] {
            let (mut a, mut b) = (p, p);
            let r = run_match(&mut a, &mut b, &cfg(200)).unwrap();
            assert!(r.ci95[0] <= 0.5 && 0.5 <= r.ci95[1], "{}: {r:?}", p.name());
        }
    }

    /// The self-match check can fail: greedy against itself with fixed
    /// colours measures a colour bias, not skill, and the interval excludes
    /// 50 %. (Its direction depends on the openings: from the initial
    /// position Red wins 72 % of greedy games, see v2-measure; after 4 random
    /// plies White scores about 56 % here.)
    #[test]
    fn a_colour_bias_is_caught_when_colours_are_not_swapped() {
        let mut c = cfg(500);
        c.swap_colours = false;
        let (mut a, mut b) = (Scripted::Greedy, Scripted::Greedy);
        let r = run_match(&mut a, &mut b, &c).unwrap();
        assert!(r.significant, "{r:?}");
    }

    /// Plan task 3.2, check 3: a broken player loses to random, or the
    /// report flags it.
    #[test]
    fn first_legal_loses_to_random() {
        let r = run_match(&mut Scripted::FirstLegal, &mut Scripted::Random, &cfg(200)).unwrap();
        assert!(r.significant && r.ci95[1] < 0.5, "{r:?}");
    }

    #[test]
    fn the_collapse_detector_sees_deterministic_players() {
        // First-legal against itself from 20 openings replays one line per
        // opening and colour assignment: at most 20 distinct games.
        let (mut a, mut b) = (Scripted::FirstLegal, Scripted::FirstLegal);
        let det = run_match(&mut a, &mut b, &cfg(20)).unwrap();
        assert!(det.distinct_games <= det.distinct_openings, "{det:?}");
        let (mut a, mut b) = (Scripted::Random, Scripted::Random);
        let rnd = run_match(&mut a, &mut b, &cfg(20)).unwrap();
        assert_eq!(rnd.distinct_games, 40);
        assert!(rnd.distinct_positions_after_opening > 3 * det.distinct_positions_after_opening);
    }

    #[test]
    fn unfinished_pairs_are_not_scored() {
        let mut c = cfg(10);
        c.max_plies = 5; // opening is 4 plies; no game can end within 5
        let r = run_match(&mut Scripted::Random, &mut Scripted::Random, &c).unwrap();
        assert_eq!(r.a.unfinished, 20);
        assert_eq!(r.scored_pairs, 0);
        assert!(r.score.is_nan());
    }

    /// Review finding: an impossible opening used to hang the arena forever.
    #[test]
    fn an_impossible_opening_is_an_error_not_a_hang() {
        let c = ArenaConfig::new(RuleSet::LC2 { cap: 4 }, 2, 4, 1000, 1);
        let err = run_match(&mut Scripted::Random, &mut Scripted::Greedy, &c).unwrap_err();
        assert!(err.contains("no 4-ply opening"), "{err}");
    }
}
