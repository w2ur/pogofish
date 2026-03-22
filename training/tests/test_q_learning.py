"""Tests for Q-learning."""

import pytest

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move, is_terminal, reward,
)
from pogofish.minimax import solve
from pogofish.q_learning import QTable, play_episode, train, evaluate


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


# ---------------------------------------------------------------------------
# 4. Single episode
# ---------------------------------------------------------------------------


def test_play_episode_returns_valid_game():
    """A single episode produces a valid game record."""
    qt = QTable()
    game = play_episode(qt, epsilon=1.0, alpha=0.1, gamma=0.99, max_moves=50, record=True)
    assert len(game["moves"]) > 0
    assert game["result"] in ("W_wins", "R_wins", "draw")
    assert game["num_moves"] == len(game["moves"])


def test_play_episode_no_record():
    """Without record=True, moves list is empty but num_moves is tracked."""
    qt = QTable()
    game = play_episode(qt, epsilon=1.0, alpha=0.1, gamma=0.99, max_moves=50)
    assert game["moves"] == []
    assert game["num_moves"] > 0


def test_play_episode_updates_qtable():
    """Playing an episode should populate the Q-table."""
    qt = QTable()
    assert len(qt) == 0
    play_episode(qt, epsilon=1.0, alpha=0.1, gamma=0.99, max_moves=50)
    assert len(qt) > 0


def test_play_episode_respects_max_moves():
    """Games should not exceed max_moves."""
    qt = QTable()
    game = play_episode(qt, epsilon=1.0, alpha=0.1, gamma=0.99, max_moves=10)
    assert game["num_moves"] <= 10


# ---------------------------------------------------------------------------
# 5. Training loop
# ---------------------------------------------------------------------------


def test_train_short_run():
    """Short training run produces expected artifacts."""
    result = train(
        episodes=100,
        eval_interval=50,
        minimax_table=None,
        max_moves=50,
    )
    assert result["q_table"] is not None
    assert len(result["training_log"]) >= 2
    assert len(result["sample_games"]) > 0
    first_episodes = [g["episode"] for g in result["sample_games"] if g["episode"] <= 10]
    assert len(first_episodes) == 10


# ---------------------------------------------------------------------------
# 6. Evaluation
# ---------------------------------------------------------------------------


def test_evaluate_empty_qtable():
    """Empty Q-table has 0% coverage and 0% accuracy."""
    qt = QTable()
    table = {}
    solve(SMALL_STATE, table)
    decisive = {s: r for s, r in table.items() if r.value != 0.0}
    assert len(decisive) > 0

    result = evaluate(qt, decisive)
    assert result["coverage"] == 0.0
    assert result["accuracy"] == 0.0
    assert result["value_agreement"] == 0.0


def test_evaluate_perfect_qtable():
    """Q-table with correct signs gets 100% accuracy on covered states."""
    qt = QTable()
    table = {}
    solve(SMALL_STATE, table)
    decisive = {s: r for s, r in table.items() if r.value != 0.0}

    for state, solve_result in decisive.items():
        if solve_result.best_move is not None:
            qt.set_value(state, solve_result.best_move, solve_result.value)

    result = evaluate(qt, decisive)
    assert result["coverage"] == 1.0
    assert result["accuracy"] == 1.0
    assert result["value_agreement"] == 1.0
