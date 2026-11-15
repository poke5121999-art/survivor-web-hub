// Before / after sheets for the voxel characters: every hero (third person, holding a weapon; Sói also in beast form),
// every zombie and monster type and every boss (intact, hit, dying), and the first-person viewmodel of a few weapons,
// each shot once with ?vox=0 (the old box look) and once in the default voxel look, at the same camera.
// Writes <out>/old/*.png, <out>/vox/*.png and sheets <out>/sheet-heroes.png, sheet-zombies.png, sheet-bosses.png, sheet-weapons.png
// (each cell: old | voxel). Also prints the count of voxel pieces per subject and any console error.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/voxchars.js [outDir]   (ONLY=heroes,zombies,bosses,weapons)
'use strict';
const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const E = process['env'];
const OUT = process.argv[2] || path.join(__dirname, '..', '.vox-shots', 'all', 'chars');
const ONLY = new Set((E.ONLY || 'heroes,zombies,bosses,weapons').split(','));
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 540000);
const SIG = { thep: 'longsword', yta: 'dualpistol', mua: 'minigun', bong: 'shuriken', phao: 'bazooka', bang: 'spear', sam: 'javelin', doc: 'glaive', hoa: 'fists', gio: 'katana', ky: 'shotgun', soi: 'claws', nhen: 'webbow' };

const STAGE = `(() => { const G = __G; const P = G.player; G.god = true; G.tps.on = false; G.state = 'playing';
  G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
  const h = document.getElementById('hud'); if (h) h.style.visibility = 'hidden'; for (const q of document.querySelectorAll('a.hub, #vox-chip, .vox-chip, #vox-ui')) q.style.display = 'none';
  if (!G.weapons.__render) { G.weapons.__render = G.weapons.render; G.weapons.render = () => {}; }
  // a clean backdrop: the town is hidden, a plain floor stands in for it (the subject stands at z = 6)
  for (const c of G.scene.children) if (c === G.world.group || c.name === 'vox-town') c.visible = false;
  if (!window.__floor) { window.__floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a8478 })); window.__floor.receiveShadow = true; G.scene.add(window.__floor); }
  P.pos.set(0, 0, 40); P.yaw = 0; P.pitch = 0; P.vel.set(0, 0, 0); P.input.fire = false; window.__vs = (t) => { G.state = 'playing'; __sim(t); G.state = 'paused'; }; __vs(0.3); })()`;
const CAM = (x, y, z, lx, ly, lz, fov = 40) => `(() => { __G.state = 'paused'; const c = __G.camera; c.fov = ${fov}; c.updateProjectionMatrix(); c.position.set(${x}, ${y}, ${z}); c.rotation.set(0, 0, 0); c.lookAt(${lx}, ${ly}, ${lz}); c.updateMatrixWorld(); __sim(0); })()`;

(async () => {
  const srv = await serve();
  const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const problems = {}; const lists = {};
  try {
    for (const mode of ['old', 'vox']) {
      const dir = path.join(OUT, mode); fs.mkdirSync(dir, { recursive: true });
      const ctx = await br.newContext({ viewport: { width: 800, height: 600 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'voxchars@test' })); } catch (e) {} });
      const page = await ctx.newPage(); const bad = (problems[mode] = []);
      page.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) bad.push('console: ' + m.text().slice(0, 300)); });
      await page.goto((E.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&autostart=1&nolock=1&noaudio=1&seed=4&tod=0.45&weather=clear&q=medium' + (mode === 'old' ? '&vox=0' : '') + (E.EXTRA || ''));
      await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
      const ev = (s) => page.evaluate(s);
      const snap = async (name) => { await ev("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }"); await page.waitForTimeout(90); await page.screenshot({ path: path.join(dir, name + '.png') }); };
      await ev(STAGE);
      const L = (lists[mode] = { heroes: [], zombies: [], bosses: [], weapons: [], pieces: {} });

      // ---- heroes: a model of each in the plaza, weapon in hand, standing pose ----
      if (ONLY.has('heroes')) {
        const ids = await ev('BZ.HEROES.map((h) => h.id)');
        const shots = ids.map((id) => [id, SIG[id] || 'rifle', 0]).concat([['soi', 'claws', 1]]);
        for (const [id, wid, beast] of shots) {
          const name = 'hero-' + id + (beast ? '-beast' : '');
          const n = await ev(`(() => { const G = __G; const m = BZ.heroModel('${id}'); window.__hm && G.scene.remove(window.__hm.root); window.__hm = m; m.root.position.set(0, 0, 6); m.root.rotation.y = 0.35; G.scene.add(m.root);
            BZ.equipWeapon(m, '${wid}'); const W = BZ.WEAPONS['${wid}']; const s = { speed: 0, mode: W && W.melee ? 'melee' : 'gun', pitch: 0 };
            for (let i = 0; i < ${beast ? 200 : 40}; i++) BZ.animHero(m, s, 1 / 60);
            let n = 0; m.root.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.vox) n++; }); return n; })()`);
          L.pieces[name] = n;
          await ev(CAM(1.15, 1.35, 9.1, 0, 0.98, 6, 40)); await snap(name); L.heroes.push(name);
        }
        await ev('window.__hm && __G.scene.remove(window.__hm.root)');
      }

      // ---- zombies, monsters, the old bosses; then the boss kits ----
      const types = await ev('Object.keys(BZ.ZOMBIES)'); const kits = await ev('Object.keys(BZ.BOSS_KITS)');
      for (const t of types) {
        const isKit = kits.includes(t);
        if (isKit ? !ONLY.has('bosses') : !ONLY.has('zombies')) continue;
        const info = await ev(`(() => { const G = __G; G.zombies.clear(); const T = BZ.ZOMBIES['${t}']; const z = G.zombies.spawn('${t}', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (!z) return null;
          z.pos.set(0, T.fly ? 1.2 * T.scale : 0, 6); z.yaw = 0.35; z.speed = 0.0001; z.dmg = 0; z.attackT = 99; z.cd = 99; z.cd2 = 99; z.hatch = 99; if (!z.T.boss) z.maxHp = 400; z.hp = 1e6; window.__z = z; __vs(0.35); z.pos.x = 0; z.pos.z = 6; z.body.root.position.copy(z.pos); __vs(0.02);
          const b = new THREE.Box3(); z.body.root.updateMatrixWorld(true); z.body.root.traverse((o) => { if (!o.isMesh || o.isInstancedMesh) return; for (let p = o; p; p = p.parent) if (!p.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }); if (b.isEmpty()) b.setFromObject(z.body.root); const c = b.getCenter(new THREE.Vector3()); const sz = b.getSize(new THREE.Vector3());
          let n = 0; z.body.root.traverse((o) => { if (o.isMesh && o.visible && o.material && o.material.userData && o.material.userData.vox) n++; });
          return { c: [c.x, c.y, c.z], h: Math.max(sz.y, sz.x * 0.8, 1), n, scale: T.scale }; })()`);
        if (!info) { bad.push('no spawn ' + t); continue; }
        const big = isKit || ['giant', 'thrower', 'phantom', 'queen', 'brood'].includes(t);
        const grp = big ? 'bosses' : 'zombies'; const d = Math.min(30, info.h * 1.9 + 0.6);
        const cam = CAM(info.c[0] + d * 0.42, info.c[1] + info.h * 0.12, info.c[2] + d, info.c[0], info.c[1], info.c[2], 42);
        L.pieces[t] = info.n;
        await ev(cam); await snap(grp + '-' + t + '-1intact'); L[grp].push(grp + '-' + t + '-1intact');
        await ev(`(() => { const G = __G; const z = __z; const d = new THREE.Vector3(-0.35, 0, -1).normalize(); for (const [p, a] of [['body', 0.25], ['head', 0.2], ['body', 0.3], ['leg', 0.2], ['body', 0.2]]) G.zombies.damage(z, a * (z.T.boss ? 3600 : 240), p, d.clone(), 0.03, { net: true, by: 'x' }); z.down = 0; z.vel.set(0, 0, 0); __vs(0.3); })()`);
        await ev(cam); await snap(grp + '-' + t + '-2hit'); L[grp].push(grp + '-' + t + '-2hit');
        await ev(`(() => { const G = __G; const z = __z; G.zombies.kill(z, 'body', new THREE.Vector3(0.2, 0, -1).normalize(), { gore: null, net: true }); __vs(${big ? 0.3 : 0.55}); })()`);
        await ev(cam); await snap(grp + '-' + t + '-3dying'); L[grp].push(grp + '-' + t + '-3dying');
        await ev('(() => { const G = __G; G.zombies.clear(); if (G.fx.clear) G.fx.clear(); if (G.vox && G.vox.pool) G.vox.pool.reset(); __vs(0.02); })()');
      }

      // ---- first-person viewmodels and one third-person close-up of a held gun ----
      if (ONLY.has('weapons')) {
        await ev('if (__G.weapons.__render) { __G.weapons.render = __G.weapons.__render; __G.weapons.__render = null; }');
        for (const id of ['mua', 'thep', 'yta', 'bang', 'soi', 'nhen', 'ky']) {
          await ev(`(() => { const G = __G; __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${id}')); __select.go(); __sim(0.2); G.state = 'playing'; G.tps.on = false; G.god = true;
            G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); const P = G.player; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.04; P.vel.set(0, 0, 0); P.input.fire = false; __sim(0.8); G.state = 'paused'; __sim(0); })()`);
          const name = 'weapons-fp-' + id; await snap(name); L.weapons.push(name);
          await ev(`(() => { const G = __G; G.state = 'playing'; G.tps.on = true; __sim(0.5); G.state = 'paused'; const P = G.player; const c = G.camera; c.position.set(P.pos.x + 1.3, P.pos.y + 1.45, P.pos.z - 1.7); c.lookAt(P.pos.x, P.pos.y + 1.15, P.pos.z - 0.3); c.updateMatrixWorld(); __sim(0); })()`);
          const n2 = 'weapons-tp-' + id; await snap(n2); L.weapons.push(n2);
        }
      }
      const dbg = await ev("({ errs: (window.__errors || []).slice(0, 8), zombie: __G.vox && __G.vox.zombie ? __G.vox.zombie.debug() : null, stats: BZ.vox && BZ.vox.stats ? BZ.vox.stats : null })");
      console.log(mode, JSON.stringify(dbg), 'problems', bad.length, bad.slice(0, 6).join(' | '));
      console.log(mode, 'voxel pieces', JSON.stringify(L.pieces));
      await ctx.close();
    }
  } finally { await br.close(); srv.close(); }
  // sheets: each cell is old | voxel side by side, labelled
  const py = `
import sys, os, json
from PIL import Image, ImageDraw
out = sys.argv[1]; lists = json.loads(open(os.path.join(out, 'lists.json')).read())
for grp, cols in [('heroes', 4), ('zombies', 3), ('bosses', 3), ('weapons', 2)]:
    names = lists.get(grp) or []
    if not names: continue
    W, H = 400, 300; CW = W * 2 + 6; CH = H + 22
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new('RGB', (CW * cols + 8 * (cols - 1), CH * rows), (20, 16, 12)); d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        x = (i % cols) * (CW + 8); y = (i // cols) * CH
        for j, mode in enumerate(['old', 'vox']):
            p = os.path.join(out, mode, n + '.png')
            if os.path.exists(p): sheet.paste(Image.open(p).convert('RGB').resize((W, H)), (x + j * (W + 6), y + 20))
        d.text((x + 4, y + 4), n + '   (old | voxel)', fill=(240, 220, 160))
    sheet.save(os.path.join(out, 'sheet-' + grp + '.png')); print('sheet', grp, len(names))
`;
  fs.writeFileSync(path.join(OUT, 'lists.json'), JSON.stringify(lists.vox || lists.old || {}));
  fs.writeFileSync(path.join(OUT, '_sheet.py'), py);
  try { console.log(execFileSync('python', [path.join(OUT, '_sheet.py'), OUT], { encoding: 'utf8' })); } catch (e) { console.log('sheet failed', e.message); }
  const errs = (problems.old || []).length + (problems.vox || []).length;
  console.log(errs ? 'FAIL console errors ' + errs : 'PASS no console errors');
  clearTimeout(kill); process.exit(errs ? 1 : 0);
})();
