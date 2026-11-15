// Inspect one or more roster characters from several angles into one sheet (pose tuning).
// Usage: node tools/peek-roster.js <id[,id..]> <out.png> [anim=idle] [frames=60]   yaws: front, 3/4, side, back
'use strict';
const path = require('path');
const { launch, openPage, sheet, save } = require('./pw-lib.js');
(async () => {
  const [ids, out, anim = 'idle', frames = 60] = process.argv.slice(2);
  const b = await launch(); const cells = [];
  try {
    for (const id of ids.split(',')) {
      const { page, errors } = await openPage(b, `http://127.0.0.1:8765/roster.html?inspect=${id}&a=${anim}${process.env.POSE ? '&pose=' + process.env.POSE : ''}`, { w: 420, h: 640 });
      await page.waitForTimeout(500); await page.evaluate((n) => window.__step(n), +frames);
      for (const [lab, yaw] of [['front', 0.0], ['3/4', 0.7], ['side', 1.57], ['back', 3.1]]) {
        await page.evaluate(([y, d, ty]) => { window.__orbit && window.__orbit(y, d ? 0.02 : undefined, d, ty); }, [yaw, +(process.env.DIST || 0), +(process.env.TY || 0)]); await page.evaluate(() => window.__step(1));
        cells.push({ buf: await (await page.$('#icv')).screenshot(), label: `${id} ${anim} ${lab}` });
      }
      if (errors.length) console.log(id, errors.join('\n'));
      await page.context().close();
    }
    save(out, await sheet(b, cells, { cols: 4, cw: 300, ch: 420 }));
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
