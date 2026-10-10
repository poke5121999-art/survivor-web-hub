/*
 * Kỹ năng riêng của thú cưng pet25..pet32 (games/soulknight/js/pets/pet25.js ... pet32.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-petskills-d.js   (SK_URL để chạy trên Pages)
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
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const spawn = id => p.evaluate(id => { const a = SK.petDebug.spawn(id); return !!a && a.id === id; }, id);
  const live = () => p.evaluate(() => { for (const e of SK.G.enemies) if (e.st !== 'dead') e.hp = Math.max(e.hp, 1e6); });
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));
    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    check('vào phòng có quái', await until(p, () => SK.G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead'), null, 8000));
    await live();

    // ---- pet25: đứng lại thì bốc cháy
    check('pet25 vào trận', await spawn('pet25'));
    await p.evaluate(() => { SK.G.pet.cd = 1e9; });
    const f25 = await until(p, () => SK.G.pet.fires > 0, null, 8000);
    const fp = await p.evaluate(() => { const f = SK.G.props.find(q => q.fire); return f ? { x: f.x, y: f.y, px: SK.G.pet.x, py: SK.G.pet.y } : null; });
    check('pet25 đứng yên ≥ 2 s thì châm lửa ngay chỗ đứng', f25 && fp && Math.hypot(fp.x - fp.px, fp.y - fp.py) < 3, JSON.stringify(fp));
    const h25 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, f = SK.G.props.find(q => q.fire), e = SK.G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn');
      if (!f || !e) return res(null);
      const h0 = e.hp, n0 = a.fireHits, t0 = performance.now();
      (function poll() { e.x = f.x; e.y = f.y; if (a.fireHits > n0 || performance.now() - t0 > 3500) return res({ dh: h0 - e.hp, hits: a.fireHits - n0 }); requestAnimationFrame(poll); })();
    }));
    check('pet25 quái đứng trong lửa bị trừ máu', h25 && h25.hits > 0 && h25.dh >= 3, JSON.stringify(h25));

    // ---- pet26: hết HP thì rút mai, chặn mọi đạn
    check('pet26 vào trận', await spawn('pet26'));
    const shoot = (dmg) => p.evaluate(dmg => new Promise(res => {
      const a = SK.G.pet, b = { side: 'e', kind: 'orb', x: a.x, y: a.y - 4, h: 2, vx: 0, vy: 0, ang: 0, dmg, repel: 0, r: 3, life: 5 };
      SK.G.bullets.push(b);
      const hp0 = a.hp;
      requestAnimationFrame(() => requestAnimationFrame(() => res({ gone: !SK.G.bullets.includes(b) || b.dead, hp0, hp: a.hp, rest: a.restFor, st: a.st })));
    }), dmg);
    const s0 = await p.evaluate(() => { const a = SK.G.pet; a.rest = 0; a.hp = 5; a.cd = 1e9; return { hp: a.hp, max: a.hpMax }; });
    check('pet26 HP gốc = attr.max_hp 10', s0.max === 10, JSON.stringify(s0));
    const r1 = await shoot(2);
    check('pet26 trúng đạn 2: HP 5 → 3, đạn biến mất, chưa rút mai', r1.gone && r1.hp === 3 && !(r1.rest > 0) && r1.st !== 'defense', JSON.stringify(r1));
    const r2 = await shoot(9);
    check('pet26 trúng đạn mạnh: máu về sàn 1 (không về 0) thì vào tư thế defense nghỉ 14~16 s', r2.gone && r2.hp === 1 && r2.rest >= 14 && r2.rest <= 16 && r2.st === 'defense', JSON.stringify(r2));
    const r3 = await shoot(9);
    check('pet26 đang rút mai: chặn đạn mạnh 9, HP không đổi', r3.gone && r3.hp === 1 && r3.st === 'defense', JSON.stringify(r3));
    await p.evaluate(() => { SK.G.pet.rest = 0.3; });
    await until(p, () => !(SK.G.pet.rest > 0), null, 20000);
    const r4 = await p.evaluate(() => ({ hp: SK.G.pet.hp, rest: SK.G.pet.rest, st: SK.G.pet.st }));
    check('pet26 hết giờ nghỉ thì ra khỏi mai, HP đầy lại', !(r4.rest > 0) && r4.hp === 10 && r4.st !== 'defense', JSON.stringify(r4));

    // ---- pet27: tìm Tế Bào (material_cell)
    check('pet27 vào trận', await spawn('pet27'));
    const c0 = await p.evaluate(() => { SK.G.pet.cellT = 0.2; return SK.profile.item('material_cell'); });
    const f27 = await until(p, () => SK.G.pet.cells >= 1, null, 5000);
    const f27b = await until(p, c0 => SK.profile.item('material_cell') > c0, c0, 8000);
    const c1 = await p.evaluate(() => ({ n: SK.profile.item('material_cell'), cells: SK.G.pet.cells }));
    check('pet27 đánh rơi Sinh Khối, chủ nhặt vào kho', f27 && f27b, `kho ${c0} → ${c1.n}, pet tìm ${c1.cells}`);

    // ---- pet28: nhặt nguyên liệu giúp
    check('pet28 vào trận', await spawn('pet28'));
    const d28 = await p.evaluate(() => {
      const G = SK.G, pl = G.player, a = G.pet;
      const U = SK.PPU;
      for (const [dx, dy] of [[9, 0], [-9, 0], [0, 8], [0, -8], [7, 6], [-7, -6]]) {
        const x = pl.x + dx * U, y = pl.y + dy * U;
        if (SK.world.los(G.map, pl.x, pl.y, x, y)) {
          SK.dropPickup(G, 'material', x, y, { key: 'material_cell', n: 1 });
          const k = G.pickups[G.pickups.length - 1]; k.vx = k.vy = 0;
          window.__k = k; a.cd = 1e9;
          return { d: Math.hypot(k.x - pl.x, k.y - pl.y) / U, n0: SK.profile.item('material_cell'), p0: a.picked };
        }
      }
      return null;
    });
    const f28 = d28 && await until(p, () => SK.G.pet.picked > 0, null, 8000);
    const e28 = await p.evaluate(() => ({ n: SK.profile.item('material_cell'), gone: !SK.G.pickups.includes(window.__k), picked: SK.G.pet.picked }));
    check('pet28 chạy tới món ngoài tầm chủ (≥ 7 đv) nhặt vào kho', d28 && d28.d > 6.5 && f28 && e28.gone && e28.n === d28.n0 + 1, JSON.stringify({ d28, e28 }));

    // ---- pet29: tăng tốc chạy
    check('pet29 vào trận', await spawn('pet29'));
    const m1 = await p.evaluate(() => { SK.G.pet.burstCd = 3; return Math.abs((SK.G.player.moveMul || 1) - 1) < 0.001; });
    const m2 = await until(p, () => SK.G.pet.burstT > 0 && Math.abs((SK.G.player.moveMul || 1) - 1.25) < 0.001, null, 30000);
    const cd29 = await p.evaluate(() => SK.G.pet.burstCd);
    check('pet29 [WIKI Pets]: ngoài đợt tăng tốc không đổi tốc; đợt tăng tốc +25% (×1,25) trong 2 s; hồi chiêu 8 s', m1 && m2 && cd29 > 7.5 && cd29 <= 8, 'moveMul=' + await p.evaluate(() => SK.G.player.moveMul) + ' cd ' + cd29);
    const m2b = await until(p, () => SK.G.pet.burstT <= 0 && Math.abs((SK.G.player.moveMul || 1) - 1) < 0.001, null, 15000);   // 2 s trong game, máy tải cao chạy chậm hơn giờ thật
    check('pet29 hết 2 s thì tốc về ×1', m2b, '');
    await spawn('pet0'); await until(p, () => Math.abs((SK.G.player.moveMul || 1) - 1) < 1e-6, null, 5000);
    const m3 = await p.evaluate(() => SK.G.player.moveMul || 1);
    check('pet29 bị thay thì gỡ buff tốc, moveMul về 1', Math.abs(m3 - 1) < 1e-6, 'moveMul=' + m3);

    // ---- pet30: tụ lực nhanh thêm 5%
    const bow = await p.evaluate(() => {
      const ws = SK.DS.weapons || {}; const id = Object.keys(ws).find(k => ws[k].w86 && ws[k].w86.fam === 'bow');
      return id && SK_GAME.debug.give(id) ? id : null;
    });
    check('có cung để thử tụ lực', !!bow, String(bow));
    await spawn('pet30');
    await p.evaluate(() => { SK.G.player.energy = SK.G.player.energyMax; SK.G.pet.cd = 1e9; });
    await p.keyboard.down('KeyJ');
    await until(p, () => { const w = SK.G.player.weapons[SK.G.player.cur]; return w.charging && w.hold > 0.3 && SK.G.pet.extra > 0.005; }, null, 15000);
    const h30 = await p.evaluate(() => { const w = SK.G.player.weapons[SK.G.player.cur], a = SK.G.pet; return { charging: !!w.charging, hold: w.hold, extra: a.extra }; });
    await p.keyboard.up('KeyJ');
    const base30 = h30.hold - h30.extra;
    check('pet30 [WIKI Pets]: cạnh chủ tụ lực cộng thêm 5% phần gốc', h30.charging && h30.extra > 0.005 && Math.abs(h30.extra / base30 - 0.05) < 0.01, JSON.stringify(h30) + ' tỉ lệ ' + (h30.extra / base30).toFixed(2));
    await sleep(500);
    await p.evaluate(() => SK_GAME.debug.give && 0);

    // ---- pet31: vòng sát thương + đánh lui
    check('pet31 vào trận', await spawn('pet31'));
    const k31 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, e = SK.G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn');
      if (!e) return res(null);
      a.cd = 1e9; a.skT = 0; e.x = a.x + 20; e.y = a.y; e.hp = 1e6;
      const h0 = e.hp, n0 = a.bursts, t0 = performance.now();
      (function poll() {
        if (a.bursts > n0) return res({ dh: h0 - e.hp, k: Math.hypot(e.kx, e.ky), skHits: a.skHits });
        if (performance.now() - t0 > 3000) return res({ none: true });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet31 quái trong vòng tròn bị trừ máu ≥ 3 và bị đánh lui', k31 && !k31.none && k31.dh >= 3 && k31.k > 30, JSON.stringify(k31));
    const sk31 = await p.evaluate(() => SK.G.pet.skT);
    check('pet31 hồi chiêu 8 s [WIKI Pets]', sk31 > 7 && sk31 <= 8, 'skT ' + sk31);

    // ---- pet32: bảo hộ khi vỡ giáp
    check('pet32 vào trận', await spawn('pet32'));
    const t32 = async armor => p.evaluate(async armor => {
      const G = SK.G, pl = G.player, U = SK.PPU;
      pl.armor = armor === 'full' ? pl.armorMax : 0;
      const b = { side: 'e', kind: 'orb', x: pl.x + 2 * U, y: pl.y - 6, h: 2, vx: 0, vy: 0, ang: 0, dmg: 1, repel: 0, r: 3, life: 5 };
      G.bullets.push(b);
      const c0 = G.pet.cleared;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const gone = !G.bullets.includes(b) || b.dead;
      b.dead = true; pl.armor = pl.armorMax;
      return { gone, cleared: G.pet.cleared - c0, armorMax: pl.armorMax };
    }, armor);
    const full = await t32('full'), broken = await t32('broken');
    check('pet32 giáp còn thì không can thiệp', !full.gone && full.cleared === 0 && full.armorMax > 0, JSON.stringify(full));
    check('pet32 giáp vỡ (0) thì xoá đạn quái trong 4 đv quanh chủ', broken.gone && broken.cleared === 1, JSON.stringify(broken));
    await sleep(400);
    const broken2 = await t32('broken'), cd32 = await p.evaluate(() => SK.G.pet.guardCd);
    check('pet32 hồi chiêu 60 s [WIKI Pets]: vỡ giáp lần nữa trong lúc hồi thì không chặn', !broken2.gone && broken2.cleared === 0 && cd32 > 58 && cd32 <= 60, JSON.stringify({ broken2, cd32 }));
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
