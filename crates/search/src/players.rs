//! Scripted players: baselines that need no training.

use crate::rng::SplitMix64;
use pogofish_engine::{
    apply_move, is_terminal, legal_moves, Color, GameState, Move, Outcome, RuleSet,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scripted {
    /// Uniform over legal moves.
    Random,
    /// Takes a winning move if one exists, never a losing one if it has a
    /// choice, and otherwise maximises (own stacks on top − opponent's)
    /// after the move. Ties are broken uniformly at random.
    Greedy,
    /// Deliberately weak: always plays the first legal move in engine
    /// order. A control for the evaluation harness, not a baseline.
    FirstLegal,
}

impl Scripted {
    pub fn name(self) -> &'static str {
        match self {
            Scripted::Random => "random",
            Scripted::Greedy => "greedy",
            Scripted::FirstLegal => "first-legal",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "random" => Some(Scripted::Random),
            "greedy" => Some(Scripted::Greedy),
            "first-legal" => Some(Scripted::FirstLegal),
            _ => None,
        }
    }

    /// Choose a move under `rules`. Panics if `state` has no legal move, which only happens in a
    /// position that is already lost.
    pub fn choose(self, state: &GameState, rules: &RuleSet, rng: &mut SplitMix64) -> Move {
        let moves = legal_moves(state);
        assert!(!moves.is_empty(), "choose() called with no legal move");
        match self {
            Scripted::Random => moves[rng.below(moves.len())],
            Scripted::Greedy => greedy(state, &moves, rules, rng),
            Scripted::FirstLegal => moves[0],
        }
    }
}

/// Stacks on top for `color` minus stacks on top for the opponent.
pub fn top_difference(state: &GameState, color: Color) -> i32 {
    state
        .cells()
        .iter()
        .filter_map(|c| c.last())
        .map(|&top| if top == color { 1 } else { -1 })
        .sum()
}

fn greedy(
    state: &GameState,
    moves: &[Move],
    rules: &RuleSet,
    rng: &mut SplitMix64,
) -> Move {
    let mover = state.to_move();
    let mut best = i32::MIN;
    let mut tied: Vec<Move> = Vec::new();
    for &m in moves {
        let next = apply_move(state, m).expect("legal move");
        let outcome = is_terminal(&next, rules);
        let score = match outcome {
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
    tied[rng.below(tied.len())]
}

#[cfg(test)]
mod tests {
    use super::*;
    use pogofish_engine::testing::position;
    use pogofish_engine::{base_outcome, initial_state, Cell};
    use std::collections::HashSet;

    const W: Color = Color::White;
    const R: Color = Color::Red;

    fn empty() -> [Cell; 9] {
        std::array::from_fn(|_| Vec::new())
    }

    #[test]
    fn random_plays_every_legal_move_and_nothing_else() {
        let s = initial_state();
        let legal: HashSet<Move> = legal_moves(&s).into_iter().collect();
        let mut rng = SplitMix64::new(1);
        let seen: HashSet<Move> = (0..2000)
            .map(|_| Scripted::Random.choose(&s, &RuleSet::Uncapped, &mut rng))
            .collect();
        assert_eq!(seen, legal);
    }

    /// White can win by covering Red's only top (0→1, or 2 pieces 3→1), and
    /// a quiet move (3→4 or 3→6) scores the same on the top difference (+2),
    /// so only the explicit win check makes greedy win every time.
    #[test]
    fn greedy_takes_a_one_move_win_when_one_exists() {
        let mut cells = empty();
        cells[0] = vec![W];
        cells[1] = vec![R];
        cells[3] = vec![W, W];
        let s = position(cells, W, 0);
        let quiet = apply_move(
            &s,
            Move {
                from_cell: 3,
                num_pieces: 1,
                to_cell: 6,
            },
        )
        .unwrap();
        assert_eq!(base_outcome(&quiet), None);
        assert_eq!(top_difference(&quiet, W), 2, "the tie the test relies on");

        for seed in 0..200 {
            let mut rng = SplitMix64::new(seed);
            let m = Scripted::Greedy.choose(&s, &RuleSet::Uncapped, &mut rng);
            let next = apply_move(&s, m).unwrap();
            assert_eq!(
                base_outcome(&next),
                Some(Outcome::WinWhite),
                "seed {seed}: {m:?}"
            );
        }
    }

    /// Under LC1 with one repetition allowed, returning to a seen position
    /// loses; greedy must avoid it when another move exists.
    #[test]
    fn greedy_avoids_a_losing_move_under_a_variant() {
        let rules = RuleSet::LC1 { repetitions: 1 };
        let s0 = initial_state();
        let a = Move {
            from_cell: 0,
            num_pieces: 1,
            to_cell: 3,
        };
        let b = Move {
            from_cell: 6,
            num_pieces: 1,
            to_cell: 7,
        };
        let back_a = Move {
            from_cell: 3,
            num_pieces: 1,
            to_cell: 0,
        };
        let s = [a, b, back_a]
            .iter()
            .fold(s0, |s, &m| apply_move(&s, m).unwrap());
        let losing = Move {
            from_cell: 7,
            num_pieces: 1,
            to_cell: 6,
        };
        let after = apply_move(&s, losing).unwrap();
        assert_eq!(
            is_terminal(&after, &rules),
            Some(Outcome::WinWhite),
            "setup"
        );

        for seed in 0..200 {
            let mut rng = SplitMix64::new(seed);
            assert_ne!(Scripted::Greedy.choose(&s, &rules, &mut rng), losing);
        }
    }

    #[test]
    fn greedy_maximises_the_top_difference_in_a_quiet_position() {
        let s = initial_state();
        let mut rng = SplitMix64::new(3);
        for _ in 0..50 {
            let m = Scripted::Greedy.choose(&s, &RuleSet::Uncapped, &mut rng);
            let next = apply_move(&s, m).unwrap();
            // From the start, splitting a stack onto an empty cell gains a top:
            // 4 White tops against 3 Red.
            assert_eq!(top_difference(&next, W), 1, "{m:?}");
        }
    }

    #[test]
    fn greedy_breaks_ties_at_random() {
        let s = initial_state();
        let mut rng = SplitMix64::new(9);
        let seen: HashSet<Move> = (0..500)
            .map(|_| Scripted::Greedy.choose(&s, &RuleSet::Uncapped, &mut rng))
            .collect();
        assert!(seen.len() > 1, "only ever played {seen:?}");
    }

    #[test]
    fn names_round_trip() {
        for p in [Scripted::Random, Scripted::Greedy, Scripted::FirstLegal] {
            assert_eq!(Scripted::from_name(p.name()), Some(p));
        }
        assert_eq!(Scripted::from_name("minimax"), None);
    }

    #[test]
    fn rng_is_reproducible_and_in_range() {
        let a: Vec<usize> = {
            let mut r = SplitMix64::new(42);
            (0..100).map(|_| r.below(7)).collect()
        };
        let b: Vec<usize> = {
            let mut r = SplitMix64::new(42);
            (0..100).map(|_| r.below(7)).collect()
        };
        assert_eq!(a, b);
        assert!(a.iter().all(|&x| x < 7));
        assert_eq!(a.iter().collect::<HashSet<_>>().len(), 7);
    }
}
