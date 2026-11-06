// Bài kiểm mô phỏng Tốc Độ (Node, không trình duyệt): node test/toc-do-sim.js
'use strict';
const fs = require('fs');
const path = require('path');
const { check, done, nodeSim, GAME } = require('./toc-do-lib.js');

const FILES = ['data/tuning.js', 'data/tracks.js'];
if (fs.existsSync(path.join(GAME, 'data/cars.js'))) FILES.push('data/cars.js');
for (const f of ['rng', 'track', 'kart', 'bot', 'modes', 'rank', 'items', 'ghost', 'race']) {
  if (fs.existsSync(path.join(GAME, 'js/sim/' + f + '.js'))) FILES.push('js/sim/' + f + '.js');
}
const W = nodeSim(FILES);
const TD = W.TD;
const TRACKS = (process.env.TD_TRACKS ? process.env.TD_TRACKS.split(',') : Object.keys(TD.TRACKS)).filter((t) => TD.TRACKS[t]);

function runBots(trackId, seed) {
  const R = TD.Race.create({ trackId, seed, finishGrace: 60 });
  const ev = {};
  while (R.phase !== 'done' && R.t < 400) {
    TD.Race.step(R, 1 / 60);
    for (const e of R.events) ev[e.type] = (ev[e.type] || 0) + 1;
    R.events.length = 0;
  }
  return { R, ev };
}

// Xe người chơi đặt giữa đường ở điểm ruy băng tp, hướng theo đường, tốc độ kmh, đang chạy.
function soloAt(trackId, tp, kmh) {
  const R = TD.Race.create({ trackId, seed: 1, karts: [{ ctrl: 'human', name: 'P' }] });
  const T = R.T, k = R.karts[0];
  R.phase = 'race'; R.goT = 0; R.countdown = 0; k.st = 'drive';
  k.x = k.px = T.x[tp]; k.z = k.pz = T.z[tp]; k.y = T.y[tp];
  k.yaw = k.vyaw = Math.atan2(T.fx[tp], T.fz[tp]);
  k.speed = kmh / 3.6;
  k.loc = TD.Track.locate(T, k.x, k.y, k.z, null);
  k.lastCp = T.src.pts.cp[tp]; k.lap = 1; k.lapStartT = 0; k._startDone = true;
  return { R, T, k };
}
function steps(R, sec, fn) {
  const n = Math.round(sec / TD.TUNING.dt);
  for (let i = 0; i < n; i++) { if (fn) fn(i * TD.TUNING.dt); TD.Race.step(R, TD.TUNING.dt); }
}

// Mặt ruy băng GỐC (chưa nới ở chỗ tách/nhập nhánh) chứa (x,z): danh sách độ cao. Dùng để biết xe có thật sự đứng trên đường không.
function origSurfaces(T, x, z) {
  const p = T.src.pts, ids = T.grid[Math.floor(x / 24) + ',' + Math.floor(z / 24)] || [], ys = [];
  for (const id of ids) {
    const sg = T.segs[id], a = sg.a, b = sg.b;
    const da = (x - p.x[a]) * T.fx[a] + (z - p.z[a]) * T.fz[a], db = (x - p.x[b]) * T.fx[b] + (z - p.z[b]) * T.fz[b];
    if (da < -5 || db > 5) continue;   // chừa 5 m dọc như locator: chỗ ruy băng gấp khúc hai đoạn hở nhau ở mép ngoài
    const t = Math.max(0, Math.min(1, da / (da - db || 1)));
    let fx = T.fx[a] + (T.fx[b] - T.fx[a]) * t, fz = T.fz[a] + (T.fz[b] - T.fz[a]) * t;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const d = (x - (p.x[a] + (p.x[b] - p.x[a]) * t)) * fz - (z - (p.z[a] + (p.z[b] - p.z[a]) * t)) * fx;
    const w = (v) => (v < 2 ? 8 : v);   // bề rộng 0 trong dữ liệu gốc (đoạn qua khe nhảy): track.js lấy 8 m
    if (d <= w(p.lw[a]) + (w(p.lw[b]) - w(p.lw[a])) * t && -d <= w(p.rw[a]) + (w(p.rw[b]) - w(p.rw[a])) * t) ys.push(p.y[a] + (p.y[b] - p.y[a]) * t);
  }
  return ys;
}
// "Lơ lửng": locator nhận xe là trên đường (inside) ở độ cao h, nhưng không có mặt đường gốc nào trong ±3 m quanh h
// mà lại có mặt đường gốc nằm thấp hơn ≥5 m (đường dưới cầu vượt) → xe treo giữa không trung.
function floating(T, x, y, z) {
  const ys = origSurfaces(T, x, z);
  return !ys.some((v) => Math.abs(v - y) < 3) && ys.some((v) => v < y - 5);
}

for (const id of TRACKS) {
  console.log(`\n# ${id} (${TD.TRACKS[id].name})`);
  const T = TD.Track.get(id);

  // 1–2. sáu bot về đích, ít hồi sinh, thứ hạng là hoán vị 1..6
  const { R, ev } = runBots(id, 7);
  const fin = R.karts.filter((k) => k.finishT != null);
  const times = fin.map((k) => k.finishT);
  check('6 bot về đích đủ vòng', fin.length === 6 && fin.every((k) => k.stats.lapTimes.length === R.laps), fin.length + '/6, ' + R.laps + ' vòng');
  check('thời gian về đích 80–260 s', times.length && Math.min(...times) > 80 && Math.max(...times) < 260, times.map((t) => t.toFixed(1)).join(' '));
  const resp = R.karts.map((k) => k.stats.respawns);
  check('mỗi bot hồi sinh < 3 lần', resp.every((r) => r < 3), resp.join(' '));
  const places = R.karts.map((k) => k.place).sort();
  check('thứ hạng là hoán vị 1..6', places.join() === '1,2,3,4,5,6', places.join());
  // Phố Tàu chỉ có 3 đoạn drift/vòng → bình nitro có thể chưa đầy; nitro chỉ đòi ở đường nhiều cua
  // Đường A→B (loop false) chỉ 1 vòng: không có sự kiện lap / final_lap (test/toc-do-sprint.js kiểm luật về đích riêng).
  const need = ['countdown', 'go', 'drift_start', 'drift_end', 'miniboost', 'finish'].concat(T.loop ? ['lap', 'final_lap'] : [])
    .concat(id === '11citynew' ? ['nitro_start', 'nitro_end', 'gauge_full', 'wall', 'bump'] : []);
  check('phát đủ sự kiện chính', need.every((t) => ev[t] > 0), Object.keys(ev).sort().join(','));
  if (!T.loop) check('A→B: 1 vòng, không phát lap / final_lap', R.laps === 1 && !ev.lap && !ev.final_lap, R.laps + ' vòng, lap ' + (ev.lap || 0));
  if (T.line) {
    const segs = T.line.drift.filter((d, i, a) => d && !a[(i - 1 + a.length) % a.length]).length;
    const per = R.karts.map((k) => k.stats.drifts / R.laps);
    check('drift mỗi vòng của bot trong ±50% số đoạn drift của đường chuẩn', per.every((p) => p >= segs * 0.5 && p <= segs * 1.5), 'chuẩn ' + segs + ', bot ' + per.map((p) => p.toFixed(1)).join(' '));
  }
  if (id === '11citynew') {
    check('bot giỏi nhất chạy 2 vòng trong 110–150 s', Math.min(...times) >= 110 && Math.min(...times) <= 150, Math.min(...times).toFixed(1) + ' s');
  }

  // 8. tất định
  const again = runBots(id, 7).R;
  check('cùng seed → cùng thứ tự và thời gian', again.order.join() === R.order.join() && again.karts.every((k, i) => k.finishT === R.karts[i].finishT), R.order.join());

  // Không lơ lửng trên cầu vượt. (a) quét ngang mỗi điểm ruy băng, ra ngoài bề rộng gốc tới 30 m, ở độ cao của điểm đó:
  // chỗ nào locator vẫn bảo "trên đường" thì phải có mặt đường gốc đỡ — nới lấp khe không được phủ lên đường tầng dưới.
  {
    let bad = 0, first = null;
    for (let i = 0; i < T.n; i++) {
      const hint = T.segFrom[i][0]; if (hint == null || T.src.pts.lw[i] < 2 || T.src.pts.rw[i] < 2) continue;
      const lx = T.fz[i], lz = -T.fx[i];
      for (let d = -(T.src.pts.rw[i] + 30); d <= T.src.pts.lw[i] + 30; d += 3) {
        const x = T.x[i] + lx * d, z = T.z[i] + lz * d;
        const l = TD.Track.locate(T, x, T.y[i], z, hint);
        if (l.inside && floating(T, x, l.y, z)) { bad++; if (!first) first = 'pt ' + i + ' s=' + T.s[i].toFixed(0) + ' d=' + d + ' y=' + l.y.toFixed(1); }
      }
    }
    check('ruy băng nới không phủ lên đường tầng dưới (quét ngang)', bad === 0, bad + ' điểm lơ lửng' + (first ? ', đầu tiên ' + first : ''));
  }
  // (b) bot đua: không xe nào treo trên đường tầng dưới quá 0.5 s, và không bay (k.y − mặt đường > 3 m) quá 2 s liền.
  // Đo trên 2 seed × 6 bot × 3 đường: treo = 0 s mọi xe; bay lâu nhất 1.08 s (nhảy khỏi đầu cầu Troy) → ngưỡng 2 s chừa gấp đôi.
  {
    let worstFloat = 0, worstAir = 0, where = '';
    for (const seed of [11, 12]) {
      const R2 = TD.Race.create({ trackId: id, seed, finishGrace: 60 });
      const fl = {}, air = {}; let n = 0;
      while (R2.phase !== 'done' && R2.t < 400) {
        TD.Race.step(R2, 1 / 60); R2.events.length = 0; n++;
        for (const k of R2.karts) {
          if (!k.loc || k.st === 'respawn') continue;
          air[k.id] = k.y - k.loc.y > 3 ? (air[k.id] || 0) + 1 / 60 : 0;
          if (air[k.id] > worstAir) { worstAir = air[k.id]; where = 'bay seed ' + seed + ' t=' + R2.t.toFixed(0); }
          if (n % 6 === 0) {
            fl[k.id] = k.grounded && floating(T, k.x, k.y, k.z) ? (fl[k.id] || 0) + 0.1 : 0;
            if (fl[k.id] > worstFloat) { worstFloat = fl[k.id]; where = 'treo seed ' + seed + ' t=' + R2.t.toFixed(0) + ' (' + k.x.toFixed(0) + ',' + k.z.toFixed(0) + ') y=' + k.y.toFixed(1); }
          }
        }
      }
    }
    check('bot không treo trên đường tầng dưới > 0.5 s', worstFloat <= 0.5, worstFloat.toFixed(1) + ' s ' + where);
    check('bot không bay cao hơn mặt đường 3 m quá 2 s liền', worstAir <= 2, worstAir.toFixed(2) + ' s');
  }
}

// Các bài dưới dùng 11citynew (đoạn thẳng xuất phát rộng ~37 m chạy theo +x)
{
  const id = '11citynew';
  console.log('\n# vật lý trên ' + id);

  // 3. drift qua cua phải 135° (đoạn drift thứ 3 của đường chuẩn), lái bằng bộ điều khiển bot kỹ năng 1
  {
    const R = TD.Race.create({ trackId: id, seed: 1, karts: [{ ctrl: 'bot', skill: 1 }] });
    const T = R.T, k = R.karts[0], ln = T.line, L0 = 152;
    R.phase = 'race'; R.goT = 0; R.countdown = 0; k.st = 'drive'; k._startDone = true;
    k.x = k.px = ln.x[L0]; k.z = k.pz = ln.z[L0]; k.y = ln.y[L0]; k.yaw = k.vyaw = ln.yaw[L0]; k.speed = 190 / 3.6;
    k.loc = TD.Track.locate(T, k.x, k.y, k.z, null); k.lastCp = T.src.pts.cp[k.loc.a]; k.lap = 1;
    let vdPeak = 0, gauge = null, walls = 0;
    steps(R, 3, () => {
      for (const e of R.events) {
        if (e.type === 'drift_end' && gauge == null) { gauge = k.nitro.gauge; vdPeak = e.peak; }
        if (e.type === 'wall' && gauge == null) walls++;
      }
      R.events.length = 0;
    });
    check('drift qua cua làm gauge > 0.25', gauge > 0.25, 'gauge ' + (gauge || 0).toFixed(3) + ', tường ' + walls);
    check('VD đỉnh 20–70°', vdPeak >= 20 && vdPeak <= 70, vdPeak.toFixed(1) + '°');
  }

  // 4. nitro: +25% tốc độ trong 1.5 s
  {
    const { R, k } = soloAt(id, 1, 175);
    k.input.throttle = 1;
    steps(R, 0.5);
    const v0 = k.kmh;
    k.nitro.charges = 1;
    let v15 = 0, started = 0;
    steps(R, 1.5, (t) => { k.input.nitro = t < 0.05; for (const e of R.events) if (e.type === 'nitro_start') started++; R.events.length = 0; });
    v15 = k.kmh;
    check('nitro tăng tốc ≥ 25% trong 1.5 s', started === 1 && v15 >= v0 * 1.25, v0.toFixed(0) + ' → ' + v15.toFixed(0) + ' km/h');
    steps(R, 2);
    check('nitro trần ≈ +30–40%', k.kmh > TD.TUNING.topKmh * 1.28 && k.kmh < TD.TUNING.topKmh * 1.45, k.kmh.toFixed(0) + ' km/h');
  }

  // 5. phun nhỏ chỉ trong cửa sổ sau drift_end
  {
    const tryMini = (delay) => {
      const { R, k } = soloAt(id, 1, 170);
      let minis = 0, endT = null;
      steps(R, 0.9 + delay + 0.3, (t) => {
        k.input.throttle = 1;
        k.input.drift = t < 0.7;
        k.input.steer = t < 0.7 ? (t < 0.35 ? -1 : 1) * 0.6 : 0;
        if (t < 0.7 && k.st === 'drift') k.input.steer = -0.2;
        for (const e of R.events) { if (e.type === 'drift_end') endT = e.t; if (e.type === 'miniboost') minis++; }
        R.events.length = 0;
        k.input.nitro = endT != null && R.t >= endT + delay && R.t < endT + delay + 0.05;
      });
      return { minis, endT };
    };
    const inWin = tryMini(0.3), late = tryMini(TD.TUNING.miniWindow + 0.2);
    check('phun nhỏ trong cửa sổ (0.3 s sau drift_end)', inWin.endT != null && inWin.minis === 1, 'mini ' + inWin.minis);
    check('không phun nhỏ ngoài cửa sổ (' + (TD.TUNING.miniWindow + 0.2) + ' s)', late.endT != null && late.minis === 0, 'mini ' + late.minis);
  }

  // phun nhỏ: drift ngắn không có phun; phun đôi nhấn lại 0.3 s sau vẫn ăn (video: youtu.be/92kbCuZvo4Y?t=140, youtu.be/GFqmLev-cEg?t=49)
  {
    // giữ drift driftLen giây (lái trái), rồi nhấn nitro tại các mốc taps (giây sau drift_end); trả về danh sách kind của miniboost
    const driftRun = (driftLen, taps) => {
      const { R, k } = soloAt(id, 1, 170);
      const kinds = []; let endT = null;
      steps(R, driftLen + 0.3 + 1.2, (t) => {
        k.input.throttle = 1;
        k.input.drift = t < driftLen;
        k.input.steer = t < driftLen ? -0.6 : 0;
        for (const e of R.events) { if (e.type === 'drift_end') endT = e.t; if (e.type === 'miniboost') kinds.push(e.kind); }
        R.events.length = 0;
        k.input.nitro = endT != null && taps.some((d) => R.t >= endT + d && R.t < endT + d + 0.03);
      });
      return kinds.join();
    };
    check('drift 0.2 s (quá ngắn) không có phun nhỏ', driftRun(0.2, [0.05]) === '', '[' + driftRun(0.2, [0.05]) + ']');
    check('drift 0.7 s có phun nhỏ', /^(mini|perfect)$/.test(driftRun(0.7, [0.05])), '[' + driftRun(0.7, [0.05]) + ']');
    const d3 = driftRun(0.7, [0.05, 0.35]), d6 = driftRun(0.7, [0.05, 0.6]);
    check('phun đôi: nhấn lại 0.3 s sau phun nhỏ vẫn ăn', /^(mini|perfect),dual$/.test(d3), '[' + d3 + ']');
    check('phun đôi: nhấn lại 0.55 s sau thì hết cửa sổ', /^(mini|perfect)$/.test(d6), '[' + d6 + ']');
  }

  // phun xuất phát cộng cả bình nitro bằng một cú drift tốt (youtu.be/92kbCuZvo4Y?t=7)
  {
    const { R, k } = soloAt(id, 1, 0);
    k.nitro.gauge = 0;
    TD.Kart.startBoost(R, k);
    check('phun xuất phát cộng gauge ≈ 0.25', k.nitro.gauge > 0.24 && k.nitro.gauge < 0.26, k.nitro.gauge.toFixed(3));
  }

  // 6. lái vào tường: |d| không vượt giới hạn, có sự kiện wall
  {
    const { R, k } = soloAt(id, 3, 150);
    let walls = 0, worst = -1e9;
    steps(R, 3, () => {
      k.input.throttle = 1; k.input.steer = -1;
      for (const e of R.events) if (e.type === 'wall') walls++;
      R.events.length = 0;
      const L = k.loc, lim = (k.loc.d > 0 ? L.lw : L.rw) - TD.TUNING.halfWidth;
      worst = Math.max(worst, Math.abs(L.d) - lim);
    });
    check('lái vào tường: |d| ≤ giới hạn', worst <= 0.01, 'vượt tối đa ' + worst.toFixed(3) + ' m');
    check('lái vào tường phát wall', walls >= 1, walls + ' lần');
  }

  // 7. lùi qua vạch rồi chạy lại không cộng vòng
  {
    const { R, k } = soloAt(id, 3, 0);
    k.lastCp = 0; k.lap = 1;
    let laps = 0;
    steps(R, 4, () => { k.input.throttle = 0; k.input.brake = 1; for (const e of R.events) if (e.type === 'lap') laps++; R.events.length = 0; });
    const back = k.lap, sBack = k.loc.s;
    steps(R, 4, () => { k.input.brake = 0; k.input.throttle = 1; for (const e of R.events) if (e.type === 'lap') laps++; R.events.length = 0; });
    check('lùi qua vạch: không cộng vòng', laps === 0 && k.lap === 1, 'lùi tới s=' + sBack.toFixed(0) + ' (lap ' + back + '), chạy lại → lap ' + k.lap + ', sự kiện lap ' + laps);
  }

  // xuất phát: nhấn ga trong ±0.25 s quanh GO → phun xuất phát; nhấn sớm 1 s → không
  {
    const go = (pressAt) => {
      const R = TD.Race.create({ trackId: id, seed: 3, karts: [{ ctrl: 'human' }] });
      let boost = 0;
      steps(R, 4, (t) => {
        R.karts[0].input.throttle = t >= pressAt ? 1 : 0;
        for (const e of R.events) if (e.type === 'miniboost' && e.kind === 'start') boost++;
        R.events.length = 0;
      });
      return boost;
    };
    check('phun xuất phát khi nhấn ga sát GO', go(2.9) === 1 && go(3.1) === 1, 'trước 0.1 s: ' + go(2.9) + ', sau 0.1 s: ' + go(3.1));
    check('không phun xuất phát khi nhấn sớm', go(2.0) === 0, String(go(2.0)));
  }

  // xe đã về đích bị hồi sinh (bot lái tiếp sau vạch) không được về đích lần hai khi hết hạn chờ
  {
    const R = TD.Race.create({ trackId: id, seed: 4, finishGrace: 2, karts: [{ ctrl: 'bot', skill: 1 }, { ctrl: 'bot', skill: 0.1 }] });
    const k = R.karts[0];
    let fins = 0;
    for (let i = 0; i < 120 * 600 && R.phase !== 'done'; i++) {
      TD.Race.step(R, 1 / 120);
      for (const e of R.events) if (e.type === 'finish' && e.kart === k.id) fins++;
      R.events.length = 0;
      if (k.done && k.st === 'finish' && !k._rs) { k._rs = true; TD.Race.respawn(R, k, 'stuck'); }
    }
    check('về đích một lần dù bị hồi sinh sau vạch', fins === 1 && k.place === 1 && k.st !== 'drive', 'finish ' + fins + ', hạng ' + k.place + ', st ' + k.st);
  }
}
done();
