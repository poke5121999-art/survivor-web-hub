#!/usr/bin/env node
// Level 5 shape scoring: each pattern drawn by hand-ish (jittered, scaled, offset, reversed) passes its own threshold
// and does not pass the others' (except Circle, which the game accepts at a lenient 0.6: a heart passes it too).  node test/fish-bowl-gesture.js
'use strict';
(async () => {
  const { PATTERNS, score } = await import('../games/fish-bowl/js/gesture.js');
  const ACCEPT = { Circle: 0.6, heart: 0.8, bolt: 0.8, loop: 0.8, Triangle: 0.8 };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const drawn = (id, reverse) => {
    const p = PATTERNS[id];
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts.slice();
    const dense = [];
    for (let i = 1; i < pts.length; i++) for (let t = 0; t < 1; t += 0.1)
      dense.push([300 + 180 * (pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t) + 6 * rnd(), 200 + 180 * (pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t) + 6 * rnd()]);
    return reverse ? dense.reverse() : dense;
  };
  let fail = 0;
  for (const id of Object.keys(PATTERNS)) for (const rev of [false, true]) {
    const s = drawn(id, rev);
    const own = score(id, s);
    const others = Object.keys(PATTERNS).filter(o => o !== id && o !== 'Circle' && score(o, s) >= ACCEPT[o]);
    const ok = own >= ACCEPT[id] && others.length === 0;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${rev ? ' reversed' : ''}: own ${own.toFixed(2)}, also accepted by [${others}] (${Object.keys(PATTERNS).map(o => `${o} ${score(o, s).toFixed(2)}`).join(', ')})`);
  }
  const line = Array.from({ length: 30 }, (_, i) => [i * 10, 0]);
  const scribble = Object.keys(PATTERNS).filter(o => score(o, line) >= ACCEPT[o]);
  console.log(`${scribble.length ? 'FAIL' : 'PASS'} straight line accepted by [${scribble}]`);
  if (scribble.length) fail++;
  process.exit(fail ? 1 : 0);
})();
