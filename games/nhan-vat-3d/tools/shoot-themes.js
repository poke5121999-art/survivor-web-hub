// Capture the gallery: every theme (and the Lanternfall sets) in the states listed below, with the deterministic clock.
// Writes shots/themes/<theme>-<variant>-<anim>-<view>.png, contact sheets shots/sheet-<name>.png, shots/themes/info.json.
// Usage: node tools/shoot-themes.js [base=http://127.0.0.1:8765] [mode=full|quick|faces|lineups]  env ONLY=<theme regex>
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, openPage, sheet, save } = require('./pw-lib.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const MODE = process.argv[3] || 'full';
const OUT = path.resolve(__dirname, '..', 'shots');
const THEMES = ['operator', 'trooper', 'survivor', 'farmer', 'samurai', 'mage', 'zombie', 'goblin', 'brute'];
const FRAMES = { idle: 90, walk: 75, run: 60, attack: 40, hit: 40, death: 110 };
(async () => {
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const b = await launch(); const info = {}; const cells = {};
  try {
    const { page, errors } = await openPage(b, `${BASE}/gallery.html?t=operator&v=0`, { w: 1280, h: 800 });
    await page.waitForTimeout(500); await page.evaluate(() => window.__step(5));
    const shot = async (name, st, frames) => {
      const t0 = Date.now();
      const inf = await page.evaluate((st) => window.__load(st), st);
      await page.evaluate((n) => window.__step(n), frames);
      await page.waitForTimeout(120);
      const file = path.join(OUT, 'themes', name + '.png'); const r = await page.evaluate(() => { const b = document.getElementById('view').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }); save(file, await page.screenshot({ clip: r }));
      info[name] = { tris: inf.tris, verts: inf.verts, calls: (await page.evaluate(() => window.__info.calls)), per: inf.per, buildMs: Math.round(inf.buildMs) };
      process.stdout.write(`${name}  tris ${inf.tris}  build ${Math.round(inf.buildMs)}ms  (${Date.now() - t0}ms)\n`);
      return file;
    };
    const add = (sheetName, file, label) => { (cells[sheetName] = cells[sheetName] || []).push({ url: `${BASE}/shots/themes/${path.basename(file)}`, label }); };
    for (const t of THEMES) {
      if (only && !only.test(t)) continue;
      if (MODE === 'full' || MODE === 'lineups' || MODE === 'quick') {
        add('lineups', await shot(`${t}-all-idle-front`, { set: 't-' + t, v: 'all', anim: 'idle', view: 'front', seed: 1 }, 90), t + ' (3 variants, idle, front)');
        if (MODE === 'quick') continue;
        add('lineups34', await shot(`${t}-all-idle-34`, { set: 't-' + t, v: 'all', anim: 'idle', view: '3/4', seed: 1 }, 60), t + ' 3/4');
      }
      for (let v = 0; v < 3; v++) {
        if (MODE === 'full') {
          for (const [a, view] of [['idle', 'front'], ['idle', '3/4'], ['walk', '3/4'], ['attack', 'front'], ['attack', '3/4']]) {
            add('t-' + t, await shot(`${t}-${v}-${a}-${view.replace('/', '')}`, { set: 't-' + t, v: String(v), anim: a, view, seed: 1 }, FRAMES[a]), `${t} v${v} ${a} ${view}`);
          }
        }
        if (MODE === 'full' || MODE === 'faces') add('faces', await shot(`${t}-${v}-face`, { set: 't-' + t, v: String(v), anim: 'idle', view: 'face', seed: 1 }, 60), `${t} v${v} face`);
      }
    }
    if (MODE === 'full' && !only) {
      for (const [a, f] of [['run', 60], ['hit', 40], ['death', 110]]) add('anims', await shot(`farmer-all-${a}-34`, { set: 't-farmer', v: 'all', anim: a, view: '3/4', seed: 1 }, f), 'farmer ' + a);
      for (const [a, f] of [['run', 60], ['hit', 40], ['death', 110]]) add('anims', await shot(`brute-all-${a}-34`, { set: 't-brute', v: 'all', anim: a, view: '3/4', seed: 1 }, f), 'brute ' + a);
      for (const sd of [2, 3, 4]) add('seeds', await shot(`operator-all-idle-front-s${sd}`, { set: 't-operator', v: 'all', anim: 'idle', view: 'front', seed: sd }, 60), 'operator seed ' + sd);
      for (const sd of [2, 3]) add('seeds', await shot(`farmer-all-idle-front-s${sd}`, { set: 't-farmer', v: 'all', anim: 'idle', view: 'front', seed: sd }, 60), 'farmer seed ' + sd);
      add('lf', await shot('lf-heroes-all-idle-front', { set: 'lf-heroes', v: 'all', anim: 'idle', view: 'front', seed: 1 }, 90), 'Lanternfall heroes in the gallery');
      add('lf', await shot('lf-monsters-all-idle-front', { set: 'lf-monsters', v: 'all', anim: 'idle', view: 'front', seed: 1 }, 90), 'Lanternfall monsters in the gallery');
    }
    console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
    save(path.join(OUT, 'themes', 'info.json'), Buffer.from(JSON.stringify({ errors, info }, null, 1)));
    for (const [n, list] of Object.entries(cells)) save(path.join(OUT, 'sheet-' + n + '.png'), await sheet(b, list, { base: BASE + '/README.md', cols: n.startsWith('t-') ? 5 : 3, cw: n.startsWith('t-') ? 392 : 490, ch: n.startsWith('t-') ? 308 : 385, title: n }));
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
