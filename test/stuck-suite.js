/*
 * Bộ kiểm thử CHỐNG ĐƠ cho cả hai bản REPO.
 * Chạy: node test/stuck-suite.js
 *
 * Bộ này không đo tính năng. Nó đo đúng MỘT thứ: người chơi có bao giờ rơi vào một màn
 * hình mà không còn đường ra hay không. Mọi ca ở đây đều từng là một lỗi thật, đo được —
 * xem chú thích của từng ca.
 *
 * Nguyên tắc: BẤM UI THẬT. Không gọi hàm của bộ máy để đi tắt qua chính chỗ đang kiểm tra.
 * page.evaluate chỉ dùng để ĐỌC trạng thái, và để DỰNG CẢNH — những việc người chơi làm được
 * nhưng phải chơi hàng chục phút mới tới (nạp đồ vào tủ, tới trạm, làm hỏng bản lưu).
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

// Đếm khung hình để biết vòng vẽ còn sống. Bộ máy gọi lại rAF trong `finally`, nên một cú
// ngoặc chỉ được phép làm hỏng MỘT khung chứ không được dừng hẳn.
function countFrames() {
  window.__frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { window.__frames++; return cb(t); });
}

async function open(b, url, vp) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: true, deviceScaleFactor: 2,
                                   isMobile: vp.width < vp.height });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.addInitScript(countFrames);
  await p.goto(url);
  await p.waitForTimeout(1100);
  return { ctx, p, errs };
}

// Vào ca ở bản repo2d bằng CLICK THẬT vào nút "Vào ca".
async function enter2d(p) {
  await p.locator('#veilBtn').click();
  await p.waitForTimeout(200);
  await p.evaluate(() => { REPO.setCutscenes(false); REPO.S.cut = null; REPO.S.running = true; });
  await p.waitForTimeout(250);
}

// Toạ độ màn hình của một nút HUD vẽ trên canvas.
function hudPt(p, key, idx) {
  return p.evaluate(([k, i]) => {
    const h = REPO.hud(), r = document.getElementById('game').getBoundingClientRect();
    const o = (i == null) ? h[k] : (h[k] && h[k][i]);
    return o ? { x: r.left + o.x * (r.width / h.w), y: r.top + o.y * (r.height / h.h) } : null;
  }, [key, idx]);
}

async function framesAlive(p, ms) {
  const a = await p.evaluate(() => window.__frames);
  await p.waitForTimeout(ms);
  const b = await p.evaluate(() => window.__frames);
  return b > a + 2;
}

const realErrs = errs => errs.filter(x => !/loi co y/i.test(x));

// =====================================================================
// 1. VÒNG VẼ KHÔNG BAO GIỜ CHẾT
// Trước bản vá, frame() gọi lại requestAnimationFrame ở DÒNG CUỐI và không có try/catch:
// một lỗi ném ra ở bất kỳ đâu trong step()/draw()/updateBar() là vòng lặp không bao giờ
// được lên lịch lại nữa. Canvas đứng hình, còn mọi nút DOM vẫn còn hiệu ứng :active — đúng
// cái cảnh "bảng hiện ra, bấm nút close có animation, mà không có gì xảy ra".
// =====================================================================
async function frameLoopSuite(b) {
  results.push('\n── vòng vẽ không bao giờ chết ──');
  const { ctx, p, errs } = await open(b, R2D, { width: 844, height: 390 });
  await enter2d(p);

  // DỰNG CẢNH: cắm một cái móc luôn ném lỗi vào giữa mỗi bước của thế giới.
  await p.evaluate(() => {
    window.__boom = 0;
    REPO.hooks.onTick = () => { window.__boom++; throw new Error('loi co y'); };
  });
  await p.waitForTimeout(800);
  check('lỗi ném ra mỗi khung: vòng vẽ vẫn chạy', await framesAlive(p, 500));
  const daNem = await p.evaluate(() => window.__boom);
  check('lỗi thật sự đã được ném ra', daNem > 5, daNem + ' lần');

  // Hỏng đủ nhiều thì bộ máy phải DỪNG HẲN và bày ra một lối thoát bấm được.
  await p.waitForTimeout(900);
  const loiRa = await p.evaluate(() => {
    const v = document.getElementById('veil'), btn = document.getElementById('veilBtn');
    const r = btn.getBoundingClientRect();
    return { hien: !v.hidden, chu: btn.textContent,
             trongKhung: r.top >= 0 && r.bottom <= innerHeight,
             treNCung: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === btn };
  });
  check('hỏng liên tục thì hiện bảng có lối thoát',
    loiRa.hien && loiRa.trongKhung && loiRa.treNCung, loiRa.chu);

  // Gỡ móc hỏng rồi bấm THẬT vào nút đó: phải chơi lại được.
  await p.evaluate(() => { REPO.hooks.onTick = null; });
  await p.locator('#veilBtn').click();
  await p.waitForTimeout(700);
  const hoiPhuc = await p.evaluate(() => ({ chay: REPO.S.running, chet: REPO.S.dead,
                                            an: document.getElementById('veil').hidden }));
  check('bấm nút đó thì ca trực chạy lại được',
    hoiPhuc.chay && !hoiPhuc.chet && hoiPhuc.an, JSON.stringify(hoiPhuc));
  check('vòng vẽ: không lỗi ngoài dự tính', realErrs(errs).length === 0, realErrs(errs)[0] || '');
  await ctx.close();
}

// =====================================================================
// 2. CHÓ CANH — thế giới dừng mà không có lối ra thì phải tự gỡ
// Đây là tầng phòng thủ cuối, để bắt những lỗi chưa ai biết. Một con bọ chưa biết mà làm
// mất trắng cả ca trực thì tệ hơn hẳn một con bọ chưa biết mà chỉ nhá một dòng chữ.
// =====================================================================
async function watchdogSuite(b) {
  results.push('\n── chó canh tự gỡ kẹt ──');
  const { ctx, p, errs } = await open(b, R2D, { width: 844, height: 390 });
  await enter2d(p);

  // DỰNG CẢNH: đúng cái thế chết mà nút "Để bot chơi" trên màn chết từng tạo ra —
  // thế giới đứng hình, và trên màn hình không còn một cái nút nào.
  await p.evaluate(() => { REPO.S.running = false; document.getElementById('veil').hidden = true; });
  check('nhận ra ngay là đang kẹt', await p.evaluate(() => REPO.stuck().paused) === true);
  await p.waitForTimeout(4500);
  const sau = await p.evaluate(() => ({
    chay: REPO.S.running, ket: REPO.stuck().paused,
    bang: !document.getElementById('veil').hidden
  }));
  check('sau vài giây thì tự gỡ được', sau.ket === false && (sau.chay || sau.bang),
    JSON.stringify(sau));
  check('chó canh: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
// 3. MÀN KẾT CA CHỈ ĐƯỢC MANG NHỮNG NÚT CỦA CHÍNH NÓ
// "Để bot chơi" là nút của MÀN TIÊU ĐỀ. Nó từng hiện lên trên màn chết, mang nguyên cái
// đóng gói gán lúc khởi động: bật S.running = true mà không xoá S.dead. Cổng của frame() là
// `S.running && !S.dead`, nên bấm nó là thế giới đông cứng và không còn lớp phủ nào.
// Đo được lúc chưa vá: dead=true, running=true, S.time kẹt 0.35, giữ W 0,9s đi được 0px.
// =====================================================================
async function endVeilSuite(b) {
  results.push('\n── màn kết ca ──');
  const { ctx, p, errs } = await open(b, R2D, { width: 844, height: 390 });
  await enter2d(p);
  await p.evaluate(() => { REPO.crew().forEach(a => REPO.downActor(a)); });
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({
    hien: !document.getElementById('veil').hidden,
    tieuDe: document.getElementById('veilTitle').textContent,
    nut2An: document.getElementById('veilBtn2').hidden
  }));
  check('cả tổ gục thì hiện bảng kết ca', st.hien, st.tieuDe);
  check('màn kết ca KHÔNG có nút "Để bot chơi"', st.nut2An === true);

  // Bấm THẬT vào lối ra duy nhất: phải chơi lại được, không đông cứng.
  await p.locator('#veilBtn').click();
  await p.waitForTimeout(800);
  const sau = await p.evaluate(() => ({ chay: REPO.S.running, chet: REPO.S.dead,
                                        an: document.getElementById('veil').hidden }));
  check('bấm "Làm lại từ màn 1" thì ca mới chạy thật',
    sau.chay && !sau.chet && sau.an, JSON.stringify(sau));
  check('màn kết ca: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
// 4. MỘT CÚ CHẠM MỞ TỦ THÌ TỦ PHẢI Ở LẠI
// Cú chạm trên canvas để lại một cú click chuột "tương thích" ~25ms sau. showVeil() làm tấm
// màn hiện lên NGAY TRONG pointerdown, nên cú click ma đó được dò lại trên DOM MỚI và rơi
// trúng nút "Đóng tủ" vừa xuất hiện dưới ngón tay: tủ vừa mở đã đóng, trong cùng một cú chạm.
// Có xảy ra hay không PHỤ THUỘC SỐ HÀNG TRONG TỦ — nên phải quét cả dải, không thử một lần.
// =====================================================================
async function ghostTapSuite(b) {
  results.push('\n── một cú chạm mở tủ thì tủ phải ở lại ──');
  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await open(b, R2D, vp);
    await enter2d(p);
    const hong = [];
    for (const n of [0, 1, 2, 3, 4, 5, 6, 8, 12]) {
      await p.evaluate(nn => {                       // DỰNG CẢNH, không phải bước tái hiện
        REPO.S.stash.length = 0;
        for (let i = 0; i < nn; i++) REPO.S.stash.push({ kind: 'gun', uses: 3 });
        REPO.warp(REPO.S.car.x, REPO.S.car.y);
        REPO.S.stashOpen = false;
        document.getElementById('veil').hidden = true;
        REPO.S.running = true;
      }, n);
      await p.waitForTimeout(120);
      const pt = await hudPt(p, 'stash');
      await p.touchscreen.tap(pt.x, pt.y);            // >>> CHẠM THẬT <<<
      await p.waitForTimeout(420);
      const mo = await p.evaluate(() =>
        REPO.S.stashOpen && !document.getElementById('veil').hidden);
      if (!mo) hong.push(n);
      else { await p.locator('#veilBtn').click(); await p.waitForTimeout(120); }
    }
    check('[' + ten + '] chạm nút Tủ đồ thì tủ MỞ và Ở LẠI, mọi độ dài tủ',
      hong.length === 0, hong.length ? 'hỏng ở ' + hong.join(', ') + ' món' : '9/9 độ dài');
    check('[' + ten + '] chạm mở tủ: không lỗi trang', errs.length === 0, errs[0] || '');
    await ctx.close();
  }
}

// =====================================================================
// 4b. CHẠM MỞ RỒI CHẠM ĐÓNG NGAY LẬP TỨC
// Ca này được thêm vào SAU khi chính bản vá cho ca 4 đẻ ra một lỗi mới: bộ chặn click-bóng-ma
// bản đầu phân biệt bằng THỜI GIAN (bỏ qua mọi cú click trong 900ms đầu), nên ai chạm mở tủ
// rồi chạm "Đóng tủ" ngay thì nút chết — đúng cái triệu chứng đang đi sửa. Đo được: 202/552 ca
// của ma trận tủ hỏng vì nó, trong khi bộ test này vẫn báo 61/61 đạt.
// Bài học nằm trong chính ca test: phải đo cả HAI cú chạm liên tiếp, ở nhiều độ trễ, chứ đo
// mỗi cú chạm mở thì không bao giờ thấy.
// =====================================================================
async function tapOpenTapCloseSuite(b) {
  results.push('\n── chạm mở rồi chạm đóng ngay ──');
  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await open(b, R2D, vp);
    await enter2d(p);
    const hong = [];
    for (const tre of [0, 60, 150, 300, 600, 1200]) {
      for (const n of [0, 1, 3, 8]) {
        await p.evaluate(nn => {                       // DỰNG CẢNH
          REPO.S.stash.length = 0;
          for (let i = 0; i < nn; i++) REPO.S.stash.push({ kind: 'gun', uses: 3 });
          REPO.warp(REPO.S.car.x, REPO.S.car.y);
          REPO.S.stashOpen = false;
          document.getElementById('veil').hidden = true;
          REPO.S.running = true;
        }, n);
        await p.waitForTimeout(100);
        const pt = await hudPt(p, 'stash');
        await p.touchscreen.tap(pt.x, pt.y);           // >>> CHẠM MỞ <<<
        await p.waitForTimeout(80);
        if (!(await p.evaluate(() => REPO.S.stashOpen))) { hong.push(tre + 'ms/' + n + ': không mở'); continue; }
        if (tre) await p.waitForTimeout(tre);
        const bp = await p.evaluate(() => {
          const r = document.getElementById('veilBtn').getBoundingClientRect();
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, trenCung: !!(t && t.id === 'veilBtn') };
        });
        await p.touchscreen.tap(bp.x, bp.y);           // >>> CHẠM ĐÓNG <<<
        await p.waitForTimeout(300);
        const st = await p.evaluate(() => ({ mo: REPO.S.stashOpen, chay: REPO.S.running,
                                             an: document.getElementById('veil').hidden }));
        if (!bp.trenCung) hong.push(tre + 'ms/' + n + ' món: nút bị che');
        else if (st.mo || !st.chay || !st.an) hong.push(tre + 'ms/' + n + ' món: ' + JSON.stringify(st));
      }
    }
    check('[' + ten + '] chạm mở rồi chạm đóng ngay: đóng được ở mọi độ trễ',
      hong.length === 0, hong.length ? hong.slice(0, 3).join(' | ') : '24/24 ca');
    check('[' + ten + '] chạm mở/đóng: không lỗi trang', errs.length === 0, errs[0] || '');
    await ctx.close();
  }
}

// =====================================================================
// 4c. BẤM RA KHOẢNG TRỐNG CŨNG PHẢI ĐÓNG ĐƯỢC TỦ
// Thói quen mà mọi app di động đều dạy: bấm ra ngoài là đóng. Một bảng chỉ đóng được bằng
// đúng một cái nút là một bảng mà người chơi sẽ có lúc tưởng là đang kẹt.
// Nhưng chỉ những bảng KHÔNG mất mát gì mới được nhận nó — bảng kết ca thì không, vì bấm
// nhầm ra nền mà khởi động lại cả ván cũng là một kiểu mất trắng.
// =====================================================================
async function backdropCloseSuite(b) {
  results.push('\n── bấm ra khoảng trống thì đóng tủ ──');
  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await open(b, R2D, vp);
    await enter2d(p);
    const hong = [];
    for (const n of [0, 1, 3, 8, 20]) {
      for (const cho of ['veilTitle', 'veilBody', 'goc']) {
        await p.evaluate(nn => {                        // DỰNG CẢNH
          REPO.S.stash.length = 0;
          for (let i = 0; i < nn; i++) REPO.S.stash.push({ kind: 'gun', uses: 3 });
          REPO.warp(REPO.S.car.x, REPO.S.car.y);
          REPO.S.stashOpen = false;
          document.getElementById('veil').hidden = true;
          REPO.S.running = true;
        }, n);
        await p.waitForTimeout(100);
        await p.keyboard.press('f');
        await p.waitForTimeout(250);
        if (!(await p.evaluate(() => REPO.S.stashOpen))) { hong.push(n + '/' + cho + ': không mở'); continue; }
        const pt = await p.evaluate(c => {
          if (c === 'goc') { const r = document.getElementById('veil').getBoundingClientRect();
                             return { x: r.left + 6, y: r.top + 6 }; }
          const r = document.getElementById(c).getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, cho);
        await p.touchscreen.tap(pt.x, pt.y);            // >>> CHẠM RA KHOẢNG TRỐNG <<<
        await p.waitForTimeout(320);
        const st = await p.evaluate(() => ({ mo: REPO.S.stashOpen, chay: REPO.S.running,
                                             an: document.getElementById('veil').hidden }));
        if (st.mo || !st.chay || !st.an) hong.push(n + ' món / ' + cho + ': ' + JSON.stringify(st));
        if (st.mo) { await p.locator('#veilBtn').click(); await p.waitForTimeout(120); }
      }
    }
    check('[' + ten + '] bấm khoảng trống đóng được tủ, mọi độ dài', hong.length === 0,
      hong.length ? hong.slice(0, 3).join(' | ') : '15/15 ca');

    // Nhưng bảng KẾT CA thì tuyệt đối không được đóng kiểu đó.
    await p.evaluate(() => { REPO.crew().forEach(a => REPO.downActor(a)); });
    await p.waitForTimeout(600);
    const truoc = await p.evaluate(() => !document.getElementById('veil').hidden);
    const goc = await p.evaluate(() => { const r = document.getElementById('veil').getBoundingClientRect();
                                         return { x: r.left + 6, y: r.top + 6 }; });
    await p.touchscreen.tap(goc.x, goc.y);
    await p.waitForTimeout(350);
    const sau = await p.evaluate(() => ({ hien: !document.getElementById('veil').hidden, chet: REPO.S.dead }));
    check('[' + ten + '] bảng kết ca KHÔNG đóng bằng bấm ra ngoài',
      truoc && sau.hien && sau.chet, JSON.stringify(sau));
    check('[' + ten + '] bấm khoảng trống: không lỗi trang', errs.length === 0, errs[0] || '');
    await ctx.close();
  }
}

// =====================================================================
// 5. MỌI HÀNG TRONG TỦ PHẢI BẤM ĐƯỢC, VÀ NÚT ĐÓNG PHẢI LUÔN TRONG KHUNG
// Thanh nút từng dính đáy và ĐÈ LÊN danh sách. Ở màn ngang khung chỉ cao ~330px nên hàng đồ
// đầu tiên nằm ngay dưới nó, mà nền thanh lại là dải chuyển sắc trong suốt ở mép trên — hàng
// đồ vẫn nhìn thấy và trông như bấm được. Chạm vào là trúng nút "Đóng tủ": tủ đóng, không
// nhặt được gì. Đo được: topmost="veilBtn", isTop=false, clickFired=0, ngay khi tủ có 1 món.
// =====================================================================
async function rowsReachableSuite(b) {
  results.push('\n── mọi hàng trong tủ đều bấm được ──');
  const cfg = [['repo2d ngang', R2D, { width: 844, height: 390 }],
               ['repo2d dọc',   R2D, { width: 390, height: 844 }]];
  for (const [ten, url, vp] of cfg) {
    const { ctx, p, errs } = await open(b, url, vp);
    await enter2d(p);
    const hong = [];
    for (const n of [1, 3, 8, 20]) {
      await p.evaluate(nn => {                        // DỰNG CẢNH
        REPO.S.stash.length = 0;
        for (let i = 0; i < nn; i++) REPO.S.stash.push({ kind: 'gun', uses: 3 });
        REPO.warp(REPO.S.car.x, REPO.S.car.y);
        REPO.S.stashOpen = false;
        document.getElementById('veil').hidden = true;
        REPO.S.running = true;
      }, n);
      await p.waitForTimeout(120);
      await p.keyboard.press('f');                    // >>> PHÍM THẬT <<<
      await p.waitForTimeout(260);
      const r = await p.evaluate(() => {
        const box = document.getElementById('veilExtra');
        const bx = box.getBoundingClientRect();
        const rows = [...box.querySelectorAll('[data-stash],[data-slot]')];
        // Cuộn qua cả danh sách: một hàng phải bấm được SAU KHI cuộn tới nó.
        const seen = new Set();
        let che = 0;
        const step = Math.max(1, Math.floor(box.clientHeight * 0.6));
        for (let t = 0; t <= box.scrollHeight; t += step) {
          box.scrollTop = t;
          rows.forEach((el, i) => {
            if (seen.has(i)) return;
            const b2 = el.getBoundingClientRect();
            const cx = b2.left + b2.width / 2, cy = b2.top + b2.height / 2;
            if (cy < bx.top + 2 || cy > bx.bottom - 2) return;
            seen.add(i);
            const top = document.elementFromPoint(cx, cy);
            if (!el.contains(top) && top !== el) che++;
          });
        }
        box.scrollTop = 0;
        const btn = document.getElementById('veilBtn').getBoundingClientRect();
        return { rows: rows.length, toiDuoc: seen.size, che: che,
                 nutTrongKhung: btn.top >= 0 && btn.bottom <= innerHeight };
      });
      if (r.che > 0 || r.toiDuoc !== r.rows || !r.nutTrongKhung) {
        hong.push(n + ' món (che ' + r.che + ', tới được ' + r.toiDuoc + '/' + r.rows +
                  ', nút trong khung ' + r.nutTrongKhung + ')');
      }
      await p.locator('#veilBtn').click();
      await p.waitForTimeout(150);
    }
    check('[' + ten + '] mọi hàng cuộn tới được, không hàng nào bị đè, nút đóng luôn trong khung',
      hong.length === 0, hong.join(' | '));
    check('[' + ten + '] hàng trong tủ: không lỗi trang', errs.length === 0, errs[0] || '');
    await ctx.close();
  }
}

// =====================================================================
// 6. Ở TRẠM DỊCH VỤ, NÚT TỦ ĐỒ PHẢI CÒN SỐNG
// Trạm chính là nơi mua đồ VỀ TỦ, nên đó là chỗ cần mở tủ nhất. Nút "Bắn thử" từng dùng
// chung ĐÚNG MỘT CHỖ với nút "Tủ đồ" ở bố cục ngang; luật chọn nút là dist/(r*mul), nên ở
// khoảng cách 0 nút bán kính lớn hơn luôn thắng và "Bắn thử" nuốt sạch mọi cú chạm.
// =====================================================================
async function shopStashSuite(b) {
  results.push('\n── nút Tủ đồ ở trạm dịch vụ ──');
  for (const [ten, vp] of [['dọc', { width: 390, height: 844 }], ['ngang', { width: 844, height: 390 }]]) {
    const { ctx, p, errs } = await open(b, R2D, vp);
    await enter2d(p);
    await p.evaluate(() => { REPO.startShop(); });     // DỰNG CẢNH: tới trạm dịch vụ
    await p.waitForTimeout(450);
    await p.evaluate(() => {
      REPO.S.stash.length = 0; REPO.S.stash.push({ kind: 'gun', uses: 3 });
      REPO.warp(REPO.S.car.x, REPO.S.car.y);
      REPO.S.running = true; REPO.S.cut = null;
    });
    await p.waitForTimeout(200);
    const xa = await p.evaluate(() => {
      const h = REPO.hud();
      return Math.round(Math.hypot(h.stash.x - h.test.x, h.stash.y - h.test.y));
    });
    check('[' + ten + '] hai nút Tủ đồ / Bắn thử không chồng nhau', xa > 30, 'cách nhau ' + xa + 'px');

    const pt = await hudPt(p, 'stash');
    await p.touchscreen.tap(pt.x, pt.y);              // >>> CHẠM THẬT <<<
    await p.waitForTimeout(450);
    const mo = await p.evaluate(() => ({ mo: REPO.S.stashOpen,
                                         hien: !document.getElementById('veil').hidden }));
    check('[' + ten + '] ở trạm, chạm nút Tủ đồ thì tủ mở ra', mo.mo && mo.hien, JSON.stringify(mo));
    check('[' + ten + '] trạm: không lỗi trang', errs.length === 0, errs[0] || '');
    await ctx.close();
  }
}

// =====================================================================
// 7. NHẬP LIỆU KHÔNG ĐƯỢC PHÉP KẸT
// Không có chỗ nào trong bộ máy reset keys / cần gạt / con trỏ. Một cú nhả tay lạc mất là
// hỏng vĩnh viễn cho tới khi tải lại trang: chuột phải nuốt pointerup, giữ W rồi rời cửa sổ.
// =====================================================================
async function inputSuite(b) {
  results.push('\n── nhập liệu không kẹt ──');
  const { ctx, p, errs } = await open(b, R2D, { width: 1280, height: 720 });
  await enter2d(p);
  const box = await p.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.85 };
  });

  // Chuột phải ở đúng dải ngón cái: không được giữ con trỏ, không được đẻ ra cần gạt.
  await p.mouse.move(box.x, box.y);
  await p.mouse.down({ button: 'right' });
  await p.waitForTimeout(150);
  await p.mouse.up({ button: 'right' });
  await p.waitForTimeout(250);
  const sauChuotPhai = await p.evaluate(() => ({ giu: REPO.heldPointers(), gat: !!REPO.stick(),
                                                 nhin: !!REPO.lookStick(), ngam: !!REPO.aiming() }));
  check('chuột phải không để lại con trỏ nào bị giữ',
    sauChuotPhai.giu === 0 && !sauChuotPhai.gat && !sauChuotPhai.nhin && !sauChuotPhai.ngam,
    JSON.stringify(sauChuotPhai));

  // Giữ W rồi rời cửa sổ: phím phải được nhả hộ, nếu không nhân vật tự đi mãi.
  await p.keyboard.down('w');
  await p.waitForTimeout(250);
  await p.evaluate(() => dispatchEvent(new Event('blur')));
  await p.waitForTimeout(200);
  const x0 = await p.evaluate(() => Math.round(REPO.S.player.x * 10));
  await p.waitForTimeout(700);
  const x1 = await p.evaluate(() => Math.round(REPO.S.player.x * 10));
  await p.keyboard.up('w');
  check('rời cửa sổ khi đang giữ W thì nhân vật đứng lại', x0 === x1, x0 + ' → ' + x1);

  // Cú giữ ô đồ bị huỷ giữa chừng không được để lại thế ngắm treo — thế ngắm treo làm chết
  // cả ba ô đồ lẫn cần nhìn, và trước bản vá còn ném lỗi ngay trong vòng vẽ khi vào trạm.
  await p.evaluate(() => { REPO.giveGear('gun', 1); REPO.equip('gun'); });
  await p.waitForTimeout(120);
  const s0 = await hudPt(p, 'slots', 0);
  if (s0) {
    await p.mouse.move(s0.x, s0.y);
    await p.mouse.down();
    await p.waitForTimeout(150);
    await p.evaluate(() => dispatchEvent(new Event('blur')));
    await p.waitForTimeout(250);
    await p.mouse.up();
    await p.waitForTimeout(150);
    check('cú ngắm bị huỷ giữa chừng không treo lại',
      await p.evaluate(() => !REPO.aiming()));
  }

  // Thế ngắm còn treo mà bước vào trạm dịch vụ (danh sách ô đồ RỖNG) từng là một cú ném
  // lỗi ngay trong draw(), tức là vòng vẽ chết hẳn.
  await p.evaluate(() => {
    if (REPO.S.player) { REPO.S.player.aimSlot = 0; REPO.S.player.aimId = -99; }
    REPO.startShop();
  });
  await p.waitForTimeout(600);
  check('thế ngắm treo + vào trạm: vòng vẽ vẫn sống', await framesAlive(p, 500));
  check('nhập liệu: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
// 8. PHÍM ESCAPE LUÔN ĐÓNG ĐƯỢC BẢNG ĐANG MỞ
// =====================================================================
async function escapeSuite(b) {
  results.push('\n── phím Escape luôn thoát được ──');
  const { ctx, p, errs } = await open(b, R2D, { width: 844, height: 390 });
  await enter2d(p);
  await p.evaluate(() => {
    REPO.S.stash.length = 0; REPO.S.stash.push({ kind: 'gun', uses: 3 });
    REPO.warp(REPO.S.car.x, REPO.S.car.y); REPO.S.running = true;
  });
  await p.waitForTimeout(150);
  await p.keyboard.press('f');                          // >>> PHÍM THẬT <<<
  await p.waitForTimeout(300);
  check('phím F mở được tủ', await p.evaluate(() => REPO.S.stashOpen));
  await p.keyboard.press('Escape');                     // >>> PHÍM THẬT <<<
  await p.waitForTimeout(300);
  const sau = await p.evaluate(() => ({ mo: REPO.S.stashOpen, chay: REPO.S.running,
                                        an: document.getElementById('veil').hidden }));
  check('Escape đóng tủ và ca chạy tiếp', !sau.mo && sau.chay && sau.an, JSON.stringify(sau));
  check('Escape: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
// 9. BẢN BIỆT ĐỘI — về menu là bộ máy phải câm
// stepCut() chạy trên đồng hồ THẬT, ngoài cổng `S.running && !S.dead`. Ván kết thúc mà cảnh
// cắt còn treo thì cái `then` của nó gọi startShop()/startLevel(), và cả hai bật lại
// S.running = true. Đo được lúc chưa vá: về sảnh rồi mà running=true, shopMode=true,
// S.time 0 → 1,55 và vẫn tăng — một ca trực sống chạy sau lưng màn chọn map.
// =====================================================================
async function squadCutSuite(b) {
  results.push('\n── Biệt Đội: về menu là bộ máy phải câm ──');
  const { ctx, p, errs } = await open(b, SQD, { width: 844, height: 390 });
  await p.evaluate(() => {                              // DỰNG CẢNH: mở khoá và vào map
    SQ.CHARS.forEach(c => { SQ.M.chars[c.id] = { lv: 1, shard: 0, equip: {} }; });
    SQ.autoFill(); SQ.squad.enter('k3');
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => { REPO.cancelCut(); REPO.S.running = true; });
  // DỰNG CẢNH: hết tầng, xe bắt đầu chạy — 2,1 giây có cảnh cắt đang treo.
  await p.evaluate(() => {
    REPO.S.pads.forEach(q => { q.done = true; q.value = q.quota; });
    REPO.S.levelDone = true;
    REPO.warp(REPO.S.car.x, REPO.S.car.y);
  });
  await p.waitForTimeout(700);
  check('kích được cảnh xe chạy', await p.evaluate(() => !!REPO.S.cut));

  // >>> BẤM THẬT: Bỏ ca ngay giữa cảnh cắt <<<
  await p.locator('#btnQuitRun').click();
  await p.waitForTimeout(250);
  await p.locator('#modal button', { hasText: 'Bỏ ca' }).first().click();
  await p.waitForTimeout(250);
  await p.locator('#modal button', { hasText: 'Về sảnh' }).first().click();
  await p.waitForTimeout(2600);

  const a = await p.evaluate(() => ({ t: REPO.S.time, chay: REPO.S.running, van: !!SQ.squad.run(),
                                      inRun: document.body.classList.contains('in-run') }));
  await p.waitForTimeout(1300);
  const c = await p.evaluate(() => ({ t: REPO.S.time, chay: REPO.S.running }));
  check('về sảnh rồi thì bộ máy dừng hẳn', a.chay === false && c.chay === false,
    'running ' + a.chay + ' → ' + c.chay);
  check('và đồng hồ trong ca không chạy nữa', Math.abs(c.t - a.t) < 0.05, a.t + ' → ' + c.t);
  check('lớp in-run được gỡ đúng lúc', a.inRun === false && a.van === false);
  check('còn thấy menu để bấm tiếp',
    await p.evaluate(() => document.querySelectorAll('#menu button').length > 0));
  check('bỏ ca giữa cảnh cắt: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
// 10. BẢN BIỆT ĐỘI — bản lưu hỏng không được giết cái menu
// UI.render() từng clear(#menu) NGAY ĐẦU rồi mới dựng lại, và hàng tab thêm vào SAU CÙNG:
// một cú ngoặc ở giữa là menu trắng vĩnh viễn — mà nút "Xoá dữ liệu" lại nằm trong chính
// cái màn vừa chết, và nguyên nhân thì nằm trong localStorage nên tải lại vẫn y nguyên.
// Đường vào không xa vời: syncFromHub() lấy payload đám mây nhét thẳng vào migrate() rồi ghi.
// =====================================================================
async function squadBadSaveSuite(b) {
  results.push('\n── Biệt Đội: bản lưu hỏng không giết menu ──');
  const cases = [
    ['id nhân vật lạ',      "s.chars['khong_co_ai']={lv:1,shard:0,equip:{}};"],
    ['món đồ ô lạ',         "s.inv.push({id:'x99',slot:'khong_co',set:'khong_co',main:'khong_co',star:5,lv:1,subs:[]});"],
    ['bộ nhiệm vụ cụt',     "s.quests={day:-1,week:-1,daily:[],weekly:[],claimed:{}};"],
    ['tổ trỏ vào hư không', "s.squad={lead:'khong_co_ai',slots:['khong_co_ai',null,null]};"],
    ['chiến thuật lạ',      "s.tactics={khong_co_ai:'khong_co'};"]
  ];
  for (const [ten, code] of cases) {
    const { ctx, p, errs } = await open(b, SQD, { width: 390, height: 844 });
    // DỰNG CẢNH: ghi một bản lưu hỏng rồi tải lại — đúng đường mà đồng bộ hub đi.
    await p.evaluate(src => {
      const s = JSON.parse(localStorage.getItem('repo_squad_save_v1') || 'null') || SQ.M;
      new Function('s', src)(s);
      localStorage.setItem('repo_squad_save_v1', JSON.stringify(s));
    }, code);
    await p.reload();
    await p.waitForTimeout(1300);

    const m = await p.evaluate(() => {
      const nut = [...document.querySelectorAll('#menu button')].filter(x => x.offsetParent !== null);
      return { so: nut.length, nhan: nut.slice(0, 12).map(x => x.textContent.trim()) };
    });
    check('[' + ten + '] menu vẫn có nút bấm được', m.so > 0, m.so + ' nút');

    // Đi khắp menu bằng CLICK THẬT — không màn nào được để lại một cái menu rỗng.
    const trong = [];
    for (const t of m.nhan) {
      if (!t) continue;
      const l = p.locator('#menu button', { hasText: t }).first();
      if (!(await l.count())) continue;
      try { await l.click({ timeout: 2000 }); } catch (e) { continue; }
      await p.waitForTimeout(260);
      const r = await p.evaluate(() => ({
        // Vào ca thì menu bị ẩn CÓ CHỦ Ý — nhưng lúc đó nút "Bỏ ca" phải hiện, và nó là lối ra.
        inRun: document.body.classList.contains('in-run'),
        raDuoc: (() => { const q = document.getElementById('btnQuitRun');
                         return !!(q && q.offsetParent !== null); })(),
        so: [...document.querySelectorAll('#menu button')].filter(x => x.offsetParent !== null).length
      }));
      if (r.inRun ? !r.raDuoc : r.so === 0) trong.push(t + (r.inRun ? ' (trong ca, không có lối ra)' : ''));
      if (r.inRun) {                                  // thoát ca bằng BẤM THẬT rồi đi tiếp
        await p.locator('#btnQuitRun').click().catch(() => {});
        await p.waitForTimeout(200);
        await p.locator('#modal button', { hasText: 'Bỏ ca' }).first().click().catch(() => {});
        await p.waitForTimeout(300);
        await p.locator('#modal button', { hasText: 'Về sảnh' }).first().click().catch(() => {});
        await p.waitForTimeout(400);
      }
      await p.keyboard.press('Escape');
      await p.waitForTimeout(120);
    }
    check('[' + ten + '] bấm khắp menu không màn nào trắng', trong.length === 0, trong.join(', '));

    // Và không có lớp phủ nào còn kẹt lại mà không đóng được.
    const ket = await p.evaluate(() => {
      const ov = document.getElementById('modal');
      if (!/\bshow\b/.test(ov.className)) return null;
      const nut = [...ov.querySelectorAll('button')].filter(x => x.offsetParent !== null);
      return nut.length === 0 ? 'lớp phủ mở mà không có nút nào' : null;
    });
    check('[' + ten + '] không còn lớp phủ nào kẹt lại', ket === null, ket || '');
    await ctx.close();
  }
}

// =====================================================================
// 11. BẢN BIỆT ĐỘI — cửa sổ dựng lỗi vẫn phải đóng được
// UI.popup từng bật `modal show` TRƯỚC khi chạy build(), và chỉ gắn thẻ ✕ cùng cái bắt
// bấm-ra-ngoài SAU đó. build() ném lỗi là lớp phủ đen kín trang, rỗng không, phủ luôn cả
// đường link "← Hub". Chỉ tải lại trang mới thoát ra được.
// =====================================================================
async function squadPopupSuite(b) {
  results.push('\n── Biệt Đội: cửa sổ dựng lỗi vẫn đóng được ──');
  const { ctx, p, errs } = await open(b, SQD, { width: 390, height: 844 });

  await p.evaluate(() => { SQ.ui.popup('Thử', () => { throw new Error('loi co y'); }); });
  await p.waitForTimeout(250);
  const co = await p.evaluate(() => {
    const ov = document.getElementById('modal');
    const nut = [...ov.querySelectorAll('button')].filter(x => x.offsetParent !== null);
    return { hien: /\bshow\b/.test(ov.className), so: nut.length,
             coX: nut.some(x => x.textContent.indexOf('✕') >= 0) };
  });
  check('cửa sổ dựng lỗi vẫn hiện nút đóng', co.hien && co.so > 0 && co.coX, co.so + ' nút');

  await p.locator('#modal button', { hasText: '✕' }).first().click();   // >>> CLICK THẬT <<<
  await p.waitForTimeout(250);
  check('bấm ✕ thì cửa sổ đóng thật',
    await p.evaluate(() => !/\bshow\b/.test(document.getElementById('modal').className)));

  // Bấm ra ngoài cũng phải đóng được.
  await p.evaluate(() => { SQ.ui.popup('Thử 2', d => { d.textContent = 'xin chào'; }); });
  await p.waitForTimeout(200);
  await p.mouse.click(8, 8);
  await p.waitForTimeout(250);
  check('bấm ra ngoài cũng đóng được',
    await p.evaluate(() => !/\bshow\b/.test(document.getElementById('modal').className)));

  // Escape cũng phải đóng được — kể cả cửa sổ dựng lỗi.
  await p.evaluate(() => { SQ.ui.popup('Thử 3', () => { throw new Error('loi co y'); }); });
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  check('Escape đóng được cả cửa sổ dựng lỗi',
    await p.evaluate(() => !/\bshow\b/.test(document.getElementById('modal').className)));

  // Mở/đóng ba mươi lần rồi vẫn phải đóng đúng MỘT lần một cú bấm — cái bắt bấm-ra-ngoài
  // từng cộng dồn mỗi lần mở và không bao giờ được gỡ.
  for (let i = 0; i < 30; i++) {
    await p.evaluate(() => { SQ.ui.popup('vòng', d => { d.textContent = 'x'; }); SQ.ui.closePopup(); });
  }
  await p.evaluate(() => { SQ.ui.popup('cuối', d => { d.textContent = 'x'; }); });
  await p.waitForTimeout(150);
  await p.mouse.click(8, 8);
  await p.waitForTimeout(250);
  check('30 lần mở/đóng rồi vẫn đóng gọn một nhát',
    await p.evaluate(() => !/\bshow\b/.test(document.getElementById('modal').className)));

  check('cửa sổ: không lỗi ngoài dự tính', realErrs(errs).length === 0, realErrs(errs)[0] || '');
  await ctx.close();
}

// =====================================================================
(async () => {
  const b = await chromium.launch();
  const run = async (ten, fn) => {
    try { await fn(b); } catch (e) { check(ten + ': bộ test chạy trọn', false, e.message); }
  };
  await run('vòng vẽ', frameLoopSuite);
  await run('chó canh', watchdogSuite);
  await run('màn kết ca', endVeilSuite);
  await run('chạm mở tủ', ghostTapSuite);
  await run('chạm mở/đóng ngay', tapOpenTapCloseSuite);
  await run('bấm ra khoảng trống', backdropCloseSuite);
  await run('hàng trong tủ', rowsReachableSuite);
  await run('tủ ở trạm', shopStashSuite);
  await run('nhập liệu', inputSuite);
  await run('Escape', escapeSuite);
  await run('Biệt Đội cảnh cắt', squadCutSuite);
  await run('Biệt Đội bản lưu hỏng', squadBadSaveSuite);
  await run('Biệt Đội cửa sổ', squadPopupSuite);
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
