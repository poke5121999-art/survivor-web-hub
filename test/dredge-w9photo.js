/*
 * DREDGE — Biển Mù, w9photo (WORLD-GAPS.md §6 W9): chế độ chụp ảnh của năng lực Máy ảnh.
 * Nguồn: CameraAbility.cs, PlayerContainer.prefab (CameraAbilityCam, CameraAbility: pan 5, roll 15 ±45, zoom 10 [20,60], floor 1,5, radius 25),
 *   Game.unity PhotoModeCanvas, DredgeControlBindings.cs:565-632 (W/A/S/D, Q/E, ←/→, ↑/↓, T, F).
 * Kiểm: chọn camera, chuột phải -> khung ngắm hiện, HUD ẩn, timeScale ~ 0, camera đi từ chỗ camera thuyền; W/Q/E/roll/zoom/chuột đúng tốc độ gốc và
 *   bị kẹp (radius 25, sàn 1,5, roll ±45, FOV 20..60); T bật/tắt khung; F tải PNG đúng cỡ canvas; chuột phải / Esc thoát: HUD về, timeScale 1,
 *   Esc không mở tạm dừng; trộn về camera thuyền 2 s.
 * Chạy: node test/dredge-w9photo.js     Ảnh: SHOTS (mặc định %TEMP%/dredge-w9photo)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w9photo'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto((process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port) + '/games/dredge/index.html?fresh=1');
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
  await sleep(3000);

  const st = () => page.evaluate(() => DRPhoto.state());
  const hold = async (key, ms) => { const t0 = Date.now(); await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); return (Date.now() - t0) / 1000; };
  const hudVisible = () => page.evaluate(() => {
    const kids = Array.from(document.body.children).filter(e => !['SCRIPT', 'STYLE', 'LINK'].includes(e.tagName) && e.id !== 'dr-canvas' && e.id !== 'dr-photo');
    const vis = kids.filter(e => getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
    return { n: kids.length, vis: vis.map(e => e.id || e.className), ab: getComputedStyle(document.getElementById('dr-ab')).visibility };
  });
  const boatD = () => page.evaluate(() => { const b = DRBoat.root.position, p = DRPhoto.state().p; return Math.hypot(p[0] - b.x, p[1] - b.y, p[2] - b.z); });
  const boatXZ = () => page.evaluate(() => DR.s.boat.x + ',' + DR.s.boat.z);

  // --- chọn camera: có trong vòng chọn, đã mở khoá từ đầu
  const sel = await page.evaluate(() => { DRAbilities.select('camera'); return { sel: DRAbilities.selected(), wedges: DRAbilities.wedges().includes('camera'), cls: DRAbilities.ability('camera').constructor.name }; });
  ok(sel.sel === 'camera' && sel.wedges && sel.cls === 'Photo', 'camera chọn được và đã gắn Photo (không còn Pending): ' + JSON.stringify(sel));
  const hud0 = await hudVisible();
  ok(hud0.vis.length > 0 && hud0.ab !== 'hidden', 'trước khi chụp HUD đang hiện: ' + hud0.vis.join(','));
  const cam0 = await page.evaluate(() => { const c = DRCamera.cam; return { p: c.position.toArray(), f: c.getWorldDirection(new THREE.Vector3()).toArray(), fov: c.fov }; });
  await page.screenshot({ path: path.join(OUT, 'before-1280x720.png') });

  // --- chuột phải: vào chế độ chụp
  await page.mouse.click(640, 360, { button: 'right' });
  await sleep(500);
  let s = await st();
  ok(s.active, 'chuột phải vào chế độ chụp: ' + JSON.stringify(s));
  ok(s.timeScale < 0.01, 'Time.timeScale = 0 (DR.timeScale ~ 0): ' + s.timeScale);
  const dist0 = Math.hypot(s.p[0] - cam0.p[0], s.p[1] - cam0.p[1], s.p[2] - cam0.p[2]);
  ok(dist0 < 0.5 && s.fov === 40 && s.dutch === 0, 'm_InheritPosition: bắt đầu tại camera thuyền (cách ' + dist0.toFixed(3) + ' m), FOV 40, Dutch 0');
  const dirOk = await page.evaluate(() => DRCamera.cam.getWorldDirection(new THREE.Vector3()).toArray());
  ok(dirOk[0] * cam0.f[0] + dirOk[1] * cam0.f[1] + dirOk[2] * cam0.f[2] > 0.995, 'hướng nhìn ban đầu = hướng camera thuyền: ' + dirOk.map(v => v.toFixed(3)));
  const ph = await page.evaluate(() => ({ vis: !document.getElementById('dr-photo').hidden, frame: getComputedStyle(document.querySelector('#dr-photo .ph-frame')).opacity,
    corners: document.querySelectorAll('#dr-photo .ph-c').length, lines: document.querySelectorAll('#dr-photo .ph-l').length }));
  ok(ph.vis && ph.frame === '1' && ph.corners === 4 && ph.lines === 4, 'PhotoModeCanvas hiện: 4 góc + 4 đường chia ba: ' + JSON.stringify(ph));
  const hud1 = await hudVisible();
  ok(hud1.vis.length === 0 && hud1.ab === 'hidden', 'HUD ẩn hết (ToggleGameCanvasShow false): còn hiện ' + hud1.vis.join(','));
  const keysTxt = await page.evaluate(() => Array.from(document.querySelectorAll('#dr-photo .ph-lab')).map(e => e.textContent));
  ok(['Chụp ảnh', 'Khung ngắm', 'Tiến / Lùi', 'Trái / Phải', 'Lên / Xuống', 'Xoay máy', 'Thu phóng', 'Thoát'].every(t => keysTxt.includes(t)), 'gợi ý phím tiếng Việt: ' + keysTxt.join(' | '));
  const lay = await page.evaluate(() => {
    const q = c => document.querySelector('#dr-photo ' + c).getBoundingClientRect(), c0 = q('.ph-c0'), c1 = q('.ph-c1'), c2 = q('.ph-c2'), c3 = q('.ph-c3'), v = q('.ph-v1');
    return { c0: [c0.left, c0.top, c0.width], c1: [c1.right, c1.top], c2: [c2.right, c2.bottom], c3: [c3.left, c3.bottom], v: v.left + v.width / 2, W: innerWidth, H: innerHeight };
  });
  ok(Math.abs(lay.c0[2] - 120) < 1 && Math.abs(lay.c0[0] - 6.67) < 1, 'góc 180/1080 chiều cao (120 px ở 720) lề 10/1080: ' + JSON.stringify(lay.c0));
  ok(Math.abs(lay.c1[0] - (lay.W - 6.67)) < 1.5 && Math.abs(lay.c1[1] - 6.67) < 1.5 && Math.abs(lay.c2[0] - (lay.W - 6.67)) < 1.5 && Math.abs(lay.c2[1] - (lay.H - 6.67)) < 1.5
    && Math.abs(lay.c3[0] - 6.67) < 1.5 && Math.abs(lay.c3[1] - (lay.H - 6.67)) < 1.5, 'bốn góc bám bốn mép: ' + JSON.stringify(lay));
  ok(Math.abs(lay.v - lay.W / 3) < 1.5, 'đường dọc ở 1/3: ' + lay.v);
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'photo-1280x720.png') });
  const water0 = await page.evaluate(() => DR.s.time);
  await sleep(600);
  ok(Math.abs((await page.evaluate(() => DR.s.time)) - water0) < 1e-4, 'giờ trong game đứng yên khi chụp');

  // --- tiến W: 5 m/s theo hướng nhìn
  const p0 = (await st()).p;
  const t1 = await hold('w', 1000);
  s = await st();
  const mv = Math.hypot(s.p[0] - p0[0], s.p[1] - p0[1], s.p[2] - p0[2]);
  const along = ((s.p[0] - p0[0]) * cam0.f[0] + (s.p[1] - p0[1]) * cam0.f[1] + (s.p[2] - p0[2]) * cam0.f[2]) / mv;
  ok(mv > 4.2 * t1 && mv < 5.3 * t1 && along > 0.99, 'W giữ ' + t1.toFixed(2) + ' s đi ' + mv.toFixed(2) + ' m (5 m/s), thẳng theo hướng nhìn (cos ' + along.toFixed(3) + ')');
  const t2 = await hold('d', 800);
  const p1 = s.p; s = await st();
  const sd = Math.hypot(s.p[0] - p1[0], s.p[1] - p1[1], s.p[2] - p1[2]);
  ok(sd > 4.2 * t2 && sd < 5.3 * t2 && Math.abs(s.p[1] - p1[1]) < 0.3, 'D sang phải ' + sd.toFixed(2) + ' m trong ' + t2.toFixed(2) + ' s (nghiêng camera thuyền ~ nhìn xuống nên lệch Y nhỏ)');
  // Q lên / E xuống theo trục Y thế giới
  const y0 = s.p[1];
  const t3 = await hold('q', 600);
  s = await st();
  ok(s.p[1] - y0 > 4.2 * t3 && s.p[1] - y0 < 5.3 * t3, 'Q lên ' + (s.p[1] - y0).toFixed(2) + ' m trong ' + t3.toFixed(2) + ' s');
  await hold('e', 9000);
  s = await st();
  ok(Math.abs(s.p[1] - 1.5) < 1e-6, 'E xuống dừng ở floorHeight 1,5: ' + s.p[1]);
  // xoay máy: 15 °/s, kẹp ±45
  const t4 = await hold('ArrowRight', 1000);
  s = await st();
  ok(s.dutch < -13 * t4 && s.dutch > -15.9 * t4, '→ xoay máy ' + s.dutch.toFixed(2) + '° trong ' + t4.toFixed(2) + ' s (Dutch −= 15/s)');
  await hold('ArrowRight', 4500); s = await st();
  ok(s.dutch === -45, 'xoay kẹp −45°: ' + s.dutch);
  await sleep(200);
  await page.screenshot({ path: path.join(OUT, 'photo-roll-1280x720.png') });
  await hold('ArrowLeft', 7000); s = await st();
  ok(s.dutch === 45, 'xoay kẹp +45°: ' + s.dutch);
  await hold('ArrowRight', 3000);                     // về 0 (3 s · 15 = 45)
  // thu phóng: 10 °/s, FOV 20..60
  const t5 = await hold('ArrowUp', 1000);
  s = await st();
  ok(s.fov < 40 - 8.5 * t5 && s.fov > 40 - 10.1 * t5, '↑ thu vào: FOV ' + s.fov.toFixed(2) + ' sau ' + t5.toFixed(2) + ' s (−10/s)');
  await hold('ArrowUp', 3500); s = await st();
  ok(s.fov === 20, 'FOV kẹp 20: ' + s.fov);
  await hold('ArrowDown', 6000); s = await st();
  ok(s.fov === 60, 'FOV kẹp 60: ' + s.fov);
  ok((await page.evaluate(() => DRCamera.cam.fov)) === 60, 'camera three nhận FOV 60');
  await hold('ArrowUp', 2000);                         // 40°

  // --- chuột nhìn quanh: 0,05 · 100 / 60 °/px
  await page.mouse.move(400, 300);
  const yaw0 = (await st()).yaw;
  await page.mouse.move(520, 300);
  s = await st();
  const dyaw = ((yaw0 - s.yaw) % 360 + 360) % 360;
  ok(Math.abs(dyaw - 120 * 0.05 * 100 / 60) < 0.3, 'chuột phải 120 px quay phải ' + dyaw.toFixed(2) + '° (0,05·100/60 °/px = 10°)');
  const look = (dx, dy) => page.evaluate(([dx, dy]) => window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: dx, movementY: dy })), [dx, dy]);
  const pitch1 = (await st()).pitch;
  await look(0, -240);
  s = await st();
  ok(Math.abs(s.pitch - pitch1 - 240 * 0.05 * 100 / 60) < 0.3, 'chuột lên 240 px: ngước lên ' + (s.pitch - pitch1).toFixed(2) + '° (20°)');
  await look(0, -9000);
  s = await st();
  ok(s.pitch >= 89 && s.pitch <= 89.9 + 1e-6, 'chuột lên mãi: dọc kẹp tại +90° (POV ±90): ' + s.pitch.toFixed(2));
  await page.screenshot({ path: path.join(OUT, 'photo-look-up-1280x720.png') });
  await look(0, 18000);
  s = await st();
  ok(s.pitch <= -89 && s.pitch >= -89.9 - 1e-6, 'chuột xuống mãi: dọc kẹp tại −90°: ' + s.pitch.toFixed(2));
  await look(0, s.pitch * 60 / 5);                    // về nhìn ngang
  s = await st();
  ok(Math.abs(s.pitch) < 0.5, 'về nhìn ngang: ' + s.pitch.toFixed(2));
  await look(100000, 0); s = await st();
  ok(s.yaw >= -180.0001 && s.yaw <= 180.0001, 'ngang quay vòng (m_Wrap −180..180): ' + s.yaw.toFixed(2));

  // --- vòng kẹp 25 m: bay thẳng ra xa theo hướng nhìn
  await hold('w', 8000);
  const d1 = await boatD();
  ok(d1 <= 25.05, 'W lâu: kẹp trong confinementRadius 25 m quanh thuyền (sàn 1,5 m nâng nhẹ sau khi kẹp, như RestrictMovement): ' + d1.toFixed(3));
  ok(d1 > 20, 'W lâu: chạm biên vòng kẹp (' + d1.toFixed(2) + ' m)');
  ok((await st()).p[1] >= 1.5 - 1e-6, 'độ cao ≥ 1,5 sau khi bay: ' + (await st()).p[1].toFixed(2));

  // --- T bật/tắt khung
  await page.keyboard.press('t'); await sleep(300);
  const ov = await page.evaluate(() => ({ o: DRPhoto.state().overlay, op: getComputedStyle(document.querySelector('#dr-photo .ph-frame')).opacity }));
  ok(!ov.o && ov.op === '0', 'T tắt khung: ' + JSON.stringify(ov));
  await page.screenshot({ path: path.join(OUT, 'photo-frame-off-1280x720.png') });

  // --- F chụp: tải PNG (khung tắt: ảnh thuần)
  const png = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('f')]);
    const f = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(f);
    const b = fs.readFileSync(f);
    return { name: dl.suggestedFilename(), size: b.length, sig: b.slice(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20), f };
  };
  const cw = await page.evaluate(() => [document.getElementById('dr-canvas').width, document.getElementById('dr-canvas').height]);
  const a1 = await png();
  ok(a1.sig === '89504e470d0a1a0a' && /^bien-mu-\d{8}-\d{6}\.png$/.test(a1.name) && a1.w === cw[0] && a1.h === cw[1] && a1.size > 20000, 'F: tải PNG ' + a1.name + ' ' + a1.w + 'x' + a1.h + ' (canvas ' + cw + '), ' + a1.size + ' byte');
  await page.keyboard.press('t'); await sleep(300);
  await sleep(1100);
  const a2 = await png();
  ok(a2.size > 20000 && a2.w === cw[0] && a2.name !== a1.name, 'F với khung bật: PNG ' + a2.name + ' ' + a2.size + ' byte (khung nằm trong ảnh)');
  ok((await st()).shots === 2, 'đếm ảnh: ' + (await st()).shots);
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'photo-after-shot-1280x720.png') });

  // --- 844x390
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'photo-844x390.png') });
  const bar = await page.evaluate(() => { const r = document.querySelector('#dr-photo .ph-bar').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth }; });
  ok(bar.l >= 0 && bar.r <= bar.W + 0.5 && bar.b <= bar.H && bar.sw <= bar.W, 'thanh phím vừa 844x390, không tràn ngang: ' + JSON.stringify(bar));
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(800);

  // --- thoát bằng chuột phải: HUD về, timeScale 1, trộn 2 s về camera thuyền
  await page.mouse.click(640, 360, { button: 'right' });
  await sleep(300);
  s = await st();
  ok(!s.active && s.blending, 'chuột phải thoát, camera đang trộn về: ' + JSON.stringify(s));
  ok(s.timeScale > 0.99, 'timeScale về 1: ' + s.timeScale);
  const hud2 = await hudVisible();
  ok(hud2.vis.length > 0 && hud2.ab !== 'hidden', 'HUD hiện lại: ' + hud2.vis.join(','));
  ok(await page.evaluate(() => document.getElementById('dr-photo').hidden), 'lớp chụp ảnh ẩn');
  await page.screenshot({ path: path.join(OUT, 'after-exit-blend-1280x720.png') });
  const t0 = Date.now();
  await page.waitForFunction(() => !DRPhoto.state().blending, null, { timeout: 6000 });
  const dt = (Date.now() - t0) / 1000 + 0.3;
  ok(dt > 1.2 && dt < 2.6, 'trộn về camera thuyền ~2 s (m_DefaultBlend): ' + dt.toFixed(2) + ' s');
  const back = await page.evaluate(() => ({ ov: DRCamera.override, p: DRCamera.cam.position.toArray(), b: DRBoat.root.position.toArray() }));
  ok(back.ov === null && Math.hypot(back.p[0] - back.b[0], back.p[2] - back.b[2]) < 30, 'camera thường chạy lại, quanh thuyền');

  // --- vào lại: FOV 40, Dutch 0 (ResetCamera); Esc thoát, không mở tạm dừng
  await page.mouse.click(640, 360, { button: 'right' }); await sleep(600);
  s = await st();
  const cy = await page.evaluate(() => DRCamera.cam.position.y);
  ok(s.active && s.fov === 40 && s.dutch === 0 && Math.abs(s.p[1] - cy) < 0.01, 'vào lại: FOV 40, Dutch 0 (ResetCamera), tại camera thuyền');
  await page.keyboard.press('Escape'); await sleep(400);
  s = await st();
  const paused = await page.evaluate(() => !document.getElementById('dr-pause').hidden);
  ok(!s.active && !paused && (await page.evaluate(() => DR.timeScale)) === 1, 'Esc thoát chụp ảnh, không mở tạm dừng: active=' + s.active + ' paused=' + paused);
  await sleep(2500);
  // phím lái chạy lại sau khi thoát
  const bx = await boatXZ();
  await hold('w', 1200);
  ok(bx !== await boatXZ(), 'W lại lái được thuyền sau khi thoát');
  // trong lúc chụp phím W không lái thuyền
  await page.keyboard.down('w'); await sleep(2500);       // thuyền đang chạy nhanh khi vào chế độ chụp
  await page.mouse.click(640, 360, { button: 'right' }); await page.keyboard.up('w'); await sleep(300);
  const bx2 = await boatXZ();
  await hold('w', 1000);
  const bx3 = await boatXZ(), mvd = Math.hypot(...bx2.split(',').map((v, i) => v - bx3.split(',')[i]));
  ok(mvd < 0.02, 'trong chế độ chụp W không lái thuyền (dời ' + mvd.toFixed(4) + ' m)');
  await hold('e', 400);
  ok(!(await page.evaluate(() => DRAbilities.radialOpen)), 'E trong chế độ chụp là xuống, không mở vòng chọn');
  await page.keyboard.press('Escape'); await sleep(300);

  // --- thoát bằng nút trên màn hình
  await page.mouse.click(640, 360, { button: 'right' }); await sleep(500);
  await page.evaluate(() => document.querySelector('#dr-photo .ph-chip.exit .ph-key').click()); await sleep(300);   // con trỏ đang khoá: nút chỉ bấm được khi không khoá (cảm ứng)
  ok(!(await st()).active, 'nút Thoát trên màn hình thoát chế độ chụp');

  ok(errors.length === 0, 'khong co loi trang/console/HTTP: ' + errors.slice(0, 3).join(' | '));
  console.log('w9photo ' + pass + ' pass, ' + fail + ' fail  ->  ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
