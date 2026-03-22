"""
Tabular Q-learning for Pogo.

Memory-optimized: uses native GameState/Move tuple keys (hashable NamedTuples)
instead of string encoding. String conversion happens only at export time.

Two-player Q-update: Q[s][a] += α * (r - γ * max(Q[s']) - Q[s][a])
The negation (-γ instead of +γ) accounts for the opponent's turn at s'.
"""

from __future__ import annotations

import random

from pogofish.engine import GameState, Move, legal_moves, is_terminal


class QTable:
    """
    Tabular Q-function for Pogo.

    Keys are native GameState and Move NamedTuples (hashable, memory-efficient).
    No string conversion during training — only at export time.
    """

    def __init__(self) -> None:
        # GameState → {Move → Q-value}
        self._table: dict[GameState, dict[Move, float]] = {}

    def __len__(self) -> int:
        return len(self._table)

    def __contains__(self, state: GameState) -> bool:
        return state in self._table

    def get_value(self, state: GameState, move: Move) -> float:
        """Get Q(s, a). Returns 0.0 for unvisited pairs."""
        state_entry = self._table.get(state)
        if state_entry is None:
            return 0.0
        return state_entry.get(move, 0.0)

    def set_value(self, state: GameState, move: Move, value: float) -> None:
        """Set Q(s, a)."""
        if state not in self._table:
            self._table[state] = {}
        self._table[state][move] = value

    def best_value(self, state: GameState, moves: list[Move]) -> float:
        """Return max Q-value among the given moves. Returns 0.0 if none visited."""
        state_entry = self._table.get(state)
        if state_entry is None:
            return 0.0
        return max((state_entry.get(m, 0.0) for m in moves), default=0.0)

    def epsilon_greedy(
        self, state: GameState, moves: list[Move], epsilon: float
    ) -> Move:
        """Pick a move using epsilon-greedy policy."""
        if random.random() < epsilon:
            return random.choice(moves)
        # Greedy: pick the move with highest Q-value (random tiebreak).
        state_entry = self._table.get(state, {})
        best_val = max((state_entry.get(m, 0.0) for m in moves), default=0.0)
        best_moves = [m for m in moves if state_entry.get(m, 0.0) == best_val]
        return random.choice(best_moves)

    def update(
        self,
        state: GameState,
        move: Move,
        reward: float,
        next_state: GameState,
        alpha: float,
        gamma: float,
    ) -> None:
        """
        Two-player Q-update with negation.

        Target = r - γ * max(Q[s']) for non-terminal s'.
        The negation is because s' is the opponent's turn —
        their best outcome is our worst.
        """
        if state not in self._table:
            self._table[state] = {}
        old_q = self._table[state].get(move, 0.0)

        if is_terminal(next_state):
            target = reward
        else:
            next_moves = legal_moves(next_state)
            if not next_moves:
                # Opponent stuck = we effectively won.
                target = reward
            else:
                max_next = self.best_value(next_state, next_moves)
                target = reward - gamma * max_next

        self._table[state][move] = old_q + alpha * (target - old_q)
