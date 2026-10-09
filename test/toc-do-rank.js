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

const sv = (pts, streak) => ({ rank: { pts, best: pts, streak: streak || 0, games: 0, wins: 0 } });
let s = sv(40), o = R.settle(s, 1, 6, false);   // Vàng I, 1 sao = 1 điểm
check('hạng 1 ở Vàng: +3 sao = +3 điểm', o.stars === 3 && o.delta === 3 && s.rank.pts === 43 && s.rank.wins === 1 && s.rank.games === 1 && s.rank.streak === 1);
s = sv(40); o = R.settle(s, 6, 6, false);
check('hạng bét ở Vàng I: −3 điểm, xuống Bạch Ngân (hạ cấp)', o.delta === -3 && s.rank.pts === 37 && o.demoted && !o.promoted && o.after.name === 'Bạch Ngân IV' && s.rank.streak === 0);
s = sv(2); o = R.settle(s, 6, 6, false);
check('Đồng không mất điểm', o.delta === 0 && s.rank.pts === 2 && !o.demoted && s.rank.games === 1);
s = sv(0); o = R.settle(s, 6, 6, true);
check('Đồng 0 điểm hết giờ vẫn 0', s.rank.pts === 0);
s = sv(38); o = R.settle(s, 1, 6, false);
check('Bạch Ngân IV 38 + 3 = 41: lên Vàng (thăng cấp)', o.promoted && !o.demoted && o.after.name === 'Vàng I' && o.before.name === 'Bạch Ngân IV');
s = sv(299); o = R.settle(s, 1, 6, false);
check('299 → Huyền Thoại, best cập nhật', o.promoted && o.after.name === 'Huyền Thoại' && s.rank.best === s.rank.pts && s.rank.pts === 311);
s = sv(60, 2); o = R.settle(s, 1, 6, false);
check('thắng liên tục thứ 3 thưởng thêm 1 sao', o.streak === 3 && o.streakBonus === 1 && o.stars === 4 && s.rank.pts === 64);
s = sv(60, 5); R.settle(s, 4, 6, false);
check('hạng 4 cắt chuỗi thắng', s.rank.streak === 0);
s = sv(44); o = R.settle(s, 1, 6, false);
check('lên bậc phụ trong cùng bậc không phải thăng cấp', o.subUp && !o.promoted && o.after.name === 'Vàng II');
s = sv(0); for (let i = 0; i < 12; i++) R.settle(s, 1, 6, false);
check('lịch sử giữ 10 trận gần nhất', s.rank.hist.length === 10 && s.rank.hist[0].place === 1 && s.rank.games === 12);
check('kỹ năng bot: Đồng 0 điểm rng 0,5 = 0,35; Huyền Thoại rng 1 = 0,98',
  Math.abs(R.botSkill(sv(0), () => 0.5) - 0.35) < 1e-9 && R.botSkill(sv(300), () => 1) === 0.98);
check('kỹ năng bot tăng theo bậc', R.botSkill(sv(0), () => 0.5) < R.botSkill(sv(120), () => 0.5) && R.botSkill(sv(120), () => 0.5) < R.botSkill(sv(250), () => 0.5));

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
    // Vào trận xếp hạng từ nút THI ĐẤU. Điểm gần ngưỡng để trận thắng kéo qua thăng cấp.
    await page.evaluate(() => { TD.save.d.rank = { pts: 119, best: 119, streak: 0, games: 7, wins: 3 }; TD.ranked.show(); });
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
    check(vp.n + ': bot theo bậc Kim Cương I (119 điểm: kỹ năng 0,48..0,66)', info.skills.every((x) => x >= 0.48 && x <= 0.66), info.skills.join());
    check(vp.n + ': kết quả hiện thẻ xếp hạng', await wait(() => document.querySelector('.rk-card'), null, 400000));
    await page.waitForTimeout(400);
    await shot(page, 'rank-card-' + vp.n);
    const rk = await page.evaluate(() => ({ r: TD.save.d.rank, place: TD.main.me.place, f: TD.main.fin && TD.main.fin.rank && { pro: TD.main.fin.rank.promoted, dem: TD.main.fin.rank.demoted, d: TD.main.fin.rank.delta }, img: (() => { const i = document.querySelector('.rk-cardbadge'); return i && i.naturalWidth; })() }));
    check(vp.n + ': save.rank.games tăng 7 → 8', rk.r.games === 8, JSON.stringify(rk.r));
    check(vp.n + ': điểm đổi đúng hạng ' + rk.place, rk.f && rk.r.pts === 119 + rk.f.d, JSON.stringify(rk.f));
    check(vp.n + ': thẻ vẽ huy hiệu', rk.img > 0);
    check(vp.n + ': lịch sử ghi 1 trận', rk.r.hist && rk.r.hist.length === 1 && rk.r.hist[0].place === rk.place);
    // Bảng kết quả hiện rồi (nếu có thăng/hạ cấp) màn tiếp theo phủ lên.
    if (rk.f && (rk.f.pro || rk.f.dem)) {
      check(vp.n + ': màn thăng/hạ cấp hiện sau bảng', await wait(() => TD.main.resultShown && document.querySelector('.rk-over'), null, 60000));
      await page.waitForTimeout(500); await shot(page, 'rank-over1-' + vp.n);
      await wait(() => document.querySelector('.rk-over').dataset.stage === '2', null, 20000);
      await shot(page, 'rank-over2-' + vp.n);
      await wait(() => document.querySelector('.rk-over').dataset.stage === '3', null, 20000);
      await page.waitForTimeout(700); await shot(page, 'rank-over3-' + vp.n);
      const nb = await page.evaluate(() => { const i = document.querySelector('.rk-new'); const b = document.querySelector('.rk-cont').getBoundingClientRect(); return { w: i.naturalWidth, bh: b.height, inside: b.right <= innerWidth && b.bottom <= innerHeight }; });
      check(vp.n + ': huy hiệu mới tải được, nút Tiếp tục ≥ 44 px trong màn', nb.w > 0 && nb.bh >= 44 && nb.inside, JSON.stringify(nb));
      await page.click('.rk-cont');
      check(vp.n + ': bấm Tiếp tục đóng màn', await wait(() => !document.querySelector('.rk-over'), null, 5000));
    } else console.log('  (trận này không qua ngưỡng bậc: bỏ qua màn thăng/hạ cấp ở ' + vp.n + ')');
    // Ảnh xem trước đường đua mới (art/maps) do nhánh Đường đua xuất, thiếu thì 404 không thuộc nhánh này.
    const mine = problems.filter((x) => !/art\/maps\/|Failed to load resource/.test(x));
    check(vp.n + ': không lỗi trang', mine.length === 0, mine.slice(0, 4).join(' | '));
    await page.context().close();
  }
  // Màn thăng/hạ cấp dựng trực tiếp (không phụ thuộc kết quả trận) để chắc chắn mỗi hướng được chụp.
  const { page, problems } = await open(br, srv.base, 'index.html');
  const wait = until(page);
  await wait(() => window.TD && TD.main && TD.main.state === 'lobby', null, 90000);
  for (const dir of ['up', 'dn']) {
    await page.evaluate((d) => {
      TD.save.d.rank = { pts: d === 'up' ? 299 : 220, best: 299, streak: 0, games: 0, wins: 0 };
      const p = TD.ranked.plugin;
      p.settle({ cards: [], dnf: false }, { R: { mode: { ranked: true }, karts: new Array(6) }, me: { place: d === 'up' ? 1 : 6 } });
      TD.main.resultShown = true;
      p.update();
    }, dir);
    check(dir + ': màn thăng/hạ cấp hiện đúng chiều', await wait((d) => document.querySelector('.rk-over.' + d), dir, 30000));
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
