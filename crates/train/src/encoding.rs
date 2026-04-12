use pogofish_engine::{legal_moves, Color, GameState, Move};
use tch::Tensor;

pub const STATE_SIZE: usize = 109; // MAX_STACK * NUM_CELLS + 1 = 12 * 9 + 1
pub const ACTION_SIZE: usize = 243; // NUM_CELLS * 3 * NUM_CELLS = 9 * 3 * 9
pub const MAX_STACK: usize = 12;

/// Encode a GameState into a flat [STATE_SIZE] float tensor.
/// For each cell (0-8), encode the stack slot-by-slot (bottom to top):
///   White piece = +1.0, Red = -1.0, empty = 0.0.
/// Each cell contributes MAX_STACK values.
/// Final element: current player (+1.0 for White, -1.0 for Red).
pub fn state_to_tensor(state: &GameState) -> Tensor {
    let mut data = [0f32; STATE_SIZE];
    for (cell_idx, cell) in state.cells().iter().enumerate() {
        let base = cell_idx * MAX_STACK;
        for (slot, &color) in cell.iter().enumerate().take(MAX_STACK) {
            data[base + slot] = match color {
                Color::White => 1.0,
                Color::Red => -1.0,
            };
        }
    }
    data[STATE_SIZE - 1] = match state.to_move() {
        Color::White => 1.0,
        Color::Red => -1.0,
    };
    Tensor::from_slice(&data)
}

/// Convert Move to action index: from_cell * 27 + (num_pieces - 1) * 9 + to_cell
pub fn move_to_index(m: &Move) -> usize {
    m.from_cell as usize * 27 + (m.num_pieces as usize - 1) * 9 + m.to_cell as usize
}

/// Convert action index back to Move.
pub fn index_to_move(index: usize) -> Move {
    let from_cell = (index / 27) as u8;
    let rem = index % 27;
    let num_pieces = (rem / 9 + 1) as u8;
    let to_cell = (rem % 9) as u8;
    Move { from_cell, num_pieces, to_cell }
}

/// Create a boolean mask of legal actions for a given state.
/// Returns a [ACTION_SIZE] tensor where 1.0 indicates a legal action.
pub fn legal_move_mask(state: &GameState) -> Tensor {
    let moves = legal_moves(state);
    let mut mask = [0f32; ACTION_SIZE];
    for m in moves {
        mask[move_to_index(&m)] = 1.0;
    }
    Tensor::from_slice(&mask)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pogofish_engine::initial_state;

    #[test]
    fn move_roundtrip_all_243() {
        for idx in 0..ACTION_SIZE {
            let m = index_to_move(idx);
            assert_eq!(move_to_index(&m), idx, "roundtrip failed for index {idx}");
        }
    }

    #[test]
    fn index_to_move_roundtrip() {
        for from in 0u8..9 {
            for pieces in 1u8..=3 {
                for to in 0u8..9 {
                    let m = Move { from_cell: from, num_pieces: pieces, to_cell: to };
                    let idx = move_to_index(&m);
                    let m2 = index_to_move(idx);
                    assert_eq!(m, m2);
                }
            }
        }
    }

    #[test]
    fn state_to_tensor_shape() {
        let state = initial_state();
        let t = state_to_tensor(&state);
        assert_eq!(t.size(), vec![STATE_SIZE as i64]);
    }

    #[test]
    fn state_to_tensor_initial_values() {
        let state = initial_state();
        let t = state_to_tensor(&state);
        let data: Vec<f32> = t.try_into().unwrap();

        // Row 0 cells (0-2): 2 white pieces each = first 2 slots = +1.0
        for cell in 0..3 {
            let base = cell * MAX_STACK;
            assert_eq!(data[base], 1.0, "cell {cell} slot 0 should be white");
            assert_eq!(data[base + 1], 1.0, "cell {cell} slot 1 should be white");
            for slot in 2..MAX_STACK {
                assert_eq!(data[base + slot], 0.0);
            }
        }
        // Middle row (cells 3-5): empty
        for cell in 3..6 {
            let base = cell * MAX_STACK;
            for slot in 0..MAX_STACK {
                assert_eq!(data[base + slot], 0.0);
            }
        }
        // Row 2 (cells 6-8): 2 red pieces each
        for cell in 6..9 {
            let base = cell * MAX_STACK;
            assert_eq!(data[base], -1.0, "cell {cell} slot 0 should be red");
            assert_eq!(data[base + 1], -1.0, "cell {cell} slot 1 should be red");
            for slot in 2..MAX_STACK {
                assert_eq!(data[base + slot], 0.0);
            }
        }
        // Last element: White to move
        assert_eq!(data[STATE_SIZE - 1], 1.0);
    }

    #[test]
    fn legal_move_mask_shape() {
        let state = initial_state();
        let mask = legal_move_mask(&state);
        assert_eq!(mask.size(), vec![ACTION_SIZE as i64]);
    }

    #[test]
    fn legal_move_mask_indices_match_legal_moves() {
        let state = initial_state();
        let moves = legal_moves(&state);
        let mask = legal_move_mask(&state);
        let mask_data: Vec<f32> = mask.try_into().unwrap();
        let set_count = mask_data.iter().filter(|&&v| v == 1.0).count();
        assert_eq!(set_count, moves.len());
        for m in moves {
            let idx = move_to_index(&m);
            assert_eq!(mask_data[idx], 1.0);
        }
    }

    #[test]
    fn action_size_range() {
        use pogofish_engine::NUM_CELLS;
        for idx in 0..ACTION_SIZE {
            let m = index_to_move(idx);
            assert!((m.from_cell as usize) < NUM_CELLS);
            assert!((m.to_cell as usize) < NUM_CELLS);
            assert!(m.num_pieces >= 1 && m.num_pieces <= 3);
        }
    }
}
