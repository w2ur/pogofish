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
    compute_loss,
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
