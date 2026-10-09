// Vật lý xe kart (arcade). Thuần JS.
// Quy ước: yaw (rad) → hướng đầu xe (sin yaw, 0, cos yaw); yaw tăng = quay trái. Lưới xe nhìn về +z dùng rotation.y = yaw
// (lưới xuất từ Unity đã lật z nhìn về −z thì rotation.y = yaw + π).
// input = { steer ∈ [-1,1] (+1 = phải), throttle 0..1, brake 0..1, drift bool, nitro bool }.
// speed: m/s có dấu theo đầu xe (âm = lùi); kmh = |speed|·3.6. slip / drift.vd: góc lệch đầu xe–vận tốc (độ, + = đuôi văng sang phải khi rẽ trái).
(function (G) {
  var TD = G.TD = G.TD || {};
  var D2R = Math.PI / 180;

  function curve(c, x) {
    if (x <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) {
      if (x <= c[i][0]) {
        var a = c[i - 1], b = c[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0] || 1);
      }
    }
    return c[c.length - 1][1];
  }
  function wrap(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
  function norm01(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 0.5;
    if (v > 1) v = v <= 10 ? v / 10 : v / 100;
    return Math.max(0, Math.min(1, v));
  }

  // Thông số xe: TD.CARS[carId].stats (thang 0..1, 0..10 hoặc 0..100; 0.5 = xe chuẩn) nếu có.
  function carParams(carId) {
    var U = TD.TUNING, c = TD.CARS && TD.CARS[carId], s = (c && c.stats) || {};
    return {
      top: U.topKmh / 3.6 * (0.97 + 0.06 * norm01(s.speed)),        // chọn: ±3%
      accel: U.accel * (0.9 + 0.2 * norm01(s.accel)),               // chọn: ±10%
      handling: 0.94 + 0.12 * norm01(s.handling),                   // chọn: ±6% tốc độ quay
      drift: 0.9 + 0.2 * norm01(s.drift),                           // chọn: ±10% nạp bình khi drift
      nitro: 0.97 + 0.06 * norm01(s.nitro),                         // chọn: ±3% trần nitro
    };
  }

  function create(o) {
    var k = {
      id: o.id, carId: o.carId || 'default', driverId: o.driverId || null, name: o.name || ('P' + o.id), ctrl: o.ctrl || 'bot',
      x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, vy: 0, speed: 0, kmh: 0, yawRate: 0, slip: 0, grounded: true, st: 'grid',
      drift: { dir: 0, t: 0, vd: 0, peak: 0 },
      nitro: { gauge: 0, charges: 0, boostT: 0, miniT: 0, miniWindowT: 0, dualWindowT: 0, miniPerfect: false },
      lap: 0, cpNext: 0, lastCp: 0, progress: 0, place: 0, finishT: null,
      input: { steer: 0, throttle: 0, brake: 0, drift: false, nitro: false },
      stats: { lapTimes: [], bestLap: null, drifts: 0, miniBoosts: 0, nitros: 0, wallHits: 0, respawns: 0, topKmh: 0 },
      p: carParams(o.carId), topScale: 1, compKmh: 0, compAcc: 0,
      vyaw: 0, ghostT: 0, respawnT: 0, airT: 0, wallCool: 0, wrongT: 0, stuckT: 0, loc: null,
      miniKmh: 0, miniDur: 0, chain: 0, chainT: 0, _nitroPrev: false, _thrPrev: false, _thrPressT: -1e9, _airEv: false,
    };
    return k;
  }

  function ev(R, k, type, extra) {
    var e = { t: R.t, type: type, kart: k.id };
    if (extra) for (var q in extra) e[q] = extra[q];
    R.events.push(e);
  }

  function addMini(R, k, kmh, dur, kind) {
    var U = TD.TUNING;
    var coef = U.stackCoef[Math.min(k.chain, U.stackCoef.length - 1)];
    k.chain++; k.chainT = 2.5;
    var add = kmh * coef;
    k.miniKmh = Math.max(k.miniKmh * (k.nitro.miniT / (k.miniDur || 1)), 0) + add;
    k.nitro.miniT = k.miniDur = dur;
    k.speed = Math.max(k.speed, Math.min(k.speed + add / 3.6 * U.miniKick, k.p.top * k.topScale * U.nitroMul));
    ev(R, k, 'miniboost', { kind: kind, kmh: add });
  }

  function endDrift(R, k, why) {
    var U = TD.TUNING, vd = Math.abs(k.drift.vd);
    k.st = 'drive';
    if (why !== 'release') k._driftBlock = true;   // phải nhả nút drift mới drift lại
    k.drift.lastEnd = why;
    var ok = vd >= U.miniAnyVD && why === 'release';
    k.nitro.miniWindowT = ok ? U.miniWindow : 0;
    k.nitro.miniPerfect = vd >= U.miniMinVD && vd <= U.miniMaxVD;
    ev(R, k, 'drift_end', { vd: vd, peak: k.drift.peak, dur: k.drift.t, why: why, mini: ok });
    k.drift.dir = 0;
  }

  // Một bước cố định. T = track đã chuẩn bị, R = race.
  function step(k, R, T, dt) {
    var U = TD.TUNING, inp = k.input, n = k.nitro, p = k.p;
    var g = T.gravity || U.gravity;
    if (k.ghostT > 0) k.ghostT -= dt;
    if (k.wallCool > 0) k.wallCool -= dt;
    if (k.st === 'respawn') {
      k.respawnT -= dt;
      k.speed = 0; k.vx = k.vz = 0; k.vy = 0;
      if (k.respawnT <= 0) k.st = 'drive';
      k._nitroPrev = inp.nitro;
      return;
    }
    var top = p.top * k.topScale + k.compKmh / 3.6;
    var nitroPress = inp.nitro && !k._nitroPrev;
    k._nitroPrev = inp.nitro;

    // --- tăng tốc: phun nhỏ / phun đôi / nitro ---
    n.miniWindowT = Math.max(0, n.miniWindowT - dt);
    n.dualWindowT = Math.max(0, n.dualWindowT - dt);
    if (k.chainT > 0) { k.chainT -= dt; if (k.chainT <= 0) k.chain = 0; }
    if (nitroPress && k.st !== 'finish') {
      if (n.miniWindowT > 0) {
        n.miniWindowT = 0;
        addMini(R, k, n.miniPerfect ? U.miniPerfectKmh : U.miniKmh, U.miniTime, n.miniPerfect ? 'perfect' : 'mini');
        k.stats.miniBoosts++;
        n.dualWindowT = U.dualWindow;
      } else if (n.dualWindowT > 0) {
        n.dualWindowT = 0;
        addMini(R, k, U.miniKmh, U.miniTime, 'dual');
        k.stats.miniBoosts++;
      } else if (n.charges > 0 && n.boostT <= 0) {
        n.charges--; n.boostT = U.nitroTime;
        k.stats.nitros++;
        ev(R, k, 'nitro_start', { charges: n.charges });
      }
    }
    if (n.boostT > 0) { n.boostT -= dt; if (n.boostT <= 0) { n.boostT = 0; ev(R, k, 'nitro_end'); } }
    if (n.miniT > 0) { n.miniT -= dt; if (n.miniT <= 0) { n.miniT = 0; k.miniKmh = 0; } }
    var boosting = n.boostT > 0 || n.miniT > 0;
    var miniV = n.miniT > 0 ? k.miniKmh / 3.6 * Math.min(1, n.miniT / k.miniDur * 2) : 0;
    var cap = n.boostT > 0 ? top * U.nitroMul * p.nitro + miniV * U.miniOnNitro : top + miniV;

    var thr = k.st === 'finish' ? Math.min(inp.throttle, 0.6) : inp.throttle;
    var spd = k.speed, v = Math.abs(spd), kmh = v * 3.6;
    var steer = Math.max(-1, Math.min(1, inp.steer || 0));
    steer = steer * curve(U.steerIntensity, Math.abs(steer));

    // --- vào drift ---
    if (!inp.drift) k._driftBlock = false;
    if (k.st === 'drive' && !k._driftBlock && k.grounded && inp.drift && Math.abs(inp.steer) > 0.2 && kmh >= U.driftMinKmh && spd > 0) {
      k.st = 'drift';
      k.drift.dir = inp.steer > 0 ? 1 : -1; k.drift.t = 0; k.drift.peak = 0;
      k.stats.drifts++;
      ev(R, k, 'drift_start', { dir: k.drift.dir });
    }
    var drifting = k.st === 'drift';
    if (drifting && (!inp.drift)) { endDrift(R, k, 'release'); drifting = false; }
    else if (drifting && (kmh < U.driftMinKmh * 0.6 || !k.grounded)) { endDrift(R, k, 'slow'); drifting = false; }

    // --- dọc ---
    var acc = 0;
    if (inp.brake > 0 && spd > 0.5) {
      acc = -curve(U.brake, kmh) / 3.6 * inp.brake;
    } else if (inp.brake > 0 && spd <= 0.5 && !(thr > 0)) {
      acc = spd > -U.reverseTopKmh / 3.6 ? -U.reverseAccel * inp.brake : 0;
    } else if (thr > 0 && spd < -0.3) {
      acc = curve(U.brake, kmh) / 3.6;
    } else if (thr > 0) {
      var f = Math.max(U.powerFloor, curve(U.powerChain, spd / top * 100));
      acc = p.accel * f * thr + k.compAcc / 3.6;
      if (drifting) acc *= curve(U.driftSpeedFactor, spd / top * 100) / 0.45;
      if (boosting) acc = Math.max(acc, U.boostAccel);
    } else if (spd > 0) {
      acc = -U.coastKmhS / 3.6;
    } else if (spd < 0) acc = U.coastKmhS / 3.6;
    if (drifting) acc += curve(U.driftDecel, Math.abs(k.drift.vd)) * U.driftDecelScale / 3.6;
    if (!k.grounded) acc = 0;
    var ns = spd + acc * dt;
    if (spd > 0 && acc > 0 && ns > cap) ns = Math.max(spd, cap);
    if (ns > cap) ns = Math.max(cap, ns - U.overTopKmhS / 3.6 * dt);
    if (spd > 0 && ns < 0 && !(inp.brake > 0)) ns = 0;
    if (spd < 0 && ns > 0) ns = 0;
    spd = ns; v = Math.abs(spd); kmh = v * 3.6;

    // --- quay ---
    var target;
    if (!k.grounded) {
      target = -steer * U.airAngSpeed * D2R * 0.5;
    } else if (drifting) {
      var sd = steer * k.drift.dir, sc = U.driftAngScale;
      var kk = sd < 0 ? sc[1] + (sc[1] - sc[0]) * sd : sc[1] + (sc[2] - sc[1]) * sd;
      target = -k.drift.dir * U.driftMaxAngSpeed * D2R * kk * p.handling;
    } else {
      var ang = curve(U.maxSteerAngle, kmh) * D2R;
      var w = Math.min(v * Math.tan(ang) / U.wheelbase, curve(U.drivingMaxAngSpeed, v / top) * D2R * p.handling);
      target = -steer * w * (spd < 0 ? -1 : 1);
    }
    k.yawRate += (target - k.yawRate) * (1 - Math.exp(-dt / U.steerTau));
    k.yaw = wrap(k.yaw + k.yawRate * dt);

    // --- hướng vận tốc ---
    var vd = wrap(k.yaw - k.vyaw);
    if (spd < 0) { k.vyaw = k.yaw; vd = 0; }
    else if (drifting) {
      var rate = Math.max(U.driftVelLerpFloor, curve(U.driftVelLerp, Math.abs(vd) / D2R)) * U.driftVelLerpScale;
      k.vyaw = wrap(k.vyaw + vd * (1 - Math.exp(-rate * dt)));
      vd = wrap(k.yaw - k.vyaw);
      var lim = U.driftVdMax * D2R;
      if (vd > lim) { k.vyaw = wrap(k.yaw - lim); vd = lim; } else if (vd < -lim) { k.vyaw = wrap(k.yaw + lim); vd = -lim; }
      k.drift.t += dt;
      k.drift.vd = vd / D2R;
      if (Math.abs(k.drift.vd) > k.drift.peak) k.drift.peak = Math.abs(k.drift.vd);
      n.gauge += U.gaugeRate * p.drift * v * Math.abs(Math.sin(vd)) * dt;
    } else if (k.grounded) {
      // nhả drift: đầu xe quay ngược về hướng chạy (back-steer), vận tốc bám đầu xe
      if (Math.abs(vd) > 2 * D2R) {
        var bs = Math.min(Math.abs(vd), U.driftEndBackSteer * dt) * (vd > 0 ? 1 : -1);
        k.yaw = wrap(k.yaw - bs);
        vd = wrap(k.yaw - k.vyaw);
      }
      k.vyaw = wrap(k.vyaw + vd * (1 - Math.exp(-U.grip * dt)));
      vd = wrap(k.yaw - k.vyaw);
    }
    k.slip = vd / D2R;
    if (n.gauge >= 1) {
      if (n.charges < U.maxCharges) { n.charges++; n.gauge -= 1; ev(R, k, 'gauge_full', { charges: n.charges }); }
      else n.gauge = 1;
    }

    // --- tích phân ---
    var mv = spd < 0 ? -v : v;
    k.vx = Math.sin(k.vyaw) * mv; k.vz = Math.cos(k.vyaw) * mv;
    k.speed = spd;
    k.px = k.x; k.pz = k.z;
    k.x += k.vx * dt; k.z += k.vz * dt;

    // --- mặt đường, bay ---
    var loc = TD.Track.locate(T, k.x, k.y, k.z, k.loc ? k.loc.seg : null);
    k.loc = loc;
    if (k.grounded) {
      var vyS = loc.slope * (k.vx * loc.fx + k.vz * loc.fz), vyF = k.vy - g * dt;
      if (k.y + vyF * dt - loc.y > 0.05) {
        // mặt đường hụt nhanh hơn rơi tự do → bay
        k.grounded = false; k.airT = 0; k._airEv = false;
        k.vy = vyF; k.y += k.vy * dt;
        if (drifting) endDrift(R, k, 'air');
      } else { k.vy = vyS; k.y = loc.y; }
    } else {
      k.airT += dt;
      k.vy -= g * dt; k.y += k.vy * dt;
      if (!k._airEv && k.airT > 0.12) { k._airEv = true; ev(R, k, 'air'); }
      if (k.y <= loc.y) {
        var pw = Math.min(1, Math.max(0, -k.vy / U.landPowerVy));
        if (k._airEv) ev(R, k, 'land', { power: pw, air: k.airT });
        k.y = loc.y; k.vy = 0; k.grounded = true;
      }
    }

    // --- tường ---
    if (!loc.inside && k.y - loc.y < 3) wall(R, k, loc);
    k.kmh = Math.abs(k.speed) * 3.6;
    if (k.kmh > k.stats.topKmh) k.stats.topKmh = k.kmh;
  }

  function wall(R, k, loc) {
    var U = TD.TUNING;
    var limL = loc.lw - U.halfWidth, limR = loc.rw - U.halfWidth, over, side;
    var lx = loc.fz, lz = -loc.fx, nx, nz;
    if (loc.d > limL) { over = loc.d - limL; nx = -lx; nz = -lz; side = 'left'; }
    else if (loc.d < -limR) { over = -limR - loc.d; nx = lx; nz = lz; side = 'right'; }
    else return;
    k.x += nx * over; k.z += nz * over;
    loc.d += (side === 'left' ? -over : over);
    var vn = -(k.vx * nx + k.vz * nz);            // vào tường (> 0)
    if (vn <= 0) return;
    var v = Math.hypot(k.vx, k.vz) || 1e-6;
    var th = Math.asin(Math.min(1, vn / v)) * 180 / Math.PI;
    var tx = k.vx + nx * vn, tz = k.vz + nz * vn;
    var keep = (th > U.wallFrontAngle ? curve(U.wallKeepFront, th) : curve(U.wallKeep, th));
    var bounce = curve(U.wallBounce, vn * 3.6) / 3.6;
    tx *= keep; tz *= keep;
    k.vx = tx + nx * bounce; k.vz = tz + nz * bounce;
    var ns = Math.hypot(k.vx, k.vz);
    var power = Math.min(1, vn * 3.6 / 120);
    if (k.speed >= 0 && ns > 0.5) {
      var vy = Math.atan2(k.vx, k.vz);
      k.vyaw = vy;
      if (k.st !== 'drift') {
        var a = wrap(vy - k.yaw);
        k.yaw = wrap(k.yaw + a * U.wallAlign * Math.min(1, th / 90));
        k.vyaw = wrap(k.yaw + wrap(vy - k.yaw));
      }
      k.speed = ns;
    } else {
      k.speed = k.speed >= 0 ? ns * 0.3 : -ns;
    }
    if (k.st === 'drift' && power > U.driftCollEnd) endDrift(R, k, 'wall');
    if (vn * 3.6 > 6 && k.wallCool <= 0) {
      k.wallCool = 0.3;
      k.stats.wallHits++;
      ev(R, k, 'wall', { power: power, side: side, angle: th });
    }
  }

  function startBoost(R, k) {
    var U = TD.TUNING;
    k.miniKmh = U.startKmh; k.nitro.miniT = k.miniDur = U.startTime;
    k.speed += U.startKmh / 3.6 * U.miniKick;
    ev(R, k, 'miniboost', { kind: 'start', kmh: U.startKmh });
  }

  TD.Kart = { create: create, step: step, startBoost: startBoost, curve: curve, wrap: wrap, carParams: carParams, ev: ev };
})(typeof window !== 'undefined' ? window : globalThis);
