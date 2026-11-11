#!/usr/bin/env bash
# Round 5, addendum 2 (docs/experiments/v5-video.md): mosaics and puzzles of seed 1 at every
# stage. Needs the TD and AlphaZero exports of scripts/v5-eval.sh and a running or finished
# `qtrain models/v5m-qtab-s1 --games 5000000 --seed 1 --snapshot-at 0,50000,...,5000000`.
# Idempotent; each tabular snapshot must match docs/experiments/v5/qtab-snapshots.txt, is used,
# then deleted. Exit: 0 done, 2 could not run.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=docs/experiments/v5; T=models/v3-solve; A=docs/experiments/v3-solve/answers.json
mkdir -p "$OUT/mosaic" "$OUT/puzzles"
PCT=(0 1 2 5 10 25 50 100)
label() { printf 'p%03d' "$1"; }
mosaic() { # NAME SPEC OPPONENT
  [ -f "$OUT/mosaic/$1.json" ] || ./target/release/v5mosaic "$T" "$2" --pairs 50 --opponent "$3" \
    --out "$OUT/mosaic/$1.json" || { echo "v5mosaic failed for $2" >&2; exit 2; }
}
puzzles() { # NAME SPEC
  [ -f "$OUT/puzzles/$1.json" ] || ./target/release/v5puzzles "$A" "$T" "$2" \
    --out "$OUT/puzzles/$1.json" || { echo "v5puzzles failed for $2" >&2; exit 2; }
}
for p in "${PCT[@]}"; do
  l=$(label "$p")
  td=models/v5-td-s1/pfv/$(printf 'iter_%05d' $((1000 * p / 100))).pfv
  az=models/v5-az-s1/pfw/$(printf 'iter_%05d' $((200 * p / 100))).pfw
  mosaic "td-s1-$l" "td:$td" greedy
  puzzles "td-s1-$l" "td:$td"
  mosaic "az100-s1-$l" "net:$az:100" greedy
  mosaic "az0-s1-$l" "net:$az:0" greedy
  puzzles "az-s1-$l" "net:$az"
done
run=models/v5m-qtab-s1
for p in "${PCT[@]}"; do
  name=qtab-s1-$(label "$p")
  snap=$run/snapshots/$(printf 'g%09d' $((5000000 * p / 100)))
  if [ -f "$OUT/mosaic/$name.json" ] && [ -f "$OUT/mosaic/$name-random.json" ] \
     && [ -f "$OUT/puzzles/$name.json" ]; then continue; fi
  until [ -f "$snap/state.json" ]; do sleep 30; done
  sum=$(sha256sum "$snap/v.bin" 2>/dev/null || shasum -a 256 "$snap/v.bin")
  want=$(awk -v n="$name" '$2 == n {print $1}' "$OUT/qtab-snapshots.txt")
  [ "${sum%% *}" = "$want" ] || { echo "$name: v.bin ${sum%% *} differs from $want" >&2; exit 2; }
  mosaic "$name" "qtab:$snap/v.bin" greedy
  mosaic "$name-random" "qtab:$snap/v.bin" random
  puzzles "$name" "qtab:$snap/v.bin"
  rm -rf "$snap"
done
