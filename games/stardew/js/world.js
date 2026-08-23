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

  /* The dark-wood palette.
   *
   * The first version painted flat mid-bright colours on a checkerboard, and
   * the owner's read of the result was blunt and correct - "đồ họa pixel hiện
   * tại khá xấu... nên chuyển sang style dark wood". So: everything is pulled
   * down and warmed towards aged timber. Greens go deep and slightly olive,
   * ground goes walnut, indoor floors become dark planks, water goes to a
   * near-black teal. `t` is the texture the painter in tiles.js draws on top,
   * which is what actually replaces the checkerboard. */
  var TILE = {
    grass:   { c: '#3c6b33', c2: '#335c2c', t: 'grass' },
    dirt:    { c: '#5e442e', c2: '#523a27', t: 'soil' },
    path:    { c: '#7a6a52', c2: '#6d5e49', t: 'cobble' },
    stone:   { c: '#5a5a63', c2: '#4f4f57', t: 'cobble' },
    floor:   { c: '#6b4c30', c2: '#5e422a', t: 'plank' },
    wood:    { c: '#4e3826', c2: '#43301f', t: 'plank' },
    rug:     { c: '#6e3f4e', c2: '#603646', t: 'weave' },
    sand:    { c: '#a89268', c2: '#9c875f', t: 'grain' },
    water:   { c: '#1f4a63', c2: '#1b4058', solid: true, water: true, t: 'water' },
    deep:    { c: '#143349', c2: '#112c3f', solid: true, water: true, t: 'water' },
    lava:    { c: '#a83a14', c2: '#8e2f10', solid: true, t: 'lava' },
    wall:    { c: '#4a382b', c2: '#3f2f24', solid: true, t: 'plank' },
    rock:    { c: '#4c4c55', c2: '#43434b', solid: true, t: 'cobble' },
    darkrock:{ c: '#33333b', c2: '#2c2c33', solid: true, t: 'cobble' },
    fence:   { c: '#5e442e', c2: '#523a27', solid: true, t: 'plank' },
    tilled:  { c: '#4a3524', c2: '#402e1f', farm: true, t: 'furrow' },
    watered: { c: '#33241a', c2: '#2b1e15', farm: true, t: 'furrow' },
    snow:    { c: '#b8c4cd', c2: '#aab6bf', t: 'grain' },
    ice:     { c: '#8fb0c4', c2: '#82a2b6', t: 'grain' },
    jungle:  { c: '#255f38', c2: '#1f5330', t: 'grass' },
    void:    { c: '#0e1116', c2: '#0e1116', solid: true, t: null }
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
  Area.prototype.warp = function (x, y, to, tx, ty, needsLanding, open, close) {
    this.warps.push({ x: x, y: y, to: to, tx: tx, ty: ty,
                      needsLanding: !!needsLanding,
                      open: open == null ? null : open,
                      close: close == null ? null : close });
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

  /* The only internal 'Door <Name>' actions this build has a room for. Every
   * other one is a bedroom we do not model, and must stay scenery. */
  var ROOM_DOOR = {
    Sebastian: 'SebastianRoom', Harvey: 'HarveyRoom', Sunroom: 'Sunroom'
  };

  /* What a building looks like, keyed on the door it owns. Roof colour is what
   * makes the town readable at a glance: the player learns "green roof = the
   * carpenter" the way they do in the original. */
  var BUILDING_LOOK = {
    pierre:     { roof: '#3f6f4a', wall: '#6b4a30', sign: 'Tạp hoá' },
    saloon:     { roof: '#7d3f34', wall: '#5c3d26', sign: 'Quán rượu' },
    clinic:     { roof: '#4a6f8a', wall: '#6f5a44', sign: 'Phòng khám' },
    blacksmith: { roof: '#5a4a3f', wall: '#4e3a29', sign: 'Lò rèn' },
    joja:       { roof: '#2f4f8a', wall: '#5a5a62', sign: 'JojaMart' },
    carpenter:  { roof: '#4f7a3f', wall: '#6b4a30', sign: 'Thợ mộc' },
    marnie:     { roof: '#8a6a3a', wall: '#6b4a30', sign: 'Trại Marnie' },
    fishshop:   { roof: '#3f6f7d', wall: '#5c4630', sign: 'Tiệm cá' },
    museum:     { roof: '#6a5a7d', wall: '#6b5a4a', sign: 'Bảo tàng' },
    cc:         { roof: '#7a6a3f', wall: '#6b5540', sign: 'Nhà văn hoá' },
    manor:      { roof: '#6a4a6f', wall: '#6b4a30', sign: 'Dinh thị trưởng' },
    guild:      { roof: '#4a3f4f', wall: '#4e3a29', sign: 'Hội mạo hiểm' },
    trailer:    { roof: '#5f5a4a', wall: '#5a5245', sign: 'Nhà lưu động' },
    house:      { roof: '#8a4a3a', wall: '#6b4a30', sign: 'Nhà bạn' },
    josh:       { roof: '#6f5a3a', wall: '#5f452e', sign: 'Nhà Alex' },
    sam:        { roof: '#4a6a7a', wall: '#5f452e', sign: 'Nhà Sam' },
    haley:      { roof: '#7a5a6a', wall: '#5f452e', sign: 'Nhà Haley' },
    leah:       { roof: '#5a6a4a', wall: '#4e3a29', sign: 'Nhà Leah' },
    elliott:    { roof: '#4a5a6a', wall: '#4e3a29', sign: 'Nhà Elliott' },
    wizard:     { roof: '#4a3a6a', wall: '#3f3245', sign: 'Tháp phù thuỷ' },
    bathhouse:  { roof: '#4a6a6a', wall: '#5a4a3a', sign: 'Nhà tắm' },
    casino:     { roof: '#6a4a2a', wall: '#5a3f2a', sign: 'Sòng bạc' },
    oasis:      { roof: '#8a7a4a', wall: '#6b5a3a', sign: 'Ốc đảo' },
    tent:       { roof: '#5a5a3a', wall: '#4e4a2e', sign: 'Lều Linus' },
    greenhouse: { roof: '#3f6a5a', wall: '#5f452e', sign: 'Nhà kính' }
  };
  var BUILDING_DEFAULT = { roof: '#6a4a3a', wall: '#5f452e', sign: null };

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
      var m2 = v.match(/^LockedDoorWarp\s+(-?\d+)\s+(-?\d+)\s+(\w+)(?:\s+(\d+)\s+(\d+))?/)
            || v.match(/^Warp\s+(-?\d+)\s+(-?\d+)\s+(\w+)/);
      var target = null, tx = 0, ty = 0, open = null, close = null;
      if (m2) {
        tx = +m2[1]; ty = +m2[2]; target = m2[3];
        /* A locked door carries the hours the building is open, which is how
         * the original keeps you out of Pierre's at midnight. */
        if (m2[4]) { open = +m2[4]; close = +m2[5]; }
      } else if (/^WarpCommunityCenter\b/.test(v)) {
        target = 'CommunityCenter';
      } else {
        /* WHY a bare 'Door' is NOT a destination: inside a building, 'Door'
         * and 'Door <Name>' mark the internal doorway to a bedroom, and the
         * old pattern defaulted every one of them to CommunityCenter. That is
         * how the town hall ended up standing inside Pierre's shop, and three
         * more of it inside the saloon. Only a room this build actually has a
         * map for becomes a real door; everything else is scenery. */
        var m3 = v.match(/^Door\s+(\w+)/) || v.match(/^Warp_(\w+)_Door/);
        if (m3 && ROOM_DOOR[m3[1]]) target = ROOM_DOOR[m3[1]];
      }
      if (!target) return;
      var to = MAP_ID[target];
      if (!to) return;
      /* WHY: 'Door X' and 'WarpCommunityCenter' carry no destination tile, and
       * defaulting to (0,0) walked the player into the corner wall of every
       * such building. Leave it unset; resolveDoors() fills it in from the
       * target's own way out, which is by definition standing room. */
      a.doors.push({ x: act.x, y: act.y, to: to, target: target,
                     needsLanding: !m2, open: open, close: close });
      a.warp(act.x, act.y, to, tx, ty, !m2, open, close);
      a.obj({ x: act.x, y: act.y, kind: 'doorway', to: to,
              open: open, close: close,
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

  /* ------------------------------------------------------------- buildings
   * The extracted maps carry a collision class per tile - 2 means "building" -
   * but no art, so the whole of Pelican Town used to draw as brown mud you
   * could not walk on. Group those tiles into actual structures, give each the
   * door that belongs to it, and record which of its tiles are roof and which
   * are wall. Rendering then has something to draw a house out of, and the
   * player can tell the clinic from the saloon without walking into both. */
  function markBuildings(A) {
    for (var key in A) {
      var a = A[key];
      if (!a || !a.outdoor || !a.blocked) continue;
      var seen = new Uint8Array(a.w * a.h);
      a.bpart = new Uint8Array(a.w * a.h);   // 0 none, 1 roof, 2 wall, 3 window
      a.buildings = [];
      for (var y = 0; y < a.h; y++) {
        for (var x = 0; x < a.w; x++) {
          var i0 = y * a.w + x;
          if (seen[i0] || a.blocked[i0] !== 2) continue;
          // flood fill this structure
          var stack = [i0], cells = [], minX = x, maxX = x, minY = y, maxY = y;
          seen[i0] = 1;
          while (stack.length) {
            var i = stack.pop();
            cells.push(i);
            var cx = i % a.w, cy = (i / a.w) | 0;
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;
            var nb = [i - 1, i + 1, i - a.w, i + a.w];
            for (var n = 0; n < 4; n++) {
              var j = nb[n];
              if (j < 0 || j >= seen.length) continue;
              if (n < 2 && ((j % a.w) - cx) !== (n ? 1 : -1)) continue;  // row wrap
              if (seen[j] || a.blocked[j] !== 2) continue;
              seen[j] = 1;
              stack.push(j);
            }
          }
          /* A three-tile smear of collision is a fence post or a crate, not a
           * building; drawing a roof on it looks like a bug. */
          if (cells.length < 12) continue;
          var member = {};
          for (var c = 0; c < cells.length; c++) member[cells[c]] = 1;

          /* WHY the blob is split rather than named once: the shops of Pelican
           * Town are a terrace - Pierre's and the clinic share a wall, so the
           * collision layer hands back ONE lump with two front doors. Naming
           * the lump after the first door found made the general store vanish
           * off the map. Every door that touches the lump gets the slice of it
           * nearest to that door, which is also what the terrace looks like. */
          var doors = [], byTarget = {};
          (a.objs || []).forEach(function (o) {
            if (o.kind !== 'doorway') return;
            for (var dy = -1; dy <= 1; dy++) {
              for (var dx = -1; dx <= 1; dx++) {
                if (!member[(o.y + dy) * a.w + (o.x + dx)]) continue;
                /* A real door is two or three tiles wide and every tile of it
                 * is its own action, so the same shop would otherwise claim
                 * three slices of the terrace and hang three signs over one
                 * doorway. One entrance per destination. */
                if (byTarget[o.to]) return;
                byTarget[o.to] = 1;
                doors.push({ x: o.x, y: o.y, to: o.to });
                return;
              }
            }
          });
          var groups = [];
          if (doors.length <= 1) {
            groups.push({ door: doors[0] || null, to: doors[0] && doors[0].to,
                          cells: cells });
          } else {
            for (var g = 0; g < doors.length; g++) {
              groups.push({ door: doors[g], to: doors[g].to, cells: [] });
            }
            for (var ci0 = 0; ci0 < cells.length; ci0++) {
              var px = cells[ci0] % a.w, py = (cells[ci0] / a.w) | 0;
              var pick = 0, pd = 1e9;
              for (var g2 = 0; g2 < doors.length; g2++) {
                var dd = Math.abs(px - doors[g2].x) * 1.0
                       + Math.abs(py - doors[g2].y) * 0.6;
                if (dd < pd) { pd = dd; pick = g2; }
              }
              groups[pick].cells.push(cells[ci0]);
            }
          }

          for (var gi = 0; gi < groups.length; gi++) {
            var gr = groups[gi];
            if (!gr.cells.length) continue;
            var gxMin = 1e9, gxMax = -1, gyMin = 1e9, gyMax = -1, own = {};
            for (var q = 0; q < gr.cells.length; q++) {
              var qx = gr.cells[q] % a.w, qy = (gr.cells[q] / a.w) | 0;
              own[gr.cells[q]] = 1;
              if (qx < gxMin) gxMin = qx;
              if (qx > gxMax) gxMax = qx;
              if (qy < gyMin) gyMin = qy;
              if (qy > gyMax) gyMax = qy;
            }
            var b = { x: gxMin, y: gyMin, w: gxMax - gxMin + 1,
                      h: gyMax - gyMin + 1, cells: gr.cells,
                      door: gr.door || null, to: gr.to || null };
            /* A doorless slab the size of a district is not a building - it is
             * the treeline along the top of the farm, or a cliff. Painting a
             * shingled roof and lit windows onto eighty tiles of forest was
             * worse than the flat brown it replaced. */
            if (!b.door && (b.w > 20 || b.h > 20)) continue;
            var look = (b.to && BUILDING_LOOK[b.to]) || BUILDING_DEFAULT;
            b.roof = look.roof; b.wall = look.wall;
            b.sign = look.sign || (b.to ? (AREA_NAME_VN[b.to] || null) : null);
            for (var k = 0; k < gr.cells.length; k++) {
              var ci = gr.cells[k], cx2 = ci % a.w, cy2 = (ci / a.w) | 0;
              /* The bottom two rows of a column read as the front wall; the
               * rest is roof. That is enough for a structure to look like a
               * building from the angle this game draws from. */
              var below1 = member[(cy2 + 1) * a.w + cx2];
              var below2 = member[(cy2 + 2) * a.w + cx2];
              var part = below2 ? 1 : 2;
              if (part === 2 && !below1 && (cx2 % 3) === 1
                  && !(b.door && Math.abs(cx2 - b.door.x) < 2)) part = 3;
              a.bpart[ci] = part;
            }
            a.buildings.push(b);
          }
        }
      }
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

  /* WHY the occupancy check: nearestFree only asks whether the TERRAIN is
   * walkable, so two objects aimed at the same corner both landed on it - the
   * farmhouse had its workbench drawn inside the television. Step outward
   * until the tile is both walkable and empty. */
  function place(area, x, y, obj) {
    var taken = {};
    area.objs.forEach(function (o) { taken[o.x + ',' + o.y] = 1; });
    var f = area.nearestFree(x, y, 8);
    if (taken[f.x + ',' + f.y]) {
      var found = null;
      for (var r = 1; r <= 10 && !found; r++) {
        for (var dy = -r; dy <= r && !found; dy++) {
          for (var dx = -r; dx <= r && !found; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            var nx = x + dx, ny = y + dy;
            if (area.solid(nx, ny) || taken[nx + ',' + ny]) continue;
            found = { x: nx, y: ny };
          }
        }
      }
      if (found) f = found;
    }
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
      /* On the standard farm the house door sits at (64,15) and the shipping
       * bin beside it. The map itself carries neither - the original builds
       * both from the save file - so the cottage is stamped onto the terrain
       * here as real building collision. Without it the front door was a green
       * rectangle standing in an empty field with no house behind it, which is
       * what the owner meant by "làm cho căn nhà bên ngoài rõ ràng hơn". */
      stampBuilding(farm, 60, 10, 9, 5);
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
      /* The cottage is the upgraded 30x12 farmhouse, and everything in it is
       * placed with a gap around it.
       *
       * WHY they are spread out: the first version stood every machine on one
       * wall of a 12x12 room, and the owner's read of that was the right one -
       * "dồn 1 cục... tạo cảm giác không phát triển". A room that fills up as
       * you build is the whole reward for building. Each station gets its own
       * corner, and MACHINE_SPOTS below reserves a free tile per machine so a
       * newly-built one appears somewhere the player has not been standing. */
      place(house, 25, 5, { kind: 'bed' });               // bedroom, far room
      place(house, 27, 9, { kind: 'chest' });
      place(house, 3, 5, { kind: 'kitchen' });            // by the map's stove
      place(house, 1, 9, { kind: 'tv' });
      // a marker only: the furnace's slots and jobs live in the save, so the
      // one on the floor and the one in the workbench list are the same object
      place(house, 8, 5, { kind: 'machine', machine: 'Furnace' });
      place(house, 16, 5, { kind: 'workshop' });          // the build menu
      place(house, 12, 10, { kind: 'calendarBoard' });
      place(house, 16, 10, { kind: 'mailbox' });
      /* A rug under the middle of the living room and one at the bedside. The
       * cottage was one unbroken field of floorboards, which is a big room
       * with nothing in it - the eye needs somewhere to land. */
      for (var ry = 7; ry <= 9; ry++) {
        for (var rx = 6; rx <= 12; rx++) {
          if (!house.solid(rx, ry)) house.set(rx, ry, 'rug');
        }
      }
      for (var by = 6; by <= 8; by++) {
        for (var bx = 23; bx <= 26; bx++) {
          if (!house.solid(bx, by)) house.set(bx, by, 'rug');
        }
      }
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

  /* Stamp a building footprint onto an outdoor map. Used for the structures
   * the original creates at runtime rather than storing in the map file. */
  function stampBuilding(area, x, y, w, h) {
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var tx = x + i, ty = y + j;
        if (tx < 0 || ty < 0 || tx >= area.w || ty >= area.h) continue;
        area.blocked[ty * area.w + tx] = 2;
      }
    }
  }

  /* Where a machine goes when the player builds it. Reserved tiles, spread
   * across both rooms of the cottage, so the house visibly fills up as the
   * farm grows instead of hiding every machine behind one bench. */
  /* Ordered so consecutive builds land far apart - the first three machines
   * are what the player sees for a long time, and three in a row on one wall
   * is the clump this was supposed to break up.
   *
   * (18,9) and (19,9) are deliberately absent: row 9 is the ONLY doorway
   * between the two rooms of the cottage, and a machine standing in it would
   * seal the bedroom off. */
  var MACHINE_SPOTS = [
    [11, 5], [4, 10], [22, 4], [8, 10], [14, 5], [24, 10],
    [6, 5], [27, 5], [2, 10], [17, 4], [21, 10], [27, 10],
    [9, 4], [13, 4], [10, 10], [26, 4]
  ];

  /* Put a just-built machine somewhere the player can walk up to. Returns the
   * object that now stands in the house, or null if there is nowhere left. */
  function placeMachine(house, name) {
    if (!house) return null;
    var existing = null;
    house.objs.forEach(function (o) {
      if (o.kind === 'machine' && o.machine === name) existing = o;
    });
    if (existing) return existing;
    var taken = {};
    house.objs.forEach(function (o) { taken[o.x + ',' + o.y] = 1; });
    var spot = null;
    for (var i = 0; i < MACHINE_SPOTS.length && !spot; i++) {
      var s = MACHINE_SPOTS[i];
      if (!house.solid(s[0], s[1]) && !taken[s[0] + ',' + s[1]]) {
        spot = { x: s[0], y: s[1] };
      }
    }
    if (!spot) {
      for (var y = 4; y < house.h - 1 && !spot; y++) {
        for (var x = 1; x < house.w - 1 && !spot; x++) {
          if (!house.solid(x, y) && !taken[x + ',' + y]) spot = { x: x, y: y };
        }
      }
    }
    if (!spot) return null;
    var obj = { x: spot.x, y: spot.y, kind: 'machine', machine: name };
    house.obj(obj);
    house.block(spot.x, spot.y, true);
    return obj;
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
    markBuildings(A);
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
    mulberry32: mulberry32, scatter: scatter, place: place,
    markBuildings: markBuildings, placeMachine: placeMachine,
    stampBuilding: stampBuilding,
    MACHINE_SPOTS: MACHINE_SPOTS, BUILDING_LOOK: BUILDING_LOOK
  };
})(window);
