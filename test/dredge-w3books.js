/*
 * DREDGE - kiem doc sach theo thoi gian (js/books.js) bang chuot/phim that. Chay: node test/dredge-w3books.js
 * So goc: ResearchCoroutine.cs (chi tinh khi khong co thoi gian cuong buc), speed-1 daysToResearch 1, MOVEMENT_SPEED +0,05, ecology-1 FISHING_SUSTAIN +0,1.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w3books');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  OK   ' : '  FAIL ') + name + (detail ? '  — ' + detail : '')); }
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), 'được ' + JSON.stringify(got) + (JSON.stringify(got) === JSON.stringify(want) ? '' : ', cần ' + JSON.stringify(want)));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

async function boot(browser, base, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + ((m.location() || {}).url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  // đi hết hội thoại mở đầu cho tới khi giao diện bến hiện
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
  return { page, errors };
}

async function toSea(page) {
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(500);
  await page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await page.evaluate(() => DR_DEBUG.setTime(0.5));
  await sleep(1000);
}

const dbg = page => page.evaluate(() => { const d = DRCargo.isOpen() ? DRCargo._debug() : null; return d && { tab: d.rightTab, tabs: d.tabs, mode: DR.mode }; });
const shelf = page => page.evaluate(() => [...document.querySelectorAll('.cg-book')].map(b => ({
  id: b.dataset.id, name: b.querySelector('.nm').textContent, st: b.querySelector('.sts').textContent, ds: b.querySelector('.ds').textContent,
  color: b.style.getPropertyValue('--bc'), act: b.classList.contains('act') })));


async function run(browser, base, W, H) {
  const { page, errors } = await boot(browser, base, W, H);
  const tag = W + 'x' + H;
  const books = () => page.evaluate(() => DRBooks.owned().map(e => ({ id: e.id, p: e.progress, a: e.isActive })));
  await page.evaluate(() => { DR.s.ownedNonSpatial = [{ id: 'book-ecology-1', isNew: false }, { id: 'book-speed-1', isNew: false }, { id: 'book-speed-1', isNew: true }]; DRBooks.normalize(); DRBooks.select('book-speed-1'); });
  eq(tag + ' sach trung id bi gop, moi co progress 0, chi speed-1 dang doc', await books(), [{ id: 'book-ecology-1', p: 0, a: false }, { id: 'book-speed-1', p: 0, a: true }]);
  const spd0 = await page.evaluate(() => { DRBoat.refresh(); return DRBoat.stats.speed; });
  // ngu o ben (SLEEP) khong tinh: ResearchCoroutine.cs:27-34 chi tinh khi TimePassageMode NONE o ca hai dau
  const t0 = await page.evaluate(() => DR.s.time);
  await page.evaluate(() => DR.emit('passTime', DRRules.hoursToMorning(DR.s.time), 'SLEEP'));   // cung duong voi RestDestination (dock.js:458)
  await page.waitForFunction(() => !!DRSky.forced, null, { timeout: 5000 });
  await page.waitForFunction(() => !DRSky.forced, null, { timeout: 90000 });
  await sleep(2500);
  const t1 = await page.evaluate(() => DR.s.time);
  check(tag + ' ngu troi thoi gian that (>= 0,1 ngay)', t1 - t0 >= 0.1, 'dt=' + (t1 - t0).toFixed(3));
  eq(tag + ' ngu khong lam cuon dang doc nhich', (await books())[1].p, 0);
  // di thuyen: thoi gian thuong troi, tien do = dNgay / daysToResearch (speed-1: 1 ngay)
  await toSea(page);
  await sleep(1500);
  const a = await page.evaluate(() => [DR.s.time, DRBooks.owned()[1].progress]);
  await page.keyboard.down('KeyW'); await sleep(6000); await page.keyboard.up('KeyW'); await sleep(1500);
  const b = await page.evaluate(() => [DR.s.time, DRBooks.owned()[1].progress]);
  const dt = b[0] - a[0], dp = b[1] - a[1];
  check(tag + ' lai thuyen: thoi gian troi', dt > 0.002, 'dt=' + dt.toFixed(4));
  check(tag + ' lai thuyen: dProgress = dNgay / 1 (sai so 0,01)', Math.abs(dp - dt / 1) < 0.01 + 0.01 * dt, 'dp=' + dp.toFixed(4) + ' dt=' + dt.toFixed(4));
  eq(tag + ' cuon ke (ecology-1) van tren ke, 0%', (await books())[0], { id: 'book-ecology-1', p: 0, a: false });
  // doc xong: thoi gian nhay them (duong tien thoi gian thuong), hieu ung vao chi so
  await page.evaluate(() => { DR.s.time += 0.5; }); await sleep(2300);
  await page.evaluate(() => { DR.s.time += 0.6; }); await sleep(2300);
  const done = await books();
  eq(tag + ' xong: progress kep 1, het isActive', [done[1].p, done[1].a], [1, false]);
  eq(tag + ' xong: cuon ecology-1 van chua chon', done[0], { id: 'book-ecology-1', p: 0, a: false });
  eq(tag + ' loi ich MOVEMENT_SPEED = 0,05', await page.evaluate(() => DRBooks.mod('MOVEMENT_SPEED')), 0.05);
  const spd1 = await page.evaluate(() => DRBoat.stats.speed);
  check(tag + ' toc do thuyen x1,05 (' + spd0.toFixed(3) + ' -> ' + spd1.toFixed(3) + ')', Math.abs(spd1 / spd0 - 1.05) < 1e-6);
  const bn = await page.evaluate(() => DRBanner.history.filter(h => h.kind === 'book').map(h => [h.id, h.title]));
  eq(tag + ' banner sach xong', bn, [['book-speed-1', 'Correct Engine Operation']]);
  await page.screenshot({ path: path.join(SHOTS, 'banner-' + tag + '.png') });
  const p2 = await page.evaluate(() => DRBooks.owned()[0].progress); await page.evaluate(() => { DR.s.time += 0.3; }); await sleep(2300);
  eq(tag + ' khong cuon dang doc: sach tren ke khong nhich', (await books())[0].p, p2);
  // chon cuon ke tren ke bang chuot, roi thoi gian troi thi nhich
  await page.keyboard.press('Tab'); await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 });
  await page.keyboard.press('KeyQ'); await sleep(500);
  const sh = await shelf(page);
  eq(tag + ' ke: ecology-1 tren ke 0%, speed-1 da doc xong', sh.map(x => [x.id, x.st, x.act]), [['book-ecology-1', '(Trên kệ - 0% xong)', false], ['book-speed-1', '(Đã đọc xong)', false]]);
  await page.screenshot({ path: path.join(SHOTS, 'shelf-' + tag + '.png') });
  await page.click('.cg-book[data-id="book-ecology-1"]'); await sleep(300);
  await page.evaluate(() => { DRCargo.close(); DR.setMode('sail'); }); await sleep(500);
  await page.evaluate(() => { DR.s.time += 0.4; }); await sleep(2300);
  const e1 = (await books())[0];
  check(tag + ' chon ecology-1 roi troi 0,4 ngay: progress ~0,4', e1.a && Math.abs(e1.p - 0.4) < 0.03, JSON.stringify(e1));
  await page.evaluate(() => { DR.s.time += 0.7; }); await sleep(2300);
  eq(tag + ' ecology-1 xong: FISHING_SUSTAIN 0,1', await page.evaluate(() => DRBooks.mod('FISHING_SUSTAIN')), 0.1);
  eq(tag + ' khong loi trang / console / HTTP >= 400', errors, []);
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try { await run(browser, base, 1280, 720); } finally { await browser.close(); if (srv) srv.close(); }
  console.log(out.join('\n'));
  console.log('\n' + pass + ' dat, ' + fail + ' hong  - anh o ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
