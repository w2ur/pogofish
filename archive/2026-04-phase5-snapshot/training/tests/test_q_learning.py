"""Tests for Q-learning."""

import gzip
import json
from pathlib import Path

import pytest

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move, is_terminal, reward,
)
from pogofish.minimax import solve
from pogofish.q_learning import QTable, play_episode, train, evaluate, export_q_table, load_q_table


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

    # For a "perfect" Q-table, ALL moves in a position must have the correct
    # sign (positive for winning, negative for losing). This simulates a
    # converged Q-table where best_value returns the correct sign.
    for state, solve_result in decisive.items():
        moves = legal_moves(state)
        for m in moves:
            qt.set_value(state, m, solve_result.value)

    result = evaluate(qt, decisive)
    assert result["coverage"] == 1.0
    assert result["accuracy"] == 1.0
    assert result["value_agreement"] == 1.0


# ---------------------------------------------------------------------------
# 7. Export / Import
# ---------------------------------------------------------------------------


def test_export_and_load_roundtrip(tmp_path):
    """Export Q-table and load it back — values must match."""
    qt = QTable()
    state = initial_state()
    moves = legal_moves(state)
    qt.set_value(state, moves[0], 0.42)
    qt.set_value(state, moves[1], -0.3)

    path = tmp_path / "q_table.json.gz"
    meta = {"episode": 100, "value_agreement": 0.5}
    export_q_table(qt, path, meta)
    assert path.exists()

    loaded_qt, loaded_meta = load_q_table(path)
    assert loaded_meta["episode"] == 100
    assert loaded_qt.get_value(state, moves[0]) == pytest.approx(0.42)
    assert loaded_qt.get_value(state, moves[1]) == pytest.approx(-0.3)


def test_export_is_compressed(tmp_path):
    """Exported file should be gzip-compressed."""
    qt = QTable()
    state = initial_state()
    for m in legal_moves(state):
        qt.set_value(state, m, 0.1)

    path = tmp_path / "q_table.json.gz"
    export_q_table(qt, path)

    with gzip.open(path, "rt") as f:
        data = json.load(f)
    assert "q_table" in data


# ---------------------------------------------------------------------------
# 8. Integration (slow)
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_training_shows_learning_signal():
    """
    Train for 1000 episodes with minimax eval on a small table.
    Verify that value agreement improves from the random baseline.
    """
    minimax = {}
    solve(SMALL_STATE, minimax)
    decisive = {s: r for s, r in minimax.items() if r.value != 0.0}
    assert len(decisive) > 0

    result = train(
        episodes=1000,
        eval_interval=200,
        minimax_table=decisive,
        max_moves=50,
        patience=100,  # Don't early stop
        start_state=SMALL_STATE,
    )

    log = result["training_log"]
    assert len(log) >= 4

    first_agreement = log[0]["value_agreement"]
    last_agreement = log[-1]["value_agreement"]
    assert last_agreement > first_agreement or last_agreement > 0.3, (
        f"No learning signal: first={first_agreement:.3f}, last={last_agreement:.3f}"
    )

    assert len(result["sample_games"]) >= 10


@pytest.mark.slow
def test_export_full_run(tmp_path):
    """Train with export and verify all artifacts are created."""
    output_dir = str(tmp_path / "q_learning")

    train(
        episodes=200,
        eval_interval=100,
        snapshot_interval=100,
        minimax_table=None,
        output_dir=output_dir,
        max_moves=50,
    )

    out = Path(output_dir)
    assert (out / "q_table_final.json.gz").exists()
    assert (out / "training_log.json").exists()
    assert (out / "sample_games.json").exists()
    assert (out / "q_table_checkpoint_100.json.gz").exists()

    qt, meta = load_q_table(out / "q_table_final.json.gz")
    assert len(qt) > 0
