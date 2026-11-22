// Effects seen from above. Part A: for each of the 13 heroes both skills and the ultimate, and three boss skills, at the
// peak frame at the s22 overview, before (deployed site, AST_BASE or the hub URL) and after (this tree), side by side in
// .chk/fx/<name>.png and sheet.png; reach of the vertical layer (m) read from the rendered instances, clipped white.
// Part B (live, real time, this tree): hit-stop, shake, time scale of the ultimate scene, the arena rim in frame, ground counts.
// Part C: cost at q=low on s22, stage 15, three ultimates, before and after.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/fx-shots.mjs [--only=thep,gio] [--refresh-before] [--no-bosses] [--skip-shots] [--skip-live] [--skip-perf]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, sheet, ROOT } from './pw.mjs';
import { HEROES } from '../js/data/heroes.js';
import { ARENA } from '../js/sim/battle.js';

const OUT = path.join(ROOT, '.chk', 'fx');
const TMP = path.join(OUT, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const BEFORE_BASE = (process['env'].AST_BASE || 'https://poke5121999-art.github.io/survivor-web-hub').replace(/\/$/, '');
const argv = process.argv.slice(2);
const arg = (k) => (argv.find((a) => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
const only = arg('only') ? arg('only').split(',') : null;
const REFRESH = argv.includes('--refresh-before');
const T0 = Date.now();
const { check, done } = checker();
const bad = (list) => list.filter((x) => !/Failed to load resource|favicon/.test(x));

const BOSSES = [{ id: 'giant', stage: 1, key: 'boss_slam' }, { id: 'vampire', stage: 7, key: 'blooddash' }, { id: 'dragon', stage: 20, key: 'dive' }];
const SHOT_AT = [0.15, 0.35, 0.55, 0.8, 1]; // fractions of the slot's window
const NEED = { s1: 2.5, s2: 2.5, ult: 4 };

// ---------- page side ----------
const PREP = async ([kind, id, stage, wave]) => {
  const G = window.__G;
  const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  window.__SIM = await import(new URL('js/sim/battle.js' + v, location.href).href);
  const sc = G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
  G.paused = true; G.speed = 1;
  const B = G.start(stage, { seed: 9, wave, team: kind === 'hero' ? [id] : ['thep'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } });
  if (G.juice) G.juice.enabled = false;
  const hero = B.heroes[0]; const SIM = window.__SIM;
  for (let i = 0; i < 1500 && B.phase === 'fight'; i++) {
    SIM.step(B);
    if (i < 120) continue;
    if (kind === 'boss') { const b = B.byUid.get(B.boss); if (b && b.alive && Math.hypot(b.x - hero.x, b.z - hero.z) < 7) break; }
    else if (B.enemies.filter((e) => e.alive && Math.hypot(e.x - hero.x, e.z - hero.z) < 5).length >= 3) break;
  }
  G.fx.clear(); G.actors.marks.clear(); window.__step(3);
  // baseline of every instanced mesh: only instances above their own old maximum count as effect
  window.__base = new Map();
  G.host.scene.traverse((o) => { if (o.isInstancedMesh) window.__base.set(o, maxY(o)); });
  window.__ambient = (o) => o.material && o.material.isMeshBasicMaterial && (o.material.color.getHex() === 0xb8c4dc || o.material.color.getHex() === 0xe6eef8); // drifting ash and rain wrap around, not effects
  return { phase: B.phase, boss: !!B.boss };
  function maxY(o) { let m = 0; const a = o.instanceMatrix.array; for (let i = 0; i < o.count; i++) m = Math.max(m, a[i * 16 + 13]); return m; }
};

const CAST = async ([who, slot, key]) => {
  const G = window.__G; const B = G.B; const SIM = window.__SIM; const u = who === 'hero' ? B.heroes[0] : B.byUid.get(B.boss);
  if (!u || !u.alive) return { ok: false, why: 'caster missing' };
  let seen = null; G.on((e) => { if (e.e === (slot === 'ult' ? 'ult' : 'cast') && e.uid === u.uid && (!key || e.key === key)) seen = e; });
  window.__f = 0;
  if (slot === 'ult') { u.ult = 1; u.ultReady = true; return { ok: SIM.castUlt(B, 0), why: 'castUlt' }; }
  const skill = u.skills.find((s) => (who === 'hero' ? s.slot === slot : s.def.fx === key));
  if (!skill) return { ok: false, why: 'skill not on this unit' };
  for (const s of u.skills) s.cd = s === skill ? 0 : 999;
  skill.def = { ...skill.def, when: null };
  for (let i = 0; i < 12 && !seen; i++) { u.lockT = 0; skill.cd = 0; SIM.step(B); }
  return { ok: !!seen, why: 'cast event' };
};

const FRAME = () => {
  const G = window.__G; const B = G.B;
  if (window.__f++ % 2 === 0 && B.phase === 'fight') window.__SIM.step(B);
  window.__step(1);
  let top = 0;
  const M = G.actors.marks.vertical;
  if (M) for (const k in M) for (const r of M[k]) if (r.on && r.mesh.material.opacity > 0.03) top = Math.max(top, r.kind === 'flash' ? r.mesh.position.y + r.mesh.scale.y / 2 : r.mesh.position.y + r.mesh.scale.y);
  G.host.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.visible || !o.count || window.__ambient(o)) return;
    const a = o.instanceMatrix.array; let m = 0; for (let i = 0; i < o.count; i++) m = Math.max(m, a[i * 16 + 13]);
    const b = window.__base.has(o) ? window.__base.get(o) : 0; if (m > b + 0.05) top = Math.max(top, m);
  });
  return top;
};

// ---------- node side ----------
function white(file) {
  const py = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size; px = im.load(); n = 0; wh = 0
for y in range(0, H, 3):
    for x in range(0, W, 3):
        n += 1
        if min(px[x, y]) >= 250: wh += 1
print(wh / max(1, n))`;
  return +execFileSync('python3', ['-c', py, file]).toString();
}

async function captureSet(br, base, tag, items) {
  const res = {};
  for (const it of items) {
    const r = await openPage(br, base, 's22', 'noaudio=1&seed=9');
    const { page } = r;
    try {
      for (const slot of it.slots) {
        await page.evaluate(PREP, [it.kind, it.id, it.stage, it.wave]);
        const c = await page.evaluate(CAST, [it.kind, slot.slot, slot.key]);
        if (!c.ok) { res[`${it.name}-${slot.slot}`] = { missing: c.why }; continue; }
        let peak = 0; const cands = []; const frames = Math.ceil(slot.win * 60); const shotAt = SHOT_AT.map((k) => Math.max(6, Math.round(k * frames)));
        for (let f = 1; f <= frames; f++) {
          const top = await page.evaluate(FRAME); peak = Math.max(peak, top);
          if (shotAt.includes(f)) {
            const file = path.join(TMP, `${tag}-${it.name}-${slot.slot}-${f}.png`);
            await page.locator('#frame').screenshot({ path: file }); cands.push({ f, top, file, white: white(file) });
          }
        }
        const best = cands.reduce((a, b) => (b.top > a.top ? b : a));
        const final = path.join(OUT, `${tag}-${it.name}-${slot.slot}.png`); fs.copyFileSync(best.file, final);
        res[`${it.name}-${slot.slot}`] = { peak, shotFrame: best.f, file: final, white: Math.max(...cands.map((x) => x.white)) };
      }
    } catch (e) { res[it.name] = { error: String(e && e.message).slice(0, 200) }; }
    const probs = bad(r.problems); if (probs.length) res[it.name + '-problems'] = probs.slice(0, 2);
    await r.ctx.close();
  }
  return res;
}

function items() {
  const list = HEROES.filter((h) => !only || only.includes(h.id)).map((h) => ({ kind: 'hero', id: h.id, name: h.id, stage: 3, wave: 3, slots: [['s1', h.s1], ['s2', h.s2], ['ult', h.ult]].map(([slot, d]) => ({ slot, key: d.fx, win: Math.max(0.9, 0.7 + Math.max(0, ...d.ops.map((o) => (o.delay || 0) + (o.over || 0)))) })) }));
  if (!argv.includes('--no-bosses') && !only) for (const b of BOSSES) list.push({ kind: 'boss', id: b.id, name: 'boss-' + b.id, stage: b.stage, wave: 5, slots: [{ slot: 'k', key: b.key, win: 1.8 }] });
  return list;
}

// ---------- live checks ----------
const LIVE = async ([mode, opt]) => {
  const G = window.__G; const H = G.host; const J = G.juice; const SIM = window.__SIM; const V = new H.THREE.Vector3();
  if (!J) return { noJuice: true };
  const rim = []; for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; rim.push([Math.cos(a) * opt.ax * 1.08, Math.sin(a) * opt.az * 1.08]); }
  const proj = (x, y, z) => { V.set(x, y, z).project(H.camera); return [V.x, V.y]; };
  const rimMargin = () => { let m = 9; for (const [x, z] of rim) { const [px, py] = proj(x, 0, z); m = Math.min(m, 1 - Math.abs(px), 1 - Math.abs(py)); } return m; };
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  J.reset(); J.stops.length = 0; J.scenes = 0; G.paused = false; G.speed = opt.speed || 1;
  // the camera offset is read on the camera's own look point (game.cam.focus), not on the world origin: the MCD camera (16236ae0)
  // pans after the team's centre, so a world point drifted 11 to 13 px over the 1 s shake run with the shake already back at 0
  // (camera x 0.89 -> 0.25 m with shake 0, measured); the focus rides with that pan and moves on screen only by shake and push
  const F = G.cam.focus; const fp = () => proj(F.x, F.y, F.z);
  const B = G.B; const p0 = fp(); const rows = []; const castAt = [];
  const t0 = performance.now(); let step = 0; let stallNext = false;
  const casts = opt.casts || [];
  const total = opt.secs * 1000;
  while (performance.now() - t0 < total) {
    await raf(); if (stallNext) { stallNext = false; const e = performance.now() + opt.stall; while (performance.now() < e) { /* stalled frame */ } }
    const now = performance.now() - t0;
    for (const c of casts) if (!c.done && now >= c.at) { c.done = true; castAt.push(performance.now() - t0); if (opt.stall) stallNext = true; if (c.what === 'ult') { const u = B.heroes[c.slot]; u.ult = 1; u.ultReady = true; SIM.castUlt(B, c.slot); } else if (c.what === 'kick') J.kick(c.px); else if (c.what === 'tap') window.dispatchEvent(new Event('pointerdown')); else if (c.what === 'boom') J.onEvent({ e: 'fx', team: 1, key: 'boss_slam', part: 'burst' }); }
    const p = fp();
    rows.push({ t: now, Bt: B.t, scale: J.scale, stopped: J.stopped, part: J.partial, shake: J.view.shake.px, push: J.view.push, off: Math.hypot((p[0] - p0[0]) * H.size.w / 2, (p[1] - p0[1]) * H.size.h / 2), offX: (p[0] - p0[0]) * H.size.w / 2, offY: (p[1] - p0[1]) * H.size.h / 2, margin: rimMargin() });
    step++;
  }
  G.paused = true; G.speed = 1;
  return { rows, castAt, stops: J.stops.slice(), scenes: J.scenes, last: J.lastScene };
};
const GROUND = () => {
  const G = window.__G; const s = G.actors.marks.stats(); const d = G.fx.debug();
  return { rings: s.rings, flares: s.flares, strips: s.strips, pillars: s.pillars || 0, walls: s.walls || 0, flashes: s.flashes || 0, teles: s.teles, zones: s.zones, splats: d.liveSplats, scorch: d.liveScorch };
};
const QUIET = async () => {
  const G = window.__G; const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  window.__SIM = await import(new URL('js/sim/battle.js' + v, location.href).href);
  const sc = G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
  G.start(3, { seed: 9, wave: 3, team: ['thep', 'mua', 'yta', 'gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } });
  window.__sim(6); if (G.juice) G.juice.reset(); G.paused = true;
};

function windowStats(rows, lo, hi) {
  const w = rows.map((r, i) => ({ r, i })).filter((x) => x.r.scale >= lo && x.r.scale <= hi && !x.r.stopped);
  if (!w.length) return { dur: 0, rate: NaN, ticks: 0, expect: 0 };
  const a = w[0].i; const b = w[w.length - 1].i + 1; const dur = (rows[Math.min(rows.length - 1, b)].t - rows[a].t) / 1000;
  let exp = 0; for (let i = a; i < Math.min(rows.length - 1, b); i++) exp += ((rows[i + 1].t - rows[i].t) / 1000) * rows[i].scale;
  const sim = rows[Math.min(rows.length - 1, b)].Bt - rows[a].Bt;
  return { dur, rate: sim / dur, ticks: sim * 30, expect: exp * 30, nominal: exp / dur };
}

async function live(br, base, phone) {
  const r = await openPage(br, base, phone, 'noaudio=1&seed=9'); const { page } = r;
  await page.evaluate(QUIET);
  const o = { ax: ARENA.x, az: ARENA.z };
  const run = async (opt) => { await page.evaluate(() => { window.__G.start(window.__G.stageN || 3, { seed: 9, wave: 3, team: ['thep', 'mua', 'yta', 'gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } }); window.__sim(5); }); return page.evaluate(LIVE, ['x', { ...o, ...opt }]); };
  const tag = phone;
  // one ultimate at 1x
  const u1 = await run({ secs: 2.2, casts: [{ at: 300, what: 'ult', slot: 0 }] });
  if (u1.noJuice) { check(false, `${tag}: window.__G.juice missing`); await r.ctx.close(); return; }
  const rows = u1.rows;
  // from the cast to the first frame that runs again: the sim clock stands still for all of it (the cast frame itself is a long one)
  const stop = (() => { const i = rows.findIndex((x) => x.stopped); if (i < 0) return { ms: 0, sim: 0, frames: 0 }; let j = i; while (j < rows.length && rows[j].stopped) j++; const k = Math.min(j, rows.length - 1); return { ms: rows[k].t - u1.castAt[0], sim: rows[k].Bt - rows[Math.max(0, i - 1)].Bt, frames: j - i }; })();
  // the stop the game asks for must be 40 to 80 ms; on screen it starts and ends on a frame, so it shows for up to two frames longer
  const asked = u1.stops.length ? u1.stops[u1.stops.length - 1].ms : -1;
  check(asked >= 40 && asked <= 80 && stop.ms >= 40 && stop.ms <= asked + 34, `${tag}: hit-stop on an ultimate lasts ${stop.ms.toFixed(0)} ms of real time over ${stop.frames} frames (asked 40 to 80, shown at most two 60 Hz frames longer), the sim advanced ${(stop.sim * 1000).toFixed(0)} ms inside it; ideal ${u1.stops.length ? u1.stops[u1.stops.length - 1].ms : '-'} ms`);
  // one 70 ms stalled frame right after the burst: the stop ends on the wall clock, so the sim takes no tick before the 55 ms deadline
  const us = await run({ secs: 1.2, stall: 70, casts: [{ at: 300, what: 'ult', slot: 0 }] });
  const c0 = us.castAt[0]; const ideal = us.stops.length ? us.stops[us.stops.length - 1].ms : 55;
  const ci = us.rows.findIndex((x) => x.t >= c0 - 1); const first = us.rows.slice(ci + 1).find((x) => !x.stopped && x.t - c0 >= ideal - 1) || us.rows[us.rows.length - 1];
  const prev = us.rows.slice(ci, us.rows.indexOf(first)); const simIn = (first.Bt - us.rows[ci].Bt) * 1000; const past = first.t - c0 - ideal;
  check(prev.every((x) => x.t - c0 < ideal || x.stopped) && simIn <= Math.max(0, past) + 34, `${tag}: after a 70 ms stalled frame the stop (ideal ${ideal} ms) ends on the first frame past the deadline, at ${(first.t - c0).toFixed(0)} ms; sim advanced ${simIn.toFixed(0)} ms before it was over (past the deadline ${past.toFixed(0)} ms, 1 tick allowed); 40-80 ms real is not reachable with a 70 ms frame`);
  const slow = windowStats(rows, 0.2, 0.3);
  check(slow.dur >= 0.25 && slow.dur <= 0.37 && slow.nominal >= 0.2 && slow.nominal <= 0.35, `${tag}: ultimate scene time scale ${(slow.nominal * 100).toFixed(0)}% for ${slow.dur.toFixed(3)} s (20 to 35% for 0.25 to 0.35 s, plus one frame of measuring grain); sim ticks taken ${slow.ticks.toFixed(1)} of ${slow.expect.toFixed(1)} expected (measured rate ${(slow.rate * 100).toFixed(0)}%)`);
  check(Math.abs(slow.ticks - slow.expect) <= 1.6, `${tag}: sim ticks in the slow window ${slow.ticks.toFixed(1)} vs ${slow.expect.toFixed(1)} expected from the scale (within one tick and a half)`);
  const minMargin = Math.min(...rows.map((x) => x.margin)); const maxPush = Math.max(...rows.map((x) => x.push)); const maxSh = Math.max(...rows.map((x) => x.shake));
  check(minMargin > 0, `${tag}: arena rim stays in the frame through shake, push and the ultimate scene (min margin ${(minMargin * 100).toFixed(2)}% of half the frame, push ${(maxPush * 100).toFixed(0)}% of max, shake peak ${maxSh.toFixed(2)} px)`);
  // two ultimates close together
  const u2 = await run({ secs: 3, casts: [{ at: 300, what: 'ult', slot: 0 }, { at: 560, what: 'ult', slot: 1 }] });
  const slowTotal = u2.rows.filter((x) => x.scale < 0.9).reduce((a, x, i, l) => a + (i ? (x.t - l[i - 1].t) / 1000 : 0), 0);
  check(u2.scenes === 2 && u2.last && Math.abs(u2.last.hold - 0.12) < 1e-9 && slowTotal <= 0.9, `${tag}: two ultimates 0.26 s apart: second scene hold ${u2.last && u2.last.hold} s, ${slowTotal.toFixed(2)} s below 90% speed in all (<= 0.9), hit-stops ${u2.stops.length}`);
  check(u2.stops.every((s, i, l) => !i || s.at - l[i - 1].at >= 0.35 - 1e-6), `${tag}: hit-stops at least 0.35 s apart (${u2.stops.map((s) => s.at.toFixed(2)).join(', ')})`);
  // tap skips
  const u3 = await run({ secs: 1.8, casts: [{ at: 300, what: 'ult', slot: 0 }, { at: 480, what: 'tap' }] });
  const slow3 = windowStats(u3.rows, 0.2, 0.3);
  check(slow3.dur < 0.2, `${tag}: a tap skips the scene (slow window ${slow3.dur.toFixed(3)} s, a full one is 0.3 s)`);
  // x2
  const u4 = await run({ secs: 1.8, speed: 2, casts: [{ at: 300, what: 'ult', slot: 0 }] });
  check(Math.min(...u4.rows.filter((x) => !x.stopped && !x.part).map((x) => x.scale)) >= 0.999 && Math.max(...u4.rows.map((x) => x.push)) > 0.5 && u4.stops.every((s) => s.ms <= 40), `${tag}: at x2 no slow motion (min scale outside hit-stops ${Math.min(...u4.rows.filter((x) => !x.stopped && !x.part).map((x) => x.scale)).toFixed(2)}), push kept (${Math.max(...u4.rows.map((x) => x.push)).toFixed(2)}), hit-stop ${u4.stops.map((s) => s.ms).join('/')} ms (<= 40)`);
  // shake alone: peak offset of a fixed world point
  const sh = await run({ secs: 1, casts: [{ at: 200, what: 'kick', px: 3.6 }] });
  const peak = Math.max(...sh.rows.map((x) => x.off)); const rest = sh.rows[sh.rows.length - 1].off;
  check(peak >= 1 && peak <= 6, `${tag}: shake on, camera offset peaks at ${peak.toFixed(2)} px (1 to 6), back to ${rest.toFixed(3)} px at the end`);
  const boom = await run({ secs: 1, casts: [{ at: 200, what: 'boom' }] });
  const peakB = Math.max(...boom.rows.map((x) => x.off));
  check(peakB >= 1 && peakB <= 6 && boom.stops.length === 1 && boom.stops[0].ms >= 40 && boom.stops[0].ms <= 80, `${tag}: a boss slam shakes ${peakB.toFixed(2)} px with ${boom.stops.length} hit-stop of ${boom.stops[0] ? boom.stops[0].ms : 0} ms`);
  await page.evaluate(() => window.__G.setSetting('shake', false));
  const off = await run({ secs: 1, casts: [{ at: 200, what: 'kick', px: 3.6 }, { at: 300, what: 'ult', slot: 0 }] });
  const peakOff = Math.max(...off.rows.map((x) => Math.abs(x.shake)));
  check(peakOff === 0, `${tag}: with the shake setting off the shake value is exactly ${peakOff} over ${off.rows.length} frames`);
  await page.evaluate(() => { window.__G.setSetting('shake', true); window.__G.setSetting('reduceFlash', true); });
  const rf = await run({ secs: 1, casts: [{ at: 200, what: 'kick', px: 3.6 }] });
  check(Math.max(...rf.rows.map((x) => x.shake)) === 0, `${tag}: reduceFlash also turns the shake off`);
  await page.evaluate(() => window.__G.setSetting('reduceFlash', false));
  // __sim fast-forward: no hit-stop and no scene
  const ff = await page.evaluate(() => { const G = window.__G; G.start(3, { seed: 9, wave: 3, team: ['thep', 'mua', 'yta', 'gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: true, pick: 'best' } }); G.juice.reset(); const n0 = G.juice.stops.length; const s0 = G.juice.scenes; for (const u of G.B.heroes) { u.ult = 1; u.ultReady = true; u.ultReadyT = -99; } window.__sim(12); return { stops: G.juice.stops.length - n0, scenes: G.juice.scenes - s0, ults: G.B.heroes.reduce((a, u) => a + (u.ults || 0), 0), scale: G.juice.scale }; });
  check(ff.ults > 0 && ff.stops === 0 && ff.scenes === 0 && ff.scale === 1, `${tag}: __sim(12) with ${ff.ults} ultimates cast takes ${ff.stops} hit-stops and ${ff.scenes} scenes`);
  // ground effects return to baseline after the last cast
  const gr = await page.evaluate(async () => {
    const G = window.__G; G.juice.enabled = false; const SIM = window.__SIM;
    G.start(3, { seed: 9, wave: 3, team: ['thep', 'mua', 'yta', 'gio'], hpFlat: 90000, atkFlat: 0, mul: 0.5, auto: { ult: false, pick: 'best' } }); window.__sim(4);
    for (const e of G.B.enemies) e.hp = 0; for (let i = 0; i < 40; i++) SIM.step(G.B); for (let i = 0; i < 240; i++) window.__step(1); // quiet
    const g = () => { const s = G.actors.marks.stats(); const d = G.fx.debug(); return s.rings + s.flares + s.strips + (s.pillars || 0) + (s.walls || 0) + (s.flashes || 0); };
    const base = g(); const B = G.B;
    for (const [i, u] of B.heroes.entries()) { u.ult = 1; u.ultReady = true; SIM.castUlt(B, i); }
    let peak = 0; for (let i = 0; i < 60; i++) { if (i % 2 === 0 && B.phase === 'fight') SIM.step(B); window.__step(1); peak = Math.max(peak, g()); }
    for (let i = 0; i < 180; i++) { if (i % 2 === 0 && B.phase === 'fight') SIM.step(B); window.__step(1); }
    return { base, peak, after: g() };
  });
  check(gr.after <= gr.base + 1, `${tag}: ground and vertical effects ${gr.base} before, ${gr.peak} at the peak of four ultimates, ${gr.after} three seconds after the last cast`);
  check(bad(r.problems).length === 0, `${tag}: no console problems ${bad(r.problems).slice(0, 2).join(' | ')}`);
  await r.ctx.close();
}

// ---------- cost ----------
const PERF = async () => {
  const G = window.__G; const H = G.host; const SIM = window.__SIM;
  G.start(15, { seed: 15, wave: 5, team: ['thep', 'mua', 'yta', 'gio'], hpFlat: 400000, atkFlat: 0, mul: 0.3, auto: { ult: false, pick: 'best' } });
  window.__sim(20); G.paused = false; G.speed = 1;
  const render = H.render; let cpu = 0; let calls = 0; H.render = (o) => { const t = performance.now(); render(o); cpu += performance.now() - t; calls++; };
  const raf = () => new Promise((r) => requestAnimationFrame(r)); const B = G.B;
  const ults = [0, 1, 2].map((i) => ({ at: 400 + i * 700, i, done: false }));
  const t0 = performance.now(); let maxDraws = 0; let drawSum = 0; let n = 0; const dts = []; let prev = t0;
  while (performance.now() - t0 < 6000) {
    await raf(); const now = performance.now(); dts.push(now - prev); prev = now;
    for (const c of ults) if (!c.done && now - t0 >= c.at) { c.done = true; const u = B.heroes[c.i]; u.ult = 1; u.ultReady = true; SIM.castUlt(B, c.i); }
    if (now - t0 > 300) { maxDraws = Math.max(maxDraws, window.__stats.draws); drawSum += window.__stats.draws; n++; }
  }
  H.render = render; G.paused = true;
  const mean = dts.slice(2).reduce((a, x) => a + x, 0) / (dts.length - 2);
  return { maxDraws, meanDraws: drawSum / n, frameMs: window.__stats.frameMs, meanFrame: mean, renderCpu: cpu / calls, frames: calls, scale: window.__stats.scale };
};
async function perf(br, base) {
  const out = [];
  for (let k = 0; k < 2; k++) {
    const r = await openPage(br, base, 's22', 'noaudio=1&seed=15&q=low'); const { page } = r;
    await page.evaluate(QUIET); out.push(await page.evaluate(PERF)); await r.ctx.close();
  }
  const m = (f) => out.reduce((a, x) => a + x[f], 0) / out.length;
  return { maxDraws: Math.max(...out.map((x) => x.maxDraws)), meanDraws: m('meanDraws'), frameMs: m('frameMs'), meanFrame: m('meanFrame'), renderCpu: m('renderCpu'), runs: out };
}

// ---------- main ----------
const srv = await serve();
const br = await launch();
try {
  if (!argv.includes('--skip-shots')) {
    const list = items();
    const after = await captureSet(br, srv.base, 'after', list);
    console.log(`after captured (${Math.round((Date.now() - T0) / 1000)} s)`);
    const bj = path.join(OUT, 'before.json'); let before = {};
    const cached = !REFRESH && fs.existsSync(bj) ? JSON.parse(fs.readFileSync(bj, 'utf8')) : {};
    const need = list.filter((it) => it.slots.some((s) => !cached[`${it.name}-${s.slot}`] || !fs.existsSync(cached[`${it.name}-${s.slot}`].file || '/none')));
    if (need.length) { const got = await captureSet(br, BEFORE_BASE, 'before', need); before = { ...cached, ...got }; fs.writeFileSync(bj, JSON.stringify(before)); } else before = cached;
    console.log('hero/boss, slot: reach before -> after (m), clipped white before -> after');
    const pairs = [];
    for (const it of list) {
      const files = [];
      for (const s of it.slots) {
        const a = after[`${it.name}-${s.slot}`]; const b = before[`${it.name}-${s.slot}`] || {};
        if (!a || a.error || a.missing) { check(false, `${it.name} ${s.slot}: capture failed (${a && (a.error || a.missing)})`); continue; }
        const need = it.kind === 'boss' ? NEED.s1 : NEED[s.slot];
        const bossNeed = it.kind === 'boss' ? 2.5 : need;
        console.log(`  ${it.name} ${s.slot} (${s.key}): reach ${b.peak !== undefined ? b.peak.toFixed(1) : '-'} -> ${a.peak.toFixed(1)}; white ${b.white !== undefined ? (b.white * 100).toFixed(2) : '-'}% -> ${(a.white * 100).toFixed(2)}%; shot frame ${b.shotFrame || '-'} / ${a.shotFrame}`);
        check(a.peak >= bossNeed, `${it.name} ${s.slot} (${s.key}): vertical layer reaches ${a.peak.toFixed(1)} m at its peak (>= ${bossNeed} m)`);
        check(a.white < 0.01, `${it.name} ${s.slot} (${s.key}): clipped white ${(a.white * 100).toFixed(2)}% at every captured frame (< 1%)`);
        if (b.file && fs.existsSync(b.file)) files.push(b.file, a.file); else files.push(a.file, a.file);
      }
      if (files.length) { const out = path.join(OUT, it.name + '.png'); const cols = it.slots.length; const ord = []; for (let k = 0; k < cols; k++) ord.push(files[k * 2]); for (let k = 0; k < cols; k++) ord.push(files[k * 2 + 1]); if (ord.length === cols * 2) { sheet(ord, out, cols, 330); pairs.push(out); } }
    }
    if (pairs.length > 1) { sheet(pairs, path.join(OUT, 'sheet.png'), 4, 540); console.log('sheet: ' + path.join(OUT, 'sheet.png') + ' (each tile: top row before, bottom row after; columns skill 1, skill 2, ultimate)'); }
  }
  if (!argv.includes('--skip-live')) {
    for (const phone of ['s22', 'xiaomi']) await live(br, srv.base, phone);
    console.log(`live checks done (${Math.round((Date.now() - T0) / 1000)} s)`);
  }
  if (!argv.includes('--skip-perf')) {
    const a = await perf(br, srv.base); const b = await perf(br, BEFORE_BASE);
    console.log(`cost at q=low on s22, stage 15 boss wave, three ultimates in 6 s:\n  before: draws max ${b.maxDraws} mean ${b.meanDraws.toFixed(1)}, frame interval ${b.meanFrame.toFixed(2)} ms, frameMs ${b.frameMs.toFixed(2)}, render() cpu ${b.renderCpu.toFixed(2)} ms\n  after:  draws max ${a.maxDraws} mean ${a.meanDraws.toFixed(1)}, frame interval ${a.meanFrame.toFixed(2)} ms, frameMs ${a.frameMs.toFixed(2)}, render() cpu ${a.renderCpu.toFixed(2)} ms`);
    check(a.meanFrame <= b.meanFrame * 1.15 && a.renderCpu <= Math.max(b.renderCpu * 1.15, b.renderCpu + 0.3), `mean frame interval ${a.meanFrame.toFixed(2)} ms after vs ${b.meanFrame.toFixed(2)} ms before (<= +15%), render cpu ${a.renderCpu.toFixed(2)} vs ${b.renderCpu.toFixed(2)} ms`);
  }
} finally {
  await br.close(); srv.close();
}
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
