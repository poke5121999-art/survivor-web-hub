/*
 * BIỆT ĐỘI LẶN — đi đúng đường người chơi: sảnh → bấm RA KHƠI → cano → lặn → bắn móc bằng chuột thật
 * → khoang lái → cano về → trạm → ra cửa → cano ra → lặn chuyến 2 → bắn móc lần nữa.
 *
 * Chạy:  node test/biet-doi-lan-flow.js        (BASE=<url gốc> để chạy trên bản Pages)
 * Các bộ kiểm khác vào thẳng ?map=N nên không đi qua cano. Lỗi 2026-10-01: màn cano (#scr-cruise)
 * không ẩn sau chuyến đi, phủ trong suốt lên cảnh lặn và nuốt hết chuột, người chơi bắn móc không được.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-flow-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

const phase = page => page.evaluate(() => BDL_DEBUG.info().phase);
const topAt = (page, x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + (e.id ? '#' + e.id : '') : 'none'; }, [x, y]);

// Bắn móc bằng chuột thật vào một món đồ cổ đang nằm, đứng chếch trên nó 2 m trong nước trống.
async function hookLoot(page, tag) {
  const L = await page.evaluate(() => {
    const W = HX.game.world;
    return BDL_DEBUG.loot.list().filter(l => l.state === 'rest' && W.open(l.x - 1.2, l.y + 2, 0.5) && !W.raycast(l.x - 1.2, l.y + 2, l.x, l.y))
      .sort((a, b) => b.y - a.y)[0] || null;
  });
  check(tag + ': có món đồ cổ móc được từ nước trống', !!L, L ? L.name + ' $' + L.value : 'không có');
  if (!L) return;
  await page.evaluate(l => BDL_DEBUG.teleport(l.x - 1.2, l.y + 2), L);
  await sleep(700);
  const s = await page.evaluate(l => { const p = HX.game.gfx.worldToScreen(l.x, l.y); return { x: p.x, y: p.y }; }, L);
  check(tag + ': chỗ món đồ trên màn hình là canvas cảnh lặn (không bị lớp nào phủ)', (await topAt(page, s.x, s.y)) === 'CANVAS#scene', await topAt(page, s.x, s.y));
  await page.mouse.move(s.x, s.y);
  await page.mouse.down(); await sleep(450); await page.mouse.up();
  await sleep(1200);
  const st = await page.evaluate(() => BDL_DEBUG.tether.state());
  check(tag + ': giữ chuột trái ngắm vào món đồ rồi thả: dây móc dính', st === 'attached', st);
  await page.screenshot({ path: path.join(SHOTS, tag.replace(/\W+/g, '-') + '-hook.png') });
  await page.mouse.down(); await sleep(80); await page.mouse.up();
  await sleep(700);
  const st2 = await page.evaluate(() => BDL_DEBUG.tether.state());
  check(tag + ': bấm chuột trái lần nữa: thả món đồ', st2 !== 'attached', st2);
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('bdl-flow')) { localStorage.removeItem('bdl.meta.v1'); sessionStorage.setItem('bdl-flow', '1'); } } catch (e) { /* bỏ qua */ } });
  try {
    await page.goto(base + '/games/biet-doi-lan/index.html?cb=' + Date.now());
    await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'lobby', null, { timeout: 60000 });
    await sleep(1200);
    await page.locator('#menu button.cta').first().click();
    await page.waitForFunction(() => BDL_DEBUG.info().phase === 'cruise', null, { timeout: 30000 });
    check('bấm RA KHƠI: cano chạy ra', true);
    await sleep(1500);
    await page.evaluate(() => BDL_DEBUG.cruise.skip());
    await page.waitForFunction(() => BDL_DEBUG.info().phase === 'dive', null, { timeout: 180000 });
    await sleep(2500);
    check('chuyến 1: giữa màn hình là canvas cảnh lặn', (await topAt(page, 640, 360)) === 'CANVAS#scene', await topAt(page, 640, 360));
    check('chuyến 1: bắt đầu trên boong', (await page.evaluate(() => BDL_DEBUG.info().deck)) === true);
    await page.keyboard.press('Space');
    await sleep(2200);
    check('Space: nhảy xuống nước', (await page.evaluate(() => BDL_DEBUG.info().deck)) === false);
    await hookLoot(page, 'chuyến 1');

    // đủ chỉ tiêu rồi đi đường khoang lái → cano về → trạm
    await page.evaluate(() => { BDL.run.dive.onDeck = BDL.run.dive.quota; HX.game.onExtract(); });
    await page.waitForFunction(() => BDL_DEBUG.info().phase === 'cruise', null, { timeout: 30000 });
    await sleep(800);
    await page.evaluate(() => BDL_DEBUG.cruise.skip());
    await page.waitForFunction(() => BDL_DEBUG.info().phase === 'shop', null, { timeout: 30000 });
    check('khoang lái: cano về quán-trạm', true);
    await sleep(1200);
    await page.evaluate(() => BDL_DEBUG.shop.teleport(30));
    await page.waitForFunction(() => BDL_DEBUG.info().phase === 'cruise', null, { timeout: 15000 });
    check('đứng ở cửa trạm: cano ra khơi', true);
    await sleep(800);
    await page.evaluate(() => BDL_DEBUG.cruise.skip());
    await page.waitForFunction(() => BDL_DEBUG.info().phase === 'dive', null, { timeout: 180000 });
    await sleep(2500);
    const m2 = await page.evaluate(() => BDL_DEBUG.info().map);
    check('chuyến 2 là map thứ hai', m2 === 1, 'map ' + m2);
    check('chuyến 2: giữa màn hình là canvas cảnh lặn', (await topAt(page, 640, 360)) === 'CANVAS#scene', await topAt(page, 640, 360));
    await page.keyboard.press('Space');
    await sleep(2200);
    await hookLoot(page, 'chuyến 2');
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.message);
  }
  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 4).join(' | '));
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
