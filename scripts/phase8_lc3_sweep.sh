#!/bin/bash
# LC3 cap sweep: find the optimal cap around the 25-40 range.
# Tests odd and even caps to map the balance curve precisely.
#
# Usage: ./scripts/phase8_lc3_sweep.sh
# Safe to interrupt and re-run — all steps skip if output exists.

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

VARIANTS=("lc3-25" "lc3-29" "lc3-31" "lc3-35" "lc3-40")
START_TIME=$(date +%s)

echo "============================================"
echo "  LC3 Cap Sweep — ${#VARIANTS[@]} Variants"
echo "  Started: $(date)"
echo "============================================"
echo ""

for variant in "${VARIANTS[@]}"; do
    outdir="models/${variant}-v2"
    mkdir -p "$outdir"

    echo "====== $variant ======"

    # 1. AlphaZero
    if [ -f "$outdir/metrics.jsonl" ] && [ "$(wc -l < "$outdir/metrics.jsonl" | tr -d ' ')" -ge 100 ]; then
        echo "[1/3] AlphaZero: already done. Skipping."
    else
        echo "[1/3] AlphaZero training (100 iterations)..."
        "$TRAIN" "$variant" "$outdir" mlp_small 2>&1 | tee "$outdir/az_run.log"
    fi

    # 2. DQN
    if [ -f "$outdir/dqn/model_best.pt" ]; then
        echo "[2/3] DQN: already done. Skipping."
    else
        echo "[2/3] DQN training (200k episodes)..."
        mkdir -p "$outdir/dqn"
        "$DQN" "$variant" "$outdir/dqn" 200000 2>&1 | tee "$outdir/dqn_run.log"
    fi

    # 3. Tournaments
    if [ -f "$outdir/tournament_az_vs_random.json" ]; then
        echo "[3/3] Tournaments: already done. Skipping."
    else
        echo "[3/3] Tournaments..."

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
echo "  LC3 Sweep complete: $((TOTAL_TIME / 60))m $((TOTAL_TIME % 60))s"
echo "  Finished: $(date)"
echo "============================================"
echo ""

# Full LC3 balance curve
echo "=== LC3 Balance Curve ==="
echo "  Cap  | Parity | White% | Draws% | DQN vs Rand"
echo "  -----|--------|--------|--------|------------"
for cap in 15 16 25 29 30 31 35 40 50 100; do
    outdir="models/lc3-${cap}-v2"
    python3 -c "
import json, os
bal_f = '$outdir/tournament_balance.json'
dqn_f = '$outdir/tournament_dqn_vs_random.json'
if not os.path.exists(bal_f):
    print(f'  {$cap:>3}  |  {\"odd\" if $cap % 2 else \"even\":>4} |   N/A  |   N/A  |    N/A')
else:
    b = json.load(open(bal_f))
    w = b['white_wins'] / b['games'] * 100
    d = b['draws'] / b['games'] * 100
    parity = 'odd' if $cap % 2 else 'even'
    dqn = 'N/A'
    if os.path.exists(dqn_f):
        dr = json.load(open(dqn_f))
        dqn = f'{dr[\"player1_win_rate\"]*100:5.1f}%'
    print(f'  {$cap:>3}  |  {parity:>4} | {w:5.1f}% | {d:5.1f}% | {dqn:>10}')
" 2>/dev/null || echo "  $cap: incomplete"
done
