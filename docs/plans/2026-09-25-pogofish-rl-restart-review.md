# Plan Review: 2026-09-25-pogofish-rl-restart

Reviewed: 2026-09-25
Plan: ~/.claude/plans/2026-09-25-pogofish-rl-restart.md
Note: reviewed by the same session that wrote the plan — author bias is possible; a second, independent pass is advised before Phase 4.

## MUST

1. **Docs are deferred to Phase 7** — README and CLAUDE.md currently make claims the plan
   itself disproves: README "500 self-play games" and "an AlphaZero agent that worked";
   CLAUDE.md "State space is ~10M+ positions" (an unmeasured estimate, the exact kind of
   claim rule 1 bans) and "Three rule variants under experiment" (changes at 0.3/1.3).
   Global rule: docs update in the same commit as the change. Action: add a standing rule
   "each task updates README/CLAUDE.md in its own commit", and put the removal of the
   false claims into Phase 0 (new task 0.4), not 7.2.

2. **Bug fixes lack regression tests** — Global rule: a regression test alongside every
   bug fix. 4.2 fixes tau and the plan drops DQN, but neither the tau fix nor the root
   cause of the DQN bug (the loader silently skips unmatched weight names) has a test.
   Action: in 4.2, add "done when a test shows tau=0.5 sharpens the visit distribution vs
   tau=1", and add a task making every checkpoint loader fail on unmatched or missing
   tensor names, with a test that loads a mismatched file and expects an error.

3. **Tasks without a verifiable "done when"** — 4.3 ("decided from the pilot") and 7.1
   have none. Action: 4.3 done when the run length is written into the run config with
   the pilot's measured games/s and peak RSS cited next to it; 7.1 done when the page
   ships, both locales prerender, and 390/1440 px light/dark screenshots were reviewed.

## SHOULD

1. **Scope: split into three releases.** The eight phases are not one pass.
   v0.1 = Phases 0–3: it answers the owner's open question ("was it the bugs?") and
   builds the harness, with zero training. v0.2 = Phases 4–5. v0.3 = Phases 6–7. Each
   ends with /code-review at high effort and an owner checkpoint.

2. **The web app is missing from the plan.** If 2.2 changes the net input (move count,
   history), the ONNX models in `app/public/models/`, the WASM encoding and the TS shim
   all break. Per CLAUDE.md, `wasm-pkg/` and the models are regenerated and committed
   together. Action: add a task in Phase 6 or 7 to re-export, rebuild the WASM and update
   the shim, with a parity test between the Rust net and the ONNX output.

3. **Phase 7 contradicts the visibility strategy.** `strategie-visibilite.md` (the
   trichotomy) makes a hub story (`/stories/<slug>`) the default and names Pogofish as the
   counter-example: a subdomain the hub never mentions. Line 85 also credits "vérification
   minimax" as the project's rigour, which is now stale. Action: 7.1 must choose between a
   hub story plus a 301 retirement of the subdomain, or a subdomain plus a hub tile
   (`editorial.ts`), and flag the strategy doc for the owner to update.

4. **2.1 is ambiguous.** "Dropped or bootstrapped" leaves the decision to the
   implementer. Pick one; the default should be to drop value targets for truncated
   games but keep their policy targets, since that is simpler and cannot inject a biased
   value.

5. **The 1.2 falsification check isn't deterministic.** A random player on a
   near-terminal position may not find the win. Use a position where every legal move
   ends the game, or check that greedy finds a one-move win.

6. **No commit, warning or review workflow.** State: a feature branch, Conventional
   Commits (`feat(train):`, `fix(search):`, …), `cargo clippy -D warnings` plus zero-warning
   builds per task, and /code-review high before each merge.

7. **4.1 does not say how TD play explores.** Pure greedy self-play on a value function
   can lock into one line of play. Specify ε-greedy or a softmax over values with a
   schedule.

8. **Round-1 labelling needs a concrete place.** `models/` is gitignored, so put a
   `models/V1-NOTES.md` or a `docs/experiments/v1-verdict.md` (tracked) listing the
   defects, and say which one.

## CONSIDER

1. **The cost of history in the MCTS key (2.2).** If the ruleset chosen at 1.3 includes
   repetition (LC1), adding history to the key kills transpositions and grows the tree.
   The usual alternative is a compact feature (a repetition count for the current
   position) rather than the full history.

2. **Elo fitting and plots (3.3).** Write a small Rust fit, or use a uv-run Python script
   (PEP 723) with an existing library. The Python route is less code; the Rust route
   means one less toolchain in the loop.

3. **CLI inference (6.1).** A hand-written MLP forward pass (no dependency, the net is
   tiny) vs `tract` (general, adds a dependency). For an MLP, hand-written is enough.

4. **The ≥ 200 distinct games criterion** is almost automatic with k random opening plies.
   Consider reporting distinct *positions after the opening* instead, which also shows
   whether the agent collapses onto one line.

5. **An independent reviewer for Phase 5 results.** Given round 1's history, have a
   fresh-context agent audit the results report against the pre-registered criteria
   before any claim reaches the page.
