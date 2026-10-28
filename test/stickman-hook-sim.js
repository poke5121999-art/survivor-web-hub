#!/usr/bin/env node
/* Stickman Hook (games/stickman-hook): a bot plays every level on the game's own physics, headless.
 * Proves the ported rules (spring rope, bumpers, finish line, camera-edge deaths) keep the original levels beatable:
 * the 64 hand-made levels plus SH_RANDOM random levels from 65 on must all be finished.
 * The bot is a beam search over hooks: from each kept state it tries SH_TRY (grab distance, release point) pairs
 * for the next swing, keeps the SH_BEAM states that got furthest alive, and repeats until one crosses the finish.
 *   node test/stickman-hook-sim.js            SH_LEVELS=1-64 SH_RANDOM=30 SH_BEAM=10 SH_TRY=14
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME = path.join(__dirname, '..', 'games', 'stickman-hook');
const RANDOM = +(process.env.SH_RANDOM ?? 30);
const BEAM = +(process.env.SH_BEAM || 10);
const TRY = +(process.env.SH_TRY || 14);
const [L0, L1] = (process.env.SH_LEVELS || '1-64').split('-').map(Number);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

(async () => {
  const { buildLevel, patternNames, NetRandom } = await import(pathToFileURL(path.join(GAME, 'js/level.js')));
  const { Player, PHYS } = await import(pathToFileURL(path.join(GAME, 'js/physics.js')));
  const data = JSON.parse(fs.readFileSync(path.join(GAME, 'data/levels.json'), 'utf8'));
  let pass = 0, fail = 0;
  const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

  const r = new NetRandom(12345);
  check('System.Random(12345).Next(100) x3 = 6 7 77 (.NET reference)', [r.next(100), r.next(100), r.next(100)].join(' ') === '6 7 77');
  check('level 65 = STARTU005+MIDDLE006+FINISH05', patternNames(data, 64).join('+') === 'STARTU005+MIDDLE006+FINISH05');

  const dt = PHYS.fixedDt;
  const ASPECT = 9 / 16; // portrait phone: the narrowest camera, so the strictest left-edge death
  const halfW = ASPECT * 5;
  const clone = (p) => Object.assign(Object.create(Object.getPrototypeOf(p)), p);

  // Runs one swing from a free-flying state: wait until the nearest target ahead is within `gate`, hold, release
  // `reach` rope lengths past it while moving forward and up (or, for a negative `reach`, after -reach seconds while
  // moving forward, which is how you leave a target ringed by a wall), then fly until the next grab would start.
  // Mirrors main.js: camera x follows with lead, clamped to the camera bounds; y fixed at 0; edge exits kill.
  function swing(world, node, gate, reach) {
    const p = clone(node.p);
    let { camX, t } = node;
    const clamp = (x) => { const lo = world.camMin + halfW, hi = world.camMax - halfW; return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, x)); };
    let phase = 0, hold = false, hookedAt = -1, releasedAt = -1;
    for (let n = 0; n < 12 / dt; n++) {
      if (phase === 0) {
        p.updateClosest(world);
        const tg = world.targets[p.closest];
        if (tg && tg.x > p.x - 0.3 && tg.x - p.x < gate && t - node.releasedAt > 0.1) { hold = true; phase = 1; hookedAt = t; }
      } else if (phase === 1 && p.hooked >= 0) {
        const tg = world.targets[p.hooked];
        const past = reach >= 0 ? p.x > tg.x + reach * Math.max(1, p.rest) && p.vy > -0.5 : t - hookedAt > -reach;
        if ((past && p.vx > 0) || t - hookedAt > 6) {
          hold = false; phase = 2; releasedAt = t;
        }
      } else if (phase === 2 && t - releasedAt > 0.25) {
        p.updateClosest(world);
        const tg = world.targets[p.closest];
        if (!tg || tg.x > p.x - 0.3 || t - releasedAt > 4) return { p, camX, t, releasedAt, x: p.x };
      }
      const ev = p.step(dt, world, hold);
      t += dt;
      if (ev.finished) return { done: true, t };
      camX += (clamp(p.x + Math.max(-1.2, Math.min(1.2, p.vx * 0.2))) - camX) * Math.min(1, dt * 6);
      if (p.hooked < 0 && (p.y < -5.3 || p.x < camX - halfW - 0.3)) return null;
    }
    return null;
  }

  function solve(world, seed) {
    const rand = rng(seed);
    const p0 = new Player(world.spawn);
    const clamp0 = Math.min(world.camMax - halfW, Math.max(world.camMin + halfW, world.spawn.x));
    let beam = [{ p: p0, camX: clamp0, t: 0, releasedAt: -1, x: p0.x }];
    let best = p0.x;
    for (let depth = 0; depth < 60 && beam.length; depth++) {
      const next = [];
      const tries = Math.ceil((TRY * BEAM) / beam.length); // same budget per depth, so a lone start state gets many tries
      for (const node of beam) {
        for (let k = 0; k < tries; k++) {
          const reach = k % 3 === 2 ? -(0.2 + rand() * 3) : rand() * 0.8 - 0.15; // negative: release after that many seconds
          const res = swing(world, node, 0.3 + rand() * (k % 2 ? 4 : 12), reach);
          if (!res) continue;
          if (res.done) return { ok: true, t: res.t, depth: depth + 1 };
          next.push(res);
        }
      }
      next.sort((a, b) => b.x - a.x);
      beam = [];
      for (const n of next) { if (beam.length >= BEAM) break; if (!beam.some((b) => Math.abs(b.x - n.x) < 0.05)) beam.push(n); }
      if (beam.length) best = Math.max(best, beam[0].x);
    }
    return { ok: false, best };
  }

  const levels = [];
  for (let i = L0; i <= L1; i++) levels.push(i);
  for (let i = 0; i < RANDOM; i++) levels.push(65 + i * 7);
  for (const n of levels) {
    const world = buildLevel(data, n - 1);
    const res = solve(world, n * 7919);
    check(`level ${n} (${world.names.join('+')}) can be finished`, res.ok,
      res.ok ? `${res.depth} swings, ${res.t.toFixed(1)} s` : `got to x ${res.best.toFixed(1)} of finish ${world.finishX.toFixed(1)}`);
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
