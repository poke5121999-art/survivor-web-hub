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
    const after = await page.evaluate('({own: !!__G.weapons.S.owned.shotgun, c: __G.coins})');
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
      const z = G.zombies.spawn('walker', 1, { x: 0, z: -2, dir: [0, 1], name: 't' }); z.pos.set(6, 0, 6); z.speed = 0; __sim(1.5);
      const fired = t ? a0 - t.ammo : 0;
      P.pos.set(0, 0, 8); P.vel.set(0, 0, 0); P.jumpBuf = 0.13; P.touchJet = true; __sim(1.2); const h = P.pos.y; P.touchJet = false;
      return { bombKills, fired, h: +h.toFixed(2), fuel: Math.round(P.fuel) }; })()`);
    console.log('gear', JSON.stringify(gear));
    check(gear.bombKills >= 3, `a bomb kills a cluster of walkers (${gear.bombKills}/4)`);
    check(gear.fired > 0, `the auto turret fires by itself (${gear.fired} shots)`);
    check(gear.h > 3 && gear.fuel < 100, `jetpack lifts the player (y=${gear.h}, fuel=${gear.fuel})`);

    // headshot pops the head
    await page.evaluate("(() => { const G = __G; G.wave.breakT = 0.01; })()");
    await page.evaluate('window.__sim(4)');
    const hs = await page.evaluate(`(() => { const G = __G; const z = G.zombies.list.find((q) => q.alive); if (!z) return 'none';
      G.zombies.damage(z, 9999, 'head', new G.THREE.Vector3(0, 0, 1)); return z.body.head.visible ? 'head still on' : 'popped'; })()`);
    check(hs === 'popped', 'a killing headshot removes the head (' + hs + ')');

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
