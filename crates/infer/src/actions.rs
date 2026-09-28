//! The policy head's action space: from cell × pieces × to cell.

use pogofish_engine::Move;

pub const ACTION_SIZE: usize = 243; // 9 cells × 3 piece counts × 9 cells

/// from_cell * 27 + (num_pieces - 1) * 9 + to_cell
pub fn move_to_index(m: &Move) -> usize {
    m.from_cell as usize * 27 + (m.num_pieces as usize - 1) * 9 + m.to_cell as usize
}

pub fn index_to_move(index: usize) -> Move {
    let from_cell = (index / 27) as u8;
    let rem = index % 27;
    Move {
        from_cell,
        num_pieces: (rem / 9 + 1) as u8,
        to_cell: (rem % 9) as u8,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indices_round_trip() {
        for i in 0..ACTION_SIZE {
            assert_eq!(move_to_index(&index_to_move(i)), i);
        }
    }
}
