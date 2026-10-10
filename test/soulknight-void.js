/*
 * Xâm Nhập Hư Không độ 1-3 (games/soulknight/js/void.js, js/void2.js, MODES.md mục 2e).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-void.js
 *
 * 1. Vào chế độ bằng SK_GAME.debug.void(): mode 'void', 15 ải, 3 loại Tinh Anh, không Lợi Hại.
 * 2. Khiên: Tinh Anh có 3 tầng × 80; đòn 50 sát thương chỉ trừ 1 khiên-HP, máu không đổi; phá đủ 3 tầng (qua 3 lần gặp,
 *    tầng giữ lại) mới trừ máu thật; chết rơi 50 Xu + 1 Mắt.
 * 3. Cách phá riêng: Thủ Vệ (trúng lúc khiên biến mất khi lao), Ảnh Vệ (bản thật, khiên biến mất trước khi lao; phân thân 30 HP
 *    không khiên), Linh Vệ (thiên thạch trúng nó, Cầu Lửa dẫn về nó). Mỗi lần phá 1 tầng: -1 tầng, +30 Xu, rút lui.
 * 4. Hạ hết quái nhỏ mà khiên còn: bỏ chạy +5 Xu. Đạo Tặc: 100 HP, không khiên, hạ rơi 100 Xu + 1 Mắt, 20 giây thì biến mất.
 * 5. Trùm Hư Không 600/1200/1800 (Hai Lãnh Chúa 450/900/1350); 1-5 chính chết trước thì bỏ chạy +40 Xu; 3-5 chỉ ra sau trùm chính.
 * 6. Qua hết 15 ải ra màn chiến thắng có dòng Xu Ám Tinh đúng.
 * 7. Độ 2 Hỗn Độn (js/void2.js): nút độ khó khoá/mở theo hồ sơ voidWon; khiên 120/tầng; Rãnh Nứt -2; người chơi +1 sát thương mọi nguồn;
 *    bể Tinh Anh theo độ; Huyết Vệ (huyết trì 3/giây to dần), Tế Tư (nối quái, cầu đen 9), Cấm Vệ (khiên đỏ, 5/5/5/7); thiên phú 3001-3003.
 * 8. Độ 3 Hủy Diệt: khiên 160/tầng; Khiên Hư Không người chơi 12 tầng (3004) + hồi tầng + đếm ngược; 3005-3007; Thiền Vệ Trượng/Châu,
 *    Triệu Hồi Sư, Hộ Pháp, Đao Phủ (4-x); trùm 1000/2000/3000.
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
  // Lối vào thật: độ khó thứ ba của thẻ Chế độ Ải (mở cùng điều kiện Lợi Hại: đã vượt Chế độ Ải một lần).
  await p.evaluate(() => { localStorage.setItem('sk.profile.v1', JSON.stringify({ won: { knight: 1 }, gems: 0 })); });
  await p.reload();
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => SK.lobby.openModes());
  await p.click('#hs-mode-diff button[data-d="void"]');
  const ui = await p.evaluate(() => ({ sel: document.querySelector('#hs-mode-diff button.sel').dataset.d, img: document.getElementById('hs-mode-img').src.split('/').pop(), vd: SK.profile.voidDiff }));
  await p.evaluate(() => { document.getElementById('hs-modes').hidden = true; SK.lobby.launch('knight', SK.profile.voidDiff ? 'void' : undefined, []); });
  const viaUi = await p.evaluate(() => ({ mode: SK_GAME.mode, bad: !!SK.G.badass }));
  check('thẻ Chế độ Ải có độ khó "Lần Đầu Vào Hư Không" (ảnh diff_3), chọn rồi vào ván là chế độ void, không Lợi Hại', ui.sel === 'void' && ui.vd && ui.img === 'diff_3.png' && viaUi.mode === 'void' && !viaUi.bad, JSON.stringify({ ui, viaUi }));
  await p.evaluate(() => { SK_GAME.debug.seed(11); SK.G.badass = true; SK_GAME.debug.void(); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
  const s0 = await p.evaluate(() => {
    const G = SK.G;
    return { mode: SK_GAME.mode, n: SK.STAGES.length, last: SK.STAGES[SK.STAGES.length - 1].label, roster: G.void.roster.join(','), bad: !!G.badass, xu: G.void.xu, eyes: G.void.eyes };
  });
  check('vào Xâm Nhập Hư Không: mode void, 15 ải 1-1..3-5, 3 loại Tinh Anh, Lợi Hại tắt, 0 Xu / 0 Mắt',
    s0.mode === 'void' && s0.n === 15 && s0.last === '3-5' && s0.roster === 'guard,assassin,mage' && !s0.bad && s0.xu === 0 && s0.eyes === 0, JSON.stringify(s0));

  // dựng một quái Hư Không đứng yên trong phòng đầu, cách người chơi `off` px; cd lớn nên không tự đánh, tuổi âm nên không tự bỏ chạy
  await p.evaluate(() => {
    window.T = {
      mk(kind, off, quiet) {
        const G = SK.G, V = SK.voidMode, pl = G.player, room = G.map.rooms[0];
        const id = V.KINDS[kind].id;
        const [x, y] = SK.freeNear([pl.x + (off == null ? 60 : off), pl.y]);
        const e = SK.makeEnemy(G, id, x, y, room);
        e.st = 'idle'; e.stT = 0; e.age = -1e6;
        if (quiet !== false) e.cd = 1e9;
        G.enemies.push(e);
        return e;
      },
      hit(e, dmg) { return SK.hurtEnemy(SK.G, e, dmg == null ? 50 : dmg, false, 0, 0); },
      clear() { const G = SK.G; G.enemies = []; G.void.keep = {}; G.void.defeated = []; G.void.xu = 0; G.void.eyes = 0; G.void.kills = 0; G.void.fled = 0; },
      st() { const v = SK.G.void; return { xu: v.xu, eyes: v.eyes, keep: JSON.stringify(v.keep), def: v.defeated.join(',') }; }
    };
  });

  // ---- 2. khiên
  let r = await p.evaluate(() => {
    const e = T.mk('guard'), o = { hp0: e.hp, st0: e.vs.stacks, sh0: e.vs.hp, mx: e.hpMax };
    T.hit(e, 50); o.sh1 = e.vs.hp; o.hp1 = e.hp;
    for (let i = 0; i < 9; i++) T.hit(e, 50);
    o.sh10 = e.vs.hp; o.hp10 = e.hp; o.st10 = e.vs.stacks;
    return o;
  });
  check('Thủ Vệ 250 HP, 3 tầng khiên × 80', r.hp0 === 250 && r.mx === 250 && r.st0 === 3 && r.sh0 === 80, JSON.stringify(r));
  check('đòn 50 sát thương chỉ trừ 1 khiên-HP (80 -> 79 -> 70 sau 10 đòn), máu thật giữ 250, tầng giữ 3',
    r.sh1 === 79 && r.hp1 === 250 && r.sh10 === 70 && r.hp10 === 250 && r.st10 === 3, JSON.stringify(r));

  // phá đủ 3 tầng qua 3 lần gặp (hao mòn): tầng giữ qua lần gặp, tầng cuối vỡ thì ở lại và mất máu thật
  r = await p.evaluate(() => {
    T.clear();
    const o = {};
    let e = T.mk('guard'); e.vs.hp = 1; const x0 = SK.G.void.xu; T.hit(e, 50);
    o.a = { stacks: e.vs.stacks, st: e.st, leave: !!e.leave, xu: SK.G.void.xu - x0, keep: SK.G.void.keep.guard };
    e = T.mk('guard'); o.b0 = e.vs.stacks; e.vs.hp = 1; T.hit(e, 50);
    o.b = { stacks: e.vs.stacks, st: e.st, keep: SK.G.void.keep.guard };
    e = T.mk('guard'); o.c0 = e.vs.stacks; e.vs.hp = 1; T.hit(e, 50);
    o.c = { stacks: e.vs.stacks, st: e.st, hp: e.hp };
    T.hit(e, 50); o.c2 = { hp: e.hp, st: e.st };
    const k0 = SK.G.kills; e.hp = 10; const xu1 = SK.G.void.xu, ey1 = SK.G.void.eyes; T.hit(e, 50);
    o.d = { st: e.st, dxu: SK.G.void.xu - xu1, deyes: SK.G.void.eyes - ey1, def: SK.G.void.defeated.join(','), kills: SK.G.kills - k0, total: SK.G.void.xu };
    return o;
  });
  check('phá 1 tầng: còn 2 tầng, +30 Xu, rút lui (không tính hạ), tầng giữ cho lần gặp sau',
    r.a.stacks === 2 && r.a.st === 'dead' && r.a.leave && r.a.xu === 30 && r.a.keep === 2 && r.b0 === 2, JSON.stringify(r.a));
  check('lần gặp 2 còn 1 tầng, lần gặp 3 vỡ tầng cuối thì ở lại (0 tầng, 250 HP chưa mất)',
    r.b.stacks === 1 && r.b.st === 'dead' && r.c0 === 1 && r.c.stacks === 0 && r.c.st !== 'dead' && r.c.hp === 250, JSON.stringify([r.b, r.c]));
  check('phá đủ 3 tầng mới trừ máu thật: đòn 50 thì 250 -> 200', r.c2.hp === 200 && r.c2.st !== 'dead', JSON.stringify(r.c2));
  check('hết khiên rồi hạ: +50 Xu + 1 Mắt, tính 1 lần hạ, loại này không xuất hiện lại', r.d.st === 'dead' && r.d.dxu === 50 && r.d.deyes === 1 && r.d.kills === 1 && r.d.def === 'guard' && r.d.total === 30 * 3 + 50, JSON.stringify(r.d));

  // ---- 3. cách phá riêng
  // Thủ Vệ: khiên mở trong lúc lao
  r = await p.evaluate(async () => {
    T.clear();
    const e = T.mk('guard', 70, false), o = {};
    e.cd = 0;
    const pre = await new Promise(res => { let n = 0; (function f() { if (e.vs.open) return res(false); if (e.act === 'wind' || n++ > 200) return res(e.act === 'wind'); requestAnimationFrame(f); })(); });
    o.windBeforeHit = pre;
    T.hit(e, 50); o.closedStacks = e.vs.stacks; o.closedHp = e.vs.hp;   // khiên đóng: chỉ 1 khiên-HP
    o.opened = await new Promise(res => { const t0 = performance.now(); (function f() { if (e.vs.open) return res(true); if (performance.now() - t0 > 3000) return res(false); requestAnimationFrame(f); })(); });
    const x0 = SK.G.void.xu; T.hit(e, 50);
    o.after = { stacks: e.vs.stacks, xu: SK.G.void.xu - x0, st: e.st };
    return o;
  });
  check('Thủ Vệ: đánh lúc khiên đóng chỉ trừ 1; trúng lúc khiên biến mất khi lao phá 1 tầng (+30 Xu, rút lui)',
    r.windBeforeHit && r.closedStacks === 3 && r.closedHp === 79 && r.opened && r.after.stacks === 2 && r.after.xu === 30 && r.after.st === 'dead', JSON.stringify(r));

  // Ảnh Vệ: gọi 2 phân thân 30 HP; khiên biến mất trước khi lao
  r = await p.evaluate(async () => {
    T.clear();
    const e = T.mk('assassin', 70, false), o = {};
    e.cd = 0;
    await new Promise(res => { const t0 = performance.now(); (function f() { if (e.act === 'wind' || performance.now() - t0 > 3000) return res(); requestAnimationFrame(f); })(); });
    const cl = SK.G.enemies.filter(c => c.clone && c.owner === e);
    o.clones = cl.length; o.cloneHp = cl.map(c => c.hp).join(','); o.cloneShield = cl.some(c => c.vs);
    T.hit(e, 50); o.closed = { stacks: e.vs.stacks, hp: e.vs.hp };
    o.opened = await new Promise(res => { const t0 = performance.now(); (function f() { if (e.vs.open) return res(true); if (performance.now() - t0 > 3000) return res(false); requestAnimationFrame(f); })(); });
    const k0 = SK.G.kills, x0 = SK.G.void.xu;
    if (cl[0]) { cl[0].hp = 1; T.hit(cl[0], 50); }   // phân thân chết: không khiên, không thưởng
    o.cloneDead = cl[0] && cl[0].st === 'dead'; o.cloneXu = SK.G.void.xu - x0;
    T.hit(e, 50);
    o.after = { stacks: e.vs.stacks, xu: SK.G.void.xu - x0, st: e.st };
    return o;
  });
  check('Ảnh Vệ: gọi 2 phân thân 30 HP không khiên; phân thân chết không rơi Xu',
    r.clones === 2 && r.cloneHp === '30,30' && !r.cloneShield && r.cloneDead && r.cloneXu === 0, JSON.stringify(r));
  check('Ảnh Vệ: đánh lúc khiên đóng chỉ trừ 1; trúng lúc khiên biến mất trước khi lao phá 1 tầng (+30 Xu, rút lui)',
    r.closed.stacks === 3 && r.closed.hp === 79 && r.opened && r.after.stacks === 2 && r.after.xu === 30 && r.after.st === 'dead', JSON.stringify(r));

  // Linh Vệ: thiên thạch trúng chính nó
  r = await p.evaluate(async () => {
    T.clear();
    const e = T.mk('mage', 10), o = {};
    e.act = 'rest'; e.actT = 1e9;   // đứng yên (Linh Vệ thật lùi giữ khoảng cách)   // người chơi đứng sát Linh Vệ: thiên thạch bám người nên rơi cả lên nó
    SK.voidMode.spawnMeteor(SK.G, e, e.x, e.y - 8);
    await new Promise(res => { const t0 = performance.now(); (function f() { if (e.vs.stacks < 3 || performance.now() - t0 > 4000) return res(); requestAnimationFrame(f); })(); });
    o.after = { stacks: e.vs.stacks, st: e.st, xu: SK.G.void.xu, keep: SK.G.void.keep.mage };
    return o;
  });
  check('Linh Vệ: thiên thạch trúng khiên thì vỡ ngay 1 tầng (+30 Xu, rút lui)', r.after.stacks === 2 && r.after.st === 'dead' && r.after.xu === 30 && r.after.keep === 2, JSON.stringify(r));

  // Linh Vệ: Cầu Lửa Hư Không dẫn về nó (người chơi đứng phía bên kia)
  r = await p.evaluate(async () => {
    T.clear();
    const G = SK.G, pl = G.player, e = T.mk('mage', 60), o = {};
    pl.x = e.x - 70; pl.y = e.y - e.hb.off[1] + 8;
    SK.voidMode.spawnOrb(G, e, e.x + 40, e.y - e.hb.off[1]);
    const hp0 = pl.hp + pl.armor;
    await new Promise(res => { const t0 = performance.now(); (function f() { if (e.vs.stacks < 3 || performance.now() - t0 > 4000) return res(); requestAnimationFrame(f); })(); });
    o.after = { stacks: e.vs.stacks, st: e.st, xu: G.void.xu };
    return o;
  });
  check('Linh Vệ: Cầu Lửa dẫn về chính nó vỡ 1 tầng (+30 Xu)', r.after.stacks === 2 && r.after.st === 'dead' && r.after.xu === 30, JSON.stringify(r));

  // ---- 4. bỏ chạy và Đạo Tặc
  r = await p.evaluate(async () => {
    T.clear();
    const G = SK.G, e = T.mk('assassin', 80), o = {};
    e.age = 0; e.cd = 1e9;   // phòng không còn quái nhỏ nào
    await new Promise(res => { const t0 = performance.now(); (function f() { if (e.st === 'dead' || performance.now() - t0 > 5000) return res(); requestAnimationFrame(f); })(); });
    o.after = { st: e.st, leave: !!e.leave, xu: G.void.xu, stacks: e.vs.stacks, kills: G.void.kills, keep: G.void.keep.assassin };
    return o;
  });
  check('hạ hết quái nhỏ mà khiên còn: Tinh Anh bỏ chạy, +5 Xu, không tính hạ, khiên giữ 3 tầng',
    r.after.st === 'dead' && r.after.leave && r.after.xu === 5 && r.after.stacks === 3 && r.after.kills === 0 && r.after.keep === 3, JSON.stringify(r));

  r = await p.evaluate(() => {
    T.clear();
    const G = SK.G, e = T.mk('thief'), o = { hp: e.hp, shield: !!e.vs, life: e.life };
    o.hit = (T.hit(e, 30), e.hp);
    const x0 = G.void.xu, y0 = G.void.eyes; e.hp = 5; T.hit(e, 30);
    o.kill = { st: e.st, dxu: G.void.xu - x0, deyes: G.void.eyes - y0 };
    const f = T.mk('thief'); f.life = 0.01;
    return new Promise(res => setTimeout(() => { o.fled = { st: f.st, leave: !!f.leave, xu: G.void.xu - x0 - 100 }; res(o); }, 400));
  });
  check('Đạo Tặc: 100 HP, không khiên (đòn 30 trừ 30), hạ rơi 100 Xu + 1 Mắt', r.hp === 100 && !r.shield && r.hit === 70 && r.kill.st === 'dead' && r.kill.dxu === 100 && r.kill.deyes === 1, JSON.stringify(r));
  check('Đạo Tặc hết 20 giây thì biến mất (không rơi gì), thời gian ban đầu 20 giây', r.life === 20 && r.fled.st === 'dead' && r.fled.leave && r.fled.xu === 0, JSON.stringify(r));

  // ---- bốc quái vào phòng quái (G.buildWaves): 1-1 không có; từ 1-2 có Tinh Anh thuộc 3 loại, chỉ 1 Đạo Tặc cả ván
  r = await p.evaluate(() => {
    const G = SK.G, o = {}, V = SK.voidMode;
    const battle = () => G.map.rooms.find(x => x.type === 'battle');
    const ids = Object.values(V.KINDS).map(k => k.id);
    const scan = (lab, n) => {
      SK_GAME.debug.stage(lab); T.clear(); G.void.thiefSeen = false;
      const found = {}; let thieves = 0, other = 0;
      for (let i = 0; i < n; i++) for (const w of G.buildWaves(battle())) for (const id of w) {
        if (id === 'e_void_thief') thieves++; else if (ids.indexOf(id) >= 0) found[id] = (found[id] || 0) + 1;
        if (id === 'boss_void') other++;
      }
      return { found, thieves, other };
    };
    o.s11 = scan('1-1', 40);
    o.s12 = scan('1-2', 60);
    return o;
  });
  const n11 = Object.keys(r.s11.found).length + r.s11.thieves, n12 = Object.keys(r.s12.found);
  check('phòng quái 1-1 không có quái Hư Không; 1-2 bốc đủ 3 loại Tinh Anh (và không loại nào khác ngoài Đạo Tặc), Đạo Tặc tối đa 1 lần mỗi ván',
    n11 === 0 && n12.sort().join(',') === 'e_void_assassin,e_void_guard,e_void_mage' && r.s12.thieves === 1 && r.s12.other === 0, JSON.stringify(r));

  // ---- 5. trùm Hư Không
  r = await p.evaluate(() => {
    const G = SK.G, o = {}, room = G.map.rooms[0];
    for (const lab of ['1-5', '2-5', '3-5']) {
      SK_GAME.debug.stage(lab);
      const e = SK.makeEnemy(G, 'boss_void', 100, 100, room);
      G.mods = G.mods || {};
      o[lab] = e.hpMax;
      G.mods.doubleBoss = true;
      o[lab + 'x'] = SK.makeEnemy(G, 'boss_void', 100, 100, room).hpMax;
      G.mods.doubleBoss = false;
    }
    return o;
  });
  check('trùm Hư Không 600 / 1200 / 1800 ở 1-5 / 2-5 / 3-5; Hai Lãnh Chúa ×0,75 = 450 / 900 / 1350',
    r['1-5'] === 600 && r['2-5'] === 1200 && r['3-5'] === 1800 && r['1-5x'] === 450 && r['2-5x'] === 900 && r['3-5x'] === 1350, JSON.stringify(r));

  async function bossRoom(label) {
    await p.evaluate(l => { SK.bossDebug.force = 'boss08'; SK_GAME.debug.stage(l); SK_GAME.debug.god(true); }, label);
    await until(p, () => SK_GAME.phase === 'play', null, 6000);
    await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
    return until(p, () => SK.G.enemies.some(e => e.bossKey && e.st !== 'spawn' && e.st !== 'dead'), null, 10000);
  }
  let ok = await bossRoom('1-5');
  r = await p.evaluate(() => {
    const G = SK.G, vb = G.enemies.find(e => e.voidKind === 'voidboss'), m = G.enemies.find(e => e.bossKey);
    const o = { has: !!vb, hp: vb && vb.hpMax, main: !!m };
    G.void.xu = 0;
    for (const e of G.enemies) if (e.bossKey) { e.st = 'idle'; }
    SK.hurtEnemy(G, m, 99999, false, 0, 0);
    o.after = { st: vb && vb.st, leave: vb && !!vb.leave, xu: G.void.xu };
    return o;
  });
  check('1-5: Hư Không 600 HP đứng cạnh trùm chính; trùm chính chết trước thì Hư Không bỏ chạy, +40 Xu',
    ok && r.has && r.hp === 600 && r.main && r.after.st === 'dead' && r.after.leave && r.after.xu === 40, JSON.stringify(r));

  ok = await bossRoom('3-5');
  r = await p.evaluate(() => {
    const G = SK.G, o = { before: G.enemies.some(e => e.voidKind === 'voidboss') };
    const m = G.enemies.find(e => e.bossKey);
    G.void.xu = 0; G.void.eyes = 0;
    SK.hurtEnemy(G, m, 99999, false, 0, 0);
    const vb = G.enemies.find(e => e.voidKind === 'voidboss');
    o.after = !!vb; o.hp = vb && vb.hpMax; o.state = G.map.rooms.find(x => x.type === 'boss').state;
    if (vb) { vb.st = 'idle'; vb.stT = 0; SK.hurtEnemy(G, vb, 99999, false, 0, 0); }
    o.kill = { xu: G.void.xu, eyes: G.void.eyes };
    return o;
  });
  check('3-5: Hư Không chỉ ra sau khi trùm chính chết (1800 HP), phòng vẫn khoá; hạ rơi 1 Mắt + Xu',
    ok && r.before === false && r.after && r.hp === 1800 && r.state === 'locked' && r.kill.eyes === 1 && r.kill.xu >= 100, JSON.stringify(r));

  // ---- 5b. Rãnh Nứt Hư Không
  await p.evaluate(() => { SK_GAME.debug.stage('1-1'); SK_GAME.debug.god(false); });
  await until(p, () => SK_GAME.stage === '1-1' && SK_GAME.phase === 'play', null, 8000);
  r = await p.evaluate(async () => {
    const G = SK.G, V = SK.voidMode, pl = G.player, o = {};
    T.clear(); pl.god = false; pl.armor = 0; pl.invulT = 0; pl.hp = pl.hpMax;
    o.hp0 = pl.hp; pl.armorT = 99; const far = SK.freeNear([pl.x + 80, pl.y]);
    const rf = V.spawnRift(G, far[0], far[1], 3);
    o.n0 = G.void.rifts.length;
    await new Promise(res => { const t0 = performance.now(); (function f() { if (rf.age >= 0.8 || performance.now() - t0 > 6000) return res(); requestAnimationFrame(f); })(); });
    o.openHp = pl.hp; o.openAge = rf.age >= 0.8;   // đang mở, người chơi đứng xa: không mất máu
    pl.x = rf.x; pl.y = rf.y; pl.invulT = 0;
    pl.armor = 0; pl.armorT = 99; const hp0 = pl.hp + pl.armor;   // giáp hồi theo thời gian nên khoá hồi giáp rồi tính cả giáp
    await new Promise(res => { const t0 = performance.now(); (function f() { if (rf.hits || performance.now() - t0 > 4000) return res(); requestAnimationFrame(f); })(); });
    o.stood = hp0 - pl.hp - pl.armor;   // đứng trong rãnh: đúng 1 máu
    pl.invulT = 0;
    const a1 = rf.age; await new Promise(res => { const t0 = performance.now(); (function f() { if (rf.age > a1 + 0.4 || performance.now() - t0 > 4000) return res(); requestAnimationFrame(f); })(); });
    o.stood2 = hp0 - pl.hp - pl.armor;   // đứng tiếp: không bị trừ lặp
    await new Promise(res => { const t0 = performance.now(); (function f() { if (!G.void.rifts.length || performance.now() - t0 > 8000) return res(); requestAnimationFrame(f); })(); });
    o.closed = G.void.rifts.length;
    return o;
  });
  check('Rãnh Nứt: xuất hiện rồi đóng sau vài giây (không còn trong danh sách)', r.n0 === 1 && r.closed === 0, JSON.stringify(r));
  check('Rãnh Nứt: đứng xa không mất máu; bước vào mất đúng 1 máu (độ 1), đứng tiếp không bị trừ lặp', r.openAge && r.openHp === r.hp0 && r.stood === 1 && r.stood2 === 1, JSON.stringify(r));
  // tự xuất hiện khi đang đánh (phòng khoá)
  r = await p.evaluate(async () => {
    const G = SK.G; SK_GAME.debug.god(true);
    SK_GAME.debug.teleportTo('battle', 0);
    await new Promise(res => { const t0 = performance.now(); (function f() { if (G.room && G.room.state === 'locked' || performance.now() - t0 > 6000) return res(); requestAnimationFrame(f); })(); });
    const locked = !!(G.room && G.room.state === 'locked');
    G.void.riftT = 0; G.void.rifts = [];
    await new Promise(res => { const t0 = performance.now(); (function f() { if (G.void.rifts.length || performance.now() - t0 > 3000) return res(); requestAnimationFrame(f); })(); });
    return { locked, n: G.void.rifts.length };
  });
  check('Rãnh Nứt tự xuất hiện khi đang đánh trong phòng khoá', r.locked && r.n >= 1, JSON.stringify(r));
  await p.evaluate(() => { SK_GAME.debug.clearRoom(); SK.G.void.rifts = []; });

  // ---- 5c. NPC tiêu Xu Ám Tinh
  await p.evaluate(() => { SK_GAME.debug.stage('1-3'); SK_GAME.debug.god(true); });
  await until(p, () => SK_GAME.stage === '1-3' && SK_GAME.phase === 'play', null, 8000);
  r = await p.evaluate(() => {
    const G = SK.G, V = SK.voidMode, pl = G.player, R = SK_ROOMS, o = {};
    o.npcs = G.props.filter(q => q.npc).map(q => q.npc).join(',');
    o.acts = G.interactables.filter(q => q.npcKind === 'merchant').length;
    const act = G.interactables.find(q => q.npcKind === 'merchant');
    G.void.xu = 29; const n0 = pl.buffs.length;
    act.use(G, act); o.poor = { open: R.choice.open, xu: G.void.xu };
    G.void.xu = 100;
    act.use(G, act); o.paid = { open: R.choice.open, xu: G.void.xu, cards: R.choice.cards.length, hold: G.hold };
    const id = R.choice.cards[1];
    R.pick(1);
    o.got = { has: pl.buffs.indexOf(id) >= 0, n: pl.buffs.length - n0, open: R.choice.open };
    return o;
  });
  check('ải 1-3: có Thương Nhân Hư Không ở phòng khởi đầu', /merchant/.test(r.npcs) && r.acts === 1, JSON.stringify(r));
  check('Thương Nhân Hư Không: dưới 30 Xu bị từ chối, đủ thì trừ đúng 30 Xu, bốc 3 thiên phú, chọn 1 nhận đúng món',
    !r.poor.open && r.poor.xu === 29 && r.paid.open && r.paid.xu === 70 && r.paid.cards === 3 && r.paid.hold && r.got.has && r.got.n === 1 && !r.got.open, JSON.stringify(r));

  r = await p.evaluate(() => {
    const G = SK.G, V = SK.voidMode, pl = G.player, v = G.void, o = {};
    V.placeBanker(G, pl.x, pl.y);
    const row = k => V.exchange(G, k);
    pl.gold = 110; v.xu = 0; v.eyes = 0;
    o.a = [row('goldToXu'), pl.gold, v.xu];       // 55 vàng = 25 Xu
    o.b = [row('xuToGold'), pl.gold, v.xu];       // 25 Xu = 50 vàng
    v.eyes = 1; o.c = [row('eyeToGold'), pl.gold, v.eyes];   // 1 Mắt = 100 vàng
    o.d = [row('goldToEye'), pl.gold, v.eyes];    // 110 vàng = 1 Mắt
    v.xu = 55; o.e = [row('xuToEye'), v.xu, v.eyes];
    o.f = [row('eyeToXu'), v.xu, v.eyes];
    pl.gold = 50; o.g = [row('goldToXu'), pl.gold];             // không đủ vàng
    return o;
  });
  check('Nhà Ngân Hàng: 55 vàng -> 25 Xu; 25 Xu -> 50 vàng; 1 Mắt -> 100 vàng; 110 vàng -> 1 Mắt; 55 Xu -> 1 Mắt; 1 Mắt -> 50 Xu; thiếu thì từ chối',
    r.a[0] && r.a[1] === 55 && r.a[2] === 25 && r.b[1] === 105 && r.b[2] === 0 && r.c[1] === 205 && r.c[2] === 0 && r.d[1] === 95 && r.d[2] === 1 &&
    r.e[1] === 0 && r.e[2] === 2 && r.f[1] === 50 && r.f[2] === 1 && r.g[0] === false && r.g[1] === 50, JSON.stringify(r));

  await p.evaluate(() => { SK_GAME.debug.stage('3-5'); SK_GAME.debug.god(true); });
  await until(p, () => SK_GAME.stage === '3-5' && SK_GAME.phase === 'play', null, 8000);
  r = await p.evaluate(() => {
    const G = SK.G, V = SK.voidMode, v = G.void, pl = G.player, o = {};
    o.has = !!v.collector && v.collector.stock.length === 3;
    v.eyes = 0; o.poor = V.collectorBuy(G, 0);
    v.eyes = 3; const it = v.collector.stock[0], n0 = G.items.length;
    o.buy = { ok: V.collectorBuy(G, 0), eyes: v.eyes, sold: it.sold, kind: it.kind, gain: G.items.length - n0 };
    o.again = V.collectorBuy(G, 0);
    const old = v.collector.stock; o.refresh = [V.collectorRefresh(G), v.eyes, v.collector.stock !== old];
    return o;
  });
  check('Nhà Sưu Tầm ở 3-5: 3 món, thiếu Mắt bị từ chối; mua trừ đúng 1 Mắt và nhận món; làm mới 1 Mắt',
    r.has && r.poor === false && r.buy.ok && r.buy.eyes === 2 && r.buy.sold && r.again === false && r.refresh[0] && r.refresh[1] === 1 && r.refresh[2], JSON.stringify(r));

  // ---- 6. qua hết ải ra màn kết thúc
  await p.evaluate(() => { SK.bossDebug.force = null; SK_GAME.debug.stage('1-1'); SK_GAME.debug.god(true); T.clear(); SK.G.void.xu = 0; SK.G.void.xuTotal = 123; SK.G.void.kills = 7; });
  const labels = await p.evaluate(() => SK.STAGES.map(s => s.label));
  let reached = [];
  for (const lab of labels) {
    if (!await until(p, l => SK_GAME.stage === l && SK_GAME.phase === 'play', lab, 8000)) break;
    reached.push(lab);
    await p.evaluate(() => { const G = SK.G; G.player.x = G.portal.x; G.player.y = G.portal.y; });
    for (let i = 0; i < 60; i++) {
      if (await p.evaluate(() => SK.G.hold && SK_ROOMS.pick(0))) await sleep(50);
      if (await p.evaluate(l => SK_GAME.stage !== l || SK_GAME.state !== 'stage', lab)) break;
      await sleep(100);
    }
  }
  await until(p, () => SK_GAME.state === 'victory', null, 5000);
  const fin = await p.evaluate(() => ({ st: SK_GAME.state, text: document.getElementById('sk-win-info').textContent, tot: SK.G.void.xuTotal, kills: SK.G.void.kills, hidden: document.getElementById('sk-win').hidden }));
  check('qua đủ 15 ải 1-1..3-5 theo thứ tự rồi ra màn chiến thắng', reached.length === 15 && fin.st === 'victory' && !fin.hidden, reached.join(',') + ' ' + JSON.stringify(fin));
  check('màn kết thúc ghi số Xu Ám Tinh nhận được và số kẻ địch Hư Không đã hạ đúng',
    fin.text.indexOf('Xu Ám Tinh nhận được ' + fin.tot) > 0 && fin.text.indexOf('Hạ ' + fin.kills + ' kẻ địch Hư Không') > 0, fin.text);


  // =====================================================================================================
  // Độ 2 "Hư Không Hỗn Độn" (G.void.tier 2): khiên 120/tầng, Rãnh Nứt -2, Huyết Vệ / Tế Tư / Cấm Vệ, thiên phú 3001-3003.
  // =====================================================================================================
  const lob = async (prof) => {
    await p.evaluate(pr => { localStorage.setItem('sk.profile.v1', JSON.stringify(pr)); }, prof);
    await p.reload();
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
    await p.evaluate(() => SK.lobby.openModes());
    return p.evaluate(() => {
      const o = {};
      for (const b of document.querySelectorAll('#hs-mode-diff button')) o[b.dataset.d] = { dis: b.disabled, sel: b.classList.contains('sel'), t: b.textContent };
      return o;
    });
  };
  let lb = await lob({ won: { knight: 1 }, gems: 0 });
  check('nút độ khó: có đủ 3 nút Hư Không (Lần Đầu / Hỗn Độn / Hủy Diệt), chưa vượt độ nào thì chỉ độ 1 mở, setDiff khoá bị từ chối',
    lb.void && lb.void2 && lb.void3 && !lb.void.dis && lb.void2.dis && lb.void3.dis && /Hỗn Độn/.test(lb.void2.t) && /Hủy Diệt/.test(lb.void3.t) &&
    await p.evaluate(() => !SK.profile.setDiff('void2') && !SK.profile.setDiff('void3') && SK.profile.voidTier === 1), JSON.stringify(lb));
  lb = await lob({ won: { knight: 1 }, voidWon: { 1: 1 }, gems: 0 });
  check('vượt độ 1 thì mở Hỗn Độn, Hủy Diệt vẫn khoá; chọn Hỗn Độn rồi vào ván là G.void.tier 2',
    !lb.void2.dis && lb.void3.dis && await p.evaluate(async () => {
      document.querySelector('#hs-mode-diff button[data-d="void2"]').click();
      const sel = document.querySelector('#hs-mode-diff button.sel').dataset.d, vt = SK.profile.voidTier;
      document.getElementById('hs-modes').hidden = true; SK.lobby.launch('knight', SK.profile.voidDiff ? 'void' : undefined, []);
      return sel === 'void2' && vt === 2 && SK.G.mode === 'void' && SK.G.void.tier === 2 && !SK.G.badass;
    }), JSON.stringify(lb));
  r = await p.evaluate(() => {
    SK.emit('runEnd', SK.G, { won: true, stage: '3-5', kills: 1, gold: 0 });
    return SK.profile.voidWon();
  });
  lb = await lob({ won: { knight: 1 }, voidWon: r, gems: 0 });
  check('thắng một ván độ 2 thì ghi hồ sơ voidWon[2] và mở Hủy Diệt; chọn được, vào ván là tier 3',
    r['2'] === 1 && !lb.void3.dis && await p.evaluate(() => { document.querySelector('#hs-mode-diff button[data-d="void3"]').click(); return SK.profile.voidTier === 3 && SK.profile.setDiff('void'); }), JSON.stringify([r, lb]));

  const startTier = async (t) => {
    await p.evaluate(tt => { SK_GAME.debug.seed(7); SK.voidMode.start('knight', tt); }, t);
    await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
    await p.evaluate(() => {
      SK_GAME.debug.god(true); SK_GAME.debug.pet(false);
      const G = SK.G;
      window.T = {
        log: [], loss: [],
        mk(kind, off, quiet) {
          const V = SK.voidMode, pl = G.player, room = G.map.rooms[0];
          const [x, y] = SK.freeNear([pl.x + (off == null ? 60 : off), pl.y]);
          const e = SK.makeEnemy(G, V.KINDS[kind].id, x, y, room);
          e.st = 'idle'; e.stT = 0; e.age = -1e6;
          if (quiet !== false) e.cd = 1e9;
          G.enemies.push(e);
          return e;
        },
        hit(e, dmg) { return SK.hurtEnemy(G, e, dmg == null ? 50 : dmg, false, 0, 0); },
        clear() { G.enemies = []; G.void.keep = {}; G.void.defeated = []; G.void.xu = 0; G.void.eyes = 0; G.void.kills = 0; G.void.fled = 0; G.void.rifts = []; G.void.slowOn = false; G.void.slowT = 0; G.player.moveMul = 1; T.log = []; T.loss = []; },
        fresh() { const pl = G.player; pl.armor = 0; pl.armorMax = 0; pl.hpMax = pl.hp = 60; pl.invulT = 0; },
        W(fn, ms) { return new Promise(res => { const t0 = performance.now(); const iv = setInterval(() => { if (fn() || performance.now() - t0 > ms) { clearInterval(iv); res(!!fn()); } }, 25); }); },
        sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
      };
      if (window.__hw) return;
      window.__hw = 1;
      const h = SK.hurtPlayer;   // nhật ký sát thương thô (trước +1 của độ 2) của mọi lời gọi
      SK.hurtPlayer = function (g, d, ...rest) { const q = g.player, b = q.hp + q.armor, r0 = h.call(this, g, d, ...rest); T.log.push(d); T.loss.push(b - (q.hp + q.armor)); return r0; };   // god hồi máu theo khung nên đo mất máu ngay tại lời gọi
    });
  };
  await startTier(2);
  r = await p.evaluate(() => {
    const V = SK.voidMode, o = {};
    o.tier = SK.G.void.tier; o.n = SK.STAGES.length; o.roster = SK.G.void.roster.slice();
    o.e1 = V.eligible(1).join(','); o.e2 = V.eligible(2).join(','); o.e3 = V.eligible(3).join(','); o.e3f = V.eligible(3, true).join(',');
    const seen2 = {}, seen1 = {}; let bad2 = 0, bad1 = 0;
    for (let i = 0; i < 60; i++) {
      V.pendTier = 2; const r2 = V.init().roster;
      if (new Set(r2).size !== 3 || r2.some(k => V.eligible(2).indexOf(k) < 0)) bad2++;
      for (const k of r2) seen2[k] = 1;
      V.pendTier = 1; const r1 = V.init().roster;
      if (r1.join(',') !== 'guard,assassin,mage') bad1++;
    }
    o.seen2 = Object.keys(seen2).sort().join(','); o.bad2 = bad2; o.bad1 = bad1;
    return o;
  });
  check('độ 2: G.void.tier 2, 15 ải, bể Tinh Anh = 3 loại độ 1 + Huyết Vệ / Tế Tư / Cấm Vệ (độ 1 chỉ 3 loại cũ, độ 3 mới thêm Thiền Vệ / Triệu Hồi Sư / Hộ Pháp)',
    r.tier === 2 && r.n === 15 && r.e1 === 'guard,assassin,mage' && r.e2 === 'guard,assassin,mage,blood,priest,sentinel' &&
    r.e3 === 'guard,assassin,mage,blood,priest,sentinel,zentinel,summoner,warden' && /killer/.test(r.e3f) && r.roster.length === 3, JSON.stringify(r));
  check('60 lần bốc đầu ván: độ 2 luôn 3 loại không trùng thuộc bể độ 2 (đủ cả 3 loại mới từng xuất hiện, không loại độ 3), độ 1 luôn Thủ Vệ/Ảnh Vệ/Linh Vệ',
    r.bad2 === 0 && r.bad1 === 0 && ['blood', 'priest', 'sentinel'].every(k => r.seen2.indexOf(k) >= 0) && !/zentinel|summoner|warden|killer/.test(r.seen2), JSON.stringify(r));

  // khiên 120 mỗi tầng, máu quái theo độ 2
  r = await p.evaluate(() => {
    T.clear(); const o = {};
    for (const [k, hp] of [['guard', 350], ['assassin', 300], ['mage', 300], ['blood', 350], ['priest', 300], ['sentinel', 350]]) {
      const e = T.mk(k); o[k] = { hp: e.hp, want: hp, st: e.vs.stacks, sh: e.vs.hp, mx: e.vs.hpMax };
    }
    const g = T.mk('guard'); T.hit(g, 50); T.hit(g, 50); o.hit = { sh: g.vs.hp, hp: g.hp };
    return o;
  });
  check('độ 2: 6 loại Tinh Anh đúng máu (Thủ Vệ 350, Ảnh Vệ 300, Linh Vệ 300, Huyết Vệ 350, Tế Tư 300, Cấm Vệ 350), mỗi loại 3 tầng khiên × 120',
    Object.keys(r).filter(k => k !== 'hit').every(k => r[k].hp === r[k].want && r[k].st === 3 && r[k].sh === 120 && r[k].mx === 120) && r.hit.sh === 118 && r.hit.hp === 350, JSON.stringify(r));

  // Rãnh Nứt -2, +1 sát thương mọi nguồn
  r = await p.evaluate(async () => {
    T.clear(); T.fresh(); const o = {}, pl = SK.G.player, V = SK.voidMode;
    const rift = V.spawnRift(SK.G, pl.x + 200, pl.y, 8);
    rift.age = 0.6; rift.x = pl.x; rift.y = pl.y;
    await T.W(() => rift.hits > 0, 1500);
    o.rift = { loss: T.loss[0], hits: rift.hits, raw: T.log.slice(), dmg: V.riftDmg(SK.G) };
    T.fresh(); T.log = []; T.loss = [];
    SK.hurtPlayer(SK.G, 3); o.hit3 = { loss: T.loss[0], raw: T.log.slice() };
    return o;
  });
  check('độ 2: Rãnh Nứt mất đúng 2 máu (gọi sát thương thô 2, không cộng +1), mọi nguồn khác +1 (đòn 3 mất 4)',
    r.rift.loss === 2 && r.rift.hits === 1 && r.rift.dmg === 2 && r.hit3.loss === 4 && r.hit3.raw.join() === '3', JSON.stringify(r));

  // trùm Hư Không theo độ
  r = await p.evaluate(() => {
    const G = SK.G, o = {}, room = G.map.rooms[0];
    for (const lab of ['1-5', '2-5', '3-5']) {
      SK_GAME.debug.stage(lab);
      o[lab] = SK.makeEnemy(G, 'boss_void', 100, 100, room).hpMax;
      G.mods = G.mods || {}; G.mods.doubleBoss = true;
      o[lab + 'x'] = SK.makeEnemy(G, 'boss_void', 100, 100, room).hpMax; G.mods.doubleBoss = false;
    }
    return o;
  });
  check('độ 2: trùm Hư Không 800 / 1600 / 2400 ở 1-5 / 2-5 / 3-5 (3-5 theo wiki 2400); Hai Lãnh Chúa ×0,75 = 600 / 1200 / 1800',
    r['1-5'] === 800 && r['2-5'] === 1600 && r['3-5'] === 2400 && r['1-5x'] === 600 && r['2-5x'] === 1200 && r['3-5x'] === 1800, JSON.stringify(r));
  await p.evaluate(() => { SK_GAME.debug.stage('1-1'); SK_GAME.debug.god(true); });
  await until(p, () => SK_GAME.stage === '1-1' && SK_GAME.phase === 'play', null, 8000);

  // ---- Huyết Vệ
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, o = {};
    T.clear(); T.fresh();
    let e = T.mk('blood', 60, false); e.cd = 0.1;
    await T.W(() => e.act === 'wind', 2500);
    await T.sleep(60);
    o.wind = { act: e.act, open: e.vs.open, still: !!e.still };
    const x0 = G.void.xu; T.hit(e, 50);
    o.brk = { stacks: e.vs.stacks, xu: G.void.xu - x0, st: e.st, leave: !!e.leave };
    T.clear(); T.fresh();
    e = T.mk('blood', 40, false); e.cd = 0.1;
    await T.W(() => e.fx.some(f => f.kind === 'pool' && f.rd >= 30), 5000);
    const f = e.fx.find(q => q.kind === 'pool');
    o.pool1 = f ? { rd: f.rd, rt: f.rt } : null;
    pl.x = e.x + 6; pl.y = e.y;   // đứng trong huyết trì
    T.log = []; T.loss = []; T.fresh();
    await T.W(() => T.log.indexOf(3) >= 0, 2500);
    o.tick = { loss: T.loss[T.log.indexOf(3)], raw: T.log.filter(d => d === 3).length };
    await T.W(() => e.nAtk >= 2 && f.rd >= 44, 9000);
    o.pool2 = { rd: f.rd, rt: f.rt, n: e.nAtk, moved: Math.hypot(e.x - f.x, e.y - f.y) };
    return o;
  });
  check('Huyết Vệ: khiên tắt lúc đánh (đứng yên khi đã đánh): trúng lúc đó vỡ 1 tầng +30 Xu và rút lui',
    r.wind.act === 'wind' && r.wind.open && r.wind.still && r.brk.stacks === 2 && r.brk.xu === 30 && r.brk.st === 'dead' && r.brk.leave, JSON.stringify(r));
  check('Huyết Vệ: huyết trì đòn 1 bán kính 30, trong vòng mất 3/giây (sát thương thô 3, thực mất 4 vì độ 2 +1); đòn 2 to thành 44; Huyết Vệ không rời chỗ',
    r.pool1 && r.pool1.rd === 30 && r.tick.loss === 4 && r.tick.raw >= 1 && r.pool2.rd === 44 && r.pool2.n === 2 && r.pool2.moved < 1, JSON.stringify(r));

  // ---- Tế Tư
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, o = {};
    T.clear(); T.fresh();
    let e = T.mk('priest', 80, true);
    const t1 = T.mk('thief', 30, true), t2 = T.mk('thief', 110, true);
    SK.voidMode.priestLink(G, e, [t1, t2]);
    await T.sleep(120);
    o.chan = { act: e.act, open: e.vs.open, link: e.fx.some(f => f.kind === 'link') };
    t1.st = t2.st = 'dead'; t1.hp = t2.hp = 0;
    await T.W(() => e.st === 'dead', 1500);
    o.cut = { stacks: e.vs.stacks, xu: G.void.xu, st: e.st, leave: !!e.leave };
    T.clear(); T.fresh();
    e = T.mk('priest', 90, true);
    const t3 = T.mk('thief', 20, true);
    SK.voidMode.priestLink(G, e, [t3]);
    await T.W(() => e.fx.some(f => f.kind === 'ball'), 5000);
    o.ball = e.fx.some(f => f.kind === 'ball');
    pl.x = e.x - 70; pl.y = e.y; T.log = []; T.loss = [];
    await T.W(() => T.log.indexOf(9) >= 0, 7000);
    o.hit9 = T.log.indexOf(9) >= 0;
    T.clear(); T.fresh();
    e = T.mk('priest', 90, true);
    const b = SK.voidMode.ballFx(e); b.spd = 0; e.fx.push(b);
    await T.W(() => e.vs.stacks < 3, 2500);
    o.self = { stacks: e.vs.stacks, xu: G.void.xu, leave: !!e.leave };
    return o;
  });
  check('Tế Tư: niệm phép nối quái khiên tắt ngắn; quái bị nối chết hết khi đang niệm thì mất 1 tầng (+30 Xu) và bỏ đi',
    r.chan.act === 'chan' && r.chan.open && r.chan.link && r.cut.stacks === 2 && r.cut.xu === 30 && r.cut.st === 'dead' && r.cut.leave, JSON.stringify(r));
  check('Tế Tư: niệm đủ 3 giây thì thả cầu đen, cầu đuổi người chơi gây 9 sát thương; cầu chạm khiên chính nó thì vỡ 1 tầng (+30 Xu)',
    r.ball && r.hit9 && r.self.stacks === 2 && r.self.xu === 30 && r.self.leave, JSON.stringify(r));

  // ---- Cấm Vệ
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, o = {};
    T.clear(); T.fresh();
    let e = T.mk('sentinel', 16, true); pl.x = e.x - 16; pl.y = e.y;
    V.sentinelCombo(G, e, ['pommel', 'slash']);
    await T.sleep(100);
    o.red = e.vs.red;
    T.hit(e, 50); o.nearHit = e.vs.hp;                    // cận chiến lúc khiên đỏ: ×10
    const px = pl.x; pl.x -= 100; T.hit(e, 50); o.farHit = e.vs.hp; pl.x = px;   // từ xa: 1
    await T.W(() => e.act === 'rest', 4000);
    o.log = T.log.slice();
    await T.sleep(200);
    T.hit(e, 50); o.nearRed2 = e.vs.hp;                   // khiên còn đỏ thêm 1 giây sau đòn
    await T.W(() => !e.vs.red, 3000);
    const h0 = e.vs.hp; T.hit(e, 50); o.after = { red: e.vs.red, drop: h0 - e.vs.hp };
    T.clear(); T.fresh();
    e = T.mk('sentinel', 30, true); pl.x = e.x - 30; pl.y = e.y; T.log = []; T.loss = []; T.loss = [];
    V.sentinelCombo(G, e, ['lunge']);
    await T.W(() => e.act === 'rest', 3000);
    o.lunge = T.log.slice();
    return o;
  });
  check('Cấm Vệ: đòn pommel+slash gây 5 / 5 / 5 / 7 (chuôi, chém lên, chém xuống, sóng xung kích); lao kiếm gây 5',
    r.log.join() === '5,5,5,7' && r.lunge.join() === '5', JSON.stringify(r));
  check('Cấm Vệ: khiên đỏ khi đánh, cận chiến lúc đỏ trừ 10 khiên-HP (120 -> 110), từ xa 1, hết đỏ thì cận chiến chỉ còn 1',
    r.red && r.nearHit === 110 && r.farHit === 109 && r.after.red === false && r.after.drop === 1, JSON.stringify(r));

  // ---- thiên phú 3001-3003
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, R = SK_ROOMS, o = {};
    pl.buffs = (pl.buffs || []).filter(x => x < 3000);
    T.clear(); T.fresh();
    const bare = fn => { const w = pl.weapons[pl.cur]; pl.weapons[pl.cur] = null; try { return fn(); } finally { pl.weapons[pl.cur] = w; } };
    let e = T.mk('guard', 200); bare(() => T.hit(e, 50)); o.bare0 = e.vs.hp;
    o.take = [R.takeBuff(3001), R.takeBuff(3002), R.takeBuff(3003)];
    e = T.mk('guard', 200); bare(() => T.hit(e, 50)); o.bare1 = e.vs.hp;       // tay không + 3001: 2
    e = T.mk('guard', 200); T.hit(e, 50); o.armed1 = e.vs.hp;                   // có vũ khí: vẫn 1
    e = T.mk('sentinel', 16, true); pl.x = e.x - 16; pl.y = e.y; V.sentinelCombo(G, e, ['pommel']); await T.sleep(100);
    bare(() => T.hit(e, 50)); o.red3001 = e.vs.hp;                               // tay không + 3001 + khiên đỏ: 20
    // 3002: miễn Rãnh Nứt
    T.clear(); T.fresh();
    const rift = V.spawnRift(G, pl.x, pl.y, 6); rift.age = 0.6;
    await T.sleep(400);
    o.rift = { loss: T.log.length, hits: rift.hits };
    // 3003: hạ hết quái nhỏ mà Tinh Anh không bỏ chạy
    T.clear(); T.fresh();
    e = T.mk('guard', 200); e.age = 5; await T.sleep(300);
    o.stay = { st: e.st, stacks: e.vs.stacks, xu: G.void.xu, leave: !!e.leave };
    pl.buffs = pl.buffs.filter(x => x !== 3003);
    T.clear(); e = T.mk('guard', 200); e.age = 5; await T.sleep(300);
    o.flee = { st: e.st, leave: !!e.leave, xu: G.void.xu };
    // Thương Nhân Hư Không độ 2 bốc thêm một thiên phú riêng chưa có
    pl.buffs = pl.buffs.filter(x => x < 3000);
    const ids = V.offerIds(G);
    o.offer = { n: ids.length, ex: ids.filter(i => i >= 3001 && i <= 3003).length, uniq: new Set(ids).size === ids.length };
    return o;
  });
  check('Tay Hư Không 3001: tay không lên khiên 1 -> 2 (118), có vũ khí vẫn 1; tay không lên khiên đỏ 20 (120 -> 100)',
    r.take[0] && r.bare0 === 119 && r.bare1 === 118 && r.armed1 === 119 && r.red3001 === 100, JSON.stringify(r));
  check('Thể Chất Hư Không 3002: bước vào Rãnh Nứt không mất máu (chạm rãnh 0 lần mất máu)', r.take[1] && r.rift.loss === 0, JSON.stringify(r.rift));
  check('Lệnh Truy Sát 3003: hạ hết quái nhỏ mà Tinh Anh không bỏ chạy; không có 3003 thì bỏ chạy (+5 Xu)',
    r.take[2] && r.stay.st !== 'dead' && r.stay.stacks === 3 && r.stay.xu === 0 && r.flee.st === 'dead' && r.flee.leave && r.flee.xu === 5, JSON.stringify([r.stay, r.flee]));
  check('Thương Nhân Hư Không độ 2: bộ 3 thẻ có đúng 1 thiên phú riêng (3001-3003) chưa sở hữu, không trùng', r.offer.n === 3 && r.offer.ex === 1 && r.offer.uniq, JSON.stringify(r.offer));


  // ---- bốc quái vào phòng theo độ: mọi loại hợp lệ xuất hiện đúng độ (độ 2 không có loại độ 3, độ 3 không có Đao Phủ ngoài ải 4-x)
  r = await p.evaluate(() => {
    const G = SK.G, V = SK.voidMode, o = {};
    const battle = () => G.map.rooms.find(x => x.type === 'battle');
    const ids = Object.values(V.KINDS).map(k => k.id);
    SK_GAME.debug.stage('1-2');
    const scan = (roster, n) => {
      G.void.roster = roster.slice(); G.void.defeated = []; G.void.thiefSeen = true;
      const found = {};
      for (let i = 0; i < n; i++) for (const w of G.buildWaves(battle())) for (const id of w) if (ids.indexOf(id) >= 0 && id !== 'boss_void') found[id] = (found[id] || 0) + 1;
      return Object.keys(found).sort().join(',');
    };
    o.t2 = scan(V.eligible(2), 400);
    return o;
  });
  check('độ 2: phòng quái chỉ bốc Thủ Vệ / Ảnh Vệ / Linh Vệ / Huyết Vệ / Tế Tư / Cấm Vệ (đủ 6 loại, không loại độ 3)',
    r.t2 === 'e_void_assassin,e_void_blood,e_void_guard,e_void_imperial,e_void_mage,e_void_priest', JSON.stringify(r));

  // =====================================================================================================
  // Độ 3 "Hư Không Hủy Diệt" (G.void.tier 3): khiên 160/tầng, Khiên Hư Không 12 tầng của người chơi, Thiền Vệ / Triệu Hồi Sư / Hộ Pháp / Đao Phủ,
  // thiên phú 3004-3007.
  // =====================================================================================================
  await startTier(3);
  r = await p.evaluate(() => {
    const G = SK.G, V = SK.voidMode, pl = G.player, o = {};
    o.tier = G.void.tier; o.buffs = pl.buffs.filter(x => x > 3000); o.vsh = pl.vsh && [pl.vsh.stacks, pl.vsh.max];
    o.slots = SK_ROOMS.buffSlots();
    const seen = {}; let bad = 0;
    for (let i = 0; i < 80; i++) { V.pendTier = 3; const r3 = V.init().roster; if (new Set(r3).size !== 3 || r3.some(k => V.eligible(3).indexOf(k) < 0)) bad++; for (const k of r3) seen[k] = 1; }
    o.seen = Object.keys(seen).sort().join(','); o.bad = bad;
    const battle = G.map.rooms.find(x => x.type === 'battle');
    const ids = Object.values(V.KINDS).map(k => k.id);
    SK_GAME.debug.stage('1-2');
    G.void.roster = V.eligible(3).slice(); G.void.defeated = []; G.void.thiefSeen = true;
    const found = {}, pair = { n: 0, both: 0 };
    for (let i = 0; i < 500; i++) for (const w of G.buildWaves(G.map.rooms.find(x => x.type === 'battle'))) {
      for (const id of w) if (ids.indexOf(id) >= 0 && id !== 'boss_void') found[id] = (found[id] || 0) + 1;
      if (w.indexOf('e_void_staffmonk') >= 0 || w.indexOf('e_void_beadsmonk') >= 0) { pair.n++; if (w.indexOf('e_void_staffmonk') >= 0 && w.indexOf('e_void_beadsmonk') >= 0) pair.both++; }
    }
    o.found = Object.keys(found).sort().join(','); o.pair = pair;
    return o;
  });
  check('độ 3: G.void.tier 3, người chơi vào ván có Khiên Hư Không 12/12 (3004) và Lệnh Truy Sát (3003), hai thiên phú đó không chiếm ô',
    r.tier === 3 && r.buffs.indexOf(3004) >= 0 && r.buffs.indexOf(3003) >= 0 && r.vsh[0] === 12 && r.vsh[1] === 12 && r.slots === 9, JSON.stringify(r));
  check('độ 3: 80 lần bốc đầu ván luôn 3 loại không trùng thuộc bể độ 3 (đủ Thiền Vệ / Triệu Hồi Sư / Hộ Pháp từng xuất hiện, không bao giờ Đao Phủ); phòng quái bốc đủ 9 loại độ 3 (hai Thiền Vệ luôn đi cặp)',
    r.bad === 0 && /zentinel/.test(r.seen) && /summoner/.test(r.seen) && /warden/.test(r.seen) && !/killer/.test(r.seen) &&
    r.found === 'e_void_assassin,e_void_beadsmonk,e_void_blood,e_void_guard,e_void_imperial,e_void_mage,e_void_priest,e_void_staffmonk,e_void_summoner,e_void_sentinel'.split(',').sort().join(',') && r.pair.n > 0 && r.pair.both === r.pair.n, JSON.stringify(r));

  r = await p.evaluate(() => {
    T.clear(); const o = {};
    for (const [k, hp] of [['guard', 350], ['assassin', 300], ['mage', 300], ['blood', 350], ['priest', 300], ['sentinel', 350], ['staff', 300], ['bead', 300], ['summoner', 300], ['warden', 300], ['killer', 300]]) {
      const e = T.mk(k); o[k] = { hp: e.hp, want: hp, st: e.vs.stacks, sh: e.vs.hp, mx: e.vs.hpMax };
    }
    const g = T.mk('guard'); T.hit(g, 50); T.hit(g, 50); o.hit = { sh: g.vs.hp, hp: g.hp };
    const G = SK.G, room = G.map.rooms[0];
    for (const lab of ['1-5', '2-5', '3-5']) {
      SK_GAME.debug.stage(lab);
      o[lab] = SK.makeEnemy(G, 'boss_void', 100, 100, room).hpMax;
      G.mods.doubleBoss = true; o[lab + 'x'] = SK.makeEnemy(G, 'boss_void', 100, 100, room).hpMax; G.mods.doubleBoss = false;
    }
    return o;
  });
  check('độ 3: 11 loại Tinh Anh đúng máu, mỗi loại 3 tầng khiên × 160 (đòn 50 chỉ trừ 1: 160 -> 158)',
    Object.keys(r).filter(k => /^[a-z]+$/.test(k) && k !== 'hit').every(k => r[k].hp === r[k].want && r[k].st === 3 && r[k].sh === 160 && r[k].mx === 160) && r.hit.sh === 158 && r.hit.hp === 350, JSON.stringify(r));
  check('độ 3: trùm Hư Không 1000 / 2000 / 3000 (3-5 theo wiki 3000); Hai Lãnh Chúa ×0,75 = 750 / 1500 / 2250',
    r['1-5'] === 1000 && r['2-5'] === 2000 && r['3-5'] === 3000 && r['1-5x'] === 750 && r['2-5x'] === 1500 && r['3-5x'] === 2250, JSON.stringify(r));
  await p.evaluate(() => { SK_GAME.debug.stage('1-1'); SK_GAME.debug.god(true); });
  await until(p, () => SK_GAME.stage === '1-1' && SK_GAME.phase === 'play', null, 8000);

  // ---- Khiên Hư Không của người chơi (3004), 3005, 3006
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, R = SK_ROOMS, o = {};
    T.clear(); T.fresh();
    pl.vsh.stacks = 12; pl.vsh.cd = null;
    const hp0 = pl.hp, a = SK.hurtPlayer(G, 7);
    o.hit = { ok: a, stacks: pl.vsh.stacks, hp: pl.hp, inv: pl.invulT };
    const b = SK.hurtPlayer(G, 7);
    o.hit2 = { stacks: pl.vsh.stacks };                    // đang bất tử: không trừ thêm
    pl.invulT = 0; pl.vsh.stacks = 12;
    // hồi tầng
    pl.vsh.stacks = 5; SK.emit('pickup', G, 'hp_pot'); o.pot = pl.vsh.stacks;
    SK.emit('pickup', G, 'hp_pot_big'); o.big = pl.vsh.stacks;
    let e = T.mk('guard', 200); e.vs.hp = 1; pl.vsh.stacks = 4; T.hit(e, 50); o.breakGain = pl.vsh.stacks;    // phá khiên Tinh Anh +3
    pl.vsh.stacks = 10; e = T.mk('guard', 200); e.vs.hp = 1; T.hit(e, 50); o.cap = pl.vsh.stacks;          // trần 12
    pl.vsh.stacks = 5; SK_GAME.debug.stage('1-2'); o.stage = pl.vsh.stacks;                                  // vào ải kế +1
    return o;
  });
  await until(p, () => SK_GAME.stage === '1-2' && SK_GAME.phase === 'play', null, 8000);
  check('Khiên Hư Không 3004: đòn 7 sát thương chỉ trừ 1 tầng (12 -> 11), không mất máu; trong khung bất tử không trừ thêm',
    r.hit.ok === true && r.hit.stacks === 11 && r.hit.hp === 60 && r.hit.inv > 0.7 && r.hit.inv < 0.9 && r.hit2.stacks === 11, JSON.stringify(r));
  check('Khiên Hư Không 3004 hồi tầng: Bình HP +1, bình lớn +2, phá khiên Tinh Anh +3 (4 -> 7), trần 12, vào ải kế +1 (5 -> 6)',
    r.pot === 6 && r.big === 8 && r.breakGain === 7 && r.cap === 12 && r.stage === 6, JSON.stringify(r));
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, R = SK_ROOMS, o = {};
    T.clear(); T.fresh();
    // 3005: bất tử sau khi trúng đòn dài thêm 1 giây
    pl.vsh.stacks = 6; pl.invulT = 0; SK.hurtPlayer(G, 3); o.inv0 = pl.invulT;
    o.take5 = R.takeBuff(3005); pl.invulT = 0; SK.hurtPlayer(G, 3); o.inv5 = pl.invulT;
    // 3006: hồi 3 tầng ngay, mỗi lần tương tác Nhân Vật hỗ trợ +1 (một lần mỗi NPC mỗi ải)
    pl.vsh.stacks = 5; o.take6 = R.takeBuff(3006); o.now = pl.vsh.stacks;
    V.placeMerchant(G, pl.x + 4, pl.y); const it = G.interactables[G.interactables.length - 1];
    G.void.xu = 0; it.use(); o.sup1 = pl.vsh.stacks; it.use(); o.sup2 = pl.vsh.stacks;
    // hết khiên: đếm ngược Hủy Diệt, hồi lại thì dừng
    pl.invulT = 0; pl.vsh.stacks = 1; pl.vsh.cd = null; SK.hurtPlayer(G, 2);
    o.zero = { stacks: pl.vsh.stacks, cd: pl.vsh.cd };
    pl.invulT = 0; const hp1 = pl.hp; SK.hurtPlayer(G, 2); o.noShield = pl.hp < hp1;   // hết khiên thì mất máu thật
    V.vshGain(G, 1); o.stop = pl.vsh.cd;
    return o;
  });
  check('Hư Không Che Chở 3005: bất tử sau khi trúng đòn 0,8 giây -> 1,8 giây (dài thêm 1 giây)', r.inv0 > 0.7 && r.inv0 < 0.9 && r.take5 && r.inv5 > 1.7 && r.inv5 < 1.9, JSON.stringify(r));
  check('Hư Không Cộng Tế 3006: nhận thì hồi ngay 3 tầng (5 -> 8); tương tác NPC hỗ trợ +1 một lần mỗi NPC mỗi ải (8 -> 9 -> 9)', r.take6 && r.now === 8 && r.sup1 === 9 && r.sup2 === 9, JSON.stringify(r));
  check('hết Khiên Hư Không: stacks 0, bắt đầu đếm ngược Hủy Diệt 10 giây, hết khiên thì mất máu thật, hồi tầng lại thì đếm ngược dừng',
    r.zero.stacks === 0 && r.zero.cd === 10 && r.noShield && r.stop === null, JSON.stringify(r));

  // Rãnh Nứt độ 3 và Tàn Tượng 3007
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, R = SK_ROOMS, o = {};
    T.clear(); T.fresh(); pl.vsh.stacks = 8; pl.vsh.cd = null; pl.invulT = 0;
    const rift = V.spawnRift(G, pl.x, pl.y, 6); rift.age = 0.6;
    await T.W(() => rift.hits > 0, 1500);
    o.rift = { raw: T.log.slice(), stacks: pl.vsh.stacks, hp: pl.hp };
    // 3007
    T.clear(); T.fresh(); pl.vsh.stacks = 8; pl.invulT = 0;
    const th = T.mk('thief', 40, true); th.life = 1e6;
    o.take = R.takeBuff(3007);
    SK.emit('skill', G, pl);
    o.cast = { hidden: !!pl.hidden, inv: pl.invulT, img: !!G.void.afterimage, cd: pl.vsh.imgCd };
    await T.W(() => G.void.afterimage && G.void.afterimage.hits >= 2, 3000);
    const im = G.void.afterimage;
    o.hits = { n: im.hits, dmg: im.dmg, hp: th.hp, want: 100 - im.hits * im.dmg };
    SK.emit('skill', G, pl); o.second = G.void.afterimage === im;            // còn hồi chiêu: không tạo thêm
    await T.sleep(1800); o.back = { hidden: !!pl.hidden };
    pl.vsh.stacks = 0; pl.vsh.imgCd = 0; const im0 = G.void.afterimage; SK.emit('skill', G, pl); o.noShield = G.void.afterimage === im0;   // hết khiên: không có Tàn Tượng
    pl.vsh.stacks = 8;
    return o;
  });
  check('độ 3: Rãnh Nứt gọi sát thương 2 nhưng có Khiên Hư Không thì chỉ trừ 1 tầng (8 -> 7), không mất máu', r.rift.raw.join() === '2' && r.rift.stacks === 7 && r.rift.hp === 60, JSON.stringify(r.rift));
  check('Tàn Tượng Hư Không 3007: dùng kỹ năng thì tàng hình + bất tử ≥ 1,5 giây, Tàn Tượng đánh quái bằng vũ khí (≥ 2 phát, máu quái giảm đúng tổng); chưa hết hồi chiêu / hết khiên thì không tạo thêm, tàng hình hết sau 1,5 giây',
    r.take && r.cast.hidden && r.cast.inv >= 1.4 && r.cast.img && r.cast.cd === 15 && r.hits.n >= 2 && r.hits.hp === r.hits.want && r.second && !r.back.hidden && r.noShield, JSON.stringify(r));

  // ---- Thiền Vệ Trượng + Châu
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, o = {};
    T.clear(); T.fresh(); pl.vsh.stacks = 12;
    pl.x -= 250;
    const bead = T.mk('bead', 300, false); bead.cd = 0.05;
    const staff = T.mk('staff', 300 + 40 * Math.cos(Math.PI / 8), true); staff.y = bead.y + 40 * Math.sin(Math.PI / 8);
    await T.W(() => bead.fx.filter(f => f.kind === 'bead').length === 8, 3000);
    o.beads = bead.fx.filter(f => f.kind === 'bead').length;
    await T.W(() => staff.vs.open, 2500);
    o.open = { open: staff.vs.open, t: +staff.vs.openT.toFixed(1) };
    T.hit(staff, 50); o.brk = { stacks: staff.vs.stacks, st: staff.st };
    // thường: không tự mở
    T.clear(); T.fresh();
    const s2 = T.mk('staff', 300, true), b2 = T.mk('bead', 330, true);
    o.shut = [s2.vs.open, b2.vs.open]; T.hit(s2, 50); T.hit(b2, 50); o.shutHp = [s2.vs.hp, b2.vs.hp, s2.hp, b2.hp];
    // Trượng nhảy đập xuống chỗ Châu thì khiên Châu tắt, rồi trúng Châu thì vỡ
    s2.cd = 0.05; s2.n = 1; pl.x = b2.x + 6; pl.y = b2.y;          // lượt đánh kế của Trượng là nhảy đập xuống chỗ người chơi (cạnh Châu)
    await T.W(() => s2.vs.red, 2500);
    o.red = !!s2.vs.red;
    await T.W(() => b2.vs.open, 2500);
    o.quake = { open: b2.vs.open, red: o.red }; T.hit(b2, 50); o.brk2 = { stacks: b2.vs.stacks, st: b2.st };
    return o;
  });
  check('Thiền Vệ Châu phóng 8 châu theo 8 hướng; châu trúng Trượng thì khiên Trượng tắt 2,5 giây, trúng lúc đó vỡ 1 tầng (+rút lui)',
    r.beads === 8 && r.open.open && r.open.t > 1 && r.brk.stacks === 2 && r.brk.st === 'dead', JSON.stringify(r));
  check('Thiền Vệ: hai người không tự mở khiên (đòn thường chỉ 1: 160 -> 159); đòn đập đất của Trượng làm khiên Châu tắt, khiên Trượng đỏ khi đánh',
    r.shut[0] === false && r.shut[1] === false && r.shutHp.join() === '159,159,300,300' && r.quake.open && r.quake.red && r.brk2.stacks === 2 && r.brk2.st === 'dead', JSON.stringify(r));

  // ---- Triệu Hồi Sư
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, o = {};
    T.clear(); T.fresh(); pl.vsh.stacks = 12; pl.x -= 250; pl.moveMul = 1;
    const e = T.mk('summoner', 280, false); e.cd = 0.05;
    const gr = () => G.enemies.filter(x => x.grasp && x.owner === e && x.st !== 'dead');
    await T.W(() => gr().length === 3, 3500);
    o.grasps = { n: gr().length, hp: gr().map(x => x.hp).join(), sh: gr().some(x => x.vs) };
    await T.W(() => e.fx.filter(f => f.kind === 'slowpool').length === 3, 6000);
    o.pools = e.fx.filter(f => f.kind === 'slowpool').length;
    // ném Bàn Tay về chủ
    e.cd = 1e9; e.act = null;
    const g0 = gr()[0]; G.void.xu = 0;
    SK.hurtEnemy(G, g0, 5, false, 0, 0);
    o.thrown = !!g0.thrown;
    await T.W(() => e.vs.open, 3000);
    o.open = { open: e.vs.open, t: +e.vs.openT.toFixed(1) };
    T.hit(e, 50); o.brk = { stacks: e.vs.stacks, st: e.st, xu: G.void.xu };
    return o;
  });
  check('Triệu Hồi Sư: gọi 3 Bàn Tay 12 máu (không khiên), ném nốt đạn tạo 3 vũng chậm; đánh trúng Bàn Tay thì nó bị ném về chủ, khiên chủ tắt ~3 giây, trúng lúc đó vỡ 1 tầng (+30 Xu)',
    r.grasps.n === 3 && r.grasps.hp === '12,12,12' && !r.grasps.sh && r.pools === 3 && r.thrown && r.open.open && r.open.t > 1.5 && r.brk.stacks === 2 && r.brk.st === 'dead' && r.brk.xu === 30, JSON.stringify(r));
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, o = {};
    T.clear(); T.fresh(); pl.vsh.stacks = 12; pl.invulT = 0; pl.moveMul = 1; G.void.slowOn = false; G.void.slowT = 0;
    const e = T.mk('summoner', 200, true); e.vs.stacks = 3;
    const c = V.spawnGrasp(G, e, pl.x + 2, pl.y);
    await T.W(() => T.log.length > 0, 1500);
    await T.sleep(80);
    o.touch = { raw: T.log.slice(), mm: pl.moveMul, stacks: pl.vsh.stacks };
    c.thrown = true;
    await T.W(() => pl.moveMul === 1, 2500);
    o.back = pl.moveMul;
    return o;
  });
  check('Bàn Tay Hư Không chạm người: sát thương 2 và làm chậm (tốc ×0,5) ~1,2 giây rồi trả lại 1', r.touch.raw.join() === '2' && r.touch.mm === 0.5 && r.back === 1, JSON.stringify(r));

  // ---- Hộ Pháp
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, o = {};
    T.clear(); T.fresh(); pl.vsh.stacks = 12; pl.skillCd = 0; pl.skillT = 0; pl.x -= 250;   // Hộ Pháp ở xa để vũ khí tự động của người chơi không đánh trúng
    const e = T.mk('warden', 200, true);
    SK.emit('skill', G, pl);
    o.c1 = { orbs: e.orbs, openT: e.vs.openT, circles: G.void.circles.length, at: [Math.round(G.void.circles[0].x - pl.x), Math.round(G.void.circles[0].y - pl.y)] };
    pl.skillT = 5; pl.skillCd = 0;
    await T.W(() => !(pl.skillT > 0), 2500);
    o.cut = { skillT: pl.skillT, cd: pl.skillCd };
    SK.emit('skill', G, pl); SK.emit('skill', G, pl); o.c3 = { orbs: e.orbs, circles: G.void.circles.length };
    await T.sleep(60);
    T.hit(e, 50); o.hitOpen = { stacks: e.vs.stacks };                                   // vừa mở vòng: khiên tắt, trúng thì vỡ
    SK.emit('skill', G, pl); o.c4 = { orbs: e.orbs, circles: G.void.circles.length };   // hết cầu
    pl.skillCd = 0; await T.sleep(800); o.locked = pl.skillCd > 0;                       // trong vòng cấm không dùng được kỹ năng
    pl.x += 200; pl.skillCd = 0; await T.sleep(200); o.free = pl.skillCd === 0;
    return o;
  });
  check('Hộ Pháp: mỗi lần dùng kỹ năng bay 1 trong 3 pháp cầu tới chỗ người chơi mở vòng cấm, khiên Hộ Pháp tắt 1,5 giây (trúng lúc đó vỡ 1 tầng); hết cầu thì không mở vòng nữa',
    r.c1.orbs === 2 && r.c1.openT === 1.5 && r.c1.circles === 1 && r.c1.at.join() === '0,0' && r.c3.orbs === 0 && r.c3.circles === 3 && r.c4.circles === 3 && r.hitOpen.stacks === 2, JSON.stringify(r));
  check('Hộ Pháp: trong vòng cấm kỹ năng đang chạy bị cắt ngay và không dùng được kỹ năng; ra khỏi vòng thì dùng lại được', r.cut.skillT <= 0 && r.locked && r.free, JSON.stringify(r));

  // ---- Đao Phủ (chỉ ải 4-x: web chưa có tầng 4 trong chế độ này nên kiểm bằng cách dựng thẳng)
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, o = {};
    o.elig = V.eligible(3).indexOf('killer') < 0 && V.eligible(3, true).indexOf('killer') >= 0;
    T.clear(); T.fresh(); pl.vsh.stacks = 12;
    const e = T.mk('killer', 120, false); e.cd = 0.05;
    await T.W(() => e.act === 'mark' && e.hidden, 2000);
    o.mark = { hidden: !!e.hidden, mk: e.fx.some(f => f.kind === 'mark'), hurt: SK.hurtEnemy(G, e, 50, false, 0, 0) };
    await T.W(() => e.daggers && e.daggers.length === 3, 3000);
    o.dag = { n: e.daggers.length, hidden: !!e.hidden };
    T.log = []; T.loss = [];
    pl.x = e.daggers[0].x; pl.y = e.daggers[0].y;
    await T.W(() => e.di >= 1, 3000);
    await T.sleep(50);
    o.pick = { di: e.di, strike: T.log.indexOf(4) >= 0, open: e.vs.open };
    await T.W(() => e.act === 'throw' || e.act === 'rest', 6000);
    o.after = e.act;
    e.life = 0.05; await T.sleep(300); o.gone = { st: e.st, leave: !!e.leave };
    return o;
  });
  check('Đao Phủ (4-x): chỉ vào bể khi có ải 4; hiện dấu săn trước và ẩn không đánh được; rải 3 dao găm, nhặt dao thì xoay chém 4 sát thương và khiên tắt, nhặt hết thì ném dao; hết 40 giây thì biến mất',
    r.elig && r.mark.hidden && r.mark.mk && r.mark.hurt === false && r.dag.n === 3 && !r.dag.hidden && r.pick.di >= 1 && r.pick.strike && (r.after === 'throw' || r.after === 'rest') && r.gone.st === 'dead' && r.gone.leave, JSON.stringify(r));

  // ---- Thương Nhân độ 3 mời thiên phú riêng; hết khiên đếm ngược thì chết bất kể bất tử
  r = await p.evaluate(async () => {
    const G = SK.G, pl = G.player, V = SK.voidMode, o = {};
    const ids = V.offerIds(G);
    o.offer = { n: ids.length, ex: ids.filter(i => i >= 3001 && i <= 3007).filter(i => V.EXCLUSIVE[3].indexOf(i) >= 0 && !V.has(G, i)).length };
    T.clear(); T.fresh(); G.player.invulT = 0;
    pl.vsh.stacks = 0; pl.vsh.cd = 0.4; pl.god = true;
    await T.W(() => pl.st === 'dead', 2000);
    o.dead = { st: pl.st, hp: pl.hp, cd: pl.vsh.cd };
    return o;
  });
  check('Thương Nhân Hư Không độ 3: bộ 3 thẻ có 1 thiên phú riêng chưa sở hữu (3001/3002/3005/3006/3007)', r.offer.n === 3 && r.offer.ex === 1, JSON.stringify(r.offer));
  check('đếm ngược Hủy Diệt về 0 thì người chơi ngã xuống dù bật bất tử', r.dead.st === 'dead' && r.dead.hp === 0, JSON.stringify(r.dead));

  check('không lỗi JS trong trang', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(results.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(2); });
