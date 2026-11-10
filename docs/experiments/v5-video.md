# Round 5: learning curves for the video

Each learning program of round 4 is measured at several points of its training, with round
4's bench (`v4bench`, `v4-evaluation.md`), so that a video can show the same program weak at
the start and stronger at the end, each stage with its measured score against greedy and one
game played against greedy. This document fixes the rules **before any measurement**; it is
committed before the first bench of this round runs. A criterion that fails stays failed: no
retuning, no rerun with other settings.

The video itself (rendering, editing) is not produced here; this round delivers the scores
(JSON and a generated table) and, for each stage, the move list of the game shown.

## Decisions (owner, 2026-11-10)

1. **Stages are fractions of each program's own training budget**, counted in self-play
   games: **0, 1, 2, 5, 10, 25, 50 and 100 %**. The budgets differ (below), so the stages are
   comparable as a share of the run, not in absolute games or compute.
2. **AlphaZero is measured twice per stage**: with 100 simulations (round 4's protocol) and
   with none (`:0`, the move of highest prior).
3. **Three seeds for every program and every stage** (seeds 1, 2, 3).

## Programs, budgets and stages

All three learn under `lc1-2` (a position's third occurrence loses for the player who causes
it) with the settings of round 4; only the saving of intermediate states is added, which does
not change a run (see "Tooling").

| Program | Budget (games) | Settings (round 4) | Stage → state measured |
|---|---|---|---|
| Tabular learner (`qtrain`) | 5,000,000 | the long exploratory run of `v4-evaluation.md` ("Exploratory runs"): α 0.1, ε 1.0 → 0.05 linear over the run | snapshot of V after 0, 50,000, 100,000, 250,000, 500,000, 1,250,000, 2,500,000, 5,000,000 games |
| TD(λ) (`td_train`) | 50,000 (1,000 iterations × 50) | `v4-evaluation.md`: λ 0.7, lr 0.1, temperature decay 1,000, `mover-relative-repetition` | checkpoint after iteration 0, 10, 20, 50, 100, 250, 500, 1,000 |
| AlphaZero (`train`) | 10,000 (200 iterations × 50) | `az-lc1-m2-s1` to `-s3` (`v3-repetition-outcome.md`) | checkpoint after iteration 0, 2, 4, 10, 20, 50, 100, 200 |

The tabular learner's ε decays over its whole budget, so its 500,000-game stage is not round
4's 500,000-game run (whose ε reached 0.05): it is a tenth of the way through a longer run.
Stage 0 is the state before any game: V = 0 everywhere for the tabular learner, the seeded
initialisation for the two nets.

Commands (seed `S` in 1, 2, 3):

```bash
./target/release/qtrain models/v5-qtab-sS --games 5000000 --seed S \
  --snapshot-at 0,50000,100000,250000,500000,1250000,2500000,5000000
./target/release/td_train models/v5-td-sS --rules lc1-2 --features mover-relative-repetition \
  --lambda 0.7 --lr 0.1 --iterations 1000 --temp-decay 1000 --eval-every 50 --eval-pairs 200 \
  --checkpoint-every 10 --seed S
./target/release/train models/v5-az-sS --rules lc1-2 --features mover-relative-repetition \
  --iterations 200 --checkpoint-every 2 --eval-every 10 --seed S
```

Each TD checkpoint is exported with `export_td` to a `.pfv`, each AlphaZero checkpoint with
`export_weights` to a `.pfw`; both refuse to write unless the pure-Rust copy matches the
checkpoint within 1e-5 on 100 positions.

## Measure

Each stage of each program and seed: `v4bench models/v3-solve <player> --out
docs/experiments/v5/<program>-sS-<stage>.json`, round 4's defaults unchanged (value kept on
the 10,000 + 10,000 held-out positions, sample seed 31; 1,000 colour-swapped pairs against
greedy from 4-ply random openings, arena seed 404; 4 threads). Players: `qtab:<v.bin>`,
`td:<pfv>`, `net:<pfw>:100` and `net:<pfw>:0`. That is 8 stages × 3 seeds × 4 players = 96
benches. The bench runs its controls (oracle, anti-oracle, random against round 3) before
each measure and exits 2 without JSON if one fails.

Fixed references on the curve, not re-measured: random 0.031, greedy 0.493, the table 0.919
against greedy (`v4-evaluation.md`, main table, rows 1–3).

A generated table (`docs/experiments/v5/table.md`, by `tools/v5_table.py` from the JSON)
lists every stage.

## The game shown

**One opening for every program, stage and seed: the first opening of the bench's arena**
(pair 0 of arena seed 404: four uniformly random plies that do not end the game). **The
program plays White** (the first game of each bench pair), greedy plays Red. The game is
replayed with the bench's own generator stream (`v5game`, below), so it *is* game 0 of the
measured arena, not an extra game. The video uses seed 1's games; the move lists of seeds 2
and 3 are written too.

The game illustrates; it does not measure. Its caption carries the stage's measured score,
not the game's outcome.

Output: `docs/experiments/v5/games/<program>-sS-<stage>.json`, the full move list from the
initial position (opening included) as `[from_cell, num_pieces, to_cell]` triples, the format
`tools/article-visuals/sequence.mjs` replays through the WASM engine.

## Criteria (fixed now)

1. **Controls**: every bench passes its controls (else no JSON, reported).
2. **No unfinished game**: `arena.a.unfinished` is 0 in every JSON.
3. **Reproduction of round 4 at the last stage**, by the 95 % interval of the score against
   greedy overlapping round 4's for the same seed:
   - tabular seed 1 at 5,000,000 games: 0.178 [0.163, 0.193] (the exploratory run). Seeds 2
     and 3 had no long run in round 4: no reference.
   - TD seeds 1–3 at 1,000 iterations: 0.779 [0.763, 0.796], 0.764 [0.747, 0.781], 0.771
     [0.754, 0.788];
   - AlphaZero seeds 1–3 at 200 iterations, 100 simulations: 0.883 [0.870, 0.897], 0.887
     [0.875, 0.900], 0.887 [0.874, 0.900]. No round-4 reference at 0 simulations for these
     nets.

   Round 4 ran on the 8 GB M2 Mac; this round runs on a Linux x86-64 cloud machine with
   libtorch 2.4.0 from the PyPI `torch` wheel (the libtorch download host is not reachable
   from it). The tabular learner is pure Rust and is expected to be bit-identical; the nets
   may differ in floating point, hence the interval criterion rather than equality.
4. **Stage 0 near random**: for the tabular learner and TD at stage 0, and AlphaZero at stage
   0 without search, the score's 95 % interval lies below 0.10 (random scores 0.031 [0.024,
   0.038]). No prediction for AlphaZero at stage 0 with 100 simulations: the search alone,
   with exact terminal values, may already play above random.

No prediction is made on the shape of the curves between the first and the last stage.

## Tooling (added before the first measure)

- `qtrain --snapshot-at G1,G2,…`: copies V, the visited set and the state into
  `snapshots/g<games>/` when the run has played exactly that many games (0 included). A
  snapshot is a write only; the run is unchanged (test). Snapshots are 960 MB each, so a
  snapshot is deleted once benched and its game recorded; its SHA-256 is kept in the results.
- `td_train` and `train`: a fresh run with `--checkpoint-every` > 0 also saves the
  initialisation as `checkpoints/iter_00000.pt` (test: equal to the seeded initialisation,
  and the run after it unchanged).
- `v5game <player-spec> --out <json>`: replays game 0 of the bench's arena (above).
- `tools/v5_table.py`: the table from the JSON.

## Results

Not measured yet.
