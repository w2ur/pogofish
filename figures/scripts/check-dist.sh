#!/usr/bin/env bash
# The built package's layout. The entry (pogo-figures.js), the search worker
# (search-worker.js, its own entry, never inlined as a data:/blob: URL), manifest.json,
# the wasm, nets/ and data/ sit at the root, unhashed: the site revalidates them.
# Every content-hashed chunk sits under assets/, which the site caches as immutable,
# and nothing else does. pogo-figures.js imports only the engine chunk statically and
# holds no net parser (its magic lines). The worker is never bundled a second time.
# scripts/budget.test.mjs checks the sizes, and that every import resolves to a file.
# Run after `npm run build`, from figures/. Exit 0 healthy, 1 a finding, 2 no build.
set -u
cd "$(dirname "$0")/.." || exit 2
[ -f dist/pogo-figures.js ] || { echo "check-dist: no dist/pogo-figures.js, run npm run build" >&2; exit 2; }
status=0
[ -f dist/search-worker.js ] || { echo "check-dist: dist/search-worker.js is missing" >&2; status=1; }
[ -f dist/manifest.json ] || { echo "check-dist: dist/manifest.json is missing" >&2; status=1; }
inlined=$(grep -c 'data:text/javascript\|data:application/javascript\|blob:' dist/pogo-figures.js)
[ "$inlined" = "0" ] || { echo "check-dist: pogo-figures.js inlines a worker ($inlined match)" >&2; status=1; }
# Vite's own worker bundling would emit assets/search.worker-HASH.js next to our entry.
twice=$(find dist/assets -name '*worker*' 2>/dev/null | wc -l | tr -d ' ')
[ "$twice" = "0" ] || { echo "check-dist: a worker was bundled a second time under dist/assets/" >&2; status=1; }
# A Rollup hash is 8 characters of [A-Za-z0-9_-] before the extension.
HASHED='-[A-Za-z0-9_-]{8}\.[a-z]+$'
[ -n "$(find dist/assets -type f 2>/dev/null)" ] || { echo "check-dist: dist/assets/ holds no chunk" >&2; status=1; }
unhashed=$(find dist/assets -type f | grep -Ev -- "$HASHED")
[ -z "$unhashed" ] || { echo "check-dist: unhashed file(s) under dist/assets/: $unhashed" >&2; status=1; }
roothashed=$(find dist -maxdepth 1 -type f | grep -E -- "$HASHED")
[ -z "$roothashed" ] || { echo "check-dist: hashed file(s) at the root of dist/: $roothashed" >&2; status=1; }
# The eager closure, by the detection budget.test.mjs uses (scripts/dist-imports.mjs): any
# import form, quoted either way, minified or not, and what the engine chunk imports in turn.
closure=$(node scripts/dist-imports.mjs eager dist pogo-figures.js) || { echo "check-dist: could not read the entry's imports" >&2; exit 2; }
eager=$(printf '%s\n' "$closure" | grep -Ev '^(pogo-figures\.js|assets/engine-[A-Za-z0-9_-]{8}\.js)$' | tr '\n' ' ')
[ -z "$eager" ] || { echo "check-dist: pogo-figures.js loads eagerly a chunk besides the engine: $eager" >&2; status=1; }
parser=$(grep -c 'PFW1\|PFV1' dist/pogo-figures.js)
[ "$parser" = "0" ] || { echo "check-dist: pogo-figures.js holds the net parser ($parser match)" >&2; status=1; }
[ "$status" = 0 ] && echo "check-dist: entry, worker and binaries at the root, unhashed; every hashed chunk under assets/; nothing inlined; the parser and the search load on demand"
exit "$status"
