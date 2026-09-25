/*
 * HỐ XANH — kiểm khúc cano tự chạy (js/boat.js).
 *
 * Chạy:  node test/ho-xanh-boat.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-boat-shots) — mở ra xem bằng mắt.
 * Mặc định mở Chrome bằng GPU thật (ANGLE D3D11); SWIFTSHADER=1 để vẽ bằng phần mềm (chậm, chuyến ra ~2 phút).
 *
 * Cano rời bến/cập bến tự chạy theo đúng khoá gốc Boat_Exit001/002 (không còn phím/nút lái nào). Kiểm ở
 * 1280×720 và 844×390 (máy chạm):
 *  - không đụng phím/chạm gì cả: tốc độ > 0, quãng còn lại tự giảm, vị trí ở nửa chặng rời bến khớp đúng khoá gốc;
 *  - bấm phím trong lúc chạy không đổi gì (không còn nhận input lái);
 *  - chuyến ra chạy buổi chiều, chuyến về chạy buổi tối (Lobby_Evening);
 *  - tới nơi: Dave đi ra đuôi, chạy Diveready tại chỗ (clip gốc không có track vị trí), màn tối dần từ 60% clip, sang loading rồi dive;
 *  - chuyến về: Dave leo lên (Respawn), cano tự chạy về tới quán thì sang kitchen;
 *  - nút "Bỏ qua" ở cả hai chiều vẫn còn, không còn nút Ga/Phanh hay vùng kéo lái nào trong HUD;
 *  - 5 chuyến liền nhau không làm tăng số geometry/texture của renderer;
 *  - không lỗi trang, không lỗi console, không 404.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-boat-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail != null && detail !== '' ? '  — ' + detail : ''));
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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// Tư thế Unity của khoá rời bến (Boat_Exit001 nối Boat_Exit002) tại thời điểm t, tính lại trong trang từ đúng
// dữ liệu HX_BOAT_ASSETS mà boat.js dùng — để so khớp độc lập với departPose() bên trong boat.js.
function departPoseExpr() {
  return (t) => {
    const B = window.HX_BOAT_ASSETS, C = B.boat.anims;
    const EXIT1 = C.Boat_Exit001.tracks[''], EXIT2 = C.Boat_Exit002.tracks[''];
    const FPS = C.Boat_Idle001.fps;
    const SEGS = [EXIT1, EXIT2], SEG_LEN = [C.Boat_Exit001.length, C.Boat_Exit002.length];
    const SEG_ORIGIN = [[0, 0, 0], EXIT1.posOffset[EXIT1.posOffset.length - 1]];
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, k) { return a + (b - a) * k; }
    function sample(tr, tt) {
      const f = clamp(tt * FPS, 0, tr.length - 1), i = Math.floor(f), j = Math.min(tr.length - 1, i + 1), k = f - i;
      return [0, 1, 2].map(c => lerp(tr[i][c], tr[j][c], k));
    }
    let seg = 0, local = t;
    if (t > SEG_LEN[0]) { seg = 1; local = t - SEG_LEN[0]; }
    const raw = sample(SEGS[seg].posOffset, local), o = SEG_ORIGIN[seg];
    return [o[0] + raw[0], o[1] + raw[1], o[2] + raw[2]];
  };
}

async function run(browser, base, W, H, touch) {
  const tag = W + 'x' + H;
  console.log('\n== ' + tag + (touch ? ' (chạm)' : '') + ' ==');
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: !!touch, isMobile: !!touch });
  const errors = watch(page);
  const B = () => page.evaluate(() => HX.phases.boat.info());
  const phase = p => page.waitForFunction(p => window.HX_DEBUG && HX_DEBUG.info().phase === p, p, { timeout: 120000 });
  const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 120000, polling: 50 });
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });

  await page.goto(base + '/games/ho-xanh/index.html?fresh=1&route=A01,B01,C03&phase=boat&dir=out');
  await until(() => window.HX && HX.phases.boat.info().loaded);
  // ghi lại mọi lần boat.js gọi G.go (loading có khi chỉ kéo dài một khung khi glb đã nạp sẵn)
  await page.evaluate(() => { window.__went = []; const go = HX.game.go; HX.game.go = function (n, a) { window.__went.push(n); return go(n, a); }; });
  const went = () => page.evaluate(() => window.__went.splice(0));
  let I = await B();
  check('vào pha boat chiều ra, tải xong cảnh', I.active && I.dir === 'out' && I.loaded, I.state);
  check('chuyến ra chạy buổi chiều', I.time === 'day', I.time);
  check('tiêu đề có "ra Hố Xanh"', (await page.textContent('#scr-boat h2')).includes('ra Hố Xanh'), await page.textContent('#scr-boat h2'));
  check('nút "Bỏ qua" đúng chữ', (await page.textContent('#boat-skip')) === 'Bỏ qua');
  check('quãng đường tới Hố Xanh hiện trên thanh tiến độ', /^\d+ m$/.test(await page.textContent('.bt-dist')), await page.textContent('.bt-dist'));
  check('không còn nút Ga/Phanh hay vùng kéo lái trong HUD', (await page.$$('.bt-ga, .bt-brake, .bt-steer')).length === 0);

  // ---- rời bến (không đụng gì cả) ----
  await until(() => HX.phases.boat.info().state === 'depart');
  await shot('1-depart');
  // Boat_Exit001 đứng yên ~0,33 s đầu (máy rung tại chỗ, đúng khoá gốc) rồi mới lao đi: đợi qua đoạn đó.
  await until(() => HX.phases.boat.info().speed > 0.2, null, 5000);
  I = await B();
  check('rời bến tự chạy: tốc độ > 0 dù không có phím/chạm nào', I.speed > 0.2, I.speed.toFixed(2) + ' m/s');

  // giữa chừng rời bến (t ≈ 50% Boat_Exit001+002): so vị trí với đúng khoá gốc
  await until(() => { const i = HX.phases.boat.info(); return i.state === 'depart' && i.clipT >= i.departLen * 0.5; });
  I = await B();
  const expectedU = await page.evaluate(departPoseExpr(), I.clipT);
  const expX = I.departOrigin.x + expectedU[0], expZ = I.departOrigin.z - expectedU[2];
  const dErr = Math.hypot(I.x - expX, I.z - expZ);
  check('ở 50% khoá rời bến, vị trí khớp đúng khoá gốc Boat_Exit001/002 (sai số < 0,1 m)',
    dErr < 0.1, 'lệch ' + dErr.toFixed(4) + ' m (đo ' + I.x.toFixed(2) + ',' + I.z.toFixed(2) + ' / khoá ' + expX.toFixed(2) + ',' + expZ.toFixed(2) + ')');

  // bấm phím trong lúc chạy: không còn tác dụng gì (không nhận input lái nữa)
  const before = await B();
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
  await sleep(400);
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyA');
  const after = await B();
  check('bấm W/A lúc đang chạy không đổi tốc độ/hướng (không còn nhận phím lái)',
    Math.abs(after.speed - before.speed) < 3 && Math.abs(after.yaw - before.yaw) < 0.3,
    'tốc độ ' + before.speed.toFixed(2) + '→' + after.speed.toFixed(2) + ', yaw ' + before.yaw.toFixed(2) + '→' + after.yaw.toFixed(2));

  // ---- biển khơi (cruise) ----
  await until(() => HX.phases.boat.info().state === 'cruise');
  I = await B();
  const d0 = I.dist, t0 = Date.now();
  check('chạy biển khơi: vào state cruise, còn quãng dài', I.state === 'cruise' && I.dist > 30, I.dist.toFixed(0) + ' m');
  await sleep(2000);
  const I1 = await B();
  check('cruise: quãng còn lại tự giảm đều theo tốc độ, không cần giữ phím', I1.dist < d0 - 3, d0.toFixed(0) + ' → ' + I1.dist.toFixed(0) + ' m');
  await shot('2-cruise');

  // ---- tới nơi rồi cập bến ----
  await until(() => HX.phases.boat.info().state === 'arrive');
  I = await B();
  check('gần chỗ lặn thì tự cập bến (arrive)', I.state === 'arrive', 'còn ' + I.dist.toFixed(1) + ' m, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s từ lúc rời biển khơi');

  // ---- nhảy xuống nước ----
  await until(() => HX.phases.boat.info().dave && HX.phases.boat.info().dave.anim === 'Diveready');
  I = await B();
  check('dừng hẳn rồi Dave mới chạy anim nhảy gốc (Diveready)', I.state === 'dive' && Math.abs(I.speed) < 0.5 && I.dist < 3, I.dist.toFixed(2) + ' m, ' + I.speed.toFixed(2) + ' m/s');
  await sleep(2600);
  await shot('3-diveready');
  const x0 = (await B()).dave.x;
  await until(() => !HX.phases.boat.info().active || HX.phases.boat.info().fade > 0.5);
  I = await B();
  if (I.active) check('Diveready tại chỗ, không bay khỏi đuôi (x Dave giữ nguyên)', Math.abs(I.dave.x - x0) < 1e-6 && I.dave.visible, x0.toFixed(2) + ' → ' + I.dave.x.toFixed(2));
  await phase('dive');
  check('nhảy xong thì sang loading rồi vào lặn', JSON.stringify(await went()) === '["loading"]');

  // ---- chuyến về (cũng không đụng gì cả) ----
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
  await until(() => HX.phases.boat.info().loaded);
  check('tiêu đề chuyến về có "về quán"', (await page.textContent('#scr-boat h2')).includes('về quán'), await page.textContent('#scr-boat h2'));
  I = await B();
  check('chuyến về mở bằng anim gốc Respawn (Dave leo lên thuyền)', I.state === 'respawn' && I.dave.anim === 'Respawn', I.state + ' / ' + I.dave.anim);
  check('chuyến về chạy buổi tối', I.time === 'evening', I.time);
  await sleep(1200);
  await shot('4-respawn');
  await until(() => HX.phases.boat.info().state === 'cruise');
  I = await B();
  check('chuyến về cũng tự chạy tới state cruise mà không cần phím', I.speed > 0.2, I.speed.toFixed(2) + ' m/s');
  await shot('5-home-cruise');
  const h0 = Date.now();
  await phase('kitchen');
  check('chuyến về kết thúc bằng G.go("kitchen")', JSON.stringify(await went()) === '["kitchen"]');
  check('về tới quán thì sang kitchen mà không đụng phím nào', true, ((Date.now() - h0) / 1000).toFixed(1) + ' s trước khi vào kitchen');
  await shot('6-kitchen');

  // ---- Bỏ qua ----
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'out' }));
  await page.click('#boat-skip');
  await phase('dive');
  check('"Bỏ qua" chiều ra vào thẳng loading', JSON.stringify(await went()) === '["loading"]');
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
  await page.click('#boat-skip');
  await phase('kitchen');
  check('"Bỏ qua" chiều về vào thẳng kitchen', JSON.stringify(await went()) === '["kitchen"]');
  check('rời pha thì dỡ HUD cano', (await page.$$('#scr-boat .bt-hud')).length === 0);

  // ---- 5 chuyến liền nhau không rò bộ nhớ GPU ----
  const mem = () => page.evaluate(() => { const m = HX.game.gfx.renderer.info.memory; return m.geometries + '/' + m.textures; });
  const during = [], after5 = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
    // đo ở cùng một lúc mỗi chuyến: đang chạy biển khơi (mọi nhóm hạt đã vẽ ít nhất một lần)
    await until(() => HX.phases.boat.info().state === 'cruise');
    await sleep(500);
    during.push(await mem());
    await page.click('#boat-skip');
    await phase('kitchen');
    await sleep(200);
    after5.push(await mem());
  }
  check('5 chuyến: geometry/texture lúc đang chạy không tăng', during.every(m => m === during[0]), during.join(' '));
  check('5 chuyến: rời pha thì trả hết về như cũ', after5.every(m => m === after5[0]), after5.join(' '));

  check('không lỗi trang, không lỗi console, không 404', errors.length === 0, errors.slice(0, 6).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const args = process.env.SWIFTSHADER ? ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  const browser = await chromium.launch({ args });
  // trang đầu của trình duyệt có lúc mất WebGL context (xem tools/README-boat.md): mở một trang nháp trước
  const warm = await browser.newPage(); await warm.goto('about:blank');
  try {
    await run(browser, base, 1280, 720, false);
    await run(browser, base, 844, 390, true);
  } catch (e) {
    fail++;
    console.log('  ✘ lỗi khi chạy: ' + (e && e.stack || e));
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
