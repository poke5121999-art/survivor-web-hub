/*
 * Đồ nghề chung cho các script chụp ảnh thẻ hub (games/<id>/tools/thumb.js).
 * Ảnh thẻ là assets/thumbnails/<id>.png, 640x360, chụp từ game thật ở 1280x720 rồi thu nửa bằng PIL:
 * canvas WebGL không chụp được ở deviceScaleFactor < 1.
 * Playwright: PLAYWRIGHT_PATH ghi đè đường dẫn module.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.data': 'application/octet-stream', '.unityweb': 'application/octet-stream', '.br': 'application/octet-stream', '.gz': 'application/gzip' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        const headers = { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size };
        if (f.endsWith('.br')) headers['Content-Encoding'] = 'br';
        if (f.endsWith('.gz')) headers['Content-Encoding'] = 'gzip';
        res.writeHead(200, headers);
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

function browser() {
  const { chromium } = require(PW);
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}

// viewport.scale (vd 2) chụp nét hơn, để cắt một vùng nhỏ của game màn dọc rồi phóng lên thẻ.
async function openGame(br, base, id, query, viewport) {
  const vp = viewport || { width: 1280, height: 720 };
  const ctx = await br.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale || 1 });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  await page.goto(base + '/games/' + id + '/index.html' + (query ? '?' + query : ''));
  return { page, ctx, problems };
}

const PORTRAIT = `import sys
from PIL import Image, ImageFilter, ImageEnhance
shot = Image.open(sys.argv[1]).convert("RGB")
bg = shot.resize((640, round(640 * shot.height / shot.width)), Image.LANCZOS)
top = (bg.height - 360) // 2
bg = bg.crop((0, top, 640, top + 360)).filter(ImageFilter.GaussianBlur(18))
bg = ImageEnhance.Brightness(bg).enhance(0.55)
fg = shot.resize((round(360 * shot.width / shot.height), 360), Image.LANCZOS)
bg.paste(fg, ((640 - fg.width) // 2, 0))
bg.save(sys.argv[2], optimize=True)`;
const LANDSCAPE = 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").resize((640, 360), Image.LANCZOS).save(sys.argv[2], optimize=True)';

// Ảnh màn dọc (viewport hẹp hơn 16:9) được đặt giữa, hai bên là chính nó phóng to làm mờ, thay cho viền đen.
async function saveThumb(page, id, clip) {
  const out = path.join(ROOT, 'assets', 'thumbnails', id + '.png');
  const raw = out.replace(/\.png$/, '.raw.png');
  await page.screenshot(clip ? { path: raw, clip } : { path: raw });
  const vp = clip || page.viewportSize();
  execFileSync('python3', ['-c', vp.width / vp.height < 1.7 ? PORTRAIT : LANDSCAPE, raw, out]);
  fs.unlinkSync(raw);
  return out;
}

module.exports = { ROOT, serve, browser, openGame, saveThumb };
