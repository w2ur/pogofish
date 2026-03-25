# Pogofish

A browser-based Pogo board game with an AI opponent trained via reinforcement learning. The AI learns through self-play — from random chaos to structured strategy — verified against a minimax oracle. Watch the training process, play against agents at different skill levels, and explore the game's decision landscape.

## Tech Stack

**Training pipeline** — Python 3.11+, PyTorch, NumPy, ONNX

**Web app** — Vite, React 19, TypeScript, Tailwind CSS v4, ONNX Runtime Web

All inference runs client-side. Zero backend.

## Training Pipeline

The RL pipeline progresses through increasingly sophisticated approaches:

1. **Minimax solver** — Exhaustive depth-20 oracle (9.85M states, 975K decisive positions)
2. **Tabular Q-learning** — Self-play baseline. 99% accuracy but only 2% coverage — proves the algorithm works, motivates neural networks
3. **DQN** — Deep Q-Network replacing the Q-table with a neural net for generalization *(next)*
4. **AlphaZero** — MCTS + neural net for strongest play *(planned)*

## Getting Started

### Training pipeline

```bash
cd training
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

```bash
# Play interactively
PYTHONPATH=. python -m pogofish

# Solve the game (depth 20, ~4 min)
PYTHONPATH=. python -m pogofish.minimax solve --max-ply 20

# Train Q-learning agent (2M episodes)
PYTHONPATH=. python -m pogofish.q_learning train --minimax-table models/minimax_table.json.gz
```

### Web app

```bash
cd app
npm install
npm run dev
```

## Deployment

Static deploy on Netlify from the `app/` build output.

---

Made with care by [William](https://william.revah.paris)
