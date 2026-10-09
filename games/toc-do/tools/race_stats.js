#!/usr/bin/env node
// In thống kê một trận 6 bot: node games/toc-do/tools/race_stats.js [trackId] [seed]
'use strict';
const fs = require('fs');
const path = require('path');
const { nodeSim, GAME } = require('../../../test/toc-do-lib.js');

const files = ['data/tuning.js', 'data/tracks.js'];
if (fs.existsSync(path.join(GAME, 'data/cars.js'))) files.push('data/cars.js');
files.push('js/sim/rng.js', 'js/sim/track.js', 'js/sim/kart.js', 'js/sim/bot.js', 'js/sim/race.js');
const W = nodeSim(files);
const TD = W.TD;

const trackId = process.argv[2] || '11citynew';
const seed = +(process.argv[3] || 7);
const R = TD.Race.create({ trackId, seed, finishGrace: 60 });
const T = R.T;
const ev = {};
const t0 = Date.now();
while (R.phase !== 'done' && R.t < 600) {
  TD.Race.step(R, 1 / 60);
  for (const e of R.events) ev[e.type] = (ev[e.type] || 0) + 1;
  R.events.length = 0;
}
const f = (x) => (x == null ? '   -   ' : x.toFixed(2).padStart(7));
console.log(`${T.src.name} (${trackId}) — ${R.laps} vòng, seed ${seed}, line ${T.line.n} điểm, mô phỏng ${R.t.toFixed(1)} s trong ${Date.now() - t0} ms`);
console.log('hạng tên     skill  về đích  ' + Array.from({ length: R.laps }, (_, i) => ` vòng${i + 1}`).join('') + '  max km/h drift mini nitro tường hồi');
R.order.map((id) => R.karts.find((k) => k.id === id)).forEach((k) => {
  const s = k.stats;
  console.log(`${String(k.place).padStart(3)}  ${k.name.padEnd(7)} ${k.bot.skill.toFixed(2)}  ${f(k.finishT)}  ${s.lapTimes.map(f).join('')}  ${s.topKmh.toFixed(0).padStart(7)} ${String(s.drifts).padStart(5)} ${String(s.miniBoosts).padStart(4)} ${String(s.nitros).padStart(5)} ${String(s.wallHits).padStart(5)} ${String(s.respawns).padStart(4)}`);
});
console.log('sự kiện: ' + Object.keys(ev).sort().map((k) => k + '=' + ev[k]).join(' '));
