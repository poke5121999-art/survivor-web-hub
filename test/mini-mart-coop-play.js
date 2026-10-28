/*
 * My Mini Mart Together in two real browsers over the real Unity Relay: A opens a public store from the menu, B finds
 * it in Join Store and joins, both play with the solo bot (?bot) for MMC_SECONDS, then B leaves.
 *   node test/mini-mart-coop-play.js                 local static server on the repo
 *   MMC_URL=https://poke5121999-art.github.io/survivor-web-hub/games/mini-mart-coop/index.html node test/mini-mart-coop-play.js
 *   PLAYWRIGHT=<path to playwright or playwright-core>
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SECONDS = +(process.env.MMC_SECONDS || 60);
const SHOTS = process.env.MMC_SHOTS || path.join(ROOT, 'shots', 'mini-mart-coop');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const check = (name, ok, info) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${info != null ? `  (${info})` : ''}`); };

function serve() {
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (err, buf) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
        res.end(buf);
      });
    }).listen(0, () => ok(s));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = process.env.MMC_URL ? null : await serve();
  const url = process.env.MMC_URL || `http://localhost:${server.address().port}/games/mini-mart-coop/index.html`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const open = async (who, size) => {
    const ctx = await browser.newContext({ viewport: size });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${who}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${who} ${r.status()} ${r.url()}`); });
    return page;
  };
  const watchdog = setTimeout(() => { console.log('  FAIL timed out'); process.exit(1); }, (SECONDS + 240) * 1000);

  const a = await open('A', { width: 1280, height: 720 });
  const t0 = Date.now();
  await a.goto(`${url}?bot`);
  await a.waitForFunction(() => window.__mmc && window.__mmc.menuAt, null, { timeout: 15000 });
  const menuMs = await a.evaluate(() => Math.round(window.__mmc.menuAt));
  check('menu shows before the 3D store loads', menuMs < 1500, `${menuMs} ms after navigation start, wall ${Date.now() - t0} ms`);
  await a.waitForFunction(() => window.__mmc.backdrop === 'textures', null, { timeout: 60000 }).catch(() => {});
  check('menu backdrop plays the store behind the menu', await a.evaluate(() => window.__mmc.backdrop), null);
  await a.screenshot({ path: path.join(SHOTS, 'a-menu.png') });

  await a.getByText(/Cửa hàng mới|New Store/).first().click();
  const nameBox = a.locator('.mm-stage input').first();
  await nameBox.fill('Relay Test Mart');
  // Public, so B finds it in the list.
  for (let i = 0; i < 2 && !(await a.locator('.mm-stage').innerText()).match(/Công khai|Public/); i++) await a.locator('.mm-stage button:has-text(">")').first().click();
  await a.screenshot({ path: path.join(SHOTS, 'a-new.png') });
  await a.getByRole('button', { name: /^(Tạo|Create)$/ }).click();
  await a.waitForFunction(() => window.__mmc.role === 'host' && window.__mmc.stage === 'textures', null, { timeout: 60000 });
  const code = await a.evaluate(() => window.__mmc.code);
  check('host opens a store with a room code', /^[A-Z0-9]{6}$/.test(code || ''), code);

  const b = await open('B', { width: 390, height: 844 });
  await b.goto(`${url}?bot&nobg`);
  await b.waitForFunction(() => window.__mmc && window.__mmc.menuAt, null, { timeout: 15000 });
  await b.getByText(/Vào cửa hàng|Join Store/).first().click();
  const row = b.locator('.mm-stage').getByText('Relay Test Mart').first();
  await row.waitFor({ timeout: 30000 });
  await b.screenshot({ path: path.join(SHOTS, 'b-join.png') });
  check('guest sees the public store in Join Store', true);
  await row.click();
  await b.waitForFunction(() => window.__mmc.role === 'guest' && window.__mmc.stage === 'textures', null, { timeout: 60000 });
  check('guest enters the same mart', await b.evaluate(() => window.__mmc.game.store && window.__mmc.me), null);
  await a.waitForFunction(() => window.__mmc.roster && window.__mmc.roster.length === 2, null, { timeout: 15000 });
  check('host roster shows both players', true, (await a.evaluate(() => window.__mmc.roster)).join(', '));

  const startPos = await a.evaluate(() => { const r = Object.values(window.__mmc.game.sim.state.remotes)[0]; return { x: r.player.x, z: r.player.z }; });
  await a.waitForTimeout(SECONDS * 1000);
  const host = await a.evaluate(() => {
    const g = window.__mmc.game, st = g.sim.state, r = Object.values(st.remotes)[0];
    return { cash: st.cash, done: Object.values(st.mats).filter(m => m.done).length, rx: r.player.x, rz: r.player.z, carry: r.carry.length,
      avatars: g.remotes.avatars.size, bytes: window.__mmc.net.bytes, tags: document.querySelectorAll('.mmc-tag').length };
  });
  const guest = await b.evaluate(() => {
    const g = window.__mmc.game, st = g.sim.state;
    return { cash: st.cash, done: Object.values(st.mats).filter(m => m.done).length, ticks: window.__mmc.net.stats.ticks,
      resyncs: window.__mmc.net.stats.resyncs, remotes: Object.keys(st.remotes), avatars: g.remotes.avatars.size };
  });
  const moved = Math.hypot(host.rx - startPos.x, host.rz - startPos.z);
  check('host sees the guest walk', moved > 2, `${moved.toFixed(1)} m`);
  check('both players draw the other (avatar + name tag)', host.avatars === 1 && host.tags === 1 && guest.avatars === 1 && guest.remotes.includes('host'));
  check('guest copy keeps up with the host', Math.abs(guest.done - host.done) <= 1 && guest.ticks > SECONDS * 8,
    `pads ${guest.done}/${host.done}, ${guest.ticks} ticks, ${guest.resyncs} resyncs, cash ${guest.cash}/${host.cash}`);
  check('store makes progress', host.done >= 3, `${host.done} pads`);
  const kbs = host.bytes.tick / SECONDS / 1024;
  check('relay stream per guest under 10 KB/s', kbs < 10, `${kbs.toFixed(2)} KB/s, welcome ${(host.bytes.full / 1024).toFixed(1)} KB`);
  await a.screenshot({ path: path.join(SHOTS, 'a-store.png') });
  await b.screenshot({ path: path.join(SHOTS, 'b-store.png') });

  await b.locator('.mmc-bar .leave').click();
  await a.waitForFunction(() => window.__mmc.roster.length === 1, null, { timeout: 20000 }).then(() => check('host sees the guest leave', true), () => check('host sees the guest leave', false));
  await b.waitForFunction(() => window.__mmc && window.__mmc.menuAt && !window.__mmc.role, null, { timeout: 15000 }).then(() => check('guest is back at the menu', true), () => check('guest is back at the menu', false));

  await a.locator('.mmc-bar .leave').click();
  await a.waitForTimeout(1500);
  const real = errors.filter(e => !/favicon/.test(e));
  check('no page errors, console errors or failed requests', real.length === 0, real.slice(0, 5).join(' | '));
  clearTimeout(watchdog);
  await browser.close();
  if (server) server.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
