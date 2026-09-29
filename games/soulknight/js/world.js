// Hầm ngục một màn: lưới phòng 5×5, ô gạch, vật cản theo pattern thật, cửa, máy trạng thái phòng.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, T = SK.TILE;
  const VOID = 0, FLOOR = 1, WALL = 2, OBST = 3;
  const W_ = SK.world = { VOID, FLOOR, WALL, OBST };

  // ---------------------------------------------------------------- thư viện vật cản của theme
  const LIB_GUESS = [
    ['wall', /^wall/], ['box', /^box/], ['cask1', /^cask/], ['cask2', /^cask/], ['cask3', /^cask/],
    ['sting', /sting/], ['speed1', /speed_up/], ['speed2', /speed_down/], ['obstacle1', /^obj11/],
    ['obstacle2', /^obj22/], ['sign', /^sign/], ['brazier', /^brazier/], ['box_color', /^box/]
  ];
  function themeLib(th) {
    if (th.lib) return th.lib;
    const lib = {}, used = {};
    for (const [sym, re] of LIB_GUESS) {
      const cand = (th.obstacles || []).filter(p => re.test(p.name));
      if (!cand.length) continue;
      const k = used[re] || 0; used[re] = k + 1;
      lib[sym] = cand[Math.min(k, cand.length - 1)].name;
    }
    SK.warnOnce('lib' + th.bundle, 'theme has no lib, guessed from obstacles: ' + JSON.stringify(lib));
    return lib;
  }
  function prefabFor(th, name) {
    const pf = SK.prefab(name);
    if (pf) return pf;
    const tp = (th.obstacles || []).concat(th.walls || []).find(p => p.name === name);
    if (!tp) return null;
    return [{ n: name, at: [0, 0], col: tp.col }].concat(tp.layers.map((l, i) => ({ n: l.node, at: l.at, f: l.f, o: i })));
  }
  function obstacleKind(parts) {
    const root = parts[0] || {};
    const col = root.col || {};
    const box = col.box && !col.box.trig, circ = col.circle && !col.circle.trig;
    const m = n => SK.prefabMbs(parts, n);
    if (m('ObjectSting')) return { kind: 'sting', solid: false, p: m('ObjectSting') };
    if (m('ObjectSpeedUp')) return { kind: 'pad', solid: false, p: m('ObjectSpeedUp') };
    const bx = m('RGBox') || m('RGTBox');
    if (bx) return { kind: 'box', solid: !!(box || circ), hp: bx.hp || 3, explode: !!m('RGTBox') && /red/.test(root.n || '') };
    return { kind: 'static', solid: !!(box || circ) };
  }

  // ---------------------------------------------------------------- bố cục 5×5
  function layoutPath(n, G) {
    for (let tries = 0; tries < 400; tries++) {
      const start = [SK.randi(0, G - 1), SK.randi(0, G - 1)];
      const path = [start], used = new Set([start + '']);
      const walk = () => {
        if (path.length === n) return true;
        const [x, y] = path[path.length - 1];
        const nb = SK.shuffle([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]);
        for (const c of nb) {
          if (c[0] < 0 || c[1] < 0 || c[0] >= G || c[1] >= G || used.has(c + '')) continue;
          path.push(c); used.add(c + '');
          if (walk()) return true;
          path.pop(); used.delete(c + '');
        }
        return false;
      };
      if (walk()) return path;
    }
    throw new Error('dungeon layout not found for ' + n + ' rooms');
  }

  function patternsFor(level) {
    const P = D.patterns || {};
    const re = new RegExp('^group[01]_level' + (level - 1) + '_');
    return Object.keys(P).filter(k => re.test(k) && P[k].w <= 21 && P[k].h <= 21);
  }

  // ---------------------------------------------------------------- sinh màn
  W_.generate = function (stage) {
    const th = D.themes[stage.theme];
    const cfg = (th.stages && th.stages[stage.label]) || { map_long: 3, roomSpacing: 35 };
    const G = DS.rooms.grid, S = cfg.roomSpacing || 35, pad = 3;
    const types = ['start'].concat(Array(cfg.map_long || 3).fill('battle'), stage.boss ? ['boss'] : [], ['end']);
    const cells = layoutPath(types.length, G);
    const map = {
      theme: stage.theme, th, level: th.level || stage.level, lib: themeLib(th),
      W: G * S + pad * 2, H: G * S + pad * 2, rooms: [], obs: new Map(), doorCells: [],
      tiles: null, deco: null, door: null, art: SK.art.tiles(stage.theme), bg: th.bg || '#12141c'
    };
    if (!th.bg) SK.warnOnce('bg' + stage.theme, 'theme ' + stage.theme + ' has no bg colour');
    const N = map.W * map.H;
    map.tiles = new Uint8Array(N); map.deco = new Uint8Array(N); map.door = new Int16Array(N);

    const pats = patternsFor(map.level);
    const addRoom = (type, gx, gy) => {
      const r = { id: map.rooms.length, type, gx, gy, links: [], doors: [], state: 'idle', wave: -1,
        waves: [], seen: false, visited: false, doorT: 1, pattern: null };
      let w = DS.rooms[type] || 15, h = w;
      if (type === 'battle' && pats.length) {
        const k = SK.pick(pats); r.pattern = D.patterns[k]; r.patternId = k; w = r.pattern.w; h = r.pattern.h;
      } else if (type === 'boss' && D.patterns && D.patterns.r_boss) {
        r.pattern = D.patterns.r_boss; r.patternId = 'r_boss'; w = r.pattern.w; h = r.pattern.h;
      }
      r.w = w; r.h = h;
      r.cx = pad + gx * S + (S >> 1); r.cy = pad + gy * S + (S >> 1);
      r.x0 = r.cx - (w >> 1); r.x1 = r.x0 + w - 1; r.y0 = r.cy - (h >> 1); r.y1 = r.y0 + h - 1;
      map.rooms.push(r);
      return r;
    };
    const path = cells.map((c, i) => addRoom(types[i], c[0], c[1]));
    for (let i = 1; i < path.length; i++) { path[i - 1].links.push(path[i].id); path[i].links.push(path[i - 1].id); }

    // nhánh phụ: phòng rương vũ khí luôn có, phòng đặc biệt thỉnh thoảng
    const occupied = new Set(cells.map(c => c + ''));
    const sides = ['chest'].concat(SK.chance(0.5) ? ['special'] : []);
    for (const type of sides) {
      const hosts = SK.shuffle(path.filter(r => r.type === 'battle' || r.type === 'start'));
      let placed = false;
      for (const host of hosts) {
        const nb = SK.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]).map(d => [host.gx + d[0], host.gy + d[1]])
          .filter(c => c[0] >= 0 && c[1] >= 0 && c[0] < G && c[1] < G && !occupied.has(c + ''));
        if (!nb.length) continue;
        const r = addRoom(type, nb[0][0], nb[0][1]);
        occupied.add(nb[0] + '');
        r.links.push(host.id); host.links.push(r.id);
        placed = true; break;
      }
      if (!placed) SK.warnOnce('side' + type, 'no free cell for side room ' + type);
    }

    for (const r of map.rooms) carveRoom(map, r);
    const done = new Set();
    for (const r of map.rooms) for (const l of r.links) {
      const k = Math.min(r.id, l) + '-' + Math.max(r.id, l);
      if (done.has(k)) continue; done.add(k);
      carveCorridor(map, r, map.rooms[l]);
    }
    for (const r of map.rooms) furnish(map, r);
    for (let i = 0; i < N; i++) if (map.tiles[i] === FLOOR) map.deco[i] = floorVariant(map);
    const start = map.rooms[0];
    start.state = 'cleared'; start.seen = start.visited = true;
    return map;
  };

  function floorVariant(map) {
    const n = map.art ? map.art.floor.length : 0;
    if (n <= 1) return 0;
    return SK.chance(0.55) ? 0 : SK.randi(1, n - 1);
  }

  const idx = (map, x, y) => y * map.W + x;
  W_.idx = idx;

  function carveRoom(map, r) {
    for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
      const inside = x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
      map.tiles[idx(map, x, y)] = inside ? FLOOR : WALL;
    }
  }

  function carveCorridor(map, a, b) {
    const half = DS.rooms.corridor >> 1;
    const horiz = a.gy === b.gy;
    const [p, q] = horiz ? (a.gx < b.gx ? [a, b] : [b, a]) : (a.gy < b.gy ? [a, b] : [b, a]);
    const set = (x, y, t) => { const i = idx(map, x, y); if (t === FLOOR || map.tiles[i] !== FLOOR) map.tiles[i] = t; };
    if (horiz) {
      const c = p.cy;
      for (let x = p.x1 + 1; x <= q.x0 - 1; x++) for (let y = c - half - 1; y <= c + half + 1; y++) set(x, y, Math.abs(y - c) <= half ? FLOOR : WALL);
      addDoor(map, p, 'e', p.x1 + 1, c, true); addDoor(map, q, 'w', q.x0 - 1, c, true);
    } else {
      const c = p.cx;
      for (let y = p.y1 + 1; y <= q.y0 - 1; y++) for (let x = c - half - 1; x <= c + half + 1; x++) set(x, y, Math.abs(x - c) <= half ? FLOOR : WALL);
      addDoor(map, p, 's', c, p.y1 + 1, false); addDoor(map, q, 'n', c, q.y0 - 1, false);
    }
  }

  function addDoor(map, r, dir, x, y, vertical) {
    const half = DS.rooms.corridor >> 1, cells = [];
    for (let k = -half; k <= half; k++) {
      const cx = vertical ? x : x + k, cy = vertical ? y + k : y;
      map.door[idx(map, cx, cy)] = r.id + 1;
      cells.push([cx, cy]);
    }
    r.doors.push({ dir, x, y, cells, vertical });
  }

  function placeObstacle(map, x, y, name) {
    const parts = prefabFor(map.th, name);
    if (!parts) { SK.warnOnce('pf' + name, 'prefab missing: ' + name); return; }
    const i = idx(map, x, y);
    if (map.tiles[i] !== FLOOR || map.obs.has(i)) return;
    const k = obstacleKind(parts);
    const o = Object.assign({ name, parts, tx: x, ty: y, x: x * T + 8, y: (y + 1) * T, t: SK.rand() * 3 }, k);
    map.obs.set(i, o);
    if (o.solid) map.tiles[i] = OBST;
  }

  function furnish(map, r) {
    r.spawnPts = [];
    if (r.pattern) {
      // Pattern Unity có y hướng lên; hàng 0 là hàng dưới cùng của phòng.
      for (const [sym, px, py] of r.pattern.it) {
        const name = map.lib[sym];
        if (name) placeObstacle(map, r.x0 + px, r.y1 - py, name);
      }
      r.spawnPts = r.pattern.ep.map(([px, py]) => [r.x0 + px, r.y1 - py])
        .filter(([x, y]) => map.tiles[idx(map, x, y)] === FLOOR);
    }
    if (!r.spawnPts.length) {
      for (let y = r.y0 + 2; y <= r.y1 - 2; y += 3) for (let x = r.x0 + 2; x <= r.x1 - 2; x += 3) r.spawnPts.push([x, y]);
    }
  }

  // ---------------------------------------------------------------- truy vấn va chạm
  W_.tileAt = (map, x, y) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= map.W || ty >= map.H) return VOID;
    return map.tiles[ty * map.W + tx];
  };
  function doorShut(map, i) {
    const d = map.door[i];
    return d > 0 && map.rooms[d - 1].state === 'locked';
  }
  W_.solidTile = (map, tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= map.W || ty >= map.H) return true;
    const i = ty * map.W + tx, t = map.tiles[i];
    return t !== FLOOR || doorShut(map, i);
  };
  W_.solidAt = (map, x, y) => W_.solidTile(map, Math.floor(x / T), Math.floor(y / T));
  W_.boxHits = (map, x0, y0, x1, y1) => {
    for (let ty = Math.floor(y0 / T); ty <= Math.floor((y1 - 0.01) / T); ty++)
      for (let tx = Math.floor(x0 / T); tx <= Math.floor((x1 - 0.01) / T); tx++)
        if (W_.solidTile(map, tx, ty)) return true;
    return false;
  };
  // Tầm nhìn: đi dọc đoạn thẳng từng 4 px.
  W_.los = (map, ax, ay, bx, by) => {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 4);
    for (let i = 1; i < n; i++) if (W_.solidAt(map, ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
    return true;
  };
  W_.obstacleAt = (map, x, y) => map.obs.get(idx(map, Math.floor(x / T), Math.floor(y / T))) || null;
  W_.removeObstacle = (map, o) => {
    const i = idx(map, o.tx, o.ty);
    map.obs.delete(i);
    if (map.tiles[i] === OBST) map.tiles[i] = FLOOR;
  };

  // Phòng mà điểm (x,y) nằm sâu ít nhất `inset` ô bên trong nền.
  W_.roomAt = (map, x, y, inset) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), k = inset || 0;
    for (const r of map.rooms) if (tx >= r.x0 + k && tx <= r.x1 - k && ty >= r.y0 + k && ty <= r.y1 - k) return r;
    return null;
  };
  W_.randomFloorIn = (map, r, avoidX, avoidY, minD) => {
    for (let k = 0; k < 60; k++) {
      const x = SK.randi(r.x0 + 1, r.x1 - 1), y = SK.randi(r.y0 + 1, r.y1 - 1);
      if (map.tiles[idx(map, x, y)] !== FLOOR) continue;
      const px = x * T + 8, py = y * T + 12;
      if (avoidX != null && Math.hypot(px - avoidX, py - avoidY) < minD) continue;
      return [px, py];
    }
    return [r.cx * T + 8, r.cy * T + 12];
  };
  W_.roomCenter = r => [r.cx * T + 8, r.cy * T + 8];

  // ---------------------------------------------------------------- vẽ
  const FLOOR_FALLBACK = ['#0f3a44', '#113f4a'];
  W_.drawFloor = function (ctx, map, cam, vw, vh) {
    const x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T));
    const x1 = Math.min(map.W - 1, Math.floor((cam.x + vw) / T)), y1 = Math.min(map.H - 1, Math.floor((cam.y + vh) / T) + 1);
    const fl = map.art ? map.art.floor : [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * map.W + x;
      if (map.tiles[i] === VOID || map.tiles[i] === WALL) continue;
      const name = fl[map.deco[i]] || fl[0];
      const f = name && SK.frame(name);
      if (f && SK.pages[f[0]]) {
        // Khung sàn 16×24 chỉ có 16 hàng dưới là ảnh: canh đáy khung vào đáy ô.
        ctx.drawImage(SK.pages[f[0]], f[1], f[2], f[3], f[4], x * T, (y + 1) * T - f[4], f[3], f[4]);
      } else {
        ctx.fillStyle = FLOOR_FALLBACK[(x + y) & 1];
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
  };

  function drawWall(ctx, map, i) {
    const x = (i % map.W) * T + 8, y = (Math.floor(i / map.W) + 1) * T;
    const ws = map.art && map.art.walls;
    if (!ws || !ws.length) {
      ctx.fillStyle = '#2f5d34'; ctx.fillRect(x - 8, y - 24, 16, 16);
      ctx.fillStyle = '#1d3a22'; ctx.fillRect(x - 8, y - 8, 16, 8);
      return;
    }
    // Tường chính (bụi cây) + thỉnh thoảng khối đá rêu, băm theo vị trí cho ổn định.
    const h = (i * 2654435761) >>> 0;
    const w = ws.length > 1 && (h % 100) < 8 ? ws[1] : ws[0];
    if (w.front) SK.draw(ctx, w.front, x, y);
    if (w.top) SK.draw(ctx, w.top, x, y - w.atTop);
  }

  function drawObstacle(ctx, map, o, t) {
    if (o.kind === 'sting') {
      const p = o.p || {}, cyc = (p.show_time || 1) + (p.hide_time || 2);
      o.up = ((t + o.t) % cyc) < (p.show_time || 1);
      SK.drawPrefab(ctx, o.parts, o.x, o.y, { t, skip: q => q.n === '/ding' && !o.up });
      return;
    }
    if (!SK.drawPrefab(ctx, o.parts, o.x, o.y, { t: t + o.t, pages: o.flash > 0 ? SK.pagesWhite : null })) {
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(o.x - 7, o.y - 16, 14, 14);
    }
  }

  const DOOR_PARTS = {};
  function doorParts(vertical) {
    const k = vertical ? 'v' : 'h';
    if (DOOR_PARTS[k] !== undefined) return DOOR_PARTS[k];
    const pf = SK.art.object(vertical ? 'door_v' : 'door_h');
    // Cửa gồm 5 khối /d1../d5 giống nhau; lấy khối giữa /d3 làm mẫu cho mỗi ô.
    let parts = null;
    if (pf) {
      const mid = pf.find(p => p.n === '/d3');
      if (mid) parts = pf.filter(p => p.n.startsWith('/d3')).map(p => Object.assign({}, p, { at: [p.at[0] - mid.at[0], p.at[1] - mid.at[1]] }));
    }
    DOOR_PARTS[k] = parts;
    return parts;
  }

  function drawDoorCell(ctx, map, cell, door, room) {
    const x = cell[0] * T + 8, y = (cell[1] + 1) * T;
    const shut = room.state === 'locked';
    // doorT chạy 0→1: rào dâng lên khi khoá, hạ xuống khi mở.
    const k = SK.clamp(room.doorT / 0.18, 0, 1);
    const raise = shut ? k : 1 - k;
    const parts = doorParts(door.vertical);
    if (raise <= 0.02) {
      ctx.fillStyle = 'rgba(60,36,20,0.9)';
      ctx.fillRect(x - 8, y - 4, 16, 3);
      return;
    }
    const lift = Math.round((1 - raise) * 16);
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 8, y - 48, 16, 48); ctx.clip();
    if (!parts || !SK.drawPrefab(ctx, parts, x, y + lift, {})) {
      ctx.fillStyle = '#6b4424'; ctx.fillRect(x - 7, y - 24 + lift, 14, 22);
      ctx.fillStyle = '#9a6a3a'; ctx.fillRect(x - 5, y - 22 + lift, 2, 18); ctx.fillRect(x + 3, y - 22 + lift, 2, 18);
    }
    ctx.restore();
  }

  // Góp các thứ đứng (tường, vật cản, cửa) vào danh sách xếp theo y của chân.
  W_.collect = function (list, map, cam, vw, vh, t) {
    const x0 = Math.max(0, Math.floor(cam.x / T) - 1), y0 = Math.max(0, Math.floor(cam.y / T) - 1);
    const x1 = Math.min(map.W - 1, Math.floor((cam.x + vw) / T) + 1), y1 = Math.min(map.H - 1, Math.floor((cam.y + vh) / T) + 3);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * map.W + x, tt = map.tiles[i];
      if (tt === WALL) list.push({ y: (y + 1) * T, fn: drawWall, a: map, b: i });
      const o = (tt === OBST || tt === FLOOR) && map.obs.get(i);
      if (o) list.push({ y: o.kind === 'sting' || o.kind === 'pad' ? -1e9 + o.y : o.y, fn: (c, m, ob) => drawObstacle(c, m, ob, t), a: map, b: o });
    }
    for (const r of map.rooms) for (const d of r.doors) for (const c of d.cells) {
      if (c[0] < x0 || c[0] > x1 || c[1] < y0 || c[1] > y1) continue;
      list.push({ y: (c[1] + 1) * T - 0.5, fn: (ctx) => drawDoorCell(ctx, map, c, d, r), a: null, b: null });
    }
  };

  // ---------------------------------------------------------------- máy trạng thái phòng
  // idle → locked(wave i) → cleared. Phòng không phải phòng đánh: idle → cleared khi bước vào.
  const ROOM_ENTER = {
    battle: (G, r) => lockRoom(G, r),
    boss: (G, r) => lockRoom(G, r),
    start: (G, r) => { r.state = 'cleared'; },
    end: (G, r) => { r.state = 'cleared'; },
    chest: (G, r) => { r.state = 'cleared'; },
    special: (G, r) => { r.state = 'cleared'; }
  };

  function lockRoom(G, r) {
    r.state = 'locked'; r.doorT = 0; r.wave = -1; r.waveDelay = 0.35;
    r.waves = G.buildWaves(r);
    // Không để ai kẹt trong ô cửa khi rào dâng.
    const p = G.player;
    p.x = SK.clamp(p.x, (r.x0 + 1) * T, r.x1 * T);
    p.y = SK.clamp(p.y, (r.y0 + 1) * T + 4, (r.y1 + 1) * T - 4);
  }

  W_.clearRoom = function (G, r) {
    r.state = 'cleared'; r.doorT = 0; r.wave = r.waves.length;
    G.onRoomCleared(r);
  };

  W_.updateRooms = function (G, dt) {
    const map = G.map, p = G.player;
    for (const r of map.rooms) r.doorT += dt;
    const inRoom = W_.roomAt(map, p.x, p.y - 4, 0);
    if (inRoom && inRoom !== G.room) {
      G.room = inRoom;
      inRoom.visited = inRoom.seen = true;
      for (const l of inRoom.links) map.rooms[l].seen = true;
    }
    // Khoá khi đã bước hẳn một ô vào trong, để rào không dâng lên ngay trên đầu người chơi.
    const deep = W_.roomAt(map, p.x, p.y - 4, 1);
    if (deep && deep.state === 'idle') ROOM_ENTER[deep.type](G, deep);
    for (const r of map.rooms) {
      if (r.state !== 'locked') continue;
      const alive = G.enemies.some(e => e.room === r && e.st !== 'dead');
      if (alive) continue;
      r.waveDelay -= dt;
      if (r.waveDelay > 0) continue;
      r.wave++;
      if (r.wave < r.waves.length) { G.spawnWave(r, r.waves[r.wave]); r.waveDelay = 0.6; }
      else W_.clearRoom(G, r);
    }
  };
})();
