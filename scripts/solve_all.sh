#!/bin/bash
# Solve multiple variants with minimax. Run in parallel with training.
#
# Usage: ./scripts/solve_all.sh

set -euo pipefail
cd "$(dirname "$0")/.."

SOLVE=./target/release/solve
START=$(date +%s)

# Start with variants most likely to complete (short caps first)
VARIANTS=(
    "lc2-15"
    "lc2-16"
    "lc3-15"
    "lc3-16"
    "lc1-1"
    "lc2-29"
    "lc2-30"
    "lc3-29"
    "lc3-30"
)

echo "============================================"
echo "  Minimax Full Solve — ${#VARIANTS[@]} variants"
echo "  Started: $(date)"
echo "============================================"
echo ""

for variant in "${VARIANTS[@]}"; do
    outdir="models/${variant}-v2"
    mkdir -p "$outdir"
    outfile="$outdir/minimax.jsonl.gz"

    if [ -f "$outfile" ] && [ "$(stat -f%z "$outfile" 2>/dev/null || echo 0)" -gt 100 ]; then
        size=$(du -sh "$outfile" | cut -f1)
        echo "[$variant] Already solved ($size). Skipping."
        echo ""
        continue
    fi

    echo "[$variant] Solving..."
    "$SOLVE" "$variant" "$outfile"
    echo ""

    elapsed=$(( $(date +%s) - START ))
    echo "  Cumulative time: $((elapsed / 60))m ${((elapsed % 60))}s"
    echo ""
done

echo "============================================"
echo "  All done! Total: $(( ($(date +%s) - START) / 60 ))m"
echo "============================================"
echo ""

echo "=== Results ==="
for variant in "${VARIANTS[@]}"; do
    meta="models/${variant}-v2/minimax.jsonl.meta.json"
    if [ -f "$meta" ]; then
        python3 -c "
import json
d = json.load(open('$meta'))
print(f'  $variant: {d[\"result\"]:12s}  {d[\"tt_entries\"]:>12,} positions  {d[\"decisive\"]:>12,} decisive  {d[\"solve_seconds\"]:.0f}s')
" 2>/dev/null
    else
        echo "  $variant: NOT SOLVED"
    fi
done
