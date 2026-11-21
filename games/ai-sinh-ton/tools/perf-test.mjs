// The cost of the most crowded moment of a stage. For each quality tier, phone and stage: finds the 0.5 s slice with the
// most living enemies (stage N, seed N, automatic ultimates, best card: the same peak horde-test uses), replays to it on
// the HUD, then plays 240 real frames from there (sim at 30 Hz, view every frame) and times each frame's work with
// performance.now(): the sim step, actors.sync, the rest of the update, render(). Headless Chrome locks frame intervals at
// 16.7 ms, so intervals are not measured. Also reads draw calls, triangles, visible meshes, JS heap, live geometries,
// textures and programs.
// Prints a table and writes .chk/perf/<label>.json (default label "after"; --label=before for the baseline).
// --shots saves the stage 15 q=low xiaomi peak as .chk/perf/<label>-s15-xiaomi.png.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/perf-test.mjs [--label=before] [--stages=1,8,15,25]
//        [--q=low,medium] [--phones=xiaomi,s22] [--frames=240] [--shots] [--budget]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'perf');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const LABEL = arg('label', 'after');
const STAGES = arg('stages', '1,8,15,25').split(',').map(Number);
const QS = arg('q', 'low,medium').split(',');
const PHONES = arg('phones', 'xiaomi,s22').split(',');
const FRAMES = +arg('frames', '240');
const SHOTS = argv.includes('--shots');
const BUDGET = argv.includes('--budget');
const T0 = Date.now();
const { check, done } = checker();

const FIND = ([n, limit]) => {
  const G = window.__G; G.start(n, { seed: n, auto: { ult: true, pick: 'best' } }); const B = G.B;
  let best = { n: 0, ticks: 0 }; let ticks = 0;
  while (ticks * 0.5 < limit && (B.phase === 'fight' || B.phase === 'pick')) {
    window.__sim(0.5); ticks++;
    const k = B.enemies.filter((e) => e.alive).length; if (k > best.n) best = { n: k, ticks };
  }
  return best;
};

const RUN = async ([n, ticks, frames]) => {
  const G = window.__G; const H = G.host; const A = G.actors;
  const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  const SIM = await import(new URL('js/sim/battle.js' + v, location.href).href);
  G.start(n, { seed: n, auto: { ult: true, pick: 'best' } }); G.goto('hud', { stage: n });
  for (let i = 0; i < ticks; i++) window.__sim(0.5);
  G.paused = true; window.__step(20);
  const B = G.B; const living0 = B.enemies.filter((e) => e.alive).length;
  const meshes = () => { let k = 0; H.scene.traverseVisible((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) k++; }); return k; };
  const at = { living: living0, draws: window.__stats.draws, tris: window.__stats.tris, meshes: meshes() };

  const t = { sync: 0, render: 0 };
  const sync = A.sync; const render = H.render;
  A.sync = (...a) => { const s = performance.now(); const r = sync.apply(A, a); t.sync += performance.now() - s; return r; };
  H.render = (o) => { const s = performance.now(); render(o); t.render += performance.now() - s; };
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const rows = []; let acc = 0; let drawMax = 0; let drawSum = 0; let triSum = 0; let livingSum = 0;
  for (let f = 0; f < frames + 10; f++) {
    await raf();
    t.sync = 0; t.render = 0;
    const s0 = performance.now();
    acc += 1 / 60; let simMs = 0;
    while (acc >= SIM.DT && B.phase === 'fight') { const a = performance.now(); SIM.step(B); simMs += performance.now() - a; acc -= SIM.DT; }
    window.__step(1);
    const total = performance.now() - s0;
    if (f >= 10) {
      rows.push({ total, sim: simMs, sync: t.sync, render: t.render });
      drawMax = Math.max(drawMax, window.__stats.draws); drawSum += window.__stats.draws; triSum += window.__stats.tris; livingSum += B.enemies.filter((e) => e.alive).length;
    }
  }
  A.sync = sync; H.render = render;
  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const tot = rows.map((r) => r.total).sort((a, b) => a - b);
  const info = H.renderer.info;
  return {
    at, frames: rows.length,
    cpu: { mean: mean('total'), p50: tot[Math.floor(tot.length / 2)], p95: tot[Math.floor(tot.length * 0.95)], sim: mean('sim'), sync: mean('sync'), render: mean('render'), other: mean('total') - mean('sim') - mean('sync') - mean('render') },
    run: { drawMax, drawMean: drawSum / rows.length, trisMean: triSum / rows.length, livingMean: livingSum / rows.length },
    heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
    geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : 0,
    horde: G.actors.horde ? G.actors.horde.cost() : null, phase: B.phase,
  };
};

const srv = await serve(); const br = await launch();
const out = { label: LABEL, at: new Date().toISOString(), frames: FRAMES, rows: [] };
try {
  const peaks = {};
  for (const s of STAGES) {
    const r = await openPage(br, srv.base, 's22', `autostart=1&stage=${s}&autoult=1&autopick=1&noaudio=1&seed=${s}&q=low`);
    peaks[s] = await r.page.evaluate(FIND, [s, 420]); await r.ctx.close();
    console.log(`stage ${s}: peak ${peaks[s].n} alive at ${peaks[s].ticks * 0.5} s (${Math.round((Date.now() - T0) / 1000)} s)`);
  }
  for (const q of QS) for (const phone of PHONES) for (const s of STAGES) {
    const r = await openPage(br, srv.base, phone, `autostart=1&stage=${s}&autoult=1&autopick=1&noaudio=1&seed=${s}&q=${q}`);
    const m = await r.page.evaluate(RUN, [s, peaks[s].ticks, FRAMES]);
    if (SHOTS && s === 15 && q === 'low' && phone === 'xiaomi') {
      await r.page.evaluate(() => { const G = window.__G; G.start(15, { seed: 15, auto: { ult: true, pick: 'best' } }); G.goto('hud', { stage: 15 }); });
      await r.page.evaluate((ticks) => { for (let i = 0; i < ticks; i++) window.__sim(0.5); window.__G.paused = true; window.__step(20); }, peaks[s].ticks);
      const f = path.join(OUT, `${LABEL}-s15-xiaomi.png`); await r.page.locator('#frame').screenshot({ path: f }); m.shot = f;
    }
    const problems = r.problems.filter((x) => !/Failed to load resource/.test(x));
    await r.ctx.close();
    const row = { q, phone, stage: s, peak: peaks[s].n, ...m, problems };
    out.rows.push(row);
    console.log(`${q.padEnd(6)} ${phone.padEnd(6)} s${String(s).padEnd(3)} alive ${m.at.living} draws ${m.at.draws} tris ${m.at.tris} meshes ${m.at.meshes} cpu ${m.cpu.mean.toFixed(2)} ms (p95 ${m.cpu.p95.toFixed(2)})`);
  }
  fs.writeFileSync(path.join(OUT, LABEL + '.json'), JSON.stringify(out, null, 1));
} finally {
  await br.close(); srv.close();
}

const f2 = (x) => x.toFixed(2).padStart(6);
console.log(`\n${LABEL}: ${FRAMES} frames from each peak, CPU ms per frame (mean / p95), split sim + actors.sync + render + rest`);
console.log('q      phone  stage alive | draws  tris    meshes | cpu mean   p95 |   sim   sync render   rest | heapMB geo tex prog');
for (const r of out.rows) {
  console.log(`${r.q.padEnd(6)} ${r.phone.padEnd(6)} ${String(r.stage).padStart(5)} ${String(r.at.living).padStart(5)} | ${String(r.at.draws).padStart(5)} ${String(r.at.tris).padStart(7)} ${String(r.at.meshes).padStart(6)} | ${f2(r.cpu.mean)} ${f2(r.cpu.p95)} | ${f2(r.cpu.sim)} ${f2(r.cpu.sync)} ${f2(r.cpu.render)} ${f2(r.cpu.other)} | ${r.heapMB.toFixed(1).padStart(6)} ${String(r.geometries).padStart(3)} ${String(r.textures).padStart(3)} ${String(r.programs).padStart(4)}`);
}
console.log('saved ' + path.join(OUT, LABEL + '.json'));
for (const r of out.rows) check(r.problems.length === 0, `${r.q} ${r.phone} stage ${r.stage}: no console problems ${r.problems.slice(0, 2).join(' | ')}`);
if (BUDGET) {
  const b = out.rows.find((r) => r.q === 'low' && r.phone === 'xiaomi' && r.stage === 15);
  if (b) {
    check(b.run.drawMax <= 250, `stage 15 q=low xiaomi: draw calls at most ${b.run.drawMax} over ${b.frames} frames (<= 250)`);
    check(b.cpu.mean < 8, `stage 15 q=low xiaomi: CPU ${b.cpu.mean.toFixed(2)} ms per frame (< 8)`);
  }
}
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
