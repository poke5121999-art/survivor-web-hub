/*
 * Bộ kiểm thử SÚNG cho repo2d (và bản Biệt Đội dùng chung bộ máy).
 * Chạy: node test/guns-suite.js
 *
 * Đo ba thứ, và chỉ ba thứ:
 *   1. Hai khẩu mới — nòng ngắn toé nón và laser sạc — có làm đúng cái nó hứa không.
 *   2. Bắn xong thì chân có chậm thật không, và chậm đúng bao lâu.
 *   3. Ngắm tự động có CHÍNH XÁC không: đón đầu con đang chạy, không quay ra sau lưng,
 *      không bắn xuyên tường, và trợ ngắm chỉ hút trong đúng cửa sổ hẹp của nó.
 *
 * Cử chỉ sạc được bấm bằng NGÓN TAY THẬT và PHÍM THẬT, vì cái cơ chế đó nằm trọn trong
 * tay người chơi — đo nó bằng cách gọi hàm là không đo gì cả.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const R2D = root + '/games/repo2d/index.html';

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
  await p.goto(R2D);
  await p.waitForTimeout(1100);
  await p.locator('#veilBtn').click();               // vào ca bằng CLICK THẬT
  await p.waitForTimeout(200);
  await p.evaluate(() => { REPO.setCutscenes(false); REPO.S.cut = null; REPO.S.running = true; });
  await p.waitForTimeout(250);
  return { ctx, p, errs };
}

// Dọn sạch sân đo: không quái, không đạn, người chơi đứng giữa một khoảng trống.
// DỰNG CẢNH — người chơi đến được mọi trạng thái này, chỉ là mất hàng chục phút.
async function sanDo(p) {
  await p.evaluate(() => {
    REPO.S.monsters.length = 0;
    REPO.S.bullets.length = 0;
    REPO.S.beams.length = 0;
    REPO.S.noFoes = true;
    const pl = REPO.S.player;
    pl.recoilT = 0; pl.kx = 0; pl.ky = 0; pl.cooldown = 0;
    pl.chargeSlot = -1; pl.chargeT = 0;
    pl.hp = pl.hpMax;
  });
}

// Tìm một chỗ trống đủ rộng để đo tầm bắn mà không đụng tường.
async function chonChoTrong(p, oCanTrong) {
  return p.evaluate(n => {
    const S = REPO.S, T = REPO.TILE;
    let best = null, bestScore = -1;
    for (let gy = 2; gy < REPO.MH - 2; gy++) {
      for (let gx = 2; gx < REPO.MW - 2; gx++) {
        if (REPO.solidAt(gx, gy)) continue;
        let ok = 0;
        for (let d = 1; d <= n; d++) if (!REPO.solidAt(gx + d, gy)) ok++; else break;
        if (ok > bestScore) { bestScore = ok; best = { gx, gy }; }
        if (bestScore >= n) { gy = 1e9; break; }
      }
    }
    if (!best) return null;
    const x = (best.gx + 0.5) * T, y = (best.gy + 0.5) * T;
    REPO.warp(x, y);
    S.player.dir = 0;                       // nhìn sang phải, dọc theo hành lang vừa tìm được
    return { x, y, thong: bestScore };
  }, oCanTrong);
}

// =====================================================================
async function bangSungSuite(b) {
  results.push('\n── hai khẩu mới có mặt trong bảng đồ ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  const g = await p.evaluate(() => {
    const by = REPO.GEAR_BY_KEY;
    return {
      co: ['shotgun', 'laser'].every(k => !!by[k]),
      shotgun: by.shotgun && { uses: by.shotgun.uses, price: by.shotgun.price, aim: !!by.shotgun.aim },
      laser: by.laser && { uses: by.laser.uses, price: by.laser.price, charge: !!by.laser.charge },
      // đắt hơn súng lục: nó phải là một quyết định, không phải món mua kèm
      datHon: by.shotgun.price > by.gun.price && by.laser.price > by.gun.price
    };
  });
  check('bảng đồ có súng nòng ngắn và laser', g.co);
  check('nòng ngắn ngắm được, có số viên hữu hạn', g.shotgun && g.shotgun.aim && g.shotgun.uses > 0,
    JSON.stringify(g.shotgun));
  check('laser được đánh dấu là khẩu SẠC', g.laser && g.laser.charge === true, JSON.stringify(g.laser));
  check('cả hai đều đắt hơn súng lục', g.datHon);

  // Mua về thì phải nằm trong tủ và lắp lên tay được — bằng chính đường của bộ máy.
  const kho = await p.evaluate(() => {
    REPO.giveGear('shotgun', 1); REPO.giveGear('laser', 1);
    const ok1 = REPO.equip('shotgun'), ok2 = REPO.equip('laser');
    return { ok1, ok2, tay: REPO.S.player.inv.map(x => x && x.kind) };
  });
  check('lấy được từ tủ lên tay', kho.ok1 && kho.ok2, kho.tay.join(','));
  check('bảng súng: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function nongNganSuite(b) {
  results.push('\n── súng nòng ngắn ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  await sanDo(p);
  await chonChoTrong(p, 10);

  const ban = await p.evaluate(() => {
    REPO.S.bullets.length = 0;
    const p0 = { x: REPO.S.player.x, y: REPO.S.player.y };
    REPO.fireShotgun(REPO.S.player, 0);
    return { vien: REPO.S.bullets.length,
             loai: REPO.S.bullets.every(b => b.kind === 'shot'),
             giat: REPO.S.player.recoilT,
             day: REPO.S.player.kx, p0 };
  });
  check('một phát toé đúng số viên đã khai', ban.vien === 7, ban.vien + ' viên');
  check('mọi viên đều là đạn hoa cải', ban.loai);
  check('bắn xong thì chân chậm', ban.giat > 0.5, 'giật ' + ban.giat.toFixed(2) + 's');
  check('phát bắn đẩy chính người bắn LÙI LẠI', ban.day < -100, 'kx=' + Math.round(ban.day));

  // Sát mặt thì nát, xa thì phí — đo bằng máu thật trên một con thật.
  const doSat = async (oXa) => p.evaluate(async o => {
    REPO.S.monsters.length = 0; REPO.S.bullets.length = 0;
    const pl = REPO.S.player;
    pl.recoilT = 0; pl.kx = 0; pl.ky = 0; pl.cooldown = 0;
    const m = REPO.spawnFoe('heavy', o * REPO.TILE, 0);   // 300 máu, đứng yên, đủ để hứng hết
    m.state = 'patrol'; m.alert = 0; m.speed = 0;
    const hp0 = m.hp;
    REPO.fireShotgun(pl, 0);
    await new Promise(r => setTimeout(r, 700));           // đủ cho mọi viên bay hết đời nó
    return { mat: hp0 - m.hp };
  }, oXa);
  const gan = await doSat(1.4);
  const xa  = await doSat(6.5);
  check('sát mặt thì ăn nặng', gan.mat >= 60, 'mất ' + gan.mat + ' máu ở 1,4 ô');
  check('xa thì gần như vô dụng', xa.mat < gan.mat * 0.55,
    '1,4 ô: ' + gan.mat + ' máu · 6,5 ô: ' + xa.mat + ' máu');
  check('nòng ngắn: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function laserSuite(b) {
  results.push('\n── súng laser sạc ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  await sanDo(p);
  const cho = await chonChoTrong(p, 12);
  check('tìm được một hành lang đủ dài để đo', !!cho && cho.thong >= 6,
    cho ? cho.thong + ' ô thông' : 'không có');

  // Sạc quyết định sát thương.
  const yeu = await p.evaluate(() => {
    REPO.S.player.recoilT = 0;
    return REPO.fireLaser(REPO.S.player, 0, 0);
  });
  const manh = await p.evaluate(() => {
    REPO.S.player.recoilT = 0;
    return REPO.fireLaser(REPO.S.player, 0, REPO.LASER_FULL);
  });
  check('sạc đầy mạnh hơn hẳn bắn vội', manh.dmg > yeu.dmg * 3,
    'chưa sạc ' + Math.round(yeu.dmg) + ' · sạc đầy ' + Math.round(manh.dmg));

  // Cái giá của một phát đầy: đứng chôn chân lâu hơn hẳn.
  const giat = await p.evaluate(() => {
    const pl = REPO.S.player;
    pl.recoilT = 0; REPO.fireLaser(pl, 0, 0);       const a = pl.recoilT;
    pl.recoilT = 0; REPO.fireLaser(pl, 0, REPO.LASER_FULL); const b = pl.recoilT;
    pl.recoilT = 0;
    return { a, b };
  });
  check('sạc đầy thì giật lâu hơn', giat.b > giat.a * 2,
    'vội ' + giat.a.toFixed(2) + 's · đầy ' + giat.b.toFixed(2) + 's');

  // XUYÊN: ba con xếp một hàng, một phát ăn cả ba.
  const xuyen = await p.evaluate(() => {
    REPO.S.monsters.length = 0;
    const ms = [2, 4, 6].map(o => {
      const m = REPO.spawnFoe('heavy', o * REPO.TILE, 0);
      m.state = 'patrol'; m.alert = 0; m.speed = 0; return m;
    });
    const hp0 = ms.map(m => m.hp);
    const r = REPO.fireLaser(REPO.S.player, 0, REPO.LASER_FULL);
    return { trung: r.hit, mat: ms.map((m, i) => hp0[i] - m.hp) };
  });
  check('một tia ăn cả ba con xếp hàng', xuyen.trung === 3, xuyen.trung + ' con');
  check('cả ba đều mất máu thật', xuyen.mat.every(v => v > 50), xuyen.mat.join(' / '));

  // Tia phải DỪNG ở tường, không xuyên qua nhà hàng xóm. Đo ở MỌI hướng có tường, và so
  // thẳng hai con số: tường cách bao xa, tia dài bao nhiêu. Bản test đầu chỉ bắn MỘT hướng và
  // so với tầm bắn tối đa — hướng đó tình cờ là một hành lang trống nên nó báo hỏng oan.
  const tuong = await p.evaluate(() => {
    const S = REPO.S, T = REPO.TILE, pl = S.player;
    S.monsters.length = 0;
    const xau = [];
    let doDuoc = 0;
    for (let a = 0; a < Math.PI*2 - 1e-6; a += Math.PI/12) {
      let tuongO = null;
      // Lấy mẫu ở ĐÚNG những điểm tia lấy mẫu (mỗi 6px, bắt đầu từ 6px). Bước 0,2 ô = 4,8px
      // thì hai bên rơi vào hai điểm khác nhau quanh mép ô, và ở những hướng lướt sát góc
      // tường phép đo thấy tường ở chỗ tia không thấy — đỏ vì lệch nửa bước, không phải vì
      // tia chui qua tường.
      for (let d = 6; d < T*14; d += 6) {
        const x = pl.x + Math.cos(a)*d, y = pl.y + Math.sin(a)*d;
        // Đo bằng ĐÚNG luật của tia: ô nào đặc thì tia dừng. Bản trước dò bằng hitsSolid với
        // bán kính 2 — rộng hơn cái tia — nên một hướng lướt sát góc tường báo "có tường" ở
        // 5,5 ô trong khi tia đi thẳng qua bên cạnh nó và chạy tiếp 8 ô hành lang trống. Đỏ
        // vì phép đo rộng hơn lời hứa, không phải vì tia chui qua tường.
        if (REPO.solidAt((x/T)|0, (y/T)|0)) { tuongO = d/T; break; }
      }
      if (tuongO === null) continue;             // hướng này trống hẳn, không đo được gì
      doDuoc++;
      S.beams.length = 0;
      REPO.fireLaser(pl, a, REPO.LASER_FULL);
      const bm = REPO.beams()[0];
      const dai = Math.hypot(bm.x1 - bm.x0, bm.y1 - bm.y0) / T;
      if (dai > tuongO + 0.6) xau.push(Math.round(a*180/Math.PI) + '°: tường ' +
        tuongO.toFixed(1) + ' ô mà tia dài ' + dai.toFixed(1) + ' ô');
    }
    return { doDuoc, xau };
  });
  check('tia dừng lại ở tường, không chui qua — đo mọi hướng',
    tuong.doDuoc > 0 && tuong.xau.length === 0,
    tuong.xau.length ? tuong.xau.slice(0,3).join(' | ') : 'đo được ' + tuong.doDuoc + ' hướng, không hướng nào xuyên');
  check('laser: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function giatSuite(b) {
  results.push('\n── bắn xong thì chân chậm ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  await sanDo(p);
  await chonChoTrong(p, 8);
  const d = await p.evaluate(() => {
    const pl = REPO.S.player;
    pl.recoilT = 0; pl.kx = 0; pl.ky = 0;
    const thuong = REPO.playerSpeed(pl);
    REPO.fireShotgun(pl, 0);
    const dangGiat = REPO.playerSpeed(pl);
    return { thuong, dangGiat, giatT: pl.recoilT };
  });
  check('đang giật thì đi chậm hẳn', d.dangGiat < d.thuong * 0.6,
    Math.round(d.thuong) + ' → ' + Math.round(d.dangGiat));
  await p.waitForTimeout(1400);
  const sau = await p.evaluate(() => ({ giatT: REPO.recoil(), toc: REPO.playerSpeed(REPO.S.player) }));
  check('hết giật thì tốc độ trả lại như cũ', sau.giatT === 0 && sau.toc > d.thuong * 0.9,
    'còn ' + sau.giatT.toFixed(2) + 's, tốc ' + Math.round(sau.toc));
  check('giật: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
// Cử chỉ SẠC — bấm bằng ngón tay thật và phím thật.
// =====================================================================
async function cuChiSacSuite(b) {
  results.push('\n── cử chỉ sạc: ngón tay thật và phím thật ──');
  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await open(b, vp);
    await sanDo(p);
    await chonChoTrong(p, 8);
    await p.evaluate(() => {
      REPO.S.player.inv = [null, null, null];
      REPO.giveGear('laser', 3); REPO.equip('laser');
    });
    await p.waitForTimeout(120);

    const o = await p.evaluate(() => {
      const h = REPO.hud(), r = document.getElementById('game').getBoundingClientRect();
      const s = h.slots[0];
      return s ? { x: r.left + s.x * (r.width / h.w), y: r.top + s.y * (r.height / h.h) } : null;
    });
    check('[' + ten + '] tìm được ô đồ trên HUD', !!o);
    if (!o) { await ctx.close(); continue; }

    // >>> GIỮ NGÓN TAY THẬT trên ô đồ <<<
    await p.touchscreen.tap(o.x + 400, o.y).catch(() => {});    // chạm chỗ khác cho sạch trạng thái
    await p.waitForTimeout(150);
    await p.evaluate(() => { REPO.S.player.cooldown = 0; REPO.S.player.recoilT = 0; REPO.S.beams.length = 0; });
    await p.evaluate(() => { REPO.S.lastLaser = null; });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: o.x, y: o.y }] });
    await p.waitForTimeout(150);
    const sac0 = await p.evaluate(() => REPO.charge());
    await p.waitForTimeout(800);
    const sac1 = await p.evaluate(() => REPO.charge());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(250);
    // Vệt sáng của tia chỉ sống 0,2 giây, nên đếm "tia đang bay" là một cách đo rất dễ trượt —
    // và nó trượt thật ở bản test đầu tiên. Hỏi thẳng phát bắn vừa rồi mới là đo đúng thứ cần đo.
    const sauBan = await p.evaluate(() => ({ ban: REPO.lastLaser(), sac: REPO.charge(),
                                             giat: REPO.recoil() }));
    check('[' + ten + '] giữ ô đồ thì mức sạc tăng dần',
      sac0 && sac0.slot === 0 && sac1.t > sac0.t + 0.4,
      (sac0 ? sac0.t.toFixed(2) : '?') + 's → ' + sac1.t.toFixed(2) + 's');
    check('[' + ten + '] buông tay là bắn, và bắn với mức sạc vừa giữ được',
      !!sauBan.ban && sauBan.ban.charge > 0.7,
      sauBan.ban ? 'sạc ' + (sauBan.ban.charge*100).toFixed(0) + '% · ' +
                   Math.round(sauBan.ban.dmg) + ' sát thương' : 'không bắn');
    check('[' + ten + '] bắn xong thì thôi sạc và bị giật',
      sauBan.sac.slot === -1 && sauBan.giat > 0.2, JSON.stringify(sauBan.sac));

    // >>> GIỮ PHÍM THẬT <<<
    await p.evaluate(() => { REPO.S.player.cooldown = 0; REPO.S.player.recoilT = 0;
                             REPO.S.beams.length = 0; REPO.S.lastLaser = null; });
    await p.keyboard.down('1');
    await p.waitForTimeout(700);
    const sacPhim = await p.evaluate(() => REPO.charge());
    await p.keyboard.up('1');
    await p.waitForTimeout(250);
    const sauPhim = await p.evaluate(() => ({ ban: REPO.lastLaser(), sac: REPO.charge() }));
    check('[' + ten + '] giữ phím số cũng sạc được', sacPhim.slot === 0 && sacPhim.t > 0.4,
      sacPhim.t.toFixed(2) + 's');
    check('[' + ten + '] nhả phím là bắn, đúng mức sạc vừa giữ',
      !!sauPhim.ban && sauPhim.ban.charge > 0.5 && sauPhim.sac.slot === -1,
      sauPhim.ban ? 'sạc ' + (sauPhim.ban.charge*100).toFixed(0) + '%' : 'không bắn');
    check('[' + ten + '] cử chỉ sạc: không lỗi trang', errs.length === 0, errs[0] || '');
    await ctx.close();
  }
}

// =====================================================================
async function ngamSuite(b) {
  results.push('\n── ngắm tự động phải CHÍNH XÁC ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  await sanDo(p);
  await chonChoTrong(p, 10);

  // 1. ĐÓN ĐẦU: con quái chạy ngang thì phải ngắm TRƯỚC mặt nó, không phải vào chỗ nó đang đứng.
  const don = await p.evaluate(() => {
    REPO.S.monsters.length = 0;
    const m = REPO.spawnFoe('patrol', REPO.TILE * 6, 0);
    m.state = 'patrol'; m.alert = 0;
    m.vx = 0; m.vy = 150;                              // đang chạy xuống với tốc độ thật
    const thang = Math.atan2(m.y - REPO.S.player.y, m.x - REPO.S.player.x);
    const don   = REPO.autoAimAngle(REPO.S.player, 'gun', 0);
    return { thang, don, lech: Math.abs(REPO.angDiff(don, thang)) };
  });
  check('ngắm đón đầu con đang chạy ngang', don.lech > 0.05,
    'lệch trước mặt nó ' + (don.lech * 180 / Math.PI).toFixed(1) + '°');

  // ...và đứng yên thì KHÔNG được đón đầu, nếu không là bắn hụt một con đứng im.
  const yen = await p.evaluate(() => {
    REPO.S.monsters.length = 0;
    const m = REPO.spawnFoe('patrol', REPO.TILE * 6, 0);
    m.state = 'patrol'; m.alert = 0; m.vx = 0; m.vy = 0;
    const thang = Math.atan2(m.y - REPO.S.player.y, m.x - REPO.S.player.x);
    return Math.abs(REPO.angDiff(REPO.autoAimAngle(REPO.S.player, 'gun', 0), thang));
  });
  check('con đứng yên thì ngắm thẳng vào nó', yen < 0.02,
    'lệch ' + (yen * 180 / Math.PI).toFixed(2) + '°');

  // 2. KHÔNG QUAY RA SAU LƯNG. Đây là lỗi cũ: bản trước chỉ xét khoảng cách, nên một con
  //    đứng sau lưng mà gần hơn thì cú bấm quay ngoắt người chơi lại và bắn ra sau.
  const sauLung = await p.evaluate(() => {
    REPO.S.monsters.length = 0;
    const sau = REPO.spawnFoe('patrol', -REPO.TILE * 2.5, 0);   // gần hơn, nhưng ở SAU LƯNG
    const truoc = REPO.spawnFoe('patrol', REPO.TILE * 5, 0);    // xa hơn, nhưng ở TRƯỚC MẶT
    [sau, truoc].forEach(m => { m.state = 'patrol'; m.alert = 0; m.vx = 0; m.vy = 0; });
    const ang = REPO.autoAimAngle(REPO.S.player, 'gun', 0);     // đang nhìn sang phải
    return { ang, raSau: Math.abs(REPO.angDiff(ang, 0)) > Math.PI / 2 };
  });
  check('không quay ra sau lưng để bắn con gần hơn', sauLung.raSau === false,
    'góc ' + (sauLung.ang * 180 / Math.PI).toFixed(0) + '°');

  // 3. KHÔNG NGẮM XUYÊN TƯỜNG.
  const tuong = await p.evaluate(() => {
    const S = REPO.S, T = REPO.TILE, pl = S.player;
    S.monsters.length = 0;
    // tìm một ô ĐẶC gần đó và đặt con quái ở ngay phía sau nó
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
      for (let d = T; d < T * 8; d += T * 0.5) {
        const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
        if (!REPO.solidAt((x / T) | 0, (y / T) | 0)) continue;
        const bx = pl.x + Math.cos(a) * (d + T * 1.5), by = pl.y + Math.sin(a) * (d + T * 1.5);
        if (REPO.solidAt((bx / T) | 0, (by / T) | 0)) continue;
        const m = REPO.spawnFoe('patrol', bx - pl.x, by - pl.y);
        m.state = 'patrol'; m.alert = 0; m.vx = 0; m.vy = 0;
        return { co: true, nhan: REPO.aimTargets(pl, 'gun').length };
      }
    }
    return { co: false };
  });
  check('con nấp sau tường thì không được nhận làm mục tiêu',
    !tuong.co || tuong.nhan === 0, tuong.co ? tuong.nhan + ' mục tiêu' : 'không dựng được cảnh');

  // 4. TRỢ NGẮM: kéo lệch ít thì hút vào, kéo lệch nhiều thì để yên cho người chơi.
  const tro = await p.evaluate(() => {
    REPO.S.monsters.length = 0;
    const m = REPO.spawnFoe('patrol', REPO.TILE * 5, 0);
    m.state = 'patrol'; m.alert = 0; m.vx = 0; m.vy = 0;
    const thang = Math.atan2(m.y - REPO.S.player.y, m.x - REPO.S.player.x);
    const gan = REPO.aimAssist(REPO.S.player, 'gun', thang + 0.14);   // lệch 8°
    const xa  = REPO.aimAssist(REPO.S.player, 'gun', thang + 0.60);   // lệch 34°
    return { hutVao: Math.abs(REPO.angDiff(gan, thang)) < 0.01,
             deYen: Math.abs(REPO.angDiff(xa, thang + 0.60)) < 0.01,
             arc: REPO.AIM_ASSIST_ARC };
  });
  check('kéo lệch 8° thì nòng súng hút vào con quái', tro.hutVao);
  check('kéo lệch 34° thì KHÔNG bẻ hướng của người chơi', tro.deYen,
    'cửa sổ hút ' + (tro.arc * 180 / Math.PI).toFixed(0) + '°');

  // 5. LASER ưu tiên hướng XẾP ĐƯỢC NHIỀU CON NHẤT.
  const hang = await p.evaluate(() => {
    const T = REPO.TILE, pl = REPO.S.player;
    REPO.S.monsters.length = 0;
    // ba con xếp một hàng sang phải, một con lẻ ở gần hơn nhưng chếch xuống
    [3, 5, 7].forEach(o => { const m = REPO.spawnFoe('patrol', o * T, 0);
                             m.state = 'patrol'; m.alert = 0; m.vx = 0; m.vy = 0; });
    const le = REPO.spawnFoe('patrol', T * 2, T * 2);
    le.state = 'patrol'; le.alert = 0; le.vx = 0; le.vy = 0;
    const ang = REPO.autoAimAngle(pl, 'laser', 0);
    return { ang, xuyen: REPO.pierceCount(pl, ang) };
  });
  check('laser chọn hướng xuyên được nhiều con nhất', hang.xuyen >= 3,
    'xuyên ' + hang.xuyen + ' con');

  // 6. Ngắm xong thì BẮN TRÚNG THẬT — đo bằng máu, không đo bằng góc.
  const trung = await p.evaluate(async () => {
    REPO.S.monsters.length = 0; REPO.S.bullets.length = 0;
    const pl = REPO.S.player;
    pl.cooldown = 0; pl.recoilT = 0;
    const m = REPO.spawnFoe('heavy', REPO.TILE * 5, 0);
    m.state = 'patrol'; m.alert = 0; m.speed = 0; m.vx = 0; m.vy = 0;
    const hp0 = m.hp;
    pl.inv[0] = { kind: 'gun', uses: 20 };
    for (let i = 0; i < 5; i++) {
      pl.cooldown = 0;
      REPO.useSlot(pl, 0, REPO.autoAimAngle(pl, 'gun', 0));
      await new Promise(r => setTimeout(r, 130));
    }
    await new Promise(r => setTimeout(r, 400));
    return { mat: hp0 - m.hp };
  });
  check('năm phát ngắm tự động thì trúng thật', trung.mat >= 75, 'mất ' + trung.mat + ' máu');
  check('ngắm: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
// MOT DON KHONG DUOC GIET BAN TU DAY MAU, va sat thuong quai tang theo man.
// Ke nang danh 100, mau goc cung dung 100 - nen mot don "khong dinh giet" lai thanh giet
// ngay, va nguoi choi chua kip hieu vi sao thi da mat ca ca truc.
// =====================================================================
async function sucBenSuite(b) {
  results.push('\n── một đòn không giết được người đầy máu ──');
  const { ctx, p, errs } = await open(b, { width: 844, height: 390 });
  await sanDo(p);

  const nang = await p.evaluate(() => {
    const pl = REPO.S.player;
    pl.hp = pl.hpMax; pl.invulnT = 0; pl.kx = 0; pl.ky = 0;
    const max = pl.hpMax;
    REPO.hurtPlayer(9999, 'test');          // một đòn to hơn cả thanh máu
    return { max, con: pl.hp, chet: REPO.S.dead };
  });
  check('đầy máu mà ăn một đòn cực nặng thì VẪN CÒN SỐNG',
    nang.con > 0 && !nang.chet, nang.max + ' máu → còn ' + nang.con);
  check('nhưng nó lấy đi phần lớn thanh máu',
    nang.con <= nang.max * 0.30, 'còn ' + Math.round(nang.con / nang.max * 100) + '%');

  // ...và đòn THỨ HAI thì giết được. Luật này không được phép thành bất tử.
  const hai = await p.evaluate(() => {
    const pl = REPO.S.player;
    pl.invulnT = 0;
    REPO.hurtPlayer(9999, 'test');
    return { con: pl.hp, chet: REPO.S.dead || pl.down };
  });
  check('đòn thứ hai thì giết được — không phải bất tử', hai.con <= 0 || hai.chet,
    'còn ' + hai.con + ' máu, gục=' + hai.chet);

  // Sát thương quái tăng theo màn.
  const theoMan = await p.evaluate(() => {
    const goc = REPO.S.level;
    const d = {};
    [1, 5, 10, 20].forEach(lv => {
      REPO.S.level = lv;
      REPO.S.monsters.length = 0;
      const m = REPO.spawnFoe('heavy', REPO.TILE * 3, 0);
      d[lv] = m.dmg;
      REPO.S.monsters.length = 0;
    });
    REPO.S.level = goc;
    return d;
  });
  check('sát thương quái tăng dần theo màn',
    theoMan[20] > theoMan[10] && theoMan[10] > theoMan[5] && theoMan[5] > theoMan[1],
    'màn 1: ' + theoMan[1] + ' · màn 5: ' + theoMan[5] +
    ' · màn 10: ' + theoMan[10] + ' · màn 20: ' + theoMan[20]);
  check('màn cuối mạnh gần gấp đôi màn đầu',
    theoMan[20] >= theoMan[1] * 1.8 && theoMan[20] <= theoMan[1] * 2.2,
    'x' + (theoMan[20] / theoMan[1]).toFixed(2));
  check('sức bền: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
(async () => {
  const b = await chromium.launch();
  const run = async (ten, fn) => {
    try { await fn(b); } catch (e) { check(ten + ': bộ test chạy trọn', false, e.message); }
  };
  await run('bảng súng', bangSungSuite);
  await run('nòng ngắn', nongNganSuite);
  await run('laser', laserSuite);
  await run('giật', giatSuite);
  await run('cử chỉ sạc', cuChiSacSuite);
  await run('ngắm', ngamSuite);
  await run('sức bền', sucBenSuite);
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
