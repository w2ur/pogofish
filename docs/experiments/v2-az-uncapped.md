# AlphaZero on the uncapped game — stopped by the switch rule

Date: 2026-09-27 · Runs configured in `v2-az-run.md` · Metrics: `models/az-*/metrics.jsonl`
(owner's machine: not committed; figures below computed from them)

**Result: negative.** The pre-registered switch rule in `v2-ruleset.md` (more than
5 % of an iteration's self-play games truncated at 1,000 plies, three iterations in a
row) fired in two of the three runs. The owner chose to follow it (2026-09-27):
round 2 moves to option B, `lc1-2`. These runs are not evaluated against the
success criteria.

| Run | Truncated self-play games | Rule fired at iteration | Truncated %, iterations 1–50 / 51–100 / 101–150 / 151–200 | Mean plies, last 50 iterations |
|---|---|---|---|---|
| mover-relative, seed 1 | 177 of 10,000 | never | 0.3 / 1.1 / 2.8 / 2.9 | 68 |
| mover-relative, seed 2 | 325 | 130 | 0.2 / 1.6 / 4.4 / 6.8 | 116 |
| mover-relative, seed 3 | 527 | 70 | 1.1 / 5.0 / 7.7 / 7.2 | 113 |
| absolute, seed 1 (ablation) | 10 | never | 0.0 / 0.0 / 0.1 / 0.3 | 22 |

## What happened

- In every mover-relative run, truncation rose as the agent got stronger, and games
  grew from about 20 plies at the start to 68–116 on average. The agents learned to
  avoid losing, and an agent that cannot find a win can repeat moves until the limit.
  This is the risk the ruleset memo named and the scripted measurements could not see.
- The absolute-encoding run stayed short and almost never truncated. A likely reason,
  not tested: it is weaker, so its games end in a loss before either side learns to
  hold.
- The in-training checks against greedy (100 pairs, monitoring only) read 0.85,
  0.875 and 0.78 at iteration 200 for seeds 1–3, and 0.77 for the absolute run. They
  are not evidence for the criteria and are reported only so the stop is not mistaken
  for a failure to learn.

## A process failure

The rule was only logged, not enforced, and nobody watched it during the runs:
seeds 2 and 3 trained 70 and 130 iterations past the point where they should have
stopped. Training now stops by itself when the rule fires
(`TrainStop::TruncationRule`, exit code 3 from `train`), and refuses to resume such a
run.
