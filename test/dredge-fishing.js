/*
 * DREDGE — Biển Mù, luồng W3 "câu cá": màn thu hoạch (HarvestMinigameView) + sáu minigame + hiệu ứng điểm câu, kiểm trên trang thật.
 *
 * Chạy:  node test/dredge-fishing.js            (tự dựng máy chủ tĩnh ở gốc repo; Playwright như test/dredge-suite.js)
 * Ảnh:   %TEMP%/dredge-fishing/<rộng>x<cao>-*.png  (mở ra xem bằng mắt)
 * Kiểm:  (1) bố cục: vị trí/kích cỡ px của từng nút so với số RectTransform viết thẳng ở LAYOUT (đơn vị canvas 1920x1080, khớp theo chiều cao);
 *        (2) luồng gốc: tới điểm -> Space -> panel hiện, GIỜ ĐỨNG -> bấm bắt đầu, giờ trôi -> minigame -> cá lên con trỏ (khoang docked, r2fish F2)
 *            -> chuột trái đặt vào khoang -> chờ con kế -> Esc rời;
 *        (3) bot "bấm hoàn hảo" thắng cả sáu minigame mà không lần trượt nào; (4) cargo đầy -> món vẫn trên con trỏ, giữ Z vứt;
 *        (5) kho/chữ/màu panel thông tin; (6) hiệu ứng điểm (số cá theo kho, điểm đặc biệt, dị biến); (7) tần số khung hình không tệ hơn 15% so với HEAD.
 * Vòng 2 (audit D:\dredge-ref\notes\audit\fishing.md, số mong đợi viết thẳng từ dữ liệu gốc):
 *        F1 camera HarvestClearShot: vào điểm -> cao 20,3 m trên thuyền, chúc 75,96°, FOV 40 sau blend Brain 2 s; rời -> về rig bám thuyền;
 *        F3 cá nổi/bơi/lặn (CodParticles VelocityModule.y): pha lặn (t > 0,8) dưới mặt nước và đang đi xuống; F4 mảnh vụn 6 mảnh, cổ vật gọi
 *        DRParticles.spawn('RelicParticles') rồi stop() khi cạn; F5 banner loài mới ở con đầu, không ở con thứ hai; F6 clip gần điểm 1/2/3 + khoảng nghỉ;
 *        F7 tiếng trúng/trượt (2 lần trượt bằng Space thật) có cao độ 0,95-1,05 khác nhau giữa các lần bấm; F8 vào điểm thiếu dụng cụ / cần câu trên ô hỏng; F10 vòng cá không rung;
 *        F12 maxP = particlesPerStock × floor(kho); F13 vòng nước; F14 popup tan biến; F16 Line hiện; ảnh ghép cạnh gog_04 / gog_16 (sbs-*.png).
 * Đo hiệu năng so với bản trước: FISH_BASE=<thư mục chứa games/dredge cũ> (mặc định lấy git HEAD nếu có).
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

function gitHead(rel) { try { return cp.execFileSync('git', ['show', 'HEAD:' + rel], { cwd: ROOT, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } }
// tệp của luồng câu cá ở bản "trước": FISH_BASE (bản sao thư mục) hoặc git HEAD
const OWNED = ['js/camera.js', 'js/spots.js', 'js/minigame.js', 'css/minigame.css', 'art/ui/minigame/harvest_ui.js', 'art/ui/minigame/fish_atlas.webp', 'index.html'];
function baseFiles() {
  const out = {};
  for (const f of OWNED) {
    let b = null;
    if (process.env.FISH_BASE) { const q = path.join(process.env.FISH_BASE, 'games/dredge', f); if (fs.existsSync(q)) b = fs.readFileSync(q); }
    else if (f === 'index.html') {
      // index.html của HEAD thiếu mọi thẻ các luồng khác thêm cùng đợt, nên "bản trước" sẽ đo cả đợt chứ không riêng câu cá:
      // giữ index hiện tại, chỉ bỏ các thẻ banner mà luồng câu cá thêm
      b = Buffer.from(fs.readFileSync(path.join(ROOT, 'games/dredge', f), 'utf8').split('\n').filter(l => !/banner/.test(l)).join('\n'));
    } else b = gitHead('games/dredge/' + f);
    if (b) out['/games/dredge/' + f] = b;
  }
  return out;
}
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

// r2fish: đặt món đang cầm vào ô trống đầu tiên của khoang bằng chuột trái thật (tâm dấu chân = con trỏ, như js/cargo.js)
async function placeHeld(page) {
  const p = await page.evaluate(() => {
    const held = DRCargo.held(), dk = DRCargo._debug();
    if (!held || !dk) return null;
    const def = DR.item(held.id), gr = dk.grids.find(g => g.key === 'INVENTORY'), s = DRGrid.findSpot(DR.grid('INVENTORY'), def, 0, false);
    if (!s || !gr) return null;
    const f = DRGrid.footprint(def, s.x, s.y, 0), xs = f.map(q => q[0]), ys = f.map(q => q[1]);
    return { x: gr.x + (Math.min(...xs) + Math.max(...xs) + 1) / 2 * dk.cs, y: gr.y + (Math.min(...ys) + Math.max(...ys) + 1) / 2 * dk.cs };
  });
  if (!p) return false;
  await page.mouse.move(p.x, p.y, { steps: 6 }); await sleep(80);
  await page.mouse.down(); await page.mouse.up(); await sleep(250);
  return true;
}

async function boot(browser, base, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = watch(page);
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__aud = []; window.__fx = [];
    const p0 = DRAudio.play;
    DRAudio.play = function (k, v, r) { __aud.push({ k, v, r, t: performance.now() }); return p0.apply(this, arguments); };
    const s0 = DRParticles.spawn;
    DRParticles.spawn = function (name, o) { const rec = { name, o: JSON.parse(JSON.stringify(o || {})), stopped: false, t: performance.now() }; __fx.push(rec); const h = s0.apply(this, arguments); return { stop() { rec.stopped = true; if (h && h.stop) h.stop(); }, setRate() {}, alive: true }; };
  });
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
    if (type === 'FISHING_RADIAL') await page.evaluate(() => { window.__ring = new Set(); window.__ringIv = setInterval(() => { const n = DRMinigame.node('RadialFishMinigameWheel/Ring'); if (n) __ring.add(n.el.style.transform + '|' + n.el.style.opacity); }, 16); });
    const st = await page.evaluate(botSource(), type);
    if (type === 'FISHING_RADIAL') {
      const ring = await page.evaluate(() => { clearInterval(__ringIv); const c = DR_HARVEST_UI.clips.HarvestMinigameHit.curves.filter(v => /^path_0x/.test(v.path)).length; return { states: [...__ring], hashed: c }; });
      check('[' + tag + '] F10 vòng cá: clip Hit có ' + ring.hashed + ' đường cong băm (FishMinigameWheel/Ring) không gắn vào nút nào -> vòng không rung/loé khi trúng', ring.hashed >= 1 && ring.states.length === 1 && ring.states[0] === '|', JSON.stringify(ring.states.slice(0, 4)));
    }
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
    // FISHING_RADIAL câu hai con liền (F5 con thứ hai không có banner) -> kho 2; loại khác kho 1
    await page.evaluate(([s, n]) => { DR_DEBUG.setTime(0.4); const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = n; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, [sp, type === 'FISHING_RADIAL' ? 2 : 1]);
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
    const camOf = () => page.evaluate(() => { const c = DR_DEBUG.camera, b = DRBoat.root.position, d = new THREE.Vector3(); c.getWorldDirection(d);
      return { dy: c.position.y - b.y, dxz: Math.hypot(c.position.x - b.x, c.position.z - b.z), pitch: Math.asin(-d.y) * 180 / Math.PI, fov: c.fov, w: DRCamera.harvestW }; });
    const chase = type === 'FISHING_RADIAL' ? await camOf() : null;
    await page.keyboard.press('Space');
    await page.waitForFunction(() => DR.mode === 'harvest' && DRMinigame.isShown(), null, { timeout: 5000 }).catch(() => {});
    if (type === 'FISHING_RADIAL') {
      // F1: blend của CinemachineBrain (m_DefaultBlend Custom 2 s) -> giữa chừng ở 1 s, xong sau 2 s; Top High: offset (0,20,−5) quanh ColliderCenter (0,0,3)
      await sleep(900);
      const mid = await camOf();
      check('[' + tag + '] F1 camera: 0,9 s sau khi vào điểm đang blend (Brain m_DefaultBlend 2 s)', mid.w > 0.2 && mid.w < 0.97 && mid.dy > chase.dy + 1 && mid.dy < 20.0, JSON.stringify(mid));
      await sleep(1700);
      const top = await camOf();
      check('[' + tag + '] F1 camera Harvest VCam Top High: cao 20,3 m trên thuyền, cách 5 m, chúc 75,96°, FOV 40', Math.abs(top.dy - 20.3) < 0.25 && Math.abs(top.dxz - 5) < 0.25 && Math.abs(top.pitch - 75.96) < 1 && Math.abs(top.fov - 40) < 0.01 && top.w === 1,
        'cao ' + top.dy.toFixed(2) + ' m, ngang ' + top.dxz.toFixed(2) + ' m, chúc ' + top.pitch.toFixed(2) + '°, FOV ' + top.fov.toFixed(2) + ' (rig bám: cao ' + chase.dy.toFixed(2) + ', chúc ' + chase.pitch.toFixed(1) + '°)');
      await shot(page, '4-camera-top');
    }
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
    const a0 = await page.evaluate(() => __aud.length);
    const st = await page.evaluate(botSource(), type);
    check('[' + tag + '] ' + type + ': bot thắng ở điểm thật, 0 trượt', st.misses === 0, st.presses + ' bấm, ' + st.misses + ' trượt');
    await page.waitForFunction(() => DRCargo.held(), null, { timeout: 8000 }).catch(() => {});
    if (type === 'FISHING_RADIAL') {
      // F5: con đầu tiên của loài -> banner "loài mới" (tên món gốc DR_ITEMS.mackerel.name = "Blue Mackerel"), tiếng "Fish - New";
      // thẻ bắt được KHÔNG phát tiếng riêng (SFX-10): sau tiếng kết thúc "fish.end" không còn fish.new / fish.minigame.hit nào.
      // (FishMinigame.OnMinigameInteractPress: cú trúng đưa Progress tới 1 không phát hitSFX, nên số tiếng trúng KHÔNG bằng số lần bấm.)
      await page.waitForFunction(() => window.DRBanner && DRBanner._debug().showing, null, { timeout: 3000 }).catch(() => {});
      const bn = await page.evaluate(() => Object.assign(DRBanner._debug(), { vis: getComputedStyle(document.getElementById('dr-banner')).display }));
      const snd = await page.evaluate(a => __aud.slice(a).map(x => x.k), a0);
      const u = U(W, H);
      check('[' + tag + '] F5 banner loài mới: "Blue Mackerel" + "Đã thêm dữ liệu loài vào Bách khoa.", y = −250 (đang mở cửa sổ), 600x100', bn.showing && bn.kind === 'fish' && bn.title === 'Blue Mackerel' && bn.subtitle === 'Đã thêm dữ liệu loài vào Bách khoa.' && bn.pos === -250 && bn.vis === 'block' &&
        Math.abs(bn.rect.width - 600 * u) < 1.5 && Math.abs(bn.rect.y + bn.rect.height / 2 - (H / 2 + 250 * u)) < 1.5, JSON.stringify(bn));
      const endAt = snd.indexOf('fish.end'), after = endAt < 0 ? [] : snd.slice(endAt + 1);
      check('[' + tag + '] F5 tiếng: "fish.end" rồi banner phát "Fish - New" đúng 1 lần, không có fish.new / fish.minigame.hit sau khi bắt xong', endAt >= 0 && after.filter(k => k === 'Fish - New').length === 1 && snd.filter(k => k === 'Fish - New').length === 1 &&
        !snd.includes('fish.new') && !after.includes('fish.minigame.hit'), snd.join(','));
      await shot(page, '4-banner-new-species');
    }
    // r2fish F2 (thay thẻ "bắt được" + tự vào khoang): món nằm trên con trỏ (BEING_HARVESTED), khoang chưa đổi; chuột trái đặt vào ô trống
    const rv = await page.evaluate(() => ({ ph: DRMinigame.phase(), held: DRCargo._debug() && DRCargo._debug().held, docked: DRCargo._debug() && DRCargo._debug().docked }));
    check('[' + tag + '] ' + type + ': bắt xong -> món trên con trỏ của khoang docked, panel "held", khoang chưa đổi', rv.ph === 'held' && rv.held && rv.held.st === 'BEING_HARVESTED' && rv.docked && (await info()).inv.length === inv0, JSON.stringify(rv));
    if (type === 'FISHING_RADIAL') await shot(page, '4-catch-held');
    await placeHeld(page);
    const i1 = await info();
    check('[' + tag + '] ' + type + ': chuột trái đặt -> vật phẩm vào INVENTORY', i1.inv.length === inv0 + 1, inv0 + ' -> ' + i1.inv.length + ' ' + (i1.inv[i1.inv.length - 1] && i1.inv[i1.inv.length - 1].id));
    const stock1 = await page.evaluate(id => DR.s.spots[id].stock, sp.id);
    check('[' + tag + '] ' + type + ': kho điểm giảm 1', Math.abs(stock1 - (stock0 - 1)) < 0.2, stock0.toFixed(2) + ' -> ' + stock1.toFixed(2));
    await page.waitForFunction(() => DRMinigame.phase() === 'prestart', null, { timeout: 8000 }).catch(() => {});
    const nx = await page.evaluate(() => ({ mode: DR.mode, ph: DRMinigame.phase(), shown: DRMinigame.isShown() }));
    check('[' + tag + '] ' + type + ': sau khi đặt, quay lại chờ con kế (vẫn trong màn thu hoạch)', nx.mode === 'harvest' && nx.ph === 'prestart' && nx.shown, JSON.stringify(nx));
    if (type === 'FISHING_RADIAL') {
      // F5: con thứ hai cùng loài -> KHÔNG có banner loài mới (BannersUI.OnItemSeen: GetCaughtCountById == 0)
      const nb0 = await page.evaluate(() => DRBanner.history.filter(h => h.kind === 'fish').length);
      await page.keyboard.press('Space');
      await sleep(300);
      // F7: hai lần bấm Space thật lúc kim nằm ngoài mọi mục tiêu -> hai tiếng trượt, mỗi lần một cao độ
      for (let k = 0; k < 2; k++) {
        await page.waitForFunction(() => { const d = DRMinigame._debug(); if (!d || d.penalty > 0) return false; const n = a => ((a % 360) + 540) % 360 - 180; return d.targets.every(t => Math.abs(n(d.angle - t.a)) > t.w / 2 + 12); }, null, { timeout: 5000, polling: 'raf' }).catch(() => {});
        await page.keyboard.press('Space');
        await page.waitForFunction(() => { const d = DRMinigame._debug(); return d && d.penalty <= 0; }, null, { timeout: 5000 }).catch(() => {});
        await sleep(60);
      }
      await page.evaluate(botSource(), type);
      await page.waitForFunction(() => DRCargo.held(), null, { timeout: 8000 }).catch(() => {});
      await sleep(600);
      const h2 = await page.evaluate(() => ({ fish: DRBanner.history.filter(h => h.kind === 'fish').length, caught: DR.s.caught.mackerel, last: DRBanner.history.slice(-1)[0] }));
      check('[' + tag + '] F5 con thứ hai (mackerel lần ' + h2.caught + '): không có banner loài mới', h2.caught === 2 && h2.fish === nb0, JSON.stringify(h2));
      // F7: FishMinigame randomPitchMin/Max 0,95/1,05 (cảnh) -> mỗi lần bấm (trúng hoặc trượt) một cao độ Random.Range riêng; gom cả hai con
      const blips = await page.evaluate(a => __aud.slice(a).filter(x => x.k === 'fish.minigame.hit' || x.k === 'fish.minigame.miss').map(x => ({ k: x.k.split('.').pop(), r: x.r })), a0);
      const range = await page.evaluate(() => [DR_HARVEST_UI.mini.FishMinigame.randomPitchMin, DR_HARVEST_UI.mini.FishMinigame.randomPitchMax]);
      const rs = blips.map(b => b.r);
      check('[' + tag + '] F7 tiếng trúng/trượt: cao độ trong [0,95; 1,05], khác nhau giữa các lần bấm (≥ 2 trượt do Space thật)', range[0] === 0.95 && range[1] === 1.05 && blips.filter(b => b.k === 'miss').length >= 2 && blips.some(b => b.k === 'hit') &&
        rs.every(r => typeof r === 'number' && r >= 0.95 && r <= 1.05) && new Set(rs.map(r => r.toFixed(4))).size >= Math.min(3, rs.length), blips.map(b => b.k + ' ' + (b.r == null ? '-' : b.r.toFixed(3))).join(', '));
      await placeHeld(page);
      await page.waitForFunction(() => DRMinigame.phase() === 'prestart', null, { timeout: 8000 }).catch(() => {});
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 4000 }).catch(() => {});
    const lv = await page.evaluate(() => ({ mode: DR.mode, cur: !!DRSpots.cur }));
    check('[' + tag + '] ' + type + ': Esc rời -> lái thuyền', lv.mode === 'sail' && !lv.cur, JSON.stringify(lv));
    if (type === 'FISHING_RADIAL') {
      await sleep(2600);
      const back = await page.evaluate(() => { const c = DR_DEBUG.camera, b = DRBoat.root.position, d = new THREE.Vector3(); c.getWorldDirection(d); return { dy: c.position.y - b.y, pitch: Math.asin(-d.y) * 180 / Math.PI, fov: c.fov, w: DRCamera.harvestW }; });
      check('[' + tag + '] F1 rời điểm: blend 2 s về rig bám thuyền (cao ' + back.dy.toFixed(2) + ' m, chúc ' + back.pitch.toFixed(1) + '°)', back.w === 0 && back.dy < 8 && back.pitch < 40 && Math.abs(back.fov - 40) < 0.01, JSON.stringify(back));
    }
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

  // ---- 8. hạt điểm câu (F3 F4 F12 F13) ----
  {
    const sp = await page.evaluate(ids => DR_DEBUG.spotNear(ids, 0, 0), ['mackerel']);
    await page.evaluate(s => { DR_DEBUG.setTime(0.4); DR.s.spots[s.id].stock = 5; DR.s.spots[s.id].lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x - 7, s.z, -Math.PI / 2); }, sp);   // setTime trước: lùi giờ sau lastUpdate làm regenStock trừ kho (dt < 0)
    await sleep(2500);
    const fx = await page.evaluate(id => DRSpots._fx(id), sp.id);
    // F12: HarvestableParticles.UpdateParticles: maxParticles = particlesPerStock (MackerelParticles 3) × floor(kho)
    check('[' + tag + '] F12 MackerelParticles: kho 5 -> maxP = 3 × 5 = 15, đang có 1..15 cá, mesh thật đã nạp', fx && fx.prefab === 'MackerelParticles' && fx.pps === 3 && fx.maxP === 15 && fx.n >= 1 && fx.n <= 15 && fx.meshes, JSON.stringify(fx));
    check('[' + tag + '] F13 vòng nước động (DisturbedWaterParticles_0): có cầu nổi', fx && fx.ring > 0, JSON.stringify(fx && fx.ring));
    await shot(page, '8-spot-fx-stock5');
    await page.evaluate(s => { DR.s.spots[s.id].stock = 1; }, sp);
    await sleep(1200);
    const fxB = await page.evaluate(id => DRSpots._fx(id), sp.id);
    check('[' + tag + '] F12 kho 1 -> maxP 3, cá thừa tắt sau 0,2 s', fxB && fxB.maxP === 3 && fxB.n <= 3 && fxB.n >= 1, JSON.stringify(fxB));
    await page.evaluate(s => { DR.s.spots[s.id].stock = 0.4; }, sp);
    await sleep(1600);
    const fxC = await page.evaluate(id => DRSpots._fx(id), sp.id);
    check('[' + tag + '] kho < 1 -> không còn cá, vòng nước ngừng phát (toggleParticles)', fxC && fxC.n === 0 && fxC.ring === 0, JSON.stringify(fxC));
    // F3: CodParticles VelocityModule.y (scalar 2; khoá (0,1) (0,23,0) (0,75,0) (1,−1)): nổi lên rồi lặn xuống, luôn dưới mặt nước
    const cod = await page.evaluate(ids => DR_DEBUG.spotNear(ids, 0, 0), ['cod']);
    await page.evaluate(s => { const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = 5; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x - 7, s.z, -Math.PI / 2); }, cod);
    await sleep(1500);
    // lấy mẫu trọn một đời cá (startLifetime 10 s): bầy vừa bật kho (0 -> 5) toàn cá mới sinh, phải chờ quá 8 s mới có con ở pha lặn
    const dive = [], rise = [], swim = [];
    for (let i = 0; i < 18; i++) {
      const f = await page.evaluate(id => DRSpots._fish(id), cod.id) || [];
      for (const p of f) (p.t > 0.8 ? dive : p.t < 0.15 ? rise : p.t > 0.3 && p.t < 0.7 ? swim : []).push(p);
      await sleep(700);
    }
    const okDive = dive.length > 0 && dive.every(p => p.depth > 0 && p.vy < 0), okRise = rise.length > 0 && rise.every(p => p.vy > 0);
    check('[' + tag + '] F3 cá tuyết: pha lặn (t > 0,8) dưới mặt nước và đang đi xuống, pha nổi (t < 0,15) đi lên, pha bơi vy = 0', okDive && okRise && swim.every(p => Math.abs(p.vy) < 1e-6 && p.depth > 0),
      'lặn ' + dive.length + ' mẫu, sâu ' + (dive.length ? Math.min(...dive.map(p => p.depth)).toFixed(2) + '..' + Math.max(...dive.map(p => p.depth)).toFixed(2) : '-') + ' m, vy ' + (dive.length ? Math.max(...dive.map(p => p.vy)).toFixed(2) : '-') +
      '; nổi ' + rise.length + ' mẫu vy ≥ ' + (rise.length ? Math.min(...rise.map(p => p.vy)).toFixed(2) : '-') + '; bơi ' + swim.length);
    await shot(page, '8-spot-cod');
    // điểm đặc biệt (aberrant): cờ bật -> xoáy cực quang
    await page.evaluate(s => { DR.s.vars['can-catch-aberrations'] = true; DR.s.spots[s.id].stock = 5; DRSpots.byId[s.id].special = true; DRSpots.byId[s.id].spDay = true; DRSpots.byId[s.id].spT = DR.s.time + 5; }, sp);
    await page.evaluate(s => DR_DEBUG.teleport(s.x - 7, s.z, -Math.PI / 2), sp);
    await sleep(1500);
    const sf = (await page.evaluate(id => DRSpots._fx(id), sp.id) || {}).special;
    check('[' + tag + '] điểm đặc biệt: cờ glow = 1', sf === 1, '' + sf);
    await shot(page, '8-spot-fx-special');
    // FORCE: điểm đặc biệt, kho < 2 -> luôn ra dị biến (cần đã từng bắt loài gốc)
    const forced = await page.evaluate(s => {
      const id = 'mackerel'; DR.s.caught[id] = Math.max(1, DR.s.caught[id] || 0); DR.s.spots[s.id].stock = 1; DRSpots.byId[s.id].special = true;
      const orig = DR_ITEMS[id].aberrations; if (!orig || !orig.length) return { skip: true };
      let made = null; DR.on('catch', m => { made = m; });
      DRSpots.cur = { sp: DRSpots.byId[s.id], itemId: id, item: DR_ITEMS[id], dredge: false };
      DR.setMode('harvest');
      DRSpots.finish({ caught: true });
      return { aberrant: !!(made && made.aberrant), id: made && made.id, flag: DRSpots.byId[s.id].special };
    }, sp);
    check('[' + tag + '] điểm đặc biệt + kho < 2: FORCE dị biến, rồi tắt cờ đặc biệt', forced.skip || (forced.aberrant && forced.flag === false), JSON.stringify(forced));
    await page.evaluate(() => { try { DRMinigame.hide(); } catch (e) { /* */ } if (DRCargo.isOpen()) DRCargo.close(); DRSpots.cur = null; DRSpots.fishing = false; if (DR.mode !== 'sail') DR.setMode('sail'); });
    // F4: mảnh vụn nạo vét (toggleObjects; burst 30 chặn ở maxNumParticles 6)
    const deb = await page.evaluate(() => {
      const S = DR_HARVEST_UI.spotfx, b = DR.s.boat;
      const l = DRSpots.list.filter(s => ['TrinketParticles', 'WoodParticles', 'MetalScrapParticles'].includes((S.items[(s.d.items || [])[0]] || {}).p)).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0];
      return l && { id: l.id, x: l.x, z: l.z, p: S.items[l.d.items[0]].p };
    });
    await page.evaluate(s => { const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = 3; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x - 7, s.z, -Math.PI / 2); }, deb);
    await sleep(1500);
    const d1 = await page.evaluate(id => DRSpots._fx(id), deb.id);
    check('[' + tag + '] F4 ' + deb.p + ': 6 mảnh vụn mesh thật (maxNumParticles 6) khi kho ≥ 1', d1 && d1.prefab === deb.p && d1.debris === 6, JSON.stringify(d1));
    await shot(page, '8-spot-debris');
    await page.evaluate(s => { DR.s.spots[s.id].stock = 0.2; }, deb);
    await sleep(800);
    const d2 = await page.evaluate(id => DRSpots._fx(id), deb.id);
    check('[' + tag + '] F4 kho < 1: mảnh vụn tắt hẳn (HarvestableParticles.toggleObjects)', d2 && d2.debris === 0, JSON.stringify(d2));
    // F4: điểm cổ vật #33 (relic1) gọi DRParticles.spawn('RelicParticles', {pos, loop:true}), cạn thì stop()
    const rel = await page.evaluate(() => { const s = DRSpots.byId['33']; return { id: s.id, x: s.x, z: s.z, item: s.d.items[0] }; });
    await page.evaluate(s => { const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = 1; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x - 9, s.z, -Math.PI / 2); }, rel);
    await sleep(1200);
    const r1 = await page.evaluate(() => __fx.filter(x => x.name === 'RelicParticles'));
    const live = r1.filter(x => !x.stopped && Math.abs(x.o.pos[0] - rel.x) < 0.01);
    check('[' + tag + '] F4 cổ vật ' + rel.item + ': DRParticles.spawn("RelicParticles", {pos: [' + rel.x.toFixed(2) + ', 0, ' + rel.z.toFixed(2) + '], loop: true})',
      live.length === 1 && live[0].o.loop === true && Math.abs(live[0].o.pos[1]) < 1e-6 && Math.abs(live[0].o.pos[2] - rel.z) < 0.01, JSON.stringify(r1.map(x => ({ pos: x.o.pos, loop: x.o.loop, stopped: x.stopped }))));
    await page.evaluate(s => { DR.s.spots[s.id].stock = 0; }, rel);
    await sleep(800);
    const r2 = await page.evaluate(() => __fx.filter(x => x.name === 'RelicParticles').map(x => x.stopped));
    check('[' + tag + '] F4 cổ vật bị lấy hết (kho 0): stop() hệ hạt', r2.length >= 1 && r2[r2.length - 1] === true, JSON.stringify(r2));
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
    await page.waitForFunction(() => DRCargo.held(), null, { timeout: 8000 }).catch(() => {});
    const cg = await page.evaluate(() => ({ cargo: DRCargo.isOpen(), ph: DRMinigame.phase(), mode: DR.mode, held: !!DRCargo.held(), docked: DRCargo._debug().docked }));
    check('[' + tag + '] khoang đầy (' + filled + ' món): món vừa bắt vẫn trên con trỏ của khoang docked, panel "held"', cg.cargo && cg.held && cg.docked && cg.ph === 'held' && cg.mode === 'harvest', JSON.stringify(cg));
    await shot(page, '7-cargo-full');
    await page.keyboard.press('Escape');                                 // Harvester: không rời được khi còn cầm đồ
    await sleep(300);
    check('[' + tag + '] khoang đầy: Esc không rời / không đóng khi còn cầm món vừa bắt', await page.evaluate(() => DRCargo.isOpen() && DR.mode === 'harvest'));
    await page.keyboard.down('KeyZ'); await sleep(950); await page.keyboard.up('KeyZ'); await sleep(200);
    check('[' + tag + '] khoang đầy: giữ Z vứt món vừa bắt (BEING_HARVESTED luôn vứt được), panel chờ lại', await page.evaluate(() => !DRCargo.held() && DRMinigame.phase() === 'prestart'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 4000 }).catch(() => {});
  }

  check('[' + tag + '] không có pageerror / console error / HTTP >= 400', errs.length === 0, errs.slice(0, 5).join(' | '));
  await page.close();
}

// ---- vòng 2 trên trang mới: F8 thiếu dụng cụ / cần câu trên ô hỏng, F14 popup tan biến, F16 Line, F6 tiếng gần điểm
async function round2(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ' vòng 2]');
  const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, tag + '-' + n + '.png') });
  const { page, errs } = await boot(browser, base, W, H);
  const u = U(W, H);
  const vis = sel => page.evaluate(s => { const n = DRMinigame.node(s); return !!n && getComputedStyle(n.el).display !== 'none' && n.el.style.visibility !== 'hidden'; }, sel);
  const txt = sel => page.evaluate(s => DRMinigame.node(s).el.textContent, sel);
  // F8a: điểm nạo vét khi chưa có cần cẩu: vẫn vào được (chỉ giờ + kho quyết định), panel báo thiếu dụng cụ
  const ds = await page.evaluate(() => { const b = DR.s.boat; const l = DRSpots.list.filter(s => s.dredge).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0]; return { id: l.id, x: l.x, z: l.z, r: l.r }; });
  await page.evaluate(s => { DR_DEBUG.setTime(0.4); const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = 3; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, ds);
  await page.waitForFunction(() => DR.view.nearSpot, null, { timeout: 8000 }).catch(() => {});
  const ns = await page.evaluate(() => DR.view.nearSpot);
  check('[' + tag + '] F8 điểm nạo vét, chưa có cần cẩu: VALID (status ok), dụng cụ "missing"', ns && ns.status === 'ok' && ns.equipment === 'missing' && ns.kind === 'dredge', JSON.stringify(ns));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest' && DRMinigame.isShown(), null, { timeout: 5000 }).catch(() => {});
  await sleep(700);
  const p8 = { mode: await page.evaluate(() => DR.mode), ind: await vis('InvalidEquipmentIndicator'), cant: await vis('CannotStartText'), why: await txt('CannotStartText'), frame: await vis('Frame'),
    shiny: await page.evaluate(() => DRMinigame.node('HarvestableTypeTag').el.classList.contains('hv-shiny')) };
  check('[' + tag + '] F8 vào được: InvalidEquipmentIndicator + thẻ loại lấp lánh + "Bạn không có đúng dụng cụ cho điểm này.", không có nút bắt đầu', p8.mode === 'harvest' && p8.ind && p8.shiny && p8.cant && p8.why === 'Bạn không có đúng dụng cụ cho điểm này.' && !p8.frame, JSON.stringify(p8));
  await shot(page, 'r2-no-equipment');
  await page.keyboard.press('Space');
  await sleep(300);
  check('[' + tag + '] F8 thiếu dụng cụ: Space không bắt đầu được', await page.evaluate(() => DRMinigame.phase() === 'prestart' && !DRMinigame.isOpen()));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 4000 }).catch(() => {});
  // F8b: cần câu duy nhất (rod1) nằm trên ô hỏng: vào được, BrokenMinigameOverlay, minigame chạy KHÔNG có mục tiêu, nút ẩn
  const ms = await page.evaluate(() => { const g = DR.grid('INVENTORY'); const rod = g.items.find(i => i.id === 'rod1'); for (const c of rod.cells) g.damage.push(c.slice()); DRBoat.refresh(); return DR_DEBUG.spotNear(['mackerel'], 0, 0); });
  await page.evaluate(s => { const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = 5; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, ms);
  await page.waitForFunction(() => DR.view.nearSpot && DR.view.nearSpot.equipment === 'broken', null, { timeout: 8000 }).catch(() => {});
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest' && DRMinigame.isShown(), null, { timeout: 5000 }).catch(() => {});
  await sleep(700);
  const b1 = { overlay: await vis('BrokenMinigameOverlay'), frame: await vis('Frame'), start: await txt('Frame/ControlPromptEntry/Text') };
  check('[' + tag + '] F8 cần câu trên ô hỏng: BrokenMinigameOverlay hiện, vẫn có nút "Bắt đầu câu"', b1.overlay && b1.frame && b1.start === 'Bắt đầu câu', JSON.stringify(b1));
  await shot(page, 'r2-broken-prestart');
  const a0 = await page.evaluate(() => __aud.length);
  await page.keyboard.press('Space');                                       // bắt đầu: lần đầu loại này -> popup hướng dẫn tan biến hiện ra
  await sleep(90);
  const tut = await page.evaluate(() => { const n = DRMinigame.node('TutorialPopup'); return { filter: n.el.style.filter, f: n.dissolveF, on: getComputedStyle(n.el).display !== 'none' }; });
  check('[' + tag + '] F14 TutorialPopup tan biến (UITransitionEffect Dissolve 0,35 s qua #hv-dissolve), không còn "pop"', tut.on && /hv-dissolve/.test(tut.filter) && tut.f > 0 && tut.f < 1, JSON.stringify(tut));
  await shot(page, 'r2-tutorial-dissolve');
  await sleep(600);
  const tut2 = await page.evaluate(() => { const n = DRMinigame.node('TutorialPopup'); return { filter: n.el.style.filter, f: n.dissolveF, anim: getComputedStyle(n.el).animationName }; });
  check('[' + tag + '] F14 sau 0,35 s popup hiện đủ', tut2.f === 0 && tut2.filter === '' && tut2.anim === 'none', JSON.stringify(tut2));
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await sleep(250); }
  await sleep(700);
  const b2 = await page.evaluate(a => { const d = DRMinigame._debug(); return { phase: d.phase, targets: d.targets.length, progress: d.progress, snd: __aud.slice(a).map(x => x.k).filter(k => /minigame\.(hit|miss)/.test(k)) }; }, a0);
  const b2v = { frame: await vis('Frame'), cant: await vis('CannotStartText'), why: await txt('CannotStartText') };
  check('[' + tag + '] F8 ô hỏng: minigame chạy không mục tiêu, bấm không có tác dụng, tiến độ thụ động vẫn lên, chữ "Dụng cụ hỏng. Hiệu quả câu giảm."',
    b2.phase === 'running' && b2.targets === 0 && b2.snd.length === 0 && b2.progress > 0 && !b2v.frame && b2v.cant && b2v.why === 'Dụng cụ hỏng. Hiệu quả câu giảm.', JSON.stringify(Object.assign(b2, b2v)));
  // F16: Line (Image 2 đơn vị, xoay 90°) hiện: ngang 186,5 đơn vị, tâm (141,96; tâm Container + 140,5)
  const ln = await page.evaluate(() => { const n = DRMinigame.node('Line'); const r = n.el.getBoundingClientRect(); return { d: getComputedStyle(n.el).display, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }; });
  check('[' + tag + '] F16 Line hiện như cảnh gốc: dài 186,5 đơn vị, tâm x 141,96, y = giữa − 140,5', ln.d !== 'none' && Math.abs(ln.w - 186.51 * u) < 1.5 && Math.abs(ln.cx - 141.96 * u) < 1.5 && Math.abs(ln.cy - (H / 2 - 140.5 * u)) < 1.5, JSON.stringify(ln));
  await shot(page, 'r2-broken-running');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 4000 }).catch(() => {});
  // F6: tiếng gần điểm: HarvestPOIHandler.sfxClips[FISH_SMALL] = Harvest Spot - Small Fish 1/2/3; chờ hết clip + Random.Range(1; 2,5)
  await page.evaluate(() => { DR.grid('INVENTORY').damage.length = 0; DRBoat.refresh(); });
  await page.evaluate(s => DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0), ms);
  const p0 = await page.evaluate(() => __aud.length);
  await sleep(16000);
  const prox = await page.evaluate(a => __aud.slice(a).filter(x => /^Harvest Spot - /.test(x.k)).map(x => ({ k: x.k, t: x.t })), p0);
  const list = await page.evaluate(() => DR_HARVEST_UI.spotfx.poiSfx.FISH_SMALL);
  const names = list.map(c => c.n), dur = Object.fromEntries(list.map(c => [c.n, c.dur]));
  const gaps = prox.slice(1).map((x, i) => (x.t - prox[i].t) / 1000 - dur[prox[i].k]);
  check('[' + tag + '] F6 tiếng gần điểm cá nhỏ: clip lấy từ ' + names.join(' / ') + ', nghỉ 1-2,5 s sau mỗi clip',
    names.join('|') === 'Harvest Spot - Small Fish 1|Harvest Spot - Small Fish 2|Harvest Spot - Small Fish 3' && prox.length >= 3 && prox.every(x => names.includes(x.k)) && gaps.every(g => g > 0.9 && g < 2.75),
    prox.length + ' lần: ' + prox.map(x => x.k.slice(-1)).join(',') + '; nghỉ ' + gaps.map(g => g.toFixed(2)).join(', ') + ' s');
  check('[' + tag + '] vòng 2: không có pageerror / console error / HTTP >= 400', errs.length === 0, errs.slice(0, 5).join(' | '));
  await page.close();
}

// ---- ảnh ghép cạnh ảnh chụp bản gốc (1920x1080): chờ bắt đầu (gog_16) và đang câu con lắc (gog_04)
async function sideBySide(browser, base) {
  const W = 1920, H = 1080, tag = 'sbs';
  out.push('\n[ảnh ghép 1920x1080]');
  const { page, errs } = await boot(browser, base, W, H);
  // gog_04: 10:07 sáng, điểm SHALLOW kho High, minigame con lắc -> điểm gần nhất có món đầu ban ngày là cá con lắc mà Infused Winch câu được
  const sp = await page.evaluate(() => {
    DR_DEBUG.give('tir-rod1'); DRBoat.refresh(); DR_DEBUG.setTime(0.42);
    const ok = DR_ITEMS['tir-rod1'].harvestableTypes;
    const s = DRSpots.nearest(s => { const it = DR_ITEMS[(s.d.items || [])[0]]; return !!it && it.day && it.harvestMinigameType === 'FISHING_PENDULUM' && ok.includes(it.harvestableType) && !it.requiresAdvancedEquipment; }, 0, 0);
    return s && { id: s.id, x: s.x, z: s.z, r: s.r, first: s.d.items[0], maxStock: s.d.maxStock };
  });
  await page.evaluate(s => { const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = s.maxStock; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, sp);
  await page.waitForFunction(() => DR.view.nearSpot && DR.view.nearSpot.status === 'ok', null, { timeout: 8000 }).catch(() => {});
  await sleep(1500);
  await page.keyboard.press('Space');
  await sleep(2800);
  const sb = await page.evaluate(() => ({ mode: DR.mode, phase: DRMinigame.phase(), type: (DRMinigame._debug() || {}).type }));
  check('[' + tag + '] điểm ' + sp.id + ' (' + sp.first + '): vào màn thu hoạch, panel chờ, minigame con lắc', sb.mode === 'harvest' && sb.phase === 'prestart' && sb.type === 'FISHING_PENDULUM', JSON.stringify(sb));
  const webPre = path.join(SHOTS, 'sbs-web-prestart.png'), webRun = path.join(SHOTS, 'sbs-web-running.png');
  await page.screenshot({ path: webPre });
  await page.keyboard.press('Space');
  await sleep(1600);
  await page.screenshot({ path: webRun });
  const SBS = 'D:/dredge-ref/notes/sbs.py', REAL = 'D:/dredge-ref/shots-real/';
  for (const [w, r, n] of [[webPre, 'gog_16.jpg', 'sbs-prestart-gog16.png'], [webRun, 'gog_04.jpg', 'sbs-running-gog04.png']]) {
    let ok = false;
    // python của máy là shim .bat (pyenv-win): phải chạy qua shell
    const q = s => '"' + s + '"';
    try { cp.execSync(['python', '-I', q(SBS), q(w), q(REAL + r), q(path.join(SHOTS, n))].join(' '), { stdio: 'ignore' }); ok = fs.existsSync(path.join(SHOTS, n)); } catch (e) { ok = false; }
    check('[' + tag + '] ảnh ghép ' + n + ' (web | ' + r + ')', ok, path.join(SHOTS, n));
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
  const srv = await serve(), base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    if (!process.env.ONLY_R2) {
      await run(browser, base, 1280, 720);
      await run(browser, base, 844, 390);
    }
    await round2(browser, base, 1280, 720);
    await round2(browser, base, 844, 390);
    await sideBySide(browser, base);
    // ---- 9. tần số khung: bản này vs bản trước (FISH_BASE hoặc git HEAD), đo xen kẽ ----
    const head = baseFiles();
    if (Object.keys(head).length) {
      const now = [], was = [];
      for (let i = 0; i < 2; i++) { now.push(await perf(browser, null, 'now')); was.push(await perf(browser, head, 'head')); }
      const n = Math.min(...now.map(x => x.cpu)), w = Math.min(...was.map(x => x.cpu));
      out.push('\n[hiệu năng 1280x720, CPU/khung ms, nhỏ nhất]  bản này ' + n.toFixed(2) + ' (' + now.map(x => x.all.map(v => v.toFixed(2)).join('/')).join(' ') + ')  bản trước ' + w.toFixed(2) + ' (' + was.map(x => x.all.map(v => v.toFixed(2)).join('/')).join(' ') + ')');
      check('khung hình không tệ hơn 15% so với bản trước (cùng cảnh, cùng máy)', n <= w * 1.15 + 0.15, 'tỉ lệ ' + (n / w).toFixed(2));
    } else out.push('\n[hiệu năng] bỏ qua: không có FISH_BASE và không có git HEAD');
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
