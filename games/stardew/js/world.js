/*
 * world.js - the valley, built from the REAL maps.
 *
 * data/maps.js carries the layout of 52 maps extracted from the owner's own
 * installed copy of the game: exact size, exact walkable shape, exact ground
 * type per tile, the warps between maps, and the door actions. Nothing but
 * LAYOUT is taken - every pixel on screen is still drawn by code in sprites.js.
 *
 * Everything the original spawns at runtime rather than storing in the map
 * (trees, rocks, weeds, the shipping bin, shop counters, machines) is placed
 * here, onto the real terrain.
 *
 * If data/maps.js is ever missing the game still boots: buildFallback() draws a
 * small hand-made valley so the page never dies on a missing asset.
 */
(function (global) {
  'use strict';

  var TILE = {
    grass:   { c: '#4e8f3f', c2: '#468239' },
    dirt:    { c: '#8b6b4a', c2: '#7d6042' },
    path:    { c: '#b9a582', c2: '#ab9877' },
    stone:   { c: '#8d8d96', c2: '#82828b' },
    floor:   { c: '#a9764a', c2: '#9c6c43' },
    wood:    { c: '#8d5f38', c2: '#7f5532' },
    rug:     { c: '#8d5a6b', c2: '#82535f' },
    sand:    { c: '#e0cc95', c2: '#d4bf88' },
    water:   { c: '#3f7fbf', c2: '#3873ae', solid: true, water: true },
    deep:    { c: '#2f5f9a', c2: '#2a568b', solid: true, water: true },
    lava:    { c: '#d24a1e', c2: '#b03a16', solid: true },
    wall:    { c: '#6b5140', c2: '#5d4636', solid: true },
    rock:    { c: '#6e6e78', c2: '#63636c', solid: true },
    darkrock:{ c: '#4a4a54', c2: '#42424b', solid: true },
    fence:   { c: '#8b6b4a', c2: '#7d6042', solid: true },
    tilled:  { c: '#6a4c33', c2: '#5f442d', farm: true },
    watered: { c: '#4a3524', c2: '#3f2d1f', farm: true },
    snow:    { c: '#dfe7ee', c2: '#d2dae2' },
    ice:     { c: '#bcd8e8', c2: '#aecbdd' },
    jungle:  { c: '#2f7d4a', c2: '#2a7043' },
    void:    { c: '#161a20', c2: '#161a20', solid: true }
  };
  var TILE_IDS = Object.keys(TILE);
  var TID = {};
  TILE_IDS.forEach(function (k, i) { TID[k] = i; });

  function Area(id, name, w, h, base, opt) {
    this.id = id; this.name = name; this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.blocked = new Uint8Array(w * h);   // collision straight from the map
    this.objs = [];
    this.warps = [];
    this.outdoor = !(opt && opt.indoor);
    this.season = (opt && opt.season) || null;
    var b = TID[base] || 0;
    for (var i = 0; i < this.tiles.length; i++) this.tiles[i] = b;
  }
  Area.prototype.at = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return TID.void;
    return this.tiles[y * this.w + x];
  };
  Area.prototype.set = function (x, y, k) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.tiles[y * this.w + x] = TID[k];
  };
  Area.prototype.name_of = function (x, y) { return TILE_IDS[this.at(x, y)]; };
  Area.prototype.solid = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
    if (this.blocked[y * this.w + x]) return true;
    var t = TILE[TILE_IDS[this.at(x, y)]];
    return !!(t && t.solid);
  };
  Area.prototype.block = function (x, y, on) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.blocked[y * this.w + x] = on ? 1 : 0;
  };
  Area.prototype.rect = function (x, y, w, h, k) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, k);
    return this;
  };
  Area.prototype.hpath = function (x1, x2, y, k, thick) {
    thick = thick || 2;
    for (var x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (var j = 0; j < thick; j++) this.set(x, y + j, k);
    return this;
  };
  Area.prototype.vpath = function (x, y1, y2, k, thick) {
    thick = thick || 2;
    for (var y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
      for (var i = 0; i < thick; i++) this.set(x + i, y, k);
    return this;
  };
  Area.prototype.obj = function (o) { this.objs.push(o); return this; };
  Area.prototype.warp = function (x, y, to, tx, ty, needsLanding) {
    this.warps.push({ x: x, y: y, to: to, tx: tx, ty: ty,
                      needsLanding: !!needsLanding });
    return this;
  };
  /* Nearest walkable tile to (x,y) - so a spawned object or an NPC never ends
   * up inside a wall when the real map disagrees with a guessed coordinate. */
  Area.prototype.nearestFree = function (x, y, maxR) {
    maxR = maxR || 12;
    // clamp first: a landing tile can be outside the map entirely (the cellar
    // pointed at (19,34) of a room that is not that tall), and a ring search
    // around a point off the map finds nothing.
    x = Math.max(0, Math.min(this.w - 1, x | 0));
    y = Math.max(0, Math.min(this.h - 1, y | 0));
    if (!this.solid(x, y)) return { x: x, y: y };
    for (var r = 1; r <= maxR; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var nx = x + dx, ny = y + dy;
          if (!this.solid(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    // last resort: the first standable tile anywhere. Better a long walk than
    // a player sealed inside a wall.
    for (var sy = 0; sy < this.h; sy++) {
      for (var sx = 0; sx < this.w; sx++) {
        if (!this.solid(sx, sy)) return { x: sx, y: sy };
      }
    }
    return { x: x, y: y };
  };

  /* Walkable tiles reachable from (sx,sy). Used to prove the player can
   * actually GET to a door or a shop counter, not merely that one exists. */
  function reachable(area, sx, sy) {
    var seen = {}, q = [[sx, sy]];
    if (area.solid(sx, sy)) return seen;
    seen[sx + ',' + sy] = 1;
    while (q.length) {
      var c = q.pop(), x = c[0], y = c[1];
      var n = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (var i = 0; i < 4; i++) {
        var nx = n[i][0], ny = n[i][1];
        if (nx < 0 || ny < 0 || nx >= area.w || ny >= area.h) continue;
        if (area.solid(nx, ny)) continue;
        var k = nx + ',' + ny;
        if (seen[k]) continue;
        seen[k] = 1;
        q.push([nx, ny]);
      }
    }
    return seen;
  }

  /* Open the shortest blocked span that joins (fx,fy) to (tx,ty).
   *
   * WHY this exists: the extracted collision is stricter than the original's -
   * a bridge or a ledge whose tiles sit on the Buildings layer reads as wall
   * here. That walled the mine entrance off behind the mountain lake and cut 22
   * areas out of the game. Rather than hand-editing coordinates per map, find
   * the narrowest wall between the two and carve it, the way the beach bridge
   * was found. */
  function carvePath(area, fx, fy, tx, ty, maxSpan) {
    maxSpan = maxSpan || 6;
    var from = reachable(area, fx, fy);
    if (from[tx + ',' + ty]) return 0;
    var to = reachable(area, tx, ty);
    var best = null;
    // horizontal runs
    for (var y = 0; y < area.h; y++) {
      var x = 0;
      while (x < area.w) {
        if (!area.solid(x, y)) { x++; continue; }
        var st = x;
        while (x < area.w && area.solid(x, y)) x++;
        var en = x - 1, span = en - st + 1;
        if (span > maxSpan) continue;
        var lk = (st - 1) + ',' + y, rk = (en + 1) + ',' + y;
        if ((from[lk] && to[rk]) || (to[lk] && from[rk])) {
          if (!best || span < best.span) {
            best = { span: span, horiz: true, y: y, a: st, b: en };
          }
        }
      }
    }
    // vertical runs
    for (var x2 = 0; x2 < area.w; x2++) {
      var y2 = 0;
      while (y2 < area.h) {
        if (!area.solid(x2, y2)) { y2++; continue; }
        var st2 = y2;
        while (y2 < area.h && area.solid(x2, y2)) y2++;
        var en2 = y2 - 1, span2 = en2 - st2 + 1;
        if (span2 > maxSpan) continue;
        var uk = x2 + ',' + (st2 - 1), dk = x2 + ',' + (en2 + 1);
        if ((from[uk] && to[dk]) || (to[uk] && from[dk])) {
          if (!best || span2 < best.span) {
            best = { span: span2, horiz: false, x: x2, a: st2, b: en2 };
          }
        }
      }
    }
    if (!best) return 0;
    /* Some walls are meant to stay shut until the player earns them - the beach
     * bridge is repaired by the Crafts Room bundles, and auto-carving it opened
     * the tide pools on day one. */
    if (area.noCarve) {
      for (var pi = best.a; pi <= best.b; pi++) {
        var pk = best.horiz ? (pi + ',' + best.y) : (best.x + ',' + pi);
        if (area.noCarve[pk]) return 0;
      }
    }
    for (var i = best.a; i <= best.b; i++) {
      if (best.horiz) { area.set(i, best.y, 'wood'); area.block(i, best.y, false); }
      else { area.set(best.x, i, 'wood'); area.block(best.x, i, false); }
    }
    return best.span;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function scatter(area, kind, count, rng, pred) {
    var tries = count * 60, made = 0;
    while (tries-- > 0 && made < count) {
      var x = 1 + Math.floor(rng() * (area.w - 2));
      var y = 1 + Math.floor(rng() * (area.h - 2));
      if (area.solid(x, y)) continue;
      var t = area.name_of(x, y);
      if (t !== 'grass' && t !== 'dirt' && t !== 'sand' && t !== 'snow'
          && t !== 'jungle') continue;
      if (pred && !pred(x, y)) continue;
      var clash = area.objs.some(function (o) { return o.x === x && o.y === y; });
      if (clash) continue;
      var nearWarp = area.warps.some(function (w) {
        return Math.abs(w.x - x) < 2 && Math.abs(w.y - y) < 2;
      });
      if (nearWarp) continue;
      area.obj({ x: x, y: y, kind: kind });
      made++;
    }
  }

  // ------------------------------------------------------------------ real maps
  /* SDV map name -> our area id. Anything not listed is a map this build does
   * not open, and warps pointing at it are dropped rather than dangling. */
  var MAP_ID = {
    Farm: 'farm', FarmHouse: 'house', Town: 'town', Beach: 'beach',
    Mountain: 'mountain', Forest: 'forest', BusStop: 'busstop',
    Desert: 'desert', Woods: 'woods', Railroad: 'railroad',
    Backwoods: 'backwoods', Sewer: 'sewer', Greenhouse: 'greenhouse',
    SeedShop: 'pierre', Saloon: 'saloon', Hospital: 'clinic',
    Blacksmith: 'blacksmith', JojaMart: 'joja', ScienceHouse: 'carpenter',
    AnimalShop: 'marnie', FishShop: 'fishshop', ArchaeologyHouse: 'museum',
    CommunityCenter: 'cc', AdventureGuild: 'guild', ManorHouse: 'manor',
    HaleyHouse: 'haley', SamHouse: 'sam', JoshHouse: 'josh',
    LeahHouse: 'leah', ElliottHouse: 'elliott', Trailer: 'trailer',
    WizardHouse: 'wizard', Tent: 'tent', Club: 'casino', Sunroom: 'sunroom',
    Island_S: 'island', Island_N: 'islandnorth', Island_W: 'islandwest',
    Island_E: 'islandeast', SandyHouse: 'oasis', Tunnel: 'tunnel',
    Summit: 'summit', Mine: 'mineentry', SkullCave: 'skullentry',
    Cellar: 'cellar', FarmCave: 'farmcave', BathHouse_Entry: 'bathhouse',
    BathHouse_Pool: 'bathpool', HarveyRoom: 'harveyroom',
    SebastianRoom: 'sebastianroom', AbandonedJojaMart: 'abandonedjoja'
  };

  var AREA_NAME_VN = {
    farm: 'Nông trại', house: 'Trong nhà', town: 'Thị trấn Pelican',
    beach: 'Bãi biển', mountain: 'Núi', forest: 'Rừng Cindersap',
    busstop: 'Bến xe buýt', desert: 'Sa mạc Calico', woods: 'Rừng bí mật',
    railroad: 'Đường tàu', backwoods: 'Lối sau', sewer: 'Cống ngầm',
    greenhouse: 'Nhà kính', pierre: 'Tiệm tạp hoá Pierre',
    saloon: 'Quán rượu Stardrop', clinic: 'Phòng khám', blacksmith: 'Lò rèn',
    joja: 'JojaMart', carpenter: 'Nhà thợ mộc', marnie: 'Trại Marnie',
    fishshop: 'Cửa hàng của Willy', museum: 'Bảo tàng & Thư viện',
    cc: 'Nhà văn hoá', guild: 'Hội thợ săn', manor: 'Dinh thị trưởng',
    haley: 'Nhà Haley', sam: 'Nhà Sam', josh: 'Nhà Alex', leah: 'Nhà Leah',
    elliott: 'Lều Elliott', trailer: 'Nhà lưu động', wizard: 'Tháp phù thuỷ',
    tent: 'Lều Linus', casino: 'Sòng bạc', sunroom: 'Phòng nắng',
    island: 'Đảo Gừng - bờ nam', islandnorth: 'Đảo Gừng - bắc',
    islandwest: 'Đảo Gừng - tây', islandeast: 'Đảo Gừng - đông',
    oasis: 'Ốc đảo', tunnel: 'Đường hầm', summit: 'Đỉnh núi',
    mineentry: 'Cửa hầm mỏ', skullentry: 'Cửa Hang Sọ', cellar: 'Hầm rượu',
    farmcave: 'Hang nông trại', bathhouse: 'Nhà tắm', bathpool: 'Bể tắm',
    harveyroom: 'Phòng Harvey', sebastianroom: 'Phòng Sebastian',
    abandonedjoja: 'JojaMart bỏ hoang'
  };

  function expandRLE(pairs, total) {
    var out = new Array(total), i = 0;
    for (var p = 0; p < pairs.length; p++) {
      var n = pairs[p][0], v = pairs[p][1];
      for (var k = 0; k < n; k++) out[i++] = v;
    }
    return out;
  }

  function areaFromMap(id, m) {
    var a = new Area(id, AREA_NAME_VN[id] || id, m.w, m.h, 'grass',
                     { indoor: !m.outdoor });
    var ground = expandRLE(m.ground, m.w * m.h);
    var solid = expandRLE(m.solid, m.w * m.h);
    for (var i = 0; i < ground.length; i++) {
      var k = ground[i];
      a.tiles[i] = TID[k] != null ? TID[k] : TID.grass;
      a.blocked[i] = solid[i] | 0;      // 0 free, 1 terrain, 2 building, 3 fence
    }
    // deep water in the middle of a body, so the shore reads differently
    for (var y = 1; y < m.h - 1; y++) {
      for (var x = 1; x < m.w - 1; x++) {
        if (a.name_of(x, y) !== 'water') continue;
        if (a.name_of(x - 1, y) === 'water' && a.name_of(x + 1, y) === 'water'
            && a.name_of(x, y - 1) === 'water' && a.name_of(x, y + 1) === 'water') {
          a.set(x, y, 'deep');
        }
      }
    }
    m.warps.forEach(function (w) {
      var to = MAP_ID[w.to];
      if (!to) return;
      a.warp(w.x, w.y, to, w.tx, w.ty);
    });
    a.doors = [];
    /* A door is usually two or three adjacent tiles wide, all carrying the same
     * action. Label only the first of each target, or the town reads as a wall
     * of overlapping signs. */
    var labelled = {};
    m.actions.forEach(function (act) {
      var v = act.action || '';
      var m2 = v.match(/^LockedDoorWarp\s+(-?\d+)\s+(-?\d+)\s+(\w+)/)
            || v.match(/^Warp\s+(-?\d+)\s+(-?\d+)\s+(\w+)/);
      var target = null, tx = 0, ty = 0;
      if (m2) { tx = +m2[1]; ty = +m2[2]; target = m2[3]; }
      else {
        var m3 = v.match(/^(?:Door|WarpCommunityCenter)\s*(\w+)?/);
        if (m3) { target = m3[1] || 'CommunityCenter'; }
      }
      if (!target) return;
      var to = MAP_ID[target];
      if (!to) return;
      /* WHY: 'Door X' and 'WarpCommunityCenter' carry no destination tile, and
       * defaulting to (0,0) walked the player into the corner wall of every
       * such building. Leave it unset; resolveDoors() fills it in from the
       * target's own way out, which is by definition standing room. */
      a.doors.push({ x: act.x, y: act.y, to: to, target: target,
                     needsLanding: !m2 });
      a.warp(act.x, act.y, to, tx, ty, !m2);
      a.obj({ x: act.x, y: act.y, kind: 'doorway', to: to,
              label: labelled[to] ? null : (AREA_NAME_VN[to] || target) });
      labelled[to] = true;
    });
    return a;
  }

  /* Fill in every landing tile that the map data did not supply, and make sure
   * none of them drops the player into a wall or straight back out again. */
  function resolveDoors(A) {
    for (var key in A) {
      var a = A[key];
      if (!a || !a.warps) continue;
      a.warps.forEach(function (w) {
        var dest = A[w.to];
        if (!dest) return;
        /* WHY: the original puts a warp on the row JUST OUTSIDE the walkable
         * area - the farmhouse's way out sits at y=12 of a 12-tall room, and
         * map-edge warps sit at -1. You walk into them there. Here the player
         * cannot occupy an out-of-bounds tile, so the farmhouse had no exit at
         * all and the player was sealed in. Pull every warp tile inside the
         * map, then onto ground they can actually stand on. */
        var cx = Math.max(0, Math.min(a.w - 1, w.x));
        var cy = Math.max(0, Math.min(a.h - 1, w.y));
        if (a.solid(cx, cy)) {
          var stand = a.nearestFree(cx, cy, 4);
          cx = stand.x; cy = stand.y;
        }
        w.x = cx; w.y = cy;
        if (w.needsLanding || w.tx == null || w.ty == null
            || (w.tx === 0 && w.ty === 0)) {
          // land just inside the target's own way back to us
          var back = (dest.warps || []).filter(function (v) { return v.to === key; })[0];
          if (back) {
            var inward = dest.nearestFree(back.x, Math.max(0, back.y - 1), 6);
            w.tx = inward.x; w.ty = inward.y;
          } else {
            var c = dest.nearestFree(Math.floor(dest.w / 2),
                                     Math.floor(dest.h * 0.6), 20);
            w.tx = c.x; w.ty = c.y;
          }
        }
        var free = dest.nearestFree(w.tx, w.ty, 12);
        w.tx = free.x; w.ty = free.y;
      });
    }
    /* Every door must be REACHABLE, not merely present. The mine entrance sat
     * across the mountain lake with no path, which cut 22 areas out of the
     * game. Carve the narrowest crossing wherever a door is stranded. */
    for (var ck in A) {
      var ca = A[ck];
      if (!ca || !ca.outdoor || !ca.warps.length) continue;
      var anchor = null;
      // start from a door we know the player can arrive through
      for (var oi in A) {
        var oa = A[oi];
        if (!oa || !oa.warps) continue;
        var inw = oa.warps.filter(function (v) { return v.to === ck; })[0];
        if (inw) { anchor = { x: inw.tx, y: inw.ty }; break; }
      }
      if (!anchor) anchor = ca.nearestFree(Math.floor(ca.w / 2), Math.floor(ca.h / 2), 30);
      ca.warps.forEach(function (w) {
        if (!w.to) return;
        carvePath(ca, anchor.x, anchor.y, w.x, w.y, 8);
      });
      // and the things the player must be able to stand next to
      ca.objs.forEach(function (o) {
        if (!MUST_REACH[o.kind]) return;
        var spot = ca.nearestFree(o.x, o.y + 1, 3);
        carvePath(ca, anchor.x, anchor.y, spot.x, spot.y, 8);
      });
    }

    /* Every interior needs a way out. One really had none in the data. */
    for (var k2 in A) {
      var ar = A[k2];
      if (!ar || ar.outdoor) continue;
      var hasExit = (ar.warps || []).some(function (v) { return !!v.to; });
      if (hasExit) continue;
      var fallback = A.town ? 'town' : 'farm';
      for (var other in A) {
        var o = A[other];
        if (!o || !o.warps) continue;
        var into = o.warps.filter(function (v) { return v.to === k2; })[0];
        if (into) { fallback = other; break; }
      }
      var spot = ar.nearestFree(Math.floor(ar.w / 2), ar.h - 2, 12);
      var land = A[fallback].nearestFree(Math.floor(A[fallback].w / 2),
                                         Math.floor(A[fallback].h / 2), 20);
      ar.warp(spot.x, spot.y, fallback, land.x, land.y);
      ar.obj({ x: spot.x, y: spot.y, kind: 'doorway', to: fallback,
               label: 'Lối ra' });
    }
  }

  /* An interior's door is the anchor for anything that belongs to it: shop
   * counters, NPC homes, the labels the player reads. Built once. */
  function indexDoors(areas) {
    var idx = {};
    for (var k in areas) {
      var a = areas[k];
      (a.doors || []).forEach(function (d) {
        if (!idx[d.to]) idx[d.to] = { area: k, x: d.x, y: d.y };
      });
    }
    return idx;
  }

  // ------------------------------------------------------------------ furniture
  /* What the original spawns in code rather than storing in the map. Positions
   * are snapped to the nearest walkable tile, so a wrong guess degrades into a
   * slightly-moved object instead of an unreachable one. */
  /* Objects a player has to be able to walk up to. */
  var MUST_REACH = {
    mineEntrance: 1, skullEntrance: 1, volcanoEntrance: 1, bin: 1,
    travelingCart: 1, islandTrader: 1, sign: 1, caveChoice: 1,
    /* 'boat' is deliberately absent: it sits past the broken bridge, and
     * auto-carving a path to it opened the very crossing the Crafts Room
     * bundles are supposed to repair. */
    bus: 1, sewerGrate: 1, workshop: 1, mailbox: 1, kitchen: 1, bed: 1
  };

  var INTERIOR_COUNTERS = {
    pierre: { keeper: 'Pierre', stock: "Pierre's General Store" },
    saloon: { keeper: 'Gus', stock: 'Stardrop Saloon' },
    clinic: { keeper: 'Harvey', stock: null },
    blacksmith: { keeper: 'Clint', stock: 'Blacksmith' },
    joja: { keeper: 'Morris', stock: 'JojaMart' },
    carpenter: { keeper: 'Robin', stock: "Carpenter's Shop" },
    marnie: { keeper: 'Marnie', stock: "Marnie's Ranch" },
    fishshop: { keeper: 'Willy', stock: 'Fish Shop' },
    guild: { keeper: 'Marlon', stock: "Adventurer's Guild" },
    oasis: { keeper: 'Sandy', stock: 'Oasis' },
    sewer: { keeper: 'Krobus', stock: 'Sewers' }
  };

  function place(area, x, y, obj) {
    var f = area.nearestFree(x, y, 8);
    obj.x = f.x; obj.y = f.y;
    area.obj(obj);
    return obj;
  }

  /* Put something where the player can actually reach it: a free tile that is
   * in the same walkable region as the door, with standing room beside it.
   *
   * WHY: counters were dropped at a guessed coordinate and snapped to the
   * nearest non-solid tile - which in Pierre's shop (24 disconnected regions)
   * landed behind the interior walls. You could walk in and never reach the
   * shopkeeper. Eleven stations were unusable. */
  function placeReachable(area, fromX, fromY, obj, preferX, preferY) {
    var reach = reachable(area, fromX, fromY);
    var best = null, bestD = 1e9;
    for (var y = 0; y < area.h; y++) {
      for (var x = 0; x < area.w; x++) {
        if (area.solid(x, y)) continue;
        if (area.objs.some(function (o) { return o.x === x && o.y === y; })) continue;
        // the player stands below it, so that tile must be reachable
        var below = x + ',' + (y + 1);
        var side = (x - 1) + ',' + y;
        var side2 = (x + 1) + ',' + y;
        if (!reach[below] && !reach[side] && !reach[side2]) continue;
        var d = Math.hypot(x - preferX, y - preferY);
        if (d < bestD) { bestD = d; best = { x: x, y: y }; }
      }
    }
    if (!best) return place(area, preferX, preferY, obj);
    obj.x = best.x; obj.y = best.y;
    area.obj(obj);
    return obj;
  }

  function furnish(A, rng) {
    var farm = A.farm, house = A.house;

    if (farm) {
      // On the standard farm the house door sits at (64,15) and the shipping
      // bin beside it. The map itself carries neither - the original creates
      // both from the save, so we place them onto the real terrain.
      place(farm, 71, 14, { kind: 'bin' });
      place(farm, 8, 10, { kind: 'sign' });
      farm.warp(64, 15, 'house', 9, 10);
      farm.obj({ x: 64, y: 15, kind: 'doorway', to: 'house', label: 'Nhà' });
      // the tillable field: the game marks it Diggable, we just use the dirt
      scatter(farm, 'tree', 34, rng);
      scatter(farm, 'rock', 24, rng);
      scatter(farm, 'weed', 26, rng);
      scatter(farm, 'stick', 18, rng);
      scatter(farm, 'grassTuft', 40, rng);
    }
    if (house) {
      place(house, 9, 4, { kind: 'bed' });
      place(house, 3, 4, { kind: 'tv' });
      place(house, 5, 4, { kind: 'machine', machine: 'Furnace',
                           built: true, slots: 1, jobs: [] });
      place(house, 7, 4, { kind: 'chest' });
      place(house, 11, 4, { kind: 'kitchen' });
      place(house, 2, 8, { kind: 'calendarBoard' });
      place(house, 4, 8, { kind: 'mailbox' });
    }
    /* Where the player arrives in each interior, so stations can be put within
     * walking distance of it rather than at a guessed coordinate. */
    function doorSpot(id) {
      var ia = A[id];
      for (var ok in A) {
        var oa = A[ok];
        if (!oa || !oa.warps) continue;
        var w = oa.warps.filter(function (v) { return v.to === id; })[0];
        if (w) return ia.nearestFree(w.tx, w.ty, 10);
      }
      return ia.nearestFree(Math.floor(ia.w / 2), ia.h - 3, 12);
    }

    for (var id in INTERIOR_COUNTERS) {
      var a = A[id];
      if (!a) continue;
      var c = INTERIOR_COUNTERS[id];
      var d0 = doorSpot(id);
      placeReachable(a, d0.x, d0.y,
                     { kind: 'counter', keeper: c.keeper, stock: c.stock },
                     Math.floor(a.w / 2), Math.max(2, Math.floor(a.h * 0.3)));
    }
    function station(id, kind, px, py) {
      var ar = A[id];
      if (!ar) return;
      var d = doorSpot(id);
      placeReachable(ar, d.x, d.y, { kind: kind }, px, py);
    }
    station('blacksmith', 'toolUpgrade', 3, 5);
    station('blacksmith', 'geodeCrusher', 10, 5);
    station('carpenter', 'buildMenu', 10, 5);
    station('marnie', 'animalShop', 10, 5);
    station('museum', 'museumDesk', 8, 5);
    station('fishshop', 'boatTicket', 9, 5);
    if (A.cc) {
      ['Crafts Room', 'Pantry', 'Fish Tank', 'Boiler Room', 'Bulletin Board', 'Vault']
        .forEach(function (room, i) {
          place(A.cc, 8 + (i % 3) * 14, 8 + Math.floor(i / 3) * 8,
                { kind: 'bundleBoard', room: room });
        });
    }
    /* The mountain and desert maps already warp to the mine entrance rooms,
     * so the descent lives INSIDE those rooms - which is where the original
     * puts the lift too. */
    if (A.mineentry) {
      place(A.mineentry, 17, 8, { kind: 'mineEntrance' });
    }
    if (A.skullentry) {
      place(A.skullentry, 9, 6, { kind: 'skullEntrance' });
    }
    if (A.islandnorth) {
      place(A.islandnorth, 30, 20, { kind: 'volcanoEntrance' });
      A.islandnorth.warp(30, 20, 'volcano', 10, 15);
    }
    if (A.forest) {
      place(A.forest, 27, 12, { kind: 'travelingCart' });
      scatter(A.forest, 'tree', 46, rng);
      scatter(A.forest, 'weed', 22, rng);
      scatter(A.forest, 'grassTuft', 30, rng);
    }
    if (A.mountain) {
      scatter(A.mountain, 'tree', 22, rng);
      scatter(A.mountain, 'rock', 18, rng);
    }
    if (A.town) {
      scatter(A.town, 'tree', 14, rng);
      scatter(A.town, 'grassTuft', 18, rng);
      place(A.town, 42, 57, { kind: 'sign' });          // the help-wanted board
    }
    if (A.beach) {
      // Willy's side of the beach, not across the broken bridge
      place(A.beach, 34, 36, { kind: 'boat' });
      // the broken bridge to the tide pools - the span the Crafts Room repairs
      A.beach.obj({ x: 58, y: 13, kind: 'brokenBridge', w: 4 });
      A.beach.noCarve = {};
      for (var bxx = 56; bxx <= 63; bxx++) {
        for (var byy = 11; byy <= 15; byy++) A.beach.noCarve[bxx + ',' + byy] = 1;
      }
      scatter(A.beach, 'forageBeach', 8, rng);
    }
    if (A.island) {
      place(A.island, 30, 25, { kind: 'islandTrader' });
      scatter(A.island, 'palm', 14, rng);
      scatter(A.island, 'forageIsland', 8, rng);
    }
    if (A.farmcave) place(A.farmcave, 6, 6, { kind: 'caveChoice' });

    /* The bus to the desert and the grate down to the sewer. Both were lost
     * when the hand-made maps were replaced by the extracted ones, which left
     * the desert, the oasis and Skull Cavern with no entrance at all. */
    if (A.busstop) place(A.busstop, 12, 10, { kind: 'bus' });
    if (A.town) place(A.town, 96, 100, { kind: 'sewerGrate' });

    /* WHY one workbench instead of fourteen machines on the ground: the brief
     * says these already exist and only need building, but a sprite per machine
     * scattered over the farm is clutter on a phone - the owner's words were
     * "tren mobile spam ra rac lam". One bench opens a list; each machine keeps
     * its own built state, slots and jobs. */
    if (house) place(house, 3, 4, { kind: 'workshop' });
    // anything placed is solid where it should be
    var SOLID_KINDS = { bin: 1, sign: 1, bed: 1, tv: 1, chest: 1, machine: 1,
                        kitchen: 1, calendarBoard: 1, mailbox: 1, counter: 1,
                        toolUpgrade: 1, geodeCrusher: 1, buildMenu: 1,
                        animalShop: 1, museumDesk: 1, boatTicket: 1,
                        bundleBoard: 1, mineEntrance: 1, skullEntrance: 1,
                        volcanoEntrance: 1, travelingCart: 1, boat: 1,
                        islandTrader: 1, caveChoice: 1 };
    for (var key in A) {
      A[key].objs.forEach(function (o) {
        if (SOLID_KINDS[o.kind]) A[key].block(o.x, o.y, true);
      });
    }
  }

  // ------------------------------------------------------------------ caves
  function caveStub(id, name, back, bx, by) {
    var a = new Area(id, name, 20, 18, 'stone', { indoor: true });
    for (var x = 0; x < 20; x++) { a.set(x, 0, 'rock'); a.set(x, 17, 'rock'); }
    for (var y = 0; y < 18; y++) { a.set(0, y, 'rock'); a.set(19, y, 'rock'); }
    a.warp(10, 16, back, bx, by);
    return a;
  }

  // ------------------------------------------------------------------ build
  function buildAll() {
    var maps = global.SDV_MAPS;
    if (!maps || !maps.farm) return buildFallback();
    var A = {}, rng = mulberry32(20260823);
    for (var id in maps) {
      if (id === 'cc_done') continue;         // the restored centre is a later state
      A[id] = areaFromMap(id, maps[id]);
    }
    A.mine = caveStub('mine', 'Hầm mỏ', 'mountain', 54, 8);
    A.skull = caveStub('skull', 'Hang Sọ', 'desert', 32, 12);
    A.volcano = caveStub('volcano', 'Núi lửa', 'islandnorth', 30, 22);
    if (A.greenhouse) A.greenhouse.season = 'Spring';
    /* Ginger Island grows anything year-round, same as the greenhouse - the
     * design doc lists both. Without this the island plot killed every crop at
     * the season rollover and refused out-of-season planting. */
    ['island', 'islandwest', 'islandnorth', 'islandeast'].forEach(function (k) {
      if (A[k]) A[k].season = 'Summer';
    });
    furnish(A, rng);
    resolveDoors(A);
    return A;
  }

  /* A tiny hand-made valley, used only if the extracted map bundle is absent.
   * It exists so a missing data file degrades to a playable page. */
  function buildFallback() {
    var A = {}, rng = mulberry32(1);
    var farm = new Area('farm', 'Nông trại', 44, 40, 'grass');
    farm.rect(18, 13, 14, 12, 'dirt');
    farm.rect(6, 26, 9, 7, 'water');
    scatter(farm, 'tree', 20, rng);
    scatter(farm, 'rock', 14, rng);
    farm.obj({ x: 14, y: 7, kind: 'bin' });
    farm.warp(43, 18, 'town', 2, 20);
    A.farm = farm;
    var town = new Area('town', 'Thị trấn Pelican', 40, 30, 'path');
    town.warp(0, 20, 'farm', 41, 18);
    A.town = town;
    A.mine = caveStub('mine', 'Hầm mỏ', 'farm', 20, 20);
    A.skull = caveStub('skull', 'Hang Sọ', 'farm', 20, 20);
    A.volcano = caveStub('volcano', 'Núi lửa', 'farm', 20, 20);
    return A;
  }

  global.SDV_WORLD = {
    TILE: TILE, TILE_IDS: TILE_IDS, TID: TID, MAP_ID: MAP_ID,
    AREA_NAME_VN: AREA_NAME_VN,
    Area: Area, buildAll: buildAll, buildFallback: buildFallback,
    indexDoors: indexDoors, resolveDoors: resolveDoors,
    reachable: reachable, carvePath: carvePath, placeReachable: placeReachable,
    mulberry32: mulberry32, scatter: scatter, place: place
  };
})(window);
