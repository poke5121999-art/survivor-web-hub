/*
 * DREDGE — Biển Mù, vòng wfx: hiệu ứng mặt nước quanh thuyền so với clip gốc (ObBBFGMem5U t = 165, 1980; gog_01).
 *
 * Chạy:  node test/dredge-wfx.js                 Ra: %TEMP%/dredge-wfx/*.png
 *        DR_ROOT=D:/dredge-wt/_base16 node test/dredge-wfx.js   (đo bản trước để thấy các kiểm tra trượt)
 * Kiểm (thuyền chạy thẳng 3 s lúc 10:48, camera đuổi, 1280x720):
 *   1. vệt bọt BoatTrailParticles là VÒNG bọt trắng mảnh (FloatingParticle_Shader dẹp cầu lên mặt nước + bọt chạm của Water_Shader),
 *      không phải đĩa xanh đặc. Đo RIÊNG vệt: giờ game đóng băng, chụp có/không mesh hạt cùng khung, trung vị 7 lần (wakeFoam).
 *      Bản cũ đếm điểm trắng trong một ảnh: lẫn bọt bờ khi thuyền tới gần bờ và đổi 30..2000 theo pha sóng của khung chụp (Pages rev g: 30/465/180).
 *   2. vỏ chìm sáng qua nước: dải nước ngay dưới đuôi thuyền sáng hơn nước thoáng cùng hàng (quầng _ShallowColor + độ trong 1 − a).
 *   3. trạng thái vẽ của hạt theo dữ liệu: ghi chiều sâu, so sánh Less (RenderObjects "Water"), màu = _FoamColor của WaterController.
 *   4. đứng yên thì không có vòng bọt (rateOverDistance) — ảnh nước quanh thuyền không có điểm trắng của vệt.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(os.tmpdir(), 'dredge-wfx');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else fail++; console.log((cond ? '  ok   ' : '  FAIL ') + msg); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const ROOT = process.env.DR_ROOT ? path.resolve(process.env.DR_ROOT) : path.resolve(__dirname, '..');
const serve = () => new Promise(res => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(ROOT, u), (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
    });
  }).listen(0, () => res(srv));
});

async function toSea(page, base, errors) {
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {}); else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(500);
  await page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await page.evaluate(() => DR_DEBUG.setTime(0.45));
  await sleep(1200);
}

// hộp ảnh quanh thuyền (theo chiếu toạ độ thuyền) + thống kê điểm ảnh
async function boatBox(page) {
  return page.evaluate(() => {
    const b = DR.s.boat, cam = DRCamera.cam, P = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
    const half = DRBoat.half ? DRBoat.half[1] : 1.5, fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const [x, y] = P(b.x, b.z), [sx, sy] = P(b.x - fx * (half + 0.3), b.z - fz * (half + 0.3)); // mặt nước ngay sau đuôi
    return { x, y, sx, sy };
  });
}
async function stats(page, png, c) {
  return page.evaluate(async ([b64, c]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const box = (x0, y0, w, h) => g.getImageData(Math.round(x0), Math.round(y0), Math.round(w), Math.round(h)).data;
    // vùng nước quanh thuyền: 360x220 px, bỏ khối giữa 150x200 (thân thuyền)
    const W = 360, H = 220, x0 = c.x - W / 2, y0 = c.y - 140, d = box(x0, y0, W, H);
    let white = 0, disc = 0;
    for (let i = 0, k = 0; i < d.length; i += 4, k++) {
      const px = k % W, py = (k / W) | 0;
      if (Math.abs(px - W / 2) < 75 && py < 190) continue;
      const r = d[i], gg = d[i + 1], bb = d[i + 2];
      if (r > 150 && gg > 165 && bb > 170 && Math.max(r, gg, bb) - Math.min(r, gg, bb) < 70) white++;          // bọt trắng ngả lam
      else if (bb > 150 && gg > 135 && r < 130 && bb - r > 55) disc++;                                         // lam nhạt bão hoà (đĩa xanh cũ)
    }
    // vỏ chìm: ô 50x14 px ở mặt nước ngay sau đuôi (chiếu điểm cách tâm nửa chiều dài thân + 0,3 m) so với nước thoáng cùng hàng cách ±170 px
    const lum = a => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; n++; } return s / n; };
    const under = lum(box(c.sx - 25, c.sy - 7, 50, 14)), open = (lum(box(c.sx - 195, c.sy - 7, 50, 14)) + lum(box(c.sx + 145, c.sy - 7, 50, 14))) / 2;
    return { white, disc, under, open };
  }, [png.toString('base64'), c]);
}

// điểm bọt của RIÊNG vệt hạt: đóng băng giờ game (DR.holdTime), chụp có/không có mesh BoatTrailParticles cùng một khung, đếm điểm ảnh
// sáng lên ≥ 40 (độ sáng) và gần trắng trong hộp 420x260 quanh thuyền — không lẫn bọt bờ/sóng, không phụ thuộc pha sóng của khung chụp
async function wakeFoam(page) {
  await page.evaluate(() => DR.holdTime('wfx-test', 0));
  await sleep(120);
  const c = await boatBox(page);
  const a = await page.screenshot();
  await page.evaluate(() => { DRVfx.mesh.visible = false; });
  await sleep(120);
  const b = await page.screenshot();
  await page.evaluate(() => { DRVfx.mesh.visible = true; DR.releaseTime('wfx-test'); });
  return page.evaluate(async ([A, B, c]) => {
    const load = async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      return g.getImageData(Math.round(c.x - 210), Math.round(c.y - 160), 420, 260).data; };
    const da = await load(A), db = await load(B);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      const la = 0.2126 * da[i] + 0.7152 * da[i + 1] + 0.0722 * da[i + 2], lb = 0.2126 * db[i] + 0.7152 * db[i + 1] + 0.0722 * db[i + 2];
      if (la - lb >= 40 && da[i] > 140 && da[i + 2] > 160) n++;
    }
    return n;
  }, [a.toString('base64'), b.toString('base64'), c]);
}

(async () => {
  const srv = process.env.DR_URL ? null : await serve(), base = process.env.DR_URL || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const errors = [];
  const tag = process.env.DR_ROOT ? 'before-' : '';
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await toSea(page, base, errors);
    // 4. đứng yên trước
    const c0 = await boatBox(page);
    const p0 = await page.screenshot({ path: path.join(OUT, tag + 'still.png') });
    const s0 = await stats(page, p0, c0);
    console.log('  đứng yên:', JSON.stringify(s0));
    ok(s0.white < 150, 'đứng yên: quanh thuyền gần như không có điểm bọt trắng của vệt (' + s0.white + ' < 150)');
    // chạy thẳng 3 s
    await page.keyboard.down('KeyW');
    await sleep(3000);
    // thuyền phải đang chạy đủ tốc trước khi đo (vệt phát theo quãng đường, LifetimeByEmitterSpeed); chờ tối đa 4 s
    await page.waitForFunction(() => Math.hypot(DR.s.boat.vx, DR.s.boat.vz) > 3 && DRVfx.stats().alive >= 30, null, { timeout: 4000 }).catch(() => {});
    // trung vị của 7 lần đo cách nhau 0,4 s (vòng bọt đổi theo pha sóng của từng hạt)
    const wf = [];
    for (let k = 0; k < 7; k++) { wf.push(await wakeFoam(page)); await sleep(400); }
    const wakeMed = wf.slice().sort((x, y) => x - y)[3];
    console.log('  bọt riêng của vệt (7 lần):', wf.join(','), 'trung vị', wakeMed);
    const perf = await page.evaluate(() => DR_DEBUG.perf());
    const c1 = await boatBox(page);
    const p1 = await page.screenshot({ path: path.join(OUT, tag + 'run.png') });
    await page.screenshot({ path: path.join(OUT, tag + 'run-crop.png'), clip: { x: Math.max(0, c1.x - 240), y: Math.max(0, c1.y - 150), width: 480, height: 300 } });
    const s1 = await stats(page, p1, c1);
    const vfx = await page.evaluate(() => { const s = DRVfx.stats(); return { alive: s.alive }; });
    console.log('  chạy 3 s:', JSON.stringify(s1), 'hạt', vfx.alive, 'perf', perf.avgMs.toFixed(2), 'ms/khung, cpu', perf.cpuMs.toFixed(2), 'ms');
    ok(vfx.alive >= 30, 'đang chạy có ≥ 30 hạt vệt (' + vfx.alive + ')');
    ok(wakeMed >= 300, 'vệt bọt: trung vị điểm bọt riêng của vệt (có/không mesh hạt, giờ đóng băng) ≥ 300 (' + wakeMed + '; bản đĩa xanh cũ ≈ 0)');
    ok(s1.disc < 1500, 'vệt bọt không thành đĩa xanh đặc: < 1500 điểm lam nhạt bão hoà (' + s1.disc + ')');
    ok(s1.under > s1.open * 1.25, 'vỏ chìm sáng qua nước: sau đuôi ' + s1.under.toFixed(1) + ' > 1,25 × nước thoáng ' + s1.open.toFixed(1));
    // 5. phản chiếu phẳng (PlanarReflections, Manager.unity): RT = 0,5 × khung, lớp CollidesWithPlayer (đá/đảo), có bầu trời; đổi mặt nước xa
    // (V.y nhỏ: (1 − V.y)^14 · 0,5) mà gần như không đổi nước sát thuyền. Đo cùng một khung đóng băng: bật/tắt ảnh phản chiếu.
    const rf = await page.evaluate(() => {
      const U = DRWater.uniforms, t = U.uRefl && U.uRefl.value, R = window.DR_REFLECT;
      let tagged = 0; DRWorld && Object.values(DRWorld.cells).forEach(c => c.group && c.group.children.forEach(o => { if (o.layers.test({ mask: 1 << 7 })) tagged++; }));
      const sz = DR_DEBUG.renderer.getDrawingBufferSize(new THREE.Vector2());
      return { on: U.uReflOn ? U.uReflOn.value : -1, w: t && t.image ? t.image.width : 0, bw: sz.x, layers: R ? R.reflectionLayerNames : null, tagged };
    });
    const band = async () => { const p = await page.screenshot(); return page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      return [Array.from(g.getImageData(0, 330, 1280, 40).data), Array.from(g.getImageData(300, 640, 680, 60).data)]; }, p.toString('base64')); };
    await page.evaluate(() => DR.holdTime('wfx-refl', 0)); await sleep(150);
    const A = await band();
    await page.evaluate(() => { window.DR_REFL_OFF = 1; }); await sleep(150);
    const B = await band();
    await page.evaluate(() => { window.DR_REFL_OFF = 0; DR.releaseTime('wfx-refl'); });
    const mad = (x, y) => { let s = 0; for (let i = 0; i < x.length; i += 4) s += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]); return s / (x.length / 4) / 3; };
    const far = mad(A[0], B[0]), near = mad(A[1], B[1]);
    console.log('  phản chiếu:', JSON.stringify(rf), 'lệch TB dải xa', far.toFixed(2), 'dải gần', near.toFixed(2));
    ok(rf.on === 1 && rf.w === Math.floor(rf.bw * 0.5) && rf.layers && rf.layers.join() === 'CollidesWithPlayer' && rf.tagged > 0,
      'phản chiếu phẳng bật: RT ' + rf.w + ' = 0,5 × ' + rf.bw + ', lớp ' + (rf.layers || []).join() + ', ' + rf.tagged + ' mesh đá/đảo được vẽ');
    ok(far >= 3 && near < far, 'phản chiếu đổi nước xa (lệch TB ' + far.toFixed(2) + ' ≥ 3 mức; tắt/bật cùng khung, nhiễu ~1,2) nhiều hơn nước gần (' + near.toFixed(2) + ')');
    // 3. trạng thái vẽ (dữ liệu gốc)
    const st = await page.evaluate(() => {
      const m = DRVfx.mesh.material, fc = DRWater.props().foamColor, u = m.uniforms && m.uniforms.uFoamCol;
      const lin = x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      return { dw: m.depthWrite, df: m.depthFunc, less: THREE.LessDepth, tr: m.transparent,
        col: u ? Math.max(Math.abs(u.value.r - lin(fc[0])), Math.abs(u.value.g - lin(fc[1])), Math.abs(u.value.b - lin(fc[2]))) : 1 };
    });
    ok(st.dw === true && st.df === st.less && st.tr, 'hạt bọt: ghi chiều sâu + so sánh Less + trộn alpha (Water.asset overrideDepthState, FoamParticle_Mat_0 _SrcBlend 5/_DstBlend 10)');
    ok(st.col < 1e-4, 'màu hạt = _FoamColor của WaterController (FoamColoured), lệch ' + st.col.toExponential(1));
    await page.keyboard.up('KeyW');
    await ctx.close();
  } catch (e) { fail++; console.log('  FAIL lỗi chạy: ' + e.message.split('\n')[0]); }
  ok(errors.length === 0, 'không lỗi trang/console/HTTP' + (errors.length ? ': ' + [...new Set(errors)].slice(0, 3).join(' ; ') : ''));
  console.log('dredge-wfx: ' + pass + ' pass, ' + fail + ' fail  -> ' + OUT);
  await browser.close(); if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
