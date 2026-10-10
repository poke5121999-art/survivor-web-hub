/*
 * Kỹ năng riêng của thú cưng pet8..pet15 (games/soulknight/js/pets/pet8.js … pet15.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-petskills-b.js   (SK_URL để chạy trên Pages)
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
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const spawn = id => ev(i => { const a = SK.petDebug.spawn(i); a.x = SK.G.player.x - 10; a.y = SK.G.player.y + 2; return a.id; }, id);
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => SK_GAME.debug.god(true));
    await ev(() => SK_GAME.debug.teleportTo('battle', 0));
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    await until(p, () => SK_GAME.enemyCount > 0, null, 5000);

    // ---- pet8: nhấp thật vào pet -> HP +1
    await spawn('pet8');
    await ev(() => { const a = SK.G.pet; a.k.dmg = 0; });
    await sleep(300);
    const t8 = await ev(() => {
      const G = SK.G, a = G.pet, hud = document.getElementById('sk-hud'), r = hud.getBoundingClientRect(), v = SK.view;
      return { hp: a.hp, max: a.hpMax, x: r.left + (a.x - G.view.x) * r.width / v.w, y: r.top + (a.y - 8 - G.view.y) * r.height / v.h };
    });
    await p.mouse.click(t8.x, t8.y);
    await sleep(100);
    const h8 = await ev(() => SK.G.pet.hp);
    check('pet8 nhấp vào pet: HP hiện tại +1', t8.max === 10 && h8 === t8.hp + 1, `HP ${t8.hp} -> ${h8}`);
    await p.mouse.click(5, 5);
    await sleep(100);
    check('pet8 nhấp ra ngoài pet thì HP không đổi', (await ev(() => SK.G.pet.hp)) === h8);

    // ---- pet9: hạt đậu khổng lồ, cắn dồn trong một lúc rồi thu nhỏ
    await spawn('pet9');
    await ev(() => { const a = SK.G.pet; a.skillCd = 0; a.k.dmg = 3; });
    const ok9 = await until(p, () => SK.G.pet.big, null, 15000);
    const g9 = await ev(() => { const a = SK.G.pet; return { scale: a.scale, cd: a.k.cd, base: a.baseCd, casts: a.casts }; });
    check('pet9 khi có quái: thân to ×2,5 và hồi cắn ngắn lại', ok9 && g9.scale === 2.5 && g9.cd < g9.base, JSON.stringify(g9));
    const dmg9 = await ev(() => new Promise(res => {
      const a = SK.G.pet, e0 = a.def.bite; let max = 0; const orig = a.def.bite;
      a.def.bite = (G, q, e, d) => { const r = orig(G, q, e, d); if (r > max) max = r; return r; };
      setTimeout(() => { a.def.bite = orig; res({ max, bites: a.bites }); }, 3500);
    }));
    check('pet9 đang to: một cú cắn gây 6 (gấp đôi 3)', dmg9.max === 6, JSON.stringify(dmg9));
    const gone9 = await until(p, () => !SK.G.pet.big, null, 8000);
    const s9 = await ev(() => ({ scale: SK.G.pet.scale, cd: SK.G.pet.k.cd }));
    check('pet9 hết 5 s thì thu nhỏ về 1 và hồi cắn về 2 s', gone9 && s9.scale === 1 && s9.cd === 2, JSON.stringify(s9));

    // ---- pet10: né đòn ~20%
    await spawn('pet10');
    const r10 = await ev(() => {
      const G = SK.G, a = G.pet; let hurt = 0, n = 4000;
      const pl = G.player; pl.god = false;
      for (let i = 0; i < n; i++) {
        // gọi đúng móc SK.hurtPlayer của pets.js; người chơi miễn thương thì dmg vẫn qua móc nên đếm né theo a.dodges
        pl.invulT = 0; pl.hp = pl.hpMax; pl.armor = pl.armorMax; pl.st = 'idle';
        SK.hurtPlayer(G, 1);
        if (pl.hp < pl.hpMax || pl.armor < pl.armorMax) hurt++;
      }
      pl.god = true; pl.invulT = 0; pl.hp = pl.hpMax; pl.armor = pl.armorMax;
      return { rate: a.rate, dodges: a.dodges, hits: a.hits, hurt, n };
    });
    const f10 = r10.dodges / r10.hits;
    check('pet10 né ~20% đòn đánh chủ, phần còn lại vẫn trúng', r10.rate === 0.2 && f10 > 0.16 && f10 < 0.24 && r10.hurt === r10.hits - r10.dodges,
      `né ${r10.dodges}/${r10.hits} = ${(f10 * 100).toFixed(1)}%, chủ mất máu ${r10.hurt}`);

    // ---- pet11: nhắm quái xa chủ nhất
    await ev(() => SK_GAME.debug.teleportTo('battle', 0));
    await until(p, () => SK_GAME.enemyCount > 0, null, 5000);
    await spawn('pet11');
    await ev(() => { SK.G.pet.k.dmg = 0; });
    const r11 = await ev(() => new Promise(res => {
      const G = SK.G, a = G.pet, t0 = performance.now(), seen = [];
      (function poll() {
        const pl = G.player;
        if (a.pick && !seen.includes(a.pick)) {
          const lim = a.k.far * 0.5, ds = G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead').map(e => Math.hypot(e.x - pl.x, e.y - pl.y)).filter(d => d <= lim);
          seen.push(a.pick); a.pick.maxNow = Math.max(...ds); a.pick.n = ds.length; a.pick.near = Math.min(...ds);
        }
        if (seen.length >= 3 || performance.now() - t0 > 20000) return res(seen.map(s => ({ d: Math.round(s.d), maxNow: Math.round(s.maxNow), n: s.n, near: Math.round(s.near) })));
        requestAnimationFrame(poll);
      })();
    }));
    const multi = r11.filter(s => s.n >= 2);
    check('pet11 chọn con xa chủ nhất (không phải con gần nhất)', r11.length >= 1 && r11.every(s => s.d >= s.maxNow - 24 && s.d >= s.near) && (multi.length === 0 || multi.some(s => s.d > s.near)), JSON.stringify(r11));

    // ---- pet12: gỡ giảm tốc cho chủ
    await spawn('pet12');
    const r12 = await ev(() => new Promise(res => {
      const G = SK.G, a = G.pet, pl = G.player, W = SK.world, orig = W.obstacleAt;
      W.obstacleAt = function (m, x, y) { return (Math.abs(x - pl.x) < 0.5 && Math.abs(y + 2 - pl.y) < 0.5) ? { kind: 'pad', solid: false, p: { speed_down: 1, speed_rate: 0.5 } } : orig.apply(this, arguments); };
      a.cdT = 99;   // chưa gỡ: chủ thật sự chậm
      const b0 = performance.now();
      (function pre() { if (!(pl.speedMul < 1) && performance.now() - b0 < 10000) return setTimeout(pre, 50); setTimeout(start, 200); })();
      function start() {
        const before = pl.speedMul * (pl.moveMul || 1);
        a.cdT = 0;
        const c0 = performance.now();
        (function cast() { if (a.casts < 1 && performance.now() - c0 < 15000) return setTimeout(cast, 50); go(); })();
        function go() { setTimeout(() => {
          const during = pl.speedMul * (pl.moveMul || 1), casts = a.casts;
          const w0 = performance.now();
          (function wait() { if (a.holdT > 0 && performance.now() - w0 < 30000) return setTimeout(wait, 100); fin(); })();
          function fin() { setTimeout(() => {
            const after = pl.speedMul * (pl.moveMul || 1);
            W.obstacleAt = orig;
            setTimeout(() => res({ before, during, after, casts, cdT: a.cdT, back: pl.moveMul || 1 }), 300);
          }, 300); }
        }, 300); }
      }
    }));
    check('pet12 tấm giảm tốc 0,5: trước khi gỡ chủ chậm, khi pet vỗ bụng chủ chạy tốc bình thường',
      Math.abs(r12.before - 0.5) < 0.01 && Math.abs(r12.during - 1) < 0.01 && r12.casts === 1, JSON.stringify(r12));
    check('pet12 hồi chiêu 20 s [WIKI Pets]: sau khi gỡ, cdT còn trong (15, 20]', r12.cdT > 15 && r12.cdT <= 20, 'cdT ' + r12.cdT);
    check('pet12 hết 3 s thì hết bù, moveMul về 1', r12.back === 1 && r12.after <= 0.51, `moveMul ${r12.back}, tốc hiệu dụng ${r12.after}`);

    // ---- pet13: địch sợ
    await ev(() => SK_GAME.debug.teleportTo('battle', 0));
    await until(p, () => SK_GAME.enemyCount > 0, null, 5000);
    await spawn('pet13');
    const r13 = await ev(() => new Promise(res => {
      const G = SK.G, a = G.pet, t0 = performance.now();
      const own = G.enemies.find(q => q.st !== 'spawn' && q.st !== 'dead');
      setTimeout(() => { SK.spawnBullet86(G, 'e', 'bullet_0', own.x, own.y, 0, { spd: 10, dmg: 0, owner: own, h: 6 }); }, 400);
      (function poll() {
        const marked = G.enemies.filter(e => e._fear).length, alive = G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead').length;
        if (a.slowed >= 1 || performance.now() - t0 > 25000) {
          const b = G.bullets.find(q => q._v0 && !q.dead) || G.bullets.find(q => q._v0);
          return res({ slowed: a.slowed, marked, alive, v0: b ? b._v0 : null, v1: b ? Math.hypot(b.vx, b.vy) : null });
        }
        requestAnimationFrame(poll);
      })();
    }));
    check('pet13 mọi quái bị đánh dấu sợ; đạn quái bị trừ đúng 5 đơn vị tốc (80 px/s) [WIKI Pets]', r13.marked >= 1 && r13.marked >= r13.alive && r13.slowed >= 1 && r13.v0 > 96 && Math.abs((r13.v0 - r13.v1) - 80) < 1, JSON.stringify(r13));
    const r13b = await ev(() => new Promise(res => {
      const G = SK.G, e = G.enemies.find(q => q.st !== 'spawn' && q.st !== 'dead' && q.st !== 'aim' && q.st !== 'attack' && typeof q.cd === 'number');
      if (!e) return res(null);
      e.cd = 1000; e.st = 'idle'; e.stT = 1e9;
      const t0 = G.t, c0 = e.cd;
      (function poll() { if (G.t - t0 > 1.5) return res({ drop: c0 - e.cd, secs: G.t - t0, st: e.st }); requestAnimationFrame(poll); })();
    }));
    check('pet13 bộ đếm hồi chiêu của quái trôi ~75% tốc thường', r13b && r13b.drop / r13b.secs > 0.55 && r13b.drop / r13b.secs < 0.9, JSON.stringify(r13b));

    // ---- pet14: hút máu
    await ev(() => SK_GAME.debug.teleportTo('battle', 0));
    await until(p, () => SK_GAME.enemyCount > 0, null, 5000);
    await spawn('pet14');
    await ev(() => { SK.G.pet.hp = 4; });
    const r14 = await ev(() => new Promise(res => {
      const G = SK.G, a = G.pet, t0 = performance.now();
      (function poll() { if (a.healed >= 2 || performance.now() - t0 > 25000) return res({ hp: a.hp, healed: a.healed, max: a.hpMax }); requestAnimationFrame(poll); })();
    }));
    check('pet14 mỗi cú cắn trúng hồi +1 HP cho pet (4 -> 4 + số lần cắn)', r14.healed >= 2 && r14.hp === 4 + r14.healed && r14.max === 10, JSON.stringify(r14));
    await ev(() => { SK.G.pet.hp = SK.G.pet.hpMax; SK.G.pet.healed = 0; });
    await sleep(3500);
    check('pet14 đầy HP thì không vượt hpMax', (await ev(() => SK.G.pet.hp)) === 10);

    // ---- pet15: phân mỗi 8 s, địch đạp trúng mất 2 máu
    await spawn('pet15');
    const d15 = await ev(() => { const a = SK.G.pet; a.k.dmg = 0; return a.pooT; });
    check('pet15 hẹn thả phân sau 8 s', d15 > 7.5 && d15 <= 8, 'pooT ' + d15.toFixed(2));
    await ev(() => { SK.G.pet.pooT = 0.05; });
    await until(p, () => SK.G.pet.poos.length > 0, null, 2000);
    const r15 = await ev(() => new Promise(res => {
      const G = SK.G, a = G.pet, q = a.poos[0];
      const e = G.enemies.find(x => x.st !== 'spawn' && x.st !== 'dead');
      if (!e) return res(null);
      const hp0 = e.hp, w0 = performance.now(); a.pooT = 1e9;
      (function hold() {
        if (!a.slips && performance.now() - w0 < 10000) { e.x = q.x; e.y = q.y; return requestAnimationFrame(hold); }
        res({ hp0, hp: e.hp, left: a.poos.length, slips: a.slips, dropped: a.dropped });
      })();
    }));
    check('pet15 quái đạp lên phân mất đúng 2 HP, đống phân biến mất', r15 && r15.hp0 - r15.hp === 2 && r15.slips === 1 && r15.left === 0, JSON.stringify(r15));
    const s15 = await ev(() => { const a = SK.G.pet; a.poos.push({ x: a.x, y: a.y, t: 0 }); const n = a.poos.length; a.def.stage(SK.G, a); return { n, after: a.poos.length }; });
    check('pet15 sang ải thì phân cũ bị dọn', s15.n >= 1 && s15.after === 0, JSON.stringify(s15));
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
