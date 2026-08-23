/*
 * bot.js - an in-game player that runs the whole loop unattended.
 *
 * It exists to answer one question a screenshot cannot: does a YEAR of this
 * game hold together? It farms, forages, mines, ships, sleeps, and buys seeds,
 * driving the same functions a thumb would drive - never a private shortcut -
 * so anything it survives, a player survives.
 *
 *   SDV.bot.start()      begin
 *   SDV.bot.runDays(112) simulate a full year as fast as the machine allows
 */
(function (global) {
  'use strict';

  function Bot(game, ui) {
    this.game = game;
    this.ui = ui;
    this.sim = game.sim;
    this.log = [];
    this.stats = { planted: 0, harvested: 0, shipped: 0, foraged: 0,
                   mined: 0, killed: 0, days: 0, bought: 0 };
    this.running = false;
  }

  Bot.prototype.note = function (msg) {
    this.log.push('[' + this.sim.seasonVN() + ' ' + this.sim.day
                  + '/N' + this.sim.year + '] ' + msg);
    if (this.log.length > 400) this.log.shift();
  };

  // --------------------------------------------------------------- helpers
  Bot.prototype.farmArea = function () { return this.game.world.areas.farm; };

  Bot.prototype.emptySoil = function (limit) {
    var a = this.farmArea(), g = this.game, out = [];
    for (var y = 0; y < a.h && out.length < limit; y++) {
      for (var x = 0; x < a.w; x++) {
        var t = a.name_of(x, y);
        if (t !== 'dirt' && t !== 'tilled' && t !== 'watered') continue;
        if (g.world.objAt(x, y, a)) continue;
        out.push({ x: x, y: y, tilled: t !== 'dirt' });
        if (out.length >= limit) break;
      }
    }
    return out;
  };

  Bot.prototype.seedsInBag = function () {
    var self = this;
    return this.sim.inventory.filter(function (it) {
      if (!/seeds?$/i.test(it.name)) return false;
      var def = self.game.data.crops.filter(function (c) {
        return c.seed === it.name;
      })[0];
      return def && (!def.seasons.length
                     || def.seasons.indexOf(self.sim.season()) >= 0);
    });
  };

  // --------------------------------------------------------------- actions
  Bot.prototype.buySeeds = function () {
    var s = this.sim, g = this.game;
    var season = s.season();
    var affordable = g.data.crops.filter(function (c) {
      return c.seedPrice && c.seedPrice > 0
        && c.seasons.indexOf(season) >= 0
        && c.sell / c.seedPrice > 1.4;          // only crops that pay back
    }).sort(function (a, b) {
      return (b.sell / b.growth) - (a.sell / a.growth);
    });
    if (!affordable.length) return 0;
    var pick = affordable[0];
    var budget = Math.floor(s.gold * 0.7);
    var n = Math.min(20, Math.floor(budget / pick.seedPrice));
    if (n <= 0) return 0;
    s.gold -= n * pick.seedPrice;
    s.give(pick.seed, n);
    this.stats.bought += n;
    this.note('mua ' + n + ' ' + pick.seed);
    return n;
  };

  Bot.prototype.workFarm = function () {
    var s = this.sim, g = this.game, a = this.farmArea();
    // 1. harvest anything ripe
    var ripe = a.objs.filter(function (o) {
      return o.kind === 'crop' && !o.dead && o.stage >= o.maxStage && !o.harvested;
    });
    for (var i = 0; i < ripe.length; i++) {
      this.ui.harvest(ripe[i]);
      this.stats.harvested++;
    }
    // 2. plant into free soil while seeds and energy last
    var seeds = this.seedsInBag();
    if (!seeds.length && s.gold > 400) { this.buySeeds(); seeds = this.seedsInBag(); }
    var soil = this.emptySoil(30);
    for (var j = 0; j < soil.length && seeds.length; j++) {
      if (s.energy < 30) break;
      var sp = soil[j];
      if (!sp.tilled) {
        g.player.x = sp.x + 0.5; g.player.y = sp.y + 0.5;
        g.hoeTile(sp.x, sp.y);
        if (a.name_of(sp.x, sp.y) === 'dirt') continue;   // hoe refused
      }
      var stack = seeds[0];
      this.ui.plant(sp.x, sp.y, stack);
      var made = g.world.objAt(sp.x, sp.y, a);
      if (made && made.kind === 'crop') {
        this.stats.planted++;
        made.watered = true;
        a.set(sp.x, sp.y, 'watered');
        s.spend(2);
      }
      seeds = this.seedsInBag();
    }
    // 3. water everything already growing
    a.objs.forEach(function (o) {
      if (o.kind === 'crop' && !o.dead && !o.watered && s.energy > 10) {
        o.watered = true;
        a.set(o.x, o.y, 'watered');
        s.spend(2);
      }
    });
  };

  Bot.prototype.gatherForage = function () {
    var g = this.game, s = this.sim, picked = 0;
    ['farm', 'forest', 'town', 'mountain'].forEach(function (key) {
      var a = g.world.areas[key];
      if (!a) return;
      a.objs.filter(function (o) { return o.kind === 'forage'; })
        .slice(0, 6)
        .forEach(function (o) {
          if (!s.hasSpace()) return;
          s.give(o.item, 1, 0);
          s.addXp('foraging', 7);
          a.objs.splice(a.objs.indexOf(o), 1);
          picked++;
        });
    });
    this.stats.foraged += picked;
    return picked;
  };

  Bot.prototype.chopAndMine = function () {
    var g = this.game, s = this.sim, a = this.farmArea(), n = 0;
    var targets = a.objs.filter(function (o) {
      return o.kind === 'tree' || o.kind === 'rock' || o.kind === 'weed'
             || o.kind === 'stick' || o.kind === 'grassTuft';
    }).slice(0, 12);
    for (var i = 0; i < targets.length; i++) {
      if (s.energy < 40) break;
      var t = targets[i];
      g.player.x = t.x + 0.5; g.player.y = t.y + 1.2;
      g.player.face = 'up';
      g.hover = t;
      for (var k = 0; k < 8 && a.objs.indexOf(t) >= 0; k++) {
        g.player.actCooldown = 0;
        g.useTool();
        if (t.kind === 'stump') { g.hover = t; }
      }
      n++;
    }
    this.stats.mined += n;
    return n;
  };

  Bot.prototype.diveMine = function (floors) {
    var g = this.game, s = this.sim;
    if (s.energy < 45 || s.health < 40) return 0;
    var start = Math.max(1, Math.min(s.deepestMine || 1, 40));
    g.mine.enter(start, 'mine');
    var done = 0;
    for (var f = 0; f < (floors || 3); f++) {
      var a = g.world.area();
      // fight whatever is close, then break rocks for ore
      for (var i = 0; i < 20 && g.mine.monsters.length; i++) {
        var m = g.mine.monsters[0];
        g.player.x = m.x - 0.6; g.player.y = m.y;
        g.player.face = 'right';
        g.player.actCooldown = 0;
        g.mine.playerAttack();
        if (m.dead || m.hp <= 0) { this.stats.killed++; }
        if (g.mine.monsters.indexOf(m) >= 0 && m.hp > 0 && i > 12) break;
      }
      var rocks = a.objs.filter(function (o) {
        return o.kind === 'rock' || o.kind === 'oreRock';
      }).slice(0, 8);
      for (var r = 0; r < rocks.length && s.energy > 20; r++) {
        var rk = rocks[r];
        g.player.x = rk.x + 0.5; g.player.y = rk.y + 1.2;
        g.player.face = 'up';
        g.hover = rk;
        for (var k2 = 0; k2 < 6 && a.objs.indexOf(rk) >= 0; k2++) {
          g.player.actCooldown = 0;
          g.useTool();
        }
      }
      // pick up whatever fell
      a.objs.filter(function (o) { return o.kind === 'dropped'; })
        .forEach(function (o) {
          if (s.give(o.item.name, o.item.qty, o.item.quality)) {
            a.objs.splice(a.objs.indexOf(o), 1);
          }
        });
      if (!a.ladder) g.mine.maybeDropLadder(Math.floor(g.player.x),
                                            Math.floor(g.player.y), true);
      if (a.ladder) { g.mine.descend(); done++; }
      else break;
      if (s.energy < 25 || s.health < 30) break;
    }
    g.mine.leave();
    return done;
  };

  Bot.prototype.shipAll = function () {
    var s = this.sim, n = 0;
    for (var i = s.inventory.length - 1; i >= 0; i--) {
      var it = s.inventory[i];
      if (/seeds?$/i.test(it.name)) continue;          // keep seeds for tomorrow
      var info = s.itemInfo(it.name);
      if (!info || !info.sell) continue;
      if (info.cat === 'resource' && /wood|stone/i.test(it.name)) continue;
      s.shipped.push({ name: it.name, qty: it.qty, quality: it.quality || 0 });
      s.inventory.splice(i, 1);
      n += it.qty;
    }
    this.stats.shipped += n;
    return n;
  };

  Bot.prototype.eatIfTired = function () {
    var s = this.sim;
    if (s.energy > 60) return false;
    for (var i = 0; i < s.inventory.length; i++) {
      var info = s.itemInfo(s.inventory[i].name);
      if (info && info.energy > 0) { s.eat(i); return true; }
    }
    return false;
  };

  // --------------------------------------------------------------- one day
  Bot.prototype.playDay = function () {
    var g = this.game, s = this.sim;
    /* Order matters: the farm and the woodcutting drain the whole bar, so a
     * bot that did those first never had the energy left to go underground and
     * the mine looked broken when it was only starved. Dive while fresh. */
    this.workFarm();
    this.gatherForage();
    this.eatIfTired();
    if (s.day % 2 === 0 && s.energy > 60) this.diveMine(4);
    this.eatIfTired();
    if (s.energy > 100) this.chopAndMine();
    this.shipAll();
    // a profession choice would block the loop; take the first offer
    if (s.pendingProfession && this.ui.openProfession) {
      var pp = s.pendingProfession;
      this.ui.openProfession(pp.skill, pp.level);
      var btn = document.querySelector('.sdv-panel .sdv-mbtn');
      if (btn) btn.click();
      this.ui.close();
      s.pendingProfession = null;
    }
    g.world.current = 'farm';
    g.sleep(false);
    this.ui.close();
    this.stats.days++;
  };

  Bot.prototype.runDays = function (n) {
    var report = { start: { gold: this.sim.gold, day: this.sim.dayIndex() } };
    for (var i = 0; i < n; i++) {
      try {
        this.playDay();
      } catch (e) {
        report.error = String(e && e.message || e);
        report.errorDay = this.sim.dayIndex();
        break;
      }
    }
    report.end = {
      gold: this.sim.gold, day: this.sim.dayIndex(),
      year: this.sim.year, season: this.sim.season(),
      skills: JSON.parse(JSON.stringify(this.sim.skills)),
      museum: this.sim.museum.length, deepest: this.sim.deepestMine
    };
    report.stats = this.stats;
    return report;
  };

  Bot.prototype.start = function () { this.running = true; };

  global.SDV_BOT = { Bot: Bot };
})(window);
