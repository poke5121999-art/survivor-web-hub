// Phone-width check: roster grid, inspect view and both scenes at 390x844 (DPR 2). Saves shots/roster/phone-*.png,
// prints horizontal overflow (page wider than the viewport) and console errors. Usage: node tools/shoot-phone.js
'use strict';
const fs = require('fs'), path = require('path');
const { launch, openPage, save } = require('./pw-lib.js');
const OUT = path.join(__dirname, '..', 'shots', 'roster');
const PAGES = [['roster', 'roster.html'], ['inspect', 'roster.html?inspect=r1c7'], ['campfire', 'scene-campfire.html'], ['workshop', 'scene-workshop.html']];
(async () => {
  const b = await launch(); let bad = 0;
  try {
    for (const [name, url] of PAGES) {
      const { page, errors } = await openPage(b, 'http://127.0.0.1:8765/' + url, { w: 390, h: 844 });
      await page.waitForTimeout(1500); await page.evaluate(() => window.__step && window.__step(60));
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      save(path.join(OUT, `phone-${name}.png`), await page.screenshot());
      const real = errors.filter((e) => !/favicon|404 \(Not Found\)/.test(e));
      console.log(name, 'overflow', ov, real.length ? 'ERRORS: ' + real.join(' | ') : 'no console errors');
      if (ov > 0 || real.length) bad++;
      await page.context().close();
    }
  } finally { await b.close(); }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
