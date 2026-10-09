/*
 * DREDGE - Bien Mu: kiem chai thu (ItemPOI trong js/poi.js) va cua so Thu tin (js/messages.js, phim I) bang phim that.
 * Gia tri goc: 10 ItemPOI "[112] message-3 1/1"... trong Game.unity (art/world/markers.json), ban kinh poiCollider 2, kho 1 (ItemPOIDataModel.GetStartStock);
 * ItemPOIHandler.OnPressComplete = AddItemById + OnHarvested (chai bien mat); MessagesWindow: xep isNew truoc roi chronologicalOrder, bo dem "n / tong set";
 * phim mo = Key.I (DredgeControlBindings.cs:371); clip ObBBFGMem5U t=1622 / t=2070.
 *
 * Chay: node test/dredge-w3msg.js        Ra: %TEMP%/dredge-w3msg/*.png (1920x1080 va 844x390)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w3msg');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' (' + (typeof a === 'number' ? a.toFixed(2) : a) + ' ~ ' + (typeof b === 'number' ? b.toFixed(2) : b) + ' +-' + tol + ')');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const ROOT = path.resolve(__dirname, '..');
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
async function load(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
}
async function newGame(page) {
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
}
async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}
async function toSea(page) {
  await dockReady(page);
  await ev(page, () => DR.setMode('sail'));
  await sleep(500);
  await ev(page, () => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await ev(page, () => DR_DEBUG.setTime(0.5));
  await sleep(800);
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  return errors;
}

// ------------------------------------------------------------------------------------------------ giá trị gốc
// 10 ItemPOI chai thư trong markers.json (message-1..10), bán kính 2, ví dụ message-3 tại (82,5 ; -59,7)
// MessageItemData (data/items.js): set 0 có 10 thư; message-1 order 0, message-3 order 2, message-4 order 3
const B3 = { id: '112', item: 'message-3', x: 82.5, z: -59.7, r: 2 };

async function tp(page, x, z) {
  await ev(page, ([x, z]) => DR_DEBUG.teleport(x, z, 0), [x, z]);
  await sleep(500);
}
const dbg = page => ev(page, () => DRPoi._debug());
const owned = page => ev(page, () => DR.s.ownedNonSpatial.map(e => e.id));

async function msgTests(page, vw, vh, tag) {
  console.log('Chai thư và Thư tín ' + tag);
  const bs = await ev(page, () => DR_POI.items);
  ok(bs.length === 10, 'data/poi.js có 10 chai thư (ItemPOI trong markers.json); có ' + bs.length);
  const b3 = bs.find(b => b.item === 'message-3');
  near(b3.x, B3.x, 0.01, 'chai message-3 x'); near(b3.z, B3.z, 0.01, 'chai message-3 z'); ok(b3.r === B3.r, 'bán kính 2');
  ok(bs.every(b => /^message-\d+$/.test(b.item)) && new Set(bs.map(b => b.item)).size === 10, '10 chai ứng 10 thư khác nhau');

  // ---- xa chai: không gợi ý
  await tp(page, B3.x - 20, B3.z);
  let d = await dbg(page);
  ok(d.near === null && !d.prompt, 'cách chai 20 m: không điểm gần, không gợi ý');
  // ---- trong tầm: dấu "?" + "Nhặt F"
  await tp(page, B3.x - 2.5, B3.z);
  await page.waitForFunction(() => DRPoi._debug().near === '112', null, { timeout: 4000 }).catch(() => {});
  await sleep(1200);
  d = await dbg(page);
  ok(d.near === '112', 'cách chai 2,5 m: điểm gần = chai 112 (' + d.near + ')');
  ok(d.prompt && await ev(page, () => /Nhặt/.test(document.querySelector('.poi-prompt').textContent) && document.querySelector('.poi-prompt kbd').textContent === 'F'), 'gợi ý đọc "Nhặt" + phím F');
  ok(d.marker.opacity > 0.95, 'dấu "?" hiện đủ (opacity ' + d.marker.opacity + ')');
  await page.screenshot({ path: path.join(OUT, 'bottle-prompt-' + tag + '.png') });
  // ---- F nhặt: thư vào sổ, chai biến mất, bấm lại không nhặt thêm
  ok(!(await owned(page)).includes('message-3'), 'trước khi nhặt chưa có message-3');
  await page.keyboard.press('KeyF');
  await sleep(500);
  ok((await owned(page)).filter(x => x === 'message-3').length === 1, 'F thêm đúng một message-3 vào sổ');
  await sleep(1200);
  d = await dbg(page);
  ok(d.near === null && !d.prompt && !d.bottlesLeft.includes('112') && d.bottlesLeft.length === 9, 'chai biến mất: không gợi ý, còn 9 chai');
  await page.keyboard.press('KeyF'); await sleep(400);
  ok((await owned(page)).filter(x => x === 'message-3').length === 1, 'đứng lại chỗ cũ bấm F: không nhặt thêm lần hai');
  ok(await ev(page, () => { DR.save(); const s = JSON.parse(localStorage.getItem('dredge.save.v1')); return !!s.itemPoiTaken && s.itemPoiTaken['112'] === 1; }), 'sổ lưu ghi chai 112 đã nhặt');

  // ---- cửa sổ Thư tín
  await ev(page, () => { DRYarn.addItem('message-4'); DRYarn.addItem('message-1'); });
  await page.keyboard.press('KeyI');
  await page.waitForFunction(() => DRMessages.isOpen(), null, { timeout: 4000 }).catch(() => {});
  await sleep(700);
  let m = await ev(page, () => DRMessages._debug());
  ok(m.open, 'phím I mở cửa sổ Thư tín');
  ok(await ev(page, () => !DRCargo.isOpen()), 'phím I không còn mở bảng khoang (Tab mới mở)');
  ok(m.count === 3 && m.total === 10, 'bộ đếm 3 / 10 (set 0), được ' + m.count + ' / ' + m.total);
  ok(m.order.slice().sort().join() === 'message-1,message-3,message-4', 'danh sách đủ 3 thư đã nhặt');
  ok(m.selected === m.order[0] && m.newCount === 2, 'thư đầu được chọn và coi như đã xem (còn ' + m.newCount + ' thư mới)');
  ok(await ev(page, () => document.querySelector('#dr-msg .mg-count').textContent === '3 / 10'), 'chữ bộ đếm "3 / 10"');
  ok(await ev(page, () => document.querySelector('#dr-msg .mg-card h2').textContent === DR_ITEMS[DRMessages._debug().selected].name), 'thẻ giấy kem mang tên thư đang chọn');
  const ts = await ev(page, () => DR.timeScale);
  ok(ts < 0.01, 'thời gian đóng băng khi cửa sổ mở (timeScale ' + ts + ')');
  const p0 = await ev(page, () => ({ x: DR.s.boat.x, z: DR.s.boat.z }));
  await page.keyboard.down('KeyD'); await sleep(500); await page.keyboard.up('KeyD');
  const p1 = await ev(page, () => ({ x: DR.s.boat.x, z: DR.s.boat.z, y: DR.s.boat.yaw }));
  ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05, 'phím lái bị nuốt khi cửa sổ mở');
  const sel0 = m.selected;
  await page.keyboard.press('ArrowDown'); await sleep(250);
  m = await ev(page, () => DRMessages._debug());
  ok(m.selected === m.order[1] && m.selected !== sel0, 'mũi tên xuống chọn thư kế (' + m.selected + ')');
  await page.keyboard.press('KeyQ'); await sleep(250);
  m = await ev(page, () => DRMessages._debug());
  ok(m.selected === m.order[0], 'Q quay về thư trước');
  ok(await ev(page, () => {
    const b = DR_ITEMS[DRMessages._debug().selected].messageBodyKey.replace(/<\/?i>/g, '').replace(/\s+/g, '');
    return document.querySelector('#dr-msg .mg-card .mg-body').textContent.replace(/\s+/g, '') === b;
  }), 'thân thư đúng lời gốc tiếng Anh của thư đang chọn');
  await page.screenshot({ path: path.join(OUT, 'messages-' + tag + '.png') });
  await page.keyboard.press('Escape'); await sleep(500);
  ok(!(await ev(page, () => DRMessages.isOpen())), 'Esc đóng cửa sổ');
  ok(await ev(page, () => DR.timeScale > 0.9), 'thời gian chạy lại sau khi đóng');
  await page.keyboard.press('KeyI'); await sleep(500);
  ok(await ev(page, () => DRMessages.isOpen()), 'I mở lại');
  await page.keyboard.press('KeyI'); await sleep(500);
  ok(!(await ev(page, () => DRMessages.isOpen())), 'I lần nữa đóng');
  // nút "Thư tín" ở tab CABIN mở cùng cửa sổ
  await page.keyboard.press('Tab'); await sleep(700);
  ok(await ev(page, () => DRCargo.isOpen()), 'Tab mở bảng khoang');
  await page.keyboard.press('KeyE'); await sleep(500);
  const clicked = await ev(page, () => { const b = document.querySelector('[data-btn="MessagesButton"]'); if (!b || b.classList.contains('off')) return false; b.click(); return true; });
  ok(clicked, 'tab CABIN có nút "Thư tín" bật được (không còn .off)');
  if (clicked) {
    await sleep(700);
    ok(await ev(page, () => DRMessages.isOpen()), 'bấm nút Thư tín mở cửa sổ Thư tín');
    await page.keyboard.press('Escape'); await sleep(700);
    ok(await ev(page, () => !DRMessages.isOpen() && DRCargo.isOpen()), 'đóng Thư tín thì về lại bảng khoang tab CABIN');
  }
  await page.keyboard.press('Escape'); await sleep(500);
}

(async () => {
  const srv = await serve(), base = process.env.DR_URL || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  let errors = [];
  const sizes = process.env.PHONE_ONLY ? [[844, 390, 'phone']] : [[1920, 1080, '1080'], [844, 390, 'phone']];
  for (const [vw, vh, tag] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await ctx.newPage();
    errors = errors.concat(watch(page));
    await load(page, base);
    await newGame(page);
    await toSea(page);
    await ev(page, () => DR_DEBUG.setTime(0.5));
    try { await msgTests(page, vw, vh, tag); } catch (e) { fail++; console.log('  FAIL ngoại lệ: ' + e.message.split('\n')[0]); }
    await ctx.close();
  }
  const uniq = [...new Set(errors)];
  ok(uniq.length === 0, 'không có pageerror / console.error / HTTP >= 400' + (uniq.length ? ': ' + uniq.slice(0, 5).join(' ; ') : ''));
  console.log('\n' + pass + ' pass, ' + fail + ' fail -> ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
