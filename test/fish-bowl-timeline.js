#!/usr/bin/env node
/* Timeline frames: tl.html seeks each cutscene to a few moments and saves PNGs (default scratchpad/tl). node test/fish-bowl-timeline.js [outDir] [tl:t,tl:t...] */
'use strict';
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/Users/tamph/AppData/Local/Temp/claude/D--survivor-web-hub/1a1efc39-4ce5-47df-85ca-c15395a4a193/scratchpad/tl';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png' };
const SHOTS = (process.argv[3] || 'Intro:2,Intro:7,Intro:10,Intro:20,Intro:30,Intro:36,Intro:42,Food Dispensing:4,Food Dispensing:12,Food Dispensing:18,FoodEating:2,Jump Targets:5,Jump Targets:20,Jump Targets:40,Glass Dropped:1,Glass Dropped:3,Female Fish Intro:4,Female Fish Intro:13,Female Fish Intro:22,Female Fish Intro:28,Female Fish Intro:34')
  .split(',').map(s => s.split(':'));
let fail = 0;

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
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/games/fish-bowl/tl.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('FAIL timeout'); process.exit(2); }, 175000);
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    page.on('pageerror', e => { console.log('  pageerror', e.message); fail++; });
    page.on('console', m => { if (m.type() === 'error') console.log('  console.error', m.text()); });
    for (const [tl, t] of SHOTS) {
      await page.goto(`${url}?tl=${encodeURIComponent(tl)}&t=${t}`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
      const file = path.join(OUT, `${tl.replace(/\W+/g, '')}-${t}.png`);
      await page.screenshot({ path: file });
      console.log(`  shot ${file}`);
    }
  } finally {
    clearTimeout(kill);
    await browser.close();
    srv.close();
  }
  console.log(fail ? `${fail} FAIL` : 'all PASS');
  process.exit(fail ? 1 : 0);
})();
