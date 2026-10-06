/* D2G v2: level generator (every act with loaded asset groups) for the Diablo II remake. Pure functions, no DOM.
 *   D2G.build(areaId, seed[, from]) -> Level      D2G.supports(areaId) -> bool      D2G.areas -> [ids]
 * Contract: brain/plans/diablo2-d2r.md ("Hop dong D2G", "Hop dong v2", "Ma khu").
 * Reads asset groups at call time from root.D2_GROUPS ('m/maps_act<N>', 'm/world_act<N>', filled by D2_REG;
 * N = D2DATA.areas[id].act)
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
  var ctxCache = {};
  function actOf(id) { var a = areaData(id); return (a && a.act) || 1; }
  function ctx(act) {
    act = act || 1;
    var M = group('m/maps_act' + act), W = group('m/world_act' + act), cc = ctxCache[act];
    if (cc && cc.M === M && cc.W === W && cc.D === root.D2DATA) return cc;
    var c = { act: act, AC: ACTS[act] || {}, M: M, W: W, D: root.D2DATA, byId: {}, byD2: {}, presetOf: {}, rooms: null, wp: {} };
    Object.keys(M.levels).forEach(function (k) {
      var L = M.levels[k], id = snake(L.levelName || L.name);
      c.byId[id] = +k; c.byD2[+k] = id;
    });
    // area ids of D2DATA win over the levels.txt names (moo_moo_farm is the_secret_cow_level there)
    var A = root.D2DATA && root.D2DATA.areas;
    if (A) Object.keys(A).forEach(function (id) {
      var a = A[id];
      if (a.act === act && M.levels[a.d2id]) { delete c.byId[c.byD2[a.d2id]]; c.byId[id] = a.d2id; c.byD2[a.d2id] = id; }
    });
    Object.keys(M.presets).forEach(function (d) {
      var p = M.presets[d];
      if (p.levelId && !c.presetOf[p.levelId]) c.presetOf[p.levelId] = +d;
    });
    (M.waypointObjs || []).forEach(function (i) { c.wp[i] = 1; });
    ctxCache[act] = c;
    return c;
  }
  // Per-act data the DRLG does not find in the asset groups (D2 hard-codes these per act).
  //  town: town area; townExit: [first wilderness area, town preset file index -> side of that exit]
  //  rooms: LvlType -> LvlPrest name prefix of its maze rooms ('<prefix> [qualifier] <door letters>')
  //  border: LvlPrest defs of the 8x8 outdoor edge stamps by side / corner; wpSub: lvlsub waypoint stamp
  //  entrance: LvlPrest defs holding the outdoor entrance stamp of a warp link, by target area ('*' = cave)
  var ACTS = {
    1: {
      town: 'rogue_encampment',
      townExit: ['blood_moor', ['n', 'e', 's', 'w']],   // TownN1, TownE1, TownS1, TownW1
      rooms: { 3: 'Act 1 - Cave', 4: 'Act 1 - Crypt', 7: 'Act 1 - Barracks', 8: 'Act 1 - Jail', 10: 'Act 1 - Catacombs' },
      border: { s: 4, w: 5, n: 6, e: 7, sw: 8, nw: 9, ne: 10, se: 11 },
      wpSub: 'Act 1 Waypoint L', shrine: 5,
      entrance: { den_of_evil: [52], underground_passage_level_1: [24, 25], preset: [163], '*': [51] }
    },
    2: {
      town: 'lut_gholein',
      townExit: ['rocky_waste'],                          // lutw / lutn: side measured on the DS1
      rooms: { 13: 'Act 2 - Sewer', 17: 'Act 2 - Tomb', 18: 'Act 2 - Lair', 19: 'Act 2 - Arcane' },
      arcane: 'Act 2 - Arcane', arcaneType: 19,
      quads: { 14: 'Act 2 - Corrupt Harem', 15: 'Act 2 - Basement' },
      border: { s: 364, w: 365, n: 366, e: 367, sw: 368, nw: 369, ne: 370, se: 371 },
      // Desert Transition W / N: the strip of Rocky Waste along Lut Gholein's west / north gate
      transition: { w: 362, n: 363 },
      wpSub: 'Act 2 Waypoint', shrine: 8,
      entrance: {
        stony_tomb_level_1: [388], halls_of_the_dead_level_1: [388], claw_viper_temple_level_1: [389],
        maggot_lair_level_1: [390, 391], ancient_tunnels: [412],
        // Canyon of the Magi: one cliff stamp per tomb, its warp style is the tomb's Vis slot (1..7)
        tal_rashas_tomb: [387, 385, 383], tal_rashas_tomb_2: [387, 385, 383], tal_rashas_tomb_3: [387, 385, 383],
        tal_rashas_tomb_4: [387, 385, 383], tal_rashas_tomb_5: [387, 385, 383], tal_rashas_tomb_6: [387, 385, 383],
        tal_rashas_tomb_7: [387, 385, 383]
      }
    }
  };
  ACTS[3] = {
    town: 'kurast_docks',
    townExit: ['spider_forest'],
    rooms: { 24: 'Act 3 - Dungeon', 25: 'Act 3 - Sewer', 22: 'Act 3 - Mephisto' },
    quads: { 23: 'Act 3 - Spider' },
    jungle: 'Act 3 - Jungle',
    wpDef: 631,                                          // Burbs Waypoint: the Kurast waypoint stamp
    entrance: {
      'kurast_bazaar>sewers_level_1_a3': [629], 'upper_kurast>sewers_level_1_a3': [646],
      ruined_temple: [630], disused_fane: [630], forgotten_reliquary: [647], forgotten_temple: [647]
    }
  };
  ACTS[4] = {
    town: 'the_pandemonium_fortress',
    townExit: ['outer_steppes'],
    rooms: { 28: 'Act 4 - Lava' },
    border: { s: 799, w: 800, n: 801, e: 802, sw: 803, nw: 804, ne: 805, se: 806 },
    transition: { w: 798, e: 798 },                       // Fortress Transition (8x24) beside the gate
    entrance: { river_of_flame: [811] }                   // Mesa Warp: stairs down + waypoint
  };
  ACTS[5] = {
    town: 'harrogath',
    townExit: ['bloody_foothills'],
    rooms: { 33: 'Act 5 - Ice', 34: 'Act 5 - Baal', 35: 'Act 5 - Lava' },
    quads: { 32: 'Act 5 - Temple' },
    // Barricade Cliff Border 1..12 (16x16), in the order of the Act I Wild Border stamps
    border: { s: 881, w: 882, n: 883, e: 884, sw: 885, nw: 886, ne: 887, se: 888 },
    snowBorder: { s: 957, w: 958, n: 959, e: 960, sw: 961, nw: 962, ne: 963, se: 964 },
    wpDef: 953, snowWpDef: 954,                          // Barricade Waypoint Dirt / Snow
    entrance: {
      'arreat_plateau>crystalline_passage': [913, 914],  // Barricade To Cave (dirt)
      'frozen_tundra>glacial_trail': [983, 984],         // Barricade From Cave Snow
      'frozen_tundra>the_ancients_way': [985, 986]       // Barricade To Cave Snow
    }
  };
  // Frozen Tundra lies under snow (levels.txt SubType 11), the other Barricade levels on dirt
  var SNOW = { frozen_tundra: 1 };
  // Act V red portals to Abaddon / Pit of Acheron / Infernal Pit (Barricade Hell Portal N)
  var PORTAL_STAMP = { frigid_highlands: 955, arreat_plateau: 955, frozen_tundra: 955 };
  // Strip laid along the side of a walking link (Barricade To Siege holds the Frigid Highlands waypoint)
  var LINK_TRANS = { 'frigid_highlands>bloody_foothills': 880 };
  // Levels D2 builds from one LvlPrest def that has no LevelId (DRLGMAZE with a single fixed room)
  var PRESET_DEFS = {
    claw_viper_temple_level_2: [480],  // Tainted Sun altar room
    frozen_river: [1038, 1039],        // Ice River A / B (one 64x64 room)
    drifter_cavern: [1040],            // Ice Pool A
    icy_cellar: [1041]                 // Ice Pool B
  };
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

  // Floor style that is molten lava: act4/lava/floor.dt1 style 20 has subtile flags 0, yet D2 never lets
  // anyone walk on it, so a tile whose only floor is lava is blocked (rock overlays on floor layer 2 keep
  // their own flags).
  var LAVA = { act4lava: 20, act5lava: 20 };
  // Pick tile variants, OR the subtile flags of every layer into col. Returns a Level without hero / exits.
  function finish(cv, id, seed, C) {
    var tsName = cv.ts, TS = C.W.tilesets[tsName];
    if (!TS) throw new Error('D2G: tileset ' + tsName + ' missing from m/world_act' + C.act);
    var tiles = TS.tiles, flags = TS.flags, lava = LAVA[tsName] || -1;
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
        for (li = 0; li < floors.length; li++) {
          if (floors[li][i] && pick(floors[li], i, 0, tx, ty) && ((floors[li][i] >> 8) & 255) !== lava) hasFloor = true;
        }
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
      var portal = !viaWarp && (PORTAL[to] || PORTAL[id] || (a && (a.exits || []).some(function (e) {
        return e.to === to && e.side === 'portal';
      })));
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
    cathedral: { inner_cloister: 's' },
    spider_forest: { kurast_docks: 's', great_marsh: 'n' },
    great_marsh: { spider_forest: 's', flayer_jungle: 'n' },
    flayer_jungle: { great_marsh: 's', lower_kurast: 'n' },
    lower_kurast: { flayer_jungle: 's', kurast_bazaar: 'n' },
    kurast_bazaar: { lower_kurast: 's', upper_kurast: 'n' },
    upper_kurast: { kurast_bazaar: 's', kurast_causeway: 'n' },
    kurast_causeway: { upper_kurast: 's', travincal: 'n' },
    travincal: { kurast_causeway: 's' },
    the_chaos_sanctuary: { river_of_flame: 's' },
    bloody_foothills: { harrogath: 'w', frigid_highlands: 'e' },
    frigid_highlands: { bloody_foothills: 'w' }
  };
  var COURT_SIDES = ['w', 'n', 'e'];       // CourtW, CourtN, CourtE: side of the barracks door
  function townVariant(seed) { return hash3(seed, 0x70776E, 1) % 4; }
  function courtVariant(seed) { return hash3(seed, 0x636F7572, 2) % 3; }

  var layoutCache = {};
  function sideLayout(seed, C) {
    var key = C.act + ':' + seed + ':' + (root.D2DATA ? 1 : 0), town = C.AC.town, te = C.AC.townExit;
    if (layoutCache[key]) return layoutCache[key];
    var rng = new Rng(hash3(seed, 0x4C41594F, 3));
    var sides = {};
    function set(a, b, s) { (sides[a] || (sides[a] = {}))[b] = s; }
    function used(a) { var u = {}; Object.keys(sides[a] || {}).forEach(function (b) { u[sides[a][b]] = 1; }); return u; }
    Object.keys(FIXED).forEach(function (a) { Object.keys(FIXED[a]).forEach(function (b) { set(a, b, FIXED[a][b]); }); });
    if (te && te[1]) set(town, te[0], te[1][townVariant(seed)]);
    else if (te) {
      // the town's walking exit is on the most open edge of the chosen town DS1
      var os = openSides(C, townFile(C, seed));
      set(town, te[0], SIDES.slice().sort(function (p, q) { return os[q] - os[p]; })[0]);
    }
    if (C.act === 1) {
      set('outer_cloister', 'barracks', COURT_SIDES[courtVariant(seed)]);
      set('barracks', 'outer_cloister', OPP[COURT_SIDES[courtVariant(seed)]]);
    }
    var queue = [town], seen = {}, entry = {};
    seen[town] = 1;
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
      // areas the town does not reach on foot (behind a warp or a portal) start a walk of their own
      if (!queue.length) {
        var rest = Object.keys(C.byId).filter(function (x) { return !seen[x]; })
          .sort(function (p, q) { return C.byId[p] - C.byId[q]; });
        if (rest.length) { seen[rest[0]] = 1; queue.push(rest[0]); }
      }
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

  // a waypoint the hero can walk up to (within 8 subtiles of the main walkable component)
  function wpCheck(lv, d2, C, comp) {
    if (!C.M.levels[d2].waypoint) return true;
    return lv.objects.some(function (o) {
      return o.kind === 'waypoint' && !!nearestIn(lv, comp, o.x, o.y, 0, 8);
    });
  }

  // ---------------------------------------------------------------- presets
  function buildPreset(id, seed, from, attempt, C) {
    var d2 = C.byId[id], def = C.presetOf[d2];
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    if (PRESET_DEFS[id]) def = rng.pick(PRESET_DEFS[id]);
    var P = C.M.presets[def];
    var k, town = id === C.AC.town;
    if (town) k = townVariant(seed) % P.files.length;
    else if (id === 'outer_cloister') k = courtVariant(seed);
    else k = rng.int(P.files.length);
    var m = C.M.maps[P.files[k]];
    var cv = new Canvas(m.w, m.h);
    cv.stamp(m, 0, 0);
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    var ex = edgeExits(lv, comp, id, seed, C);
    if (ex.indexOf(null) >= 0) return null;
    lv.exits = warpExits(lv, comp, cv, d2, C).concat(ex);
    // portal links (Tristram back to the Cairn stones, Anya's portal in Harrogath) and warp links whose
    // DS1 has no warp tile (Baal's portal to the Worldstone Chamber): at the entry marker (style >= 8)
    var entryW = cv.warps.filter(function (w) { return w[2] >= 8; })[0];
    var linksP = linksOf(id, C);
    for (var li = 0; li < linksP.length; li++) {
      var lk = linksP[li], have = lv.exits.some(function (e) { return e.to === lk.to; });
      if (!(lk.portal || (lk.warp >= 0 && !have)) || !kindOf(lk.to, C)) continue;
      var pp = entryW ? nearestIn(lv, comp, entryW[0], entryW[1], 0, 30) : centroid(lv, comp);
      if (!pp) return null;
      lv.exits.push({ x: pp[0], y: pp[1], to: linksP[li].to });
    }
    var mid = (town || id === 'tristram') ? centroid(lv, comp) : null;
    lv.hero = placeHero(lv, comp, from, from ? null : mid);
    if (!lv.hero) return null;
    lv.spawns = town ? [] : spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 30]].concat(lv.exits.map(function (e) { return [e.x, e.y, 20]; })));
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- mazes
  // Room DS1s of a maze LvlType (prefix from ACTS[act].rooms), by qualifier ('' = plain) and door letters.
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
    catacombs_level_3: ['Prev', 'Next'],
    sewers_level_1: ['Prev', 'Next'],
    sewers_level_2: ['Prev', 'Next', 'Waypoint'],
    sewers_level_3: ['Prev', "Radament's Lair", 'Chest'],
    ancient_tunnels: ['Prev', 'Chest'],
    stony_tomb_level_1: ['Prev', 'Next'],
    stony_tomb_level_2: ['Prev', 'Treasure'],
    halls_of_the_dead_level_1: ['Prev', 'Next'],
    halls_of_the_dead_level_2: ['Prev', 'Next', 'Waypoint'],
    halls_of_the_dead_level_3: ['Prev', 'Cube'],
    claw_viper_temple_level_1: ['Prev', 'Next'],
    maggot_lair_level_1: ['Prev', 'Next'],
    maggot_lair_level_2: ['Prev', 'Next'],
    maggot_lair_level_3: ['Prev', 'Tight Spot'],
    tal_rashas_tomb: ['Prev', 'Talrasha', 'Chest'],
    tal_rashas_tomb_2: ['Prev', 'Talrasha', 'Chest'],
    tal_rashas_tomb_3: ['Prev', 'Talrasha', 'Chest'],
    tal_rashas_tomb_4: ['Prev', 'Talrasha', 'Chest'],
    tal_rashas_tomb_5: ['Prev', 'Talrasha', 'Kaa'],
    tal_rashas_tomb_6: ['Prev', 'Talrasha', 'Chest'],
    tal_rashas_tomb_7: ['Prev', 'Talrasha', 'Chest'],
    swampy_pit_level_1: ['Prev', 'Next'],
    swampy_pit_level_2: ['Prev', 'Next'],
    flayer_dungeon_level_1: ['Prev', 'Next'],
    flayer_dungeon_level_2: ['Prev', 'Next'],
    sewers_level_1_a3: ['Prev', 'Drain', 'Chest'],
    durance_of_hate_level_1: ['Prev', 'Next'],
    durance_of_hate_level_2: ['Prev', 'Next', 'Waypoint'],
    river_of_flame: ['Warp', 'Forge', 'Bridge'],
    crystalline_passage: ['Prev', 'Next', 'Down', 'waypoint'],
    glacial_trail: ['Prev', 'Next', 'Down', 'waypoint'],
    the_ancients_way: ['Prev', 'Next', 'Down', 'waypoint'],
    worldstone_keep_level_1: ['Prev', 'Next'],
    worldstone_keep_level_2: ['Prev', 'Next', 'Waypoint'],
    worldstone_keep_level_3: ['Prev', 'Next']
  };
  // Rooms of a maze outside its LvlType prefix: [qualifier, door letters, LvlPrest def]
  var MAZE_ROOMS = { river_of_flame: [['Bridge', 'S', 855]] };
  // Walking links that leave a maze through the far edge of one of its rooms: to -> [room kind, side]
  var MAZE_WALK = { river_of_flame: { the_chaos_sanctuary: ['Bridge', 'n'] } };
  // Extra rooms on cells of the maze with the given doors (not leaves): Kurast sewer stairs up to the
  // Upper Kurast side (Prev SE / SW), the entry being one of the Bazaar side ones (Prev NE / NW).
  var MAZE_EXTRA = { sewers_level_1_a3: { entry: ['NE', 'NW'], kind: 'Prev', letters: ['SE', 'SW'] } };
  // Portal links leaving a maze from one of its special rooms (the Orifice in the Talrasha room)
  var ROOM_PORTAL = { tal_rashas_chamber: 'Talrasha' };
  function roomIndex(C) {
    if (C.rooms) return C.rooms;
    var R = {}, rooms = C.AC.rooms || {};
    var prefixes = Object.keys(rooms).map(function (k) { return rooms[k]; });
    Object.keys(C.M.presets).forEach(function (d) {
      var p = C.M.presets[d];
      if (p.levelId) return;
      prefixes.forEach(function (pre) {
        if (p.name.indexOf(pre + ' ') !== 0) return;
        var rest = p.name.slice(pre.length + 1), lm = /^(?:(.*) )?([NSEW]+)$/.exec(rest), q, letters;
        if (lm) { q = lm[1] || ''; letters = lm[2]; } else { q = rest; letters = '*'; }
        var t = R[pre] || (R[pre] = {});
        (t[q] || (t[q] = {}))[letters] = p.files;
      });
    });
    C.rooms = R;
    return R;
  }
  function lettersOf(links) { return ['N', 'S', 'E', 'W'].filter(function (L) { return links[LETTER[L]]; }).join(''); }
  function canon(letters) { return ['N', 'S', 'E', 'W'].filter(function (L) { return letters.indexOf(L) >= 0; }).join(''); }

  // Walkable subtiles next to each edge of a DS1 (2..4 subtiles deep): the open side of a town preset.
  function openSides(C, key) {
    C.open = C.open || {};
    if (C.open[key]) return C.open[key];
    var m = C.M.maps[key], cv = new Canvas(m.w, m.h);
    cv.stamp(m, 0, 0);
    var lv = finish(cv, 'probe', 0, C), res = {};
    SIDES.forEach(function (s) {
      var n = 0, len = (s === 'n' || s === 's') ? lv.w : lv.h;
      for (var d = 2; d < 5; d++) {
        for (var k = 2; k < len - 2; k++) {
          var x = s === 'n' || s === 's' ? k : s === 'w' ? d : lv.w - 1 - d;
          var y = s === 'w' || s === 'e' ? k : s === 'n' ? d : lv.h - 1 - d;
          if (lv.col[y * lv.w + x] === 0) n++;
        }
      }
      res[s] = n;
    });
    C.open[key] = res;
    return res;
  }
  // True when a room DS1 opens on exactly the sides of `letters` and those doors join inside the room
  // (the Arcane Sanctuary's variant files 1..3 carry stairs that turn to other sides than their name says).
  function roomFits(C, key, letters) {
    C.fits = C.fits || {};
    var ck = key + ':' + letters;
    if (C.fits[ck] !== undefined) return C.fits[ck];
    var m = C.M.maps[key], cv = new Canvas(m.w, m.h);
    cv.stamp(m, 0, 0);
    var lv = finish(cv, 'probe', 0, C), comp = components(lv.col, lv.w, lv.h), S = (m.w - 1) * SUB, lab = -2, ok = true;
    SIDES.forEach(function (sd) {
      var cells = [];
      for (var i = 0; i < S; i++) {
        var x = sd === 'n' || sd === 's' ? i : sd === 'w' ? 0 : S - 1;
        var y = sd === 'w' || sd === 'e' ? i : sd === 'n' ? 0 : S - 1;
        if (lv.col[y * lv.w + x] === 0) cells.push(y * lv.w + x);
      }
      var want = letters.indexOf(sd.toUpperCase()) >= 0;
      if (want !== cells.length > 0) ok = false;
      cells.forEach(function (c) { if (lab === -2) lab = comp.lab[c]; else if (comp.lab[c] !== lab) ok = false; });
    });
    C.fits[ck] = ok;
    return ok;
  }
  function townFile(C, seed) {
    var P = C.M.presets[C.presetOf[C.byId[C.AC.town]]];
    return P.files[townVariant(seed) % P.files.length];
  }

  function genMaze(rng, GW, GH, total, entry, leaves, merge, allow) {
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
      var chosen = [], noLeaf = false;
      leaves.forEach(function (lf, i) {
        var pool = cand.filter(function (c) { return chosen.indexOf(c) < 0 && (!allow || allow(lf, lettersOf(c.links))); });
        if (!pool.length) { noLeaf = true; return; }
        chosen.push(i === 0 ? pool[0] : rng.pick(pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)))));
      });
      if (noLeaf) continue;
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
    var R = roomIndex(C)[C.AC.rooms[L.levelType]];
    if (MAZE_ROOMS[id]) {
      var R0 = R; R = {};
      Object.keys(R0).forEach(function (q) { R[q] = R0[q]; });
      MAZE_ROOMS[id].forEach(function (x) { R[x[0]] = {}; R[x[0]][x[1]] = C.M.presets[x[2]].files; });
    }
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
    } else if (R[entryName] && !R[entryName].N && !R[entryName].S && !R[entryName].E && !R[entryName].W) {
      // entry rooms with several doors only (Act II tombs: Prev SEW / NEW / NSW / NSE)
      var lt3 = rng.pick(MAZE_EXTRA[id] ? MAZE_EXTRA[id].entry.map(canon) :
        Object.keys(R[entryName]).filter(function (x) { return x !== '*'; }).sort());
      entry = { kind: entryName, need: lt3.split('').map(function (c) { return LETTER[c]; }), letters: lt3 };
    } else if (R[entryName] && C.act >= 4) {
      // the entry room's doors are chosen first, so the start cell only grows where a room exists
      var lt4 = rng.pick(Object.keys(R[entryName]).filter(function (x) { return x !== '*'; }).sort());
      entry = { kind: entryName, need: lt4.split('').map(function (c) { return LETTER[c]; }), letters: lt4 };
    } else entry = { kind: entryName, need: [] };
    var leaves = spec.slice(1);
    var total = Z.rooms[0] + spec.length;
    var GW = Math.max(3, Math.min(10, Math.floor(L.size[0] / rw))), GH = Math.max(3, Math.min(10, Math.floor(L.size[1] / rh)));
    // Act I keeps its retry-on-missing-room behaviour so its shipped layouts stay the same
    var allow = C.act > 1 ? function (kind, letters) { return !!(R[kind] && R[kind][letters]); } : null;
    var mz = genMaze(rng, GW, GH, total, entry, leaves, Z.merge, allow);
    if (!mz) return null;
    var XT = MAZE_EXTRA[id];
    if (XT) {
      var xl = XT.letters.map(canon), xc = mz.list.filter(function (c) { return !c.kind && xl.indexOf(lettersOf(c.links)) >= 0; });
      if (!xc.length) return null;
      var xs = rng.pick(xc);
      xs.kind = XT.kind; xs.extra = true;
    }
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
      else if (k === entry.kind && c === mz.start && entry.letters) files2 = R[k][entry.letters];
      else if (c.extra) files2 = R[k][lt2];
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
    var portalOk = true;
    linksOf(id, C).forEach(function (l) {
      var rk = ROOM_PORTAL[l.to];
      if (!l.portal || !rk || !kindOf(l.to, C)) return;
      var pr = placed.filter(function (q) { return q.c.kind === rk; })[0];
      var pq = pr && nearestIn(lv, comp, ((pr.c.x - minx) * rw + rw / 2) * SUB, ((pr.c.y - miny) * rh + rh / 2) * SUB, 0, 60);
      if (pq) lv.exits.push({ x: pq[0], y: pq[1], to: l.to }); else portalOk = false;
    });
    if (!portalOk) return null;
    var MW = MAZE_WALK[id] || {}, walkOk = true;
    Object.keys(MW).forEach(function (to) {
      if (!kindOf(to, C)) return;
      var pr = placed.filter(function (q) { return q.c.kind === MW[to][0]; })[0];
      if (!pr) { walkOk = false; return; }
      var x0 = (pr.c.x - minx) * rw * SUB, y0 = (pr.c.y - miny) * rh * SUB, sd = MW[to][1];
      var sub = { tw: rw * SUB, th: rh * SUB };
      // nearest main-component cell to the middle of that room edge
      var mx = sd === 'w' ? x0 : sd === 'e' ? x0 + sub.tw - 1 : x0 + (sub.tw >> 1);
      var my = sd === 'n' ? y0 : sd === 's' ? y0 + sub.th - 1 : y0 + (sub.th >> 1);
      var pq = nearestIn(lv, comp, mx, my, 0, 40);
      if (pq) lv.exits.push({ x: pq[0], y: pq[1], to: to }); else walkOk = false;
    });
    if (!walkOk) return null;
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

  // Portal links of a level without a fixed spot: at the entry marker (warp style >= 8) or at `at`.
  function portalExits(lv, comp, cv, id, C, at) {
    var mark = cv.warps.filter(function (w) { return w[2] >= 8; })[0], ok = true;
    linksOf(id, C).forEach(function (l) {
      if (!l.portal || !kindOf(l.to, C) || (at && at[l.to] === null)) return;
      var q = at && at[l.to] ? at[l.to] : mark;
      var p = q ? nearestIn(lv, comp, q[0], q[1], 0, 40) || nearestIn(lv, comp, q[0], q[1], 0, 160) : centroid(lv, comp);
      if (p) lv.exits.push({ x: p[0], y: p[1], to: l.to }); else ok = false;
    });
    return ok;
  }

  // ---------------------------------------------------------------- quadrant levels
  // Harem Level 2, Palace Cellar, Spider caves: DRLGMAZE with four rooms in a 2x2 ring; the LvlPrest
  // names carry two door letters (NE NW SE SW) and every room has its own variants. Each room DS1 holds the stairs
  // of its quadrant; the files are chosen so that every warp leads somewhere and every Vis slot is reached.
  var QUADS = ['NW', 'NE', 'SW', 'SE'];
  function quadIndex(C, pre) {
    C.quadIdx = C.quadIdx || {};
    if (C.quadIdx[pre]) return C.quadIdx[pre];
    var Q = { size: 0 };
    QUADS.forEach(function (q) { Q[q] = []; });
    Object.keys(C.M.presets).forEach(function (d) {
      var p = C.M.presets[d];
      if (p.levelId || p.name.indexOf(pre + ' ') !== 0) return;
      var m = /^(NE|NW|SE|SW)\b/.exec(p.name.slice(pre.length + 1));
      if (!m) return;
      Q.size = p.sizeX;
      p.files.forEach(function (f) { if (Q[m[1]].indexOf(f) < 0) Q[m[1]].push(f); });
    });
    C.quadIdx[pre] = Q;
    return Q;
  }
  function buildQuad(id, seed, from, attempt, C) {
    var d2 = C.byId[id], L = C.M.levels[d2], Q = quadIndex(C, C.AC.quads[L.levelType]);
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    var need = {}, M = C.M.maps;
    L.vis.forEach(function (v, k) { if (v > 0 && C.byD2[v] && L.warp[k] >= 0) need[k] = 1; });
    function info(f) {
      var st = {}, wp = (M[f].objects || []).some(function (o) { return o.type === 2 && C.wp[o.id]; });
      (M[f].warps || []).forEach(function (w) { if (w[2] < 8) st[w[2]] = 1; });
      var bad = Object.keys(st).some(function (k) { return !need[k]; });
      return { st: st, wp: wp, bad: bad };
    }
    var pick = null;
    for (var t = 0; t < 400 && !pick; t++) {
      var got = {}, nwp = 0, ok = true, choice = {};
      QUADS.forEach(function (q) {
        var opts = Q[q].filter(function (f) { return !info(f).bad; });
        if (!opts.length) { ok = false; return; }
        var f = rng.pick(opts), I = info(f);
        choice[q] = f; if (I.wp) nwp++;
        Object.keys(I.st).forEach(function (k) { got[k] = 1; });
      });
      if (!ok) continue;
      if (Object.keys(need).some(function (k) { return !got[k]; })) continue;
      if (nwp !== (L.waypoint ? 1 : 0)) continue;
      pick = choice;
    }
    if (!pick) return null;
    var S = Q.size, cv = new Canvas(2 * S + 1, 2 * S + 1);
    // the rooms are named by their inner doors: the 'SE' room (doors S and E) is the north-west corner
    QUADS.forEach(function (q, i) { var j = 3 - i; cv.stamp(M[pick[q]], (j & 1) * S, (j >> 1) * S); });
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    lv.exits = warpExits(lv, comp, cv, d2, C);
    if (!portalExits(lv, comp, cv, id, C)) return null;
    lv.hero = placeHero(lv, comp, from, null);
    if (!lv.hero) return null;
    lv.spawns = spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 30]].concat(lv.exits.map(function (e) { return [e.x, e.y, 20]; })));
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- Arcane Sanctuary
  // A hub room (the NSEW file with the waypoint and the portal marker) and four arms of floating
  // platforms, one per direction; arm i uses file variant i of every 'Act 2 - Arcane <doors>' def, so each
  // arm keeps one look. Each arm grows inside its own 90 degree sector, so the arms never touch. The
  // Summoner's platform ends one arm; the portal to the Canyon of the Magi opens there (his journal).
  function buildArcane(id, seed, from, attempt, C) {
    var d2 = C.byId[id], L = C.M.levels[d2], Z = C.M.mazes[d2], M = C.M.maps;
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    var R = roomIndex(C)[C.AC.arcane], rs = Z.size[0];
    var G = 11, c0 = 5, per = Math.floor((Z.rooms[0] - 1) / 4);
    var cells = {}, key = function (x, y) { return x + ',' + y; };
    function sector(arm, x, y) {
      var dx = x - c0, dy = y - c0;
      if (x < 0 || y < 0 || x >= G || y >= G) return false;
      return arm === 'n' ? dy < 0 && Math.abs(dx) <= -dy : arm === 's' ? dy > 0 && Math.abs(dx) <= dy :
        arm === 'e' ? dx > 0 && Math.abs(dy) < dx : dx < 0 && Math.abs(dy) < -dx;
    }
    var hub = { x: c0, y: c0, links: {}, arm: -1 };
    cells[key(c0, c0)] = hub;
    var arms = {};
    SIDES.forEach(function (arm, ai) {
      var first = { x: c0 + DIR[arm][0], y: c0 + DIR[arm][1], links: {}, arm: ai };
      hub.links[arm] = first; first.links[OPP[arm]] = hub;
      cells[key(first.x, first.y)] = first;
      var list = [first];
      for (var guard = 0; list.length < per && guard < 600; guard++) {
        var c = list[rng.int(list.length)];
        var dirs = SIDES.filter(function (d) {
          var nx = c.x + DIR[d][0], ny = c.y + DIR[d][1];
          return sector(arm, nx, ny) && !cells[key(nx, ny)];
        });
        if (!dirs.length) continue;
        var d = rng.pick(dirs), n = { x: c.x + DIR[d][0], y: c.y + DIR[d][1], links: {}, arm: ai };
        c.links[d] = n; n.links[OPP[d]] = c;
        cells[key(n.x, n.y)] = n; list.push(n);
      }
      arms[arm] = list;
    });
    // the Summoner sits on the dead end of one arm that is farthest from the hub
    var sArm = rng.pick(SIDES), far = null, fd = -1;
    arms[sArm].forEach(function (c) {
      var nl = Object.keys(c.links).length, d = Math.abs(c.x - c0) + Math.abs(c.y - c0);
      if (nl === 1 && d > fd && R['Summoner'][lettersOf(c.links)]) { fd = d; far = c; }
    });
    if (!far) return null;
    far.kind = 'Summoner';
    var cv = new Canvas(G * rs + 1, G * rs + 1), hubFile = null, sumAt = null, placedN = 0;
    Object.keys(cells).forEach(function (k) {
      var c = cells[k], lt = lettersOf(c.links), files, f;
      if (c === hub) {
        // the hub is the NSEW file that holds the waypoint
        f = hubFile = R[''][lt].filter(function (x) { return (M[x].objects || []).some(function (o) { return o.type === 2 && C.wp[o.id]; }); })[0];
      } else {
        files = (c.kind ? R[c.kind][lt] : R[''][lt]).filter(function (x) {
          return roomFits(C, x, lt) && !(M[x].objects || []).some(function (o) { return o.type === 2 && C.wp[o.id]; });
        });
        if (!files.length) return;
        f = files[Math.min(c.arm, files.length - 1)];
      }
      cv.stamp(M[f], c.x * rs, c.y * rs);
      if (c === far) sumAt = [(c.x * rs + rs / 2) * SUB, (c.y * rs + rs / 2) * SUB];
      placedN++;
    });
    if (!hubFile || placedN < Object.keys(cells).length) return null;
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    lv.exits = [];
    if (!portalExits(lv, comp, cv, id, C, { canyon_of_the_magi: sumAt })) return null;
    var mid = nearestIn(lv, comp, (c0 * rs + rs / 2) * SUB, (c0 * rs + rs / 2) * SUB, 0, 40);
    lv.hero = placeHero(lv, comp, from, from ? null : mid);
    if (!lv.hero) return null;
    var sp = nearestIn(lv, comp, sumAt[0], sumAt[1], 0, 40);
    lv.spawns = spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 30]].concat(lv.exits.map(function (e) { return [e.x, e.y, 20]; })),
      sp ? [{ x: sp[0], y: sp[1], n: 6, kind: 'special' }] : null);
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- Act III jungle
  // Spider Forest, Great Marsh, Flayer Jungle: a grid of 32x32 jungle blocks. The door letters of
  // 'Act 3 - Jungle <letters>' are the sides where the block's river leaves it, so the river is a tree
  // over every block (land around a tree stays connected). Clearings ('Act 3 - Clearing <kind>
  // <letters>') replace blocks with one or two river sides; file 1 / 2 / 3 of a clearing carries the
  // Vis 0 cave stairs and the waypoint / the Vis 1 cave stairs / nothing.
  var JUNGLE = {
    spider_forest: { clearing: 'Webby', files: [0, 1] },
    great_marsh: { clearing: 'Boggy', files: [0] },
    flayer_jungle: { clearing: 'Pygmy', files: [0, 1] }
  };
  function prefixIndex(C, pre) {
    C.pidx = C.pidx || {};
    if (C.pidx[pre]) return C.pidx[pre];
    var R = {};
    Object.keys(C.M.presets).forEach(function (d) {
      var p = C.M.presets[d];
      if (p.levelId || p.name.indexOf(pre + ' ') !== 0) return;
      var m = /^([NSEW]+)$/.exec(p.name.slice(pre.length + 1));
      if (m) R[m[1]] = p.files;
    });
    C.pidx[pre] = R;
    return R;
  }
  function buildJungle(id, seed, from, attempt, C) {
    var d2 = C.byId[id], L = C.M.levels[d2], M = C.M.maps, J = JUNGLE[id];
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    var R = prefixIndex(C, C.AC.jungle), K = prefixIndex(C, 'Act 3 - Clearing ' + J.clearing);
    var GW = Math.floor(L.size[0] / 32), GH = Math.floor(L.size[1] / 32);
    var mz = genMaze(rng, GW, GH, GW * GH, { kind: null, need: [] }, [], 0);
    if (!mz) return null;
    var cand = mz.list.filter(function (c) { return K[lettersOf(c.links)]; });
    rng.shuffle(cand);
    if (cand.length < J.files.length) return null;
    J.files.forEach(function (fi, i) { cand[i].clear = fi; });
    var cv = new Canvas(GW * 32 + 1, GH * 32 + 1);
    mz.list.forEach(function (c) {
      var lt = lettersOf(c.links), f = c.clear !== undefined ? K[lt][c.clear] : rng.pick(R[lt]);
      cv.stamp(M[f], c.x * 32, c.y * 32);
    });
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    var ex = edgeExits(lv, comp, id, seed, C);
    if (ex.indexOf(null) >= 0) return null;
    lv.exits = warpExits(lv, comp, cv, d2, C).concat(ex);
    lv.hero = placeHero(lv, comp, from, null);
    if (!lv.hero) return null;
    lv.spawns = spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 40]].concat(lv.exits.map(function (e) { return [e.x, e.y, 24]; })));
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- composed presets
  // Outdoor levels D2 lays out from fixed LvlPrest stamps: [def, tile x, tile y].
  var COMPOSE = {
    kurast_causeway: [[652, 0, 0]],
    travincal: [[653, 0, 0], [654, 16, 0], [655, 48, 0], [656, 0, 32], [657, 16, 32], [658, 48, 32]],
    // Diablo's star: heart in the middle, an arm on each side, the entry below the south arm
    the_chaos_sanctuary: [[861, 24, 0], [858, 0, 24], [862, 24, 24], [859, 48, 24], [860, 24, 48], [857, 24, 72]],
    // the Siege: To Town, Strip 1..13, To Barricade, 16 tiles each from west to east
    bloody_foothills: [865, 866, 867, 868, 869, 870, 871, 872, 873, 874, 875, 876, 877, 878, 879].map(function (d, i) { return [d, i * 16, 0]; })
  };
  function buildCompose(id, seed, from, attempt, C) {
    var d2 = C.byId[id], M = C.M.maps, P = C.M.presets, parts = COMPOSE[id];
    var rng = new Rng(hash3(seed, strHash(id), attempt)), tw = 0, th = 0;
    var ms = parts.map(function (q) { var m = M[rng.pick(P[q[0]].files)]; tw = Math.max(tw, q[1] + m.w); th = Math.max(th, q[2] + m.h); return m; });
    var cv = new Canvas(tw, th);
    parts.forEach(function (q, i) { cv.stamp(ms[i], q[1], q[2]); });
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    var ex = edgeExits(lv, comp, id, seed, C);
    if (ex.indexOf(null) >= 0) return null;
    lv.exits = warpExits(lv, comp, cv, d2, C).concat(ex);
    lv.hero = placeHero(lv, comp, from, null);
    if (!lv.hero) return null;
    lv.spawns = spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 30]].concat(lv.exits.map(function (e) { return [e.x, e.y, 20]; })));
    return { lv: lv, comp: comp };
  }

  // ---------------------------------------------------------------- Act V Hell levels
  // Abaddon, Pit of Acheron, Infernal Pit: three 24x24 'Act 5 - Lava' rooms in a row (the defs only
  // hold N S E W EW NS). The end room whose file carries the portal marker (style 33) is the way in.
  var HELL = { abaddon: 1, pit_of_acheron: 1, infernal_pit: 1 };
  function buildHell(id, seed, from, attempt, C) {
    var d2 = C.byId[id], Z = C.M.mazes[d2], M = C.M.maps, L = C.M.levels[d2];
    var rng = new Rng(hash3(seed, strHash(id), attempt));
    var R = roomIndex(C)[C.AC.rooms[L.levelType]][''], n = Z.rooms[0], rs = Z.size[0];
    var ew = rng.f() < 0.5, a = ew ? 'E' : 'S', b = ew ? 'W' : 'N', mid = ew ? 'EW' : 'NS';
    function marked(f) { return (M[f].warps || []).some(function (w) { return w[2] >= 8; }); }
    var keys = [rng.pick(R[a].filter(marked))];
    for (var i = 1; i < n - 1; i++) keys.push(rng.pick(R[mid]));
    keys.push(rng.pick(R[b].filter(function (f) { return !marked(f); }).concat(R[b]).slice(0, 1)));
    var cv = ew ? new Canvas(n * rs + 1, rs + 1) : new Canvas(rs + 1, n * rs + 1);
    keys.forEach(function (k, j) { cv.stamp(M[k], ew ? j * rs : 0, ew ? 0 : j * rs); });
    var lv = finish(cv, id, seed, C), comp = components(lv.col, lv.w, lv.h);
    lv.exits = [];
    if (!portalExits(lv, comp, cv, id, C)) return null;
    lv.hero = placeHero(lv, comp, from, null);
    if (!lv.hero) return null;
    lv.spawns = spawnPacks(lv, comp, rng, id,
      [[lv.hero[0], lv.hero[1], 30]].concat(lv.exits.map(function (e) { return [e.x, e.y, 20]; })));
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
    moo_moo_farm: [31, 31, 31, 32, 33, 34],
    // Act II desert: Fill Mesa / Head / Bone / Wagon / Berms everywhere, oases at the Far Oasis, ruins in
    // the Lost City and the Valley of Snakes
    rocky_waste: [398, 399, 400, 401, 402, 403, 404, 405],
    dry_hills: [404, 405, 406, 407, 398, 401, 402],
    far_oasis: [395, 395, 396, 397, 404, 406],
    lost_city: [408, 409, 410, 411, 411, 404],
    valley_of_snakes: [392, 393],
    canyon_of_the_magi: [404, 405, 406, 407, 399, 400, 401],
    // Act IV mesa: Mesa 1 / 2 / 3 fills from the Fortress outwards, Pits 1 / 2 between them
    outer_steppes: [812, 813, 814, 815, 816, 816, 828, 829, 830, 831],
    plains_of_despair: [817, 818, 819, 820, 821, 821, 832, 833, 834, 835],
    city_of_the_damned: [823, 824, 825, 826, 827, 827],
    // Act V Barricade: barricade blocks, farms, ruined houses, frozen lakes (snow sets on the Tundra)
    frigid_highlands: [915, 916, 917, 918, 919, 920, 921, 922, 939, 940, 942, 943, 945, 946],
    arreat_plateau: [923, 924, 925, 926, 927, 928, 929, 930, 939, 940, 942, 945, 948, 949],
    frozen_tundra: [987, 988, 989, 990, 991, 992, 993, 994, 948, 949, 942, 945]
  };
  // Must-have stamps (D2 places these from hard-coded DRLG rules), by LvlPrest def.
  var SPECIALS = {
    cold_plains: [44],      // Bishibosh's camp
    stony_field: [160],     // Cairn stones (Tristram portal)
    dark_wood: [161],       // Inifuss tree
    black_marsh: [162],     // tower tome
    tamoe_highland: [50],   // bivouac
    lost_city: [413],       // Dark Elder's ruin
    canyon_of_the_magi: [394],  // waypoint + Arcane Sanctuary portal
    plains_of_despair: [822],   // Izual
    frigid_highlands: [931, 934, 937]   // Barricade Prisons (the captured Barbarians)
  };
  // Outdoor levels with their own border / gate / fill stamps, found by LvlPrest name
  // ('<set> Border N|S|E|W|NE|NW|SE|SW', '<set> Gate N|S').
  var OUT_SET = {
    lower_kurast: { set: 'Act 3 - Slums', fills: [615, 616, 617, 618] },
    kurast_bazaar: { set: 'Act 3 - Burbs', fills: [632, 633, 634, 635] },
    upper_kurast: { set: 'Act 3 - Metro', fills: [648, 649, 650, 651] }
  };
  function outSet(C, id) {
    var o = OUT_SET[id];
    if (!o) return null;
    if (o.border) return o;
    o.border = {}; o.gate = {};
    Object.keys(C.M.presets).forEach(function (d) {
      var p = C.M.presets[d], m = new RegExp('^' + o.set + ' (Border|Gate) (N|S|E|W|NE|NW|SE|SW)$').exec(p.name);
      if (m) (m[1] === 'Border' ? o.border : o.gate)[m[2].toLowerCase()] = +d;
    });
    return o;
  }
  // levels.txt gives the Valley of Snakes 32x32 tiles: inside its 9-tile borders the 17x17 Claw Viper
  // Temple entrance cannot fit, so the level is built larger.
  var OUTDOOR_SIZE = {
    valley_of_snakes: [48, 48],
    // levels.txt says -1 x -1 (D2 sizes them at run time); the Frozen Tundra's 128x80 is used
    frigid_highlands: [128, 80], arreat_plateau: [128, 80]
  };
  // Entrance stamp for a warp link from the wilderness: DS1s whose warp tile style equals the Vis index.
  function entranceFor(C, toId, vis, fromId) {
    var E = C.AC.entrance || {};
    var defs = E[fromId + '>' + toId] || E[toId] || (C.M.levels[C.byId[toId]].drlg === 2 && E.preset) || E['*'] || [];
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
    var sz = OUTDOOR_SIZE[id] || L.size, TW = sz[0], TH = sz[1], P = C.M.presets, M = C.M.maps;
    var OS = outSet(C, id), cv = new Canvas(TW, TH), snow = !!SNOW[id];
    var BORDER = OS ? OS.border : (snow && C.AC.snowBorder) || C.AC.border, B = M[P[BORDER.s].files[0]].w;
    // the open ground is the tileset of the border stamps, filled with its 'grass' floor (build_world.py)
    var tsName = P[BORDER.s].ts, grass = C.W.tilesets[tsName][snow ? 'snow' : 'grass'];
    for (var i = 0; i < TW * TH; i++) cv.floors[0][i] = grass;
    cv.ts = tsName;
    var links = linksOf(id, C);
    // gaps in the border, one per walking link: [side, first stamp index]
    var gaps = {}, bands = {}, trans = null, gates = null;
    var nx = Math.floor((TW - 1) / B), ny = Math.floor((TH - 1) / B);
    links.forEach(function (l) {
      if (!l.walk) return;
      var side = sideOf(seed, C, id, l.to);
      var td = (l.to === C.AC.town && C.AC.transition && C.AC.transition[OPP[side]]) || LINK_TRANS[id + '>' + l.to];
      if (td) {
        // the town's gate strip replaces the border on that side; the exit is anywhere along it
        var tm = M[P[td].files[0]], along = (side === 'n' || side === 's') ? TW : TH;
        var len = (side === 'n' || side === 's') ? tm.w : tm.h, at = B + rng.int(Math.max(1, along - 2 * B - len + 1));
        trans = { m: tm, side: side, at: at, len: len };
        bands[l.to] = [at * SUB, (at + len) * SUB, 60];
        return;
      }
      var n = (side === 'n' || side === 's') ? nx : ny;
      var g = gaps[side] || (gaps[side] = []);
      var gd = OS && OS.gate[side], gw = gd ? Math.ceil((M[P[gd].files[0]].w - 1) / 8) : 1;
      var k = 0;
      for (var t = 0; t < 20; t++) {
        k = 2 + rng.int(Math.max(1, n - 3 - (gw - 1)));
        if (g.indexOf(k) < 0 && g.indexOf(k - 1) < 0 && g.indexOf(k + 1) < 0 && g.indexOf(k + gw) < 0) break;
      }
      for (var gi = 0; gi < gw; gi++) g.push(k + gi);
      if (gd) (gates || (gates = [])).push([side, k, M[P[gd].files[0]]]);
      bands[l.to] = [k * B * SUB, (k + gw) * B * SUB, 60];
    });
    function file(def) { var f = P[def].files, n = P[def].pick || f.length; return M[f[rng.int(Math.min(n, f.length))]]; }
    var lastX = TW - B, lastY = TH - B;
    function edge(side) {
      var n = (side === 'n' || side === 's') ? nx : ny, lastP = (side === 'n' || side === 's') ? lastX : lastY;
      for (var k = 1; k <= n; k++) {
        if ((gaps[side] || []).indexOf(k) >= 0) continue;
        var p = Math.min(k * B, lastP - B);
        if (k === n) p = lastP - B;
        if (p <= 0) continue;
        if (trans && trans.side === side && p + B > trans.at && p < trans.at + trans.len) continue;
        var m = file(BORDER[side]);
        if (side === 'n') cv.stamp(m, p, 0); else if (side === 's') cv.stamp(m, p, lastY);
        else if (side === 'w') cv.stamp(m, 0, p); else cv.stamp(m, lastX, p);
      }
    }
    SIDES.forEach(edge);
    cv.stamp(file(BORDER.nw), 0, 0); cv.stamp(file(BORDER.ne), lastX, 0);
    cv.stamp(file(BORDER.sw), 0, lastY); cv.stamp(file(BORDER.se), lastX, lastY);
    // Kurast: the walking link goes through a gate stamp set into the border gap
    (gates || []).forEach(function (g) {
      var gm = g[2], gp = g[1] * B;
      if (g[0] === 'n') cv.stamp(gm, gp, 0); else if (g[0] === 's') cv.stamp(gm, gp, TH - gm.h);
      else if (g[0] === 'w') cv.stamp(gm, 0, gp); else cv.stamp(gm, TW - gm.w, gp);
    });
    cv.mark(0, 0, TW, B, 0); cv.mark(0, TH - B, TW, B, 0); cv.mark(0, 0, B, TH, 0); cv.mark(TW - B, 0, B, TH, 0);
    if (trans) {
      var tx0 = trans.side === 'w' ? 0 : trans.side === 'e' ? TW - trans.m.w : trans.at;
      var ty0 = trans.side === 'n' ? 0 : trans.side === 's' ? TH - trans.m.h : trans.at;
      cv.stamp(trans.m, tx0, ty0);
      cv.mark(tx0, ty0, trans.m.w, trans.m.h, 1);
    }

    function place(m, margin, tries, cx, cy, spread) {
      for (var t = 0; t < (tries || 200); t++) {
        var px, py;
        if (cx !== undefined) { px = cx - (m.w >> 1) + rng.int(spread * 2 + 1) - spread; py = cy - (m.h >> 1) + rng.int(spread * 2 + 1) - spread; }
        else { px = B + 1 + rng.int(Math.max(1, TW - 2 * B - 2 - m.w)); py = B + 1 + rng.int(Math.max(1, TH - 2 * B - 2 - m.h)); }
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
      var ent = entranceFor(C, l.to, styles, id);
      if (!ent.length) continue;
      var em = M[rng.pick(ent)];
      // seven tomb entrances do not fit near the middle of the Canyon: the rest of the level is used too
      if (!place(em, 3, 300, TW >> 1, TH >> 1, (TW >> 1) - 16) && (C.act === 1 || !place(em, 1, 600))) return null;
    }
    var specAt = {};
    (SPECIALS[id] || []).forEach(function (d) { specAt[d] = place(M[P[d].files[0]], 3, 300); });
    if (PORTAL_STAMP[id]) {
      // Act V red portal to the Hell levels: file 0 on dirt, file 1 on snow
      var hp = M[P[PORTAL_STAMP[id]].files[snow ? 1 : 0]];
      specAt.portal = place(hp, 3, 300);
      if (!specAt.portal) return null;
      specAt.portal = [specAt.portal[0] + hp.w / 2, specAt.portal[1] + hp.h / 2];
    }
    var hasWp = cv.objects.some(function (o) { return o.type === 2 && C.wp[o.id]; });
    if (L.waypoint && !hasWp) {
      var wpm = C.AC.wpSub ? M[C.M.subs[C.AC.wpSub].file] : M[P[(snow && C.AC.snowWpDef) || C.AC.wpDef].files[0]];
      if (!place(wpm, 3, 300)) return null;
    }
    // one or two shrines
    var shr = Object.keys(C.M.subs).filter(function (n) { return C.M.subs[n].type === C.AC.shrine; });
    for (var s = 0; s < 1 + rng.int(2) && shr.length; s++) place(M[C.M.subs[rng.pick(shr)].file], 2, 60);
    var fills = (OS && OS.fills) || FILLS[id] || FILLS.blood_moor, placedN = 0, tries = 0, want = Math.round(TW * TH / 190);
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
    // a portal link (Tristram from the Cairn stones) is an exit at the stone circle; other portals open
    // at the entry marker (warp style >= 8) of a stamp, e.g. the Arcane Sanctuary portal of the Canyon
    var mark = cv.warps.filter(function (w) { return w[2] >= 8; })[0];
    for (li = 0; li < links.length; li++) {
      if (!links[li].portal || !C.byId[links[li].to] || !kindOf(links[li].to, C)) continue;
      var p2;
      if (specAt[160]) p2 = nearestIn(lv, comp, (specAt[160][0] + 4.5) * SUB, (specAt[160][1] + 4.5) * SUB, 0, 30);
      else if (specAt.portal) p2 = nearestIn(lv, comp, specAt.portal[0] * SUB, specAt.portal[1] * SUB, 0, 40);
      else if (mark) p2 = nearestIn(lv, comp, mark[0], mark[1], 0, 30);
      else return null;
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
    if (PRESET_DEFS[id] && C.M.presets[PRESET_DEFS[id][0]]) return 'preset';
    if (L.drlg === 2 && C.presetOf[d2]) return 'preset';
    if (L.drlg === 1 && C.AC.quads && C.AC.quads[L.levelType]) return 'quad';
    if (L.drlg === 1 && C.AC.arcane && L.levelType === C.AC.arcaneType && C.M.mazes[d2]) return 'arcane';
    if (L.drlg === 1 && MAZE_SPECIAL[id] && C.M.mazes[d2] && C.AC.rooms && C.AC.rooms[L.levelType]) return 'maze';
    if (HELL[id] && C.M.mazes[d2] && C.AC.rooms && C.AC.rooms[L.levelType]) return 'hell';
    if (L.drlg === 3 && C.AC.jungle && L.levelType === 21) return 'jungle';
    if (L.drlg === 3 && COMPOSE[id]) return 'compose';
    if (L.drlg === 3 && (OUTDOOR_SIZE[id] || L.size)[0] >= 18 && (FILLS[id] || OUT_SET[id] || id === 'burial_grounds') && id !== 'moo_moo_farm') return 'outdoor';
    return null;
  }
  var BUILD = { preset: buildPreset, maze: buildMaze, outdoor: buildOutdoor, quad: buildQuad, arcane: buildArcane,
    jungle: buildJungle, compose: buildCompose, hell: buildHell };

  var D2G = {
    supports: function (id) {
      try { return !!kindOf(id, ctx(actOf(id))); } catch (e) { return false; }
    },
    // areas of every act whose asset groups are loaded
    get areas() {
      var out = [];
      for (var act = 1; act <= 5; act++) {
        var C;
        try { C = ctx(act); } catch (e) { continue; }
        out = out.concat(Object.keys(C.byId).filter(function (id) { return !!kindOf(id, C); }));
      }
      return out;
    },
    kind: function (id) { return kindOf(id, ctx(actOf(id))); },
    build: function (id, seed, from) {
      var C = ctx(actOf(id)), k = kindOf(id, C);
      if (!k) throw new Error('D2G: area ' + id + ' is not supported');
      seed = seed | 0;
      for (var a = 0; a < 60; a++) {
        var r = BUILD[k](id, seed, from, a, C);
        if (r && validate(r.lv, r.comp) && wpCheck(r.lv, C.byId[id], C, r.comp)) return r.lv;
      }
      throw new Error('D2G: ' + id + ' seed ' + seed + ' failed after 60 attempts');
    },
    sideOf: function (seed, a, b) { return sideOf(seed | 0, ctx(actOf(a)), a, b); },
    linksOf: function (id) { return linksOf(id, ctx(actOf(id))); }
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
    try { vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8')); } catch (e) { /* links optional */ }
    var act = actOf(a[1]);
    ['m/maps_act' + act + '.js', 'm/world_act' + act + '.js'].forEach(function (f) {
      vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'));
    });
    var lv = D2G.build(a[1], parseInt(a[2], 10), a[4]);
    fs.writeFileSync(a[3], JSON.stringify(lv, function (k, v) { return ArrayBuffer.isView(v) ? Array.prototype.slice.call(v) : v; }));
    console.log(lv.id + ' ' + lv.tw + 'x' + lv.th + ' ' + lv.tileset + ', hero ' + lv.hero + ', exits ' +
      JSON.stringify(lv.exits) + ', spawns ' + lv.spawns.length + ', waypoints ' + lv.objects.filter(function (o) { return o.kind === 'waypoint'; }).length);
  }
})(typeof window !== 'undefined' ? window : globalThis);
