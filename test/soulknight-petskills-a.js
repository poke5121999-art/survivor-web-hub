/*
 * Kỹ năng riêng thú cưng pet0..pet7 của Hiệp Sĩ Linh Hồn (games/soulknight/js/pets/pet0.js … pet7.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-petskills-a.js   (SK_URL để chạy trên Pages)
 * Mỗi thú cưng chạy trong một trang mới (kỹ năng như pet4/pet6 sửa người chơi nên không để lẫn nhau).
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
}
// đạn quái đứng yên đè lên thú cưng (đạn kiểu cũ, đủ trường cho SK.updateBullets)
const shoot = (p, dmg) => p.evaluate(d => {
  for (const u of (SK.G.pet.units || [SK.G.pet])) SK.G.bullets.push({ side: 'e', kind: 'orb', x: u.x, y: u.y - 4, h: 2, vx: 0, vy: 0, ang: 0, dmg: d, repel: 0, r: 3, life: 1 });
}, dmg);

const CASES = {
  async pet0(p) {
    const r = await p.evaluate(() => { const a = SK.G.pet, pl = SK.G.player; pl.energy = pl.energyMax - 30; a.mpT = 0.01; return { e0: pl.energy, every: a.def.name, d: Math.hypot(pl.x - a.x, pl.y - a.y) }; });
    await sleep(500);
    const r2 = await p.evaluate(() => ({ e: SK.G.player.energy, got: SK.G.pet.mpGot, t: SK.G.pet.mpT }));
    check('pet0 Hân Hoan [WIKI Pets]: chủ trong 3 ô (48 px), tới nhịp thì năng lượng +1/+3/+5, hồi chiêu 8 s', r.d <= 48 && [1, 3, 5].includes(r2.got) && r2.e === r.e0 + r2.got && r2.t > 7 && r2.t <= 8, JSON.stringify({ truoc: r.e0, sau: r2.e, r2 }));
    const far = await p.evaluate(() => { const a = SK.G.pet, pl = SK.G.player; pl.energy = pl.energyMax - 30; a.mpGot = 0; a.mpT = 0; const x = a.x; a.x = pl.x + 60; a.def.tick(SK.G, a, 0.001); const g = a.mpGot; a.x = x; return g; });
    check('pet0: chủ ngoài 3 ô thì không hồi', far === 0, String(far));
  },
  async pet1(p) {
    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await sleep(400);
    const r = await p.evaluate(() => {
      const G = SK.G, a = G.pet, c0 = G.pickups.filter(k => k.kind === 'coin').length;
      const e = { x: G.player.x, y: G.player.y };
      let maxVal = 0, minVal = 99;
      for (let i = 0; i < 400; i++) { a.coinCd = 0; a.def.bite(G, a, e, 2); }
      const coins = G.pickups.filter(k => k.kind === 'coin').slice(c0);
      for (const k of coins) { maxVal = Math.max(maxVal, k.value); minVal = Math.min(minVal, k.value); }
      const rate = a.def.rate; a.def.rate = 1; a.coinCd = 0;
      const n0 = G.pickups.length; a.def.bite(G, a, e, 2); const hadCd = a.coinCd, d1 = G.pickups.length - n0;
      a.def.bite(G, a, e, 2); const d2 = G.pickups.length - n0 - d1;
      a.def.rate = rate;
      return { found: a.found - 1, dropped: coins.length, rate, maxVal, minVal, hadCd, d1, d2 };
    });
    check('pet1 Thịnh Vượng [WIKI Pets]: 400 cú cắn (bỏ hồi chiêu) rơi ~20% đồng vàng trị giá 5 xu', r.rate === 0.2 && r.found === r.dropped && r.found >= 50 && r.found <= 110 && r.maxVal === 5 && r.minVal === 5, JSON.stringify(r));
    check('pet1: rơi xu thì vào hồi chiêu 10 s, cắn tiếp trong lúc hồi không rơi', r.hadCd === 10 && r.d1 === 1 && r.d2 === 0, JSON.stringify(r));
  },
  async pet2(p) {
    const r = await p.evaluate(() => {
      const G = SK.G, pl = G.player; pl.energy = pl.energyMax; pl.hp = pl.hpMax - 2; pl.god = false;
      SK.dropPickup(G, 'en_pot', pl.x, pl.y - 6, { vx: 0, vy: 0 });
      return { hp0: pl.hp, hpMax: pl.hpMax };
    });
    await sleep(900);
    const r2 = await p.evaluate(() => ({ hp: SK.G.player.hp, left: SK.G.pickups.filter(k => k.kind === 'en_pot').length, ate: SK.G.pet.ate }));
    check('pet2 Không Kén Ăn: MP đầy + bình MP -> HP +1, bình biến mất', r2.hp === r.hp0 + 1 && r2.left === 0 && r2.ate === 1, JSON.stringify({ r, r2 }));
    const r3 = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.energy = pl.energyMax - 100; pl.hp = pl.hpMax - 2; SK.dropPickup(G, 'en_pot', pl.x, pl.y - 6, { vx: 0, vy: 0 }); return pl.hp; });
    await sleep(900);
    const r4 = await p.evaluate(() => ({ hp: SK.G.player.hp, en: SK.G.player.energy, ate: SK.G.pet.ate }));
    check('pet2: MP chưa đầy thì bình hồi MP như thường, không +HP', r4.hp === r3 && r4.ate === 1, JSON.stringify(r4));
  },
  async pet3(p) {
    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await sleep(400);
    const info = () => p.evaluate(() => { const a = SK.G.pet; return { n: a.units.length, lvl: a.lvl, dmg: a.k.dmg, scale: a.scale, props: SK.G.props.filter(q => q.pet === a).length, bite: a.def.bite(SK.G, a, null, 3) }; });
    const s0 = await info();
    check('pet3: lúc đầu 1 con, cắn 3', s0.n === 1 && s0.bite === 3, JSON.stringify(s0));
    await shoot(p, 1); await sleep(300);
    const s1 = await info();
    check('pet3 Chia Nhau: bị bắn thì tách thành 2, sát thương còn 1', s1.n === 2 && s1.lvl === 1 && s1.dmg === 1 && s1.bite === 1 && s1.scale < 1, JSON.stringify(s1));
    await sleep(900); await shoot(p, 1); await sleep(300);
    const s2 = await info();
    check('pet3: lần tách thứ 2 ra 4 con (2 lần tối đa)', s2.n === 4 && s2.lvl === 2, JSON.stringify(s2));
    await sleep(900); await shoot(p, 1); await sleep(300);
    const s3 = await info();
    check('pet3: bị bắn thêm không tách quá 2 lần (vẫn 4 con)', s3.n === 4 && s3.lvl === 2, JSON.stringify(s3));
    await p.screenshot({ path: process.env.SK_SHOTS ? process.env.SK_SHOTS + '/pet3-split.png' : '/tmp/pet3-split.png' }).catch(() => 0);
    await p.evaluate(() => SK_GAME.debug.stage('1-2')); await sleep(500);
    const s4 = await info();
    check('pet3: sang ải mới lại một con', s4.n === 1 && s4.lvl === 0, JSON.stringify(s4));
  },
  async pet4(p) {
    const r = await p.evaluate(() => { const pl = SK.G.player; return { b: window.__pre, m: pl.armorMax, a: pl.armor }; });
    check('pet4 Sạc Dự Phòng: giới hạn giáp +2 (và giáp +2)', r.m === r.b.m + 2 && r.a === r.b.a + 2, JSON.stringify(r));
    await p.evaluate(() => SK_GAME.debug.stage('1-2')); await sleep(500);
    const m2 = await p.evaluate(() => SK.G.player.armorMax);
    check('pet4: sang ải mới không cộng chồng', m2 === r.m, 'armorMax ' + m2);
  },
  async pet5(p) {
    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await sleep(300);
    await shoot(p, 2); await sleep(300);
    const r = await p.evaluate(() => { const a = SK.G.pet; return { decoy: a.decoy, hp: a.hp, dmg: a.k.dmg, def: !!SK.PET_SKILLS.pet5 }; });
    check('pet5 Dễ Thương Bùng Nổ: đã đăng ký, đánh dấu mồi, đạn quái trúng thì trừ HP ở hệ máu chung (10 - 2 = 8), cắn 2', r.decoy === true && r.hp === 8 && r.dmg === 2 && r.def, JSON.stringify(r));
  },
  async pet6(p) {
    const r = await p.evaluate(() => {
      const pl = SK.G.player;
      const id = Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].spread >= 5 && SK.DS.weapons[k].kind !== 'melee');
      pl.weapons[pl.cur] = SK.makeWeapon(id); pl.weapons[1] = pl.weapons[1] || SK.makeWeapon(id);
      return { id, orig: SK.DS.weapons[id].spread };
    });
    await sleep(400);
    const r2 = await p.evaluate(id => { const w = SK.G.player.weapons[SK.G.player.cur]; return { spread: w.def.spread, global: SK.DS.weapons[id].spread }; }, r.id);
    check('pet6 Lông Xù Xù: spread vũ khí đang cầm giảm 5 độ (độ chính xác +5)', r2.spread === Math.max(0, r.orig - 5) && r2.global === r.orig, JSON.stringify({ r, r2 }));
    const r3 = await p.evaluate(() => { const G = SK.G, a = G.pet; G.player.weapons[G.player.cur] && 0; a.def.stage(G, a); const w = G.player.weapons[G.player.cur]; return w.def.spread; });
    check('pet6: ải mới / xa chủ thì trả spread gốc', r3 === r.orig, 'spread ' + r3);
  },
  async pet7(p) {
    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await sleep(300);
    const a0 = await p.evaluate(() => { const a = SK.G.pet; return { hp: a.hp, hpMax: a.hpMax, base: SK.PET_BASE_HP }; });
    check('pet7 Giáp Sắt: HP thú cưng = 10 gốc + 2 = 12', a0.hpMax === 12 && a0.hp === 12, JSON.stringify(a0));
    await shoot(p, 3); await sleep(250);
    const a1 = await p.evaluate(() => SK.G.pet.hp);
    check('pet7: trúng đạn 3 thì HP 12 -> 9', a1 === 9, 'hp ' + a1);
    for (let i = 0; i < 3; i++) { await shoot(p, 3); await sleep(120); }
    const a2 = await p.evaluate(() => ({ hp: SK.G.pet.hp, rest: SK.G.pet.rest > 0 }));
    check('pet7: máu về sàn 1 thì nằm nghỉ (hệ máu chung 14~16 s)', a2.hp === 1 && a2.rest === true, JSON.stringify(a2));
    await p.evaluate(() => SK_GAME.debug.stage('1-2')); await sleep(500);
    const a3 = await p.evaluate(() => ({ hp: SK.G.pet.hp, hidden: !!SK.G.pet.hidden, rest: SK.G.pet.rest }));
    check('pet7: sang ải mới hồi đầy 12, hết nghỉ', a3.hp === 12 && !a3.hidden && a3.rest === 0, JSON.stringify(a3));
  }
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const id of Object.keys(CASES)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    out.push(id);
    try {
      await p.goto(URL);
      await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
      await p.evaluate(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
      await until(p, () => SK_GAME.state === 'stage', null, 3000);
      await p.evaluate(() => SK_GAME.debug.god(true));
      const ok = await p.evaluate(i => { window.__pre = { m: SK.G.player.armorMax, a: SK.G.player.armor }; const a = SK.petDebug.spawn(i); return !!(a && a.id === i && SK.PET_SKILLS[i] && SK.PET_SKILLS[i] !== undefined && Object.keys(SK.PET_SKILLS[i]).length); }, id);
      check(id + ' có kỹ năng riêng đăng ký (SK.PET_SKILLS)', ok);
      await CASES[id](p);
    } catch (e) {
      check(id + ' chạy trọn', false, e.message.split('\n')[0]);
    }
    check(id + ' không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
    await p.close();
  }
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
