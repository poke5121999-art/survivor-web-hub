/*
 * DREDGE — Biển Mù: kiểm mặt nước (mịn ở mọi góc camera), bọt bờ, độ sáng đêm/hoàng hôn (luồng r2water) trên trang thật.
 *
 * Chạy:  node test/dredge-water.js
 *        DR_ROOT=D:/dredge-wt/_base3 BASELINE=1 node test/dredge-water.js   (bản gốc của vòng: chỉ đo, in số để so)
 * Ảnh: %TEMP%/dredge-r2water/ (<camera>-<giờ>.png 1920×1080, phone-*.png 844×390, sbs-*.png ghép với shots-real).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = process.env.DR_ROOT ? path.resolve(process.env.DR_ROOT) : path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), process.env.BASELINE === '1' ? 'dredge-r2water-base' : 'dredge-r2water');
const BASELINE = process.env.BASELINE === '1';
const REAL = 'D:/dredge-ref/shots-real';
const PY = 'C:/Users/tamph/.pyenv/pyenv-win/versions/3.8.10/python.exe'; // python có Pillow cho sbs.py
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (BASELINE) { out.push('  · ' + name + (detail ? '  — ' + detail : '')); return; }
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const file = path.join(ROOT, u);
      fs.readFile(file, (e, b) => {
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

const TIMES = { day: 0.45, dusk: 0.78, night: 0.92 };
const DUSK_VIEW = [75, -45, 1.85, 0.74];     // như test/dredge-env.js: đèn biển trái, phao sáng giữa, mặt trời phải (gog_01: mặt trời chạm chân trời ⇒ t ≈ 0,74)
const NIGHT_VIEW = [-162, 1290, 0, 0.92];    // Pale Reach ban đêm có tuyết (gog_20)

async function boot(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1&t=0.45');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  // bỏ đoạn mở đầu như người chơi: đợi 2 s rồi giữ Space 2 s (DredgePlayerActionHold), lặp cho từng chặng
  for (let i = 0; i < 4 && await page.evaluate(() => !!(window.DRIntro && DRIntro.playing)); i++) {
    await sleep(2300);
    await page.keyboard.down('Space'); await sleep(2400); await page.keyboard.up('Space');
    await sleep(600);
  }
  // hội thoại cập bến đầu tiên (Harbourmaster): đi hết, chọn dòng đầu
  for (let i = 0; i < 80 && await page.evaluate(() => !!(window.DRDialogue && DRDialogue.isOpen())); i++) {
    await page.evaluate(() => { const st = DRDialogue.state(); if (st && st.options) DRDialogue.choose(st.options.find(o => o.available !== false).index); else DRDialogue.next(); });
    await sleep(120);
  }
  await page.evaluate(() => DRSky.weather.pin('Fine'));
}
const OPEN = () => {
  for (let r = 40; r < 400; r += 10) for (let a = 0; a < 6.28; a += 0.25) {
    const x = -3 + Math.cos(a) * r, z = Math.sin(a) * r;
    if (DRWorld.sdf(x, z) > 60) return { x, z };
  }
  return null;
};
async function toSail(page) {
  await page.evaluate(() => { if (window.DRAbilities && DRAbilities.spyglassActive) DRAbilities.back(); if (DR.mode !== 'sail') DR.setMode('sail'); });
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });
  await sleep(700);
}
async function teleportOpen(page) {
  return page.evaluate(OPEN => {
    const p = (new Function('return ' + OPEN))()();
    DR_DEBUG.teleport(p.x, p.z, Math.atan2(-p.x, -p.z) + Math.PI);
    return p;
  }, OPEN.toString());
}
const CAMS = {
  // camera bám thuyền mặc định (trục Y 0,2), nước thoáng sâu ~20 m, mũi hướng về Greater Marrow
  async chase(page) { await toSail(page); return teleportOpen(page); },
  // camera thu hoạch: tới điểm câu gần Greater Marrow rồi bấm Space như người chơi (Harvest VCam Top High, 20 m, FOV 40)
  async harvest(page) {
    await toSail(page);
    const sp = await page.evaluate(() => {
      const s = DRSpots.nearest(q => !q.dredge && (q.d.items || []).length, 20, -30);
      DR_DEBUG.teleport(s.x + 1, s.z + 1, 0.6);
      return { id: s.id, x: s.x, z: s.z };
    });
    await sleep(700);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => DR.mode === 'harvest', null, { timeout: 5000 }).catch(() => {});
    await sleep(2600); // blend CinemachineBrain 2 s
    return Object.assign(sp, { mode: await page.evaluate(() => DR.mode) });
  },
  // camera bến (ván mới cập Greater Marrow sau đoạn mở đầu)
  async dock(page) {
    await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 5000 }).catch(() => {});
    return page.evaluate(() => ({ mode: DR.mode, dock: DR.s.dock, view: !!DRCamera.dockView, intro: !!(window.DRIntro && DRIntro.playing) }));
  },
  // ống nhòm (SpyglassVCam FOV 15, 3 m trên thuyền, nhìn gần ngang) — chuột phải như người chơi
  async spyglass(page) {
    await toSail(page);
    const p = await teleportOpen(page);
    await page.evaluate(() => { DRAbilities.unlock('spyglass'); DRAbilities.select('spyglass'); });
    await sleep(500);
    await page.mouse.move(960, 540);
    await page.mouse.down({ button: 'right' }); await sleep(80); await page.mouse.up({ button: 'right' });
    await sleep(900);
    return Object.assign(p, { spy: await page.evaluate(() => DRAbilities.spyglassActive) });
  },
  // góc thấp sát nước gần bờ: rig dưới (cao 2 m, bán kính 10 m), mũi hướng vào bờ cách ~12 m
  async grazing(page) {
    await toSail(page);
    return page.evaluate(() => {
      let best = null;
      for (let r = 30; r < 300 && !best; r += 5) for (let a = 0; a < 6.28; a += 0.2) {
        const x = 20 + Math.cos(a) * r, z = -30 + Math.sin(a) * r, d = DRWorld.sdf(x, z);
        if (d > 11 && d < 14 && DRWorld.sdf(x + 12, z) > 0 && DRWorld.sdf(x - 12, z) > 0 && DRWorld.sdf(x, z + 12) > 0 && DRWorld.sdf(x, z - 12) > 0) { best = { x, z, d }; break; }
      }
      const e = 0.5, gx = DRWorld.sdf(best.x + e, best.z) - DRWorld.sdf(best.x - e, best.z), gz = DRWorld.sdf(best.x, best.z + e) - DRWorld.sdf(best.x, best.z - e);
      DR_DEBUG.teleport(best.x, best.z, Math.atan2(gx, gz));
      DRCamera.orbit(0, -1);
      return best;
    });
  }
};
const settle = async (page, t, ms) => { await page.evaluate(t => DR_DEBUG.setTime(t), t); await sleep(ms || 1800); };

// ---- đo ảnh trong trình duyệt (không cần thư viện PNG): độ sáng Rec.709 trên ảnh sRGB 8 bit
async function measure(page, file, rects, opts) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async ([b64, rects, opts]) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u8]), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const cv = new OffscreenCanvas(bmp.width, bmp.height), cx = cv.getContext('2d');
    cx.drawImage(bmp, 0, 0);
    const W = bmp.width, H = bmp.height, d = cx.getImageData(0, 0, W, H).data;
    const sx = W / (opts.w || 1920), sy = H / (opts.h || 1080);
    const L = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
    const res = { rgb: [0, 0, 0], mean: 0, n: 0, facet: 0, fn: 0, white: 0, med: 0 }, hist = new Uint32Array(256);
    const K = 4; // cửa sổ 9×9
    for (const r of rects) {
      const x0 = Math.round(r[0] * sx), y0 = Math.round(r[1] * sy), x1 = Math.round(r[2] * sx), y1 = Math.round(r[3] * sy);
      const w = x1 - x0, h = y1 - y0, I = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
          const i = ((y + y0) * W + x + x0) * 4, l = L(x + x0, y + y0);
          res.rgb[0] += d[i]; res.rgb[1] += d[i + 1]; res.rgb[2] += d[i + 2]; res.mean += l; res.n++;
          if (l > 235) res.white++;
          hist[Math.min(255, Math.round(l))]++;
          row += l; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
        }
      }
      // độ gồ của mặt: |L − trung bình 9×9| — mặt phẳng từng mảnh (tam giác, ô Voronoi) để lại bậc vài mức quanh mép mảnh,
      // mặt tô mịn chỉ còn sai số làm tròn 8 bit (< 0,25)
      for (let y = K; y < h - K; y++) for (let x = K; x < w - K; x++) {
        const A = I[(y - K) * (w + 1) + x - K], B = I[(y - K) * (w + 1) + x + K + 1], C = I[(y + K + 1) * (w + 1) + x - K], D = I[(y + K + 1) * (w + 1) + x + K + 1];
        res.facet += Math.abs(L(x + x0, y + y0) - (D - B - C + A) / 81); res.fn++;
      }
    }
    res.rgb = res.rgb.map(v => v / res.n); res.mean /= res.n; res.facet /= Math.max(1, res.fn); res.white /= Math.max(1, res.n);
    for (let i = 0, c = 0; i < 256; i++) { c += hist[i]; if (c * 2 >= res.n) { res.med = i; break; } }
    return res;
  }, [b64, rects, opts || {}]);
}

// ô 4×4 px rơi vào dải nước sát bờ (0,5 < khoảng cách tới đất ≤ 8 m), chiếu tia camera xuống mặt y = 0
async function shoreRects(page) {
  return page.evaluate(() => {
    const cam = DR_DEBUG.camera, T = THREE, out = [], v = new T.Vector3(), W = innerWidth, H = innerHeight;
    for (let py = 8; py < H; py += 8) for (let px = 8; px < W; px += 8) {
      if (px < 720 && py > 360 && py < 780) continue;          // bảng câu cá
      v.set(px / W * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
      if (v.y >= -0.01) continue;
      const t = -cam.position.y / v.y, x = cam.position.x + v.x * t, z = cam.position.z + v.z * t, d = DRWorld.sdf(x, z);
      if (d > 0.5 && d <= 8 && Math.hypot(x - DR.s.boat.x, z - DR.s.boat.z) > 4) out.push([px - 2, py - 2, px + 2, py + 2]);
    }
    return { rects: out, w: W, h: H };
  });
}

// bản đồ bọt (StylisedWater_Tex) đen: tắt hết bọt ở cả bản cũ lẫn bản mới, chỉ còn phần tô bóng của mặt nước
const NO_FOAM = () => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; window.__foamTex = DRWater.uniforms.uFoamTex.value; DRWater.uniforms.uFoamTex.value = t; };
const FOAM_BACK = () => { DRWater.uniforms.uFoamTex.value = window.__foamTex; };

function sbs(web, real, name) {
  const outp = path.join(SHOTS, 'sbs-' + name + '.png');
  try {
    cp.execFileSync(fs.existsSync(PY) ? PY : 'python', ['-I', 'D:/dredge-ref/notes/sbs.py', web, path.join(REAL, real), outp]);
    return outp;
  } catch (e) { return 'sbs lỗi: ' + e.message.split('\n')[0]; }
}

async function perfOf(page) {
  const ps = [];
  for (let i = 0; i < 5; i++) { await sleep(500); ps.push(await page.evaluate(() => DR_DEBUG.perf().avgMs)); }
  ps.sort((a, b) => a - b);
  return ps[2];
}

// vùng nước để đo (toạ độ ảnh 1920×1080), né thuyền, HUD và bờ
const WATER_RECT = {
  chase: [[200, 700, 760, 1000], [1160, 700, 1720, 1000]],
  grazing: [[200, 830, 760, 1060], [1160, 830, 1500, 1060]],
  spyglass: [[200, 760, 900, 1060], [1020, 760, 1720, 1060]]
};

async function run(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = watch(page);
  const shot = async name => { const f = path.join(SHOTS, name + '.png'); await page.screenshot({ path: f }); return f; };
  await boot(page, base);
  const info = {}, R = {};
  for (const cam of ['dock', 'chase', 'harvest', 'spyglass', 'grazing']) {
    info[cam] = await CAMS[cam](page);
    for (const [tn, t] of Object.entries(TIMES)) {
      await settle(page, t, 1800);
      const f = await shot(cam + '-' + tn);
      if (tn === 'day' && WATER_RECT[cam]) {
        await page.evaluate(NO_FOAM); await sleep(250);
        const f2 = await shot(cam + '-day-nofoam');
        await page.evaluate(FOAM_BACK);
        R[cam] = await measure(page, f2, WATER_RECT[cam]);
      }
      if (cam === 'harvest' && tn === 'day') {
        const sr = await shoreRects(page);
        R.shore = Object.assign(await measure(page, f, sr.rects, sr), { px: sr.rects.length });
      }
    }
    if (cam === 'dock') {
      await page.setViewportSize({ width: 844, height: 390 }); await sleep(900); await shot('phone-dock-night');
      await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(600);
    }
    if (cam === 'harvest') {
      await settle(page, 0.45, 1200);
      await page.setViewportSize({ width: 844, height: 390 }); await sleep(900); await shot('phone-harvest-day');
      await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(600);
      await page.keyboard.press('Escape'); await sleep(400);
    }
  }
  out.push('  · chỗ đứng: ' + JSON.stringify(info));
  check('các góc camera vào đúng chế độ (bến sau đoạn mở đầu, thu hoạch, ống nhòm)', info.dock.mode === 'dock' && !info.dock.intro && info.harvest.mode === 'harvest' && info.spyglass.spy === true,
    JSON.stringify({ dock: info.dock, harvest: info.harvest.mode, spy: info.spyglass.spy }));

  // 1. mịn: độ gồ TB |L − TB 9×9| trên nước thoáng, bọt tắt. _base3 (Phong + Water_Normal Voronoi) đo 0,42–0,53 ở cả ba góc.
  for (const cam of ['chase', 'grazing', 'spyglass']) {
    const m = R[cam];
    check('mặt nước mịn (' + cam + ', trưa, bọt tắt): độ gồ TB < 0,30 mức (bản _base3 0,42–0,53)', m.facet < 0.3, 'gồ ' + m.facet.toFixed(3) + ', độ sáng TB ' + m.mean.toFixed(1));
  }
  // 2. bờ không trắng loang (camera thu hoạch 20 m, trưa): ô ảnh trong dải nước 0,5–8 m quanh bờ có độ sáng > 235
  const G04 = await measure(page, path.join(REAL, 'gog_04.jpg'), [[1090, 120, 1200, 1080], [600, 0, 720, 360]]);
  check('dải nước 0,5–8 m sát bờ: tỉ lệ điểm gần trắng (> 235) ≤ ' + (G04.white + 0.02).toFixed(3) + ' (= gog_04 dải bờ vách ' + G04.white.toFixed(3) + ' + 0,02)',
    R.shore.px > 200 && R.shore.white <= G04.white + 0.02, 'trắng ' + R.shore.white.toFixed(3) + ' trên ' + R.shore.px + ' ô, độ sáng TB ' + R.shore.mean.toFixed(1));

  // 3. ghép với ảnh gốc
  await toSail(page);
  await page.evaluate(([x, z, y]) => DR_DEBUG.teleport(x, z, y), DUSK_VIEW);
  await settle(page, DUSK_VIEW[3], 2600);
  const fd = await shot('src-dusk');
  R.dusk = await measure(page, fd, [[800, 850, 1600, 1080]]);
  await page.evaluate(() => DRSky.weather.pin('LightSnow'));
  await page.evaluate(([x, z, y]) => DR_DEBUG.teleport(x, z, y), NIGHT_VIEW);
  await settle(page, NIGHT_VIEW[3], 3500);
  const fn = await shot('src-night');
  R.night = await measure(page, fn, [[0, 900, 250, 1080], [1000, 850, 1300, 1080]]);
  R.nightFar = await measure(page, fn, [[0, 560, 400, 700]]);
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(900); await shot('phone-night-snow');
  await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(600);
  await page.evaluate(() => DRSky.weather.pin('Fine'));
  const G01 = await measure(page, path.join(REAL, 'gog_01.jpg'), [[800, 850, 1600, 1080]]);
  const G20 = await measure(page, path.join(REAL, 'gog_20.jpg'), [[0, 900, 250, 1080], [1000, 850, 1300, 1080]]);
  const G20f = await measure(page, path.join(REAL, 'gog_20.jpg'), [[0, 560, 400, 700]]);
  out.push('  · đêm: nước gần trung vị web ' + R.night.med + ' / gốc ' + G20.med + ', dải xa trung vị web ' + R.nightFar.med + ' / gốc ' + G20f.med);
  check('hoàng hôn (t 0,74, cảnh như gog_01): độ sáng TB nước gần ' + R.dusk.mean.toFixed(1) + ' trong ±15 của gog_01 ' + G01.mean.toFixed(1),
    Math.abs(R.dusk.mean - G01.mean) <= 15, 'web RGB ' + R.dusk.rgb.map(v => v.toFixed(0)) + ' / gốc ' + G01.rgb.map(v => v.toFixed(0)));
  // nước sát thuyền ở gog_20 là _DeepColor + trong suốt vì ngay dưới mặt có vỏ thuyền và khối băng NarwhalWall; Pale Reach của bản web
  // không có dữ liệu đáy/băng ngầm nên chỉ so được dải nước xa đã chìm trong sương (độ sáng do màu sương + ánh sáng đêm quyết định)
  check('đêm (t 0,92, Pale Reach tuyết như gog_20): trung vị độ sáng dải nước xa ' + R.nightFar.med + ' trong ±8 của gog_20 ' + G20f.med,
    Math.abs(R.nightFar.med - G20f.med) <= 8, 'web RGB ' + R.nightFar.rgb.map(v => v.toFixed(0)) + ' / gốc ' + G20f.rgb.map(v => v.toFixed(0)));
  out.push('  · ' + sbs(fd, 'gog_01.jpg', 'dusk'));
  out.push('  · ' + sbs(fn, 'gog_20.jpg', 'night'));
  out.push('  · ' + sbs(path.join(SHOTS, 'harvest-day.png'), 'gog_04.jpg', 'harvest'));
  out.push('  · ' + sbs(path.join(SHOTS, 'grazing-day.png'), 'gog_05.jpg', 'grazing'));

  // 4. khung hình 1280×720 mỗi camera (trung vị 5 mẫu DR_DEBUG.perf().avgMs)
  await page.setViewportSize({ width: 1280, height: 720 });
  const perf = {};
  for (const cam of ['chase', 'harvest', 'spyglass', 'grazing']) {
    await CAMS[cam](page); await settle(page, 0.45, 1500);
    perf[cam] = await perfOf(page);
    if (cam === 'harvest') { await page.keyboard.press('Escape'); await sleep(400); }
  }
  out.push('  · khung 1280×720 (ms, trung vị): ' + Object.entries(perf).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', '));
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 4).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try { await run(browser, base); } catch (e) { fail++; out.push('  ✘ lỗi chạy: ' + (e && e.stack || e)); }
  await browser.close(); srv.close();
  console.log('DREDGE water' + (BASELINE ? ' (BASELINE ' + ROOT + ')' : ''));
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
