#!/bin/bash
# Run AlphaZero training on all Stage 1 rule variants.
# Cleans intermediate checkpoints after each run to save disk space.
#
# Usage: ./scripts/run_all_variants.sh
#
# Disk budget: ~10 MB per variant after cleanup (model_best.pt + metrics + last checkpoint)
# Time estimate: ~2.5 hours total on M2

set -euo pipefail

cd "$(dirname "$0")/.."

# Find libtorch
LIBTORCH_LIB=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" 2>/dev/null | head -1)
if [ -z "$LIBTORCH_LIB" ]; then
    echo "ERROR: libtorch not found. Run: cargo build --release -p pogofish-train --bin train"
    exit 1
fi
export DYLD_LIBRARY_PATH="$LIBTORCH_LIB"

TRAIN=./target/release/train

# All Stage 1 variants
VARIANTS=(
    "lc1-1"
    "lc2-30"
    "lc2-50"
    "lc3-30"
    "lc3-50"
)

# Additional variants worth exploring (uncomment to add)
# VARIANTS+=(
#     "lc1-2"    # LC1 with 2 repetitions before loss (more forgiving)
#     "lc2-40"   # LC2 with 40 move cap (middle ground)
#     "lc3-40"   # LC3 with 40 move cap
# )

ARCH="mlp_small"
TOTAL=${#VARIANTS[@]}
START_TIME=$(date +%s)

echo "============================================"
echo "  Pogofish Stage 1 — $TOTAL variants"
echo "  Arch: $ARCH"
echo "  Started: $(date)"
echo "============================================"
echo ""

cleanup_checkpoints() {
    local dir="$1"
    # Keep model_best.pt, metrics.jsonl, run.log, and the last checkpoint
    local last_ckpt=$(ls -1 "$dir"/checkpoint_*.pt 2>/dev/null | sort | tail -1)
    for f in "$dir"/checkpoint_*.pt; do
        if [ -f "$f" ] && [ "$f" != "$last_ckpt" ]; then
            rm "$f"
        fi
    done
    local size=$(du -sh "$dir" | cut -f1)
    echo "  Cleaned up checkpoints. Remaining: $size"
}

for i in "${!VARIANTS[@]}"; do
    variant="${VARIANTS[$i]}"
    num=$((i + 1))
    outdir="models/$variant"
    mkdir -p "$outdir"

    echo "[$num/$TOTAL] Training $variant → $outdir"
    echo "  Started: $(date)"

    # Skip if already completed (metrics.jsonl has 100 lines)
    if [ -f "$outdir/metrics.jsonl" ]; then
        lines=$(wc -l < "$outdir/metrics.jsonl" | tr -d ' ')
        if [ "$lines" -ge 100 ]; then
            echo "  Already complete ($lines iterations). Skipping."
            cleanup_checkpoints "$outdir"
            echo ""
            continue
        fi
        echo "  Resuming from iteration $((lines + 1))..."
    fi

    "$TRAIN" "$variant" "$outdir" "$ARCH" 2>&1 | tee "$outdir/run.log"

    cleanup_checkpoints "$outdir"

    elapsed=$(( $(date +%s) - START_TIME ))
    remaining_variants=$(( TOTAL - num ))
    avg_per_variant=$(( elapsed / num ))
    eta_min=$(( remaining_variants * avg_per_variant / 60 ))
    echo "  Elapsed: $((elapsed / 60))m | ETA: ${eta_min}m ($remaining_variants variants left)"
    echo ""
done

TOTAL_TIME=$(( $(date +%s) - START_TIME ))
echo "============================================"
echo "  All done! Total time: $((TOTAL_TIME / 60))m"
echo "  Finished: $(date)"
echo "============================================"

# Summary
echo ""
echo "Results:"
for variant in "${VARIANTS[@]}"; do
    dir="models/$variant"
    if [ -f "$dir/metrics.jsonl" ]; then
        adoptions=$(grep -c '"adopted":true' "$dir/metrics.jsonl" 2>/dev/null || echo 0)
        last_loss=$(tail -1 "$dir/metrics.jsonl" | python3 -c "import json,sys; print(f'{json.load(sys.stdin)[\"avg_loss\"]:.3f}')" 2>/dev/null || echo "?")
        size=$(du -sh "$dir" | cut -f1)
        echo "  $variant: $adoptions adoptions, loss=$last_loss, size=$size"
    else
        echo "  $variant: NOT RUN"
    fi
done
