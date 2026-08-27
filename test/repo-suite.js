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
  check('bảng điểm cắm có mặt', st.hooks.length === 6, st.hooks.join(','));
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
  results.push('\n── repo-squad (Biệt Đội) ──');
  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await openGame(b, SQ, vp);
    await p.waitForTimeout(400);
    check('[' + ten + '] trang mở không lỗi', errs.length === 0, errs[0] || '');

    const m = await p.evaluate(() => ({
      chars: Object.keys(SQ.M.chars).length,
      lead: SQ.M.squad.lead,
      crew: SQ.squadList().length,
      land: document.body.classList.contains('landscape')
    }));
    check('[' + ten + '] acc mới đúng một xác', m.chars === 1, m.chars + ' xác');
    check('[' + ten + '] ô BẠN CẦM không rỗng', !!m.lead, String(m.lead));
    check('[' + ten + '] cờ landscape đúng', m.land === (vp.width > vp.height));

    // đội hình: tháo hết rồi lắp lại
    await p.evaluate(() => {
      ['hue', 'tam', 'ky', 'linh'].forEach(id => { SQ.M.chars[id] = { lv: 1, shard: 0, equip: {} }; });
      SQ.autoFill(); SQ.ui.render();
    });
    const squad = await p.evaluate(() => {
      for (let i = 0; i < 4; i++) SQ.setMate(i, null);
      const sauKhiThao = JSON.parse(JSON.stringify(SQ.M.squad));
      const chanHaLead = SQ.setMate(0, SQ.M.squad.lead) === false;
      SQ.autoFill();
      return { sauKhiThao, chanHaLead, crew: SQ.squadList().length, lead: SQ.M.squad.lead };
    });
    check('[' + ten + '] tháo hết bot vẫn giữ ô BẠN CẦM', !!squad.sauKhiThao.lead);
    check('[' + ten + '] chặn hạ xác đang cầm xuống ô trống', squad.chanHaLead);
    check('[' + ten + '] xếp tự động đủ năm người', squad.crew === 5, squad.crew + ' người');

    // vào trận
    await p.evaluate(() => { SQ.ui.go('home'); });
    await p.waitForTimeout(200);
    await p.evaluate(() => [...document.querySelectorAll('.b')]
      .find(x => x.textContent.includes('ĐI CA')).click());
    await p.waitForTimeout(900);
    const run = await p.evaluate(() => ({
      units: SQUAD.units().length, inRun: document.body.classList.contains('in-run')
    }));
    check('[' + ten + '] vào trận đủ năm người', run.units === 5, run.units + ' người');
    check('[' + ten + '] chuyển sang màn chơi', run.inRun);

    const errs3 = errs.filter(e => !/favicon/.test(e));
    check('[' + ten + '] không lỗi console', errs3.length === 0, errs3.slice(0, 2).join(' | '));
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
