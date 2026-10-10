/*
 * Kiểm kỹ năng riêng thú cưng pet16, pet18..pet24 (games/soulknight/js/pets/petN.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-petskills-c.js   (SK_URL để chạy trên Pages)
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

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const battle = async id => {
    await p.evaluate(i => { SK.petDebug.spawn(i); SK_GAME.debug.teleportTo('battle', 0); }, id);
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    return until(p, () => SK_GAME.enemyCount > 0 && SK.G.enemies.some(e => e.st !== 'spawn'), null, 6000);
  };
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));

    // pet16: hoá Đại Thiên Cẩu rồi đấm; hồi chiêu 16 s [WIKI Pets]
    check('pet16 vào phòng có quái', await battle('pet16'));
    const r16 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet; a.tg.cd = 0;
      const hp0 = SK.G.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0), n0 = SK.G.enemies.length;
      let big = 0, t0 = performance.now();
      (function poll() {
        if (a.scale > 1) big = Math.max(big, a.scale);
        if (a.tg.dealt || performance.now() - t0 > 10000) {
          const hp = SK.G.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
          return res({ big, dealt: a.tg.dealt, hp0, hp, n0, n: SK.G.enemies.length, st: a.st });
        }
        requestAnimationFrame(poll);
      })();
    }));
    check('pet16 phóng to 1,8 lần khi hoá Tengu', r16.big === 1.8, JSON.stringify(r16));
    check('pet16 cú đấm gây 12 (3×4), máu quái giảm', r16.dealt === 12 && r16.hp < r16.hp0, JSON.stringify(r16));
    await sleep(1500);
    check('pet16 hồi chiêu giữa hai lần hoá thân là 16 s', await p.evaluate(() => SK.G.pet.tg.cd > 14 && SK.G.pet.tg.cd <= 16), '');
    check('pet16 xong cú đấm thì về cỡ thường', await p.evaluate(() => SK.G.pet.scale === 1 && SK.G.pet.tg.mode === 0), '');

    // pet18: va chạm 1 sát thương
    check('pet18 vào phòng có quái', await battle('pet18'));
    const r18 = await p.evaluate(() => {
      const G = SK.G, a = G.pet, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn');
      a.rams = 0; a.cd = 99; a.x = e.x; a.y = e.y; e._abaT = 0;
      const h0 = e.hp; a.def.tick(G, a, 0.016);
      const h1 = e.hp; a.def.tick(G, a, 0.016);   // nhịp 0,5 s: khung kế không đánh lại
      return { h0, h1, h2: e.hp, rams: a.rams };
    });
    check('pet18 chạm quái trừ đúng 1 máu, nhịp 0,5 s chống đánh dồn', r18.h0 - r18.h1 === 1 && r18.h2 === r18.h1 && r18.rams >= 1, JSON.stringify(r18));
    const r18b = await p.evaluate(() => { const G = SK.G, a = G.pet; a.x = G.player.x; a.y = G.player.y; a.cd = 0; return a.rams; });
    await sleep(6000);
    check('pet18 vẫn cắn/đi theo bình thường (không lỗi, rams tăng hoặc giữ)', await p.evaluate(r => SK.G.pet.rams >= r, r18b), '');

    // pet19: tụ lực +5%
    await p.evaluate(() => SK.petDebug.spawn('pet19'));
    const r19 = await p.evaluate(() => {
      const G = SK.G, a = G.pet, pl = G.player, w = pl.weapons[pl.cur];
      const sv = { c: w.charging, h: w.hold };
      w.charging = true; w.hold = 0; a.def.tick(G, a, 1);
      const on = w.hold; w.charging = false; w.hold = 0; a.def.tick(G, a, 1);
      const off = w.hold; w.charging = sv.c; w.hold = sv.h || 0;
      return { on, off };
    });
    check('pet19 tụ lực 1 s thì w.hold thêm 0,05; không tụ thì 0', Math.abs(r19.on - 0.05) < 1e-9 && r19.off === 0, JSON.stringify(r19));

    // pet20: doạ quái đang đi tới chủ
    check('pet20 vào phòng có quái', await battle('pet20'));
    const r20 = await p.evaluate(() => {
      const G = SK.G, a = G.pet, pl = G.player, es = G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn' && !q.arena && !q.isBoss);
      const e = es[0]; e.st = 'move'; e.stT = 2; e.x = pl.x + 3 * 16; e.y = pl.y; e._meowT = 0;
      a.meowCd = 0; a.def.tick(G, a, 0.016);
      const near = { st: e.st, stT: e.stT, t: e._meowT };
      const cd = a.meowCd;
      e.st = 'move'; a.def.tick(G, a, 0.016);   // đang hồi chiêu: không doạ lại
      const again = e.st;
      a.meowCd = 0;
      const f = es[1] || es[0]; f._meowT = 0; f.st = 'move'; f.x = pl.x + 12 * 16; f.y = pl.y;
      if (f !== e) { e.x = pl.x + 12 * 16; a.def.tick(G, a, 0.016); }
      return { near, again, cd, far: f === e ? 'move' : f.st };
    });
    check('pet20 quái đi vào 5 đv thì khựng idle 1,2 s; kỹ năng hồi 10 s [WIKI Pets]', r20.near.st === 'idle' && Math.abs(r20.near.stT - 1.2) < 1e-6 && r20.near.t > 0 && r20.cd > 9.9 && r20.cd <= 10, JSON.stringify(r20));
    check('pet20 kỹ năng đang hồi chiêu / quái ở xa thì không bị doạ', r20.again === 'move' && r20.far === 'move', JSON.stringify(r20));

    // pet21: miễn đóng băng
    await p.evaluate(() => SK.petDebug.spawn('pet21'));
    const r21 = await p.evaluate(() => {
      const G = SK.G, a = G.pet, pl = G.player;
      a.x = pl.x + 20; a.y = pl.y; pl.frozenT = 2; a.def.tick(G, a, 0.016);
      const near = { f: pl.frozenT, im: pl.freezeImmune };
      a.x = pl.x + 20 * 16; pl.frozenT = 2; a.def.tick(G, a, 0.016);
      const far = { f: pl.frozenT, im: pl.freezeImmune };
      pl.frozenT = 0; return { near, far };
    });
    check('pet21 ở cạnh: băng bị xoá, freezeImmune=true', r21.near.f === 0 && r21.near.im === true, JSON.stringify(r21));
    check('pet21 ở xa: không miễn', r21.far.f === 2 && r21.far.im === false, JSON.stringify(r21));

    // pet22: hồi 0-5 năng lượng mỗi 20 đã dùng
    await p.evaluate(() => SK.petDebug.spawn('pet22'));
    const r22 = await p.evaluate(() => {
      const G = SK.G, a = G.pet, pl = G.player;
      pl.energy = 100; a.last = 100; a.spent = 0; a.refunded = 0;
      pl.energy -= 19; a.def.tick(G, a, 0.016); const e19 = pl.energy;
      pl.energy -= 1; a.def.tick(G, a, 0.016);   // đủ 20
      const gain1 = pl.energy - 80;
      pl.energy = 100; a.last = 100; a.spent = 0; a.refunded = 0;
      const seen = new Set(); let ok = true;
      for (let i = 0; i < 60; i++) {
        const before = pl.energy; pl.energy -= 20; a.def.tick(G, a, 0.016);
        const g = pl.energy - (before - 20); seen.add(g); if (g < 0 || g > 5) ok = false;
        pl.energy = 100; a.last = 100;
      }
      pl.energy -= 40; a.def.tick(G, a, 0.016);   // một lần dùng 40 -> 2 lần hồi
      return { e19, gain1, ok, seen: [...seen].sort() };
    });
    check('pet22 dùng 19 chưa hồi, đủ 20 thì hồi 0-5', r22.e19 === 81 && r22.gain1 >= 0 && r22.gain1 <= 5, JSON.stringify(r22));
    check('pet22 60 lần dùng 20: lượng hồi luôn 0-5 và đa dạng', r22.ok && r22.seen.length >= 4, JSON.stringify(r22.seen));

    // pet23: bình máu lúc đầy HP -> +10 năng lượng
    await p.evaluate(() => SK.petDebug.spawn('pet23'));
    const r23 = await p.evaluate(() => {
      const G = SK.G, pl = G.player;
      pl.hp = pl.hpMax; pl.energy = 50;
      G.pickups.push({ kind: 'hp_pot', x: pl.x, y: pl.y, vx: 0, vy: 0, t: 1, z: 0, vz: 0 });
      return pl.energy;
    });
    for (let i = 0; i < 10; i++) { await p.evaluate(() => { const pl = SK.G.player; pl.hp = pl.hpMax; }); await sleep(50); }   // quái trong phòng có thể làm chủ mất máu
    const r23b = await p.evaluate(() => ({ en: SK.G.player.energy, pots: SK.G.pickups.filter(k => k.kind === 'hp_pot' && !k.gone).length, w: SK.G.pet.wasted }));
    check('pet23 đầy HP uống bình máu: năng lượng 50 -> 60, bình biến mất', r23 === 50 && r23b.en === 60 && r23b.pots === 0 && r23b.w === 1, JSON.stringify(r23b));
    const r23c = await p.evaluate(() => {
      const G = SK.G, pl = G.player; pl.hp = pl.hpMax - 2; pl.energy = 50;
      G.pickups.push({ kind: 'hp_pot', x: pl.x + 100, y: pl.y, vx: 0, vy: 0, t: 1, z: 0, vz: 0 });
      G.pet.def.tick(G, G.pet, 0.016);
      const e = pl.energy; G.pickups.filter(k => k.kind === 'hp_pot').forEach(k => k.gone = true); return e;
    });
    check('pet23 thiếu HP thì không cộng năng lượng', r23c === 50, String(r23c));

    // pet24: bạo kích +5
    const r24 = await p.evaluate(() => {
      const G = SK.G, pl = G.player, c0 = pl.crit;
      SK.petDebug.spawn('pet24'); const a = G.pet;
      a.x = pl.x + 20; a.y = pl.y; a.def.tick(G, a, 0.016); const near = pl.crit;
      a.def.tick(G, a, 0.016); const twice = pl.crit;
      a.x = pl.x + 20 * 16; a.def.tick(G, a, 0.016); const far = pl.crit;
      a.x = pl.x + 20; a.def.tick(G, a, 0.016);
      SK.petDebug.spawn('pet0'); const swapped = pl.crit;
      return { c0, near, twice, far, swapped };
    });
    check('pet24 ở cạnh: crit +5, không cộng dồn, ở xa/đổi thú thì gỡ', r24.near === r24.c0 + 5 && r24.twice === r24.near && r24.far === r24.c0 && r24.swapped === r24.c0, JSON.stringify(r24));
    await p.evaluate(() => SK.petDebug.spawn('pet24'));
    await sleep(600);
    check('pet24 sau khi sinh lại, qua vòng lặp thật: crit = gốc + 5', await p.evaluate(c0 => SK.G.player.crit === c0 + 5, r24.c0), String(await p.evaluate(() => SK.G.player.crit)));
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
