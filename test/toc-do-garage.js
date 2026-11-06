/*
 * Tốc Độ: Gara, Cửa Hàng, Kỹ Năng, Nhiệm Vụ, Thành Tựu (js/ui/garage.js).
 * Mở từng tab và tab con ở 1366×650 và 844×390 (mọi thứ trong khung, nút ≥ 44 px, elementFromPoint trúng nút), chụp ảnh;
 * rồi kiểm mua xe, thiếu xu, nâng kỹ năng, nhiệm vụ sau một trận tua nhanh, nhận thưởng, và vòng nhiệm vụ/phúc lợi
 * (reset tuần theo ngày, chuỗi chính tuyến, lịch đăng nhập qua nhiều ngày giả, rương sinh lực, thắng đầu, rương thắng, lên cấp, thẻ mùa).
 *   node test/toc-do-garage.js        TD_URL=<gốc> node test/toc-do-garage.js   (Pages)
 */
'use strict';
const T = require('./toc-do-lib');

const TABS = ['cars', 'shop', 'skills', 'quests', 'ach', 'welfare'];

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
  for (const p of gr.querySelectorAll('.gpage')) if (p.scrollWidth > p.clientWidth + 1) bad.push('trang tràn ngang: ' + p.scrollWidth + ' > ' + p.clientWidth);
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
  page.setDefaultTimeout(180000);   // máy dùng chung có lúc tải rất cao, mặc định 30 s của playwright quá ngắn
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
      // Tab con của Nhiệm Vụ / Phúc Lợi: bấm từng cái, kiểm khung, chụp.
      const subs = await page.evaluate(() => [...document.querySelectorAll('.gr .gsubs [data-sub]')].map((b) => b.dataset.sub));
      for (const sub of subs) {
        await page.click('.gr .gsubs [data-sub="' + sub + '"]');
        const bad2 = await page.evaluate(layout);
        T.check(tab + '/' + sub + ' ' + tag + ': trong khung, nút ≥ 44 px, không bị che', bad2.length === 0, bad2.slice(0, 4).join(' | '));
        await page.evaluate(() => document.querySelectorAll('.gr [data-keep]').forEach((k) => { k.scrollTop = 0; }));
        await T.shot(page, 'garage-' + tab + '-' + sub + '-' + tag);
      }
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
  T.check('lọc hạng S chỉ còn xe S (có xe 55)', await page.evaluate(() => { const got = [...document.querySelectorAll('.gshopcard')].map((c) => c.dataset.car).sort().join(), want = Object.keys(TD.CARS).filter((i) => TD.garage.classOf(i) === 'S').sort().join(); return got === want && got.split(',').indexOf('55') >= 0; }));
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
  T.check('vào trận', await until(() => TD.main.state === 'race' && TD.main.race, null, 300000));
  // Máy ảo vẽ phần mềm chạy ~0,2 s mô phỏng mỗi giây thật nên một vòng 4,8 km không kịp: đặt xe mình ngay trước vạch đích
  // (vòng 1 của 1 vòng, checkpoint cuối) rồi để bot lái qua vạch. Chỉ là lối tắt của bài kiểm, luật về đích vẫn do Race chạy.
  await page.evaluate(() => {
    const R = TD.main.race, T = R.T, me = TD.main.me;
    TD.main.introT = 99; TD.main.timeScale = 8;
    let b = T.resets[0]; for (const r of T.resets) if (r.s > b.s) b = r;
    me.lap = 1; me.lastCp = b.cp; TD.Race.respawn(R, me, 'test', b);
    me.ctrl = 'bot'; TD.Bot.init(me, R, 0.97);
  });
  T.check('về đích và chốt kết quả', await until(() => TD.main.fin, null, 300000));
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
  await page.evaluate(() => { const d = TD.save.d; d.quests.prog.races = 3; d.coins = 100; d.xp = 5000; d.ach = {}; d.races = 12; d.task.chain = 10; TD.garage.open('quests'); });
  await page.click('.gsubs [data-sub="day"]');
  const badge = await page.evaluate(() => TD.garage.badges());
  T.check('chấm đỏ: 1 nhiệm vụ + rương sinh lực 20 (chính tuyến đã xong hết), thành tựu có thể nhận', badge.quests === 2 && badge.ach >= 1, JSON.stringify(badge));
  await page.click('[data-claimq="races"]');
  r = await page.evaluate(() => ({ coins: TD.save.d.coins, xp: TD.save.d.xp, done: TD.save.d.quests.done.races, badge: TD.garage.badges().quests }));
  T.check('nhận nhiệm vụ: xu 100 → 350, XP +40, còn chấm đỏ của rương 20', r.coins === 350 && r.xp === 5040 && r.done === true && r.badge === 1, JSON.stringify(r));
  const again = await page.evaluate(() => TD.garage.claimQuest('races'));
  T.check('không nhận hai lần', again.ok === false);
  await page.evaluate(() => TD.garage.open('ach'));
  await page.click('[data-claima="races"]');
  r = await page.evaluate(() => ({ coins: TD.save.d.coins, got: TD.save.d.ach.races }));
  T.check('nhận thành tựu Tay Đua bậc 1: +300 xu', r.coins === 650 && r.got === 1, JSON.stringify(r));
  await page.click('[data-g="back"]');
  T.check('Về sảnh từ màn phụ', await page.evaluate(() => !document.querySelector('.gr') && TD.main.state === 'lobby'));

  console.log('tuần, chính tuyến, phúc lợi (ngày giả qua TD.garage.now)');
  const fake = (y, m, d) => page.evaluate(([y, m, d]) => { TD.garage.now = () => new Date(y, m - 1, d, 12); }, [y, m, d]);
  const fresh = () => page.evaluate(() => { const d = TD.save.d; d.task = null; d.quests = { day: '', prog: {}, done: {} }; d.coins = 0; d.xp = 0; d.races = 0; d.wins = 0; d.ach = {}; d.skills = {}; d.owned = null; d.rank = { pts: 0, best: 0, streak: 0, games: 0, wins: 0 }; d.totals = { races: 0, drifts: 0, boosts: 0, items: 0, hits: 0, km: 0 }; });
  const mon = await page.evaluate(() => { const k = (y, m, d) => TD.garage.mondayKey(new Date(y, m - 1, d)); return [k(2026, 10, 14), k(2026, 10, 18), k(2026, 10, 19), k(2026, 1, 1)]; });
  T.check('thứ Hai của tuần: T4 14/10 và CN 18/10 → 12/10, T2 19/10 → 19/10, 1/1/2026 → 29/12/2025', mon.join() === '2026-10-12,2026-10-12,2026-10-19,2025-12-29', mon.join());

  await fresh(); await fake(2026, 10, 14);
  r = await page.evaluate(() => {
    const d = TD.save.d, G = TD.garage, out = {};
    G.weekly(); d.task.wp.races = 25;
    out.prog = G.weekly()[0].prog;
    out.claim = G.claimWeekly('races'); out.coins = d.coins; out.xp = d.xp;
    out.again = G.claimWeekly('races').ok;
    G.now = () => new Date(2026, 9, 18, 23);   // Chủ nhật cùng tuần: giữ nguyên
    out.sun = [G.weekly()[0].prog, G.weekly()[0].claimed];
    G.now = () => new Date(2026, 9, 19, 1);    // thứ Hai: xoá
    out.mon = [G.weekly()[0].prog, G.weekly()[0].claimed, d.task.wk];
    return out;
  });
  T.check('tuần: 25/20 trận kẹp ở 20, nhận +800 xu +100 XP, không nhận hai lần', r.prog === 20 && r.claim.ok && r.coins === 800 && r.xp === 100 && !r.again, JSON.stringify(r));
  T.check('tuần: CN 18/10 giữ tiến độ, thứ Hai 19/10 reset về 0 và mở lại', r.sun.join() === '20,true' && r.mon.join() === '0,false,2026-10-19', JSON.stringify(r));

  await fresh(); await fake(2026, 10, 14);
  r = await page.evaluate(() => {
    const d = TD.save.d, G = TD.garage, out = {}, st = () => G.chain().map((c) => c.state[0]).join('');
    out.s0 = st(); out.c0 = G.claimChain().ok;
    d.races = 1; out.ready = G.chain()[0].ready; out.c1 = G.claimChain(); out.coins1 = d.coins; out.s1 = st();
    d.wins = 99; d.task.cnt.tr = 1;   // bước sau chưa tới lượt thì không nhận được dù đủ điều kiện
    out.step2 = G.chain()[1].v; out.c2 = G.claimChain().ok;
    d.task.cnt.ir = 1; out.c3 = G.claimChain(); out.coins3 = d.coins;   // bước 2 +250
    d.skills = { 'so.run': 1 }; d.owned = ['04', '06', '16', '175'];
    out.c4 = G.claimChain().coins; out.c5 = G.claimChain().coins; out.c6 = G.claimChain().coins;   // 3 về nhất, 4 nâng kỹ năng
    out.state = st(); out.v4 = G.chain()[4].v;
    return out;
  });
  T.check('chính tuyến: 10 bước, chỉ bước đầu mở, chưa xong thì không nhận', r.s0 === 'a' + 'l'.repeat(9) && !r.c0, JSON.stringify(r));
  T.check('chính tuyến: trận đầu +200 xu rồi mở bước hai', r.ready && r.c1.ok && r.coins1 === 200 && r.s1 === 'da' + 'l'.repeat(8), JSON.stringify(r));
  T.check('chính tuyến: bước 2 không nhận khi chưa đủ (dù bước sau đã đủ), đủ thì +250 (tổng 450)', r.step2 === 0 && !r.c2 && r.c3.ok && r.coins3 === 450, JSON.stringify(r));
  T.check('chính tuyến: về nhất +300, nâng kỹ năng +300, mua xe (4 xe) +400; bước 6 (drift 100) đang mở', r.c4 === 300 && r.c5 === 300 && r.c6 === 400 && r.state === 'ddddda' + 'l'.repeat(4), JSON.stringify(r));

  await fresh(); await fake(2026, 10, 10);
  r = await page.evaluate(() => {
    const d = TD.save.d, G = TD.garage, out = {};
    const L = () => { const l = G.login(); return [l.streak, l.n, l.got].join('/'); };
    out.d1 = L(); out.early = G.claimLogin(2).ok; out.c1 = G.claimLogin(1).coins; out.coins1 = d.coins; out.again = G.claimLogin(1).ok;
    G.now = () => new Date(2026, 9, 11, 9); out.d2 = L(); out.c2 = G.claimLogin(2).coins; out.coins2 = d.coins;
    G.now = () => new Date(2026, 9, 13, 9); out.gap = L();   // lỡ 12/10: quay về ngày 1
    for (let day = 14; day <= 19; day++) { G.now = () => new Date(2026, 9, day, 9); G.login(); }
    out.d7 = L(); d.coins = 0; d.xp = 0; out.all = [1, 2, 3, 4, 5, 6, 7].map((x) => G.claimLogin(x).coins).join(); out.coins7 = d.coins; out.xp7 = d.xp;
    G.now = () => new Date(2026, 9, 20, 9); out.loop = L();
    G.now = () => new Date(2026, 9, 20, 22); out.same = L();   // cùng ngày: không đổi
    return out;
  });
  T.check('đăng nhập ngày 1: chuỗi 1, không nhảy cóc ngày 2, nhận +200, không nhận hai lần', r.d1 === '1/1/0' && !r.early && r.c1 === 200 && r.coins1 === 200 && !r.again, JSON.stringify(r));
  T.check('ngày kế liền: chuỗi 2, ngày 2 +300 (tổng 500)', r.d2 === '2/2/1' && r.c2 === 300 && r.coins2 === 500, JSON.stringify(r));
  T.check('lỡ một ngày: lịch về ngày 1, chuỗi 1', r.gap === '1/1/0', r.gap);
  T.check('đủ 7 ngày liền: nhận lần lượt 200,300,400,500,600,800,1500 = 4300 xu và 150 XP', r.d7 === '7/7/0' && r.all === '200,300,400,500,600,800,1500' && r.coins7 === 4300 && r.xp7 === 150, JSON.stringify(r));
  T.check('qua ngày thứ 8 đã nhận hết: vòng mới ngày 1, chuỗi 8; cùng ngày không đổi', r.loop === '8/1/0' && r.same === '8/1/0', JSON.stringify(r));

  await fresh(); await fake(2026, 10, 14);
  r = await page.evaluate(() => {
    const d = TD.save.d, G = TD.garage, out = {};
    G.quests(); d.quests.prog = { races: 3, top3: 2, drift: 30 };   // 20 + 20 + 15 = 55 sinh lực
    out.pts = G.actPts(); out.ready = G.chests().filter((c) => c.ready).map((c) => c.at).join();
    out.c60 = G.claimChest(60).ok; out.c40 = G.claimChest(40); out.coins = d.coins; out.again = G.claimChest(40).ok;
    d.quests.prog = { races: 3, top3: 2, drift: 30, boost: 10, items: 5, ranked: 1 };
    out.full = G.actPts(); d.coins = 0; d.xp = 0; out.c100 = G.claimChest(100); out.coins100 = d.coins; out.xp100 = d.xp;
    out.left = G.chests().filter((c) => c.ready).map((c) => c.at).join();
    out.badge = G.badges().quests;
    G.now = () => new Date(2026, 9, 15, 8);
    out.next = [G.actPts(), G.chests().filter((c) => c.claimed).length];
    return out;
  });
  T.check('rương sinh lực: 55 điểm mở mốc 20 và 40; mốc 60 khoá; 40 → +200 xu, không nhận hai lần', r.pts === 55 && r.ready === '20,40' && !r.c60 && r.c40.ok && r.coins === 200 && !r.again, JSON.stringify(r));
  T.check('rương sinh lực: đủ 100 điểm; mốc 100 +700 xu +100 XP; còn 20,60,80 chờ nhận; chấm đỏ = 6 nhiệm vụ + 3 rương', r.full === 100 && r.c100.ok && r.coins100 === 700 && r.xp100 === 100 && r.left === '20,60,80' && r.badge === 9, JSON.stringify(r));
  T.check('sang ngày mới: sinh lực về 0, rương mở lại', r.next.join() === '0,0', r.next.join());

  // Đếm trận bằng dữ liệu settle giả (cùng đường mã với plugin thật): đội+đạo cụ, thắng, rồi DNF, rồi huấn luyện.
  await fresh(); await fake(2026, 10, 14);
  r = await page.evaluate(() => {
    const d = TD.save.d, G = TD.garage, t = () => d.task, out = {};
    const F = (place, dnf) => ({ dnf: !!dnf, place, reward: 300, stats: { drifts: 4, boosts: 2 }, cards: [] });
    const ctx = (mode) => ({ R: { mode, T: { L: 1000 }, laps: 3 }, me: { coinMul: 1 } });
    G.quests(); G.weekly(); d.task.wc.n = 4;
    const f1 = F(1); G.settleRace(f1, ctx(TD.MODES.itemTeam), { items: 3, hits: 1 });
    out.w = JSON.stringify(t().wp); out.q = JSON.stringify(d.quests.prog); out.cnt = JSON.stringify(t().cnt); out.tot = [d.totals.races, d.totals.items, d.totals.km];
    out.fw = t().fw.day === G.dayKey(); out.wc = G.winChest().ready; out.cards = f1.cards.map((c) => (c.match(/<h4>(.*?)<\/h4>/) || [])[1]).join('|');
    G.settleRace(F(1), ctx(TD.MODES.speed), { items: 9, hits: 0 });   // thắng lần hai trong ngày: không báo thắng đầu nữa
    out.w2 = [t().wp.wins, t().wp.items | 0, t().cnt.ir, t().wc.n];
    G.settleRace(F(2, true), ctx(TD.MODES.ranked), { items: 0, hits: 0 });
    out.w3 = [t().wp.races, t().wp.wins, t().wp.top3, t().wp.ranked, d.quests.prog.ranked, d.totals.km];
    G.settleRace(F(1), ctx(TD.MODES.free), { items: 5, hits: 0 });
    out.practice = t().wp.races;
    return out;
  });
  T.check('settle thắng đội+đạo cụ: tuần {races 1, wins 1, top3 1, drift 4, items 3, team 1}', r.w === '{"races":1,"wins":1,"top3":1,"drift":4,"items":3,"ranked":0,"team":1}', r.w);
  T.check('settle: nhiệm vụ ngày cộng đúng, đếm trận Đạo Cụ và Đội, tổng km = 3, thắng đầu + rương thắng đủ 5', r.q === '{"races":1,"top3":1,"drift":4,"boost":2,"items":3,"ranked":0}' && r.cnt === '{"ir":1,"tr":1}' && r.tot.join() === '1,3,3' && r.fw && r.wc, JSON.stringify(r));
  T.check('settle: hai thẻ thưởng (thắng trận đầu, rương thắng)', r.cards === 'Nhiệm vụ thắng trận đầu|Rương Thắng Cá Nhân', r.cards);
  T.check('settle: thắng lần hai không thẻ thắng đầu; chế độ không đạo cụ không cộng đạo cụ tuần; thắng +1 rương', r.w2.join() === '2,3,1,6', r.w2.join());
  T.check('settle: DNF hạng 2 chỉ +1 trận/+1 X.Hạng, không tính thắng/top3/km; huấn luyện không đếm', r.w3.join() === '3,2,2,1,1,6' && r.practice === 3, r.w3.join() + ' ' + r.practice);

  await fresh(); await fake(2026, 10, 14);
  r = await page.evaluate(() => {
    const d = TD.save.d, G = TD.garage, out = {};
    out.none = G.claimFirstWin().ok; d.task = null; G.settleRace({ dnf: false, place: 1, reward: 300, stats: { drifts: 0, boosts: 0 }, cards: [] }, { R: { mode: TD.MODES.speed, T: { L: 1000 }, laps: 1 }, me: {} }, { items: 0, hits: 0 });
    out.f = G.firstWin(); out.c = G.claimFirstWin(); out.coins = d.coins; out.xp = d.xp; out.again = G.claimFirstWin().ok;
    G.now = () => new Date(2026, 9, 15, 8); out.next = G.firstWin().won;
    d.task.wc.n = 7; out.wc = G.claimWinChest(); out.n = [d.task.wc.n, d.task.wc.opened, d.coins]; out.wc2 = G.claimWinChest().ok;
    d.xp = 970; out.lv = TD.LEVEL.of(970).lv; out.lr = G.levelRewards().filter((x) => x.state === 'ready').map((x) => x.lv).join();
    d.coins = 0; out.cl = G.claimLevels(); out.lcoins = d.coins; out.cl2 = G.claimLevels().ok;
    return out;
  });
  T.check('thắng trận đầu: chưa thắng không nhận; thắng → +500 xu +60 XP một lần; ngày mới chưa thắng', !r.none && r.f.ready && r.c.ok && r.coins === 500 && r.xp === 60 && !r.again && !r.next, JSON.stringify(r));
  T.check('rương thắng: 7 thắng → mở +600 xu, còn 2, đã mở 1; còn 2 chưa mở được', r.wc.ok && r.n.join() === '2,1,1100' && !r.wc2, JSON.stringify(r));
  T.check('thưởng lên cấp: XP 970 = cấp 5, nhận cấp 2..5 = 150+175+200+225 = 750 xu một lần', r.lv === 5 && r.lr === '2,3,4,5' && r.cl.ok && r.lcoins === 750 && !r.cl2, JSON.stringify(r));

  await fresh(); await fake(2026, 10, 14);
  r = await page.evaluate(() => {
    const d = TD.save.d, G = TD.garage, out = {};
    G.quests(); G.weekly(); d.quests.prog.races = 3; G.claimQuest('races');   // +20 sinh lực
    d.task.wp.wins = 5; G.claimWeekly('wins');                                // +50
    out.p = G.pass(); out.pts = out.p.pts; out.lv = out.p.lv;
    out.early = G.claimPass(1).ok; d.task.pass.pts = 250; d.coins = 0; d.xp = 0; out.a = G.claimPass(1).coins; out.b = G.claimPass(2).coins; out.c = G.claimPass(3).ok; out.again = G.claimPass(1).ok;
    d.task.pass.pts = 500; out.five = G.claimPass(5); G.claimPass(3); G.claimPass(4);
    out.coinsEnd = d.coins; out.badge = G.welfarePending().pass;
    G.now = () => new Date(2026, 10, 2, 8); const q = G.pass(); out.nov = [q.season, q.pts, q.lv, q.levels.filter((l) => l.state === 'got').length];
    return out;
  });
  T.check('thẻ mùa: nhiệm vụ ngày (20) + tuần (50) = 70 điểm, chưa lên bậc', r.pts === 70 && r.lv === 0, JSON.stringify(r.p && { pts: r.pts, lv: r.lv }));
  T.check('thẻ mùa: chưa đủ 100 điểm không nhận bậc 1; 250 điểm = bậc 2, 500 điểm = bậc 5; bậc 1 = 150 xu, bậc 2 = 200 xu, bậc 5 = 350 xu + 50 XP; bậc cao hơn chưa nhận', !r.early && r.a === 150 && r.b === 200 && !r.c && !r.again && r.five.coins === 350 && r.five.xp === 50 && r.coinsEnd === 150 + 200 + 350 + 250 + 300, JSON.stringify(r));
  T.check('thẻ mùa: sang tháng 11 reset về 0 điểm, chưa nhận bậc nào', r.nov.join() === '2026-11,0,0,0', r.nov.join());
  await page.evaluate(() => { TD.garage.now = () => new Date(); });

  console.log('sảnh: Phúc Lợi là nút trên cùng, Nhiệm Vụ ở linh vật');
  await fresh();
  await page.evaluate(() => { TD.garage.open('quests'); });
  await page.click('[data-g="back"]');
  const lob = await page.evaluate(() => ({ entry: TD.lobby.entries.filter((e) => e.id === 'welfare' && e.where === 'top').length, btn: !!document.querySelector('#ui .lb-tr [data-entry="welfare"]'), dot: !!document.querySelector('#ui [data-entry="welfare"] .lb-dot') }));
  T.check('sảnh có nút Phúc Lợi (trên, kèm chấm đỏ vì có quà đăng nhập và thưởng cấp)', lob.entry === 1 && lob.btn && lob.dot, JSON.stringify(lob));
  await page.click('[data-entry="welfare"]');
  T.check('bấm Phúc Lợi mở màn Phúc Lợi', await page.evaluate(() => document.querySelector('.gr') && document.querySelector('.gr').dataset.tab === 'welfare' && document.querySelectorAll('.gsubs [data-sub]').length === 5));
  await page.click('[data-sub="login"]');
  await page.click('[data-login="1"]');
  T.check('bấm Nhận ngày 1 trên lịch: +200 xu và nút đổi thành Đã nhận', await page.evaluate(() => TD.save.d.coins === 200 && !!document.querySelector('.gday.got em')));
  await page.click('[data-g="back"]');

  T.check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  await br.close(); srv.close();
  T.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
