# Pogofish v4 — common evaluation of every player

Date: 2026-11-08

## Protocol

Filled in by Task 8.

## Table fingerprint

The reference table is the solved uncapped game of `v3-solve.md`. It was rebuilt from
scratch into a separate directory (`models/v4-solve/`) and compared with the original
(`models/v3-solve/table.bin`). The two files are byte-identical:

```
1690c767b68a6214eb1fb4d74d932198a13f67c744b7c6e61102eeb44c5e3704  table.bin
```

(SHA-256 of the full 466 MB file, `shasum -a 256`.) The rebuilt copy was then deleted;
the benches read `models/v3-solve`.

```bash
cargo build --release -p pogofish-search --bin retro
R=./target/release/retro; D=models/v4-solve
/usr/bin/time -l $R reach $D
/usr/bin/time -l $R solve $D
shasum -a 256 $D/table.bin models/v3-solve/table.bin
```

Measured on the 8 GB M2 Mac, 4 threads, uninterrupted:

| Step | Wall time | Peak resident memory |
|---|---|---|
| `retro reach` | 15.9 s | 90.5 MB |
| `retro solve` | 61.3 s | 474.8 MB |

## Pilot

`v4bench` on the bundled net, sample cut to 500 positions per class and 50 arena pairs
(the controls still run on the full 10,000 + 10,000 sample):

```bash
/usr/bin/time -l ./target/release/v4bench models/v3-solve net:crates/cli/assets/az-lc1-s1.pfw \
  --sample-cap 500 --pairs 50 --out pilot.json
```

Measured on the 8 GB M2 Mac, 4 threads: wall time 6.71 s; max RSS from `/usr/bin/time -l`
585 MB. Phases (the binary's own timings): table SHA-256 1.38 s, load 0.11 s, sample
0.67 s, controls 0.59 s, value kept on 1,000 positions 1.43 s, arena 2.27 s (50 pairs,
one thread).

Full run per net at 100 simulations (20,000 positions, 1,000 pairs), **extrapolated from
pilot**: 2.8 s fixed + 1.43 × 20 ≈ 29 s + 2.27 × 20 ≈ 45 s, about **77 s**, with max RSS
near 0.59 GB (the table dominates). The arena term is the noisy one: it rests on 50 pairs
whose game lengths vary with the opening, and a net that plays longer games takes longer.

TD(λ) retrain under `lc1-2`, 20-iteration pilot (seed 1, scratch directory, deleted):

```bash
/usr/bin/time -l env DYLD_LIBRARY_PATH=$L ./target/release/td_train models/v4-td-pilot \
  --rules lc1-2 --features mover-relative-repetition --lambda 0.7 --lr 0.1 --iterations 20 \
  --temp-decay 1000 --eval-every 50 --eval-pairs 200 --checkpoint-every 50 --seed 1
```

Measured: 2.69 s wall, 116 MB max RSS (no evaluation fell inside 20 iterations). 1,000
iterations (50,000 games), **extrapolated from pilot**: about 135 s plus 20 evaluations. The
three full runs took 61.0 s, 61.7 s and 61.4 s each (evaluations included), 111–117 MB; the
pilot overestimated by about 2.2 times, because early iterations, at high temperature and
with an untrained net, play longer games than later ones.

## Main table

<!-- v4-table:start -->
| # | Player | Trained under | Keep won (95 % CI) | Keep drawn (95 % CI) | Score vs greedy (95 % CI) | Finished pairs | Unfinished games | Distinct games |
|---|---|---|---|---|---|---|---|---|
| 1 | table (perfect player) | — | 1.000 [1.000, 1.000] | 1.000 [1.000, 1.000] | 0.919 [0.908, 0.930] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1968 of 2000 |
| 2 | random (takes a win, avoids an immediate loss) | — | 0.360 [0.355, 0.365] | 0.112 [0.111, 0.113] | 0.031 [0.024, 0.038] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1975 of 2000 |
| 3 | greedy | — | 0.726 [0.720, 0.733] | 0.340 [0.333, 0.346] | 0.493 [0.474, 0.512] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1935 of 2000 |
| 4 | greedy-2ply | — | 0.824 [0.817, 0.830] | 0.448 [0.440, 0.456] | 0.755 [0.739, 0.772] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1961 of 2000 |
| 5 | TD(λ) v4-td-lc1-s1 | lc1-2 | 0.844 [0.837, 0.851]† | 0.483 [0.473, 0.492]† | 0.779 [0.763, 0.796] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1956 of 2000 |
| 6 | TD(λ) v4-td-lc1-s2 | lc1-2 | 0.828 [0.820, 0.835]† | 0.457 [0.447, 0.467]† | 0.764 [0.747, 0.781] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1966 of 2000 |
| 7 | TD(λ) v4-td-lc1-s3 | lc1-2 | 0.828 [0.821, 0.835]† | 0.447 [0.437, 0.457]† | 0.771 [0.754, 0.788] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1952 of 2000 |
| 8 | net az-lc1-s1, policy argmax, no search | lc1-2 | 0.817 [0.809, 0.824]† | 0.467 [0.457, 0.477]† | 0.578 [0.558, 0.598] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1959 of 2000 |
| 9 | net az-lc1-s1, 100 simulations | lc1-2 | 0.953 [0.949, 0.957]† | 0.689 [0.680, 0.698]† | 0.890 [0.878, 0.903] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1959 of 2000 |
| 10 | net az-lc1-m2-s1, 100 simulations | lc1-2 | 0.953 [0.948, 0.957]† | 0.695 [0.686, 0.704]† | 0.883 [0.870, 0.897] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1966 of 2000 |
| 11 | net az-lc1-m2-s2, 100 simulations | lc1-2 | 0.952 [0.947, 0.956]† | 0.697 [0.688, 0.706]† | 0.887 [0.875, 0.900] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1963 of 2000 |
| 12 | net az-lc1-m2-s3, 100 simulations | lc1-2 | 0.952 [0.948, 0.956]† | 0.696 [0.687, 0.705]† | 0.887 [0.874, 0.900] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1967 of 2000 |

Keep won (drawn): the share of held-out won (drawn) positions in which the player's move keeps the position's value in the uncapped table. Score: against greedy, over finished pairs only; unfinished games (1,000-ply limit) are counted apart and are never draws.

† Read from the uncapped game's table, but the player learnt under the rule of the "Trained under" column and is scored under `lc1-2` (a position's third occurrence loses for the player who causes it). The table ignores repetition and the sampled positions carry no history, so the repetition inputs of a net read "never seen": these two figures are not an in-game measure. The score against greedy is played under the live rules.

Commands, by row:

1. `./target/release/v4bench models/v3-solve table --out docs/experiments/v4/table.json`
2. `./target/release/v4bench models/v3-solve random --out docs/experiments/v4/random.json`
3. `./target/release/v4bench models/v3-solve greedy --out docs/experiments/v4/greedy.json`
4. `./target/release/v4bench models/v3-solve greedy-2ply --out docs/experiments/v4/greedy-2ply.json`
5. `./target/release/v4bench models/v3-solve td:models/v4-td-lc1-s1/td.pfv --out docs/experiments/v4/td-lc1-s1.json`
6. `./target/release/v4bench models/v3-solve td:models/v4-td-lc1-s2/td.pfv --out docs/experiments/v4/td-lc1-s2.json`
7. `./target/release/v4bench models/v3-solve td:models/v4-td-lc1-s3/td.pfv --out docs/experiments/v4/td-lc1-s3.json`
8. `./target/release/v4bench models/v3-solve net:crates/cli/assets/az-lc1-s1.pfw:0 --out docs/experiments/v4/az-lc1-s1-0.json`
9. `./target/release/v4bench models/v3-solve net:crates/cli/assets/az-lc1-s1.pfw:100 --out docs/experiments/v4/az-lc1-s1-100.json`
10. `./target/release/v4bench models/v3-solve net:models/v3/az-lc1-m2-s1/final.pfw:100 --out docs/experiments/v4/az-lc1-m2-s1-100.json`
11. `./target/release/v4bench models/v3-solve net:models/v3/az-lc1-m2-s2/final.pfw:100 --out docs/experiments/v4/az-lc1-m2-s2-100.json`
12. `./target/release/v4bench models/v3-solve net:models/v3/az-lc1-m2-s3/final.pfw:100 --out docs/experiments/v4/az-lc1-m2-s3-100.json`
<!-- v4-table:end -->

## Appendix: nets trained under lc1d-2

<!-- v4-appendix:start -->
| # | Player | Trained under | Keep won (95 % CI) | Keep drawn (95 % CI) | Score vs greedy (95 % CI) | Finished pairs | Unfinished games | Distinct games |
|---|---|---|---|---|---|---|---|---|
| 1 | net az-lc1d-s1, 100 simulations | lc1d-2 | 0.956 [0.952, 0.960]† | 0.712 [0.703, 0.721]† | 0.893 [0.880, 0.906] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1966 of 2000 |
| 2 | net az-lc1d-s2, 100 simulations | lc1d-2 | 0.956 [0.952, 0.960]† | 0.712 [0.703, 0.721]† | 0.889 [0.876, 0.902] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1962 of 2000 |
| 3 | net az-lc1d-s3, 100 simulations | lc1d-2 | 0.957 [0.953, 0.961]† | 0.716 [0.707, 0.725]† | 0.895 [0.882, 0.908] | 1000 of 1000 | 0 of 2000 (0.0 %) | 1966 of 2000 |

Keep won (drawn): the share of held-out won (drawn) positions in which the player's move keeps the position's value in the uncapped table. Score: against greedy, over finished pairs only; unfinished games (1,000-ply limit) are counted apart and are never draws.

† Read from the uncapped game's table, but the player learnt under the rule of the "Trained under" column and is scored under `lc1-2` (a position's third occurrence loses for the player who causes it). The table ignores repetition and the sampled positions carry no history, so the repetition inputs of a net read "never seen": these two figures are not an in-game measure. The score against greedy is played under the live rules.

Commands, by row:

1. `./target/release/v4bench models/v3-solve net:models/v3/az-lc1d-s1/final.pfw:100 --out docs/experiments/v4/appendix-lc1d/az-lc1d-s1-100.json`
2. `./target/release/v4bench models/v3-solve net:models/v3/az-lc1d-s2/final.pfw:100 --out docs/experiments/v4/appendix-lc1d/az-lc1d-s2-100.json`
3. `./target/release/v4bench models/v3-solve net:models/v3/az-lc1d-s3/final.pfw:100 --out docs/experiments/v4/appendix-lc1d/az-lc1d-s3-100.json`
<!-- v4-appendix:end -->

## Tabular learner — pre-registration

Written and committed before any pilot or training run of the learner (Task 7 of the v4
plan). The criteria and the prediction below are fixed here; a failure stays failed, with no
retuning and no rerun.

**Design.**

- **One value per position, dense.** `Vec<f32>` indexed by `Game::rank` (`retro.rs`):
  232,792,560 × 4 B = 931 MB, plus a 29 MB visited bitset; fits the 8 GB M2. A sparse map's
  cost per visited position is measured during the pilot (a `HashMap<u64, f32>` filled to
  1 M entries, peak RSS read; estimate before measuring: ~40 B), which gives the visited count
  above which it passes 931 MB; the dense array is in any case O(1), deterministic and saved
  as one file. Stored as `models/v4-qtab-sN/v.bin` (gitignored).
- **This is V, not Q.** The game is deterministic: Q(s, a) = r(s, a) if the move ends the
  game, else −V(s′), where s′ is the position after a (the opponent to move). One value per
  position therefore defines Q for every move.
- **Update (Q-learning, afterstate form):** at each ply, before the move,
  V(s) ← V(s) + α·(max_a Q(s, a) − V(s)), with r = +1 if the move wins for the mover, −1 if it
  loses (including the third occurrence under `lc1-2`, read from `is_terminal` on the real
  history). Behaviour: ε-greedy on Q, ties uniform.
- **Constants, pre-set:** V₀ = 0, α = 0.1, ε decays linearly from 1.0 to 0.05 over the run,
  1,000-ply limit. A truncated game has no result: no terminal reward; the per-ply updates
  already made stand (they never needed the outcome).
- **Training under `lc1-2`.** V ignores history, so under `lc1-2` it is not a Markov state
  (same mismatch as the nets); the max target still sees repetition losses through the live
  rules.
- **Three seeds**, resumable (Ctrl+C stops at a game boundary; V, counters, generator saved),
  as `td_train`.
- **Budget:** a 5-minute pilot measures positions/s; the run length is set so one seed takes
  about 1 h extrapolated, written in this document labelled "extrapolated from pilot" before
  the run.

The bench plays the learnt table as `qtab:<v.bin>`: its tied set is the moves of highest
Q(s, a) as defined above (the exact result if the move ends the game under the live rules,
else −V(s′)), exact float ties only.

**Pre-registered criteria** (reported as met or failed; a failure stays failed, no retuning and
rerun):

1. Against `random` (1,000 pairs, seed 404): lower 95 % bound > 0.5 on all three seeds.
2. Against `greedy` (same protocol): lower 95 % bound > 0.5 on all three seeds — the bar TD
   met in round 2.
3. Value kept on the common held-out sample above random's, lower bound > 0.360 (won) and
   > 0.112 (drawn), on all three seeds. **Written prediction:** close to random's rates,
   because most sample positions have no visited child; if so, this criterion measures
   coverage, and the table-to-TD gap measures what generalisation brings.
4. Reported without threshold: the same keep rate on the sample positions with at least one
   visited child (with n), and the share of reachable positions visited.

`random` in criterion 1 is the bench's `random` row (row 2 of the main table: every legal
move after taking a move that wins at once and avoiding one that loses at once, round 3's
`Policy::Random`), not the arena's uniform `Scripted::Random`. `greedy` in criterion 2 is the
bench's usual opponent.

### Tabular learner — pilot and budget

Five minutes of `qtrain` on seed 1 in a scratch directory (deleted), stopped by SIGINT:

```bash
/usr/bin/time -l ./target/release/qtrain <scratch> --games 100000000 --seed 1 --save-every 60
```

With `--games 100000000`, ε stayed near 1.0 throughout (0.9996 at the end): the pilot measures
almost uniform play. Measured on the 8 GB M2 Mac, one thread: 42,502 games and 5,671,034 plies
(updates) in 300.6 s, so 141 games/s and 18,860 positions/s, 133 plies per game on average;
6 games cut at 1,000 plies; 5,353,008 positions visited. Wall time 301.1 s, max RSS from
`/usr/bin/time -l` 997 MB. Five saves of `v.bin` + `visited.bin` fell inside the 300 s and are
included in the rates.

Sparse map, measured once (a standalone program, `HashMap<u64, f32>` with the standard hasher,
1,000,000 random keys below 232,792,560, of which 997,780 distinct): peak RSS 73.2 MB against
1.5 MB empty, **71.8 B per entry** at peak (the estimate was ~40 B; the peak includes the copy
made when the map grows). A map passes the dense array's 931 MB at about 13 M entries; the pilot
visited 5.4 M positions in 5 minutes.

**Budget, extrapolated from pilot:** `--games 500000` per seed, about 500,000 / 141 ≈ 3,540 s,
just under 1 h, and about 66 M updates. The extrapolation rests on near-uniform play; as ε
falls, the games' length can change (greedy play may repeat positions and end on a third
occurrence, or run to the limit), and the run time with it.
