/*
 * DREDGE — Biển Mù, vòng 6, owner w3water: bảng đo độ sáng nước web so với clip ObBBFGMem5U theo giờ.
 * Chạy: node test/dredge-water-table.js [--write]   (--write ghi water-table.tsv ở thư mục gốc bản làm việc)
 *       ASSERT=1 node test/dredge-water-table.js     (so tỉ lệ web/clip với dung sai 15 %: in pass/fail)
 * Hai ô đo cố định trên ảnh 1280x720: L (0,15-0,35 x 0,75-0,92) và R (0,65-0,85 x 0,75-0,92): nước trái/phải thuyền, né thuyền và HUD.
 * Số clip: test/dredge-water-clip.json, đọc bằng Pillow trên khung 1024x576 trích từ video (giờ đọc từ mặt đồng hồ).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-water-table');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const serve = () => new Promise(res => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(ROOT, u), (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
    });
  }).listen(0, () => res(srv));
});
const PATCH = { L: [0.15, 0.75, 0.35, 0.92], R: [0.65, 0.75, 0.85, 0.92] };
const CLIP = require('./dredge-water-clip.json');
async function boot(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
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
  await page.addStyleTag({ content: '#dr-tut { display: none !important; }' });
  return page;
}
async function patchMean(page, png, box) {
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
// chỗ đo: nước thoáng ≥ 18 m cách bờ quanh Greater Marrow (tránh nước nông để đo đúng nước vịnh)
async function place(page) {
  return page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 30; r < 160; r += 4) for (let a = 0; a < 6.28; a += 0.2) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 18) return { x, z, a };
    }
    return null;
  });
}
module.exports = { serve, boot, place, patchMean, PATCH, run: async function run() {
  const srv = await serve(), base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await boot(browser, base);
    const p = await place(page);
    const yaw = +(process.env.YAW || 0);
    await page.evaluate(([x, z, y]) => { DR_DEBUG.teleport(x, z, y); DRSky.weather.pin('Fine'); DRSky.weather.set('Fine'); }, [p.x, p.z, yaw]);
    await sleep(1500);
    const rows = [];
    for (const c of CLIP) {
      const [hh, mm] = c.t.split(':').map(Number);
      await page.evaluate(f => DR_DEBUG.setTime(f), (hh + mm / 60) / 24);
      await sleep(2500);
      const png = await page.screenshot({ path: path.join(OUT, 'tb-' + c.t.replace(':', '') + '.png') });
      for (const k of ['L', 'R']) {
        if (!c[k]) continue;
        const w = await patchMean(page, png, PATCH[k]), cl = c[k];
        rows.push({ band: c.band, t: c.t, place: c.place, patch: k, clip: cl, web: w.map(Math.round), rgb: w.map((v, i) => v / cl[i]), mean: (w[0] + w[1] + w[2]) / (cl[0] + cl[1] + cl[2]) });
      }
    }
    return { p, rows };
  } finally { await browser.close(); srv.close(); }
} };
// trung bình tỉ lệ theo dải giờ (mỗi dải gồm vài khung clip liên tiếp; riêng từng khung clip lệch nhau tới ±25 % vì mây/tia nhìn/độ sâu)
function bands(rows) {
  const B = {};
  for (const r of rows) if (r.band) (B[r.band] = B[r.band] || []).push(r.mean);
  return Object.fromEntries(Object.entries(B).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
}
module.exports.bands = bands;
if (require.main === module) module.exports.run().then(({ p, rows }) => {
  const bd = bands(rows);
  console.log('ratio web/clip theo dải:', JSON.stringify(Object.fromEntries(Object.entries(bd).map(([k, v]) => [k, +v.toFixed(2)]))));
  const head = ['band', 'time', 'place', 'patch', 'clip_rgb', 'web_rgb', 'ratio_rgb', 'ratio_mean'];
  const lines = [head.join('\t')].concat(rows.map(r => [r.band || 'excluded', r.t, r.place, r.patch, r.clip.join(','), r.web.join(','), r.rgb.map(v => v.toFixed(2)).join(','), r.mean.toFixed(2)].join('\t')));
  console.log('web at', JSON.stringify(p) + '\n' + lines.join('\n'));
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(ROOT, 'water-table.tsv'), lines.join('\n') + '\n');
}).catch(e => { console.error(e); process.exit(1); });
