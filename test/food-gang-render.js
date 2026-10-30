#!/usr/bin/env node
/* Food Gang engine render check (games/food-gang/dev.html): for each match map (Kitchen, DiningRoom, Pantry) the dev
 * page loads the map scene + SceneGame HUD, spawns the 16 skins and plays FX. Asserts no console errors, every
 * referenced sprite/clip/controller/material/font resolved (window.fgEngineStats), the world and HUD drew, and saves
 * screenshots to FG_SHOTS (default shots/food-gang).
 *   node test/food-gang-render.js
 *   FG_URL=https://poke5121999-art.github.io/survivor-web-hub/games/food-gang/dev.html node test/food-gang-render.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.FG_SHOTS || path.join(ROOT, 'shots', 'food-gang');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

const MAPS = [['level23', 'kitchen'], ['level24', 'dining'], ['level25', 'pantry']];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.FG_URL ? null : await serve();
  const base = process.env.FG_URL || `http://localhost:${srv.address().port}/games/food-gang/dev.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const killer = setTimeout(() => { console.log('  FAIL timeout (240 s)'); process.exit(2); }, 240000);
  try {
    for (const [scene, label] of MAPS) {
      console.log(`${label} (${scene})`);
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('requestfailed', (r) => errors.push('request failed ' + r.url()));
      page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
      const extra = process.env.FG_QUERY ? '&' + process.env.FG_QUERY : '';
      await page.goto(`${base}?scene=${scene}&info=0&focus=7${extra}`);
      const ok = await page.waitForFunction(() => window.fgEngineStats && (window.fgEngineStats.ready || window.fgEngineStats.errors.length), null, { timeout: 60000 }).then(() => true, () => false);
      check('dev page ready', ok);
      await page.waitForTimeout(2500);
      const st = await page.evaluate(() => {
        const s = window.fgEngineStats;
        return { ...s, spritesMissing: s.spritesMissing.slice(), clipsMissing: s.clipsMissing.slice(), errors: s.errors.slice() };
      });
      check('no console / page errors', errors.length === 0 && st.errors.length === 0, [...errors, ...st.errors].slice(0, 4).join(' | '));
      check('every referenced sprite resolved', st.spritesMissing.length === 0 && st.spritesRef > 100, `${st.spritesRef} refs, missing: ${st.spritesMissing.slice(0, 6).join(',')}`);
      check('every referenced clip resolved', st.clipsMissing.length === 0 && st.clipsRef > 50, `${st.clipsRef} refs, missing: ${st.clipsMissing.slice(0, 6).join(',')}`);
      check('controllers, materials, fonts, prefabs resolved',
        !st.ctrlMissing.length && !st.matsMissing.length && !st.fontsMissing.length && !st.prefabsMissing.length,
        [...st.ctrlMissing, ...st.matsMissing, ...st.fontsMissing, ...st.prefabsMissing].join(','));
      check('16 skins spawned with animators', st.agents === 16 && st.animators >= 16, `${st.agents} agents, ${st.animators} animators`);
      check('world + HUD drew', st.drawCalls > 20, `${st.drawCalls} draw calls`);
      const states = await page.evaluate(() => (window.fgDev.agents || []).map((a) => a.an && a.an.stateName(0)));
      check('animator state machines running', states.filter(Boolean).length === 16, states.join(','));
      const px = await page.evaluate(() => {
        const c = document.getElementById('cv');
        const g = c.getContext('webgl2');
        const w = c.width, h = c.height, d = new Uint8Array(w * h * 4);
        g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, d);
        let lit = 0, distinct = new Set();
        for (let i = 0; i < d.length; i += 4 * 211) { if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; distinct.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4); }
        return { lit, distinct: distinct.size };
      });
      check('frame is painted (not blank)', px.lit > 1000 && px.distinct > 40, `${px.lit} lit samples, ${px.distinct} colours`);
      await page.screenshot({ path: path.join(SHOTS, `${label}.png`) });
      // the same map framed like the clip frames (phone 2.16:1, one skin where the clips show the player)
      const spot = { level23: 'x=-0.8', level24: 'x=8.5', level25: 'x=-10&y=3' }[scene];
      await page.setViewportSize({ width: 1280, height: 592 });
      await page.goto(`${base}?scene=${scene}&info=0&prefab=BRO&anim=idle&nofx=1&${spot}${extra}`);
      await page.waitForFunction(() => window.fgEngineStats && window.fgEngineStats.ready, null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, `${label}_single.png`) });
      await page.close();
    }
  } finally {
    clearTimeout(killer);
    await browser.close();
    if (srv) srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
