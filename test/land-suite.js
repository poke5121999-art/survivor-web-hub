/*
 * Bộ kiểm thử CẦN GẠT VÀ MÀN HÌNH NGANG cho repo2d và bản Biệt Đội.
 * Chạy: node test/land-suite.js
 *
 * Bug đã xảy ra trên máy thật: iPhone để ngang thì cần gạt trái không đẩy nhân vật đi được một
 * bước nào — ngón tay vẫn trên màn hình, vòng cần gạt vẫn vẽ ra, mà người thì đứng im.
 *
 * ROOT-CAUSE: vòng vẽ dò "khung có đổi kích thước không" bằng getBoundingClientRect(), còn
 * resize() thì đo bằng offsetWidth. Hai con số đó khác nhau ở hai trường hợp rất đời thường:
 *   · chế độ xoay tay (body.force-land): cả vỏ game bị CSS quay 90°, hộp bao đổi chiều rộng
 *     với chiều cao, nên hai bên KHÔNG BAO GIỜ khớp;
 *   · và cả khi không xoay, hộp bao trả về số lẻ (844,33) trong khi offsetWidth đã làm tròn.
 * Khác nhau là dòng đó kết luận "vừa đổi kích thước" ở MỌI khung hình, gọi resize() 60 lần một
 * giây, mà resize() mở đầu bằng cancelGestures() — cần gạt bị xoá 60 lần một giây.
 *
 * Cách đo: CHẠM THẬT bằng CDP (touchStart / touchMove / giữ / touchEnd), rồi hỏi nhân vật đã
 * đi được bao xa. Không gọi hàm nào của bộ máy để đẩy người đi.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const R2D = root + '/games/repo2d/index.html';
const SQD = root + '/games/repo-squad/index.html';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else    { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

// Đổi một điểm trong khung game ra toạ độ MÀN HÌNH — kể cả khi cả vỏ game đang bị quay 90°.
// Đây là phép quay ngược của canvasPoint() trong game.js; sai một dấu là ngón tay bấm cần gạt
// trái mà game nhận ra cần gạt phải, và phép đo đỏ vì bộ test chứ không phải vì trò chơi.
const raManHinh = (p, gx, gy) => p.evaluate(({ gx, gy }) => {
  const cv = document.getElementById('game'), r = cv.getBoundingClientRect();
  const h = REPO.hud();
  if (document.body.classList.contains('force-land')) {
    return { x: r.left + r.width - gy / h.h * r.width,
             y: r.top + gx / h.w * r.height };
  }
  return { x: r.left + gx / h.w * r.width, y: r.top + gy / h.h * r.height };
}, { gx, gy });

// Kéo cần gạt trái sang phải và GIỮ, đúng như một ngón tay cái. Trả về quãng đường nhân vật đi.
async function keoCanGat(p, giay) {
  // DỰNG CẢNH: đặt nhân vật vào một chỗ còn trống về bên PHẢI — hướng mà cú kéo sẽ đẩy đi.
  // Không có bước này thì cú kéo thứ ba trong cùng một ca đẩy nhân vật vào bức tường mà hai
  // cú trước vừa dồn nó tới, và phép đo đỏ vì hết chỗ đi chứ không phải vì cần gạt chết.
  await p.evaluate(() => {
    const T = REPO.TILE;
    for (let gy = 2; gy < REPO.MH - 2; gy++)
      for (let gx = 2; gx < REPO.MW - 6; gx++) {
        if (REPO.solidAt(gx, gy)) continue;
        let thong = true;
        for (let d = 1; d <= 4; d++) if (REPO.solidAt(gx + d, gy)) { thong = false; break; }
        if (!thong) continue;
        REPO.warp((gx + 0.5) * T, (gy + 0.5) * T);
        return;
      }
  });
  await p.waitForTimeout(120);
  const hud = await p.evaluate(() => {
    const h = REPO.hud();
    return { x: h.left.x, y: h.left.y, r: h.left.r };
  });
  const dat = await raManHinh(p, hud.x, hud.y);
  const keo = await raManHinh(p, hud.x + hud.r * 0.85, hud.y);
  const cdp = await p.context().newCDPSession(p);
  const t0 = await p.evaluate(() => ({ x: REPO.S.player.x, y: REPO.S.player.y }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: dat.x, y: dat.y }] });
  await p.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: keo.x, y: keo.y }] });
  // Lấy mẫu SUỐT cả cú kéo, không phải mỗi lúc cuối. Cái bug này không giết cần gạt một lần
  // rồi thôi — nó xoá đi xoá lại 60 lần một giây, nên có những khung hình cần gạt vẫn còn đó.
  let song = 0, tong = 0;
  for (let i = 0; i < Math.round(giay * 10); i++) {
    await p.waitForTimeout(100);
    tong++;
    if (await p.evaluate(() => !!REPO.stick())) song++;
  }
  const giua = await p.evaluate(() => ({ x: REPO.S.player.x, y: REPO.S.player.y }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(80);
  return { di: Math.hypot(giua.x - t0.x, giua.y - t0.y), canGat: song === tong, song, tong };
}

async function moGame(b, url, vp, vaoCa) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(url);
  await p.waitForTimeout(1200);
  await vaoCa(p);
  await p.evaluate(() => { REPO.setCutscenes(false); REPO.S.cut = null; REPO.S.running = true; REPO.S.noFoes = true; });
  await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const vaoCaR2D = async p => { await p.locator('#veilBtn').click(); await p.waitForTimeout(300); };

// =====================================================================
async function docSuite(b) {
  results.push('\n── màn dọc: cần gạt phải đẩy được người đi ──');
  // 391 là một con số LẺ có chủ ý: hộp bao chia cho tỉ lệ khung ra số thập phân, đúng cái
  // trường hợp mà phép so kích thước cũ đọc nhầm thành "vừa đổi kích thước".
  const { ctx, p, errs } = await moGame(b, R2D, { width: 391, height: 845 }, vaoCaR2D);
  const r = await keoCanGat(p, 0.8);
  check('giữ cần gạt thì cần gạt còn sống suốt', r.canGat, r.song + '/' + r.tong + ' lần đo');
  check('và nhân vật đi được', r.di > 30, 'đi ' + Math.round(r.di) + 'px');
  check('màn dọc: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function ngangSuite(b) {
  results.push('\n── màn ngang (xoay máy): cần gạt phải đẩy được người đi ──');
  const { ctx, p, errs } = await moGame(b, R2D, { width: 845, height: 391 }, vaoCaR2D);
  const r = await keoCanGat(p, 0.8);
  check('giữ cần gạt thì cần gạt còn sống suốt', r.canGat, r.song + '/' + r.tong + ' lần đo');
  check('và nhân vật đi được', r.di > 30, 'đi ' + Math.round(r.di) + 'px');
  check('màn ngang: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function xoayTaySuite(b) {
  results.push('\n── nút "Xoay ngang" (force-land): cả vỏ game quay 90° ──');
  const { ctx, p, errs } = await moGame(b, R2D, { width: 391, height: 845 }, vaoCaR2D);
  const co = await p.locator('#rotBtn').count();
  check('có nút xoay tay', co === 1);
  if (co !== 1) { await ctx.close(); return; }
  await p.locator('#rotBtn').click({ force: true });          // >>> BẤM THẬT <<<
  await p.waitForTimeout(500);
  const bat = await p.evaluate(() => document.body.classList.contains('force-land'));
  check('bấm nút thì bật chế độ xoay tay', bat);
  const r = await keoCanGat(p, 0.8);
  check('giữ cần gạt thì cần gạt còn sống suốt', r.canGat, r.song + '/' + r.tong + ' lần đo');
  check('và nhân vật đi được', r.di > 30, 'đi ' + Math.round(r.di) + 'px');
  // Xoay đi rồi xoay lại: lần này khung ĐỔI KÍCH THƯỚC thật, nên bỏ cử chỉ đang dở là đúng —
  // nhưng cần gạt phải dùng lại được ngay sau đó.
  await p.locator('#rotBtn').click({ force: true });
  await p.waitForTimeout(500);
  const r2 = await keoCanGat(p, 0.8);
  check('xoay về dọc rồi vẫn đi được', r2.di > 30, 'đi ' + Math.round(r2.di) + 'px');
  check('xoay tay: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function squadSuite(b) {
  results.push('\n── Biệt Đội cũng dùng chung bộ máy đó ──');
  const ctx = await b.newContext({ viewport: { width: 845, height: 391 }, hasTouch: true,
                                   isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(SQD);
  await p.waitForTimeout(1400);
  // Vào thẳng một ca: bản Biệt Đội bọc bộ máy trong menu DOM riêng của nó, và cái đang đo là
  // bộ máy chứ không phải cái menu.
  const vao = await p.evaluate(() => {
    try {
      SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
      SQ.autoFill(); SQ.squad.enter('k3');
      return true;
    } catch (e) { return false; }
  });
  if (!vao) {
    check('vào được một ca của Biệt Đội', false, 'SD.enter không chạy');
    await ctx.close(); return;
  }
  await p.waitForTimeout(1400);
  await p.evaluate(() => { REPO.setCutscenes(false); REPO.S.cut = null; REPO.S.running = true; REPO.S.noFoes = true; });
  await p.waitForTimeout(300);
  const r = await keoCanGat(p, 0.8);
  check('giữ cần gạt thì cần gạt còn sống suốt', r.canGat, r.song + '/' + r.tong + ' lần đo');
  check('và nhân vật đi được', r.di > 30, 'đi ' + Math.round(r.di) + 'px');
  check('Biệt Đội: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
(async () => {
  const b = await chromium.launch();
  const run = async (ten, fn) => {
    try { await fn(b); } catch (e) { check(ten + ': bộ test chạy trọn', false, e.message); }
  };
  await run('màn dọc', docSuite);
  await run('màn ngang', ngangSuite);
  await run('xoay tay', xoayTaySuite);
  await run('Biệt Đội', squadSuite);
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
