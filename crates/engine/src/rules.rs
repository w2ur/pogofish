use crate::state::{GameState, StateKey};
use crate::types::{Color, Outcome};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RuleSet {
    /// The published game: only the base rule ends it (a player with no
    /// stack on top has lost). Games may in principle go on forever; callers
    /// impose their own safety limit and treat it as truncation, not a draw.
    Uncapped,
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
        RuleSet::Uncapped => None,
        RuleSet::LC1 { repetitions } => check_lc1(state, repetitions),
        RuleSet::LC2 { cap } => check_lc2(state, cap),
        RuleSet::LC3 { cap } => check_lc3(state, cap),
    }
}

impl std::fmt::Display for RuleSet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match *self {
            RuleSet::Uncapped => write!(f, "uncapped"),
            RuleSet::LC1 { repetitions } => write!(f, "lc1-{repetitions}"),
            RuleSet::LC2 { cap } => write!(f, "lc2-{cap}"),
            RuleSet::LC3 { cap } => write!(f, "lc3-{cap}"),
        }
    }
}

impl std::str::FromStr for RuleSet {
    type Err = String;

    /// Parses `uncapped`, `lc1-N`, `lc2-N` or `lc3-N`.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if s == "uncapped" {
            return Ok(RuleSet::Uncapped);
        }
        let usage = || format!("ruleset must be uncapped, lc1-N, lc2-N or lc3-N, got '{s}'");
        let (kind, n) = s.split_once('-').ok_or_else(usage)?;
        match kind {
            "lc1" => Ok(RuleSet::LC1 { repetitions: n.parse().map_err(|_| usage())? }),
            "lc2" => Ok(RuleSet::LC2 { cap: n.parse().map_err(|_| usage())? }),
            "lc3" => Ok(RuleSet::LC3 { cap: n.parse().map_err(|_| usage())? }),
            _ => Err(usage()),
        }
    }
}

impl RuleSet {
    /// True when the rule depends on nothing but the board and the player to
    /// move, so `GameState::key` (and the network's board encoding) is a
    /// Markov state. Only `Uncapped` qualifies: LC1 reads the history, LC2 and
    /// LC3 the move count.
    pub fn board_is_markov(&self) -> bool {
        matches!(self, RuleSet::Uncapped)
    }
}

/// Key for search trees and transposition tables under `rules`: the board
/// and player to move, plus exactly what the rule reads beyond them — the
/// number of earlier occurrences of this position for LC1, the move count for
/// LC2 and LC3. Two states share a key only if the rule cannot tell them
/// apart, so transpositions are kept wherever they are sound.
pub fn search_key(state: &GameState, rules: &RuleSet) -> StateKey {
    let mut key = state.key();
    match *rules {
        RuleSet::Uncapped => {}
        RuleSet::LC1 { .. } => {
            let current = key.clone();
            let seen = state.history_iter().filter(|k| **k == current).count();
            key.0.push(0xF1);
            key.0.extend_from_slice(&(seen.min(u16::MAX as usize) as u16).to_le_bytes());
        }
        RuleSet::LC2 { .. } | RuleSet::LC3 { .. } => {
            key.0.push(0xF2);
            key.0.extend_from_slice(&state.move_count().to_le_bytes());
        }
    }
    key
}

/// The game's own end, with no variant rule: a player with no stack on top
/// has lost. Use this to play the uncapped game.
pub fn base_outcome(state: &GameState) -> Option<Outcome> {
    base_terminal(state)
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
