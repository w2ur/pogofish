# Pogofish round 2: facts sheet

Date: 2026-09-28. This is raw material for Phase 7 (the portfolio article, which the owner writes). It is not the article.

Every figure below is copied from the source named next to it. Figures marked "derived: …" are trivial restatements computed here, and the note says how. "no CI" means the source gives no interval. Paths are relative to `docs/experiments/` unless they start with `docs/`, `crates/` or `app/`. The plan and its review (`docs/plans/…`) are no longer in the tree: plans are kept outside the repository, and both files can be read in its history at commit `771f77c`.

**Common conventions (apply to every arena figure unless noted):**
- Arena score = player A's mean over opening pairs (win 1, loss 0). 95 % CI is computed from the spread of pair scores (`v2-harness.md`, Setup). Colours are swapped within each pair. Unfinished games are not scored.
- Ladder (Bradley–Terry) intervals assume independent games. Arena games come in pairs that share an opening, so these intervals are somewhat too narrow (`v2-ladder.md`, "How to read it"; `v2-results.md`, "What these results do not show").
- Hardware for every round-2 figure: cloud Intel Xeon @ 2.10 GHz, Linux x86_64, not the owner's 8 GB M2 (`v2-results.md`, "What these results do not show"; `v2-measure.json` `machine`). Round-1 timings come from the M2 (section N).

---

## A. Measuring the uncapped game (scripted players)

Source: `v2-measure.json` and `v2-ruleset.md` § "What was measured". Games start from the initial position under the base rule only, with a 1,000-ply safety limit. A game that reaches the limit counts as "unfinished" and is never scored as a draw.

| ID | Figure | Value | 95 % CI | n | Source |
|---|---|---|---|---|---|
| A1 | Games per pairing | 20,000 | — | 4 pairings | `v2-measure.json` `run.games_per_pairing` |
| A2 | Wall time, all 80,000 games | 1.589579826 s (md: "1.6 s") | no CI | 1 run | `run.wall_seconds`; `v2-ruleset.md` § What was measured |
| A3 | Throughput | 50,327.8 games/s | no CI | 1 run | `run.games_per_second` |
| A4 | Peak RSS of `measure` | 12.6171875 MiB | no CI | 1 run | `run.peak_rss_mib` |
| A5 | Falsification check (LC2 cap 10, every legal move wins in 1 ply) | 200 / 200 ended in 1 ply with a White win; passed | — | 200 games | `falsification_check` |
| A6 | Unfinished games (hit 1,000 plies) | 11 of 80,000, all random/random | no CI | 80,000 | `pairings[0].unfinished`; `v2-ruleset.md` § What the numbers say, 1 |
| A7 | random/random decisive | 19,989 of 20,000 (0.99945) | no CI | 20,000 | `pairings[0].decisive`, `.decisive_rate` |
| A8 | random/random White share of decisive games | 50.1 % | [49.4, 50.8] (Wilson, md only) | 19,989 | `v2-ruleset.md` table; `pairings[0].white_wins` = 10,017 |
| A9 | greedy (W) vs random: White wins | 19,993 of 20,000; "100.0 %" | [99.9, 100.0] | 20,000 | `pairings[1].white_wins`; md table |
| A10 | random (W) vs greedy: White wins | 4 of 20,000; "0.0 %" | [0.0, 0.1] | 20,000 | `pairings[2].white_wins`; md table |
| A11 | greedy/greedy: White wins | 5,520 of 20,000; 27.6 % | [27.0, 28.2] | 20,000 | `pairings[3].white_wins`; md table |
| A12 | greedy/greedy: Red wins | 14,480 of 20,000; "Red wins 72 %" | no CI (md gives only White's) | 20,000 | `pairings[3].red_wins`; `v2-ruleset.md` § What the numbers say, 5 |
| A13 | Game length, decisive games: median / p90 / max (plies) | r/r 93 / 290 / 967; g/r 7 / 13 / 35; r/g 8 / 14 / 38; g/g 12 / 21 / 82 | no CI | per pairing | `pairings[i].decisive_length`; md table |
| A14 | Mean length of decisive games, random/random | 131.01 plies | no CI | 19,989 | `pairings[0].decisive_length.mean` (not in md) |
| A15 | random/random games still running at ply 30 / 50 / 100 / 200 | 84 % / 71 % / 47 % / 21 % | no CI | 20,000 | md table; derived in md from `pairings[0].ended_by_ply` |
| A16 | greedy/greedy games still running at ply 30 / 50 | 0.7 % / 0.01 % | no CI | 20,000 | md table |
| A17 | Branching factor (mean legal moves per ply) | 15.9 random/random; 12.7 greedy/greedy; 16 at the start | no CI | per pairing | `pairings[i].mean_branching`; `branching_by_ply[0].mean_legal_moves` = 16.0; `docs/rules.md` §1 |
| A18 | Games with any repeated position | r/r 29.0 %; g/r 0.06 %; r/g 0.05 %; g/g 0.28 % | no CI | 20,000 each | `pairings[i].games_with_a_repeat`; `v2-ruleset.md` repetition table |
| A19 | Median ply of first repeat | r/r 65; g/r 13; r/g 13; g/g 20 | no CI | 5,807 / 11 / 10 / 55 repeating games | `pairings[i].repeats[0].ply` |
| A20 | Games where a position occurs 3 times | r/r 0.15 %; g/r 0; r/g 0.005 %; g/g 0.04 % | no CI | 20,000 each (29 / 0 / 1 / 7 games) | `pairings[i].repeats[1]`; md table |
| A21 | Games where a position occurs 4 times | g/g 0.015 % (3 games); others 0 | no CI | 20,000 each | `pairings[i].repeats[2]` |

## B. Evaluation harness falsification (uncapped)

Source: `v2-harness.json` (list index), `v2-harness.md` § Results. 200 pairs = 400 games, 4-ply random openings, seed 1.

| ID | Match | A: W–L (unfinished) | Score [95 % CI] | Distinct games / 400 | Positions after opening | Source |
|---|---|---|---|---|---|---|
| B1 | greedy vs random | 399–1 | 0.998 [0.993, 1.000] | 400 | 2,754 | `[0]` |
| B2 | greedy vs first-legal | 397–3 | 0.993 [0.984, 1.000] | 399 | 3,117 | `[1]` |
| B3 | random vs first-legal | 287–113 | 0.718 [0.675, 0.760] | 400 | 52,407 | `[2]` |
| B4 | random vs random | 193–207 | 0.482 [0.433, 0.532] | 400 | 48,849 | `[3]` |
| B5 | greedy vs greedy | 214–186 | 0.535 [0.493, 0.577] | 385 | 3,751 | `[4]` |
| B6 | first-legal vs itself | 200–200 | 0.500 [0.500, 0.500] (zero width: deterministic) | 200 | 7,657 | `[5]` |
| B7 | mcts-uniform:100 vs itself | 183–183 (34) | 0.500 [0.500, 0.500] | 200 | 3,378 | `[6]` |
| B8 | Check made to fail: greedy vs itself, colour swap off | 226–174 | 0.565 [0.511, 0.619] | — | — | `v2-harness.md` § Made to fail once (unit test `arena::tests::a_colour_bias_is_caught_when_colours_are_not_swapped`, 500 pairs) |
| B9 | Uniform MCTS self-play truncated at 1,000 plies | 34 of 400 (8.5 %) | no CI | 400 | — | `v2-harness.md` § Findings |

## C. Baseline Elo ladder (uncapped, scripted and search players)

Source: `v2-ladder.json` `ratings[]`, `v2-ladder.md`, `v2-ladder-arena.json`. Round robin with 10 pairings × 400 games, seed 1, random = 0, one virtual draw per pairing. The run took 2 min 30 s on one thread (`v2-ladder.md`).

| ID | Player | Elo | 95 % CI | Games scored |
|---|---|---|---|---|
| C1 | greedy | 975 | [908, 1042] | 1,600 |
| C2 | mcts-uniform:200 | 735 | [674, 796] | 1,513 |
| C3 | mcts-uniform:50 | 428 | [376, 480] | 1,410 |
| C4 | random | 0 | anchor | 1,600 |
| C5 | first-legal | −172 | [−209, −135] | 1,361 |

| ID | Figure | Value | 95 % CI | n | Source |
|---|---|---|---|---|---|
| C6 | greedy vs mcts-uniform:200 ("beats … 81 % of the time") | 0.8125, 325–75 | [0.776, 0.849] | 400 | `v2-ladder-arena.json` `[8]`; `v2-ladder.md` § What it says |
| C7 | first-legal games vs uniform MCTS that hit 1,000 plies | 171 of 400 (vs mcts-uniform:50); 68 of 400 (vs :200) | no CI | 400 each | `v2-ladder-arena.json` `[5]`, `[6]`; `v2-ladder.md` |
| C8 | mcts-uniform:50 vs :200 unfinished | 19 of 400 | no CI | 400 | `v2-ladder-arena.json` `[9]` (not in md) |

## D. TD(λ) value learning

Source: `v2-td.md`, `v2-td.json`. Every run is 50,000 self-play games (1,000 iterations × 50), MLP 128-64, λ 0.7, lr 0.1, batch 64 (`runs[*].config`).

| ID | Figure | Value | 95 % CI | n | Source |
|---|---|---|---|---|---|
| D1 | First attempt (absolute encoding, λ 0.7, lr 0.01) vs greedy | 0.04 throughout (random: 0.94) | no CI in md | 50,000 training games | `v2-td.md` § First attempt (not in JSON) |
| D2 | First-attempt value diagnostic: SD / correlation with material | 0.03 / 0.08 | no CI | 10,702 positions | `v2-td.md` § First attempt |
| D3 | 2×2 sweep, absolute encoding, vs greedy | 0.035–0.07 | no CI | 10,000 games per cell | `v2-td.md` § First attempt (not in JSON) |
| D4 | Sweep, mover-relative, seed 1: λ0.7/lr0.01 | 0.448 | [0.398, 0.497] | 10,000 games; 400 eval games | `v2-td.md` § The fix (not in JSON) |
| D5 | … λ0.7/lr0.1 (chosen) | 0.663 | [0.620, 0.707] | same | same |
| D6 | … λ1.0/lr0.01 | 0.510 | [0.466, 0.554] | same | same |
| D7 | … λ1.0/lr0.1 | 0.580 | [0.535, 0.625] | same | same |
| D8 | Uncapped, mover-relative s1, training eval vs greedy at 50k | 0.777 | [0.740, 0.815] | 400 | `runs["mover-relative s1"].evals[19].vs_greedy` |
| D9 | … s2 | 0.790 | [0.752, 0.828] | 400 | `runs["mover-relative s2"].evals[19]` |
| D10 | … s3 | 0.820 | [0.786, 0.854] | 400 | `runs["mover-relative s3"].evals[19]` |
| D11 | Uncapped s1, fresh openings (arena seed 7) vs greedy | 0.772 (309–91) | [0.735, 0.810] | 400 | `arena_confirmation_seed7[0]` |
| D12 | … s2 vs greedy | 0.757 (303–97) | [0.719, 0.796] | 400 | `arena_confirmation_seed7[2]` |
| D13 | … s3 vs greedy | 0.775 (310–90) | [0.736, 0.814] | 400 | `arena_confirmation_seed7[4]` |
| D14 | Uncapped s1 / s2 / s3, fresh openings vs random | 0.998 / 1.000 / 0.998 | [0.993, 1.000] / [1.000, 1.000] / [0.993, 1.000] | 400 each | `arena_confirmation_seed7[1,3,5]` |
| D15 | Absolute encoding, same settings, vs greedy at 50k | 0.128 | [0.096, 0.159] | 400 | `runs["absolute s1"].evals[19].vs_greedy` |
| D16 | Absolute encoding vs random (training eval) | 0.975 | [0.960, 0.990] | 400 | `runs["absolute s1"].evals[19].vs_random` |
| D17 | Start of curve (2,500 games) vs greedy, mover-relative | "about 0.52" (0.515 / 0.5275 / 0.515) | e.g. s1 [0.478, 0.552] | 400 | `v2-td.md`; `runs[*].evals[0]` |
| D18 | Plateau vs greedy | "near 0.78–0.82 from about 25,000 games" | no CI for the range | — | `v2-td.md` § Results at 50,000 games |
| D19 | Truncated self-play games, uncapped | s1 30, s2 45, s3 60 of 50,000 (max 0.12 %); absolute 1 | no CI | 50,000 each | `runs[*].truncated_games`; md |
| D20 | Collapse check, fresh openings vs greedy | 387–388 distinct games / 400; 3,600–3,760 positions (JSON 3,608–3,756) | — | 400 | `arena_confirmation_seed7[*]`; md |
| D21 | Trained net value diagnostic: correlation with material / SD | 0.57 / 0.57 | no CI | 10,702 positions | `v2-td.md` § Results (not in JSON) |
| D22 | Chosen move = greedy's best material move | 67 % (absolute encoding: 35 %) | no CI | not stated | `v2-td.md` § Results (not in JSON) |
| D23 | Run cost | 50,000 games plus evals in "under 2 minutes per run"; pilot peak RSS 282 MiB | no CI | — | `v2-td.md` § Method |
| D24 | lc1-2 TD s1: training eval / fresh vs greedy | 0.800 [0.763, 0.837] / 0.785 (314–86) [0.748, 0.822] | as shown | 400 each | `lc1_2_runs["lc1-2 s1"].evals[19]`, `.arena_confirmation_seed7[0]` |
| D25 | lc1-2 TD s2 | 0.810 [0.774, 0.846] / 0.740 (296–104) [0.702, 0.778] | as shown | 400 each | `lc1_2_runs["lc1-2 s2"]` |
| D26 | lc1-2 TD s3 | 0.793 [0.754, 0.831] / 0.7775 (311–89) [0.741, 0.814] | as shown | 400 each | `lc1_2_runs["lc1-2 s3"]` |
| D27 | lc1-2 TD vs random, fresh openings | 1.000 [1.000, 1.000], all seeds | as shown | 400 each | `lc1_2_runs[*].arena_confirmation_seed7[1]` |
| D28 | lc1-2 TD truncated self-play games | 0 of 50,000, all seeds | — | 50,000 each | `v2-td.md` § Under lc1-2; `lc1_2_runs[*].truncated_games` |
| D29 | greedy vs random under lc1-2, arena seed 7 | 0.995 (398–2) | [0.988, 1.000] | 400 | `lc1_2_runs[*].arena_confirmation_seed7[2]` (not in md) |

## E. AlphaZero on the uncapped game: the switch rule firing

The switch rule was fixed in advance: if more than 5 % of an iteration's self-play games are truncated at 1,000 plies, three iterations in a row, training switches to the repetition rule (`v2-ruleset.md` § Decision). Source for the figures: `v2-az-uncapped.md`. Its metrics were **not committed**, so these figures cannot be checked from the repository (see Discrepancies, X9).

| ID | Figure | Value | CI | n | Source |
|---|---|---|---|---|---|
| E1 | Pilot, uncapped: self-play speed | 5–8.5 games/s (mean about 6.5), 100 sims | no CI | 27 iterations, 1,350 games, 5 min | `v2-az-run.md` § Pilot |
| E2 | Pilot: mean game length per iteration | 15–37 plies (about 20 typical) | no CI | same | same |
| E3 | Pilot: truncated games | 1 of 1,350 | no CI | 1,350 | same |
| E4 | Pilot: peak RSS | 286 MiB at start, 395 MiB with 28,192 buffered positions | no CI | 1 run | same |
| E5 | Pilot: time per iteration | about 11 s | no CI | — | same |
| E6 | Pilot vs greedy | 0.75 after 1,250 games | no CI | 100-pair check | `v2-az-run.md` § Run length |
| E7 | Budget per run | 200 iterations × 50 games = 10,000 games; projected "about 37 minutes" (projection) | — | — | `v2-az-run.md` § Run length |
| E8 | seed 1 truncated / fired | 177 of 10,000 / never | no CI | 10,000 | `v2-az-uncapped.md` table |
| E9 | seed 2 truncated / fired | 325 / at iteration 130 | no CI | 10,000 | same |
| E10 | seed 3 truncated / fired | 527 / at iteration 70 | no CI | 10,000 | same |
| E11 | absolute s1 (ablation) truncated / fired | 10 / never | no CI | 10,000 | same |
| E12 | Truncated % by iteration block 1–50 / 51–100 / 101–150 / 151–200 | s1 0.3/1.1/2.8/2.9; s2 0.2/1.6/4.4/6.8; s3 1.1/5.0/7.7/7.2; abs 0.0/0.0/0.1/0.3 | no CI | 2,500 games per block | same |
| E13 | Mean plies, last 50 iterations | s1 68; s2 116; s3 113; abs 22 (from "about 20" at the start) | no CI | — | same |
| E14 | In-training vs greedy at iteration 200 (monitoring only, 100 pairs) | 0.85 / 0.875 / 0.78 (s1–s3); absolute 0.77 | no CI given | 200 games each | `v2-az-uncapped.md` § What happened |
| E15 | Iterations trained past the fire point (process failure) | seed 2: 70; seed 3: 130 | — | — | `v2-az-uncapped.md` § A process failure; derived: 200 − fire iteration |

## F. AlphaZero under `lc1-2`: pilot, budget, training

Sources: `v2-az-lc1-run.md`, `v2-results.md` § Training, `v2-az-lc1-runs/<run>/{config.json,metrics.jsonl}`.

| ID | Figure | Value | CI | n | Source |
|---|---|---|---|---|---|
| F1 | Pilot self-play speed | 3.6–6.9 games/s (about 5), 100 sims | no CI | 24 iterations, 1,200 games, 5 min | `v2-az-lc1-run.md` § Pilot |
| F2 | Pilot mean game length | 15.6–24.4 plies per iteration | no CI | same | same |
| F3 | Pilot truncated | 0 of 1,200 | — | 1,200 | same |
| F4 | Pilot peak RSS | 286 MiB start; 376 MiB with 23,534 positions | no CI | 1 run | same |
| F5 | Pilot time per iteration | about 10.5 s | no CI | — | same |
| F6 | Pilot vs greedy | 0.40 → 0.77 over iterations 5–20 | no CI | 100-pair checks | same |
| F7 | RSS slope; projected full-buffer RSS | about 3.9 KiB/position; **about 670 MiB (extrapolated, not measured)** | — | — | `v2-az-lc1-run.md` § Run length |
| F8 | Projected run time | about 35 min (projection; doc warns it could be several times longer) | — | — | same |
| F9 | Budget | 3 seeds + 1 ablation; 200 iterations × 50 games = 10,000 games per run | — | 4 runs | `config.json` `iterations`, `games_per_iteration` |
| F10 | Net and search | `mlp_small` (trunk 256→128, heads 128), 100 sims, c_puct 1.5, Dirichlet α 0.3 / ε 0.25, temperature 1 for the first 10 moves, buffer 100,000 positions, 100 SGD steps × 256, lr 0.02, momentum 0.9, wd 1e-4, 8-way augmentation | — | — | `config.json`; `v2-az-run.md` § Runs |
| F11 | Truncated self-play games | 0 in every run | — | 10,000 × 4 | `v2-results.md` § Training; `metrics.jsonl` `truncated_games` |
| F12 | Mean game length, last iteration | 25–33 plies (s1 33.04, s2 27.42, s3 30.58, norep 25.24) | no CI | 50 games | `v2-results.md`; `metrics.jsonl` last line `mean_plies` |
| F13 | Peak RSS | 719–720 MiB per run | no CI | 4 runs | `v2-results.md`; `metrics.jsonl` `peak_rss_mib` (max 720.06) |
| F14 | Training time (sum of iteration times) | 36–45 min per run; per run: s1 43.0, s2 39.2, s3 45.1, norep 36.3 min | no CI | 4 runs | `v2-results.md` § Training; per-run values derived: sum of `iter_seconds` / 60 |
| F15 | Wall time, all four runs in parallel + arena checks | "about one hour" | no CI | 1 | `v2-results.md` § Training |
| F16 | Policy loss, iteration 1 → 200 | s1 5.228 → 1.752 (others similar: 5.20–5.25 → 1.75–1.77) | no CI | — | `metrics.jsonl` `policy_loss` (not in md) |
| F17 | Value loss, iteration 1 → 200 | s1 0.964 → 0.664 (others 0.95–0.98 → 0.64–0.69) | no CI | — | `metrics.jsonl` `value_loss` (not in md) |
| F18 | In-training vs greedy at iteration 200 (monitoring, 100 pairs, 50 sims) | s1 0.875 [0.832, 0.918]; s2 0.875 [0.832, 0.918]; s3 0.835 [0.789, 0.881]; norep 0.87 [0.827, 0.913] | as shown | 200 games | `metrics.jsonl` last line `vs_greedy` (monitoring only, not evidence) |

## G. Criterion 1: the final net vs four opponents (`lc1-2`)

Source: `v2-results.md` § Criterion 1; raw `v2-phase5/c1-sN-vs-*.json`. Each match has 200 pairs = 400 games at arena seed 7, 100 sims. The 200 openings contain 197 distinct ones (`distinct_openings` = 197). No game was unfinished.

| ID | Seed | vs random | vs greedy | vs TD (same seed) | vs own iteration-20 checkpoint |
|---|---|---|---|---|---|
| G1–G4 | 1 | 1.000 [1.000, 1.000] (400–0) | 0.855 [0.823, 0.887] (342–58) | 0.785 [0.750, 0.820] (314–86) | 0.792 [0.758, 0.827] (317–83) |
| G5–G8 | 2 | 1.000 [1.000, 1.000] (400–0) | 0.887 [0.858, 0.917] (355–45) | 0.738 [0.703, 0.772] (295–105) | 0.790 [0.756, 0.824] (316–84) |
| G9–G12 | 3 | 1.000 [1.000, 1.000] (400–0) | 0.863 [0.831, 0.894] (345–55) | 0.743 [0.708, 0.777] (297–103) | 0.772 [0.737, 0.808] (309–91) |

Collapse check (distinct games / 400; distinct positions after the opening). Source: `v2-results.md` table; `distinct_games`, `distinct_positions_after_opening`.

| ID | Seed | vs random | vs greedy | vs TD | vs iteration 20 |
|---|---|---|---|---|---|
| G13 | 1 | 400 / 3,104 | 389 / 3,758 | 381 / 4,034 | 382 / 4,668 |
| G14 | 2 | 400 / 3,058 | 390 / 3,715 | 379 / 3,674 | 380 / 4,306 |
| G15 | 3 | 400 / 3,190 | 388 / 3,718 | 380 / 3,899 | 383 / 5,234 |

| ID | Figure | Value | Source |
|---|---|---|---|
| G16 | Every criterion-1 lower bound | above 0.70 | `v2-results.md` § Criterion 1 |

## H. Criterion 2: checkpoint ladders (`lc1-2`)

Source: `v2-results.md` § Criterion 2; `v2-phase5/ladder-az-lc1-sN.{json,md}` `ratings[]`; 156 raw reports `v2-phase5/c2-*.json`. Each checkpoint (iterations 20, 40, …, 200) plays random, greedy, `mcts-uniform:200` and the next checkpoint, with 100 pairs at 50 sims and arena seed 11. Random = 0. The ladder intervals are too narrow (see Conventions).

| ID | Seed | Iteration 20 | Iteration 200 | Highest | Last three (160 / 180 / 200) | greedy | mcts-uniform:200 |
|---|---|---|---|---|---|---|---|
| H1 | 1 | 720 [628, 813] | 895 [798, 992] | 904 [810, 998] at 120 | 887 / 872 / 895 | 529 [438, 620] | 462 [370, 554] |
| H2 | 2 | 706 [619, 794] | 859 [767, 951] | 878 [789, 967] at 120 | 865 / 864 / 859 | 511 [425, 596] | 434 [347, 521] |
| H3 | 3 | 719 [629, 809] | 877 [783, 971] | 893 [801, 985] at 180 | 888 / 893 / 877 | 521 [432, 609] | 471 [382, 560] |
| H4 | norep s1 (ablation) | 683 [601, 764] | 844 [758, 930] | 852 [769, 935] at 160 | 852 / 823 / 844 | 485 [406, 565] | 411 [331, 492] |

| ID | Figure | Value | CI | Source |
|---|---|---|---|---|
| H5 | "Plateaus" test | passed, all seeds; first checkpoint to reach the final's lower bound at iteration 40 / 40 / 60 | — | `v2-results.md` § Criterion 2 |
| H6 | "Rises" test | **failed, all seeds**: final rates 153–175 Elo above iteration 20, but the intervals overlap by 15–27 Elo (seed 1: 798 vs 813) | — | same |
| H7 | Ablation ladder "rises" | failed, overlap of 6 Elo | — | `v2-results.md` § Ablation |
| H8 | Curve shape | steep rise to about iteration 80 (4,000 games) for seeds 1 and 3, to iteration 120 for seed 2, then flat | — | `v2-results.md` § Criterion 2 |
| H9 | Every checkpoint from iteration 20 is above greedy | greedy 511–529 on the three seed ladders | per-ladder CIs above | same |
| H10 | Unfinished games in the 156 ladder reports | 0 | — | derived: sum of `a.unfinished` over `v2-phase5/c2-*.json` |
| H11 | Audit refit of the four ladders | max difference 0.00 Elo from 156 raw reports | — | `v2-results.md` § Independent audit |

## I. Criterion 3: seed spread

Source: `v2-results.md` § Criterion 3.

| ID | Figure | Value | Source |
|---|---|---|---|
| I1 | Spread vs greedy across seeds | 0.855–0.887 (0.032) | `v2-results.md` § Criterion 3 |
| I2 | Spread vs TD | 0.738–0.785 (0.047) | same |
| I3 | Spread vs 10 % checkpoint | 0.772–0.792 (0.020) | same |
| I4 | Ladders of the three seeds, from iteration 40 on | within 40 Elo of each other at every checkpoint | same |
| I5 | TD seed spread vs greedy (fresh openings, uncapped) | 0.757–0.775 | `v2-td.md` § Results |

No CI is given for any spread.

## J. Ablation: repetition feature on vs off (seed 1, `lc1-2`)

Source: `v2-results.md` § Ablation; raw `v2-phase5/abl-vs-*.json`. 400 games per match, arena seed 7, 100 sims.

| ID | Final net without the feature vs | Score [95 % CI] | W–L | Source |
|---|---|---|---|---|
| J1 | random | 1.000 [1.000, 1.000] | 400–0 | `abl-vs-random_.json` |
| J2 | greedy | 0.873 [0.842, 0.903] | 349–51 | `abl-vs-greedy_.json` |
| J3 | TD seed 1 | 0.748 [0.712, 0.783] | 299–101 | `abl-vs-td_…json` |
| J4 | seed-1 net with the feature | 0.500 [0.477, 0.523]; Elo gap 0 ± 16 | 200–200 | `abl-vs-net_…iter_00200…json` |
| J5 | Colour split in J4 (the no-feature net) | 151 of 200 won as White, 49 of 200 as Red (`white_score` 0.755) | — | same, `a_as_white`, `a_as_red` |
| J6 | Ladder gap vs same-seed net (separate ladders) | 31–76 Elo below at every checkpoint, **not a measured difference** (inside intervals) | no CI | `v2-results.md` § Ablation |
| J7 | Ladder gap vs the three seeds' mean | 18–56 Elo below | no CI | same |
| J8 | Summary as the report phrases it | head to head 0 ± 16 Elo; indirectly 30–75 Elo in the feature's favour that the ladders cannot resolve | — | same |

## K. Colour balance

| ID | Figure | Value | CI | n | Source |
|---|---|---|---|---|---|
| K1 | From the initial position, greedy vs greedy (uncapped) | Red wins 72 % | no CI | 20,000 | `v2-ruleset.md` § What the numbers say, 5 |
| K2 | After 4 random plies, greedy vs itself, no colour swap (uncapped) | White 0.565 | [0.511, 0.619] | 400 | `v2-harness.md` § Made to fail once |
| K3 | Criterion-1 matches between nets and greedy or TD (`lc1-2`) | White scores 0.59–0.66 | no CI | 400 per match | `v2-results.md` § Colour balance |
| K4 | Ablation head-to-head | White 0.755 | no CI | 400 | same; `abl-vs-net…json` `white_score` |
| K5 | Checkpoint ladders | White 0.50–0.79 (mean 0.58) | no CI | 156 reports | same |
| K6 | Depth matches (net vs itself) | White 0.74 (400 vs 100 sims), 0.72 (1600 vs 100) | no CI | 200 each | `v2-phase5/depth-*.json` `white_score` (not in md) |

## L. Search depth and the terminal game

Sources: `v2-results.md` § Search depth (not pre-registered; added after the owner lost every game at "normal"), `v2-phase5/depth-*.json`, `v2-human-games.md`, `crates/cli/src/main.rs:15,65-67`.

| ID | Figure | Value | CI | n | Source |
|---|---|---|---|---|---|
| L1 | Same net, 400 vs 100 sims | 0.640, 128–72, 171 distinct games / 200 | [0.596, 0.684] | 100 pairs, arena seed 13 | `depth-400-vs-100.json` |
| L2 | Same net, 1600 vs 100 sims | 0.690, 138–62, 178 / 200 | [0.642, 0.738] | 100 pairs, seed 13 | `depth-1600-vs-100.json` |
| L3 | Difference between L1 and L2 | not resolved (the intervals overlap) | — | — | `v2-results.md` |
| L4 | From the start position: net at 400 / 1600 / 6400 sims vs net at 100 | won all 6 pairings (as White and as Red); lengths 45, 52, 37, 28, 35, 68 plies | none: 6 fixed games, "not a strength estimate" | 6 games | `v2-results.md`; `crates/infer/examples/depth_probe.rs` |
| L5 | Known winning lines vs "normal" | White line 19 moves, Red line 14 moves; each replayed 3 times and won each time | — | 2 lines × 3 | `v2-results.md` § Search depth |
| L6 | CLI levels | easy 25, normal 100, hard 400 sims per move | — | — | `crates/cli/src/main.rs:65-67`; `v2-human-games.md` |
| L7 | CLI think time per move (cloud machine) | about 2 / 6 / 28 ms (easy / normal / hard) | no CI | not stated | `v2-human-games.md` § How to play |
| L8 | Bundled net | `az-lc1-s1`, iteration 200 (seed 1 final); criterion-1 strength at "normal": 0.855 vs greedy | see G2 | — | `v2-human-games.md`; `CLAUDE.md` |
| L9 | Export check (pure-Rust vs checkpoint) | the tolerance is 1e-5 on 100 positions; **no measured max difference is recorded in the docs** | — | 100 positions | `CLAUDE.md` § Exporting; `crates/train/src/bin/export_weights.rs:3` |

## M. Human games (criterion 4)

| ID | Figure | Value | Source |
|---|---|---|---|
| M1 | Owner games played | **pending**: none recorded, and the table is empty | `v2-human-games.md` (Status: waiting for the owner) |
| M2 | Owner's report before criterion 4 | lost every game at "normal" (no count given) | `v2-results.md` § Search depth, heading |

## N. Round-1 figures (v1: evaluation unreliable; wall-clock figures only)

| ID | Figure | Value | CI | Source |
|---|---|---|---|---|
| N1 | Round-1 AZ run `lc3-16-v2` | 18 min (`total_seconds=1071`), 100 iterations × 100 games × 100 sims, M2, owner-measured | no CI | plan § Measured facts; `v1-verdict.md` § What still stands |
| N2 | LC2-30 calibration run | 22.4 min (1346 s), average 13.5 s per iteration, Apple M2 8 GB | no CI | `lc2-30/summary.md` § Results; `metrics.jsonl` last `total_seconds` = 1345.7 |
| N3 | LC2-30 loss | 4.007 → 3.176 | no CI | `lc2-30/summary.md` |
| N4 | LC2-30 adoptions | 21 / 100 (these adoptions are noise, see defect 6) | — | same; `metrics.jsonl` `adopted` |
| N5 | LC2-30 model size | 507 KB (.pt) | — | same |
| N6 | Gate false-adoption probability (equal nets, no draws) | 21.7 % at ≥ 44/80; 31.8 % at ≥ 22/40 (exact binomial, p = 0.5) | — | `v1-verdict.md` defect 6 |
| N7 | Round-1 tournament determinism | random-init `mlp_small` vs itself, `tournament lc3-29 m.pt m.pt 20`: 20/20 identical outcomes, 3 runs | — | `v1-verdict.md` defect 7 |
| N8 | Round-1 insights White win rate (invalid) | 65.2 % | — | `v1-verdict.md` defect 1 |
| N9 | Round-1 `lc1-2` balance file | 104 White wins, 96 Red (unexplained; open question) | — | `v1-verdict.md` defect 7 |
| N10 | LC2-30 extrapolated run times for other variants | ~22–35 min each, "~2.5 hours" total: **estimates, never measured** | — | `lc2-30/summary.md` § Baseline extrapolation |

---

## What broke in round 1

Primary source: `v1-verdict.md`, with code references at commit `ddf2359`. The plan's list in § "Measured facts we start from" (`docs/plans/2026-09-25-pogofish-rl-restart.md`) covers defects 1, 2, 3, 5, 6 and 7. Defects 4 and 8 are in the verdict, and defect 9 was found while writing it.

| # | Defect | Where | Invalidates | Source |
|---|---|---|---|---|
| 1 | Temperature ignored unless exactly 0: any τ ≠ 0 sampled at τ = 1 | `selfplay.rs:218-238` (plan: `:228`) | gate games (asked τ 0.1), the `lc3-29` insights file (65.2 % White), any tournament with `--tau` ≠ 0 | `v1-verdict.md` §1; plan § Measured facts |
| 2 | The tournament loaded a DQN checkpoint as an AlphaZero net and silently skipped unmatched tensors, so the "DQN" was its trunk with random policy/value heads under AZ's MCTS | `bin/tournament.rs:26-43` (plan: `:26-36`), and the same skip in `net.rs`, `dqn.rs`, `training.rs`, `analyze.rs` | every AZ-vs-DQN statement; "the DQN agent was never evaluated" | `v1-verdict.md` §2; plan |
| 3 | Net input not Markov: 108 stack slots + mover, with no move count and no repetition info | `encoding.rs:13-29` | the value head of every round-1 model | `v1-verdict.md` §3; plan |
| 4 | The MCTS tree merged positions whose outcome differs (key = board + mover only) | `selfplay.rs:101,139,161,219`; `engine/src/encoding.rs:10-35`; `search/src/mcts.rs` | search quality in every round-1 run and tournament | `v1-verdict.md` §4 |
| 5 | LC2 was described as a different rule from the one played: the "controls all towers" branch was dead, so as played the player to move at the cap loses | `rules.rs:11-13,72-89` (plan: `:69-84`) | descriptions only; round-1 CLI and WASM played LC2 cap 50, where White loses any game that reaches move 50 | `v1-verdict.md` §5; plan |
| 6 | The gate adopted noise: ≥ 55 % over 80 games (LC2-30: 40), false adoption 21.7 % / 31.8 %, played at τ = 1 | `training.rs:53-54` | "`model_best.pt` is the best checkpoint"; reading the adoption history as progress | `v1-verdict.md` §6; plan |
| 7 | Evaluation replayed the same game: τ = 0, fixed start, no noise, no randomised opening | `bin/tournament.rs:110` | the verdict table's "balance" column; its "skill" column shows only "beats a random mover" | `v1-verdict.md` §7; plan |
| 8 | Truncated games (200 moves) scored as draws, with value 0 | `selfplay.rs:302-316`; `tournament.rs:206` | value targets and draw counts under LC1 | `v1-verdict.md` §8 |
| 9 | The minimax TT stored alpha-beta bounds as exact values, and its key omitted move count and history | `search/src/minimax.rs:118-125,163-172` | solver outputs (`models/lc*-16-v2/minimax.jsonl.gz`) and the web app's LC2-50 table `app/public/models/minimax_table.json.gz`; not fixed (round 2 does not solve) | `v1-verdict.md` §9 (verified by reading the code, not by a failing test) |

What still stands (`v1-verdict.md` § What still stands): the engine rules (pinned by regression positions whose mutations were each seen to fail) and the round-1 wall-clock figures (N1, N2).

Unmeasured claims removed from round 1 (plan task 0.4): README "500 self-play games" and "an AlphaZero agent that worked"; CLAUDE.md "State space is ~10M+ positions" (`docs/plans/2026-09-25-pogofish-rl-restart.md` task 0.4; `…-review.md` line 10-11).

Round-2 failures, for honesty:
- The switch rule was only logged, not enforced, so seeds 2 and 3 ran past their stop point (`v2-az-uncapped.md` § A process failure). `train` now stops itself (exit code 3).
- MCTS overflowed its stack on repeated positions under the uncapped game. The fix came before the harness runs (`v2-harness.md` § Findings).
- The first TD attempt learned nothing useful (D1–D3). The encoding was the cause (`v2-td.md`).

---

## Claims NOT to make

- **State-space size.** It has never been measured (`CLAUDE.md` project rules; plan § Out of scope).
- **Any round-1 claim** about playing strength, colour balance or DQN (`v1-verdict.md` bottom line). Round-1 artifacts are "v1: evaluation unreliable" (plan rule 5).
- **"Play it on the web" as if it were the round-2 net.** The web app still ships round-1 models: `app/public/models/` was last changed 2026-05-03 (`git log`), and it holds `lc1-2`/`lc3-29` ONNX, `alphazero_cnn.onnx`, `dqn_tiny.onnx` and the LC2-50 minimax table invalidated by defect 9. Plan task 6.4 (web parity) has no record of completion in the docs.
- **Solver results** (minimax tables): invalidated by defect 9. Round 2 also excludes solving by owner decision (plan § Out of scope).
- **Criterion 2 as "met".** The "rises" test failed on all seeds and stays failed. The explanation for it (anchor distance; a difference needs its own interval) was written after the result was seen (`v2-results.md` § Criterion 2).
- **"The repetition feature has no effect."** The audit flagged this as an overstatement. Say instead: no difference detected head to head (0 ± 16 Elo), and an unresolved 30–75 Elo ladder gap in the feature's favour (`v2-results.md` § Ablation). "Third occurrences are rare, so the feature is almost always zero" is untested.
- **"The absolute-encoding AZ run stayed short because it is weaker"**: labelled "a likely reason, not tested" (`v2-az-uncapped.md`).
- **Strength against people.** Criterion 4 is pending (M1). Games won with hints or by replaying a known line say nothing about unaided play (`v2-results.md` § Search depth).
- **The six start-position depth games (L4) as a strength estimate.** They are fixed deterministic games (`v2-results.md`).
- **Anything about the owner's M2 for round 2.** Every round-2 number comes from the cloud Xeon (`v2-results.md`). The 670 MiB full-buffer RSS (F7) and the 2.7 GB four-run total (`v2-az-run.md`) are **extrapolations**. The run-time budgets (E7, F8) and the LC2-30 variant times (N10) are projections or estimates.
- **Comparisons between uncapped runs and `lc1-2` runs** (`v2-ruleset.md` § Decision; `v2-results.md`).
- **Elo compared across ladders.** Greedy is 975 on the uncapped baseline ladder (C1) and 511–529 on the `lc1-2` checkpoint ladders (H1–H3). The rules, pools, sims and anchoring context all differ. The ablation's ladder gaps are "not a measured difference" for the same reason.
- **Ladder CIs as exact.** They assume independent games, but games are paired, so the intervals are somewhat too narrow. Uniform-MCTS ratings on the baseline ladder cover only games that ended (C7).
- **The `lc1-2` net's input as a complete Markov state.** It carries the current position's repetition count but omits which other positions were seen. The search key reads the whole history, so the search is exact (`v2-ruleset.md` § Switch to option B; `CLAUDE.md` Training).
- **"The game always ends on its own" in general.** 11 unfinished games in 80,000 holds only for random/greedy players, which never defend. The trained AZ agents learned to hold and shuffle, which is why the switch rule fired (`v2-ruleset.md` § What the numbers cannot say; `v2-az-uncapped.md`).
- **"The second player has the advantage" (Red 72 %)** as a fact about the game. It describes myopic greedy play from the initial position. After random 4-ply openings, White is favoured (K2–K5). Always state the opening protocol (`v2-harness.md`; `v2-ruleset.md` point 5).
- **In-training arena checks as evidence** (E14, F18): they were monitoring only (`v2-az-run.md`; `v2-az-uncapped.md`).
- **TD seed 1 as an unbiased result.** λ and lr were chosen on seed 1, and seeds 2 and 3 played no part in the choice (`v2-td.md`).
- **Uncapped AZ figures (E8–E15) as checkable.** Their metrics were not committed (`v2-az-uncapped.md` header).
- **Round-1 wall-clock figures as learning results.** They show how long the code ran, not what it learned (`v1-verdict.md`).
- **The round-1 `lc1-2` balance (104/96).** It cannot come from the committed code at τ = 0. This is an open question for the owner (`v1-verdict.md` defect 7).
- **The pure-Rust export as "matching within 1e-5".** No measured figure is recorded, only the check's tolerance (L9).

---

## Discrepancies

| # | Topic | Doc 1 | Doc 2 |
|---|---|---|---|
| X1 | LC2-30 gate win rates | "either 0.5 (rejected) or 1.0 (adopted), never intermediate" (`lc2-30/summary.md` § Observations 3) | `lc2-30/metrics.jsonl` `gatekeeper_win_rate`: 61 × 0.5, 21 × 1.0, **18 × 0.0** (derived: count of values) |
| X2 | Temperature of round-1 gate games | "tau=0 (greedy) MCTS with no noise produces deterministic play" (`lc2-30/summary.md` § Observations 3) | gate games ask τ = 0.1 and are played at τ = 1 (`v1-verdict.md` defects 1 and 6). With τ = 1 sampling, 20/20 identical splits would not be expected, so one of the two descriptions is wrong for that run |
| X3 | LC2-30 replay window at saturation | "~9700 examples" (`lc2-30/summary.md` § Results) | `metrics.jsonl` `window_examples`: final 9,724, max 13,075 |
| X4 | Round-1 gate size | "gate = 80 games at 55%" (plan § Measured facts; `v1-verdict.md` §6 citing `training.rs:53-54`) | 40 gatekeeper games for LC2-30 (`lc2-30/summary.md` config). Reconciled in `v1-verdict.md` §6: 80 is the code default, 40 was the calibration run |
| X5 | Round-2 training ruleset | README: "`RuleSet::Uncapped` … round 2 trains on it"; LC1 described as "repeating a board position loses" | `CLAUDE.md` project rules and `v2-ruleset.md` § Switch: round 2 trains on `lc1-2` (the **third** occurrence loses). README is stale |
| X6 | greedy vs first-legal, uncapped, seed 1, 200 pairs | 397–3, 0.993 [0.984, 1.000] (`v2-harness.json` `[1]`) | 399–1 (first-legal vs greedy 1–399, 0.0025 [0.0, 0.007]) (`v2-ladder-arena.json` `[4]`; `v2-ladder.md` "399–1"). Two separate runs of the same pairing |
| X7 | Seed-1 final net vs greedy | 0.855 [0.823, 0.887] (criterion 1: arena seed 7, 100 sims, 400 games; cited by `v2-human-games.md`) | 0.875 [0.832, 0.918] (`az-lc1-s1/metrics.jsonl` iteration 200: 100 pairs, 50 sims, monitoring). Different protocols. Only 0.855 counts |
| X8 | Full-buffer RSS | projected about 670 MiB (`v2-az-lc1-run.md`, extrapolated) | measured 719–720 MiB (`v2-results.md`; "close to the pilot's projection") |
| X9 | Where the uncapped AZ metrics live | "owner's machine: not committed" (`v2-az-uncapped.md` header) | runs executed on the cloud machine (`v2-az-run.md` § Pilot; plan § Cloud execution notes). The provenance statement is inconsistent, and the figures cannot be verified from the repo |
| X10 | Run time under `lc1-2` | about 35 min per run (`v2-az-lc1-run.md`, projection) | 36–45 min training time, about 1 h wall time (`v2-results.md`) |
| X11 | Uncapped AZ run time | about 37 min per run (`v2-az-run.md`, projection) | no measured duration recorded anywhere |
| X12 | Colour advantage | Red 72 % (greedy/greedy, initial position, `v2-ruleset.md`) | White 0.565 (greedy after 4 random plies, `v2-harness.md`); White 0.59–0.66 (nets, `lc1-2`, `v2-results.md`). Not a contradiction (different players, openings and rules), but easy to misquote |
| X13 | `measure` run time | "~2 s" (README § Development) | 1.589579826 s (`v2-measure.json` `run.wall_seconds`). Trivial |

## Gaps (results with no CI or no raw data)

- **No CI:** every `v2-measure.json` figure except the White-win shares (Wilson intervals in the md only); the seed-spread ranges (I1–I5); the ablation ladder gaps (J6–J7); the colour-balance ranges (K3–K6); CLI think times (L7); all pilot and run-cost figures; TD diagnostics (D2, D21, D22); the uncapped AZ truncation table and its in-training checks (E8–E14).
- **In the md only, with no raw JSON:** the TD first attempt and both sweeps (D1–D7); the TD value diagnostics (D2, D21, D22); CLI think times (L7); the start-position depth games (L4, code in `depth_probe.rs`, no output file); the uncapped AZ run figures (E8–E15).
- **Not done or not recorded:** criterion 4 (human games); the export max-difference figure (L9); the clean-machine install (plan 6.3).
- **Web parity (plan 6.4), done 2026-09-28:** the site's lc1-2 ONNX net vs the pure-Rust net, 100 lc1-2 positions (33 repeated once), largest difference over logits and values 1.79e-7 (limit 1e-5). Printed by `app/src/ai/parity.test.ts`, not stored in a file; commit `1a7fe6c`. The site's LC3-29 net is still round 1.
- **Unknown sample size:** D22 ("67 %"), L7.
