/*
 * Tốc Độ: đường A→B (loop: false — Tứ Xuyên, Reno, Polaris, Hoàng Hà).
 *   node test/toc-do-sprint.js                 Node: luật về đích, thứ hạng, lùi qua vạch; rồi một trận trong trình duyệt tới màn kết quả
 *   TD_NOBROWSER=1 node test/toc-do-sprint.js  chỉ phần Node
 *   TD_SPRINT=renocity                         đường chạy trong trình duyệt (mặc định renocity)
 * Chạy trình duyệt qua btest.sh (tối đa 3 Chromium cùng lúc).
 */
'use strict';
const { check, done, nodeSim, serve, browser, open, shot } = require('./toc-do-lib.js');

const W = nodeSim(['data/tuning.js', 'data/tracks.js', 'data/cars.js', 'js/sim/rng.js', 'js/sim/track.js', 'js/sim/kart.js', 'js/sim/bot.js',
  'js/sim/modes.js', 'js/sim/items.js', 'js/sim/race.js']);
const TD = W.TD;
const OPEN = Object.keys(TD.TRACKS).filter((id) => TD.TRACKS[id].loop === false);
const H = TD.TUNING.dt;

function steps(R, sec, fn) {
  for (let i = 0, n = Math.round(sec / H); i < n; i++) { if (fn) fn(); TD.Race.step(R, H); }
}
// Một xe trên đường T ở điểm ruy băng gần quãng s nhất (nhánh chính), hướng theo đường, đang chạy.
function placeAt(R, k, s, kmh) {
  const T = R.T, p = T.src.pts;
  let tp = 0;
  for (let i = 0; i < T.n; i++) if (p.curve[i] === 0 && Math.abs(T.s[i] - s) < Math.abs(T.s[tp] - s)) tp = i;
  k.x = k.px = T.x[tp]; k.z = k.pz = T.z[tp]; k.y = T.y[tp];
  k.yaw = k.vyaw = Math.atan2(T.fx[tp], T.fz[tp]);
  k.speed = kmh / 3.6; k.vx = Math.sin(k.yaw) * k.speed; k.vz = Math.cos(k.yaw) * k.speed;
  k.loc = TD.Track.locate(T, k.x, k.y, k.z, null);
  k.lastCp = p.cp[tp]; k.cpNext = T.cps[k.lastCp].next[0];
  if (k.bot) k.bot.li = -1;
  return tp;
}
function solo(id, mode) {
  const R = TD.Race.create({ trackId: id, seed: 1, mode, karts: [{ ctrl: 'human', name: 'P' }] });
  R.phase = 'race'; R.goT = 0; R.countdown = 0;
  const k = R.karts[0];
  k.st = 'drive'; k._startDone = true;
  return { R, T: R.T, k };
}
const count = (R, type, acc) => { for (const e of R.events) if (e.type === type) acc.push(e); R.events.length = 0; };

check('có ít nhất 4 đường A→B', OPEN.length >= 4, OPEN.join(','));
const summary = [];
for (const id of OPEN) {
  const T = TD.Track.get(id), S = T.cps[T.startCp], E = T.cps[T.endCp];
  console.log(`\n# ${id} (${T.src.name}, ${(T.L / 1000).toFixed(2)} km, CP ${T.startCp} → ${T.endCp})`);

  // dữ liệu: 1 vòng, không bọc, vạch đích sau vạch xuất phát đúng bằng length
  check('dữ liệu A→B: laps 1, loop false, endCp ≠ startCp', T.src.laps === 1 && !T.loop && T.endCp !== T.startCp, `laps ${T.src.laps}, CP ${T.startCp}/${T.endCp}`);
  check('length = quãng vạch xuất phát → vạch đích', Math.abs(E.s - S.s - T.L) < 1, `${(E.s - S.s).toFixed(0)} / ${T.L.toFixed(0)} m`);

  // 6 bot: ô xuất phát nằm trên đường sau vạch, về đích hết, thứ tự về đích = thứ hạng
  const R = TD.Race.create({ trackId: id, seed: 7, finishGrace: 60 });
  check('ô xuất phát trên ruy băng, sau vạch xuất phát', R.karts.every((k) => k.loc.inside && k.progress < S.s && k.lap === 0),
    R.karts.map((k) => (k.progress - S.s).toFixed(0)).join(' '));
  const ev = [], laps = [];
  while (R.phase !== 'done' && R.t < 400) {
    TD.Race.step(R, 1 / 60);
    for (const e of R.events) { if (e.type === 'finish') ev.push(e); if (e.type === 'lap' || e.type === 'final_lap') laps.push(e); }
    R.events.length = 0;
  }
  const fin = R.karts.filter((k) => k.finishT != null), times = fin.map((k) => k.finishT), resp = R.karts.map((k) => k.stats.respawns);
  check('6 bot về đích, mỗi xe 1 vòng', fin.length === 6 && fin.every((k) => k.lap === 1 && k.stats.lapTimes.length === 1) && laps.length === 0,
    `${fin.length}/6, sự kiện lap ${laps.length}`);
  // đo 2026-10-10 (seed 7/11/12): nhanh nhất 115–137 s, chậm nhất ≤ 151 s → khung 100–200 s
  check('thời gian về đích 100–200 s', times.length === 6 && Math.min(...times) > 100 && Math.max(...times) < 200, times.map((t) => t.toFixed(1)).join(' '));
  check('mỗi bot hồi sinh ≤ 3 lần, tổng ≤ 10', Math.max(...resp) <= 3 && resp.reduce((a, b) => a + b, 0) <= 10, resp.join(' '));
  const byTime = R.karts.slice().sort((a, b) => a.finishT - b.finishT).map((k) => k.id);
  check('thứ tự về đích = thứ hạng', byTime.join() === R.order.join() && R.karts.every((k) => k.place === byTime.indexOf(k.id) + 1)
    && ev.every((e, i) => e.place === i + 1), 'về đích ' + byTime.join() + ', hạng ' + R.order.join());
  check('về đích ở vạch đích', fin.every((k) => k.lastCp === T.endCp || T.cpAllowed[T.endCp].indexOf(k.lastCp) >= 0), fin.map((k) => k.lastCp).join(' '));
  summary.push(`${id}: ${times.map((t) => t.toFixed(0)).join('/')} s, hồi sinh ${resp.join('')}`);

  // bot về đích phanh dừng trên đường thoát, không bị hồi sinh
  steps(R, 10, () => { R.events.length = 0; });
  const after = R.karts.map((k) => ({ v: Math.abs(k.speed) * 3.6, in: k.loc.inside }));
  check('xe đã về đích dừng trên đường thoát', after.every((a) => a.in && a.v < 30), after.map((a) => a.v.toFixed(0) + (a.in ? '' : '!')).join(' '));

  // lùi qua vạch xuất phát: lap về 0; chạy tiếp tới sát vạch đích với lap 0 cũng không về đích
  {
    const { R, k } = solo(id);
    placeAt(R, k, S.s + 15, 0);
    k.lap = 1; k.lapStartT = 0;
    const fins = [];
    // lùi tới 15 m sau vạch: vùng checkpoint theo điểm ruy băng cách 10 m (lùi lâu quá 4 s thì luật đi ngược chiều đưa xe về điểm hồi sinh, lap được trả lại khi qua vạch)
    for (let i = 0; i < 4 / H && k.loc.s > S.s - 15; i++) { k.input.throttle = 0; k.input.brake = 1; TD.Race.step(R, H); count(R, 'finish', fins); }
    const back = { lap: k.lap, s: k.loc.s };
    check('lùi qua vạch xuất phát: lap về 0, không về đích', back.lap === 0 && back.s < S.s && fins.length === 0 && !k.done,
      `s ${back.s.toFixed(0)} (vạch ${S.s.toFixed(0)}), lap ${back.lap}`);
    k.ctrl = 'bot'; TD.Bot.init(k, R, 0.9);
    placeAt(R, k, E.s - 60, 120);
    k.lap = 0;
    // chạy tới vùng vạch đích rồi thêm 1 s (bot chưa về đích không phanh: đi lâu thì quá đường thoát)
    for (let i = 0; i < 6 / H && k.lastCp !== T.endCp; i++) { TD.Race.step(R, H); count(R, 'finish', fins); }
    steps(R, 1, () => count(R, 'finish', fins));
    check('lap 0 chạy qua vạch đích: không về đích', fins.length === 0 && !k.done && k.lastCp === T.endCp, `lastCp ${k.lastCp}, lap ${k.lap}`);
  }
  // đối chứng: cùng chỗ, đã qua vạch xuất phát (lap 1) → về đích, giờ = giờ trận
  {
    const { R, k } = solo(id);
    k.ctrl = 'bot'; TD.Bot.init(k, R, 0.9);
    placeAt(R, k, E.s - 60, 120);
    k.lap = 1; k.lapStartT = 0;
    const fins = [];
    steps(R, 6, () => count(R, 'finish', fins));
    check('lap 1 qua vạch đích: về đích hạng 1', fins.length === 1 && k.done && k.place === 1 && k.lap === 1 && k.finishT > 0, `finish ${fins.length}, hạng ${k.place}, giờ ${k.finishT && k.finishT.toFixed(1)}`);
  }
  // luyện tập tự do (99 vòng): tới đích tính 1 vòng rồi về ô xuất phát, không về đích
  {
    const { R, k } = solo(id, TD.MODES.free);
    k.ctrl = 'bot'; TD.Bot.init(k, R, 0.9);
    placeAt(R, k, E.s - 60, 120);
    k.lap = 1; k.lapStartT = 0;
    const lapsEv = [], fins = [];
    let at = null;
    steps(R, 6, () => {
      for (const e of R.events) { if (e.type === 'lap') lapsEv.push(e); if (e.type === 'finish') fins.push(e); }
      R.events.length = 0;
      if (lapsEv.length && !at) at = { lap: k.lap, s: k.loc.s, resp: k.stats.respawns };
    });
    check('luyện tập tự do: tới đích → 1 vòng, về ô xuất phát', R.laps === 99 && lapsEv.length === 1 && fins.length === 0 && at && at.lap === 2
      && Math.abs(at.s - S.s) < 20 && at.resp === 0, `sự kiện lap ${lapsEv.length}, ${JSON.stringify(at)}`);
  }
}
console.log('\n' + summary.join('\n'));

if (!process.env.TD_NOBROWSER) {
  (async () => {
    const id = process.env.TD_SPRINT || 'renocity';
    const srv = await serve();
    const br = await browser();
    try {
      const { page, problems } = await open(br, srv.base, 'index.html');
      const until = async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 500 }); return true; } catch (e) { return false; } };
      console.log(`\n# trình duyệt: ${id}`);
      check('sảnh mở', await until(() => window.TD && TD.main && TD.main.state === 'lobby', null, 120000));
      await page.evaluate((t) => { TD.save.d.track = t; TD.main.startRace({ mode: 'speed' }); }, id);
      check('vào trận', await until(() => TD.main.state === 'race' && TD.main.race && TD.main.race.phase === 'countdown', null, 300000));
      await shot(page, 'sprint-' + id + '-start');
      const hud = await page.evaluate(() => {
        const R = TD.main.race;
        TD.main.me.ctrl = 'bot'; TD.Bot.init(TD.main.me, R, 0.95);
        TD.main.timeScale = 4;
        return { laps: R.laps, loop: R.T.loop };
      });
      check('trận A→B: 1 vòng', hud.laps === 1 && hud.loop === false, JSON.stringify(hud));
      await until(() => TD.main.race.goT != null && TD.main.race.t - TD.main.race.goT > 20, null, 300000);
      await shot(page, 'sprint-' + id + '-race');
      await page.evaluate(() => { TD.main.timeScale = 8; });
      const ok = await until(() => TD.main.resultShown, null, 900000);
      await page.waitForTimeout(4000);   // thẻ kết quả hiện dần (CSS, không theo timeScale)
      const res = await page.evaluate(() => ({ rows: document.querySelectorAll('.result .row').length, me: TD.main.me.place, t: TD.main.me.finishT, done: TD.main.race.karts.filter((k) => k.done).length }));
      check('màn kết quả: 6 hàng, mình về đích', ok && res.rows === 6 && res.t > 0, JSON.stringify(res));
      await shot(page, 'sprint-' + id + '-result');
      check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
      await page.context().close();

      // điện thoại ngang 844×390: một đường A→B khác vào trận, HUD vòng 1/1
      const id2 = process.env.TD_SPRINT2 || 'huanghe02';
      console.log(`\n# trình duyệt 844×390: ${id2}`);
      const ph = await open(br, srv.base, 'index.html', { width: 844, height: 390 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const u2 = async (fn, ms) => { try { await ph.page.waitForFunction(fn, null, { timeout: ms, polling: 500 }); return true; } catch (e) { return false; } };
      check('sảnh mở (điện thoại)', await u2(() => window.TD && TD.main && TD.main.state === 'lobby', 120000));
      await ph.page.evaluate((t) => { TD.save.d.track = t; TD.main.startRace({ mode: 'speed' }); }, id2);
      check('vào trận (điện thoại)', await u2(() => TD.main.state === 'race' && TD.main.race && TD.main.race.phase === 'countdown', 300000));
      await ph.page.evaluate(() => { TD.main.me.ctrl = 'bot'; TD.Bot.init(TD.main.me, TD.main.race, 0.95); TD.main.timeScale = 2; });
      await u2(() => TD.main.me.lap >= 1 && TD.main.race.t - TD.main.race.goT > 3, 300000);
      const lap2 = await ph.page.evaluate(() => ({ laps: TD.main.race.laps, lap: TD.main.me.lap }));
      check('điện thoại: 1 vòng, đang vòng 1', lap2.laps === 1 && lap2.lap === 1, JSON.stringify(lap2));
      ph.page.setDefaultTimeout(120000);   // swiftshader chụp màn hình điện thoại (×2) chậm khi máy bận
      await ph.page.evaluate(() => { TD.main.timeScale = 0.25; });
      await shot(ph.page, 'sprint-' + id2 + '-844');
      check('không lỗi trang (điện thoại)', ph.problems.length === 0, ph.problems.slice(0, 5).join(' | '));
    } finally { await br.close(); srv.close(); }
    done();
  })().catch((e) => { console.error(e); process.exitCode = 1; });
} else done();
