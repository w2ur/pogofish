---
name: "Pogofish"
tagline_fr: "Un article au long cours sur l'entraînement d'une IA à un jeu de plateau oublié"
tagline_en: "A longform piece about training an AI to play a forgotten board game"
facts_fr: "Moteur Rust en WASM, inférence ONNX côté client."
facts_en: "A Rust engine in WASM, client-side ONNX inference."
---

# Pogofish

A longform article about training an AI to play a forgotten 3×3 board game — with the playable game inlined at the climax. Bilingual FR/EN (English at `/`, French at `/fr`, both prerendered). Single-page web app; no server.

The article tells the first round of the build: the game, a minimax solver, a DQN attempt, an AlphaZero run, a rule-variant sweep, and a section on what the trained network learned. That round's evaluation has since been found unreliable, and a second round is under way that re-measures everything before claiming it. What went wrong, and which results it invalidates: [`docs/experiments/v1-verdict.md`](docs/experiments/v1-verdict.md).

## Read it

```bash
cd app && npm install && npm run dev
```

Then open `http://localhost:5173`. The CTA in the bottom-right (`▶ Play`) or the URL anchor `#play` jumps to the inline game.

## What's in the box

### `crates/` — Rust workspace

- `pogofish-engine` — game rules, state, legal moves, rule variants (LC1/LC2/LC3).
- `pogofish-search` — minimax (alpha-beta + transposition table), MCTS (PUCT), checkpointer, and two scripted baselines: `random` and `greedy` (wins when it can, else maximises own stacks on top minus the opponent's).
- `pogofish-train` — AlphaZero training via tch-rs/libtorch (no gating: every checkpoint is kept and rated), self-play, TD(λ) value learning (`td_train`), the `arena` evaluation binary, and an `analyze` binary that produces the insights JSON the article reads.
- `pogofish-cli` — the terminal game: play the trained AlphaZero net (pure-Rust inference, no libtorch), choose your colour and level, ask for hints, see the AI's estimate.
- `pogofish-wasm` — wasm-bindgen wrappers for the browser.

### `app/` — web app

React 19 + TypeScript + Vite + Tailwind v4. The entire app is one scroll-driven story page; the playable game is a scene within it. No routing, no backend — all inference runs client-side via ONNX Runtime Web against models loaded from `app/public/models/`.

### `models/` — gitignored training artifacts

LC1-2 (Sudden Death) and LC3-29 (Classic) AlphaZero models ship as ONNX under `app/public/models/`. The LC1-2 opponent is the round-2 net the terminal game plays (`lc1-2/az-lc1-s1.onnx`, input encoded by the WASM engine; `app/src/ai/parity.test.ts` checks it against the Rust net on 100 positions within 1e-5). The LC3-29 net is round 1.

## The game itself

Pogo is played on a 3×3 grid. Each player starts with 6 pieces in 3 stacks of 2. Pick 1–3 pieces from the top of a stack you own, jump them a Manhattan distance determined by the count (1→d1, 2→d2, 3→d1|d3), and land on any cell — stacking on top. The top piece owns the stack. Win by topping every remaining stack. Three rule variants resolve the infinite-game problem:

- **LC1** — repeating a board position loses.
- **LC2** — hard move cap; if nobody has won by the cap, the player to move at the cap loses (so the cap's parity picks the loser).
- **LC3** — soft move cap; most stacks wins, ties are draws.

`RuleSet::Uncapped` plays the published game with no extra rule; round 2 trains on it ([`docs/experiments/v2-ruleset.md`](docs/experiments/v2-ruleset.md)).

The full rules, each linked to the engine line and the test that pins it, are in [`docs/rules.md`](docs/rules.md).

The web article ships **LC1-2** (fast, sudden-death) and **LC3-29** (balanced, draws possible — the default).

## Development

```bash
# Rust
cargo check --workspace
cargo test --workspace

# Web app
cd app && npx vitest run
cd app && npm run build

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

## Deployment

Static deploy on Netlify from `app/`. No server-side code.

---

Made with care by [William](https://william.revah.paris).
