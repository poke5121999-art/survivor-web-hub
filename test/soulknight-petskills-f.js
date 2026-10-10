/*
 * Kỹ năng riêng của thú cưng pet41 pet42 pet43 pet45 pet46 pet47 pet48 (games/soulknight/js/pets/petN.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-petskills-f.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : '')); }
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
  // Vào phòng quái, giữ chủ bất tử, cho quái hồi sinh bằng cách không dọn phòng.
  const toBattle = async (id, pre) => {
    await p.evaluate(([id, pre]) => {
      SK_GAME.debug.god(true);
      if (pre) new Function('SK', pre)(SK);
      SK.petDebug.spawn(id);
      SK_GAME.debug.teleportTo('battle', 0);
    }, [id, pre || '']);
    await sleep(300);
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    const ok = await until(p, () => SK_GAME.enemyCount > 0, null, 6000);
    // quái trâu để phòng không bị dọn sạch giữa lúc kiểm (kỹ năng chỉ chạy khi còn quái)
    await p.evaluate(() => { for (const e of SK.G.enemies) if (!e.boss) { e.hp = e.hpMax = 1e6; } });
    return ok;
  };
  const wait = (fn, arg, ms) => until(p, fn, arg, ms);
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261009); SK_GAME.start(); });
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));
    const reg = await p.evaluate(() => ['pet41', 'pet42', 'pet43', 'pet45', 'pet46', 'pet47', 'pet48'].map(i => !!SK.PET_SKILLS[i]));
    check('7 thú cưng đã đăng ký kỹ năng', reg.every(Boolean), JSON.stringify(reg));

    // ---- pet41: bốn vị
    for (const f of ['bean', 'egg', 'meat', 'mushroom']) {
      await p.evaluate(f => { SK.G._pet41Flavor = f; }, f);
      await toBattle('pet41');
      if (f === 'bean') {
        const r = await p.evaluate(() => { const a = SK.G.pet; return { f: a.flavor, hpMax: a.hpMax, base: a.info.attr.max_hp, scale: a.scale, armor: a.armor }; });
        check('pet41 Đậu Đỏ: HP, Thủ, thể hình tăng', r.f === 'bean' && r.hpMax === r.base + 5 && r.armor === 2 && r.scale === 1.5, JSON.stringify(r));
      }
      if (f === 'egg') {
        await p.evaluate(() => { const o = SK.spawnBullet86; window.__egg = 0; window.__eggBites = 0; SK.spawnBullet86 = function (G, side, pf, x, y, ang, op) { if (side === 'p' && op && op.owner === G.pet) window.__egg++; return o.apply(this, arguments); }; window.__eggO = o; });
        const ok = await wait(() => window.__egg >= 2, null, 20000);
        const n = await p.evaluate(() => { SK.spawnBullet86 = window.__eggO; return window.__egg; });
        check('pet41 Trứng Muối: cắn kèm 2 viên đạn phe người chơi do pet bắn', ok && n % 2 === 0, n + ' viên đã bắn');
      }
      if (f === 'meat') {
        const r = await p.evaluate(() => { const a = SK.G.pet; return { f: a.flavor, cd: a.k.cd, spd: a.k.spd, base: a.info.ctl.atk_cd, crit: a.critPct }; });
        check('pet41 Nhân Thịt: nhịp đánh nhanh hơn, chạy nhanh hơn, có bạo kích', r.f === 'meat' && r.cd < r.base && r.spd > 8 * 16 && r.crit === 30, JSON.stringify(r));
      }
      if (f === 'mushroom') {
        const r = await p.evaluate(() => {
          const a = SK.G.pet, es = SK.G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn' && !q.boss);
          let hit = 0, n = 40;
          for (let i = 0; i < n; i++) { const e = es[i % es.length]; e._db = null; if (e.st === 'stun') e.st = 'idle'; a.def.bite(SK.G, a, e, 2); if ((e._db && Object.keys(e._db).length) || e.st === 'stun') hit++; }
          return { hit, n, es: es.length };
        });
        check('pet41 Nấm Hương: khoảng 50% cú cắn gây hiệu ứng nguyên tố (cháy/độc/choáng)', r.es > 0 && r.hit >= 10 && r.hit <= 32, JSON.stringify(r));
      }
    }

    // ---- pet42: móc vật phẩm
    await toBattle('pet42');
    const d42 = await p.evaluate(() => new Promise(res => {
      const a = SK.G.pet, n0 = SK.G.pickups.length, t0 = performance.now();
      (function poll() {
        if (a.pulled >= 2 || performance.now() - t0 > 45000) res({ pulled: a.pulled, n0, n: SK.G.pickups.length, kinds: SK.G.pickups.map(k => k.kind) });
        else requestAnimationFrame(poll);
      })();
    }));
    check('pet42: trong trận móc ra vật phẩm', d42.pulled >= 2, JSON.stringify(d42));
    // vật phẩm sinh đúng 1 mỗi lần: số lần móc = số lần gọi dropPickup
    const cnt = await p.evaluate(() => { const a = SK.G.pet, c0 = a.pulled; let n = 0; const o = SK.dropPickup; SK.dropPickup = (...x) => { n++; return o(...x); }; a.pull = 0; return new Promise(r => setTimeout(() => { SK.dropPickup = o; r({ n, dp: a.pulled - c0, pull: a.pull }); }, 400)); });
    check('pet42: mỗi lần móc đúng 1 vật phẩm qua SK.dropPickup, hồi 8 s [WIKI Pets]', cnt.n === 1 && cnt.dp === 1 && cnt.pull > 7 && cnt.pull <= 8, JSON.stringify(cnt));

    // ---- pet43: sửa lỗi thắng / thua
    for (const win of [true, false]) {
      await toBattle('pet43');
      const before = await p.evaluate(() => { const pl = SK.G.player; return { d: pl.dmgMul || 1 }; });
      await p.evaluate(w => { const a = SK.G.pet; a.force = w ? 'win' : 'lose'; a.forcePick = 0; a.fixIn = 0; }, win);
      const ok = await wait(() => SK.G.pet.result, null, 25000);
      const r = await p.evaluate(() => { const a = SK.G.pet, pl = SK.G.player; return { res: a.result, d: pl.dmgMul || 1, act: a.active.length, fixIn: a.fixIn, fixT: a.fixT, en: G_en() }; function G_en() { return SK.G.enemies.map(e => e.st).join(); } });
      const want = win ? before.d * 1.2 : before.d * 0.8;
      check('pet43 (hồi 25 s [WIKI Pets]) sửa ' + (win ? 'thành công: buff sát thương +20% cho chủ' : 'thất bại: debuff sát thương -20% cho chủ'),
        ok && r.res.win === win && Math.abs(r.d - want) < 1e-6 && r.act === 1 && r.fixIn > 24 && r.fixIn <= 25, JSON.stringify({ before, r }));
      await p.evaluate(() => { SK.G.pet.active[0].t = 0.01; });
      await wait(() => SK.G.pet.active.length === 0, null, 10000);
      const back = await p.evaluate(() => (SK.G.player.dmgMul || 1));
      check('pet43: hết hạn thì chỉ số trả về như cũ', Math.abs(back - before.d) < 1e-6, back + ' vs ' + before.d);
    }

    // ---- pet45: Hỏa Lực
    await toBattle('pet45');
    const s45 = await p.evaluate(() => { const a = SK.G.pet; return { cd: a.k.cd, spd: a.k.spd, r0: SK.G.player.rateMul || 1, n: a.c.n, ns: a.c.ns }; });
    const okN = await wait(() => SK.G.pet.shots >= 3, null, 15000);
    const n45 = await p.evaluate(() => { const a = SK.G.pet; return { shots: a.shots, vol: a.volleys, mine: SK.G.bullets.filter(x => x.side === 'p' && x.owner === a).length }; });
    check('pet45: bắn loạt 3 viên đạn phe người chơi (không cắn)', okN && n45.vol >= 1 && n45.shots >= 3, JSON.stringify(n45));
    await p.evaluate(() => { const a = SK.G.pet; a.skillIn = 0; a.burst = 0; a.fireCd = 0; a.volleys = 0; a.shots = 0; });
    const on = await wait(() => SK.G.pet.on, null, 3000);
    const s45b = await p.evaluate(() => { const a = SK.G.pet; return { spd: a.k.spd, r: SK.G.player.rateMul || 1 }; });
    check('pet45 Thời Khắc Hỏa Lực: tốc chạy x2, chủ +10% tốc bắn', on && Math.abs(s45b.spd - s45.spd * 2) < 1e-6 && Math.abs(s45b.r - s45.r0 * 1.1) < 1e-6, JSON.stringify({ s45, s45b }));
    await wait(() => SK.G.pet.volleys >= 1 && SK.G.pet.burst === 0, null, 10000);
    const sh = await p.evaluate(() => ({ shots: SK.G.pet.shots, v: SK.G.pet.volleys }));
    check('pet45 Thời Khắc Hỏa Lực: loạt tăng lên 5 viên', sh.v >= 1 && sh.shots === 5 * sh.v, JSON.stringify(sh));
    await p.evaluate(() => { SK.G.pet.skillT = 0; });
    await sleep(200);
    const s45c = await p.evaluate(() => ({ on: SK.G.pet.on, spd: SK.G.pet.k.spd, r: SK.G.player.rateMul || 1, sin: SK.G.pet.skillIn }));
    check('pet45: hết thời khắc thì trả tốc độ về cũ và hồi 60 s [WIKI Pets]', !s45c.on && s45c.sin > 59 && s45c.sin <= 60 && s45c.spd === s45.spd && Math.abs(s45c.r - s45.r0) < 1e-6, JSON.stringify(s45c));

    // ---- pet46: Slime lớn lên
    await p.evaluate(() => { SK.G._p46med = false; });
    await toBattle('pet46');
    const s46 = await p.evaluate(() => ({ m: SK.G.pet.medium, sc: SK.G.pet.scale || 1, hp: SK.G.pet.hpMax }));
    const grew = await wait(() => SK.G.pet.medium, null, 8000);
    const g46 = await p.evaluate(() => ({ m: SK.G.pet.medium, sc: SK.G.pet.scale, hp: SK.G.pet.hpMax }));
    check('pet46: nhỏ lúc đầu, vào trận thì biến thành Slime Vừa (to hơn, HP gấp đôi)', !s46.m && grew && g46.sc === 1.5 && g46.hp === s46.hp * 2, JSON.stringify({ s46, g46 }));
    const burnOk = await wait(() => SK.G.enemies.some(e => e._db && e._db.fire) || SK.G.pet.burned > 0, null, 8000);
    check('pet46: thiêu đốt quái xung quanh (quái có _db.fire)', burnOk, 'burned=' + await p.evaluate(() => SK.G.pet.burned));
    const spl = await p.evaluate(() => {
      const a = SK.G.pet, es = SK.G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn');
      if (es.length < 2) return null;
      const [e, q] = es; q.x = e.x + 12; q.y = e.y; const hq = q.hp, he = q.hp;
      const d = a.def.bite(SK.G, a, e, 5);
      return { ret: d, qHp0: hq, qHp: q.hp, qDead: q.st === 'dead', splash: a.splash };
    });
    check('pet46 Vừa: cú cắn lan sang quái đứng cạnh (vùng cắn rộng)', spl && spl.splash >= 1 && (spl.qHp < spl.qHp0 || spl.qDead), JSON.stringify(spl));

    // ---- pet47: cuồng bạo
    await toBattle('pet47');
    const s47 = await p.evaluate(() => { const a = SK.G.pet; a.skillIn = 999; return { spd: a.k.spd }; });   // máy chậm: chưa cho cuồng bạo (mặc định sau 3 s) để đo phát thường
    await wait(() => SK.G.pet.shots >= 1, null, 15000);
    const n1 = await p.evaluate(() => { const a = SK.G.pet; return { shots: a.shots, dual: a.dual }; });
    check('pet47: thường bắn đơn 1 nòng, đạn phe người chơi', n1.shots >= 1 && n1.dual === 0, JSON.stringify(n1));
    await p.evaluate(() => { const a = SK.G.pet; a.skillIn = 0; });
    const on47 = await wait(() => SK.G.pet.on, null, 3000);
    const s47b = await p.evaluate(() => ({ spd: SK.G.pet.k.spd }));
    check('pet47 cuồng bạo: tốc chạy x2', on47 && Math.abs(s47b.spd - s47.spd * 2) < 1e-6, JSON.stringify({ s47, s47b }));
    await p.evaluate(() => { const a = SK.G.pet; a.fireCd = 0; a.burst = 0; });
    const dual = await wait(() => SK.G.pet.dual >= 1, null, 10000);
    const c47 = await p.evaluate(() => ({ dual: SK.G.pet.dual, crits: SK.G.pet.crits, bullets: SK.G.bullets.filter(x => x.side === 'p' && x.owner === SK.G.pet).length }));
    check('pet47 cuồng bạo: đôi AK47 (2 viên mỗi lần bóp) và bạo kích', dual && c47.crits >= 2, JSON.stringify(c47));

    // ---- pet48: sóng xung kích
    await toBattle('pet48');
    await p.evaluate(() => { const a = SK.G.pet; const e = SK.G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); window.__e48 = e; a.x = e.x - 20; a.y = e.y; a.cd = 0; window.__hp48 = e.hp; window.__x48 = e.x; });
    const sc = await wait(() => SK.G.pet.screams >= 1, null, 6000);
    const r48 = await p.evaluate(() => { const e = window.__e48; return { hp0: window.__hp48, hp: e.hp, pushed: SK.G.pet.pushed, st: e.st }; });
    check('pet48 Á!: sóng xung kích làm quái trong vùng mất máu', sc && (r48.hp < r48.hp0 || r48.st === 'dead') && r48.pushed >= 1, JSON.stringify(r48));
    const ring = await p.evaluate(() => SK.G.pet.screams);
    check('pet48: đã la ' + ring + ' lần, không cắn (a.bit chặn)', ring >= 1);
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
