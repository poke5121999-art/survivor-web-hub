/*
 * PokéOne — model Pokémon trận (games/pokeone/art/poke/*.glb, data/pokes.js, tools/rip_poke.py).
 *
 * Chạy:  node test/pokeone-poke.js
 *        STRIPS=1,25:a1,a3 node test/pokeone-poke.js    thêm dải khung hình từng clip cho vài loài
 * Ảnh ra SHOTS (mặc định %TEMP%/pokeone-poke-shots): idle.png (mọi loài), role-<vai>.png (mỗi vai trò), strip-*.png.
 * Mở ra xem bằng mắt: màu thân, mắt/tròng, không mảng đen, không phần mất.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'pokeone');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-poke-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const REQUIRED = ['idle', 'attack', 'special', 'hit', 'faint'];
const NO_FAINT = [14];   // Kakuna: model gốc không có clip 17
const ROLE_FRAC = { idle: 0, appear: 0.5, roar: 0.5, attack: 0.45, special: 0.5, special2: 0.5, hit: 0.35, hit2: 0.35, faint: 1 };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
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
function dirSize(d) {
  return fs.readdirSync(d, { withFileTypes: true })
    .reduce((s, e) => s + (e.isDirectory() ? dirSize(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  await page.goto(base + '/games/pokeone/tools/poke-viewer.html');
  const n = await page.evaluate(() => V.ready);
  const pokes = await page.evaluate(() => P1.POKES);
  const dexes = Object.keys(pokes).map(Number);
  check('nạp đủ glb của data/pokes.js', n === dexes.length && n === 39, n + ' / ' + dexes.length);

  for (const dex of dexes) {
    const p = pokes[dex];
    const names = await page.evaluate(d => V.clipNames(d), dex);
    const missing = REQUIRED.filter(r => !p.clips[r] && !(r === 'faint' && NO_FAINT.includes(dex)));
    const dangling = Object.entries(p.clips).filter(([, c]) => !names.includes(c)).map(([r, c]) => r + '=' + c);
    if (missing.length || dangling.length) check('#' + dex + ' đủ vai trò, clip có trong glb', false, 'thiếu ' + missing + ' / không có ' + dangling);
    const shinyOk = Object.values(p.shiny).every(f => fs.existsSync(path.join(GAME, f)));
    if (!shinyOk) check('#' + dex + ' ảnh shiny tồn tại', false);
    const info = await page.evaluate(d => V.info(d), dex);
    const h = (info.max[1] - info.min[1]) / p.scale;   // viewer nhân scale như game
    if (Math.abs(h - p.height) > 0.02 || info.min[1] < -0.03) check('#' + dex + ' height khớp khung bao trong three, chân không lún dưới y=0', false,
      'three ' + h.toFixed(3) + ' / pokes.js ' + p.height + ', minY ' + info.min[1].toFixed(3));
    const matNames = new Set(info.mats.map(s => s.split(':')[0]));
    const orphan = Object.keys(p.shiny).filter(k => !matNames.has(k));
    if (orphan.length) check('#' + dex + ' khoá shiny trùng tên material trong glb', false, orphan.join(','));
    // mặt nhìn +Z: mắt (renderer Eye) nằm phía z dương của khung bao
  }
  check('mọi loài có idle/attack/special/hit/faint (Kakuna không có faint)', !out.some(l => l.includes('đủ vai trò')));
  check('height trong pokes.js = khung bao three ở khung 0 idle, chân ở y≈0', !out.some(l => l.includes('height khớp')));
  check('khoá shiny = tên material có trong glb, ảnh tồn tại', !out.some(l => l.includes('shiny')));

  // biểu cảm mắt: Bulbasaur nhắm mắt khi ngất (clip 17 hết clip), mở mắt khi idle
  const idleEye = await page.evaluate(() => V.visibleVariant(1, 'a0', 0, 'Eye'));
  const faintEye = await page.evaluate(() => V.visibleVariant(1, 'a17', 1, 'Eye'));
  check('Bulbasaur idle hiện đúng 1 biến thể mắt gốc', idleEye.length === 1 && idleEye[0] === 'Eye#0', JSON.stringify(idleEye));
  check('Bulbasaur cuối clip ngất đổi sang biến thể mắt khác', faintEye.length === 1 && faintEye[0] !== 'Eye#0', JSON.stringify(faintEye));

  await page.evaluate(() => V.grid('idle', 0));
  await page.locator('#wrap').screenshot({ path: path.join(SHOTS, 'idle.png') });
  for (const role of Object.keys(ROLE_FRAC)) {
    const none = await page.evaluate(([r, f]) => V.grid(r, f), [role, ROLE_FRAC[role]]);
    await page.locator('#wrap').screenshot({ path: path.join(SHOTS, 'role-' + role + '.png') });
    if (REQUIRED.includes(role)) check('sheet ' + role, none.filter(d => !(role === 'faint' && NO_FAINT.includes(d))).length === 0, 'thiếu ' + none);
  }
  if (process.env.STRIPS) {
    const [ds, cs] = process.env.STRIPS.split(':');
    for (const d of ds.split(',').map(Number)) for (const c of (cs || 'a0,a1,a3,a8,a9,a12,a13,a14,a17').split(',')) {
      await page.evaluate(([dd, cc]) => V.strip(dd, cc, 8), [d, c]);
      await page.locator('#wrap').screenshot({ path: path.join(SHOTS, 'strip-' + d + '-' + c + '.png') });
    }
  }

  const mb = dirSize(path.join(GAME, 'art', 'poke')) / 1e6;
  check('art/poke dưới 60 MB', mb < 60, mb.toFixed(1) + ' MB');
  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));

  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
