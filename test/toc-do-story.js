/*
 * Tốc Độ: nhánh Cốt Truyện. node test/toc-do-story.js   (TD_URL=<gốc> để chạy trên Pages; TD_SHOTS=<thư mục ảnh>)
 *  - Node: chấm mục tiêu (TD.Story.status / evaluate / reward / unlocked) với số cụ thể, dữ liệu ải hợp lệ, số đường bất kỳ.
 *  - Trình duyệt: mở bản đồ, chọn ải 1, lời thoại, vào trận, danh sách mục tiêu trên HUD, về đích bằng bot, thẻ kết quả,
 *    sao được lưu, ải 2 mở, ở hai cỡ màn hình.
 */
'use strict';
const path = require('path');
const os = require('os');
const { check, done, nodeSim, serve, browser, open } = require('./toc-do-lib.js');
const shot = (page, name) => page.screenshot({ path: path.join(process.env.TD_SHOTS || path.join(os.tmpdir(), 'toc-do-shots'), name + '.png'), timeout: 180000 });

const TD = nodeSim(['data/story.js']).TD;
const S = TD.Story;
// Đường giả: hai đường vòng + một đường A→B (bị bỏ qua) + một đường vòng thêm (không có trong ORDER).
TD.TRACKS = { chinatown: { length: 3000, loop: true }, '11citynew': { length: 4770 }, huanghe02: { length: 6000, loop: false }, newtrack: { length: 3720 } };

console.log('Dữ liệu');
check('22 ải trong 4 chương (5 + 6 + 5 + 6)', S.levels.length === 22 && S.chapters.map((c) => c.levels.length).join() === '5,6,5,6');
check('id ải duy nhất, đúng dạng c<chương>l<số>', new Set(S.levels.map((l) => l.id)).size === 22 && S.levels[0].id === 'c1l1' && S.levels[21].id === 'c4l6');
check('mọi ải có 1-3 mục tiêu, mục tiêu đầu là hạng', S.levels.every((l) => l.goals.length >= 1 && l.goals.length <= 3 && l.goals[0].type === 'place'));
check('mọi ải có lời thoại trước, thắng, thua', S.levels.every((l) => l.pre.length && l.win.length && l.lose.length));
check('mọi nhân vật trong lời thoại và đối thủ có trong bảng NPC', S.levels.every((l) => [].concat(l.pre, l.win, l.lose).every((x) => S.NPC[x[0]]) && (!l.rival || S.NPC[l.rival.npc])));
check('ải có mục tiêu rival thì có đối thủ', S.levels.every((l) => !l.goals.some((g) => g.type === 'rival') || l.rival));
check('thưởng ải tăng dần: ải đầu 150 xu / 40 XP, ải cuối 780 xu / 124 XP', S.levels[0].coins === 150 && S.levels[0].xp === 40 && S.levels[21].coins === 780 && S.levels[21].xp === 124);
check('ải 1-1 thứ tự 0, ải cuối thứ tự 21', S.levels[0].seq === 0 && S.levels[21].seq === 21);

console.log('Đường đua theo số đường bất kỳ');
check('chỉ lấy đường vòng, theo ORDER rồi đường mới', S.trackIds().join() === '11citynew,chinatown,newtrack');
check('chỉ số ải quay vòng: ô 0 = 11citynew, ô 3 = 11citynew, ô 5 = newtrack', S.trackOf(0) === '11citynew' && S.trackOf(3) === '11citynew' && S.trackOf(5) === 'newtrack');
check('giờ chuẩn: 11citynew 2 vòng = 131 s, đường chưa đo newtrack 1 vòng = 3720/62 = 60 s', S.refTime('11citynew', 2) === 131 && S.refTime('newtrack', 1) === 60);
const L11 = S.levelById('c1l1'), G11 = S.resolve(L11);
check('ải 1-1 (11citynew, 1 vòng): giờ giới hạn 65,5 × 1,6 = 105 s, chữ "Hoàn thành trong 1:45"', G11[2].sec === 105 && G11[2].text === 'Hoàn thành trong 1:45');
check('chữ mục tiêu: top 3, drift 3 lần', G11[0].text === 'Về đích trong top 3' && G11[1].text === 'Drift 3 lần');
const Lb = S.levelById('c2l3'), Gb = S.resolve(Lb);
check('ải đối đầu: về nhất, về trước Khải Lợi, dẫn trước 30 mét (chuỗi gốc)', Gb[0].text === 'Về nhất' && Gb[1].text === 'Về trước Khải Lợi' && Gb[2].text === 'Dẫn trước đối thủ 30 mét');

console.log('Chấm mục tiêu');
const st = (o) => Object.assign({ over: false, dnf: false, place: 3, t: 50, time: null, drifts: 0, boosts: 0, wallHits: 0, respawns: 0, topKmh: 0, itemsGot: 0, itemHits: 0, gap: 0, rivalAhead: false }, o);
const at = (g, s) => S.status(g, st(s));
const P3 = { type: 'place', n: 3 };
check('hạng 3/3 khi về đích = đạt', at(P3, { over: true, place: 3 }).done === true);
check('hạng 4 khi về đích = hỏng', at(P3, { over: true, place: 4 }).failed === true && at(P3, { over: true, place: 4 }).done === false);
check('chưa về đích: hạng chưa chốt (không đạt, không hỏng)', !at(P3, { place: 2 }).done && !at(P3, { place: 2 }).failed);
check('hết giờ (dnf) hạng 1 vẫn hỏng', at({ type: 'place', n: 1 }, { over: true, dnf: true, place: 1 }).failed === true);
const D10 = { type: 'drifts', n: 10 };
check('drift 9/10 chưa đạt, 10/10 đạt ngay khi đang đua', !at(D10, { drifts: 9 }).done && at(D10, { drifts: 10 }).done && at(D10, { drifts: 10 }).val === 10);
check('drift 9/10 khi về đích = hỏng', at(D10, { over: true, drifts: 9 }).failed === true);
const W0 = { type: 'nowall', n: 0 };
check('không va tường: 1 lần là hỏng ngay giữa trận', at(W0, { wallHits: 1 }).failed === true && at(W0, { wallHits: 0 }).failed === false);
check('không va tường: chỉ đạt khi về đích mà chưa va', at(W0, { wallHits: 0 }).done === false && at(W0, { over: true, wallHits: 0 }).done === true);
check('va tường tối đa 3: 3 lần vẫn ổn, 4 lần hỏng', at({ type: 'nowall', n: 3 }, { over: true, wallHits: 3 }).done === true && at({ type: 'nowall', n: 3 }, { over: true, wallHits: 4 }).done === false);
check('không hồi sinh: 1 lần hồi sinh là hỏng', at({ type: 'norespawn', n: 0 }, { respawns: 1 }).failed === true && at({ type: 'norespawn', n: 0 }, { over: true, respawns: 0 }).done === true);
const T105 = { type: 'time', sec: 105 };
check('giờ: đang đua 106 s > 105 = hỏng, 104 s chưa hỏng', at(T105, { t: 106 }).failed === true && at(T105, { t: 104 }).failed === false);
check('giờ: về đích 100,3 s đạt, 105,2 s hỏng, dnf hỏng', at(T105, { over: true, time: 100.3, t: 100.3 }).done === true && at(T105, { over: true, time: 105.2 }).done === false && at(T105, { over: true, dnf: true, time: null }).done === false);
const RV = { type: 'rival' };
check('rival: về trước đạt, không thì hỏng', at(RV, { over: true, rivalAhead: true }).done === true && at(RV, { over: true, rivalAhead: false }).failed === true);
const GP = { type: 'gap', n: 30 };
check('dẫn 30 m: hạng 1 cách 31 m đạt, 29 m hỏng, hạng 2 cách 40 m hỏng', at(GP, { over: true, place: 1, gap: 31 }).done === true && at(GP, { over: true, place: 1, gap: 29 }).done === false && at(GP, { over: true, place: 2, gap: 40 }).done === false);
check('nhặt 6 hộp / dùng trúng 3 lần / đạt 240 km/h', at({ type: 'itemGet', n: 6 }, { itemsGot: 6 }).done && at({ type: 'itemHit', n: 3 }, { itemHits: 2 }).done === false && at({ type: 'topspeed', n: 240 }, { topKmh: 241 }).done);

console.log('Sao và thưởng');
const ev = (goals, s) => S.evaluate(goals, st(s));
const gs = [P3, D10, T105];
let r = ev(gs, { over: true, place: 2, drifts: 12, time: 110, t: 110 });
check('hạng 2, drift 12, 110 s > 105: đạt 2/3 mục tiêu = 2 sao, qua ải', r.cleared && r.stars === 2 && r.met.join() === 'true,true,false');
r = ev(gs, { over: true, place: 3, drifts: 10, time: 99, t: 99 });
check('đạt cả ba = 3 sao', r.stars === 3);
r = ev(gs, { over: true, place: 5, drifts: 20, time: 90, t: 90 });
check('trượt hạng thì không qua ải và 0 sao dù đạt mục tiêu khác', !r.cleared && r.stars === 0 && r.met.join() === 'false,true,true');
check('thưởng lần đầu 3 sao ải 150 xu: 150 + 3 × 40 = 270 xu, 40 XP', JSON.stringify(S.reward({ coins: 150, xp: 40 }, 0, 3)) === '{"coins":270,"xp":40,"first":true,"newStars":3}');
check('nâng từ 1 lên 2 sao: +40 xu, không XP', JSON.stringify(S.reward({ coins: 150, xp: 40 }, 1, 2)) === '{"coins":40,"xp":0,"first":false,"newStars":1}');
check('chơi lại không thêm sao: không thưởng', S.reward({ coins: 150, xp: 40 }, 3, 3).coins === 0);
check('đánh trượt (0 sao) không thưởng', S.reward({ coins: 150, xp: 40 }, 0, 0).coins === 0);

console.log('Tiến độ');
const sv = { stars: {}, chapter: 1, got: {} };
check('chỉ ải đầu mở lúc đầu', S.unlocked(sv, S.levels[0]) && !S.unlocked(sv, S.levels[1]) && S.firstOpen(sv).id === 'c1l1');
sv.stars.c1l1 = 1;
check('qua ải 1 thì mở ải 2, ải cần mở tiếp là c1l2', S.unlocked(sv, S.levels[1]) && !S.unlocked(sv, S.levels[2]) && S.firstOpen(sv).id === 'c1l2');
S.chapters[0].levels.forEach((l) => { sv.stars[l.id] = 2; });
check('đủ 5 ải chương 1: chương cleared, 10/15 sao, chương 2 mở', S.chapterCleared(sv, S.chapters[0]) && S.chapterStars(sv, S.chapters[0]) === 10 && S.chapterMax(S.chapters[0]) === 15 && S.chapterOpen(sv, S.chapters[1]));
check('chương 3 chưa mở', !S.chapterOpen(sv, S.chapters[2]));

(async () => {
  console.log('Trình duyệt');
  const srv = await serve();
  const br = await browser();
  const until = (page) => async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 250 }); return true; } catch (e) { return false; } };
  for (const vp of [{ n: 'pc', w: 1366, h: 650 }, { n: 'phone', w: 844, h: 390 }]) {
    console.log('  ' + vp.w + '×' + vp.h);
    const { page, problems } = await open(br, srv.base, 'index.html', { width: vp.w, height: vp.h }, vp.n === 'phone' ? { hasTouch: true, isMobile: true } : {});
    const wait = until(page);
    check(vp.n + ': sảnh mở, ô Cốt Truyện không khoá', await wait(() => window.TD && TD.main && TD.main.state === 'lobby' && document.querySelector('.lb-tile.t-story:not(.off)'), null, 90000));
    await page.evaluate(() => { TD.save.d.story = { stars: {}, chapter: 1, got: {} }; TD.save.d.coins = 1234; });
    await page.click('.lb-tile.t-story');
    check(vp.n + ': bản đồ chương 1 hiện 5 ghim, ải 1 mở, ải 2 khoá', await wait(() => document.querySelectorAll('.st-node').length === 5, null, 10000) &&
      await page.evaluate(() => !document.querySelector('[data-lv=c1l1]').classList.contains('lock') && document.querySelector('[data-lv=c1l2]').classList.contains('lock')));
    check(vp.n + ': ảnh ghim và nền tải được (naturalWidth > 0)', await wait(() => [...document.querySelectorAll('.st-pin, .st-base')].every((i) => i.complete && i.naturalWidth > 0) && document.querySelector('.st-bg').style.backgroundImage.length > 0, null, 15000));
    await page.waitForTimeout(300);
    await shot(page, 'story-map-' + vp.n);
    await page.click('[data-lv=c1l2]');
    check(vp.n + ': bấm ải khoá hiện "Ải chưa mở khóa"', await page.evaluate(() => /Ải chưa mở khóa/.test(document.querySelector('.st-card').textContent) && !document.querySelector('[data-act=start]')));
    await page.click('[data-lv=c1l1]');
    await page.waitForTimeout(300);
    await shot(page, 'story-card-' + vp.n);
    const lay = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.st-back, .st-tab, .st-node, .st-card, .st-go, .st-foot .btn')].map((e) => { const b = e.getBoundingClientRect(); return { c: e.className, x: b.left, y: b.top, r: b.right, b: b.bottom, h: b.height, w: b.width }; });
      return { r, goals: document.querySelectorAll('.st-goals li').length, scroll: document.documentElement.scrollWidth };
    });
    check(vp.n + ': thẻ ải 1-1 liệt kê 3 mục tiêu', lay.goals === 3);
    check(vp.n + ': mọi thành phần nằm trong màn hình', lay.r.every((b) => b.x >= -1 && b.y >= 0 && b.r <= vp.w + 1 && b.b <= vp.h + 1), JSON.stringify(lay.r.filter((b) => b.x < -1 || b.y < 0 || b.r > vp.w + 1 || b.b > vp.h + 1)));
    check(vp.n + ': nút ≥ 44 px (Về sảnh, tab, Bắt đầu, Nhận)', lay.r.filter((b) => /btn|st-tab/.test(b.c)).every((b) => b.h >= 44), lay.r.filter((b) => /btn|st-tab/.test(b.c)).map((b) => b.h).join());
    check(vp.n + ': ghim đủ lớn để chạm (≥ 44 px)', lay.r.filter((b) => /st-node/.test(b.c)).every((b) => b.w >= 44 && b.h >= 44));
    // Bắt đầu: lời thoại trước ải rồi vào trận.
    await page.click('.st-go');
    check(vp.n + ': lời thoại trước ải hiện, nói bởi Tiểu Quất', await wait(() => document.querySelector('.st-dlg .st-dtext b') && document.querySelector('.st-dlg .st-dtext b').textContent === 'Tiểu Quất', null, 5000));
    await page.waitForTimeout(900);
    await shot(page, 'story-dialogue-' + vp.n);
    check(vp.n + ': ảnh chân dung tải được', await page.evaluate(() => { const i = document.querySelector('.st-dface'); return i && i.complete && i.naturalWidth > 0; }));
    await page.click('.st-skip');
    check(vp.n + ': vào trận Cốt Truyện (1 vòng, 4 xe, không đạo cụ, đường 11citynew)', await wait(() => TD.main.state === 'race' && TD.main.race && TD.main.race.mode.id === 'story' && TD.main.me && TD.main.views && TD.story.state.L && TD.story.state.ctx === TD.main.ctx, null, 900000) &&
      await page.evaluate(() => { const R = TD.main.race; return R.laps === 1 && R.karts.length === 4 && !R.mode.items && R.trackId === '11citynew'; }));
    const sk = await page.evaluate(() => TD.main.race.karts.filter((k) => k !== TD.main.me).map((k) => +k.bot.skill.toFixed(2)));
    check(vp.n + ': kỹ năng bot rải từ 0,35 xuống 0,25', sk.join() === '0.35,0.3,0.25', sk.join());
    // Giữa trận: chạy 20 s bằng bot rồi chụp danh sách mục tiêu trên HUD.
    await page.evaluate(() => {
      const R = TD.main.race;
      TD.main.me.ctrl = 'bot'; TD.Bot.init(TD.main.me, R, 0.99);
      for (let i = 0; i < 60 * 24; i++) TD.Race.step(R, 1 / 60);
    });
    await page.waitForTimeout(1500);
    await shot(page, 'story-hud-' + vp.n);
    const hud = await page.evaluate(() => { const S = TD.Story, P = TD.story.state; return { n: P.goals.length, drifts: TD.main.me.stats.drifts, live: S.status(P.goals[1], S.stats(TD.main.race, TD.main.me, P.c, P.rival)).val }; });
    check(vp.n + ': HUD có 3 mục tiêu và đếm drift sống (' + hud.drifts + ')', hud.n === 3 && hud.live === hud.drifts);
    // Chạy tới khi mình về đích rồi tua nhanh phần ăn mừng.
    await page.evaluate(() => {
      const R = TD.main.race;
      for (let i = 0; i < 60 * 300 && TD.main.me.st !== 'finish'; i++) TD.Race.step(R, 1 / 60);
      TD.main.timeScale = 6;
    });
    check(vp.n + ': thẻ kết quả có thẻ Cốt Truyện', await wait(() => document.querySelector('.st-fcard'), null, 900000));
    await page.waitForTimeout(500);
    await shot(page, 'story-result-card-' + vp.n);
    const sv1 = await page.evaluate(() => ({ s: TD.save.d.story, f: TD.main.fin.story && { stars: TD.main.fin.story.stars, cleared: TD.main.fin.story.ev.cleared, met: TD.main.fin.story.ev.met }, place: TD.main.me.place, coins: TD.save.d.coins, card: document.querySelectorAll('.st-fcard li').length }));
    check(vp.n + ': qua ải 1-1 (bot về hạng ' + sv1.place + '), sao lưu vào TD.save.d.story.stars.c1l1 = ' + (sv1.f && sv1.f.stars), sv1.f && sv1.f.cleared && sv1.s.stars.c1l1 === sv1.f.stars && sv1.f.stars >= 1 && sv1.s.stars.c1l1 === sv1.f.met.filter(Boolean).length, JSON.stringify(sv1.s));
    check(vp.n + ': thẻ liệt kê 3 mục tiêu và xu đã cộng (hơn 1234)', sv1.card === 3 && sv1.coins > 1234 + 150);
    check(vp.n + ': bản lưu localStorage có sao', await page.evaluate(() => JSON.parse(localStorage.getItem('td.save.v1')).story.stars.c1l1 >= 1));
    check(vp.n + ': bảng kết quả thay nút: ĐUA LẠI, BẢN ĐỒ, ẢI TIẾP', await wait(() => TD.main.resultShown && document.querySelector('[data-st=next]'), null, 60000) &&
      await page.evaluate(() => [...document.querySelectorAll('.fin-table .acts button')].map((b) => b.textContent).join() === 'ĐUA LẠI,BẢN ĐỒ,ẢI TIẾP'));
    check(vp.n + ': bảng kết quả hiện đủ (không mờ, ≥ 4 hàng)', await wait(() => { const t = document.querySelector('.fin-table'); return t && getComputedStyle(t).opacity === '1' && document.querySelectorAll('.fin-table .row').length >= 4; }, null, 30000));
    await page.waitForTimeout(600);
    await shot(page, 'story-result-table-' + vp.n);
    const ab = await page.evaluate(() => [...document.querySelectorAll('.fin-table .acts button')].map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, ok: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }));
    check(vp.n + ': nút kết quả ≥ 38 px và trong màn hình', ab.every((b) => b.h >= 38 && b.ok), JSON.stringify(ab));
    await page.click('[data-st=next]');
    check(vp.n + ': ẢI TIẾP mở bản đồ với ải 1-2 đã mở và được chọn', await wait(() => TD.main.state === 'lobby' && document.querySelector('.st') && TD.story.V.sel === 'c1l2', null, 30000) &&
      await page.evaluate(() => !document.querySelector('[data-lv=c1l2]').classList.contains('lock') && /Bẻ Lái Đầu Tiên/.test(document.querySelector('.st-card').textContent)));
    await page.waitForTimeout(400);
    await shot(page, 'story-map2-' + vp.n);
    const stars = await page.evaluate(() => document.querySelectorAll('[data-lv=c1l1] .st-nstars i.on').length);
    check(vp.n + ': ghim ải 1 hiện đúng số sao đã đạt', stars === sv1.f.stars, String(stars));
    const mine = problems.filter((x) => !/Failed to load resource/.test(x));
    check(vp.n + ': không lỗi trang', mine.length === 0, mine.slice(0, 4).join(' | '));
    await page.context().close();
  }
  await br.close(); srv.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });   // thoát hẳn để Chromium không giữ chỗ
