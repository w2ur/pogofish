//! How a position is turned into the network's input.

use pogofish_engine::{Color, GameState, RuleSet};
use serde::{Deserialize, Serialize};

/// Stack slots per cell in every encoding (the game has 12 pieces).
pub const MAX_STACK: usize = 12;
/// Size of the absolute encoding: 12 slots × 9 cells + the player to move.
pub const ABSOLUTE_SIZE: usize = MAX_STACK * 9 + 1;
pub const MOVER_RELATIVE_SIZE: usize = 9 * (MAX_STACK + 2);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Features {
    /// 12 slots per cell in absolute colours (White +1, Red −1), bottom to
    /// top, plus the player to move (+1 White, −1 Red).
    Absolute,
    /// Per cell, seen from the player to move: 12 slots (+1 own piece, −1
    /// opponent's, 0 empty), the top's owner (+1, −1, 0) and the height / 12.
    /// Only raw board facts, restated so that ownership sits in a fixed
    /// input whatever the stack's height.
    MoverRelative,
    /// `MoverRelative` plus one input: how many times the current position
    /// occurred earlier in the game (/ 2). It is what a repetition rule reads
    /// at the current position. It is not the whole history, so under LC1 the
    /// input is still not a complete Markov state; the search, whose key and
    /// terminal checks read the full history, stays exact.
    MoverRelativeRepetition,
}

impl Features {
    pub fn size(self) -> usize {
        match self {
            Features::Absolute => ABSOLUTE_SIZE,
            Features::MoverRelative => MOVER_RELATIVE_SIZE,
            Features::MoverRelativeRepetition => MOVER_RELATIVE_SIZE + 1,
        }
    }

    /// Whether these features carry everything `rules` reads at the current
    /// position: nothing beyond the board under Uncapped, the current
    /// position's repetition count under LC1. Never for LC2/LC3, which read
    /// the move count.
    pub fn suffice_for(self, rules: &RuleSet) -> bool {
        match rules {
            RuleSet::Uncapped => true,
            RuleSet::LC1 { .. } => self == Features::MoverRelativeRepetition,
            RuleSet::LC2 { .. } | RuleSet::LC3 { .. } => false,
        }
    }

    pub fn encode(self, state: &GameState) -> Vec<f32> {
        match self {
            Features::Absolute => {
                let mut x = vec![0f32; ABSOLUTE_SIZE];
                for (i, stack) in state.cells().iter().enumerate() {
                    for (slot, &c) in stack.iter().enumerate().take(MAX_STACK) {
                        x[i * MAX_STACK + slot] = if c == Color::White { 1.0 } else { -1.0 };
                    }
                }
                x[ABSOLUTE_SIZE - 1] = if state.to_move() == Color::White {
                    1.0
                } else {
                    -1.0
                };
                x
            }
            Features::MoverRelative => {
                let me = state.to_move();
                let side = |c: Color| if c == me { 1.0f32 } else { -1.0 };
                let mut x = vec![0f32; MOVER_RELATIVE_SIZE];
                for (i, stack) in state.cells().iter().enumerate() {
                    let base = i * (MAX_STACK + 2);
                    for (slot, &c) in stack.iter().enumerate().take(MAX_STACK) {
                        x[base + slot] = side(c);
                    }
                    x[base + MAX_STACK] = stack.last().map_or(0.0, |&c| side(c));
                    x[base + MAX_STACK + 1] = stack.len() as f32 / MAX_STACK as f32;
                }
                x
            }
            Features::MoverRelativeRepetition => {
                let mut x = Features::MoverRelative.encode(state);
                x.push(state.occurrences_before() as f32 / 2.0);
                x
            }
        }
    }
}
