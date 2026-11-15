// Render the composed scenes at the owner's image size and save reference | ours side by side:
// shots/roster/scene-campfire.png, scene-workshop.png. Prints characters, missing props, console errors.
// Usage: node tools/shoot-scenes.js   (env ONLY=campfire|workshop)
'use strict';
const fs = require('fs'), path = require('path');
const { launch, openPage, sheet, save } = require('./pw-lib.js');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'shots', 'roster');
const SCENES = [['campfire', 'owner-campfire-scene.webp', 1437, 761], ['workshop', 'owner-workshop-scene.webp', 1446, 848]];
(async () => {
  const b = await launch();
  try {
    for (const [name, ref, w, h] of (process.env.ONLY ? SCENES.filter((s) => s[0] === process.env.ONLY) : SCENES)) {
      const { page, errors } = await openPage(b, `http://127.0.0.1:8765/scene-${name}.html`, { w, h });
      for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__scene)); i++) { await page.evaluate(() => window.__step && window.__step(1)); await page.waitForTimeout(200); }
      await page.evaluate(() => window.__step(90));
      await page.addStyleTag({ content: '#hud{display:none}' }); await page.evaluate(() => window.__step(1));
      const ours = await (await page.$('#cv')).screenshot();
      save(path.join(OUT, `scene-${name}-ours.png`), ours);
      const refBuf = fs.readFileSync(path.join(ROOT, 'ref', ref));
      const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(`<body style="margin:0"><img id=i src="data:image/webp;base64,${refBuf.toString('base64')}"></body>`); await p.waitForTimeout(300);
      const refPng = await (await p.$('#i')).screenshot(); await p.close();
      save(path.join(OUT, `scene-${name}.png`), await sheet(b, [{ buf: refPng, label: 'owner reference' }, { buf: ours, label: 'ours (chibi kit + stylized-props + stylized-weapons)' }], { cols: 2, cw: 960, ch: Math.round(960 * h / w), title: `scene-${name}` }));
      const info = await page.evaluate(() => window.__scene.info);
      console.log(name, JSON.stringify(info));
      const real = errors.filter((e) => !/favicon|404 \(Not Found\)/.test(e));
      console.log(real.length ? 'ERRORS:\n' + real.join('\n') : 'no console errors');
      await page.context().close();
    }
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
