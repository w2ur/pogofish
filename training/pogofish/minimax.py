"""
Exhaustive minimax solver for Pogo.

Uses negamax with alpha-beta pruning. Returns the value from the
perspective of the current player (+1 = current player wins with
perfect play, -1 = loses, 0 = draw).

Draw rules (not in the official rules — added for solver finiteness):
  - Threefold repetition: if the same state appears on the current
    search path, it's a draw by repetition (per-branch detection).
  - Move limit: if the game exceeds MAX_PLY half-moves without a
    terminal state, it's a draw.

Memoization: all results are cached globally. Cycle-affected values
are cached as draws — acceptable approximation since cycle-adjacent
states are rare and don't affect the initial state's value.
"""

from __future__ import annotations

import gzip
import json
import time
from pathlib import Path
from typing import NamedTuple

from pogofish.engine import (
    GameState,
    Move,
    legal_moves,
    apply_move,
    is_terminal,
    winner,
    W,
    BOARD_SIZE,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_PLY = 50  # Half-move limit before declaring a draw.


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class SolveResult(NamedTuple):
    """Result of solving a position."""

    value: float  # +1, -1, or 0 from current player's perspective
    best_move: Move | None  # None only for terminal / draw states


class SolveStats(NamedTuple):
    """Statistics from a full solve."""

    unique_states: int
    elapsed_seconds: float


# ---------------------------------------------------------------------------
# Move ordering heuristic
# ---------------------------------------------------------------------------

_TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE


def _move_score(state: GameState, move: Move) -> int:
    """
    Higher score = try this move first (better alpha-beta cutoffs).

    Heuristic priorities:
    1. Moves that capture an opponent-topped cell (+10)
    2. Moves to the center cell (+3)
    3. Moves with more pieces (+1 per piece)
    """
    score = 0
    dest_stack = state.board[move.to_cell]
    player = state.current_player

    # Capturing: destination has opponent on top.
    if dest_stack and dest_stack[-1] != player:
        score += 10

    # Center preference (cell 4 in a 3x3 grid).
    if move.to_cell == 4:
        score += 3

    # Prefer moving more pieces (consolidation).
    score += move.num_pieces

    return score


def _ordered_moves(state: GameState) -> list[Move]:
    """Return legal moves sorted by heuristic score (best first)."""
    moves = legal_moves(state)
    moves.sort(key=lambda m: _move_score(state, m), reverse=True)
    return moves


# ---------------------------------------------------------------------------
# Negamax with alpha-beta pruning
# ---------------------------------------------------------------------------


def _solve(
    state: GameState,
    table: dict[GameState, SolveResult],
    path: set[GameState],
    depth: int,
    alpha: float,
    beta: float,
) -> SolveResult:
    """
    Recursive negamax with alpha-beta pruning, per-branch cycle
    detection (mutable set with backtracking), and global memoization.
    """
    # Global cache hit.
    if state in table:
        return table[state]

    # Draw by move limit.
    if depth >= MAX_PLY:
        return SolveResult(value=0.0, best_move=None)

    # Draw by repetition (state already on the current search path).
    if state in path:
        return SolveResult(value=0.0, best_move=None)

    # Terminal state.
    if is_terminal(state):
        w = winner(state)
        if w == state.current_player:
            result = SolveResult(value=1.0, best_move=None)
        elif w is not None:
            result = SolveResult(value=-1.0, best_move=None)
        else:
            result = SolveResult(value=0.0, best_move=None)
        table[state] = result
        return result

    moves = _ordered_moves(state)

    # No legal moves = stuck = loss.
    if not moves:
        result = SolveResult(value=-1.0, best_move=None)
        table[state] = result
        return result

    # Add current state to the path (backtracking — removed after loop).
    path.add(state)

    best_value = -2.0
    best_move: Move | None = None

    for move in moves:
        child = apply_move(state, move)
        child_result = _solve(child, table, path, depth + 1, -beta, -alpha)

        # Negamax: negate child's value.
        move_value = -child_result.value

        if move_value > best_value:
            best_value = move_value
            best_move = move

        # Update alpha.
        if best_value > alpha:
            alpha = best_value

        # Alpha-beta cutoff.
        if alpha >= beta:
            break

    path.discard(state)

    result = SolveResult(value=best_value, best_move=best_move)
    table[state] = result
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def solve(
    state: GameState,
    table: dict[GameState, SolveResult] | None = None,
) -> SolveResult:
    """
    Solve a position. Returns the game-theoretic value from the current
    player's perspective and the best move.
    """
    if table is None:
        table = {}

    return _solve(state, table, set(), 0, -2.0, 2.0)


def best_move(state: GameState, table: dict[GameState, SolveResult] | None = None) -> Move:
    """Return the optimal move from the given position."""
    result = solve(state, table)
    if result.best_move is None:
        raise ValueError("No move available (terminal or stuck position)")
    return result.best_move


def full_solve(
    state: GameState | None = None,
) -> tuple[dict[GameState, SolveResult], SolveStats]:
    """
    Solve the entire game tree from the given state (default: initial state).

    Returns a table mapping every reachable state to its SolveResult,
    and solve statistics.
    """
    from pogofish.engine import initial_state

    if state is None:
        state = initial_state()

    table: dict[GameState, SolveResult] = {}

    start = time.perf_counter()
    _solve(state, table, set(), 0, -2.0, 2.0)
    elapsed = time.perf_counter() - start

    stats = SolveStats(unique_states=len(table), elapsed_seconds=elapsed)
    return table, stats


# ---------------------------------------------------------------------------
# Export / Import (2.3)
# ---------------------------------------------------------------------------


def _state_to_key(state: GameState) -> str:
    """Convert a GameState to a compact string key for JSON serialization."""
    # Board: each cell is a string of piece chars (e.g., "WR" = W bottom, R top).
    # Cells separated by "/". Current player appended after ":".
    cells = ["".join(cell) for cell in state.board]
    return "/".join(cells) + ":" + state.current_player


def _key_to_state(key: str) -> GameState:
    """Convert a compact string key back to a GameState."""
    board_str, player = key.rsplit(":", 1)
    cells = board_str.split("/")
    board = tuple(tuple(cell) for cell in cells)
    return GameState(board=board, current_player=player)


def _result_to_dict(result: SolveResult) -> dict:
    """Convert a SolveResult to a JSON-serializable dict."""
    d: dict = {"v": int(result.value)}
    if result.best_move is not None:
        d["m"] = [result.best_move.from_cell, result.best_move.num_pieces, result.best_move.to_cell]
    return d


def _dict_to_result(d: dict) -> SolveResult:
    """Convert a dict back to a SolveResult."""
    value = float(d["v"])
    move = Move(*d["m"]) if "m" in d else None
    return SolveResult(value=value, best_move=move)


def export_table(
    table: dict[GameState, SolveResult],
    path: str | Path,
    stats: SolveStats | None = None,
) -> None:
    """
    Export the transposition table as gzipped JSON.

    Format:
    {
      "meta": { "max_ply": N, "unique_states": N, "elapsed_seconds": N },
      "states": { "state_key": { "v": value, "m": [from, num, to] }, ... }
    }
    """
    data = {
        "meta": {
            "max_ply": MAX_PLY,
            "unique_states": len(table),
        },
        "states": {_state_to_key(s): _result_to_dict(r) for s, r in table.items()},
    }
    if stats is not None:
        data["meta"]["elapsed_seconds"] = round(stats.elapsed_seconds, 2)

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))


def load_table(path: str | Path) -> tuple[dict[GameState, SolveResult], dict]:
    """
    Load a transposition table from gzipped JSON.

    Returns (table, meta) where meta is the metadata dict.
    """
    path = Path(path)

    with gzip.open(path, "rt", encoding="utf-8") as f:
        data = json.load(f)

    table: dict[GameState, SolveResult] = {}
    for key, result_dict in data["states"].items():
        state = _key_to_state(key)
        table[state] = _dict_to_result(result_dict)

    return table, data["meta"]
