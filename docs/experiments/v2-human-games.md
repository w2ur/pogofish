# Criterion 4 — the owner plays the agent

Plan Phase 5, criterion 4 (pre-registered): the owner plays at least 10 games in the
terminal game and writes down what the agent does that surprised them.

**Status: waiting for the owner.** This page is the owner's to fill in; the table and
headings below are only a suggested shape.

## How to play

```bash
cargo run --release -p pogofish-cli -- --colour white --level normal
cargo run --release -p pogofish-cli -- --colour red   --level normal
```

- The opponent is the bundled net (`crates/cli/assets/az-lc1-s1.pfw`, seed 1, final
  checkpoint), under `lc1-2`: no stack on top loses, and a position occurring for the
  third time loses for the player whose move produced it.
- `--level normal` is 100 simulations per move, the strength measured in criterion 1
  (0.855 against greedy). `easy` is 25, `hard` 400. Measured think time on the cloud
  machine: about 2, 6 and 28 ms per move.
- Playing both colours matters: after random openings White scores 0.59–0.66 between
  these agents (`v2-results.md`, colour balance).
- Every finished game is saved as JSON in `~/.pogofish/games/` (moves, colours, level,
  result and the AI's estimate at each of its moves).
- `h` asks the net for a hint; if you use hints in a game, note it below.

## Games

| # | Your colour | Level | Result | Hints used | Game file |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

## What surprised me

(Owner's notes.)
