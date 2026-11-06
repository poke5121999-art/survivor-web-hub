// Trận đua: tạo, bước, checkpoint/vòng, thứ hạng, về đích. Thuần JS.
//   var R = TD.Race.create({ trackId, seed, mode?, laps?, karts: [{ id?, carId, driverId, name, ctrl: 'human'|'bot', skill?, team? }], finishGrace? })
//   mode = một mục của TD.MODES (mặc định speed). Có mode.items và TD.Items thì R.items = TD.Items.init(R), mỗi bước gọi TD.Items.step.
//   TD.Race.step(R, dt)   — dt bất kỳ (giây thật), bên trong chạy bước cố định 1/120 s.
//   TD.Race.finish(R, k, timeout) — cho xe về đích ngay (mode sự kiện: loại xe cuối, hết giờ); timeout = về đích không tính giờ.
// Sự kiện: R.events[] = { t, type, kart, ... }. Lớp vẽ/âm thanh đọc rồi tự xoá mỗi khung: `R.events.length = 0`.
// Người chơi: ghi R.karts[i].input mỗi khung trước khi gọi step.
// Đường A→B (T.loop false): 1 vòng, về đích khi vào vùng checkpoint T.endCp; mode ép nhiều vòng (luyện tập tự do) thì
// tới đích tính một vòng rồi đưa xe về ô xuất phát.
(function (G) {
  var TD = G.TD = G.TD || {};

  function gridSlot(T, i) {
    var c = T.cps[T.startCp];
    var fx = c.fx, fz = c.fz, fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    var lx = fz, lz = -fx;
    var row = Math.floor(i / 2), col = i % 2;
    var back = 7 + row * 6.5 + (col ? 2.5 : 0), side = col ? -3.2 : 3.2;
    return { x: c.x - fx * back + lx * side, z: c.z - fz * back + lz * side, yaw: Math.atan2(fx, fz) };
  }

  function create(o) {
    var U = TD.TUNING;
    var T = TD.Track.get(o.trackId);
    var mode = o.mode || (TD.MODES && TD.MODES.speed) || { id: 'speed' };
    var R = {
      trackId: T.id, mode: mode, t: 0, phase: 'countdown', countdown: U.countdown, laps: T.loop ? o.laps || mode.laps || T.laps : mode.laps || 1, karts: [], order: [], events: [], items: null,
      seed: o.seed >>> 0, rng: TD.RNG(o.seed), T: T, goT: null, finishDeadline: null, finishGrace: o.finishGrace != null ? o.finishGrace : U.finishGrace,
      leaderProgress: 0, _acc: 0, _cdShown: Math.ceil(U.countdown) + 1, nFinished: 0,
    };
    var list = o.karts || [0, 1, 2, 3, 4, 5].map(function (i) { return { ctrl: 'bot' }; });
    list.forEach(function (ko, i) {
      var k = TD.Kart.create({ id: ko.id != null ? ko.id : i, carId: ko.carId, driverId: ko.driverId, name: ko.name || ('Bot ' + (i + 1)), ctrl: ko.ctrl || 'bot', team: ko.team });
      var g = gridSlot(T, i);
      k.x = k.px = g.x; k.z = k.pz = g.z; k.yaw = k.vyaw = g.yaw;
      k.loc = TD.Track.locate(T, k.x, T.cps[T.startCp].y + 1, k.z, null);
      k.y = k.loc.y;
      k.lastCp = T.cps[T.startCp].prev[0];
      k.cpNext = T.startCp;
      if (k.ctrl === 'bot') TD.Bot.init(k, R, ko.skill);
      R.karts.push(k);
    });
    progressAll(R);
    if (mode.items && TD.Items) R.items = TD.Items.init(R);
    return R;
  }

  function ev(R, k, type, extra) { TD.Kart.ev(R, k, type, extra); }

  // Checkpoint theo vùng: mỗi điểm ruy băng thuộc vùng LocatedCheckPointID (cổng vừa qua). Vào vùng nằm trong
  // cpAllowed[lastCp] (≤ 3 bước tới) → đã qua cổng đó; lùi về vùng cha của lastCp → trả lại (không ăn gian vòng).
  // A→B: vào vùng vạch đích khi đã qua vạch xuất phát (lap ≥ 1) → về đích; lùi qua vạch xuất phát thì lap về 0, không về đích được.
  function gates(R, k) {
    var T = R.T, loc = k.loc, S = T.startCp, A = T.cpAllowed;
    if (!loc || !loc.inside) return;
    var r = T.src.pts.cp[loc.t < 0.5 ? loc.a : loc.b];
    var was = k.lastCp;
    if (r === was) return;
    var over = function (from, to, c) { return to === c || (A[from].indexOf(c) >= 0 && A[c].indexOf(to) >= 0); };
    if (A[was].indexOf(r) >= 0) {
      k.lastCp = r;
      if (over(was, r, S)) passLine(R, k);
      else if (!T.loop && k.lap >= 1 && over(was, r, T.endCp)) passEnd(R, k);
    } else if (A[r].indexOf(was) >= 0) {
      k.lastCp = r;
      if (was === S || over(r, was, S)) { k.lap--; k._lapBack = true; }
    }
    k.cpNext = T.cps[k.lastCp].next[0];
  }

  function passLine(R, k) {
    if (k._lapBack) { k._lapBack = false; k.lap++; return; }   // vượt lại vạch sau khi lùi: chỉ trả lại vòng cũ
    if (!R.T.loop) {
      // A→B: vạch xuất phát chỉ bắt đầu vòng; lần đầu (hoặc sau khi được đưa về ô xuất phát) mới bấm giờ
      if (k.lap === 0) k.lap = 1;
      if (k.lapStartT == null) k.lapStartT = R.t;
      return;
    }
    k.lap++;
    if (k.lap === 1) { k.lapStartT = R.t; return; }
    lapDone(R, k);
  }

  // Xong một vòng (k.lap đã tăng sang vòng mới): ghi giờ vòng, về đích nếu đủ vòng.
  function lapDone(R, k) {
    var lt = R.t - k.lapStartT;
    k.lapStartT = R.t;
    k.stats.lapTimes.push(lt);
    if (k.stats.bestLap == null || lt < k.stats.bestLap) k.stats.bestLap = lt;
    if (k.lap > R.laps) { finish(R, k, false); return true; }
    ev(R, k, 'lap', { lap: k.lap - 1, time: lt });
    if (k.lap === R.laps) ev(R, k, 'final_lap');
    return false;
  }

  function passEnd(R, k) {
    if (k.lapStartT == null) k.lapStartT = R.goT;
    k.lap++;
    if (lapDone(R, k)) return;
    // còn vòng (luyện tập tự do): về ô xuất phát đầu, bấm giờ lại khi qua vạch
    var T = R.T, g = gridSlot(T, 0);
    respawn(R, k, 'lap', { x: g.x, y: T.cps[T.startCp].y, z: g.z, yaw: g.yaw });
    k.stats.respawns--;   // đưa về đầu đường không phải lỗi lái
    k.lastCp = T.cps[T.startCp].prev[0];
    k.cpNext = T.startCp;
    k.lapStartT = null;
  }

  // k.done giữ dấu đã về đích kể cả khi xe (bot lái tiếp sau vạch) bị hồi sinh làm k.st rời 'finish'.
  function finish(R, k, timeout) {
    k.st = 'finish'; k.done = true;
    k.lap = Math.min(k.lap, R.laps);
    k.finishT = timeout ? null : R.t - R.goT;
    R.nFinished++;
    k.place = R.nFinished;
    k._finOrder = R.nFinished;
    if (k.drift.dir) { k.drift.dir = 0; }
    ev(R, k, 'finish', { place: k.place, time: k.finishT, dnf: !!timeout });
    if (R.finishDeadline == null) { R.finishDeadline = R.t + R.finishGrace; R.phase = 'finish'; }
    if (k.ctrl !== 'bot' && !k.bot) TD.Bot.init(k, R, 0.5);
  }

  function progressAll(R) {
    var T = R.T, L = T.L;
    R.karts.forEach(function (k) {
      if (k.done) return;
      if (!T.loop) { k.progress = Math.max(0, k.lap - 1) * L + (k.loc ? k.loc.s : T.cps[k.lastCp].s); return; }   // s không bọc
      var base = T.cps[k.lastCp].s, ds = (k.loc ? k.loc.s : base) - base;
      while (ds > L / 2) ds -= L;
      while (ds < -L / 2) ds += L;
      k.progress = (k.lap - 1) * L + base + ds;
    });
  }

  function rank(R) {
    var ks = R.karts.slice().sort(function (a, b) {
      var fa = a._finOrder || 0, fb = b._finOrder || 0;
      if (fa && fb) return fa - fb;
      if (fa) return -1;
      if (fb) return 1;
      return b.progress - a.progress;
    });
    ks.forEach(function (k, i) {
      var np = i + 1;
      if (R.phase === 'race' && k.place && np < k.place && R.t - R.goT > 1 && k.st !== 'finish') {
        ev(R, k, 'overtake', { place: np, other: ks[i + 1] ? ks[i + 1].id : null });
      }
      k.place = np;
    });
    R.order = ks.map(function (k) { return k.id; });
    R.leaderProgress = ks.length ? Math.max.apply(null, ks.map(function (k) { return k.done ? -1e9 : k.progress; })) : 0;
  }

  function collide(R) {
    var U = TD.TUNING, ks = R.karts, r2 = U.radius * 2;
    for (var i = 0; i < ks.length; i++) {
      var a = ks[i];
      if (a.ghostT > 0 || a.st === 'respawn' || a.st === 'grid') continue;
      for (var j = i + 1; j < ks.length; j++) {
        var b = ks[j];
        if (b.ghostT > 0 || b.st === 'respawn' || b.st === 'grid') continue;
        var dx = b.x - a.x, dz = b.z - a.z;
        if (Math.abs(dx) > r2 || Math.abs(dz) > r2 || Math.abs(a.y - b.y) > 2) continue;
        var d = Math.hypot(dx, dz);
        if (d >= r2 || d < 1e-6) continue;
        var nx = dx / d, nz = dz / d, o = (r2 - d) / 2;
        a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
        var vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vrel >= 0) continue;
        var jm = -(1 + U.carRestitution) * vrel / 2;
        a.vx -= jm * nx; a.vz -= jm * nz; b.vx += jm * nx; b.vz += jm * nz;
        [a, b].forEach(function (k) {
          var s = Math.hypot(k.vx, k.vz);
          if (k.speed >= 0) { k.speed = s; if (s > 0.5) k.vyaw = Math.atan2(k.vx, k.vz); } else k.speed = -s;
        });
        if (-vrel > 1) {
          var pw = Math.min(1, -vrel * 3.6 / 60);
          ev(R, a, 'bump', { other: b.id, power: pw });
          ev(R, b, 'bump', { other: a.id, power: pw });
        }
      }
    }
  }

  // pose = { x, y, z, yaw } đặt xe đúng chỗ (về điểm cờ); không có thì về điểm hồi sinh gần nhất của đường.
  function respawn(R, k, why, pose) {
    var U = TD.TUNING, r = pose || TD.Track.resetFor(R.T, k);
    k.x = k.px = r.x; k.z = k.pz = r.z; k.y = r.y; k.yaw = k.vyaw = r.yaw;
    k.loc = TD.Track.locate(R.T, k.x, k.y, k.z, null);
    k.y = k.loc.y;
    k.speed = 0; k.vx = k.vz = k.vy = 0; k.yawRate = 0; k.grounded = true;
    k.st = 'respawn'; k.respawnT = U.respawnFreeze; k.ghostT = U.ghostTime;
    k.drift.dir = 0; k.nitro.boostT = 0; k.nitro.miniT = 0; k.nitro.miniWindowT = 0;
    k.wrongT = 0; k.stuckT = 0;
    k.fx.stunT = 0; k.fx.slowT = 0; k.fx.slowMul = 1; k.fx.kind = null;
    k.stats.respawns++;
    k._tele = true;
    if (k.bot) k.bot.li = -1;
    ev(R, k, 'respawn', { why: why });
  }

  function checks(R, k, h) {
    var U = TD.TUNING, loc = k.loc;
    if (k.st === 'respawn' || k.st === 'grid') return;
    // A→B: ruy băng có quảng trường, cua tay áo rộng 20–40 m mà điểm cách 10 m → hở ở chỗ nối đoạn; bề rộng tụt bậc
    // (Hoàng Hà s≈1640: 22 m → 7 m) thì tường đẩy xe vào. Chỉ tính lệch ngang sau khi tường đẩy, dưới mặt đường, vượt dọc quá 15 m.
    var off = loc.inside ? 0 : R.T.loop ? Math.max(0, loc.d - loc.lw, -loc.d - loc.rw, loc.score - 4)
      : Math.max(0, loc.d - loc.lw, -loc.d - loc.rw, loc.tOut - 15, loc.under - 4);
    if (off > U.offRoad || k.y < loc.y - U.fallDepth) return respawn(R, k, 'off');
    var v = Math.hypot(k.vx, k.vz);
    if (v > 3 && (k.vx * loc.fx + k.vz * loc.fz) < -0.5 * v) k.wrongT += h; else k.wrongT = Math.max(0, k.wrongT - h);
    if (k.wrongT > U.wrongWayTime) return respawn(R, k, 'wrong');
    if (v < 1.5 && k.st !== 'finish') k.stuckT += h; else k.stuckT = 0;
    if (k.stuckT > U.stuckTime) return respawn(R, k, 'stuck');
  }

  function fixed(R, h) {
    var U = TD.TUNING, T = R.T;
    R.karts.forEach(function (k) {
      if (k.bot && (k.ctrl === 'bot' || k.st === 'finish')) TD.Bot.think(k, R, h);
      var thr = k.input.throttle > 0;
      if (thr && !k._thrPrev) k._thrPressT = R.t;
      k._thrPrev = thr;
    });
    if (R.phase === 'countdown') {
      R.countdown -= h;
      var n = Math.ceil(R.countdown);
      if (n < R._cdShown && n > 0) { R._cdShown = n; R.events.push({ t: R.t, type: 'countdown', kart: null, n: n }); }
      if (R.countdown <= 0) {
        R.phase = 'race'; R.goT = R.t; R.countdown = 0;
        R.events.push({ t: R.t, type: 'go', kart: null });
        R.karts.forEach(function (k) {
          k.st = 'drive';
          if (k.input.throttle > 0 && k._thrPressT >= R.t - U.startWindow) { TD.Kart.startBoost(R, k); k._startDone = true; }
        });
      }
      R.t += h;
      return;
    }
    R.karts.forEach(function (k) {
      if (!k._startDone && R.t - R.goT <= U.startWindow && k._thrPressT > R.goT - 1e-9 && k._thrPressT >= R.goT) {
        TD.Kart.startBoost(R, k); k._startDone = true;
      }
      if (R.goT != null && R.t - R.goT > U.startWindow) k._startDone = true;
      // bù khoảng cách cho bot (FallBehindCompe*)
      if (k.ctrl === 'bot' && k.st !== 'finish') {
        var gap = Math.max(0, (R.leaderProgress - k.progress) / T.L);
        k.compKmh = TD.Kart.curve(U.fallBehindTop, gap);
        k.compAcc = TD.Kart.curve(U.fallBehindAccel, gap);
      } else { k.compKmh = 0; k.compAcc = 0; }
      var px = k.x, pz = k.z;
      TD.Kart.step(k, R, T, h);
      k.px = px; k.pz = pz;
    });
    collide(R);
    if (R.items) TD.Items.step(R, h);
    R.karts.forEach(function (k) {
      if (k.st !== 'finish' && k.st !== 'respawn' && !k._tele) gates(R, k);
      k._tele = false;
      checks(R, k, h);
    });
    progressAll(R);
    rank(R);
    if (R.finishDeadline != null && R.phase !== 'done') {
      var left = R.karts.filter(function (k) { return !k.done; });
      if (R.t >= R.finishDeadline) {
        left.sort(function (a, b) { return b.progress - a.progress; }).forEach(function (k) { finish(R, k, true); });
        left = [];
      }
      if (!left.length) { R.phase = 'done'; rank(R); }
    }
    R.t += h;
  }

  // Luật thêm của chế độ (js/sim/events.js…): mỗi hàm f(R) chạy sau mỗi lần step, tự lọc theo R.mode.
  var after = [];
  function step(R, dt) {
    var h = TD.TUNING.dt;
    R._acc += Math.min(Math.max(dt, 0), 0.25);
    while (R._acc >= h - 1e-12) { fixed(R, h); R._acc -= h; }
    for (var i = 0; i < after.length; i++) after[i](R);
    return R;
  }

  TD.Race = { create: create, step: step, respawn: respawn, finish: finish, after: after };
})(typeof window !== 'undefined' ? window : globalThis);
