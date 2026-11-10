# Article visuals

Scripts that made the images and GIFs of the Pogofish article. The `.mjs` scripts replay moves through the WASM engine (`wasm-pkg/`, built with `wasm-pack`) and screenshot the board with Playwright (`app/node_modules/playwright-core`, so run `npm install` in `app/` first); the first argument of each is the output directory, and generated PNG and GIF files are git-ignored.

- `sequence.mjs OUT 'MOVES_JSON'` renders a game as one image per move; `seq2.mjs` does the same with an optional repetition counter (third argument, rules JSON).
- `narrow.mjs OUT PREFIX_JSON VERDICT_JSON` makes one panel per legal move from a position, with the solver's verdict under each.
- `scene2.mjs OUT` draws the first three steps of the retrograde analysis as a tree, one frame per step, for the GIF.
- `greedy.mjs OUT search|game|sheet …` plays the greedy player against itself under `lc1-2` (a port of `crates/search/src/players.rs`): `search LO-HI` lists seeded games, `game SEED` renders one captioned frame per ply into OUT, `sheet SEED PLY` writes OUT as one panel per move greedy weighs at that ply, with its score; `moves SEED` prints the game's move list.
- `qlearn.mjs OUT PREFIX_JSON VERDICT_JSON GAMES SEED [LINE_JSON]` replays the endgame after PREFIX GAMES times with the tabular learner's rule (a JavaScript port of `crates/search/src/qtab.rs`, not the measured program) and renders one frame per checkpoint: each move's learned value, its exact verdict from `pogoq`, and V along LINE.
- `azgame.mjs` plays the greedy player (White) against the online AlphaZero net (Red) on the live board and prints the game as a move list.
- `capture.mjs OUT [light|dark]` takes board screenshots of the live page.
- `shortest.mjs` searches the engine breadth-first for the shortest game that ends, and prints the move lists.
- `board.css` is the board's look, shared by the scripts.
- `pogoq/` queries the solved table of `docs/experiments/v3-solve.md`: `cargo run --release -p pogoq -- ABS_TABLE_DIR MODE 'PREFIX_JSON' [MAX]`, with `MODE` one of `values`, `line`, `trace`, `narrow`. Its test needs the table: `POGOFISH_TABLE=/abs/path/models/v3-solve cargo test -p pogoq -- --ignored`.

Frames become a GIF with `gifski --fps N --width W -o out.gif OUT/f*.png`.
