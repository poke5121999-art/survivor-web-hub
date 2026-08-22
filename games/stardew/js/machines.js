/*
 * machines.js - what every machine accepts, what it gives back, and how long
 * it takes; plus the craft-then-place flow the brief asks for.
 *
 * The brief is specific about the shape of this, and the first attempt got it
 * wrong in three ways the player hit immediately:
 *   - a machine showed a RECIPE LIST instead of a slot you drop an item into
 *   - the furnace had no slots and no upgrade ("mỗi lần nâng cấp thì thêm 1 ô")
 *   - the incubator / recycler / loom / lightning rod / ore duplicator did not
 *     exist at all, and none of them could be crafted from a requirement list
 *
 * Rules below are keyed on the game's OWN item category number (carried on
 * every item as `c`), so "any fruit becomes wine" is one rule rather than 80.
 *   -79 Fruit   -75 Vegetable   -80 Flower   -6 Milk   -5 Egg
 *   -18 Animal produce   -15 Metal resource   -12 Mineral   -2 Gem
 */
(function (global) {
  'use strict';

  // 'Staircase' has no entry in the extracted object table, so the quick-use
  // row filtered it out before its own regex could see it.
  var EXTRA_ITEMS = { 'Staircase': { name: 'Staircase', sell: 0, cat: 'crafted' } };
  var CAT = { FRUIT: -79, VEG: -75, FLOWER: -80, MILK: -6, EGG: -5,
              ANIMAL: -18, METAL: -15, MINERAL: -12, GEM: -2, FISH: -4,
              JUNK: -20, SYRUP: -27, ARTISAN: -26 };

  /* A rule: does this machine take that item, and what comes out.
   * accept(item, sim) -> null, or {out, qty, mins, price, extra} */
  var MACHINES = {
    'Furnace': {
      vn: 'Lò nung', emoji: '🔥', slotsAtStart: 1, upgradable: true,
      craft: { Stone: 25, 'Copper Ore': 20 },
      needs: 'Coal',
      hint: 'Bỏ quặng vào (kèm 1 than) để ra thanh kim loại.',
      accept: function (it) {
        var T = { 'Copper Ore': ['Copper Bar', 5, 30],
                  'Iron Ore': ['Iron Bar', 5, 120],
                  'Gold Ore': ['Gold Bar', 5, 300],
                  'Iridium Ore': ['Iridium Bar', 5, 480],
                  'Quartz': ['Refined Quartz', 1, 90],
                  'Fire Quartz': ['Refined Quartz', 1, 90] };
        var r = T[it.name];
        if (!r) return null;
        return { out: r[0], need: r[1], mins: r[2], fuel: 'Coal', fuelQty: 1 };
      }
    },
    'Keg': {
      vn: 'Thùng ủ rượu', emoji: '🍷',
      craft: { Wood: 30, 'Copper Bar': 1, 'Iron Bar': 1, 'Oak Resin': 1 },
      hint: 'Quả thành rượu vang (giá ×3), rau thành nước ép (×2,25).',
      accept: function (it, sim) {
        var T = { 'Wheat': ['Beer', 1750], 'Hops': ['Pale Ale', 2250],
                  'Coffee Bean': ['Coffee', 120], 'Rice': ['Vinegar', 600],
                  'Honey': ['Mead', 600] };
        if (T[it.name]) {
          var q = it.name === 'Coffee Bean' ? 5 : 1;
          return { out: T[it.name][0], need: q, mins: T[it.name][1] };
        }
        var info = sim.itemInfo(it.name);
        if (!info) return null;
        if (info.c === CAT.FRUIT) {
          return { out: it.name + ' Wine', need: 1, mins: 10000,
                   price: Math.round(info.sell * 3), cat: 'artisan' };
        }
        if (info.c === CAT.VEG) {
          return { out: it.name + ' Juice', need: 1, mins: 6000,
                   price: Math.round(info.sell * 2.25), cat: 'artisan' };
        }
        return null;
      }
    },
    'Preserves Jar': {
      vn: 'Hũ ngâm', emoji: '🍯',
      craft: { Wood: 50, Stone: 40, Coal: 8 },
      hint: 'Quả thành mứt, rau thành dưa muối (giá = 2× gốc + 50).',
      accept: function (it, sim) {
        var info = sim.itemInfo(it.name);
        if (!info) return null;
        if (it.name === 'Roe') return { out: 'Aged Roe', need: 1, mins: 4000 };
        if (info.c === CAT.FRUIT) {
          return { out: it.name + ' Jelly', need: 1, mins: 4000,
                   price: info.sell * 2 + 50, cat: 'artisan' };
        }
        if (info.c === CAT.VEG) {
          return { out: 'Pickled ' + it.name, need: 1, mins: 4000,
                   price: info.sell * 2 + 50, cat: 'artisan' };
        }
        return null;
      }
    },
    'Mayonnaise Machine': {
      vn: 'Máy làm mayonnaise', emoji: '🥚',
      craft: { Wood: 15, Stone: 15, 'Copper Bar': 1 },
      hint: 'Bỏ trứng vào.',
      accept: function (it, sim) {
        var T = { 'Egg': 'Mayonnaise', 'Large Egg': 'Mayonnaise',
                  'Duck Egg': 'Duck Mayonnaise', 'Void Egg': 'Void Mayonnaise',
                  'Dinosaur Egg': 'Dinosaur Mayonnaise' };
        if (!T[it.name]) return null;
        return { out: T[it.name], need: 1, mins: 180 };
      }
    },
    'Cheese Press': {
      vn: 'Máy ép phô mai', emoji: '🧀',
      craft: { Wood: 45, Stone: 45, Hardwood: 10, 'Copper Bar': 1 },
      hint: 'Bỏ sữa vào.',
      accept: function (it) {
        var T = { 'Milk': 'Cheese', 'Large Milk': 'Cheese',
                  'Goat Milk': 'Goat Cheese', 'Large Goat Milk': 'Goat Cheese' };
        if (!T[it.name]) return null;
        return { out: T[it.name], need: 1, mins: 200 };
      }
    },
    'Loom': {
      vn: 'Máy dệt', emoji: '🧵',
      craft: { Wood: 60, Fiber: 30, 'Pine Tar': 1 },
      hint: 'Bỏ lông cừu vào để dệt thành vải.',
      accept: function (it) {
        if (it.name !== 'Wool') return null;
        return { out: 'Cloth', need: 1, mins: 240 };
      }
    },
    'Oil Maker': {
      vn: 'Máy ép dầu', emoji: '🫒',
      craft: { Hardwood: 20, 'Gold Bar': 1, 'Slime': 50 },
      hint: 'Nấm truffle, hạt hướng dương hoặc bắp.',
      accept: function (it) {
        var T = { 'Truffle': ['Truffle Oil', 360], 'Sunflower': ['Oil', 60],
                  'Sunflower Seeds': ['Oil', 3200], 'Corn': ['Oil', 1000] };
        if (!T[it.name]) return null;
        return { out: T[it.name][0], need: 1, mins: T[it.name][1] };
      }
    },
    'Recycling Machine': {
      vn: 'Máy tái chế', emoji: '♻️',
      craft: { Wood: 25, Stone: 25, 'Iron Bar': 1 },
      hint: 'Bỏ rác câu được vào để lấy lại nguyên liệu.',
      accept: function (it, sim) {
        var JUNK = ['Trash', 'Driftwood', 'Broken Glasses', 'Broken CD',
                    'Soggy Newspaper', 'Joja Cola'];
        if (JUNK.indexOf(it.name) < 0) return null;
        var pick = ['Stone', 'Wood', 'Coal', 'Iron Ore', 'Cloth', 'Torch'];
        return { out: pick[Math.floor(Math.random() * pick.length)],
                 need: 1, mins: 60 };
      }
    },
    'Incubator': {
      vn: 'Máy ấp trứng', emoji: '🐣',
      craft: { Wood: 40, Stone: 20, 'Copper Bar': 1 },
      hint: 'Bỏ trứng vào, vài ngày sau nở ra con non trong chuồng còn chỗ.',
      // the hatched animal is placed in a coop, never handed over as an item
      hatchOnly: true,
      accept: function (it) {
        var T = { 'Egg': 'Chicken', 'Large Egg': 'Chicken',
                  'Duck Egg': 'Duck', 'Dinosaur Egg': 'Dinosaur',
                  'Void Egg': 'Chicken', 'Ostrich Egg': 'Ostrich' };
        if (!T[it.name]) return null;
        return { out: T[it.name], need: 1, mins: 4 * 24 * 60, hatch: T[it.name] };
      }
    },
    'Crystalarium': {
      vn: 'Máy nhân quặng', emoji: '💎',
      craft: { Stone: 99, 'Gold Bar': 5, 'Iridium Bar': 2, 'Battery Pack': 1 },
      hint: 'Bỏ một viên đá quý vào, máy nhân bản nó mãi mãi.',
      accept: function (it, sim) {
        var info = sim.itemInfo(it.name);
        if (!info) return null;
        if (info.c !== CAT.GEM && info.c !== CAT.MINERAL) return null;
        var T = { Quartz: 300, Amethyst: 1200, Topaz: 1200, Emerald: 2400,
                  Aquamarine: 2400, Ruby: 2400, Jade: 2400, Diamond: 7200 };
        return { out: it.name, need: 1, mins: T[it.name] || 3000, repeat: true };
      }
    },
    'Lightning Rod': {
      vn: 'Cột thu lôi', emoji: '⚡',
      craft: { 'Iron Bar': 1, 'Refined Quartz': 1, 'Bat Wing': 5 },
      hint: 'Không cần bỏ gì. Đêm có bão thì sáng ra có pin.',
      passive: 'storm', passiveOut: 'Battery Pack', upgradable: false,
      accept: function () { return null; }
    },
    'Bee House': {
      vn: 'Tổ ong', emoji: '🐝',
      craft: { Wood: 40, Coal: 8, 'Iron Bar': 1, 'Maple Syrup': 1 },
      hint: 'Không cần bỏ gì, cứ 4 ngày cho một hũ mật.',
      passive: 'always', passiveOut: 'Honey', passiveDays: 4, upgradable: false,
      accept: function () { return null; }
    },
    'Charcoal Kiln': {
      vn: 'Lò than', emoji: '🪵',
      craft: { Wood: 20, 'Copper Bar': 2 },
      hint: 'Bỏ 10 gỗ vào để ra than.',
      accept: function (it) {
        if (it.name !== 'Wood') return null;
        return { out: 'Coal', need: 10, mins: 30 };
      }
    },
    'Seed Maker': {
      vn: 'Máy làm hạt giống', emoji: '🌱',
      craft: { Wood: 25, 'Gold Bar': 1, Coal: 10 },
      hint: 'Bỏ nông sản vào để lấy lại hạt giống của nó.',
      accept: function (it, sim) {
        var def = (sim.data.crops || []).filter(function (c) {
          return c.name === it.name;
        })[0];
        if (!def) return null;
        return { out: def.seed, need: 1, mins: 20, qty: 2 };
      }
    },
    'Cask': {
      vn: 'Thùng gỗ ủ', emoji: '🛢',
      craft: { Wood: 20, Hardwood: 1 },
      hint: 'Rượu và phô mai để trong đây sẽ lên phẩm cấp.',
      accept: function (it, sim) {
        var info = sim.itemInfo(it.name);
        if (!info || info.cat !== 'artisan') return null;
        if ((it.quality || 0) >= 3) return null;
        return { out: it.name, need: 1, mins: 7 * 24 * 60,
                 quality: (it.quality || 0) + 1 };
      }
    }
  };

  /* Which machines the player may craft and place, in the order they read. */
  var CRAFTABLE = ['Furnace', 'Keg', 'Preserves Jar', 'Mayonnaise Machine',
                   'Cheese Press', 'Loom', 'Oil Maker', 'Recycling Machine',
                   'Incubator', 'Crystalarium', 'Lightning Rod', 'Bee House',
                   'Charcoal Kiln', 'Seed Maker', 'Cask'];

  function def(name) { return MACHINES[name] || null; }

  function label(name) {
    var d = MACHINES[name];
    return d ? (d.emoji + ' ' + d.vn) : name;
  }

  /* Can this machine take that stack right now? Returns the recipe or a
   * reason string the panel can show. */
  function tryAccept(machineName, item, sim, slotsFree) {
    var d = MACHINES[machineName];
    if (!d) return { error: 'Máy này chưa dùng được' };
    if (!slotsFree) return { error: 'Hết ô, cần nâng cấp thêm ô' };
    var r = d.accept(item, sim);
    if (!r) return { error: d.hint || 'Máy này không nhận món đó' };
    if (sim.count(item.name) < r.need) {
      return { error: 'Cần ' + r.need + ' ' + item.name };
    }
    if (r.fuel && sim.count(r.fuel) < (r.fuelQty || 1)) {
      return { error: 'Thiếu ' + r.fuel };
    }
    return { recipe: r };
  }

  /* Slots. The brief: one furnace in the house, upgrade adds ONE slot each
   * time; the chest upgrades in bigger steps. */
  function slotCount(obj) {
    return Math.max(1, obj.slots || 1);
  }
  function upgradeCost(obj) {
    var n = slotCount(obj);
    return { gold: 500 * n, mats: { 'Copper Bar': 2 * n, Stone: 25 * n } };
  }

  global.SDV_MACHINES = { EXTRA_ITEMS: EXTRA_ITEMS,
    MACHINES: MACHINES, CRAFTABLE: CRAFTABLE, CAT: CAT,
    def: def, label: label, tryAccept: tryAccept,
    slotCount: slotCount, upgradeCost: upgradeCost
  };
})(window);
