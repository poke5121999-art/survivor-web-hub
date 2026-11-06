/*
 * DREDGE — Biển Mù: kiểm màn tiêu đề (V11) và phần mở đầu (V12) bằng chuột / phím thật.
 * Giá trị gốc: Title.unity VCam FOV 40, Composer ScreenX 0,4 / ScreenY 0,535 (TitleScreenView.baseGameCameraOffset);
 *   bố cục thanh menu đo từ clips/frames/title/ObBBFGMem5U_0.jpg (khung 960x540: thanh x 132..260, thanh đầu y 240, bước ~32).
 *   IntroCutscene: CutsceneProfile (ColorLookup LUT_0 + Vignette + FilmGrain), thẻ chương "Dredging the depths".
 * Chạy: node test/dredge-vtitle.js     Ảnh ra %TEMP%/dredge-vtitle/.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-vtitle');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0; const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ok  ' : '  FAIL ') + name + (detail ? '  - ' + detail : '')); }
const near = (name, got, want, tol) => check(name, Math.abs(got - want) <= tol, 'được ' + got.toFixed(4) + ', cần ' + want + ' ±' + tol);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

(async () => {
  const srv = await serve(), base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(), errors = watch(page);
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await sleep(1200);

  // ---- V11: màn tiêu đề ----
  const T = await page.evaluate(() => {
    const cam = DRCamera.cam, W = innerWidth, H = innerHeight;
    const v = new THREE.Vector3(...DRTitle.LOOK).project(cam);
    const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const logo = document.querySelector('#dr-title .logo').getBoundingClientRect();
    return { fov: cam.fov, sx: (v.x * 0.5 + 0.5), sy: (1 - (v.y * 0.5 + 0.5)), W, H, bars: ['btn-new', 'btn-settings', 'btn-credits', 'btn-hub'].map(r),
      cont: document.getElementById('btn-continue').hidden, logo: { x: logo.left, y: logo.top, w: logo.width }, mode: DR.mode,
      hubLast: document.querySelector('#dr-title .menu').lastElementChild.id, cx: cam.position.x, cz: cam.position.z };
  });
  check('chế độ tiêu đề', T.mode === 'title');
  near('FOV vCam tiêu đề', T.fov, 40, 0.01);
  near('chân hải đăng ở ScreenX 0,4', T.sx, 0.4, 0.01);
  near('chân hải đăng ở ScreenY 0,535', T.sy, 0.535, 0.01);
  near('camera x (Unity 21,09)', T.cx, 21.09, 0.01);
  near('camera z (Unity -14,57 -> three +14,57)', T.cz, 14.57, 0.01);
  check('thứ tự thanh: Ván mới, Cài đặt, Giới thiệu, về sảnh', T.bars.every((b, i) => i === 0 || b.y > T.bars[i - 1].y) && T.hubLast === 'btn-hub');
  check('thanh cùng bề rộng và cùng lề trái', T.bars.every(b => Math.abs(b.w - T.bars[0].w) < 1 && Math.abs(b.x - T.bars[0].x) < 1));
  near('lề trái thanh = 132/960 chiều rộng', T.bars[0].x / T.W, 132 / 960, 0.01);
  near('thanh đầu cách đỉnh = 240/540 chiều cao', T.bars[0].y / T.H, 240 / 540, 0.012);
  near('bước giữa hai thanh ~32/540', (T.bars[1].y - T.bars[0].y) / T.H, 32 / 540, 0.006);
  near('bề rộng thanh = 128/960', T.bars[0].w / T.W, 128 / 960, 0.012);
  near('logo lệch trái: lề trái 50/960', T.logo.x / T.W, 50 / 960, 0.012);
  near('logo rộng 290/960', T.logo.w / T.W, 290 / 960, 0.012);
  check('Tiếp tục ẩn khi chưa có save', T.cont === true);
  await page.screenshot({ path: path.join(SHOTS, 'title.png') });
  // W7: Cài đặt mở cửa sổ cài đặt (js/menus.js), Giới thiệu mở credits cuộn chữ; Esc đóng
  await page.click('#btn-settings');
  check('Cài đặt mở cửa sổ', await page.evaluate(() => DRMenus.settingsOpen && !DRMenus.credits.playing));
  const m0 = await page.evaluate(() => DRAudio.isMuted());
  await page.click('.dm-row[data-key="_mute"] .dm-seg button[data-v="' + (m0 ? 0 : 1) + '"]');
  check('nút tắt tiếng đổi trạng thái', (await page.evaluate(() => DRAudio.isMuted())) !== m0);
  await page.click('.dm-row[data-key="_mute"] .dm-seg button[data-v="' + (m0 ? 1 : 0) + '"]');
  await page.keyboard.press('Escape');
  check('Esc đóng cửa sổ cài đặt', await page.evaluate(() => !DRMenus.settingsOpen));
  await page.click('#btn-credits');
  check('Giới thiệu mở credits', await page.evaluate(() => DRMenus.credits.playing && !document.getElementById('dr-credits').hidden && !DRMenus.settingsOpen));
  await page.evaluate(() => DRMenus.credits.stop());
  check('Dừng credits ẩn lớp phủ', await page.evaluate(() => (document.getElementById('dr-credits') || { hidden: true }).hidden));
  check('nút về sảnh trỏ ra hub', (await page.getAttribute('#btn-hub', 'href')) === '../../index.html');

  // ---- V12: phần mở đầu ----
  await page.click('#btn-new');
  await page.waitForFunction(() => window.DRIntro && DRIntro.stage === 'illustrated', null, { timeout: 8000 });
  await sleep(300);
  check('thẻ chương hiện lúc đầu', await page.evaluate(() => document.querySelector('.in-card').classList.contains('on')));
  check('thẻ chương có chữ', (await page.textContent('.in-card')).trim().length > 5);
  await page.screenshot({ path: path.join(SHOTS, 'intro-card-start.png') });
  await page.waitForFunction(() => DRIntro.time() > 3.5, null, { timeout: 60000 });
  check('thẻ chương tắt giữa chừng', await page.evaluate(() => !document.querySelector('.in-card').classList.contains('on')));
  await page.screenshot({ path: path.join(SHOTS, 'intro-sun.png') });
  // giữ Space 2 s (DredgePlayerActionHold 2f) để sang bước máy quay 3D
  await page.keyboard.down('Space');
  await page.waitForFunction(() => DRIntro.stage === "cinematic", null, { timeout: 60000 });
  await page.keyboard.up('Space');
  const cine = async () => page.evaluate(() => { const c = DRCamera.cam, f = new THREE.Vector3(); c.getWorldDirection(f);
    return { t: DRIntro.time(), p: [c.position.x, c.position.y, c.position.z], fy: f.y, fov: c.fov, mode: DR.mode }; });
  await sleep(200); const c0 = await cine(); await page.screenshot({ path: path.join(SHOTS, 'cine-0.png') });
  await sleep(2000); const c1 = await cine(); await page.screenshot({ path: path.join(SHOTS, 'cine-2.png') });
  await sleep(2600); const c2 = await cine().catch(() => null); await page.screenshot({ path: path.join(SHOTS, 'cine-5.png') });
  check('bàn giao 3D: FOV 40', Math.abs(c0.fov - 40) < 0.01, 'fov ' + c0.fov);
  check('bàn giao 3D: camera đổi vị trí', [c1, c2].some(c => c && Math.hypot(c.p[0] - c0.p[0], c.p[1] - c0.p[1], c.p[2] - c0.p[2]) > 0.2), JSON.stringify([c0.p, c1.p, c2 && c2.p]));
  check('bàn giao 3D: camera chúc xuống dần', c1.fy < c0.fy || (c2 && c2.fy < c0.fy), 'fy ' + c0.fy.toFixed(3) + ' -> ' + c1.fy.toFixed(3) + (c2 ? ' -> ' + c2.fy.toFixed(3) : ''));
  await page.waitForFunction(() => !DRIntro.playing, null, { timeout: 60000 });

  check('không lỗi trang / console / HTTP >= 400', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(out.join('\n') + '\n' + pass + ' pass, ' + fail + ' fail  (ảnh: ' + SHOTS + ')');
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error(e); process.exit(2); });
