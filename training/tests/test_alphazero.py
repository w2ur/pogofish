"""Tests for AlphaZero networks, mirror transforms, and training components."""

import torch
import pytest

from pogofish.engine import W, R, GameState, Move, initial_state, legal_moves
from pogofish.dqn import (
    encode_state, move_to_action, legal_move_mask,
    STATE_SIZE, ACTION_SIZE,
)
from pogofish.alphazero import (
    AlphaZeroNet, AlphaZeroCNN, create_model, ARCHITECTURES,
    compute_loss, mirror_state, mirror_policy, GameWindow,
)


def test_mlp_forward_shape():
    """MLP outputs policy logits (243,) and value scalar."""
    model = AlphaZeroNet(trunk_sizes=[128, 64], policy_head_size=64, value_head_size=64)
    x = torch.randn(1, STATE_SIZE)
    policy_logits, value = model(x)
    assert policy_logits.shape == (1, ACTION_SIZE)
    assert value.shape == (1, 1)


def test_mlp_value_range():
    """Value output is in [-1, 1] due to tanh."""
    model = AlphaZeroNet(trunk_sizes=[128, 64], policy_head_size=64, value_head_size=64)
    x = torch.randn(32, STATE_SIZE) * 10  # Large inputs
    _, value = model(x)
    assert (value >= -1.0).all()
    assert (value <= 1.0).all()


def test_mlp_batch():
    """MLP handles batch dimension correctly."""
    model = AlphaZeroNet(trunk_sizes=[128, 64], policy_head_size=64, value_head_size=64)
    x = torch.randn(16, STATE_SIZE)
    policy, value = model(x)
    assert policy.shape == (16, ACTION_SIZE)
    assert value.shape == (16, 1)


def test_cnn_forward_shape():
    """CNN outputs policy logits (243,) and value scalar."""
    model = AlphaZeroCNN()
    x = torch.randn(1, STATE_SIZE)
    policy_logits, value = model(x)
    assert policy_logits.shape == (1, ACTION_SIZE)
    assert value.shape == (1, 1)


def test_cnn_value_range():
    """CNN value output is in [-1, 1] due to tanh."""
    model = AlphaZeroCNN()
    x = torch.randn(32, STATE_SIZE) * 10
    _, value = model(x)
    assert (value >= -1.0).all()
    assert (value <= 1.0).all()


def test_cnn_batch():
    """CNN handles batch dimension."""
    model = AlphaZeroCNN()
    x = torch.randn(8, STATE_SIZE)
    policy, value = model(x)
    assert policy.shape == (8, ACTION_SIZE)
    assert value.shape == (8, 1)


def test_create_model_all_architectures():
    """Factory function creates models for all defined architectures."""
    for arch_name in ARCHITECTURES:
        model = create_model(arch_name)
        x = torch.randn(1, STATE_SIZE)
        policy, value = model(x)
        assert policy.shape == (1, ACTION_SIZE), f"{arch_name} policy shape wrong"
        assert value.shape == (1, 1), f"{arch_name} value shape wrong"


def test_compute_loss():
    """Loss combines MSE(value) + CrossEntropy(policy)."""
    model = AlphaZeroNet(trunk_sizes=[64, 32], policy_head_size=32, value_head_size=32)
    states = torch.randn(4, STATE_SIZE)
    target_policies = torch.zeros(4, ACTION_SIZE)
    # Set some valid policy targets (normalized)
    target_policies[:, 0] = 0.5
    target_policies[:, 1] = 0.3
    target_policies[:, 2] = 0.2
    target_values = torch.tensor([1.0, -1.0, 0.0, 1.0]).unsqueeze(1)

    loss, policy_loss, value_loss = compute_loss(model, states, target_policies, target_values)
    assert loss.item() > 0
    assert policy_loss.item() > 0
    assert value_loss.item() > 0
    assert loss.item() == pytest.approx((policy_loss + value_loss).item(), abs=1e-5)


# ---------------------------------------------------------------------------
# Mirror augmentation tests
# ---------------------------------------------------------------------------


def test_mirror_state_swaps_columns():
    """Mirror swaps cell 0<->2, 3<->5, 6<->8."""
    # Put a distinct piece pattern in cell 0
    board = (("W", "R"),) + ((),) * 7 + ((),)
    state = GameState(board=board, current_player=W)
    t = encode_state(state)
    m = mirror_state(t)

    # Cell 0 (indices 0-11) should now be empty
    assert m[0] == 0.0
    assert m[1] == 0.0
    # Cell 2 (indices 24-35) should have W, R
    assert m[24] == 1.0   # W
    assert m[25] == -1.0  # R
    # Current player unchanged
    assert m[108] == t[108]


def test_mirror_state_center_column_unchanged():
    """Center column cells (1, 4, 7) are unchanged by mirror."""
    board = ((),) + (("W",),) + ((),) * 3 + ((),) * 4
    state = GameState(board=board, current_player=R)
    t = encode_state(state)
    m = mirror_state(t)

    # Cell 1 (indices 12-23) should still have W at depth 0
    assert m[12] == t[12]
    assert m[13] == t[13]


def test_mirror_state_roundtrip():
    """Mirroring twice returns the original."""
    state = initial_state()
    t = encode_state(state)
    m = mirror_state(mirror_state(t))
    assert torch.allclose(t, m)


def test_mirror_policy_roundtrip():
    """Mirroring a policy twice returns the original."""
    policy = torch.randn(ACTION_SIZE)
    m = mirror_policy(mirror_policy(policy))
    assert torch.allclose(policy, m, atol=1e-6)


def test_mirror_policy_swaps_actions():
    """Mirror swaps from_cell and to_cell in action indices."""
    # Action: from_cell=0, num_pieces=1, to_cell=1
    # Mirror: from_cell=2, num_pieces=1, to_cell=1
    original_action = 0 * 27 + 0 * 9 + 1  # = 1
    mirrored_action = 2 * 27 + 0 * 9 + 1  # = 55

    policy = torch.zeros(ACTION_SIZE)
    policy[original_action] = 1.0

    m = mirror_policy(policy)
    assert m[mirrored_action] == 1.0
    assert m[original_action] == 0.0


def test_mirror_policy_preserves_num_pieces():
    """Mirror does not change num_pieces."""
    # from=3, num=2, to=4 -> mirrored from=5, num=2, to=4
    original = 3 * 27 + 1 * 9 + 4  # 3*27 + 9 + 4 = 94
    mirrored = 5 * 27 + 1 * 9 + 4  # 5*27 + 9 + 4 = 148

    policy = torch.zeros(ACTION_SIZE)
    policy[original] = 1.0

    m = mirror_policy(policy)
    assert m[mirrored] == 1.0


# ---------------------------------------------------------------------------
# GameWindow tests
# ---------------------------------------------------------------------------


def test_game_window_add_and_size():
    """Adding games increases window size."""
    window = GameWindow(capacity=100)
    state_t = torch.randn(STATE_SIZE)
    policy = torch.zeros(ACTION_SIZE)
    policy[0] = 1.0

    game_data = [(state_t, policy, 1.0)]
    window.add_game(game_data)
    # Each position is doubled by mirror augmentation
    assert window.num_positions() == 2


def test_game_window_capacity():
    """Window evicts old games when full."""
    window = GameWindow(capacity=3)
    state_t = torch.randn(STATE_SIZE)
    policy = torch.zeros(ACTION_SIZE)
    policy[0] = 1.0

    for _ in range(5):
        window.add_game([(state_t, policy, 1.0)])

    assert window.num_games() == 3  # Only 3 games retained


def test_game_window_sample_batch():
    """sample_batch returns tensors of correct shapes."""
    window = GameWindow(capacity=100)
    state_t = torch.randn(STATE_SIZE)
    policy = torch.zeros(ACTION_SIZE)
    policy[0] = 1.0

    for _ in range(10):
        window.add_game([(state_t, policy, 1.0), (state_t, policy, -1.0)])

    states, policies, values = window.sample_batch(8)
    assert states.shape == (8, STATE_SIZE)
    assert policies.shape == (8, ACTION_SIZE)
    assert values.shape == (8, 1)


def test_game_window_all_positions():
    """all_positions returns all stored positions."""
    window = GameWindow(capacity=100)
    state_t = torch.randn(STATE_SIZE)
    policy = torch.zeros(ACTION_SIZE)
    policy[0] = 1.0

    window.add_game([(state_t, policy, 1.0)])
    window.add_game([(state_t, policy, -1.0)])

    positions = window.all_positions()
    assert len(positions) == 4  # 2 games x 1 position x 2 (mirror)


def test_game_window_mirror_applied():
    """Added positions include mirrored versions."""
    window = GameWindow(capacity=100)

    # Distinctive state: only cell 0 has pieces
    board = (("W", "R"),) + ((),) * 8
    state = GameState(board=board, current_player=W)
    state_t = encode_state(state)
    policy = torch.zeros(ACTION_SIZE)
    policy[0] = 1.0

    window.add_game([(state_t, policy, 1.0)])

    positions = window.all_positions()
    assert len(positions) == 2

    # One should be original, one mirrored
    s0, _, _ = positions[0]
    s1, _, _ = positions[1]
    # Cell 0 index 0 vs cell 2 index 24
    assert (s0[0] != 0 and s1[24] != 0) or (s1[0] != 0 and s0[24] != 0)
