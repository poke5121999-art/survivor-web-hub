/*
 * Tước Sĩ Lục (boss_fel_lord, Sir Verdant) trong Mê Trận Tà Vương (games/soulknight/js/bosses/boss_fel_lord.js + js/matrix3.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-fellord.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-fellord/.
 *
 *  1. Luật bốc: chỉ ải x-5 của tầng 3, 6, 9... (tầng 1, 2, 4, 5 không), xác suất ~verdantChance, ép tắt được; vào phòng trùm ở 3-5 là gặp ông.
 *  2. Hình vẽ: mọi khung SK.draw của trùm/khối/cua/đạn đều là khoá của prefab gốc (boss_fel_lord, fel_lord_clone1/2, bullet_*) hoặc clip fel_lord/*;
 *     phủ đủ idle, tay, nổi giận, dive, weak, dead, diving, khối thật/giả, nón lục/đỏ. Số máu = 3600 × (1 + 0,15 P) (chép tay từ wiki).
 *  3. Từng đòn chạy trọn và đo được: nón lục (7 viên, bãi lửa, trừ máu), nón đỏ (7 viên, đảo hướng thật, pha lê đỏ -> buff 15 s), cầu lửa (9 đá, bãi lửa),
 *     6 khối (1 thật máu ~500 nhân hệ số, 5 giả phình khi bị bắn, trùm bất tử trong lúc đó, quả cầu lửa trừ máu, hạ khối thật -> kiệt sức 20 s),
 *     cua (~1000 máu riêng, bắn cầu lửa trừ máu, hạ cua -> kiệt sức 10 s), nổi giận (3 cầu lửa xoay trừ máu).
 *  4. Luật chọn đòn tự nhiên: biến hình chỉ sau >= 2 đòn thường, không lặp liền kề.
 *  5. Hạ bằng súng thật (giữ J): chết, phòng trùm mở, có rương; Mê Trận +3 Pha Lê và vạch mốc Uy Áp x0,7; Lợi Hại +4.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-fellord');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(80);
  }
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /\[SK\]/.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
  const shot = (n, clip) => p.screenshot({ path: path.join(SHOTS, n + '.png'), clip });
  const crop = { x: 340, y: 110, width: 600, height: 460 };

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 20000 });
  await p.evaluate(() => { SK_GAME.debug.seed(7); SK.lobby.launch('knight', 'matrix', []); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 12000);
  await p.evaluate(() => {
    SK.matrix.npcOff = true; SK.matrix.C3.exclusiveRate = 0;
    for (let i = 0; i < 5; i++) SK.matrixNextFloor();   // tầng 2..6 để có x-5 của tầng 3 và 6 (cách game nối khi qua cổng)
    // Bộ do: chặn SK.draw (tên khung) và SK.hurtPlayer (lượng mất thật, người chơi vẫn bật god)
    window.__draw = {}; const d0 = SK.draw;
    SK.draw = function (ctx, name, ...a) { window.__draw[name] = (window.__draw[name] || 0) + 1; return d0.call(this, ctx, name, ...a); };
    window.__hurt = []; const h0 = SK.hurtPlayer;
    SK.hurtPlayer = function (G, dmg, ...r) {
      const P = G.player, b = P.hp + P.armor, ret = h0.call(this, G, dmg, ...r), e = SK.felLord.find();
      window.__hurt.push({ dmg, lost: b - (P.hp + P.armor), atk: e ? e.cur : null });
      return ret;
    };
    window.__felAtk = []; SK.on('felAttack', (g, e, n) => window.__felAtk.push(n));
  });

  // ---------------------------------------------------------------- 1. luật bốc
  const rule = await p.evaluate(() => {
    const G = SK.G, C3 = SK.matrix.C3, o = { fel: {}, chance: C3.verdantChance }, keep = G.stage, force = SK.matrix.verdantForce;
    SK.matrix.verdantForce = false;
    const run = (label, n) => {
      G.stage = SK.STAGES.find(s => s.label === label); let k = 0;
      for (let i = 0; i < n; i++) if (SK.bossWaves(G).some(w => w.indexOf('boss_fel_lord') >= 0)) k++;
      return k;
    };
    C3.verdantChance = 1;
    for (const l of ['1-5', '2-5', '4-5', '5-5', '3-1', '3-4']) o.fel[l] = run(l, 20);
    o.fel['3-5'] = run('3-5', 20); o.fel['6-5'] = run('6-5', 20);
    C3.verdantChance = 0; o.off = run('3-5', 40);
    C3.verdantChance = 0.5; o.half = run('3-5', 400) / 400;
    C3.verdantChance = o.chance; SK.matrix.verdantForce = force; G.stage = keep;
    return o;
  });
  const none = ['1-5', '2-5', '4-5', '5-5', '3-1', '3-4'].every(l => rule.fel[l] === 0);
  check('luật bốc: chỉ x-5 của tầng 3, 6 (cơ hội 100% thì ra, các ải/tầng khác không), cơ hội 0 thì không', none && rule.fel['3-5'] === 20 && rule.fel['6-5'] === 20 && rule.off === 0, JSON.stringify(rule));
  check('xác suất bốc ~50% ở tầng 3 (400 lần)', Math.abs(rule.half - 0.5) < 0.09, rule.half + '');

  // ---------------------------------------------------------------- vào phòng trùm 3-5
  await p.evaluate(() => { SK.matrix.verdantForce = true; SK_GAME.debug.stage('3-5'); SK_GAME.debug.god(true); });
  await until(p, () => SK_GAME.phase === 'play' && SK_GAME.stage === '3-5', null, 8000);
  await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  const spawned = await until(p, () => SK.G.enemies.some(e => e.id === 'boss_fel_lord'), null, 6000);
  check('3-5: phòng trùm sinh Tước Sĩ Lục (đường chơi thật: vào phòng -> G.buildWaves -> SK.bossWaves)', spawned);
  const info = await p.evaluate(() => {
    const G = SK.G, e = SK.felLord.find(), m = G.matrix, pf = SK.prefab('boss_fel_lord');
    return { P: m.P, hpMax: e.hpMax, st: e.st, mode: e.mode, parts: pf.length, enemyId: pf[0].mbs.BossFelLord.enemy_id, anim: Object.keys(pf[0].a).length,
      clone1: !!SK.prefab('fel_lord_clone1'), clone2: !!SK.prefab('fel_lord_clone2'), fsm: pf[1].mbs.PlayMakerFSM.fsm.states.map(s => s.name).join(',') };
  });
  check('prefab gốc: boss_fel_lord 51 phần, 10 clip, BossFelLord.enemy_id, PlayMakerFSM Idle/Sleep/Move/Skill/Dizzy/Dead; có fel_lord_clone1/2',
    info.parts === 51 && info.anim === 10 && info.enemyId === 'boss_fel_lord' && info.clone1 && info.clone2 && info.fsm === 'Idle,Sleep,Move,Skill,Dizzy,Dead', JSON.stringify(info));
  check('máu = 3600 × (1 + 0,15 × P) [WIKI Sir Verdant 3600; Mê Trận 1 + 0,15 P], P = 2 → 4680', info.P === 2 && info.hpMax === Math.round(3600 * (1 + 0.15 * info.P)), 'P ' + info.P + ' · máu ' + info.hpMax);
  await until(p, () => SK.felLord.find().st === 'idle', null, 6000);
  await p.evaluate(() => { const e = SK.felLord.find(); e.cd = 99; });

  const near = (dy = 75) => p.evaluate(dy2 => { const e = SK.felLord.find(), P = SK.G.player; const [x, y] = SK.freeNear([e.x, e.y + dy2]); P.x = x; P.y = y; }, dy);
  // dọn trước mỗi đòn: xoá đạn/bãi/pha lê, hồi máu, giữ trùm ở giữa phòng
  const reset = () => p.evaluate(() => {
    const G = SK.G, e = SK.felLord.find(), P = G.player;
    e.arena.pr = []; e.arena.objs = []; e.cd = 99; G.felConf = 0; window.__hurt = [];
    P.hp = P.hpMax; P.armor = P.armorMax; P.invulT = 0;
  });
  const keepAlive = () => p.evaluate(() => { const P = SK.G.player; P.hp = P.hpMax; P.armor = P.armorMax; P.energy = P.energyMax; });
  const lostOf = atk => p.evaluate(a => window.__hurt.filter(h => h.atk === a).reduce((s, h) => s + h.lost, 0), atk);
  // chạy một đòn tới khi trùm về lại idle (đòn thường), người chơi đứng yên; gom thông số trong lúc chờ
  async function runBasic(atk, extraMs) {
    await reset(); await near();
    const before = await p.evaluate(() => { const e = SK.felLord.find(); return { shots: e.stats.shots, n: e.stats.atk }; });
    await p.evaluate(a => { const e = SK.felLord.find(); SK.felLord.start(SK.G, e, a); }, atk);
    let seen = { pools: 0, conf: 0, crystals: 0, objs: 0 };
    const t0 = Date.now();
    while (Date.now() - t0 < (extraMs || 7000)) {
      await keepAlive();
      const s = await p.evaluate(() => { const e = SK.felLord.find(); return { pools: e.arena.objs.filter(o => o.isPool).length, conf: SK.G.felConf || 0, cr: e.arena.objs.filter(o => o.isCrystal).length, mode: e.mode, pr: e.arena.pr.length }; });
      seen.pools = Math.max(seen.pools, s.pools); seen.conf = Math.max(seen.conf, s.conf); seen.crystals = Math.max(seen.crystals, s.cr);
      if (s.mode === 'idle' && Date.now() - t0 > 3500 && !s.pr) break;
      await sleep(70);
    }
    const after = await p.evaluate(() => { const e = SK.felLord.find(); return { shots: e.stats.shots, mode: e.mode, n: e.stats.atk }; });
    return { shots: after.shots - before.shots, ran: (after.n[atk] || 0) - (before.n[atk] || 0), mode: after.mode, lost: await lostOf(atk), seen };
  }

  // ---------------------------------------------------------------- 3. từng đòn
  await near(60); await sleep(500);
  await shot('idle', crop);
  const g = await runBasic('green');
  check('nón lục: chạy trọn 1 lần, ≥ 7 viên (+ quả con), bãi lửa lục xuất hiện, trừ máu người chơi', g.ran === 1 && g.mode === 'idle' && g.shots >= 7 && g.seen.pools >= 1 && g.lost > 0, JSON.stringify(g));
  const r = await runBasic('red');
  const conf = await p.evaluate(() => {
    const G = SK.G, I = SK.input; G.felConf = 4; I.held.right = true; I.held.left = false;
    const v = I.moveVec(); I.held.right = false; const v0 = I.moveVec(); G.felConf = 0;
    return { v: v.x, v0: v0.x };
  });
  check('nón đỏ: chạy trọn, đúng 7 viên không sát thương, đảo hướng thật (phím phải -> đi trái)', r.ran === 1 && r.mode === 'idle' && r.shots === 7 && r.lost === 0 && r.seen.conf > 0 && conf.v === -1,
    JSON.stringify(Object.assign({}, r, { conf })));
  // nón đỏ bắn trượt -> pha lê đỏ -> buff 15 s (×1,3 tốc đánh/chạy)
  await reset(); await p.evaluate(() => { const e = SK.felLord.find(), P = SK.G.player; const [x, y] = SK.freeNear([e.x - 150, e.y + 20]); P.x = x; P.y = y; SK.felLord.start(SK.G, e, 'red'); });
  await until(p, () => SK.felLord.find().arena.objs.some(o => o.isCrystal), null, 9000);
  const cry = await p.evaluate(() => {
    const G = SK.G, e = SK.felLord.find(), P = G.player, cs = e.arena.objs.filter(o => o.isCrystal), r0 = P.rateMul || 1, m0 = P.moveMul == null ? 1 : P.moveMul;
    const c = cs[0]; P.x = c.x; P.y = c.y;
    return { n: cs.length, r0, m0 };
  });
  await until(p, () => !!SK.G.felBuff, null, 3000);
  const buff = await p.evaluate(() => { const G = SK.G, P = G.player; return { t: G.felBuff && G.felBuff.t, r: P.rateMul, m: P.moveMul }; });
  await p.evaluate(() => { SK.G.felBuff.t = 0.15; });
  await until(p, () => !SK.G.felBuff, null, 2000);
  const back = await p.evaluate(() => { const P = SK.G.player; return { r: P.rateMul, m: P.moveMul }; });
  check('nón đỏ trượt rơi pha lê đỏ (≤ 3); nhặt -> buff cuồng nộ 15 s tăng tốc đánh và tốc chạy ×1,3, hết giờ trả lại đúng',
    cry.n >= 1 && cry.n <= 3 && buff.t > 14 && Math.abs(buff.r / cry.r0 - 1.3) < 0.01 && Math.abs(buff.m / cry.m0 - 1.3) < 0.01 && Math.abs(back.r - cry.r0) < 1e-6 && Math.abs(back.m - cry.m0) < 1e-6,
    JSON.stringify({ cry, buff, back }));
  const f = await runBasic('fireball');
  check('cầu lửa: chạy trọn, vỡ đúng 9 đá + bãi lửa lục, trừ máu người chơi', f.ran === 1 && f.mode === 'idle' && f.shots === 9 && f.seen.pools >= 1 && f.lost > 0, JSON.stringify(f));

  // ---------------------------------------------------------------- nổi giận: 3 cầu lửa xoay quanh
  await reset(); await near();
  await p.evaluate(() => { const e = SK.felLord.find(); e.hp = Math.round(e.hpMax * 0.45); e.cd = 99; });
  await until(p, () => SK.felLord.find().enraged, null, 6000);
  await sleep(300); await near(60); await sleep(300);
  await shot('angry', crop);
  const ang = await p.evaluate(() => new Promise(res => {
    const G = SK.G, e = SK.felLord.find(), P = G.player; window.__hurt = []; let n = 0;
    const iv = setInterval(() => {
      P.hp = P.hpMax; P.armor = P.armorMax; P.invulT = 0;
      const k = e.orb + 0; const a = k, bx = e.x + Math.cos(a) * 46, by = e.y - 24 + Math.sin(a) * 46 * 0.7;
      P.x = bx; P.y = by + 7;
      if (++n > 40) { clearInterval(iv); res({ lost: window.__hurt.reduce((s, h) => s + h.lost, 0), hits: window.__hurt.length, enraged: e.enraged, mode: e.mode }); }
    }, 60);
  }));
  check('nổi giận (dưới nửa máu): clip L1.angry rồi 3 cầu lửa xoay quanh, đứng đúng quỹ đạo thì mất máu', ang.enraged && ang.lost > 0 && ang.hits >= 1, JSON.stringify(ang));
  await p.evaluate(() => { const e = SK.felLord.find(); e.hp = e.hpMax; e.enraged = false; });

  // ---------------------------------------------------------------- 6 khối
  await reset(); await near();
  await p.evaluate(() => { const e = SK.felLord.find(); SK.felLord.start(SK.G, e, 'clone'); });
  await shot('clone-in', crop);
  const cubesUp = await until(p, () => SK.felLord.find().mode === 'cubes', null, 6000);
  await sleep(1200);
  await keepAlive(); await near(60);
  await shot('cubes', crop);
  const cu = await p.evaluate(() => {
    const G = SK.G, e = SK.felLord.find(), cs = e.cubes, real = cs.filter(c => c.real), fake = cs.filter(c => !c.real), hp0 = e.hp;
    const o = { n: cs.length, real: real.length, fake: fake.length, realHp: real[0].hpMax, hpK: e.hpMax / 3600, hidden: e.hb.off[1] < -1000 };
    o.bossHit = SK.hurtEnemy(G, e, 500, false, 0, 0); o.bossKeep = e.hp === hp0;   // trùm biến thành khối: bất tử
    const fk = fake[0], g0 = fk.grow; SK.hurtEnemy(G, fk, 50, false, 0, 0); SK.hurtEnemy(G, fk, 50, false, 0, 0);
    o.grow = fk.grow / g0; o.fakeHp = fk.hp === fk.hpMax;
    const rh = real[0].hp; SK.hurtEnemy(G, real[0], 10, false, 0, 0); o.realLost = rh - real[0].hp;
    o.cubeFrames = Object.keys(window.__draw).filter(k => /^clone[12]_/.test(k)).length;
    return o;
  });
  check('6 khối: 1 thật + 5 giả, trùm ẩn và bất tử, khối giả phình to khi bị bắn mà không mất máu, khối thật mất máu',
    cubesUp && cu.n === 6 && cu.real === 1 && cu.fake === 5 && cu.hidden && cu.bossHit === false && cu.bossKeep && cu.grow > 1.2 && cu.fakeHp && cu.realLost === 10, JSON.stringify(cu));
  check('khối thật có máu = 500 × hệ số máu trùm (hệ số ' + cu.hpK + ')', cu.realHp === Math.round(500 * cu.hpK), cu.realHp + '');
  const cubeHurt = await p.evaluate(() => new Promise(res => {
    const G = SK.G, e = SK.felLord.find(), P = G.player, c = e.cubes.find(x => !x.real && x.st !== 'dead'); window.__hurt = []; let n = 0;
    const iv = setInterval(() => {
      P.hp = P.hpMax; P.armor = P.armorMax; P.invulT = 0;
      const a = c.orb, R = 28 * c.grow; P.x = c.x + Math.cos(a) * R; P.y = c.y - 14 + Math.sin(a) * R * 0.8 + 7;
      if (++n > 50) { clearInterval(iv); res({ lost: window.__hurt.reduce((s, h) => s + h.lost, 0), hits: window.__hurt.length }); }
    }, 60);
  }));
  check('quả cầu lửa quanh khối trừ máu khi chạm', cubeHurt.lost > 0 && cubeHurt.hits >= 1, JSON.stringify(cubeHurt));
  // hạ khối thật -> khối giả tan, trùm hiện ở chỗ khối thật rồi kiệt sức 20 s, không đánh
  const wk = await p.evaluate(() => {
    const G = SK.G, e = SK.felLord.find(), r = e.real, rx = r.x, ry = r.y; SK.hurtEnemy(G, r, r.hp + 1, false, 0, 0);
    return { rx, ry, mode: e.mode };
  });
  await until(p, () => SK.felLord.find().mode === 'weak', null, 3000);
  await near(60); await sleep(500); await shot('weak', crop);
  const w2 = await p.evaluate(a => {
    const e = SK.felLord.find(), G = SK.G, hp0 = e.hp, atk0 = JSON.stringify(e.stats.atk);
    SK.hurtEnemy(G, e, 30, false, 0, 0);
    return { fakesDead: e.cubes.every(c => c.st === 'dead'), mode: e.mode, weakT: e.weakT, dist: Math.hypot(e.x - a.rx, e.y - a.ry), took: hp0 - e.hp, atk0 };
  }, wk);
  await sleep(1500);
  const w3 = await p.evaluate(a0 => { const e = SK.felLord.find(); return { mode: e.mode, same: JSON.stringify(e.stats.atk) === a0 }; }, w2.atk0);
  check('hạ khối thật: khối giả tan, trùm hiện đúng chỗ khối thật, kiệt sức 20 s, không ra đòn, chịu sát thương thường',
    w2.fakesDead && w2.mode === 'weak' && w2.weakT === 20 && w2.dist < 30 && w2.took === 30 && w3.mode === 'weak' && w3.same, JSON.stringify({ wk, w2, w3 }));
  await p.evaluate(() => { const e = SK.felLord.find(); e.mt = e.weakT - 0.3; });
  const rec = await until(p, () => SK.felLord.find().mode === 'idle', null, 3000);
  check('hết kiệt sức: trùm trở lại idle', rec);

  // ---------------------------------------------------------------- cua móng ngựa
  await reset(); await near(90);
  await p.evaluate(() => { const e = SK.felLord.find(); SK.felLord.start(SK.G, e, 'crab'); });
  await until(p, () => SK.felLord.find().mode === 'crab', null, 4000);
  await keepAlive();
  const crab0 = await p.evaluate(() => { const e = SK.felLord.find(), hp0 = e.hp; const ok = SK.hurtEnemy(SK.G, e, 100, false, 0, 0); return { hpMax: e.crab.hpMax, hpK: e.hpMax / 3600, crabHp: e.crab.hp, bossKeep: e.hp === hp0, ok }; });
  await shot('crab', crop);
  const crabHurt = await p.evaluate(() => new Promise(res => {
    const G = SK.G, e = SK.felLord.find(), P = G.player; window.__hurt = []; const s0 = e.stats.shots; let n = 0;
    const iv = setInterval(() => {
      P.hp = P.hpMax; P.armor = P.armorMax; P.invulT = 0;
      if (++n > 90) { clearInterval(iv); res({ lost: window.__hurt.reduce((s, h) => s + h.lost, 0), shots: e.stats.shots - s0, pools: e.arena.objs.filter(o => o.isPool).length }); }
    }, 70);
  }));
  check('cua: máu riêng 1000 × hệ số, đòn lên cua trừ máu cua chứ không trừ máu trùm', crab0.hpMax === Math.round(1000 * crab0.hpK) && crab0.crabHp === crab0.hpMax - 100 && crab0.bossKeep && crab0.ok === true, JSON.stringify(crab0));
  check('cua bắn quả cầu lửa (bãi lửa lục) và trừ máu người chơi', crabHurt.shots >= 2 && crabHurt.lost > 0 && crabHurt.pools >= 1, JSON.stringify(crabHurt));
  await p.evaluate(() => { const e = SK.felLord.find(); SK.hurtEnemy(SK.G, e, e.crab.hp + 1, false, 0, 0); });
  await until(p, () => SK.felLord.find().mode === 'weak', null, 4000);
  const cw = await p.evaluate(() => { const e = SK.felLord.find(); return { weakT: e.weakT, crab: e.crab, hb: e.hbKind }; });
  check('hạ cua: trùm trở lại, kiệt sức 10 s', cw.weakT === 10 && !cw.crab && cw.hb === 'norm', JSON.stringify(cw));
  await p.evaluate(() => { const e = SK.felLord.find(); e.mt = e.weakT - 0.3; });
  await until(p, () => SK.felLord.find().mode === 'idle', null, 3000);

  // ---------------------------------------------------------------- hình vẽ (khoá prefab gốc)
  const dr = await p.evaluate(() => {
    const D = SK.D, names = Object.keys(window.__draw), F = window.SK_ATLAS.f, ok = new Set();
    // nguồn hợp lệ: khung của các phần prefab + mảng khung của clip fel_lord/*
    for (const n of ['boss_fel_lord', 'fel_lord_clone1', 'fel_lord_clone2', 'bullet_fel_bolt', 'bullet_soul_bolt', 'bullet_green_fireball', 'furious_crystal'])
      for (const q of SK.prefab(n) || []) { if (q.f) ok.add(q.f); for (const mb of Object.values(q.mbs || {})) if (mb && mb.sprites) for (const s of mb.sprites) ok.add(String(s).replace(/^@/, '')); }
    for (const k of Object.keys(D.anims)) if (/^fel_lord\//.test(k)) for (const f of D.anims[k].f) ok.add(f);
    const mine = names.filter(n => /^(fel_lord_|clone[12]_|fel_bolt$|soul_bolt$|shadow[34]$|efx_circle$)/.test(n));
    return { names: mine, bad: mine.filter(n => !ok.has(n)), missing: mine.filter(n => !F[n]) };
  });
  const has = re => dr.names.some(n => re.test(n));
  const idleN = dr.names.filter(n => /^fel_lord_idle_\d$/.test(n)).length;
  check('mọi khung vẽ của trùm/khối/cua/đạn đều là khoá prefab hoặc clip gốc và có trong atlas', dr.bad.length === 0 && dr.missing.length === 0 && dr.names.length >= 20, 'bất thường ' + dr.bad.join(',') + ' · thiếu atlas ' + dr.missing.join(','));
  check('khung đã vẽ phủ idle (8 khung), tay, dive, weak, diving, khối thật + giả, nón lục + đỏ, bóng',
    idleN >= 6 && has(/^fel_lord_hands_(0|1)$/) && has(/^fel_lord_hands_(6|7)$/) && has(/^fel_lord_dive_\d$/) && has(/^fel_lord_weak_\d+$/) && has(/^fel_lord_diving$/) && has(/^fel_lord_diving2_0$/) && has(/^clone1_\d$/) && has(/^clone2_\d$/) && has(/^fel_bolt$/) && has(/^soul_bolt$/) && has(/^shadow3$/),
    dr.names.join(' '));

  // ---------------------------------------------------------------- 4. luật chọn đòn tự nhiên
  await p.evaluate(() => {
    const e = SK.felLord.find(), C = SK.felLord;
    window.__felAtk = []; e.hp = e.hpMax; e.enraged = false; e.basic = 0; e.last = null; e.lastSp = null;
    C.shootCd = 0.15; C.shootCdAngry = 0.15; C.weakCube = 1; C.weakCrab = 1;
    e.cd = 0;
    window.__auto = setInterval(() => {   // rút ngắn chờ: hạ khối thật / cua ngay, hết kiệt sức nhanh; trùm không chết
      const G = SK.G, P = G.player;
      P.hp = P.hpMax; P.armor = P.armorMax; P.invulT = 0;
      if (e.mode === 'cubes' && e.real) SK.hurtEnemy(G, e.real, e.real.hp + 1, false, 0, 0);
      if (e.mode === 'crab' && e.crab) SK.hurtEnemy(G, e, e.crab.hp + 1, false, 0, 0);
      if (e.mode === 'weak') e.weakT = Math.min(e.weakT, e.mt + 0.2);
      e.hp = e.hpMax;
    }, 100);
  });
  await until(p, () => window.__felAtk.length >= 36, null, 150000);
  const seq = await p.evaluate(() => { clearInterval(window.__auto); const C = SK.felLord; C.shootCd = 3; C.shootCdAngry = 2.4; C.weakCube = 20; C.weakCrab = 10; return window.__felAtk.slice(); });
  const SP = ['clone', 'crab'];
  let ruleOk = true, run = 0, spCount = { clone: 0, crab: 0 }, bad = '';
  for (let i = 0; i < seq.length; i++) {
    const a = seq[i];
    if (SP.indexOf(a) >= 0) {
      spCount[a]++;
      if (run < 2) { ruleOk = false; bad += ' biến hình sau ' + run + ' đòn thường@' + i; }
      const prevSp = seq.slice(0, i).reverse().find(x => SP.indexOf(x) >= 0);
      if (prevSp === a) { ruleOk = false; bad += ' ' + a + ' lặp liền kề@' + i; }
      run = 0;
    } else { run++; if (i && seq[i - 1] === a) { ruleOk = false; bad += ' ' + a + ' lặp@' + i; } }
  }
  check('luật chọn đòn: biến hình (khối/cua) chỉ sau ≥ 2 đòn thường, không lặp liền kề; cả hai loại đều xuất hiện', seq.length >= 36 && ruleOk && spCount.clone > 0 && spCount.crab > 0, seq.join(',') + ' · ' + JSON.stringify(spCount) + bad);
  await until(p, () => ['idle'].indexOf(SK.felLord.find().mode) >= 0, null, 8000);
  await p.evaluate(() => { const e = SK.felLord.find(); e.cd = 99; e.hp = e.hpMax; });

  // ---------------------------------------------------------------- 5. hạ bằng súng thật
  await p.evaluate(() => { const e = SK.felLord.find(); e.arena.pr = []; e.arena.objs = []; e.mode = 'idle'; e.mt = 0; });
  await reset(); await near(55);
  const setup = await p.evaluate(() => {
    const G = SK.G, pl = G.player, w = pl.weapons[0].def, e = SK.felLord.find(), m = G.matrix;
    pl.cur = 0; const dps = w.dmg * w.rps * (w.pellets || 1);
    pl.dmgMul = Math.max(1, Math.round(e.hpMax / (dps * 0.6 * 30)));
    e.cd = 1;
    // lấy mẫu mỗi khung: Pha Lê, vạch mốc, để so trước/sau cú chót (không tự phát sự kiện nào)
    window.__s = { cr: m.crystals, mk: SK.matrix.marker(G), kill: null }; const f = () => { const mm = G.matrix; if (!window.__s.kill) { window.__s.cr = mm.crystals; window.__s.mk = SK.matrix.marker(G); } requestAnimationFrame(f); }; f();
    SK.on('enemyKill', (g, k) => { if (k.id === 'boss_fel_lord') window.__s.kill = { cr: g.matrix.crystals, mk: SK.matrix.marker(g), t: g.t }; });
    return { id: pl.weapons[0].id, dmgMul: pl.dmgMul, hp: e.hpMax, dps };
  });
  await p.keyboard.down('KeyJ');
  const t0 = Date.now(); let dead = false, mid = false, barShot = false;
  while (Date.now() - t0 < 170000) {
    const s = await p.evaluate(() => {
      const G = SK.G, e = SK.felLord.find(), P = G.player;
      P.energy = P.energyMax; P.hp = P.hpMax; P.armor = P.armorMax;
      // trợ giúp đứng gần mục tiêu thật: khối thật khi hoá khối (khối giả cũng nằm trong tầm ngắm)
      if (e.mode === 'cubes' && e.real && e.real.st !== 'dead') { P.x = e.real.x; P.y = e.real.y + 22; }
      else if (e.mode !== 'crab' && e.st !== 'dead' && Math.hypot(P.x - e.x, P.y - e.y) > 100) { const [x, y] = SK.freeNear([e.x, e.y + 60]); P.x = x; P.y = y; }
      return { dead: e.st === 'dead', mode: e.mode, hud: !!(SK.felLord.hud), hp: e.hp };
    });
    if (!barShot && s.hud) { barShot = true; await shot('bar', { x: 300, y: 0, width: 680, height: 190 }); }
    if (!mid && Date.now() - t0 > 6000) { mid = true; await shot('fight', crop); }
    if (s.dead) { dead = true; break; }
    await sleep(120);
  }
  await p.keyboard.up('KeyJ');
  await sleep(900);
  await shot('death', crop);
  const kill = await p.evaluate(() => { const e = SK.felLord.find(); return { dead: e.st === 'dead', hp: e.hp, atk: e.stats.atk, kill: window.__s.kill, before: { cr: window.__s.cr, mk: window.__s.mk } }; });
  check('súng thật (giữ J) hạ được Tước Sĩ Lục', dead && kill.dead, setup.id + ' ×' + setup.dmgMul + ' · máu ' + setup.hp + ' · ' + Math.round((Date.now() - t0) / 1000) + 's · đòn ' + JSON.stringify(kill.atk));
  const dd = await p.evaluate(() => { const names = Object.keys(window.__draw).filter(n => /^fel_lord_dead_\d+$/.test(n)); return names.length; });
  check('chết: vẽ clip fel_lord/dead (khung fel_lord_dead_*)', dd >= 8, dd + ' khung');
  const cleared = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, 14000);
  await sleep(1500);
  const room = await p.evaluate(() => {
    const r = SK_GAME.rooms.find(x => x.type === 'boss');
    return { st: r.state, door: SK_GAME.doorBlocked(r.id), chest: SK.G.chests.some(c => c.kind === 'weapon'), left: SK.G.enemies.filter(e => e.st !== 'dead').length, drops: SK.G.pickups.length };
  });
  check('phòng trùm mở, có rương trùm, không còn quái sống', cleared && room.door === false && room.chest && room.left === 0, JSON.stringify(room));
  check('Mê Trận: hạ ông +3 Pha Lê Tà Vương (nhận bằng đường sự kiện enemyKill thật của lõi)', kill.kill && kill.kill.cr - kill.before.cr === 3, JSON.stringify(kill));
  const ratio = kill.kill && kill.before.mk > 0.01 ? kill.kill.mk / kill.before.mk : null;
  check('Mê Trận: vạch mốc Uy Áp giảm 30% (x0,7)', ratio != null && Math.abs(ratio - 0.7) < 0.03, 'trước ' + (kill.before.mk).toFixed(4) + ' sau ' + (kill.kill && kill.kill.mk.toFixed(4)) + ' tỉ lệ ' + (ratio && ratio.toFixed(3)));
  await shot('cleared', crop);

  // ---------------------------------------------------------------- Lợi Hại: +4 Pha Lê, máu vẫn 3600 gốc
  await p.evaluate(() => { SK_GAME.debug.stage('3-5'); SK_GAME.debug.god(true); });
  await until(p, () => SK_GAME.phase === 'play' && SK_GAME.stage === '3-5', null, 8000);
  await p.evaluate(() => { SK.G.badass = true; SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  await until(p, () => SK.G.enemies.some(e => e.id === 'boss_fel_lord' && e.st === 'idle'), null, 8000);
  const bd = await p.evaluate(() => {
    const G = SK.G, e = SK.felLord.find(), m = G.matrix, c0 = m.crystals, mk0 = SK.matrix.marker(G);
    const o = { hpMax: e.hpMax, want: Math.round(3600 * (1 + 0.15 * m.P)) };
    SK.hurtEnemy(G, e, e.hp + 1, false, 0, 0);   // cùng hàm mà đạn người chơi gọi
    o.gain = m.crystals - c0; o.mk = SK.matrix.marker(G) / (mk0 || 1); o.mk0 = mk0; o.dead = e.st === 'dead';
    G.badass = false;
    return o;
  });
  check('Lợi Hại: máu vẫn 3600 gốc (không ×1,5), hạ ông +4 Pha Lê', bd.dead && bd.hpMax === bd.want && bd.gain === 4, JSON.stringify(bd));

  check('không lỗi trang', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
