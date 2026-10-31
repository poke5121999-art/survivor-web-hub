#!/usr/bin/env node
/* Particle frames: fx.html simulates each effect for a moment and saves PNGs (default scratchpad/fx).
   node test/fish-bowl-particles.js [outDir] [name,name...]   -- fails on page errors, a missing system or an empty frame */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/Users/tamph/AppData/Local/Temp/claude/D--survivor-web-hub/1a1efc39-4ce5-47df-85ca-c15395a4a193/scratchpad/fx';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png' };
const ESS = 'ActivityManager/Activities/<--- Essentials --->/spongefilter/BubbleRisingUnderwater';
const V5 = 'ActivityManager/Activities/Level 5/Task 1 (Perform Gestures Task)/VictoryParticles';
// name -> fx.html query; minLive = particles that must be alive in the frame
const SHOTS = {
  bubbles: { q: { fx: 'spongefilter/BubbleRisingUnderwater', look: ESS, d: 3, h: 1, yaw: 180, t: 6 }, minLive: 10 },
  crunch: { q: { fx: 'crunch', hide: 1, t: 0.25 }, minLive: 3 },
  splash: { q: { fx: 'splash', hide: 1, t: 0.4 }, minLive: 3 },
  flop: { q: { fx: 'flop', hide: 1, t: 0.3 }, minLive: 1 },
  slam: { q: { fx: 'Player/CartoonyBodySlam', look: 'Player/CartoonyBodySlam', hide: 1, d: 2.5, t: 0.3 }, minLive: 3 },
  victory: { q: { fx: `${V5}/Great`, look: `${V5}/Great`, hide: 1, d: 6, h: 0, t: 0.8 }, minLive: 1 },
  victory2: { q: { fx: `${V5}/Perfect`, look: `${V5}/Perfect`, hide: 1, d: 6, h: 0, t: 0.8 }, minLive: 1 },
};
const only = (process.argv[3] || '').split(',').filter(Boolean);
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
  const url = `http://localhost:${srv.address().port}/games/fish-bowl/fx.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('FAIL timeout'); process.exit(2); }, 165000);
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    page.on('pageerror', e => { console.log('  pageerror', e.message); fail++; });
    page.on('console', m => { if (m.type() === 'error') console.log('  console.error', m.text()); });
    for (const [name, s] of Object.entries(SHOTS)) {
      if (only.length && !only.includes(name)) continue;
      await page.goto(`${url}?${new URLSearchParams(s.q)}`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 40000 });
      const live = await page.evaluate(() => window.__fx.fx.list.reduce((n, e) => n + e.n, 0));
      const file = path.join(OUT, `${name}.png`);
      await page.screenshot({ path: file });
      const ok = live >= s.minLive;
      if (!ok) fail++;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${live} live particles (need ${s.minLive}) ${file}`);
    }
  } finally {
    clearTimeout(kill);
    await browser.close();
    srv.close();
  }
  console.log(fail ? `${fail} FAIL` : 'all PASS');
  process.exit(fail ? 1 : 0);
})();
