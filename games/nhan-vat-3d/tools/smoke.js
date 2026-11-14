// Quick smoke: open a URL with the deterministic clock, step N frames, screenshot, print console errors.
// Usage: node tools/smoke.js <url> <out.png> [frames=90] [w=1600] [h=900]
'use strict';
const { launch, openPage, save } = require('./pw-lib.js');
(async () => {
  const [url, out, frames = 90, w = 1600, h = 900] = process.argv.slice(2);
  const b = await launch();
  try {
    const { page, errors } = await openPage(b, url, { w: +w, h: +h });
    await page.waitForTimeout(500);
    await page.evaluate((n) => window.__step && window.__step(n), +frames);
    await page.waitForTimeout(300);
    save(out, await page.screenshot());
    const info = await page.evaluate(() => window.LF && LF.dbg ? LF.dbg.verts : (window.__info || null));
    console.log('info', JSON.stringify(info));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
