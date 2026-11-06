/*
 * Kiểm thiên phú bổ sung của Hiệp Sĩ Linh Hồn (games/soulknight/js/rooms.js, khối "THIÊN PHÚ BỔ SUNG").
 * Mỗi thiên phú: cấp qua SK_ROOMS.takeBuff, kích bằng đúng sự kiện lõi (SK.hurtEnemy, SK.hurtPlayer, sự kiện 'skill'/'fire'),
 * đo bằng số cụ thể. Id theo BuffId (Buff_name_<id-1> với id < 1000).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  PLAYWRIGHT_PATH=... node test/soulknight-talents.js
 * Chỉ nhóm: SK_ONLY=38,39 node test/soulknight-talents.js
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const ONLY = (process.env.SK_ONLY || '').split(',').filter(Boolean).map(Number);
const DATA = fs.readFileSync(path.join(ROOT, 'games/soulknight/data/sk-buffs86.js'), 'utf8');

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}
const IGNORE = /bosses86|theme|lib|colour/;
const want = id => !ONLY.length || ONLY.indexOf(id) >= 0;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(DATA);
  const ev = (fn, arg) => p.evaluate(fn, arg);

  async function stage(label) {
    await ev(l => { Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null }); SK_GAME.debug.stage(l); }, label);
    await until(p, () => SK_GAME.phase === 'play', null, 4000);
  }
  // Ván mới, không buff, không kẻ địch, máu/giáp đầy, không bất tử (god tắt để thử sát thương lên người).
  async function fresh(buffs, o) {
    await ev(() => { SK.startRun('knight'); SK_GAME.debug.god(true); });
    await until(p, () => SK_GAME.state === 'stage', null, 2000);
    await stage('1-3');
    await ev(([bs, o]) => {
      const pl = SK.G.player; pl.buffs = []; pl.bm = {}; pl.statues = []; pl.rateMul = 1; pl.crit = 0; pl.dmgMul = 1; pl.hp = pl.hpMax; pl.energy = pl.energyMax;
      SK.G.enemies.length = 0; SK.G.bullets.length = 0; SK.G.props = SK.G.props.filter(q => !(q.sculpt || q.nova || q.spike));
      pl.god = !!(o && o.god); pl.invulT = 0;
      for (const k of bs) SK_ROOMS.takeBuff(k);
    }, [buffs, o || null]);
  }
  // Kẻ địch đứng yên; mỗi phần tử [dx, dy, hp]. Trả về số hiệu theo thứ tự.
  const spawn = list => ev(list => {
    const G = SK.G, pl = G.player;
    for (const [dx, dy, hp] of list) {
      const e = SK.makeEnemy(G, 'e_orc01', pl.x + dx, pl.y + dy, G.room);
      e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = hp; G.enemies.push(e);
    }
    return G.enemies.length;
  }, list);
  const hpOf = i => ev(i => SK.G.enemies[i].hp, i);

  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });

    // ================================================================ dữ liệu
    const D = await ev(() => {
      const B = SK_BUFFS86.buffs, ids = [1015, 1016, 1017, 1018, 3001, 3002, 3003, 3004, 3005, 3006, 3007];
      return { names: ids.map(i => B[i] && B[i].name && B[i].name.vi), info1016: B[1016].info.vi, desc1016: SK_ROOMS.buffDesc(1016), desc41: SK_ROOMS.buffDesc(41),
        active: [38, 39, 40, 41, 1015, 1016, 1017, 1018, 1020, 1024, 17, 23, 2105, 2108, 2118, 2145, 2146, 15].map(i => !!(SK_ROOMS.DEF[i] && SK_ROOMS.DEF[i].active)),
        off: [31, 1023, 1025, 3001].map(i => !!(SK_ROOMS.DEF[i] && SK_ROOMS.DEF[i].active)),
        offered: (() => { const s = {}; for (const [lv, th] of [[2, 'forest'], [6, 'castle'], [11, 'volcano']]) for (const x of SK_ROOMS.poolFor(lv, th).pool) s[x[0]] = 1; return Object.keys(s).map(Number); })(),
        honest: [8, 9, 23, 40].map(i => !!(SK_ROOMS.DEF[i] && SK_ROOMS.DEF[i].active)) };
    });
    check('dữ liệu tên 1015..1018 và 3001..3007 từ localization (không còn thiếu)', D.names.every(Boolean) && D.names[0] === 'Băng Kích' && D.names[3] === 'Ảo Ảnh Rừng', D.names.join(', '));
    check('mô tả điền số: Tượng Băng Nổ "50% … bán kính 2 … 12 DMG", Dòng Điện Từ "Tăng Bạo Kích 10%"', /50%/.test(D.desc1016) && /bán kính 2/.test(D.desc1016) && /12 DMG/.test(D.desc1016) && /10%/.test(D.desc41), D.desc1016.slice(0, 90));
    check('18 thiên phú đã có luật active (có Thợ Mỏ Đá Quý, số đo ở soulknight-gem-statue.js); Liên Kích Mưa, Âm Dương, Nhà Mỹ Thực, 3001 chưa active', D.active.every(Boolean) && D.off.every(x => !x), JSON.stringify(D.active) + ' ' + JSON.stringify(D.off));
    check('bể bốc theo cấp (nhóm gốc) có 17, 23, 2105, 2108 từ ải đầu và 2118 từ cấp 11; 38, 39, 41, 1020, 1024, 2145, 2146 và Lê Băng không nằm trong nhóm nào', [17, 23, 2105, 2108, 2118].every(i => D.offered.indexOf(i) >= 0) && [38, 39, 41, 1020, 1024, 2145, 2146, 1015, 1016, 1017, 1018].every(i => D.offered.indexOf(i) < 0), D.offered.length + ' loại');
    check('Lái Buôn Thiện Lương (8, 9, 23, 40) có đủ bốn buff chạy được', D.honest.every(Boolean), JSON.stringify(D.honest));

    // ================================================================ 38 Khiên Khẩn Cấp
    if (want(38)) {
      await fresh([38]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player; pl.armorMax = 5; pl.armor = 1; pl.invulT = 0;
        SK.hurtPlayer(G, 1, 0, 0); const a1 = pl.armor, cd = pl.bm.armCd;
        pl.armor = 1; pl.invulT = 0; SK.hurtPlayer(G, 1, 0, 0);
        return { a1, cd, a2: pl.armor };
      });
      check('Khiên Khẩn Cấp: giáp vỡ → hồi ngay floor(5×50%) = 2, hồi chiêu 60 s; vỡ lần hai trong hồi chiêu: 0', r.a1 === 2 && Math.abs(r.cd - 60) < 1 && r.a2 === 0, JSON.stringify(r));
    }

    // ================================================================ 39 Bí Quyết Luyện Khí
    if (want(39)) {
      await fresh([39]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, W = SK_DESIGN.weapons;
        const id = Object.keys(W).find(k => W[k].w86 && /^GunInitFighter$/.test(W[k].w86.cls));
        SK_GAME.debug.give(id); pl.aim = 0; pl.energy = 100;
        const e = SK.makeEnemy(G, 'e_orc01', pl.x + 70, pl.y - 8, G.room); e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = 100; G.enemies.push(e);
        const far = SK.makeEnemy(G, 'e_orc01', pl.x - 70, pl.y - 8, G.room); far.st = 'idle'; far.stT = 1e9; far.hp = far.hpMax = 100; G.enemies.push(far);
        G.bullets.push({ side: 'e', x: pl.x + 40, y: pl.y - 8, vx: 0, vy: 0, dmg: 1, r: 2, life: 5 });
        SK.emit('fire', G, pl, pl.weapons[pl.cur]);
        const out = { id, en: pl.energy, hp: e.hp, farHp: far.hp, eb: G.bullets.filter(q => q.side === 'e' && !q.dead).length };
        pl.energy = 1; SK.emit('fire', G, pl, pl.weapons[pl.cur]); out.hp2 = e.hp; return out;
      });
      check('Bí Quyết Luyện Khí: tay không tung sóng quạt: −2 năng lượng, quái trước mặt −3, quái sau lưng 0, xoá đạn địch', r.en === 98 && r.hp === 97 && r.farHp === 100 && r.eb === 0, JSON.stringify(r));
      check('Bí Quyết Luyện Khí: thiếu năng lượng (1 < 2) thì không tung sóng', r.hp2 === 97, 'hp ' + r.hp2);
    }

    // ================================================================ 40 Bạo Phép Thuật
    if (want(40)) {
      await fresh([40]);
      await spawn([[40, 0, 1000], [40, 10, 1000], [40, 20, 1000]]);
      const r = await ev(() => {
        const G = SK.G, [a, b, c] = G.enemies;
        SK.skillKit.debuff(G, a, 'poison'); SK.skillKit.debuff(G, b, 'ice');
        SK.hurtEnemy(G, a, 10, true, 0, 0); SK.hurtEnemy(G, b, 10, true, 0, 0); SK.hurtEnemy(G, c, 10, true, 0, 0);
        const x = G.enemies.map(e => e.hp); SK.hurtEnemy(G, a, 10, false, 0, 0);
        return { x, nocrit: a.hp };
      });
      check('Bạo Phép Thuật: bạo kích 10 lên quái đang nhiễm độc/đóng băng −20; quái sạch −10; đòn thường lên quái nhiễm −10',
        r.x[0] === 980 && r.x[1] === 980 && r.x[2] === 990 && r.nocrit === 970, JSON.stringify(r));
    }

    // ================================================================ 41 Dòng Điện Từ
    if (want(41)) {
      await fresh([]);
      const c0 = await ev(() => SK.G.player.crit);
      await ev(() => SK_ROOMS.takeBuff(41));
      const c1 = await ev(() => SK.G.player.crit);
      await spawn([[40, 0, 1000], [50, 8, 1000], [44, -8, 1000], [220, 0, 1000]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, E = G.enemies;
        SK.hurtEnemy(G, E[0], 5, true, 0, 0);
        const x = E.map(e => e.hp); SK.hurtEnemy(G, E[0], 5, true, 0, 0);
        const cd = pl.bm.zapCd; const y = E[0].hp;
        pl.bm.zapCd = 0; SK.emit('skill', G, pl);
        return { x, y, cd, z: E.map(e => e.hp) };
      });
      check('Dòng Điện Từ: bạo kích +10%', c1 === c0 + 10, c0 + ' → ' + c1);
      check('Dòng Điện Từ: bạo kích 5 → mục tiêu −(5+4), hai quái gần −4, quái xa 0; đòn kế trong 1 s không có sét; dùng kỹ năng thì sét lại',
        r.x[0] === 991 && r.x[1] === 996 && r.x[2] === 996 && r.x[3] === 1000 && r.y === 986 && Math.abs(r.cd - 1) < 0.2 && r.z[0] === 982 && r.z[3] === 1000, JSON.stringify(r));
    }

    // ================================================================ 1020 Thời Khắc Tập Trung
    if (want(1020)) {
      await fresh([1020]);
      const wid = await ev(() => { const W = SK_DESIGN.weapons; const id = Object.keys(W).find(k => W[k].kind === 'gun' && (W[k].spread || 0) >= 8 && !(W[k].w86 && W[k].w86.x && W[k].w86.x.charge)); SK_GAME.debug.give(id); return id; });
      const base = await ev(id => ({ sp: SK_DESIGN.weapons[id].spread, cur: SK.G.player.weapons[SK.G.player.cur].def.spread }), wid);
      await spawn([[40, 0, 1], [40, 4, 1], [40, 8, 1], [40, 12, 1], [40, 16, 1], [200, 0, 1000]]);
      await ev(() => { const G = SK.G; for (let i = 0; i < 4; i++) SK.hurtEnemy(G, G.enemies[i], 5, false, 0, 0); });
      await sleep(250);
      const r4 = await ev(() => { const pl = SK.G.player; return { n: pl.bm.focusN, rate: pl.rateMul, crit: pl.crit, sp: pl.weapons[pl.cur].def.spread }; });
      await ev(() => { const G = SK.G; SK.hurtEnemy(G, G.enemies[4], 5, false, 0, 0); });
      await sleep(150);
      const r5 = await ev(() => SK.G.player.bm.focusN);
      await ev(() => { SK.G.player.bm.focusT = 0.05; });
      await sleep(300);
      const r0 = await ev(() => { const pl = SK.G.player; return { n: pl.bm.focusN, rate: pl.rateMul, crit: pl.crit, sp: pl.weapons[pl.cur].def.spread }; });
      check('Thời Khắc Tập Trung: 4 quái hạ → 4 tầng: tốc bắn ×1,2, bạo kích +20, độ lệch −8 (bắt đầu ' + base.cur + ')', r4.n === 4 && Math.abs(r4.rate - 1.2) < 0.001 && r4.crit === 20 && r4.sp === Math.max(0, base.cur - 8), JSON.stringify(r4));
      check('Thời Khắc Tập Trung: quái thứ 5 không vượt 4 tầng; hết 10 s thì về 0 tầng, tốc ×1, bạo kích 0, độ lệch gốc', r5 === 4 && r0.n === 0 && r0.rate === 1 && r0.crit === 0 && r0.sp === base.cur, JSON.stringify([r5, r0]));
    }

    // ================================================================ 1024 Âm Vang Súng Đạn
    if (want(1024)) {
      await fresh([1024]);
      await spawn([[80, 0, 100000]]);
      await ev(() => { window.__dm = []; if (!window.__dmOn) { window.__dmOn = 1; SK.on('enemyHit', (G, e, d) => window.__dm.push(d)); } });
      const r = await ev(() => {
        const G = SK.G, pl = G.player, W = SK_DESIGN.weapons;
        const ids = Object.keys(W).filter(k => W[k].kind === 'gun' && !(W[k].w86 && W[k].w86.x && W[k].w86.x.charge)).slice(0, 3);
        pl.weapons[0] = SK.makeWeapon(ids[0]); pl.weapons[1] = SK.makeWeapon(ids[1]); pl.cur = 0; pl.aim = 0; pl.energy = pl.energyMax;
        return { ids, en: pl.energy };
      });
      await sleep(200);
      const s = await ev(() => { const pl = SK.G.player; SK.emit('fire', SK.G, pl, pl.weapons[pl.cur]); return { t: pl.bm.echoT, pool: pl.bm.echoPool.length, w: pl.bm.echoW && pl.bm.echoW.id, d: pl.bm.echoW && pl.bm.echoW.def.dmg }; });
      await sleep(600);
      const m = await ev(() => { const G = SK.G, pl = G.player; return { dm: window.__dm.slice(), en: pl.energy, hp: G.enemies[0].hp }; });
      await sleep(900);
      const e = await ev(() => { const pl = SK.G.player; return { t: pl.bm.echoT, cd: pl.bm.echoCd }; });
      check('Âm Vang Súng Đạn: sau một đòn, vũ khí đã nhặt bắn thêm 1 s (mỗi đạn trúng đúng nửa sát thương gốc; đạn bạo kích ×2 rồi nửa = gốc), không tốn năng lượng, nghỉ sau đó',
        s.t > 0.5 && s.pool >= 2 && r.ids.indexOf(s.w) >= 0 && m.dm.length > 0 && m.dm.every(d => d === Math.max(1, Math.round(s.d * 0.5)) || d === s.d) && m.en === r.en && e.t <= 0 && e.cd > 0.5, JSON.stringify({ s, m, e }));
    }

    // ================================================================ 2145 Gan góc dũng cảm
    if (want(2145)) {
      await fresh([2145]);
      await spawn([[40, 0, 100000]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, e = G.enemies[0], o = {};
        for (let i = 0; i < 3; i++) SK.emit('skill', G, pl);
        o.n3 = pl.bm.valorN; let h = e.hp; SK.hurtEnemy(G, e, 10, false, 0, 0); o.d3 = h - e.hp;
        for (let i = 0; i < 5; i++) SK.emit('skill', G, pl);
        o.n8 = pl.bm.valorN; h = e.hp; SK.hurtEnemy(G, e, 10, false, 0, 0); o.d5 = h - e.hp;
        pl.bm.valorN = 0; pl.bm.valorT = 0; pl.hp = 1; return o;
      });
      await sleep(250);
      const hp1 = await ev(() => { const pl = SK.G.player; const o = { n: pl.bm.valorN }; pl.hp = pl.hpMax; pl.bm.valorT = 0.05; return o; });
      await sleep(300);
      const gone = await ev(() => SK.G.player.bm.valorN);
      check('Gan góc dũng cảm: 3 lần kỹ năng → 3 tầng, đòn 10 thành 13; tối đa 5 tầng → 15', r.n3 === 3 && r.d3 === 13 && r.n8 === 5 && r.d5 === 15, JSON.stringify(r));
      check('Gan góc dũng cảm: máu còn 1 → đầy 5 tầng; hết 5 s thì mất tầng', hp1.n === 5 && gone === 0, JSON.stringify(hp1) + ' → ' + gone);
    }

    // ================================================================ 2146 Hồn Giác Đấu
    if (want(2146)) {
      await fresh([2146]);
      await spawn([[40, 0, 100000]]);
      const wid = await ev(() => { const W = SK_DESIGN.weapons; const id = Object.keys(W).find(k => W[k].kind === 'melee' && W[k].range > 0); SK_GAME.debug.give(id); return id; });
      const r = await ev(id => {
        const G = SK.G, pl = G.player, e = G.enemies[0], o = { base: SK_DESIGN.weapons[id].range, r0: pl.weapons[pl.cur].def.range };
        for (let i = 0; i < 9; i++) SK.hurtEnemy(G, e, 1, false, 0, 0);
        o.after9 = pl.bm.spiritT || 0; o.crit9 = pl.crit;
        SK.hurtEnemy(G, e, 1, false, 0, 0);
        o.after10 = pl.bm.spiritT; o.crit10 = pl.crit; o.r10 = pl.weapons[pl.cur].def.range;
        pl.bm.spiritT = 0.05; return o;
      }, wid);
      await sleep(350);
      const e = await ev(() => { const pl = SK.G.player; return { crit: pl.crit, r: pl.weapons[pl.cur].def.range, t: pl.bm.spiritT }; });
      check('Hồn Giác Đấu: 9 đòn chưa đủ; đòn thứ 10 → bật 5 s: bạo kích +30, tầm cận chiến ×1,3',
        r.after9 === 0 && r.crit9 === 0 && r.after10 === 5 && r.crit10 === 30 && Math.abs(r.r10 - r.r0 * 1.3) < 0.01 && Math.abs(r.r0 - r.base) < 0.01, JSON.stringify(r));
      check('Hồn Giác Đấu: hết 5 s thì bạo kích và tầm về gốc', e.crit === 0 && Math.abs(e.r - r.base) < 0.01, JSON.stringify(e));
    }

    // ================================================================ 17 Bạn Tốt Nhất / 2108 Thời Gian Party
    if (want(17) || want(2108)) {
      await fresh([]);
      await ev(() => { SK_GAME.debug.pet(true); SK.petDebug.spawn('pet0'); });
      await sleep(150);
      const b0 = await ev(() => { const a = SK.G.pet; return { dmg: a.k.dmg, cd: a.k.cd, spd: a.k.spd, sc: a.scale == null ? 1 : a.scale }; });
      await ev(() => SK_ROOMS.takeBuff(17)); await sleep(250);
      const b1 = await ev(() => { const a = SK.G.pet; return { dmg: a.k.dmg, cd: a.k.cd, spd: a.k.spd, sc: a.scale }; });
      check('Bạn Tốt Nhất: thú cưng sát thương ×2, cỡ ×1,5, tốc đánh/chạy giữ nguyên ngoài trận', b1.dmg === b0.dmg * 2 && Math.abs(b1.sc - b0.sc * 1.5) < 1e-9 && b1.cd === b0.cd && b1.spd === b0.spd, JSON.stringify([b0, b1]));
      await spawn([[200, 0, 1e7]]);
      const st = await ev(() => { const r = SK.G.room; const o = r.state; r.state = 'locked'; return o; });
      await ev(() => SK_ROOMS.takeBuff(2108)); await sleep(250);
      const b2 = await ev(() => { const a = SK.G.pet; return { dmg: a.k.dmg, cd: a.k.cd, spd: a.k.spd }; });
      await ev(s => { SK.G.room.state = s; }, st); await sleep(250);
      const b3 = await ev(() => { const a = SK.G.pet; return { cd: a.k.cd, spd: a.k.spd }; });
      check('Thời Gian Party: trong trận hồi chiêu đòn ÷2 và tốc chạy ×2 [đơn vị +100% ƯỚC LƯỢNG]; ra khỏi trận trở lại', Math.abs(b2.cd - b0.cd / 2) < 1e-9 && Math.abs(b2.spd - b0.spd * 2) < 1e-9 && b2.dmg === b0.dmg * 2 && b3.cd === b0.cd && b3.spd === b0.spd, JSON.stringify([b2, b3]));
      await ev(() => { SK_GAME.debug.pet(false); });
    }

    // ================================================================ 23 Khiên Băng Giá
    if (want(23)) {
      await fresh([]);
      await spawn([[40, 0, 100000], [40, 20, 100000]]);
      await ev(() => SK.skillKit.debuff(SK.G, SK.G.enemies[0], 'ice')); await sleep(200);
      const t0 = await ev(() => SK.G.enemies[0]._db.ice.t);
      await ev(() => { SK_ROOMS.takeBuff(23); SK.skillKit.debuff(SK.G, SK.G.enemies[1], 'ice'); }); await sleep(200);
      const t1 = await ev(() => ({ t: SK.G.enemies[1]._db.ice.t, st: SK.G.enemies[1].st, stT: SK.G.enemies[1].stT }));
      check('Khiên Băng Giá: quái bị đóng băng lâu hơn 1 s (còn ' + t0.toFixed(2) + ' s so với ' + t1.t.toFixed(2) + ' s)', t1.t - t0 > 0.8 && t1.t - t0 < 1.2 && t1.st === 'stun' && t1.stT > t0, JSON.stringify([t0, t1]));
    }

    // ================================================================ 2105 Luân Chuyển Nguyên Tố
    if (want(2105)) {
      await fresh([2105]);
      await spawn([[40, 0, 1e7], [40, 10, 1e7], [40, 20, 1e7], [40, 30, 1e7]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, out = {}, E = G.enemies, per = SK_BUFFS86.values.elementalCycle.cycle_duration;
        const old = SK.chance; SK.chance = () => true;
        const kinds = ['fire', 'ice', 'poison', 'ele'];
        kinds.forEach((k, i) => {
          pl.bm.cycT = i * per + 0.1; out['k' + i] = SK_ROOMS.cycleKind();
          SK.hurtEnemy(G, E[i], 1, false, 0, 0);
          const d = E[i]._db && E[i]._db[k]; out['d' + i] = !!d; out['m' + i] = d && d.dmg;
        });
        SK.chance = old; return out;
      });
      check('Luân Chuyển Nguyên Tố: lần lượt Thiêu Đốt, Đóng Băng, Trúng Độc, Cảm Điện mỗi 5 s; đòn trúng gây đúng hiệu ứng của trạng thái',
        r.k0 === 'fire' && r.k1 === 'ice' && r.k2 === 'poison' && r.k3 === 'ele' && r.d0 && r.d1 && r.d2 && r.d3, JSON.stringify(r));
      check('Luân Chuyển Nguyên Tố: sát thương theo thời gian của nguyên tố +50% (cháy 3 → 4,5; độc 2 → 3)', r.m0 === 4.5 && r.m2 === 3, 'cháy ' + r.m0 + ' độc ' + r.m2);
    }

    // ================================================================ 2118 Bảo Hộ Linh Hồn
    if (want(2118)) {
      await fresh([]);
      await ev(() => { const pl = SK.G.player; pl.armorMax = 100; pl.armor = 0; pl.armorT = 1e6; SK.setSeed(77); });
      await spawn(Array.from({ length: 60 }, (_, i) => [40 + (i % 6) * 4, i * 2 - 60, 1e7]));
      await ev(() => { for (const e of SK.G.enemies) SK.skillKit.debuff(SK.G, e, 'fire'); });
      await sleep(250);
      const c = await ev(() => SK.G.player.armor);
      await ev(() => { SK_ROOMS.takeBuff(2118); SK.G.player.armor = 0; SK.G.player.armorT = 1e6; for (const e of SK.G.enemies) { e._db = {}; } });
      await ev(() => { for (const e of SK.G.enemies) SK.skillKit.debuff(SK.G, e, 'fire'); });
      await sleep(250);
      const g = await ev(() => SK.G.player.armor);
      check('Bảo Hộ Linh Hồn: gây trạng thái lên 60 quái → hồi ≈ 25% = 15 giáp (đo ' + g + '); không có buff: 0 (đo ' + c + ')', c === 0 && g >= 6 && g <= 26, 'g=' + g);
    }

    // ================================================================ 1015 / 1016 / 1017 Lê Băng
    if (want(1015)) {
      await fresh([1015]);
      await spawn([[40, 0, 1000], [40, 10, 1000]]);
      const r = await ev(() => {
        const G = SK.G, E = G.enemies, n = () => G.props.filter(q => q.spike).length;
        SK.hurtEnemy(G, E[1], 5, true, 0, 0); const a = n();
        SK.skillKit.debuff(G, E[0], 'ice'); SK.hurtEnemy(G, E[0], 5, false, 0, 0); const b = n();
        SK.hurtEnemy(G, E[0], 5, true, 0, 0); return { a, b, c: n() };
      });
      check('Băng Kích: bạo kích lên quái sạch: 0 mũi; đòn thường lên quái đóng băng: 0; bạo kích lên quái đóng băng: 3 mũi', r.a === 0 && r.b === 0 && r.c === 3, JSON.stringify(r));
    }
    if (want(1016)) {
      await fresh([1016]);
      await spawn([[40, 0, 1], [60, 0, 1000]]);
      const r = await ev(() => {
        const G = SK.G, E = G.enemies, old = SK.chance; SK.chance = () => true;
        SK.skillKit.debuff(G, E[0], 'ice'); SK.hurtEnemy(G, E[0], 5, false, 0, 0);
        SK.chance = old; return { n: G.props.filter(q => q.sculpt).length };
      });
      await sleep(1600);
      const hp = await hpOf(1), left = await ev(() => SK.G.props.filter(q => q.sculpt).length);
      check('Tượng Băng Nổ: quái chết khi đóng băng → thành tượng, đuổi quái kế bên và nổ −12 một lần, tượng biến mất', r.n === 1 && hp === 988 && left === 0, JSON.stringify(r) + ' hp ' + hp + ' còn ' + left);
      await fresh([1016]); await spawn([[40, 0, 1]]);
      const r2 = await ev(() => { const G = SK.G; const old = SK.chance; SK.chance = () => true; SK.hurtEnemy(G, G.enemies[0], 5, false, 0, 0); SK.chance = old; return G.props.filter(q => q.sculpt).length; });
      check('Tượng Băng Nổ: quái chết khi không đóng băng → không có tượng', r2 === 0, 'tượng ' + r2);
    }
    if (want(1017)) {
      await fresh([1017]);
      await spawn([[40, 0, 1], [50, 0, 1000], [200, 0, 1000]]);
      const r = await ev(() => {
        const G = SK.G, E = G.enemies, old = SK.chance; SK.chance = () => true;
        SK.skillKit.debuff(G, E[0], 'ice'); SK.hurtEnemy(G, E[0], 5, false, 0, 0);
        SK.chance = old; return G.props.filter(q => q.nova).length;
      });
      await sleep(4300);
      const near = 1000 - await hpOf(1), far = 1000 - await hpOf(2);
      check('Vòng Sương Băng: quái chết khi đóng băng → vòng 1 sát thương mỗi 0,5 s trong 3 s lên quái trong bán kính, quái xa 0', r === 1 && near >= 5 && near <= 7 && far === 0, 'vòng ' + r + ' gần −' + near + ' xa −' + far);
    }

    // ================================================================ 1018 Ảo Ảnh Rừng
    if (want(1018)) {
      await fresh([1018]);
      await spawn([[90, 0, 1e7]]);
      await ev(() => {
        const G = SK.G, pl = G.player, W = SK_DESIGN.weapons, id = Object.keys(W).find(k => W[k].kind === 'gun' && !(W[k].w86 && W[k].w86.x && W[k].w86.x.charge));
        pl.weapons[0] = SK.makeWeapon(id); pl.cur = 0; pl.aim = 0; G.room.state = 'locked'; pl.bm.cloneCd = 0;
      });
      await sleep(900);
      const r = await ev(() => { const G = SK.G, bm = G.player.bm; return { on: bm.cloneT > 0, x: G.bullets.filter(q => q._xtra).length, hp: G.enemies[0].hp }; });
      await sleep(4500);
      const e = await ev(() => { const bm = SK.G.player.bm; return { on: bm.cloneT > 0, cd: bm.cloneCd }; });
      await ev(() => { SK.G.room.state = 'idle'; });
      check('Ảo Ảnh Rừng: trong trận sinh ảo ảnh, ảo ảnh bắn nửa sát thương vào quái; hết 4 s thì tan, hồi 8 s [số ƯỚC LƯỢNG]', r.on && (r.x > 0 || r.hp < 1e7) && !e.on && e.cd > 3, JSON.stringify([r, e]));
    }
  } catch (e) {
    check('chạy trọn', false, (e.stack || e.message).split('\n').slice(0, 4).join(' / '));
  }
  const bad = errs.filter(e => !IGNORE.test(e));
  check('không lỗi trang / console', bad.length === 0, bad.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
