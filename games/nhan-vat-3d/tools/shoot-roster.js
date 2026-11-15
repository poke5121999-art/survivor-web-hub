// Roster checks: per-character solo renders next to the owner's reference cell, one sheet per sheet-row
// (shots/roster/side-rN.png, zombies side-z.png), the full 6x20 line-up under the reference (shots/roster/lineup.png),
// stats (tris / draws per character) and console errors. Usage: node tools/shoot-roster.js [base=http://127.0.0.1:8765]
// env ONLY=r1c1,r1c2 to shoot a subset (one sheet "side-only.png").
'use strict';
const fs = require('fs'), path = require('path');
const { launch, openPage, sheet, save } = require('./pw-lib.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'shots', 'roster');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await launch();
  try {
    const { page, errors } = await openPage(b, BASE + '/roster.html?still', { w: 360, h: 900, deterministic: true });
    await page.waitForTimeout(800);
    const ids = await page.evaluate(() => window.__roster.ROSTER.map((s) => s.id));
    const zids = await page.evaluate(() => window.__roster.ZOMBIES.map((s) => s.id));
    const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
    const shots = {};
    async function solo(id, view) {
      await page.evaluate((v) => { const u = new URL(location); }, view);
      const ok = await page.evaluate((id) => window.__roster.solo(id, { w: 1.25, aspect: 1.75 }), id);
      if (!ok) return null;
      await page.evaluate(() => window.__step(2));
      return await (await page.$('#grid')).screenshot();
    }
    const want = only || ids;
    for (const id of want.filter((i) => ids.includes(i))) shots[id] = await solo(id);
    if (!only || only.some((i) => zids.includes(i))) {
      await page.evaluate(() => document.querySelector('header button[data-v="zombies"]').click()); await page.waitForTimeout(300);
      for (const id of (only || zids).filter((i) => zids.includes(i))) shots[id] = await solo(id);
    }
    const stats = {};
    await page.evaluate(() => window.__roster.all());
    const ref = (id) => { const f = path.join(ROOT, 'ref', id.startsWith('z') ? 'zcells' : 'cells', id + '.png'); return fs.existsSync(f) ? fs.readFileSync(f) : null; };
    const groups = only ? { only } : Object.assign({}, ...[1, 2, 3, 4, 5, 6].map((r) => ({ ['r' + r]: ids.filter((i) => i.startsWith('r' + r + 'c')) })), { z: zids });
    for (const [g, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const cells = []; for (const id of list) { if (!shots[id]) continue; cells.push({ buf: ref(id), label: id + ' ref' }, { buf: shots[id], label: id + ' ours' }); }
      save(path.join(OUT, 'side-' + g + '.png'), await sheet(b, cells, { cols: 10, cw: 200, ch: 350, title: `${g}: owner reference | ours` }));
    }
    // line-up 6x20 at large size
    if (!only) {
      const L = await openPage(b, BASE + '/roster.html?still', { w: 2000, h: 1400, deterministic: true });
      await L.page.waitForTimeout(800); await L.page.evaluate(() => window.__step(2));
      const ours = await (await L.page.$('#grid')).screenshot();
      const st = await L.page.evaluate(() => window.__roster.stats()); for (const s of st) stats[s.id] = s;
      save(path.join(OUT, 'lineup-ours.png'), ours);
      const rb = fs.readFileSync(path.join(ROOT, 'ref', 'owner-roster-nanobanana.webp'));
      const rp = await b.newPage({ viewport: { width: 1557, height: 830 } }); await rp.setContent('<body style="margin:0"><img id=i src="data:image/webp;base64,' + rb.toString('base64') + '"></body>'); await rp.waitForTimeout(300);
      const refShot = await (await rp.$('#i')).screenshot(); await rp.close();
      save(path.join(OUT, 'lineup.png'), await sheet(b, [{ buf: refShot, label: 'owner sheet 6x20' }, { buf: ours, label: 'ours, same 6x20 layout (empty cells = not built yet)' }], { cols: 1, cw: 1600, ch: 860, title: 'line-up: reference above, ours below' }));
      errors.push(...L.errors);
      fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1));
      const tr = Object.values(stats).map((s) => s.tris); console.log('characters', tr.length, 'tris min', Math.min(...tr), 'max', Math.max(...tr), 'mean', Math.round(tr.reduce((a, b) => a + b, 0) / tr.length));
    }
    const real = errors.filter((e) => !/favicon|404 \(Not Found\)/.test(e));
    console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'no console errors', errors.length - real.length ? `(${errors.length - real.length} ignored 404)` : '');
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
