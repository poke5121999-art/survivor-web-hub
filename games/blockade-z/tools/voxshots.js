// Before / after shots for the voxel prototype (?vox=1): the hero (front, 3/4, mid-walk, mid-cast), the zombie
// (intact, damaged, losing a limb, dying), the street block (intact, after a grenade, after a collapse), every one at the
// same camera with and without the flag. Writes <out>/before/*.png, <out>/after/*.png and side-by-side sheets
// <out>/sheet-hero.png, sheet-zombie.png, sheet-street.png (before | after).
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/voxshots.js [outDir] [extra query for the "after" run]
'use strict';
const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const E = process['env'];
const OUT = process.argv[2] || path.join(__dirname, '..', '.vox-shots'); const EXTRA = process.argv[3] || '';
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 280000);

const STAGE = `(() => { const G = __G; const P = G.player; G.god = true; G.tps.on = true; G.state = 'playing';
  G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
  const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden'; for (const q of document.querySelectorAll('a.hub, #vox-chip, .vox-chip')) q.style.display = 'none';
  P.pos.set(0, 0, 9); P.yaw = 0; P.pitch = 0; P.vel.set(0, 0, 0); P.input.fire = false; P.touch.x = 0; P.touch.y = 0; window.__vs = (t) => { G.state = 'playing'; __sim(t); G.state = 'paused'; }; __vs(0.4); })()`;
const CAM = (x, y, z, lx, ly, lz, fov = 40) => `(() => { __G.state = 'paused'; const c = __G.camera; c.fov = ${fov}; c.updateProjectionMatrix(); c.position.set(${x}, ${y}, ${z}); c.rotation.set(0, 0, 0); c.lookAt(${lx}, ${ly}, ${lz}); c.updateMatrixWorld(); __sim(0); })()`;
const Z = (x, z) => `(() => { const G = __G; const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(${x}, 0, ${z}); z.speed = 0; z.dmg = 0; z.attackT = 99; z.hp = z.maxHp = 400; z.body.mats.shirt.map = BZ.tex('z_vest'); z.body.mats.pants.map = BZ.tex('z_pants'); z.voxLive = false; window.__z = z; __vs(0.25); })()`;

(async () => {
  const srv = await serve();
  const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const problems = {};
  try {
    for (const mode of ['before', 'after']) {
      const dir = path.join(OUT, mode); fs.mkdirSync(dir, { recursive: true });
      const ctx = await br.newContext({ viewport: { width: 960, height: 720 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'voxshots@test' })); } catch (e) {} });
      const page = await ctx.newPage(); const bad = (problems[mode] = []);
      page.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) bad.push('console: ' + m.text().slice(0, 300)); });
      await page.goto((E.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&tp=1&autostart=1&nolock=1&noaudio=1&seed=4&hero=mua&tod=0.45&weather=clear&q=medium' + (mode === 'after' ? '&vox=1' + EXTRA : ''));
      await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
      const ev = (s) => page.evaluate(s);
      const snap = async (name) => { await ev("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }"); await page.waitForTimeout(150); await page.screenshot({ path: path.join(dir, name + '.png') }); };
      const freeze = () => ev("__G.state = 'paused'");
      await ev(STAGE);
      // ---- hero ----
      await ev(CAM(0, 1.15, 5.9, 0, 1.0, 9)); await snap('hero-1-front');
      await ev(CAM(2.1, 1.5, 6.6, 0, 0.95, 9)); await snap('hero-2-threequarter');
      await ev("(() => { const P = __G.player; P.touch.y = -1; __vs(0.62); P.touch.y = 0; })()"); // walking toward the camera side
      await ev("(() => { const P = __G.player; const c = __G.camera; c.fov = 40; c.updateProjectionMatrix(); c.position.set(P.pos.x + 2.4, 1.3, P.pos.z - 1.6); c.rotation.set(0,0,0); c.lookAt(P.pos.x, 0.95, P.pos.z); c.updateMatrixWorld(); __sim(0); })()"); await snap('hero-3-walk');
      await ev(STAGE);
      await ev("(() => { const G = __G; G.hero.ult = 1; for (const k of ['s1', 's2']) { G.hero.slots[k].n = 2; G.hero.slots[k].cd = 0; } G.hero.use('s2'); __vs(0.2); })()");
      await ev(CAM(2.1, 1.5, 6.6, 0, 0.95, 9)); await snap('hero-4-cast');
      // ---- zombie ----
      await ev(STAGE); await ev("__G.player.pos.set(1.5, 0, 0.5)"); await ev(Z(0, 6));
      const ZC = CAM(1.3, 1.3, 3.3, 0, 0.95, 6);
      await ev(ZC); await snap('zombie-1-intact');
      await ev("(() => { const G = __G; const z = __z; const V3 = THREE.Vector3; const d = new V3(-0.25, 0, 1).normalize(); for (const [p, a] of [['body', 40], ['head', 30], ['body', 44], ['leg', 30]]) G.zombies.damage(z, a, p, d.clone(), 0.03, { net: true, by: 'x' }); z.down = 0; z.vel.set(0, 0, 0); __vs(0.45); })()");
      await ev(ZC); await snap('zombie-2-damaged');
      await ev("(() => { const G = __G; const z = __z; const d = new THREE.Vector3(-0.25, 0, 1).normalize(); if (z.vox) { for (let i = 0; i < 14 && z.body.armL.visible; i++) { z.hp = z.maxHp; G.zombies.damage(z, 30, 'body', d.clone(), 0.1, { net: true, by: 'x' }); } if (z.body.armL.visible) G.zombies.sever(z, 'armL', d, {}); } else G.zombies.sever(z, 'armL', d, {}); z.down = 0; __vs(0.22); })()");
      await ev(ZC); await snap('zombie-3-limb');
      await ev("(() => { const G = __G; const z = __z; G.zombies.kill(z, 'body', new THREE.Vector3(0.2, 0, 1).normalize(), { gore: null, net: true }); __vs(0.5); })()");
      await ev(ZC); await snap('zombie-4-dying');
      await ev('__vs(0.9)'); await ev(ZC); await snap('zombie-5-settled');
      // ---- street block ----
      await ev(STAGE); await ev("__G.player.pos.set(0, 0, 30)");
      const SC = CAM(-17.5, 6.5, 6.5, -24, 3.2, -9, 58);
      await ev(SC); await snap('street-1-intact');
      await ev("(() => { const G = __G; G.gear.explode(new THREE.Vector3(-24, 1.0, -5.4), 5.5, 220); __vs(0.25); })()"); await ev(SC); await snap('street-2-blast');
      await ev('__vs(3.2)'); await ev(SC); await snap('street-3-after-grenade');
      await ev("(() => { const G = __G; let i = 0; for (const [x, z] of [[-29, -6], [-26.4, -8], [-22, -6], [-19.5, -8], [-28, -12.5], [-24, -12.5], [-20, -12.5], [-30.6, -9.5], [-17.6, -9.5]]) { G.gear.explode(new THREE.Vector3(x, 1.2 + (i++ % 2) * 0.8, z), 6.5, 400); __vs(0.35); } })()");
      await ev(SC); await snap('street-4-collapsing');
      await ev('__vs(7)'); await ev(SC); await snap('street-5-collapsed');
      const info = await ev("({ errs: __errors.slice(0, 8), vox: !!(__G.vox), street: __G.vox && __G.vox.street ? __G.vox.street.debug() : null, zombie: __G.vox && __G.vox.zombie ? __G.vox.zombie.debug() : null })");
      console.log(mode, JSON.stringify(info), 'problems', bad.length, bad.slice(0, 5).join(' | '));
      await ctx.close();
    }
  } finally { await br.close(); srv.close(); }
  // side-by-side sheets: before | after, one row per shot
  const py = `
import sys, os
from PIL import Image, ImageDraw
out = sys.argv[1]
for grp in ['hero', 'zombie', 'street']:
    names = sorted(f for f in os.listdir(os.path.join(out, 'before')) if f.startswith(grp + '-'))
    if not names: continue
    W, H = 640, 480
    sheet = Image.new('RGB', (W * 2 + 12, (H + 26) * len(names) + 4), (20, 16, 12)); d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        for j, m in enumerate(['before', 'after']):
            p = os.path.join(out, m, n)
            if os.path.exists(p): sheet.paste(Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS), (j * (W + 12), i * (H + 26) + 24))
            d.text((j * (W + 12) + 6, i * (H + 26) + 6), n[:-4] + '  ' + ('before (boxes)' if j == 0 else 'after (?vox=1)'), fill=(244, 192, 74))
    sheet.save(os.path.join(out, 'sheet-' + grp + '.png')); print('sheet', grp, len(names))
`;
  try { console.log(execFileSync('python', ['-c', py, OUT], { encoding: 'utf8', env: { ...E, PYTHONIOENCODING: 'utf-8' } }).trim()); } catch (e) { console.log('sheet step failed: ' + (e.stderr || e.message)); }
  clearTimeout(kill);
})();
