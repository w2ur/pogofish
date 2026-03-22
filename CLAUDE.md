# CLAUDE.md — pogofish

## Project Overview

Pogofish is a browser-based Pogo board game with an AI opponent trained via reinforcement learning. The AI learns to play optimally through self-play (tabular Q-learning, then deep RL with PPO), and its optimality is verified against an exhaustive minimax solution. Users can play against the AI at various difficulty levels, visualize the RL training process, and explore the game's perfect strategy. Dual codebase: Python training pipeline + React/TS web app. All inference runs client-side via ONNX Runtime Web — zero backend.

## Tech Stack

### Training pipeline (`training/`)
- Python 3.11+
- PyTorch (Q-learning, PPO)
- NumPy
- ONNX (model export)
- Minimax solver (exhaustive verification)

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

### Web app
```bash
cd app
npm install
npm run dev
```

## Project Structure

```
training/          # Python RL training pipeline
  models/          # Exported ONNX models
app/               # Vite + React web app
  public/models/   # ONNX models copied for client-side use
```

## Testing

- Training: pytest
- App: Vitest

## Deployment

Netlify — static deploy of the `app/` build output. No server-side code.
