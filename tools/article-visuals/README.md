# Article visuals

Scripts that made the images and GIFs of the Pogofish article. The `.mjs` scripts replay moves through the WASM engine (`wasm-pkg/`, built with `wasm-pack`) and screenshot the board with Playwright (`app/node_modules/playwright-core`, so run `npm install` in `app/` first); the first argument of each is the output directory, and generated PNG and GIF files are git-ignored.

- `sequence.mjs OUT 'MOVES_JSON'` renders a game as one image per move; `seq2.mjs` does the same with an optional repetition counter (third argument, rules JSON).
- `narrow.mjs OUT PREFIX_JSON VERDICT_JSON` makes one panel per legal move from a position, with the solver's verdict under each.
- `scene2.mjs OUT` draws the first three steps of the retrograde analysis as a tree, one frame per step, for the GIF.
- `azgame.mjs` plays the greedy player (White) against the online AlphaZero net (Red) on the live board and prints the game as a move list.
- `capture.mjs OUT [light|dark]` takes board screenshots of the live page.
- `shortest.mjs` searches the engine breadth-first for the shortest game that ends, and prints the move lists.
- `board.css` is the board's look, shared by the scripts.
- `pogoq/` queries the solved table of `docs/experiments/v3-solve.md`: `cargo run --release -p pogoq -- ABS_TABLE_DIR MODE 'PREFIX_JSON' [MAX]`, with `MODE` one of `values`, `line`, `trace`, `narrow`. Its test needs the table: `POGOFISH_TABLE=/abs/path/models/v3-solve cargo test -p pogoq -- --ignored`.

Frames become a GIF with `gifski --fps N --width W -o out.gif OUT/f*.png`.
