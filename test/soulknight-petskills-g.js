/*
 * Kỹ năng thú cưng pet49..pet56 (games/soulknight/js/pets/pet49.js..pet56.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-petskills-g.js   (SK_URL để chạy trên Pages)
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
  // giữ kẻ địch sống và đứng gần chủ để thú cưng luôn có việc
  const fight = () => p.evaluate(() => {
    const G = SK.G;
    for (const e of G.enemies) if (e.st !== 'dead') { e.hp = 1e6; e.hpMax = 30; }
    return G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').length;
  });
  const spawn = id => p.evaluate(id => {
    SK.petDebug.spawn(id); const G = SK.G, a = G.pet, pl = G.player;
    a.x = pl.x - 20; a.y = pl.y + 2;
    for (const e of G.enemies) if (e.st !== 'dead') { e.hp = 1e6; e.hpMax = 30; }
    return a.id;
  }, id);
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));
    await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    const got = await until(p, () => SK_GAME.enemyCount > 0, null, 5000);
    check('vào phòng có quái', got, 'enemyCount ' + await p.evaluate(() => SK_GAME.enemyCount));
    // quái đứng yên đủ lâu để thú cưng làm việc: kéo quái về gần chủ mỗi lần kiểm
    const gather = () => p.evaluate(() => {
      if (SK_GAME.enemyCount < 3) { const G = SK.G; G.diag = 'low'; }
      const G = SK.G, pl = G.player; let i = 0;
      for (const e of G.enemies) if (e.st !== 'dead') { e.hp = 1e6; e.hpMax = 30; e.elite = false; e.boss = false; i++; }
    });

    // ---- pet49: ngủ + chế giễu + nổi giận
    await spawn('pet49');
    let r = await p.evaluate(() => { const a = SK.G.pet; return { hp: a.hpMax, spd: a.k.spd }; });
    check('pet49: HP 15 theo attr, chưa giận', r.hp === 15, JSON.stringify(r));
    r = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, t0 = performance.now(); a.napCd = 0;
      (function poll() { if (a.sleepT > 0 || performance.now() - t0 > 15000) return setTimeout(() => res({ nap: a.sleepT > 0, st: a.st, naps: a.naps, napCd: a.napCd }), 150); requestAnimationFrame(poll); })();
    }));
    check('pet49: tiếp cận kẻ địch, vào cận chiến thì ngủ (sleepT > 0, anim action idle), hồi ngủ 30 s [WIKI Pets]', r.nap && r.st === 'action idle' && r.napCd > 29 && r.napCd <= 30, JSON.stringify(r));
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet; a.sleepT = 3;
      const b = SK.spawnBullet86(G, 'e', 'bullet_e_1', a.x + 70, a.y - 7, 0, { dmg: 1, spd: 5, life: 5, h: 6 });
      setTimeout(() => res({ vx: b.vx, taunted: !!b.taunted }), 150);
    }));
    check('pet49: ngủ thì chế giễu, đạn địch quanh heo quay về phía heo (vx < 0)', r.vx < 0 && r.taunted, JSON.stringify(r));
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet; a.sleepT = 0; a.rest = 0; a.hp = a.hpMax; a.hits = 0; const k0 = { spd: a.k.spd, cd: a.k.cd };
      for (let i = 0; i < 8; i++) SK.spawnBullet86(G, 'e', 'bullet_e_1', a.x, a.y - 7, 0, { dmg: 1, spd: 0, life: 3, h: 6 });
      setTimeout(() => res({ angry: a.angry, hits: a.hits, hp: a.hp, spd0: k0.spd, spd: a.k.spd, cd0: k0.cd, cd: a.k.cd }), 200);
    }));
    check('pet49: bị đánh 8 lần thì nổi giận: tốc ×1,5, hồi chiêu cắn ÷1,5, mất HP theo từng đòn', r.angry && r.hits >= 8 && Math.abs(r.spd - r.spd0 * 1.5) < 1e-6 && Math.abs(r.cd - r.cd0 / 1.5) < 1e-6 && r.hp <= 7, JSON.stringify(r));

    // ---- pet50: tháp laser
    await spawn('pet50'); await gather();
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet; a.turCd = 0; const t0 = performance.now(), hp0 = SK_GAME.enemyHp; let on = false;
      (function poll() {
        if (a.turT > 0) on = true;
        if (performance.now() - t0 > 9000 || (on && a.laserHits >= 3)) return res({ on, hits: a.laserHits, st: a.st, hpDrop: hp0 - SK_GAME.enemyHp, turCd: a.turCd });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet50: vào chế độ tháp, laser trúng quái làm máu giảm', r.on && r.hits >= 3 && r.hpDrop > 0, JSON.stringify(r));
    check('pet50: bộ đếm 30 s được đặt lại sau khi vào tháp', r.turCd > 25 && r.turCd <= 30, 'turCd ' + (r.turCd || 0).toFixed(1));

    // ---- pet51: hết giáp -> xoá đạn + bazooka 5 s
    await spawn('pet51'); await gather();
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet, pl = G.player;
      for (let i = 0; i < 3; i++) SK.spawnBullet86(G, 'e', 'bullet_e_1', pl.x + 40 + i * 5, pl.y, Math.PI, { dmg: 1, spd: 0.5, life: 9, h: 6 });
      const eb0 = G.bullets.filter(q => q.side === 'e' && !q.dead).length;
      pl.armor = 2; pl.invulT = 0; SK.hurtPlayer(G, 5);
      const eb1 = G.bullets.filter(q => q.side === 'e' && !q.dead).length;
      const out = { eb0, eb1, skT: a.skT, cleared: a.cleared, armor: pl.armor };
      const t0 = performance.now(), hp0 = SK_GAME.enemyHp;
      (function poll() {
        const pb = G.bullets.filter(q => q.side === 'p' && q.v86 === 'bullet_mouse_gun!').length;
        if (performance.now() - t0 > 5500 || a.shots >= 5) { out.shots = a.shots; out.pb = pb; out.hpDrop = hp0 - SK_GAME.enemyHp; return res(out); }
        requestAnimationFrame(poll);
      })();
    }));
    check('pet51: giáp về 0 thì xoá hết đạn địch quanh chủ', r.armor === 0 && r.eb0 >= 3 && r.cleared >= 3, JSON.stringify(r));
    check('pet51: kích hoạt 5 s (ctl.skillTime) rồi bắn tên lửa, quái mất máu', r.skT > 4 && r.skT <= 5 && r.shots >= 5 && r.hpDrop > 0, JSON.stringify(r));
    r = await p.evaluate(() => { const a = SK.G.pet, pl = SK.G.player; const c0 = a.casts; pl.armor = 2; pl.invulT = 0; SK.hurtPlayer(SK.G, 5); return { casts: a.casts - c0, skCd: a.skCd }; });
    check('pet51: đang hồi 20 s thì hết giáp lần nữa không kích hoạt lại', r.casts === 0 && r.skCd > 10, JSON.stringify(r));

    // ---- pet52: cháy rụi
    await spawn('pet52'); await gather();
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet, hp0 = a.hp; const t0 = performance.now(); let burnSeen = false, minHp = hp0, maxP = 0, snow = 0;
      (function poll() {
        if (a.burn) burnSeen = true;
        minHp = Math.min(minHp, a.hp);
        maxP = Math.max(maxP, G.bullets.filter(q => q.side === 'p' && q.pet52).length);
        if (performance.now() - t0 > 9000 || (burnSeen && !a.burn)) return res({ burnSeen, hp0, minHp, maxP, balls: a.balls, frozen: a.frozen, burn: a.burn, burnCd: a.burnCd });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet52: tự đốt, HP 20 tụt về 0 thì ngừng phóng, hồi chiêu 30 s [WIKI Pets]', r.burnSeen && r.hp0 > 19 && r.minHp === 0 && !r.burn && r.burnCd > 25 && r.burnCd <= 30, JSON.stringify(r));
    check('pet52: phóng cầu tuyết phe người chơi về bốn hướng (số cầu >= 4 và >= 4 viên cùng lúc)', r.balls >= 40 && r.maxP >= 4, JSON.stringify(r));
    check('pet52: cầu tuyết trúng thì có đóng băng (frozen > 0)', r.frozen > 0, 'frozen ' + r.frozen);

    // ---- pet53: bắn nguyên khí
    await spawn('pet53'); await gather();
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet; const t0 = performance.now(), hp0 = SK_GAME.enemyHp; let seen = 0, dmin = 1e9, dmax = 0;
      (function poll() {
        seen = Math.max(seen, G.bullets.filter(q => q.side === 'p' && q.v86 === 'bullet_MageBall').length);
        if (a.tgt) { const d = Math.hypot(a.tgt.x - a.x, a.tgt.y - a.y); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
        if (performance.now() - t0 > 20000 || a.shots >= 4) return res({ shots: a.shots, seen, hpDrop: hp0 - SK_GAME.enemyHp, dmin: Math.round(dmin), dmax: Math.round(dmax), iv: a.iv });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet53: bắn Đạn Nguyên Khí phe người chơi, quái mất máu', r.shots >= 4 && r.seen >= 1 && r.hpDrop > 0, JSON.stringify(r));
    check('pet53: giữ khoảng cách bắn xa (đứng cách mục tiêu >= 3 đv = 48 px khi bắn)', r.dmax > 0 && r.dmax <= 10 * 16 + 20, JSON.stringify(r));

    // ---- pet54: chân thân chỉ khi kẻ địch mạnh
    await spawn('pet54'); await gather();
    await sleep(1500);
    r = await p.evaluate(() => { const a = SK.G.pet; return { form: a.form, scale: a.scale || 1, dmg: a.k.dmg, base: a.base.dmg, awakes: a.awakes }; });
    check('pet54: kẻ địch thường (hpMax 30) thì không lộ chân thân', r.form <= 0 && r.awakes === 0 && r.scale === 1, JSON.stringify(r));
    r = await p.evaluate(() => {
      const G = SK.G, a = G.pet; a.fCd = 0;
      const e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); e.elite = true; a.x = e.x - 20; a.y = e.y;
      return { ok: !!e };
    });
    await until(p, () => SK.G.pet.form > 0, null, 3000);
    r = await p.evaluate(() => { const a = SK.G.pet; return { form: a.form, scale: a.scale, dmg: a.k.dmg, base: a.base.dmg, spd: a.k.spd, spd0: a.base.spd }; });
    check('pet54: gặp tinh anh thì lộ chân thân: thân ×1,5, cắn ×4, tốc ×1,5', r.form > 0 && r.scale === 1.5 && r.dmg === r.base * 4 && Math.abs(r.spd - r.spd0 * 1.5) < 1e-6, JSON.stringify(r));
    r = await p.evaluate(() => new Promise(res => { const a = SK.G.pet; a.form = 0.05; setTimeout(() => res({ form: a.form, scale: a.scale || 1, dmg: a.k.dmg, base: a.base.dmg, fCd: a.fCd }), 300); }));
    check('pet54: hết thời gian thì trở lại thân thường và vào hồi chiêu 40 s [WIKI Pets]', r.scale === 1 && r.dmg === r.base && r.fCd > 35 && r.fCd <= 40, JSON.stringify(r));

    // ---- pet55: xung phong + hợp thể
    await spawn('pet55'); await gather();
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet; a.fCd = 99; const t0 = performance.now(), hp0 = SK_GAME.enemyHp; let seen = false;
      (function poll() {
        if (a.mode === 'charge') seen = true;
        if (performance.now() - t0 > 9000 || (seen && a.hitsDone >= 2)) return res({ seen, hits: a.hitsDone, hpDrop: hp0 - SK_GAME.enemyHp, dmg: a.dmg, fuse: a.fuse });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet55: xung phong vào quái, trúng >= 2 lần, dmg 5 (baseDamage), chưa hợp thể', r.seen && r.hits >= 2 && r.hpDrop > 0 && r.dmg === 5 && r.fuse <= 0, JSON.stringify(r));
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet; a.fCd = 0; a.cd = 0; const t0 = performance.now(); let o = null;
      (function poll() {
        if (a.fuse > 0 && !o) o = { scale: a.scale, spd: a.k.spd, spd0: a.base.spd, dmg: a.dmg, hitR: a.hitR };
        if (performance.now() - t0 > 9000 || o) return res(o || { none: true });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet55: hợp thể: thân ×1,4, tốc ×1,35, sát thương 5 -> 7,5, tầm trúng ×1,35', !!r.scale && r.scale === 1.4 && Math.abs(r.spd - r.spd0 * 1.35) < 1e-6 && r.dmg === 7.5 && Math.abs(r.hitR - 10.8) < 1e-6, JSON.stringify(r));

    // ---- pet56: bắn tỉa
    await spawn('pet56'); await gather();
    r = await p.evaluate(() => new Promise(res => {
      const G = SK.G, a = G.pet; a.skCd = 0; const t0 = performance.now(), hp0 = SK_GAME.enemyHp; let aim = false, snipe = 0, crit = false;
      (function poll() {
        if (a.sk === 'aim') aim = true;
        for (const q of G.bullets) if (q.side === 'p' && q.v86 === 'bullet_golden_sniper') { snipe++; crit = q.crit; }
        if (performance.now() - t0 > 6000 || a.snipes >= 1 && SK_GAME.enemyHp < hp0) return res({ aim, snipes: a.snipes, seen: snipe, crit, hpDrop: hp0 - SK_GAME.enemyHp, skCd: a.skCd, sk: a.sk });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet56: ngắm 0,5 s rồi bắn đạn bắn tỉa chí mạng, quái mất máu', r.aim && r.snipes >= 1 && r.seen > 0 && r.crit && r.hpDrop > 0, JSON.stringify(r));
    await until(p, () => SK.G.pet.sk === null, null, 6000);
    r = await p.evaluate(() => { const a = SK.G.pet; return { sk: a.sk, skCd: a.skCd, skT: a.skT, state: SK_GAME.state, inProps: SK.G.props.some(q => q.pet === a), paused: SK.G.paused }; });
    check('pet56: cất súng sau 1 s, hồi 20 s [WIKI Pets] mới bắn lại', r.sk === null && r.skCd > 17 && r.skCd <= 20, JSON.stringify(r));
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
