/*
 * DREDGE — Biển Mù, vboat (V03 màu thuyền, V15 khung camera lái): kiểm màu pixel của vật liệu thân thuyền, cửa sổ phát sáng và khung camera.
 * Chạy: node test/dredge-vboat.js     Ảnh: %TEMP%/dredge-vboat/
 * Số đối chiếu (đọc trực tiếp từ dữ liệu gốc):
 *   LitBoat_Shader (DXBC): albedo * (mask.r*Roof + mask.g*Hull + mask.b*Base_Color) trong không gian tuyến tính; Base_Color = trắng ⇒ phần kênh xanh dương
 *   (cabin, boong) giữ nguyên màu ảnh Boat1_Texture (hàng 4 = 165,174,165); Roof/Hull = PlayerColorCustomizer index 0 (0,51; 0,37; 0,31).
 *   Camera: FreeLook Player VCam Y = 0,2 ⇒ nội suy Bottom (cao 2, bán kính 10) → Middle (9,5; 15,5) với k = 0,4 ⇒ cao 5, bán kính 12,2; FOV 40.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-vboat'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, m + ' (' + a + ' vs ' + b + ' +-' + t + ')');

(async () => {
  const srv = await new Promise(res => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b);
      });
    }).listen(0, () => res(s));
  });
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto('http://localhost:' + srv.address().port + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  for (let i = 0; i < 80; i++) {            // đi hết hội thoại tới khi giao diện bến hiện
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen();
      return { ready: !!d && d.phase === 'ui' && !open, st: open ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
  await page.evaluate(() => DR.setMode('sail')); await sleep(500);
  await page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await page.evaluate(() => DR_DEBUG.setTime(0.5));
  await sleep(4000);

  // --- V03: pixel của bảng màu thân thuyền (map của vật liệu 16x16 đã nạp vào boat.js)
  const px = await page.evaluate(() => {
    let mat = null;
    DRBoat.model.traverse(o => { if (o.isMesh && o.material.map && o.material.map.image && o.material.map.image.width === 16 && !mat) mat = o.material; });
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.drawImage(mat.map.image, 0, 0);
    const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { roof: at(2, 0), hull: at(2, 14), cabin: at(0, 4), cabin2: at(0, 2) };
  });
  console.log('pixels', JSON.stringify(px));
  ok(px.roof[0] > 1.35 * px.roof[1] && px.roof[0] > 1.5 * px.roof[2], 'nóc cabin phải đỏ sẫm (r > 1,35 g): ' + px.roof);
  ok(px.hull[0] > 1.35 * px.hull[1] && px.hull[0] > 1.5 * px.hull[2], 'dải thân thuyền phải đỏ sẫm: ' + px.hull);
  ok(px.cabin.every((v, i) => Math.abs(v - [165, 174, 165][i]) <= 2), 'tường cabin (Base_Color trắng) giữ màu ảnh gốc 165,174,165: ' + px.cabin);
  ok(px.cabin2.every((v, i) => Math.abs(v - [156, 154, 148][i]) <= 2), 'tường cabin hàng 2 giữ 156,154,148: ' + px.cabin2);

  // --- cửa sổ phát sáng khi bật đèn
  const glowInfo = () => page.evaluate(() => {
    const r = [];
    DRBoat.model.traverse(o => { if (o.isMesh && o.material.userData && o.material.userData.glow) r.push({ e: o.material.userData.glow.value, map: !!o.material.defines && 'DR_EMIS' in o.material.defines }); });
    return r;
  });
  await page.evaluate(() => DRBoat.setLights(false));
  const off = await glowInfo();
  await page.evaluate(() => DRBoat.setLights(true));
  const on = await glowInfo();
  ok(off.length >= 1 && off.every(m => m.map), 'có vật liệu phát sáng với emissiveMap thật: ' + JSON.stringify(off));
  ok(off.every(m => m.e === 0) && on.every(m => m.e > 0), 'phát sáng tắt = 0, bật > 0: ' + JSON.stringify(off) + ' / ' + JSON.stringify(on));

  // --- V15: khung camera lái ở Y = 0,2
  await page.evaluate(() => DRBoat.setLights(false));
  await sleep(2500);
  const cam = await page.evaluate(() => {
    const c = DRCamera.cam, b = DRBoat.root.position, dx = c.position.x - b.x, dz = c.position.z - b.z;
    return { fov: c.fov, y: DRCamera.y, h: c.position.y - b.y, r: Math.hypot(dx, dz) };
  });
  console.log('camera', JSON.stringify(cam));
  near(cam.fov, 40, 0.01, 'FOV doc 40 (Unity FOV la truc doc)');
  near(cam.y, 0.2, 0.01, 'truc Y mac dinh 0,2');
  near(cam.h, 5, 0.6, 'do cao camera tren thuyen (2 + 7,5 * 0,4 = 5)');
  near(cam.r, 12.2, 0.8, 'ban kinh camera (10 + 5,5 * 0,4 = 12,2)');
  // kích thước thuyền trên màn 1280x720: clip gốc (khung t=164) đo cột buồm → mép nước ≈ 170-180 px
  const size = await page.evaluate(() => {
    const c = DRCamera.cam, T = THREE, b = DRBoat.root.position;
    const p = v => (1 - v.clone().project(c).y) / 2 * 720;
    const top = p(new T.Vector3(b.x, b.y + 2.6, b.z)), bot = p(new T.Vector3(b.x, b.y - 0.1, b.z));
    return { px: Math.abs(bot - top) };
  });
  console.log('boat px', JSON.stringify(size));
  ok(size.px > 140 && size.px < 230, 'thuyen cao ~170-180 px (cot buom -> mep nuoc) tren man 720p: ' + size.px.toFixed(0));
  const shot = await page.screenshot({ path: path.join(OUT, 'sail-day.png') });
  // màu cabin trên màn lúc trưa: clip gốc t=164 (đo trung vị vùng tường cabin) = (242,235,208); dung sai 35 mỗi kênh vì clip có hậu kỳ riêng
  const cab = await page.evaluate(async (b64) => {
    const c = DRCamera.cam, T = THREE, b = DRBoat.root.position, yaw = DRBoat.root.rotation.y;
    const pts = [];
    for (let dy = 1.0; dy <= 1.5; dy += 0.25) pts.push(new T.Vector3(0, dy, 0.05));
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
    const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0, 1280, 720);
    const out = [];
    for (const p of pts) {
      const w = p.clone().applyAxisAngle(new T.Vector3(0, 1, 0), yaw).add(b), q = w.project(c);
      const x = Math.round((q.x + 1) / 2 * 1280), y = Math.round((1 - q.y) / 2 * 720);
      const d = g.getImageData(x - 3, y - 3, 7, 7).data;
      for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    }
    out.sort((a, b2) => (b2[0] + b2[1] + b2[2]) - (a[0] + a[1] + a[2]));
    const top = out.slice(0, Math.ceil(out.length * 0.3)), m = i => top.map(v => v[i]).sort((a, b2) => a - b2)[top.length >> 1];
    return [m(0), m(1), m(2)];
  }, shot.toString('base64'));
  console.log('cabin', JSON.stringify(cab));
  [242, 235, 208].forEach((v, i) => near(cab[i], v, 35, 'mau cabin trua kenh ' + 'RGB'[i]));
  await page.evaluate(() => { DR_DEBUG.setTime(0.97); DRBoat.setLights(true); });
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'sail-night.png') });

  ok(errors.length === 0, 'khong co loi trang/console/HTTP: ' + errors.slice(0, 3).join(' | '));
  console.log('vboat ' + pass + ' pass, ' + fail + ' fail  ->  ' + OUT);
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
