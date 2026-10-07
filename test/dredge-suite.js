/*
 * DREDGE — Biển Mù: kiểm lõi chơi trên trang thật (Playwright).
 *
 * Chạy:  node test/dredge-suite.js
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-suite.js   (chạy trên Pages)
 * Không có DR_URL thì tự dựng máy chủ tĩnh ở gốc repo (cổng ngẫu nhiên) và tắt khi xong.
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/dredge-shots), hai cỡ 1280×720 và 844×390 — mở ra xem bằng mắt.
 * Luật số thuần (lưới, thời gian, giá) kiểm riêng ở test/dredge-rules.js.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
// Tệp của luồng UI làm song song: chưa có trên đĩa thì 404 của chúng không tính là lỗi; có rồi thì 404 là lỗi thật.
const UI_FILES = ['js/hud.js', 'js/minigame.js', 'js/cargo.js', 'js/dock.js', 'css/ui.css'];
const OPTIONAL = UI_FILES.filter(f => !fs.existsSync(path.join(ROOT, 'games/dredge', f))).map(f => '/games/dredge/' + f);
const optional = url => OPTIONAL.some(f => url.split('?')[0].endsWith(f));
const GM = 'dock.greater-marrow';

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

function watch(page) {
  const errors = [], missing = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = (m.location() || {}).url || '';
    if (optional(url) || /Failed to load resource/.test(m.text()) && OPTIONAL.length) return;
    errors.push('console: ' + m.text());
  });
  page.on('response', r => {
    if (r.status() < 400) return;
    if (optional(r.url())) missing.push(r.url().split('?')[0]); else errors.push('HTTP ' + r.status() + ' ' + r.url());
  });
  return { errors, missing };
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const touch = W < 1000; // cỡ điện thoại: bật cảm ứng để thử cần ảo
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: false });
  const w = watch(page);
  const info = () => page.evaluate(() => DR_DEBUG.info());
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const url = q => base + '/games/dredge/index.html?' + q;

  // ---- màn đầu ----
  await page.goto(url('fresh=1'));
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  check('màn tải biến mất, màn đầu hiện', await page.isVisible('#dr-title') && !(await page.isVisible('#dr-loading')));
  check('?fresh=1: không có nút Tiếp tục', !(await page.isVisible('#btn-continue')));
  check('tiêu đề trang', (await page.title()) === 'DREDGE — Biển Mù');
  await sleep(1200);
  await shot('1-title');

  // ---- ván mới: neo ở Greater Marrow ----
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 10000 });
  let I = await info();
  const slot = await page.evaluate(() => DRDocks.byId['dock.greater-marrow'].slots[0]);
  check('ván mới neo ở Greater Marrow', I.dock === GM, I.dock);
  check('thuyền đặt ở DockSlot1', Math.hypot(I.x - slot.x, I.z - slot.z) < 0.05, I.x.toFixed(2) + ',' + I.z.toFixed(2));
  check('sổ lưu ghi lúc neo bến', await page.evaluate(() => DR.hasSave() && JSON.parse(localStorage.getItem('dredge.save.v1')).dock === 'dock.greater-marrow'));
  await sleep(1500);
  await shot('2-docked-gm');

  // ---- rời bến ----
  const undockBtn = page.locator('button:visible', { hasText: 'Rời bến' }).first();
  if (await undockBtn.count()) await undockBtn.click(); else await page.evaluate(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 15000 });
  I = await info();
  check('rời bến: mode sail, hết neo, đã đẩy ra xa slot', I.mode === 'sail' && I.dock === null && Math.hypot(I.x - slot.x, I.z - slot.z) > 2,
    'cách slot ' + Math.hypot(I.x - slot.x, I.z - slot.z).toFixed(1) + ' m');

  // ---- giữ W 5 giây: đi được, giờ trôi theo dt/(12·24) ----
  const a = await info();
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  await sleep(5000);
  await page.keyboard.up('KeyW');
  const held = (Date.now() - t0) / 1000;
  const b = await info();
  const moved = Math.hypot(b.x - a.x, b.z - a.z), dT = b.time - a.time, want = held / (12 * 24);
  check('giữ W 5 s: thuyền đi > 10 m', moved > 10, moved.toFixed(1) + ' m, ' + b.view.speed.toFixed(1) + ' hải lý');
  check('giờ trôi ≈ dt/(12·24) ngày khi ga hết cỡ', Math.abs(dT / want - 1) < 0.15, 'Δt ' + dT.toFixed(5) + ' / mong ' + want.toFixed(5));
  await sleep(300);
  await shot('3-sailing-day');

  // ---- đứng yên 3 giây: giờ không trôi ----
  await sleep(2500);
  const c0 = await info();
  await sleep(3000);
  const c1 = await info();
  check('đứng yên 3 s: giờ không trôi', Math.abs(c1.time - c0.time) < 1e-7, (c1.time - c0.time).toExponential(2));

  // ---- quay đủ một vòng ở tốc độ chạy ----
  const turn = await page.evaluate(async () => {
    // điểm nước thoáng (cách đất > 40 m) gần Greater Marrow nhất
    for (let r = 40; r < 400; r += 10) for (let a = 0; a < 6.28; a += 0.25) {
      const x = -3 + Math.cos(a) * r, z = Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 40) { DR_DEBUG.teleport(x, z, 0); return { sdf: DRWorld.sdf(x, z) }; }
    }
    return { sdf: -1 };
  });
  await page.keyboard.down('KeyW'); await sleep(2500);
  const y0 = (await info()).yaw, tt = Date.now();
  await page.keyboard.down('KeyD');
  await page.waitForFunction(y => Math.abs(DR.s.boat.yaw - y) >= Math.PI * 2, y0, { timeout: 20000 }).catch(() => {});
  const turnSec = (Date.now() - tt) / 1000;
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
  check('lái hết lái ở tốc độ chạy: 360° trong 4–6,5 s', turnSec > 4 && turnSec < 6.5, turnSec.toFixed(2) + ' s (nước sâu, sdf ' + turn.sdf.toFixed(0) + ' m)');

  // ---- đâm vào bờ: không lọt vào đất ----
  const coast = await page.evaluate(() => {
    // tìm điểm nước cách bờ ~12 m quanh Greater Marrow, hướng mũi thẳng vào đất (ngược gradient khoảng cách)
    for (let r = 30; r < 200; r += 7) for (let a = 0; a < 6.28; a += 0.2) {
      const x = -3 + Math.cos(a) * r, z = Math.sin(a) * r, d = DRWorld.sdf(x, z);
      if (d > 11 && d < 13) {
        const [gx, gz] = DRWorld.grad(x, z);
        let ok = true;
        for (let s = 0; s < 11; s += 1) if (DRWorld.sdf(x - gx * s, z - gz * s) < 0) { ok = false; break; }
        if (ok) { DR_DEBUG.teleport(x, z, Math.atan2(gx, gz)); return { x, z, d }; }
      }
    }
    return null;
  });
  if (coast) {
    await sleep(300);
    const dmg0 = (await info()).damage;
    await page.keyboard.down('KeyW');
    let minSdf = 1e9;
    for (let i = 0; i < 24; i++) { await sleep(200); minSdf = Math.min(minSdf, (await info()).sdf); }
    await shot('6-coast-collision');
    await page.keyboard.up('KeyW');
    const e = await info();
    check('đâm bờ: tâm thuyền luôn ở ngoài đất (sdf ≥ nửa bề ngang)', minSdf >= 0.5, 'sdf nhỏ nhất ' + minSdf.toFixed(2) + ' m');
    check('đâm bờ: thuyền bị chặn trước bờ', Math.hypot(e.x - coast.x, e.z - coast.z) < coast.d + 1, 'đi ' + Math.hypot(e.x - coast.x, e.z - coast.z).toFixed(1) + ' / ' + coast.d.toFixed(1) + ' m tới bờ');
    check('đâm bờ mạnh: hỏng đúng 1 ô khoang (bất tử 1,5 s sau cú đầu)', e.damage - dmg0 === 1, 'ô hỏng ' + dmg0 + ' → ' + e.damage);
  } else check('tìm được đoạn bờ để đâm', false);

  // ---- câu cá ở điểm cá thu/cá tuyết gần nhất ----
  const sp = await page.evaluate(() => DR_DEBUG.spotNear(['cod', 'mackerel'], -3, 0));
  check('có HarvestPOI cá thu/cá tuyết gần Greater Marrow', !!sp, sp && ('#' + sp.id + ' ' + sp.items + ' @ ' + sp.x.toFixed(0) + ',' + sp.z.toFixed(0)));
  await page.evaluate(s => { DR_DEBUG.setTime(0.4); DR_DEBUG.teleport(s.x + 3.2, s.z, 0); }, sp);
  await page.waitForFunction(() => DR.view.nearSpot, null, { timeout: 5000 }).catch(() => {});
  I = await info();
  check('gợi ý điểm câu, trạng thái ok', I.view.nearSpot && I.view.nearSpot.status === 'ok', JSON.stringify(I.view.nearSpot));
  const stock0 = I.view.nearSpot ? I.view.nearSpot.stock : 0;
  await sleep(500);
  await shot('4-harvest-spot');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest', null, { timeout: 5000 }).catch(() => {});
  check('Space ở điểm câu → harvest', (await info()).mode === 'harvest');
  // HarvestMinigameView gốc: mở bảng câu chưa tính giờ, phải bấm lần nữa mới thả câu
  const tOpen = (await info()).time;
  await sleep(800);
  check('bảng câu mở mà chưa bắt đầu: giờ đứng yên', (await info()).time === tOpen);
  const tFish = (await info()).time;
  await page.keyboard.press('Space');
  const mg = await page.evaluate(() => !!(window.DRMinigame && DRMinigame.isOpen()));
  await sleep(1500);
  await shot('5-harvest-minigame');
  const tMid = (await info()).time;
  // minigame chạy thì giờ trôi ×fishingTimePassageSpeedModifier (2,5)
  check('đang câu: giờ trôi ×2,5', tMid - tFish > 1.2 * 2.5 / 288 * 0.8, ((tMid - tFish) * 288).toFixed(2) + ' s giờ game / 1,5 s thật');
  if (mg) await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 30000 }).catch(() => {}); // để tiến độ thụ động tự đầy
  else await page.evaluate(() => DR_DEBUG.catchNow());
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 30000 }).catch(() => {});
  I = await info();
  const fish = I.inv.find(i => /^(cod|mackerel)/.test(i.id));
  check('cá vào khoang INVENTORY' + (mg ? ' (qua minigame của UI)' : ' (minigame chưa có: lối thụ động)'), !!fish, JSON.stringify(fish));
  check('cá mới: độ tươi = maxFreshness, cỡ trong [0,1]', fish && fish.fresh === 3 && fish.size >= 0 && fish.size <= 1);
  // kho hồi theo thời gian câu (StockReplenishCoefficient): sai số cho phép 0,15
  const stock1 = await page.evaluate(id => DR.s.spots[id].stock, sp.id);
  check('kho điểm câu giảm 1', Math.abs(stock1 - (stock0 - 1)) < 0.15, stock0.toFixed(2) + ' → ' + stock1.toFixed(2));

  // ---- đêm (?t=0.9) bật đèn ----
  const night = await page.evaluate(() => { const b = DR.s.boat; return [b.x, b.z]; });
  await page.goto(url('t=0.9&at=' + night[0].toFixed(1) + ',' + night[1].toFixed(1)));
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  check('nạp lại: có nút Tiếp tục', await page.isVisible('#btn-continue'));
  await page.click('#btn-continue');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 10000 });
  I = await info();
  check('?t=0.9 → đêm', !I.view.isDay && Math.abs(I.time % 1 - 0.9) < 0.001, (I.time % 1).toFixed(3));
  check('?at=x,z đặt thuyền đúng chỗ', Math.hypot(I.x - night[0], I.z - night[1]) < 0.2);
  // bản gốc chỉ lưu khi neo bến (Player.Dock updateSave): con cá câu sau lần neo cuối không có trong sổ
  check('nạp lại = trạng thái lúc neo bến cuối (cá câu ngoài biển chưa lưu)', !I.inv.some(i => /^(cod|mackerel)/.test(i.id)));
  await page.evaluate(() => DR_DEBUG.give('light1'));
  await page.keyboard.press('KeyL');
  await sleep(200);
  const lit = await page.evaluate(() => ({ on: DR.s.lightsOn, point: DRBoat.lights.point.intensity, spot: DRBoat.lights.spots[0].intensity }));
  check('L bật đèn: đèn điểm + đèn pha của Cracked Bulb', lit.on && lit.point > 0 && lit.spot > 0, JSON.stringify(lit));
  const s0 = (await info()).sanity;
  await page.keyboard.down('KeyW'); await sleep(2000); await page.keyboard.up('KeyW');
  const s1 = (await info()).sanity;
  check('đêm ngoài biển: hoảng loạn tăng khi đi (sanity giảm)', s1 < s0, s0.toFixed(4) + ' → ' + s1.toFixed(4));
  await sleep(800);
  await shot('7-night-lights');
  const st0 = (await info()).time;
  await sleep(2000);
  check('đêm, đứng yên: giờ không trôi', Math.abs((await info()).time - st0) < 1e-7);

  // ---- về Greater Marrow và cập bến ----
  const app = await page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 3; r < 8; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 1.8) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return { x, z }; }
    }
    return null;
  });
  await page.waitForFunction(() => DR.view.nearDock, null, { timeout: 5000 }).catch(() => {});
  I = await info();
  check('gần bến: gợi ý cập Greater Marrow', I.view.nearDock && I.view.nearDock.id === GM, JSON.stringify(I.view.nearDock));
  await page.evaluate(() => DR_DEBUG.setTime(0.3));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 25000 }).catch(() => {});
  I = await info();
  check('Space → tự lái vào slot rồi neo bến', I.mode === 'dock' && I.dock === GM, I.mode + ' ' + I.dock);
  check('neo bến thì lưu sổ (đèn vừa nhận có trong sổ, dock = Greater Marrow)', await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('dredge.save.v1')); return v.dock === 'dock.greater-marrow' && v.grids.INVENTORY.items.some(i => i.id === 'light1'); }));

  // ---- bến khoá theo cốt truyện: Người buôn cá chỉ mở sau lời Mayor (SetDestinationAvailable); bán cá kiểm ở test/dredge-story.js ----
  const dk = await page.evaluate(() => window.DRDock && DRDock._debug());
  check('bến Greater Marrow chưa mở Người buôn cá khi chưa nói chuyện với Mayor', !!dk && !dk.dests.includes('destination.gm-fishmonger'), dk && dk.dests.join(','));

  // ---- tạm dừng ----
  if (!touch) {
    const ub = page.locator('button:visible', { hasText: 'Rời bến' }).first();
    if (await ub.count()) await ub.click(); else await page.evaluate(() => DR.setMode('sail'));
    await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 15000 });
    await page.keyboard.press('Escape');
    const pz = await page.isVisible('#dr-pause') && (await info()).paused;
    const tp = (await info()).time;
    await page.keyboard.down('KeyW'); await sleep(800); await page.keyboard.up('KeyW');
    check('Esc → bảng tạm dừng, đang dừng thì giờ không trôi', pz && (await info()).time === tp);
    await page.click('#btn-resume');
    check('Tiếp tục chơi → hết dừng', !(await info()).paused && !(await page.isVisible('#dr-pause')));
  }

  // ---- cảm ứng: cần ảo bên trái kéo lên = ga ----
  if (touch) {
    const ub = page.locator('button:visible', { hasText: 'Rời bến' }).first();
    if (await ub.count()) await ub.tap().catch(() => ub.click()); else await page.evaluate(() => DR.setMode('sail'));
    await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 15000 });
    const cdp = await page.context().newCDPSession(page);
    const p0 = await info();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 300, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 230, id: 1 }] });
    await sleep(2500);
    const tb = await page.isVisible('#dr-touch .tbtns');
    await shot('8-touch');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const p1 = await info();
    check('cảm ứng: hiện nút phải + cần ảo trái chạy thuyền', tb && Math.hypot(p1.x - p0.x, p1.z - p0.z) > 3, Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1) + ' m');
    // ---- chìm thuyền → màn chìm → về bến đã lưu ----
    let n = 0;
    while ((await info()).mode === 'sail' && n++ < 10) await page.evaluate(() => DR_DEBUG.hit());
    I = await info();
    check('hỏng quá DamageThreshold (2 + 1·tier) ô → chìm', I.mode === 'over' && I.damage === 4 && await page.isVisible('#dr-over'), 'ô hỏng ' + I.damage);
    await shot('9-game-over');
    await page.click('#btn-reload');
    await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 10000 }).catch(() => {});
    I = await info();
    check('về bến đã lưu: neo Greater Marrow, thân tàu lành', I.mode === 'dock' && I.dock === GM && I.damage === 0, I.mode + ' ' + I.dock + ' hỏng ' + I.damage);
  }

  // ---- hiệu năng gần Greater Marrow (ban ngày, đang chạy) ----
  if (W === 1280) {
    await page.evaluate(() => DR_DEBUG.teleport(20, -30, 0.3));
    await page.keyboard.down('KeyW'); await sleep(3000);
    const p = await page.evaluate(() => DR_DEBUG.perf());
    await page.keyboard.up('KeyW');
    const gl = await page.evaluate(() => { const g = DR_DEBUG.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
    out.push('  · hiệu năng (ngày, gần Greater Marrow): ' + p.calls + ' draw call, ' + (p.tris / 1000).toFixed(0) + 'k tam giác, khung ' + p.avgMs.toFixed(1) +
      ' ms (max ' + p.maxMs.toFixed(1) + '), CPU/khung ' + p.cpuMs.toFixed(2) + ' ms (max ' + p.cpuMax.toFixed(1) + '), ' + p.programs + ' shader — GPU: ' + gl);
  }

  check('không có pageerror / console error / HTTP >= 400', w.errors.length === 0, w.errors.slice(0, 6).join(' | '));
  if (w.missing.length) out.push('  · 404 cho phép (tệp UI chưa có): ' + [...new Set(w.missing)].join(', '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    // bỏ khoá 60 khung/giây để đo được thời gian khung thật
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
  } catch (e) {
    fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e));
  }
  await browser.close();
  if (srv) srv.close();
  console.log('DREDGE suite — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
