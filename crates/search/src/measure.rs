//! Measure the game with scripted players (plan task 1.2): how often games
//! end, how long they last, how wide the tree is, and how often positions
//! repeat. No learning is involved.

use crate::players::Scripted;
use crate::rng::SplitMix64;
use pogofish_engine::{
    apply_move, base_outcome, is_terminal, legal_moves, Color, GameState, Outcome, RuleSet,
    StateKey,
};
use serde::Serialize;
use std::collections::HashMap;

/// Repetition counts tracked per game: index `k - 1` holds the ply at which
/// some position first occurred for the `k + 1`-th time (k = 1, 2, 3).
pub const REPEAT_LEVELS: usize = 3;

/// One game, as the harness saw it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameRecord {
    /// Moves played.
    pub plies: u32,
    /// `None` when the safety limit stopped the game (unfinished, not a draw).
    pub outcome: Option<Outcome>,
    /// Number of legal moves at each ply, before the move was played.
    pub branching: Vec<u16>,
    /// Plies whose resulting position (board + player to move) had already
    /// occurred in this game, counting the start position.
    pub repeated_plies: u32,
    /// See [`REPEAT_LEVELS`].
    pub first_repeat_at: [Option<u32>; REPEAT_LEVELS],
}

/// Counts how often each position (board + player to move) has occurred in
/// one game, starting with the start position.
#[derive(Debug, Clone, Default)]
pub struct RepetitionTracker {
    seen: HashMap<StateKey, u32>,
    pub repeated_plies: u32,
    pub first_repeat_at: [Option<u32>; REPEAT_LEVELS],
}

impl RepetitionTracker {
    pub fn new(start: &GameState) -> Self {
        let mut t = Self::default();
        t.seen.insert(start.key(), 1);
        t
    }

    /// Record the position reached after move number `ply` (1-based).
    pub fn record(&mut self, state: &GameState, ply: u32) {
        let count = self.seen.entry(state.key()).or_insert(0);
        *count += 1;
        if *count > 1 {
            self.repeated_plies += 1;
            let level = (*count - 1) as usize;
            if level <= REPEAT_LEVELS && self.first_repeat_at[level - 1].is_none() {
                self.first_repeat_at[level - 1] = Some(ply);
            }
        }
    }
}

/// Play one game from `start`. `rules = None` plays the uncapped game (base
/// rule only) and drops the engine's history after each move, since nothing
/// reads it; repetitions are tracked here instead.
pub fn play_game(
    start: &GameState,
    rules: Option<&RuleSet>,
    white: Scripted,
    red: Scripted,
    max_plies: u32,
    rng: &mut SplitMix64,
) -> GameRecord {
    let terminal = |s: &GameState| match rules {
        Some(r) => is_terminal(s, r),
        None => base_outcome(s),
    };
    let mut state = start.clone();
    let mut reps = RepetitionTracker::new(start);
    let mut record = GameRecord {
        plies: 0,
        outcome: None,
        branching: Vec::new(),
        repeated_plies: 0,
        first_repeat_at: [None; REPEAT_LEVELS],
    };

    loop {
        let outcome = terminal(&state);
        if outcome.is_some() || record.plies >= max_plies {
            record.outcome = outcome;
            record.repeated_plies = reps.repeated_plies;
            record.first_repeat_at = reps.first_repeat_at;
            return record;
        }
        let player = match state.to_move() {
            Color::White => white,
            Color::Red => red,
        };
        record.branching.push(legal_moves(&state).len() as u16);
        let m = player.choose(&state, rules, rng);
        state = apply_move(&state, m).expect("scripted players only play legal moves");
        if rules.is_none() {
            state.forget_history();
        }
        record.plies += 1;
        reps.record(&state, record.plies);
    }
}

/// Seed for game `index` of a pairing, so that results do not depend on how
/// games are split across threads.
pub fn game_seed(base: u64, pairing: u64, index: u64) -> u64 {
    let mut r = SplitMix64::new(base ^ pairing.wrapping_mul(0xA24B_AED4_963E_E407));
    for _ in 0..(index % 7) {
        r.next_u64();
    }
    r.next_u64() ^ index.wrapping_mul(0x9FB2_1C65_1E98_DF25)
}

/// Play `games` uncapped games from the initial position, spread over
/// `threads` threads. The result is ordered by game index and does not
/// depend on `threads`.
pub fn play_many(
    white: Scripted,
    red: Scripted,
    games: u32,
    max_plies: u32,
    base_seed: u64,
    pairing: u64,
    threads: usize,
) -> Vec<GameRecord> {
    let start = pogofish_engine::initial_state();
    let threads = threads.max(1);
    let mut out: Vec<Option<GameRecord>> = vec![None; games as usize];
    std::thread::scope(|scope| {
        let chunks: Vec<_> = out
            .chunks_mut(games.div_ceil(threads as u32).max(1) as usize)
            .collect();
        let mut first = 0u64;
        for chunk in chunks {
            let start = &start;
            let offset = first;
            first += chunk.len() as u64;
            scope.spawn(move || {
                for (i, slot) in chunk.iter_mut().enumerate() {
                    let mut rng = SplitMix64::new(game_seed(base_seed, pairing, offset + i as u64));
                    *slot = Some(play_game(start, None, white, red, max_plies, &mut rng));
                }
            });
        }
    });
    out.into_iter()
        .map(|r| r.expect("every game played"))
        .collect()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Distribution {
    pub n: usize,
    pub mean: f64,
    pub min: u32,
    pub p10: u32,
    pub median: u32,
    pub p90: u32,
    pub max: u32,
}

impl Distribution {
    /// Nearest-rank percentiles. `None` for an empty sample.
    pub fn of(values: &[u32]) -> Option<Self> {
        if values.is_empty() {
            return None;
        }
        let mut v = values.to_vec();
        v.sort_unstable();
        let rank = |p: f64| v[(((p * v.len() as f64).ceil() as usize).max(1) - 1).min(v.len() - 1)];
        Some(Self {
            n: v.len(),
            mean: v.iter().map(|&x| x as f64).sum::<f64>() / v.len() as f64,
            min: v[0],
            p10: rank(0.10),
            median: rank(0.50),
            p90: rank(0.90),
            max: v[v.len() - 1],
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchingAtPly {
    pub ply: u32,
    /// Games still running at this ply.
    pub games: usize,
    pub mean_legal_moves: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepeatLevel {
    /// A position occurs this many times (2 = first repetition).
    pub occurrences: u32,
    /// Fraction of all games in which that happened before the game ended.
    pub fraction_of_games: f64,
    /// Ply at which it first happened, over the games where it did.
    pub ply: Option<Distribution>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PairingReport {
    pub white: String,
    pub red: String,
    pub games: usize,
    pub decisive: usize,
    pub unfinished: usize,
    pub decisive_rate: f64,
    pub white_wins: usize,
    pub red_wins: usize,
    /// Plies of the games that ended (unfinished games excluded).
    pub decisive_length: Option<Distribution>,
    /// Fraction of all games that had ended by ply N, for N in `LENGTH_MARKS`.
    pub ended_by_ply: Vec<(u32, f64)>,
    pub mean_branching: f64,
    /// Mean legal moves per ply index, for plies where at least
    /// `MIN_GAMES_FOR_PLY` games were still running.
    pub branching_by_ply: Vec<BranchingAtPly>,
    pub games_with_a_repeat: f64,
    pub mean_repeated_plies_per_game: f64,
    pub repeats: Vec<RepeatLevel>,
}

pub const LENGTH_MARKS: [u32; 8] = [10, 20, 30, 50, 100, 200, 500, 1000];
pub const MIN_GAMES_FOR_PLY: usize = 30;

pub fn summarise(white: Scripted, red: Scripted, records: &[GameRecord]) -> PairingReport {
    let n = records.len();
    let frac = |k: usize| if n == 0 { 0.0 } else { k as f64 / n as f64 };
    let decisive: Vec<&GameRecord> = records.iter().filter(|r| r.outcome.is_some()).collect();
    let wins = |c: Color| {
        records
            .iter()
            .filter(|r| r.outcome.and_then(|o| o.winner()) == Some(c))
            .count()
    };

    let lengths: Vec<u32> = decisive.iter().map(|r| r.plies).collect();
    let ended_by_ply = LENGTH_MARKS
        .iter()
        .map(|&mark| (mark, frac(lengths.iter().filter(|&&l| l <= mark).count())))
        .collect();

    let total_plies: usize = records.iter().map(|r| r.branching.len()).sum();
    let total_moves: u64 = records
        .iter()
        .flat_map(|r| &r.branching)
        .map(|&b| b as u64)
        .sum();
    let longest = records.iter().map(|r| r.branching.len()).max().unwrap_or(0);
    let mut branching_by_ply = Vec::new();
    for ply in 0..longest {
        let at: Vec<u16> = records
            .iter()
            .filter_map(|r| r.branching.get(ply).copied())
            .collect();
        if at.len() < MIN_GAMES_FOR_PLY {
            break;
        }
        branching_by_ply.push(BranchingAtPly {
            ply: ply as u32,
            games: at.len(),
            mean_legal_moves: at.iter().map(|&b| b as f64).sum::<f64>() / at.len() as f64,
        });
    }

    let repeats = (0..REPEAT_LEVELS)
        .map(|level| {
            let plies: Vec<u32> = records
                .iter()
                .filter_map(|r| r.first_repeat_at[level])
                .collect();
            RepeatLevel {
                occurrences: level as u32 + 2,
                fraction_of_games: frac(plies.len()),
                ply: Distribution::of(&plies),
            }
        })
        .collect();

    PairingReport {
        white: white.name().to_string(),
        red: red.name().to_string(),
        games: n,
        decisive: decisive.len(),
        unfinished: n - decisive.len(),
        decisive_rate: frac(decisive.len()),
        white_wins: wins(Color::White),
        red_wins: wins(Color::Red),
        decisive_length: Distribution::of(&lengths),
        ended_by_ply,
        mean_branching: if total_plies == 0 {
            0.0
        } else {
            total_moves as f64 / total_plies as f64
        },
        branching_by_ply,
        games_with_a_repeat: frac(records.iter().filter(|r| r.repeated_plies > 0).count()),
        mean_repeated_plies_per_game: if n == 0 {
            0.0
        } else {
            records.iter().map(|r| r.repeated_plies as f64).sum::<f64>() / n as f64
        },
        repeats,
    }
}

/// The harness's own falsification check: from a position where every legal
/// move ends the game, every game must end decisively in exactly one ply.
///
/// Under the base rule no such position exists (a player who owns a stack
/// can always move to an empty or friendly cell without winning), so the
/// check uses LC2 one move before its cap: whatever White plays, Red is then
/// to move at the cap and loses (or White has already won outright).
#[derive(Debug, Clone, Serialize)]
pub struct FalsificationCheck {
    pub description: String,
    pub games: usize,
    pub ended_in_one_ply_with_white_win: usize,
    pub passed: bool,
}

pub fn falsification_position() -> (GameState, RuleSet) {
    let cap = 10;
    let mut s = pogofish_engine::testing::position(
        pogofish_engine::initial_state().cells().clone(),
        Color::White,
        cap - 1,
    );
    s.forget_history();
    (s, RuleSet::LC2 { cap })
}

pub fn falsification_check(games_per_pairing: u32, seed: u64) -> FalsificationCheck {
    let (start, rules) = falsification_position();
    let players = [Scripted::Random, Scripted::Greedy];
    let mut games = 0;
    let mut good = 0;
    for (p, (&white, &red)) in players
        .iter()
        .flat_map(|w| players.iter().map(move |r| (w, r)))
        .enumerate()
    {
        for i in 0..games_per_pairing {
            let mut rng = SplitMix64::new(game_seed(seed, 100 + p as u64, i as u64));
            let r = play_game(&start, Some(&rules), white, red, 1000, &mut rng);
            games += 1;
            if r.plies == 1 && r.outcome == Some(Outcome::WinWhite) {
                good += 1;
            }
        }
    }
    FalsificationCheck {
        description: "LC2 cap 10, initial board at move 9, White to move: every legal move \
                      ends the game with a White win; each game must last exactly 1 ply"
            .to_string(),
        games,
        ended_in_one_ply_with_white_win: good,
        passed: games > 0 && good == games,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falsification_position_really_ends_on_every_move() {
        let (s, rules) = falsification_position();
        assert_eq!(is_terminal(&s, &rules), None);
        let moves = legal_moves(&s);
        assert!(moves.len() > 1);
        for m in moves {
            let next = apply_move(&s, m).unwrap();
            assert_eq!(is_terminal(&next, &rules), Some(Outcome::WinWhite), "{m:?}");
        }
    }

    #[test]
    fn falsification_check_passes() {
        let c = falsification_check(25, 1);
        assert_eq!(c.games, 100);
        assert!(c.passed, "{c:?}");
    }

    #[test]
    fn a_game_that_hits_the_limit_is_unfinished_not_a_draw() {
        let s = pogofish_engine::initial_state();
        let mut rng = SplitMix64::new(0);
        let r = play_game(&s, None, Scripted::Random, Scripted::Random, 0, &mut rng);
        assert_eq!((r.plies, r.outcome), (0, None));
        let r = play_game(&s, None, Scripted::Random, Scripted::Random, 3, &mut rng);
        assert_eq!(r.plies, 3);
        assert_eq!(r.outcome, None);
        assert_eq!(r.branching.len(), 3);
        assert_eq!(r.branching[0], 16);
    }

    #[test]
    fn repetitions_are_counted_from_the_start_position() {
        // White 0→3, Red 6→7, White 3→0, Red 7→6 returns to the start at
        // ply 4 (second occurrence); playing it twice more reaches the third
        // and fourth occurrences at plies 8 and 12.
        use pogofish_engine::Move;
        let start = pogofish_engine::initial_state();
        let cycle = [
            Move {
                from_cell: 0,
                num_pieces: 1,
                to_cell: 3,
            },
            Move {
                from_cell: 6,
                num_pieces: 1,
                to_cell: 7,
            },
            Move {
                from_cell: 3,
                num_pieces: 1,
                to_cell: 0,
            },
            Move {
                from_cell: 7,
                num_pieces: 1,
                to_cell: 6,
            },
        ];
        let mut reps = RepetitionTracker::new(&start);
        let mut s = start.clone();
        for (i, &m) in cycle.iter().cycle().take(12).enumerate() {
            s = apply_move(&s, m).unwrap();
            reps.record(&s, i as u32 + 1);
        }
        assert_eq!(reps.first_repeat_at, [Some(4), Some(8), Some(12)]);
        // Plies 4..=12 all land on positions seen before.
        assert_eq!(reps.repeated_plies, 9);
    }

    #[test]
    fn play_many_does_not_depend_on_thread_count() {
        let a = play_many(Scripted::Greedy, Scripted::Random, 12, 200, 5, 1, 1);
        let b = play_many(Scripted::Greedy, Scripted::Random, 12, 200, 5, 1, 4);
        assert_eq!(a, b);
    }

    #[test]
    fn distribution_uses_nearest_rank() {
        let d = Distribution::of(&[5, 1, 3, 2, 4, 6, 7, 8, 9, 10]).unwrap();
        assert_eq!((d.min, d.p10, d.median, d.p90, d.max), (1, 1, 5, 9, 10));
        assert!((d.mean - 5.5).abs() < 1e-12);
        assert!(Distribution::of(&[]).is_none());
    }

    #[test]
    fn summary_counts_add_up() {
        let recs = play_many(Scripted::Random, Scripted::Random, 40, 1000, 3, 2, 2);
        let rep = summarise(Scripted::Random, Scripted::Random, &recs);
        assert_eq!(rep.games, 40);
        assert_eq!(rep.decisive + rep.unfinished, 40);
        assert_eq!(
            rep.white_wins + rep.red_wins,
            rep.decisive,
            "no draws in the uncapped game"
        );
        let last = rep.ended_by_ply.last().unwrap();
        assert_eq!(last.0, 1000);
        assert!((last.1 - rep.decisive_rate).abs() < 1e-12);
    }
}
