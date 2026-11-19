// The whole fight inside the visible frame. Plays stages 1, 3, 8, 15 and 24 to the end of the boss wave in the real page
// (s22 and xiaomi), and records the projected screen position, through the game's own camera, of every enemy spawn, every
// enemy death, every hero attack target and (each 0.5 s) the living boss. Asserts the shares inside the frame and between
// the HUD bands, and that the arena rim's eight compass points project between the bands at several frame aspects.
// The same measurement runs on the previous build (deployed site) once, is cached in .chk/inframe/before.json
// (--refresh-before re-runs it) and is printed side by side. Screenshots before and after at the same moments go to
// .chk/inframe/ with a side-by-side sheet.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/inframe-test.mjs [--refresh-before] [--no-shots] [--stages=3,8]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, checker, sheet, ROOT } from './pw.mjs';
import { ARENA } from '../js/sim/battle.js';

const OUT = path.join(ROOT, '.chk', 'inframe');
fs.mkdirSync(OUT, { recursive: true });
const BEFORE_JSON = path.join(OUT, 'before.json');
const BEFORE_BASE = (process['env'].AST_BEFORE || 'https://poke5121999-art.github.io/survivor-web-hub').replace(/\/$/, '');
const argv = process.argv.slice(2);
const REFRESH = argv.includes('--refresh-before');
const SHOTS = !argv.includes('--no-shots');
const stArg = (argv.find((a) => a.startsWith('--stages=')) || '').slice(9);
const STAGES = stArg ? stArg.split(',').map(Number) : [1, 3, 8, 15, 24];
const PHONES = ['s22', 'xiaomi'];
const TOP_PX = 90; const BOT_PX = 170;       // the HUD bands, design px
const SIM_STEP = 0.5; const SIM_LIMIT = 900; // seconds of game time per stage
const T0 = Date.now();
const { check, done } = checker();

// installed in the page: records every spawn, enemy death, hero attack target and boss sample with its projected position
const RECORDER = () => {
  const G = window.__G; const H = G.host; const V = new H.THREE.Vector3();
  window.__rec = [];
  window.__proj = (x, y, z) => {
    V.set(x, y, z).project(H.camera); const u = H.size.u || 1; const fy = (1 - V.y) / 2; const fx = (V.x + 1) / 2;
    const py = fy * H.size.h / u;
    const inFrame = V.z < 1 && fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1;
    return { fx, fy, py, inFrame, inBands: inFrame && py >= 90 && py <= H.size.h / u - 170 };
  };
  const push = (k, x, z, extra) => { const B = G.B; window.__rec.push({ k, wave: B.wave, ...window.__proj(x, 1.0, z), ...extra }); };
  G.on((e) => {
    const B = G.B; if (!B) return;
    if (e.e === 'spawn') push('spawn', e.x, e.z, { boss: !!e.boss });
    else if (e.e === 'die' && !e.expire) { const u = B.byUid.get(e.uid); if (u && u.team === 1 && !u.summon) push('die', e.x, e.z, { boss: !!e.boss }); }
    else if (e.e === 'attack') { const u = B.byUid.get(e.uid); if (u && u.hero && e.tx !== undefined) push('atk', e.tx, e.tz, { ranged: e.kind !== 'melee' }); }
  });
};

// runs the battle to its end in 0.5 s slices, sampling the boss after each slice; returns the last phase and wave
const RUN = ([limit, step]) => {
  const G = window.__G; const B = G.B; let t = 0;
  while (t < limit && (B.phase === 'fight' || B.phase === 'pick')) {
    window.__sim(step); t += step;
    const bu = B.boss ? B.byUid.get(B.boss) : null;
    if (bu && bu.alive) window.__rec.push({ k: 'boss', wave: B.wave, ...window.__proj(bu.x, 1.0, bu.z) });
  }
  return { phase: B.phase, wave: B.wave, t };
};

const pct = (a, b) => (b ? (100 * a) / b : NaN);
function summarise(rec, boss) {
  const sel = (k, f) => rec.filter((r) => r.k === k && (!f || f(r)));
  const share = (list, key) => ({ n: list.length, pct: pct(list.filter((r) => r[key]).length, list.length) });
  const w = boss ? (r) => r.wave === boss : null;
  const die = sel('die', w); const atk = sel('atk', (r) => r.ranged && (!w || w(r))); const sp = sel('spawn', w); const bs = sel('boss', w);
  return { spawn: share(sp, 'inFrame'), dieFrame: share(die, 'inFrame'), dieBands: share(die, 'inBands'), atk: share(atk, 'inFrame'), boss: share(bs, 'inFrame') };
}

async function measureStage(br, base, phone, stage, rimK, dims) {
  const r = await openPage(br, base, phone, `autostart=1&stage=${stage}&autoult=1&autopick=1&noaudio=1&seed=${stage}`);
  const { page } = r;
  await page.evaluate(RECORDER);
  const end = await page.evaluate(RUN, [SIM_LIMIT, SIM_STEP]);
  let bossWave = 5;
  let recs = await page.evaluate(() => window.__rec);
  if (!recs.some((x) => x.k === 'boss')) { // the team fell before the boss wave: play the boss wave on its own
    await page.evaluate(([n]) => { window.__G.start(n, { seed: n, wave: 5, auto: { ult: true, pick: 'best' } }); }, [stage]);
    const e2 = await page.evaluate(RUN, [SIM_LIMIT, SIM_STEP]); end.boss = e2;
    recs = await page.evaluate(() => window.__rec);
  }
  const hero = await page.evaluate(() => {
    const G = window.__G; const H = G.host; const a = new H.THREE.Vector3(); const b = new H.THREE.Vector3(); const out = [];
    if (!G.B) return out;
    for (const u of G.B.heroes) { const n = G.actors.nodeOf(u.uid); if (!n) continue; a.set(n.position.x, 0, n.position.z).project(H.camera); b.set(n.position.x, 2.7, n.position.z).project(H.camera); out.push(Math.abs(b.y - a.y) / 2 * H.size.h / (H.size.u || 1)); }
    return out;
  });
  const compass = await page.evaluate(([ax, az, k]) => {
    const out = [];
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const p = window.__proj(Math.cos(a) * ax * k, 0, Math.sin(a) * az * k); out.push({ a: i * 45, fx: +p.fx.toFixed(3), py: +p.py.toFixed(1), inBands: p.inBands }); }
    return out;
  }, [dims.x, dims.z, rimK]);
  const problems = r.problems.filter((x) => !/Failed to load resource/.test(x));
  const errs = await page.evaluate(() => (window.__errors || []).length);
  await r.ctx.close();
  return { stage, end, all: summarise(recs), boss: summarise(recs, bossWave), compass, hero, problems, errs, counts: { spawn: recs.filter((x) => x.k === 'spawn').length, die: recs.filter((x) => x.k === 'die').length } };
}

// the camera at other frame shapes: swap the frame size under the camera, project the compass points, restore
const ASPECTS = [[360, 780], [360, 702], [360, 640], [461, 1002], [369, 800]];
async function aspectCompass(br, base, dims, rimK) {
  const r = await openPage(br, base, 's22', 'autostart=1&stage=3&noaudio=1&seed=3');
  const out = await r.page.evaluate(async ([sizes, ax, az, k]) => {
    const G = window.__G; const H = G.host; const V = new H.THREE.Vector3(); const keep = { w: H.size.w, h: H.size.h, u: H.size.u }; const res = [];
    for (const [w, h] of sizes) {
      H.size.w = w; H.size.h = h; H.size.u = w / 360; for (let i = 0; i < 3; i++) G.cam.update(G.B, 1 / 30);
      let ok = true; let minPy = 1e9; let maxPy = -1e9; let maxFx = 0;
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8; V.set(Math.cos(a) * ax * k, 0, Math.sin(a) * az * k).project(H.camera);
        const py = (1 - V.y) / 2 * h / (w / 360); const fx = (V.x + 1) / 2; minPy = Math.min(minPy, py); maxPy = Math.max(maxPy, py); maxFx = Math.max(maxFx, Math.abs(fx - 0.5));
        if (py < 90 || py > h / (w / 360) - 170 || fx < 0 || fx > 1) ok = false;
      }
      res.push({ w, h, ok, minPy: +minPy.toFixed(1), maxPy: +maxPy.toFixed(1), halfW: +(maxFx * w).toFixed(1) });
    }
    H.size.w = keep.w; H.size.h = keep.h; H.size.u = keep.u; for (let i = 0; i < 3; i++) G.cam.update(G.B, 1 / 30);
    return res;
  }, [ASPECTS, dims.x, dims.z, rimK]);
  await r.ctx.close();
  return out;
}

const MOMENTS = [['w1', 1, 4], ['w3', 3, 20], ['boss', 5, 7]];
async function shots(br, base, tag) {
  const files = {};
  for (const stage of [3, 8]) for (const [name, wave, secs] of MOMENTS) {
    const r = await openPage(br, base, 's22', `autostart=1&stage=${stage}&wave=${wave}&autoult=1&autopick=1&noaudio=1&seed=${stage}`);
    await r.page.evaluate((s) => window.__sim(s), secs); await r.page.evaluate(() => window.__step(4));
    const f = path.join(OUT, `${tag}-s${stage}-${name}.png`); await r.page.locator('#frame').screenshot({ path: f });
    files[`${stage}-${name}`] = f; await r.ctx.close();
  }
  return files;
}

const fmt = (x) => (Number.isNaN(x) ? '  -  ' : x.toFixed(0).padStart(3) + '%');
function line(label, b, a, key) {
  const f = (o) => (o ? `${fmt(o.pct)} (${String(o.n).padStart(3)})` : '   n/a     ');
  return `${label.padEnd(26)} before ${f(b && b[key])}   after ${f(a && a[key])}`;
}

const srv = await serve();
const br = await launch();
try {
  // ---- after: this tree ----
  const after = {};
  for (const phone of PHONES) {
    after[phone] = {};
    for (const s of STAGES) { after[phone][s] = await measureStage(br, srv.base, phone, s, 1.08, ARENA); console.log(`measured ${phone} stage ${s} (${Math.round((Date.now() - T0) / 1000)} s): ${JSON.stringify(after[phone][s].end)}`); }
  }
  // ---- before: the deployed build, s22 only, cached ----
  let before = null;
  if (!REFRESH && fs.existsSync(BEFORE_JSON)) before = JSON.parse(fs.readFileSync(BEFORE_JSON, 'utf8'));
  if (!before || STAGES.some((s) => !before.s22[s])) {
    before = { s22: {}, base: BEFORE_BASE, at: new Date().toISOString() };
    for (const s of STAGES) { before.s22[s] = await measureStage(br, BEFORE_BASE, 's22', s, 1.0, { x: 14, z: 14 }); console.log(`measured before s22 stage ${s}: ${JSON.stringify(before.s22[s].end)}`); }
    fs.writeFileSync(BEFORE_JSON, JSON.stringify(before));
  }

  // ---- the table ----
  console.log(`\nbefore = ${before.base} (${before.at}), after = this tree\n`);
  for (const phone of PHONES) {
    console.log(`== ${phone} ==`);
    for (const s of STAGES) {
      const A = after[phone][s]; const Bf = phone === 's22' ? before.s22[s] : null;
      console.log(`stage ${s}: after ended ${A.end.phase} at wave ${A.end.wave}, ${A.counts.spawn} spawns, ${A.counts.die} deaths${A.end.boss ? ' (boss wave replayed alone)' : ''}`);
      for (const [lab, key] of [['spawns in frame', 'spawn'], ['deaths in frame', 'dieFrame'], ['deaths between bands', 'dieBands'], ['ranged attack targets in frame', 'atk'], ['boss alive in frame', 'boss']]) {
        console.log('  ' + line(lab, Bf && Bf.all, A.all, key));
        console.log('  ' + line('  boss wave only', Bf && Bf.boss, A.boss, key));
      }
    }
  }

  // ---- assertions on this tree ----
  for (const phone of PHONES) {
    const bossAgg = { die: 0, dieIn: 0, dieBand: 0 };
    for (const s of STAGES) {
      const A = after[phone][s]; const a = A.all;
      check(a.spawn.n > 0 && a.spawn.pct === 100, `${phone} stage ${s}: spawns inside the frame ${a.spawn.pct.toFixed(1)}% of ${a.spawn.n} (= 100%)`);
      check(a.dieFrame.n > 0 && a.dieFrame.pct >= 95, `${phone} stage ${s}: enemy deaths inside the frame ${a.dieFrame.pct.toFixed(1)}% of ${a.dieFrame.n} (>= 95%)`);
      check(a.dieBands.pct >= 95, `${phone} stage ${s}: enemy deaths between the HUD bands ${a.dieBands.pct.toFixed(1)}% (>= 95%)`);
      check(a.atk.n === 0 || a.atk.pct >= 98, `${phone} stage ${s}: ranged hero attack targets inside the frame ${a.atk.pct.toFixed(1)}% of ${a.atk.n} (>= 98%)`);
      check(a.boss.n > 0 && a.boss.pct >= 95, `${phone} stage ${s}: boss inside the frame ${a.boss.pct.toFixed(1)}% of ${a.boss.n} samples (>= 95%)`);
      check(A.compass.every((c) => c.inBands), `${phone} stage ${s}: eight rim compass points between the bands (py ${A.compass.map((c) => c.py).join(' ')})`);
      check(A.problems.length === 0 && A.errs === 0, `${phone} stage ${s}: no console problems or __errors ${A.problems.slice(0, 2).join(' | ')}`);
      bossAgg.die += A.boss.dieFrame.n; bossAgg.dieIn += A.boss.dieFrame.n * A.boss.dieFrame.pct / 100; bossAgg.dieBand += A.boss.dieBands.n * A.boss.dieBands.pct / 100;
    }
    check(bossAgg.die > 0 && bossAgg.dieIn / bossAgg.die >= 0.95 && bossAgg.dieBand / bossAgg.die >= 0.95, `${phone} boss waves alone: ${bossAgg.die} deaths, ${pct(bossAgg.dieIn, bossAgg.die).toFixed(1)}% in frame, ${pct(bossAgg.dieBand, bossAgg.die).toFixed(1)}% between bands (>= 95%)`);
  }
  const hs = after.s22[STAGES.includes(3) ? 3 : STAGES[0]].hero;
  if (hs.length) console.log(`hero on-screen height at s22, end of stage ${STAGES.includes(3) ? 3 : STAGES[0]}: min ${Math.min(...hs).toFixed(1)} max ${Math.max(...hs).toFixed(1)} CSS px`);

  const asp = await aspectCompass(br, srv.base, ARENA, 1.08);
  for (const a of asp) check(a.ok, `frame ${a.w}x${a.h}: rim at 1.08 projects between the bands (py ${a.minPy}..${a.maxPy}, half width ${a.halfW} of ${a.w / 2})`);
  const dk = await openPage(br, srv.base, 'desktop', 'autostart=1&stage=3&noaudio=1&seed=3');
  await dk.page.evaluate(RECORDER);
  const dc = await dk.page.evaluate(([ax, az]) => { const o = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; o.push(window.__proj(Math.cos(a) * ax * 1.08, 0, Math.sin(a) * az * 1.08)); } return o; }, [ARENA.x, ARENA.z]);
  check(dc.every((c) => c.inBands), `desktop frame: eight rim compass points between the bands (py ${dc.map((c) => c.py.toFixed(0)).join(' ')})`);
  await dk.ctx.close();

  // ---- screenshots, before and after at the same moments ----
  if (SHOTS) {
    const sa = await shots(br, srv.base, 'after'); const sb = await shots(br, BEFORE_BASE, 'before');
    const list = []; for (const k of Object.keys(sa)) list.push(sb[k], sa[k]);
    sheet(list, path.join(OUT, 'sheet-before-after.png'), 6, 300);
    console.log('sheet: ' + path.join(OUT, 'sheet-before-after.png') + ' (columns: before, after for wave 1, wave 3, boss; rows: stage 3, stage 8)');
  }
} finally {
  await br.close(); srv.close();
}
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
