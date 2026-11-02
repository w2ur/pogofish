# Round 3 — principles read from perfect play, and the opening theory of the draw

Date: 2026-11-02 · Table: the uncapped solve of `v3-solve.md` (`models/v3-solve/table.bin`,
466 MB, not committed) · Code: `crates/search/src/perfect.rs` (features, labels, learners,
players, unit tests), binary `crates/search/src/bin/perfect.rs` · Arena ruleset `lc1-2` ·
Results: `v3-principles-perfect/`

The question: which rules of thumb does *perfect* play follow, stated in terms a player can
check on the board, and do they make a scripted player stronger? Round 2
(`v2-principles.md`) read its candidates from a trained net, which plays imperfectly; here
every move is labelled by the solved table instead. And: what does perfect play look like
in the first dozen plies from the start, which is a draw?

## Reproduce

```bash
cargo build --release -p pogofish-search --bin perfect
P="nice -n 10 ./target/release/perfect"; T=models/v3-solve; D=docs/experiments/v3-principles-perfect
$P pilot $T --per-class 200
$P learn $T --train 20000 --test 10000 --games 500 --seed 31 --players $D/players.json --out $D/learn.json
$P arena --players $D/players.json --pairs 1000 --seed 404 --table $T --out $D/arena.json
$P opening $T --plies 12 --guide-depth 4 --players $D/players.json --out $D/opening.json
```

Each step was run twice and reproduced its JSON exactly (timings aside).

## Labels and features

**Value-keeping.** In a won position a move keeps the value if the opponent is lost after
it; in a drawn position, if the opponent is not winning after it. Lost positions are left
out (nothing to keep).

**Positions.** Uniform samples of reachable positions, stratified by value: won in 3 plies
or more (so no move wins at once; every scripted player takes a one-move win anyway) and
drawn. Training: 20,000 of each; held out: 10,000 of each, disjoint from training. The
sampling rate reproduces the class sizes of `v3-solve.md` (estimated 141.5 million won in
3+ against 141.4 million counted; 4.78 million drawn against 4.82 million). Results are
also broken down by the tallest stack on the board (2–3, 4–5, 6+; training sample: 5,117 /
11,390 / 3,493 won, 4,811 / 11,741 / 3,448 drawn), as a proxy for the phase. A position
has 15.3 legal moves on average; 35.7 % of the moves keep the value in won positions,
11.2 % in drawn ones.

**Features of a move.** The 18 position features of `principles.rs` read after the move,
from the mover's side (`repetition` dropped: the table's positions have no history), plus
11 features of the move itself:

| Name | Meaning |
|---|---|
| `pieces_moved`, `distance` | 1–3 pieces; Manhattan distance travelled |
| `lands_on_opp`, `lands_on_own`, `lands_on_empty` | what the destination was topped by |
| `uncovers_opp`, `uncovers_own`, `empties_source` | what is left on top of the source |
| `advance` | rows moved towards the opponent's home row (negative: backwards) |
| `source_height`, `dest_height` | heights of the two stacks before the move |

## (a) Per feature: what the value-keeping moves look like

For each position holding both value-keeping and other moves: is the feature's mean over
the value-keeping moves higher than over the others? The share counts positions where the
means differ. "At equal top count" restricts both sets to greedy's tied best moves (the
highest top difference), as in `v3-solve.md` section (f); "all moves" does not. Training
sample; 95 % half-widths are at most 0.035 for every row comparing more than 500 positions (full table with
counts and intervals in `learn.json`, `a_feature_shares`, including per height bucket).

| Feature | Won, equal top count | Drawn, equal top count | Won, all moves | Drawn, all moves |
|---|---|---|---|---|
| positions used | 6,870 | 10,365 | 19,859 | 19,997 |
| `top_diff` | — | — | 0.982 | 0.928 |
| `prisoners` | **0.884** | **0.743** | 0.991 | 0.941 |
| `lands_on_opp` | 0.882 | 0.786 | 0.941 | 0.878 |
| `empties_source` | 0.890 | 0.885 | 0.650 | 0.583 |
| `own_tall` | 0.842 | 0.751 | 0.936 | 0.900 |
| `dest_height` | 0.839 | 0.677 | 0.765 | 0.792 |
| `opp_singletons` | 0.808 | 0.755 | 0.315 | 0.434 |
| `own_mobility` | 0.776 | 0.654 | 0.969 | 0.890 |
| `my_win_now` | 0.762 | 0.584 | 0.960 | 0.638 |
| `own_max_height` | 0.732 | 0.634 | 0.794 | 0.804 |
| `own_solid` | 0.680 | 0.641 | 0.394 | 0.400 |
| `pieces_moved` | 0.470 | 0.486 | 0.510 | 0.488 |
| `advance` | 0.501 | 0.495 | 0.497 | 0.496 |
| `centre` | 0.485 | 0.429 | 0.530 | 0.307 |
| `corners` | 0.444 | 0.456 | 0.669 | 0.560 |
| `distance` | 0.415 | 0.385 | 0.475 | 0.384 |
| `uncovers_opp` | 0.426 (68 positions) | 0.205 (258) | 0.086 | 0.074 |
| `source_height` | 0.357 | 0.376 | 0.390 | 0.591 |
| `own_singletons` | 0.256 | 0.340 | 0.443 | 0.390 |
| `hostages` | 0.286 | 0.459 | 0.133 | 0.342 |
| `opp_exposed` | 0.240 | 0.433 | 0.028 | 0.115 |
| `opp_max_height` | 0.198 | 0.479 | 0.124 | 0.537 |
| `opp_mobility` | 0.169 | 0.310 | 0.012 | 0.072 |
| `own_exposed` | 0.151 | 0.293 | 0.456 | 0.603 |
| `lands_on_empty` | 0.119 | 0.213 | 0.183 | 0.093 |
| `own_tops` | 0.094 | 0.094 | 0.888 | 0.722 |
| `uncovers_own` | 0.096 | 0.096 | 0.760 | 0.533 |
| `opp_win_now` | 0.000 | 0.000 | 0.000 | 0.000 |

A share above 0.5 means value-keeping moves have more of the feature. `opp_win_now` is 0
by construction (leaving the opponent a one-move win never keeps a value). `lands_on_own`
is left out: at equal top count it differs in 7 positions in all. The won column agrees
with `v3-solve.md` section (f), computed independently on another sample (for example
`prisoners` 0.884 here, 0.879 there; `own_tops` down 0.906 here, 0.895 there).

Read: at equal top count, the value-keeping move **captures** (lands on an opponent top,
`lands_on_opp` 0.88 / 0.79), **with the whole stack** (`empties_source` 0.89 / 0.89,
`uncovers_own` 0.10), **onto a tall stack** (`dest_height` 0.84 / 0.68), so it **buries
opponent pieces** (`prisoners` 0.88 / 0.74) and leaves the mover fewer, taller stacks
(`own_tops` 0.09, `own_tall` 0.84). It also leaves the opponent fewer moves and lone tops
(`opp_mobility` 0.17 / 0.31, `opp_singletons` 0.81 / 0.76) and keeps the mover's own tops
out of reach (`own_exposed` 0.15 / 0.29). Several of these rows are one idea: a capture
with a whole stack keeps the top count and buries pieces. Direction (`advance`), the
number of pieces and the centre are at or near chance on uniform positions. The ten rows
checked by height bucket (`prisoners`, `lands_on_opp`, `dest_height`, `own_tall`,
`opp_singletons`, `own_mobility`, `opp_mobility`, `own_exposed`, `advance`, `centre`) keep
their direction in all three (`advance` stays at chance); most are weaker in drawn positions with stacks of 6 or more
(`prisoners` 0.64 there; `learn.json`).

## (b) Readable rules

**Ranked lists.** A list of at most 3 criteria, each "keep only the moves with the most
(fewest) X", applied in order; a uniform pick among what remains. Forward selection over
all 29 features in both directions, on the training sample, each class weighted half;
a criterion is added only if it raises the training score by 0.001 or more (pre-set).

| Trained on | Uniform pick | Step 1 | Step 2 | Step 3 |
|---|---|---|---|---|
| both classes | 0.234 | most `prisoners` 0.616 | most `own_mobility` 0.640 | most `top_diff` 0.643 |
| won only | 0.357 | most `prisoners` 0.815 | most `own_mobility` 0.845 | most `top_diff` 0.846 |
| drawn only | 0.112 | most `prisoners` 0.416 | most `top_diff` 0.442 | fewest `distance` 0.459 |

The first criterion of every list is not the top count: "bury the most opponent pieces"
alone keeps the value more often (0.616) than greedy (0.532 on the same sample). The won
list equals the pooled one and is played once.

**Tree.** CART (weighted Gini), depth 3, leaves of at least 1 % of the weight, on every
training move; position features enter as the change made by the move. Its first split is
again `prisoners`; leaves (`learn.json`, `b_tree_pooled`):

- the move buries no new opponent piece (Δ`prisoners` ≤ 0): keeps 0.06–0.46 depending on
  mobility gained and the source height (70 % of the weight);
- it buries at least one and reduces the number of the mover's exposed tops: keeps
  0.69–0.91 (5 %);
- it buries at least one without reducing exposure: keeps 0.29 (one piece) or 0.51 (two
  or more) (25 %).

As a player, the tree takes the moves with the highest leaf rate, then the highest top
difference.

**Held-out value-keeping rate** (10,000 won and 10,000 drawn positions not used in
training; the chance that the player's choice, uniform over its tied set, keeps the value;
95 % intervals over positions):

| Player | Won | Drawn |
|---|---|---|
| control: table oracle (must be 1) | 1.000 | 1.000 |
| control: anti-oracle (must equal the share of positions where every move keeps: 0.008 / 0.000) | 0.008 | 0.000 |
| random | 0.360 [0.355, 0.365] | 0.112 [0.111, 0.113] |
| greedy | 0.726 [0.720, 0.733] | 0.340 [0.333, 0.346] |
| two-ply greedy | 0.824 [0.817, 0.830] | 0.448 [0.440, 0.456] |
| greedy, then most `prisoners` | 0.812 [0.805, 0.819] | 0.430 [0.422, 0.439] |
| greedy, then fewest `opp_mobility` | 0.808 [0.801, 0.815] | 0.416 [0.407, 0.425] |
| greedy, then most `dest_height` | 0.808 [0.801, 0.815] | 0.414 [0.405, 0.422] |
| greedy, then most `own_mobility` | 0.794 [0.787, 0.802] | 0.410 [0.401, 0.419] |
| greedy, then most `own_max_height` | 0.789 [0.781, 0.796] | 0.400 [0.391, 0.409] |
| greedy, then most `opp_singletons` | 0.779 [0.772, 0.786] | 0.391 [0.384, 0.399] |
| list (both classes): prisoners, own mobility, top count | **0.849** [0.842, 0.856] | 0.448 [0.439, 0.458] |
| list (drawn): prisoners, top count, shortest distance | 0.846 [0.839, 0.852] | **0.463** [0.454, 0.472] |
| tree | 0.824 [0.817, 0.830] | 0.435 [0.427, 0.444] |
| negated list (both classes) | 0.048 | 0.003 |
| negated tree | 0.229 | 0.021 |

Each tie-break's mirror (the same rule, opposite direction) scores below greedy in both
classes (0.638–0.668 won, 0.265–0.285 drawn; `learn.json`). On uniform positions the
three-criterion list keeps the value slightly more often than two-ply greedy, which looks
one ply ahead. The rates rise with the tallest stack for every player (greedy: 0.707 →
0.770 won, 0.255 → 0.449 drawn from bucket 2–3 to 6+).

**Positions met in play.** The same rates on the 2,829 distinct positions (2,652 won in 3+,
177 drawn) met in 500 greedy-vs-greedy `lc1-2` games from random 4-ply openings, each game
cut at its first repeated position: random 0.278 / 0.149, greedy 0.666 / 0.308, two-ply
0.791 / 0.387, best tie-break (fewest `opp_mobility`) 0.773 / 0.353, list 0.781 / 0.326,
tree 0.778 / 0.325 (won / drawn; `game_positions` in `learn.json`). On these positions the
list no longer leads: it is level with the best tie-break in won positions and below it in
drawn ones (177 positions only), and two-ply greedy is ahead of all.

## Arena

Every player against greedy, `lc1-2`, 1,000 colour-swapped pairs from random 4-ply
openings, seed 404 (not used before), 1,000-ply limit (no game reached it), 993 distinct
openings. Pre-set rule, as round 2: a rule is retained if its lower bound is above 0.5 and
its mirror's upper bound is below 0.5. The six single tie-breaks were chosen before the
arena, by training score after greedy, their direction by (a).

| Control | Score [95 % CI] | Expected |
|---|---|---|
| greedy vs greedy | 0.493 [0.474, 0.512] | ≈ 0.5 |
| list [most top count] vs greedy | 0.493 [0.474, 0.512] | identical to the line above |
| negated greedy | 0.019 [0.013, 0.024] | clearly < 0.5 |
| random | 0.001 [0.000, 0.002] | clearly < 0.5 |
| two-ply greedy (power reference) | 0.756 [0.739, 0.772] | > 0.5 |
| perfect uncapped play from the table (reference) | 0.919 [0.908, 0.930] | > 0.5, below 1 under `lc1-2` |

| Player | Score [95 % CI] | Mirror [95 % CI] | Verdict |
|---|---|---|---|
| greedy, then fewest `opp_mobility` | **0.643** [0.625, 0.661] | 0.367 [0.348, 0.385] | retained |
| greedy, then most `dest_height` | **0.631** [0.612, 0.649] | 0.366 [0.347, 0.384] | retained |
| greedy, then most `own_max_height` | **0.618** [0.600, 0.636] | 0.385 [0.366, 0.403] | retained |
| greedy, then most `prisoners` | **0.611** [0.593, 0.628] | 0.360 [0.342, 0.378] | retained |
| greedy, then most `own_mobility` | **0.608** [0.590, 0.626] | 0.417 [0.397, 0.436] | retained |
| greedy, then most `opp_singletons` | **0.590** [0.571, 0.609] | 0.427 [0.408, 0.445] | retained |
| list (drawn): prisoners, top count, shortest distance | **0.598** [0.579, 0.616] | 0.019 [0.013, 0.024] | retained |
| list (both classes): prisoners, own mobility, top count | **0.586** [0.567, 0.604] | 0.019 [0.013, 0.025] | retained |
| tree | **0.582** [0.563, 0.601] | 0.019 [0.013, 0.025] | retained |

Nine tests; with a Bonferroni correction (z = 2.77) every lower bound stays above 0.5
(smallest: the tree, about 0.555). The mirrors of the lists and of the tree negate every
criterion, the top count included, so they mostly measure a player that gives stacks away.

Read: every table-derived rule beats greedy and every mirror loses to it, but no rule
comes near two-ply greedy (0.756), and the learnt lists and the tree, which keep the value
most often on uniform positions, score *below* the best single tie-break in play. The
positions met in play (above) point the same way: the list's advantage is measured on
positions no game visits. That is a reading, not a tested cause; the repetition rule of
`lc1-2` may also matter, since the table says nothing about it. Perfect uncapped play
scores 0.919, not 1: from a draw it picks a draw-keeping move at random, which under
`lc1-2` can still lose the repetition fight.

## Against the net-derived principles

Round 2 read its directions from the net and kept those that beat greedy. Perfect play
agrees with every retained one in direction, at equal top count, in both classes:
`prisoners` up, `own_max_height` up, `own_tall` up, `own_mobility` up, `opp_mobility` down,
`opp_max_height` down, `opp_singletons` up, `own_exposed` down, `own_singletons` down,
`opp_exposed` down, `hostages` down (weak in drawn positions: 0.541 down). It also favours
`own_tops` down (0.906), marginal in round 2, and `own_solid` up (0.68 / 0.64), which round
2 rejected; `corners` and `centre` are close to chance, as round 2 found. In the arena the
same features score alike under both rounds (round 2, weighted tie-breaks, seed 202 /
round 3, lexicographic tie-breaks, seed 404): `opp_mobility` 0.629 / 0.643,
`own_max_height` 0.632 / 0.618, `prisoners` 0.617 / 0.611, `own_mobility` 0.591 / 0.608,
`opp_singletons` 0.601 / 0.590.

What the table adds: the strongest single predictor is **`prisoners`**, ranked fifth by
the net's arena test; and three features the net lens did not have describe the move
itself — **capture a top** (`lands_on_opp`), **with the whole stack** (`empties_source`),
**onto a tall stack** (`dest_height`, retained in the arena at 0.631). What the opening
adds (below): those same principles fail in the first plies.

## (c) Opening theory of the draw

From the start, every draw-keeping move of either side, for 12 plies (`opening.json`). A
position is counted once however many lines reach it. "Loses in n" counts plies from the
losing move to the end of the game under the longest defence.

| Ply (to move) | Positions | Up to mirror | Lines | Moves | Draw-keeping | Positions with a single draw-keeping move |
|---|---|---|---|---|---|---|
| 1 (White) | 1 | 1 | 1 | 16 | 6 | 0 |
| 2 (Red) | 6 | 3 | 6 | 96 | 24 | 0 |
| 3 (White) | 24 | 12 | 24 | 392 | 88 | 0 |
| 4 (Red) | 66 | 33 | 88 | 1,024 | 234 | 6 |
| 5 | 183 | 93 | 336 | 2,741 | 658 | 32 |
| 6 | 451 | 227 | 1,304 | 6,611 | 1,420 | 110 |
| 7 | 876 | 439 | 4,704 | 12,747 | 2,850 | 192 |
| 8 | 1,623 | 814 | 16,994 | 23,495 | 4,948 | 390 |
| 9 | 2,784 | 1,397 | 65,868 | 40,565 | 8,075 | 763 |
| 10 | 3,910 | 1,960 | 247,122 | 56,636 | 10,676 | 1,222 |
| 11 | 5,343 | 2,676 | 893,748 | 77,269 | 13,959 | 1,807 |
| 12 | 6,958 | 3,485 | 3,263,524 | 100,130 | 17,349 | 2,595 |

About one move in four or five keeps the draw at every ply (38 % at ply 1, 18 % at ply
12), and the share of positions with a single draw-keeping move rises from 9 % at ply 4 to
37 % at ply 12. The 6 first moves match `v3-solve.md` (b).

**"Natural" moves** (all moves of all draw positions at that ply; `categories` in
`opening.json`):

| Move kind | Ply 1 loses | Ply 2 | Plies 3–12 | Median loss, plies 3–12 |
|---|---|---|---|---|
| any move | 63 % | 75 % | 76–83 % | 10–12 |
| greedy's choice (most tops) | 100 % (6/6) | 94 % | 85–91 % | 12–14 |
| captures a top | 100 % (3/3) | 100 % | 86–90 % | 12–14 |
| to the centre | 100 % (3/3) | 100 % | 87–97 % | 12 |
| advances | 100 % (10/10) | 97 % | 88–90 % | 10–12 |
| sideways | 0 % | 39 % | 58–81 % | 10–12 |

The fastest losses: 12 plies from ply 1, 8 from ply 2, 2 from ply 4 on. In the opening the
uniform-position principles are wrong: capturing, going to the centre and maximising tops
all lose more often than a random move. Every table-derived player and greedy pick a
losing first move (draw-keeping rate 0 at ply 1, and 0 or 0.07 at ply 2). From ply 3 to
12 they keep the draw at rates between 0 and 0.25, against 0.18–0.23 for a uniform pick;
greedy (0.11–0.18) stays below the uniform pick at every ply, the learnt players hover
around it (`players_draw_keeping_rate_by_ply`).

**Guide** (the tree to 4 plies, mirror images merged, is `guide` in `opening.json`):

- **Plies 1–2: stay home.** All 6 White draws and 22 of Red's 24 draw-keeping replies move
  one or two pieces along the mover's own back row. Anything forward, any capture and the
  centre lose.
- **1. a1-1-b1 (or c1-1-b1)** — the narrowest first move: Red keeps the draw with only
  **a3-1-b3 or c3-1-b3** (2 of 16; the others lose, fastest in 8). White then has 4 or 5
  draw-keeping moves of 18, all on the back row except c1-1-c2.
- **1. a1-2-c1 (or c1-2-a1)** — Red has 5 of 16: a3-1-a2, a3-1-b3, b3-1-a3, c3-1-b3,
  c3-2-a3. After a3-1-b3 White has only 2 of 15 (c1-2-a1 or c1-3-b3). After a3-1-a2,
  b1-2-c2 leaves Red a single move, **c3-2-a3** (1 of 16; the others lose in 10 to 28).
- **1. b1-1-a1 (or b1-1-c1)** — Red has 5 of 16: a3-2-c3, b3-1-a3, b3-1-c3, c3-1-b3,
  c3-2-a3; White then 2 or 3 of 17. After c3-1-b3, **a1-3-b3** (three pieces onto Red's
  new three-stack) leaves Red a single move, **c3-1-b3** (1 of 7; a3-2-c3 loses in 2).

**Narrowest points.** The first positions with a single draw-keeping move come at ply 4
(Red's second move), 6 of them (3 up to mirror), all after a White capture or a whole-stack
transfer at ply 3: `b1-1-a1 c3-1-b3 a1-3-b3` (only c3-1-b3, 1 of 7),
`c1-2-a1 c3-1-c2 a1-3-b3` (only a3-1-b3, 1 of 10), `a1-2-c1 a3-1-a2 b1-2-c2` (only c3-2-a3,
1 of 16). At ply 5, 32 more; the first 24 distinct ones, with diagrams and the fastest and
slowest losing alternatives, are in `narrowest_points`. In 6 of the first 14 listed, the
only move is not greedy's choice.

## Checks that were made to fail

Unit tests (`perfect.rs`) and the deliberate mutation that each was seen to catch
(mutate, run `cargo test -p pogofish-search --lib perfect`, revert):

| Mutation | Tests that failed |
|---|---|
| `advance` ignores the side (Red's forward counted as White's) | `move_features_read_the_move` |
| `uncovers_own` and `uncovers_opp` swapped | `move_features_read_the_move` |
| a criterion keeps moves within 1.5 of the best instead of the best | `select_applies_criteria_in_order`, `feature_shares_count_positions`, `top_diff_list_reproduces_greedy` |
| the list learner tries only the "most" direction | `rule_list_learner_recovers_a_planted_list` |
| tree threshold not at the midpoint | `tree_recovers_a_threshold` |
| per-feature shares ignore the equal-top-count restriction | `feature_shares_count_positions` |
| a draw is kept only by moving to a draw | `value_keeping_follows_the_table_values` |
| the player mistakes the opponent's winning moves for its own | `players_take_a_win_and_the_tree_breaks_ties_on_top_difference`, `top_diff_list_reproduces_greedy` |

Run-time controls: the table oracle (recomputed from boards, not from the samples' labels)
must keep the value at rate 1, and its complement must equal the share of positions where
every move keeps it. With the label mutated so that a draw counts as keeping a win, the
complement read 0.059 against 0.010 on a 1,000-position run (unmutated: 0.007 and 0.007).
The opening's first-ply count must be the 6 draws of `v3-solve.md` (b); with the
draw-keeping test replaced by the win-keeping one it read 0. In the arena, the list
[most top count] reproduced greedy's result to the game, negated greedy and every mirror
lost, and two-ply greedy won.

## Measured times and memory

On the 8 GB M2, at `nice -n 10`, 4 threads, alongside another job. Pilot first: 200
positions per class took 0.02 s to label and describe (59 µs per position), extrapolated
to about 4 s for the 60,000 positions of `learn` (labelled extrapolation); the measured
sampling took 2.2 s. An arena pilot (50 pairs, 24 matches, 0.6 s) extrapolated to about
13 s for 1,000 pairs; the opening to 6 plies took 1.1 s.

| Step | Wall time | Peak RSS |
|---|---|---|
| `learn` (two runs) | 55 s and 59 s | 490–505 MiB |
| `arena`, 24 matches of 2,000 games, table loaded | 6 s and 11 s | 202–297 MiB |
| `opening`, 12 plies | 21 s and 53 s | 239–346 MiB |

The second run of each was slower because the machine was busier; the figures are as
measured.

## What this does not show

- **Causes.** Section (a) says which features value-keeping moves have, not that playing
  for a feature keeps the value. The rows are correlated; several are one idea.
- **Uniform positions are not game positions.** Every reachable position weighs the same
  in the samples; most are never visited. The list that wins on uniform positions does not
  win in play, and the opening shows the principles reversed. Height buckets are a coarse
  stand-in for the phase; no sample is drawn by distance from the start.
- **`lc1-2` values.** Labels are uncapped values. Under `lc1-2` a draw-keeping move may
  still lose the repetition fight (`v3-solve.md`, stage 6); the arena measures `lc1-2`
  play, the labels do not.
- **One opponent, one seed.** Retention is against greedy only, on one fresh seed, with
  one-ply players and lexicographic tie-breaks (round 2 used small weights). A rule that
  beats greedy may not help a stronger player.
- **Lists and tree.** Depth ≤ 3, one forward-selection path, one tree; a different
  learner or depth could rank the criteria differently.
- **Opening statistics** count distinct positions, not lines or how likely a player is to
  reach them; the guide covers 4 plies, the statistics 12.
