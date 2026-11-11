#!/usr/bin/env bash
# Round 5 (docs/experiments/v5-video.md): measure every stage of every program
# and seed with v4bench, and record the game shown (v5game).
# Usage: scripts/v5-eval.sh qtab|td|az|qtab-random SEED   (from anywhere; runs at the repository root)
# Idempotent: a stage whose bench JSON and game JSON exist is skipped. For the
# tabular learner it waits for each snapshot of the running qtrain, records the
# SHA-256 of its v.bin, then deletes the snapshot (960 MB each).
# The exports need libtorch: set LIBTORCH_LIB to its lib directory, else the
# one tch downloaded under target/release/build is used.
# Exit: 0 done, 2 could not run (a bench, an export or a game failed).
set -euo pipefail
cd "$(dirname "$0")/.."

prog=${1:?usage: scripts/v5-eval.sh qtab|td|az SEED}
s=${2:?usage: scripts/v5-eval.sh qtab|td|az SEED}
OUT=docs/experiments/v5
mkdir -p "$OUT/games"
lib=${LIBTORCH_LIB:-$(find target/release/build -path "*/torch-sys-*/out/libtorch/libtorch/lib" 2>/dev/null | head -1)}
export DYLD_LIBRARY_PATH="$lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
export LD_LIBRARY_PATH="$lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

PCT=(0 1 2 5 10 25 50 100)
label() { printf 'p%03d' "$1"; }

# bench NAME SPEC: v4bench and v5game for one player, unless both are there.
bench() {
  local name=$1 spec=$2
  if [ ! -f "$OUT/$name.json" ]; then
    ./target/release/v4bench models/v3-solve "$spec" --out "$OUT/$name.json" ||
      { echo "v4bench failed for $spec" >&2; exit 2; }
  fi
  if [ ! -f "$OUT/games/$name.json" ]; then
    ./target/release/v5game "$spec" --out "$OUT/games/$name.json" ||
      { echo "v5game failed for $spec" >&2; exit 2; }
  fi
}

case $prog in
  qtab)
    run=models/v5-qtab-s$s
    for p in "${PCT[@]}"; do
      g=$((5000000 * p / 100))
      name=qtab-s$s-$(label "$p")
      snap=$run/snapshots/$(printf 'g%09d' "$g")
      if [ -f "$OUT/$name.json" ] && [ -f "$OUT/games/$name.json" ]; then continue; fi
      until [ -f "$snap/state.json" ]; do sleep 30; done
      bench "$name" "qtab:$snap/v.bin"
      sum=$(sha256sum "$snap/v.bin" 2>/dev/null || shasum -a 256 "$snap/v.bin")
      echo "${sum%% *}  $name  $(jq -c '{games_played, visited, unfinished}' "$snap/state.json")" \
        >> "$OUT/qtab-snapshots.txt"
      rm -rf "$snap"
    done
    ;;
  td)
    run=models/v5-td-s$s
    for p in "${PCT[@]}"; do
      it=$((1000 * p / 100))
      name=td-s$s-$(label "$p")
      pfv=$run/pfv/$(printf 'iter_%05d' "$it").pfv
      until [ -f "$run/checkpoints/$(printf 'iter_%05d' "$it").pt" ]; do sleep 30; done
      if [ ! -f "$pfv" ]; then
        mkdir -p "$run/pfv"
        ./target/release/export_td "$run/checkpoints/$(printf 'iter_%05d' "$it").pt" "$pfv" ||
          { echo "export_td failed at iteration $it" >&2; exit 2; }
      fi
      bench "$name" "td:$pfv"
    done
    ;;
  az)
    run=models/v5-az-s$s
    for p in "${PCT[@]}"; do
      it=$((200 * p / 100))
      pfw=$run/pfw/$(printf 'iter_%05d' "$it").pfw
      ckpt=$run/checkpoints/$(printf 'iter_%05d' "$it").pt
      until [ -f "$ckpt" ]; do sleep 30; done
      if [ ! -f "$pfw" ]; then
        mkdir -p "$run/pfw"
        ./target/release/export_weights "$ckpt" "$pfw" ||
          { echo "export_weights failed at iteration $it" >&2; exit 2; }
      fi
      bench "az100-s$s-$(label "$p")" "net:$pfw:100"
      bench "az0-s$s-$(label "$p")" "net:$pfw:0"
    done
    ;;
  qtab-random)
    # Addendum of v5-video.md: the retrained run's snapshots, checked against the
    # SHA-256 recorded for the first run, benched against the bench's random player.
    run=models/v5r-qtab-s$s
    mkdir -p "$OUT/vs-random/games"
    for p in "${PCT[@]}"; do
      g=$((5000000 * p / 100))
      name=qtab-s$s-$(label "$p")
      snap=$run/snapshots/$(printf 'g%09d' "$g")
      if [ -f "$OUT/vs-random/$name.json" ] && [ -f "$OUT/vs-random/games/$name.json" ]; then continue; fi
      until [ -f "$snap/state.json" ]; do sleep 30; done
      sum=$(sha256sum "$snap/v.bin" 2>/dev/null || shasum -a 256 "$snap/v.bin")
      want=$(awk -v n="$name" '$2 == n {print $1}' "$OUT/qtab-snapshots.txt")
      if [ "${sum%% *}" != "$want" ]; then
        echo "$name: v.bin ${sum%% *} differs from the recorded $want" >&2; exit 2
      fi
      if [ ! -f "$OUT/vs-random/$name.json" ]; then
        ./target/release/v4bench models/v3-solve "qtab:$snap/v.bin" --opponent random \
          --out "$OUT/vs-random/$name.json" || { echo "v4bench failed for $name" >&2; exit 2; }
      fi
      ./target/release/v5game "qtab:$snap/v.bin" --opponent random \
        --out "$OUT/vs-random/games/$name.json" || { echo "v5game failed for $name" >&2; exit 2; }
      rm -rf "$snap"
    done
    ;;
  *) echo "unknown program $prog" >&2; exit 2 ;;
esac
