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

    def add_dirichlet_noise(self, alpha: float = 0.8, epsilon: float = 0.25) -> None:
        """Add Dirichlet noise to root priors for exploration."""
        actions = list(self.children.keys())
        noise = np.random.dirichlet([alpha] * len(actions))
        for i, action in enumerate(actions):
            self.children[action]["prior"] = (
                (1 - epsilon) * self.children[action]["prior"] + epsilon * noise[i]
            )


def get_mcts_policy(node: MCTSNode) -> torch.Tensor:
    """Return normalized visit count distribution as a (ACTION_SIZE,) tensor."""
    policy = torch.zeros(ACTION_SIZE, dtype=torch.float32)
    total = sum(info["visit_count"] for info in node.children.values())
    if total > 0:
        for action, info in node.children.items():
            policy[action] = info["visit_count"] / total
    return policy


def select_move(
    node: MCTSNode,
    temperature: float,
) -> tuple[int, torch.Tensor]:
    """Select a move from the root node using temperature-controlled sampling.

    Returns (action_index, mcts_policy_tensor).
    """
    if temperature < 1e-8:
        # Greedy: pick the most-visited action
        best_action = max(node.children, key=lambda a: node.children[a]["visit_count"])
        policy = torch.zeros(ACTION_SIZE, dtype=torch.float32)
        policy[best_action] = 1.0
        return best_action, policy
    else:
        # Sample proportional to N(s,a)^(1/tau)
        actions = list(node.children.keys())
        visits = torch.tensor(
            [node.children[a]["visit_count"] for a in actions], dtype=torch.float32
        )
        if visits.sum() == 0:
            # No visits — uniform random
            idx = np.random.randint(len(actions))
            policy = torch.zeros(ACTION_SIZE, dtype=torch.float32)
            policy[actions[idx]] = 1.0
            return actions[idx], policy

        probs = visits ** (1.0 / temperature)
        probs = probs / probs.sum()
        idx = np.random.choice(len(actions), p=probs.numpy())

        # Build full policy (normalized visit counts, NOT the temperature-adjusted probs)
        policy = get_mcts_policy(node)
        return actions[idx], policy


def mcts_search(
    state: GameState,
    eval_fn: Callable[[GameState], tuple[torch.Tensor, float]],
    num_simulations: int = 50,
    c_puct: float = 1.5,
    temperature: float = 1.0,
    dirichlet_alpha: float = 0.8,
    dirichlet_epsilon: float = 0.25,
) -> tuple[int | None, torch.Tensor]:
    """Run MCTS from a root state, return (best_action, mcts_policy).

    Args:
        state: The root game state.
        eval_fn: Callable(GameState) -> (policy_prior [ACTION_SIZE], value float).
            Policy prior is a probability distribution over actions.
            Value is from the perspective of the current player at the state.
        num_simulations: Number of MCTS simulations to run.
        c_puct: Exploration constant for PUCT formula.
        temperature: Temperature for move selection (0 = greedy, 1 = proportional).
        dirichlet_alpha: Alpha parameter for Dirichlet noise at root.
        dirichlet_epsilon: Mixing weight for Dirichlet noise (0 = no noise).

    Returns:
        (action_index, policy_tensor) where action_index is the selected move
        and policy_tensor is the MCTS visit count distribution.
        Returns (None, zeros) for terminal states.
    """
    if is_terminal(state) or not legal_moves(state):
        return None, torch.zeros(ACTION_SIZE, dtype=torch.float32)

    root = MCTSNode(state)

    # Evaluate root and expand
    policy_prior, _ = eval_fn(state)
    root.expand(policy_prior)

    # Add Dirichlet noise to root for exploration
    if dirichlet_epsilon > 0:
        root.add_dirichlet_noise(alpha=dirichlet_alpha, epsilon=dirichlet_epsilon)

    for _ in range(num_simulations):
        node = root
        search_path: list[MCTSNode] = [node]

        # Selection: walk down tree using PUCT
        while not node.is_leaf():
            action = node.select_action(c_puct)
            child_info = node.children[action]

            if child_info["node"] is None:
                # Create child node
                move = action_to_move(action)
                child_state = apply_move(node.state, move)
                child = MCTSNode(child_state, parent=node, parent_action=action)
                child_info["node"] = child
                node = child
                search_path.append(node)
                break
            else:
                node = child_info["node"]
                search_path.append(node)

        # Evaluate leaf
        if is_terminal(node.state):
            # Terminal: use game reward from the node's player perspective
            value = reward(node.state, node.state.current_player)
        else:
            if node.is_leaf():
                # Expand and evaluate
                p, value = eval_fn(node.state)
                node.expand(p)
            else:
                # This shouldn't happen in normal flow
                value = 0.0

        # Backpropagate
        node.backpropagate(value)

    return select_move(root, temperature)
