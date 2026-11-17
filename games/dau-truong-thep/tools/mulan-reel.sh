#!/bin/sh
# Hoa Mộc Lan's casts filmed for the clip comparison (tools/film.js): .chk/mulan/ml-*.png contact sheets and .chk/clips/ml-*.mp4.
#   sh tools/mulan-reel.sh [only]      only = s1 | s1b | s2 | ult | ultfull | bloom | basic
cd "$(dirname "$0")/.."
ONLY=$1
Q="mech=moclan&seed=3&bots=normal&q=high"
# the player (moclan) with three gathered foes in front that cannot die, everyone else parked; keys pressed by tick (t) windows
SETUP="const m = __G.match, u = m.units[__G.me]; const [cx, cz] = __film.gather(__G.me, GDIST); u.hp = u.maxHp = 1e6; let a = 0, f = 0; for (const o of m.units) { if (o === u) continue; if (o.team === u.team) { o.alive = false; o.respawnT = 1e9; } else if (f++ >= 3) { o.alive = false; o.respawnT = 1e9; } else { o.hp = o.maxHp = 1e6; o.brain = null; } } u.cd.s1 = u.cd.s2 = u.cd.ult = 0; let t = 0;"
# foes stand still (their bot input is replaced: they only turn toward moclan)
HOLD="for (const o of m.units) if (o.team !== u.team) o.bot = false; const box = document.createElement('div'), ck = document.createElement('span'); box.style.cssText = 'position:fixed;left:14px;top:14px;z-index:99'; ck.style.cssText = 'visibility:visible;font:bold 30px monospace;color:#ff0;background:rgba(0,0,0,.65);padding:4px 12px'; box.appendChild(ck); document.body.appendChild(box); const t0 = m.time; window.__filmUser = () => { ck.textContent = 'game t = ' + (m.time - t0).toFixed(2) + ' s'; };"
# the overlay is the game clock (a span inside a hidden box: film.js hides every body child but the canvas) since the setup: the mp4 is encoded at 30 fps with one tick per frame (every=1), so it must read the same as the video time
run() { # name frames every js [gather distance]
  case "$ONLY" in ''|"$1") ;; *) return 0 ;; esac
  GD=${5:-6}
  timeout 1500 node tools/film.js "ml-$1" "$Q" 60 "$2" "$(echo "$SETUP" | sed "s/GDIST/$GD/") $HOLD $4 __film.at(u.x + (cx - u.x) * 0.7, u.z + (cz - u.z) * 0.7, 15);" "" "$3" mulan 12 2>&1 | tail -3
}
run s1 36 1 "__input(() => { t++; return { mx: 0, mz: 0, aim: Math.atan2(cz - u.z, cx - u.x), fire: false, s1: t < 3, s2: false, ult: false, heal: false, tx: cx, tz: cz }; });"
run s1b 36 1 "__input(() => { t++; return { mx: 0, mz: 0, aim: Math.atan2(cz - u.z, cx - u.x), fire: false, s1: t < 3 || (t > 16 && t < 19), s2: false, ult: false, heal: false, tx: cx, tz: cz }; });"
run s2 54 1 "__input(() => { t++; return { mx: 0, mz: 0, aim: Math.atan2(cz - u.z, cx - u.x), fire: false, s1: false, s2: t < 3, ult: false, heal: false, tx: cx, tz: cz }; });" 3.2
run ult 60 1 "__input(() => { t++; return { mx: 0, mz: 0, aim: Math.atan2(cz - u.z, cx - u.x), fire: false, s1: false, s2: false, ult: t < 3 || (t > 40 && t < 43), heal: false, tx: cx, tz: cz }; });"
run ultfull 54 2 "__input(() => { t++; return { mx: 0, mz: 0, aim: Math.atan2(cz - u.z, cx - u.x), fire: false, s1: false, s2: false, ult: t < 3, heal: false, tx: cx, tz: cz }; });"
run basic 60 1 "__input(() => { t++; return { mx: 0, mz: 0, aim: Math.atan2(cz - u.z, cx - u.x), fire: true, s1: false, s2: false, ult: false, heal: false, tx: cx, tz: cz }; });" 4.5
