#!/usr/bin/env node
/* Screenshot a page of games/cats-soup in a real browser once window.__ready is true.
 *   node test/cats-soup-shot.js "viewer.html?lib=probe" out.png [width height]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const [page0, out, w = 900, h = 700] = process.argv.slice(2);
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${srv.address().port}/games/cats-soup/${page0}`);
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  } catch (e) { errors.push('never ready'); }
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => window.__info || null);
  if (info) console.log(JSON.stringify(info));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
  console.log('shot', out);
  await browser.close();
  srv.close();
})();
