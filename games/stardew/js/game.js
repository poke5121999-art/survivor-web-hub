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
    this.spark(target.x, target.y);
    if (target.hp > 0) return;
    var drop = job.drop;
    if (target.ore) drop = [target.ore, 3];      // mine rocks carry their own ore
    if (drop) {
      var n = 1 + Math.floor(Math.random() * drop[1]);
      if (!this.sim.give(drop[0], n)) this.toast('Túi đầy!');
      else this.toast('+' + n + ' ' + drop[0]);
    }
    if (this.world.area().depth) this.mine.maybeDropLadder(target.x, target.y, false);
    var lvl = this.sim.addXp(job.skill, job.xp);
    if (lvl) this.toast('Kỹ năng ' + job.skill + ' lên cấp ' + lvl + '!');
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
    this.spark(x, y);
  };

  // ---- feedback ----------------------------------------------------------
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
    this.farm.overnight({});
    var report = this.sim.endDay(this.world);
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
    this.drawHighlight(camX, camY, ts);
    this.drawWeather(vw, vh);
    this.drawNightTint(vw, vh);
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
          ctx.fillStyle = '#6b5a3c';
          ctx.fillRect(sx + ts * 0.35, sy + ts * 0.3, ts * 0.3, ts * 0.6);
        } else {
          S.drawCrop(ctx, sx, sy, ts / 12, o.stage, o.maxStage + 1,
                     col.main, col.light, crop && crop.trellis);
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
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(Math.round(act.x * ts - camX), Math.round(act.y * ts - camY + ts * 0.35),
                ts * 0.3, ts * 0.14, 0, 0, 6.3);
    ctx.fill();
    S.blit(ctx, img, sx, sy, px, act.face === 'left');
    if (isNpc) {
      var cx = Math.round(act.x * ts - camX);
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      var tw = ctx.measureText(act.name).width;
      ctx.fillRect(cx - tw / 2 - 4, sy - 16, tw + 8, 14);
      ctx.fillStyle = '#f4f0e6';
      ctx.fillText(act.name, cx, sy - 5);
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

  Game.prototype.drawWeather = function (vw, vh) {
    var ctx = this.ctx, w = this.sim.weather;
    if (w === 'rain' || w === 'storm') {
      ctx.strokeStyle = 'rgba(150,190,230,0.45)';
      ctx.lineWidth = 1;
      var t = Date.now() / 90;
      for (var i = 0; i < 90; i++) {
        var x = (i * 79 + t * 9) % vw;
        var y = (i * 137 + t * 26) % vh;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,50,80,0.16)';
      ctx.fillRect(0, 0, vw, vh);
      if (w === 'storm' && Math.random() < 0.004) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(0, 0, vw, vh);
      }
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      var s = Date.now() / 700;
      for (var j = 0; j < 70; j++) {
        var sx = (j * 113 + Math.sin(s + j) * 24) % vw;
        var sy = (j * 71 + s * 26) % vh;
        ctx.fillRect(sx, sy, 3, 3);
      }
    } else if (w === 'wind') {
      ctx.fillStyle = 'rgba(200,180,120,0.18)';
      var k = Date.now() / 120;
      for (var m = 0; m < 24; m++) {
        var wx = (m * 211 + k * 32) % (vw + 60) - 30;
        var wy = (m * 97) % vh;
        ctx.fillRect(wx, wy, 14, 2);
      }
    }
  };

  Game.prototype.drawNightTint = function (vw, vh) {
    var t = this.sim.time, ctx = this.ctx;
    var a = 0;
    if (t > 17 * 60) a = Math.min(0.55, (t - 17 * 60) / (7 * 60) * 0.62);
    if (!this.world.area().outdoor) a = Math.max(a, 0.12);
    if (a <= 0) return;
    ctx.fillStyle = 'rgba(18,22,48,' + a.toFixed(2) + ')';
    ctx.fillRect(0, 0, vw, vh);
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
