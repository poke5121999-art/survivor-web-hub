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
  /* Restoring a save used to overwrite the whole world with the saved copy of
   * it - every object and every tile of every area.
   *
   * WHY that is wrong: only some of the world belongs to the PLAYER. Crops,
   * chests, crab pots, dropped goods and the soil they tilled are theirs and
   * must come back exactly. Doorways, shop counters, the furniture in the
   * cottage, the scenery - those belong to the BUILD, and a save written last
   * week pinned them to last week's layout. A returning player got the old
   * house, the old shop counters and none of the new furniture, and reasonably
   * concluded that nothing had been updated at all.
   *
   * So: keep what the world just generated, add back only what the player put
   * there, and take from the saved tiles only the two kinds a player can make
   * - tilled soil and watered soil. */
  var PLAYER_TILES = { tilled: 1, watered: 1 };

  /* The fixtures: things this BUILD decides the position of, and that a player
   * can never move or destroy. On a restore these are taken fresh, and the
   * saved copies of them are thrown away - that is what lets a change to the
   * cottage layout or a new shop counter reach somebody who already has a save.
   *
   * Everything NOT on this list comes back from the save instead, and that
   * distinction is the whole point: trees, rocks, weeds and driftwood are also
   * placed by the world generator, but the player CHOPS them. Rebuilding those
   * would regrow every tree they ever felled, on every single load. */
  var FIXTURE = {
    doorway: 1, counter: 1, bed: 1, tv: 1, kitchen: 1, chest: 1, workshop: 1,
    calendarBoard: 1, mailbox: 1, bin: 1, sign: 1, bundleBoard: 1, machine: 1,
    toolUpgrade: 1, geodeCrusher: 1, buildMenu: 1, animalShop: 1,
    museumDesk: 1, boatTicket: 1, mineEntrance: 1, skullEntrance: 1,
    volcanoEntrance: 1, travelingCart: 1, islandTrader: 1, boat: 1,
    caveChoice: 1, bus: 1, sewerGrate: 1, guildDoor: 1, display: 1,
    greenhouseShell: 1
    /* `brokenBridge` is deliberately absent: repairing it REMOVES the object,
     * and rebuilding it would un-repair the Crafts Room reward every load. */
  };

  World.prototype.deserialize = function (s) {
    if (!s) return;
    this.current = s.current || 'farm';
    for (var k in s.areas) {
      var a = this.areas[k];
      if (!a) continue;
      var d = s.areas[k];
      if (d.tiles && d.tiles.length === a.tiles.length) {
        for (var i = 0; i < d.tiles.length; i++) {
          var name = W.TILE_IDS[d.tiles[i]];
          if (PLAYER_TILES[name]) a.tiles[i] = d.tiles[i];
        }
      }
      if (!d.objs) continue;
      var fresh = a.objs.filter(function (o) { return FIXTURE[o.kind]; });
      var taken = {};
      fresh.forEach(function (o) { taken[o.x + ',' + o.y] = 1; });
      var mine = d.objs.filter(function (o) {
        // a saved fixture is last build's copy of a thing we just rebuilt
        if (FIXTURE[o.kind]) return false;
        // and nothing of the player's may land on top of a rebuilt fixture
        return !taken[o.x + ',' + o.y];
      });
      a.objs = fresh.concat(mine);
      a.objs.forEach(function (o) {
        if (SOLID_OBJ[o.kind]) a.block(o.x, o.y, true);
      });
    }
  };

  /* Delegates to the area's tile index - see Area.index in world.js for why
   * the linear scan this replaced could not stay. */
  World.prototype.objAt = function (x, y, area) {
    return (area || this.area()).objAt(x, y);
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
    this.loot = [];
    this.watchXp();
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

  // ---- walking there yourself -------------------------------------------
  /* Tap-to-walk.
   *
   * WHY this exists at all: `UI.tapTile` opened with `if (dist > 3.2) return;`
   * — a tap further than three tiles away did nothing, and said nothing. On a
   * 430x860 phone showing about 13x26 tiles, that left nine tenths of what the
   * player could see inert on touch, and it is the whole of the owner's report
   * that the house was hard to get into. The doorstep is a single tile and the
   * only way onto it was to steer a virtual stick.
   *
   * This is the scheme the game's own mobile port ships as its default: tap
   * anywhere and the farmer walks there; tap a thing and the farmer walks to it
   * and does the obvious thing to it. The stick stays for anyone who prefers to
   * steer, and touching it cancels the walk.
   *
   * The design is deliberately ADDITIVE: with no route set, not one line of
   * movement behaves differently from before. Everything inside the old 3.2-tile
   * reach still acts immediately, exactly as it did; only the range that used to
   * be silence now walks.
   */
  var ROUTE_BUDGET = 30000;      // one search per tap, not one per frame

  /* Every reason a route ends, in one place. A farmer that keeps walking after
   * the player has changed their mind is worse than one that never walked. */
  Game.prototype.cancelRoute = function (why) {
    if (!this.player.route) return false;
    this.player.route = null;
    this.player.routeWhy = why || 'cancelled';
    this.player.frame = 0;
    return true;
  };

  /* Say no out loud. The silent refusal is the bug being fixed here, so a
   * request that cannot be satisfied leaves a mark on the map and a line of
   * text - never nothing. */
  Game.prototype.refuseRoute = function (x, y, msg) {
    this.refused = { x: x, y: y, t: Date.now() };
    this.sfx('error');
    this.toast(msg || 'Không đi tới đó được');
    return false;
  };

  /* A free tile orthogonally beside (x,y) that the player could act from. */
  Game.prototype.besideTile = function (x, y) {
    var a = this.world.area(), p = this.player, best = null, bd = 1e9;
    var n = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (var i = 0; i < 4; i++) {
      var nx = n[i][0], ny = n[i][1];
      if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue;
      if (this.solidForWalk(nx, ny)) continue;
      var d = Math.hypot(nx + 0.5 - p.x, ny + 0.5 - p.y);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
    return best;
  };

  /* Walkability for routing. Terrain plus the objects that block, which is
   * exactly what `World.solidAt` answers for the CURRENT area. */
  Game.prototype.solidForWalk = function (x, y) {
    return this.world.solidAt(x, y);
  };

  /* Set a route to (gx,gy), optionally with something to do on arrival.
   * Returns false and says why when the goal cannot be walked to. */
  Game.prototype.walkTo = function (gx, gy, action, opt) {
    opt = opt || {};
    var NPC = global.SDV_NPC, p = this.player, a = this.world.area();
    var sx = Math.floor(p.x), sy = Math.floor(p.y);
    if (sx === gx && sy === gy) {
      this.cancelRoute('already-there');
      if (action) action();
      return true;
    }
    if (!NPC || !NPC.findPath) return false;
    if (this.solidForWalk(gx, gy)) {
      return this.refuseRoute(gx, gy, opt.why || 'Chỗ đó đi không được');
    }
    var path = NPC.findPath(a, sx, sy, gx, gy, ROUTE_BUDGET);
    var last = path.length ? path[path.length - 1] : null;
    /* findPath falls back to the CLOSEST reachable tile when the goal is walled
     * off. For a villager that is the right answer; for a tap it is not - the
     * player asked to go somewhere, and stopping halfway without a word is the
     * behaviour being replaced. */
    if (!last || last.x !== gx || last.y !== gy) {
      return this.refuseRoute(gx, gy, opt.why || 'Không có đường tới đó');
    }
    p.route = { path: path, i: 0, gx: gx, gy: gy,
                action: action || null, face: opt.face || null,
                repathed: false };
    this.refused = null;
    return true;
  };

  /* This frame's movement vector, taken from the route. Null means the route
   * ended (arrived, or cancelled by one of the rules below). */
  Game.prototype.stepRoute = function (dt) {
    var p = this.player, r = p.route;
    if (!r) return null;
    /* Never auto-walk into a fight. Underground the same button is the sword,
     * and a farmer strolling toward a tapped rock past a slime is a death the
     * player did not choose. */
    var mobs = this.mine.monsters;
    for (var m = 0; m < mobs.length; m++) {
      if (Math.hypot(mobs[m].x - p.x, mobs[m].y - p.y) < 2.4) {
        this.cancelRoute('monster');
        return null;
      }
    }
    if (this.sim.energy <= 0) { this.cancelRoute('exhausted'); return null; }

    var step = r.path[r.i];
    while (step && Math.hypot(step.x + 0.5 - p.x, step.y + 0.5 - p.y) < 0.14) {
      r.i++;
      step = r.path[r.i];
    }
    if (!step) return this.arriveRoute();

    if (this.solidForWalk(step.x, step.y)) {
      /* Something moved into the way. The original's own mobile port documents
       * what NOT to do here - when a path is blocked by a moving character it
       * "may suddenly stop, try a different path, or head off in a random
       * direction (very likely a bug)". So: re-path exactly once, then stop and
       * say so. Never improvise. */
      if (r.repathed) {
        this.cancelRoute('blocked');
        this.toast('Đường bị chặn');
        return null;
      }
      r.repathed = true;
      var again = global.SDV_NPC.findPath(this.world.area(), Math.floor(p.x),
                                          Math.floor(p.y), r.gx, r.gy,
                                          ROUTE_BUDGET);
      var lastA = again.length ? again[again.length - 1] : null;
      if (!lastA || lastA.x !== r.gx || lastA.y !== r.gy) {
        this.cancelRoute('blocked');
        this.toast('Đường bị chặn');
        return null;
      }
      r.path = again; r.i = 0;
      step = again[0];
      if (!step) return this.arriveRoute();
    }

    var dx = step.x + 0.5 - p.x, dy = step.y + 0.5 - p.y;
    var d = Math.hypot(dx, dy);
    if (d < 1e-6) return null;
    var slow = this.sim.sluggish || (this.sim.energy <= 0);
    return { x: dx / d, y: dy / d, sp: p.speed * (slow ? 0.55 : 1) * dt };
  };

  /* Arrived: face what was tapped, then do the thing that was queued. */
  Game.prototype.arriveRoute = function () {
    var p = this.player, r = p.route;
    p.route = null;
    p.routeWhy = 'arrived';
    p.frame = 0;
    if (!r) return null;
    if (r.face) {
      var fx = r.face.x + 0.5 - p.x, fy = r.face.y + 0.5 - p.y;
      if (Math.abs(fx) > 0.2 || Math.abs(fy) > 0.2) {
        p.face = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 'right' : 'left')
                                             : (fy > 0 ? 'down' : 'up');
      }
    }
    if (r.action) {
      try { r.action(); } catch (e) { console.error(e); }
    }
    return null;
  };

  /* The route, drawn. A walk the player cannot see the shape of is a walk they
   * cannot tell apart from the game ignoring them - which is the failure this
   * whole feature exists to end. */
  Game.prototype.drawRoute = function (camX, camY, ts) {
    var ctx = this.ctx, p = this.player;
    var now = Date.now();
    if (this.refused && now - this.refused.t < 1400) {
      var k = (now - this.refused.t) / 1400;
      var rx = this.refused.x * ts - camX + ts / 2;
      var ry = this.refused.y * ts - camY + ts / 2;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#e0563c';
      ctx.lineWidth = Math.max(2, ts * 0.09);
      ctx.beginPath();
      ctx.arc(rx, ry, ts * (0.32 + k * 0.25), 0, 6.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx - ts * 0.2, ry - ts * 0.2);
      ctx.lineTo(rx + ts * 0.2, ry + ts * 0.2);
      ctx.moveTo(rx + ts * 0.2, ry - ts * 0.2);
      ctx.lineTo(rx - ts * 0.2, ry + ts * 0.2);
      ctx.stroke();
      ctx.restore();
    }
    var r = p.route;
    if (!r) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = r.i; i < r.path.length; i++) {
      var t = r.path[i];
      var a = 0.30 - (i - r.i) * 0.006;
      if (a <= 0.03) break;
      ctx.fillStyle = 'rgba(255,236,180,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(t.x * ts - camX + ts / 2, t.y * ts - camY + ts / 2,
              Math.max(1.5, ts * 0.07), 0, 6.3);
      ctx.fill();
    }
    ctx.restore();
    var g = r.path[r.path.length - 1];
    if (!g) return;
    var pulse = 0.55 + 0.45 * Math.sin(now / 220);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,226,150,' + pulse.toFixed(2) + ')';
    ctx.lineWidth = Math.max(2, ts * 0.07);
    ctx.beginPath();
    ctx.arc(g.x * ts - camX + ts / 2, g.y * ts - camY + ts / 2,
            ts * 0.30, 0, 6.3);
    ctx.stroke();
    ctx.restore();
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
    var nx, ny, sp;
    if (len >= 0.08) {
      /* The stick always wins. Touching it is the player saying "I'll steer",
       * and it is the first and most important of the cancel rules. */
      this.cancelRoute('stick');
      nx = i.dx / len; ny = i.dy / len;
      var slowS = this.sim.sluggish || (this.sim.energy <= 0);
      sp = p.speed * (slowS ? 0.55 : 1) * dt * Math.min(1, len);
    } else if (p.route) {
      var v = this.stepRoute(dt);
      if (!v) { p.frame = 0; return; }
      nx = v.x; ny = v.y; sp = v.sp;
    } else {
      p.frame = 0;
      return;
    }
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

  /* Go through a door the player tapped, from wherever they are standing.
   *
   * The walk-in path below still exists and still works; this is the one a
   * finger uses. It runs the same shut-door rule, so tapping a closed shop
   * outside its hours is refused with the hours, exactly like walking into it. */
  Game.prototype.enterDoor = function (o) {
    if (!o || !o.to) return;
    /* WHY the distance check: this used to teleport the farmer through a door
     * from anywhere on the map, which was a patch for the silent tap gate, not
     * a design. Tap-to-walk replaced it - a distant tap now WALKS to the door
     * and steps through it. What is left here is the in-range case, where
     * "teleport" means moving one tile and is indistinguishable from stepping
     * through the doorway. */
    if (Math.hypot(o.x + 0.5 - this.player.x, o.y + 0.5 - this.player.y) > 2.4) {
      return this.walkTo(o.x, o.y, null, { why: 'Không có đường tới cửa đó' });
    }
    var a = this.world.area();
    var w = (a.warps || []).filter(function (v) {
      return v.to === o.to && Math.abs(v.x - o.x) <= 1 && Math.abs(v.y - o.y) <= 1;
    })[0];
    if (!w) return;
    var dest = this.world.areas[w.to];
    if (!dest) return;
    var NPCM = global.SDV_NPC;
    if (NPCM && !NPCM.doorOpen(w, this.sim.time)) {
      this.sfx('error');
      return this.toast('Cửa đang đóng · mở ' + NPCM.hhmm(w.open)
                        + ' – ' + NPCM.hhmm(w.close));
    }
    var spot = dest.nearestFree(w.tx, w.ty, 10);
    var origin = this.world.current;
    this.world.current = w.to;
    this.player.x = spot.x + 0.5;
    this.player.y = spot.y + 0.5;
    this.cameFrom = origin;
    this.arrivedX = this.player.x;
    this.arrivedY = this.player.y;
    this.sfx(dest.outdoor ? 'warp' : 'door');
    this.toast('→ ' + this.world.area().name);
  };

  Game.prototype.checkWarp = function () {
    var a = this.world.area(), p = this.player;
    /* Which warps belong to an actual door, so only those get the roomy
     * trigger. Built once per area and cached on it. */
    if (!a._doorWarps) {
      a._doorWarps = {};
      (a.objs || []).forEach(function (o) {
        if (o.kind === 'doorway') a._doorWarps[o.x + ',' + o.y] = 1;
      });
    }
    var doorWarps = a._doorWarps;
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
      /* A door you have to hit dead centre is a door you miss.
       *
       * The box used to be under half a tile square, so on a touch joystick
       * you slid past the farmhouse again and again. A doorway is now
       * generous sideways - you are aiming at a door, not threading a gap -
       * and generous BELOW it, because you approach a door from the doorstep
       * and the doorstep is the tile the map marks. Map-edge warps keep the
       * tight box: those you want to cross deliberately, not fall through. */
      var isDoor = doorWarps[w.x + ',' + w.y];
      var padX = isDoor ? 0.85 : 0.45;
      var padUp = isDoor ? 0.55 : 0.45;
      var padDown = isDoor ? 1.15 : 0.45;
      var dyw = p.y - (w.y + 0.5);
      if (Math.abs(p.x - (w.x + 0.5)) < padX
          && dyw > -padUp && dyw < padDown) {
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
        // the route's tiles belong to the area we just left
        this.cancelRoute('area');
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
  /* What the tool would act on: the tile being FACED first, then whatever is
   * next to the player - and nothing further away than that.
   *
   * WHY the tight ring: it used to search two tiles out and pick the nearest,
   * so the highlight regularly sat on a tree behind the player while they
   * stood in front of a rock, and the button hit the tree. The owner asked for
   * the tile in the facing direction to be highlighted and for only adjacent
   * things to be reachable. That is also how the original works - a tool acts
   * on the tile in front of the farmer, and anything further away is reached
   * by walking to it first, which the tap-to-walk route already does.
   * SEE: stardewvalleywiki.com/Mobile_Controls - "Tap on items to action them".
   */
  Game.prototype.findInteractable = function () {
    var p = this.player;
    var px = Math.floor(p.x), py = Math.floor(p.y);

    // an NPC within arm's reach outranks scenery - talking is what is wanted
    var here = this.npcsHere();
    for (var i = 0; i < here.length; i++) {
      var n = here[i];
      if (Math.hypot(n.x - p.x, n.y - p.y) < 1.8) {
        return { kind: 'npc', npc: n, x: Math.floor(n.x), y: Math.floor(n.y) };
      }
    }

    // the faced tile wins outright, whatever else is around
    var f = this.facingTile();
    var faced = this.world.objAt(f.x, f.y);
    if (faced) return faced;

    /* Then the eight neighbours and the tile underfoot, nearest first. A
     * building is measured at its doorstep, not its centre, because that is
     * the tile the player actually stands on to use it. */
    var best = null, bestD = 99;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var o = this.world.objAt(px + dx, py + dy);
        if (!o) continue;
        var ox = (o.kind === 'building' ? o.doorX : o.x) + 0.5;
        var oy = (o.kind === 'building' ? o.doorY : o.y) + 0.5;
        var d = Math.hypot(ox - p.x, oy - p.y);
        if (d > 1.6 || d >= bestD) continue;
        bestD = d; best = o;
      }
    }
    return best;
  };

  /* Everything a single tool destroys by hitting it. Kept as its own list
   * because it is the closed set the auto-swing is allowed to touch: tilling,
   * watering, opening a chest and walking into a shop must all stay deliberate
   * acts, or standing still becomes destructive. */
  var AUTO_BREAK = { tree: 1, stump: 1, rock: 1, oreRock: 1,
                     weed: 1, stick: 1, grassTuft: 1 };

  /* The one rule the design asks for that the game never had: walk up close
   * and the action happens - up to a tree and you chop it, up to a rock and
   * you break it, up to a monster and you swing at it. The original does the
   * same on a phone: it turns to face what is in range and keeps hitting it
   * until it is gone.
   * SEE: stardewvalleywiki.com/Mobile_Controls - Auto-attack.
   *
   * Bounded deliberately: only things that break, only within arm's reach,
   * never while a tapped route is walking somewhere else (the trip is the
   * player's instruction and stopping to chop every tree on the way is not
   * what they asked for - the original refuses for the same reason), and never
   * once energy is out. */
  Game.prototype.autoAct = function () {
    if (this.autoActOff || this.paused || this.player.route) return;
    var p = this.player;
    if (p.actCooldown > 0) return;
    if (this.fishing || this.cutscene) return;

    // monsters first: being unable to fight back while cornered is unforgivable
    if (this.mine.monsters.length) {
      var near = null, nd = 99;
      for (var i = 0; i < this.mine.monsters.length; i++) {
        var m = this.mine.monsters[i];
        if (m.dead) continue;
        var d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d < nd) { nd = d; near = m; }
      }
      if (near && nd <= 1.6) {
        /* Fighting back is exempt from the reserve. A farmer who stops
         * defending themselves at 27 stamina, surrounded, in the dark, does
         * not get to walk home either - passing out beats being killed, and
         * the swing that kills the last slime is the one that saves the run. */
        // turn to face it, exactly as the original does, then swing
        var ax = near.x - p.x, ay = near.y - p.y;
        p.face = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right')
                                             : (ay < 0 ? 'up' : 'down');
        this.useTool();
        return;
      }
    }

    var o = this.hover;
    if (!o || !AUTO_BREAK[o.kind]) return;

    /* The auto-swing stops well BEFORE empty, not at empty.
     *
     * WHY there is a reserve: this is the one thing in the game that spends
     * stamina without the player asking, so it is the one thing that can spend
     * the last of it while they are walking somewhere else entirely - and
     * running out means collapsing, which costs a chunk of the next day. The
     * owner's instruction was to stop it: "khi gần hết stamina thì đừng auto
     * làm gì hao stamina để tránh bất tỉnh". Below the reserve the tool still
     * works when it is PRESSED - the player may spend their last point on
     * purpose, they simply cannot lose it by standing still. */
    var reserve = Math.max(10, Math.round(this.sim.maxEnergy * 0.10));
    if (this.sim.energy <= reserve) {
      // say it once, not sixty times a second
      if (!this.autoTired) {
        this.autoTired = 1;
        this.toast(this.sim.energy <= 0
          ? 'Hết sức rồi, phải đi ngủ'
          : 'Sắp hết sức — tự động dừng lại, muốn làm nữa thì bấm nút');
        this.sfx('error');
      }
      return;
    }
    this.autoTired = 0;
    // face what is about to be hit, so the swing arc points the right way
    var dx2 = o.x + 0.5 - p.x, dy2 = o.y + 0.5 - p.y;
    if (Math.abs(dx2) > 0.55 || Math.abs(dy2) > 0.55) {
      p.face = Math.abs(dx2) > Math.abs(dy2) ? (dx2 < 0 ? 'left' : 'right')
                                             : (dy2 < 0 ? 'up' : 'down');
    }
    this.useTool();
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

  /* Is this something a tap should HIT rather than open? Deliberately narrower
   * than TOOL_JOBS: a shop counter and a broken bridge both have entries there
   * but want their panel, not a swing. */
  /* The tool table, reachable from the interface so the hand button can print
   * the real verb ("Chặt cây", "Đập đá") instead of a generic one. */
  Game.prototype.toolJob = function (kind) { return TOOL_JOBS[kind] || null; };

  Game.prototype.canHit = function (o) {
    if (!o || !TOOL_JOBS[o.kind] || TOOL_JOBS[o.kind].build) return false;
    var p = this.player;
    return Math.max(Math.abs(o.x + 0.5 - p.x), Math.abs(o.y + 0.5 - p.y)) <= 1.6;
  };

  /* Swing at one named target, whatever the highlight happens to be on.
   *
   * WHY it takes an argument: `useTool` acts on `this.hover`, which is fine for
   * a button but wrong for a tap - the player pointed at something specific and
   * it may not be the thing nearest their feet. */
  Game.prototype.hit = function (target) {
    if (!this.canHit(target)) return;
    var p = this.player;
    var dx = target.x + 0.5 - p.x, dy = target.y + 0.5 - p.y;
    if (Math.abs(dx) > 0.55 || Math.abs(dy) > 0.55) {
      p.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right')
                                           : (dy < 0 ? 'up' : 'down');
    }
    var was = this.hover;
    this.hover = target;
    p.actCooldown = 0;                 // a deliberate tap is never on cooldown
    this.useTool();
    if (this.hover === target) this.hover = was;
  };

  Game.prototype.useTool = function () {
    var p = this.player;
    if (p.actCooldown > 0) return;
    // pressing the action button is the player taking over
    this.cancelRoute('action');
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
    /* Cut grass goes into the silos when the farm has any, and only into the
     * bag when it does not. This is the INPUT side of the hay economy: without
     * it a silo would be a cap on nothing, and animals would starve the moment
     * the free hay stopped. */
    if (target.kind === 'grassTuft' && this.farm && this.farm.hayCap() > 0) {
      var cut = 1 + Math.floor(Math.random() * 2);
      var put = this.farm.storeHay(cut);
      if (put > 0) {
        drop = null;                       // it went to the silo, not the bag
        this.toast('+' + put + ' cỏ khô vào kho ('
                   + this.sim.hay + '/' + this.farm.hayCap() + ')');
      } else {
        this.toast('Kho cỏ đã đầy — cỏ vào túi');
      }
    }
    if (drop) {
      var n = 1 + Math.floor(Math.random() * drop[1]);
      /* The bag is filled here, the instant the thing breaks - the flying
       * tokens are the picture of it, never the bookkeeping, so a page that
       * closes mid-flight cannot cost the player anything. The "+N" text is
       * raised when a token lands on them, so it appears where they are
       * looking; only the bag-full refusal has to be said immediately. */
      if (!this.sim.give(drop[0], n)) this.toast('Túi đầy!');
      else this.spawnLoot(target.x, target.y, drop[0], n,
                           job.skill === 'mining' ? 'mineral' : 'forage');
    }
    if (this.world.area().depth) this.mine.maybeDropLadder(target.x, target.y, false);
    var lvl = this.sim.addXp(job.skill, job.xp);
    if (lvl) { this.toast('Kỹ năng ' + SKILL_VN[job.skill] + ' lên cấp ' + lvl + '!');
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
  /* Loot that is worth watching.
   *
   * WHY this exists: the item went straight into the bag and a line of text
   * said so, which the owner described as loot that never lands. The bag is
   * still filled the instant the thing breaks, so no rule changed and nothing
   * can be lost in flight; what follows is the picture of it. The token is
   * thrown out on an arc, bounces once, sits for a beat, then homes in on the
   * player faster and faster and pops when it arrives. The "+2 Wood" text
   * appears at the END of that flight, where the player is looking, instead of
   * at the start where they are not. */
  /* Skill names in the player's language, and a colour each so a gain is
   * recognisable before the word is read. */
  var SKILL_VN = { farming: 'Nông nghiệp', mining: 'Khai thác',
                   foraging: 'Hái lượm', fishing: 'Câu cá', combat: 'Chiến đấu' };
  var SKILL_COL = { farming: '#8ede76', mining: '#9fb6ff', foraging: '#ffd36b',
                    fishing: '#7fd9ff', combat: '#ff8b7a' };

  /* Every point of experience is shown, wherever it came from.
   *
   * WHY it wraps the counter instead of sitting in useTool: experience is
   * awarded from a dozen places - breaking rocks, harvesting, landing a fish,
   * shipping, killing - and the owner's note was that none of them showed
   * anything. Wrapping the one function they all call is the only version of
   * this that cannot be forgotten by the next thing that grants experience. */
  Game.prototype.watchXp = function () {
    var self = this;
    var base = this.sim.addXp.bind(this.sim);
    this.sim.addXp = function (skill, n) {
      var lvl = base(skill, n);
      if (n > 0 && SKILL_VN[skill]) {
        var p = self.player;
        // stagger, so three grants in one swing do not print on top of each other
        var lift = 0.9 + (self.xpStack = ((self.xpStack || 0) + 1) % 3) * 0.42;
        self.fx.float(p.x, p.y - lift, '+' + n + ' ' + SKILL_VN[skill],
                      SKILL_COL[skill]);
      }
      return lvl;
    };
  };

  Game.prototype.spawnLoot = function (x, y, item, n, cat) {
    if (!this.loot) this.loot = [];
    var col = '#e8c357';
    try {
      col = global.SDV_SPRITES.iconColors(item, cat || 'crop').main;
    } catch (e) { /* an unknown item still gets a token, just a default gold */ }
    var many = Math.min(n, 4);                 // four tokens is already a shower
    for (var i = 0; i < many; i++) {
      var ang = (Math.PI * 2 * i) / many + Math.random() * 0.7;
      this.loot.push({
        x: x + 0.5, y: y + 0.5, z: 0.35,
        vx: Math.cos(ang) * 1.5, vy: Math.sin(ang) * 1.1, vz: 3.4,
        c: col, item: item, n: (i === many - 1 ? n : 0),
        wait: 0.22 + i * 0.05, phase: 'toss', spin: Math.random() * 6.3
      });
    }
  };

  Game.prototype.stepLoot = function (dt) {
    if (!this.loot || !this.loot.length) return;
    var p = this.player;
    for (var i = this.loot.length - 1; i >= 0; i--) {
      var L = this.loot[i];
      L.spin += dt * 5;
      if (L.phase === 'toss') {
        L.x += L.vx * dt; L.y += L.vy * dt;
        L.vx *= 0.90; L.vy *= 0.90;
        L.z += L.vz * dt; L.vz -= 16 * dt;
        if (L.z <= 0) {
          L.z = 0;
          /* Exactly ONE bounce, counted - not "bounce while still fast enough".
           * The speed test alone never settles: gravity and the damping can sit
           * either side of the threshold forever, so the token hovers a pixel
           * off the ground and never flies home. Counting is the only version
           * of this that is guaranteed to end. */
          if (!L.bounced && L.vz < -1.6) { L.bounced = 1; L.vz = -L.vz * 0.34; }
          else { L.vz = 0; L.phase = 'rest'; }
        }
      } else if (L.phase === 'rest') {
        L.wait -= dt;
        if (L.wait <= 0) { L.phase = 'fly'; L.sp = 3; }
      } else {
        // homing, and getting quicker - that acceleration is the whole feel
        var dx = p.x - L.x, dy = p.y - L.y - 0.25;
        var d = Math.hypot(dx, dy) || 1;
        L.sp = Math.min(L.sp + dt * 26, 17);
        L.x += (dx / d) * L.sp * dt;
        L.y += (dy / d) * L.sp * dt;
        L.z += (0.45 - L.z) * Math.min(1, dt * 9);
        if (d < 0.42) {
          this.loot.splice(i, 1);
          this.sfx('pickup');
          for (var s = 0; s < 4; s++) {
            this.particles.push({
              x: p.x, y: p.y - 0.25,
              vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 2 - 0.4,
              t: 0.28, c: L.c
            });
          }
          if (L.n > 0) this.fx.float(p.x, p.y - 0.9, '+' + L.n + ' ' + L.item, L.c);
        }
      }
    }
  };

  Game.prototype.drawLoot = function (camX, camY, ts) {
    if (!this.loot || !this.loot.length) return;
    var ctx = this.ctx;
    for (var i = 0; i < this.loot.length; i++) {
      var L = this.loot[i];
      var sx = L.x * ts - camX, sy = L.y * ts - camY;
      var r = ts * 0.17;
      // the shadow is what sells the height - it shrinks as the token rises
      var sh = Math.max(0.15, 1 - L.z * 0.8);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * sh, r * sh * 0.45, 0, 0, 6.3);
      ctx.fill();
      var yy = sy - L.z * ts;
      ctx.save();
      ctx.translate(sx, yy);
      ctx.rotate(Math.sin(L.spin) * 0.35);
      var g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, L.c);
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(28,24,32,0.6)';
      ctx.lineWidth = Math.max(1, ts * 0.035);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.92, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.92, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
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
    this.autoAct();
    this.stepLoot(dt);

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
    /* The farmer does NOT sit in the middle of the screen.
     *
     * WHY: the joystick lives at the bottom-left and the thumb rests on it, so
     * a character centred vertically is as far from that thumb as the layout
     * allows - the owner's note was "cho nhân vật gần lại joystick hơn để dễ
     * điều khiển". Dropping the camera puts them at roughly two thirds down,
     * which also gives more of the screen to what is AHEAD of them, which is
     * the direction anyone walking actually wants to see. */
    var CAM_DROP = 0.16;                       // share of the screen height
    var camX = p.x * ts - vw / 2;
    var camY = p.y * ts - vh * (0.5 - CAM_DROP);
    camX = Math.max(0, Math.min(camX, a.w * ts - vw));
    camY = Math.max(0, Math.min(camY, a.h * ts - vh));
    if (a.w * ts < vw) camX = (a.w * ts - vw) / 2;
    if (a.h * ts < vh) camY = (a.h * ts - vh) / 2;
    this.camDrop = CAM_DROP;
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
        /* A building is no longer painted one tile at a time. Its tiles are
         * skipped here and the whole structure is drawn below, at building
         * scale - painting a shingle pattern per 16-pixel tile is what made it
         * read as pixel art whatever colours it used. */
        if (!part) T.paintBlocked(ctx, bcls, name, sx, sy, ts, x, y, a, indoor);
      }
    }
    /* Whole buildings, drawn as buildings. See js/art.js for why this stopped
     * being a per-tile pattern. */
    var ART = global.SDV_ART;
    if (a.buildings && ART) {
      for (var bi = 0; bi < a.buildings.length; bi++) {
        var bd = a.buildings[bi];
        if (bd.x > x1 + 6 || bd.y > y1 + 6
            || bd.x + bd.w < x0 - 6 || bd.y + bd.h < y0 - 6) continue;
        var bsx = Math.round(bd.x * ts - camX);
        var bsy = Math.round(bd.y * ts - camY);
        ART.building(ctx, bd, bsx, bsy, ts, night);
        if (!bd.door) continue;
        var dsx = Math.round(bd.door.x * ts - camX);
        /* The maps put the door ACTION on the doorstep - the walkable tile in
         * front of the house, not on the wall. Draw it on the wall when the
         * tile above the doorstep belongs to this building. */
        var wallY = bd.door.y;
        var above = (bd.door.y - 1) * a.w + bd.door.x;
        if (a.bpart && a.bpart[above]) wallY = bd.door.y - 1;
        var dsy = Math.round(wallY * ts - camY);
        var isOpen = this.doorIsOpen(a, bd.door.x, bd.door.y);
        ART.door(ctx, bd, dsx, dsy, ts, isOpen, night);
        if (bd.sign) ART.sign(ctx, bd.sign, dsx + ts / 2, dsy, ts, isOpen);
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
    this.drawLoot(camX, camY, ts);
    this.fx.draw(ctx, camX, camY, ts);
    /* WHY the light pass sits here, before the highlight and the weather: it
     * is what everything in the WORLD is lit by, and the cursor outline and
     * the rain are read on top of the lit frame, not dimmed with it. The flat
     * blue rectangle that used to be drawn over the whole screen at dusk is
     * gone - it darkened the interface along with the field and made lamps
     * impossible. */
    if (global.SDV_LIGHT) global.SDV_LIGHT.apply(this, ctx, vw, vh, this.cam);
    this.drawRoute(camX, camY, ts);
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

  /* Is it dark enough for a screen or a window to read as lit? */
  /* The dark pool where a thing meets the ground.
   *
   * WHY it earns its place: measured, a midday farm frame lived entirely
   * between 0.165 and 0.322 lightness - no true darks anywhere, which is what
   * makes a picture look flat and printed rather than lit. Contact shadows are
   * the cheapest real darks there are, and they are also what stops an object
   * from appearing to hover over the tile it is standing on. */
  function contact(ctx, x, y, rx, ry) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rx, 0, 6.3);
    ctx.fill();
    ctx.restore();
  }

  function night2(g) {
    var L = global.SDV_LIGHT;
    return L ? L.darkness(g) > 0.4 : false;
  }

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
        var mjobs0 = (mst && mst.jobs) || [];
        /* A machine that has not been built yet is a PLOT, and has to look
         * like one. Every machine in the house stands there from the first
         * morning so the player can see what the farm can become; drawn
         * identically to a built one, that turns into a room full of machines
         * that mysteriously refuse to work. Dimmed, with a hammer over it, the
         * difference is readable at a glance and the tap that opens the
         * requirement list is the obvious next move. */
        /* The same test js/machineui.js uses, deliberately copied rather than
         * approximated: the furnace is there from the first morning unless the
         * save says otherwise, every other machine only once it is built. Two
         * slightly different answers to "is this built" would show as a machine
         * that looks ready and refuses, or a plot that looks ready and is. */
        var mname = o.machine || 'Furnace';
        var built = mname === 'Furnace' ? (!mst || mst.built !== false)
                                        : !!(mst && mst.built);
        ctx.save();
        if (!built) ctx.globalAlpha = 0.42;
        global.SDV_ART.prop(ctx, 'machine', sx, sy, ts, {
          colour: S.iconColors(o.machine || 'Furnace', 'crafted').main,
          busy: built && mjobs0.some(function (j) { return j && !j.ready; }),
          ready: built && mjobs0.some(function (j) { return j && j.ready; })
        });
        ctx.restore();
        if (!built) {
          ctx.font = Math.round(ts * 0.52) + 'px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('🔨', sx + ts / 2, sy + ts * 0.66);
          ctx.textAlign = 'left';
        }
        var jobs = mjobs0;
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
      case 'mailbox': case 'counter': case 'chest': case 'bed': case 'tv':
      case 'bin': case 'sign': {
        global.SDV_ART.prop(ctx, o.kind, sx, sy, ts, { night: night2(this) });
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
        contact(ctx, sx + ts * 0.5, sy + ts * 0.96, ts * 0.46, ts * 0.16);
        global.SDV_ART.tree(ctx, sx + ts * 0.5, sy + ts, ts, o.x * 7 + o.y, {
          leaf: o.kind === 'fruitTree' ? '#4a8a44' : '#3f7f38',
          fruit: o.fruit || 0
        });
        break;
      }
      case 'rock': case 'oreRock': {
        contact(ctx, sx + ts * 0.5, sy + ts * 0.94, ts * 0.34, ts * 0.12);
        var oc = o.ore ? S.iconColors(o.ore, 'mineral').main
                       : (o.kind === 'oreRock' ? '#d8813c' : null);
        global.SDV_ART.rock(ctx, sx + ts * 0.5, sy + ts * 0.95, ts, oc);
        break;
      }
      case 'stump': {
        global.SDV_ART.rock(ctx, sx + ts * 0.5, sy + ts * 0.95, ts * 0.8, null);
        break;
      }
      case 'grassTuft': case 'weed': case 'stick': case 'sapling': {
        global.SDV_ART.plant(ctx, o.kind, sx, sy, ts, o.x * 31 + o.y * 17);
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
    var ART = global.SDV_ART;
    var px = ts / 12;
    var sx = Math.round(act.x * ts - camX - ts * 0.5);
    var sy = Math.round(act.y * ts - camY - ts * 1.05);
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
    /* Drawn from circles and capsules now, not blitted from a pixel grid -
     * "nhân vật kiểu tròn tròn". The palette is still the four colours read
     * out of that character's own sprite in the game files, so everybody stays
     * recognisable. */
    var pal = (act.real && act.real.pal) || act.pal || {};
    var drew = ART.person(ctx, Math.round(act.x * ts - camX),
                          Math.round(act.y * ts - camY + ts * 0.34),
                          ts, pal, act.face, act.frame % 2);
    sy = drew.headY;
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

    /* The tile in front of the farmer, always drawn.
     *
     * WHY always: the highlight only ever appeared when something happened to
     * be standing there, so on open ground the player had no idea which tile
     * the hoe was about to turn over and had to guess from the sprite. The
     * original solves this with a cursor square under the mouse; on a phone
     * there is no cursor, so the facing tile IS the cursor. It sits above the
     * light pass with the rest of the interface, so it stays readable at
     * midnight in the mine - a cursor that goes dark exactly when aiming is
     * hardest would be worse than none. */
    var ft = this.facingTile();
    if (!this.paused) {
      var fsx = Math.round(ft.x * ts - camX), fsy = Math.round(ft.y * ts - camY);
      var hit = this.hover && this.hover.x === ft.x && this.hover.y === ft.y;
      ctx.save();
      ctx.lineWidth = Math.max(1.5, ts * 0.06);
      ctx.strokeStyle = hit ? 'rgba(255,236,150,0.85)' : 'rgba(255,255,255,0.34)';
      ctx.fillStyle = hit ? 'rgba(255,236,150,0.13)' : 'rgba(255,255,255,0.07)';
      var r = ts * 0.22, i = ts * 0.10;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(fsx + i, fsy + i, ts - i * 2, ts - i * 2, r);
      else ctx.rect(fsx + i, fsy + i, ts - i * 2, ts - i * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

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
