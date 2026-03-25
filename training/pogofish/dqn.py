"""
DQN state/action encoding for the Pogo board game.

State encoding:
  - 109-dimensional float32 tensor.
  - 12 slots per cell × 9 cells + 1 current-player indicator.
  - Each slot encodes a piece as +1.0 (White), -1.0 (Red), or 0.0 (empty).
  - Slots are ordered bottom-to-top within each cell.
  - The final element is +1.0 (White to move) or -1.0 (Red to move).

Action encoding:
  - 243 discrete actions (9 × 3 × 9).
  - Index = from_cell * 27 + (num_pieces - 1) * 9 + to_cell
"""

from __future__ import annotations

import torch

from pogofish.engine import W, R, GameState, Move, legal_moves

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_STACK = 12       # Total pieces in the game (6 White + 6 Red)
NUM_CELLS = 9        # 3×3 board
STATE_SIZE = MAX_STACK * NUM_CELLS + 1   # 109
ACTION_SIZE = NUM_CELLS * 3 * NUM_CELLS  # 243

# Piece encoding values
_PIECE_VALUE: dict[str, float] = {W: 1.0, R: -1.0}
_PLAYER_VALUE: dict[str, float] = {W: 1.0, R: -1.0}


# ---------------------------------------------------------------------------
# State encoding
# ---------------------------------------------------------------------------


def encode_state(state: GameState) -> torch.Tensor:
    """
    Encode a GameState as a float32 tensor of shape (109,).

    Layout:
      indices 0..11   → cell 0 (bottom-to-top, padded with 0.0)
      indices 12..23  → cell 1
      ...
      indices 96..107 → cell 8
      index 108       → current player (+1 White, -1 Red)
    """
    data = torch.zeros(STATE_SIZE, dtype=torch.float32)
    for cell_idx, stack in enumerate(state.board):
        base = cell_idx * MAX_STACK
        for depth, piece in enumerate(stack):
            data[base + depth] = _PIECE_VALUE[piece]
    data[STATE_SIZE - 1] = _PLAYER_VALUE[state.current_player]
    return data


# ---------------------------------------------------------------------------
# Action encoding
# ---------------------------------------------------------------------------


def move_to_action(move: Move) -> int:
    """Convert a Move to an action index in [0, 242]."""
    return move.from_cell * 27 + (move.num_pieces - 1) * 9 + move.to_cell


def action_to_move(idx: int) -> Move:
    """Convert an action index in [0, 242] to a Move."""
    from_cell, remainder = divmod(idx, 27)
    pieces_minus_one, to_cell = divmod(remainder, 9)
    return Move(from_cell=from_cell, num_pieces=pieces_minus_one + 1, to_cell=to_cell)


# ---------------------------------------------------------------------------
# Legal move mask
# ---------------------------------------------------------------------------


def legal_move_mask(state: GameState) -> torch.Tensor:
    """
    Return a boolean tensor of shape (243,) where True indicates a legal action.
    """
    mask = torch.zeros(ACTION_SIZE, dtype=torch.bool)
    for move in legal_moves(state):
        mask[move_to_action(move)] = True
    return mask
