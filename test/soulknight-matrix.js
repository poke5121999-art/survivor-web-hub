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
    const G = SK.G, m = G.matrix, P0 = m.P, room = G.map.rooms[0];
    const id = G.map.th.enemies.find(x => SK.D.enemies[x]);
    const hpAt = P => { m.P = P; const e = SK.makeEnemy(G, id, 100, 100, room); return e.hp + '/' + e.hpMax; };
    const base = SK.D.enemies[id] && (hpAt(0));
    const out = { id, base, p3: hpAt(3), p7: hpAt(7), p20: hpAt(20) };
    const b = parseInt(base, 10);
    out.exp = [b, Math.round(b * 1.45), Math.round(b * 2.05), Math.round(b * 4)];
    m.P = P0;
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

  check('không lỗi trang', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
