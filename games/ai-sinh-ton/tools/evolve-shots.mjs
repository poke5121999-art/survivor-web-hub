// Looks at the evolution screen with the real beast models: for every step of every beast (form 1 -> 2, 2 -> 3 on each
// path) it shoots the ready screen (old and new side by side), the crack, the pose and two moments of the lap in the
// new gait, then lays them out in sheets. The four starters also get whole-screen shots on S22 and Xiaomi 17T.
// Out: .chk/a10/polish/evo/. Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/evolve-shots.mjs [ids,...]
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'a10', 'polish', 'evo'); fs.mkdirSync(OUT, { recursive: true });
const STARTERS = ['tegiap', 'nhim', 'loc', 'chon'];
const only = process.argv[2] ? process.argv[2].split(',') : null;
const srv = await serve(); const br = await launch();
const step = (page, n) => page.evaluate((k) => __step(k), n);
const phase = (page) => page.evaluate(() => __G.evolveUi.phase);

async function steps(page, phone, full) {
  const all = await page.evaluate(async () => {
    const { HEROES } = await import('/games/ai-sinh-ton/js/data/heroes.js?v=20261122a'); const bz = await import('/games/ai-sinh-ton/js/data/beasts.js?v=20261122a');
    return HEROES.map((h) => ({ id: h.id, br: bz.branchesOf(h.id) }));
  });
  const box = await page.evaluate(() => { const r = document.getElementById('frame').getBoundingClientRect(), k = r.width / 780; return { x: r.x + 30 * k, y: r.y + 36 * k, width: 344 * k, height: 240 * k }; });
  const files = [];
  for (const { id, br: brs } of all) {
    if (only ? !only.includes(id) : !full && !STARTERS.includes(id)) continue;
    const plan = [[1, null, null], ...(brs.length ? brs.map((b) => [2, null, b]) : [[2, null, null]])];
    for (const [form, branch, pick] of plan) {
      await page.evaluate(({ id, form, branch }) => {
        const A = __G.meta.acc; A.heroes[id] = Object.assign(A.heroes[id] || {}, { level: 30, shards: 999, form, branch });
        A.gold = 1e7; for (const k of Object.keys(A.evo.stone)) A.evo.stone[k] = 999; A.evo.core = 99; A.cleared = Math.max(A.cleared, 20);
      }, { id, form, branch });
      await page.evaluate(async ({ id, pick }) => { const m = await import('/games/ai-sinh-ton/js/ui/evolve.js?v=20261122a'); __G.goto('heroes', { id }); m.openEvolve(id, { branch: pick || undefined }); }, { id, pick });
      await step(page, 40);
      const tag = `${id}-${form}${pick || ''}`;
      const snap = async (name) => {
        const f = path.join(OUT, `${phone}-${tag}-${name}.png`);
        if (STARTERS.includes(id) && name === '1ready') await page.locator('#frame').screenshot({ path: f.replace('.png', '-full.png') });
        await page.screenshot({ path: f, clip: box }); files.push(f);
      };
      await snap('1ready');
      const go = (await page.evaluate(() => __ui.targets())).find((q) => q.id === 'evolve-go');
      await page.touchscreen.tap(go.x + go.w / 2, go.y + go.h / 2); await step(page, 2);
      const want = { crack: '2crack', pose: '3pose' }; const got = new Set();
      for (let i = 0; i < 300; i++) {
        await step(page, 3); const p = await phase(page);
        if (want[p] && !got.has(p)) { if (p === 'pose') await step(page, 30); got.add(p); await snap(want[p]); }
        if (p === 'done') break;
      }
      await step(page, 50); await snap('4lap');
      await step(page, 52); await snap('5lap');
      if (STARTERS.includes(id)) await page.locator('#frame').screenshot({ path: path.join(OUT, `${phone}-${tag}-done-full.png`) });
      await page.evaluate(() => __G.screens.evolve.hide()); await step(page, 2);
    }
  }
  return files;
}

for (const phone of ['s22', 'xiaomi']) {
  const { page, problems, ctx } = await open(br, srv.base, phone, 'noaudio=1&q=low', { freeze: true });
  const files = await steps(page, phone, phone === 's22');
  for (let i = 0; i < files.length; i += 40) sheet(files.slice(i, i + 40), path.join(OUT, `sheet-${phone}-${i / 40 + 1}.png`), 5, 300);
  console.log(`${phone}: ${files.length} shots, console problems: ${problems.length ? problems.slice(0, 3).join(' | ') : 'none'}`);
  await ctx.close();
}
await br.close(); srv.close();
console.log('shots: ' + OUT);
