// Capture collapse sequences through the test hook: spawn, shoot intact, blast the base, then a dense sequence.
// usage: node tools/capture.mjs <what> [--gpu] [--quality=med]   what = buildings | mobs | <id>[,<id>...]
import { withLab } from './serve.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const what = process.argv[2] || 'buildings', gpu = process.argv.includes('--gpu');
const quality = (process.argv.find(a => a.startsWith('--quality=')) || '--quality=med').split('=')[1];
const FRAMES = 11, STEPS = 30; // 11 frames, 0.5 s apart = 5 s
await withLab(async (page, logs) => {
  const ids = await page.evaluate(() => ({ b: [...__lab.buildings, ...__lab.props], m: __lab.mobIds }));
  const list = what === 'buildings' ? ids.b.filter(i => !['tree', 'lamp-post', 'fence'].includes(i)) : what === 'mobs' ? ids.m : what.split(',');
  const report = {};
  for (const id of list) {
    const isMob = ids.m.includes(id), dir = `shots/${id}`; mkdirSync(dir, { recursive: true });
    const info = await page.evaluate(([id, isMob]) => {
      const L = __lab; const info = L.spawn(id, 1);
      if (isMob) { L.step(20); L.setCamera(info.x - 2.6, info.y + 1.9, info.z - 4.2, info.x, info.y + 1.1, info.z); }
      else { const s = Math.max(info.sx, info.sz), d = Math.max(s * 1.05, info.sy * 1.15) + 5; L.setCamera(info.x - d * 0.55, 1.7 + info.sy * 0.25, info.z - d * 0.95, info.x, info.y + info.sy * 0.42, info.z); }
      L.settle(); return info;
    }, [id, isMob]);
    await page.screenshot({ path: `${dir}/f00_intact.png` });
    const stats = [];
    // the destruction
    await page.evaluate(([info, isMob]) => {
      const L = __lab;
      if (isMob) return;
      const big = Math.max(info.sx, info.sz) > 8 || info.sy > 15, y = info.y + 1.2;
      if (info.sy > 15) { const ox = info.sx * 0.3, oz = info.sz * 0.3; for (const [dx, dz] of [[0, 0], [-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]]) L.explode(info.x + dx, y + 0.6, info.z + dz, 3.5, 2); }
      else if (big) { const ox = info.sx * 0.32; for (const dx of [-ox, 0, ox]) L.explode(info.x + dx, y, info.z - info.sz * 0.2, 3, 1.5); L.explode(info.x, y, info.z + info.sz * 0.3, 3, 1.5); }
      else { L.explode(info.x, y, info.z - info.sz * 0.25, Math.max(1.4, Math.min(2.5, Math.max(info.sx, info.sz) * 0.5)), 1.5); }
    }, [info, isMob]);
    for (let f = 1; f <= FRAMES; f++) {
      const st = await page.evaluate(([f, STEPS, isMob, info]) => {
        const L = __lab; const t0 = performance.now();
        if (isMob) { // shoot it: 3 rounds per frame from the camera side, walking up the body, until it dies
          for (let s = 0; s < STEPS; s++) { if (s % 10 === 0 && L.mobs.list.length) { const m = L.mobs.list[0], k = (f * 3 + s / 10) % 7; const sp = m.def.anim === 'spider'; L.tool('gun', m.x - 2.6, m.y + 1.9, m.z - 4.2, 2.6 + (k % 3 - 1) * (sp ? 0.3 : 0.12), (sp ? 0.55 + (k % 2) * 0.15 : (0.35 + k * 0.16) * (m.radius / 1.3) + 0.2) - 1.9, 4.2 + (sp ? (k % 3 - 1) * 0.3 : 0)); } L.step(1); }
        } else L.step(STEPS);
        const ms = performance.now() - t0; L.R.remeshBudget = 60; L.draw(); L.draw(); const s = L.stats(); s.simMsPerStep = +(ms / STEPS).toFixed(2); return s;
      }, [f, STEPS, isMob, info]);
      stats.push(st);
      await page.screenshot({ path: `${dir}/f${String(f).padStart(2, '0')}.png` });
    }
    const last = stats[stats.length - 1];
    report[id] = { info, bodiesPeak: Math.max(...stats.map(s => s.bodies)), debrisPeak: Math.max(...stats.map(s => s.debris)), fractures: last.fractures, detached: last.detached, mobsLeft: last.mobs, leak: last.leak, simMsPerStepMax: Math.max(...stats.map(s => s.simMsPerStep)) };
    writeFileSync(`${dir}/stats.json`, JSON.stringify({ info, stats }, null, 1));
    console.log(id, JSON.stringify(report[id]));
  }
  const errs = await page.evaluate(() => __lab.errors);
  console.log('PAGE ERRORS', JSON.stringify(errs), '\nCONSOLE', logs.length, logs.slice(0, 10).join('\n'));
  writeFileSync(`shots/report-${what.replace(/[^a-z0-9-]/gi, '_')}.json`, JSON.stringify({ report, errs, logs }, null, 1));
}, { query: 'harness&quality=' + quality, timeoutMs: 540000, gpu });
