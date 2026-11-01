#!/usr/bin/env bash
# Arena evaluation of docs/experiments/v3-repetition-outcome.md for one rule.
# Usage: scripts/v3-eval.sh <rule> <run prefix>, e.g. lc1d-2 az-lc1d
# Needs ./target/release/arena and LIBTORCH_LIB set to libtorch's lib dir
# (macOS strips DYLD_LIBRARY_PATH from the environment of a script started
# through /usr/bin/env, so the script sets it itself).
set -euo pipefail
export DYLD_LIBRARY_PATH="${LIBTORCH_LIB:?set LIBTORCH_LIB to the libtorch lib directory}"
rule=$1
prefix=$2
out=docs/experiments/v3-repetition-outcome/arena
mkdir -p "$out"
final() { echo "net:models/$prefix-s$1/checkpoints/iter_00200.pt"; }
for s in 1 2 3; do
  ./target/release/arena "$rule" "$(final "$s")" "net:models/$prefix-s$s/checkpoints/iter_00020.pt" \
    --pairs 200 --opening 4 --seed 7 --out "$out/G-$prefix-s$s.json"
done
./target/release/arena "$rule" "$(final 1)" "$(final 2)" "$(final 3)" \
  --pairs 200 --opening 4 --seed 7 --out "$out/A-$prefix.json"
./target/release/arena "$rule" "$(final 1)" "$(final 2)" "$(final 3)" \
  --pairs 1 --opening 0 --seed 7 --out "$out/D-$prefix.json"
