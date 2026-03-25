"""Tests for DQN state/action encoding."""

import torch
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
)
from pogofish.dqn import encode_state, legal_move_mask, action_to_move, move_to_action


def test_encode_state_shape() -> None:
    state = initial_state()
    t = encode_state(state)
    assert t.shape == (109,)
    assert t.dtype == torch.float32


def test_encode_state_initial_values() -> None:
    state = initial_state()
    t = encode_state(state)
    assert t[0] == 1.0   # Cell 0, depth 0: W
    assert t[1] == 1.0   # Cell 0, depth 1: W
    assert t[2] == 0.0   # Cell 0, depth 2: empty
    assert t[72] == -1.0  # Cell 6 (6*12=72), depth 0: R
    assert t[73] == -1.0  # Cell 6, depth 1: R
    assert t[74] == 0.0
    assert t[108] == 1.0  # Current player: White


def test_encode_state_preserves_stack_order() -> None:
    board = (("W", "R", "W"),) + ((),) * 8
    state = GameState(board=board, current_player=W)
    t = encode_state(state)
    assert t[0] == 1.0   # W at bottom
    assert t[1] == -1.0  # R in middle
    assert t[2] == 1.0   # W on top
    assert t[3] == 0.0


def test_encode_state_full_stack() -> None:
    full_stack = ("W", "R") * 6
    board = (full_stack,) + ((),) * 8
    state = GameState(board=board, current_player=R)
    t = encode_state(state)
    for i in range(12):
        assert t[i] != 0.0
    assert t[108] == -1.0


def test_move_to_action_roundtrip() -> None:
    move = Move(from_cell=2, num_pieces=3, to_cell=7)
    idx = move_to_action(move)
    recovered = action_to_move(idx)
    assert recovered == move


def test_action_range() -> None:
    for fc in range(9):
        for np in range(1, 4):
            for tc in range(9):
                idx = move_to_action(Move(fc, np, tc))
                assert 0 <= idx < 243


def test_legal_move_mask_shape() -> None:
    state = initial_state()
    mask = legal_move_mask(state)
    assert mask.shape == (243,)
    assert mask.dtype == torch.bool


def test_legal_move_mask_count() -> None:
    state = initial_state()
    mask = legal_move_mask(state)
    assert mask.sum().item() == len(legal_moves(state))


def test_legal_move_mask_consistency() -> None:
    state = initial_state()
    mask = legal_move_mask(state)
    for move in legal_moves(state):
        idx = move_to_action(move)
        assert mask[idx], f"Legal move {move} not in mask at index {idx}"
