/*
 * ui.js - every panel the player touches.
 *
 * The panels are DOM, not canvas. Drag-and-drop, a search field and scrolling
 * lists are things the browser already does correctly with real hit-testing on
 * touch; re-implementing them on a canvas would be worse in every way that
 * matters on a phone.
 *
 * Interaction rules taken from the brief:
 *  - selling and gifting are DROP TARGETS beside the bag, never "hold the item
 *    and press a button", which is unusable on a phone.
 *  - dragging a stack out of the bag drops it on the ground.
 *  - chests have category tabs, a search box and a quick-sort button.
 */
(function (global) {
  'use strict';

  var S = global.SDV_SPRITES, SIM = global.SDV_SIM;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function icon(name, cat, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size || 32;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    S.drawIcon(ctx, name, cat || 'crop', 0, 0, c.width);
    return c;
  }

  function UI(game, root) {
    this.game = game;
    this.sim = game.sim;
    this.root = root;
    game.ui = this;                 // world -> panel seam
    this.layer = el('div', 'sdv-layer');
    root.appendChild(this.layer);
    this.dragging = null;
    this.buildHud();
    this.buildJoystick();
    this.buildButtons();
    this.panel = null;
    var self = this;
    game.onDayEnd = function (r, c) { self.showDayReport(r, c); };
  }

  // ------------------------------------------------------------------ HUD
  UI.prototype.buildHud = function () {
    var h = el('div', 'sdv-hud');
    h.innerHTML =
      '<div class="sdv-topline">' +
        '<div class="sdv-date"><b id="sdv-day"></b><span id="sdv-clock"></span></div>' +
        '<div class="sdv-wx" id="sdv-wx"></div>' +
        '<div class="sdv-gold"><span id="sdv-gold">0</span>g</div>' +
      '</div>' +
      '<div class="sdv-bars">' +
        '<div class="sdv-bar sdv-energy"><i id="sdv-energy-fill"></i>' +
          '<span id="sdv-energy-txt"></span></div>' +
        '<div class="sdv-bar sdv-health" id="sdv-health-wrap"><i id="sdv-health-fill"></i>' +
          '<span id="sdv-health-txt"></span></div>' +
      '</div>';
    this.layer.appendChild(h);
    this.mini = el('canvas', 'sdv-mini');
    this.mini.width = 120; this.mini.height = 96;
    this.layer.appendChild(this.mini);
    this.miniCtx = this.mini.getContext('2d');
    this.toastBox = el('div', 'sdv-toasts');
    this.layer.appendChild(this.toastBox);
  };

  UI.prototype.updateHud = function () {
    var s = this.sim;
    document.getElementById('sdv-day').textContent =
      s.seasonVN() + ' ' + s.day + ' · ' + s.dayOfWeek() + ' · Năm ' + s.year;
    document.getElementById('sdv-clock').textContent = s.clockText();
    var wx = { sun: '☀️', rain: '🌧️', storm: '⛈️', snow: '❄️', wind: '🍃' }[s.weather] || '☀️';
    document.getElementById('sdv-wx').textContent = wx;
    document.getElementById('sdv-gold').textContent = s.gold.toLocaleString('vi-VN');
    var ep = Math.max(0, s.energy / s.maxEnergy * 100);
    document.getElementById('sdv-energy-fill').style.height = ep + '%';
    document.getElementById('sdv-energy-txt').textContent = Math.round(s.energy);
    // health only matters underground - and that is all three caves,
    // not just the one under the mountain
    var inMine = !!this.game.world.area().depth;
    document.getElementById('sdv-health-wrap').style.display = inMine ? '' : 'none';
    if (inMine) {
      document.getElementById('sdv-health-fill').style.height =
        (s.health / s.maxHealth * 100) + '%';
      document.getElementById('sdv-health-txt').textContent = Math.round(s.health);
    }
    if (s.pendingProfession && !this.panel && this.openProfession) {
      var pp = s.pendingProfession;
      this.openProfession(pp.skill, pp.level);
    }
    this.game.drawMinimap(this.miniCtx, 0, 0, this.mini.width, this.mini.height);
    // toasts
    var box = this.toastBox;
    var want = this.game.messages.map(function (m) { return m.text; }).join('\n');
    if (box.dataset.want !== want) {
      box.dataset.want = want;
      box.innerHTML = '';
      this.game.messages.forEach(function (m) {
        box.appendChild(el('div', 'sdv-toast', m.text));
      });
    }
  };

  // ------------------------------------------------------------------ stick
  UI.prototype.buildJoystick = function () {
    var self = this;
    var stick = el('div', 'sdv-stick');
    var knob = el('div', 'sdv-knob');
    stick.appendChild(knob);
    this.layer.appendChild(stick);
    var active = null, cx = 0, cy = 0, R = 46;

    function start(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      var r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      active = t.identifier == null ? 'mouse' : t.identifier;
      move(e);
      e.preventDefault();
    }
    function move(e) {
      if (active === null) return;
      var t = pick(e);
      if (!t) return;
      var dx = t.clientX - cx, dy = t.clientY - cy;
      var d = Math.hypot(dx, dy);
      var k = d > R ? R / d : 1;
      knob.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
      self.game.input.dx = dx / R; self.game.input.dy = dy / R;
      e.preventDefault();
    }
    function end(e) {
      if (active === null) return;
      active = null;
      knob.style.transform = 'translate(0,0)';
      self.game.input.dx = 0; self.game.input.dy = 0;
    }
    function pick(e) {
      if (!e.changedTouches) return e;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === active) return e.changedTouches[i];
      }
      return null;
    }
    stick.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    stick.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    // keyboard: the hub is played on desktop too
    var keys = {};
    window.addEventListener('keydown', function (e) {
      keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' || e.key === 'Enter') self.game.useTool();
      if (e.key.toLowerCase() === 'e') self.openBag();
      if (e.key === 'Escape') self.close();
      applyKeys();
    });
    window.addEventListener('keyup', function (e) {
      keys[e.key.toLowerCase()] = false; applyKeys();
    });
    function applyKeys() {
      if (active !== null) return;
      var dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      var dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
      self.game.input.dx = dx; self.game.input.dy = dy;
    }
  };

  // ------------------------------------------------------------------ buttons
  UI.prototype.buildButtons = function () {
    var self = this, g = this.game;
    var wrap = el('div', 'sdv-actions');
    this.actBtn = el('button', 'sdv-btn sdv-act', '⛏');
    this.actBtn.addEventListener('click', function () { g.useTool(); });
    this.bagBtn = el('button', 'sdv-btn sdv-small', '🎒');
    this.bagBtn.addEventListener('click', function () { self.openBag(); });
    this.craftBtn = el('button', 'sdv-btn sdv-small', '🔨');
    this.craftBtn.addEventListener('click', function () { self.openCraftHub(); });
    wrap.appendChild(this.craftBtn);
    wrap.appendChild(this.bagBtn);
    wrap.appendChild(this.actBtn);
    this.layer.appendChild(wrap);

    // quick-use row: the brief asks for this specifically for the mine
    this.quick = el('div', 'sdv-quick');
    this.layer.appendChild(this.quick);

    // tapping the world opens whatever was tapped
    g.canvas.addEventListener('click', function (ev) {
      var r = g.canvas.getBoundingClientRect();
      var px = (ev.clientX - r.left) * (g.canvas.width / r.width);
      var py = (ev.clientY - r.top) * (g.canvas.height / r.height);
      if (g.fishBtnScreen) {
        var f = g.fishBtnScreen;
        if (Math.hypot(px - f.x, py - f.y) < f.r * 1.4) { self.openFishing(); return; }
      }
      if (!g.cam) return;
      var tx = Math.floor((px + g.cam.x) / g.cam.ts);
      var ty = Math.floor((py + g.cam.y) / g.cam.ts);
      self.tapTile(tx, ty);
    });
  };

  UI.prototype.updateQuick = function () {
    var inMine = !!this.game.world.area().depth;
    this.quick.style.display = inMine ? 'flex' : 'none';
    if (!inMine) return;
    var self = this;
    var usable = this.sim.inventory.filter(function (it) {
      var info = self.sim.itemInfo(it.name);
      return info && (info.energy != null || /bomb|staircase/i.test(it.name));
    }).slice(0, 6);
    var key = usable.map(function (i) { return i.name + i.qty; }).join('|');
    if (this.quick.dataset.key === key) return;
    this.quick.dataset.key = key;
    this.quick.innerHTML = '';
    usable.forEach(function (it) {
      var b = el('button', 'sdv-qbtn');
      var info = self.sim.itemInfo(it.name);
      b.appendChild(icon(it.name, info ? info.cat : 'crop', 28));
      b.appendChild(el('span', 'sdv-qty', String(it.qty)));
      b.addEventListener('click', function () {
        var idx = self.sim.inventory.indexOf(it);
        /* WHY: this row admits bombs and staircases by name but only ever
         * called eat(), which returns null for anything with no energy - so
         * the bomb button was completely inert. */
        if (/staircase/i.test(it.name)) return self.useStaircase(idx);
        if (/bomb/i.test(it.name)) return self.useBomb(idx, it.name);
        var gain = self.sim.eat(idx);
        if (gain) self.game.toast('+' + gain + ' sức lực');
        else self.game.toast('Món này không ăn được');
      });
      self.quick.appendChild(b);
    });
  };

  // ------------------------------------------------------------------ panels
  UI.prototype.close = function () {
    /* WHY: the fishing panel arms window-level listeners and two timers. Closing
     * without tearing them down left a dead minigame stealing every tap. */
    if (this._fishStop) { this._fishStop(); this._fishStop = null; }
    if (this._fishState) {
      clearTimeout(this._fishState.timer);
      clearTimeout(this._fishState.escape);
      if (this._fishState.cleanup) this._fishState.cleanup();
      this._fishState = null;
    }
    if (this.panel) { this.panel.remove(); this.panel = null; }
    this.game.paused = false;
  };
  UI.prototype.openPanel = function (title, bodyEl, opts) {
    this.close();
    this.game.paused = !(opts && opts.live);
    var p = el('div', 'sdv-panel');
    var head = el('div', 'sdv-phead');
    head.appendChild(el('h3', null, title));
    var x = el('button', 'sdv-x', '✕');
    var self = this;
    x.addEventListener('click', function () { self.close(); });
    head.appendChild(x);
    p.appendChild(head);
    p.appendChild(bodyEl);
    this.layer.appendChild(p);
    this.panel = p;
    return p;
  };

  // ---- bag ---------------------------------------------------------------
  UI.prototype.slotEl = function (it, list, index, opts) {
    var self = this;
    var s = el('div', 'sdv-slot');
    if (!it) { s.classList.add('sdv-empty'); return s; }
    var info = this.sim.itemInfo(it.name);
    s.appendChild(icon(it.name, info ? info.cat : 'crop', 34));
    if (it.qty > 1) s.appendChild(el('span', 'sdv-qty', String(it.qty)));
    if (it.quality) s.appendChild(el('span', 'sdv-q' + it.quality, ''));
    s.title = it.name + (info ? ' · ' + info.sell + 'g' : '');
    s.draggable = true;
    s.addEventListener('dragstart', function (e) {
      self.dragging = { it: it, list: list, index: index };
      e.dataTransfer.setData('text/plain', it.name);
    });
    s.addEventListener('dragover', function (e) { e.preventDefault(); });
    s.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!self.dragging) return;
      var d = self.dragging;
      if (d.list === list && d.index !== index) {
        var tmp = list[index]; list[index] = list[d.index]; list[d.index] = tmp;
      } else if (d.list !== list) {
        self.moveStack(d, list);
      }
      self.dragging = null;
      self.refreshPanel();
    });
    // touch drag: press and hold to pick up, tap a target to drop
    s.addEventListener('touchstart', function () {
      self.dragging = { it: it, list: list, index: index };
      s.classList.add('sdv-picked');
    }, { passive: true });
    s.addEventListener('click', function () {
      if (opts && opts.onClick) opts.onClick(it, index);
    });
    return s;
  };

  UI.prototype.moveStack = function (d, target) {
    var cap = target === this.sim.chest ? this.sim.chestSize : this.sim.invSize;
    var it = d.it;
    for (var i = 0; i < target.length; i++) {
      if (target[i] && target[i].name === it.name
          && (target[i].quality || 0) === (it.quality || 0)) {
        target[i].qty += it.qty;
        d.list.splice(d.index, 1);
        return true;
      }
    }
    if (target.length >= cap) { this.game.toast('Chỗ chứa đã đầy'); return false; }
    target.push(it);
    d.list.splice(d.index, 1);
    return true;
  };

  UI.prototype.openBag = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    var grid = el('div', 'sdv-grid');
    body.appendChild(grid);
    var hint = el('div', 'sdv-hint',
      'Kéo vật phẩm ra ngoài khung để vứt xuống đất. Chạm để ăn (nếu ăn được).');
    body.appendChild(hint);
    this.renderGrid = function () {
      grid.innerHTML = '';
      for (var i = 0; i < self.sim.invSize; i++) {
        grid.appendChild(self.slotEl(self.sim.inventory[i], self.sim.inventory, i, {
          onClick: function (it, idx) {
            var gain = self.sim.eat(idx);
            if (gain != null) { self.game.toast('+' + gain + ' sức lực'); self.refreshPanel(); }
          }
        }));
      }
    };
    this.renderGrid();
    var p = this.openPanel('Túi đồ', body);
    p.addEventListener('dragover', function (e) { e.preventDefault(); });
    /* WHY registered once: this used to be added on EVERY openBag, and each
     * stale copy closed over its own detached panel, so its
     * "was it dropped inside?" guard never fired again - from the second bag
     * open onward, letting go of an item anywhere threw it on the ground. */
    if (!this._groundDropBound) {
      this._groundDropBound = true;
      this.layer.addEventListener('drop', function (e) {
        if (!self.dragging) return;
        if (self.panel && self.panel.contains(e.target)) return;
        self.dropOnGround(self.dragging);
        self.dragging = null;
        if (self.refreshPanel) self.refreshPanel();
      });
    }
    this.refreshPanel = function () { self.renderGrid(); };
  };

  UI.prototype.dropOnGround = function (d) {
    var g = this.game, a = g.world.area();
    var x = Math.floor(g.player.x), y = Math.floor(g.player.y);
    a.objs.push({ x: x, y: y, kind: 'dropped', item: d.it });
    d.list.splice(d.index, 1);
    g.toast('Đã vứt ' + d.it.name + ' xuống đất');
  };

  // ---- tapping a tile ----------------------------------------------------
  UI.prototype.tapTile = function (x, y) {
    var g = this.game, a = g.world.area();
    var p = g.player;
    if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > 3.2) return;
    if (this.moveCrop) {
      var t0 = a.name_of(x, y);
      if ((t0 !== 'tilled' && t0 !== 'watered') || g.world.objAt(x, y, a)) {
        g.toast('Phải là ô đất đã cuốc và còn trống');
      } else {
        this.moveCrop.x = x; this.moveCrop.y = y;
        this.moveCrop.watered = (t0 === 'watered');
        g.toast('Đã dời cây');
      }
      this.moveCrop = null;
      return;
    }
    var o = g.world.objAt(x, y);
    if (o) return this.openObject(o, x, y);
    var t = a.name_of(x, y);
    /* WHY: gating on a.id === 'farm' meant the greenhouse and the island plot
     * were decorative - you could stand on soil and not be allowed to plant. */
    var farmable = a.id === 'farm' || a.id === 'greenhouse' || a.id === 'island';
    if (farmable && (t === 'tilled' || t === 'watered')) return this.tileMenu(x, y);
    if (farmable && (t === 'dirt' || t === 'grass')) return this.buildMenu(x, y);
  };

  UI.prototype.openObject = function (o, x, y) {
    switch (o.kind) {
      case 'npc': return this.openNpc(o.npc);
      case 'crop': return this.cropMenu(o);
      case 'bin': return this.openShipping();
      case 'chest': return this.openChest();
      case 'furnace': case 'machine': return this.openMachine(o);
      case 'bed': return this.confirmSleep();
      case 'tv': return this.openTv();
      case 'counter': return this.openShop(o.stock, o.keeper);
      case 'bundleBoard': return this.openBundles(o.room);
      case 'dropped': {
        if (this.sim.give(o.item.name, o.item.qty, o.item.quality)) {
          this.game.world.removeObj(o);
          this.game.toast('Nhặt ' + o.item.name);
        } else this.game.toast('Túi đầy!');
        return;
      }
      case 'brokenBridge': return this.repairMenu(o);
      default: return;
    }
  };

  /* Farm tile menu - exactly the options the brief lists. */
  UI.prototype.tileMenu = function (x, y) {
    var self = this, g = this.game, a = g.world.area();
    var body = el('div', 'sdv-body');
    var seeds = this.sim.inventory.filter(function (it) {
      return /seeds?$/i.test(it.name) || /starter$/i.test(it.name);
    });
    var list = el('div', 'sdv-menu');
    if (seeds.length) {
      list.appendChild(el('div', 'sdv-sub', 'Gieo hạt'));
      seeds.forEach(function (sd) {
        var b = el('button', 'sdv-mbtn');
        b.appendChild(icon(sd.name, 'seed', 26));
        b.appendChild(el('span', null, sd.name + ' ×' + sd.qty));
        b.addEventListener('click', function () { self.plant(x, y, sd); });
        list.appendChild(b);
      });
    } else {
      list.appendChild(el('div', 'sdv-sub', 'Không có hạt giống trong túi'));
    }
    var alreadyWet = a.name_of(x, y) === 'watered';
    var wbtn = el('button', 'sdv-mbtn' + (alreadyWet ? ' sdv-off' : ''),
                  alreadyWet ? '💧 Ô này đã tưới rồi' : '💧 Tưới nước');
    wbtn.addEventListener('click', function () {
      // charging energy to water an already-wet tile is pure loss
      if (a.name_of(x, y) === 'watered') return self.game.toast('Ô này đã tưới rồi');
      if (self.sim.energy <= 0) return self.game.toast('Hết sức');
      self.sim.spend(2);
      a.set(x, y, 'watered');
      var c = g.world.objAt(x, y);
      if (c && c.kind === 'crop') c.watered = true;
      g.fx.hit('water', x, y, g.player.face);
      self.close();
    });
    list.appendChild(wbtn);
    /* WHY: fertiliser was only offered on bare soil and stored nowhere, so it
     * was consumed and lost - every crop in the game was permanently fert 0 and
     * Quality/Deluxe fertiliser had no code path at all. It now lives on the
     * TILE and is inherited by whatever is planted there afterwards. */
    var FERT = [['Basic Fertilizer', 1], ['Quality Fertilizer', 2],
                ['Deluxe Fertilizer', 3]];
    a.fert = a.fert || {};
    var already = a.fert[x + ',' + y] || 0;
    if (already) {
      list.appendChild(el('div', 'sdv-sub',
        'Đã bón: ' + FERT[already - 1][0]));
    }
    FERT.forEach(function (f) {
      var have = self.sim.count(f[0]);
      var fb = el('button', 'sdv-mbtn' + (have ? '' : ' sdv-off'));
      fb.appendChild(el('span', null, '🧪 Bón ' + f[0]));
      fb.appendChild(el('small', 'sdv-cost', 'đang có ' + have));
      fb.addEventListener('click', function () {
        if (!self.sim.take(f[0], 1)) return self.game.toast('Không có ' + f[0]);
        a.fert = a.fert || {};
        a.fert[x + ',' + y] = f[1];
        var c2 = g.world.objAt(x, y);
        if (c2 && c2.kind === 'crop') c2.fert = f[1];
        self.game.toast('Đã bón ' + f[0]);
        self.close();
      });
      list.appendChild(fb);
    });
    var dbtn = el('button', 'sdv-mbtn', '🗑 Phá luống');
    dbtn.addEventListener('click', function () {
      a.set(x, y, 'dirt');
      var c = g.world.objAt(x, y);
      if (c && c.kind === 'crop') g.world.removeObj(c);
      self.close();
    });
    list.appendChild(dbtn);
    body.appendChild(list);
    this.openPanel('Ô đất (' + x + ',' + y + ')', body);
  };

  UI.prototype.plant = function (x, y, seedStack) {
    var g = this.game, a = g.world.area();
    var cropName = seedStack.name.replace(/\s*Seeds?$/i, '').replace(/\s*Starter$/i, '');
    var def = null;
    for (var i = 0; i < this.game.data.crops.length; i++) {
      var c = this.game.data.crops[i];
      if (c.seed === seedStack.name || c.name === cropName) { def = c; break; }
    }
    if (!def) { this.game.toast('Hạt này chưa trồng được'); return; }
    var indoors = g.world.area().season;    // greenhouse pins its own season
    if (!indoors && def.seasons.length && def.seasons.indexOf(this.sim.season()) < 0) {
      this.game.toast(def.name + ' không trồng được mùa ' + this.sim.seasonVN());
      return;
    }
    if (g.world.objAt(x, y)) { this.game.toast('Ô này đã có cây'); return; }
    this.sim.take(seedStack.name, 1);
    var stageDays = (def.stages && def.stages.length) ? def.stages.slice() : [1, 1, 1, 1];
    a.fert = a.fert || {};
    /* WHY watered is inherited: watering the soil BEFORE sowing used to be
     * silently thrown away - the tile looked wet, the seed went in dry, and the
     * player lost a day and 2 energy with visual confirmation it had worked. */
    a.objs.push({
      x: x, y: y, kind: 'crop', crop: def.name, stage: 0, days: 0,
      stageDays: stageDays, maxStage: stageDays.length,
      growth: def.growth || stageDays.reduce(function (s2, d) { return s2 + d; }, 0),
      regrow: def.regrow || null, regrowLeft: 0, harvested: false,
      seasons: def.seasons, trellis: !!def.trellis,
      minHarvest: def.minHarvest || 1, maxHarvest: def.maxHarvest || 1,
      watered: a.name_of(x, y) === 'watered',
      fert: a.fert[x + ',' + y] || 0
    });
    if (a.name_of(x, y) === 'dirt') a.set(x, y, 'tilled');
    this.close();
    this.game.toast('Đã gieo ' + def.name);
  };

  UI.prototype.cropMenu = function (o) {
    var self = this, g = this.game;
    var ripe = o.stage >= o.maxStage && !o.harvested && !o.dead;
    if (ripe) return this.harvest(o);
    var body = el('div', 'sdv-body');
    var def = g.cropDef(o.crop);
    body.appendChild(el('div', 'sdv-sub',
      o.dead ? 'Cây đã chết vì trái mùa.'
             : 'Giai đoạn ' + o.stage + '/' + o.maxStage +
               (o.watered ? ' · đã tưới' : ' · chưa tưới')));
    var list = el('div', 'sdv-menu');
    if (!o.dead) {
      var w = el('button', 'sdv-mbtn', '💧 Tưới nước');
      w.addEventListener('click', function () {
        if (self.sim.energy <= 0) return self.game.toast('Hết sức');
        self.sim.spend(2); o.watered = true;
        g.world.area().set(o.x, o.y, 'watered');
        g.fx.hit('water', o.x, o.y, g.player.face);
        self.close();
      });
      list.appendChild(w);
    }
    if (!o.dead) {
      /* Fertiliser has to be reachable from the CROP too - the player plants
       * first and thinks about quality afterwards. */
      [['Basic Fertilizer', 1], ['Quality Fertilizer', 2],
       ['Deluxe Fertilizer', 3]].forEach(function (f) {
        var have = self.sim.count(f[0]);
        var fb = el('button', 'sdv-mbtn' + (have ? '' : ' sdv-off'));
        fb.appendChild(el('span', null, '🧪 Bón ' + f[0]
          + (o.fert === f[1] ? ' (đã bón)' : '')));
        fb.appendChild(el('small', 'sdv-cost', 'đang có ' + have));
        fb.addEventListener('click', function () {
          if (!self.sim.take(f[0], 1)) return self.game.toast('Không có ' + f[0]);
          o.fert = f[1];
          var ar = g.world.area();
          ar.fert = ar.fert || {};
          ar.fert[o.x + ',' + o.y] = f[1];
          self.game.toast('Đã bón ' + f[0]);
          self.close();
        });
        list.appendChild(fb);
      });
      var mv = el('button', 'sdv-mbtn', '↔ Dời cây sang ô khác');
      mv.addEventListener('click', function () {
        self.moveCrop = o;
        self.close();
        self.game.toast('Chạm vào ô đất muốn dời cây tới');
      });
      list.appendChild(mv);
    }
    var d = el('button', 'sdv-mbtn',
               o.dead ? '🗑 Dọn cây chết' : '🗑 Nhổ bỏ');
    d.addEventListener('click', function () {
      g.world.removeObj(o);
      if (o.dead) self.game.toast('Đã dọn cây chết');
      self.close();
    });
    list.appendChild(d);
    body.appendChild(list);
    this.openPanel(o.crop, body);
  };

  UI.prototype.harvest = function (o) {
    var g = this.game, def = g.cropDef(o.crop);
    var q = this.sim.rollQuality(o.fert || 0);
    /* WHY: the data carries minHarvest/maxHarvest (Blueberry 3, Cranberries 5)
     * and nothing read it, so every money crop paid a third of what it should. */
    var lo = o.minHarvest || (def && def.minHarvest) || 1;
    var hi = Math.max(lo, o.maxHarvest || (def && def.maxHarvest) || lo);
    var n = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (!this.sim.give(o.crop, n, q)) { g.toast('Túi đầy!'); return; }
    /* XP follows the game's own curve rather than price/8, which handed out
     * 99 XP for a Starfruit and pushed farming to level 10 inside six weeks. */
    var price = (def && def.sell) || 20;
    var lvl = this.sim.addXp('farming',
      Math.max(3, Math.round(16 * Math.log(0.018 * price + 1))));
    if (lvl) g.toast('Nông nghiệp lên cấp ' + lvl + '!');
    var qn = ['', ' (bạc)', ' (vàng)', ' (iridium)'][q];
    g.toast('Thu hoạch ' + o.crop + (n > 1 ? ' ×' + n : '') + qn);
    if (o.regrow) { o.harvested = true; o.regrowLeft = o.regrow; }
    else g.world.removeObj(o);
  };

  /* Every farm tile is buildable - the brief asks for this explicitly. */
  UI.prototype.buildMenu = function (x, y) {
    var self = this, g = this.game, a = g.world.area();
    var body = el('div', 'sdv-body');
    var list = el('div', 'sdv-menu');
    var opts = [
      { label: '🌱 Cuốc thành luống', cost: {}, act: function () { a.set(x, y, 'tilled'); self.sim.spend(2); } },
      { label: '📦 Rương gỗ', cost: { Wood: 50 }, act: function () { a.objs.push({ x: x, y: y, kind: 'chest' }); } },
      { label: '🔨 Xem máy móc trên nông trại…', cost: {}, act: function () {
          setTimeout(function () { self.openMachineList(); }, 0); } },
      { label: '💧 Vòi tưới', cost: { 'Copper Bar': 1, 'Iron Bar': 1 }, act: function () { a.objs.push({ x: x, y: y, kind: 'sprinkler' }); } }
    ];
    opts.forEach(function (op) {
      var have = true, costTxt = [];
      for (var k in op.cost) {
        var n = self.sim.count(k);
        if (n < op.cost[k]) have = false;
        costTxt.push(k + ' ' + n + '/' + op.cost[k]);
      }
      var b = el('button', 'sdv-mbtn' + (have ? '' : ' sdv-off'));
      b.appendChild(el('span', null, op.label));
      if (costTxt.length) b.appendChild(el('small', 'sdv-cost', costTxt.join(' · ')));
      b.addEventListener('click', function () {
        if (!have) return self.game.toast('Chưa đủ nguyên liệu');
        for (var k2 in op.cost) self.sim.take(k2, op.cost[k2]);
        op.act();
        self.close();
      });
      list.appendChild(b);
    });
    body.appendChild(list);
    this.openPanel('Xây trên ô này', body);
  };

  UI.prototype.repairMenu = function (o) {
    var self = this;
    var body = el('div', 'sdv-body');
    var need = 300, have = this.sim.count('Wood');
    body.appendChild(el('div', 'sdv-sub',
      'Cây cầu gãy. Cần ' + need + ' gỗ — bạn có ' + have + '.'));
    var b = el('button', 'sdv-mbtn' + (have >= need ? '' : ' sdv-off'), '🔨 Sửa cầu');
    b.addEventListener('click', function () {
      if (self.sim.count('Wood') < need) return self.game.toast('Chưa đủ gỗ');
      self.sim.take('Wood', need);
      self.game.world.removeObj(o);
      self.game.toast('Đã sửa xong cầu!');
      self.close();
    });
    body.appendChild(b);
    this.openPanel('Cầu gãy', body);
  };

  // ---- shipping ----------------------------------------------------------
  UI.prototype.openShipping = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    var drop = el('div', 'sdv-drop', 'Kéo vật phẩm vào đây để bán<br><small>Tiền vào sáng hôm sau</small>');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); self.shipDragged();
    });
    drop.addEventListener('click', function () { self.shipDragged(); });
    body.appendChild(drop);
    var pending = el('div', 'sdv-list');
    var total = 0;
    this.sim.shipped.forEach(function (s) {
      total += self.sim.sellPrice(s.name, s.quality) * s.qty;
      pending.appendChild(el('div', 'sdv-row',
        s.name + ' ×' + s.qty + ' — ' + (self.sim.sellPrice(s.name, s.quality) * s.qty) + 'g'));
    });
    body.appendChild(el('div', 'sdv-sub', 'Đang chờ bán: ' + total + 'g'));
    body.appendChild(pending);
    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < this.sim.invSize; i++) {
      grid.appendChild(this.slotEl(this.sim.inventory[i], this.sim.inventory, i, {
        onClick: function (it, idx) { self.ship(idx); }
      }));
    }
    body.appendChild(el('div', 'sdv-sub', 'Túi đồ (chạm để bán)'));
    body.appendChild(grid);
    this.openPanel('Thùng giao hàng', body);
    this.refreshPanel = function () { self.openShipping(); };
  };
  UI.prototype.shipDragged = function () {
    if (!this.dragging) return;
    this.ship(this.dragging.index);
    this.dragging = null;
  };
  UI.prototype.ship = function (idx) {
    var it = this.sim.inventory[idx];
    if (!it) return;
    var info = this.sim.itemInfo(it.name);
    if (!info) { this.game.toast('Món này không bán được'); return; }
    this.sim.shipped.push({ name: it.name, qty: it.qty, quality: it.quality || 0 });
    this.sim.inventory.splice(idx, 1);
    this.game.toast('Đã bỏ vào thùng: ' + it.name);
    this.openShipping();
  };

  // ---- chest -------------------------------------------------------------
  var CATS = [['all', 'Tất cả'], ['crop', 'Nông sản'], ['forage', 'Đồ hái'],
              ['fish', 'Cá'], ['mineral', 'Khoáng'], ['artifact', 'Cổ vật'],
              ['resource', 'Tài nguyên'], ['artisan', 'Thủ công'],
              ['cooked', 'Món ăn'], ['crafted', 'Chế tạo']];
  UI.prototype.openChest = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    var tabs = el('div', 'sdv-tabs');
    var state = this.chestState || (this.chestState = { cat: 'all', q: '' });
    CATS.forEach(function (c) {
      var b = el('button', 'sdv-tab' + (state.cat === c[0] ? ' on' : ''), c[1]);
      b.addEventListener('click', function () { state.cat = c[0]; self.openChest(); });
      tabs.appendChild(b);
    });
    body.appendChild(tabs);
    var tools = el('div', 'sdv-tools');
    var search = el('input', 'sdv-search');
    search.placeholder = 'Tìm vật phẩm…';
    search.value = state.q;
    search.addEventListener('input', function () { state.q = search.value; render(); });
    var sort = el('button', 'sdv-mbtn sdv-inline', '⇅ Sắp xếp nhanh');
    sort.addEventListener('click', function () {
      self.sim.chest.sort(function (a, b) { return a.name.localeCompare(b.name); });
      render();
    });
    tools.appendChild(search); tools.appendChild(sort);
    body.appendChild(tools);
    var cgrid = el('div', 'sdv-grid');
    var igrid = el('div', 'sdv-grid');
    body.appendChild(el('div', 'sdv-sub', 'Trong rương'));
    body.appendChild(cgrid);
    body.appendChild(el('div', 'sdv-sub', 'Túi đồ'));
    body.appendChild(igrid);

    function match(it) {
      if (!it) return true;
      var info = self.sim.itemInfo(it.name);
      if (state.cat !== 'all' && (!info || info.cat !== state.cat)) return false;
      if (state.q && it.name.toLowerCase().indexOf(state.q.toLowerCase()) < 0) return false;
      return true;
    }
    function render() {
      cgrid.innerHTML = ''; igrid.innerHTML = '';
      for (var i = 0; i < self.sim.chestSize; i++) {
        var it = self.sim.chest[i];
        cgrid.appendChild(self.slotEl(match(it) ? it : null, self.sim.chest, i, {
          onClick: function (item, idx) {
            self.moveStack({ it: item, list: self.sim.chest, index: idx }, self.sim.inventory);
            render();
          }
        }));
      }
      for (var j = 0; j < self.sim.invSize; j++) {
        var it2 = self.sim.inventory[j];
        igrid.appendChild(self.slotEl(match(it2) ? it2 : null, self.sim.inventory, j, {
          onClick: function (item, idx) {
            self.moveStack({ it: item, list: self.sim.inventory, index: idx }, self.sim.chest);
            render();
          }
        }));
      }
    }
    render();
    this.openPanel('Rương', body);
    this.refreshPanel = render;
  };

  // ---- machine -----------------------------------------------------------
  UI.prototype.openMachine = function (o) {
    var self = this;
    var mname = o.machine || 'Furnace';
    var def = this.game.data.machines.filter(function (m) { return m.name === mname; })[0];
    var body = el('div', 'sdv-body');
    if (o.ready && o.output) {
      var b = el('button', 'sdv-mbtn', '✅ Lấy ' + o.output);
      b.addEventListener('click', function () {
        if (!self.sim.give(o.output, 1)) return self.game.toast('Túi đầy');
        self.game.toast('Nhận ' + o.output);
        o.ready = false; o.output = null; self.close();
      });
      body.appendChild(b);
    } else if (o.busyUntil != null) {
      body.appendChild(el('div', 'sdv-sub', 'Đang chế biến… xong sau khi ngủ dậy'));
    } else if (def && def.recipes.length) {
      var list = el('div', 'sdv-menu');
      def.recipes.forEach(function (r) {
        var ok = r['in'].every(function (i) { return self.sim.count(i.item) >= i.qty; });
        var b2 = el('button', 'sdv-mbtn' + (ok ? '' : ' sdv-off'));
        b2.appendChild(el('span', null, r.out));
        b2.appendChild(el('small', 'sdv-cost',
          r['in'].map(function (i) { return i.item + ' ×' + i.qty; }).join(', ')
          + (r.mins ? ' · ' + r.mins + ' phút' : '')));
        b2.addEventListener('click', function () {
          if (!ok) return self.game.toast('Thiếu nguyên liệu');
          r['in'].forEach(function (i) { self.sim.take(i.item, i.qty); });
          o.busyUntil = r.mins || 600;
          o.output = r.out;
          self.game.toast('Đã cho vào ' + mname);
          self.close();
        });
        list.appendChild(b2);
      });
      body.appendChild(list);
    } else {
      body.appendChild(el('div', 'sdv-sub', 'Chưa có công thức cho máy này.'));
    }
    this.openPanel(mname, body);
  };

  // ---- shop --------------------------------------------------------------
  /* Does a shop row's condition hold today? The data carries the game's own
   * condition strings; anything we do not understand is allowed through rather
   * than hidden, so a parser gap never empties a shop. */
  UI.prototype.shopRowAvailable = function (when) {
    if (!when) return true;
    var s = this.sim;
    var txt = String(when);
    var ok = true;
    txt.split(',').forEach(function (clause) {
      var t = clause.trim();
      if (!t) return;
      var m;
      if ((m = t.match(/^SEASON\s+(.+)$/i))) {
        var want = m[1].toLowerCase().split(/\s+/);
        if (want.indexOf(s.season().toLowerCase()) < 0) ok = false;
      } else if ((m = t.match(/^YEAR\s+(\d+)/i))) {
        if (s.year < parseInt(m[1], 10)) ok = false;
      } else if ((m = t.match(/^DAYS_PLAYED\s+(\d+)/i))) {
        if (s.dayIndex() + 1 < parseInt(m[1], 10)) ok = false;
      } else if ((m = t.match(/^DAY_OF_WEEK\s+(.+)$/i))) {
        var map = { sunday: 'CN', monday: 'T2', tuesday: 'T3', wednesday: 'T4',
                    thursday: 'T5', friday: 'T6', saturday: 'T7' };
        var days = m[1].toLowerCase().split(/\s+/).map(function (d) { return map[d]; });
        if (days.indexOf(s.dayOfWeek()) < 0) ok = false;
      }
    });
    return ok;
  };

  /* Seeds are the whole economy, and the extracted shop tables list almost
   * none of them - 45 of 50 crops had no purchasable seed anywhere, so the
   * core loop (buy -> grow -> sell -> buy more) could not start. Pierre and
   * JojaMart stock this season's seeds, priced from the crop table. */
  UI.prototype.seasonalSeedRows = function (stockKey) {
    var s = this.sim;
    if (!/Pierre|Joja/i.test(stockKey || '')) return [];
    var markup = /Joja/i.test(stockKey) ? 1.25 : 1;   // Joja charges more
    var season = s.season();
    var rows = [];
    (this.game.data.crops || []).forEach(function (c) {
      if (!c.seed || !c.seedPrice || c.seedPrice <= 0) return;
      if (!c.seasons || c.seasons.indexOf(season) < 0) return;
      if (/Ancient|Rare|Qi /i.test(c.seed)) return;    // those stay special
      rows.push({ item: c.seed, price: Math.round(c.seedPrice * markup),
                  when: '', seed: true });
    });
    return rows;
  };

  UI.prototype.openShop = function (stockKey, keeper) {
    var self = this;
    var raw = (this.game.data.shops[stockKey] || []);
    var stock = this.seasonalSeedRows(stockKey).concat(raw)
      .filter(function (r) { return self.shopRowAvailable(r.when); })
      .map(function (r) {
        /* WHY: several shop rows were priced BELOW what the bin pays for the
         * same item (Pizza 150 -> 300), which is an infinite money press with
         * unlimited stock. Nothing may be bought for less than it sells for. */
        var sell = self.sim.sellPrice(r.item, 0);
        var price = r.price;
        if (sell && price < sell * 1.2) price = Math.ceil(sell * 1.2);
        return { item: r.item, price: price, when: r.when, seed: r.seed };
      })
      .slice(0, 140);
    var body = el('div', 'sdv-body');
    var sell = el('div', 'sdv-drop', 'Chạm món trong túi rồi chạm vào đây để BÁN');
    /* WHY a click handler too: HTML5 drag-and-drop never fires on touch, so on
     * a phone there was no way at all to sell to a shopkeeper. The shipping bin
     * and the gift slot both accept tap-then-tap; this now matches them. */
    function doSell() {
      if (!self.dragging) return self.game.toast('Chạm một món trong túi trước');
      var d = self.dragging;
      var info = self.sim.itemInfo(d.it.name);
      self.dragging = null;
      // an item with no price used to be swallowed for 0 gold
      if (!info || !info.sell) return self.game.toast('Món này không bán được');
      var price = self.sim.sellPrice(d.it.name, d.it.quality) * d.it.qty;
      self.sim.gold += price;
      d.list.splice(d.index, 1);
      self.game.toast('Bán được ' + price + 'g');
      self.updateHud();
      self.openShop(stockKey, keeper);
    }
    sell.addEventListener('dragover', function (e) { e.preventDefault(); });
    sell.addEventListener('drop', function (e) { e.preventDefault(); doSell(); });
    sell.addEventListener('click', doSell);
    body.appendChild(sell);
    var list = el('div', 'sdv-list');
    stock.forEach(function (s) {
      var row = el('div', 'sdv-row sdv-buy');
      var info = self.sim.itemInfo(s.item);
      row.appendChild(icon(s.item, info ? info.cat : 'seed', 26));
      row.appendChild(el('span', 'sdv-name', s.item));
      row.appendChild(el('span', 'sdv-price', s.price + 'g'));
      row.addEventListener('click', function () {
        if (self.sim.gold < s.price) return self.game.toast('Không đủ tiền');
        /* Ask give() rather than counting slots: a full bag can still absorb
         * an item that stacks onto something already in it. */
        if (!self.sim.give(s.item, 1)) return self.game.toast('Túi đầy');
        self.sim.gold -= s.price;
        self.game.toast('Mua ' + s.item);
        self.updateHud();
      });
      list.appendChild(row);
    });
    body.appendChild(list);
    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < this.sim.invSize; i++) {
      grid.appendChild(this.slotEl(this.sim.inventory[i], this.sim.inventory, i, {
        onClick: function (it, idx) {
          self.dragging = { it: it, list: self.sim.inventory, index: idx };
          self.game.toast('Đã chọn ' + it.name + ' — chạm ô bán ở trên');
        }
      }));
    }
    body.appendChild(el('div', 'sdv-sub', 'Túi đồ — chạm một món rồi chạm ô bán'));
    body.appendChild(grid);
    this.openPanel(keeper || 'Cửa hàng', body);
  };

  // ---- villager ----------------------------------------------------------
  /* The villager panel.
   *
   * WHY it was rebuilt: the owner played it and came away not knowing whether
   * presents were even a thing - "không biết có tặng quà để tăng thiện cảm được
   * không". The old panel showed ten empty hearts, a line of dialogue and a
   * grey drop-box, and never said what a gift does, what this person likes, or
   * how many gifts are left this week. All four are on the panel now.
   */
  UI.prototype.openNpc = function (npc) {
    var self = this;
    var v = npc.data;
    var s = this.sim;
    var body = el('div', 'sdv-body');
    var hearts = s.hearts(npc.name);
    var f = s.friend(npc.name);
    var cap = s.friendCap(npc.name) / 250;

    var head = el('div', 'sdv-npchead');
    head.appendChild(el('div', 'sdv-hearts',
      '❤️'.repeat(hearts) + '🤍'.repeat(Math.max(0, 10 - hearts))));
    head.appendChild(el('div', 'sdv-sub',
      'Thân thiết ' + hearts + '/' + cap + ' tim'
      + (cap < 10 ? ' (cần bó hoa để đi tiếp)' : '')));
    if (v.birthday) {
      var isB = s.isBirthday(npc.name);
      head.appendChild(el('div', 'sdv-sub',
        'Sinh nhật: ' + (SIM.SEASON_VN[v.birthday.season] || v.birthday.season)
        + ' ' + v.birthday.day + (isB ? '  🎂 HÔM NAY! Quà hôm nay ăn 8 lần điểm' : '')));
    }
    body.appendChild(head);

    var said = s.talkTo(npc.name);
    var pool = (v.lines && (v.lines.Regular || v.lines.Events)) || [];
    var line = pool.length ? pool[Math.floor(Math.random() * pool.length)].line : '...';
    body.appendChild(el('div', 'sdv-speech', line));
    body.appendChild(el('div', 'sdv-sub',
      said ? '💬 Nói chuyện hôm nay: +20 thân thiết'
           : '💬 Hôm nay đã nói chuyện rồi (mỗi ngày một lần)'));

    /* What a gift is worth, said in plain numbers, plus how many are left.
     * Two a week is the original's rule and the panel now shows the count. */
    var left = Math.max(0, 2 - (f.week || 0));
    var giftedToday = f.giftDay === s.dayIndex();
    body.appendChild(el('div', 'sdv-giftinfo',
      '🎁 Tặng quà: món họ THÍCH +45, RẤT THÍCH +80, ghét thì trừ điểm. '
      + 'Mỗi tuần tặng được 2 món.'));
    body.appendChild(el('div', 'sdv-sub',
      giftedToday ? 'Hôm nay đã tặng rồi — mai quay lại.'
                  : 'Tuần này còn ' + left + ' lượt tặng.'));

    /* Their tastes, straight out of the game's own gift table. Showing them is
     * a deliberate departure from the original, which makes you learn by
     * trial: on a phone, with no wiki open, hidden tastes just mean nobody
     * ever gives anyone anything. */
    var taste = v.gifts || {};
    function tasteRow(label, list, cls) {
      if (!list || !list.length) return;
      var row = el('div', 'sdv-tasterow ' + (cls || ''));
      row.appendChild(el('span', 'sdv-tastelabel', label));
      row.appendChild(el('span', null, list.slice(0, 6).join(', ')));
      body.appendChild(row);
    }
    tasteRow('Rất thích', taste.love, 'love');
    tasteRow('Thích', taste.like, 'like');
    tasteRow('Ghét', taste.hate, 'hate');

    var giftWrap = el('div', 'sdv-giftwrap');
    var slot = el('div', 'sdv-drop sdv-giftslot',
                  '🎁 Chạm một món bên dưới để tặng');
    slot.addEventListener('dragover', function (e) { e.preventDefault(); });
    slot.addEventListener('drop', function (e) { e.preventDefault(); self.doGift(npc); });
    giftWrap.appendChild(slot);
    body.appendChild(giftWrap);

    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < s.invSize; i++) {
      grid.appendChild(this.slotEl(s.inventory[i], s.inventory, i, {
        onClick: function (it, idx) {
          self.dragging = { it: it, list: s.inventory, index: idx };
          self.doGift(npc);
        }
      }));
    }
    body.appendChild(grid);

    /* Where they will be later - the schedule is real now, so it is worth
     * telling the player where to find someone. */
    var NPCM = global.SDV_NPC;
    if (NPCM && npc.real && npc.real.sched) {
      var blk = NPCM.scheduleFor(npc, s);
      if (blk && blk.steps && blk.steps.length) {
        var names = global.SDV_WORLD.AREA_NAME_VN || {};
        var route = blk.steps.filter(function (st) { return st.m; })
          .slice(0, 4).map(function (st) {
            var ar = NPCM.areaOf(st.m);
            return Math.floor(st.t / 100) + 'h → ' + (names[ar] || st.m);
          }).join('  ·  ');
        if (route) body.appendChild(el('div', 'sdv-sub', 'Lịch hôm nay: ' + route));
      }
    }
    this.openPanel(npc.name, body);
  };

  UI.prototype.doGift = function (npc) {
    if (!this.dragging) return;
    var d = this.dragging;
    var res = this.sim.giveGift(npc.name, d.it.name);
    this.dragging = null;
    if (res.refused === 'day') return this.game.toast('Hôm nay đã tặng rồi');
    if (res.refused === 'week') return this.game.toast('Tuần này đã tặng đủ 2 món');
    if (res.refused === 'missing') return this.game.toast('Không còn món đó trong túi');
    d.it.qty--;
    if (d.it.qty <= 0) d.list.splice(d.index, 1);
    var msg = { love: 'rất thích!', like: 'thích', neutral: 'bình thường',
                dislike: 'không thích', hate: 'ghét' }[res.taste];
    this.game.toast(npc.name + ' ' + msg + ' (' + (res.points > 0 ? '+' : '') + res.points + ')');
    this.openNpc(npc);
  };

  // ---- bundles -----------------------------------------------------------
  UI.prototype.openBundles = function (room) {
    var self = this;
    var body = el('div', 'sdv-body');
    var list = this.game.data.bundles.filter(function (b) { return b.room === room; });
    list.forEach(function (b) {
      var box = el('div', 'sdv-bundle');
      box.appendChild(el('h4', null, b.name + (self.sim.bundlesDone[b.name] ? ' ✅' : '')));
      if (b.gold) {
        box.appendChild(el('div', 'sdv-sub', 'Cần ' + b.gold.toLocaleString('vi-VN') + 'g'));
      }
      var items = el('div', 'sdv-brow');
      b.items.forEach(function (i) {
        var have = self.sim.count(i.item) >= i.qty;
        var chip = el('div', 'sdv-chip' + (have ? ' ok' : ''), i.item + (i.qty > 1 ? ' ×' + i.qty : ''));
        items.appendChild(chip);
      });
      box.appendChild(items);
      if (b.reward) box.appendChild(el('div', 'sdv-sub', 'Thưởng: ' + b.reward));
      var btn = el('button', 'sdv-mbtn', 'Nộp bundle');
      btn.addEventListener('click', function () {
        if (self.sim.bundlesDone[b.name]) {
          return self.game.toast('Bundle này đã nộp xong rồi');
        }
        if (b.gold) {
          if (self.sim.gold < b.gold) return self.game.toast('Không đủ tiền');
          self.sim.gold -= b.gold;
        } else {
          var ok = b.items.every(function (i) { return self.sim.count(i.item) >= i.qty; });
          if (!ok) return self.game.toast('Chưa đủ vật phẩm');
          b.items.forEach(function (i) { self.sim.take(i.item, i.qty); });
        }
        self.sim.bundlesDone[b.name] = true;
        self.game.toast('Hoàn thành ' + b.name + '!');
        self.openBundles(room);
      });
      box.appendChild(btn);
      body.appendChild(box);
    });
    this.openPanel(room, body);
  };

  // ---- craft -------------------------------------------------------------
  UI.prototype.openCraft = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    var search = el('input', 'sdv-search');
    search.placeholder = 'Tìm công thức…';
    body.appendChild(search);
    var list = el('div', 'sdv-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      var q = search.value.toLowerCase();
      self.game.data.recipes.crafting
        .filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0; })
        .slice(0, 80)
        .forEach(function (r) {
          var ok = r['in'].length && r['in'].every(function (i) {
            return self.sim.count(i.item) >= i.qty;
          });
          var row = el('div', 'sdv-row sdv-buy' + (ok ? '' : ' sdv-off'));
          row.appendChild(icon(r.name, 'crafted', 26));
          var col = el('div', 'sdv-col');
          col.appendChild(el('span', 'sdv-name', r.name));
          col.appendChild(el('small', 'sdv-cost', r['in'].map(function (i) {
            return i.item + ' ' + self.sim.count(i.item) + '/' + i.qty;
          }).join(' · ')));
          row.appendChild(col);
          row.addEventListener('click', function () {
            if (!ok) return self.game.toast('Chưa đủ nguyên liệu');
            if (!self.sim.hasSpace()) return self.game.toast('Túi đầy');
            r['in'].forEach(function (i) { self.sim.take(i.item, i.qty); });
            self.sim.give(r.name, 1);
            self.game.toast('Chế tạo ' + r.name);
            render();
          });
          list.appendChild(row);
        });
    }
    search.addEventListener('input', render);
    render();
    this.openPanel('Chế tạo', body);
  };

  /* One place to reach both kinds of making: items, and the machines that
   * have to be crafted before they can be placed. */
  UI.prototype.openCraftHub = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    var a = el('button', 'sdv-mbtn', '🔧 Chế tạo vật phẩm');
    a.addEventListener('click', function () { self.openCraft(); });
    var b = el('button', 'sdv-mbtn', '⚙️ Xem máy móc trên nông trại');
    b.addEventListener('click', function () { self.openMachineList(); });
    var c = el('button', 'sdv-mbtn', '🍳 Nấu ăn');
    c.addEventListener('click', function () { self.openKitchen(); });
    body.appendChild(a); body.appendChild(b); body.appendChild(c);
    this.openPanel('Chế tạo', body);
  };

  // ---- tv / sleep --------------------------------------------------------
  UI.prototype.openTv = function () {
    var s = this.sim;
    var body = el('div', 'sdv-body');
    var wx = { sun: 'nắng', rain: 'mưa', storm: 'bão', snow: 'tuyết', wind: 'gió' };
    body.appendChild(el('div', 'sdv-speech',
      'Dự báo: mai trời ' + (wx[s.tomorrowWeather] || 'nắng') + '.'));
    body.appendChild(el('div', 'sdv-speech', 'Vận may hôm nay: ' + s.luckText() + '.'));
    this.openPanel('Tivi', body);
  };

  UI.prototype.confirmSleep = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub', 'Đi ngủ để sang ngày mới?'));
    var b = el('button', 'sdv-mbtn', '🛏 Ngủ');
    b.addEventListener('click', function () { self.close(); self.game.sleep(false); });
    body.appendChild(b);
    this.openPanel('Giường', body);
  };

  UI.prototype.showDayReport = function (report, collapsed) {
    var self = this;
    var body = el('div', 'sdv-body');
    if (collapsed) body.appendChild(el('div', 'sdv-sub', '😵 Bạn đã ngất vì thức quá khuya.'));
    body.appendChild(el('div', 'sdv-big', '+' + report.earned.toLocaleString('vi-VN') + 'g'));
    if (report.items.length) {
      var list = el('div', 'sdv-list');
      report.items.forEach(function (i) {
        list.appendChild(el('div', 'sdv-row', i.name + ' ×' + i.qty));
      });
      body.appendChild(list);
    } else {
      body.appendChild(el('div', 'sdv-sub', 'Không bán gì hôm qua.'));
    }
    body.appendChild(el('div', 'sdv-sub',
      'Cây lớn thêm: ' + report.grew + (report.died ? ' · chết: ' + report.died : '')));
    body.appendChild(el('div', 'sdv-sub', 'Vận may: ' + this.sim.luckText()));
    var b = el('button', 'sdv-mbtn', 'Bắt đầu ngày mới');
    b.addEventListener('click', function () { self.close(); });
    body.appendChild(b);
    this.openPanel(this.sim.seasonVN() + ' ' + this.sim.day + ' · Năm ' + this.sim.year, body);
  };

  // ---- fishing -----------------------------------------------------------
  /* Two things the first version got wrong, both reported by the player:
   *  - the bite window was 1.4s and announced in small text, so a tap that
   *    felt instant had already missed it. It is now 3.2s, the whole panel
   *    flashes, and the prompt is the biggest thing on screen.
   *  - the catch minigame only understood HOLD. A tap moved the bar by one
   *    frame of acceleration, which reads as "the controls do nothing". A tap
   *    now gives a real upward kick, and holding still lifts continuously.
   * Both listen on the window, so a touch anywhere counts. */
  UI.prototype.openFishing = function () {
    var self = this, g = this.game, sim = this.sim;
    if (sim.exhausted) return g.toast('Kiệt sức, không quăng cần được');
    var pool = this.fishPool();
    if (!pool.length) return g.toast('Chỗ này giờ không có cá');
    var target = pool[Math.floor(Math.random() * pool.length)];
    /* A legendary is a once-in-a-while event, not a 1-in-12 cast. */
    var legends = this.game.data.fish.filter(function (f) {
      return (f.kind === 'legendary')
        && f.locations && f.locations.indexOf(g.world.current) >= 0
        && (!f.seasons.length || f.seasons.indexOf(sim.season()) >= 0)
        && sim.skills.fishing >= 6
        && !(sim.caughtLegend || {})[f.name];
    });
    if (legends.length && Math.random() < 0.02) {
      target = legends[Math.floor(Math.random() * legends.length)];
      target._legend = true;
    }
    sim.spend(4);

    var body = el('div', 'sdv-body sdv-fish');
    var wait = el('div', 'sdv-castmsg', 'Đang chờ cá cắn câu…');
    body.appendChild(wait);
    body.appendChild(el('div', 'sdv-hint',
      'Khi chữ đỏ hiện lên thì chạm vào màn hình để giật cần.'));
    var p = this.openPanel('Câu cá', body);
    var st = { phase: 'wait' };
    var biteAt = 600 + Math.random() * 3600;

    function cleanup() {
      window.removeEventListener('pointerdown', hook, true);
      window.removeEventListener('touchstart', hook, true);
    }
    function hook(ev) {
      if (st.phase !== 'bite') return;
      if (ev && ev.cancelable) ev.preventDefault();
      if (ev) ev.stopPropagation();
      st.phase = 'game';
      clearTimeout(st.escape);
      cleanup();
      self.fishMinigame(p, body, target);
    }
    st.cleanup = cleanup;

    st.timer = setTimeout(function () {
      if (!self.panel || self.panel !== p) return;
      st.phase = 'bite';
      wait.textContent = '❗ CÁ CẮN CÂU — CHẠM NGAY!';
      wait.classList.add('sdv-bite');
      p.classList.add('sdv-flash');
      window.addEventListener('pointerdown', hook, true);
      window.addEventListener('touchstart', hook, true);
      st.escape = setTimeout(function () {
        if (st.phase !== 'bite') return;
        cleanup();
        self.close();
        g.toast('Chậm tay, cá thoát mất');
      }, 3200);
    }, biteAt);

    this._fishState = st;
  };

  UI.prototype.fishPool = function () {
    var sim = this.sim, area = this.game.world.current;
    return this.game.data.fish.filter(function (f) {
      if (f.kind === 'crab_pot') return false;
      if (f.seasons && f.seasons.length
          && f.seasons.indexOf(sim.season()) < 0) return false;
      /* Location now comes from the game's own Locations.json, so it names our
       * area ids directly - no more guessing from prose. */
      /* WHY an empty list is now a refusal: five fish ship with no location
       * at all (Void Salmon, Stingray, and the mine-only Stonefish / Ice Pip /
       * Lava Eel), and "no restriction" made them catchable in every puddle in
       * the valley from day one. */
      if (!f.locations || !f.locations.length) return false;
      /* The game's own tables also use two generic waters - "ocean" and
       * "freshwater" - which map to several of our areas. Without this the
       * farm pond had no fish at all and the sea lost seven species. */
      var ok = f.locations.indexOf(area) >= 0;
      if (!ok && f.locations.indexOf('ocean') >= 0) {
        ok = (area === 'beach' || area === 'island' || area === 'islandwest');
      }
      if (!ok && f.locations.indexOf('freshwater') >= 0) {
        ok = (area === 'town' || area === 'forest' || area === 'mountain'
              || area === 'farm');
      }
      // the farm pond runs on the valley's ordinary river stock
      if (!ok && area === 'farm') {
        ok = f.locations.indexOf('forest') >= 0 || f.locations.indexOf('town') >= 0;
      }
      if (!ok) return false;
      // legendaries are not ordinary stock; they get their own rare roll below
      if (f.kind === 'legendary' || f.kind === 'legendary_family') return false;
      if (f.kind === 'night_market' && !(sim.season() === 'Winter'
          && sim.day >= 15 && sim.day <= 17)) return false;
      if (f.weather && f.weather.length) {
        var wet = sim.weather === 'rain' || sim.weather === 'storm';
        if (f.weather.indexOf(wet ? 'rain' : 'sun') < 0) return false;
      }
      if (f.windows && f.windows.length && !f.windows.some(function (w) {
        return sim.time >= w[0] && sim.time <= Math.max(w[1], w[0] + 60);
      })) return false;
      if (f.minLevel && sim.skills.fishing < f.minLevel) return false;
      return true;
    });
  };

  /* Keep the lit band over the fish until the meter fills.
   * Band height follows the game's rule: 96px at level 0, +8 per level. */
  UI.prototype.fishMinigame = function (panel, body, fish) {
    var self = this, sim = this.sim, g = this.game;
    panel.classList.remove('sdv-flash');
    body.innerHTML = '';
    body.appendChild(el('div', 'sdv-castmsg', fish.name));
    body.appendChild(el('div', 'sdv-sub',
      'CHẠM để nảy lên · GIỮ để kéo lên đều. Giữ ô sáng trùm con cá.'));
    var track = el('div', 'sdv-track');
    var bar = el('div', 'sdv-fbar');
    var mark = el('div', 'sdv-fmark');
    var prog = el('div', 'sdv-fprog');
    var progFill = el('i');
    prog.appendChild(progFill);
    track.appendChild(bar);
    track.appendChild(mark);
    body.appendChild(track);
    body.appendChild(prog);
    body.appendChild(el('div', 'sdv-fishpad', '👆 CHẠM hoặc GIỮ'));

    var H = 260;
    var barH = Math.min(H - 20, (96 + sim.skills.fishing * 8) / 568 * H);
    bar.style.height = barH + 'px';
    var barY = (H - barH) / 2, barV = 0, held = false;
    var fy = H * 0.5, fv = 0, progress = 0.4;
    var diff = Math.max(15, fish.difficulty || 50);
    var behavior = String(fish.behavior || 'mixed').toLowerCase();
    var last = performance.now(), t0 = last, timer, over = false;

    function down(ev) {
      held = true;
      // a tap is a kick, not merely the start of a hold - this is the bit that
      // made the controls feel dead
      /* Measured: the old kick was worth about 1.6px against a gravity of
       * 0.62/frame, so a single tap read as no response at all. */
      barV = Math.min(barV, 0) - 9;
      if (ev && ev.cancelable) ev.preventDefault();
    }
    function up() { held = false; }
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('touchstart', down, { capture: true, passive: false });
    window.addEventListener('touchend', up, true);

    function stop() {
      if (over) return;
      over = true;
      clearInterval(timer);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('touchstart', down, true);
      window.removeEventListener('touchend', up, true);
    }
    this._fishStop = stop;

    timer = setInterval(function () {
      var now = performance.now();
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      var k = dt * 60;

      barV += (held ? -0.85 : 0.62) * k;
      barV *= Math.pow(0.87, k);
      barY += barV * k;
      if (barY < 0) { barY = 0; barV = 0; }
      if (barY > H - barH) { barY = H - barH; barV = 0; }

      var jump = behavior === 'dart' ? 0.16 : behavior === 'floater' ? 0.05 : 0.09;
      if (Math.random() < jump * k) fv = (Math.random() - 0.5) * diff * 0.9;
      fv *= Math.pow(0.92, k);
      fy += fv * dt;
      if (fy < 0) { fy = 0; fv = -fv; }
      if (fy > H - 16) { fy = H - 16; fv = -fv; }

      var inside = fy + 8 >= barY && fy + 8 <= barY + barH;
      progress += (inside ? 0.011 : -0.0085) * k;
      progress = Math.max(0, Math.min(1, progress));

      bar.style.top = barY + 'px';
      mark.style.top = fy + 'px';
      progFill.style.width = (progress * 100) + '%';
      progFill.style.background = inside
        ? 'linear-gradient(90deg,#8fd44a,#4e9c2e)'
        : 'linear-gradient(90deg,#e8a13c,#c0453b)';

      if (progress >= 1) finish(true);
      else if (progress <= 0) finish(false);
      else if (now - t0 > 60000) finish(false);
    }, 16);

    function finish(win) {
      stop();
      if (win) {
        var q = sim.rollQuality(0);
        if (sim.give(fish.name, 1, q)) {
          if (fish._legend) {
            sim.caughtLegend = sim.caughtLegend || {};
            sim.caughtLegend[fish.name] = true;   // one of each, ever
          }
          var xp = Math.max(5, Math.round((fish.difficulty || 20) / 2));
          var lvl = sim.addXp('fishing', xp);
          g.toast('Câu được ' + fish.name + '!');
          if (lvl) g.toast('Câu cá lên cấp ' + lvl + '!');
        } else g.toast('Túi đầy!');
      } else {
        g.toast('Cá sổng mất');
      }
      self.close();
    }
  };

  global.SDV_UI = { UI: UI, el: el, icon: icon };
})(window);
