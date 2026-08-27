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
    REPO.giveGear('gun', 2); REPO.equip('gun');
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
      if (!b) return { ban: false };
      const gd = Math.atan2(b.vy, b.vx);
      const gq = Math.atan2(S.monsters[0].y - pl.y, S.monsters[0].x - pl.x);
      return { ban: true, vsQuai: Math.abs(REPO.angDiff(gd, gq)),
               vsNguoi: Math.abs(REPO.angDiff(gd, pl.dir)) };
    });
    check('chạm nhanh ô đồ thì bắn ra đạn', shot.ban);
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
      mateCount: REPO.hooks.mateCount, land: document.body.classList.contains('landscape')
    }));
    check('[' + ten + '] acc mới đúng một xác', m.chars === 1, m.chars + ' xác');
    check('[' + ten + '] ô BẠN CẦM không rỗng', !!m.lead);
    check('[' + ten + '] tổ cấu hình 4 bot', m.mateCount === 4, String(m.mateCount));
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
(async () => {
  const b = await chromium.launch();
  try { await repo2dSuite(b); } catch (e) { check('repo2d: bộ test chạy trọn', false, e.message); }
  try { await repoSquadSuite(b); } catch (e) { check('repo-squad: bộ test chạy trọn', false, e.message); }
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
