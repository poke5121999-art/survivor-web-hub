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
  // A signed-in hub account without Supabase: save-sync.js is swapped for a HubSave whose one cloud row lives here.
  let cloudRow = null;
  const FAKE_HUB = `window.HubSave = { isAvailable: () => true, whoAmI: () => ({ signedIn: true, userId: 'u-test' }),
    loadSave: id => window.__cloudLoad(id), storeSave: (id, payload, opts) => window.__cloudStore(id, payload, opts) };`;
  const open = async (who, size, cloud = false) => {
    const ctx = await browser.newContext({ viewport: size });
    if (cloud) {
      await ctx.route('**/js/save-sync.js*', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_HUB }));
      await ctx.exposeFunction('__cloudLoad', () => (cloudRow ? { ok: true, found: true, payload: cloudRow } : { ok: true, found: false }));
      await ctx.exposeFunction('__cloudStore', (id, payload) => { if (id === 'mini-mart-coop') cloudRow = payload; return { ok: true }; });
    }
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${who}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${who} ${r.status()} ${r.url()}`); });
    return page;
  };
  const watchdog = setTimeout(() => { console.log('  FAIL timed out'); process.exit(1); }, (SECONDS + 240) * 1000);

  const a = await open('A', { width: 1280, height: 720 }, true);
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
  await a.waitForFunction(() => window.__mmc.role === 'host' && window.__mmc.stage === 'textures', null, { timeout: 60000 }).catch(async e => {
    console.log('  host never entered:', await a.evaluate(() => [window.__mmc.stage, document.querySelector('.mm-toast') && document.querySelector('.mm-toast').textContent]), errors);
    throw e;
  });
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

  const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
  const vis = { bCustom: await shown(b, '#custombtn'), bMap: await shown(b, '#mapbtn'), bSpin: await shown(b, '#spinbtn') };
  check('guest has outfits but not the store meta (map, shop, spin)', vis.bCustom && !vis.bMap && !vis.bSpin, JSON.stringify(vis));

  // Outfits: the guest puts on another hat through the Customise state, as its buttons do.
  const hat = await b.evaluate(() => {
    const c = window.__mmc.game.hud.customise, own = [...c.state.own.hats];
    c.state.eq.hat = own.find(h => h !== c.state.eq.hat) ?? own[0];
    c.onChange();
    return c.state.eq.hat;
  });
  await a.waitForFunction(h => { const r = Object.values(window.__mmc.game.sim.state.remotes)[0]; return r && r.looks && r.looks.hat === h; }, hat, { timeout: 10000 })
    .then(() => check('host sees the hat the guest put on', true, `hat ${hat}`), () => check('host sees the hat the guest put on', false, `hat ${hat}`));

  const delRow = p => p.evaluate(() => { const r = document.querySelector('#hud .delrow'); return !!r && r.style.display !== 'none'; });
  check('Settings has Delete Account for host and guest (solo 5892b409)', await delRow(a) && await delRow(b));

  // A friend's staff upgrade (Upgrades menu, staff row, cash button): it once reached the host without the row's price
  // base, priced NaN and froze the shared wallet at NaN.
  const staff = await a.evaluate(() => {
    const g = window.__mmc.game, sim = g.sim, R = g.hud.upgradeRows, row = R && R.tabs.workers.find(r => r.kind === 'worker'), w = row && { name: row.node };
    sim.state.cash += 100000;
    return w && { name: w.name, cash: sim.state.cash, lv: sim.workerLevel(w.name).speed, price: sim.upgradeOffer({ kind: 'worker', name: w.name, base: sim.store.unlockCost(w.name) }, 'speed').price };
  });
  if (!staff) check('guest staff upgrade keeps the wallet a number', false, 'Store 1 has no staff row in Upgrades');
  else {
    await b.waitForFunction(c => window.__mmc.game.sim.state.cash >= c - 5000, staff.cash, { timeout: 10000 });
    await b.evaluate(n => { const s = window.__mmc.game.sim; s.buyUpgrade({ kind: 'worker', name: n, base: s.store.unlockCost(n) }, 'speed'); }, staff.name);
    await a.waitForFunction(([n, lv]) => window.__mmc.game.sim.workerLevel(n).speed > lv || !Number.isFinite(window.__mmc.game.sim.state.cash), [staff.name, staff.lv], { timeout: 10000 }).catch(() => {});
    const after = await a.evaluate(n => ({ cash: window.__mmc.game.sim.state.cash, lv: window.__mmc.game.sim.workerLevel(n).speed }), staff.name);
    check('guest staff upgrade keeps the wallet a number', Number.isFinite(after.cash) && after.lv === staff.lv + 1 && after.cash <= staff.cash - staff.price + 2000,
      `${staff.name} speed ${staff.lv}→${after.lv}, price ${staff.price}, cash ${staff.cash}→${after.cash}`);
  }

  // The host takes the room to Store 2 (what the van and the map's GO do), with a worker booster running.
  await a.evaluate(() => window.__mmc.game.sim.boosters.grant('worker', 600));
  // A store saved during the staff upgrade bug carries NaN cash; the next mart opens with a number again.
  await a.evaluate(() => { window.__mmc.game.sim.state.cash = NaN; });
  await a.evaluate(() => window.__mmc.travel('store2'));
  await a.waitForFunction(() => window.__mmc.game.mart === 'store2' && window.__mmc.stage === 'textures', null, { timeout: 60000 });
  await b.waitForFunction(() => window.__mmc.game && window.__mmc.game.mart === 'store2' && window.__mmc.stage === 'textures', null, { timeout: 60000 })
    .then(() => check('the whole room moves to Store 2', true), () => check('the whole room moves to Store 2', false));
  await a.waitForTimeout(4000);
  const moved2 = await b.evaluate(() => ({ remotes: Object.keys(window.__mmc.game.sim.state.remotes), cash: window.__mmc.game.sim.state.cash }));
  const hostCash2 = await a.evaluate(() => window.__mmc.game.sim.state.cash);
  check('in Store 2 they see each other and share the wallet', moved2.remotes.includes('host') && Math.abs(moved2.cash - hostCash2) <= 5, `cash ${moved2.cash}/${hostCash2}`);
  // Solo rule (hud.js featuresOn): map and outfits come in after Store 1's tutorial or at a second mart.
  check('host gets the mart map and outfits once a second mart is reached', await shown(a, '#mapbtn') && await shown(a, '#custombtn'));
  const boostLeft = await a.evaluate(() => window.__mmc.game.sim.boosters.left('worker'));
  const healed = await a.evaluate(() => window.__mmc.game.sim.state.cash);
  check('a NaN wallet saved by the old bug opens the next mart as a number', Number.isFinite(healed), `cash ${healed}`);
  check('a running booster carries on in the next mart (solo 358377bf)', boostLeft > 550 && boostLeft <= 600, `${Math.round(boostLeft)} s left`);
  await a.screenshot({ path: path.join(SHOTS, 'a-store2.png') });
  await b.screenshot({ path: path.join(SHOTS, 'b-store2.png') });

  // The guest's relay socket drops: it comes back on its own.
  await b.evaluate(() => window.__mmc.net.link.ws.close());
  await b.waitForFunction(() => window.__mmc.reconnecting === 1 && window.__mmc.role === 'guest' && window.__mmc.stage === 'textures' && window.__mmc.net.link.ws.readyState === 1, null, { timeout: 60000 })
    .then(() => check('guest reconnects after its link drops', true), () => check('guest reconnects after its link drops', false));
  await a.waitForFunction(() => window.__mmc.roster.length === 2, null, { timeout: 30000 })
    .then(async () => check('host is back to two players (the dropped one timed out)', true, (await a.evaluate(() => window.__mmc.roster)).join(', ')),
      () => check('host is back to two players (the dropped one timed out)', false));

  await b.locator('.mmc-bar .leave').click();
  await a.waitForFunction(() => window.__mmc.roster.length === 1, null, { timeout: 20000 }).then(() => check('host sees the guest leave', true), () => check('host sees the guest leave', false));
  await b.waitForFunction(() => window.__mmc && window.__mmc.menuAt && !window.__mmc.role, null, { timeout: 15000 }).then(() => check('guest is back at the menu', true), () => check('guest is back at the menu', false));

  await a.locator('.mmc-bar .leave').click();
  await a.waitForTimeout(1500);
  const up = cloudRow && Object.values(cloudRow.stores || {}).find(r => r.name === 'Relay Test Mart');
  check('the store went up to the hub account', !!up && up.mart === 'store2' && !!up.marts.store1 && !!up.marts.store2, up && `mart ${up.mart}, marts ${Object.keys(up.marts)}`);

  // Another browser on the same account: the store is in Load Store, and loading it opens Store 2 with the booster.
  const c = await open('C', { width: 1280, height: 720 }, true);
  await c.goto(`${url}?nobg`);
  await c.waitForFunction(() => window.__mmc && window.__mmc.cloud && window.__mmc.cloud !== 'off', null, { timeout: 20000 }).catch(() => {});
  await c.getByText(/Tải cửa hàng|Load Store/).first().click();
  const saved = c.locator('.mm-row', { hasText: 'Relay Test Mart' }).first();
  await saved.waitFor({ timeout: 10000 }).then(() => check('Load Store on another device lists the store from the account', true),
    () => check('Load Store on another device lists the store from the account', false, String(cloudRow && Object.keys(cloudRow.stores || {}))));
  await saved.getByRole('button', { name: /^(Tải|Load)$/ }).click();
  await c.waitForFunction(() => window.__mmc.role === 'host' && window.__mmc.stage === 'textures', null, { timeout: 60000 })
    .then(() => check('loading it reopens the store as host', true), () => check('loading it reopens the store as host', false));
  const loaded = await c.evaluate(() => ({ mart: window.__mmc.game.mart, boost: window.__mmc.game.sim.boosters.left('worker') }));
  check('it reopens in Store 2 with the booster still running', loaded.mart === 'store2' && loaded.boost > 500, `${loaded.mart}, ${Math.round(loaded.boost)} s`);

  // Delete Account from Settings: confirm, then everything goes here and in the account.
  await c.evaluate(() => { document.querySelector('#hud [data-del]').click(); });
  await c.locator('#delconfirm [data-act="delete"]').click();
  await c.waitForFunction(() => window.__mmc && window.__mmc.menuAt && !window.__mmc.role, null, { timeout: 20000 }).catch(() => {});
  const left = await c.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mmc-store-') || k === 'mmc-wardrobe').length);
  check('Delete Account erases the stores here and in the account', left === 0 && cloudRow && Object.keys(cloudRow.stores).length === 0 && cloudRow.wipedAt > 0,
    `${left} local, ${cloudRow && Object.keys(cloudRow.stores).length} in the account`);
  const real = errors.filter(e => !/favicon/.test(e));
  check('no page errors, console errors or failed requests', real.length === 0, real.slice(0, 5).join(' | '));
  clearTimeout(watchdog);
  await browser.close();
  if (server) server.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
