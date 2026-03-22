"""Tests for Q-learning."""

import pytest

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move, is_terminal, reward,
)
from pogofish.q_learning import QTable


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

# Near-endgame: White can win in 1 move (W on cells 0,1 — move to cell 2 with R).
SMALL_BOARD = ((W,), (W,), (R,), (), (), (W,), (), (), ())
SMALL_STATE = GameState(board=SMALL_BOARD, current_player=W)


# ---------------------------------------------------------------------------
# 1. QTable basics
# ---------------------------------------------------------------------------


def test_qtable_default_value():
    """Unvisited state-action pairs return 0.0."""
    qt = QTable()
    state = initial_state()
    moves = legal_moves(state)
    assert qt.get_value(state, moves[0]) == 0.0


def test_qtable_set_and_get():
    """Setting a Q-value and retrieving it."""
    qt = QTable()
    state = initial_state()
    move = legal_moves(state)[0]
    qt.set_value(state, move, 0.5)
    assert qt.get_value(state, move) == 0.5


def test_qtable_best_value_unvisited():
    """Best value for unvisited state is 0.0."""
    qt = QTable()
    state = initial_state()
    moves = legal_moves(state)
    assert qt.best_value(state, moves) == 0.0


def test_qtable_best_value():
    """Best value picks the maximum Q-value among given moves."""
    qt = QTable()
    state = initial_state()
    moves = legal_moves(state)
    qt.set_value(state, moves[0], -0.3)
    qt.set_value(state, moves[1], 0.7)
    assert qt.best_value(state, moves) == 0.7


def test_qtable_size():
    """Size tracks number of state entries."""
    qt = QTable()
    assert len(qt) == 0
    state = initial_state()
    move = legal_moves(state)[0]
    qt.set_value(state, move, 1.0)
    assert len(qt) == 1


# ---------------------------------------------------------------------------
# 2. Epsilon-greedy
# ---------------------------------------------------------------------------


def test_epsilon_greedy_full_exploration():
    """With epsilon=1.0, all moves should be possible (statistical test)."""
    qt = QTable()
    state = initial_state()
    moves = legal_moves(state)
    qt.set_value(state, moves[0], 100.0)
    chosen = {qt.epsilon_greedy(state, moves, epsilon=1.0) for _ in range(200)}
    assert len(chosen) > 1


def test_epsilon_greedy_full_exploitation():
    """With epsilon=0.0, always pick the best move."""
    qt = QTable()
    state = initial_state()
    moves = legal_moves(state)
    qt.set_value(state, moves[2], 0.9)
    for _ in range(50):
        assert qt.epsilon_greedy(state, moves, epsilon=0.0) == moves[2]


# ---------------------------------------------------------------------------
# 3. Q-update (two-player negation)
# ---------------------------------------------------------------------------


def test_q_update_terminal_win():
    """After a winning move, Q-value increases toward +1."""
    qt = QTable()
    state = SMALL_STATE
    moves = legal_moves(state)
    winning_move = None
    for m in moves:
        s_prime = apply_move(state, m)
        if is_terminal(s_prime) and reward(s_prime, state.current_player) == 1.0:
            winning_move = m
            break
    assert winning_move is not None

    s_prime = apply_move(state, winning_move)
    r = reward(s_prime, state.current_player)
    qt.update(state, winning_move, r, s_prime, alpha=0.1, gamma=0.99)
    assert qt.get_value(state, winning_move) > 0.0


def test_q_update_nonterminal_negation():
    """
    For non-terminal states, update uses -gamma * max(Q[s']).
    If opponent's best Q-value in s' is 0.5, our update target should be
    r - gamma * 0.5.
    """
    qt = QTable()
    state = initial_state()
    moves = legal_moves(state)
    move = moves[0]

    s_prime = apply_move(state, move)
    s_prime_moves = legal_moves(s_prime)

    qt.set_value(s_prime, s_prime_moves[0], 0.5)

    r = 0.0
    qt.update(state, move, r, s_prime, alpha=0.1, gamma=0.99)

    # Target = r - gamma * max(Q[s']) = 0 - 0.99 * 0.5 = -0.495
    # Q = 0 + 0.1 * (-0.495 - 0) = -0.0495
    expected = 0.1 * (0.0 - 0.99 * 0.5)
    assert abs(qt.get_value(state, move) - expected) < 1e-9
