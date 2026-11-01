# Round 2 — strategic principles read from the net, then tested

Date: 2026-11-01 · Net: `crates/cli/assets/az-lc1-s1.pfw` (seed 1, iteration 200,
mover-relative-repetition features) · Ruleset `lc1-2` throughout · Program:
`crates/infer/examples/principles.rs` · Features and the heuristic player:
`crates/search/src/principles.rs` · Raw outputs: `v2-principles/`

The question: which simple rules of thumb, stated in terms a player can check on the
board, make a player stronger? Candidate rules were read from the net (three
descriptive lenses), then each was built into a scripted player and played against
greedy in the arena. Only the arena results decide; the lenses only propose.

## Reproduce

```bash
cargo build --release -p pogofish-infer --example principles
P=./target/release/examples/principles; D=docs/experiments/v2-principles
$P lenses  --net-games 600 --greedy-games 200 --seed 1 --out $D/lenses.json
$P explore --lenses $D/lenses.json --pairs 500 --seed 101 --out $D/explore.json
$P confirm --explore $D/explore.json --pairs 1000 --seed 202 --combined-seed 303 --out $D/confirm.json
```

All three steps are deterministic; each was re-run and reproduced its JSON exactly
(timings aside). Runtime, measured on the 8-core M2 (8 threads): lenses 30.7 s,
exploration 7.4 s, confirmation about 20 s. A 24-game pilot (1.1 s) was timed first;
its extrapolation to 800 games (about 37 s) matched the run.

## Features

19 features of a position, read from one colour's side ("me"), whoever is to move
(`principles::features`, unit-tested on hand-built positions; two deliberate
mutations of the feature code were each caught by a test, one only after a test was
added for it):

| Name | Meaning |
|---|---|
| `top_diff` | my tops − opponent tops (greedy's evaluation) |
| `own_tops` | stacks I top |
| `prisoners` | opponent pieces inside stacks I top |
| `hostages` | my pieces inside stacks the opponent tops |
| `own_max_height`, `opp_max_height` | tallest stack each side tops |
| `own_mobility`, `opp_mobility` | moves each side would have if it were its turn |
| `centre` | +1 I top the centre, −1 the opponent does |
| `corners` | corners I top − corners the opponent tops |
| `own_singletons`, `opp_singletons` | one-piece stacks each side tops |
| `own_tall` | stacks of three or more I top |
| `own_solid` | stacks I top whose second piece is also mine |
| `own_exposed` | my tops the opponent can land on in one move |
| `opp_exposed` | opponent tops I can land on in one move |
| `my_win_now`, `opp_win_now` | 1 if that side has a move leaving the other no top |
| `repetition` | earlier occurrences of the position |

## Step 1 — the lenses (descriptive, not evidence)

Positions: 600 net-vs-net games (100 simulations per move, the first 10 plies sampled
at temperature 1 from the visit counts, the most-visited move afterwards) and 200
greedy-vs-greedy games, game seed 1: 21,637 positions, 18,913 of them from net games.
No net game was unfinished.

**(a) What explains the net's value.** Least squares of the net's raw value for the
player to move on the 19 standardised features: R² 0.54; `top_diff` alone: R² 0.30.
The strongest single correlates are `opp_mobility` (r = −0.61), `top_diff` (+0.55)
and `own_mobility` (+0.54); then `prisoners` (+0.39), `own_tall` and `my_win_now`
(+0.38), `hostages` (−0.33), `own_max_height` (+0.32), `opp_win_now` (−0.31). The
features are strongly correlated with each other (matrix in `lenses.json`), so the
joint coefficients are not interpretable one by one.

**(b) Which moves the net prefers.** 20,538 positions with no winning move and at
least two moves that do not lose at once. A conditional logit of the net's
most-visited move among those moves, on the features of the position after each move
(mover's side): McFadden R² 0.195 with all features, 0.012 with `top_diff` alone.
The net's move lies outside greedy's best set in 14,085 of these positions (69 %).
For each feature, a two-variable logit (`top_diff` plus the feature) gives the net's
preference once the top count is accounted for; its sign fixed the direction of each
candidate in step 2:

| Feature | coefficient given `top_diff` | chosen − mean of moves (sd) |
|---|---|---|
| `own_mobility` | +0.93 | +0.31 |
| `own_exposed` | −0.67 | −0.22 |
| `opp_win_now` | −0.65 | −0.29 |
| `own_tops` | −0.64 | +0.03 |
| `hostages` | −0.60 | −0.21 |
| `own_tall` | +0.56 | +0.37 |
| `opp_mobility` | −0.55 | −0.35 |
| `own_singletons` | −0.53 | −0.19 |
| `prisoners` | +0.50 | +0.31 |
| `opp_max_height` | −0.46 | −0.26 |
| `opp_exposed` | −0.45 | −0.26 |
| `repetition` | +0.31 | +0.65 |
| `own_max_height` | +0.25 | +0.34 |
| `centre` | −0.21 | −0.09 |
| `opp_singletons` | +0.14 | −0.02 |
| `own_solid` | +0.11 | +0.01 |
| `my_win_now` | +0.10 | +0.18 |
| `corners` | −0.00 (sign −) | +0.07 |

The net steers towards positions already seen once (`repetition` +0.65 sd): under
`lc1-2` the second occurrence is safe and the third loses for whoever produces it.

**(c) What predicts the winner of net games.** Correlation of each feature (mover's
side) with the mover winning, by ply. Before ply 8 nothing predicts much (linear R²
0.03–0.10). From ply 12 to 19: `opp_mobility` −0.44, `top_diff` +0.41,
`own_mobility` +0.38, `prisoners` +0.29, `own_tall` +0.29, `hostages` −0.28; linear
R² 0.29 with all features, 0.17 with `top_diff` alone.

## Step 2 — the arena test

**Player.** For a feature f and a weight w: take a winning move if one exists, avoid a
move that loses at once when there is a choice, otherwise maximise
`top_diff + w · f` on the position after the move, ties broken at random
(`principles::Heuristic`). With w = 0 it is greedy, move for move (unit test, same
generator draws). One ply, no search.

**Weights.** w = sign · k / sd, where sd is the feature's spread across candidate moves
(lens b), k ∈ {0.05, 0.25, 0.5, 1, 2} and the sign comes from lens b. `top_diff`
itself is not a candidate.

**Protocol, fixed before each run.**

1. Exploration, arena seed 101, 500 colour-swapped pairs from random 4-ply openings
   (1,000 games) per player, against greedy. Per feature, keep the best k. Advance it
   if that score is at least 0.52.
2. Confirmation, arena seed 202 (fresh openings), 1,000 pairs (2,000 games) per
   player, against greedy. Retained if the 95 % lower bound is above 0.5. The mirror of
   each candidate (same weight, opposite sign) is played too: a term whose mirror also
   beats greedy is a tie-break of any content, not a direction, and is not retained as
   a principle.
3. The retained terms combined, at their explored weights, on a third seed (303),
   summed and summed then divided by their number; and, descriptively, each against
   two-ply greedy.

Scores are per opening pair with a 95 % interval (`arena.rs`). No game in any match
reached the 1,000-ply limit. The 1,000 confirmation openings contain 992 distinct
ones.

## Controls

| Control (confirmation seed 202, 1,000 pairs) | Score [95 % CI] | Expected |
|---|---|---|
| greedy vs greedy | 0.497 [0.478, 0.515] | ≈ 0.5 |
| heuristic with greedy's weights vs greedy | 0.497 [0.478, 0.515] | ≈ 0.5, identical to the line above |
| negated top difference vs greedy | 0.020 [0.014, 0.026] | clearly < 0.5 |
| random vs greedy | 0.006 [0.003, 0.009] | clearly < 0.5 |
| two-ply greedy vs greedy (power) | 0.740 [0.723, 0.757] | > 0.5 |

Exploration seed 101 gave the same picture: 0.499 [0.474, 0.524], 0.499, 0.021, 0.005,
0.749. The test passes what should pass and fails what should fail. The mirrors are a
second set of wrong principles: 13 of the 14 confirmed candidates' mirrors score below
0.5 with an upper bound below 0.5 (table below).

## Results

Exploration advanced 15 of 18 features (`explore.json`). Confirmation:

| Feature, direction | Weight per unit (tops) | Explore | Confirmation [95 % CI] | Mirror [95 % CI] | Verdict |
|---|---|---|---|---|---|
| `own_max_height` up | +0.171 | 0.636 | **0.632 [0.613, 0.650]** | 0.328 [0.310, 0.346] | retained |
| `opp_mobility` down | −0.106 | 0.651 | **0.629 [0.610, 0.648]** | 0.149 [0.134, 0.164] | retained |
| `own_exposed` down | −0.285 | 0.629 | **0.625 [0.607, 0.642]** | 0.402 [0.383, 0.421] | retained |
| `opp_max_height` down | −0.346 | 0.639 | **0.622 [0.603, 0.640]** | 0.306 [0.287, 0.325] | retained |
| `prisoners` up | +0.365 | 0.615 | **0.617 [0.599, 0.635]** | 0.164 [0.149, 0.180] | retained |
| `hostages` down | −0.168 | 0.623 | **0.617 [0.598, 0.635]** | 0.427 [0.408, 0.445] | retained |
| `opp_singletons` up | +0.325 | 0.604 | **0.601 [0.583, 0.619]** | 0.430 [0.411, 0.449] | retained |
| `own_mobility` up | +0.103 | 0.617 | **0.591 [0.573, 0.609]** | 0.351 [0.332, 0.369] | retained |
| `own_singletons` down | −0.296 | 0.568 | **0.555 [0.537, 0.573]** | 0.467 [0.447, 0.486] | retained |
| `opp_exposed` down | −0.317 | 0.548 | **0.544 [0.524, 0.563]** | 0.465 [0.447, 0.483] | retained |
| `own_tall` up | +0.805 | 0.537 | **0.542 [0.524, 0.560]** | 0.403 [0.384, 0.421] | retained |
| `opp_win_now` down | −7.884 | 0.555 | **0.542 [0.522, 0.561]** | 0.192 [0.176, 0.207] | retained |
| `own_tops` down | −0.591 | 0.527 | 0.522 [0.504, 0.540] | 0.475 [0.456, 0.494] | retained, marginal (fails Bonferroni) |
| `corners` down | −0.248 | 0.545 | 0.550 [0.532, 0.568] | 0.499 [0.480, 0.517] | **rejected**: the mirror does not lose |
| `own_solid` up | +0.584 | 0.535 | 0.508 [0.489, 0.526] | 0.475 [0.455, 0.494] | **rejected**: CI includes 0.5 |

Multiple testing: 15 confirmation tests. With a Bonferroni correction (z = 2.94
instead of 1.96), every retained term but `own_tops` keeps its lower bound above 0.5
(`own_tops`: 0.495).

**Several rows are one idea.** Across candidate moves, `prisoners`, `own_max_height` and
`own_tall` correlate at 0.46–0.65, and `own_tall` with `own_mobility` at 0.60; `hostages`, `opp_max_height` and
`opp_mobility` at 0.26–0.71; `own_exposed` with `own_tops` at 0.77 and with
`own_singletons` at 0.58. Read as plain rules, with the strongest confirmation in each
group:

1. **Pile your pieces on the opponent's: keep a tall stack that holds their pieces.**
   `own_max_height` 0.632, `prisoners` 0.617, `own_mobility` 0.591, `own_tall` 0.542.
   A tall stack you top can move one, two or three pieces, so it also gives you moves.
2. **Keep the opponent's stacks short, and keep your own pieces out from under them.**
   `opp_mobility` 0.629, `opp_max_height` 0.622, `hostages` 0.617.
3. **Do not leave your tops where the opponent can land, and avoid lone pieces of your
   own.** `own_exposed` 0.625, `own_singletons` 0.555.
4. **Prefer positions where the opponent's tops are lone pieces.** `opp_singletons`
   0.601. A lone piece can only step one cell.
5. **Never leave the opponent a move that takes your last top.** `opp_win_now` 0.542;
   its mirror, which invites such a move, scores 0.192: small gain, large cost when
   ignored.

`opp_exposed` down (0.544) passes the rule but has no plain reading I can defend:
fewer opponent tops within your reach is preferred, while the opponent's lone pieces,
which correlate with it at 0.52, are preferred too. I do not know why; it is reported,
not interpreted. `own_tops` down (0.522, at equal top difference, fewer stacks on the
board) is marginal.

The weights are small (below one top per unit, `own_tall` 0.8, except `opp_win_now`),
so these terms mostly decide between moves greedy rates equal or nearly equal: "at
equal top count, prefer…". `own_mobility` and `opp_mobility` trade one top for about
ten moves.

**Combined** (seed 303, 1,000 pairs, all 14 terms that passed the lower-bound rule,
`corners` included): summed 0.653 [0.635, 0.671], summed then divided by 14
0.675 [0.658, 0.692]. Better than any single term, below two-ply greedy (0.740): one
ply of lookahead on the top count is worth more than all the principles together.

**Against two-ply greedy** (descriptive, seed 303): greedy scores 0.259
[0.242, 0.275]; every retained term has a higher point estimate, from 0.278 (`opp_win_now`, whose
interval overlaps greedy's) to 0.399 (`prisoners`).

## Rejected

- `centre` (net prefers not topping it): exploration 0.498 at its best weight, not
  advanced.
- `my_win_now` (set up a winning threat): exploration 0.497, not advanced.
- `repetition` (steer back to positions seen once, the net's clearest preference):
  exploration 0.511, not advanced.
- `own_solid` (keep your second piece under your top): confirmation 0.508
  [0.489, 0.526].
- `corners` (fewer corners): confirmation 0.550, but its mirror scores 0.499
  [0.480, 0.517]; a tie-break of any content helps greedy here, the direction does not.

## What this does not show

- **One net, one training seed, one opponent.** The directions come from
  `az-lc1-s1`; the retention test is against greedy only. Beating greedy means the
  principle fixes something greedy does badly; it does not show the principle helps a
  stronger player. Against two-ply greedy every retained term lifts greedy's score, but
  that is descriptive and was not a retention test.
- **The lenses are correlations.** Lens (a) and lens (c) say what goes with a good
  position, not what to do; lens (b) says what the net picks, not why. A feature can
  be strongly associated with the net's value and useless as a rule (`repetition`,
  `my_win_now`), and the reverse.
- **One-ply players, one weight grid.** A principle that only pays off with lookahead
  (threats, `my_win_now`) cannot show here. The sign of each candidate was fixed by
  lens (b); the opposite direction was tested only as the mirror of an advanced
  candidate.
- **Correlated principles.** The retained rows are not independent findings; groups
  1–3 above are largely one or two ideas measured several ways.
- **Seeds.** The confirmation seed is fresh, but it is one seed; the openings are
  random 4-ply openings, not the start position or human-like openings.
