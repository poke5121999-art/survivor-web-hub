// Pose tuning for roster characters: open the inspect view, merge candidate bone offsets into the character's carry
// pose live, and render front / 3/4 / side per candidate into one sheet (one row per candidate).
// Usage: node tools/pose-tune-roster.js <id> <out.png> '<json [ {bone: [x,y,z]}, ... ]>'   (needs tools/serve.js on 8765)
'use strict';
const { launch, openPage, sheet, save } = require('./pw-lib.js');
(async () => {
  const [id, out, cands] = process.argv.slice(2);
  const list = JSON.parse(cands); const b = await launch(); const cells = [];
  try {
    const { page, errors } = await openPage(b, `http://127.0.0.1:8765/roster.html?inspect=${id}&a=idle${process.env.POSE ? "&pose=" + process.env.POSE : ""}`, { w: 420, h: 640 });
    await page.waitForTimeout(500);
    for (let k = 0; k < list.length; k++) {
      await page.evaluate((bones) => { const st = window.__cur().an.st; if (!st._orig) st._orig = JSON.parse(JSON.stringify(st.carry)); st.carry = Object.assign(JSON.parse(JSON.stringify(st._orig)), bones); }, list[k]);
      await page.evaluate(() => window.__step(40));
      for (const [lab, yaw] of [['front', 0.22], ['3/4', 0.7], ['side', 1.57]]) {
        await page.evaluate((y) => window.__orbit(y), yaw); await page.evaluate(() => window.__step(1));
        cells.push({ buf: await (await page.$('#icv')).screenshot(), label: `${id} #${k} ${lab}` });
      }
    }
    if (errors.length) console.log(errors.join('\n'));
    save(out, await sheet(b, cells, { cols: 3, cw: 260, ch: 400 }));
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
