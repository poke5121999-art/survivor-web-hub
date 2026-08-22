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
    this.craftBtn.addEventListener('click', function () { self.openCraft(); });
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
        var gain = self.sim.eat(idx);
        if (gain) self.game.toast('+' + gain + ' sức lực');
      });
      self.quick.appendChild(b);
    });
  };

  // ------------------------------------------------------------------ panels
  UI.prototype.close = function () {
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
    // dropping outside the panel drops the item on the ground
    p.addEventListener('dragover', function (e) { e.preventDefault(); });
    this.layer.addEventListener('drop', function onDrop(e) {
      if (!self.dragging) return;
      if (p.contains(e.target)) return;
      self.dropOnGround(self.dragging);
      self.dragging = null;
      self.refreshPanel();
    });
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
    var wbtn = el('button', 'sdv-mbtn', '💧 Tưới nước');
    wbtn.addEventListener('click', function () {
      if (self.sim.energy <= 0) return self.game.toast('Hết sức');
      self.sim.spend(2);
      a.set(x, y, 'watered');
      var c = g.world.objAt(x, y);
      if (c && c.kind === 'crop') c.watered = true;
      self.close();
    });
    list.appendChild(wbtn);
    var fbtn = el('button', 'sdv-mbtn', '🧪 Bón phân');
    fbtn.addEventListener('click', function () {
      if (!self.sim.take('Basic Fertilizer', 1)) return self.game.toast('Không có phân bón');
      var c = g.world.objAt(x, y);
      if (c) c.fert = 1;
      self.close();
    });
    list.appendChild(fbtn);
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
    a.objs.push({
      x: x, y: y, kind: 'crop', crop: def.name, stage: 0, days: 0,
      stageDays: stageDays, maxStage: stageDays.length,
      growth: def.growth || stageDays.reduce(function (s2, d) { return s2 + d; }, 0),
      regrow: def.regrow || null, regrowLeft: 0, harvested: false,
      seasons: def.seasons, watered: false, fert: 0
    });
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
        self.close();
      });
      list.appendChild(w);
    }
    var d = el('button', 'sdv-mbtn', '🗑 Nhổ bỏ');
    d.addEventListener('click', function () { g.world.removeObj(o); self.close(); });
    list.appendChild(d);
    body.appendChild(list);
    this.openPanel(o.crop, body);
  };

  UI.prototype.harvest = function (o) {
    var g = this.game, def = g.cropDef(o.crop);
    var q = this.sim.rollQuality(o.fert || 0);
    if (!this.sim.give(o.crop, 1, q)) { g.toast('Túi đầy!'); return; }
    var lvl = this.sim.addXp('farming', Math.round(6 + (def && def.sell ? def.sell / 8 : 2)));
    if (lvl) g.toast('Nông nghiệp lên cấp ' + lvl + '!');
    var qn = ['', ' (bạc)', ' (vàng)', ' (iridium)'][q];
    g.toast('Thu hoạch ' + o.crop + qn);
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
      { label: '🔥 Lò nung', cost: { Stone: 25, 'Copper Ore': 20 }, act: function () { a.objs.push({ x: x, y: y, kind: 'machine', machine: 'Furnace' }); } },
      { label: '🍯 Hũ ngâm', cost: { Wood: 50, Stone: 40, Coal: 8 }, act: function () { a.objs.push({ x: x, y: y, kind: 'machine', machine: 'Preserves Jar' }); } },
      { label: '🍷 Thùng ủ rượu', cost: { Wood: 30, 'Copper Bar': 1, 'Iron Bar': 1 }, act: function () { a.objs.push({ x: x, y: y, kind: 'machine', machine: 'Keg' }); } },
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
  UI.prototype.openShop = function (stockKey, keeper) {
    var self = this;
    var stock = (this.game.data.shops[stockKey] || []).slice(0, 120);
    var body = el('div', 'sdv-body');
    var sell = el('div', 'sdv-drop', 'Kéo vào đây để BÁN ngay');
    sell.addEventListener('dragover', function (e) { e.preventDefault(); });
    sell.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!self.dragging) return;
      var d = self.dragging;
      var price = self.sim.sellPrice(d.it.name, d.it.quality) * d.it.qty;
      self.sim.gold += price;
      d.list.splice(d.index, 1);
      self.dragging = null;
      self.game.toast('Bán được ' + price + 'g');
      self.openShop(stockKey, keeper);
    });
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
        if (!self.sim.hasSpace()) return self.game.toast('Túi đầy');
        self.sim.gold -= s.price;
        self.sim.give(s.item, 1);
        self.game.toast('Mua ' + s.item);
        self.updateHud();
      });
      list.appendChild(row);
    });
    body.appendChild(list);
    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < this.sim.invSize; i++) {
      grid.appendChild(this.slotEl(this.sim.inventory[i], this.sim.inventory, i, {}));
    }
    body.appendChild(el('div', 'sdv-sub', 'Túi đồ — kéo lên ô bán ở trên'));
    body.appendChild(grid);
    this.openPanel(keeper || 'Cửa hàng', body);
  };

  // ---- villager ----------------------------------------------------------
  UI.prototype.openNpc = function (npc) {
    var self = this;
    var v = npc.data;
    var body = el('div', 'sdv-body');
    var hearts = this.sim.hearts(npc.name);
    var head = el('div', 'sdv-npchead');
    head.appendChild(el('div', 'sdv-hearts',
      '❤️'.repeat(hearts) + '🤍'.repeat(Math.max(0, 10 - hearts))));
    if (v.birthday) {
      var isB = this.sim.isBirthday(npc.name);
      head.appendChild(el('div', 'sdv-sub',
        'Sinh nhật: ' + SIM.SEASON_VN[v.birthday.season] + ' ' + v.birthday.day
        + (isB ? '  🎂 HÔM NAY!' : '')));
    }
    body.appendChild(head);

    var said = this.sim.talkTo(npc.name);
    var pool = (v.lines && (v.lines.Regular || v.lines.Events)) || [];
    var line = pool.length ? pool[Math.floor(Math.random() * pool.length)].line : '...';
    body.appendChild(el('div', 'sdv-speech', line));
    if (said) body.appendChild(el('div', 'sdv-sub', '+20 thân thiết'));

    var giftWrap = el('div', 'sdv-giftwrap');
    var slot = el('div', 'sdv-drop sdv-giftslot', '🎁<br><small>Kéo quà vào đây</small>');
    slot.addEventListener('dragover', function (e) { e.preventDefault(); });
    slot.addEventListener('drop', function (e) { e.preventDefault(); self.doGift(npc); });
    slot.addEventListener('click', function () { self.doGift(npc); });
    giftWrap.appendChild(slot);
    body.appendChild(giftWrap);

    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < this.sim.invSize; i++) {
      grid.appendChild(this.slotEl(this.sim.inventory[i], this.sim.inventory, i, {
        onClick: function (it, idx) { self.dragging = { it: it, list: self.sim.inventory, index: idx }; self.doGift(npc); }
      }));
    }
    body.appendChild(el('div', 'sdv-sub', 'Chạm một món để tặng'));
    body.appendChild(grid);
    this.openPanel(npc.name, body);
  };

  UI.prototype.doGift = function (npc) {
    if (!this.dragging) return;
    var d = this.dragging;
    var res = this.sim.giveGift(npc.name, d.it.name);
    this.dragging = null;
    if (res.refused === 'day') return this.game.toast('Hôm nay đã tặng rồi');
    if (res.refused === 'week') return this.game.toast('Tuần này đã tặng đủ 2 món');
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
        if (self.sim.bundlesDone[b.name]) return;
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
  UI.prototype.openFishing = function () {
    var self = this, g = this.game, sim = this.sim;
    if (sim.exhausted) return g.toast('Kiệt sức, không quăng cần được');
    var pool = this.fishPool();
    if (!pool.length) return g.toast('Chỗ này giờ không có cá');
    var target = pool[Math.floor(Math.random() * pool.length)];
    sim.spend(4);

    var body = el('div', 'sdv-body sdv-fish');
    var wait = el('div', 'sdv-speech', 'Đang chờ cá cắn câu…');
    body.appendChild(wait);
    var p = this.openPanel('Câu cá', body, { live: false });
    var bite = 600 + Math.random() * 4200;
    var st = { phase: 'wait' };
    setTimeout(function () {
      if (!self.panel || self.panel !== p) return;
      st.phase = 'bite';
      wait.textContent = '❗ Cá cắn câu! Chạm nhanh!';
      wait.classList.add('sdv-bite');
      var gone = setTimeout(function () {
        if (st.phase === 'bite') { self.close(); g.toast('Cá thoát mất'); }
      }, 1400);
      p.addEventListener('click', function once() {
        if (st.phase !== 'bite') return;
        clearTimeout(gone);
        st.phase = 'game';
        self.fishMinigame(p, body, target);
      });
    }, bite);
  };

  UI.prototype.fishPool = function () {
    var sim = this.sim, area = this.game.world.current;
    var locMap = { beach: /ocean|beach/i, mountain: /mountain lake|lake/i,
                   town: /river|town/i, forest: /river|forest|pond/i,
                   farm: /pond|farm/i, mine: /mine/i };
    var re = locMap[area] || /./;
    return this.game.data.fish.filter(function (f) {
      if (f.kind === 'crab_pot') return false;
      if (f.seasons.length && f.seasons.indexOf(sim.season()) < 0) return false;
      if (f.locations.length && !f.locations.some(function (l) { return re.test(l); })) return false;
      if (f.windows.length && !f.windows.some(function (w) {
        return sim.time >= w[0] && sim.time <= Math.max(w[1], w[0] + 60);
      })) return false;
      return true;
    });
  };

  /* Keep the marker inside the moving bar until the catch meter fills.
   * Bar height follows the wiki rule: 96px at level 0, +8 per fishing level. */
  UI.prototype.fishMinigame = function (panel, body, fish) {
    var self = this, sim = this.sim, g = this.game;
    body.innerHTML = '';
    body.appendChild(el('div', 'sdv-sub', 'Giữ ô sáng trùm lên con cá'));
    var track = el('div', 'sdv-track');
    var bar = el('div', 'sdv-fbar');
    var mark = el('div', 'sdv-fmark');
    var prog = el('div', 'sdv-fprog');
    var progFill = el('i');
    prog.appendChild(progFill);
    track.appendChild(bar); track.appendChild(mark);
    body.appendChild(track); body.appendChild(prog);
    var H = 260;
    var barH = (96 + sim.skills.fishing * 8) / 568 * H;
    bar.style.height = barH + 'px';
    var barY = H / 2, barV = 0, held = false;
    var fy = H * 0.5, fv = 0, progress = 0.35;
    var diff = fish.difficulty || 50;
    var behavior = fish.behavior || 'mixed';
    var t0 = performance.now(), timer;

    function down() { held = true; }
    function up() { held = false; }
    panel.addEventListener('touchstart', down, { passive: true });
    panel.addEventListener('touchend', up);
    panel.addEventListener('mousedown', down);
    panel.addEventListener('mouseup', up);

    timer = setInterval(function () {
      var dt = 0.03;
      barV += (held ? -0.55 : 0.42);
      barV *= 0.86;
      barY += barV;
      barY = Math.max(0, Math.min(H - barH, barY));

      var wob = behavior === 'dart' ? 0.9 : behavior === 'floater' ? 0.25 : 0.5;
      if (Math.random() < wob * 0.12) fv = (Math.random() - 0.5) * diff * 0.5;
      fv *= 0.93;
      fy += fv * dt;
      fy = Math.max(0, Math.min(H - 14, fy));

      var inside = fy + 7 >= barY && fy + 7 <= barY + barH;
      progress += inside ? 0.010 : -0.008;
      progress = Math.max(0, Math.min(1, progress));

      bar.style.top = barY + 'px';
      mark.style.top = fy + 'px';
      progFill.style.width = (progress * 100) + '%';

      if (progress >= 1) { finish(true); }
      else if (progress <= 0) { finish(false); }
      else if (performance.now() - t0 > 45000) { finish(false); }
    }, 30);

    function finish(win) {
      clearInterval(timer);
      panel.removeEventListener('mousedown', down);
      panel.removeEventListener('mouseup', up);
      if (win) {
        var q = sim.rollQuality(0);
        if (sim.give(fish.name, 1, q)) {
          var lvl = sim.addXp('fishing', fish.xp || 10);
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
