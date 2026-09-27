# Round 2 training ruleset — decision memo

Date: 2026-09-27 · Plan task 1.3 · **Status: decided 2026-09-27 — option A.**

## The question

Round 1 assumed the base game does not end on its own and added three stopping
rules (LC1 repetition loss, LC2 hard cap, LC3 soft cap). Round 2 must train under
one ruleset. Options: the uncapped game, a repetition rule, or a cap.

## What was measured

`docs/experiments/v2-measure.json`, produced by

```bash
cargo run --release -p pogofish-search --bin measure -- --games 20000 --seed 1 --out docs/experiments/v2-measure.json
```

20,000 uncapped games (base rule only) per pairing, from the initial position, with
a safety limit of 1,000 plies. A game that reaches the limit is "unfinished", not a
draw. Machine: Intel Xeon @ 2.10 GHz, 4 threads, Linux x86_64 (a cloud box, not the
owner's M2); 80,000 games took 1.6 s, peak RSS 12.6 MiB. The harness's
falsification check passed (200/200 games ended in exactly one ply).

`random` plays uniformly; `greedy` wins when it can, otherwise maximises its stacks
on top minus the opponent's, ties at random. Ranges below are 95 % Wilson
intervals.

| White / Red | Decisive | White wins (of decisive) | Median length (plies) | p90 | Longest | Still running at ply 30 / 50 / 100 / 200 |
|---|---|---|---|---|---|---|
| random / random | 19,989 of 20,000 (99.9 %) | 50.1 % [49.4, 50.8] | 93 | 290 | 967 | 84 % / 71 % / 47 % / 21 % |
| greedy / random | 20,000 | 100.0 % [99.9, 100.0] | 7 | 13 | 35 | 0.02 % / 0 / 0 / 0 |
| random / greedy | 20,000 | 0.0 % [0.0, 0.1] | 8 | 14 | 38 | 0.03 % / 0 / 0 / 0 |
| greedy / greedy | 20,000 | 27.6 % [27.0, 28.2] | 12 | 21 | 82 | 0.7 % / 0.01 % / 0 / 0 |

Branching factor (mean legal moves per ply): 15.9 random/random, 12.7
greedy/greedy; 16 at the start.

Repetition (a position — board and player to move — occurring again in the same
game):

| White / Red | Games with a repeat | Median ply of first repeat | Games where a position occurs 3 times | 4 times |
|---|---|---|---|---|
| random / random | 29.0 % | 65 | 0.15 % | 0 |
| greedy / random | 0.06 % | 13 | 0 | 0 |
| random / greedy | 0.05 % | 13 | 0.005 % | 0 |
| greedy / greedy | 0.28 % | 20 | 0.04 % | 0.015 % |

## What the numbers say

1. **The uncapped game ends on its own** with these players: 11 unfinished games in
   80,000, all between two random players. Round 1's premise, that the game needs a
   stopping rule, is not supported by these measurements.
2. **Any cap in round 1's range would decide most random games by the cap, not by
   play.** At cap 30, 84 % of random games are still running; at cap 50, 71 %. If the
   agent plays close to random early in training (an assumption, not measured), most
   of its early outcomes would come from the cap rule.
3. **LC2 is unsuitable as a training rule.** Whoever is to move at the cap loses, so
   the cap's parity, not the position, decides every game that reaches it
   (`docs/rules.md`, section 5).
4. **Repetition is common only in random play** (29 % of games), and almost never
   reaches a third occurrence. A "first repetition loses" rule (LC1 with
   `repetitions: 1`) would end about a third of early-training games on a rule the
   base game does not have.
5. **Myopic play favours the second player**: greedy against greedy, Red wins 72 %.
   Random play is balanced. This is about the players, not yet about the game.

## What the numbers cannot say

Both scripted players attack; neither defends. A trained agent may learn to avoid
losing by shuffling, which could make games long or endless. That is the case the
stopping rules were meant for, and these measurements cannot rule it out. It can
only be seen during training, as the share of self-play games that hit the safety
limit.

## Options

**A. Uncapped, with a safety limit treated as truncation.** Base rule only. Games
that hit the limit keep their policy targets and drop their value targets (plan
task 2.1). Nothing is added to the observation (no move count, no repetition
feature), so the input stays Markov with no change (plan task 2.2 becomes trivial).
Risk: if the trained agent learns to shuffle, truncations grow and value learning
starves.

**B. Uncapped plus a repetition rule** (LC1, for example a position's third
occurrence loses for the player who caused it). Ends shuffling by construction.
Needs a repetition-count feature in the input and the MCTS key (plan task 2.2). Its
effect on play is small by the numbers above (0.15 % of random games, ≤ 0.04 % of
greedy games), but it is an addition to the published rules.

**C. A soft cap (LC3).** Ends every game, with draws. Needs the move count in the
input and key. At any cap in round 1's range it would decide most early-training
games, and its draws are an artefact of the cap.

## Recommendation (mine, for the owner to accept or reject)

**A**, with a switch to **B** decided in advance: a safety limit of 1,000 plies,
the self-play truncation rate logged every iteration, and B adopted only if that rate
exceeds a threshold the owner sets now (5 % would be my suggestion).

Why: A plays the published game; the measurements say it ends; and it keeps the
network input as simple as possible. B stays available without redesign because
the repetition tracker already exists (`crates/search/src/measure.rs`).

Weakest point: the evidence comes from players that never defend, and the risk that
matters (a defensive agent that shuffles) is the one it cannot measure. If A has to
switch to B mid-project, the runs before the switch are not comparable with the runs
after it.

## Decision

**Option A, decided by the owner on 2026-09-27** ("I trust you on the ruleset"),
with the switch rule as recommended, now fixed in advance:

- Training plays the uncapped game: base rule only, no move count or repetition
  in the observation.
- Safety limit: 1,000 plies. A game that reaches it is truncated: its positions
  keep their policy targets and drop their value targets. It is never a draw.
- The self-play truncation rate is logged every iteration. If it exceeds **5 %**
  (of games in an iteration, over three consecutive iterations), training stops
  and switches to option B (third occurrence of a position loses for the player
  who caused it). Runs before and after such a switch are not compared.
