/* D2G: bộ sinh màn Act I của Diablo II. Hàm thuần, không đụng DOM.
 *   D2G.build(areaId, seed[, from]) -> Level   (hợp đồng: brain/plans/diablo2-d2r.md, "Hợp đồng D2G")
 * Đọc window.D2_MAPS / D2_PRESETS / D2_WORLD và window.D2DATA.areas lúc gọi, không lúc nạp.
 *
 * Phần mở rộng so với hợp đồng:
 *  - level.tileset là 'act1' (doanh trại, Blood Moor) hoặc 'act1cave' (hang): hai khoá của D2_WORLD.tilesets.
 *  - t của sàn/tường/bóng = style<<8 | seq | variant<<16. style đọc bằng (t>>8)&0xff vì style ảo >= 64 là bí danh
 *    khi hai DT1 trùng khoá; style 0 luôn là bí danh nên t == 0 luôn là ô trống.
 *  - tham số thứ ba `from` (id màn vừa đi ra): hero đứng cạnh lối ra dẫn về màn đó.
 *  - spawn.kind là mã monstats lấy từ D2DATA.areas[id].monsters ('pack' nếu không có), 'special' cho đàn phòng đặc biệt.
 *  - objects: { token: 'ds1_<id>', id: <id thô của DS1>, x, y, kind: 'ds1' }; npcs: { id: <id thô>, x, y }.
 *  - node: node js/drlg.js --dump <area> <seed> out.json
 */
(function (root) {
  'use strict';

  var SUB = 5;
  var BFS_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var NSEW = 'NSEW';
  var OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  var TOWN_SIDES = ['n', 'e', 's', 'w']; // thứ tự file TownN1, TownE1, TownS1, TownW1; chữ = phía lối ra của doanh trại

  function data() {
    var W = root.D2_WORLD, M = root.D2_MAPS, P = root.D2_PRESETS;
    if (!W || !M || !P) throw new Error('D2G: world.js / maps.js chưa nạp');
    return { W: W, M: M, P: P };
  }

  // ---------- số ngẫu nhiên ----------
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mix(a, b) {
    var h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return h >>> 0;
  }
  function hash3(a, b, c) { return mix(mix(a, b), c); }
  function Rng(seed) {
    var f = mulberry32(seed);
    this.f = f;
  }
  Rng.prototype.int = function (n) { return Math.floor(this.f() * n); };
  Rng.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };

  // Chọn biến thể theo rarity, băm theo (tx, ty) để cùng một ô luôn ra cùng một biến thể.
  function pickVariant(list, tx, ty, seed) {
    if (list.length === 1) return 0;
    var sum = 0, i;
    for (i = 0; i < list.length; i++) sum += list[i][5];
    if (sum === 0) return 0;
    var r = hash3(tx, ty, seed) % sum, acc = 0;
    for (i = 0; i < list.length; i++) {
      acc += list[i][5];
      if (r < acc) return i;
    }
    return 0;
  }

  // ---------- lưới tile đang dựng ----------
  function Canvas(tw, th) {
    this.tw = tw; this.th = th;
    this.floor = new Int32Array(tw * th);
    this.shadow = new Int32Array(tw * th);
    this.walls = [];
    this.objects = [];
    this.occ = new Uint8Array(tw * th);
  }
  Canvas.prototype.layer = function (i) {
    while (this.walls.length <= i) {
      this.walls.push({ t: new Int32Array(this.tw * this.th), o: new Uint8Array(this.tw * this.th) });
    }
    return this.walls[i];
  };
  // Chép một DS1 vào (ox, oy). Ô của stamp không có sàn, tường, bóng thì bỏ qua (lề trống không đè lên stamp kề);
  // stamp không có sàn ở ô nào thì giữ sàn cũ (cỏ).
  Canvas.prototype.stamp = function (m, ox, oy) {
    var x, y, i, di, li, f, sh, any;
    for (y = 0; y < m.h; y++) {
      var ty = oy + y;
      if (ty < 0 || ty >= this.th) continue;
      for (x = 0; x < m.w; x++) {
        var tx = ox + x;
        if (tx < 0 || tx >= this.tw) continue;
        i = y * m.w + x; di = ty * this.tw + tx;
        f = m.floors.length ? m.floors[0][i] : 0;
        sh = m.shadows.length ? m.shadows[0][i] : 0;
        any = f || sh;
        for (li = 0; li < m.walls.length && !any; li++) any = m.walls[li].t[i];
        if (!any) continue;
        if (f) this.floor[di] = f;
        this.shadow[di] = sh;
        for (li = 0; li < m.walls.length; li++) {
          var L = this.layer(li);
          L.t[di] = m.walls[li].t[i];
          L.o[di] = m.walls[li].o[i];
        }
        for (; li < this.walls.length; li++) { this.walls[li].t[di] = 0; this.walls[li].o[di] = 0; }
      }
    }
    for (i = 0; i < m.objects.length; i++) {
      var ob = m.objects[i];
      this.objects.push({ type: ob.type, id: ob.id, x: ox * SUB + ob.x, y: oy * SUB + ob.y });
    }
  };
  Canvas.prototype.mark = function (x, y, w, h, margin) {
    for (var yy = Math.max(0, y - margin); yy < Math.min(this.th, y + h + margin); yy++) {
      for (var xx = Math.max(0, x - margin); xx < Math.min(this.tw, x + w + margin); xx++) this.occ[yy * this.tw + xx] = 1;
    }
  };
  Canvas.prototype.free = function (x, y, w, h, margin) {
    if (x < 0 || y < 0 || x + w > this.tw || y + h > this.th) return false;
    for (var yy = Math.max(0, y - margin); yy < Math.min(this.th, y + h + margin); yy++) {
      for (var xx = Math.max(0, x - margin); xx < Math.min(this.tw, x + w + margin); xx++) {
        if (this.occ[yy * this.tw + xx]) return false;
      }
    }
    return true;
  };

  // Chọn biến thể cho từng ô, gộp cờ subtile thành col. Trả về Level chưa có hero/exits.
  function finish(cv, id, tilesetName, seed, D) {
    var TS = D.W.tilesets[tilesetName];
    if (!TS) throw new Error('D2G: không có tileset ' + tilesetName);
    var tiles = TS.tiles, flags = TS.flags;
    var tw = cv.tw, th = cv.th, w = tw * SUB, h = th * SUB;
    var col = new Uint8Array(w * h);
    var fl = new Uint8Array(25);
    var floors = cv.floor, shadows = cv.shadow;
    var walls = cv.walls;
    var tx, ty, i, k, li, t, list, v, row;

    function orFlags(r) {
      var f = flags[r[7]];
      for (var s = 0; s < 25; s++) fl[s] |= f[s];
    }
    for (ty = 0; ty < th; ty++) {
      for (tx = 0; tx < tw; tx++) {
        i = ty * tw + tx;
        for (k = 0; k < 25; k++) fl[k] = 0;
        var hasFloor = false;
        t = floors[i];
        if (t) {
          list = tiles['0_' + ((t >> 8) & 255) + '_' + (t & 255)];
          if (list) {
            v = pickVariant(list, tx, ty, seed);
            floors[i] = t | (v << 16);
            orFlags(list[v]);
            hasFloor = true;
          } else floors[i] = 0;
        }
        for (li = 0; li < walls.length; li++) {
          t = walls[li].t[i];
          if (!t) continue;
          var o = walls[li].o[i];
          list = tiles[o + '_' + ((t >> 8) & 255) + '_' + (t & 255)];
          if (list) {
            v = pickVariant(list, tx, ty, seed);
            walls[li].t[i] = t | (v << 16);
            orFlags(list[v]);
          } else { walls[li].t[i] = 0; walls[li].o[i] = 0; }
        }
        t = shadows[i];
        if (t) {
          list = tiles['13_' + ((t >> 8) & 255) + '_' + (t & 255)];
          if (list) {
            v = pickVariant(list, tx, ty, seed);
            shadows[i] = t | (v << 16);
            orFlags(list[v]);
          } else shadows[i] = 0;
        }
        // Subtile của DT1 xếp từ dưới lên (map_tile.go subtileLookup): hàng ly nằm ở chỉ số (4 - ly) * 5 + lx.
        for (var ly = 0; ly < SUB; ly++) {
          row = (ty * SUB + ly) * w + tx * SUB;
          for (var lx = 0; lx < SUB; lx++) {
            var b = fl[(4 - ly) * 5 + lx], c;
            if (!hasFloor) c = 1;
            else if (b & 9) c = (b & 2) ? 1 : 2; // bit0 chặn đi, bit3 chặn riêng người chơi; bit1 chặn tầm nhìn
            else c = 0;
            col[row + lx] = c;
          }
        }
      }
    }
    while (walls.length && !walls[walls.length - 1].t.some(function (x) { return x !== 0; })) walls.pop();
    var npcs = [], objects = [];
    for (i = 0; i < cv.objects.length; i++) {
      var ob = cv.objects[i];
      if (ob.x < 0 || ob.y < 0 || ob.x >= w || ob.y >= h) continue;
      if (ob.type === 1) npcs.push({ id: ob.id, x: ob.x, y: ob.y });
      else if (ob.type === 2) objects.push({ token: 'ds1_' + ob.id, id: ob.id, x: ob.x, y: ob.y, kind: 'ds1' });
    }
    return {
      id: id, tw: tw, th: th, w: w, h: h, tileset: tilesetName,
      floors: [floors], walls: walls, shadows: [shadows], col: col,
      hero: [0, 0], exits: [], spawns: [], npcs: npcs, objects: objects
    };
  }

  // ---------- đi được ----------
  function labelComponents(col, w, h) {
    var lab = new Int32Array(w * h).fill(-1);
    var sizes = [], q = new Int32Array(w * h), n = 0, i, qh, qt;
    for (i = 0; i < w * h; i++) {
      if (col[i] !== 0 || lab[i] !== -1) continue;
      qh = 0; qt = 0; q[qt++] = i; lab[i] = n;
      while (qh < qt) {
        var c = q[qh++], cx = c % w, cy = (c / w) | 0;
        for (var d = 0; d < 4; d++) {
          var nx = cx + BFS_DIRS[d][0], ny = cy + BFS_DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var ni = ny * w + nx;
          if (col[ni] === 0 && lab[ni] === -1) { lab[ni] = n; q[qt++] = ni; }
        }
      }
      sizes.push(qt);
      n++;
    }
    var best = -1;
    for (i = 0; i < sizes.length; i++) if (best < 0 || sizes[i] > sizes[best]) best = i;
    return { lab: lab, sizes: sizes, main: best };
  }

  // Ô trong thành phần chính gần (x, y) nhất; minDist bỏ qua ô quá gần (x, y).
  function nearestIn(lv, comp, x, y, minDist, maxDist) {
    var w = lv.w, best = -1, bd = Infinity;
    var r0 = Math.max(0, y - maxDist), r1 = Math.min(lv.h - 1, y + maxDist);
    var c0 = Math.max(0, x - maxDist), c1 = Math.min(w - 1, x + maxDist);
    for (var yy = r0; yy <= r1; yy++) {
      for (var xx = c0; xx <= c1; xx++) {
        if (comp.lab[yy * w + xx] !== comp.main) continue;
        var d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
        if (d < minDist * minDist || d >= bd) continue;
        bd = d; best = yy * w + xx;
      }
    }
    return best < 0 ? null : [best % w, (best / w) | 0];
  }

  // Lối ra ở mép: ô đi được sát mép `side` (n=y nhỏ, s=y lớn, w=x nhỏ, e=x lớn), lấy trung vị dọc mép.
  function edgeCell(lv, comp, side) {
    var w = lv.w, h = lv.h;
    for (var d = 0; d < 12; d++) {
      var cells = [];
      var n = (side === 'n' || side === 's') ? w : h;
      for (var k = 0; k < n; k++) {
        var x, y;
        if (side === 'n') { x = k; y = d; } else if (side === 's') { x = k; y = h - 1 - d; } else if (side === 'w') { x = d; y = k; } else { x = w - 1 - d; y = k; }
        if (comp.lab[y * w + x] === comp.main) cells.push([x, y]);
      }
      if (cells.length) return cells[cells.length >> 1];
    }
    return null;
  }

  function warpTiles(M, key) {
    var m = M[key], out = [];
    for (var li = 0; li < m.walls.length; li++) {
      var L = m.walls[li];
      for (var i = 0; i < L.t.length; i++) if (L.t[i] && (L.o[i] === 10 || L.o[i] === 11)) out.push([i % m.w, (i / m.w) | 0]);
    }
    return out;
  }

  function spawnPacks(lv, comp, rng, area, keepOut, extra) {
    var w = lv.w, h = lv.h, col = lv.col;
    var walk = comp.sizes[comp.main];
    var dens = (area && area.density) || 520;
    var count = Math.max(4, Math.min(30, Math.round(walk * dens / 2.2e6)));
    if (area && typeof area.packs === 'number') count = area.packs;
    var codes = (area && area.monsters && area.monsters.length) ? area.monsters : null;
    var cand = [], x, y, dx, dy, ok;
    for (y = 4; y < h - 4; y += 3) {
      for (x = 4; x < w - 4; x += 3) {
        if (comp.lab[y * w + x] !== comp.main) continue;
        ok = true;
        for (dy = -3; dy <= 3 && ok; dy++) for (dx = -3; dx <= 3; dx++) if (col[(y + dy) * w + x + dx] !== 0) { ok = false; break; }
        if (ok) cand.push([x, y]);
      }
    }
    for (var i = cand.length - 1; i > 0; i--) { var j = rng.int(i + 1), t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
    var out = [], placed = [];
    for (var minGap = 22; minGap >= 8 && out.length < count; minGap -= 7) {
      for (i = 0; i < cand.length && out.length < count; i++) {
        var c = cand[i];
        if (placed.indexOf(i) >= 0) continue;
        var far = true, ko;
        for (ko = 0; ko < keepOut.length; ko++) {
          var dd = (c[0] - keepOut[ko][0]) * (c[0] - keepOut[ko][0]) + (c[1] - keepOut[ko][1]) * (c[1] - keepOut[ko][1]);
          if (dd < keepOut[ko][2] * keepOut[ko][2]) { far = false; break; }
        }
        if (!far) continue;
        for (ko = 0; ko < out.length; ko++) {
          var d2 = (c[0] - out[ko].x) * (c[0] - out[ko].x) + (c[1] - out[ko].y) * (c[1] - out[ko].y);
          if (d2 < minGap * minGap) { far = false; break; }
        }
        if (!far) continue;
        placed.push(i);
        out.push({ x: c[0], y: c[1], n: 3 + rng.int(3), kind: codes ? rng.pick(codes) : 'pack' });
      }
    }
    if (extra) out = out.concat(extra);
    return out;
  }

  function areaData(id) {
    var d = root.D2DATA;
    return (d && d.areas && d.areas[id]) || null;
  }

  function townVariant(seed) { return hash3(seed, 0x70776E, 1) % 4; }

  // ---------- doanh trại ----------
  function buildTown(seed, D, from) {
    var files = D.P[1].files;
    var v = townVariant(seed);
    var m = D.M[files[v]];
    var cv = new Canvas(m.w, m.h);
    cv.stamp(m, 0, 0);
    var lv = finish(cv, 'rogue_encampment', 'act1', seed, D);
    var comp = labelComponents(lv.col, lv.w, lv.h);
    var ex = edgeCell(lv, comp, TOWN_SIDES[v]);
    if (!ex) throw new Error('D2G: doanh trại không có lối ra ở mép ' + TOWN_SIDES[v]);
    // Tâm trại: trọng tâm vùng đi được của thành phần chính, rồi ô đi được gần nhất.
    var sx = 0, sy = 0, n = 0, i;
    for (i = 0; i < comp.lab.length; i++) if (comp.lab[i] === comp.main) { sx += i % lv.w; sy += (i / lv.w) | 0; n++; }
    var hero = nearestIn(lv, comp, Math.round(sx / n), Math.round(sy / n), 0, 80);
    lv.hero = hero;
    lv.exits = [{ x: ex[0], y: ex[1], to: 'blood_moor' }];
    if (from === 'blood_moor') lv.hero = nearestIn(lv, comp, ex[0], ex[1], 12, 60) || hero;
    lv.spawns = [];
    return lv;
  }

  // ---------- Blood Moor ----------
  var BM = 80, STEP = 9; // stamp viền 9x9 ô

  function buildBloodMoor(seed, D, from, attempt) {
    var rng = new Rng(hash3(seed, 0x424D, attempt));
    var P = D.P, M = D.M;
    var grass = D.W.tilesets.act1.grass;
    var cv = new Canvas(BM, BM);
    var i, x, y;
    for (i = 0; i < BM * BM; i++) cv.floor[i] = grass;
    var townSide = OPP[TOWN_SIDES[townVariant(seed)]];

    function file(def, k) { var f = P[def].files; return M[f[k === undefined ? 0 : Math.min(k, f.length - 1)]]; }
    function put(def, k, px, py) { cv.stamp(file(def, k), px, py); }
    var last = BM - 9; // góc cuối đặt ở 71: đè lên ô cuối của stamp kề, vừa khít 80 ô
    // Lối vào từ doanh trại: bỏ một stamp viền giữa cạnh, phần cỏ lộ ra là cổng.
    var gap = 2 + rng.int(5);
    function edge(side, def, nstamps) {
      for (var k = 1; k <= nstamps; k++) {
        if (side === townSide && k === gap) continue;
        var p = k * STEP;
        if (side === 'n') put(def, rng.int(3), p, 0);
        else if (side === 's') put(def, rng.int(3), p, last);
        else if (side === 'w') put(def, rng.int(3), 0, p);
        else put(def, rng.int(3), last, p);
      }
    }
    edge('n', 6, 7); edge('s', 4, 7); edge('w', 5, 7); edge('e', 7, 7);
    put(9, 0, 0, 0); put(10, 0, last, 0); put(8, 0, 0, last); put(11, 0, last, last);
    cv.mark(0, 0, BM, 9, 0); cv.mark(0, BM - 9, BM, 9, 0); cv.mark(0, 0, 9, BM, 0); cv.mark(BM - 9, 0, 9, BM, 0);

    // Cửa Den of Evil gần giữa bản đồ, như act1_overworld.go.
    var doeKey = P[52].files[rng.int(P[52].files.length)];
    var doe = M[doeKey];
    var dx0 = 33 + rng.int(10), dy0 = 33 + rng.int(10);
    cv.stamp(doe, dx0, dy0);
    cv.mark(dx0, dy0, doe.w, doe.h, 2);

    var stuff = [];
    function addAll(def, n) { var f = P[def].files; for (var k = 0; k < (n || f.length); k++) stuff.push(f[k]); }
    addAll(29); addAll(30); addAll(47); addAll(42); addAll(46); addAll(38, 1); addAll(39);
    var placed = 0, tries = 0;
    while (placed < 22 && tries++ < 900) {
      var key = rng.pick(stuff), m = M[key];
      var px = 9 + rng.int(BM - 18 - m.w + 1), py = 9 + rng.int(BM - 18 - m.h + 1);
      if (!cv.free(px, py, m.w, m.h, 1)) continue;
      cv.stamp(m, px, py);
      cv.mark(px, py, m.w, m.h, 1);
      placed++;
    }

    var lv = finish(cv, 'blood_moor', 'act1', seed, D);
    var comp = labelComponents(lv.col, lv.w, lv.h);
    var gapCenter = gap * STEP + 4;
    var wantX, wantY;
    if (townSide === 'w') { wantX = 0; wantY = gapCenter * SUB; } else if (townSide === 'e') { wantX = lv.w - 1; wantY = gapCenter * SUB; }
    else if (townSide === 'n') { wantX = gapCenter * SUB; wantY = 0; } else { wantX = gapCenter * SUB; wantY = lv.h - 1; }
    var ex = nearestIn(lv, comp, wantX, wantY, 0, 14);
    var wp = warpTiles(M, doeKey)[0];
    if (!ex || !wp) return null;
    var dex = nearestIn(lv, comp, (dx0 + wp[0]) * SUB + 2, (dy0 + wp[1]) * SUB + 2, 0, 14);
    if (!dex) return null;
    lv.exits = [{ x: ex[0], y: ex[1], to: 'rogue_encampment' }, { x: dex[0], y: dex[1], to: 'den_of_evil' }];
    // Hero đứng trong cổng, cách mép vài subtile; về từ hang thì đứng cạnh cửa hang.
    var anchor = from === 'den_of_evil' ? dex : ex;
    lv.hero = nearestIn(lv, comp, anchor[0] + (anchor === ex ? (townSide === 'w' ? 8 : townSide === 'e' ? -8 : 0) : 0),
      anchor[1] + (anchor === ex ? (townSide === 'n' ? 8 : townSide === 's' ? -8 : 0) : 6), 0, 30);
    if (!lv.hero) return null;
    lv.spawns = spawnPacks(lv, comp, new Rng(hash3(seed, 0x53504E, attempt)), areaData('blood_moor'),
      [[lv.hero[0], lv.hero[1], 40], [ex[0], ex[1], 30], [dex[0], dex[1], 24]]);
    return { lv: lv, comp: comp };
  }

  // ---------- Den of Evil ----------
  var ROOM = 24;
  var DIR = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };

  function roomIndex(P) {
    var plain = {}, theme = {}, prev = {}, spec = {};
    Object.keys(P).forEach(function (d) {
      var p = P[d], m;
      if ((m = /^Act 1 - Cave Theme ([NSEW]+)$/.exec(p.name))) theme[m[1]] = p.files;
      else if ((m = /^Act 1 - Cave Prev ([NSEW])$/.exec(p.name))) prev[m[1]] = p.files;
      else if ((m = /^Act 1 - Cave Den Of Evil ([NSEW])$/.exec(p.name))) spec[m[1]] = p.files;
      else if ((m = /^Act 1 - Cave ([NSEW]+)$/.exec(p.name))) plain[m[1]] = p.files;
    });
    return { plain: plain, theme: theme, prev: prev, spec: spec };
  }

  // Cây các phòng trên lưới: phòng đầu và phòng đặc biệt là lá (một cửa), thêm vài vòng cho đỡ thẳng.
  function genMaze(rng) {
    for (var guard = 0; guard < 50; guard++) {
      var G = 5, target = 9 + rng.int(3);
      var cells = {}, list = [];
      function key(x, y) { return x + ',' + y; }
      var start = { x: rng.int(G), y: rng.int(G), links: {}, sealed: false };
      cells[key(start.x, start.y)] = start; list.push(start);
      var stuck = 0;
      while (list.length < target && stuck < 200) {
        var c = list[rng.int(list.length)];
        if (c.sealed) { stuck++; continue; }
        var dirs = NSEW.split('').filter(function (d) {
          var nx = c.x + DIR[d][0], ny = c.y + DIR[d][1];
          return nx >= 0 && ny >= 0 && nx < G && ny < G && !cells[key(nx, ny)];
        });
        if (!dirs.length) { stuck++; continue; }
        var d = rng.pick(dirs), nc = { x: c.x + DIR[d][0], y: c.y + DIR[d][1], links: {}, sealed: false };
        c.links[d] = nc; nc.links[opp(d)] = c;
        cells[key(nc.x, nc.y)] = nc; list.push(nc);
        if (c === start) start.sealed = true;
      }
      if (list.length < target) continue;
      list.forEach(function (c) {
        if (c.sealed) return;
        ['E', 'S'].forEach(function (d) {
          var n = cells[key(c.x + DIR[d][0], c.y + DIR[d][1])];
          if (n && !n.sealed && !c.links[d] && rng.f() < 0.3) { c.links[d] = n; n.links[opp(d)] = c; }
        });
      });
      // lá xa phòng đầu nhất làm phòng đặc biệt
      var dist = {}, queue = [start]; dist[key(start.x, start.y)] = 0;
      while (queue.length) {
        var q = queue.shift();
        Object.keys(q.links).forEach(function (dd) {
          var n = q.links[dd], k = key(n.x, n.y);
          if (dist[k] === undefined) { dist[k] = dist[key(q.x, q.y)] + 1; queue.push(n); }
        });
      }
      var spec = null;
      list.forEach(function (c) {
        if (c === start || Object.keys(c.links).length !== 1) return;
        if (!spec || dist[key(c.x, c.y)] > dist[key(spec.x, spec.y)]) spec = c;
      });
      if (!spec) continue;
      return { list: list, start: start, spec: spec };
    }
    throw new Error('D2G: không dựng được mê cung');
  }
  function opp(d) { return d === 'W' ? 'E' : d === 'E' ? 'W' : d === 'N' ? 'S' : 'N'; }
  function letters(c) { return NSEW.split('').filter(function (d) { return c.links[d]; }).join(''); }

  function buildDen(seed, D, from, attempt) {
    var rng = new Rng(hash3(seed, 0x44454E, attempt));
    var P = D.P, M = D.M;
    var idx = roomIndex(P);
    var mz = genMaze(rng);
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    mz.list.forEach(function (c) {
      minx = Math.min(minx, c.x); maxx = Math.max(maxx, c.x); miny = Math.min(miny, c.y); maxy = Math.max(maxy, c.y);
    });
    var cols = maxx - minx + 1, rows = maxy - miny + 1;
    var cv = new Canvas(cols * ROOM + 1, rows * ROOM + 1);
    var startKey = null, specKey = null, startAt = null, specAt = null;
    mz.list.forEach(function (c) {
      var lt = letters(c), files;
      if (c === mz.start) { files = idx.prev[lt]; startAt = c; }
      else if (c === mz.spec) { files = idx.spec[lt]; specAt = c; }
      else if (idx.theme[lt] && rng.f() < 0.25) files = idx.theme[lt];
      else files = idx.plain[lt];
      if (!files) throw new Error('D2G: không có phòng hang cho ' + lt);
      var key = rng.pick(files);
      if (c === mz.start) startKey = key;
      cv.stamp(M[key], (c.x - minx) * ROOM, (c.y - miny) * ROOM);
    });
    var lv = finish(cv, 'den_of_evil', 'act1cave', seed, D);
    var comp = labelComponents(lv.col, lv.w, lv.h);
    var wp = warpTiles(M, startKey)[0];
    if (!wp) return null;
    var ox = (startAt.x - minx) * ROOM, oy = (startAt.y - miny) * ROOM;
    var ex = nearestIn(lv, comp, (ox + wp[0]) * SUB + 2, (oy + wp[1]) * SUB + 2, 0, 20);
    if (!ex) return null;
    lv.exits = [{ x: ex[0], y: ex[1], to: 'blood_moor' }];
    lv.hero = nearestIn(lv, comp, ex[0], ex[1], 6, 40);
    if (!lv.hero) return null;
    var sc = nearestIn(lv, comp, ((specAt.x - minx) * ROOM + 12) * SUB + 2, ((specAt.y - miny) * ROOM + 12) * SUB + 2, 0, 60);
    var extra = sc ? [{ x: sc[0], y: sc[1], n: 6, kind: 'special' }] : [];
    lv.spawns = spawnPacks(lv, comp, new Rng(hash3(seed, 0x53504E, attempt)), areaData('den_of_evil'),
      [[lv.hero[0], lv.hero[1], 35], [ex[0], ex[1], 25]], extra);
    return { lv: lv, comp: comp };
  }

  // Mọi lối ra và đàn quái phải nằm trong thành phần chính chứa hero; không thì dựng lại với seed phụ.
  function validate(r) {
    if (!r) return false;
    var lv = r.lv, comp = r.comp, w = lv.w;
    var h = lv.hero;
    if (lv.col[h[1] * w + h[0]] !== 0 || comp.lab[h[1] * w + h[0]] !== comp.main) return false;
    for (var i = 0; i < lv.exits.length; i++) {
      var e = lv.exits[i];
      if (comp.lab[e.y * w + e.x] !== comp.main) return false;
    }
    return lv.spawns.every(function (s) { return comp.lab[s.y * w + s.x] === comp.main; });
  }

  var BUILDERS = {
    rogue_encampment: function (seed, D, from) { return { lv: buildTown(seed, D, from) }; },
    blood_moor: function (seed, D, from) {
      for (var a = 0; a < 40; a++) { var r = buildBloodMoor(seed, D, from, a); if (validate(r)) return r; }
      throw new Error('D2G: blood_moor seed ' + seed + ' không dựng được sau 40 lần');
    },
    den_of_evil: function (seed, D, from) {
      for (var a = 0; a < 40; a++) { var r = buildDen(seed, D, from, a); if (validate(r)) return r; }
      throw new Error('D2G: den_of_evil seed ' + seed + ' không dựng được sau 40 lần');
    }
  };

  var D2G = {
    areas: Object.keys(BUILDERS),
    build: function (areaId, seed, from) {
      var b = BUILDERS[areaId];
      if (!b) throw new Error('D2G: chưa hỗ trợ màn ' + areaId);
      return b(seed | 0, data(), from).lv;
    }
  };

  root.D2G = D2G;
  if (typeof module !== 'undefined' && module.exports) module.exports = D2G;

  // node js/drlg.js --dump <area> <seed> out.json
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    var fs = require('fs'), path = require('path'), vm = require('vm');
    var a = process.argv.slice(2);
    if (a[0] !== '--dump' || a.length < 4) { console.error('usage: node drlg.js --dump <area> <seed> out.json'); process.exit(2); }
    ['world.js', 'maps.js'].forEach(function (f) {
      vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'));
    });
    var lv = D2G.build(a[1], parseInt(a[2], 10));
    fs.writeFileSync(a[3], JSON.stringify(lv, function (k, v) {
      return (ArrayBuffer.isView(v)) ? Array.prototype.slice.call(v) : v;
    }));
    console.log(lv.id + ' ' + lv.tw + 'x' + lv.th + ' tiles, hero ' + lv.hero + ', exits ' + JSON.stringify(lv.exits) + ', spawns ' + lv.spawns.length);
  }
})(typeof window !== 'undefined' ? window : globalThis);
