/*
 * Kỹ năng riêng thú cưng pet33..pet40 của Hiệp Sĩ Linh Hồn (games/soulknight/js/pets/pet33.js … pet40.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-petskills-e.js   (SK_URL để chạy trên Pages)
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
  const live = () => p.evaluate(() => SK.G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead').length);
  // vào phòng quái, đổi sang thú cưng id, chờ quái xuất hiện
  async function setup(id, tele) {
    await p.evaluate(() => { SK_GAME.debug.stage('1-1'); });
    await sleep(400);
    await p.evaluate(i => SK.petDebug.spawn(i), id);
    if (tele) {
      await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
      await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
      await until(p, () => SK.G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead'), null, 8000);
    }
  }
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));

    // pet33 Lửa Rồng: bắn đạn phe 'p' do pet tạo
    await setup('pet33', true);
    const r33 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, hp0 = SK_GAME.enemyHp, t0 = performance.now(); let sawB = false;
      (function poll() {
        if (SK.G.bullets.some(b => b.side === 'p' && b.owner === a && b.v86 === 'fireball')) sawB = true;
        if (performance.now() - t0 > 14000 || (sawB && a.fired >= 5 && SK_GAME.enemyHp < hp0)) return res({ fired: a.fired, sawB, hp0, hp: SK_GAME.enemyHp, dmg: a.k.fireDamage });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet33 thở lửa: có đạn fireball phe p do pet tạo, máu quái giảm', r33.sawB && r33.fired >= 5 && r33.hp < r33.hp0 && r33.dmg === 10, JSON.stringify(r33));

    // pet34 Thú Khổng Lồ: bổ nhào + sóng chấn động gây skillDamage 6
    await setup('pet34', true);
    const r34 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, t0 = performance.now(); a.leapCd = 0; let hits = [];
      const f = SK.on; SK.on('enemyHit', (G, e, d) => { if (a.wave) hits.push(d); });
      (function poll() {
        if (performance.now() - t0 > 14000 || a.waveHit > 0) return res({ waves: a.waves, waveHit: a.waveHit, dmgs: hits.slice(0, 3), skillDmg: a.skillDmg });
        if (a.leapCd > 1 && !a.leapT) a.leapCd = 0;
        requestAnimationFrame(poll);
      })();
    }));
    check('pet34 bổ nhào tạo sóng, quái trúng đúng 6 sát thương', r34.waves >= 1 && r34.waveHit >= 1 && r34.skillDmg === 6 && r34.dmgs.every(d => d === 6), JSON.stringify(r34));

    // pet35 Mèo Schrödinger: dùng kỹ năng -> hồi khiên hoặc năng lượng
    await setup('pet35', false);
    const r35 = await p.evaluate(() => {
      const G = SK.G, a = G.pet, pl = G.player; let up = 0, formA = 0, formE = 0;
      for (let i = 0; i < 40; i++) {
        pl.armor = 0; pl.energy = 0; a.cdT = 0; SK.emit('skill', G, pl);
        if (a.form === 'armor') { formA++; if (pl.armor === 1 && pl.energy === 0) up++; }
        else { formE++; if (pl.energy === 5 && pl.armor === 0) up++; }
      }
      return { up, formA, formE, casts: a.casts, gA: a.gainArmor, gE: a.gainEnergy };
    });
    check('pet35 mỗi lần dùng kỹ năng: +1 khiên hoặc +5 năng lượng [WIKI Pets] (cả hai nhánh đều gặp)', r35.up === 40 && r35.formA > 0 && r35.formE > 0 && r35.gA === r35.formA && r35.gE === r35.formE * 5, JSON.stringify(r35));
    const r35b = await p.evaluate(() => { const a = SK.G.pet, pl = SK.G.player; pl.armor = pl.armorMax; pl.energy = pl.energyMax; const g0 = a.gainEnergy + a.gainArmor; for (let i = 0; i < 6; i++) { a.cdT = 0; SK.emit('skill', SK.G, pl); } return { cap: pl.armor <= pl.armorMax && pl.energy <= pl.energyMax, g: a.gainEnergy + a.gainArmor - g0 }; });
    check('pet35 không hồi vượt mức tối đa', r35b.cap && r35b.g === 0, JSON.stringify(r35b));

    // pet36 Giảm giá: tiêu vàng -> hoàn 10%
    const r35c = await p.evaluate(() => { const G = SK.G, a = G.pet, pl = G.player; a.cdT = 0; pl.armor = 0; pl.energy = 0; SK.emit('skill', G, pl); const c1 = a.casts, cd = a.cdT; SK.emit('skill', G, pl); return { c1, c2: a.casts, cd }; });
    check('pet35 hồi chiêu 3 s [WIKI Pets]: dùng kỹ năng liền lần nữa không kích', r35c.c1 === r35c.c2 - 0 && r35c.cd === 3, JSON.stringify(r35c));

    await setup('pet36', true);
    await p.evaluate(() => { const pl = SK.G.player; pl.gold = 500; });
    await sleep(200);
    const r36 = await p.evaluate(async () => {
      const a = SK.G.pet, pl = SK.G.player;
      const settle = async () => { const t0 = performance.now(); while (performance.now() - t0 < 5000 && a.lastGold !== pl.gold) await new Promise(r => setTimeout(r, 30)); await new Promise(r => setTimeout(r, 60)); };
      const spend = async n => { pl.gold -= n; await settle(); };
      pl.gold = 500; await settle(); a.spent = 0; a.refunded = 0; a.frac = 0;
      const g0 = pl.gold; await spend(100);
      const g1 = pl.gold; await spend(35); await spend(35);
      return { g0, g1, g2: pl.gold, spent: a.spent, refunded: a.refunded };
    });
    check('pet36 tiêu 100 vàng nhận lại 10', r36.g1 === r36.g0 - 90, JSON.stringify(r36));
    check('pet36 tiêu lẻ 35+35 cộng dồn phần lẻ: tổng hoàn = floor(10% tổng chi)', r36.refunded === Math.floor(r36.spent * 0.1 + 1e-9) && r36.refunded === 17 && r36.spent === 170, JSON.stringify(r36));

    // pet37 Xông Lên: cả hàng vịt xông vào quái
    await setup('pet37', true);
    const r37 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, t0 = performance.now(); a.chCd = 0;
      (function poll() {
        if (performance.now() - t0 > 30000 || a.duckHits >= 2) return res({ ducks: a.ducks.length, charges: a.charges, hits: a.duckHits, dmg: a.dmg });
        if (a.chCd > 1 && !(a.chT > 0)) a.chCd = 0;
        requestAnimationFrame(poll);
      })();
    }));
    check('pet37 đàn 5 vịt con cùng xông tới, trúng quái ≥ 2 lần với damage 3', r37.ducks === 5 && r37.charges >= 1 && r37.hits >= 2 && r37.dmg === 3, JSON.stringify(r37));

    // pet38 Torpedo: va + phản đòn nhiều lần, mỗi cú 5
    await setup('pet38', true);
    const r38 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, t0 = performance.now(); a.tCd = 99; const ds = [];
      SK.on('enemyHit', (G, e, d) => { if (a.tT > 0) ds.push(d); });
      (function poll() {
        if (performance.now() - t0 > 15000 || a.hits >= 4) return res({ runs: a.runs, hits: a.hits, imp: a.imp, ds: ds.slice(0, 4), sd: a.skillDmg });
        const pl = SK.G.player, near = Math.hypot(pl.x - a.x, pl.y - a.y) < 48;   // chờ pet vào phòng cùng chủ (cửa đóng có thể nhốt pet ở ngoài)
        if (near && a.tCd > 1 && !(a.tT > 0)) a.tCd = 0;
        requestAnimationFrame(poll);
      })();
    }));
    check('pet38 lao như Torpedo, va ≥ 3 cú (1 + phản đòn), mỗi cú 5 sát thương', r38.runs >= 1 && r38.hits >= 3 && r38.sd === 5 && r38.ds.every(d => d === 5), JSON.stringify(r38));

    // pet39 Chiêu Tài: đánh dấu, hạ dấu thì rơi vàng, trần 20/ải
    await setup('pet39', true);
    const r39 = await p.evaluate(async () => {
      const G = SK.G, a = G.pet, sl = ms => new Promise(r => setTimeout(r, ms));
      a.markCd = 0;
      for (let i = 0; i < 100 && !a.mark; i++) await sl(100);
      const marked = !!a.mark, m = a.mark;
      const coins0 = G.props.filter(q => q.coin != null || q.kind === 'coin' || (q.pickup && q.pickup === 'coin')).length;
      if (m) SK.hurtEnemy(G, m, 99999, false, 0, 0);
      await sl(200);
      return { marked, total: a.coinTotal, rewards: a.rewards, cap: a.coinCap, markCleared: a.mark !== m, coins0 };
    });
    check('pet39 đánh dấu 1 địch và hạ kịp thời thì rơi 2-5 vàng', r39.marked && r39.rewards === 1 && r39.total >= 2 && r39.total <= 5 && r39.cap === 20, JSON.stringify(r39));
    const r39b = await p.evaluate(async () => {
      const G = SK.G, a = G.pet, sl = ms => new Promise(r => setTimeout(r, ms));
      a.coinStage = 19; a.coinTotal = 0; const cdAfter = a.markCd; a.markCd = 0;
      for (let i = 0; i < 100 && !a.mark; i++) await sl(100);
      const m = a.mark; if (!m) return { none: true };
      SK.hurtEnemy(G, m, 99999, false, 0, 0); await sl(100);
      return { added: a.coinTotal, stage: a.coinStage, cdAfter };
    });
    check('pet39 trần 20 vàng mỗi ải: đang 19 chỉ rơi thêm 1; sau khi hạ dấu hồi 30 s [WIKI Pets]', !r39b.none && r39b.added === 1 && r39b.stage === 20 && r39b.cdAfter > 29, JSON.stringify(r39b));
    const r39c = await p.evaluate(async () => {
      const G = SK.G, a = G.pet, sl = ms => new Promise(r => setTimeout(r, ms));
      a.markCd = 0;
      for (let i = 0; i < 100 && !a.mark; i++) await sl(100);
      const m = a.mark; if (!m) return { none: true };
      a.markT = 0.05; for (let i = 0; i < 50 && a.mark === m; i++) await sl(100); const lost = a.mark !== m;
      const t0 = a.coinTotal; if (m.st !== 'dead') SK.hurtEnemy(G, m, 99999, false, 0, 0); await sl(100);
      return { lost, extra: a.coinTotal - t0 };
    });
    check('pet39 hết thời hạn dấu thì hạ địch không rơi vàng', !r39c.none && r39c.lost && r39c.extra === 0, JSON.stringify(r39c));

    // pet40 Búa Nhỏ: cắn có xác suất choáng
    await setup('pet40', true);
    const r40 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, t0 = performance.now(); a.chance = 1; let sawStun = false, ds = [], cdMax = 0;
      for (const e of SK.G.enemies) if (e.st !== 'dead') e.hp = e.hpMax = 9999;   // đòn búa 12 không được giết quái trước khi kịp thấy choáng
      SK.on('enemyHit', (G, e, d) => { if (G.pet === a && a.st === 'atk') ds.push(d); });
      (function poll() {
        if (a.hamCd > 0) { cdMax = Math.max(cdMax, a.hamCd); a.hamCd = 0; }   // bỏ hồi chiêu 5 s để thử nhiều lần
        if (a.stunE && a.stunE.st === 'stun' && a.stunList.some(z => z.e === a.stunE)) sawStun = true;
        if (performance.now() - t0 > 40000 || (sawStun && a.bites >= 2)) return res({ bites: a.bites, stuns: a.stuns, sawStun, sd: a.skillDmg, cdMax, ds: ds.slice(0, 6) });
        requestAnimationFrame(poll);
      })();
    }));
    check('pet40 cắn có xác suất choáng: quái vào trạng thái stun, đòn búa 12, hồi 5 s [WIKI Pets]', r40.stuns >= 1 && r40.sawStun && r40.sd === 12 && r40.ds.includes(12) && r40.cdMax > 4.5 && r40.cdMax <= 5, JSON.stringify(r40));
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
