# Repetition outcome: loss (`lc1-2`) or draw (`lc1d-2`)?

Date: 2026-11-01. The configuration, the criteria and the decision rule below were
written after the pilot and before any of the runs; they are not changed after.
Results are appended at the end.

## The question

Round 2 trains on `lc1-2`: a position (board and player to move) occurring for the
third time loses for the player whose move produced it (`v2-ruleset.md`). The
alternative was never tested: the same third occurrence ends the game as a **draw**.
The engine now offers it as `lc1d-2` (`RuleSet::LC1Draw`, `docs/rules.md` section 5);
the trigger is identical, only the outcome differs, and a base win is checked first
in both. The repetition count stays 2 (owner's decision).

The suspicion against `lc1-2`: in a shuffle, whoever is due to complete the third
occurrence must deviate or lose, so the rule may decide games by the parity of a
cycle rather than by the position (a "parity trap"). The suspicion against `lc1d-2`:
a player who is losing may steer into a repetition, and the game loses its
decisiveness.

## Configuration

Six runs, all on the owner's M2 (8 GB, 4 performance and 4 efficiency cores), three
at a time. Settings are those of `v2-az-lc1-run.md`, unchanged except for the rule:
`mlp_small`, 200 iterations × 50 self-play games, 100 simulations, buffer 100,000
positions, 100 SGD steps of 256, lr 0.02, momentum 0.9, 8-way augmentation,
checkpoints and arena checks every 10 iterations, safety limit 1,000 plies
(truncation is never a draw), truncation switch rule on (5 % over 3 iterations).

| Directory (`models/`) | Rule | Seed |
|---|---|---|
| `az-lc1d-s1`, `-s2`, `-s3` | `lc1d-2` | 1, 2, 3 |
| `az-lc1-m2-s1`, `-s2`, `-s3` | `lc1-2` | 1, 2, 3 |

```bash
./target/release/train models/az-lc1d-s1 --rules lc1d-2 --features mover-relative-repetition \
  --iterations 200 --checkpoint-every 10 --eval-every 10 --seed 1
./target/release/train models/az-lc1-m2-s1 --rules lc1-2 --features mover-relative-repetition \
  --iterations 200 --checkpoint-every 10 --eval-every 10 --seed 1
```

`lc1-2` is rerun rather than taken from `v2-az-lc1-runs/`: the committed cloud
metrics do not record which games the repetition rule ended (`variant_rule_endings`
and `draws` were added to the per-iteration metrics for this experiment), and the
reruns put both rules on the same machine and build. The cloud runs are not mixed
into any criterion; a rerun is not expected to be bit-identical to its cloud run
(different CPU and libtorch build), only comparable.

Nets trained under different rules play different games. **No net trained under
one rule plays a net trained under the other**; every comparison below is between
per-rule metrics.

## Pilot (measured)

`train models/az-lc1d-pilot --rules lc1d-2 --features mover-relative-repetition
--iterations 200 --checkpoint-every 10 --eval-every 10 --seed 1`, alone on the
machine, stopped by SIGINT after 300 s (clean stop at the next game boundary,
81 iterations kept, 4,050 games).

| Measure | Value |
|---|---|
| Self-play speed | 11.1–21.0 games/s per iteration (about 17) |
| Game length | 16.7–27.3 plies on average per iteration |
| Wall time per iteration | about 3.3 s (266.7 s of iteration time over 81 iterations), arena checks included |
| Truncated games | 0 of 4,050 |
| Peak RSS | 86 MiB after iteration 1, 545 MiB with 83,035 buffered positions |
| Score vs greedy (100-pair check) | 0.605 at iteration 10 → 0.89 at iteration 80 |
| Draws (repetition endings) | 110 of 4,050 (2.7 %); 44 of the last 500 (8.8 %) |

The draw counts were seen before the thresholds below were fixed. That is a
weakness of this pre-registration and is stated here rather than hidden; the
thresholds are argued from reasons other than these counts.

**Extrapolated (not measured).** Cloud lc1-2 runs slowed by a factor of about 1.9
between their first and last iterations as games lengthened from about 20 to 33
plies (`v2-az-lc1-runs/`). Applying that to the pilot's 3.3 s gives 3.3–6.3 s per
iteration, so **about 11–21 minutes per run alone**. Three runs in parallel on four
performance cores should be close to that, but contention is not measured. RSS slope
(545 − 86 MiB) / 83,035 positions ≈ 5.7 KiB per position, so about 640 MiB per run at
a full buffer (cloud runs measured 720 MiB); three in parallel about 2 GB. The machine
already has most of its swap in use, which is why runs go three at a time, not four.
The budget is in iterations, not time.

## Evaluation samples

All arena calls use 100 simulations per move, safety limit 1,000 plies, and the rule
the nets were trained under. Final checkpoint = `checkpoints/iter_00200.pt`.

- **Between final nets, after openings (sample A).** Per rule, the three
  cross-seed matches of final checkpoints (s1–s2, s1–s3, s2–s3): 200 random 4-ply
  openings each played with colours swapped, arena seed 7. 1,200 games per rule,
  pooled.
- **From the start position, self-play (sample S).** Per rule, the self-play games
  of iterations 181–200 of the three runs (with training noise: Dirichlet noise and
  temperature 1 for the first 10 moves). 3,000 games per rule, pooled, from
  `metrics.jsonl`.
- **From the start position, deterministic (sample D).** Per rule, the same three
  cross-seed pairings with no opening (`--opening 0 --pairs 1`): the nets add no
  noise, so each pairing and colour is one fixed game, six games per rule. Reported,
  too small to judge anything.
- **Skill gradient (sample G).** Per seed, the final checkpoint against its own
  iteration-20 checkpoint: 200 pairs, 4-ply openings, arena seed 7 (as in
  `v2-results.md` criterion 1).

Intervals on a proportion are 95 % Wilson intervals over games; intervals on a score
(win 1, draw ½, loss 0) are mean ± 1.96 standard errors over games, except the
arena's own score, which is over opening pairs. Games in sample A share openings and
nets, so the per-game intervals are somewhat too narrow; the per-match figures are
reported beside the pooled ones.

## Criteria (fixed before results)

**(a) How often the repetition rule decides.** R = games ended by the repetition
rule (not a base win) / finished games, per rule, in samples A and S. *The rule
rarely decides* when the upper bound of R's interval is **≤ 5 %**. Why 5 %: it is
the threshold this project already fixed for "an added rule matters" (the
truncation switch rule, `v2-ruleset.md`); scripted players produced a third
occurrence in at most 0.15 % of games (`v2-measure.json`), so 5 % already allows a
rule that acts thirty times as often as on random play.

**(b) Skill gradient.** For every seed, the final net's score against its own
iteration-20 checkpoint in sample G has a lower bound **> 0.5**, draws counting ½.
*Holds* when all three seeds pass. A run stopped by the truncation switch rule fails
(b). Reported for both rules; it decides only for `lc1d-2`.

**(c) Draw rate.** D = draws / finished games in samples A and S (and the six games
of D, reported). Under `lc1-2` no draw is possible; a draw there would be a bug.
Under `lc1d-2` the repetition rule is the only source of draws, so D equals R there.
*Decisive* means the upper bound of D's interval is **≤ 10 %** in sample A **and**
in sample S. Why 10 %: it is the ceiling round 1's verdict table already applies to
every variant (`VERDICT_THRESHOLDS.maxDraws` in `app/src/story/verdict.ts`), under
which the soft cap LC3-29 passed with 5.5 % draws; it was fixed long before this
experiment. Applied here to the upper bound rather than the point estimate, so it is
stricter than round 1's use. It is looser than (a)'s 5 % on purpose: (a) asks whether the rule is
marginal, (c) whether the game is still a game of results.

**(d) Colour balance.** White's score (draws ½) in sample S (start position) and in
sample A (after 4-ply openings), per rule, with its interval. *Measurably worse* for
`lc1d-2` means, in either sample, its White-score interval does not overlap the
`lc1-2` interval and its point estimate is farther from 0.5.

**(e) Where `lc1-2`'s wins come from.** Under `lc1-2`, the share of decisive games
won through the repetition rule rather than a base win, in samples A and S, with its
interval. *Repetition wins dominate* when the lower bound exceeds **50 %**. Under
`lc1-2` there are no draws, so this share is R of criterion (a); (e) states it
against base wins. Also reported, as a parity test with no threshold: in sample G,
the final net's score in games the repetition rule ended against its score in games
a base win ended. A rule that rewards the stronger player should give it about the
same score in both; a parity trap would pull the repetition-ended score towards 0.5.

## Decision rule (fixed before results)

`lc1d-2` is **preferred** only if all four hold:

1. **(b) holds** for `lc1d-2`: all three seeds beat their iteration-20 checkpoint
   (lower bound > 0.5).
2. **Games stay decisive** under `lc1d-2`: criterion (c), D's upper bound ≤ 10 % in
   sample A and in sample S.
3. **Colour balance is not measurably worse** under `lc1d-2` (criterion (d)).
4. **`lc1-2` has the problem the draw would fix**: its repetition rule does *not*
   rarely decide, i.e. the *lower* bound of R under `lc1-2` exceeds 5 % in sample A
   or in sample S.

Otherwise **`lc1-2` stays**, with the verdict worded by the first condition that
fails: 1–3 failing means the draw variant is rejected on its own merits; only 4
failing means there is no measured reason to change (the repetition outcome rarely
matters under either rule), and the status quo wins because it is already trained,
shipped in the terminal game and on the site.

Condition 4 needs the lower bound, not the point estimate: switching away from the
shipped rule requires evidence that it misbehaves, not the absence of evidence that
it does not. Criterion (e) and the parity test inform the reading but do not enter
the rule.

## Evaluation commands

```bash
# G (per rule R in {lc1d-2, lc1-2}, run prefix P in {az-lc1d, az-lc1-m2}, seed N)
./target/release/arena R net:models/P-sN/checkpoints/iter_00200.pt \
  net:models/P-sN/checkpoints/iter_00020.pt --pairs 200 --opening 4 --seed 7 --out G-P-sN.json
# A
./target/release/arena R net:models/P-s1/checkpoints/iter_00200.pt \
  net:models/P-s2/checkpoints/iter_00200.pt net:models/P-s3/checkpoints/iter_00200.pt \
  --pairs 200 --opening 4 --seed 7 --out A-P.json
# D
./target/release/arena R (same three nets) --pairs 1 --opening 0 --seed 7 --out D-P.json
```

Raw reports, per-run `config.json` and `metrics.jsonl`, and the computed summary go
in `v3-repetition-outcome/`.

## Deviations (added 2026-11-02, after the runs)

None touches a criterion, a threshold or the decision rule.

- **Another job shared the machine.** An exact solver of the uncapped game
  (`retro`, 4 threads, `nice 10`, capped near 3 GB) started during the first batch
  and ran through the second. The `lc1d-2` evaluation also ran during the second
  batch. Timings below are therefore conservative, and the two batches are not
  comparable with each other in speed.
- **Evaluation runner.** The commands above are run by `scripts/v3-eval.sh`; the
  analysis by `tools/repetition_outcome.py` (committed during the first batch, before
  any arena result existed). The first two attempts of the `lc1d-2` evaluation
  failed before playing a game (libtorch not found, then a quoting error in the
  script); the third ran. Nothing was discarded.

## Results (added 2026-11-02)

Raw data in `v3-repetition-outcome/`: `runs/*/config.json` and `metrics.jsonl`,
`arena/{G,A,D}-*.json`, and `summary.json` (written by
`tools/repetition_outcome.py docs/experiments/v3-repetition-outcome --out …`).

### Verdict

**`lc1-2` stays.** Two of the four conditions fail: games under `lc1d-2` are not
decisive from the start position (condition 2), and the repetition rule of `lc1-2`
rarely decides a game (condition 4 fails; criterion (a) holds for `lc1-2`). By the
wording fixed above, the draw variant is **rejected on its own merits**: condition 2
alone would be enough.

| Condition | Result |
|---|---|
| 1. Skill gradient holds under `lc1d-2` | **Met.** 0.787–0.820, every lower bound ≥ 0.754 |
| 2. Games stay decisive under `lc1d-2` (D ≤ 10 % upper bound, samples A and S) | **Not met.** A: 4.8 % [3.8, 6.2] passes; S: **15.1 % [13.8, 16.4]** fails |
| 3. Colour balance not measurably worse under `lc1d-2` | **Met.** Intervals overlap in both samples |
| 4. `lc1-2`'s repetition rule decides measurably often (R lower bound > 5 %) | **Not met.** A: 3.6 % [2.7, 4.8]; S: 1.8 % [1.4, 2.3] |

### Training

Six runs of 200 iterations, none truncated a game, none stopped by the switch rule.

| Run | Training time (sum of iterations) | Peak RSS | Mean plies, last iteration | vs greedy, iteration 200 (training check) | Repetition endings, all 10,000 games |
|---|---|---|---|---|---|
| `az-lc1d-s1` | 19.7 min | 438 MiB | 21.6 | 0.885 | 1,139 (draws) |
| `az-lc1d-s2` | 19.3 min | 438 MiB | 23.1 | 0.865 | 643 (draws) |
| `az-lc1d-s3` | 19.1 min | 491 MiB | 19.9 | 0.870 | 544 (draws) |
| `az-lc1-m2-s1` | 38.2 min | 471 MiB | 26.4 | 0.840 | 89 (wins) |
| `az-lc1-m2-s2` | 38.6 min | 501 MiB | 26.7 | 0.850 | 40 (wins) |
| `az-lc1-m2-s3` | 38.8 min | 607 MiB | 26.0 | 0.830 | 98 (wins) |

Wall time (measured): 22.7 min for the three `lc1d-2` runs in parallel, 43.6 min for
the three `lc1-2` runs (with the solver and the `lc1d-2` evaluation on the same
machine). The pilot's extrapolation, 11–21 minutes per run alone, held for the first
batch and not for the second; peak RSS stayed below the projected 640 MiB.
Evaluation: 7.2 min for `lc1d-2` (during the second batch), 2.0 min for `lc1-2`
(alone).

Repetition endings per 40 iterations (2,000 games) grow as the nets learn, much
faster under the draw rule:

| Iterations | 1–40 | 41–80 | 81–120 | 121–160 | 161–200 |
|---|---|---|---|---|---|
| `lc1d-2` s1 / s2 / s3 (draws) | 23 / 14 / 24 | 83 / 39 / 59 | 298 / 94 / 103 | 365 / 187 / 171 | 370 / 309 / 187 |
| `lc1-2` s1 / s2 / s3 (wins) | 1 / 0 / 0 | 6 / 1 / 9 | 19 / 7 / 17 | 28 / 19 / 30 | 35 / 13 / 42 |

### (a) How often the repetition rule decides

| Rule | Sample A (between final nets, 1,200 games) | Sample S (self-play 181–200, 3,000 games) | Rarely decides? |
|---|---|---|---|
| `lc1-2` | 43 — 3.6 % [2.7, 4.8] | 53 — 1.8 % [1.4, 2.3] | **Yes**, in both |
| `lc1d-2` | 58 — 4.8 % [3.8, 6.2] | 452 — 15.1 % [13.8, 16.4] | **No**, in both |

Per match in sample A: `lc1-2` 16, 19 and 8 of 400; `lc1d-2` 32, 13 and 13 of 400.
Per run in sample S: `lc1-2` 23, 8, 22 of 1,000; `lc1d-2` 205, 165, 82 of 1,000.

### (b) Skill gradient (final net vs its own iteration 20, 400 games)

| Seed | `lc1d-2` | W–D–L | `lc1-2` | W–D–L |
|---|---|---|---|---|
| 1 | 0.812 [0.779, 0.846] | 324–2–74 | 0.785 [0.751, 0.819] | 314–0–86 |
| 2 | 0.820 [0.787, 0.853] | 328–0–72 | 0.795 [0.761, 0.829] | 318–0–82 |
| 3 | 0.787 [0.754, 0.821] | 312–6–82 | 0.790 [0.756, 0.824] | 316–0–84 |

Holds under both rules. The `lc1-2` reruns land close to the cloud runs of round 2
(0.772–0.792, `v2-results.md`).

### (c) Draw rate

`lc1-2`: no draw anywhere, as it must be. `lc1d-2`: 4.8 % [3.8, 6.2] between final
nets after random openings (passes), 15.1 % [13.8, 16.4] in late self-play from the
start position (fails); all three seeds are above 8 % there (20.5 %, 16.5 %, 8.2 %).
Sample D, six fixed games from the start position: 2 draws of 6 under `lc1d-2`, none
of 6 under `lc1-2` (one of those six ended by the repetition rule).

### (d) Colour balance (White's score, draws ½)

| Rule | Sample S (start position) | Sample A (after 4-ply openings) | Sample D (6 games) |
|---|---|---|---|
| `lc1-2` | 0.541 [0.523, 0.559] | 0.748 [0.724, 0.773] | White 2, Red 4 |
| `lc1d-2` | 0.535 [0.519, 0.552] | 0.753 [0.729, 0.776] | White 0, draws 2, Red 4 |

No measurable difference between the rules. Under both, White wins about three games
in four between final nets after a random 4-ply opening, which is a stronger
imbalance than round 2 reported against greedy and TD (0.59–0.66) and close to its
ablation head-to-head (0.755).

### (e) Where `lc1-2`'s wins come from

Repetition wins are 3.6 % [2.7, 4.8] of decisive games in sample A and 1.8 %
[1.4, 2.3] in sample S: base wins outnumber them by more than twenty to one, far
from the 50 % "dominate" line. The parity test says nothing: in sample G the
repetition rule ended one game per seed under `lc1-2` (and 2, 0 and 6 draws under
`lc1d-2`), too few to compare with the 399 base-ended games.

### What this does not show

- **Indirect effects.** Only the games the rule *ended* are counted. A player forced
  by `lc1-2` to leave a cycle, who then loses on the base rule, counts as a base win;
  how much the threat of a repetition loss shapes play is not measured.
- **Why the draw rule produces draws in self-play and fewer after openings.**
  Written after the results, not tested: training noise (Dirichlet noise at every
  root, temperature for 10 moves) and the start position may make cycles easier to
  fall into than after a random opening; and under `lc1d-2` a side that is losing has
  a reason to seek the cycle that it does not have under `lc1-2`. The rising trend
  over training fits the second reading; it does not separate the two.
- **Other repetition counts.** Only 2 was tested (owner's decision).
- **Strength against people,** and anything beyond 10,000 self-play games per run.
- **Independence.** Arena games share openings and nets; the per-game intervals of
  samples A and S are somewhat too narrow. The verdict does not hang on a margin:
  15.1 % against a 10 % ceiling, and 3.6 % (upper bound 4.8 %) against a 5 % floor.

### Exported nets

The final checkpoints were exported for the pure-Rust inference
(`export_weights`, each within 8e-6 of its checkpoint on 100 positions), next to
their runs: `models/az-lc1-m2-s{1,2,3}/final.pfw` and
`models/az-lc1d-s{1,2,3}/final.pfw` (gitignored, like all of `models/`).
