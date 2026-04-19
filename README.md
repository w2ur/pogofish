# Pogofish

A longform article about training an AI to play a forgotten 3×3 board game — with the playable game inlined at the climax. Bilingual FR/EN (FR pass in progress). Single-page web app; no server.

The article walks through a real build: why the problem is harder than it looks, why a minimax solver hits a wall, a failed DQN attempt, an AlphaZero agent that worked, a rule-variant sweep that picked the playable balance, and a section showing what the trained network actually learned about winning from 500 self-play games.

## Read it

```bash
cd app && npm install && npm run dev
```

Then open `http://localhost:5173`. The CTA in the bottom-right (`▶ Play`) or the URL anchor `#play` jumps to the inline game.

## What's in the box

### `crates/` — Rust workspace

- `pogofish-engine` — game rules, state, legal moves, rule variants (LC1/LC2/LC3).
- `pogofish-search` — minimax (alpha-beta + transposition table), MCTS (PUCT), checkpointer.
- `pogofish-train` — AlphaZero training via tch-rs/libtorch, self-play, gatekeeper, and an `analyze` binary that produces the insights JSON the article reads.
- `pogofish-cli` — terminal UI (crossterm, curses-style).
- `pogofish-wasm` — wasm-bindgen wrappers for the browser.

### `app/` — web app

React 19 + TypeScript + Vite + Tailwind v4. The entire app is one scroll-driven story page; the playable game is a scene within it. No routing, no backend — all inference runs client-side via ONNX Runtime Web against models loaded from `app/public/models/`.

### `models/` — gitignored training artifacts

LC1-2 (Sudden Death) and LC3-29 (Classic) AlphaZero models ship as ONNX under `app/public/models/`.

## The game itself

Pogo is played on a 3×3 grid. Each player starts with 6 pieces in 3 stacks of 2. Pick 1–3 pieces from the top of a stack you own, jump them a Manhattan distance determined by the count (1→d1, 2→d2, 3→d1|d3), and land on any cell — stacking on top. The top piece owns the stack. Win by topping every remaining stack. Three rule variants resolve the infinite-game problem:

- **LC1** — repeating a board position loses.
- **LC2** — hard move cap; player to move at cap must own all stacks or loses.
- **LC3** — soft move cap; most stacks wins, ties are draws.

The web article ships **LC1-2** (fast, sudden-death) and **LC3-29** (balanced, draws possible — the default).

## Development

```bash
# Rust
cargo check --workspace
cargo test --workspace

# Web app
cd app && npx vitest run
cd app && npm run build

# Terminal game
cargo run --release -p pogofish-cli

# Train (requires libtorch; tch-rs downloads it)
DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1) \
  ./target/release/train lc3-29 models/lc3-29 mlp_small

# Regenerate the "what the AI learned" JSON
DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1) \
  ./target/release/analyze models/lc3-29 app/public/data/lc3-29-insights.json 500
```

## Deployment

Static deploy on Netlify from `app/`. No server-side code.

---

Made with care by [William](https://william.revah.paris).
