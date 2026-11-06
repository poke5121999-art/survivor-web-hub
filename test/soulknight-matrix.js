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
  await p.evaluate(() => { SK.matrix.npcOff = true; SK.matrix.C3.exclusiveRate = 0; });   // đợt 3 bật lại ở cuối: giữ chuỗi số ngẫu nhiên của đợt 1-2
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
  check('Quái Gen đủ 9 kiểu; Sức Mạnh ×1,5 cỡ/HP, tốc ×0,667; Nhanh Nhẹn ×0,667 cỡ/HP, tốc ×1,5', ge.seen === 'agile,demon,drain,holy,leech,reflect,scatter,shield,strong' && ge.strong && ge.agile && Math.abs(ge.strong.hp - 1.5) < 0.02 && Math.abs(ge.strong.sc - 1.5) < 0.01 && Math.abs(ge.strong.mv - 2 / 3) < 0.01 && Math.abs(ge.agile.hp - 2 / 3) < 0.04 && Math.abs(ge.agile.sc - 2 / 3) < 0.01 && Math.abs(ge.agile.mv - 1.5) < 0.01, JSON.stringify(ge));

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

  // ================= đợt 3: Tay Sai Tà Vương (Con Bạc / Thương Nhân / Thầy Bói), nâng cấp vũ khí, thiên phú 2001-2007 + 2117 =================
  const stageTo = async l => { await p.evaluate(x => { SK_GAME.debug.stage(x); SK_GAME.debug.god(true); }, l); await until(p, x => SK_GAME.stage === x && SK_GAME.phase === 'play', l, 8000); await sleep(150); };
  await p.evaluate(() => { const G = SK.G, pl = G.player; SK.matrix.npcOff = false; SK.matrix.C3.exclusiveRate = 0.5; G.factors = []; G.factorStack = {}; SK.factorsOn(G); pl.buffs = (pl.buffs || []).filter(b => b < 2000 || b > 2200); pl.bm = pl.bm || {}; pl.bm.matEn = 0; });

  const pk = await p.evaluate(() => {
    const M = SK.matrix, N = 30000, o = {};
    const count = fl => { const c = { none: 0, gambler: 0, seller: 0, prophet: 0 }; for (let i = 0; i < N; i++) c[M.npcPick(fl, SK.rand) || 'none']++; for (const k in c) c[k] /= N; return c; };
    o.f1 = count(1); o.f2 = count(2); o.f4 = count(4);
    return o;
  });
  check('NPC tay sai: tầng 1 không bao giờ có; tầng 2-3 có 1/3 (±1,5%) chỉ Con Bạc/Thương Nhân chia đều, không Thầy Bói',
    pk.f1.none === 1 && nr(1 - pk.f2.none, 1 / 3, 0.015) && pk.f2.prophet === 0 && nr(pk.f2.gambler, pk.f2.seller, 0.02), JSON.stringify({ f1: pk.f1, f2: pk.f2 }));
  check('Thầy Bói chỉ từ 4-1 (chỉ số ải >= 15): tầng 4 mỗi NPC ≈ 1/9 (±1,5%)', nr(pk.f4.prophet, 1 / 9, 0.015) && nr(pk.f4.gambler, 1 / 9, 0.015) && nr(pk.f4.seller, 1 / 9, 0.015), JSON.stringify(pk.f4));

  // mỗi NPC xuất hiện đúng chỗ: ải x-1 (x >= 2), trong phòng khởi đầu; không ở x-2 và không ở tầng 1
  const where = {};
  for (const kind of ['gambler', 'seller', 'prophet']) {
    await p.evaluate(k => { SK.matrix.npcForce = k; }, kind);
    await stageTo('3-1');
    where[kind] = await p.evaluate(k => {
      const G = SK.G, r = G.map.rooms[0], it = G.interactables.find(i => i.npcKind === 'matrix_' + k), pr = G.props.find(q => q.npc === 'matrix_' + k);
      const inRoom = it && Math.abs(it.x - (r.cx * 16 + 8)) <= r.w / 2 * 16 && Math.abs(it.y - (r.cy * 16 + 8)) <= r.h / 2 * 16;
      const pf = !!SK.prefab('npc_' + k);
      return { has: !!it, prop: !!pr, inRoom, pf, label: it && it.label, n: G.interactables.filter(i => /^matrix_/.test(i.npcKind || '')).length };
    }, kind);
  }
  check('3 NPC tay sai dựng ở phòng khởi đầu 3-1 bằng prefab gốc (npc_gambler/seller/prophet có trong sk-data), mỗi lần một NPC',
    ['gambler', 'seller', 'prophet'].every(k => where[k].has && where[k].prop && where[k].inRoom && where[k].pf && where[k].n === 1), JSON.stringify(where));
  await stageTo('3-2');
  const w2 = await p.evaluate(() => SK.G.interactables.filter(i => /^matrix_/.test(i.npcKind || '')).length);
  await stageTo('1-1');
  const w1 = await p.evaluate(() => SK.G.interactables.filter(i => /^matrix_/.test(i.npcKind || '')).length);
  check('không có NPC tay sai ở 3-2 và ở tầng 1 (1-1)', w2 === 0 && w1 === 0, 'x-2: ' + w2 + ' · 1-1: ' + w1);

  // nâng cấp vũ khí qua Con Bạc: thắng trừ nửa vàng + w.lvl +1 + sát thương đổi theo; thua trừ nửa vàng + 1 bình an ủi; mỗi NPC một lần
  await p.evaluate(() => { SK.matrix.npcForce = 'gambler'; });
  await stageTo('3-1');
  const gb = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, pl = G.player, o = {}, P0 = m.P;
    m.P = 4; const w = pl.weapons[pl.cur]; w.lvl = 0; const base = w.def.dmg;
    const fx = () => { SK.factorsTick(G, pl, 0.016); return pl['_fx_dmgMul_wlvl'] || 1; };
    o.base = base; o.mul0 = fx(); o.loss0 = M.weaponLoss(G, w);
    const ia = G.interactables.find(i => i.npcKind === 'matrix_gambler');
    pl.gold = 101; G.pickups = [];
    const rnd0 = M.gamblerUse; // thắng: ép r = 0
    const it = G.props.find(q => q.npc === 'matrix_gambler');
    const r1 = M.gamblerUse(G, it, () => 0);
    o.win = { ok: r1.ok, win: r1.win, gold: pl.gold, lvl: w.lvl, mul: fx(), loss: M.weaponLoss(G, w), used: it.used };
    const r2 = M.gamblerUse(G, it, () => 0);
    o.again = { ok: r2.ok, gold: pl.gold, lvl: w.lvl };
    // thua: một Con Bạc khác (item mới), r = 0.99
    const it2 = { used: false }; pl.gold = 40;
    const r3 = M.gamblerUse(G, it2, () => 0.99);
    o.lose = { ok: r3.ok, win: r3.win, gold: pl.gold, lvl: w.lvl, pots: G.pickups.filter(k => k.kind === 'hp_pot' || k.kind === 'en_pot').length };
    pl.gold = 1; const it3 = { used: false }; const r4 = M.gamblerUse(G, it3, () => 0);
    o.poor = { ok: r4.ok, why: r4.why, gold: pl.gold, used: it3.used };
    // qua giao diện thật: bấm tương tác với 1 vàng đủ nửa = 0 → từ chối; nhiều vàng thì chạy
    pl.gold = 10; ia.use(); o.ui = { gold: pl.gold, used: it.used };   // it đã dùng: không trừ nữa
    o.label = ia.label; m.P = P0; w.lvl = null; fx();
    return o;
  });
  const lossAt = (P, l) => Math.floor(Math.max(0, P - l) / 2), mulAt = (b, P, l) => Math.max(1, b - lossAt(P, l)) / b;
  check('Con Bạc thắng (r=0): trừ nửa vàng (101 → 51), vũ khí lvl 0 → 1; ở P=4 sát thương mất 2 → 1 (hệ số đúng)',
    gb.win.ok && gb.win.win && gb.win.gold === 51 && gb.win.lvl === 1 && gb.loss0 === lossAt(4, 0) && gb.win.loss === lossAt(4, 1) &&
    Math.abs(gb.mul0 - mulAt(gb.base, 4, 0)) < 1e-9 && Math.abs(gb.win.mul - mulAt(gb.base, 4, 1)) < 1e-9 && gb.win.mul > gb.mul0, JSON.stringify(gb.win) + ' base ' + gb.base + ' mul0 ' + gb.mul0);
  check('Con Bạc mỗi người chơi một lần: lần hai không trừ vàng, không nâng cấp', !gb.again.ok && gb.again.gold === 51 && gb.again.lvl === 1, JSON.stringify(gb.again));
  check('Con Bạc thua (r=0.99): vẫn trừ nửa vàng (40 → 20), vũ khí giữ lvl, rơi 1 bình an ủi', gb.lose.ok && !gb.lose.win && gb.lose.gold === 20 && gb.lose.lvl === 1 && gb.lose.pots === 1, JSON.stringify(gb.lose));
  check('Con Bạc: chỉ 1 vàng thì nửa = 0 → từ chối, không mất gì; bấm tương tác thật sau khi đã dùng không trừ nữa', !gb.poor.ok && gb.poor.why === 'poor' && gb.poor.gold === 1 && !gb.poor.used && gb.ui.gold === 10 && gb.ui.used, JSON.stringify({ poor: gb.poor, ui: gb.ui, label: gb.label }));

  // Thương Nhân: 1~3 Pha Lê, chắc chắn nâng cấp
  await p.evaluate(() => { SK.matrix.npcForce = 'seller'; });
  await stageTo('3-1');
  const sl = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, pl = G.player, o = {}, P0 = m.P;
    m.P = 6; const w = pl.weapons[pl.cur]; w.lvl = 0;
    const it = G.props.find(q => q.npc === 'matrix_seller'), ia = G.interactables.find(i => i.npcKind === 'matrix_seller');
    o.cost = it.cost; o.label = ia.label;
    m.crystals = it.cost - 1; ia.use(); o.poor = { cr: m.crystals, lvl: w.lvl, used: it.used };
    m.crystals = 5; ia.use(); o.buy = { cr: m.crystals, lvl: w.lvl, used: it.used };
    ia.use(); o.again = { cr: m.crystals, lvl: w.lvl };
    o.costs = []; for (let i = 0; i < 60; i++) { const q = { cost: 0 }; q.cost = SK.randi(M.C3.merchantCost[0], M.C3.merchantCost[1]); o.costs.push(q.cost); }
    m.P = P0; w.lvl = null; SK.factorsTick(G, pl, 0.016);
    return o;
  });
  check('Thương Nhân: giá 1-3 Pha Lê; thiếu Pha Lê thì không làm gì; đủ thì trừ đúng giá và vũ khí lvl 0 → 1; lần hai không làm gì',
    sl.cost >= 1 && sl.cost <= 3 && sl.poor.cr === sl.cost - 1 && sl.poor.lvl === 0 && !sl.poor.used && sl.buy.cr === 5 - sl.cost && sl.buy.lvl === 1 && sl.buy.used && sl.again.cr === 5 - sl.cost && sl.again.lvl === 1,
    JSON.stringify(sl));
  check('giá Thương Nhân bốc 60 lần trải đủ 1, 2, 3', [1, 2, 3].every(c => sl.costs.indexOf(c) >= 0) && sl.costs.every(c => c >= 1 && c <= 3), sl.costs.slice(0, 12).join(','));

  // Thầy Bói: 1 Pha Lê, cấm một nhân tố tiêu cực trong 5 ải kể từ ải kế
  await p.evaluate(() => { SK.matrix.npcForce = 'prophet'; });
  await stageTo('3-1');
  const pr = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, o = {};
    const it = G.props.find(q => q.npc === 'matrix_prophet'), ia = G.interactables.find(i => i.npcKind === 'matrix_prophet');
    m.crystals = 0; ia.use(); o.poor = { cr: m.crystals, ban: (m.ban || []).length, used: it.used };
    m.crystals = 3; ia.use();
    const b = m.ban && m.ban[0];
    o.use = { cr: m.crystals, ban: (m.ban || []).length, key: b && b.key, neg: b && M.POOL.neg.indexOf(b.key) >= 0, from: b && b.from, used: it.used };
    ia.use(); o.again = { cr: m.crystals, ban: m.ban.length };
    o.win = b && [0, 1, 5, 6].map(d => M.isBanned(G, b.key, b.from + d));   // ải kế (+1) .. +5 bị cấm, +6 hết
    return o;
  });
  check('Thầy Bói: thiếu Pha Lê không làm gì; đủ thì trừ 1 Pha Lê, cấm 1 nhân tố tiêu cực; lần hai không làm gì',
    pr.poor.cr === 0 && pr.poor.ban === 0 && !pr.poor.used && pr.use.cr === 2 && pr.use.ban === 1 && pr.use.neg && pr.use.used && pr.again.cr === 2 && pr.again.ban === 1, JSON.stringify(pr));
  check('lệnh cấm kéo dài 5 ải kể từ ải kế: ải hiện tại không tính, +1..+5 bị cấm, +6 hết', pr.win && pr.win[0] === false && pr.win[1] === true && pr.win[2] === true && pr.win[3] === false, JSON.stringify(pr.win));
  await stageTo('3-5');
  const bj = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, key = m.ban[0].key, pick0 = M.pickKind;
    M.pickKind = () => 'neg';   // ép bốc nhân tố tiêu cực
    let got = 0, hit = 0, other = 0; const seen = {};
    for (let i = 0; i < 400; i++) {
      const f0 = G.factors.slice(), st0 = Object.assign({}, G.factorStack);
      delete m.judged[m.floor];
      const rec = M.judge(G, { reward: false });
      if (rec && rec.key) { got++; if (rec.key === key) hit++; else other++; seen[rec.key] = 1; }
      G.factors = f0; G.factorStack = st0; SK.factorsOn(G); m.verdicts.pop();
    }
    M.pickKind = pick0;
    // đối chứng: hết lệnh cấm thì nhân tố đó bốc lại được
    const ban = m.ban.splice(0); let back = 0;
    M.pickKind = () => 'neg';
    for (let i = 0; i < 600 && !back; i++) {
      const f0 = G.factors.slice(), st0 = Object.assign({}, G.factorStack); delete m.judged[m.floor];
      const rec = M.judge(G, { reward: false }); if (rec && rec.key === key) back++;
      G.factors = f0; G.factorStack = st0; SK.factorsOn(G); m.verdicts.pop();
    }
    M.pickKind = pick0; m.ban = ban;
    return { key, got, hit, other, kinds: Object.keys(seen).length, back };
  });
  check('Tà Vương ở 3-5 (trong 5 ải cấm) không bốc nhân tố bị cấm qua 400 lần phạt, vẫn bốc đủ loại khác; bỏ lệnh cấm thì bốc lại được', bj.got > 300 && bj.hit === 0 && bj.kinds >= 5 && bj.back > 0, JSON.stringify(bj));

  // thiên phú 2001-2007, 2117
  await p.evaluate(() => { SK.matrix.npcForce = null; });
  await stageTo('3-1');
  const bf = await p.evaluate(() => {
    const B = SK_BUFFS86.buffs, R = SK_ROOMS, o = {};
    o.reg = [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2117].map(i => !!(B[i] && B[i].name && B[i].name.vi && B[i].info && B[i].info.vi && R.DEF[i] && R.DEF[i].active));
    o.info2117 = B[2117].info.vi; o.names = [2001, 2007, 2117].map(i => B[i].name.vi);
    o.oldKeep = !!B[3001] && !!B[2101];
    return o;
  });
  check('8 thiên phú 2001-2007 + 2117 có tên/mô tả Việt trong data/sk-buffs86.js và được đăng ký ở SK_ROOMS.DEF', bf.reg.every(Boolean) && /8s/.test(bf.info2117) && bf.oldKeep, JSON.stringify(bf));

  // 2001, 2002: hồi khi vào ải kế
  const rec1 = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.buffs = pl.buffs || []; pl.hpMax = 30; pl.hp = 5; pl.energyMax = 100; pl.energy = 10; SK_GAME.debug.god(true); return { hp: pl.hp, en: pl.energy }; });
  await stageTo('3-2');
  const ctl = await p.evaluate(() => ({ hp: SK.G.player.hp, en: SK.G.player.energy }));
  await p.evaluate(() => { const G = SK.G, pl = G.player; SK_ROOMS.takeBuff(2001); SK_ROOMS.takeBuff(2002); pl.hpMax = 30; pl.hp = 5; pl.energyMax = 100; pl.energy = 10; });
  await stageTo('3-3');
  const rec2 = await p.evaluate(() => ({ hp: SK.G.player.hp, en: SK.G.player.energy, mul: SK.G.mods.healMul }));
  check('2001: vào ải kế hồi 10% HP tối đa (30 → +3); 2002: hồi 30% năng lượng tối đa (100 → +30); không có buff thì không đổi',
    ctl.hp === 5 && ctl.en === 10 && rec2.hp === 8 && rec2.en === 40, JSON.stringify({ ctl, rec2 }));
  const rec3 = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.hpMax = 4; pl.hp = 1; G.mods.healMul = 0.5; return 1; });
  await stageTo('3-4');
  const rec4 = await p.evaluate(() => { const pl = SK.G.player; return { hp: pl.hp }; });
  check('2001 hồi tối thiểu 1 HP (HP tối đa 4 → +1) và không bị Thuốc kém chất lượng (healMul 0,5) giảm', rec4.hp === 2, JSON.stringify(rec4));

  // 2003 Xích Điện
  const zp = await p.evaluate(() => {
    const G = SK.G, M = SK.matrix, room = G.map.rooms[0], o = {};
    SK_ROOMS.takeBuff(2003); M.geneOff = true;
    M.C3.zapChance = 1; M.C3.zapStunChance = 1;
    const id = G.map.th.enemies.find(x => SK.D.enemies[x]);
    G.enemies = [];
    const mk = (x, y) => { const e = SK.makeEnemy(G, id, x, y, room); e.st = 'idle'; e.hp = e.hpMax = 1000; e.boss = false; G.enemies.push(e); return e; };
    const A = mk(200, 200), others = [0, 1, 2, 3, 4].map(i => mk(200 + 12 + i * 6, 200)), far = mk(200 + 500, 200);
    G.player._m3zap = 0;
    SK.hurtEnemy(G, A, 1, false, 0, 0);
    o.a = 1000 - A.hp; o.others = others.map(e => 1000 - e.hp); o.far = 1000 - far.hp; o.stun = others.filter(e => e.st === 'stun').length;
    // xác suất: 0,2 mặc định
    M.C3.zapChance = 0.2; let c = 0; for (let i = 0; i < 4000; i++) { G.player._m3zap = 0; const hp0 = A.hp; SK.hurtEnemy(G, A, 1, false, 0, 0); if (hp0 - A.hp > 1) c++; A.hp = A.hpMax; }
    o.rate = c / 4000;
    M.C3.zapChance = 0.2; M.C3.zapStunChance = 0.3; G.enemies = [];
    return o;
  });
  check('2003 Xích Điện: trúng quái A thì A mất 1+3, nảy đúng 4 quái gần nhất mỗi con 3 sát thương (con thứ 5 và quái ở xa không mất), choáng được',
    zp.a === 4 && zp.others.slice(0, 4).every(d => d === 3) && zp.others[4] === 0 && zp.far === 0 && zp.stun === 4, JSON.stringify(zp));
  check('2003 Xích Điện: xác suất kích hoạt mặc định ≈ 20% (±2%) mỗi đòn', nr(zp.rate, 0.2, 0.02), 'tỉ lệ ' + zp.rate);

  // 2004 Gai Băng
  const ic = await p.evaluate(() => {
    const G = SK.G, M = SK.matrix, room = G.map.rooms[0], o = {};
    SK_ROOMS.takeBuff(2004); M.C3.iceChance = 1; M.C3.iceFreeze = 1;
    const id = G.map.th.enemies.find(x => SK.D.enemies[x]);
    G.enemies = []; G.props = G.props.filter(q => !q.shard);
    const mk = (x, y) => { const e = SK.makeEnemy(G, id, x, y, room); e.st = 'idle'; e.hp = e.hpMax = 1000; G.enemies.push(e); return e; };
    const A = mk(G.player.x + 20, G.player.y);   // chỗ trống gần người chơi (gai chết khi chạm tường)
    G.player._m3ice = 0;
    SK.hurtEnemy(G, A, 1, false, 0, 0);
    const sh = G.props.filter(q => q.shard);
    o.shards = sh.length;
    const s3 = sh[3], B = mk(s3.x + s3.vx * 0.2, s3.y + s3.vy * 0.2 + 6);
    B.st = 'stun'; B.stT = 9;
    G.props = G.props.filter(q => !q.shard || q === s3);   // chỉ giữ gai số 3 để đo một lần trúng
    o.A = 1000 - A.hp;
    s3.update(G, s3, 0.2);   // gai số 3 bay 0,2 s (30 px) tới đúng chỗ quái B
    o.bHp = 1000 - B.hp; o.bIce = !!(B._db && B._db.ice);
    return o;
  });
  const ic2 = await p.evaluate(() => {
    const G = SK.G, B = G.enemies[1];
    return { hp: B ? 1000 - B.hp : null, ice: !!(B && B._db && B._db.ice), left: G.props.filter(q => q.shard).length };
  });
  check('2004 Gai Băng: trúng quái bắn đúng 12 gai; gai trúng quái khác gây 2 sát thương và đóng băng (xác suất ép 100%)', ic.shards === 12 && ic.bHp === 2 && ic.bIce, JSON.stringify({ ic, ic2 }));
  await p.evaluate(() => { SK.matrix.C3.iceChance = 0.2; SK.matrix.C3.iceFreeze = 0.25; SK.G.enemies = []; SK.G.props = SK.G.props.filter(q => !q.shard); });

  // 2005: Peff -1; 2006: gỡ nhân tố xấu vừa nhận; 2007: +20 năng lượng tối đa, cộng dồn 10 lần
  const bg = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, M = SK.matrix, pl = G.player, o = {}, P0 = m.P;
    m.P = 6; o.p0 = M.peff(G); o.sm0 = M.statusMul(G);
    SK_ROOMS.takeBuff(2005); o.p1 = M.peff(G); o.sm1 = M.statusMul(G); m.P = P0;
    // 2006
    SK.factorsAdd(G, 'EnemyDefence'); SK.factorsAdd(G, 'MoreGeneEnemy'); SK.factorsAdd(G, 'MoreGeneEnemy');
    m.verdicts.push({ floor: 99, reward: false, kind: 'neg', key: 'MoreGeneEnemy' });
    o.before = { f: G.factors.slice(), def: G.mods.enemyDef, mu: G.mods.mutateRate, st: SK.factorStack(G, 'MoreGeneEnemy') };
    SK_ROOMS.takeBuff(2006);
    o.after = { f: G.factors.slice(), def: G.mods.enemyDef, mu: G.mods.mutateRate, st: SK.factorStack(G, 'MoreGeneEnemy') };
    return o;
  });
  check('2005: triệt tiêu 1 cấp Uy Áp của kháng khống chế (P=6: Peff 6 → 5, thời gian trạng thái ×0,5^(6/3) → ×0,5^(5/3))', bg.p0 === 6 && bg.p1 === 5 && Math.abs(bg.sm0 - 0.25) < 1e-9 && Math.abs(bg.sm1 - Math.pow(0.5, 5 / 3)) < 1e-9, JSON.stringify({ p0: bg.p0, p1: bg.p1, sm0: bg.sm0, sm1: bg.sm1 }));
  check('2006: gỡ nhân tố xấu vừa nhận (Đột Biến Gen ×2 → ×1, tỉ lệ gen 4% → 2%); nhân tố khác (Kẻ Địch Kiên Cuồng, phòng thủ +1) giữ nguyên', bg.before.st === 2 && bg.after.st === 1 && Math.abs(bg.before.mu - 0.04) < 1e-9 && Math.abs(bg.after.mu - 0.02) < 1e-9 && bg.before.def === 1 && bg.after.def === 1 && bg.after.f.indexOf('EnemyDefence') >= 0, JSON.stringify(bg));

  const en = await p.evaluate(() => {
    const G = SK.G, R = SK_ROOMS, pl = G.player, o = {}, e0 = pl.energyMax;
    const open = () => { R.openChoice([2007, 1, 2]); };
    open(); R.pick(0); o.first = pl.energyMax - e0; o.has = pl.buffs.indexOf(2007) >= 0;
    const inList = () => SK.matrix.inject.toString().length > 0;
    for (let i = 0; i < 14; i++) { open(); R.pick(0); }   // quá 10 lần
    o.total = pl.energyMax - e0; o.n = pl.bm.matEn;
    // lần chọn thứ 10 xong thì 2007 không còn được mời
    const M = SK.matrix, seen = {}; M.C3.exclusiveRate = 1;
    for (let i = 0; i < 300; i++) { R.openChoice([1, 2, 3]); M.inject(); for (const c of R.choice.cards) seen[c] = 1; R.choice.open = false; G.hold = false; }
    o.offered2007 = !!seen[2007]; o.kinds = Object.keys(seen).filter(k => +k >= 2000).length;
    M.C3.exclusiveRate = 0.5;
    return o;
  });
  check('2007: +20 năng lượng tối đa mỗi lần nhận, chọn lại được khi đã có, dừng ở 10 lần (+200); đủ 10 lần thì thẻ này không còn được mời', en.first === 20 && en.has && en.total === 200 && en.n === 10 && !en.offered2007, JSON.stringify(en));

  // thẻ riêng trong bộ 3: xác suất mặc định 50% mỗi lần mở, không trùng thẻ, đủ nhiều loại
  const ex = await p.evaluate(() => {
    const G = SK.G, R = SK_ROOMS, M = SK.matrix, pl = G.player, N = 4000; let n = 0, dup = 0; const seen = {};
    const save = pl.buffs.slice(); pl.buffs = pl.buffs.filter(b => b < 2000 || b > 2200); pl.bm.matEn = 0;
    for (let i = 0; i < N; i++) {
      R.openChoice([1, 2, 3]);
      if (M.inject()) { n++; for (const c of R.choice.cards) if (c >= 2000) seen[c] = 1; }
      if (new Set(R.choice.cards).size !== R.choice.cards.length) dup++;
      R.choice.open = false; G.hold = false;
    }
    pl.buffs = save;
    return { rate: n / N, dup, kinds: Object.keys(seen).length };
  });
  check('bộ 3 thẻ sau x-2 / x-5: thiên phú riêng Mê Trận chen vào ≈ 50% (±3%), không trùng thẻ, bốc đủ ≥ 6 loại', nr(ex.rate, 0.5, 0.03) && ex.dup === 0 && ex.kinds >= 6, JSON.stringify(ex));

  // 2117: chống đỡ đòn nguyên tố mỗi 8 s
  const eb = await p.evaluate(() => {
    const G = SK.G, M = SK.matrix, pl = G.player, o = {}, P0 = G.matrix.P; G.matrix.P = 0;
    SK_ROOMS.takeBuff(2117);
    const mkb = (pf) => SK.spawnBullet86(G, 'e', pf, pl.x, pl.y - 6, 0, { dmg: 1, spd: 0.01, life: 5, h: 6 });
    const hit = pf => { const b = mkb(pf); pl.invulT = 0; pl.armor = 99; pl.armorMax = 99; pl.hp = pl.hpMax = 99; const r = SK.hurtPlayer(G, 1, b.x, b.y); b.dead = true; return { r, lost: (99 - pl.armor) + (99 - pl.hp) }; };
    pl._m3blk = 0; M.blocked = 0;
    o.plain = hit('bullet_0');                 // đạn thường: không chặn
    o.fire = hit('bullet_e_fire_sacrifice');   // nguyên tố: chặn
    o.fire2 = hit('bullet_thunder');           // còn hồi chiêu 8 s: bị trúng
    pl._m3blk = G.t + 100; o.cd = pl._m3blk - G.t > 7.9;
    pl._m3blk = G.t - 0.1; o.fire3 = hit('bullet_thunder');   // hết hồi chiêu: chặn tiếp
    o.next = Math.round(pl._m3blk - G.t);
    const b = mkb('bullet_0'); b.elem = 'poison'; pl._m3blk = 0; pl.invulT = 0; pl.armor = 99; pl.armorMax = 99; pl.hp = pl.hpMax = 99;
    o.gene = { r: SK.hurtPlayer(G, 1, b.x, b.y), lost: (99 - pl.armor) + (99 - pl.hp) }; b.dead = true;
    o.blocked = M.blocked; G.matrix.P = P0;
    return o;
  });
  check('2117: đạn thường vẫn trúng; đạn lửa/sét/độc bị chặn đúng 1 lần rồi hồi chiêu 8 s (trúng lại), hết hồi chiêu thì chặn tiếp',
    eb.plain.lost === 1 && eb.fire.lost === 0 && eb.fire2.lost === 1 && eb.fire3.lost === 0 && eb.next === 8 && eb.gene.lost === 0 && eb.blocked === 3, JSON.stringify(eb));

  // HP trùm theo wiki: gốc × (1 + 0,15 P) × 1,25 (Tinh Anh = Lợi Hại) × 0,75 (Hai Lãnh Chúa); ví dụ wiki P=20 → hệ số 4 × 1,25 × 0,75 = 3,75
  const bs = await p.evaluate(() => {
    const G = SK.G, m = G.matrix, room = G.map.rooms[0], P0 = m.P, o = {};
    const pid = Object.keys(SK.BOSS_AIS)[0];
    const hp = () => SK.makeEnemy(G, pid, room.cx * 16, room.cy * 16, room).hpMax;
    G.factors = []; G.factorStack = {}; SK.factorsOn(G);
    m.P = 0; G.badass = false; o.base = hp();
    G.badass = true; o.champ = hp();
    G.badass = false; m.P = 20; o.p20 = hp();
    G.badass = true; SK.factorsAdd(G, 'DoubleBoss'); o.all = hp();
    G.badass = false; o.duo = hp();
    G.badass = false; G.factors = []; G.factorStack = {}; SK.factorsOn(G); m.P = P0;
    o.pid = pid;
    return o;
  });
  check('HP trùm ở Mê Trận: Tinh Anh ×1,25 (không phải ×1,5); P=20 ×4; Hai Lãnh Chúa ×0,75; P=20 + Tinh Anh + Hai Lãnh Chúa ×3,75',
    nr(bs.champ / bs.base, 1.25, 0.003) && nr(bs.p20 / bs.base, 4, 0.005) && nr(bs.duo / bs.p20, 0.75, 0.003) && nr(bs.all / bs.base, 3.75, 0.01), JSON.stringify(bs));

  check('không lỗi trang', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
