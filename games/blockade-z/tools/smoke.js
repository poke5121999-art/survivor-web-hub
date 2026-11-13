// Plays Blockade Z headlessly: boots, lets a simple aim bot fight several waves, buys a gun,
// and saves screenshots. Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/smoke.js [outDir]
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
// Real Chrome (GPU) when present; SwiftShader frame times say nothing about real hardware.
const browser = () => require(PW).chromium.launch({ channel: process.env.BZ_CHANNEL || 'chrome', headless: !process.env.BZ_HEADED, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--window-position=1920,0'] });

const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.smoke-blockade-z');
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

const BOT = `(() => {
  const G = window.__G; const P = G.player; const THREE = G.THREE;
  let target = null; let best = 1e9;
  for (const z of G.zombies.list) {
    if (!z.alive) continue;
    const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z);
    const eye = new THREE.Vector3(P.pos.x, P.pos.y + 1.6, P.pos.z);
    const head = new THREE.Vector3(z.pos.x, z.pos.y + 1.2 * z.T.scale, z.pos.z);
    if (d < best && G.world.lineOfSight(eye, head)) { best = d; target = z; }
  }
  P.input.fire = false;
  if (target) {
    const dx = target.pos.x - P.pos.x; const dz = target.pos.z - P.pos.z; const dy = target.pos.y + 1.25 * target.T.scale - (P.pos.y + 1.6);
    P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    window.__botN = (window.__botN || 0) + 1;
    P.input.fire = window.__botN % 2 === 0;
  }
  const a = G.weapons.ammo();
  if (a.mag === 0) G.weapons.startReload();
  return target ? 1 : 0;
})()`;

(async () => {
  const srv = await serve();
  const br = await browser();
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    // game-gate.js sends guests to login; seed a member session like other hub tests do
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?' + (process.env.BZ_QUERY || 'autostart=1&nolock=1&seed=7'));
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    check(true, 'booted');
    check(await page.evaluate('window.__G.state') === 'playing', 'autostart puts the game in playing state');
    await page.evaluate("window.__setShot('plaza')");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, '01-plaza.png') });

    // let zombies arrive, then take a look toward the north gate
    await page.evaluate('window.__sim(3.5)');
    const alive = await page.evaluate('window.__G.zombies.aliveCount()');
    check(alive > 0, `zombies spawned after 3.5 s (alive=${alive})`);
    await page.evaluate("(() => { const P = window.__G.player; P.yaw = 0; P.pitch = -0.02; })()");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '02-north.png') });

    // bot fights: fixed-step sim, bot aims every 3 frames
    const log = [];
    const t0 = Date.now();
    for (let i = 0; i < 900; i++) {
      await page.evaluate(BOT);
      await page.evaluate('window.__sim(0.05, 1/60)');
      if (i % 40 === 0) log.push(await page.evaluate('({w: __G.wave.n, ph: __G.wave.phase, hp: Math.round(__G.player.hp), k: __G.kills, c: __G.coins, alive: __G.zombies.aliveCount()})'));
      if (i === 120) await page.screenshot({ path: path.join(OUT, '03-fight.png') });
      if (await page.evaluate('__G.state') === 'dead' || await page.evaluate("__G.wave.phase === 'break'")) break;
    }
    console.log('bot log', JSON.stringify(log));
    const st = await page.evaluate('({w: __G.wave.n, ph: __G.wave.phase, hp: __G.player.hp, kills: __G.kills, coins: __G.coins, state: __G.state, shots: __G.weapons.S.shots, hits: __G.weapons.S.hits})');
    console.log('after bot', JSON.stringify(st), 'wall ms', Date.now() - t0);
    check(st.kills >= 22, `bot killed the first wave (kills=${st.kills})`);
    check(st.hits > 0 && st.hits <= st.shots, `hit accounting sane (hits ${st.hits}/${st.shots})`);

    // shop: force a break, buy the shotgun
    await page.evaluate("(() => { const G = __G; if (G.state !== 'playing') { G.player.hp = 100; G.player.alive = true; G.state = 'playing'; } G.zombies.clear(); G.wave.toSpawn = 0; G.wave.killed = G.wave.total; G.coins = 1000; })()");
    await page.evaluate('window.__sim(0.1)');
    check(await page.evaluate('__G.wave.phase') === 'break', 'wave ends into a break');
    await page.keyboard.press('KeyB');
    await page.waitForTimeout(300);
    check(await page.evaluate('__G.state') === 'shop', 'B opens the shop during the break');
    await page.screenshot({ path: path.join(OUT, '04-shop.png') });
    const before = await page.evaluate('__G.coins');
    await page.click('[data-buy="shotgun"]');
    const after = await page.evaluate("({own: __G.weapons.has('shotgun'), c: __G.coins})");
    check(after.own && before - after.c === 350, `buying the shotgun takes 350 coins and owns it (${before} -> ${after.c})`);
    await page.click('[data-act="closeshop"]');
    await page.evaluate('window.__sim(0.6)');
    check(await page.evaluate("__G.weapons.cur() === 'shotgun'"), 'bought gun is equipped');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, '05-shotgun.png') });

    // bomb kills a cluster; turret shoots on its own; jetpack lifts the player
    const gear = await page.evaluate(`(() => { const G = __G; G.wave.breakT = 0.01; __sim(0.2); G.zombies.clear();
      const P = G.player; P.pos.set(0, 0, 8); P.yaw = 0; P.pitch = -0.75; P.hp = 100; P.alive = true; G.state = 'playing';
      for (let i = 0; i < 4; i++) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 2, dir: [0, -1], name: 't' }); z.pos.set(-0.6 + i * 0.4, 0, 5.2); z.speed = 0; }
      __sim(0.05); const k0 = G.kills; G.gear.throwBomb(); __sim(2.2); const bombKills = G.kills - k0;
      G.coins = 1000; G.wave.phase = 'break'; G.events.emit('buy', 'turret'); const t = G.gear.turrets[0]; const a0 = t ? t.ammo : -1;
      const z = G.zombies.spawn('walker', 1, { x: 0, z: -2, dir: [0, 1], name: 't' }); z.pos.set(-4, 0, 8.5); z.speed = 0; __sim(1.5);
      const fired = t ? a0 - t.ammo : 0;
      G.coins = 1000; G.wave.phase = 'break'; G.events.emit('buy', 'jetpack'); G.wave.phase = 'fight';
      P.pos.set(0, 0, 8); P.vel.set(0, 0, 0); P.jumpBuf = 0.13; P.touchJet = true; __sim(1.2); const h = P.pos.y; P.touchJet = false;
      return { bombKills, fired, h: +h.toFixed(2), fuel: Math.round(P.fuel) }; })()`);
    console.log('gear', JSON.stringify(gear));
    check(gear.bombKills >= 3, `a bomb kills a cluster of walkers (${gear.bombKills}/4)`);
    check(gear.fired > 0, `the auto turret fires by itself (${gear.fired} shots)`);
    check(gear.h > 3 && gear.fuel < 100, `jetpack lifts the player (y=${gear.h}, fuel=${gear.fuel})`);

    const react = await page.evaluate(`(() => { const G = __G; G.zombies.clear(); G.wave.toSpawn = 0; const V = G.THREE.Vector3;
      const mk = (x) => { const z = G.zombies.spawn('walker', 1, { x: 0, z: -2, dir: [0, 1], name: 't' }); z.pos.set(x, 0, -6); z.hp = z.maxHp = 1000; return z; };
      const a = mk(-3); G.zombies.damage(a, 60, 'leg', new V(0, 0, -1), 1); const legSlow = a.slowT > 0;
      G.zombies.damage(a, 400, 'leg', new V(0, 0, -1), 1); const limp = a.limp || a.crawl;
      const b = mk(0); G.zombies.damage(b, 600, 'body', new V(0, 0, -1), 1); const down = b.down > 0;
      const c = mk(3); G.zombies.damage(c, 20, 'body', new V(0, 0, -1), 0.55); const small = c.down <= 0 && Math.abs(c.fp.v) > 0;
      G.zombies.clear(); const P = G.player; P.pos.set(0, 0, 8); P.yaw = 0; P.pitch = 0;
      const z1 = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z1.pos.set(0, 0, 4); z1.speed = 0;
      const z2 = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z2.pos.set(0, 0, 3); z2.speed = 0;
      G.weapons.give('rifle'); __sim(0.7); P.pitch = Math.atan2(1.0 - 1.6, 4); __sim(0.02);
      P.input.fire = true; __sim(0.03); P.input.fire = false;
      return { legSlow, limp, down, small, pierce: z1.hp < z1.maxHp && z2.hp < z2.maxHp }; })()`);
    console.log('react', JSON.stringify(react));
    check(react.legSlow && react.limp, 'leg hits slow a zombie, enough leg damage makes it limp or tears the leg off');
    check(react.down && react.small, 'a heavy body hit knocks it down, a light SMG hit only flinches');
    check(react.pierce, 'a rifle round passes through the first zombie into the one behind');

    const adv = await page.evaluate(`(() => { const G = __G; const V = G.THREE.Vector3; G.zombies.clear(); G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.god = true;
      const P = G.player; P.alive = true; P.hp = 100;
      // stand on the guard post roof; walkers below should stack up and get over the parapet
      P.pos.set(21, 4.5, -27); P.vel.set(0, 0, 0); __sim(0.2);
      for (let i = 0; i < 10; i++) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(11 + (i % 3) * 0.6, 0, -28 + Math.floor(i / 3) * 0.6); }
      let topY = 0; for (let k = 0; k < 40; k++) { P.pos.set(21, 4.5, -27); __sim(0.5); for (const z of G.zombies.list) if (z.alive) topY = Math.max(topY, z.pos.y); }
      const onRoof = G.zombies.list.filter((z) => z.alive && z.pos.y > 4).length;
      G.zombies.clear(); P.pos.set(0, 0, 8); P.vel.set(0, 0, 0); __sim(0.1);
      const giant = G.zombies.spawn('giant', 5, { x: 0, z: -20, dir: [0, 1], name: 't' }); giant.pos.set(0, 0, -12); giant.abT = 0; const g0 = giant.pos.distanceTo(P.pos); __sim(2); const g1 = giant.pos.distanceTo(P.pos);
      G.zombies.clear(); const thr = G.zombies.spawn('thrower', 5, { x: 0, z: -20, dir: [0, 1], name: 't' }); P.pos.set(0, 0, 8); P.vel.set(0, 0, 0); const r0 = G.gear.state.rocks || 0; thr.pos.set(4, 0, 2); thr.abT = 0; __sim(1.2); const rocks = (G.gear.state.rocks || 0) - r0;
      G.zombies.clear(); const ph = G.zombies.spawn('phantom', 5, { x: 0, z: -20, dir: [0, 1], name: 't' }); ph.pos.set(0, 0, -15); ph.abT = 0; __sim(0.1); const phD = ph.pos.distanceTo(P.pos);
      G.zombies.clear(); for (let i = 0; i < 4; i++) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(-0.6 + i * 0.4, 0, -2); z.speed = 0; }
      const k0 = G.kills; G.weapons.give('bazooka'); __sim(0.7); P.pos.set(0, 0, 8); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = Math.atan2(1 - 1.6, 10); __sim(0.02); P.input.fire = true; __sim(0.03); P.input.fire = false; __sim(1); const rk = G.kills - k0;
      G.god = false; return { topY: +topY.toFixed(2), onRoof, g0: +g0.toFixed(1), g1: +g1.toFixed(1), rocks, phD: +phD.toFixed(1), rk }; })()`);
    console.log('adv', JSON.stringify(adv));
    check(adv.topY > 3, `walkers stack up toward a player on a roof (top y=${adv.topY}, on roof ${adv.onRoof})`);
    check(adv.g1 < adv.g0 - 5, `the giant boss leaps at the player (${adv.g0} m -> ${adv.g1} m)`);
    check(adv.rocks > 0, `the thrower boss throws a rock (${adv.rocks})`);
    check(adv.phD < 4, `the phantom boss teleports next to the player (${adv.phD} m)`);
    check(adv.rk >= 3, `a bazooka rocket kills a cluster (${adv.rk}/4)`);

    // headshot pops the head
    await page.evaluate("(() => { const G = __G; G.wave.breakT = 0.01; })()");
    await page.evaluate('window.__sim(4)');
    const hs = await page.evaluate(`(() => { const G = __G; const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (!z) return 'no free zombie';
      G.zombies.damage(z, 9999, 'head', new G.THREE.Vector3(0, 0, 1)); return z.body.head.visible ? 'head still on' : 'popped'; })()`);
    check(hs === 'popped', 'a killing headshot removes the head (' + hs + ')');

    // blades, gore, two-weapon hands, weapons on the ground, soldiers picking them up
    const mel = await page.evaluate(`(() => { const G = __G; const W = G.weapons; const P = G.player; const V = G.THREE.Vector3; const r = {};
      G.zombies.clear(); G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.god = true; G.allies.clear();
      const mk = (type, x, z) => { const q = G.zombies.spawn(type, 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); q.pos.set(x, 0, z); q.speed = 0; return q; };
      W.reset(); P.pos.set(0, 0, 8); P.yaw = 0; P.pitch = 0; P.vel.set(0, 0, 0); W.selectSlot(1); __sim(0.7); r.cur = W.cur();
      const zs = [mk('walker', -0.6, 6.3), mk('walker', 0.4, 6.2), mk('walker', 0, 5.8)]; for (const z of zs) z.hp = z.maxHp = 260;
      const h0 = W.S.hits; P.input.fire = true; __sim(1.4); P.input.fire = false; __sim(0.3);
      r.swings = W.S.hits - h0; r.dead = zs.filter((z) => !z.alive).length; r.arms = zs.reduce((a, z) => a + (2 - z.armsLeft), 0);
      G.zombies.clear(); const L = mk('walker', 3, 0); L.hp = L.maxHp = 600; for (let i = 0; i < 14 && !L.crawl; i++) G.zombies.damage(L, 40, 'leg', new V(1, 0, 0), 1); r.crawl = L.crawl;
      const g0 = G.fx.debug().made; const B = mk('walker', 6, 6); B.hp = 50; G.zombies.damage(B, 400, 'body', new V(1, 0, 0), 3, { blast: true }); r.blastGibs = G.fx.debug().made - g0;
      __sim(3); r.resting = G.fx.debug().resting; r.splats = G.fx.debug().splats;
      G.zombies.clear(); r.drop = W.dropCur(); __sim(2.5); const it = W.ground[0]; r.rest = !!(it && it.rest); r.dropLast = W.dropCur();
      P.pos.set(it.pos.x, 0, it.pos.z + 0.5); __sim(0.1); r.pick = W.pickup(); r.inv = W.S.inv.join(',');
      G.coins = 9999; G.wave.phase = 'break'; G.events.emit('buy', 'bazooka'); r.buyInv = W.S.inv.join(','); r.ground = W.ground.map((g) => g.id).join(',');
      G.events.emit('buy', 'ally'); G.events.emit('buy', 'ally'); G.wave.phase = 'fight'; P.pos.set(0, 0, 8); P.yaw = 0; __sim(0.7); W.dropCur(); __sim(7);
      r.ally = G.allies.list.filter((a) => a.alive).map((a) => a.weap ? a.weap.id : '-').join(',');
      const t = mk('brute', 0, 17); t.hp = t.maxHp = 5000; const s0 = G.gear.shots.length; let rockets = 0;
      for (let i = 0; i < 40; i++) { __sim(0.1); if (G.gear.shots.length > s0) rockets++; } r.allyRocketFrames = rockets; r.brute = 5000 - Math.round(t.hp);
      G.god = false; return r; })()`);
    console.log('melee', JSON.stringify(mel));
    check(mel.cur === 'katana' && mel.swings >= 3, `holding fire with the katana chains a combo (${mel.swings} swings landed)`);
    check(mel.dead >= 1, `katana cleaves through a crowd (${mel.dead}/3 dead)`);
    check(mel.crawl, 'shredding a leg turns a walker into a crawler');
    check(mel.blastGibs >= 5, `an explosion blows a zombie into pieces (${mel.blastGibs} gibs)`);
    check(mel.resting >= 5 && mel.splats >= 3, `pieces settle on the ground and blood pools stay (${mel.resting} resting, ${mel.splats} pools)`);
    check(mel.drop && mel.rest && mel.dropLast === false, 'X drops the held weapon, it lands and stays; the last weapon cannot be dropped');
    check(mel.pick && mel.inv === 'smg,katana', `E picks the weapon back up (${mel.inv})`);
    check(mel.buyInv === 'smg,bazooka' && mel.ground === 'katana', `buying a third weapon drops the one in hand (${mel.buyInv} / ground ${mel.ground})`);
    check(mel.ally.includes('bazooka') && mel.allyRocketFrames > 0 && mel.brute > 0, `a soldier picks up the dropped bazooka and fires it (${mel.ally}, ${mel.brute} dmg)`);

    // heroes: every skill does its thing; Bóng runs along a wall and up it
    const hero = await page.evaluate(`(() => { const G = __G; const out = {};
      for (let i = 0; i < BZ.HEROES.length; i++) {
        __select.open(); __select.pick(i); __select.go(); __sim(0.3);
        G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); const P = G.player; P.pos.set(0, 0, 8); P.yaw = 0; P.pitch = -0.1; __sim(0.2);
        const zs = []; for (let k = 0; k < 4; k++) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(-1 + k * 0.7, 0, 4); z.hp = z.maxHp = 400; z.speed = 0; zs.push(z); }
        const hp0 = zs.reduce((a, z) => a + z.hp, 0); P.hp = 40; P.input.fwd = 1;
        const used = G.hero.use(); __sim(0.5);
        const r = { used, hp: Math.round(P.hp), max: P.maxHp, frozen: zs.filter((z) => z.frozen > 0).length, z: +P.pos.z.toFixed(1), decoy: !!G.hero.decoy, inv: G.hero.invuln(), storm: G.hero.storm() };
        __sim(2.5); r.dmg = Math.round(hp0 - zs.reduce((a, z) => a + Math.max(0, z.hp), 0)); out[G.hero.id] = r;
      }
      __select.open(); __select.pick(4); __select.go(); __sim(0.3); G.zombies.clear(); G.wave.toSpawn = 0;
      const P = G.player; P.pos.set(-15.62, 0, -20.6); P.yaw = 0; P.vel.set(0, 0, 0); __sim(0.2); P.touch.y = -1; P.jumpBuf = 0.13; let wall = 0; let top = 0;
      for (let i = 0; i < 70; i++) { __sim(1 / 60); if (P.wallRun) wall++; top = Math.max(top, P.pos.y); }
      P.pos.set(-15.2, 0, -23.5); P.yaw = Math.PI / 2; P.vel.set(0, 0, 0); __sim(0.2); let climb = 0;
      for (let i = 0; i < 50; i++) { __sim(1 / 60); climb = Math.max(climb, P.pos.y); }
      P.touch.y = 0; out.wall = wall; out.wallTop = +top.toFixed(2); out.climb = +climb.toFixed(2);
      return out; })()`);
    console.log('heroes', JSON.stringify(hero));
    check(hero.gio.used && hero.gio.z < 4 && hero.gio.dmg >= 200, `Gió dashes through the crowd and cuts it (moved to z=${hero.gio.z}, ${hero.gio.dmg} dmg)`);
    check(hero.thep.inv && hero.thep.max === 150, 'Thép turns invulnerable and has 150 hp');
    check(hero.yta.hp >= 89, `Y Tá heals herself (${hero.yta.hp} hp)`);
    check(hero.mua.storm, 'Mưa Đạn starts a bullet storm');
    check(hero.bong.decoy && hero.bong.z < 4, `Bóng blinks forward and leaves a decoy (z=${hero.bong.z})`);
    check(hero.phao.dmg >= 400, `Pháo Thủ's air strike lands on the marked area (${hero.phao.dmg} dmg)`);
    check(hero.bang.frozen === 4, `Băng freezes every zombie nearby (${hero.bang.frozen}/4)`);
    check(hero.wall > 20 && hero.wallTop > 1.5 && hero.climb > 2.5, `Bóng runs along a wall (${hero.wall} frames, top ${hero.wallTop} m) and up a wall (${hero.climb} m)`);

    const stats = await page.evaluate('window.__stats');
    console.log('stats', JSON.stringify(stats));
    const errs = await page.evaluate('window.__errors');
    check(errs.length === 0, 'no console errors in game (' + errs.slice(0, 3).join(' | ') + ')');
    check(problems.length === 0, 'no page errors or failed requests (' + problems.slice(0, 3).join(' | ') + ')');
  } finally {
    await br.close();
    srv.close();
  }
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
