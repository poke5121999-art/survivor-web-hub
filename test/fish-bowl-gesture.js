#!/usr/bin/env node
// Level 5 shape scoring (js/gesture.js, a port of the Gesture Recognizer asset). Checks: each pattern drawn
// precisely, then sloppily (smooth wobble, wrong scale/offset, other start point on closed shapes, drawn backwards)
// reaches its own scoreToAccept; a straight line, a dot-ish scrawl, a random scribble and a zigzag reach none.
// Note the original is lenient between round shapes: a circle also passes the heart (0.87), a heart passes the circle's
// 0.6 - those pairs are printed, not asserted.   node test/fish-bowl-gesture.js
'use strict';
(async () => {
  const { PATTERNS, score } = await import('../games/fish-bowl/js/gesture.js');
  const ACCEPT = { Circle: 0.6, heart: 0.8, bolt: 0.8, loop: 0.8, Triangle: 0.8 }; // RecognizedEvents.scoreToAccept
  const ids = Object.keys(PATTERNS);
  let seed = 7;
  const r01 = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rnd = () => r01() - 0.5;
  // smooth wobble: sum of two slow sines per axis, amplitude amp (px) on a 180 px shape
  const wobble = amp => {
    const f = [0, 1, 2, 3].map(() => [1 + 3 * r01(), 6.28 * r01()]);
    return t => [amp * (Math.sin(f[0][0] * t + f[0][1]) + Math.sin(f[1][0] * 2.3 * t + f[1][1]) * 0.5),
      amp * (Math.sin(f[2][0] * t + f[2][1]) + Math.sin(f[3][0] * 2.3 * t + f[3][1]) * 0.5)];
  };
  // opts: jit (per-point px), amp (wobble px), reverse, start (0..1 start point on closed shapes), step (points per edge)
  const drawn = (id, o = {}) => {
    const p = PATTERNS[id];
    let pts = p.closed ? [...p.pts, p.pts[0]] : p.pts.slice();
    if (p.closed && o.start) { const k = Math.floor(o.start * (pts.length - 1)); pts = [...pts.slice(k, -1), ...pts.slice(0, k + 1)]; }
    const w = wobble(o.amp || 0), step = o.step || 10, out = [];
    let n = 0;
    for (let i = 1; i < pts.length; i++) for (let t = 0; t < 1; t += 1 / step, n++) {
      const [wx, wy] = w(n / 6);
      out.push([300 + 180 * (pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t) + (o.jit || 0) * rnd() + wx,
        200 + 180 * (pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t) + (o.jit || 0) * rnd() + wy]);
    }
    const last = pts[pts.length - 1];
    out.push([300 + 180 * last[0], 200 + 180 * last[1]]);
    return o.reverse ? out.reverse() : out;
  };
  const row = s => ids.map(o => `${o} ${score(o, s).toFixed(2)}`).join(', ');
  let fail = 0;
  const check = (ok, label, s, extra = '') => {
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${row(s)}${extra}`);
  };

  const cases = [
    ['precise', {}], ['precise reversed', { reverse: true }],
    ['sloppy (jitter 25)', { jit: 25 }], ['sloppy wobble 12', { amp: 12 }], ['sloppy wobble 12 reversed', { amp: 12, reverse: true }],
    ['sparse points', { step: 3, jit: 10 }], ['other start', { start: 0.4, jit: 10 }], ['other start reversed', { start: 0.7, amp: 8, reverse: true }],
  ];
  for (const id of ids) for (const [name, o] of cases) {
    const s = drawn(id, o);
    check(score(id, s) >= ACCEPT[id], `${id} ${name}`, s);
  }
  // scale / offset / aspect do not matter (NormalizeScale keeps the aspect, squashed shapes are still the shape)
  for (const id of ids) {
    const s = drawn(id, { jit: 8 }).map(([x, y]) => [x * 0.3 + 40, y * 0.3 - 500]);
    check(score(id, s) >= ACCEPT[id], `${id} small and offset`, s);
  }

  // things that must be refused by every pattern
  const refuse = (label, s, except = []) => check(ids.every(o => except.includes(o) || score(o, s) < ACCEPT[o]), `${label} refused`, s);
  refuse('straight line', Array.from({ length: 30 }, (_, i) => [i * 10, 0]));
  // the bolt is a tall thin zigzag, so by the original's formula (position x4) a vertical stroke scores 0.85 on it
  refuse('vertical line', Array.from({ length: 30 }, (_, i) => [0, i * 10]), ['bolt']);
  refuse('tiny scrawl', Array.from({ length: 6 }, () => [rnd() * 3, rnd() * 3]));
  for (let k = 0; k < 5; k++) refuse(`random scribble ${k}`, Array.from({ length: 60 }, () => [r01() * 300, r01() * 300]));
  refuse('zigzag', Array.from({ length: 20 }, (_, i) => [i * 15, i % 2 ? 0 : 60]));
  const dot = [[5, 5], [5, 5], [5, 5]];
  check(ids.every(o => score(o, dot) === 0), 'all points equal scores 0', dot);
  check(ids.every(o => score(o, [[1, 1]]) === 0), 'one point scores 0', [[1, 1]]);

  // information only: cross acceptance between the shapes
  for (const id of ids) {
    const s = drawn(id, { jit: 6 });
    console.log(`INFO ${id} also accepted by [${ids.filter(o => o !== id && score(o, s) >= ACCEPT[o])}]`);
  }
  process.exit(fail ? 1 : 0);
})();
