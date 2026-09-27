# AlphaZero run configuration under `lc1-2` — plan task 4.3 (second ruleset)

Date: 2026-09-27. Written before the runs start; not changed after. Replaces
`v2-az-run.md`, whose uncapped runs the switch rule stopped (`v2-az-uncapped.md`).

## Pilot (measured)

`train models/az-lc1-pilot --rules lc1-2 --features mover-relative-repetition --seed 1`,
defaults otherwise, stopped by SIGINT after 5 minutes (clean stop, 24 iterations,
1,200 games). Cloud Intel Xeon @ 2.10 GHz, one thread, 16 GB RAM.

| Measure | Value |
|---|---|
| Self-play speed | 3.6–6.9 games/s (about 5), 100 simulations per move |
| Game length | 15.6–24.4 plies on average per iteration |
| Truncated games | 0 of 1,200 |
| Peak RSS | 286 MiB at start, 376 MiB with 23,534 buffered positions |
| Wall time per iteration | about 10.5 s, plus an arena check every 5 iterations |
| Score vs greedy (100-pair check) | 0.40 → 0.77 over iterations 5–20 |

## Run length and memory

- **200 iterations × 50 games = 10,000 games per run**, as before: about 35 minutes at
  the pilot's pace. Caveat from the uncapped runs: games grew fivefold as the agents
  improved, so the real duration may be several times longer; the budget is in
  iterations, not time.
- **Buffer 100,000 positions.** Pilot slope about 3.9 KiB per position (376 − 286 MiB
  over 23,534 positions); extrapolated linearly (not measured): about 670 MiB at a
  full buffer, below the 5 GB ceiling.
- The truncation switch rule stays on (default 5 % over 3 iterations) and now stops
  training by itself.

## Runs

| Directory (`models/`) | Features | Seed | Purpose |
|---|---|---|---|
| `az-lc1-s1` | mover-relative-repetition | 1 | criteria 1–3 |
| `az-lc1-s2` | mover-relative-repetition | 2 | criteria 1–3 |
| `az-lc1-s3` | mover-relative-repetition | 3 | criteria 1–3 |
| `az-lc1-norep-s1` | mover-relative (repetition feature off, `--allow-missing-features`) | 1 | ablation 5.2 |

Settings are the `train` defaults listed in `v2-az-run.md` (mlp_small, 100 simulations,
buffer 100,000, 100 SGD steps of 256, lr 0.02, momentum 0.9, 8-way augmentation),
with checkpoints and arena checks every 10 iterations.

```bash
./target/release/train models/az-lc1-s1 --rules lc1-2 --features mover-relative-repetition \
  --iterations 200 --checkpoint-every 10 --eval-every 10 --seed 1
./target/release/train models/az-lc1-norep-s1 --rules lc1-2 --features mover-relative \
  --allow-missing-features --iterations 200 --checkpoint-every 10 --eval-every 10 --seed 1
```

## Ablation (task 5.2)

Under `lc1-2` the plan's original ablation applies again: **the repetition feature on
vs off**, one seed, same settings. The "off" run needs an explicit override that is
recorded in its `config.json`.

## How the criteria will be judged (fixed before results)

As in `v2-az-run.md`, with the ruleset `lc1-2` in every arena call and these changes:
the TD opponent of seed N is `td:models/td-lc1-sN/weights.pt`; the checkpoints are
those of `az-lc1-sN`. Everything else (400 games, fresh openings from arena seed 7,
100 simulations for criterion 1; ladder of iterations 20–200 against random, greedy,
`mcts-uniform:200` and the next checkpoint, 100 pairs at 50 simulations, arena seed
11, for criterion 2; the "rises" and "plateaus" tests) is unchanged. A run stopped by
the switch rule fails criterion 3.
