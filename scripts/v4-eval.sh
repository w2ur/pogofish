#!/usr/bin/env bash
# The whole v4 evaluation of docs/experiments/v4-evaluation.md, end to end.
# Usage: scripts/v4-eval.sh   (from anywhere; runs at the repository root)
# Exit: 0 done, 2 could not run (foreign table hash, missing prerequisite).
# Every stage is resumable or idempotent: a finished TD or tabular run is a
# no-op, and the bench commands are read back from the committed JSON, never
# retyped (the tabular learner's JSON against greedy and against random among
# them). td_train and qtrain exit 130 when interrupted, which stops the
# script before a partial run is exported or benched.
# macOS strips DYLD_LIBRARY_PATH from the environment of a script started
# through /usr/bin/env, so the script sets it itself (CLAUDE.md "Training").
# Do not run td_train under /usr/bin/time: that strips it too.
set -euo pipefail
cd "$(dirname "$0")/.."

accepted=$(grep -m1 '^ACCEPTED_TABLE_SHA256' tools/v4_table.py | grep -o '[0-9a-f]\{64\}')
[ -n "$accepted" ] || { echo "no accepted table hash in tools/v4_table.py" >&2; exit 2; }
[ -f models/v3-solve/table.bin ] || { echo "models/v3-solve/table.bin is missing" >&2; exit 2; }

echo "== build"
cargo build --release -p pogofish-search --bin retro --bin qtrain
cargo build --release -p pogofish-infer --bin v4bench
cargo build --release -p pogofish-train --bin td_train --bin export_td

echo "== table fingerprint (rebuild from scratch, compare, delete)"
R=./target/release/retro
D=models/v4-solve
if [ ! -f "$D/table.bin" ]; then
  rm -rf "$D"
  "$R" reach "$D"
  "$R" solve "$D"
fi
rebuilt=$(shasum -a 256 "$D/table.bin" | cut -d' ' -f1)
rm -rf "$D"
if [ "$rebuilt" != "$accepted" ]; then
  echo "rebuilt table is $rebuilt, accepted is $accepted" >&2
  exit 2
fi

echo "== pogoq (needs the table)"
POGOFISH_TABLE=$PWD/models/v3-solve cargo test --release -p pogoq -- --ignored

echo "== TD(lambda) under lc1-2, three seeds (resumable) and export"
libtorch=$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" | head -1)
[ -n "$libtorch" ] || { echo "libtorch not found under target/release/build" >&2; exit 2; }
export DYLD_LIBRARY_PATH=$libtorch
for s in 1 2 3; do
  run=models/v4-td-lc1-s$s
  ./target/release/td_train "$run" --rules lc1-2 --features mover-relative-repetition \
    --lambda 0.7 --lr 0.1 --iterations 1000 --temp-decay 1000 --eval-every 50 \
    --eval-pairs 200 --checkpoint-every 50 --seed "$s"
  ./target/release/export_td "$run/weights.pt" "$run/td.pfv"
done

echo "== tabular learner under lc1-2, three seeds (resumable; 931 MB each, one at a time)"
for s in 1 2 3; do
  ./target/release/qtrain models/v4-qtab-s$s --games 500000 --seed "$s"
done

echo "== v4bench, every player (main and appendix), commands read from the JSON"
for f in docs/experiments/v4/*.json docs/experiments/v4/appendix-lc1d/*.json; do
  # The argv array, one element per line (no element holds a newline), run
  # as is: nothing in the JSON is ever handed to the shell to parse.
  cmd=()
  while IFS= read -r arg; do
    cmd+=("$arg")
  done < <(jq -r '.command[]' "$f")
  [ "${#cmd[@]}" -gt 0 ] || { echo "$f: empty command" >&2; exit 2; }
  echo "-- $f"
  "${cmd[@]}"
done

echo "== tables"
uv run tools/v4_table.py docs/experiments/v4/ docs/experiments/v4-evaluation.md

echo "== is the committed doc what the benches produce?"
git diff --exit-code docs/experiments/v4-evaluation.md || echo "the doc differs from the committed one (expected on a first run)"
