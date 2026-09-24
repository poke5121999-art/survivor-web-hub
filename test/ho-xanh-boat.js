/*
 * HỐ XANH — kiểm khúc lái cano (js/boat.js).
 *
 * Chạy:  node test/ho-xanh-boat.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-boat-shots) — mở ra xem bằng mắt.
 * Mặc định mở Chrome bằng GPU thật (ANGLE D3D11); SWIFTSHADER=1 để vẽ bằng phần mềm (chậm, chuyến ra ~2 phút).
 *
 * Kiểm ở 1280×720 và 844×390 (máy chạm):
 *  - lái ra bằng bàn phím: giữ W thì tốc độ > 0 và quãng còn lại giảm; A/D đổi hướng mũi và nghiêng thân;
 *  - tới nơi: Dave đi ra đuôi, nhảy (Diveready) xuống nước, sang loading rồi dive;
 *  - chuyến về: Dave leo lên (Respawn), lái về tới quán thì sang kitchen;
 *  - nút "Bỏ qua" ở cả hai chiều; nút Ga và kéo nửa trái ở máy chạm;
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
  check('tiêu đề có "ra Hố Xanh"', (await page.textContent('#scr-boat h2')).includes('ra Hố Xanh'), await page.textContent('#scr-boat h2'));
  check('nút "Bỏ qua" đúng chữ', (await page.textContent('#boat-skip')) === 'Bỏ qua');
  check('quãng đường tới Hố Xanh hiện trên thanh tiến độ', /^\d+ m$/.test(await page.textContent('.bt-dist')), await page.textContent('.bt-dist'));
  await until(() => HX.phases.boat.info().state === 'depart');
  await sleep(500);
  await shot('1-depart');
  await until(() => HX.phases.boat.info().state === 'drive');

  // ---- lái ra ----
  const d0 = (await B()).dist;
  let speed = 0, dist = d0;
  if (touch) {
    // giữ nút Ga
    await page.dispatchEvent('.bt-ga', 'pointerdown', { pointerId: 7, isPrimary: true, clientX: W - 50, clientY: H - 50 });
    await sleep(3000);
    I = await B(); speed = I.speed; dist = I.dist;
    check('máy chạm: giữ Ga thì cano chạy (tốc độ > 0,5 m/s, quãng còn lại giảm)', speed > 0.5 && dist < d0 - 3, speed.toFixed(2) + ' m/s, ' + d0.toFixed(0) + ' → ' + dist.toFixed(0) + ' m');
    // kéo nửa trái xuống = bẻ về phía người xem (yaw dương)
    await page.dispatchEvent('.bt-steer', 'pointerdown', { pointerId: 8, isPrimary: false, clientX: W * 0.2, clientY: H * 0.5 });
    await page.dispatchEvent('.bt-steer', 'pointermove', { pointerId: 8, isPrimary: false, clientX: W * 0.2, clientY: H * 0.5 + 80 });
    await sleep(900);
    I = await B();
    check('máy chạm: kéo nửa trái xuống thì mũi bẻ về phía camera', I.yaw > 0.1, 'yaw ' + I.yaw.toFixed(2));
    await page.dispatchEvent('.bt-steer', 'pointerup', { pointerId: 8, clientX: W * 0.2, clientY: H * 0.5 + 80 });
    await sleep(1500);
    await shot('2-mid-drive');
    await until(() => HX.phases.boat.info().state === 'arrive');
    await page.dispatchEvent('.bt-ga', 'pointerup', { pointerId: 7 });
  } else {
    await page.keyboard.down('KeyW');
    await sleep(3000);
    I = await B(); speed = I.speed; dist = I.dist;
    check('giữ W thì cano chạy (tốc độ > 0,5 m/s, quãng còn lại giảm)', speed > 0.5 && dist < d0 - 3, speed.toFixed(2) + ' m/s, ' + d0.toFixed(0) + ' → ' + dist.toFixed(0) + ' m');
    check('HUD tốc độ khác 0', +(await page.textContent('.bt-speed b')) > 0, await page.textContent('.bt-speed b') + ' km/h');
    await page.keyboard.down('KeyA');
    await sleep(900);
    I = await B();
    check('A bẻ mũi về phía camera và thân nghiêng vào vòng cua', I.yaw > 0.1 && I.roll > 0.01, 'yaw ' + I.yaw.toFixed(2) + ', roll ' + I.roll.toFixed(3));
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyD');
    await sleep(1500);
    const I2 = await B();
    check('D bẻ mũi ra xa', I2.yaw < I.yaw - 0.1, 'yaw ' + I.yaw.toFixed(2) + ' → ' + I2.yaw.toFixed(2));
    await page.keyboard.up('KeyD');
    await sleep(1500);
    I = await B();
    check('chạy hết ga gần tốc độ gốc của cano (Boat_Exit001, ~10 m/s)', I.speed > 0.8 * I.vmax, I.speed.toFixed(2) + ' / ' + I.vmax.toFixed(2));
    check('không tự lái khi người chơi đã cầm lái', !I.auto);
    await shot('2-mid-drive');
    const t0 = Date.now();
    await until(() => HX.phases.boat.info().state === 'arrive');
    await page.keyboard.up('KeyW');
    I = await B();
    check('tới gần chỗ lặn thì tự phanh (arrive)', I.state === 'arrive' && I.dist < 30, I.dist.toFixed(1) + ' m, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s nữa');
  }

  // ---- nhảy xuống nước ----
  await until(() => HX.phases.boat.info().dave && HX.phases.boat.info().dave.anim === 'Diveready');
  I = await B();
  check('dừng hẳn rồi Dave mới chạy anim nhảy gốc (Diveready)', I.state === 'dive' && Math.abs(I.speed) < 0.5 && I.dist < 3, I.dist.toFixed(2) + ' m, ' + I.speed.toFixed(2) + ' m/s');
  await sleep(2600);
  await shot('3-diveready');
  await until(() => HX.phases.boat.info().dave && HX.phases.boat.info().dave.jumping);
  await sleep(180);
  await shot('4-jump');
  await until(() => !HX.phases.boat.info().active || !HX.phases.boat.info().dave.visible);
  await sleep(250);
  await shot('5-splash');
  await phase('dive');
  check('nhảy xong thì sang loading rồi vào lặn', JSON.stringify(await went()) === '["loading"]');

  // ---- chuyến về ----
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
  await until(() => HX.phases.boat.info().loaded);
  check('tiêu đề chuyến về có "về quán"', (await page.textContent('#scr-boat h2')).includes('về quán'), await page.textContent('#scr-boat h2'));
  I = await B();
  check('chuyến về mở bằng anim gốc Respawn (Dave leo lên thuyền)', I.state === 'respawn' && I.dave.anim === 'Respawn', I.state + ' / ' + I.dave.anim);
  await sleep(1200);
  await shot('6-respawn');
  await until(() => HX.phases.boat.info().state === 'drive');
  const h0 = Date.now();
  if (touch) await page.dispatchEvent('.bt-ga', 'pointerdown', { pointerId: 9, clientX: W - 50, clientY: H - 50 });
  else await page.keyboard.down('ArrowUp');
  await sleep(4000);
  await shot('7-home-drive');
  await phase('kitchen');
  check('chuyến về kết thúc bằng G.go("kitchen")', JSON.stringify(await went()) === '["kitchen"]');
  if (!touch) await page.keyboard.up('ArrowUp');   // máy chạm: HUD cano đã dỡ cùng nút Ga
  check('về tới quán thì sang kitchen', true, ((Date.now() - h0) / 1000).toFixed(1) + ' s từ lúc nổ máy');

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
  const during = [], after = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
    // đo ở cùng một lúc mỗi chuyến: đã nổ máy, chạy được 1,5 s (mọi nhóm hạt đã vẽ ít nhất một lần)
    await until(() => HX.phases.boat.info().state === 'drive');
    await page.keyboard.down('KeyW');
    await sleep(1500);
    during.push(await mem());
    await page.keyboard.up('KeyW');
    await page.click('#boat-skip');
    await phase('kitchen');
    await sleep(200);
    after.push(await mem());
  }
  check('5 chuyến: geometry/texture lúc đang chạy không tăng', during.every(m => m === during[0]), during.join(' '));
  check('5 chuyến: rời pha thì trả hết về như cũ', after.every(m => m === after[0]), after.join(' '));

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
