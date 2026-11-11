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

All 96 benches ran; the full table, the keep rates and the criteria are generated in
`v5/table.md`, the same figures as data for the video in `v5/curves.json`
(`uv run tools/v5_table.py`). The SHA-256 of every tabular snapshot benched (then deleted)
is in `v5/qtab-snapshots.txt`. Commands: `scripts/v5-eval.sh qtab|td|az SEED`, after the
training commands above.

**Criteria: all met.** Every bench passed its controls; no game of any bench was unfinished;
the last stage reproduces round 4 for every seed with a reference (tabular seed 1: 0.178
[0.163, 0.193], equal to round 4's to the third decimal of the interval; TD 0.783, 0.771,
0.757; AlphaZero at 100 simulations 0.890, 0.894, 0.889, each interval overlapping round 4's
for the same seed); and stage 0 scores below 0.10 for the tabular learner (0.031, the
random player's score: with V = 0 everywhere it is that player), TD (0.050–0.070) and
AlphaZero without search (0.002–0.010).

Score against greedy, seed 1 (seeds 2 and 3 in `v5/table.md`):

| Stage | Tabular | TD(λ) | AlphaZero, 100 sims | AlphaZero, no search |
|---|---|---|---|---|
| 0 % | 0.031 | 0.070 | 0.205 | 0.005 |
| 1 % | 0.032 | 0.451 | 0.323 | 0.007 |
| 2 % | 0.032 | 0.526 | 0.407 | 0.010 |
| 5 % | 0.035 | 0.579 | 0.715 | 0.081 |
| 10 % | 0.044 | 0.596 | 0.809 | 0.107 |
| 25 % | 0.072 | 0.649 | 0.868 | 0.313 |
| 50 % | 0.106 | 0.766 | 0.893 | 0.517 |
| 100 % | 0.178 | 0.783 | 0.890 | 0.578 |

Read: every program starts at or below random's level except AlphaZero with search, whose
untrained net already scores 0.051–0.205 across seeds with 100 simulations (no prediction
was made for it). TD rises fastest in share of its budget (0.38–0.45 after 1 %, 500 games);
AlphaZero with search passes greedy's 0.493 between 2 % and 5 % (200 and 500 games) and is
flat from 50 % (0.889–0.903 at 50 % and 100 %, overlapping intervals); its net alone climbs
later and ends at 0.573–0.603. The tabular learner is still rising at the end of its 5,000,000
games (0.106–0.114 at 50 %, 0.173–0.182 at 100 %) and stays below greedy. The stages are
shares of different budgets: TD's 1 % is 500 games, the tabular learner's 50,000.

**The game shown varies little.** Pair 0's opening leads to short games (9 to 22 plies). The
tabular learner loses it at every stage; TD wins it at every stage, stage 0 included;
AlphaZero with search loses it up to 2 % and wins it from 5 %; without search it loses it up
to 10 %, wins at 25 %, loses at 50 % and wins at 100 %. For TD and the tabular learner the
game therefore shows no change of outcome across stages; this is a fact of the
pre-registered opening, not changed here. The captions carry the measured score, as fixed
above.

**Runtimes** (Linux x86-64 cloud machine, 4 cores, 15 GB, shared by the jobs below, so not
comparable with round 4's M2 figures): the three tabular runs ran together, 7,291, 7,337 and
7,300 s each, at 681–686 games per second over the run (5,000,000 games, 205.8–206.0 M plies,
15–24 unfinished games each, 104.8–104.9 M positions visited, 45.6 % of the reachable ones,
as round 4's exploratory run); TD 122, 120 and 111 s; the three AlphaZero runs together,
2,332, 2,187 and 2,384 s, while the tabular runs and the benches also ran.

## Addendum: the tabular learner against random (added after the results)

Asked by the owner on 2026-11-11, after the results above: the tabular learner's curve
against greedy stays low (0.031 → 0.178), while round 4's exploratory run beat the bench's
`random` player clearly at 5,000,000 games (0.784 [0.766, 0.801]). This measure was **not
pre-registered** with the rest of the round; its rules are fixed here, before it runs.

- **Seed 1 only**, the same eight stages. The snapshots were deleted after the first benches,
  so the run is retrained with the same command into `models/v5r-qtab-s1`; each snapshot's
  `v.bin` must have the SHA-256 recorded in `v5/qtab-snapshots.txt` (the learner is
  deterministic), else the stage is reported as failed and not benched.
- **Measure**: `v4bench models/v3-solve qtab:<snapshot>/v.bin --opponent random`, defaults
  otherwise (1,000 colour-swapped pairs, arena seed 404), JSON in
  `v5/vs-random/qtab-s1-p<pct>.json`.
- **Reading**: stage 0 is the `random` player itself (V = 0 everywhere), so its score is
  expected near 0.5, with no criterion on it. The last stage must reproduce round 4's
  0.784 [0.766, 0.801] by overlapping intervals; no unfinished game.
- **Game shown** (added on 2026-11-11, before any of these games was played): game 0 of
  the same arena, `v5game qtab:<snapshot>/v.bin --opponent random`, the program as White
  against the bench's `random` player; in `v5/vs-random/games/`. The snapshots of stages
  0–5 % were deleted after their bench, so they are retrained once more (stopped after the
  250,000-game snapshot) and checked against the same SHA-256 before their games are played.
- **Self-play is not measured**: the same program against itself scores 0.5 by the colour
  swap, and against its stage-0 self it is this measure.
