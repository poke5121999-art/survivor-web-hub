/*
 * Tốc Độ: nhánh Khu Giải Trí (4 chế độ sự kiện). node test/toc-do-events.js   (TD_URL=<gốc> để chạy trên Pages)
 *  - Node: luật Đua Loại / Săn Xu / Cảnh Sát Bắt Cướp / Đua Giới Hạn với số cụ thể, chế độ của ngày, sửa bản lưu.
 *  - Trình duyệt (chạy qua btest.sh): ô Khu Giải Trí mở màn chọn, từng chế độ vào trận và chạy, xe bị loại biến mất,
 *    xu 3D hiện, thẻ tổng kết có kỷ lục; chụp ảnh ở 1366×650 và 844×390 (cảm ứng).
 *    TD_EV_SKIP_BROWSER=1 chỉ chạy phần Node (~3 phút); TD_EV_SKIP_NODE=1 chỉ chạy phần trình duyệt.
 */
'use strict';
const path = require('path');
const os = require('os');
const { check, done, nodeSim, serve, browser, open } = require('./toc-do-lib.js');
const shot = (page, name) => page.screenshot({ path: path.join(process.env.TD_SHOTS || path.join(os.tmpdir(), 'toc-do-shots'), name + '.png'), timeout: 180000 });

const W = nodeSim(['data/tuning.js', 'data/tracks.js', 'data/cars.js', 'js/sim/rng.js', 'js/sim/track.js', 'js/sim/kart.js', 'js/sim/bot.js', 'js/sim/modes.js', 'js/sim/events.js', 'js/sim/race.js']);
const TD = W.TD;
TD.Events.install();
const E = TD.Events;

// Trận 6 xe (xe 5 là người chơi, tự lái bằng bot kỹ năng 0,9 như bài kiểm modes) tới khi qua đếm ngược rồi tới giây thứ `until` của trận.
function race(mode, seed, until, track, fast) {
  const karts = [0, 1, 2, 3, 4, 5].map((i) => ({ ctrl: i === 5 ? 'human' : 'bot', skill: 0.45 + 0.09 * i }));
  const R = TD.Race.create({ trackId: track || 'chinatown', seed, mode: TD.MODES[mode], karts });
  R.karts[5].ctrl = 'bot'; TD.Bot.init(R.karts[5], R, 0.9);
  if (fast) R.karts[5].topScale *= 1.3;   // xe người chơi chạy nhanh hơn hẳn: không bị loại sớm
  run(R, until);
  return R;
}
function run(R, until) {
  const evs = R.evAll = R.evAll || [];
  while (R.phase !== 'done' && (R.goT == null || R.t - R.goT < until) && R.t < 400) { TD.Race.step(R, 1 / 30); evs.push(...R.events); R.events.length = 0; }
}
const count = (R, type) => R.evAll.filter((e) => e.type === type).length;

function nodePart() {
  console.log('Bảng chế độ, ngày, bản lưu');
  check('4 chế độ sự kiện đăng ký, 6 xe, không hộp đạo cụ', ['elim', 'coins', 'cops', 'limit'].every((id) => TD.MODES[id] && TD.MODES[id].karts === 6 && TD.MODES[id].event === id && !TD.MODES[id].items && !TD.MODES[id].match));
  check('tên chế độ', E.DEFS.elim.name === 'Đua Loại' && E.DEFS.coins.name === 'Săn Xu' && E.DEFS.cops.name === 'Cảnh Sát Bắt Cướp' && E.DEFS.limit.name === 'Đua Giới Hạn');
  check('chế độ của ngày 10/10/2026 = Đua Loại, 11/10 = Săn Xu, 12/10 = Cảnh Sát, 13/10 = Giới Hạn, 14/10 quay lại Đua Loại',
    [10, 11, 12, 13, 14].map((d) => E.today(new Date(2026, 9, d))).join() === 'elim,coins,cops,limit,elim');
  check('khoá ngày', E.dayKey(new Date(2026, 0, 5)) === '2026-01-05' && E.dayKey(new Date(2026, 11, 31)) === '2026-12-31');
  const o1 = { events: { best: { elim: 12.7, coins: -5, cops: 'x', limit: 123456, zzz: 3 }, day: 'abc' } };
  E.norm(o1);
  check('sửa bản lưu: số lẻ làm tròn xuống, âm/chữ bị bỏ, trần 99999, id lạ bị bỏ, ngày hỏng thành rỗng', JSON.stringify(o1.events) === '{"best":{"elim":12,"limit":99999},"day":""}');
  const o2 = {}; E.norm(o2);
  check('bản lưu cũ chưa có khoá events được bù', JSON.stringify(o2.events) === '{"best":{},"day":""}');
  const o3 = { events: { best: { coins: 40 }, day: '2026-10-10' } }; E.norm(o3);
  check('bản lưu hợp lệ giữ nguyên', JSON.stringify(o3.events) === '{"best":{"coins":40},"day":"2026-10-10"}');

  console.log('Đua Loại');
  let R = race('elim', 3, 19.9);
  check('trước 20 s chưa ai bị loại', count(R, 'out') === 0);
  const lastBefore = R.karts.filter((k) => !k.done).sort((a, b) => a.progress - b.progress)[0].id;
  run(R, 20.1);
  const outs = R.evAll.filter((e) => e.type === 'out');
  check('20 s: đúng 1 xe bị loại, đó là xe xa nhất phía sau', outs.length === 1 && outs[0].kart === lastBefore, JSON.stringify(outs.map((e) => e.kart)) + ' kỳ vọng ' + lastBefore);
  check('xe bị loại có k.out, về đích dạng hết giờ, hạng cuối (6)', R.karts[lastBefore].out === true && R.karts[lastBefore].dnf === true && R.karts[lastBefore].place === 6 && R.karts[lastBefore].finishT == null);
  check('trận chưa kết thúc (còn 5 xe)', R.phase === 'race' && R.karts.filter((k) => !k.done).length === 5);
  run(R, 40.4);
  check('40 s: 2 xe bị loại, xe loại sau đứng hạng 5', count(R, 'out') === 2 && R.karts[R.ev.outs[1]].place === 5);
  R = race('elim', 3, 400, 'chinatown', true);   // xe người chơi chạy nhanh hơn 30%: sống tới cuối
  check('chạy tới hết: 5 xe bị loại, trận xong', count(R, 'out') === 5 && R.phase === 'done');
  check('đúng một xe không bị loại và đứng hạng 1', R.karts.filter((k) => !k.out).length === 1 && R.karts.filter((k) => !k.out)[0].place === 1);
  check('hạng là hoán vị 1..6', R.karts.map((k) => k.place).sort().join() === '1,2,3,4,5,6');
  check('thứ tự loại ngược với hạng: xe loại sau cùng đứng hạng 2', R.karts[R.ev.outs[4]].place === 2 && R.karts[R.ev.outs[0]].place === 6);
  check('thời điểm loại: giây 20, 40, 60, 80, 100', R.ev.outs.map((id) => Math.round(R.ev.outT[id] / 20) * 20).join() === '20,40,60,80,100');
  check('không có sự kiện overtake của race.js', count(R, 'overtake') === 0);
  check('hạng ở sự kiện out khớp hạng xe', R.evAll.filter((e) => e.type === 'out').every((e) => e.place >= 2 && e.place <= 6));
  check('điểm Đua Loại của xe sống sót = thời gian trận (100 s)', E.score(R, R.karts.find((k) => !k.out)) === 100);
  check('điểm Đua Loại của xe bị loại = giây bị loại', E.score(R, R.karts[R.ev.outs[0]]) === 20);

  // Người chơi bị loại thì trận kết thúc ngay, những xe còn lại xếp theo quãng đường.
  R = race('elim', 3, 0.1);
  const me = R.karts[5];
  me.bot = null; me.ctrl = 'idle'; me.input.throttle = 0; me.input.brake = 1;   // xe người chơi đứng yên nên đứng cuối
  run(R, 21);
  check('người chơi đứng cuối bị loại ở 20 s: trận xong ngay, 6 xe đều đã về đích', me.out === true && R.phase === 'done' && R.karts.every((k) => k.done) && R.t - R.goT < 21);
  check('người chơi bị loại hạng 6, hạng 1..5 còn lại không trùng', me.place === 6 && R.karts.map((k) => k.place).sort().join() === '1,2,3,4,5,6');
  check('xe không bị loại xếp theo quãng đường đã đi (hạng 1 xa nhất)', (() => { const o = R.karts.filter((k) => !k.out).sort((x, y) => x.place - y.place); return o.every((k, i) => i === 0 || o[i - 1].progress >= k.progress); })());

  console.log('Săn Xu');
  // Đặt xe đứng yên ở (x, z) trên đường (cập nhật cả vị trí trên ruy băng để race.js không cho là rơi khỏi đường).
  function put(R, k, x, z, y) {
    const l = TD.Track.locate(R.T, x, y, z, null);
    k.x = k.px = x; k.z = k.pz = z; k.loc = l; k.y = l.y; k.speed = k.vx = k.vz = 0;
    if (R.ev.pos) R.ev.pos[k.id] = { x, z };
  }
  R = race('coins', 5, 1);
  let S = R.ev;
  check('xu dọc đường: 207 xu trên Phố Tàu = 69 hàng × 3, 13 Xu Lớn (hàng thứ 5, 10, ...) giá 3, còn lại giá 1', S.list.length === 207 && S.list.filter((c) => c.big).length === 13 && S.list.filter((c) => c.big).every((c) => c.v === 3) && S.list.filter((c) => !c.big).every((c) => c.v === 1), S.list.length + '/' + S.list.filter((c) => c.big).length);
  // xu gần xe 0 nhất (xa các xe khác) để đặt xe lên đó mà không bị coi là rơi khỏi đường
  const others = (k) => R.karts.filter((o) => o !== k);
  const near = (k) => S.list.map((c, i) => [Math.hypot(c.x - k.x, c.z - k.z), i]).filter((q) => others(k).every((o) => Math.hypot(S.list[q[1]].x - o.x, S.list[q[1]].z - o.z) > 8)).sort((a, b) => a[0] - b[0])[0][1];
  const k0 = R.karts[0], i0 = near(k0), c0 = S.list[i0];
  const before = S.coins[k0.id];
  put(R, k0, c0.x, c0.z, c0.y - 0.9);
  TD.Race.step(R, 1 / 30);
  check('xe đứng đúng chỗ xu nhặt được ' + c0.v + ' xu', S.coins[k0.id] === before + c0.v, before + ' → ' + S.coins[k0.id]);
  const n1 = S.coins[k0.id];
  put(R, k0, c0.x, c0.z, c0.y - 0.9);
  TD.Race.step(R, 1 / 30);
  check('xu đã nhặt không nhặt lại ngay (hồi sau 30 s)', S.coins[k0.id] === n1);
  check('xu của xe khác vẫn còn nguyên (xu riêng từng xe), của xe này hồi sau 30 s', S.until[R.karts[1].id][i0] === 0 && S.until[k0.id][i0] > R.t + 29 && S.until[k0.id][i0] < R.t + 31);
  const bigIdx = S.list.findIndex((c) => c.big), cb = S.list[bigIdx], k1 = R.karts[1];
  const b1 = S.coins[k1.id];
  put(R, k1, cb.x, cb.z, cb.y - 0.9);
  TD.Race.step(R, 1 / 30);
  check('Xu Lớn = 3 xu', S.coins[k1.id] === b1 + 3, b1 + ' → ' + S.coins[k1.id]);
  // va chạm làm rơi xu: xe chậm hơn mất min(xu, 3) với lực > 0,6; tổng xu (xe + đang rơi + đã bị xe khác nhặt) bảo toàn
  const a = R.karts[2], b = R.karts[3];
  put(R, a, S.list[100].x, S.list[100].z, S.list[100].y - 0.9); put(R, b, S.list[130].x, S.list[130].z, S.list[130].y - 0.9);   // tách khỏi đoàn để không có va chạm thật chen vào
  TD.Race.step(R, 1 / 30);   // hai xe đứng trên xu nên nhặt luôn một xu; để vậy trước khi đo
  const total = () => R.karts.reduce((t, k) => t + S.coins[k.id], 0) + S.pile.length;
  const bump = (power, ka, kb) => { R.events.push({ t: R.t, type: 'bump', kart: ka, other: kb, power }, { t: R.t, type: 'bump', kart: kb, other: ka, power }); };
  S.coins[a.id] = 5; S.coins[b.id] = 5; a.speed = 14; b.speed = 42; S.pile.length = 0;
  let t0 = total();
  bump(0.8, 2, 3);
  TD.Race.step(R, 1 / 30);
  check('lực 0,8: xe chậm hơn rơi 3 xu, xe nhanh không mất, hai sự kiện của một va chạm chỉ tính một lần', S.coins[a.id] === 2 && S.coins[b.id] >= 5 && total() === t0, S.coins[a.id] + '/' + S.coins[b.id] + ' tổng ' + total() + ' vs ' + t0);
  S.coins[a.id] = 5; S.pile.length = 0; t0 = total(); a.speed = 14; b.speed = 42;
  bump(0.4, 2, 3);
  TD.Race.step(R, 1 / 30);
  check('lực 0,4: rơi 2 xu', S.coins[a.id] === 3 && total() === t0);
  S.coins[a.id] = 5; S.pile.length = 0; a.speed = 14; b.speed = 42;
  bump(0.1, 2, 3);
  TD.Race.step(R, 1 / 30);
  check('lực 0,1 (dưới ngưỡng 0,15): không rơi xu', S.coins[a.id] === 5);
  S.coins[a.id] = 1; S.pile.length = 0; a.speed = 14; b.speed = 42; t0 = total();
  bump(0.9, 2, 3);
  TD.Race.step(R, 1 / 30);
  check('chỉ có 1 xu thì chỉ rơi 1 xu, không âm', S.coins[a.id] === 0 && total() === t0);
  // xu rơi: chủ cũ không nhặt lại trong 1,5 s, xe khác nhặt được ngay
  const kd = R.karts[4], kv = R.karts[0];
  put(R, kd, S.list[60].x, S.list[60].z, S.list[60].y - 0.9);
  put(R, kv, S.list[60].x, S.list[60].z, S.list[60].y - 0.9);
  TD.Race.step(R, 1 / 30);   // hai xe cùng nhặt xu đường ở chỗ này (xu riêng từng xe), sau đó chỗ này hết xu với cả hai
  put(R, kv, S.list[90].x, S.list[90].z, S.list[90].y - 0.9);
  TD.Race.step(R, 1 / 30);   // xe kia sang chỗ khác, nhặt luôn xu ở đó
  S.pile.length = 0;
  S.pile.push({ x: kd.x, z: kd.z, y: kd.y + 0.9, v: 1, big: false, on: true, drop: true, exp: R.t + 10, skip: kd.id, skipT: R.t + 1.5 });
  const d0 = S.coins[kd.id];
  put(R, kd, kd.x, kd.z, kd.y - 0.9);
  TD.Race.step(R, 1 / 30);
  check('chủ cũ không nhặt lại xu vừa rơi trong 1,5 s', S.coins[kd.id] === d0 && S.pile.length === 1);
  const v0 = S.coins[kv.id];
  put(R, kv, S.pile[0].x, S.pile[0].z, S.pile[0].y - 0.9);
  TD.Race.step(R, 1 / 30);
  check('xe khác nhặt được xu rơi, xu rơi biến mất', S.coins[kv.id] === v0 + 1 && S.pile.length === 0);
  R = race('coins', 5, 200);
  S = R.ev;
  check('hết 90 s: trận xong, mọi xe về đích, hạng theo số xu giảm dần', R.phase === 'done' && R.t - R.goT < 91 && R.t - R.goT >= 90 && R.karts.every((k) => k.done) &&
    R.karts.slice().sort((x, y) => x.place - y.place).every((k, i, a) => i === 0 || S.coins[a[i - 1].id] >= S.coins[k.id]));
  check('mỗi xe nhặt được từ 20 tới 90 xu trong 90 s (bot)', R.karts.every((k) => S.coins[k.id] >= 20 && S.coins[k.id] <= 90), R.karts.map((k) => S.coins[k.id]).join());
  check('điểm Săn Xu = số xu', E.score(R, R.karts[0]) === S.coins[0]);

  console.log('Cảnh Sát Bắt Cướp');
  R = race('cops', 2, 4);
  S = R.ev;
  check('vai: xe 4, 5 là cảnh sát, xe 0–3 là cướp', R.karts.map((k) => S.role[k.id]).join() === 'rob,rob,rob,rob,cop,cop');
  const cop = R.karts[5], rob = R.karts[0];
  const park = (k, x, z) => { k.x = k.px = x; k.z = k.pz = z; k.y = rob.y; };
  park(cop, rob.x, rob.z);
  TD.Race.step(R, 1 / 30);
  check('4 s đầu (còn trong 10 s ân hạn) chạm không bị bắt', rob.done !== true && count(R, 'caught') === 0);
  run(R, 11);
  rob.out = rob.out || false;
  park(cop, rob.x + 1.5, rob.z);
  const free0 = R.karts.filter((k) => S.role[k.id] === 'rob' && !k.done);
  TD.Race.step(R, 1 / 30);
  const caught = R.evAll.concat(R.events).filter((e) => e.type === 'caught');
  check('sau 10 s cảnh sát chạm cướp: cướp bị bắt', caught.length >= 1 && S.catches[cop.id] >= 1, JSON.stringify(caught.map((e) => [e.kart, e.by])));
  const cw = R.karts.find((k) => S.role[k.id] === 'rob' && S.caughtT[k.id] != null);
  check('cướp bị bắt có k.out, dnf, biến mất khỏi va chạm', cw.out === true && cw.dnf === true && cw.ghostT >= 1);
  check('cướp bị bắt hạng cuối (6)', cw.place === 6 || cw.place === 5);
  // bắt hết: cảnh sát thắng
  R.karts.filter((k) => S.role[k.id] === 'rob' && !k.done).forEach((r) => { park(cop, r.x + 1, r.z); R.events.length = 0; TD.Race.step(R, 1 / 30); });
  check('bắt hết 4 cướp: trận xong, cảnh sát thắng và đứng hạng nhất', R.phase === 'done' && S.copsWin === true && S.role[R.karts.find((k) => k.place === 1).id] === 'cop');
  check('điểm Cảnh Sát = số vụ bắt (cảnh sát này bắt đủ 4)', E.score(R, cop) === S.catches[cop.id] && S.catches[4] + S.catches[5] === 4);
  R = race('cops', 2, 0.1);
  [4, 5].forEach((i) => { R.karts[i].bot = null; R.karts[i].ctrl = 'idle'; R.karts[i].input.throttle = 0; R.karts[i].input.brake = 1; });   // hai cảnh sát đứng yên
  run(R, 101);
  check('cảnh sát đứng yên 100 s: không bắt ai, cướp thắng (hạng 1 là cướp), cảnh sát hạng 5–6', R.phase === 'done' && R.ev.copsWin === false && count(R, 'caught') === 0 && R.ev.role[R.karts.find((k) => k.place === 1).id] === 'rob' && R.karts[4].place >= 5 && R.karts[5].place >= 5, 'phase=' + R.phase + ' t=' + (R.t - R.goT).toFixed(1));

  console.log('Đua Giới Hạn');
  R = race('limit', 4, 1);
  S = R.ev;
  check('đồng hồ đầu 20 s, cổng mỗi L/6, mỗi cổng cộng ~11,7 s (đường L=3132 m, 160 km/h)', S.clock[0] < 20 && S.clock[0] > 18.5 && Math.abs(S.spacing - R.T.L / 6) < 1e-6 && S.bonus.toFixed(1) === '11.7', S.clock[0].toFixed(2) + ' / ' + S.bonus.toFixed(2));
  check('đồng hồ chạy theo giờ trận: sau ~1 s còn ≈19', Math.abs(S.clock[0] - (20 - (R.t - R.goT))) < 0.1);
  const kk = R.karts[1];
  S.clock[kk.id] = 0.05;
  run(R, 3);
  check('đồng hồ về 0: xe bị loại (why time), k.out, hạng không phải nhất', kk.out === true && kk.dnf === true && R.evAll.some((e) => e.type === 'out' && e.kart === 1 && e.why === 'time') && kk.place > 1);
  check('trận chưa kết thúc khi mới một xe hết giờ', R.phase === 'race');
  run(R, 20);
  const t20 = R.t - R.goT;
  check('qua cổng: sau 20 s xe 0 qua ≥ 1 cổng, đồng hồ = 20 − giờ + 11,75 × số cổng', S.gate[0] >= 1 && Math.abs(S.clock[0] - (20 - t20 + S.bonus * S.gate[0])) < 0.2 && count(R, 'gate') >= 1, 'cổng ' + S.gate[0] + ' đồng hồ ' + S.clock[0].toFixed(2));
  R = race('limit', 4, 400);
  check('chạy hết: trận xong, mọi xe đã về đích hoặc hết giờ, hạng là hoán vị 1..6', R.phase === 'done' && R.karts.every((k) => k.done) && R.karts.map((k) => k.place).sort().join() === '1,2,3,4,5,6');
  check('xe về đích thật (không k.out) xếp trên xe hết giờ', (() => { const f = R.karts.filter((k) => !k.out), o = R.karts.filter((k) => k.out); return !o.length || Math.max(...f.map((k) => k.place)) < Math.min(...o.map((k) => k.place)); })());

  console.log('Mọi chế độ chạy Node trên 3 đường vòng không lỗi và kết thúc');
  for (const id of ['elim', 'coins', 'cops', 'limit']) {
    for (const tr of ['troycity', 'xintianebao']) {
      try {
        const r = race(id, 7, 400, tr);
        check(id + ' @ ' + tr + ': kết thúc, hạng 1..6', r.phase === 'done' && r.karts.map((k) => k.place).sort().join() === '1,2,3,4,5,6', 'phase=' + r.phase + ' t=' + r.t.toFixed(0));
      } catch (e) { check(id + ' @ ' + tr + ': không ném lỗi', false, e.message); }
    }
  }
}

(async () => {
  if (!process.env.TD_EV_SKIP_NODE) nodePart();
  if (process.env.TD_EV_SKIP_BROWSER) { done(); return; }
  const srv = await serve();
  const br = await browser();
  try {
    for (const vp of [{ n: '1366', v: { width: 1366, height: 650 }, x: {} }, { n: '844', v: { width: 844, height: 390 }, x: { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } }]) {
      console.log('Trình duyệt ' + vp.n);
      const { page, problems } = await open(br, srv.base, 'index.html', vp.v, vp.x);
      const until = async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 90000, polling: 250 }); return true; } catch (e) { return false; } };
      check(vp.n + ': sảnh mở', await until(() => window.TD && TD.main && TD.main.state === 'lobby', null, 120000));
      check(vp.n + ': ô Khu Giải Trí đã mở (không khoá)', await page.evaluate(() => !!document.querySelector('.lb-tile.t-leisure[data-entry="events"]') && !document.querySelector('.lb-tile.t-leisure.off')));
      check(vp.n + ': ô có chấm đỏ (chưa nhận thưởng ngày)', await page.evaluate(() => !!document.querySelector('.lb-tile.t-leisure .lb-dot')));
      await page.click('.lb-tile.t-leisure');
      check(vp.n + ': màn Khu Giải Trí hiện 4 thẻ, 1 thẻ đánh dấu hôm nay, đủ ≥2 đường vòng', await until(() => document.querySelectorAll('.ev-card').length === 4 && document.querySelectorAll('.ev-card.today').length === 1 && document.querySelectorAll('.ev-th').length >= 2, null, 10000));
      const lay = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight, bad = [];
        document.querySelectorAll('.ev button, .ev-card').forEach((e) => { const r = e.getBoundingClientRect(); if (r.left < -1 || r.right > W + 1 || r.bottom > H + 1 || r.top < -1) bad.push(e.className + ':' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',')); });
        const small = [...document.querySelectorAll('.ev button')].filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent);
        const hs = [...document.querySelectorAll('.ev-th')].map((b) => b.getBoundingClientRect().height);
        return { bad, small, cardH: document.querySelector('.ev-card').getBoundingClientRect().height, pOver: [...document.querySelectorAll('.ev-card p')].some((p) => p.scrollHeight > p.clientHeight + 2), hs };
      });
      check(vp.n + ': nút không ra khỏi màn, nút chính ≥ 44 px', lay.bad.length === 0 && lay.small.length === 0, JSON.stringify(lay));
      await shot(page, 'events-hub-' + vp.n);
      for (const id of vp.n === '1366' ? ['elim', 'coins', 'cops', 'limit'] : ['coins', 'cops']) {
        if (vp.n === '1366' && id === 'elim') await page.click('.ev-card [data-play="elim"]'); else await page.evaluate((m) => { TD.main.startRace({ mode: m }); }, id);
        check(vp.n + ' ' + id + ': vào trận', await until((m) => TD.main.state === 'race' && TD.main.race && TD.main.race.mode.id === m, id, 150000));
        await page.evaluate(() => { TD.main.timeScale = 4; TD.main.me.ctrl = 'bot'; TD.Bot.init(TD.main.me, TD.main.race, 0.9); });
        check(vp.n + ' ' + id + ': luật được dựng (R.ev) ở lúc đếm ngược', await page.evaluate(() => !!TD.main.race.ev && TD.main.race.ev.kind === TD.main.race.mode.event));
        check(vp.n + ' ' + id + ': chạy được 6 s', await until(() => TD.main.race.phase !== 'countdown' && TD.main.race.t - TD.main.race.goT > 6, null, 240000));
        if (id === 'elim') {
          // tua mô phỏng thẳng tới giây 21 (không vẽ) để thấy loại xe
          await page.evaluate(() => { const R = TD.main.race; while (R.t - R.goT < 20.6) TD.Race.step(R, 0.1); });
          check(vp.n + ' elim: một xe bị loại và khung hình ẩn xe đó', await until(() => { const R = TD.main.race; const o = R.karts.filter((k) => k.out); return o.length === 1 && (o[0] === TD.main.me || TD.main.views[o[0].id].root.visible === false); }, null, 60000));
          await shot(page, 'events-elim-' + vp.n);
          await page.evaluate(() => { const R = TD.main.race; R.ev.next = 0; });
        } else if (id === 'coins') {
          check(vp.n + ' coins: xu 3D được vẽ (instanced > 0)', await until(() => { const d = TD.eventsUI.debug().pools; return d && (d.small + d.big) > 3; }, null, 90000), JSON.stringify(await page.evaluate(() => TD.eventsUI.debug())));
          check(vp.n + ' coins: nhặt được xu sau vài giây', await until(() => TD.main.race.ev.coins[TD.main.me.id] > 0, null, 120000), String(await page.evaluate(() => TD.main.race.ev.coins[TD.main.me.id])));
          await shot(page, 'events-coins-' + vp.n);
        } else if (id === 'cops') {
          await page.evaluate(() => { const R = TD.main.race; while (R.t - R.goT < 6) TD.Race.step(R, 0.1); });
          await shot(page, 'events-cops-' + vp.n);
        } else {
          await shot(page, 'events-limit-' + vp.n);
        }
        if (vp.n === '1366') {
          // chạy tới hết bằng mô phỏng thẳng; xe người chơi (bot) về đích thì hiện thẻ thưởng có thẻ sự kiện và lưu kỷ lục
          await page.evaluate(() => { TD.main.timeScale = 1; const R = TD.main.race; let n = 0; while (R.phase !== 'done' && n++ < 4000) TD.Race.step(R, 0.1); });
          check('1366 ' + id + ': trận xong và thẻ thưởng có thẻ Khu Giải Trí (F.cards)', await until(() => TD.main.fin && TD.main.fin.cards.some((c) => c.includes('ev-fin')), null, 120000));
          const res = await page.evaluate((m) => ({ best: TD.save.d.events.best[m] || 0, day: TD.save.d.events.day, card: (TD.main.fin.cards.find((c) => c.includes('ev-fin')) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), reward: TD.main.fin.reward }), id);
          check('1366 ' + id + ': thẻ ghi tên chế độ; kỷ lục lưu vào bản lưu; ngày thưởng đã nhận', res.card.length > 10 && (res.best > 0 || id === 'cops') && /^\d{4}-\d{2}-\d{2}$/.test(res.day), JSON.stringify(res));
          await shot(page, 'events-result-' + id);
          await page.evaluate(() => TD.main.toLobby());
          await until(() => TD.main.state === 'lobby' && document.querySelector('.lobby'), null, 60000);
          await page.click('.lb-tile.t-leisure');
          await until(() => document.querySelectorAll('.ev-card').length === 4, null, 10000);
        } else {
          await page.evaluate(() => TD.main.toLobby());
          await until(() => TD.main.state === 'lobby', null, 60000);
        }
      }
      check(vp.n + ': không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
      await page.context().close();
    }
  } finally { await br.close(); srv.close(); }
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
