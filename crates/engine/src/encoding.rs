use crate::state::{GameState, StateKey, NUM_CELLS};
use crate::types::Color;

/// Encode (board + to_move) into a compact key for transposition tables
/// and repetition detection.
///
/// Format: for each of the 9 cells, emit 1 byte (stack height), then
/// ceil(height/8) bytes of color bits (LSB = bottom piece, 0 = White, 1 = Red).
/// Final byte: to_move (0 = White, 1 = Red).
pub fn compute_key(state: &GameState) -> StateKey {
    let mut bytes = Vec::with_capacity(20);
    for i in 0..NUM_CELLS {
        let stack = &state.cells()[i];
        bytes.push(stack.len() as u8);
        // Pack colors into bytes, 8 pieces per byte
        let mut bit_idx = 0;
        let mut current_byte = 0u8;
        for &color in stack {
            if color == Color::Red {
                current_byte |= 1 << bit_idx;
            }
            bit_idx += 1;
            if bit_idx == 8 {
                bytes.push(current_byte);
                current_byte = 0;
                bit_idx = 0;
            }
        }
        if bit_idx > 0 {
            bytes.push(current_byte);
        }
    }
    bytes.push(if state.to_move() == Color::White { 0 } else { 1 });
    StateKey(bytes)
}
