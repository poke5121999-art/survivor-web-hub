// Shared: static server + Chrome (GPU) with hard timeouts. Every process this starts dies on its own timer.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core');
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
export function serve(port = 8790, life = 600000) {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('not found'); return; }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  }).listen(port);
  const t = setTimeout(() => { console.error('[pw] life timer hit, exiting'); process.exit(2); }, life); t.unref?.();
  return srv;
}
export async function launch() {
  return chromium.launch({ channel: 'chrome', headless: true, timeout: 60000, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
}
/** open a page, collect console errors, wait for window.__ready */
export async function open(browser, url, { w = 1280, h = 800, timeout = 90000 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (process.env.PWLOG) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await page.goto(url, { timeout });
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (errors.some((e) => e.startsWith('pageerror'))) break; if (await page.evaluate(() => window.__ready === true).catch(() => false)) break; await page.waitForTimeout(250); }
  return { page, errors };
}
