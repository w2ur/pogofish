# CLAUDE.md — pogofish

## Project Overview

Pogofish is a browser-based Pogo board game with AI opponents trained via AlphaZero reinforcement learning. Single Rust engine compiled to both native (training, solver, CLI) and WASM (web app), eliminating the prior Python/TypeScript engine-drift risk. The project explores multiple losing-condition rule variants (LC1/LC2/LC3) through staged RL experiments. All inference runs client-side via ONNX Runtime Web — zero backend.

## Tech Stack

### Rust workspace (`crates/`)
- Rust 1.79+ (stable toolchain)
- `pogofish-engine` — Game rules, state, legal moves, rule variants (LC1/LC2/LC3)
- `pogofish-search` — Minimax (alpha-beta + TT), MCTS (PUCT), checkpointer
- `pogofish-train` — AlphaZero training (tch-rs/libtorch), self-play, gatekeeper
- `pogofish-cli` — Curses-style terminal UI (crossterm)
- `pogofish-wasm` — wasm-bindgen wrappers for browser use

### Web app (`app/`)
- Vite
- React 19
- TypeScript
- Tailwind CSS v4
- ONNX Runtime Web (client-side inference)
- Rust WASM engine (via `pogofish-wasm`)

### Tools (`tools/`)
- Python 3.11+ — ONNX export sidecar (`export_onnx.py`)
- Node.js — ONNX verification (`verify_onnx.js`)

## User-Facing Language

Bilingual FR/EN.

## Development

### Rust workspace
```bash
cargo check --workspace       # type check all crates
cargo test --workspace        # run all tests (74 tests)
cargo build --release -p pogofish-cli --bin pogofish   # CLI game
cargo build --release -p pogofish-train --bin train     # training binary
```

### CLI game
```bash
cargo run --release -p pogofish-cli
# Arrow keys navigate, Enter selects, 1/2/3 piece count, Esc cancels
# u undo, Shift+R redo, q quit
```

### Training
```bash
# Requires libtorch — tch-rs downloads it automatically during build.
# At runtime, set DYLD_LIBRARY_PATH to the downloaded libtorch lib dir:
DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1) \
  ./target/release/train lc2-30 models/lc2-30 mlp_small

# Training resumes automatically if interrupted (reads metrics.jsonl).
# Ctrl+C triggers graceful shutdown saving the best model.
```

### WASM build
```bash
wasm-pack build crates/wasm --target web --out-dir ../../wasm-pkg
```

### ONNX export
```bash
pip install -r tools/requirements.txt
python tools/export_onnx.py models/lc2-30/model_best.pt models/lc2-30/model_best.onnx --arch mlp_small
```

### Web app
```bash
cd app
npm install
npm run dev        # dev server
npm run build      # production build (tsc → vite → prerender; see below)
npx vitest run     # run tests (21 tests)
```

### Prerendering

`npm run build` ends with `node scripts/prerender.mjs`: it serves the fresh
`dist/` with `vite preview`, drives it in headless Chromium (Playwright), waits
for the whole article (including the lazy Act III chunks) to render, and writes
two per-language documents: `dist/index.html` (English, x-default) and
`dist/fr/index.html` (French). Language is URL-authoritative (see `LangContext`),
so `/` and `/fr` each render their own language; the French head
(canonical/og:url/og:locale/title/description) is rewritten during the snapshot.
The app is otherwise a pure client-rendered SPA, so this is what lets non-JS
consumers (Bing, AI crawlers like GPTBot/ClaudeBot/PerplexityBot, social/RSS
unfurlers) and first paint see the article. React still boots and re-renders on
the client — deliberately **no hydration**, because the gsap/motion/lenis scroll
stack initialises imperatively and would mismatch.

- Needs Chromium: `npm install` pulls `@playwright/browser-chromium` +
  `playwright-core`. CI sets `PLAYWRIGHT_BROWSERS_PATH=0` (in `app/netlify.toml`)
  so the binary lands in `node_modules` and Netlify's cache keeps it.
- Failure is non-fatal: a prerender error logs a warning and ships the CSR shell
  instead, so it never blocks a deploy.
- i18n: `/fr` is a real prerendered URL with reciprocal `hreflang`
  (en/fr/x-default) and its own canonical. `app/netlify.toml` routes `/fr` → the
  French document; `vite.config.ts` `navigateFallbackDenylist` stops the service
  worker shadowing `/fr` with the English shell; and an inline script in
  `index.html` redirects French browsers from `/` to `/fr` on first visit
  (honouring an explicit stored choice).
- Caveat: vite-plugin-pwa computes its precache manifest during `vite build`,
  before the prerender rewrite, so the recorded `index.html` revision is the
  shell's. In practice the shell's asset hashes change whenever content changes,
  so the service worker still updates (returning users may see the previous
  render for one extra navigation under `autoUpdate`).

## Project Structure

```
crates/
  engine/            # Game engine: types, state, legal moves, rules (LC1/LC2/LC3)
  search/            # Minimax (alpha-beta + TT), MCTS (PUCT), checkpointer
  train/             # AlphaZero: net, encoding, self-play, gatekeeper, training loop
  cli/               # Terminal UI (crossterm, curses-style)
  wasm/              # wasm-bindgen wrappers for browser
wasm-pkg/            # Built WASM package (committed for web app)
tools/
  export_onnx.py     # Python ONNX export sidecar
  verify_onnx.js     # Node.js ONNX load verification
app/
  src/
    engine/          # TS shim over WASM (adapts Rust serde format to old TS API)
    ai/              # AI system (Random, Minimax, ONNX-based DQN/AlphaZero, MCTS)
    components/      # React UI components
    hooks/           # Custom hooks (useAI, useGame)
    stores/          # React context providers
  public/
    models/          # ONNX models + minimax table (committed)
archive/
  2026-04-phase5-snapshot/  # Pre-rewrite Python + TS code (reference only)
```

## Testing

- Rust workspace: `cargo test --workspace` (74 tests: engine, search, train)
- Web app: `cd app && npx vitest run` (21 tests)
- Property tests: engine invariants via proptest (piece conservation, no stalemate, legal moves apply)

## Build Warning Exceptions

- `DeprecationWarning: You are using the legacy TorchScript-based ONNX export` — emitted by PyTorch 2.9+ in `tools/export_onnx.py`. Using the legacy path intentionally until `onnxscript` is added.
- `warning: method cells_mut is never used` in engine crate — `pub(crate)` accessor reserved for future use by testing helpers.

## Deployment

Netlify — static deploy of the `app/` build output. No server-side code. Live at
`https://pogofish.revah.paris`.

- Netlify **base directory must be `app`** — that is where `netlify.toml` lives
  (it sets `publish = "dist"`, the SPA redirect, and immutable cache headers).
- `app/netlify.toml` `[build.environment]` sets `NODE_VERSION = "20"` and
  `PLAYWRIGHT_BROWSERS_PATH = "0"` (so the prerender step's Chromium is cached
  across builds).
- `npm run build` prerenders `dist/index.html` in headless Chromium — see
  **Prerendering** above.

## Project-Specific Rules

- State space is ~10M+ positions. Tabular methods hit a wall. Deep RL (AlphaZero) is required.
- Three rule variants under experiment: LC1 (repetition loss), LC2 (hard move cap), LC3 (soft cap with draws).
- Training artifacts go in `models/` (gitignored). 8 GB RAM M2 Mac — keep neural nets small.
- The WASM shim at `app/src/engine/` translates between Rust serde format (snake_case, "White"/"Red") and old TS format (camelCase, "W"/"R"). Do not modify the Rust serialization to match TS — the shim handles it.
- tch-rs uses `|` as path separator in saved .pt files. The Python export script remaps to `.` when loading.
