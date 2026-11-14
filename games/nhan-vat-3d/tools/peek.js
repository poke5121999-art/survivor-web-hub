// Debug close-up: node tools/peek.js <out.png> <json state for __load> [camOv json: [dx,y,dz,tx,ty,tz] relative to figure 0] [frames]
'use strict';
const { launch, openPage, save } = require('./pw-lib.js');
(async () => {
  const [out, st, ov, frames = 60] = process.argv.slice(2);
  const b = await launch();
  try {
    const { page, errors } = await openPage(b, 'http://127.0.0.1:8765/gallery.html', { w: 1280, h: 800 });
    await page.waitForTimeout(400);
    await page.evaluate(([st, ov]) => { window.__stage.state.camOv = ov ? JSON.parse(ov) : null; window.__load(JSON.parse(st)); }, [st, ov || '']);
    await page.evaluate((n) => window.__step(n), +frames);
    const r = await page.evaluate(() => { const b = document.getElementById('view').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
    save(out, await page.screenshot({ clip: r }));
    if (errors.length) console.log(errors.join('\n'));
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
