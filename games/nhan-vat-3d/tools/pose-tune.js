// Pose tuning: load one theme variant, override style.carry / style.ready bones live, render front + side views per
// candidate, and write one sheet. Usage: node tools/pose-tune.js <theme> <variant> <which=carry|ready> <out.png> '<json [ {bones}, ... ]>' [anim=idle|ready]
'use strict';
const path = require('path');
const { launch, openPage, sheet, save } = require('./pw-lib.js');
(async () => {
  const [theme, v, which, out, cands, anim = 'idle'] = process.argv.slice(2);
  const list = JSON.parse(cands); const b = await launch(); const cells = [];
  try {
    const { page, errors } = await openPage(b, 'http://127.0.0.1:8765/gallery.html', { w: 900, h: 700 });
    await page.waitForTimeout(400);
    await page.evaluate(([t, v, a]) => window.__load({ set: 't-' + t, v, anim: a === 'ready' ? 'idle' : 'idle', view: 'front', seed: 1 }), [theme, v, anim]);
    for (let k = 0; k < list.length; k++) {
      for (const [view, ov] of [['front', [0.4, 1.3, 2.6, 0, 1.0, 0]], ['side', [2.7, 1.3, 0.5, 0, 1.0, 0]], ['top34', [1.8, 2.2, 1.8, 0, 1.0, 0]]]) {
        await page.evaluate(([which, bones, ov, anim]) => {
          const s = window.__stage.state, f = s.figs[0], st = f.entry.def.style;
          if (!st['_orig_' + which]) st['_orig_' + which] = JSON.parse(JSON.stringify(st[which]));
          st[which] = Object.assign(JSON.parse(JSON.stringify(st['_orig_' + which])), bones);
          s.camOv = ov; f.fig.mesh.rotation.y = 0; f.an.readyW = anim === 'ready' ? 1 : 0; s.anim = anim;
        }, [which, list[k], ov, anim]);
        await page.evaluate(() => window.__step(40));
        const r = await page.evaluate(() => { const b = document.getElementById('view').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
        cells.push({ buf: await page.screenshot({ clip: r }), label: `#${k} ${view} ${JSON.stringify(list[k]).slice(0, 70)}` });
      }
    }
    save(out, await sheet(b, cells, { cols: 3, cw: 420, ch: 380, title: `${theme} v${v} ${which}` }));
    if (errors.length) console.log(errors.join('\n'));
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
