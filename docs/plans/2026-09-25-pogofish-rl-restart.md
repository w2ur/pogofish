# Pogofish — RL restart plan ("if I started fresh")

Date: 2026-09-25 · Status: v2, review folded (see `2026-09-25-pogofish-rl-restart-review.md` alongside); approved by the owner 2026-09-27 for cloud execution

## Intent (owner's words, restated)

- Apply **pure RL** to Pogo: the agent learns only from its own play and the game's
  outcomes. No minimax solving, no solved tables in training *or* in grading.
- The result must be **trustworthy**: every claim in the final write-up is backed by
  a measurement whose check was made to fail at least once.
- The CLI game is loved and probably the most valuable output; it should end up
  playable against the trained agent.
- Portfolio entry comes last, and is short and honest.

## Guiding rules (lessons from round 1)

1. **Measure, never estimate.** No state-space counts, no runtime or RAM forecasts
   from reasoning. Before any job > 1 h: a 5-minute pilot that measures throughput
   and peak RSS, then extrapolate from that measurement.
2. **Evaluation before training.** The harness that says "it got better" is built and
   falsified before the thing it measures exists.
3. **Every long job is resumable** (full state: weights, optimizer, replay buffer,
   RNG, counters) and shuts down gracefully on SIGINT.
4. **Pre-registered success criteria.** Written below before any run; not moved after.
5. Round-1 artifacts are kept, labelled "v1 — evaluation unreliable", never deleted.

## Workflow (applies to every task)

- Work on a feature branch per release (`rl-restart-v0.1`, `-v0.2`, `-v0.3`).
- Conventional Commits, one logical change each (`feat(train):`, `fix(search):`,
  `test(engine):`, `docs(readme):` …).
- **Docs in the same commit:** any task that changes behaviour, rules, artifacts or a
  claim updates README (including frontmatter) and CLAUDE.md in that commit.
- Every task's "done when" implicitly includes: `cargo test --workspace` green,
  `cargo clippy --workspace -- -D warnings` clean, zero build warnings (or a documented
  exception in CLAUDE.md), and new logic covered by tests in the same task.
- Every bug fix ships with a regression test.
- End of each release: `/code-review` at high effort, fix findings, owner checkpoint
  before the next release starts.

## Cloud execution notes (read first)

This plan is executed in a cloud session, not on the owner's machine. Consequences:

- **`models/` is gitignored and absent from the clone.** Round-1 artifacts cited below
  (`models/lc3-16-v2/metrics.jsonl`, `minimax.jsonl.gz`) are not available: cite them as
  "owner-measured", never re-derive them, and do not recreate `models/` content to match.
- **The cloud machine is not the 8 GB M2.** Throughput and RSS from pilots (4.2, 4.3)
  describe the cloud box; record the hardware next to every number. The 5 GB RSS ceiling
  in 4.3 still applies, because the final run must also fit the owner's machine.
- **Owner checkpoints are hard stops:** 1.3 (ruleset choice), each release exit, 5.1
  criterion 4 (owner plays), 6.3 (clean-machine install), and all of Phase 7 (needs the
  owner's strategy docs and the `ghost-william` skill, which live only on their machine).
  Stop, push the branch, and report — do not pick a default for the owner.
- Branch `rl-restart-v0.1` already carries this plan; continue on it for v0.1.
- Never push to `main` (it deploys to Netlify).

## Measured facts we start from

- Engine: Rust, tested, proptests on invariants. Win condition matches canonical rules
  (`crates/engine/src/rules.rs:32`: lose when no cell has your colour on top).
- A round-1 AlphaZero run took **18 min** (`models/lc3-16-v2/metrics.jsonl`,
  `total_seconds=1071`, 100 iter × 100 games × 100 sims). Training was tiny; compute
  is not the bottleneck.
- Known defects (verified in code): tau ignored when ≠ 0 (`selfplay.rs:228`);
  tournament loads DQN as AzNet and silently skips unmatched weights
  (`bin/tournament.rs:26-36`); net input omits move count / repetition history; LC2 at
  the cap always makes the mover lose (`rules.rs:69-84`); gate = 80 games at 55%
  (≈1 SE, noise adoptions); eval at tau=0 with no opening randomisation (duplicate games).

---

# Release v0.1 — "Was it the bugs?" (Phases 0–3, no training)

Deliverable: a measured answer to the owner's question, a trustworthy engine and a
falsified evaluation harness. Ends with code review + owner checkpoint.

## Phase 0 — Engine trust and honest docs

- **0.1** Write `docs/rules.md`: canonical rules + source links, one worked example
  per rule. *Done when* each rule points to the engine function and a test.
- **0.2** Hand-built regression positions (one per rule edge: stack of 3 moving 1 vs 3,
  win by squeeze, no-legal-move case). *Done when* tests pass and each one fails if the
  corresponding rule line is mutated (mutate once, watch it fail, revert).
- **0.3** Fix or delete LC2 (dead "controls all towers" branch). *Done when* LC2
  semantics are either corrected with a regression test or LC2 is removed, with
  README/CLAUDE.md updated in the same commit.
- **0.4** Remove false or unmeasured claims: README "500 self-play games" and "an
  AlphaZero agent that worked" (and its frontmatter `facts_*`); CLAUDE.md "State space is
  ~10M+ positions" and the rule-variant line if 0.3 changed it. *Done when* a grep for
  each removed phrase returns nothing and the replacement text states only measured facts.
- **0.5** Round-1 verdict: `docs/experiments/v1-verdict.md` (tracked) listing each
  defect with file:line and which results it invalidates; `models/` stays untouched.
  *Done when* the file exists and README links to it.
- **0.6** Loader hardening: every checkpoint loader errors on missing **or** unexpected
  tensor names. *Done when* a regression test loading a mismatched file expects an
  error, and fails against the old silent-skip behaviour.

## Phase 1 — Measure the game (no learning yet)

- **1.1** Two scripted players: `random`, `greedy` (maximise own tops − opponent tops,
  ties random). *Done when* both are in `crates/search` with unit tests, including
  "greedy takes a one-move win when one exists".
- **1.2** `measure` binary: N uncapped games per pairing (random/random,
  greedy/random, greedy/greedy), hard safety limit 1000 plies (reported as
  "unfinished", never as draw). Record: decisive rate, length distribution,
  branching factor per ply, how often a position repeats within a game.
  *Done when* it writes a JSON report and passes a deterministic falsification check:
  from a hand-built position where every legal move ends the game, every game ends
  decisively in exactly 1 ply.
- **1.3** Decision memo `docs/experiments/v2-ruleset.md`: uncapped vs repetition rule
  vs cap, from 1.2's numbers. *Done when* the owner picks the training ruleset and the
  choice is recorded in the memo and CLAUDE.md.

## Phase 2 — Environment definition done right

- **2.1** Separate **termination** (game over: win/loss, repetition loss if chosen)
  from **truncation** (safety limit). Decision: truncated games keep their **policy**
  targets and **drop their value** targets. *Done when* the self-play record type
  distinguishes the two and tests cover a terminated game and a truncated one.
- **2.2** Observation is Markov for the chosen ruleset. Move count goes into the net
  input and MCTS key if the rule depends on it. If repetition matters, use a compact
  **repetition-count feature** for the current position rather than full history in the
  key (keeps transpositions). *Done when* a test builds two positions with the same
  board but a different move count / repetition count and shows different keys exactly
  when the rule makes them differ.
- **2.3** Symmetry: verify which of the 8 board symmetries preserve the rules
  (property test: legal-move set commutes with the transform). Use only verified ones
  for augmentation. *Done when* the property test passes for exactly the kept set.

## Phase 3 — Evaluation harness (before any training)

- **3.1** `arena` binary: any two players (scripted, checkpoint, MCTS+net at N sims),
  colours swapped, randomised openings (k random plies, same opening played from both
  sides), reports W/D/L, score, 95% CI, **distinct games** and **distinct positions
  after the opening** (a collapse detector). *Done when* output includes all of these.
- **3.2** Falsify the harness: greedy vs random must show a significant gap;
  any player vs itself must land within CI of 50%; a deliberately broken player
  (always first legal move) must lose to random or be flagged.
  *Done when* all three hold and are recorded in the report.
- **3.3** Elo ladder: round-robin of all players, rating fit with CIs. Decision: a
  small Rust fit (one toolchain in the loop); plots via a PEP 723 `uv run --script`
  from the JSON. *Done when* a table + a plot generate from arena results.

**v0.1 exit:** `/code-review` high, owner reads the 1.2 report and v1 verdict.

---

# Release v0.2 — Learn, then prove it (Phases 4–5)

## Phase 4 — Learning ladder, simplest first

Each rung must beat the previous one and every baseline through the harness.

- **4.1 TD-learning value net (TD-Gammon style).** Small MLP value function, self-play,
  TD(λ). Play = softmax over child values with a temperature schedule decaying toward
  greedy (ε-greedy as the fallback if softmax proves unstable). *Done when* it beats
  greedy with CI lower bound > 50%, or the failure is documented with the learning
  curve in `docs/experiments/`.
- **4.2 AlphaZero, corrected.** Reuse MCTS/PUCT; fix tau (`visits^(1/tau)`); Dirichlet
  at root in self-play only; Markov input from 2.2; verified symmetry augmentation;
  replay buffer sized in positions; **no gating**: every checkpoint is kept and rated
  on the ladder instead. Resume restores the buffer and all counters.
  *Done when*: a regression test shows tau=0.5 gives a strictly sharper move
  distribution than tau=1 on a fixed visit vector (and fails on the old code); a
  5-min pilot reports games/s and peak RSS; and a run resumes correctly after a forced
  SIGINT mid-run (same iteration counter, buffer size, loss continuity).
- **4.3 Run budget.** *Done when* the run length is written into the run config with
  the pilot's measured games/s and peak RSS cited next to it, and projected peak RSS
  is below 5 GB (8 GB machine).

## Phase 5 — Is the result real?

Pre-registered success criteria (fixed now):

1. Final AlphaZero beats random, greedy, the TD agent and its own checkpoint at 10%
   of training, each with 95% CI lower bound > 50%, over ≥ 400 games, with the
   distinct-positions-after-opening count reported (no collapse onto one line).
2. The Elo curve over checkpoints rises and plateaus rather than oscillating
   (checked on the ladder, not on loss).
3. **Reproducibility:** 3 seeds; all three satisfy (1). Report the spread.
4. **Human check:** the owner plays ≥ 10 games in the CLI and writes down what the
   agent does that surprised them.

- **5.1** Run the ladder + seeds. *Done when* `docs/experiments/v2-results.md` exists
  covering all four criteria.
- **5.2** One ablation: Markov features on vs off. *Done when* the Elo gap is measured.
- **5.3** Independent audit: a fresh-context agent checks the results report against
  the pre-registered criteria and the raw arena JSON. *Done when* its findings are
  resolved or recorded in the report.

**v0.2 exit:** `/code-review` high, owner checkpoint.

---

# Release v0.3 — Ship it (Phases 6–7)

## Phase 6 — CLI becomes the product

- **6.1** Pure-Rust inference: hand-written MLP forward pass (no dependency; the net is
  tiny), weights exported from training. *Done when* CLI output matches the training
  net's output on 100 positions within 1e-5.
- **6.2** CLI: play vs AI, choose colour, difficulty = MCTS sims, hint key,
  show the AI's value estimate. *Done when* playable and tested headless.
- **6.3** Distribution: `cargo install` + GitHub release binaries (macOS arm64/x86).
  *Done when* a clean machine installs and plays.
- **6.4** Web app parity: re-export ONNX with the new input encoding, update the WASM
  encoding and the TS shim, rebuild `wasm-pkg/`, and commit models + `wasm-pkg/`
  together. *Done when* a parity test shows the ONNX and Rust nets agree on 100
  positions within 1e-5 and `npx vitest run` + `npm run build` pass.

## Phase 7 — Portfolio entry (last)

- **7.1** Visibility decision, owner's call, against `strategie-visibilite.md`'s
  trichotomy: (a) hub story `/stories/pogofish` + 301 retirement of the subdomain, or
  (b) subdomain kept + hub tile in `editorial.ts`. *Done when* the choice is recorded
  and the owner is told that `strategie-visibilite.md` (line 85, "vérification
  minimax") and `inventaire.md` need updating (the owner commits those).
- **7.2** The page: short, honest — question → what was measured → what broke in
  round 1 → results with CIs → play it (web board + CLI download). Written with
  `ghost-william`. *Done when* it ships, both locales prerender, and 390/1440 px
  light/dark screenshots have been reviewed with a clean console.
- **7.3** README frontmatter (`tagline_*`, `facts_*`) rewritten to the measured
  results, in the same commit as 7.2.

**v0.3 exit:** `/code-review` high, owner approves push.

## Out of scope (unless the owner opts in)

- Any solving: minimax, retrograde, grading against the existing capped solves
  (`models/lc*-16-v2/minimax.jsonl.gz`); excluded by owner decision 2026-09-25.
- State-space size claims.
- DQN (poor fit for two-player self-play; the round-1 attempt failed).

## Open decisions for the owner

1. Training ruleset: decided at 1.3 from measurements.
2. Keep tch-rs (works, 18-min runs) vs Rust engine + Python training via PyO3
   (more inspectable for a curious learner). Default: keep tch-rs.
3. Does the TD rung (4.1) stay? It's the most "textbook RL" step and cheap; default yes.
4. Visibility at 7.1: hub story vs subdomain + tile.
