"""
Tabular Q-learning for Pogo.

Memory-optimized: uses native GameState/Move tuple keys (hashable NamedTuples)
instead of string encoding. String conversion happens only at export time.

Two-player Q-update: Q[s][a] += α * (r - γ * max(Q[s']) - Q[s][a])
The negation (-γ instead of +γ) accounts for the opponent's turn at s'.
"""

from __future__ import annotations

import gzip
import json
import random
import time
from pathlib import Path
from typing import TYPE_CHECKING

from pogofish.engine import (
    GameState, Move,
    initial_state, legal_moves, apply_move,
    is_terminal, reward as engine_reward, winner,
)
from pogofish.encoding import state_to_key, key_to_state, move_to_key, key_to_move

if TYPE_CHECKING:
    from pogofish.minimax import SolveResult


class QTable:
    """
    Tabular Q-function for Pogo.

    Keys are native GameState and Move NamedTuples (hashable, memory-efficient).
    No string conversion during training — only at export time.
    """

    def __init__(self) -> None:
        # GameState → {Move → Q-value}
        self._table: dict[GameState, dict[Move, float]] = {}

    def __len__(self) -> int:
        return len(self._table)

    def __contains__(self, state: GameState) -> bool:
        return state in self._table

    def get_value(self, state: GameState, move: Move) -> float:
        """Get Q(s, a). Returns 0.0 for unvisited pairs."""
        state_entry = self._table.get(state)
        if state_entry is None:
            return 0.0
        return state_entry.get(move, 0.0)

    def set_value(self, state: GameState, move: Move, value: float) -> None:
        """Set Q(s, a)."""
        if state not in self._table:
            self._table[state] = {}
        self._table[state][move] = value

    def best_value(self, state: GameState, moves: list[Move]) -> float:
        """Return max Q-value among the given moves. Returns 0.0 if none visited."""
        state_entry = self._table.get(state)
        if state_entry is None:
            return 0.0
        return max((state_entry.get(m, 0.0) for m in moves), default=0.0)

    def epsilon_greedy(
        self, state: GameState, moves: list[Move], epsilon: float
    ) -> Move:
        """Pick a move using epsilon-greedy policy."""
        if random.random() < epsilon:
            return random.choice(moves)
        # Greedy: pick the move with highest Q-value (random tiebreak).
        state_entry = self._table.get(state, {})
        best_val = max((state_entry.get(m, 0.0) for m in moves), default=0.0)
        best_moves = [m for m in moves if state_entry.get(m, 0.0) == best_val]
        return random.choice(best_moves)

    def update(
        self,
        state: GameState,
        move: Move,
        reward: float,
        next_state: GameState,
        alpha: float,
        gamma: float,
    ) -> None:
        """
        Two-player Q-update with negation.

        Target = r - γ * max(Q[s']) for non-terminal s'.
        The negation is because s' is the opponent's turn —
        their best outcome is our worst.
        """
        if state not in self._table:
            self._table[state] = {}
        old_q = self._table[state].get(move, 0.0)

        if is_terminal(next_state):
            target = reward
        else:
            next_moves = legal_moves(next_state)
            if not next_moves:
                # Opponent stuck = we effectively won.
                target = reward
            else:
                max_next = self.best_value(next_state, next_moves)
                target = reward - gamma * max_next

        self._table[state][move] = old_q + alpha * (target - old_q)


def play_episode(
    qt: QTable,
    epsilon: float,
    alpha: float,
    gamma: float,
    max_moves: int = 50,
    record: bool = False,
) -> dict:
    """
    Play one self-play episode. Both sides use the same Q-table.

    Returns a game record dict:
      {"moves": [...], "result": str, "num_moves": int}
    If record=True, moves list contains full move data (string-encoded for JSON).
    If record=False, moves list is empty (saves memory during bulk training).
    """
    state = initial_state()
    moves_log: list[dict] = []
    move_count = 0
    next_state = state  # Initialize for the result check after loop.

    while move_count < max_moves:
        moves = legal_moves(state)

        if not moves:
            # Current player stuck = loss.
            break

        move = qt.epsilon_greedy(state, moves, epsilon)

        if record:
            # String encoding only when recording for JSON export.
            moves_log.append({
                "state": state_to_key(state),
                "move": move_to_key(move),
                "player": state.current_player,
            })

        next_state = apply_move(state, move)
        r = engine_reward(next_state, state.current_player)
        qt.update(state, move, r, next_state, alpha, gamma)

        move_count += 1

        if is_terminal(next_state):
            break

        state = next_state

    # Determine result.
    if is_terminal(next_state):
        w = winner(next_state)
        result = f"{w}_wins" if w else "draw"
    else:
        result = "draw"

    return {
        "moves": moves_log,
        "result": result,
        "num_moves": move_count,
    }


def train(
    episodes: int = 5_000_000,
    eval_interval: int = 50_000,
    snapshot_interval: int = 1_000_000,
    minimax_table: dict | None = None,
    alpha_start: float = 0.1,
    alpha_end: float = 0.01,
    gamma: float = 0.99,
    epsilon_start: float = 1.0,
    epsilon_end: float = 0.05,
    epsilon_decay_frac: float = 0.8,
    max_moves: int = 50,
    patience: int = 3,
    output_dir: str | None = None,
) -> dict:
    """
    Train a Q-learning agent via self-play.

    Eval runs every eval_interval episodes (cheap — reads existing table).
    Q-table snapshots saved every snapshot_interval episodes (expensive — writes to disk).

    Returns dict with: q_table, training_log, sample_games.
    """
    qt = QTable()
    training_log: list[dict] = []
    sample_games: list[dict] = []

    epsilon_decay_episodes = int(episodes * epsilon_decay_frac)
    best_agreement = -1.0
    patience_counter = 0
    start_time = time.perf_counter()

    for ep in range(1, episodes + 1):
        # Compute epsilon and alpha with linear decay.
        if ep <= epsilon_decay_episodes:
            epsilon = epsilon_start + (epsilon_end - epsilon_start) * (ep / epsilon_decay_episodes)
        else:
            epsilon = epsilon_end

        alpha = alpha_start + (alpha_end - alpha_start) * (ep / episodes)

        # Record first 10 games and last 10 before each eval checkpoint.
        remainder = ep % eval_interval
        should_record = (
            ep <= 10
            or (remainder != 0 and remainder > eval_interval - 10)
        )

        game = play_episode(qt, epsilon, alpha, gamma, max_moves, record=should_record)

        if should_record:
            game["episode"] = ep
            sample_games.append(game)

        # Eval checkpoint (cheap — just iterates existing table).
        if ep % eval_interval == 0:
            elapsed = time.perf_counter() - start_time
            entry: dict = {
                "episode": ep,
                "epsilon": round(epsilon, 4),
                "alpha": round(alpha, 4),
                "q_table_size": len(qt),
                "elapsed_seconds": round(elapsed, 1),
            }

            if minimax_table is not None:
                # evaluate() is defined in Task 4 — only called when minimax_table provided.
                eval_result = evaluate(qt, minimax_table)
                entry.update(eval_result)
                agreement = eval_result["value_agreement"]

                if agreement > best_agreement:
                    best_agreement = agreement
                    patience_counter = 0
                else:
                    patience_counter += 1

            training_log.append(entry)

            print(
                f"[{ep:>8,}] ε={epsilon:.3f} α={alpha:.4f} "
                f"|Q|={len(qt):,} "
                f"t={elapsed:.0f}s"
                + (f" agree={entry.get('value_agreement', '?'):.1%}" if minimax_table else "")
            )

            # Early stopping.
            if minimax_table is not None and patience_counter >= patience:
                print(f"Early stopping at episode {ep} (no improvement for {patience} evals)")
                break

        # Snapshot checkpoint (expensive — writes Q-table to disk).
        if output_dir is not None and ep % snapshot_interval == 0:
            _export_checkpoint(qt, ep, training_log[-1] if training_log else {}, output_dir)

    # Final export.
    if output_dir is not None:
        _export_final(qt, training_log, sample_games, output_dir)

    return {
        "q_table": qt,
        "training_log": training_log,
        "sample_games": sample_games,
    }


def evaluate(
    qt: QTable,
    decisive_positions: dict[GameState, SolveResult],
) -> dict:
    """
    Evaluate Q-table against decisive minimax positions.

    Both Q-table and minimax use native GameState keys — no conversion needed.

    For each decisive position, checks whether sign(max(Q[state])) matches
    the minimax value sign. This measures "does the agent understand who's
    winning?" — not whether it picks the optimal move.

    Returns dict with:
      - coverage: fraction of decisive positions with non-zero best Q-value
      - accuracy: fraction of covered positions with correct value sign
      - value_agreement: coverage * accuracy (overall correctness)
      - total_decisive: total number of decisive positions
    """
    # Filter to positions with legal moves (terminal/stuck states can't appear
    # in the Q-table — exclude from denominator).
    actionable = {
        s: r for s, r in decisive_positions.items() if legal_moves(s)
    }
    total = len(actionable)
    if total == 0:
        return {"coverage": 0.0, "accuracy": 0.0, "value_agreement": 0.0, "total_decisive": len(decisive_positions)}

    visited = 0
    correct = 0

    for state, minimax_result in actionable.items():
        if state not in qt:
            continue

        moves = legal_moves(state)
        q_best = qt.best_value(state, moves)
        if q_best == 0.0:
            # All Q-values still at default — not meaningfully learned.
            continue

        visited += 1
        minimax_sign = 1 if minimax_result.value > 0 else -1

        if (q_best > 0 and minimax_sign > 0) or (q_best < 0 and minimax_sign < 0):
            correct += 1

    coverage = visited / total
    accuracy = correct / visited if visited > 0 else 0.0
    value_agreement = coverage * accuracy

    return {
        "coverage": round(coverage, 4),
        "accuracy": round(accuracy, 4),
        "value_agreement": round(value_agreement, 4),
        "total_decisive": total,
    }


def export_q_table(
    qt: QTable,
    path: str | Path,
    meta: dict | None = None,
) -> None:
    """
    Export Q-table as gzipped JSON.
    Converts native GameState/Move keys to strings at export time.
    """
    serialized: dict[str, dict[str, float]] = {}
    for state, moves_dict in qt._table.items():
        sk = state_to_key(state)
        serialized[sk] = {move_to_key(m): v for m, v in moves_dict.items()}

    data = {
        "meta": meta or {},
        "q_table": serialized,
    }
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))


def load_q_table(path: str | Path) -> tuple[QTable, dict]:
    """
    Load Q-table from gzipped JSON.
    Converts string keys back to native GameState/Move objects.
    """
    with gzip.open(path, "rt", encoding="utf-8") as f:
        data = json.load(f)

    qt = QTable()
    for sk, moves_dict in data["q_table"].items():
        state = key_to_state(sk)
        qt._table[state] = {key_to_move(mk): v for mk, v in moves_dict.items()}

    return qt, data.get("meta", {})


def _export_checkpoint(qt: QTable, episode: int, entry: dict, output_dir: str) -> None:
    """Save a Q-table checkpoint snapshot."""
    out = Path(output_dir)
    path = out / f"q_table_checkpoint_{episode}.json.gz"
    export_q_table(qt, path, meta=entry)
    print(f"  Snapshot saved: {path}")


def _export_final(
    qt: QTable,
    training_log: list[dict],
    sample_games: list[dict],
    output_dir: str,
) -> None:
    """Save final Q-table, training log, and sample games."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    meta = training_log[-1] if training_log else {}
    export_q_table(qt, out / "q_table_final.json.gz", meta=meta)

    with open(out / "training_log.json", "w") as f:
        json.dump(training_log, f, indent=2)

    with open(out / "sample_games.json", "w") as f:
        json.dump(sample_games, f, indent=2)

    print(f"Final artifacts saved to {out}/")


def main() -> None:
    """CLI entry point: cd training && python -m pogofish.q_learning train/eval."""
    import argparse

    parser = argparse.ArgumentParser(description="Pogo Q-Learning")
    subparsers = parser.add_subparsers(dest="command", required=True)

    tp = subparsers.add_parser("train", help="Train via self-play")
    tp.add_argument("--episodes", type=int, default=5_000_000)
    tp.add_argument("--eval-interval", type=int, default=50_000)
    tp.add_argument("--snapshot-interval", type=int, default=1_000_000)
    tp.add_argument("--minimax-table", type=str, default=None)
    tp.add_argument("--output-dir", type=str, default="training/models/q_learning")
    tp.add_argument("--alpha-start", type=float, default=0.1)
    tp.add_argument("--alpha-end", type=float, default=0.01)
    tp.add_argument("--gamma", type=float, default=0.99)
    tp.add_argument("--epsilon-start", type=float, default=1.0)
    tp.add_argument("--epsilon-end", type=float, default=0.05)
    tp.add_argument("--epsilon-decay-frac", type=float, default=0.8)
    tp.add_argument("--max-moves", type=int, default=50)
    tp.add_argument("--patience", type=int, default=3)

    ep = subparsers.add_parser("eval", help="Evaluate Q-table vs minimax")
    ep.add_argument("--q-table", type=str, required=True)
    ep.add_argument("--minimax-table", type=str, required=True)

    args = parser.parse_args()

    if args.command == "train":
        minimax = None
        if args.minimax_table:
            from pogofish.minimax import load_table
            raw_table, meta = load_table(args.minimax_table)
            minimax = {s: r for s, r in raw_table.items() if r.value != 0.0}
            print(f"Loaded {len(minimax):,} decisive positions from minimax table")

        train(
            episodes=args.episodes,
            eval_interval=args.eval_interval,
            snapshot_interval=args.snapshot_interval,
            minimax_table=minimax,
            alpha_start=args.alpha_start,
            alpha_end=args.alpha_end,
            gamma=args.gamma,
            epsilon_start=args.epsilon_start,
            epsilon_end=args.epsilon_end,
            epsilon_decay_frac=args.epsilon_decay_frac,
            max_moves=args.max_moves,
            patience=args.patience,
            output_dir=args.output_dir,
        )
    elif args.command == "eval":
        from pogofish.minimax import load_table
        raw_table, _ = load_table(args.minimax_table)
        decisive = {s: r for s, r in raw_table.items() if r.value != 0.0}

        qt, meta = load_q_table(args.q_table)
        result = evaluate(qt, decisive)
        print(f"Coverage:        {result['coverage']:.1%}")
        print(f"Accuracy:        {result['accuracy']:.1%}")
        print(f"Value agreement: {result['value_agreement']:.1%}")
        print(f"Decisive states: {result['total_decisive']:,}")


if __name__ == "__main__":
    main()
