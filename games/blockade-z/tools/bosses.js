// The big bosses (js/bosses.js + js/boss-*.js): for each boss, every move is forced in turn against a god-mode
// player, screenshotted mid-move from a spot that frames the boss, and checked to hurt the player; then the boss
// is shot down and must burst. Usage: PLAYWRIGHT_PATH=<playwright-core> [BOSSES=dragon,ufo] node games/blockade-z/tools/bosses.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.bosses-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'boss@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?autostart=1&nolock=1&seed=7&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const ids = process.env.BOSSES ? process.env.BOSSES.split(',') : await page.evaluate('Object.keys(BZ.BOSS_KITS)');
    console.log('bosses', ids.join(','));
    // camera: stand back from the boss at a fixed bearing and look at its middle
    const frame = `const frame = (z, back = 1) => { const P = __G.player; const s = z.T.scale; const c = { x: z.pos.x, y: z.pos.y + 1.3 * s, z: z.pos.z }; const D = (7 + s * 3.2) * back;
      const fx = Math.sin(z.yaw + 0.55) * D; const fz = Math.cos(z.yaw + 0.55) * D; P.pos.set(c.x + fx, 0, c.z + fz); const lim = __G.world.HALF - 1.5; P.pos.x = Math.max(-lim, Math.min(lim, P.pos.x)); P.pos.z = Math.max(-lim, Math.min(lim, P.pos.z));
      const dx = c.x - P.pos.x; const dz = c.z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(c.y - 1.6, Math.hypot(dx, dz)); P.vel.set(0, 0, 0); };`;
    for (const id of ids) {
      const setup = await page.evaluate(`(() => { const G = __G; G.god = true; G.state = 'playing'; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
        const P = G.player; P.pos.set(0, 0, 12); P.hp = P.maxHp; P.alive = true;
        const z = G.zombies.spawn('${id}', 10, { x: 0, z: -6, dir: [0, 1], name: 't' }); if (!z) return { err: 'no spawn' };
        z.pos.set(0, z.pos.y, -6); __sim(0.5);
        const kit = BZ.BOSS_KITS['${id}']; const R = z.body.x['${id}'];
        return { name: z.T.name, scale: z.T.scale, hp: z.maxHp, moves: Object.keys(kit.moves), rig: !!(R && R.g.visible), hips: z.body.hips.visible, boxes: (G.zombies.kinds.boxes(z) || []).length, combos: kit.combos.length }; })()`);
      if (setup.err) { check(false, `${id}: ${setup.err}`); continue; }
      check(setup.rig && !setup.hips && setup.boxes >= 2, `${id} (${setup.name}): own body on, zombie body off, ${setup.boxes} hit boxes`);
      check(setup.moves.length >= 4 && setup.combos >= 3, `${id}: ${setup.moves.length} moves (${setup.moves.join(', ')}), ${setup.combos} combos`);
      for (const m of setup.moves) {
        const r = await page.evaluate(`(async () => { const G = __G; ${frame} const z = G.zombies.boss(); const P = G.player; G.state = 'playing';
          z.pos.x = 0; z.pos.z = -5; P.pos.set(7, 0, 5); P.hp = P.maxHp; P.alive = true; G.god = false; let taken = 0; const hp0 = P.hp;
          const on = ({ dmg }) => { taken += dmg; }; G.events.on('player:hurt', on);
          const B = G.zombies.kinds.bosses(); const kit = BZ.BOSS_KITS['${id}']; z.bs.queue = []; z.bs.cur = null; z.bs.rest = 99;
          const S = z.bs; const M = kit.moves['${m}'];
          const start = () => { S.cur = '${m}'; S.t = 0; S.data = {}; S.dur = M.dur || 1.5; if (M.start) M.start(z, S, P, B.ctx); };
          start(); let peak = { orbs: 0, beams: 0, warns: 0, rings: 0, beamGap: 0 }; let shot = false;
          for (let t = 0; t < (M.dur || 1.5) + 2.2; t += 1 / 30) {
            if (!S.cur && t < (M.dur || 1.5)) start();
            __sim(1 / 30); P.hp = Math.max(P.hp, 30); P.alive = true; if (G.state === 'dead') G.state = 'playing';
            const d = B.debug(); for (const k in peak) peak[k] = Math.max(peak[k], d[k]);
            if (!shot && S.cur === '${m}' && S.t > (M.dur || 1.5) * (M.shotAt || 0.6)) { shot = true; S.rest = 99; break; }
          }
          G.god = true; G.events.off && G.events.off('player:hurt', on);
          return { taken, peak, cur: S.cur, t: +S.t.toFixed(2) }; })()`);
        // freeze mid-move, frame the boss, shoot
        await page.evaluate(`(() => { const G = __G; ${frame} const z = G.zombies.boss(); const S = z.bs; const keep = S.t; frame(z); G.state = 'playing'; __sim(1 / 60); frame(z); __sim(1 / 60); G.state = 'paused'; for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); } })()`);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, `boss-${id}-${m}.png`) });
        // finish the move and measure damage over its whole length
        const r2 = await page.evaluate(`(() => { const G = __G; const z = G.zombies.boss(); const P = G.player; G.state = 'playing'; G.god = false; let taken = 0; let gap = 0; let beams = 0;
          const on = ({ dmg }) => { taken += dmg; }; G.events.on('player:hurt', on);
          const kit = BZ.BOSS_KITS['${id}']; const B = G.zombies.kinds.bosses(); const S = z.bs; const M = kit.moves['${m}'];
          for (let rep = 0; rep < 3 && taken === 0; rep++) {
            z.pos.x = 0; z.pos.z = -5; P.pos.set(5, 0, 0); P.vel.set(0, 0, 0);
            S.cur = '${m}'; S.t = 0; S.data = {}; S.dur = M.dur || 1.5; S.queue = []; if (M.start) M.start(z, S, P, B.ctx);
            for (let t = 0; t < (M.dur || 1.5) + 2.5; t += 1 / 30) { const x = P.pos.x; const zz = P.pos.z; __sim(1 / 30); P.pos.set(x, 0, zz); P.hp = Math.max(P.hp, 30); P.alive = true; if (G.state === 'dead') G.state = 'playing'; if (!S.cur) S.rest = 99; const d = B.debug(); gap = Math.max(gap, d.beamGap); beams = Math.max(beams, d.beams); }
          }
          G.god = true; return { taken, gap, beams }; })()`);
        check(r2.taken > 0 || M_NO_DMG.includes(`${id}.${m}`), `${id}.${m}: hurts a player standing still nearby (${Math.round(r2.taken)} dmg; peak ${JSON.stringify(r.peak)})`);
        if (r2.beams) check(r2.gap < 0.3, `${id}.${m}: the beam leaves the body part that fires it (root drifts at most ${r2.gap.toFixed(2)} m)`);
      }
      // the whole boss in an idle pose, then a combo runs by itself for a while
      await page.evaluate(`(() => { const G = __G; ${frame} const z = G.zombies.boss(); z.bs.cur = null; z.bs.rest = 99; G.state = 'playing'; __sim(0.6); frame(z, 1.15); __sim(1 / 60); frame(z, 1.15); __sim(1 / 60); G.state = 'paused'; })()`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, `boss-${id}-idle.png`) });
      const auto = await page.evaluate(`(() => { const G = __G; const z = G.zombies.boss(); const P = G.player; G.state = 'playing'; z.bs.rest = 0.2; const seen = new Set(); let chain = 0; let n0 = z.bs.n;
        P.pos.set(z.pos.x + 10, 0, z.pos.z + 6); for (let t = 0; t < 30; t += 1 / 30) { __sim(1 / 30); P.hp = P.maxHp; P.alive = true; if (z.bs.cur) seen.add(z.bs.cur); if (z.bs.queue.length) chain = Math.max(chain, z.bs.queue.length); }
        z.hp = z.maxHp * 0.4; for (let t = 0; t < 20; t += 1 / 30) { __sim(1 / 30); P.hp = P.maxHp; P.alive = true; if (z.bs.queue.length) chain = Math.max(chain, z.bs.queue.length + 0); }
        return { seen: [...seen], moves: z.bs.n - n0, chain, alive: z.alive }; })()`);
      check(auto.seen.length >= 3 && auto.chain >= 1, `${id}: picks combos on its own (${auto.moves} moves in 50 s, ${auto.seen.length} kinds, longest chain ${auto.chain + 1})`);
      // shoot it down: it must burst and leave nothing behind
      const end = await page.evaluate(`(() => { const G = __G; const z = G.zombies.boss(); G.zombies.damage(z, z.hp + 10, 'body', new G.THREE.Vector3(0, 0, -1), 1, {}); const died = !z.alive && !z.body.root.visible; __sim(1.5);
        const B = G.zombies.kinds.bosses(); return { died, now: z.type, boss: !!G.zombies.boss(), cur: z.bs && z.bs.cur, fx: B.debug() }; })()`);
      check(end.died && !end.boss, `${id}: dies and bursts (${JSON.stringify(end)})`);
      await page.evaluate(`(() => { __sim(3); })()`);
    }
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 4).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
const M_NO_DMG = [];
