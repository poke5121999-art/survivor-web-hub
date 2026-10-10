/*
 * Hệ máu chung của thú cưng (games/soulknight/js/pets.js, SK.petHp) và thú cưng cây của Khu Vườn (js/garden.js).
 * [WIKI Pets]: 10 HP, máu không xuống dưới 1, về 1 HP thì nghỉ cạnh chủ không đánh, hồi đầy sau 14~16 s.
 * Hoa Mandala: 10 HP, 3 viên quạt 3 sát thương, độc khi bạo kích. Hoa Ăn Thịt: 15 HP, cắn 5 (8 khi bạo kích). Bánh Ú Con: 10 HP, loạt 3 lá x 3.
 * Thời gian nghỉ đo bằng giờ trò chơi: gọi thẳng update của prop thú cưng với dt cố định trong một lần evaluate (không phụ thuộc máy chậm).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-pethp.js   (SK_URL để chạy trên Pages; SK_SHOTS: thư mục ảnh)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const os = require('os');
const fs = require('fs');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-pethp');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // dụng cụ trong trang: tìm quái sống, ghim cạnh thú cưng, bắn đạn quái, bước prop thú cưng theo dt cố định
  const prep = () => p.evaluate(() => {
    window.T = {
      foe() { return SK.G.enemies.find(e => e.st !== 'dead' && e.st !== 'spawn' && !e.boss); },
      pin(e, a, dx) { e.x = a.x + dx; e.y = a.y; e.hp = e.hpMax = 1e6; e.kx = e.ky = 0; e._db = {}; },
      hit(a, dmg) { const b = { side: 'e', kind: 'orb', x: a.x, y: a.y - 4, h: 2, vx: 0, vy: 0, ang: 0, dmg, repel: 0, r: 3, life: 5 }; SK.G.bullets.push(b); return b; },
      step(q, n, dt, fn) { for (let i = 0; i < n; i++) { q.update(SK.G, q, dt); if (fn) fn(i); } }
    };
  });
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261010); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));
    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    check('vào phòng có quái', await until(p, () => SK.G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead' && !e.boss), null, 8000));
    await prep();

    // ================= 1. thú cưng chính (hệ chung)
    const s = await p.evaluate(() => { const a = SK.petDebug.spawn('pet0'); window.A = a; window.Q = SK.G.props.find(q => q.pet === a); return { id: a.id, hp: a.hp, max: a.hpMax, rest: a.rest }; });
    check('pet0 vào trận với 10 HP gốc [WIKI Pets], chưa nghỉ', s.id === 'pet0' && s.hp === 10 && s.max === 10 && s.rest === 0, JSON.stringify(s));
    const h1 = await p.evaluate(() => {
      const a = A; a.cd = 1e9; const b = T.hit(a, 3);
      T.step(Q, 1, 0.016);
      return { hp: a.hp, gone: b.dead === true, rest: a.rest };
    });
    check('trúng đạn quái 3: mất đúng 3 HP (10 -> 7), đạn biến mất, chưa nghỉ', h1.hp === 7 && h1.gone && h1.rest === 0, JSON.stringify(h1));
    const h2 = await p.evaluate(() => {
      const a = A; const r = {}; T.hit(a, 50); T.step(Q, 1, 0.016);
      r.hp = a.hp; r.rest = a.rest; r.restFor = a.restFor; r.hurts = a.hurts;
      return r;
    });
    check('đòn 50: máu chỉ xuống sàn 1, vào nghỉ, thời gian nghỉ nằm trong 14~16 s', h2.hp === 1 && h2.rest > 0 && h2.restFor >= 14 && h2.restFor <= 16, JSON.stringify(h2));
    const h3 = await p.evaluate(() => {
      const a = A, e = T.foe(); T.pin(e, a, 8);
      let atk = 0, tgt = 0, ran = 0; const hp0 = e.hp;
      a.cd = 0; a.scan = 0;
      T.step(Q, 100, 0.05, () => { ran += 0.05; T.pin(e, a, 8); a.cd = 0; a.scan = 0; if (a.st === 'atk') atk++; if (a.target) tgt++; });
      return { atk, tgt, ran: +ran.toFixed(2), rest: +a.rest.toFixed(2), hpE: e.hp === hp0, hp: a.hp };
    });
    check('đang nghỉ: quái đứng sát, 5 s liền thú cưng không vào đòn đánh, không nhắm mục tiêu', h3.atk === 0 && h3.tgt === 0 && h3.rest > 0 && h3.hpE, JSON.stringify(h3));
    const h4 = await p.evaluate(() => { const a = A, b = T.hit(a, 4); T.step(Q, 1, 0.016); return { hp: a.hp, passed: b.dead !== true }; });
    check('đang nghỉ: đạn quái bay qua, không trừ thêm máu (đã ở sàn 1)', h4.hp === 1 && h4.passed, JSON.stringify(h4));
    const h5 = await p.evaluate(() => {
      const a = A, total = a.restFor, left = a.rest, e = T.foe(); let t = 0;
      // chạy tới còn 0,3 s: chưa hồi
      const n1 = Math.floor((left - 0.3) / 0.05); T.step(Q, n1, 0.05, () => { t += 0.05; T.pin(e, a, 8); });
      const mid = { hp: a.hp, rest: a.rest > 0 };
      let guard = 0; while (a.rest > 0 && guard++ < 40) { q = Q; Q.update(SK.G, Q, 0.05); t += 0.05; }
      return { total: +total.toFixed(2), left: +left.toFixed(2), t: +t.toFixed(2), mid, hp: a.hp, max: a.hpMax, rest: a.rest };
    });
    check('hồi đầy sau đúng thời gian nghỉ (14~16 s): trước đó vẫn 1 HP, hết giờ thì 10/10 và hết nghỉ', h5.mid.hp === 1 && h5.mid.rest && h5.hp === 10 && h5.rest === 0 && h5.total >= 14 && h5.total <= 16 && h5.t >= h5.left - 0.1 && h5.t <= h5.left + 0.4, JSON.stringify(h5));
    const h6 = await p.evaluate(() => {
      const a = A, e = T.foe(); T.pin(e, a, 8); a.cd = 0; a.scan = 0; a.hp = 10; let atk = false;
      T.step(Q, 80, 0.05, () => { T.pin(e, a, 8); if (a.st === 'atk') atk = true; });
      return { atk, hp: a.hp };
    });
    check('hồi xong thì lại đánh quái như thường', h6.atk, JSON.stringify(h6));
    const h7 = await p.evaluate(() => { const a = A; a.hp = 2; a.rest = 0; T.hit(a, 1); T.step(Q, 1, 0.016); return { hp: a.hp, rest: a.rest > 0 }; });
    check('đang 2 HP, trúng đòn 1 thì về 1 HP và nghỉ ngay', h7.hp === 1 && h7.rest, JSON.stringify(h7));

    // ================= 2. chuyển pet7 / pet26 / pet49 sang hệ chung
    const m7 = await p.evaluate(() => { const a = SK.petDebug.spawn('pet7'); return { max: a.hpMax, hp: a.hp, own: typeof SK.PET_SKILLS.pet7.tick }; });
    check('pet7 Giáp Sắt: 12 HP trên hệ chung (không còn tick riêng)', m7.max === 12 && m7.hp === 12 && m7.own === 'undefined', JSON.stringify(m7));
    const m26 = await p.evaluate(() => {
      const a = SK.petDebug.spawn('pet26'), q = SK.G.props.find(x => x.pet === a); a.cd = 1e9; const r = {};
      T.hit(a, 50); T.step(q, 1, 0.016); r.st = a.st; r.rest = a.rest > 0; r.hp = a.hp;
      const bl = T.hit(a, 9); T.step(q, 1, 0.016); r.blocked = bl.dead === true && a.hp === 1;
      return r;
    });
    check('pet26 Rùa: về 1 HP thì rút mai (defense) nghỉ 14~16 s và chặn đạn', m26.st === 'defense' && m26.rest && m26.hp === 1 && m26.blocked, JSON.stringify(m26));
    const m49 = await p.evaluate(() => {
      const a = SK.petDebug.spawn('pet49'), q = SK.G.props.find(x => x.pet === a); a.cd = 1e9; const r = { max: a.hpMax };
      for (let i = 0; i < 8; i++) { T.hit(a, 1); T.step(q, 1, 0.016); if (a.rest > 0) break; }
      r.hits = a.hits; r.hp = a.hp; return r;
    });
    check('pet49 Heo: 15 HP, mỗi đòn trúng đếm số đòn và trừ 1 HP', m49.max === 15 && m49.hits === 8 && m49.hp === 7, JSON.stringify(m49));

    // ================= 3. thú cưng cây
    const mk = plant => p.evaluate(pl => {
      for (const q of SK.G.props.filter(x => x.gardenPet)) q.gone = true;
      SK.G.player._gardenPets = [pl]; SK.garden.spawnPets(SK.G);
      const q = SK.G.props.filter(x => x.gardenPet).pop(); window.CQ = q; window.CA = q.gardenPet; CA.cd = 1e9;
      const a = CA; return { plant: a.plant, hp: a.hp, max: a.hpMax, rest: a.rest, ranged: !!a.comp.range };
    }, plant);

    const d0 = await mk('plant_datura');
    check('Hoa Mandala: 10 HP trên hệ chung', d0.hp === 10 && d0.max === 10 && d0.rest === 0, JSON.stringify(d0));
    const volley = crit => p.evaluate(c => {
      const a = CA, G = SK.G, e = T.foe(); a.comp.crit = c; T.pin(e, a, 3 * SK.PPU);
      const before = G.bullets.length; a.cd = 0; a.tgt = e;
      T.step(CQ, 1, 0.016);
      const mine = G.bullets.filter(x => x.owner === a && x.side === 'p');
      const ang = mine.map(x => Math.atan2(x.vy, x.vx)).sort((u, v) => u - v);
      const r = { n: mine.length, dmg: mine.map(x => x.dmg).join(), crit: mine.map(x => x.crit).join(), tag: mine.every(x => x.gdPoison), ang: ang.map(v => +v.toFixed(3)), fan: ang.length === 3 ? +(ang[2] - ang[0]).toFixed(3) : 0, cd: a.cd };
      a.cd = 1e9; window.FOE = e; window.HP0 = e.hp; return r;
    }, crit);
    const v1 = await volley(1);
    check('Hoa Mandala bắn đúng 3 viên hình quạt (góc đều nhau, rộng 0,6 rad), mỗi viên 3 sát thương, cooldown 2 s', v1.n === 3 && v1.dmg === '3,3,3' && v1.tag && Math.abs(v1.fan - 0.6) < 0.01 && Math.abs((v1.ang[1] - v1.ang[0]) - (v1.ang[2] - v1.ang[1])) < 0.01 && v1.cd === 2, JSON.stringify(v1));
    const poi = await until(p, () => FOE._db && FOE._db.poison && FOE._db.poison.t > 0, null, 5000);
    const pd = await p.evaluate(() => ({ poison: !!(FOE._db && FOE._db.poison), t: FOE._db && FOE._db.poison && +FOE._db.poison.t.toFixed(2), dmg: FOE._db && FOE._db.poison && FOE._db.poison.dmg, lost: HP0 - FOE.hp }));
    check('đạn bạo kích trúng quái: quái có trạng thái Trúng Độc (e._db.poison) và mất máu', poi && pd.poison && pd.dmg > 0 && pd.lost >= 3, JSON.stringify(pd));
    await shot(p, 'mandala-poison');
    await sleep(800);
    await p.evaluate(() => { for (const x of SK.G.bullets) if (x.owner === CA) x.dead = true; });
    await volley(0);
    const hit0 = await until(p, () => FOE.hp < HP0, null, 5000);
    const pd0 = await p.evaluate(() => ({ poison: !!(FOE._db && FOE._db.poison), lost: HP0 - FOE.hp }));
    check('đạn không bạo kích trúng quái: mất máu nhưng không nhiễm độc', hit0 && !pd0.poison && pd0.lost >= 3, JSON.stringify(pd0));
    const dh = await p.evaluate(() => {
      const a = CA, e = T.foe(); T.pin(e, a, 3 * SK.PPU); const n0 = a.volleys || 0;
      T.hit(a, 40); T.step(CQ, 1, 0.016); const r = { hp: a.hp, rest: a.restFor };
      a.cd = 0; a.tgt = e; T.step(CQ, 120, 0.05, () => { T.pin(e, a, 3 * SK.PPU); a.cd = 0; });
      r.shots = (a.volleys || 0) - n0; return r;
    });
    check('Hoa Mandala trúng đòn: về 1 HP, nghỉ 14~16 s, 6 s liền quái ngay trước mặt vẫn không bắn', dh.hp === 1 && dh.rest >= 14 && dh.rest <= 16 && dh.shots === 0, JSON.stringify(dh));

    const e0 = await mk('plant_eator');
    check('Hoa Ăn Thịt: 15 HP [WIKI Titan Arum]', e0.hp === 15 && e0.max === 15 && !e0.ranged, JSON.stringify(e0));
    const bite = crit => p.evaluate(c => {
      const a = CA, e = T.foe(), seen = []; a.comp.crit = c; T.pin(e, a, 0.8 * SK.PPU);
      const h0 = SK.hurtEnemy; SK.hurtEnemy = function (G, x, dmg, cr, ...r) { if (G._skHit === 'pet') seen.push([dmg, cr]); return h0.call(this, G, x, dmg, cr, ...r); };
      try { a.cd = 0; a.tgt = e; T.step(CQ, 3, 0.05, () => T.pin(e, a, 0.8 * SK.PPU)); } finally { SK.hurtEnemy = h0; }
      a.cd = 1e9; return seen;
    }, crit);
    const b0 = await bite(0), b1 = await bite(1);
    check('Hoa Ăn Thịt cắn 5 sát thương, bạo kích 8 [WIKI Titan Arum]', b0.length === 1 && b0[0][0] === 5 && !b0[0][1] && b1.length === 1 && b1[0][0] === 8 && b1[0][1], JSON.stringify({ b0, b1 }));
    const eh = await p.evaluate(() => {
      const a = CA, e = T.foe(); T.hit(a, 6); T.step(CQ, 1, 0.016); const r = { hp: a.hp };
      T.hit(a, 99); T.step(CQ, 1, 0.016); r.hp2 = a.hp; r.rest = a.restFor; T.pin(e, a, 0.8 * SK.PPU); let bites = a.bites || 0;
      a.cd = 0; T.step(CQ, 100, 0.05, () => { T.pin(e, a, 0.8 * SK.PPU); a.cd = 0; }); r.bites = (a.bites || 0) - bites;
      T.step(CQ, 400, 0.05, () => { T.pin(e, a, 0.8 * SK.PPU); a.cd = 0; }); r.after = { hp: a.hp, rest: a.rest, bites: (a.bites || 0) - bites };
      return r;
    });
    check('Hoa Ăn Thịt: 15 -> 9 -> sàn 1, nghỉ 14~16 s không cắn, hết nghỉ đầy 15 HP rồi cắn lại', eh.hp === 9 && eh.hp2 === 1 && eh.rest >= 14 && eh.rest <= 16 && eh.bites === 0 && eh.after.hp === 15 && eh.after.rest === 0 && eh.after.bites > 0, JSON.stringify(eh));
    await shot(p, 'eater');

    const z0 = await mk('plant_zongzi');
    check('Bánh Ú Con: 10 HP [WIKI Zongzi Flower]', z0.hp === 10 && z0.max === 10 && z0.ranged, JSON.stringify(z0));
    const zb = await p.evaluate(() => {
      const a = CA, G = SK.G, e = T.foe(); T.pin(e, a, 3 * SK.PPU); a.cd = 0; a.tgt = e; const times = []; let t = 0, n = 0;
      T.step(CQ, 14, 0.02, () => { t += 0.02; T.pin(e, a, 3 * SK.PPU); if ((a.shots || 0) > n) { for (let k = n; k < a.shots; k++) times.push(+t.toFixed(2)); n = a.shots; } });
      const mine = G.bullets.filter(x => x.owner === a && x.side === 'p');
      a.cd = 1e9; return { shots: a.shots, volleys: a.volleys, times, dmg: [...new Set(mine.map(x => x.dmg))].join() };
    });
    const gaps = zb.times.slice(1).map((v, i) => +(v - zb.times[i]).toFixed(2));
    check('Bánh Ú Con (Súng Bánh Ú): một loạt đúng 3 lá cách nhau 0,1 s, mỗi lá 3 sát thương, loạt sau chưa nổ trong 0,3 s', zb.shots === 3 && gaps.every(g => g >= 0.08 && g <= 0.14) && zb.dmg === '3', JSON.stringify({ zb, gaps }));
    const zr = await p.evaluate(() => {
      const a = CA, e = T.foe(); T.hit(a, 99); T.step(CQ, 1, 0.016); const n0 = a.shots || 0, r = { hp: a.hp, rest: a.restFor };
      T.pin(e, a, 3 * SK.PPU); a.cd = 0; a.tgt = e; T.step(CQ, 120, 0.05, () => { T.pin(e, a, 3 * SK.PPU); a.cd = 0; }); r.shots = (a.shots || 0) - n0; return r;
    });
    check('Bánh Ú Con trúng đòn: về 1 HP, nghỉ 14~16 s, không bắn trong lúc nghỉ', zr.hp === 1 && zr.rest >= 14 && zr.rest <= 16 && zr.shots === 0, JSON.stringify(zr));
  } catch (e) {
    check('chạy trọn', false, (e.stack || e.message).split('\n').slice(0, 3).join(' / '));
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ảnh: ${SHOTS}\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);

  async function shot(pg, name) {
    await pg.evaluate(() => { const a = window.CA, pl = SK.G.player; if (a && pl) { a.x = pl.x - 20; a.y = pl.y + 4; } });
    await sleep(300);
    await pg.screenshot({ path: path.join(SHOTS, name + '.png') });
  }
})();
