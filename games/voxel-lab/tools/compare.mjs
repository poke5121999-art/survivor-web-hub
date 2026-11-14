// Comparison captures framed like the reference sheets: tower collapse from street level, brick house close-up.
import { withLab } from './serve.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const gpu = process.argv.includes('--gpu'), only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'both';
await withLab(async (page, logs) => {
  const run = async (name, setup, frames, steps) => {
    const dir = `shots/${name}`; mkdirSync(dir, { recursive: true });
    await page.evaluate(setup); await page.screenshot({ path: `${dir}/f00.png` });
    await page.evaluate(`window.__blast()`);
    const stats = [];
    for (let f = 1; f <= frames; f++) { stats.push(await page.evaluate((steps) => { const L = __lab; L.step(steps); L.R.remeshBudget = 80; L.draw(); L.draw(); return L.stats(); }, steps)); await page.screenshot({ path: `${dir}/f${String(f).padStart(2, '0')}.png` }); }
    writeFileSync(`${dir}/stats.json`, JSON.stringify(stats, null, 1)); const l = stats[stats.length - 1];
    console.log(name, JSON.stringify({ bodiesPeak: Math.max(...stats.map(s => s.bodies)), debrisPeak: Math.max(...stats.map(s => s.debris)), fractures: l.fractures, detached: l.detached, ratio: l.ratio, leak: l.leak }));
  };
  if (only !== 'house') await run('cmp_tower', () => {
    const L = __lab, i = L.spawn('office-tower', 1, false);
    // street-level view looking up, as in the reference high-rise capture; five r 3.5 m power 2 blasts at the base
    L.setCamera(i.x - 17, 2.2, i.z - 21, i.x + 1, i.y + 11.5, i.z); L.settle();
    window.__blast = () => { const ox = i.sx * 0.3, oz = i.sz * 0.3; for (const [dx, dz] of [[0, 0], [-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]]) L.explode(i.x + dx, i.y + 1.8, i.z + dz, 3.5, 2); };
  }, 16, 24); // 16 frames x 0.4 s = 6.4 s
  if (only !== 'tower') await run('cmp_house', () => {
    const L = __lab, i = L.spawn('brick-house', 0, false);
    // close frontal view; two r 2.5 m power 1.5 blasts inside the house, as in the reference close-up
    L.setCamera(i.x - 1.5, 2.6, i.z - 15.5, i.x + 0.3, i.y + 4.6, i.z); L.settle();
    window.__blast = () => { L.explode(i.x - 1.6, i.y + 1.4, i.z - 1.2, 2.5, 1.5); L.explode(i.x + 1.8, i.y + 1.4, i.z + 0.4, 2.5, 1.5); };
  }, 16, 15); // 16 frames x 0.25 s = 4 s
  console.log('ERRORS', JSON.stringify(await page.evaluate(() => __lab.errors)), logs.length, logs.slice(0, 5).join('\n'));
}, { query: 'harness&quality=high', width: 1600, height: 900, timeoutMs: 280000, gpu });
