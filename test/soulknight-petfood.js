/*
 * Thức Ăn Mèo (Pet Food) và Pet Buff ở sảnh đi / trong ván [WIKI Living Room "Pet Food", Pets, Pet Buff]:
 * bảng thú cưng có dòng cấp Thức Ăn; nâng 5 lần trừ đúng 500+1000+1500+2000+2500 = 7500 đá, không đủ đá thì từ chối; cho ăn trừ 1 thức ăn, +10 thân mật,
 * mua ăn trừ đúng giá; vào ván: thú cưng chính +10 HP và +2 sát thương (đo bằng đòn cắn thật), thú cưng cây không nhận; cấp lưu qua nạp lại trang;
 * Pet Buff (id 17): +9 HP, nghỉ nửa (7~8 s), hồi dần gấp đôi; Hoa Ăn Thịt +10 HP +3 sát thương; sát thương x2 của rooms.js cộng dồn sau Thức Ăn.
 * Không dùng ?quick=1. Chạy: python3 -m http.server 8811 (gốc repo) rồi  node test/soulknight-petfood.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-petfood');
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

const errs = [];
let browser;
async function boot(profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 10000);
  await sleep(500);
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
  return p;
}
const dlgText = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
const click = async (p, sel) => { await p.click(sel); await sleep(120); };
async function startRun(p) {
  await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
  await p.keyboard.down('KeyW');
  await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
  await p.keyboard.up('KeyW');
  await p.click('#hs-mode-go');
  return until(p, () => SK.G.state === 'stage' && !!SK.G.player && !!SK.G.pet, null, 8000);
}
async function openPanel(p) {
  await p.evaluate(() => { const s = SK.hallState; s.pet.x = s.me.x - 0.6; s.pet.y = s.me.y - 0.2; });
  await until(p, () => { const n = SK.hall.near(); return n && n.slot === 'pet_food'; }, null, 2000);
  await p.keyboard.press('KeyE');
  if (!await until(p, () => !document.getElementById('hs-modal').hidden, null, 1200)) {
    await p.keyboard.press('KeyE');
    await until(p, () => !document.getElementById('hs-modal').hidden, null, 2000);
  }
  await until(p, () => !!document.getElementById('sk-pets'), null, 2000);
  await sleep(200);
  return dlgText(p);
}
const st = p => p.evaluate(() => ({ gems: SK.profile.gems, lv: SK.petFood.level(), grain: SK.profile.item('material_grain'), aff: SK.profile.petAff('pet0'), fed: SK.profile.petFed('pet0'),
  note: document.getElementById('sk-pet-note') && document.getElementById('sk-pet-note').innerText, line: document.getElementById('sk-pet-foodlv') && document.getElementById('sk-pet-foodlv').innerText }));
const tools = p => p.evaluate(() => {
  window.T = {
    mk(x, y) { const G = SK.G, id = Object.keys(SK.D.enemies).find(k => !k.startsWith('ex_') && SK.D.enemies[k].ai && /EnemyAI01/.test(SK.D.enemies[k].ai[0].cls));
      const e = SK.makeEnemy(G, id, x, y, G.room); e.st = 'idle'; e.stT = 5; e.hp = e.hpMax = 1e6; e._db = {}; G.enemies.push(e); return e; },
    hit(a, dmg) { const b = { side: 'e', kind: 'orb', x: a.x, y: a.y - 4, h: 2, vx: 0, vy: 0, ang: 0, dmg, repel: 0, r: 3, life: 5 }; SK.G.bullets.push(b); return b; },
    step(q, n, dt, fn) { for (let i = 0; i < n; i++) { q.update(SK.G, q, dt); if (fn) fn(i); } }
  };
});

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 1. nâng Thức Ăn Mèo ở sảnh
    let p = await boot({ gems: 20000, unlocked: ['knight'], selected: 'knight', inv: { material_grain: 3 } });
    let t = await openPanel(p);
    let s = await st(p);
    check('bảng thú cưng có dòng "Thức Ăn Mèo cấp 0/5 ... +0 HP, +0 sát thương" và giá cấp sau 500', /Thức Ăn Mèo cấp 0\/5/.test(s.line || '') && /\+0 HP/.test(s.line) && /500/.test(s.line), s.line);
    check('chữ hiện cho người chơi không chứa nhãn nguồn', !/\[(LOC|WIKI|ĐO|ƯỚC LƯỢNG)/.test(t));
    const costs = [500, 1000, 1500, 2000, 2500], spent = [];
    for (let i = 0; i < 5; i++) { const b = await st(p); await click(p, '#sk-pet-foodup'); const a = await st(p); spent.push(b.gems - a.gems); if (a.lv !== i + 1) spent.push('lv?' + a.lv); }
    s = await st(p);
    check('nâng 5 lần trừ đúng 500 / 1000 / 1500 / 2000 / 2500 (tổng 7500), cấp 5/5', JSON.stringify(spent) === JSON.stringify(costs) && s.lv === 5 && s.gems === 20000 - 7500, JSON.stringify(spent) + ' gems=' + s.gems);
    check('đủ cấp: dòng báo +10 HP +2 sát thương, nút nâng tắt, không trừ thêm đá', /cấp 5\/5/.test(s.line) && /\+10 HP/.test(s.line) && /\+2 sát thương/.test(s.line) && await p.evaluate(() => document.getElementById('sk-pet-foodup').disabled)
      && (await p.evaluate(() => SK.petFood.upgrade())).ok === false && (await st(p)).gems === s.gems, s.line);
    // mua ăn / cho ăn
    const b0 = await st(p); await click(p, '#sk-pet-buyfeed'); const b1 = await st(p);
    check('mua ăn trừ đúng 50 đá, thêm 1 Thức ăn cho pet', b0.gems - b1.gems === 50 && b1.grain === b0.grain + 1, JSON.stringify([b0.gems, b1.gems, b0.grain, b1.grain]));
    await click(p, '#sk-pet-feed'); const b2 = await st(p);
    check('cho ăn: trừ đúng 1 thức ăn, thân mật +10, đếm 1/7, không tốn đá', b2.grain === b1.grain - 1 && b2.aff === b1.aff + 10 && b2.fed === 1 && b2.gems === b1.gems, JSON.stringify(b2));
    // lưu qua nạp lại trang
    const key = await p.evaluate(() => localStorage.getItem('sk_petfood_lv'));
    await p.context().close();

    // không đủ đá
    p = await boot({ gems: 400, unlocked: ['knight'], selected: 'knight' });
    await openPanel(p);
    const r = await p.evaluate(() => { const g0 = SK.profile.gems, r = SK.petFood.upgrade(); return { r, g: SK.profile.gems - g0, lv: SK.petFood.level(), dis: document.getElementById('sk-pet-foodup').disabled }; });
    check('400 đá: nâng bị từ chối, nút tắt, đá và cấp không đổi', !r.r.ok && r.g === 0 && r.lv === 0 && r.dis, JSON.stringify(r));
    await p.context().close();

    // ============ 2. vào ván: Thức Ăn cấp 5 + Pet Buff (hồ sơ có sẵn cấp 5 trong localStorage)
    p = await boot({ gems: 0, unlocked: ['knight'], selected: 'knight' });
    await p.evaluate(() => SK.petFood.set(5));
    check('cấp Thức Ăn lưu ở localStorage (sk_petfood_lv = 5) và đọc lại đúng', key === '5' && await p.evaluate(() => localStorage.getItem('sk_petfood_lv') === '5' && SK.petFood.level() === 5), String(key));
    check('vào ván thật qua cửa sảnh', await startRun(p));
    await tools(p);
    const g = await p.evaluate(() => { const a = SK.G.pet; return { id: a.id, hp: a.hp, max: a.hpMax, dmg: a.k.dmg }; });
    check('Chilly vào ván với 20 HP (10 gốc + 10) và sát thương cắn 5 (3 gốc + 2)', g.id === 'pet0' && g.hp === 20 && g.max === 20 && g.dmg === 5, JSON.stringify(g));
    const bite = await p.evaluate(() => {
      SK.G.player.god = true; const a = SK.G.pet, G = SK.G, Q = G.props.find(q => q.pet === a), e = T.mk(a.x + 8, a.y);
      const seen = [], h0 = SK.hurtEnemy; SK.hurtEnemy = function (G2, x, dmg, ...r) { if (x === e) seen.push(dmg); return h0.call(this, G2, x, dmg, ...r); };
      try { a.cd = 0; a.scan = 0; T.step(Q, 60, 0.05, () => { e.x = a.x + 8; e.y = a.y; e.kx = e.ky = 0; }); } finally { SK.hurtEnemy = h0; }
      e.st = 'dead'; G.enemies = G.enemies.filter(x => x !== e); a.cd = 1e9;
      return seen;
    });
    check('đòn cắn đo được 5 sát thương (có +2 của Thức Ăn)', bite.length >= 1 && bite.every(v => v === 5), JSON.stringify(bite));
    const gar = await p.evaluate(() => {
      SK.G.player._gardenPets = ['plant_eator']; SK.garden.spawnPets(SK.G);
      const q = SK.G.props.filter(x => x.gardenPet).pop(), a = q.gardenPet; window.CQ = q; window.CA = a; a.cd = 1e9; return { hp: a.hpMax, dmg: a.comp.dmg };
    });
    check('thú cưng cây (Hoa Ăn Thịt) không nhận Thức Ăn: vẫn 15 HP, cắn 5 [WIKI Zongzi Flower]', gar.hp === 15 && gar.dmg === 5, JSON.stringify(gar));
    // Pet Buff
    const bf = await p.evaluate(() => {
      const G = SK.G, a = G.pet; G.player.buffs = G.player.buffs || []; if (G.player.buffs.indexOf(17) < 0) G.player.buffs.push(17);
      const n = SK.pets3.applyBuff(G), again = SK.pets3.applyBuff(G);
      return { n, again, pet: { hp: a.hp, max: a.hpMax, rm: a.restMul, gm: a.regenMul }, arum: { hp: CA.hpMax, dmg: CA.comp.dmg, cd: CA.comp.critDmg } };
    });
    check('Pet Buff (id 17): Chilly +9 HP (20 -> 29), nghỉ x0,5, hồi x2; áp một lần', bf.n === 2 && bf.again === 0 && bf.pet.max === 29 && bf.pet.hp === 29 && bf.pet.rm === 0.5 && bf.pet.gm === 2, JSON.stringify(bf));
    check('Pet Buff: Hoa Ăn Thịt +10 HP (15 -> 25), cắn 8 / bạo kích 11 [WIKI Titan Arum]', bf.arum.hp === 25 && bf.arum.dmg === 8 && bf.arum.cd === 11, JSON.stringify(bf.arum));
    const dm = await until(p, () => SK.G.pet.k.dmg === 10, null, 5000);
    check('sát thương cắn x2 của buff (rooms.js) cộng dồn sau Thức Ăn: (3+2) x 2 = 10', dm, 'k.dmg=' + await p.evaluate(() => SK.G.pet.k.dmg));
    const rs = await p.evaluate(() => {
      const G = SK.G, a = G.pet, Q = G.props.find(q => q.pet === a); a.cd = 1e9; Q.update(G, Q, 0.016);
      T.hit(a, 99); T.step(Q, 1, 0.016); const r = { hp: a.hp, restFor: a.restFor, rest: a.rest > 0 };
      let t = 0; while (a.rest > 0 && t < 30) { T.step(Q, 1, 0.05); t += 0.05; } r.t = +t.toFixed(2); r.after = a.hp; return r;
    });
    check('Pet Buff: nghỉ 7~8 s (nửa của 14~16), hết nghỉ đầy 29 HP', rs.hp === 1 && rs.rest && rs.restFor >= 7 && rs.restFor <= 8 && rs.after === 29 && rs.t >= 6.5 && rs.t <= 8.2, JSON.stringify(rs));
    const rg = await p.evaluate(() => {
      const G = SK.G, a = G.pet, Q = G.props.find(q => q.pet === a); a.cd = 1e9; a.hp = 9; a.sinceHit = 0; a.regen = 0;
      const rate = a.hpMax / SK.petHp.REGEN_FULL * a.regenMul, r = { rate: +rate.toFixed(3) }, hp0 = a.hp;
      T.step(Q, 38, 0.05); r.at19 = a.hp - hp0;          // 1,9 s: còn trong 2 s chờ
      T.step(Q, 120, 0.05); r.at8 = a.hp - hp0;          // thêm 6 s sau 2 s chờ: ~ rate * 6 + (0,1 s đã tính)
      return r;
    });
    check('hồi dần trong trận gấp đôi nhờ Pet Buff: 2 s đầu không hồi, rồi 29/30 x 2 HP mỗi giây', rg.at19 === 0 && rg.at8 === Math.floor(rg.rate * 6.1), JSON.stringify(rg));
    await p.context().close();
  } catch (e) {
    check('chạy trọn', false, (e.stack || e.message).split('\n').slice(0, 3).join(' / '));
  }
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
