/*
 * Xâm Nhập Hư Không độ 1 (games/soulknight/js/void.js, MODES.md mục 2e).
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

  check('không lỗi JS trong trang', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(results.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(2); });
