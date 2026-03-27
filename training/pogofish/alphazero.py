"""
AlphaZero training for Pogo: dual-head neural networks, self-play, and MCTS training.

Two architecture families:
  - AlphaZeroNet: MLP with configurable trunk (3 sizes: tiny, small, medium)
  - AlphaZeroCNN: CNN with 2 conv layers on (13, 3, 3) spatial input

Both output raw policy logits (243,) and value scalar in [-1, 1].
Masking and log-softmax applied externally during inference/training.
"""

from __future__ import annotations

import copy
import json
import random
import time
from collections import deque
from pathlib import Path
from typing import Callable

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move,
    is_terminal, reward as engine_reward, winner,
)
from pogofish.dqn import (
    encode_state, move_to_action, action_to_move, legal_move_mask,
    STATE_SIZE, ACTION_SIZE, MAX_STACK, NUM_CELLS,
)
from pogofish.encoding import state_to_key, move_to_key


# ---------------------------------------------------------------------------
# Architecture configs
# ---------------------------------------------------------------------------

ARCHITECTURES: dict[str, dict] = {
    "mlp_tiny": {"type": "mlp", "trunk": [128, 64], "policy_head": 64, "value_head": 64},
    "mlp_small": {"type": "mlp", "trunk": [256, 128], "policy_head": 128, "value_head": 128},
    "mlp_medium": {"type": "mlp", "trunk": [512, 256, 128], "policy_head": 128, "value_head": 128},
    "cnn": {"type": "cnn"},
}


# ---------------------------------------------------------------------------
# MLP dual-head network
# ---------------------------------------------------------------------------


class AlphaZeroNet(nn.Module):
    """Configurable MLP with shared trunk and dual heads (policy + value)."""

    def __init__(
        self,
        trunk_sizes: list[int] | None = None,
        policy_head_size: int = 128,
        value_head_size: int = 128,
    ) -> None:
        super().__init__()
        if trunk_sizes is None:
            trunk_sizes = [256, 128]

        # Shared trunk
        layers: list[nn.Module] = []
        in_size = STATE_SIZE
        for size in trunk_sizes:
            layers.append(nn.Linear(in_size, size))
            layers.append(nn.ReLU())
            in_size = size
        self.trunk = nn.Sequential(*layers)

        trunk_out = trunk_sizes[-1]

        # Policy head: trunk_out -> policy_head_size -> ACTION_SIZE (raw logits)
        self.policy_head = nn.Sequential(
            nn.Linear(trunk_out, policy_head_size),
            nn.ReLU(),
            nn.Linear(policy_head_size, ACTION_SIZE),
        )

        # Value head: trunk_out -> value_head_size -> 1 -> tanh
        self.value_head = nn.Sequential(
            nn.Linear(trunk_out, value_head_size),
            nn.ReLU(),
            nn.Linear(value_head_size, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Forward pass. Returns (policy_logits, value)."""
        trunk_out = self.trunk(x)
        policy_logits = self.policy_head(trunk_out)
        value = self.value_head(trunk_out)
        return policy_logits, value


# ---------------------------------------------------------------------------
# CNN dual-head network
# ---------------------------------------------------------------------------


class AlphaZeroCNN(nn.Module):
    """CNN with spatial (13, 3, 3) input and dual heads.

    Input is the standard 109-dim vector, reshaped internally:
      - First 108 values -> (12, 3, 3) stack channels
      - Last value (current player) -> broadcast to (1, 3, 3)
      = (13, 3, 3) total input
    """

    def __init__(self) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(13, 32, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(32)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(64)

        flat_size = 64 * 3 * 3  # 576

        self.policy_head = nn.Linear(flat_size, ACTION_SIZE)
        self.value_head = nn.Sequential(
            nn.Linear(flat_size, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Forward pass. x is (B, 109). Returns (policy_logits, value)."""
        batch = x.shape[0]

        # Reshape: first 108 -> (B, 9, 12) cell-major -> transpose -> (B, 12, 3, 3)
        board = x[:, :MAX_STACK * NUM_CELLS].view(batch, NUM_CELLS, MAX_STACK)  # (B, 9, 12)
        board = board.permute(0, 2, 1)  # (B, 12, 9) — now channel-major
        board = board.view(batch, MAX_STACK, 3, 3)  # (B, 12, 3, 3)
        # Current player channel: (B, 1) -> (B, 1, 3, 3)
        player = x[:, -1:].unsqueeze(-1).unsqueeze(-1).expand(batch, 1, 3, 3)
        spatial = torch.cat([board, player], dim=1)  # (B, 13, 3, 3)

        h = F.relu(self.bn1(self.conv1(spatial)))
        h = F.relu(self.bn2(self.conv2(h)))
        flat = h.view(batch, -1)  # (B, 576)

        policy_logits = self.policy_head(flat)
        value = self.value_head(flat)
        return policy_logits, value


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_model(arch_name: str) -> nn.Module:
    """Create a model by architecture name."""
    config = ARCHITECTURES[arch_name]
    if config["type"] == "mlp":
        return AlphaZeroNet(
            trunk_sizes=config["trunk"],
            policy_head_size=config["policy_head"],
            value_head_size=config["value_head"],
        )
    elif config["type"] == "cnn":
        return AlphaZeroCNN()
    else:
        raise ValueError(f"Unknown architecture type: {config['type']}")


# ---------------------------------------------------------------------------
# Loss
# ---------------------------------------------------------------------------


def compute_loss(
    model: nn.Module,
    states: torch.Tensor,
    target_policies: torch.Tensor,
    target_values: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Compute AlphaZero loss: MSE(value) + CrossEntropy(policy).

    Args:
        model: The dual-head network.
        states: (B, 109) state tensors.
        target_policies: (B, 243) MCTS visit count distributions.
        target_values: (B, 1) game outcomes from current player's perspective.

    Returns:
        (total_loss, policy_loss, value_loss)
    """
    policy_logits, value_pred = model(states)

    # Value loss: MSE
    value_loss = F.mse_loss(value_pred, target_values)

    # Policy loss: cross-entropy with soft targets
    # log_softmax on logits, then dot with target distribution
    log_probs = F.log_softmax(policy_logits, dim=1)
    policy_loss = -(target_policies * log_probs).sum(dim=1).mean()

    total_loss = value_loss + policy_loss
    return total_loss, policy_loss, value_loss
