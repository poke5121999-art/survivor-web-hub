// Two players in one fight, two pages of one browser. FAKE=0 goes through real Unity Relay; otherwise the pages talk
// over BroadcastChannel (?fakenet=1). BZ_BASE=<Pages url> tests the pushed build.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [FAKE=0] node games/blockade-z/tools/coop-test.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.smoke-blockade-z');
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const FAKE = process.env.FAKE !== '0';
const BASE = process.env.BZ_BASE;
(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'd@t' })));
  const q = `nolock=1&noaudio=1&god=0${FAKE ? '&fakenet=1' : ''}`;
  const A = await ctx.newPage(); const B = await ctx.newPage();
  for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', (e) => console.log(n, 'PAGEERR', e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(n, m.type(), m.text().slice(0, 300)); }); }
  const url = (BASE || srv.base) + '/games/blockade-z/index.html?seed=3&' + q;
  await A.goto(url); await B.goto(url.replace('seed=3', 'seed=4'));
  await A.waitForFunction('window.__ready === true'); await B.waitForFunction('window.__ready === true');
  await A.evaluate("__G.settings.coopName = 'Chu'; __G.events.emit('ui:coophost')");
  await A.waitForFunction("__G.state === 'select'", null, { timeout: 30000 });
  const code = await A.evaluate('__G.coop.code');
  await A.evaluate('__select.pick(3); __select.go()');
  console.log('room', code);
  await B.evaluate(`__G.settings.coopName = 'Khach'; __G.events.emit('ui:coopjoin', { code: '${code}' })`);
  await B.waitForFunction("__G.state === 'select'", null, { timeout: 30000 });
  await B.evaluate('__select.pick(4); __select.go()');
  await A.waitForTimeout(5000);
  const s1 = {
    A: await A.evaluate("({ state: __G.state, host: __G.coop.host, peers: __G.coop.players(), alive: __G.zombies.aliveCount(), wave: __G.wave.n, av: [...__G.coop.avatars.keys()] })"),
    B: await B.evaluate("({ state: __G.state, guest: __G.coop.guest, me: __G.coop.me, alive: __G.zombies.aliveCount(), wave: __G.wave.n, rem: __G.wave.remaining(), av: [...__G.coop.avatars.keys()], weather: __G.sky.weather() })"),
  };
  console.log('sync', JSON.stringify(s1));
  check(s1.A.host && s1.B.guest && s1.A.av.length === 1 && s1.B.av.includes('h'), 'host and guest see each other');
  check(s1.B.alive > 0 && Math.abs(s1.B.alive - s1.A.alive) <= 2 && s1.B.wave === s1.A.wave, `the guest sees the host's zombies and wave (${s1.B.alive} vs ${s1.A.alive})`);
  // B kills a zombie: the hit goes to the host, the kill and the coins come back to B
  const kill = await B.evaluate(`(async () => { const G = __G; const z = G.zombies.list.find((q) => q.alive); if (!z) return 'no zombie on guest'; const i = G.zombies.list.indexOf(z); const c0 = G.coins;
    G.zombies.damage(z, 9999, 'head', new G.THREE.Vector3(0, 0, -1), 1); await new Promise((r) => setTimeout(r, 900));
    return { i, coins: G.coins - c0, aliveAfter: z.alive, dying: z.dying > 0, headless: z.headless }; })()`);
  console.log('guest kill', JSON.stringify(kill));
  const hostSide = await A.evaluate(`({ z: __G.zombies.list[${kill.i}] && __G.zombies.list[${kill.i}].alive, killed: __G.wave.killed })`);
  console.log('host after', JSON.stringify(hostSide));
  check(kill.coins > 0 && kill.dying && hostSide.z === false && hostSide.killed >= 1, 'a guest kill goes through the host and pays the guest');
  // B drops its katana; the host spawns it and both see it; A picks it up
  await B.evaluate("__G.weapons.selectSlot(1)"); await B.waitForTimeout(600);
  await B.evaluate("__G.weapons.dropCur()"); await B.waitForTimeout(1500);
  const g = { A: await A.evaluate('__G.weapons.ground.map((g) => g.id + ":" + g.gid)'), B: await B.evaluate('__G.weapons.ground.map((g) => g.id + ":" + g.gid)') };
  console.log('ground', JSON.stringify(g));
  check(g.A.length === 1 && g.A[0] === g.B[0], 'a weapon the guest drops lies on the ground for both');
  // B picks it back up through the host
  await B.evaluate("(() => { const it = __G.weapons.ground[0]; if (it) __G.player.pos.set(it.pos.x, 0, it.pos.z + 0.3); })()"); await B.waitForTimeout(300);
  await B.evaluate("__G.weapons.pickup()"); await B.waitForTimeout(1200);
  console.log('repick', JSON.stringify({ Binv: await B.evaluate('__G.weapons.S.inv'), Aground: await A.evaluate('__G.weapons.ground.length'), Bground: await B.evaluate('__G.weapons.ground.length') }));
  const rp = { inv: await B.evaluate('__G.weapons.S.inv.join()'), a: await A.evaluate('__G.weapons.ground.length') };
  check(rp.inv === 'smg,katana' && rp.a === 0, 'the guest picks it back up through the host');
  // a zombie next to B hurts B (the host decides)
  const hurt = await A.evaluate(`(() => { const G = __G; const av = [...G.coop.avatars.values()][0]; const z = G.zombies.list.find((q) => q.alive && !q.T.fly && !q.T.boss); if (!z || !av) return 'none';
    z.pos.set(av.pos.x + 0.8, 0, av.pos.z); z.tgt = av.target; z.tgtT = 9; z.attackT = 0; return 'ok'; })()`);
  await A.waitForTimeout(2500);
  const hb = await B.evaluate('({ hp: __G.player.hp, max: __G.player.maxHp })');
  console.log('hurt', hurt, JSON.stringify(hb));
  check(hb.hp < hb.max, 'a zombie on the host bites the guest');
  await A.evaluate('__G.god = true'); await B.evaluate('(() => { __G.god = true; __G.player.hp = __G.player.maxHp; })()');
  // special kinds: the guest sees the type, the shield, the elite; a frost bite slows the guest
  const sk = await A.evaluate(`(() => { const G = __G; const av = [...G.coop.avatars.values()][0];
    const s = G.zombies.spawn('shielder', 1, { x: av.pos.x + 6, z: av.pos.z, dir: [0, 1], name: 't' }); s.speed = 0; G.zombies.elite(s, 'regen');
    const f = G.zombies.spawn('frost', 1, { x: av.pos.x + 0.8, z: av.pos.z, dir: [0, 1], name: 't' }); f.pos.set(av.pos.x + 0.8, 0, av.pos.z); f.attackT = 0;
    return G.zombies.list.indexOf(s); })()`);
  await A.waitForTimeout(3000);
  const gs = await B.evaluate(`(() => { const z = __G.zombies.list[${sk}]; return { type: z.type, alive: z.alive, shield: z.body.x.shield.visible, elite: z.elite, gem: z.body.x.gem.visible, slow: __G.player.slowT > 0 || __G.player.hp < __G.player.maxHp }; })()`);
  console.log('kinds', JSON.stringify(gs));
  check(gs.alive && gs.type === 'shielder' && gs.shield && gs.elite === 'regen' && gs.gem, 'the guest sees a special kind with its shield and its elite mark');
  // hero kits over the wire: the guest's Sóng băng freezes the host's zombies, its Lôi phạt hurts them, the host sees the bolt
  await A.evaluate(`(() => { const G = __G; G.zombies.clear(); const av = [...G.coop.avatars.values()][0];
    for (let i = 0; i < 3; i++) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(av.pos.x + 2 + i, 0, av.pos.z); z.speed = 0; z.hp = z.maxHp = 2000; z.attackT = 99; } })()`);
  await A.waitForTimeout(800);
  const u1 = await B.evaluate(`(() => { const G = __G; G.hero.set('bang'); G.hero.reset(); return G.hero.use('s1'); })()`);
  await A.waitForTimeout(800);
  const fr = await A.evaluate('__G.zombies.list.filter((z) => z.alive && z.frozen > 0).length');
  await B.evaluate(`(() => { const G = __G; const z = G.zombies.list.find((q) => q.alive); G.hero.set('sam'); G.hero.reset(); const P = G.player; P.yaw = Math.atan2(-(z.pos.x - P.pos.x), -(z.pos.z - P.pos.z)); P.pitch = -Math.atan2(1.4, Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z)); })()`);
  await B.waitForTimeout(300); await B.evaluate("__G.hero.use('s2')");
  await A.waitForTimeout(2000);
  const sm = await A.evaluate('__G.zombies.list.filter((z) => z.alive).reduce((a, z) => a + (z.maxHp - z.hp), 0)');
  console.log('kitnet', fr, Math.round(sm));
  check(fr === 3 && sm > 100, `a guest's skills reach the host: ${fr} frozen, ${Math.round(sm)} damage from the bolt`);
  await A.screenshot({ path: OUT + '/coop-A.png' }); await B.screenshot({ path: OUT + '/coop-B.png' });
  console.log('errors', JSON.stringify({ A: await A.evaluate('window.__errors.slice(0, 3)'), B: await B.evaluate('window.__errors.slice(0, 3)') }));
  await A.evaluate('__G.coop.stop()'); await B.waitForTimeout(1500);
  const hl = await B.evaluate('({ on: __G.coop.on, state: __G.state })');
  console.log('host left', JSON.stringify(hl));
  check(!hl.on && hl.state === 'title', 'when the host leaves the guest goes back to the title');
  await br.close(); srv.close();
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
