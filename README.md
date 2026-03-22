# Pogofish

A browser-based Pogo board game with an AI opponent trained via reinforcement learning. The AI learns to play optimally through self-play (tabular Q-learning, then deep RL with PPO), and its optimality is verified against an exhaustive minimax solution. Play against the AI at various difficulty levels, visualize the training process, and explore the game's perfect strategy.

## Tech Stack

**Training pipeline** — Python 3.11+, PyTorch, NumPy, ONNX

**Web app** — Vite, React 19, TypeScript, Tailwind CSS v4, ONNX Runtime Web

All inference runs client-side. Zero backend.

## Getting Started

### Training pipeline

```bash
cd training
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
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
