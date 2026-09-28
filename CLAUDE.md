# CLAUDE.md — pogofish

## Project Overview

Pogofish is a browser-based Pogo board game with AI opponents trained via AlphaZero reinforcement learning. Single Rust engine compiled to both native (training, solver, CLI) and WASM (web app), eliminating the prior Python/TypeScript engine-drift risk. The project explores multiple losing-condition rule variants (LC1/LC2/LC3) through staged RL experiments. All inference runs client-side via ONNX Runtime Web — zero backend.

## Tech Stack

### Rust workspace (`crates/`)
- Rust 1.79+ (stable toolchain)
- `pogofish-engine` — Game rules, state, legal moves, rulesets (`Uncapped`, LC1/LC2/LC3; `RuleSet` parses and prints `uncapped`, `lc1-N`, …)
- `pogofish-infer` — Pure-Rust inference (no libtorch): input features, action indexing, MLP forward pass reading exported `.pfw` weights, and the neural MCTS shared with training (`Evaluator` trait)
- `pogofish-search` — Minimax (alpha-beta + TT), MCTS (PUCT), checkpointer, scripted `random`/`greedy` players (seeded, no dependency)
- `pogofish-train` — AlphaZero training (tch-rs/libtorch, no gating, exact resume), self-play, TD(λ) value learning (`td_train`), `arena` evaluation binary
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
- Python 3.11+ — ONNX export sidecar (`export_onnx.py`), Elo ladder, TD curve and checkpoint-ladder plots (`plot_ladder.py`, `plot_td_curve.py`, `plot_az_ladder.py`, PEP 723: `uv run`)
- Node.js — ONNX verification (`verify_onnx.js`)

## User-Facing Language

Bilingual FR/EN.

## Development

### Rust workspace
```bash
cargo check --workspace       # type check all crates
cargo test --workspace        # run all tests
cargo build --release -p pogofish-cli --bin pogofish   # CLI game
cargo build --release -p pogofish-train --bin train     # training binary
```

### CLI game
```bash
cargo run --release -p pogofish-cli
# Arrow keys navigate, Enter selects, 1/2/3 piece count, Esc cancels
# u undo, Shift+R redo, q quit
```

### Measuring the game
```bash
# Uncapped games between random/greedy players; refuses to run if its own
# falsification check fails. Unfinished games (safety limit) are never draws.
cargo run --release -p pogofish-search --bin measure -- --games 20000 --seed 1 --out docs/experiments/v2-measure.json
```

### Evaluating players (arena)
```bash
# Every pair of players: colours swapped over random openings, score with a
# 95% CI, distinct games and distinct positions after the opening.
# Players: random, greedy, first-legal, mcts-uniform:SIMS, net:PATH[:SIMS[:ARCH]]
./target/release/arena uncapped greedy random net:models/uncapped/model_best.pt:100 \
  --pairs 200 --opening 4 --seed 1 --out arena.json
```
Rate players from arena reports (Bradley–Terry, 95% CI) and plot:
```bash
cargo run --release -p pogofish-search --bin ladder -- arena.json --anchor random --out ladder.json
uv run tools/plot_ladder.py ladder.json ladder.png
```
Evaluate with `arena` only; the round-1 `tournament` binary has no colour-swapped
openings, no CI and counts truncations as draws.

### TD(λ) value learning
```bash
# Resumable (rerun after Ctrl+C, or raise --iterations to extend); see docs/experiments/v2-td.md
./target/release/td_train models/td-mr-s1 --iterations 1000 --temp-decay 1000 --eval-every 50 \
  --eval-pairs 200 --lambda 0.7 --lr 0.1 --seed 1
# In the arena: td:models/td-mr-s1/weights.pt[:128x64]
```

### Training
```bash
# Requires libtorch — tch-rs downloads it automatically during build.
# At runtime, set DYLD_LIBRARY_PATH to the downloaded libtorch lib dir:
DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1) \
  ./target/release/train models/az-s1 --features mover-relative --seed 1

# The features must carry what the ruleset reads (encoding::Features::suffice_for):
# any for uncapped, mover-relative-repetition for lc1; lc2/lc3 are refused
# (move count; docs/experiments/v1-verdict.md defect 3). Under lc1 the input is
# still not a complete Markov state (it omits which other positions were seen);
# the search is exact, and train prints a note saying so.
# Resumable: Ctrl+C stops at the next game boundary; rerun the same command to
# resume (or raise --iterations to extend). A resumed run is bit-identical to an
# uninterrupted one (weights, momentum, replay buffer, counters, generator).
# No gating: every --checkpoint-every checkpoint is kept, to be rated with arena/ladder.
```

### Exporting a net for the terminal game
```bash
# Checks the pure-Rust copy against the checkpoint (1e-5 on 100 positions) before writing.
./target/release/export_weights models/az-lc1-s1/checkpoints/iter_00200.pt crates/cli/assets/az-lc1-s1.pfw
```

### WASM build
```bash
wasm-pack build crates/wasm --target web --out-dir ../../wasm-pkg
```

### ONNX export
```bash
uv run --with-requirements tools/requirements.txt \
  python tools/export_onnx.py models/lc2-30/model_best.pt models/lc2-30/model_best.onnx --arch mlp_small
```

### Web app
```bash
cd app
npm install
npm run dev        # dev server
npm run build      # production build (tsc → vite → prerender; see below)
npx vitest run     # run tests
```

### Prerendering

`npm run build` ends with `node scripts/prerender.mjs`, producing static
`dist/index.html` (English) and `dist/fr/index.html` (French) from the SPA.

**Prerender / build pipeline / `/fr` routing: load the `pogofish-prerendering`
skill** before touching `scripts/prerender.mjs`, `app/netlify.toml` build
settings, vite-plugin-pwa precache config, or French i18n routing. It explains
why hydration is deliberately disabled and the precache-manifest caveat.

## Committed artifacts

`wasm-pkg/` (built WASM package) and `app/public/models/` (ONNX models +
minimax table) are committed, not built in CI — regenerate and commit them
together. `archive/2026-04-phase5-snapshot/` is the pre-rewrite Python + TS
code, reference only: never import from it.

## Testing

- Rust workspace: `cargo test --workspace` (engine, search, train)
- Web app: `cd app && npx vitest run`
- Property tests: engine invariants via proptest (piece conservation, no stalemate, legal moves apply)

## Build Warning Exceptions

- `DeprecationWarning: You are using the legacy TorchScript-based ONNX export` — emitted by PyTorch 2.9+ in `tools/export_onnx.py`. Using the legacy path intentionally until `onnxscript` is added.
- `(!) Some chunks are larger than 500 kB after minification` — emitted by `vite build` for the main `index-*.js` chunk (≈637 kB raw, **214 kB gzipped**). Accepted rather than split: the article is prerendered, so JS never gates first paint, and the two heavy interactive scenes (`PlayScene`, `GlossaryConstellation`) already lazy-load as their own chunks. Splitting the remaining bundle would trade a measurable improvement for none. Do not silence it with `build.chunkSizeWarningLimit` — that would also hide a real regression. Revisit if the gzipped figure passes ~250 kB.

## Deployment

Netlify — static deploy of the `app/` build output. No server-side code. Live at
`https://pogofish.revah.paris`. Base directory must be `app` (that is where
`netlify.toml` lives). See the `pogofish-prerendering` skill for build-config
detail.

## Project-Specific Rules

- The state-space size has never been measured. Do not state one. Runtime and memory figures must be measured, or extrapolated from a measurement (a pilot) and labelled as such, never reasoned from nothing (plan rule 1).
- Round 2 trains on **`lc1-2`** (2026-09-27, `docs/experiments/v2-ruleset.md`): a position's third occurrence loses for the player who caused it. It started on the uncapped game; the pre-registered switch rule (more than 5 % of self-play games truncated, three iterations in a row) fired, so the owner switched (`docs/experiments/v2-az-uncapped.md`). Train with `--rules lc1-2 --features mover-relative-repetition`; the 1,000-ply safety limit stays (truncation is never a draw) and `train` stops by itself if the switch rule fires again. The round-1 variants remain in the engine: LC1 (repetition loss), LC2 (hard move cap: the player to move at the cap loses), LC3 (soft cap with draws).
- Training artifacts go in `models/` (gitignored). 8 GB RAM M2 Mac — keep neural nets small.
- The WASM shim at `app/src/engine/` translates between Rust serde format (snake_case, "White"/"Red") and old TS format (camelCase, "W"/"R"). Do not modify the Rust serialization to match TS — the shim handles it.
- Checkpoint loading is strict (`crates/train/src/checkpoint.rs`): a missing, unexpected or reshaped tensor is an error. Never load weights by copying only the names that match; that is how round 1 evaluated a "DQN" with random heads.
- tch-rs uses `|` as path separator in saved .pt files. The Python export script remaps to `.` when loading.
- **Deliberate identity, not the portfolio default:** ink `#121010` on a warm paper ground, a vermilion accent `#d94f2c`, Instrument Serif for display, Newsreader for body and JetBrains Mono for figures (`app/src/index.css` `@theme`). It meets three items of the global avoid-list (cream ground, clay-red accent, mono labels) on purpose — the owner chose to keep it (2026-09-25). Do not "fix" it toward the defaults.
