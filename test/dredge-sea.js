/*
 * DREDGE — Biển Mù: kiểm mặt biển, vệt bọt, cảm giác thuyền và camera (luồng W1) trên trang thật (Playwright).
 *
 * Chạy:  node test/dredge-sea.js
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-sea.js   (chạy trên Pages)
 *        SEA_ROOT=<thư mục gốc khác> SEA_PERF_ONLY=1 node test/dredge-sea.js                (chỉ đo khung hình, để so trước/sau)
 * Ảnh chụp: %TEMP%/dredge-sea/ (nghỉ, hết ga thẳng, bẻ lái gắt, đêm, nhìn gần vệt bọt).
 * Số mong đợi lấy từ bản gốc (data/vfx.js do tools/vfx.py bóc từ PlayerContainer.prefab):
 *   BoatTrailParticles rateOverDistance 15 hạt/m, sống 0,5–1,5 s, cỡ 0,6–1,1 × SizeOverLifetime, đứng yên (< 0,8 m/s) không bọt;
 *   SteeringAnimator 60°; PlayerEngineAudio cao độ lerp(0,9; 1,3; clamp01(v·0,1)); BoatWakeAudio âm lượng clamp01(v·0,05);
 *   BuoyantObject chìm cân bằng 0,32 m; bản gốc không nghiêng khi rẽ (AddTorque chỉ trục y).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = process.env.SEA_ROOT ? path.resolve(process.env.SEA_ROOT) : path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-sea');
const PERF_ONLY = process.env.SEA_PERF_ONLY === '1';
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

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
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

async function perfRun(page) {
  // nước thoáng gần Greater Marrow, ban ngày, chạy hết ga 3 s rồi đo 3 lần
  await page.evaluate(() => DR_DEBUG.teleport(20, -30, 0.3));
  await page.keyboard.down('KeyW'); await sleep(3000);
  const ps = [];
  for (let i = 0; i < 3; i++) { await sleep(2000); ps.push(await page.evaluate(() => DR_DEBUG.perf())); }
  await page.keyboard.up('KeyW');
  const avg = k => ps.reduce((s, p) => s + p[k], 0) / ps.length;
  return { avgMs: avg('avgMs'), cpuMs: avg('cpuMs'), calls: avg('calls'), tris: avg('tris') };
}

async function run(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, name + '.png') });
  await page.goto(base + '/games/dredge/index.html?fresh=1&t=0.42');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 })
    .catch(e => { throw new Error('trang không sẵn sàng: ' + errors.slice(0, 4).join(' | ') + ' / ' + e.message); });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });

  if (PERF_ONLY) {
    const p = await perfRun(page);
    await shot('perf-' + (process.env.SEA_TAG || 'run'));
    out.push('  · perf: khung ' + p.avgMs.toFixed(2) + ' ms, CPU ' + p.cpuMs.toFixed(2) + ' ms, ' + p.calls.toFixed(0) + ' draw call, ' + (p.tris / 1000).toFixed(0) + 'k tam giác');
    check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 4).join(' | '));
    await page.close();
    return;
  }

  const ok = await page.evaluate(() => !!(window.DRVfx && window.DR_VFX && DRBoat.feel));
  check('có DRVfx + DR_VFX + DRBoat.feel', ok);
  if (!ok) { await page.close(); return; }

  // ---- nước thoáng: điểm cách đất > 40 m gần Greater Marrow ----
  const spot = await page.evaluate(() => {
    for (let r = 40; r < 400; r += 10) for (let a = 0; a < 6.28; a += 0.25) {
      const x = -3 + Math.cos(a) * r, z = Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 60) { DR_DEBUG.teleport(x, z, Math.atan2(-x, -z) + Math.PI); return { x, z, sdf: DRWorld.sdf(x, z) }; }
    }
    return null;
  });
  check('tìm được nước thoáng cách đất > 60 m', !!spot, spot && (spot.x.toFixed(0) + ',' + spot.z.toFixed(0)));

  // ---- 1. đứng yên: thân nổi đúng độ chìm, không bọt ----
  await sleep(3000);
  let f = await page.evaluate(() => {
    const b = DR.s.boat, fl = DRBoat.feel();
    // mực nước trung bình dưới 4 phao
    let h = 0; const st = fl.waveSteep;
    for (const n of ['BuoyancyEffector1', 'BuoyancyEffector2', 'BuoyancyEffector3', 'BuoyancyEffector4']) {
      const e = DR_BOAT.playerAttach[n].pos, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      h += DRWater.wave(b.x + e[0] * c + e[2] * s, b.z - e[0] * s + e[2] * c, st)[0] / 4;
    }
    return { fl, h, vfx: DRVfx.stats(), sink: DRBoat.SINK, props: DRWater.props() };
  });
  const sinkNow = f.h - f.fl.y;
  check('đứng yên: gốc thuyền thấp hơn mặt sóng 0,32 m (±0,08)', Math.abs(sinkNow - 0.32) < 0.08, 'chìm ' + sinkNow.toFixed(3) + ' m, ' + f.fl.submerged + '/4 phao chìm');
  check('đứng yên: chúi/nghiêng nhỏ (< 3°)', Math.abs(f.fl.pitch) < 0.052 && Math.abs(f.fl.roll) < 0.052,
    'chúi ' + (f.fl.pitch * 57.3).toFixed(2) + '°, nghiêng ' + (f.fl.roll * 57.3).toFixed(2) + '°');
  check('đứng yên: không có hạt bọt (rateOverDistance, đứng yên = 0 hạt)', f.vfx.alive === 0, f.vfx.alive + ' hạt');
  // TheMarrowsWaterPropertyModifier ở Unity (48,9; 0; −6,4) ⇒ three.js (48,9; 6,4), full 100 m, partial 250 m, _Depth 1 → 1,3
  {
    const bp = await page.evaluate(() => [DR.s.boat.x, DR.s.boat.z]);
    const d = Math.hypot(bp[0] - 48.9, bp[1] - 6.4);
    const kWant = d > 250 ? 0 : d < 100 ? 1 : 1 - (d - 100) / 150;
    check('WaterController: The Marrows modifier, k = 1 − (d − 100)/150, _Depth = lerp(1; 1,3; k)',
      f.props.modifier === 'TheMarrowsWaterPropertyModifier' && Math.abs(f.props.k - kWant) < 0.02 && Math.abs(f.props.waterDepth - (1 + 0.3 * kWant)) < 0.01,
      f.props.modifier + ' d=' + d.toFixed(0) + ' m, k=' + f.props.k.toFixed(3) + ' (mong ' + kWant.toFixed(3) + '), _Depth=' + f.props.waterDepth.toFixed(3));
  }
  const a0 = await page.evaluate(() => DRBoat.feel().audio);
  check('tiếng máy đứng yên: cao độ 0,9, âm lượng 0,1 (minPitch/minVolume)', a0 && Math.abs(a0.enginePitch - 0.9) < 0.02 && Math.abs(a0.engineVol - 0.1) < 0.02,
    a0 && ('cao độ ' + a0.enginePitch.toFixed(3) + ', âm lượng ' + a0.engineVol.toFixed(3)));
  await shot('1-rest');

  // ---- 2. hết ga thẳng 5 s ----
  const e0 = await page.evaluate(() => ({ emitted: DRVfx.stats().emitted, x: DR.s.boat.x, z: DR.s.boat.z }));
  await page.keyboard.down('KeyW');
  await sleep(5000);
  const S = await page.evaluate(() => ({ vfx: DRVfx.stats(), fl: DRBoat.feel(), sp: DRBoat.speed(), b: { x: DR.s.boat.x, z: DR.s.boat.z } }));
  const distRun = Math.hypot(S.b.x - e0.x, S.b.z - e0.z);
  const rate = (S.vfx.emitted - e0.emitted) / distRun;
  check('hết ga: tốc độ > 2 m/s', S.sp > 2, S.sp.toFixed(2) + ' m/s');
  check('vệt bọt: phát ≈ 15 hạt/m đi được (13–17)', rate > 13 && rate < 17, rate.toFixed(2) + ' hạt/m trên ' + distRun.toFixed(1) + ' m');
  check('vệt bọt: đang có ≥ 30 hạt khi chạy', S.vfx.alive >= 30 && S.vfx.visible, S.vfx.alive + ' hạt');
  check('vệt bọt: hạt lớn nhất ≤ 1,1 m (startSize max × SizeOverLifetime ≤ 1)', S.vfx.maxSize > 0.3 && S.vfx.maxSize <= 1.1001, S.vfx.maxSize.toFixed(3) + ' m');
  // InheritVelocity 1,5 × vận tốc + toả 2 m/s ⇒ bọt bị đẩy ra trước và hai bên mũi rồi mới tụt lại (sóng mũi), không phải vệt dài
  check('vệt bọt: sóng mũi — hạt trước tâm thuyền nhiều hơn sau, toả ngang > 1,2 m', S.vfx.ahead > S.vfx.behind && S.vfx.maxSide > 1.2,
    'sau ' + S.vfx.maxBack.toFixed(2) + ' m, ngang ' + S.vfx.maxSide.toFixed(2) + ' m, trước mũi ' + S.vfx.ahead + ' / sau ' + S.vfx.behind);
  check('vệt bọt: chỏm nổi trên mặt nước (đỉnh hạt > −0,1 m)', S.vfx.maxTop > -0.1, 'đỉnh ' + S.vfx.maxTop.toFixed(2) + ' m');
  const a1 = S.fl.audio, te = Math.min(1, S.fl.speed3 * 0.1);
  check('tiếng máy theo tốc độ: cao độ = lerp(0,9; 1,3; clamp01(v·0,1))', Math.abs(a1.enginePitch - (0.9 + 0.4 * te)) < 0.03 && a1.enginePitch > 0.95,
    'v ' + S.fl.speed3.toFixed(2) + ' → cao độ ' + a1.enginePitch.toFixed(3) + ' (mong ' + (0.9 + 0.4 * te).toFixed(3) + ')');
  check('tiếng vệt nước: âm lượng = clamp01(v·0,05)', Math.abs(a1.wakeVol - Math.min(1, S.fl.speed3 * 0.05)) < 0.03 && a1.wakeVol > 0.08, a1.wakeVol.toFixed(3));
  check('chân vịt quay theo ga (lerpedMoveValY → 1)', S.fl.lerpThr > 0.95, S.fl.lerpThr.toFixed(3));
  await shot('2-full-speed');
  // nhìn gần vệt: hạ camera xuống quỹ đạo thấp
  await page.evaluate(() => { DRCamera.orbit(150, -0.2); });
  await sleep(700);
  await shot('2b-wake-close');
  await page.evaluate(() => { DRCamera.snap(); });

  // ---- 3. bẻ lái gắt khi chạy ----
  await page.keyboard.down('KeyD');
  let maxRoll = 0, maxPitch = 0, steer = 0;
  for (let i = 0; i < 15; i++) {
    await sleep(200);
    const q = await page.evaluate(() => DRBoat.feel());
    maxRoll = Math.max(maxRoll, Math.abs(q.roll)); maxPitch = Math.max(maxPitch, Math.abs(q.pitch)); steer = q.steer;
  }
  check('bánh lái lệch 60° khi bẻ hết lái (SteeringAnimator.rudderMaxTurnDegrees)', Math.abs(steer - Math.PI / 3) < 0.02, (steer * 57.2958).toFixed(1) + '°');
  check('rẽ gắt: không nghiêng giả (bản gốc AddTorque chỉ trục y) — nghiêng < 4°', maxRoll < 0.07, 'nghiêng max ' + (maxRoll * 57.3).toFixed(2) + '°, chúi max ' + (maxPitch * 57.3).toFixed(2) + '°');
  const T3 = await page.evaluate(() => DRVfx.stats());
  check('rẽ gắt: vẫn có vệt bọt', T3.alive >= 20, T3.alive + ' hạt');
  await shot('3-hard-turn');
  await page.keyboard.up('KeyD');

  // ---- 4. nhả ga: bọt tắt dần theo tốc độ ----
  await page.keyboard.up('KeyW');
  const hi = (await page.evaluate(() => DRVfx.stats())).alive;
  let lo = null, tSlow = 0;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    const q = await page.evaluate(() => ({ sp: DRBoat.speed(), n: DRVfx.stats().alive }));
    if (q.sp < 0.6) { tSlow += 0.25; if (tSlow >= 2) { lo = q; break; } }
  }
  check('chậm dưới 0,8 m/s: hết hạt bọt sau ≤ 2 s (LifetimeByEmitterSpeed)', lo && lo.n === 0, 'đang chạy ' + hi + ' hạt → chậm ' + (lo ? lo.n + ' hạt ở ' + lo.sp.toFixed(2) + ' m/s' : 'chưa chậm'));

  // ---- 5. camera: kéo chuột rồi để yên ⇒ tự về sau lái (chỉ trục X) ----
  await page.mouse.move(640, 360);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) { await page.mouse.move(640 + (i + 1) * 20, 360 - (i + 1) * 4); await sleep(16); }
  await page.mouse.up();
  const c0 = await page.evaluate(() => ({ x: DRCamera.x, y: DRCamera.y }));
  check('kéo chuột phải 200 px: camera xoay (X đổi > 5°), kéo lên: trục Y giảm (đảo trục)', Math.abs(c0.x) > 5 && c0.y < 0.2,
    'X ' + c0.x.toFixed(1) + '°, Y ' + c0.y.toFixed(3));
  await sleep(1500);
  const c1 = await page.evaluate(() => DRCamera.x);
  await sleep(3000);
  const c2 = await page.evaluate(() => ({ x: DRCamera.x, y: DRCamera.y }));
  check('chưa đủ 2 s chờ: chưa tự về', Math.abs(c1 - c0.x) < 0.5, c0.x.toFixed(1) + ' → ' + c1.toFixed(1) + '°');
  // Mathf.SmoothDamp(thời gian 2 s) từ đứng yên: x(t) = x0·(1 + t)·e^(−t) ⇒ sau ≈ 2,5 s còn ≈ 29 %
  const r2 = Math.abs(c2.x / c0.x);
  check('chờ 2 s rồi SmoothDamp 2 s: sau ~2,5 s còn 15–40 % góc lệch, Y giữ nguyên', r2 > 0.15 && r2 < 0.4 && Math.abs(c2.y - c0.y) < 1e-6,
    'X ' + c0.x.toFixed(1) + ' → ' + c2.x.toFixed(2) + '° (' + (r2 * 100).toFixed(0) + ' %), Y ' + c2.y.toFixed(3));
  await sleep(4000);
  const c3 = await page.evaluate(() => DRCamera.x);
  check('thêm 4 s: X về sau lái (|X| < 2°)', Math.abs(c3) < 2, c3.toFixed(2) + '°');

  // ---- 6. đêm ----
  await page.evaluate(() => { DR_DEBUG.setTime(0.92); });
  await page.keyboard.down('KeyW'); await sleep(3500);
  const N = await page.evaluate(() => ({ vfx: DRVfx.stats(), night: DRSky.env.night }));
  check('đêm: vệt bọt vẫn chạy', N.vfx.alive >= 20, N.vfx.alive + ' hạt, night ' + N.night.toFixed(2));
  await shot('4-night');
  await page.keyboard.up('KeyW');

  // ---- 7. hiệu năng ----
  await page.evaluate(() => DR_DEBUG.setTime(0.42));
  const p = await perfRun(page);
  out.push('  · perf: khung ' + p.avgMs.toFixed(2) + ' ms, CPU ' + p.cpuMs.toFixed(2) + ' ms, ' + p.calls.toFixed(0) + ' draw call, ' + (p.tris / 1000).toFixed(0) + 'k tam giác');

  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 4).join(' | '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    await run(browser, base);
  } catch (e) {
    fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e));
  }
  await browser.close();
  if (srv) srv.close();
  console.log('DREDGE sea — ' + base + (process.env.SEA_ROOT ? ' (gốc ' + ROOT + ')' : ''));
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
