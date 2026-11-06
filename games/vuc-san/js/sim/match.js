// Mô phỏng: trận đấu. Tạo trận (điểm sinh, kho báu), vòng pha intro -> play -> end, vùng (zone), điều kiện thắng.
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var geom = VS.geom;
  var K = sim.K;
  var EPS = 1e-6;

  // art = tên tệp (bỏ đuôi .png) trong games/biet-doi-lan/art/dtd/loot/, xếp theo bậc giá trị của TUNING.loot.tiers.
  var LOOT_ART = [
    ['extrasmall_gold', 'Small_gold_Thumbnail', 'Item_Pearl', 'Materials_Amethyst', 'Materials_Aquamarine', 'Materials_Topaz', 'Materials_Copper', 'Materials_Iron', 'Item_Flask'],
    ['Materials_Diamond', 'Materials_Ruby', 'Materials_Opal', 'Item_GoldCup', 'Item_Skull', 'Item_Bone', 'Item_MermanCuju', 'Item_Mike', 'Drone_Chip', 'Drone_Lens', 'Drone_Motor', 'Bacon_Relic'],
    ['Item_GoldFishStatue', 'Item_JadeFishStatue', 'Item_StoneArtifacts', 'Item_StonePlate_WeddingSong', 'Item_Maki_Tablet', 'Item_Pinkbox_Thumbnail', 'Crates01', 'Crates02']
  ];

  function findMap(id) {
    var list = VS.MAPS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function dist2(ax, ay, bx, by) { return (ax - bx) * (ax - bx) + (ay - by) * (ay - by); }

  // ---- Điểm sinh ----
  // Chỗ thả thợ lặn: quanh zone.start (đã kéo xuống dưới mặt nước), nếu bản đồ không có start thì điểm thoáng cao nhất trong 20 m kể từ mép trái.
  function diverAnchor(world, grid, zone) {
    var top = K.surfaceY - 1.5, b = world.bounds, p = null;
    if (zone.start) {
      p = geom.findOpen(world, zone.start[0], Math.min(zone.start[1], top), K.spawnClear, { maxY: top });
      if (p && grid.at(p.x, p.y) !== grid.main) p = null;
    }
    if (!p) {
      var iyTop = Math.min(grid.ny - 1, Math.floor((top - grid.minY) / grid.cell));
      scan:
      for (var iy = iyTop; iy >= 0; iy--) {
        for (var ix = 0; ix < grid.nx; ix++) {
          var x = grid.minX + (ix + 0.5) * grid.cell, y = grid.minY + (iy + 0.5) * grid.cell;
          if (x > b.minX + 20) break;
          if (grid.comp[iy * grid.nx + ix] === grid.main && world.open(x, y, K.spawnClear)) { p = { x: x, y: y }; break scan; }
        }
      }
    }
    return p || { x: (b.minX + b.maxX) / 2, y: top };
  }

  function placeDivers(world, grid, anchor, n) {
    var pts = [[anchor.x, anchor.y]], top = K.surfaceY - 1.5, sp = K.diverSpacing;
    for (var rad = sp; pts.length < n && rad < 30; rad += 0.5) {
      var cnt = Math.max(8, Math.ceil(2 * Math.PI * rad / 0.5));
      for (var k = 0; k < cnt && pts.length < n; k++) {
        var a = 2 * Math.PI * k / cnt, x = anchor.x + Math.cos(a) * rad, y = anchor.y + Math.sin(a) * rad, ok = true;
        if (y > top || !world.open(x, y, K.spawnClear) || grid.at(x, y) !== grid.main) continue;
        for (var j = 0; j < pts.length; j++) if (dist2(pts[j][0], pts[j][1], x, y) < sp * sp - 1e-9) { ok = false; break; }
        if (ok) pts.push([x, y]);
      }
    }
    while (pts.length < n) pts.push([anchor.x, anchor.y]);
    return pts;
  }

  // Ứng viên không phụ thuộc hạt giống nên tính một lần cho mỗi (bản đồ, chỗ thả) và dùng lại giữa các trận.
  function cached(world, key, build) {
    var c = world.reachCache[key];
    if (!c) c = world.reachCache[key] = build();
    return c;
  }

  // Điểm sinh cá mập không được nằm trong vùng an toàn quanh khoang cứu hộ (cộng 2 m để mới sinh khỏi bị đẩy ngay).
  function inPodSafe(pods, x, y) {
    var R = VS.TUNING.pod.safeR + 2;
    for (var i = 0; i < pods.length; i++) if (dist2(x, y, pods[i].x, pods[i].y) < R * R) return true;
    return false;
  }

  function sharkCandidates(world, grid, anchor, pods) {
    return cached(world, 'shk:' + anchor.x + ',' + anchor.y, function () {
      var b = world.bounds, minD = K.sharkFar * (b.maxX - b.minX), out = [];
      for (var tries = 0; tries < 4 && out.length < 8; tries++, minD *= 0.6) {
        out.length = 0;
        for (var iy = 0; iy < grid.ny; iy += 2) for (var ix = 0; ix < grid.nx; ix += 2) {
          var i = iy * grid.nx + ix;
          if (grid.comp[i] !== grid.main) continue;
          var x = grid.cx(i), y = grid.cy(i);
          if (dist2(x, y, anchor.x, anchor.y) < minD * minD || inPodSafe(pods, x, y) || !world.open(x, y, K.sharkClear)) continue;
          out.push([x, y]);
        }
      }
      out.sort(function (p, q) { return p[1] - q[1] || p[0] - q[0]; });   // sâu (y thấp) trước
      return out;
    });
  }

  // Cá mập sinh sâu, xa chỗ thả thợ lặn, hai con cách nhau xa; chọn ngẫu nhiên từ m.rng trong 30% sâu nhất.
  // mapDef.sharks (từ tools/mapgen.js) là danh sách ứng viên đã xếp sâu trước; thiếu thì tự tìm trên lưới.
  function placeSharks(m, world, grid, anchor, n, listed) {
    var cand = listed || sharkCandidates(world, grid, anchor, m.pods), out = [], i, j;
    if (!cand.length) { for (i = 0; i < n; i++) out.push([anchor.x, anchor.y]); return out; }
    var pool = cand.slice(0, Math.max(8, Math.ceil(cand.length * 0.3)));
    out.push(m.rng.pick(pool));
    for (i = 1; i < n; i++) {
      var far = pool.filter(function (p) {
        for (j = 0; j < out.length; j++) if (dist2(p[0], p[1], out[j][0], out[j][1]) < 20 * 20) return false;
        return true;
      });
      out.push(m.rng.pick(far.length ? far : pool));
    }
    return out.map(function (p) { return [p[0], p[1]]; });
  }

  // ---- Kho báu ----
  function lootCandidates(world, grid, anchor, divers) {
    return cached(world, 'loot:' + anchor.x + ',' + anchor.y, function () {
      var out = [], far2 = K.lootFromSpawn * K.lootFromSpawn;
      for (var iy = 0; iy < grid.ny; iy += 2) for (var ix = 0; ix < grid.nx; ix += 2) {
        var i = iy * grid.nx + ix;
        if (grid.comp[i] !== grid.main) continue;
        var x = grid.cx(i), y = grid.cy(i), ok = true;
        for (var j = 0; j < divers.length; j++) if (dist2(x, y, divers[j][0], divers[j][1]) < far2) { ok = false; break; }
        if (ok && world.open(x, y, 0.8)) out.push([x, y]);
      }
      return out;
    });
  }

  // Chọn count điểm cách nhau >= spacing; thiếu chỗ thì nới dần khoảng cách để trận vẫn đủ món.
  function spreadPicks(cands, count, spacing) {
    var picked = [];
    for (var i = 0; i < cands.length && picked.length < count; i++) {
      var c = cands[i], ok = true;
      for (var j = 0; j < picked.length; j++) if (dist2(c[0], c[1], picked[j][0], picked[j][1]) < spacing * spacing) { ok = false; break; }
      if (ok) picked.push(c);
    }
    return picked;
  }

  function makeLoot(m, world, grid, anchor, mapDef) {
    var T = VS.TUNING.loot, count = T.count[m.zone.area] || T.count.A, rng = m.rng, spots, i;
    if (mapDef && mapDef.lootSpots && mapDef.lootSpots.length >= count) spots = rng.shuffle(mapDef.lootSpots.slice()).slice(0, count);
    else {
      var cands = rng.shuffle(lootCandidates(world, grid, anchor, m.spawns.diver).slice());
      for (var sp = K.lootSpacing; sp >= 0; sp -= 1.5) { spots = spreadPicks(cands, count, sp); if (spots.length >= count) break; }
    }
    var wsum = 0;
    for (i = 0; i < T.tiers.length; i++) wsum += T.tiers[i].w;
    for (i = 0; i < spots.length; i++) {
      var u = rng() * wsum, tier = 0, acc = T.tiers[0].w;
      while (u >= acc && tier < T.tiers.length - 1) acc += T.tiers[++tier].w;
      var td = T.tiers[tier], arts = LOOT_ART[Math.min(tier, LOOT_ART.length - 1)];
      m.loot.push({
        id: i, x: spots[i][0], y: spots[i][1], art: rng.pick(arts), st: 'rest', by: -1,
        value: rng.int(Math.ceil(td.value[0] / 5), Math.floor(td.value[1] / 5)) * 5, kg: rng.int(td.kg[0], td.kg[1])
      });
    }
  }

  function defaultLineup(seed) {
    var T = VS.TUNING.match, r = VS.rng((seed ^ 0x5bd1e995) >>> 0), out = [], i;
    var dIds = Object.keys(VS.DIVERS), sIds = Object.keys(VS.SHARKS);
    for (i = 0; i < T.divers; i++) out.push({ team: 'diver', defId: r.pick(dIds), name: 'Thợ lặn ' + (i + 1), ctrl: 'bot' });
    for (i = 0; i < T.sharks; i++) out.push({ team: 'shark', defId: r.pick(sIds), name: 'Cá mập ' + (i + 1), ctrl: 'bot' });
    return out;
  }

  // ---- Tạo trận ----
  sim.createMatch = function (cfg) {
    var T = VS.TUNING, seed = (cfg.seed == null ? 1 : cfg.seed) >>> 0, mapId = cfg.mapId || 'A01';
    var zone = window.HX_ZONES && window.HX_ZONES[mapId];
    if (!zone) throw new Error('bản đồ "' + mapId + '" không có trong HX_ZONES');
    var mapDef = findMap(mapId), world = geom.worldFor(zone), grid = geom.reachGrid(world, K.navClear, K.navCell), i;
    var m = {
      seed: seed, rng: VS.rng(seed), mapId: mapId, zone: zone, theme: cfg.theme || (mapDef && mapDef.theme) || 'day',
      t: 0, tick: 0, phase: 'intro', phaseT: 0, actors: [], loot: [], pods: [], o2: [], projs: [], zones: [],
      score: { banked: 0, target: 0 }, tickets: T.match.tickets, events: [], result: null,
      spawns: { diver: [], shark: [] }, reveal: null, nextId: 1
    };
    Object.defineProperty(m, 'world', { value: world, enumerable: false });

    for (i = 0; i < zone.pods.length; i++) m.pods.push({ x: zone.pods[i][0], y: zone.pods[i][1], r: T.pod.r });
    for (i = 0; i < zone.o2.length; i++) m.o2.push({ x: zone.o2[i][0], y: zone.o2[i][1], readyAt: 0 });

    var anchor, ownDivers = mapDef && mapDef.divers && mapDef.divers.length >= T.match.divers;
    if (ownDivers) { m.spawns.diver = mapDef.divers.slice(0, T.match.divers).map(function (p) { return [p[0], p[1]]; }); anchor = { x: m.spawns.diver[0][0], y: m.spawns.diver[0][1] }; }
    else { anchor = diverAnchor(world, grid, zone); m.spawns.diver = placeDivers(world, grid, anchor, T.match.divers); }
    m.spawns.shark = placeSharks(m, world, grid, anchor, T.match.sharks, mapDef && mapDef.sharks && mapDef.sharks.length >= T.match.sharks ? mapDef.sharks : null);
    makeLoot(m, world, grid, anchor, mapDef);

    var lineup = cfg.lineup && cfg.lineup.length ? cfg.lineup : defaultLineup(seed), nd = 0, ns = 0;
    for (i = 0; i < lineup.length; i++) {
      var ent = lineup[i], isDiver = ent.team === 'diver', idx = isDiver ? nd++ : ns++;
      var sp = (isDiver ? m.spawns.diver : m.spawns.shark)[idx] || (isDiver ? m.spawns.diver : m.spawns.shark)[0];
      var a = sim.makeActor(m, i, ent, sp, idx);
      if (!isDiver) {
        a.ang = Math.atan2(anchor.y - a.y, anchor.x - a.x); a.face = Math.cos(a.ang) >= 0 ? 1 : -1;
        a.intent.aimX = a.x + Math.cos(a.ang); a.intent.aimY = a.y + Math.sin(a.ang);
      }
      m.actors.push(a);
      sim.spawnProtect(m, a);
    }

    var total = 0;
    for (i = 0; i < m.loot.length; i++) total += m.loot[i].value;
    m.score.target = Math.round(T.match.targetPct * total);
    sim.initVision(m);
    sim.emit(m, 'phase', { phase: 'intro' });
    return m;
  };

  // ---- Việc dùng chung cho kỹ năng ----
  sim.raycast = function (m, x0, y0, x1, y1) { return m.world.raycast(x0, y0, x1, y1); };

  // Vùng tròn trong trận. until (thời điểm hết) hoặc dur (thời lượng); không có cả hai thì tồn tại mãi.
  sim.addZone = function (m, z) {
    z.id = m.nextId++;
    if (z.until == null) z.until = z.dur != null ? m.t + z.dur : Infinity;
    m.zones.push(z);
    return z;
  };

  function stepZones(m, dt) {
    var list = m.zones, keep = 0;
    for (var i = 0; i < list.length; i++) {
      var z = list[i];
      if (z.onTick && z.until > m.t) z.onTick(m, z, dt);
      if (z.until <= m.t) { if (z.onExpire) z.onExpire(m, z); continue; }
      list[keep++] = z;
    }
    list.length = keep;
  }

  // ---- Kết thúc ----
  function finish(m, winner, reason) {
    m.phase = 'end'; m.phaseT = 0;
    m.result = { winner: winner, reason: reason };
    sim.emit(m, 'end', { winner: winner, reason: reason });
    sim.emit(m, 'phase', { phase: 'end' });
  }

  function checkEnd(m) {
    if (m.score.banked >= m.score.target) return finish(m, 'diver', 'target');
    if (m.t >= VS.TUNING.match.length - EPS) return finish(m, 'shark', 'time');
    if (m.tickets <= 0) {
      for (var i = 0; i < m.actors.length; i++) if (m.actors[i].team === 'diver' && m.actors[i].st !== 'out') return;
      finish(m, 'shark', 'wipe');
    }
  }

  // Cạnh (fire, skill, light, interact) chỉ đúng một bước: bước nào cũng xoá sau khi dùng, kể cả lúc intro/end.
  function clearEdges(m) {
    for (var i = 0; i < m.actors.length; i++) {
      var it = m.actors[i].intent;
      it.fire = it.skill = it.light = it.interact = false;
    }
  }

  sim.step = function (m, dt) {
    var i, bots = VS.bots;
    m.tick++;
    if (m.phase === 'end') { m.phaseT += dt; clearEdges(m); return m; }
    if (m.phase === 'intro') {
      m.phaseT += dt; clearEdges(m);
      if (m.phaseT >= VS.TUNING.match.intro - EPS) { m.phase = 'play'; m.phaseT = 0; sim.emit(m, 'phase', { phase: 'play' }); }
      return m;
    }
    m.t += dt; m.phaseT += dt;
    if (bots && bots.think) for (i = 0; i < m.actors.length; i++) if (m.actors[i].ctrl === 'bot') bots.think(m, m.actors[i], dt);
    for (i = 0; i < m.actors.length; i++) sim.stepActor(m, m.actors[i], dt);
    sim.stepProjs(m, dt);
    stepZones(m, dt);
    sim.updateVision(m);
    clearEdges(m);
    checkEnd(m);
    return m;
  };
})(window.VS = window.VS || {});
