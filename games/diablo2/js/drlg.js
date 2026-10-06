/* D2G v2: Act I level generator for the Diablo II remake. Pure functions, no DOM.
 *   D2G.build(areaId, seed[, from]) -> Level      D2G.supports(areaId) -> bool      D2G.areas -> [ids]
 * Contract: brain/plans/diablo2-d2r.md ("Hop dong D2G", "Hop dong v2", "Ma khu").
 * Reads asset groups at call time from root.D2_GROUPS ('m/maps_act1', 'm/world_act1', filled by D2_REG)
 * and links / monsters / density from root.D2DATA.areas.
 *
 * Generation follows the D2 DRLG kinds of levels.txt:
 *  - preset (DrlgType 2): one LvlPrest DS1 (town, monastery gate, cloisters, cathedral, Andariel's lair, ...)
 *  - maze (DrlgType 1): grid of LvlPrest room DS1s; LvlMaze gives room count and size; the door letters
 *    (N S E W) of each room match its neighbours; Prev / Next / Down / special rooms are leaves.
 *  - outdoor (DrlgType 3): 80x80 grass with Wild Border stamps on the edges, a gap per walking link,
 *    entrance stamps for the cave / tower links, special presets (Cairn stones, Inifuss tree, ...) and fills.
 * Exits: warp marker tiles of the DS1s (raw style = Vis index of levels.txt) plus walking links on edges.
 *
 * Level extras beyond the contract: tileset names a key of the world group's tilesets; floor / wall / shadow
 * values are style<<8 | seq | variant<<16 (style read as (t>>8)&0xff); objects carry kind 'waypoint' or 'ds1'.
 */
(function (root) {
  'use strict';

  var SUB = 5;
  var OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  var SIDES = ['n', 'e', 's', 'w'];
  var BFS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var LETTER = { N: 'n', S: 's', E: 'e', W: 'w' };
  var DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

  // ---------------------------------------------------------------- data access
  function group(name) {
    var g = root.D2_GROUPS && root.D2_GROUPS[name];
    if (!g) throw new Error('D2G: asset group ' + name + ' not loaded');
    return g;
  }
  var ctxCache = null;
  function ctx() {
    var M = group('m/maps_act1'), W = group('m/world_act1');
    if (ctxCache && ctxCache.M === M && ctxCache.W === W && ctxCache.D === root.D2DATA) return ctxCache;
    var c = { M: M, W: W, D: root.D2DATA, byId: {}, byD2: {}, presetOf: {}, rooms: null, wp: {} };
    Object.keys(M.levels).forEach(function (k) {
      var L = M.levels[k], id = snake(L.levelName || L.name);
      c.byId[id] = +k; c.byD2[+k] = id;
    });
    // area ids of D2DATA win over the levels.txt names (moo_moo_farm is the_secret_cow_level there)
    var A = root.D2DATA && root.D2DATA.areas;
    if (A) Object.keys(A).forEach(function (id) {
      var a = A[id];
      if (a.act === 1 && M.levels[a.d2id]) { delete c.byId[c.byD2[a.d2id]]; c.byId[id] = a.d2id; c.byD2[a.d2id] = id; }
    });
    Object.keys(M.presets).forEach(function (d) {
      var p = M.presets[d];
      if (p.levelId && !c.presetOf[p.levelId]) c.presetOf[p.levelId] = +d;
    });
    (M.waypointObjs || []).forEach(function (i) { c.wp[i] = 1; });
    ctxCache = c;
    return c;
  }
  function snake(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
  function areaData(id) { var d = root.D2DATA; return (d && d.areas && d.areas[id]) || null; }

  // ---------------------------------------------------------------- random
  function mix(a, b) {
    var h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return h >>> 0;
  }
  function hash3(a, b, c) { return mix(mix(a, b), c); }
  function strHash(s) { var h = 0x811C9DC5; for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; }
  function Rng(seed) {
    var a = seed >>> 0;
    this.f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Rng.prototype.int = function (n) { return Math.floor(this.f() * n); };
  Rng.prototype.pick = function (a) { return a[this.int(a.length)]; };
  Rng.prototype.shuffle = function (a) {
    for (var i = a.length - 1; i > 0; i--) { var j = this.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };

  function pickVariant(list, tx, ty, seed) {
    if (list.length === 1) return 0;
    var sum = 0, i;
    for (i = 0; i < list.length; i++) sum += list[i][5];
    if (sum === 0) return 0;
    var r = hash3(tx, ty, seed) % sum, acc = 0;
    for (i = 0; i < list.length; i++) { acc += list[i][5]; if (r < acc) return i; }
    return 0;
  }

  // ---------------------------------------------------------------- tile canvas
  function Canvas(tw, th) {
    this.tw = tw; this.th = th;
    this.floors = [new Int32Array(tw * th)];
    this.shadow = new Int32Array(tw * th);
    this.walls = [];
    this.objects = [];
    this.warps = [];     // [subX, subY, rawStyle]
    this.occ = new Uint8Array(tw * th);
    this.ts = null;
  }
  Canvas.prototype.layer = function (arr, i, mk) {
    while (arr.length <= i) arr.push(mk());
    return arr[i];
  };
  // Copy a DS1 at tile (ox, oy). Cells where the stamp has no floor, wall or shadow are skipped (margins
  // must not erase a neighbour); a stamp cell without floor keeps the floor below (grass).
  Canvas.prototype.stamp = function (m, ox, oy, rect) {
    var self = this, tw = this.tw, n = tw * this.th;
    if (this.ts && m.ts !== this.ts) throw new Error('D2G: stamp from tileset ' + m.ts + ' on ' + this.ts);
    this.ts = m.ts;
    var x0 = rect ? rect[0] : 0, y0 = rect ? rect[1] : 0, x1 = rect ? rect[0] + rect[2] : m.w, y1 = rect ? rect[1] + rect[3] : m.h;
    var mkW = function () { return { t: new Int32Array(n), o: new Uint8Array(n) }; };
    var mkF = function () { return new Int32Array(n); };
    for (var y = y0; y < y1; y++) {
      var ty = oy + y - y0;
      if (ty < 0 || ty >= this.th) continue;
      for (var x = x0; x < x1; x++) {
        var tx = ox + x - x0;
        if (tx < 0 || tx >= tw) continue;
        var i = y * m.w + x, di = ty * tw + tx, li, f = 0, any;
        for (li = 0; li < m.floors.length; li++) f = f || m.floors[li][i];
        any = f || (m.shadows.length && m.shadows[0][i]);
        for (li = 0; li < m.walls.length && !any; li++) any = m.walls[li].t[i];
        if (!any) continue;
        if (f) {
          for (li = 0; li < m.floors.length; li++) this.layer(this.floors, li, mkF)[di] = m.floors[li][i];
          for (; li < this.floors.length; li++) this.floors[li][di] = 0;
        }
        this.shadow[di] = m.shadows.length ? m.shadows[0][i] : 0;
        for (li = 0; li < m.walls.length; li++) {
          var L = this.layer(this.walls, li, mkW);
          L.t[di] = m.walls[li].t[i]; L.o[di] = m.walls[li].o[i];
        }
        for (; li < this.walls.length; li++) { this.walls[li].t[di] = 0; this.walls[li].o[di] = 0; }
      }
    }
    var sx = (ox - x0) * SUB, sy = (oy - y0) * SUB;
    (m.objects || []).forEach(function (ob) {
      var lx = ob.x / SUB, ly = ob.y / SUB;
      if (lx < x0 || ly < y0 || lx >= x1 || ly >= y1) return;
      self.objects.push({ type: ob.type, id: ob.id, x: sx + ob.x, y: sy + ob.y });
    });
    (m.warps || []).forEach(function (w) {
      if (w[0] < x0 || w[1] < y0 || w[0] >= x1 || w[1] >= y1) return;
      self.warps.push([(ox + w[0] - x0) * SUB + 2, (oy + w[1] - y0) * SUB + 2, w[2]]);
    });
  };
  Canvas.prototype.mark = function (x, y, w, h, margin) {
    for (var yy = Math.max(0, y - margin); yy < Math.min(this.th, y + h + margin); yy++) {
      for (var xx = Math.max(0, x - margin); xx < Math.min(this.tw, x + w + margin); xx++) this.occ[yy * this.tw + xx] = 1;
    }
  };
  Canvas.prototype.free = function (x, y, w, h, margin) {
    if (x < 0 || y < 0 || x + w > this.tw || y + h > this.th) return false;
    for (var yy = Math.max(0, y - margin); yy < Math.min(this.th, y + h + margin); yy++) {
      for (var xx = Math.max(0, x - margin); xx < Math.min(this.tw, x + w + margin); xx++) if (this.occ[yy * this.tw + xx]) return false;
    }
    return true;
  };

  // Pick tile variants, OR the subtile flags of every layer into col. Returns a Level without hero / exits.
  function finish(cv, id, seed, C) {
    var tsName = cv.ts, TS = C.W.tilesets[tsName];
    if (!TS) throw new Error('D2G: tileset ' + tsName + ' missing from m/world_act1');
    var tiles = TS.tiles, flags = TS.flags;
    var tw = cv.tw, th = cv.th, w = tw * SUB, h = th * SUB;
    var col = new Uint8Array(w * h), fl = new Uint8Array(25);
    var floors = cv.floors, shadows = cv.shadow, walls = cv.walls;
    function pick(arr, i, o, tx, ty) {
      var t = arr[i];
      var list = tiles[o + '_' + ((t >> 8) & 255) + '_' + (t & 255)];
      if (!list) { arr[i] = 0; return false; }
      var v = pickVariant(list, tx, ty, seed);
      arr[i] = t | (v << 16);
      var f = flags[list[v][7]];
      for (var s = 0; s < 25; s++) fl[s] |= f[s];
      return true;
    }
    for (var ty = 0; ty < th; ty++) {
      for (var tx = 0; tx < tw; tx++) {
        var i = ty * tw + tx, k, li, hasFloor = false;
        for (k = 0; k < 25; k++) fl[k] = 0;
        for (li = 0; li < floors.length; li++) if (floors[li][i] && pick(floors[li], i, 0, tx, ty)) hasFloor = true;
        for (li = 0; li < walls.length; li++) {
          if (!walls[li].t[i]) continue;
          if (!pick(walls[li].t, i, walls[li].o[i], tx, ty)) walls[li].o[i] = 0;
        }
        if (shadows[i]) pick(shadows, i, 13, tx, ty);
        // DT1 subtiles run bottom-up (map_tile.go subtileLookup): row ly is at index (4 - ly) * 5 + lx
        for (var ly = 0; ly < SUB; ly++) {
          var row = (ty * SUB + ly) * w + tx * SUB;
          for (var lx = 0; lx < SUB; lx++) {
            var b = fl[(4 - ly) * 5 + lx];
            col[row + lx] = !hasFloor ? 1 : (b & 9) ? ((b & 2) ? 1 : 2) : 0;
          }
        }
      }
    }
    walls = walls.filter(function (L) { for (var j = 0; j < L.t.length; j++) if (L.t[j]) return true; return false; });
    floors = floors.filter(function (L, j) { if (j === 0) return true; for (var q = 0; q < L.length; q++) if (L[q]) return true; return false; });
    var npcs = [], objects = [];
    cv.objects.forEach(function (ob) {
      if (ob.x < 0 || ob.y < 0 || ob.x >= w || ob.y >= h) return;
      if (ob.type === 1) npcs.push({ id: ob.id, x: ob.x, y: ob.y });
      else if (ob.type === 2) {
        objects.push({ token: 'ds1_' + ob.id, id: ob.id, x: ob.x, y: ob.y, kind: C.wp[ob.id] ? 'waypoint' : 'ds1' });
      }
    });
    return {
      id: id, tw: tw, th: th, w: w, h: h, tileset: tsName,
      floors: floors, walls: walls, shadows: [shadows], col: col,
      hero: [0, 0], exits: [], spawns: [], npcs: npcs, objects: objects
    };
  }

  // ---------------------------------------------------------------- walkability helpers
  function components(col, w, h) {
    var lab = new Int32Array(w * h).fill(-1), sizes = [], q = new Int32Array(w * h), n = 0;
    for (var i = 0; i < w * h; i++) {
      if (col[i] !== 0 || lab[i] !== -1) continue;
      var qh = 0, qt = 0; q[qt++] = i; lab[i] = n;
      while (qh < qt) {
        var c = q[qh++], cx = c % w, cy = (c / w) | 0;
        for (var d = 0; d < 4; d++) {
          var nx = cx + BFS4[d][0], ny = cy + BFS4[d][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var ni = ny * w + nx;
          if (col[ni] === 0 && lab[ni] === -1) { lab[ni] = n; q[qt++] = ni; }
        }
      }
      sizes.push(qt); n++;
    }
    var best = -1;
    for (i = 0; i < sizes.length; i++) if (best < 0 || sizes[i] > sizes[best]) best = i;
    return { lab: lab, sizes: sizes, main: best };
  }
  function nearestIn(lv, comp, x, y, minDist, maxDist) {
    var w = lv.w, best = -1, bd = Infinity;
    x = Math.round(x); y = Math.round(y);
    for (var yy = Math.max(0, y - maxDist); yy <= Math.min(lv.h - 1, y + maxDist); yy++) {
      for (var xx = Math.max(0, x - maxDist); xx <= Math.min(w - 1, x + maxDist); xx++) {
        if (comp.lab[yy * w + xx] !== comp.main) continue;
        var d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
        if (d < minDist * minDist || d >= bd) continue;
        bd = d; best = yy * w + xx;
      }
    }
    return best < 0 ? null : [best % w, (best / w) | 0];
  }
  // Walkable main-component cell nearest the `side` edge, inside the band [a, b) along that edge (subtiles).
  function edgeCell(lv, comp, side, a, b, depth) {
    var w = lv.w, h = lv.h, n = (side === 'n' || side === 's') ? w : h;
    a = Math.max(0, a || 0); b = Math.min(n, b || n);
    for (var d = 0; d < (depth || 40); d++) {
      var cells = [];
      for (var k = a; k < b; k++) {
        var x = side === 'n' || side === 's' ? k : side === 'w' ? d : w - 1 - d;
        var y = side === 'w' || side === 'e' ? k : side === 'n' ? d : h - 1 - d;
        if (comp.lab[y * w + x] === comp.main) cells.push([x, y]);
      }
      if (cells.length) return cells[cells.length >> 1];
    }
    return null;
  }
  function centroid(lv, comp) {
    var sx = 0, sy = 0, n = 0;
    for (var i = 0; i < comp.lab.length; i++) if (comp.lab[i] === comp.main) { sx += i % lv.w; sy += (i / lv.w) | 0; n++; }
    return nearestIn(lv, comp, sx / n, sy / n, 0, Math.max(lv.w, lv.h));
  }

  function spawnPacks(lv, comp, rng, id, keepOut, extra) {
    var area = areaData(id), w = lv.w, h = lv.h, col = lv.col;
    var walk = comp.sizes[comp.main];
    var dens = (area && area.density) || 520;
    var count = Math.max(3, Math.min(40, Math.round(walk * dens / 2.2e6)));
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
    rng.shuffle(cand);
    var out = [];
    for (var gap = 22; gap >= 8 && out.length < count; gap -= 7) {
      for (var i = 0; i < cand.length && out.length < count; i++) {
        var c = cand[i], far = true, k;
        if (c.used) continue;
        for (k = 0; k < keepOut.length && far; k++) {
          var e = keepOut[k];
          if ((c[0] - e[0]) * (c[0] - e[0]) + (c[1] - e[1]) * (c[1] - e[1]) < e[2] * e[2]) far = false;
        }
        for (k = 0; k < out.length && far; k++) {
          if ((c[0] - out[k].x) * (c[0] - out[k].x) + (c[1] - out[k].y) * (c[1] - out[k].y) < gap * gap) far = false;
        }
        if (!far) continue;
        c.used = true;
        out.push({ x: c[0], y: c[1], n: 3 + rng.int(3), kind: codes ? rng.pick(codes) : 'pack' });
      }
    }
    return extra ? out.concat(extra) : out;
  }

  // ---------------------------------------------------------------- links
  // Every link of the area: { to, warp: Vis index or -1 }. links come from D2DATA (incl. the walking
  // connections D2 hard-codes); Vis/Warp of levels.txt says which of them are warps.
  function linksOf(id, C) {
    var d2 = C.byId[id], L = C.M.levels[d2], out = [], seen = {};
    var a = areaData(id), names = a && a.links;
    // without D2DATA links only the Vis columns of levels.txt are known
    if (!names) names = L.vis.filter(function (v) { return v > 0 && C.byD2[v]; }).map(function (v) { return C.byD2[v]; });
    names = names.map(function (x) { return typeof x === 'string' ? x : (x.to || x.id); });
    names.forEach(function (to) {
      if (seen[to] || !C.byId[to]) return;
      seen[to] = 1;
      var k = L.vis.indexOf(C.byId[to]), warp = -1;
      if (k >= 0 && L.warp[k] >= 0) warp = k;
      var back = C.M.levels[C.byId[to]];
      var kb = back ? back.vis.indexOf(d2) : -1;
      var viaWarp = warp >= 0 || (kb >= 0 && back.warp[kb] >= 0);
      var portal = !viaWarp && (PORTAL[to] || PORTAL[id]);
      out.push({ to: to, vis: k, warp: warp, walk: !viaWarp && !portal, portal: !!portal });
    });
    return out;
  }

  // Reached through a town portal / the Cairn stones, not by walking (D2 hard-codes these too).
  var PORTAL = { tristram: 1, the_secret_cow_level: 1, moo_moo_farm: 1 };

  // Sides of the walking links, consistent between both ends (A's side to B is the opposite of B's side
  // to A) wherever the presets allow. Laid out once per seed by a walk from the town.
  var FIXED = {
    monastery_gate: { outer_cloister: 'n', tamoe_highland: 's' },
    outer_cloister: { monastery_gate: 's' },
    inner_cloister: { cathedral: 'n' },
    cathedral: { inner_cloister: 's' }
  };
  var TOWN_SIDES = ['n', 'e', 's', 'w'];   // TownN1, TownE1, TownS1, TownW1: side of the camp's exit
  var COURT_SIDES = ['w', 'n', 'e'];       // CourtW, CourtN, CourtE: side of the barracks door
  function townVariant(seed) { return hash3(seed, 0x70776E, 1) % 4; }
  function courtVariant(seed) { return hash3(seed, 0x636F7572, 2) % 3; }

  var layoutCache = {};
  function sideLayout(seed, C) {
    var key = seed + ':' + (root.D2DATA ? 1 : 0);
    if (layoutCache[key]) return layoutCache[key];
    var rng = new Rng(hash3(seed, 0x4C41594F, 3));
    var sides = {};
    function set(a, b, s) { (sides[a] || (sides[a] = {}))[b] = s; }
    function used(a) { var u = {}; Object.keys(sides[a] || {}).forEach(function (b) { u[sides[a][b]] = 1; }); return u; }
    Object.keys(FIXED).forEach(function (a) { Object.keys(FIXED[a]).forEach(function (b) { set(a, b, FIXED[a][b]); }); });
    set('rogue_encampment', 'blood_moor', TOWN_SIDES[townVariant(seed)]);
    set('outer_cloister', 'barracks', COURT_SIDES[courtVariant(seed)]);
    set('barracks', 'outer_cloister', OPP[COURT_SIDES[courtVariant(seed)]]);
    var queue = ['rogue_encampment'], seen = { rogue_encampment: 1 }, entry = {};
    while (queue.length) {
      var a = queue.shift();
      linksOf(a, C).forEach(function (l) {
        if (!l.walk) return;
        var b = l.to;
        if (!(sides[a] && sides[a][b])) {
          var back = sides[b] && sides[b][a];
          if (back && !used(a)[OPP[back]]) set(a, b, OPP[back]);
          else {
            var u = used(a), pref = entry[a] ? [OPP[entry[a]]] : [];
            var free = SIDES.filter(function (s) { return !u[s]; });
            var choice = pref.filter(function (s) { return !u[s]; })[0];
            if (!choice || rng.f() < 0.4) choice = free.length ? rng.pick(free) : rng.pick(SIDES);
            set(a, b, choice);
          }
        }
        if (!(sides[b] && sides[b][a])) {
          var want = OPP[sides[a][b]], ub = used(b);
          if (ub[want]) { var fb = SIDES.filter(function (s) { return !ub[s]; }); want = fb.length ? rng.pick(fb) : want; }
          set(b, a, want);
        }
        if (!seen[b]) { seen[b] = 1; entry[b] = sides[b][a]; queue.push(b); }
      });
    }
    layoutCache[key] = sides;
    return sides;
  }
  function sideOf(seed, C, a, b) {
    var s = sideLayout(seed, C);
    return (s[a] && s[a][b]) || 's';
  }

  // Exits from warp tiles: cluster by raw style, each style s < 8 leads to levels.txt Vis[s].
  function warpExits(lv, comp, cv, d2, C) {
    var L = C.M.levels[d2], by = {}, out = [];
    cv.warps.forEach(function (w) { if (w[2] < 8) (by[w[2]] || (by[w[2]] = [])).push(w); });
    Object.keys(by).forEach(function (s) {
      var to = C.byD2[L.vis[+s]];
      if (!to) return;
      // one exit per separate cluster of the same style (a maze can hold the same room kind once)
      var ws = by[s], x = 0, y = 0;
      ws.forEach(function (w) { x += w[0]; y += w[1]; });
      var p = nearestIn(lv, comp, x / ws.length, y / ws.length, 0, 25);
      if (p) out.push({ x: p[0], y: p[1], to: to, vis: +s });
    });
    return out;
  }

  // hero next to the exit back to `from`, otherwise next to the first exit, otherwise in the middle
  function placeHero(lv, comp, from, fallback) {
    var e = null, i;
    for (i = 0; i < lv.exits.length; i++) if (lv.exits[i].to === from) e = lv.exits[i];
    if (!e && !fallback) {
      // no `from`: stand at the exit to the first linked area (the way in from the camp side)
      var A = areaData(lv.id), order = (A && A.links) || [], best = Infinity;
      for (i = 0; i < lv.exits.length; i++) {
        var k = order.indexOf(lv.exits[i].to);
        if (k < 0) k = 99 + i;
        if (k < best) { best = k; e = lv.exits[i]; }
      }
    }
    var p = e ? (nearestIn(lv, comp, e.x, e.y, 7, 30) || nearestIn(lv, comp, e.x, e.y, 3, 30)) : null;
    return p || fallback || centroid(lv, comp);
  }

  function validate(lv, comp) {
    if (!lv) return false;
    var w = lv.w, ok = function (x, y) { return comp.lab[y * w + x] === comp.main; };
    if (!ok(lv.hero[0], lv.hero[1])) return false;
    for (var i = 0; i < lv.exits.length; i++) if (!ok(lv.exits[i].x, lv.exits[i].y)) return false;
    for (i = 0; i < lv.spawns.length; i++) if (!ok(lv.spawns[i].x, lv.spawns[i].y)) return false;
    return true;
  }

  // Walking-link exits on the edges of a preset / maze level.
  function edgeExits(lv, comp, id, seed, C, band) {
    var out = [];
    linksOf(id, C).forEach(function (l) {
      if (!l.walk) return;
      var side = sideOf(seed, C, id, l.to);
      var b = band && band[l.to];
      var p = b ? edgeCell(lv, comp, side, b[0], b[1], b[2]) : edgeCell(lv, comp, side);
      if (p) out.push({ x: p[0], y: p[1], to: l.to });
      else out.push(null);
    });
    return out;
  }

  function wpCheck(lv, d2, C) {
    if (!C.M.levels[d2].waypoint) return true;
    return lv.objects.some(function (o) { return o.kind === 'waypoint'; });
  }

  // ---------------------------------------------------------------- presets
  function buildPreset(id, seed, from, attempt, C) {
    var d2 = C.byId[id], def = C.presetOf[d2], P = C.M.presets[def];
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    var k;
    if (def === 1) k = townVariant(seed);
    else if (id === 'outer_cloister') k = courtVariant(seed);
    else k = rng.int(P.files.length);
    var m = C.M.maps[P.files[k]];
    var cv = new Canvas(m.w, m.h);
    cv.stamp(m, 0, 0);
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    var ex = edgeExits(lv, comp, id, seed, C);
    if (ex.indexOf(null) >= 0) return null;
    lv.exits = warpExits(lv, comp, cv, d2, C).concat(ex);
    // portal links (Tristram back to the Cairn stones): at the DS1's entry marker (warp style >= 8)
    var entryW = cv.warps.filter(function (w) { return w[2] >= 8; })[0];
    var linksP = linksOf(id, C);
    for (var li = 0; li < linksP.length; li++) {
      if (!linksP[li].portal || !kindOf(linksP[li].to, C) || id === 'rogue_encampment') continue;
      var pp = entryW ? nearestIn(lv, comp, entryW[0], entryW[1], 0, 30) : centroid(lv, comp);
      if (!pp) return null;
      lv.exits.push({ x: pp[0], y: pp[1], to: linksP[li].to });
    }
    var mid = (id === 'rogue_encampment' || id === 'tristram') ? centroid(lv, comp) : null;
    lv.hero = placeHero(lv, comp, from, from ? null : mid);
    if (!lv.hero) return null;
    lv.spawns = id === 'rogue_encampment' ? [] : spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 30]].concat(lv.exits.map(function (e) { return [e.x, e.y, 20]; })));
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- mazes
  // Room DS1s of a maze LvlType, by qualifier ('' = plain) and door letters.
  var MAZE_PREFIX = { 3: 'Cave', 4: 'Crypt', 7: 'Barracks', 8: 'Jail', 10: 'Catacombs' };
  // Special rooms per level (D2 hard-codes these in DRLGMAZE): entry first, then leaves.
  var MAZE_SPECIAL = {
    den_of_evil: ['Prev', 'Den Of Evil'],
    cave_level_1: ['Prev', 'Down', 'Coldcrow'],
    underground_passage_level_1: ['Prev', 'Next', 'Down'],
    hole_level_1: ['Prev', 'Down'],
    pit_level_1: ['Prev', 'Down'],
    crypt: ['Prev', 'Bonebreak'],
    mausoleum: ['Prev', 'Chest'],
    tower_cellar_level_1: ['Prev', 'Next'],
    tower_cellar_level_2: ['Prev', 'Next'],
    tower_cellar_level_3: ['Prev', 'Next'],
    tower_cellar_level_4: ['Prev', 'Next'],
    barracks: ['Court Connect', 'Next', 'Forge'],
    jail_level_1: ['Prev', 'Next', 'Waypoint'],
    jail_level_2: ['Prev', 'Next', 'Pitspawn'],
    jail_level_3: ['Prev', 'Cath'],
    catacombs_level_1: ['Prev', 'Next'],
    catacombs_level_2: ['Prev', 'Next', 'Waypoint'],
    catacombs_level_3: ['Prev', 'Next']
  };
  function roomIndex(C) {
    if (C.rooms) return C.rooms;
    var R = {};
    Object.keys(C.M.presets).forEach(function (d) {
      var p = C.M.presets[d];
      var m = /^Act 1 - (Cave|Crypt|Barracks|Jail|Catacombs) (.*)$/.exec(p.name);
      if (!m || p.levelId) return;
      var rest = m[2], lm = /^(?:(.*) )?([NSEW]+)$/.exec(rest), q, letters;
      if (lm) { q = lm[1] || ''; letters = lm[2]; } else { q = rest; letters = '*'; }
      var t = R[m[1]] || (R[m[1]] = {});
      (t[q] || (t[q] = {}))[letters] = p.files;
    });
    C.rooms = R;
    return R;
  }
  function lettersOf(links) { return ['N', 'S', 'E', 'W'].filter(function (L) { return links[LETTER[L]]; }).join(''); }
  function canon(letters) { return ['N', 'S', 'E', 'W'].filter(function (L) { return letters.indexOf(L) >= 0; }).join(''); }

  // Court Connect rooms open towards the courtyard on one side and towards the maze on one side.
  // CourtWb / CourtNb / CourtEb pair with CourtW / CourtN / CourtE; the maze door is measured once.
  function courtConnectDoor(C, key, seed) {
    C.ccDoor = C.ccDoor || {};
    if (C.ccDoor[key]) return C.ccDoor[key];
    var m = C.M.maps[key], cv = new Canvas(m.w, m.h);
    cv.stamp(m, 0, 0);
    var lv = finish(cv, 'probe', seed, C), res = {};
    SIDES.forEach(function (s) {
      var n = 0, len = (s === 'n' || s === 's') ? lv.w : lv.h;
      for (var k = 2; k < len - 2; k++) {
        var x = s === 'n' || s === 's' ? k : s === 'w' ? 1 : lv.w - 2;
        var y = s === 'w' || s === 'e' ? k : s === 'n' ? 1 : lv.h - 2;
        if (lv.col[y * lv.w + x] === 0) n++;
      }
      res[s] = n;
    });
    C.ccDoor[key] = res;
    return res;
  }

  function genMaze(rng, GW, GH, total, entry, leaves, merge) {
    for (var guard = 0; guard < 80; guard++) {
      var cells = {}, list = [];
      var key = function (x, y) { return x + ',' + y; };
      var sx = entry.need.length > 1 ? 1 + rng.int(Math.max(1, GW - 2)) : rng.int(GW);
      var sy = entry.need.length > 1 ? 1 + rng.int(Math.max(1, GH - 2)) : rng.int(GH);
      var start = { x: sx, y: sy, links: {}, sealed: entry.need.length > 0, kind: entry.kind };
      cells[key(sx, sy)] = start; list.push(start);
      var bad = false;
      entry.need.forEach(function (s) {
        var nx = sx + DIR[s][0], ny = sy + DIR[s][1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) { bad = true; return; }
        var c = { x: nx, y: ny, links: {}, sealed: false };
        start.links[s] = c; c.links[OPP[s]] = start;
        cells[key(nx, ny)] = c; list.push(c);
      });
      if (bad) continue;
      var stuck = 0;
      while (list.length < total && stuck < 400) {
        var c0 = list[rng.int(list.length)];
        if (c0.sealed) { stuck++; continue; }
        var dirs = SIDES.filter(function (d) {
          var nx = c0.x + DIR[d][0], ny = c0.y + DIR[d][1];
          return nx >= 0 && ny >= 0 && nx < GW && ny < GH && !cells[key(nx, ny)];
        });
        if (!dirs.length) { stuck++; continue; }
        var d = rng.pick(dirs), nc = { x: c0.x + DIR[d][0], y: c0.y + DIR[d][1], links: {}, sealed: false };
        c0.links[d] = nc; nc.links[OPP[d]] = c0;
        cells[key(nc.x, nc.y)] = nc; list.push(nc);
        if (c0 === start) start.sealed = true;
      }
      if (list.length < total) continue;
      // leaves for the special rooms, farthest from the entry first
      var dist = {}, q = [start];
      dist[key(sx, sy)] = 0;
      while (q.length) {
        var a = q.shift();
        Object.keys(a.links).forEach(function (s) {
          var b = a.links[s], kb = key(b.x, b.y);
          if (dist[kb] === undefined) { dist[kb] = dist[key(a.x, a.y)] + 1; q.push(b); }
        });
      }
      var cand = list.filter(function (c) { return c !== start && Object.keys(c.links).length === 1; });
      if (cand.length < leaves.length) continue;
      cand.sort(function (a, b) { return dist[key(b.x, b.y)] - dist[key(a.x, a.y)] || (rng.f() - 0.5); });
      // spread: alternate far / random so Next and Down do not always sit side by side
      var chosen = [];
      leaves.forEach(function (lf, i) {
        var pool = cand.filter(function (c) { return chosen.indexOf(c) < 0; });
        chosen.push(i === 0 ? pool[0] : rng.pick(pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)))));
      });
      chosen.forEach(function (c, i) { c.kind = leaves[i]; c.sealed = true; });
      // extra loops between plain rooms (LvlMaze Merge is out of 1000)
      list.forEach(function (c) {
        if (c.sealed) return;
        ['e', 's'].forEach(function (d) {
          var n = cells[key(c.x + DIR[d][0], c.y + DIR[d][1])];
          if (n && !n.sealed && !c.links[d] && rng.f() < merge / 2000) { c.links[d] = n; n.links[OPP[d]] = c; }
        });
      });
      return { list: list, start: start };
    }
    return null;
  }

  function buildMaze(id, seed, from, attempt, C) {
    var d2 = C.byId[id], L = C.M.levels[d2], Z = C.M.mazes[d2];
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    var R = roomIndex(C)[MAZE_PREFIX[L.levelType]];
    var rw = Z.size[0], rh = Z.size[1];
    var spec = MAZE_SPECIAL[id];
    var entryName = spec[0], entry;
    if (entryName === 'Court Connect') {
      var side = OPP[COURT_SIDES[courtVariant(seed)]];   // barracks side of the courtyard door, seen from the barracks
      entry = { kind: entryName, need: [], courtSide: side };
    } else if (R['Prev'] && !R['Prev'].W && R['Prev'].EW) {
      // catacombs: the Prev rooms are corridors (EW / NS) or the 4-way exit room of level 1
      var opts = R['Prev'].NSEW && id === 'catacombs_level_1' ? ['NSEW'] : ['EW', 'NS'];
      var lt = rng.pick(opts);
      entry = { kind: 'Prev', need: lt.split('').map(function (c) { return LETTER[c]; }), letters: lt };
    } else entry = { kind: entryName, need: [] };
    var leaves = spec.slice(1);
    var total = Z.rooms[0] + spec.length;
    var GW = Math.max(3, Math.min(10, Math.floor(L.size[0] / rw))), GH = Math.max(3, Math.min(10, Math.floor(L.size[1] / rh)));
    var mz = genMaze(rng, GW, GH, total, entry, leaves, Z.merge);
    if (!mz) return null;
    // Court Connect: one maze door, chosen from the measured open sides that are not the courtyard side
    var ccKey = null;
    if (entry.kind === 'Court Connect') {
      var files = R['Court Connect']['*'];
      ccKey = files[courtVariant(seed)];
    }
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    mz.list.forEach(function (c) { minx = Math.min(minx, c.x); maxx = Math.max(maxx, c.x); miny = Math.min(miny, c.y); maxy = Math.max(maxy, c.y); });
    // one spare tile row / column on every side so the outer walls are complete
    var cv = new Canvas((maxx - minx + 1) * rw + 1, (maxy - miny + 1) * rh + 1);
    var placed = [];
    for (var i = 0; i < mz.list.length; i++) {
      var c = mz.list[i], lt2 = lettersOf(c.links), files2 = null, k = c.kind;
      if (k === 'Court Connect') files2 = [ccKey];
      else if (k === 'Prev' && entry.letters) files2 = R['Prev'][entry.letters];
      else if (k) files2 = R[k] && R[k][lt2];
      else if (R['Theme'] && R['Theme'][lt2] && rng.f() < 0.2) files2 = R['Theme'][lt2];
      else files2 = R[''][lt2];
      if (!files2 && k) return null;   // special room missing for this door: retry with another layout
      if (!files2) throw new Error('D2G: ' + id + ' has no room for doors ' + lt2);
      var key2 = rng.pick(files2);
      cv.stamp(C.M.maps[key2], (c.x - minx) * rw, (c.y - miny) * rh);
      placed.push({ c: c, key: key2 });
    }
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    lv.exits = warpExits(lv, comp, cv, d2, C);
    if (entry.kind === 'Court Connect') {
      var sc = mz.start, ox = (sc.x - minx) * rw * SUB, oy = (sc.y - miny) * rh * SUB;
      // walk link to the courtyard: the walkable edge cell of the Court Connect room farthest from the maze
      var best = null, bd = -1, W2 = rw * SUB, H2 = rh * SUB;
      for (var yy = oy; yy < oy + H2; yy++) for (var xx = ox; xx < ox + W2; xx++) {
        if (comp.lab[yy * lv.w + xx] !== comp.main) continue;
        var edge = Math.min(xx - ox, yy - oy, ox + W2 - 1 - xx, oy + H2 - 1 - yy);
        if (edge > 3) continue;
        var dd = 0;
        Object.keys(sc.links).forEach(function (s) {
          var nb = sc.links[s], cx = (nb.x - minx + 0.5) * W2, cy = (nb.y - miny + 0.5) * H2;
          dd += Math.abs(xx - cx) + Math.abs(yy - cy);
        });
        if (dd > bd) { bd = dd; best = [xx, yy]; }
      }
      if (!best) return null;
      lv.exits.unshift({ x: best[0], y: best[1], to: 'outer_cloister' });
    }
    var want = linksOf(id, C).map(function (l) { return l.to; });
    lv.exits = lv.exits.filter(function (e) { return want.length === 0 || want.indexOf(e.to) >= 0; });
    lv.hero = placeHero(lv, comp, from, null);
    if (!lv.hero) return null;
    var extra = [];
    placed.forEach(function (p) {
      if (!p.c.kind || /^(Prev|Next|Down|Court Connect|Cath|Waypoint)$/.test(p.c.kind)) return;
      var s = nearestIn(lv, comp, ((p.c.x - minx) * rw + rw / 2) * SUB, ((p.c.y - miny) * rh + rh / 2) * SUB, 0, 60);
      if (s) extra.push({ x: s[0], y: s[1], n: 6, kind: 'special' });
    });
    lv.spawns = spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 30]].concat(lv.exits.map(function (e) { return [e.x, e.y, 20]; })), extra);
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- outdoors
  // Fill stamps per area (LvlPrest defs), after act1_overworld.go for Blood Moor; the others follow the
  // look of each D2 area (Cold Plains fences and corrals, Dark Wood trees, Black Marsh swamps, ...).
  var FILLS = {
    blood_moor: [29, 30, 47, 42, 46, 38, 39],
    cold_plains: [29, 30, 31, 32, 33, 34, 35, 48, 43, 45],
    stony_field: [29, 30, 29, 30, 41, 49, 42, 35],
    dark_wood: [40, 40, 40, 41, 43, 36, 37, 46],
    black_marsh: [38, 39, 38, 39, 46, 41, 48, 42],
    tamoe_highland: [31, 32, 34, 36, 41, 47, 43, 29],
    burial_grounds: [29, 30],
    moo_moo_farm: [31, 31, 31, 32, 33, 34]
  };
  // Must-have stamps (D2 places these from hard-coded DRLG rules), by LvlPrest def.
  var SPECIALS = {
    cold_plains: [44],      // Bishibosh's camp
    stony_field: [160],     // Cairn stones (Tristram portal)
    dark_wood: [161],       // Inifuss tree
    black_marsh: [162],     // tower tome
    tamoe_highland: [50]    // bivouac
  };
  var BORDER = { s: 4, w: 5, n: 6, e: 7, sw: 8, nw: 9, ne: 10, se: 11 };

  // Entrance stamp for a warp link from the wilderness: DS1s whose warp tile style equals the Vis index.
  function entranceFor(C, toId, vis) {
    var defs = toId === 'den_of_evil' ? [52] : toId === 'underground_passage_level_1' ? [24, 25] :
      C.M.levels[C.byId[toId]].drlg === 2 ? [163] : [51];
    var out = [];
    defs.forEach(function (d) {
      C.M.presets[d].files.forEach(function (f) {
        var m = C.M.maps[f];
        if ((m.warps || []).some(function (w) { return vis.indexOf(w[2]) >= 0; })) out.push(f);
      });
    });
    return out;
  }

  function buildOutdoor(id, seed, from, attempt, C) {
    var d2 = C.byId[id], L = C.M.levels[d2];
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    var TW = L.size[0], TH = L.size[1], P = C.M.presets, M = C.M.maps;
    var cv = new Canvas(TW, TH);
    var grass = C.W.tilesets.act1.grass;
    for (var i = 0; i < TW * TH; i++) cv.floors[0][i] = grass;
    cv.ts = 'act1';
    var links = linksOf(id, C);
    // gaps in the border, one per walking link: [side, first stamp index]
    var gaps = {}, bands = {};
    var nx = Math.floor((TW - 1) / 9), ny = Math.floor((TH - 1) / 9);
    links.forEach(function (l) {
      if (!l.walk) return;
      var side = sideOf(seed, C, id, l.to);
      var n = (side === 'n' || side === 's') ? nx : ny;
      var g = gaps[side] || (gaps[side] = []);
      var k = 0;
      for (var t = 0; t < 20; t++) {
        k = 2 + rng.int(Math.max(1, n - 3));
        if (g.indexOf(k) < 0 && g.indexOf(k - 1) < 0 && g.indexOf(k + 1) < 0) break;
      }
      g.push(k);
      bands[l.to] = [k * 9 * SUB, (k + 1) * 9 * SUB, 60];
    });
    function file(def) { var f = P[def].files, n = P[def].pick || f.length; return M[f[rng.int(Math.min(n, f.length))]]; }
    var lastX = TW - 9, lastY = TH - 9;
    function edge(side) {
      var n = (side === 'n' || side === 's') ? nx : ny, lastP = (side === 'n' || side === 's') ? lastX : lastY;
      for (var k = 1; k <= n; k++) {
        if ((gaps[side] || []).indexOf(k) >= 0) continue;
        var p = Math.min(k * 9, lastP - 9);
        if (k === n) p = lastP - 9;
        if (p <= 0) continue;
        var m = file(BORDER[side]);
        if (side === 'n') cv.stamp(m, p, 0); else if (side === 's') cv.stamp(m, p, lastY);
        else if (side === 'w') cv.stamp(m, 0, p); else cv.stamp(m, lastX, p);
      }
    }
    SIDES.forEach(edge);
    cv.stamp(file(BORDER.nw), 0, 0); cv.stamp(file(BORDER.ne), lastX, 0);
    cv.stamp(file(BORDER.sw), 0, lastY); cv.stamp(file(BORDER.se), lastX, lastY);
    cv.mark(0, 0, TW, 9, 0); cv.mark(0, TH - 9, TW, 9, 0); cv.mark(0, 0, 9, TH, 0); cv.mark(TW - 9, 0, 9, TH, 0);

    function place(m, margin, tries, cx, cy, spread) {
      for (var t = 0; t < (tries || 200); t++) {
        var px, py;
        if (cx !== undefined) { px = cx - (m.w >> 1) + rng.int(spread * 2 + 1) - spread; py = cy - (m.h >> 1) + rng.int(spread * 2 + 1) - spread; }
        else { px = 10 + rng.int(Math.max(1, TW - 20 - m.w)); py = 10 + rng.int(Math.max(1, TH - 20 - m.h)); }
        if (!cv.free(px, py, m.w, m.h, margin)) continue;
        cv.stamp(m, px, py);
        cv.mark(px, py, m.w, m.h, margin);
        return [px, py];
      }
      return null;
    }
    // the burial grounds preset sits in the middle of its outdoor level
    if (id === 'burial_grounds') {
      // the Graveyard preset nearly fills the 40x48 level: stamped over the inner half of the border
      var gy = M[P[108].files[0]], gx = (TW - gy.w) >> 1, gyy = (TH - gy.h) >> 1;
      cv.stamp(gy, gx, gyy);
      cv.mark(gx, gyy, gy.w, gy.h, 1);
    }
    // entrances for warp links (caves, tower)
    for (var li = 0; li < links.length; li++) {
      var l = links[li];
      if (l.walk || l.warp < 0) continue;
      var styles = [];
      L.vis.forEach(function (v, k) { if (v === C.byId[l.to] && L.warp[k] >= 0) styles.push(k); });
      var ent = entranceFor(C, l.to, styles);
      if (!ent.length) continue;
      if (!place(M[rng.pick(ent)], 3, 300, TW >> 1, TH >> 1, (TW >> 1) - 16)) return null;
    }
    var specAt = {};
    (SPECIALS[id] || []).forEach(function (d) { specAt[d] = place(M[P[d].files[0]], 3, 300); });
    if (L.waypoint) {
      var wpm = M[C.M.subs['Act 1 Waypoint L'].file];
      if (!place(wpm, 3, 300)) return null;
    }
    // one or two shrines
    var shr = Object.keys(C.M.subs).filter(function (n) { return C.M.subs[n].type === 5; });
    for (var s = 0; s < 1 + rng.int(2) && shr.length; s++) place(M[C.M.subs[rng.pick(shr)].file], 2, 60);
    var fills = FILLS[id] || FILLS.blood_moor, placedN = 0, tries = 0, want = Math.round(TW * TH / 190);
    while (placedN < want && tries++ < 1500) {
      var fm = file(rng.pick(fills));
      if (place(fm, 1, 1)) placedN++;
    }

    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    var ex = [], okAll = true;
    links.forEach(function (l2) {
      if (!l2.walk) return;
      var side = sideOf(seed, C, id, l2.to), b = bands[l2.to];
      var p = edgeCell(lv, comp, side, b[0], b[1], 60);
      if (!p) { okAll = false; return; }
      ex.push({ x: p[0], y: p[1], to: l2.to });
    });
    if (!okAll) return null;
    lv.exits = warpExits(lv, comp, cv, d2, C).concat(ex);
    var want2 = links.map(function (x) { return x.to; });
    lv.exits = lv.exits.filter(function (e) { return want2.indexOf(e.to) >= 0; });
    // a portal link (Tristram from the Cairn stones) is an exit at the stone circle
    for (li = 0; li < links.length; li++) {
      if (!links[li].portal || !C.byId[links[li].to] || !kindOf(links[li].to, C)) continue;
      if (!specAt[160]) return null;
      var p2 = nearestIn(lv, comp, (specAt[160][0] + 4.5) * SUB, (specAt[160][1] + 4.5) * SUB, 0, 30);
      if (!p2) return null;
      lv.exits.push({ x: p2[0], y: p2[1], to: links[li].to });
    }
    lv.hero = placeHero(lv, comp, from, null);
    if (!lv.hero) return null;
    lv.spawns = spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 40]].concat(lv.exits.map(function (e) { return [e.x, e.y, 24]; })));
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- dispatch
  function kindOf(id, C) {
    var d2 = C.byId[id];
    if (d2 === undefined) return null;
    var L = C.M.levels[d2];
    if (L.drlg === 2 && C.presetOf[d2]) return 'preset';
    if (L.drlg === 1 && MAZE_SPECIAL[id] && C.M.mazes[d2]) return 'maze';
    if (L.drlg === 3 && L.size[0] >= 18 && (FILLS[id] || id === 'burial_grounds') && id !== 'moo_moo_farm') return 'outdoor';
    return null;
  }
  var BUILD = { preset: buildPreset, maze: buildMaze, outdoor: buildOutdoor };

  var D2G = {
    supports: function (id) {
      try { return !!kindOf(id, ctx()); } catch (e) { return false; }
    },
    get areas() {
      var C = ctx();
      return Object.keys(C.byId).filter(function (id) { return !!kindOf(id, C); });
    },
    kind: function (id) { return kindOf(id, ctx()); },
    build: function (id, seed, from) {
      var C = ctx(), k = kindOf(id, C);
      if (!k) throw new Error('D2G: area ' + id + ' is not supported');
      seed = seed | 0;
      for (var a = 0; a < 60; a++) {
        var r = BUILD[k](id, seed, from, a, C);
        if (r && validate(r.lv, r.comp) && wpCheck(r.lv, C.byId[id], C)) return r.lv;
      }
      throw new Error('D2G: ' + id + ' seed ' + seed + ' failed after 60 attempts');
    },
    sideOf: function (seed, a, b) { return sideOf(seed | 0, ctx(), a, b); },
    linksOf: function (id) { return linksOf(id, ctx()); }
  };

  root.D2G = D2G;
  if (typeof module !== 'undefined' && module.exports) module.exports = D2G;

  // node js/drlg.js --dump <area> <seed> out.json [from]
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    var fs = require('fs'), path = require('path'), vm = require('vm');
    var a = process.argv.slice(2);
    if (a[0] !== '--dump' || a.length < 4) { console.error('usage: node drlg.js --dump <area> <seed> out.json [from]'); process.exit(2); }
    root.D2_GROUPS = root.D2_GROUPS || {};
    root.D2_REG = function (name, obj) { root.D2_GROUPS[name] = obj; };
    ['m/maps_act1.js', 'm/world_act1.js'].forEach(function (f) {
      vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'));
    });
    try { vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8')); } catch (e) { /* links optional */ }
    var lv = D2G.build(a[1], parseInt(a[2], 10), a[4]);
    fs.writeFileSync(a[3], JSON.stringify(lv, function (k, v) { return ArrayBuffer.isView(v) ? Array.prototype.slice.call(v) : v; }));
    console.log(lv.id + ' ' + lv.tw + 'x' + lv.th + ' ' + lv.tileset + ', hero ' + lv.hero + ', exits ' +
      JSON.stringify(lv.exits) + ', spawns ' + lv.spawns.length + ', waypoints ' + lv.objects.filter(function (o) { return o.kind === 'waypoint'; }).length);
  }
})(typeof window !== 'undefined' ? window : globalThis);
