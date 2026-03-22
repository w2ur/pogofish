"""
Shared encoding for GameState and Move to/from string keys.

State key format: "cell0/cell1/.../cell8:player"
  Each cell is the concatenated piece string bottom-to-top (e.g., "WR").
  Empty cell = "". Current player after ":".
  Example: "WW/WW/WW////RR/RR/RR:W"

Move key format: "from_cell,num_pieces,to_cell"
  Example: "0,1,3"
"""

from __future__ import annotations

from pogofish.engine import GameState, Move


def state_to_key(state: GameState) -> str:
    """Convert a GameState to a compact string key."""
    cells = ["".join(cell) for cell in state.board]
    return "/".join(cells) + ":" + state.current_player


def key_to_state(key: str) -> GameState:
    """Convert a compact string key back to a GameState."""
    board_str, player = key.rsplit(":", 1)
    cells = board_str.split("/")
    board = tuple(tuple(cell) for cell in cells)
    return GameState(board=board, current_player=player)


def move_to_key(move: Move) -> str:
    """Convert a Move to a compact string key."""
    return f"{move.from_cell},{move.num_pieces},{move.to_cell}"


def key_to_move(key: str) -> Move:
    """Convert a compact string key back to a Move."""
    parts = key.split(",")
    return Move(int(parts[0]), int(parts[1]), int(parts[2]))
