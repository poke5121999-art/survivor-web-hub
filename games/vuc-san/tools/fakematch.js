// Công cụ: trận giả cho phòng thử lớp vẽ (tools/viewlab.html) khi mô phỏng thật (nhánh W1) chưa ghép vào.
// Match đúng hình dạng trong brain/plans/vuc-san.md trên một bản đồ HX_ZONES (mặc định A01): 4 thợ lặn + 2 cá mập chạy
// theo kịch bản thời gian vòng 40 giây (mọi giá trị st đều xuất hiện), kho báu, khoang cứu hộ, rương O₂, mũi xiên đang bay,
// vùng kỹ năng, sự kiện. Kèm VS.sim.visionPolys / canSee / known thay thế, chỉ cài khi VS.sim chưa có: nón và vòng tròn,
// mặc định có che khuất bằng tia bắn vào vách (m.fake.occlude; phòng thử ?occlude=0 thì không che). Ngẫu nhiên lấy từ mulberry32 theo seed (không dùng Math.random) để ảnh chụp lặp lại được.
// m.t chỉ đếm thời gian chơi (đã qua mở màn: phase 'play', phaseT = intro) như hợp đồng trong README.
(function (VS) {
  'use strict';
  var CYCLE = 40;
  var TAU = Math.PI * 2;

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  function inWin(t, a, b) { return t >= a && t < b; }

  // ---------- vách bản đồ (đa giác va chạm gốc), chỉ để đặt đồ vào chỗ nước ----------
  function walls(zone) {
    return zone.walls.map(function (pts) {
      var b = { pts: pts, minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 };
      pts.forEach(function (p) { b.minX = Math.min(b.minX, p[0]); b.maxX = Math.max(b.maxX, p[0]); b.minY = Math.min(b.minY, p[1]); b.maxY = Math.max(b.maxY, p[1]); });
      return b;
    });
  }
  function insidePts(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function solidIn(polys, x, y) {
    if (y > window.HX_TUNING.water.surfaceY - 0.3) return true;
    for (var i = 0; i < polys.length; i++) {
      var p = polys[i];
      if (x >= p.minX && x <= p.maxX && y >= p.minY && y <= p.maxY && insidePts(p.pts, x, y)) return true;
    }
    return false;
  }
  // Lưới ô 4 m chứa các đoạn vách, để mỗi tia chỉ thử những đoạn ở gần.
  var CELL = 4;
  function segGrid(polys) {
    var segs = [], map = {};
    polys.forEach(function (p) {
      var pts = p.pts;
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length], k = segs.length;
        segs.push([a[0], a[1], b[0], b[1]]);
        for (var cx = Math.floor(Math.min(a[0], b[0]) / CELL); cx <= Math.floor(Math.max(a[0], b[0]) / CELL); cx++) {
          for (var cy = Math.floor(Math.min(a[1], b[1]) / CELL); cy <= Math.floor(Math.max(a[1], b[1]) / CELL); cy++) (map[cx + ',' + cy] = map[cx + ',' + cy] || []).push(k);
        }
      }
    });
    return { segs: segs, map: map, seen: new Uint32Array(segs.length), stamp: 0 };
  }
  function nearSegs(G, x, y, r) {
    var out = [];
    G.stamp++;
    for (var cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (var cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
        var list = G.map[cx + ',' + cy];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) if (G.seen[list[i]] !== G.stamp) { G.seen[list[i]] = G.stamp; out.push(G.segs[list[i]]); }
      }
    }
    return out;
  }
  // khoảng tới vách gần nhất theo hướng (dx, dy) từ (x, y), tối đa r
  function cast(segs, x, y, dx, dy, r) {
    var t = r;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], ex = s[2] - s[0], ey = s[3] - s[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      var qx = s[0] - x, qy = s[1] - y, tt = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
      if (tt > 0 && tt < t && u >= 0 && u <= 1) t = tt;
    }
    return t;
  }

  // nước thoáng: tâm và một vòng quanh nó không chạm đá
  function openIn(polys, x, y, r) {
    if (solidIn(polys, x, y)) return false;
    for (var k = 0; k < 8; k++) if (solidIn(polys, x + Math.cos(k * TAU / 8) * r, y + Math.sin(k * TAU / 8) * r)) return false;
    return true;
  }

  // ---------- người và cá mập ----------
  function intent() { return { mx: 0, my: 0, boost: false, aimX: 0, aimY: 0, fire: false, fireHeld: false, skill: false, light: false, interact: false, interactHeld: false }; }
  function diver(id, defId, name, ctrl) {
    var d = VS.DIVERS[defId];
    return {
      id: id, team: 'diver', defId: defId, name: name, ctrl: ctrl, x: 0, y: 0, vx: 0, vy: 0, face: 1, ang: 0, r: VS.TUNING.diver.r,
      st: 'swim', stT: 0, o2: d.o2, o2Max: d.o2, carry: [], carryKg: 0, light: true,
      skill: { id: d.skill, cd: 0, t: 0, charges: VS.SKILL_DATA[d.skill].charges || 0 }, effects: [], intent: intent(), brain: null,
      stats: { banked: 0, revives: 0, dmg: 0, bites: 0, downs: 0, outs: 0, sharkOuts: 0 },
    };
  }
  function shark(id, defId, name, ctrl) {
    var s = VS.SHARKS[defId];
    return {
      id: id, team: 'shark', defId: defId, name: name, ctrl: ctrl, x: 0, y: 0, vx: 0, vy: 0, face: 1, ang: 0, r: s.r,
      st: 'swim', stT: 0, hp: s.hp, hpMax: s.hp, stamina: VS.TUNING.shark.staminaMax, biteCd: 0, holdId: null,
      skill: { id: s.skill, cd: 0, t: 0, charges: 0 }, effects: [], intent: intent(), brain: null,
      stats: { banked: 0, revives: 0, dmg: 0, bites: 0, downs: 0, outs: 0, sharkOuts: 0 },
    };
  }

  // Đường bơi Lissajous quanh tâm (cx, cy), biên độ (ax, ay), chu kỳ per giây, pha ph.
  function lis(cx, cy, ax, ay, per, ph) {
    return function (t) { var w = TAU / per; return { x: cx + ax * Math.sin(w * t + ph), y: cy + ay * Math.sin(2 * w * t + ph * 1.7) }; };
  }

  function baseMatch(seed, mapId) {
    var zone = window.HX_ZONES[mapId];
    if (!zone) throw new Error('map not found: ' + mapId);
    var map = VS.MAPS.filter(function (x) { return x.id === mapId; })[0];
    return {
      seed: seed >>> 0, rng: rng(seed), mapId: mapId, theme: map ? map.theme : 'day', t: 0, phase: 'play', phaseT: VS.TUNING.match.intro,
      actors: [], loot: [], pods: (zone.pods || []).map(function (p) { return { x: p[0], y: p[1], r: VS.TUNING.pod.r }; }),
      o2: (zone.o2 || []).map(function (p) { return { x: p[0], y: p[1], readyAt: 0 }; }),
      projs: [], zones: [], score: { banked: 0, target: 0 }, tickets: VS.TUNING.match.tickets, events: [], result: null,
      fake: { zone: zone, walls: walls(zone), pins: {}, lastSt: {}, nextProj: 1, fired: {}, cycleT: -1, known: { diver: {}, shark: {} }, occlude: true, grid: null, extraZones: [], extraEff: {}, skillFired: {} },
    };
  }

  // ---------- trận giả mặc định: 4 thợ lặn + 2 cá mập ----------
  function create(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 7 : opts.seed, m = baseMatch(seed, opts.mapId || 'A01'), F = m.fake, R = m.rng;
    if (opts.occlude === false) F.occlude = false;
    m.actors = [
      diver(0, 'dave', 'Bạn', 'human'), diver(1, 'hai', 'Hải', 'bot'), diver(2, 'lan', 'Lan', 'bot'), diver(3, 'bao', 'Bảo', 'bot'),
      shark(4, 'Blacktip_Reefshark', 'Vây Đen', 'bot'), shark(5, 'Smooth_Hammershark', 'Đầu Búa', 'bot'),
    ];
    F.paths = [
      lis(-27, 8, 9, 3.5, 28, 0.3), lis(-38, 1, 5, 2.6, 22, 1.1), lis(-37, -1.5, 4, 3.4, 18, 2.2), lis(-18, 13, 6.5, 2.5, 26, 0.7),
      lis(-30, 6, 12, 4.5, 30, 1.9), lis(-15, 10, 5, 4.5, 20, 0.2),
    ];
    // kho báu ở chỗ nước thoáng của vùng chơi, giá theo bậc của VS.TUNING.loot.tiers
    var tiers = VS.TUNING.loot.tiers, n = VS.TUNING.loot.count.A, total = 0, tries = 0;
    var arts = [null, 'Item_GoldCup', 'bdl:art/dtd/loot/Crates01.png', null];
    while (m.loot.length < n && tries++ < 4000) {
      var x = -46 + R() * 48, y = -6 + R() * 23;
      if (!openIn(F.walls, x, y, 0.6)) continue;
      var roll = R(), ti = roll < tiers[0].w ? 0 : roll < tiers[0].w + tiers[1].w ? 1 : 2, T = tiers[ti];
      var value = Math.round(T.value[0] + R() * (T.value[1] - T.value[0])), kg = +(T.kg[0] + R() * (T.kg[1] - T.kg[0])).toFixed(1);
      total += value;
      m.loot.push({ id: m.loot.length, x: x, y: y, art: arts[m.loot.length % arts.length] || undefined, value: value, kg: kg, st: 'rest', by: null });
    }
    m.score.target = Math.round(total * VS.TUNING.match.targetPct);
    // khoảng từ tâm thân cá mập tới mõm (m), theo khung bao gốc và cỡ lớp vẽ đặt theo bán kính va chạm
    var rec = window.HX && HX.Shark && HX.Shark.BY_ID[m.actors[4].defId];
    F.mouth = rec && rec.mouth && VS.SharkView ? (rec.mouth[0] - (rec.bounds[0] + rec.bounds[2]) / 2) * VS.SharkView.baseSize(rec.id) : 2.2;
    F.clock = m.actors.map(function () { return m.t; });
    if (opts.t0) { m.t += opts.t0; F.clock = F.clock.map(function (c) { return c + opts.t0; }); }
    // đội thợ lặn "đã từng soi thấy" những món ở gần đường bơi từ đầu trận tới giờ bắt đầu
    for (var tt = 0; tt <= m.t; tt += 0.5) {
      [0, 1, 2, 3].forEach(function (id) {
        var p = F.paths[id](tt);
        m.loot.forEach(function (l) { if (Math.hypot(l.x - p.x, l.y - p.y) < VS.TUNING.vision.beamRange * 0.6) F.known.diver[l.id] = 1; });
      });
    }
    step(m, 0);
    m.events.length = 0;
    return m;
  }

  function ev(m, type, o) { o = o || {}; o.t = m.t; o.type = type; m.events.push(o); }
  function setSt(m, a, st) {
    if (a.st !== st) { a.st = st; a.stT = 0; }
  }
  function moveTo(a, p, dt) {
    if (dt > 0) { a.vx = (p.x - a.x) / dt; a.vy = (p.y - a.y) / dt; }
    a.x = p.x; a.y = p.y;
  }
  function velOf(path, t) { var a = path(t), b = path(t + 0.05); return { x: (b.x - a.x) / 0.05, y: (b.y - a.y) / 0.05 }; }

  // Một bước của kịch bản. dt có thể 0 (chỉ dựng lại trạng thái tại m.t).
  function step(m, dt) {
    if (m.fake.grid) return gridStep(m, dt);
    var F = m.fake, A = m.actors, TD = VS.TUNING.diver;
    m.t += dt;
    var c = (m.t % CYCLE + CYCLE) % CYCLE;
    // đầu vòng: đặt lại đồ đang mang, máu, lượt
    if (c < F.cycleT) {
      m.loot[0].st = m.loot[1].st = 'carried'; m.loot[0].by = m.loot[1].by = 2;
      m.score.banked = 0; m.tickets = VS.TUNING.match.tickets;
      A.forEach(function (a) { if (a.team === 'shark') a.hp = a.hpMax; else a.o2 = a.o2Max; });
      m.o2.forEach(function (b) { b.readyAt = 0; });
    }
    if (F.cycleT < 0) { m.loot[0].st = m.loot[1].st = 'carried'; m.loot[0].by = m.loot[1].by = 2; }
    F.cycleT = c;
    A.forEach(function (a) { a.stT += dt; });

    // --- vị trí theo đường bơi; mỗi người một đồng hồ đường bơi, đứng yên (choáng, ngủ, gục, bị loại) thì đồng hồ dừng.
    // Người bị ghim bởi phòng thử thì đứng đúng chỗ ghim. ---
    var frozen = [false, inWin(c, 24, 30), false, inWin(c, 30, 37), inWin(c, 34, 40), inWin(c, 16, 17.4) || inWin(c, 26, 29)];
    A.forEach(function (a) {
      if (F.pins[a.id]) {
        var pn = F.pins[a.id];
        a.vx = pn.vx || 0; a.vy = pn.vy || 0; a.x = pn.x; a.y = pn.y;
        // ghim có hướng mặt thì cá mập nằm ngang theo hướng đó
        if (pn.face) { a.face = pn.face; if (a.team === 'shark') a.ang = pn.face > 0 ? 0 : Math.PI; }
        return;
      }
      if (!frozen[a.id]) F.clock[a.id] += dt;
      var p = F.paths[a.id](F.clock[a.id]), v = frozen[a.id] ? { x: 0, y: 0 } : velOf(F.paths[a.id], F.clock[a.id]);
      a.x = p.x; a.y = p.y; a.vx = v.x; a.vy = v.y;
    });
    var d0 = A[0], d1 = A[1], d2 = A[2], d3 = A[3], s4 = A[4], s5 = A[5];

    // Hải (1): bị cá mập Vây Đen (4) vồ, ngậm, rồi gục, được cứu
    var heldW = inWin(c, 9.95, 11.45), lungeW = inWin(c, 9.6, 9.95), downW = inWin(c, 24, 30);
    if (!F.pins[4] && inWin(c, 6, 12)) {
      // cá mập rời đường bơi, áp sát Hải từ bên trái rồi ngậm
      var k = smooth(6, 9.6, c) * (1 - smooth(11.45, 12, c));
      var tx = d1.x - F.mouth - (lungeW || heldW ? 0 : 1.2), ty = d1.y - 0.2;
      s4.x += (tx - s4.x) * k; s4.y += (ty - s4.y) * k;
      if (k > 0.5) { s4.vx = 1.2 + (lungeW ? 4 : 0); s4.vy = (d1.y - s4.y) * 0.4; }
    }
    if (!F.pins[1] && heldW) { d1.x = s4.x + F.mouth; d1.y = s4.y + 0.2; d1.vx = d1.vy = 0; }
    setSt(m, d1, heldW ? 'held' : downW ? 'down' : 'swim');
    if (d1.st === 'held') d1.o2 = Math.max(1, d1.o2 - VS.TUNING.shark.holdDrain * dt);
    if (d1.st === 'down') d1.o2 = 0; else if (d1.st === 'swim' && F.lastSt[1] === 'down') { d1.o2 = TD.reviveO2; ev(m, 'revive', { id: 1, by: 2 }); }
    if (F.lastSt[1] === 'swim' && d1.st === 'held') { ev(m, 'bite', { by: 4, target: 1 }); d1.o2 = Math.max(1, d1.o2 - VS.SHARKS[s4.defId].bite); }
    if (d1.st === 'down' && F.lastSt[1] !== 'down') { ev(m, 'down', { id: 1 }); d1.stats.downs++; }
    setSt(m, s4, lungeW ? 'lunge' : heldW ? 'hold' : inWin(c, 34, 40) ? 'out' : 'swim');
    s4.holdId = heldW ? 1 : null;
    if (s4.st === 'out' && F.lastSt[4] !== 'out') ev(m, 'out', { id: 4 });

    // Lan (2): mang hai món, bơi xuống khoang cứu hộ nộp lúc 18 giây; tăng tốc 3–6 giây
    var pod = m.pods[0] || { x: d2.x, y: d2.y };
    if (!F.pins[2] && inWin(c, 15, 19.5)) {
      var kb = smooth(15, 17.6, c) * (1 - smooth(19, 19.5, c));
      d2.x += (pod.x + 0.6 - d2.x) * kb; d2.y += (pod.y + 1.4 - d2.y) * kb;
    }
    d2.intent.boost = inWin(c, 3, 6);
    if (d2.intent.boost) { d2.vx *= 1.6; d2.vy *= 1.6; }
    if (c >= 18 && m.loot[0].st === 'carried') {
      var val = m.loot[0].value + m.loot[1].value;
      m.loot[0].st = m.loot[1].st = 'banked';
      m.score.banked += val; d2.stats.banked += val;
      ev(m, 'bank', { id: 2, value: val, x: pod.x, y: pod.y + 0.6 });
    }
    d2.carry = m.loot.filter(function (l) { return l.st === 'carried' && l.by === 2; }).map(function (l) { return l.id; });
    d2.carryKg = d2.carry.reduce(function (s, id) { return s + m.loot[id].kg; }, 0);

    // Bảo (3): tắt đèn 5–9 giây, dùng rương O₂ lúc 13 giây, bị loại 30–37 giây
    d3.light = !inWin(c, 5, 9);
    var outW = inWin(c, 30, 37);
    setSt(m, d3, outW ? 'out' : 'swim');
    if (d3.st === 'out' && F.lastSt[3] !== 'out') { ev(m, 'out', { id: 3 }); m.tickets = Math.max(0, m.tickets - 1); d3.stats.outs++; }
    if (d3.st === 'swim' && F.lastSt[3] === 'out') ev(m, 'respawn', { id: 3 });
    if (c >= 13 && c - dt < 13 && m.o2[3]) { m.o2[3].readyAt = m.t + VS.TUNING.o2box.cooldown; ev(m, 'o2', { id: 3, x: m.o2[3].x, y: m.o2[3].y }); }

    // Đầu Búa (5): tăng tốc 12–15, choáng 16–17,4, ngủ (hiệu ứng) 26–29, vồ 22–22,35
    s5.intent.boost = inWin(c, 12, 15);
    if (s5.intent.boost && !F.pins[5]) { s5.vx *= 1.8; s5.vy *= 1.8; }
    setSt(m, s5, inWin(c, 16, 17.4) ? 'stun' : inWin(c, 22, 22.35) ? 'lunge' : 'swim');
    // hiệu ứng theo kịch bản (mọi kind của bảng hiệu ứng README mà lớp vẽ có nét riêng) + hiệu ứng phòng thử chèn thêm (F.extraEff)
    var EFF = [[5, 1, 8, 'armor', 0.4], [4, 21, 27, 'slow', 0.6], [4, 21, 27, 'noDash', 1], [4, 28, 34, 'stealth', 3], [5, 12, 20, 'reveal', 1], [5, 16, 17.4, 'stun', 1],
      [5, 26, 29, 'sleep', 1], [1, 12, 18, 'bleed', 4], [0, 14, 18, 'lightOff', 1], [2, 36, 38, 'stun', 1], [3, 1, 4, 'slow', 0.3], [5, 3, 9, 'shrink', 0.55]];
    A.forEach(function (a) { a.effects = []; });
    EFF.forEach(function (e) { if (!F.quiet && inWin(c, e[1], e[2])) A[e[0]].effects.push({ kind: e[3], until: m.t + (e[2] - c), mag: e[4], src: 0 }); });
    Object.keys(F.extraEff).forEach(function (id) { F.extraEff[id] = F.extraEff[id].filter(function (e) { return e.until > m.t; }); F.extraEff[id].forEach(function (e) { A[id].effects.push(e); }); });
    // nét kỹ năng theo kịch bản: sự kiện 'skill' đúng một lần mỗi vòng (cá mập ở chỗ đang bơi)
    [[3.0, 4, 'quat-duoi'], [14.5, 4, 'cua-xe'], [22.5, 5, 'cam-dien']].forEach(function (k) {
      var key = k[2];
      if (!F.quiet && c >= k[0] && c < k[0] + 0.5 && !F.skillFired[key]) { F.skillFired[key] = true; ev(m, 'skill', { id: k[1], skill: k[2] }); }
      if (c < k[0] || c > k[0] + 1) delete F.skillFired[key];
    });
    [s4, s5].forEach(function (s) {
      var sp = Math.hypot(s.vx, s.vy), mx = VS.TUNING.shark.staminaMax;
      s.stamina = Math.max(0, Math.min(mx, s.stamina + (s.intent.boost ? -VS.TUNING.shark.staminaUse : VS.TUNING.shark.staminaRegen) * dt));
      if (s.st === 'hold') { s.vx = s.vy = 0; s.ang = 0; s.face = 1; }
      if (sp > 0.3 && s.st !== 'hold') s.ang = Math.atan2(s.vy, s.vx);
      if (Math.abs(s.vx) > 0.25) s.face = s.vx > 0 ? 1 : -1;
      s.intent.mx = Math.sign(s.vx); s.intent.my = Math.sign(s.vy);
    });

    // hướng mặt, góc ngắm, đèn của thợ lặn; người chơi (0) ngắm Đầu Búa khi ở gần, không thì nhìn trước mặt
    [d0, d1, d2, d3].forEach(function (d, i) {
      if (F.pins[d.id] && F.pins[d.id].face) d.face = F.pins[d.id].face;
      else if (Math.abs(d.vx) > 0.2) d.face = d.vx > 0 ? 1 : -1;
      var tgt = i === 0 && Math.hypot(s5.x - d.x, s5.y - d.y) < 14 && s5.st !== 'out' ? s5 : null;
      if (F.pins[d.id] && F.pins[d.id].aim != null) {
        d.intent.aimX = d.x + Math.cos(F.pins[d.id].aim) * 6; d.intent.aimY = d.y + Math.sin(F.pins[d.id].aim) * 6;
      } else if (tgt) { d.intent.aimX = tgt.x; d.intent.aimY = tgt.y; }
      else {
        var sp = Math.hypot(d.vx, d.vy) || 1;
        d.intent.aimX = d.x + (sp > 0.3 ? d.vx / sp : d.face) * 6; d.intent.aimY = d.y + (sp > 0.3 ? d.vy / sp : -0.15) * 6;
      }
      d.ang = Math.atan2(d.intent.aimY - d.y, d.intent.aimX - d.x);
      d.intent.mx = Math.sign(d.vx); d.intent.my = Math.sign(d.vy);
      if (d.st === 'swim' && d.id !== 1) d.o2 = Math.max(10, d.o2 - VS.TUNING.diver.o2Drain * dt);
      var sd = VS.SKILL_DATA[d.skill.id] || { cd: 1 };
      d.skill.cd = Math.max(0, sd.cd - ((c + i * 7) % (sd.cd + 3)));
    });
    var sd4 = VS.SKILL_DATA[s4.skill.id] || { cd: 1 }, sd5 = VS.SKILL_DATA[s5.skill.id] || { cd: 1 };
    s4.skill.cd = Math.max(0, sd4.cd - (c % (sd4.cd + 3))); s5.skill.cd = Math.max(0, sd5.cd - ((c + 5) % (sd5.cd + 3)));
    if (s5.skill.id === VS.SHARKS[s5.defId].skill) s5.skill.t = inWin(c, 12, 15) ? 15 - c : 0;   // phòng thử đổi kỹ năng (lab.cast) thì không đè

    // --- mũi xiên: người chơi bắn mỗi 6 giây, Bảo bắn phi tiêu lúc 12, Lan bắn lưới lúc 21 ---
    var shots = F.quiet ? [] : [[0, 2, 'harpoon'], [0, 8, 'harpoon'], [0, 14, 'harpoon'], [0, 20, 'harpoon'], [0, 26, 'harpoon'], [0, 32, 'harpoon'], [0, 38, 'harpoon'],
      [3, 12, 'dart'], [2, 21, 'net'], [2, 5, 'snipe'], [5, 31, 'jaw']];
    d0.intent.fireHeld = shots.some(function (s) { return s[0] === 0 && c >= s[1] - 0.5 && c < s[1] + 0.3; });
    shots.forEach(function (s) {
      var key = s[0] + '@' + s[1], who = A[s[0]];
      if (c >= s[1] && c < s[1] + 0.6 && !F.fired[key] && who.st === 'swim') {
        F.fired[key] = true;
        var ang = who.team === 'shark' ? who.ang : Math.atan2(who.intent.aimY - who.y, who.intent.aimX - who.x), sp = s[2] === 'net' ? 12 : s[2] === 'jaw' ? 14 : VS.TUNING.diver.harpoonSpeed;
        var range = s[2] === 'net' ? 10 : s[2] === 'jaw' ? 9 : VS.TUNING.diver.harpoonRange;
        m.projs.push({ id: F.nextProj++, owner: who.id, team: who.team, kind: s[2], x: who.x + Math.cos(ang) * 0.8, y: who.y + 0.1 + Math.sin(ang) * 0.8,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: range / sp, dmg: VS.DIVERS[who.defId].dmg, fx: null });
        ev(m, 'fire', { owner: who.id });
      }
      if (c < s[1] || c > s[1] + 1) delete F.fired[key];
    });
    for (var i = m.projs.length - 1; i >= 0; i--) {
      var p = m.projs[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      var hit = null;
      if (p.team === 'diver') [s4, s5].forEach(function (s) { if (s.st !== 'out' && Math.hypot(s.x - p.x, s.y - p.y) < s.r + 0.3) hit = s; });
      if (hit || p.life <= 0 || solidIn(F.walls, p.x, p.y)) {
        if (hit) { hit.hp = Math.max(1, hit.hp - p.dmg); ev(m, 'hit', { by: p.owner, target: hit.id, x: p.x, y: p.y, dmg: p.dmg }); }
        else ev(m, 'miss', { owner: p.owner, x: p.x, y: p.y });
        m.projs.splice(i, 1);
      }
    }

    // --- vùng kỹ năng ---
    var Z = [];
    if (!F.quiet) {
    if (inWin(c, 5, 13)) Z.push({ id: 'flare', kind: 'flare', x: -30, y: 3, r: VS.SKILL_DATA['phao-sang'].r, until: m.t + 13 - c, team: 'diver' });
    if (inWin(c, 20, 26)) Z.push({ id: 'ink', kind: 'ink', x: -40, y: 3, r: VS.SKILL_DATA['bom-muc'].r, until: m.t + 26 - c, team: 'diver' });
    if (inWin(c, 26, 32)) Z.push({ id: 'cage', kind: 'cage', x: -22, y: 6, r: VS.SKILL_DATA['long-thep'].r, until: m.t + 32 - c, team: 'diver' });
    if (inWin(c, 12, 20)) Z.push({ id: 'o2gen', kind: 'o2gen', x: -26, y: 12, r: VS.SKILL_DATA['may-o2'].r, until: m.t + 20 - c, team: 'diver' });
    Z.push({ id: 'mine', kind: 'mine', x: -14, y: 4, r: VS.SKILL_DATA['min-cam-bien'].r, until: m.t + 99, team: 'diver' });
    if (inWin(c, 3, 11)) Z.push({ id: 'bait', kind: 'bait', x: -22, y: 12, r: VS.SKILL_DATA['lua-bay'].r, until: m.t + 11 - c, team: 'shark' });
    }
    m.zones = Z.concat(F.extraZones.filter(function (z) { return z.until > m.t; }));

    A.forEach(function (a) { F.lastSt[a.id] = a.st; });
    updateKnown(m);
    return m;
  }

  // Trí nhớ kho báu của từng đội: món đang nằm (rest) lọt vào vùng thấy được thì nhớ mãi.
  function updateKnown(m) {
    var K = m.fake.known;
    ['diver', 'shark'].forEach(function (team) {
      var polys = visionPolys(m, team);
      m.loot.forEach(function (l) {
        if (l.st !== 'rest' || K[team][l.id]) return;
        for (var i = 0; i < polys.length; i++) if (insideFan(polys[i].pts, l.x, l.y)) { K[team][l.id] = 1; return; }
      });
    });
  }
  function known(m, team) {
    var K = m.fake && m.fake.known && m.fake.known[team] || {};
    return m.loot.filter(function (l) { return K[l.id] && l.st !== 'banked'; });
  }

  // ---------- lưới phòng thử: 12 loài cá mập / 10 thợ lặn ----------
  function sharkGrid(seed) {
    var m = baseMatch(seed == null ? 7 : seed, 'A01'), ids = Object.keys(VS.SHARKS), cols = 4;
    ids.forEach(function (id, i) {
      var a = shark(i, id, VS.SHARKS[id].name, 'bot');
      a.cell = { x: -39.5 + (i % cols) * 9, y: 13.5 - Math.floor(i / cols) * 5.6 };
      m.actors.push(a);
    });
    m.fake.grid = 'sharks'; m.labFocus = { x: -26, y: 8 }; m.labDist = 26;
    m.loot = []; m.score.target = 1;
    gridStep(m, 0);
    return m;
  }
  // 10 thợ lặn + 1 Dave đối chứng (cùng bảng màu với người đầu) để bài kiểm đo được độ nhiễu của màu trung bình.
  function diverGrid(seed) {
    var m = baseMatch(seed == null ? 7 : seed, 'A01'), ids = Object.keys(VS.DIVERS).concat(['dave']), cols = 6;
    ids.forEach(function (id, i) {
      var a = diver(i, id, i === ids.length - 1 ? 'Đối chứng' : VS.DIVERS[id].name, 'bot');
      a.x = -32 + (i % cols) * 2.4; a.y = 10.3 - Math.floor(i / cols) * 2.6; a.light = false;
      a.intent.aimX = a.x + 5; a.intent.aimY = a.y;
      m.actors.push(a);
    });
    m.fake.grid = 'divers'; m.labFocus = { x: -26, y: 9 }; m.labDist = 10.5;
    m.loot = []; m.score.target = 1;
    return m;
  }
  // Mỗi loài lệch pha 1,3 giây: bơi → bơi nhanh (sprint) → lao cắn (attack) → chết (die) → bơi.
  var GRID_ST = [[0, 4, 'swim'], [4, 7, 'sprint'], [7, 8.4, 'lunge'], [8.4, 12.4, 'out'], [12.4, 14, 'swim']];
  function gridStep(m, dt) {
    m.t += dt;
    if (m.fake.grid !== 'sharks') {
      m.actors.forEach(function (a) { var pn = m.fake.pins[a.id]; if (pn) { a.x = pn.x; a.y = pn.y; a.vx = a.vy = 0; } });
      return m;
    }
    m.actors.forEach(function (a, i) {
      if (m.fake.pins[a.id]) { var pn = m.fake.pins[a.id]; a.x = pn.x; a.y = pn.y; a.vx = a.vy = 0; return; }
      var t = m.t + i * 1.3, ph = t % 14, st = 'swim';
      GRID_ST.forEach(function (g) { if (ph >= g[0] && ph < g[1]) st = g[2]; });
      var fast = st === 'sprint', w = 0.45;
      a.x = a.cell.x + Math.sin(t * w + i) * 1.2; a.y = a.cell.y + Math.sin(t * w * 2 + i) * 0.25;
      a.vx = Math.cos(t * w + i) * 1.2 * w * (fast ? 6 : 3); a.vy = Math.cos(t * w * 2 + i) * 0.5 * w;
      a.intent.boost = fast;
      if (st === 'out') { a.vx = a.vy = 0; }
      if (Math.abs(a.vx) > 0.15) a.face = a.vx > 0 ? 1 : -1;
      // phóng: nhanh hơn hẳn tốc độ bơi của loài để lớp vẽ chọn clip sprint
      if (fast) a.vx = a.face * Math.max(Math.abs(a.vx), VS.SHARKS[a.defId].speed * 1.4);
      a.ang = Math.atan2(a.vy, a.vx);
      setSt(m, a, st === 'sprint' ? 'swim' : st);
      a.stT += dt;
    });
    return m;
  }

  // ---------- tầm nhìn thay thế: quạt tia từ nguồn sáng, che khuất bởi vách nếu m.fake.occlude ----------
  // Nguồn nằm trong đá (khoang, rương đặt sát vách) thì không che, khỏi thành quạt rỗng.
  var OCC = null;
  function fanFrom(x, y, a0, a1, r, n) {
    var pts = [x, y], segs = OCC && !solidIn(OCC.walls, x, y) ? nearSegs(OCC.seg, x, y, r) : null;
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * i / n, dx = Math.cos(a), dy = Math.sin(a), t = segs ? cast(segs, x, y, dx, dy, r) : r;
      pts.push(x + dx * t, y + dy * t);
    }
    return pts;
  }
  function fanCone(x, y, ang, half, r, n) { return fanFrom(x, y, ang - half, ang + half, r, n); }
  function fanCircle(x, y, r, n) { return fanFrom(x, y, 0, TAU, r, n); }
  function aimOf(a) {
    var it = a.intent;
    return it && it.aimX != null && (it.aimX !== a.x || it.aimY !== a.y) ? Math.atan2(it.aimY - a.y, it.aimX - a.x) : (a.ang || 0);
  }
  function visionPolys(m, team) {
    var V = VS.TUNING.vision, out = [], F = m.fake;
    if (F && F.occlude) { F.seg = F.seg || segGrid(F.walls); OCC = F; } else OCC = null;
    if (team === 'diver') {
      m.actors.forEach(function (a) {
        if (a.team !== 'diver' || a.st === 'out') return;
        out.push({ kind: 'glow', x: a.x, y: a.y, r: V.selfGlow, pts: fanCircle(a.x, a.y, V.selfGlow, 20) });
        if (a.light && (a.st === 'swim' || a.st === 'held')) {
          out.push({ kind: 'beam', x: a.x, y: a.y, r: V.beamRange, pts: fanCone(a.x, a.y, aimOf(a), V.beamAngle * Math.PI / 360, V.beamRange, V.beamRays || 24) });
        }
      });
      (m.pods || []).forEach(function (p) { out.push({ kind: 'pod', x: p.x, y: p.y, r: V.podGlow, pts: fanCircle(p.x, p.y, V.podGlow, 24) }); });
      (m.o2 || []).forEach(function (b) { out.push({ kind: 'o2', x: b.x, y: b.y, r: V.o2Glow, pts: fanCircle(b.x, b.y, V.o2Glow, 16) }); });
      (m.zones || []).forEach(function (z) { if (z.kind === 'flare') out.push({ kind: 'flare', x: z.x, y: z.y, r: z.r, pts: fanCircle(z.x, z.y, z.r, 28) }); });
    } else {
      m.actors.forEach(function (a) {
        if (a.team !== 'shark' || a.st === 'out') return;
        out.push({ kind: 'sense', x: a.x, y: a.y, r: V.sharkSense, pts: fanCircle(a.x, a.y, V.sharkSense, 28) });
      });
    }
    return out;
  }
  function insideFan(pts, x, y) {
    var c = false, n = pts.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c;
    }
    return c;
  }
  function canSee(m, team, a) {
    if (a.team === team) return true;
    if (a.st === 'out') return false;
    var V = VS.TUNING.vision;
    if (team === 'diver') {
      // Ẩn Đáy: đối phương chỉ thấy khi thợ lặn đứng trong mag mét
      var sth = (a.effects || []).filter(function (e) { return e.kind === 'stealth' && e.until > m.t; })[0];
      if (sth && !m.actors.some(function (d) { return d.team === 'diver' && d.st !== 'out' && Math.hypot(d.x - a.x, d.y - a.y) <= sth.mag; })) return false;
      var polys = visionPolys(m, team), r = (a.r || 0.5) * 0.6;
      for (var i = 0; i < polys.length; i++) {
        for (var k = 0; k < 5; k++) {
          var px = a.x + (k ? Math.cos(k * TAU / 4) * r : 0), py = a.y + (k ? Math.sin(k * TAU / 4) * r : 0);
          if (insideFan(polys[i].pts, px, py)) return true;
        }
      }
      return false;
    }
    return m.actors.some(function (s) {
      if (s.team !== 'shark' || s.st === 'out') return false;
      var d = Math.hypot(s.x - a.x, s.y - a.y);
      return d < V.sharkSense || (a.light && d < V.beacon) || (a.o2Max && a.o2 / a.o2Max < V.bloodPct && d < V.bloodRange);
    });
  }

  VS.sim = VS.sim || {};
  if (!VS.sim.visionPolys) VS.sim.visionPolys = visionPolys;
  if (!VS.sim.canSee) VS.sim.canSee = canSee;
  if (!VS.sim.known) VS.sim.known = known;

  function F_NEXT(m) { return m.fake.nextProj++; }

  VS.fakeMatch = {
    create: create, step: step, sharkGrid: sharkGrid, diverGrid: diverGrid,
    visionPolys: visionPolys, canSee: canSee, known: known, insideFan: insideFan, CYCLE: CYCLE,
    // chèn thêm cho phòng thử: hiệu ứng actor, zone, đạn (chỉ cần hình dạng như sim thật)
    addEffect: function (m, id, kind, dur, mag) { (m.fake.extraEff[id] = m.fake.extraEff[id] || []).push({ kind: kind, until: m.t + dur, mag: mag == null ? 1 : mag, src: -1 }); step(m, 0); },
    addZone: function (m, z) { z.until = z.until || m.t + (z.dur || 8); z.id = z.id || 'x' + m.fake.extraZones.length; m.fake.extraZones.push(z); step(m, 0); },
    // yên: tắt kịch bản hiệu ứng, vùng, đạn, sự kiện kỹ năng; chỉ còn những gì phòng thử chèn (bài kiểm vẽ kỹ năng đo từng thứ một)
    quiet: function (m, on) { m.fake.quiet = on !== false; m.projs.length = 0; step(m, 0); },
    reset: function (m) { m.fake.extraEff = {}; m.fake.extraZones = []; m.projs.length = 0; step(m, 0); },
    addProj: function (m, p) { p.id = p.id || F_NEXT(m); m.projs.push(p); return p; },
    solid: function (m, x, y) { return solidIn(m.fake.walls, x, y); },
    open: function (m, x, y, r) { return openIn(m.fake.walls, x, y, r || 0.5); },
  };
})(window.VS = window.VS || {});
