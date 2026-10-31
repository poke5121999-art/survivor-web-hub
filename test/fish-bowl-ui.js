#!/usr/bin/env node
/* Fish Bowl 2D UI check: renders each uGUI screen at 1280x720 and 2340x1080, saves screenshots, asserts the Play button
 * is inside the viewport, level cards 1..5 are visible, and no sprite 404s.
 *   node test/fish-bowl-ui.js     (FB_SHOTS=dir to change the screenshot folder)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
const OUT = process.env.FB_SHOTS || 'C:/Users/tamph/AppData/Local/Temp/claude/D--survivor-web-hub/1a1efc39-4ce5-47df-85ca-c15395a4a193/scratchpad/ui';
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.css': 'text/css', '.png': 'image/png' };
const VIEWS = [[1280, 720], [2340, 1080]];
const SHOTS = [
  ['menu', ''], ['menu', 'SettingsPanel_BG_Img', 'menu-settings'], ['levels', ''], ['levels', '', 'levels-locked', '&card=4&locked=4,5'], ['hud', ''],
  ['hud', 'LevelCompletePanel,HP_Bg_Image,HungerSlider,PullMoss_Button,HintPanel_Img', 'hud-complete'],
  ['hud', 'PausePanel', 'hud-pause'], ['hud', 'LevelFailPanel', 'hud-fail'], ['letterbox', ''], ['splash', ''],
];
const fails = [];
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
const srv = http.createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(b); });
}).listen(0, async () => {
  const base = `http://localhost:${srv.address().port}/games/fish-bowl/ui.html`;
  const kill = setTimeout(() => { console.log('FAIL timeout'); process.exit(1); }, 170000);
  const browser = await chromium.launch();
  for (const [w, h] of VIEWS) {
    for (const [screen, show, name, extra] of SHOTS) {
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      const bad = [];
      page.on('response', (r) => { if (r.url().includes('/art/ui/') && r.status() >= 400) bad.push(r.url()); });
      page.on('pageerror', (e) => bad.push('pageerror ' + e.message));
      await page.goto(`${base}?screen=${screen}&show=${show}${extra || ''}`);
      await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.ui && window.ui.skipTweens());
      await page.waitForTimeout(300);
      const tag = `${name || screen}-${w}x${h}`;
      await page.screenshot({ path: path.join(OUT, tag + '.png') });
      console.log(tag);
      const err = await page.evaluate(() => window.__error); check(!err && bad.length === 0, `${tag} loads without errors/404s ${err || ""} ${bad.join(" ")}`);
      if (screen === 'menu' && !show) {
        const r = await page.evaluate(() => { const b = window.ui.el('menu', 'Play_Button').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
        check(r[0] >= 0 && r[1] >= 0 && r[2] <= w && r[3] <= h && r[2] - r[0] > 50, `${tag} Play button inside viewport ${r.map(Math.round)}`);
      }
      if (screen === 'levels') {
        const v = await page.evaluate(() => [1, 2, 3, 4, 5].map((i) => {
          window.ui.selectLevel(i);
          const e = window.ui.el('levels', `BtnsContainer_WithoutScroll/Level${i}Button`), b = e.getBoundingClientRect();
          return [b.left, b.top, b.right, b.bottom, e.offsetParent ? 1 : 0];
        }));
        await page.evaluate(() => window.ui.selectLevel(1));
        check(v.every((r) => r[4] && r[0] >= 0 && r[2] <= w && r[1] >= 0 && r[3] <= h && r[2] - r[0] > 50), `${tag} level cards 1..5 visible ${JSON.stringify(v.map((r) => r.map(Math.round)))}`);
      }
      if (screen === 'hud' && !show) {
        const c = await page.evaluate(() => { const b = window.ui.el('hud', 'Joystick-Region (LeftRightForward)').getBoundingClientRect(); window.__held = []; window.ui.onPress('hud', 'SwimUp-Button', (d) => window.__held.push(d)); return [b.left + b.width / 2, b.top + b.height / 2, b.width / 2]; });
        await page.mouse.move(c[0], c[1]); await page.mouse.down(); await page.mouse.move(c[0] + c[2] * 3, c[1] - c[2] * 0.5);
        const j = await page.evaluate(() => window.ui.joystick());
        await page.mouse.up();
        const j0 = await page.evaluate(() => window.ui.joystick());
        check(j.x > 0.9 && j.y > 0.1 && Math.hypot(j.x, j.y) <= 1.001 && j0.x === 0, `${tag} joystick drag ${JSON.stringify(j)} then release ${JSON.stringify(j0)}`);
        const u = await page.evaluate(() => { const b = window.ui.el('hud', 'SwimUp-Button').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
        await page.mouse.move(u[0], u[1]); await page.mouse.down(); await page.mouse.up();
        check(JSON.stringify(await page.evaluate(() => window.__held)) === '[true,false]', `${tag} SwimUp press/release events`);
      }
      await page.context().close();
    }
  }
  await browser.close();
  clearTimeout(kill);
  srv.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
  process.exit(fails.length ? 1 : 0);
});
