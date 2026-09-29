# Round 1 verdict — evaluation unreliable

Date: 2026-09-27 · Plan task 0.5 · Code references are to commit `ddf2359` (the
state round 1 left the repository in), before any round-2 change.

Round 1 trained AlphaZero models for four rule variants (`lc1-2`, `lc2-30`,
`lc3-29`, `lc3-40`), a DQN baseline, and published a verdict table and an insights
scene built from them. This page lists the defects found in that code and which
results each one invalidates. Round-1 artifacts under `models/` (gitignored, on the
owner's machine) are kept as they are and should be read as "v1 — evaluation
unreliable". Nothing here was re-derived from them: `models/` is absent from the
machine that wrote this page.

**Bottom line.** No round-1 claim about playing strength, colour balance or the
DQN comparison can be relied on. The engine rules themselves were sound (see
[`docs/rules.md`](../rules.md)); the problems are in training, search and
evaluation.

## Defects

### 1. Temperature is ignored unless it is exactly 0

`crates/train/src/selfplay.rs:218-238`, `select_move`. For `tau == 0` it picks the
most-visited move; for any other `tau` it samples in proportion to raw visit
counts, i.e. always `tau = 1`. The `tau` value is never used in the formula.

Invalidates:
- Gatekeeper games, which ask for `tau = 0.1` (`training.rs:318`) to be "mostly
  greedy" and actually play at `tau = 1`. Every adoption decision was taken on
  much noisier games than intended (compounds defect 6).
- The insights file `app/public/data/lc3-29-insights.json` (Scene XI), produced by
  `analyze.rs:210` with `tau = 0.5` for the first six plies: those plies were
  played at `tau = 1`. Its 65.2 % White win rate measures a different policy
  from the one described.
- Any tournament run with `--tau` other than 0.

### 2. The tournament loads a DQN checkpoint as an AlphaZero net, silently

`crates/train/src/bin/tournament.rs:26-43`, `load_player`. Every checkpoint is
built as an `AzNet` and each saved tensor is copied only if a variable of the same
name exists; unmatched names are skipped without a word. The same silent skip is
in `net.rs:152-161`, `dqn.rs:85-94`, `training.rs:120-128` and `analyze.rs:165-176`.

`DqnNet` names its layers `trunk_0`, `trunk_1`, `head_fc1`, `head_fc2`
(`dqn.rs:29-58`); `AzNet` expects `trunk_*`, `policy_fc*`, `value_fc*`. So the
"DQN" player in every tournament was the DQN trunk under randomly initialised
policy and value heads, searched with AlphaZero's MCTS.

Invalidates: all eight `tournament_az_vs_dqn.json` and
`tournament_dqn_vs_random.json` files under `app/src/data/tournaments/`, and every
statement that AlphaZero beat DQN or that DQN failed. The DQN agent was never
evaluated.

### 3. The network input is not Markov for any variant

`crates/train/src/encoding.rs:13-29`, `state_to_tensor`: 108 stack slots plus
the player to move. It carries neither the move count (which decides LC2 and LC3
at the cap) nor any repetition information (which decides LC1). Two positions
with the same board but different outcomes get the same input and conflicting
value targets.

Invalidates: the value head of every round-1 model, most of all near the cap
(LC2/LC3) and in repeated positions (LC1).

### 4. The MCTS tree merges positions whose outcome differs

`crates/train/src/selfplay.rs:101,139,161,219` key nodes by `GameState::key()`,
which encodes only the board and the player to move
(`crates/engine/src/encoding.rs:10-35`). `is_terminal` depends on the move count
(LC2/LC3) and the history (LC1), so a position reached at two different depths or
histories shares one node and one set of statistics. `crates/search/src/mcts.rs`
has the same key.

Invalidates: search quality in every round-1 run and tournament, for the same
reason as defect 3.

### 5. LC2 was described as a different rule from the one played

`crates/engine/src/rules.rs:11-13,72-89` (before task 0.3). LC2 was documented as "the
player to move at the cap wins iff they control all towers"; that branch could
never run, because the base win is checked first. As played, the player to move at
the cap loses, so the cap's parity picks the loser of any game that reaches it.
Fixed in task 0.3 (behaviour unchanged, description corrected).

Invalidates: descriptions of LC2, not measurements. Two consequences worth knowing:
the CLI (`crates/cli/src/app.rs:86`, `ui.rs:597`) and the WASM default
(`crates/wasm/src/lib.rs:48,57`) play LC2 with cap 50, so White loses any game that
reaches move 50. The article's own summary of LC2-30 ("parity picks the winner")
is consistent with the real rule.

### 6. The gate adopts noise

`crates/train/src/training.rs:53-54`: a challenger replaces the best model when it
scores ≥ 55 % over 80 games. If both nets are equally strong and there are no
draws, the challenger scores ≥ 44/80 with probability **21.7 %** (exact binomial,
p = 0.5). The LC2-30 calibration run used 40 games
(`docs/experiments/lc2-30/summary.md`): ≥ 22/40 happens with probability
**31.8 %**. On top of that, the gate games ran at `tau = 1` (defect 1).

Invalidates: the claim that `model_best.pt` is the best checkpoint of its run, and
any reading of the adoption history in `metrics.jsonl` as progress.

### 7. Evaluation replays the same game

`crates/train/src/bin/tournament.rs:110` defaults to `tau = 0`, and games start
from the fixed initial position with no Dirichlet noise and no randomised opening.
Neural MCTS is then deterministic, so a model against itself plays one game per
colour assignment.

Measured on this machine (Intel Xeon @ 2.10 GHz, 4 cores, Linux x86_64, libtorch
2.4.0 CPU from the PyPI wheel): a randomly initialised `mlp_small` against itself,
`tournament lc3-29 m.pt m.pt 20`, three runs: 20/20 identical outcomes each time.

**Open question for the owner.** `app/src/data/tournaments/README.md` says every
committed tournament used the defaults, including `--tau 0.0`, yet the four
committed `tournament_balance.json` files show mixed results (for example `lc1-2`:
104 White wins, 96 Red). With the code as committed that cannot come from a model
against itself at `tau = 0` on this machine. Either those files came from a
different command or build, or the owner's machine is not deterministic. Re-running
one balance tournament on the M2 would tell.

Invalidates: the "balance" column of the verdict table (colour balance of a
variant), whatever the answer to the open question: at best it measures a handful
of distinct games. Against `random`, only the random side varies, so the "skill"
column says the model beats a random mover and little more.

### 8. Truncated games are scored as draws

`crates/train/src/selfplay.rs:302-316` gives value 0 to every position of a game
that hit `max_moves` (200) without ending; `tournament.rs:206` and the gatekeeper
count such games as draws. A truncation is not a result of the game.

Invalidates: value targets and draw counts under LC1, where games can run past 200
moves. LC2 and LC3 runs with caps below 200 are not affected (they always end at
the cap).

### 9. The minimax transposition table stores bounds as exact values

Found while writing this page; not in the plan's list. Verified by reading the
code, not by a failing test.

`crates/search/src/minimax.rs:118-125,163-172`: `negamax` is alpha-beta with
cutoffs, but the table stores the returned value with no flag saying whether it is
exact, a lower bound (after a beta cutoff) or an upper bound (all moves failed
low), and reuses it as exact. The key also omits the move count and history
(defect 4). The same pattern is in `negamax_with_progress` (from line 177).

Invalidates: the solver outputs (`models/lc*-16-v2/minimax.jsonl.gz`,
owner-measured) and the minimax table the web app uses for LC2-50
(`app/public/models/minimax_table.json.gz`, `app/src/ai/player.ts:173`). Round 2
does not use solving (owner decision 2026-09-25), so this is recorded, not fixed.
Round 2 added `pogofish_engine::search_key` and uses it in both MCTS
implementations; the minimax tables were deliberately left on `GameState::key`,
because switching would change the solver's output format that the web app's table
reads. Anyone reviving the solver must fix both the key and the bound flags first.

## What still stands

- The engine rules: they match the published rules and are now pinned by
  regression positions whose mutations were each seen to fail (`docs/rules.md`).
- Round-1 wall-clock measurements, such as the 22.4-minute LC2-30 run on the M2
  (`docs/experiments/lc2-30/summary.md`) and the 18-minute `lc3-16-v2` run
  (`models/lc3-16-v2/metrics.jsonl`, owner-measured). They describe how long the
  code ran, not what it learned.
