# Development

Reference for working on Pogofish: what each part of the repository does, every
command, the board build the hub embeds, and the round-1 web article. The
[README](../README.md) keeps only what a visitor needs.

## What's in the box

### `crates/` — Rust workspace

- `pogofish-engine` — game rules, state, legal moves, rule variants (LC1/LC2/LC3).
- `pogofish-infer` — pure-Rust inference (no libtorch): input features, action indexing, the MLP forward pass reading exported `.pfw` weights (and the TD value net's `.pfv`), and the neural MCTS shared with training; the `v4bench` binary measures any player against the solved table and greedy. The terminal game depends on it.
- `pogofish-search` — minimax (alpha-beta + transposition table), MCTS (PUCT), checkpointer, and two scripted baselines: `random` and `greedy` (wins when it can, else maximises own stacks on top minus the opponent's); the tabular value learner (`qtrain`, one value per position, no libtorch).
- `pogofish-train` — AlphaZero training via tch-rs/libtorch (no gating: every checkpoint is kept and rated), self-play, TD(λ) value learning (`td_train`, `export_td`), the `arena` evaluation binary, and an `analyze` binary that produces the insights JSON the article reads.
- `pogofish-cli` — the terminal game: play the trained AlphaZero net (pure-Rust inference, no libtorch), choose your colour and level, ask for hints, see the AI's estimate.
- `pogofish-wasm` — wasm-bindgen wrappers for the browser.

### `app/` — web app

React 19 + TypeScript + Vite + Tailwind v4. The entire app is one scroll-driven story page; the playable game is a scene within it. No routing, no backend — all inference runs client-side via ONNX Runtime Web against models loaded from `app/public/models/`.

#### Board build for the hub

`cd app && npm run build:board` builds a second, board-only entry (`app/board.html` → `app/src/board/`) into `app/dist-board/`, with base `/pogofish/`: the hub copies that folder and embeds it in an iframe. It plays a human against the round-2 net (`az-lc1-s1`, AlphaZero + MCTS) under `lc1-2`, with a colour choice, three levels (easy 25, normal 100, hard 400 simulations, the CLI's numbers; only "normal" is the measured one) and a new-game button. Language and theme come from `?lang=fr|en` and `?theme=light|dark`; the host can switch the theme with a same-origin `postMessage({ pogofishTheme })`.

It ships `index.html`, the engine wasm, `models/lc1-2/az-lc1-s1.onnx` and the non-JSEP ONNX Runtime pair (`ort/ort-wasm-simd-threaded.{wasm,mjs}`). It leaves out the LC3 variant, the DQN net, the raw-policy player, the minimax table and every other file of `app/public/`.

### `models/` — gitignored training artifacts

LC1-2 (Sudden Death) and LC3-29 (Classic) AlphaZero models ship as ONNX under `app/public/models/`. The LC1-2 opponent is the round-2 net the terminal game plays (`lc1-2/az-lc1-s1.onnx`, input encoded by the WASM engine; `app/src/ai/parity.test.ts` checks it against the Rust net on 100 positions within 1e-5). The LC3-29 net is round 1.

### `figures/` — article figures

A TypeScript package that will hold the `<pogo-…>` custom elements of the article page, built with Vite library mode into `figures/dist/` (`pogo-figures.js`, `search-worker.js`, the chunks they share, `manifest.json`, the engine `.wasm`), base `/pogo/`. `src/engine.ts` wraps the committed `wasm-pkg/` build (`pogofish-wasm`, a `file:` dependency); every other module goes through it.

```bash
cd figures
npm ci
npm test             # vitest + happy-dom
npm run build        # tsc, then vite build -> dist/
npm run dev          # the kit harness: open http://localhost:5173/pogo/dev/
```

`src/kit/` is what every element is built on: `theme.css` (the token contract: the page declares `--pogo-*`, the elements read only those, with the dark values as fallbacks and the light ones under `prefers-color-scheme: light`), `board-svg.ts` (`drawBoard`; no layout reads, no text), `board-labels.ts` (`boardLabels`/`labelledBoard`: the coordinates a1…c3 as fixed-size 12.8px HTML laid over a board drawn with `labelRoom: true`, placed by percentage so they never scale with it; boards of 240px and more), `figure.ts` (`PogoFigure`: shadow frame, render on first approach, the light-DOM fallback shown again if rendering fails, the fidelity label, a `pogo:playfrom` event), `stepper.ts` (`Stepper`, no timer under reduced motion, an `onChange` hook), `controls.ts` (`transport`, the control row every stepped figure uses: icon previous/next around the counter, one primary play/pause that disappears under reduced motion, then the caller's actions as secondary blocks) and `strings.ts` (every string, French and English; a missing key fails `tsc`). `dev/index.html` is the only place an element is looked at before the article page: the tokens in both themes with a theme and an FR/EN toggle, the three type cuts, the controls, `drawBoard` at 160px bare and at 240px and 400px with its coordinates, a demo figure per fidelity label, and each registered element. Each element task adds its tag there. It loads Archivo from Google Fonts; the article page self-hosts it. Vite library mode builds only its two entries, so the harness never reaches `dist/`.

The reader's game lives in `src/store.ts`: one store per page, shared by every board and by the figures that replay a game. It turns a figure's `pogo:playfrom` event into a new game, keeps the current and the last finished game in `sessionStorage` under one key (a storage that throws costs nothing; nothing is sent anywhere), and rebuilds a saved game by replaying its moves through the engine, dropping it silently when one is illegal. `await store.ready()` loads the engine and restores the saved games; with no finished game, figures use `DEFAULT_GAME` (`src/default-game.ts`, the openingWin line, checked against `fixtures/lines.json` and `table.json`).

The board's search runs in a module worker, the build's **second entry**: `src/search.worker.ts` becomes `dist/search-worker.js`, which `src/search-client.ts` starts as `new Worker(url, { type: 'module' })` with the URL resolved next to the bundle (`src/assets.ts`). The URL is a variable on purpose: Vite rewrites `new Worker(new URL('literal', import.meta.url))` into a second, duplicated bundle under `dist/assets/`, and an `?worker&inline` import into a `data:` URL inside `pogo-figures.js`, which would put the search and the net parser in the eager bundle. `scripts/check-dist.sh`, run after `npm run build` locally and in CI, holds the three conditions: `dist/search-worker.js` exists, `grep -c 'data:text/javascript\|data:application/javascript\|blob:' dist/pogo-figures.js` prints 0 (it prints 1 for an inlined worker; measured 2026-11-15), and `dist/assets/` does not exist. Exit 0 healthy, 1 a finding, 2 no build. The worker loads the engine and the net on its first request. When it cannot be created, crashes (`error`, `messageerror`) or does not answer within 30 s, the same search (`src/search-handler.ts`) runs on the main thread from then on, imported on demand and bounded by the same 30 s. An error the worker reports (a failed fetch) is a failure the reader retries, in a fresh worker. A new request supersedes the one in flight.

`<pogo-board>` (`src/elements/pogo-board.ts`) is the playable board: the reader picks a side and a level (easy 25, normal 100, hard 400 simulations; only normal has a measured strength, which the footer gives), and plays against `az-lc1-s1` under lc1-2. `mode="follow"` is the compact board bound to the same game, hidden until one is under way and collapsible to a bar. What may be lifted, how many pieces and where they may land come only from `legal()`, in the pure `src/board-state.ts`; `src/driver.ts` plays the AI's side once for the whole page however many boards are attached. The element sets `data-search` (`worker` or `main`) and `data-think-ms` after each AI move, so a browser check can tell the worker from the fallback.

The harness shows both modes at the bottom of `/pogo/dev/` and serves the worker from its source; `/pogo/dev/?worker=broken` points it at a missing file, so the AI's move comes from the main thread (`data-search="main"`). A real-browser check drives it with `playwright-core` and the Chromium under `app/node_modules` (`createRequire('<repo>/app/package.json')`), clicking legal moves read from the DOM: the actionable cells (`.cell-button[data-actionable]`), the counts shown, then the rings (`.board .mark.target`).

Binaries are never imported (Vite would inline them as base64): they live in `figures/public/` and are fetched by URL. `npm run build` first copies `wasm-pkg/pogofish_wasm_bg.wasm` there (`scripts/copy-wasm.mjs`, git-ignored copy). CI: `.github/workflows/figures.yml`.

The TypeScript must equal the Rust, and `figures/fixtures/reference.json` is what its tests check against: generated by Rust, committed, and deterministic (two runs give the same bytes). Regenerate it from the repository root after changing a net, the engine or the search:

```bash
cargo run --release -p pogofish-infer --example figures_fixture -- \
  crates/cli/assets/az-lc1-s1.pfw models/v4-td-lc1-s1/td.pfv figures/fixtures/reference.json
```

`models/` is local, so only a machine holding the TD checkpoint can run it. It reads `figures/fixtures/lines.json` (perfect lines from the solved table, each with the `pogoq` command that printed it in `source`) and puzzle 5 of `docs/experiments/v5/puzzles/az-s1-p100.json`.

The figures' numbers come from three committed files under `figures/public/data/` (Vite copies `public/` into `dist/`, the page fetches them lazily): `table.json` (the solved table's verdicts, the retrograde-analysis positions and the stored lines), `v5.json` (round-5 scores, stage games and mosaics, seed 1) and `reach.json` (positions first met at each ply). Each is generated, deterministic (two runs give the same bytes), and kept under a gzip size in `figures/budget.json`; raising one needs a one-line reason there. Types are in `figures/src/data.ts`, and `src/data.test.ts` checks the files against their sources.

```bash
# From figures/. Needs models/v3-solve/table.bin (local) and `cargo build --release -p pogoq`.
node scripts/table-extract.mjs   # -> public/data/table.json; exit 1 = a control failed, 2 = no table or binary
# From figures/. Needs only the committed docs/experiments/ files.
node scripts/pack-v5.mjs         # -> public/data/v5.json and public/data/reach.json
```

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

# TD(λ) value learning (resumable: Ctrl+C saves and exits 130; docs/experiments/v2-td.md)
./target/release/td_train models/td-mr-s1 --iterations 1000 --temp-decay 1000 --lambda 0.7 --lr 0.1 --seed 1

# Evaluate players against each other (colours swapped, random openings, 95% CI)
./target/release/arena uncapped greedy random mcts-uniform:200 --pairs 200 --out arena.json

# v4 bench: one player, value kept on the solved table's held-out sample and score vs greedy
# under lc1-2, after falsification controls (no libtorch; docs/experiments/v4-evaluation.md)
./target/release/v4bench models/v3-solve greedy-2ply --out bench.json

# Export a TD net to the pure-Rust .pfv (1e-5 check on 100 positions), then bench it
DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1) \
  ./target/release/export_td models/v4-td-lc1-s1/weights.pt models/v4-td-lc1-s1/td.pfv
./target/release/v4bench models/v3-solve td:models/v4-td-lc1-s1/td.pfv --out td.json

# Tabular value learner (931 MB table, resumable), then bench it against greedy and random
./target/release/qtrain models/v4-qtab-s1 --games 500000 --seed 1
./target/release/v4bench models/v3-solve qtab:models/v4-qtab-s1/v.bin --opponent random --out qtab.json

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
