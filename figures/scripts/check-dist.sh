#!/usr/bin/env bash
# The built package keeps the search worker out of the eager bundle: it is its own
# entry (dist/search-worker.js), never inlined as a data:/blob: URL in
# pogo-figures.js, and never bundled a second time under dist/assets/.
# Run after `npm run build`, from figures/. Exit 0 healthy, 1 a finding, 2 no build.
set -u
cd "$(dirname "$0")/.." || exit 2
[ -f dist/pogo-figures.js ] || { echo "check-dist: no dist/pogo-figures.js, run npm run build" >&2; exit 2; }
status=0
[ -f dist/search-worker.js ] || { echo "check-dist: dist/search-worker.js is missing" >&2; status=1; }
inlined=$(grep -c 'data:text/javascript\|data:application/javascript\|blob:' dist/pogo-figures.js)
[ "$inlined" = "0" ] || { echo "check-dist: pogo-figures.js inlines a worker ($inlined match)" >&2; status=1; }
[ ! -e dist/assets ] || { echo "check-dist: dist/assets/ exists: a worker was bundled a second time" >&2; status=1; }
[ "$status" = 0 ] && echo "check-dist: worker entry present, nothing inlined, no dist/assets/"
exit "$status"
