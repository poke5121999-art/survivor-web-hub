// Bài kiểm mô phỏng Tốc Độ (Node, không trình duyệt): node test/toc-do-sim.js
'use strict';
const fs = require('fs');
const path = require('path');
const { check, done, nodeSim, GAME } = require('./toc-do-lib.js');

const FILES = ['data/tuning.js', 'data/tracks.js'];
if (fs.existsSync(path.join(GAME, 'data/cars.js'))) FILES.push('data/cars.js');
FILES.push('js/sim/rng.js', 'js/sim/track.js', 'js/sim/kart.js', 'js/sim/bot.js', 'js/sim/race.js');
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
  const need = ['countdown', 'go', 'drift_start', 'drift_end', 'miniboost', 'lap', 'final_lap', 'finish'].concat(id === '11citynew' ? ['nitro_start', 'nitro_end', 'gauge_full', 'wall', 'bump'] : []);
  check('phát đủ sự kiện chính', need.every((t) => ev[t] > 0), Object.keys(ev).sort().join(','));
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
}
done();
