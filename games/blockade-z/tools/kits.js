// Every hero's kit in a real browser: each skill and ultimate is used on a grid of standing zombies,
// its damage and side effects are measured, and a few frames of the showier ones are saved for review.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/kits.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.kits-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const SHOTS = { gust: 0.4, quake: 0.15, drones: 1, blizzard: 2, dragon: 1.2, thunder: 1, orb: 1, artillery: 2.5, blades: 0.5, barrage: 1.6, plague: 0.3, lance: 0.05, cloud: 1.5, molotov: 1.5 };

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'kits@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?select=1&nolock=1&seed=9&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const heroes = await page.evaluate('BZ.HEROES.map((h) => [h.id, h.s1.key, h.s2.key, h.ult.key])');
    check(heroes.length === 11, `eleven heroes to pick (${heroes.length})`);
    await page.evaluate('__select.pick(7)'); await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, 'select-hoa.png') });

    const res = {};
    for (let i = 0; i < heroes.length; i++) {
      const [id] = heroes[i];
      for (const slot of ['s1', 's2', 'ult']) {
        const key = heroes[i][slot === 's1' ? 1 : slot === 's2' ? 2 : 3];
        const r = await page.evaluate(`(() => { const G = __G; __select.open(); __select.pick(${i}); __select.go(); __sim(0.2);
          G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear(); while (G.gear.turrets.length) G.gear.removeTurret(0);
          G.god = true; const P = G.player; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.08; P.vel.set(0, 0, 0); P.hp = 50; P.armor = 0; __sim(0.1);
          const zs = []; for (const zz of [8, 6, 4, 2]) for (const x of [-1.2, 0, 1.2]) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(x, 0, zz); z.hp = z.maxHp = 800; z.speed = 0; z.attackT = 99; zs.push(z); }
          if (${JSON.stringify(key)} === 'drain') for (const z of zs) G.zombies.applyStatus(z, 'poison', 1);
          const hp0 = zs.reduce((a, z) => a + z.hp, 0); const t0 = G.gear.turrets.length; const y0 = P.pos.y;
          G.hero.ult = 1; const used = G.hero.use('${slot}');
          let maxY = 0; for (let k = 0; k < 20; k++) { __sim(0.05); maxY = Math.max(maxY, P.pos.y - y0); }
          const out = { frozen0: zs.filter((z) => z.frozen > 0).length, used, hp: Math.round(P.hp), armor: Math.round(P.armor), maxY: +maxY.toFixed(1), inv: G.hero.invuln(), storm: G.hero.storm(), invis: P.invisT > 0, decoy: !!G.hero.decoy };
          __sim(${slot === 'ult' ? 7 : 3.5});
          out.dmg = Math.round(hp0 - zs.reduce((a, z) => a + Math.max(0, z.hp), 0)); out.frozen = zs.filter((z) => z.frozen > 0).length;
          out.poison = zs.filter((z) => z.st && z.st.poison).length; out.turrets = G.gear.turrets.length - t0; out.cannons = G.hero.cannons.length;
          G.god = false; return out; })()`);
        res[id + '.' + key] = r;
      }
    }
    console.log('kits', JSON.stringify(res));
    const dmg = (k, min) => check(res[k] && res[k].used && res[k].dmg >= min, `${k} lands (${res[k] ? res[k].dmg : '?'} dmg)`);
    for (const [k, min] of [['gio.dash', 100], ['gio.gust', 150], ['gio.blades', 1200], ['thep.charge', 100], ['thep.quake', 800], ['yta.dart', 40], ['mua.cluster', 300], ['mua.drones', 1000],
      ['bong.shuriken', 200], ['phao.strike', 400], ['phao.mine', 300], ['phao.barrage', 800], ['bang.lance', 150], ['bang.blizzard', 300], ['hoa.molotov', 100], ['hoa.dragon', 600],
      ['sam.orb', 200], ['sam.smite', 300], ['sam.thunder', 1000], ['doc.cloud', 60], ['doc.drain', 500], ['doc.plague', 300], ['ky.artillery', 400]]) dmg(k, min);
    check(res['thep.invuln'].inv, 'Thép turns invulnerable');
    check(res['yta.heal'].hp >= 89 && res['yta.revive'].hp === 100, `Y Tá heals (${res['yta.heal'].hp}) and her ultimate fills the bar (${res['yta.revive'].hp})`);
    check(res['yta.dart'].poison > 0 && res['doc.cloud'].poison > 0 && res['doc.plague'].poison >= 6, `darts, clouds and the plague leave poison (${res['yta.dart'].poison}, ${res['doc.cloud'].poison}, ${res['doc.plague'].poison})`);
    check(res['mua.storm'].storm, 'Mưa Đạn starts a bullet storm');
    check(res['bong.blink'].decoy && res['bong.vanish'].invis, 'Bóng blinks with a decoy and vanishes');
    check(res['bang.freeze'].frozen0 >= 6 && res['bang.blizzard'].frozen >= 6, `Băng freezes (${res['bang.freeze'].frozen0}) and the blizzard freezes (${res['bang.blizzard'].frozen})`);
    check(res['hoa.rocketjump'].maxY > 2.5, `Hoả rocket-jumps (${res['hoa.rocketjump'].maxY} m up)`);
    check(res['ky.turret'].turrets === 1 && res['ky.repair'].armor >= 60 && res['ky.artillery'].cannons === 1, `Kỹ Sư builds a turret, gains armour (${res['ky.repair'].armor}) and drops a cannon`);

    // the ultimate fills from damage and refuses until full
    const ult = await page.evaluate(`(() => { const G = __G; __select.open(); __select.pick(3); __select.go(); __sim(0.2); G.zombies.clear(); G.hero.ult = 0;
      const no = G.hero.use('ult'); G.events.emit('hit', { z: { pos: G.player.pos, T: { scale: 1 } }, dmg: 900, part: 'body' }); return { no, half: +G.hero.ult.toFixed(2) }; })()`);
    check(!ult.no && ult.half > 0.45 && ult.half < 0.6, `the ultimate refuses at 0% and fills from damage (${ult.half} after 900 of 1800)`);

    // looks: a frame of each showy skill, seen from behind the caster's shoulder
    for (const [i, slot, key] of [[0, 's2', 'gust'], [1, 'ult', 'quake'], [3, 'ult', 'drones'], [6, 'ult', 'blizzard'], [7, 'ult', 'dragon'], [8, 'ult', 'thunder'], [8, 's1', 'orb'], [10, 'ult', 'artillery'], [9, 'ult', 'plague'], [6, 's2', 'lance'], [7, 's1', 'molotov']]) {
      await page.evaluate(`(() => { const G = __G; G.state = 'playing'; __select.open(); __select.pick(${i}); __select.go(); __sim(0.2);
        G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.god = true; const P = G.player; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.12; __sim(0.1);
        for (const zz of [7, 5, 3]) for (const x of [-2, 0, 2]) { const z = G.zombies.spawn(zz === 3 ? 'brute' : 'walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(x, 0, zz); z.speed = 0; z.hp = z.maxHp = 5000; z.attackT = 99; }
        G.hero.ult = 1; G.hero.use('${slot}'); __sim(${SHOTS[key] || 0.5}); G.state = 'paused'; })()`);
      await page.evaluate("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }");
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, 'kit-' + key + '.png') });
    }
    // polish: the screen flashes on a cast, bodies fall three different ways
    const pol = await page.evaluate(`(() => { const G = __G; G.state = 'playing'; G.zombies.clear(); const P = G.player; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.1;
      const V = G.THREE.Vector3; const r = { kinds: {} };
      for (let i = 0; i < 30; i++) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set((i % 6) - 2.5, 0, 6 - Math.floor(i / 6)); G.zombies.damage(z, 9999, 'body', new V(0, 0, -1)); r.kinds[z.deathK] = (r.kinds[z.deathK] || 0) + 1; }
      G.hero.slots.s1.n = 1; G.hero.use('s1'); r.cast = document.getElementById('castfx').className; r.dip = G.weapons.S.castT > 0;
      return r; })()`);
    console.log('polish', JSON.stringify(pol));
    check(pol.cast === 'skill' && pol.dip, 'a skill flashes the screen in the hero colour and dips the gun');
    check(Object.keys(pol.kinds).length === 3, `bodies fall three different ways (${JSON.stringify(pol.kinds)})`);
    await page.evaluate(`(() => { const G = __G; G.zombies.clear(); const V = G.THREE.Vector3; for (let k = 0; k < 3; k++) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(-2.2 + k * 2.2, 0, 7.5); z.yaw = 0; G.zombies.damage(z, 9999, 'body', new V(0, 0, -1)); z.deathK = k; } __sim(0.3); G.state = 'paused'; })()`);
    await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, 'deaths.png'), clip: { x: 240, y: 150, width: 800, height: 450 } });
    await page.evaluate(`(() => { const G = __G; G.state = 'playing'; __sim(0.25); G.state = 'paused'; })()`);
    await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, 'deaths2.png'), clip: { x: 240, y: 150, width: 800, height: 450 } });
    await page.evaluate(`(() => { const G = __G; G.state = 'playing'; G.hero.ult = 0.62; __sim(0.1); G.state = 'paused'; })()`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, 'hud.png') });
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 5).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
