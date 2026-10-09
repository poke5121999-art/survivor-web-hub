// AI bot: bám đường chạy chuẩn gốc (T.line, <MapId>_StandardData), drift ở đoạn Drift=1, phun nhỏ sau drift theo kỹ năng,
// nitro ở đoạn thẳng, kẹt thì lùi. Không có T.line thì bám tâm ruy băng (nhánh chính).
(function (G) {
  var TD = G.TD = G.TD || {};

  function centerLine(T) {
    // dựng đường tạm từ tâm ruy băng, đi theo next[0]
    var x = [], y = [], z = [], drift = [], i = 0, seen = {};
    while (!seen[i]) {
      seen[i] = 1;
      x.push(T.x[i]); y.push(T.y[i]); z.push(T.z[i]); drift.push(0);
      i = T.next[i][0];
    }
    var ln = { x: x, y: y, z: z, drift: drift, n: x.length, yaw: new Float64Array(x.length) };
    for (var k = 0; k < ln.n; k++) {
      var a = (k + ln.n - 1) % ln.n, b = (k + 1) % ln.n;
      ln.yaw[k] = Math.atan2(x[b] - x[a], z[b] - z[a]);
    }
    for (k = 0; k < ln.n; k++) {
      var t = TD.Kart.wrap(ln.yaw[(k + 3) % ln.n] - ln.yaw[k]);
      if (Math.abs(t) > 0.5) for (var q = -1; q <= 3; q++) ln.drift[(k + q + ln.n) % ln.n] = 1;
    }
    return ln;
  }

  // lái cần cho tốc độ quay mong muốn w (rad/s, + = phải theo quy ước input), đảo đường cong cường độ lái
  function steerFor(k, w) {
    var U = TD.TUNING, v = Math.abs(k.speed), top = k.p.top * k.topScale;
    var ang = TD.Kart.curve(U.maxSteerAngle, v * 3.6) * Math.PI / 180;
    var wmax = Math.min(Math.max(v, 1) * Math.tan(ang) / U.wheelbase, TD.Kart.curve(U.drivingMaxAngSpeed, v / top) * Math.PI / 180 * k.p.handling);
    var e = Math.max(-1, Math.min(1, w / wmax)), m = Math.abs(e);
    var s = m >= 0.8 ? m : (-0.6 + Math.sqrt(0.36 + 2 * m));
    return e < 0 ? -Math.min(1, s) : Math.min(1, s);
  }

  function init(k, R, skill) {
    var U = TD.TUNING, rng = R.rng;
    if (skill == null) skill = rng.range(0.5, 1.0);
    if (!R.T.line) R.T.line = centerLine(R.T);
    k.topScale = k.ctrl === 'bot' ? U.botSpeed[0] + (U.botSpeed[1] - U.botSpeed[0]) * skill : 1;
    k.bot = {
      skill: skill, lane: rng.range(-1.2, 1.2) * (1.2 - skill), li: -1, retry: 1,
      startAt: rng.range(-0.45, 0.4) * (1.15 - skill),       // lệch so với GO khi nhấn ga
      miniProb: 0.4 + 0.6 * skill, dualProb: 0.8 * skill * skill,
      reaction: 0.32 - 0.25 * skill,
      pressAt: -1, press2: false, driftEnd: -1, planned: false, stuckT: 0, revT: 0, nitroHold: rng.range(0, 2) * (1 - skill),
    };
  }

  function think(k, R, dt) {
    var b = k.bot, inp = k.input, T = R.T, ln = T.line, n = ln.n, wrap = TD.Kart.wrap;
    inp.nitro = false; inp.brake = 0; inp.drift = false;
    if (R.phase === 'countdown') {
      inp.throttle = -R.countdown >= b.startAt ? 1 : 0;
      inp.steer = 0;
      return;
    }
    if (k.st === 'respawn') { inp.throttle = 1; inp.steer = 0; return; }
    b.li = TD.Track.lineNearest(T, k.x, k.y, k.z, b.li);
    var v = Math.abs(k.speed), kmh = v * 3.6, li = b.li;
    var Ld = 7 + v * 0.32, steps = Math.max(2, Math.round(Ld / 3.75));
    var ti = (li + steps) % n;
    var ly = ln.yaw[ti], lane = b.lane * (ln.drift[ti] ? 0.3 : 1);
    var tx = ln.x[ti] + Math.cos(ly) * lane, tz = ln.z[ti] - Math.sin(ly) * lane;
    if (k.loc && Math.abs(ln.y[ti] - k.loc.y) > 5) {
      // đường chuẩn rời ruy băng (nhảy/cầu không có trong dữ liệu mặt đường): bám tâm ruy băng phía trước
      var tp = k.loc.b;
      for (var q = 0; q < steps; q++) tp = T.next[tp][0];
      tx = T.x[tp]; tz = T.z[tp];
    }
    var desired = Math.atan2(tx - k.x, tz - k.z);
    Ld = Math.max(4, Math.hypot(tx - k.x, tz - k.z));
    var alpha = wrap(desired - k.vyaw);
    var wv = 2 * Math.max(v, 3) * (Math.abs(alpha) > 1.4 ? (alpha > 0 ? 1 : -1) : Math.sin(alpha)) / Ld;   // pure pursuit: tốc độ quay vận tốc cần (rad/s, + = trái); mục tiêu sau lưng → quay hết
    inp.throttle = 1;

    // kẹt → lùi
    if (R.phase !== 'countdown' && k.st !== 'finish' && v < 2 && R.t - R.goT > 2) b.stuckT += dt; else b.stuckT = 0;
    if (b.stuckT > 1.0) { b.revT = 1.2; b.stuckT = 0; }
    if (b.revT > 0) {
      b.revT -= dt;
      inp.throttle = 0; inp.brake = 1;
      inp.steer = Math.max(-1, Math.min(1, wrap(desired - k.yaw) * 2));
      return;
    }

    var di = (li + Math.round((3 + v * 0.1) / 3.75)) % n;
    var turn = wrap(ln.yaw[(li + 10) % n] - ln.yaw[li]);
    var dir = wrap(ln.yaw[(li + 12) % n] - ln.yaw[(li + 2) % n]) > 0 ? -1 : 1;
    var finished = k.st === 'finish';
    if (k.st === 'drift') {
      var dd = k.drift.dir, U = TD.TUNING, D2R = Math.PI / 180;
      // vận tốc quay ≈ c·VD (c ≈ 3.5/s) → VD cần; đầu xe đi trước vận tốc VD về phía cua
      var vdNeed = Math.max(0.25, Math.min(0.85, Math.abs(wv) / (3.5 * U.driftVelLerpScale) + 0.1 * b.skill));
      var exitYaw = ln.yaw[(b.driftEnd + 2) % n];
      var uExit = wrap(exitYaw - k.vyaw) * -dd;                 // còn phải quay bao nhiêu tới hướng ra cua
      var H = k.vyaw - dd * Math.min(vdNeed, Math.max(0, uExit + 0.03));   // đầu xe không vượt hướng ra cua
      var wh = wv + 6 * wrap(H - k.yaw);                         // rad/s mong muốn của đầu xe
      var kk = (-dd * wh) / (U.driftMaxAngSpeed * D2R * k.p.handling);
      var sc = U.driftAngScale;
      var sd = kk >= sc[1] ? (kk - sc[1]) / (sc[2] - sc[1]) : (kk - sc[1]) / (sc[1] - sc[0]);
      var aligned = wrap(exitYaw - k.yaw) * -dd < 0.04;
      var stillDrift = ln.drift[li] || ln.drift[di];
      if (k.drift.t < 0.3 || (stillDrift && !aligned && k.drift.t < 3)) {
        inp.drift = true;
        inp.steer = dd * Math.max(-1, Math.min(1, sd));
      } else {
        inp.steer = steerFor(k, -wv);
      }
    } else {
      inp.steer = steerFor(k, -wv);
      var used = b.driftEnd >= 0 && ((b.driftEnd - li + n) % n) < 40;
      if (!used) { b.driftEnd = -1; b.retry = 1; }
      else if (b.retry > 0 && k.drift.lastEnd === 'wall' && ln.drift[li] && !inp.drift && !k._driftBlock) { b.retry--; used = false; }   // drift bị tường cắt: thử lại một lần
      var turnNear = wrap(ln.yaw[(li + 8) % n] - ln.yaw[(li + 2) % n]);
      if (ln.drift[di] && !used && kmh > 80 && k.grounded && Math.abs(turnNear) > 0.16 && !finished) {
        inp.drift = true; inp.steer = dir;
        var e = di;
        while (ln.drift[e % n] && e - di < 60) e++;
        b.driftEnd = e % n;          // không drift lại trong cùng đoạn
      } else if (Math.abs(alpha) > 0.8 && kmh > 70) { inp.throttle = 0.2; }
    }

    // tránh tường
    var loc = k.loc, room = 2.5;
    if (loc && loc.d > loc.lw - room) inp.steer = Math.min(1, inp.steer + (loc.d - loc.lw + room) * 0.25);
    else if (loc && -loc.d > loc.rw - room) inp.steer = Math.max(-1, inp.steer - (-loc.d - loc.rw + room) * 0.25);
    if (finished) return;
    // phun nhỏ / phun đôi sau drift
    var nt = k.nitro;
    if (nt.miniWindowT > 0 && !b.planned) {
      b.planned = true;
      if (R.rng.next() < b.miniProb) {
        b.pressAt = R.t + b.reaction * R.rng.range(0.4, 1.0);
        b.press2 = R.rng.next() < b.dualProb;
      }
    }
    if (nt.miniWindowT <= 0 && b.pressAt < 0 && nt.dualWindowT <= 0) b.planned = false;
    if (b.pressAt >= 0 && R.t >= b.pressAt) {
      inp.nitro = true;
      b.pressAt = b.press2 ? R.t + 0.1 : -1;
      b.press2 = false;
      return;
    }
    // nitro ở đoạn thẳng
    if (nt.charges > 0 && nt.boostT <= 0 && nt.miniWindowT <= 0 && b.pressAt < 0 && kmh > 140) {
      var look = nt.charges >= TD.TUNING.maxCharges ? 12 : 30, clear = true;
      for (var q = 1; q <= look; q++) if (ln.drift[(li + q) % n]) { clear = false; break; }
      if (clear) {
        if (b.nitroHold > 0) b.nitroHold -= dt;
        else { inp.nitro = true; b.nitroHold = R.rng.range(0, 1.5) * (1 - b.skill); }
      }
    }
  }

  TD.Bot = { init: init, think: think };
})(typeof window !== 'undefined' ? window : globalThis);
