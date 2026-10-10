/*
 * Tốc Độ: Xưởng / chế tạo (js/ui/gacha.js) và kho xe mở rộng (data/cars.js).
 * - Node: xác suất với RNG gieo hạt (số lần ra cố định), bảo đảm Cực Phẩm đúng lần 30, lượt 10 lần có Hiếm,
 *   trùng đổi mảnh, trả bằng vé trước rồi tới xu, bản lưu rác được chỉnh lại, vé thưởng sau trận.
 * - Trình duyệt: nút Xưởng ở sảnh, chế tạo 1 lần và 10 lần bằng nút thật, xe sở hữu tăng, màn nhận ở 1366×650 và 844×390.
 * Chạy: node test/toc-do-gacha.js   (trình duyệt qua btest.sh). Ảnh: $TD_SHOTS.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./toc-do-lib');

// ---------------- Node: nạp data/cars.js + garage.js + gacha.js vào window giả ----------------
function load() {
  const sandbox = { console };
  const ctx = vm.createContext(sandbox);
  sandbox.globalThis = sandbox; sandbox.window = sandbox;
  sandbox.TD = { racePlugins: [], lobby: { add() {} }, MODES: { speed: {} }, TRACKS: { t: {} }, DRIVERS: { nam: {} },
    save: { d: { coins: 0, owned: null, car: '04', driver: 'nam', track: 't', mode: 'speed' }, norms: [], save() {} }, audio: null };
  for (const f of ['data/cars.js', 'js/ui/garage.js', 'js/ui/gacha.js']) vm.runInContext(fs.readFileSync(path.join(T.GAME, f), 'utf8'), ctx, { filename: f });
  return sandbox.TD;
}
// mulberry32: dãy cố định theo hạt
function seeded(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function nodePart() {
  console.log('xe: kho mở rộng');
  const TD = load(), X = TD.gacha, ids = Object.keys(TD.CARS);
  T.check('có ít nhất 16 xe (8 + 8 xe mới)', ids.length >= 16, ids.length);
  const bad = ids.filter((id) => { const c = TD.CARS[id]; return !(c.glb && c.wheels.length === 4 && c.size && c.driverMount && ['speed', 'accel', 'handling', 'drift', 'nitro'].every((k) => c.stats[k] >= 1 && c.stats[k] <= 10)); });
  T.check('mọi xe đủ glb, 4 bánh, kích thước, ghế, 5 chỉ số 1..10', bad.length === 0, bad.join(','));
  const classes = {}; ids.forEach((id) => { const k = TD.garage.classOf(id); classes[k] = (classes[k] || 0) + 1; });
  T.check('đủ hạng S, A, B, C trong kho xe', classes.S >= 2 && classes.A >= 3 && classes.B >= 1 && classes.C >= 1, JSON.stringify(classes));
  const missing = ids.filter((id) => !fs.existsSync(path.join(T.GAME, TD.CARS[id].glb)) || (TD.CARS[id].paintMaps && !fs.existsSync(path.join(T.GAME, TD.CARS[id].paintMaps.base))));
  T.check('tệp glb và ảnh sơn của mọi xe có trên đĩa', missing.length === 0, missing.join(','));

  console.log('xác suất (RNG gieo hạt 20261010)');
  for (const [pool, expect] of [['car', [14169, 4680, 1151]], ['gear', [13120, 5458, 1422]], ['mat', [14733, 3984, 1283]]]) {
    const rng = seeded(20261010), s = { pity: { car: 0, gear: 0, mat: 0 } }, cnt = [0, 0, 0];
    for (let i = 0; i < 20000; i++) cnt[X.roll(pool, rng, s).tier]++;
    T.check(pool + ': 20000 lần ra ' + expect.join('/') + ' (Thường/Hiếm/Cực Phẩm)', cnt.join('/') === expect.join('/'), cnt.join('/'));
    const p = X.POOLS.find((q) => q.id === pool).rates, top = cnt[2] / 20000;
    T.check(pool + ': tỉ lệ Cực Phẩm từ ' + p[2] + ' tới ' + (p[2] + 0.025) + ' (bảo đảm nâng thêm)', top >= p[2] - 0.01 && top <= p[2] + 0.025, top.toFixed(4));
  }

  console.log('bảo đảm');
  const never = () => 0.9999, s = { pity: { car: 0, gear: 0, mat: 0 } }, tiers = [];
  for (let i = 0; i < 31; i++) tiers.push(X.roll('car', never, s).tier);
  T.check('RNG xui nhất: 29 lần Thường, lần 30 Cực Phẩm, lần 31 lại Thường', tiers.slice(0, 29).every((t) => t === 0) && tiers[29] === 2 && tiers[30] === 0, tiers.join(''));
  T.check('sau Cực Phẩm bộ đếm về 0 (lần 31 = 1)', s.pity.car === 1, s.pity.car);
  TD.save.d.coins = 1e6; TD.save.d.gacha = null; X.norm(TD.save.d);
  const ten = X.pull('mat', 10, never);
  T.check('10 lần luôn có món Hiếm trở lên (RNG xui nhất vẫn ra Hiếm ở lần 10)', ten.ok && ten.results.slice(0, 9).every((r) => r.tier === 0) && ten.results[9].tier === 1, ten.results && ten.results.map((r) => r.tier).join(''));

  console.log('trả phí, trùng, bản lưu');
  const d = TD.save.d; d.gacha = null; X.norm(d); d.coins = 0; d.gacha.tickets = 0;
  const no = X.pull('car', 1, never);
  T.check('hết vé và xu thì từ chối, không mất gì', !no.ok && d.coins === 0 && d.gacha.n === 0, no.why);
  d.gacha.tickets = 3; d.coins = 5000;
  const r1 = X.pull('car', 1, seeded(1));
  T.check('trả bằng vé trước: vé 3 -> 2, xu giữ 5000', r1.ok && r1.paid === 'vé' && d.gacha.tickets === 2 && d.coins === 5000);
  d.gacha.tickets = 0; d.coins = 20000;
  const r2 = X.pull('car', 10, seeded(2));
  T.check('hết vé thì trả 10.800 xu cho 10 lần (mẫu xe không trả xu)', r2.ok && r2.paid === 'xu' && d.coins === 20000 - 10800 && r2.results.length === 10, d.coins);
  d.coins = 20000; d.owned = ['04'];
  const dupItem = { kind: 'car', id: '04' }, sh = d.gacha.shards;
  const g1 = X.grant(dupItem, 0);
  T.check('xe trùng không thêm lần nữa, đổi 5 mảnh', !g1.isNew && g1.shards === 5 && d.gacha.shards === sh + 5 && d.owned.filter((i) => i === '04').length === 1);
  const g2 = X.grant({ kind: 'car', id: '55' }, 2);
  T.check('xe mới vào owned, không có mảnh', g2.isNew && g2.shards === 0 && d.owned.indexOf('55') >= 0);
  const g3 = X.grant({ kind: 'car', id: '55' }, 2);
  T.check('Cực Phẩm trùng = 80 mảnh', !g3.isNew && g3.shards === 80);
  d.gacha.shards = 120;
  const ex = X.exchange();
  T.check('đổi 50 mảnh lấy 1 vé', ex.ok && d.gacha.shards === 70 && d.gacha.tickets === 1, d.gacha.shards + '/' + d.gacha.tickets);
  d.gacha.shards = 49;
  T.check('49 mảnh chưa đổi được', !X.exchange().ok);

  const junk = { gacha: { tickets: -5, shards: 'x', pity: { car: 999, gear: 7.9, zzz: 1 }, n: 3.7, history: ['car:55:2', 'xx', 5, 'pet:00002:0', 'car:55:9'] } };
  X.norm(junk);
  T.check('bản lưu rác: vé 0, mảnh 0, pity bị chặn < 30, lịch sử chỉ giữ dòng hợp lệ',
    junk.gacha.tickets === 0 && junk.gacha.shards === 0 && junk.gacha.pity.car === 29 && junk.gacha.pity.gear === 7 && !('zzz' in junk.gacha.pity) && junk.gacha.n === 3 && junk.gacha.history.join('|') === 'car:55:2|pet:00002:0',
    JSON.stringify(junk.gacha));
  const none = {}; X.norm(none);
  T.check('bản lưu mới: tặng ' + X.START_TICKETS + ' vé', none.gacha.tickets === X.START_TICKETS && none.gacha.history.length === 0);
  T.check('vé sau trận: hạng 1 = 2, hạng 6 = 1, bỏ cuộc = 0, luyện tập = 0', X.ticketsFor(1, false, false) === 2 && X.ticketsFor(6, false, false) === 1 && X.ticketsFor(1, true, false) === 0 && X.ticketsFor(1, false, true) === 0);
  const F = { place: 2, dnf: false, mode: {}, cards: [] }, t0 = TD.save.d.gacha.tickets;
  TD.racePlugins[TD.racePlugins.length - 1].settle(F);
  T.check('plugin settle cộng vé và thêm một thẻ tổng kết', TD.save.d.gacha.tickets === t0 + 2 && F.cards.length === 1 && /\+2 Vé Chế Tạo/.test(F.cards[0]));
}

// ---------------- Trình duyệt ----------------
async function layout(page) {
  return page.evaluate(() => {
    const bad = [], W = innerWidth, H = innerHeight;
    const inside = (r) => r.left >= -0.5 && r.top >= -0.5 && r.right <= W + 0.5 && r.bottom <= H + 0.5;
    for (const c of document.querySelectorAll('.gx .gtop, .gx .gx-pools, .gx .gx-stage, .gx .gx-act')) { const r = c.getBoundingClientRect(); if (!inside(r)) bad.push('khung ngoài màn: ' + c.className); }
    const st = document.querySelector('.gx-stage'), ac = document.querySelector('.gx-act');
    if (st && ac && st.getBoundingClientRect().bottom > ac.getBoundingClientRect().top + 1) bad.push('khung thông tin đè lên nút');
    if (st && st.scrollHeight > st.clientHeight + 1) bad.push('khung thông tin bị cắt (' + st.scrollHeight + ' > ' + st.clientHeight + ')');
    for (const b of document.querySelectorAll('.gx button')) {
      const r = b.getBoundingClientRect(), n = b.dataset.do || b.dataset.pool;
      if (r.height < 43.5 || r.width < 43.5) bad.push('nút nhỏ: ' + n + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
      if (!inside(r)) { bad.push('nút ngoài màn: ' + n); continue; }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === b || b.contains(hit))) bad.push('nút bị che: ' + n);
    }
    return bad;
  });
}

async function browserPart() {
  const srv = await T.serve(), br = await T.browser();
  try {
    const { page, problems } = await T.open(br, srv.base, 'index.html');
    const until = async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 250 }); return true; } catch (e) { return false; } };
    const snap = (name) => page.screenshot({ path: path.join(T.SHOTS, name + '.png'), timeout: 180000 });
    fs.mkdirSync(T.SHOTS, { recursive: true });
    T.check('sảnh mở', await until(() => window.TD && TD.main && TD.main.state === 'lobby', null, 90000));
    await page.evaluate(() => {
      const seed = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      Math.random = seed(777);
      const d = TD.save.d; d.coins = 50000; d.owned = null; d.gacha = { tickets: 12, shards: 0, pity: { car: 0, gear: 0, mat: 0 }, n: 0, history: [] }; TD.save.save();
    });

    for (const vp of [{ width: 1366, height: 650 }, { width: 844, height: 390 }]) {
      const tag = vp.width + 'x' + vp.height;
      console.log(tag);
      await page.setViewportSize(vp);
      await page.evaluate(() => TD.lobby.show());
      await page.waitForTimeout(800);
      const ent = await page.evaluate(() => { const b = document.querySelector('.lb-bar [data-entry="gacha"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), ok: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.height >= 44 }; });
      T.check('thanh dưới sảnh có nút Xưởng trong màn ' + tag, !!ent && /Xưởng/.test(ent.t) && ent.ok, JSON.stringify(ent));
      await page.click('.lb-bar [data-entry="gacha"]');
      T.check('bấm Xưởng mở màn Xưởng', await until(() => !!document.querySelector('.gx .gx-pool')));
      const bad = await layout(page);
      T.check('Xưởng ' + tag + ': trong khung, nút ≥ 44 px, không bị che, không cắt', bad.length === 0, bad.slice(0, 4).join(' | '));
      await snap('gacha-main-' + tag);
      // mẫu khác
      await page.click('[data-pool="gear"]');
      T.check('chọn mẫu PET & Thời Trang đổi tỉ lệ 6%', await page.evaluate(() => /6%/.test(document.querySelector('.gx-info').textContent)));
      await page.click('[data-pool="car"]');
      // 1 lần
      const before = await page.evaluate(() => ({ n: TD.save.d.gacha.n, t: TD.save.d.gacha.tickets, owned: TD.garage.ownedIds().length }));
      await page.click('[data-do="p1"]');
      T.check('chế tạo 1 lần: hiện màn nhận, 1 thẻ', await until(() => document.querySelectorAll('.gx-ov .gx-card').length === 1));
      T.check('1 lần: vé giảm 1, đếm lần tăng 1', await page.evaluate((b) => TD.save.d.gacha.tickets === b.t - 1 && TD.save.d.gacha.n === b.n + 1, before));
      T.check('1 lần: thẻ hiện sau hiệu ứng, có chữ "Chạm vị trí bất kỳ để tiếp tục"', await until(() => document.querySelector('.gx-ov.done .gx-card.in') && /Chạm vị trí bất kỳ/.test(document.querySelector('.gx-tip').textContent), null, 30000));
      await until(() => getComputedStyle(document.querySelector('.gx-ov .gx-card')).opacity === '1', null, 30000);
      await snap('gacha-reveal1-' + tag);
      await page.mouse.click(vp.width / 2, vp.height / 2);
      T.check('chạm để đóng, về màn Xưởng', await until(() => !document.querySelector('.gx-ov') && !!document.querySelector('.gx-pool')));
      // 10 lần
      await page.click('[data-do="p10"]');
      T.check('chế tạo 10 lần: 10 thẻ', await until(() => document.querySelectorAll('.gx-ov .gx-card').length === 10));
      await page.waitForTimeout(1200);
      await page.mouse.click(vp.width / 2, vp.height / 2);   // chạm giữa chừng = bỏ qua hiệu ứng
      T.check('chạm giữa chừng hiện đủ 10 thẻ ngay', await until(() => document.querySelectorAll('.gx-ov.done .gx-card.in').length === 10, null, 15000));
      T.check('10 thẻ hiện rõ sau hiệu ứng (opacity 1, trong màn)', await until(() => [...document.querySelectorAll('.gx-ov .gx-card')].every((c) => { const r = c.getBoundingClientRect(); return getComputedStyle(c).opacity === '1' && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), null, 30000));
      await snap('gacha-reveal10-' + tag);
      const after = await page.evaluate(() => ({ n: TD.save.d.gacha.n, owned: TD.garage.ownedIds().length, hist: TD.save.d.gacha.history.length, cards: [...document.querySelectorAll('.gx-ov .gx-card')].map((c) => c.className.match(/t(\d)/)[1]).join('') }));
      T.check('11 lần đã quay, lịch sử đủ min(30, tổng lần) dòng', after.n === before.n + 11 && after.hist === Math.min(30, after.n), JSON.stringify(after));
      T.check('10 lần có ít nhất một món Hiếm trở lên', /[12]/.test(after.cards), after.cards);
      await page.mouse.click(vp.width / 2, vp.height / 2);
      await until(() => !document.querySelector('.gx-ov'));
      // Cực Phẩm bằng bảo đảm
      await page.evaluate(() => { TD.save.d.gacha.pity.car = 29; TD.save.d.gacha.tickets = 5; TD.save.save(); TD.gacha.open(); });
      await page.click('[data-do="p1"]');
      T.check('lần thứ 30 bảo đảm Cực Phẩm: thẻ tier 2, tiêu đề "Nhận vật phẩm Cực Phẩm"',
        await until(() => document.querySelector('.gx-ov.done .gx-card.t2') && /Cực Phẩm/.test(document.querySelector('.gx-title').textContent), null, 30000));
      await until(() => getComputedStyle(document.querySelector('.gx-ov .gx-card')).opacity === '1', null, 30000);
      await snap('gacha-top-' + tag);
      await page.mouse.click(vp.width / 2, vp.height / 2);
      await until(() => !document.querySelector('.gx-ov'));
      // thiếu vé và xu
      await page.evaluate(() => { TD.save.d.gacha.tickets = 0; TD.save.d.coins = 100; TD.gacha.open(); });
      await page.click('[data-do="p1"]');
      T.check('thiếu vé và xu: báo lỗi, không mở màn nhận', await until(() => /không đủ vé và xu/i.test((document.querySelector('.gmsg') || {}).textContent || '')) && !(await page.$('.gx-ov')));
      await page.evaluate(() => { TD.save.d.gacha.tickets = 12; TD.save.d.coins = 50000; });
      await page.click('[data-do="back"]');
      T.check('về sảnh', await until(() => !!document.querySelector('.lobby')));
    }
    const owned = await page.evaluate(() => ({ now: TD.garage.ownedIds().length, all: Object.keys(TD.CARS).length, saved: TD.save.d.owned }));
    T.check('xe sở hữu tăng so với bộ khởi đầu (3)', owned.now > 3 && Array.isArray(owned.saved) && owned.saved.length === owned.now, JSON.stringify(owned));
    T.check('mọi id xe đã trúng đều có trong TD.CARS (norm không vứt)', await page.evaluate(() => { TD.save.d.owned = TD.garage.ownedIds(); const n = TD.save.d.owned.length; return TD.save.d.owned.every((id) => TD.CARS[id]) && n > 3; }));
    // Ảnh bộ đồ art/outfits/*.webp thuộc nhánh Thời Trang (chưa xuất xong lúc viết); mô hình/ảnh của Xưởng không được 404.
    const outfit404 = problems.filter((p) => /http 404: .*art\/outfits\/\w+\.webp/.test(p)).length;
    let skip = outfit404;   // mỗi 404 ảnh bộ đồ kèm một dòng console không có URL
    const mine = problems.filter((p) => !/http 404: .*art\/outfits\/\w+\.webp/.test(p) && !(skip > 0 && /Failed to load resource: the server responded with a status of 404/.test(p) && skip--));
    T.check('không lỗi trang', mine.length === 0, mine.slice(0, 4).join(' | '));
  } finally { await br.close(); srv.close(); }
}

(async () => {
  nodePart();
  if (!process.env.GACHA_NODE) await browserPart();
  T.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
