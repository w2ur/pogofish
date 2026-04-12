"""Tests for state and move encoding."""

from pogofish.engine import GameState, Move, W, R, initial_state
from pogofish.encoding import state_to_key, key_to_state, move_to_key, key_to_move


def test_state_to_key_initial():
    """Initial state encodes to the expected string."""
    state = initial_state()
    key = state_to_key(state)
    assert key == "WW/WW/WW////RR/RR/RR:W"


def test_state_roundtrip():
    """state_to_key → key_to_state is identity."""
    state = initial_state()
    assert key_to_state(state_to_key(state)) == state


def test_state_roundtrip_complex():
    """Roundtrip with mixed stacks."""
    board = (("W", "R"), ("W",), ("R",), (), ("W",), (), ("R",), (), ())
    state = GameState(board=board, current_player=R)
    assert key_to_state(state_to_key(state)) == state


def test_move_to_key():
    """Move encodes to comma-separated string."""
    move = Move(from_cell=0, num_pieces=1, to_cell=3)
    assert move_to_key(move) == "0,1,3"


def test_move_roundtrip():
    """move_to_key → key_to_move is identity."""
    move = Move(from_cell=6, num_pieces=3, to_cell=7)
    assert key_to_move(move_to_key(move)) == move
