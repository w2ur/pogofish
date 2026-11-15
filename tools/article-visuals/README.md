# Article visuals

Scripts that made the images and GIFs of the Pogofish article. The `.mjs` scripts replay moves through the WASM engine (`wasm-pkg/`, built with `wasm-pack`) and screenshot the board with Playwright (`app/node_modules/playwright-core`, so run `npm install` in `app/` first); the first argument of each is the output directory, and generated PNG and GIF files are git-ignored.

- `sequence.mjs OUT 'MOVES_JSON'` renders a game as one image per move; `seq2.mjs` does the same with an optional repetition counter (third argument, rules JSON).
- `narrow.mjs OUT PREFIX_JSON VERDICT_JSON` makes one panel per legal move from a position, with the solver's verdict under each.
- `replies.mjs OUT PREFIX_JSON VALUES_TXT` draws every reply from the position after PREFIX as the board *after* the reply (the cell left in dashes), grouped into draw-keeping and losing moves, the losing ones sorted by plies to loss; VALUES_TXT is the output of `pogoq … values PREFIX`, and the script refuses to draw if its moves differ from the engine's legal moves.
- `scene2.mjs OUT` draws the first three steps of the retrograde analysis as a tree, one frame per step, for the GIF.
- `greedy.mjs OUT search|game|sheet …` plays the greedy player against itself under `lc1-2` (a port of `crates/search/src/players.rs`): `search LO-HI` lists seeded games, `game SEED` renders one captioned frame per ply into OUT, `sheet SEED PLY` writes OUT as one panel per move greedy weighs at that ply, with its score; `moves SEED` prints the game's move list.
- `qlearn.mjs OUT PREFIX_JSON VERDICT_JSON GAMES SEED [LINE_JSON]` replays the endgame after PREFIX GAMES times with the tabular learner's rule (a JavaScript port of `crates/search/src/qtab.rs`, not the measured program) and renders one frame per checkpoint: each move's learned value, its exact verdict from `pogoq`, and V along LINE.
- `qsteps.mjs OUT PREFIX_JSON FIRST_MOVE_JSON GAMES` walks the same rule one update per frame on the line A → B → C_k → win (FIRST_MOVE played at A, every C must have an immediate win): the boards with the move played, the computation, and a notebook of A, B and the C positions. No exploration; ties go to the first move in engine order.
- `v5video.mjs OUT qtab|td|az100|race` renders the round-5 learning videos (`docs/experiments/v5-video.md`) as 1280×720 frames plus an ffmpeg concat list `OUT/list.txt`: for one program, each of the eight stages of seed 1 with its measured score against greedy and the game shown (replayed through the engine; it refuses to render if the replayed outcome differs from the game JSON), the stage curve building up beside the board; `race` draws every program's curve against games trained on a log axis, with random, greedy and the table as references. Every figure comes from `docs/experiments/v5/curves.json`. Then `cd OUT && ffmpeg -f concat -safe 0 -i list.txt -vf fps=30,format=yuv420p -c:v libx264 -crf 18 out.mp4`.
- `azgame.mjs` plays the greedy player (White) against the online AlphaZero net (Red) on the live board and prints the game as a move list.
- `capture.mjs OUT [light|dark]` takes board screenshots of the live page.
- `shortest.mjs` searches the engine breadth-first for the shortest game that ends, and prints the move lists.
- `board.css` is the board's look, shared by the scripts.
- `pogoq/` queries the solved table of `docs/experiments/v3-solve.md`: `cargo run --release -p pogoq -- ABS_TABLE_DIR MODE 'PREFIX_JSON' [MAX]`, with `MODE` one of `values`, `line`, `trace`, `narrow`. Its test needs the table: `POGOFISH_TABLE=/abs/path/models/v3-solve cargo test -p pogoq -- --ignored`.

Frames become a GIF with `gifski --fps N --width W -o out.gif OUT/f*.png`.
