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

import random
from collections import deque

import torch
import torch.nn as nn

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


# ---------------------------------------------------------------------------
# DQN Model
# ---------------------------------------------------------------------------


class DQNModel(nn.Module):
    """
    Configurable MLP that maps a state tensor (109,) to Q-values (243,).

    Hidden layers default to [128, 64]. No activation on the output layer.
    """

    def __init__(self, hidden_layers: list[int] | None = None) -> None:
        super().__init__()
        if hidden_layers is None:
            hidden_layers = [128, 64]

        layer_sizes = [STATE_SIZE] + hidden_layers + [ACTION_SIZE]
        layers: list[nn.Module] = []
        for i in range(len(layer_sizes) - 1):
            layers.append(nn.Linear(layer_sizes[i], layer_sizes[i + 1]))
            if i < len(layer_sizes) - 2:
                layers.append(nn.ReLU())

        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ---------------------------------------------------------------------------
# Replay Buffer
# ---------------------------------------------------------------------------


class ReplayBuffer:
    """
    Circular buffer storing (state, action, reward, next_state, done) transitions.
    """

    def __init__(self, capacity: int = 100_000) -> None:
        self._buffer: deque[tuple[torch.Tensor, int, float, torch.Tensor, bool]] = deque(
            maxlen=capacity
        )

    def add(
        self,
        state: torch.Tensor,
        action: int,
        reward: float,
        next_state: torch.Tensor,
        done: bool,
    ) -> None:
        self._buffer.append((state, action, reward, next_state, done))

    def sample(
        self, batch_size: int
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Return a random batch of transitions as stacked tensors.

        Returns:
            states:      (B, 109) float32
            actions:     (B,)     long
            rewards:     (B,)     float32
            next_states: (B, 109) float32
            dones:       (B,)     bool
        """
        batch = random.sample(self._buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            torch.stack(states).float(),
            torch.tensor(actions, dtype=torch.long),
            torch.tensor(rewards, dtype=torch.float32),
            torch.stack(next_states).float(),
            torch.tensor(dones, dtype=torch.bool),
        )

    def __len__(self) -> int:
        return len(self._buffer)
