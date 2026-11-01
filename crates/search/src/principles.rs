//! Candidate strategic features of a position and a one-ply heuristic player
//! built on them, for testing "principles" in the arena
//! (`docs/experiments/v2-principles.md`).
//!
//! Every feature is read from one colour's side (`me`), whoever is to move,
//! so the same function describes a position before a move (for the player
//! to move) and after it (for the player who just moved).

use crate::arena::Agent;
use crate::players::top_difference;
use crate::rng::SplitMix64;
use pogofish_engine::{
    apply_move, is_terminal, legal_moves, manhattan_distance, Cell, Color, GameState, Move,
    Outcome, RuleSet, DISTANCES, NUM_CELLS,
};

pub const NUM_FEATURES: usize = 19;

/// Feature names, in the order of [`features`]' output.
pub const FEATURE_NAMES: [&str; NUM_FEATURES] = [
    "top_diff",       // own tops − opponent tops (greedy's evaluation)
    "own_tops",       // stacks with my piece on top
    "prisoners",      // opponent pieces inside stacks I top
    "hostages",       // my pieces inside stacks the opponent tops
    "own_max_height", // tallest stack I top
    "opp_max_height", // tallest stack the opponent tops
    "own_mobility",   // moves I would have if it were my turn
    "opp_mobility",   // moves the opponent would have if it were their turn
    "centre",         // +1 I top the centre, −1 the opponent does, 0 empty
    "corners",        // corners I top − corners the opponent tops
    "own_singletons", // stacks of height 1 I top
    "opp_singletons", // stacks of height 1 the opponent tops
    "own_tall",       // stacks of height ≥ 3 I top
    "own_solid",      // stacks I top whose second piece is also mine
    "own_exposed",    // my tops the opponent can land on in one move
    "opp_exposed",    // opponent tops I can land on in one move
    "my_win_now",     // 1 if I have a move that leaves the opponent no top
    "opp_win_now",    // 1 if the opponent has such a move
    "repetition",     // earlier occurrences of this position (board + player to move)
];

pub fn feature_index(name: &str) -> Option<usize> {
    FEATURE_NAMES.iter().position(|&n| n == name)
}

/// Moves `color` could make on `cells` if it were its turn (same order as
/// `legal_moves`).
pub fn moves_for(cells: &[Cell; NUM_CELLS], color: Color) -> Vec<Move> {
    let mut out = Vec::new();
    for from in 0..NUM_CELLS as u8 {
        let stack = &cells[from as usize];
        if stack.last() != Some(&color) {
            continue;
        }
        for n in 1..=3u8.min(stack.len() as u8) {
            for to in 0..NUM_CELLS as u8 {
                if to != from && DISTANCES[n as usize].contains(&manhattan_distance(from, to)) {
                    out.push(Move {
                        from_cell: from,
                        num_pieces: n,
                        to_cell: to,
                    });
                }
            }
        }
    }
    out
}

fn apply_on_cells(cells: &[Cell; NUM_CELLS], m: Move) -> [Cell; NUM_CELLS] {
    let mut c = cells.clone();
    let from = &mut c[m.from_cell as usize];
    let picked = from.split_off(from.len() - m.num_pieces as usize);
    c[m.to_cell as usize].extend(picked);
    c
}

fn tops_of(cells: &[Cell; NUM_CELLS], color: Color) -> usize {
    cells.iter().filter(|s| s.last() == Some(&color)).count()
}

/// Whether `color` has a move after which the opponent tops no stack (a win
/// by the base rule, which no variant overrides).
pub fn has_winning_move(cells: &[Cell; NUM_CELLS], color: Color) -> bool {
    moves_for(cells, color)
        .into_iter()
        .any(|m| tops_of(&apply_on_cells(cells, m), color.opponent()) == 0)
}

/// The candidate features of `state`, from `me`'s side.
pub fn features(state: &GameState, me: Color) -> [f64; NUM_FEATURES] {
    let cells = state.cells();
    let opp = me.opponent();
    let mut f = [0.0; NUM_FEATURES];
    let my_moves = moves_for(cells, me);
    let opp_moves = moves_for(cells, opp);
    let mut my_reach = [false; NUM_CELLS];
    let mut opp_reach = [false; NUM_CELLS];
    for m in &my_moves {
        my_reach[m.to_cell as usize] = true;
    }
    for m in &opp_moves {
        opp_reach[m.to_cell as usize] = true;
    }
    for (i, stack) in cells.iter().enumerate() {
        let Some(&top) = stack.last() else { continue };
        let h = stack.len() as f64;
        let side = if top == me { 1.0 } else { -1.0 };
        if i == 4 {
            f[8] = side;
        }
        if matches!(i, 0 | 2 | 6 | 8) {
            f[9] += side;
        }
        if top == me {
            f[1] += 1.0;
            f[2] += stack.iter().filter(|&&c| c == opp).count() as f64;
            f[4] = f[4].max(h);
            if stack.len() == 1 {
                f[10] += 1.0;
            }
            if stack.len() >= 3 {
                f[12] += 1.0;
            }
            if stack.len() >= 2 && stack[stack.len() - 2] == me {
                f[13] += 1.0;
            }
            if opp_reach[i] {
                f[14] += 1.0;
            }
        } else {
            f[3] += stack.iter().filter(|&&c| c == me).count() as f64;
            f[5] = f[5].max(h);
            if stack.len() == 1 {
                f[11] += 1.0;
            }
            if my_reach[i] {
                f[15] += 1.0;
            }
        }
    }
    f[0] = top_difference(state, me) as f64;
    f[6] = my_moves.len() as f64;
    f[7] = opp_moves.len() as f64;
    f[16] = has_winning_move(cells, me) as u8 as f64;
    f[17] = has_winning_move(cells, opp) as u8 as f64;
    f[18] = state.occurrences_before() as f64;
    f
}

/// One-ply heuristic: takes a winning move if one exists, avoids a move that
/// loses at once (repetition) when it has a choice, and otherwise maximises
/// `Σ weights[i] · features(next, mover)[i]`. Ties are broken uniformly at
/// random. `weights = [1, 0, …]` is exactly [`crate::players::Scripted::Greedy`].
#[derive(Debug, Clone)]
pub struct Heuristic {
    pub name: String,
    pub weights: [f64; NUM_FEATURES],
}

impl Heuristic {
    /// Greedy's evaluation plus `weight` · feature `index`.
    pub fn greedy_plus(name: impl Into<String>, index: usize, weight: f64) -> Self {
        let mut weights = [0.0; NUM_FEATURES];
        weights[0] = 1.0;
        weights[index] += weight;
        Self {
            name: name.into(),
            weights,
        }
    }

    pub fn evaluate(&self, next: &GameState, mover: Color) -> f64 {
        let f = features(next, mover);
        self.weights.iter().zip(f).map(|(w, x)| w * x).sum()
    }
}

/// Scores within this distance count as tied.
const TIE: f64 = 1e-9;

impl Agent for Heuristic {
    fn name(&self) -> String {
        self.name.clone()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        let moves = legal_moves(state);
        assert!(!moves.is_empty(), "choose() called with no legal move");
        let mover = state.to_move();
        let mut best = f64::NEG_INFINITY;
        let mut tied: Vec<Move> = Vec::new();
        for &m in &moves {
            let next = apply_move(state, m).expect("legal move");
            let score = match is_terminal(&next, rules) {
                Some(Outcome::DrawEarned) => 0.0,
                Some(o) if o.winner() == Some(mover) => f64::INFINITY,
                Some(_) => f64::MIN,
                None => self.evaluate(&next, mover),
            };
            if score > best + TIE {
                best = score;
                tied.clear();
            }
            if (score - best).abs() <= TIE || score == best {
                tied.push(m);
            }
        }
        tied[rng.below(tied.len())]
    }
}

/// Two-ply version of greedy, used as a power control: maximises, over its
/// moves, the minimum over the opponent's replies of the top difference
/// (wins and immediate losses scored as in greedy). Not a principle.
#[derive(Debug, Clone, Default)]
pub struct GreedyTwoPly;

impl Agent for GreedyTwoPly {
    fn name(&self) -> String {
        "greedy-2ply".into()
    }

    fn choose(&mut self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        let moves = legal_moves(state);
        assert!(!moves.is_empty(), "choose() called with no legal move");
        let mover = state.to_move();
        let value = |s: &GameState| -> i32 {
            match is_terminal(s, rules) {
                Some(Outcome::DrawEarned) => 0,
                Some(o) if o.winner() == Some(mover) => 1000,
                Some(_) => -1000,
                None => top_difference(s, mover),
            }
        };
        let mut best = i32::MIN;
        let mut tied = Vec::new();
        for &m in &moves {
            let next = apply_move(state, m).expect("legal move");
            let score = if is_terminal(&next, rules).is_some() {
                value(&next)
            } else {
                legal_moves(&next)
                    .into_iter()
                    .map(|r| value(&apply_move(&next, r).expect("legal reply")))
                    .min()
                    .expect("a non-terminal position has a move")
            };
            if score > best {
                best = score;
                tied.clear();
            }
            if score == best {
                tied.push(m);
            }
        }
        tied[rng.below(tied.len())]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arena::{run_match, ArenaConfig};
    use crate::players::Scripted;
    use pogofish_engine::initial_state;
    use pogofish_engine::testing::position;

    const W: Color = Color::White;
    const R: Color = Color::Red;

    fn empty() -> [Cell; NUM_CELLS] {
        std::array::from_fn(|_| Vec::new())
    }

    fn get(f: &[f64; NUM_FEATURES], name: &str) -> f64 {
        f[feature_index(name).unwrap()]
    }

    #[test]
    fn names_are_unique_and_indexed() {
        for (i, n) in FEATURE_NAMES.iter().enumerate() {
            assert_eq!(feature_index(n), Some(i));
        }
        assert_eq!(feature_index("nope"), None);
    }

    #[test]
    fn initial_position_from_both_sides() {
        let s = initial_state();
        for me in [W, R] {
            let f = features(&s, me);
            assert_eq!(get(&f, "top_diff"), 0.0);
            assert_eq!(get(&f, "own_tops"), 3.0);
            assert_eq!(get(&f, "prisoners"), 0.0);
            assert_eq!(get(&f, "hostages"), 0.0);
            assert_eq!(get(&f, "own_max_height"), 2.0);
            assert_eq!(get(&f, "opp_max_height"), 2.0);
            // rules.md: 16 moves from the start, for either side.
            assert_eq!(get(&f, "own_mobility"), 16.0);
            assert_eq!(get(&f, "opp_mobility"), 16.0);
            assert_eq!(get(&f, "centre"), 0.0);
            assert_eq!(get(&f, "corners"), 0.0);
            assert_eq!(get(&f, "own_singletons"), 0.0);
            assert_eq!(get(&f, "own_tall"), 0.0);
            assert_eq!(get(&f, "own_solid"), 3.0);
            // Two pieces move exactly 2 steps: rows 0 and 2 reach each other
            // only by columns (0→6, 1→7, 2→8), so every top is exposed.
            assert_eq!(get(&f, "own_exposed"), 3.0);
            assert_eq!(get(&f, "opp_exposed"), 3.0);
            assert_eq!(get(&f, "my_win_now"), 0.0);
            assert_eq!(get(&f, "repetition"), 0.0);
        }
    }

    #[test]
    fn moves_for_matches_legal_moves_for_the_side_to_move() {
        let mut rng = SplitMix64::new(5);
        let mut s = initial_state();
        for _ in 0..200 {
            let legal = legal_moves(&s);
            if legal.is_empty() {
                s = initial_state();
                continue;
            }
            assert_eq!(moves_for(s.cells(), s.to_move()), legal);
            s = apply_move(&s, legal[rng.below(legal.len())]).unwrap();
            if pogofish_engine::base_outcome(&s).is_some() {
                s = initial_state();
            }
        }
    }

    /// Cell 4 holds W W W R (bottom to top), cell 0 holds W, cell 8 holds R.
    #[test]
    fn mixed_stacks_count_prisoners_hostages_and_solidity() {
        let mut cells = empty();
        cells[4] = vec![W, W, W, R];
        cells[0] = vec![W];
        cells[8] = vec![R, W, W];
        let s = position(cells, W, 0);
        let f = features(&s, W);
        assert_eq!(get(&f, "top_diff"), 1.0);
        assert_eq!(get(&f, "own_tops"), 2.0);
        assert_eq!(get(&f, "prisoners"), 1.0); // the R under cell 8
        assert_eq!(get(&f, "hostages"), 3.0); // three W under R on cell 4
        assert_eq!(get(&f, "own_max_height"), 3.0);
        assert_eq!(get(&f, "opp_max_height"), 4.0);
        assert_eq!(get(&f, "centre"), -1.0);
        assert_eq!(get(&f, "corners"), 2.0);
        assert_eq!(get(&f, "own_singletons"), 1.0);
        assert_eq!(get(&f, "opp_singletons"), 0.0);
        assert_eq!(get(&f, "own_tall"), 1.0);
        assert_eq!(get(&f, "own_solid"), 1.0); // cell 8: W on W
                                               // Red (cell 4, 4 pieces) reaches distance 1 with 1 or 3 pieces and 2
                                               // with 2 pieces: every cell but 4, so both W tops are exposed.
        assert_eq!(get(&f, "own_exposed"), 2.0);
        // Red's view is the mirror image.
        let g = features(&s, R);
        assert_eq!(get(&g, "top_diff"), -1.0);
        assert_eq!(get(&g, "prisoners"), 3.0);
        assert_eq!(get(&g, "hostages"), 1.0);
        assert_eq!(get(&g, "centre"), 1.0);
        assert_eq!(get(&g, "own_mobility"), get(&f, "opp_mobility"));
    }

    /// A stack topped by W over an R is not solid: moving its top piece
    /// hands it to Red.
    #[test]
    fn solidity_reads_the_second_piece() {
        let mut cells = empty();
        cells[0] = vec![W, R, W];
        cells[2] = vec![R, W, W];
        cells[8] = vec![R];
        let f = features(&position(cells, W, 0), W);
        assert_eq!(get(&f, "own_solid"), 1.0);
        assert_eq!(get(&f, "prisoners"), 2.0);
        assert_eq!(get(&f, "own_tall"), 2.0);
    }

    #[test]
    fn exposure_needs_an_exact_distance() {
        // A lone W at 0 and a lone R at 8: one piece moves 1 step, so
        // neither reaches the other.
        let mut cells = empty();
        cells[0] = vec![W];
        cells[8] = vec![R];
        let f = features(&position(cells, W, 0), W);
        assert_eq!(get(&f, "own_exposed"), 0.0);
        assert_eq!(get(&f, "opp_exposed"), 0.0);
        assert_eq!(get(&f, "own_mobility"), 2.0);
        assert_eq!(get(&f, "my_win_now"), 0.0);
    }

    /// The position of `greedy_takes_a_one_move_win_when_one_exists`.
    #[test]
    fn winning_moves_are_seen_for_either_side() {
        let mut cells = empty();
        cells[0] = vec![W];
        cells[1] = vec![R];
        cells[3] = vec![W, W];
        let s = position(cells, R, 0);
        let f = features(&s, W);
        assert_eq!(get(&f, "my_win_now"), 1.0, "W covers 1 from 0");
        // Red's single piece on 1 can cover 0 but W keeps 3.
        assert_eq!(get(&f, "opp_win_now"), 0.0);
        assert_eq!(get(&features(&s, R), "opp_win_now"), 1.0);
    }

    #[test]
    fn repetition_counts_earlier_occurrences() {
        let s0 = initial_state();
        let go = Move {
            from_cell: 0,
            num_pieces: 1,
            to_cell: 3,
        };
        let back = Move {
            from_cell: 3,
            num_pieces: 1,
            to_cell: 0,
        };
        let r_go = Move {
            from_cell: 6,
            num_pieces: 1,
            to_cell: 7,
        };
        let r_back = Move {
            from_cell: 7,
            num_pieces: 1,
            to_cell: 6,
        };
        let s = [go, r_go, back, r_back]
            .iter()
            .fold(s0, |s, &m| apply_move(&s, m).unwrap());
        assert_eq!(get(&features(&s, W), "repetition"), 1.0);
    }

    /// Weights [1, 0, …] must play exactly like greedy, tie-breaking draws
    /// included: same moves from the same generator state.
    #[test]
    fn greedy_weights_reproduce_greedy() {
        let rules = RuleSet::LC1 { repetitions: 2 };
        let mut h = Heuristic::greedy_plus("g", 0, 0.0);
        let mut s = initial_state();
        let mut walk = SplitMix64::new(3);
        for ply in 0..300 {
            if is_terminal(&s, &rules).is_some() {
                s = initial_state();
            }
            let seed = 1000 + ply;
            let a = Scripted::Greedy.choose(&s, &rules, &mut SplitMix64::new(seed));
            let b = h.choose(&s, &rules, &mut SplitMix64::new(seed));
            assert_eq!(a, b, "ply {ply}");
            let legal = legal_moves(&s);
            s = apply_move(&s, legal[walk.below(legal.len())]).unwrap();
        }
    }

    #[test]
    fn heuristic_takes_a_win_even_with_a_hostile_evaluation() {
        let mut cells = empty();
        cells[0] = vec![W];
        cells[1] = vec![R];
        cells[3] = vec![W, W];
        let s = position(cells, W, 0);
        let mut neg = Heuristic::greedy_plus("neg", 0, -2.0);
        for seed in 0..50 {
            let m = neg.choose(&s, &RuleSet::Uncapped, &mut SplitMix64::new(seed));
            let next = apply_move(&s, m).unwrap();
            assert_eq!(
                pogofish_engine::base_outcome(&next),
                Some(Outcome::WinWhite)
            );
        }
    }

    /// The arena can tell a principle from noise in both directions.
    #[test]
    fn negated_greedy_loses_and_two_ply_greedy_wins() {
        let cfg = ArenaConfig::new(RuleSet::LC1 { repetitions: 2 }, 60, 4, 1000, 1);
        let mut neg = Heuristic::greedy_plus("neg", 0, -2.0);
        let r = run_match(&mut neg, &mut Scripted::Greedy, &cfg).unwrap();
        assert!(r.ci95[1] < 0.5, "{r:?}");
        let r = run_match(&mut GreedyTwoPly, &mut Scripted::Greedy, &cfg).unwrap();
        assert!(r.ci95[0] > 0.5, "{r:?}");
    }
}
