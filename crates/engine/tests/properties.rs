use pogofish_engine::{apply_move, initial_state, is_terminal, legal_moves, GameState, RuleSet};
use proptest::prelude::*;

fn total_pieces(s: &GameState) -> usize {
    s.cells().iter().map(|c| c.len()).sum()
}

proptest! {
    /// Invariant: from any reachable state, either is_terminal returns Some
    /// or legal_moves returns at least one move. No stalemate without termination.
    #[test]
    fn not_terminal_implies_has_legal_moves(seed in 0u64..1000) {
        let rules = RuleSet::LC2 { cap: 50 };
        let mut s = initial_state();
        let mut rng = seed;
        for _ in 0..30 {
            if is_terminal(&s, &rules).is_some() { break; }
            let moves = legal_moves(&s);
            prop_assert!(!moves.is_empty(), "non-terminal state has zero legal moves");
            let idx = (rng as usize) % moves.len();
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            s = apply_move(&s, moves[idx]).expect("random legal move should apply");
        }
    }

    /// Invariant: apply_move of a legal move never fails.
    #[test]
    fn legal_moves_are_applicable(seed in 0u64..1000) {
        let mut s = initial_state();
        let mut rng = seed;
        for _ in 0..20 {
            let moves = legal_moves(&s);
            if moves.is_empty() { break; }
            let idx = (rng as usize) % moves.len();
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            prop_assert!(apply_move(&s, moves[idx]).is_ok());
            s = apply_move(&s, moves[idx]).unwrap();
        }
    }

    /// Invariant: total piece count is exactly 12 throughout the game.
    /// Pieces are never created or destroyed in Pogo — only restacked.
    #[test]
    fn total_pieces_conserved(seed in 0u64..1000) {
        let mut s = initial_state();
        prop_assert_eq!(total_pieces(&s), 12);
        let mut rng = seed;
        for _ in 0..30 {
            let moves = legal_moves(&s);
            if moves.is_empty() { break; }
            let idx = (rng as usize) % moves.len();
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            s = apply_move(&s, moves[idx]).unwrap();
            prop_assert_eq!(total_pieces(&s), 12, "piece count changed from 12");
        }
    }

    /// Invariant: the moved pieces land on top, so the mover always owns the
    /// destination and can never lose by their own move under the base rule.
    #[test]
    fn mover_owns_destination_after_move(seed in 0u64..1000) {
        let mut s = initial_state();
        let mut rng = seed;
        for _ in 0..30 {
            let moves = legal_moves(&s);
            if moves.is_empty() { break; }
            let idx = (rng as usize) % moves.len();
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let mover = s.to_move();
            s = apply_move(&s, moves[idx]).unwrap();
            prop_assert_eq!(s.cell_owner(moves[idx].to_cell as usize), Some(mover));
        }
    }
}
