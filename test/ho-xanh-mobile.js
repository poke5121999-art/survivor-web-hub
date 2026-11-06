/*
 * HỐ XANH — điện thoại cầm dọc: game chỉ chơi ngang (HUD bản Android, canvas 2340×1080 khớp bề ngang).
 *
 * Chạy:  node test/ho-xanh-mobile.js
 * Giả lập Pixel 7 và iPhone 13 (hasTouch, isMobile, đúng cỡ màn và DPR) bằng Chromium; HX_BASE=<url> để chạy trên Pages.
 * Dọc: bảng "Xoay ngang" phủ kín, nút Bắt đầu không chạm được, lượt lặn đứng yên (O₂ không tụt).
 * Xoay ngang: bảng ẩn, O₂ tụt lại, cần trái kéo Dave bơi. Máy tính cửa sổ hẹp dọc: không hiện bảng.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium, devices } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-mobile-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
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
const device = name => { const d = Object.assign({}, devices[name]); delete d.defaultBrowserType; return d; };

// Tấm phủ nằm trên cùng ở tâm nút Bắt đầu: id của phần tử mà ngón tay chạm trúng.
const hitAtStart = page => page.evaluate(() => {
  const r = document.getElementById('start').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return e ? (e.closest('[id]') || e).id : null;
});
const rotateShown = page => page.evaluate(() => { const e = document.getElementById('rotate'); return !!e && getComputedStyle(e).display !== 'none'; });

async function phone(browser, base, name) {
  const tag = name.replace(/ /g, '-');
  out.push('\n[' + name + ' dọc → ngang]');
  const ctx = await browser.newContext(device(name));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const vp = page.viewportSize();

  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03&theme=day&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, tag + '-portrait-title.png') });
  const hit = await hitAtStart(page);
  check('cầm dọc ' + vp.width + '×' + vp.height + ': ngón tay chạm vào tâm nút Bắt đầu trúng bảng "Xoay ngang" (rotate)', hit === 'rotate', 'trúng #' + hit);

  await page.evaluate(() => HX_DEBUG.go('loading'));
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  await sleep(600);
  const o2a = (await page.evaluate(() => HX_DEBUG.info())).dave.o2;
  await sleep(1500);
  const o2b = (await page.evaluate(() => HX_DEBUG.info())).dave.o2;
  check('cầm dọc giữa lượt lặn: game đứng yên, O₂ không tụt trong 1,5 giây', o2b === o2a, o2a.toFixed(2) + ' → ' + o2b.toFixed(2));

  await page.setViewportSize({ width: vp.height, height: vp.width });
  await sleep(300);
  check('xoay ngang ' + vp.height + '×' + vp.width + ': bảng "Xoay ngang" ẩn', !(await rotateShown(page)));
  const o2c = (await page.evaluate(() => HX_DEBUG.info())).dave.o2;
  await sleep(1500);
  const o2d = (await page.evaluate(() => HX_DEBUG.info())).dave.o2;
  check('xoay ngang: lượt lặn chạy tiếp, O₂ tụt', o2d < o2c, o2c.toFixed(2) + ' → ' + o2d.toFixed(2));

  const x0 = (await page.evaluate(() => HX_DEBUG.info())).dave.x;
  const sx = 110, sy = vp.width - 70;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 60, y: sy, id: 1 }] });
  await sleep(700);
  await page.screenshot({ path: path.join(SHOTS, tag + '-landscape-dive.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const x1 = (await page.evaluate(() => HX_DEBUG.info())).dave.x;
  check('xoay ngang: kéo cần trái sang phải 0,7 giây thì Dave bơi sang phải hơn 1 m', x1 - x0 > 1, (x1 - x0).toFixed(2) + ' m');
  check('không lỗi trang, console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// Máy tính: cửa sổ hẹp dọc, chuột. Không ép xoay.
async function desktopNarrow(browser, base) {
  out.push('\n[máy tính 390×844, chuột]');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + '/games/ho-xanh/index.html?fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  const hit = await hitAtStart(page);
  check('máy tính cửa sổ dọc: không có bảng xoay, chạm tâm nút Bắt đầu trúng #start', hit === 'start' && !(await rotateShown(page)), 'trúng #' + hit);
  await page.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await phone(browser, base, 'Pixel 7');
    await phone(browser, base, 'iPhone 13');
    await desktopNarrow(browser, base);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
