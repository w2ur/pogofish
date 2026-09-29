# AlphaZero run configuration — plan task 4.3 (uncapped game)

**Superseded:** these runs were stopped by the ruleset switch rule
(`v2-az-uncapped.md`); round 2 continues on `lc1-2` (`v2-az-lc1-run.md`).

Date: 2026-09-27. Written before the runs start; not changed after.

## Pilot (measured)

`train models/az-pilot --features mover-relative --seed 1` with the defaults below,
stopped by SIGINT after 5 minutes (clean stop, 27 iterations, 1,350 games).
Machine: cloud Intel Xeon @ 2.10 GHz, one libtorch thread per run, 16 GB RAM.

| Measure | Value |
|---|---|
| Self-play speed | 5–8.5 games/s after the first iterations (mean about 6.5), 100 simulations per move |
| Game length | 15–37 plies per game on average per iteration (about 20 typical) |
| Truncated games | 1 of 1,350 |
| Peak RSS | 286 MiB at start, 395 MiB with 28,192 buffered positions |
| Wall time per iteration | about 11 s including an arena check every 5 iterations |

These figures describe the cloud machine, not the owner's M2.

## Run length and memory

- **200 iterations × 50 games = 10,000 self-play games per run.** At the pilot's
  about 11 s per iteration: about 37 minutes per run. The pilot reached 0.75 against
  greedy after 1,250 games, so 10,000 leaves room to see a plateau (criterion 2).
- **Replay buffer 100,000 positions.** The pilot's RSS grew by about 4.0 KiB per
  buffered position (395 − 286 MiB over 28,192 positions). Extrapolated linearly
  (an extrapolation from that slope, not a measurement): about 670 MiB per run at a
  full buffer, **below the 5 GB ceiling** for the owner's 8 GB machine.
- Four runs in parallel here (4 cores): about 2.7 GB projected in total, of 15 GB
  available.

## Runs

| Directory (under `models/`) | Features | Seed | Purpose |
|---|---|---|---|
| `az-s1` | mover-relative | 1 | criteria 1–3 |
| `az-s2` | mover-relative | 2 | criteria 1–3 |
| `az-s3` | mover-relative | 3 | criteria 1–3 |
| `az-abs-s1` | absolute | 1 | ablation (task 5.2, see below) |

Common settings (the `train` defaults): `mlp_small` (trunk 256→128, heads 128),
100 simulations, c_puct 1.5, Dirichlet α 0.3 / ε 0.25, temperature 1 for the first
10 moves, safety limit 1,000 plies, buffer 100,000 positions, 100 SGD steps of 256
per iteration, learning rate 0.02, momentum 0.9, weight decay 1e-4, 8-way symmetry
augmentation, checkpoint every 10 iterations, arena check against random and
greedy every 10 iterations (100 pairs, 50 simulations; monitoring only, the
criteria are judged afterwards with fresh openings).

```bash
./target/release/train models/az-s1 --features mover-relative --iterations 200 --checkpoint-every 10 --eval-every 10 --seed 1
./target/release/train models/az-abs-s1 --features absolute --iterations 200 --checkpoint-every 10 --eval-every 10 --seed 1
```

## Ablation choice (task 5.2)

The plan's ablation, "Markov features on vs off", has nothing to switch under the
uncapped game: the board alone is already a Markov state (task 2.2), so there are
no extra features to remove. It is replaced by the ablation 4.1 made necessary:
**input encoding, absolute vs mover-relative**, one seed, same settings.

## How the criteria will be judged (fixed before results)

Pre-registered criteria are in the plan (Phase 5). Their operational form, written
while the runs are in progress and before any is read:

1. **Beats the baselines.** For each seed, the final checkpoint (iteration 200)
   plays `arena` with fresh openings (`--seed 7`, 200 pairs = 400 games, 4-ply
   openings, 100 simulations per move) against: `random`, `greedy`, the TD agent of
   the same seed number (`td:models/td-mr-sN/weights.pt`), and its own checkpoint at
   10 % of training (iteration 20). Passed when every interval's lower bound is above
   0.5. Distinct positions after the opening are reported for each match.
2. **Rises and plateaus.** For each seed, checkpoints at iterations 20, 40, …, 200
   are rated on one ladder: each plays random, greedy, `mcts-uniform:200` and the
   next checkpoint (100 pairs each, 50 simulations per move, arena seed 11), with
   random anchored at 0. *Rises*: the last checkpoint's interval lies entirely above
   the first's. *Plateaus rather than oscillates*: the last three checkpoints'
   intervals overlap pairwise, and no checkpoint after the first to reach the final
   checkpoint's lower bound falls below the final's interval afterwards.
3. **Reproducible.** 1 holds for all three seeds; the spread of scores against
   greedy across seeds is reported.
4. **Owner plays.** Needs the owner; a hard stop.
