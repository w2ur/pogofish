"""Tests for DQN state/action encoding, model, and replay buffer."""

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
from pogofish.dqn import (
    DQNModel,
    ReplayBuffer,
    encode_state,
    legal_move_mask,
    action_to_move,
    move_to_action,
)


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


# ---------------------------------------------------------------------------
# DQNModel tests
# ---------------------------------------------------------------------------


def test_model_output_shape() -> None:
    model = DQNModel(hidden_layers=[64, 32])
    state = encode_state(initial_state())
    q_values = model(state.unsqueeze(0))
    assert q_values.shape == (1, 243)


def test_model_masked_action_selection() -> None:
    model = DQNModel(hidden_layers=[64, 32])
    state = initial_state()
    state_t = encode_state(state)
    mask = legal_move_mask(state)
    q_values = model(state_t.unsqueeze(0)).squeeze(0)
    q_values[~mask] = float("-inf")
    best_action = q_values.argmax().item()
    best_move = action_to_move(best_action)
    assert best_move in legal_moves(state)


def test_model_configurable_architecture() -> None:
    tiny = DQNModel(hidden_layers=[64, 32])
    medium = DQNModel(hidden_layers=[256, 128, 64])
    tiny_params = sum(p.numel() for p in tiny.parameters())
    medium_params = sum(p.numel() for p in medium.parameters())
    assert medium_params > tiny_params


# ---------------------------------------------------------------------------
# ReplayBuffer tests
# ---------------------------------------------------------------------------


def test_replay_buffer_add_and_sample() -> None:
    buf = ReplayBuffer(capacity=100)
    state = encode_state(initial_state())
    for i in range(10):
        buf.add(state, 0, 0.0, state, False)
    assert len(buf) == 10
    batch = buf.sample(5)
    assert batch[0].shape == (5, 109)


def test_replay_buffer_capacity() -> None:
    buf = ReplayBuffer(capacity=10)
    state = encode_state(initial_state())
    for i in range(20):
        buf.add(state, i, 0.0, state, False)
    assert len(buf) == 10


def test_replay_buffer_sample_returns_tensors() -> None:
    buf = ReplayBuffer(capacity=100)
    state = encode_state(initial_state())
    for i in range(10):
        buf.add(state, i % 243, 1.0, state, True)
    states, actions, rewards, next_states, dones = buf.sample(5)
    assert states.dtype == torch.float32
    assert actions.dtype == torch.long
    assert rewards.dtype == torch.float32
    assert next_states.dtype == torch.float32
    assert dones.dtype == torch.bool
