"""
Tests for the minimax solver (negamax with alpha-beta pruning).

Note: full_solve from the initial state takes ~1 hour at default MAX_PLY.
Tests marked @pytest.mark.slow require --runslow to run.
Fast tests use small mid-game positions that solve in <1s.
"""

import pytest

from pogofish.engine import (
    W,
    R,
    GameState,
    Move,
    initial_state,
    legal_moves,
    apply_move,
    is_terminal,
    winner,
)
from pogofish.minimax import (
    solve,
    best_move,
    full_solve,
    export_table,
    load_table,
    SolveResult,
    MAX_PLY,
)



# ---------------------------------------------------------------------------
# Fixtures: small solvable positions for fast tests
# ---------------------------------------------------------------------------

# Near-endgame: only 4 pieces on the board, solves instantly.
SMALL_BOARD = ((W,), (W,), (R,), (), (), (W,), (), (), ())
SMALL_STATE = GameState(board=SMALL_BOARD, current_player=W)

# Mid-game: 6 pieces spread around, solves in <1s.
MID_BOARD = ((W, R), (W,), (R,), (), (W,), (), (R,), (), ())
MID_STATE = GameState(board=MID_BOARD, current_player=W)


# ---------------------------------------------------------------------------
# 1. Terminal state evaluation
# ---------------------------------------------------------------------------


def test_solve_terminal_win() -> None:
    """Terminal state where White controls everything — Red's turn → value -1."""
    board = ((W,), (W,), (W,), (), (), (), (), (), ())
    state = GameState(board=board, current_player=R)
    assert is_terminal(state)
    result = solve(state)
    assert result.value == -1.0
    assert result.best_move is None


def test_solve_terminal_loss() -> None:
    """Terminal state from the winner's perspective → value = +1."""
    board = ((W,), (W,), (W,), (), (), (), (), (), ())
    state = GameState(board=board, current_player=W)
    assert is_terminal(state)
    result = solve(state)
    assert result.value == 1.0


# ---------------------------------------------------------------------------
# 2. Near-terminal positions
# ---------------------------------------------------------------------------


def test_one_move_to_win() -> None:
    """If the current player can win in one move, solve returns +1."""
    result = solve(SMALL_STATE)
    assert result.value == 1.0
    assert result.best_move is not None

    next_state = apply_move(SMALL_STATE, result.best_move)
    assert is_terminal(next_state)
    assert winner(next_state) == W


def test_best_move_returns_winning_move() -> None:
    """best_move() returns a move leading to immediate win."""
    move = best_move(SMALL_STATE)
    next_state = apply_move(SMALL_STATE, move)
    assert is_terminal(next_state)
    assert winner(next_state) == W


# ---------------------------------------------------------------------------
# 3. Consistency checks (on small positions)
# ---------------------------------------------------------------------------


def test_solve_is_deterministic() -> None:
    """Multiple calls to solve return the same value."""
    r1 = solve(MID_STATE)
    r2 = solve(MID_STATE)
    assert r1.value == r2.value


def test_solve_uses_memoization() -> None:
    """Solve with a shared table avoids recomputation."""
    table: dict[GameState, SolveResult] = {}
    solve(MID_STATE, table)
    size_after_first = len(table)
    assert size_after_first > 0

    solve(MID_STATE, table)
    assert len(table) == size_after_first


def test_negamax_symmetry() -> None:
    """The value is the negation of the best child's value."""
    table: dict[GameState, SolveResult] = {}
    result = solve(MID_STATE, table)

    if result.best_move is not None:
        child = apply_move(MID_STATE, result.best_move)
        child_result = solve(child, table)
        assert result.value == -child_result.value


def test_value_range() -> None:
    """All solved values are in {-1, 0, +1}."""
    table: dict[GameState, SolveResult] = {}
    solve(MID_STATE, table)

    for state, result in table.items():
        assert result.value in (1.0, -1.0, 0.0)


def test_non_terminal_has_best_move() -> None:
    """Non-terminal states with legal moves must have a best_move."""
    table: dict[GameState, SolveResult] = {}
    solve(MID_STATE, table)

    for state, result in table.items():
        if not is_terminal(state) and legal_moves(state):
            assert result.best_move is not None
            assert result.best_move in legal_moves(state)


# ---------------------------------------------------------------------------
# 4. Export / import
# ---------------------------------------------------------------------------


def test_export_and_load_roundtrip(tmp_path) -> None:
    """Export a table and load it back — values must match."""
    table: dict[GameState, SolveResult] = {}
    solve(SMALL_STATE, table)
    assert len(table) > 0

    path = tmp_path / "test_table.json.gz"
    export_table(table, path)
    assert path.exists()

    loaded_table, meta = load_table(path)
    assert meta["unique_states"] == len(table)
    assert len(loaded_table) == len(table)

    for state, result in table.items():
        assert state in loaded_table
        loaded = loaded_table[state]
        assert loaded.value == result.value
        assert loaded.best_move == result.best_move


def test_export_file_is_compressed(tmp_path) -> None:
    """Exported file should be gzip-compressed."""
    import json

    table: dict[GameState, SolveResult] = {}
    solve(SMALL_STATE, table)

    path = tmp_path / "test_table.json.gz"
    export_table(table, path)

    compressed_size = path.stat().st_size
    raw_json = json.dumps({str(k): str(v) for k, v in table.items()})
    assert compressed_size < len(raw_json.encode())


# ---------------------------------------------------------------------------
# 5. Full solve from initial state (SLOW — requires --runslow)
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_full_solve_completes() -> None:
    """Full solve discovers the game-theoretic value."""
    table, stats = full_solve()

    assert stats.unique_states > 100

    state = initial_state()
    assert state in table

    value = table[state].value
    assert value in (1.0, -1.0, 0.0)

    print(f"\n--- Full Solve Results ---")
    label = {1.0: "White wins", -1.0: "Red wins", 0.0: "Draw"}
    print(f"Value: {label[value]} ({value:+.0f})")
    print(f"States: {stats.unique_states:,}")
    print(f"Time: {stats.elapsed_seconds:.1f}s")
    print(f"Depth limit: {MAX_PLY}")


@pytest.mark.slow
def test_best_move_consistency() -> None:
    """For states with a best_move, the move leads to the negated child value."""
    table, _ = full_solve()

    checked = 0
    for state, result in table.items():
        if result.best_move is None:
            continue
        child = apply_move(state, result.best_move)
        if child in table:
            child_result = table[child]
            assert result.value == -child_result.value
            checked += 1

    assert checked > 100
    print(f"\nVerified {checked:,} state→child consistencies.")
