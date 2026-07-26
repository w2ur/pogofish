# Tournament evidence

These sixteen JSON files are the raw output of the round-robin tournaments that
the Scene 8 verdict table is derived from. They are copied **byte-for-byte** out
of the gitignored `models/` tree (which also holds multi-megabyte `.pt` weights,
hence the ignore) so that a reader can recompute every number on the page
without re-running training.

Nothing here is hand-written. Do not edit, reformat or prune these files: if a
tournament is re-run, replace the file wholesale and let the tests tell you what
moved. `app/src/story/verdict.ts` reads them; `app/src/story/verdict.test.ts`
recomputes every rendered figure from them independently.

## What the table uses

| column | source file | field |
|---|---|---|
| balance | `tournament_balance.json` | `white_wins / games` |
| draws | `tournament_balance.json` | `draws / games` |
| skill | `tournament_az_vs_random.json` | `player1_win_rate` |
| header game count | all four files, all tested variants | sum of `games` |

## Variants

Four variants have runs: `lc1-2`, `lc2-30`, `lc3-29`, `lc3-40`. **`lc1-3` was
never trained and has no tournament** — it is rendered in the table as an
explicitly untested row, with no numbers.

The directory names here drop the `-v2` suffix used under `models/`; the `-v2`
directories are the second (and final) training generation, and are the only
ones that were run through the tournament binary.

## Provenance

| file in this tree | source under `models/` |
|---|---|
| `lc1-2/tournament_balance.json` | `models/lc1-2-v2/tournament_balance.json` |
| `lc1-2/tournament_az_vs_random.json` | `models/lc1-2-v2/tournament_az_vs_random.json` |
| `lc1-2/tournament_az_vs_dqn.json` | `models/lc1-2-v2/tournament_az_vs_dqn.json` |
| `lc1-2/tournament_dqn_vs_random.json` | `models/lc1-2-v2/tournament_dqn_vs_random.json` |
| `lc2-30/tournament_balance.json` | `models/lc2-30-v2/tournament_balance.json` |
| `lc2-30/tournament_az_vs_random.json` | `models/lc2-30-v2/tournament_az_vs_random.json` |
| `lc2-30/tournament_az_vs_dqn.json` | `models/lc2-30-v2/tournament_az_vs_dqn.json` |
| `lc2-30/tournament_dqn_vs_random.json` | `models/lc2-30-v2/tournament_dqn_vs_random.json` |
| `lc3-29/tournament_balance.json` | `models/lc3-29-v2/tournament_balance.json` |
| `lc3-29/tournament_az_vs_random.json` | `models/lc3-29-v2/tournament_az_vs_random.json` |
| `lc3-29/tournament_az_vs_dqn.json` | `models/lc3-29-v2/tournament_az_vs_dqn.json` |
| `lc3-29/tournament_dqn_vs_random.json` | `models/lc3-29-v2/tournament_dqn_vs_random.json` |
| `lc3-40/tournament_balance.json` | `models/lc3-40-v2/tournament_balance.json` |
| `lc3-40/tournament_az_vs_random.json` | `models/lc3-40-v2/tournament_az_vs_random.json` |
| `lc3-40/tournament_az_vs_dqn.json` | `models/lc3-40-v2/tournament_az_vs_dqn.json` |
| `lc3-40/tournament_dqn_vs_random.json` | `models/lc3-40-v2/tournament_dqn_vs_random.json` |

## Regenerating

The producer is `crates/train/src/bin/tournament.rs`, which prints its JSON to
stdout:

```
tournament <variant> <player1> <player2> <num_games> [--sims N] [--tau T] [--arch ARCH]
```

Every run below used the defaults: `--sims 100`, `--tau 0.0` (greedy),
`--arch mlp_small`, and `200` games with the colours swapped every game (the
binary alternates sides, so player 1 is White in exactly half of them).

Build once, from the repository root:

```bash
cargo build --release -p pogofish-train --bin tournament
export DYLD_LIBRARY_PATH=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1)
```

Then, per variant — `$V` is `lc1-2`, `lc2-30`, `lc3-29` or `lc3-40`, and `$M` is
`models/$V-v2`:

```bash
# balance: the trained AlphaZero model against itself
./target/release/tournament "$V" "$M/model_best.pt" "$M/model_best.pt" 200 \
  > "$M/tournament_balance.json"

# skill: the same model against a random legal-move player
./target/release/tournament "$V" "$M/model_best.pt" random 200 \
  > "$M/tournament_az_vs_random.json"

# AlphaZero against the DQN baseline
./target/release/tournament "$V" "$M/model_best.pt" "$M/dqn/model_best.pt" 200 \
  > "$M/tournament_az_vs_dqn.json"

# the DQN baseline against a random legal-move player
./target/release/tournament "$V" "$M/dqn/model_best.pt" random 200 \
  > "$M/tournament_dqn_vs_random.json"
```

Copy the results back into this directory unchanged:

```bash
cp models/$V-v2/tournament_*.json app/src/data/tournaments/$V/
```

The tournament is not seeded, so re-running will not reproduce these files
exactly. The committed files are the runs that the article reports.

## The other data file on the page — and why its numbers differ

Scene XI ("what it learned") does **not** read this directory. It fetches
`app/public/data/lc3-29-insights.json`, produced by a different binary
(`crates/train/src/bin/analyze.rs`) from a different checkpoint:

```bash
./target/release/analyze models/lc3-29 app/public/data/lc3-29-insights.json 500
```

Four differences matter, because that file reports White winning **65.2 %** of
games while this directory's `lc3-29/tournament_balance.json` reports **50.0 %**
for the same rule variant:

| | verdict table (this directory) | Scene XI insights |
|---|---|---|
| checkpoint | `models/lc3-29-v2` | `models/lc3-29` |
| simulations per move | 100 | 200 |
| move selection | greedy (`--tau 0.0`) throughout | temperature 0.5 for the first six plies, greedy after |
| colours | the two players alternate sides | pure self-play, one net on both sides |

Both figures are real; they are measurements of different things. The page says
so where the 65 % is rendered — if you change either pipeline, keep that sentence
true.
