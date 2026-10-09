/*
 * DREDGE — kiểm tab CABIN của bảng khoang (js/cargo.js, V18) bằng phím và chuột thật của Playwright.
 *
 * Chạy:  node test/dredge-w2cabin.js            (DR_URL=... để chạy trên Pages)
 * Ảnh ra %TEMP%/dredge-w2cabin/ (1280x720 và 844x390).
 * Số kỳ vọng từ bản gốc: tab Cargo/Cabin có ô phím Q / E hai đầu (video ObBBFGMem5U t=2190), nút Pursuits [J], Map [M], Messages [I],
 * Encyclopedia [L] (CabinPanel), sách đang đọc WARNING #ff9a3b, sách trên kệ NEUTRAL #ffffff, "(Reading - 0% complete)" / "(On Shelf - 0% complete)".
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w2cabin');
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

async function run(browser, base, W, H, full) {
  const { page, errors } = await boot(browser, base, W, H);
  const tag = W + 'x' + H;
  // ---- ở bến: tab CABIN không có (PlayerTabbedPanel: Cabin chỉ ngoài biển; ở bến là Storage)
  await page.evaluate(() => DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang' }));
  await sleep(300);
  eq(tag + ' ở bến: chỉ tab Khoang, không Q/E, không CABIN', await page.evaluate(() => ({ tabs: [...document.querySelectorAll('.cg-right .cg-tab')].map(t => t.dataset.tab), qe: document.querySelectorAll('.cg-qe').length })), { tabs: ['INVENTORY'], qe: 0 });
  await page.evaluate(() => DRCargo.close());
  await toSea(page);
  await page.evaluate(() => { DR.s.ownedNonSpatial = [{ id: 'book-ecology-1', isNew: false, progress: 0 }, { id: 'book-speed-1', isNew: false, progress: 0, isActive: true }, { id: 'message-1', isNew: true }]; });

  // ---- Tab mở khoang ở biển: hai tab + ô phím Q / E
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 });
  await sleep(700);
  eq(tag + ' ở biển: tab Khoang đang chọn, Phòng chưa chọn', await page.evaluate(() => [...document.querySelectorAll('.cg-right .cg-tab')].map(t => t.dataset.tab + (t.classList.contains('sel') ? '*' : ''))), ['INVENTORY*', 'CABIN']);
  eq(tag + ' ô phím hai đầu thanh tab', await page.evaluate(() => [...document.querySelectorAll('.cg-right .cg-qe')].map(b => b.textContent)), ['Q', 'E']);

  // ---- E sang CABIN
  await page.keyboard.press('KeyE');
  await sleep(500);
  eq(tag + ' E: sang tab CABIN', (await dbg(page)).tab, 'CABIN');
  const btn = await page.evaluate(() => [...document.querySelectorAll('.cg-cbtn')].map(b => ({ id: b.dataset.btn, key: b.querySelector('.cg-cbk').textContent, off: b.classList.contains('off'), text: b.textContent.replace(/[A-Z]$/, '') })));
  eq(tag + ' bốn nút CabinPanel và phím', btn.map(b => [b.id, b.key, b.off]), [['JournalButton', 'J', false], ['MapButton', 'M', false], ['MessagesButton', 'I', false], ['EncyclopediaButton', 'L', false]]);
  const sh = await shelf(page);
  eq(tag + ' giá sách: sách đang đọc lên đầu', sh.map(b => b.id), ['book-speed-1', 'book-ecology-1']);
  eq(tag + ' sách đang đọc: màu WARNING, "(Đang đọc - 0% xong)"', [sh[0].color, sh[0].st, sh[0].act], ['#ff9a3b', '(Đang đọc - 0% xong)', true]);
  eq(tag + ' sách trên kệ: màu NEUTRAL, "(Trên kệ - 0% xong)", "Đọc để mở khoá"', [sh[1].color, sh[1].st, sh[1].ds, sh[1].act], ['#ffffff', '(Trên kệ - 0% xong)', 'Đọc để mở khoá', false]);
  eq(tag + ' tên sách lấy từ data/items.js', [sh[0].name, sh[1].name], ['Correct Engine Operation', 'Sustainable Fishing']);
  const geo = await page.evaluate(() => { const r = s => { const e = document.querySelector(s); const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map(Math.round); }; return { panel: r('.cg-right'), cabin: r('.cg-cabin'), shelf: r('.cg-books'), btnJ: r('[data-btn="JournalButton"]'), btnE: r('[data-btn="EncyclopediaButton"]') }; });
  // JournalButton 275x45 trong ButtonContainer (130 cao); --s = k (CanvasScaler theo chiều cao)
  const k = await page.evaluate(() => DRCargo._debug().k);   // cargo.js kẹp k >= MIN_K cho điện thoại
  check(tag + ' nút Pursuits rộng 275 x k, cao 45 x k', Math.abs(geo.btnJ[2] - 275 * k) <= 2 && Math.abs(geo.btnJ[3] - 45 * k) <= 2, JSON.stringify(geo.btnJ));
  check(tag + ' nằm trong bảng phải', geo.cabin[0] >= geo.panel[0] && geo.cabin[0] + geo.cabin[2] <= geo.panel[0] + geo.panel[2] + 1 && geo.btnE[0] + geo.btnE[2] <= geo.panel[0] + geo.panel[2] + 1, JSON.stringify(geo));
  await page.screenshot({ path: path.join(SHOTS, 'cabin-' + tag + '.png') });

  // ---- chọn sách: bấm cuốn trên kệ -> thành sách đang đọc, cuốn kia hết active
  await page.click('.cg-book[data-id="book-ecology-1"]');
  await sleep(200);
  eq(tag + ' bấm sách trên kệ: thành sách đang đọc và lên đầu', (await shelf(page)).map(b => [b.id, b.act]), [['book-ecology-1', true], ['book-speed-1', false]]);
  eq(tag + ' lưu vào DR.s.ownedNonSpatial', await page.evaluate(() => DR.s.ownedNonSpatial.filter(o => o.isActive).map(o => o.id)), ['book-ecology-1']);

  // ---- Q về tab Khoang rồi E lại; có món trên tay thì không đổi tab
  await page.keyboard.press('KeyQ'); await sleep(300);
  eq(tag + ' Q: về tab Khoang (lưới hiện lại)', await page.evaluate(() => [DRCargo._debug().rightTab, !!document.querySelector('.cg-right .cg-zone')]), ['INVENTORY', true]);
  await page.keyboard.press('KeyQ'); await sleep(300);
  eq(tag + ' Q ở tab đầu: vòng sang tab cuối (CABIN)', (await dbg(page)).tab, 'CABIN');

  if (full) {
    // ---- nút Map: đóng khoang, mở bản đồ; Esc đóng bản đồ thì khoang mở lại ở tab CABIN
    await page.click('[data-btn="MapButton"]');
    await sleep(500);
    eq(tag + ' bấm Map: bản đồ mở, khoang đóng', await page.evaluate(() => [DRMap.isOpen(), DRCargo.isOpen()]), [true, false]);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 });
    eq(tag + ' đóng bản đồ: khoang mở lại ở tab CABIN, về chế độ khoang', await dbg(page), { tab: 'CABIN', tabs: ['INVENTORY', 'CABIN'], mode: 'cargo' });
    // ---- nút Encyclopedia
    await page.click('[data-btn="EncyclopediaButton"]');
    await sleep(500);
    eq(tag + ' bấm Encyclopedia: bách khoa mở', await page.evaluate(() => [DREncyclopedia.isOpen(), DRCargo.isOpen()]), [true, false]);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 });
    eq(tag + ' đóng bách khoa: khoang mở lại ở CABIN', (await dbg(page)).tab, 'CABIN');
    // ---- nút Pursuits
    await page.click('[data-btn="JournalButton"]');
    await sleep(500);
    eq(tag + ' bấm Pursuits: sổ nhiệm vụ mở', await page.evaluate(() => [DRHud.journalOpen(), DRCargo.isOpen()]), [true, false]);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 });
    eq(tag + ' đóng sổ: khoang mở lại ở CABIN', (await dbg(page)).tab, 'CABIN');
    // ---- nút Messages (w3msg): đóng khoang, mở Thư tín; Esc đóng thì khoang mở lại ở tab CABIN
    await page.click('[data-btn="MessagesButton"]');
    await sleep(500);
    eq(tag + ' bấm Messages: Thư tín mở, khoang đóng', await page.evaluate(() => [DRMessages.isOpen(), DRCargo.isOpen()]), [true, false]);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 });
    eq(tag + ' đóng Thư tín: khoang mở lại ở CABIN', await dbg(page), { tab: 'CABIN', tabs: ['INVENTORY', 'CABIN'], mode: 'cargo' });
    // ---- Tab đóng khoang, lần sau mở lại vẫn ở tab Khoang
    await page.keyboard.press('Tab'); await sleep(400);
    eq(tag + ' Tab đóng khoang, về chế độ lái', await page.evaluate(() => [DRCargo.isOpen(), DR.mode]), [false, 'sail']);
    await page.keyboard.press('Tab'); await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 5000 }); await sleep(400);
    eq(tag + ' mở lại: tab Khoang', (await dbg(page)).tab, 'INVENTORY');
  }
  eq(tag + ' không lỗi trang / console / HTTP >= 400', errors, []);
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720, true);
    await run(browser, base, 844, 390, false);
  } finally { await browser.close(); if (srv) srv.close(); }
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng  — ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
