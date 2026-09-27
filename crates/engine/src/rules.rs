use crate::state::GameState;
use crate::types::{Color, Outcome};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RuleSet {
    /// Loss on Nth repetition of the (board, to_move) tuple.
    /// repetitions=1 means the first repetition triggers a loss for the
    /// player whose move produced the repeated position.
    LC1 { repetitions: u8 },
    /// Hard cap: if nobody has won by move `cap`, the player to move at the
    /// cap loses. No draws. The cap's parity therefore fixes which colour
    /// loses a game that reaches it (White for an even cap, Red for odd).
    LC2 { cap: u16 },
    /// Soft cap: game ends on move `cap`. Player with more towers wins.
    /// Ties are earned draws. Earlier wins (base terminal) still apply.
    LC3 { cap: u16 },
}

pub fn is_terminal(state: &GameState, rules: &RuleSet) -> Option<Outcome> {
    if let Some(o) = base_terminal(state) {
        return Some(o);
    }
    match *rules {
        RuleSet::LC1 { repetitions } => check_lc1(state, repetitions),
        RuleSet::LC2 { cap } => check_lc2(state, cap),
        RuleSet::LC3 { cap } => check_lc3(state, cap),
    }
}

/// Base terminal: all non-empty cells have the same top color → that color wins.
/// Matches the TS engine's isTerminal + winner logic.
fn base_terminal(state: &GameState) -> Option<Outcome> {
    let mut seen_white = false;
    let mut seen_red = false;
    for cell in state.cells() {
        if let Some(&top) = cell.last() {
            match top {
                Color::White => seen_white = true,
                Color::Red => seen_red = true,
            }
            if seen_white && seen_red {
                return None; // Both colors have tops — not terminal
            }
        }
    }
    // If no non-empty cells exist, game isn't terminal (shouldn't happen in practice)
    if !seen_white && !seen_red {
        return None;
    }
    if seen_white {
        Some(Outcome::WinWhite)
    } else {
        Some(Outcome::WinRed)
    }
}

fn check_lc1(state: &GameState, repetitions: u8) -> Option<Outcome> {
    let current = state.key();
    let count = state.history_iter().filter(|k| **k == current).count() as u8;
    if count >= repetitions {
        // The player whose move produced this repeated state loses.
        // That player is the opponent of the current to_move.
        Some(match state.to_move().opponent() {
            Color::White => Outcome::WinRed,
            Color::Red => Outcome::WinWhite,
        })
    } else {
        None
    }
}

fn check_lc2(state: &GameState, cap: u16) -> Option<Outcome> {
    if state.move_count() < cap {
        return None;
    }
    // `is_terminal` has already ruled out a base win, so the player to move
    // does not own every stack: they lose.
    Some(match state.to_move() {
        Color::White => Outcome::WinRed,
        Color::Red => Outcome::WinWhite,
    })
}

fn check_lc3(state: &GameState, cap: u16) -> Option<Outcome> {
    if state.move_count() < cap {
        return None;
    }
    let mut white = 0u32;
    let mut red = 0u32;
    for cell in state.cells() {
        if let Some(&top) = cell.last() {
            match top {
                Color::White => white += 1,
                Color::Red => red += 1,
            }
        }
    }
    Some(match white.cmp(&red) {
        std::cmp::Ordering::Greater => Outcome::WinWhite,
        std::cmp::Ordering::Less => Outcome::WinRed,
        std::cmp::Ordering::Equal => Outcome::DrawEarned,
    })
}
