/*
 * PokéOne — prop bản đồ và cảnh màn đăng nhập (tools/rip_map.py -> art/map, art/title, data/props.js).
 *
 * Chạy:  node test/pokeone-props.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/pokeone-props-shots):
 *   grid-NN.png     lưới mọi prop đã chọn, nhãn tên + cỡ (ô lưới trắng = 1 đơn vị = 1 ô bản đồ)
 *   title-tNNN.png  đảo màn đăng nhập nhìn từ máy ảnh gốc ở vài giây của đường bay
 * Mở ra xem bằng mắt: lá cây phải cắt alpha, không lộn mặt, màu đúng như game.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-props-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary',
  '.css': 'text/css', '.json': 'application/json' };

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

function loadProps() {
  const P1 = {};
  new Function('window', 'P1', fs.readFileSync(path.join(ROOT, 'games/pokeone/data/props.js'), 'utf8'))({ P1 }, P1);
  return P1;
}

async function open(browser, url, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(url);
  await page.waitForFunction(() => window.VIEW && VIEW.ready, null, { timeout: 120000 });
  const viewErrors = await page.evaluate(() => VIEW.errors);
  return { page, errors: errors.concat(viewErrors) };
}

(async () => {
  const P1 = loadProps();
  const names = Object.keys(P1.PROPS || {});
  check('data/props.js có P1.PROPS', names.length >= 60, names.length + ' prop');
  const bad = names.filter(n => {
    const p = P1.PROPS[n];
    return !fs.existsSync(path.join(ROOT, 'games/pokeone', p.glb)) || p.min.length !== 3 || p.max.length !== 3 ||
      !p.max.every((v, i) => v >= p.min[i]) || !Array.isArray(p.tags) || !p.tags.length || !p.use;
  });
  check('mỗi prop có glb tồn tại, AABB hợp lệ, tags, use', bad.length === 0, bad.slice(0, 5).join(', '));
  const T = P1.TITLE_SCENE;
  check('P1.TITLE_SCENE có glb + camera + sky + light', !!(T && T.glb && T.camera && T.camera.path && T.sky && T.light),
    T ? T.glb : 'thiếu');

  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/games/pokeone/tools/props-viewer.html';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const per = 30, pages = Math.ceil(names.length / per);
    out.push('\n[grid 1600x1000]');
    for (let pg = 0; pg < pages; pg++) {
      const shot = await open(browser, base + '?mode=grid&per=' + per + '&page=' + pg, 1600, 1000);
      await shot.page.screenshot({ path: path.join(SHOTS, 'grid-' + String(pg).padStart(2, '0') + '.png') });
      await shot.page.close();
      // Nhìn từ trước (+z) và từ sau: mảng tường bờ nước một mặt chỉ thấy từ một phía.
      let info, cov = null, errs = shot.errors.slice();
      for (const yaw of [0, 180]) {
        const bare = await open(browser, base + '?mode=grid&nogrid=1&yaw=' + yaw + '&per=' + per + '&page=' + pg, 1600, 1000);
        info = await bare.page.evaluate(() => VIEW.info);
        const c = await bare.page.evaluate(r => VIEW.coverage(r.map(x => x.rect)), info.cells);
        cov = cov ? cov.map((v, i) => Math.max(v, c[i])) : c;
        errs = errs.concat(bare.errors);
        await bare.page.close();
      }
      const empty = info.cells.filter((c, i) => cov[i] < 0.01).map(c => c.n);
      check('trang ' + (pg + 1) + ': không lỗi trang/HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
      check('trang ' + (pg + 1) + ': ' + info.count + ' prop đều vẽ ra hình', empty.length === 0,
        empty.length ? 'ô trống: ' + empty.join(', ') : 'phủ thấp nhất ' + (Math.min(...cov) * 100).toFixed(1) + '%');
    }
    for (const [W, H] of [[1280, 720], [844, 390]]) {
      out.push('\n[title ' + W + 'x' + H + ']');
      for (const t of W === 1280 ? [0, 40, 80, 120, 150] : [0]) {
        const s = await open(browser, base + '?mode=title&t=' + t, W, H);
        await s.page.screenshot({ path: path.join(SHOTS, 'title-' + W + '-t' + String(t).padStart(3, '0') + '.png') });
        const cov = (await s.page.evaluate(() => VIEW.coverage()))[0];
        check('t=' + t + 's: không lỗi', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
        check('t=' + t + 's: khung hình có cảnh (khác màu góc ≥ 20%)', cov >= 0.2, (cov * 100).toFixed(0) + '%');
        await s.page.close();
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
