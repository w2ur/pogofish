use crate::types::{Cell, Color};
use serde::{Deserialize, Serialize};

pub const BOARD_SIZE: u8 = 3;
pub const NUM_CELLS: usize = 9;
/// Total pieces in the game (6 white + 6 red).
pub const TOTAL_PIECES: u8 = 12;

/// A compact key for transposition tables and repetition detection.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StateKey(pub Vec<u8>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameState {
    cells: [Cell; NUM_CELLS],
    to_move: Color,
    move_count: u16,
    history: Vec<StateKey>,
}

impl GameState {
    pub fn cells(&self) -> &[Cell; NUM_CELLS] {
        &self.cells
    }

    pub fn to_move(&self) -> Color {
        self.to_move
    }

    pub fn move_count(&self) -> u16 {
        self.move_count
    }

    pub fn history_len(&self) -> usize {
        self.history.len()
    }

    pub fn history_iter(&self) -> impl Iterator<Item = &StateKey> {
        self.history.iter()
    }

    pub(crate) fn history_clone(&self) -> Vec<StateKey> {
        self.history.clone()
    }

    pub(crate) fn new(
        cells: [Cell; NUM_CELLS],
        to_move: Color,
        move_count: u16,
        history: Vec<StateKey>,
    ) -> Self {
        Self { cells, to_move, move_count, history }
    }

    pub(crate) fn set_to_move(&mut self, c: Color) {
        self.to_move = c;
    }

    pub(crate) fn set_move_count(&mut self, n: u16) {
        self.move_count = n;
    }

    pub(crate) fn set_history(&mut self, h: Vec<StateKey>) {
        self.history = h;
    }

    /// Drop the position history. Only the variant rules read it (LC1
    /// repetition); a caller playing the uncapped game can call this after
    /// each move so `apply_move` stops copying an ever-growing history.
    pub fn forget_history(&mut self) {
        self.history.clear();
    }

    /// How many times the current position (board and player to move)
    /// occurred earlier in this game, according to the recorded history.
    pub fn occurrences_before(&self) -> usize {
        let key = self.key();
        self.history.iter().filter(|k| **k == key).count()
    }

    /// The same position with a history that holds only `n` earlier
    /// occurrences of itself: enough for rules and features that read the
    /// current position's repetition count (the replay buffer stores that
    /// count, not whole histories).
    pub fn with_prior_occurrences(&self, n: usize) -> GameState {
        let mut s = self.clone();
        s.history = vec![self.key(); n];
        s
    }

    /// Returns the top piece color of a cell, or None if empty.
    pub fn cell_owner(&self, cell_idx: usize) -> Option<Color> {
        self.cells[cell_idx].last().copied()
    }

    /// Compute the state key for this position.
    pub fn key(&self) -> StateKey {
        crate::encoding::compute_key(self)
    }
}

pub fn initial_state() -> GameState {
    let mut cells: [Cell; NUM_CELLS] = std::array::from_fn(|_| Vec::new());
    // Row 0 (cells 0-2): two white pieces each
    for cell in cells.iter_mut().take(3) {
        *cell = vec![Color::White, Color::White];
    }
    // Row 2 (cells 6-8): two red pieces each
    for cell in cells.iter_mut().skip(6).take(3) {
        *cell = vec![Color::Red, Color::Red];
    }
    GameState::new(cells, Color::White, 0, Vec::new())
}
