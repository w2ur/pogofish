# LC2(30) Calibration Run

**Date:** 2026-04-12
**Purpose:** Establish wall-clock baseline for AlphaZero training on the Rust engine. First Stage 1 variant.

## Configuration

| Parameter | Value |
|-----------|-------|
| Rule variant | LC2 (hard cap at 30 moves) |
| Architecture | mlp_small (trunk 256→128, heads 128) |
| Iterations | 100 |
| Games/iteration | 100 |
| MCTS simulations | 100 |
| Batch size | 256 |
| Training epochs | 5 |
| Window capacity | 500 games |
| LR schedule | 1e-3 → 1e-4 (cosine) |
| Gatekeeper games | 40 |
| Gatekeeper threshold | 55% |
| Max moves/game | 200 (capped by LC2 at 30) |
| Hardware | Apple M2, 8 GB RAM |

## Results

| Metric | Value |
|--------|-------|
| **Wall-clock** | 22.4 min (1346s) |
| **Avg iteration** | 13.5s |
| **Loss** | 4.007 → 3.176 (steady decline, ~21% reduction) |
| **Adoptions** | 21 / 100 (21%) |
| **Model size** | 507 KB (.pt) |
| **Window size** | ~9700 examples at saturation |

## Observations

1. **Training is fast.** 22 minutes for a full 100-iteration run. Self-play is the bottleneck (~8s per iteration), gatekeeper adds ~3s, training <2s.

2. **Loss decreases steadily.** 4.0 → 3.2 over 100 iterations with no divergence. The cosine LR schedule works as expected.

3. **Gatekeeper is binary.** Win rates are either 0.5 (rejected) or 1.0 (adopted), never intermediate. This is because tau=0 (greedy) MCTS with no noise produces deterministic play — all games from the same starting side play out identically. Not a bug, but it means the gatekeeper only detects large jumps in strength, not gradual improvement.

4. **Zero draws** under LC2(30), as expected — the hard cap forces a winner.

5. **21 adoptions** spread across iterations 5–99, roughly one every 5 iterations. The model is learning.

## Baseline extrapolation for remaining variants

Per-iteration cost is dominated by self-play game count × MCTS simulations × game length.

| Variant | Expected game length | Estimated run time | Notes |
|---------|---------------------|--------------------|-------|
| LC2(30) | ≤30 moves | **22 min** (measured) | Baseline |
| LC2(50) | ≤50 moves | ~35 min | Games ~1.7× longer |
| LC1(1) | Variable (short if repetition, long otherwise) | ~25 min | Most games end before 30 |
| LC3(30) | ≤30 moves | ~22 min | Same cap, draws possible |
| LC3(50) | ≤50 moves | ~35 min | Longer games + draws |

**Total Stage 1 (5 variants): ~2.5 hours estimated.** Well within overnight budget. Could run all 5 sequentially in one session.

## Files

- `metrics.jsonl` — Per-iteration JSONL (100 entries)
- `model_best.pt` — Best adopted model (507 KB)
- Checkpoints in `models/lc2-30/` (gitignored)
