/*
 * Mê Trận Tà Vương (games/soulknight): lõi chế độ.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-matrix.js
 *
 * 1. Vào chế độ bằng SK_GAME.debug.matrix(): G.mode 'matrix', chỉ 5 ải 1-1..1-5, P = 0.
 * 2. Qua cổng x-5 thì nối tầng mới (2-1 có thật, không 'victory'), P = 1, 2, 3, mỗi lần +4 Pha Lê; chủ đề lặp (4-1 = 1-1).
 * 3. HP một quái cụ thể = gốc × (1 + 0,15 × P) ở P = 0, 3, 20, 7.
 * 4. Sát thương lên người +floor(P/3): P = 0..2 mất 1, P = 3 mất 2, P = 6 mất 3.
 * 5. Tà Vương ở x-5: một nhân tố mỗi tầng, gọi lại không thêm; factorsAdd idempotent (HP tối đa chỉ cộng một lần).
 * 6. Phán quyết mô phỏng: Thưởng 70/30, Phạt 40/60.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
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
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="matrix"]');
  const card = await p.evaluate(() => ({ title: document.getElementById('hs-mode-title').textContent, go: !document.getElementById('hs-mode-go').disabled, img: document.getElementById('hs-mode-img').src.split('/').pop() }));
  check('bảng chế độ có thẻ Mê Trận Tà Vương (ảnh mode_loop gốc), nút Bắt đầu bật', card.title === 'Mê Trận Tà Vương' && card.go && card.img === 'mode_loop.png', JSON.stringify(card));
  await p.evaluate(() => { document.getElementById('hs-modes').hidden = true; SK_GAME.debug.seed(7); SK.lobby.launch('knight', 'matrix', []); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
  const s0 = await p.evaluate(() => ({ mode: SK_GAME.mode, labels: SK.STAGES.map(s => s.label).join(','), P: SK.G.matrix.P, cr: SK.G.matrix.crystals, fac: SK.G.factors.length }));
  check('vào Mê Trận: mode matrix, chỉ 5 ải 1-1..1-5, P = 0, chưa nhân tố', s0.mode === 'matrix' && s0.labels === '1-1,1-2,1-3,1-4,1-5' && s0.P === 0 && s0.cr === 0 && !s0.fac, JSON.stringify(s0));

  // qua cổng x-5 của tầng f: dịch chuyển tới ải f-5, đứng vào cổng, chờ sang f+1-1
  async function passFloor(f, beforePortal) {
    await p.evaluate(l => { SK_GAME.debug.stage(l); SK_GAME.debug.god(true); }, f + '-5');
    await until(p, () => SK_GAME.phase === 'play', null, 6000);
    if (beforePortal) await beforePortal();
    await p.evaluate(() => { const G = SK.G; G.player.x = G.portal.x; G.player.y = G.portal.y; });
    for (let i = 0; i < 80; i++) {   // thiên phú sau x-5 giữ người chơi: chọn thẻ đầu
      if (await p.evaluate(() => SK.G.hold && SK_ROOMS.pick(0))) await sleep(50);
      if (await p.evaluate(l => SK_GAME.stage === l, (f + 1) + '-1')) return true;
      await sleep(100);
    }
    return false;
  }
  let ok = await passFloor(1);
  const s1 = await p.evaluate(() => ({ st: SK_GAME.state, stage: SK_GAME.stage, n: SK.STAGES.length, P: SK.G.matrix.P, cr: SK.G.matrix.crystals, vs: SK.G.matrix.verdicts.length, fac: SK.G.factors.length }));
  check('qua 1-5: tầng 2 được nối (2-1 tồn tại, 10 ải), state vẫn stage, không victory', ok && s1.st === 'stage' && s1.stage === '2-1' && s1.n === 10, JSON.stringify(s1));
  check('P = 1 và +4 Pha Lê sau tầng 1', s1.P === 1 && s1.cr === 4, 'P ' + s1.P + ' · Pha Lê ' + s1.cr);
  check('Tà Vương ở 1-5: đúng một phán quyết, đúng một nhân tố', s1.vs === 1 && s1.fac === 1, JSON.stringify(s1));

  // x-5 của tầng 2: gọi phán quyết hai lần trước khi qua cổng → vẫn một nhân tố
  let twice;
  ok = await passFloor(2, async () => {
    twice = await p.evaluate(() => {
      const G = SK.G, n0 = G.factors.length;
      const a = SK.matrix.judge(G), b = SK.matrix.judge(G);
      return { same: a === b, add: G.factors.length - n0, key: a.key, rec: a };
    });
  });
  const s2 = await p.evaluate(() => ({ stage: SK_GAME.stage, P: SK.G.matrix.P, cr: SK.G.matrix.crystals, fac: SK.G.factors.length, vs: SK.G.matrix.verdicts.length }));
  check('Tà Vương gọi 2 lần trong một tầng: cùng bản ghi, thêm đúng 1 nhân tố; qua cổng không thêm nữa', ok && twice.same && twice.add === 1 && s2.fac === 2 && s2.vs === 2, JSON.stringify({ twice: twice && { same: twice.same, add: twice.add }, s2 }));
  check('P = 2, Pha Lê 8 sau tầng 2', s2.stage === '3-1' && s2.P === 2 && s2.cr === 8, JSON.stringify(s2));

  ok = await passFloor(3);
  const s3 = await p.evaluate(() => {
    const T = SK.STAGES, f = l => T.find(s => s.label === l);
    return { st: SK_GAME.state, stage: SK_GAME.stage, P: SK.G.matrix.P, cr: SK.G.matrix.crystals, n: T.length, th41: f('4-1').theme, th11: f('1-1').theme, th45: f('4-5').boss };
  });
  check('qua 3-5: không victory, nhãn kế là 4-1, chủ đề trùng tầng 1, trùm ở 4-5', ok && s3.st === 'stage' && s3.stage === '4-1' && s3.n === 20 && s3.th41 === s3.th11 && s3.th45, JSON.stringify(s3));
  check('P = 3, Pha Lê 12 sau 3 tầng', s3.P === 3 && s3.cr === 12, JSON.stringify(s3));

  // HP một quái cụ thể
  await until(p, () => SK_GAME.phase === 'play', null, 6000);
  const hp = await p.evaluate(() => {
    SK.matrix.geneOff = true;   // đo HP thuần theo Uy Áp, không để Quái Gen đổi HP
    const G = SK.G, m = G.matrix, P0 = m.P, room = G.map.rooms[0];
    const id = G.map.th.enemies.find(x => SK.D.enemies[x]);
    const hpAt = P => { m.P = P; const e = SK.makeEnemy(G, id, 100, 100, room); return e.hp + '/' + e.hpMax; };
    const base = SK.D.enemies[id] && (hpAt(0));
    const out = { id, base, p3: hpAt(3), p7: hpAt(7), p20: hpAt(20) };
    const b = parseInt(base, 10);
    out.exp = [b, Math.round(b * 1.45), Math.round(b * 2.05), Math.round(b * 4)];
    m.P = P0; SK.matrix.geneOff = false;
    G.enemies = G.enemies.filter(e => e.hp !== 99999);
    return out;
  });
  const num = s => parseInt(s, 10);
  check('HP một quái: P=0 giữ gốc, P=3 ×1,45, P=7 ×2,05, P=20 ×4', num(hp.base) === hp.exp[0] && num(hp.p3) === hp.exp[1] && num(hp.p7) === hp.exp[2] && num(hp.p20) === hp.exp[3] && num(hp.p20) > num(hp.base), JSON.stringify(hp));

  const dm = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, pl = G.player, P0 = m.P, out = {};
    for (const P of [0, 2, 3, 5, 6, 20]) {
      m.P = P; pl.invulT = 0; pl.armor = 99; pl.armorMax = 99; pl.hp = pl.hpMax = 99;
      SK.hurtPlayer(G, 1);
      out[P] = (99 - pl.armor) + (99 - pl.hp);
    }
    m.P = P0; pl.invulT = 0;
    return out;
  });
  check('sát thương lên người +floor(P/3): P0..2 mất 1, P3..5 mất 2, P6 mất 3, P20 mất 7', dm[0] === 1 && dm[2] === 1 && dm[3] === 2 && dm[5] === 2 && dm[6] === 3 && dm[20] === 7, JSON.stringify(dm));

  const fa = await p.evaluate(() => {
    const G = SK.G, pl = G.player, h0 = pl.hpMax;
    const a = SK.factorsAdd(G, 'RenduErmai'), h1 = pl.hpMax, b = SK.factorsAdd(G, 'RenduErmai'), h2 = pl.hpMax;
    return { a, b, dh1: h1 - h0, dh2: h2 - h1, cnt: G.factors.filter(k => k === 'RenduErmai').length, bad: SK.factorsAdd(G, 'KhongCo') };
  });
  check('factorsAdd idempotent: lần 2 không thêm, HP tối đa chỉ +1 một lần, khoá lạ bị bỏ', fa.a && !fa.b && fa.dh1 === 1 && fa.dh2 === 0 && fa.cnt === 1 && !fa.bad, JSON.stringify(fa));

  const sim = await p.evaluate(() => {
    const M = SK.matrix, N = 20000, c = { rp: 0, rn: 0, pn: 0, pu: 0 };
    for (let i = 0; i < N; i++) {
      if (M.pickKind(true, SK.rand()) === 'pos') c.rp++; else c.rn++;
      if (M.pickKind(false, SK.rand()) === 'neg') c.pn++; else c.pu++;
    }
    return { rp: c.rp / N, pn: c.pn / N };
  });
  check('phán quyết 20000 lần: Thưởng tích cực 70% ±1,5%, Phạt tiêu cực 40% ±1,5%', Math.abs(sim.rp - 0.7) <= 0.015 && Math.abs(sim.pn - 0.4) <= 0.015, JSON.stringify(sim));

  // ================= đợt 2: HUD Uy Áp, đổi Pha Lê, 6 nhân tố Tà Vương, Quái Gen, cấp vũ khí =================
  await sleep(300);
  const hud1 = await p.evaluate(async () => {
    const G = SK.G, m = G.matrix, M = SK.matrix, P0 = m.P, k0 = m.kills, s0 = m.spawned, o = {};
    m.spawned = 10; m.kills = 4;
    await new Promise(r => setTimeout(r, 250));
    o.a = Object.assign({}, M.hud);
    m.P = 7;
    await new Promise(r => setTimeout(r, 250));
    o.b = Object.assign({}, M.hud); o.exp = M.progress(G);
    m.P = P0; m.kills = k0; m.spawned = s0;
    return o;
  });
  check('HUD Uy Áp hiện đúng P (3 rồi 7), tiến độ 4/10 = 0,4', hud1.a && hud1.a.P === 3 && hud1.b && hud1.b.P === 7 && Math.abs(hud1.a.prog - 0.4) < 1e-9 && hud1.b.crystals === hud1.a.crystals, JSON.stringify(hud1));

  const rw = await p.evaluate(() => {
    const M = SK.matrix, N = 40000, c = {}, st = { seeds: 0 };
    let gem = 0, seedBlocked = 0;
    for (let i = 0; i < N; i++) {
      const g = M.rollReward(SK.rand(), { seeds: 2 }); if (g.item && /_seed$/.test(g.item)) seedBlocked++;
      const x = M.rollReward(SK.rand(), st);
      const k = x.gems ? 'g' + x.gems : /magic/.test(x.item) ? 'magic' : /fertilize/.test(x.item) ? 'fert' : /_seed$/.test(x.item) ? 'seed' : 'mat';
      c[k] = (c[k] || 0) + 1;
    }
    for (const k in c) c[k] = c[k] / N;
    // tổng cố định: 500 Pha Lê toàn r=0 → toàn 100 đá
    return { c, seedBlocked, seedsInTrial: 0 };
  });
  const nr = (a, b, t) => Math.abs(a - b) <= t;
  // g100 = 15% + 4% + 2% + 1% + 2% (phiếu và 2% còn thiếu đổi 100 đá); seed bị chặn tới 2 lần nên còn rất ít
  check('bảng đổi Pha Lê 40000 lượt: 200 đá 15%, 500 đá 17,5%, 1000 đá 2,5%, nguyên liệu 28%, phép thuật 6%, Phân Bón 1% (±1%)',
    nr(rw.c.g200, 0.15, 0.01) && nr(rw.c.g500, 0.175, 0.01) && nr(rw.c.g1000, 0.025, 0.01) && nr(rw.c.mat, 0.28, 0.01) && nr(rw.c.magic, 0.06, 0.01) && nr(rw.c.fert, 0.01, 0.01), JSON.stringify(rw.c));
  check('hạt giống tối đa 2 mỗi ván: đã đủ 2 thì không ra hạt nữa', rw.seedBlocked === 0, 'ra ' + rw.seedBlocked);

  const rd = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, Pf = SK.profile, c0 = m.crystals, g0 = Pf.gems;
    m.crystals = 12; m.redeemed = false;
    const tab = M.redeem(G, false, () => 0);                     // tính thử, không áp
    const g1 = Pf.gems;
    const out = M.redeem(G, true, () => 0), g2 = Pf.gems;       // r = 0 → luôn 100 đá
    const again = M.redeem(G, true, () => 0), g3 = Pf.gems;     // lần hai: không thưởng thêm
    Pf.addGems(-1200); m.redeemed = false; m.redeem = null; m.crystals = c0;
    return { tab: tab.gems, dry: g1 - g0, out: out.gems, n: out.n, got: g2 - g0, again: g3 - g2, same: again === out };
  });
  check('đổi Pha Lê cuối ván: 12 Pha Lê (r=0) = 1200 đá; tính thử không cộng; gọi lại không cộng thêm', rd.tab === 1200 && rd.dry === 0 && rd.out === 1200 && rd.n === 12 && rd.got === 1200 && rd.again === 0 && rd.same, JSON.stringify(rd));

  const tv = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, o = {}, room = G.map.rooms[0];
    M.geneOff = true;
    const id = G.map.th.enemies.find(x => SK.D.enemies[x]);
    const mk = () => SK.makeEnemy(G, id, 100, 100, room);
    const keys = ['ReduceEnemyMoveSpeed', 'ExtraHurtDamage', 'ReduceEnemyBuffImmune', 'IncreaseEnemyBuffImmune', 'MoreGeneEnemy', 'KillEnemyRebornTeammate'];
    o.hidden = Object.keys(SK.FACTORS).filter(k => keys.indexOf(k) >= 0).length;   // không lộ ra bảng chọn ở sảnh
    o.reg = keys.every(k => SK.FACTORS[k]);
    for (const k of keys) { G.factors = G.factors.filter(x => x !== k); if (G.factorStack) delete G.factorStack[k]; }
    SK.factorsOn(G);   // dựng lại G.mods; nhân tố đã nhận ở các phép thử trước bị bỏ (tránh lệch số)
    const base = mk().moveMul || 1;
    o.addSlow = [1, 2, 3].map(() => SK.factorsAdd(G, 'ReduceEnemyMoveSpeed'));
    const sp = (mk().moveMul || 1) / base;
    o.slow = sp;
    o.slowStack = SK.factorStack(G, 'ReduceEnemyMoveSpeed');
    o.slowInFactors = G.factors.filter(k => k === 'ReduceEnemyMoveSpeed').length;
    let extra = 0; for (let i = 0; i < 12; i++) if (SK.factorsAdd(G, 'MoreGeneEnemy')) extra++;
    o.capAdds = extra; o.capStack = SK.factorStack(G, 'MoreGeneEnemy'); o.mutate = G.mods.mutateRate;
    // Kiếm Hai Lưỡi ×2: người chơi chịu +2, quái chịu +4
    SK.factorsAdd(G, 'ExtraHurtDamage'); SK.factorsAdd(G, 'ExtraHurtDamage');
    const P0 = m.P; m.P = 0;
    const pl = G.player; pl.invulT = 0; pl.armor = 99; pl.armorMax = 99; pl.hp = pl.hpMax = 99;
    SK.hurtPlayer(G, 1); o.pHurt = (99 - pl.armor) + (99 - pl.hp); pl.invulT = 0;
    const e = mk(); e.st = 'idle'; e.hp = e.hpMax = 5000; G.enemies.push(e);
    SK.hurtEnemy(G, e, 1, false, 0, 0); o.eHurt = 5000 - e.hp;
    G.enemies = G.enemies.filter(x => x !== e);
    o.mods = { pa: G.mods.playerHurtAdd, ea: G.mods.enemyHurtAdd };
    // Suy Yếu ×2 và Gen Miễn Dịch ×4 lên P hiệu dụng (P = 6 → 4 → 8)
    m.P = 6; o.peff0 = M.peff(G);
    SK.factorsAdd(G, 'ReduceEnemyBuffImmune'); SK.factorsAdd(G, 'ReduceEnemyBuffImmune'); o.peffCut = M.peff(G);
    for (let i = 0; i < 4; i++) SK.factorsAdd(G, 'IncreaseEnemyBuffImmune'); o.peffAdd = M.peff(G);
    o.stMul = M.statusMul(G);
    m.P = P0; M.geneOff = false;
    return o;
  });
  check('6 nhân tố Tà Vương có trong SK.FACTORS nhưng không lộ ra bảng chọn (Object.keys)', tv.reg && tv.hidden === 0, JSON.stringify({ reg: tv.reg, hidden: tv.hidden }));
  check('Thuật Chậm Chạp ×3: nhận 3 lần, key vào G.factors một lần, tốc độ quái -3% (×0,97)', tv.addSlow.every(Boolean) && tv.slowStack === 3 && tv.slowInFactors === 1 && Math.abs(tv.slow - 0.97) < 1e-6, JSON.stringify({ add: tv.addSlow, st: tv.slowStack, n: tv.slowInFactors, sp: tv.slow }));
  check('Đột Biến Gen: tối đa 10 lần (12 lần chỉ nhận 10), tỉ lệ +20%', tv.capAdds === 10 && tv.capStack === 10 && Math.abs(tv.mutate - 0.2) < 1e-9, JSON.stringify({ add: tv.capAdds, st: tv.capStack, mu: tv.mutate }));
  check('Kiếm Hai Lưỡi ×2: người chơi mất 1+2 = 3, quái mất 1+4 = 5', tv.pHurt === 3 && tv.eHurt === 5 && tv.mods.pa === 2 && tv.mods.ea === 4, JSON.stringify({ p: tv.pHurt, e: tv.eHurt, m: tv.mods }));
  check('kháng khống chế: P=6, Thuật Suy Yếu ×2 → Peff 4, Gen Miễn Dịch ×4 → Peff 8; thời gian trạng thái ×0,5^(8/3)', tv.peff0 === 6 && tv.peffCut === 4 && tv.peffAdd === 8 && Math.abs(tv.stMul - Math.pow(0.5, 8 / 3)) < 1e-9, JSON.stringify({ a: tv.peff0, b: tv.peffCut, c: tv.peffAdd, m: tv.stMul }));

  // Quái Gen: tỉ lệ theo P và Đột Biến Gen, mô phỏng nhiều lần
  const gn = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, P0 = m.P, room = G.map.rooms[0], o = {};
    const TVK = ['ReduceEnemyMoveSpeed', 'ExtraHurtDamage', 'ReduceEnemyBuffImmune', 'IncreaseEnemyBuffImmune', 'MoreGeneEnemy', 'KillEnemyRebornTeammate'];
    G.factors = G.factors.filter(x => TVK.indexOf(x) < 0); G.factorStack = {}; SK.factorsOn(G);   // bỏ nhân tố Tà Vương của phép thử trước
    const id = G.map.th.enemies.find(x => SK.D.enemies[x]);
    const run = (P, N) => {
      m.P = P; let c = 0; const kinds = {};
      for (let i = 0; i < N; i++) { const e = SK.makeEnemy(G, id, 100, 100, room); if (e.gene) { c++; kinds[e.gene] = (kinds[e.gene] || 0) + 1; } }
      return { r: c / N, kinds, exp: M.geneChance(G) };
    };
    o.p0 = run(0, 4000); o.p20 = run(20, 4000);
    const saved = G.mods.mutateRate; G.mods.mutateRate = 0.2; o.p0m = run(0, 4000); G.mods.mutateRate = saved;
    // hình/hiệu ứng: mỗi kiểu một quái thật
    const base = SK.makeEnemy(G, id, 100, 100, room); M.geneOff = false;
    const fx = {};
    m.P = 0;
    for (const k of Object.keys(M.GENES)) {
      M.geneOff = true; const e = SK.makeEnemy(G, id, 100, 100, room); M.geneOff = false;
      e.hp = e.hpMax = 1000; e.st = 'idle'; e.gene = null;
      fx[k] = { e, h: e.hpMax, s: e.scale, mv: e.moveMul || 1 };
    }
    o.kinds = Object.keys(M.GENES).length;
    m.P = P0;
    return o;
  });
  check('Quái Gen P=0: tỉ lệ ≈ 5% (±1,5%); P=20: ≈ 25% (±2,5%)', nr(gn.p0.exp, 0.05, 1e-9) && nr(gn.p20.exp, 0.25, 1e-9) && nr(gn.p0.r, gn.p0.exp, 0.015) && nr(gn.p20.r, gn.p20.exp, 0.025), JSON.stringify({ p0: gn.p0.r, e0: gn.p0.exp, p20: gn.p20.r, e20: gn.p20.exp }));
  check('Đột Biến Gen +20% làm tỉ lệ P=0 lên ≈ 25% (±2,5%) và có đủ nhiều kiểu gen', nr(gn.p0m.r, gn.p0m.exp, 0.025) && gn.p0m.exp > gn.p0.exp + 0.15 && Object.keys(gn.p0m.kinds).length >= 5, JSON.stringify({ r: gn.p0m.r, exp: gn.p0m.exp, kinds: gn.p0m.kinds }));

  // hiệu ứng từng kiểu gen trên quái thật
  const ge = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, room = G.map.rooms[0], P0 = m.P, o = {};
    const id = G.map.th.enemies.find(x => SK.D.enemies[x]);
    const TVK = ['ReduceEnemyMoveSpeed', 'ExtraHurtDamage', 'ReduceEnemyBuffImmune', 'IncreaseEnemyBuffImmune', 'MoreGeneEnemy', 'KillEnemyRebornTeammate'];
    G.factors = G.factors.filter(x => TVK.indexOf(x) < 0); G.factorStack = {}; SK.factorsOn(G);   // bỏ nhân tố Tà Vương của phép thử trước
    m.P = 0; M.geneOff = true;
    const mk = (g) => { const e = SK.makeEnemy(G, id, 100, 100, room); e.st = 'idle'; e.hp = e.hpMax = 1000; e._bmSt = null; if (g) { e.gene = g; if (g === 'shield') e.shield = 300; } G.enemies.push(e); return e; };
    const dmgOf = (g, hits) => { const e = mk(g); e.hp = e.hpMax = 1000; const h = SK.hurtEnemy(G, e, hits || 10, false, 0, 0); const d = 1000 - e.hp; G.enemies = G.enemies.filter(x => x !== e); return d; };
    o.normal = dmgOf(null); o.holy = dmgOf('holy'); o.demon = dmgOf('demon');
    const dm = mk('demon'); dm._bmSt = { burn: { t: 1, tick: 1 } }; SK.hurtEnemy(G, dm, 10, false, 0, 0); o.demonStatus = 1000 - dm.hp; G.enemies = G.enemies.filter(x => x !== dm);
    const sh = mk('shield'); SK.hurtEnemy(G, sh, 100, false, 0, 0); o.shieldAfter1 = [sh.hp, sh.shield]; SK.hurtEnemy(G, sh, 250, false, 0, 0); o.shieldAfter2 = [sh.hp, sh.shield]; G.enemies = G.enemies.filter(x => x !== sh);
    const st = SK.makeEnemy(G, id, 100, 100, room); const ag = SK.makeEnemy(G, id, 100, 100, room);
    // strong / agile qua applyGene: đặt qua makeEnemy với tỉ lệ ép 100%
    const sv = G.mods.mutateRate; G.mods.mutateRate = 5; M.geneOff = false;
    const big = [], seen = {};
    for (let i = 0; i < 2000 && Object.keys(seen).length < 9; i++) { const e = SK.makeEnemy(G, id, 100, 100, room); if (e.gene) seen[e.gene] = seen[e.gene] || e; }
    G.mods.mutateRate = sv; M.geneOff = true;
    const n0 = SK.makeEnemy(G, id, 100, 100, room);
    o.seen = Object.keys(seen).sort().join(',');
    const S = seen.strong, A = seen.agile;
    o.strong = S && { hp: S.hpMax / n0.hpMax, sc: S.scale / n0.scale, mv: (S.moveMul || 1) / (n0.moveMul || 1) };
    o.agile = A && { hp: A.hpMax / n0.hpMax, sc: A.scale / n0.scale, mv: (A.moveMul || 1) / (n0.moveMul || 1) };
    o.shieldVal = seen.shield && seen.shield.shield > 0;
    m.P = P0; M.geneOff = false;
    return o;
  });
  check('Quái Gen Thần Thánh nhận 8/10 sát thương, Ác Ma nhận 4/10 khi không dính trạng thái và 10/10 khi đang cháy', ge.normal === 10 && ge.holy === 8 && ge.demon === 4 && ge.demonStatus === 10, JSON.stringify({ n: ge.normal, h: ge.holy, d: ge.demon, ds: ge.demonStatus }));
  check('Quái Gen Khiên chặn đòn tới khi vỡ (100 vào khiên, 250 vỡ khiên 300 và thừa 50 trúng thân)', ge.shieldAfter1 && ge.shieldAfter1[0] === 1000 && ge.shieldAfter1[1] === 200 && ge.shieldAfter2[1] === 0 && ge.shieldAfter2[0] === 950, JSON.stringify({ a: ge.shieldAfter1, b: ge.shieldAfter2 }));
  check('Quái Gen đủ 9 kiểu; Sức Mạnh ×1,5 cỡ/HP, tốc ×0,667; Nhanh Nhẹn ×0,667 cỡ/HP, tốc ×1,5', ge.seen === 'agile,demon,drain,holy,leech,reflect,scatter,shield,strong' && ge.strong && ge.agile && Math.abs(ge.strong.hp - 1.5) < 0.02 && Math.abs(ge.strong.sc - 1.5) < 0.01 && Math.abs(ge.strong.mv - 2 / 3) < 0.01 && Math.abs(ge.agile.hp - 2 / 3) < 0.02 && Math.abs(ge.agile.sc - 2 / 3) < 0.01 && Math.abs(ge.agile.mv - 1.5) < 0.01, JSON.stringify(ge));

  // cấp vũ khí
  const wl = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, pl = G.player, P0 = m.P, o = {};
    const w = pl.weapons[pl.cur], base = w.def.dmg, w0 = w.lvl;
    const at = (P, lvl) => { m.P = P; w.lvl = lvl; SK.factorsTick(G, pl, 0.016); return { loss: M.weaponLoss(G, w), mul: pl['_fx_dmgMul_wlvl'] || 1 }; };
    o.base = base;
    o.a = at(3, 3); o.b = at(3, 0); o.c = at(20, 0); o.d = at(20, 19); o.e = at(20, 20);
    const ex = SK.makeWeapon('weapon_254'); ex.lvl = 0; m.P = 20; o.exempt = M.weaponLoss(G, ex);
    o.upLvl = (w.lvl = 5, M.weaponUp(G, w), w.lvl);
    m.P = 6; w.lvl = 6; SK.factorsTick(G, pl, 0.016);
    return Object.assign(o, { P0, restored: (m.P = P0, w.lvl = w0, SK.factorsTick(G, pl, 0.016), pl['_fx_dmgMul_wlvl']) });
  });
  const mulFor = (b, l) => Math.max(1, b - l) / b;
  check('cấp vũ khí: P=3 đúng cấp mất 0; P=3 lvl0 mất 1; P=20 lvl0 mất 10; lvl19 mất 0; lvl20 mất 0', wl.a.loss === 0 && wl.b.loss === 1 && wl.c.loss === 10 && wl.d.loss === 0 && wl.e.loss === 0, JSON.stringify(wl));
  check('cấp vũ khí đổi sát thương: hệ số = (gốc - mất)/gốc (tối thiểu còn 1); Gậy Anubis được miễn; nâng cấp +1', Math.abs(wl.b.mul - mulFor(wl.base, 1)) < 1e-9 && Math.abs(wl.c.mul - mulFor(wl.base, 10)) < 1e-9 && wl.a.mul === 1 && wl.exempt === 0 && wl.upLvl === 6, JSON.stringify(wl));
  const hw = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 250)); return SK.matrix.hudWeapon; });
  check('HUD hiện số cấp vũ khí cạnh nút vũ khí', hw && typeof hw.lv === 'number' && hw.x > 0, JSON.stringify(hw));

  check('không lỗi trang', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
