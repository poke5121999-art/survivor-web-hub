#!/usr/bin/env node
/* Fish Bowl world renderer (games/fish-bowl/view.html) in a real browser: loads env + player, looks through a few
 * scene cameras, saves PNGs for a human look and fails when a frame is mostly one colour (nothing drawn).
 *   node test/fish-bowl-render.js [outDir]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/Users/tamph/AppData/Local/Temp/claude/D--survivor-web-hub/1a1efc39-4ce5-47df-85ca-c15395a4a193/scratchpad/render';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png' };
const SHOTS = [
  ['room', 'Camera', ''],
  ['intro2', 'ActivityManager/Activities/Level 1/Timeline - Intro/Cameras/Intro Timeline vCam (2)', ''],
  ['aquarium', 'ActivityManager/Activities/Level 2/Timeline - Food Dispensing/Cameras/vCam', ''],
  ['tank', 'Camera', '&pos=-85,-8,-140&look=-85,-20,-181&fov=70'],
  ['tank-in', 'Camera', '&pos=-70,-15,-170&look=-90,-20,-182&fov=70'],
  ['timmy-kneel', 'ActivityManager/Activities/Level 1/Timeline - Intro/Cameras/Intro Timeline vCam (2)', '&pos=-57,-12,-175&look=-57,-12,-152.5&fov=85&pose=Kneeling Down@2.5'],
  ['timmy-talk', 'ActivityManager/Activities/Level 1/Timeline - Intro/Cameras/Intro Timeline vCam (2)', '&pos=-57,-12,-175&look=-57,-12,-152.5&fov=85&pose=TTB_talk1@1'],
  ['shelf', 'Camera', '&pos=-42,-10,-170&look=-42,-18,-189&fov=70'],
  ['inside', 'Camera', '&pos=-85,-16,-176&look=-70,-19,-185&fov=70'],
  ['inside-dirty', 'Camera', '&pos=-85,-16,-176&look=-70,-19,-185&fov=70&show=Post Processing/DirtyAquariumPP'],
  ['player', 'MainCamera/CameraStateManager/CM vcam1', ''],
];
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
  const url = `http://localhost:${srv.address().port}/games/fish-bowl/view.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('FAIL timeout'); process.exit(2); }, 170000);
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    page.on('pageerror', e => { console.log('  pageerror', e.message); fail++; });
    page.on('console', m => { if (m.type() === 'error') console.log('  console.error', m.text()); });
    for (const [name, cam, extra] of SHOTS) {
      await page.goto(`${url}?cam=${encodeURIComponent(cam)}${encodeURI(extra)}`);
      await page.waitForFunction(() => window.__fb && window.__fb.ready, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const file = path.join(OUT, `${name}.png`);
      await page.screenshot({ path: file });
      const st = await page.evaluate(() => {
        const c = document.createElement('canvas');
        const src = window.__fb.renderer.domElement;
        c.width = 96; c.height = 54;
        c.getContext('2d').drawImage(src, 0, 0, 96, 54);
        const d = c.getContext('2d').getImageData(0, 0, 96, 54).data, h = new Map();
        for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4); h.set(k, (h.get(k) || 0) + 1); }
        return { top: Math.max(...h.values()) / (96 * 54), found: window.__fb.found };
      });
      const ok = st.found && st.top < 0.8;
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}  (camera found ${st.found}, dominant colour ${(st.top * 100).toFixed(0)}%)  ${file}`);
      if (!ok) fail++;
    }
  } finally {
    clearTimeout(kill);
    await browser.close();
    srv.close();
  }
  console.log(fail ? `${fail} FAIL` : 'all PASS');
  process.exit(fail ? 1 : 0);
})();
