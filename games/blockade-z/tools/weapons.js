// The eight newer weapons (spear, longsword, glaive, fists, minigun, dual pistols, javelin, shuriken): screenshots in first and
// third person for review, a contact sheet, and checks that each one does what its design says.
// Then one check per hero signature (wind blade, shield, healing dart, heat and jam, mark and blink, cluster rocket, shatter,
// fire ring, chain lightning, poison cloud, nail pin) and a first/third person shot of each effect (sheet-sig-*.png).
// QUICK=1 skips the eight weapons' look shots.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/weapons.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.weapons-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const NEW = [['spear', 'bang', 'fp'], ['longsword', 'thep', 'fp'], ['glaive', 'doc', 'fp'], ['fists', 'hoa', 'fp'], ['minigun', 'mua', 'rg'], ['dualpistol', 'yta', 'rg'], ['javelin', 'sam', 'rg'], ['shuriken', 'bong', 'rg']];

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'weapons@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?fp=1&autostart=1&nolock=1&seed=4&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const clearHud = () => page.evaluate("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }");
    // hand the hero its weapon and stand in the plaza; zs = [[x, z], ...] standing, unkillable zombies
    const stage = (hero, zs, tp) => page.evaluate(`(() => { const G = __G; G.god = true; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
      __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${hero}')); __select.go(); __sim(0.2); G.state = 'playing'; G.tps.on = ${!!tp};
      G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); const P = G.player; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.04; P.vel.set(0, 0, 0); P.input.fire = false;
      const out = []; for (const [x, zz] of ${JSON.stringify(zs)}) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(x, 0, zz); z.yaw = 0; z.speed = 0; z.hp = z.maxHp = 99999; z.attackT = 99; out.push(z); }
      G.weapons.S.combo = 0; __sim(0.45); return { w: G.weapons.cur() }; })()`);
    // tp: also a second frame from the front right, where the held weapon and both arms can be seen
    const freeze = async (name, tp) => {
      await page.evaluate("__G.state = 'paused'"); await clearHud(); await page.waitForTimeout(180); await page.screenshot({ path: path.join(OUT, name + '.png') });
      if (tp) {
        await page.evaluate(`(() => { const G = __G; const P = G.player; const c = G.camera; c.position.set(P.pos.x + 1.9, P.pos.y + 1.5, P.pos.z - 2.4); c.lookAt(P.pos.x - 0.1, P.pos.y + 1.25, P.pos.z - 0.6); c.updateMatrixWorld(); })()`);
        await page.waitForTimeout(180); await page.screenshot({ path: path.join(OUT, name + '-side.png') });
      }
      await page.evaluate("__G.state = 'playing'");
    };

    // ---------- looks ----------
    // QUICK=1 skips the eight weapons' look shots (the signature checks and shots still run)
    for (const [id, hero, kind] of process.env.QUICK ? [] : NEW) {
      const zs = kind === 'fp' ? [[0, 8.6], [1.4, 7.4]] : [[0, 4], [-1.3, 6], [1.4, 7]];
      for (const tp of [false, true]) {
        const tag = (tp ? 'tp-' : 'fp-') + id;
        const r = await stage(hero, zs, tp);
        check(r.w === id, `${hero} holds ${id} (${r.w})`);
        await freeze(tag + '-idle', tp);
        // mid action: a swing / a burst / a throw, frozen part-way
        const hold = { spear: 0.1, longsword: 0.2, glaive: 0.17, fists: 0.07, minigun: 0.62, dualpistol: 0.22, javelin: 0.13, shuriken: 0.09 }[id];
        await page.evaluate(`(() => { const G = __G; G.player.input.fire = true; __sim(${hold}); G.player.input.fire = false; })()`);
        await freeze(tag + '-act', tp);
        if (id === 'glaive' || id === 'fists' || id === 'spear') {
          // the third pattern: spin / uppercut / thrust
          await page.evaluate(`(() => { const G = __G; G.player.input.fire = false; __sim(0.9); G.weapons.S.combo = 2; G.player.input.fire = true; __sim(${id === 'glaive' ? 0.2 : id === 'fists' ? 0.09 : 0.1}); G.player.input.fire = false; })()`);
          await freeze(tag + '-third', tp);
        }
      }
    }

    // ---------- behaviour ----------
    const run = async (hero, zs, body) => {
      await stage(hero, zs, false);
      return page.evaluate(`(() => { const G = __G; const P = G.player; const S = G.weapons.S; const Z = G.zombies.list.filter((z) => z.alive); const lost = () => Z.map((z) => Math.round(z.maxHp - z.hp)); ${body} })()`);
    };

    // spear: a thrust goes through two zombies in a line, reaches 3.6 m+
    let r = await run('bang', [[0, 9.2], [0, 8.0], [0, 6.3]], 'P.input.fire = true; __sim(0.25); P.input.fire = false; return { lost: lost() };');
    check(r.lost[0] > 0 && r.lost[1] > 0, `spear pierces 2 in a line at 2.8 m and 4 m (${r.lost.join('/')} dmg)`);
    check(r.lost[2] === 0, `spear does not reach 5.7 m (${r.lost[2]} dmg)`);
    r = await run('bang', [[0, 9.2], [2.6, 9.2]], 'P.input.fire = true; __sim(0.25); P.input.fire = false; return { lost: lost() };');
    check(r.lost[0] > 0 && r.lost[1] === 0, `spear thrust is narrow: the zombie ahead is hit (${r.lost[0]}), the one 2.6 m to the side is not (${r.lost[1]})`);

    // longsword: wide arc, high damage; combo ends in an overhead that hits harder
    r = await run('thep', [[0, 9.6], [-1.6, 10.2], [1.6, 10.2]], 'P.input.fire = true; __sim(0.45); P.input.fire = false; return { lost: lost() };');
    check(r.lost.every((v) => v > 0), `longsword's first arc hits three zombies side by side (${r.lost.join('/')})`);
    const trial = (combo) => run('thep', [[0, 9.6]], `let sum = 0; for (let i = 0; i < 6; i++) { Z[0].hp = Z[0].maxHp; S.combo = ${combo}; S.comboT = 5; S.swing = null; S.cool = 0; P.input.fire = true; __sim(0.1); P.input.fire = false; __sim(0.8); sum += lost()[0]; } return { sum, pat: S.lastPat };`);
    const one = await trial(0); const over = await trial(2);
    check(over.pat === 'over' && over.sum > one.sum * 1.2, `longsword's third swing is the overhead and hits harder (6 swings: ${one.sum} -> ${over.sum})`);

    // glaive: the third swing is a spin that hits behind; the first two do not
    r = await run('doc', [[0, 13.2], [0, 9.7]], 'S.combo = 0; S.comboT = 5; P.input.fire = true; __sim(0.3); P.input.fire = false; return { lost: lost() };');
    check(r.lost[0] === 0, `glaive's side sweep does not hit a zombie behind (${r.lost[0]})`);
    r = await run('doc', [[0, 13.2], [0, 9.7]], 'S.combo = 2; S.comboT = 5; P.input.fire = true; __sim(0.3); P.input.fire = false; return { lost: lost(), pat: S.lastPat };');
    check(r.pat === 'spin360' && r.lost[0] > 0 && r.lost[1] > 0, `glaive's spin hits the zombie behind (${r.lost[0]}) and the one in front (${r.lost[1]})`);

    // fists: quick weak jabs, the uppercut hits hard and throws the zombie back
    // counted from the punches' own hit events: the burn they set ticks on the same body in between
    r = await run('hoa', [[0, 10.4]], `const dm = []; G.events.on('hit', (e) => { if (e.melee && e.z === Z[0]) { dm.push(e.dmg); if (dm.length === 2) Z[0].vel.set(0, 0, 0); } }); P.input.fire = true; for (let i = 0; i < 90 && dm.length < 3; i++) __sim(1 / 60); P.input.fire = false; return { dm, t: S.shots };`);
    const jab = Math.min(r.dm[0], r.dm[1]); check(r.dm.length >= 3 && r.dm[2] > jab * 1.8 && jab < 40, `fists: two light jabs then a heavy uppercut (${r.dm.join(' / ')})`);
    r = await run('hoa', [[0, 10.4]], 'S.combo = 2; S.comboT = 5; const z = Z[0]; const z0 = z.pos.z; P.input.fire = true; __sim(0.12); P.input.fire = false; __sim(0.4); return { moved: +(z0 - z.pos.z).toFixed(2), vy: +z.pos.y.toFixed(2) };');
    check(r.moved > 0.4 || r.vy > 0.05, `the uppercut knocks the zombie back or up (${r.moved} m back, ${r.vy} m up)`);
    r = await run('hoa', [[0, 10.4]], 'S.combo = 0; S.comboT = 5; const z = Z[0]; const z0 = z.pos.z; P.input.fire = true; __sim(0.12); P.input.fire = false; __sim(0.4); return { moved: +(z0 - z.pos.z).toFixed(2) };');
    check(true, `(a jab pushes it ${r.moved} m)`);

    // minigun: spins up for 0.4 s before the first round, then a very high rate, with the build's slow
    r = await run('mua', [[0, 2]], `const out = {}; const s0 = S.shots; P.input.fire = true; __sim(0.2); out.early = S.shots - s0; out.spin = +S.spin.toFixed(2); out.ang = S.spinAng; __sim(0.28); out.late = S.shots - s0; const t1 = S.shots; __sim(1); out.rate = S.shots - t1; P.input.fire = false; out.mag = G.weapons.ammo().mag; return out;`);
    check(r.early === 0 && r.spin > 0.3 && r.spin < 0.7, `minigun fires nothing in the first 0.2 s of spin-up (${r.early} shots, spin ${r.spin})`);
    check(r.late > 0 && r.rate >= 15, `minigun fires after 0.4 s and keeps a high rate (${r.late} shots by 0.48 s, ${r.rate}/s)`);
    r = await run('mua', [], `const v = []; const W = BZ.WEAPONS.minigun; const slow = W.slow; for (const on of [false, true]) { W.slow = on ? slow : 0; P.pos.set(0, 0, 14); P.vel.set(0, 0, 0); P.yaw = 0; P.input.fire = true; P.touch.y = -1; __sim(1.2); v.push(Math.hypot(P.vel.x, P.vel.z)); P.input.fire = false; __sim(0.3); } W.slow = slow; P.touch.y = 0; return { v };`);
    check(r.v[1] < r.v[0] * 0.97 && r.v[1] > r.v[0] * 0.7, `the minigun slows its owner a little while firing (${r.v[0].toFixed(2)} -> ${r.v[1].toFixed(2)} m/s)`);

    // dual pistols: left and right muzzles take turns
    r = await run('yta', [[0, 4]], `const sides = []; let last = S.shots; P.input.fire = true; for (let i = 0; i < 120 && sides.length < 6; i++) { __sim(1 / 60); if (S.shots !== last) { last = S.shots; sides.push(S.side); } } P.input.fire = false; return { sides, lost: lost() };`);
    check(r.sides.length >= 6 && r.sides.every((v, i) => i === 0 || v !== r.sides[i - 1]), `dual pistols alternate muzzles (${r.sides.join('')}) and hit (${r.lost[0]} dmg)`);

    // javelin: a thrown arc that goes through three zombies
    r = await run('sam', [[0, 9], [0, 6.5], [0, 4]], `P.input.fire = true; __sim(0.2); P.input.fire = false; __sim(1.2); return { lost: lost(), mag: G.weapons.ammo().mag };`);
    check(r.lost.every((v) => v > 0) && r.mag === 2, `javelin pierces three zombies in a line (${r.lost.join('/')} dmg, ${r.mag} left in hand)`);
    r = await run('sam', [[0, 9.5], [0, 7.5], [0, 5.5], [0, 3.5]], `const hits = []; G.events.on('hit', (e) => { if (!e.chain) hits.push(Z.indexOf(e.z)); }); P.input.fire = true; __sim(0.2); P.input.fire = false; __sim(1.5); return { hits };`);
    check(r.hits.length === 3 && !r.hits.includes(3), `javelin stops after three (bodies hit: ${r.hits.join(',')} of 0-3)`);

    // shuriken: a fan of three, one star per zombie
    r = await run('bong', [[-0.62, 4], [0, 4], [0.62, 4]], `P.input.fire = true; __sim(0.15); P.input.fire = false; __sim(0.6); return { lost: lost() };`);
    check(r.lost.every((v) => v > 0), `shuriken throws a three-way fan (${r.lost.join('/')} dmg to left, centre, right)`);
    r = await run('bong', [[0, 4], [0, -2]], `P.input.fire = true; __sim(0.15); P.input.fire = false; __sim(0.6); return { lost: lost() };`);
    check(r.lost[0] > 0 && r.lost[1] === 0, `a star pierces one (${r.lost[0]}), not two (${r.lost[1]})`);

    // ---------- signatures: one check per hero ----------
    // Gió: the third katana cut throws a wind blade that reaches a zombie 10 m away; the first cut does not
    r = await run('gio', [[0, 2]], `S.combo = 2; S.comboT = 5; P.input.fire = true; __sim(0.1); P.input.fire = false; __sim(0.9); const third = lost()[0];
      Z[0].hp = Z[0].maxHp; P.pos.set(0, 0, 12); S.combo = 0; S.comboT = 5; S.swing = null; S.cool = 0; P.input.fire = true; __sim(0.1); P.input.fire = false; __sim(0.9); return { third, first: lost()[0] };`);
    check(r.third > 0 && r.first === 0, `gio: the third cut's wind blade cuts a zombie 10 m away (${r.third} dmg), the first cut does not (${r.first})`);
    // Thép: the raised shield takes 80% off a hit from the front, nothing off one from behind; he cannot swing behind it
    r = await run('thep', [[0, 9.6]], `P.input.ads = true; __sim(0.4); const V = (x, z) => new THREE.Vector3(P.pos.x + x, 1, P.pos.z + z);
      const front = G.hero.takenMul(V(0.4, -3)); const back = G.hero.takenMul(V(0, 3)); const side = G.hero.takenMul(V(3, 0)); const slow = P.slowT > 0; const s0 = S.shots; P.input.fire = true; __sim(0.5); P.input.fire = false; const swings = S.shots - s0;
      P.input.ads = false; __sim(0.4); const down = G.hero.takenMul(V(0.4, -3)); return { front, back, side, down, slow, swings, guard: +G.weapons.sig().guard.toFixed(2) };`);
    check(r.front < 0.25 && r.back === 1 && r.side === 1 && r.down === 1, `thep: the shield blocks a hit from the front (x${r.front}), not from behind (x${r.back}) or the side (x${r.side}); lowered x${r.down}`);
    check(r.slow && r.swings === 0, `thep: behind the shield he walks slowly (${r.slow}) and cannot swing (${r.swings} swings)`);
    // Y Tá: a left-pistol dart passing a hired soldier heals it, and still hurts the zombie behind
    r = await run('yta', [[0, 4]], `G.allies.hire(); const al = G.allies.list.find((a) => a.alive); al.hp = 40; const h0 = al.hp; const s0 = G.weapons.sig().healed; S.side = 0; P.input.fire = true;
      for (let i = 0; i < 45; i++) { al.pos.set(0.3, 0, 8); __sim(1 / 60); } P.input.fire = false; return { h0, h1: al.hp, healed: G.weapons.sig().healed - s0, lost: lost()[0] };`);
    check(r.h1 > r.h0 && r.lost > 0, `yta: darts heal a soldier in their path (${r.h0} -> ${r.h1} hp) and still hit the zombie (${r.lost} dmg)`);
    // Mưa: continuous fire heats the minigun until it jams; past 60% the rounds set zombies alight
    r = await run('mua', [[0, 2]], `P.input.fire = true; let jam = false; let burnAt = -1; let t = 0; for (; t < 9 && !jam; t += 1 / 30) { __sim(1 / 30); const s = G.weapons.sig(); if (s.jamT > 0) jam = true; if (burnAt < 0 && Z[0].st && Z[0].st.burn) burnAt = s.heat; }
      const s0 = S.shots; __sim(0.6); const during = S.shots - s0; __sim(1.2); const after = S.shots - s0; P.input.fire = false; return { jam, t: +t.toFixed(2), burnAt: +burnAt.toFixed(2), during, after };`);
    check(r.jam && r.t > 3 && r.during === 0 && r.after > 0, `mua: jams after ${r.t} s of fire, fires nothing for the jam (${r.during}), then fires again (${r.after})`);
    check(r.burnAt > 0.6, `mua: hot rounds set the zombie burning (first burn at heat ${r.burnAt})`);
    // Bóng: a star marks the zombie; right mouse steps behind it and makes the next hit a sure crit
    r = await run('bong', [[0, 4]], `P.input.fire = true; __sim(0.15); P.input.fire = false; __sim(0.5); const marked = !!G.weapons.sig().mark; P.input.ads = true; __sim(1 / 60); __sim(1 / 60); P.input.ads = false; __sim(0.05);
      const z = Z[0]; const s = G.weapons.sig(); return { marked, pz: +P.pos.z.toFixed(2), zz: +z.pos.z.toFixed(2), d: +Math.hypot(P.pos.x - z.pos.x, P.pos.z - z.pos.z).toFixed(2), sure: s.sureCrit, cd: +s.tpCd.toFixed(1) };`);
    check(r.marked && r.pz < r.zz && r.d < 2.6 && r.sure && r.cd > 5, `bong: marks the zombie (${r.marked}), steps behind it (player z ${r.pz}, zombie z ${r.zz}, ${r.d} m), next hit sure crit (${r.sure}), cooldown ${r.cd} s`);
    // Pháo Thủ: the rocket splits into three bomblets in flight, each one exploding
    r = await run('phao', [[0, -18]], `const s0 = G.weapons.sig(); P.pitch = 0.01; P.input.fire = true; __sim(0.03); P.input.fire = false; __sim(0.2); const mid = G.weapons.sig().rockets; __sim(2.2); const s1 = G.weapons.sig();
      return { splits: s1.splits - s0.splits, booms: s1.booms - s0.booms, mid };`);
    // 3 booms when it splits in the air, 4 when something in the way stops it first (the warhead bursts too)
    check(r.mid === 1 && r.splits === 1 && r.booms >= 3, `phao: one rocket in flight (${r.mid}) splits (${r.splits}) into bomblets that explode (${r.booms} booms)`);
    // Băng: four thrusts freeze a zombie; the next thrust shatters it for a big hit
    r = await run('bang', [[0, 9.2]], `const z = Z[0]; const thrust = () => { S.swing = null; S.cool = 0; S.comboT = 5; P.pos.set(0, 0, 12); P.vel.set(0, 0, 0); P.input.fire = true; __sim(0.05); P.input.fire = false; __sim(0.4); };
      let frozeAt = 0; const n = []; for (let i = 1; i <= 5 && !frozeAt; i++) { thrust(); n.push(z.st.chill ? z.st.chill.n : 0); if (z.frozen > 0) frozeAt = i; } const before = z.maxHp - z.hp; thrust(); return { frozeAt, n, shatter: Math.round(z.maxHp - z.hp - before), per: Math.round(before / Math.max(1, frozeAt)), after: z.frozen };`);
    // a build perk can add a stack of its own, so the freeze may come a thrust early
    check(r.n[0] >= 1 && r.frozeAt >= 3 && r.frozeAt <= 4 && r.shatter > 20 * r.per && r.after === 0, `bang: each thrust chills (stacks ${r.n.join(',')}), frozen on thrust ${r.frozeAt}, the next thrust shatters it (${r.shatter} dmg vs ${r.per} a thrust), thawed (${r.after})`);
    // Hoả: the uppercut lights a fire ring that burns a zombie beside him, outside the punch
    r = await run('hoa', [[0, 10.4], [2.3, 12]], `S.combo = 2; S.comboT = 5; P.input.fire = true; __sim(0.12); P.input.fire = false; const rings = G.weapons.sig().rings.length; __sim(1.2); const z = Z[1];
      return { rings, burn: !!(z.st && z.st.burn), lost: Math.round(z.maxHp - z.hp) };`);
    check(r.rings === 1 && r.burn && r.lost > 0, `hoa: the uppercut lights a fire ring (${r.rings}) that burns a zombie 2.3 m to the side (${r.burn}, ${r.lost} dmg)`);
    // Sấm: the javelin's impact chains lightning to the nearest zombies, not to one 11 m away
    r = await run('sam', [[0, 4], [2, 3], [-2, 3], [2.5, 6], [-2.5, 6], [7, -6]], `const hits = new Set(); G.events.on('hit', (e) => { if (e.chain) hits.add(Z.indexOf(e.z)); }); P.input.fire = true; __sim(0.2); P.input.fire = false; __sim(1.2);
      return { chain: G.weapons.sig().chainN, hits: [...hits], far: lost()[5] };`);
    check(r.chain >= 3 && r.hits.length >= 3 && r.far === 0, `sam: lightning chains to ${r.chain} zombies (${r.hits.join(',')}), not the far one (${r.far} dmg)`);
    // Độc: a swing leaves poison clouds that tick on a zombie standing in them
    r = await run('doc', [[0, 9.7], [0, 40]], `S.combo = 0; S.comboT = 5; P.input.fire = true; __sim(0.3); P.input.fire = false; const cl = G.weapons.sig().clouds; const c = cl[1] || cl[0]; const z = Z[1]; z.pos.set(c.p.x, 0, c.p.z); const t0 = G.weapons.sig().cloudTicks || 0; __sim(1.6);
      return { clouds: cl.length, poison: !!(z.st && z.st.poison), ticks: (G.weapons.sig().cloudTicks || 0) - t0, lost: Math.round(z.maxHp - z.hp) };`);
    check(r.clouds >= 3 && r.poison && r.ticks >= 2 && r.lost > 0, `doc: the swing leaves ${r.clouds} poison clouds that tick ${r.ticks} times on a zombie in one (poisoned ${r.poison}, ${r.lost} dmg)`);
    // Kỹ Sư: a nail into a zombie with a wall close behind pins it there; one in the open is not pinned
    r = await run('ky', [[0, 40], [0, 44]], `const V3 = (x, y, z) => new THREE.Vector3(x, y, z); let f = null;
      for (const [x, zz] of [[0, 12], [0, 0], [6, 6], [-6, 6], [6, -6], [-6, -6], [0, -10], [10, 0], [-10, 0]]) { for (let k = 0; k < 16 && !f; k++) { const yaw = (k / 16) * Math.PI * 2; const d = V3(-Math.sin(yaw), 0, -Math.cos(yaw)); const wh = G.world.raycast(V3(x, 1.1, zz), d, 26); if (wh && wh.t > 16 && Math.abs(wh.normal[1]) < 0.5) f = { x, zz, yaw, t: wh.t, d }; } if (f) break; }
      if (!f) return { none: true };
      const at = (k) => V3(f.x + f.d.x * k, 0, f.zz + f.d.z * k); const shoot = (zk) => { const p = at(f.t - zk - 6); P.pos.copy(p); P.vel.set(0, 0, 0); P.yaw = f.yaw; P.pitch = Math.atan2(1.1 - 1.6, 6); S.cool = 0; S.phase = 'ready'; G.weapons.ammo().mag = 6; P.input.fire = true; __sim(1 / 60); P.input.fire = false; };
      const z = Z[0]; z.pos.copy(at(f.t - 1.0)); const p0 = G.weapons.sig().pinned; shoot(1.0); __sim(0.25); const pinned = G.weapons.sig().pins.some((q) => q.z === z); const gap = +(f.t - Math.hypot(z.pos.x - f.x, z.pos.z - f.zz)).toFixed(2); __sim(0.5); const held = +(f.t - Math.hypot(z.pos.x - f.x, z.pos.z - f.zz)).toFixed(2);
      z.pos.set(0, 0, 40); const o = Z[1]; o.pos.copy(at(f.t - 8)); __sim(1.2); const p1 = G.weapons.sig().pinned; shoot(8); __sim(0.25); const open = G.weapons.sig().pins.some((q) => q.z === o);
      return { pinned, gap, held, open, n: p1 - p0, lost: lost()[1] };`);
    check(!r.none && r.pinned && r.gap < 0.75 && r.held < 0.75 && !r.open && r.lost > 0, `ky: a zombie 1 m from a wall is nailed to it (${r.pinned}, ${r.gap} m -> ${r.held} m from the wall), one in the open is not (${r.open})`);

    // Sói: the hatchet's third landed swing opens a bleed that keeps hurting; the claws (beast form) rake through several at once
    r = await run('soi', [[0, 10]], `const z = Z[0]; const b = []; for (let i = 0; i < 3; i++) { S.swing = null; S.cool = 0; S.comboT = 5; P.pos.set(0, 0, 12); P.vel.set(0, 0, 0); P.input.fire = true; __sim(0.05); P.input.fire = false; __sim(0.35); b.push(!!(z.st && z.st.bleed)); }
      const h0 = z.hp; __sim(1.5); return { b, ticks: Math.round(h0 - z.hp), n: G.weapons.sig().bleeds };`);
    check(!r.b[0] && !r.b[1] && r.b[2] && r.ticks > 10, `soi: the hatchet bleeds on the third landed swing only (${r.b.join(',')}), the bleed keeps hurting (${r.ticks} in 1.5 s)`);
    r = await run('soi', [[-1.2, 9.4], [0, 9.2], [1.2, 9.4]], `G.hero.ult = 1; G.hero.use('ult'); __sim(0.6); const w = G.weapons.cur(); Z.forEach((z) => { z.hp = z.maxHp; }); S.swing = null; S.cool = 0; P.pos.set(0, 0, 12); P.vel.set(0, 0, 0); P.input.fire = true; __sim(0.05); P.input.fire = false; __sim(0.3); return { w, lost: lost() };`);
    check(r.w === 'claws' && r.lost.filter((v) => v > 0).length >= 3, `soi: one claw swipe rakes all three zombies in front (${r.w}: ${r.lost.join('/')})`);
    // Nhện Đồng: every bolt adds a web stack (slower), the third roots the zombie for about 1.5 s
    r = await run('nhen', [[0, 6]], `const z = Z[0]; const n = []; for (let i = 0; i < 3; i++) { S.cool = 0; P.input.fire = true; __sim(1 / 60); P.input.fire = false; __sim(0.2); n.push(z.st && z.st.web ? z.st.web.n : 0); }
      const root = +z.rootT.toFixed(2); const p0 = z.pos.clone(); z.speed = 2; __sim(1); const held = +z.pos.distanceTo(p0).toFixed(2); __sim(0.8); return { n, root, held, free: z.rootT <= 0 };`);
    check(r.n[0] === 1 && r.n[1] === 2 && r.n[2] === 0 && r.root > 1.1 && r.held < 0.1 && r.free, `nhen: bolts stack web (${r.n.join(',')}), the third roots it ${r.root} s (moved ${r.held} m), then it is free`);
    r = await run('nhen', [[-2, -6], [2, -6]], `for (const z of Z) { z.speed = 2.4; z.attackT = 99; } __sim(0.8); G.zombies.applyStatus(Z[0], 'web', 1); G.zombies.applyStatus(Z[0], 'web', 1);
      const a = Z.map((z) => z.pos.clone()); __sim(0.6); const d = Z.map((z, i) => +z.pos.distanceTo(a[i]).toFixed(2)); return { webbed: d[0], free: d[1] };`);
    check(r.webbed < r.free * 0.8, `nhen: two web stacks slow a walker (${r.free} -> ${r.webbed} m in 0.6 s)`);

    // ---------- signature screenshots, first and third person ----------
    const shoot = async (hero, zs, tp, prep, name) => { await stage(hero, zs, tp); await page.evaluate(`(() => { const G = __G; const P = G.player; const S = G.weapons.S; const Z = G.zombies.list.filter((z) => z.alive); ${prep} })()`);
      // the fx keep ageing while the game is paused; hold them still so short flashes (lightning, sparks) are in the shot
      await page.evaluate('__G.fx.__u = __G.fx.update; __G.fx.update = () => {}'); await freeze(name, tp && hero === 'thep'); await page.evaluate('__G.fx.update = __G.fx.__u'); };
    const SIG = [
      ['gio', [[0, 3], [0.6, 5], [-0.6, 7]], 'S.combo = 2; S.comboT = 5; P.input.fire = true; __sim(0.1); P.input.fire = false; __sim(0.17);'],
      ['thep', [[0, 9]], 'P.input.ads = true; __sim(0.4); G.hero.takenMul(new THREE.Vector3(P.pos.x, 1, P.pos.z - 3)); __sim(0.03);'],
      ['yta', [[0, 4]], 'G.allies.hire(); const al = G.allies.list.find((a) => a.alive); al.hp = 40; S.side = 0; P.input.fire = true; let last = S.shots; for (let i = 0; i < 90; i++) { al.pos.set(0.6, 0, 8); __sim(1 / 60); if (S.shots !== last) { last = S.shots; if (S.side === 1 && i > 20) break; } } P.input.fire = false;'],
      ['mua', [[0, 2], [1, 3]], 'P.input.fire = true; __sim(3.4); P.input.fire = false;'],
      ['mua-jam', [[0, 2]], 'P.input.fire = true; for (let i = 0; i < 300 && !(G.weapons.sig().jamT > 0); i++) __sim(1 / 30); __sim(0.4); P.input.fire = false;'],
      ['bong', [[0, 4], [1.5, 6]], 'P.input.fire = true; __sim(0.15); P.input.fire = false; __sim(0.5);'],
      ['bong-blink', [[0, 4], [1.5, 6]], 'P.input.fire = true; __sim(0.15); P.input.fire = false; __sim(0.5); P.input.ads = true; __sim(1 / 60); P.input.ads = false; __sim(0.08);'],
      ['phao', [[0, -18], [2, -16]], 'P.pitch = 0.02; P.input.fire = true; __sim(0.03); P.input.fire = false; __sim(0.45);'],
      ['bang', [[0, 9.2]], 'const z = Z[0]; z.frozen = 2; S.combo = 0; S.comboT = 5; P.input.fire = true; __sim(0.05); P.input.fire = false; __sim(0.12);'],
      ['hoa', [[0, 10.4], [2.3, 12]], 'S.combo = 2; S.comboT = 5; P.input.fire = true; __sim(0.12); P.input.fire = false; __sim(0.18);'],
      ['sam', [[0, 4], [2, 3], [-2, 3], [2.5, 6], [-2.5, 6]], 'const c0 = G.weapons.sig().chainN; G.weapons.sig(); P.input.fire = true; __sim(0.2); P.input.fire = false; const zz = Z[0]; for (let i = 0; i < 90 && !(G.weapons.sig().chainN > 0 && G.weapons.sig().chainN !== c0) && zz.hp === zz.maxHp; i++) __sim(1 / 120);'],
      ['doc', [[0, 9.7], [1.5, 9]], 'S.combo = 2; S.comboT = 5; P.input.fire = true; __sim(0.3); P.input.fire = false; __sim(0.5);'],
      ['soi', [[0, 10], [1.2, 9.4]], 'for (let i = 0; i < 2; i++) { S.swing = null; S.cool = 0; S.comboT = 5; P.input.fire = true; __sim(0.05); P.input.fire = false; __sim(0.35); } S.swing = null; S.cool = 0; P.input.fire = true; __sim(0.05); P.input.fire = false; __sim(0.08);'],
      ['nhen', [[0, 6], [1.4, 7]], 'for (let i = 0; i < 3; i++) { S.cool = 0; P.input.fire = true; __sim(1 / 60); P.input.fire = false; __sim(0.12); }'],
      ['ky', [[0, 40]], 'const V3 = (x, y, z) => new THREE.Vector3(x, y, z); let f = null; for (let k = 0; k < 16 && !f; k++) { const yaw = (k / 16) * Math.PI * 2; const d = V3(-Math.sin(yaw), 0, -Math.cos(yaw)); const wh = G.world.raycast(V3(0, 1.1, 12), d, 26); if (wh && wh.t > 9 && Math.abs(wh.normal[1]) < 0.5) f = { yaw, t: wh.t, d }; } if (!f) return; const at = (k) => V3(f.d.x * k, 0, 12 + f.d.z * k); Z[0].pos.copy(at(f.t - 1)); P.pos.copy(at(f.t - 6)); P.yaw = f.yaw; P.pitch = Math.atan2(1.1 - 1.6, 5); S.cool = 0; P.input.fire = true; __sim(1 / 60); P.input.fire = false; __sim(0.06);'],
    ];
    for (const [key, zs, prep] of SIG) for (const tp of [false, true]) await shoot(key.split('-')[0], zs, tp, prep, (tp ? 'tp-sig-' : 'fp-sig-') + key);

    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 4).join(' | ') : ''));

    // ---------- contact sheets (PIL) ----------
    const py = `
import sys, os
from PIL import Image, ImageDraw
out = sys.argv[1]
FP = (300, 120, 1280, 720)   # the viewmodel area
TP = (230, 190, 850, 570)    # the hero from behind
SD = (160, 60, 1120, 660)    # the hero from the front right
CW, CH = 480, 300
def sheet(name, ids, cells):
    im = Image.new('RGB', (CW * len(cells), CH * len(ids)), (20, 20, 24))
    d = ImageDraw.Draw(im)
    for r, wid in enumerate(ids):
        for c, (key, box) in enumerate(cells):
            f = os.path.join(out, key.replace('{w}', wid) + '.png')
            if os.path.exists(f):
                t = Image.open(f).convert('RGB').crop(box); t.thumbnail((CW, CH)); im.paste(t, (c * CW, r * CH))
            d.text((c * CW + 6, r * CH + 4), key.replace('{w}', wid), fill=(255, 255, 0))
    im.save(os.path.join(out, name))
main = [('fp-{w}-idle', FP), ('fp-{w}-act', FP), ('tp-{w}-idle-side', SD), ('tp-{w}-act-side', SD)]
sheet('sheet-1.png', ['spear', 'longsword', 'glaive', 'fists'], main)
sheet('sheet-2.png', ['minigun', 'dualpistol', 'javelin', 'shuriken'], main)
sheet('sheet-third.png', ['spear', 'glaive', 'fists'], [('fp-{w}-third', FP), ('tp-{w}-third-side', SD), ('tp-{w}-third', TP)])
sig = ['gio', 'thep', 'yta', 'mua', 'mua-jam', 'bong', 'bong-blink', 'phao', 'bang', 'hoa', 'sam', 'doc', 'ky', 'soi', 'nhen']
sheet('sheet-sig-1.png', sig[:7], [('fp-sig-{w}', (160, 90, 1280, 720)), ('tp-sig-{w}', (160, 90, 1280, 720))])
sheet('sheet-sig-2.png', sig[7:], [('fp-sig-{w}', (160, 90, 1280, 720)), ('tp-sig-{w}', (160, 90, 1280, 720))])
sheet('sheet-sig-shield.png', ['thep'], [('fp-sig-{w}', (0, 0, 1280, 720)), ('tp-sig-{w}', (0, 0, 1280, 720)), ('tp-sig-{w}-side', (0, 0, 1280, 720))])
`;
    fs.writeFileSync(path.join(OUT, 'sheet.py'), py);
    try { execFileSync('python', [path.join(OUT, 'sheet.py'), OUT]); console.log('sheets: ' + ['sheet-1', 'sheet-2', 'sheet-third', 'sheet-sig-1', 'sheet-sig-2', 'sheet-sig-shield'].map((n) => path.join(OUT, n + '.png')).join(', ')); } catch (e) { console.log('sheet failed: ' + e.message); }
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
