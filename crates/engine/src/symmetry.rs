//! Board symmetries (plan task 2.3).
//!
//! A symmetry is a permutation of the 9 cells. The 8 symmetries of the square
//! (rotations and reflections) preserve Manhattan distance, so they should
//! map legal moves to legal moves and wins to wins. `preserves_rules` checks
//! that on sample positions; `crates/engine/tests/symmetry.rs` runs it on all
//! 8 and on permutations that are not symmetries, which it must reject.

use crate::legal::{apply_move, legal_moves};
use crate::rules::{is_terminal, RuleSet};
use crate::state::{GameState, NUM_CELLS};
use crate::types::{Cell, Move};
use std::collections::HashSet;

/// A permutation of cells: cell `i` goes to `perm[i]`.
pub type CellMap = [u8; NUM_CELLS];

/// The 8 symmetries of the 3×3 board, identity first. Cell = 3·row + col.
pub fn square_symmetries() -> [CellMap; 8] {
    let map = |f: fn(u8, u8) -> (u8, u8)| -> CellMap {
        std::array::from_fn(|i| {
            let (r, c) = f(i as u8 / 3, i as u8 % 3);
            r * 3 + c
        })
    };
    [
        map(|r, c| (r, c)),         // identity
        map(|r, c| (c, 2 - r)),     // rotate 90°
        map(|r, c| (2 - r, 2 - c)), // rotate 180°
        map(|r, c| (2 - c, r)),     // rotate 270°
        map(|r, c| (r, 2 - c)),     // mirror left-right
        map(|r, c| (2 - r, c)),     // mirror top-bottom
        map(|r, c| (c, r)),         // main diagonal
        map(|r, c| (2 - c, 2 - r)), // anti-diagonal
    ]
}

/// The symmetries round 2 may use for data augmentation: those that passed
/// `preserves_rules` in the tests (all 8, see `tests/symmetry.rs`).
pub fn verified_symmetries() -> [CellMap; 8] {
    square_symmetries()
}

pub fn transform_move(m: Move, perm: &CellMap) -> Move {
    Move {
        from_cell: perm[m.from_cell as usize],
        num_pieces: m.num_pieces,
        to_cell: perm[m.to_cell as usize],
    }
}

/// The same position with its cells permuted. Player to move and move count
/// are kept; the history is dropped (its keys cannot be permuted), so the
/// result is only meaningful under rules that do not read history.
pub fn transform_state(state: &GameState, perm: &CellMap) -> GameState {
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    for (i, stack) in state.cells().iter().enumerate() {
        cells[perm[i] as usize] = stack.clone();
    }
    GameState::new(cells, state.to_move(), state.move_count(), Vec::new())
}

/// Check, on each sample position, that `perm` maps the legal-move set onto
/// the legal-move set of the transformed position, that every move commutes
/// with the transform, and that the outcome under `rules` is unchanged.
pub fn preserves_rules(perm: &CellMap, samples: &[GameState], rules: &RuleSet) -> bool {
    samples.iter().all(|s| {
        let t = transform_state(s, perm);
        let moved: HashSet<Move> = legal_moves(s)
            .into_iter()
            .map(|m| transform_move(m, perm))
            .collect();
        let direct: HashSet<Move> = legal_moves(&t).into_iter().collect();
        if moved != direct || is_terminal(s, rules) != is_terminal(&t, rules) {
            return false;
        }
        legal_moves(s).into_iter().all(|m| {
            let after = transform_state(&apply_move(s, m).expect("legal"), perm);
            let after_t = apply_move(&t, transform_move(m, perm)).expect("checked legal above");
            after.cells() == after_t.cells() && after.to_move() == after_t.to_move()
        })
    })
}
