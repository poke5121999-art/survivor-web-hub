// Views of the voxel town's own architecture (js/vox/buildings.js): one overview from above and one shot per block,
// plus the same camera in the box town (?vox=0) for a before/after sheet. Writes <out>/<name>-box.png, <name>-vox.png and
// <out>/sheet-town-1.png, sheet-town-2.png (each row: box | voxel).
// Usage: PLAYWRIGHT_PATH=<playwright-core> [Q=medium] [ONLY=a,b] [MODES=vox] node games/blockade-z/tools/voxviews.js [outDir]
'use strict';
const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const E = process['env']; const OUT = process.argv[2] || path.join(__dirname, '..', '.vox-shots', 'all', 'town'); fs.mkdirSync(OUT, { recursive: true });
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, +(E.TMO || 280000));
const VIEWS = [ // name, camera x y z, look x y z, fov
  ['overview', [0, 48, 26, 0, 0, 1], 70], ['overview-n', [0, 30, 34, 0, 4, -14], 60],
  ['shoprow-west', [-24, 4.5, 8, -25, 7.5, -8], 62], ['shoprow-east', [26, 5, -3.2, 27, 8, 9], 78],
  ['market', [-12, 7, -3, -24, 3, 14], 55], ['cafe', [-2, 4.5, 4, -10, 4, 18], 55], ['pagoda', [-21.5, 7, -21, -29, 3.5, -29], 60], ['apartment', [2.5, 8, -17, -11, 9, -28], 62],
  ['gas', [14, 5, 2, 23, 2.5, -11], 55], ['office', [10, 6, -19, 22, 5, -30], 58], ['warehouse', [-4, 6, 14, 12, 3, 26], 55], ['houses', [-13, 7, 17, -26, 4, 30], 55], ['yard', [18, 7, 22, 30, 2, 28], 55],
];
(async () => {
  const srv = await serve(); const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const only = E.ONLY ? E.ONLY.split(',') : null; const views = VIEWS.filter((v) => !only || only.includes(v[0])); const problems = {};
  try {
    for (const mode of (E.MODES || 'box,vox').split(',')) {
      const ctx = await br.newContext({ viewport: { width: 1000, height: 640 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'voxviews@test' })); } catch (e) {} });
      const page = await ctx.newPage(); const bad = (problems[mode] = []);
      page.on('pageerror', (e) => bad.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) bad.push('console: ' + m.text().slice(0, 300)); });
      await page.goto(srv.base + '/games/blockade-z/index.html?lang=vi&tp=1&autostart=1&nolock=1&noaudio=1&seed=4&hero=mua&tod=0.45&weather=clear&q=' + (E.Q || 'medium') + (mode === 'box' ? '&vox=0' : '') + (E.EXTRA || ''));
      await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
      await page.evaluate(`(() => { const G = __G; G.god = true; G.state = 'playing'; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear(); for (const q of document.querySelectorAll('#hud, a.hub, #banner, #announce')) q.style.visibility = 'hidden'; G.player.pos.set(0, 0, 44); __sim(0.4); G.state = 'paused'; })()`);
      if (mode === 'vox') console.log('town ' + JSON.stringify(await page.evaluate('(() => { const d = __G.vox.street.debug(); return { regions: d.regions, voxels: d.voxels, quads: d.quads, solids: d.solids, buildMs: d.buildMs, S: d.S, names: d.names.filter((n) => !/^(wall|prop|tree|motorbike|lamp|car|stools|poles|kiosk|barrels)/.test(n)).join(" ") }; })()')));
      for (const [name, c, fov] of views) {
        await page.evaluate(`(() => { const c = __G.camera; c.fov = ${fov}; c.far = Math.max(c.far, 400); c.updateProjectionMatrix(); c.position.set(${c[0]}, ${c[1]}, ${c[2]}); c.rotation.set(0, 0, 0); c.lookAt(${c[3]}, ${c[4]}, ${c[5]}); c.updateMatrixWorld(); __sim(0); })()`);
        await page.waitForTimeout(120); await page.screenshot({ path: path.join(OUT, name + '-' + mode + '.png') });
      }
      await ctx.close();
    }
    const py = `
import sys
from PIL import Image
out, names = sys.argv[1], sys.argv[2].split(',')
for part in range(0, len(names), 5):
    rows = []
    for n in names[part:part + 5]:
        ims = []
        for m in ['box', 'vox']:
            try: ims.append(Image.open(out + '/' + n + '-' + m + '.png').convert('RGB').resize((750, 480), Image.LANCZOS))
            except Exception as e: pass
        if not ims: continue
        r = Image.new('RGB', (750 * len(ims), 480))
        for i, im in enumerate(ims): r.paste(im, (i * 750, 0))
        rows.append(r)
    if not rows: continue
    sh = Image.new('RGB', (max(r.width for r in rows), 480 * len(rows)))
    for i, r in enumerate(rows): sh.paste(r, (0, i * 480))
    sh.save(out + '/sheet-town-' + str(part // 5 + 1) + '.png')
`;
    try { execFileSync('python', ['-c', py, OUT, views.map((v) => v[0]).join(',')], { stdio: 'inherit', timeout: 120000 }); } catch (e) { console.log('sheet step failed: ' + e.message); }
  } catch (e) { console.log('FAIL ' + (e && e.stack || e)); }
  finally { await br.close(); srv.close(); clearTimeout(kill); }
  for (const [k, v] of Object.entries(problems)) console.log('problems ' + k + ': ' + v.length + (v.length ? '\n  ' + v.slice(0, 6).join('\n  ') : ''));
})();
