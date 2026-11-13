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
  // B kills a zombie: the hit goes to the host, the kill and the score come back to B
  const kill = await B.evaluate(`(async () => { const G = __G; const z = G.zombies.list.find((q) => q.alive); if (!z) return 'no zombie on guest'; const i = G.zombies.list.indexOf(z); const c0 = G.score;
    G.zombies.damage(z, 9999, 'head', new G.THREE.Vector3(0, 0, -1), 1); await new Promise((r) => setTimeout(r, 900));
    return { i, pts: G.score - c0, aliveAfter: z.alive, dying: z.dying > 0, headless: z.headless }; })()`);
  console.log('guest kill', JSON.stringify(kill));
  const hostSide = await A.evaluate(`({ z: __G.zombies.list[${kill.i}] && __G.zombies.list[${kill.i}].alive, killed: __G.wave.killed })`);
  console.log('host after', JSON.stringify(hostSide));
  check(kill.pts > 0 && kill.dying && hostSide.z === false && hostSide.killed >= 1, 'a guest kill goes through the host and scores for the guest');
  check(await B.evaluate('__G.weapons.S.inv.join()') === await B.evaluate('__G.hero.def.weapon'), 'the guest holds its hero\'s one weapon');
  // a zombie next to B hurts B (the host decides)
  const hurt = await A.evaluate(`(() => { const G = __G; const av = [...G.coop.avatars.values()][0]; const z = G.zombies.list.find((q) => q.alive && !q.T.fly && !q.T.boss); if (!z || !av) return 'none';
    z.pos.set(av.pos.x + 0.8, 0, av.pos.z); z.tgt = av.target; z.tgtT = 9; z.attackT = 0; return 'ok'; })()`);
  await A.waitForTimeout(2500);
  const hb = await B.evaluate('({ hp: __G.player.hp, max: __G.player.maxHp })');
  console.log('hurt', hurt, JSON.stringify(hb));
  check(hb.hp < hb.max, 'a zombie on the host bites the guest');
  const party = await A.evaluate(`(() => { const G = __G; const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); const r = { n: G.party.count(), hp: z.maxHp, base: Math.round(BZ.ZOMBIES.walker.hp * BZ.WAVE.hpMul(1) * G.env.zHp) }; G.zombies.kill(z, 'body', new G.THREE.Vector3(0, 0, 1), { credit: false }); return r; })()`);
  check(party.n === 2 && party.hp === Math.round(party.base * 1.35), `two players make zombies 35% tougher (${party.hp} vs ${party.base})`);
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
  // a big boss: the guest sees its own body, its moves and the shots it fires
  const bi = await A.evaluate(`(() => { const G = __G; const av = [...G.coop.avatars.values()][0];
    const z = G.zombies.spawn('dragon', 3, { x: av.pos.x, z: av.pos.z - 12, dir: [0, 1], name: 't' }); __sim(0.1);
    const B = G.zombies.kinds.bosses(); const kit = BZ.BOSS_KITS.dragon; const S = z.bs; S.rest = 99; S.cur = 'barrage'; S.t = 0; S.data = {}; S.dur = kit.moves.barrage.dur; S.queue = [];
    G.events.emit('zk', { t: 'bm', i: G.zombies.list.indexOf(z), m: 'barrage', d: S.dur });
    return G.zombies.list.indexOf(z); })()`);
  let gb = null;
  for (let i = 0; i < 12 && !(gb && gb.orbs > 0); i++) { await A.waitForTimeout(250); gb = await B.evaluate(`(() => { const z = __G.zombies.list[${bi}]; const R = z.body.x.dragon; return { alive: z.alive, type: z.type, rig: !!(R && R.g.visible), cur: z.bs && z.bs.cur, orbs: __G.zombies.kinds.bosses().debug().orbs }; })()`); }
  console.log('boss', JSON.stringify(gb));
  check(gb.alive && gb.type === 'dragon' && gb.rig && gb.orbs > 0, 'the guest sees the dragon boss, its body and the fireballs it shoots');
  await A.evaluate(`(() => { const G = __G; const z = G.zombies.list[${bi}]; G.zombies.damage(z, z.hp + 10, 'body', new G.THREE.Vector3(0, 0, -1), 1, {}); })()`);
  await A.waitForTimeout(1200);
  check(await B.evaluate(`!__G.zombies.list[${bi}].alive`), 'the boss dies on the guest screen too');
  // the host blows a hole in the guard post: the guest's town breaks the same way and loses the same solids
  const tbh = await A.evaluate(`(() => { const G = __G; G.gear.explode(new G.THREE.Vector3(18.6, 1.4, -21.6), 6.5, 480); __sim(0.2); return G.destruct.pieces.filter((p) => p.broken).map((p) => p.id).sort((a, b) => a - b); })()`);
  await A.waitForTimeout(1500);
  const gbk = await B.evaluate(`(() => { const G = __G; const ids = G.destruct.pieces.filter((p) => p.broken).map((p) => p.id).sort((a, b) => a - b); return { ids, solid: ids.some((i) => G.world.solids.includes(G.destruct.pieces[i].solid)) }; })()`);
  console.log("terrain", JSON.stringify({ host: tbh, guest: gbk.ids }));
  check(tbh.length > 0 && tbh.every((i) => gbk.ids.includes(i)) && !gbk.solid, `the guest sees the same wall pieces break (${tbh.length} on the host, ${gbk.ids.length} on the guest)`);
  // the wave ends: both get three upgrade cards; the next wave waits until both have picked
  await A.evaluate(`(() => { const G = __G; G.zombies.clear(); G.wave.toSpawn = 0; G.wave.killed = G.wave.total; })()`);
  await A.waitForTimeout(1200); for (let i = 0; i < 16 && (await B.evaluate('__G.state')) !== 'pick'; i++) await A.waitForTimeout(250);
  const p0 = { A: await A.evaluate('({ s: __G.state, n: __G.wave.n, cards: document.querySelectorAll("#pick-list [data-pick]").length })'), B: await B.evaluate('({ s: __G.state, n: __G.wave.n, cards: document.querySelectorAll("#pick-list [data-pick]").length })') };
  await A.evaluate('__G.pickChoose(__G.pickOpts[0])'); await A.waitForTimeout(1200);
  const p1 = { A: await A.evaluate('({ s: __G.state, n: __G.wave.n, ph: __G.wave.phase, wait: __G.wave.waiting() })'), Bwait: await B.evaluate('__G.wave.waiting()') };
  await B.evaluate('__G.pickChoose(__G.pickOpts[0])'); await A.waitForTimeout(1500);
  const p2 = { A: await A.evaluate('({ s: __G.state, n: __G.wave.n, ph: __G.wave.phase })'), B: await B.evaluate('({ s: __G.state, n: __G.wave.n, ph: __G.wave.phase })') };
  console.log('picks', JSON.stringify({ p0, p1, p2 }));
  check(p0.A.s === 'pick' && p0.B.s === 'pick' && p0.A.cards === 3 && p0.B.cards === 3, 'a cleared wave puts both players on the upgrade pick');
  check(p1.A.ph === 'pick' && p1.A.wait === 1 && p1.Bwait === 1, `after the host picks, the wave waits for the guest (${p1.A.wait} waiting)`);
  check(p2.A.n === p0.A.n + 1 && p2.A.ph === 'fight' && p2.B.s === 'playing' && p2.B.n === p2.A.n, `when both have picked, wave ${p2.A.n} starts for both`);
  await A.evaluate('__G.god = true'); await B.evaluate('__G.god = true');
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
