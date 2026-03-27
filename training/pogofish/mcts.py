"""
Monte Carlo Tree Search for two-player Pogo.

Pure tree search logic — no neural net imports, no training, no I/O.
The evaluation function (neural net forward pass) is injected as a callable.

Two-player handling:
  - Q-values are stored from the perspective of the node's current player.
  - During backpropagation, value is negated at each level.
  - PUCT selection operates on Q-values from the node's perspective.
"""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
import torch

from pogofish.engine import (
    GameState, Move,
    legal_moves, apply_move, is_terminal, reward, winner,
)
from pogofish.dqn import (
    move_to_action, action_to_move, ACTION_SIZE,
)


class MCTSNode:
    """A node in the MCTS tree."""

    __slots__ = ("state", "parent", "parent_action", "visit_count", "children")

    def __init__(
        self,
        state: GameState,
        parent: MCTSNode | None = None,
        parent_action: int | None = None,
    ) -> None:
        self.state = state
        self.parent = parent
        self.parent_action = parent_action
        self.visit_count = 0
        # action_idx -> {prior, visit_count, value_sum, node (None until expanded)}
        self.children: dict[int, dict] = {}

    def is_leaf(self) -> bool:
        return len(self.children) == 0

    def expand(self, prior: torch.Tensor) -> None:
        """Create child edges for all legal moves with priors from the policy."""
        moves = legal_moves(self.state)
        for move in moves:
            action = move_to_action(move)
            self.children[action] = {
                "prior": prior[action].item(),
                "visit_count": 0,
                "value_sum": 0.0,
                "node": None,
            }

    def _puct_score(self, action: int, c_puct: float) -> float:
        """Compute PUCT score for a child action."""
        child = self.children[action]
        q = child["value_sum"] / child["visit_count"] if child["visit_count"] > 0 else 0.0
        u = c_puct * child["prior"] * math.sqrt(self.visit_count) / (1 + child["visit_count"])
        return q + u

    def select_action(self, c_puct: float = 1.5) -> int:
        """Select the action with the highest PUCT score."""
        best_action = -1
        best_score = -float("inf")
        for action in self.children:
            score = self._puct_score(action, c_puct)
            if score > best_score:
                best_score = score
                best_action = action
        return best_action

    def backpropagate(self, value: float) -> None:
        """Backpropagate value up the tree, negating at each level."""
        self.visit_count += 1
        if self.parent is not None:
            # Store value from parent's perspective (negated)
            self.parent.children[self.parent_action]["value_sum"] += -value
            self.parent.children[self.parent_action]["visit_count"] += 1
            self.parent.backpropagate(-value)


# ---------------------------------------------------------------------------
# Task 2 stubs — implemented in the next task
# ---------------------------------------------------------------------------

def mcts_search(
    root_state: GameState,
    eval_fn: Callable[[GameState], tuple[torch.Tensor, float]],
    num_simulations: int = 800,
    c_puct: float = 1.5,
    dirichlet_alpha: float = 0.3,
    dirichlet_epsilon: float = 0.25,
) -> MCTSNode:
    """Run MCTS from root_state and return the root node. (Task 2)"""
    raise NotImplementedError("mcts_search is implemented in Task 2")


def select_move(
    root: MCTSNode,
    temperature: float = 1.0,
) -> int:
    """Select a move from the root node using visit count distribution. (Task 2)"""
    raise NotImplementedError("select_move is implemented in Task 2")


def get_mcts_policy(root: MCTSNode, temperature: float = 1.0) -> np.ndarray:
    """Return the MCTS policy vector over all actions. (Task 2)"""
    raise NotImplementedError("get_mcts_policy is implemented in Task 2")
