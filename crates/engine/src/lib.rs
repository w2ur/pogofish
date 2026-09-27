mod encoding;
mod legal;
pub mod notation;
mod rules;
mod state;
pub mod testing;
mod types;

pub use legal::{apply_move, is_legal_move, legal_moves, manhattan_distance};
pub use rules::{base_outcome, is_terminal, RuleSet};
pub use state::{initial_state, GameState, StateKey, BOARD_SIZE, NUM_CELLS, TOTAL_PIECES};
pub use types::{Cell, Color, Move, MoveError, Outcome, DISTANCES};
