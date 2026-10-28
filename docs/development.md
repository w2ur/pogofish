# Development

Reference for working on Pogofish: what each part of the repository does, every
command, the board build the hub embeds, and the round-1 web article. The
[README](../README.md) keeps only what a visitor needs.

## What's in the box

### `crates/` — Rust workspace

- `pogofish-engine` — game rules, state, legal moves, rule variants (LC1/LC2/LC3).
- `pogofish-infer` — pure-Rust inference (no libtorch): input features, action indexing, the MLP forward pass reading exported `.pfw` weights, and the neural MCTS shared with training. The terminal game depends on it.
- `pogofish-search` — minimax (alpha-beta + transposition table), MCTS (PUCT), checkpointer, and two scripted baselines: `random` and `greedy` (wins when it can, else maximises own stacks on top minus the opponent's).
- `pogofish-train` — AlphaZero training via tch-rs/libtorch (no gating: every checkpoint is kept and rated), self-play, TD(λ) value learning (`td_train`), the `arena` evaluation binary, and an `analyze` binary that produces the insights JSON the article reads.
- `pogofish-cli` — the terminal game: play the trained AlphaZero net (pure-Rust inference, no libtorch), choose your colour and level, ask for hints, see the AI's estimate.
- `pogofish-wasm` — wasm-bindgen wrappers for the browser.

### `app/` — web app

React 19 + TypeScript + Vite + Tailwind v4. The entire app is one scroll-driven story page; the playable game is a scene within it. No routing, no backend — all inference runs client-side via ONNX Runtime Web against models loaded from `app/public/models/`.

#### Board build for the hub

`cd app && npm run build:board` builds a second, board-only entry (`app/board.html` → `app/src/board/`) into `app/dist-board/`, with base `/pogofish/`: the hub copies that folder and embeds it in an iframe. It plays a human against the round-2 net (`az-lc1-s1`, AlphaZero + MCTS) under `lc1-2`, with a colour choice, three levels (easy 25, normal 100, hard 400 simulations, the CLI's numbers; only "normal" is the measured one) and a new-game button. Language and theme come from `?lang=fr|en` and `?theme=light|dark`; the host can switch the theme with a same-origin `postMessage({ pogofishTheme })`.

It ships `index.html`, the engine wasm, `models/lc1-2/az-lc1-s1.onnx` and the non-JSEP ONNX Runtime pair (`ort/ort-wasm-simd-threaded.{wasm,mjs}`). It leaves out the LC3 variant, the DQN net, the raw-policy player, the minimax table and every other file of `app/public/`.

### `models/` — gitignored training artifacts

LC1-2 (Sudden Death) and LC3-29 (Classic) AlphaZero models ship as ONNX under `app/public/models/`. The LC1-2 opponent is the round-2 net the terminal game plays (`lc1-2/az-lc1-s1.onnx`, input encoded by the WASM engine; `app/src/ai/parity.test.ts` checks it against the Rust net on 100 positions within 1e-5). The LC3-29 net is round 1.

## The game itself

Pogo is played on a 3×3 grid. Each player starts with 6 pieces in 3 stacks of 2. Pick 1–3 pieces from the top of a stack you own, jump them a Manhattan distance determined by the count (1→d1, 2→d2, 3→d1|d3), and land on any cell — stacking on top. The top piece owns the stack. Win by topping every remaining stack. Three rule variants resolve the infinite-game problem:

- **LC1** — repeating a board position loses.
- **LC2** — hard move cap; if nobody has won by the cap, the player to move at the cap loses (so the cap's parity picks the loser).
- **LC3** — soft move cap; most stacks wins, ties are draws.

`RuleSet::Uncapped` plays the published game with no extra rule; round 2 trains on it ([`experiments/v2-ruleset.md`](experiments/v2-ruleset.md)).

The full rules, each linked to the engine line and the test that pins it, are in [`rules.md`](rules.md).

The round-1 web article ships **LC1-2** (fast, sudden-death) and **LC3-29** (balanced, draws possible — the default).

## Terminal game: released binaries

Each `cli-v*` release carries a macOS build of the terminal game per architecture (`aarch64-apple-darwin` for Apple silicon, `x86_64-apple-darwin` for Intel), each with a `.sha256` file. The binary is unsigned. The first release is `cli-v0.1.0`; with a tag named explicitly:

```bash
# Apple silicon; swap in x86_64-apple-darwin on Intel
gh release download cli-v0.1.0 -R w2ur/pogofish -p '*aarch64-apple-darwin*'
# or: curl -LO https://github.com/w2ur/pogofish/releases/download/cli-v0.1.0/pogofish-v0.1.0-aarch64-apple-darwin.tar.gz{,.sha256}

shasum -a 256 -c pogofish-v0.1.0-aarch64-apple-darwin.tar.gz.sha256   # must print: OK
tar xzf pogofish-v0.1.0-aarch64-apple-darwin.tar.gz
cd pogofish-v0.1.0-aarch64-apple-darwin
chmod +x pogofish
./pogofish --help
```

If the archive came from a browser download, macOS quarantines it and Gatekeeper refuses the unsigned binary. Clear the flag once: `xattr -d com.apple.quarantine pogofish`. Downloads through `gh` or `curl` are not quarantined.

## Commands

```bash
# Rust
cargo check --workspace
cargo test --workspace

# Web app
cd app && npx vitest run
cd app && npm run build
cd app && npm run build:board   # board-only build for the hub → app/dist-board/

# Terminal game against the trained net (see --help)
cargo run --release -p pogofish-cli -- --colour red --level normal
# or install it (self-contained binary, the net is embedded; no libtorch):
cargo install --git https://github.com/w2ur/pogofish pogofish-cli

# Measure the uncapped game with scripted players (JSON report; ~2 s)
cargo run --release -p pogofish-search --bin measure -- --games 20000 --seed 1 --out docs/experiments/v2-measure.json

# TD(λ) value learning (resumable; docs/experiments/v2-td.md)
./target/release/td_train models/td-mr-s1 --iterations 1000 --temp-decay 1000 --lambda 0.7 --lr 0.1 --seed 1

# Evaluate players against each other (colours swapped, random openings, 95% CI)
./target/release/arena uncapped greedy random mcts-uniform:200 --pairs 200 --out arena.json

# Elo ladder from arena reports, and its plot
cargo run --release -p pogofish-search --bin ladder -- arena.json --out ladder.json
uv run tools/plot_ladder.py ladder.json ladder.png

# Train (requires libtorch; tch-rs downloads it)
DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1) \
  ./target/release/train models/az-s1 --features mover-relative --seed 1   # resumable; only Markov rulesets

# Regenerate the "what the AI learned" JSON
DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1) \
  ./target/release/analyze models/lc3-29 app/public/data/lc3-29-insights.json 500
```

## The round-1 article

The round-1 web app in `app/` is a longform article about training an AI to play the game, with the playable game inlined at the climax. Bilingual FR/EN (English at `/`, French at `/fr`, both prerendered). Single-page web app; no server.

It tells the first round of the build: the game, a minimax solver, a DQN attempt, an AlphaZero run, a rule-variant sweep, and a section on what the trained network learned. That round's evaluation has since been found unreliable ([`experiments/v1-verdict.md`](experiments/v1-verdict.md)). It is kept for reference.

```bash
cd app && npm install && npm run dev
```

Then open `http://localhost:5173`. The CTA in the bottom-right (`▶ Play`) or the URL anchor `#play` jumps to the inline game.

## Deployment

- `app/netlify.toml` is the round-1 article's static Netlify build from `app/` (no server-side code). Its subdomain, `pogofish.revah.paris`, is retired: it answers with a 301 to the story on the hub, <https://william.revah.paris/en/stories/pogofish/>.
- The round-2 board is served by the hub: `npm run build:board` writes `app/dist-board/`, and the hub's `scripts/sync-pogofish-board.sh` copies it into its own `public/pogofish/`.
- The terminal game is released by pushing a tag `cli-vX.Y.Z`; `.github/workflows/release-cli.yml` tests, builds and attaches the binaries to a GitHub release.
