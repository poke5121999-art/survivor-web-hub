/*
 * Tốc Độ: Gara, Cửa Hàng, Kỹ Năng, Nhiệm Vụ, Thành Tựu (js/ui/garage.js).
 * Mở từng tab ở 1366×650 và 844×390 (mọi thứ trong khung, nút ≥ 44 px, elementFromPoint trúng nút), chụp ảnh;
 * rồi kiểm mua xe, thiếu xu, nâng kỹ năng, nhiệm vụ sau một trận tua nhanh, nhận thưởng.
 *   node test/toc-do-garage.js        TD_URL=<gốc> node test/toc-do-garage.js   (Pages)
 */
'use strict';
const T = require('./toc-do-lib');

const TABS = ['cars', 'shop', 'skills', 'quests', 'ach'];

// Trong trình duyệt: mỗi nút cuộn vào tầm nhìn rồi đo; trả danh sách lỗi.
function layout() {
  const bad = [], W = innerWidth, H = innerHeight;
  const inside = (r) => r.left >= -0.5 && r.top >= -0.5 && r.right <= W + 0.5 && r.bottom <= H + 0.5;
  const gr = document.querySelector('.gr');
  if (!gr) return ['không có .gr'];
  for (const c of gr.querySelectorAll('.gtop, .gpanel, .gstrip, .gshop, .gskills, .gpage, .gcta .gbtn')) {
    const r = c.getBoundingClientRect();
    if (!inside(r)) bad.push('khung ngoài màn: ' + c.className + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
  }
  for (const b of gr.querySelectorAll('button')) {
    b.scrollIntoView({ block: 'center', inline: 'center' });
    const r = b.getBoundingClientRect(), n = (b.dataset.tab || b.dataset.car || b.dataset.node || b.dataset.paint || b.className) + '';
    if (r.height < 43.5 || r.width < 43.5) bad.push('nút nhỏ: ' + n + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    if (!inside(r)) { bad.push('nút ngoài màn: ' + n); continue; }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(hit === b || b.contains(hit))) bad.push('nút bị che: ' + n);
  }
  return bad;
}

(async () => {
  const srv = await T.serve(), br = await T.browser();
  const { page, problems } = await T.open(br, srv.base, 'index.html');
  const until = async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 250 }); return true; } catch (e) { return false; } };
  T.check('sảnh mở', await until(() => window.TD && TD.main && TD.main.state === 'lobby', null, 90000));
  // Bản lưu đủ xu và cấp để mở hết các màn.
  await page.evaluate(() => { const d = TD.save.d; d.coins = 50000; d.xp = 5000; d.owned = null; d.skills = { 'so.run': 1, 'cao.pump': 4 }; TD.save.save(); });
  console.log('hạng xe, giá, thông số');
  const lit = await page.evaluate(() => ({ s: TD.garage.classOf('55'), a: TD.garage.classOf('284'), b: TD.garage.classOf('16'), c: TD.garage.classOf('04'),
    p55: TD.garage.priceOf('55'), p175: TD.garage.priceOf('175'), own: TD.garage.ownedIds().join(','),
    top: TD.garage.stats('55', { skills: {} }).top.toFixed(2) }));
  T.check('hạng S/A/B/C theo tổng chỉ số', lit.s === 'S' && lit.a === 'A' && lit.b === 'B' && lit.c === 'C', JSON.stringify(lit));
  T.check('giá xe 55 = 14400, xe 175 = 5400', lit.p55 === 14400 && lit.p175 === 5400);
  T.check('bộ xe khởi đầu 04, 06, 16', lit.own === '16,04,06' || lit.own === '04,06,16', lit.own);
  T.check('tốc độ đường trường xe 55 = 203.94 km/h', lit.top === '203.94');

  for (const vp of [{ width: 1366, height: 650 }, { width: 844, height: 390 }]) {
    const tag = vp.width + 'x' + vp.height;
    console.log(tag);
    await page.setViewportSize(vp);
    for (const tab of TABS) {
      await page.evaluate((t) => { TD.garage.open(t); }, tab);
      await page.waitForTimeout(tab === 'cars' || tab === 'shop' ? 1500 : 300);
      const bad = await page.evaluate(layout);
      T.check(tab + ' ' + tag + ': trong khung, nút ≥ 44 px, không bị che', bad.length === 0, bad.slice(0, 4).join(' | '));
      await page.evaluate(() => document.querySelectorAll('.gr [data-keep]').forEach((k) => { k.scrollTop = 0; k.scrollLeft = 0; }));
      await T.shot(page, 'garage-' + tab + '-' + tag);
    }
  }
  await page.setViewportSize({ width: 1366, height: 650 });

  console.log('xe và sơn');
  await page.evaluate(() => TD.garage.open('cars'));
  await page.click('.gcar[data-car="16"]');
  T.check('bấm thẻ xe đổi xe xem', await page.evaluate(() => document.querySelector('.ghead h2').textContent === TD.CARS['16'].name));
  await page.click('.gsw[data-paint="2"]');
  T.check('chọn sơn lưu vào bản lưu', await page.evaluate(() => TD.save.d.paint['16'] === 2));
  await page.click('[data-g="drive"]');
  T.check('Lái ngay chọn xe và về sảnh', await page.evaluate(() => TD.save.d.car === '16' && !document.querySelector('.gr') && !!document.querySelector('#ui .lobby') && TD.main.state === 'lobby'));

  console.log('mua xe');
  await page.evaluate(() => { TD.save.d.coins = 6000; TD.garage.open('shop'); });
  await page.click('.gshopcard[data-car="175"] [data-buy]');
  T.check('hộp xác nhận hiện', await page.evaluate(() => !!document.querySelector('.gmodal')));
  await page.click('[data-g="confirm"]');
  const bought = await page.evaluate(() => ({ coins: TD.save.d.coins, owns: TD.garage.owns('175'), card: !!document.querySelector('.gshopcard[data-car="175"] .gown') }));
  T.check('mua xe 175: xu 6000 → 600, xe thuộc bản lưu', bought.coins === 600 && bought.owns && bought.card, JSON.stringify(bought));
  await page.click('.gshopcard[data-car="55"] [data-buy]');
  await page.click('[data-g="confirm"]');
  const poor = await page.evaluate(() => ({ coins: TD.save.d.coins, owns: TD.garage.owns('55'), warn: (document.querySelector('.gwarn') || {}).textContent }));
  T.check('thiếu xu: không mua, hiện thông báo', poor.coins === 600 && !poor.owns && /Không đủ xu/.test(poor.warn), JSON.stringify(poor));
  await page.click('[data-g="cancel"]');
  await page.click('[data-filter="S"]');
  T.check('lọc hạng S chỉ còn xe S', await page.evaluate(() => [...document.querySelectorAll('.gshopcard')].map((c) => c.dataset.car).join() === '55'));
  const direct = await page.evaluate(() => TD.garage.buy('175'));
  T.check('mua lại xe đã có bị từ chối', direct.ok === false);

  console.log('kỹ năng');
  const sk = await page.evaluate(() => {
    const me = { carId: '55' }, d = TD.save.d, out = {};
    d.skills = {}; TD.garage.applySkills(me, d); out.base = (me.p.top * 3.6).toFixed(2); out.coin0 = me.coinMul;
    d.skills = { 'cao.run': 2, 'so.coin': 3, 'trung.gas': 5 }; TD.garage.applySkills(me, d);
    out.top = (me.p.top * 3.6).toFixed(2); out.accel = me.p.accel.toFixed(3); out.coin = me.coinMul.toFixed(2);
    TD.garage.applySkills(me, d); out.again = (me.p.top * 3.6).toFixed(2);   // gọi lặp không cộng dồn
    d.skills = {};
    return out;
  });
  T.check('applySkills: chạy nhanh Cao cấp 2 trên xe S = 203.94 → 204.74 km/h', sk.base === '203.94' && sk.top === '204.74' && sk.again === '204.74', JSON.stringify(sk));
  T.check('applySkills: Tăng Ga 5 cấp = gia tốc xe 55 × 1.02; Tăng Thưởng 3 cấp = ×1.03', sk.accel === (15.5 * 1.08 * 1.02).toFixed(3) && sk.coin === '1.03' && sk.coin0 === 1, JSON.stringify(sk));
  await page.evaluate(() => { TD.save.d.coins = 1000; TD.garage.open('skills'); });
  await page.click('.ghex[data-node="so.run"]');
  await page.click('[data-up="so.run"]');
  let r = await page.evaluate(() => ({ lv: TD.save.d.skills['so.run'], coins: TD.save.d.coins }));
  T.check('nâng Chạy Nhanh-Sơ cấp 1: tốn 100, xu 1000 → 900', r.lv === 1 && r.coins === 900, JSON.stringify(r));
  await page.click('[data-up="so.run"]');
  r = await page.evaluate(() => ({ lv: TD.save.d.skills['so.run'], coins: TD.save.d.coins }));
  T.check('cấp 2 tốn 200: xu 900 → 700', r.lv === 2 && r.coins === 700, JSON.stringify(r));
  await page.evaluate(() => { TD.save.d.coins = 50; });
  r = await page.evaluate(() => TD.garage.upgrade('so.run'));
  T.check('thiếu xu không nâng được', r.ok === false && /Không đủ xu|không đủ xu/.test(r.why), r.why);
  await page.evaluate(() => { TD.save.d.xp = 0; TD.save.d.coins = 99999; });
  r = await page.evaluate(() => TD.garage.upgrade('cao.run'));
  T.check('hàng Cao khóa dưới Lv20', r.ok === false && /cấp 20/.test(r.why), r.why);
  await page.evaluate(() => { TD.save.d.xp = 5000; });

  console.log('nhiệm vụ sau một trận');
  await page.evaluate(() => { const d = TD.save.d; d.quests = { day: 'cũ', prog: { races: 2 }, done: { races: true } }; d.totals = { races: 0, drifts: 0, boosts: 0, items: 0, hits: 0, km: 0 }; d.skills = { 'so.coin': 5 }; d.coins = 0; d.races = 0; TD.save.save(); });
  const day = await page.evaluate(() => { const q = TD.garage.quests(); return { n: q.length, races: q[0].prog, claimed: q[0].claimed, day: TD.save.d.quests.day === TD.garage.dayKey() }; });
  T.check('sang ngày mới xoá tiến độ', day.n === 6 && day.races === 0 && !day.claimed && day.day, JSON.stringify(day));
  await page.evaluate(() => { TD.save.d.quests.prog.races = 2; TD.save.d.track = Object.keys(TD.TRACKS)[0]; TD.TRACKS[TD.save.d.track].laps = 1; TD.main.startRace({ mode: 'speed' }); });
  T.check('vào trận', await until(() => TD.main.state === 'race' && TD.main.race, null, 120000));
  // Máy ảo vẽ phần mềm chạy ~0,2 s mô phỏng mỗi giây thật nên một vòng 4,8 km không kịp: đặt xe mình ngay trước vạch đích
  // (vòng 1 của 1 vòng, checkpoint cuối) rồi để bot lái qua vạch. Chỉ là lối tắt của bài kiểm, luật về đích vẫn do Race chạy.
  await page.evaluate(() => {
    const R = TD.main.race, T = R.T, me = TD.main.me;
    TD.main.introT = 99; TD.main.timeScale = 8;
    let b = T.resets[0]; for (const r of T.resets) if (r.s > b.s) b = r;
    me.lap = 1; me.lastCp = b.cp; TD.Race.respawn(R, me, 'test', b);
    me.ctrl = 'bot'; TD.Bot.init(me, R, 0.97);
  });
  T.check('về đích và chốt kết quả', await until(() => TD.main.fin, null, 120000));
  const after = await page.evaluate(() => {
    const d = TD.save.d, F = TD.main.fin, q = TD.garage.quests();
    return { races: q[0].prog, top3: q[1].prog, drift: q[2].prog, drifts: F.stats.drifts, boost: q[3].prog, boosts: F.stats.boosts, tot: d.totals.races, km: d.totals.km > 0,
      place: F.place, bonus: F.reward, base: [0, 300, 220, 160, 120, 90, 60][F.place] || 50, cards: F.cards.length, quest: F.cards.some((c) => /Nhiệm vụ hoàn thành/.test(c)) };
  });
  T.check('nhiệm vụ "3 trận" 2 → 3 kèm thẻ hoàn thành, tổng số trận +1', after.races === 3 && after.tot === 1 && after.quest, JSON.stringify(after));
  T.check('drift/phun trong nhiệm vụ khớp thống kê trận', after.drift === Math.min(30, after.drifts) && after.boost === Math.min(10, after.boosts), JSON.stringify(after));
  T.check('Tăng Thưởng 5 cấp: xu thưởng = gốc × 1.05 làm tròn', after.bonus === after.base + Math.round(after.base * 0.05), JSON.stringify(after));
  T.check('top 3 chỉ tính khi về trong top 3', after.top3 === (after.place <= 3 ? 1 : 0), 'hạng ' + after.place);

  console.log('nhận thưởng');
  await page.evaluate(() => { TD.main.timeScale = 1; TD.main.toLobby(); });
  T.check('về sảnh', await until(() => TD.main.state === 'lobby', null, 60000));
  await page.evaluate(() => { const d = TD.save.d; d.quests.prog.races = 3; d.coins = 100; d.xp = 5000; d.ach = {}; d.races = 12; TD.garage.open('quests'); });
  const badge = await page.evaluate(() => TD.garage.badges());
  T.check('chấm đỏ: 1 nhiệm vụ, 1 thành tựu (10 trận)', badge.quests === 1 && badge.ach >= 1, JSON.stringify(badge));
  await page.click('[data-claimq="races"]');
  r = await page.evaluate(() => ({ coins: TD.save.d.coins, xp: TD.save.d.xp, done: TD.save.d.quests.done.races, badge: TD.garage.badges().quests }));
  T.check('nhận nhiệm vụ: xu 100 → 350, XP +40, hết chấm đỏ', r.coins === 350 && r.xp === 5040 && r.done === true && r.badge === 0, JSON.stringify(r));
  const again = await page.evaluate(() => TD.garage.claimQuest('races'));
  T.check('không nhận hai lần', again.ok === false);
  await page.evaluate(() => TD.garage.open('ach'));
  await page.click('[data-claima="races"]');
  r = await page.evaluate(() => ({ coins: TD.save.d.coins, got: TD.save.d.ach.races }));
  T.check('nhận thành tựu Tay Đua bậc 1: +300 xu', r.coins === 650 && r.got === 1, JSON.stringify(r));
  await page.click('[data-g="back"]');
  T.check('Về sảnh từ màn phụ', await page.evaluate(() => !document.querySelector('.gr') && TD.main.state === 'lobby'));

  T.check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  await br.close(); srv.close();
  T.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
