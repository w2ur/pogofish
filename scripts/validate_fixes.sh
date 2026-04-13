#!/bin/bash
# Validate training convergence fixes + full evaluation pipeline.
# Skips steps that already completed (checks for output files).
#
# Usage: ./scripts/validate_fixes.sh
# Estimated time: ~30 minutes for remaining work

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
SOLVE=./target/release/solve
TOURNAMENT=./target/release/tournament

VARIANTS=("lc2-15" "lc3-15")
START_TIME=$(date +%s)

echo "============================================"
echo "  Convergence Validation — LC2-15 + LC3-15"
echo "  Started: $(date)"
echo "============================================"
echo ""

for variant in "${VARIANTS[@]}"; do
    outdir="models/${variant}-v2"
    mkdir -p "$outdir"

    echo "====== $variant ======"

    # 1. AlphaZero
    if [ -f "$outdir/metrics.jsonl" ] && [ "$(wc -l < "$outdir/metrics.jsonl" | tr -d ' ')" -ge 100 ]; then
        echo "[1/4] AlphaZero: already done (100 iterations). Skipping."
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

    # 3. Minimax — skipped (run separately overnight with solve binary)
    echo "[3/4] Minimax: skipped (run separately: $SOLVE $variant $outdir/minimax.jsonl.gz)"

    # 4. Tournaments
    if [ -f "$outdir/tournament_az_vs_random.json" ]; then
        echo "[4/4] Tournaments: already done. Skipping."
    else
        echo "[4/4] Tournaments..."

        echo "  AZ vs Random (200 games)..."
        "$TOURNAMENT" "$variant" "$outdir/model_best.pt" random 200 > "$outdir/tournament_az_vs_random.json" 2>/dev/null
        cat "$outdir/tournament_az_vs_random.json"
        echo ""

        if [ -f "$outdir/dqn/model_best.pt" ]; then
            echo "  AZ vs DQN (200 games)..."
            "$TOURNAMENT" "$variant" "$outdir/model_best.pt" "$outdir/dqn/model_best.pt" 200 > "$outdir/tournament_az_vs_dqn.json" 2>/dev/null
            cat "$outdir/tournament_az_vs_dqn.json"
            echo ""

            echo "  DQN vs Random (200 games)..."
            "$TOURNAMENT" "$variant" "$outdir/dqn/model_best.pt" random 200 > "$outdir/tournament_dqn_vs_random.json" 2>/dev/null
            cat "$outdir/tournament_dqn_vs_random.json"
            echo ""
        fi

        echo "  AZ vs AZ balance (200 games, tau=0.1)..."
        "$TOURNAMENT" "$variant" "$outdir/model_best.pt" "$outdir/model_best.pt" 200 --tau 0.1 > "$outdir/tournament_balance.json" 2>/dev/null
        cat "$outdir/tournament_balance.json"
        echo ""
    fi

    # Cleanup checkpoints
    last_ckpt=$(ls -1 "$outdir"/checkpoint_*.pt 2>/dev/null | sort | tail -1 || true)
    for f in "$outdir"/checkpoint_*.pt; do
        [ -f "$f" ] && [ "$f" != "$last_ckpt" ] && rm "$f"
    done

    echo "--- $variant done ---"
    echo ""
done

# Summary
TOTAL_TIME=$(( $(date +%s) - START_TIME ))
echo "============================================"
echo "  Total: $((TOTAL_TIME / 60))m | Finished: $(date)"
echo "============================================"
echo ""

echo "=== CONVERGENCE CHECK ==="
for variant in "${VARIANTS[@]}"; do
    outdir="models/${variant}-v2"
    [ -f "$outdir/metrics.jsonl" ] && python3 -c "
import json
lines = [json.loads(l) for l in open('$outdir/metrics.jsonl')]
q3 = sum(l['avg_loss'] for l in lines[50:75]) / 25
q4 = sum(l['avg_loss'] for l in lines[75:100]) / 25
status = 'PASS' if q4 <= q3 else 'FAIL'
adopt = sum(1 for l in lines if l['adopted'])
rates = len(set(round(l['gatekeeper_win_rate'], 3) for l in lines))
print(f'  $variant: Q3={q3:.3f} Q4={q4:.3f} → {status}  ({adopt} adoptions, {rates} distinct win rates)')
"
done
