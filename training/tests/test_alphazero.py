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
    make_eval_fn, play_self_play_game, gatekeeper,
    evaluate, save_model, load_model, export_onnx,
)
from pogofish.minimax import SolveResult


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


# ---------------------------------------------------------------------------
# Self-play and gatekeeper tests
# ---------------------------------------------------------------------------


def test_make_eval_fn():
    """eval_fn returns valid policy and value for a state."""
    model = AlphaZeroNet(trunk_sizes=[64, 32], policy_head_size=32, value_head_size=32)
    eval_fn = make_eval_fn(model)

    state = initial_state()
    policy, value = eval_fn(state)

    assert policy.shape == (ACTION_SIZE,)
    # Policy should be a valid probability distribution over legal moves
    assert policy.sum() == pytest.approx(1.0, abs=1e-4)
    # All illegal moves should have 0 probability
    mask = legal_move_mask(state)
    assert (policy[~mask] == 0).all()
    # Value should be a scalar
    assert isinstance(value, float)
    assert -1.0 <= value <= 1.0


def test_play_self_play_game():
    """Self-play game produces valid training data."""
    model = AlphaZeroNet(trunk_sizes=[64, 32], policy_head_size=32, value_head_size=32)

    positions, game_record = play_self_play_game(
        model, num_simulations=5, c_puct=1.5, max_moves=50,
    )

    assert len(positions) > 0
    assert game_record["num_moves"] > 0
    assert game_record["result"] in ("W_wins", "R_wins", "draw")

    # Check position format
    state_t, policy, outcome = positions[0]
    assert state_t.shape == (STATE_SIZE,)
    assert policy.shape == (ACTION_SIZE,)
    assert policy.sum() == pytest.approx(1.0, abs=1e-4)
    assert outcome in (1.0, -1.0, 0.0)


def test_play_self_play_game_with_record():
    """Self-play game with record=True stores move details."""
    model = AlphaZeroNet(trunk_sizes=[64, 32], policy_head_size=32, value_head_size=32)

    positions, game_record = play_self_play_game(
        model, num_simulations=5, c_puct=1.5, max_moves=50, record=True,
    )

    assert "moves" in game_record
    assert len(game_record["moves"]) == game_record["num_moves"]


def test_gatekeeper_returns_win_rate():
    """Gatekeeper returns a win rate between 0 and 1."""
    model1 = AlphaZeroNet(trunk_sizes=[64, 32], policy_head_size=32, value_head_size=32)
    model2 = AlphaZeroNet(trunk_sizes=[64, 32], policy_head_size=32, value_head_size=32)

    result = gatekeeper(model1, model2, num_games=4, num_simulations=5, c_puct=1.5)

    assert 0.0 <= result["win_rate"] <= 1.0
    assert result["wins"] + result["losses"] + result["draws"] == 4


# ---------------------------------------------------------------------------
# Evaluation, save/load, ONNX export tests
# ---------------------------------------------------------------------------


def test_evaluate_returns_metrics():
    """Evaluate returns coverage, accuracy, agreement."""
    model = create_model("mlp_tiny")

    # Create a small set of decisive positions for testing
    s = initial_state()
    # Use a fake decisive table with known values
    decisive = {s: SolveResult(value=1.0, best_move=None)}

    result = evaluate(model, decisive)
    assert "coverage" in result
    assert "accuracy" in result
    assert "value_agreement" in result
    assert "move_agreement" in result
    assert 0.0 <= result["coverage"] <= 1.0
    assert 0.0 <= result["accuracy"] <= 1.0


def test_save_load_roundtrip(tmp_path):
    """Save and load preserves model architecture and weights."""
    model = create_model("mlp_small")
    path = tmp_path / "test_model.pt"

    save_model(model, "mlp_small", path)
    loaded, arch_name = load_model(path)

    assert arch_name == "mlp_small"

    # Verify weights match
    x = torch.randn(1, STATE_SIZE)
    model.eval()
    loaded.eval()
    with torch.no_grad():
        p1, v1 = model(x)
        p2, v2 = loaded(x)
    assert torch.allclose(p1, p2)
    assert torch.allclose(v1, v2)


def test_save_load_cnn(tmp_path):
    """Save and load works for CNN architecture."""
    model = create_model("cnn")
    path = tmp_path / "test_cnn.pt"

    save_model(model, "cnn", path)
    loaded, arch_name = load_model(path)

    assert arch_name == "cnn"
    x = torch.randn(1, STATE_SIZE)
    model.eval()
    loaded.eval()
    with torch.no_grad():
        p1, v1 = model(x)
        p2, v2 = loaded(x)
    assert torch.allclose(p1, p2)
    assert torch.allclose(v1, v2)


def test_export_onnx(tmp_path):
    """ONNX export creates a valid file with correct I/O names."""
    model = create_model("mlp_tiny")
    path = str(tmp_path / "test.onnx")
    export_onnx(model, path)

    import onnx
    onnx_model = onnx.load(path)
    onnx.checker.check_model(onnx_model)

    inputs = [i.name for i in onnx_model.graph.input]
    outputs = [o.name for o in onnx_model.graph.output]
    assert "state" in inputs
    assert "policy" in outputs
    assert "value" in outputs


# ---------------------------------------------------------------------------
# Integration tests (slow)
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_training_short_run(tmp_path):
    """Short training produces artifacts and reports metrics."""
    from pogofish.alphazero import train

    result = train(
        iterations=2,
        games_per_iteration=5,
        num_simulations=5,
        arch_name="mlp_tiny",
        minimax_table=None,
        c_puct=1.5,
        lr=1e-3,
        batch_size=16,
        training_epochs=1,
        window_capacity=100,
        gatekeeper_games=4,
        max_moves=20,
        eval_interval=1,
        snapshot_interval=2,
        patience=10,
        output_dir=str(tmp_path / "alphazero_test"),
    )

    assert "model" in result
    assert "training_log" in result
    assert len(result["training_log"]) == 2

    out = tmp_path / "alphazero_test"
    assert (out / "model_final.pt").exists()
    assert (out / "training_log.json").exists()
    assert (out / "sample_games.json").exists()


@pytest.mark.slow
def test_onnx_export_produces_correct_output(tmp_path):
    """ONNX model produces same outputs as PyTorch model."""
    import numpy as np
    import onnxruntime as ort

    model = create_model("mlp_tiny")
    model.eval()
    path = str(tmp_path / "test.onnx")
    export_onnx(model, path)

    state = initial_state()
    state_t = encode_state(state).unsqueeze(0).numpy()

    session = ort.InferenceSession(path)
    onnx_out = session.run(None, {"state": state_t})

    with torch.no_grad():
        pt_policy, pt_value = model(torch.from_numpy(state_t))

    assert np.allclose(onnx_out[0], pt_policy.numpy(), atol=1e-5)
    assert np.allclose(onnx_out[1], pt_value.numpy(), atol=1e-5)
