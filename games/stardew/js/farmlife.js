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

  /* ------------------------------------------------------------------ hay
   * The barn economy, both ends of it.
   *
   * WHY this had to be built rather than merely capped: `overnight` used to
   * compute `hayAvailable = silos * 240` FRESH every night and decrement a
   * local variable. Nothing was stored and nothing was ever consumed, so one
   * 100g Silo removed feeding from the game permanently. The previous pass
   * found that and deliberately left it, on the grounds that making the hay
   * finite with no way to EARN hay would simply starve the animals - which was
   * the right call at the time and the reason this change is bigger than a cap.
   *
   * So: cutting grass fills the silos, animals eat from them overnight, and
   * grass grows back outside winter. Winter is the pressure - nothing grows, so
   * the autumn stockpile is what carries the barn, which is exactly the loop
   * the silo exists to serve.
   */
  FarmLife.prototype.silos = function () {
    var farm = this.game.world.areas.farm;
    if (!farm) return 0;
    return farm.objs.filter(function (o) {
      return o.farmBuilding === 'Silo';
    }).length;
  };

  FarmLife.prototype.hayCap = function () { return this.silos() * 240; };

  /* Put cut grass into the silos. Returns how much actually fitted, so the
   * caller can tell the player when the store is full rather than silently
   * swallowing the cut. */
  FarmLife.prototype.storeHay = function (n) {
    var s = this.game.sim;
    var cap = this.hayCap();
    if (cap <= 0) return 0;
    if (s.hay == null) s.hay = 0;
    var room = Math.max(0, cap - s.hay);
    var put = Math.min(room, n);
    s.hay += put;
    return put;
  };

  /* Spend hay: the silos first, then anything the player is carrying, because
   * hand-feeding out of the bag is what you do before you own a silo. */
  FarmLife.prototype.takeHay = function (n) {
    var s = this.game.sim;
    if (s.hay == null) s.hay = 0;
    var got = Math.min(s.hay, n);
    s.hay -= got;
    if (got < n) {
      var want = n - got;
      var have = s.count('Hay');
      var fromBag = Math.min(have, want);
      if (fromBag > 0 && s.take('Hay', fromBag)) got += fromBag;
    }
    return got;
  };

  /* Grass grows back, and only when the season allows it. Winter is bare on
   * purpose - it is the whole reason to stockpile. */
  FarmLife.prototype.regrowGrass = function () {
    var g = this.game, farm = g.world.areas.farm;
    if (!farm) return 0;
    if (g.sim.season() === 'Winter') return 0;
    var have = farm.objs.filter(function (o) {
      return o.kind === 'grassTuft';
    }).length;
    /* Capped so the farm does not silently fill with objects - the same
     * unbounded-list problem the tile index was built for. */
    var CAP = 90;
    if (have >= CAP) return 0;
    var want = Math.min(CAP - have, 3 + Math.floor(Math.random() * 4));
    var made = 0, tries = want * 8;
    while (made < want && tries-- > 0) {
      var x = 2 + Math.floor(Math.random() * (farm.w - 4));
      var y = 2 + Math.floor(Math.random() * (farm.h - 4));
      if (farm.name_of(x, y) !== 'grass') continue;
      if (farm.solid(x, y) || g.world.objAt(x, y, farm)) continue;
      farm.obj({ x: x, y: y, kind: 'grassTuft' });
      made++;
    }
    return made;
  };

  /* Pull down a building - but never at the cost of the animals inside it.
   *
   * WHY it refuses instead of reporting a loss: this used to move whoever it
   * could and DELETE the rest, then report it as an ordinary outcome ("mất N
   * con vì hết chỗ"). Measured at four chickens and 3,200g, with no refund, no
   * confirmation and no undo. A destructive default dressed up as a status
   * line is the worst kind: the player reads it after the fact. Now the plan is
   * checked first and the whole demolition is refused if anybody would be left
   * without a home, naming how many need space. */
  FarmLife.prototype.demolish = function (obj) {
    var g = this.game, farm = g.world.areas.farm;
    var self = this;
    var homeless = this.occupants(obj.buildingId);

    // work out where everyone would go BEFORE touching the building
    var plan = [], stranded = 0;
    var taken = {};
    homeless.forEach(function (a) {
      var def = ANIMAL_KINDS[a.kind];
      var homes = self.buildingsOfType(def.home).filter(function (h) {
        if (h.buildingId === obj.buildingId) return false;
        var used = self.occupants(h.buildingId).length + (taken[h.buildingId] || 0);
        return used < (BUILDINGS[h.farmBuilding].slots || 0);
      });
      if (homes.length) {
        taken[homes[0].buildingId] = (taken[homes[0].buildingId] || 0) + 1;
        plan.push({ animal: a, to: homes[0].buildingId });
      } else {
        stranded++;
      }
    });
    if (stranded > 0) {
      return { refused: true, stranded: stranded,
               error: 'Còn ' + stranded + ' con vật không có chỗ ở. '
                    + 'Xây thêm chuồng hoặc bán bớt rồi hãy phá.' };
    }

    this.restoreGround(obj);
    g.world.removeObj(obj, farm);
    plan.forEach(function (m) { m.animal.buildingId = m.to; });
    return { moved: plan.length, lost: 0 };
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
  /* Which seasons a standing tree bears in, for trees planted before the
   * seasons were written onto the object itself. */
  function treeSeasons(game, o) {
    var def = (game.data.fruitTrees || []).filter(function (t) {
      return t.sapling === o.sapling || t.fruit === o.fruit;
    })[0];
    return def ? def.seasons : null;
  }

  /* `where` is the area the player is standing in. It used to be hardcoded to
   * the farm, so planting a sapling in the greenhouse or on the island would
   * have taken the sapling and grown the tree somewhere the player was not -
   * the caller had to gate itself to the farm to work around it. */
  FarmLife.prototype.plantFruitTree = function (x, y, sapling, where) {
    var g = this.game;
    var farm = where || g.world.area() || g.world.areas.farm;
    if (g.world.objAt(x, y, farm)) return 'Ô này đã có thứ khác';
    if (farm.solid(x, y)) return 'Chỗ này bị vướng';
    var def = (g.data.fruitTrees || []).filter(function (t) {
      return t.sapling === sapling;
    })[0];
    if (!def) return 'Không trồng được cây này';
    /* WHY the sapling is taken here: nothing else took it. The only reason that
     * never cost anybody a tree is that no screen can reach this function yet -
     * whichever one wires it up would otherwise have planted for free. */
    if (!g.sim.take(sapling, 1)) return 'Không có ' + sapling + ' trong túi';
    farm.objs.push({
      x: x, y: y, kind: 'fruitTree', sapling: sapling,
      fruit: def.fruit, seasons: def.seasons || [], age: 0, fruits: 0
    });
    return null;
  };

  // ------------------------------------------------------------------ night
  /* Runs while the player sleeps: feed, age, produce, grow trees, water from
   * sprinklers. Anything that "happens overnight" belongs here. */
  FarmLife.prototype.overnight = function (report) {
    var g = this.game, s = g.sim, farm = g.world.areas.farm;
    var self = this;
    var profs = s.professions || {};
    // hay comes out of the store the player filled, not out of thin air
    if (s.hay == null) s.hay = this.hayCap();
    s.hay = Math.min(s.hay, this.hayCap());

    // sprinklers water their neighbours BEFORE crops are grown by sim.endDay
    /* WHY every planting area and not just the home farm: soil can be worked in
     * the greenhouse and on the island too, and the build menu offers a
     * sprinkler on any of them. This pass only ever looked at the farm, so a
     * sprinkler placed under glass cost a Copper Bar and an Iron Bar and then
     * watered nothing, for ever, with no way to tell it apart from one working. */
    [g.world.areas.farm, g.world.areas.greenhouse, g.world.areas.island]
      .filter(Boolean).forEach(function (ar) {
        ar.objs.forEach(function (o) {
          if (o.kind !== 'sprinkler') return;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (dx && dy) continue;             // plus-shape, like the basic one
              var t = ar.name_of(o.x + dx, o.y + dy);
              if (t === 'tilled') ar.set(o.x + dx, o.y + dy, 'watered');
              var c = g.world.objAt(o.x + dx, o.y + dy, ar);
              if (c && c.kind === 'crop') c.watered = true;
            }
          }
        });
      });

    var produced = [];
    this.animals.forEach(function (a) {
      var def = ANIMAL_KINDS[a.kind];
      a.age++;
      var autoFed = a.fed ? false : (self.takeHay(1) > 0);
      var fedToday = a.fed || autoFed;
      /* Coopmaster and Shepherd both promise "thân thiết nhanh hơn" and neither
       * was read anywhere in the game - a player who spent their level-10 pick
       * on one of them bought exactly nothing. Half again on the daily feeding
       * gain is what "faster" buys, and each applies only to its own barnyard. */
      var faster = (def.home === 'coop' && profs.Coopmaster)
                || (def.home === 'barn' && profs.Shepherd);
      if (fedToday) a.friendship = Math.min(1000, a.friendship + (faster ? 12 : 8));
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

    /* WHY the season is checked: a tree bore fruit every night of the year, so
     * an apple tree paid out through winter. The seasons ride on the tree so an
     * older save without them falls back to the table rather than going barren. */
    farm.objs.forEach(function (o) {
      if (o.kind !== 'fruitTree') return;
      o.age++;
      var seasons = o.seasons || treeSeasons(g, o);
      var inSeason = !seasons || !seasons.length
                     || seasons.indexOf(s.season()) >= 0;
      if (o.age >= FRUIT_TREE_DAYS && inSeason && o.fruits < 3) o.fruits++;
    });

    /* Grass grows back - the renewable end of the hay economy. It replaces a
     * trickle of at most one tuft a night, which was scenery; now it is the
     * supply line that keeps a barn alive, and it stops in winter. */
    report.grass = this.regrowGrass();
    report.hay = s.hay;
    return report;
  };

  global.SDV_FARMLIFE = {
    FarmLife: FarmLife, ANIMAL_KINDS: ANIMAL_KINDS, BUILDINGS: BUILDINGS,
    FRUIT_TREE_DAYS: FRUIT_TREE_DAYS
  };
})(window);
