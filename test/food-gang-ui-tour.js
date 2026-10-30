#!/usr/bin/env node
/* Food Gang parity tour: the menu states of the reference clips captured at the clip's 2.16:1 game area (1280x592),
 * into FG_PARITY_WEB (default D:/foodgang-ref/parity-ui/web/<key>.png) for .claude/skills/parity-compare.
 * Keys: tutorial, menu, searching, versus, trophy_road, shop, collection, skinstat, fridge_item.
 *   node test/food-gang-ui-tour.js        (FG_URL= for Pages)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = process.env.FG_PARITY_WEB || 'D:/foodgang-ref/parity-ui/web';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const note = (k, good, d) => { console.log(`  ${good ? 'PASS' : 'FAIL'} ${k}${d ? '  (' + d + ')' : ''}`); if (good) ok++; else bad++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = process.env.FG_URL ? null : await new Promise((res) => { const s = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); }).listen(0, () => res(s)); });
  const base = process.env.FG_URL || `http://localhost:${srv.address().port}/games/food-gang/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const killer = setTimeout(() => { console.log('  FAIL timeout'); process.exit(2); }, 600000);
  const page = await browser.newPage({ viewport: { width: 1280, height: 592 }, deviceScaleFactor: 1 });
  const ev = (f, a) => page.evaluate(f, a);
  const until = async (f, ms, a) => { const e = Date.now() + ms; for (;;) { const v = await ev(f, a).catch(() => null); if (v) return v; if (Date.now() > e) return null; await sleep(60); } };
  const shot = async (k) => { await page.screenshot({ path: path.join(OUT, k + '.png') }); note(k, true); };
  const press = async (m, s, n) => { const b = await ev(([m2, s2, n2]) => (window.fgButtons(s2) || []).find((x) => x.method.split(',').includes(m2) && (!n2 || x.name === n2)), [m, s, n]); if (!b) return false; await page.mouse.click(b.pos[0], b.pos[1]); return true; };
  const topIs = (s) => until((x) => { const u = window.fgDebug().ui[0]; return u && u.scene === x ? u : null; }, 15000, s);
  try {
    await page.goto(base.replace('index.html', 'dev.html'));
    await ev(() => localStorage.clear());
    await page.goto(base + '?offline=1&intro=0');
    if (await until(() => { const d = window.fgDebug && window.fgDebug(); return d && d.phase === 'match' && d.tick > 60; }, 40000)) await shot('tutorial');
    else note('tutorial', false);
    // returning player as in the clip: 5 trophies, a few coins, the tutorial done
    await ev(() => { const a = window.fgApp; a.meta.completeTutorial(a.profile, new Date()); a.profile.trophies = 5; a.profile.trophiesShown = 5; a.profile.coins = 93; a.profile.name = 'Power'; a.save(); });
    await page.goto(base + '?offline=1');
    if (await topIs('SceneMenu')) { await sleep(2500); await shot('menu'); } else note('menu', false);
    await press('OpenLeague', 'SceneMenu');
    if (await topIs('SceneLeague')) { await sleep(1500); await shot('trophy_road'); await press('Close', 'SceneLeague'); await sleep(600); }
    await press('OpenShop', 'SceneMenu');
    if (await topIs('SceneShop')) { await sleep(1500); await shot('shop');
      const c = (await ev(() => window.fgDebug().ui[0])).gifts[1];
      await page.mouse.click(c.pos[0], c.pos[1]);
      if (await topIs('SceneReward')) { await sleep(900); await page.mouse.click(640, 300); await sleep(350); await shot('fridge_item'); }
      for (let i = 0; i < 20 && (await ev(() => window.fgDebug().ui[0].scene)) === 'SceneReward'; i++) { await page.mouse.click(640, 300); await sleep(400); }
      await press('Close', 'SceneShop'); await sleep(600); }
    await press('OpenSkinCollection', 'SceneMenu', 'Collection');
    const col = await topIs('SceneSkinCollection');
    if (col) { await sleep(1500); await shot('collection'); await page.mouse.click(col.cells[0].pos[0], col.cells[0].pos[1]);
      if (await topIs('SceneSkinStat')) { await sleep(1500); await shot('skinstat'); await press('Close', 'SceneSkinStat'); await sleep(500); }
      await press('Close', 'SceneSkinCollection'); await sleep(600); }
    for (let i = 0; i < 4 && (await ev(() => window.fgDebug().ui[0].scene)) !== 'SceneMenu'; i++) { await press('Close', (await ev(() => window.fgDebug().ui[0].scene))); await sleep(700); }
    await topIs('SceneMenu');
    await sleep(500);
    const pressed = await press('Play', 'SceneMenu');
    if (!pressed) console.log('  no Play button:', JSON.stringify(await ev(() => [window.fgDebug().screen, window.fgDebug().ui.map((u) => u.scene), window.fgButtons('SceneMenu').map((b) => b.method)])));
    if (await until(() => window.fgDebug().phase === 'searching', 30000)) { await sleep(400); await shot('searching'); } else note('searching', false, JSON.stringify(await ev(() => { const d = window.fgDebug(); return [d.screen, d.phase, d.ui.map((u) => u.scene), d.engine.errors]; })).slice(0, 400));
    if (await until(() => window.fgDebug().phase === 'intro', 10000)) { await sleep(900); await shot('versus'); } else note('versus', false);
  } catch (e) { note('tour', false, String(e).slice(0, 300)); }
  clearTimeout(killer);
  await browser.close();
  if (srv) srv.close();
  console.log(`\n${ok} shots, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
