// Bot in the real page: index.html?bot (js/sim/bot.js drives the player through sim.input / sim.action) fast-forwards
// MINUTES simulated minutes (default 10). Every 0.5 s of sim time the scene is compared with the sim:
//   - one egg/brainrot mesh per sim item, at the item's location (nest, ground, carried, stowed = hidden, farm), no orphans
//   - a carried item sits above its carrier (at the carry anchor)
//   - the player and the rivals face the way they walk
// Stalls (no coin, farm or item progress for 120 s, from the bot itself) are logged. At the end a 1280x720 gameplay frame
// with the player near the farm and its brainrots is written to shots/thumb.png.
//   node test/bot-browser.js        MINUTES=20 SEED=5 node test/bot-browser.js
'use strict';
const { run, openPage } = require('./harness');

const MINUTES = +(process.env.MINUTES || 10);
const SEED = +(process.env.SEED || 1);

run('bot-browser', async ({ browser, base, shot, check }) => {
  const { page, errors } = await openPage(browser, `${base}/index.html?fresh&mute&bot&seed=${SEED}`);
  await page.evaluate(() => {
    const g = window.__game;
    window.__bb = { prev: null, facingBad: 0, bad: [], checks: 0, facing: 0, carried: 0, n: {} };
    g.sim.listeners.push(e => { const n = window.__bb.n; if (e.type === 'sell' || e.type === 'farmUpgrade' || (e.type === 'hatch' && e.farm === 0) || (e.type === 'pick' && e.actor === 0)) n[e.type] = (n[e.type] || 0) + 1; });
  });
  const ticks = MINUTES * 60 * 2;
  const t0 = Date.now();
  for (let k = 0; k < ticks; k++) {
    await page.evaluate(() => {
      const g = window.__game, B = window.__bb;
      window.__step(14, false);
      B.prev = g.sim.state.actors.map(a => a.pos.slice());
      window.__step(1, false);
      const s = g.sim.state, st = g.gv.stats();
      const bad = m => { if (B.bad.length < 40) B.bad.push(`t=${s.t.toFixed(1)} ${m}`); };
      B.checks++;
      const ids = Object.keys(s.items);
      if (st.roots !== ids.length || st.items.length !== ids.length) bad(`meshes ${st.roots}/${st.items.length} vs items ${ids.length}`);
      const W = it => (it.at.nest != null ? 'nest' : it.at.ground ? 'ground' : it.at.carried != null ? 'carried' : it.at.stowed != null ? 'stowed' : 'farm');
      const byId = new Map(st.items.map(i => [i.id, i]));
      for (const id of ids) {
        const it = s.items[id], v = byId.get(id), w = W(it);
        if (!v) { bad(`no mesh for ${id}`); continue; }
        if (v.where !== w || v.kind !== it.kind) bad(`${id} drawn at ${v.where}, sim ${w}`);
        if (v.visible !== (w !== 'stowed')) bad(`${id} visible ${v.visible} at ${w}`);
        let at = null;
        if (w === 'nest') at = s.animals[it.at.nest].nests[it.at.slot];
        else if (w === 'farm') at = it.at.pos;
        else if (w === 'ground') at = it.at.ground;
        if (at && Math.hypot(v.pos[0] - at[0], v.pos[2] - at[2]) > 0.05) bad(`${id} at ${w} drawn ${Math.hypot(v.pos[0] - at[0], v.pos[2] - at[2]).toFixed(2)} m off`);
        if (w === 'carried') {
          B.carried++;
          const a = st.actors[it.at.carried];
          if (v.pos[1] < a.pos[1] + 0.6 || Math.hypot(v.pos[0] - a.pos[0], v.pos[2] - a.pos[2]) > 0.6) bad(`${id} carried by ${it.at.carried} not above it (dy ${(v.pos[1] - a.pos[1]).toFixed(2)})`);
        }
      }
      // facing vs walk direction of the last step
      if (B.prev) st.actors.forEach((a, i) => {
        const actor = s.actors[i], p0 = B.prev[i], dx = actor.pos[0] - p0[0], dz = actor.pos[2] - p0[2], d = Math.hypot(dx, dz);
        const busy = i === 0 ? actor.combat.state !== 'ok' : !!(actor.brain && actor.brain.stun);
        if (d < 0.05 || d > 0.5 || busy) return;
        B.facing++;
        const dot = (a.facing[0] * dx + a.facing[1] * dz) / d;
        if (i === 0) {
          // the player turns with ThirdPersonController's 0.12 s rotation smoothing: the drawn rig must show the sim's
          // yaw exactly, and agree with the walk direction except during a turn
          const ydot = a.facing[0] * Math.sin(actor.yaw) + a.facing[1] * Math.cos(actor.yaw);
          if (ydot < 0.99) bad(`player drawn facing off its yaw (dot ${ydot.toFixed(2)})`);
          if (dot >= 0) B.playerAgree = (B.playerAgree || 0) + 1; else B.playerTurning = (B.playerTurning || 0) + 1;
        } else if (a.facing[0] * Math.sin(actor.yaw) + a.facing[1] * Math.cos(actor.yaw) < 0.99) bad(`rival ${i} drawn facing off its yaw`);
        // a NavMeshAgent step can round a path corner, so the step direction may differ from the last segment's yaw
        else if (dot < 0.3) bad(`actor ${i} faces ${a.facing.map(v => v.toFixed(2))} walking ${(dx / d).toFixed(2)},${(dz / d).toFixed(2)} (dot ${dot.toFixed(2)})`);
      });
    });
  }
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  const r = await page.evaluate(() => {
    const g = window.__game, s = g.sim.state, B = window.__bb;
    return { B, coins: s.coins, level: s.farms[0].level, brainrots: Object.values(s.items).filter(i => i.kind === 'brainrot' && i.at.farm === 0).length,
      stalls: g.bot.stalls, spawned: g.gv.counters, t: s.t, rigs: g.view.rigs.length, fx: g.gv.fx.count() };
  });
  console.log(`simulated ${(r.t / 60).toFixed(1)} min in ${sec} s: coins ${r.coins}, farm level ${r.level}, brainrots on farm ${r.brainrots}, events ${JSON.stringify(r.B.n)}`);
  console.log(`scene checks ${r.B.checks}, facing checks ${r.B.facing}, carried checks ${r.B.carried}, items spawned ${r.spawned.spawned} despawned ${r.spawned.despawned}, rigs ${r.rigs}, live particles ${r.fx}`);
  console.log(`stalls (no progress 120 s): ${r.stalls.length ? JSON.stringify(r.stalls) : 'none'}`);
  check('scene matches the sim every 0.5 s (meshes, locations, carried above carrier, facing)', !r.B.bad.length, r.B.bad.slice(0, 6).join(' | '));
  check('the bot made progress (sells or farm upgrades)', (r.B.n.sell || 0) + (r.B.n.farmUpgrade || 0) > 0, JSON.stringify(r.B.n));
  const agree = (r.B.playerAgree || 0) / Math.max(1, (r.B.playerAgree || 0) + (r.B.playerTurning || 0));
  check('the walking player never walks backwards (turns use the 0.12 s smoothing)', agree > 0.95, `${(agree * 100).toFixed(1)}% of ${(r.B.playerAgree || 0) + (r.B.playerTurning || 0)} steps`);
  check('carried items and walking actors were checked', r.B.carried > 20 && r.B.facing > 100, `carried ${r.B.carried}, facing ${r.B.facing}`);
  check('no rig leak (rigs == world rigs + item rigs)', r.rigs < 400, `${r.rigs}`);
  check('no console errors', !errors.length, errors.slice(0, 3).join(' | '));

  // Thumbnail: wait for the bot to stand in its farm, then draw one frame looking across the farm.
  for (let i = 0; i < 240; i++) {
    const inFarm = await page.evaluate(() => {
      const g = window.__game, s = g.sim.state, F = g.sim.D.farm.zone, p = s.actors[0].pos;
      return Math.abs(p[0] - F.c[0]) < F.h[0] - 1.5 && Math.abs(p[2] - F.c[2]) < F.h[2] - 1.5 && !s.actors[0].carry && s.actors[0].combat.state === 'ok';
    });
    if (inFarm) break;
    await page.evaluate(() => window.__step(15, false));
  }
  await page.evaluate(() => {
    const g = window.__game, s = g.sim.state, F = g.sim.D.farm.area.c, p = s.actors[0].pos;
    // turn the camera so the farm centre is in view behind the player
    const yaw = Math.atan2(F[0] - p[0], -(F[2] - p[2])) * 180 / Math.PI;
    g.view.follow.x = Number.isFinite(yaw) ? yaw : g.view.follow.x;
    g.view.follow.y = 22;
    window.__step(20, true);
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.__step(2, true));
  await shot(page, 'thumb.png');
});
