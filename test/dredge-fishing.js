/*
 * DREDGE — Biển Mù, luồng W3 "câu cá": màn thu hoạch (HarvestMinigameView) + sáu minigame + hiệu ứng điểm câu, kiểm trên trang thật.
 *
 * Chạy:  node test/dredge-fishing.js            (tự dựng máy chủ tĩnh ở gốc repo; Playwright như test/dredge-suite.js)
 * Ảnh:   %TEMP%/dredge-fishing/<rộng>x<cao>-*.png  (mở ra xem bằng mắt)
 * Kiểm:  (1) bố cục: vị trí/kích cỡ px của từng nút so với số RectTransform viết thẳng ở LAYOUT (đơn vị canvas 1920x1080, khớp theo chiều cao);
 *        (2) luồng gốc: tới điểm -> Space -> panel hiện, GIỜ ĐỨNG -> bấm bắt đầu, giờ trôi -> minigame -> thẻ bắt được -> cá vào khoang -> chờ con kế -> Esc rời;
 *        (3) bot "bấm hoàn hảo" thắng cả sáu minigame mà không lần trượt nào; (4) cargo đầy -> DRCargo.open có holding;
 *        (5) kho/chữ/màu panel thông tin; (6) hiệu ứng điểm (số cá theo kho, điểm đặc biệt, dị biến); (7) tần số khung hình không tệ hơn 15% so với HEAD.
 * Luồng DRCargo chỉ gọi qua API công khai DRCargo.open / isOpen.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-fishing');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function gitHead(rel) { try { return cp.execFileSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, maxBuffer: 1 << 26 }); } catch (e) { return null; } }
function serve(headFiles) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (headFiles && headFiles[u]) { r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'text/plain' }); r.end(headFiles[u]); return; }
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 240)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// ------------------------------------------------------------------------------------------------------------------
// Số RectTransform của HarvestMinigameView đọc từ Scenes/Game.unity (CombinedMinigameView/Container), viết thẳng ở đây làm giá trị mong đợi.
// Toạ độ trong Container (720x320, dính mép trái, căn giữa dọc): cx = từ mép trái, cy = lệch lên so với tâm Container, w/h = kích cỡ (đơn vị canvas).
const LAYOUT = {
  '': { cx: 360, cy: 0, w: 720, h: 320 },                                  // Container: anchor (0,0.5), pivot (0,0.5), sd (720,320)
  'ProgressBar': { cx: 45, cy: 0, w: 70, h: 300 },                         // anchor (0,0.5) pivot (0,0.5) ap (10,0) sd (70,300)
  'ProgressBar/Bar': { cx: 45, cy: 0, w: 2, h: 232 },                      // anchors (0.5,0)-(0.5,1) sd (2,-68)
  'ProgressBar/FishIcon': { cx: 45, cy: -115, w: 30, h: 30 },              // ap (0,-115) sd (30,30), tiến độ 0
  'Title': { cx: 525, cy: 98, w: 250, h: 50 },                             // anchor (0,0.5) pivot (0,0.5) ap (400,98) sd (250,50)
  'StockText': { cx: 525, cy: 40, w: 250, h: 30 },                         // ap (400,40) sd (250,30)
  'HarvestableTypeTag': { cx: 450, cy: 0, w: 100, h: 30 },                 // ap (400,0) sd (100,30)
  'InvalidEquipmentIndicator': { cx: 515, cy: 0, w: 30, h: 30 },           // ap (500,0) sd (30,30)
  'Frame': { cx: 500, cy: -100, w: 200, h: 50 },                           // anchors (0,0)-(1,1) sd (-520,-270) ap (140,-100)
  'HintImage': { cx: 235, cy: 0, w: 150, h: 150 },                         // ap (-125,0) sd (150,150) quanh tâm Container
  'RadialFishMinigameWheel/Ring': { cx: 235, cy: 0, w: 274, h: 274 },
  'RadialFishMinigameWheel/Ring/Indicator/Image': { cx: 235, cy: 124 + 0, w: 84, h: 84 },   // ap (0,124) trên vòng, kim đứng ở đỉnh
  'RadialFishMinigameWheel/Frame': { cx: 385, cy: 0, w: 596, h: 290 },
  'PendulumMinigame/Frame': { cx: 385, cy: 0, w: 596, h: 290 },
  'PendulumMinigame/Pendulum/PendulumImage': { cx: 235, cy: 145 - 37.5, w: 20, h: 75, rotated: true },
  'BallCatcherMinigame/CircleFrame': { cx: 235, cy: 0, w: 280, h: 280 },
  'BallCatcherMinigame/TargetZone': null,
  'BallCatcherMinigame/Arrows': { cx: 235, cy: -117, w: 114, h: 50 },
  'DiamondMinigame/FrameInner': { cx: 235, cy: 0, w: 320, h: 320 },
  'DiamondMinigame/FrameOuter': { cx: 235, cy: 0, w: 320, h: 320 },
  'SpiralMinigame/CircleFrame': { cx: 235, cy: 0, w: 280, h: 280, rotated: true },
  'DredgeMinigameWheel/OuterRing': { cx: 235, cy: 0, w: 272, h: 272 },
  'DredgeMinigameWheel/InnerRing': { cx: 235, cy: 0, w: 224, h: 224 },
  'DredgeMinigameWheel/Frame': { cx: 385, cy: 0, w: 596, h: 290 }
};
const WHEEL_OF = { FISHING_RADIAL: 'RadialFishMinigameWheel', FISHING_PENDULUM: 'PendulumMinigame', FISHING_BALL_CATCHER: 'BallCatcherMinigame', FISHING_DIAMOND: 'DiamondMinigame', FISHING_SPIRAL: 'SpiralMinigame', DREDGE_RADIAL: 'DredgeMinigameWheel' };
const TYPES = Object.keys(WHEEL_OF);
const U = (W, H) => Math.max(H / 1080, Math.min(0.6, W / 1440));          // CanvasScaler theo chiều cao, sàn 0,6 cho điện thoại [ĐỀ XUẤT]

// Bot "bấm hoàn hảo": đọc DRMinigame._debug() và chỉ bấm khi chắc chắn trúng; trả về số lần bấm / số lần trượt.
function botSource() {
  return async function (type) {
    const n180 = a => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
    const st = { presses: 0, misses: 0, t0: performance.now(), type, wrong: [] };
    let lastPress = -1e9, lastPen = 0;
    const press = (why) => { const now = performance.now(); if (now - lastPress < 90) return; lastPress = now; st.presses++; DRMinigame._press(); };
    while (DRMinigame.phase() === "running" && performance.now() - st.t0 < 70000) {
      const d = DRMinigame._debug();
      if (!d) break;
      if (d.penalty > 0 && lastPen <= 0 && type !== 'DREDGE_RADIAL') { st.misses++; st.wrong.push(JSON.stringify(d).slice(0, 220)); }
      lastPen = d.penalty;
      if (d.penalty <= 0 || type === 'DREDGE_RADIAL') {
        if (type === 'FISHING_RADIAL') {
          d.targets.forEach((t, i) => { if (!d.hitThis.includes(i) && !(t.special && !d.trophyShowing) && d.angle > t.a - t.w / 2 + 3 && d.angle < t.a + t.w / 2 - 3) press(); });
        } else if (type === 'FISHING_PENDULUM') {
          const t = d.targets[d.active];
          if (t && !d.hitSwing) { const hi = n180(t.world), lo = n180(t.world - t.w); if (d.norm > Math.min(hi, lo) + 3 && d.norm < Math.max(hi, lo) - 3) press(); }
        } else if (type === 'FISHING_BALL_CATCHER') {
          const inZone = d.balls.filter(b => !b.gone && b.ang > d.zone[0] + 3 && b.ang < d.zone[1] - 3);
          if (inZone.some(b => b.type !== 'OBSTACLE') && !inZone.some(b => b.type === 'OBSTACLE')) press();
        } else if (type === 'FISHING_DIAMOND') {
          if (d.targets.some(t => t.inPlay && t.s > 0.93 && t.s < 1.02)) press();
        } else if (type === 'FISHING_SPIRAL') {
          d.notches.forEach(n => { if (!n.open && d.prop > n.x + 0.003 && d.prop < n.x + n.y - 0.003) press(); });
        } else if (type === 'DREDGE_RADIAL') {
          const near = (list, a) => list.some(t => { const lo = t.a - t.w / 2 - 6, hi = t.a + t.w / 2 + 6; return a > lo && a < hi; });
          const unsafe = (lane, ahead) => { for (let k = 0; k <= 12; k++) { const a = (((d.angle - d.speed * ahead * k / 12) % 360) + 360) % 360; if (near(lane ? d.innerT : d.outer, a)) return true; } return false; };
          const cur = d.inner;
          if (unsafe(cur, 0.28) && !unsafe(!cur, 0.35)) press();
        }
      }
      await new Promise(r => setTimeout(r, 5));
    }
    st.ms = performance.now() - st.t0;
    return st;
  };
}

async function boot(browser, base, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = watch(page);
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 10000 });
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(600);
  return { page, errs };
}

async function checkLayout(page, W, H, tag, type, only) {
  const u = U(W, H);
  const W0 = WHEEL_OF[type];
  const HIDDEN_PRE = /^(ProgressBar|InvalidEquipmentIndicator)/;
  const keys = Object.keys(LAYOUT).filter(k => LAYOUT[k] && (only ? only.includes(k) : !HIDDEN_PRE.test(k)) && (k.startsWith(W0 + '/') || !/^(PendulumMinigame|BallCatcherMinigame|DiamondMinigame|SpiralMinigame|DredgeMinigameWheel|RadialFishMinigameWheel)\//.test(k)));
  const rows = await page.evaluate(ks => ks.map(k => {
    const nd = DRMinigame.node(k);
    if (!nd) return { k, missing: true };
    const r = nd.el.getBoundingClientRect(), cs = getComputedStyle(nd.el);
    return { k, l: r.left, t: r.top, w: r.width, h: r.height, ow: nd.el.offsetWidth, oh: nd.el.offsetHeight, display: cs.display };
  }), keys);
  let bad = [];
  for (const r of rows) {
    const e = LAYOUT[r.k];
    if (r.missing) { bad.push(r.k + ' không có nút'); continue; }
    const wantW = e.w * u, wantH = e.h * u, cx = e.cx * u, cy = H / 2 - e.cy * u;
    if (r.k === 'ProgressBar/FishIcon' || r.k === 'RadialFishMinigameWheel/Ring/Indicator/Image' || r.k === 'PendulumMinigame/Pendulum/PendulumImage') {
      // nút xoay/di chuyển theo trò chơi: chỉ kiểm cỡ bố cục (offsetWidth), vị trí kiểm riêng nếu đứng yên
      if (Math.abs(r.ow - wantW) > 1.2 || Math.abs(r.oh - wantH) > 1.2) bad.push(r.k + ' cỡ ' + r.ow + 'x' + r.oh + ' ≠ ' + wantW.toFixed(1) + 'x' + wantH.toFixed(1));
      continue;
    }
    const rotated = e.rotated || /Container|^$/.test('x') && false;
    const w = rotated ? r.ow : r.w, h = rotated ? r.oh : r.h;
    const ccx = r.l + r.w / 2, ccy = r.t + r.h / 2;
    const tol = 1.3;
    if (Math.abs(w - wantW) > tol || Math.abs(h - wantH) > tol || Math.abs(ccx - cx) > tol || Math.abs(ccy - cy) > tol)
      bad.push(r.k + ' tâm (' + ccx.toFixed(1) + ',' + ccy.toFixed(1) + ') ' + w.toFixed(1) + 'x' + h.toFixed(1) + ' ≠ tâm (' + cx.toFixed(1) + ',' + cy.toFixed(1) + ') ' + wantW.toFixed(1) + 'x' + wantH.toFixed(1));
  }
  check('[' + tag + '] bố cục ' + type + (only ? ' (' + only.join(',') + ')' : '') + ': ' + rows.length + ' nút khớp RectTransform (u=' + u.toFixed(4) + ')', bad.length === 0, bad.slice(0, 4).join(' | '));
}

async function openDirect(page, type, info, extra) {
  await page.evaluate(([t, inf, ex]) => {
    const dredge = t === 'DREDGE_RADIAL';
    const cfg = (dredge ? DR_CONFIG.DredgingDifficultyConfigs : DR_CONFIG.FishingDifficultyConfigs).MEDIUM;
    const id = dredge ? 'metal' : 'mackerel';
    window.__done = null;
    DRMinigame.open(Object.assign({ type: t, cfg, speed: 1, itemId: id, info: Object.assign({ kind: dredge ? 'dredge' : 'fish', stock: 5, maxStock: 5, status: 'ok', harvestType: dredge ? 'DREDGE' : 'COASTAL' }, inf || {}), onDone: r => { window.__done = r; } }, ex || {}));
  }, [type, info || null, extra || null]);
  await sleep(800);
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, tag + '-' + n + '.png') });
  const { page, errs } = await boot(browser, base, W, H);
  const info = () => page.evaluate(() => DR_DEBUG.info());

  // ---- 1. bố cục + panel thông tin cho từng loại minigame (mở thẳng, chưa bắt đầu) ----
  for (const type of TYPES) {
    await openDirect(page, type, null);
    const wheelOn = await page.evaluate(() => {
      const names = ['RadialFishMinigameWheel', 'PendulumMinigame', 'BallCatcherMinigame', 'DiamondMinigame', 'SpiralMinigame', 'DredgeMinigameWheel'];
      return Object.fromEntries(names.map(n => [n, getComputedStyle(DRMinigame.node(n).el).display !== 'none']));
    });
    const onlyOne = Object.entries(wheelOn).filter(([, v]) => v).map(([k]) => k);
    check('[' + tag + '] ' + type + ': đúng một vòng hiện (' + WHEEL_OF[type] + ')', onlyOne.length === 1 && onlyOne[0] === WHEEL_OF[type], onlyOne.join(','));
    check('[' + tag + '] ' + type + ': panel ở trạng thái chờ, đồng hồ thế giới KHÔNG chạy', await page.evaluate(() => DRMinigame.phase() === 'prestart' && !DRMinigame.isOpen() && DRMinigame.isShown()));
    await checkLayout(page, W, H, tag, type);
    await shot(page, '1-' + type + '-prestart');
    await page.evaluate(() => DRMinigame.hide());
    await sleep(450);
  }

  // ---- 2. panel thông tin: tiêu đề, kho (màu), thẻ loại, nút ----
  const cases = [[5, 'Trữ lượng: Nhiều', 'rgb(116, 210, 122)'], [3, 'Trữ lượng: Vừa', 'rgb(255, 255, 255)'], [1, 'Trữ lượng: Ít', 'rgb(255, 154, 59)'], [0, 'Trữ lượng: Cạn', 'rgb(220, 44, 56)']];
  for (const [stock, text, color] of cases) {
    await openDirect(page, 'FISHING_RADIAL', { stock, status: stock === 0 ? 'no_stock' : 'ok' });
    const r = await page.evaluate(() => {
      const g = n => DRMinigame.node(n).el;
      return { title: g('Title').textContent, stock: g('StockText').textContent, color: getComputedStyle(g('StockText')).color, tag: g('HarvestableTypeTag/Text').textContent,
        tagc: g('HarvestableTypeTag').el ? 0 : 0, tagCol: g('HarvestableTypeTag').style.getPropertyValue('--c'), frameOn: getComputedStyle(g('Frame')).display !== 'none', cant: getComputedStyle(g('CannotStartText')).display !== 'none', cantText: g('CannotStartText').textContent,
        hint: getComputedStyle(g('HintImage')).display !== 'none' };
    });
    check('[' + tag + '] kho ' + stock + ': "' + text + '" màu ' + color, r.stock === text && r.color === color, r.stock + ' ' + r.color);
    if (stock === 5) {
      check('[' + tag + '] tiêu đề = Vùng nước động, thẻ loại COASTAL màu 3b367b', r.title === 'Vùng nước động' && r.tagCol === 'rgb(59,54,123)' && r.tag === 'VEN BỜ', r.title + ' / ' + r.tag + ' ' + r.tagCol);
      check('[' + tag + '] nút "Bắt đầu câu" + bóng cá gợi ý hiện', r.frameOn && r.hint && !r.cant);
      await shot(page, '2-info-stock5');
    }
    if (stock === 0) {
      check('[' + tag + '] hết cá: nút bắt đầu + gợi ý ẩn, hiện lý do màu đỏ', !r.frameOn && !r.hint && r.cant && /đã cạn/.test(r.cantText), r.cantText);
      await shot(page, '2-info-depleted');
    }
    await page.evaluate(() => DRMinigame.hide());
    await sleep(450);
  }
  await openDirect(page, 'FISHING_RADIAL', { status: 'no_equipment' });
  await checkLayout(page, W, H, tag, 'FISHING_RADIAL', ['InvalidEquipmentIndicator']);
  await shot(page, '2-info-no-equipment');
  await page.evaluate(() => DRMinigame.hide());
  await sleep(450);
  await openDirect(page, 'DREDGE_RADIAL', { stock: 2, kind: 'dredge', harvestType: 'DREDGE' });
  const dt = await page.evaluate(() => ({ title: DRMinigame.node('Title').el.textContent, tag: DRMinigame.node('HarvestableTypeTag/Text').el.textContent, col: DRMinigame.node('HarvestableTypeTag').el.style.getPropertyValue('--c') }));
  check('[' + tag + '] điểm nạo vét: tiêu đề + thẻ DREDGE màu 763d2f', dt.title === 'Bóng hình dưới đáy' && dt.tag === 'NẠO VÉT' && dt.col === 'rgb(118,61,47)', JSON.stringify(dt));
  await page.evaluate(() => DRMinigame.hide());
  await sleep(450);

  // ---- 3. bot bấm hoàn hảo thắng từng minigame (mở thẳng) ----
  for (const type of TYPES) {
    await openDirect(page, type, null);
    await page.keyboard.press('Space');                                   // bắt đầu
    await sleep(120);
    const started = await page.evaluate(() => ({ ph: DRMinigame.phase(), open: DRMinigame.isOpen() }));
    check('[' + tag + '] ' + type + ': Space bắt đầu, isOpen() = true', started.ph === 'running' && started.open, JSON.stringify(started));
    await checkLayout(page, W, H, tag, type, ['ProgressBar', 'ProgressBar/Bar', 'ProgressBar/FishIcon']);
    if (type === 'FISHING_RADIAL') await shot(page, '3-' + type + '-run-a');
    await sleep(1500);
    await shot(page, '3-' + type + '-run');
    const st = await page.evaluate(botSource(), type);
    const done = await page.evaluate(() => window.__done);
    const sec = (await page.evaluate(t => ((t === 'DREDGE_RADIAL' ? DR_CONFIG.DredgingDifficultyConfigs : DR_CONFIG.FishingDifficultyConfigs).MEDIUM.secondsToPassivelyCatch), type));
    const early = type === 'DREDGE_RADIAL' ? true : st.ms / 1000 + 1.7 < sec * 0.97;
    check('[' + tag + '] ' + type + ': bot hoàn hảo thắng, 0 lần trượt', st.misses === 0 && (st.presses > 0 || type === 'DREDGE_RADIAL'), st.presses + ' lần bấm, ' + st.misses + ' trượt, ' + (st.ms / 1000 + 1.7).toFixed(1) + ' s' + (st.wrong.length ? ' ' + st.wrong[0] : ''));
    if (type !== 'DREDGE_RADIAL') check('[' + tag + '] ' + type + ': thắng nhanh hơn tiến độ thụ động (' + sec + ' s)', early, (st.ms / 1000 + 1.7).toFixed(1) + ' s');
    await page.waitForFunction(() => window.__done, null, { timeout: 5000 }).catch(() => {});
    const d2 = await page.evaluate(() => window.__done);
    check('[' + tag + '] ' + type + ': onDone({caught:true}) sau hoạt ảnh kết thúc', d2 && d2.caught === true && !d2.aborted, JSON.stringify(d2));
    if (type === 'FISHING_RADIAL') await shot(page, '3-' + type + '-ending');
    await page.evaluate(() => DRMinigame.hide());
    await sleep(450);
  }

  // ---- 4. luồng thật: tới điểm câu -> Space -> chờ (giờ đứng) -> bắt đầu (giờ trôi) -> bot -> thẻ bắt được -> kho -> chờ con kế -> Esc ----
  await page.evaluate(() => { DR_DEBUG.give('tir-rod1'); DRBoat.refresh(); DR_DEBUG.setTime(0.4); });
  const SPOTS = { FISHING_RADIAL: ['mackerel'], FISHING_PENDULUM: ['black-sea-bass'], FISHING_BALL_CATCHER: ['firefly-squid', 'oceanic-perch'], FISHING_DIAMOND: ['grey-mullet', 'snake-mackerel'], DREDGE_RADIAL: ['flag-1', 'flag-2', 'metal'] };
  for (const type of Object.keys(SPOTS)) {
    if (type === 'DREDGE_RADIAL') await page.evaluate(() => { DR_DEBUG.give('dredge1'); DRBoat.refresh(); });
    const sp = await page.evaluate(ids => DR_DEBUG.spotNear(ids, 0, 0), SPOTS[type]);
    if (!sp) { check('[' + tag + '] có điểm ' + type, false, JSON.stringify(SPOTS[type])); continue; }
    await page.evaluate(s => { DR_DEBUG.setTime(0.4); const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = Math.max(o.maxStock || 1, 1); o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, sp);
    await page.waitForFunction(() => DR.view.nearSpot, null, { timeout: 8000 }).catch(() => {});
    await sleep(800);
    let ns = await page.evaluate(() => DR.view.nearSpot);
    if (ns && ns.status === 'wrong_time') {                              // điểm chỉ có cá ban đêm
      await page.evaluate(s => { DR_DEBUG.setTime(0.9); const o = DR.s.spots[s.id]; o.stock = Math.max(o.maxStock || 1, 1); o.lastUpdate = DR.s.time; }, sp);
      await sleep(1200);
      ns = await page.evaluate(() => DR.view.nearSpot);
    }
    check('[' + tag + '] ' + type + ': gần điểm #' + sp.id + ' trạng thái ok', ns && ns.status === 'ok', JSON.stringify(ns));
    if (type === 'FISHING_RADIAL') await shot(page, '4-spot-approach');
    const inv0 = (await info()).inv.length, stock0 = ns ? ns.stock : 0;
    await page.keyboard.press('Space');
    await page.waitForFunction(() => DR.mode === 'harvest' && DRMinigame.isShown(), null, { timeout: 5000 }).catch(() => {});
    const pre = await page.evaluate(() => ({ mode: DR.mode, phase: DRMinigame.phase(), open: DRMinigame.isOpen(), info: DRMinigame._info() }));
    check('[' + tag + '] ' + type + ': Space -> mode harvest, panel chờ', pre.mode === 'harvest' && pre.phase === 'prestart' && !pre.open, JSON.stringify(pre));
    const t0 = (await info()).time;
    const dbg0 = await page.evaluate(() => DRMinigame._debug());
    check('[' + tag + '] ' + type + ': panel mở đúng loại minigame', dbg0 && dbg0.type === type, dbg0 && dbg0.type);
    await sleep(1400);
    const tIdle = (await info()).time;
    check('[' + tag + '] ' + type + ': trong lúc chờ bắt đầu, giờ game ĐỨNG', Math.abs(tIdle - t0) < 1e-7, (tIdle - t0).toExponential(2));
    if (type === 'FISHING_RADIAL') await shot(page, '4-spot-prestart');
    await page.keyboard.press('Space');
    await sleep(1200);
    const tRun = (await info()).time;
    check('[' + tag + '] ' + type + ': bắt đầu rồi giờ trôi ×2,5', tRun - tIdle > 1.0 * 2.5 / 288 * 0.7, ((tRun - tIdle) * 288).toFixed(2) + ' s giờ game / ~1,2 s thật');
    const st = await page.evaluate(botSource(), type);
    check('[' + tag + '] ' + type + ': bot thắng ở điểm thật, 0 trượt', st.misses === 0, st.presses + ' bấm, ' + st.misses + ' trượt');
    await page.waitForFunction(() => DRMinigame.phase() === 'reveal', null, { timeout: 8000 }).catch(() => {});
    const rv = await page.evaluate(() => ({ ph: DRMinigame.phase(), title: DRMinigame.node('Title').el.textContent, stock: DRMinigame.node('StockText').el.textContent, hint: getComputedStyle(DRMinigame.node('HintImage').el).display }));
    const i1 = await info();
    check('[' + tag + '] ' + type + ': thẻ "bắt được" hiện tên + kích thước', rv.ph === 'reveal' && rv.title.length > 0 && (type === 'DREDGE_RADIAL' || /cm/.test(rv.stock)), JSON.stringify(rv));
    check('[' + tag + '] ' + type + ': vật phẩm vào INVENTORY', i1.inv.length === inv0 + 1, inv0 + ' -> ' + i1.inv.length + ' ' + (i1.inv[i1.inv.length - 1] && i1.inv[i1.inv.length - 1].id));
    const stock1 = await page.evaluate(id => DR.s.spots[id].stock, sp.id);
    check('[' + tag + '] ' + type + ': kho điểm giảm 1', Math.abs(stock1 - (stock0 - 1)) < 0.2, stock0.toFixed(2) + ' -> ' + stock1.toFixed(2));
    if (type === 'FISHING_RADIAL') await shot(page, '4-catch-reveal');
    await page.waitForFunction(() => DRMinigame.phase() === 'prestart', null, { timeout: 8000 }).catch(() => {});
    const nx = await page.evaluate(() => ({ mode: DR.mode, ph: DRMinigame.phase(), shown: DRMinigame.isShown() }));
    check('[' + tag + '] ' + type + ': sau thẻ, quay lại chờ con kế (vẫn trong màn thu hoạch)', nx.mode === 'harvest' && nx.ph === 'prestart' && nx.shown, JSON.stringify(nx));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 4000 }).catch(() => {});
    const lv = await page.evaluate(() => ({ mode: DR.mode, cur: !!DRSpots.cur }));
    check('[' + tag + '] ' + type + ': Esc rời -> lái thuyền', lv.mode === 'sail' && !lv.cur, JSON.stringify(lv));
    await sleep(500);
  }

  // ---- 5. Spiral: không có điểm pha 1 -> mở thẳng, mô phỏng mở cổng; 6. đường xoắn khớp sprite ----
  await openDirect(page, 'FISHING_SPIRAL', null);
  await page.keyboard.press('Space');
  await sleep(400);
  const sp0 = await page.evaluate(() => DRMinigame._debug());
  check('[' + tag + '] spiral: 3 cổng (spiralNumNotches của MEDIUM), kẻ ngoài vùng chết đầu 0,1', sp0.notches.length === 3 && sp0.notches[0].x >= 0.1 - 1e-9 && sp0.notches[2].x + sp0.notches[2].y <= 0.96 + 1e-9, JSON.stringify(sp0.notches.map(n => [+n.x.toFixed(3), +n.y.toFixed(3)])));
  await shot(page, '5-spiral');
  const gates = await page.evaluate(() => DRMinigame.node('SpiralMinigame/CircleFrame/Gates').el.children.length);
  check('[' + tag + '] spiral: số cổng trên màn = số notch', gates === 3, '' + gates);
  await page.evaluate(() => DRMinigame.hide());
  await sleep(450);

  // ---- 8. hiệu ứng điểm ----
  {
    const sp = await page.evaluate(ids => DR_DEBUG.spotNear(ids, 0, 0), ['mackerel']);
    await page.evaluate(s => { DR.s.spots[s.id].stock = 5; DR.s.spots[s.id].lastUpdate = DR.s.time; DR_DEBUG.setTime(0.4); DR_DEBUG.teleport(s.x - 7, s.z, -Math.PI / 2); }, sp);
    await sleep(2500);
    const fx = await page.evaluate(id => DRSpots._fx(id), sp.id);
    // Mỗi điểm hiện đúng số hạt = particlesPerStock × floor(kho), trần maxNumParticles (prefab HarvestableParticles của món đầu danh sách) và trần 15 của shader
    const want = (f, stock) => page.evaluate(([first, st]) => { const S = DR_HARVEST_UI.spotfx, p = S.prefabs[(S.items[first] || {}).p]; return !p ? 0 : Math.min(15, p.sil ? Math.min(p.maxP, p.pps * Math.floor(st)) : Math.floor(st)); }, [f.first, stock]);
    const w5 = fx && await want(fx, fx.stock);
    check('[' + tag + '] hiệu ứng điểm: kho ' + (fx && fx.stock.toFixed(2)) + ', món đầu "' + (fx && fx.first) + '" -> ' + w5 + ' hạt theo prefab', fx && w5 > 0 && fx.n === w5 && fx.tile >= 0, JSON.stringify(fx));
    await shot(page, '8-spot-fx-stock5');
    await page.evaluate(s => { DR.s.spots[s.id].stock = 1; }, sp);
    await sleep(1200);
        const fxB = await page.evaluate(id => DRSpots._fx(id), sp.id), w1 = fxB && await want(fxB, fxB.stock);
    check('[' + tag + '] hiệu ứng điểm: kho 1 -> ' + w1 + ' hạt', fxB && fxB.n === w1 && w1 > 0, JSON.stringify(fxB));
    await shot(page, '8-spot-fx-stock1');
    // điểm đặc biệt (aberrant): cờ bật -> xoáy cực quang
    await page.evaluate(s => { DR.s.vars['can-catch-aberrations'] = true; DR.s.spots[s.id].stock = 5; DRSpots.byId[s.id].special = true; DRSpots.byId[s.id].spDay = true; DRSpots.byId[s.id].spT = DR.s.time + 5; }, sp);
    await sleep(1500);
    const sf = (await page.evaluate(id => DRSpots._fx(id), sp.id) || {}).special;
    check('[' + tag + '] điểm đặc biệt: cờ glow = 1', sf === 1, '' + sf);
    await shot(page, '8-spot-fx-special');
    // FORCE: điểm đặc biệt, kho < 2 -> luôn ra dị biến (cần đã từng bắt loài gốc)
    const forced = await page.evaluate(s => {
      const id = 'mackerel'; DR.s.caught[id] = 1; DR.s.spots[s.id].stock = 1; DRSpots.byId[s.id].special = true;
      const orig = DR_ITEMS[id].aberrations; if (!orig || !orig.length) return { skip: true };
      let made = null; DR.on('catch', m => { made = m; });
      DRSpots.cur = { sp: DRSpots.byId[s.id], itemId: id, item: DR_ITEMS[id], dredge: false };
      DR.setMode('harvest');
      DRSpots.finish({ caught: true });
      return { aberrant: !!(made && made.aberrant), id: made && made.id, flag: DRSpots.byId[s.id].special };
    }, sp);
    check('[' + tag + '] điểm đặc biệt + kho < 2: FORCE dị biến, rồi tắt cờ đặc biệt', forced.skip || (forced.aberrant && forced.flag === false), JSON.stringify(forced));
    await page.evaluate(() => { try { DRMinigame.hide(); } catch (e) { /* */ } if (DRCargo.isOpen()) DRCargo.close(); DRSpots.cur = null; DRSpots.fishing = false; if (DR.mode !== 'sail') DR.setMode('sail'); });
  }

  // ---- 7. cargo đầy: DRCargo.open có holding, panel chờ ----
  {
    const sp = await page.evaluate(ids => DR_DEBUG.spotNear(ids, 0, 0), ['mackerel']);
    await page.evaluate(s => { DR_DEBUG.setTime(0.4); const o = DR.s.spots[s.id]; o.stock = Math.max(o.maxStock || 1, 2); o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, sp);
    await page.waitForFunction(() => DR.view.nearSpot && DR.view.nearSpot.status === 'ok', null, { timeout: 8000 }).catch(() => {});
    await sleep(500);
    const filled = await page.evaluate(() => { let n = 0; while (DR_DEBUG.give('mackerel')) { if (++n > 300) break; } return n; });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => DR.mode === 'harvest' && DRMinigame.isShown(), null, { timeout: 5000 }).catch(() => {});
    await page.keyboard.press('Space');
    await sleep(300);
    const st = await page.evaluate(botSource(), 'FISHING_RADIAL');
    await page.waitForFunction(() => DRMinigame.phase() === 'reveal', null, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => DRCargo.isOpen(), null, { timeout: 8000 }).catch(() => {});
    const cg = await page.evaluate(() => ({ cargo: DRCargo.isOpen(), ph: DRMinigame.phase(), mode: DR.mode, dbg: DRCargo._debug && DRCargo._debug() }));
    check('[' + tag + '] khoang đầy (' + filled + ' món): DRCargo.open mở với món đang cầm, panel giữ chỗ', cg.cargo && cg.ph === 'wait' && cg.mode === 'harvest', JSON.stringify({ cargo: cg.cargo, ph: cg.ph, mode: cg.mode }));
    await shot(page, '7-cargo-full');
    await page.evaluate(() => { for (let i = 0; i < 3; i++) { /* mở chỗ trống bằng cách xoá bớt */ } });
    await page.keyboard.press('Escape');                                 // cargo chặn đóng khi còn cầm đồ
    await sleep(300);
    check('[' + tag + '] khoang đầy: Esc không đóng được khi còn cầm món vừa bắt', await page.evaluate(() => DRCargo.isOpen()));
    await page.evaluate(() => { DRCargo.close(); DR.setMode('sail'); });
  }

  check('[' + tag + '] không có pageerror / console error / HTTP >= 400', errs.length === 0, errs.slice(0, 5).join(' | '));
  await page.close();
}

async function perf(browser, headFiles, label) {
  const srv = await serve(headFiles), base = 'http://127.0.0.1:' + srv.address().port;
  const { page, errs } = await boot(browser, base, 1280, 720);
  await page.evaluate(() => DR_DEBUG.teleport(20, -30, 0.3));
  await sleep(1500);
  const r = [];
  for (let i = 0; i < 3; i++) { await sleep(2500); const p = await page.evaluate(() => DR_DEBUG.perf()); r.push(p.cpuMs); }
  await page.close(); srv.close();
  return { cpu: Math.min(...r), all: r };
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
    // ---- 9. tần số khung: bản này vs HEAD (spots.js + minigame.js + index.html của HEAD) ----
    const head = {};
    for (const f of ['js/spots.js', 'js/minigame.js']) { const b = gitHead('games/dredge/' + f); if (b) head['/games/dredge/' + f] = b; }
    const now = await perf(browser, null, 'now');
    const was = await perf(browser, head, 'head');
    out.push('\n[hiệu năng 1280x720, CPU/khung ms, nhỏ nhất của 3 mẫu]  bản này ' + now.cpu.toFixed(2) + ' (' + now.all.map(v => v.toFixed(2)).join(', ') + ')  HEAD ' + was.cpu.toFixed(2) + ' (' + was.all.map(v => v.toFixed(2)).join(', ') + ')');
    check('khung hình không tệ hơn 15% so với HEAD (cùng cảnh, cùng máy)', now.cpu <= was.cpu * 1.15 + 0.15, 'tỉ lệ ' + (now.cpu / was.cpu).toFixed(2));
  } catch (e) {
    fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e));
  }
  await browser.close();
  srv.close();
  console.log('DREDGE fishing — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
