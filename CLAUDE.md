# CLAUDE.md — pogofish

## Project Overview

Pogofish is a browser-based Pogo board game with an AI opponent trained via reinforcement learning. The AI learns through self-play (tabular Q-learning → DQN → AlphaZero), verified against a minimax oracle. Users can play against the AI at various difficulty levels, visualize the RL training process, and explore the game's strategy. Dual codebase: Python training pipeline + React/TS web app. All inference runs client-side via ONNX Runtime Web — zero backend.

## Tech Stack

### Training pipeline (`training/`)
- Python 3.11+
- PyTorch (DQN, AlphaZero)
- NumPy
- ONNX (model export)
- Minimax solver (depth-20 oracle, 9.85M states)

### Web app (`app/`)
- Vite
- React 19
- TypeScript
- Tailwind CSS v4
- ONNX Runtime Web (client-side inference)

## User-Facing Language

Bilingual FR/EN.

## Development

### Training pipeline
```bash
cd training
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Note: most scripts require `PYTHONPATH=.` when running from the `training/` directory.

### Key CLI commands
```bash
# Minimax solve (depth 20, ~4 min on M2)
PYTHONPATH=. python -m pogofish.minimax solve --max-ply 20

# Q-learning training (2M episodes, ~2-5 hours)
PYTHONPATH=. python -m pogofish.q_learning train --minimax-table models/minimax_table.json.gz

# DQN training (500k episodes, verifies against minimax)
PYTHONPATH=. python -m pogofish.dqn train --arch small --minimax-table models/minimax_table.json.gz
PYTHONPATH=. python -m pogofish.dqn train --arch tiny small medium  # multi-arch sweep
PYTHONPATH=. python -m pogofish.dqn eval --model models/dqn/small/model_best.pt --minimax-table models/minimax_table.json.gz

# AlphaZero training (100 iterations x 500 games, MCTS)
PYTHONPATH=. python -m pogofish.alphazero train --arch mlp_small --minimax-table models/minimax_table.json.gz
PYTHONPATH=. python -m pogofish.alphazero train --arch mlp_tiny mlp_small mlp_medium cnn  # multi-arch sweep
PYTHONPATH=. python -m pogofish.alphazero eval --model models/alphazero/mlp_small/model_best.pt --minimax-table models/minimax_table.json.gz

# Interactive CLI game
PYTHONPATH=. python -m pogofish
```

### Web app
```bash
cd app
npm install
npm run dev        # dev server
npm run build      # production build
npx vitest run     # run tests
```

## Project Structure

```
training/
  pogofish/
    engine.py        # GameState, Move, legal_moves, apply_move, is_terminal
    minimax.py       # Negamax + alpha-beta, CLI with --max-ply, export/import
    encoding.py      # Shared state/move string encoding for serialization
    q_learning.py    # QTable, train, evaluate, export/import, CLI
    dqn.py           # DQNModel, train, evaluate, save/load, ONNX export, CLI
    mcts.py          # MCTS tree search (PUCT, Dirichlet, temperature)
    alphazero.py     # AlphaZero dual-head nets, self-play, gatekeeper, CLI
    cli.py           # Curses interactive game UI
  tests/             # pytest (100+ fast + slow behind --runslow)
  models/            # Training artifacts (gitignored)
app/
  src/
    engine/          # TypeScript game engine (GameState, legal moves, transitions)
    ai/              # AI system (Random, Minimax, ONNX-based DQN/AlphaZero, MCTS)
    components/      # React UI components (Board, GameControls, panels)
    hooks/           # Custom hooks (useAI, useGame)
    stores/          # Zustand stores (game state)
  public/
    models/          # ONNX models + minimax table (gitignored)
    icon.svg         # PWA icon
    favicon.svg      # Favicon
```

## Testing

- Training: `cd training && python -m pytest tests/ -v` (76 fast tests)
- Slow tests: `python -m pytest tests/ -v --runslow` (includes full solve + integration)
- App: `cd app && npx vitest run` (Vitest, tests colocated with source files)

## Build Warning Exceptions

- `DeprecationWarning: You are using the legacy TorchScript-based ONNX export` — emitted by PyTorch 2.9+ when `dynamo=False`. The dynamo exporter (default) requires the `onnxscript` package which is not in requirements.txt. Using the legacy path intentionally until `onnxscript` is added as a dependency. Tracked: add `onnxscript` to requirements.txt when upgrading ONNX export path.

## Deployment

Netlify — static deploy of the `app/` build output. No server-side code.

## Project-Specific Rules

- State space is ~10M+ positions. Tabular methods hit a wall at ~2% coverage. Deep RL (DQN, AlphaZero) is required for meaningful AI play.
- Minimax `full_solve()` uses MAX_PLY=50 by default — always pass `--max-ply 20` for practical solves (~4 min vs hours/days).
- Training artifacts go in `training/models/` (gitignored). 8 GB RAM M2 Mac — keep neural nets small.
