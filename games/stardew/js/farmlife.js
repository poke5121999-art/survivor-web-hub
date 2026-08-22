/*
 * farmlife.js - everything on the farm that is alive or mechanical:
 * animals and their buildings, fruit trees, sprinklers, and the nightly pass
 * that produces eggs, milk, fruit and watered soil while the player sleeps.
 *
 * Animal rules from the wiki: an animal produces once it is old enough and its
 * mood allows, being petted daily and fed raises friendship, and produce
 * quality follows friendship. Buildings and their material costs come straight
 * out of the extracted buildings table.
 */
(function (global) {
  'use strict';

  var ANIMAL_KINDS = {
    Chicken:  { home: 'coop', cost: 800,  matures: 3, produce: 'Egg',    days: 1 },
    Duck:     { home: 'coop', cost: 1200, matures: 5, produce: 'Duck Egg', days: 2 },
    Rabbit:   { home: 'coop', cost: 8000, matures: 6, produce: 'Wool',   days: 4 },
    Dinosaur: { home: 'coop', cost: 0,    matures: 12, produce: 'Dinosaur Egg', days: 7 },
    Cow:      { home: 'barn', cost: 1500, matures: 5, produce: 'Milk',   days: 1 },
    Goat:     { home: 'barn', cost: 4000, matures: 5, produce: 'Goat Milk', days: 2 },
    Sheep:    { home: 'barn', cost: 8000, matures: 4, produce: 'Wool',   days: 3 },
    Pig:      { home: 'barn', cost: 16000, matures: 10, produce: 'Truffle', days: 1 }
  };

  /* Farm buildings the carpenter will put up. Costs are the extracted ones;
   * `slots` is how many animals fit, `upgradeTo` chains the three tiers. */
  var BUILDINGS = {
    Coop:        { gold: 4000,  mats: { Wood: 300, Stone: 100 }, w: 6, h: 4, slots: 4,  upgradeTo: 'Big Coop' },
    'Big Coop':  { gold: 10000, mats: { Wood: 400, Stone: 150 }, w: 6, h: 4, slots: 8,  upgradeTo: 'Deluxe Coop' },
    'Deluxe Coop': { gold: 20000, mats: { Wood: 500, Stone: 200 }, w: 6, h: 4, slots: 12 },
    Barn:        { gold: 6000,  mats: { Wood: 350, Stone: 150 }, w: 7, h: 4, slots: 4,  upgradeTo: 'Big Barn' },
    'Big Barn':  { gold: 12000, mats: { Wood: 450, Stone: 200 }, w: 7, h: 4, slots: 8,  upgradeTo: 'Deluxe Barn' },
    'Deluxe Barn': { gold: 25000, mats: { Wood: 550, Stone: 300 }, w: 7, h: 4, slots: 12 },
    Silo:        { gold: 100,   mats: { Stone: 100, Clay: 10, 'Copper Bar': 5 }, w: 3, h: 3 },
    Well:        { gold: 1000,  mats: { Stone: 75 }, w: 3, h: 3 },
    'Fish Pond': { gold: 5000,  mats: { Stone: 200, 'Green Algae': 5, Seaweed: 5 }, w: 5, h: 5 },
    Shed:        { gold: 15000, mats: { Wood: 300 }, w: 7, h: 3 },
    Stable:      { gold: 10000, mats: { Hardwood: 100, 'Iron Bar': 5 }, w: 4, h: 2 },
    Mill:        { gold: 2500,  mats: { Wood: 150, Stone: 50, Cloth: 4 }, w: 4, h: 2 }
  };

  var FRUIT_TREE_DAYS = 28;

  function FarmLife(game) {
    this.game = game;
    this.animals = [];      // {name, kind, buildingId, age, friendship, fed, petted, produceReady}
    this.nextId = 1;
  }

  FarmLife.prototype.serialize = function () {
    return { animals: this.animals, nextId: this.nextId };
  };
  FarmLife.prototype.deserialize = function (s) {
    if (!s) return;
    this.animals = s.animals || [];
    this.nextId = s.nextId || 1;
  };

  // ------------------------------------------------------------------ build
  FarmLife.prototype.canAfford = function (name) {
    var b = BUILDINGS[name], s = this.game.sim;
    if (!b) return false;
    if (s.gold < b.gold) return false;
    for (var k in b.mats) if (s.count(k) < b.mats[k]) return false;
    return true;
  };

  FarmLife.prototype.build = function (name, x, y) {
    var b = BUILDINGS[name], g = this.game, s = g.sim;
    if (!b) return 'Không có công trình này';
    if (!this.canAfford(name)) return 'Chưa đủ tiền hoặc nguyên liệu';
    var farm = g.world.areas.farm;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x + b.w > farm.w || y + b.h > farm.h) {
      return 'Ra ngoài rìa nông trại rồi';
    }
    var px = Math.floor(g.player.x), py = Math.floor(g.player.y);
    for (var j = 0; j < b.h; j++) {
      for (var i = 0; i < b.w; i++) {
        if (farm.solid(x + i, y + j)) return 'Chỗ này bị vướng';
        if (g.world.objAt(x + i, y + j, farm)) return 'Chỗ này đã có thứ khác';
        /* WHY: building over your own feet walls you in, and waking up
         * respawns you on that exact tile - the save was unrecoverable. */
        if (g.world.current === 'farm' && x + i === px && y + j === py) {
          return 'Bạn đang đứng ở đó, lùi ra rồi xây';
        }
      }
    }
    s.gold -= b.gold;
    for (var k in b.mats) s.take(k, b.mats[k]);
    var id = 'bld' + (this.nextId++);
    var under = [];
    for (var jy = 0; jy < b.h; jy++) {
      for (var ix = 0; ix < b.w; ix++) under.push(farm.name_of(x + ix, y + jy));
    }
    farm.rect(x, y, b.w, b.h, 'wall');
    farm.set(x + (b.w >> 1), y + b.h - 1, 'floor');
    farm.objs.push({
      x: x, y: y, w: b.w, h: b.h, kind: 'building', farmBuilding: name,
      buildingId: id, label: name, color: '#a8653c', roof: '#7c472a',
      doorX: x + (b.w >> 1), doorY: y + b.h - 1,
      slots: b.slots || 0, feed: 0, under: under
    });
    return null;
  };

  FarmLife.prototype.upgrade = function (obj) {
    var cur = BUILDINGS[obj.farmBuilding];
    if (!cur || !cur.upgradeTo) return 'Không nâng cấp được nữa';
    var next = cur.upgradeTo, b = BUILDINGS[next], s = this.game.sim;
    if (s.gold < b.gold) return 'Không đủ tiền';
    for (var k in b.mats) if (s.count(k) < b.mats[k]) return 'Thiếu ' + k;
    s.gold -= b.gold;
    for (var k2 in b.mats) s.take(k2, b.mats[k2]);
    obj.farmBuilding = next;
    obj.label = next;
    obj.slots = b.slots || obj.slots;
    return null;
  };

  /* Put back what the building covered instead of painting grass over a path
   * or a pond, and rehome the animals rather than deleting them. */
  FarmLife.prototype.restoreGround = function (obj) {
    var farm = this.game.world.areas.farm;
    var k = 0;
    for (var j = 0; j < obj.h; j++) {
      for (var i = 0; i < obj.w; i++) {
        farm.set(obj.x + i, obj.y + j,
                 (obj.under && obj.under[k]) || 'grass');
        farm.block(obj.x + i, obj.y + j, false);
        k++;
      }
    }
  };

  FarmLife.prototype.demolish = function (obj) {
    var g = this.game, farm = g.world.areas.farm;
    var self = this;
    var homeless = this.occupants(obj.buildingId);
    this.restoreGround(obj);
    g.world.removeObj(obj, farm);
    // move the animals somewhere with room before anything is lost
    var moved = 0, lost = 0;
    homeless.forEach(function (a) {
      var def = ANIMAL_KINDS[a.kind];
      var homes = self.buildingsOfType(def.home).filter(function (h) {
        return self.occupants(h.buildingId).length < (BUILDINGS[h.farmBuilding].slots || 0);
      });
      if (homes.length) { a.buildingId = homes[0].buildingId; moved++; }
      else {
        self.animals = self.animals.filter(function (x) { return x !== a; });
        lost++;
      }
    });
    return { moved: moved, lost: lost };
  };

  /* WHY this grew checks: move had NONE - it would happily drop a coop off the
   * map edge, on top of another building, or onto a pond, turning water into
   * permanent wall. It now runs exactly what build runs. */
  FarmLife.prototype.move = function (obj, x, y) {
    var g = this.game, farm = g.world.areas.farm;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x + obj.w > farm.w || y + obj.h > farm.h) {
      return 'Ra ngoài rìa nông trại rồi';
    }
    var px = Math.floor(g.player.x), py = Math.floor(g.player.y);
    for (var j = 0; j < obj.h; j++) {
      for (var i = 0; i < obj.w; i++) {
        var tx = x + i, ty = y + j;
        var insideOld = tx >= obj.x && tx < obj.x + obj.w
                     && ty >= obj.y && ty < obj.y + obj.h;
        if (insideOld) continue;
        if (farm.solid(tx, ty)) return 'Chỗ này bị vướng';
        var other = g.world.objAt(tx, ty, farm);
        if (other && other !== obj) return 'Chỗ này đã có thứ khác';
        if (g.world.current === 'farm' && tx === px && ty === py) {
          return 'Bạn đang đứng ở đó, lùi ra đã';
        }
      }
    }
    this.restoreGround(obj);
    var under = [];
    for (var jy = 0; jy < obj.h; jy++) {
      for (var ix = 0; ix < obj.w; ix++) under.push(farm.name_of(x + ix, y + jy));
    }
    obj.x = x; obj.y = y; obj.under = under;
    farm.rect(x, y, obj.w, obj.h, 'wall');
    farm.set(x + (obj.w >> 1), y + obj.h - 1, 'floor');
    obj.doorX = x + (obj.w >> 1); obj.doorY = y + obj.h - 1;
    return null;
  };

  // ------------------------------------------------------------------ animals
  FarmLife.prototype.buildingsOfType = function (type) {
    var farm = this.game.world.areas.farm;
    return farm.objs.filter(function (o) {
      return o.farmBuilding && (BUILDINGS[o.farmBuilding] || {}).slots
        && (type === 'coop' ? /Coop/.test(o.farmBuilding) : /Barn/.test(o.farmBuilding));
    });
  };

  FarmLife.prototype.occupants = function (buildingId) {
    return this.animals.filter(function (a) { return a.buildingId === buildingId; });
  };

  /* A bought animal walks itself into the first building that has room - the
   * brief calls this out: "pet sau khi mua thì vào nhà còn trống phù hợp". */
  FarmLife.prototype.buy = function (kind, name) {
    var def = ANIMAL_KINDS[kind], s = this.game.sim;
    if (!def) return 'Không bán loại này';
    if (s.gold < def.cost) return 'Không đủ tiền';
    var homes = this.buildingsOfType(def.home);
    var self = this;
    var home = homes.filter(function (h) {
      return self.occupants(h.buildingId).length < (BUILDINGS[h.farmBuilding].slots || 0);
    })[0];
    if (!home) {
      return def.home === 'coop' ? 'Chưa có chuồng gà còn trống'
                                 : 'Chưa có chuồng gia súc còn trống';
    }
    s.gold -= def.cost;
    this.animals.push({
      id: 'a' + (this.nextId++), kind: kind, name: name || kind,
      buildingId: home.buildingId, age: 0, friendship: 0,
      fed: false, petted: false, ready: false, sinceProduce: 0
    });
    return null;
  };

  /* Hatching is not buying: no gold changes hands, and the caller is told
   * why it failed instead of the egg vanishing in silence. */
  FarmLife.prototype.hatch = function (kind) {
    var def = ANIMAL_KINDS[kind];
    if (!def) return 'Không ấp được loại này';
    var self = this;
    var homes = this.buildingsOfType(def.home).filter(function (h) {
      return self.occupants(h.buildingId).length < (BUILDINGS[h.farmBuilding].slots || 0);
    });
    if (!homes.length) return 'Chuồng đã đầy, chưa nở được';
    this.animals.push({
      id: 'a' + (this.nextId++), kind: kind, name: kind,
      buildingId: homes[0].buildingId, age: 0, friendship: 0,
      fed: false, petted: false, ready: false, sinceProduce: 0
    });
    return null;
  };

  FarmLife.prototype.pet = function (animal) {
    if (animal.petted) return false;
    animal.petted = true;
    animal.friendship = Math.min(1000, animal.friendship + 15);
    this.game.sim.addXp('farming', 5);
    return true;
  };

  FarmLife.prototype.collect = function (animal) {
    var def = ANIMAL_KINDS[animal.kind];
    if (!animal.ready) return null;
    var q = animal.friendship > 700 ? 2 : animal.friendship > 350 ? 1 : 0;
    if (!this.game.sim.give(def.produce, 1, q)) return null;
    animal.ready = false;
    animal.sinceProduce = 0;
    this.game.sim.addXp('farming', 5);
    return def.produce;
  };

  // ------------------------------------------------------------------ trees
  FarmLife.prototype.plantFruitTree = function (x, y, sapling) {
    var g = this.game, farm = g.world.areas.farm;
    if (g.world.objAt(x, y, farm)) return 'Ô này đã có thứ khác';
    var def = (g.data.fruitTrees || []).filter(function (t) {
      return t.sapling === sapling;
    })[0];
    if (!def) return 'Không trồng được cây này';
    farm.objs.push({
      x: x, y: y, kind: 'fruitTree', sapling: sapling,
      fruit: def.fruit, age: 0, fruits: 0
    });
    return null;
  };

  // ------------------------------------------------------------------ night
  /* Runs while the player sleeps: feed, age, produce, grow trees, water from
   * sprinklers. Anything that "happens overnight" belongs here. */
  FarmLife.prototype.overnight = function (report) {
    var g = this.game, s = g.sim, farm = g.world.areas.farm;
    var self = this;
    var silos = farm.objs.filter(function (o) { return o.farmBuilding === 'Silo'; }).length;
    var hayAvailable = silos * 240;

    // sprinklers water their neighbours BEFORE crops are grown by sim.endDay
    farm.objs.forEach(function (o) {
      if (o.kind !== 'sprinkler') return;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx && dy) continue;                 // plus-shape, like the basic one
          var t = farm.name_of(o.x + dx, o.y + dy);
          if (t === 'tilled') farm.set(o.x + dx, o.y + dy, 'watered');
          var c = g.world.objAt(o.x + dx, o.y + dy, farm);
          if (c && c.kind === 'crop') c.watered = true;
        }
      }
    });

    var produced = [];
    this.animals.forEach(function (a) {
      var def = ANIMAL_KINDS[a.kind];
      a.age++;
      var autoFed = hayAvailable > 0;
      if (autoFed) hayAvailable--;
      var fedToday = a.fed || autoFed;
      if (fedToday) a.friendship = Math.min(1000, a.friendship + 8);
      else a.friendship = Math.max(0, a.friendship - 20);
      if (!a.petted) a.friendship = Math.max(0, a.friendship - 5);
      a.fed = false; a.petted = false;
      a.sinceProduce++;
      if (a.age >= def.matures && fedToday && a.sinceProduce >= def.days && !a.ready) {
        a.ready = true;
        produced.push(a.kind);
      }
    });
    report.animalProduce = produced.length;

    farm.objs.forEach(function (o) {
      if (o.kind !== 'fruitTree') return;
      o.age++;
      if (o.age >= FRUIT_TREE_DAYS && o.fruits < 3) o.fruits++;
    });

    // grass spreads back so the farm never becomes bare
    if (Math.random() < 0.6) {
      var tries = 6;
      while (tries--) {
        var x = 2 + Math.floor(Math.random() * (farm.w - 4));
        var y = 2 + Math.floor(Math.random() * (farm.h - 4));
        if (farm.name_of(x, y) === 'grass' && !g.world.objAt(x, y, farm)) {
          farm.objs.push({ x: x, y: y, kind: 'grassTuft' });
          break;
        }
      }
    }
    return report;
  };

  global.SDV_FARMLIFE = {
    FarmLife: FarmLife, ANIMAL_KINDS: ANIMAL_KINDS, BUILDINGS: BUILDINGS,
    FRUIT_TREE_DAYS: FRUIT_TREE_DAYS
  };
})(window);
