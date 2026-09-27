#!/usr/bin/env bash
# Phase 5 evaluation (docs/experiments/v2-az-run.md, "How the criteria will be
# judged"). Runs every arena match for criteria 1 and 2 and the ablation, in
# parallel, then fits the ladders. Needs the trained runs under models/.
#
# Usage: scripts/phase5-eval.sh <out_dir> [jobs]
set -euo pipefail
out=${1:?usage: phase5-eval.sh <out_dir> [jobs]}
jobs=${2:-4}
arena=./target/release/arena
ladder=./target/release/ladder
mkdir -p "$out"

net() { echo "net:models/$1/checkpoints/iter_$(printf %05d "$2").pt:$3"; }

tasks=()
# Criterion 1: final checkpoint vs random, greedy, TD (same seed), own 10 % checkpoint.
for s in 1 2 3; do
  final=$(net az-s$s 200 100)
  for opp in random greedy "td:models/td-mr-s$s/weights.pt" "$(net az-s$s 20 100)"; do
    name=$(echo "c1-s$s-vs-$opp" | tr -c 'a-zA-Z0-9-' '_')
    tasks+=("$arena uncapped $final $opp --pairs 200 --seed 7 --out $out/$name.json")
  done
done
# Ablation: absolute encoding, final, same opponents as seed 1.
final=$(net az-abs-s1 200 100)
for opp in random greedy "td:models/td-mr-s1/weights.pt" "$(net az-s1 200 100)"; do
  name=$(echo "abl-vs-$opp" | tr -c 'a-zA-Z0-9-' '_')
  tasks+=("$arena uncapped $final $opp --pairs 200 --seed 7 --out $out/$name.json")
done
# Criterion 2: checkpoint ladders (iterations 20..200), anchors + next checkpoint.
for run in az-s1 az-s2 az-s3 az-abs-s1; do
  for it in $(seq 20 20 200); do
    for opp in random greedy mcts-uniform:200; do
      tasks+=("$arena uncapped $(net $run $it 50) $opp --pairs 100 --seed 11 --out $out/c2-$run-$it-$opp.json")
    done
    if [ "$it" -lt 200 ]; then
      tasks+=("$arena uncapped $(net $run $it 50) $(net $run $((it + 20)) 50) --pairs 100 --seed 11 --out $out/c2-$run-$it-next.json")
    fi
  done
done

printf '%s\n' "${tasks[@]}" | xargs -P "$jobs" -I{} sh -c '{} 2>/dev/null'

for run in az-s1 az-s2 az-s3 az-abs-s1; do
  $ladder "$out"/c2-$run-*.json --anchor random --out "$out/ladder-$run.json" > "$out/ladder-$run.md"
done
echo "done: $(ls "$out"/*.json | wc -l) files in $out"
