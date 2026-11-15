// Renders the web app icons from the game itself: a mech close-up on the arena, square.
//   DTT_GL=gl-egl node tools/icons.js
// icon-192/512 and apple-touch-icon fill the frame; icon-maskable-512 keeps the mech inside the central 80% safe zone.
'use strict';
const { execFileSync } = require('child_process');
const { session, open, CHK, fs, path } = require('./lib.js');
const OUT = path.join(__dirname, '..', 'icons');
session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const ctx = await br.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
  const g = await open(br, base, 'manual&noaudio&autostart&spectate&seed=8&bots=hard&q=high&mech=trau', { ctx });
  for (const [name, dist] of [['any', 8.5], ['maskable', 11.5]]) {
    await g.page.evaluate((dist) => {
      const m = window.__G.match;
      for (const e of [document.getElementById('ui'), document.querySelector('a.hub')]) if (e) e.style.display = 'none';
      for (const u of m.units) { const far = u.id !== 0; u.x = u.px = far ? (u.team ? 24 : -24) : 0; u.z = u.pz = far ? -20 + u.id : 0; u.vx = u.vz = 0; }
      m.units[0].aim = -0.6; m.units[0].pa = -0.6;
      window.__setShot({ x: 0.4, y: 0.9, z: 0, dist, pitch: 38, yaw: 28 });
      for (let i = 0; i < 6; i++) window.__step(1, true);
    }, dist);
    await g.page.screenshot({ path: path.join(CHK, `icon-${name}-raw.png`) });
  }
  await g.close(); await ctx.close();
  execFileSync('python3', ['-I', '-c', `import sys
from PIL import Image
c, o = sys.argv[1], sys.argv[2]
def vig(im):
    # Darken toward the game's background green at the edges so the mech reads as the subject.
    w = im.width; mask = Image.radial_gradient('L').resize((w, w)).point(lambda v: int(max(0, v - 70) * 1.1))
    return Image.composite(Image.new('RGB', im.size, (11, 26, 13)), im, mask)
a = vig(Image.open(c + '/icon-any-raw.png').convert('RGB')); m = vig(Image.open(c + '/icon-maskable-raw.png').convert('RGB'))
for n, im in (('icon-512', a), ('icon-192', a), ('apple-touch-icon', a), ('icon-maskable-512', m)):
    s = {'icon-512': 512, 'icon-192': 192, 'apple-touch-icon': 180, 'icon-maskable-512': 512}[n]
    im.resize((s, s), Image.LANCZOS).save(o + '/' + n + '.png', optimize=True)`, CHK, OUT]);
  console.log('icons in', OUT);
});
