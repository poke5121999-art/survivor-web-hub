#!/bin/sh
# Runs every test from the game folder. Browser tests need playwright-core at ~/.cache/pw-node.
# The long play harnesses (each one CPU core, 10-35 min) run side by side; their output is printed in order.
# Usage: sh test/run-all.sh [screenshotDir]
set -u
cd "$(dirname "$0")/.."
OUT=${1:-/tmp}
fail=0
run() { echo "== $*"; "$@" || fail=1; }
LOGS=$(mktemp -d)
n=0
for t in "systems.mjs" "endless.mjs" "dungeon.mjs" "events.mjs" "campaign.mjs 1 2 3"; do
	n=$((n + 1))
	# shellcheck disable=SC2086
	( node test/node/$t > "$LOGS/$n.log" 2>&1; echo $? > "$LOGS/$n.rc" ) &
done
run node test/node/sim.mjs
run node test/node/oracle-diff.mjs
run node test/node/bot.mjs 10
run node test/node/stages.mjs 1 4
run node test/browser/save-reload.mjs
run node test/browser/cards-panel.mjs
run node test/browser/overlap.mjs "$OUT"
run node test/browser/touch.mjs "$OUT"
run node test/browser/load-retry.mjs
wait
n=0
for t in "systems.mjs" "endless.mjs" "dungeon.mjs" "events.mjs" "campaign.mjs 1 2 3"; do
	n=$((n + 1))
	echo "== node test/node/$t"
	grep -v '^    at \|^\[load\]' "$LOGS/$n.log"
	[ "$(cat "$LOGS/$n.rc")" = "0" ] || fail=1
done
rm -rf "$LOGS"
[ $fail -eq 0 ] && echo "ALL PASS" || echo "SOME FAILED"
exit $fail
