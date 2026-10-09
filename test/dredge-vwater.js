/*
 * DREDGE — Biển Mù, vòng 4, owner vwater: V04 (màu nước + bọt) và V14 (xúc tu đỏ khi hoảng loạn).
 *
 * Chạy:  node test/dredge-vwater.js        Ra: %TEMP%/dredge-vwater/*.png
 * Số gốc (clip ObBBFGMem5U, nước ngoài vịnh Marrows, camera chạy):
 *   10:55 (66..78, 95..114, 106..128) | 07:12 (52..62, 60..73, 63..74) | đêm (33,33,39); vòng trước web cho (134..148, 160..165, 164..169).
 * Xúc tu: TentacleAttack — anchor (−2, 0, 12), clip Armature|Spawn 7,75 s, Tentacle_Retract 1,58 s, hoà 0,5 s (tools/tentacle.py).
 * Một trạng thái hỏng không cản trạng thái khác; cuối cùng in tổng pass/fail.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(os.tmpdir(), 'dredge-vwater');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg); } if (cond && process.env.V) console.log('  ok   ' + msg); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const ROOT = path.resolve(__dirname, '..');
const serve = () => new Promise(res => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(ROOT, u), (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
    });
  }).listen(0, () => res(srv));
});

async function newSea(browser, base, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  for (let i = 0; i < 80; i++) {            // đi hết hội thoại tới khi bến sẵn sàng
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
  return { ctx, page };
}

// trung bình màu của một vùng ảnh chụp (đọc ngay trong trang qua canvas)
async function meanRGB(page, png, box) {
  return page.evaluate(async ([b64, bx]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const x = Math.round(bx[0] * img.width), y = Math.round(bx[1] * img.height), w = Math.round((bx[2] - bx[0]) * img.width), h = Math.round((bx[3] - bx[1]) * img.height);
    const d = g.getImageData(x, y, w, h).data; let r = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    return [r / n, gg / n, bb / n];
  }, [png.toString('base64'), box]);
}
async function redCount(page, png) {   // số điểm ảnh đỏ gai: R ≥ 70 và R > 1,7·G và R > 1,5·B (loại HUD: bỏ viền trên 12 %)
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, Math.round(img.height * 0.12), img.width, Math.round(img.height * 0.65)).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] >= 70 && d[i] > 1.7 * d[i + 1] && d[i] > 1.5 * d[i + 2]) n++;
    return n;
  }, png.toString('base64'));
}
async function whiteCount(page, png, box, thr) {   // số điểm ảnh gần trắng (cả ba kênh > thr) trong vùng box (tỉ lệ ảnh)
  return page.evaluate(async ([b64, bx, t]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const x = Math.round(bx[0] * img.width), y = Math.round(bx[1] * img.height), w = Math.round((bx[2] - bx[0]) * img.width), h = Math.round((bx[3] - bx[1]) * img.height);
    const d = g.getImageData(x, y, w, h).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > t && d[i + 1] > t && d[i + 2] > t) n++;
    return n;
  }, [png.toString('base64'), box, thr]);
}
const within = (v, lo, hi) => v >= lo && v <= hi;

(async () => {
  const srv = await serve(), base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port), errors = [];
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { ctx, page } = await newSea(browser, base, errors);

  // ---- V04: màu nước theo giờ (vịnh Marrows, camera chạy sau thuyền, vùng nước trái-dưới ảnh, xa thuyền và xa bờ)
  console.log('V04 màu nước');
  const water = async (t, tag) => {
    await page.evaluate(x => DR_DEBUG.setTime(x), t);
    await page.keyboard.down('KeyW'); await sleep(2200); await page.keyboard.up('KeyW'); await sleep(300);
    const png = await page.screenshot({ path: path.join(OUT, 'water-' + tag + '.png') });
    return meanRGB(page, png, [0.08, 0.78, 0.3, 0.92]);
  };
  const noon = await water(0.5, 'noon'), dawn = await water(0.3, 'dawn'), night = await water(0.95, 'night');
  console.log('  noon', noon.map(Math.round), 'dawn', dawn.map(Math.round), 'night', night.map(Math.round));
  // quầng bọt quanh thuyền (clip: chỉ vòng gợn mảnh + vỏ xanh nhạt dưới nước): vùng 330x190 px quanh thuyền, điểm gần trắng (> 200)
  await page.evaluate(() => DR_DEBUG.setTime(0.5));
  await page.keyboard.down('KeyW'); await sleep(2200); await page.keyboard.up('KeyW');
  const pngHalo = await page.screenshot({ path: path.join(OUT, 'halo.png') });
  const halo = await whiteCount(page, pngHalo, [0.40, 0.56, 0.60, 0.92], 200);
  console.log('  điểm gần trắng quanh thuyền:', halo);
  ok(halo < 900, 'quầng bọt quanh thuyền mảnh: ' + halo + ' điểm gần trắng < 900 (đo trước khi sửa: 1837, sau: ~490)');
  // bọt rải rác theo thời tiết: Fine (foam 0,2) không có đốm như clip ngày 1; chỉ thời tiết mưa/bão (foam 0,3..0,35) mới có đốm — không phải thiếu đầu vào của shader
  await page.evaluate(() => { DRSky.weather.pin('LightRain'); DRSky.weather.set('LightRain'); });
  await sleep(4500);
  const foamU = await page.evaluate(() => DRWater.uniforms.uFoam.value);
  ok(foamU >= 0.3, 'mưa nhẹ nâng _FoamAmount lên ' + foamU.toFixed(2) + ' (WeatherData LightRain 0,35)');
  await page.evaluate(() => { DRSky.weather.pin('Fine'); DRSky.weather.set('Fine'); });
  await sleep(500);
  // vòng 6 (w3water): bỏ ba ngưỡng tuyệt đối từng mã hoá bản khớp cũ (trưa R 55..105 / G 85..140 / B 100..160, bình minh G < 115, đêm < 70/70/75)
  // vì một hệ số không thoả cả bình minh lẫn trưa. Thay bằng bảng đo theo giờ: tỉ lệ web/clip theo dải giờ trong 15 % (test/dredge-water-table.js,
  // clip: test/dredge-water-clip.json, kết quả: water-table.tsv)
  {
    const TB = require('./dredge-water-table.js'), { rows } = await TB.run(), bd = TB.bands(rows);
    console.log('  tỉ lệ web/clip theo dải', Object.entries(bd).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' | '));
    for (const k of ['dawn', 'noon', 'dusk', 'night']) ok(bd[k] >= 0.85 && bd[k] <= 1.15, 'nước ' + k + ': tỉ lệ độ sáng web/clip ' + (bd[k] || 0).toFixed(2) + ' trong ±15 %');
  }
  ok(noon[2] - noon[0] > 25, 'nước trưa ngả xanh (B − R > 25), không xám');
  ok(dawn[1] <= noon[1] + 1, 'bình minh tối hơn buổi trưa (gốc G 60..73 so với 95..114)');
  ok(night[1] < dawn[1], 'nước đêm tối hơn bình minh (gốc 33,33,39)');

  // ---- V14: xúc tu đỏ
  console.log('V14 xúc tu đỏ gai');
  await page.evaluate(() => DR_DEBUG.setTime(0.98));
  const spot = await page.evaluate(() => {
    for (let x = -150; x <= 150; x += 6) for (let z = -150; z <= 150; z += 6)
      if (DRWorld.depth01(x, z) > 0.2 && DRWorld.sdf(x, z) > 12 && DRWorld.zoneAt(x, z) === 'THE_MARROWS') { DR_DEBUG.teleport(x, z - 20, Math.PI); return [x, z]; }
    return null;
  });
  ok(!!spot, 'có chỗ sâu > 20 m trong vùng Marrows để thử');
  await page.keyboard.down('KeyW'); await sleep(800); await page.keyboard.up('KeyW');
  const T = fn => page.evaluate(fn);
  await T(() => { DR.s.worldPhase = 2; DR.s.sanity = 0.08; });
  const cand = await T(() => DRTentacle.debug.candidates());
  ok(cand.includes('TentacleAttack'), 'sanity 0,08 + worldPhase 2 + đêm + chỗ sâu: TentacleAttack nằm trong danh sách ứng viên (' + cand.join(',') + ')');
  const probe = async patch => page.evaluate(p => { const s = DR.s, old = { sanity: s.sanity, worldPhase: s.worldPhase, time: s.time }; Object.assign(s, p); const t = DRTentacle.debug.test('TentacleAttack'); Object.assign(s, old); return t; }, patch);
  ok(!(await probe({ sanity: 0.5 })), 'sanity 0,5 > maxSanity 0,1: không bốc');
  ok(!(await probe({ worldPhase: 1 })), 'worldPhase 1 < minWorldPhase 2: không bốc');
  ok(!(await probe({ time: Math.floor(await T(() => DR.s.time)) + 0.5 })), 'giữa trưa ngoài khoảng 0,75..0,25: không bốc');
  // vùng cấm: TWISTED_STRAND và STELLAR_BASIN
  const forb = await T(() => {
    const out = {};
    for (const z of ['TWISTED_STRAND', 'STELLAR_BASIN']) {
      for (let x = -700; x <= 700 && !out[z]; x += 20) for (let y = -700; y <= 700; y += 20) if (DRWorld.zoneAt(x, y) === z) { out[z] = [x, y]; break; }
    }
    return out;
  });
  for (const z of Object.keys(forb)) {
    const r = await page.evaluate(([zz, p]) => {
      const b = DR.s.boat, old = [b.x, b.z]; b.x = p[0]; b.z = p[1];
      const t = DRTentacle.debug.test('TentacleAttack'); b.x = old[0]; b.z = old[1]; return t;
    }, [z, forb[z]]);
    ok(!r, 'vùng cấm ' + z + ': không bốc');
  }

  // bốc thăm bằng chính hàm của WorldEventManager tới khi ra xúc tu (các ứng viên khác chỉ ghi lịch sử nghỉ)
  const before = await page.screenshot({ path: path.join(OUT, 'tentacle-before.png') });
  const red0 = await redCount(page, before);
  let got = false;
  for (let i = 0; i < 60 && !got; i++) got = await T(() => { DR.s.sanity = 0.08; DRTentacle.debug.roll(); return DRTentacle.debug.active; });
  ok(got, 'roll() cuối cùng bốc trúng TentacleAttack');
  await sleep(1000);
  const s1 = await T(() => ({ st: DRTentacle.debug.state(), b: { x: DR.s.boat.x, z: DR.s.boat.z, yaw: DR.s.boat.yaw } }));
  ok(s1.st && s1.st.phase === 'spawn' && s1.st.t > 0.5, 'sau 1 s clip Armature|Spawn đang chạy (t = ' + (s1.st && s1.st.t.toFixed(2)) + ')');
  await sleep(2600);
  const s3 = await T(() => ({ st: DRTentacle.debug.state(), b: { x: DR.s.boat.x, z: DR.s.boat.z, yaw: DR.s.boat.yaw } }));
  const dist = Math.hypot(s3.st.x - s3.b.x, s3.st.z - s3.b.z);
  ok(within(dist, 8, 16), 'xúc tu bám tới cách thuyền ≈ √(2² + 12²) = 12,2 m (đo ' + dist.toFixed(1) + ')');
  ok(s3.st.track > 0.5, 'đang quay mặt về thuyền (track ' + s3.st.track.toFixed(2) + ' > 0,5 trước StopTrackingPlayer 3,875 s)');
  await sleep(1000);
  const png = await page.screenshot({ path: path.join(OUT, 'tentacle-spawn.png') });
  const red1 = await redCount(page, png);
  console.log('  điểm đỏ gai trước ' + red0 + ' / sau ' + red1);
  ok(red1 > red0 + 300, 'xúc tu hiện đỏ trên màn hình (điểm ảnh đỏ ' + red0 + ' -> ' + red1 + ')');
  await sleep(4000);
  const s8 = await T(() => DRTentacle.debug.state());
  ok(s8 && s8.phase === 'retract', 'sau ~9 s: đã hết clip Spawn 7,75 s, đang rút (Tentacle_Retract) — ' + JSON.stringify(s8 && s8.phase));
  await sleep(2400);
  ok(!(await T(() => DRTentacle.debug.active)), 'sau ~11,5 s xúc tu đã rút và bị huỷ');

  // neo bến thì rút ngay
  got = false;
  for (let i = 0; i < 80 && !got; i++) got = await T(() => { DR.s.sanity = 0.08; return DRTentacle.debug.spawn(); });
  await sleep(600);
  await T(() => { DR.s.dock = 'dock.greater-marrow'; });
  await sleep(300);
  ok((await T(() => DRTentacle.debug.state())).phase === 'retract', 'vào bến: xúc tu rút ngay');
  await T(() => { DR.s.dock = null; DRTentacle.finish(); });

  ok(errors.length === 0, 'không có lỗi trang / console / HTTP ≥ 400' + (errors.length ? ': ' + [...new Set(errors)].slice(0, 4).join(' ; ') : ''));
  await ctx.close(); await browser.close(); srv.close();
  console.log('vwater: ' + pass + ' pass, ' + fail + ' fail  (ảnh: ' + OUT + ')');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
