"""
Pogo game engine.

Board: 3x3 grid, cells indexed 0-8 row-major.
  Cell i is at row i // 3, col i % 3.
  Row 0 (cells 0,1,2): top row
  Row 2 (cells 6,7,8): bottom row

Pieces: W (White) and R (Red).
Each cell holds a stack of pieces (tuple), bottom to top.
White moves first.

Move rules:
  - Pick 1, 2, or 3 pieces from the top of a source cell.
  - The top piece of the stack must belong to the current player.
    If it does, any number (1-3) can be picked regardless of colors below.
  - Destination distance (Manhattan) depends on piece count:
      1 piece  → d = 1
      2 pieces → d = 2
      3 pieces → d = 1 or d = 3
  - Cannot move to the same cell.

Win condition: one player's piece is on top of every non-empty cell.
"""

from __future__ import annotations

from typing import NamedTuple

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

W = "W"  # White
R = "R"  # Red

BOARD_SIZE = 3  # 3x3 grid; total cells = BOARD_SIZE * BOARD_SIZE

# Valid move distances for each pickup count.
_DISTANCES: dict[int, tuple[int, ...]] = {
    1: (1,),
    2: (2,),
    3: (1, 3),
}


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

# A cell is a tuple of pieces from bottom to top.
Cell = tuple[str, ...]

# A board is a tuple of 9 cells.
Board = tuple[Cell, ...]


class GameState(NamedTuple):
    """Immutable, hashable snapshot of the game."""

    board: Board
    current_player: str  # W or R


class Move(NamedTuple):
    """A single move: pick num_pieces from from_cell and place them on to_cell."""

    from_cell: int
    num_pieces: int
    to_cell: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _opponent(player: str) -> str:
    return R if player == W else W


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def initial_state() -> GameState:
    """
    Return the starting position.
    Row 0 (cells 0-2): two White pieces each.
    Row 1 (cells 3-5): empty.
    Row 2 (cells 6-8): two Red pieces each.
    White moves first.
    """
    board: list[Cell] = []
    for i in range(BOARD_SIZE * BOARD_SIZE):
        row = i // BOARD_SIZE
        if row == 0:
            board.append((W, W))
        elif row == 2:
            board.append((R, R))
        else:
            board.append(())
    return GameState(board=tuple(board), current_player=W)


def manhattan_distance(cell_a: int, cell_b: int) -> int:
    """Manhattan distance between two cells on the BOARD_SIZE x BOARD_SIZE grid."""
    row_a, col_a = divmod(cell_a, BOARD_SIZE)
    row_b, col_b = divmod(cell_b, BOARD_SIZE)
    return abs(row_a - row_b) + abs(col_a - col_b)


def legal_moves(state: GameState) -> list[Move]:
    """
    Return all legal moves for the current player.

    A move is legal when:
    - The top piece of the source cell belongs to the current player.
    - The source cell has at least num_pieces pieces.
    - The destination cell is at the correct Manhattan distance.
    - from_cell != to_cell.
    """
    player = state.current_player
    board = state.board
    total_cells = BOARD_SIZE * BOARD_SIZE
    moves: list[Move] = []

    for from_cell in range(total_cells):
        stack = board[from_cell]
        if not stack:
            continue

        # The top piece of the stack must be the current player's color.
        # If it is, the player can pick 1, 2, or 3 pieces from the top
        # regardless of the colors below.
        if stack[-1] != player:
            continue

        for num_pieces in (1, 2, 3):
            if len(stack) < num_pieces:
                continue

            for required_dist in _DISTANCES[num_pieces]:
                for to_cell in range(total_cells):
                    if to_cell == from_cell:
                        continue
                    if manhattan_distance(from_cell, to_cell) == required_dist:
                        moves.append(Move(from_cell=from_cell, num_pieces=num_pieces, to_cell=to_cell))

    return moves


def apply_move(state: GameState, move: Move) -> GameState:
    """
    Apply a move and return the resulting GameState.

    Pieces are removed from the top of from_cell and placed on top of to_cell,
    preserving their internal order.
    """
    board = list(state.board)

    from_stack = board[move.from_cell]
    to_stack = board[move.to_cell]

    # The picked group: top num_pieces pieces, in original bottom-to-top order.
    picked = from_stack[-move.num_pieces:]
    remaining = from_stack[: -move.num_pieces]

    board[move.from_cell] = remaining
    board[move.to_cell] = to_stack + picked

    return GameState(board=tuple(board), current_player=_opponent(state.current_player))


def is_terminal(state: GameState) -> bool:
    """
    Return True when the game is over.

    The game ends when one player's piece sits on top of every non-empty cell.
    There must be at least one non-empty cell.
    """
    non_empty = [cell for cell in state.board if cell]
    if not non_empty:
        return False
    top_pieces = {cell[-1] for cell in non_empty}
    return len(top_pieces) == 1


def winner(state: GameState) -> str | None:
    """Return the winning player, or None if the game is not over."""
    if not is_terminal(state):
        return None
    non_empty = [cell for cell in state.board if cell]
    return non_empty[0][-1]


def reward(state: GameState, player: str) -> float:
    """
    Return the reward for the given player in the current state.
    +1.0 if player wins, -1.0 if player loses, 0.0 if not terminal.
    """
    w = winner(state)
    if w is None:
        return 0.0
    return 1.0 if w == player else -1.0
