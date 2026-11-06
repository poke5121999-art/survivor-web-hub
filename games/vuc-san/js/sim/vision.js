// Mô phỏng: tầm nhìn. Ánh sáng là vật lý: mỗi nguồn là một vòng/nón bị vách đá và đám mực/mồi cắt bằng tia.
// Cứ visionEvery bước chụp lại các nguồn (vị trí, hướng, vật chắn); visibleTo hỏi từng nguồn bằng đúng một tia nhìn thẳng,
// còn đa giác quạt để vẽ (visionPolys) chỉ dựng khi có người xin và nhớ theo lần chụp. Kết quả chỉ phụ thuộc trạng thái trận, không phụ thuộc ai hỏi.
// Mỗi đội còn nhớ kho báu từng nằm trong vùng thấy được của mình (sim.known).
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var geom = VS.geom;
  var TAU = Math.PI * 2, DEG = Math.PI / 180;

  function rayCount(r) {
    var K = sim.K, n = Math.round(r * 8);
    return n < K.glowMin ? K.glowMin : n > K.glowMax ? K.glowMax : n;
  }

  // Đèn pin chỉ sáng khi thợ lặn còn bơi/bị ngậm, đèn bật và không bị quất tắt.
  sim.lightOn = function (a) {
    return a.team === 'diver' && a.light === true && (a.st === 'swim' || a.st === 'held') && !sim.effect(a, 'lightOff');
  };

  // Nguồn sáng: ring = vòng quanh nguồn (glow, flare, sense), ngược lại là nón từ góc a0 rộng span. own = id chủ nguồn (-1 là của bản đồ).
  function source(kind, x, y, r, own, ring, a0, span) {
    return { kind: kind, x: x, y: y, r: r, own: own, ring: ring, a0: a0, span: span, pts: null };
  }

  // Đường thẳng (x0,y0)->(x1,y1) không cắt vách đá và không cắt biên đám mực/mồi (theo lần chụp gần nhất).
  function losClear(m, x0, y0, x1, y1) {
    if (m.world._cast(x0, y0, x1, y1) <= 1) return false;
    var bl = m.vision.blockers;
    if (bl.length) {
      var dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-9) for (var i = 0; i < bl.length; i++) if (geom.rayCircle(x0, y0, dx / d, dy / d, bl[i].x, bl[i].y, bl[i].r) < d) return false;
    }
    return true;
  }

  // (x,y) có được nguồn L chiếu tới không: trong bán kính, trong nón, và đường thẳng từ nguồn không bị chắn.
  function lit(m, L, x, y) {
    var dx = x - L.x, dy = y - L.y, d2 = dx * dx + dy * dy;
    if (d2 > L.r * L.r) return false;
    if (d2 < 1e-10) return L.ring;
    if (!L.ring) {
      var a = Math.atan2(dy, dx) - L.a0;
      a -= TAU * Math.floor(a / TAU);
      if (a > L.span + 1e-9) return false;
    }
    return losClear(m, L.x, L.y, x, y);
  }

  function litAny(m, list, x, y, skipOwn) {
    for (var i = 0; i < list.length; i++) {
      var L = list[i];
      if (L.own === skipOwn && skipOwn >= 0) continue;
      if (lit(m, L, x, y)) return true;
    }
    return false;
  }

  // Dựng đa giác quạt cho L: pts = [x0,y0,x1,y1,...]. Nón: hai số đầu là đỉnh nón, rồi các đầu tia. Vòng: chỉ các đầu tia, (x,y) là tâm.
  function realize(m, L) {
    if (L.pts) return L;
    var w = m.world, bl = m.vision.blockers, nb = bl.length, ring = L.ring;
    var n = ring ? rayCount(L.r) : VS.TUNING.vision.beamRays, da = ring ? TAU / n : L.span / (n - 1), pts = ring ? [] : [L.x, L.y];
    for (var k = 0; k < n; k++) {
      var a = L.a0 + da * k, cs = Math.cos(a), sn = Math.sin(a), t = w._cast(L.x, L.y, L.x + cs * L.r, L.y + sn * L.r);
      if (t > 1) t = 1;
      for (var b = 0; b < nb; b++) {
        var tc = geom.rayCircle(L.x, L.y, cs, sn, bl[b].x, bl[b].y, bl[b].r) / L.r;
        if (tc < t) t = tc;
      }
      pts.push(L.x + cs * L.r * t, L.y + sn * L.r * t);
    }
    L.pts = pts; L.n = n; L.da = da; L.off = ring ? 0 : 2;
    return L;
  }

  sim.initVision = function (m) {
    var T = VS.TUNING.vision, st = [], i;
    Object.defineProperty(m, 'vision', {
      value: { tick: -9, gen: 0, polyGen: -1, stat: st, dyn: [], sense: [], diver: [], shark: [], polyDiver: [], polyShark: [], blockers: [] },
      writable: true, enumerable: false
    });
    Object.defineProperty(m, 'known', { value: { diver: [], shark: [] }, enumerable: false });
    for (i = 0; i < m.pods.length; i++) st.push(source('glow', m.pods[i].x, m.pods[i].y, T.podGlow, -1, true, 0, TAU));
    for (i = 0; i < m.o2.length; i++) st.push(source('glow', m.o2[i].x, m.o2[i].y, T.o2Glow, -1, true, 0, TAU));
    for (i = 0; i < st.length; i++) realize(m, st[i]);   // tĩnh: dựng một lần lúc tạo trận, chưa có đám mực nào
    sim.updateVision(m, true);
  };

  // Chụp lại các nguồn sáng động (đèn pin, quầng, pháo sáng, vòng cảm nhận): mỗi visionEvery bước, hoặc ép bằng force.
  // Cùng lúc ghi nhớ kho báu mỗi đội vừa soi thấy.
  sim.updateVision = function (m, force) {
    var V = m.vision;
    if (!force && m.tick - V.tick < sim.K.visionEvery) return false;
    V.tick = m.tick; V.gen++;
    var T = VS.TUNING.vision, i, a, z, sense = [], beams = [], glows = [], flares = [], living = 0, sighted = 0;
    var half = T.beamAngle * DEG / 2;
    V.blockers = [];
    for (i = 0; i < m.zones.length; i++) {
      z = m.zones[i];
      if ((z.kind === 'ink' || z.kind === 'bait') && z.until > m.t) V.blockers.push({ x: z.x, y: z.y, r: z.r });
      else if (z.kind === 'flare' && z.until > m.t) flares.push(source('flare', z.x, z.y, z.r, -1, true, 0, TAU));
    }
    for (i = 0; i < m.actors.length; i++) {
      a = m.actors[i];
      if (a.st === 'out') continue;
      if (a.team === 'diver') {
        glows.push(source('glow', a.x, a.y, T.selfGlow, a.id, true, 0, TAU));
        if (sim.lightOn(a)) beams.push(source('beam', a.x, a.y, T.beamRange * (a.beamMul || 1), a.id, false, a.ang - half, 2 * half));
      } else {
        living++;
        var blind = !!sim.effect(a, 'blind');
        if (!blind) sighted++;
        sense.push(source('sense', a.x, a.y, blind ? a.r : T.sharkSense, a.id, true, 0, TAU));
      }
    }
    V.dyn = beams.concat(glows, flares); V.sense = sense;
    V.diver = V.dyn.concat(V.stat);
    // Cả đội cá mập mù thì chỉ còn các vòng sát người; còn một con sáng mắt thì thấy hết vùng sáng
    V.shark = living > 0 && sighted === 0 ? sense : V.diver.concat(sense);
    var known = m.known;
    for (i = 0; i < m.loot.length; i++) {
      var lt = m.loot[i];
      if (!known.diver[i] && litAny(m, V.diver, lt.x, lt.y, -1)) known.diver[i] = true;
      if (!known.shark[i] && litAny(m, V.shark, lt.x, lt.y, -1)) known.shark[i] = true;
    }
    return true;
  };

  // Kho báu đội team đã từng soi thấy (theo thứ tự id), kể cả món đã nộp; bot lọc lấy món còn nằm yên (st 'rest').
  sim.known = function (m, team) {
    var k = m.known[team], out = [];
    for (var i = 0; i < m.loot.length; i++) if (k[i]) out.push(m.loot[i]);
    return out;
  };

  // Đa giác quạt của vùng thấy được (dựng khi cần, dùng lại tới lần chụp kế). Không được sửa mảng trả về.
  sim.visionPolys = function (m, team) {
    var V = m.vision, i;
    if (V.polyGen !== V.gen) {
      for (i = 0; i < V.stat.length; i++) realize(m, V.stat[i]);
      for (i = 0; i < V.dyn.length; i++) realize(m, V.dyn[i]);
      for (i = 0; i < V.sense.length; i++) realize(m, V.sense[i]);
      V.polyDiver = V.diver; V.polyShark = V.shark; V.polyGen = V.gen;
    }
    return team === 'shark' ? V.polyShark : V.polyDiver;
  };

  sim.visibleTo = function (m, team, x, y) {
    return litAny(m, team === 'shark' ? m.vision.shark : m.vision.diver, x, y, -1);
  };

  function d2(a, b) { return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y); }

  // Cá mập s có thấy thợ lặn d không. Một con mù chỉ thấy cái chạm sát người; ngoài ra dùng chung luật cả đội (canSee).
  sim.sharkSees = function (m, s, d) {
    if (s.st === 'out' || d.st === 'out') return false;
    if (sim.effect(s, 'blind')) { var rr = s.r + d.r; return d2(s, d) <= rr * rr; }
    return sim.canSee(m, 'shark', d);
  };

  // Đội team có thấy actor a (thuộc đội kia) không. Đồng đội luôn thấy nhau. Thứ tự: bị lộ (reveal) > tàng hình (stealth) > luật từng phe.
  sim.canSee = function (m, team, a) {
    if (a.st === 'out') return false;
    if (a.team === team) return true;
    if ((m.reveal && m.reveal[team] > m.t) || sim.effect(a, 'reveal')) return true;
    var T = VS.TUNING.vision, i, s, d;
    var st = sim.effect(a, 'stealth');
    if (st) {
      for (i = 0; i < m.actors.length; i++) {
        d = m.actors[i];
        if (d.team !== team || d.st === 'out') continue;
        if (d2(d, a) <= st.mag * st.mag) return true;
      }
      return false;
    }
    if (team === 'shark') {
      var on = sim.lightOn(a), bleeding = a.o2 / a.o2Max < T.bloodPct, anySighted = false;
      for (i = 0; i < m.actors.length; i++) {
        s = m.actors[i];
        if (s.team !== 'shark' || s.st === 'out') continue;
        d = Math.sqrt(d2(s, a));
        if (sim.effect(s, 'blind')) { if (d <= s.r + a.r) return true; continue; }
        anySighted = true;
        if (on && d <= T.beacon && losClear(m, s.x, s.y, a.x, a.y)) return true;   // đèn pin bật là ngọn hải đăng, vách che thì mất
        if (bleeding && d <= T.bloodRange) return true;                             // mùi máu xuyên vách
      }
      // Ánh sáng của chính nạn nhân không tính: đã có luật hải đăng, nếu không tắt đèn cũng chẳng giấu được ai
      return anySighted && litAny(m, m.vision.shark, a.x, a.y, a.id);
    }
    var V = m.vision.diver, cs = Math.cos(a.ang) * a.r, sn = Math.sin(a.ang) * a.r;
    return litAny(m, V, a.x, a.y, -1) || litAny(m, V, a.x + cs, a.y + sn, -1) || litAny(m, V, a.x - cs, a.y - sn, -1);
  };
})(window.VS = window.VS || {});
