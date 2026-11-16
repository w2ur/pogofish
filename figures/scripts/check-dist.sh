#!/usr/bin/env bash
# The built package keeps the search worker out of the eager bundle: it is its own
# entry (dist/search-worker.js), never inlined as a data:/blob: URL in
# pogo-figures.js, and never bundled a second time under dist/assets/. The net
# parser and the search stay out of it too: pogo-figures.js imports only the
# engine chunk statically, and holds no net parser (its magic lines).
# Run after `npm run build`, from figures/. Exit 0 healthy, 1 a finding, 2 no build.
set -u
cd "$(dirname "$0")/.." || exit 2
[ -f dist/pogo-figures.js ] || { echo "check-dist: no dist/pogo-figures.js, run npm run build" >&2; exit 2; }
status=0
[ -f dist/search-worker.js ] || { echo "check-dist: dist/search-worker.js is missing" >&2; status=1; }
inlined=$(grep -c 'data:text/javascript\|data:application/javascript\|blob:' dist/pogo-figures.js)
[ "$inlined" = "0" ] || { echo "check-dist: pogo-figures.js inlines a worker ($inlined match)" >&2; status=1; }
[ ! -e dist/assets ] || { echo "check-dist: dist/assets/ exists: a worker was bundled a second time" >&2; status=1; }
eager=$(grep -o '^import [^;]* from "[^"]*"' dist/pogo-figures.js | grep -v 'from "./engine-' | wc -l | tr -d ' ')
[ "$eager" = "0" ] || { echo "check-dist: pogo-figures.js statically imports $eager chunk(s) besides the engine" >&2; status=1; }
parser=$(grep -c 'PFW1\|PFV1' dist/pogo-figures.js)
[ "$parser" = "0" ] || { echo "check-dist: pogo-figures.js holds the net parser ($parser match)" >&2; status=1; }
[ "$status" = 0 ] && echo "check-dist: worker entry present, nothing inlined, no dist/assets/, the parser and the search load on demand"
exit "$status"
