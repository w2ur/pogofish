use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Color {
    White,
    Red,
}

impl Color {
    pub fn opponent(self) -> Self {
        match self {
            Color::White => Color::Red,
            Color::Red => Color::White,
        }
    }
}

/// A cell is a stack of pieces, bottom to top. The top piece determines ownership.
pub type Cell = Vec<Color>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Move {
    pub from_cell: u8,
    pub num_pieces: u8,
    pub to_cell: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum MoveError {
    #[error("source cell {0} is empty or not owned by mover")]
    InvalidSource(u8),
    #[error("requested num_pieces {requested} exceeds stack height {available}")]
    TooManyPieces { requested: u8, available: u8 },
    #[error("destination cell {to} is not at legal distance from {from}")]
    IllegalDistance { from: u8, to: u8 },
    #[error("source and destination are the same cell")]
    SameCell,
    #[error("out-of-range cell index {0}")]
    OutOfRange(u8),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Outcome {
    WinWhite,
    WinRed,
    /// Earned draw (only LC3 can produce this — tie on tower count at cap)
    DrawEarned,
}

impl Outcome {
    pub fn winner(&self) -> Option<Color> {
        match self {
            Outcome::WinWhite => Some(Color::White),
            Outcome::WinRed => Some(Color::Red),
            Outcome::DrawEarned => None,
        }
    }
}

/// Valid Manhattan distances for each pickup count.
/// 1 piece → d=1, 2 pieces → d=2, 3 pieces → d=1 or d=3.
pub const DISTANCES: [&[u8]; 4] = [
    &[],       // 0 pieces (unused)
    &[1],      // 1 piece
    &[2],      // 2 pieces
    &[1, 3],   // 3 pieces
];
