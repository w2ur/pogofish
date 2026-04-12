# Pogofish

A browser-based Pogo board game with AI opponents trained via AlphaZero reinforcement learning. Single Rust engine compiles to both native (training, solver, CLI) and WASM (web app) — one source of truth, no engine drift. Play against agents at different skill levels, explore rule variants, and watch the AI learn.

## Tech Stack

**Rust workspace** — Engine, search (minimax + MCTS), AlphaZero training (tch-rs/libtorch), terminal CLI (crossterm), WASM bridge

**Web app** — Vite, React 19, TypeScript, Tailwind CSS v4, ONNX Runtime Web

**Tools** — Python ONNX export sidecar, Node.js verification

All inference runs client-side. Zero backend.

## The Game

Pogo is played on a 3×3 grid. Each player starts with 6 pieces in 3 stacks of 2. Pick 1–3 pieces from the top of a stack you own, jump them a Manhattan distance determined by the count (1→d1, 2→d2, 3→d1|d3), and land on any cell — stacking on top. The top piece owns the stack. Win by topping every remaining stack.

Three rule variants prevent draws:
- **LC1** — Repeating a board position loses
- **LC2** — Hard move cap; player to move at cap must own all stacks or loses
- **LC3** — Soft move cap; most stacks wins, ties are draws

## Getting Started

### Play in the terminal

```bash
cargo run --release -p pogofish-cli
```

Arrow keys to navigate, Enter to select, 1/2/3 for piece count, Esc to cancel, u/R for undo/redo.

### Train an AI

```bash
cargo build --release -p pogofish-train --bin train

# Set libtorch path (auto-downloaded during build)
export DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1)

./target/release/train lc2-30 models/lc2-30 mlp_small
```

Training is crash-safe: Ctrl+C saves the best model, rerunning resumes from the last completed iteration.

### Web app

```bash
cd app && npm install && npm run dev
```

### Run tests

```bash
cargo test --workspace        # 74 Rust tests
cd app && npx vitest run      # 7 web app tests
```

## Deployment

Static deploy on Netlify from the `app/` build output.

---

Made with care by [William](https://william.revah.paris)
