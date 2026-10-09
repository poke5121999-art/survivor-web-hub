/*
 * Tốc Độ: luồng chơi thật trong trình duyệt ở 1366×650 (chuột + phím) và 844×390 (cảm ứng).
 * Lái bằng page.keyboard / page.touchscreen (không gọi hàm input trong mã), kiểm elementFromPoint ở nút cảm ứng,
 * rồi cho xe người chơi tự lái (bot) và tua nhanh tới màn kết quả.
 * Chạy: node test/toc-do-ui.js   (TD_URL=<gốc> để chạy trên Pages)
 */
'use strict';
const T = require('./toc-do-lib');

async function lobby(page) {
  await page.waitForFunction(() => window.TD && TD.main && TD.main.state === 'lobby', null, { timeout: 60000 });
  await page.waitForTimeout(800);
}
// Sảnh → Xuất Phát → Tốc Độ-Đơn → Ghép phòng (đợi ghép đủ người) → trận. Đường đặt thẳng vào bản lưu trước khi mở màn chọn.
async function toRace(page, track, touch) {
  const tap = (s) => (touch ? page.tap(s) : page.click(s));
  await page.evaluate((t) => { TD.save.d.track = t; }, track);
  if (!(await page.$('.lb-pick'))) await tap('[data-act="start"]');
  await tap('[data-mode="speed"]');
  await tap('.lb-go');
  await page.waitForFunction(() => TD.main.state === 'race', null, { timeout: 120000 });
}
const kart = (page) => page.evaluate(() => { const k = TD.main.me, R = TD.main.race;
  return { st: k.st, kmh: Math.abs(k.speed) * 3.6, prog: k.progress, steer: k.input.steer, drift: k.input.drift, place: k.place, phase: R.phase, wall: k.stats.wallHits, gauge: k.nitro.gauge, paused: TD.main.paused }; });
async function until(page, fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 4000)) { if (await fn(await kart(page))) return true; await page.waitForTimeout(100); }
  return false;
}
async function waitGo(page) {
  await page.evaluate(() => { TD.main.introT = 99; TD.main.timeScale = 3; });
  await page.waitForFunction(() => TD.main.race.phase === 'race', null, { timeout: 60000 });
}

async function desktop(br, base) {
  console.log('1366×650, phím');
  const { page, problems } = await T.open(br, base, 'index.html', { width: 1366, height: 650 });
  await lobby(page);
  T.check('sảnh hiện 5 ô chế độ và thanh dưới', await page.evaluate(() => document.querySelectorAll('.lb-home .lb-tile').length === 5 && document.querySelectorAll('.lb-bar .lb-bt').length === 5));
  await T.shot(page, 'ui-lobby-1366');
  await page.click('[data-act="start"]');
  T.check('Xuất Phát mở chọn chế độ với ô chọn mọi đường', await page.evaluate(() => document.querySelectorAll('.lb-th').length === Object.keys(TD.TRACKS).length));
  await page.click('.lb-th:not(.on)');
  T.check('bấm ô đường đổi đường đua', await page.evaluate(() => TD.save.d.track !== '11citynew'));
  await toRace(page, '11citynew');
  T.check('vào trận với 6 xe đã nạp xong', await page.evaluate(() => TD.main.views.length === 6 && TD.main.views.every((v) => v.ready)));
  await waitGo(page);
  const a = await kart(page);
  await page.waitForTimeout(2500);
  const b = await kart(page);
  T.check('xe tự tăng ga sau GO', b.prog > a.prog + 5 && b.kmh > 40, `${a.prog.toFixed(0)} → ${b.prog.toFixed(0)} m, ${b.kmh.toFixed(0)} km/h`);
  await page.keyboard.down('ArrowLeft');
  T.check('← ghi steer = −1', await until(page, (k) => k.steer === -1));
  await page.keyboard.down('ShiftLeft');
  let drifted = false;
  for (let i = 0; i < 20 && !drifted; i++) { await page.waitForTimeout(100); drifted = (await kart(page)).st === 'drift'; }
  T.check('Shift + ← vào drift', drifted);
  await T.shot(page, 'ui-drift-1366');
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Escape');
  T.check('Esc mở bảng tạm dừng', await until(page, (k) => k.paused) && await page.evaluate(() => !!document.querySelector('.pausebox')));
  await page.click('[data-p="resume"]');
  T.check('Tiếp tục đóng bảng', await page.evaluate(() => !TD.main.paused && !document.querySelector('.pausebox')));
  await page.evaluate(() => { const me = TD.main.me; me.ctrl = 'bot'; TD.Bot.init(me, TD.main.race, 0.95); TD.main.timeScale = 6; });
  await page.waitForFunction(() => TD.main.resultShown, null, { timeout: 400000, polling: 1000 });
  await page.waitForTimeout(1200);
  const res = await page.evaluate(() => ({ rows: document.querySelectorAll('.result .row').length, me: TD.main.me.place, coins: TD.save.d.coins, best: TD.save.d.best['11citynew'] }));
  T.check('màn kết quả có 6 hàng, cộng xu, lưu kỷ lục', res.rows === 6 && res.coins > 0 && res.best > 60, JSON.stringify(res));
  await T.shot(page, 'ui-result-1366');
  await page.click('[data-r="lobby"]');
  await page.waitForFunction(() => TD.main.state === 'lobby', null, { timeout: 20000 });
  T.check('Về sảnh từ màn kết quả', true);
  T.check('không lỗi trang (1366)', problems.length === 0, problems.slice(0, 5).join(' | '));
  await page.context().close();
}

async function phone(br, base) {
  console.log('844×390, cảm ứng');
  const { page, problems } = await T.open(br, base, 'index.html', { width: 844, height: 390 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await lobby(page);
  await T.shot(page, 'ui-lobby-844');
  const over = await page.evaluate(() => [...document.querySelectorAll('.lb-home button')].filter((b) => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || Math.min(r.width, r.height) < 30; }).map((b) => b.className + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)));
  T.check('nút sảnh nằm trong màn và không quá nhỏ', over.length === 0, over.join(', '));
  await toRace(page, '11citynew', true);
  await waitGo(page);
  const rects = await page.evaluate(() => TD.hud.rects());
  const ids = new Set(rects.map((r) => r.id));
  T.check('đủ nút cảm ứng: trái, phải, drift, phun, phanh, về đường', ['left', 'right', 'drift', 'nitro', 'brake', 'reset'].every((i) => ids.has(i)), [...ids].join(','));
  T.check('nút cảm ứng ≥ 34 px', rects.every((r) => Math.min(r.w, r.h) >= 34), rects.map((r) => r.id + ':' + Math.round(Math.min(r.w, r.h))).join(' '));
  const hits = await page.evaluate((rs) => rs.map((r) => { const e = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2); return e && e.id; }), rects);
  T.check('elementFromPoint ở tâm mọi nút ra canvas HUD', hits.every((h) => h === 'hud'), hits.join(','));
  const right = rects.find((r) => r.id === 'right');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: right.x + right.w / 2, y: right.y + right.h / 2, id: 1 }]);
  T.check('chạm giữ nút phải ghi steer = +1', await until(page, (k) => k.steer === 1));
  const drift = rects.find((r) => r.id === 'drift' && r.x > 422);
  await touch('touchStart', [{ x: right.x + right.w / 2, y: right.y + right.h / 2, id: 1 }, { x: drift.x + drift.w / 2, y: drift.y + drift.h / 2, id: 2 }]);
  let d = false;
  for (let i = 0; i < 20 && !d; i++) { await page.waitForTimeout(100); d = (await kart(page)).st === 'drift'; }
  T.check('hai ngón (phải + Drift) vào drift', d);
  await T.shot(page, 'ui-drift-844');
  await touch('touchEnd', []);
  T.check('nhấc ngón thì thả lái', await until(page, (k) => k.steer === 0 && !k.drift));
  await page.tap('.pause');
  T.check('nút tạm dừng bấm được bằng chạm', await until(page, (k) => k.paused));
  await T.shot(page, 'ui-pause-844');
  T.check('không lỗi trang (844)', problems.length === 0, problems.slice(0, 5).join(' | '));
  await page.context().close();
}

(async () => {
  const srv = await T.serve();
  const br = await T.browser();
  try {
    await desktop(br, srv.base);
    await phone(br, srv.base);
  } catch (e) { T.check('chạy hết không ném lỗi', false, e.message); }
  await br.close(); srv.close();
  console.log('ảnh: ' + T.SHOTS);
  T.done();
})();
