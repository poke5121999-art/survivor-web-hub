#!/usr/bin/env node
/* Stickman Hook (games/stickman-hook): a bot plays every level on the game's own physics, headless.
 * Proves the ported rules (spring rope, grapple reel, bumpers, finish line, camera-edge deaths) keep the original levels
 * beatable. Normal: the 64 hand-made levels plus SH_RANDOM random levels from 65 on. Mechanical Grapple: its 41 levels
 * plus SH_GRAPPLE_RANDOM random ones (GrapplePlayer). Challenge: 30 levels. Easter and Valentine's Day: 5 levels each.
 * Race (Tournament): the 21 maps, each from all 5 start slots (SH_RACE_SLOTS=one: map n from slot (n - 1) % 5 only).
 * The bot is a beam search over hooks: from each kept state it tries SH_TRY (grab distance, release point) pairs
 * for the next swing, keeps the SH_BEAM states that got furthest alive, and repeats until one crosses the finish.
 * SH_PICK=13,24 runs only those level numbers of each mode.
 * Adventure: the endless run (js/advrun.js) on 3 fixed weekly seeds with every skill at level 0 (a new player), a beam
 * search over swings that has to reach SH_ADV_GOAL metres (500: the end of the road's every-25-m stretch) before the
 * firewall or a fall ends the run. Plus the decoded rules: Unity Random, the spawner's seeds, skill values, upgrade cost.
 *   node test/stickman-hook-sim.js   SH_MODES=normal,grapple,challenge,easter_event,valentine_day,race,adventure
 *                                    SH_LEVELS=1-64 SH_RANDOM=30 SH_GRAPPLE_RANDOM=10 SH_BEAM=10 SH_TRY=14
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME = path.join(__dirname, '..', 'games', 'stickman-hook');
const RANDOM = +(process.env.SH_RANDOM ?? 30);
const BEAM = +(process.env.SH_BEAM || 10);
const TRY = +(process.env.SH_TRY || 14);
const GRAPPLE_RANDOM = +(process.env.SH_GRAPPLE_RANDOM ?? 10);
const [L0, L1] = (process.env.SH_LEVELS || '1-64').split('-').map(Number);
const PICK = process.env.SH_PICK ? process.env.SH_PICK.split(',').map(Number) : null; // only these level numbers
const ONLY = (process.env.SH_MODES || 'normal,grapple,challenge,easter_event,valentine_day,race,adventure').split(',');
const ADV_GOAL = +(process.env.SH_ADV_GOAL || 500);
const RACE_ONE = process.env.SH_RACE_SLOTS === 'one';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

(async () => {
  const { buildLevel, patternNames, NetRandom, modeData } = await import(pathToFileURL(path.join(GAME, 'js/level.js')));
  const { Player, PHYS } = await import(pathToFileURL(path.join(GAME, 'js/physics.js')));
  const { GrapplePlayer } = await import(pathToFileURL(path.join(GAME, 'js/grapple.js')));
  const { forwardFocus, deathLimits } = await import(pathToFileURL(path.join(GAME, 'js/camera.js')));
  const json = (f) => JSON.parse(fs.readFileSync(path.join(GAME, 'data', f), 'utf8'));
  const data = json('levels.json');
  let pass = 0, fail = 0;
  const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

  const r = new NetRandom(12345);
  check('System.Random(12345).Next(100) x3 = 6 7 77 (.NET reference)', [r.next(100), r.next(100), r.next(100)].join(' ') === '6 7 77');
  check('level 65 = STARTU005+MIDDLE006+FINISH05', patternNames(data, 64).join('+') === 'STARTU005+MIDDLE006+FINISH05');

  const dt = PHYS.fixedDt;
  const ASPECT = 9 / 16; // portrait phone: the narrowest camera, so the strictest left-edge death
  const halfW = ASPECT * 5;
  // CameraLimitsBottom / Left as in main.js (camera.js deathLimits; the camera y stays 0)
  const DEATH = deathLimits(ASPECT, PHYS.radius);
  check('CameraLimits at 9:16: the player (r 0.1125) dies 6.695 below / 5.853 left of the camera centre (frame edges 5 / 2.8125)',
    Math.abs(DEATH.bottom + 6.6953125) < 1e-6 && Math.abs(DEATH.left + 5.853125) < 1e-6, JSON.stringify(DEATH));
  const clone = (p) => Object.assign(Object.create(Object.getPrototypeOf(p)), p);

  // Runs one swing from a free-flying state: wait until the nearest target ahead is within `gate`, hold, release
  // `reach` rope lengths past it while moving forward and up (or, for a negative `reach`, after -reach seconds while
  // moving forward, which is how you leave a target ringed by a wall), then fly until the next grab would start.
  // Mirrors main.js: camera x = player x + ForwardFocus influence (js/camera.js), clamped to the camera bounds; y fixed
  // at 0; edge exits kill.
  // A grapple hook lets go by itself near the target (auto release), which the bot treats as its release.
  // `wait` (s) and `back` are the extra moves Challenge needs: fall onto a bumper first, or hook a target behind
  // (several Challenge starts put the first target behind the spawn or below a bumper chute).
  function swing(world, node, gate, reach, wait = 0, back = false) {
    const p = clone(node.p);
    let { camX, t } = node;
    const ff = { ...node.ff };
    const clamp = (x) => { const lo = world.camMin + halfW, hi = world.camMax - halfW; return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, x)); };
    let phase = 0, hold = false, hookedAt = -1, releasedAt = -1;
    for (let n = 0; n < 12 / dt; n++) {
      if (phase === 0) {
        p.updateClosest(world);
        const tg = world.targets[p.closest];
        if (tg && (back || tg.x > p.x - 0.3) && tg.x - p.x < gate && t - node.releasedAt > 0.1 && t - node.t >= wait) {
          hold = true; phase = 1; hookedAt = t;
        }
      } else if (phase === 1 && p.hooked < 0 && t > hookedAt) {
        hold = false; phase = 2; releasedAt = t;
      } else if (phase === 1 && p.hooked >= 0) {
        const tg = world.targets[p.hooked];
        const past = reach >= 0 ? p.x > tg.x + reach * Math.max(1, p.rest) && p.vy > -0.5 : t - hookedAt > -reach;
        if ((past && p.vx > 0) || t - hookedAt > 6) {
          hold = false; phase = 2; releasedAt = t;
        }
      } else if (phase === 2 && t - releasedAt > 0.25) {
        p.updateClosest(world);
        const tg = world.targets[p.closest];
        if (!tg || tg.x > p.x - 0.3 || t - releasedAt > 4) return { p, camX, ff, t, releasedAt, x: p.x };
      }
      const ev = p.step(dt, world, hold);
      t += dt;
      if (ev.finished) return { done: true, t };
      camX = clamp(p.x + forwardFocus(ff, p.vx, 2 * halfW, dt));
      if (p.hooked < 0 && (p.y < DEATH.bottom || p.x < camX + DEATH.left)) return null;
    }
    return null;
  }

  function solve(world, seed, P, explore, BEAM_ = BEAM, TRY_ = TRY) {
    const rand = rng(seed);
    const p0 = new P(world.spawn);
    const clamp0 = Math.min(world.camMax - halfW, Math.max(world.camMin + halfW, world.spawn.x));
    let beam = [{ p: p0, camX: clamp0, ff: { h: 0, v: 0 }, t: 0, releasedAt: -1, x: p0.x }];
    let best = p0.x;
    for (let depth = 0; depth < 60 && beam.length; depth++) {
      const next = [];
      const tries = Math.ceil((TRY_ * BEAM_) / beam.length); // same budget per depth, so a lone start state gets many tries
      for (const node of beam) {
        for (let k = 0; k < tries; k++) {
          const reach = k % 3 === 2 ? -(0.2 + rand() * 3) : rand() * 0.8 - 0.15; // negative: release after that many seconds
          const res = explore && k % 4 === 3
            ? swing(world, node, 0.3 + rand() * 12, reach, rand() * 1.5, rand() < 0.5)
            : swing(world, node, 0.3 + rand() * (k % 2 ? 4 : 12), reach);
          if (!res) continue;
          if (res.done) return { ok: true, t: res.t, depth: depth + 1 };
          next.push(res);
        }
      }
      next.sort((a, b) => b.x - a.x);
      beam = [];
      for (const n of next) { if (beam.length >= BEAM_) break; if (!beam.some((b) => Math.abs(b.x - n.x) < 0.05)) beam.push(n); }
      if (beam.length) best = Math.max(best, beam[0].x);
    }
    return { ok: false, best };
  }

  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const random = (from, n) => Array.from({ length: n }, (_, i) => from + i * 7);
  const grapple = modeData(data, json('mode-grapple.json'), 'mode.grapple');
  const challenge = modeData(data, json('mode-challenge.json'), 'mode.challenge');
  const seasonal = json('mode-seasonal.json');
  const raceFile = json('mode-race.json');
  const race = modeData(data, raceFile, 'mode.tournament');
  const runs = {
    normal: ['level', data, Player, [...range(L0, L1), ...random(65, RANDOM)]],
    grapple: ['grapple', grapple, GrapplePlayer, [...range(1, grapple.levels.length), ...random(grapple.levels.length + 1, GRAPPLE_RANDOM)]],
    challenge: ['challenge', challenge, Player, range(1, challenge.levels.length), true],
    easter_event: ['easter', modeData(data, seasonal, 'mode.easter_event'), Player, range(1, 5), true],
    valentine_day: ['valentine', modeData(data, seasonal, 'mode.valentine_day'), Player, range(1, 5), true],
    race: ['race', race, Player, range(1, race.levels.length), true],
  };
  // a race map starts from the slot "Spawn" + (slot > 0 ? slot : "") of its first pattern
  const raceSlots = (n) => (RACE_ONE ? [(n - 1) % 5] : [0, 1, 2, 3, 4]);
  check('grapple level 1 = Solo5, 41 fixed levels', grapple.levels.length === 41 && grapple.levels[0].join() === 'Solo5');
  check('challenge has 30 levels of 3 patterns', challenge.levels.length === 30 && challenge.levels.every((l) => l.length === 3));
  check('race has 21 maps, map 2 = STARTUPRace01+MIDDLE020+FINISH03, 5 start slots each', race.levels.length === 21
    && race.levels[1].join('+') === 'STARTUPRace01+MIDDLE020+FINISH03'
    && race.levels.every((l) => race.patterns[l[0]].spawns?.length === 5));
  if (ONLY.includes('adventure')) await adventure(check, json);
  for (const id of ONLY) {
    if (id === 'adventure') continue;
    const [label, d, P, levels, explore] = runs[id];
    for (const n of levels) {
      if (PICK && !PICK.includes(n)) continue;
      for (const slot of id === 'race' ? raceSlots(n) : [null]) {
        const world = buildLevel(d, n - 1);
        if (slot !== null) { const sp = d.patterns[world.names[0]].spawns[slot]; world.spawn = { x: sp[0], y: sp[1] }; }
        let res = solve(world, n * 7919, P, explore);
        // Challenge levels are puzzles (bumper chutes, forced bounces): a failed search retries with 2x, then 3x the
        // beam and tries
        for (let k = 2; !res.ok && explore && k <= 3; k++) res = solve(world, n * 7919, P, explore, BEAM * k, TRY * k);
        check(`${label} ${n}${slot !== null ? ' slot ' + slot : ''} (${world.names.join('+')}) can be finished`, res.ok,
          res.ok ? `${res.depth} swings, ${res.t.toFixed(1)} s` : `got to x ${res.best.toFixed(1)} of finish ${world.finishX.toFixed(1)}`);
      }
    }
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

// ---- Adventure (js/advrun.js) ----------------------------------------------------------------------------------------
async function adventure(check, json) {
  const GAME_ = path.join(__dirname, '..', 'games', 'stickman-hook');
  const A = await import(pathToFileURL(path.join(GAME_, 'js/advrun.js')));
  const { upgradeCost } = await import(pathToFileURL(path.join(GAME_, 'js/adventure.js')));
  const data = json('mode-adventure.json');
  const dt = 0.02;
  const S = A.skillDefs(data);
  const u = new A.URandom(1);
  check('Unity Random (libunity Xorshift128): InitState(1) -> next 3690984874, 2346916618; value 0.99968469; Range(0,10) 0.0031531; Range(0,10) int 4',
    u.next() === 3690984874 && u.next() === 2346916618 && new A.URandom(1).value() === Math.fround(0.9996846914291382)
    && new A.URandom(1).range(0, 10) === Math.fround(0.003153085708618164) && new A.URandom(1).rangeInt(0, 10) === 4);
  check('8 tiers of 1/20/30/83/123/145/168/189 patterns, raised at pattern 0/1/10/25/35/55/65/80', data.tiers.map((t) => t.length).join() === '1,20,30,83,123,145,168,189'
    && data.cfg.inc.join() === '0,1,10,25,35,55,65,80');
  const r = new A.AdvRun(data, { seed: 1792800, levels: {} });
  while (r.spawned.length < 12) r.load();
  check('seed 1792800: patterns from System.Random(seed + index) filtered by the previous exit', r.spawned.map((s) => s.name).join('|')
    === 'INITIAL000|NEWMIDDLE (34)|NewEasyMid (4)|NewEasyLow (1)|NewEasyLow (2)|NewEasyLow (1)|NewEasyLow (2)|NewEasyLow (1)|NEWMIDDLE (25)|NewEasyLow (2)|NEWMIDDLE (25)|NewEasyLow (2)');
  check('seed 1792800: a DOWN zone on pattern 11 at x 160.834, a portal on pattern 10 at (141.55, 0.57); target and bumper types',
    r.spawned.map((s, i) => (s.zone ? i + ':' + s.zone.type + '@' + s.zone.x.toFixed(3) : '')).join('') === '11:1@160.834'
    && r.spawned.map((s, i) => (s.portal ? i + '@' + s.portal.x.toFixed(2) + ',' + s.portal.y.toFixed(2) : '')).join('') === '10@141.55,0.57'
    && r.spawned.slice(0, 4).map((s) => s.targets.map((t) => t.type + (t.mv ? 'd' + t.dir : '')).join('')).join('|') === '00|3d00|121203d2|43d1111'
    && r.spawned.slice(0, 4).map((s) => s.bumpers.map((b) => b.type).join('')).join('|') === '1|23|033|200242');
  const rope5 = A.skillValue(data, S.rope_length, 5, 0), rope20 = A.skillValue(data, S.rope_length, 20, 1000);
  check('skill values: rope lvl 0 / 5 / 20@1000 m = 3 / 8.5825 / 5.52 m, firewall lvl 3 = x0.55912, level max 20 + 80 (card)',
    A.skillValue(data, S.rope_length, 0, 0) === 3 && rope5.toFixed(4) === '8.5825' && rope20.toFixed(2) === '5.52'
    && A.skillValue(data, S.firewall_difficulty, 3, 0).toFixed(5) === '0.55912' && S.rope_length.top === 100, [rope5, rope20].join(' '));
  const lv = (n) => ({ inv: Object.fromEntries(A.SKILL_IDS.map((id, i) => ['progression_adventure_skill_level.' + id, i === 0 ? n : 0])) });
  check('upgrade cost = 100 + 10 * floor(total levels / 10): 100 at 9, 110 at 10, 120 at 25', upgradeCost(data, lv(9)) === 100
    && upgradeCost(data, lv(10)) === 110 && upgradeCost(data, lv(25)) === 120);
  {
    // portal: kinematic at 20 u/s, then the exit velocity (14.7087, 2.94174) and alpha 1
    const q = new A.AdvRun(data, { seed: 1792810, levels: {}, aspect: 9 / 16 }), o = q.spawned[0].portal, p = q.player;
    Object.assign(p, { x: o.x - 0.5, y: o.y, vx: 3, vy: 0, age: 5 });
    let n = 0, sawTele = false, exit = null;
    for (; n < 400 && !exit; n++) {
      q.fixed(dt, false);
      const was = !!p.tele;
      sawTele ||= was;
      q.update(dt);
      if (was && !p.tele) exit = [p.x, p.y, p.vx, p.vy, p.alpha];
    }
    const d = sawTele && exit ? Math.hypot(exit[0] - (o.x - 0.5), exit[1] - o.y) : 0;
    check('portal: teleport flies at 20 u/s, leaves with velocity (14.7087, 2.94174), alpha back to 1', !!exit && exit[2] === 14.7087
      && exit[3] === 2.94174 && exit[4] === 1 && Math.abs(n * dt - d / 20) < 0.1, JSON.stringify({ exit, steps: n, d }));
    // firewall: waits 3 s after the first grab, rubber band 30 m behind, speed 0.1 + 0.05 * t * skill (skill 1 at level 0)
    const f = new A.AdvRun(data, { seed: 1792800, levels: {}, aspect: 9 / 16 });
    f.fire.moving = true;
    Object.assign(f.player, { x: 100, y: 0 });
    f.updateFire(2.9);
    const before = f.fire.x;
    f.updateFire(0.2);
    check('firewall: idle for 3 s, then pulled to 30 m behind (x 70) and speeding up by 0.05 * dt', before === 0 && Math.abs(f.fire.x - (70 + Math.fround(0.1 + 0.01) * 0.2)) < 1e-6
      && Math.abs(f.fire.speed - 0.11) < 1e-6, JSON.stringify(f.fire));
  }

  // the bot: beam search over swings on fixed weekly seeds, skills at level 0
  const rng = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  function cloneRun(o) {
    const c = Object.create(Object.getPrototypeOf(o));
    Object.assign(c, o);
    c.U = new A.URandom(); c.U.s.set(o.U.s);
    const map = new Map();
    c.spawned = o.spawned.map((s) => {
      const n = { ...s, targets: s.targets.map((t) => { const v = { ...t, mv: t.mv && { ...t.mv } }; map.set(t, v); return v; }),
        bumpers: s.bumpers.map((b) => ({ ...b })), zone: s.zone && { ...s.zone } };
      n.portal = s.portal && { ...s.portal, inst: n };
      return n;
    });
    c.fire = { ...o.fire }; c.cam = { ...o.cam }; c.events = [...o.events];
    const p = Object.assign(Object.create(Object.getPrototypeOf(o.player)), o.player);
    p.run = c; p.eg = [...o.player.eg]; p.tele = o.player.tele && { ...o.player.tele };
    const hooked = o.player.hooked >= 0 ? map.get(o.world.targets[o.player.hooked]) : null;
    const closest = o.player.closest >= 0 ? map.get(o.world.targets[o.player.closest]) : null;
    c.player = null; c.world = { targets: [], bumpers: [], caps: [], polys: [], finishX: Infinity };
    c.rebuild();
    p.hooked = hooked ? c.world.targets.indexOf(hooked) : -1;
    p.closest = closest ? c.world.targets.indexOf(closest) : -1;
    c.player = p;
    return c;
  }
  // one swing: wait for a target ahead within the rope, hold (grab on hold), let go `reach` past it or after -reach s
  function swing(node, gate, reach, wait) {
    const run = cloneRun(node.r), p = run.player;
    let phase = 0, hold = false, hookedAt = -1, releasedAt = -1, t = 0;
    for (let n = 0; n < 10 / dt; n++) {
      if (phase === 0) {
        const tg = run.world.targets[p.closest];
        if (!p.tele && tg && tg.x > p.x - 0.3 && tg.x - p.x < gate && t >= wait) { hold = true; phase = 1; hookedAt = t; }
      } else if (phase === 1 && p.hooked < 0 && t > hookedAt + 0.6) {
        hold = false; phase = 2; releasedAt = t;
      } else if (phase === 1 && p.hooked >= 0) {
        const tg = run.world.targets[p.hooked];
        const past = reach >= 0 ? p.x > tg.x + reach * Math.max(1, p.rest) && p.vy > -0.5 : t - hookedAt > -reach;
        if ((past && p.vx > 0) || t - hookedAt > 5) { hold = false; phase = 2; releasedAt = t; }
      } else if (phase === 2 && t - releasedAt > 0.15) {
        const tg = run.world.targets[p.closest];
        if ((tg && tg.x > p.x - 0.3) || t - releasedAt > 3) return { r: run, x: p.x };
      }
      run.fixed(dt, hold);
      run.update(dt);
      t += dt;
      if (run.dead) return null;
    }
    return null;
  }
  const levels = Object.fromEntries(A.SKILL_IDS.map((id) => [id, 0]));
  // Leaderboard.Seed of three Monday-midnight (UTC+7) weeks: (int)(low 32 bits of the start ms) / 1000
  const weeks = [Date.UTC(2026, 9, 25, 17), Date.UTC(2026, 10, 1, 17), Date.UTC(2026, 10, 8, 17)];
  for (const ms of weeks) {
    const seed = Math.trunc((ms | 0) / 1000), rand = rng(seed);
    let beam = [{ r: new A.AdvRun(data, { seed, levels, aspect: 9 / 16 }) }], best = 0, res = null;
    for (let depth = 0; depth < 400 && beam.length && !res; depth++) {
      const next = [], tries = Math.ceil((12 * 8) / beam.length);
      for (const node of beam) for (let k = 0; k < tries; k++) {
        const reach = k % 3 === 2 ? -(0.15 + rand() * 1.5) : rand() * 0.8 - 0.2;
        const s = swing(node, 0.2 + rand() * 4, reach, k % 4 === 3 ? rand() * 0.6 : 0);
        if (s) next.push(s);
      }
      next.sort((a, b) => b.r.distance - a.r.distance || b.x - a.x);
      beam = [];
      for (const n of next) { if (beam.length >= 8) break; if (!beam.some((b) => Math.abs(b.x - n.x) < 0.05)) beam.push(n); }
      if (beam.length) best = Math.max(best, beam[0].r.distance);
      if (best >= ADV_GOAL) res = beam[0].r;
    }
    const tele = res ? res.events.filter((e) => e.type === 'tele').length : 0;
    check(`adventure week seed ${seed}: a new player (skills 0, rope 3 m) reaches ${ADV_GOAL} m ahead of the firewall`, !!res,
      res ? `${res.distance} m in ${res.time.toFixed(1)} s, tier ${res.tier()}, ${tele} teleports, firewall ${(res.player.x - res.fire.x).toFixed(1)} m behind at ${res.fire.speed.toFixed(2)} m/s`
        : `best ${best} m`);
  }
}
