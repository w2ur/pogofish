"""
AlphaZero training for Pogo: dual-head neural networks, self-play, and MCTS training.

Two architecture families:
  - AlphaZeroNet: MLP with configurable trunk (3 sizes: tiny, small, medium)
  - AlphaZeroCNN: CNN with 2 conv layers on (13, 3, 3) spatial input

Both output raw policy logits (243,) and value scalar in [-1, 1].
Masking and log-softmax applied externally during inference/training.
"""

from __future__ import annotations

import copy
import json
import random
import time
from collections import deque
from pathlib import Path
from typing import Callable

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move,
    is_terminal, reward as engine_reward, winner,
)
from pogofish.dqn import (
    encode_state, move_to_action, action_to_move, legal_move_mask,
    STATE_SIZE, ACTION_SIZE, MAX_STACK, NUM_CELLS,
)
from pogofish.encoding import state_to_key, move_to_key
from pogofish.mcts import mcts_search, get_mcts_policy

# Re-export for external use
__all__ = [
    "AlphaZeroNet", "AlphaZeroCNN", "create_model", "ARCHITECTURES",
    "compute_loss", "mirror_state", "mirror_policy", "GameWindow",
    "make_eval_fn", "play_self_play_game", "gatekeeper",
    "evaluate", "save_model", "load_model", "export_onnx", "train",
]


# ---------------------------------------------------------------------------
# Mirror augmentation (left-right symmetry)
# ---------------------------------------------------------------------------

_MIRROR_CELL = {0: 2, 1: 1, 2: 0, 3: 5, 4: 4, 5: 3, 6: 8, 7: 7, 8: 6}

# Pre-compute action index remapping for mirror
_MIRROR_ACTION = [0] * ACTION_SIZE
for _from in range(NUM_CELLS):
    for _np in range(3):
        for _to in range(NUM_CELLS):
            _orig = _from * 27 + _np * 9 + _to
            _mir = _MIRROR_CELL[_from] * 27 + _np * 9 + _MIRROR_CELL[_to]
            _MIRROR_ACTION[_orig] = _mir


def mirror_state(state_tensor: torch.Tensor) -> torch.Tensor:
    """Mirror a (109,) state tensor left-right (swap columns 0 and 2)."""
    mirrored = torch.zeros_like(state_tensor)
    for orig_cell, mir_cell in _MIRROR_CELL.items():
        src_start = orig_cell * MAX_STACK
        dst_start = mir_cell * MAX_STACK
        mirrored[dst_start:dst_start + MAX_STACK] = state_tensor[src_start:src_start + MAX_STACK]
    # Current player unchanged
    mirrored[STATE_SIZE - 1] = state_tensor[STATE_SIZE - 1]
    return mirrored


def mirror_policy(policy: torch.Tensor) -> torch.Tensor:
    """Mirror a (243,) policy tensor by remapping action indices."""
    mirrored = torch.zeros_like(policy)
    for orig, mir in enumerate(_MIRROR_ACTION):
        mirrored[mir] = policy[orig]
    return mirrored


# ---------------------------------------------------------------------------
# Game Window (training data storage)
# ---------------------------------------------------------------------------


class GameWindow:
    """Sliding window of recent games for training data.

    Each position is stored with its mirror augmentation, doubling the data.
    """

    def __init__(self, capacity: int = 5000) -> None:
        self._games: deque[list[tuple[torch.Tensor, torch.Tensor, float]]] = deque(
            maxlen=capacity
        )

    def add_game(
        self, positions: list[tuple[torch.Tensor, torch.Tensor, float]]
    ) -> None:
        """Add a game's positions. Each position is (state_t, mcts_policy, outcome).

        Mirror augmentation is applied automatically.
        """
        augmented: list[tuple[torch.Tensor, torch.Tensor, float]] = []
        for state_t, policy, outcome in positions:
            augmented.append((state_t, policy, outcome))
            augmented.append((mirror_state(state_t), mirror_policy(policy), outcome))
        self._games.append(augmented)

    def num_games(self) -> int:
        return len(self._games)

    def num_positions(self) -> int:
        return sum(len(g) for g in self._games)

    def all_positions(self) -> list[tuple[torch.Tensor, torch.Tensor, float]]:
        """Return all positions as a flat list."""
        result: list[tuple[torch.Tensor, torch.Tensor, float]] = []
        for game in self._games:
            result.extend(game)
        return result

    def sample_batch(
        self, batch_size: int
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Sample a random batch of positions.

        Returns (states, policies, values) as tensors.
        """
        all_pos = self.all_positions()
        batch = random.sample(all_pos, min(batch_size, len(all_pos)))
        states, policies, values = zip(*batch)
        return (
            torch.stack(states),
            torch.stack(policies),
            torch.tensor(values, dtype=torch.float32).unsqueeze(1),
        )


# ---------------------------------------------------------------------------
# Architecture configs
# ---------------------------------------------------------------------------

ARCHITECTURES: dict[str, dict] = {
    "mlp_tiny": {"type": "mlp", "trunk": [128, 64], "policy_head": 64, "value_head": 64},
    "mlp_small": {"type": "mlp", "trunk": [256, 128], "policy_head": 128, "value_head": 128},
    "mlp_medium": {"type": "mlp", "trunk": [512, 256, 128], "policy_head": 128, "value_head": 128},
    "cnn": {"type": "cnn"},
}


# ---------------------------------------------------------------------------
# MLP dual-head network
# ---------------------------------------------------------------------------


class AlphaZeroNet(nn.Module):
    """Configurable MLP with shared trunk and dual heads (policy + value)."""

    def __init__(
        self,
        trunk_sizes: list[int] | None = None,
        policy_head_size: int = 128,
        value_head_size: int = 128,
    ) -> None:
        super().__init__()
        if trunk_sizes is None:
            trunk_sizes = [256, 128]

        # Shared trunk
        layers: list[nn.Module] = []
        in_size = STATE_SIZE
        for size in trunk_sizes:
            layers.append(nn.Linear(in_size, size))
            layers.append(nn.ReLU())
            in_size = size
        self.trunk = nn.Sequential(*layers)

        trunk_out = trunk_sizes[-1]

        # Policy head: trunk_out -> policy_head_size -> ACTION_SIZE (raw logits)
        self.policy_head = nn.Sequential(
            nn.Linear(trunk_out, policy_head_size),
            nn.ReLU(),
            nn.Linear(policy_head_size, ACTION_SIZE),
        )

        # Value head: trunk_out -> value_head_size -> 1 -> tanh
        self.value_head = nn.Sequential(
            nn.Linear(trunk_out, value_head_size),
            nn.ReLU(),
            nn.Linear(value_head_size, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Forward pass. Returns (policy_logits, value)."""
        trunk_out = self.trunk(x)
        policy_logits = self.policy_head(trunk_out)
        value = self.value_head(trunk_out)
        return policy_logits, value


# ---------------------------------------------------------------------------
# CNN dual-head network
# ---------------------------------------------------------------------------


class AlphaZeroCNN(nn.Module):
    """CNN with spatial (13, 3, 3) input and dual heads.

    Input is the standard 109-dim vector, reshaped internally:
      - First 108 values -> (12, 3, 3) stack channels
      - Last value (current player) -> broadcast to (1, 3, 3)
      = (13, 3, 3) total input
    """

    def __init__(self) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(13, 32, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(32)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(64)

        flat_size = 64 * 3 * 3  # 576

        self.policy_head = nn.Linear(flat_size, ACTION_SIZE)
        self.value_head = nn.Sequential(
            nn.Linear(flat_size, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Forward pass. x is (B, 109). Returns (policy_logits, value)."""
        batch = x.shape[0]

        # Reshape: first 108 -> (B, 9, 12) cell-major -> transpose -> (B, 12, 3, 3)
        board = x[:, :MAX_STACK * NUM_CELLS].view(batch, NUM_CELLS, MAX_STACK)  # (B, 9, 12)
        board = board.permute(0, 2, 1)  # (B, 12, 9) — now channel-major
        board = board.view(batch, MAX_STACK, 3, 3)  # (B, 12, 3, 3)
        # Current player channel: (B, 1) -> (B, 1, 3, 3)
        player = x[:, -1:].unsqueeze(-1).unsqueeze(-1).expand(batch, 1, 3, 3)
        spatial = torch.cat([board, player], dim=1)  # (B, 13, 3, 3)

        h = F.relu(self.bn1(self.conv1(spatial)))
        h = F.relu(self.bn2(self.conv2(h)))
        flat = h.view(batch, -1)  # (B, 576)

        policy_logits = self.policy_head(flat)
        value = self.value_head(flat)
        return policy_logits, value


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_model(arch_name: str) -> nn.Module:
    """Create a model by architecture name."""
    config = ARCHITECTURES[arch_name]
    if config["type"] == "mlp":
        return AlphaZeroNet(
            trunk_sizes=config["trunk"],
            policy_head_size=config["policy_head"],
            value_head_size=config["value_head"],
        )
    elif config["type"] == "cnn":
        return AlphaZeroCNN()
    else:
        raise ValueError(f"Unknown architecture type: {config['type']}")


# ---------------------------------------------------------------------------
# Loss
# ---------------------------------------------------------------------------


def compute_loss(
    model: nn.Module,
    states: torch.Tensor,
    target_policies: torch.Tensor,
    target_values: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Compute AlphaZero loss: MSE(value) + CrossEntropy(policy).

    Args:
        model: The dual-head network.
        states: (B, 109) state tensors.
        target_policies: (B, 243) MCTS visit count distributions.
        target_values: (B, 1) game outcomes from current player's perspective.

    Returns:
        (total_loss, policy_loss, value_loss)
    """
    policy_logits, value_pred = model(states)

    # Value loss: MSE
    value_loss = F.mse_loss(value_pred, target_values)

    # Policy loss: cross-entropy with soft targets
    # log_softmax on logits, then dot with target distribution
    log_probs = F.log_softmax(policy_logits, dim=1)
    policy_loss = -(target_policies * log_probs).sum(dim=1).mean()

    total_loss = value_loss + policy_loss
    return total_loss, policy_loss, value_loss


# ---------------------------------------------------------------------------
# Neural net → MCTS eval function bridge
# ---------------------------------------------------------------------------


def make_eval_fn(model: nn.Module) -> Callable[[GameState], tuple[torch.Tensor, float]]:
    """Create an eval function that wraps a neural net for MCTS.

    Returns a callable(GameState) -> (policy_probs, value_scalar).
    Policy is a probability distribution over legal actions (illegal = 0).
    """
    def eval_fn(state: GameState) -> tuple[torch.Tensor, float]:
        state_t = encode_state(state)
        with torch.no_grad():
            policy_logits, value = model(state_t.unsqueeze(0))

        # Mask illegal actions and apply softmax
        mask = legal_move_mask(state)
        policy_logits = policy_logits.squeeze(0)
        policy_logits[~mask] = float("-inf")

        # Handle case where no legal moves (all -inf)
        if mask.any():
            policy_probs = torch.softmax(policy_logits, dim=0)
        else:
            policy_probs = torch.zeros(ACTION_SIZE)

        return policy_probs, value.item()

    return eval_fn


# ---------------------------------------------------------------------------
# Self-play
# ---------------------------------------------------------------------------


def play_self_play_game(
    model: nn.Module,
    num_simulations: int = 50,
    c_puct: float = 1.5,
    max_moves: int = 50,
    dirichlet_alpha: float = 0.8,
    dirichlet_epsilon: float = 0.25,
    record: bool = False,
) -> tuple[list[tuple[torch.Tensor, torch.Tensor, float]], dict]:
    """Play one self-play game using MCTS.

    Returns:
        positions: list of (state_tensor, mcts_policy, game_outcome)
            game_outcome is filled in AFTER the game ends (from each player's perspective).
        game_record: dict with keys "result", "num_moves", optionally "moves".
    """
    model.eval()
    eval_fn = make_eval_fn(model)

    state = initial_state()
    history: list[tuple[torch.Tensor, torch.Tensor, str]] = []  # (state_t, policy, player)
    moves_log: list[dict] = []
    move_count = 0

    while move_count < max_moves:
        if is_terminal(state) or not legal_moves(state):
            break

        # Temperature: tau=1.0 for first 10 moves, then tau=0
        temperature = 1.0 if move_count < 10 else 0.0

        action, mcts_policy = mcts_search(
            state, eval_fn, num_simulations=num_simulations,
            c_puct=c_puct, temperature=temperature,
            dirichlet_alpha=dirichlet_alpha, dirichlet_epsilon=dirichlet_epsilon,
        )

        if action is None:
            break

        state_t = encode_state(state)
        history.append((state_t, mcts_policy, state.current_player))

        if record:
            move = action_to_move(action)
            moves_log.append({
                "state": state_to_key(state),
                "move": move_to_key(move),
                "player": state.current_player,
            })

        move = action_to_move(action)
        state = apply_move(state, move)
        move_count += 1

    # Determine result
    if is_terminal(state):
        w = winner(state)
        result = f"{w}_wins" if w else "draw"
    else:
        result = "draw"

    # Fill in game outcomes from each player's perspective
    if result == "W_wins":
        outcome_for = {W: 1.0, R: -1.0}
    elif result == "R_wins":
        outcome_for = {W: -1.0, R: 1.0}
    else:
        outcome_for = {W: 0.0, R: 0.0}

    positions = [
        (state_t, policy, outcome_for[player])
        for state_t, policy, player in history
    ]

    game_record: dict = {"result": result, "num_moves": move_count}
    if record:
        game_record["moves"] = moves_log

    return positions, game_record


# ---------------------------------------------------------------------------
# Gatekeeper
# ---------------------------------------------------------------------------


def gatekeeper(
    new_model: nn.Module,
    best_model: nn.Module,
    num_games: int = 50,
    num_simulations: int = 50,
    c_puct: float = 1.5,
    max_moves: int = 50,
) -> dict:
    """Play num_games between new_model and best_model.

    Alternates which model plays White. Uses tau=0 (greedy), no Dirichlet noise.
    Returns dict with win_rate, wins, losses, draws.
    """
    new_model.eval()
    best_model.eval()
    eval_new = make_eval_fn(new_model)
    eval_best = make_eval_fn(best_model)

    wins = 0
    losses = 0
    draws = 0

    for game_idx in range(num_games):
        # Alternate sides
        if game_idx % 2 == 0:
            eval_white, eval_black = eval_new, eval_best
            new_is_white = True
        else:
            eval_white, eval_black = eval_best, eval_new
            new_is_white = False

        state = initial_state()
        move_count = 0

        while move_count < max_moves:
            if is_terminal(state) or not legal_moves(state):
                break

            eval_fn = eval_white if state.current_player == W else eval_black
            action, _ = mcts_search(
                state, eval_fn, num_simulations=num_simulations,
                c_puct=c_puct, temperature=0.0,
                dirichlet_alpha=0.0, dirichlet_epsilon=0.0,
            )

            if action is None:
                break

            move = action_to_move(action)
            state = apply_move(state, move)
            move_count += 1

        w = winner(state)
        if w is None:
            draws += 1
        elif (w == W and new_is_white) or (w == R and not new_is_white):
            wins += 1
        else:
            losses += 1

    total = wins + losses + draws
    # Draws count as 0.5 for both
    win_rate = (wins + 0.5 * draws) / total if total > 0 else 0.0

    return {"win_rate": win_rate, "wins": wins, "losses": losses, "draws": draws}


# ---------------------------------------------------------------------------
# Evaluation against minimax
# ---------------------------------------------------------------------------


def evaluate(model: nn.Module, decisive_positions: dict) -> dict:
    """Evaluate AlphaZero against decisive minimax positions.

    Uses value head directly. Skips positions where abs(v) < 0.001.
    Also checks move agreement via policy head.

    Args:
        model: The dual-head network.
        decisive_positions: Mapping of GameState -> SolveResult where value != 0.

    Returns:
        Dict with coverage, accuracy, value_agreement, move_agreement, total_decisive.
    """
    actionable = {s: r for s, r in decisive_positions.items() if legal_moves(s)}
    total = len(actionable)
    if total == 0:
        return {
            "coverage": 0.0, "accuracy": 0.0, "value_agreement": 0.0,
            "move_agreement": 0.0, "total_decisive": len(decisive_positions),
        }

    visited = 0
    correct_value = 0
    correct_move = 0
    total_with_best_move = 0

    model.eval()
    with torch.no_grad():
        for state, minimax_result in actionable.items():
            state_t = encode_state(state)
            mask = legal_move_mask(state)
            policy_logits, value = model(state_t.unsqueeze(0))
            v = value.item()

            # Value agreement
            if abs(v) < 0.001:
                continue
            visited += 1
            minimax_sign = 1 if minimax_result.value > 0 else -1
            if (v > 0 and minimax_sign > 0) or (v < 0 and minimax_sign < 0):
                correct_value += 1

            # Move agreement (if minimax has a best_move)
            if minimax_result.best_move is not None:
                total_with_best_move += 1
                policy_logits_masked = policy_logits.squeeze(0).clone()
                policy_logits_masked[~mask] = float("-inf")
                predicted_action = policy_logits_masked.argmax().item()
                predicted_move = action_to_move(predicted_action)
                if predicted_move == minimax_result.best_move:
                    correct_move += 1

    model.train()
    coverage = visited / total if total > 0 else 0.0
    accuracy = correct_value / visited if visited > 0 else 0.0
    move_agr = correct_move / total_with_best_move if total_with_best_move > 0 else 0.0

    return {
        "coverage": round(coverage, 4),
        "accuracy": round(accuracy, 4),
        "value_agreement": round(coverage * accuracy, 4),
        "move_agreement": round(move_agr, 4),
        "total_decisive": total,
    }


# ---------------------------------------------------------------------------
# Save / load / export
# ---------------------------------------------------------------------------


def save_model(model: nn.Module, arch_name: str, path) -> None:
    """Save model state dict and architecture name."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"arch_name": arch_name, "state_dict": model.state_dict()}, path)


def load_model(path) -> tuple[nn.Module, str]:
    """Load a model from a .pt file. Returns (model, arch_name)."""
    data = torch.load(path, weights_only=False)
    arch_name = data["arch_name"]
    model = create_model(arch_name)
    model.load_state_dict(data["state_dict"])
    return model, arch_name


def export_onnx(model: nn.Module, path: str) -> None:
    """Export model to ONNX with dual outputs (policy, value)."""
    model.eval()
    dummy = torch.randn(1, STATE_SIZE)
    torch.onnx.export(
        model, dummy, path,
        input_names=["state"],
        output_names=["policy", "value"],
        dynamic_axes={
            "state": {0: "batch"},
            "policy": {0: "batch"},
            "value": {0: "batch"},
        },
        opset_version=17,
        dynamo=False,
    )


# ---------------------------------------------------------------------------
# Internal helpers for train()
# ---------------------------------------------------------------------------


def _flush_progress(training_log, sample_games, output_dir):
    """Crash-safe write of training progress to JSON files."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "training_log.json", "w") as f:
        json.dump(training_log, f, indent=2)
    with open(out / "sample_games.json", "w") as f:
        json.dump(sample_games, f, indent=2)


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------


def train(
    iterations: int = 100,
    games_per_iteration: int = 500,
    num_simulations: int = 50,
    arch_name: str = "mlp_small",
    minimax_table: dict | None = None,
    c_puct: float = 1.5,
    lr: float = 1e-3,
    lr_end: float = 1e-5,
    weight_decay: float = 1e-4,
    batch_size: int = 256,
    training_epochs: int = 5,
    window_capacity: int = 5000,
    dirichlet_alpha: float = 0.8,
    dirichlet_epsilon: float = 0.25,
    gatekeeper_games: int = 50,
    gatekeeper_threshold: float = 0.55,
    max_moves: int = 50,
    eval_interval: int = 5,
    snapshot_interval: int = 20,
    patience: int = 10,
    output_dir: str | None = None,
) -> dict:
    """Train an AlphaZero agent via self-play with MCTS.

    Returns dict with: model, training_log, sample_games.
    """
    model = create_model(arch_name)
    best_model = copy.deepcopy(model)
    window = GameWindow(capacity=window_capacity)

    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)

    # Estimate total training steps for cosine schedule
    est_total_steps = iterations * training_epochs * max(
        1, (window_capacity * 15 * 2) // batch_size
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=est_total_steps, eta_min=lr_end
    )

    training_log: list[dict] = []
    sample_games: list[dict] = []

    best_agreement = -1.0
    patience_counter = 0
    start_time = time.perf_counter()
    total_games = 0

    print(f"Training config (AlphaZero):")
    print(f"  Architecture:  {arch_name}")
    print(f"  Iterations:    {iterations}")
    print(f"  Games/iter:    {games_per_iteration}")
    print(f"  MCTS sims:     {num_simulations}")
    print(f"  Window:        {window_capacity}")
    print(f"  Epochs/iter:   {training_epochs}")
    print(f"  Batch size:    {batch_size}")
    print(f"  LR:            {lr} -> {lr_end} (cosine)")
    print(f"  c_puct:        {c_puct}")
    print(f"  Gatekeeper:    {gatekeeper_games} games, {gatekeeper_threshold:.0%} threshold")
    print(f"  Eval every:    {eval_interval}")
    print(f"  Snap every:    {snapshot_interval}")
    print(f"  Patience:      {patience}")
    print()

    for iteration in range(1, iterations + 1):
        iter_start = time.perf_counter()

        # --- 1. Self-play ---
        model.eval()
        for g in range(games_per_iteration):
            game_num = total_games + g + 1
            # Record first 10 + last 10 before each eval
            remainder = game_num % (games_per_iteration * eval_interval)
            should_record = (
                game_num <= 10
                or (remainder != 0 and remainder > games_per_iteration * eval_interval - 10)
            )

            positions, game_record = play_self_play_game(
                model, num_simulations=num_simulations, c_puct=c_puct,
                max_moves=max_moves, dirichlet_alpha=dirichlet_alpha,
                dirichlet_epsilon=dirichlet_epsilon, record=should_record,
            )
            window.add_game(positions)

            if should_record:
                game_record["game_num"] = game_num
                sample_games.append(game_record)

        total_games += games_per_iteration

        # --- 2. Train on game window ---
        if window.num_positions() < batch_size:
            continue

        model.train()
        epoch_losses = []
        for epoch in range(training_epochs):
            all_pos = window.all_positions()
            random.shuffle(all_pos)

            for i in range(0, len(all_pos), batch_size):
                batch = all_pos[i:i + batch_size]
                if len(batch) < 2:
                    continue
                states_b, policies_b, values_b = zip(*batch)
                states_t = torch.stack(states_b)
                policies_t = torch.stack(policies_b)
                values_t = torch.tensor(values_b, dtype=torch.float32).unsqueeze(1)

                loss, p_loss, v_loss = compute_loss(model, states_t, policies_t, values_t)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                scheduler.step()
                epoch_losses.append(loss.item())

        avg_loss = sum(epoch_losses) / len(epoch_losses) if epoch_losses else 0.0

        # --- 3. Gatekeeper ---
        gate_result = gatekeeper(
            model, best_model, num_games=gatekeeper_games,
            num_simulations=num_simulations, c_puct=c_puct, max_moves=max_moves,
        )
        adopted = gate_result["win_rate"] >= gatekeeper_threshold
        if adopted:
            best_model = copy.deepcopy(model)

        # --- 4. Logging ---
        elapsed = time.perf_counter() - start_time
        iter_time = time.perf_counter() - iter_start
        current_lr = scheduler.get_last_lr()[0]

        entry: dict = {
            "iteration": iteration,
            "total_games": total_games,
            "loss": round(avg_loss, 6),
            "lr": round(current_lr, 8),
            "window_positions": window.num_positions(),
            "gatekeeper_win_rate": round(gate_result["win_rate"], 3),
            "gatekeeper_adopted": adopted,
            "gatekeeper_wins": gate_result["wins"],
            "gatekeeper_losses": gate_result["losses"],
            "gatekeeper_draws": gate_result["draws"],
            "elapsed_seconds": round(elapsed, 1),
            "iter_seconds": round(iter_time, 1),
        }

        # --- 5. Eval checkpoint ---
        if iteration % eval_interval == 0 and minimax_table is not None:
            eval_result = evaluate(best_model, minimax_table)
            entry.update(eval_result)
            agreement = eval_result["value_agreement"]

            if agreement > best_agreement:
                best_agreement = agreement
                patience_counter = 0
                if output_dir:
                    save_model(best_model, arch_name, Path(output_dir) / "model_best.pt")
                    print(f"  New best model saved (agreement: {agreement:.1%})")
            else:
                patience_counter += 1

        training_log.append(entry)

        # Progress output
        rate = total_games / elapsed if elapsed > 0 else 0
        eta_h = (iterations - iteration) * iter_time / 3600

        lines = [
            f"---- Iteration {iteration}/{iterations} ({iteration/iterations:.0%}) ----",
            f"  Games: {total_games:,}   Loss: {avg_loss:.4f}   LR: {current_lr:.2e}",
            f"  Window: {window.num_positions():,} positions ({window.num_games()} games)",
            f"  Gatekeeper: {gate_result['win_rate']:.0%} ({'ADOPTED' if adopted else 'rejected'})"
            f"  W:{gate_result['wins']} L:{gate_result['losses']} D:{gate_result['draws']}",
            f"  Speed: {rate:.0f} games/s   Iter: {iter_time:.0f}s   ETA: {eta_h:.1f}h",
        ]
        if "coverage" in entry:
            lines.append(
                f"  Coverage: {entry['coverage']:.1%}   Accuracy: {entry['accuracy']:.1%}"
                f"   Agreement: {entry['value_agreement']:.1%}   Move: {entry.get('move_agreement', 0):.1%}"
            )
            if patience_counter > 0:
                lines.append(f"  No improvement for {patience_counter}/{patience} evals")
        print("\n".join(lines))

        # Flush to disk
        if output_dir:
            _flush_progress(training_log, sample_games, output_dir)

        # Snapshot
        if output_dir and iteration % snapshot_interval == 0:
            save_model(best_model, arch_name, Path(output_dir) / f"model_checkpoint_{iteration}.pt")
            print(f"  Checkpoint saved: model_checkpoint_{iteration}.pt")

        # Early stopping
        if minimax_table is not None and patience_counter >= patience:
            print(f"Early stopping at iteration {iteration} (no improvement for {patience} evals)")
            break

    # Final export
    if output_dir:
        save_model(best_model, arch_name, Path(output_dir) / "model_final.pt")
        best_path = Path(output_dir) / "model_best.pt"
        if best_path.exists():
            final_model, _ = load_model(best_path)
        else:
            final_model = best_model
            save_model(best_model, arch_name, best_path)
        export_onnx(final_model, str(Path(output_dir) / "model_best.onnx"))
        _flush_progress(training_log, sample_games, output_dir)
        print(f"Final artifacts saved to {output_dir}/")

    return {"model": best_model, "training_log": training_log, "sample_games": sample_games}
