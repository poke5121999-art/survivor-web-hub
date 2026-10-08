/*
 * Dùng chung cho các bài kiểm Vực Săn (games/vuc-san).
 * - serve(): máy chủ tĩnh trên gốc repo ở cổng 0, hoặc dùng VS_URL=<gốc> (vd Pages) nếu có.
 * - browser(): Chromium qua Playwright; PLAYWRIGHT_PATH ghi đè đường dẫn module.
 * - open(path): mở trang, gom pageerror / console error / requestfailed / response >= 400 vào problems.
 * - check(name, ok, detail): đếm PASS/FAIL; done() in tổng và đặt mã thoát.
 * - nodeSim(files): nạp các tệp data + sim vào một window giả trong Node (không trình duyệt).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'vuc-san');
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const SHOTS = process.env.VS_SHOTS || path.join(os.tmpdir(), 'vuc-san-shots');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
  return !!ok;
}
function done() {
  console.log('\n' + pass + ' pass, ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.bin': 'application/octet-stream' };

function serve() {
  if (process.env.VS_URL) return Promise.resolve({ base: process.env.VS_URL.replace(/\/$/, ''), close() {} });
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

async function browser(opts) {
  const { chromium } = require(PW);
  return chromium.launch(Object.assign({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }, opts || {}));
}

async function open(br, base, rel, viewport, extra) {
  const ctx = await br.newContext(Object.assign({ viewport: viewport || { width: 1366, height: 650 } }, extra || {}));
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  await page.goto(base + '/games/vuc-san/' + rel);
  return { page, ctx, problems };
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: f });
  return f;
}

// Nạp data + sim vào một ngữ cảnh Node có window giả. files: đường dẫn tương đối từ games/vuc-san/ hoặc '../ho-xanh/...'.
function nodeSim(files) {
  const win = { HX_ROOT: '../ho-xanh/' };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const rel of files) {
    const f = path.resolve(GAME, rel);
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  }
  return win;
}

// Thứ tự nạp mặc định cho bài kiểm mô phỏng trong Node (giống index.html, bỏ tầng vẽ và sảnh).
const SIM_FILES = [
  '../ho-xanh/data/zones.js', '../ho-xanh/data/shark_assets.js',
  'data/tuning.js', 'data/sharks.js', 'data/divers.js', 'data/skills.js', 'data/maps.js',
  'js/sim/rng.js', 'js/sim/geom.js', 'js/sim/vision.js', 'js/sim/actors.js', 'js/sim/skills.js', 'js/sim/match.js', 'js/sim/nav.js', 'js/sim/bots.js'
];

module.exports = { ROOT, GAME, SHOTS, check, done, serve, browser, open, shot, nodeSim, SIM_FILES };
