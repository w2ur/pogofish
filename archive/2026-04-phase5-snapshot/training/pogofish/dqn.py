"""
DQN state/action encoding for the Pogo board game.

State encoding:
  - 109-dimensional float32 tensor.
  - 12 slots per cell × 9 cells + 1 current-player indicator.
  - Each slot encodes a piece as +1.0 (White), -1.0 (Red), or 0.0 (empty).
  - Slots are ordered bottom-to-top within each cell.
  - The final element is +1.0 (White to move) or -1.0 (Red to move).

Action encoding:
  - 243 discrete actions (9 × 3 × 9).
  - Index = from_cell * 27 + (num_pieces - 1) * 9 + to_cell
"""

from __future__ import annotations

import copy
import json
import random
import time
from collections import deque
from pathlib import Path

import torch
import torch.nn as nn

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move,
    is_terminal, reward as engine_reward, winner,
)
from pogofish.encoding import state_to_key, move_to_key

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_STACK = 12       # Total pieces in the game (6 White + 6 Red)
NUM_CELLS = 9        # 3×3 board
STATE_SIZE = MAX_STACK * NUM_CELLS + 1   # 109
ACTION_SIZE = NUM_CELLS * 3 * NUM_CELLS  # 243

# Piece encoding values
_PIECE_VALUE: dict[str, float] = {W: 1.0, R: -1.0}
_PLAYER_VALUE: dict[str, float] = {W: 1.0, R: -1.0}

ARCHITECTURES: dict[str, list[int]] = {
    "tiny": [64, 32],
    "small": [128, 64],
    "medium": [256, 128, 64],
}


# ---------------------------------------------------------------------------
# State encoding
# ---------------------------------------------------------------------------


def encode_state(state: GameState) -> torch.Tensor:
    """
    Encode a GameState as a float32 tensor of shape (109,).

    Layout:
      indices 0..11   → cell 0 (bottom-to-top, padded with 0.0)
      indices 12..23  → cell 1
      ...
      indices 96..107 → cell 8
      index 108       → current player (+1 White, -1 Red)
    """
    data = torch.zeros(STATE_SIZE, dtype=torch.float32)
    for cell_idx, stack in enumerate(state.board):
        base = cell_idx * MAX_STACK
        for depth, piece in enumerate(stack):
            data[base + depth] = _PIECE_VALUE[piece]
    data[STATE_SIZE - 1] = _PLAYER_VALUE[state.current_player]
    return data


# ---------------------------------------------------------------------------
# Action encoding
# ---------------------------------------------------------------------------


def move_to_action(move: Move) -> int:
    """Convert a Move to an action index in [0, 242]."""
    return move.from_cell * 27 + (move.num_pieces - 1) * 9 + move.to_cell


def action_to_move(idx: int) -> Move:
    """Convert an action index in [0, 242] to a Move."""
    from_cell, remainder = divmod(idx, 27)
    pieces_minus_one, to_cell = divmod(remainder, 9)
    return Move(from_cell=from_cell, num_pieces=pieces_minus_one + 1, to_cell=to_cell)


# ---------------------------------------------------------------------------
# Legal move mask
# ---------------------------------------------------------------------------


def legal_move_mask(state: GameState) -> torch.Tensor:
    """
    Return a boolean tensor of shape (243,) where True indicates a legal action.
    """
    mask = torch.zeros(ACTION_SIZE, dtype=torch.bool)
    for move in legal_moves(state):
        mask[move_to_action(move)] = True
    return mask


# ---------------------------------------------------------------------------
# DQN Model
# ---------------------------------------------------------------------------


class DQNModel(nn.Module):
    """
    Configurable MLP that maps a state tensor (109,) to Q-values (243,).

    Hidden layers default to [128, 64]. No activation on the output layer.
    """

    def __init__(self, hidden_layers: list[int] | None = None) -> None:
        super().__init__()
        if hidden_layers is None:
            hidden_layers = [128, 64]

        layer_sizes = [STATE_SIZE] + hidden_layers + [ACTION_SIZE]
        layers: list[nn.Module] = []
        for i in range(len(layer_sizes) - 1):
            layers.append(nn.Linear(layer_sizes[i], layer_sizes[i + 1]))
            if i < len(layer_sizes) - 2:
                layers.append(nn.ReLU())

        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ---------------------------------------------------------------------------
# Replay Buffer
# ---------------------------------------------------------------------------


class ReplayBuffer:
    """
    Circular buffer storing (state, action, reward, next_state, done) transitions.
    """

    def __init__(self, capacity: int = 100_000) -> None:
        self._buffer: deque[tuple[torch.Tensor, int, float, torch.Tensor, bool]] = deque(
            maxlen=capacity
        )

    def add(
        self,
        state: torch.Tensor,
        action: int,
        reward: float,
        next_state: torch.Tensor,
        done: bool,
    ) -> None:
        self._buffer.append((state, action, reward, next_state, done))

    def sample(
        self, batch_size: int
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Return a random batch of transitions as stacked tensors.

        Returns:
            states:      (B, 109) float32
            actions:     (B,)     long
            rewards:     (B,)     float32
            next_states: (B, 109) float32
            dones:       (B,)     bool
        """
        batch = random.sample(self._buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            torch.stack(states).float(),
            torch.tensor(actions, dtype=torch.long),
            torch.tensor(rewards, dtype=torch.float32),
            torch.stack(next_states).float(),
            torch.tensor(dones, dtype=torch.bool),
        )

    def __len__(self) -> int:
        return len(self._buffer)


# ---------------------------------------------------------------------------
# Self-play episode
# ---------------------------------------------------------------------------


def play_episode(
    model: DQNModel,
    epsilon: float,
    max_moves: int = 50,
    record: bool = False,
) -> tuple[dict, list[tuple[torch.Tensor, int, float, torch.Tensor, bool]]]:
    """
    Play one self-play game. Both sides use the same model with epsilon-greedy.

    Returns:
        game: dict with keys "moves", "result", "num_moves"
        transitions: list of (state_t, action, reward, next_state_t, done)
    """
    state = initial_state()
    moves_log: list[dict] = []
    transitions: list[tuple[torch.Tensor, int, float, torch.Tensor, bool]] = []
    move_count = 0
    next_state = state

    while move_count < max_moves:
        moves = legal_moves(state)
        if not moves:
            break

        state_t = encode_state(state)
        mask = legal_move_mask(state)

        # Epsilon-greedy action selection.
        if random.random() < epsilon:
            move = random.choice(moves)
            action = move_to_action(move)
        else:
            with torch.no_grad():
                q_vals = model(state_t.unsqueeze(0)).squeeze(0)
                q_vals[~mask] = float("-inf")
                action = q_vals.argmax().item()
                move = action_to_move(action)

        if record:
            moves_log.append({
                "state": state_to_key(state),
                "move": move_to_key(move),
                "player": state.current_player,
            })

        next_state = apply_move(state, move)
        # Reward from the mover's perspective.
        r = engine_reward(next_state, state.current_player)
        next_state_t = encode_state(next_state)
        done = is_terminal(next_state)

        transitions.append((state_t, action, r, next_state_t, done))
        move_count += 1

        if done:
            break
        state = next_state

    # Determine result.
    if is_terminal(next_state):
        w = winner(next_state)
        result = f"{w}_wins" if w else "draw"
    else:
        result = "draw"

    return {"moves": moves_log, "result": result, "num_moves": move_count}, transitions


# ---------------------------------------------------------------------------
# Evaluation against minimax
# ---------------------------------------------------------------------------


def evaluate(model: DQNModel, decisive_positions: dict) -> dict:
    """Evaluate DQN against decisive minimax positions.

    For each decisive position with legal moves, compares the sign of the
    model's best Q-value against the sign of the minimax value.

    Args:
        model: The DQN model to evaluate.
        decisive_positions: Mapping of GameState -> SolveResult where value != 0.

    Returns:
        Dict with keys: coverage, accuracy, value_agreement, total_decisive.
    """
    from pogofish.engine import legal_moves as get_legal_moves

    actionable = {s: r for s, r in decisive_positions.items() if get_legal_moves(s)}
    total = len(actionable)
    if total == 0:
        return {
            "coverage": 0.0,
            "accuracy": 0.0,
            "value_agreement": 0.0,
            "total_decisive": len(decisive_positions),
        }

    visited = 0
    correct = 0

    model.eval()
    with torch.no_grad():
        for state, minimax_result in actionable.items():
            state_t = encode_state(state)
            mask = legal_move_mask(state)
            q_vals = model(state_t.unsqueeze(0)).squeeze(0)
            q_vals[~mask] = float("-inf")
            q_best = q_vals.max().item()

            if q_best == float("-inf"):
                continue

            visited += 1
            minimax_sign = 1 if minimax_result.value > 0 else -1
            if (q_best > 0 and minimax_sign > 0) or (q_best < 0 and minimax_sign < 0):
                correct += 1

    model.train()
    coverage = visited / total
    accuracy = correct / visited if visited > 0 else 0.0
    return {
        "coverage": round(coverage, 4),
        "accuracy": round(accuracy, 4),
        "value_agreement": round(coverage * accuracy, 4),
        "total_decisive": total,
    }


# ---------------------------------------------------------------------------
# Save / load / export
# ---------------------------------------------------------------------------


def save_model(model: DQNModel, hidden_layers: list[int], path) -> None:
    """Save model state dict and architecture info to a .pt file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"hidden_layers": hidden_layers, "state_dict": model.state_dict()}, path)


def load_model(path) -> tuple[DQNModel, list[int]]:
    """Load a model from a .pt file. Returns (model, hidden_layers)."""
    data = torch.load(path, weights_only=False)
    model = DQNModel(hidden_layers=data["hidden_layers"])
    model.load_state_dict(data["state_dict"])
    return model, data["hidden_layers"]


def export_onnx(model: DQNModel, path: str) -> None:
    """Export model to ONNX format with dynamic batch axis."""
    model.eval()
    dummy = torch.randn(1, STATE_SIZE)
    torch.onnx.export(
        model, dummy, path,
        input_names=["state"], output_names=["q_values"],
        dynamic_axes={"state": {0: "batch"}, "q_values": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )


# ---------------------------------------------------------------------------
# Internal helpers used by train()
# ---------------------------------------------------------------------------


def _save_model(model: DQNModel, hidden_layers: list[int], output_dir: str, filename: str) -> None:
    save_model(model, hidden_layers, Path(output_dir) / filename)
    print(f"  Model saved: {Path(output_dir) / filename}")


def _export_onnx(model: DQNModel, output_dir: str, filename: str) -> None:
    path = str(Path(output_dir) / filename)
    export_onnx(model, path)
    print(f"  ONNX exported: {path}")


def _flush_progress(training_log: list[dict], sample_games: list[dict], output_dir: str) -> None:
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
    episodes: int = 500_000,
    eval_interval: int = 10_000,
    snapshot_interval: int = 100_000,
    hidden_layers: list[int] | None = None,
    minimax_table: dict | None = None,
    gamma: float = 0.99,
    lr: float = 1e-3,
    epsilon_start: float = 1.0,
    epsilon_end: float = 0.05,
    epsilon_decay_frac: float = 0.2,
    batch_size: int = 64,
    buffer_capacity: int = 100_000,
    tau: float = 0.005,
    max_moves: int = 50,
    patience: int = 5,
    output_dir: str | None = None,
) -> dict:
    """
    Train a DQN agent via self-play with replay buffer and target network.

    Returns dict with: model, training_log, sample_games.
    """
    if hidden_layers is None:
        hidden_layers = [128, 64]

    model = DQNModel(hidden_layers=hidden_layers)
    target_model = copy.deepcopy(model)
    target_model.eval()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    buffer = ReplayBuffer(capacity=buffer_capacity)

    training_log: list[dict] = []
    sample_games: list[dict] = []

    epsilon_decay_episodes = int(episodes * epsilon_decay_frac)
    best_agreement = -1.0
    patience_counter = 0
    start_time = time.perf_counter()
    loss_val = 0.0

    arch_name = "x".join(str(h) for h in hidden_layers)

    print("Training config (DQN):")
    print(f"  Episodes:    {episodes:,}")
    print(f"  lr:          {lr}")
    print(f"  gamma:        {gamma}")
    print(f"  epsilon:      {epsilon_start} -> {epsilon_end} (over {epsilon_decay_frac:.0%} = {epsilon_decay_episodes:,})")
    print(f"  Architecture: {arch_name}")
    print(f"  Buffer:      {buffer_capacity:,}")
    print(f"  Batch size:  {batch_size}")
    print(f"  Tau:         {tau}")
    print(f"  Max moves:   {max_moves}")
    print(f"  Eval every:  {eval_interval:,}")
    print(f"  Snap every:  {snapshot_interval:,}")
    print(f"  Patience:    {patience}")
    print()

    for ep in range(1, episodes + 1):
        # Compute epsilon with linear decay.
        if ep <= epsilon_decay_episodes:
            epsilon = epsilon_start + (epsilon_end - epsilon_start) * (ep / epsilon_decay_episodes)
        else:
            epsilon = epsilon_end

        # Record first 10 games + last 10 before each eval checkpoint.
        remainder = ep % eval_interval
        should_record = (
            ep <= 10
            or (remainder != 0 and remainder > eval_interval - 10)
        )

        game, transitions = play_episode(model, epsilon, max_moves, record=should_record)

        if should_record:
            game["episode"] = ep
            sample_games.append(game)

        # Store all transitions from the episode.
        for t in transitions:
            buffer.add(*t)

        # Skip training until warmup complete.
        if len(buffer) < batch_size:
            continue

        # Sample and train.
        states, actions, rewards, next_states, dones = buffer.sample(batch_size)
        q_all = model(states)
        q_values = q_all.gather(1, actions.unsqueeze(1)).squeeze(1)

        with torch.no_grad():
            q_next = target_model(next_states)
            max_q_next = q_next.max(dim=1).values
            # Two-player negation: r - gamma * max(Q_target(s'))
            targets = rewards - gamma * max_q_next * (~dones).float()

        loss = nn.functional.mse_loss(q_values, targets)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        loss_val = loss.item()

        # Soft update target network (Polyak averaging).
        for p, tp in zip(model.parameters(), target_model.parameters()):
            tp.data.copy_(tau * p.data + (1 - tau) * tp.data)

        # Eval checkpoint.
        if ep % eval_interval == 0:
            elapsed = time.perf_counter() - start_time
            entry: dict = {
                "episode": ep,
                "epsilon": round(epsilon, 4),
                "loss": round(loss_val, 6),
                "buffer_size": len(buffer),
                "elapsed_seconds": round(elapsed, 1),
            }

            if minimax_table is not None:
                eval_result = evaluate(model, minimax_table)
                entry.update(eval_result)
                agreement = eval_result["value_agreement"]

                if agreement > best_agreement:
                    best_agreement = agreement
                    patience_counter = 0
                else:
                    patience_counter += 1

            training_log.append(entry)

            # Verbose progress output.
            rate = ep / elapsed if elapsed > 0 else 0
            eta_s = (episodes - ep) / rate if rate > 0 else 0
            eta_h = eta_s / 3600

            lines = [
                f"---- Episode {ep:,} / {episodes:,} ({ep/episodes:.0%}) ----",
                f"  eps={epsilon:.3f}  lr={lr}  gamma={gamma}  arch={arch_name}",
                f"  Buffer: {len(buffer):,}   Loss: {loss_val:.4f}",
                f"  Speed: {rate:,.0f} ep/s   Elapsed: {elapsed/60:,.1f} min   ETA: {eta_h:.1f} h",
            ]
            if minimax_table is not None:
                cov = entry.get("coverage", 0)
                acc = entry.get("accuracy", 0)
                agr = entry.get("value_agreement", 0)
                lines.append(f"  Coverage: {cov:.1%}   Accuracy: {acc:.1%}   Agreement: {agr:.1%}")
                if patience_counter > 0:
                    lines.append(f"  No improvement for {patience_counter}/{patience} evals")
            print("\n".join(lines))

            # Flush progress to disk.
            if output_dir is not None:
                _flush_progress(training_log, sample_games, output_dir)

            # Early stopping.
            if minimax_table is not None and patience_counter >= patience:
                print(f"Early stopping at episode {ep} (no improvement for {patience} evals)")
                break

        # Snapshot checkpoint.
        if output_dir is not None and ep % snapshot_interval == 0:
            _save_model(model, hidden_layers, output_dir, f"model_ep{ep}.pt")

    # Final export
    if output_dir:
        _save_model(model, hidden_layers, output_dir, "model_final.pt")
        # ONNX export uses the best model, not the final model
        best_path = Path(output_dir) / "model_best.pt"
        if best_path.exists():
            best_model, _ = load_model(best_path)
        else:
            best_model = model
            _save_model(model, hidden_layers, output_dir, "model_best.pt")
        _export_onnx(best_model, output_dir, "model_best.onnx")
        _flush_progress(training_log, sample_games, output_dir)
        print(f"Final artifacts saved to {output_dir}/")

    return {
        "model": model,
        "training_log": training_log,
        "sample_games": sample_games,
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Pogo DQN")
    subparsers = parser.add_subparsers(dest="command", required=True)

    tp = subparsers.add_parser("train")
    tp.add_argument("--arch", nargs="+", default=["small"],
                    help="Architecture(s): tiny, small, medium, or custom like 128,64")
    tp.add_argument("--episodes", type=int, default=500_000)
    tp.add_argument("--eval-interval", type=int, default=10_000)
    tp.add_argument("--snapshot-interval", type=int, default=100_000)
    tp.add_argument("--minimax-table", type=str, default=None)
    tp.add_argument("--output-dir", type=str, default="models/dqn")
    tp.add_argument("--lr", type=float, default=1e-3)
    tp.add_argument("--gamma", type=float, default=0.99)
    tp.add_argument("--tau", type=float, default=0.005)
    tp.add_argument("--epsilon-start", type=float, default=1.0)
    tp.add_argument("--epsilon-end", type=float, default=0.05)
    tp.add_argument("--epsilon-decay-frac", type=float, default=0.2)
    tp.add_argument("--batch-size", type=int, default=64)
    tp.add_argument("--buffer-capacity", type=int, default=100_000)
    tp.add_argument("--max-moves", type=int, default=50)
    tp.add_argument("--patience", type=int, default=5)

    ep = subparsers.add_parser("eval")
    ep.add_argument("--model", type=str, required=True)
    ep.add_argument("--minimax-table", type=str, required=True)

    args = parser.parse_args()

    if args.command == "train":
        minimax = None
        if args.minimax_table:
            from pogofish.minimax import load_table
            raw, _ = load_table(args.minimax_table)
            minimax = {s: r for s, r in raw.items() if r.value != 0.0}
            print(f"Loaded {len(minimax):,} decisive positions")

        for arch_name in args.arch:
            if arch_name in ARCHITECTURES:
                layers = ARCHITECTURES[arch_name]
            else:
                layers = [int(x) for x in arch_name.split(",")]
            arch_dir = f"{args.output_dir}/{arch_name}"
            print(f"\n{'='*60}")
            print(f"Training architecture: {arch_name}")
            print(f"{'='*60}\n")
            train(
                episodes=args.episodes, eval_interval=args.eval_interval,
                snapshot_interval=args.snapshot_interval,
                hidden_layers=layers, minimax_table=minimax,
                gamma=args.gamma, lr=args.lr,
                epsilon_start=args.epsilon_start, epsilon_end=args.epsilon_end,
                epsilon_decay_frac=args.epsilon_decay_frac,
                batch_size=args.batch_size, buffer_capacity=args.buffer_capacity,
                tau=args.tau, max_moves=args.max_moves,
                patience=args.patience, output_dir=arch_dir,
            )

    elif args.command == "eval":
        from pogofish.minimax import load_table
        raw, _ = load_table(args.minimax_table)
        decisive = {s: r for s, r in raw.items() if r.value != 0.0}
        model, layers = load_model(args.model)
        result = evaluate(model, decisive)
        print(f"Architecture: {'x'.join(str(h) for h in layers)}")
        print(f"Coverage:        {result['coverage']:.1%}")
        print(f"Accuracy:        {result['accuracy']:.1%}")
        print(f"Value agreement: {result['value_agreement']:.1%}")


if __name__ == "__main__":
    main()
