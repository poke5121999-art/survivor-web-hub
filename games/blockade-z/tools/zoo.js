// The special zombies and monsters: close-up screenshots for art review, then one check per kind's rule.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/zoo.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.zoo-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const KINDS = ['spitter', 'bloater', 'hound', 'shielder', 'armored', 'shrieker', 'burner', 'frost', 'spider', 'egg', 'brood'];

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'zoo@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?autostart=1&nolock=1&seed=5&noaudio=1&tod=0.42&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const stage = `(() => { const G = __G; G.god = true; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear(); __setShot('plaza'); const P = G.player; P.pos.set(0, 0, 9); P.yaw = 0; P.pitch = -0.12; P.vel.set(0, 0, 0); })()`;
    const hideHud = "for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }";

    // lineup: two rows walking a few steps toward the camera, then frozen mid-stride
    await page.evaluate(stage);
    await page.evaluate(`(() => { const G = __G; const rows = [['spitter', 'bloater', 'shielder', 'armored', 'shrieker'], ['hound', 'burner', 'frost', 'spider', 'egg']];
      rows.forEach((row, j) => row.forEach((t, i) => { const x = (i - 2) * 1.9; const zz = j ? 1.2 : 3.6; const z = G.zombies.spawn(t, 1, { x, z: zz, dir: [0, -1], name: 't' }); z.pos.set(x, 0, zz); z.yaw = 0; z.cd = 99; z.cd2 = 99; z.hatch = 99; z.speed = 0.0001; }));
      __sim(0.5); for (const z of G.zombies.list) if (z.alive) { z.yaw = 0; z.body.root.rotation.y = 0; } G.state = 'paused'; })()`);
    await page.evaluate(hideHud); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'zoo-lineup.png') });

    // one close-up per kind, walking toward the camera, plus the elites
    for (const t of KINDS) {
      await page.evaluate(`(() => { const G = __G; G.state = 'playing'; })()`);
      await page.evaluate(stage);
      await page.evaluate(`(() => { const G = __G; const big = '${t}' === 'brood'; const z = G.zombies.spawn('${t}', 1, { x: 0, z: 0, dir: [0, -1], name: 't' }); z.pos.set(big ? -4 : -1.9, 0, big ? 1.5 : 5.6); z.cd = 99; z.cd2 = 99; z.hatch = 99; z.speed = big ? 1.5 : 1.1;
        const sm = ['spider', 'hound', 'egg'].includes('${t}'); G.player.pitch = big ? 0.02 : sm ? -0.32 : -0.12; G.player.yaw = 0.2; G.weapons.S.ads = 0; __sim(0.9); G.state = 'paused'; })()`);
      await page.evaluate(hideHud); await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, 'zoo-' + t + '.png'), clip: { x: 240, y: 60, width: 800, height: 600 } });
    }
    // side views of the bodies that are not upright humans
    for (const t of ['hound', 'bloater', 'spider']) {
      await page.evaluate(`(() => { const G = __G; G.state = 'playing'; })()`);
      await page.evaluate(stage);
      await page.evaluate(`(() => { const G = __G; const z = G.zombies.spawn('${t}', 1, { x: 0, z: 0, dir: [0, -1], name: 't' }); z.pos.set(0, 0, 6.2); z.cd = 99; z.speed = 0; z.phase = 1.1; if (!G.weapons.__render) { G.weapons.__render = G.weapons.render; G.weapons.render = () => {}; } __sim(0.05); z.yaw = Math.PI / 2; z.vel.set(3, 0, 0);
        G.zombies.kinds.pose(z, 0.016, 3); z.body.root.rotation.y = z.yaw; G.player.pitch = -0.32; G.player.yaw = 0; G.state = 'paused'; })()`);
      await page.evaluate(hideHud); await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, 'zoo-' + t + '-side.png'), clip: { x: 340, y: 160, width: 600, height: 450 } });
    }
    await page.evaluate(`(() => { const G = __G; G.state = 'playing'; if (G.weapons.__render) G.weapons.render = G.weapons.__render; })()`);
    await page.evaluate(stage);
    await page.evaluate(`(() => { const G = __G; const keys = Object.keys(BZ.ELITE); keys.forEach((k, i) => { const x = (i - 2.5) * 1.6; const z = G.zombies.spawn('walker', 1, { x, z: 3.5, dir: [0, -1], name: 't' }); z.pos.set(x, 0, 3.5); z.speed = 0.0001; G.zombies.elite(z, k); }); __sim(0.4); G.state = 'paused'; })()`);
    await page.evaluate(hideHud); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'zoo-elites.png') });
    await page.evaluate(`(() => { __G.state = 'playing'; })()`);

    // rules, one kind at a time
    const r = await page.evaluate(`(() => { const G = __G; const P = G.player; const V = G.THREE.Vector3; const out = {};
      const reset = () => { G.zombies.clear(); G.allies.clear(); P.pos.set(0, 0, 9); P.vel.set(0, 0, 0); P.yaw = 0; P.hp = P.maxHp = 100; P.alive = true; P.armor = 0; P.slowT = 0; P.rootT = 0; G.god = false; };
      const mk = (t, x, z, o = {}) => { const q = G.zombies.spawn(t, 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); q.pos.set(x, 0, z); Object.assign(q, o); return q; };
      // shield: a frontal round is stopped, a head shot or a round from behind goes through
      reset(); let s = mk('shielder', 0, 5, { speed: 0 }); s.yaw = 0; const h0 = s.hp; const sh0 = s.shieldHp;
      G.zombies.damage(s, 40, 'body', new V(0, 0, -1)); out.shieldFront = [h0 - s.hp, Math.round(sh0 - s.shieldHp)];
      G.zombies.damage(s, 40, 'head', new V(0, 0, -1)); out.shieldHead = Math.round(h0 - s.hp);
      const h1 = s.hp; G.zombies.damage(s, 40, 'body', new V(0, 0, 1)); out.shieldBack = Math.round(h1 - s.hp);
      G.zombies.damage(s, 9999 * 0 + 400, 'body', new V(0, 0, -1)); out.shieldBroke = s.shieldHp <= 0 && !s.body.x.shield.visible;
      // armour: a third of the damage through until the plates come off; legs are bare
      reset(); let a = mk('armored', 0, 5, { speed: 0 }); const a0 = a.hp; G.zombies.damage(a, 100, 'body', new V(0, 0, -1)); out.armorBody = Math.round(a0 - a.hp);
      const a1 = a.hp; G.zombies.damage(a, 100, 'leg', new V(0, 0, -1)); out.armorLeg = Math.round(a1 - a.hp);
      // bloater: walks up, swells, blows, hurts the player and the zombies around it
      reset(); const b = mk('bloater', 0, 6.8); const near = mk('walker', 1.2, 6.5, { speed: 0 }); near.hp = near.maxHp = 60; near.speed = 0;
      for (let i = 0; i < 60 && b.alive; i++) __sim(0.1); __sim(0.5); out.bloat = { dead: !b.alive, hp: Math.round(P.hp), near: near.alive };
      // spitter: stops at range, throws acid, leaves a puddle
      reset(); const sp = mk('spitter', 0, -3); sp.cd = 0; let hz = 0; for (let i = 0; i < 40; i++) { __sim(0.1); hz = Math.max(hz, G.zombies.kinds.hazards.length); } out.spit = { hp: Math.round(P.hp), hazards: hz, gap: +Math.hypot(sp.pos.x - P.pos.x, sp.pos.z - P.pos.z).toFixed(1) };
      // hound: pounces from range
      reset(); const hd = mk('hound', 0, 4.5); hd.cd = 0; let leapt = false; for (let i = 0; i < 30; i++) { __sim(0.05); if (hd.leap) leapt = true; } out.hound = { leapt, hp: Math.round(P.hp) };
      // shrieker: screams, calls two runners, enrages the crowd
      reset(); const sr = mk('shrieker', 0, 1, { speed: 0 }); const w = mk('walker', 2, 1, { speed: 0 }); sr.cd = 0; const n0 = G.zombies.aliveCount(); __sim(0.8); out.shriek = { summoned: G.zombies.aliveCount() - n0, rage: w.rage > 0 };
      // burner shrugs off fire; frost dies in a nova that freezes its neighbours
      reset(); const bu = mk('burner', 0, 4, { speed: 0 }); G.zombies.applyStatus(bu, 'burn', 1); out.burnerImmune = !(bu.st && bu.st.burn);
      reset(); const fr = mk('frost', 0, 3, { speed: 0 }); const fz = mk('walker', 1.5, 3, { speed: 0 }); fz.hp = fz.maxHp = 500; G.zombies.damage(fr, 9999, 'body', new V(0, 0, -1)); __sim(0.4); out.frostNova = fz.frozen > 0;
      // brood: lays eggs; an egg hatches into spiders
      reset(); const bd = mk('brood', 0, -6); bd.cd2 = 0; bd.cd = 99; __sim(0.2); out.eggs = G.zombies.list.filter((q) => q.alive && q.type === 'egg').length;
      const egg = G.zombies.list.find((q) => q.alive && q.type === 'egg'); if (egg) egg.hatch = 0.05; __sim(0.3); out.spiders = G.zombies.list.filter((q) => q.alive && q.type === 'spider').length;
      // a spider dies in gibs; an elite pays triple
      reset(); const spd = mk('spider', 0, 4, { speed: 0 }); G.zombies.damage(spd, 999, 'body', new V(0, 0, -1)); out.spiderGone = !spd.body.root.visible;
      // the new kinds travel in the co-op snapshot with their flags and elite
      reset(); const s2 = mk('shielder', 0, 5, { speed: 0 }); G.zombies.elite(s2, 'swift'); out.row = G.zombies.snapshot().find((row) => row[0] === G.zombies.list.indexOf(s2));
      G.god = true; reset(); G.god = true; return out; })()`);
    const killFor = (elite) => page.evaluate(`(() => { const G = __G; const V = G.THREE.Vector3; const q = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); q.pos.set(0, 0, 4); q.speed = 0; ${elite ? "G.zombies.elite(q, 'tough');" : ''} const c = G.score; G.zombies.damage(q, 99999, 'body', new V(0, 0, -1)); return G.score - c; })()`);
    await page.waitForTimeout(1600); r.eliteCoins = await killFor(true); await page.waitForTimeout(1600); r.plainCoins = await killFor(false);
    console.log('zoo', JSON.stringify(r));
    check(r.shieldFront[0] === 0 && r.shieldFront[1] === 40, `a frontal round hits the shield, not the zombie (${r.shieldFront})`);
    check(r.shieldHead > 30 && r.shieldBack > 30, `head shots and shots from behind go through (${r.shieldHead}, ${r.shieldBack})`);
    check(r.shieldBroke, 'the shield breaks off after enough damage');
    check(r.armorBody === 30 && r.armorLeg === 100, `armour lets 30% through, legs take it all (${r.armorBody}, ${r.armorLeg})`);
    check(r.bloat.dead && r.bloat.hp < 100 && !r.bloat.near, `a bloater walks up, blows, hurts the player and kills its neighbour (${JSON.stringify(r.bloat)})`);
    check(r.spit.hp < 100 && r.spit.hazards > 0, `a spitter hits with acid and leaves a puddle (${JSON.stringify(r.spit)})`);
    check(r.hound.leapt && r.hound.hp < 100, `a hound pounces (${JSON.stringify(r.hound)})`);
    check(r.shriek.summoned === 2 && r.shriek.rage, `a shriek calls two runners and enrages the crowd (${JSON.stringify(r.shriek)})`);
    check(r.burnerImmune, 'a burner shrugs off fire');
    check(r.frostNova, 'a frost zombie dies in a nova that freezes its neighbour');
    check(r.eggs === 2 && r.spiders === 3, `the broodmother lays two eggs and an egg hatches three spiders (${r.eggs}, ${r.spiders})`);
    check(r.spiderGone, 'a spider bursts into gibs');
    check(r.eliteCoins === 3 * r.plainCoins && r.plainCoins > 0, `an elite is worth three times the score (${r.eliteCoins} vs ${r.plainCoins})`);
    check(r.row && r.row[8] > 0 && (r.row[7] & 256), `the co-op row carries the shield flag and the elite (${JSON.stringify(r.row)})`);
    // the body: knees and elbows work with the walk, the head draws in two calls, and a severed leg takes its shin with it
    const body = await page.evaluate(`(() => { const G = __G; G.zombies.clear(); G.fx.clear(); G.state = 'playing'; G.wave.toSpawn = 0; G.player.pos.set(0, 0, 20);
      const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(0, 0, 0); let knee = 0; let elbow = 0;
      for (let i = 0; i < 120; i++) { __sim(1 / 60); knee = Math.max(knee, z.body.kneeL.rotation.x, z.body.kneeR.rotation.x); elbow = Math.min(elbow, z.body.elbowL.rotation.x); }
      const headMats = z.body.head.material.length; const g0 = G.scene.children.length;
      G.zombies.sever(z, 'legL', new G.THREE.Vector3(1, 0, 0)); const piece = G.scene.children[G.scene.children.length - 1];
      return { knee: +knee.toFixed(2), elbow: +elbow.toFixed(2), headMats, added: G.scene.children.length - g0, pieceMeshes: piece.children.filter((c) => c.isMesh).length, crawl: z.crawl }; })()`);
    console.log('body', JSON.stringify(body));
    check(body.knee > 0.3 && body.elbow < -0.3, `a walking zombie bends its knees and elbows (knee up to ${body.knee} rad, elbow ${body.elbow})`);
    check(body.headMats === 2, `the head draws in two calls (${body.headMats} materials)`);
    check(body.pieceMeshes === 2 && body.crawl, `a severed leg flies off with its shin (${body.pieceMeshes} meshes in the piece) and the zombie crawls`);
    // a real late wave: the specials and elites come through the gates on their own
    const late = await page.evaluate(`(() => { const G = __G; G.god = true; G.zombies.clear(); const seen = new Set(); let elites = 0;
      G.startWave(G.wave.n + 1); G.wave.bossAt = -1;
      // one wave 9 is only 48 zombies, which does not always show six special kinds: when it runs dry, start it again and keep sampling
      const SP = ['spitter', 'bloater', 'hound', 'shielder', 'armored', 'shrieker', 'burner', 'frost', 'spider']; let waves = 1;
      // (the sampling must not depend on how one wave happens to go: the game is kept in play, the street is swept as soon as a dozen are out so the wave keeps spawning, and the wave is replayed up to twelve times)
      let iters = 0; for (let i = 0; i < 3000; i++) { iters = i; if (G.state !== 'playing') G.state = 'playing'; __sim(0.2); for (const z of G.zombies.list) if (z.alive) { seen.add(z.type); if (z.elite) elites++; } if (G.zombies.aliveCount() > 12) G.zombies.clear();
        if (SP.filter((t) => seen.has(t)).length >= 6 && elites > 0) break;
        if (G.wave.phase !== 'fight' || (G.wave.toSpawn === 0 && G.zombies.aliveCount() === 0)) { if (waves >= 12) break; waves++; G.zombies.clear(); G.state = 'playing'; G.startWave(REPLAY_WAVE); G.wave.bossAt = -1; } }
      return { wave: G.wave.n, types: [...seen], elites, waves, iters, end: G.state + '/' + G.wave.phase + '/' + G.wave.toSpawn }; })()`.replace('G.wave.n + 1', '9').replace('REPLAY_WAVE', '9'));
    console.log('late', JSON.stringify(late));
    check(late.types.filter((t) => ['spitter', 'bloater', 'hound', 'shielder', 'armored', 'shrieker', 'burner', 'frost', 'spider'].includes(t)).length >= 6, `wave ${late.wave} brings at least six special kinds through the gates (${late.types.join(', ')}; ${late.waves} run${late.waves > 1 ? 's' : ''} of the wave)`);
    check(late.elites > 0, `elites show up in a late wave (${late.elites} sightings in ${late.waves} run${late.waves > 1 ? 's' : ''}, ${late.iters} steps, ended ${late.end})`);
    // every mesh drawn with a vertex-coloured body material has colours to draw with (without them it renders black):
    // each boss and each special body is put on once, then every body is walked
    const vc = await page.evaluate(`(() => { const G = __G; G.god = true; G.wave.toSpawn = 0; G.wave.bossAt = -1; const bad = new Set(); let meshes = 0; const kinds = Object.keys(BZ.ZOMBIES);
      for (const t of kinds) { G.zombies.clear(); const z = G.zombies.spawn(t, 3, { x: 0, z: 9, dir: [0, 1], name: 't' }); if (!z) continue; __sim(0.05);
        z.body.root.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (!ms.some((m) => m && m.vertexColors)) return; meshes++; if (!o.geometry.attributes.color) bad.add(t); }); }
      G.zombies.clear(); return { kinds: kinds.length, meshes, bad: [...bad] }; })()`);
    check(vc.kinds >= 20 && vc.meshes > 200 && vc.bad.length === 0, `no body part of the ${vc.kinds} kinds draws black for want of vertex colours (${vc.meshes} meshes${vc.bad.length ? '; bad: ' + vc.bad.join(',') : ''})`);
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 5).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
