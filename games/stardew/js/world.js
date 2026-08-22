/*
 * world.js - the valley: tile kinds, every area's layout, and the warps
 * between them.
 *
 * Areas are built from paint operations (rect / path / water / building)
 * rather than hand-typed character grids. Same result, far less text to keep
 * consistent, and the relative layout of the original valley is readable in
 * one screen of code instead of thousands of rows of characters:
 *
 *        MOUNTAIN ---- (mine, quarry, carpenter, lake, Linus)
 *           |  \
 *   FARM - BUSSTOP - TOWN ---- (shops, community centre, museum)
 *    |                 |
 *  FOREST ---------- BEACH            DESERT (via the bus)
 *  (Marnie, Wizard, Leah)             ISLAND (via Willy's boat)
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
    this.objs = [];
    this.warps = [];
    this.outdoor = !(opt && opt.indoor);
    this.season = (opt && opt.season) || null;   // null = follows the calendar
    var b = TID[base];
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
    var t = TILE[TILE_IDS[this.at(x, y)]];
    return !!(t && t.solid);
  };
  Area.prototype.rect = function (x, y, w, h, k) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, k);
    return this;
  };
  Area.prototype.border = function (k) {
    this.rect(0, 0, this.w, 1, k); this.rect(0, this.h - 1, this.w, 1, k);
    this.rect(0, 0, 1, this.h, k); this.rect(this.w - 1, 0, 1, this.h, k);
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
  /* A building is a solid block with a door tile that warps inside. */
  Area.prototype.building = function (x, y, w, h, opt) {
    this.rect(x, y, w, h, 'wall');
    var dx = x + (opt.doorDx == null ? Math.floor(w / 2) : opt.doorDx);
    var dy = y + h - 1;
    this.set(dx, dy, 'floor');
    this.obj({ x: x, y: y, w: w, h: h, kind: 'building', label: opt.label,
               color: opt.color, roof: opt.roof, doorX: dx, doorY: dy,
               shop: opt.shop || null });
    if (opt.to) this.warp(dx, dy + 1, opt.to, opt.tx, opt.ty);
    return this;
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
    var tries = count * 40, made = 0;
    while (tries-- > 0 && made < count) {
      var x = 1 + Math.floor(rng() * (area.w - 2));
      var y = 1 + Math.floor(rng() * (area.h - 2));
      if (area.solid(x, y)) continue;
      var t = area.name_of(x, y);
      if (t !== 'grass' && t !== 'dirt' && t !== 'sand' && t !== 'snow'
          && t !== 'jungle') continue;
      if (pred && !pred(x, y)) continue;
      var clash = area.objs.some(function (o) {
        return o.kind === 'building'
          ? (x >= o.x - 1 && x < o.x + o.w + 1 && y >= o.y - 1 && y < o.y + o.h + 2)
          : (o.x === x && o.y === y);
      });
      if (clash) continue;
      var nearWarp = area.warps.some(function (w) {
        return Math.abs(w.x - x) < 2 && Math.abs(w.y - y) < 2;
      });
      if (nearWarp) continue;
      area.obj({ x: x, y: y, kind: kind });
      made++;
    }
  }

  /* Interiors share one shape: a walled room with a door at the bottom middle. */
  function room(id, name, w, h, floorKind, backTo, bx, by) {
    var r = new Area(id, name, w, h, floorKind || 'floor', { indoor: true });
    r.border('wall');
    var d = Math.floor(w / 2);
    r.set(d, h - 1, floorKind || 'floor');
    if (backTo) r.warp(d, h - 1, backTo, bx, by);
    return r;
  }

  // ------------------------------------------------------------------ areas
  function buildAll() {
    var A = {};
    var rng = mulberry32(20260823);

    // =============================================================== FARM
    var farm = new Area('farm', 'Nông trại', 48, 44, 'grass');
    farm.building(4, 3, 9, 6, { label: 'Nhà', color: '#b7563f', roof: '#8a3b2c',
                                to: 'house', tx: 7, ty: 12 });
    farm.obj({ x: 14, y: 7, kind: 'bin' });
    farm.obj({ x: 16, y: 7, kind: 'sign' });
    farm.rect(5, 30, 10, 8, 'water');
    farm.rect(6, 31, 8, 6, 'deep');
    farm.hpath(13, 34, 9, 'path', 2);
    farm.vpath(33, 9, 40, 'path', 2);
    farm.rect(18, 13, 15, 13, 'dirt');           // the field you start on
    farm.rect(2, 12, 8, 10, 'grass');
    farm.obj({ x: 40, y: 4, kind: 'farmCave' });
    farm.warp(41, 5, 'farmcave', 6, 8);
    farm.obj({ x: 36, y: 30, kind: 'greenhouseShell' });
    scatter(farm, 'tree', 30, rng);
    scatter(farm, 'rock', 20, rng);
    scatter(farm, 'weed', 24, rng);
    scatter(farm, 'stick', 16, rng);
    scatter(farm, 'grassTuft', 34, rng);
    farm.warp(47, 20, 'busstop', 2, 13);
    farm.warp(47, 21, 'busstop', 2, 14);
    farm.warp(33, 43, 'forest', 24, 2);
    farm.warp(34, 43, 'forest', 25, 2);
    A.farm = farm;

    var house = new Area('house', 'Trong nhà', 16, 13, 'wood', { indoor: true });
    house.border('wall');
    house.rect(2, 7, 6, 4, 'rug');
    house.obj({ x: 11, y: 2, kind: 'bed' });
    house.obj({ x: 2, y: 2, kind: 'tv' });
    house.obj({ x: 5, y: 2, kind: 'machine', machine: 'Furnace', slots: 1 });
    house.obj({ x: 7, y: 2, kind: 'chest' });
    house.obj({ x: 9, y: 2, kind: 'kitchen' });
    house.obj({ x: 13, y: 2, kind: 'calendarBoard' });
    house.obj({ x: 13, y: 4, kind: 'mailbox' });
    house.warp(8, 12, 'farm', 8, 10);
    A.house = house;

    var cave = room('farmcave', 'Hang nông trại', 13, 11, 'stone', 'farm', 40, 6);
    cave.rect(1, 1, 11, 3, 'darkrock');
    cave.obj({ x: 6, y: 4, kind: 'caveChoice' });
    A.farmcave = cave;

    var green = room('greenhouse', 'Nhà kính', 16, 14, 'floor', 'farm', 36, 32);
    green.rect(3, 3, 10, 8, 'dirt');
    green.season = 'Spring';    // anything grows here, any season
    A.greenhouse = green;

    // =============================================================== BUS STOP
    var bus = new Area('busstop', 'Bến xe buýt', 26, 28, 'grass');
    bus.hpath(0, 25, 13, 'path', 3);
    bus.rect(15, 4, 9, 6, 'stone');
    bus.obj({ x: 16, y: 5, kind: 'bus' });
    bus.warp(17, 7, 'desert', 12, 22);
    scatter(bus, 'tree', 12, rng);
    scatter(bus, 'grassTuft', 14, rng);
    bus.warp(0, 13, 'farm', 45, 20);
    bus.warp(0, 14, 'farm', 45, 21);
    bus.warp(25, 13, 'town', 2, 21);
    bus.warp(25, 14, 'town', 2, 22);
    bus.warp(13, 0, 'mountain', 16, 32);
    A.busstop = bus;

    // =============================================================== TOWN
    var town = new Area('town', 'Thị trấn Pelican', 56, 48, 'grass');
    town.hpath(0, 55, 21, 'path', 3);
    town.vpath(26, 5, 44, 'path', 3);
    town.rect(19, 17, 18, 11, 'path');
    town.obj({ x: 27, y: 21, kind: 'fountain' });
    town.building(5, 8, 10, 7, { label: 'Tiệm Pierre', color: '#4f7fbe', roof: '#2f5a92',
                                 to: 'pierre', tx: 7, ty: 11, shop: "Pierre's General Store" });
    town.building(31, 6, 11, 8, { label: 'Nhà văn hoá', color: '#8e7b57', roof: '#6b5b3d',
                                  to: 'cc', tx: 9, ty: 13 });
    town.building(5, 28, 10, 7, { label: 'Quán rượu', color: '#b0603a', roof: '#83432a',
                                  to: 'saloon', tx: 7, ty: 11, shop: 'Stardrop Saloon' });
    town.building(43, 24, 9, 7, { label: 'Phòng khám', color: '#d8d8e0', roof: '#a8a8b4',
                                  to: 'clinic', tx: 6, ty: 11 });
    town.building(43, 12, 9, 7, { label: 'Lò rèn', color: '#78706a', roof: '#565049',
                                  to: 'blacksmith', tx: 6, ty: 11, shop: 'Blacksmith' });
    town.building(32, 33, 10, 7, { label: 'Bảo tàng', color: '#7a6f9c', roof: '#584f75',
                                   to: 'museum', tx: 7, ty: 13 });
    town.building(16, 33, 9, 6, { label: 'Nhà Jodi', color: '#c48a4a', roof: '#936634' });
    town.building(6, 17, 8, 5, { label: 'Nhà 1-2', color: '#9a8258', roof: '#71603f' });
    town.building(45, 33, 8, 6, { label: 'JojaMart', color: '#3f6ea8', roof: '#2c4f79',
                                  to: 'joja', tx: 6, ty: 11, shop: 'JojaMart' });
    town.rect(0, 41, 56, 7, 'water');
    town.rect(0, 43, 56, 3, 'deep');
    town.rect(26, 40, 3, 8, 'path');
    town.obj({ x: 48, y: 43, kind: 'sewerGrate' });
    town.warp(48, 42, 'sewer', 8, 8);
    scatter(town, 'tree', 18, rng);
    scatter(town, 'grassTuft', 20, rng);
    town.warp(0, 21, 'busstop', 23, 13);
    town.warp(0, 22, 'busstop', 23, 14);
    town.warp(27, 47, 'beach', 26, 2);
    town.warp(55, 21, 'mountain', 2, 21);
    A.town = town;

    A.pierre = room('pierre', 'Tiệm tạp hoá Pierre', 15, 12, 'floor', 'town', 10, 16);
    A.pierre.obj({ x: 7, y: 3, kind: 'counter', keeper: 'Pierre',
                   stock: "Pierre's General Store" });
    A.saloon = room('saloon', 'Quán rượu Stardrop', 15, 12, 'wood', 'town', 10, 36);
    A.saloon.obj({ x: 7, y: 3, kind: 'counter', keeper: 'Gus', stock: 'Stardrop Saloon' });
    A.clinic = room('clinic', 'Phòng khám', 13, 11, 'floor', 'town', 47, 32);
    A.clinic.obj({ x: 6, y: 3, kind: 'counter', keeper: 'Harvey', stock: null });
    A.blacksmith = room('blacksmith', 'Lò rèn', 13, 11, 'stone', 'town', 47, 20);
    A.blacksmith.obj({ x: 6, y: 3, kind: 'counter', keeper: 'Clint', stock: 'Blacksmith' });
    A.blacksmith.obj({ x: 9, y: 3, kind: 'toolUpgrade' });
    A.blacksmith.obj({ x: 3, y: 3, kind: 'geodeCrusher' });
    A.joja = room('joja', 'JojaMart', 13, 11, 'floor', 'town', 49, 40);
    A.joja.obj({ x: 6, y: 3, kind: 'counter', keeper: 'Morris', stock: 'JojaMart' });

    var museum = room('museum', 'Bảo tàng & Thư viện', 17, 14, 'floor', 'town', 37, 41);
    museum.obj({ x: 8, y: 3, kind: 'museumDesk' });
    for (var mi = 0; mi < 8; mi++) {
      museum.obj({ x: 2 + mi * 2, y: 6, kind: 'display' });
    }
    A.museum = museum;

    var cc = new Area('cc', 'Nhà văn hoá', 20, 15, 'floor', { indoor: true });
    cc.border('wall');
    ['Crafts Room', 'Pantry', 'Fish Tank', 'Boiler Room', 'Bulletin Board', 'Vault']
      .forEach(function (r, i) {
        cc.obj({ x: 3 + (i % 3) * 6, y: 4 + Math.floor(i / 3) * 6,
                 kind: 'bundleBoard', room: r });
      });
    cc.warp(10, 14, 'town', 36, 15);
    A.cc = cc;

    // =============================================================== BEACH
    var beach = new Area('beach', 'Bãi biển', 50, 30, 'sand');
    beach.rect(0, 16, 50, 14, 'water');
    beach.rect(0, 20, 50, 10, 'deep');
    beach.building(32, 4, 9, 6, { label: 'Cửa hàng cá', color: '#4a8fa0', roof: '#356976',
                                  to: 'fishshop', tx: 6, ty: 11, shop: 'Fish Shop' });
    beach.rect(13, 14, 9, 2, 'wall');
    beach.obj({ x: 13, y: 14, kind: 'brokenBridge', w: 9 });
    beach.obj({ x: 44, y: 12, kind: 'boat' });
    scatter(beach, 'grassTuft', 6, rng);
    scatter(beach, 'forageBeach', 8, rng);
    beach.warp(26, 0, 'town', 27, 46);
    beach.warp(27, 0, 'town', 27, 46);
    A.beach = beach;
    A.fishshop = room('fishshop', 'Cửa hàng của Willy', 13, 11, 'wood', 'beach', 36, 11);
    A.fishshop.obj({ x: 6, y: 3, kind: 'counter', keeper: 'Willy', stock: 'Fish Shop' });
    A.fishshop.obj({ x: 9, y: 3, kind: 'boatTicket' });

    // =============================================================== MOUNTAIN
    var mtn = new Area('mountain', 'Núi', 48, 36, 'grass');
    mtn.rect(0, 0, 48, 6, 'rock');
    mtn.hpath(0, 47, 21, 'path', 3);
    mtn.rect(4, 25, 18, 10, 'water');
    mtn.rect(5, 26, 16, 8, 'deep');
    mtn.building(25, 11, 11, 7, { label: 'Nhà thợ mộc', color: '#7d5a3c', roof: '#5c4029',
                                  to: 'carpenter', tx: 7, ty: 11, shop: "Carpenter's Shop" });
    mtn.rect(37, 4, 7, 5, 'rock');
    mtn.obj({ x: 38, y: 6, kind: 'mineEntrance' });
    mtn.warp(39, 8, 'mine', 10, 15);
    mtn.building(10, 10, 5, 4, { label: 'Lều Linus', color: '#6b7a4a', roof: '#4c5734' });
    mtn.rect(41, 24, 6, 8, 'rock');
    mtn.obj({ x: 43, y: 26, kind: 'guildDoor' });
    mtn.warp(43, 27, 'guild', 6, 9);
    scatter(mtn, 'tree', 20, rng);
    scatter(mtn, 'rock', 16, rng);
    mtn.warp(0, 21, 'town', 53, 21);
    mtn.warp(16, 35, 'busstop', 13, 3);
    A.mountain = mtn;
    A.carpenter = room('carpenter', 'Nhà thợ mộc', 14, 12, 'wood', 'mountain', 30, 19);
    A.carpenter.obj({ x: 7, y: 3, kind: 'counter', keeper: 'Robin', stock: "Carpenter's Shop" });
    A.carpenter.obj({ x: 10, y: 3, kind: 'buildMenu' });
    A.guild = room('guild', 'Hội thợ săn', 12, 10, 'stone', 'mountain', 43, 28);
    A.guild.obj({ x: 6, y: 3, kind: 'counter', keeper: 'Marlon', stock: "Adventurer's Guild" });

    // =============================================================== FOREST
    var forest = new Area('forest', 'Rừng Cindersap', 44, 40, 'grass');
    forest.vpath(23, 0, 39, 'path', 3);
    forest.rect(4, 22, 14, 11, 'water');
    forest.rect(5, 23, 12, 9, 'deep');
    forest.building(28, 9, 10, 7, { label: 'Trại Marnie', color: '#a8653c', roof: '#7c472a',
                                    to: 'marnie', tx: 7, ty: 11, shop: "Marnie's Ranch" });
    forest.building(11, 12, 6, 5, { label: 'Nhà Leah', color: '#9a7a4a', roof: '#6f5734' });
    forest.building(3, 4, 7, 6, { label: 'Tháp phù thuỷ', color: '#5a4a78', roof: '#3d3154' });
    forest.obj({ x: 36, y: 30, kind: 'travelingCart' });
    scatter(forest, 'tree', 48, rng);
    scatter(forest, 'weed', 20, rng);
    scatter(forest, 'grassTuft', 28, rng);
    forest.warp(24, 0, 'farm', 33, 42);
    forest.warp(25, 0, 'farm', 34, 42);
    A.forest = forest;
    A.marnie = room('marnie', 'Trại Marnie', 14, 12, 'wood', 'forest', 33, 17);
    A.marnie.obj({ x: 7, y: 3, kind: 'counter', keeper: 'Marnie', stock: "Marnie's Ranch" });
    A.marnie.obj({ x: 10, y: 3, kind: 'animalShop' });

    // =============================================================== DESERT
    var desert = new Area('desert', 'Sa mạc Calico', 30, 26, 'sand');
    desert.rect(0, 0, 30, 2, 'rock');
    desert.building(4, 5, 9, 6, { label: 'Ốc đảo', color: '#c9a24a', roof: '#94742f',
                                  to: 'oasis', tx: 6, ty: 11, shop: 'Oasis' });
    desert.rect(20, 4, 7, 6, 'rock');
    desert.obj({ x: 22, y: 6, kind: 'skullEntrance' });
    desert.warp(23, 8, 'skull', 10, 15);
    desert.rect(14, 16, 8, 5, 'water');
    scatter(desert, 'desertBush', 10, rng);
    desert.warp(12, 24, 'busstop', 17, 9);
    A.desert = desert;
    A.oasis = room('oasis', 'Ốc đảo', 13, 11, 'floor', 'desert', 8, 12);
    A.oasis.obj({ x: 6, y: 3, kind: 'counter', keeper: 'Sandy', stock: 'Oasis' });

    // =============================================================== SEWER
    var sewer = room('sewer', 'Cống ngầm', 18, 14, 'stone', 'town', 48, 41);
    sewer.rect(1, 9, 16, 4, 'deep');
    sewer.obj({ x: 5, y: 4, kind: 'counter', keeper: 'Krobus', stock: 'Sewers' });
    A.sewer = sewer;

    // =============================================================== ISLAND
    var island = new Area('island', 'Đảo Gừng', 40, 32, 'jungle');
    island.rect(0, 22, 40, 10, 'water');
    island.rect(0, 26, 40, 6, 'deep');
    island.rect(4, 4, 12, 10, 'sand');
    island.rect(20, 3, 8, 7, 'rock');
    island.obj({ x: 23, y: 5, kind: 'volcanoEntrance' });
    island.warp(24, 7, 'volcano', 10, 15);
    island.rect(6, 16, 10, 5, 'dirt');           // the island farm plot
    island.obj({ x: 34, y: 12, kind: 'islandTrader' });
    scatter(island, 'palm', 16, rng);
    scatter(island, 'forageIsland', 10, rng);
    island.warp(20, 31, 'beach', 44, 13);
    A.island = island;

    // Mine / Skull Cavern / Volcano floors are generated at runtime by mine.js;
    // these are just the landing pads so a warp always has somewhere to arrive.
    A.mine = room('mine', 'Hầm mỏ', 20, 18, 'stone', 'mountain', 39, 9);
    A.skull = room('skull', 'Hang Sọ', 20, 18, 'darkrock', 'desert', 23, 9);
    A.volcano = room('volcano', 'Núi lửa', 20, 18, 'rock', 'island', 24, 8);

    return A;
  }

  global.SDV_WORLD = {
    TILE: TILE, TILE_IDS: TILE_IDS, TID: TID,
    Area: Area, buildAll: buildAll, mulberry32: mulberry32,
    scatter: scatter, room: room
  };
})(window);
