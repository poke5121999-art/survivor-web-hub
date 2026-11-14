#!/bin/sh
# The VFX review reel: films the scripted moments with tools/film.js into .chk/<dir>/ (contact sheets) and .chk/clips/.
#   sh tools/fxreel.sh <dir> [q=high] [only]      e.g. sh tools/fxreel.sh after high tower-fall
set -e
cd "$(dirname "$0")/.."
DIR=${1:-after}; Q=${2:-high}; ONLY=$3
F="spectate&seed=3&bots=hard&q=$Q"
run() { # name query start frames js [every]
  case "$ONLY" in ''|"$1") ;; *) return 0 ;; esac
  timeout 300 node tools/film.js "$1-$Q" "$2" "$3" "$4" "$5" "" "${6:-1}" "$DIR" | tail -1
}
run fight "$F" 1500 60 "__film.hot(26)"
run death "$F" 1500 45 "const m = __G.match; let v = null, bd = 1e9; for (const u of m.units) if (u.alive) { const f = __film.nearestFoe(u.id); const d = f ? Math.hypot(f.x - u.x, f.z - u.z) : 1e9; if (d < bd) { bd = d; v = u; } } __film.at(v.x, v.z, 22); __filmUser = (i) => { if (i === 3) __film.kill(v.id); };"
run death-close "$F" 1500 36 "const m = __G.match; let v = null, bd = 1e9; for (const u of m.units) if (u.alive) { const f = __film.nearestFoe(u.id); const d = f ? Math.hypot(f.x - u.x, f.z - u.z) : 1e9; if (d < bd) { bd = d; v = u; } } __film.at(v.x, v.z, 13); __filmUser = (i) => { if (i === 1) __film.kill(v.id); };"
run respawn "$F" 1500 45 "const m = __G.match, u = m.units.find(u => u.alive); __film.kill(u.id); __step(2, false); const p = m.map.spawns[u.team][u.slot % 5]; u.respawnT = 0.15; __film.at(p[0], p[1], 20);"
run tower-fire "mode=nha&$F" 200 75 "const m = __G.match, t = m.towers.find(t => t.team === 0 && t.kind === 'sub'), foes = m.units.filter(u => u.team === 1).slice(0, 2); foes.forEach((u, k) => { u.x = u.px = t.x + 8; u.z = u.pz = t.z + (k ? 2 : -2); }); __film.at(t.x + 4, t.z, 24);"
run tower-fall "mode=nha&$F" 200 75 "const m = __G.match, t = m.towers.find(t => t.team === 0 && t.kind === 'sub'), f = m.units.find(u => u.team === 1); t.hp = 1; __film.at(t.x, t.z, 22); __filmUser = (i) => { if (i === 4) __film.shootAt(f.id, t.x, t.z, 50); };"
run tower-main "mode=nha&$F" 200 30 "const m = __G.match, t = m.towers.find(t => t.team === 0 && t.kind === 'main'); __film.at(t.x + 5, t.z, 34);"
run tower-damaged "mode=nha&$F" 200 30 "const m = __G.match; m.towers.forEach(t => { if (t.team === 0) t.hp = t.kind === 'main' ? t.maxHp * 0.2 : t.maxHp * 0.45; }); const t = m.towers.find(t => t.team === 0 && t.kind === 'main'); __film.at(t.x + 5, t.z, 34);"
for M in trau soi ung hac loi bocap bang tho; do
  run "ult-$M" "mech=$M&seed=3&bots=normal&q=$Q" 60 60 "__film.ult(28)"
done
