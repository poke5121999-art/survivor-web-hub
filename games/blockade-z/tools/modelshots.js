// Model review sheets: every hero (front idle, back, mid-run, mid-attack), every zombie kind or every boss, lined up
// on the plaza at noon under the same camera, so a before and an after can be laid side by side.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [SET=heroes|zombies|bosses] [ONLY=gio,thep] node games/blockade-z/tools/modelshots.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const OUT = process.argv[2] || '.chk-polish/models'; fs.mkdirSync(OUT, { recursive: true });
const SET = process.env.SET || 'heroes'; const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

// in the page: park the game in a state the loop leaves alone, clear the street, expose helpers
const STAGE = `(() => { const G = __G; G.state = 'shots'; G.wave.toSpawn = 0; G.wave.phase = 'idle'; G.zombies.clear(); G.fx.clear();
  for (const s of document.querySelectorAll('#hud, .screen, a.hub, #grade')) s.style.display = 'none';
  const T = G.THREE; window.__stage = { made: [],
    clear() { for (const o of this.made) G.scene.remove(o); this.made.length = 0; G.zombies.clear(); },
    cam(x, y, z, tx, ty, tz, fov) { const c = G.camera; c.position.set(x, y, z); c.fov = fov || 30; c.updateProjectionMatrix(); c.lookAt(tx, ty, tz); c.rotation.reorder('YXZ'); },
  }; return BZ.HEROES.map((h) => h.id); })()`;

(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: process.env.BZ_CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 1600, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'models@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('console ' + m.text().slice(0, 240)); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&autostart=1&nolock=1&god=1&noaudio=1&seed=5&tod=0.5&q=high&post=0&fp=1');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const ids = await page.evaluate(STAGE);
    const shot = async (name) => { await page.evaluate('__sim(0)'); await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot ' + name); };

    if (SET === 'heroes') {
      const list = ONLY || ids;
      // rows of up to seven; each pose: [name, yaw, state, seconds of animation to settle]
      const POSES = [['front', 0.35, { speed: 0, mode: 'hold' }, 0.6], ['back', Math.PI - 0.5, { speed: 0, mode: 'hold' }, 0.6], ['run', 0.9, { speed: 5.5, mode: 'hold', sprint: false }, 0.5], ['attack', 0.5, { speed: 0, mode: 'hold', attack: true }, 0.6]];
      for (let r = 0; r < list.length; r += 5) {
        const row = list.slice(r, r + 5);
        for (const [pose, yaw, st, secs] of POSES) {
          await page.evaluate(`(() => { const G = __G; const S = __stage; S.clear();
            const row = ${JSON.stringify(row)}; const st0 = ${JSON.stringify(st)};
            row.forEach((id, i) => { const h = BZ.HEROES.find((x) => x.id === id); const m = BZ.heroModel(id); const eq = BZ.equipWeapon(m, h.weapon);
              const W = G.weapons.WEAPONS[h.weapon]; const st = { ...st0, mode: BZ.holdOf(W), pitch: 0, swing: -1, kick: 0 };
              m.root.position.set((i - (row.length - 1) / 2) * 1.45, 0, 9); m.root.rotation.y = ${yaw}; G.scene.add(m.root); S.made.push(m.root);
              const n = Math.round(${secs} * 60); for (let k = 0; k < n; k++) { if (st0.attack) { if (W.melee || W.thrown) st.swing = Math.min(0.42, k / n * 0.8); else st.kick = k > n - 4 ? 1.2 : 0; } BZ.animHero(m, st, 1 / 60); }
              m.root.updateMatrixWorld(true); });
            S.cam(0, 1.3, 16.5, 0, 0.98, 9, 26); })()`);
          await shot('heroes-' + (r / 5 + 1) + '-' + pose);
        }
      }
    } else if (SET === 'zombies') {
      const types = await page.evaluate("Object.keys(BZ.ZOMBIES).filter((k) => !BZ.ZOMBIES[k].boss)");
      const list = ONLY || types; console.log('types ' + list.join(','));
      for (let r = 0; r < list.length; r += 6) {
        const row = list.slice(r, r + 6);
        for (const [pose, yaw, secs] of [['front', 0.4, 0.05], ['walk', 1.1, 1.3], ['back', Math.PI - 0.5, 0.05]]) {
          await page.evaluate(`(() => { const G = __G; const S = __stage; S.clear(); const row = ${JSON.stringify(row)};
            row.forEach((t, i) => { const x = (i - (row.length - 1) / 2) * 2.3; const z = G.zombies.spawn(t, 3, { x, z: 9, dir: [0, 1], name: 't' }); if (!z) return; z.pos.set(x, z.T.fly ? 1.2 : 0, 9); z.yaw = ${yaw}; z.hold = { x, yaw: ${yaw} }; });
            G.player.pos.set(0, 0, 60); G.state = 'playing';
            const n = Math.round(${secs} * 60); for (let k = 0; k < n; k++) { __sim(1 / 60); for (const z of G.zombies.list) if (z.alive && z.hold) { z.pos.x = z.hold.x; z.pos.z = 9; z.pos.y = z.T.fly ? 1.2 : 0; z.yaw = z.hold.yaw; z.vel.x = Math.sin(z.yaw) * 1.2 * ${secs > 0.1 ? 1 : 0}; z.vel.z = Math.cos(z.yaw) * 1.2 * ${secs > 0.1 ? 1 : 0}; } }
            G.state = 'shots'; for (const z of G.zombies.list) if (z.alive && z.hold) { z.body.root.position.set(z.hold.x, z.pos.y, 9); z.body.root.rotation.y = z.hold.yaw; }
            if (G.tps.on) dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); G.player.pitch = 1.5;
            S.cam(0, 1.5, 21, 0, 1.05, 9, 28); })()`);
          await shot('zombies-' + (r / 6 + 1) + '-' + pose);
        }
      }
    } else if (SET === 'bosses') {
      const types = await page.evaluate("Object.keys(BZ.ZOMBIES).filter((k) => BZ.ZOMBIES[k].boss)");
      const list = ONLY || types; console.log('bosses ' + list.join(','));
      for (const t of list) {
        for (const [pose, yaw] of [['front', 0.45], ['side', 1.5]]) {
          const info = await page.evaluate(`(() => { const G = __G; const S = __stage; S.clear();
            const z = G.zombies.spawn('${t}', 5, { x: 0, z: 9, dir: [0, 1], name: 't' }); if (!z) return null; z.pos.set(0, z.pos.y, 9); z.yaw = ${yaw};
            G.player.pos.set(0, 0, 80); G.state = 'playing'; for (let k = 0; k < 20; k++) { __sim(1 / 60); z.pos.x = 0; z.pos.z = 9; z.yaw = ${yaw}; if (z.bs) { z.bs.rest = 5; } }
            G.state = 'shots'; z.body.root.position.x = 0; z.body.root.position.z = 9; z.body.root.rotation.y = ${yaw};
            const s = z.T.scale || 1; const h = Math.max(2.4, 2.2 * s); const y0 = z.pos.y; S.cam(0, y0 + h * 0.6, 9 + h * 2.6, 0, y0 + h * 0.48, 9, 30); return { s, y: +y0.toFixed(1) }; })()`);
          if (info) await shot('boss-' + t + '-' + pose);
        }
      }
    }
  } finally { await br.close(); srv.close(); }
  console.log('MODELSHOTS DONE');
})().catch((e) => { console.error(e); process.exit(2); });
