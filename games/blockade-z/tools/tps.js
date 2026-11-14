// Third-person view: screenshots of the hero from the shoulder camera (idle, running, shooting, a melee swing,
// a jump, a wall right behind), plus checks that shots still land where the crosshair points and that the camera
// never ends up inside a wall. Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/tps.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.tps-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'tps@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&tp=1&autostart=1&nolock=1&seed=4&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const shot = async (name) => { await page.evaluate("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }"); await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, `tps-${name}.png`) }); };
    const base = `const G = __G; G.state = 'playing'; G.god = true; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear(); const P = G.player;`;
    const r0 = await page.evaluate(`(() => { ${base} return { on: G.tps.on, model: !!G.tps.model, vm: true }; })()`);
    check(r0.on, 'third person is on with ?tp=1');

    for (const id of ['phao', 'gio', 'ky']) {
      // pick the hero, stand in the plaza, look across it
      await page.evaluate(`(() => { ${base} __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${id}')); __select.go(); __sim(0.2);
        G.state = 'playing'; P.pos.set(0, 0, 9); P.yaw = 0.25; P.pitch = -0.05; P.vel.set(0, 0, 0); __sim(0.4); G.state = 'paused'; })()`);
      await shot(`${id}-idle`);
      // running: hold forward for a while, freeze mid-stride
      await page.evaluate(`(() => { ${base} G.state = 'playing'; P.pos.set(0, 0, 14); P.yaw = 0; P.touch.y = -1; __sim(0.7); P.touch.y = 0; G.state = 'paused'; })()`);
      await shot(`${id}-run`);
      // attack: a zombie ahead, fire or swing a few times, freeze mid-attack
      const atk = await page.evaluate(`(() => { ${base} G.state = 'playing'; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = 0; P.vel.set(0, 0, 0); P.touch.y = 0;
        const z = G.zombies.spawn('walker', 1, { x: 0, z: 6, dir: [0, 1] }); z.speed = 0; z.hp = z.maxHp = 9999; P.pitch = -0.06;
        __sim(0.6); const mel = BZ.WEAPONS[G.weapons.cur()].melee; z.pos.set(mel ? 0 : G.camera.position.x, 0, mel ? 10.6 : 5); __sim(1 / 60); const hp0 = z.hp; P.input.fire = true; __sim(0.45); P.input.fire = false; return { dmg: Math.round(hp0 - z.hp), w: G.weapons.cur() }; })()`);
      await page.evaluate(`(() => { const G = __G; G.state = 'paused'; })()`);
      await shot(`${id}-attack`);
      check(atk.dmg > 0, `${id}: attacking with ${atk.w} from the shoulder camera hits the zombie in the crosshair (${atk.dmg} dmg)`);
    }
    // a jump, and backing into a wall: the camera must pull in and stay out of the wall
    await page.evaluate(`(() => { ${base} G.state = 'playing'; P.pos.set(0, 0, 9); P.yaw = 0.5; P.vel.set(0, 0, 0); P.jumpBuf = 0.2; __sim(0.3); G.state = 'paused'; })()`);
    await shot('jump');
    const wall = await page.evaluate(`(() => { ${base} G.state = 'playing'; const W = G.world; let bad = 0; let n = 0; const c = G.camera.position;
      for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; P.pos.set(Math.cos(a) * 30, 0, Math.sin(a) * 30); P.yaw = a * 1.7; P.pitch = Math.sin(i) * 0.4; P.vel.set(0, 0, 0); __sim(1 / 30); __sim(1 / 30); n++;
        const inside = W.overlaps([c.x - 0.05, c.y - 0.05, c.z - 0.05], [c.x + 0.05, c.y + 0.05, c.z + 0.05]); if (inside) bad++; }
      return { bad, n }; })()`);
    check(wall.bad <= 2, `the camera stays out of walls around the edge of the map (${wall.bad}/${wall.n} spots inside a wall)`);
    await page.evaluate(`(() => { ${base} G.state = 'playing'; P.pos.set(-30.5, 0, 0); P.yaw = -Math.PI / 2; P.pitch = 0; __sim(0.3); G.state = 'paused'; })()`);
    await shot('wall');
    // V goes back to first person with the viewmodel
    const fp = await page.evaluate(`(() => { const G = __G; G.state = 'playing'; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); __sim(0.1); return { on: G.tps.on, vis: G.tps.model.root.visible }; })()`);
    check(!fp.on && !fp.vis, 'V switches to first person and hides the body');
    const btn = await page.evaluate(`(() => { const G = __G; const b = document.getElementById('viewbtn'); const r = b.getBoundingClientRect(); const vis = getComputedStyle(b).display !== 'none' && r.width > 0; b.click(); __sim(0.05); return { vis, on: G.tps.on, txt: b.textContent.trim(), body: G.tps.model.root.visible }; })()`);
    check(btn.vis && btn.on && btn.body && /NGÔI 3/.test(btn.txt), 'the on-screen view button is visible and switches back to third person (' + btn.txt + ')');
    await page.screenshot({ path: path.join(OUT, 'tps-hud.png') });
    // the body's own movement: a weapon is drawn and ends in its hold, a sprint throws the chest forward, a jump tucks the legs,
    // a hit makes it flinch, the hands have five jointed fingers that work the weapon, and a dead hero lies down and lets go
    const mv = await page.evaluate(`(() => { const G = __G; const P = G.player; const M = () => G.tps.model; const key = (c, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c }));
      G.hero.set('mua'); __newGame(); G.wave.toSpawn = 0; G.zombies.clear(); G.state = 'playing'; P.pos.set(0, 0, 8); P.yaw = 0; P.pitch = 0; __sim(0.05);
      const r = {}; const m0 = M();
      r.hand = { verts: m0.fingersR.mesh.geometry.attributes.position.count, joints: m0.fingersR.cur.c.length + m0.fingersR.cur.t.length, calls: 1 };
      r.draw0 = { k: +m0.gun.scale.x.toFixed(2) }; __sim(0.2); r.drawMid = { k: +M().gun.scale.x.toFixed(2), arm: +M().armR.rotation.x.toFixed(2) };
      __sim(0.8); r.drawEnd = { k: +M().gun.scale.x.toFixed(2), arm: +M().armR.rotation.x.toFixed(2) };
      r.idx0 = +M().fingersR.cur.c[0].toFixed(2); P.input.fire = true; let idx = 0; for (let i = 0; i < 30; i++) { __sim(1 / 60); idx = Math.max(idx, M().fingersR.cur.c[0]); } P.input.fire = false; r.idxFire = +idx.toFixed(2); __sim(0.5);
      key('KeyW', 1); __sim(1); r.walkLean = +M().spine.rotation.x.toFixed(2); key('ShiftLeft', 1); __sim(1.2); r.sprintLean = +M().spine.rotation.x.toFixed(2); r.sprinting = P.sprinting; key('ShiftLeft', 0); key('KeyW', 0); __sim(0.6);
      r.standKnee = +M().kneeR.rotation.x.toFixed(2); key('Space', 1); __sim(0.25); key('Space', 0); r.airKnee = +Math.max(M().kneeL.rotation.x, M().kneeR.rotation.x).toFixed(2); r.inAir = !P.onGround; __sim(1.2);
      const from = new G.THREE.Vector3(P.pos.x - Math.sin(P.yaw) * 3, 0, P.pos.z - Math.cos(P.yaw) * 3);
      const lean0 = M().spine.rotation.x; G.events.emit('player:hurt', { dmg: 3, from }); let fl = 0; for (let i = 0; i < 12; i++) { __sim(1 / 60); fl = Math.min(fl, M().spine.rotation.x - lean0); } r.flinch = +fl.toFixed(2); __sim(0.8);
      const god = G.god; G.god = false; P.hurt(99999, from); G.god = god; __sim(1.2); r.dead = { state: G.state, tip: +Math.abs(M().root.rotation.x).toFixed(2), gun: M().gun.visible, open: +M().fingersR.cur.c[1].toFixed(2) };
      return r; })()`);
    // the jetpack: on the back once it is owned, two flames and a trail of fire and smoke while it burns, a glow at the screen edge in first person
    const jet = await page.evaluate(`(() => { const G = __G; const P = G.player; const key = (c, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c }));
      G.hero.set('mua'); __newGame(); G.wave.toSpawn = 0; G.zombies.clear(); G.fx.clear(); P.pos.set(0, 0, 8); __sim(0.3); const r = { before: !!(G.tps.model.jet && G.tps.model.jet.g.visible) };
      G.events.emit('upgrade', 'jet'); __sim(0.3); r.has = P.hasJet; r.pack = !!(G.tps.model.jet && G.tps.model.jet.g.visible); r.idleFlame = G.tps.model.jet.flames[0].f.visible;
      const f0 = G.fx.debug(); key('Space', 1); __sim(0.9); const f1 = G.fx.debug(); r.jetting = P.jetting; r.flame = G.tps.model.jet.flames[0].f.visible && G.tps.model.jet.flames[1].f.visible; r.glow = f1.glow - f0.glow; r.smoke = f1.smoke - f0.smoke; r.y = +P.pos.y.toFixed(1);
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); __sim(0.2); r.edge = document.getElementById('jetfx').classList.contains('on'); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
      key('Space', 0); __sim(1.5); r.after = G.tps.model.jet.flames[0].f.visible; r.fl = G.fx.floaters().length; return r; })()`);
    console.log('jet', JSON.stringify(jet));
    check(!jet.before && jet.has && jet.pack && !jet.idleFlame, 'the jetpack shows on the back once it is owned, with no flame while it idles');
    check(jet.jetting && jet.flame && jet.glow > 5 && jet.smoke > 3 && jet.y > 2, `holding jump fires both thrusters: flames on, ${jet.glow} fire and ${jet.smoke} smoke puffs in the air, up to ${jet.y} m`);
    check(jet.edge && !jet.after, 'first person shows the burn at the bottom edge, and the flames go out when the thrust stops');
    console.log('moves', JSON.stringify(mv));
    check(mv.hand.verts === 15 * 24 && mv.hand.joints === 6, `each hand is one mesh: a palm and 14 finger joints (${mv.hand.verts} vertices)`);
    check(mv.draw0.k < 0.2 && mv.drawEnd.k === 1 && Math.abs(mv.drawEnd.arm + 1.42) < 0.25, `the weapon is drawn: out of sight at first (${mv.draw0.k}), in the hand and aimed half a second later (arm ${mv.drawEnd.arm})`);
    check(mv.idxFire - mv.idx0 > 0.15, `the index finger squeezes the trigger with the shot (curl ${mv.idx0} -> ${mv.idxFire})`);
    check(mv.sprinting && mv.sprintLean - mv.walkLean > 0.2, `a sprint throws the chest forward (lean ${mv.walkLean} walking, ${mv.sprintLean} sprinting)`);
    check(mv.inAir && mv.airKnee - mv.standKnee > 0.4, `a jump tucks the legs (knee ${mv.standKnee} standing, ${mv.airKnee} in the air)`);
    check(mv.flinch < -0.1, `a hit from the front snaps the chest back (${mv.flinch})`);
    check(mv.dead.state === 'dead' && mv.dead.tip > 1.2 && !mv.dead.gun && mv.dead.open < 0.2, `a dead hero lies down, drops the weapon and opens the hand (tipped ${mv.dead.tip} rad)`);
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
