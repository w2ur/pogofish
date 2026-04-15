#!/bin/bash
# Phase 8: Full pipeline for the 5 remaining variants.
# LC2-15 and LC3-15 already completed in validate_fixes.sh.
#
# Per variant: AlphaZero (100 iter) → DQN (200k) → Tournaments
# Model-vs-minimax tournament runs only if minimax table exists.
#
# Usage: ./scripts/phase8.sh
# Safe to interrupt and re-run — all steps are skipped if output exists.

set -euo pipefail
cd "$(dirname "$0")/.."

LIBTORCH_LIB=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" 2>/dev/null | head -1)
if [ -z "$LIBTORCH_LIB" ]; then
    echo "ERROR: libtorch not found. Run: cargo build --release -p pogofish-train"
    exit 1
fi
export DYLD_LIBRARY_PATH="$LIBTORCH_LIB"

TRAIN=./target/release/train
DQN=./target/release/dqn_train
TOURNAMENT=./target/release/tournament

VARIANTS=("lc2-16" "lc2-30" "lc3-16" "lc3-30" "lc1-1" "lc1-2" "lc3-50" "lc3-100")
START_TIME=$(date +%s)

echo "============================================"
echo "  Phase 8 — 8 Variants Full Pipeline"
echo "  Started: $(date)"
echo "============================================"
echo ""

for variant in "${VARIANTS[@]}"; do
    outdir="models/${variant}-v2"
    mkdir -p "$outdir"

    echo "====== $variant ======"

    # 1. AlphaZero
    if [ -f "$outdir/metrics.jsonl" ] && [ "$(wc -l < "$outdir/metrics.jsonl" | tr -d ' ')" -ge 100 ]; then
        echo "[1/4] AlphaZero: already done. Skipping."
    else
        echo "[1/4] AlphaZero training (100 iterations)..."
        "$TRAIN" "$variant" "$outdir" mlp_small 2>&1 | tee "$outdir/az_run.log"
    fi

    # 2. DQN
    if [ -f "$outdir/dqn/model_best.pt" ]; then
        echo "[2/4] DQN: already done. Skipping."
    else
        echo "[2/4] DQN training (200k episodes)..."
        mkdir -p "$outdir/dqn"
        "$DQN" "$variant" "$outdir/dqn" 200000 2>&1 | tee "$outdir/dqn_run.log"
    fi

    # 3. Tournaments (AZ vs Random, AZ vs DQN, DQN vs Random, balance)
    if [ -f "$outdir/tournament_az_vs_random.json" ]; then
        echo "[3/4] Tournaments: already done. Skipping."
    else
        echo "[3/4] Tournaments..."

        echo "  AZ vs Random (200 games)..."
        "$TOURNAMENT" "$variant" "$outdir/model_best.pt" random 200 \
            > "$outdir/tournament_az_vs_random.json" 2>/dev/null
        cat "$outdir/tournament_az_vs_random.json"
        echo ""

        echo "  AZ vs DQN (200 games)..."
        "$TOURNAMENT" "$variant" "$outdir/model_best.pt" "$outdir/dqn/model_best.pt" 200 \
            > "$outdir/tournament_az_vs_dqn.json" 2>/dev/null
        cat "$outdir/tournament_az_vs_dqn.json"
        echo ""

        echo "  DQN vs Random (200 games)..."
        "$TOURNAMENT" "$variant" "$outdir/dqn/model_best.pt" random 200 \
            > "$outdir/tournament_dqn_vs_random.json" 2>/dev/null
        cat "$outdir/tournament_dqn_vs_random.json"
        echo ""

        echo "  Balance — AZ vs AZ (200 games, tau=0.1)..."
        "$TOURNAMENT" "$variant" "$outdir/model_best.pt" "$outdir/model_best.pt" 200 --tau 0.1 \
            > "$outdir/tournament_balance.json" 2>/dev/null
        cat "$outdir/tournament_balance.json"
        echo ""
    fi

    # 4. Model vs Minimax — not yet implemented in tournament binary
    echo "[4/4] AZ vs Minimax: skipped (not yet implemented)"

    # Cleanup intermediate checkpoints, keep last
    last_ckpt=$(ls -1 "$outdir"/checkpoint_*.pt 2>/dev/null | sort | tail -1 || true)
    for f in "$outdir"/checkpoint_*.pt; do
        [ -f "$f" ] && [ "$f" != "$last_ckpt" ] && rm "$f"
    done

    elapsed=$(( $(date +%s) - START_TIME ))
    echo "--- $variant done ($((elapsed / 60))m $((elapsed % 60))s cumulative) ---"
    echo ""
done

TOTAL_TIME=$(( $(date +%s) - START_TIME ))
echo "============================================"
echo "  Phase 8 complete: $((TOTAL_TIME / 60))m $((TOTAL_TIME % 60))s"
echo "  Finished: $(date)"
echo "============================================"
echo ""

# Summary table
echo "=== Results Summary ==="
echo "  variant     | AZ-vs-Rand | AZ-vs-DQN | DQN-vs-Rand | White% (bal) | Draws% (bal)"
echo "  ------------|------------|-----------|-------------|--------------|-------------"
for variant in "${VARIANTS[@]}"; do
    outdir="models/${variant}-v2"
    python3 -c "
import json, os
def rate(f):
    if not os.path.exists(f): return '  N/A '
    d = json.load(open(f))
    return f'{d[\"player1_win_rate\"]*100:5.1f}%'
def bal(f):
    if not os.path.exists(f): return 'N/A', 'N/A'
    d = json.load(open(f))
    w = d['white_wins'] / d['games'] * 100
    dr = d['draws'] / d['games'] * 100
    return f'{w:5.1f}%', f'{dr:5.1f}%'
r = rate('$outdir/tournament_az_vs_random.json')
a = rate('$outdir/tournament_az_vs_dqn.json')
d = rate('$outdir/tournament_dqn_vs_random.json')
w, dr = bal('$outdir/tournament_balance.json')
print(f'  $variant     | {r}      | {a}     | {d}       | {w}         | {dr}')
" 2>/dev/null || echo "  $variant: incomplete"
done
