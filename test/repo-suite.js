/*
 * Bộ kiểm thử tự động cho cả hai bản REPO trên hub.
 * Chạy: node test/repo-suite.js
 * Mỗi ca chạy trên trình duyệt thật (Chromium), kích thước điện thoại thật.
 */
// Playwright được lấy từ bản cài toàn máy; đổi đường dẫn này nếu máy khác.
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const R2D = root + '/games/repo2d/index.html';
const SQ  = root + '/games/repo-squad/index.html';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else    { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

async function openGame(b, url, vp) {
  const ctx = await b.newContext({ viewport: vp, isMobile: vp.width > vp.height,
    hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(url);
  await p.waitForTimeout(1100);
  return { ctx, p, errs };
}

// =====================================================================
async function repo2dSuite(b) {
  results.push('\n── repo2d (Ca Trực Đêm) ──');
  const { ctx, p, errs } = await openGame(b, R2D, { width: 844, height: 390 });

  check('trang mở không lỗi', errs.length === 0, errs[0] || '');
  check('không còn tấm chắn xoay dọc',
    await p.evaluate(() => !document.querySelector('.rotate')));

  await p.locator('#veilBtn').click();
  await p.waitForTimeout(900);
  await p.evaluate(() => { REPO.S.cut = null; REPO.S.running = true; });
  await p.waitForTimeout(300);

  // --- móc cắm mặc định phải giữ nguyên hành vi cũ ---
  const st = await p.evaluate(() => ({
    hooks: Object.keys(REPO.hooks || {}),
    allNull: Object.values(REPO.hooks || {}).every(v => v === null),
    mates: (REPO.S.mates || []).length,
    crew: REPO.crew().length,
    mateCountConst: REPO.CREW.COUNT
  }));
  const CAN = ['mateCount','mateInfo','playerInfo','onLevelClear','onPayout','levelIndex','skill'];
  check('bảng điểm cắm có đủ móc', CAN.every(k => st.hooks.indexOf(k) >= 0),
    st.hooks.join(','));
  check('mọi móc mặc định là null', st.allNull);
  check('số bot mặc định không đổi', st.mates === st.mateCountConst,
    st.mates + ' bot, hằng số ' + st.mateCountConst);
  check('cả tổ = người chơi + bot', st.crew === st.mates + 1, st.crew + ' người');
  // Cân bằng của repo2d KHÔNG được dịch vì thay đổi làm cho game kia.
  const qm = await p.evaluate(() => ({
    crewOn: REPO.S.crewOn, mates: (REPO.S.mates || []).length,
    quota: REPO.S.quotaTotal
  }));
  check('tổ mặc định của repo2d cho hệ số chỉ tiêu đúng 1.0',
    Math.abs((0.4 + 0.15 * Math.min(1 + qm.mates, 4)) - 1.0) < 1e-9,
    'tổ ' + (1 + qm.mates) + ' người → ' + (0.4 + 0.15 * Math.min(1 + qm.mates, 4)));

  // --- khung ngang ---
  const fr = await p.evaluate(() => {
    const f = REPO.frame();
    return { w: f.w, h: f.h, tw: f.worldW / REPO.TILE, th: f.worldH / REPO.TILE,
             px: f.zoom * REPO.TILE, land: document.body.classList.contains('landscape') };
  });
  check('khung ngang tràn hết bề ngang', fr.w >= 840, Math.round(fr.w) + 'px / 844px');
  check('cờ landscape bật', fr.land);
  check('ô nằm ngang to hơn 28px', fr.px > 28, fr.px.toFixed(1) + ' px mỗi ô');

  // --- HUD nằm gọn bên phải ---
  const hud = await p.evaluate(() => {
    const h = REPO.hudLayout();
    const xs = h.slots.map(s => s.x).concat([h.grab.x, h.sprint.x, h.stash.x]);
    return { w: h.w, minX: Math.min.apply(null, xs), heartY: h.heart.y,
             leftStick: h.left.x, rightStick: h.right.x };
  });
  check('mọi nút nằm trong 1/3 bên phải', hud.minX > hud.w * 0.66,
    'trái nhất ' + Math.round(hud.minX) + ' / ' + Math.round(hud.w * 0.66));
  check('trái tim không nằm giữa màn', hud.heartY > fr.h * 0.75,
    'y=' + Math.round(hud.heartY) + ' / khung cao ' + Math.round(fr.h));

  // --- tự ngắm ---
  const aim = await p.evaluate(() => {
    const S = REPO.S, pl = S.player, T = REPO.TILE;
    // Dat sung vao DUNG o 0 - o ma phep do se bam vao. equip() tu chon o trong dau
    // tien, nen neu o 0 da co gi do tu buoc truoc thi sung roi vao o 1 va cu bam
    // vao o 0 khong ban ra gi ca. Do la mot phep do bap benh, khong phai mot bug.
    REPO.giveGear('gun', 2); REPO.equip('gun');
    if (!(pl.inv[0] && pl.inv[0].kind === 'gun')){
      const i = pl.inv.findIndex(x => x && x.kind === 'gun');
      if (i > 0){ const t = pl.inv[0]; pl.inv[0] = pl.inv[i]; pl.inv[i] = t; }
    }
    if (!(pl.inv[0] && pl.inv[0].kind === 'gun')) return { ok: false, why: 'không đặt được súng vào ô 1' };
    REPO.populateFoes();
    if (!S.monsters.length) return { ok: false, why: 'không có quái' };
    const m = S.monsters[0];
    let ang = null;
    for (let a = 0; a < 16; a++) {
      const t = a * Math.PI / 8, x = pl.x + Math.cos(t) * T * 3, y = pl.y + Math.sin(t) * T * 3;
      if (REPO.losClear(pl.x, pl.y, x, y)) { m.x = x; m.y = y; ang = t; break; }
    }
    if (ang === null) return { ok: false, why: 'không có hướng nhìn thông' };
    S.monsters.length = 1; m.sleep = 0; m.hp = 100; m.alert = 3; m.state = 'chase';
    pl.dir = ang + Math.PI; pl.cooldown = 0; pl.down = false; S.dead = false;
    S.bullets.length = 0;
    return { ok: true };
  });
  if (aim.ok) {
    const g = await p.evaluate(() => {
      const cv = document.querySelector('#game'), r = cv.getBoundingClientRect();
      const h = REPO.hudLayout();
      return { l: r.left, t: r.top, x: h.slots[0].x, y: h.slots[0].y };
    });
    await p.mouse.move(g.l + g.x, g.t + g.y);
    await p.mouse.down(); await p.waitForTimeout(50); await p.mouse.up();
    await p.waitForTimeout(25);
    const shot = await p.evaluate(() => {
      const S = REPO.S, pl = S.player, b = S.bullets[0];
      if (!b) return { ban: false, vi: { o: pl.inv.map(x => x && x.kind + 'x' + x.uses),
                                         aim: pl.aimSlot, cd: +pl.cooldown.toFixed(2),
                                         chay: S.running, guc: pl.down } };
      const gd = Math.atan2(b.vy, b.vx);
      const gq = Math.atan2(S.monsters[0].y - pl.y, S.monsters[0].x - pl.x);
      return { ban: true, vsQuai: Math.abs(REPO.angDiff(gd, gq)),
               vsNguoi: Math.abs(REPO.angDiff(gd, pl.dir)) };
    });
    check('chạm nhanh ô đồ thì bắn ra đạn', shot.ban, shot.ban ? '' : JSON.stringify(shot.vi || {}));
    check('đạn bay vào con quái chứ không theo hướng mặt',
      shot.ban && shot.vsQuai < 0.15 && shot.vsNguoi > 1.0,
      shot.ban ? ('lệch quái ' + shot.vsQuai.toFixed(3) + ' rad, lệch mặt ' + shot.vsNguoi.toFixed(2) + ' rad') : '');
  } else check('dựng được cảnh thử tự ngắm', false, aim.why);

  // --- tủ đồ: ba ô trên tay phải rỗng ở mỗi trạm ---
  const stash = await p.evaluate(async () => {
    const S = REPO.S;
    const log = [];
    for (let round = 1; round <= 5; round++) {
      REPO.startShop();
      S.cut = null; S.running = true;
      REPO.giveGear('heal', 1); REPO.giveGear('gun', 1);
      S.player.x = S.car.x; S.player.y = S.car.y + 18;
      S.player.down = false; S.dead = false;
      REPO.toggleStash();
      const invTrong = S.player.inv.every(x => !x);
      const nutTrongTu = document.querySelectorAll('[data-stash]').length;
      if (nutTrongTu) document.querySelectorAll('[data-stash]')[0].click();
      const layDuoc = S.player.inv.some(x => x);
      log.push({ round, invTrong, nutTrongTu, layDuoc });
      const b = document.querySelector('#veilBtn'); if (b) b.click();
      S.shopMode = false; S.level++; REPO.startLevel(1000 + S.level);
      S.cut = null; S.running = true;
    }
    return log;
  });
  check('mỗi ca vào trạm là ba ô trên tay rỗng', stash.every(r => r.invTrong),
    stash.map(r => 'ca' + r.round + (r.invTrong ? '✓' : '✗')).join(' '));
  check('ca nào cũng lấy được đồ ra khỏi tủ', stash.every(r => r.layDuoc),
    stash.map(r => 'ca' + r.round + (r.layDuoc ? '✓' : '✗')).join(' '));

  const errs2 = errs.filter(e => !/sight|col|populateFoes/.test(e));
  check('không có lỗi console suốt ca chạy', errs2.length === 0, errs2.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
async function repoSquadSuite(b) {
  results.push('\n── repo-squad (Biệt Đội) — chạy CHUNG bộ máy repo2d ──');

  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await openGame(b, SQ, vp);
    await p.waitForTimeout(500);
    check('[' + ten + '] trang mở không lỗi', errs.length === 0, errs[0] || '');

    // --- nạp đúng một bộ máy, không có bản sao thứ hai ---
    const nap = await p.evaluate(() => ({
      coREPO: !!window.REPO, coSQ: !!window.SQ, coGlue: !!(window.SQ && SQ.squad),
      // file của bộ máy cũ phải KHÔNG còn được nạp nữa
      simCu: !!(window.SQ && SQ.startRun), worldCu: !!(window.SQ && SQ.genLevel),
      scripts: [...document.querySelectorAll('script[src]')].map(x => x.getAttribute('src'))
    }));
    check('[' + ten + '] nạp bộ máy repo2d', nap.coREPO);
    check('[' + ten + '] nạp tầng meta Biệt Đội', nap.coSQ && nap.coGlue);
    check('[' + ten + '] KHÔNG còn bộ máy thứ hai', !nap.simCu && !nap.worldCu);
    check('[' + ten + '] dùng chung file game.js của repo2d',
      nap.scripts.some(x => /\.\.\/repo2d\/game\.js/.test(x)),
      nap.scripts.filter(x => /game|sim/.test(x)).join(' '));

    // --- meta còn nguyên ---
    const m = await p.evaluate(() => ({
      chars: Object.keys(SQ.M.chars).length, lead: SQ.M.squad.lead,
      // mateCount là HÀM: nó phải đổi theo tổ, không phải một con số đặt cứng lúc nạp trang
      mateCountLaHam: typeof REPO.hooks.mateCount === 'function',
      mateCount: typeof REPO.hooks.mateCount === 'function' ? REPO.hooks.mateCount() : REPO.hooks.mateCount,
      land: document.body.classList.contains('landscape')
    }));
    check('[' + ten + '] acc mới đúng một xác', m.chars === 1, m.chars + ' xác');
    check('[' + ten + '] ô BẠN CẦM không rỗng', !!m.lead);
    check('[' + ten + '] số bot tính theo tổ chứ không đặt cứng', m.mateCountLaHam);
    check('[' + ten + '] acc một xác thì không có bot nào', m.mateCount === 0, String(m.mateCount));
    check('[' + ten + '] cờ landscape đúng', m.land === (vp.width > vp.height));

    // --- đội hình ---
    const squad = await p.evaluate(() => {
      ['hue','tam','ky','linh'].forEach(id => { SQ.M.chars[id] = { lv:1, shard:0, equip:{} }; });
      SQ.autoFill();
      for (let i = 0; i < 4; i++) SQ.setMate(i, null);
      const leadConSau = SQ.M.squad.lead;
      const chan = SQ.setMate(0, SQ.M.squad.lead) === false;
      SQ.autoFill(); SQ.ui.render();
      return { leadConSau, chan, crew: SQ.squadList().length };
    });
    check('[' + ten + '] tháo hết bot vẫn giữ ô BẠN CẦM', !!squad.leadConSau);
    check('[' + ten + '] chặn hạ xác đang cầm xuống ô trống', squad.chan);
    check('[' + ten + '] xếp tự động đủ năm người', squad.crew === 5, squad.crew + ' người');

    // --- vào ca thật ---
    await p.evaluate(() => SQ.ui.go('home'));
    await p.waitForTimeout(250);
    await p.evaluate(() => [...document.querySelectorAll('.b')]
      .find(x => x.textContent.includes('ĐI CA')).click());
    await p.waitForTimeout(1300);
    await p.evaluate(() => { REPO.S.cut = null; REPO.S.running = true; });
    await p.waitForTimeout(500);

    const r = await p.evaluate(() => {
      const S = REPO.S, h = REPO.hudLayout();
      return {
        inRun: document.body.classList.contains('in-run'),
        crew: REPO.crew().length,
        tenBot: (S.mates || []).map(x => x.name),
        xeDay: !!S.cart, cua: (S.doors || []).length, be: S.pads.length,
        chiTieu: S.quotaTotal, tang: SQ.squad.run() && SQ.squad.run().floor,
        nutKyNang: !!h.skill, nutNhat: !!h.grab, nutChay: !!h.sprint, nutTu: !!h.stash,
        oDo: h.slots.length, denPin: REPO.coneRadius(S.player) > 0
      };
    });
    check('[' + ten + '] vào ca đủ năm người', r.crew === 5, r.crew + ' người');
    check('[' + ten + '] bot mang đúng tên xác trong tổ',
      r.tenBot.length === 4 && r.tenBot.every(n => /^[A-Z]/.test(n)), r.tenBot.join(', '));
    check('[' + ten + '] CÓ xe đẩy', r.xeDay);
    check('[' + ten + '] CÓ cửa', r.cua > 0, r.cua + ' cửa');
    check('[' + ten + '] CÓ đèn pin hình nón', r.denPin);
    check('[' + ten + '] CÓ nút nhặt / chạy / tủ đồ', r.nutNhat && r.nutChay && r.nutTu);
    check('[' + ten + '] CÓ ba ô đồ', r.oDo === 3, r.oDo + ' ô');
    check('[' + ten + '] CÓ nút kỹ năng', r.nutKyNang);
    check('[' + ten + '] chỉ tiêu do bộ máy repo2d sinh', r.chiTieu > 0, '$' + r.chiTieu);
    check('[' + ten + '] bắt đầu ở tầng 1', r.tang === 1, 'tầng ' + r.tang);

    const errs3 = errs.filter(e => !/favicon/.test(e));
    check('[' + ten + '] không lỗi console', errs3.length === 0, errs3.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // --- số bot phải KHỚP số người thật trong tổ ---
  // Lỗi đã gặp: H.mateCount đặt cứng 4 nên tài khoản mới chỉ có một xác vẫn thấy
  // bốn con "Tổ 2..5" vô danh đi theo. Chốt lại bằng phép kiểm này.
  {
    const { ctx, p, errs } = await openGame(b, SQ, { width: 844, height: 390 });
    await p.waitForTimeout(500);
    const rows = [];
    for (const n of [0, 1, 2, 4]) {
      rows.push(await p.evaluate(nMate => {
        SQ.M.chars = { bao: { lv:1, shard:0, equip:{} } };
        ['hue','tam','ky','linh'].slice(0, nMate)
          .forEach(id => { SQ.M.chars[id] = { lv:1, shard:0, equip:{} }; });
        SQ.M.squad = { lead:'bao', mates:[null,null,null,null] };
        SQ.autoFill();
        SQ.squad.enter('k3');
        REPO.S.cut = null; REPO.S.running = true;
        return { meta: SQ.squadList().length, bot: (REPO.S.mates || []).length,
                 ten: (REPO.S.mates || []).map(m => m.name),
                 chiTieu: REPO.S.quotaTotal };
      }, n));
    }
    check('số bot khớp số người thật trong tổ',
      rows.every(r => r.bot === r.meta - 1),
      rows.map(r => r.meta + '→' + r.bot).join('  '));
    check('không đẻ ra bot vô danh "Tổ N"',
      rows.every(r => r.ten.every(t => !/^Tổ \d/.test(t))),
      rows.map(r => '[' + (r.ten.join(',') || '—') + ']').join(' '));
    check('chỉ tiêu co theo số người',
      rows[0].chiTieu < rows[3].chiTieu,
      'một mình $' + rows[0].chiTieu + ' · đủ tổ $' + rows[3].chiTieu);
    const e0 = errs.filter(e => !/favicon/.test(e));
    check('tổ thiếu người: không lỗi console', e0.length === 0, e0.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // --- map hữu hạn: hết tầng cuối là phá đảo, không đẻ tầng tiếp ---
  {
    const { ctx, p, errs } = await openGame(b, SQ, { width: 844, height: 390 });
    await p.waitForTimeout(500);
    const fin = await p.evaluate(async () => {
      ['hue','tam','ky','linh'].forEach(id => { SQ.M.chars[id] = { lv:1, shard:0, equip:{} }; });
      SQ.autoFill();
      SQ.squad.enter('k3');                       // Khu Tập Thể K3 — 3 tầng
      const m = SQ.MAP_BY_ID['k3'];
      const buoc = [];
      for (let i = 1; i <= m.floors; i++) {
        const truoc = SQ.squad.run() ? SQ.squad.run().floor : null;
        const chan = REPO.hooks.onLevelClear();   // giả lập "xong tầng"
        buoc.push({ tang: truoc, chanTram: chan });
      }
      return { floors: m.floors, buoc,
               daPhaDao: SQ.M.maps['k3'].cleared,
               conTrongCa: !!SQ.squad.run(),
               vang: SQ.M.gold };
    });
    check('map 3 tầng thì hai tầng đầu VẪN mở trạm dịch vụ',
      fin.buoc.slice(0, -1).every(x => x.chanTram === false),
      fin.buoc.map(x => 't' + x.tang + (x.chanTram ? '→hết' : '→trạm')).join(' '));
    check('tầng cuối thì phá đảo chứ không mở trạm',
      fin.buoc[fin.buoc.length - 1].chanTram === true);
    check('map được đánh dấu đã phá đảo', fin.daPhaDao);
    check('ra khỏi ca sau khi phá đảo', !fin.conTrongCa);
    check('có cộng thưởng phá đảo', fin.vang > 5000, fin.vang + ' vàng');

    const e2 = errs.filter(e => !/favicon/.test(e));
    check('map hữu hạn: không lỗi console', e2.length === 0, e2.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // --- kỹ năng: mười bốn cái đều gọi được, không cái nào ném lỗi ---
  {
    const { ctx, p, errs } = await openGame(b, SQ, { width: 844, height: 390 });
    await p.waitForTimeout(500);
    const sk = await p.evaluate(async () => {
      SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv:1, shard:0, equip:{} }; });
      SQ.squad.enter('k3');
      REPO.S.cut = null; REPO.S.running = true;
      REPO.populateFoes();
      const out = [];
      for (const c of SQ.CHARS) {
        SQ.M.squad.lead = c.id;
        REPO.hooks.skill.icon = '✳';
        let loi = null;
        try {
          // ép hồi chiêu xong rồi bấm
          REPO.S.time += 999;
          REPO.hooks.skill.use();
        } catch (e) { loi = e.message; }
        out.push({ id: c.id, ten: c.skill.name, loi: loi });
      }
      return out;
    });
    const hong = sk.filter(x => x.loi);
    check('cả 14 kỹ năng gọi được không ném lỗi', hong.length === 0,
      hong.length ? hong.map(x => x.id + ': ' + x.loi).join(' | ') : sk.length + ' kỹ năng');
    const e3 = errs.filter(e => !/favicon|sight|col/.test(e));
    check('kỹ năng: không lỗi console', e3.length === 0, e3.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// =====================================================================
// ĐẬP ĐÈN PIN + SỨC NỔ CỦA BOM
// Đo bằng thế giới thật: đặt quái ở đúng khoảng cách rồi xem máu tụt bao nhiêu, bị
// hất đi bao xa, và cú chạm nhẹ vào cần gạt phải có tự quay sang con quái không.
async function meleeSuite(b) {
  results.push('\n── đập đèn pin & sức nổ của bom ──');
  const { ctx, p, errs } = await openGame(b, R2D, { width: 390, height: 844 });
  await p.click('#veilBtn');
  await p.waitForTimeout(300);

  // Bo qua doan cat canh dau man TRUOC khi do cham. Neu khong, cu cham dau tien bi
  // skipCut() nuot de tat doan phim - phep do se bao "cham khong an" trong khi cai
  // that su xay ra la nguoi choi vua bo qua doan mo dau.
  await p.evaluate(() => { REPO.S.cut = null; REPO.S.running = true; });
  await p.waitForTimeout(120);

  const don = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0;
    pl.swingCd = 0; pl.dir = 0; pl.str = 30;
    const m = REPO.spawnFoe('listen', 30, 0);        // ngay trước mặt, trong tầm với
    m.hp = 400; m.kx = 0; m.ky = 0;
    const truoc = { hp: m.hp, x: m.x };
    REPO.meleeSwing(pl, null);
    return { mat: truoc.hp - m.hp, day: Math.abs(m.kx) > 100,
             cd: pl.swingCd, ve: pl.swingT > 0, str: pl.str };
  });
  check('đập trúng thì quái mất máu theo SỨC của mình', don.mat === 27,
    'sức ' + don.str + ' → ' + don.mat + ' sát thương');
  check('đập trúng thì quái bị hất lui', don.day);
  check('đập xong phải chờ hồi', don.cd > 0.4, don.cd.toFixed(2) + 's');

  const hut = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.swingCd = 0; pl.dir = 0;
    const sau = REPO.spawnFoe('listen', -30, 0);     // ngay SAU lưng
    const xa  = REPO.spawnFoe('listen', 90, 0);      // trước mặt nhưng ngoài tầm
    sau.hp = 400; xa.hp = 400;
    REPO.meleeSwing(pl, null);
    return { sauLung: 400 - sau.hp, ngoaiTam: 400 - xa.hp };
  });
  check('không đập trúng con đứng sau lưng', hut.sauLung === 0, hut.sauLung + ' sát thương');
  check('không với tới con ngoài tầm', hut.ngoaiTam === 0, hut.ngoaiTam + ' sát thương');

  // Chạm NHẸ vào cần gạt phải: phải tự quay sang con quái rồi đập.
  // Dùng cú chạm THẬT của trình duyệt, không phải PointerEvent tự dựng: sự kiện tự
  // dựng không được tin cậy nên setPointerCapture ném lỗi và cả chuỗi chết giữa chừng
  // — phép đo sẽ "xanh" vì không có gì xảy ra, chứ không phải vì code đúng.
  const canGat = await p.evaluate(() => {
    const h = REPO.hudLayout(), cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    return { x: r.left + h.right.x / h.w * r.width,
             y: r.top + h.right.y / h.h * r.height };
  });

  await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.swingCd = 0;
    pl.dir = Math.PI;                                 // đang quay LƯNG lại phía nó
    const m = REPO.spawnFoe('listen', 34, 0);         // nó ở bên phải mình
    // Ghim nó đứng yên: thế giới vẫn đang chạy, và một con quái đi lang thang trong
    // lúc đo thì góc tới nó đổi vài phần mười radian — phép đo sẽ đỏ vì con quái
    // nhúc nhích chứ không phải vì cú quay sai.
    m.hp = 400; m.kx = 0; m.speed = 0; m.state = 'idle'; m.alert = 0;
  });
  await p.touchscreen.tap(canGat.x, canGat.y);
  await p.waitForTimeout(160);
  const cham = await p.evaluate(() => {
    const m = REPO.S.monsters[0], pl = REPO.S.player;
    return { mat: m ? 400 - m.hp : -1, huong: pl.dir, dungHuong: Math.abs(pl.dir) < 0.25 };
  });
  check('chạm nhẹ cần gạt phải thì TỰ QUAY sang con quái', cham.dungHuong,
    'hướng ' + cham.huong.toFixed(2) + ' rad');
  check('chạm nhẹ cần gạt phải thì đập trúng', cham.mat === 27, cham.mat + ' sát thương');

  // KÉO cần gạt phải thì vẫn là NHÌN, không được thành đòn đánh.
  await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.swingCd = 0; pl.dir = 0;
    const m = REPO.spawnFoe('listen', 34, 0); m.hp = 400;
  });
  await p.mouse.move(canGat.x, canGat.y);
  await p.mouse.down();
  await p.mouse.move(canGat.x + 70, canGat.y, { steps: 6 });
  await p.waitForTimeout(80);
  await p.mouse.up();
  await p.waitForTimeout(140);
  const keo = await p.evaluate(() => {
    const m = REPO.S.monsters[0];
    return m ? 400 - m.hp : -1;
  });
  check('kéo cần gạt phải thì vẫn là NHÌN, không thành đòn đánh', keo === 0, keo + ' sát thương');

  // Nhân vật khoẻ hơn thì đập đau hơn — chỗ chỉ số meta của Biệt Đội đi vào.
  const suc = await p.evaluate(() => {
    const S = REPO.S, pl = S.player, out = {};
    [30, 53].forEach(v => {
      S.monsters.length = 0; pl.swingCd = 0; pl.dir = 0; pl.str = v;
      const m = REPO.spawnFoe('listen', 30, 0); m.hp = 400;
      REPO.meleeSwing(pl, null);
      out[v] = 400 - m.hp;
    });
    pl.str = 30;
    return out;
  });
  check('xác khoẻ hơn thì đập đau hơn', suc[53] > suc[30],
    'sức 30 → ' + suc[30] + ' · sức 53 → ' + suc[53]);

  // Bom: giết gọn con dày máu nhất khi nổ sát chân nó.
  const bom = await p.evaluate(async () => {
    const S = REPO.S;
    S.monsters.length = 0; S.bombs.length = 0;
    const m = REPO.spawnFoe('listen', 40, 0);         // Kẻ nghe, 75 máu
    const goc = m.hp;
    S.bombs.push({ x: m.x, y: m.y, t: 0, fuse: 0, r: REPO.TILE * 3.4, done: false, owner: 'player' });
    await new Promise(k => setTimeout(k, 300));
    return { goc: goc, con: S.monsters.indexOf(m) >= 0 };
  });
  check('bom nổ sát chân thì giết gọn con dày máu nhất', !bom.con,
    'Kẻ nghe ' + bom.goc + ' máu');

  const e = errs.filter(x => !/favicon/.test(x));
  check('đập đèn pin: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
// CON MA GƯƠNG + PHANG CỬA KẸT + VÒNG SÁNG QUANH NHÂN VẬT
async function ghostDoorSuite(b) {
  results.push('\n── ma gương · phang cửa · vòng sáng ──');
  const { ctx, p, errs } = await openGame(b, SQ, { width: 390, height: 844 });
  await p.evaluate(() => {
    SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
    SQ.autoFill(); SQ.squad.enter('k3');
    REPO.S.cut = null; REPO.S.running = true;
  });
  await p.waitForTimeout(300);

  // --- con ma gương phải nằm trong tầm với của kỹ năng ---
  // Dựng gương bằng CHÍNH hàm của bộ máy, không bịa một đối tượng gương giả: một
  // cái gương vá tay thiếu vài trường sẽ đi một đường khác với gương thật.
  const co = await p.evaluate(() => {
    REPO.spawnMirrors();
    return { coGuong: !!REPO.S.mirror };
  });
  check('dựng được cảnh có gương', co.coGuong);

  const ma = await p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    // Cho nó bước ra: stepMirror chuyển phase khi mr.t vượt MIRROR_EMERGE.
    // MIRROR_EMERGE = 2 giay: doi 1,2 giay roi ket luan "con ma chua buoc ra" la
    // ket luan ve dong ho cho, khong phai ve con ma.
    for (let i = 0; i < 80 && !(S.mirror && S.mirror.m); i++) {
      if (!S.mirror) REPO.spawnMirrors();
      await new Promise(r => setTimeout(r, 60));
    }
    const m = S.mirror && S.mirror.m;
    if (!m) return { loi: 'con ma chưa bước ra' };
    m.x = pl.x + 3 * REPO.TILE; m.y = pl.y;
    return { ra: true, trongDanhSachQuai: (REPO.foesAll() || []).indexOf(m) >= 0,
             coSleep: typeof m.sleep === 'number' };
  });
  check('con ma gương nằm trong danh sách quái mà kỹ năng quét',
    ma.ra && ma.trongDanhSachQuai, ma.loi || '');

  // Chói Loà phải làm nó đứng hình — đúng chỗ người chơi báo.
  // Đặt nó XA (7 ô) và đo trong cửa sổ ngắn: để nó lại gần thì nó tóm được người
  // chơi giữa lúc đo, mà bị tóm là cả cảnh gương biến mất và phép đo mất đối tượng.
  // Con ma mat MIRROR_EMERGE (2 giay) moi buoc ra khoi guong, va no bien mat han neu
  // tom duoc nguoi choi. Nen moi phep do phai TU DUNG LAI canh cua no, chu khong
  // duoc gia dinh la canh cu con do.
  const dat = () => p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    for (let i = 0; i < 60; i++){
      if (!S.mirror) REPO.spawnMirrors();
      if (S.mirror && S.mirror.m) break;
      await new Promise(r => setTimeout(r, 60));
    }
    const m = S.mirror && S.mirror.m;
    if (!m) return false;
    // 4 ô: nằm TRONG bán kính 5,5 ô của Chói Loà (đặt ngoài tầm thì phép đo chỉ
    // chứng minh được rằng kỹ năng có bán kính, chứ không đo được nó có ăn hay không),
    // mà vẫn đủ xa để nó không tóm được người chơi trong 0,9 giây đo.
    m.x = pl.x + 4 * REPO.TILE; m.y = pl.y; m.sleep = 0; m.path = null; m.pathT = 0;
    return true;
  });
  const diBaoXa = ms => p.evaluate(async ms => {
    const m = REPO.S.mirror && REPO.S.mirror.m;
    if (!m) return -1;
    const t0 = { x: m.x, y: m.y };
    await new Promise(r => setTimeout(r, ms));
    const mm = REPO.S.mirror && REPO.S.mirror.m;
    return mm ? Math.hypot(mm.x - t0.x, mm.y - t0.y) / REPO.TILE : -1;
  }, ms);

  await dat();
  const diThuong = await diBaoXa(900);
  await dat();
  const sleep = await p.evaluate(() => {
    SQ.M.squad.lead = 'bao'; REPO.S.time += 999;
    REPO.hooks.skill.use();                       // Chói Loà
    const m = REPO.S.mirror && REPO.S.mirror.m;
    return m ? m.sleep : -1;
  });
  const diSauChoi = await diBaoXa(900);
  check('Chói Loà làm con ma gương đứng hình',
    sleep > 0 && diSauChoi >= 0 && diSauChoi < Math.max(0.2, diThuong * 0.25),
    'không bấm đi ' + diThuong.toFixed(2) + ' ô · có bấm đi ' + diSauChoi.toFixed(2) + ' ô');

  // Đập đèn pin vào mặt nó cũng phải làm nó khựng, dù không giết được.
  await dat();
  const dam = await p.evaluate(() => {
    const S = REPO.S, m = S.mirror && S.mirror.m, pl = S.player;
    if (!m) return { bo: true };
    m.sleep = 0;
    pl.x = m.x - 30; pl.y = m.y; pl.dir = 0; pl.swingCd = 0;
    REPO.meleeSwing(pl, null);
    return { sleep: m.sleep, conNguyen: !!(S.mirror && S.mirror.m), coMau: typeof m.hp === 'number' };
  });
  check('đập đèn pin làm con ma gương khựng lại', !dam.bo && dam.sleep > 0,
    dam.bo ? 'con ma không còn đó' : dam.sleep + 's');
  check('nhưng KHÔNG giết được nó — vẫn phải đập vỡ gương',
    !dam.bo && dam.conNguyen && !dam.coMau);

  // --- phang đèn pin vào cửa kẹt ---
  const cua = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.mirror = null;
    const d = S.doors.slice().sort((a, c) =>
      Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(c.x - pl.x, c.y - pl.y))[0];
    d.locked = true; d.broken = false; d.pry = 0; d.bash = 0;
    REPO.warp(d.x - 18, d.y);
    pl.dir = 0; pl.swingCd = 0;
    const buoc = [];
    for (let i = 0; i < REPO.DOOR.PRY_HITS + 2 && !d.broken; i++) {
      pl.swingCd = 0;
      REPO.meleeSwing(pl, null);
      buoc.push(+(d.pry || 0).toFixed(1));
    }
    return { vo: !!d.broken, nhat: buoc.length, can: REPO.DOOR.PRY_HITS, buoc: buoc };
  });
  check('phang đèn pin đủ nhiều nhát thì bung được cửa kẹt', cua.vo,
    cua.nhat + ' nhát / cần ' + cua.can);
  check('một nhát thôi thì KHÔNG bung — phải lâu', cua.nhat > 3, cua.nhat + ' nhát');

  // Ngừng tay thì tiến trình tụt lại: không gõ nhấm nháp cả màn được.
  const tut = await p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    const d = S.doors.find(x => !x.broken);
    if (!d) return { bo: true };
    d.locked = true; d.pry = 3; d.bash = 0;
    const truoc = d.pry;
    await new Promise(r => setTimeout(r, 1500));
    return { truoc: truoc, sau: d.pry };
  });
  check('ngừng tay thì tiến trình phá cửa tụt lại',
    tut.bo || tut.sau < tut.truoc, tut.bo ? 'không có cửa để đo' : tut.truoc + ' → ' + (tut.sau || 0).toFixed(2));

  // --- xe đẩy chở theo GIÁ TRỊ, không theo kích cỡ ---
  const xe = await p.evaluate(() => {
    const S = REPO.S, cart = S.cart;
    if (!cart) return { bo: true };
    cart.items.length = 0;
    const to = { value: 4000, sizeIdx: 2, gone: false, mass: 40 };      // to nhưng rẻ
    const dat = { value: 40000, sizeIdx: 0, gone: false, mass: 8 };     // nhỏ nhưng đắt
    const vua = { value: 19999, sizeIdx: 2, gone: false, mass: 40 };    // sát ngưỡng
    return { bo: false, nguong: REPO.CART_MAX_VALUE,
             toReRa: REPO.cartFits(cart, to),
             nhoDat: REPO.cartFits(cart, dat),
             satNguong: REPO.cartFits(cart, vua) };
  });
  check('xe chở món TO nhưng RẺ', xe.bo || xe.toReRa, xe.bo ? 'không có xe' : '');
  check('xe KHÔNG chở món nhỏ nhưng ĐẮT', xe.bo || !xe.nhoDat,
    xe.bo ? '' : 'ngưỡng ' + xe.nguong);
  check('sát ngưỡng thì vẫn lên được xe', xe.bo || xe.satNguong);

  const e = errs.filter(x => !/favicon/.test(x));
  check('ma gương / phang cửa: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
// TỦ ĐỒ KHI ĐÃ NHIỀU MÓN — đúng tình huống người chơi báo: "đến màn 3 mở tủ là
// stuck luôn, không lấy đồ được".
// ROOT-CAUSE đo được: bảng tủ là một tấm màn phủ CUỘN ĐƯỢC, và tới màn 3 thì tủ đã
//   có 7-8 món. Ở khung 390×844, bảng cao 873px trong chỗ trống 757px, nên nút
//   "Đóng tủ" rơi xuống y=876 — NẰM DƯỚI ĐÁY MÀN HÌNH. Mở tủ ra là không còn đường
//   thoát. Chỉ tấm màn ngang mới được ghim đáy, còn màn dọc thì không.
// Vì sao bộ test cũ không bắt được: nó mở tủ với tủ RỖNG (hoặc 2 món), lúc đó bảng
//   vừa khít màn hình. Lỗi này chỉ hiện ra khi danh sách đủ dài.
async function stashSuite(b) {
  results.push('\n── tủ đồ khi đã nhiều món ──');
  for (const [ten, url] of [['repo2d', R2D], ['repo-squad', SQ]]) {
    const { ctx, p, errs } = await openGame(b, url, { width: 390, height: 844 });
    if (url === SQ) {
      await p.evaluate(() => {
        SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
        SQ.autoFill(); SQ.squad.enter('k3');
      });
    } else {
      await p.click('#veilBtn');
    }
    await p.waitForTimeout(300);

    // Tủ như sau ba ca mua sắm: tám món.
    await p.evaluate(() => {
      const S = REPO.S;
      S.level = 3;
      S.stash = ['gun', 'bomb', 'tranq', 'heal', 'pry', 'tracker', 'gun', 'heal']
        .map(k => ({ kind: k, uses: 3 }));
      S.player.inv = [null, null, null];
      REPO.warp(S.car.x, S.car.y);
      REPO.toggleStash();
    });
    await p.waitForTimeout(250);

    const mo = await p.evaluate(() => {
      const v = document.getElementById('veil');
      const a = document.querySelector('.veil-acts').getBoundingClientRect();
      return { moTu: !!REPO.S.stashOpen, daiHonMan: v.scrollHeight > v.clientHeight,
               nutDongY: Math.round(a.top), nutDongTrongMan: a.bottom <= innerHeight,
               so: document.querySelectorAll('[data-stash]').length };
    });
    check('[' + ten + '] tủ 8 món thì bảng dài hơn màn hình', mo.moTu && mo.daiHonMan && mo.so === 8,
      mo.so + ' món');
    check('[' + ten + '] nút "Đóng tủ" LUÔN nằm trong màn hình', mo.nutDongTrongMan,
      'y=' + mo.nutDongY + ' / màn 844');

    // Cuộn xuống đáy: mọi món phải với tới được, không món nào bị che.
    const che = await p.evaluate(() => {
      const v = document.getElementById('veil');
      v.scrollTop = v.scrollHeight;
      const out = [];
      [...document.querySelectorAll('[data-stash]')].forEach((n, i) => {
        const r = n.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const nhin = r.top >= 0 && r.bottom <= innerHeight;
        if (!nhin || !(t && n.contains(t))) out.push(String(i));
      });
      return out;
    });
    check('[' + ten + '] cuộn tới đáy thì không món nào bị che', che.length === 0,
      che.length ? 'món ' + che.join(', ') : '');

    // Lấy một món bằng cú CHẠM thật, và chỗ cuộn phải giữ nguyên.
    const lay = await p.evaluate(() => {
      const v = document.getElementById('veil');
      const n = document.querySelector('[data-stash="5"]');
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, scr: v.scrollTop,
               inv: REPO.S.player.inv.map(x => x && x.kind), so: REPO.S.stash.length };
    });
    await p.touchscreen.tap(lay.x, lay.y);
    await p.waitForTimeout(250);
    const sau = await p.evaluate(() => ({
      inv: REPO.S.player.inv.map(x => x && x.kind), so: REPO.S.stash.length,
      scr: document.getElementById('veil').scrollTop
    }));
    check('[' + ten + '] chạm một món ở giữa danh sách thì lấy được',
      sau.so === lay.so - 1 && sau.inv.filter(Boolean).length === 1,
      lay.so + ' → ' + sau.so + ' món, trên tay: ' + sau.inv.filter(Boolean).join(','));
    // Trôi tối đa MỘT DÒNG (~56px) là đúng: danh sách vừa ngắn đi một món nên mức
    // cuộn tối đa cũng tụt đúng bằng đó, trình duyệt kẹp lại. Nhảy hẳn về 0 mới sai.
    check('[' + ten + '] lấy xong không bị nhảy về đầu danh sách',
      sau.scr > 0 && lay.scr - sau.scr <= 60,
      'cuộn ' + Math.round(lay.scr) + ' → ' + Math.round(sau.scr));

    // Và đóng được tủ bằng cú chạm thật.
    const dong = await p.evaluate(() => {
      const r = document.getElementById('veilBtn').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await p.touchscreen.tap(dong.x, dong.y);
    await p.waitForTimeout(250);
    const daDong = await p.evaluate(() => ({ mo: !!REPO.S.stashOpen, chay: !!REPO.S.running }));
    check('[' + ten + '] đóng được tủ và chơi tiếp', !daDong.mo && daDong.chay);

    const e = errs.filter(x => !/favicon/.test(x));
    check('[' + ten + '] tủ đồ: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// =====================================================================
// NÚT XOAY TAY — iPhone bật khoá xoay thì trang không bao giờ nằm ngang được, và
// Safari không có screen.orientation.lock(). Nên vỏ game tự quay 90 độ bằng CSS.
// Phép đo QUAN TRỌNG NHẤT ở đây là cú chạm: quay hình mà quên quay toạ độ thì ngón
// tay bấm một nơi game hiểu một nẻo, lệch đúng 90 độ — cần gạt trái thành cần phải.
async function rotateSuite(b) {
  results.push('\n── nút xoay tay (cho iPhone khoá xoay) ──');
  for (const [ten, url] of [['repo2d', R2D], ['repo-squad', SQ]]) {
    // Khung DỌC: đây mới là tình huống nút này sinh ra để giải quyết.
    const { ctx, p, errs } = await openGame(b, url, { width: 390, height: 844 });
    if (url === SQ) {
      await p.evaluate(() => {
        SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
        SQ.autoFill(); SQ.squad.enter('k3');
      });
    } else {
      // repo2d mo ra la tam man gioi thieu dang phu len canvas. Khong bam "Vao ca"
      // thi moi cu cham trong bai do nay roi vao tam man do chu khong vao canvas.
      await p.click('#veilBtn');
    }
    await p.evaluate(() => { REPO.S.cut = null; REPO.S.running = true; });
    await p.waitForTimeout(300);

    const truoc = await p.evaluate(() => {
      const h = REPO.hudLayout();
      return { ngang: h.w > h.h, w: Math.round(h.w), h: Math.round(h.h),
               nut: !!document.getElementById('rotBtn'),
               hien: getComputedStyle(document.getElementById('rotBtn')).display };
    });
    check('[' + ten + '] có nút xoay trên thanh trên', truoc.nut);
    check('[' + ten + '] máy cảm ứng thì nút hiện ra', truoc.hien !== 'none', truoc.hien);
    check('[' + ten + '] chưa bấm thì khung vẫn dọc', !truoc.ngang, truoc.w + '×' + truoc.h);

    await p.click('#rotBtn');
    await p.waitForTimeout(400);

    const sau = await p.evaluate(() => {
      const h = REPO.hudLayout(), cv = document.querySelector('canvas');
      const r = cv.getBoundingClientRect();
      return { ngang: h.w > h.h, w: Math.round(h.w), h: Math.round(h.h),
               cls: document.body.classList.contains('force-land'),
               land: document.body.classList.contains('landscape'),
               // Hộp bao của canvas đã xoay phải nằm gọn trong màn hình dọc.
               tran: r.left < -1 || r.top < -1 ||
                     r.right > innerWidth + 1 || r.bottom > innerHeight + 1,
               phu: Math.round(r.width) + '×' + Math.round(r.height),
               man: innerWidth + '×' + innerHeight };
    });
    check('[' + ten + '] bấm xong thì game chuyển sang bố cục NGANG', sau.ngang && sau.land,
      sau.w + '×' + sau.h);
    check('[' + ten + '] vỏ xoay rồi vẫn nằm gọn trong màn hình', !sau.tran,
      'canvas ' + sau.phu + ' trong màn ' + sau.man);

    // Chạm thật vào tâm ba nút HUD trong lúc đang xoay: phải đúng nút đó ăn.
    const nut = await p.evaluate(() => {
      const h = REPO.hudLayout(), cv = document.querySelector('canvas');
      const r = cv.getBoundingClientRect();
      // Nghịch đảo của phép quay 90 độ: khung-(lx,ly) -> màn-(left + W - ly, top + lx)
      const q = o => o ? { x: r.left + r.width - (o.y / h.h * r.width),
                           y: r.top + (o.x / h.w * r.height) } : null;
      return { sprint: q(h.sprint), grab: q(h.grab), stash: q(h.stash),
               car: { x: REPO.S.car.x, y: REPO.S.car.y } };
    });
    await p.evaluate(c => { REPO.warp(c.x, c.y); }, nut.car);   // đứng cạnh xe -> tủ đồ sống
    await p.waitForTimeout(120);

    const bam = async diem => {
      await p.evaluate(() => {
        window.__d = { stash: !!REPO.S.stashOpen, sprint: !!REPO.S.player.sprint };
      });
      await p.touchscreen.tap(diem.x, diem.y);
      await p.waitForTimeout(160);
      return p.evaluate(() => ({
        stash: !!REPO.S.stashOpen !== window.__d.stash,
        sprint: !!REPO.S.player.sprint !== window.__d.sprint
      }));
    };
    const rCh = await bam(nut.sprint);
    check('[' + ten + '] đang xoay: chạm nút Chạy thì đúng nút Chạy ăn', rCh.sprint && !rCh.stash);
    const rTu = await bam(nut.stash);
    check('[' + ten + '] đang xoay: chạm nút Tủ đồ thì đúng nút Tủ đồ ăn', rTu.stash && !rTu.sprint);
    await p.evaluate(() => { if (REPO.S.stashOpen) REPO.toggleStash(); REPO.S.running = true; });

    // Bấm lần nữa thì phải về đúng như cũ.
    await p.click('#rotBtn');
    await p.waitForTimeout(400);
    const ve = await p.evaluate(() => {
      const h = REPO.hudLayout();
      return { ngang: h.w > h.h, cls: document.body.classList.contains('force-land'),
               w: Math.round(h.w), h: Math.round(h.h) };
    });
    check('[' + ten + '] bấm lần nữa thì về lại màn dọc', !ve.ngang && !ve.cls,
      ve.w + '×' + ve.h);

    const e = errs.filter(x => !/favicon/.test(x));
    check('[' + ten + '] xoay tay: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// =====================================================================
// HÌNH HỌC CỦA HUD — chạy trên repo-squad, nơi CÓ nút kỹ năng.
// WHY ở đây chứ không ở bộ repo2d: nút kỹ năng chỉ tồn tại khi HOOKS.skill khác
//   null, nên mọi lỗi đè nút / tràn khung của nó đều vô hình với bộ test repo2d.
//   Và kiểm "hudLayout() có nút không" thì không bao giờ bắt được hai nút nằm
//   chồng lên nhau — cú chạm rơi vào nút nào là do THỨ TỰ HỎI quyết định, không
//   phải do người chơi nhắm vào đâu.
async function hudGeomSuite(b) {
  results.push('\n── hình học HUD (bản có nút kỹ năng) ──');
  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await openGame(b, SQ, vp);
    await p.evaluate(() => {
      SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
      SQ.autoFill(); SQ.squad.enter('k3');
      REPO.S.cut = null; REPO.S.running = true;
      REPO.S.player.x = REPO.S.car.x; REPO.S.player.y = REPO.S.car.y;   // đứng cạnh xe -> tủ đồ sống
      REPO.S.player.inv[0] = { kind: 'gun', uses: 5 };
    });
    await p.waitForTimeout(350);

    // 1. Không nút nào được nằm ngoài khung vẽ.
    const khung = await p.evaluate(() => {
      const h = REPO.hudLayout(), out = [];
      const xet = (ten, o) => {
        if (!o) return;
        if (o.x - o.r*1.25 < 0 || o.x + o.r*1.25 > h.w ||
            o.y - o.r*1.25 < 0 || o.y + o.r*1.25 > h.h) out.push(ten);
      };
      xet('kỹ năng', h.skill); xet('nhặt', h.grab); xet('chạy', h.sprint);
      xet('tủ đồ', h.stash); xet('trái tim', h.heart); xet('bỏ món', h.cancel);
      (h.slots || []).forEach((o, i) => xet('ô đồ ' + (i + 1), o));
      return out;
    });
    check('[' + ten + '] không nút nào tràn ra ngoài khung', khung.length === 0, khung.join(', '));

    // 2. Giữa màn hình để trống — yêu cầu này chỉ đặt cho MÀN NGANG, nơi bố cục do
    //    ta dựng. Bố cục dọc là bảng toạ độ đặt tay từ bản Unity, không đụng vào.
    if (vp.width > vp.height) {
      const giua = await p.evaluate(() => {
        const h = REPO.hudLayout(), out = [];
        const xet = (ten, o) => { if (o && o.x - o.r < h.w*0.65 && o.x + o.r > h.w*0.35) out.push(ten); };
        xet('kỹ năng', h.skill); xet('nhặt', h.grab); xet('chạy', h.sprint); xet('tủ đồ', h.stash);
        (h.slots || []).forEach((o, i) => xet('ô đồ ' + (i + 1), o));
        return out;
      });
      check('[ngang] giữa màn hình để trống cho gameplay', giua.length === 0, giua.join(', '));
    }

    // 3. PHÉP ĐO QUAN TRỌNG NHẤT: chạm THẬT vào tâm từng nút thì đúng nút đó ăn.
    //    Vùng bắt chạm của các nút CÓ chồng nhau (bảng toạ độ đặt tay của repo2d),
    //    nên điều phải đảm bảo không phải là "không chồng" mà là "chạm vào tâm nút
    //    nào thì nút đó thắng" — đúng cái luật nút-gần-nhất-thắng.
    const nut = await p.evaluate(() => {
      const h = REPO.hudLayout(), cv = document.querySelector('canvas');
      const r = cv.getBoundingClientRect();
      const q = o => o ? { x: r.left + o.x / h.w * r.width, y: r.top + o.y / h.h * r.height } : null;
      return { skill: q(h.skill), grab: q(h.grab), sprint: q(h.sprint),
               stash: q(h.stash), slot0: q(h.slots && h.slots[0]) };
    });
    const bam = async (diem) => {
      await p.evaluate(() => {
        const S = REPO.S;
        window.__d = { stash: !!S.stashOpen, sprint: !!S.player.sprint,
                       skill: SQ.squad.run() ? SQ.squad.run().skills : 0,
                       aim: S.player.aimSlot };
      });
      await p.touchscreen.tap(diem.x, diem.y);
      await p.waitForTimeout(160);
      return p.evaluate(() => {
        const S = REPO.S, d = window.__d;
        return { stash: !!S.stashOpen !== d.stash,
                 sprint: !!S.player.sprint !== d.sprint,
                 skill: (SQ.squad.run() ? SQ.squad.run().skills : 0) !== d.skill,
                 aim: S.player.aimSlot !== d.aim };
      });
    };
    const rTu = await bam(nut.stash);
    check('[' + ten + '] chạm tâm nút Tủ đồ thì MỞ TỦ', rTu.stash && !rTu.skill,
      'tủ ' + (rTu.stash ? 'đổi' : 'không đổi') + (rTu.skill ? ' · kỹ năng bị bắn' : ''));
    await p.evaluate(() => { if (REPO.S.stashOpen) REPO.toggleStash(); REPO.S.running = true; });

    if (nut.skill) {
      const rKn = await bam(nut.skill);
      check('[' + ten + '] chạm tâm nút Kỹ năng thì BẮN KỸ NĂNG', rKn.skill && !rKn.stash,
        rKn.skill ? '' : 'không bắn');
    }
    const rCh = await bam(nut.sprint);
    check('[' + ten + '] chạm tâm nút Chạy thì bật/tắt chạy', rCh.sprint && !rCh.skill && !rCh.stash);

    const e = errs.filter(x => !/favicon/.test(x));
    check('[' + ten + '] hình học HUD: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// =====================================================================
// ĐO HIỆU ỨNG THẬT — không kiểm "gọi được không ném lỗi" nữa, mà đặt quái/đồ/cửa
// vào đúng thế rồi ĐO xem sau vài giây thế giới có đổi đúng như mô tả kỹ năng hứa.
// WHY bộ này tồn tại: bản đầu của 14 kỹ năng gán m.stun / m.slow / p.invisT /
//   a.invuln / dr.jam — năm cái tên bộ máy KHÔNG hề đọc. Mọi bài test kiểu "gọi
//   không ném lỗi" đều xanh, trong khi bốn kỹ năng bấm ra không có gì xảy ra cả.
async function skillEffectSuite(b) {
  results.push('\n── hiệu ứng kỹ năng: đo trên thế giới thật ──');
  const { ctx, p, errs } = await openGame(b, SQ, { width: 844, height: 390 });

  // Mở sẵn mọi xác rồi vào ca, để đổi xác cầm là đổi kỹ năng.
  await p.evaluate(() => {
    SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
    SQ.autoFill(); SQ.squad.enter('k3');
    REPO.S.cut = null; REPO.S.running = true;
  });
  await p.waitForTimeout(300);

  // Dựng lại bàn cờ trước mỗi phép đo: dọn quái, đặt lại người chơi giữa phòng.
  const setup = () => p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0;
    pl.down = false; pl.hp = pl.hpMax; pl.invisT = 0; pl.invulnT = 0;
    pl.hasteT = 0; pl.floatT = 0; pl.slowT = 0; pl.stunT = 0; pl.blindT = 0;
    REPO.hooks.onTick && (window.__fxClear = true);
  });

  // Đặt n con quái quanh người chơi ở bán kính r ô, tất cả đang đuổi.
  // Dùng REPO.spawnFoe của chính bộ máy chứ không tự bịa một đối tượng quái: một
  // con quái vá tay thiếu vài trường (m.hit, m.think, m.rook...) sẽ lặng lẽ KHÔNG
  // đánh được ai, và phép đo "tàng hình có chặn sát thương không" sẽ xanh vì cả hai
  // vế đều bằng 0 — xanh mà không chứng minh được gì.
  const putFoes = (n, r) => p.evaluate(({ n, r }) => {
    const S = REPO.S, pl = S.player, out = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const m = REPO.spawnFoe('stalk', Math.cos(a) * r * REPO.TILE, Math.sin(a) * r * REPO.TILE);
      m.hp = 400; m.state = 'chase'; m.alert = 3; m.lost = 0;
      m.tx = pl.x; m.ty = pl.y; m.seen = true; m.reveal = 1; m.hit = 0;
      out.push({ x: m.x, y: m.y });
    }
    return out;
  }, { n, r });

  // Tổng quãng đường quái đi được trong ms mili giây, tính bằng ô.
  const foesMoved = async ms => {
    const a = await p.evaluate(() => REPO.S.monsters.map(m => ({ x: m.x, y: m.y })));
    await p.waitForTimeout(ms);
    return p.evaluate(prev => {
      const T = REPO.TILE;
      return REPO.S.monsters.reduce((sum, m, i) =>
        sum + (prev[i] ? Math.hypot(m.x - prev[i].x, m.y - prev[i].y) / T : 0), 0);
    }, a);
  };

  const useLead = id => p.evaluate(id => {
    SQ.M.squad.lead = id; REPO.S.time += 999; REPO.hooks.skill.use();
  }, id);

  // ---- 1. Chói Loà: quái phải ĐỨNG HÌNH, không phải "được gán một trường" ----
  await setup(); await putFoes(3, 3);
  const diChuan = await foesMoved(1500);          // đối chứng: không bấm gì
  await setup(); await putFoes(3, 3);
  await useLead('bao');
  const diSauFlash = await foesMoved(1500);
  check('Chói Loà làm quái đứng hình', diSauFlash < diChuan * 0.15,
    'không bấm ' + diChuan.toFixed(2) + ' ô · có bấm ' + diSauFlash.toFixed(2) + ' ô');

  // ---- 2. Đóng Băng: đứng hình + ăn thêm sát thương ----
  await setup(); await putFoes(3, 5);
  await useLead('van');
  const diSauFreeze = await foesMoved(1500);
  check('Đóng Băng làm quái đứng hình', diSauFreeze < diChuan * 0.15, diSauFreeze.toFixed(2) + ' ô');
  const vuln = await p.evaluate(() => {
    const m = REPO.S.monsters[0], truoc = m.hp;
    REPO.hurtFoe(m, 100);
    return { mat: truoc - m.hp };
  });
  check('quái đông cứng ăn thêm 50% sát thương', Math.abs(vuln.mat - 150) < 1, 'mất ' + vuln.mat + ' máu');

  // ---- 3. Lồng Sắt: quái KHÔNG đi qua được ----
  await setup(); await putFoes(4, 6);
  await useLead('son');
  await p.waitForTimeout(2200);
  const lot = await p.evaluate(() => {
    const pl = REPO.S.player, T = REPO.TILE;
    return REPO.S.monsters.filter(m => Math.hypot(m.x - pl.x, m.y - pl.y) < 3.4 * T).length;
  });
  check('Lồng Sắt: không con nào lọt vào trong', lot === 0, lot + ' con lọt');

  // ---- 4. Tàng Hình: quái không thấy -> không mất máu ----
  // Ghim quái sát người chơi MỖI KHUNG HÌNH trong lúc đo: quái phải thật sự ở trong
  // tầm đánh (22px) thì con số mất máu mới có nghĩa.
  const doMau = () => p.evaluate(async () => {
    const S = REPO.S, pl = S.player, t0 = pl.hp;
    const iv = setInterval(() => {
      S.monsters.forEach((m, i) => {
        const a = i / S.monsters.length * Math.PI * 2;
        m.x = pl.x + Math.cos(a) * 14; m.y = pl.y + Math.sin(a) * 14;
        // KHONG ep alert/state o day: de bo may tu quyet dinh no con thay minh khong.
        // Ep vao la tu tay xoa mat dieu dang can do.
      });
    }, 16);
    await new Promise(r => setTimeout(r, 1800));
    clearInterval(iv);
    return t0 - pl.hp;
  });
  await setup(); await putFoes(3, 1.2);
  const mauChuan = await doMau();
  await setup(); await putFoes(3, 1.2);
  await useLead('linh');
  const mauTangHinh = await doMau();
  check('Tàng Hình: quái không đánh trúng nữa', mauChuan > 0 && mauTangHinh === 0,
    'không bấm mất ' + mauChuan + ' máu · có bấm mất ' + mauTangHinh);

  // ---- 5. Thiên Thần: cả tổ thật sự không chết được ----
  await setup(); await putFoes(3, 1.2);
  await useLead('tuyet');
  const batTu = await doMau();
  const guc = await p.evaluate(() => REPO.S.player.down);
  check('Thiên Thần: không mất một máu nào', mauChuan > 0 && batTu === 0 && !guc,
    'đối chứng mất ' + mauChuan + ' · có bấm mất ' + batTu + (guc ? ', vẫn gục' : ''));

  // ---- 6. Mở Toang: cửa KHOÁ phải bung ----
  // Dời người chơi tới CỬA chứ không trông chờ nhà tự sinh ra cửa ở gần: bố cục nhà
  // là ngẫu nhiên, có nhà không có cánh nào trong 8 ô và phép đo sẽ xanh vì rỗng.
  await setup();
  const cua = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    const ds = S.doors.slice()
      .sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))
      .slice(0, 3);
    if (!ds.length) return 0;
    pl.x = ds[0].x; pl.y = ds[0].y;
    let n = 0;
    ds.forEach(d => { if (Math.hypot(d.x - pl.x, d.y - pl.y) < 8 * REPO.TILE) {
      d.locked = true; d.broken = false; n++; } });
    return n;
  });
  await useLead('ky');
  const conKhoa = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    return S.doors.filter(d => d.locked && !d.broken &&
      Math.hypot(d.x - pl.x, d.y - pl.y) < 8 * REPO.TILE).length;
  });
  check('Mở Toang bung hết cửa khoá gần đó', cua > 0 && conKhoa === 0,
    'khoá ' + cua + ' cửa, còn lại ' + conKhoa);

  // ---- 7. Kéo Đồ: đồ phải được GIAO, chỉ tiêu phải nhúc nhích ----
  const giao = await p.evaluate(() => {
    const S = REPO.S, pl = S.player, pad = REPO.padOpen();
    if (!pad) return null;
    let n = 0;
    S.loot.forEach(l => {
      if (l.gone || l.onPad || l.isHead || n >= 4) return;
      l.x = pl.x + (Math.random() - 0.5) * 60; l.y = pl.y + (Math.random() - 0.5) * 60;
      l.held = null; l.inCart = false; n++;
    });
    const truoc = pad.value;
    SQ.M.squad.lead = 'hai'; S.time += 999; REPO.hooks.skill.use();
    return { truoc: truoc, sau: pad.value, dat: n };
  });
  check('Kéo Đồ giao thẳng lên bệ, chỉ tiêu tăng thật',
    giao && giao.sau > giao.truoc, giao ? '$' + giao.truoc + ' → $' + giao.sau : 'không có bệ');

  // ---- 8. Vòng Hồi: hồi DẦN trong 6 giây, không phải một cục ----
  // setup() dọn sạch quái trước: bỏ qua bước này thì lũ quái của phép đo trước vẫn
  // đứng đó và người chơi GỤC giữa lúc đang đo, kéo theo hai phép đo sau cùng sai.
  await setup();
  const hoi = await p.evaluate(async () => {
    const pl = REPO.S.player;
    pl.hp = 20; SQ.M.squad.lead = 'hue'; REPO.S.time += 999;
    REPO.hooks.skill.use();
    await new Promise(r => setTimeout(r, 300));
    const som = pl.hp;
    await new Promise(r => setTimeout(r, 2500));
    return { som: som, muon: pl.hp };
  });
  check('Vòng Hồi hồi dần theo thời gian', hoi.muon > hoi.som + 8,
    '+0,3s: ' + Math.round(hoi.som) + ' máu · +2,8s: ' + Math.round(hoi.muon));

  // ---- 9. Gồng: nhanh hơn thật ----
  await setup();
  const gong = await p.evaluate(() => {
    const pl = REPO.S.player;
    pl.hasteT = 0; pl.speedScale = 1;
    const thuong = REPO.playerSpeed ? REPO.playerSpeed(pl) : null;
    SQ.M.squad.lead = 'tam'; REPO.S.time += 999; REPO.hooks.skill.use();
    const gong = REPO.playerSpeed ? REPO.playerSpeed(pl) : null;
    return { thuong: thuong, gong: gong };
  });
  check('Gồng làm chạy nhanh hơn 30%',
    gong.thuong && gong.gong && Math.abs(gong.gong / gong.thuong - 1.3) < 0.02,
    gong.thuong ? Math.round(gong.thuong) + ' → ' + Math.round(gong.gong) : 'không đo được');

  const e = errs.filter(x => !/favicon/.test(x));
  check('đo hiệu ứng: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
// SỔ SÁCH & LUẬT VÁN — chỉ số meta, độ khó theo tầng, đường ra của ván.
async function metaRulesSuite(b) {
  results.push('\n── sổ sách & luật ván ──');
  const { ctx, p, errs } = await openGame(b, SQ, { width: 844, height: 390 });

  // 1. Chỉ số meta phải tới tay NGƯỜI CHƠI, mỗi tầng, và phải KHÁC nhau giữa các xác.
  const chiSo = await p.evaluate(() => {
    SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
    const out = {};
    ['ky', 'tuyet', 'tam'].forEach(id => {
      SQ.M.squad.lead = id; SQ.M.squad.mates = [null, null, null, null];
      SQ.squad.enter('k3');
      const pl = REPO.S.player;
      out[id] = { hp: pl.hpMax, str: pl.str, spd: +(pl.speedScale || 1).toFixed(3) };
      SQ.squad.quit();
    });
    return out;
  });
  const khac = new Set(Object.values(chiSo).map(v => v.hp + '/' + v.str + '/' + v.spd));
  check('người chơi nhận chỉ số meta của xác đang cầm', khac.size === 3,
    Object.keys(chiSo).map(k => k + ' ' + chiSo[k].hp + 'hp/' + chiSo[k].str + 'sức/x' + chiSo[k].spd).join(' · '));
  check('xác 5★ khoẻ hơn xác 3★', chiSo.tuyet.hp > chiSo.ky.hp && chiSo.tuyet.str > chiSo.ky.str,
    'Seraph ' + chiSo.tuyet.hp + 'hp vs Pick ' + chiSo.ky.hp + 'hp');
  check('xác Cửu Vạn đi chậm hơn Thợ Khoá', chiSo.tam.spd < chiSo.ky.spd,
    'Atlas x' + chiSo.tam.spd + ' vs Pick x' + chiSo.ky.spd);

  // 2. Độ khó phải TĂNG ĐỀU qua 36 tầng: không trùng bậc khi sang map, không tụt lùi.
  const duong = await p.evaluate(() => {
    const out = [];
    SQ.MAPS.forEach(m => {
      SQ.M.maps[m.id].cleared = true;
      for (let f = 1; f <= m.floors; f++) {
        SQ.squad.enter(m.id);
        const r = SQ.squad.run(); if (r) r.floor = f;
        out.push({ map: m.id, floor: f, lv: REPO.hooks.levelIndex() });
        SQ.squad.quit();
      }
    });
    return out;
  });
  let tut = 0;
  for (let i = 1; i < duong.length; i++) if (duong[i].lv < duong[i - 1].lv) tut++;
  check('độ khó không bao giờ tụt lùi khi sang map', tut === 0, tut + ' chỗ tụt');
  check('độ khó chạy hết dải 1..20 của repo2d',
    duong[0].lv === 1 && duong[duong.length - 1].lv === 20,
    'tầng đầu ' + duong[0].lv + ' · tầng cuối ' + duong[duong.length - 1].lv);

  // 3. Cả tổ gục = THUA, ra khỏi ca — không phải "Làm lại từ màn 1" ngay tại chỗ.
  const thua = await p.evaluate(async () => {
    SQ.M.maps.k3.cleared = false;
    SQ.autoFill(); SQ.squad.enter('k3');
    REPO.S.cut = null; REPO.S.running = true;
    REPO.killPlayer();
    (REPO.S.mates || []).slice().forEach((m, i) => REPO.killMate(i));
    await new Promise(r => setTimeout(r, 260));
    return { conTrongCa: !!SQ.squad.run(), inRun: document.body.classList.contains('in-run'),
             boMayConChay: REPO.S.running };
  });
  check('cả tổ gục thì RA khỏi ca', !thua.conTrongCa && !thua.inRun);
  check('ra ca rồi thì bộ máy dừng hẳn', !thua.boMayConChay);

  // 4. Bàn phím của bộ máy phải câm khi đang ở menu.
  const phim = await p.evaluate(async () => {
    const truoc = REPO.S.level;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return { menu: REPO.hooks.menuMode(), level: REPO.S.level, truoc: truoc, chay: REPO.S.running };
  });
  check('ở menu thì bàn phím bộ máy bị khoá', phim.menu === true && phim.chay === false);

  // 5. Đỡ dậy thì cái đầu phải biến mất — bot không được bỏ chỉ tiêu đi vác đầu ma.
  const dau = await p.evaluate(async () => {
    SQ.autoFill(); SQ.squad.enter('k3');
    REPO.S.cut = null; REPO.S.running = true;
    REPO.killMate(0);
    await new Promise(r => setTimeout(r, 120));
    const truoc = REPO.heads().length;
    REPO.reviveActor(REPO.S.mates[0]);
    const sau = REPO.heads().length;
    SQ.squad.quit();
    return { truoc: truoc, sau: sau };
  });
  check('đỡ dậy thì đầu biến mất khỏi sàn', dau.truoc > 0 && dau.sau === dau.truoc - 1,
    dau.truoc + ' đầu → ' + dau.sau);

  // 6. Sổ sách đi qua SQ.finishRun: đếm ván đúng MỘT lần, và ngày/tuần có cộng.
  const so = await p.evaluate(async () => {
    SQ.M.counters.runs = 0; SQ.M.day.runs = 0; SQ.M.week.runs = 0;
    SQ.autoFill(); SQ.squad.enter('k3');
    SQ.squad.quit();
    return { runs: SQ.M.counters.runs, day: SQ.M.day.runs, week: SQ.M.week.runs };
  });
  check('một ván đếm đúng một lần', so.runs === 1, so.runs + ' ván');
  check('bộ đếm ngày/tuần có chạy', so.day === 1 && so.week === 1,
    'ngày ' + so.day + ' · tuần ' + so.week);

  const e = errs.filter(x => !/favicon/.test(x));
  check('sổ sách: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
(async () => {
  const b = await chromium.launch();
  try { await repo2dSuite(b); } catch (e) { check('repo2d: bộ test chạy trọn', false, e.message); }
  try { await repoSquadSuite(b); } catch (e) { check('repo-squad: bộ test chạy trọn', false, e.message); }
  try { await ghostDoorSuite(b); } catch (e) { check('ma gương/phang cửa: bộ test chạy trọn', false, e.message); }
  try { await meleeSuite(b); } catch (e) { check('đập đèn pin: bộ test chạy trọn', false, e.message); }
  try { await stashSuite(b); } catch (e) { check('tủ đồ: bộ test chạy trọn', false, e.message); }
  try { await rotateSuite(b); } catch (e) { check('nút xoay tay: bộ test chạy trọn', false, e.message); }
  try { await hudGeomSuite(b); } catch (e) { check('hình học HUD: bộ test chạy trọn', false, e.message); }
  try { await skillEffectSuite(b); } catch (e) { check('hiệu ứng kỹ năng: bộ test chạy trọn', false, e.message); }
  try { await metaRulesSuite(b); } catch (e) { check('sổ sách & luật ván: bộ test chạy trọn', false, e.message); }
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
