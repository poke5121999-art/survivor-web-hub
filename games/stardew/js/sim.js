/*
 * sim.js - the clock underneath everything: time, season, weather, daily luck,
 * energy, inventory, crop growth, friendship, skills, and the save file.
 *
 * Numbers here come from docs/proposals/stardew-web.md, which cites the wiki:
 *   day runs 6:00 -> 26:00 (2am) in 10-minute steps; 28 days a season;
 *   daily luck is a value in [-0.1, +0.1]; base max energy 270;
 *   250 friendship points per heart; gift values +80/+45/+20/-20/-40, x8 on a
 *   birthday; quality multipliers 1 / 1.25 / 1.5 / 2.
 */
(function (global) {
  'use strict';

  var SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
  var SEASON_VN = { Spring: 'Xuân', Summer: 'Hạ', Fall: 'Thu', Winter: 'Đông' };
  // Spring 1 of Year 1 is a MONDAY in the original, so day 1 -> T2.
  var DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  var DAY_START = 6 * 60;      // 6:00 AM
  var DAY_END = 26 * 60;       // 2:00 AM next day
  var STEP = 10;               // minutes per tick
  var SEC_PER_STEP = 7;        // real seconds per in-game 10 minutes
  var QUALITY_MULT = [1, 1.25, 1.5, 2];
  var GIFT_POINTS = { love: 80, like: 45, neutral: 20, dislike: -20, hate: -40 };
  var POINTS_PER_HEART = 250;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* Snow only in winter; rain never in winter. */
  function weatherAllowed(season, w) {
    if (season === 'Winter') return w === 'snow' || w === 'sun' || w === 'wind';
    return w !== 'snow';
  }

  function Sim(data) {
    this.data = data;
    this.reset();
  }

  Sim.prototype.reset = function () {
    this.year = 1;
    this.seasonIndex = 0;
    this.day = 1;
    this.time = DAY_START;
    this.gold = 500;
    this.energy = 270;
    this.maxEnergy = 270;
    this.health = 100;
    this.maxHealth = 100;
    this.luck = 0;
    this.weather = 'sun';
    this.tomorrowWeather = 'sun';
    this.inventory = [];
    this.invSize = 24;
    this.chest = [];
    this.chestSize = 18;
    this.shipped = [];
    this.totalEarnings = 0;
    this.skills = { farming: 0, mining: 0, foraging: 0, fishing: 0, combat: 0 };
    this.skillXp = { farming: 0, mining: 0, foraging: 0, fishing: 0, combat: 0 };
    this.friendship = {};      // name -> {points, giftsThisWeek, talkedToday, lastGiftDay}
    this.museum = [];
    this.bundlesDone = {};
    this.crafted = {};
    this.flags = {};
    this.exhausted = false;
    this.seedRng = 12345;
    this.mineDepth = 0;
    this.deepestMine = 0;
    // combat + tools
    this.weapon = { name: 'Rusty Sword', dmg: 5 };
    this.armor = 0;
    this.invuln = 0;
    this.toolTier = 0;
    this.toolPower = 1;
    this.professions = {};
    this.hasBoat = false;
    this.spouse = null;
    this.dating = {};        // must persist: losing it re-charged the bouquet
    this.sluggish = false;
  };

  // ------------------------------------------------------------ time
  Sim.prototype.season = function () { return SEASONS[this.seasonIndex]; };
  Sim.prototype.seasonVN = function () { return SEASON_VN[this.season()]; };
  Sim.prototype.dayOfWeek = function () {
    return DAYS[((this.day - 1) % 7 + 7) % 7];
  };
  Sim.prototype.dayIndex = function () {
    return (this.year - 1) * 112 + this.seasonIndex * 28 + (this.day - 1);
  };
  Sim.prototype.clockText = function () {
    var t = this.time % (24 * 60);
    var h = Math.floor(t / 60), m = t % 60;
    var ap = h >= 12 && h < 24 ? 'PM' : 'AM';
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  };
  Sim.prototype.isNight = function () { return this.time >= 18 * 60; };

  /* Advance the clock. Returns true when the player collapses (past 2am). */
  Sim.prototype.tick = function () {
    this.time += STEP;
    if (this.time >= DAY_END) return true;
    return false;
  };

  // ------------------------------------------------------------ weather + luck
  Sim.prototype.rollWeather = function (seasonIndex, day) {
    var si = seasonIndex == null ? this.seasonIndex : seasonIndex;
    var dy = day == null ? this.day : day;
    var s = SEASONS[si], r = this.rand();
    // Year 1 spring is scripted so the opening days are predictable.
    if (this.year === 1 && si === 0) {
      if ([1, 2, 4, 5].indexOf(dy) >= 0) return 'sun';
      if (dy === 3) return 'rain';
    }
    if (s === 'Winter') return r < 0.63 ? 'snow' : 'sun';   // never rains in winter
    if (s === 'Spring') return r < 0.18 ? 'rain' : (r < 0.24 ? 'wind' : 'sun');
    if (s === 'Summer') return r < 0.12 ? (r < 0.05 ? 'storm' : 'rain') : 'sun';
    return r < 0.18 ? 'rain' : (r < 0.36 ? 'wind' : 'sun');  // Fall is windy
  };

  Sim.prototype.rand = function () {
    // deterministic per-save stream so a reloaded day behaves the same
    this.seedRng = (this.seedRng * 1664525 + 1013904223) >>> 0;
    return this.seedRng / 4294967296;
  };

  Sim.prototype.rollLuck = function () {
    // wiki: 201 possible values evenly spread over [-0.1, +0.1]
    this.luck = (Math.floor(this.rand() * 201) - 100) / 1000;
  };

  Sim.prototype.luckText = function () {
    if (this.luck > 0.07) return 'Thần may mắn đang rất vui';
    if (this.luck > 0.02) return 'Hôm nay hơi hên';
    if (this.luck > -0.02) return 'Bình thường';
    if (this.luck > -0.07) return 'Hơi xui';
    return 'Rất xui';
  };

  // ------------------------------------------------------------ inventory
  Sim.prototype.itemInfo = function (name) {
    return this.data.items[String(name).toLowerCase()] || null;
  };
  Sim.prototype.sellPrice = function (name, quality) {
    var it = this.itemInfo(name);
    if (!it) return 0;
    return Math.floor(it.sell * QUALITY_MULT[quality || 0]);
  };

  function sameStack(a, name, quality) {
    return a && a.name === name && (a.quality || 0) === (quality || 0);
  }

  Sim.prototype.give = function (name, qty, quality, list) {
    qty = qty == null ? 1 : qty;
    quality = quality || 0;
    var inv = list || this.inventory;
    /* WHY the cap is chosen by which list this actually is, not by whether an
     * argument was passed: a caller that spelled out `give(name, n, q,
     * sim.inventory)` got the chest's 18-slot cap applied to a 24-slot bag, so
     * the last six slots silently refused items and the caller dropped them. */
    var cap = inv === this.chest ? this.chestSize : this.invSize;
    for (var i = 0; i < inv.length; i++) {
      if (sameStack(inv[i], name, quality)) { inv[i].qty += qty; return true; }
    }
    if (inv.length >= cap) return false;         // caller drops it on the ground
    inv.push({ name: name, qty: qty, quality: quality });
    return true;
  };

  Sim.prototype.count = function (name, list) {
    var inv = list || this.inventory, n = 0;
    for (var i = 0; i < inv.length; i++) if (inv[i].name === name) n += inv[i].qty;
    return n;
  };

  Sim.prototype.take = function (name, qty, list) {
    var inv = list || this.inventory;
    qty = qty == null ? 1 : qty;
    if (this.count(name, inv) < qty) return false;
    for (var i = inv.length - 1; i >= 0 && qty > 0; i--) {
      if (inv[i].name !== name) continue;
      var d = Math.min(qty, inv[i].qty);
      inv[i].qty -= d; qty -= d;
      if (inv[i].qty <= 0) inv.splice(i, 1);
    }
    return true;
  };

  Sim.prototype.hasSpace = function () { return this.inventory.length < this.invSize; };

  // ------------------------------------------------------------ energy
  Sim.prototype.spend = function (n) {
    this.energy -= n;
    if (this.energy <= 0) {
      this.energy = 0;
      this.exhausted = true;      // costs half tonight's rest
      this.sluggish = true;       // and slows you until you eat
    }
    return this.energy > 0;
  };
  Sim.prototype.eat = function (slot) {
    var it = this.inventory[slot];
    if (!it) return null;
    var info = this.itemInfo(it.name);
    if (!info || info.energy == null) return null;
    var gain = Math.round(info.energy * QUALITY_MULT[it.quality || 0]);
    this.energy = clamp(this.energy + gain, 0, this.maxEnergy);
    this.health = clamp(this.health + Math.round(gain * 0.45), 0, this.maxHealth);
    /* Eating gets you moving again but does NOT undo the night's penalty - a
     * single parsnip used to cancel a whole day of over-exertion. */
    if (this.energy > 0) this.sluggish = false;
    /* WHY the chosen slot is decremented instead of take(name, 1): quality
     * splits one item into several stacks, and take() removes from the LAST
     * stack with that name. Eating the plain parsnip in slot 0 therefore ate
     * the gold-quality one sitting behind it - the player was charged the
     * dearer item and kept the cheap one, for the energy of the cheap one. */
    it.qty -= 1;
    if (it.qty <= 0) this.inventory.splice(slot, 1);
    return gain;
  };

  // ------------------------------------------------------------ skills
  var SKILL_XP = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
  Sim.prototype.addXp = function (skill, n) {
    if (this.skillXp[skill] == null) return null;
    this.skillXp[skill] += n;
    var lvl = 0;
    for (var i = 0; i < SKILL_XP.length; i++) if (this.skillXp[skill] >= SKILL_XP[i]) lvl = i + 1;
    if (lvl > this.skills[skill]) { this.skills[skill] = lvl; return lvl; }
    return null;
  };

  /* Crop quality: higher farming level and better fertilizer push the roll up.
   * Mirrors the shape of the game's formula (gold first, then silver). */
  /* `skill` names which skill drives the roll and defaults to farming, which is
   * right for a harvest and wrong for anything else: forage picked off the
   * ground was rolled against the FARMING level, so a level-10 forager who had
   * never planted anything got plain-quality leeks for ever. */
  Sim.prototype.rollQuality = function (fert, skill) {
    var lvl = this.skills[skill || 'farming'] || 0, f = fert || 0;
    /* WHY: the two variables were transposed in BOTH terms. At farming 10 the
     * gold+silver chance summed past 1.0, so a base-quality crop became
     * mathematically impossible and every harvest was worth 1.34x forever.
     * The real formula is level/10 in the first term, fert level in the second. */
    var gold = 0.2 * (lvl / 10) + 0.2 * f * ((lvl + 2) / 12) + 0.01;
    var silver = Math.min(0.75, gold * 2);
    var r = this.rand();
    if (f >= 3 && r < gold / 2) return 3;
    if (r < gold) return 2;
    if (r < gold + silver) return 1;
    return 0;
  };

  // ------------------------------------------------------------ friendship
  Sim.prototype.friend = function (name) {
    if (!this.friendship[name]) {
      this.friendship[name] = { points: 0, week: 0, talkedDay: -1, giftDay: -1 };
    }
    return this.friendship[name];
  };
  Sim.prototype.hearts = function (name) {
    return Math.floor(this.friend(name).points / POINTS_PER_HEART);
  };
  /* WHY this lives here: the 8-heart courtship gate was implemented only inside
   * giveGift, so talking (+20/day), quest turn-ins (+150) and the Sunday bonus
   * walked straight past it and a player could reach 10 hearts without ever
   * buying a bouquet. Every write to friendship goes through this now. */
  Sim.prototype.friendCap = function (name) {
    var v = (this.data.villagers || []).filter(function (x) {
      return x.name === name;
    })[0];
    this.dating = this.dating || {};
    if (v && v.marriable && !this.dating[name] && this.spouse !== name) {
      return 8 * POINTS_PER_HEART;
    }
    return 10 * POINTS_PER_HEART;
  };
  Sim.prototype.addFriendship = function (name, pts) {
    var f = this.friend(name);
    f.points = clamp(f.points + pts, 0, this.friendCap(name));
    return f.points;
  };
  Sim.prototype.talkTo = function (name) {
    var f = this.friend(name);
    if (f.talkedDay === this.dayIndex()) return false;
    f.talkedDay = this.dayIndex();
    this.addFriendship(name, 20);
    return true;
  };
  Sim.prototype.giftTaste = function (villager, item) {
    var v = this.data.villagers.find(function (x) { return x.name === villager; });
    if (!v || !v.gifts) return 'neutral';
    var lower = String(item).toLowerCase();
    var tiers = ['love', 'like', 'dislike', 'hate', 'neutral'];
    for (var i = 0; i < tiers.length; i++) {
      var list = v.gifts[tiers[i]] || [];
      for (var j = 0; j < list.length; j++) {
        if (String(list[j]).toLowerCase() === lower) return tiers[i];
      }
    }
    return 'neutral';
  };
  Sim.prototype.isBirthday = function (villager) {
    var v = this.data.villagers.find(function (x) { return x.name === villager; });
    return !!(v && v.birthday && v.birthday.season === this.season()
              && v.birthday.day === this.day);
  };
  /* Returns {taste, points, refused} - refused when the weekly gift cap is hit. */
  Sim.prototype.giveGift = function (villager, item) {
    var f = this.friend(villager);
    if (f.giftDay === this.dayIndex()) return { refused: 'day' };
    if (f.week >= 2) return { refused: 'week' };
    /* Ownership is checked HERE rather than in the panel, so no future caller
     * can hand out friendship for an item the player never had. */
    if (!this.count(item)) return { refused: 'missing' };
    var taste = this.giftTaste(villager, item);
    var pts = GIFT_POINTS[taste];
    if (this.isBirthday(villager)) pts *= 8;
    this.addFriendship(villager, pts);
    f.giftDay = this.dayIndex();
    f.week++;
    return { taste: taste, points: pts };
  };

  // ------------------------------------------------------------ end of day
  /* Everything that happens while the player sleeps. `world` supplies the
   * farm area so crops can grow and watered soil can dry out. */
  Sim.prototype.endDay = function (world) {
    var earned = 0;
    for (var i = 0; i < this.shipped.length; i++) {
      var s = this.shipped[i];
      earned += this.sellPrice(s.name, s.quality) * s.qty;
    }
    this.gold += earned;
    this.totalEarnings += earned;
    var report = { earned: earned, items: this.shipped.slice(), grew: 0, died: 0 };
    this.shipped = [];

    var wasRain = this.weather === 'rain' || this.weather === 'storm';
    var seasonEnds = this.day === 28;

    // grow crops - in EVERY area that can hold them, not just the home farm
    var growAreas = [world.areas.farm, world.areas.greenhouse, world.areas.island]
      .filter(Boolean);
    var farm = world.areas.farm;
    var allCrops = [];
    growAreas.forEach(function (ar) {
      ar.objs.forEach(function (o) { if (o.kind === 'crop') allCrops.push([o, ar]); });
    });
    for (var j = 0; j < allCrops.length; j++) {
      var o = allCrops[j][0];
      var ownerArea = allCrops[j][1];
      if (o.dead) continue;                 // already gone; do not re-count it
      if (seasonEnds && !ownerArea.season) {
        var nextSeason = SEASONS[(this.seasonIndex + 1) % 4];
        if (o.seasons && o.seasons.indexOf(nextSeason) < 0) {
          o.dead = true; report.died++; continue;
        }
      }
      /* WHY the rain only counts outdoors: `wasRain` is the valley's weather,
       * and it was applied to every growing area including the greenhouse. A
       * rainy day therefore watered crops standing under glass, which is both
       * wrong and free - roughly one day in five the greenhouse and its
       * sprinklers cost nothing at all. */
      var rained = wasRain && ownerArea.outdoor !== false;
      if (o.watered || rained) {
        if (o.harvested && o.regrow) {
          o.regrowLeft--;
          if (o.regrowLeft <= 0) { o.harvested = false; o.regrowLeft = 0; }
        } else if (o.stage < o.maxStage) {
          /* WHY: growth is measured in DAYS, not in stages. Advancing one stage
           * per night ripened Starfruit in 5 nights instead of 13 days and blew
           * the whole economy open - the bot banked 400k in a month. */
          o.days = (o.days || 0) + 1;
          /* Agriculturist advertises "cây lớn nhanh hơn 10%" and did nothing at
           * all - nothing anywhere read the profession. A tenth off the growing
           * time is the same thing as counting each night as 10/9 of a day, and
           * doing it that way leaves short crops alone (a tenth of four days
           * rounds to nothing) instead of shaving a night off everything. */
          var grown = (this.professions && this.professions.Agriculturist)
            ? o.days * 10 / 9 : o.days;
          var boundaries = o.stageDays || [];
          var acc = 0, st = 0;
          for (var bi = 0; bi < boundaries.length; bi++) {
            acc += boundaries[bi];
            if (grown >= acc - 1e-9) st = bi + 1;
          }
          var newStage = Math.min(o.maxStage, st);
          if (newStage > o.stage) { o.stage = newStage; report.grew++; }
        }
      }
      o.watered = false;
    }
    // dry the soil everywhere something can be planted
    growAreas.forEach(function (ar) {
      for (var y = 0; y < ar.h; y++) {
        for (var x = 0; x < ar.w; x++) {
          if (ar.name_of(x, y) === 'watered') ar.set(x, y, 'tilled');
        }
      }
    });

    // machines are advanced by machineui.js, which knows about slots

    // roll the calendar over
    this.day++;
    if (this.day > 28) {
      this.day = 1;
      this.seasonIndex = (this.seasonIndex + 1) % 4;
      if (this.seasonIndex === 0) this.year++;
    }
    if (this.dayOfWeek() === 'CN') {
      for (var nm in this.friendship) {
        if (this.friendship[nm].week >= 2) this.addFriendship(nm, 10);
        this.friendship[nm].week = 0;
      }
    }
    // friendship decays for anyone not spoken to
    for (var n2 in this.friendship) {
      var fr = this.friendship[n2];
      if (fr.talkedDay !== this.dayIndex() - 1 && fr.points < 2500) {
        fr.points = Math.max(0, fr.points - 2);
      }
    }

    this.weather = this.tomorrowWeather;
    /* A forecast rolled under the old season can survive the rollover, which is
     * how winter rained and spring snowed. Rain auto-waters crops, so this was
     * mechanical, not cosmetic. Re-roll anything impossible where it lands. */
    if (!weatherAllowed(this.season(), this.weather)) {
      this.weather = this.rollWeather(this.seasonIndex, this.day);
    }
    /* WHY: the roll happened after the date advanced but was evaluated against
     * TODAY's season, then applied the day after - so the first day of winter
     * rained and the first day of spring snowed, and rain auto-waters crops. */
    this.tomorrowWeather = this.rollWeather(this.day + 1 > 28
                                            ? (this.seasonIndex + 1) % 4
                                            : this.seasonIndex,
                                            this.day + 1 > 28 ? 1 : this.day + 1);
    this.rollLuck();
    this.time = DAY_START;

    var restore = this.maxEnergy;
    if (this.exhausted) restore = Math.round(this.maxEnergy * 0.5);
    this.energy = restore;
    this.exhausted = false;
    /* WHY sleeping clears it: `sluggish` is the slow walk you earn by working
     * yourself to zero, and only eating cleared it. A player who ran the bar
     * out on Spring 2 woke every morning after with a full bar and a half-speed
     * farmer, with nothing on screen saying why, until they happened to eat. */
    this.sluggish = false;
    this.health = this.maxHealth;
    report.luck = this.luck;
    return report;
  };

  // ------------------------------------------------------------ save
  var SAVE_KEY = 'sdv-web-save-v1';

  function collectFert(world) {
    if (!world || !world.forEachArea) return null;
    var out = {};
    world.forEachArea(function (a, k) { if (a.fert) out[k] = a.fert; });
    return out;
  }
  Sim.prototype.toJSON = function (world) {
    return {
      v: 1, year: this.year, seasonIndex: this.seasonIndex, day: this.day,
      time: this.time, gold: this.gold, energy: this.energy,
      maxEnergy: this.maxEnergy, health: this.health, luck: this.luck,
      weather: this.weather, tomorrowWeather: this.tomorrowWeather,
      inventory: this.inventory, chest: this.chest, shipped: this.shipped,
      totalEarnings: this.totalEarnings, skills: this.skills,
      skillXp: this.skillXp, friendship: this.friendship, museum: this.museum,
      bundlesDone: this.bundlesDone, crafted: this.crafted, flags: this.flags,
      seedRng: this.seedRng, deepestMine: this.deepestMine,
      weapon: this.weapon, armor: this.armor, toolTier: this.toolTier,
      toolPower: this.toolPower, professions: this.professions,
      hasBoat: this.hasBoat, spouse: this.spouse, dating: this.dating,
      machines: this.machines,
      /* WHY these four: a save made anywhere but the farm loaded the player to
       * the farmhouse door, which is out of bounds or solid in 47 of 54 areas -
       * every indoor save was dead. chestSize and maxHealth were bought with
       * gold and silently reverted, and an open profession choice vanished. */
      playerX: this.playerX, playerY: this.playerY,
      chestSize: this.chestSize, maxHealth: this.maxHealth,
      pendingProfession: this.pendingProfession,
      professionQueue: this.professionQueue,
      farmlife: world && world.game ? world.game.farm.serialize() : null,
      events: world && world.game ? world.game.events.serialize() : null,
      /* WHY the fertiliser maps travel separately: the world only writes tiles
       * and objects, and fertiliser spread on bare tilled soil lives in
       * `area.fert` until something is sown there. Reloading threw it away, so
       * a player who fertilised in the evening and planted next morning had
       * paid for a Deluxe Fertilizer that no longer existed. */
      fert: collectFert(world),
      world: world ? world.serialize() : null
    };
  };
  Sim.prototype.save = function (world) {
    if (world && world.game && world.game.player) {
      this.playerX = world.game.player.x;
      this.playerY = world.game.player.y;
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON(world)));
      return true;
    } catch (e) { return false; }
  };
  Sim.prototype.load = function (world) {
    var raw;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return false; }
    if (!s || s.v !== 1) return false;
    var self = this;
    ['year', 'seasonIndex', 'day', 'time', 'gold', 'energy', 'maxEnergy', 'health',
     'luck', 'weather', 'tomorrowWeather', 'inventory', 'chest', 'shipped',
     'totalEarnings', 'skills', 'skillXp', 'friendship', 'museum', 'bundlesDone',
     'crafted', 'flags', 'seedRng', 'deepestMine', 'weapon', 'armor',
     'toolTier', 'toolPower', 'professions', 'hasBoat',
     'spouse', 'dating', 'machines', 'playerX', 'playerY', 'chestSize',
     'maxHealth', 'pendingProfession', 'professionQueue'].forEach(function (k) {
      if (s[k] != null) self[k] = s[k];
    });
    if (s.world && world) world.deserialize(s.world);
    if (world && world.game && world.game.player && this.playerX != null) {
      var pg = world.game;
      var ar = pg.world.area();
      // land somewhere standable even if the map changed under the save
      var spot = ar.nearestFree(Math.floor(this.playerX), Math.floor(this.playerY), 20);
      pg.player.x = spot.x + 0.5;
      pg.player.y = spot.y + 0.5;
    }
    if (s.fert && world && world.forEachArea) {
      world.forEachArea(function (a, k) { if (s.fert[k]) a.fert = s.fert[k]; });
    }
    if (world && world.game) {
      if (s.farmlife) world.game.farm.deserialize(s.farmlife);
      if (s.events) world.game.events.deserialize(s.events);
      /* WHY the finished Community Centre rooms are re-applied here: what they
       * change is the collision mask and the warp list, and the world writes
       * neither to the save. Reloading put the beach back in two halves with
       * the repaired bridge solid again, and left the greenhouse door standing
       * on the farm leading nowhere - six bundles' worth of reward undone, and
       * unrecoverable, because the flag was already set so nothing re-ran. */
      if (global.SDV_PROGRESS && global.SDV_PROGRESS.reapplyRewards) {
        global.SDV_PROGRESS.reapplyRewards(world.game);
      }
    }
    return true;
  };
  Sim.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };
  Sim.clearSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  };

  global.SDV_SIM = {
    Sim: Sim, SEASONS: SEASONS, SEASON_VN: SEASON_VN, DAYS: DAYS,
    DAY_START: DAY_START, DAY_END: DAY_END, STEP: STEP,
    SEC_PER_STEP: SEC_PER_STEP, QUALITY_MULT: QUALITY_MULT,
    GIFT_POINTS: GIFT_POINTS, POINTS_PER_HEART: POINTS_PER_HEART,
    SKILL_XP: SKILL_XP, clamp: clamp
  };
})(window);
