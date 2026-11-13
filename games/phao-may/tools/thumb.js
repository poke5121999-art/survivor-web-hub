// Renders the hub card thumbnail (640x360) from the game itself: a shell in flight over the island, HUD hidden.
// Usage: PM_GL=gl-egl node games/phao-may/tools/thumb.js
'use strict';
const { execFileSync } = require('child_process');
const { session, open, ROOT, CHK, fs, path } = require('./lib.js');
session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true });
  const { page } = await open(br, base, 'noaudio=1&nogov=1&manual=1&q=high&autostart=1&seed=3');
  await page.evaluate(`(() => { const G = window.__G, s = G.sim; document.getElementById('hud').classList.add('off'); document.querySelector('a.hub').style.display = 'none';
    s.wind = 0; __tick(4); let at = null; G.bus.on('sim:boom', (e) => { at = at || e; });
    __fire({ angle: 52, power: 46, shot: 0 }); let g = 0; while (!at && g++ < 400) __tick(1); __tick(5);
    __setShot({ x: (at.x + s.units[0].x) / 2, y: (at.y + s.units[0].y) / 2 + 2, dist: Math.max(50, Math.abs(at.x - s.units[0].x) * 1.75) }); __step(2); })()`);
  const big = path.join(CHK, 'thumb-1280.png');
  await page.screenshot({ path: big });
  const out = path.join(ROOT, 'assets', 'thumbnails', 'phao-may.png');
  execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").resize((640, 360), Image.LANCZOS).save(sys.argv[2], optimize=True)', big, out]);
  console.log('saved', out);
});
