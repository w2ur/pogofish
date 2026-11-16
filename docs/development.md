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

A TypeScript package holding the `<pogo-…>` custom elements of the article page, built with Vite library mode into `figures/dist/` (`pogo-figures.js`, the entry a page imports; `search-worker.js`; one chunk per element and the chunks they share, content-hashed, under `dist/assets/`; `manifest.json`, the list of tags; the engine `.wasm`; the nets under `nets/` and the data files under `data/`). `src/engine.ts` wraps the committed `wasm-pkg/` build (`pogofish-wasm`, a `file:` dependency); every other module goes through it.

```bash
cd figures
npm ci
npm test             # vitest + happy-dom: the unit tests under src/
npm run build        # tsc, then vite build -> dist/
./scripts/check-dist.sh   # the built worker and binaries stay separate files (exit 2: no build)
npm run budget       # size caps and package shape, read from dist/ (exit 2: no build)
npm run dev          # the kit harness: open http://localhost:5173/pogo/dev/
```

`src/kit/` is what every element is built on: `theme.css` (the token contract: the page declares `--pogo-*`, the elements read only those, with the dark values as fallbacks and the light ones under `prefers-color-scheme: light`), `board-svg.ts` (`drawBoard`; no layout reads, no text), `board-labels.ts` (`boardLabels`/`labelledBoard`: the coordinates a1…c3 as fixed-size 12.8px HTML laid over a board drawn with `labelRoom: true`, placed by percentage so they never scale with it; boards of 240px and more), `figure.ts` (`PogoFigure`: shadow frame, render on first approach, the light-DOM fallback shown again if rendering fails, « Précisions », a `pogo:playfrom` event). Every figure ends with « Précisions » (English "Details"), a disclosure closed by default that says in plain sentences how the figure is made (computed live in the reader's browser; measured before publication, with the data's date when it has one; or a drawing), the game it is played in when that matters, then the figure's own notes (`precisions()`, rewritten by `refreshPrecisions()` once the data or the reader's choice is known). No file path or code name is ever printed: the kind, the game and the data source are the host's `data-fidelity`, `data-game` and `data-source` attributes, which the tests read. The follow board and the title are the two exceptions; a new figure keeps it, `stepper.ts` (`Stepper`, no timer under reduced motion, an `onChange` hook), `controls.ts` (`transport`, the control row every stepped figure uses: icon previous/next around the counter, one primary play/pause that disappears under reduced motion, then the caller's actions as secondary blocks; `choiceGroup`, one exclusive choice as a `radiogroup` of radios with one tab stop and arrow keys, the checked option drawn as the filled block) `move-tip.ts` (a move's name, « a3-1-b3 », with its explanation in words, « De a3, 1 pièce, vers b3. »: a tooltip on hover and on focus, a tap focusing it, dismissed by Escape, and the name's accessible description; `moveTip`/`moveText` make the name its own tab stop, `tipControl` puts the explanation on a control the name sits in, such as an openings row, with nothing focusable nested; placed once on show, in the top layer, inside the figure and the viewport; every figure that prints a move name uses it, and where the figure's board shows the position the move is played from (the openings list, the AZ preferences, the search), explaining a move marks its stack and landing there) and `strings.ts` (every string, French and English; a missing key fails `tsc`). `dev/index.html` is the only place an element is looked at before the article page: the tokens in both themes with a theme and an FR/EN toggle, the three type cuts, the controls, `drawBoard` at 160px bare and at 240px and 400px with its coordinates, a demo figure per kind (live, measured, illustrative), and each registered element. Each element task adds its tag there. It loads Archivo from Google Fonts; the article page self-hosts it. Vite library mode builds only its two entries, so the harness never reaches `dist/`.

The reader's game lives in `src/store.ts`: one store per page, shared by every board and by the figures that replay a game. It turns a figure's `pogo:playfrom` event into a new game, keeps the current and the last finished game in `sessionStorage` under one key (a storage that throws costs nothing; nothing is sent anywhere), and rebuilds a saved game by replaying its moves through the engine, dropping it silently when one is illegal. `await store.ready()` loads the engine and restores the saved games; with no finished game, figures use `DEFAULT_GAME` (`src/default-game.ts`, the openingWin line, checked against `fixtures/lines.json` and `table.json`).

The board's search runs in a module worker, the build's **second entry**: `src/search.worker.ts` becomes `dist/search-worker.js`, which `src/search-client.ts` starts as `new Worker(url, { type: 'module' })` with the URL resolved next to the bundle (`src/assets.ts`). The URL is a variable on purpose: Vite rewrites `new Worker(new URL('literal', import.meta.url))` into a second, duplicated bundle under `dist/assets/`, and an `?worker&inline` import into a `data:` URL inside `pogo-figures.js`, which would put the search and the net parser in the eager bundle. `scripts/check-dist.sh`, run after `npm run build` locally and in CI, holds the conditions: `dist/search-worker.js` and `dist/manifest.json` exist, `grep -c 'data:text/javascript\|data:application/javascript\|blob:' dist/pogo-figures.js` prints 0 (it prints 1 for an inlined worker; measured 2026-11-15), no file under `dist/assets/` is a worker (Vite's own worker bundling would put a second copy there), every file under `dist/assets/` carries a content hash and no file at the root does, and the entry imports statically only the engine chunk. Exit 0 healthy, 1 a finding, 2 no build. The worker loads the engine and the net on its first request. When it cannot be created, crashes (`error`, `messageerror`) or does not answer within 30 s, the same search (`src/search-handler.ts`) runs on the main thread from then on, imported on demand and bounded by the same 30 s. An error the worker reports (a failed fetch) is a failure the reader retries, in a fresh worker. A new request supersedes the one in flight.

`<pogo-board>` (`src/elements/pogo-board.ts`) is the playable board: the reader picks a side and a level (easy 25, normal 100, hard 400 simulations; only normal has a measured strength, which its « Précisions » give, with who the opponent is and what the levels change), and plays against `az-lc1-s1` under lc1-2. Side and level apply to the next game: a game under way keeps its sides and level, its setup shrinks to one line, and « Nouvelle partie » asks once (« Abandonner la partie ? ») before abandoning it. The status above the board keeps one height (an invisible copy of the longest result holds it), so the board never moves when the turn or the result changes. `mode="follow"` is the compact board bound to the same game (bar, board, count, and « Nouvelle partie » once the game is over; at most 320px wide; open, it leaves the top half of a 390 × 844 screen free), an opaque panel framed by the flyer's rule that the page fixes to a corner. It is hidden until a game is under way, and while any inline board of the document is on screen (one `IntersectionObserver`; never while focus is inside it). It starts folded to its bar (the turn or the result, and « Ouvrir »); a figure's « Jouer d’ici » opens it, a game started on a board leaves it as it was, and moves never change it. Open or folded is the reader's choice for the page's session: the store keeps it in its storage record (`followOpen`; a record without it restores folded), so a reload, or a follow board defined only after the event, finds it. Escape puts away the abandon question, then a lifted stack, then folds it. `src/follow-panel.ts` holds these decisions. What may be lifted, how many pieces and where they may land come only from `legal()`, in the pure `src/board-state.ts`; `src/driver.ts` plays the AI's side once for the whole page however many boards are attached. The element sets `data-search` (`worker` or `main`) and `data-think-ms` after each AI move, so a browser check can tell the worker from the fallback.

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

`table-extract.mjs` reads the solved table through the `pogoq` binary and checks each extracted fact against its controls before writing anything. `pack-v5.mjs` packs the round-5 bench files of `docs/experiments/v5/` and `docs/experiments/v3-solve/reach.json`; the date the round-5 charts print is the commit date (UTC day) of `docs/experiments/v5/curves.json` (`scripts/v5-date.mjs`), the closest date the repository records for those scores. It refuses a shallow clone (its last commit seen is not the file's) and a `curves.json` with uncommitted changes. That is why `figures.yml` checks out the full history (`fetch-depth: 0`): `src/data.test.ts` recomputes the date.

#### Lazy definition

The entry holds only what every page needs to start: the tag list (`src/manifest.ts`), one loader per tag (`src/registry.ts`, a dynamic `import()` of the element's module, typed over the tags so a missing loader fails `tsc`) and the lazy-definition logic (`src/lazy-plan.ts`, pure, decides what to import; `src/lazy-define.ts` observes). `defineAll()` watches the document: a tag's module is imported, then its class defined, when its first instance comes within one viewport of the screen (`rootMargin: 100%`, twice the kit's own render margin, so definition never delays a render); at once when `IntersectionObserver` is missing; and for instances added to the document later (a `MutationObserver`). An instance inside a hidden container (`hidden`, `display: none`) has no box, so its tag is imported when the container is shown. `src/registry.ts` (`when`) decides when each instance's tag is imported. `<pogo-title>` is imported at once: it is the page's `h1`. `<pogo-board mode="follow">` shows nothing until a game is under way, so nearing the screen says nothing about it and it is never observed: it is imported at once when a game is saved (`src/saved.ts`, the store's own `hasSaved()` test, read without the store), and otherwise only when the first game starts — a figure's `pogo:playfrom` wakes it (`defineAll()` listens on the document), and an inline board starting a game has already defined the tag. Without a saved game, a follow board therefore costs nothing at load; defining it would fetch its chunk and the shared chunks it imports (no wasm). Two instances share one import. A failed import warns once on the console, is never retried, and leaves the element's light-DOM fallback in place for good. Instances inside another element's shadow root are not watched: no element creates one today. Until its class is defined, an element shows its light-DOM children, which the page styles under `:not(:defined)`; upgrading keeps the same nodes in the fallback slot.

Each element is its own chunk, so the kit (`src/kit/figure.ts`) imports the store: a figure can hand a position over (`pogo:playfrom`) before any board module is loaded, and the store must already be listening. `loadAll()` imports and defines every element at once; it is the eager path for tests, not for pages.

#### Size budget

`figures/budget.json` is the ledger of caps, in gzip bytes as Node's `zlib.gzipSync` counts them: under `js`, the entry, the eager load (the entry and what it imports statically, the engine glue), any other single JS file, and all JS together; under `data`, each data file. Each JS cap carries its measured size and its reason; raising one needs a one-line reason there. `npm run budget` runs `scripts/budget.test.mjs` with node (not vitest, which runs only `src/`), after a build: the caps, then the package's shape — the entry imports statically only the engine chunk (which carries `src/assets.ts` and names the binaries, without fetching them), never an element, the wasm, a net or a data file; every static and dynamic import of every JS file resolves to a file of `dist/`; every tag of `manifest.json` has a loader in the entry pointing at its own chunk under `assets/`, which exports the class; and there are as many tags as element modules (`src/elements/*.ts` that extend `PogoFigure`). A missing `dist/` exits 2, never a pass. CI runs it after `check-dist.sh`. `src/data.test.ts` also holds the data files to their caps, from `public/data/`, without a build.

#### URLs, and how the build reaches the site

The layout of `dist/` follows how the site caches it: every content-hashed chunk sits under `dist/assets/` (`chunkFileNames` in `vite.config.ts`, the folder name is `CHUNK_DIR` in `src/assets.ts`), which the site serves as immutable for a year; the entry, the worker, `manifest.json`, the wasm, `nets/` and `data/` sit at the root under fixed names, and the site revalidates them on every visit. A new hashed file at the root, or an unhashed one under `assets/`, would be cached wrongly: `check-dist.sh` refuses both.

Everything resolves from the package's own URL, so a copy of `dist/` served under any path works without rebuilding (checked in a browser under `/pogo/`, 2026-11-16, every request answering 200). The entry and the worker import their chunks by relative specifier (`import("./assets/pogo-board-….js")`), and the chunks one another. The binaries are resolved from one base, in `src/assets.ts`: `packageRoot(import.meta.url)` is the folder of the module it was bundled into, or that folder's parent when it is `assets/`, so the base is the root of `dist/` whether the module sits at the root or in a chunk. `assetUrl()` builds the wasm, net and data URLs from it, `workerUrl()` the worker's, and `ready()` resolves its default wasm through it. The worker receives its wasm and net URLs from the page with each request. The worker is a separate realm: it fetches the engine chunk, the search chunk and the wasm a second time (from the HTTP cache once the site's headers apply). `configureAssets({ base, worker })` exists for the dev harness only, which serves the binaries from `public/` at `/pogo/` and the worker from its source; Vite's `base: '/pogo/'` matters only to that dev server.

This repository never writes into the site. The hub owns the sync: a script there copies `figures/dist/` to its `public/pogo/` and refuses a build without `manifest.json`, and its page loads `import('/pogo/pogo-figures.js').then((f) => f.defineAll())`.

#### Adding an element

1. The module, `src/elements/pogo-<name>.ts`, a class extending `PogoFigure` (its CSS in `pogo-<name>.css`, its pure logic in a sibling module with its own tests).
2. The tag in `TAGS` (`src/manifest.ts`) and its loader in `LOADERS` (`src/registry.ts`); `tsc` fails while one is missing.
3. Its strings in both languages in `src/kit/strings.ts`.
4. Its tag in the harness (`dev/main.ts`), with a fallback sentence in each language.
5. Its tests: `src/elements/pogo-<name>.test.ts` defines the class itself; `src/index.test.ts` and the budget fail until the module, the tag and the loader agree.
6. `npm run build && npm run budget`: the new chunk must fit the largest-chunk cap and the total; raising a cap needs its reason in `budget.json`.

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
