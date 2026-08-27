/*
 * game.js - the engine: world state, the player, the camera, the renderer,
 * input, and the one contextual action that drives the whole game.
 *
 * ---------------------------------------------------------------- controls
 * ONE BUTTON. There is no tool belt and no tool selection. What is in front of
 * you decides what the button does: bare soil gets tilled, tilled soil gets
 * planted, a planted tile gets watered, a ripe crop gets picked, a tree gets
 * chopped, a villager gets talked to. The tile you are facing is outlined and
 * the button carries the verb, so the answer to "what will this do" is always
 * on screen before you press it.
 *
 * That is a real departure from the game this is modelled on, and it is the
 * single largest thing that makes it playable one-handed on a phone.
 *
 * ---------------------------------------------------------------- rendering
 * The world is one 160x126 field and the renderer only ever touches the window
 * on screen - about 18x14 tiles at phone zoom. Per frame that is:
 *   - a flat sea fill plus three animated wave strips
 *   - one nine-slice per visible island (at most four)
 *   - a tile pass for the overlays that are not the island's base colour
 *   - one depth-sorted pass over visible objects, NPCs and the player
 * Everything comes out of a single atlas page, so the whole frame is one
 * texture and `drawImage` never switches source.
 */
(function (global) {
  'use strict';

  var A = global.ISL_ATLAS;
  var W = global.SDV_WORLD;
  var ISL = global.ISL_ISLANDS;
  var SIM = global.SDV_SIM;
  var PK = global.ISL_POKE;
  var BT = global.ISL_BATTLE;
  var IA = global.ISL_ITEMART;
  var AU = global.SDV_AUDIO;

  /* Every sound in the game is synthesised by audio.js - there are no audio
   * files to ship. `sfx` is a one-liner so a call site can stay readable and a
   * missing engine is never a crash. */
  function sfx(name) { if (AU) AU.play(name); }

  var TS = 16;                     // world tile size in pixels before zoom
  var TILE_ON_SCREEN = 17;         // how many tiles wide the camera shows

  // ------------------------------------------------------------------ world
  function World() {
    this.areas = W.buildAll();
    this.current = 'sea';
    this.npcs = [];
  }
  World.prototype.area = function () { return this.areas[this.current]; };
  World.prototype.forEachArea = function (fn) {
    for (var k in this.areas) {
      var a = this.areas[k];
      if (!a || !a.objs || !a.tiles) continue;
      fn(a, k);
    }
  };
  World.prototype.serialize = function () {
    var out = { current: this.current, areas: {} };
    this.forEachArea(function (a, k) {
      /* The mine is generated per visit and holds nothing of the player's; it
       * is 950 tiles of noise that would be written to disk every save for no
       * reason. Only the sea persists. */
      if (k !== 'sea') return;
      out.areas[k] = { tiles: Array.prototype.slice.call(a.tiles), objs: a.objs };
    });
    return out;
  };

  /* Only some of the world belongs to the PLAYER. Crops, chests, sprinklers,
   * dropped goods, machines and the soil they tilled are theirs and must come
   * back exactly. Shop counters, beds, signs, the bundle board - those belong
   * to the BUILD, and a save written last week pinned them to last week's
   * layout. So: keep what the world just generated, add back only what the
   * player put there, and take from the saved tiles only the kinds a player
   * can make.
   *
   * Trees and rocks are the interesting case and they are deliberately NOT
   * fixtures: the generator places them, but the player CHOPS them, and
   * rebuilding them would regrow every tree they ever felled on every load. */
  var PLAYER_TILES = { tilled: 1, watered: 1 };

  World.prototype.deserialize = function (s) {
    if (!s) return;
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
      var fresh = a.objs.filter(function (o) { return W.FIXTURE[o.kind]; });
      var taken = {};
      fresh.forEach(function (o) {
        var ow = o.w || 1, oh = o.h || 1;
        for (var dy = 0; dy < oh; dy++)
          for (var dx = 0; dx < ow; dx++) taken[(o.x + dx) + ',' + (o.y + dy)] = 1;
      });
      /* `o.placed` is the whole distinction. A chest is in FIXTURE because the
       * generator puts one in the farmhouse - but the player can also PUT ONE
       * DOWN, and filtering by kind alone deleted every chest they ever placed
       * on the first reload. What the player made is theirs whatever it is
       * made of; what the build made is regenerated. */
      var mine = d.objs.filter(function (o) {
        if (W.FIXTURE[o.kind] && !o.placed) return false;
        var ow = o.w || 1, oh = o.h || 1;
        for (var dy = 0; dy < oh; dy++)
          for (var dx = 0; dx < ow; dx++) {
            if (taken[(o.x + dx) + ',' + (o.y + dy)]) return false;
          }
        return true;
      });
      a.objs = fresh.concat(mine);
      a.reindex();
      a.objs.forEach(function (o) {
        if (!W.SOLID_OBJ[o.kind]) return;
        var ow = o.w || 1, oh = o.h || 1;
        for (var dy = 0; dy < oh; dy++)
          for (var dx = 0; dx < ow; dx++) a.block(o.x + dx, o.y + dy, true);
      });
    }
  };

  World.prototype.objAt = function (x, y, area) { return (area || this.area()).objAt(x, y); };
  World.prototype.removeObj = function (o, area) { (area || this.area()).remove(o); };
  World.prototype.solidAt = function (x, y) { return this.area().solid(x, y); };

  // ----------------------------------------------------------------- player
  function Player() {
    this.x = 0; this.y = 0;
    this.dir = 'down';
    this.moving = false;
    this.anim = 0;
    this.speed = 4.2;              // tiles per second
  }

  // ------------------------------------------------------------------- game
  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.sim = new SIM.Sim(global.SDV_DATA);
    this.world = new World();
    this.world.game = this;
    this.player = new Player();
    this.cam = { x: 0, y: 0, zoom: 2 };
    this.time = 0;
    this.paused = false;
    this.stick = { dx: 0, dy: 0, on: false };
    this.toasts = [];
    this.focus = null;             // the tile the hand button will act on
    this.lastGrassTile = null;
    this.battle = null;
    this.modal = 0;                // how many blocking panels are open
    this.fx = global.SDV_FX ? new global.SDV_FX.FX() : null;
    this.farm = global.SDV_FARMLIFE ? new global.SDV_FARMLIFE.FarmLife(this) : null;
    this.events = global.SDV_EVENTS ? new global.SDV_EVENTS.Events(this) : null;
    this.mine = null;
    this.data = global.SDV_DATA;
  }

  Game.prototype.area = function () { return this.world.area(); };
  Game.prototype.busy = function () {
    return this.paused || this.modal > 0 || !!this.battle;
  };
  Game.prototype.pause = function (on) { this.paused = !!on; };

  // ------------------------------------------------------------------ start
  Game.prototype.start = function (fresh) {
    var self = this;
    if (this.sim.tid == null) {
      this.sim.tid = PK.randInt(65536);
      this.sim.sid = PK.randInt(65536);
    }
    PK.setIds(this.sim.tid, this.sim.sid);
    W.applyOwnership(this.area(), this.sim.owned);

    if (fresh) {
      var home = this.islandRec('home');
      this.player.x = home.x + 12.5;
      this.player.y = home.y + 12.5;
      this.sim.give('Parsnip Seeds', 15);
      this.sim.give('Poké Ball', 0);
      this.sim.give('Bread', 3);
    }
    if (global.ISL_NPC) global.ISL_NPC.build(this);
    if (global.ISL_TUTORIAL) {
      global.ISL_TUTORIAL.init(this);
      if (fresh) global.ISL_TUTORIAL.fire('start');
    }
    this.recenter(true);
    /* Browsers refuse to start audio until the player has touched something,
     * so the engine arms itself on the first gesture rather than at boot. */
    if (AU) AU.armGesture(this);
    this.loop = function (t) { self.frame(t); requestAnimationFrame(self.loop); };
    requestAnimationFrame(this.loop);
  };

  Game.prototype.islandRec = function (id) {
    var list = this.area().islands || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  Game.prototype.currentIsland = function () {
    if (this.world.current !== 'sea') return null;
    return this.area().islandAt(Math.round(this.player.x), Math.round(this.player.y));
  };

  // ------------------------------------------------------------------- loop
  Game.prototype.frame = function (t) {
    var dt = Math.min(0.05, (t - (this._last || t)) / 1000);
    this._last = t;
    this.time = t;
    if (!this.busy()) {
      this.step(dt);
      this.tickClock(dt);
    }
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.tick(t);
    if (AU) { AU.tick(dt); AU.follow(this); }
    this.render();
    if (global.ISL_UI) global.ISL_UI.tick(this, dt);
  };

  Game.prototype.step = function (dt) {
    var p = this.player, a = this.area();
    var dx = this.stick.dx, dy = this.stick.dy;
    var mag = Math.sqrt(dx * dx + dy * dy);
    p.moving = mag > 0.12;
    if (p.moving) {
      dx /= mag; dy /= mag;
      var spd = p.speed * (this.sim.sluggish ? 0.6 : 1) * dt;
      this.tryMove(dx * spd, dy * spd);
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                          : (dy > 0 ? 'down' : 'up');
      p.anim += dt * 8;
    } else {
      p.anim += dt * 2.5;
    }
    this.recenter(false);
    this.focus = this.findFocus();
    this.checkGrass();
    if (global.ISL_NPC) global.ISL_NPC.step(this, dt);
    if (global.ISL_MINE) global.ISL_MINE.step(this, dt);
    if (this.fx) this.fx.update(dt);
    for (var i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
  };

  /* Axis-separated movement so sliding along a wall works, plus a small body
   * radius so the player is not a point. Trying both axes at once meant a
   * diagonal into a corner stopped dead, which reads as the controls sticking. */
  var BODY = 0.30;
  Game.prototype.tryMove = function (dx, dy) {
    var p = this.player;
    if (dx) { if (this.canStand(p.x + dx, p.y)) p.x += dx; }
    if (dy) { if (this.canStand(p.x, p.y + dy)) p.y += dy; }
  };
  Game.prototype.canStand = function (x, y) {
    var a = this.area();
    var pts = [[x - BODY, y - BODY], [x + BODY, y - BODY],
               [x - BODY, y + BODY], [x + BODY, y + BODY]];
    for (var i = 0; i < 4; i++) {
      if (a.solid(Math.floor(pts[i][0]), Math.floor(pts[i][1]))) return false;
    }
    return true;
  };

  Game.prototype.recenter = function (snap) {
    var c = this.canvas;
    this.cam.zoom = Math.max(1, c.width / (TILE_ON_SCREEN * TS));
    var vw = c.width / this.cam.zoom, vh = c.height / this.cam.zoom;
    var tx = this.player.x * TS - vw / 2;
    var ty = this.player.y * TS - vh / 2;
    var a = this.area();
    tx = Math.max(0, Math.min(a.w * TS - vw, tx));
    ty = Math.max(0, Math.min(a.h * TS - vh, ty));
    if (snap) { this.cam.x = tx; this.cam.y = ty; }
    else { this.cam.x += (tx - this.cam.x) * 0.18; this.cam.y += (ty - this.cam.y) * 0.18; }
  };

  /* Ten in-game minutes every SEC_PER_STEP real seconds, and the day ends by
   * itself at 2am with the player face down wherever they are. */
  Game.prototype.tickClock = function (dt) {
    this._acc = (this._acc || 0) + dt;
    while (this._acc >= SIM.SEC_PER_STEP) {
      this._acc -= SIM.SEC_PER_STEP;
      this.sim.tick();
      if (this.sim.time === 24 * 60 && global.ISL_TUTORIAL) {
        global.ISL_TUTORIAL.fire('nightLate');
      }
      if (this.sim.time >= SIM.DAY_END) { this.collapse(); return; }
      if (global.ISL_NPC) global.ISL_NPC.reschedule(this);
    }
  };

  // ---------------------------------------------------------------- toasts
  Game.prototype.toast = function (text) {
    this.toasts.push({ text: text, life: 3.4 });
    if (this.toasts.length > 4) this.toasts.shift();
  };

  // ------------------------------------------------------- contextual action
  /* The tile in front, plus what the button would do to it. Called once a
   * frame and read by the HUD, so it must stay cheap - it is one objAt and a
   * handful of comparisons. */
  var FACE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  Game.prototype.findFocus = function () {
    var p = this.player, f = FACE[p.dir];
    /* 0.85 of a tile ahead, not 1.0: standing dead centre and facing a wall
     * should still target the wall, and a full tile of reach put the probe
     * past a tile the player was actually touching. */
    /* Step a whole tile from the CENTRE of the tile you are standing on, not
     * 0.85 from your exact position. `floor(p.x + 0.85)` returns your own tile
     * whenever your position within it is under 0.15 - so for about 15% of
     * every tile the button silently acted on the ground under your feet, and
     * the outline agreed with it, which read as reach failing at random. */
    var fx = Math.floor(p.x) + f[0];
    var fy = Math.floor(p.y) + f[1];
    var a = this.area();
    if (fx < 0 || fy < 0 || fx >= a.w || fy >= a.h) return null;

    var npc = global.ISL_NPC ? global.ISL_NPC.at(this, fx, fy) : null;
    if (npc) return { x: fx, y: fy, verb: 'Nói chuyện', icon: '💬', kind: 'npc', npc: npc };

    var o = a.objAt(fx, fy);
    if (o) {
      var v = objectVerb(this, o);
      if (v) { v.x = fx; v.y = fy; v.obj = o; return v; }
      /* An object with no verb ENDS the probe. Falling through to the tile
       * checks made the button read "Cuốc đất" while standing in front of a
       * crab pot; till() then refused on its own objAt check, silently, with
       * no message and no energy spent. Better to offer nothing than to offer
       * something that does nothing. */
      return { x: fx, y: fy, verb: '', icon: '', kind: 'none' };
    }
    var t = a.name_of(fx, fy);
    if (t === 'dirt') return { x: fx, y: fy, verb: 'Cuốc đất', icon: '⛏', kind: 'till' };
    if (t === 'tilled') return { x: fx, y: fy, verb: 'Gieo hạt', icon: '🌱', kind: 'plant' };
    if (t === 'watered') return { x: fx, y: fy, verb: 'Đã tưới', icon: '💧', kind: 'none' };
    if (TILE_WATER(a, fx, fy)) return { x: fx, y: fy, verb: 'Câu cá', icon: '🎣', kind: 'fish' };
    return null;
  };

  function TILE_WATER(a, x, y) {
    var d = a.def(x, y);
    return !!(d && d.water);
  }

  function objectVerb(game, o) {
    switch (o.kind) {
      case 'crop':
        if (o.dead) return { verb: 'Nhổ bỏ', icon: '🥀', kind: 'clearCrop' };
        if (o.stage >= o.maxStage && !o.harvested) {
          return { verb: 'Thu hoạch', icon: '🌾', kind: 'harvest' };
        }
        if (!o.watered) return { verb: 'Tưới', icon: '💧', kind: 'water' };
        return { verb: 'Xem cây', icon: '🌱', kind: 'inspectCrop' };
      case 'tree': case 'bigTree': case 'stump':
        return { verb: 'Chặt', icon: '🪓', kind: 'chop' };
      case 'rock': case 'bigRock': case 'oreRock':
        return { verb: 'Đập', icon: '⛏', kind: 'smash' };
      case 'weed':
        return { verb: 'Nhổ cỏ', icon: '🌿', kind: 'weed' };
      case 'drop': case 'forage':
        return { verb: 'Nhặt', icon: '✋', kind: 'pick' };
      case 'shell': case 'driftwood':
        return { verb: 'Nhặt', icon: '✋', kind: 'pick' };
      case 'bed':      return { verb: 'Ngủ', icon: '🛏', kind: 'sleep' };
      case 'chest':    return { verb: 'Rương', icon: '📦', kind: 'chest' };
      case 'bin':      return { verb: 'Giao hàng', icon: '📮', kind: 'bin' };
      case 'kitchen':  return { verb: 'Nấu ăn', icon: '🍳', kind: 'cook' };
      case 'shop':     return { verb: o.label || 'Cửa hàng', icon: '🛒', kind: 'shop' };
      case 'mailbox':  return { verb: 'Hộp thư', icon: '✉', kind: 'mail' };
      case 'calendarBoard': return { verb: 'Lịch', icon: '📅', kind: 'calendar' };
      case 'orderBoard':    return { verb: 'Đơn hàng', icon: '📋', kind: 'orders' };
      case 'bundleBoard':   return { verb: 'Gói hàng', icon: '🎁', kind: 'bundles' };
      case 'machine':  return { verb: o.machine || 'Máy', icon: '⚙', kind: 'machine' };
      case 'sprinkler': return { verb: 'Vòi tưới', icon: '💦', kind: 'inspect' };
      case 'healStone': return { verb: 'Hồi sức', icon: '❤', kind: 'heal' };
      case 'pcBox':    return { verb: 'Tủ gửi', icon: '💻', kind: 'box' };
      case 'mineEntrance': return { verb: 'Xuống hầm', icon: '🕳', kind: 'mine' };
      case 'toolUpgrade':  return { verb: 'Nâng cấp', icon: '🔨', kind: 'toolUpgrade' };
      case 'museumDesk':   return { verb: 'Bảo tàng', icon: '🏺', kind: 'museum' };
      case 'ivJudge':      return { verb: 'Soi cá thể', icon: '🔬', kind: 'ivJudge' };
      case 'evTrainer':    return { verb: 'Luyện nỗ lực', icon: '🏋', kind: 'evTrainer' };
      case 'natureMint':   return { verb: 'Đổi tính cách', icon: '🌿', kind: 'mint' };
      case 'daycare':      return { verb: 'Nhà gửi', icon: '🏠', kind: 'daycare' };
      /* WHY these are here now: every one of them is a prop the player can
       * walk up to, and every one of them returned null - the button went
       * blank and the object was scenery. `workshop` was the expensive case:
       * ui.js had a `case 'workshop'` handler and places.js had the whole
       * crafting bench behind it, and nothing in the game could ever produce
       * that focus kind, so Đảo Xưởng cost 12,000v and did nothing. */
      case 'workshop':     return { verb: 'Bàn chế đồ', icon: '🔧', kind: 'workshop' };
      case 'geodeCrusher': return { verb: 'Đập đá quý', icon: '💎', kind: 'geode' };
      case 'fossilDig':    return { verb: 'Hố khai quật', icon: '🦴', kind: 'fossil' };
      case 'tapper':       return { verb: 'Ống nhựa cây', icon: '🍁', kind: 'tapper' };
      case 'trough':       return { verb: 'Máng ăn', icon: '🌾', kind: 'trough' };
      case 'baitTable':    return { verb: 'Bàn làm mồi', icon: '🪱', kind: 'bait' };
      case 'crabPotRack':  return { verb: 'Giá lồng cua', icon: '🦀', kind: 'crabRack' };
      case 'blackboard':   return { verb: 'Bảng tin', icon: '📋', kind: 'orders' };
      case 'dexResearch':  return { verb: 'Pokédex', icon: '📕', kind: 'dex' };
      case 'sign':         return { verb: 'Đọc', icon: '📖', kind: 'sign' };
      case 'foe':          return { verb: o.name || 'Đánh', icon: '⚔', kind: 'fight' };
      case 'ladder':       return { verb: 'Xuống tầng', icon: '⬇', kind: 'descend' };
      case 'mineElevator': return { verb: 'Thang máy', icon: '🛗', kind: 'elevator' };
      case 'mineExit':     return { verb: 'Lên mặt đất', icon: '⬆', kind: 'mineUp' };
      case 'coop': case 'barn': return { verb: 'Chuồng', icon: '🐄', kind: 'animalHouse' };
      case 'silo':     return { verb: 'Silo', icon: '🌾', kind: 'silo' };
      case 'shrine': case 'skyAltar': case 'dragonNest':
        return { verb: 'Khấn', icon: '✨', kind: 'shrine' };
      default: return null;
    }
  }

  // --------------------------------------------------------------- the hand
  Game.prototype.useHand = function () {
    var f = this.focus;
    if (!f || this.busy()) return;
    var UI = global.ISL_UI;
    switch (f.kind) {
      case 'till':      return this.till(f.x, f.y);
      case 'plant':     return UI && UI.openSeedPicker(this, f.x, f.y);
      case 'water':     return this.waterTile(f.x, f.y);
      case 'harvest':   return this.harvestCrop(f.obj);
      case 'clearCrop': return this.clearCrop(f.obj);
      case 'chop':      return this.breakObject(f.obj);
      case 'smash':     return this.breakObject(f.obj);
      case 'weed':      return this.breakObject(f.obj);
      case 'pick':      return this.pickUp(f.obj);
      case 'sleep':     return UI && UI.confirmSleep(this);
      case 'fish':      return UI && UI.openFishing(this, f.x, f.y);
      case 'npc':       return UI && UI.openNpc(this, f.npc);
      case 'heal':      return this.healParty();
      case 'sign':      return this.toast(f.obj.text || '...');
      case 'inspectCrop': return this.toast(cropStatus(f.obj));
      case 'fight':     return this.fight(f.obj);
      case 'descend':   return global.ISL_MINE.descend(this);
      case 'elevator':  return global.ISL_MINE.openElevator(this);
      case 'mineUp':    return global.ISL_MINE.leave(this);
      case 'none':      return;
      default:
        if (UI && UI.openFor) UI.openFor(this, f);
    }
  };

  function cropStatus(o) {
    if (o.stage >= o.maxStage) return o.name + ' — đã chín!';
    var left = 0;
    for (var i = o.stage; i < (o.stageDays || []).length; i++) left += o.stageDays[i];
    left = Math.max(1, left - (o.days || 0) + (o.stageDays || []).slice(0, o.stage)
      .reduce(function (a, b) { return a + b; }, 0));
    return o.name + ' — còn khoảng ' + left + ' ngày' +
           (o.watered ? ' (đã tưới)' : ' (chưa tưới)');
  }

  // ------------------------------------------------------------------ verbs
  Game.prototype.spend = function (n) {
    if (this.sim.energy <= 0) {
      this.toast('Bạn kiệt sức rồi — về ngủ đi.');
      return false;
    }
    this.sim.energy = Math.max(0, this.sim.energy - n);
    if (this.sim.energy === 0) {
      this.sim.sluggish = true;
      /* `exhausted` is what costs half of tonight's rest. Every verb in the
       * game calls THIS spend, not Sim.prototype.spend, and this one only set
       * sluggish - so working yourself to zero had no consequence at all
       * unless you also stayed up past 2am. The penalty existed and was
       * unreachable. */
      this.sim.exhausted = true;
    }
    if (this.sim.energy > 0 && this.sim.energy < this.sim.maxEnergy * 0.25 &&
        global.ISL_TUTORIAL) {
      global.ISL_TUTORIAL.fire('lowEnergy');
    }
    return true;
  };

  Game.prototype.till = function (x, y, opt) {
    var a = this.area();
    if (a.name_of(x, y) !== 'dirt' || a.objAt(x, y)) return false;
    if (!(opt && opt.free) && !this.spend(2)) return false;
    a.set(x, y, 'tilled');
    if (this.fx) this.fx.hit('hoe', x, y, this.player.dir);
    sfx('hoe');
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('till');
    return true;
  };

  Game.prototype.waterTile = function (x, y, opt) {
    var a = this.area();
    var o = a.objAt(x, y);
    var t = a.name_of(x, y);
    if (t !== 'tilled' && !(o && o.kind === 'crop')) return false;
    if (o && o.kind === 'crop' && o.watered) return false;
    if (!(opt && opt.free) && !this.spend(2)) return false;
    if (t === 'tilled') a.set(x, y, 'watered');
    if (o && o.kind === 'crop') o.watered = true;
    if (this.fx) this.fx.hit('water', x, y, this.player.dir);
    sfx('water');
    return true;
  };

  /* Planting. `season` is stamped onto the crop from the ISLAND, not the
   * calendar - that is what lets the greenhouse ignore the season rollover
   * while a field ten tiles away does not (see sim.endDay). */
  Game.prototype.plantAt = function (x, y, seedName, opt) {
    var a = this.area();
    var t = a.name_of(x, y);
    if (t !== 'tilled' && t !== 'watered') return false;
    if (a.objAt(x, y)) return false;
    var crop = cropForSeed(this.data, seedName);
    if (!crop) { if (!opt || !opt.silent) this.toast('Không trồng được thứ này.'); return false; }
    var isl = a.islandAt(x, y);
    var pinned = isl && isl.isl.season;
    if (!pinned && crop.seasons && crop.seasons.indexOf(this.sim.season()) < 0) {
      if (!opt || !opt.silent) {
        this.toast(crop.name + ' chỉ sống mùa ' + crop.seasons.map(seasonVN).join('/') + '.');
      }
      return false;
    }
    if (this.sim.count(seedName) <= 0) return false;
    this.sim.take(seedName, 1);
    sfx('plant');
    a.obj({
      x: x, y: y, kind: 'crop', crop: crop.id, name: crop.name,
      seasons: crop.seasons, stage: 0, maxStage: crop.stages.length,
      stageDays: crop.stages.slice(), days: 0,
      regrow: crop.regrow || null, regrowLeft: 0, harvested: false,
      watered: t === 'watered', trellis: !!crop.trellis,
      minHarvest: crop.minHarvest || 1, maxHarvest: crop.maxHarvest || 1,
      season: pinned || null, fert: (a.fert && a.fert[x + ',' + y]) || 0
    });
    if (a.fert) delete a.fert[x + ',' + y];
    this.sim.addXp('farming', 2);
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('plant');
    return true;
  };

  function seasonVN(s) {
    return { Spring: 'Xuân', Summer: 'Hạ', Fall: 'Thu', Winter: 'Đông' }[s] || s;
  }
  function cropForSeed(data, seedName) {
    var list = data.crops || [];
    for (var i = 0; i < list.length; i++) if (list[i].seed === seedName) return list[i];
    return null;
  }

  Game.prototype.fertilizeAt = function (x, y, fertName) {
    var a = this.area();
    var t = a.name_of(x, y);
    if (t !== 'tilled' && t !== 'watered') return false;
    var lvl = { 'Basic Fertilizer': 1, 'Quality Fertilizer': 2, 'Deluxe Fertilizer': 3 }[fertName] || 1;
    var o = a.objAt(x, y);
    if (o && o.kind === 'crop') {
      if (o.fert >= lvl) return false;
      o.fert = lvl;
    } else {
      a.fert = a.fert || {};
      if (a.fert[x + ',' + y] >= lvl) return false;
      a.fert[x + ',' + y] = lvl;
    }
    this.sim.take(fertName, 1);
    return true;
  };

  Game.prototype.harvestCrop = function (o, opt) {
    if (!o || o.kind !== 'crop' || o.dead) return false;
    if (o.stage < o.maxStage || o.harvested) return false;
    var n = o.minHarvest;
    if (o.maxHarvest > o.minHarvest) {
      n += Math.floor(Math.random() * (o.maxHarvest - o.minHarvest + 1));
    }
    var q = this.sim.rollQuality(o.fert || 0, 'farming');
    /* canGive(name, QUALITY), asked after the quality roll and before the crop
     * is removed. The old guard was `!hasSpace() && count(name) === 0`, but
     * give() merges only into a stack of the same name AND quality - so a full
     * bag holding a plain parsnip passed the guard, refused the gold-star one,
     * and the crop was cleared off the map anyway. At farming 10 with deluxe
     * fertiliser the roll is non-plain about 95% of the time. */
    if (!this.sim.canGive(o.name, q)) {
      if (!opt || !opt.silent) {
        this.toast('Túi đầy.');
        if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('bagFull');
      }
      return 'full';
    }
    this.sim.give(o.name, n, q);
    this.sim.addXp('farming', 8);
    this.addRank(6);
    if (o.regrow) { o.harvested = true; o.regrowLeft = o.regrow; }
    else this.area().remove(o);
    if (this.fx) this.fx.hit('harvest', o.x, o.y);
    sfx('harvest');
    if (!opt || !opt.silent) this.toast('+' + n + ' ' + o.name + (q ? ' ' + qualityMark(q) : ''));
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('harvest');
    return true;
  };
  function qualityMark(q) { return ['', '⭐', '⭐⭐', '💜'][q] || ''; }

  Game.prototype.clearCrop = function (o) {
    if (!this.spend(1)) return false;
    this.area().remove(o);
    return true;
  };

  /* Chopping, smashing and weeding are the same operation with different
   * numbers, and keeping them one function is what stops the Pokemon labour
   * path and the hand-button path from drifting apart. */
  /* Which fx preset each breakable plays. Wood chips for anything wooden,
   * stone chips for anything mineral - the preset tables live in fx.js. */
  var FX_KIND = { tree: 'chop', bigTree: 'chop', stump: 'chop',
                  rock: 'smash', bigRock: 'smash', oreRock: 'smash',
                  weed: 'weed' };

  var BREAK = {
    tree:    { hp: 3, energy: 4, skill: 'foraging', xp: 6, drop: ['Wood', 4, 8] },
    bigTree: { hp: 6, energy: 5, skill: 'foraging', xp: 14, drop: ['Hardwood', 2, 4] },
    stump:   { hp: 2, energy: 4, skill: 'foraging', xp: 4, drop: ['Wood', 2, 4] },
    rock:    { hp: 2, energy: 4, skill: 'mining', xp: 5, drop: ['Stone', 2, 4] },
    bigRock: { hp: 5, energy: 5, skill: 'mining', xp: 12, drop: ['Stone', 5, 9] },
    oreRock: { hp: 3, energy: 4, skill: 'mining', xp: 10, drop: null },
    weed:    { hp: 1, energy: 1, skill: 'foraging', xp: 1, drop: ['Fiber', 1, 2] }
  };

  Game.prototype.breakObject = function (o, opt) {
    var rule = BREAK[o.kind];
    if (!rule) return false;
    opt = opt || {};
    if (!opt.free && !this.spend(rule.energy)) return false;
    o.hp = (o.hp == null ? rule.hp : o.hp) - (opt.instant ? 99 : (this.sim.toolPower || 1));
    if (this.fx) this.fx.hit(FX_KIND[o.kind] || 'chop', o.x, o.y, this.player.dir);
    sfx(FX_KIND[o.kind] || 'chop');
    if (o.hp > 0) return false;
    if (o.kind === 'tree' || o.kind === 'bigTree') sfx('fell');

    var d = rule.drop;
    if (o.ore) d = [o.ore, 1, 2];
    /* A gem in a plain rock is the reason to break the ones with no ore in
     * them. Dropped as well as the stone, not instead of it. */
    if (o.gem) this.dropItem(o.x, o.y, o.gem, 1);
    if (d) {
      var n = d[1] + Math.floor(Math.random() * (d[2] - d[1] + 1));
      if (this.sim.professions && this.sim.professions.Forester && rule.skill === 'foraging') n++;
      if (this.sim.professions && this.sim.professions.Miner && rule.skill === 'mining') n++;
      this.dropItem(o.x, o.y, d[0], n);
    }
    this.sim.addXp(rule.skill, rule.xp);
    this.addRank(Math.ceil(rule.xp / 2));
    this.area().remove(o);
    return true;
  };

  /* Loose items on the ground. They are objects like anything else, which is
   * what lets a Pokemon's "Gom Đồ" hoover them up with the same code the
   * player's hand uses. */
  Game.prototype.dropItem = function (x, y, name, qty, quality) {
    var a = this.area();
    var spot = a.nearestFree(x, y, 3);
    a.obj({ x: spot.x, y: spot.y, kind: 'drop', item: name, qty: qty || 1,
            quality: quality || 0, born: this.time });
  };

  Game.prototype.pickUp = function (o) {
    var name = o.item || o.forage || 'Wood';
    if (o.kind === 'shell') name = 'Clam';
    if (o.kind === 'driftwood') name = 'Driftwood';
    if (!this.sim.canGive(name, o.quality || 0)) {
      this.toast('Túi đầy.');
      if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('bagFull');
      return false;
    }
    this.sim.give(name, o.qty || 1, o.quality || 0);
    sfx('pickup');
    if (o.kind === 'forage') {
      this.sim.addXp('foraging', 7);
      this.addRank(4);
    }
    this.area().remove(o);
    this.toast('+' + (o.qty || 1) + ' ' + name);
    return true;
  };

  Game.prototype.fight = function (o) {
    if (!global.ISL_MINE) return false;
    if (!this.spend(2)) return false;
    return global.ISL_MINE.strike(this, o);
  };

  // ------------------------------------------------------------------- rank
  /* Every worthwhile action feeds Island Rank, and Rank is what opens land.
   * Routing all of it through one method is what makes "am I making progress"
   * answerable, and it is the only place the new-island check runs. */
  Game.prototype.addRank = function (n) {
    var got = this.sim.addRankXp(n);
    if (got) {
      this.toast('★ Cấp Đảo Trưởng ' + got + '!');
      sfx('coin');
      if (this.fx) this.fx.float(this.player.x, this.player.y - 0.8, '★ Cấp ' + got, '#ffd870');
      if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('rankUp');
      this.checkBuyable();
    }
  };

  Game.prototype.buyableIslands = function () {
    var out = [], a = this.area(), sim = this.sim;
    var list = a.islands || [];
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      if (sim.owned[rec.id] || !rec.isl.unlock) continue;
      var touches = false;
      var nb = ISL.neighbours(rec.isl);
      for (var j = 0; j < nb.length; j++) if (sim.owned[nb[j].id]) touches = true;
      if (!touches) continue;
      out.push({
        rec: rec,
        rankOk: sim.rank >= rec.isl.unlock.rank,
        goldOk: sim.gold >= rec.isl.unlock.gold
      });
    }
    return out;
  };
  Game.prototype.checkBuyable = function () {
    var can = this.buyableIslands().filter(function (b) { return b.rankOk && b.goldOk; });
    if (can.length && global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('canBuy');
    return can.length;
  };

  Game.prototype.buyIsland = function (id) {
    var rec = this.islandRec(id);
    if (!rec || this.sim.owned[id]) return false;
    var u = rec.isl.unlock;
    if (this.sim.rank < u.rank) { this.toast('Cần Cấp Đảo Trưởng ' + u.rank + '.'); return false; }
    if (!this.sim.spendGold(u.gold)) { this.toast('Không đủ vàng.'); return false; }
    this.sim.owned[id] = 1;
    W.applyOwnership(this.area(), this.sim.owned);
    if (global.ISL_NPC) global.ISL_NPC.build(this);
    this.toast('Đã mua ' + rec.isl.name + '!');
    this.addRank(40);

    /* The gift an island carries, handed over on purchase rather than on first
     * footstep - a player who buys Đảo Cỏ Xanh and walks in with no Pikachu
     * and no balls has been given a wall, not an island. */
    if (rec.isl.grant) this.grant(rec.isl.grant, rec);
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('island:' + id);
    return true;
  };

  Game.prototype.grant = function (grant, rec) {
    var self = this;
    if (grant.poke && !this.sim.flags['granted:' + rec.id]) {
      var p = PK.create(grant.poke.id, grant.poke.lv, {});
      p.caught = { day: this.sim.dayIndex(), island: rec.id };
      p.ot = 'Bạn';
      this.addPokemon(p);
      this.toast('Bạn nhận được ' + PK.speciesName(p.id) + '!');
    }
    (grant.items || []).forEach(function (it) {
      self.sim.give(it.name, it.qty);
      self.toast('+' + it.qty + ' ' + it.name);
    });
    this.sim.flags['granted:' + rec.id] = 1;
  };

  // --------------------------------------------------------------- pokemon
  Game.prototype.pokeParty = function () { return this.sim.party; };

  Game.prototype.addPokemon = function (p) {
    this.sim.dexCatch(p.id);
    if (this.sim.party.length < 6) this.sim.party.push(p);
    else {
      this.sim.boxes.push(p);
      this.toast(PK.nameOf(p) + ' được gửi vào tủ.');
    }
    if (this.sim.party.length === 1 && global.ISL_TUTORIAL) {
      global.ISL_TUTORIAL.fire('firstPoke');
    }
    if (p.shiny && global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('shiny');
  };

  Game.prototype.healParty = function () {
    var n = 0;
    this.sim.party.forEach(function (p) {
      if (p.hp < p.stats[0] || p.status) n++;
      PK.heal(p);
    });
    this.toast(n ? 'Cả đội đã hồi phục.' : 'Cả đội đang khoẻ.');
    if (this.fx) this.fx.ring(this.player.x, this.player.y, 'rgba(255,150,180,.9)', 1.2);
    return n;
  };

  /* Encounter check. It fires on ENTERING a new tall-grass tile, never per
   * frame: at 60fps any per-frame probability at all makes grass impassable,
   * and the first version of this was exactly that bug. */
  Game.prototype.checkGrass = function () {
    if (this.battle || this.busy()) return;
    var a = this.area();
    var tx = Math.floor(this.player.x), ty = Math.floor(this.player.y);
    var key = tx + ',' + ty;
    var d = a.def(tx, ty);
    if (!d || !d.grass) { this.lastGrassTile = null; return; }
    if (this.lastGrassTile === key) return;
    this.lastGrassTile = key;
    if (this.fx) this.fx.chips(tx + 0.5, ty + 0.7, ['#5fa855', '#3d7a38', '#8fd07f'], 5, 2);
    if (Math.random() >= BT.ENCOUNTER_RATE) return;
    var rec = a.islandAt(tx, ty);
    if (!rec || !rec.isl.enc) return;
    this.startEncounter(rec);
  };

  Game.prototype.startEncounter = function (rec) {
    var wild = BT.spawnWild(rec.isl, {
      night: this.sim.isNight(), luck: this.sim.luck
    });
    if (!wild) return;
    this.sim.dexSee(wild.id);
    if (wild.shiny && global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('shiny');
    /* No Pokemon ABLE TO FIGHT - which is not the same as no Pokemon. Losing a
     * battle sends you home without healing, so walking straight back into the
     * grass with a wiped-out team used to build a Battle whose `you` was null;
     * the first tap on ĐÁNH threw on `battle.you.moves`. Checking `length`
     * alone missed it entirely. */
    var able = this.sim.party.some(function (p) { return p.hp > 0; });
    if (!able) {
      /* The encounter still happens, it just cannot be fought. Silently
       * skipping it would make the grass look broken on the walk between
       * buying the island and being given the starter. */
      this.toast(PK.speciesName(wild.id) + ' chạy vụt qua bụi cỏ!' +
                 (this.sim.party.length ? ' Cả đội đang gục — về hòn đá hồi sức.' : ''));
      return;
    }
    this.battle = new BT.Battle(this, wild, { island: rec });
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.setSuppressed(true);
    if (global.ISL_POKEUI) global.ISL_POKEUI.openBattle(this, this.battle);
  };

  Game.prototype.endBattle = function () {
    var b = this.battle;
    this.battle = null;
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.setSuppressed(false);
    if (!b) return;
    if (b.result === 'caught') {
      this.addPokemon(b.wild);
      this.addRank(30 + b.wild.lv);
      this.sim.addXp('combat', 6);
    } else if (b.result === 'won') {
      this.addRank(8 + Math.floor(b.wild.lv / 2));
      this.sim.addXp('combat', 4);
    } else if (b.result === 'lost') {
      this.toast('Cả đội gục. Bạn lê về nhà...');
      this.travelTo(this.islandRec('home'));
      if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('pokeFaint');
    }
    var anyFaint = this.sim.party.some(function (p) { return p.hp <= 0; });
    if (anyFaint && global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('pokeFaint');
  };

  // ----------------------------------------------------------------- travel
  Game.prototype.travelTo = function (rec) {
    if (!rec) return false;
    if (!this.sim.owned[rec.id]) { this.toast('Bạn chưa sở hữu đảo này.'); return false; }
    var a = this.area();
    var spot = a.nearestFree(rec.x + Math.floor(rec.w / 2),
                             rec.y + Math.floor(rec.h / 2), 20);
    this.player.x = spot.x + 0.5;
    this.player.y = spot.y + 0.5;
    this.lastGrassTile = null;
    this.recenter(true);
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('island:' + rec.id);
    return true;
  };

  // ------------------------------------------------------------------ sleep
  Game.prototype.sleep = function () {
    /* Waking up ALWAYS puts you back on the archipelago. Collapsing at 2am
     * used to leave world.current on the mine floor, and everything below ran
     * against that 34x28 slab instead of the sea: no sprinkler anywhere
     * watered anything that night, and yesterday's forage was neither cleared
     * nor replaced. The player lost a growth day on every irrigated crop for
     * the crime of staying down too long. */
    this.world.current = 'sea';
    this.mineDepth = 0;
    var report = this.sim.endDay(this.world);
    if (global.ISL_PLACES) {
      global.ISL_PLACES.machinesOvernight(this);
      global.ISL_PLACES.daycareOvernight(this);
    }
    if (this.farm) this.farm.overnight(report);
    this.spawnForage();
    this.growSprinklers();
    if (global.ISL_NPC) global.ISL_NPC.build(this);
    var home = this.islandRec('home');
    if (home) {
      var bed = null;
      this.world.areas.sea.objs.forEach(function (o) { if (o.kind === 'bed') bed = o; });
      if (bed) { this.player.x = bed.x + 0.5; this.player.y = bed.y + 1.5; }
      else { this.player.x = home.x + home.w / 2; this.player.y = home.y + home.h / 2; }
    }
    this.recenter(true);
    this.sim.save(this.world);
    if (this.sim.day >= 26 && global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('seasonEnd');
    this.checkBuyable();
    return report;
  };

  /* Wild forage: a handful of season-appropriate pickups scattered overnight
   * across every island whose `scatter` block asks for them.
   *
   * The build this replaces put this in progress.js and hardcoded five map
   * names; there is one map now and the islands declare their own appetite, so
   * a new island gets forage by writing `forage: 4` in its scatter block and
   * nothing else. Yesterday's leftovers are cleared first, or an island nobody
   * visits silts up with a hundred daffodils. */
  Game.prototype.spawnForage = function () {
    var a = this.area();
    var season = this.sim.season();
    var pool = (this.data.forage && this.data.forage[season]) || ['Daffodil'];
    a.objs = a.objs.filter(function (o) { return o.kind !== 'forage'; });
    a.reindex();
    var self = this;
    (a.islands || []).forEach(function (rec) {
      if (!rec.owned) return;
      var want = (rec.isl.scatter && rec.isl.scatter.forage) || 0;
      if (rec.isl.season) want = Math.max(want, 1);
      var tries = want * 30;
      while (want > 0 && tries-- > 0) {
        var x = rec.x + 1 + Math.floor(Math.random() * (rec.w - 2));
        var y = rec.y + 1 + Math.floor(Math.random() * (rec.h - 2));
        var nm = a.name_of(x, y);
        if (nm !== 'land' && nm !== 'sand' && nm !== 'tall') continue;
        if (a.objAt(x, y)) continue;
        a.obj({ x: x, y: y, kind: 'forage', island: rec.id,
                item: pool[Math.floor(Math.random() * pool.length)], qty: 1 });
        want--;
      }
    });
    a.reindex();
  };

  /* Sprinklers water at dawn, before the player is awake, which is the whole
   * point of owning one. Radius: 1 for the basic (a plus, not a square),
   * 2 for the quality and 3 for the iridium. */
  var SPRINKLER_R = { 'Sprinkler': 1, 'Quality Sprinkler': 2, 'Iridium Sprinkler': 3 };
  Game.prototype.growSprinklers = function () {
    var a = this.area(), self = this;
    a.objs.forEach(function (o) {
      if (o.kind !== 'sprinkler') return;
      var r = SPRINKLER_R[o.item] || 1;
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (r === 1 && Math.abs(dx) + Math.abs(dy) > 1) continue;   // plus shape
          self.waterTile(o.x + dx, o.y + dy, { free: true });
        }
      }
    });
  };

  Game.prototype.collapse = function () {
    this.toast('Bạn ngất lúc 2 giờ sáng...');
    this.sim.exhausted = true;
    var report = this.sleep();
    if (global.ISL_UI) global.ISL_UI.showDayReport(this, report, true);
  };

  // ------------------------------------------------ hooks used by pokework
  Game.prototype.heldSeed = function () {
    var inv = this.sim.inventory;
    for (var i = 0; i < inv.length; i++) {
      if (cropForSeed(this.data, inv[i].name)) return inv[i];
    }
    return null;
  };
  Game.prototype.heldFertilizer = function () {
    var names = ['Deluxe Fertilizer', 'Quality Fertilizer', 'Basic Fertilizer'];
    for (var i = 0; i < names.length; i++) {
      if (this.sim.count(names[i]) > 0) return names[i];
    }
    return null;
  };
  Game.prototype.feedAllAnimals = function () {
    return this.farm && this.farm.feedAll ? this.farm.feedAll() : 0;
  };
  Game.prototype.autoFish = function (n) {
    var isl = this.currentIsland();
    if (!isl || !isl.isl.fish) return [];
    var pool = ISL.FISH_POOL[isl.isl.fish] || [];
    var out = [];
    for (var i = 0; i < n && pool.length; i++) {
      var name = pool[Math.floor(Math.random() * pool.length)];
      var q = this.sim.rollQuality(0, 'fishing');
      if (!this.sim.canGive(name, q)) break;
      this.sim.give(name, 1, q);
      this.sim.addXp('fishing', 8);
      this.addRank(5);
      out.push(name);
    }
    return out;
  };
  Game.prototype.digTreasure = function (isl) {
    var pool = ['Stone', 'Clay', 'Copper Ore', 'Iron Ore', 'Coal', 'Quartz',
                'Earth Crystal', 'Amethyst', 'Topaz', 'Geode'];
    if (this.sim.rank >= 15) pool = pool.concat(['Gold Ore', 'Ruby', 'Emerald', 'Frozen Geode']);
    if (this.sim.rank >= 25) pool = pool.concat(['Diamond', 'Iridium Ore', 'Prismatic Shard']);
    var out = [], n = 2 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var name = pool[Math.floor(Math.random() * pool.length)];
      var qty = 1 + Math.floor(Math.random() * 3);
      /* Only report what the bag actually took. There was no space check at
       * all here and out.push ran regardless of give()'s answer, so a full bag
       * got a toast listing ore it did not receive - and the Pokémon that dug
       * it had already been charged three work points. */
      if (!this.sim.give(name, qty)) {
        if (!out.length) { this.toast('Túi đầy — không cầm được gì.'); return []; }
        break;
      }
      out.push(name + ' x' + qty);
    }
    if (!out.length) return [];
    this.addRank(10);
    return out;
  };

  // --------------------------------------------------------------- renderer
  Game.prototype.render = function () {
    var ctx = this.ctx, c = this.canvas;
    var z = this.cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1d5c86';
    ctx.fillRect(0, 0, c.width, c.height);
    if (!A.ready()) return;

    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));

    var a = this.area();
    var vw = c.width / z, vh = c.height / z;
    var x0 = Math.max(0, Math.floor(this.cam.x / TS) - 1);
    var y0 = Math.max(0, Math.floor(this.cam.y / TS) - 1);
    var x1 = Math.min(a.w, Math.ceil((this.cam.x + vw) / TS) + 1);
    var y1 = Math.min(a.h, Math.ceil((this.cam.y + vh) / TS) + 1);

    if (this.world.current === 'sea') this.drawSea(ctx, x0, y0, x1, y1);
    this.drawIslands(ctx, x0, y0, x1, y1);
    this.drawTiles(ctx, a, x0, y0, x1, y1);
    this.drawFocus(ctx);
    this.drawActors(ctx, a, x0, y0, x1, y1);
    if (this.fx) this.fx.draw(ctx, 0, 0, TS);
    ctx.restore();

    this.drawWeather(ctx, c);
    this.drawLight(ctx, c);
  };

  /* The sea: a flat fill plus three scrolling wave strips at different speeds.
   * Cheap and it reads as water; a per-tile animated water tileset was tried
   * and cost 900 drawImage calls a frame for a worse result. */
  Game.prototype.drawSea = function (ctx, x0, y0, x1, y1) {
    var t = this.time / 1000;
    ctx.fillStyle = '#1d5c86';
    ctx.fillRect(x0 * TS, y0 * TS, (x1 - x0) * TS, (y1 - y0) * TS);
    var frames = ['Water0', 'Water1', 'Water2', 'Water3'];
    var f = frames[Math.floor(t * 3) % 4];
    if (!A.has(f)) return;
    var wv = A.width(f);
    ctx.globalAlpha = 0.30;
    for (var row = 0; row < 3; row++) {
      var off = -((t * (12 + row * 9)) % wv);
      for (var yy2 = y0 * TS + row * 6 * TS; yy2 < y1 * TS; yy2 += 15 * TS) {
        for (var xx = x0 * TS + off; xx < x1 * TS; xx += wv) {
          A.draw(ctx, f, xx, yy2 + (row % 2) * 7);
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  /* One island panel per visible island, plus the two things that stop a flat
   * colour swatch reading as a sticker pasted on the water: a SHORELINE - a
   * lighter rim inside the edge and a darker line on it - and a hashed
   * TEXTURE, a scatter of slightly darker pixels keyed off the tile
   * coordinates so it is stable between frames and free to compute.
   *
   * A locked island is drawn the same way and then washed dark, with its name
   * and price on it. It has to look like a real place you have not bought yet,
   * not like fog: seeing Đảo Cỏ Xanh across the water with "Cấp 8 · 7.000v"
   * written on it IS the progression, and hiding it would throw that away.
   */
  Game.prototype.drawIslands = function (ctx, x0, y0, x1, y1) {
    var list = this.area().islands || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.x + r.w < x0 || r.x > x1 || r.y + r.h < y0 || r.y > y1) continue;
      var px = r.x * TS, py = r.y * TS, pw = r.w * TS, ph = r.h * TS;

      /* The island's own shadow on the water, offset down-right so every
       * island in the archipelago is lit from the same direction. */
      ctx.fillStyle = 'rgba(6,26,44,.35)';
      ctx.fillRect(px + 4, py + 7, pw, ph);

      A.nine(ctx, r.ground, px, py, pw, ph, 16);
      this.drawShore(ctx, r, px, py, pw, ph);
      this.drawGrain(ctx, r, px, py, pw, ph, x0, y0, x1, y1);

      if (!r.owned) {
        ctx.fillStyle = 'rgba(8,14,24,.58)';
        ctx.fillRect(px, py, pw, ph);
        if (A.has('Lock')) A.drawAt(ctx, 'Lock', px + pw / 2, py + ph / 2, { scale: 2 });
        var u = r.isl.unlock;
        if (u) {
          ctx.font = 'bold 8px system-ui,sans-serif';
          ctx.textAlign = 'center';
          var afford = this.sim.rank >= u.rank && this.sim.gold >= u.gold;
          ctx.fillStyle = afford ? '#ffd870' : '#b9a887';
          ctx.fillText(r.isl.name, px + pw / 2, py + ph / 2 + 22);
          ctx.font = '7px system-ui,sans-serif';
          ctx.fillText('Cấp ' + u.rank + ' · ' + u.gold.toLocaleString('vi') + 'v',
                       px + pw / 2, py + ph / 2 + 33);
          ctx.textAlign = 'left';
        }
      }
    }
  };

  /* A two-tone rim: pale sand just inside the edge, a darker line on the very
   * edge. Drawn as four strips rather than a stroke so it lands on whole
   * pixels at every zoom - a stroked rect at 1.49x scale draws a blurry
   * half-pixel line, which on pixel art is the one thing you notice. */
  Game.prototype.drawShore = function (ctx, r, px, py, pw, ph) {
    ctx.fillStyle = 'rgba(255,244,208,.30)';
    ctx.fillRect(px + 2, py + 2, pw - 4, 3);
    ctx.fillRect(px + 2, py + ph - 5, pw - 4, 3);
    ctx.fillRect(px + 2, py + 2, 3, ph - 4);
    ctx.fillRect(px + pw - 5, py + 2, 3, ph - 4);
    ctx.fillStyle = 'rgba(20,50,70,.45)';
    ctx.fillRect(px, py, pw, 2);
    ctx.fillRect(px, py + ph - 2, pw, 2);
    ctx.fillRect(px, py, 2, ph);
    ctx.fillRect(px + pw - 2, py, 2, ph);
  };

  /* Ground grain. Two darker flecks per tile at positions hashed from the tile
   * coordinate, so the pattern never crawls and never has to be stored. Only
   * the visible slice of the island is walked. */
  Game.prototype.drawGrain = function (ctx, r, px, py, pw, ph, x0, y0, x1, y1) {
    var a = this.area();
    var gx0 = Math.max(r.x, x0), gx1 = Math.min(r.x + r.w, x1);
    var gy0 = Math.max(r.y, y0), gy1 = Math.min(r.y + r.h, y1);
    ctx.fillStyle = 'rgba(0,0,0,.07)';
    for (var y = gy0; y < gy1; y++) {
      for (var x = gx0; x < gx1; x++) {
        /* Only where the island's own colour is showing. A grain fleck over a
         * crop bed or a walkway is noise on top of a thing that already has
         * its own texture. */
        var n = a.name_of(x, y);
        if (n !== 'land' && n !== 'sand') continue;
        var h = (x * 73856093) ^ (y * 19349663);
        ctx.fillRect(x * TS + (h & 7) + 2, y * TS + ((h >> 3) & 7) + 2, 2, 2);
        ctx.fillRect(x * TS + ((h >> 6) & 9) + 3, y * TS + ((h >> 10) & 9) + 3, 1, 1);
      }
    }
  };

  /* Overlays only. The island panel already painted the base colour, so this
   * pass draws just the tiles that differ from it - soil, path, sand, tall
   * grass, bridges, surf, lava. On a typical screen that is a few dozen fills
   * rather than 250. */
  Game.prototype.drawTiles = function (ctx, a, x0, y0, x1, y1) {
    var t = this.time / 700;
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var name = a.name_of(x, y);
        if (name === 'land' || name === 'sea' || name === 'deep') continue;
        var px = x * TS, py = y * TS;
        var d = W.TILE[name];
        switch (name) {
          case 'tall':
            /* Tufts over the island's own colour, not a filled tile. Filling
             * first made a grass patch read as one solid dark rectangle -
             * which is the opposite of what it has to communicate, because
             * "there is something hiding in here" is the whole point of it. */
            ctx.fillStyle = 'rgba(30,80,30,.30)';
            ctx.fillRect(px, py, TS, TS);
            /* Blade positions are hashed off the tile, not fixed. With fixed
             * offsets every tile put its blades in the same three columns and
             * a patch came out as clean vertical stripes - which looks like a
             * texture bug, not like grass. */
            var gh = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            var sway = Math.sin(t + x * 0.7 + y * 0.3) * 1.3;
            ctx.fillStyle = '#4f9c40';
            ctx.fillRect(px + (gh & 3) + 1 + sway, py + 4 + ((gh >> 2) & 3), 3, 10);
            ctx.fillRect(px + 9 + ((gh >> 4) & 3) + sway, py + 5 + ((gh >> 6) & 3), 3, 9);
            ctx.fillStyle = '#2f7a2a';
            ctx.fillRect(px + 5 + ((gh >> 8) & 3) - sway, py + 1 + ((gh >> 10) & 3), 3, 13);
            ctx.fillStyle = 'rgba(200,240,160,.5)';
            ctx.fillRect(px + 5 + ((gh >> 8) & 3) - sway, py + 1 + ((gh >> 10) & 3), 1, 5);
            break;
          case 'bridge': case 'dock':
            ctx.fillStyle = '#8f6136'; ctx.fillRect(px, py, TS, TS);
            ctx.fillStyle = '#a3703f'; ctx.fillRect(px, py + 2, TS, 5);
            ctx.fillRect(px, py + 9, TS, 5);
            ctx.fillStyle = 'rgba(0,0,0,.25)';
            ctx.fillRect(px, py + 7, TS, 2); ctx.fillRect(px, py + 14, TS, 2);
            break;
          case 'surf':
            ctx.fillStyle = d.c; ctx.fillRect(px, py, TS, TS);
            ctx.fillStyle = 'rgba(255,255,255,.25)';
            ctx.fillRect(px, py + 6 + Math.sin(t * 2 + x) * 2, TS, 2);
            break;
          case 'lava':
            ctx.fillStyle = d.c; ctx.fillRect(px, py, TS, TS);
            ctx.fillStyle = d.c2;
            ctx.fillRect(px + 3, py + 3 + Math.sin(t * 3 + x + y) * 2, 10, 6);
            break;
          default:
            ctx.fillStyle = d.c; ctx.fillRect(px, py, TS, TS);
            if (name === 'tilled' || name === 'watered') {
              ctx.fillStyle = d.c2;
              ctx.fillRect(px + 1, py + 3, TS - 2, 3);
              ctx.fillRect(px + 1, py + 10, TS - 2, 3);
            } else if (name === 'path' || name === 'sand') {
              ctx.fillStyle = d.c2;
              ctx.fillRect(px + ((x * 7 + y * 3) % 9), py + ((x * 5 + y * 11) % 9), 4, 3);
            }
        }
      }
    }
  };

  Game.prototype.drawFocus = function (ctx) {
    var f = this.focus;
    if (!f) return;
    ctx.strokeStyle = 'rgba(255,216,112,.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(f.x * TS + 0.5, f.y * TS + 0.5, TS - 1, TS - 1);
  };

  /* One depth-sorted pass over everything that stands up: objects, villagers,
   * the player. Sorting by the tile's BOTTOM edge is what makes a tree in
   * front of the player actually occlude them. */
  Game.prototype.drawActors = function (ctx, a, x0, y0, x1, y1) {
    var list = [];
    var objs = a.objs;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 3 || o.y > y1 + 2) continue;
      list.push({ y: (o.y + (o.h || 1)) * TS, o: o, t: 'obj' });
    }
    var npcs = this.world.npcs || [];
    for (var n = 0; n < npcs.length; n++) {
      var v = npcs[n];
      if (v.x < x0 - 2 || v.x > x1 + 2 || v.y < y0 - 2 || v.y > y1 + 2) continue;
      list.push({ y: (v.y + 1) * TS, npc: v, t: 'npc' });
    }
    list.push({ y: (this.player.y + 0.5) * TS, t: 'player' });
    list.sort(function (p, q) { return p.y - q.y; });
    for (var k = 0; k < list.length; k++) {
      if (list[k].t === 'obj') this.drawObject(ctx, list[k].o);
      else if (list[k].t === 'npc') this.drawNpc(ctx, list[k].npc);
      else this.drawPlayer(ctx);
    }
  };

  var OBJ_ART = {
    house: 'HouseFront', shop: 'Shop', coop: 'Housing', barn: 'Housing',
    silo: 'Storage', bed: 'Bottom', chest: 'Box', kitchen: 'OvenEmpty',
    mailbox: 'WoodSign', bin: 'BoxBottom', calendarBoard: 'BlackBoard',
    orderBoard: 'QuestBase', bundleBoard: 'BlackBoard2', sign: 'Sign',
    toolUpgrade: 'smithy_0', geodeCrusher: 'DrawMachin',
    mineEntrance: 'MineGate', museumDesk: 'Desk', display: 'FishTank',
    table: 'Desk', stage: 'RedCarpet', pillar: 'Pillar', shrine: 'HearthStone',
    skyAltar: 'HearthStone', dragonNest: 'DragonEgg_0', healStone: 'HearthStone 1',
    pcBox: 'FishTank', ivJudge: 'WorkingDesk_0', evTrainer: 'Desk_Active',
    natureMint: 'Pot_0', daycare: 'Housing', dexResearch: 'OpenBook',
    baitTable: 'BaitShopTable', crabPotRack: 'Hook', tapper: 'Pot_1',
    trough: 'Slop', workshop: 'WorkingDesk_1', blackboard: 'BlackBoard',
    elevator: 'Ladder', fossilDig: 'MinotaursSkull', petBed: 'SleepDog_0',
    dock: 'HarborStone_0', sprinkler: 'Plus_5x5', fence: 'Fence_0'
  };

  Game.prototype.drawObject = function (ctx, o) {
    var cx = o.x * TS + (o.w || 1) * TS / 2;
    var by = (o.y + (o.h || 1)) * TS;
    if (o.kind === 'crop') return this.drawCrop(ctx, o);
    if (o.kind === 'drop') {
      var bob = Math.sin(this.time / 260 + o.x + o.y) * 1.5;
      IA.draw(ctx, o.item, o.x * TS + 2, o.y * TS + 2 + bob, 12);
      return;
    }
    if (o.kind === 'forage') {
      IA.draw(ctx, o.item || 'Daffodil', o.x * TS + 2, o.y * TS + 3, 12);
      return;
    }
    var art = o.art || OBJ_ART[o.kind];
    if (!art || !A.has(art)) {
      /* Loudly wrong rather than invisible. An object that draws nothing is
       * still solid, and a player walking into thin air has no way to report
       * what they saw. */
      ctx.fillStyle = '#ff00c8';
      ctx.fillRect(o.x * TS + 3, o.y * TS + 3, 10, 10);
      return;
    }
    /* Anything taller than its tile gets a shadow, or it floats. */
    if (A.height(art) > TS) {
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(cx, by - 2, Math.min(14, A.width(art) / 2), 4, 0, 0, 6.284);
      ctx.fill();
    }
    var opt = null;
    if (o.hp != null && o.hitAt && this.time - o.hitAt < 120) {
      opt = { tint: '#fff', tintA: 0.6 };
    }
    A.drawAt(ctx, art, cx, by, opt);
  };

  /* Crops: the atlas has real art for a handful, and a generated four-stage
   * plant for the rest. Both go through sprites.js `drawCrop` for the
   * generated case so a Starfruit and a Parsnip are visibly different plants
   * rather than the same green blob in two colours. */
  var CROP_ART = {
    tomato: ['Tomato_0', 'Tomato_1', 'Tomato_2'],
    wheat: ['Wheat_MiddleGrow_0', 'Wheat_Field_1', 'Wheat_Field_3'],
    blueberry: ['Blueberry0', 'Blueberry1', 'Blueberry1'],
    beet: ['SugarBeet_0', 'SugarBeet_1', 'SugarBeet_ReadyHead'],
    grape: ['GrapeTree0', 'GrapeTree1', 'GrapeTree2'],
    cranberries: ['BerryField_Base_0', 'BerryField1', 'BerryField3']
  };

  Game.prototype.drawCrop = function (ctx, o) {
    var px = o.x * TS, py = o.y * TS;
    if (o.dead) {
      ctx.fillStyle = '#6b5a3c';
      ctx.fillRect(px + 5, py + 6, 2, 8);
      ctx.fillRect(px + 9, py + 8, 2, 6);
      return;
    }
    var art = CROP_ART[o.crop];
    if (art) {
      var idx = o.stage >= o.maxStage ? 2 : (o.stage >= o.maxStage / 2 ? 1 : 0);
      var f = art[idx];
      if (A.has(f)) { A.drawAt(ctx, f, px + TS / 2, py + TS + 3); return; }
    }
    var S = global.SDV_SPRITES;
    if (S && S.drawCrop) {
      var cols = S.iconColors ? S.iconColors(o.name, 'crop') : null;
      S.drawCrop(ctx, px, py, 1, o.stage, o.maxStage,
                 cols ? cols.body : '#4c9636', cols ? cols.accent : '#d34',
                 o.trellis, TS);
      return;
    }
    ctx.fillStyle = '#4c9636';
    ctx.fillRect(px + 6, py + 16 - 4 - o.stage * 2, 4, 4 + o.stage * 2);
  };

  Game.prototype.drawNpc = function (ctx, v) {
    var cx = v.x * TS + TS / 2, by = v.y * TS + TS + 2;
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.ellipse(cx, by - 2, 7, 3, 0, 0, 6.284); ctx.fill();
    var bob = v.moving ? Math.abs(Math.sin(this.time / 120)) * 1.5 : Math.sin(this.time / 500) * 0.8;
    A.drawAt(ctx, v.art, cx, by - bob, { flip: v.dir === 'left' });
    if (v.exclaim) A.drawAt(ctx, 'Exclamation', cx, by - 22);
  };

  Game.prototype.drawPlayer = function (ctx) {
    var p = this.player;
    var cx = p.x * TS, by = p.y * TS + 8;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(cx, by - 2, 7, 3, 0, 0, 6.284); ctx.fill();
    var bob = p.moving ? Math.abs(Math.sin(p.anim)) * 2 : Math.sin(this.time / 500) * 0.8;
    var art = 'Farmer_Idle0';
    if (p.moving && Math.sin(p.anim) < 0 && A.has('Farmer_Idle1')) art = 'Farmer_Idle1';
    A.drawAt(ctx, art, cx, by - bob, { flip: p.dir === 'left' });
  };

  Game.prototype.drawWeather = function (ctx, c) {
    var w = this.sim.weather;
    if (w !== 'rain' && w !== 'storm' && w !== 'snow') return;
    var t = this.time / 1000;
    ctx.save();
    if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (var i = 0; i < 60; i++) {
        var sx = ((i * 137 + t * 18) % (c.width + 40)) - 20;
        var sy = ((i * 91 + t * 40) % (c.height + 40)) - 20;
        ctx.fillRect(sx, sy, 2, 2);
      }
    } else {
      ctx.strokeStyle = 'rgba(180,210,240,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var j = 0; j < 90; j++) {
        var rx = ((j * 173 + t * 90) % (c.width + 60)) - 30;
        var ry = ((j * 61 + t * 700) % (c.height + 60)) - 30;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 11);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  /* One flat wash for night, warmed at dusk. The build this replaces ran a
   * per-light radial-gradient pass and it was the single most expensive thing
   * in the frame on a mid-range phone; a night that is simply darker reads
   * fine and costs one fillRect. */
  Game.prototype.drawLight = function (ctx, c) {
    var m = this.sim.time;
    var dark = 0;
    if (m >= 20 * 60) dark = Math.min(0.52, (m - 20 * 60) / (4 * 60) * 0.52);
    else if (m >= 18 * 60) dark = (m - 18 * 60) / (2 * 60) * 0.22;
    if (this.world.current !== 'sea') dark = Math.max(dark, 0.45);
    if (dark <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    var warm = m < 20 * 60;
    ctx.fillStyle = warm ? 'rgba(255,190,140,' + (1 - dark * 0.5) + ')'
                         : 'rgba(70,90,150,' + (1 - dark) + ')';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  };

  global.SDV_GAME = { Game: Game, World: World, Player: Player, TS: TS };
  global.ISL_GAME = global.SDV_GAME;
})(window);
