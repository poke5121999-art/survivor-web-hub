// tiny static server + headless Chrome launcher shared by the capture scripts (always closes both)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core');
const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm' };
export async function withLab(fn, { width = 1280, height = 720, query = 'harness', timeoutMs = 300000, gpu = false } = {}) {
  const server = http.createServer(async (req, res) => {
    try { const p = decodeURIComponent(req.url.split('?')[0]); const f = join(ROOT, p === '/' ? 'index.html' : p); const d = await readFile(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const args = ['--autoplay-policy=no-user-gesture-required', '--window-position=2000,100', '--enable-unsafe-swiftshader'];
  if (process.argv.includes('--swiftshader')) args.push('--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu');
  if (gpu) args.push('--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
  const killer = setTimeout(() => { console.error('TIMEOUT'); browser.close().catch(() => {}); server.close(); process.exit(2); }, timeoutMs);
  const logs = [];
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', e => logs.push('pageerror: ' + e.message));
    await page.goto(`http://127.0.0.1:${port}/index.html?${query}`);
    await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 60000 });
    return await fn(page, logs, port);
  } finally { clearTimeout(killer); await browser.close().catch(() => {}); server.close(); }
}
