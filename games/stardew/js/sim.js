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
    /* The backpack starts small and is bought bigger, which is how the
     * original works and what was asked for. Official wiki, Tools page, read
     * 2026-08-23: "Backpack (12 slots) ... You start with one. It can hold 12
     * stacks of items, but it can be upgraded"; "Large Pack (24 slots)",
     * 2,000g, "Purchased from Pierre's General Store at the start of the
     * game"; "Deluxe Pack (36 slots)", 10,000g, "Purchased from Pierre's
     * General Store after buying 24 Size Backpack". It was a flat 24 here,
     * so the first upgrade in the game had already been given away and the
     * second did not exist. */
    this.invSize = 12;
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
    /* Auto work and auto loot are ON by default. They are the single biggest
     * difference between this and a desktop farming game: a tree is three
     * swings and a boulder is five, and tapping once per swing on a phone is
     * what makes a session feel like work. Both are togglable because a player
     * who wants to place every swing themselves should be able to. */
    this.autoWork = true;
    this.autoLoot = true;
    this.professions = {};
    this.hasBoat = false;
    this.spouse = null;
    this.dating = {};        // must persist: losing it re-charged the bouquet
    this.sluggish = false;

    /* ---------------------------------------------------------- the islands
     * `owned` is the whole progression state of the archipelago: which land
     * you have bought. world.js rebuilds collision and bridges from it, so
     * restoring a save is "replay the purchases", never "restore the map".
     * The home island is not bought and cannot be sold. */
    this.owned = { home: 1 };
    this.rank = 1;
    this.rankXp = 0;

    /* -------------------------------------------------------- the Pokemon
     * Party is at most six and is what pokework and battles read. Boxes are
     * unbounded storage on the PC. `dex` is two bitmaps in one object: 1 seen,
     * 2 caught, so the Pokedex screen needs no second structure. Trainer IDs
     * are rolled once and never again - every shiny in the save is defined
     * against them, and regenerating them would un-shiny a shiny. */
    this.party = [];
    this.boxes = [];
    this.daycare = [];
    this.dex = {};
    this.tid = null;
    this.sid = null;
    this.pokeSeen = 0;
    this.pokeCaught = 0;

    /* Tutorial pages already shown, and the handbook archive that lets a
     * player re-read one. Both keyed by step id. */
    this.taught = {};
    this.handbook = [];

    /* Daily order board - see farmqol.js. Regenerated every morning. */
    this.orders = [];
  };

  /* --------------------------------------------------------------- rank
   * Island Rank is the gate on buying land, and it is fed by EVERYTHING the
   * player does - harvesting, selling, catching, mining, fishing, quests - so
   * that no single activity is the only road forward. A player who only wants
   * to fish still reaches Đảo Cỏ Xanh, just later.
   *
   * The curve is authored rather than computed: ranks 1-10 arrive fast enough
   * that the first afternoon opens two islands, and the back half deliberately
   * slows so the last islands are a season's work rather than an evening's. */
  var RANK_XP = [0, 120, 300, 560, 920, 1400, 2050, 2900, 4000, 5400,
                 7200, 9400, 12000, 15200, 19000, 23500, 28800, 35000, 42200, 50600,
                 60400, 71800, 85000, 100200, 117800, 138000, 161200, 187800, 218200, 253000,
                 292600, 337600, 388600, 446400, 511800, 585600, 668800, 762400, 867400, 985000];

  /* WHY the index is clamped instead of `|| last`: RANK_XP[0] is 0, which is
   * falsy, so the `||` handed back the LAST entry - 985000 - as the bar it
   * takes to leave rank 1. rankProgress then had lo above hi, returned 1, and
   * the first thing a new player ever saw was a full progress bar that did
   * not move until rank 2. */
  Sim.prototype.rankNeed = function (r) {
    if (r < 0) return 0;
    return RANK_XP[Math.min(RANK_XP.length - 1, r)];
  };
  Sim.prototype.rankProgress = function () {
    var lo = this.rankNeed(this.rank - 1), hi = this.rankNeed(this.rank);
    if (hi <= lo) return 1;
    return clamp((this.rankXp - lo) / (hi - lo), 0, 1);
  };
  /* Returns the new rank when one is reached, else null - the caller turns
   * that into the level-up banner and the "new island available" check. */
  Sim.prototype.addRankXp = function (n) {
    if (!n || this.rank >= RANK_XP.length) return null;
    this.rankXp += n;
    var got = null;
    while (this.rank < RANK_XP.length && this.rankXp >= this.rankNeed(this.rank)) {
      this.rank++;
      got = this.rank;
    }
    return got;
  };

  // ------------------------------------------------------------- pokedex
  Sim.prototype.dexSee = function (id) {
    var was = this.dex[id] || 0;
    if (!(was & 1)) { this.dex[id] = was | 1; this.pokeSeen++; }
  };
  Sim.prototype.dexCatch = function (id) {
    var was = this.dex[id] || 0;
    if (!(was & 1)) this.pokeSeen++;
    if (!(was & 2)) this.pokeCaught++;
    this.dex[id] = was | 3;
  };

  // ------------------------------------------------------------ time
  Sim.prototype.season = function () { return SEASONS[this.seasonIndex]; };
  /* What season it will be TOMORROW. Anything that promises the player
   * something about tomorrow's weather has to ask this instead of season(),
   * or the promise breaks on the 28th of every month. */
  Sim.prototype.seasonTomorrow = function () {
    return SEASONS[this.day + 1 > 28 ? (this.seasonIndex + 1) % 4 : this.seasonIndex];
  };
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

  /* Items whose "the player has held one of these at least once" matters to
   * something else. Clint mails the Furnace recipe the morning after the first
   * copper ore is picked up, and by the time the crafting screen is opened
   * that ore has usually been smelted - so it cannot be read off the bag and
   * has to be latched when it arrives. Deliberately a short list: latching
   * every item name would grow the save file for nothing. */
  var HELD_LATCH = { 'Copper Ore': 1 };

  function sameStack(a, name, quality) {
    return a && a.name === name && (a.quality || 0) === (quality || 0);
  }

  /* One place decides how many slots a list has, because give() and canGive()
   * disagreeing about it is a silent item-eater. The shipping bin is not a
   * container the player carries and gets no cap - it inherited the BAG's,
   * and give()'s return value was ignored at the call site, so the thirteenth
   * kind of item shipped in a day was deleted and paid nothing. */
  Sim.prototype.capFor = function (inv) {
    if (inv === this.shipped) return 1e9;
    if (inv === this.chest) return this.chestSize;
    return this.invSize;
  };

  Sim.prototype.give = function (name, qty, quality, list) {
    qty = qty == null ? 1 : qty;
    quality = quality || 0;
    var inv = list || this.inventory;
    /* WHY the cap is chosen by which list this actually is, not by whether an
     * argument was passed: a caller that spelled out `give(name, n, q,
     * sim.inventory)` got the chest's 18-slot cap applied to a 24-slot bag, so
     * the last six slots silently refused items and the caller dropped them. */
    var cap = this.capFor(inv);
    if (HELD_LATCH[name]) {
      this.flags = this.flags || {};
      this.flags.held = this.flags.held || {};
      this.flags.held[name] = 1;
    }
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

  /* WHY takeStack exists: take() selects by NAME and walks backwards, so any
   * give(name, qty, quality) / take(name, qty) pair could operate on two
   * different stacks. Quality splits one item into several stacks, so selling
   * the iridium row paid the iridium price and removed a plain one - gold out
   * of nothing, every tap. Every caller that is holding the stack the player
   * actually touched must remove from THAT stack, not from a name. */
  Sim.prototype.takeStack = function (stack, qty, list) {
    var inv = list || this.inventory;
    var i = inv.indexOf(stack);
    if (i < 0) return 0;                       // already spliced out by an earlier pass
    qty = qty == null ? 1 : qty;
    var d = Math.min(qty, inv[i].qty);
    inv[i].qty -= d;
    if (inv[i].qty <= 0) inv.splice(i, 1);
    return d;
  };

  /* Whether give() would succeed, asked WITHOUT giving. hasSpace() alone is
   * not the answer: give() merges only into a stack of the same name AND the
   * same quality, so a full bag holding a plain parsnip still refuses a gold
   * one. Callers that removed the item from the world before checking were
   * destroying it. */
  Sim.prototype.canGive = function (name, quality, list) {
    var inv = list || this.inventory;
    var cap = this.capFor(inv);
    for (var i = 0; i < inv.length; i++) {
      if (sameStack(inv[i], name, quality)) return true;
    }
    return inv.length < cap;
  };

  Sim.prototype.hasSpace = function () { return this.inventory.length < this.invSize; };

  // ------------------------------------------------------------ energy
  /* GOLD, not energy. These two were one method called `spend` and the island
   * purchase path called it with a price - so buying land drained the player's
   * stamina, took no money at all, and reported failure the moment they were
   * tired. Nothing threw and nothing on screen said why. Two names, because
   * one name for two currencies is a bug waiting to be written again. */
  Sim.prototype.spendGold = function (n) {
    if (this.gold < n) return false;
    this.gold -= n;
    return true;
  };

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
  /* The cast lives in data/npcs.js now, not in the Stardew villager dump that
   * data/gamedata.js still carries. Looking a person up has to go through the
   * island roster first or every villager in this game is a stranger to the
   * friendship system - which is exactly what happened: `isBirthday` never
   * fired and the courtship cap never applied, so anybody could be taken to
   * ten hearts without ever buying a bouquet. */
  function villagerDef(sim, name) {
    var b = global.ISL_NPCS;
    if (b) {
      for (var k in b.npcs) if (b.npcs[k].name === name) return b.npcs[k];
    }
    var list = (sim.data && sim.data.villagers) || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  Sim.prototype.friendCap = function (name) {
    var v = villagerDef(this, name);
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
    var v = villagerDef(this, villager);
    /* Island villagers carry flat love/like/hate arrays; the old Stardew dump
     * nests them under `gifts`. Accept both shapes rather than reformat one -
     * the gamedata file is generated and will be regenerated. */
    if (v && !v.gifts && (v.love || v.like || v.hate)) {
      v = { gifts: { love: v.love || [], like: v.like || [], hate: v.hate || [] } };
    }
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
    var v = villagerDef(this, villager);
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

    /* Grow every crop in the world, wherever it stands.
     *
     * The build this replaces listed three named maps here - farm, greenhouse,
     * island - because those were the only three that could hold a crop. There
     * is one map now and a crop can be sown on any island with tillable soil,
     * so naming maps is exactly the wrong shape: a new island would silently
     * grow nothing and there would be no error anywhere to find.
     *
     * The per-crop `season` override comes from the ISLAND the crop stands on,
     * not from the area - that is what lets Đảo Vườn Kính ignore the calendar
     * while the field ten tiles away does not. */
    var growAreas = [];
    world.forEachArea(function (ar) { growAreas.push(ar); });
    var allCrops = [];
    growAreas.forEach(function (ar) {
      ar.objs.forEach(function (o) { if (o.kind === 'crop') allCrops.push([o, ar]); });
    });
    for (var j = 0; j < allCrops.length; j++) {
      var o = allCrops[j][0];
      var ownerArea = allCrops[j][1];
      if (o.dead) continue;                 // already gone; do not re-count it
      /* Which island is this crop standing on, and does that island have its
       * own permanent season? `o.season` is stamped when the crop is sown, so
       * this costs nothing per night and survives the island moving. */
      var pinned = o.season || ownerArea.season;
      if (seasonEnds && !pinned) {
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
      /* Rain waters what is outdoors and under the sky. A crop pinned to a
       * season is under glass, and glass does not let the weather in - a rainy
       * day used to water the greenhouse, which is both wrong and free. */
      var rained = wasRain && ownerArea.outdoor !== false && !o.season;
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

    /* Work Points come back with the sunrise, not at midnight. Tying them to
     * the clock meant a player who mined until 1am got a second full day of
     * Pokemon labour before going to bed - the budget is meant to be per
     * SLEEP, which is the only thing that ends a day here. */
    if (global.ISL_POKEWORK) {
      global.ISL_POKEWORK.resetDay(this.party, this.boxes);
    }
    /* A night's rest heals the party a little, the way an animal recovers on
     * its own. Not a full heal - that is what the heal stones on Poké Mart and
     * Đảo Cỏ Xanh are for, and making sleep free would make them pointless. */
    if (global.ISL_POKE) {
      var PK = global.ISL_POKE;
      this.party.forEach(function (p) {
        if (p.hp <= 0) { p.hp = Math.max(1, Math.floor(p.stats[0] * 0.25)); p.status = null; }
        else p.hp = Math.min(p.stats[0], p.hp + Math.ceil(p.stats[0] * 0.35));
        p.moves.forEach(function (m) { m.pp = Math.min(m.ppMax, m.pp + 3); });
        PK.addHappy(p, 1);
      });
    }
    if (global.ISL_FARMQOL) global.ISL_FARMQOL.rollOrders(this);

    report.luck = this.luck;
    return report;
  };

  // ------------------------------------------------------------ save
  /* A NEW key, deliberately. The world under this save is not the valley the
   * old key's saves were written against - there is no `farm` map, no `town`,
   * no warp table, and a crop's coordinates mean something completely
   * different. Reusing the key would let a v1 save half-load into a world that
   * cannot hold it, and the failure mode of that is a player standing in the
   * sea with an inventory and no explanation. A different key means the old
   * save is simply not found, and the new game starts clean. */
  var SAVE_KEY = 'isl-save-v1';

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
      fishRecord: this.fishRecord,
      bundlesDone: this.bundlesDone, crafted: this.crafted, flags: this.flags,
      seedRng: this.seedRng, deepestMine: this.deepestMine,
      weapon: this.weapon, armor: this.armor, toolTier: this.toolTier,
      toolPower: this.toolPower, professions: this.professions,
      autoWork: this.autoWork, autoLoot: this.autoLoot,
      hasBoat: this.hasBoat, spouse: this.spouse, dating: this.dating,
      machines: this.machines,
      /* WHY these four: a save made anywhere but the farm loaded the player to
       * the farmhouse door, which is out of bounds or solid in 47 of 54 areas -
       * every indoor save was dead. chestSize and maxHealth were bought with
       * gold and silently reverted, and an open profession choice vanished. */
      playerX: this.playerX, playerY: this.playerY,
      chestSize: this.chestSize, maxHealth: this.maxHealth, hay: this.hay,
      /* invSize was never saved, so a bought backpack silently reverted to
       * the default on the next load - which did not show while the default
       * WAS the maximum, and would have quietly eaten two purchases now. */
      invSize: this.invSize,
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

      /* --- island layer ---
       * Pokemon are packed by poke.js into short arrays rather than written as
       * objects: a full box of 300 is 300 records, and the object form is
       * about six times the bytes for exactly the same information. Stats,
       * gender and shininess are all recomputed on load from (id, level, pid,
       * IVs, EVs), so writing them would only give the save a way to
       * contradict itself. */
      owned: this.owned, rank: this.rank, rankXp: this.rankXp,
      tid: this.tid, sid: this.sid, dex: this.dex,
      pokeSeen: this.pokeSeen, pokeCaught: this.pokeCaught,
      party: (this.party || []).map(global.ISL_POKE ? global.ISL_POKE.pack : function (p) { return p; }),
      boxes: (this.boxes || []).map(global.ISL_POKE ? global.ISL_POKE.pack : function (p) { return p; }),
      /* The day-care was never written, and sleeping is exactly when the save
       * is taken - so depositing a Pokemon and going to bed destroyed it. */
      daycare: (this.daycare || []).map(global.ISL_POKE ? global.ISL_POKE.pack : function (p) { return p; }),
      taught: this.taught, handbook: this.handbook, orders: this.orders,

      world: world ? world.serialize() : null
    };
  };
  Sim.prototype.save = function (world) {
    if (world && world.game && world.game.player) {
      /* A save taken UNDERGROUND must not record mine coordinates as though
       * they were archipelago ones. The mine is generated per visit and is not
       * serialised, so a reload puts the player on the sea - and the saved
       * 17,15 of a mine floor is the middle of open water somewhere. The
       * visibilitychange handler fires this on any tab switch, so it happens
       * to anyone who takes a phone call. Surface them at the mine entrance
       * instead, which is where leaving the mine normally puts them. */
      if (world.current !== 'sea') {
        var ent = null;
        var sea = world.areas && world.areas.sea;
        if (sea) sea.objs.forEach(function (o) { if (o.kind === 'mineEntrance') ent = o; });
        this.playerX = ent ? ent.x + 0.5 : world.game.player.x;
        this.playerY = ent ? ent.y + 1.5 : world.game.player.y;
      } else {
        this.playerX = world.game.player.x;
        this.playerY = world.game.player.y;
      }
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
     'fishRecord',
     'crafted', 'flags', 'seedRng', 'deepestMine', 'weapon', 'armor',
     'toolTier', 'toolPower', 'professions', 'hasBoat',
     'spouse', 'dating', 'machines', 'playerX', 'playerY', 'chestSize',
     'maxHealth', 'pendingProfession', 'professionQueue', 'hay',
     'invSize', 'autoWork', 'autoLoot',
     'owned', 'rank', 'rankXp', 'tid', 'sid', 'dex', 'pokeSeen', 'pokeCaught',
     'taught', 'handbook', 'orders'].forEach(function (k) {
      if (s[k] != null) self[k] = s[k];
    });
    /* The trainer IDs have to be restored into poke.js BEFORE any Pokemon is
     * unpacked, because shininess is recomputed against them. Unpacking first
     * and setting them after was the first version, and it made every shiny in
     * a save stop being shiny the moment it was reloaded. */
    if (global.ISL_POKE) {
      if (this.tid == null) this.tid = global.ISL_POKE.randInt(65536);
      if (this.sid == null) this.sid = global.ISL_POKE.randInt(65536);
      global.ISL_POKE.setIds(this.tid, this.sid);
      this.party = (s.party || []).map(function (a) {
        return global.ISL_POKE.unpack(a, self.tid, self.sid);
      });
      this.boxes = (s.boxes || []).map(function (a) {
        return global.ISL_POKE.unpack(a, self.tid, self.sid);
      });
      this.daycare = (s.daycare || []).map(function (a) {
        return global.ISL_POKE.unpack(a, self.tid, self.sid);
      });
    }
    /* The home island is never for sale and must always be owned. A save
     * written by a build that did not have it, or corrupted, would otherwise
     * load the player onto blocked land with nowhere to walk. */
    this.owned = this.owned || {};
    this.owned.home = 1;
    /* A save written before hay was a real resource has no `hay` field, and
     * animals now eat from that store. Seeding it to what the player's silos
     * can hold means somebody who already owned silos does not wake up to a
     * barn full of starving animals because the rules changed under them.
     * A player with no silo seeds to zero, which is correct - they were never
     * storing anything. */
    if (s.hay == null && world && world.game && world.game.farm) {
      this.hay = world.game.farm.hayCap();
    }
    /* MIGRATION, and it must never lose anything. A save written when the bag
     * was a flat 24 slots has no invSize, and would otherwise load into a
     * 12-slot bag while already carrying more than that - every slot past the
     * twelfth would become unreachable and the next give() would refuse. So
     * the bag is never smaller than what it is already holding, rounded up to
     * a whole row. A save carrying 20 items keeps 24 slots; one carrying 5
     * still steps down to 12 and can buy its way back up, which is the point
     * of the change. Nothing is ever dropped. */
    var rows = Math.ceil((this.inventory || []).length / 12) * 12;
    if (rows > this.invSize) this.invSize = Math.min(36, rows);
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
