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
    SK.pets3.off = true;   // quái thật ngoài trận không nhắm pet trong các ca đo đếm máu (ca nhắm pet bật lại trong evaluate của nó)
    window.T = {
      foe() { return SK.G.enemies.find(e => e.st !== 'dead' && e.st !== 'spawn' && !e.boss); },
      // cd 1e9: quái đứng sát không tự ra đòn lên pet giữa phép đo; quái khác cũng bị khoá vì vệt chém cận chiến của chúng trúng pet đứng cạnh chủ (SK.petHp.scan),
      // pet về 1 HP thì nghỉ, đạn thử T.hit không bị nhận mà trôi sang pet dựng sau
      pin(e, a, dx) { e.x = a.x + dx; e.y = a.y; e.hp = e.hpMax = 1e6; e.kx = e.ky = 0; e._db = {}; for (const q of SK.G.enemies) q.cd = 1e9; },
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

    // ================= 4. đợt 3: quái nhắm thú cưng, cận chiến / vùng nổ trúng pet, hồi dần, thú cưng cây
    const mel = await p.evaluate(() => {
      const G = SK.G, W = SK.world, pl = G.player;
      for (const q of G.props.filter(x => x.gardenPet)) q.gone = true;
      const a = SK.petDebug.spawn('pet0'), Q = G.props.find(q => q.pet === a); window.A = a; window.Q = Q;
      a.cd = 1e9; a.k.near = a.k.far = 1e9;   // pet đứng yên, quái tự đến
      // tìm chỗ thoáng 82 px ngang (chủ ở trái 60 px, quái ở phải 22 px) quanh chỗ đang đứng, rồi đặt pet / chủ vào đó
      const ox = pl.x, oy = pl.y; let spot = null;
      for (const dy of [0, 16, -16, 32, -32, 48, -48]) for (const dx of [0, 32, -32, 64, -64, 96, -96, 128, -128]) {
        if (spot) break; const bx = ox + dx + 60, by = oy + dy; let ok = true;
        for (let x = bx - 66; x <= bx + 26 && ok; x += 4) if (W.solidAt(G.map, x, by) || W.solidAt(G.map, x, by - 8)) ok = false;
        if (ok) spot = { x: bx, y: by };
      }
      if (spot) { a.x = spot.x; a.y = spot.y; }
      pl.x = a.x - 60; pl.y = a.y;
      const id = Object.keys(SK.D.enemies).find(k => { if (k.startsWith('ex_')) return false; try { const e = SK.makeEnemy(G, k, 0, 0, G.room); return e.cls === 'EnemyAI02' && !e.boss; } catch (_) { return false; } });
      const e = SK.makeEnemy(G, id, a.x + 22, a.y, G.room); e.st = 'idle'; e.stT = 0; e.hp = e.hpMax = 1e6; e.cd = 0;
      const pl0 = { hp: pl.hp, armor: pl.armor }, seen = [], h0 = HP_hurt();
      function HP_hurt() { const h = SK.petHp.hurt; SK.petHp.hurt = function (G2, x, dmg, b) { if (x === a) seen.push({ dmg, melee: !!(b && b.melee), area: !!(b && b.area) }); return h.call(this, G2, x, dmg, b); }; return h; }
      let picked = 0, steps = 0; SK.pets3.off = false;
      try {
        for (let i = 0; i < 500 && !(a.hurts > 0); i++) {
          if (SK.pets3.chooseTarget(G, e, 0) === a) picked++;
          SK.updateEnemy(G, e, 0.02); SK.updateBullets(G, 0.02); Q.update(G, Q, 0.02); steps++;
          if (!(a.hurts > 0)) a.hp = a.hpMax;   // (no-op: pet chưa mất máu)
        }
      } finally { SK.petHp.hurt = h0; SK.pets3.off = true; }
      const r = { cls: e.cls, id, steps, picked, hurts: a.hurts, hp: a.hp, seen: seen.slice(0, 2), playerSame: pl.hp === pl0.hp && pl.armor === pl0.armor, swapBack: G.player === pl };
      e.st = 'dead'; window.E0 = e; return r;
    });
    check('quái cận chiến (EnemyAI02) đứng gần pet hơn chủ thì nhắm pet, đánh trúng: pet mất máu, chủ không mất máu / giáp, G.player trả lại', mel.picked > 0 && mel.hurts > 0 && mel.hp < 10 && mel.seen.length > 0 && mel.seen[0].melee && mel.playerSame && mel.swapBack, JSON.stringify(mel));
    const bs = await p.evaluate(() => {
      const G = SK.G, e = { boss: true, cls: 'EnemyAI02', st: 'idle', x: A.x + 5, y: A.y, p: {} }, e2 = { cls: 'SKBoss', st: 'idle', x: A.x + 5, y: A.y, p: {} };
      return { boss: SK.pets3.chooseTarget(G, e, 1), sk: SK.pets3.chooseTarget(G, e2, 1) };
    });
    check('trùm và lớp SK* không nhắm pet (vẫn nhắm chủ)', bs.boss === null && bs.sk === null, JSON.stringify(bs));
    const nr = await p.evaluate(() => {
      const G = SK.G, e = { cls: 'EnemyAI02', st: 'idle', x: A.x + 12, y: A.y, p: { findTargetRange: 20 } }; A.hp = 10; A.rest = 0;
      const a1 = SK.pets3.pick(G, e); A.rest = 10; const a2 = SK.pets3.pick(G, e); A.rest = 0; return { a1: a1 === A, a2: a2 === null };
    });
    check('pet đang nghỉ (1 HP) không bị nhắm: quái quay lại nhắm chủ', nr.a1 && nr.a2, JSON.stringify(nr));
    const ex = await p.evaluate(() => {
      const G = SK.G, a = A, Q = window.Q; a.hp = 10; a.rest = 0; a.hurts = 0; a.sinceHit = 99;
      const pl = G.player, farX = a.x + 400; const pl0 = pl.hp;
      const b = SK.spawnBullet86(G, 'e', 'bullet_29', a.x + 30, a.y - 4, 0, { dmg: 4, h: 2, spd: 0 });
      if (!b) return { err: 'không tạo được đạn' };
      b.vx = b.vy = 0; b.life = 0.02; b.x = a.x + 30; b.y = a.y - 4;
      const g0 = G.bullets.length, hp0 = a.hp; SK.updateBullets(G, 0.05); SK.updateBullets(G, 0.05); Q.update(G, Q, 0.016);
      return { dead: b.dead, hurts: a.hurts, lost: hp0 - a.hp, bulletHit: !!b._petHit, d: 30 };
    });
    check('vùng nổ của quái (đạn nổ cách pet 30 px, bán kính 64) trúng pet: mất máu, đạn không chạm thân', ex.dead && ex.hurts === 1 && ex.lost >= 1 && !ex.bulletHit, JSON.stringify(ex));
    const rgn = await p.evaluate(() => {
      const G = SK.G, a = A, Q = window.Q; for (const b of G.bullets) b.dead = true; a.hp = 10; a.rest = 0; a.cd = 1e9; a.hurts = 0;
      T.hit(a, 6); Q.update(G, Q, 0.016); const r = { hp: a.hp, since: a.sinceHit };
      let t = 0; const at = {}; const mark = [1.9, 4.9, 8, 11.5, 14.5];
      for (let i = 0; i < 300 && t < 15; i++) { Q.update(G, Q, 0.05); t += 0.05; for (const m of mark) if (at[m] == null && t >= m) at[m] = a.hp; }
      r.at = at; r.rate = +(a.hpMax / SK.petHp.REGEN_FULL).toFixed(3); return r;
    });
    check('hồi dần trong trận: trúng 6 (10 -> 4); 2 s đầu đứng yên, sau đó 10/30 = 1/3 HP mỗi giây (+1 mỗi 3 s)', rgn.hp === 4 && rgn.at[1.9] === 4 && rgn.at[4.9] === 5 && rgn.at[8] === 6 && rgn.at[11.5] === 7 && rgn.at[14.5] === 8, JSON.stringify(rgn));
    const rg2 = await p.evaluate(() => {
      const G = SK.G, a = A, Q = window.Q; a.hp = 5; a.sinceHit = 99; a.regen = 0; let t = 0; const r = {};
      for (let i = 0; i < 130; i++) {
        Q.update(G, Q, 0.05); t += 0.05;
        if (i === 9) T.hit(a, 1);   // lúc 0,5 s: trúng đòn giữa chừng
        if (i === 10) r.afterHit = a.hp;
        if (i === 47) r.at2_4 = a.hp;     // 1,9 s sau đòn: còn chờ
        if (i === 115) r.at5_7 = a.hp;    // 5,2 s sau đòn: hồi được đúng 1 (chờ 2 s + 3 s)
      }
      return r;
    });
    check('đang hồi mà trúng đòn thì bộ đếm chờ 2 s tính lại: 5 -> 4, chưa hồi sau 1,9 s, được +1 sau 5,2 s', rg2.afterHit === 4 && rg2.at2_4 === 4 && rg2.at5_7 === 5, JSON.stringify(rg2));

    // thú cưng cây đợt 3
    const d1 = await mk('plant_datura');
    const bv = await p.evaluate(() => {
      const G = SK.G, a = CA, pl = G.player, e = T.foe(), r = {};
      const volley = () => { T.pin(e, a, 3 * SK.PPU); for (const x of G.bullets) if (x.owner === a) x.dead = true; a.cd = 0; a.tgt = e; a.comp.crit = 1; T.step(CQ, 1, 0.016); const m = G.bullets.filter(x => x.owner === a && x.side === 'p' && !x.dead); a.cd = 1e9; return m; };
      pl.buffs = []; let m = volley(); const ang = v => v.map(x => Math.atan2(x.vy, x.vx)).sort((u, w) => u - w); r.base = m.length; r.fan0 = +(ang(m)[2] - ang(m)[0]).toFixed(3);
      pl.buffs = [3]; m = volley(); r.shotgun = m.length;
      pl.buffs = [20]; m = volley(); { const q = ang(m); r.fanAcc = +(q[q.length - 1] - q[0]).toFixed(3); }
      pl.buffs = [40]; m = volley(); r.critDmg = m.map(x => x.dmg).join();
      pl.buffs = []; m = volley(); r.critDmg0 = m.map(x => x.dmg).join();
      pl.buffs = [8]; m = volley(); r.poisonUp = m.every(x => x.gdPoisonUp);
      pl.buffs = []; return r;
    });
    check('buff lên Hoa Mandala: Shotgun 3 -> 5 viên, Chính Xác giảm nửa góc quạt, Nguyên Tố bạo kích x2 (3 -> 6), buff Độc đánh dấu đạn', bv.base === 3 && bv.shotgun === 5 && bv.fan0 === 0.6 && Math.abs(bv.fanAcc - 0.3) < 0.01 && bv.critDmg === '6,6,6' && bv.critDmg0 === '3,3,3' && bv.poisonUp, JSON.stringify(bv));
    const poi2 = await p.evaluate(() => {
      const G = SK.G, e = T.foe(); e._db = {}; G.player.buffs = [8];
      G._hitBullet = { gdPoison: true, gdPoisonUp: true }; SK.emit('enemyHit', G, e, 3, true); G._hitBullet = null;
      const up = e._db.poison && e._db.poison.dmg; e._db = {}; G._hitBullet = { gdPoison: true }; SK.emit('enemyHit', G, e, 3, true); G._hitBullet = null;
      const base = e._db.poison && e._db.poison.dmg; G.player.buffs = []; return { up, base };
    });
    check('buff Độc: sát thương Trúng Độc +1 (2 -> 3) khi bạo kích', poi2.base === 2 && poi2.up === 3, JSON.stringify(poi2));
    const fly = async plant => {
      await mk(plant);
      return p.evaluate(() => {
        const G = SK.G, m = G.map, W = SK.world, T0 = SK.TILE, a = CA;
        let spot = null;
        for (let ty = 1; ty < m.H - 1 && !spot; ty++) for (let tx = 1; tx < m.W - 2 && !spot; tx++) if (m.tiles[ty * m.W + tx] === W.OBST && m.tiles[ty * m.W + tx + 1] === W.FLOOR && !W.solidTile(m, tx + 2, ty)) spot = { tx, ty };
        if (!spot) return { none: true };
        a.x = (spot.tx + 0.5) * T0; a.y = (spot.ty + 1) * T0 - 2; a.rest = 0; a.cd = 1e9; a.tgt = null; G.player.x = a.x - 6; G.player.y = a.y;
        const e = T.foe(); e.x = (spot.tx + 7) * T0; e.y = a.y; e.hp = e.hpMax = 1e6; e.kx = e.ky = 0;
        const x0 = a.x; for (let i = 0; i < 40; i++) { a.tgt = e; CQ.update(G, CQ, 0.05); e.x = (spot.tx + 7) * T0; e.y = a.y; G.player.x = a.x - 6; G.player.y = a.y; }
        return { moved: +(a.x - x0).toFixed(1), tile: T0, inBlock: Math.floor(x0 / T0) === spot.tx };
      });
    };
    const f1 = await fly('plant_datura'), f2 = await fly('plant_eator');
    check('Hoa Mandala đứng trong ô khối vẫn bay ra được (qua khối / thùng), Hoa Ăn Thịt cùng chỗ thì kẹt', f1.none || (f1.moved > 8 && f2.moved < 2), JSON.stringify({ f1, f2 }));
    await mk('plant_zongzi');
    const zl = await p.evaluate(() => {
      const G = SK.G, a = CA, e = T.foe(), pk0 = SK.pick, cols = {}, out = {};
      const burst = col => { for (const x of G.bullets) if (x.owner === a) x.dead = true; if (col) SK.pick = () => col; a.cols = []; a.shotsLeft = 3; a.shotT = 0; a.cd = 1e9; a.tgt = e; a.comp.crit = 0;
        const v0 = a.volleys || 0; for (let i = 0; i < 60 && (a.volleys || 0) - v0 < 3; i++) { T.pin(e, a, 3 * SK.PPU); CQ.update(G, CQ, 0.02); } a.cd = 1e9; a.shotsLeft = 0; SK.pick = pk0; return G.bullets.filter(x => x.owner === a && x.zc && !x.dead).slice(-3); };
      let m = burst(null);   // màu ngẫu nhiên
      const seen = new Set(); for (let k = 0; k < 40; k++) { for (const b of burst(null)) seen.add(b.zc); }
      out.colors = [...seen].sort().join();
      m = burst('blue'); out.j = m.map(b => b.zj).join(); out.n = m.length;
      return out;
    });
    check('Súng Bánh Ú: lá nhận đủ 4 màu ngẫu nhiên; ba lá cùng màu thì chỉ lá thứ ba là jackpot', zl.colors === 'blue,green,red,yellow' && zl.n === 3 && zl.j === 'false,false,true', JSON.stringify(zl));
    const lf = await p.evaluate(() => {
      const G = SK.G, a = CA, e = T.foe(), r = {}, o = SK.makeEnemy(G, e.id, e.x + 16, e.y, G.room); o.st = 'idle'; o.stT = 5; G.enemies.push(o);
      const hit = (col, crit, jack, tgt) => { tgt = tgt || e; G._hitBullet = { zc: col, zj: jack }; SK.emit('enemyHit', G, tgt, 3, crit); G._hitBullet = null; };
      e._db = {}; hit('red', true, false); r.fire = !!e._db.fire;
      e._db = {}; hit('yellow', true, false); r.ele = !!e._db.ele;
      e._db = {}; hit('blue', true, false); r.ice = !!e._db.ice;
      e._db = {}; hit('green', true, false); r.green = Object.keys(e._db).join('');
      e._db = {}; hit('red', false, false); r.noCrit = Object.keys(e._db).join('');
      e._db = {}; hit('yellow', false, true); r.jackEle = e._db.ele && e._db.ele.t;
      // nổ đỏ: 8 sát thương cho quái trong 2 đv
      if (o !== e) { o.x = e.x + 16; o.y = e.y; o.hp = o.hpMax = 1e6; const h0 = o.hp; hit('red', false, true); r.boom = h0 - o.hp; } else r.boom = 'thiếu quái thứ hai';
      // vũng băng: quái trong 2 đv bị đóng băng sau 0,5 s, vũng hết sau 5 s
      e._db = {}; hit('blue', false, true); const pool = G.props.find(q => q.icePool); r.pool = !!pool;
      for (let i = 0; i < 12; i++) pool.update(G, pool, 0.05); r.poolIce = !!e._db.ice;
      for (let i = 0; i < 110; i++) pool.update(G, pool, 0.05); r.poolGone = pool.gone === true;
      return r;
    });
    check('lá màu: bạo kích đỏ Cháy / vàng Điện giật / xanh dương Đóng băng, xanh lá không gắn trạng thái, không bạo kích thì không gắn', lf.fire && lf.ele && lf.ice && lf.green === '' && lf.noCrit === '', JSON.stringify(lf));
    check('jackpot: vàng Điện giật 5 s; đỏ nổ 8 sát thương lan quái bên cạnh; xanh dương vũng băng đóng băng quái trong vũng và hết sau 5 s', lf.jackEle >= 4.5 && lf.boom === 8 && lf.pool && lf.poolIce && lf.poolGone, JSON.stringify(lf));
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
