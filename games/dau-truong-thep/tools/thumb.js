// Renders the hub card thumbnail (640x360) from the game itself: both teams clashing on the plaza, HUD hidden.
//   DTT_GL=gl-egl node tools/thumb.js [ticks]
'use strict';
const { execFileSync } = require('child_process');
const { session, open, ROOT, CHK, fs, path } = require('./lib.js');
session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true });
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=8&bots=hard&q=high');
  await g.page.evaluate((ticks) => {
    const m = window.__G.match;
    document.getElementById('ui').style.display = 'none'; document.querySelector('a.hub').style.display = 'none';
    const spots = [[-7, -2], [-6.5, 3], [-11, 4.5], [-5, -7.5], [-8.5, 7]];
    for (const u of m.units) { const s = spots[u.slot]; u.x = u.px = u.team ? -s[0] : s[0]; u.z = u.pz = u.team ? -s[1] : s[1]; u.aim = u.team ? Math.PI : 0; u.cd.ult = 0; }
    window.__setShot({ x: 0, z: 1.2, dist: 27, pitch: 54, yaw: 0 });
    for (let i = 0; i < ticks; i++) window.__step(1, true);
  }, Number(process.argv[2] || 75));
  const big = path.join(CHK, 'thumb-1280.png');
  await g.page.screenshot({ path: big });
  const out = path.join(ROOT, 'assets', 'thumbnails', 'dau-truong-thep.png');
  execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").resize((640, 360), Image.LANCZOS).save(sys.argv[2], optimize=True)', big, out]);
  console.log('saved', out, JSON.stringify(await g.page.evaluate(() => window.__errors)));
  await g.close();
});
