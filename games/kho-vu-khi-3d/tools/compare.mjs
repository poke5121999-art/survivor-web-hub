// Renders every weapon alone (same pose as its sheet cell) and writes reference | ours pairs and contact sheets.
// node tools/compare.mjs [id ...]   -> shots/compare/NN-id.png, shots/compare/sheet-K.png, shots/closeup/id.png
import { serve, launch, open, ROOT } from './pw.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const want = process.argv.slice(2);
const srv = serve(8795, 900000); const browser = await launch();
const out = path.join(ROOT, 'shots', 'compare'), close = path.join(ROOT, 'shots', 'closeup'), tmp = path.join(ROOT, 'shots', 'tmp');
for (const d of [out, close, tmp]) fs.mkdirSync(d, { recursive: true });
try {
  const { page, errors } = await open(browser, 'http://localhost:8795/index.html?shot=1', { w: 700, h: 700 });
  const list = await page.evaluate(() => __api.REGISTRY.map((w, i) => ({ id: w.id, rot: w.def.rot || 0, i })));
  const pairs = [];
  for (const w of list) {
    if (want.length && !want.includes(w.id)) continue;
    const cell = w.i < 58 ? w.i + 1 : w.i > 58 ? w.i : 0;           // registry has the TR-9 at index 58
    let info = await page.evaluate(([id, rot]) => __api.solo(id, rot, 0, 0, true), [w.id, w.rot]);
    const r = Math.abs(Math.cos(w.rot * Math.PI / 180)), sx = info.size[0] * r + info.size[1] * (1 - r), sy = info.size[1] * r + info.size[0] * (1 - r);
    const vp = sx > sy * 1.4 ? [1200, 560] : sy > sx * 1.4 ? [560, 900] : [760, 760];
    await page.setViewportSize({ width: vp[0], height: vp[1] }); await page.waitForTimeout(250);
    info = await page.evaluate(([id, rot]) => __api.solo(id, rot, 0, 0, true), [w.id, w.rot]);
    await page.waitForTimeout(350);
    const ours = path.join(tmp, w.id + '.png'); await page.screenshot({ path: ours });
    const info2 = await page.evaluate(([id]) => __api.solo(id, 0, 28, 12, true), [w.id]);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(close, w.id + '.png') });
    const nn = String(cell).padStart(2, '0');
    const dst = path.join(out, `${nn}-${w.id}.png`);
    const ref = cell ? `D:/stylized-weapons/ref/cells/${nn}.png` : path.join(ROOT, 'shots', 'tr9-ref.png');
    if (fs.existsSync(ref)) { execFileSync('python', [path.join(ROOT, 'tools', 'pair.py'), dst, ref, ours]); pairs.push(dst); }
    console.log(nn, w.id, info.tris);
  }
  if (!want.length) for (let s = 0; s * 8 < pairs.length; s++) execFileSync('python', [path.join(ROOT, 'tools', 'grid.py'), path.join(out, `sheet-${s + 1}.png`), ...pairs.slice(s * 8, s * 8 + 8)]);
  if (errors.filter((e) => !e.includes('X3595')).length) console.log('ERRORS:', errors.join('\n'));
} finally { await browser.close(); srv.close(); }
process.exit(0);
