"""
Generate cross-validation fixtures and sample games for the web app.

Outputs:
  app/src/engine/fixtures.json    — 30 GameState fixtures with expected engine outputs
  app/src/data/sample-games.json  — 25 sample game replays
"""

from __future__ import annotations

import gzip
import json
import random
import sys
from pathlib import Path

import torch

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
TRAINING_DIR = REPO_ROOT / "training"
APP_SRC_DIR = REPO_ROOT / "app" / "src"

# Models are gitignored and may live in the main worktree or a sibling path.
# Check for a sentinel file to confirm models are actually present.
_sentinel = "dqn/tiny/model_best.pt"
_local_models = TRAINING_DIR / "models"
_main_models = Path(__file__).resolve().parents[4] / "training" / "models"
if (_local_models / _sentinel).exists():
    MODELS_DIR = _local_models
elif (_main_models / _sentinel).exists():
    MODELS_DIR = _main_models
else:
    raise FileNotFoundError(
        f"Cannot find models directory (sentinel: {_sentinel}). Tried:\n"
        f"  {_local_models}\n  {_main_models}"
    )

# Ensure training module is importable
sys.path.insert(0, str(TRAINING_DIR))

from pogofish.engine import (
    W, R, GameState, Move,
    initial_state, legal_moves, apply_move, is_terminal, winner,
)
from pogofish.dqn import (
    encode_state, move_to_action, action_to_move, ACTION_SIZE,
    load_model as dqn_load_model, legal_move_mask,
)
from pogofish.alphazero import load_model as az_load_model
from pogofish.encoding import state_to_key

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SEED = 42
MAX_GAME_STEPS = 300  # safety cap to avoid infinite loops


def _random_move(state: GameState, rng: random.Random) -> Move:
    moves = legal_moves(state)
    return rng.choice(moves)


def _play_game_random_vs_random(rng: random.Random) -> tuple[list[Move], str | None]:
    """Play a game with both players choosing randomly. Returns (moves, winner)."""
    state = initial_state()
    moves: list[Move] = []
    for _ in range(MAX_GAME_STEPS):
        if is_terminal(state):
            break
        move = _random_move(state, rng)
        moves.append(move)
        state = apply_move(state, move)
    return moves, winner(state)


def _dqn_move(model: torch.nn.Module, state: GameState, rng: random.Random) -> Move:
    """Choose a move using DQN (greedy). Falls back to random if all Q-values masked."""
    moves = legal_moves(state)
    assert moves, "No legal moves — should not reach move selection on terminal state"
    with torch.no_grad():
        enc = encode_state(state).unsqueeze(0)
        q_vals = model(enc).squeeze(0)
        mask = legal_move_mask(state)
        q_vals[~mask] = float("-inf")
        action = int(q_vals.argmax().item())
        move = action_to_move(action)
        # Verify the move is actually legal (sanity check)
        if move in moves:
            return move
        # Fallback: pick legal action with highest Q
        legal_actions = [move_to_action(m) for m in moves]
        best_action = max(legal_actions, key=lambda a: q_vals[a].item())
        return action_to_move(best_action)


def _az_move(model: torch.nn.Module, state: GameState, rng: random.Random) -> Move:
    """Choose a move using AlphaZero policy head (greedy). Falls back to random."""
    moves = legal_moves(state)
    assert moves, "No legal moves — should not reach move selection on terminal state"
    with torch.no_grad():
        enc = encode_state(state).unsqueeze(0)
        policy_logits, _value = model(enc)
        policy_logits = policy_logits.squeeze(0)
        mask = legal_move_mask(state)
        policy_logits[~mask] = float("-inf")
        action = int(policy_logits.argmax().item())
        move = action_to_move(action)
        if move in moves:
            return move
        legal_actions = [move_to_action(m) for m in moves]
        best_action = max(legal_actions, key=lambda a: policy_logits[a].item())
        return action_to_move(best_action)


def _minimax_move(minimax_states: dict, state: GameState, rng: random.Random) -> Move:
    """Choose the minimax best move if in table, else random."""
    key = state_to_key(state)
    entry = minimax_states.get(key)
    if entry and "m" in entry:
        m = entry["m"]
        return Move(from_cell=m[0], num_pieces=m[1], to_cell=m[2])
    return _random_move(state, rng)


def _play_game(
    white_fn,
    red_fn,
    rng: random.Random,
) -> tuple[list[Move], str | None]:
    """
    Play a game with two move-selection functions.

    white_fn / red_fn: callable(state, rng) -> Move
    Returns (moves, winner_or_None).
    """
    state = initial_state()
    moves: list[Move] = []
    fn_map = {W: white_fn, R: red_fn}
    for _ in range(MAX_GAME_STEPS):
        if is_terminal(state):
            break
        move = fn_map[state.current_player](state, rng)
        moves.append(move)
        state = apply_move(state, move)
    return moves, winner(state)


def _game_to_dict(moves: list[Move], white: str, red: str, w: str | None) -> dict:
    return {
        "moves": [[m.from_cell, m.num_pieces, m.to_cell] for m in moves],
        "white": white,
        "red": red,
        "winner": w,
    }


# ---------------------------------------------------------------------------
# Fixture generation
# ---------------------------------------------------------------------------

def generate_fixtures(n: int = 30, seed: int = SEED) -> list[dict]:
    """
    Generate n fixtures covering:
    - The initial state
    - ~(n-1) random mid-game states

    Each fixture has:
      stateKey      : compact string key of the state
      board         : list of 9 cells, each a list of piece chars
      currentPlayer : "W" or "R"
      legalMoves    : list of [fromCell, numPieces, toCell]
      encoding      : list of 109 floats (encode_state output)
      actionIndices : list of action indices for each legal move
      isTerminal    : bool
      winner        : "W" | "R" | null
    """
    rng = random.Random(seed)
    fixtures: list[dict] = []

    # First fixture: initial state
    state = initial_state()
    fixtures.append(_state_to_fixture(state))

    # Remaining: random mid-game states
    attempts = 0
    while len(fixtures) < n and attempts < n * 50:
        attempts += 1
        state = initial_state()
        # Random walk of 1-40 moves
        steps = rng.randint(1, 40)
        for _ in range(steps):
            if is_terminal(state):
                break
            state = apply_move(state, _random_move(state, rng))
        fixtures.append(_state_to_fixture(state))

    return fixtures[:n]


def _state_to_fixture(state: GameState) -> dict:
    moves = legal_moves(state)
    enc = encode_state(state)
    return {
        "stateKey": state_to_key(state),
        "board": [list(cell) for cell in state.board],
        "currentPlayer": state.current_player,
        "legalMoves": [[m.from_cell, m.num_pieces, m.to_cell] for m in moves],
        "encoding": enc.tolist(),
        "actionIndices": [move_to_action(m) for m in moves],
        "isTerminal": is_terminal(state),
        "winner": winner(state),
    }


# ---------------------------------------------------------------------------
# Sample game generation
# ---------------------------------------------------------------------------

def generate_sample_games(seed: int = SEED) -> list[dict]:
    """
    Generate 25 sample games:
      5 Random vs Random
      5 DQN tiny vs Random
      5 AlphaZero CNN vs Random
      5 Minimax vs AlphaZero CNN
      5 Q-learning proxy (DQN tiny) vs Random  [labeled "q-learning"]
    """
    rng = random.Random(seed)
    games: list[dict] = []

    print("Loading DQN tiny model...", flush=True)
    dqn_model, _ = dqn_load_model(MODELS_DIR / "dqn" / "tiny" / "model_best.pt")
    dqn_model.eval()

    print("Loading AlphaZero CNN model...", flush=True)
    az_model, _arch = az_load_model(MODELS_DIR / "alphazero" / "cnn" / "model_best.pt")
    az_model.eval()

    print("Loading minimax table (this may take a moment)...", flush=True)
    with gzip.open(MODELS_DIR / "minimax_table.json.gz", "rt") as f:
        minimax_data = json.load(f)
    minimax_states = minimax_data["states"]
    print(f"  Minimax table: {len(minimax_states):,} states", flush=True)

    rand_fn = _random_move
    dqn_fn = lambda s, r: _dqn_move(dqn_model, s, r)
    az_fn = lambda s, r: _az_move(az_model, s, r)
    mm_fn = lambda s, r: _minimax_move(minimax_states, s, r)

    # 5 Random vs Random
    print("Generating 5 Random vs Random games...", flush=True)
    for _ in range(5):
        moves, w = _play_game(rand_fn, rand_fn, rng)
        games.append(_game_to_dict(moves, "random", "random", w))

    # 5 DQN tiny (White) vs Random (Red)
    print("Generating 5 DQN vs Random games...", flush=True)
    for _ in range(5):
        moves, w = _play_game(dqn_fn, rand_fn, rng)
        games.append(_game_to_dict(moves, "dqn-tiny", "random", w))

    # 5 AlphaZero CNN (White) vs Random (Red)
    print("Generating 5 AlphaZero CNN vs Random games...", flush=True)
    for _ in range(5):
        moves, w = _play_game(az_fn, rand_fn, rng)
        games.append(_game_to_dict(moves, "alphazero-cnn", "random", w))

    # 5 Minimax (White) vs AlphaZero CNN (Red)
    print("Generating 5 Minimax vs AlphaZero games...", flush=True)
    for _ in range(5):
        moves, w = _play_game(mm_fn, az_fn, rng)
        games.append(_game_to_dict(moves, "minimax", "alphazero-cnn", w))

    # 5 Q-learning proxy (DQN tiny as proxy) vs Random
    print("Generating 5 Q-learning proxy vs Random games...", flush=True)
    for _ in range(5):
        moves, w = _play_game(dqn_fn, rand_fn, rng)
        games.append(_game_to_dict(moves, "q-learning", "random", w))

    return games


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    out_fixtures = APP_SRC_DIR / "engine" / "fixtures.json"
    out_games = APP_SRC_DIR / "data" / "sample-games.json"

    out_fixtures.parent.mkdir(parents=True, exist_ok=True)
    out_games.parent.mkdir(parents=True, exist_ok=True)

    print("=== Generating cross-validation fixtures ===", flush=True)
    fixtures = generate_fixtures(n=30, seed=SEED)
    out_fixtures.write_text(json.dumps(fixtures, indent=2))
    print(f"  Written: {out_fixtures} ({out_fixtures.stat().st_size:,} bytes)", flush=True)
    print(f"  Fixtures: {len(fixtures)}", flush=True)

    print("\n=== Generating sample games ===", flush=True)
    games = generate_sample_games(seed=SEED)
    out_games.write_text(json.dumps(games, indent=2))
    print(f"  Written: {out_games} ({out_games.stat().st_size:,} bytes)", flush=True)
    print(f"  Games: {len(games)}", flush=True)

    # Print a quick summary
    print("\n=== Summary ===", flush=True)
    by_type: dict[str, list] = {}
    for g in games:
        key = f"{g['white']} vs {g['red']}"
        by_type.setdefault(key, []).append(g["winner"])
    for matchup, results in by_type.items():
        wins = {r: results.count(r) for r in set(results)}
        print(f"  {matchup}: {wins}", flush=True)

    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
