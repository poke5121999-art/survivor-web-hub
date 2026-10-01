/* D2G: bộ sinh màn (DRLG) cho Diablo II Act I. Hàm thuần, không đụng DOM.
 * D2G.build(areaId, seed) -> Grid (xem brain/plans/diablo2-flare.md).
 * Đọc window.D2DATA.areas và window.D2_ASSETS.autotile lúc gọi (không lúc nạp).
 *
 * Giả định hợp đồng (chỉnh ở các hằng số đầu tệp nếu bên kia khác):
 *  - col: 0 đi, 1 tường, 2 nước/hố. bg = id sàn, obj = id tường/cây/deco; obj 0 = ô trống.
 *  - Mặt nạ 8 hàng xóm: bit đặt = hàng xóm BỊ CHẶN (col != 0, ngoài biên tính là chặn). Thứ tự ở NEIGHBORS.
 *  - area.density = số đàn quái trên mỗi 64 ô đi được (một khối 8x8). Mặc định 0.6.
 *  - spawn.n = số quái trong đàn (kể cả đầu đàn). Unique ngẫu nhiên 3..5, Corpsefire n=1 kèm id:'corpsefire'.
 *  - area.size = [w,h] tính bằng ô D2 (5x5 subtile, Levels.txt SizeX/SizeY). Đổi ra ô lưới bằng CELLS_PER_D2_TILE
 *    (outdoor làm tròn lên bội của 8). area.playSize (nếu có, ô D2) thắng area.size: dùng cho hang maze, vì 200x200 của
 *    Levels.txt là hộp bao của DRLG chứ không phải vùng chơi. Preset: mỗi ký tự = một ô D2, phóng CELLS_PER_D2_TILE lần.
 *  - Số đàn quái: xem monsterPacks() (công thức theo Levels.txt MonDen, MonUMin/MonUMax).
 *  - area.exits: mảng [{side,to}] của data.js (nguồn đúng). Outdoor: 'edge' thứ nhất = lối tây, thứ hai = lối đông,
 *    'cave_entrance'/'stairs' = miệng hang. Hang: mục đầu = lối về. Dạng object {west,east,cave,back} và EXIT_DEFAULTS
 *    chỉ còn là đường lùi khi data không có exits (test stub).
 *  - Ký tự preset: area.legend[ch] (máy đọc, do data.js sinh): {t:'wall',fence} | {t:'tree'} | {t:'water'} |
 *    {t:'floor',bg:'path'|bridge} | {t:'hero'} | {t:'exit',to} | {t:'npc',id} | {t:'object',type,block,merge}.
 *    merge: mỗi cụm ô kề nhau cùng ký tự thành MỘT vật {type,x,y,w,h} (hộp bao). Dạng chuỗi 'npc:id' vẫn đọc được.
 *    Chỉ khi area không có legend mới dùng DEFAULT_LEGEND (camp dự phòng).
 *  - Mọi vật trong grid.objects có w,h (mặc định 1). Ô tường luôn có bg != 0 (autotile.wallBg theo mặt nạ, rồi floor).
 *  - Hàng rào: ô legend fence dùng autotile.fence[mask4] (N=1,E=2,S=4,W=8 của hàng xóm cũng là hàng rào).
 */
(function (root) {
  'use strict';

  // [dx, dy] theo thứ tự bit 0..7: N, NE, E, SE, S, SW, W, NW (chiều kim đồng hồ, trên lưới ô)
  var NEIGHBORS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  var BIT_MEANS_BLOCKED = true; // false: bit đặt khi hàng xóm đi được

  // Một ô lưới = 2 subtile (hero chạy RunVelocity*0.5 = 4.5 ô/s, js/game.js heroSpeed); một ô D2 = 5x5 subtile = 2.5 ô lưới.
  var CELLS_PER_D2_TILE = 2.5;
  function d2ToCells(n) { return Math.ceil(n * CELLS_PER_D2_TILE - 1e-9); }

  var EXIT_DEFAULTS = {
    blood_moor: { west: 'rogue_encampment', east: 'cold_plains', cave: 'den_of_evil' },
    den_of_evil: { back: 'blood_moor' },
    rogue_encampment: { east: 'blood_moor' }
  };

  // chỉ dùng khi area không có legend (camp dự phòng defaultCamp)
  var DEFAULT_LEGEND = {
    '#': 'wall', 'T': 'tree', '~': 'water', '.': 'floor', ',': 'deco', '@': 'hero', 'X': 'exit',
    'F': 'object:campfire', 'P': 'object:waypoint', 'S': 'object:stash',
    'a': 'npc:akara', 'c': 'npc:charsi', 'g': 'npc:gheed', 'k': 'npc:kashya', 'w': 'npc:warriv', 'd': 'npc:deckard_cain'
  };

  // ---------- lối ra theo data ----------
  var EDGE_SIDES = { edge: 1, west: 1, east: 1, north: 1, south: 1 };
  function resolveExits(area) {
    var ex = area.exits, def = EXIT_DEFAULTS[area.id] || {}, r = {}, i, e, edges = [];
    if (Array.isArray(ex)) {
      for (i = 0; i < ex.length; i++) {
        e = ex[i];
        if (e.stub) continue;
        if (e.side === 'cave_entrance' || e.side === 'stairs') { if (!r.cave) r.cave = e.to; }
        else if (EDGE_SIDES[e.side]) {
          if (e.side === 'west' && !r.west) r.west = e.to;
          else if (e.side === 'east' && !r.east) r.east = e.to;
          else edges.push(e.to);
        }
      }
      if (!r.west && edges.length) r.west = edges.shift();
      if (!r.east && edges.length) r.east = edges.shift();
      r.first = ex.length ? ex[0].to : null;
      r.back = r.west || r.first;
      if (area.layout === 'cave' || area.id === 'den_of_evil') r.back = r.first;
      return r;
    }
    var o = ex && typeof ex === 'object' ? ex : {};
    r.west = o.west || o.back || def.west; r.east = o.east || def.east; r.cave = o.cave || def.cave;
    r.back = o.back || o.west || def.back; r.first = r.west || r.east || r.back || r.cave;
    return r;
  }

  // ---------- tiện ích ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function ri(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function popcount(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

  function getAreas() { var d = root.D2DATA; return d && d.areas; }
  function findArea(id) {
    var A = getAreas();
    if (!A) return null;
    if (Array.isArray(A)) { for (var i = 0; i < A.length; i++) if (A[i].id === id) return A[i]; return null; }
    var a = A[id];
    if (a && !a.id) a.id = id;
    return a || null;
  }
  function autotileFor(ts) {
    var at = (root.D2_ASSETS && root.D2_ASSETS.autotile && root.D2_ASSETS.autotile[ts]) || {};
    return at;
  }
  function pickW(list, rng, fallback) {
    if (!list || !list.length) return fallback;
    var tot = 0, i, e;
    for (i = 0; i < list.length; i++) { e = list[i]; tot += Array.isArray(e) ? (e[1] == null ? 1 : e[1]) : 1; }
    var r = rng() * tot;
    for (i = 0; i < list.length; i++) {
      e = list[i]; r -= Array.isArray(e) ? (e[1] == null ? 1 : e[1]) : 1;
      if (r < 0) return Array.isArray(e) ? e[0] : e;
    }
    e = list[list.length - 1];
    return Array.isArray(e) ? e[0] : e;
  }

  function newGrid(area, w, h) {
    var assets = root.D2_ASSETS || {};
    return {
      id: area.id, w: w, h: h,
      tileW: area.tileW || assets.tileW || 64, tileH: area.tileH || assets.tileH || 32,
      tileset: area.tileset || 'grassland',
      bg: new Int32Array(w * h), obj: new Int32Array(w * h), col: new Uint8Array(w * h).fill(1),
      hero: [0, 0], spawns: [], exits: [], npcs: [], objects: []
    };
  }

  // ---------- lưu thông ----------
  // BFS 4 hướng trên ô col==0; trả về khoảng cách (-1 = không tới)
  function bfs(g, sx, sy) {
    var w = g.w, h = g.h, col = g.col, dist = new Int32Array(w * h).fill(-1);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h || col[sy * w + sx] !== 0) return dist;
    var q = new Int32Array(w * h), qh = 0, qt = 0;
    dist[sy * w + sx] = 0; q[qt++] = sy * w + sx;
    while (qh < qt) {
      var c = q[qh++], x = c % w, y = (c - x) / w, d = dist[c] + 1, n;
      if (x > 0 && col[n = c - 1] === 0 && dist[n] < 0) { dist[n] = d; q[qt++] = n; }
      if (x < w - 1 && col[n = c + 1] === 0 && dist[n] < 0) { dist[n] = d; q[qt++] = n; }
      if (y > 0 && col[n = c - w] === 0 && dist[n] < 0) { dist[n] = d; q[qt++] = n; }
      if (y < h - 1 && col[n = c + w] === 0 && dist[n] < 0) { dist[n] = d; q[qt++] = n; }
    }
    return dist;
  }
  function inb(g, x, y) { return x >= 0 && y >= 0 && x < g.w && y < g.h; }
  function open(g, x, y) { return inb(g, x, y) && g.col[y * g.w + x] === 0; }

  function carveSquare(g, cx, cy, wd, margin) {
    var lo = -Math.floor((wd - 1) / 2), hi = Math.floor(wd / 2);
    for (var dy = lo; dy <= hi; dy++) for (var dx = lo; dx <= hi; dx++) {
      var x = cx + dx, y = cy + dy;
      if (x >= margin && y >= margin && x < g.w - margin && y < g.h - margin) g.col[y * g.w + x] = 0;
    }
  }
  // đường hầm quanh co từ a tới b, rộng wd; luôn tới nơi
  function carveTunnel(g, rng, ax, ay, bx, by, wd, margin) {
    var x = ax, y = ay, guard = 0;
    carveSquare(g, x, y, wd, margin);
    while ((x !== bx || y !== by) && guard++ < 4000) {
      var dx = bx - x, dy = by - y, adx = Math.abs(dx), ady = Math.abs(dy);
      var moveX;
      if (rng() < 0.22) moveX = rng() < 0.5; // lượn ngẫu nhiên
      else moveX = rng() * (adx + ady) < adx;
      if (moveX && adx === 0) moveX = false; else if (!moveX && ady === 0) moveX = true;
      var sx = Math.sign(dx), sy = Math.sign(dy);
      if (moveX) { x += (rng() < 0.15 && ady > 0 ? -sx : sx) || sx || 1; }
      else { y += (rng() < 0.15 && adx > 0 ? -sy : sy) || sy || 1; }
      x = clamp(x, margin, g.w - 1 - margin); y = clamp(y, margin, g.h - 1 - margin);
      carveSquare(g, x, y, wd, margin);
    }
    carveSquare(g, bx, by, wd, margin);
  }
  function carveDisc(g, cx, cy, r, margin) {
    for (var y = cy - r; y <= cy + r; y++) for (var x = cx - r; x <= cx + r; x++)
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 1 && x >= margin && y >= margin && x < g.w - margin && y < g.h - margin)
        g.col[y * g.w + x] = 0;
  }
  // ô đi được mà không tới được từ hero -> thành tường
  function sealPockets(g) {
    var dist = bfs(g, g.hero[0], g.hero[1]), n = 0;
    for (var i = 0; i < g.col.length; i++) if (g.col[i] === 0) { if (dist[i] < 0) g.col[i] = 1; else n++; }
    return n;
  }

  // ---------- tô tile ----------
  var nearestCache = {};
  function wallFor(at, mask, rng, tsKey, fallbackBlocker) {
    var walls = at.walls, k;
    if (mask === 0 || !walls) return pickW(at.blockers, rng, fallbackBlocker);
    var list = walls[mask];
    if (!list || !list.length) {
      var ck = tsKey + ':' + mask, best = nearestCache[ck];
      if (best === undefined) {
        var bd = 99, bp = 99;
        for (k in walls) {
          if (!walls[k] || !walls[k].length) continue;
          var km = +k, d = popcount(km ^ mask), p = Math.abs(popcount(km) - popcount(mask));
          if (d < bd || (d === bd && p < bp)) { bd = d; bp = p; best = km; }
        }
        if (best === undefined) best = -1;
        nearestCache[ck] = best;
      }
      list = best >= 0 ? walls[best] : null;
    }
    return list ? pickW(list, rng, fallbackBlocker) : pickW(at.blockers, rng, fallbackBlocker);
  }
  function maskAt(g, x, y) {
    var m = 0;
    for (var b = 0; b < 8; b++) {
      var nx = x + NEIGHBORS[b][0], ny = y + NEIGHBORS[b][1];
      var blocked = !inb(g, nx, ny) || g.col[ny * g.w + nx] !== 0;
      if (blocked === BIT_MEANS_BLOCKED) m |= 1 << b;
    }
    return m;
  }
  // flags (preset): 1 hàng rào, 2 cầu, 3 lối cobble, 4 cây, 5 chân vật (obj để renderer vẽ riêng)
  // protect: Uint8Array các ô không rắc deco
  function fenceMask(flags, w, h, x, y) {
    var m = 0;
    if (y > 0 && flags[(y - 1) * w + x] === 1) m |= 1;
    if (x < w - 1 && flags[y * w + x + 1] === 1) m |= 2;
    if (y < h - 1 && flags[(y + 1) * w + x] === 1) m |= 4;
    if (x > 0 && flags[y * w + x - 1] === 1) m |= 8;
    return m;
  }
  function wallBgFor(at, mask, rng) {
    var l = at.wallBg && (at.wallBg[mask] || (mask === 0 && at.wallBg['0']));
    var id = l && l.length ? pickW(l, rng, 0) : 0;
    return id || pickW(at.floor, rng, 1);
  }
  function decorate(g, rng, decoP, protect, flags) {
    var at = autotileFor(g.tileset), w = g.w, h = g.h, x, y, i, f;
    var water = at.water;
    function land(cx, cy) { return inb(g, cx, cy) && g.col[cy * w + cx] === 0 && flags[cy * w + cx] !== 2; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; f = flags ? flags[i] : 0;
      g.bg[i] = pickW(at.floor, rng, 1);
      if (g.col[i] === 0) {
        if (f === 3 && at.path) { g.bg[i] = pickW(at.path, rng, g.bg[i]); g.obj[i] = 0; }
        else if (f === 2 && at.bridge) {
          g.bg[i] = pickW(water, rng, g.bg[i]);
          g.obj[i] = pickW(at.bridge[land(x - 1, y) || land(x + 1, y) ? 'x' : 'y'], rng, 0);
        } else g.obj[i] = (!protect || !protect[i]) && rng() < decoP ? pickW(at.deco, rng, 0) : 0;
      } else if (g.col[i] === 2 && water) {
        g.bg[i] = pickW(water, rng, 1); g.obj[i] = 0;
      } else if (f === 5) {
        g.obj[i] = 0;
      } else if (f === 1 && at.fence) {
        g.obj[i] = pickW(at.fence[fenceMask(flags, w, h, x, y)], rng, 0) || wallFor(at, maskAt(g, x, y), rng, g.tileset, 2);
      } else if (f === 4 && at.trees) {
        g.obj[i] = pickW(at.trees, rng, 0);
      } else {
        // đo mặt nạ theo col != 0, nên tường và nước chung bảng
        var mk = maskAt(g, x, y);
        g.bg[i] = wallBgFor(at, mk, rng);
        g.obj[i] = wallFor(at, mk, rng, g.tileset, 2);
      }
    }
  }

  // ---------- đàn quái ----------
  function farEnough(list, x, y, d) {
    for (var i = 0; i < list.length; i++) { var dx = list[i].x - x, dy = list[i].y - y; if (dx * dx + dy * dy < d * d) return false; }
    return true;
  }
  function solid3(g, x, y) {
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (!open(g, x + dx, y + dy)) return false;
    return true;
  }
  /* Số đàn quái. Nguồn: Levels.txt (blizzhackers/d2data, đã vào data.js): MonDen = mật độ quái trên 100000 (đơn vị),
   * MonUMin/MonUMax = số đàn unique/champion mỗi màn. Arreat Summit (classic.battle.net/diablo2exp) chỉ mô tả
   * "quái sinh theo mật độ khu", không đưa công thức.
   *   packs   = round( ôD2_đi_được * MonDen / 100000 )          [approx: hệ số 1 đàn trên đơn vị mật độ, tự chọn cho
   *                                                              Blood Moor ~ 23 đàn ~ 80 quái, cỡ thực tế đã chơi]
   *   ôD2_đi_được = ô_lưới_đi_được / CELLS_PER_D2_TILE^2
   *   packs bị chặn dưới o.minPacks (hang nhỏ vẫn đủ quái) [approx]
   *   unique  = ri(MonUMin, MonUMax) đàn unique, thêm vào ngoài packs (Cold Plains 1; Blood Moor/Den 0, Corpsefire cố định)
   *   champion: 12% (outdoor) / 20% (hang) số đàn thường là champion [approx, giữ nguyên số cũ]. */
  function monsterPacks(area, walkCells, rng, o) {
    var tiles = walkCells / (CELLS_PER_D2_TILE * CELLS_PER_D2_TILE);
    var den = area.density > 0 ? area.density : 600;
    var up = area.uniquePacks || [0, 0];
    return {
      normal: Math.max(o.minPacks, Math.round(tiles * den / 100000)),
      unique: up[1] > 0 ? ri(rng, up[0], up[1]) : 0
    };
  }
  function placeSpawns(g, rng, area, o) {
    var dist = bfs(g, g.hero[0], g.hero[1]), cells = [], i, x, y;
    for (i = 0; i < dist.length; i++) if (dist[i] >= 0) cells.push(i);
    var np = monsterPacks(area, cells.length, rng, o), count = np.normal + np.unique;
    var out = [], fixed = o.fixed || [], tries;
    for (i = 0; i < fixed.length; i++) out.push(fixed[i]);
    var placed = 0, uniqueLeft = np.unique;
    for (tries = 0; tries < count * 120 && placed < count; tries++) {
      i = cells[Math.floor(rng() * cells.length)]; x = i % g.w; y = (i - x) / g.w;
      var hd = Math.hypot(x - g.hero[0], y - g.hero[1]);
      if (hd < o.minHero || !solid3(g, x, y) || !farEnough(out, x, y, o.packGap)) continue;
      var bad = false;
      for (var e = 0; e < g.exits.length; e++) if (Math.hypot(g.exits[e].x - x, g.exits[e].y - y) < 14) bad = true;
      if (bad) continue;
      var kind = 'normal', n = ri(rng, 2, 5);
      if (uniqueLeft > 0) { kind = 'unique'; n = ri(rng, 3, 5); uniqueLeft--; }
      else if (rng() < o.pChamp) { kind = 'champion'; n = ri(rng, 3, 4); }
      out.push({ x: x, y: y, n: n, kind: kind }); placed++;
    }
    g.spawns = out;
  }

  // ---------- outdoor ----------
  function walkDepth(rng, len, lo, hi) {
    var d = [], v = ri(rng, lo, hi);
    for (var i = 0; i < len; i++) { v = clamp(v + ri(rng, -1, 1), lo, hi); d.push(v); }
    return d;
  }
  function buildOutdoor(area, rng) {
    var sz = area.playSize || area.size || [80, 80];
    var w = Math.ceil(d2ToCells(sz[0]) / 8) * 8, h = Math.ceil(d2ToCells(sz[1]) / 8) * 8;
    var g = newGrid(area, w, h), x, y, i;
    var rx = resolveExits(area);
    var toWest = rx.west || 'rogue_encampment', toEast = rx.east || 'cold_plains', toCave = rx.cave || 'den_of_evil';

    // khối 8x8: viền ghồ ghề + vài khối chặn/hồ bên trong
    var dT = walkDepth(rng, w, 4, 12), dB = walkDepth(rng, w, 4, 12), dL = walkDepth(rng, h, 4, 12), dR = walkDepth(rng, h, 4, 12);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++)
      g.col[y * w + x] = (x < dL[y] || x >= w - dR[y] || y < dT[x] || y >= h - dB[x]) ? 1 : 0;
    var cw = w / 8, ch = h / 8, cx, cy;
    for (cy = 1; cy < ch - 1; cy++) for (cx = 1; cx < cw - 1; cx++) {
      if (rng() >= 0.16) continue;
      var kindc = rng() < 0.4 ? 2 : 1;
      var mx = cx * 8 + 4 + ri(rng, -1, 1), my = cy * 8 + 4 + ri(rng, -1, 1);
      var rx = 2 + rng() * 2.2, ry = 2 + rng() * 2.2;
      for (y = cy * 8; y < cy * 8 + 8; y++) for (x = cx * 8; x < cx * 8 + 8; x++) {
        var q = ((x - mx) / rx) * ((x - mx) / rx) + ((y - my) / ry) * ((y - my) / ry);
        if (q < 0.85 + rng() * 0.3) g.col[y * w + x] = kindc;
      }
    }

    // hero + lối về doanh trại (cạnh tây), lối sang Cold Plains (cạnh đông)
    // lối ra rộng 7 ô (~3 ô D2), mỗi ô là một exit
    var hy = ri(rng, Math.floor(h * 0.3), Math.floor(h * 0.7)), hx = 16, k;
    g.hero = [hx, hy];
    for (x = 1; x <= hx + 2; x++) carveSquare(g, x, hy, 7, 1);
    for (k = -3; k <= 3; k++) g.exits.push({ x: 1, y: hy + k, to: toWest });
    var ey = ri(rng, Math.floor(h * 0.25), Math.floor(h * 0.75));
    for (x = w - 18; x <= w - 2; x++) carveSquare(g, x, ey, 7, 1);
    for (k = -3; k <= 3; k++) g.exits.push({ x: w - 2, y: ey + k, to: toEast });
    if (bfs(g, hx, hy)[ey * w + (w - 2)] < 0) carveTunnel(g, rng, hx, hy, w - 18, ey, 6, 1);

    // miệng hang: ô tới được, xa hero và lối đông, cách mép
    var dist = bfs(g, hx, hy), cand = [], tier;
    for (tier = 0; tier < 3 && !cand.length; tier++) {
      var mh = [70, 45, 20][tier], me = [16, 12, 10][tier];
      for (i = 0; i < dist.length; i++) {
        if (dist[i] < 0) continue;
        x = i % w; y = (i - x) / w;
        if (x < me || y < me || x >= w - me || y >= h - me) continue;
        if (Math.hypot(x - hx, y - hy) < mh || Math.hypot(x - (w - 2), y - ey) < 30) continue;
        cand.push(i);
      }
    }
    var mi = cand[Math.floor(rng() * cand.length)], mxp = mi % w, myp = (mi - mxp) / w;
    carveDisc(g, mxp, myp, 4, 1);
    g.exits.push({ x: mxp, y: myp, to: toCave });
    g.objects.push({ type: 'cave_mouth', x: mxp, y: myp });
    sealPockets(g);

    // cây/đá lẻ, mọc thành cụm quanh vài tâm; chỉ đặt nơi 8 hàng xóm đều đi được nên không bao giờ chắn đường
    var groves = [], gi, nG = Math.round(ri(rng, 6, 10) * w * h / 6400);
    for (gi = 0; gi < nG; gi++) groves.push([ri(rng, 12, w - 13), ri(rng, 12, h - 13), 6 + rng() * 10]);
    var protect = new Uint8Array(w * h), keys = g.exits.concat([{ x: hx, y: hy }]);
    for (i = 0; i < keys.length; i++) for (y = keys[i].y - 9; y <= keys[i].y + 9; y++) for (x = keys[i].x - 9; x <= keys[i].x + 9; x++)
      if (inb(g, x, y)) protect[y * w + x] = 1;
    var treeCells = [];
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      if (g.col[i] !== 0 || protect[i]) continue;
      var p = 0.035;
      for (gi = 0; gi < nG; gi++) { var gd = Math.hypot(x - groves[gi][0], y - groves[gi][1]); if (gd < groves[gi][2]) p += 0.4 * (1 - gd / groves[gi][2]); }
      if (rng() < p) treeCells.push(i);
    }
    for (i = 0; i < treeCells.length; i++) {
      var c = treeCells[i]; x = c % w; y = (c - x) / w;
      var ok = true;
      for (var b = 0; b < 8 && ok; b++) if (!open(g, x + NEIGHBORS[b][0], y + NEIGHBORS[b][1])) ok = false;
      if (ok) g.col[c] = 1;
    }
    return { g: g, protect: protect, decoP: 0.07 };
  }

  // ---------- hang ----------
  function buildCave(area, rng) {
    var sz = area.playSize || area.size || [48, 48];
    var w = d2ToCells(sz[0]), h = d2ToCells(sz[1]), g = newGrid(area, w, h), i, x, y, t;
    var back = resolveExits(area).back || 'blood_moor';
    // phòng nhỏ nối bằng đường hầm hẹp quanh co: ~25-35% ô đi được
    var rooms = [], tries = 0, target = ri(rng, 14, 18);
    var r0 = { cx: 12 + ri(rng, 0, 2), cy: ri(rng, 16, h - 17), rx: ri(rng, 4, 6), ry: ri(rng, 4, 5) };
    rooms.push(r0);
    while (rooms.length < target && tries++ < 600) {
      var r = { cx: ri(rng, 10, w - 11), cy: ri(rng, 10, h - 11), rx: ri(rng, 4, 7), ry: ri(rng, 3, 6) }, bad = false;
      for (i = 0; i < rooms.length; i++) {
        var a = rooms[i];
        if (Math.abs(a.cx - r.cx) < a.rx + r.rx + 5 && Math.abs(a.cy - r.cy) < a.ry + r.ry + 5) { bad = true; break; }
      }
      if (!bad) rooms.push(r);
    }
    for (i = 0; i < rooms.length; i++) {
      var rm = rooms[i];
      for (y = rm.cy - rm.ry - 1; y <= rm.cy + rm.ry + 1; y++) for (x = rm.cx - rm.rx - 1; x <= rm.cx + rm.rx + 1; x++) {
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
        var q = ((x - rm.cx) / rm.rx) * ((x - rm.cx) / rm.rx) + ((y - rm.cy) / rm.ry) * ((y - rm.cy) / rm.ry);
        if (q <= 0.85 + rng() * 0.3) g.col[y * w + x] = 0;
      }
    }
    var order = rooms.slice(1).sort(function (a, b) { return a.cx - b.cx; });
    order.unshift(r0);
    for (i = 0; i + 1 < order.length; i++) carveTunnel(g, rng, order[i].cx, order[i].cy, order[i + 1].cx, order[i + 1].cy, ri(rng, 4, 5), 2);
    for (i = 0; i + 2 < order.length; i++) if (rng() < 0.45)
      carveTunnel(g, rng, order[i].cx, order[i].cy, order[i + 2].cx, order[i + 2].cy, ri(rng, 3, 4), 2);

    // lối vào ở đầu tây phòng đầu
    var ey = r0.cy, exx = 2;
    while (exx < w - 3 && g.col[ey * w + exx] !== 0) exx++;
    exx = Math.max(2, exx - 1);
    carveSquare(g, exx, ey, 3, 1);
    carveTunnel(g, rng, exx, ey, exx + 3, ey, 3, 1);
    g.exits.push({ x: exx, y: ey, to: back });
    g.hero = [exx + 3, ey];
    carveDisc(g, g.hero[0], g.hero[1], 1, 1);
    sealPockets(g);

    // phòng xa nhất tính theo đường đi = chỗ Corpsefire
    var dist = bfs(g, g.hero[0], g.hero[1]), far = order[order.length - 1], fd = -1;
    for (i = 1; i < order.length; i++) {
      var d = dist[order[i].cy * w + order[i].cx];
      if (d > fd) { fd = d; far = order[i]; }
    }
    var bx = far.cx, by = far.cy;
    if (!open(g, bx, by)) {
      var best = 1e9;
      for (i = 0; i < dist.length; i++) if (dist[i] >= 0) {
        x = i % w; y = (i - x) / w;
        var dd = Math.hypot(x - far.cx, y - far.cy);
        if (dd < best) { best = dd; bx = x; by = y; }
      }
    }
    var fixed = [{ x: bx, y: by, n: 1, kind: 'unique', id: 'corpsefire' }];
    var chests = ri(rng, 2, 3), cells = [];
    for (i = 0; i < dist.length; i++) if (dist[i] > 24) cells.push(i);
    for (t = 0; t < chests && cells.length; t++) {
      i = cells[Math.floor(rng() * cells.length)]; x = i % w; y = (i - x) / w;
      if (solid3(g, x, y)) g.objects.push({ type: 'chest', x: x, y: y });
    }
    return { g: g, fixed: fixed, decoP: 0.03 };
  }

  // ---------- preset ----------
  function defaultCamp() {
    var W = 36, H = 30, rows = [], x, y;
    for (y = 0; y < H; y++) {
      var r = [];
      for (x = 0; x < W; x++) r.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.');
      rows.push(r);
    }
    function put(x, y, c) { rows[y][x] = c; }
    put(18, 15, 'F'); put(24, 11, 'P'); put(12, 12, 'S');
    put(16, 12, 'a'); put(20, 18, 'c'); put(14, 18, 'g'); put(22, 14, 'k'); put(10, 15, 'w'); put(19, 13, 'd');
    put(4, 15, '@'); put(W - 1, 15, 'X');
    for (var i = 0; i < 12; i++) { put(3 + i * 2, 2, 'T'); put(4 + i * 2, H - 3, 'T'); }
    return rows.map(function (r) { return r.join(''); });
  }
  function legendEntry(area, ch) {
    var v = area.legend ? area.legend[ch] : DEFAULT_LEGEND[ch];
    if (v == null) return { t: 'floor' };
    if (typeof v === 'string') {
      var p = v.split(':'), o = { t: p[0] };
      if (p[0] === 'npc') o.id = p[1];
      else if (p[0] === 'object') o.type = p[1];
      else if (p[0] === 'exit') o.to = p[1];
      return o;
    }
    return v;
  }
  /* Preset: mỗi ký tự của area.preset = một ô D2, phóng CELLS_PER_D2_TILE lần (lấy mẫu gần nhất).
   *  - npc/hero/cây: chỉ đặt ở ô tâm của khối, phần còn lại là sàn.
   *  - vật (object): một vật cho cả khối (hộp bao); các khối cùng ký tự merge gộp thành một.
   *  - hàng rào: vẽ thành đường 1 ô bám tâm các ô nguồn, nối 4 hướng nên liền mạch; chỗ cổng (G) hở trọn bề rộng cổng.
   *  - lối ra (E) và cổng: phủ cả khối, nên bề rộng lối ra = bề rộng nguồn * CELLS_PER_D2_TILE. */
  function buildPreset(area, rng) {
    var pre = area.preset || defaultCamp();
    var src = Array.isArray(pre) ? pre : String(pre).split(/\r?\n/);
    var sh = src.length, sw = 0, x, y, i, S = CELLS_PER_D2_TILE;
    for (y = 0; y < sh; y++) sw = Math.max(sw, src[y].length);
    var w = d2ToCells(sw), h = d2ToCells(sh);
    function sch(sx, sy) { return sx >= 0 && sy >= 0 && sy < sh && sx < src[sy].length ? src[sy][sx] : ' '; }
    function isFence(sx, sy) { var e = legendEntry(area, sch(sx, sy)); return e.t === 'wall' && !!e.fence; }
    var rows = [], srcId = new Int32Array(w * h);
    for (y = 0; y < h; y++) {
      var row = [], sy = Math.floor(y / S);
      var y0 = d2ToCells(sy), y1 = Math.min(h - 1, d2ToCells(sy + 1) - 1), cyc = y0 + Math.floor((y1 - y0) / 2);
      for (x = 0; x < w; x++) {
        var sx = Math.floor(x / S), ch = sch(sx, sy), e = legendEntry(area, ch);
        var x0 = d2ToCells(sx), x1 = Math.min(w - 1, d2ToCells(sx + 1) - 1), cxc = x0 + Math.floor((x1 - x0) / 2);
        var keep = ch;
        srcId[y * w + x] = sy * sw + sx;
        if (e.t === 'npc' || e.t === 'hero' || e.t === 'tree' || e.t === 'blocker') keep = (x === cxc && y === cyc) ? ch : '.';
        else if (e.t === 'wall' && e.fence) {
          var on = (x === cxc && y === cyc) ||
            (y === cyc && ((x > cxc && isFence(sx + 1, sy)) || (x < cxc && isFence(sx - 1, sy)))) ||
            (x === cxc && ((y > cyc && isFence(sx, sy + 1)) || (y < cyc && isFence(sx, sy - 1))));
          if (!on) keep = '.';
        }
        row.push(keep);
      }
      rows.push(row);
    }
    var g = newGrid(area, w, h), protect = new Uint8Array(w * h), flags = new Uint8Array(w * h);
    var rx = resolveExits(area), dflt = rx.first || rx.east || 'blood_moor';
    var heroSet = false, mergeCells = {};
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      var c0 = rows[y][x], en = legendEntry(area, c0);
      g.col[i] = 0;
      switch (en.t) {
        case 'wall': g.col[i] = 1; if (en.fence) flags[i] = 1; break;
        case 'tree': case 'blocker': g.col[i] = 1; flags[i] = 4; break;
        case 'water': g.col[i] = 2; break;
        case 'hero': g.hero = [x, y]; heroSet = true; protect[i] = 1; break;
        case 'npc': g.npcs.push({ id: en.id, x: x, y: y }); protect[i] = 1; break;
        case 'object':
          protect[i] = 1;
          var blk = en.block != null ? en.block : (en.type === 'campfire' || en.type === 'stash' || en.type === 'waypoint');
          if (blk) { g.col[i] = 1; flags[i] = 5; }
          (mergeCells[c0] = mergeCells[c0] || []).push(i);
          break;
        case 'exit': g.exits.push({ x: x, y: y, to: en.to || dflt }); protect[i] = 1; break;
        case 'floor': protect[i] = en.bg || en.bridge ? 1 : 0; flags[i] = en.bridge ? 2 : en.bg === 'path' ? 3 : 0; break;
        default: break;
      }
    }
    // gộp cụm ô kề nhau (4 hướng) cùng ký tự thành một vật (hộp bao); vật không merge chỉ gộp trong cùng một ô nguồn
    Object.keys(mergeCells).forEach(function (ch) {
      var e = legendEntry(area, ch), seen = {}, list = mergeCells[ch], k;
      for (k = 0; k < list.length; k++) {
        if (seen[list[k]]) continue;
        var st = [list[k]], x0 = w, y0 = h, x1 = -1, y1 = -1;
        seen[list[k]] = 1;
        while (st.length) {
          var c = st.pop(), cx = c % w, cy = (c - cx) / w;
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          var nb = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
          for (var q = 0; q < 4; q++) {
            var nx = nb[q][0], ny = nb[q][1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            var ni = ny * w + nx;
            if (!seen[ni] && rows[ny][nx] === ch && (e.merge || srcId[ni] === srcId[c])) { seen[ni] = 1; st.push(ni); }
          }
        }
        g.objects.push({ type: e.type, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
    });
    if (!heroSet) g.hero = [Math.floor(w / 2), Math.floor(h / 2)];
    g.col[g.hero[1] * w + g.hero[0]] = 0;
    return { g: g, protect: protect, decoP: 0.04, preset: true, flags: flags };
  }

  // ---------- build ----------
  function build(areaId, seed) {
    var area = findArea(areaId);
    if (!area) throw new Error('area not found: ' + areaId);
    var layout = area.layout || (areaId === 'rogue_encampment' ? 'preset' : areaId === 'den_of_evil' ? 'cave' : 'outdoor');
    var base = (hashStr(areaId) ^ Math.imul((seed | 0) + 0x9E3779B9, 0x85EBCA6B)) >>> 0;
    var res, attempt;
    for (attempt = 0; attempt < 8; attempt++) {
      var rng = mulberry32(base + attempt * 7919);
      if (layout === 'preset') res = buildPreset(area, rng);
      else if (layout === 'cave') res = buildCave(area, rng);
      else res = buildOutdoor(area, rng);
      var g = res.g, walk = layout === 'preset' ? 0 : sealPockets(g), ok = walk >= g.w * g.h * (layout === 'cave' ? 0.2 : 0.3);
      if (layout === 'preset') ok = true;
      var dist = bfs(g, g.hero[0], g.hero[1]);
      for (var e = 0; e < g.exits.length; e++) if (dist[g.exits[e].y * g.w + g.exits[e].x] < 0) ok = false;
      if (ok) break;
    }
    if (layout === 'outdoor') {
      placeSpawns(g, rng, area, { minPacks: 0, minHero: 40, packGap: 10, pChamp: 0.12 });
      var nObj = ri(rng, 1, 3), nChest = ri(rng, 5, 8), cells = [], i;
      dist = bfs(g, g.hero[0], g.hero[1]);
      for (i = 0; i < dist.length; i++) if (dist[i] > 30) cells.push(i);
      for (i = 0; i < nObj + nChest && cells.length; i++) {
        var c = cells[Math.floor(rng() * cells.length)], cx = c % g.w, cy = (c - cx) / g.w;
        if (solid3(g, cx, cy)) g.objects.push({ type: i < nObj ? 'shrine' : 'chest', x: cx, y: cy });
      }
    } else if (layout === 'cave') {
      placeSpawns(g, rng, area, { minPacks: 6, minHero: 24, packGap: 9, pChamp: 0.2, fixed: res.fixed });
    }
    // deco không đè lên vật thể
    var prot = res.protect || new Uint8Array(g.w * g.h), k;
    for (k = 0; k < g.objects.length; k++) prot[g.objects[k].y * g.w + g.objects[k].x] = 1;
    for (k = 0; k < g.exits.length; k++) prot[g.exits[k].y * g.w + g.exits[k].x] = 1;
    prot[g.hero[1] * g.w + g.hero[0]] = 1;
    decorate(g, rng, res.decoP, prot, res.flags);
    for (k = 0; k < g.objects.length; k++) { if (!g.objects[k].w) g.objects[k].w = 1; if (!g.objects[k].h) g.objects[k].h = 1; }
    g.seed = seed;
    return g;
  }

  // ---------- ASCII ----------
  // step > 1: gộp khối step x step, ký hiệu nổi (hero, exit, quái, vật) thắng địa hình
  function ascii(g, step) {
    step = step || 1;
    var ov = {}, k, s;
    function mark(x, y, c, pr) {
      var key = Math.floor(y / step) * 100000 + Math.floor(x / step);
      if (!ov[key] || ov[key][1] < pr) ov[key] = [c, pr];
    }
    for (k = 0; k < g.objects.length; k++) mark(g.objects[k].x, g.objects[k].y, 'O', 1);
    for (k = 0; k < g.npcs.length; k++) mark(g.npcs[k].x, g.npcs[k].y, 'n', 1);
    for (k = 0; k < g.spawns.length; k++) { s = g.spawns[k]; mark(s.x, s.y, s.kind === 'unique' ? 'U' : s.kind === 'champion' ? 'C' : 'm', s.kind === 'normal' ? 2 : 3); }
    for (k = 0; k < g.exits.length; k++) mark(g.exits[k].x, g.exits[k].y, 'X', 4);
    mark(g.hero[0], g.hero[1], '@', 5);
    var lines = [];
    for (var y = 0; y < g.h; y += step) {
      var line = '';
      for (var x = 0; x < g.w; x += step) {
        var o = ov[Math.floor(y / step) * 100000 + Math.floor(x / step)];
        if (o) { line += o[0]; continue; }
        var wall = 0, water = 0, tot = 0;
        for (var dy = 0; dy < step && y + dy < g.h; dy++) for (var dx = 0; dx < step && x + dx < g.w; dx++) {
          var c = g.col[(y + dy) * g.w + x + dx]; tot++;
          if (c === 1) wall++; else if (c === 2) water++;
        }
        line += wall * 2 > tot ? '#' : water * 2 > tot ? '~' : '.';
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  var D2G = root.D2G || {};
  D2G.build = build;
  D2G.ascii = ascii;
  D2G.bfs = bfs;
  D2G.mulberry32 = mulberry32;
  D2G.NEIGHBORS = NEIGHBORS;
  D2G.CELLS_PER_D2_TILE = CELLS_PER_D2_TILE;
  root.D2G = D2G;
  if (typeof module !== 'undefined' && module.exports) module.exports = D2G;
})(typeof window !== 'undefined' ? window : globalThis);
