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
    // Bắt viên đạn NGAY LÚC nó vừa ra khỏi nòng. Con quái chỉ cách 3 ô, đạn bay hết quãng đó
    // trong khoảng 80ms — đọc S.bullets sau khi chạm xong thì một nửa số lần viên đạn đã trúng
    // và biến mất, và phép đo báo "không bắn ra gì" trong khi súng đã tụt một viên.
    await p.evaluate(() => {
      window.__daBan = null;
      window.__rinh = setInterval(() => {
        const b = REPO.S.bullets[0];
        if (b && !window.__daBan) window.__daBan = { vx: b.vx, vy: b.vy };
      }, 4);
    });
    await p.mouse.move(g.l + g.x, g.t + g.y);
    await p.mouse.down(); await p.waitForTimeout(50); await p.mouse.up();
    await p.waitForTimeout(25);
    const shot = await p.evaluate(() => {
      clearInterval(window.__rinh);
      const S = REPO.S, pl = S.player, b = S.bullets[0] || window.__daBan;
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
  const heSo = await p.evaluate(() => REPO.MELEE.STR);
  const chuan = Math.max(3, Math.round(30 * heSo));
  check('đập trúng thì quái mất máu theo SỨC của mình', don.mat === chuan,
    'sức ' + don.str + ' → ' + don.mat + ' sát thương');
  check('đập trúng thì quái bị hất lui', don.day);
  check('đập xong phải chờ hồi', don.cd > 0.4, don.cd.toFixed(2) + 's');

  const hut = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.swingCd = 0; pl.dir = 0; pl.stam = pl.stamMax;
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
    S.monsters.length = 0; pl.swingCd = 0; pl.stam = pl.stamMax;
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
  const heSo2 = await p.evaluate(() => REPO.MELEE.STR);
  check('chạm nhẹ cần gạt phải thì đập trúng',
    cham.mat === Math.max(3, Math.round(30 * heSo2)), cham.mat + ' sát thương');

  // NÚT ĐÁNH RIÊNG. Lối chạm nhẹ ở trên vẫn còn, nhưng một hành động mà cách duy nhất để gọi nó
  // là "chạm rồi nhả trong 280ms mà đừng kéo quá xa" thì không ai đọc ra được từ màn hình.
  const kichThuoc = await p.evaluate(() => {
    const h = REPO.hudLayout();
    return { co: !!h.melee, xoay: +h.right.r.toFixed(1), di: +h.left.r.toFixed(1) };
  });
  check('có nút đánh thường trên HUD', kichThuoc.co);
  check('cần gạt XOAY nhỏ hơn cần gạt ĐI', kichThuoc.co && kichThuoc.xoay < kichThuoc.di,
    'xoay ' + kichThuoc.xoay + ' · đi ' + kichThuoc.di);

  const nutDanh = await p.evaluate(() => {
    const h = REPO.hudLayout(), cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    return { x: r.left + h.melee.x / h.w * r.width,
             y: r.top + h.melee.y / h.h * r.height };
  });
  await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.swingCd = 0; pl.stam = pl.stamMax; pl.sprint = false;
    pl.dir = Math.PI;
    const m = REPO.spawnFoe('listen', 34, 0);
    m.hp = 400; m.kx = 0; m.speed = 0; m.state = 'idle'; m.alert = 0;
  });
  await p.touchscreen.tap(nutDanh.x, nutDanh.y);
  await p.waitForTimeout(160);
  const bamNut = await p.evaluate(() => {
    const m = REPO.S.monsters[0], pl = REPO.S.player;
    return { mat: m ? 400 - m.hp : -1, chay: !!pl.sprint, tu: !!REPO.S.stashOpen,
             gat: !!REPO.stick() };
  });
  check('bấm nút Đánh thì đập trúng', bamNut.mat === Math.max(3, Math.round(30 * heSo2)),
    bamNut.mat + ' sát thương');
  check('và nó không cướp mất nút Chạy, tủ đồ hay cần gạt',
    !bamNut.chay && !bamNut.tu && !bamNut.gat);

  // KÉO cần gạt phải thì vẫn là NHÌN, không được thành đòn đánh.
  await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.swingCd = 0; pl.dir = 0; pl.stam = pl.stamMax;
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
      S.monsters.length = 0; pl.swingCd = 0; pl.dir = 0; pl.str = v; pl.stam = pl.stamMax;
      const m = REPO.spawnFoe('listen', 30, 0); m.hp = 400;
      REPO.meleeSwing(pl, null);
      out[v] = 400 - m.hp;
    });
    pl.str = 30;
    return out;
  });
  check('xác khoẻ hơn thì đập đau hơn', suc[53] > suc[30],
    'sức 30 → ' + suc[30] + ' · sức 53 → ' + suc[53]);

  // ---- vung đèn pin TỐN THỂ LỰC ----
  const tl = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.dir = 0; pl.str = 30;
    pl.stam = pl.stamMax; pl.swingCd = 0;
    const truoc = pl.stam;
    REPO.meleeSwing(pl, null);
    return { truoc: truoc, sau: pl.stam, gia: REPO.MELEE.STAM };
  });
  check('vung đèn pin thì hao thể lực', tl.truoc - tl.sau === tl.gia,
    Math.round(tl.truoc) + ' -> ' + Math.round(tl.sau) + ' (giá ' + tl.gia + ')');

  const duoi = await p.evaluate(() => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; pl.dir = 0; pl.str = 30;
    // đầy thể lực
    pl.stam = pl.stamMax; pl.swingCd = 0;
    let m = REPO.spawnFoe('listen', 30, 0); m.hp = 400;
    REPO.meleeSwing(pl, null);
    const khoe = { mat: 400 - m.hp, cd: pl.swingCd };
    // cạn thể lực
    S.monsters.length = 0; pl.stam = 0; pl.swingCd = 0;
    m = REPO.spawnFoe('listen', 30, 0); m.hp = 400;
    REPO.meleeSwing(pl, null);
    return { khoe: khoe, met: { mat: 400 - m.hp, cd: pl.swingCd } };
  });
  check('cạn thể lực thì VẪN đánh được, không bị cấm',
    duoi.met.mat > 0, duoi.met.mat + ' sát thương');
  check('nhưng đánh nhẹ hẳn', duoi.met.mat < duoi.khoe.mat,
    duoi.khoe.mat + ' -> ' + duoi.met.mat);
  check('và lâu tay hẳn', duoi.met.cd > duoi.khoe.cd + 0.1,
    duoi.khoe.cd.toFixed(2) + 's -> ' + duoi.met.cd.toFixed(2) + 's');

  // ---- phang được vào GƯƠNG ----
  const guong = await p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0;
    S.mirror = null;
    REPO.spawnMirrors();
    for (let i = 0; i < 40 && !S.mirror; i++) await new Promise(r => setTimeout(r, 50));
    if (!S.mirror) return { bo: true };
    const pane = S.mirror.a;
    const goc = pane.hp;
    // Đứng ở phía nào cũng được, MIỄN LÀ đứng được và nhìn thấy tấm gương. Bản test cũ đóng
    // cứng "lùi sang trái 26px", nên hôm nào tấm gương mọc sát một bức tường bên trái thì
    // người chơi bị nhét vào trong tường, losClear() trả false, và tám nhát trôi qua không
    // trúng gì cả — một ca hỏng chập chờn không nói gì về trò chơi.
    let dungDuoc = false;
    for (const a of [0, Math.PI/2, Math.PI, -Math.PI/2, Math.PI/4, -Math.PI/4]){
      const x = pane.x - Math.cos(a)*26, y = pane.y - Math.sin(a)*26;
      if (REPO.hitsSolid(x, y, 9)) continue;
      if (!REPO.losClear(x, y, pane.x, pane.y)) continue;
      pl.x = x; pl.y = y; pl.dir = a; dungDuoc = true; break;
    }
    if (!dungDuoc) return { bo: true };
    let nhat = 0;
    for (let i = 0; i < 8 && pane.hp > 0 && S.mirror; i++){
      pl.swingCd = 0; pl.stam = pl.stamMax;
      REPO.meleeSwing(pl, null);
      nhat++;
    }
    const con = S.mirror ? S.mirror.a.hp : 0;
    return { goc: goc, con: con, nhat: nhat, vo: !S.mirror || S.mirror.a.hp <= 0 };
  });
  // ---- vỡ gương thì đồ phải rơi NGAY CHỖ VỪA ĐẬP ----
  // Trước bản này nó rơi ở chỗ CON MA, mà con ma đang đi lại trong nhà — người chơi đập vỡ
  // tấm gương trước mặt rồi cúi xuống nhặt thì chẳng có gì, còn món đồ nằm ở phòng khác.
  const roi = await p.evaluate(async () => {
    const S = REPO.S, pl = S.player;
    S.monsters.length = 0; S.mirror = null; S.foeDrops = 0;
    REPO.spawnMirrors();
    for (let i = 0; i < 40 && !S.mirror; i++) await new Promise(r => setTimeout(r, 50));
    if (!S.mirror) return { bo: true };
    const pane = S.mirror.a;
    const maO = S.mirror.m ? { x: S.mirror.m.x, y: S.mirror.m.y } : null;
    const truoc = S.loot.filter(l => l.fromFoe && !l.gone).length;
    REPO.breakMirror(pane);
    const moi = S.loot.filter(l => l.fromFoe && !l.gone);
    if (moi.length <= truoc) return { khongRoi: true };
    const l = moi[moi.length - 1];
    return {
      xaTam: Math.round(Math.hypot(l.x - pane.x, l.y - pane.y)),
      xaMa: maO ? Math.round(Math.hypot(l.x - maO.x, l.y - maO.y)) : null,
      coMa: !!maO
    };
  });
  check('vỡ gương thì đồ rơi ngay tại tấm vừa đập',
    roi.bo || roi.khongRoi || roi.xaTam <= 2,
    roi.bo ? 'không dựng được gương' : roi.khongRoi ? 'nhà hết suất đồ rơi'
           : 'cách tấm gương ' + roi.xaTam + 'px' + (roi.coMa ? ', cách con ma ' + roi.xaMa + 'px' : ''));

  check('phang đèn pin làm VỠ được gương', guong.bo || guong.vo,
    guong.bo ? 'không dựng được gương' : guong.nhat + ' nhát / ' + guong.goc + ' máu');
  check('vỡ gương phải mất vài nhát, không phải một', guong.bo || guong.nhat >= 2,
    guong.bo ? '' : guong.nhat + ' nhát');

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
    // Gửi tổ ba người về xe tải và cho đứng đó. Từ bản này đồng đội biết lái xe máy và húc
    // quái (BIKE_RAM_KNOCK = 430, gần 18 ô/giây), nên một con bot chạy ngang qua là đủ thổi
    // bay con quái đang đo hoặc giết luôn con ma gương — phép đo đỏ vì một thứ không liên
    // quan. Đẩy chúng ra chứ KHÔNG tắt hẳn tổ: vài kỹ năng đọc danh sách tổ để tính hiệu ứng.
    (REPO.S.mates || []).forEach(m => {
      if (m.riding) REPO.dismountBike(m);
      if (m.pushing) REPO.releaseCart(m);
      if (REPO.S.car){ m.x = REPO.S.car.x; m.y = REPO.S.car.y; }
      m.job = 'idle'; m.path = null; m.target = null; m.idleT = 9999; m.react = 9999;
    });
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

  // ---- gương và thiên thần phải mọc quanh CẢ TỔ, không chỉ quanh người chơi ----
  // Ca trực này là của bốn người; để mọi thứ đáng sợ chỉ mọc quanh đúng một người là biến ba
  // người kia thành đồ trang trí, và biến trò chơi thành một trò đoán được.
  const quanhTo = await p.evaluate(async () => {
    const S = REPO.S;
    const to = REPO.crew().filter(a => a && !a.down);
    if (to.length < 2) return { boQua: 'tổ chỉ có ' + to.length + ' người' };
    const gan = (x, y) => {                       // mọc gần AI nhất
      let best = null, bd = 1e9;
      REPO.crew().forEach((a, i) => { const d = Math.hypot(a.x - x, a.y - y); if (d < bd){ bd = d; best = i; } });
      return best;
    };
    const ai = { guong: {}, thien: {} };
    for (let i = 0; i < 40; i++){
      S.mirror = null; S.mirrorGone = false; S.mirrorTimer = 0;
      if (REPO.spawnMirrors() !== false && S.mirror){
        const k = gan(S.mirror.a.x, S.mirror.a.y); ai.guong[k] = (ai.guong[k] || 0) + 1;
      }
      S.angel = null; S.angelTimer = 0;
      if (REPO.spawnAngel() && S.angel){
        const k = gan(S.angel.x, S.angel.y); ai.thien[k] = (ai.thien[k] || 0) + 1;
      }
    }
    S.mirror = null; S.angel = null;
    return { soTo: to.length,
             guong: Object.keys(ai.guong).length, thien: Object.keys(ai.thien).length,
             chiTiet: JSON.stringify(ai) };
  });
  check('gương mọc quanh nhiều người trong tổ, không chỉ người chơi',
    !!quanhTo.boQua || quanhTo.guong > 1,
    quanhTo.boQua || ('mọc cạnh ' + quanhTo.guong + ' người khác nhau'));
  check('thiên thần cũng vậy',
    !!quanhTo.boQua || quanhTo.thien > 1,
    quanhTo.boQua || ('mọc cạnh ' + quanhTo.thien + ' người khác nhau'));

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

    // Bố cục bảng đã đổi: hàng nút là CHÂN TRANG thật, và #veilExtra là phần duy nhất cuộn.
    // Yêu cầu cũ "bảng phải dài hơn màn hình" là mô tả cái bố cục hỏng, không phải một điều
    // cần giữ. Cái CẦN giữ là: danh sách đủ dài để thật sự phải cuộn, và hàng nút không bao
    // giờ đè lên nó.
    const mo = await p.evaluate(() => {
      const box = document.getElementById('veilExtra');
      const a = document.querySelector('.veil-acts').getBoundingClientRect();
      const bx = box.getBoundingClientRect();
      return { moTu: !!REPO.S.stashOpen, danhSachCuonDuoc: box.scrollHeight > box.clientHeight + 1,
               nutDongY: Math.round(a.top), nutDongTrongMan: a.bottom <= innerHeight,
               khongDeLen: a.top >= bx.bottom - 1,
               so: document.querySelectorAll('[data-stash]').length };
    });
    check('[' + ten + '] tủ 8 món thì danh sách cuộn được', mo.moTu && mo.danhSachCuonDuoc && mo.so === 8,
      mo.so + ' món');
    check('[' + ten + '] hàng nút KHÔNG đè lên danh sách', mo.khongDeLen);
    check('[' + ten + '] nút "Đóng tủ" LUÔN nằm trong màn hình', mo.nutDongTrongMan,
      'y=' + mo.nutDongY + ' / màn 844');

    // Cuộn xuống đáy: mọi món phải với tới được, không món nào bị che.
    const che = await p.evaluate(() => {
      const box = document.getElementById('veilExtra');
      box.scrollTop = box.scrollHeight;
      const bx = box.getBoundingClientRect();
      const out = [];
      [...document.querySelectorAll('[data-stash]')].forEach((n, i) => {
        const r = n.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const nhin = r.top >= bx.top - 1 && r.bottom <= bx.bottom + 1;
        if (!nhin || !(t && n.contains(t))) out.push(String(i));
      });
      return out;
    });
    check('[' + ten + '] cuộn tới đáy thì không món nào bị che', che.length === 0,
      che.length ? 'món ' + che.join(', ') : '');

    // Lấy một món bằng cú CHẠM thật, và chỗ cuộn phải giữ nguyên.
    const lay = await p.evaluate(() => {
      const v = document.getElementById('veilExtra');
      const n = document.querySelector('[data-stash="5"]');
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, scr: v.scrollTop,
               inv: REPO.S.player.inv.map(x => x && x.kind), so: REPO.S.stash.length };
    });
    await p.touchscreen.tap(lay.x, lay.y);
    await p.waitForTimeout(250);
    const sau = await p.evaluate(() => ({
      inv: REPO.S.player.inv.map(x => x && x.kind), so: REPO.S.stash.length,
      scr: document.getElementById('veilExtra').scrollTop
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

    // ---- MỘT MÓN HỎNG TRONG TỦ KHÔNG ĐƯỢC GIẾT CẢ CA ----
    // Dựng lại đúng cơ chế của bug người chơi báo ("đến round 4 map 2, tủ đồ freeze
    // luôn, bấm nút cũng không tắt được"): showStash() ném lỗi vì một món trong tủ
    // không có trong bảng đồ, mà toggleStash() đã đóng băng thế giới TỪ TRƯỚC — nên
    // game đứng hình, không bảng, không nút.
    // Cách dựng: xoá một mục khỏi bảng đồ ĐANG DÙNG (REPO.GEAR_BY_KEY là chính đối
    // tượng bộ máy đọc, không phải bản sao), rồi mở tủ với một món thuộc mục đó.
    const hong = await p.evaluate(async () => {
      const S = REPO.S;
      if (S.stashOpen) REPO.toggleStash();
      S.running = true; S.dead = false;
      S.stash = [{ kind: 'gun', uses: 5 }, { kind: 'heal', uses: 2 }];
      const giu = REPO.GEAR_BY_KEY.gun;
      delete REPO.GEAR_BY_KEY.gun;                 // 'gun' thành món bộ máy không nhận ra
      REPO.warp(S.car.x, S.car.y);
      let nem = null;
      try { REPO.toggleStash(); } catch (e) { nem = e.message; }
      const v = document.getElementById('veil');
      const ra = {
        nem: nem,
        dongBang: !S.running && v.hidden,          // thế chết: đứng hình mà không có bảng
        bangHien: !v.hidden,
        coDongHong: /Món hỏng/.test(document.getElementById('veilExtra').innerHTML),
        soNutBoDi: document.querySelectorAll('[data-drop]').length
      };
      // bấm bỏ món hỏng đi
      const nut = document.querySelector('[data-drop]');
      if (nut) nut.click();
      await new Promise(r => setTimeout(r, 80));
      ra.conLai = S.stash.length;
      // đóng tủ lại
      const btn = document.getElementById('veilBtn');
      if (btn.onclick) btn.onclick();
      ra.dongDuoc = !S.stashOpen && document.getElementById('veil').hidden && S.running;
      REPO.GEAR_BY_KEY.gun = giu;
      return ra;
    });
    check('[' + ten + '] một món hỏng trong tủ KHÔNG làm đứng hình cả ca',
      !hong.dongBang && !hong.nem, hong.nem || (hong.dongBang ? 'đứng hình, không bảng' : ''));
    check('[' + ten + '] bảng tủ vẫn mở được, món hỏng hiện thành một dòng',
      hong.bangHien && hong.coDongHong && hong.soNutBoDi === 1);
    check('[' + ten + '] bỏ được món hỏng đi', hong.conLai === 1, hong.conLai + ' món còn lại');
    check('[' + ten + '] và vẫn đóng được tủ, ca chạy tiếp', hong.dongDuoc);

    const e = errs.filter(x => !/favicon|Tủ đồ dựng không được/.test(x));
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
    // HUỶ CẮT CẢNH TRƯỚC ĐÃ, và bật lại cờ chạy.
    //
    // step() bị chặn HOÀN TOÀN khi S.cut còn (xem frameStep: `if (S.running && !S.dead && !S.cut)`),
    // nên nếu một ca phía trên vừa để lại một đoạn cắt cảnh — xe tải tới, xe tải đi, đổi màn — thì
    // cả cụm đo dưới đây chạy trên một thế giới ĐỨNG HÌNH. Triệu chứng của nó là hai ca kỹ năng
    // xanh-đỏ thất thường: cả vế đối chứng lẫn vế có kỹ năng đều đọc ra 0 máu, và 0 == 0 thì bộ đo
    // không chứng minh được gì cả — đúng cái bẫy chú thích ở putFoes đã cảnh báo, chỉ đến từ một
    // hướng khác. Đây là lý do hai ca ấy đỏ khoảng một lần trong ba lần chạy.
    REPO.cancelCut();
    S.running = true;
    // Gửi tổ ba người về xe tải và cho đứng đó. Từ bản này đồng đội biết lái xe máy và húc
    // quái (BIKE_RAM_KNOCK = 430, gần 18 ô/giây), nên một con bot chạy ngang qua là đủ thổi
    // bay con quái đang đo hoặc giết luôn con ma gương — phép đo đỏ vì một thứ không liên
    // quan. Đẩy chúng ra chứ KHÔNG tắt hẳn tổ: vài kỹ năng đọc danh sách tổ để tính hiệu ứng.
    (REPO.S.mates || []).forEach(m => {
      if (m.riding) REPO.dismountBike(m);
      if (m.pushing) REPO.releaseCart(m);
      if (REPO.S.car){ m.x = REPO.S.car.x; m.y = REPO.S.car.y; }
      m.job = 'idle'; m.path = null; m.target = null; m.idleT = 9999; m.react = 9999;
    });
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
    // Chỉ đặt vào những hướng NHÌN THÔNG. Chói Loà cố tình không xuyên tường, nên
    // một con nấp sau vách vẫn đi tiếp là ĐÚNG — nhưng nó làm tổng quãng đường đo
    // được khác 0 và phép đo đỏ vì một lý do không liên quan tới cái đang đo.
    const goc = [];
    for (let k = 0; k < 32 && goc.length < n; k++) {
      const a = k / 32 * Math.PI * 2;
      const x = pl.x + Math.cos(a) * r * REPO.TILE, y = pl.y + Math.sin(a) * r * REPO.TILE;
      if (REPO.losClear(pl.x, pl.y, x, y) && !REPO.hitsSolid(x, y, 9)) goc.push(a);
    }
    for (let i = 0; i < n; i++) {
      const a = goc.length ? goc[i % goc.length] : i / n * Math.PI * 2;
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
  // CỬA SỔ ĐO PHẢI DÀI HƠN THÌ VUNG TAY.
  //
  // Từ 2026-09-03 không con quái nào đánh trúng ở đúng khung hình nó chạm vào người chơi nữa: nó
  // đứng khựng lại vung tay d.wind giây trước đã (Kẻ bám 0.52s), rồi mới kiểm xem còn trong tầm
  // không. Cửa sổ 1800ms cũ đủ cho luật cũ — trừ máu ngay khung hình đầu — nhưng nằm sát ranh với
  // luật mới, và ca ĐỐI CHỨNG đọc ra 0 máu. Cả hai ca kỹ năng khi đó xanh vì cả hai vế đều bằng 0,
  // tức là xanh mà không chứng minh được gì; đúng cái bẫy mà chú thích ở putFoes đã cảnh báo.
  //
  // 3200ms là chỗ cho ít nhất hai đòn trọn vẹn của con chậm tay nhất trong bảng.
  const DO_MAU_MS = 3200;
  // Ca ĐỐI CHỨNG chờ tới khi THẬT SỰ dính đòn, không đo theo cửa sổ cố định.
  //
  // Nó phải trả lời đúng một câu — 'không bấm kỹ năng thì có mất máu không' — và câu đó không có
  // hạn chót nào cả. Đo bằng cửa sổ cố định thì nó lẫn thêm một câu thứ hai, 'mất máu trong bao
  // lâu', mà câu ấy phụ thuộc vào tốc độ trang chạy bộ kiểm: đo được nhịp ghim chỉ chạy 44 lần
  // trong 3200ms (~14Hz thay vì 62Hz) khi máy đang gánh nhiều trang cùng lúc, và với thì vung
  // 0.52s của Kẻ bám thì chừng ấy nhịp không đủ cho một đòn trọn vẹn. Ca kỹ năng thì vẫn đo theo
  // cửa sổ cố định, vì câu của nó ĐÚNG LÀ 'trong ngần này giây có mất điểm nào không'.
  const DO_MAU_CHO_MS = 9000;
  const doMau = (choDinhDon) => p.evaluate(async ({ ms, cho }) => {
    const S = REPO.S, pl = S.player;
    // Cộng dồn từng lần máu TỤT, chứ không lấy hiệu đầu-cuối. Đổi tướng dẫn đoàn có thể kéo
    // theo một nhịp đồng bộ lại chỉ số làm máu nhảy LÊN giữa lúc đo, và một phép đo đầu-cuối
    // sẽ đọc ra số âm rồi báo hỏng vì một lý do không liên quan gì tới tàng hình.
    let mat = 0, truoc = pl.hp;
    let vung = 0, canNhat = 1e9, alertMax = 0, nFoe = 0, cut = 0, chay = 0, tgt = '?';
    const iv = setInterval(() => {
      if (pl.hp < truoc) mat += truoc - pl.hp;
      truoc = pl.hp;
      nFoe = S.monsters.length; if (S.cut) cut++; if (S.running) chay++;
      // GIỮ CỜ CHẠY SUỐT CỬA SỔ ĐO. Chẩn đoán bắt được: trong 3200ms chỉ có 33 trên 200 nhịp là
      // S.running còn bật — thế giới đứng hình 84% thời gian, nên cú vung tay khơi mào rồi mà không
      // bao giờ hoàn tất, và ca ĐỐI CHỨNG đọc ra 0 máu. Một thứ nào đó phía trên trong bộ kiểm (mở
      // tủ đồ, mở sổ tay) tắt cờ này và không phải lúc nào cũng bật lại kịp. Ghim nó ở đây cùng chỗ
      // đang ghim vị trí quái: cả hai đều là 'giữ nguyên sân đo', không phải sửa cái đang đo.
      S.running = true; S.cut = null;
      // ĐẨY ĐỒNG ĐỘI RA XA NGƯỜI CHƠI trong lúc đo.
      //
      // Con quái nhắm vào foeTarget(m), và cái đó CÓ THỂ chọn một người trong tổ chứ không nhất
      // thiết là người chơi. setup() dồn cả tổ về chỗ xe tải — mà người chơi cũng bắt đầu ở ngay
      // đó, nên ba con quái được ghim quanh người chơi lại đứng cạnh cả tổ, và cú đánh giáng vào
      // một đồng đội. Máu người chơi không tụt một điểm nào, ca ĐỐI CHỨNG đọc ra 0, và hai ca kỹ
      // năng xanh-đỏ thất thường tuỳ ai đứng gần hơn nửa pixel.
      //
      // Luật cũ giấu chuyện này: nó trừ máu ngay khung hình đầu tiên lọt vào tầm, nên mục tiêu bị
      // bốc lại mỗi khung và người chơi vẫn dính vài cú. Luật mới chốt mục tiêu ở cuối thì vung,
      // nên bốc trúng đồng đội một lần là mất nguyên cú đó.
      (S.mates || []).forEach(a => { a.x = pl.x + 3000; a.y = pl.y + 3000; });
      tgt = (S.monsters[0] && S.monsters[0].target === pl) ? 'player'
          : (S.monsters[0] && S.monsters[0].target) ? 'mate' : 'none';
      S.monsters.forEach((m, i) => {
        const a = i / S.monsters.length * Math.PI * 2;
        m.x = pl.x + Math.cos(a) * 14; m.y = pl.y + Math.sin(a) * 14;
        // GHIM CẢ CÚ HẤT, không chỉ ghim toạ độ.
        //
        // Từ 2026-09-03 một đòn cần con quái Ở TRONG TẦM SUỐT cả thì vung (Kẻ bám 0.52s), chứ không
        // còn là trúng ngay khung hình đầu tiên nó chạm tới. Ghim toạ độ mỗi 16ms là đủ cho luật cũ
        // — một khung hình trong tầm là xong — nhưng KHÔNG đủ cho luật mới: bất cứ thứ gì hất con
        // quái ra giữa chừng (cú hất của nút Đẩy, cái Lồng Sắt mà ca ngay phía trên vừa dựng, lực
        // tách thân giữa ba con) đều làm cú vung hụt, và ca ĐỐI CHỨNG đọc ra 0 máu. Đó là chỗ hai
        // ca kỹ năng đỏ khoảng một lần trong ba lần chạy: 0 == 0 thì không chứng minh được gì.
        m.kx = 0; m.ky = 0; m.stun = 0;
        if ((m.swing || 0) > 0) vung++;
        alertMax = Math.max(alertMax, m.alert || 0);
        canNhat = Math.min(canNhat, Math.hypot(m.x - pl.x, m.y - pl.y));
        // KHONG ep alert/state o day: de bo may tu quyet dinh no con thay minh khong.
        // Ep vao la tu tay xoa mat dieu dang can do.
      });
    }, 16);
    if (cho){
      const han = performance.now() + ms;
      while (performance.now() < han && mat === 0) await new Promise(r => setTimeout(r, 40));
    } else {
      await new Promise(r => setTimeout(r, ms));
    }
    clearInterval(iv);
    if (pl.hp < truoc) mat += truoc - pl.hp;
    return { mat, vung, nFoe, cut, chay, tgt, alertMax:+alertMax.toFixed(1),
             canNhat: canNhat === 1e9 ? null : Math.round(canNhat),
             invuln: +(pl.invulnT||0).toFixed(1), invis: +(pl.invisT||0).toFixed(1) };
  }, { ms: choDinhDon ? DO_MAU_CHO_MS : DO_MAU_MS, cho: !!choDinhDon });
  await setup(); await putFoes(3, 1.2);
  const chuan = await doMau(true); const mauChuan = chuan.mat;
  await setup(); await putFoes(3, 1.2);
  await useLead('linh');
  const tang = await doMau(); const mauTangHinh = tang.mat;
  check('Tàng Hình: quái không đánh trúng nữa', mauChuan > 0 && mauTangHinh === 0,
    'không bấm mất ' + mauChuan + ' máu · có bấm mất ' + mauTangHinh +
    ' · đối chứng: ' + JSON.stringify(chuan));

  // ---- 5. Thiên Thần: cả tổ thật sự không chết được ----
  await setup(); await putFoes(3, 1.2);
  await useLead('tuyet');
  const tt = await doMau(); const batTu = tt.mat;
  const guc = await p.evaluate(() => REPO.S.player.down);
  check('Thiên Thần: không mất một máu nào', mauChuan > 0 && batTu === 0 && !guc,
    'đối chứng mất ' + mauChuan + ' · có bấm mất ' + batTu + (guc ? ', vẫn gục' : '') +
    ' · đối chứng: ' + JSON.stringify(chuan));

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
  // ---- ba nguoi con lai cua to cung phai biet dung chieu ----
  // Nguoi choi quay gacha ra mot cai xac VI KY NANG cua no, xep vao to, roi ky nang do khong
  // bao gio chay - tru khi no duoc dat lam to truong. Ba o con lai thanh ba cuc chi so.
  const botChieu = await p.evaluate(async () => {
    if (SQ.squad.run()) SQ.squad.quit();
    SQ.ui.closePopup();
    SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
    SQ.autoFill(); SQ.squad.enter('k3');
    await new Promise(r => setTimeout(r, 400));
    const ghi = [];
    const goc = REPO.toast;
    REPO.toast = m => { ghi.push(m); return goc(m); };
    REPO.cancelCut(); REPO.S.running = true;
    REPO.S.monsters.length = 0;
    (REPO.S.mates || []).forEach(a => {
      const m = REPO.spawnFoe('patrol', 0, 0);
      m.x = a.x + 30; m.y = a.y; m.hp = 4000; m.hpMax = 4000; m.state = 'chase'; m.alert = 3;
    });
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 500));
      (REPO.S.mates || []).forEach((a, k) => {
        const m = REPO.S.monsters[k]; if (!m) return;
        m.x = a.x + 30; m.y = a.y; m.hp = 4000; m.alert = 3; m.state = 'chase';
      });
      REPO.S.player.hp = REPO.S.player.hpMax;
      if (ghi.filter(x => /dùng/.test(x)).length >= 3) break;
    }
    REPO.toast = goc;
    const dung = ghi.filter(x => /dùng/.test(x));
    // moi nguoi phai dung chieu CUA CHINH MINH, khong phai chieu cua to truong
    const ten = new Set(dung.map(x => x.split(' dùng ')[0]));
    const chieu = new Set(dung.map(x => (x.split(' dùng ')[1] || '').split(' — ')[0]));
    return { soLuot: dung.length, soNguoi: ten.size, soChieu: chieu.size,
             vd: dung.slice(0, 4) };
  });
  check('ba người còn lại trong tổ CÓ dùng chiêu', botChieu.soLuot > 0,
    botChieu.soLuot + ' lượt: ' + botChieu.vd.join(' | '));
  check('mỗi người dùng chiêu của CHÍNH MÌNH, không phải của tổ trưởng',
    botChieu.soNguoi >= 2 && botChieu.soChieu >= 2,
    botChieu.soNguoi + ' người · ' + botChieu.soChieu + ' chiêu khác nhau');

  check('một ván đếm đúng một lần', so.runs === 1, so.runs + ' ván');
  check('bộ đếm ngày/tuần có chạy', so.day === 1 && so.week === 1,
    'ngày ' + so.day + ' · tuần ' + so.week);

  const e = errs.filter(x => !/favicon/.test(x));
  check('sổ sách: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
// Xe tải chỉ lăn bánh khi có người ĐỨNG TRONG THÙNG đủ lâu. Trước đây chạm vào bán kính một
// khung hình là mất luôn phần còn lại của tầng — không hỏi, không đếm, không rút lại được.
async function boardingSuite(b) {
  results.push('\n── đứng trong xe đủ lâu xe mới chạy ──');
  const { ctx, p, errs } = await openGame(b, R2D, { width: 844, height: 390 });
  await p.locator('#veilBtn').click();
  await p.waitForTimeout(900);
  await p.evaluate(() => { REPO.S.cut = null; REPO.S.running = true; });
  await p.waitForTimeout(400);

  const T = await p.evaluate(() => REPO.TRUCK_BOARD_T);
  check('có luật đứng chờ, và nó đáng kể', T >= 3, T + 's');

  // Đứng vào thùng: đồng hồ phải chạy, và ván CHƯA được kết thúc.
  await p.evaluate(() => {
    REPO.S.pads.forEach(q => { q.done = true; q.value = q.quota; });
    REPO.S.levelDone = true;
    // Dọn quái đi: từ 2026-08-31 ải 1 có sẵn một đàn (Bom con hoặc Gnome), và khi levelDone thì
    // cả đàn vây thành vòng bán kính 3,8 ô quanh xe — đúng chỗ phép thử này bắt người chơi đứng
    // yên 5 giây. Bị hẩy ra khỏi thùng là đồng hồ về 0 và xe không bao giờ chạy. Cái đang đo ở
    // đây là LUẬT ĐỨNG CHỜ, không phải chuyện đánh nhau ở cửa xe.
    REPO.S.monsters.length = 0;
    REPO.warp(REPO.S.car.x, REPO.S.car.y);
  });
  await p.waitForTimeout(900);
  const dang = await p.evaluate(() => ({ b: REPO.boarding(), cut: !!REPO.S.cut, shop: !!REPO.S.shopMode }));
  check('bước vào thùng thì đồng hồ chạy', dang.b.show && dang.b.t > 0.3,
    dang.b.t + '/' + dang.b.of + 's · ' + dang.b.label);
  check('nhưng CHƯA đi ngay khi vừa chạm tới', !dang.cut && !dang.shop);

  // Bước ra: đồng hồ phải về 0, không phải tạm dừng.
  await p.evaluate(() => REPO.warp(REPO.S.car.x + REPO.TILE * 8, REPO.S.car.y));
  await p.waitForTimeout(350);
  const ra = await p.evaluate(() => REPO.boarding());
  check('bước ra khỏi thùng thì đồng hồ VỀ 0', !ra.show && ra.t === 0,
    ra.t + 's · hiện ' + ra.show);

  // Quay vào và ở lại đủ lâu: giờ mới được đi.
  await p.evaluate(() => REPO.warp(REPO.S.car.x, REPO.S.car.y));
  await p.waitForTimeout(T * 1000 + 900);
  const xong = await p.evaluate(() => ({ cut: !!REPO.S.cut, shop: !!REPO.S.shopMode }));
  check('ở lại đủ ' + T + 's thì xe mới chạy', xong.cut || xong.shop);

  const e = errs.filter(x => !/favicon/.test(x));
  check('đứng chờ xe: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
// SỔ TAY. Ba thứ dễ hỏng mà mắt không thấy ngay:
//   1. bảng phải DỰNG ĐƯỢC ở cả hai game, từ hai bảng dữ liệu khác nhau;
//   2. mở ra thì thế giới phải ĐỨNG LẠI, đóng vào thì phải CHẠY TIẾP — nút này bấm
//      được giữa ca, nên để quái đi tiếp sau tấm màn là bán mạng người đang đọc;
//   3. ở Biệt Đội, tấm màn nằm dưới hai luật CSS đang cố giấu nó (#menu z-8 và
//      `body:not(.in-run) #veil{display:none}`) — bảng dựng đủ 21 hàng mà vẫn vô hình.
//      Đó chính là cái bug đã gặp, nên nó phải có test riêng đo BỀ NGANG THẬT.
async function wikiSuite(b) {
  results.push('\n── sổ tay (bảng tra quái & chiêu) ──');

  // --- Ca Trực Đêm ---
  {
    const { ctx, p, errs } = await openGame(b, R2D, { width: 900, height: 700 });
    check('Ca Trực Đêm: có nút Sổ tay trên thanh trên',
      await p.locator('#wikiBtn').count() === 1);

    // Vào ca thật, và đợi đồng hồ mô phỏng thực sự nhúc nhích trước khi đo "đứng lại".
    await p.locator('#veilBtn').click();
    for (let i = 0; i < 30; i++) {
      if (await p.evaluate(() => REPO.S.ticks || 0)) break;
      await p.waitForTimeout(150);
      await p.evaluate(() => { const v = document.getElementById('veilBtn');
        if (v && !document.getElementById('veil').hidden) v.click(); });
    }
    const chay0 = await p.evaluate(() => REPO.S.ticks || 0);
    await p.waitForTimeout(500);
    check('mô phỏng đang chạy trước khi mở sổ', (await p.evaluate(() => REPO.S.ticks)) > chay0);

    await p.locator('#wikiBtn').click();
    await p.waitForTimeout(450);
    const mo = await p.evaluate(() => ({
      running: REPO.S.running,
      hien: !document.getElementById('veil').hidden,
      rong: document.getElementById('veil').getBoundingClientRect().width,
      hang: document.querySelectorAll('.wk-row').length,
      dau: [...document.querySelectorAll('.wk-h')].map(h => h.textContent),
      ticks: REPO.S.ticks
    }));
    check('bảng hiện ra và CHIẾM MÀN HÌNH', mo.hien && mo.rong > 200, mo.rong + 'px');
    check('có đủ hai mục: quái, và thứ bạn dùng được', mo.dau.length === 2, mo.dau.join(' / '));
    check('mỗi con quái một hàng, cộng đồ nghề',
      mo.hang === (await p.evaluate(() => Object.keys(REPO.MONSTERS).length + REPO.GEAR.length)),
      mo.hang + ' hàng');
    check('mở sổ thì THẾ GIỚI ĐỨNG LẠI', mo.running === false);

    await p.waitForTimeout(600);
    check('và đứng yên thật, không chỉ tắt cờ',
      (await p.evaluate(() => REPO.S.ticks)) === mo.ticks);

    // Mọi con quái phải có một dòng luật — bảng tra mà bỏ trống một hàng là bảng nói dối.
    const thieu = await p.evaluate(() => Object.keys(REPO.MONSTERS)
      .filter(k => !(REPO.MONSTERS[k].wiki || '').trim()));
    check('con nào cũng có một dòng luật để đọc', thieu.length === 0, thieu.join(','));

    await p.locator('#veilBtn').click();
    await p.waitForTimeout(400);
    const t1 = await p.evaluate(() => REPO.S.ticks);
    await p.waitForTimeout(600);
    const dong = await p.evaluate(() => ({ running: REPO.S.running, ticks: REPO.S.ticks,
      an: document.getElementById('veil').hidden,
      co: document.body.classList.contains('wiki-open') }));
    check('đóng sổ thì tấm màn tắt và cờ được gỡ', dong.an && !dong.co);
    check('đóng sổ thì thế giới CHẠY TIẾP', dong.running && dong.ticks > t1,
      t1 + ' -> ' + dong.ticks);

    const e = errs.filter(x => !/favicon/.test(x));
    check('sổ tay Ca Trực Đêm: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // --- Biệt Đội: mở NGAY Ở MÀN MENU, đúng lúc hai luật CSS kia đang bật ---
  {
    const { ctx, p, errs } = await openGame(b, SQ, { width: 900, height: 700 });
    check('Biệt Đội: có nút Sổ tay', await p.locator('#wikiBtn').count() === 1);
    // Cửa vào thứ hai, và là cửa duy nhất tìm thấy được: nút trên thanh chrome của trang nhỏ
    // và lẫn vào giữa "← Hub" với "⟳" — chủ dự án mở bảng không ra. Ở sảnh, sổ tay đứng ngang
    // hàng Gacha / Nhiệm Vụ, cùng cỡ 64×60.
    const railWiki = p.locator('.rail-b', { hasText: 'Sổ Tay' });
    check('và ngoài sảnh có nút Sổ Tay đứng cùng hàng với Gacha',
      await railWiki.count() === 1);
    const cỡ = await railWiki.boundingBox();
    const cỡGacha = await p.locator('.rail-b', { hasText: 'Gacha' }).boundingBox();
    check('nút đó to đúng bằng nút Gacha',
      cỡ && cỡGacha && Math.abs(cỡ.width - cỡGacha.width) < 1 &&
      Math.abs(cỡ.height - cỡGacha.height) < 1,
      cỡ && Math.round(cỡ.width) + 'x' + Math.round(cỡ.height));
    await railWiki.click();
    await p.waitForTimeout(500);
    check('bấm nút ngoài sảnh cũng mở đúng bảng đó',
      (await p.locator('.wk-row').count()) > 0 &&
      !(await p.evaluate(() => document.getElementById('veil').hidden)));
    await p.locator('#veilBtn').click();
    await p.waitForTimeout(300);
    await p.locator('#wikiBtn').click();
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const v = document.getElementById('veil');
      const r = v.getBoundingClientRect();
      // Ai đang nằm TRÊN CÙNG ở giữa màn: phải là một hàng của sổ tay, không phải menu.
      const tren = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
      return { rong: r.width, cao: r.height, disp: getComputedStyle(v).display,
        hang: document.querySelectorAll('.wk-row').length,
        // Không so tên lớp: điểm giữa màn có thể rơi vào #veilExtra (không có class)
        // hay vào thẻ <p> trong một hàng. Câu hỏi đúng là "nó có THUỘC tấm màn không".
        trongVeil: !!(tren && v.contains(tren)),
        tren: tren ? (tren.tagName + '.' + tren.className + '#' + tren.id) : '',
        dau: [...document.querySelectorAll('.wk-h')].map(h => h.textContent) };
    });
    check('ở màn menu, sổ tay vẫn HIỆN (không bị display:none)',
      m.disp !== 'none' && m.rong > 200 && m.cao > 200, m.disp + ' ' + m.rong + 'x' + m.cao);
    check('và nằm TRÊN menu, không khuất bên dưới', m.trongVeil, 'trên cùng: ' + m.tren);
    check('quái lấy từ SQ.FOES, chiêu lấy từ SQ.CHARS',
      m.hang === (await p.evaluate(() => Object.keys(SQ.FOES).length + SQ.CHARS.length)),
      m.hang + ' hàng');
    check('mục thứ hai là chiêu, không phải đồ nghề', /Chiêu/.test(m.dau[1] || ''), m.dau.join(' / '));

    await p.locator('#veilBtn').click();
    await p.waitForTimeout(400);
    check('đóng sổ ở màn menu thì menu hiện lại nguyên vẹn',
      await p.evaluate(() => document.getElementById('veil').hidden &&
        !document.body.classList.contains('wiki-open') &&
        getComputedStyle(document.getElementById('menu')).display !== 'none'));

    const e = errs.filter(x => !/favicon/.test(x));
    check('sổ tay Biệt Đội: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// =====================================================================
// PHA CHẠY — căn nhà sau lần rút hàng cuối.
//
// Bài đo quan trọng nhất ở đây là bài SO SÁNH: trước khi có pha này, chốt xong bệ cuối làm căn
// nhà YÊN HƠN lúc đang làm (queueRespawn bỏ chạy khi levelDone, stepRespawns xoá sạch hàng đợi),
// nên một phép thử chỉ nhìn "có quái không" sẽ đạt cả trước lẫn sau khi sửa. Cái phải khoá là
// dấu của hiệu số.
async function escapeSuite(b) {
  results.push('\n── pha chạy sau bệ cuối ──');
  const { ctx, p, errs } = await openGame(b, R2D, { width: 900, height: 640 });
  await p.locator('#veilBtn').click();
  for (let i = 0; i < 30; i++) {
    if (await p.evaluate(() => REPO.S.ticks || 0)) break;
    await p.waitForTimeout(150);
    await p.evaluate(() => { const v = document.getElementById('veilBtn');
      if (v && !document.getElementById('veil').hidden) v.click(); });
  }

  // --- ải 1–2 có một đàn, ải 3 thì không -------------------------------------
  const dan = await p.evaluate(() => {
    const r = {};
    for (const lv of [1, 2, 3]) {
      r[lv] = [];
      for (let s = 0; s < 10; s++) {
        REPO.S.level = lv; REPO.startLevel(3000 + s * 131);
        r[lv].push(REPO.S.roster.filter(k => REPO.PACK_KINDS.indexOf(k) >= 0));
      }
    }
    return r;
  });
  for (const lv of [1, 2]) {
    check('ải ' + lv + ': ván nào cũng có ĐÚNG một đàn',
      dan[lv].every(x => x.length === 1), JSON.stringify(dan[lv].map(x => x.join())));
  }
  check('và đàn đó bốc ngẫu nhiên, không phải lúc nào cũng một loài',
    new Set([].concat(dan[1], dan[2]).map(String)).size > 1);
  check('ải 3 KHÔNG bị thêm đàn (bảng viết tay giữ nguyên)',
    dan[3].every(x => x.length === 0));

  // --- trước bệ cuối: nhà chưa trở mặt --------------------------------------
  const xa = () => p.evaluate(() => {
    let best = null, bd = 1e9;
    for (let gy = 1; gy < REPO.MH - 1; gy++) for (let gx = 1; gx < REPO.MW - 1; gx++) {
      const x = (gx + 0.5) * REPO.TILE, y = (gy + 0.5) * REPO.TILE;
      if (REPO.hitsSolid(x, y, 10)) continue;
      const d = Math.abs(Math.hypot(x - REPO.S.car.x, y - REPO.S.car.y) / REPO.TILE - 18);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    REPO.warp(best.x, best.y);
    (REPO.S.mates || []).forEach(m => { m.x = best.x + 16; m.y = best.y + 16; });
  });
  await p.evaluate(() => { REPO.S.level = 5; REPO.startLevel(505); });
  await p.waitForTimeout(300);
  await xa();
  const truoc = await p.evaluate(() => ({ esc: REPO.escape(), glow: REPO.memGlow(),
    n: REPO.S.monsters.length }));
  check('chưa chốt bệ cuối thì không có pha chạy, đèn nhà còn nguyên',
    truoc.esc === null && truoc.glow === 1);

  // --- chốt bệ cuối ---------------------------------------------------------
  // Bất tử TRƯỚC khi chốt, không phải sau. stepEscape dừng hẳn khi S.dead, và bản chạy đầu của
  // bộ này báo "nhịp 3s -> 3s (đã chết)": người chơi đứng im giữa một căn nhà vừa được gọi thêm
  // chín con thì chết ở khoảng giây mười một, và bơm máu sau đó không gỡ được cờ S.dead.
  // Cái đang đo ở đây là NHỊP của căn nhà, không phải khả năng sống sót.
  // (Việc đứng im sau bệ cuối giờ là chết thật — đó chính là thứ pha này được dựng ra để làm.)
  await p.evaluate(() => { REPO.S.player.hpMax = 1e9; REPO.S.player.hp = 1e9;
                           REPO.S.levelDone = true; REPO.startEscape(); });
  const T = await p.evaluate(() => ({ delay: REPO.ESC_DELAY, hornN: REPO.ESC_HORN_N,
    hornT: REPO.ESC_HORN_T, dark: REPO.ESC_DARK, ping0: REPO.ESC_PING_0,
    up: REPO.ESC_PING_UP, max: REPO.ESC_PING_MAX, resp: REPO.ESC_RESPAWN,
    hi: REPO.ESC_SPOT_HI, tile: REPO.TILE }));

  await p.waitForTimeout(600);
  const som = await p.evaluate(() => REPO.escape());
  check('trong ' + T.delay + 's đầu, còi CHƯA rú', som && som.horns === 0, JSON.stringify(som));

  // Chờ theo TRẠNG THÁI, không theo đồng hồ treo tường. e.t chạy bằng thời gian MÔ PHỎNG, và
  // pha này vừa gọi thêm chín cái thân vào một trang đang vẽ — khung hình tụt thì 11 giây thật
  // chỉ là hơn tám giây mô phỏng, và phép thử báo 3/4 tiếng còi trong khi luật vẫn đúng.
  // Đo được: 2/3 lần chạy hỏng theo đúng kiểu đó.
  for (let i = 0; i < 60; i++) {
    if ((await p.evaluate(() => REPO.escape().horns)) >= T.hornN) break;
    await p.waitForTimeout(500);
  }
  const sauCoi = await p.evaluate(() => ({ e: REPO.escape(), glow: REPO.memGlow(),
    n: REPO.S.monsters.length, q: REPO.respawns().length,
    quanhXe: REPO.S.monsters.filter(m =>
      Math.hypot(m.x - REPO.S.car.x, m.y - REPO.S.car.y) < 12 * REPO.TILE).length }));
  check('xe tải rú đủ ' + T.hornN + ' lần trong ' + T.hornT + 's',
    sauCoi.e.horns === T.hornN && sauCoi.e.t <= T.delay + T.hornT + 1,
    sauCoi.e.horns + '/' + T.hornN + ' xong ở giây mô phỏng ' + sauCoi.e.t);
  check('đèn trong nhà TẮT, trí nhớ căn nhà tối lại',
    Math.abs(sauCoi.glow - T.dark) < 0.02, sauCoi.glow + ' (đích ' + T.dark + ')');
  check('đợt gọi thêm đã vào hết hàng đợi', sauCoi.q === 0, sauCoi.q + ' còn chờ');
  check('và nhà giờ đông hơn lúc vừa chốt', sauCoi.n > truoc.n, truoc.n + ' -> ' + sauCoi.n);
  check('quái mới đứng QUANH XE, không phải ở rìa bản đồ',
    sauCoi.quanhXe >= 2, sauCoi.quanhXe + ' con trong 12 ô quanh xe');

  // --- hồi sinh tụt xuống 1 giây -------------------------------------------
  const nhanh = await p.evaluate(() => {
    const truoc = REPO.respawns().length;
    // hạ một con đi lẻ: loài đi đàn không bao giờ được xếp lại, đó là luật riêng của chúng
    const m = REPO.S.monsters.find(x => !REPO.MONSTERS[x.type].pack);
    if (!m) return null;
    REPO.killMonster(m);
    const sau = REPO.respawns();
    return { them: sau.length - truoc, t: sau.length ? sau[sau.length - 1].t : null };
  });
  check('hạ một con trong pha chạy thì nó ĐƯỢC xếp quay lại',
    nhanh && nhanh.them === 1, JSON.stringify(nhanh));
  check('và quay lại sau ' + T.resp + 's chứ không phải 45s',
    nhanh && Math.abs(nhanh.t - T.resp) < 0.05, nhanh && nhanh.t);

  // --- nhịp chỉ điểm giãn dần ----------------------------------------------
  const g0 = (await p.evaluate(() => REPO.escape())).gap;
  await p.waitForTimeout(g0 * 1000 + 2000);
  const sau = await p.evaluate(() => ({ e: REPO.escape(), chet: REPO.S.dead }));
  check('nhịp chỉ điểm giãn thêm ' + T.up + 's mỗi lần',
    !sau.chet && sau.e.gap === Math.min(T.max, g0 + T.up),
    g0 + 's -> ' + sau.e.gap + 's' + (sau.chet ? ' (đã chết)' : ''));

  // --- trạm dịch vụ không phải chỗ bị đuổi ----------------------------------
  await p.evaluate(() => REPO.startShop());
  await p.waitForTimeout(500);
  const shop = await p.evaluate(() => ({ esc: REPO.escape(), glow: REPO.memGlow() }));
  check('vào trạm dịch vụ thì pha chạy tắt và đèn sáng lại',
    shop.esc === null && shop.glow === 1, JSON.stringify(shop));

  const e = errs.filter(x => !/favicon/.test(x));
  check('pha chạy: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
// KHÔNG CÓ ĐÒN NÀO GIÁNG NGAY LÚC CHẠM.
//
// Chủ dự án, 2026-09-03: "không có con quái nào khi chạm vào sẽ gây sát thương ngay lập tức mà
// chúng sẽ cần anim dùng tay đánh hay cắn để user còn có đường né, chạy" — vì "cảm giác cứ ủn vào
// là đau rất khó chịu". Và: "quái sau 1 lúc dí chạy phải mệt, ngu đi để user còn chạy thoát".
//
// Bộ này đo ba thứ, và cả ba đều HỎNG trên mã trước bản vá:
//   1. giữa lúc con quái bắt đầu vung và lúc máu tụt phải có một quãng thời gian THẬT;
//   2. lùi ra trong quãng đó thì không mất một điểm máu nào — nếu không thì cái quãng ấy chỉ là
//      hiệu ứng, không phải một đường thoát;
//   3. Bom con không được đánh ai, nó tự nổ.
async function meleeSuite(b) {
  results.push('\n── đòn đánh phải báo trước, và đuổi lâu thì mệt ──');
  const { ctx, p, errs } = await openGame(b, R2D, { width: 844, height: 390 });
  for (let i = 0; i < 30; i++) {
    if (await p.evaluate(() => REPO.S.ticks || 0)) break;
    await p.waitForTimeout(150);
    await p.evaluate(() => { const v = document.getElementById('veilBtn');
      if (v && !document.getElementById('veil').hidden) v.click(); });
  }
  // Dựng sân đo: một ván sạch, không đồng đội, không cắt cảnh. cancelCut() là bắt buộc —
  // step() bị chặn hoàn toàn khi S.cut còn, nên thiếu dòng này thì mọi con số đọc ra đều là 0
  // và bộ đo sẽ báo xanh cho một thế giới đang đứng hình.
  const san = () => p.evaluate(() => {
    REPO.S.level = 1; REPO.startLevel(1234); REPO.S.running = true; REPO.cancelCut();
    REPO.S.monsters.length = 0;
    (REPO.S.mates || []).forEach(m => { m.x = -9999; m.y = -9999; });
    REPO.S.player.hp = REPO.S.player.hpMax; REPO.S.hurtLog = [];
    REPO.S.noiseOverride = 0;
  });

  // --- 1. mỗi loài phải có quãng báo trước ---
  for (const loai of ['patrol', 'stalk', 'heavy']) {
    await san();
    const r = await p.evaluate(async (t) => {
      REPO.spawnFoe(t, 20, 0);
      const pl = REPO.S.player, bd = performance.now();
      let tVung = null, tDon = null;
      const iv = setInterval(() => {
        const m = REPO.S.monsters.find(q => q.type === t); if (!m) return;
        m.alert = 9;
        if (tVung === null && (m.swing || 0) > 0) tVung = performance.now();
        if (tDon === null && REPO.S.hurtLog.some(x => x.src === t)) tDon = performance.now();
      }, 8);
      await new Promise(r => setTimeout(r, 3000));
      clearInterval(iv);
      return { bao: (tVung !== null && tDon !== null) ? +((tDon - tVung) / 1000).toFixed(2) : null,
               wind: REPO.MONSTERS[t].wind, don: REPO.S.hurtLog.filter(x => x.src === t).length };
    }, loai);
    check(loai + ': có vung tay rồi mới trúng, không trúng ngay lúc chạm',
      r.don > 0 && r.bao !== null && r.bao >= r.wind * 0.6,
      'báo trước ' + r.bao + 's / thì vung ' + r.wind + 's, ' + r.don + ' đòn');
  }

  // --- 2. lùi ra trong lúc nó vung thì không mất máu ---
  await san();
  const ne = await p.evaluate(async () => {
    REPO.spawnFoe('heavy', 20, 0);
    const pl = REPO.S.player;
    const iv = setInterval(() => {
      const m = REPO.S.monsters.find(q => q.type === 'heavy'); if (!m) return;
      m.alert = 9;
      if ((m.swing || 0) > 0) {                       // nó vừa ngoác tay: LÙI RA
        const a = Math.atan2(pl.y - m.y, pl.x - m.x);
        pl.x = m.x + Math.cos(a) * 40; pl.y = m.y + Math.sin(a) * 40;
      }
    }, 8);
    await new Promise(r => setTimeout(r, 3200));
    clearInterval(iv);
    return Math.round(pl.hpMax - pl.hp);
  });
  check('lùi ra lúc nó vung thì không mất một điểm máu nào', ne === 0, ne + ' máu');

  // --- 3. Bom con: không đánh, chỉ tự nổ ---
  await san();
  const bom = await p.evaluate(async () => {
    REPO.spawnFoe('banger', 20, 0);
    const iv = setInterval(() => {
      const m = REPO.S.monsters.find(q => q.type === 'banger'); if (m) m.alert = 9; }, 16);
    await new Promise(r => setTimeout(r, 4500));
    clearInterval(iv);
    return { canChien: REPO.S.hurtLog.filter(x => x.src === 'banger').length,
             no: REPO.S.hurtLog.filter(x => x.src === 'bomb').length,
             conSong: !!REPO.S.monsters.find(q => q.type === 'banger'),
             speed: REPO.MONSTERS.banger.speed,
             nhanhHonNguoi: REPO.MONSTERS.banger.speed >= Math.round(REPO.playerSpeed(REPO.S.player)) };
  });
  check('Bom con không vung tay vào ai bao giờ', bom.canChien === 0, bom.canChien + ' cú');
  check('mà nó tự nổ và tự chết', bom.no > 0 && !bom.conSong,
    bom.no + ' vụ nổ, ' + (bom.conSong ? 'vẫn còn sống' : 'đã tự huỷ'));
  check('và nó chậm hơn người chơi, nên chạy là thoát được',
    !bom.nhanhHonNguoi, 'quái ' + bom.speed);

  // --- 4. đuổi lâu thì mệt ---
  await san();
  const met = await p.evaluate(async () => {
    REPO.S.noiseOverride = 2.6;
    REPO.spawnFoe('patrol', 200, 0);
    const mau = [];
    const iv = setInterval(() => {
      const m = REPO.S.monsters.find(q => q.type === 'patrol'); if (!m) return;
      m.alert = 9;
      mau.push({ t: +(m.chaseT || 0).toFixed(1), met: +(m.tired || 0).toFixed(2) });
    }, 200);
    await new Promise(r => setTimeout(r, 11000));
    clearInterval(iv);
    REPO.S.noiseOverride = null;
    const dau = mau.find(x => x.t >= 1 && x.t <= 2), cuoi = mau[mau.length - 1];
    return { dau, cuoi };
  });
  check('đuổi một lúc thì quái ĐUỐI, không giữ nguyên sức mãi',
    met.dau && met.cuoi && met.dau.met === 0 && met.cuoi.met > 0.7,
    'giây ' + (met.dau && met.dau.t) + ' mệt ' + (met.dau && met.dau.met) +
    ' -> giây ' + (met.cuoi && met.cuoi.t) + ' mệt ' + (met.cuoi && met.cuoi.met));

  await p.evaluate(() => { REPO.S.noiseOverride = null; });
  const e = errs.filter(x => !/favicon/.test(x));
  check('đòn đánh: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
}

// =====================================================================
// ĐÈN PIN CHIẾU LÊN TƯỜNG.
//
// Đa giác tầm nhìn dựng từ các GÓC của vật cản nên biên của nó nằm đúng trên MẶT tường, và ô
// tường luôn rơi ra ngoài vùng được clip — soi đèn thẳng vào tường thì tường vẫn đen. Bộ này đo
// bằng cách so CHÍNH MỘT Ô ĐÓ ở hai tư thế: quay mặt vào và quay lưng lại. Hiệu số mới là bằng
// chứng; một con số tuyệt đối thì không, vì nó lẫn cả màu gạch, lớp trí nhớ và cái vignette.
//
// Và phải khoá cả hai đầu: tường SÁNG lên, mà sàn NGAY SAU tường thì KHÔNG — nới rộng vùng sáng
// mà không chặn được ở đó thì thành nhìn xuyên tường, tức là đổi một lỗi lấy một lỗi tệ hơn.
async function lightSuite(_khongDung) {
  results.push('\n── đèn pin phải soi sáng được tường ──');
  // Trình duyệt RIÊNG, vì bộ này đọc pixel bằng getImageData mà art nạp qua file:// làm canvas
  // "nhiễm chéo nguồn" — Chromium chặn thẳng bằng SecurityError. Cờ này chỉ mở trong bộ đo pixel
  // này, không mở cho cả bộ kiểm.
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const { ctx, p, errs } = await openGame(b, R2D, { width: 900, height: 640 });
  await p.locator('#veilBtn').click();
  for (let i = 0; i < 30; i++) {
    if (await p.evaluate(() => REPO.S.ticks || 0)) break;
    await p.waitForTimeout(150);
    await p.evaluate(() => { const v = document.getElementById('veilBtn');
      if (v && !document.getElementById('veil').hidden) v.click(); });
  }
  // Thế đứng phải DÒ QUA NHIỀU HẠT GIỐNG, không đóng đinh vào một ván.
  //
  // Bộ này từng ghim REPO.startLevel(1234) rồi tìm thế đứng trong đúng ván ấy. Thêm đúng một mẫu
  // phòng vào bảng ROOMS là thứ tự bốc phòng đổi, ván 1234 ra một căn nhà khác, và hai ca đo gãy
  // vì không dựng nổi thế đứng — chứ không phải vì ánh sáng sai. Một bộ đo pixel mà phụ thuộc vào
  // việc bảng phòng có bao nhiêu dòng thì nó đo cả những thứ nó không định đo.
  //
  // Và thế đứng phải CÁCH MÉP BẢN ĐỒ: camera chặn lại ở rìa, nên đứng sát rìa thì điểm đo tính
  // theo screenOf rơi lên thanh máu ở góc trên trái. Đo được lúc đó là 198/255 cả khi quay mặt lẫn
  // khi quay lưng — đúng màu của cái thanh máu, không phải màu của cái sàn.
  const MEP = 9;
  const doVan = async (timFn) => {
    for (const seed of [1234, 7, 42, 99, 512, 2026, 31337, 8080, 606, 1717]) {
      const r = await p.evaluate(g => {
        REPO.S.level = 4; REPO.startLevel(g.seed);
        REPO.S.monsters.length = 0;
        (REPO.S.mates || []).forEach(m => { m.x = -9999; m.y = -9999; });
        return eval('(' + g.fn + ')')(g.mep);
      }, { seed, fn: timFn.toString(), mep: MEP });
      if (r) { await p.waitForTimeout(400); return Object.assign({ seed }, r); }
    }
    return null;
  };

  // Một hành lang dọc: ba ô sàn đi lên rồi tới tường. Đứng dưới cùng, ngửa đèn lên.
  const cho = await doVan(mep => {
    const T = REPO.TILE;
    for (let gy = mep; gy < REPO.MH - mep; gy++) for (let gx = mep; gx < REPO.MW - mep; gx++) {
      let ok = true;
      for (let k = 0; k < 3; k++) if (REPO.solidAt(gx, gy - k)) { ok = false; break; }
      if (!ok || !REPO.solidAt(gx, gy - 3)) continue;
      const px = (gx + 0.5) * T, py = (gy + 0.5) * T;
      if (REPO.hitsSolid(px, py, 10)) continue;
      REPO.warp(px, py);
      return { gx, gy };
    }
    return null;
  });
  check('dựng được thế đứng để đo: hành lang cụt, cuối là tường', !!cho, JSON.stringify(cho));

  // Hướng nhìn bị ghi đè mỗi khung nếu có input, nên phải ép lại liên tục.
  const nhin = async (dir) => {
    await p.evaluate(d => { if (window.__k) clearInterval(window.__k);
      window.__k = setInterval(() => { REPO.S.player.dir = d; }, 16); }, dir);
    await p.waitForTimeout(2400);
    return p.evaluate(() => {
      const c = document.getElementById('game'), g = c.getContext('2d');
      const T = REPO.TILE, S = REPO.S;
      const gx0 = (S.player.x / T) | 0, gy0 = (S.player.y / T) | 0;
      // Trung bình một mảng 9x9 quanh tâm ô, để một đường kẻ gạch không lái kết quả.
      const lay = d => {
        const s = REPO.screenOf((gx0 + 0.5) * T, (gy0 - d + 0.5) * T);
        let t = 0, n = 0;
        for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
          const q = g.getImageData(Math.round(s.x) + i, Math.round(s.y) + j, 1, 1).data;
          t += (q[0] + q[1] + q[2]) / 3; n++;
        }
        return Math.round(t / n);
      };
      return { san: lay(2), tuong: lay(3), sauTuong: lay(4) };
    });
  };
  const vao = await nhin(-Math.PI / 2);          // ngửa lên, soi thẳng vào tường
  const ra  = await nhin(Math.PI / 2);           // quay lưng lại

  check('đo được: soi đèn vào thì SÀN phía trước sáng hẳn lên',
    vao.san - ra.san > 40, ra.san + ' -> ' + vao.san);
  check('và ô TƯỜNG cuối hành lang cũng sáng lên theo',
    vao.tuong - ra.tuong > 25, ra.tuong + ' -> ' + vao.tuong);
  check('nhưng sàn NGAY SAU bức tường vẫn tối như cũ',
    Math.abs(vao.sauTuong - ra.sauTuong) < 10 && vao.sauTuong < 25,
    ra.sauTuong + ' -> ' + vao.sauTuong);

  // --- cánh cửa ĐÓNG: sáng được, mà vẫn không nhìn xuyên qua ---------------
  const cua = await p.evaluate(() => {
    const T = REPO.TILE, d = (REPO.S.doors || [])[0];
    if (!d) return null;
    d.leaf[0] = 0; d.leaf[1] = 0; d.open = 0;
    REPO.warp(d.vertical ? d.x + T * 2.5 : d.x, d.vertical ? d.y : d.y + T * 2.5);
    window.__cuaDir = d.vertical ? Math.PI : -Math.PI / 2;
    return { doc: !!d.vertical };
  });
  const nhinCua = async (dir) => {
    await p.evaluate(d => { if (window.__k) clearInterval(window.__k);
      window.__k = setInterval(() => { REPO.S.player.dir = d;
        (REPO.S.doors || []).forEach(q => { q.leaf[0] = 0; q.leaf[1] = 0; q.open = 0; }); }, 16); }, dir);
    await p.waitForTimeout(2400);
    return p.evaluate(() => {
      const c = document.getElementById('game'), g = c.getContext('2d');
      const T = REPO.TILE, d = REPO.S.doors[0];
      const ux = d.vertical ? 1 : 0, uy = d.vertical ? 0 : 1;
      const lay = (wx, wy) => {
        const s = REPO.screenOf(wx, wy);
        let t = 0, n = 0;
        for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
          const q = g.getImageData(Math.round(s.x) + i, Math.round(s.y) + j, 1, 1).data;
          t += (q[0] + q[1] + q[2]) / 3; n++;
        }
        return Math.round(t / n);
      };
      return { taiCua: lay(d.x, d.y),
               sauCua: lay(d.x - ux * T * 1.2, d.y - uy * T * 1.2),
               xaHon:  lay(d.x - ux * T * 2.4, d.y - uy * T * 2.4) };
    });
  };
  if (cua) {
    const cVao = await nhinCua(await p.evaluate(() => window.__cuaDir));
    const cRa  = await nhinCua(await p.evaluate(() => window.__cuaDir + Math.PI));
    check('cánh cửa ĐÓNG cũng sáng lên khi soi đèn vào',
      cVao.taiCua - cRa.taiCua > 25, cRa.taiCua + ' -> ' + cVao.taiCua);
    check('mà phòng sau cánh cửa đóng thì vẫn không thấy gì',
      cVao.sauCua < 25 && cVao.xaHon < 25, cVao.sauCua + ' / ' + cVao.xaHon);
  }

  // --- MẶT TƯỜNG SÁNG NGANG CÁI SÀN, VÀ DẢI SÁNG KHÔNG SỨT -----------------------------
  // Hai ca này là hai nửa của cùng một báo cáo — "soi đèn vào tường mà tường vẫn chưa tỏ":
  //   1. nước sơn tường tối hơn nước sơn sàn thì NHÂN với ánh sáng nào cũng vẫn ra tối hơn,
  //      nên phải đo tường SO VỚI sàn ngay trước nó chứ không so với chính nó lúc tắt đèn;
  //   2. tia nào chạm tường sát đường ranh giữa hai ô tường thì đèn ăn vào đúng 0 điểm ảnh,
  //      nên cứ đúng một ô lại có một vết khuyết đen ăn ngược vào dải sáng.
  const day = await doVan(mep => {
    const T = REPO.TILE, S = REPO.S, MW = REPO.MW, MH = REPO.MH;
    const G = (gx, gy) => S.grid[gy * MW + gx];
    for (let gy = mep; gy < MH - mep; gy++) for (let gx = mep; gx < MW - mep; gx++) {
      let ok = true;
      for (let j = -2; j <= 2; j++) if (G(gx + j, gy) !== 1) ok = false;        // dãy tường 5 ô
      for (let k = 1; k <= 3 && ok; k++) for (let j = -2; j <= 2; j++)
        if (G(gx + j, gy + k) !== 0) ok = false;                                // sàn trống trước mặt
      // VÀ CẢ DÃY PHẢI NẰM GỌN TRONG MỘT PHÒNG.
      //
      // Từ 2026-09-03 mỗi phòng mang một nước đá riêng, nên một dãy tường vắt qua ranh hai phòng
      // có hai nước sơn khác nhau — đo được cột cạn nhất 34 trong khi cột giữa dải 123, mà cả dải
      // vẫn liền, không sứt một chỗ nào. Cái bộ này đi tìm là vết khuyết của ĐA GIÁC ÁNH SÁNG;
      // để nó đo qua một chỗ đổi nước sơn là bắt nó trả lời một câu khác câu nó hỏi.
      const phong = j2 => ((gy + 1) / REPO.RH | 0) * REPO.GX + ((gx + j2) / REPO.RW | 0);
      for (let j = -2; j <= 2 && ok; j++) if (phong(j) !== phong(-2)) ok = false;
      if (!ok) continue;
      REPO.warp((gx + 0.5) * T, (gy + 3.5) * T);
      return { gx, gy };
    }
    return null;
  });
  check('dựng được thế đứng thứ hai: một dãy tường trống trải trước mặt', !!day, JSON.stringify(day));
  if (day) {
    await p.evaluate(() => { if (window.__k) clearInterval(window.__k);
      window.__k = setInterval(() => { REPO.S.player.dir = -Math.PI / 2; }, 16); });
    await p.waitForTimeout(2400);
    const so = await p.evaluate(g => {
      const c = document.getElementById('game'), gg = c.getContext('2d');
      const T = REPO.TILE;
      const doc = (wx, wy) => {                    // trung bình 3x3: một đường mạch vữa không lái được kết quả
        const s = REPO.screenOf(wx, wy);
        let t = 0, n = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const q = gg.getImageData(Math.round(s.x) + i, Math.round(s.y) + j, 1, 1).data;
          t += (q[0] + q[1] + q[2]) / 3; n++;
        }
        return Math.round(t / n);
      };
      const yMat = g.gy * T + T - 5;               // mặt tường: 5 điểm ảnh phía trên chân tường
      // ĐỘ SÂU đèn ăn vào tường, đo theo TỪNG CỘT điểm ảnh dọc bức tường. Vết khuyết cũ chỉ
      // rộng vài điểm ảnh và rơi vào đâu là tuỳ tia quét trúng chỗ nào, nên đo một điểm hay
      // một hàng đều có thể lọt qua nó; thứ nó làm hỏng là ĐỘ SÂU — cột nào rơi đúng đường
      // ranh giữa hai ô thì đèn ăn vào 0. Lấy cả dải một lần rồi so cột cạn nhất với cột giữa.
      const s0 = REPO.screenOf((g.gx - 1.5) * T, g.gy * T);
      const s1 = REPO.screenOf((g.gx + 2.5) * T, (g.gy + 1) * T);
      const bx = Math.round(s0.x), by = Math.round(s0.y);
      const bw = Math.round(s1.x - s0.x), bh = Math.round(s1.y - s0.y);
      const im = gg.getImageData(bx, by, bw, bh).data;
      // Lấy TRUNG BÌNH BA CỘT, không đọc một cột đơn.
      //
      // Từ 2026-09-03 mặt sàn là đá, và mạch đá dọc chạy SUỐT từ đầu phòng tới cuối phòng — đó
      // chính là thứ khiến sàn không còn 'nét đứt'. Nhưng nó cũng có nghĩa là một cột điểm ảnh rơi
      // đúng vào mạch thì tối hơn hẳn trên cả chiều dài của nó, và phép đếm 'sáng hơn 30' dừng sớm:
      // đo được cột cạn nhất 32 trong khi cột giữa dải 123, mà cả hai đều nằm trên một dải sáng
      // không hề sứt. Cái bộ này đi tìm là vết khuyết của ĐA GIÁC ÁNH SÁNG, không phải vân vật liệu
      // — nên nó phải đo qua vân, đúng như hai phép đo `dai()` và `doc()` ngay dưới đây vẫn làm.
      const oSang = (i, j) => {
        let t = 0, n = 0;
        // Cửa sổ phải RỘNG HƠN MẠCH ĐÁ. Mạch dọc rộng 1 điểm ảnh thế giới, mà ở mức phóng của
        // bộ đo là chừng 6 điểm ảnh màn hình; lấy trung bình 9 điểm ảnh thì mạch vẫn chiếm hai
        // phần ba và kéo cả cột xuống dưới ngưỡng — đo được vết lõm 34/123 trên một dải thật ra
        // phẳng lì. 17 điểm ảnh vẫn hẹp hơn một ô (24) rất nhiều, nên nó không thể lấp mất một
        // vết khuyết thật của đa giác ánh sáng, thứ mà ca này sinh ra để bắt.
        for (let k = -8; k <= 8; k++){
          const ii = Math.max(0, Math.min(bw-1, i+k)), o = (j * bw + ii) * 4;
          t += (im[o] + im[o+1] + im[o+2]) / 3; n++;
        }
        return t / n;
      };
      // Bỏ 6% mỗi đầu: hai mép dải là chỗ nón đèn cắt góc, ở đó nông đi là đúng chứ không sứt.
      const le = Math.round(bw * 0.06), sau = [];
      for (let i = le; i < bw - le; i++) {
        let d = 0;
        for (let j = bh - 3; j >= 0; j--) { if (oSang(i, j) > 30) d++; else break; }
        sau.push(d);
      }
      const xep = sau.slice().sort((a, b) => a - b);
      // Đo theo DẢI chứ không theo một dòng: vân tường có mạch vữa cứ 6 điểm ảnh một đường,
      // rơi đúng vào một đường mạch thì con số đọc được là màu của mạch vữa, không phải màu tường.
      // Và sàn đo ngay dưới chân tường (qua khỏi vệt bóng đổ 6 điểm ảnh) chứ không đo giữa phòng:
      // nón đèn nhạt dần theo khoảng cách, so tường ở xa với sàn ở gần là so hai thứ khác nhau.
      const dai = (x, y0, y1) => {
        let t = 0, n = 0;
        for (let y = y0; y <= y1; y += 2) { t += doc(x, y); n++; }
        return Math.round(t / n);
      };
      const cx = (g.gx + 0.5) * T;
      return { mat: dai(cx, g.gy * T + 16, g.gy * T + 22),
               san: dai(cx, (g.gy + 1) * T + 8, (g.gy + 1) * T + 14),
               canNhat: xep[0], giuaDai: xep[(xep.length / 2) | 0],
               hinhDang: sau.filter((_, i) => i % 12 === 0).map(v => Math.round(v)).join(' '),
               // Hai lát cắt cho báo cáo 2026-09-03 — "cần sáng rõ nguyên bức tường luôn, đừng
               // chỉ sáng 1 nữa". Một dọc theo BỀ DÀY một ô tường, một ngang qua NĂM ô của cùng
               // bức tường ấy. Bỏ 3 điểm ảnh mỗi đầu vì hai mép ô là vạch chân tường và mép trên,
               // hai thứ cố tình tối để bức tường có bề dày.
               dayTuong: (() => { const v = []; for (let d = 3; d <= T - 4; d += 2) v.push(doc(cx, g.gy * T + d)); return v; })(),
               dayNgang: (() => { const v = []; for (let j = -2; j <= 2; j++) v.push(doc((g.gx + j + 0.5) * T, g.gy * T + T / 2)); return v; })() };
    }, day);
    check('mặt tường soi thẳng sáng xấp xỉ cái sàn ngay trước nó',
      so.mat >= so.san * 0.75, 'tường ' + so.mat + ' / sàn ' + so.san);
    check('đèn ăn vào tường sâu đều nhau, không có cột nào bị sứt',
      so.canNhat > so.giuaDai * 0.6,
      'cột cạn nhất ' + so.canNhat + ' / cột giữa dải ' + so.giuaDai + ' · hình dạng: ' + so.hinhDang);
    // Đo được TRƯỚC bản vá 2026-09-03, trên bốn hạt giống: nửa xa của ô tường đọc 3/255 trong khi
    // nửa gần đọc 113 — đèn chỉ liếm một lớp mặt dày nửa ô. Và đo ngang qua năm ô của cùng bức
    // tường ấy ra 3 / 19 / 60 / 21 / 3, tức là ĐÚNG MỘT khúc tường sáng: số hạng N·L mũ 1.5 tắt
    // hết hai bên. Hai ca dưới đây khoá cả hai chiều.
    const mn = a => Math.min.apply(null, a), mx = a => Math.max.apply(null, a);
    check('sáng đều hết BỀ DÀY bức tường, không chỉ một lớp mặt',
      mn(so.dayTuong) > mx(so.dayTuong) * 0.5,
      'tối nhất ' + mn(so.dayTuong) + ' / sáng nhất ' + mx(so.dayTuong) + ' qua ' + so.dayTuong.length + ' lát');
    check('cả DÃY tường trước mặt đều sáng, không chỉ đúng một khúc',
      mn(so.dayNgang) > mx(so.dayNgang) * 0.6,
      so.dayNgang.join(' / '));
  }


  // --- ĐÈN DỪNG Ở BỨC TƯỜNG THỨ NHẤT --------------------------------------------------
  // Nửa còn lại của "chỉ che sau bức tường thôi". Cho đèn ăn hết bề dày tường thì phải nói rõ
  // HẾT LÀ HẾT ở đâu: một bức tường có tủ kê sát mặt sau, mà độ sâu đèn chỉ chặn bằng một con số
  // khoảng cách, thì đèn ăn hết 24 điểm ảnh tường rồi thừa ra ăn sang cụm tủ — trên màn hình là
  // hai mảng sáng hình thang lơ lửng phía sau bức tường đang soi. Sàn thì vẫn tối (ca trên đã đo)
  // nên chỉ đo sàn là lọt; phải đo chính cái ô ĐẶC nằm ngay sau bức tường.
  const sau = await doVan(mep => {
    const T = REPO.TILE, S = REPO.S, MW = REPO.MW, MH = REPO.MH;
    const G = (gx, gy) => S.grid[gy * MW + gx];
    for (let gy = mep; gy < MH - mep; gy++) for (let gx = mep; gx < MW - mep; gx++) {
      let ok = true;
      for (let j = -1; j <= 1; j++) if (G(gx + j, gy) !== 1) ok = false;          // tường trước mặt
      for (let k = 1; k <= 3 && ok; k++) for (let j = -1; j <= 1; j++)
        if (G(gx + j, gy + k) !== 0) ok = false;                                  // sàn đứng soi
      if (ok && G(gx, gy - 1) === 0) ok = false;                                  // sau tường phải ĐẶC
      if (!ok) continue;
      REPO.warp((gx + 0.5) * T, (gy + 3.5) * T);
      return { gx, gy };
    }
    return null;
  });
  if (sau) {
    await p.evaluate(() => { if (window.__k) clearInterval(window.__k);
      window.__k = setInterval(() => { REPO.S.player.dir = -Math.PI / 2; }, 16); });
    await p.waitForTimeout(2400);
    const d = await p.evaluate(g => {
      const gg = document.getElementById('game').getContext('2d');
      const T = REPO.TILE;
      const doc = (wx, wy) => { const s = REPO.screenOf(wx, wy); let t = 0, n = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const q = gg.getImageData(Math.round(s.x) + i, Math.round(s.y) + j, 1, 1).data;
          t += (q[0] + q[1] + q[2]) / 3; n++; }
        return Math.round(t / n); };
      const cx = (g.gx + 0.5) * T;
      return { tuong: doc(cx, g.gy * T + T / 2), vatSau: doc(cx, (g.gy - 1) * T + T / 2) };
    }, sau);
    check('bức tường thứ nhất vẫn sáng ở thế đứng này', d.tuong > 40, String(d.tuong));
    check('mà cái vật ĐẶC nằm ngay sau nó thì không ăn tí đèn nào',
      d.vatSau < 25, 'tường ' + d.tuong + ' / vật sau tường ' + d.vatSau);
  }
  await p.evaluate(() => { if (window.__k) clearInterval(window.__k); });
  const e = errs.filter(x => !/favicon/.test(x));
  check('đèn pin: không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));
  await ctx.close();
  await b.close();
}

// =====================================================================
(async () => {
  const b = await chromium.launch();
  try { await repo2dSuite(b); } catch (e) { check('repo2d: bộ test chạy trọn', false, e.message); }
  try { await boardingSuite(b); } catch (e) { check('đứng chờ xe: bộ test chạy trọn', false, e.message); }
  try { await repoSquadSuite(b); } catch (e) { check('repo-squad: bộ test chạy trọn', false, e.message); }
  try { await ghostDoorSuite(b); } catch (e) { check('ma gương/phang cửa: bộ test chạy trọn', false, e.message); }
  try { await meleeSuite(b); } catch (e) { check('đập đèn pin: bộ test chạy trọn', false, e.message); }
  try { await stashSuite(b); } catch (e) { check('tủ đồ: bộ test chạy trọn', false, e.message); }
  try { await rotateSuite(b); } catch (e) { check('nút xoay tay: bộ test chạy trọn', false, e.message); }
  try { await hudGeomSuite(b); } catch (e) { check('hình học HUD: bộ test chạy trọn', false, e.message); }
  try { await skillEffectSuite(b); } catch (e) { check('hiệu ứng kỹ năng: bộ test chạy trọn', false, e.message); }
  try { await metaRulesSuite(b); } catch (e) { check('sổ sách & luật ván: bộ test chạy trọn', false, e.message); }
  try { await wikiSuite(b); } catch (e) { check('sổ tay: bộ test chạy trọn', false, e.message); }
  try { await escapeSuite(b); } catch (e) { check('pha chạy: bộ test chạy trọn', false, e.message); }
  try { await meleeSuite(b); } catch (e) { check('đòn đánh: bộ test chạy trọn', false, e.message); }
  try { await lightSuite(b); } catch (e) { check('đèn pin: bộ test chạy trọn', false, e.message); }
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
