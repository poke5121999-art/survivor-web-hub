/*
 * world.js - the sea, the twenty-five islands on it, and the bridges you earn.
 *
 * ONE AREA. That is the whole design change from the build this replaces,
 * which carried fifty-two maps and a warp table, and made you sit through a
 * transition every time you wanted to buy a parsnip seed. Here the entire
 * archipelago is a single 160x126 tile field: every island, every shop
 * counter, every villager, all of it resident at once. Walking from your bed
 * to the fish market is walking. There is no door in the game.
 *
 * What that buys, beyond the missing load screens:
 *   - the minimap can show the real world, because there is only one
 *   - "bay tới đảo X" is a coordinate change, not a map load
 *   - an NPC schedule is a path, never a teleport between maps
 *   - a Pokemon standing in tall grass three islands away is still simulated
 *
 * What it costs: the field is built in full on boot whether you own it or not.
 * Measured, that is 20,160 tiles and about 900 objects, built in ~14 ms and
 * held in ~200 KB. The renderer only ever touches the window on screen.
 *
 * ------------------------------------------------------------------ locking
 * Land you have not bought is BUILT but BLOCKED, and the bridge to it does not
 * exist. Buying an island unblocks its tiles and carves the bridges to every
 * neighbour you already own. Doing it this way - rather than generating the
 * island at purchase time - means the world is identical for every save at the
 * same point, the art can show a locked island in the distance as a real
 * place, and a restore is just "replay the purchases".
 *
 * The mine is the one exception to one-area: its floors are generated on
 * demand and live in their own Areas, because a hundred procedural floors is
 * not something to hold resident.
 */
(function (global) {
  'use strict';

  var ISL = global.ISL_ISLANDS;

  /* ------------------------------------------------------------------ tiles
   * A tile carries GAMEPLAY, not looks. The colours here are only the fallback
   * the renderer paints under the art, and `solid`/`farm`/`water` are what the
   * simulation actually reads. Island ground is painted by a nine-slice panel
   * chosen per island, so there is no 'grass tile' vs 'snow tile' distinction
   * to make here - `land` is land everywhere and the panel decides the colour.
   */
  var TILE = {
    sea:     { c: '#1d5c86', c2: '#18507a', solid: true, water: true },
    deep:    { c: '#123f60', c2: '#0e3450', solid: true, water: true },
    land:    { c: '#57a83e', c2: '#4c9636' },
    dirt:    { c: '#8a6844', c2: '#7b5c3c', farm: true, till: true },
    tilled:  { c: '#6b4c30', c2: '#5e422a', farm: true },
    watered: { c: '#4a3320', c2: '#3f2b1b', farm: true },
    path:    { c: '#c8a86a', c2: '#b8985c' },
    sand:    { c: '#e0c88a', c2: '#d2ba7c' },
    tall:    { c: '#3f8c34', c2: '#36792d', grass: true },   // encounter grass
    bridge:  { c: '#a3703f', c2: '#8f6136', bridge: true },
    dock:    { c: '#a3703f', c2: '#8f6136', bridge: true },
    surf:    { c: '#4f9ec4', c2: '#4590b6', water: true, wade: true },
    lava:    { c: '#c94a16', c2: '#a83a12', solid: true, hot: true },
    cliff:   { c: '#6d6a63', c2: '#5e5b55', solid: true },
    // mine-only
    stone:   { c: '#5a5a63', c2: '#4f4f57' },
    darkrock:{ c: '#33333b', c2: '#2c2c33', solid: true },
    void:    { c: '#0b1016', c2: '#0b1016', solid: true }
  };
  var TILE_IDS = Object.keys(TILE);
  var TID = {};
  TILE_IDS.forEach(function (k, i) { TID[k] = i; });

  /* Object kinds that stop you walking. Anything not listed is walked over -
   * dropped items, forage, sprinklers, floor decoration. */
  var SOLID_OBJ = {
    tree: 1, bigTree: 1, stump: 1, rock: 1, bigRock: 1, oreRock: 1,
    house: 1, shop: 1, coop: 1, barn: 1, silo: 1, bed: 1, chest: 1,
    kitchen: 1, mailbox: 1, bin: 1, calendarBoard: 1, orderBoard: 1,
    bundleBoard: 1, machine: 1, toolUpgrade: 1, geodeCrusher: 1,
    mineEntrance: 1, museumDesk: 1, display: 1, table: 1, stage: 1,
    pillar: 1, shrine: 1, skyAltar: 1, dragonNest: 1, healStone: 1,
    pcBox: 1, ivJudge: 1, evTrainer: 1, natureMint: 1, daycare: 1,
    dexResearch: 1, baitTable: 1, crabPotRack: 1, tapper: 1, trough: 1,
    workshop: 1, blackboard: 1, sign: 1, elevator: 1, fossilDig: 1,
    petBed: 1, fence: 1
  };

  /* Fixtures belong to the BUILD, not to the save. On a restore these are
   * taken fresh and the saved copies thrown away, which is what lets a change
   * to an island's layout reach somebody who already has a save. Everything
   * NOT listed comes back from the save - trees and rocks are generated too,
   * but the player CHOPS those, and rebuilding them would regrow every tree
   * they ever felled on every single load. */
  var FIXTURE = {
    house: 1, shop: 1, coop: 1, barn: 1, silo: 1, bed: 1, chest: 1,
    kitchen: 1, mailbox: 1, bin: 1, calendarBoard: 1, orderBoard: 1,
    bundleBoard: 1, toolUpgrade: 1, geodeCrusher: 1, mineEntrance: 1,
    museumDesk: 1, display: 1, table: 1, stage: 1, pillar: 1, shrine: 1,
    skyAltar: 1, dragonNest: 1, healStone: 1, pcBox: 1, ivJudge: 1,
    evTrainer: 1, natureMint: 1, daycare: 1, dexResearch: 1, baitTable: 1,
    crabPotRack: 1, tapper: 1, trough: 1, workshop: 1, blackboard: 1,
    sign: 1, elevator: 1, fossilDig: 1, petBed: 1, dock: 1
  };

  // ------------------------------------------------------------------- area
  function Area(id, name, w, h, base, opt) {
    this.id = id; this.name = name; this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.blocked = new Uint8Array(w * h);
    this.objs = [];
    this.outdoor = !(opt && opt.indoor);
    this.season = (opt && opt.season) || null;
    this.islands = [];                  // [{isl, x, y, w, h}] - sea area only
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
  Area.prototype.def = function (x, y) { return TILE[TILE_IDS[this.at(x, y)]]; };
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
  Area.prototype.obj = function (o) { this.objs.push(o); this._idx = null; return this; };

  /* Tile -> object index, rebuilt whenever the list length changes. A linear
   * scan is free on a new farm and ruinous on an old one: the contextual-action
   * probe alone asks twenty-five times a frame, and a played-in world holds
   * over a thousand objects. That is the worst shape of performance bug,
   * because it never reproduces on a fresh save - the game just gets slower the
   * longer somebody plays it. */
  Area.prototype.reindex = function () { this._idx = null; };
  Area.prototype.index = function () {
    if (this._idx && this._idxLen === this.objs.length) return this._idx;
    var idx = {};
    for (var i = 0; i < this.objs.length; i++) {
      var o = this.objs[i];
      var ow = o.w || 1, oh = o.h || 1;
      for (var dy = 0; dy < oh; dy++) {
        for (var dx = 0; dx < ow; dx++) {
          var k = (o.x + dx) + ',' + (o.y + dy);
          if (idx[k] === undefined) idx[k] = o;
        }
      }
    }
    this._idx = idx; this._idxLen = this.objs.length;
    return idx;
  };
  Area.prototype.objAt = function (x, y) {
    var hit = this.index()[x + ',' + y];
    if (hit === undefined) return null;
    var ow = hit.w || 1, oh = hit.h || 1;
    if (x >= hit.x && x < hit.x + ow && y >= hit.y && y < hit.y + oh) return hit;
    this.reindex();
    var again = this.index()[x + ',' + y];
    return again === undefined ? null : again;
  };
  Area.prototype.remove = function (o) {
    var i = this.objs.indexOf(o);
    if (i >= 0) { this.objs.splice(i, 1); this.reindex(); }
    var ow = o.w || 1, oh = o.h || 1;
    for (var dy = 0; dy < oh; dy++)
      for (var dx = 0; dx < ow; dx++) this.block(o.x + dx, o.y + dy, false);
  };
  Area.prototype.nearestFree = function (x, y, maxR) {
    maxR = maxR || 14;
    x = Math.max(0, Math.min(this.w - 1, x | 0));
    y = Math.max(0, Math.min(this.h - 1, y | 0));
    if (!this.solid(x, y)) return { x: x, y: y };
    for (var r = 1; r <= maxR; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.solid(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return { x: x, y: y };
  };

  /* Which island a world tile belongs to, or null for open sea. Built as a
   * lookup rather than a loop over 25 rects because the renderer asks per
   * visible tile, which is ~1,200 times a frame. */
  Area.prototype.islandAt = function (x, y) {
    if (!this._imap) return null;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    var i = this._imap[y * this.w + x];
    return i ? this.islands[i - 1] : null;
  };

  // ------------------------------------------------------------------- rng
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ build
  var SCATTER_ART = {
    tree:     ['Tree', 'Tree2', 'Tree3'],
    bigTree:  ['AppleTree_2', 'GrapeTree2', 'MoneyTree0'],
    stump:    ['AppleTree_Base'],
    rock:     ['Rock_0', 'Rock_1', 'Rock_2', 'Rock_3'],
    bigRock:  ['BigStone_0', 'BigStone_1', 'BigStone_2', 'BigStone_3'],
    weed:     ['BerryFlower', 'RockSeeds', 'EmeraldSeeds'],
    forage:   null,                     // art comes from the item it holds
    shell:    ['Pearl'],
    driftwood:['Wood__2']
  };

  function buildSea() {
    var sea = new Area('sea', 'Quần Đảo', ISL.WORLD_W, ISL.WORLD_H, 'sea');
    var rng = mulberry32(20260827);

    /* Deep water in the outer ring, so the edge of the world reads as ocean
     * rather than as a cut-off shelf. Purely cosmetic - both are solid. */
    for (var y = 0; y < sea.h; y++) {
      for (var x = 0; x < sea.w; x++) {
        var edge = Math.min(x, y, sea.w - 1 - x, sea.h - 1 - y);
        if (edge < 3) sea.set(x, y, 'deep');
      }
    }

    var imap = new Uint8Array(sea.w * sea.h);
    ISL.list.forEach(function (isl, n) {
      var o = ISL.originOf(isl);
      var rec = { isl: isl, id: isl.id, x: o.x, y: o.y, w: isl.w, h: isl.h,
                  ground: ISL.GROUND[isl.ground] || ISL.GROUND[0] };
      sea.islands.push(rec);
      var base = isl.sand ? 'sand' : 'land';
      sea.rect(o.x, o.y, isl.w, isl.h, base);
      for (var j = 0; j < isl.h; j++)
        for (var i = 0; i < isl.w; i++)
          imap[(o.y + j) * sea.w + (o.x + i)] = n + 1;

      paintRects(sea, o, isl.plots, 'dirt');
      paintRects(sea, o, isl.grass, 'tall');
      paintRects(sea, o, isl.surf, 'surf');
      paintRects(sea, o, isl.lava, 'lava');
      if (isl.pasture) paintRects(sea, o, [isl.pasture], 'land');
      if (isl.path) carvePath(sea, o, isl.path);

      /* A pier runs OFF the island into the sea, which is the only place the
       * world writes walkable tiles outside an island rect. It is what makes
       * deep-water fish reachable at all. */
      if (isl.pier) {
        for (var py = 0; py < isl.pier.h; py++)
          for (var px = 0; px < isl.pier.w; px++)
            sea.set(o.x + isl.pier.x + px, o.y + isl.pier.y + py, 'dock');
      }

      (isl.objs || []).forEach(function (spec) {
        var ob = {};
        for (var k in spec) ob[k] = spec[k];
        ob.x = o.x + spec.x; ob.y = o.y + spec.y;
        ob.island = isl.id; ob.gen = 1;
        sea.obj(ob);
      });

      scatterOn(sea, rec, rng);
    });
    sea._imap = imap;

    // collision for everything just placed
    sea.objs.forEach(function (ob) {
      if (!SOLID_OBJ[ob.kind]) return;
      var ow = ob.w || 1, oh = ob.h || 1;
      for (var dy = 0; dy < oh; dy++)
        for (var dx = 0; dx < ow; dx++) sea.block(ob.x + dx, ob.y + dy, true);
    });

    return sea;
  }

  function paintRects(sea, o, rects, kind) {
    if (!rects) return;
    rects.forEach(function (r) {
      for (var j = 0; j < r.h; j++)
        for (var i = 0; i < r.w; i++) sea.set(o.x + r.x + i, o.y + r.y + j, kind);
    });
  }

  function carvePath(sea, o, pts) {
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1];
      var x = a[0], y = a[1];
      while (x !== b[0] || y !== b[1]) {
        for (var t = 0; t < 2; t++) {
          if (sea.name_of(o.x + x + t, o.y + y) === 'land') sea.set(o.x + x + t, o.y + y, 'path');
        }
        if (x !== b[0]) x += x < b[0] ? 1 : -1;
        else if (y !== b[1]) y += y < b[1] ? 1 : -1;
      }
    }
  }

  /* Sprinkle the generated furniture. Placement refuses any tile that is not
   * plain island ground, which is what keeps trees out of the crop beds, off
   * the walkways and out of the tall grass a Pokemon needs to be visible in. */
  /* What the ground offers before anyone has planted anything. Kept next to
   * scatterOn because this is the only place that reads it at build time;
   * game.js spawnForage has its own seasonal table for every night after. */
  var FORAGE_BY_ISLAND = {
    home:      ['Dandelion', 'Leek', 'Horseradish', 'Wild Horseradish'],
    forest:    ['Common Mushroom', 'Morel', 'Chanterelle', 'Hazelnut', 'Fiddlehead Fern'],
    meadow:    ['Dandelion', 'Leek', 'Spring Onion', 'Sweet Pea'],
    jungle:    ['Fiddlehead Fern', 'Chanterelle', 'Coconut', 'Cave Carrot'],
    sanctuary: ['Sweet Pea', 'Crocus', 'Fairy Rose', 'Purple Mushroom'],
    beach:     ['Clam', 'Cockle', 'Mussel', 'Coral', 'Sea Urchin'],
    _default:  ['Dandelion', 'Leek', 'Common Mushroom']
  };

  function scatterOn(sea, rec, rng) {
    var s = rec.isl.scatter;
    if (!s) return;
    /* Mark the whole FOOTPRINT, not just the origin. A house is 4x3 and only
     * its top-left corner was reserved, so scatter dropped trees and rocks
     * inside buildings - and World.deserialize, which does use the footprint,
     * quietly deleted them on the first reload. Six props on six islands
     * vanished between the first day and the first save. */
    var taken = {};
    sea.objs.forEach(function (ob) {
      var ow = ob.w || 1, oh = ob.h || 1;
      for (var dy = 0; dy < oh; dy++)
        for (var dx = 0; dx < ow; dx++) taken[(ob.x + dx) + ',' + (ob.y + dy)] = 1;
    });
    for (var kind in s) {
      var want = s[kind], tries = want * 40;
      while (want > 0 && tries-- > 0) {
        var x = rec.x + 1 + Math.floor(rng() * (rec.w - 2));
        var y = rec.y + 1 + Math.floor(rng() * (rec.h - 2));
        var nm = sea.name_of(x, y);
        if (nm !== 'land' && nm !== 'sand') continue;
        if (taken[x + ',' + y]) continue;
        taken[x + ',' + y] = 1;
        var ob = { x: x, y: y, kind: kind, island: rec.id, gen: 1 };
        var art = SCATTER_ART[kind];
        if (art) ob.art = art[Math.floor(rng() * art.length)];
        /* Forage needs a NAME. Without one drawObject fell back to drawing a
         * Daffodil and pickUp fell back to giving Wood, so the twenty forage
         * pickups placed at world build looked like flowers and paid timber
         * until the first night replaced them. */
        if (kind === 'forage') {
          var fl = FORAGE_BY_ISLAND[rec.id] || FORAGE_BY_ISLAND._default;
          ob.item = fl[Math.floor(rng() * fl.length)];
        }
        if (kind === 'tree' || kind === 'bigTree') { ob.hp = kind === 'tree' ? 3 : 6; }
        if (kind === 'rock') ob.hp = 2;
        if (kind === 'bigRock') ob.hp = 5;
        sea.obj(ob);
        want--;
      }
    }
  }

  /* ------------------------------------------------------------- ownership
   * Locked land is solid, full stop. A player cannot walk onto it, and the
   * bridge that would take them there is not carved. Unlocking is the inverse
   * and nothing else: no generation, no object spawning, no save migration. */
  function applyOwnership(sea, owned) {
    for (var i = 0; i < sea.islands.length; i++) {
      var rec = sea.islands[i];
      var have = !!owned[rec.id];
      rec.owned = have;
      for (var y = rec.y; y < rec.y + rec.h; y++) {
        for (var x = rec.x; x < rec.x + rec.w; x++) {
          if (have) {
            /* Only lift the OWNERSHIP block. An object standing here put its
             * own block down and must keep it - lifting those was an early bug
             * that let the player walk through every tree on a bought island. */
            if (!sea.objAt(x, y) || !SOLID_OBJ[sea.objAt(x, y).kind]) sea.block(x, y, false);
          } else {
            sea.block(x, y, true);
          }
        }
      }
      if (rec.isl.pier) {
        var o = { x: rec.x, y: rec.y };
        for (var py = 0; py < rec.isl.pier.h; py++)
          for (var px = 0; px < rec.isl.pier.w; px++)
            sea.block(o.x + rec.isl.pier.x + px, o.y + rec.isl.pier.y + py, !have);
      }
    }
    buildBridges(sea, owned);
  }

  /* A bridge exists exactly when both islands it would join are owned. Drawing
   * them from the lattice rather than authoring them means a new island cannot
   * ship unreachable, and the walkable map is always precisely the land that
   * was paid for. */
  function buildBridges(sea, owned) {
    // wipe every previous span back to sea before re-cutting
    if (sea._bridges) {
      sea._bridges.forEach(function (t) {
        sea.set(t[0], t[1], t[2]);
        sea.block(t[0], t[1], true);
      });
    }
    var laid = [];
    sea.islands.forEach(function (a) {
      if (!owned[a.id]) return;
      ISL.neighbours(a.isl).forEach(function (bIsl) {
        if (!owned[bIsl.id]) return;
        var b = null;
        for (var i = 0; i < sea.islands.length; i++)
          if (sea.islands[i].id === bIsl.id) b = sea.islands[i];
        if (!b) return;
        // cut each channel once - do it only from the left/top island
        if (b.isl.col < a.isl.col || b.isl.row < a.isl.row) return;
        if (b.isl.col > a.isl.col) span(a, b, true, laid);
        else span(a, b, false, laid);
      });
    });
    sea._bridges = laid;

    function span(a, b, horiz, out) {
      var x, y, i;
      if (horiz) {
        var lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.h, b.y + b.h);
        y = Math.floor((lo + hi) / 2) - 1;
        for (x = a.x + a.w; x < b.x; x++) {
          for (i = 0; i < 2; i++) {
            out.push([x, y + i, sea.name_of(x, y + i)]);
            sea.set(x, y + i, 'bridge');
            sea.block(x, y + i, false);
          }
        }
      } else {
        var lo2 = Math.max(a.x, b.x), hi2 = Math.min(a.x + a.w, b.x + b.w);
        x = Math.floor((lo2 + hi2) / 2) - 1;
        for (y = a.y + a.h; y < b.y; y++) {
          for (i = 0; i < 2; i++) {
            out.push([x + i, y, sea.name_of(x + i, y)]);
            sea.set(x + i, y, 'bridge');
            sea.block(x + i, y, false);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------- mine
  /* The mine is the one place that is not the sea: a stack of generated
   * floors, held one at a time. mine.js owns the generation; this is the
   * landing pad it hands floors back to. */
  function mineFloor(depth) {
    var w = 34, h = 28;
    var a = new Area('mine', 'Hầm Mỏ tầng ' + depth, w, h, 'darkrock',
                     { indoor: true });
    var rng = mulberry32(90210 + depth * 7919);
    var cx = w >> 1, cy = h >> 1;
    // rough cave: random walkers from the middle
    for (var k = 0; k < 5; k++) {
      var x = cx, y = cy;
      for (var s = 0; s < 220; s++) {
        a.set(x, y, 'stone');
        a.set(x + 1, y, 'stone');
        a.set(x, y + 1, 'stone');
        var d = Math.floor(rng() * 4);
        x += d === 0 ? 1 : d === 1 ? -1 : 0;
        y += d === 2 ? 1 : d === 3 ? -1 : 0;
        x = Math.max(2, Math.min(w - 3, x));
        y = Math.max(2, Math.min(h - 3, y));
      }
    }
    a.entry = { x: cx, y: cy };
    a.depth = depth;
    return a;
  }

  // ------------------------------------------------------------------ build
  function buildAll() {
    var A = {};
    A.sea = buildSea();
    return A;
  }

  /* Every walkable tile reachable from (x,y). Used by the NPC pathfinder to
   * refuse a destination it can never arrive at, rather than have a villager
   * grind against a locked island all day. */
  function reachable(area, x, y) {
    var seen = {}, q = [[x, y]], n = 0;
    seen[x + ',' + y] = 1;
    while (q.length && n++ < 40000) {
      var p = q.shift();
      var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = p[0] + d[i][0], ny = p[1] + d[i][1], k = nx + ',' + ny;
        if (seen[k] || area.solid(nx, ny)) continue;
        seen[k] = 1; q.push([nx, ny]);
      }
    }
    return seen;
  }

  global.SDV_WORLD = {
    TILE: TILE, TILE_IDS: TILE_IDS, TID: TID,
    SOLID_OBJ: SOLID_OBJ, FIXTURE: FIXTURE,
    Area: Area, buildAll: buildAll, buildSea: buildSea,
    mineFloor: mineFloor,
    applyOwnership: applyOwnership, buildBridges: buildBridges,
    mulberry32: mulberry32, reachable: reachable,
    SCATTER_ART: SCATTER_ART
  };
})(window);
