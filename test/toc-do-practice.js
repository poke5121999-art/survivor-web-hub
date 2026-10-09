/*
 * Tốc Độ: luyện tập (js/sim/ghost.js, js/view/practice.js).
 *   Node: ghi/nội suy bóng bằng số cụ thể.
 *   Trình duyệt: Huấn luyện tự do (một xe, F cắm cờ, G về cờ, X xóa cờ, danh sách vòng, kỷ lục luyện tập) bằng phím thật;
 *   Thách Đấu Ảo Ảnh (chưa có bóng → hộp thoại; ghi bóng sau một lần về đích; bóng chạy; thẻ "Thành tích cũ");
 *   nút cảm ứng ở 844×390. Ảnh chụp ở TD_SHOTS (mặc định thư mục tạm).
 *   node test/toc-do-practice.js        TD_URL=<gốc> để chạy trên Pages
 * Rút ngắn: đặt me.lap = 1 (shadow: R.laps = 1) lúc còn đếm ngược nên xe chỉ cần chạy 7 m qua vạch xuất phát.
 */
'use strict';
const T = require('./toc-do-lib.js');

function nodePart() {
  console.log('Node: ghost.js');
  const TD = T.nodeSim(['js/sim/ghost.js']).TD, G = TD.Ghost;
  const rec = G.create('t1', 'car', 'drv');
  G.push(rec, 0, { x: 0, y: 1, z: 5, yaw: 0, progress: 0 });
  G.push(rec, 0.1, { x: 10, y: 1, z: 5, yaw: 0.2, progress: 5 });
  G.push(rec, 0.2, { x: 20, y: 3, z: 5, yaw: 0.4, progress: 10 });
  T.check('ghi 3 mẫu ở 10 Hz', rec.n === 3 && rec.d.length === 15, rec.n + '/' + rec.d.length);
  G.push(rec, 0.2, { x: 99, y: 0, z: 0, yaw: 0, progress: 99 });
  T.check('push cùng mốc thời gian không ghi thêm', rec.n === 3);
  G.push(rec, 0.45, { x: 40, y: 3, z: 5, yaw: 0.4, progress: 20 });
  T.check('khung trễ lặp mẫu cuối cho đủ mốc (0,3 0,4)', rec.n === 5 && rec.d[3 * 5] === 800 && rec.d[4 * 5] === 800, String(rec.n));
  rec.n = 3; rec.d.length = 15;
  G.finish(rec, 12.5);
  const s = G.sample(rec, 0.05);
  T.check('nội suy giữa mẫu 0 và 1: x = 5, y = 1, yaw = 0,1', s.x === 5 && s.y === 1 && s.z === 5 && Math.abs(s.yaw - 0.1) < 1e-9, JSON.stringify(s));
  T.check('nội suy mẫu 1 và 2: x = 15, y = 2', G.sample(rec, 0.15).x === 15 && G.sample(rec, 0.15).y === 2);
  T.check('quá cuối giữ mẫu cuối, trước đầu giữ mẫu đầu', G.sample(rec, 99).x === 20 && G.sample(rec, -3).x === 0);
  T.check('timeAt: tiến độ 2,5 m → 0,05 s; 7,5 m → 0,15 s', Math.abs(G.timeAt(rec, 2.5) - 0.05) < 1e-9 && Math.abs(G.timeAt(rec, 7.5) - 0.15) < 1e-9);
  T.check('timeAt: trước đầu = 0, quá cuối = 0,2', G.timeAt(rec, -50) === 0 && Math.abs(G.timeAt(rec, 500) - 0.2) < 1e-9);
  const w = G.create('t', 'c', 'd');
  G.push(w, 0, { x: 0, y: 0, z: 0, yaw: 3.1, progress: 0 }); G.push(w, 0.1, { x: 0, y: 0, z: 0, yaw: -3.1, progress: 1 });
  T.check('yaw đi vòng qua ±π, không quay ngược', Math.abs(G.sample(w, 0.05).yaw - Math.PI) < 0.01, String(G.sample(w, 0.05).yaw));
  G.finish(w, 1);
  const back = G.decode(G.encode(rec));
  T.check('mã hóa/giải mã giữ nguyên', back && back.n === 3 && back.time === 12.5 && back.car === 'car' && back.d.join() === rec.d.join());
  T.check('giải mã chuỗi hỏng → null', G.decode('nope') === null && G.decode('{"v":1,"hz":10,"n":3,"d":[1],"time":1}') === null && G.decode(G.encode(G.create('a'))) === null);
}

// Máy dùng chung với nhiều bài kiểm khác nên khung hình có lúc chậm tới vài giây: cho chụp ảnh thời hạn dài.
const shot = async (page, name) => { require('fs').mkdirSync(T.SHOTS, { recursive: true }); await page.screenshot({ path: T.SHOTS + '/' + name + '.png', timeout: 240000 }); };

const until = async (page, fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 90000, polling: 200 }); return true; } catch (e) { return false; } };

async function desktop(br, base) {
  console.log('1366×650, bàn phím');
  const { page, problems } = await T.open(br, base, 'index.html');
  T.check('sảnh mở', await until(page, () => window.TD && TD.main && TD.main.state === 'lobby', null, 120000));
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('td.ghost.') || k === 'td.practice.v1') localStorage.removeItem(k); });
  // wait = false: không chờ qua đếm ngược (trận đang bị hộp thoại dừng).
  const start = async (mode, wait) => {
    await page.evaluate((m) => { TD.main.timeScale = 4; TD.main.startRace({ mode: m }); }, mode);
    const ready = await until(page, () => TD.main.state === 'race' && TD.main.ctx && TD.practice.S && TD.practice.S.ctx === TD.main.ctx, null, 400000);
    // Rút ngắn (free): xe còn ở ô xuất phát nên chạy 7 m qua vạch là xong "vòng 1" ≈ 20 s.
    await page.evaluate(() => { const R = TD.main.race, me = TD.main.me; if (R.mode.practice === 'free') { me.lap = 1; me.lapStartT = R.t - 20; } });
    return ready && (wait === false || until(page, () => TD.main.race.goT != null && TD.main.race.t - TD.main.race.goT > 0.5, null, 400000));
  };
  const driveBot = () => page.evaluate(() => { const me = TD.main.me; me.ctrl = 'bot'; TD.Bot.init(me, TD.main.race, 0.9); TD.main.timeScale = 4; });
  // Ghi lại ngay sau mỗi lần respawn (về cờ) để kiểm vị trí/tốc độ lúc đó, không phụ thuộc nhịp polling.
  await page.evaluate(() => {
    window.__log = { set: null, back: null };
    let lf = null, nb = 0;
    window.__backs = 0;
    const o = TD.Race.respawn; TD.Race.respawn = function (R, k, why) { if (why === 'flag') window.__backs++; return o.apply(this, arguments); };
    TD.racePlugins.push({ update(dt, ctx) {
      const S = TD.practice.S, me = ctx.me;
      if (!S || !S.free || S.ctx !== ctx) return;
      if (S.flag && S.flag !== lf) { lf = S.flag; window.__log.set = { d: Math.hypot(lf.x - me.x, lf.z - me.z), gd: Math.hypot(S.group.position.x - me.x, S.group.position.z - me.z), vis: S.group.visible }; }
      if (window.__backs !== nb) { nb = window.__backs; window.__log.back = { d: Math.hypot(S.flag.x - me.x, S.flag.z - me.z), speed: me.speed, lastCp: me.lastCp, lap: me.lap, st: me.st, fcp: S.flag.lastCp, flap: S.flag.lap }; }
    } });
  });

  // ---- Huấn luyện tự do ----
  T.check('free: vào trận', await start('free'));
  T.check('free: cờ 3D và hud sẵn sàng', await until(page, () => !!TD.practice.S.group, null, 20000));
  const info = await page.evaluate(() => ({ n: TD.main.race.karts.length, laps: TD.main.race.laps, mode: TD.main.race.mode.practice, hasFlag: !!TD.practice.S.flag }));
  T.check('free: một xe, không có cờ lúc đầu', info.n === 1 && info.mode === 'free' && !info.hasFlag, JSON.stringify(info));
  await driveBot();
  T.check('free: về vạch → ghi một vòng vào danh sách và kỷ lục luyện tập', await until(page, () => TD.practice.S.laps.length === 1, null, 60000));
  const lap = await page.evaluate(() => ({ t: TD.practice.S.laps[0], best: JSON.parse(localStorage.getItem('td.practice.v1')).best[TD.main.race.trackId] }));
  T.check('free: vòng ≈ 20–40 s và kỷ lục lưu đúng bằng vòng đó', lap.t > 20 && lap.t < 40 && lap.best === lap.t, JSON.stringify(lap));
  await page.keyboard.press('KeyF');
  T.check('free: F cắm cờ tại chỗ xe (±1 m), vật cờ hiện', await until(page, () => !!TD.practice.S.flag, null, 20000));
  const f1 = await page.evaluate(() => window.__log.set);
  T.check('free: cờ cách xe < 1 m, group 3D đặt đúng chỗ', f1.d < 1 && f1.vis && f1.gd < 1, JSON.stringify(f1));
  T.check('free: cờ 3D nạp xong (vải caro)', await until(page, () => !!TD.practice.S.cloth, null, 20000));
  // Ảnh cờ: tạm dừng rồi đặt camera đứng trước cờ 28 m, nhìn lên vải (trận tạm dừng vẫn vẽ theo M.camera).
  await page.evaluate(() => { const M = TD.main, f = TD.practice.S.flag; M.paused = true; const c = M.camera; c.position.set(f.x + Math.sin(f.yaw) * 28 + Math.cos(f.yaw) * 6, f.y + 5, f.z + Math.cos(f.yaw) * 28 - Math.sin(f.yaw) * 6); c.lookAt(f.x, f.y + 8, f.z); });
  await page.waitForTimeout(1500);
  await shot(page, 'practice-1366-flag');
  await page.evaluate(() => { TD.main.paused = false; });
  T.check('free: lái đi xa > 60 m', await until(page, () => { const f = TD.practice.S.flag, me = TD.main.me; return Math.hypot(f.x - me.x, f.z - me.z) > 60; }, null, 90000));
  await page.evaluate(() => { const me = TD.main.me; me.ctrl = 'human'; me.bot = null; });
  await page.keyboard.press('KeyG');
  T.check('free: G đưa xe về cờ', await until(page, () => window.__log.back, null, 20000));
  const bk = await page.evaluate(() => window.__log.back);
  T.check('free: về cờ cách < 2 m, tốc độ 0, đang hồi sinh', bk.d < 2 && bk.speed === 0 && bk.st === 'respawn', JSON.stringify(bk));
  T.check('free: lastCp và vòng khôi phục đúng lúc cắm (vòng 2)', bk.lastCp === bk.fcp && bk.lap === bk.flap && bk.flap === 2, JSON.stringify(bk));
  await page.keyboard.press('KeyX');
  T.check('free: X xóa cờ', await until(page, () => TD.practice.S.flag === null && !TD.practice.S.group.visible, null, 20000));
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(800);
  T.check('free: không có cờ thì G không làm gì', await page.evaluate(() => window.__backs === 1));
  await shot(page, 'practice-1366-after');
  // Bảng hạng chỉ một hàng, giờ góc phải có Kỷ lục luyện tập
  T.check('free: không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));

  // ---- Thách Đấu Ảo Ảnh ----
  T.check('shadow: vào trận (chưa có bóng)', await start('shadow', false));
  const m1 = await page.evaluate(() => ({ box: !!document.querySelector('[data-practice="noghost"]'), paused: TD.main.paused, n: TD.main.race.karts.length }));
  T.check('shadow: chưa có bóng → hộp thoại báo và dừng trận', m1.box && m1.paused && m1.n === 1, JSON.stringify(m1));
  await shot(page, 'practice-1366-noghost');
  await page.click('[data-practice="noghost"] [data-p="go"]');
  T.check('shadow: "Đua không có bóng" đóng hộp thoại và chạy tiếp', await until(page, () => !TD.main.paused && !document.querySelector('[data-practice="noghost"]'), null, 20000));
  // Rút ngắn (shadow): chạy 4 s rồi đặt xe cách vạch 60 m trên đường chạy chuẩn, vòng cuối (R.laps = 1): về đích sau vài giây.
  const finishFast = async () => {
    await driveBot();
    await until(page, () => TD.main.race.t - TD.main.race.goT > 4, null, 120000);
    await page.evaluate(() => {
      const R = TD.main.race, me = TD.main.me, T = R.T, ln = T.line, c = T.cps[T.startCp];
      let bi = 0, bd = 1e18;
      for (let i = 0; i < ln.n; i++) { const d = Math.hypot(ln.x[i] - c.x, ln.z[i] - c.z); if (d < bd) { bd = d; bi = i; } }
      let j = bi;
      while (Math.hypot(ln.x[j] - c.x, ln.z[j] - c.z) < 60) j = (j - 1 + ln.n) % ln.n;
      const nx = (j + 1) % ln.n;
      R.laps = 1;
      TD.Race.respawn(R, me, 'test', { x: ln.x[j], y: ln.y[j], z: ln.z[j], yaw: Math.atan2(ln.x[nx] - ln.x[j], ln.z[nx] - ln.z[j]) });
      me.lastCp = T.cps[T.startCp].prev[0]; me.lap = 1; me.lapStartT = R.t;
    });
    return until(page, () => TD.main.me.st === 'finish' && TD.main.fin, null, 90000);
  };
  T.check('shadow: về đích (rút ngắn)', await finishFast());
  const g1 = await page.evaluate(() => { const s = localStorage.getItem('td.ghost.' + TD.main.race.trackId), o = s && TD.Ghost.decode(s); return o && { n: o.n, time: o.time, fin: TD.main.me.finishT, cards: TD.main.fin.cards.join('|') }; });
  T.check('shadow: bóng đầu tiên được lưu (td.ghost.<đường>) với thời gian về đích', g1 && g1.n > 20 && Math.abs(g1.time - g1.fin) < 1e-6, JSON.stringify(g1 && { n: g1.n, time: g1.time, fin: g1.fin }));
  T.check('shadow: lần đầu chưa có thẻ so sánh thành tích cũ', g1 && g1.cards.indexOf('Thành tích cũ') < 0 && g1.cards.indexOf('Bóng kỷ lục') >= 0, g1 && g1.cards);

  T.check('shadow: vào lại, lần này có bóng', await start('shadow'));
  const m2 = await page.evaluate(() => ({ box: !!document.querySelector('[data-practice="noghost"]'), gv: !!TD.practice.S.gv, mats: 0 }));
  T.check('shadow: có bóng thì không hiện hộp thoại, xe bóng được dựng', !m2.box && m2.gv, JSON.stringify(m2));
  T.check('shadow: xe bóng nạp xong và mờ', await until(page, () => { const v = TD.practice.S.gv; let ok = false; v.root.traverse((o) => { if (o.isMesh && o.material && o.material.transparent && Math.abs(o.material.opacity - 0.4) < 1e-6) ok = true; }); return v.ready && ok; }, null, 60000));
  const p0 = await page.evaluate(() => { const k = TD.practice.S.gv.kart; return { x: k.x, z: k.z }; });
  await until(page, (q) => { const k = TD.practice.S.gv.kart; return Math.hypot(k.x - q.x, k.z - q.z) > 1; }, p0, 60000);
  const p1 = await page.evaluate(() => { const k = TD.practice.S.gv.kart, R = TD.main.race; return { x: k.x, z: k.z, t: R.t - R.goT, gap: TD.practice.S.gap }; });
  T.check('shadow: bóng di chuyển theo bản ghi', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, JSON.stringify({ p0, p1 }));
  T.check('shadow: có khoảng cách +/- giây tới bóng', typeof p1.gap === 'number' && isFinite(p1.gap), String(p1.gap));
  await shot(page, 'practice-1366-shadow');
  T.check('shadow: về đích lần hai', await finishFast());
  const c2 = await page.evaluate(() => TD.main.fin.cards.join('|'));
  T.check('shadow: thẻ kết quả có "Thành tích cũ" và "Mới"', c2.indexOf('Thành tích cũ') >= 0 && c2.indexOf('Mới') >= 0, c2.replace(/<[^>]+>/g, ' ').trim());
  T.check('shadow: không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  await page.context().close();
}

async function phone(br, base) {
  console.log('844×390, cảm ứng');
  const { page, problems } = await T.open(br, base, 'index.html', { width: 844, height: 390 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  T.check('sảnh mở', await until(page, () => window.TD && TD.main && TD.main.state === 'lobby', null, 120000));
  await page.evaluate(() => { TD.main.timeScale = 4; TD.main.startRace({ mode: 'free' }); });
  T.check('vào trận free', await until(page, () => TD.main.state === 'race' && TD.main.race && TD.main.race.goT != null && TD.main.race.t - TD.main.race.goT > 0.5, null, 400000));
  const rects = await page.evaluate(() => TD.hud.rects().filter((r) => r.id.startsWith('flag')));
  const ids = rects.map((r) => r.id).sort().join();
  T.check('đủ ba nút cờ cảm ứng', ids === 'flag,flagBack,flagDel', ids);
  T.check('nút cờ ≥ 44 px và nằm trong màn', rects.every((r) => r.w >= 44 && r.h >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 844 && r.y + r.h <= 390), JSON.stringify(rects));
  const hits = await page.evaluate((rs) => rs.map((r) => { const e = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2); return e && e.id; }), rects);
  T.check('elementFromPoint ở tâm nút cờ ra canvas HUD', hits.every((h) => h === 'hud'), hits.join(','));
  const fl = rects.find((r) => r.id === 'flag');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: fl.x + fl.w / 2, y: fl.y + fl.h / 2, id: 1 }]);
  await touch('touchEnd', []);
  T.check('chạm nút cờ cắm cờ', await until(page, () => !!TD.practice.S.flag, null, 30000));
  await page.waitForTimeout(800);
  await shot(page, 'practice-844-flag');
  const del = rects.find((r) => r.id === 'flagDel');
  await touch('touchStart', [{ x: del.x + del.w / 2, y: del.y + del.h / 2, id: 1 }]);
  await touch('touchEnd', []);
  T.check('chạm nút Xóa điểm cờ xóa cờ', await until(page, () => TD.practice.S.flag === null, null, 30000));
  T.check('không lỗi trang (844)', problems.length === 0, problems.slice(0, 5).join(' | '));
  await page.context().close();
}

(async () => {
  nodePart();
  const srv = await T.serve();
  const br = await T.browser();
  try { await desktop(br, srv.base); await phone(br, srv.base); } finally { await br.close(); srv.close(); }
  T.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
