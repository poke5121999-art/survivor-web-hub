/*
 * BIỆT ĐỘI LẶN — bộ kiểm phase 1 (khung).
 *
 * Chạy:  node test/biet-doi-lan-suite.js
 * Ảnh chụp ra %TEMP%/bdl-shots (đổi bằng SHOTS=...). Chạy ở 1280×720 và 844×390, mỗi cỡ đủ 5 map.
 * BASE=https://.../ kiểm bản trên mạng thay vì máy chủ tĩnh của bộ kiểm.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const FLOORS = [5, 7, 10, 13, 16];

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

const info = page => page.evaluate(() => BDL_DEBUG.info());

async function oneMap(browser, base, W, H, i) {
  const tag = W + 'x' + H + ' map ' + i;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  await page.goto(base + '/games/biet-doi-lan/index.html?map=' + i);
  const reached = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive', null, { timeout: 120000 }).then(() => true, () => false);
  check(tag + ': vào pha dive', reached);
  if (!reached) { check(tag + ': không lỗi trang', false, errors.slice(0, 3).join(' | ')); await page.close(); return; }
  await sleep(2500);   // cho Dave xong cảnh nhảy xuống
  let s = await info(page);
  check(tag + ': số tầng', s.floors.length === FLOORS[i], s.floors.length + ' tầng, lộ trình ' + s.route.join('>'));
  const onScreen = s.screen && s.screen.x > 0 && s.screen.x < W && s.screen.y > 0 && s.screen.y < H;
  check(tag + ': Dave trong khung hình', !!onScreen, s.screen ? Math.round(s.screen.x) + ',' + Math.round(s.screen.y) : 'không có');

  // đứng yên 8 s: O₂ không đổi
  const o2a = s.o2;
  await sleep(8000);
  s = await info(page);
  check(tag + ': đứng yên 8 s O₂ không đổi', s.o2 === o2a && s.o2 === s.o2max, o2a + ' → ' + s.o2);

  // giữ Space 2 s: thể lực tụt; nhả ra thì hồi. Bơi xuống để có chuyển động (boost cần đang di chuyển).
  await page.evaluate(() => BDL_DEBUG.teleport(-30, HX_TUNING.water.surfaceY - 6));
  await sleep(300);
  const st0 = (await info(page)).stamina;
  await page.keyboard.down('KeyD');
  await page.keyboard.down('Space');
  await sleep(2000);
  const st1 = (await info(page)).stamina;
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyD');
  await sleep(4000);
  const st2 = (await info(page)).stamina;
  check(tag + ': giữ Space thì thể lực tụt', st1 < st0 - 10, st0.toFixed(1) + ' → ' + st1.toFixed(1));
  check(tag + ': nhả ra thì thể lực hồi', st2 > st1 + 10, st1.toFixed(1) + ' → ' + st2.toFixed(1));

  // đáy tầng cuối là bức chắn: thả Dave dưới đáy thì bị đẩy lên lại, O₂ giữ nguyên, hiện cảnh báo
  const lastY1 = s.floors[s.floors.length - 1].y1;
  await page.evaluate(y => {
    const W = HX.game.world;
    for (let x = 0; x < 60; x += 1) for (const sx of [x, -x]) if (W.open(sx, y - 3, 0.5) && W.open(sx, y + 0.5, 0.5)) return BDL_DEBUG.teleport(sx, y - 3);
  }, lastY1);
  // map cấp cao có quái thức sẵn: tạm cho Dave miễn đòn để chỉ đo bức chắn
  await page.evaluate(() => { const d = HX.game.diver; d._vuln = d.vulnerable; d.vulnerable = () => false; });
  const before = (await info(page)).o2;
  await sleep(1500);
  const after = await info(page);
  await page.evaluate(() => { const d = HX.game.diver; d.vulnerable = d._vuln; });
  const warn = await page.evaluate(() => { const e = document.getElementById('press'); return !!e && getComputedStyle(e).display !== 'none'; });
  check(tag + ': đáy tầng cuối đẩy Dave lên', after.y >= lastY1 - 0.3, 'y=' + after.y.toFixed(2) + ', đáy ' + lastY1.toFixed(2));
  check(tag + ': chạm đáy tầng cuối không mất O₂', after.o2 === before, before + ' → ' + after.o2);
  check(tag + ': cảnh báo hết tầng hiện', warn);

  await page.evaluate(() => BDL_DEBUG.teleport(-30, HX_TUNING.water.surfaceY - 6));
  await sleep(600);
  await page.screenshot({ path: path.join(SHOTS, 'map' + i + '-' + W + 'x' + H + '.png') });
  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const [W, H] of [[1280, 720], [844, 390]]) {
      console.log('— ' + W + 'x' + H);
      for (let i = 0; i < 5; i++) await oneMap(browser, base, W, H, i);
    }
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.message);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
