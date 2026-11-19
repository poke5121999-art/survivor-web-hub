#!/bin/sh
# Runs every tool and prints one line per tool; full logs go to .chk/gate/. Exit 1 when any tool fails.
# Usage: sh games/ai-sinh-ton/tools/all.sh            (local)
#        AST_BASE=https://poke5121999-art.github.io/survivor-web-hub sh games/ai-sinh-ton/tools/all.sh   (deployed)
cd "$(dirname "$0")/.." || exit 1
OUT=../../.chk/gate; mkdir -p "$OUT"
: "${PLAYWRIGHT_PATH:=$HOME/.cache/pw-node/node_modules/playwright-core}"; export PLAYWRIGHT_PATH
bad=0
run() {
  name=$1; shift
  if timeout 900 "$@" > "$OUT/$name.log" 2>&1; then echo "PASS $name ($(grep -c '^PASS' "$OUT/$name.log") checks)"; else echo "FAIL $name: $(grep -m3 -E '^FAIL|Error|  - ' "$OUT/$name.log" | tr '\n' ' ' | cut -c1-300)"; bad=1; fi
}
if [ -z "$AST_BASE" ]; then
  run port-bz node tools/port-bz.mjs --check
  run ladder node tools/ladder.mjs
  run economy node tools/economy.mjs
  run sim-test node tools/sim-test.mjs
  run meta-test node tools/meta-test.mjs
  run pacing node tools/pacing.mjs 5 60
fi
for t in smoke battle-test meta-ui-test ftue-test view-shots floor-shots ui-shots; do
  [ -f "tools/$t.mjs" ] && run "$t" node "tools/$t.mjs"
done
[ "$bad" = 0 ] && echo "GATE: ALL PASS" || echo "GATE: FAILED"
exit $bad
