/*
 * Bộ kiểm thử XE MÁY cho repo2d (và bản Biệt Đội dùng chung bộ máy).
 * Chạy: node test/bike-suite.js
 *
 * Hai chiếc xe dựng theo đúng bản gốc: bản cập nhật 07/05/2026 của R.E.P.O. thêm đúng hai xe,
 * mỗi chiếc MỘT chỗ ngồi, "cannot carry items while riding" và "cannot wield items while
 * driving", bù lại húc được quái ("boosted impacts"). Bộ này đo đúng những lời hứa đó, cộng
 * hai luật riêng của bản này: có xăng, và hết xăng thì sang tầng sau mới đầy lại.
 *
 * Hạt giống màn được ĐẶT CỨNG. Không có nó thì mỗi lần chạy là một căn nhà khác, và một ca đo
 * tốc độ có thể rơi trúng một chiếc xe đang dí mũi vào tường — hỏng mà không nói lên điều gì.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const R2D = root + '/games/repo2d/index.html';
const SEED = 4242;

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else    { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

async function open(b, vp) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: true, deviceScaleFactor: 2,
                                   isMobile: vp.width < vp.height });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(R2D);
  await p.waitForTimeout(1100);
  await p.locator('#veilBtn').click();                 // vào ca bằng CLICK THẬT
  await p.waitForTimeout(220);
  await p.evaluate(s => { REPO.setCutscenes(false); REPO.startLevel(s); }, SEED);
  await p.waitForTimeout(700);
  await p.evaluate(() => { REPO.S.cut = null; REPO.S.running = true; REPO.S.noFoes = true; });
  await p.waitForTimeout(200);
  return { ctx, p, errs };
}

// Hành lang thông nhất trong nhà, để đo tốc độ mà không dí mũi vào tường.
const hanhLang = p => p.evaluate(() => {
  const T = REPO.TILE;
  let best = null, bs = -1;
  for (let gy = 2; gy < REPO.MH - 2; gy++)
    for (let gx = 2; gx < REPO.MW - 2; gx++) {
      if (REPO.solidAt(gx, gy)) continue;
      let n = 0;
      for (let d = 1; d <= 12; d++) { if (REPO.solidAt(gx + d, gy)) break; n++; }
      if (n > bs) { bs = n; best = { gx, gy }; }
    }
  return best ? { x: (best.gx + 0.5) * T, y: (best.gy + 0.5) * T, thong: bs } : null;
});

// =====================================================================
async function coXeSuite(b) {
  results.push('\n── hai chiếc xe có mặt, và khác nhau ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  const xe = await p.evaluate(() => REPO.bikes());
  check('mỗi tầng dựng đúng HAI chiếc', xe.length === 2, xe.map(x => x.kind).join(', '));
  const scout = xe.find(x => x.kind === 'scout'), haul = xe.find(x => x.kind === 'haul');
  check('có xe trinh sát và xe chở đồ', !!scout && !!haul);
  const d = await p.evaluate(() => ({
    scout: REPO.BIKE_KINDS.scout, haul: REPO.BIKE_KINDS.haul
  }));
  check('xe trinh sát NHANH HƠN xe chở đồ', d.scout.speed > d.haul.speed,
    d.scout.speed + ' vs ' + d.haul.speed + ' px/s');
  check('chỉ xe chở đồ mới có thùng sau', d.scout.slots === 0 && d.haul.slots > 0,
    'trinh sát ' + d.scout.slots + ' ô · chở đồ ' + d.haul.slots + ' ô');
  check('cả hai đều bắt đầu với bình xăng đầy',
    scout.fuel === scout.fuelMax && haul.fuel === haul.fuelMax);

  // XE KHÔNG NẰM TRONG TỦ. Tủ là chỗ của đồ cầm tay.
  const trongTu = await p.evaluate(() =>
    REPO.GEAR.some(g => /scout|haul|bike|xe/i.test(g.key)));
  check('xe KHÔNG phải một món trong tủ đồ', trongTu === false);
  check('hai chiếc xe: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function laiSuite(b) {
  results.push('\n── lái xe ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  const cho = await hanhLang(p);
  check('tìm được hành lang đủ dài để đo', !!cho && cho.thong >= 6,
    cho ? cho.thong + ' ô' : 'không có');

  await p.evaluate(c => {
    const bk = REPO.S.bikes[0];
    bk.x = c.x; bk.y = c.y; bk.dir = 0; bk.spd = 0;
    REPO.warp(c.x, c.y);
  }, cho);
  await p.waitForTimeout(150);
  await p.keyboard.press('e');                          // >>> PHÍM THẬT: lên xe <<<
  await p.waitForTimeout(250);
  check('bấm E cạnh xe thì lên xe', await p.evaluate(() => REPO.riding()) === 'scout');

  const t0 = await p.evaluate(() => ({ fuel: REPO.S.player.riding.fuel, x: REPO.S.player.x }));
  await p.keyboard.down('d');                           // >>> PHÍM THẬT: kéo ga <<<
  await p.waitForTimeout(1100);
  const dinh = await p.evaluate(() => Math.round(REPO.S.player.riding ? REPO.S.player.riding.spd : -1));
  await p.keyboard.up('d');
  await p.waitForTimeout(120);
  const t1 = await p.evaluate(() => ({
    fuel: REPO.S.player.riding ? REPO.S.player.riding.fuel : -1, x: REPO.S.player.x
  }));
  const diBo = await p.evaluate(() => REPO.playerSpeed(REPO.S.player));
  check('xe chạy nhanh hơn hẳn đi bộ', dinh > diBo * 1.8,
    'xe ' + dinh + ' px/s · đi bộ ' + Math.round(diBo) + ' px/s');
  check('đi được quãng đường thật', Math.abs(t1.x - t0.x) > 120,
    Math.round(Math.abs(t1.x - t0.x)) + ' px');
  check('chạy thì TỐN XĂNG', t0.fuel - t1.fuel > 0.4,
    'tốn ' + (t0.fuel - t1.fuel).toFixed(2) + ' trên 1,1 giây');

  // "cannot wield items while driving" — luật của bản gốc, và là toàn bộ cái giá của chiếc xe.
  const cam = await p.evaluate(() => {
    if (!REPO.S.player.riding) return null;
    REPO.giveGear('gun', 1); REPO.equip('gun');
    REPO.S.player.cooldown = 0;
    return { ban: REPO.useSlot(REPO.S.player, 0, 0), phang: REPO.meleeSwing(REPO.S.player, 0) };
  });
  check('đang lái thì KHÔNG bắn được', cam && cam.ban === false);
  check('đang lái thì KHÔNG phang đèn pin được', cam && cam.phang === false);

  // "cannot carry items while riding" — ôm đồ trên tay thì không leo lên xe.
  const omDo = await p.evaluate(() => {
    const pl = REPO.S.player;
    if (pl.riding) REPO.dismountBike(pl);
    const l = REPO.S.loot.find(x => !x.gone && !x.isHead);
    if (!l) return { boQua: true };
    l.x = pl.x; l.y = pl.y; REPO.pickUp(pl);
    if (!pl.held) return { boQua: true };
    const bk = REPO.S.bikes[0]; bk.x = pl.x; bk.y = pl.y; bk.downed = 0;
    return { lenDuoc: REPO.mountBike(pl, bk) };
  });
  check('ôm đồ trên tay thì KHÔNG leo lên xe được',
    omDo.boQua || omDo.lenDuoc === false, omDo.boQua ? 'không dựng được cảnh' : '');
  check('lái xe: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function hucSuite(b) {
  results.push('\n── húc quái ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  const cho = await hanhLang(p);
  await p.evaluate(c => {
    const bk = REPO.S.bikes[0];
    bk.x = c.x; bk.y = c.y; bk.dir = 0; bk.spd = 0;
    REPO.warp(c.x, c.y);
    REPO.mountBike(REPO.S.player, bk);
  }, cho);
  await p.waitForTimeout(200);

  const nhanh = await p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    if (!pl.riding) return { boQua: true };
    S.monsters.length = 0; S.noFoes = false;
    const bk = pl.riding; bk.spd = 195; bk.dir = 0; bk.fuel = 20;
    const m = REPO.spawnFoe('heavy', 0, 0);
    m.x = pl.x + 30; m.y = pl.y; m.speed = 0; m.state = 'patrol'; m.alert = 0; m.kx = 0;
    const hp0 = m.hp;
    await new Promise(r => setTimeout(r, 400));
    return { mat: Math.round(hp0 - m.hp), batLui: Math.abs(m.kx || 0) > 100,
             spdSau: Math.round(bk.spd) };
  });
  check('húc ở tốc độ cao thì quái mất máu', !nhanh.boQua && nhanh.mat > 50,
    'mất ' + nhanh.mat + ' máu');
  check('và nó bị bắn lùi', !nhanh.boQua && nhanh.batLui === true);
  check('húc xong thì xe khựng lại — không cày được cả hàng',
    !nhanh.boQua && nhanh.spdSau < 195 * 0.6, 'còn ' + nhanh.spdSau + ' px/s');

  // Đi chậm mà chạm vào thì KHÔNG phải là húc — nếu không thì đứng dí vào con quái là thắng.
  const cham = await p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0;
    const bk = pl.riding; if (!bk) return { boQua: true };
    bk.spd = REPO.BIKE_RAM_MIN * 0.5; bk.dir = 0; bk.fuel = 20;
    const m = REPO.spawnFoe('heavy', 0, 0);
    m.x = pl.x + 26; m.y = pl.y; m.speed = 0; m.state = 'patrol'; m.alert = 0;
    const hp0 = m.hp;
    await new Promise(r => setTimeout(r, 300));
    return { mat: Math.round(hp0 - m.hp) };
  });
  check('bò chậm chạm vào thì KHÔNG ăn thua', cham.boQua || cham.mat === 0,
    'mất ' + cham.mat + ' máu');
  check('húc quái: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function ngaSuite(b) {
  results.push('\n── đâm tường thì ngã ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  const dat = await p.evaluate(() => {
    const S = REPO.S, pl = S.player, T = REPO.TILE;
    for (let gy = 2; gy < REPO.MH - 2; gy++)
      for (let gx = 2; gx < REPO.MW - 4; gx++) {
        if (REPO.solidAt(gx, gy)) continue;
        if (REPO.solidAt(gx + 1, gy) || REPO.solidAt(gx + 2, gy)) continue;
        if (!REPO.solidAt(gx + 3, gy)) continue;
        const x = (gx + 0.5) * T, y = (gy + 0.5) * T;
        if (pl.riding) REPO.dismountBike(pl);
        const bk = S.bikes[0];
        bk.downed = 0; bk.fuel = bk.fuelMax; bk.spd = 0; bk.dir = 0; bk.x = x; bk.y = y;
        REPO.warp(x, y);
        REPO.mountBike(pl, bk);
        return { ok: !!pl.riding, hp0: pl.hp };
      }
    return { ok: false };
  });
  check('dựng được cảnh có tường phía trước', dat.ok);
  if (dat.ok) {
    await p.keyboard.down('Shift');
    await p.keyboard.down('d');                        // >>> PHÍM THẬT: lao vào tường <<<
    await p.waitForTimeout(1100);
    await p.keyboard.up('d');
    await p.keyboard.up('Shift');
    await p.waitForTimeout(220);
    const nga = await p.evaluate(h => ({
      conNgoi: REPO.riding(),
      xeNam: REPO.bikes().some(x => x.downed > 0),
      mauMat: h - REPO.S.player.hp
    }), dat.hp0);
    check('đâm tường ở tốc độ cao thì VĂNG RA khỏi xe', nga.conNgoi === null);
    check('và xe nằm xuống một lúc', nga.xeNam === true);
    check('người lái ăn đòn', nga.mauMat > 0, 'mất ' + nga.mauMat + ' máu');
  }
  check('ngã xe: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function xangSuite(b) {
  results.push('\n── xăng: hết thì sang tầng sau mới đầy ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  const het = await p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    const bk = S.bikes[0];
    bk.downed = 0; bk.fuel = bk.fuelMax; bk.x = pl.x; bk.y = pl.y;
    REPO.mountBike(pl, bk);
    if (!pl.riding) return { boQua: true };
    bk.fuel = 0.05;
    await new Promise(r => setTimeout(r, 900));
    return { fuel: +bk.fuel.toFixed(2), spd: Math.round(bk.spd) };
  });
  check('hết xăng thì xe dừng hẳn', !het.boQua && het.fuel === 0 && het.spd === 0,
    JSON.stringify(het));

  const lenLai = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    if (pl.riding) REPO.dismountBike(pl);
    const bk = S.bikes[0]; bk.x = pl.x; bk.y = pl.y; bk.downed = 0;
    return { lenDuoc: REPO.mountBike(pl, bk), dangNgoi: REPO.riding() };
  });
  check('hết xăng thì KHÔNG leo lên lại được — không có cách đổ thêm giữa tầng',
    lenLai.lenDuoc === false && lenLai.dangNgoi === null);

  await p.evaluate(() => REPO.startLevel());
  await p.waitForTimeout(800);
  const moi = await p.evaluate(() => REPO.bikes());
  check('sang tầng sau thì cả hai xe đầy bình lại',
    moi.length === 2 && moi.every(x => x.fuel === x.fuelMax),
    moi.map(x => x.kind + ' ' + x.fuel).join(' · '));
  check('xăng: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function thungSuite(b) {
  results.push('\n── thùng sau của xe chở đồ ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  const t = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    const scout = S.bikes.find(b => b.kind === 'scout');
    const haul  = S.bikes.find(b => b.kind === 'haul');
    const l = S.loot.find(x => !x.gone && !x.isHead && x.value < REPO.CART_MAX_VALUE);
    if (!l) return { boQua: true };
    // ôm món đồ tới cạnh xe chở đồ rồi thả — đó là cách chất hàng
    l.x = pl.x; l.y = pl.y;
    REPO.pickUp(pl);
    if (!pl.held) return { boQua: true };
    haul.x = pl.x + 8; haul.y = pl.y;
    REPO.dropHeld(pl);
    return { scoutNhan: REPO.bikeFits(scout, l), haulCo: haul.items.length,
             giaTri: REPO.bikeValue(haul) };
  });
  check('xe trinh sát KHÔNG chất được gì', t.boQua || t.scoutNhan === false);
  check('thả đồ cạnh xe chở đồ thì nó vào thùng',
    t.boQua || t.haulCo === 1, t.boQua ? 'không dựng được cảnh' : t.haulCo + ' món, ' + t.giaTri);

  // Đỗ xe chở đồ lên bệ đang mở thì dỡ cả thùng — cùng một luật với xe đẩy.
  const doLenBe = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    const haul = S.bikes.find(b => b.kind === 'haul');
    const pad = S.pads[S.padIndex];
    if (!pad || !haul.items.length) return { boQua: true };
    pad.active = true; pad.done = false;
    haul.downed = 0; haul.fuel = haul.fuelMax;
    REPO.warp(pad.x, pad.y);
    haul.x = pad.x; haul.y = pad.y;
    REPO.mountBike(pl, haul);
    const truoc = haul.items.length;
    REPO.dismountBike(pl);
    return { truoc, sau: haul.items.length, trenBe: pad.placed.length };
  });
  check('đỗ xe chở đồ lên bệ thì dỡ cả thùng',
    doLenBe.boQua || (doLenBe.sau === 0 && doLenBe.trenBe > 0),
    doLenBe.boQua ? 'không dựng được cảnh'
                  : doLenBe.truoc + ' món → thùng còn ' + doLenBe.sau + ', trên bệ ' + doLenBe.trenBe);
  check('thùng sau: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
(async () => {
  const b = await chromium.launch();
  const run = async (ten, fn) => {
    try { await fn(b); } catch (e) { check(ten + ': bộ test chạy trọn', false, e.message); }
  };
  await run('hai chiếc xe', coXeSuite);
  await run('lái xe', laiSuite);
  await run('húc quái', hucSuite);
  await run('ngã xe', ngaSuite);
  await run('xăng', xangSuite);
  await run('thùng sau', thungSuite);
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
