/*
 * Tốc Độ: nhánh Xếp hạng. node test/toc-do-rank.js   (TD_URL=<gốc> để chạy trên Pages)
 *  - Node: TD.RANK.of / settle / botSkill với số cụ thể.
 *  - Trình duyệt: sảnh xếp hạng hiện huy hiệu, vào trận xếp hạng, về đích bằng bot, thẻ xếp hạng, màn thăng cấp, ở hai cỡ màn hình.
 */
'use strict';
const path = require('path');
const os = require('os');
const { check, done, nodeSim, serve, browser, open } = require('./toc-do-lib.js');
// Ảnh chụp có hạn dài hơn thư viện (máy kiểm có thể đang quá tải vì nhiều bài kiểm chạy song song).
const shot = (page, name) => page.screenshot({ path: path.join(process.env.TD_SHOTS || path.join(os.tmpdir(), 'toc-do-shots'), name + '.png'), timeout: 180000 });

const TD = nodeSim(['js/sim/rank.js']).TD;
const R = TD.RANK;
const at = (p) => { const o = R.of(p); return [o.name, o.stars]; };

console.log('Toán xếp hạng');
check('0 điểm = Đồng I, 0 sao', at(0).join() === 'Đồng I,0');
check('4 điểm = Đồng I, 4 sao', at(4).join() === 'Đồng I,4');
check('5 điểm = Đồng II', at(5).join() === 'Đồng II,0');
check('19 điểm = Đồng IV, 4 sao', at(19).join() === 'Đồng IV,4');
check('20 điểm = Bạch Ngân I', at(20)[0] === 'Bạch Ngân I');
check('40 điểm = Vàng I, 69 điểm = Vàng VI', at(40)[0] === 'Vàng I' && at(69)[0] === 'Vàng VI');
check('70 điểm = Bạch Kim I, 120 = Kim Cương I', at(70)[0] === 'Bạch Kim I' && at(120)[0] === 'Kim Cương I');
check('170 = Vua Xe I, 220 = Siêu Đẳng I', at(170)[0] === 'Vua Xe I' && at(220)[0] === 'Siêu Đẳng I');
check('299 = Siêu Đẳng IV 4 sao, 300 = Huyền Thoại', at(299).join() === 'Siêu Đẳng IV,4' && at(300)[0] === 'Huyền Thoại' && at(9999)[0] === 'Huyền Thoại');
check('huy hiệu theo bậc', R.of(0).badge === 'art/rank/rank_qt.webp' && R.of(40).badge === 'art/rank/rank_hj.webp' && R.of(300).badge === 'art/rank/rank_cq.webp');
check('sao theo hạng (6 xe): +3 +2 +1 −1 −2 −3', [1, 2, 3, 4, 5, 6].map((p) => R.starsFor(p, 6, false)).join() === '3,2,1,-1,-2,-3');
check('hết giờ = −3 sao', R.starsFor(2, 6, true) === -3);

const D = new Date(2026, 9, 10, 12, 0);   // trưa: ngoài khung không mất điểm
const sv = (pts, streak) => ({ coins: 0, xp: 0, rank: { pts, best: pts, streak: streak || 0, games: 0, wins: 0, season: 1, day: '2026-10-10', dn: 3 } });
let s = sv(40), o = R.settle(s, 1, 6, false, D);   // Vàng I, 1 sao = 1 điểm
check('hạng 1 ở Vàng: +3 sao = +3 điểm', o.stars === 3 && o.delta === 3 && s.rank.pts === 43 && s.rank.wins === 1 && s.rank.games === 1 && s.rank.streak === 1);
s = sv(40); o = R.settle(s, 6, 6, false, D);
check('hạng bét ở Vàng I: −3 điểm, xuống Bạch Ngân (hạ cấp)', o.delta === -3 && s.rank.pts === 37 && o.demoted && !o.promoted && o.after.name === 'Bạch Ngân IV' && s.rank.streak === 0);
s = sv(2); o = R.settle(s, 6, 6, false, D);
check('Đồng không mất điểm', o.delta === 0 && s.rank.pts === 2 && !o.demoted && s.rank.games === 1);
s = sv(0); o = R.settle(s, 6, 6, true, D);
check('Đồng 0 điểm hết giờ vẫn 0', s.rank.pts === 0);
s = sv(38); o = R.settle(s, 1, 6, false, D);
check('Bạch Ngân IV 38 + 3 sao: dừng ở 39, mở Vòng Trong, chưa lên Vàng', o.seriesOpened && !o.promoted && s.rank.pts === 39 && o.stars === 1 && o.after.name === 'Bạch Ngân IV' && JSON.stringify(s.rank.series) === '{"tier":1,"r":[]}');
s = sv(299); o = R.settle(s, 1, 6, false, D);
check('Siêu Đẳng IV 299 + 3 sao: dừng ở 299 và mở Vòng Trong', o.seriesOpened && s.rank.pts === 299 && !o.promoted);
s = sv(60, 2); o = R.settle(s, 1, 6, false, D);
check('thắng liên tục thứ 3 thưởng thêm 1 sao', o.streak === 3 && o.streakBonus === 1 && o.stars === 4 && s.rank.pts === 64);
s = sv(60, 5); R.settle(s, 4, 6, false, D);
check('hạng 4 cắt chuỗi thắng', s.rank.streak === 0);
s = sv(44); o = R.settle(s, 1, 6, false, D);
check('lên bậc phụ trong cùng bậc không phải thăng cấp', o.subUp && !o.promoted && o.after.name === 'Vàng II');
s = sv(0); for (let i = 0; i < 12; i++) R.settle(s, 1, 6, false, D);
check('lịch sử giữ 10 trận gần nhất', s.rank.hist.length === 10 && s.rank.hist[0].place === 1 && s.rank.games === 12);
check('kỹ năng bot: Đồng 0 điểm rng 0,5 = 0,35; Huyền Thoại rng 1 = 0,98',
  Math.abs(R.botSkill(sv(0), () => 0.5) - 0.35) < 1e-9 && R.botSkill(sv(300), () => 1) === 0.98);
check('kỹ năng bot tăng theo bậc', R.botSkill(sv(0), () => 0.5) < R.botSkill(sv(120), () => 0.5) && R.botSkill(sv(120), () => 0.5) < R.botSkill(sv(250), () => 0.5));


console.log('Vòng Trong');
const ser = (pts, r) => { const x = sv(pts); x.rank.series = { tier: R.of(pts).tier, r: r || [] }; return x; };
s = ser(39); o = R.settle(s, 3, 6, false, D);
check('Vòng Trong: hạng 3/6 là thắng, 1 ô xanh, điểm đứng yên', o.series.good && o.series.wins === 1 && o.series.losses === 0 && !o.series.done && s.rank.pts === 39 && s.rank.series.r.join() === '1' && o.stars === 0);
o = R.settle(s, 2, 6, false, D);
check('thắng 2 trận: lên Vàng I (40), đóng Vòng Trong, +30 Xu Xếp Hạng thưởng', o.promoted && o.series.done === 'win' && o.after.name === 'Vàng I' && s.rank.pts === 40 && s.rank.series === null && s.rank.xu === 16 + 12 + 30 + 0, s.rank.xu);
s = ser(39); R.settle(s, 4, 6, false, D); o = R.settle(s, 6, 6, false, D);
check('thua 2 trận (hạng 4 và 6): Tăng cấp thất bại, mất 2 sao (39 → 37), không hạ cấp', o.failed && o.series.done === 'lose' && s.rank.pts === 37 && o.stars === -2 && !o.demoted && !o.promoted && s.rank.series === null);
s = ser(39, [1]); R.settle(s, 5, 6, false, D); o = R.settle(s, 1, 6, false, D);
check('thắng - thua - thắng: lên bậc', o.promoted && s.rank.pts === 40);
s = ser(39, [0, 1]); o = R.settle(s, 6, 6, false, D);
check('thua - thắng - thua: trượt (2 thua / 3 trận)', o.failed && s.rank.pts === 37);
s = ser(39); o = R.settle(s, 1, 6, true, D);
check('hết giờ trong Vòng Trong tính là thua', !o.series.good && o.series.losses === 1);
s = ser(39); o = R.settle(s, 1, 6, false, new Date(2026, 9, 10, 20, 30));
check('Vòng Trong: top 3 thắng cả trong khung không mất điểm', o.series.good);
s = ser(39, [0]); o = R.settle(s, 6, 6, false, new Date(2026, 9, 10, 21, 0));
check('thất bại trong khung 20:00-22:00: vẫn trượt vòng nhưng không mất sao', o.failed && s.rank.pts === 39 && o.stars === 0);
s = ser(299); R.settle(s, 2, 6, false, D); o = R.settle(s, 2, 6, false, D);
check('Siêu Đẳng IV thắng Vòng Trong: lên Huyền Thoại (300)', o.promoted && o.after.name === 'Huyền Thoại' && s.rank.pts === 300 && s.rank.best === 300);
s = sv(300); o = R.settle(s, 1, 6, false, D);
check('Huyền Thoại không có Vòng Trong', !o.seriesOpened && s.rank.series == null && s.rank.pts === 312);
s = sv(60); s.rank.series = { tier: 1, r: [1] }; o = R.settle(s, 1, 6, false, D);
check('Vòng Trong sót lại không khớp bậc/điểm thì bỏ', o.series === null && s.rank.series === null && s.rank.pts === 63);

console.log('Khung giờ, thưởng ngày, Xu Xếp Hạng, khiên');
check('khung không mất điểm: 19:59 đóng, 20:00 mở, 21:59 mở, 22:00 đóng', !R.noLoss(new Date(2026, 9, 10, 19, 59)) && R.noLoss(new Date(2026, 9, 10, 20, 0)) && R.noLoss(new Date(2026, 9, 10, 21, 59)) && !R.noLoss(new Date(2026, 9, 10, 22, 0)));
s = sv(60); o = R.settle(s, 6, 6, false, new Date(2026, 9, 10, 20, 15));
check('trong khung: hạng bét không mất điểm', o.stars === 0 && s.rank.pts === 60 && o.noLoss);
s = sv(60); o = R.settle(s, 6, 6, false, D);
check('ngoài khung: hạng bét −3 sao (60 → 57)', o.stars === -3 && s.rank.pts === 57 && !o.noLoss);
s = sv(60); s.rank.dn = 0; s.rank.day = '2026-10-10'; o = R.settle(s, 1, 6, false, D);
check('trận đầu trong ngày: +3 sao +1 thưởng = 4, Xu 20×2 = 40', o.daily && o.dailyStar === 1 && o.stars === 4 && o.xu === 40 && s.rank.xu === 40 && s.rank.dn === 1);
s = sv(60); s.rank.dn = 0; s.rank.day = '2026-10-10'; o = R.settle(s, 6, 6, false, D);
check('trận đầu trong ngày thua: không có sao thưởng, Xu 4×2 = 8', o.dailyStar === 0 && o.xu === 8 && o.stars === -3);
s = sv(60); s.rank.dn = 2; for (let i = 0; i < 3; i++) R.settle(s, 3, 6, false, D);
check('thưởng ngày chỉ 3 trận: dn 2 → còn 1 trận được thưởng, ngày mới reset', s.rank.dn === 5 && R.dailyLeft(s, D) === 0 && R.dailyLeft(s, new Date(2026, 9, 11, 8, 0)) === 3);
s = sv(60); o = R.settle(s, 3, 6, false, D);
check('Xu Xếp Hạng theo hạng: 3 → 12; hết giờ → 3', o.xu === 12 && R.settle(s, 1, 6, true, D).xu === 3 && s.rank.xu === 15);
s = sv(60); s.rank.shield = 2; o = R.settle(s, 6, 6, false, D);
check('Khiên Giữ Sao: thua không mất sao, còn 1 khiên', o.shield && o.stars === 0 && s.rank.pts === 60 && s.rank.shield === 1);
s = sv(60); s.rank.shield = 1; o = R.settle(s, 1, 6, false, D);
check('thắng thì khiên giữ nguyên', !o.shield && s.rank.shield === 1);
s = sv(60); s.rank.xu = 100;
check('mua Túi Xu: −20 Xu Xếp Hạng, +1000 xu', R.buy(s, 'coin1').ok && s.rank.xu === 80 && s.coins === 1000);
check('mua Sách Kinh Nghiệm: +300 XP', R.buy(s, 'xp').ok && s.xp === 300 && s.rank.xu === 50);
check('mua Khiên 3 lần rồi đầy: lần 2 không đủ xu', R.buy(s, 'shield').ok && s.rank.shield === 1 && s.rank.xu === 10 && !R.buy(s, 'shield').ok);
check('không đủ Xu: báo lý do, không trừ', (() => { const r = R.buy(s, 'coin2'); return !r.ok && /không đủ Xu Xếp Hạng: cần 80, còn 10/.test(r.why) && s.rank.xu === 10 && s.coins === 1000; })());
check('món lạ: báo lỗi', !R.buy(s, 'abc').ok);

console.log('Mùa giải');
check('mùa: 10/2026 = S1, 11/2026 = S2, 1/2027 = S4', R.seasonOf(new Date(2026, 9, 1)) === 1 && R.seasonOf(new Date(2026, 10, 30)) === 2 && R.seasonOf(new Date(2027, 0, 5)) === 4 && R.seasonOf(new Date(2020, 0, 1)) === 1);
const lf = R.seasonLeft(new Date(2026, 9, 30, 12, 0));
check('còn lại: 30/10 12:00 → 1 ngày 12 giờ', lf.days === 1 && lf.hours === 12, JSON.stringify(lf));
s = sv(150); s.rank.best = 150; s.rank.season = 1; s.rank.series = { tier: 4, r: [] };
o = R.rollover(s, new Date(2026, 10, 2, 9, 0));
check('hết mùa: thưởng theo bậc cao nhất Kim Cương (tier 4): 2000 xu, 125 Xu', o && o.tier === 4 && o.coins === 2000 && o.xu === 125 && s.coins === 2000 && s.rank.xu === 125, JSON.stringify(o));
check('hết mùa: điểm 150 (Kim Cương III) về đầu Bạch Kim = 70, best 70, Vòng Trong và chuỗi xóa, mùa = 2', s.rank.pts === 70 && s.rank.best === 70 && s.rank.series === null && s.rank.season === 2 && o.start === 'Bạch Kim I');
check('rollover lần 2 cùng mùa: không thưởng thêm', R.rollover(s, new Date(2026, 10, 20)) === null && s.coins === 2000);
s = sv(150); s.rank.best = 230; s.rank.season = 1; o = R.rollover(s, new Date(2027, 0, 1));
check('bậc cao nhất 230 (Siêu Đẳng, tier 6): thưởng 2800 xu; bỏ qua nhiều mùa vẫn một lần', o.tier === 6 && o.coins === 2800 && s.rank.season === 4);
s = { rank: { pts: 10 } }; check('bản lưu chưa có mùa: nhận mùa hiện tại, không thưởng', R.rollover(s, new Date(2026, 11, 1)) === null && s.rank.season === 3);
s = sv(2); s.rank.best = 2; s.rank.season = 1; R.rollover(s, new Date(2026, 10, 1));
check('Đồng về điểm 0 ở mùa mới', s.rank.pts === 0 && s.coins === 400);
s = sv(39); s.rank.season = 1; o = R.settle(s, 3, 6, false, new Date(2026, 10, 3, 12, 0));
check('settle gọi chuyển mùa trước: trả o.season', o.season && o.season.season === 1 && s.rank.season === 2);

(async () => {
  console.log('Trình duyệt');
  const srv = await serve();
  const br = await browser();
  const until = (page) => async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 250 }); return true; } catch (e) { return false; } };
  for (const vp of [{ n: 'pc', w: 1366, h: 650 }, { n: 'phone', w: 844, h: 390 }]) {
    console.log('  ' + vp.w + '×' + vp.h);
    const { page, problems } = await open(br, srv.base, 'index.html', { width: vp.w, height: vp.h }, vp.n === 'phone' ? { hasTouch: true, isMobile: true } : {});
    const wait = until(page);
    check(vp.n + ': sảnh mở', await wait(() => window.TD && TD.main && TD.main.state === 'lobby', null, 90000));
    await page.evaluate(() => { TD.save.d.rank = { pts: 118, best: 118, streak: 2, games: 7, wins: 3, hist: [{ place: 1, n: 6, d: 3, s: 3, t: 1 }, { place: 5, n: 6, d: -4, s: -2, t: 0 }] }; TD.ranked.show(); });
    const ok = await wait(() => { const i = document.querySelector('.rk-badge'); return i && i.complete && i.naturalWidth > 0; });
    check(vp.n + ': sảnh xếp hạng vẽ huy hiệu (naturalWidth > 0)', ok);
    const lay = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.rk button, .rk-badge, .rk-side, .rk-hero h2')].map((e) => { const b = e.getBoundingClientRect(); return { c: e.className, x: b.left, y: b.top, r: b.right, b: b.bottom, h: b.height, w: b.width }; });
      return { r, name: document.querySelector('.rk-hero h2').textContent, stars: document.querySelectorAll('.rk-stars i.on').length };
    });
    check(vp.n + ': tên bậc và sao đúng (Bạch Kim V, 4 sao)', lay.name === 'Bạch Kim V' && lay.stars === 4, lay.name + ' ' + lay.stars);
    check(vp.n + ': mọi thành phần nằm trong màn hình', lay.r.every((b) => b.x >= 0 && b.y >= 0 && b.r <= vp.w && b.b <= vp.h), JSON.stringify(lay.r.filter((b) => b.x < 0 || b.y < 0 || b.r > vp.w || b.b > vp.h)));
    check(vp.n + ': nút ≥ 44 px', lay.r.filter((b) => /btn/.test(b.c)).every((b) => b.h >= 44), lay.r.filter((b) => /btn/.test(b.c)).map((b) => b.h).join());
    await shot(page, 'rank-hall-' + vp.n);
    // Vòng Trong trong sảnh: ô xanh/đỏ, nhãn nút, bố cục.
    const inView = (sel) => page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => { const b = e.getBoundingClientRect(); return { c: e.className, h: b.height, ok: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight }; }), sel);
    await page.evaluate(() => { const n = TD.RANK.seasonOf(new Date()); TD.save.d.rank = { pts: 39, best: 39, streak: 0, games: 7, wins: 3, season: n, series: { tier: 1, r: [1, 0] }, xu: 135, shield: 2, hist: [{ place: 1, n: 6, d: 1, s: 1, t: 1 }] }; TD.ranked.show(); });
    const sh = await page.evaluate(() => ({ pips: [...document.querySelectorAll('.rk-pips i')].map((i) => i.className).join('|'), go: document.querySelector('.rk-go').textContent, stars: document.querySelectorAll('.rk-stars').length, title: document.querySelector('.rk-title small').textContent, wallet: document.querySelector('.rk-wallet b').textContent, chips: [...document.querySelectorAll('.rk-chip')].map((c) => c.textContent) }));
    check(vp.n + ': Vòng Trong: 3 ô (thắng, thua, trống), nút "Vòng Trong", không hiện sao', sh.pips === 'win|lose|' && sh.go === 'Vòng Trong' && sh.stars === 0, JSON.stringify(sh));
    check(vp.n + ': tiêu đề mùa S + thời gian còn lại, ví 135 Xu, chip khung giờ + thưởng ngày + khiên', /^Mùa giải S\d+ · Mùa giải kết thúc còn: \d+ ngày \d+ giờ$/.test(sh.title) && sh.wallet === '135' && sh.chips.length === 3 && /20:00-22:00|không mất điểm đến 22:00/.test(sh.chips[0]) && /3 trận đầu Đua Xếp Hạng mỗi ngày/.test(sh.chips[1]) && /Khiên Giữ Sao: 2/.test(sh.chips[2]), JSON.stringify(sh));
    const inv = (await inView('.rk button, .rk-pips, .rk-side, .rk-chip, .rk-hero')).filter((b) => !b.ok || (/btn/.test(b.c) && b.h < 44));
    check(vp.n + ': sảnh Vòng Trong nằm trong màn, nút ≥ 44 px', inv.length === 0, JSON.stringify(inv));
    await shot(page, 'rank-series-' + vp.n);
    await page.click('.rk-wallet');
    check(vp.n + ': cửa hàng mở, 4 món', await wait(() => document.querySelectorAll('.rk-item').length === 4, null, 5000));
    const inv2 = (await inView('.rk-shop, .rk-item, .rk-close')).filter((b) => !b.ok || (/btn|rk-item/.test(b.c) && b.h < 44));
    check(vp.n + ': cửa hàng nằm trong màn, nút ≥ 44 px', inv2.length === 0, JSON.stringify(inv2));
    await page.click('[data-buy="coin1"]');
    const bought = await page.evaluate(() => ({ xu: TD.save.d.rank.xu, coins: TD.save.d.coins, msg: document.querySelector('.rk-msg').textContent, open: !!document.querySelector('.rk-shop') }));
    check(vp.n + ': mua Túi Xu trong giao diện: 135 → 115 Xu Xếp Hạng, thông báo, cửa hàng còn mở', bought.xu === 115 && bought.msg === 'Đã mua Túi Xu' && bought.open, JSON.stringify(bought));
    await page.click('[data-buy="coin2"]'); await page.click('[data-buy="coin2"]');
    const poor = await page.evaluate(() => ({ xu: TD.save.d.rank.xu, msg: document.querySelector('.rk-msg').textContent }));
    check(vp.n + ': mua Rương Xu (80) rồi hết Xu: 115 → 35, lần 2 báo thiếu', poor.xu === 35 && /không đủ Xu Xếp Hạng: cần 80, còn 35/.test(poor.msg), JSON.stringify(poor));
    await shot(page, 'rank-shop-' + vp.n);
    await page.click('.rk-close');
    check(vp.n + ': đóng cửa hàng', await wait(() => !document.querySelector('.rk-modal'), null, 5000));
    // Mùa mới: bản lưu mùa cũ (Kim Cương cao nhất) → hộp thoại thưởng.
    // Đồng hồ trang nhảy sang tháng sau: bản lưu mùa hiện tại thành mùa cũ.
    await page.evaluate(() => {
      window.RealDate = Date; const off = 33 * 864e5;
      window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + off); } static now() { return RealDate.now() + off; } };
      TD.save.d.coins = 0; TD.save.d.rank = { pts: 150, best: 150, streak: 0, games: 9, wins: 3, season: TD.RANK.seasonOf(new RealDate()), xu: 0 }; TD.ranked.show();
    });
    const se = await page.evaluate(() => ({ modal: !!document.querySelector('.rk-season'), txt: document.querySelector('.rk-season') && document.querySelector('.rk-season').textContent, coins: TD.save.d.coins, pts: TD.save.d.rank.pts }));
    check(vp.n + ': hết mùa: hộp thoại thưởng Kim Cương (2.000 xu, 125 Xu), điểm về 70', se.modal && /Mùa giải đã kết thúc/.test(se.txt) && /2\.000 xu/.test(se.txt) && /125 Xu Xếp Hạng/.test(se.txt) && se.coins === 2000 && se.pts === 70, JSON.stringify(se));
    await shot(page, 'rank-season-' + vp.n);
    await page.click('.rk-close');
    await page.evaluate(() => { window.Date = window.RealDate; });
    // Vào trận từ Vòng Trong (đã thắng 1): về top 3 thì lên bậc, không thì có thêm ô đỏ.
    await page.evaluate(() => { TD.save.d.rank = { pts: 39, best: 39, streak: 0, games: 7, wins: 3, season: TD.RANK.seasonOf(new Date()), series: { tier: 1, r: [1] }, dn: 3, day: (() => { const n = new Date(); return n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate(); })() }; TD.ranked.show(); });
    await page.click('.rk-go');
    check(vp.n + ': vào trận xếp hạng', await wait(() => TD.main.state === 'race' && TD.main.race && TD.main.race.mode.id === 'ranked' && TD.main.me && TD.main.views, null, 400000));
    const info = await page.evaluate(() => {
      const R = TD.main.race;
      TD.main.me.ctrl = 'bot'; TD.Bot.init(TD.main.me, R, 0.99);
      // Máy kiểm vẽ phần mềm chậm: chạy mô phỏng thẳng tới khi mình về đích; sự kiện 'finish' chờ khung kế tiếp xử lý như thường.
      for (let i = 0; i < 60 * 400 && TD.main.me.st !== 'finish'; i++) TD.Race.step(R, 1 / 60);
      TD.main.timeScale = 6;
      return { skills: R.karts.filter((k) => k !== TD.main.me).map((k) => k.bot && k.bot.skill), n: R.karts.length };
    });
    check(vp.n + ': bot theo bậc Bạch Ngân IV (39 điểm: kỹ năng 0,35..0,50)', info.skills.every((x) => x >= 0.35 && x <= 0.5), info.skills.join());
    check(vp.n + ': kết quả hiện thẻ xếp hạng', await wait(() => document.querySelector('.rk-card'), null, 400000));
    await page.waitForTimeout(400);
    await shot(page, 'rank-card-' + vp.n);
    const rk = await page.evaluate(() => ({ r: TD.save.d.rank, place: TD.main.me.place, f: TD.main.fin && TD.main.fin.rank && { pro: TD.main.fin.rank.promoted, dem: TD.main.fin.rank.demoted, d: TD.main.fin.rank.delta, xu: TD.main.fin.rank.xu }, img: (() => { const i = document.querySelector('.rk-cardbadge'); return i && i.naturalWidth; })(), tag: (document.querySelector('.rk-tag') || {}).textContent }));
    check(vp.n + ': save.rank.games tăng 7 → 8', rk.r.games === 8, JSON.stringify(rk.r));
    if (rk.place <= 3) check(vp.n + ': hạng ' + rk.place + ' (top 3) thắng Vòng Trong: lên Bạch Ngân → Vàng I (40), thẻ "Tăng cấp thành công"', rk.f.pro && rk.r.pts === 40 && rk.r.series === null && rk.tag === 'Tăng cấp thành công', JSON.stringify(rk));
    else check(vp.n + ': hạng ' + rk.place + ' trượt: điểm đứng yên 39, Vòng Trong có ô thắng + ô thua', !rk.f.pro && rk.r.pts === 39 && rk.r.series && rk.r.series.r.join() === '1,0', JSON.stringify(rk));
    check(vp.n + ': Xu Xếp Hạng cộng đúng (trận thứ 4+ trong ngày: không nhân đôi)', rk.r.xu === rk.f.xu && rk.f.xu >= 4, JSON.stringify(rk.f));
    check(vp.n + ': thẻ vẽ huy hiệu', rk.img > 0);
    check(vp.n + ': lịch sử ghi 1 trận', rk.r.hist && rk.r.hist.length === 1 && rk.r.hist[0].place === rk.place);
    if (rk.f && (rk.f.pro || rk.f.dem)) {
      check(vp.n + ': màn thăng cấp hiện sau bảng', await wait(() => TD.main.resultShown && document.querySelector('.rk-over'), null, 60000));
      await page.waitForTimeout(500); await shot(page, 'rank-over1-' + vp.n);
      await wait(() => document.querySelector('.rk-over').dataset.stage === '2', null, 20000);
      await shot(page, 'rank-over2-' + vp.n);
      await wait(() => document.querySelector('.rk-over').dataset.stage === '3', null, 20000);
      await page.waitForTimeout(700); await shot(page, 'rank-over3-' + vp.n);
      const nb = await page.evaluate(() => { const i = document.querySelector('.rk-new'); const b = document.querySelector('.rk-cont').getBoundingClientRect(); return { w: i.naturalWidth, bh: b.height, inside: b.right <= innerWidth && b.bottom <= innerHeight, t: document.querySelector('.rk-nname b').textContent }; });
      check(vp.n + ': huy hiệu mới tải được, tiêu đề "Tăng cấp thành công", nút Tiếp tục ≥ 44 px trong màn', nb.w > 0 && nb.bh >= 44 && nb.inside && nb.t === 'Tăng cấp thành công', JSON.stringify(nb));
      await page.click('.rk-cont');
      check(vp.n + ': bấm Tiếp tục đóng màn', await wait(() => !document.querySelector('.rk-over'), null, 5000));
    } else console.log('  (trận này trượt Vòng Trong: bỏ qua màn thăng cấp ở ' + vp.n + ')');
    // Ảnh xem trước đường đua mới (art/maps) do nhánh Đường đua xuất, thiếu thì 404 không thuộc nhánh này.
    const mine = problems.filter((x) => !/art\/maps\/|Failed to load resource/.test(x));
    check(vp.n + ': không lỗi trang', mine.length === 0, mine.slice(0, 4).join(' | '));
    await page.context().close();
  }
  // Màn thăng/hạ cấp dựng trực tiếp (không phụ thuộc kết quả trận) để chắc chắn mỗi hướng được chụp.
  const { page, problems } = await open(br, srv.base, 'index.html');
  const wait = until(page);
  await wait(() => window.TD && TD.main && TD.main.state === 'lobby', null, 90000);
  for (const dir of ['up', 'dn', 'fail']) {
    // Hạ cấp thật cần ngoài khung 20:00-22:00 (giờ máy).
    if (dir === 'dn' && await page.evaluate(() => TD.RANK.noLoss(new Date()))) { console.log('  (đang trong khung không mất điểm: bỏ qua hạ cấp trực tiếp)'); continue; }
    await page.evaluate((d) => {
      TD.save.d.rank = { pts: d === 'up' ? 299 : d === 'fail' ? 39 : 220, best: 299, streak: 0, games: 0, wins: 0, season: TD.RANK.seasonOf(new Date()), dn: 3, day: (() => { const n = new Date(); return n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate(); })() };
      if (d === 'up') TD.save.d.rank.series = { tier: 6, r: [1] };
      if (d === 'fail') TD.save.d.rank.series = { tier: 1, r: [0] };
      const p = TD.ranked.plugin;
      p.settle({ cards: [], dnf: false }, { R: { mode: { ranked: true }, karts: new Array(6) }, me: { place: d === 'up' ? 2 : 6 } });
      TD.main.resultShown = true;
      p.update();
    }, dir);
    check(dir + ': màn thăng/hạ cấp hiện đúng chiều', await wait((d) => document.querySelector('.rk-over.' + (d === 'up' ? 'up' : 'dn')), dir, 30000));
    const ttl = await page.evaluate(() => document.querySelector('.rk-nname b').textContent);
    check(dir + ': tiêu đề đúng', ttl === { up: 'Tăng cấp thành công', dn: 'Hạ cấp', fail: 'Tăng cấp thất bại' }[dir], ttl);
    await wait(() => document.querySelector('.rk-over') && document.querySelector('.rk-over').dataset.stage === '3', null, 20000);
    await page.waitForTimeout(700);
    await shot(page, 'rank-over-' + dir);
    // Giai đoạn 1 (huy hiệu cũ + điểm cũ) chụp lại bằng cách lùi data-stage; chờ chuyển cảnh CSS xong.
    await page.evaluate(() => { document.querySelector('.rk-over').dataset.stage = '1'; });
    await page.waitForTimeout(2500);
    await shot(page, 'rank-over-' + dir + '-old');
    await page.evaluate(() => document.querySelector('.rk-over') && document.querySelector('.rk-over').remove());
  }
  check('không lỗi trang (màn thăng cấp riêng)', problems.length === 0, problems.slice(0, 4).join(' | '));
  await br.close(); srv.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
