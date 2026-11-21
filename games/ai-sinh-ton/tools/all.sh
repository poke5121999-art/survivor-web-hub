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
  if timeout "${TMO:-900}" "$@" > "$OUT/$name.log" 2>&1; then echo "PASS $name ($(grep -c '^PASS' "$OUT/$name.log") checks)"; else echo "FAIL $name: $(grep -m3 -E '^FAIL|Error|  - ' "$OUT/$name.log" | tr '\n' ' ' | cut -c1-300)"; bad=1; fi
}
if [ -z "$AST_BASE" ]; then
  run port-bz node tools/port-bz.mjs --check
  run ladder node tools/ladder.mjs
  run economy node tools/economy.mjs
  run sim-test node tools/sim-test.mjs
  run meta-test node tools/meta-test.mjs
  run pacing node tools/pacing.mjs 5 60
  run journey node tools/journey.mjs 5 30 260
fi
for t in smoke battle-test inframe-test fx-leak-test horde-test fx-shots grip-shots gio-shots boss-test stats-test meta-ui-test equip-test campaign-test ftue-test account-test orient-test view-shots floor-shots text-fit-test ui-shots; do
  # floor-shots compares against a local extract of the old Blockade Z, which is not on the deployed site
  [ -n "$AST_BASE" ] && [ "$t" = floor-shots ] && continue
  # text-fit-test walks every screen at three sizes: about 15 minutes alone, longer when it waits for a Chrome slot
  TMO=900; [ "$t" = text-fit-test ] && TMO=2700
  [ -f "tools/$t.mjs" ] && run "$t" node "tools/$t.mjs"
done
[ "$bad" = 0 ] && echo "GATE: ALL PASS" || echo "GATE: FAILED"
exit $bad
