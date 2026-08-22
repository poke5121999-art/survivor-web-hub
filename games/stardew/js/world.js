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
  Area.prototype.warp = function (x, y, to, tx, ty) {
    this.warps.push({ x: x, y: y, to: to, tx: tx, ty: ty });
    return this;
  };
  /* Nearest walkable tile to (x,y) - so a spawned object or an NPC never ends
   * up inside a wall when the real map disagrees with a guessed coordinate. */
  Area.prototype.nearestFree = function (x, y, maxR) {
    maxR = maxR || 12;
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
    return { x: x, y: y };
  };

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
      a.doors.push({ x: act.x, y: act.y, to: to, target: target });
      a.warp(act.x, act.y, to, tx, ty);
      a.obj({ x: act.x, y: act.y, kind: 'doorway', to: to,
              label: labelled[to] ? null : (AREA_NAME_VN[to] || target) });
      labelled[to] = true;
    });
    return a;
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
      place(house, 5, 4, { kind: 'machine', machine: 'Furnace', slots: 1 });
      place(house, 7, 4, { kind: 'chest' });
      place(house, 11, 4, { kind: 'kitchen' });
      place(house, 2, 8, { kind: 'calendarBoard' });
      place(house, 4, 8, { kind: 'mailbox' });
    }
    for (var id in INTERIOR_COUNTERS) {
      var a = A[id];
      if (!a) continue;
      var c = INTERIOR_COUNTERS[id];
      place(a, Math.floor(a.w / 2), Math.max(2, Math.floor(a.h * 0.3)),
            { kind: 'counter', keeper: c.keeper, stock: c.stock });
    }
    if (A.blacksmith) {
      place(A.blacksmith, 3, 5, { kind: 'toolUpgrade' });
      place(A.blacksmith, 10, 5, { kind: 'geodeCrusher' });
    }
    if (A.carpenter) place(A.carpenter, 10, 5, { kind: 'buildMenu' });
    if (A.marnie) place(A.marnie, 10, 5, { kind: 'animalShop' });
    if (A.museum) place(A.museum, 8, 5, { kind: 'museumDesk' });
    if (A.fishshop) place(A.fishshop, 9, 5, { kind: 'boatTicket' });
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
      place(A.beach, 82, 34, { kind: 'boat' });
      // the broken bridge to the tide pools - the span the Crafts Room repairs
      A.beach.obj({ x: 58, y: 13, kind: 'brokenBridge', w: 4 });
      scatter(A.beach, 'forageBeach', 8, rng);
    }
    if (A.island) {
      place(A.island, 30, 25, { kind: 'islandTrader' });
      scatter(A.island, 'palm', 14, rng);
      scatter(A.island, 'forageIsland', 8, rng);
    }
    if (A.farmcave) place(A.farmcave, 6, 6, { kind: 'caveChoice' });
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
    furnish(A, rng);
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
    indexDoors: indexDoors,
    mulberry32: mulberry32, scatter: scatter, place: place
  };
})(window);
