mod state;
mod types;

pub use state::{initial_state, GameState, StateKey, BOARD_SIZE, NUM_CELLS, TOTAL_PIECES};
pub use types::{Cell, Color, Move, MoveError, Outcome, DISTANCES};
