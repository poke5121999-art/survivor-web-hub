// Battle Cats lane-battle simulation. Deterministic, 30 fps fixed step, pure (no DOM).
// Usable in Node (module.exports) and browser (window.BCSim).
(function (root) {
  'use strict';

  var FPS = 30;
  // Tuning: convert BC raw stats to battlefield pixels/frames.
  var SPD = 0.5;      // pixels per frame per speed-unit
  var RANGE_K = 1;    // range stays in px
  var MONEY_TICK = 2; // frames per money regen step base
  var START_MONEY = 1000;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // worker (money) levels: wallet cap and regen per level (BC-like, simplified)
  function walletCap(lvl) { return 1500 + lvl * 1000; }       // max money
  function regenPer(lvl) { return 7 + lvl * 7; }               // money per regen step
  function regenCost(lvl) { return 600 + lvl * 1200; }         // cost to upgrade worker

  function Unit(side, stat, x, id, form) {
    this.side = side;            // 'cat' | 'enemy'
    this.stat = stat;
    this.id = id; this.form = form;
    this.hp = stat.hp;
    this.maxhp = stat.hp;
    this.x = x;
    this.state = 'walk';         // walk | fore | cool | kb | dead
    this.t = 0;                  // timer in current state (frames)
    this.cool = 0;               // attack cooldown remaining
    this.kbLeft = stat.kb;       // knockbacks remaining
    this.kbStep = stat.hp / Math.max(1, stat.kb); // hp lost per knockback
    this.nextKbAt = stat.hp - this.kbStep;
    this.dir = side === 'cat' ? 1 : -1;
    this.anim = '00';            // walk
    this.animFrame = 0;
    this.dead = false;
  }

  function Sim(stage, catIndex, enemyIndex, opts) {
    this.stage = stage;          // {length, baseHp, bg, maxOnScreen, spawnMin, spawnMax, spawns:[...]}
    this.catIndex = catIndex;    // {uid: {stat, name}} chosen loadout (by slot)
    this.enemyIndex = enemyIndex;// {eid: stat}
    this.opts = opts || {};      // {startMoney, startWorkerLvl, catBaseHp}
    this.reset();
  }

  Sim.prototype.reset = function () {
    this.frame = 0;
    this.workerLvl = this.opts.startWorkerLvl || 0;
    this.money = this.opts.startMoney != null ? this.opts.startMoney : START_MONEY;
    this.regenT = 0;
    this.units = [];
    this.catBaseHp = this.opts.catBaseHp || 20000;  // player base
    this.catBaseMax = this.catBaseHp;
    this.enemyBaseHp = this.stage.baseHp;
    this.enemyBaseMax = this.stage.baseHp;
    this.over = 0;               // 0 running, 1 win, -1 lose
    this.cooldowns = {};         // slot -> frames left
    this.spawned = {};           // spawn row index -> count spawned
    this.spawnTimers = {};       // spawn row index -> next frame
    this.canonFired = false;
    this.catBaseX = 0;
    this.enemyBaseX = this.stage.length;
  };

  Sim.prototype.catBaseline = function () { return this.catBaseX + 80; };
  Sim.prototype.enemyBaseline = function () { return this.enemyBaseX - 80; };

  // deploy a loadout slot (0..n). Returns true if deployed.
  Sim.prototype.deploy = function (slot) {
    var e = this.catIndex[slot];
    if (!e) return false;
    if ((this.cooldowns[slot] || 0) > 0) return false;
    if (this.money < e.stat.cost) return false;
    this.money -= e.stat.cost;
    var u = new Unit('cat', e.stat, this.catBaseline(), e.uid, e.form);
    this.units.push(u);
    this.cooldowns[slot] = e.stat.recharge * 2; // recharge stored in half-frames-ish
    return true;
  };

  Sim.prototype.fireCannon = function () {
    if ((this.cannonCd || 0) > 0) return false;
    this.cannonCd = FPS * 8;           // 8s recharge
    var reach = this.catBaseline() + 1600;
    for (var i = 0; i < this.units.length; i++) {
      var o = this.units[i];
      if (o.side !== 'enemy') continue;
      if (o.x <= reach) { this.hurt(o, 1000); if (!o.dead) { o.state = 'kb'; o.t = 0; } }
    }
    return true;
  };

  Sim.prototype.upgradeWorker = function () {
    if (this.workerLvl >= 8) return false;
    if (this.money < regenCost(this.workerLvl)) return false;
    this.money -= regenCost(this.workerLvl);
    this.workerLvl++;
    return true;
  };

  // nearest opposing unit/base in front of u within reach; returns {target, dist}
  Sim.prototype.target = function (u) {
    var best = null, bestd = Infinity;
    for (var i = 0; i < this.units.length; i++) {
      var o = this.units[i];
      if (o.dead || o.side === u.side) continue;
      var d = (o.x - u.x) * u.dir; // positive if in front
      if (d < -30) continue;       // behind
      if (d < bestd) { bestd = d; best = o; }
    }
    // base as target
    var baseX = u.side === 'cat' ? this.enemyBaseline() : this.catBaseline();
    var bd = (baseX - u.x) * u.dir;
    if (bd < bestd) { bestd = bd; best = { base: true }; }
    return { target: best, dist: bestd };
  };

  Sim.prototype.inRange = function (u, dist) {
    // engage when target within attack range (front). cs = collision start.
    return dist <= u.stat.range;
  };

  Sim.prototype.dealDamage = function (u) {
    // apply u's attack to all valid targets within range (area) or nearest (single)
    var hitBase = false;
    var baseX = u.side === 'cat' ? this.enemyBaseline() : this.catBaseline();
    var bd = (baseX - u.x) * u.dir;
    if (bd <= u.stat.range && bd >= -30) hitBase = true;

    var targets = [];
    for (var i = 0; i < this.units.length; i++) {
      var o = this.units[i];
      if (o.dead || o.side === u.side) continue;
      var d = (o.x - u.x) * u.dir;
      if (d <= u.stat.range && d >= -30) targets.push(o);
    }
    if (!u.stat.area && targets.length) {
      targets.sort(function (a, b) { return (a.x - u.x) * u.dir - (b.x - u.x) * u.dir; });
      targets = [targets[0]];
    }
    for (var j = 0; j < targets.length; j++) this.hurt(targets[j], u.stat.atk);
    if (hitBase && (u.stat.area || targets.length === 0)) {
      if (u.side === 'cat') this.enemyBaseHp -= u.stat.atk;
      else this.catBaseHp -= u.stat.atk;
    } else if (hitBase && !u.stat.area && targets.length === 0) {
      if (u.side === 'cat') this.enemyBaseHp -= u.stat.atk; else this.catBaseHp -= u.stat.atk;
    }
  };

  Sim.prototype.hurt = function (o, dmg) {
    o.hp -= dmg;
    if (o.hp <= 0) {
      o.dead = true; o.state = 'dead';
      if (o.side === 'enemy' && o.stat.money) {
        this.money = Math.min(walletCap(this.workerLvl), this.money + o.stat.money);
      }
      return;
    }
    while (o.kbLeft > 0 && o.hp <= o.nextKbAt) {
      o.kbLeft--;
      o.nextKbAt -= o.kbStep;
      o.state = 'kb'; o.t = 0;
    }
  };

  Sim.prototype.stepUnit = function (u) {
    if (u.dead) return;
    if (u.state === 'kb') {
      // knocked back: move backward a fixed arc
      u.anim = '03';
      u.x -= u.dir * 4;
      u.t++;
      if (u.t > 12) { u.state = 'walk'; u.t = 0; }
      return;
    }
    var tg = this.target(u);
    var engage = tg.target && this.inRange(u, tg.dist);
    if (u.state === 'walk') {
      if (engage) { u.state = 'fore'; u.t = 0; u.anim = '02'; }
      else {
        u.anim = '00';
        u.x += u.dir * u.stat.speed * SPD;
        // clamp at own baseline / not past enemy base
        if (u.side === 'cat') u.x = Math.min(u.x, this.enemyBaseline());
        else u.x = Math.max(u.x, this.catBaseline());
      }
    } else if (u.state === 'fore') {
      u.anim = '02';
      u.t++;
      if (u.t >= Math.max(1, u.stat.fsw)) {
        this.dealDamage(u);
        u.state = 'cool'; u.t = 0;
        u.cool = Math.max(1, u.stat.tba) - u.stat.fsw;
        if (u.cool < 1) u.cool = 1;
      }
    } else if (u.state === 'cool') {
      u.anim = '01';
      u.cool--;
      if (u.cool <= 0) {
        u.state = 'walk'; u.t = 0;
      }
    }
  };

  Sim.prototype.spawnEnemies = function () {
    var sp = this.stage.spawns;
    for (var i = 0; i < sp.length; i++) {
      var s = sp[i];
      var st = this.enemyIndex[s.id];
      if (!st) continue;
      var done = this.spawned[i] || 0;
      if (s.count > 0 && done >= s.count) continue;
      if (this.spawnTimers[i] == null) this.spawnTimers[i] = s.first;
      // base-trigger: if enemyBase under X% and chance met (simplified: when base <100%)
      if (this.frame >= this.spawnTimers[i]) {
        var stat = Object.assign({}, st);
        var mult = (s.mult || 100) / 100;
        stat.hp = Math.round(stat.hp * mult);
        stat.atk = Math.round(stat.atk * mult);
        var u = new Unit('enemy', stat, this.enemyBaseline(), s.id, 'e');
        u.boss = !!s.boss;
        this.units.push(u);
        this.spawned[i] = done + 1;
        var gap = s.rmin + ((this.frame * 2654435761) % Math.max(1, (s.rmax - s.rmin + 1)));
        this.spawnTimers[i] = this.frame + Math.max(1, gap);
      }
    }
  };

  Sim.prototype.tick = function () {
    if (this.over) return;
    this.frame++;
    // money regen
    this.regenT++;
    if (this.regenT >= MONEY_TICK) {
      this.regenT = 0;
      this.money = Math.min(walletCap(this.workerLvl), this.money + regenPer(this.workerLvl));
    }
    for (var k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k]--;
    if (this.cannonCd > 0) this.cannonCd--;
    this.spawnEnemies();
    for (var i = 0; i < this.units.length; i++) this.stepUnit(this.units[i]);
    // remove dead
    this.units = this.units.filter(function (u) { return !u.dead; });
    // win/lose
    if (this.enemyBaseHp <= 0) this.over = 1;
    else if (this.catBaseHp <= 0) this.over = -1;
  };

  Sim.prototype.run = function (maxFrames) {
    maxFrames = maxFrames || FPS * 300;
    while (!this.over && this.frame < maxFrames) this.tick();
    return this.over;
  };

  var api = { Sim: Sim, Unit: Unit, FPS: FPS,
              walletCap: walletCap, regenPer: regenPer, regenCost: regenCost };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BCSim = api;
})(typeof window !== 'undefined' ? window : this);
