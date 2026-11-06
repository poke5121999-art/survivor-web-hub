/*
 * Kiểm 14 thiên phú của cây trồng ở Vườn (games/soulknight/js/plantbuff.js; BuffId 2170..2184, không có 2176).
 * Phần 1: đi đúng đường thật: trồng -> tưới -> qua đêm -> thu (SK.garden) -> vào ván -> 14 buff có sẵn, có tên/mô tả, không chiếm ô, không vào bể bốc.
 * Phần 2: mỗi buff cấp qua SK_ROOMS.takeBuff, kích bằng sự kiện/lõi thật (SK.hurtPlayer, SK.hurtEnemy, sự kiện 'skill' / 'fire', vòng điều khiển mỗi bước),
 * đo bằng số cụ thể (sát thương, số vật sinh ra, thời lượng, hồi chiêu).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-plantbuff.js     (SK_URL để đổi địa chỉ; SK_ONLY=2170,2181 để chạy riêng)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);

const BASE = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const ONLY = (process.env.SK_ONLY || '').split(',').filter(Boolean).map(Number);
const want = id => !ONLY.length || ONLY.indexOf(id) >= 0;
const IDS = [2170, 2171, 2172, 2173, 2174, 2175, 2177, 2178, 2179, 2180, 2181, 2182, 2183, 2184];
const SEEDS = { 2170: 'rosemary', 2171: 'lavender', 2172: 'silver_poplar', 2173: 'roselle', 2174: 'qilixiang', 2175: 'rainbow_grass', 2177: 'clivia', 2178: 'firecracker',
  2179: 'lithiumflower', 2180: 'ginseng', 2181: 'blackrose', 2182: 'nepenthes', 2183: 'monotropa', 2184: 'flatpeach' };

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(60); }
  return false;
}
const IGNORE = /bosses86|theme|lib|colour/;
const errs = [];
const J = o => JSON.stringify(o);

// ---------------------------------------------------------------------------- phần 1: trồng -> thu -> vào ván
async function chain(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const inv = {};
  for (const id of IDS) inv['plant_' + SEEDS[id] + '_seed'] = 1;
  await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } },
    { gems: 0, welcomed: 1, unlocked: ['knight'], inv });
  await p.goto(BASE);
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 15000);
  await sleep(500);
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));      // như người chơi: bấm Kỵ Sĩ -> Bắt đầu -> đi bộ trong sảnh
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
  const r = await p.evaluate(ids => {
    const out = { harvest: [], texts: [] };
    const seeds = ids.map(id => Object.keys(SK_GARDEN.plants).find(k => SK_GARDEN.plants[k].product.id === id));
    out.seeds = seeds;
    for (let b = 0; b < seeds.length; b += 3) {
      const batch = seeds.slice(b, b + 3);
      batch.forEach((s, i) => SK.garden.plant(i, s));
      batch.forEach((s, i) => SK.garden.water(i));
      SK.garden.debugNextDay();
      batch.forEach((s, i) => out.harvest.push(SK.garden.harvest(i)));
    }
    out.buffs = SK.garden.state().buffs.slice();
    out.dup = SK.garden.plant(0, 'plant_rosemary_seed');
    return out;
  }, IDS);
  check('14 cây (hạt từ kho thật) trồng, tưới, qua đêm, thu: cả 14 thu được, không báo "chưa có ở bản web"', r.harvest.length === 14 && r.harvest.every(h => h.ok) && !r.harvest.some(h => /chưa có ở bản web/.test(h.text)),
    J(r.harvest.filter(h => !h.ok)));
  check('hàng chờ ván kế giữ đúng 14 id 2170..2184 (trừ 2176)', J(r.buffs.slice().sort()) === J(IDS), r.buffs.join(','));
  check('thu xong cây biến mất (Nhanh): ô trồng lại được, hạt Hương Thảo đã dùng hết', !r.dup.ok && /Không có đồ có thể trồng/.test(r.dup.text), r.dup.text);
  // vào ván bằng cổng thật ở sảnh
  await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
  await p.keyboard.down('KeyW');
  await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
  await p.keyboard.up('KeyW');
  await p.click('#hs-mode-go');
  const started = await until(p, () => SK.G.state === 'stage' && !!SK.G.player, null, 8000);
  const R = await p.evaluate(ids => {
    const pl = SK.G.player, RO = SK.ROOMS;
    const pool = {};
    for (const [lv, th] of [[2, 'forest'], [6, 'castle'], [11, 'volcano']]) for (const x of RO.poolFor(lv, th).pool) pool[x[0]] = 1;
    return { buffs: pl.buffs.slice(), slots: RO.buffSlots(), base: RO.BUFF_SLOTS, pb: !!(pl.pb), left: SK.garden.state().buffs.length,
      names: ids.map(i => RO.buffName(i)), descs: ids.map(i => RO.buffDesc(i)), icons: ids.map(i => RO.buffIcon(i)),
      inPool: ids.filter(i => pool[i]), active: ids.every(i => RO.DEF[i] && RO.DEF[i].active), ctl: SK.G.props.filter(q => q.pbctl).length };
  }, IDS);
  check('vào ván: cả 14 thiên phú cây có sẵn trong p.buffs, hàng chờ trống', started && IDS.every(i => R.buffs.indexOf(i) >= 0) && R.left === 0, R.buffs.join(','));
  check('14 buff cây không chiếm ô: ô thiên phú = gốc + 14', R.slots === R.base + 14, R.slots + ' / ' + R.base);
  check('tên Việt khác "Buff <id>", mô tả không còn "{n}" và không lộ nhãn nguồn',
    R.names.every(n => n && !/^Buff \d+$/.test(n)) && R.descs.every(d => d.length > 20 && !/\{\d+\}/.test(d) && !/\[(LOC|WIKI|ĐO|ƯỚC LƯỢNG)/.test(d)), R.names.join(' | '));
  check('có khung biểu tượng trong atlas (ui_buff_x) và bộ điều khiển được đặt', R.icons.every(i => !!i) && R.ctl >= 1, R.icons[0] + ' ctl=' + R.ctl);
  check('không nằm trong bể bốc / cửa hàng (chỉ trồng mới có)', R.inPool.length === 0 && R.active, R.inPool.join(','));
  await ctx.close();
}

// ---------------------------------------------------------------------------- phần 2: luật
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (!ONLY.length) await chain(b);

    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const ev = (fn, arg) => p.evaluate(fn, arg);
    await p.goto(BASE + '?quick=1&themes=forest,castle,volcano');
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 4000);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });

    async function fresh(buffs, o) {
      await ev(() => { SK.startRun('knight'); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
      await until(p, () => SK_GAME.state === 'stage', null, 3000);
      await ev(() => { Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null }); SK_GAME.debug.stage('1-3'); });
      await until(p, () => SK_GAME.phase === 'play', null, 4000);
      await ev(([bs, o]) => {
        const G = SK.G, pl = G.player;
        pl.buffs = []; pl.bm = {}; pl.pb = { cd: {} }; pl.statues = []; pl.rateMul = 1; pl.crit = 0; pl.dmgMul = 1; pl.hp = pl.hpMax; pl.energy = pl.energyMax;
        G.enemies.length = 0; G.bullets.length = 0; G.mercs = [];
        G.props = G.props.filter(q => !(q.pbfx || q.pbAlly || q.cracker || q.tornado || q.pbpool || q.soul || q.gardenPet || q.sculpt || q.nova));
        pl.god = !!(o && o.god); pl.invulT = 0; SK.plantbuff.forceEl = null;
        for (const k of bs) SK_ROOMS.takeBuff(k);
      }, [buffs, o || null]);
    }
    // Kẻ địch đứng yên; mỗi phần tử [dx, dy, hp, cờ]. Trả về số lượng.
    const spawn = list => ev(list => {
      const G = SK.G, pl = G.player;
      for (const [dx, dy, hp, f] of list) {
        const e = SK.makeEnemy(G, 'e_orc01', pl.x + dx, pl.y + dy, G.room);
        e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = hp; if (f) Object.assign(e, f); G.enemies.push(e);
      }
      return G.enemies.length;
    }, list);
    const E = i => ev(i => { const e = SK.G.enemies[i]; return { hp: e.hp, x: e.x, y: e.y, st: e.st, mm: e.moveMul, db: e._db ? Object.keys(e._db).filter(k => e._db[k].t > 0) : [], slow: e._pbSlow, frost: e._pbFrost, mark: e._pbMark > SK.G.t }; }, i);
    const PB = () => ev(() => { const s = SK.G.player.pb; return JSON.parse(JSON.stringify(s, (k, v) => (v && v.b) ? undefined : v)); });
    // đòn không gắn nhãn = đòn vũ khí
    const wHit = (i, dmg, crit) => ev(([i, d, c]) => { const e = SK.G.enemies[i]; return SK.hurtEnemy(SK.G, e, d, !!c, 0, 0); }, [i, dmg, crit]);

    // ================================================================ 2170 Tân Tinh Thần Thánh
    if (want(2170)) {
      await fresh([2170]);
      await spawn([[60, 0, 100], [400, 0, 100]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, B = [];
        pl.hp = 10; pl.armor = 0; pl.invulT = 0;
        G.bullets.push({ side: 'e', x: pl.x + 40, y: pl.y - 6, vx: 0, vy: 0, dmg: 1, r: 2, life: 9 }, { side: 'e', x: pl.x + 500, y: pl.y - 6, vx: 0, vy: 0, dmg: 1, r: 2, life: 9 });
        const a = SK.hurtPlayer(G, 3, 0, 0);               // không chí mạng: không tung
        const n0 = pl.pb.holyN || 0, hp0 = pl.hp;
        pl.invulT = 0; pl.hp = 3; pl.armor = 0;
        const hit = SK.hurtPlayer(G, 5, 0, 0);              // chí mạng: tung
        return { a, n0, hp0, hit, hp: pl.hp, hpMax: pl.hpMax, cd: pl.pb.cd.holy, near: G.enemies[0].hp, far: G.enemies[1].hp, st0: G.enemies[0].st,
          eb: G.bullets.filter(q => q.side === 'e' && !q.dead).length, inv: pl.invulT };
      });
      check('Tân Tinh: đòn thường không tung (n=0); đòn chí mạng bị miễn (trả false), hồi 50% máu tối đa làm tròn lên, hồi chiêu 300 s',
        r.a === true && r.n0 === 0 && r.hp0 === 7 && r.hit === false && r.hp === Math.min(r.hpMax, 3 + Math.ceil(r.hpMax / 2)) && Math.abs(r.cd - 300) < 1 && r.inv > 0, J(r));
      check('Tân Tinh: 200 sát thương quái trong 20 ô (100 máu → chết), quái cách 25 ô giữ 100 máu, đạn địch trong tầm bị xoá, đạn xa còn', r.near <= 0 && r.st0 === 'dead' && r.far === 100 && r.eb === 1, J([r.near, r.far, r.eb]));
      const r2 = await ev(() => { const G = SK.G, pl = G.player; pl.god = true; pl.invulT = 0; pl.hp = 3; SK.hurtPlayer(G, 50, 0, 0); return { n: pl.pb.holyN, hp: pl.hp }; });
      check('Tân Tinh: trong hồi chiêu đòn chí mạng không được miễn lần hai (holyN vẫn 1; god giữ 1 máu)', r2.n === 1 && r2.hp === 1, J(r2));
    }

    // ================================================================ 2171 Đả Kích Linh Hồn
    if (want(2171)) {
      await fresh([2171]);
      await spawn([[30, 0, 1], [30, 6, 1], [-30, 0, 1]]);
      const dr = await ev(() => {
        const G = SK.G, out = [];
        for (let i = 0; i < 3; i++) { const before = G.props.filter(q => q.soul).length; SK.hurtEnemy(G, G.enemies[i], 5, false, 0, 0); out.push(G.props.filter(q => q.soul).length - before); }
        return out;
      });
      check('Quái chết rơi 2-4 linh hồn mỗi con', dr.every(n => n >= 2 && n <= 4), dr.join(','));
      await sleep(2200);
      const got = await ev(() => ({ souls: SK.G.player.pb.souls, left: SK.G.props.filter(q => q.soul).length }));
      const tot = dr.reduce((a, c) => a + c, 0);
      check('Linh hồn bay tới người trong 5 ô và được nhặt: đủ ' + tot + ' (tối đa 12)', got.souls === Math.min(12, tot) && got.left === 0, J(got));
      await ev(() => { const G = SK.G; G.enemies.length = 0; });
      await spawn([[30, 0, 500], [50, 0, 500], [400, 0, 500, null]]);
      const big = await ev(() => { const G = SK.G, e = G.enemies[0]; e.elite = true; const n0 = G.props.filter(q => q.soul).length; e.hp = 1; SK.hurtEnemy(G, e, 5, false, 0, 0); return G.props.filter(q => q.soul).length - n0; });
      check('Tinh anh rơi 4, 6 hoặc 8 linh hồn', [4, 6, 8].indexOf(big) >= 0, 'n=' + big);
      await ev(() => { SK.G.props = SK.G.props.filter(q => !q.soul); SK.G.player.pb.souls = 11; });
      await spawn([[30, 0, 500]]);   // không phải chỗ đã chết
      const r = await ev(() => {
        const G = SK.G, pl = G.player, A = G.enemies.find(e => e.hp === 500 && e.st !== 'dead'), Bn = G.enemies.find(e => e !== A && e.hp === 500 && e.st !== 'dead' && Math.hypot(e.x - A.x, e.y - A.y) < 40);
        const far = G.enemies[2];
        pl.pb.souls = 11; SK.hurtEnemy(G, A, 5, false, 0, 0);
        const n11 = { a: A.hp, souls: pl.pb.souls, strikes: pl.pb.strikes || 0 };      // 11 linh hồn: chưa tung
        pl.pb.souls = 12; const hpA = A.hp, hpB = Bn ? Bn.hp : null; SK.hurtEnemy(G, A, 5, false, 0, 0);
        return { n11, a: hpA - A.hp, b: hpB != null ? hpB - Bn.hp : null, far: far.hp, souls: pl.pb.souls, strikes: pl.pb.strikes, last: pl.pb.lastStrike };
      });
      check('11 linh hồn: chưa tung; đủ 12: đòn kế gây 5 + 60 lên mục tiêu, 25% (15) lên quái bên cạnh, quái xa 0, linh hồn về 0',
        r.n11.a === 495 && r.n11.souls === 11 && r.n11.strikes === 0 && r.a === 65 && r.b === 15 && r.far === 500 && r.souls === 0 && r.strikes === 1, J(r));
      const g = await ev(() => { const pl = SK.G.player; pl.pb.strikes = 100; pl.pb.souls = 12; const A = SK.G.enemies.find(e => e.st !== 'dead' && e.hp > 100 && e.hp < 500) || SK.G.enemies.find(e => e.st !== 'dead' && e.hp > 100); SK.hurtEnemy(SK.G, A, 1, false, 0, 0); return pl.pb.lastStrike; });
      check('Mỗi lần tung tăng vĩnh viễn 0,5%: sau 100 lần là 60×1,5 = 90 sát thương, AoE 23 (làm tròn 22,5)', g && g.dmg === 90 && g.aoe === 23, J(g));
      const sk = await ev(() => { const pl = SK.G.player; pl.pb.souls = 12; const A = SK.G.enemies.find(e => e.st !== 'dead' && e.hp > 100), h = A.hp; SK.G._skHit = 'skill'; SK.hurtEnemy(SK.G, A, 1, false, 0, 0); SK.G._skHit = null; return { d: h - A.hp, souls: pl.pb.souls }; });
      check('Đòn kỹ năng (nhãn skill) không tung Đả Kích: giữ 12 linh hồn', sk.d === 1 && sk.souls === 12, J(sk));
    }

    // ================================================================ 2172 Vòng Băng
    if (want(2172)) {
      await fresh([2172]);
      await spawn([[50, 0, 100], [300, 0, 100]]);
      await sleep(200);
      const r = await ev(() => {
        const G = SK.G, pl = G.player; pl.invulT = 0; const hp = pl.hp, ar = pl.armor, blk0 = pl.pb.block;
        const hit = SK.hurtPlayer(G, 2, 0, 0);
        return { blk0, hit, dhp: hp - pl.hp, dar: ar - pl.armor, blk: pl.pb.block };
      });
      await sleep(150);
      const near = await E(0), far = await E(1);
      check('Vòng Băng: 1 tầng khiên đỡ nguyên đòn (không mất máu/giáp), tầng về 0', r.blk0 === 1 && r.hit === false && r.dhp === 0 && r.dar === 0 && r.blk === 0, J(r));
      check('Vòng Băng: quái trong 5 ô chậm một nửa (moveMul 0,5, lạnh 5 s); quái cách 18 ô không bị', near.mm === 0.5 && near.slow > 4 && near.frost > 4 && far.slow == null && far.frost == null, J([near, far]));
      const r2 = await ev(() => { const G = SK.G, pl = G.player; pl.invulT = 0; const hp = pl.hp, ar = pl.armor; const hit = SK.hurtPlayer(G, 2, 0, 0); return { hit, d: (hp - pl.hp) + (ar - pl.armor) }; });
      check('hết tầng thì nhận đòn bình thường (mất 2)', r2.hit === true && r2.d === 2, J(r2));
      await ev(() => { const pl = SK.G.player; pl.pb.blockCd = 9.8; });
      await until(p, () => SK.G.player.pb.block === 1, null, 1500);
      const r3 = await ev(() => SK.G.player.pb.block);
      check('Mỗi 10 s hồi 1 tầng (đặt đếm 9,8 s → sau ~0,2 s có tầng)', r3 === 1, 'block=' + r3);
      await ev(() => { SK.G.player.invulT = 0; SK.hurtPlayer(SK.G, 2, 0, 0); });
      const e2 = await E(0);
      check('vòng thứ hai lên quái đang lạnh thì đóng băng (có trạng thái ice, đứng yên)', e2.db.indexOf('ice') >= 0 && e2.st === 'stun', J(e2));
    }

    // ================================================================ 2173 Phun Lửa
    if (want(2173)) {
      await fresh([2173]);
      await spawn([[48, 0, 100], [40, 40, 100], [-80, 0, 100]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, s = pl.pb; s.dir = 0;
        const a = SK.plantbuff.dragonBreath(pl, s);
        const E0 = G.enemies.map(e => e.hp), burn = !!(G.enemies[0]._db && G.enemies[0]._db.fire);
        const b = SK.plantbuff.dragonBreath(pl, s);
        return { a, b, E0, burn, E1: G.enemies.map(e => e.hp) };
      });
      check('Phun Lửa lần 1: quái trước mặt trong quạt −5 và bốc cháy; quái lệch quạt và quái sau lưng 0', r.a.hits === 1 && r.a.booms === 0 && r.E0[0] === 95 && r.burn && r.E0[1] === 100 && r.E0[2] === 100, J(r));
      check('Phun Lửa lần 2: quái đang cháy trúng lần nữa thì nổ 33 sát thương cho quái trong 3 ô (cả quái lệch quạt cạnh nó), quái sau lưng 0', r.b.booms === 1 && r.E1[0] === 62 && r.E1[1] === 67 && r.E1[2] === 100, J(r.E1));
      await ev(() => { SK.G.player.pb.dragonN = 0; SK.G.player.pb.dragonCd = 0.05; });
      await sleep(400);
      const n = await ev(() => ({ n: SK.G.player.pb.dragonN, cd: SK.G.player.pb.dragonCd }));
      check('Tự phun mỗi 3 s khi có quái (dragonCd về 3 sau lần phun)', n.n === 1 && n.cd > 2.4 && n.cd <= 3, J(n));
    }

    // ================================================================ 2174 Lốc Xoáy
    if (want(2174)) {
      await fresh([2174]);
      const r0 = await ev(() => {
        const G = SK.G, pl = G.player, s = pl.pb; s.last = [pl.x, pl.y]; s.walk = SK.plantbuff.TL.tornado.dist * SK.TILE - 3;
        const before = G.props.filter(q => q.tornado).length; pl.x += 6;
        return { before };
      });
      await sleep(250);
      const r1 = await ev(() => ({ n: SK.G.props.filter(q => q.tornado).length, N: SK.G.player.pb.tornadoN, walk: SK.G.player.pb.walk }));
      check('Đi đủ 20 ô (320 px) thì sinh 1 lốc xoáy, bộ đếm quãng đường về 0', r0.before === 0 && r1.n === 1 && r1.N === 1 && r1.walk < 20, J([r0, r1]));
      await ev(() => { SK.G.props = SK.G.props.filter(q => !q.tornado); });
      await spawn([[130, 0, 100]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player; const tw = SK.plantbuff.spawnTornado(pl.x + 100, pl.y - 6, 0); tw.vx = tw.vy = 0;   // đứng yên để đo lực hút
        const e = G.enemies[0]; e.st = 'idle'; G.bullets.push({ side: 'e', x: pl.x + 105, y: pl.y - 6, vx: 0, vy: 0, dmg: 1, r: 2, life: 9 });
        return { x0: e.x };
      });
      await sleep(1700);
      const e = await E(0), eb = await ev(() => SK.G.bullets.filter(q => q.side === 'e' && !q.dead).length);
      const tn = await ev(() => { const t = SK.G.props.find(q => q.tornado); return t ? { x: t.x, life: t.life, t: t.t } : null; });
      check('Lốc xoáy hút quái (nhích gần tâm), gây 5 sát thương mỗi 0,5 s (hp ≤ 95, bội của 5), xoá đạn địch', e.hp <= 95 && (100 - e.hp) % 5 === 0 && e.x < r.x0 - 4 && eb === 0, J([r, e, eb]));
      check('Lốc xoáy sống 8 s rồi tan: đặt t = 7,9 s → hết trong 0,3 s', await (async () => { await ev(() => { const t = SK.G.props.find(q => q.tornado); if (t) t.t = 7.9; }); await sleep(300); return ev(() => !SK.G.props.some(q => q.tornado)); })(), J(tn));
    }

    // ================================================================ 2175 Đòn Hỗn Mang
    if (want(2175)) {
      for (const el of ['boom', 'ice', 'poison', 'bolt', 'pull']) {
        await fresh([2175]);
        // chọn chỗ đứng mà quái kéo được 30 px về tâm không đụng tường
        const pos = await ev(() => { const G = SK.G, pl = G.player; for (const d of [120, 80, 50]) for (const sgn of [1, -1]) {
          const q = { x: pl.x + sgn * (d + 30), y: pl.y }, hit = SK.moveBox(G.map, q, -sgn * 30, 0, 3);
          const q2 = { x: pl.x + sgn * d, y: pl.y }; if (!hit && Math.abs(q.x - (pl.x + sgn * d)) < 1 && !SK.moveBox(G.map, q2, sgn * 2, 0, 3)) return { d, sgn }; } return { d: 120, sgn: 1 }; });
        await spawn([[pos.sgn * pos.d, 0, 1000], [pos.sgn * (pos.d + 30), 0, 1000]]);
        const r = await ev(el => {
          const G = SK.G, pl = G.player; SK.plantbuff.forceEl = el;
          const e = G.enemies[0], bx = e.x, by = e.y - 12.8;
          const mk = () => ({ side: 'p', x: bx, y: by, vx: 0, vy: 0, dmg: 10, r: 2, life: 9, scale: 1 });
          const plain = mk(); G.bullets.push(plain); SK.emit('fire', G, pl, pl.weapons[pl.cur]);      // chưa dùng kỹ năng: không đổi
          const noBoost = { dmg: plain.dmg, r: plain.r };
          SK.emit('skill', G, pl);
          const b = mk(); G.bullets.push(b); SK.emit('fire', G, pl, pl.weapons[pl.cur]);
          const boosted = { dmg: b.dmg, r: b.r, scale: b.scale, flag: pl.pb.chaos };
          const b2 = mk(); G.bullets.push(b2); SK.emit('fire', G, pl, pl.weapons[pl.cur]);             // chỉ đòn kế tiếp
          return { noBoost, boosted, second: b2.dmg, pending: (pl.pb.chaosB || []).length, x: e.x };
        }, el);
        if (el === 'boom') check('Hỗn Mang: chưa dùng kỹ năng thì đạn nguyên (10, r 2); sau kỹ năng đòn kế ×3 sát thương (30), ×2,5 cỡ (r 5, scale 2,5); đòn sau nữa nguyên', r.noBoost.dmg === 10 && r.noBoost.r === 2 && r.boosted.dmg === 30 && r.boosted.r === 5 && r.boosted.scale === 2.5 && r.boosted.flag === false && r.second === 10 && r.pending === 1, J(r));
        await ev(() => { const G = SK.G; G.bullets.length = 0; });       // đạn mạnh hết đường
        await sleep(el === 'pull' || el === 'ice' || el === 'poison' ? 1100 : 250);
        const e0 = await E(0), e1 = await E(1);
        if (el === 'boom') check('Hỗn Mang (nổ lửa): vụ nổ 10 sát thương cho cả 2 quái trong 2,5 ô và đốt', e0.hp === 990 && e1.hp === 990 && e0.db.indexOf('fire') >= 0, J([e0.hp, e1.hp, e0.db]));
        if (el === 'ice') check('Hỗn Mang (vũng băng): vũng 1 sát thương mỗi 0,5 s (≥ 1 nhịp) và đóng băng', e0.hp < 1000 && 1000 - e0.hp <= 4 && e0.db.indexOf('ice') >= 0, J(e0));
        if (el === 'poison') check('Hỗn Mang (vũng độc): quái trong vũng trúng độc', e0.db.indexOf('poison') >= 0 && e0.hp < 1000, J(e0));
        if (el === 'bolt') check('Hỗn Mang (sét): 8 sát thương quái trong 1,5 ô, choáng; quái 30 px xa hơn (ngoài bán kính 24) 0', e0.hp === 992 && e0.st === 'stun' && e1.hp === 1000, J([e0, e1.hp]));
        if (el === 'pull') check('Hỗn Mang (hố hút): quái ngoài rìa bị kéo gần điểm nổ (x giảm ≥ 20 px so với 150 → dưới 130)', Math.abs(e1.x - r.x) < 30 - 15 && e1.hp === 997 && e0.hp === 997, J([e0.x, e1.x, r.x]));
      }
      await fresh([2175]);
      await spawn([[60, 0, 1000], [75, 0, 1000]]);
      const m = await ev(() => {
        const G = SK.G, pl = G.player; SK.plantbuff.forceEl = 'boom';
        SK.emit('skill', G, pl); SK.emit('fire', G, pl, { def: { kind: 'melee' } });
        const e = G.enemies[0]; SK.hurtEnemy(G, e, 10, false, 0, 0);
        const hits = { e0: e.hp, e1: G.enemies[1].hp };
        const again = (SK.hurtEnemy(G, e, 10, false, 0, 0), e.hp);
        return { hits, again, melee: !!pl.pb.chaosMelee };
      });
      check('Hỗn Mang cận chiến: đòn trúng đầu tiên cộng thêm 20 (tổng ×3) và nổ lửa; đòn sau nguyên (10)', m.hits.e0 === 1000 - 10 - 20 - 10 && m.hits.e1 === 990 && m.again === m.hits.e0 - 10 && !m.melee, J(m));
    }

    // ================================================================ 2177 Không Quân Chi Viện
    if (want(2177)) {
      await fresh([2177]);
      await spawn([[100, 0, 1000]]);
      await until(p, () => SK.G.player.pb.airN === 1, null, 1500);
      const r = await ev(() => ({ n: SK.G.props.filter(q => q.ally && q.ally.pbNpc).length, cd: SK.G.player.pb.cd.air, life: SK.G.props.filter(q => q.ally && q.ally.pbNpc).map(q => Math.round(q.ally.life * 10) / 10) }));
      check('Khi đánh nhau tự gọi 3 lính yểm trợ 8 s, hồi 20 s', r.n === 3 && r.cd > 19 && r.cd <= 20 && r.life.every(l => l > 7 && l <= 8), J(r));
      await sleep(2500);
      const h = await E(0), sh = await ev(() => SK.G.props.filter(q => q.ally && q.ally.pbNpc).map(q => q.ally.shots));
      check('Lính bắn Improved SMG: quái mất máu (bội 2 sát thương mỗi viên), cả 3 đã bắn', h.hp < 1000 && (1000 - h.hp) % 2 === 0 && sh.every(n => n > 0), J([h.hp, sh]));
      await ev(() => { for (const q of SK.G.props.filter(q => q.ally && q.ally.pbNpc)) q.ally.life = 0.05; });
      await sleep(400);
      const g = await ev(() => ({ n: SK.G.props.filter(q => q.ally && q.ally.pbNpc).length, N: SK.G.player.pb.airN }));
      check('hết giờ thì lính rút đi; chưa gọi lại khi còn hồi chiêu (airN vẫn 1)', g.n === 0 && g.N === 1, J(g));
    }

    // ================================================================ 2178 Pháo Nổ
    if (want(2178)) {
      await fresh([2178]);
      await spawn([[200, 0, 1000]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, oc = SK.chance; SK.chance = () => false;
        SK.emit('skill', G, pl);
        const cr = G.props.filter(q => q.cracker), e = G.enemies[0], big = cr.filter(q => q.big).length;
        for (const q of cr) { q.big = false; q.x = e.x; q.y = e.y - 4; }
        SK.chance = oc; window.__oc = oc; SK.chance = () => false;
        return { n: cr.length, big };
      });
      await sleep(300);
      const e = await E(0), left = await ev(() => { SK.chance = window.__oc; return SK.G.props.filter(q => q.cracker).length; });
      check('Dùng kỹ năng rải 9-12 quả pháo', r.n >= 9 && r.n <= 12, 'n=' + r.n + ' to=' + r.big);
      check('Pháo chạm quái thì nổ: mỗi quả 1 sát thương (quái mất đúng ' + r.n + ' máu), hết pháo', 1000 - e.hp === r.n && left === 0, J([e.hp, left]));
      await ev(() => { const G = SK.G; G.enemies.length = 0; });
      await ev(() => { SK.emit('skill', SK.G, SK.G.player); });
      await sleep(2900);
      const l2 = await ev(() => SK.G.props.filter(q => q.cracker).length);
      check('Pháo không trúng ai thì tự nổ sau 1,2-2,4 s (sau 2,9 s hết sạch)', l2 === 0, 'còn ' + l2);
      await spawn([[10, 0, 1000]]);
      const big = await ev(() => {
        const G = SK.G, pl = G.player, e = G.enemies[0], oc = SK.chance; SK.chance = () => false;
        SK.emit('skill', G, pl); const cr = G.props.filter(q => q.cracker); for (const q of cr) { q.big = true; q.x = e.x; q.y = e.y - 4; }
        const n = cr.length; window.__n = n; return n;
      });
      await sleep(300);
      const eb = await E(0); await ev(() => { SK.chance = (p2) => SK.rand() < p2; });
      check('Quả to nổ 3 sát thương (quái mất 3 × ' + big + ')', 1000 - eb.hp === 3 * big, J([eb.hp, big]));
    }

    // ================================================================ 2179 Sấm Sét
    if (want(2179)) {
      await fresh([2179]);
      await spawn([[60, 0, 1000]]);
      await sleep(1500);
      const a = await E(0);
      await ev(() => { const pl = SK.G.player; SK.G.props.push({ x: pl.x + 20, y: pl.y, gardenPet: { x: pl.x + 20, y: pl.y }, update() {}, draw() {} }); });
      await sleep(1800);
      const b = await E(0), n = await ev(() => SK.G.player.pb.boltN);
      check('Sấm Sét: không có đồng minh thì không giáng sét (hp 1000); có thú cưng trong 6 ô thì mỗi ~1 s 4 sát thương', a.hp === 1000 && b.hp < 1000 && (1000 - b.hp) % 4 === 0 && n >= 1 && n <= 3, J([a.hp, b.hp, n]));
      await ev(() => { const pl = SK.G.player; const g = SK.G.props.find(q => q.gardenPet); g.gardenPet.x = pl.x + 300; g.x = pl.x + 300; SK.G.player.pb.boltN = 0; });
      const h0 = (await E(0)).hp; await sleep(1500);
      const c = await E(0), n2 = await ev(() => SK.G.player.pb.boltN);
      check('thú cưng xa 19 ô (ngoài 6 ô) thì sét dừng', c.hp === h0 && !n2, J([h0, c.hp, n2]));
    }

    // ================================================================ 2180 Đòn Tùy Ý
    if (want(2180)) {
      await fresh([2180]);
      await spawn([[60, 0, 1e7]]);
      const r = await ev(() => {
        const G = SK.G, pl = G.player, e = G.enemies[0], oc = SK.chance, w = pl.weapons[pl.cur];
        w.def = Object.assign({}, w.def, { cost: 10 });
        pl.energy = 50; SK.chance = () => true;
        const h = e.hp; SK.hurtEnemy(G, e, 10, false, 0, 0);
        const yes = { d: h - e.hp, en: pl.energy };
        SK.chance = () => false; pl.energy = 50; const h2 = e.hp; SK.hurtEnemy(G, e, 10, false, 0, 0);
        const no = { d: h2 - e.hp, en: pl.energy };
        SK.chance = () => true; G._skHit = 'skill'; pl.energy = 50; const h3 = e.hp; SK.hurtEnemy(G, e, 10, false, 0, 0); G._skHit = null;
        const sk = { d: h3 - e.hp, en: pl.energy };
        SK.chance = oc; pl.pb.arbN = 0;
        let n = 0; for (let i = 0; i < 600; i++) { const h4 = e.hp; SK.hurtEnemy(G, e, 10, false, 0, 0); if (h4 - e.hp === 14) n++; }
        return { yes, no, sk, n };
      });
      check('Đòn Tùy Ý trúng: +4 sát thương (14) và hồi 20% năng lượng vừa tiêu (cost 10 → +2: 52)', r.yes.d === 14 && r.yes.en === 52, J(r.yes));
      check('không trúng: 10 sát thương, năng lượng nguyên; đòn nhãn kỹ năng không tính', r.no.d === 10 && r.no.en === 50 && r.sk.d === 10 && r.sk.en === 50, J([r.no, r.sk]));
      check('xác suất 15% (600 đòn thật: 90 ± 28)', r.n >= 62 && r.n <= 118, 'trúng ' + r.n + '/600');
    }

    // ================================================================ 2181 Hoa Hồng Đen
    if (want(2181)) {
      await fresh([2181]);
      await spawn([[60, 0, 500], [60 + 24, 0, 500], [60 + 200, 0, 500]]);
      await wHit(0, 10);
      const m1 = await E(0), n1 = await E(1);
      await wHit(0, 12);
      const e0 = await E(0), e1 = await E(1), e2 = await E(2);
      check('Hoa Hồng Đen: đòn đầu đánh dấu quái (−10, chưa nổ, quái bên cạnh 500)', m1.hp === 490 && m1.mark && n1.hp === 500 && !n1.mark, J([m1, n1]));
      check('đòn vũ khí lên quái có dấu: nổ đen 50% sát thương (12 → 6) lên quái dấu (500−10−12−6 = 472) và quái trong 2 ô (494); quái xa 500', e0.hp === 472 && e1.hp === 494 && e2.hp === 500, J([e0.hp, e1.hp, e2.hp]));
      const c = await ev(() => { const G = SK.G, e = G.enemies[0], h = e.hp; SK.hurtEnemy(G, e, 24, true, 0, 0); return { d: h - e.hp, nb: G.enemies[1].hp }; });
      check('tính sau bạo kích, làm tròn chẵn: đòn bạo kích 24 → nổ 12 (quái dấu −24−12, quái cạnh 494−12 = 482)', c.d === 36 && c.nb === 482, J(c));
      await ev(() => { const e = SK.G.enemies[0]; e._pbMark = SK.G.t - 1; });
      const d = await ev(() => { const G = SK.G, e = G.enemies[0], h = e.hp, nb = G.enemies[1].hp; SK.hurtEnemy(G, e, 10, false, 0, 0); return { d: h - e.hp, dn: nb - G.enemies[1].hp, mark: e._pbMark > G.t }; });
      check('dấu hết hạn (3 s) thì đòn không nổ (−10) và đặt lại dấu', d.d === 10 && d.dn === 0 && d.mark, J(d));
      const k = await ev(() => { const G = SK.G, e = G.enemies[0], h = e.hp, nb = G.enemies[1].hp; G._skHit = 'skill'; SK.hurtEnemy(G, e, 10, false, 0, 0); G._skHit = null; return { d: h - e.hp, dn: nb - G.enemies[1].hp, mark: e._pbMark > G.t }; });
      check('đòn kỹ năng lên quái có dấu: không nổ (−10), vẫn gia hạn dấu', k.d === 10 && k.dn === 0 && k.mark, J(k));
    }

    // ================================================================ 2182 Hấp Thụ Sát Thương
    if (want(2182)) {
      await fresh([2182]);
      await spawn([[60, 0, 1000]]);
      const a = await wHit(0, 10);
      const e1 = await E(0), s1 = await ev(() => ({ st: SK.G.player.pb.abs.stage, store: SK.G.player.pb.abs.store }));
      await wHit(0, 20, true);
      const e2 = await E(0), s2 = await ev(() => ({ st: SK.G.player.pb.abs.stage, store: SK.G.player.pb.abs.store }));
      check('giai đoạn 1 (1 s): quái hấp thụ 100% sát thương (hp 1000), lưu 20% trước bạo kích: 10 → 2, đòn bạo kích 20 (gốc 10) → thêm 2 (tổng 4)', e1.hp === 1000 && s1.st === 1 && s1.store === 2 && e2.hp === 1000 && s2.st === 1 && s2.store === 4, J([e1.hp, s1, e2.hp, s2]));
      await until(p, () => SK.G.player.pb.abs.stage === 2, null, 6000);
      const s3 = await ev(() => ({ st: SK.G.player.pb.abs.stage, store: SK.G.player.pb.abs.store, t: Math.round(SK.G.player.pb.abs.t) }));
      await wHit(0, 10);
      const e3 = await E(0);
      check('giai đoạn 2 (16 s): mỗi đòn cộng phần đã lưu (4): 10 → 14', s3.st === 2 && s3.store === 4 && s3.t >= 14 && e3.hp === 986, J([s3, e3.hp]));
      await wHit(0, 10);
      check('giai đoạn 2 vẫn cộng ở đòn kế: 986 − 14 = 972', (await E(0)).hp === 972);
      await ev(() => { SK.G.player.pb.abs.t = 0.05; });
      await until(p, () => SK.G.player.pb.abs.stage === 0, null, 3000);
      await wHit(0, 10);
      const s4 = await ev(() => ({ st: SK.G.player.pb.abs.stage }));
      check('hết 16 s về giai đoạn 0; đòn kế (10) lại bị hấp thụ và mở vòng mới (hp giữ 972)', (await E(0)).hp === 972 && s4.st === 1, J([(await E(0)).hp, s4]));
    }

    // ================================================================ 2183 Sao Chép Vũ Khí
    if (want(2183)) {
      await fresh([2183]);
      await spawn([[150, 0, 1e6]]);
      const r = await ev(() => {
        const W = SK_DESIGN.weapons, pl = SK.G.player;
        const gun = k => W[k].kind === 'gun' && !(W[k].w86 && W[k].w86.x && W[k].w86.x.charge) && !W[k].charge;
        const one = Object.keys(W).find(k => gun(k) && (W[k].pellets || 1) === 1 && W[k].cost > 0);
        const many = W.shotgun && gun('shotgun') ? 'shotgun' : Object.keys(W).find(k => gun(k) && (W[k].pellets || 1) >= 3 && W[k].cost > 0);
        pl.weapons[0] = SK.makeWeapon(one); pl.weapons[1] = SK.makeWeapon(many); pl.cur = 0; pl.aim = 0; pl.energy = pl.energyMax;
        return { one, many, p1: W[one].pellets || 1, p2: W[many].pellets, cost1: W[one].cost, rps1: W[one].rps, cost2: W[many].cost, rps2: W[many].rps };
      });
      await until(p, () => SK.G.player.pb.copyT > 0, null, 2500);
      const c = await ev(() => { const pl = SK.G.player, d = pl.weapons[0].def; return { t: pl.pb.copyT, pel: d.pellets, cost: d.cost, rps: d.rps, cd: pl.pb.cd.copy, prefab: d.prefab }; });
      check('Sao Chép Vũ Khí: khi đánh nhau + có 2 vũ khí thì 1 s vũ khí chính lấy kiểu bắn của vũ khí dự phòng (số viên ' + r.p2 + '), giữ năng lượng/tốc bắn của chính nó, hồi 8 s',
        c.t > 0 && c.t <= 1 && c.pel === r.p2 && c.cost === r.cost1 && c.rps === r.rps1 && c.cd > 7 && c.cd <= 8, J([r, c]));
      // bắn thật qua phím chuột trong lúc sao chép
      await ev(() => { const pl = SK.G.player; pl.pb.copyT = 3; });
      await ev(() => { SK.G.player.energy = SK.G.player.energyMax; });
      await p.keyboard.down('KeyJ');   // giữ nút đánh thật (autoaim vào quái)
      await ev(() => { window.__fb = []; if (!window.__fbOn) { window.__fbOn = 1; SK.on('fire', G2 => { let n = 0; for (const q of G2.bullets) if (q.side === 'p' && !q._seen) { q._seen = 1; n++; } window.__fb.push(n); }); } });
      const t0 = Date.now();
      while (Date.now() - t0 < 1500 && !((await ev(() => window.__fb.length)) >= 3)) await sleep(40);
      await p.keyboard.up('KeyJ');
      const fb = await ev(() => window.__fb);
      check('bắn thật (giữ phím đánh J) khi đang sao chép: mỗi lượt ra ' + r.p2 + ' viên như vũ khí dự phòng (vũ khí chính vốn 1 viên)', fb.length >= 2 && fb.every(n => n === r.p2), 'số viên mỗi lượt: ' + fb.join(','));
      await ev(() => { SK.G.player.pb.copyT = 0.05; });
      await sleep(300);
      const e = await ev(() => { const pl = SK.G.player, d = pl.weapons[0].def; return { pel: d.pellets, t: pl.pb.copyT, w: !!pl.pb.copyW }; });
      check('hết 1 s: vũ khí chính về như cũ (số viên ' + r.p1 + ')', e.pel === r.p1 && !e.w, J(e));
      await ev(() => { const pl = SK.G.player; pl.weapons[1] = null; pl.pb.cd.copy = 0; });
      await sleep(400);
      check('chỉ có 1 vũ khí thì không kích hoạt', await ev(() => !(SK.G.player.pb.copyT > 0)));
    }

    // ================================================================ 2184 Bầy Khỉ
    if (want(2184)) {
      await fresh([2184]);
      await spawn([[90, 0, 1000]]);
      await until(p, () => SK.G.player.pb.monkeyN === 1, null, 1500);
      const r = await ev(() => ({ n: SK.G.props.filter(q => q.ally && q.ally.pbMonkey).length, cd: SK.G.player.pb.cd.monkey, life: SK.G.props.filter(q => q.ally && q.ally.pbMonkey).map(q => Math.round(q.ally.life)) }));
      check('Khi đánh nhau gọi 3 con khỉ, tồn tại 15 s, hồi 20 s', r.n === 3 && r.cd > 19 && r.cd <= 20 && r.life.every(l => l >= 14 && l <= 15), J(r));
      await sleep(3000);
      const h = await E(0);
      check('Khỉ chạy tới cắn quái: mỗi cú 3 sát thương (hp bội của 3, mất ≥ 3)', h.hp < 1000 && (1000 - h.hp) % 3 === 0, J(h));
      await ev(() => { for (const q of SK.G.props.filter(q => q.ally && q.ally.pbMonkey)) q.ally.life = 0.05; });
      await sleep(300);
      const g = await ev(() => ({ n: SK.G.props.filter(q => q.ally && q.ally.pbMonkey).length, N: SK.G.player.pb.monkeyN }));
      check('hết giờ khỉ biến mất; còn hồi chiêu thì chưa gọi lại', g.n === 0 && g.N === 1, J(g));
    }
    await ctx.close();
  } catch (e) {
    check('chạy trọn', false, (e.stack || e.message).split('\n').slice(0, 4).join(' / '));
  }
  const bad = errs.filter(e => !IGNORE.test(e));
  check('không lỗi trang / console', bad.length === 0, bad.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
