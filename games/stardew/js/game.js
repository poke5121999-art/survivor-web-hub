/*
 * game.js - world manager, player, camera, renderer, input.
 *
 * Control model (from the brief, all deliberate departures from the original):
 *  - ONE tool. There is no tool selector. Walking up to a tree chops it, a rock
 *    breaks it, a weed cuts it, a monster gets hit. What is in front of you
 *    decides what the button does.
 *  - Anything interactable is outlined and carries a floating icon, so the
 *    player never has to guess which pixel is clickable.
 *  - Tiles and structures open a menu on tap (plant / water / fertilise /
 *    remove / move) instead of needing a held item.
 *  - Fishing is separate: standing near water raises a visible fishing button
 *    on the water itself.
 */
(function (global) {
  'use strict';

  var S = global.SDV_SPRITES, W = global.SDV_WORLD, SIM = global.SDV_SIM;
  var TS = 16;                       // tile size in world units (px before zoom)

  // ------------------------------------------------------------------ world
  function World() {
    this.areas = W.buildAll();
    this.current = 'farm';
    this.npcs = [];
  }
  World.prototype.area = function () { return this.areas[this.current]; };
  World.prototype.forEachArea = function (fn) {
    // WHY: a lookup table once got stored beside the areas and every
    // per-area pass (save, overnight machines) crashed on it. Only walk
    // things that really are Areas.
    for (var k in this.areas) {
      var a = this.areas[k];
      if (!a || !a.objs || !a.tiles) continue;
      fn(a, k);
    }
  };
  World.prototype.serialize = function () {
    var out = { current: this.current, areas: {} };
    var self = this;
    this.forEachArea(function (a, k) {
      out.areas[k] = { tiles: Array.prototype.slice.call(a.tiles), objs: a.objs };
    });
    return out;
  };
  World.prototype.deserialize = function (s) {
    if (!s) return;
    this.current = s.current || 'farm';
    var self = this;
    for (var k in s.areas) {
      var a = this.areas[k];
      if (!a) continue;
      var d = s.areas[k];
      if (d.tiles && d.tiles.length === a.tiles.length) a.tiles = Uint8Array.from(d.tiles);
      if (d.objs) a.objs = d.objs;
    }
  };
  World.prototype.objAt = function (x, y, area) {
    area = area || this.area();
    for (var i = 0; i < area.objs.length; i++) {
      var o = area.objs[i];
      if (o.kind === 'building') {
        if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return o;
      } else if (o.x === x && o.y === y) return o;
    }
    return null;
  };
  World.prototype.removeObj = function (o, area) {
    area = area || this.area();
    var i = area.objs.indexOf(o);
    if (i >= 0) area.objs.splice(i, 1);
  };
  World.prototype.solidAt = function (x, y) {
    var a = this.area();
    if (a.solid(x, y)) return true;
    var o = this.objAt(x, y);
    if (!o) return false;
    return SOLID_OBJ[o.kind] === true;
  };
  var SOLID_OBJ = {
    tree: true, rock: true, oreRock: true, stump: true, building: true,
    chest: true, furnace: true, bin: true, bed: true, tv: true, counter: true,
    bundleBoard: true, machine: true, bus: true, mineEntrance: true,
    brokenBridge: true, sign: true, kitchen: true, mailbox: true,
    calendarBoard: true, museumDesk: true, display: true, toolUpgrade: true,
    geodeCrusher: true, animalShop: true, buildMenu: true, travelingCart: true,
    fountain: true, boat: true, boatTicket: true, islandTrader: true,
    sewerGrate: true, guildDoor: true, skullEntrance: true, palm: true,
    volcanoEntrance: true, farmCave: true, greenhouseShell: true,
    caveChoice: true, fruitTree: true
    // 'doorway' is deliberately absent: standing on a door is how you use it
    // crabPot is deliberately absent: it sits in water, which is already solid
  };

  // ------------------------------------------------------------------ player
  function Player() {
    /* WHY: (8,10) sat inside the farmhouse door's warp radius, so the very first
     * step teleported the player indoors before they could move. Start clear of
     * every warp tile. */
    // just below the farmhouse door on the real Farm map
    this.x = 64.5; this.y = 17.5;     // tile coords, float
    this.face = 'down';
    this.frame = 0; this.animT = 0;
    this.speed = 4.2;                 // tiles per second
    this.sprite = S.person('#7a4a2b', '#3f6fb5', '#4e2f1c', '#28497d');
    this.actCooldown = 0;
  }

  // ------------------------------------------------------------------ game
  function Game(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.data = data;
    this.sim = new SIM.Sim(data);
    this.world = new World();
    this.player = new Player();
    this.zoom = 3;
    this.acc = 0;
    this.last = 0;
    this.input = { dx: 0, dy: 0, act: false };
    this.messages = [];
    this.particles = [];
    this.fx = new global.SDV_FX.FX();
    this.paused = false;
    this.onOpen = null;               // set by ui.js
    this.hover = null;                // the interactable currently highlighted
    this.cameFrom = null;             // area we just came from - its door is inert
    this.arrivedX = 0; this.arrivedY = 0;   // until we walk clear of the landing
    this.fishSpot = null;
    this.npcs = [];
    this.world.game = this;             // modules reach back through the world
    this.mine = new global.SDV_MINE.Mine(this);
    this.farm = new global.SDV_FARMLIFE.FarmLife(this);
    this.events = new global.SDV_EVENTS.Events(this);
    this.initNpcs();
    this.sim.rollLuck();
    this.sim.tomorrowWeather = this.sim.rollWeather();
    // make sure craftable-but-untabled items have a price row
    var extra = (global.SDV_MACHINES || {}).EXTRA_ITEMS || {};
    for (var xn in extra) {
      if (!this.data.items[xn.toLowerCase()]) this.data.items[xn.toLowerCase()] = extra[xn];
    }
    this.giveStarterKit();
  }

  Game.prototype.giveStarterKit = function () {
    this.sim.give('Parsnip Seeds', 15);
    this.sim.give('Wood', 30);
    this.sim.give('Stone', 20);
  };

  // ---- villagers ---------------------------------------------------------
  /* The people of the valley live in npc.js now. It reads the game's own
   * schedule files - real map, real tile, real facing - instead of the keyword
   * table that used to guess a destination out of a sentence and leave most of
   * the cast standing on one tile all day. */
  Game.prototype.initNpcs = function () {
    this.villagers = new global.SDV_NPC.Villagers(this);
    this.npcs = this.villagers.list;
    return this.npcs;
  };

  Game.prototype.updateNpcs = function (dt) {
    if (this.villagers) this.villagers.update(dt);
  };

  Game.prototype.npcsHere = function () {
    var cur = this.world.current;
    return this.npcs.filter(function (n) { return n.area === cur; });
  };

  // ---- movement ----------------------------------------------------------
  Game.prototype.canStand = function (x, y) {
    var a = this.world.area();
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= a.w || ty >= a.h) return false;
    return !this.world.solidAt(tx, ty);
  };

  Game.prototype.movePlayer = function (dt) {
    var p = this.player, i = this.input;
    var len = Math.hypot(i.dx, i.dy);
    if (len < 0.08) { p.frame = 0; return; }
    var nx = i.dx / len, ny = i.dy / len;
    var slow = this.sim.sluggish || (this.sim.energy <= 0);
    var sp = p.speed * (slow ? 0.55 : 1) * dt * Math.min(1, len);
    var tryX = p.x + nx * sp, tryY = p.y + ny * sp;
    // where we stood before this step, so a shut door can put us back there
    this.lastOpenX = p.x; this.lastOpenY = p.y;
    if (this.canStand(tryX, p.y)) p.x = tryX;
    if (this.canStand(p.x, tryY)) p.y = tryY;
    p.face = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left')
                                         : (ny > 0 ? 'down' : 'up');
    p.animT += dt;
    if (p.animT > 0.16) { p.animT = 0; p.frame ^= 1; }
    this.checkWarp();
  };

  Game.prototype.checkWarp = function () {
    var a = this.world.area(), p = this.player;
    /* WHY: doors are 3-4 tiles wide, and you land ON the band that leads back.
     * Blocking only the exact arrival tile was not enough - one step sideways
     * hit the next tile of the SAME door and bounced you home, which is what
     * "stuck at the exit" was. So: after arriving from area X, every warp back
     * to X is inert until you have walked clear of the landing spot. */
    /* WHY not a distance: map-edge doors are 3-5 tiles wide, so a player who
     * had walked the 2.2 tiles that lifted the guard was usually still standing
     * inside the same band, and it fired and threw them back. The guard now
     * lifts only once they are off EVERY tile of the door they came through. */
    if (this.cameFrom) {
      var stillOnBand = false;
      for (var wi = 0; wi < a.warps.length; wi++) {
        var wv = a.warps[wi];
        if (wv.to !== this.cameFrom) continue;
        if (Math.abs(p.x - (wv.x + 0.5)) < 1.5 && Math.abs(p.y - (wv.y + 0.5)) < 1.5) {
          stillOnBand = true;
          break;
        }
      }
      if (!stillOnBand) this.cameFrom = null;
    }
    for (var i = 0; i < a.warps.length; i++) {
      var w = a.warps[i];
      if (!w.to) continue;
      if (this.cameFrom && w.to === this.cameFrom) continue;
      if (Math.abs(p.x - (w.x + 0.5)) < 0.45 && Math.abs(p.y - (w.y + 0.5)) < 0.45) {
        var dest = this.world.areas[w.to];
        if (!dest) continue;
        /* Shops keep the hours the map itself records. Walking into a shut
         * door bounces you off it with the hours, instead of the shop being
         * open at three in the morning. */
        var NPCM = global.SDV_NPC;
        if (NPCM && !NPCM.doorOpen(w, this.sim.time)) {
          p.x = this.lastOpenX == null ? p.x : this.lastOpenX;
          p.y = this.lastOpenY == null ? p.y : this.lastOpenY;
          if (!this.shutToastAt || Date.now() - this.shutToastAt > 2500) {
            this.shutToastAt = Date.now();
            this.sfx('error');
            this.toast('Cửa đang đóng · mở ' + NPCM.hhmm(w.open)
                       + ' – ' + NPCM.hhmm(w.close));
          }
          return;
        }
        /* A landing tile inside a wall is the other half of "I got stuck".
         * Snap to the nearest tile that can actually be stood on. */
        var spot = dest.nearestFree
          ? dest.nearestFree(w.tx, w.ty, 10) : { x: w.tx, y: w.ty };
        /* WHY step inward: several doors land you ON a tile that is itself a
         * door back the way you came - the bus stop drops you onto the farm's
         * own gate band - and the two then trade the player back and forth.
         * Walk the landing spot away from any return door before arriving. */
        var backHere = (dest.warps || []).filter(function (v) {
          return v.to === this.world.current;
        }, this);
        for (var tries = 0; tries < 4; tries++) {
          var onDoor = backHere.filter(function (v) {
            return Math.abs(v.x - spot.x) <= 1 && Math.abs(v.y - spot.y) <= 1;
          })[0];
          if (!onDoor) break;
          var ax = spot.x + (spot.x >= onDoor.x ? 2 : -2);
          var ay = spot.y + (spot.y >= onDoor.y ? 0 : 0);
          var alt = dest.nearestFree(ax, ay, 6);
          if (alt.x === spot.x && alt.y === spot.y) {
            alt = dest.nearestFree(spot.x, spot.y + 2, 6);
          }
          spot = alt;
        }
        var origin = this.world.current;
        this.world.current = w.to;
        p.x = spot.x + 0.5; p.y = spot.y + 0.5;
        this.cameFrom = origin;
        this.arrivedX = p.x; this.arrivedY = p.y;
        this.sfx(dest.outdoor ? 'warp' : 'door');
        this.toast('→ ' + this.world.area().name);
        var fest = this.events && this.events.festivalToday;
        if (fest && fest.where === w.to && this.ui && this.ui.openFestival) {
          this.ui.openFestival(fest);
        }
        return;
      }
    }
  };

  // ---- the one tool ------------------------------------------------------
  var TOOL_JOBS = {
    tree:   { hits: 5, energy: 4, skill: 'foraging', xp: 12, drop: ['Wood', 8],
              label: 'Chặt cây', becomes: 'stump', fx: 'chop' },
    stump:  { hits: 3, energy: 4, skill: 'foraging', xp: 8, drop: ['Hardwood', 2],
              label: 'Nhổ gốc', fx: 'chop' },
    rock:   { hits: 3, energy: 3, skill: 'mining', xp: 6, drop: ['Stone', 3],
              label: 'Đập đá', fx: 'smash' },
    oreRock:{ hits: 4, energy: 3, skill: 'mining', xp: 12, drop: ['Copper Ore', 2],
              label: 'Đào quặng', fx: 'smash' },
    weed:   { hits: 1, energy: 1, skill: 'foraging', xp: 2, drop: ['Fiber', 1],
              label: 'Dọn cỏ', fx: 'weed' },
    grassTuft: { hits: 1, energy: 1, skill: 'foraging', xp: 1, drop: ['Hay', 1],
                 label: 'Cắt cỏ', fx: 'weed' },
    stick:  { hits: 1, energy: 1, skill: 'foraging', xp: 2, drop: ['Wood', 2],
              label: 'Nhặt cành', fx: 'chop' },
    brokenBridge: { hits: 0, energy: 0, label: 'Sửa cầu', build: true }
  };

  /* The tile the player is facing - that is what the single tool acts on. */
  Game.prototype.facingTile = function () {
    var p = this.player;
    var dx = p.face === 'left' ? -1 : p.face === 'right' ? 1 : 0;
    var dy = p.face === 'up' ? -1 : p.face === 'down' ? 1 : 0;
    return { x: Math.floor(p.x + dx * 0.9), y: Math.floor(p.y + dy * 0.9) };
  };

  /* Nearest thing worth highlighting - what the tool would hit, or what a tap
   * would open. Searched in a small ring so the player never has to line up. */
  Game.prototype.findInteractable = function () {
    var p = this.player, a = this.world.area(), best = null, bestD = 99;
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy;
        var o = this.world.objAt(x, y);
        if (!o) continue;
        var ox = (o.kind === 'building' ? o.doorX : o.x) + 0.5;
        var oy = (o.kind === 'building' ? o.doorY : o.y) + 0.5;
        var d = Math.hypot(ox - p.x, oy - p.y);
        if (d > 2.2 || d >= bestD) continue;
        bestD = d; best = o;
      }
    }
    // an NPC standing close beats scenery - talking is what the player wants
    var here = this.npcsHere();
    for (var i = 0; i < here.length; i++) {
      var n = here[i];
      var dn = Math.hypot(n.x - p.x, n.y - p.y);
      if (dn < 1.8 && dn < bestD + 0.6) { bestD = dn; best = { kind: 'npc', npc: n, x: Math.floor(n.x), y: Math.floor(n.y) }; }
    }
    return best;
  };

  Game.prototype.findFishSpot = function () {
    var p = this.player, a = this.world.area();
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        var x = Math.floor(p.x) + dx, y = Math.floor(p.y) + dy;
        var t = a.name_of(x, y);
        if (t !== 'water' && t !== 'deep') continue;
        if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > 3) continue;
        return { x: x, y: y };
      }
    }
    return null;
  };

  Game.prototype.useTool = function () {
    var p = this.player;
    if (p.actCooldown > 0) return;
    /* In the mine the same button is the sword: a monster in reach outranks
     * every rock, because being unable to fight back while cornered is the one
     * failure the single-tool scheme must never produce. */
    if (this.mine.monsters.length) {
      p.actCooldown = 0.3;
      var f0 = this.facingTile();
      this.fx.hit('slash', f0.x, f0.y, p.face);
      this.sfx('slash');
      if (this.mine.playerAttack() > 0) return;
    }
    var target = this.hover;
    if (!target) {
      // no object: if facing tillable farm dirt, hoe it
      var f = this.facingTile();
      return this.hoeTile(f.x, f.y);
    }
    if (target.kind === 'npc') return this.openNpc(target.npc);
    var job = TOOL_JOBS[target.kind];
    if (!job) return this.openObject(target);
    if (job.build) return this.openObject(target);
    if (this.sim.energy <= 0) { this.toast('Hết sức rồi, phải đi ngủ'); return; }
    p.actCooldown = 0.34;
    this.sim.spend(job.energy);
    target.hp = (target.hp == null ? job.hits : target.hp) - 1;
    /* WHY the effect and not just the particles: before this, chopping a tree
     * showed six identical sparks and then the tree was gone, so the player
     * could not tell a hit that landed from one that did nothing. Each tool
     * job now names its own effect - wood chips for the axe, stone shards for
     * the pick - and the arc shows which way the swing went. */
    if (job.fx) this.fx.hit(job.fx, target.x, target.y, p.face);
    this.sfx(job.fx === 'chop' ? 'chop' : job.fx === 'smash' ? 'smash' : 'weed');
    this.spark(target.x, target.y);
    if (target.hp > 0) return;
    // it came down: a longer, heavier sound than the blows that got it there
    this.sfx(job.fx === 'chop' ? 'fell' : job.fx === 'smash' ? 'smash' : 'pickup');
    var drop = job.drop;
    if (target.ore) drop = [target.ore, 3];      // mine rocks carry their own ore
    if (drop) {
      var n = 1 + Math.floor(Math.random() * drop[1]);
      if (!this.sim.give(drop[0], n)) this.toast('Túi đầy!');
      else this.toast('+' + n + ' ' + drop[0]);
    }
    if (this.world.area().depth) this.mine.maybeDropLadder(target.x, target.y, false);
    var lvl = this.sim.addXp(job.skill, job.xp);
    if (lvl) { this.toast('Kỹ năng ' + job.skill + ' lên cấp ' + lvl + '!');
               this.sfx('levelup'); }
    if (job.becomes) { target.kind = job.becomes; target.hp = null; }
    else this.world.removeObj(target);
  };

  /* The world half of the game knows WHAT was touched; the panel half knows
   * how to show it. These two methods are the seam between them, and the tool
   * path calls them - without these a tap on a shop counter threw. */
  Game.prototype.openObject = function (o) {
    if (this.ui) this.ui.openObject(o, o.x, o.y);
  };
  Game.prototype.openNpc = function (npc) {
    if (this.ui) this.ui.openNpc(npc);
  };

  Game.prototype.hoeTile = function (x, y) {
    var a = this.world.area();
    if (a.id !== 'farm' && a.id !== 'greenhouse' && a.id !== 'island') return;
    var t = a.name_of(x, y);
    if (t !== 'dirt' && t !== 'grass') return;
    if (this.world.objAt(x, y)) return;
    if (this.sim.energy <= 0) { this.toast('Hết sức rồi'); return; }
    this.sim.spend(2);
    a.set(x, y, 'tilled');
    this.player.actCooldown = 0.28;
    this.fx.hit('hoe', x, y, this.player.face);
    this.sfx('hoe');
    this.spark(x, y);
  };

  // ---- feedback ----------------------------------------------------------
  /* One word at the call site, and silence rather than a crash if the audio
   * engine never started (a browser that blocks it, or a headless test). */
  Game.prototype.sfx = function (name) {
    if (global.SDV_AUDIO) global.SDV_AUDIO.play(name);
  };

  Game.prototype.toast = function (text) {
    this.messages.push({ text: text, t: 2.6 });
    if (this.messages.length > 4) this.messages.shift();
  };
  Game.prototype.spark = function (x, y) {
    for (var i = 0; i < 6; i++) {
      this.particles.push({
        x: x + 0.5, y: y + 0.5, vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2.5, t: 0.5,
        c: ['#f4f0e6', '#e8c357', '#8b6b4a'][i % 3]
      });
    }
  };

  // ---- update ------------------------------------------------------------
  Game.prototype.update = function (dt) {
    if (this.paused) return;
    var p = this.player;
    if (p.actCooldown > 0) p.actCooldown -= dt;
    this.movePlayer(dt);
    this.updateNpcs(dt);
    this.fx.update(dt);
    this.audioTick(dt);
    this.mine.update(dt);
    this.hover = this.findInteractable();
    this.fishSpot = this.findFishSpot();

    for (var i = this.messages.length - 1; i >= 0; i--) {
      this.messages[i].t -= dt;
      if (this.messages[i].t <= 0) this.messages.splice(i, 1);
    }
    for (var j = this.particles.length - 1; j >= 0; j--) {
      var q = this.particles[j];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 7 * dt; q.t -= dt;
      if (q.t <= 0) this.particles.splice(j, 1);
    }

    this.acc += dt;
    while (this.acc >= SIM.SEC_PER_STEP) {
      this.acc -= SIM.SEC_PER_STEP;
      if (global.SDV_MACHINEUI) global.SDV_MACHINEUI.machinesTick(this, SIM.STEP);
      if (this.sim.tick()) this.collapse();
    }
  };

  Game.prototype.collapse = function () {
    var lost = Math.min(this.sim.gold, 500);
    this.sim.gold -= lost;
    this.sim.exhausted = true;
    this.toast('Bạn ngất lúc 2 giờ sáng. Mất ' + lost + 'g.');
    this.sleep(true);
  };

  Game.prototype.sleep = function (collapsed) {
    this.sfx('sleep');
    /* WHY the return value is kept: the overnight pass counts how many animals
     * produced, and that number was computed every single night and thrown on
     * the floor - the morning summary never had it to show. Everything the
     * night produced now arrives in one report. */
    var overnight = {};
    this.farm.overnight(overnight);
    var report = this.sim.endDay(this.world);
    report.animalProduce = overnight.animalProduce || 0;

    report.today = this.events.onNewDay();
    report.forage = global.SDV_PROGRESS ? global.SDV_PROGRESS.spawnForage(this) : 0;
    report.pots = global.SDV_SOCIAL ? global.SDV_SOCIAL.crabPotOvernight(this) : 0;
    report.machines = global.SDV_MACHINEUI
      ? global.SDV_MACHINEUI.machinesOvernight(this) : 0;
    this.mine.monsters = [];
    this.player.x = 64.5; this.player.y = 17.5;
    this.world.current = 'farm';
    this.sim.save(this.world);
    if (this.onDayEnd) this.onDayEnd(report, collapsed);
  };

  /* Keep the music and the ambience matched to where the player is, and put a
   * footstep under them while they walk. Re-checked once a second rather than
   * every frame: both setters ignore a repeat, but the checks themselves cost
   * a world lookup. */
  Game.prototype.audioTick = function (dt) {
    var AU = global.SDV_AUDIO;
    if (!AU || !AU.isStarted()) return;
    this._audioAt = (this._audioAt || 0) - dt;
    if (this._audioAt <= 0) { this._audioAt = 1; AU.follow(this); }
    AU.tick(this, dt);
    var moving = Math.hypot(this.input.dx, this.input.dy) > 0.2;
    this._stepAt = (this._stepAt || 0) - dt;
    if (moving && this._stepAt <= 0) { this._stepAt = 0.34; AU.play('step'); }
    if (!moving) this._stepAt = 0;
  };

  // ---- render ------------------------------------------------------------
  Game.prototype.render = function () {
    var ctx = this.ctx, cv = this.canvas;
    var a = this.world.area(), p = this.player;
    var z = this.zoom, ts = TS * z;
    var vw = cv.width, vh = cv.height;
    var camX = p.x * ts - vw / 2, camY = p.y * ts - vh / 2;
    camX = Math.max(0, Math.min(camX, a.w * ts - vw));
    camY = Math.max(0, Math.min(camY, a.h * ts - vh));
    if (a.w * ts < vw) camX = (a.w * ts - vw) / 2;
    if (a.h * ts < vh) camY = (a.h * ts - vh) / 2;
    this.cam = { x: camX, y: camY, ts: ts };

    ctx.fillStyle = '#1b2027';
    ctx.fillRect(0, 0, vw, vh);

    var x0 = Math.max(0, Math.floor(camX / ts)), y0 = Math.max(0, Math.floor(camY / ts));
    var x1 = Math.min(a.w - 1, Math.ceil((camX + vw) / ts));
    var y1 = Math.min(a.h - 1, Math.ceil((camY + vh) / ts));

    // tiles
    /* WHY this is not a checkerboard any more: the whole valley was two flat
     * colours alternating on (x+y)&1, which is why the owner's read of the art
     * was "khá xấu". tiles.js paints a real texture per ground type and a real
     * building - roof, wall, window, door, sign - out of the collision classes
     * the extracted maps already carry. */
    var T = global.SDV_TILES;
    var now = Date.now();
    // sim.time counts minutes from midnight, so dusk is 18*60, not 1800
    var night = this.sim.time >= 18 * 60 || this.sim.time < 6 * 60;
    var indoor = !a.outdoor;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var name = a.name_of(x, y);
        var def = W.TILE[name];
        var sx = Math.round(x * ts - camX), sy = Math.round(y * ts - camY);
        T.paintGround(ctx, name, def, sx, sy, ts, x, y, now);
        T.paintBlend(ctx, a, x, y, sx, sy, ts, W.TILE, W.TILE_IDS);
        var idx = y * a.w + x;
        var bcls = a.blocked ? a.blocked[idx] : 0;
        if (!bcls || def.water) continue;
        var part = a.bpart ? a.bpart[idx] : 0;
        if (part) {
          T.paintBuilding(ctx, part, this.buildingAt(a, x, y), sx, sy, ts,
                          x, y, night);
        } else {
          T.paintBlocked(ctx, bcls, name, sx, sy, ts, x, y, a, indoor);
        }
      }
    }
    // doors and signs sit on top of the wall they are cut into
    if (a.buildings) {
      for (var bi = 0; bi < a.buildings.length; bi++) {
        var bd = a.buildings[bi];
        if (!bd.door) continue;
        if (bd.door.x < x0 - 4 || bd.door.x > x1 + 4
            || bd.door.y < y0 - 4 || bd.door.y > y1 + 6) continue;
        var dsx = Math.round(bd.door.x * ts - camX);
        /* WHY the door can sit one tile up: the maps put the door ACTION on
         * the doorstep, which is the walkable tile in front of the house, not
         * on the wall. Painted there the farmhouse door floated in the grass
         * with the cottage a row behind it. Paint it on the wall when the tile
         * above the doorstep belongs to this building. */
        var wallY = bd.door.y;
        var above = (bd.door.y - 1) * a.w + bd.door.x;
        if (a.bpart && a.bpart[above]) wallY = bd.door.y - 1;
        var dsy = Math.round(wallY * ts - camY);
        var isOpen = this.doorIsOpen(a, bd.door.x, bd.door.y);
        T.paintDoor(ctx, bd, dsx, dsy, ts, isOpen, night);
        if (bd.sign) {
          T.paintSign(ctx, bd.sign, dsx + ts / 2, dsy, ts, isOpen);
        }
      }
    }

    /* Contact shadows, drawn under everything before anything is drawn on top.
     *
     * WHY they matter more than any sprite: a tree with no shadow is a sticker
     * on a flat field. One soft ellipse per object, offset the way the light
     * falls, is the whole difference between tiles and a place - and it is what
     * the two games the owner pointed at spend most of their frame doing. */
    this.drawShadows(a, camX, camY, ts, x0, y0, x1, y1);

    // objects + actors sorted so nearer things draw in front
    var drawables = [];
    for (var i = 0; i < a.objs.length; i++) {
      var o = a.objs[i];
      var oy = o.kind === 'building' ? o.y + o.h : o.y + 1;
      if (o.x > x1 + 3 || o.y > y1 + 3 || (o.x + (o.w || 1)) < x0 - 3
          || (o.y + (o.h || 1)) < y0 - 3) continue;
      drawables.push({ sort: oy, kind: 'obj', o: o });
    }
    this.npcsHere().forEach(function (n) {
      drawables.push({ sort: n.y + 1, kind: 'npc', n: n });
    });
    drawables.push({ sort: p.y + 1, kind: 'player' });
    drawables.sort(function (m, n) { return m.sort - n.sort; });

    for (var d = 0; d < drawables.length; d++) {
      var it = drawables[d];
      if (it.kind === 'obj') this.drawObj(it.o, camX, camY, ts);
      else if (it.kind === 'npc') this.drawActor(it.n, camX, camY, ts, true);
      else this.drawActor(p, camX, camY, ts, false);
    }

    // particles
    for (var q = 0; q < this.particles.length; q++) {
      var pt = this.particles[q];
      ctx.fillStyle = pt.c;
      ctx.fillRect(Math.round(pt.x * ts - camX) - 1, Math.round(pt.y * ts - camY) - 1,
                   Math.max(2, z), Math.max(2, z));
    }

    this.mine.draw(ctx, camX, camY, ts);
    this.fx.draw(ctx, camX, camY, ts);
    /* WHY the light pass sits here, before the highlight and the weather: it
     * is what everything in the WORLD is lit by, and the cursor outline and
     * the rain are read on top of the lit frame, not dimmed with it. The flat
     * blue rectangle that used to be drawn over the whole screen at dusk is
     * gone - it darkened the interface along with the field and made lamps
     * impossible. */
    if (global.SDV_LIGHT) global.SDV_LIGHT.apply(this, ctx, vw, vh, this.cam);
    this.drawHighlight(camX, camY, ts);
    this.drawWeather(vw, vh);
  };

  /* Which structure a building tile belongs to. Cached per area the first time
   * it is asked, because the render loop asks once per visible tile. */
  /* The structure whose front door stands on this tile, if any. */
  Game.prototype.doorOwner = function (a, x, y) {
    var list = a.buildings || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].door && list[i].door.x === x && list[i].door.y === y) {
        return list[i];
      }
    }
    return null;
  };

  Game.prototype.buildingAt = function (a, x, y) {
    if (!a._bmap) {
      a._bmap = {};
      (a.buildings || []).forEach(function (b) {
        b.cells.forEach(function (i) { a._bmap[i] = b; });
      });
    }
    return a._bmap[y * a.w + x] || { roof: '#6a4a3a', wall: '#5f452e', y: y };
  };

  /* A shop door is shut outside its hours - the hours come straight off the
   * map's own LockedDoorWarp entry. */
  Game.prototype.doorIsOpen = function (a, x, y) {
    var NPC = global.SDV_NPC;
    var w = (a.warps || []).filter(function (v) {
      return v.x === x && v.y === y;
    })[0];
    if (!w) return true;
    return NPC ? NPC.doorOpen(w, this.sim.time) : true;
  };

  // How wide each world object should read, measured in tiles. A tree is not
  // the same size as a weed, and the art files are authored at different widths.
  /* Colours for the collision layer, keyed on the ground beneath: a wall on
   * grass is a wooden building, a wall on stone is a cliff. */
  /* Terrain that blocks (cliff faces, boulders, tree walls) takes its colour
   * from the ground it rises out of; buildings and fences get their own. */
  var BLOCK_TERRAIN = {
    grass: { body: '#3f6b34', top: '#598c46', fleck: '#2e5227' },
    dirt:  { body: '#6b4a30', top: '#8a6340', fleck: '#523725' },
    path:  { body: '#8a7452', top: '#a68f68', fleck: '#6d5b40' },
    sand:  { body: '#b9a173', top: '#d0b98c', fleck: '#9c854f' },
    stone: { body: '#5f5f6a', top: '#7c7c87', fleck: '#4a4a54' },
    floor: { body: '#6b5140', top: '#84654f', fleck: '#523d30' },
    wood:  { body: '#6b4a2c', top: '#87603b', fleck: '#523821' },
    jungle:{ body: '#2c5f3c', top: '#3f7d50', fleck: '#204a2d' },
    snow:  { body: '#9fb0be', top: '#c3d2dd', fleck: '#8496a4' },
    ice:   { body: '#8fb2c8', top: '#b2cfe0', fleck: '#7699ad' },
    darkrock: { body: '#42424b', top: '#585863', fleck: '#33333a' },
    rock:  { body: '#54545e', top: '#6e6e78', fleck: '#42424b' }
  };
  var BLOCK_BUILDING = { body: '#8a5a3c', top: '#b0603a', fleck: '#6d452c' };
  var BLOCK_FENCE = { body: '#8b6b4a', top: '#a8875f', fleck: '#6f5439' };

  var OBJ_TILES = {
    tree: 2.2, stump: 1.0, rock: 1.0, oreRock: 1.0, grassTuft: 0.9,
    weed: 0.8, stick: 0.8, chest: 1.0, furnace: 1.1, bin: 1.5, sign: 0.9,
    bed: 2.2, tv: 1.4, bus: 2.4, mineEntrance: 1.6, palm: 2.2,
    forageBeach: 0.8, forageIsland: 0.8, desertBush: 1.0, dropped: 0.8,
    forage: 0.8
  };

  var OBJ_EMOJI = {
    travelingCart: '\u{1F6D2}', islandTrader: '\u{1F965}', boat: '\u26F5',
    boatTicket: '\u{1F3AB}', kitchen: '\u{1F373}', mailbox: '\u{1F4EC}',
    calendarBoard: '\u{1F4C5}', museumDesk: '\u{1F3DB}', display: '\u{1F5FF}',
    toolUpgrade: '\u{1F527}', geodeCrusher: '\u{1F48E}', animalShop: '\u{1F404}',
    buildMenu: '\u{1F3D7}', caveChoice: '\u{1F344}', greenhouseShell: '\u{1F3E1}',
    workshop: '\u{1F6E0}',
    counter: '\u{1F9FE}', bundleBoard: '\u{1F4DC}', sewerGrate: '\u{1F573}',
    guildDoor: '\u2694'
  };

  /* How much shade a thing casts, as a share of a tile. Absent = no shadow,
   * which is right for anything flat on the ground. */
  var SHADOW = {
    tree: 1.5, palm: 1.5, stump: 0.7, rock: 0.7, oreRock: 0.7, chest: 0.7,
    bin: 1.0, sign: 0.5, bed: 1.2, tv: 0.8, machine: 0.7, counter: 0.9,
    kitchen: 0.8, workshop: 0.9, mailbox: 0.5, calendarBoard: 0.6,
    bundleBoard: 0.8, travelingCart: 1.3, boat: 1.3, bus: 1.6,
    toolUpgrade: 0.7, geodeCrusher: 0.7, animalShop: 0.7, buildMenu: 0.7,
    museumDesk: 0.8, islandTrader: 0.9, crop: 0.4, fruitTree: 1.4,
    weed: 0.3, grassTuft: 0.3, stick: 0.3, forage: 0.35, dropped: 0.35
  };

  Game.prototype.drawShadows = function (a, camX, camY, ts, x0, y0, x1, y1) {
    var ctx = this.ctx;
    var L = global.SDV_LIGHT;
    var dark = L ? L.darkness(this) : 0;
    /* Shadows soften and spread as the sun drops, and go away entirely once
     * the only light left is the lamp you are carrying. */
    var alpha = 0.26 * (1 - dark * 0.75);
    if (alpha <= 0.01) return;
    var off = ts * (0.05 + 0.14 * dark);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';

    // buildings first: a long soft slab off the base of the wall
    if (a.buildings) {
      for (var b = 0; b < a.buildings.length; b++) {
        var bd = a.buildings[b];
        if (bd.x > x1 + 4 || bd.y > y1 + 4
            || bd.x + bd.w < x0 - 4 || bd.y + bd.h < y0 - 4) continue;
        var bx = Math.round(bd.x * ts - camX);
        var by = Math.round((bd.y + bd.h) * ts - camY);
        var bw = bd.w * ts;
        var grd = ctx.createLinearGradient(0, by, 0, by + ts * 1.1);
        grd.addColorStop(0, 'rgba(40,34,44,' + (alpha * 0.9).toFixed(3) + ')');
        grd.addColorStop(1, 'rgba(40,34,44,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(bx + off, by, bw, ts * 1.1);
      }
    }

    for (var i = 0; i < a.objs.length; i++) {
      var o = a.objs[i];
      var sc = SHADOW[o.kind];
      if (!sc) continue;
      if (o.x < x0 - 3 || o.x > x1 + 3 || o.y < y0 - 3 || o.y > y1 + 3) continue;
      var cx = (o.x + 0.5) * ts - camX + off;
      var cy = (o.y + 0.9) * ts - camY;
      // three stacked ellipses instead of a blur filter: same soft edge, and
      // canvas blur costs far more than three fills on a phone
      for (var r = 0; r < 3; r++) {
        var k = 1 + r * 0.45;
        ctx.fillStyle = 'rgba(38,32,42,'
          + (alpha * (0.5 - r * 0.14)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(cx, cy, ts * 0.42 * sc * k, ts * 0.17 * sc * k, 0, 0, 6.3);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  };

  Game.prototype.drawObj = function (o, camX, camY, ts) {
    var ctx = this.ctx, z = this.zoom;
    var sx = Math.round(o.x * ts - camX), sy = Math.round(o.y * ts - camY);
    switch (o.kind) {
      case 'building': {
        var w = o.w * ts, h = o.h * ts;
        ctx.fillStyle = o.color || '#8a6a4a';
        ctx.fillRect(sx, sy + h * 0.35, w, h * 0.65);
        ctx.fillStyle = o.roof || '#5d4636';
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy + h * 0.38);
        ctx.lineTo(sx + w / 2, sy - 6);
        ctx.lineTo(sx + w + 4, sy + h * 0.38);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3a2b33';
        var dx = Math.round(o.doorX * ts - camX), dy = Math.round(o.doorY * ts - camY);
        ctx.fillRect(dx + ts * 0.15, dy, ts * 0.7, ts);
        ctx.fillStyle = '#e8c357';
        ctx.fillRect(dx + ts * 0.62, dy + ts * 0.5, Math.max(2, z), Math.max(2, z));
        if (o.label) {
          ctx.font = (9 * z / 3 + 5) + 'px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          var tw = ctx.measureText(o.label).width;
          ctx.fillRect(sx + w / 2 - tw / 2 - 5, sy - 24, tw + 10, 16);
          ctx.fillStyle = '#f4f0e6';
          ctx.fillText(o.label, sx + w / 2, sy - 12);
          ctx.textAlign = 'left';
        }
        break;
      }
      case 'crop': {
        var crop = this.cropDef(o.crop);
        var col = S.iconColors(o.crop, 'crop');
        if (o.dead) {
          // a withered stalk, bent over, rather than a brown post
          ctx.strokeStyle = '#6b5a3c';
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1, ts * 0.07);
          ctx.beginPath();
          ctx.moveTo(sx + ts * 0.5, sy + ts * 0.92);
          ctx.quadraticCurveTo(sx + ts * 0.52, sy + ts * 0.55,
                               sx + ts * 0.74, sy + ts * 0.48);
          ctx.stroke();
          ctx.lineWidth = Math.max(1, ts * 0.05);
          ctx.beginPath();
          ctx.moveTo(sx + ts * 0.5, sy + ts * 0.7);
          ctx.lineTo(sx + ts * 0.3, sy + ts * 0.62);
          ctx.stroke();
          ctx.lineCap = 'butt';
        } else {
          S.drawCrop(ctx, sx, sy, ts / 12, o.stage, o.maxStage + 1,
                     col.main, col.light, crop && crop.trellis,
                     (o.x * 7 + o.y * 13));
        }
        break;
      }
      case 'machine': {
        /* State lives in the save, not on the object, so read it back to know
         * whether this thing is running and whether anything is ready. */
        var mst = (this.sim.machines || {})[o.machine || 'Furnace'];
        S.blit(ctx, S.machine(o.machine || 'Furnace'), sx, sy, ts / 10);
        var jobs = (mst && mst.jobs) || [];
        var anyReady = jobs.some(function (j) { return j && j.ready; });
        var anyBusy = jobs.some(function (j) { return j && !j.ready; });
        if (anyReady || o.ready) {
          ctx.fillStyle = '#e8c357';
          ctx.fillRect(sx + ts * 0.4, sy - ts * 0.35, ts * 0.2, ts * 0.25);
        } else if (anyBusy) {
          // a wisp of smoke, so a working machine reads as working
          var pf = (Date.now() / 300 + o.x * 3) % 6;
          ctx.fillStyle = 'rgba(220,215,210,' + (0.34 - pf * 0.05).toFixed(2) + ')';
          ctx.fillRect(sx + ts * 0.45, sy - pf * ts * 0.12, Math.max(2, ts * 0.12),
                       Math.max(2, ts * 0.12));
        }
        ctx.font = Math.round(ts * 0.3) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(240,227,194,0.85)';
        var mlab = (global.SDV_MACHINES && global.SDV_MACHINES.def(o.machine));
        if (mlab && mlab.vn) ctx.fillText(mlab.vn, sx + ts / 2, sy + ts * 1.25);
        ctx.textAlign = 'left';
        break;
      }
      case 'mineExit': {
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(sx + ts * 0.2, sy + ts * 0.1, ts * 0.6, ts * 0.8);
        ctx.fillStyle = '#8fd8ff';
        for (var ur = 0; ur < 4; ur++) {
          ctx.fillRect(sx + ts * 0.22, sy + ts * (0.18 + ur * 0.18), ts * 0.56, ts * 0.06);
        }
        ctx.font = Math.round(ts * 0.5) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText('↑', sx + ts / 2, sy - 2);
        ctx.textAlign = 'left';
        break;
      }
      case 'ladder': {
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(sx + ts * 0.2, sy + ts * 0.1, ts * 0.6, ts * 0.8);
        ctx.fillStyle = '#c9a24a';
        for (var lr = 0; lr < 4; lr++) {
          ctx.fillRect(sx + ts * 0.22, sy + ts * (0.18 + lr * 0.18), ts * 0.56, ts * 0.06);
        }
        break;
      }
      case 'fruitTree': {
        var fage = o.age || 0;
        var grown = fage >= 28;
        var trunkH = grown ? ts : ts * (0.3 + Math.min(1, fage / 28) * 0.6);
        ctx.fillStyle = '#5e4630';
        ctx.fillRect(sx + ts * 0.42, sy + ts - trunkH, ts * 0.16, trunkH);
        ctx.fillStyle = grown ? '#3d7a38' : '#5fa855';
        var fr = grown ? ts * 0.85 : ts * 0.4;
        ctx.beginPath();
        ctx.arc(sx + ts * 0.5, sy + ts - trunkH - fr * 0.5, fr, 0, 6.3);
        ctx.fill();
        if (o.fruits) {
          var fc = S.iconColors(o.fruit || 'fruit', 'fruit');
          for (var fi = 0; fi < o.fruits; fi++) {
            ctx.fillStyle = fc.main;
            ctx.beginPath();
            ctx.arc(sx + ts * (0.28 + fi * 0.22), sy + ts - trunkH - fr * 0.3,
                    ts * 0.11, 0, 6.3);
            ctx.fill();
          }
        }
        break;
      }
      case 'sprinkler': {
        ctx.fillStyle = '#8d8d96';
        ctx.fillRect(sx + ts * 0.3, sy + ts * 0.45, ts * 0.4, ts * 0.3);
        ctx.fillStyle = '#63c7d8';
        ctx.fillRect(sx + ts * 0.44, sy + ts * 0.25, ts * 0.12, ts * 0.24);
        break;
      }
      case 'crabPot': {
        ctx.fillStyle = '#5e4630';
        ctx.fillRect(sx + ts * 0.2, sy + ts * 0.35, ts * 0.6, ts * 0.4);
        ctx.strokeStyle = '#c9a24a';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + ts * 0.2, sy + ts * 0.35, ts * 0.6, ts * 0.4);
        if (o.catch) {
          ctx.fillStyle = '#e8c357';
          ctx.beginPath();
          ctx.arc(sx + ts * 0.5, sy + ts * 0.22, ts * 0.12, 0, 6.3);
          ctx.fill();
        }
        break;
      }
      case 'doorway': {
        /* A door that belongs to a drawn building already has a door and a
         * signboard painted on the wall; drawing this one too gave every shop
         * two entrances and two names stacked on each other. */
        var owner = this.doorOwner(this.world.area(), o.x, o.y);
        if (owner) break;
        ctx.fillStyle = 'rgba(20,16,22,0.55)';
        ctx.fillRect(sx + ts * 0.18, sy + ts * 0.1, ts * 0.64, ts * 0.8);
        ctx.fillStyle = '#e8c357';
        ctx.fillRect(sx + ts * 0.66, sy + ts * 0.48, Math.max(2, ts * 0.08),
                     Math.max(2, ts * 0.08));
        if (o.label) {
          ctx.font = Math.round(ts * 0.34) + 'px system-ui, sans-serif';
          ctx.textAlign = 'center';
          var tw = ctx.measureText(o.label).width;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(sx + ts / 2 - tw / 2 - 4, sy - ts * 0.62, tw + 8, ts * 0.46);
          ctx.fillStyle = '#f4ecd8';
          ctx.fillText(o.label, sx + ts / 2, sy - ts * 0.28);
          ctx.textAlign = 'left';
        }
        break;
      }
      case 'forage': {
        var finfo = this.sim.itemInfo(o.item);
        S.drawIcon(ctx, o.item || '?', finfo ? finfo.cat : 'crop',
                   sx + ts * 0.24, sy + ts * 0.26, ts * 0.52);
        ctx.strokeStyle = 'rgba(255,236,150,0.55)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx + ts * 0.2, sy + ts * 0.22, ts * 0.6, ts * 0.6);
        break;
      }
      case 'dropped': {
        var di = o.item || {};
        var dinfo = this.sim.itemInfo(di.name);
        var bob = Math.sin(Date.now() / 300 + o.x) * ts * 0.06;
        S.drawIcon(ctx, di.name || '?', dinfo ? dinfo.cat : 'crop',
                   sx + ts * 0.22, sy + ts * 0.2 + bob, ts * 0.56);
        break;
      }
      case 'palm': {
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(sx + ts * 0.44, sy + ts * 0.3, ts * 0.14, ts * 0.9);
        ctx.strokeStyle = '#2f7d4a';
        ctx.lineWidth = Math.max(3, ts * 0.13);
        for (var pa = 0; pa < 5; pa++) {
          var ang = -Math.PI / 2 + (pa - 2) * 0.55;
          ctx.beginPath();
          ctx.moveTo(sx + ts * 0.5, sy + ts * 0.34);
          ctx.lineTo(sx + ts * 0.5 + Math.cos(ang) * ts * 0.85,
                     sy + ts * 0.34 + Math.sin(ang) * ts * 0.55);
          ctx.stroke();
        }
        break;
      }
      case 'forageBeach': case 'forageIsland': case 'desertBush': {
        var fcol = S.iconColors(o.kind, 'crop');
        ctx.fillStyle = fcol.main;
        ctx.beginPath();
        ctx.arc(sx + ts * 0.5, sy + ts * 0.6, ts * 0.26, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = fcol.light;
        ctx.fillRect(sx + ts * 0.42, sy + ts * 0.44, ts * 0.1, ts * 0.14);
        break;
      }
      case 'fountain': {
        ctx.fillStyle = '#8d8d96';
        ctx.beginPath();
        ctx.arc(sx + ts * 0.5, sy + ts * 0.5, ts * 0.55, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = '#3f7fbf';
        ctx.beginPath();
        ctx.arc(sx + ts * 0.5, sy + ts * 0.5, ts * 0.38, 0, 6.3);
        ctx.fill();
        break;
      }
      case 'mineEntrance': case 'skullEntrance': case 'volcanoEntrance':
      case 'sewerGrate': case 'guildDoor': case 'farmCave': {
        ctx.fillStyle = '#161a20';
        ctx.beginPath();
        ctx.ellipse(sx + ts * 0.5, sy + ts * 0.6, ts * 0.5, ts * 0.42, 0, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = '#4a4a54';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = Math.round(ts * 0.4) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f4ecd8';
        ctx.fillText(OBJ_EMOJI[o.kind] || '', sx + ts * 0.5, sy + ts * 0.72);
        ctx.textAlign = 'left';
        break;
      }
      /* The things the player lives with every day get real furniture instead
       * of a coloured chip with an emoji on it: the cottage was a row of blue
       * squares, which is a large part of why the art read as unfinished. */
      case 'kitchen': case 'workshop': case 'calendarBoard':
      case 'mailbox': case 'counter': {
        var FURN = { kitchen: ['stove', 1.15], workshop: ['bench', 1.35],
                     calendarBoard: ['calendar', 0.95], mailbox: ['postbox', 0.9],
                     counter: ['bench', 1.35] };
        var fdef = FURN[o.kind];
        var fsp = S.SP[fdef[0]];
        var fpx = (ts * fdef[1]) / fsp.w;
        S.blit(ctx, fsp, sx + (ts - fsp.w * fpx) / 2,
               sy + ts - fsp.h * fpx + ts * 0.12, fpx);
        if (o.kind === 'counter' && o.keeper) {
          ctx.font = Math.round(ts * 0.3) + 'px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(240,227,194,0.9)';
          ctx.fillText(o.keeper, sx + ts * 0.5, sy + ts * 1.28);
          ctx.textAlign = 'left';
        }
        break;
      }
      case 'travelingCart': case 'islandTrader': case 'boat':
      case 'boatTicket':
      case 'museumDesk': case 'display': case 'toolUpgrade': case 'geodeCrusher':
      case 'animalShop': case 'buildMenu': case 'caveChoice':
      case 'greenhouseShell': case 'bundleBoard': {
        var col = S.iconColors(o.kind, 'crafted');
        ctx.fillStyle = col.dark;
        ctx.fillRect(sx + ts * 0.08, sy + ts * 0.2, ts * 0.84, ts * 0.7);
        ctx.fillStyle = col.main;
        ctx.fillRect(sx + ts * 0.14, sy + ts * 0.26, ts * 0.72, ts * 0.5);
        ctx.font = Math.round(ts * 0.42) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f4ecd8';
        ctx.fillText(OBJ_EMOJI[o.kind] || '\u2022', sx + ts * 0.5, sy + ts * 0.68);
        ctx.textAlign = 'left';
        break;
      }
      /* Trees and rocks are drawn as shaded FORMS rather than as flat sprite
       * grids.
       *
       * WHY: they are the two things the player looks at most, and a flat
       * green lozenge with a brown stick under it is what "đồ họa khá xấu"
       * actually meant. A canopy with a lit side, a dark underside and a few
       * broken clumps reads as a tree from a metre away; the same shape flat
       * reads as a sticker. Everything here is still drawn in code. */
      case 'tree': case 'fruitTree': {
        var th = ts * 2.2;
        var tx = sx + ts * 0.5, ty = sy + ts;
        // trunk, tapered and lit from the upper left
        var tg = ctx.createLinearGradient(tx - ts * 0.16, 0, tx + ts * 0.16, 0);
        tg.addColorStop(0, '#6b4a2c');
        tg.addColorStop(0.4, '#4e3520');
        tg.addColorStop(1, '#33220f');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(tx - ts * 0.19, ty);
        ctx.lineTo(tx - ts * 0.11, ty - ts * 0.85);
        ctx.lineTo(tx + ts * 0.11, ty - ts * 0.85);
        ctx.lineTo(tx + ts * 0.19, ty);
        ctx.closePath(); ctx.fill();

        var cy2 = ty - ts * 1.15, cr = ts * 0.86;
        var ripe = (o.kind === 'fruitTree' && o.fruit > 0);
        var deep = o.kind === 'fruitTree' ? '#25562c' : '#1f4a25';
        var mid = o.kind === 'fruitTree' ? '#3d7c3f' : '#356b32';
        var lit = o.kind === 'fruitTree' ? '#63a75c' : '#5a9450';
        // canopy: three overlapping lobes so the outline is not a circle
        var lobes = [[0, 0, 1], [-0.55, 0.22, 0.72], [0.55, 0.22, 0.72],
                     [-0.28, -0.34, 0.62], [0.3, -0.3, 0.6]];
        for (var lb = 0; lb < lobes.length; lb++) {
          var lx = tx + lobes[lb][0] * cr, ly = cy2 + lobes[lb][1] * cr;
          var lr = cr * lobes[lb][2];
          var g2 = ctx.createRadialGradient(lx - lr * 0.35, ly - lr * 0.4, lr * 0.1,
                                            lx, ly, lr);
          g2.addColorStop(0, lit);
          g2.addColorStop(0.55, mid);
          g2.addColorStop(1, deep);
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(lx, ly, lr, 0, 6.3);
          ctx.fill();
        }
        // a few broken highlights, seeded off the tile so they never shimmer
        var hn = global.SDV_TILES ? global.SDV_TILES.noise : function () { return 0.5; };
        ctx.fillStyle = 'rgba(150,205,130,0.5)';
        for (var hl = 0; hl < 5; hl++) {
          var ha = hn(o.x * 7 + hl, o.y * 3) * 6.28;
          var hd = hn(o.x, o.y * 7 + hl) * cr * 0.7;
          ctx.beginPath();
          ctx.arc(tx + Math.cos(ha) * hd - cr * 0.15,
                  cy2 + Math.sin(ha) * hd - cr * 0.2,
                  ts * 0.09, 0, 6.3);
          ctx.fill();
        }
        if (ripe) {
          ctx.fillStyle = '#e0603c';
          for (var fr = 0; fr < Math.min(4, o.fruit); fr++) {
            var fa = 1.1 + fr * 1.4;
            ctx.beginPath();
            ctx.arc(tx + Math.cos(fa) * cr * 0.62, cy2 + Math.sin(fa) * cr * 0.55,
                    ts * 0.13, 0, 6.3);
            ctx.fill();
          }
        }
        break;
      }
      case 'rock': case 'oreRock': {
        var rx = sx + ts * 0.5, ry = sy + ts * 0.82, rr = ts * 0.42;
        var body = ctx.createLinearGradient(rx - rr, ry - rr, rx + rr * 0.6, ry + rr * 0.4);
        body.addColorStop(0, '#8f8f9c');
        body.addColorStop(0.5, '#5e5e6a');
        body.addColorStop(1, '#3b3b45');
        ctx.fillStyle = body;
        ctx.beginPath();
        // an angular boulder, not a circle: five points around the centre
        var pts = [[-1, 0.05], [-0.62, -0.75], [0.18, -1], [0.92, -0.4], [0.8, 0.35]];
        ctx.moveTo(rx + pts[0][0] * rr, ry + pts[0][1] * rr);
        for (var pi = 1; pi < pts.length; pi++) {
          ctx.lineTo(rx + pts[pi][0] * rr, ry + pts[pi][1] * rr);
        }
        ctx.closePath(); ctx.fill();
        // one lit facet so it has a direction
        ctx.fillStyle = 'rgba(215,220,235,0.30)';
        ctx.beginPath();
        ctx.moveTo(rx - rr * 0.62, ry - rr * 0.75);
        ctx.lineTo(rx + rr * 0.18, ry - rr);
        ctx.lineTo(rx - rr * 0.1, ry - rr * 0.25);
        ctx.closePath(); ctx.fill();
        if (o.kind === 'oreRock' || o.ore) {
          var oc = o.ore ? S.iconColors(o.ore, 'mineral') : null;
          ctx.fillStyle = oc ? oc.main : '#d8813c';
          for (var ov = 0; ov < 3; ov++) {
            ctx.beginPath();
            ctx.arc(rx + (ov - 1) * rr * 0.42, ry - rr * (0.30 + (ov % 2) * 0.3),
                    ts * 0.075, 0, 6.3);
            ctx.fill();
          }
        }
        break;
      }
      default: {
        var sp = S.SP[o.kind];
        if (sp) {
          /* WHY: scaling every sprite by the same ts/13 made a tree the same
           * size as a weed - the art is authored at different pixel widths, so
           * the scale has to come from how big the THING is, in tiles. */
          var tiles = OBJ_TILES[o.kind] || 1;
          var scale = ts * tiles / sp.w;
          S.blit(ctx, sp, sx + (ts - sp.w * scale) / 2,
                 sy + ts - sp.h * scale, scale);
        } else {
          ctx.fillStyle = '#a08a6a';
          ctx.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);
        }
      }
    }
  };

  Game.prototype.drawActor = function (act, camX, camY, ts, isNpc) {
    var ctx = this.ctx;
    var sp = act.sprite[act.face] || act.sprite.down;
    var img = sp[act.frame % sp.length];
    var px = ts / 12;
    var sx = Math.round(act.x * ts - camX - img.w * px / 2);
    var sy = Math.round(act.y * ts - camY - img.h * px + ts * 0.5);
    /* A soft body shadow rather than a hard ellipse - stacked like the object
     * shadows so a person is planted on the ground instead of pasted onto it. */
    var bcx = Math.round(act.x * ts - camX);
    var bcy = Math.round(act.y * ts - camY + ts * 0.35);
    for (var sh = 0; sh < 3; sh++) {
      ctx.fillStyle = 'rgba(24,20,28,' + (0.16 - sh * 0.045).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(bcx, bcy, ts * (0.28 + sh * 0.09), ts * (0.13 + sh * 0.04),
                  0, 0, 6.3);
      ctx.fill();
    }
    /* A rim of light down one side once it is dark.
     *
     * WHY: against the near-black the light pass leaves behind, a flat sprite
     * loses its outline entirely - which is the one thing the reference games
     * never let happen to a character. The rim is drawn as the same sprite,
     * offset a pixel and tinted, under the real one. */
    var LT = global.SDV_LIGHT;
    var rim = LT ? LT.darkness(this) : 0;
    if (rim > 0.15) {
      ctx.save();
      ctx.globalAlpha = 0.32 * rim;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,214,150,1)';
      ctx.beginPath();
      ctx.ellipse(bcx, Math.round(act.y * ts - camY) - ts * 0.35,
                  ts * 0.42, ts * 0.62, 0, 0, 6.3);
      ctx.fill();
      ctx.restore();
    }
    S.blit(ctx, img, sx, sy, px, act.face === 'left');
    if (isNpc) {
      var cx = Math.round(act.x * ts - camX);
      /* Somebody standing at the water's edge for three hours is fishing, and
       * the schedules really do send Willy and Elliott to the pier. A rod and
       * a line say so; without it they read as a person stuck on a rock. */
      var NPCF = global.SDV_NPC;
      var areaNow = this.world.area();
      if (!act.moving && NPCF && areaNow.outdoor
          && NPCF.atWater(areaNow, act.x, act.y)) {
        var rx = cx + (act.face === 'left' ? -ts * 0.45 : ts * 0.45);
        ctx.strokeStyle = '#c9a45e';
        ctx.lineWidth = Math.max(1, ts * 0.045);
        ctx.beginPath();
        ctx.moveTo(cx, Math.round(act.y * ts - camY) - ts * 0.2);
        ctx.lineTo(rx, Math.round(act.y * ts - camY) - ts * 0.95);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(240,240,255,0.6)';
        ctx.lineWidth = Math.max(1, ts * 0.03);
        ctx.beginPath();
        ctx.moveTo(rx, Math.round(act.y * ts - camY) - ts * 0.95);
        ctx.lineTo(rx + (act.face === 'left' ? -ts * 0.5 : ts * 0.5),
                   Math.round(act.y * ts - camY) + ts * 0.25);
        ctx.stroke();
      }
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      var tw = ctx.measureText(act.name).width;
      ctx.fillRect(cx - tw / 2 - 4, sy - 16, tw + 8, 14);
      ctx.fillStyle = '#f4f0e6';
      ctx.fillText(act.name, cx, sy - 5);
      /* Where they are off to, so a villager crossing the screen reads as a
       * journey rather than as a person wandering out of frame. */
      if (act.travellingTo) {
        var names = W.AREA_NAME_VN || {};
        var dest = names[act.travellingTo] || act.travellingTo;
        ctx.font = '9px system-ui, sans-serif';
        var dw = ctx.measureText('→ ' + dest).width;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(cx - dw / 2 - 3, sy + 1, dw + 6, 11);
        ctx.fillStyle = '#c9b48c';
        ctx.fillText('→ ' + dest, cx, sy + 9);
        ctx.font = '11px system-ui, sans-serif';
      }
      /* Hearts and a present marker over the head.
       *
       * WHY: the owner played a whole session without discovering that gifts
       * existed. A villager who can still be given something today wears a
       * present; how well you know them is readable without opening a panel. */
      var fr = this.sim.friendship && this.sim.friendship[act.name];
      var hearts = this.sim.hearts(act.name);
      var canGift = !fr || (fr.giftDay !== this.sim.dayIndex()
                            && (fr.week || 0) < 2);
      if (hearts > 0 || canGift) {
        /* Drawn, not typed: an emoji present renders as a tofu box on any
         * device whose font does not carry it, and this badge has to stay
         * legible at six pixels tall on a phone. */
        var pips = Math.min(5, hearts);
        var wpx = pips * 7 + (canGift ? 9 : 0);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(cx - wpx / 2 - 3, sy - 29, wpx + 6, 11);
        var px0 = cx - wpx / 2;
        for (var hp = 0; hp < pips; hp++) {
          var hx = px0 + hp * 7, hy = sy - 27;
          ctx.fillStyle = '#ff7fa6';
          ctx.fillRect(hx, hy + 1, 2, 3);
          ctx.fillRect(hx + 3, hy + 1, 2, 3);
          ctx.fillRect(hx, hy + 3, 5, 2);
          ctx.fillRect(hx + 1, hy + 5, 3, 1);
          ctx.fillRect(hx + 2, hy + 6, 1, 1);
        }
        if (canGift) {
          var gx = px0 + pips * 7, gy = sy - 27;
          ctx.fillStyle = '#d9634f';
          ctx.fillRect(gx, gy + 2, 7, 5);
          ctx.fillStyle = '#f0e3c2';
          ctx.fillRect(gx + 3, gy + 2, 1, 5);
          ctx.fillRect(gx, gy + 3, 7, 1);
          ctx.fillStyle = '#e8c357';
          ctx.fillRect(gx + 1, gy, 2, 2);
          ctx.fillRect(gx + 4, gy, 2, 2);
        }
      }
      ctx.textAlign = 'left';
    }
  };

  /* An outline plus a floating icon on whatever the tool would act on. The
   * brief calls this out explicitly: the player must never have to guess. */
  Game.prototype.drawHighlight = function (camX, camY, ts) {
    var ctx = this.ctx;
    if (this.hover) {
      var o = this.hover;
      var hx = (o.kind === 'building' ? o.doorX : o.x);
      var hy = (o.kind === 'building' ? o.doorY : o.y);
      var sx = Math.round(hx * ts - camX), sy = Math.round(hy * ts - camY);
      var pulse = 0.55 + 0.35 * Math.sin(Date.now() / 220);
      ctx.strokeStyle = 'rgba(255,236,150,' + pulse.toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
      var label = o.kind === 'npc' ? '💬'
        : (TOOL_JOBS[o.kind] ? '⛏' : '✋');
      ctx.font = Math.round(ts * 0.7) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, sx + ts / 2, sy - 4);
      ctx.textAlign = 'left';
    }
    if (this.fishSpot) {
      var fx = Math.round(this.fishSpot.x * ts - camX);
      var fy = Math.round(this.fishSpot.y * ts - camY);
      var bob = Math.sin(Date.now() / 300) * 3;
      ctx.fillStyle = 'rgba(20,30,45,0.75)';
      ctx.beginPath();
      ctx.arc(fx + ts / 2, fy + ts / 2 + bob, ts * 0.42, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = Math.round(ts * 0.55) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('🎣', fx + ts / 2, fy + ts / 2 + bob + ts * 0.2);
      ctx.textAlign = 'left';
      this.fishBtnScreen = { x: fx + ts / 2, y: fy + ts / 2 + bob, r: ts * 0.5 };
    } else {
      this.fishBtnScreen = null;
    }
  };

  /* Weather, in layers.
   *
   * WHY layers: one field of identical streaks reads as a screen effect laid
   * over the picture. Rain that falls at two speeds and two sizes, with drops
   * bursting on the ground, reads as weather the world is standing in - which
   * is the difference the owner was pointing at. The blue wash this used to
   * paint is gone: the light pass already pulls a rainy day down and towards
   * grey, and doing it twice flattened the whole frame.
   */
  Game.prototype.drawWeather = function (vw, vh) {
    var ctx = this.ctx, w = this.sim.weather;
    var t = Date.now();
    if (w === 'rain' || w === 'storm') {
      var heavy = w === 'storm';
      var layers = heavy ? [[70, 1.6, 0.42, 30], [110, 1.0, 0.24, 20]]
                         : [[46, 1.3, 0.34, 22], [80, 0.8, 0.18, 15]];
      for (var L = 0; L < layers.length; L++) {
        var n = layers[L][0], lw = layers[L][1], al = layers[L][2], len = layers[L][3];
        ctx.strokeStyle = 'rgba(178,206,236,' + al + ')';
        ctx.lineWidth = lw;
        var sp = t / (L ? 130 : 78);
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
          var x = (i * 97 + sp * 11) % (vw + 40) - 20;
          var y = (i * 151 + sp * 34) % (vh + 60) - 30;
          ctx.moveTo(x, y);
          ctx.lineTo(x - len * 0.28, y + len);
        }
        ctx.stroke();
      }
      /* Drops landing. They sit on a slow cycle keyed off the drop's own index
       * so each one bursts at a different moment. */
      ctx.strokeStyle = 'rgba(198,224,250,0.30)';
      ctx.lineWidth = 1;
      for (var d = 0; d < (heavy ? 26 : 16); d++) {
        var ph = ((t / 620) + d * 0.37) % 1;
        var rx = (d * 313 + 61) % vw;
        var ry = (d * 197 + 113) % vh;
        var rr = 2 + ph * (heavy ? 13 : 9);
        ctx.globalAlpha = (1 - ph) * 0.5;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr, rr * 0.36, 0, 0, 6.3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (heavy && Math.random() < 0.004) {
        ctx.fillStyle = 'rgba(226,238,255,0.55)';
        ctx.fillRect(0, 0, vw, vh);
      }
    } else if (w === 'snow') {
      var ss = t / 900;
      for (var j = 0; j < 90; j++) {
        var depth = (j % 3) + 1;                 // 1 near, 3 far
        var fx2 = (j * 113 + Math.sin(ss * (0.6 + depth * 0.2) + j) * (30 / depth)) % vw;
        var fy2 = (j * 71 + ss * (34 / depth) * 26) % vh;
        var size = 4 - depth;
        ctx.fillStyle = 'rgba(240,246,255,' + (0.85 - depth * 0.2).toFixed(2) + ')';
        ctx.fillRect(fx2, fy2, size, size);
      }
    } else if (w === 'wind') {
      var k = t / 120;
      for (var m = 0; m < 26; m++) {
        var lyr = m % 2;
        ctx.fillStyle = lyr ? 'rgba(206,186,132,0.14)' : 'rgba(224,204,150,0.22)';
        var wx = (m * 211 + k * (lyr ? 22 : 38)) % (vw + 80) - 40;
        var wy = (m * 97 + Math.sin(k / 40 + m) * 14) % vh;
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(0.5 + Math.sin(k / 30 + m) * 0.5);
        ctx.fillRect(0, 0, lyr ? 5 : 8, lyr ? 3 : 4);
        ctx.restore();
      }
    }
    this.drawMotes(vw, vh);
  };

  /* The specks in the air.
   *
   * Nothing in the simulation depends on these; they exist because a still
   * frame of an empty field is what "flat" looks like. Pollen drifting in a
   * shaft of afternoon light, and fireflies once it is dark, cost one loop and
   * do more for the picture than any amount of extra tile detail. */
  Game.prototype.drawMotes = function (vw, vh) {
    var area = this.world.area();
    if (area.depth) return;
    var ctx = this.ctx;
    var LT = global.SDV_LIGHT;
    var dark = LT ? LT.darkness(this) : 0;
    var t = Date.now() / 1000;
    var night = dark > 0.55 && area.outdoor;
    var n = night ? 14 : 22;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < n; i++) {
      var seed = i * 2.399963;
      var drift = night ? 0.10 : 0.16;
      var mx = ((Math.sin(seed) * 0.5 + 0.5) * vw
                + Math.sin(t * drift + i) * vw * 0.14 + t * (night ? 3 : 7)) % vw;
      var my = ((Math.cos(seed * 1.7) * 0.5 + 0.5) * vh
                + Math.cos(t * drift * 0.8 + i * 1.3) * vh * 0.10) % vh;
      if (night) {
        // fireflies pulse; pollen does not
        var pulse = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(t * 1.6 + i)), 3);
        ctx.fillStyle = 'rgba(180,255,140,' + (0.5 * pulse).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(mx, my, 2.4, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = 'rgba(180,255,140,' + (0.10 * pulse).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(mx, my, 7, 0, 6.3);
        ctx.fill();
      } else {
        var a2 = (0.10 + 0.10 * Math.sin(t * 0.7 + i)) * (1 - dark);
        if (a2 <= 0.005) continue;
        ctx.fillStyle = 'rgba(255,246,214,' + a2.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(mx, my, 1.6, 0, 6.3);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  };

  Game.prototype.cropDef = function (name) {
    if (!this._cropByName) {
      this._cropByName = {};
      var self = this;
      this.data.crops.forEach(function (c) { self._cropByName[c.name] = c; });
    }
    return this._cropByName[name];
  };

  // ---- minimap -----------------------------------------------------------
  Game.prototype.drawMinimap = function (ctx, x, y, w, h) {
    var a = this.world.area();
    var sx = w / a.w, sy = h / a.h;
    ctx.fillStyle = 'rgba(10,14,20,0.75)';
    ctx.fillRect(x, y, w, h);
    for (var j = 0; j < a.h; j += 1) {
      for (var i = 0; i < a.w; i += 1) {
        var nm = a.name_of(i, j);
        var def = W.TILE[nm];
        var bc = a.blocked ? a.blocked[j * a.w + i] : 0;
        ctx.fillStyle = (bc && !def.water)
          ? (bc === 2 ? BLOCK_BUILDING.body
             : (BLOCK_TERRAIN[nm] || BLOCK_TERRAIN.grass).body)
          : def.c;
        ctx.fillRect(x + i * sx, y + j * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    ctx.fillStyle = '#ffe58f';
    for (var k = 0; k < a.objs.length; k++) {
      if (a.objs[k].kind !== 'building') continue;
      var o = a.objs[k];
      ctx.fillRect(x + o.x * sx, y + o.y * sy, o.w * sx, o.h * sy);
    }
    this.npcsHere().forEach(function (n) {
      ctx.fillStyle = '#7fd0ff';
      ctx.fillRect(x + n.x * sx - 1, y + n.y * sy - 1, 3, 3);
    });
    ctx.fillStyle = '#ff5f4e';
    ctx.fillRect(x + this.player.x * sx - 2, y + this.player.y * sy - 2, 4, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };

  global.SDV_GAME = { Game: Game, World: World, Player: Player, TS: TS,
                      TOOL_JOBS: TOOL_JOBS };
})(window);
