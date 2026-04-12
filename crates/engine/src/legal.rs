use crate::state::{GameState, NUM_CELLS, BOARD_SIZE};
use crate::types::{Color, Move, MoveError, DISTANCES};

/// Manhattan distance between two cell indices on a 3x3 grid.
pub fn manhattan_distance(a: u8, b: u8) -> u8 {
    let row_a = a / BOARD_SIZE;
    let col_a = a % BOARD_SIZE;
    let row_b = b / BOARD_SIZE;
    let col_b = b % BOARD_SIZE;
    row_a.abs_diff(row_b) + col_a.abs_diff(col_b)
}

pub fn legal_moves(state: &GameState) -> Vec<Move> {
    let mover = state.to_move();
    let mut out = Vec::new();
    for from_cell in 0..NUM_CELLS as u8 {
        let stack = &state.cells()[from_cell as usize];
        if stack.is_empty() {
            continue;
        }
        // Top piece must belong to the mover
        if stack[stack.len() - 1] != mover {
            continue;
        }
        for num_pieces in 1..=3u8 {
            if (stack.len() as u8) < num_pieces {
                continue;
            }
            let Some(dists) = DISTANCES.get(num_pieces as usize) else {
                continue;
            };
            for to_cell in 0..NUM_CELLS as u8 {
                if to_cell == from_cell {
                    continue;
                }
                let d = manhattan_distance(from_cell, to_cell);
                if dists.contains(&d) {
                    out.push(Move { from_cell, num_pieces, to_cell });
                }
            }
        }
    }
    out
}

pub fn is_legal_move(state: &GameState, m: Move) -> Result<(), MoveError> {
    if m.from_cell >= NUM_CELLS as u8 {
        return Err(MoveError::OutOfRange(m.from_cell));
    }
    if m.to_cell >= NUM_CELLS as u8 {
        return Err(MoveError::OutOfRange(m.to_cell));
    }
    if m.from_cell == m.to_cell {
        return Err(MoveError::SameCell);
    }

    let stack = &state.cells()[m.from_cell as usize];
    if stack.is_empty() || stack[stack.len() - 1] != state.to_move() {
        return Err(MoveError::InvalidSource(m.from_cell));
    }
    if m.num_pieces == 0 || m.num_pieces > stack.len() as u8 {
        return Err(MoveError::TooManyPieces {
            requested: m.num_pieces,
            available: stack.len() as u8,
        });
    }

    let dists = DISTANCES.get(m.num_pieces as usize).unwrap_or(&(&[] as &[u8]));
    let d = manhattan_distance(m.from_cell, m.to_cell);
    if !dists.contains(&d) {
        return Err(MoveError::IllegalDistance {
            from: m.from_cell,
            to: m.to_cell,
        });
    }

    Ok(())
}

pub fn apply_move(state: &GameState, m: Move) -> Result<GameState, MoveError> {
    is_legal_move(state, m)?;

    let mut cells = state.cells().clone();

    // Splice top num_pieces from source
    let from = &mut cells[m.from_cell as usize];
    let split_at = from.len() - m.num_pieces as usize;
    let picked: Vec<Color> = from.split_off(split_at);

    // Push onto destination
    cells[m.to_cell as usize].extend(picked);

    Ok(GameState::new(
        cells,
        state.to_move().opponent(),
        state.move_count() + 1,
        state.history_clone(),
    ))
}
