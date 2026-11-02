# Round 3 — the published game, solved

Date: 2026-11-02 · Ruleset `uncapped` (the published rules: you lose when you top no
stack; no repetition rule, no move cap) · Solver: `crates/search/src/retro.rs`, binary
`crates/search/src/bin/retro.rs` · Net analysis: `crates/infer/examples/retro_net.rs` ·
Tests: `crates/search/tests/retro.rs` · Results: `v3-solve/` · Table:
`models/v3-solve/table.bin` (466 MB, not committed)

The question: what is the value of Pogo under its published rules, with perfect play
by both sides? The method is retrograde analysis, as for chess endgame tables: every
position gets a value and a distance, computed backwards from the lost positions.

## Reproduce

```bash
cargo build --release -p pogofish-search --bin retro
R="nice -n 10 ./target/release/retro"; D=models/v3-solve; O=docs/experiments/v3-solve
$R reach $D --out $O/reach.json          # reachable set (writes $D/reachable.bin)
$R pilot $D --out $O/pilot.json          # timed slices, extrapolated
$R solve $D --out $O/solve-uninterrupted.json   # resumable; Ctrl+C saves at the next level;
                                         # per-level times in $D/levels.jsonl (copy: $O/solve-levels.jsonl)
$R check $D --out $O/check.json
$R negamax $D --max-dist 9 --per-bucket 100 --draw-depth 7 --out $O/negamax.json
$R negamax $D --max-dist 7 --per-bucket 20 --draw-depth 5 --shift 2 --out $O/negamax-shifted.json
$R answers $D --out $O/answers.json
$R draws $D --out $O/draws.json
cargo run --release -p pogofish-infer --example retro_net -- $D --games 400 --seed 1 --out $O/net.json
```

Every step is deterministic. The solve was interrupted once with SIGINT and resumed;
the resulting table is byte-identical to an uninterrupted solve (SHA-256
`1690c767…5e3704`). The net analysis was run twice and its JSON reproduced exactly
(timings aside).

## Positions

A position is the board (9 cells, each an ordered stack) and the player to move;
under the uncapped rules nothing else matters. Read the pieces cell by cell, bottom to
top: they form a sequence of 6 White and 6 Red, C(12, 6) = 924 sequences. The stack
heights are a composition of 12 into 9 parts, C(20, 8) = 125,970. The two are
independent and together determine the board, so the count is
924 × 125,970 × 2 = **232,792,560 positions**. The solver indexes them with a perfect
ranking built on exactly this decomposition.

| Check | Result |
|---|---|
| Formula against brute force (positions built by dropping pieces one at a time, deduplicated by engine key) on the 1+1, 2+1, 2+2, 3+2 and 3+3 variants | equal on all five |
| Rank/unrank on the 3+3 variant (120,120 indices), exhaustive | a bijection |
| Rank/unrank on the full game, property tests (400 random boards built without the ranking, 400 random indices) | round trip exact |

**Reachable from the start** (breadth-first search through legal moves, never out of a
finished game): **230,015,628 positions**, of which 227,243,016 are still being
played and 2,772,612 are finished (the mover tops no stack). Every reachable position
is at most 15 plies from the start. The 2,776,932 unreachable positions are
2,774,772 where the mover tops every stack (the opponent has already lost: impossible,
since the side that just moved always tops its landing cell) and 2,160 finished
positions that no move produces (for example, all twelve pieces on one cell).

Memory gate: 2 bytes per position, 466 MB, under the 3 GB cap without symmetry
reduction, so none was used.

## Solver

Positions whose mover tops no stack are lost in 0. Level by level, each position
resolved at distance d is expanded backwards through un-moves: a parent of a lost
position is won in d + 1; a parent of a won position loses one from its count of
unresolved children and is lost in d + 1 when the count reaches 0. Distances are in
plies: a win is reached by the fastest forced line, a loss by the longest defence.
Whatever is never resolved is a draw: neither side can force a win. One `u16` per
position holds the value and distance (or, during the solve, the child count).

The move generator and the un-move generator are separate from the engine (for
speed) and are tested against it:

| Test | Result |
|---|---|
| Children of 400 random full-game positions: same set and same order as the engine's `legal_moves` + `apply_move` | equal |
| Un-moves of 400 random full-game positions against the engine's parents, found without the un-move code (every way of lifting 1–3 pieces from any stack onto any other cell, kept when the engine has a legal move from it back) | equal |
| Un-moves against the inverted forward graph of the whole 3+3 variant | equal for all 120,120 positions |

Mutations that each made at least one of these tests fail: un-moves keeping
already-finished parents (2 tests), a move lifting the bottom pieces instead of the
top ones (6), a loss declared one child early (3), a wrong composition rank (8).

## Measured times and memory

All on the 8 GB M2, shared with three AlphaZero training processes, at `nice -n 10`
with 4 threads.

| Step | Wall time | Peak RSS |
|---|---|---|
| Reachable set | 57 s | 86 MiB |
| Pilot (slices) | 4 s | 451 MiB |
| Solve, uninterrupted (two runs) | 121 s and 162 s | 453 MiB |
| Solve, interrupted at level 6 then resumed | 64 s + 126 s | 453 MiB |
| Controls (`check`, two runs) | 404 s and 441 s | 436 MiB |
| Independent search, deep (`negamax`) | 115 s | 411 MiB |
| Answers | 66 s | 563 MiB |
| Net games and analysis | 44–98 s | 246 MiB (from `/usr/bin/time -l`) |

The pilot extrapolated (from a 1 % slice of the initialisation and 2 million backward
expansions into the full-size table) about 5 s of initialisation and at most 419 s of
expansion, plus 0.05 s per level; the measured solves took 121–162 s, inside that bound
(not every position is expanded: draws never are).

## Controls

| Control | Result |
|---|---|
| Local consistency, all 232,792,560 positions: a win in d has a move to a loss in d − 1 and none faster; a loss in d has only moves to wins, the slowest in d − 1; a draw has no move to a loss and at least one to a draw; finished positions are lost in 0 | **0 violations** |
| Invariance under the 7 non-identity board symmetries and under colour swap, all positions, value and distance | **0 mismatches** |
| Independent search: plain recursive negamax on the engine (no table, no transposition table), 100 reachable positions per bucket, losses in 0–8 and wins in 1–9 checked at their exact distance (forced within d, not within d − 2), draws checked to have no forced result within 7 plies | **1,100 / 1,100 agree** |
| The same search with every claimed distance shortened by 2 plies (it must fail) | 0 / 20 agree in each of the 6 buckets the shift changes; 20 / 20 in the 3 it cannot change |
| One corrupted entry (win set to loss; win distance + 2; loss set to draw; draw set to win in 1; the start position flipped), each followed by the full consistency check | caught every time (3, 3, 1, 1 and 17 violations) |
| A 3+3 table solved under a mutated rule (3 pieces may not move 1 step), checked under the true rule | violations found (the same table is consistent under its own rule) |

Local consistency is not only a sanity check: with correct moves and correct finished
positions, it proves the table. Wins and losses are correct by induction on the
distance. A position labelled a draw is not lost: its mover can always move to a
draw. And it is not won: every move leads to a draw, from which the opponent can again
move to a draw, or to a position the opponent wins. So either side can keep the game
within draws forever, which is exactly "neither can force a win".

## Answers

### (a) The start position

**A draw.** Neither side can force a win from the start.

### (b) White's 16 first moves

Six keep the draw; the other ten lose by force. Moves read cell–pieces–cell; White
starts on row 1.

| Move | White's result | Move | White's result |
|---|---|---|---|
| a1-1-b1 | draw | b1-2-c2 | loss in 12 |
| a1-2-c1 | draw | b1-2-b3 | loss in 14 |
| b1-1-a1 | draw | a1-1-a2 | loss in 22 |
| b1-1-c1 | draw | c1-1-c2 | loss in 22 |
| c1-1-b1 | draw | a1-2-a3 | loss in 16 |
| c1-2-a1 | draw | b1-1-b2 | loss in 16 |
| a1-2-b2 | loss in 12 | c1-2-c3 | loss in 16 |
| c1-2-b2 | loss in 12 | b1-2-a2 | loss in 12 |

Every draw-keeping first move stays on White's back row; every move that leaves it
loses (in plies, counting White's first move). The mirror pairs (a1/c1 moves) have equal
values, as the symmetry control requires.

### (c) Values among reachable positions

For the player to move, out of 230,015,628 reachable positions:

| Value | Positions | Share |
|---|---|---|
| Win | 163,160,554 | 70.9 % |
| Loss (still being played) | 59,258,712 | 25.8 % |
| Loss (finished) | 2,772,612 | 1.2 % |
| Draw | 4,823,750 | 2.1 % |

Every draw in the whole table is reachable. Being to move is worth a lot: seven
positions in ten are won for the side to move.

Distance to the result, in plies:

| Wins in | Positions | Losses in | Positions |
|---|---|---|---|
| 1 | 21,793,224 | 0 (finished) | 2,772,612 |
| 3–9 | 112,529,444 | 2–10 | 41,493,642 |
| 11–19 | 26,052,788 | 12–20 | 15,714,702 |
| 21–29 | 2,387,806 | 22–30 | 1,764,768 |
| 31–39 | 368,472 | 32–40 | 265,344 |
| 41–51 | 28,820 | 42–50 | 20,256 |

The longest forced win takes 51 plies (48 positions); the longest defence 50. The
median win is 5 plies, the median unfinished loss 8. Per-distance counts are in
`answers.json`.

### (d) Structure of the position graph

Backward search from the start through un-moves, restricted to reachable positions:
**every one of the 227,243,016 unfinished reachable positions can return to the
start.** The reachable graph is one strongly connected component plus the 2,772,612
finished positions, which are dead ends. There is no irreversible phase: no
unfinished position, however tall its stacks, is cut off from the opening.

Under perfect play it is different. Following only moves that keep the draw, for both
sides, the start reaches **289,536 drawn positions** (6 % of the draws), up to 49 plies
away, and only **11,736 of them can return to the start** without leaving the draw.
In 130,832 of these positions (45 %) exactly one move keeps the draw (`draws.json`).

### (e) The bundled net against perfect play

400 net-vs-net games under `lc1-2`, the net `az-lc1-s1` with 100 simulations, the
first 10 plies sampled at temperature 1 from the visit counts and the most-visited
move afterwards (the protocol of `v2-principles.md`), game seed 1. 12,694 positions,
no unfinished game. At each position, the net's most-visited move is compared with the
table; greedy is scored as the share of its tied best moves that keep the value (its
expectation over the tie-break), random as the share of all legal moves.

A move **keeps the value** if, from a won position, it leads to a position the
opponent loses, and if, from a drawn position, it does not lead to one the opponent
wins. Lost positions are left out: nothing can be kept there.

**How uncapped values transfer to `lc1-2`.** Under `lc1-2` the third occurrence of a
position loses for the player who produced it; no other rule differs. Follow a win
along strictly decreasing distance (winner: a move to a loss in d − 1; loser: any
move, which leads to a win in at most d − 2). Distances fall at every ply, so no
position repeats on that line. A third occurrence can therefore happen on it only if
one of its positions had already occurred twice before. Call a position **clean** if
no position of the game so far, itself included, has occurred twice. From a clean
position, an uncapped win is an `lc1-2` win, an uncapped loss an `lc1-2` loss, and a
move into a position the opponent wins under uncapped rules is a real `lc1-2` error.
A draw does not transfer: `lc1-2` has no draws, and who wins a drawn position there
depends on repetition (see stage 6). So "keeps the draw" is necessary for good
`lc1-2` play from a clean drawn position, not sufficient.

Positions met in the net's games: 4,135 won, 5,953 drawn, 2,606 lost for the mover;
7,042 clean. The search has no noise, so the same clean position recurs across games
(all 400 games share the start) and the net's choice there depends on the board only
(its repetition input is 0). The table below counts each clean position once: 2,393
distinct clean won or drawn positions.

| Distinct clean positions | Positions | Net | Greedy | Random |
|---|---|---|---|---|
| Won, plies 0–9 | 670 | 0.819 | 0.554 | 0.278 |
| Won, plies 10–19 | 758 | 0.905 | 0.705 | 0.401 |
| Won, plies 20–29 | 189 | 0.937 | 0.791 | 0.444 |
| Won, plies 30+ | 53 | 0.981 | 0.806 | 0.458 |
| **Won, all** | 1,670 | **0.877** | 0.657 | 0.358 |
| Drawn, plies 0–9 | 470 | 0.815 | 0.185 | 0.216 |
| Drawn, plies 10–19 | 216 | 0.806 | 0.099 | 0.206 |
| Drawn, plies 20+ | 37 | 0.757 | 0.145 | 0.182 |
| **Drawn, all** | 723 | **0.809** | 0.158 | 0.211 |
| **Won or drawn, all** | 2,393 | **0.856** | 0.506 | 0.314 |

Counting every position as met (with repeats, `net.json`, filter `all`): net 0.808,
greedy 0.285, random 0.261 over 10,088 won or drawn positions; 0.834 / 0.311 / 0.277
over the 5,438 clean ones. At the start the net plays c1-1-b1, a draw-keeping move.

Read: in a won position the net keeps the win nearly nine times in ten, greedy about
two times in three. In a drawn position greedy is worse than random: its preferred
move, the one that tops the most stacks, usually walks into a forced loss. That is
consistent with the first-move table, where every move off the back row loses (a
reading, not tested). The net keeps the draw about eight times in ten, at every phase.
In won positions the share rises with the ply for all three players; the net's misses
are concentrated in the opening (0.819 before ply 10, 0.905 or more after).

### (f) The principles against perfect play

The rules of thumb of `v2-principles.md`, each in its tested direction, compared
between winning and non-winning moves. Won positions only, win in 3 or more (so no
move wins at once); in each position, the mean of the feature after the move over
winning moves against its mean over the other moves. The share is the fraction of
positions, among those where the two means differ, in which the winning moves follow
the principle more; 95 % normal-approximation intervals over positions.

Round 2 used every principle as a tie-break at equal top count ("at equal top count,
prefer…"), so the faithful comparison is **within greedy's tied best set**: only moves
with the highest top difference, in positions where that set holds both winning and
non-winning moves. Two samples: 20,000 reachable won positions drawn uniformly
(6,805 qualify), and the 1,742 distinct won positions of the net's games (588
qualify).

| Principle (round-2 verdict) | Uniform: share [95 % CI] | Net games: share [95 % CI] |
|---|---|---|
| `prisoners` up (retained) | 0.879 [0.871, 0.888] | 0.719 [0.679, 0.759] |
| `own_exposed` down (retained) | 0.843 [0.832, 0.854] | 0.701 [0.659, 0.744] |
| `own_tall` up (retained) | 0.833 [0.822, 0.845] | 0.672 [0.622, 0.722] |
| `opp_mobility` down (retained) | 0.823 [0.813, 0.832] | 0.684 [0.645, 0.724] |
| `opp_singletons` up (retained) | 0.820 [0.809, 0.831] | 0.684 [0.631, 0.737] |
| `opp_max_height` down (retained) | 0.794 [0.782, 0.805] | 0.662 [0.615, 0.709] |
| `own_mobility` up (retained) | 0.768 [0.757, 0.778] | 0.743 [0.705, 0.781] |
| `opp_exposed` down (retained) | 0.749 [0.729, 0.770] | 0.614 [0.550, 0.678] |
| `own_max_height` up (retained) | 0.733 [0.721, 0.744] | 0.640 [0.598, 0.681] |
| `own_singletons` down (retained) | 0.725 [0.711, 0.739] | 0.708 [0.662, 0.755] |
| `hostages` down (retained) | 0.701 [0.688, 0.714] | 0.520 [0.466, 0.575] |
| `own_tops` down (marginal) | 0.895 [0.878, 0.912] | 0.693 [0.635, 0.751] |
| `own_solid` up (rejected) | 0.660 [0.642, 0.678] | 0.607 [0.549, 0.665] |
| `corners` down (rejected) | 0.554 [0.540, 0.569] | 0.662 [0.619, 0.704] |
| `centre` down (not advanced) | 0.513 [0.496, 0.530] | 0.483 [0.434, 0.533] |
| `my_win_now` up (not advanced) | 0.746 [0.717, 0.775] | 0.515 [0.451, 0.579] |

`opp_win_now` is left out: it is true by construction (a move to a position the
opponent loses never leaves the opponent a winning move).

Read: at equal top count, perfect play follows every retained principle more often
than not, in both samples; `centre`, never advanced in round 2, is at chance in both.
The ranking differs from round 2's arena ranking, and the effects are weaker in the
net's positions, which are more balanced than uniform ones. Two of round 2's verdicts
are not borne out as stated: `own_solid` (rejected, its interval included 0.5) and
`corners` (rejected because its mirror did not lose) both favour winning moves here,
and `hostages` (retained) is at chance in the net's positions.

Without the tie restriction (all moves, `answers.json` and `net.json`, `all_moves`),
the comparison mostly measures that non-winning moves give stacks away: winning moves
have the higher top difference in 98 % of uniform positions, and three directions
reverse (`own_tops` down: 0.112; `opp_singletons` up: 0.309; `corners` down: 0.328 in
the uniform sample), because they correlate with the top count.

### (g) Puzzles

Positions drawn at random among reachable ones, kept when the mover wins in N plies
with exactly one winning first move and greedy would not play it. Cells read bottom to
top (`WRR` is a White piece under two Red ones); `.` is empty; row 1 is at the top.
Nine positions (three per N) are in `answers.json`, with their solution trees: complete
for wins in 3, along the longest defence for longer ones.

**Win in 3, White to move.**

```
1       W      .      .
2  WWRRRR      R     WW
3       .     RW      .
        a      b      c
```

Solution: **a1-1-a2**, covering Red's six-stack. Red is left with the single piece on
b2, which can step to b1, a2, c2 or b3; each square is then covered by two pieces
jumping from c2 or b3 (b1, a2: c2-2 or b3-2; c2: b3-2-c2; b3: c2-2-b3). Greedy prefers
c2-1-b2, which takes the single piece but leaves Red on top of the tall stack.

**Win in 5, White to move.**

```
1   WRRRR      .      R
2       W      R     WW
3       .      .     WW
        a      b      c
```

Solution: **a2-1-a1**, burying four Red pieces under one White. Red keeps two single
pieces (c1, b2) and every defence loses in 4 more plies; for example c1-1-b1, c2-1-b2,
and the last Red piece on b1 is covered wherever it steps (a1: b2-2-a1; c1: b2-2-c1,
c2-1-c1 or c3-2-c1; b2: c2-1-b2 or c3-2-b2). Greedy prefers capturing a single piece
(c2-1-c1 or c2-1-b2), which tops more stacks and leaves the four-stack Red.

**Win in 7, White to move.**

```
1       .   WRRW   WWRR
2     RWR      .      W
3       .      .      .
        a      b      c
```

Solution: **c2-1-c1**, giving up a top to cover c1. Red's only stack is now a2. Most
defences lose at once to a three-piece jump from b1 (b1-3-…); the longest is a2-2-b1:
White answers c1-3-b1, Red's last piece on a2 steps to a1, b2 or a3, and White covers
it (a1, b2: c1-2-…; a3: c1-2-b2, then whichever square Red reaches is covered from
b2). Greedy prefers b1-3-c1, which keeps three tops and lets Red play on.

## Stage 6 — the start is a draw: what it implies for `lc1-2`

Under `lc1-2` every game is finite (a position can occur at most twice without ending
the game, and there are finitely many positions) and has no draw: the base rule or the
repetition rule always names a winner. By Zermelo's theorem, one side has a forced win
from the start under `lc1-2`. Since the uncapped start is a draw, that win rests on the
repetition rule: the winning side forces the other either to produce a third
occurrence or to leave the draw region. Which side that is, the table cannot say; it
needs a solve over histories, not attempted (the brief asked for a report first).

Measured, cheaply: the draws reachable from the start along draw-keeping moves number
289,536, only 11,736 of which can return to the start within the draw region; 45 % of
them leave exactly one draw-keeping move. That is the region in which an `lc1-2` game
between players who never lose an uncapped value is decided, by the repetition rule
alone.

## What this does not show

- **`lc1-2` values of drawn positions.** The table answers the published game. Under
  `lc1-2` it decides won and lost positions only while no position has occurred twice;
  drawn positions are open, the start included.
- **The net's strength under its own rules.** Keeping the uncapped value is necessary
  for perfect `lc1-2` play from a clean position, not sufficient for drawn ones; a
  draw-keeping move may still lose the repetition fight. Positions after a repetition
  are reported (`all`) but the uncapped value is not their `lc1-2` value. The net
  positions come from one seed of one net, sampled by the net itself.
- **The principles as causes.** Section (f) says which features winning moves have,
  not that following a feature makes a move win. The rows share positions and are
  correlated with each other (round 2: several rows are one idea). The uniform sample
  weights all reachable won positions equally, most of which no game would visit.
- **Long distances independently.** The plain search confirms values and distances up
  to 9 plies; beyond that the table rests on the consistency proof above, which itself
  rests on the move generator and finished-position test, both checked against the
  engine (sampled on the full game, exhaustive on the 3+3 variant).
- **Another reading of the rules.** The engine's reading is used throughout
  (`docs/rules.md`): multi-step moves are checked by Manhattan distance only, so a
  3-piece move may double back to an adjacent cell. A different reading is a different
  game.
- **Curated puzzles.** They are random draws under a filter, not chosen for elegance.
