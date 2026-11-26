#!/bin/sh
# Runs every test from the game folder. Browser tests need playwright-core at ~/.cache/pw-node.
# Usage: sh test/run-all.sh [screenshotDir]
set -u
cd "$(dirname "$0")/.."
OUT=${1:-/tmp}
fail=0
run() { echo "== $*"; "$@" || fail=1; }
run node test/node/sim.mjs
run node test/node/oracle-diff.mjs
run node test/node/bot.mjs 10
run node test/browser/save-reload.mjs
run node test/browser/cards-panel.mjs
run node test/browser/overlap.mjs "$OUT"
[ $fail -eq 0 ] && echo "ALL PASS" || echo "SOME FAILED"
exit $fail
