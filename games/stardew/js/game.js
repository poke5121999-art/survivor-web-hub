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
    for (var k in this.areas) fn(this.areas[k], k);
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
    // crabPot is deliberately absent: it sits in water, which is already solid
  };

  // ------------------------------------------------------------------ player
  function Player() {
    /* WHY: (8,10) sat inside the farmhouse door's warp radius, so the very first
     * step teleported the player indoors before they could move. Start clear of
     * every warp tile. */
    this.x = 11.5; this.y = 11.5;     // tile coords, float
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
    this.paused = false;
    this.onOpen = null;               // set by ui.js
    this.hover = null;                // the interactable currently highlighted
    this.warpLock = 0;
    this.fishSpot = null;
    this.npcs = [];
    this.world.game = this;             // modules reach back through the world
    this.mine = new global.SDV_MINE.Mine(this);
    this.farm = new global.SDV_FARMLIFE.FarmLife(this);
    this.events = new global.SDV_EVENTS.Events(this);
    this.initNpcs();
    this.sim.rollLuck();
    this.sim.tomorrowWeather = this.sim.rollWeather();
    this.giveStarterKit();
  }

  Game.prototype.giveStarterKit = function () {
    this.sim.give('Parsnip Seeds', 15);
    this.sim.give('Wood', 30);
    this.sim.give('Stone', 20);
  };

  // ---- villagers ---------------------------------------------------------
  var NPC_HOME = {
    Abigail: ['town', 10, 12], Pierre: ['town', 12, 12], Caroline: ['town', 8, 12],
    Lewis: ['town', 26, 20], Gus: ['town', 10, 30], Emily: ['town', 20, 22],
    Haley: ['town', 22, 22], Alex: ['town', 30, 22], George: ['town', 32, 22],
    Evelyn: ['town', 34, 22], Jodi: ['town', 16, 28], Sam: ['town', 18, 28],
    Vincent: ['town', 20, 28], Kent: ['town', 14, 28], Harvey: ['town', 41, 26],
    Maru: ['mountain', 28, 16], Robin: ['mountain', 26, 16],
    Demetrius: ['mountain', 30, 16], Sebastian: ['mountain', 27, 18],
    Linus: ['mountain', 8, 12], Marnie: ['forest', 29, 14], Shane: ['forest', 31, 14],
    Jas: ['forest', 27, 14], Leah: ['forest', 12, 12], Elliott: ['beach', 8, 10],
    Willy: ['beach', 33, 9], Penny: ['town', 6, 20], Pam: ['town', 6, 22],
    Clint: ['town', 40, 12], Wizard: ['forest', 4, 6], Dwarf: ['mountain', 36, 8],
    Krobus: ['town', 44, 34], Sandy: ['town', 46, 12], Marlon: ['mountain', 20, 6],
    Gunther: ['town', 34, 32], Morris: ['town', 46, 20], Leo: ['beach', 40, 8]
  };

  Game.prototype.initNpcs = function () {
    var self = this;
    this.npcs = [];
    this.data.villagers.forEach(function (v, i) {
      var home = NPC_HOME[v.name];
      if (!home) return;
      var hue = (S.hash(v.name) % 360);
      self.npcs.push({
        name: v.name,
        area: home[0], x: home[1], y: home[2],
        homeArea: home[0], hx: home[1], hy: home[2],
        tx: home[1], ty: home[2],
        face: 'down', frame: 0, animT: 0,
        sprite: S.person('hsl(' + hue + ',45%,32%)',
                         'hsl(' + ((hue + 140) % 360) + ',50%,48%)',
                         'hsl(' + hue + ',45%,22%)',
                         'hsl(' + ((hue + 140) % 360) + ',50%,34%)'),
        data: v
      });
    });
  };

  /* Pick the schedule block that matches today, then the step whose time has
   * passed. Blocks are ordered most-specific first on the wiki, so the first
   * match wins - which is also how the original resolves them. */
  Game.prototype.scheduleTarget = function (npc) {
    var sim = this.sim;
    var sched = npc.data.schedule || {};
    /* WHY: villagers whose wiki page does not split the schedule by season keep
     * it all under one "All" heading (Gus, Robin...). Reading only
     * schedule[season] left those characters standing on one tile forever. */
    var blocks = sched[sim.season()];
    if (!blocks || !blocks.length) blocks = sched.All;
    if (!blocks || !blocks.length) {
      for (var s in sched) { if (s !== 'Marriage' && sched[s].length) { blocks = sched[s]; break; } }
    }
    if (!blocks || !blocks.length) return null;
    var dow = sim.dayOfWeek();
    var dowName = { CN: 'sunday', T2: 'monday', T3: 'tuesday', T4: 'wednesday',
                    T5: 'thursday', T6: 'friday', T7: 'saturday' }[dow];
    var raining = sim.weather === 'rain' || sim.weather === 'storm';
    var chosen = null;
    for (var i = 0; i < blocks.length; i++) {
      var w = (blocks[i].when || '').toLowerCase();
      var dayMatch = new RegExp(sim.season().toLowerCase() + '\\s+' + sim.day + '\\b');
      if (dayMatch.test(w)) { chosen = blocks[i]; break; }
      if (raining && w.indexOf('rain') >= 0) { chosen = blocks[i]; break; }
      if (dowName && w.indexOf(dowName) >= 0) { chosen = blocks[i]; break; }
    }
    if (!chosen) {
      var w2;
      chosen = blocks.filter(function (b) {
        w2 = (b.when || '').toLowerCase();
        return w2.indexOf('regular') >= 0 || w2.indexOf('default') >= 0;
      })[0];
      /* A festival or a dated one-off is the WRONG thing to fall back on - it
       * would park the villager at a booth every ordinary day of the year. */
      if (!chosen) {
        chosen = blocks.filter(function (b) {
          w2 = (b.when || '').toLowerCase();
          return !/festival|\b(spring|summer|fall|winter)\s+\d|bus service|night market/.test(w2);
        })[0];
      }
      if (!chosen) chosen = blocks[blocks.length - 1];
    }
    var step = null;
    for (var j = 0; j < chosen.steps.length; j++) {
      if (sim.time >= chosen.steps[j].t) step = chosen.steps[j];
    }
    return step ? { block: chosen, step: step } : null;
  };

  /* The wiki writes locations as prose ("Leaves her room to stand in Pierre's
   * General Store"), so movement is derived from keywords rather than
   * coordinates: a villager walks to a spot near their home, their workplace,
   * or the town square, and stays put at night. That is enough to make the town
   * read as alive without inventing a coordinate for 3,069 prose lines. */
  var PLACE_HINTS = [
    [/saloon|stardrop|bar\b/i, ['town', 10, 30]],
    [/general store|pierre's/i, ['town', 10, 14]],
    [/joja/i, ['town', 46, 20]],
    [/clinic|hospital|harvey/i, ['town', 41, 26]],
    [/museum|library|gunther/i, ['town', 34, 32]],
    [/community cent/i, ['town', 34, 12]],
    [/graveyard|cemetery/i, ['town', 40, 32]],
    [/playground|park|fountain/i, ['town', 22, 18]],
    [/blacksmith|clint/i, ['town', 40, 14]],
    [/beach|ocean|pier|dock|tide ?pool/i, ['beach', 20, 10]],
    [/willy|fish shop/i, ['beach', 33, 10]],
    [/mountain|carpenter|robin's|science|adventurer/i, ['mountain', 24, 18]],
    [/lake/i, ['mountain', 10, 22]],
    [/mine|quarry/i, ['mountain', 34, 8]],
    [/forest|ranch|marnie's|wizard|tower/i, ['forest', 26, 15]],
    [/leah|cottage/i, ['forest', 12, 13]],
    [/bus stop|bus\b/i, ['busstop', 12, 13]],
    [/river|bridge/i, ['town', 26, 34]],
    [/town|square|plaza|street|road|path/i, ['town', 24, 20]],
    [/farm\b/i, ['farm', 20, 18]]
  ];
  // Phrases that mean "indoors, where they live" - the villager holds position.
  var STAY_HOME = /\b(in|inside|at) (her|his|their) (room|house|home|bed)|goes to bed|sleep|kitchen|living room|stays home/i;
  // Prose that describes leaving without naming a destination we can map.
  var LEAVING = /^(leaves|walks|heads|goes|exits|steps|travels|returns)/i;

  Game.prototype.updateNpcs = function (dt) {
    var self = this;
    this.npcs.forEach(function (n) {
      var t = self.scheduleTarget(n);
      var dest = null;
      var where = t ? (t.step.where || '') : '';
      if (where && !STAY_HOME.test(where)) {
        for (var i = 0; i < PLACE_HINTS.length; i++) {
          if (PLACE_HINTS[i][0].test(where)) { dest = PLACE_HINTS[i][1]; break; }
        }
        /* WHY: the wiki writes destinations as prose, and most steps name a place
         * this game has no coordinate for ("into Caroline and Pierre's room").
         * Sending every unmapped step home made villagers stand still all day,
         * which reads as a broken town. A step that clearly describes LEAVING
         * moves them to a spot outside their door instead. */
        if (!dest && LEAVING.test(where)) {
          dest = [n.homeArea, n.hx + ((S.hash(where) % 5) - 2), n.hy + 2 + (S.hash(n.name) % 3)];
        }
      }
      if (!dest) dest = [n.homeArea, n.hx, n.hy];
      if (dest[0] !== n.area) { n.area = dest[0]; n.x = dest[1]; n.y = dest[2]; }
      n.tx = dest[1]; n.ty = dest[2];
      var dx = n.tx - n.x, dy = n.ty - n.y;
      var d = Math.hypot(dx, dy);
      if (d > 0.12) {
        var sp = 1.7 * dt;
        n.x += dx / d * Math.min(sp, d);
        n.y += dy / d * Math.min(sp, d);
        n.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                             : (dy > 0 ? 'down' : 'up');
        n.animT += dt;
        if (n.animT > 0.22) { n.animT = 0; n.frame ^= 1; }
      } else {
        n.frame = 0;
      }
    });
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
    var sp = p.speed * (this.sim.exhausted ? 0.55 : 1) * dt * Math.min(1, len);
    var tryX = p.x + nx * sp, tryY = p.y + ny * sp;
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
    /* A short lock-out after arriving: without it the destination tile is often
     * inside the return warp's radius and the player ping-pongs between rooms. */
    if (this.warpLock > 0) return;
    for (var i = 0; i < a.warps.length; i++) {
      var w = a.warps[i];
      if (!w.to) continue;
      if (Math.abs(p.x - (w.x + 0.5)) < 0.45 && Math.abs(p.y - (w.y + 0.5)) < 0.45) {
        this.world.current = w.to;
        p.x = w.tx + 0.5; p.y = w.ty + 0.5;
        this.warpLock = 0.6;
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
              label: 'Chặt cây', becomes: 'stump' },
    stump:  { hits: 3, energy: 4, skill: 'foraging', xp: 8, drop: ['Hardwood', 2],
              label: 'Nhổ gốc' },
    rock:   { hits: 3, energy: 3, skill: 'mining', xp: 6, drop: ['Stone', 3],
              label: 'Đập đá' },
    oreRock:{ hits: 4, energy: 3, skill: 'mining', xp: 12, drop: ['Copper Ore', 2],
              label: 'Đào quặng' },
    weed:   { hits: 1, energy: 1, skill: 'foraging', xp: 2, drop: ['Fiber', 1],
              label: 'Dọn cỏ' },
    grassTuft: { hits: 1, energy: 1, skill: 'foraging', xp: 1, drop: ['Hay', 1],
                 label: 'Cắt cỏ' },
    stick:  { hits: 1, energy: 1, skill: 'foraging', xp: 2, drop: ['Wood', 2],
              label: 'Nhặt cành' },
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
    if (this.warpLock > 0) this.warpLock -= dt;
    this.movePlayer(dt);
    this.updateNpcs(dt);
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
    this.mine.monsters = [];
    this.player.x = 11.5; this.player.y = 11.5;
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
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var name = a.name_of(x, y);
        var def = W.TILE[name];
        var sx = Math.round(x * ts - camX), sy = Math.round(y * ts - camY);
        ctx.fillStyle = ((x + y) & 1) ? def.c : (def.c2 || def.c);
        ctx.fillRect(sx, sy, ts + 1, ts + 1);
        if (name === 'water' || name === 'deep') {
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          var wob = Math.sin((Date.now() / 420) + x * 0.7 + y * 0.4);
          ctx.fillRect(sx, sy + ts * 0.3 + wob * 2, ts, 2);
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
    this.drawHighlight(camX, camY, ts);
    this.drawWeather(vw, vh);
    this.drawNightTint(vw, vh);
  };

  // How wide each world object should read, measured in tiles. A tree is not
  // the same size as a weed, and the art files are authored at different widths.
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
        S.blit(ctx, S.SP.furnace, sx, sy, ts / 10);
        if (o.ready) {
          ctx.fillStyle = '#e8c357';
          ctx.fillRect(sx + ts * 0.4, sy - ts * 0.35, ts * 0.2, ts * 0.25);
        }
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
      case 'travelingCart': case 'islandTrader': case 'boat':
      case 'boatTicket': case 'kitchen': case 'mailbox': case 'calendarBoard':
      case 'museumDesk': case 'display': case 'toolUpgrade': case 'geodeCrusher':
      case 'animalShop': case 'buildMenu': case 'caveChoice':
      case 'greenhouseShell': case 'counter': case 'bundleBoard': {
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
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      var tw = ctx.measureText(act.name).width;
      ctx.fillRect(Math.round(act.x * ts - camX) - tw / 2 - 4, sy - 16, tw + 8, 14);
      ctx.fillStyle = '#f4f0e6';
      ctx.fillText(act.name, Math.round(act.x * ts - camX), sy - 5);
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
        var def = W.TILE[a.name_of(i, j)];
        ctx.fillStyle = def.c;
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
                      TOOL_JOBS: TOOL_JOBS, NPC_HOME: NPC_HOME };
})(window);
