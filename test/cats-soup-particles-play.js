#!/usr/bin/env node
/* Meo & Sup feature "particles" in a real browser (?demo=3&zoom=1.7): the soup pot's bubbles and fire glow are alive, a cooked
 * dish puffs the steam, the lantern flame draws, the live total stays under the cap, no feature failed, and the frame time
 * with particles is close to the one without.
 *   node test/cats-soup-particles-play.js          Screenshots: shots/cats-soup-particles/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process['env'].PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-particles');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const serve = () => new Promise(res => {
  const srv = http.createServer((q, s) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(b); });
  }).listen(0, () => res(srv));
});

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${srv.address().port}/games/cats-soup/index.html?demo=3&zoom=1.7`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const pot = await page.evaluate(() => window.__game.state.works.find(w => w.a === 0).id);
  await page.evaluate(id => window.__particles.focus(id), pot);
  await page.waitForTimeout(2500);
  const live = (name, id) => page.evaluate(([n, w]) => window.__particles.live(n, w), [name, id]);
  const boil = await live('pt_boil', pot), glow = await live('pt_firebase', pot);
  check('soup pot bubbles (pt_boil) alive', boil > 0, `${boil} live`);
  check('soup pot fire glow (pt_firebase) alive', glow > 0, `${glow} live`);
  check('steam waits for a cooked dish', await live('pt_steam', pot) === 0);
  await page.evaluate(id => { const g = window.__game; g.emit('food', { item: null, work: g.state.works.find(w => w.id === id) }); }, pot);
  await page.waitForTimeout(800);
  const steam = await live('pt_steam', pot);
  check('a cooked dish puffs the steam (pt_steam burst of 1)', steam === 1, `${steam} live`);
  await page.screenshot({ path: path.join(SHOTS, 'pot.png') });
  const flames = () => page.evaluate(() => window.__particles.systems().filter(s => s.name === 'pt_firebase' && s.live).length);
  check('by day only the pot glow burns, the lantern is unlit (HandLightOn)', await flames() === 1, `${await flames()} systems`);
  const ff0 = await live('pt_firefly', -1);
  check('no fireflies by day', ff0 === 0, `${ff0} live`);
  await page.evaluate(() => { window.__game.state.timeCount = 7; });
  await page.waitForTimeout(4000);
  let lamp = 0;
  for (let i = 0; i < 12; i++) { lamp = Math.max(lamp, await flames()); await page.waitForTimeout(150); }   // rate 1/s, life 1 s: sample over 2 s
  const ff = await live('pt_firefly', -1);
  check('at night the pot glow and the lantern flames have live particles', lamp >= 2, `${lamp} systems`);
  check('at night fireflies (Spawn.pt_fireFly, level2 scene system) drift over the clearing', ff >= 20, `${ff} live`);
  const total = await page.evaluate(() => window.__particles.total());
  check('live total under the cap of 1500', total > 0 && total <= 1500, `${total}`);
  const frames = () => page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 40) requestAnimationFrame(f); else res((performance.now() - t0) / n); }; requestAnimationFrame(f); }));
  const on = await frames();
  await page.evaluate(() => { window.__particles.off = true; });
  const off = await frames();
  await page.evaluate(() => { window.__particles.off = false; });
  check('frame time with particles within 25 ms of without', on - off < 25, `${on.toFixed(1)} ms vs ${off.toFixed(1)} ms`);
  check('no feature failed', (await page.evaluate(() => window.__failed())).length === 0);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
