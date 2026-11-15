// Shots and checks for the voxel town: every block of the town's own architecture (js/vox/buildings.js), the perimeter wall
// and gate, vehicles and props, each one at the same camera in the box town (?vox=0) | intact | after a grenade | falling |
// after its supports are blown out (collapse).
// Writes <out>/<name>-0-box.png, -1-intact.png, -2-grenade.png, -3-collapse.png and <out>/sheet-<name>.png (4 across),
// prints the town's numbers (regions, voxels, quads, solids) and a pathing check after several buildings are down.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [ONLY=name,name] [Q=low|medium] [NOPATH=1] node games/blockade-z/tools/voxtown.js [outDir]
'use strict';
const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const E = process['env'];
const OUT = process.argv[2] || path.join(__dirname, '..', '.vox-shots', 'all'); const Q = E.Q || 'medium';
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, +(E.TMO || 540000));
// name, camera [x, y, z, lookx, looky, lookz], grenade [x, y, z], collapse blasts [[x, y, z], ...]
const SUBJECTS = [
  ['shoprow-west', [-24, 6, 9, -25, 6, -9], [-28.6, 1, -5.4], [], [-33.4, -19, -14, -5.2]],
  ['apartment', [2, 9, -14, -11, 8, -28], [-5.6, 1.2, -27.5], [], [-15.8, -33.6, -5.9, -21.5]],
  ['pagoda', [-21, 8, -20.5, -29, 3, -29], [-29, 1.2, -24.5], [], [-33.4, -34, -24.4, -23.8]],
  ['gas', [14, 6, 3, 23, 2, -11], [23, 1, -8], [], [15, -16.8, 31, -5.6]],
  ['office', [10, 7, -19, 22, 5, -30], [22.3, 1.2, -24.2], [], [15.6, -34.2, 29, -23.7]],
  ['market', [-12, 7, -3, -24, 3, 14], [-25, 1, 7.6], [], [-33, 7, -17.2, 18.2]],
  ['cafe', [-2, 5, 4, -10, 4, 18], [-9.3, 1, 17.4], [], [-13.2, 17.6, -5.4, 23.8]],
  ['warehouse', [-6, 7, 15, 12, 3, 26], [5.4, 1.5, 25.6], [], [5.2, 19.8, 20, 31.5]],
  ['houses', [-13, 8, 17, -26, 4, 30], [-28.5, 1.2, 25.8], [], [-33.2, 25.6, -23.8, 34.6]],
  ['watertower', [-1, 8, 19, -8.4, 7, 30.4], [-8.4, 1, 27.6], [[-10.6, 1, 28.2], [-6.2, 1, 28.2], [-10.6, 1, 32.6], [-6.2, 1, 32.6]]],
  ['shoprow-east', [26, 6, -3, 27, 6, 9], [26.9, 1, 5.4], [], [19.4, 5.2, 34.4, 18.2]],
  ['wall', [-4, 5, 24, -12.4, 2, 36.5], [-12.4, 1.2, 35.9], [[-15, 1, 36.2], [-12.5, 1, 36.2], [-10, 1, 36.2]]],
  ['gate', [0, 4, 22, 0, 2.5, 36.5], [-3.4, 1.5, 36], [[-3.6, 1, 36.5], [3.6, 1, 36.5], [-3.5, 1, 40], [3.5, 1, 40]]],
  ['car', [2.5, 2.6, -19, -1.7, 0.8, -22.3], [0.4, 0.6, -22.3], [[-1.7, 0.8, -23], [-1.7, 0.8, -21.5]]],
  ['street', [-22, 3, 2, -27, 2, -4.5], [-27, 1, -4], [[-30, 1, -4], [-24, 1, -4]]],
  ['barrels', [18, 5, 26, 22.8, 1, 22.4], [24.6, 0.6, 22.4], []],
  ['tank', [3.5, 3.6, 13.5, 8.6, 1, 7.2], [8.6, 1.2, 9.2], [[7, 1, 7.2], [10, 1, 7.2]]],
  ['heli', [1, 4.5, -8, 7.6, 1.2, -16], [7.6, 1.5, -14.2], [[7.6, 1.2, -17], [8, 1, -13.5]]],
  ['plaza', [7, 4.2, 9, -1, 1, -1], [0.3, 1.4, 1.4], [[-7, 0.6, 4.2], [0, 1, 0]]],
];
const STAGE = `(() => { const G = __G; const P = G.player; G.god = true; G.state = 'playing';
  G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
  const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden'; for (const q of document.querySelectorAll('a.hub, .vx-wrap')) q.style.display = 'none';
  P.pos.set(0, 0, 44); P.yaw = 0; P.pitch = 0; P.vel.set(0, 0, 0); P.input.fire = false; P.touch.x = 0; P.touch.y = 0; G.camera.traverse((o) => { if (o !== G.camera) o.visible = false; });
  window.__vs = (t) => { G.state = 'playing'; __sim(t); G.state = 'paused'; }; __vs(0.3); })()`;
const CAM = (c, fov = 55) => `(() => { __G.state = 'paused'; const c = __G.camera; c.fov = ${fov}; c.updateProjectionMatrix(); c.position.set(${c[0]}, ${c[1]}, ${c[2]}); c.rotation.set(0, 0, 0); c.lookAt(${c[3]}, ${c[4]}, ${c[5]}); c.updateMatrixWorld(); __sim(0); })()`;
const BOOM = (p, R = 6.5, D = 400) => `__G.gear.explode(new THREE.Vector3(${p[0]}, ${p[1]}, ${p[2]}), ${R}, ${D})`;
const PATH = `(async () => { const G = __G; const W = G.world; const P = G.player;
  G.state = 'playing'; P.pos.set(0, 0, 0); G.zombies.clear(); G.wave.total = 999;
  const types = ['walker', 'walker', 'runner', 'walker', 'brute', 'walker']; let k = 0;
  for (const sp of W.spawns) for (let i = 0; i < 9; i++) { const z = (G.zombies.spawn(types[k++ % types.length], 3, sp) || G.zombies.spawn('walker', 3, sp)); if (z) { z.pos.x += (i % 3 - 1) * 1.2; z.pos.z += ((i / 3) | 0) * 1.2 * (sp.dir[1] || 0) * -1; } }
  const spots = [[0, 0], [-24, -12], [-10, -27], [23, -11], [-25, 12.5], [12, 26]]; const start = new Map(); const still = new Map(); let inside = 0; let samples = 0; let reached = 0; let maxStill = 0;
  for (let s = 0; s < 72; s++) { if (s % 12 === 0) { const q = spots[(s / 12) | 0]; P.pos.set(q[0], 0, q[1]); P.pos.y = 0; for (let i = 0; i < 20; i++) { const o = W.overlaps([P.pos.x - 0.3, P.pos.y + 0.05, P.pos.z - 0.3], [P.pos.x + 0.3, P.pos.y + 1.7, P.pos.z + 0.3]); if (!o) break; P.pos.y = o.max[1] + 0.02; } start.clear(); still.clear(); }
    __sim(0.5);
    for (const z of G.zombies.list) { if (!z.alive) continue; samples++;
      const m = [z.pos.x - 0.1, z.pos.y + 0.7, z.pos.z - 0.1]; const M = [z.pos.x + 0.1, z.pos.y + 1.2, z.pos.z + 0.1]; const o = W.overlaps(m, M); if (o && o.vox) inside++;
      const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z); if (d < 2) reached++;
      const k0 = start.get(z); if (!k0 || Math.hypot(z.pos.x - k0[0], z.pos.z - k0[1]) > 0.5 || d < 2.4) { start.set(z, [z.pos.x, z.pos.z]); still.set(z, 0); } else { const v = (still.get(z) || 0) + 0.5; still.set(z, v); if (v > maxStill) maxStill = v; } }
    if (s % 4 === 3) await new Promise((r) => setTimeout(r, 0)); }
  const stuck = [...still.values()].filter((v) => v >= 3).length;
  return { alive: G.zombies.aliveCount(), stuckFor3sAtEnd: stuck, longestStillSec: maxStill, samplesInsideVoxelWall: inside, samples, reachedPlayerSamples: reached, flow: W.flowStats().map((f) => f.reach + '/' + f.open).join(' ') }; })()`;

(async () => {
  const srv = await serve();
  const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const problems = {}; const only = E.ONLY ? E.ONLY.split(',') : null; const subjects = SUBJECTS.filter((s) => !only || only.includes(s[0]));
  fs.mkdirSync(OUT, { recursive: true });
  try {
    for (const mode of ['box', 'vox']) {
      const ctx = await br.newContext({ viewport: { width: 800, height: 600 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'voxtown@test' })); } catch (e) {} });
      const page = await ctx.newPage(); const bad = (problems[mode] = []);
      page.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) bad.push('console: ' + m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(srv.base + '/games/blockade-z/index.html?lang=vi&tp=1&autostart=1&nolock=1&noaudio=1&seed=4&hero=mua&tod=0.45&weather=clear&q=' + Q + (mode === 'box' ? '&vox=0' : '') + (E.EXTRA || ''));
      await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
      const ev = (s) => page.evaluate(s);
      const snap = async (name) => { await ev("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }"); await page.waitForTimeout(120); await page.screenshot({ path: path.join(OUT, name + '.png') }); };
      await ev(STAGE);
      if (mode === 'vox') { const d = await ev('(() => { const d = __G.vox.street.debug(); d.heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0; d.draws = __stats.draws; d.tris = __stats.tris; return d; })()'); console.log('town ' + Q + ' loaded in ' + (Date.now() - t0) + ' ms: ' + JSON.stringify(d)); }
      for (const [name, cam, gren, blasts0, ring] of subjects) {
        const blasts = blasts0.slice(); // a ring: blasts every 2.4 m along the footprint's walls
        if (ring) { const [x0, z0, x1, z1] = ring; for (let x = x0 + 0.4; x <= x1; x += 2.4) blasts.push([x, 1.1, z0 + 0.2], [x, 1.1, z1 - 0.2]); for (let z = z0 + 1.6; z < z1 - 1; z += 2.4) blasts.push([x0 + 0.2, 1.1, z], [x1 - 0.2, 1.1, z]); }
        await ev(CAM(cam));
        if (mode === 'box') { await snap(name + '-0-box'); continue; }
        await snap(name + '-1-intact');
        await ev(BOOM(gren, 5.5, 240)); await ev('__vs(2.2)'); await ev(CAM(cam)); await snap(name + '-2-grenade');
        for (const b of blasts) { await ev(BOOM(b)); await ev('__vs(0.12)'); }
        await ev('__vs(1.0)'); await ev(CAM(cam)); await snap(name + '-3a-falling');
        await ev('__vs(6)'); await ev(CAM(cam)); await snap(name + '-3-collapse');
        const d = await ev('(() => { const d = __G.vox.street.debug(); return { awake: d.awake, bodies: d.bodies, debris: d.debris, shatters: d.shatters, chunks: d.chunks, solids: d.solids, rebuildMs: d.rebuildMs }; })()'); console.log(name + ' ' + JSON.stringify(d));
      }
      if (mode === 'vox' && !E.NOPATH) {
        await ev('__vs(8)');
        const d = await ev('(() => { const d = __G.vox.street.debug(); return { awake: d.awake, bodies: d.bodies, debris: d.debris, shatters: d.shatters, liveChunks: d.chunks, solids: d.solids, cmds: d.cmds, draws: __stats.draws, tris: __stats.tris }; })()'); console.log('after all ' + JSON.stringify(d));
        const p = await ev(PATH); console.log('path ' + JSON.stringify(p));
      }
      await ctx.close();
    }
    const py = `
import sys
from PIL import Image
out, names = sys.argv[1], sys.argv[2].split(',')
for n in names:
    ims = []
    for s in ['0-box', '1-intact', '2-grenade', '3a-falling', '3-collapse']:
        try: ims.append(Image.open(out + '/' + n + '-' + s + '.png').convert('RGB'))
        except Exception as e: pass
    if not ims: continue
    w, h = ims[0].size
    sheet = Image.new('RGB', (w * len(ims), h))
    for i, im in enumerate(ims): sheet.paste(im, (i * w, 0))
    sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    sheet.save(out + '/sheet-' + n + '.png')
`;
    try { execFileSync('python', ['-c', py, OUT, subjects.map((s) => s[0]).join(',')], { stdio: 'inherit', timeout: 120000 }); } catch (e) { console.log('sheet step failed: ' + e.message); }
  } catch (e) { console.log('FAIL ' + (e && e.stack || e)); }
  finally { await br.close(); srv.close(); clearTimeout(kill); }
  for (const [k, v] of Object.entries(problems)) console.log('problems ' + k + ': ' + v.length + (v.length ? '\n  ' + v.slice(0, 6).join('\n  ') : ''));
})();
