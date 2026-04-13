#!/bin/bash
# Validate training convergence fixes on LC2-15 and LC3-15.
# Runs the full pipeline: AlphaZero → DQN → minimax solve → tournaments.
#
# Usage: ./scripts/validate_fixes.sh
# Estimated time: ~30 minutes total

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
    echo ""

    # 1. AlphaZero training (fresh — don't reuse old broken runs)
    echo "[1/4] AlphaZero training (100 iterations)..."
    "$TRAIN" "$variant" "$outdir" mlp_small 2>&1 | tee "$outdir/az_run.log"
    echo ""

    # 2. DQN training
    echo "[2/4] DQN training (200k episodes)..."
    "$DQN" "$variant" "$outdir/dqn" 200000 2>&1 | tee "$outdir/dqn_run.log"
    echo ""

    # 3. Minimax solve
    echo "[3/4] Minimax solve..."
    "$SOLVE" "$variant" "$outdir/minimax.json.gz" 2>&1 | tee "$outdir/solve.log"
    echo ""

    # 4. Tournaments
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

    echo "  AZ vs AZ (balance test, 200 games)..."
    "$TOURNAMENT" "$variant" "$outdir/model_best.pt" "$outdir/model_best.pt" 200 --tau 0.1 > "$outdir/tournament_balance.json" 2>/dev/null
    cat "$outdir/tournament_balance.json"
    echo ""

    # Cleanup checkpoints
    last_ckpt=$(ls -1 "$outdir"/checkpoint_*.pt 2>/dev/null | sort | tail -1)
    for f in "$outdir"/checkpoint_*.pt; do
        [ -f "$f" ] && [ "$f" != "$last_ckpt" ] && rm "$f"
    done

    echo "--- $variant complete ---"
    echo ""
done

# Summary
TOTAL_TIME=$(( $(date +%s) - START_TIME ))
echo "============================================"
echo "  Validation complete! Total: $((TOTAL_TIME / 60))m"
echo "  Finished: $(date)"
echo "============================================"
echo ""

# Convergence check
echo "=== CONVERGENCE CHECK ==="
for variant in "${VARIANTS[@]}"; do
    outdir="models/${variant}-v2"
    if [ -f "$outdir/metrics.jsonl" ]; then
        python3 -c "
import json
lines = [json.loads(l) for l in open('$outdir/metrics.jsonl')]
q3 = [l['avg_loss'] for l in lines[50:75]]
q4 = [l['avg_loss'] for l in lines[75:100]]
q3_avg = sum(q3)/len(q3)
q4_avg = sum(q4)/len(q4)
status = 'PASS (no regression)' if q4_avg <= q3_avg else 'FAIL (regression)'
print(f'  $variant: Q3={q3_avg:.3f} Q4={q4_avg:.3f} → {status}')
adoptions = sum(1 for l in lines if l['adopted'])
rates = set(round(l['gatekeeper_win_rate'], 3) for l in lines)
print(f'    Adoptions: {adoptions}/100, distinct win rates: {len(rates)}')
"
    fi
done
