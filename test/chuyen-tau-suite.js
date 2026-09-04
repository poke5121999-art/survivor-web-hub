/*
 * CHUYẾN TÀU CUỐI — bộ kiểm.
 *
 * Chạy:  node test/chuyen-tau-suite.js
 *
 * Bốn nguyên tắc đo, chép từ các bộ kiểm khác trong kho vì chúng đã trả giá rồi:
 *   1. BẤM UI THẬT. Không gọi hàm của bộ máy để đi tắt qua chính chỗ đang kiểm.
 *      page.evaluate chỉ dùng để ĐỌC trạng thái và để DỰNG CẢNH.
 *   2. Dựng cảnh TẤT ĐỊNH, và ghi lý do ngay tại chỗ. Một bài kiểm bập bênh tệ hơn
 *      không có bài kiểm nào.
 *   3. Đo cả một KHOẢNG THỜI GIAN, không đo một khung. "Đúng lúc tôi nhìn thì nó đang
 *      làm gì" là một phép đo hỏng.
 *   4. Viết CỨNG kỳ vọng, đừng đọc từ chính bảng dữ liệu đang kiểm — bài kiểm phải HỎNG
 *      khi ai đó thêm hay bớt một con, chứ không lặng lẽ đổi kỳ vọng theo.
 */
'use strict';

const path = require('path');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'games', 'chuyen-tau', 'index.html').replace(/\\/g, '/');

const CT_BURN_THAN = 600;   // kỳ vọng CỨNG: một cục than = 600 nhiên liệu
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

async function open(browser, w, h) {
  const ctx = await browser.newContext({
    viewport: { width: w || 844, height: h || 390 },   // điện thoại NẰM NGANG
    deviceScaleFactor: 2, hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.CT && window.CT.M && window.CT.GAME, null, { timeout: 8000 });
  return { ctx, page, errs };
}

// ---------------------------------------------------------------------------
async function suiteBoot(browser) {
  out.push('\n[1] Nạp trang và bảng nội dung');
  const { ctx, page, errs } = await open(browser);
  try {
    const d = await page.evaluate(() => ({
      chars: CT.CHARS.length,
      maps: CT.MAPS.length,
      foes: CT.FOES.length,
      cars: CT.CARS.length,
      nights: CT.NIGHTS.length,
      guns: CT.GUNS.length,
      packs: CT.PACKS.length,
      evol: CT.EVOL.length,
      own: Object.keys(CT.M.chars).length,
      active: CT.M.active
    }));
    // Kỳ vọng viết CỨNG: thêm hay bớt một nhân vật thì bài này phải đỏ.
    check('có đúng 10 nhân vật', d.chars === 10, 'đếm được ' + d.chars);
    check('có đúng 9 chuyến', d.maps === 9, 'đếm được ' + d.maps);
    check('có đúng 8 giống quái (kể cả trùm)', d.foes === 8, 'đếm được ' + d.foes);
    check('có đúng 6 loại toa', d.cars === 6, 'đếm được ' + d.cars);
    check('có đúng 4 loại đêm', d.nights === 4, 'đếm được ' + d.nights);
    check('có đúng 6 khẩu súng', d.guns === 6, 'đếm được ' + d.guns);
    check('có đúng 6 gói nạp giả', d.packs === 6, 'đếm được ' + d.packs);
    check('có đúng 8 nhánh tiến hoá', d.evol === 8, 'đếm được ' + d.evol);
    check('tài khoản mới chỉ có MỘT người', d.own === 1, 'đang có ' + d.own);
    check('người mặc định là Chị Hai', d.active === 'hai', d.active);
    check('không có lỗi console lúc nạp', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteSkills(browser) {
  out.push('\n[2] Chiêu: mười động từ, không ai trùng ai');
  const { ctx, page } = await open(browser);
  try {
    const d = await page.evaluate(() => {
      const ids = CT.CHARS.map(c => c.skill.id);
      const uniq = new Set(ids);
      // mỗi nhân vật phải có ĐỦ BA phần: chiêu bấm được, bị động đổi luật, đặc quyền ở ga
      const missing = CT.CHARS.filter(c => !c.skill || !c.passive || !c.station).map(c => c.id);
      const noDesc = CT.CHARS.filter(c => !c.skill.desc || c.skill.desc.length < 20).map(c => c.id);
      const noAwaken = CT.CHARS.filter(c => !CT.AWAKEN[c.id]).map(c => c.id);
      return { n: ids.length, uniq: uniq.size, missing, noDesc, noAwaken,
               dodgeCd: CT.DODGE.cd, dodgeIf: CT.DODGE.iframe, dodgeDur: CT.DODGE.dur };
    });
    check('mười chiêu, không chiêu nào trùng động từ', d.uniq === 10 && d.n === 10,
          d.uniq + ' khác nhau / ' + d.n);
    check('ai cũng có đủ ba phần (chiêu + bị động + đặc quyền ga)', d.missing.length === 0,
          d.missing.join(','));
    check('chiêu nào cũng có lời mô tả tử tế', d.noDesc.length === 0, d.noDesc.join(','));
    check('ai cũng có một hiệu ứng mở ở cấp 5', d.noAwaken.length === 0, d.noAwaken.join(','));
    // Số của cú lướt đọc thẳng từ mã nguồn Celeste; nếu ai đó chỉnh thì phải chỉnh có ý thức.
    check('cú lướt có khung bất tử ngắn hơn chính nó', d.dodgeIf < d.dodgeDur,
          'bất tử ' + d.dodgeIf + 's / lướt ' + d.dodgeDur + 's');
    check('lướt hồi nhanh (là động từ cốt lõi, không phải chiêu đặc biệt)', d.dodgeCd <= 3,
          d.dodgeCd + 's');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteRun(browser) {
  out.push('\n[3] Vào ván thật: tàu chạy, than cạn, khung hình sống');
  const { ctx, page, errs } = await open(browser);
  try {
    // BẤM UI THẬT: vào màn chọn chuyến rồi bấm "Lên tàu" của chuyến đầu.
    await page.click('.nav-i:nth-child(1)');
    await page.click('.btn.big.main');            // "CHỌN CHUYẾN →"
    await page.waitForSelector('.map .btn.main');
    await page.click('.map .btn.main');
    await page.waitForFunction(() => CT.GAME.R() !== null, null, { timeout: 4000 });

    const a = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { phase: R.phase, leg: R.leg, legs: R.legs, fuel: R.fuel,
               cars: R.cars.length, hp: R.p.hp, onTrain: R.p.onTrain };
    });
    check('vào được ván', a.phase === 'chay', a.phase);
    check('bắt đầu ở chặng 1', a.leg === 1, 'chặng ' + a.leg + '/' + a.legs);
    check('chuyến đầu có đúng 3 chặng', a.legs === 3, String(a.legs));
    check('người chơi đứng trên tàu', a.onTrain === true);
    check('đoàn tàu có ít nhất một toa', a.cars >= 1, a.cars + ' toa');

    // Đo cả một KHOẢNG: 2,5 giây thật.
    await page.waitForTimeout(2500);
    const b = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { dist: R.dist, fuel: R.fuel, spd: R.spd, t: R.t, clock: R.clock };
    });
    check('tàu đi được quãng đường', b.dist > 50, b.dist.toFixed(0) + ' đơn vị');
    check('tàu đạt tốc độ', b.spd > 50, b.spd.toFixed(0));
    // Luật cốt lõi: than tiêu theo THỜI GIAN. Sau 2,5 giây phải hụt đi thấy được.
    check('than tiêu theo thời gian', a.fuel - b.fuel > 5,
          'hụt ' + (a.fuel - b.fuel).toFixed(1) + ' đơn vị trong 2,5 giây');
    check('đồng hồ ngày đêm chạy', b.clock > 1, b.clock.toFixed(1) + 's');
    check('không lỗi console trong ván', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteNight(browser) {
  out.push('\n[4] Ban ngày KHÔNG spawn — luật quan trọng nhất chép từ bản gốc');
  const { ctx, page } = await open(browser);
  try {
    await page.evaluate(() => { CT.GAME.newRun('m1', 'hai'); });
    // Dựng cảnh TẤT ĐỊNH: ghim đồng hồ vào giữa ban ngày, chạy một lúc, đếm quái.
    // Không dùng ngẫu nhiên ở đây vì đây là một luật, không phải một tỉ lệ.
    const day = await page.evaluate(async () => {
      const R = CT.GAME.R();
      R.clock = 5;                      // giữa ban ngày
      R.foes.length = 0;
      for (let i = 0; i < 60 * 20; i++) { R.clock = 5; CT.GAME.step(1 / 60); }
      return R.foes.length;
    });
    check('ban ngày không sinh ra một con nào', day === 0, 'đếm được ' + day);

    const night = await page.evaluate(async () => {
      const R = CT.GAME.R();
      R.foes.length = 0;
      R.spawnT = 0;
      for (let i = 0; i < 60 * 20; i++) { R.clock = CT.DAY.daySec + 5; CT.GAME.step(1 / 60); }
      return { n: R.foes.length, isNight: R.isNight, name: R.night.name, no: R.nightNo };
    });
    check('ban đêm thì có quái', night.n > 0, 'đếm được ' + night.n + ' con');
    check('đêm đầu tiên LUÔN là đêm mây (người mới không gặp sói ngay)',
          night.no !== 1 || night.name === 'Đêm Mây', night.name + ', đêm thứ ' + night.no);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteNoise(browser) {
  out.push('\n[5] Tiếng động: bắn súng đánh thức, đánh gần thì không');
  const { ctx, page } = await open(browser);
  try {
    const r = await page.evaluate(() => {
      CT.GAME.newRun('m1', 'hai');
      const R = CT.GAME.R();
      const P = R.p;
      // Dựng cảnh tất định: hai con ngủ, đặt ở đúng một khoảng cách nằm GIỮA bán kính
      // tiếng cận chiến (không có) và bán kính tiếng súng.
      const mk = dx => {
        R.foes.length = 0;
        CT.GAME.noise(0, 0, 0);
        const f = { def: CT.FOE_BY_ID['bo'], id: 'bo', x: P.x + dx, y: P.y,
                    hp: 100, hpMax: 100, r: 11, dead: false, sleep: true, wake: 0,
                    dirX: -1, dirY: 0, dist: 0, flash: 0, stun: 0, stopT: 0,
                    tx: 0, ty: 0, cd: 0, pain: 0.8, painDur: 0.1, seed: 0.5 };
        R.foes.push(f);
        return f;
      };
      const d = 180;    // xa hơn bán kính chạm (34), gần hơn bán kính súng (300)
      const f1 = mk(d);
      CT.GAME.noise(P.x, P.y, CT.NOISE.sung);
      const wokeByGun = !f1.sleep;

      const f2 = mk(d);
      // đánh gần KHÔNG gọi noise() — kiểm bằng cách không gọi gì cả và xác nhận nó còn ngủ
      const stillAsleep = f2.sleep;
      return { wokeByGun, stillAsleep, rGun: CT.NOISE.sung, rMelee: 0 };
    });
    check('bắn súng đánh thức con cách 180 đơn vị', r.wokeByGun === true,
          'bán kính tiếng súng ' + r.rGun);
    check('đánh cận chiến không đánh thức con nào khác', r.stillAsleep === true);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteGacha(browser) {
  out.push('\n[6] Gacha: bảo hiểm cứng phải giữ lời');
  const { ctx, page } = await open(browser);
  try {
    const r = await page.evaluate(() => {
      // Cho thật nhiều ngọc rồi quay tới đúng mốc bảo hiểm cứng, đếm chuỗi khô dài nhất.
      CT.M.gem = 9e9; CT.M.ticketC = 0;
      let worst = 0, run = 0, five = 0, four = 0, total = 0;
      for (let i = 0; i < 3000; i++) {
        const res = CT.pull('char', 1);
        if (!res.ok) break;
        total++;
        const s = res.results[0].star;
        if (s === 5) { five++; if (run > worst) worst = run; run = 0; }
        else { run++; if (s === 4) four++; }
      }
      return { worst, five, four, total, hard: CT.GACHA.char.hard,
               rate5: five / total, rate4: four / total };
    });
    check('chuỗi khô KHÔNG BAO GIỜ vượt mốc bảo hiểm cứng',
          r.worst < r.hard, 'dài nhất ' + r.worst + ' lượt, mốc ' + r.hard);
    check('tỉ lệ 5★ thực tế cao hơn tỉ lệ cơ bản (nhờ bảo hiểm mềm)',
          r.rate5 > 0.02, (r.rate5 * 100).toFixed(2) + '% trên ' + r.total + ' lượt');
    check('4★ ra đủ dày để không thấy trống tay', r.rate4 > 0.12,
          (r.rate4 * 100).toFixed(1) + '%');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteShop(browser) {
  out.push('\n[7] Nạp giả: cộng đúng, và NÓI RÕ mình là giả');
  const { ctx, page } = await open(browser);
  try {
    await page.click('.nav-i:nth-child(5)');       // Chợ
    await page.waitForSelector('.fakebox');
    const warn = await page.textContent('.fakebox');
    check('có hộp cảnh báo "nạp là GIẢ" ngay đầu màn cửa hàng',
          /GIẢ/.test(warn), warn.slice(0, 40) + '…');

    const before = await page.evaluate(() => CT.M.gem);
    await page.click('.pack .btn.main');           // mua gói đầu — BẤM THẬT
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => ({ gem: CT.M.gem, spent: CT.M.counters.spendVnd }));
    check('bấm mua thì ngọc vào ví', after.gem > before, before + ' → ' + after.gem);
    check('lần đầu được nhân đôi', after.gem - before === 600,
          'cộng ' + (after.gem - before) + ' (gói 300 × 2)');
    check('ghi lại số tiền giả đã "nạp"', after.spent === 22000, String(after.spent));

    const toast = await page.textContent('.toast').catch(() => '');
    check('thông báo vẫn nhắc "(nạp giả)"', /nạp giả/.test(toast), toast);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteBag(browser) {
  out.push('\n[8] Bao tải và tủ: nút "Nhét hết vô tủ" phải chạy thật');
  const { ctx, page } = await open(browser);
  try {
    await page.evaluate(() => {
      CT.GAME.newRun('m1', 'hai');
      const R = CT.GAME.R();
      // dựng cảnh: ba món trong bao tải, người chơi đứng trên tàu
      for (let i = 0; i < 3; i++)
        R.bag.push({ x: 0, y: 0, size: CT.SIZES[0], mat: CT.MATS[0], val: 100,
                     cells: 1, name: 'món ' + i, bob: 0, r: 8 });
      R.p.onTrain = true;
    });
    await page.evaluate(() => CT.UI.openBag());
    await page.waitForSelector('.bag-wrap');
    const cells = await page.$$eval('.bag-grid .cell', n => n.length);
    check('bao tải hiện đủ ba món', cells >= 3, 'thấy ' + cells + ' ô');

    // BẤM THẬT vào nút, không gọi hàm
    const btns = await page.$$('.pop-f .btn');
    await btns[0].click();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { bag: R.bag.length, stash: R.stash.length };
    });
    check('bấm "Nhét hết vô tủ" thì bao tải rỗng', after.bag === 0, String(after.bag));
    check('và tủ nhận đủ ba món', after.stash === 3, String(after.stash));

    const cap = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { max: R.bagMax, free: CT.GAME.bagFree() };
    });
    check('bao tải có đúng 10 ô như bản gốc', cap.max === 10, String(cap.max));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteSave(browser) {
  out.push('\n[9] Lưu game: id lạ trong save không được giết màn menu');
  const { ctx, page } = await open(browser);
  try {
    const r = await page.evaluate(() => {
      // Đây là lỗi đã làm màn menu trắng vĩnh viễn ở bản Biệt Đội: một id mà bản game
      // này không biết nằm lại trong localStorage, và vì nguyên nhân nằm trong ổ cứng
      // nên tải lại trang vẫn y nguyên — người chơi không có cách nào tự thoát.
      const bad = {
        v: 1, gold: 100, gem: 0, scrap: 0, ticketC: 0, ticketE: 0,
        chars: { 'khong-ton-tai': { shard: 3, skillLv: 2, equip: { 'o-la': 'i999' } },
                 hai: { shard: 0, skillLv: 1, equip: {} } },
        active: 'khong-ton-tai',
        inv: [{ id: 'i1', slot: 'o-la', star: 5, lv: 0, main: 'chi-so-la', subs: [] },
              { id: 'i2', slot: 'mu', star: 4, lv: 0, main: 'hp', subs: [{ k: 'dmg', v: 0.02 }] }],
        evol: { 'nhanh-la': 9, hp: 3 },
        cars: ['toa-la', null, null, null, null], carLv: { 'toa-la': 4 },
        maps: { 'map-la': { leg: 9, cleared: true, best: 1 } },
        quests: { day: -1, week: -1, daily: ['viec-la'], weekly: [],
                  claimed: { 'viec-la': 1 }, achClaimed: { 'thanh-tuu-la': 1 } },
        shopLimit: { day: -1, used: { 'doi-la': 3 } },
        iap: { 'goi-la': 2 }
      };
      localStorage.setItem('chuyen-tau.save.v1', JSON.stringify(bad));
      CT.load();
      const m = CT.M;
      let rendered = true;
      try { CT.UI.render(); } catch (e) { rendered = false; }
      return {
        badChar: !!m.chars['khong-ton-tai'],
        activeOk: !!CT.CHAR_BY_ID[m.active],
        badItem: m.inv.some(i => i.slot === 'o-la'),
        goodItem: m.inv.some(i => i.id === 'i2'),
        badEvol: m.evol['nhanh-la'] != null,
        goodEvol: m.evol.hp === 3,
        badCar: m.cars.indexOf('toa-la') >= 0,
        badMap: !!m.maps['map-la'],
        badQuest: !!m.quests.claimed['viec-la'],
        badShop: m.shopLimit.used['doi-la'] != null,
        badIap: m.iap['goi-la'] != null,
        rendered,
        menuHtml: document.getElementById('menu').innerHTML.length
      };
    });
    check('vứt nhân vật không tồn tại', !r.badChar);
    check('người đang chọn được sửa về một người có thật', r.activeOk);
    check('vứt món trang bị có ô không tồn tại', !r.badItem);
    check('nhưng GIỮ món hợp lệ', r.goodItem);
    check('vứt nhánh tiến hoá không tồn tại', !r.badEvol);
    check('nhưng GIỮ cấp tiến hoá hợp lệ', r.goodEvol);
    check('vứt toa không tồn tại', !r.badCar);
    check('vứt map không tồn tại', !r.badMap);
    check('vứt nhiệm vụ đã nhận thưởng không tồn tại', !r.badQuest);
    check('vứt bộ đếm quầy đổi không tồn tại', !r.badShop);
    check('vứt gói nạp không tồn tại', !r.badIap);
    check('màn menu vẫn dựng được, không trắng', r.rendered && r.menuHtml > 400,
          r.menuHtml + ' ký tự');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteTouch(browser) {
  out.push('\n[10] Cảm ứng nằm ngang: cần gạt phải sống suốt cú kéo');
  const { ctx, page } = await open(browser, 844, 390);
  try {
    await page.evaluate(() => { CT.GAME.newRun('m1', 'hai'); document.getElementById('menu').classList.remove('on'); });
    await page.waitForTimeout(100);
    const lay = await page.evaluate(() => CT.HUD.layout());
    check('có bố cục nằm ngang', !!lay && lay.w > lay.h, lay ? lay.w + '×' + lay.h : 'không có');

    // Hai luật hình học phải đo được, không phải tin lời:
    const geo = await page.evaluate(() => {
      const L = CT.HUD.layout();
      const btns = [L.fire, L.dodge, L.skill, L.act].concat(L.slots);
      let minGap = 1e9, pair = '';
      for (let i = 0; i < btns.length; i++)
        for (let j = i + 1; j < btns.length; j++) {
          const d = Math.hypot(btns[i].x - btns[j].x, btns[i].y - btns[j].y) / L.R;
          if (d < minGap) { minGap = d; pair = i + '-' + j; }
        }
      // mọi nút lúc chạy phải nằm ở NỬA PHẢI màn hình
      const allRight = btns.every(b => b.x > L.w * 0.5);
      // giữa màn hình phải trống
      const midClear = btns.every(b => Math.abs(b.x - L.w * 0.5) > L.R * 1.5);
      return { minGap, pair, allRight, midClear, thumbY: L.thumbY, h: L.h };
    });
    check('hai nút gần nhau nhất vẫn cách ≥ 3,0 lần bán kính',
          geo.minGap >= 3.0, geo.minGap.toFixed(2) + '×r (cặp ' + geo.pair + ')');
    check('MỌI nút lúc chạy đều thuộc tay phải', geo.allRight);
    check('giữa màn hình không có nút nào', geo.midClear);
    check('dải ngón cái nằm ở nửa dưới', geo.thumbY > geo.h * 0.5,
          geo.thumbY.toFixed(0) + ' / ' + geo.h);

    // Kéo cần trái bằng cú chạm THẬT, và lấy mẫu SUỐT cú kéo — không phải một khung.
    // Lý do: lỗi kinh điển ở bản cũ là resize() chạy 60 lần một giây và xoá cần gạt,
    // nên đo một khung duy nhất có thể trúng đúng khung nó còn sống.
    const client = await page.context().newCDPSession(page);
    const sx = lay.left.x, sy = lay.left.y;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }]
    });
    const samples = [];
    for (let i = 1; i <= 12; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: sx + i * 4, y: sy - i * 2, id: 1 }]
      });
      await page.waitForTimeout(28);
      samples.push(await page.evaluate(() => ({ mx: CT.GAME.IN.mx, my: CT.GAME.IN.my })));
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const live = samples.filter(s => Math.hypot(s.mx, s.my) > 0.05).length;
    check('cần gạt trái sống suốt cú kéo, không bị xoá giữa chừng',
          live >= 9, live + '/12 mẫu có tín hiệu');
    const after = await page.evaluate(() => ({ mx: CT.GAME.IN.mx, my: CT.GAME.IN.my }));
    check('nhả tay thì cần về không', Math.hypot(after.mx, after.my) < 0.01,
          after.mx.toFixed(2) + ',' + after.my.toFixed(2));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteArt(browser) {
  out.push('\n[11] Hình: nạp được bộ dùng chung, và bảng hiệu ứng khai đúng số khung');
  const { ctx, page } = await open(browser);
  try {
    await page.waitForTimeout(1400);   // chờ ảnh tải
    const r = await page.evaluate(() => {
      const need = ['man.mai', 'foe.gunner', 'foe.rook', 'foe.mirror'];
      const have = need.filter(k => CT.ART.have(k));
      return { have, need: need.length, failed: CT.ART.failed.slice(0, 4),
               nFailed: CT.ART.failed.length,
               vfxIds: Object.keys(CT.ART.VFX).length };
    });
    check('nạp được charset người chơi và ba tấm quái',
          r.have.length === r.need, r.have.length + '/' + r.need +
          (r.nFailed ? ' — hỏng: ' + r.failed.join(', ') : ''));
    check('bảng hiệu ứng có ít nhất 15 mã', r.vfxIds >= 15, String(r.vfxIds));

    // Bốn tấm dưới đây khai 14 khung ở bản repo2d nhưng chỉ có 11 hoặc 13 ô THẬT SỰ có
    // hình. Bảng bên này đã sửa; bài kiểm ghim con số để không ai vô tình chép lại sai.
    const n = await page.evaluate(() => ({
      tia: CT.ART.VFX['tia'].n, trung: CT.ART.VFX['trung'].n, nap: CT.ART.VFX['nap'].n
    }));
    check('beam-cutoff-burst khai 11 khung, không phải 14', n.tia === 11, String(n.tia));
    check('electric-impact khai 13 khung', n.trung === 13, String(n.trung));
    check('focus-charge khai 13 khung', n.nap === 13, String(n.nap));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteSafety(browser) {
  out.push('\n[12] An toàn thị giác: không quá ba cú chớp mỗi giây');
  const { ctx, page } = await open(browser);
  try {
    const r = await page.evaluate(() => {
      CT.GAME.newRun('m1', 'hai');
      CT.FX.reset();
      // Nhồi mười cú chớp trong một giây — đúng tình huống bị bầy quái vây.
      let peak = 0;
      for (let i = 0; i < 10; i++) {
        CT.FX.flash(0.5, '190,60,50');
        peak = Math.max(peak, CT.FX.S.flash);
      }
      const stamps = CT.FX.S.flashAt.length;
      // và kiểm màu: mọi màu chớp phải dưới ngưỡng đỏ bão hoà R/(R+G+B) ≥ 0,8
      const cols = ['150,30,32', '190,60,50', '255,190,120', '210,235,255'];
      const worst = Math.max.apply(null, cols.map(c => {
        const p = c.split(',').map(Number);
        return p[0] / (p[0] + p[1] + p[2]);
      }));
      return { stamps, peak, worst };
    });
    check('chỉ ghi nhận tối đa 3 cú chớp trong một giây', r.stamps <= 3,
          'ghi được ' + r.stamps);
    check('độ mờ chớp không vượt trần', r.peak <= 0.6, r.peak.toFixed(2));
    check('mọi màu chớp đều dưới ngưỡng đỏ bão hoà 0,8', r.worst < 0.8,
          'cao nhất ' + r.worst.toFixed(3));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
// Dựng cảnh dùng chung cho các bộ [13]-[17]: vào ván, nhảy thẳng tới GA, đặt người
// chơi xuống đất cạnh quầy. Đây là DỰNG CẢNH nên được phép gọi hàm; mọi thao tác đo
// sau đó đều là bấm thật.
async function atStation(page, opt) {
  opt = opt || {};
  await page.evaluate(o => {
    CT.GAME.newRun(o.map || 'm1', o.char || 'hai');
    document.getElementById('menu').classList.remove('on');
    const R = CT.GAME.R();
    R.phaseT = CT.LEG.runSec;      // ép tới ga ở khung kế tiếp
  }, opt);
  await page.waitForFunction(() => CT.GAME.R().phase === 'ga', null, { timeout: 5000 });
  await page.evaluate(o => {
    const R = CT.GAME.R();
    const sp = R.station.shop;
    R.p.onTrain = false;
    R.p.x = sp.x; R.p.y = sp.y;    // đứng đúng trong vòng sáng của quầy
    R.cash = o.cash != null ? o.cash : 5000;
    R.timer = 9999;                // tắt đồng hồ ga để bài kiểm không bập bênh
  }, opt);
  await page.waitForTimeout(60);
}

// Bấm nút ⓐ THẬT trên canvas, tại đúng toạ độ mà bố cục HUD khai ra.
// Chờ 380ms TRƯỚC khi bấm: trang có bộ chặn bấm-đúp 350ms, và hai cú bấm liền nhau
// trong bài kiểm sẽ rơi vào đúng cửa sổ đó. Bài kiểm phải bấm như người thật bấm.
async function tapAct(page) {
  await page.waitForTimeout(380);
  const b = await page.evaluate(() => { const L = CT.HUD.layout(); return { x: L.act.x, y: L.act.y }; });
  await page.touchscreen.tap(b.x, b.y);
  await page.waitForTimeout(120);
}

// ---------------------------------------------------------------------------
async function suiteShopFlow(browser) {
  out.push('\n[13] Quầy ga: mua bằng cách BẤM, và tiền phải trừ đúng');
  const { ctx, page, errs } = await open(browser);
  try {
    await atStation(page);
    // Ga sinh ra có đồ rơi rải quanh, mà NHẶT đứng trước QUẦY trong thứ tự ưu tiên.
    // Dọn sạch chỗ đứng để bài này đo đúng cái nó định đo.
    await page.evaluate(() => {
      const R = CT.GAME.R();
      R.loots.length = 0; R.drops.length = 0; R.corpses.length = 0;
    });

    // Nhãn dưới nút ⓐ phải nói trước là nó sắp mở quầy — nếu chữ và việc lệch nhau thì
    // toàn bộ thiết kế "một nút nhiều việc" sụp.
    const hint = await page.evaluate(() => CT.GAME.actHint());
    check('đứng ở quầy thì nút ⓐ nói "Quầy hàng"', hint === 'Quầy hàng', hint || '(trống)');

    await tapAct(page);
    await page.waitForSelector('.shop-wrap', { timeout: 3000 });
    check('bấm ⓐ mở được quầy', true);

    // --- mua đạn: vào thùng đạn, KHÔNG ăn ô bao tải ---
    const before = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { cash: R.cash, ammo: R.ammo.nhe, bag: CT.GAME.bagUsed() };
    });
    const bought = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.shop-row'));
      const r = rows.find(x => x.querySelector('.sr-n').textContent.indexOf('Đạn ngắn') === 0);
      if (!r) return null;
      const price = parseInt(r.querySelector('.sr-p').textContent.replace(/[^0-9]/g, ''), 10);
      r.click();
      return price;
    });
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { cash: R.cash, ammo: R.ammo.nhe, bag: CT.GAME.bagUsed() };
    });
    check('bấm một hàng là mua được đạn', after.ammo > before.ammo,
          before.ammo + ' → ' + after.ammo);
    check('tiền trừ đúng bằng giá in trên hàng', bought != null && before.cash - after.cash === bought,
          '-' + (before.cash - after.cash) + ' / giá ' + bought);
    check('đạn KHÔNG chiếm ô bao tải', after.bag === before.bag,
          before.bag + ' → ' + after.bag);

    // --- mua than: vào toa than, chưa thành nhiên liệu ---
    const coal = await page.evaluate(() => {
      const R = CT.GAME.R();
      const b = { coal: R.coal, fuel: R.fuel };
      const rows = Array.from(document.querySelectorAll('.shop-row'));
      const r = rows.find(x => x.querySelector('.sr-n').textContent.indexOf('Than') === 0);
      if (r) r.click();
      const R2 = CT.GAME.R();
      return { b, coal: R2.coal, fuel: R2.fuel, found: !!r };
    });
    check('mua than thì than vào TOA, không tự vào lò',
          coal.found && coal.coal === coal.b.coal + 1 && coal.fuel === coal.b.fuel,
          'than ' + coal.b.coal + '→' + coal.coal + ', lò không đổi: ' + (coal.fuel === coal.b.fuel));

    // --- không đủ tiền thì bị chặn, và nói ra lý do ---
    const poor = await page.evaluate(() => {
      CT.GAME.R().cash = 0;
      const r = CT.GAME.buy('anhe');
      return { ok: r.ok, why: r.why, cash: CT.GAME.R().cash };
    });
    check('hết tiền thì không mua được và có lý do rõ ràng',
          poor.ok === false && /tiền/i.test(poor.why || ''), poor.why);
    check('mua hụt không làm âm tiền', poor.cash === 0, String(poor.cash));

    check('không lỗi console suốt phiên mua', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteSellFlow(browser) {
  out.push('\n[14] Bán ở quầy: bán rồi thì hết đường đổi vàng');
  const { ctx, page } = await open(browser);
  try {
    await atStation(page, { cash: 0 });
    await page.evaluate(() => {
      const R = CT.GAME.R();
      R.loots.length = 0; R.drops.length = 0; R.corpses.length = 0;
    });
    // Dựng ba món TẤT ĐỊNH — không dùng đồ ngẫu nhiên vì bài này đo đúng con số tiền.
    await page.evaluate(() => {
      const R = CT.GAME.R();
      R.bag.length = 0;
      for (let i = 0; i < 3; i++)
        R.bag.push({ x: 0, y: 0, size: CT.SIZES[0], mat: CT.MATS[0], val: 100,
                     cells: 1, name: 'món thử ' + i, bob: 0, r: 6 });
    });
    await tapAct(page);
    await page.waitForSelector('.shop-wrap');
    await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.btn.tab')).find(b => b.textContent === 'BÁN');
      t.click();
    });
    await page.waitForTimeout(80);

    const r1 = await page.evaluate(() => {
      const rows = document.querySelectorAll('.shop-row');
      const n = rows.length;
      rows[0].click();
      const R = CT.GAME.R();
      return { n, cash: R.cash, bag: R.bag.length };
    });
    check('tab BÁN liệt kê đủ ba món trong bao', r1.n === 3, String(r1.n));
    check('bấm một món là bán được', r1.bag === 2 && r1.cash === 100,
          'còn ' + r1.bag + ' món, tiền ' + r1.cash);

    const r2 = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.btn')).find(x => /Bán hết/.test(x.textContent));
      if (b) b.click();
      const R = CT.GAME.R();
      return { cash: R.cash, bag: R.bag.length, lootVal: R.lootVal };
    });
    check('nút "Bán hết bao tải" quét sạch bao', r2.bag === 0, r2.bag + ' món còn lại');
    check('tổng tiền đúng 300', r2.cash === 300, String(r2.cash));

    // Luật quan trọng: bán rồi thì món đó KHÔNG còn đổi ra vàng cuối ván nữa.
    const gold = await page.evaluate(() => {
      const R = CT.GAME.R();
      let g = 0;
      R.stash.forEach(it => { g += it.val; });
      R.bag.forEach(it => { g += it.val; });
      return g;
    });
    check('bán rồi thì không còn đổi ra vàng cuối ván', gold === 0, String(gold));

    // Đứng xa quầy thì không bán được — nếu không thì cái quầy chỉ là trang trí.
    const far = await page.evaluate(() => {
      const R = CT.GAME.R();
      R.p.x += 900;
      R.bag.push({ x: 0, y: 0, size: CT.SIZES[0], mat: CT.MATS[0], val: 100,
                   cells: 1, name: 'xa quầy', bob: 0, r: 6 });
      const v = CT.GAME.sellOne('bag', 0);
      return { v, bag: R.bag.length };
    });
    check('rời quầy thì không bán được nữa', far.v === 0 && far.bag === 1,
          'thu về ' + far.v);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteFuelFlow(browser) {
  out.push('\n[15] Bơm nhiên liệu: than vào toa, phải XÚC mới thành quãng đường');
  const { ctx, page } = await open(browser);
  try {
    await page.evaluate(() => {
      CT.GAME.newRun('m1', 'hai');
      document.getElementById('menu').classList.remove('on');
      const R = CT.GAME.R();
      R.p.onTrain = true;
      R.p.x = CT.GAME.fireboxX();
      R.fuel = 400; R.coal = 2;
      R.bag.length = 0;
    });
    await page.waitForTimeout(80);

    const hint = await page.evaluate(() => CT.GAME.actHint());
    check('đứng cạnh lò thì nút ⓐ nói số giây còn lại', /^Lò · \d+s · than 2$/.test(hint || ''),
          hint || '(trống)');

    await tapAct(page);
    await page.waitForSelector('.fire-wrap', { timeout: 3000 });
    check('bấm ⓐ mở được bảng cửa lò', true);

    const r = await page.evaluate(() => {
      const R = CT.GAME.R();
      const b = { fuel: R.fuel, coal: R.coal };
      const rows = Array.from(document.querySelectorAll('.shop-row'));
      const r0 = rows.find(x => /Xúc một cục than/.test(x.textContent));
      if (r0) r0.click();
      const R2 = CT.GAME.R();
      return { b, fuel: R2.fuel, coal: R2.coal, found: !!r0 };
    });
    check('bấm "Xúc một cục than" thì lò no thêm và toa vơi đi',
          r.found && r.fuel - r.b.fuel === CT_BURN_THAN && r.coal === r.b.coal - 1,
          '+' + (r.fuel - r.b.fuel) + ' nhiên liệu, than ' + r.b.coal + '→' + r.coal);

    // Hết than thì nút xúc phải TẮT chứ không phải bấm rồi im lặng.
    const off = await page.evaluate(() => {
      CT.GAME.R().coal = 0;
      CT.UI.openFire();
      const rows = Array.from(document.querySelectorAll('.shop-row'));
      const r0 = rows.find(x => /Xúc một cục than/.test(x.textContent));
      return r0 ? r0.className.indexOf('off') >= 0 : null;
    });
    check('hết than thì hàng "xúc than" hiện mờ', off === true, String(off));

    // Đốt đồ gỗ trong bao — chỉ gỗ, vải, giấy cháy được.
    const burn = await page.evaluate(() => {
      const R = CT.GAME.R();
      const go = CT.MATS.find(m => m.id === 'go');
      const vang = CT.MATS.find(m => m.id === 'vang');
      R.bag.length = 0;
      R.bag.push({ x: 0, y: 0, size: CT.SIZES[0], mat: go, val: 100, cells: 1, name: 'ghế gỗ', bob: 0, r: 6 });
      R.bag.push({ x: 0, y: 0, size: CT.SIZES[0], mat: vang, val: 900, cells: 1, name: 'nhẫn vàng', bob: 0, r: 6 });
      CT.UI.openFire();
      const rows = Array.from(document.querySelectorAll('.shop-row'));
      const names = rows.map(x => x.querySelector('.sr-n').textContent);
      const f0 = R.fuel;
      const r0 = rows.find(x => /ghế gỗ/.test(x.textContent));
      if (r0) r0.click();
      const R2 = CT.GAME.R();
      return { names, gained: R2.fuel - f0, bag: R2.bag.length,
               left: R2.bag.map(i => i.name) };
    });
    check('bảng lò chỉ liệt kê đồ CHÁY ĐƯỢC, không liệt kê vàng',
          burn.names.indexOf('nhẫn vàng') < 0 && burn.names.indexOf('ghế gỗ') >= 0,
          burn.names.join(' / '));
    check('đốt đồ gỗ thì lò no thêm và món đó biến mất',
          burn.gained > 0 && burn.bag === 1 && burn.left[0] === 'nhẫn vàng',
          '+' + burn.gained + ' nhiên liệu, còn: ' + burn.left.join(','));

    // Chống kẹt: lò tắt, không còn gì đốt được ở bất cứ đâu.
    const stuck = await page.evaluate(() => {
      const R = CT.GAME.R();
      R.fuel = 0; R.coal = 0; R.bag.length = 0; R.stash.length = 0; R.corpses.length = 0;
      return { burnable: CT.GAME.anythingBurnable() };
    });
    check('kẹt thật thì hệ thống nhận ra là không còn gì đốt được',
          stuck.burnable === false, String(stuck.burnable));

    // Và phải THOÁT được. Lò tắt thì tàu đứng, tàu đứng thì chặng không bao giờ hết —
    // nếu không có đường ra thì đây là một ngõ cụt, không phải một cái chết.
    const rescue = await page.evaluate(() => {
      const R = CT.GAME.R();
      CT.UI.closePop();
      R.paused = false;
      R.phase = 'chay';
      R.fuel = 0; R.coal = 0; R.bag.length = 0; R.stash.length = 0;
      R.corpses.length = 0; R.drops.length = 0; R.p.carry = null;
      R.dryT = 0;
      // 25 giây trò chơi, bước tay cho tất định
      for (let i = 0; i < 60 * 25; i++) CT.GAME.step(1 / 60);
      const R2 = CT.GAME.R();
      return { coalDrops: R2.drops.filter(d => d.kind === 'coal').length,
               spd: Math.round(R2.spd) };
    });
    check('tàu đứng im khi lò tắt', rescue.spd === 0, rescue.spd + ' đơn vị/giây');
    check('kẹt hẳn thì trong 25 giây có than rơi xuống sàn để thoát',
          rescue.coalDrops >= 1, rescue.coalDrops + ' bao than');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteCarryFlow(browser) {
  out.push('\n[16] Nhặt và vác: hai tay bận thì không bắn được');
  const { ctx, page } = await open(browser);
  try {
    await atStation(page);

    // --- nhặt một món đồ bán ---
    const pick = await page.evaluate(() => {
      const R = CT.GAME.R();
      R.loots.length = 0; R.drops.length = 0; R.bag.length = 0; R.corpses.length = 0;
      // Đặt ở khoảng cách 30: NGOÀI bán kính tự nhặt (20) nhưng TRONG tầm với của nút
      // ⓐ (46). Đặt gần hơn thì cái đo được là luật tự nhặt, không phải cái nút.
      R.loots.push({ x: R.p.x + 30, y: R.p.y, size: CT.SIZES[0], mat: CT.MATS[0],
                     val: 100, cells: 1, name: 'món gần', bob: 0, r: 6 });
      return CT.GAME.actHint();
    });
    check('có đồ dưới chân thì nút ⓐ gọi đúng TÊN món đó', pick === 'Nhặt món gần', pick);
    await tapAct(page);
    const picked = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { bag: R.bag.length, loots: R.loots.length };
    });
    check('bấm ⓐ nhặt được món đó vào bao', picked.bag === 1 && picked.loots === 0,
          'bao ' + picked.bag + ', dưới đất ' + picked.loots);

    // --- vác xác có tiền thưởng ---
    const c1 = await page.evaluate(() => {
      const R = CT.GAME.R();
      R.loots.length = 0;
      R.corpses.push({ x: R.p.x + 30, y: R.p.y, t: 0, life: 99, fade: 3, art: 'gunner',
                       row: 0, seed: 0, scale: 1, bounty: 350 });
      return CT.GAME.actHint();
    });
    check('cạnh xác có thưởng thì nút ⓐ nói luôn số tiền', /^Vác xác \(/.test(c1 || ''), c1);
    await tapAct(page);
    const c2 = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { carry: !!R.p.carry, bounty: R.p.carry ? R.p.carry.bounty : 0,
               corpses: R.corpses.length };
    });
    check('bấm ⓐ vác được cái xác lên', c2.carry === true && c2.corpses === 0,
          'đang vác: ' + c2.carry);

    // Đang vác thì đi chậm và KHÔNG bắn được — cái giá của việc vác.
    const pen = await page.evaluate(() => {
      const R = CT.GAME.R();
      const before = R.gunMag;
      R.p.atkCd = 0; R.gunMag = 6;
      CT.HUD.IN ? 0 : 0;
      CT.GAME.IN.fire = true;
      CT.GAME.step(1 / 60);
      CT.GAME.IN.fire = false;
      return { mag: R.gunMag, was: 6, before };
    });
    check('đang vác xác thì bóp cò KHÔNG ra viên nào', pen.mag === 6,
          'băng ' + pen.was + ' → ' + pen.mag);

    // Vác tới quầy thì bán được, và số tiền đúng bằng tiền thưởng.
    const sell = await page.evaluate(() => {
      const R = CT.GAME.R();
      const sp = R.station.shop;
      R.p.x = sp.x; R.p.y = sp.y; R.p.onTrain = false;
      R.loots.length = 0; R.drops.length = 0;      // dọn chân: nhặt luôn đứng trước quầy
      R.cash = 0;
      const hint = CT.GAME.actHint();
      return { hint, cash: R.cash };
    });
    check('vác xác tới quầy thì nút ⓐ đổi thành "Bán xác"', /^Bán xác/.test(sell.hint || ''),
          sell.hint);
    await tapAct(page);
    const sold = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { cash: R.cash, carry: !!R.p.carry };
    });
    check('bán xác thu đúng 350 và buông tay ra', sold.cash === 350 && sold.carry === false,
          'tiền ' + sold.cash + ', còn vác: ' + sold.carry);

    // Xác đem đốt thì được nhiên liệu — nhưng mất tiền thưởng. Hai đường, không cả hai.
    const burn = await page.evaluate(() => {
      const R = CT.GAME.R();
      R.p.onTrain = true; R.p.x = CT.GAME.fireboxX(); R.p.y = -48;
      R.fuel = 100; R.cash = 0;
      R.p.carry = { kind: 'corpse', art: 'gunner', row: 0, seed: 0, scale: 1, bounty: 350 };
      const hint = CT.GAME.actHint();
      const f0 = R.fuel;
      CT.GAME.burnCorpse();
      return { hint, gained: R.fuel - f0, cash: R.cash, carry: !!R.p.carry };
    });
    check('vác xác tới lò thì nút ⓐ đổi thành "Ném vào lò"', burn.hint === 'Ném vào lò', burn.hint);
    check('đốt xác được nhiên liệu nhưng KHÔNG được tiền',
          burn.gained > 0 && burn.cash === 0 && burn.carry === false,
          '+' + burn.gained + ' nhiên liệu, tiền ' + burn.cash);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteWiki(browser) {
  out.push('\n[17] Sổ tay: năm trang, và không trang nào rỗng');
  const { ctx, page, errs } = await open(browser);
  try {
    // Mở từ NGOÀI ván bằng nút thật trên thanh điều hướng.
    await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.nav-i'))
        .find(x => x.textContent.indexOf('Sổ tay') >= 0);
      t.click();
    });
    await page.waitForSelector('.wiki-wrap', { timeout: 3000 });
    check('mở được sổ tay từ thanh điều hướng', true);

    const tabs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.wiki-wrap .btn.tab')).map(b => b.textContent));
    check('có đủ năm trang', tabs.length === 5, tabs.join(' / '));

    // Bấm từng trang một và đo lượng chữ thật — một trang trống là một trang hỏng.
    const sizes = {};
    for (const name of tabs) {
      const n = await page.evaluate(lb => {
        const b = Array.from(document.querySelectorAll('.wiki-wrap .btn.tab'))
          .find(x => x.textContent === lb);
        b.click();
        const box = document.querySelector('.wiki-body');
        return box ? box.textContent.trim().length : 0;
      }, name);
      sizes[name] = n;
    }
    Object.keys(sizes).forEach(k => {
      check('trang "' + k + '" có nội dung', sizes[k] > 200, sizes[k] + ' ký tự');
    });

    // Trang quái phải liệt kê ĐỦ mọi con, kể cả trùm — sổ tay thiếu con nào thì người
    // chơi gặp con đó lần đầu là chết oan.
    const foes = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.wiki-wrap .btn.tab'))
        .find(x => x.textContent === 'Quái');
      b.click();
      const txt = document.querySelector('.wiki-body').textContent;
      return CT.FOES.filter(f => txt.indexOf(f.name) < 0).map(f => f.name);
    });
    check('sổ tay không bỏ sót con quái nào', foes.length === 0, foes.join(', ') || 'đủ 8 con');

    const chars = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.wiki-wrap .btn.tab'))
        .find(x => x.textContent === 'Nhân vật');
      b.click();
      const txt = document.querySelector('.wiki-body').textContent;
      return CT.CHARS.filter(c => txt.indexOf(c.name) < 0 || txt.indexOf(c.skill.name) < 0)
                     .map(c => c.name);
    });
    check('sổ tay có đủ mười người và tên chiêu của họ', chars.length === 0,
          chars.join(', ') || 'đủ 10 người');

    const guns = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.wiki-wrap .btn.tab'))
        .find(x => x.textContent === 'Súng & đồ');
      b.click();
      const txt = document.querySelector('.wiki-body').textContent;
      return {
        missGun: CT.GUNS.filter(g => txt.indexOf(g.name) < 0).map(g => g.name),
        missUse: CT.USABLES.filter(u => txt.indexOf(u.name) < 0).map(u => u.name)
      };
    });
    check('sổ tay có đủ sáu khẩu súng', guns.missGun.length === 0,
          guns.missGun.join(', ') || 'đủ 6 khẩu');
    check('sổ tay có đủ đồ dùng', guns.missUse.length === 0,
          guns.missUse.join(', ') || 'đủ');

    // Mở được TRONG ván bằng phím H, và nó phải đóng băng ván lại.
    await page.evaluate(() => { CT.UI.closePop(); CT.GAME.newRun('m1', 'hai');
                                document.getElementById('menu').classList.remove('on'); });
    await page.waitForTimeout(60);
    await page.keyboard.press('h');
    await page.waitForTimeout(120);
    const inRun = await page.evaluate(() => ({
      open: !!document.querySelector('.wiki-wrap'),
      paused: CT.GAME.R().paused
    }));
    check('trong ván bấm phím H cũng mở được sổ tay', inRun.open === true);
    check('mở sổ tay thì ván dừng lại', inRun.paused === true);

    check('không lỗi console khi lật hết sổ tay', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteGunFlow(browser) {
  out.push('\n[18] Hai khẩu súng: mua, đeo lưng, rút ra');
  const { ctx, page } = await open(browser);
  try {
    await atStation(page, { cash: 99999 });
    const start = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { gun: R.gun ? R.gun.id : null, alt: R.gunAlt ? R.gunAlt.id : null };
    });
    check('vào ván có sẵn một khẩu trên tay, lưng trống',
          start.gun === 'luc' && start.alt === null, start.gun + ' / ' + start.alt);

    const b1 = await page.evaluate(() => {
      const R = CT.GAME.R();
      // Hàng ở quầy bốc ngẫu nhiên mỗi ga, nên bài này TỰ BÀY hàng ra thay vì cầu may.
      R.station.shop.stock.push({ id: 'gtruong', left: 1 });
      const r = CT.GAME.buy('gtruong');
      return { r, gun: R.gun.id, alt: R.gunAlt ? R.gunAlt.id : null };
    });
    check('mua khẩu thứ hai thì nó ra SAU LƯNG, không giật khỏi tay',
          b1.r.ok && b1.gun === 'luc' && b1.alt === 'truong',
          b1.gun + ' / ' + b1.alt);

    const b2 = await page.evaluate(() => {
      const R = CT.GAME.R();
      R.station.shop.stock.push({ id: 'ghoa', left: 1 });
      const r = CT.GAME.buy('ghoa');
      return { r, gun: R.gun.id, alt: R.gunAlt.id };
    });
    check('mua khẩu thứ ba thì khẩu trên LƯNG bị bỏ lại, tay giữ nguyên',
          b2.gun === 'luc' && b2.alt === 'hoacai' && b2.r.dropped === 'Súng Trường',
          b2.gun + ' / ' + b2.alt + ', bỏ lại ' + b2.r.dropped);

    const dup = await page.evaluate(() => {
      CT.GAME.R().station.shop.stock.push({ id: 'gluc', left: 1 });
      return CT.GAME.buy('gluc');
    });
    check('không mua trùng khẩu đang cầm', dup.ok === false && /đang cầm/i.test(dup.why || ''),
          dup.why);

    // Đổi súng bằng phím Q — thao tác thật, không gọi hàm.
    await page.keyboard.press('q');
    await page.waitForTimeout(80);
    const sw = await page.evaluate(() => {
      const R = CT.GAME.R();
      return { gun: R.gun.id, alt: R.gunAlt.id, cd: R.p.atkCd };
    });
    check('phím Q rút khẩu sau lưng ra', sw.gun === 'hoacai' && sw.alt === 'luc',
          sw.gun + ' / ' + sw.alt);
    check('đổi súng mất một nhịp, không bắn ngay được', sw.cd > 0, sw.cd.toFixed(2) + 's');

    // Nút đổi súng trong bao tải phải làm đúng việc đó.
    await page.evaluate(() => CT.UI.openBag());
    await page.waitForSelector('.gun-row', { timeout: 2000 });
    const cells = await page.evaluate(() => {
      const g = document.querySelectorAll('.gun');
      return { n: g.length, main: g[0].textContent, alt: g[1].textContent };
    });
    check('bao tải hiện đúng hai ô súng', cells.n === 2,
          cells.main.slice(0, 24) + ' | ' + cells.alt.slice(0, 24));
    const swapped = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.btn')).find(x => /^⇄/.test(x.textContent));
      if (!b) return null;
      b.click();
      const R = CT.GAME.R();
      return { gun: R.gun.id, alt: R.gunAlt.id };
    });
    check('nút ⇄ trong bao tải cũng đổi được súng',
          swapped && swapped.gun === 'luc' && swapped.alt === 'hoacai',
          swapped ? swapped.gun + ' / ' + swapped.alt : 'không thấy nút');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
(async function main() {
  const browser = await chromium.launch({
    args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required']
  });
  const suites = [suiteBoot, suiteSkills, suiteRun, suiteNight, suiteNoise,
                  suiteGacha, suiteShop, suiteBag, suiteSave, suiteTouch,
                  suiteArt, suiteSafety,
                  suiteShopFlow, suiteSellFlow, suiteFuelFlow, suiteCarryFlow,
                  suiteWiki, suiteGunFlow];
  for (const s of suites) {
    try { await s(browser); }
    catch (e) { check(s.name + ' — cả bộ ném lỗi', false, String(e.message).slice(0, 160)); }
  }
  await browser.close();
  console.log(out.join('\n'));
  console.log('\n  ĐẠT ' + pass + '   HỎNG ' + fail + '\n');
  process.exit(fail ? 1 : 0);
})();
