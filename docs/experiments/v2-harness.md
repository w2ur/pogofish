# Evaluation harness — falsification report

Date: 2026-09-27 · Plan task 3.2 · Raw reports: `docs/experiments/v2-harness.json`

The arena (`crates/search/src/arena.rs`, binary `arena`) must be shown to tell a
real gap from noise before it is used to judge any trained agent. Three checks
from the plan, plus one run where a check is made to fail.

## Setup

Uncapped game. 200 openings of 4 uniformly random plies, each played twice with
colours swapped: 400 games per match. Safety limit 1,000 plies; unfinished games
are not scored. Score is player A's mean per opening pair (win 1, loss 0), with a
95 % interval from the spread of pair scores. Seed 1. Cloud machine (Intel Xeon
@ 2.10 GHz, Linux x86_64); the scripted matches take under a second.

```bash
cargo build --release -p pogofish-train --bin arena
./target/release/arena uncapped greedy random first-legal
./target/release/arena uncapped random random        # and greedy, first-legal, mcts-uniform:100
```

## Results

| A vs B | A: W–L (unfinished) | Score [95 % CI] | Distinct games / 400 | Positions after opening |
|---|---|---|---|---|
| greedy vs random | 399–1 | 0.998 [0.993, 1.000] | 400 | 2,754 |
| greedy vs first-legal | 397–3 | 0.993 [0.984, 1.000] | 399 | 3,117 |
| random vs first-legal | 287–113 | 0.718 [0.675, 0.760] | 400 | 52,407 |
| random vs random | 193–207 | 0.482 [0.433, 0.532] | 400 | 48,849 |
| greedy vs greedy | 214–186 | 0.535 [0.493, 0.577] | 385 | 3,751 |
| first-legal vs first-legal | 200–200 | 0.500 [0.500, 0.500] | 200 | 7,657 |
| mcts-uniform:100 vs itself | 183–183 (34) | 0.500 [0.500, 0.500] | 200 | 3,378 |

## The three checks

1. **A real gap is detected.** Greedy against random: 0.998, interval entirely
   above 0.5. **Holds.**
2. **A player against itself lands within its interval of 50 %.** Random 0.482
   [0.433, 0.532] and greedy 0.535 [0.493, 0.577] both contain 0.5. **Holds.**
   For deterministic players (first-legal, uniform MCTS) the check is empty: both
   games of a pair are the same two players from the same position, so each pair
   splits 1–1 and the interval has zero width. The collapse detector shows it
   (200 distinct games out of 400: one per opening). A deterministic agent's self-match
   says nothing; its matches against other players must carry the evidence.
3. **A deliberately broken player loses to random.** First-legal (always the first
   move in engine order) scores 0.282 against random (random's score 0.718, interval
   [0.675, 0.760] above 0.5). **Holds.**

## Made to fail once

The self-match check can fail. With colour swapping switched off (both games of a
pair with A as White; a test-only setting), greedy against itself scored **0.565
[0.511, 0.619]**, 226–174: the interval excludes 0.5, so the check rejects it. What
it measured is a colour bias, not skill. Unit test:
`arena::tests::a_colour_bias_is_caught_when_colours_are_not_swapped` (500 pairs).

The direction of that bias depends on the openings. From the initial position Red
wins 72 % of greedy games (`v2-measure.json`); after 4 random plies White scores
56.5 %. Colour balance claims therefore always need the opening protocol stated.

## Findings along the way

- **Uniform MCTS shuffles.** Against itself, 34 of 400 games (8.5 %) reached the
  1,000-ply limit. A search-based player can avoid losing by repeating moves, which is
  the risk the ruleset memo names. The switch rule in `v2-ruleset.md` (more than 5 %
  truncated self-play games over three iterations) watches exactly this, for the
  trained agent.
- **Stack overflow in MCTS under the uncapped game**, found by the first arena run with
  a net player, fixed before these runs (commit "fix(search): stop MCTS simulations
  from looping on repeated positions").
- No trained checkpoint exists yet, so no net player is in this report. The arena
  loads checkpoints (`net:PATH[:SIMS[:ARCH]]`, strict loading) and was run with a
  randomly initialised net to check that path.
