/*
 * Chuyến Buôn Xác Sống (games/walking-trade, Unity WebGL): chơi trọn một vòng bằng cú bấm thật lên canvas.
 * Mua hàng của thương nhân → mở quán → thu tiền khách ở quầy → sau 19:00 đóng quán đi ngủ → tổng kết → ngày 2.
 * Game đăng trạng thái và toạ độ mọi nút ra window.__twt (TwtGame.Publish), bài này chỉ đọc chỗ ấy để biết bấm đâu.
 *
 *   node test/walking-trade-play.js                       # máy chủ tĩnh trên gốc repo
 *   TWT_URL=https://poke5121999-art.github.io/survivor-web-hub node test/walking-trade-play.js
 *   TWT_TOUCH=1 (chạm như điện thoại) · TWT_LANDSCAPE=1 (1280x720) · TWT_SHOTS=<thư mục ảnh>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const SHOTS = process.env.TWT_SHOTS || path.join(os.tmpdir(), 'walking-trade-shots');
const VIEWPORT = process.env.TWT_LANDSCAPE ? { width: 1280, height: 720 } : { width: 390, height: 844 };
const TOUCH = !!process.env.TWT_TOUCH;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
  return !!ok;
}

function serve() {
  if (process.env.TWT_URL) return Promise.resolve({ base: process.env.TWT_URL.replace(/\/$/, ''), close() {} });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size });
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const { chromium } = require(PW);
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await br.newContext({ viewport: VIEWPORT, hasTouch: TOUCH, isMobile: TOUCH })).newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(r.status() + ' ' + r.url()); });

  const state = () => page.evaluate(() => window.__twt || null);
  const waitFor = async (what, pred, ms) => {
    const end = Date.now() + ms;
    for (;;) {
      const s = await state();
      if (s && pred(s)) return s;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}; last state ${JSON.stringify(s && { ...s, buttons: s.buttons.map((b) => b.id) })}`);
      await page.waitForTimeout(250);
    }
  };
  const button = (s, id) => s.buttons.find((b) => (typeof id === 'string' ? b.id === id : id.test(b.id)) && b.on);
  const click = async (b) => {
    const r = await page.evaluate(() => { const c = document.querySelector('#unity-canvas').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; });
    const s = await state();
    const x = r.l + (b.x + b.w / 2) * (r.w / s.screen[0]);
    const y = r.t + r.h - (b.y + b.h / 2) * (r.h / s.screen[1]);
    // Unity raycasts from the last mouse position it saw in an earlier frame, so a click with no hover first
    // lands where the pointer used to be. A real mouse always travels to the button first.
    if (TOUCH) await page.touchscreen.tap(x, y);
    else { await page.mouse.move(x, y); await page.waitForTimeout(100); await page.mouse.click(x, y); }
    await page.waitForTimeout(400);
  };
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });

  const url = srv.base + '/games/walking-trade/index.html';
  console.log('open ' + url + ' ' + VIEWPORT.width + 'x' + VIEWPORT.height + (TOUCH ? ' touch' : ' mouse'));
  const t0 = Date.now();
  await page.goto(url);
  let s = await waitFor('morning of day 1', (x) => x.phase === 'Morning' && x.day === 1, 180000);
  check('game loads into the day 1 morning', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  await shot('1-morning');

  const startBatteries = s.batteries, startStock = s.stock;
  const buy = button(s, /^buy:/);
  if (check('merchant has an affordable offer', !!buy, buy && buy.id)) {
    await click(buy);
    s = await waitFor('the purchase', (x) => x.stock !== startStock, 8000).catch(() => state());
    check('buying moves batteries into stock', s.batteries < startBatteries && s.stock === startStock + 1, `pin ${startBatteries}→${s.batteries}, stock ${startStock}→${s.stock}`);
  }

  await click(button(s, 'open'));
  s = await waitFor('shop open', (x) => x.phase === 'Open', 5000);
  check('shop opens and the clock runs from 05:00', s.clock.startsWith('05'), s.clock);

  let served = 0, lastShot = false;
  const before = s.batteries;
  for (const end = Date.now() + 240000; Date.now() < end;) {
    s = await state();
    const serve = button(s, 'serve');
    if (serve) {
      const income = s.income;
      await click(serve);
      const after = await state();
      if (after.income > income) served++;
      if (!lastShot) { lastShot = true; await shot('2-open-served'); }
    }
    if (button(s, 'sleep')) break;
    await page.waitForTimeout(300);
  }
  s = await state();
  check('customers paid at the counter', served > 0 && s.income > 0, `served ${served}, income ${s.income}`);
  check('batteries grew from sales', s.batteries > before, `pin ${before}→${s.batteries}`);
  const sleep = button(s, 'sleep');
  check('sleep unlocks at 19:00', !!sleep, s.clock);
  if (!sleep) throw new Error('sleep button never enabled, clock ' + s.clock);

  await click(sleep);
  s = await waitFor('day summary', (x) => x.phase === 'Summary', 5000);
  check('closing shows the day summary', s.served === served || s.served > 0, `served ${s.served}, income ${s.income}`);
  await shot('3-summary');

  await click(button(s, 'nextday'));
  s = await waitFor('day 2 morning', (x) => x.phase === 'Morning' && x.day === 2, 5000);
  check('a new day starts with a fresh merchant', s.buttons.some((b) => b.id.startsWith('buy:')), `day ${s.day}`);
  await shot('4-day2');

  check('no page errors or failed requests', problems.length === 0, problems.slice(0, 5).join(' | '));
  console.log('shots in ' + SHOTS);
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
  await br.close();
  srv.close();
})().catch((e) => { console.error('FAIL ' + e.message); process.exitCode = 1; process.exit(1); });
