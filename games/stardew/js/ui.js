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
  /* A real drawn icon when there is one for this item, the shape version when
   * there is not.
   *
   * Only the cooking set is mapped, and that is a limit on purpose. The icon
   * files are numbered rather than named, so which picture belongs to which
   * item had to be worked out by rendering every sheet and looking at it.
   * Cooking lines up with the game table exactly and is certain; the other five
   * categories match no ordering available here, and a guess would put a
   * pumpkin on a parsnip - worse than the drawn icon it replaces. */
  var ICON_SHEET = null;
  var ICON_PENDING = [];
  function iconSheet() {
    if (ICON_SHEET === null) {
      ICON_SHEET = false;
      if (global.SDV_ICON_MAP && typeof Image !== 'undefined') {
        var im = new Image();
        im.onload = function () {
          ICON_SHEET = im;
          /* Repaint what was already drawn.
           *
           * An icon is painted ONCE into its own little canvas and then lives
           * in the page, so a sheet that arrives a moment later changes
           * nothing - every screen opened before it landed keeps the fallback
           * art for as long as it stays open. That is exactly what happened
           * the first time: the kitchen list showed eighty drawn icons and the
           * real ones never appeared. Anything mapped is remembered and redrawn
           * the instant the picture is here. */
          var q = ICON_PENDING; ICON_PENDING = [];
          for (var i = 0; i < q.length; i++) paintIcon(q[i].c, q[i].n, q[i].cat);
        };
        im.onerror = function () { ICON_SHEET = false; ICON_PENDING = []; };
        im.src = 'art/icons_cooking.png';
      }
    }
    return ICON_SHEET;
  }

  function paintIcon(c, name, cat) {
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    var M = global.SDV_ICON_MAP;
    var sheet = iconSheet();
    var idx = M && M.map ? M.map[name] : undefined;
    if (idx != null) {
      if (sheet) {
        var col = idx % M.cols, row = Math.floor(idx / M.cols);
        ctx.drawImage(sheet, col * M.cell, row * M.cell, M.cell, M.cell,
                      0, 0, c.width, c.height);
        return;
      }
      // mapped, but the picture is not here yet - draw the fallback and queue
      if (ICON_PENDING.length < 4000) ICON_PENDING.push({ c: c, n: name, cat: cat });
    }
    S.drawIcon(ctx, name, cat || 'crop', 0, 0, c.width);
  }

  function icon(name, cat, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size || 32;
    paintIcon(c, name, cat);
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
    /* WHY the toast box hangs off the stage and not off the UI layer: panels
     * are appended to that same layer AFTER this, so they painted on top and a
     * message raised while a panel was open - "Túi đầy", "Không đủ sức" - was
     * invisible behind it. It is the last child of the stage with a z-index
     * above everything, which is the only arrangement that cannot be undone by
     * something else appending later. */
    this.toastBox = el('div', 'sdv-toasts');
    this.root.appendChild(this.toastBox);
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
    /* Recipes are granted by polling rather than by hooking the places that
     * raise a skill or a heart, because those live in files this pass does not
     * own - and a poll catches every route into them, including ones added
     * later. Three quarters of a second is far below anything a player could
     * notice and costs one pass over 231 rows. */
    this._unlockTick = (this._unlockTick || 0) + 1;
    if (this._unlockTick % 45 === 0) {
      this.migrateRecipes();
      this.scanRecipeUnlocks(false);
    }
    this.game.drawMinimap(this.miniCtx, 0, 0, this.mini.width, this.mini.height);
    // toasts
    var box = this.toastBox;
    /* Toasts are reconciled per MESSAGE rather than rebuilt whenever the set
     * of texts changes. The old version wiped the box and re-created every
     * node the moment a second message arrived, which restarted the
     * rise-and-fade on the one already halfway through it - so a busy moment
     * showed several messages all jumping back down together. Each node now
     * belongs to one message and plays its animation exactly once. */
    var msgs = this.game.messages;
    for (var ti = box.children.length - 1; ti >= 0; ti--) {
      var node = box.children[ti];
      if (msgs.indexOf(node._msg) < 0) box.removeChild(node);
    }
    msgs.forEach(function (m) {
      if (m._el && m._el.parentNode === box) return;
      var n = el('div', 'sdv-toast', m.text);
      n._msg = m;
      m._el = n;
      box.appendChild(n);
    });
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
  /* HUD layout, reworked 2026-08-23.
   *
   * What was asked for: "UI phía dưới chỉ nên có joystick ... Các button khác
   * move theo kiểu menu bên góc trái". The bottom of the screen is where the
   * thumb of the hand holding the phone lives, and it was carrying four
   * buttons and, underground, a row of six more. So the bottom band now holds
   * the joystick and nothing else, and everything that is not needed in a
   * hurry moved into one small menu under the minimap.
   *
   * TWO DELIBERATE EXCEPTIONS, both about the mine:
   *
   *  - The action button (the sword underground) does NOT go into the menu.
   *    It is pressed constantly and under pressure, and a menu is three taps
   *    and a paused game away from a monster that is already hitting you. It
   *    moved OFF the bottom band - which is what was actually asked for - to
   *    the right edge just above it, where the same thumb still reaches it.
   *  - The mine's quick-use row (food, bombs, staircases) is the same
   *    argument: eating at four hearts cannot cost three taps. It moved from
   *    the bottom-left, where it sat on top of the joystick, to a vertical
   *    strip up the right edge above the action button.
   *
   * Neither exception sits in the bottom band, so "chỉ nên có joystick ở dưới
   * cùng" holds as written. Nothing overlaps the minimap, the status line, or
   * the top of the screen where a phone's notch is. */
  UI.prototype.buildButtons = function () {
    var self = this, g = this.game;

    // one menu button, top-left, clear of both the notch and the minimap
    this.menuBtn = el('button', 'sdv-btn sdv-menubtn', '☰');
    this.menuBtn.addEventListener('click', function () { self.openMenu(); });
    this.layer.appendChild(this.menuBtn);

    /* No action button. Walking up to something swings at it, and tapping
     * something within reach swings at it on purpose - which is also how the
     * original works on a phone ("Tap on items to action them"). The element is
     * still created, hidden, because the underground quick-use strip and two
     * suites position themselves relative to it. */
    var wrap = el('div', 'sdv-actions');
    this.actBtn = el('button', 'sdv-btn sdv-act', '⛏');
    this.actBtn.addEventListener('click', function () { g.useTool(); });
    wrap.appendChild(this.actBtn);
    this.layer.appendChild(wrap);

    /* One button for "do the thing in front of me", and it only exists when
     * there IS a thing in front. A permanent button had to be ignored most of
     * the time; this one answers a question the player is already asking, and
     * it names what it will do so the answer is never a guess. */
    this.handBtn = el('button', 'sdv-btn sdv-hand');
    this.handBtn.addEventListener('click', function () { self.handAct(); });
    this.layer.appendChild(this.handBtn);

    // says which seed a tap on soil will plant, and disarms it when tapped
    this.seedChip = el('button', 'sdv-seedchip');
    this.seedChip.style.display = 'none';
    this.seedChip.addEventListener('click', function () { self.armSeed(null); });
    this.layer.appendChild(this.seedChip);

    // quick-use, underground only: a vertical strip above the action button
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

  /* Everything that used to be a permanent button at the bottom of the screen.
   * One list, one tap deep, and it says what each thing is - the old row of
   * emoji told a new player nothing about what 🔨 opened. */
  UI.prototype.openMenu = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    var list = el('div', 'sdv-menu');
    [['🎒', 'Túi đồ', 'Xem và sắp xếp đồ đang mang', function () { self.openBag(); }],
     ['📊', 'Kỹ năng', 'Cấp độ, kinh nghiệm và nghề đã chọn', function () { self.openSkills(); }],
     ['🔨', 'Chế tạo & nấu ăn', 'Công thức, máy móc trên nông trại', function () { self.openCraftHub(); }],
     ['🔊', 'Âm thanh', 'Nhạc nền, tiếng thiên nhiên, tiếng động', function () { self.openSound(); }]
    ].forEach(function (row) {
      var b = el('button', 'sdv-mbtn');
      b.appendChild(el('span', null, row[0] + ' ' + row[1]));
      b.appendChild(el('small', 'sdv-cost', row[2]));
      b.addEventListener('click', function () { self.close(); row[3](); });
      list.appendChild(b);
    });
    body.appendChild(list);
    this.openPanel('Menu', body);
  };

  /* WHY this screen exists: the game has tracked five skills, levelled them
   * and handed out professions at 5 and 10 since it was built, and there was
   * nowhere at all to look at any of it - the player levelled up, saw one
   * toast go past, and could never check what they had. */
  UI.prototype.openSkills = function () {
    var self = this, s = this.sim;
    var CURVE = (global.SDV_SIM && global.SDV_SIM.SKILL_XP)
      || [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
    var PROFS = (global.SDV_PROGRESS && global.SDV_PROGRESS.PROFESSIONS) || {};
    var body = el('div', 'sdv-body');
    var rows = [['farming', 'Nông nghiệp', '🌱'], ['mining', 'Khai thác', '⛏'],
                ['foraging', 'Hái lượm', '🍄'], ['fishing', 'Câu cá', '🎣'],
                ['combat', 'Chiến đấu', '⚔️']];
    rows.forEach(function (r) {
      var key = r[0], lvl = s.skills[key] || 0, xp = s.skillXp[key] || 0;
      var box = el('div', 'sdv-skill');
      var head = el('div', 'sdv-skillhead');
      head.appendChild(el('span', 'sdv-skillname', r[2] + ' ' + r[1]));
      head.appendChild(el('span', 'sdv-skilllvl', 'Cấp ' + lvl));
      box.appendChild(head);

      /* Progress toward the NEXT level, not toward level 10: "1,240 / 2,150"
       * out of a total of 15,000 tells the player nothing about whether the
       * next one is close. */
      if (lvl >= CURVE.length) {
        box.appendChild(el('div', 'sdv-sub', 'Đã đạt cấp tối đa · ' + xp + ' kinh nghiệm'));
      } else {
        var floorXp = lvl > 0 ? CURVE[lvl - 1] : 0;
        var nextXp = CURVE[lvl];
        var pct = Math.max(0, Math.min(100,
          (xp - floorXp) / Math.max(1, nextXp - floorXp) * 100));
        var track = el('div', 'sdv-xpbar');
        var fill = el('i');
        fill.style.width = pct + '%';
        track.appendChild(fill);
        box.appendChild(track);
        box.appendChild(el('small', 'sdv-cost',
          (xp - floorXp) + ' / ' + (nextXp - floorXp)
          + ' kinh nghiệm nữa là lên cấp ' + (lvl + 1)));
      }

      // professions: what has been chosen, and what is still owed
      var got = [];
      var owed = [];
      [5, 10].forEach(function (at) {
        var opts = (PROFS[key] || {})[at] || [];
        if (!opts.length) return;
        var mine = opts.filter(function (o) { return s.professions && s.professions[o.id]; });
        if (mine.length) got.push(mine.map(function (o) { return o.id; }).join(', '));
        else if (lvl >= at) owed.push('cấp ' + at);
      });
      if (got.length) box.appendChild(el('small', 'sdv-prof', '★ ' + got.join(' · ')));
      if (owed.length) {
        box.appendChild(el('small', 'sdv-need',
          'Chưa chọn nghề ở ' + owed.join(' và ') + ' — sẽ hỏi khi ngủ dậy'));
      }
      body.appendChild(box);
    });
    body.appendChild(el('div', 'sdv-sub',
      'Kinh nghiệm lên từ việc làm: trồng và thu hoạch, đập đá, nhặt đồ rừng, '
      + 'câu cá, đánh quái.'));
    this.openPanel('Kỹ năng', body);
  };

  /* What the hand would do right now, or null when it would do nothing.
   * Deliberately reads the SAME `game.hover` the highlight draws, so the button
   * and the outlined tile can never disagree about the target. */
  UI.prototype.handTarget = function () {
    var g = this.game;
    if (g.paused || g.fishing || g.cutscene) return null;
    var o = g.hover;
    if (o) {
      if (o.kind === 'npc') return { o: o, icon: '✋', label: 'Nói chuyện' };
      if (g.canHit(o)) {
        var job = g.toolJob(o.kind);
        return { o: o, icon: '✋', label: (job && job.label) || 'Làm' };
      }
      return { o: o, icon: '✋', label: this.objectVerb(o) };
    }
    // bare soil in front is worth a button too - hoeing is the commonest act
    var f = g.facingTile(), a = g.world.area();
    if (a.id === 'farm' || a.id === 'greenhouse' || a.id === 'island') {
      var t = a.name_of(f.x, f.y);
      if (t === 'dirt' || t === 'grass') {
        return { tile: f, icon: '✋', label: 'Cuốc đất' };
      }
      if (t === 'tilled' || t === 'watered') {
        var armed = this.quickSeedItem();
        return { tile: f, icon: '✋',
                 label: armed ? 'Gieo ' + armed.name : 'Gieo hạt' };
      }
    }
    return null;
  };

  /* A short verb for whatever kind of thing this is, for the button caption. */
  UI.prototype.objectVerb = function (o) {
    var V = { doorway: 'Vào trong', chest: 'Mở rương', bin: 'Bán đồ',
              machine: 'Xem máy', counter: 'Mua bán', bed: 'Đi ngủ',
              kitchen: 'Nấu ăn', workshop: 'Chế tạo', crop: 'Xem cây',
              calendarBoard: 'Xem lịch', mailbox: 'Xem thư', tv: 'Xem tivi',
              brokenBridge: 'Sửa cầu', sign: 'Đọc bảng' };
    return V[o.kind] || 'Mở';
  };

  UI.prototype.handAct = function () {
    var t = this.handTarget();
    if (!t) return;
    var g = this.game;
    g.cancelRoute('action');              // the button is the player taking over
    if (t.o) {
      if (g.canHit(t.o)) return g.hit(t.o);
      return this.openObject(t.o, t.o.x, t.o.y);
    }
    return this.tapTile(t.tile.x, t.tile.y);
  };

  UI.prototype.updateHand = function () {
    var t = this.handTarget();
    var key = t ? (t.icon + t.label) : '';
    if (this.handBtn.dataset.key !== key) {
      this.handBtn.dataset.key = key;
      this.handBtn.innerHTML = '';
      if (t) {
        this.handBtn.appendChild(el('span', null, t.icon));
        this.handBtn.appendChild(el('small', null, t.label));
      }
    }
    this.handBtn.classList.toggle('sdv-on', !!t);
  };

  UI.prototype.updateQuick = function () {
    var inMine = !!this.game.world.area().depth;
    // a column up the right edge above the action button, not a row lying
    // across the joystick where it used to be
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
    /* WHY the hold is dropped here: `dragging` used to survive the panel that
     * created it, so an item picked up in the chest was still "held" when the
     * shipping bin opened, and the bin acted on it. The refresh hook goes with
     * it - a stale one re-opened a panel the player had just closed. */
    this.closeSheet();
    this.clearHeld();
    this.refreshPanel = null;
    this.game.paused = false;
  };
  UI.prototype.openPanel = function (title, bodyEl, opts) {
    this.close();
    // reading a panel is not walking; a route that outlived it would carry the
    // farmer off the moment the panel shut
    if (this.game && this.game.cancelRoute) this.game.cancelRoute('panel');
    if (global.SDV_AUDIO) global.SDV_AUDIO.play('open');
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

  // ---- the held item, and the gestures that move it ----------------------
  /*
   * ONE item is held at a time, recorded as {it, list, index}. The index is a
   * hint only: heldItem() re-finds the stack by identity before anything acts
   * on it, and gives up if it has since left that list.
   *
   * WHY that indirection exists: the old code trusted the index it wrote down
   * at pick-up time, and three separate paths then acted on whatever had slid
   * into that slot since. The shipping bin read sim.inventory[index] for an
   * item picked up in the CHEST and posted a stack the player never touched;
   * the shopkeeper's sell box paid diamond money and deleted the wood beside
   * it; and the chest's quick-sort button turned one stack into two, because
   * moveStack pushed the held item and then spliced a different one out.
   */
  var HOLD_MS = 240;      // long enough that a flick to scroll is not a grab
  var SLOP = 12;          // px of finger travel that still counts as "still"
  var QUAL_VN = ['Thường', 'Bạc', 'Vàng', 'Iridi'];

  UI.prototype.heldItem = function () {
    var d = this.dragging;
    if (!d || !d.it || !d.list) return null;
    var i = d.list.indexOf(d.it);
    if (i < 0) { this.clearHeld(); return null; }
    d.index = i;
    return d;
  };
  UI.prototype.pickUp = function (it, list, index, node) {
    this.clearHeld();
    this.dragging = { it: it, list: list, index: index };
    if (node) { node.classList.add('sdv-picked'); this._pickedEl = node; }
    this.game.sfx('pickup');
  };
  UI.prototype.clearHeld = function () {
    this.dragging = null;
    this._pickedEl = null;
    this._hoverDz = null;
    /* Sweeping the highlight off the whole layer rather than off one remembered
     * node: a panel that re-rendered mid-hold left an orphan outline that never
     * came off, so the player was looking at an item the game was not holding. */
    var lit = this.layer.querySelectorAll(
      '.sdv-picked, .sdv-dzover, .sdv-dzhot, .sdv-dzno');
    for (var i = 0; i < lit.length; i++) {
      lit[i].classList.remove('sdv-picked');
      lit[i].classList.remove('sdv-dzover');
      lit[i].classList.remove('sdv-dzhot');
      /* The refusal mark has to be swept with the rest of them. Left behind, a
       * slot the player merely CONSIDERED stays crossed out for the rest of the
       * session and looks permanently broken. */
      lit[i].classList.remove('sdv-dzno');
    }
    this.ghostHide();
  };

  /* A click always follows the touchend that ends a long press, and it lands on
   * whatever the finger was over - so without swallowing it, every touch drop
   * ran twice (sold, then tried to sell again). */
  UI.prototype.eatNextClick = function () { this._eatClickAt = Date.now(); };
  UI.prototype.swallowClick = function () {
    if (this._eatClickAt && Date.now() - this._eatClickAt < 700) {
      this._eatClickAt = 0; return true;
    }
    return false;
  };

  /* The held item follows the finger. WHY: `.sdv-picked` was added on
   * touchstart and never removed, so "am I carrying something, and what" was a
   * question the screen could not answer. */
  UI.prototype.ghostShow = function (it, x, y) {
    this.ghostHide();
    var g = el('div', 'sdv-ghost');
    var info = this.sim.itemInfo(it.name);
    g.appendChild(icon(it.name, info ? info.cat : 'crop', 40));
    if (it.qty > 1) g.appendChild(el('span', 'sdv-qty', String(it.qty)));
    this.layer.appendChild(g);
    this._ghost = g;
    this.ghostMove(x, y);
  };
  UI.prototype.ghostMove = function (x, y) {
    if (!this._ghost) return;
    var r = this.layer.getBoundingClientRect();
    this._ghost.style.left = (x - r.left) + 'px';
    this._ghost.style.top = (y - r.top) + 'px';
  };
  UI.prototype.ghostHide = function () {
    if (this._ghost) { this._ghost.remove(); this._ghost = null; }
  };

  UI.prototype.dropNodeAt = function (x, y) {
    var n = document.elementFromPoint(x, y);
    while (n && !n.__sdvDrop) n = n.parentElement;
    return n;
  };
  UI.prototype.hoverDropZone = function (x, y) {
    var n = this.dropNodeAt(x, y);
    if (n === this._hoverDz) return;
    if (this._hoverDz) this._hoverDz.classList.remove('sdv-dzover');
    this._hoverDz = n;
    // a square that is going to refuse must not brighten under the finger either
    if (n && !n.classList.contains('sdv-dzno')) n.classList.add('sdv-dzover');
  };
  /* Light up what will actually take this item - and mark what will not.
   *
   * WHY a square may not simply go green: the owner's report was "drag cái gì
   * lên lò nung slot cũng xanh lên mà kéo vào thì không đc". A target that
   * lights up and then refuses on release has made a promise and broken it,
   * which reads as a broken control rather than as a rule. Any target that can
   * refuse declares `__sdvAccepts(item)`, and it is asked the same question the
   * drop itself will ask, so the colour and the outcome cannot disagree.
   * Targets that take anything (a bag square, a chest square) declare nothing
   * and stay plain green. */
  UI.prototype.markDropZones = function (on) {
    var held = on && this.dragging ? this.dragging.it : null;
    var z = this.layer.querySelectorAll('.sdv-dz, .sdv-mslot');
    for (var i = 0; i < z.length; i++) {
      var n = z[i];
      n.classList.remove('sdv-dzhot');
      n.classList.remove('sdv-dzno');
      if (!on) { n.classList.remove('sdv-dzover'); continue; }
      if (n.__sdvAccepts && held && !n.__sdvAccepts(held)) n.classList.add('sdv-dzno');
      else n.classList.add('sdv-dzhot');
    }
  };
  /* Releasing a touch-drag. WHY it hit-tests the point under the finger instead
   * of relying on drop events: HTML5 drag-and-drop never fires on a phone,
   * which is why "kéo vật phẩm vào đây" was an instruction the owner could not
   * follow - there was no touch path into the bin at all. */
  UI.prototype.releaseAt = function (x, y) {
    var d = this.heldItem();
    this.ghostHide();
    this.markDropZones(false);
    if (!d) { this.clearHeld(); return; }
    var node = this.dropNodeAt(x, y);
    this.eatNextClick();
    if (node) { node.__sdvDrop(d); return; }
    /* An invalid drop says why. It used to do nothing whatsoever, which reads
     * as a broken control rather than as a miss. */
    this.game.sfx('error');
    this.game.toast('Thả vào ô bán, ô của máy hoặc một ô túi khác');
    this.clearHeld();
  };

  /* One place that makes something a drop target, with all three doors open:
   * the desktop drop event, a tap while an item is held, and a touch-drag
   * released on top of it (which arrives through __sdvDrop). */
  UI.prototype.dropZone = function (node, handler, emptyMsg) {
    var self = this;
    node.classList.add('sdv-dz');
    node.__sdvDrop = handler;
    node.addEventListener('dragover', function (e) {
      e.preventDefault(); node.classList.add('sdv-dzover');
    });
    node.addEventListener('dragleave', function () {
      node.classList.remove('sdv-dzover');
    });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('sdv-dzover');
      var d = self.heldItem();
      if (!d) return self.game.toast(emptyMsg || 'Chưa cầm món nào');
      handler(d);
    });
    node.addEventListener('click', function () {
      if (self.swallowClick()) return;
      var d = self.heldItem();
      if (!d) return self.game.toast(emptyMsg || 'Chưa cầm món nào');
      handler(d);
    });
    return node;
  };

  // ---- bag ---------------------------------------------------------------
  UI.prototype.slotEl = function (it, list, index, opts) {
    var self = this;
    var s = el('div', 'sdv-slot');
    /* Even an empty slot takes a drop - it is how a stack moves into the other
     * container, and a square that silently refuses reads as "drag is broken",
     * which is what the owner reported. */
    s.__sdvDrop = function (d) { self.dropOnSlot(d, list, index); };
    s.addEventListener('dragover', function (e) { e.preventDefault(); });
    s.addEventListener('drop', function (e) {
      e.preventDefault();
      var d = self.heldItem();
      if (d) self.dropOnSlot(d, list, index);
    });
    if (!it) { s.classList.add('sdv-empty'); return s; }
    var info = this.sim.itemInfo(it.name);
    s.appendChild(icon(it.name, info ? info.cat : 'crop', 34));
    if (it.qty > 1) s.appendChild(el('span', 'sdv-qty', String(it.qty)));
    /* The grade badge was a 7px empty dot, on a phone - which is how "định
     * quality để bán" became impossible: three grades of one crop looked the
     * same, and plain quality had no mark at all. It carries its initial now,
     * and the tooltip prices THAT grade instead of the base item. */
    var q = it.quality || 0;
    if (q) s.appendChild(el('span', 'sdv-q' + q + ' sdv-qbadge', QUAL_VN[q].charAt(0)));
    s.title = it.name + ' · ' + QUAL_VN[q] + ' · ' + this.sim.sellPrice(it.name, q) + 'g';
    s.draggable = true;
    s.addEventListener('dragstart', function (e) {
      self.pickUp(it, list, index, s);
      self.markDropZones(true);
      e.dataTransfer.setData('text/plain', it.name);
    });
    s.addEventListener('dragend', function () { self.markDropZones(false); });

    /* Touch: press-and-hold picks the item up, a quick tap runs the panel's own
     * action. WHY the timer: touchstart used to grab the item the instant a
     * finger landed, so flicking the bag to scroll picked up whatever was under
     * the first frame of the swipe and left it held - and the next tap on the
     * shipping bin then sold that item instead of the one aimed at. The comment
     * here already claimed "press and hold"; there was no timer anywhere. */
    var hold = null, sx = 0, sy = 0;
    function stopHold() { if (hold) { clearTimeout(hold); hold = null; } }
    s.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      stopHold();
      hold = setTimeout(function () {
        hold = null;
        self.pickUp(it, list, index, s);
        self.ghostShow(it, sx, sy);
        self.markDropZones(true);
        self.game.toast('Đang cầm ' + it.name + ' — kéo tới ô đích rồi thả');
      }, HOLD_MS);
    }, { passive: true });
    s.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!self._ghost) {
        if (Math.abs(t.clientX - sx) > SLOP || Math.abs(t.clientY - sy) > SLOP) stopHold();
        return;
      }
      e.preventDefault();          // the gesture is a drag now, not a scroll
      self.ghostMove(t.clientX, t.clientY);
      self.hoverDropZone(t.clientX, t.clientY);
    }, { passive: false });
    s.addEventListener('touchend', function (e) {
      stopHold();
      if (!self._ghost) return;    // an ordinary tap: let the click handler run
      var t = e.changedTouches[0];
      self.releaseAt(t.clientX, t.clientY);
    });
    s.addEventListener('touchcancel', function () { stopHold(); self.clearHeld(); });

    s.addEventListener('click', function () {
      if (self.swallowClick()) return;
      if (opts && opts.onClick) opts.onClick(it, index);
    });
    return s;
  };

  /* Dropping onto a slot. Inside one container this REORDERS rather than swaps:
   * assigning into a square past the end of the list left an `undefined` hole
   * in the array, and dropping onto an empty square is the obvious way to move
   * a stack to the end. */
  UI.prototype.dropOnSlot = function (d, list, index) {
    var from = d.list.indexOf(d.it);
    if (from < 0) { this.clearHeld(); return; }
    if (d.list === list) {
      var to = Math.min(index, list.length - 1);
      if (to !== from) list.splice(to, 0, list.splice(from, 1)[0]);
      this.game.sfx('tap');
    } else if (this.moveStack(d, list)) {
      this.game.sfx('tap');
    }
    this.clearHeld();
    if (this.refreshPanel) this.refreshPanel();
  };

  UI.prototype.moveStack = function (d, target) {
    if (target === d.list) return false;
    var cap = target === this.sim.chest ? this.sim.chestSize : this.sim.invSize;
    var it = d.it;
    /* Found by identity, never by the index recorded at pick-up: sorting the
     * chest between pick-up and drop used to splice a NEIGHBOUR out and leave
     * the moved stack sitting in both containers at once. */
    var from = d.list.indexOf(it);
    if (from < 0) { this.game.toast('Món đó không còn ở chỗ cũ'); return false; }
    for (var i = 0; i < target.length; i++) {
      if (target[i] && target[i].name === it.name
          && (target[i].quality || 0) === (it.quality || 0)) {
        target[i].qty += it.qty;
        d.list.splice(from, 1);
        return true;
      }
    }
    if (target.length >= cap) { this.game.toast('Chỗ chứa đã đầy'); return false; }
    target.push(it);
    d.list.splice(from, 1);
    return true;
  };

  // ---- choosing how many -------------------------------------------------
  /*
   * WHY this sheet exists: the owner could not sell what they meant to -
   * "tui không drag đồ muốn và định quality để bán đồ đc". One tap in the
   * shipping bin posted the ENTIRE stack, of whichever grade happened to be
   * under the finger, with no price on screen and nothing to take it back.
   * Every sale goes through this now: it names the grade, prices THAT grade,
   * and moves the number the player picks.
   */
  UI.prototype.amountSheet = function (o) {
    var self = this;
    this.closeSheet();
    var it = o.item, q = it.quality || 0;
    var n = Math.max(1, Math.min(o.start == null ? o.max : o.start, o.max));
    var info = this.sim.itemInfo(it.name);

    var wrap = el('div', 'sdv-sheet');
    var card = el('div', 'sdv-sheetcard');
    var head = el('div', 'sdv-sheethead');
    head.appendChild(icon(it.name, info ? info.cat : 'crop', 40));
    var col = el('div', 'sdv-col');
    col.appendChild(el('div', 'sdv-sheetname', it.name));
    col.appendChild(el('div', 'sdv-qchip sdv-qc' + q, 'Chất lượng: ' + QUAL_VN[q]));
    head.appendChild(col);
    card.appendChild(head);
    card.appendChild(el('div', 'sdv-sub',
      'Đơn giá ' + o.unit + 'g mỗi món · đang có ' + o.max));

    var row = el('div', 'sdv-amtrow');
    var minus = el('button', 'sdv-amtbtn', '−');
    var num = el('input', 'sdv-amtnum');
    num.type = 'number';
    num.inputMode = 'numeric';
    num.min = '1';
    num.max = String(o.max);
    num.value = String(n);
    var plus = el('button', 'sdv-amtbtn', '+');
    row.appendChild(minus); row.appendChild(num); row.appendChild(plus);
    card.appendChild(row);

    var quick = el('div', 'sdv-amtquick');
    [['1', 1], ['10', 10], ['Nửa', Math.max(1, Math.floor(o.max / 2))],
     ['Tất cả', o.max]].forEach(function (p) {
      var b = el('button', 'sdv-chipbtn', p[0]);
      b.addEventListener('click', function () { set(p[1]); });
      quick.appendChild(b);
    });
    card.appendChild(quick);

    var total = el('div', 'sdv-amttotal', '');
    card.appendChild(total);
    if (o.note) card.appendChild(el('div', 'sdv-sub', o.note));

    var okBtn = el('button', 'sdv-mbtn sdv-okbtn', '');
    var cancel = el('button', 'sdv-mbtn sdv-cancelbtn', 'Huỷ');
    card.appendChild(okBtn); card.appendChild(cancel);

    /* `typing` is true while the player is mid-edit. Without it, clamping on
     * every keystroke fights them: typing "12" into a field capped at 30 has to
     * pass through "1", and rewriting the box each time makes a second digit
     * impossible to enter. The value is only forced back into range when the
     * field loses focus or the sheet is confirmed. */
    function set(v, typing) {
      n = Math.max(1, Math.min(Math.round(v) || 1, o.max));
      if (!typing) num.value = String(n);
      if (o.summary) {
        total.innerHTML = o.summary(n);
        okBtn.textContent = o.confirm + ' ' + n;
      } else {
        total.innerHTML = 'Tổng: <b>' + (o.unit * n) + 'g</b>';
        okBtn.textContent = o.confirm + ' ' + n + ' món — ' + (o.unit * n) + 'g';
      }
    }
    minus.addEventListener('click', function () { set(n - 1); });
    plus.addEventListener('click', function () { set(n + 1); });
    num.addEventListener('input', function () {
      if (num.value === '') { set(1, true); return; }
      set(parseInt(num.value, 10), true);
    });
    num.addEventListener('blur', function () { set(n); });
    num.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { num.blur(); okBtn.click(); }
    });
    // a tap on the field is for editing, never for dismissing the sheet
    num.addEventListener('click', function (e) { e.stopPropagation(); });
    okBtn.addEventListener('click', function () {
      set(n);                       // pull a half-typed number back into range
      var take = n;
      self.closeSheet();
      o.onConfirm(take);
    });
    cancel.addEventListener('click', function () { self.closeSheet(); });
    // tapping the dim area backs out, the way every phone sheet does
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) self.closeSheet();
    });
    set(n);
    wrap.appendChild(card);
    this.layer.appendChild(wrap);
    this._sheet = wrap;
    if (global.SDV_AUDIO) global.SDV_AUDIO.play('open');
    return wrap;
  };
  /* The tiles a sowing of `want` seeds would actually fill, nearest first.
   *
   * Nearest-first matters: the player tapped a particular square, so the patch
   * has to grow out from THAT square, not from wherever the scan happens to
   * start. Anything already planted, unturned, or off the farm is skipped, so
   * the number on the button is a number of seeds that will really go in. */
  UI.prototype.sowTargets = function (cx, cy, want) {
    var g = this.game, a = g.world.area(), out = [];
    if (a.id !== 'farm' && a.id !== 'greenhouse' && a.id !== 'island') return out;
    var R = 12;                       // far enough for any realistic handful
    var ring = [];
    for (var dy = -R; dy <= R; dy++) {
      for (var dx = -R; dx <= R; dx++) {
        ring.push([dx, dy, dx * dx + dy * dy]);
      }
    }
    ring.sort(function (p, q) { return p[2] - q[2]; });
    for (var i = 0; i < ring.length && out.length < want; i++) {
      var x = cx + ring[i][0], y = cy + ring[i][1];
      var t = a.name_of(x, y);
      if (t !== 'tilled' && t !== 'watered') continue;
      if (g.world.objAt(x, y)) continue;
      out.push({ x: x, y: y });
    }
    return out;
  };

  /* "Bấm vào gieo hạt, xong hiện ra input field để nhập số lượng."
   *
   * The count is capped at whichever runs out first - the seeds in the bag or
   * the turned soil within reach - and both numbers are on screen, because a
   * box that lets you ask for forty and quietly plants nine is worse than one
   * that says nine from the start. */
  UI.prototype.sowSheet = function (sd, x, y) {
    var self = this;
    var soil = this.sowTargets(x, y, 999).length;
    var most = Math.min(sd.qty, soil);
    if (!soil) return this.game.toast('Quanh đây không còn ô đất nào trống');

    this.amountSheet({
      item: sd,
      max: most,
      start: Math.min(most, 9),
      confirm: 'Gieo',
      note: 'Có ' + sd.qty + ' hạt · ' + soil + ' ô đất trống quanh đây'
            + (most < sd.qty ? ' — gieo được nhiều nhất ' + most : ''),
      summary: function (k) {
        return 'Gieo <b>' + k + '</b> ô · còn lại <b>' + (sd.qty - k) + '</b> hạt';
      },
      onConfirm: function (k) {
        var tiles = self.sowTargets(x, y, k), done = 0;
        for (var i = 0; i < tiles.length; i++) {
          var have = self.sim.count(sd.name);
          if (have <= 0) break;
          if (self.plant(tiles[i].x, tiles[i].y, sd, true)) done++;
        }
        self.close();
        if (!done) return self.game.toast('Không gieo được ô nào');
        self.game.fx.hit('weed', x, y, self.game.player.face);
        self.game.sfx('pickup');
        self.game.toast('Đã gieo ' + done + ' ô '
                        + sd.name.replace(/\s*Seeds?$/i, ''));
      }
    });
  };

  UI.prototype.closeSheet = function () {
    if (this._sheet) { this._sheet.remove(); this._sheet = null; }
  };

  /* Selling, wherever it happens. `mode` is 'bin' (pays tomorrow morning) or
   * 'shop' (pays now). Both go through the amount sheet, so a partial sale is
   * possible for the first time - before this, every route sold the lot. */
  UI.prototype.sellSheet = function (d, mode) {
    var self = this, s = this.sim;
    var it = d.it, list = d.list;
    this.clearHeld();
    if (!it || !list || list.indexOf(it) < 0) {
      return this.game.toast('Món đó không còn ở đó nữa');
    }
    var info = s.itemInfo(it.name);
    /* WHY the price is checked and not just the item table row: 55 rows in that
     * table are worth nothing (Weeds, Trash, Driftwood...). The bin used to
     * swallow them, report success and pay 0g - the item was simply gone. */
    if (!info || !info.sell) {
      this.game.sfx('error');
      return this.game.toast(it.name + ' không bán được');
    }
    var q = it.quality || 0;
    var unit = s.sellPrice(it.name, q);
    function refresh() { if (self.refreshPanel) self.refreshPanel(); }
    this.amountSheet({
      item: it, unit: unit, max: it.qty,
      confirm: mode === 'bin' ? 'Bỏ vào thùng' : 'Bán',
      note: mode === 'bin'
        ? 'Tiền vào sáng hôm sau. Bỏ nhầm thì bấm ↩ ở danh sách bên dưới để lấy lại.'
        : 'Nhận tiền ngay.',
      onConfirm: function (want) {
        /* Re-checked at the moment of the sale, not at the moment the sheet
         * opened: the bag can change while the sheet is up. */
        var i = list.indexOf(it);
        if (i < 0) { self.game.toast('Món đó không còn trong túi'); return refresh(); }
        var n = Math.max(1, Math.min(want, it.qty));
        if (mode === 'bin') {
          s.shipped.push({ name: it.name, qty: n, quality: q });
          self.game.sfx('tap');
          self.game.toast('Đã bỏ vào thùng ' + n + ' ' + it.name
                          + ' (' + QUAL_VN[q] + ') — ' + (unit * n) + 'g');
        } else {
          s.gold += unit * n;
          self.updateHud();
          self.game.sfx('coin');
          self.game.toast('Bán ' + n + ' ' + it.name + ' (' + QUAL_VN[q] + ') được '
                          + (unit * n) + 'g');
        }
        it.qty -= n;
        if (it.qty <= 0) list.splice(i, 1);
        refresh();
      }
    });
  };

  UI.prototype.openBag = function () {
    var self = this;
    var body = el('div', 'sdv-body');
    var grid = el('div', 'sdv-grid');
    body.appendChild(grid);
    var hint = el('div', 'sdv-hint',
      'Chạm để ăn (nếu ăn được). Chạm giữ một món để cầm lên, rồi kéo thả sang '
      + 'ô khác. Trên máy tính, kéo ra ngoài khung là vứt xuống đất.');
    body.appendChild(hint);
    this.renderGrid = function () {
      grid.innerHTML = '';
      for (var i = 0; i < self.sim.invSize; i++) {
        grid.appendChild(self.slotEl(self.sim.inventory[i], self.sim.inventory, i, {
          onClick: function (it, idx) {
            var gain = self.sim.eat(idx);
            if (gain != null) {
              self.game.toast('+' + gain + ' sức lực');
              // close() clears the hook, so every caller has to check for it
              if (self.refreshPanel) self.refreshPanel();
            }
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
        var d = self.heldItem();
        if (!d) return;
        if (self.panel && self.panel.contains(e.target)) return;
        self.dropOnGround(d);
        self.clearHeld();
        if (self.refreshPanel) self.refreshPanel();
      });
    }
    this.refreshPanel = function () { self.renderGrid(); };
  };

  UI.prototype.dropOnGround = function (d) {
    var g = this.game, a = g.world.area();
    /* By identity again: splicing the remembered index dropped one item on the
     * ground and deleted a different one from the bag. */
    var i = d.list.indexOf(d.it);
    if (i < 0) return;
    var x = Math.floor(g.player.x), y = Math.floor(g.player.y);
    a.objs.push({ x: x, y: y, kind: 'dropped', item: d.it });
    d.list.splice(i, 1);
    g.toast('Đã vứt ' + d.it.name + ' xuống đất');
  };

  // ---- tapping a tile ----------------------------------------------------
  /* What tapping this object should do once the farmer is standing next to it.
   *
   * Two families: things a TOOL acts on (a tree, a rock, a weed - `openObject`
   * has no case for those, because in-reach they are handled by the action
   * button), and things that OPEN something. Getting this split wrong would
   * mean walking all the way to a tree and then doing nothing. */
  UI.prototype.arrivalActionFor = function (o, x, y) {
    var self = this, g = this.game;
    var jobs = (global.SDV_GAME && global.SDV_GAME.TOOL_JOBS) || {};
    var isTool = !!jobs[o.kind];
    return function () {
      // it may have been chopped, picked up or harvested during the walk
      if (g.world.objAt(x, y) !== o) return;
      if (isTool) {
        g.hover = o;
        g.player.actCooldown = 0;
        return g.useTool();
      }
      self.openObject(o, x, y);
    };
  };

  /* And what tapping bare ground should do once we are standing on it - the
   * same two menus the in-reach path opens, and nothing when neither applies
   * (walking there was the whole request). */
  UI.prototype.arrivalActionForTile = function (x, y) {
    var self = this, g = this.game;
    return function () {
      var a = g.world.area();
      var t = a.name_of(x, y);
      var farmable = a.id === 'farm' || a.id === 'greenhouse' || a.id === 'island';
      if (!farmable) return;
      if (t === 'tilled' || t === 'watered') return self.tileMenu(x, y);
      /* Bare ground deliberately opens NOTHING at the end of a walk.
       *
       * The in-reach tap opens the build menu on dirt and grass, because in
       * reach that is the only way to reach it. At the end of a JOURNEY it is
       * wrong: the player tapped the far side of the field to go there, and
       * being handed a "what would you like to build here?" modal the moment
       * they arrive is a menu they did not ask for - and it pauses the game,
       * which is how this was found (a probe walked the farmer onto bare soil
       * and every later step silently did nothing because the world was
       * paused behind a panel nobody had opened on purpose). */
      return;
    };
  };

  /* REACH is the distance within which a tap acts immediately, and it is the
   * same 3.2 tiles this function has always used. Everything inside it behaves
   * EXACTLY as before - that is what keeps hoeing, watering, planting and
   * chopping untouched. What changed is what happens outside it: that used to
   * be `return`, silently, and is now a walk. */
  var REACH = 3.2;

  UI.prototype.tapTile = function (x, y) {
    var g = this.game, a = g.world.area();
    var p = g.player, self = this;
    var d0 = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
    /* A door has a SHORTER direct reach than anything else, and that is not a
     * detail - it closes a gap two range checks left between them.
     *
     * `tapTile` treated anything within 3.2 tiles as "act on it here", while
     * `Game.enterDoor` refuses to open a door from further than 2.4 and hands
     * back to a walk that does not always find a route. So a tap between those
     * two numbers went down the direct path, was refused at the far end, and
     * did nothing at all - no walk, no door, no message. Routing every door tap
     * past 2.2 through the walk branch, which is the reliable one, means the
     * two gates can no longer disagree. */
    var tapped = g.world.objAt(x, y);
    /* The DOORSTEP counts as the door.
     *
     * The doorway object sits on the wall; the tile that actually warps you is
     * the step in front of it, one row down, and it carries no object at all.
     * A tap there fell through every branch below - no object, not farmland -
     * and did nothing: no walk, no door, not even a refusal. It is the most
     * natural place on the whole building to aim at, which is why "vô cửa"
     * failed so often and so silently. */
    var stepWarp = (a.warps || []).filter(function (v) {
      return v.x === x && v.y === y;
    })[0];
    var isDoor = (tapped && tapped.kind === 'doorway') || !!stepWarp;
    var reach = isDoor ? 2.2 : REACH;
    var far = d0 > reach;

    if (far && !this.moveCrop && !this.buildMode && !this.placeMode) {
      /* Out of reach: walk there and do it on arrival. Placement modes are
       * excluded on purpose - those aim at a tile rather than travel to it,
       * and walking first would move the farmer out from under the cursor. */
      var oFar = g.world.objAt(x, y);
      var actFar = oFar
        ? this.arrivalActionFor(oFar, x, y)
        : this.arrivalActionForTile(x, y);
      var doorFar = oFar && oFar.kind === 'doorway';
      var goal = { x: x, y: y };
      if (g.solidForWalk(x, y)) {
        var beside = g.besideTile(x, y);
        if (!beside) return g.refuseRoute(x, y, 'Không tới gần được chỗ đó');
        goal = beside;
      }
      /* Stepping onto a doorway warps you, so the arrival action would fire in
       * the wrong area. The walk itself is the whole interaction. */
      return g.walkTo(goal.x, goal.y, doorFar ? null : actFar,
                      { face: { x: x, y: y } });
    }

    if (this.moveCrop) {
      var t0 = a.name_of(x, y);
      if ((t0 !== 'tilled' && t0 !== 'watered') || g.world.objAt(x, y, a)) {
        g.toast('Phải là ô đất đã cuốc và còn trống');
      } else {
        /* The one mutation that moves an object without changing the list
         * length, so the tile index cannot notice it on its own. */
        this.moveCrop.x = x; this.moveCrop.y = y;
        a.reindex();
        this.moveCrop.watered = (t0 === 'watered');
        g.toast('Đã dời cây');
      }
      this.moveCrop = null;
      return;
    }
    var o = g.world.objAt(x, y);
    if (o) return this.openObject(o, x, y);
    /* Close enough to step onto the doorstep: walk onto it, and the warp does
     * the rest - the same thing that happens when you walk there yourself. */
    if (stepWarp) return g.walkTo(x, y, null, { face: { x: x, y: y } });
    var t = a.name_of(x, y);
    /* WHY: gating on a.id === 'farm' meant the greenhouse and the island plot
     * were decorative - you could stand on soil and not be allowed to plant. */
    var farmable = a.id === 'farm' || a.id === 'greenhouse' || a.id === 'island';
    if (farmable && (t === 'tilled' || t === 'watered')) {
      /* Quick-sow. With a seed armed, a tap on empty soil plants it outright -
       * the menu is skipped because choosing the seed IS the menu, and it was
       * already answered. A tap that cannot plant (wrong season, bag empty)
       * falls through to the full menu rather than failing in silence. */
      var armed = this.quickSeedItem();
      if (armed && this.plant(x, y, armed)) return;
      return this.tileMenu(x, y);
    }
    if (farmable && (t === 'dirt' || t === 'grass')) return this.buildMenu(x, y);
  };

  UI.prototype.openObject = function (o, x, y) {
    /* Something that breaks, within reach, is HIT rather than opened.
     *
     * WHY this is here and not on a button: it used to do nothing at all - the
     * switch below fell through to `default: return`, so tapping a rock was
     * silence and the only way to break one was the action button. That button
     * is gone, and this is what replaces it. It matters most below the stamina
     * reserve, where the auto-swing deliberately stops: the player can still
     * spend their last point, they just cannot lose it by standing still. */
    if (this.game.canHit(o)) return this.game.hit(o);
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
      /* WHY a door is on this list now: it never was, so a tap on a doorway
       * did NOTHING. The only way in was to walk the joystick onto one exact
       * tile and stop inside a box less than half a tile wide - which on a
       * phone is why the owner's report was simply "nhà khó vô quá". */
      case 'doorway': return this.game.enterDoor(o);
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
    this.saplingOptions(x, y, list);
    if (seeds.length) {
      list.appendChild(el('div', 'sdv-sub',
        'Gieo hạt — chạm để gieo ô này, giữ ⚡ để gieo nhanh mọi ô sau đó'));
      seeds.forEach(function (sd) {
        var b = el('button', 'sdv-mbtn');
        b.appendChild(icon(sd.name, 'seed', 26));
        b.appendChild(el('span', null, sd.name + ' ×' + sd.qty));
        /* Arm this seed, and every later tap on bare soil plants it with no
         * menu at all. That is the "gieo hạt nhanh (chọn loại hạt trước)" the
         * owner asked for: the choice is made ONCE, then sowing a field is one
         * tap per tile instead of three. */
        var q = el('span', 'sdv-quickarm', self.quickSeed === sd.name ? '⚡ đang bật' : '⚡');
        q.addEventListener('click', function (ev) {
          ev.stopPropagation();
          self.armSeed(self.quickSeed === sd.name ? null : sd.name);
          self.close();
        });
        b.appendChild(q);
        /* Tapping the seed asks HOW MANY rather than planting one. Sowing one
         * square at a time was the commonest repeated action left in the game
         * after hoeing got its 3x3. The armed-seed lightning bolt beside it is
         * still there for anyone who would rather tap tile by tile. */
        b.addEventListener('click', function () { self.sowSheet(sd, x, y); });
        list.appendChild(b);
      });
      this.bulkOption(list, 'sow', x, y);
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
      g.sfx('water');
      self.close();
    });
    list.appendChild(wbtn);
    // and the same job done over a whole radius at once
    this.bulkOption(list, 'water', x, y);
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

  /* Fruit-tree saplings, offered from the same two tile menus as seeds.
   *
   * WHY this exists: Pierre stocks six saplings at 1,000-3,000g each and the
   * traveling cart can roll any of them, but there was no way to put one in the
   * ground. The tile menu's seed list only admitted names ending in "Seeds" or
   * "Starter", and plant() only searches the CROP table, so every sapling
   * answered "Hạt này chưa trồng được" on every tile in the game - several
   * thousand gold with nothing at the end of it. Everything downstream (the
   * planting rules, the drawing, the harvest panel) already existed; the only
   * missing piece was this door. */
  UI.prototype.saplingOptions = function (x, y, list) {
    var self = this, g = this.game, a = g.world.area();
    var saplings = this.sim.inventory.filter(function (it) {
      return /sapling$/i.test(it.name);
    });
    if (!saplings.length) return;
    /* Only on the farm: plantFruitTree writes into the farm area whatever room
     * the player is standing in, so offering it in the greenhouse would put the
     * tree somewhere the player cannot see. */
    if (a.id !== 'farm') {
      list.appendChild(el('div', 'sdv-sub', 'Cây ăn quả chỉ trồng được ngoài nông trại'));
      return;
    }
    list.appendChild(el('div', 'sdv-sub', 'Trồng cây ăn quả'));
    saplings.forEach(function (sp) {
      var b = el('button', 'sdv-mbtn');
      b.appendChild(icon(sp.name, 'seed', 26));
      b.appendChild(el('span', null, '\ud83c\udf33 ' + sp.name + ' ×' + sp.qty));
      b.appendChild(el('small', 'sdv-cost', 'Mất vài ngày mới ra quả, sau đó ra mãi'));
      b.addEventListener('click', function () {
        if (self.swallowClick()) return;
        self.plantTree(x, y, sp);
      });
      list.appendChild(b);
    });
  };
  UI.prototype.plantTree = function (x, y, stack) {
    var g = this.game;
    if (!g.farm || !g.farm.plantFruitTree) return g.toast('Chưa trồng cây ăn quả được');
    // plantFruitTree owns the rules and takes the sapling; it returns a reason or null
    var err = g.farm.plantFruitTree(x, y, stack.name);
    if (err) { g.sfx('error'); return g.toast(err); }
    /* The furrow goes back to plain ground: a tree stands on the tile now, and
     * leaving it looking like workable soil invites the player to water it. */
    var a = g.world.areas.farm;
    if (a.name_of(x, y) === 'tilled' || a.name_of(x, y) === 'watered') a.set(x, y, 'dirt');
    g.sfx('plant');
    g.toast('Đã trồng ' + stack.name);
    this.close();
  };

  /* `quiet` is for the bulk sweep: it plants the same way but leaves the
   * message, the sound and the panel-closing to the caller, so filling nine
   * tiles is one line of feedback instead of nine. */
  UI.prototype.plant = function (x, y, seedStack, quiet) {
    var g = this.game, a = g.world.area();
    var cropName = seedStack.name.replace(/\s*Seeds?$/i, '').replace(/\s*Starter$/i, '');
    var def = null;
    for (var i = 0; i < this.game.data.crops.length; i++) {
      var c = this.game.data.crops[i];
      if (c.seed === seedStack.name || c.name === cropName) { def = c; break; }
    }
    if (!def) { if (!quiet) this.game.toast('Hạt này chưa trồng được'); return false; }
    var indoors = g.world.area().season;    // greenhouse pins its own season
    if (!indoors && def.seasons.length && def.seasons.indexOf(this.sim.season()) < 0) {
      if (!quiet) {
        this.game.toast(def.name + ' không trồng được mùa ' + this.sim.seasonVN());
      }
      return false;
    }
    if (g.world.objAt(x, y)) { if (!quiet) this.game.toast('Ô này đã có cây'); return false; }
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
    a.reindex();                       // the crop has to be findable by tile
    if (quiet) return true;
    this.close();
    this.game.toast('Đã gieo ' + def.name);
    return true;
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
        g.sfx('water');
        self.close();
      });
      list.appendChild(w);
      // watering the whole patch is reachable from the plant as well as from
      // the bare tile - the player is usually looking at a crop, not at soil
      this.bulkOption(list, 'water', o.x, o.y);
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

  // ---- working several tiles at once ---------------------------------------
  /* Hoeing and watering are the two things a farmer does dozens of times a
   * morning, and doing them one tap at a time is most of what a day costs.
   * Both of these follow the same three rules, which are the ones that were
   * asked for:
   *   - the total stamina is on the button BEFORE it is pressed,
   *   - the button is visibly dead, not silently inert, when it cannot be paid
   *     for (a button that looks alive and does nothing is worse than no
   *     button, because the player assumes the game is broken),
   *   - the charge is per tile actually changed. Tiles that are already tilled,
   *     already wet, occupied, or outside the farm are skipped and cost
   *     nothing, so the number on the button is the number that is spent.
   */
  var BULK = {
    hoe: {
      r: 1, shape: 'square', cost: 2,
      label: '⛏ Cuốc một lượt 3×3',
      none: 'Quanh đây không còn ô nào cuốc được',
      done: function (n) { return 'Đã cuốc ' + n + ' ô'; }
    },
    water: {
      r: 2, shape: 'disc', cost: 2,
      label: '💧 Tưới cả vùng quanh đây',
      none: 'Quanh đây không có ô nào đang khát',
      done: function (n) { return 'Đã tưới ' + n + ' ô'; }
    },
    /* Sowing costs no stamina in this game, so the limit on this one is the
     * SEEDS in the bag - which is why bulkTargets has to trim the list to what
     * can actually be paid for, or the button promises a patch it cannot fill. */
    sow: {
      r: 2, shape: 'disc', cost: 0,
      label: '🌱 Gieo cả vùng quanh đây',
      none: 'Quanh đây không có ô đất trống nào để gieo',
      done: function (n) { return 'Đã gieo ' + n + ' ô'; }
    }
  };

  /* The tiles this action would actually change. Deliberately the same
   * eligibility test the single-tile version uses, so the count on the button
   * can never promise a tile that the action then refuses. */
  UI.prototype.bulkTargets = function (mode, cx, cy) {
    var g = this.game, a = g.world.area(), spec = BULK[mode], out = [];
    if (a.id !== 'farm' && a.id !== 'greenhouse' && a.id !== 'island') return out;
    /* Sowing is limited by SEEDS, not by stamina, so the count has to be capped
     * at what is in the bag. Without this the button offers to sow twenty-one
     * tiles on the strength of three seeds. */
    var seedLeft = -1;
    if (mode === 'sow') {
      var arm = this.quickSeedItem();
      if (!arm) return out;
      seedLeft = arm.qty;
    }
    var r = spec.r;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (spec.shape === 'disc' && dx * dx + dy * dy > r * r) continue;
        var x = cx + dx, y = cy + dy;
        var t = a.name_of(x, y);
        if (!t) continue;                       // outside the map
        var o = g.world.objAt(x, y);
        if (mode === 'hoe') {
          // exactly game.hoeTile's own gate, so nothing is charged for a no-op
          if (t !== 'dirt' && t !== 'grass') continue;
          if (o) continue;
        } else {
          /* Dry soil, or a crop that has not been watered yet. A tile already
           * marked wet is skipped - paying stamina to water it twice is pure
           * loss, which is the same reason the single-tile button refuses. */
          var dry = (t === 'tilled') || (o && o.kind === 'crop' && !o.watered);
          if (!dry) continue;
        }
        if (mode === 'sow') {
          if (out.length >= seedLeft) continue;
        }
        out.push({ x: x, y: y });
      }
    }
    return out;
  };

  UI.prototype.bulkRun = function (mode, cx, cy) {
    var g = this.game, a = g.world.area(), s = this.sim;
    var tiles = this.bulkTargets(mode, cx, cy), spec = BULK[mode], done = 0;
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      // stop the moment the purse is empty rather than going negative
      if (s.energy < spec.cost) break;
      if (mode === 'sow') {
        var sd = this.quickSeedItem();
        if (!sd) break;
        // the single-tile call owns the seed, the crop record and the message
        var before = a.objs.length;
        this.plant(t.x, t.y, sd, true);
        if (a.objs.length > before) done++;
        continue;
      }
      if (mode === 'hoe') {
        // the single-tile call owns the cost, the tile write, the dust and the
        // sound; re-implementing any of that here is how the two drift apart
        g.hoeTile(t.x, t.y);
        if (a.name_of(t.x, t.y) === 'tilled') done++;
      } else {
        s.spend(spec.cost);
        a.set(t.x, t.y, 'watered');
        var c = g.world.objAt(t.x, t.y);
        if (c && c.kind === 'crop') c.watered = true;
        done++;
      }
    }
    if (done) {
      /* One splash and one sound for the whole sweep. Nine of each at once is
       * an unreadable smear and nine overlapping samples is a click. */
      g.fx.hit(mode === 'hoe' ? 'hoe' : mode === 'sow' ? 'weed' : 'water',
               cx, cy, g.player.face);
      g.sfx(mode === 'hoe' ? 'hoe' : mode === 'sow' ? 'pickup' : 'water');
      g.toast(spec.done(done));
    }
    return done;
  };

  /* The button itself. Appends nothing when there is no work to do nearby -
   * an option that is permanently greyed for a reason the player cannot see is
   * just noise in the menu. */
  /* Arm (or disarm) the seed that a tap on bare soil will plant. */
  UI.prototype.armSeed = function (name) {
    this.quickSeed = name || null;
    var chip = this.seedChip;
    if (!chip) return;
    if (!name) {
      chip.style.display = 'none';
      if (this.game) this.game.toast('Đã tắt gieo nhanh');
      return;
    }
    chip.innerHTML = '';
    chip.appendChild(icon(name, 'seed', 20));
    chip.appendChild(el('span', null, name));
    chip.appendChild(el('small', null, '· chạm để tắt'));
    chip.style.display = '';
    if (this.game) this.game.toast('Gieo nhanh: ' + name + ' — chạm ô đất là gieo');
  };

  /* How many of the armed seed are actually in the bag. */
  UI.prototype.quickSeedItem = function () {
    if (!this.quickSeed) return null;
    var inv = this.sim.inventory;
    for (var i = 0; i < inv.length; i++) {
      if (inv[i] && inv[i].name === this.quickSeed && inv[i].qty > 0) return inv[i];
    }
    return null;
  };

  UI.prototype.bulkOption = function (list, mode, cx, cy) {
    var self = this, spec = BULK[mode];
    var tiles = this.bulkTargets(mode, cx, cy);
    if (!tiles.length) {
      list.appendChild(el('div', 'sdv-sub', spec.none));
      return;
    }
    var need = tiles.length * spec.cost;
    var can = this.sim.energy >= need;
    var b = el('button', 'sdv-mbtn' + (can ? '' : ' sdv-off'));
    b.appendChild(el('span', null, spec.label + ' (' + tiles.length + ' ô)'));
    b.appendChild(el('small', 'sdv-cost',
      'Tốn ' + need + ' sức · đang có ' + Math.round(this.sim.energy)
      + (can ? '' : ' — không đủ')));
    b.addEventListener('click', function () {
      if (!can) {
        return self.game.toast('Không đủ sức: cần ' + need + ', đang có '
                               + Math.round(self.sim.energy));
      }
      self.bulkRun(mode, cx, cy);
      self.close();
    });
    list.appendChild(b);
  };

  /* Every farm tile is buildable - the brief asks for this explicitly. */
  UI.prototype.buildMenu = function (x, y) {
    var self = this, g = this.game, a = g.world.area();
    var body = el('div', 'sdv-body');
    var list = el('div', 'sdv-menu');
    // bare ground is the natural place for a tree, so the door is on both menus
    this.saplingOptions(x, y, list);
    /* Nine tiles at once, because hoeing a field one tap at a time is the
     * single most repeated action in the game. The cost is shown before the
     * tap, the button is visibly dead when the player cannot pay it, and the
     * charge is per tile ACTUALLY turned - tiles already tilled, occupied or
     * off the farm are skipped and cost nothing. */
    /* One tile or nine, offered together and priced together. They were on
     * the menu already but read as two unrelated things - "cuốc thành luống"
     * with no price next to a 3x3 sweep with one. The owner asked for the
     * choice to be explicit, so both now say what they cost and sit next to
     * each other. */
    list.appendChild(el('div', 'sdv-sub', 'Cuốc đất'));
    var oneCan = this.sim.energy >= 2 && !g.world.objAt(x, y);
    var one = el('button', 'sdv-mbtn' + (oneCan ? '' : ' sdv-off'));
    one.appendChild(el('span', null, '⛏ Cuốc 1 ô'));
    one.appendChild(el('small', 'sdv-cost',
      'Tốn 2 sức · đang có ' + Math.round(this.sim.energy)
      + (oneCan ? '' : (g.world.objAt(x, y) ? ' — ô này có vật cản' : ' — không đủ'))));
    one.addEventListener('click', function () {
      if (!oneCan) return self.game.toast('Không cuốc được ô này');
      g.hoeTile(x, y);
      self.close();
    });
    list.appendChild(one);
    this.bulkOption(list, 'hoe', x, y);
    var opts = [
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

  /* The bridge asks for materials exactly like everything else that does.
   *
   * It used to carry its own copy of the two-tap flow and say a flat "Chưa đủ
   * gỗ", while every machine in the house names what is short and by how much.
   * The design asks for one behaviour here - show the requirement, tap again
   * to build - so it uses the one implementation of it. */
  UI.prototype.repairMenu = function (o) {
    var self = this;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      'Cây cầu gãy. Sửa xong thì qua được bờ bên kia.'));
    body.appendChild(this.requirementButton('🔨 Sửa cầu', { Wood: 300 }, 0,
      function () {
        self.game.world.removeObj(o);
        self.game.toast('Đã sửa xong cầu!');
        self.close();
      }));
    this.openPanel('Cầu gãy', body);
  };

  // ---- shipping ----------------------------------------------------------
  UI.prototype.openShipping = function () {
    var self = this, s = this.sim;
    var body = el('div', 'sdv-body');
    var drop = el('div', 'sdv-drop',
      'Chạm một món trong túi để chọn số lượng bán'
      + '<br><small>hoặc chạm giữ món rồi kéo thả vào đây · tiền vào sáng hôm sau</small>');
    this.dropZone(drop, function (d) { self.sellSheet(d, 'bin'); },
                  'Chạm một món trong túi trước');
    body.appendChild(drop);

    var total = 0;
    s.shipped.forEach(function (r) { total += s.sellPrice(r.name, r.quality) * r.qty; });
    body.appendChild(el('div', 'sdv-sub', 'Đang chờ bán: ' + total + 'g'));
    var pending = el('div', 'sdv-list');
    s.shipped.forEach(function (r) {
      var q = r.quality || 0;
      var row = el('div', 'sdv-row');
      row.appendChild(el('span', 'sdv-name',
        r.name + ' (' + QUAL_VN[q] + ') ×' + r.qty));
      row.appendChild(el('span', 'sdv-price', (s.sellPrice(r.name, q) * r.qty) + 'g'));
      /* Taking a stack back out of the bin. WHY: the bin was one-way until
       * morning, so a mis-tap that posted a 20-stack could not be undone at
       * all - and a mis-tap was the normal outcome, because a tap sold. */
      var undo = el('button', 'sdv-undo', '↩');
      undo.title = 'Lấy lại';
      undo.addEventListener('click', function () {
        if (self.swallowClick()) return;
        if (!s.give(r.name, r.qty, q)) return self.game.toast('Túi đầy');
        var i = s.shipped.indexOf(r);
        if (i >= 0) s.shipped.splice(i, 1);
        self.game.sfx('pickup');
        self.game.toast('Đã lấy lại ' + r.name);
        self.openShipping();
      });
      row.appendChild(undo);
      pending.appendChild(row);
    });
    body.appendChild(pending);

    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < s.invSize; i++) {
      grid.appendChild(this.slotEl(s.inventory[i], s.inventory, i, {
        onClick: function (it, idx) {
          self.sellSheet({ it: it, list: s.inventory, index: idx }, 'bin');
        }
      }));
    }
    body.appendChild(el('div', 'sdv-sub', 'Túi đồ — chạm một món để chọn số lượng'));
    body.appendChild(grid);
    this.openPanel('Thùng giao hàng', body);
    this.refreshPanel = function () { self.openShipping(); };
  };

  UI.prototype.shipDragged = function () {
    /* WHY this no longer passes an index to ship(): it used to hand over the
     * index of an item held in the CHEST, and ship() read sim.inventory at that
     * index - so dropping a chest item on the bin sold an unrelated bag stack
     * and left the chest item exactly where it was. */
    var d = this.heldItem();
    if (!d) return this.game.toast('Chưa cầm món nào');
    this.sellSheet(d, 'bin');
  };

  /* "Post this whole stack" - kept as the plain programmatic helper. */
  UI.prototype.ship = function (idx) {
    return this.shipStack(this.sim.inventory, idx);
  };
  UI.prototype.shipStack = function (list, idx, n) {
    var it = list[idx];
    if (!it) return false;
    var info = this.sim.itemInfo(it.name);
    // an item worth nothing used to be swallowed for 0g and reported as sold
    if (!info || !info.sell) {
      this.game.toast(it.name + ' không bán được');
      return false;
    }
    n = Math.max(1, Math.min(n == null ? it.qty : n, it.qty));
    this.sim.shipped.push({ name: it.name, qty: n, quality: it.quality || 0 });
    it.qty -= n;
    if (it.qty <= 0) list.splice(idx, 1);
    this.game.toast('Đã bỏ vào thùng: ' + it.name + ' ×' + n);
    if (this.refreshPanel) this.refreshPanel();
    return true;
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
      /* Sorting moves the stacks a held item was indexed against, so the hold is
       * dropped first; and grades land next to each other rather than in
       * arrival order, which is the point of sorting a chest full of one crop. */
      self.clearHeld();
      self.sim.chest.sort(function (a, b) {
        return a.name.localeCompare(b.name) || (a.quality || 0) - (b.quality || 0);
      });
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
      /* Three more conditions the tables actually use, which were being ignored
       * - and an ignored condition reads as "no condition", so gated stock sat
       * on the shelf from day one. Willy was offering every hook and bobber at
       * fishing level 0, Marlon's rings ignored how deep the player had been,
       * and Marnie was asking 100,000g for a Golden Egg whose real condition is
       * a letter that this game never sends. */
      } else if ((m = t.match(/^PLAYER_BASE_(\w+)_LEVEL\s+\S+\s+(\d+)/i))) {
        var sk = m[1].toLowerCase();
        if ((s.skills[sk] || 0) < parseInt(m[2], 10)) ok = false;
      } else if ((m = t.match(/^MINE_LOWEST_LEVEL_REACHED\s+(\d+)/i))) {
        if ((s.deepestMine || 0) < parseInt(m[1], 10)) ok = false;
      } else if (/^PLAYER_HAS_MAIL\b/i.test(t)) {
        /* Fail closed on this one only. Every mail flag in the tables gates an
         * end-of-game reward this clone has no way to award, so treating it as
         * "no condition" put the most expensive item in the game on sale on the
         * first morning. Anything ELSE unrecognised still passes, so a new
         * condition keyword cannot silently empty a shop. */
        ok = false;
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

  /* Can the game actually DO anything with this item?
   *
   * WHY the shops need asking: the stock tables come straight out of the real
   * game's data, and this clone implements a fraction of it. Pierre was selling
   * Grass Starter (nothing plants grass), four soil products the tile menu has
   * no button for, and a 5,000g Dehydrator no code mentions; Robin's counter was
   * nine floor tiles and a Big Chest, not one of which any screen can place;
   * Marnie was asking 100,000g for a Golden Egg that does nothing. Money spent
   * on those is money burnt with no message, which is the worst kind of loss -
   * the player assumes they missed the button. A row nothing can use is not
   * offered.
   *
   * The test is deliberately generous: anything plantable, edible, buildable
   * with, feedable to a machine, or on the short list of things other systems
   * consume stays on the shelf. Only what nothing at all references goes. */
  /* Everything another screen consumes by name, gathered by reading those
   * screens rather than guessing: hay is fed to animals in the barn panel, the
   * crab pot is placed on water and re-baited, the bouquet and the pendant are
   * the two courtship items, and the quick-use row understands staircases,
   * bombs and geodes by pattern. Miss one of these and a real item disappears
   * from a shelf, so the list is deliberately wider than it needs to be. */
  var OTHER_USES = ['Hay', 'Crab Pot', 'Bait', 'Bouquet', "Mermaid's Pendant"];
  var OTHER_USE_RE = /(^|\s)(staircase|bomb|geode)$|geode$/i;
  var TILE_FERTS = ['Basic Fertilizer', 'Quality Fertilizer', 'Deluxe Fertilizer'];
  UI.prototype.shopItemUsable = function (name) {
    var g = this.game, s = this.sim;
    if (OTHER_USES.indexOf(name) >= 0) return true;
    if (OTHER_USE_RE.test(name)) return true;
    if (TILE_FERTS.indexOf(name) >= 0) return true;
    if ((g.data.fruitTrees || []).some(function (t) { return t.sapling === name; })) return true;
    // plantable: exactly the test plant() applies, so the two cannot drift apart
    var cropName = String(name).replace(/\s*Seeds?$/i, '').replace(/\s*Starter$/i, '');
    if ((g.data.crops || []).some(function (c) {
      return c.seed === name || c.name === cropName;
    })) return true;
    var info = s.itemInfo(name);
    if (info && info.energy != null) return true;              // it can be eaten
    var M = global.SDV_MACHINES;
    if (M && M.MACHINES) {
      var keys = Object.keys(M.MACHINES);
      for (var i = 0; i < keys.length; i++) {
        var d = M.MACHINES[keys[i]];
        if (d.craft && d.craft[name]) return true;             // builds a machine
        try {
          if (d.accept && d.accept({ name: name, qty: 99, quality: 0 }, s)) return true;
        } catch (e) { /* a recipe that throws on an unknown item is a "no" */ }
      }
    }
    return false;
  };

  UI.prototype.openShop = function (stockKey, keeper) {
    var self = this;
    var raw = (this.game.data.shops[stockKey] || []);
    /* One row per item, at the LOWER price. The tables list some items twice -
     * Pierre had Grass Starter at 100 AND at 1,000, the Blacksmith had every ore
     * twice - and two identical-looking rows at different prices is a trap:
     * whichever the player taps, they cannot tell they were overcharged.
     * The winners are collected into a fresh array rather than flagged on the
     * rows, because those rows ARE `game.data.shops` and writing to them would
     * make the filtering permanent for the rest of the session. */
    var best = {}, order = [];
    this.seasonalSeedRows(stockKey).concat(raw)
      .filter(function (r) { return self.shopRowAvailable(r.when); })
      .filter(function (r) { return self.shopItemUsable(r.item); })
      .forEach(function (r) {
        var prev = best[r.item];
        if (!prev) { order.push(r.item); best[r.item] = r; return; }
        if (r.price < prev.price) best[r.item] = r;
      });
    var stock = order.map(function (name) { return best[name]; })
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
    var sell = el('div', 'sdv-drop',
      'Chạm một món trong túi để BÁN'
      + '<br><small>chọn được số lượng · hoặc chạm giữ món rồi kéo thả vào đây</small>');
    /* WHY it goes through the amount sheet: this box used to sell the WHOLE
     * stack of whatever `dragging` pointed at, splicing by a remembered index -
     * so a bag that had changed since meant it credited one item's price and
     * deleted a different item. And there was never a way to sell only some. */
    this.dropZone(sell, function (d) { self.sellSheet(d, 'shop'); },
                  'Chạm một món trong túi trước');
    body.appendChild(sell);

    /* The bag goes directly under the sell box, ABOVE the stock list. WHY: the
     * stock runs to 140 rows, so "chạm một món trong túi" meant scrolling past
     * every seed in the shop before the bag was even on screen - which is a
     * good part of why selling to a shopkeeper felt impossible. */
    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < this.sim.invSize; i++) {
      grid.appendChild(this.slotEl(this.sim.inventory[i], this.sim.inventory, i, {
        onClick: function (it, idx) {
          self.sellSheet({ it: it, list: self.sim.inventory, index: idx }, 'shop');
        }
      }));
    }
    body.appendChild(el('div', 'sdv-sub',
      'Túi đồ — chạm một món để chọn số lượng bán'));
    body.appendChild(grid);

    /* An empty stock list used to be a heading with nothing under it, which
     * reads as a broken screen. Robin's counter is the one that lands here -
     * everything she sells is scenery this game cannot place - and what the
     * player actually wants from her is the building menu, so say so and open
     * it from here. */
    if (!stock.length) {
      body.appendChild(el('div', 'sdv-sub', 'Hôm nay quầy này không bán gì.'));
      if (this.openCarpenter && /Carpenter/i.test(stockKey || '')) {
        var cb = el('button', 'sdv-mbtn', '\ud83c\udfd7 Xem công trình xây dựng');
        cb.addEventListener('click', function () {
          if (self.swallowClick()) return;
          self.openCarpenter();
        });
        body.appendChild(cb);
      }
    } else {
      body.appendChild(el('div', 'sdv-sub', 'Hàng bán trong tiệm'));
    }
    this.backpackRows(body, stockKey);
    var list = el('div', 'sdv-list');
    stock.forEach(function (s) {
      var row = el('div', 'sdv-row sdv-buy');
      var info = self.sim.itemInfo(s.item);
      row.appendChild(icon(s.item, info ? info.cat : 'seed', 26));
      row.appendChild(el('span', 'sdv-name', s.item));
      row.appendChild(el('span', 'sdv-price', s.price + 'g'));
      row.addEventListener('click', function () {
        if (self.swallowClick()) return;
        if (self.sim.gold < s.price) return self.game.toast('Không đủ tiền');
        /* Ask give() rather than counting slots: a full bag can still absorb
         * an item that stacks onto something already in it. */
        if (!self.sim.give(s.item, 1)) return self.game.toast('Túi đầy');
        self.sim.gold -= s.price;
        self.game.sfx('coin');
        self.game.toast('Mua ' + s.item);
        self.updateHud();
        /* The bag under the stock list is stale the moment something is bought;
         * it used to keep showing the old contents until the panel was
         * re-opened, so a bought seed looked like it had gone nowhere. */
        if (self.refreshPanel) self.refreshPanel();
      });
      list.appendChild(row);
    });
    body.appendChild(list);
    this.openPanel(keeper || 'Cửa hàng', body);
    this.refreshPanel = function () { self.openShop(stockKey, keeper); };
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
  /* The two backpack upgrades, sold over Pierre's counter.
   *
   * Official wiki, Tools page, read 2026-08-23: the starting Backpack holds
   * 12 stacks; the Large Pack (24 slots) costs 2,000g and is "Purchased from
   * Pierre's General Store at the start of the game"; the Deluxe Pack (36
   * slots) costs 10,000g and is purchased there "after buying 24 Size
   * Backpack" - so the second is gated behind the first, not merely behind
   * its own price.
   *
   * These are rows rather than shop stock because they are not items: nothing
   * lands in the bag, the bag itself changes size. */
  UI.prototype.backpackRows = function (body, stockKey) {
    var self = this, s = this.sim;
    // his own counter only - the festival stalls are also keyed "Pierre"
    if (String(stockKey || '') !== "Pierre's General Store") return;
    var STEPS = [{ n: 24, g: 2000, name: 'Túi lớn (24 ô)' },
                 { n: 36, g: 10000, name: 'Túi hạng sang (36 ô)' }];
    body.appendChild(el('div', 'sdv-sub', 'Nâng cấp túi đồ'));
    var wrap = el('div', 'sdv-list');
    STEPS.forEach(function (st, i) {
      var owned = s.invSize >= st.n;
      // the deluxe pack is not offered until the large one is owned
      var gated = i > 0 && s.invSize < STEPS[i - 1].n;
      var afford = s.gold >= st.g;
      var row = el('div', 'sdv-row sdv-buy'
        + (owned || gated || !afford ? ' sdv-off' : ''));
      row.appendChild(icon('Backpack', 'crafted', 26));
      var col = el('div', 'sdv-col');
      col.appendChild(el('span', 'sdv-name', st.name));
      col.appendChild(el('small', owned ? 'sdv-cost' : 'sdv-need',
        owned ? 'Đã mua rồi'
              : gated ? 'Phải mua túi lớn trước'
              : 'Đang có ' + s.invSize + ' ô — thêm ' + (st.n - s.invSize) + ' ô'));
      row.appendChild(col);
      row.appendChild(el('span', 'sdv-price', st.g.toLocaleString('vi-VN') + 'g'));
      row.addEventListener('click', function () {
        if (self.swallowClick()) return;
        if (owned) return self.game.toast('Bạn đã có túi này rồi');
        if (gated) return self.game.toast('Phải mua túi lớn trước đã');
        if (!afford) return self.game.toast('Không đủ tiền');
        s.gold -= st.g;
        s.invSize = st.n;
        self.game.sfx('coin');
        self.game.toast('Túi đồ giờ có ' + st.n + ' ô!');
        self.close();
        self.openShop(stockKey);
      });
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
  };

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
    this.dropZone(slot, function (d) { self.doGift(npc, d); },
                  'Chạm một món trong túi trước');
    giftWrap.appendChild(slot);
    body.appendChild(giftWrap);

    var grid = el('div', 'sdv-grid');
    for (var i = 0; i < s.invSize; i++) {
      grid.appendChild(this.slotEl(s.inventory[i], s.inventory, i, {
        onClick: function (it, idx) {
          self.doGift(npc, { it: it, list: s.inventory, index: idx });
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

  UI.prototype.doGift = function (npc, d) {
    d = d || this.heldItem();
    if (!d) return this.game.toast('Chạm một món trong túi trước');
    this.clearHeld();
    var res = this.sim.giveGift(npc.name, d.it.name);
    if (res.refused === 'day') return this.game.toast('Hôm nay đã tặng rồi');
    if (res.refused === 'week') return this.game.toast('Tuần này đã tặng đủ 2 món');
    if (res.refused === 'missing') return this.game.toast('Không còn món đó trong túi');
    /* The emptied stack is removed by identity: splicing the index recorded at
     * pick-up time threw away whichever stack had slid into that position. */
    var i = d.list.indexOf(d.it);
    d.it.qty--;
    if (d.it.qty <= 0 && i >= 0) d.list.splice(i, 1);
    var msg = { love: 'rất thích!', like: 'thích', neutral: 'bình thường',
                dislike: 'không thích', hate: 'ghét' }[res.taste];
    this.game.sfx(res.points > 0 ? 'harvest' : 'error');
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
        self.game.sfx('bundle');
        self.game.toast('Hoàn thành ' + b.name + '!');
        self.openBundles(room);
      });
      box.appendChild(btn);
      body.appendChild(box);
    });
    this.openPanel(room, body);
  };

  // ---- craft -------------------------------------------------------------
  // ---- recipes: what the player knows, and how they learn it ---------------
  /* Every cooking and crafting recipe in the game was available from the first
   * morning, which is the defect this section exists to fix. Both tables ship
   * with the real condition attached and neither was ever read:
   *
   *  - cooking (81 recipes) carries `source` in the game's own notation:
   *      "default"        known from the start                      (1)
   *      "l 10"           Queen of Sauce, television, episode 10    (34)
   *      "f Emily 3"      three hearts with Emily                   (36)
   *      "s Farming 3"    that skill at that level                  (9)
   *  - crafting (150 recipes) had its condition destroyed in extraction - the
   *    field reads "false" / "true" / "Ring" - so the real ones are rebuilt by
   *    docs/research/stardew/tools/build_recipe_unlock.py into
   *    data/recipes_unlock.js, which this reads.
   *
   * A locked recipe is shown, greyed, with the thing to go and do spelled out.
   * Hiding it would remove the goal, which is the opposite of what was asked
   * for: the player is meant to see the dish and know what it costs them. */

  /* The unlock table is loaded by index.html like every other data file, and
   * is listed in the boot guard there, so a fetch that fails is retried once
   * and then REPORTED rather than swallowed. It was briefly injected from here
   * instead; two ways to load one file is how a stale copy ends up winning.
   * The reader below still fails OPEN when the table is absent - a missing
   * data file must not be able to lock a player out of their own game. */

  var SKILL_VN = {
    farming: 'Nông nghiệp', mining: 'Khai thác', foraging: 'Hái lượm',
    fishing: 'Câu cá', combat: 'Chiến đấu'
  };

  /* The Queen of Sauce airs on Sunday. The cooking table names 34 episodes;
   * they are handed out one per week in episode order, so a player always has
   * exactly one dish to be waiting for. Miss one and it comes back around
   * after the list has been through once, same as the original's reruns. */
  UI.prototype.tvSchedule = function () {
    if (this._tvOrder) return this._tvOrder;
    var list = (this.game.data.recipes.cooking || []).filter(function (r) {
      return /^l\s+\d+/.test(String(r.source || ''));
    });
    list.sort(function (a, b) {
      var ea = +String(a.source).split(/\s+/)[1], eb = +String(b.source).split(/\s+/)[1];
      return ea - eb || (a.name < b.name ? -1 : 1);
    });
    this._tvOrder = list;
    return list;
  };
  UI.prototype.tvToday = function () {
    var s = this.sim;
    if (((s.day - 1) % 7) !== 6) return null;      // Sunday only
    var order = this.tvSchedule();
    if (!order.length) return null;
    return order[Math.floor(s.dayIndex() / 7) % order.length];
  };

  UI.prototype.recipeStore = function () {
    var s = this.sim;
    s.flags = s.flags || {};
    if (!s.flags.recipes) s.flags.recipes = {};
    return s.flags.recipes;
  };

  /* Normalise both notations into one shape. Returns null when nothing is
   * known about a recipe, which is read as "no condition" - fail open. */
  UI.prototype.recipeCond = function (kind, r) {
    if (kind === 'crafting') {
      var tbl = global.SDV_RECIPE_UNLOCK;
      if (!tbl) return null;
      /* The wiki writes a recipe that yields a stack as "Bait (5)"; this
       * build's table writes the bare name. Keyed raw, 63 of the 150 crafting
       * recipes missed and fell through to "no condition", which unlocks
       * them - this gate quietly failing open on nearly half the table. */
      return tbl[r.name] || tbl[r.name.replace(/\s*\(\d+\)\s*$/, '').trim()] || null;
    }
    var src = String(r.source == null ? '' : r.source).trim();
    /* One cooking row (Cookie) carries the literal string "null" where its
     * source should be. A data hole must fail OPEN - showing the player a
     * requirement of "null" they can never satisfy is worse than handing them
     * one recipe they had not quite earned. */
    if (!src || src === 'default' || src === 'null' || src === 'undefined') {
      return { k: 'start' };
    }
    var p = src.split(/\s+/);
    if (p[0] === 'l') return { k: 'tv', ep: +p[1] };
    if (p[0] === 'f') return { k: 'heart', who: p[1], n: +p[2] };
    if (p[0] === 's') {
      var sk = String(p[1] || '').toLowerCase();
      /* Stardew's Luck skill is unfinished in the real game and this build has
       * no counterpart, so the one recipe behind it says so rather than
       * pretending there is something to go and do. */
      if (!SKILL_VN[sk]) return { k: 'special', t: 'Kỹ năng ' + p[1] + ' (bản này chưa có)' };
      return { k: 'skill', s: sk, n: +p[2] };
    }
    return { k: 'special', t: src };
  };

  // Conditions the game can check on its own, and therefore grant on its own.
  UI.prototype.condMet = function (c) {
    var s = this.sim;
    if (!c) return true;
    if (c.k === 'start') return true;
    if (c.k === 'skill') return (s.skills[c.s] || 0) >= c.n;
    if (c.k === 'heart') return s.hearts(c.who) >= c.n;
    /* "have held one" is a latch, not a look in the bag: a player who smelted
     * their copper before opening the crafting screen has still collected it,
     * and taking the recipe away again would be absurd. */
    if (c.k === 'have') return !!(s.flags && s.flags.held && s.flags.held[c.item]);
    return false;     // tv / buy / special are granted by their own action
  };

  UI.prototype.condText = function (c) {
    if (!c) return '';
    switch (c.k) {
      case 'start': return '';
      case 'skill': return 'Cần ' + (SKILL_VN[c.s] || c.s) + ' cấp ' + c.n;
      case 'heart': return 'Cần ' + c.n + ' tim với ' + c.who;
      case 'tv': return 'Xem tivi tập ' + c.ep + ' (Nữ hoàng Nước sốt, chủ nhật)';
      case 'buy': return 'Mua ' + c.g.toLocaleString('vi-VN') + 'g — ' + c.w;
      case 'have': return 'Cần nhặt được ' + c.item + ' một lần';
      default: return c.t || 'Chưa mở khóa';
    }
  };

  /* Keyed by KIND and name, not by name alone.
   *
   * Five dishes - Carp Surprise, Eggplant Parmesan, Rice Pudding, Cranberry
   * Sauce, Stuffing - also appear as rows in the crafting table, where they
   * have no unlock entry and so fail open. With a single shared key that
   * open verdict was written into the store under the bare name and the
   * COOKING gate then read it back as "already learned", handing over five
   * seven-heart recipes on the first morning. */
  UI.prototype.recipeKey = function (kind, r) {
    return (kind === 'cooking' ? 'cook:' : 'craft:') + r.name;
  };

  UI.prototype.recipeKnown = function (kind, r) {
    var store = this.recipeStore();
    if (store[this.recipeKey(kind, r)]) return true;
    var c = this.recipeCond(kind, r);
    // an unknown condition fails open, but is never written to the store
    return this.condMet(c);
  };

  /* Walks both tables and grants anything whose condition is now satisfied.
   * Called from the HUD tick rather than from the places that raise a skill or
   * a heart, because those live in files this pass does not own - and a poll
   * catches every route into them, including ones added later. */
  UI.prototype.scanRecipeUnlocks = function (quiet) {
    var self = this, store = this.recipeStore(), fresh = [];
    ['cooking', 'crafting'].forEach(function (kind) {
      (self.game.data.recipes[kind] || []).forEach(function (r) {
        var key = self.recipeKey(kind, r);
        if (store[key]) return;
        var c = self.recipeCond(kind, r);
        /* A recipe with no known condition is left ALONE. It reads as known
         * (fail open) but writing that verdict down would make a later,
         * better unlock table unable to take it back. */
        if (!c) return;
        if (c.k === 'start') { store[key] = 1; return; }
        if (self.condMet(c)) { store[key] = 1; fresh.push(r.name); }
      });
    });
    if (!quiet && fresh.length) {
      this.game.toast('📖 Học được công thức: ' + fresh.slice(0, 3).join(', ')
        + (fresh.length > 3 ? ' +' + (fresh.length - 3) : ''));
    }
    return fresh;
  };

  /* MIGRATION, stated plainly because it costs the player something.
   *
   * Before this pass every recipe was craftable, so a save from then could
   * make anything. There is no way to keep that AND have unlocking mean
   * anything, so the rule is: a save opened for the first time under the new
   * rules keeps everything it has already CRAFTED at least once, plus
   * everything its skills, hearts and starter set already earn it. What it
   * loses is access to recipes it never actually used - and the screen now
   * tells it exactly how to get each one back.
   *
   * `sim.crafted` is the existing tally of what has been made, which is what
   * makes the "already used it" half possible at all. */
  UI.prototype.migrateRecipes = function () {
    var s = this.sim;
    s.flags = s.flags || {};
    if (s.flags.recipeMigration) return 0;
    s.flags.recipeMigration = 1;
    var store = this.recipeStore(), kept = 0;
    /* Two records of "the player has already made this", and both are honoured:
     *  - flags.everMade, written by the crafting and cooking screens since
     *    this pass, already keyed by screen;
     *  - sim.crafted, which predates it. That one is really the machine
     *    screen's queue of machines built but not yet placed, so it is a thin
     *    signal - but a machine sitting in it was unambiguously made by this
     *    player, and taking its recipe away would be wrong.
     * Anything else the save could make is re-earned through the conditions
     * below, and the screen now says what each one needs. */
    var ever = (s.flags && s.flags.everMade) || {};
    for (var k in ever) {
      if (ever[k] && !store[k]) { store[k] = 1; kept++; }
    }
    var made = s.crafted || {};
    for (var name in made) {
      if (!made[name]) continue;
      var ck = 'craft:' + name;
      if (!store[ck]) { store[ck] = 1; kept++; }
    }
    this.scanRecipeUnlocks(true);
    if (kept) {
      this.game.toast('Giữ lại ' + kept + ' công thức bạn đã từng làm.');
    }
    return kept;
  };

  /* One list renderer for cooking and for crafting. They differed only in the
   * table they read and the two words on the button, and keeping two copies is
   * how the gate ends up on one screen and not the other. */
  UI.prototype.recipeList = function (kind, title) {
    var self = this, s = this.sim;
    var table = this.game.data.recipes[kind] || [];
    var verb = kind === 'cooking' ? 'Nấu' : 'Chế tạo';
    var body = el('div', 'sdv-body');
    var search = el('input', 'sdv-search');
    search.placeholder = kind === 'cooking' ? 'Tìm món…' : 'Tìm công thức…';
    body.appendChild(search);
    var tally = el('div', 'sdv-sub');
    body.appendChild(tally);
    var list = el('div', 'sdv-list');
    body.appendChild(list);

    function render() {
      list.innerHTML = '';
      var q = search.value.toLowerCase();
      var known = 0, total = 0;
      var rows = table.filter(function (r) {
        total++;
        if (self.recipeKnown(kind, r)) known++;
        return !q || r.name.toLowerCase().indexOf(q) >= 0;
      });
      tally.textContent = 'Đã biết ' + known + '/' + total + ' công thức. '
        + 'Món xám là chưa học — dòng chữ vàng nói cần làm gì.';
      /* Known recipes first: a list that opens on forty locked entries reads
       * as a wall, and the three things the player can actually make now are
       * what they came here for. */
      rows.sort(function (a, b) {
        var ka = self.recipeKnown(kind, a) ? 0 : 1;
        var kb = self.recipeKnown(kind, b) ? 0 : 1;
        return ka - kb;
      });
      rows.slice(0, 90).forEach(function (r) {
        var isKnown = self.recipeKnown(kind, r);
        var cond = self.recipeCond(kind, r);
        var ing = r['in'] || [];
        var haveAll = ing.length && ing.every(function (i) {
          return s.count(i.item) >= i.qty;
        });
        var row = el('div', 'sdv-row sdv-buy'
          + (isKnown && haveAll ? '' : ' sdv-off')
          + (isKnown ? '' : ' sdv-locked'));
        row.appendChild(icon(r.name, kind === 'cooking' ? 'cooked' : 'crafted', 26));
        var col = el('div', 'sdv-col');
        col.appendChild(el('span', 'sdv-name',
          (isKnown ? '' : '🔒 ') + r.name));
        if (isKnown) {
          col.appendChild(el('small', 'sdv-cost',
            (ing.length
              ? ing.map(function (i) {
                  return i.item + ' ' + s.count(i.item) + '/' + i.qty;
                }).join(' · ')
              : 'Không rõ nguyên liệu')
            + (r.energy ? ' · +' + r.energy + ' sức' : '')));
        } else {
          col.appendChild(el('small', 'sdv-need', self.condText(cond)));
        }
        row.appendChild(col);

        /* A recipe the shops sell is bought here with gold. The original sells
         * it over a counter; this build has no recipe stock in its shops, and
         * a purchase the player can actually make is closer to the intent than
         * a line of text they can never act on. The shop is still named. */
        if (!isKnown && cond && cond.k === 'buy') {
          var buy = el('button', 'sdv-learnbtn'
            + (s.gold >= cond.g ? '' : ' sdv-off'), 'Mua');
          buy.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (s.gold < cond.g) return self.game.toast('Không đủ tiền');
            s.gold -= cond.g;
            self.recipeStore()[self.recipeKey(kind, r)] = 1;
            self.game.toast('Đã học công thức ' + r.name);
            render();
          });
          row.appendChild(buy);
        }

        row.addEventListener('click', function () {
          if (!isKnown) return self.game.toast(self.condText(cond) || 'Chưa học công thức này');
          if (!ing.length) return self.game.toast('Công thức này thiếu dữ liệu nguyên liệu');
          if (!haveAll) return self.game.toast('Chưa đủ nguyên liệu');
          if (!s.hasSpace()) return self.game.toast('Túi đầy');
          ing.forEach(function (i) { s.take(i.item, i.qty); });
          s.give(r.name, 1);
          /* NOT sim.crafted. That map is the machine screen's queue of
           * machines that have been built but not yet PLACED on the farm, and
           * writing a recipe name into it would have handed the player a free
           * placeable machine on top of the item that just went into their
           * bag. `everMade` is this screen's own record. */
          s.flags = s.flags || {};
          s.flags.everMade = s.flags.everMade || {};
          s.flags.everMade[self.recipeKey(kind, r)] = 1;
          self.game.toast(verb + ' xong ' + r.name);
          render();
        });
        list.appendChild(row);
      });
    }
    search.addEventListener('input', render);
    render();
    this.openPanel(title, body);
  };

  UI.prototype.openCraft = function () { this.recipeList('crafting', 'Chế tạo'); };

  /* Cooking, behind the same unlock gate as crafting. This was briefly
   * installed at run time to beat a second, ungated copy of the screen in
   * js/panels.js; that copy has been deleted, so a plain definition is enough
   * and there is one cooking screen again. */
  UI.prototype.openKitchen = function () { this.recipeList('cooking', 'Bếp'); };

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

  // ---- sound -------------------------------------------------------------
  /* Three sliders and a mute, because the three layers want different levels:
   * a player who finds the tune repetitive after an hour should be able to
   * turn it off and keep the birds and the axe. Settings are remembered. */
  UI.prototype.openSound = function () {
    var self = this, AU = global.SDV_AUDIO;
    var body = el('div', 'sdv-body');
    if (!AU) {
      body.appendChild(el('div', 'sdv-sub', 'Trình duyệt này không phát được âm thanh.'));
      return this.openPanel('Âm thanh', body);
    }
    body.appendChild(el('div', 'sdv-sub',
      'Nhạc, tiếng nền và tiếng động đều được tạo bằng mã lúc chạy — '
      + 'không có tệp âm thanh nào trong game.'));

    var mute = el('button', 'sdv-mbtn',
                  AU.settings.muted ? '🔇 Đang tắt tiếng — bật lại' : '🔊 Tắt tiếng');
    mute.addEventListener('click', function () {
      AU.setMuted(!AU.settings.muted);
      self.openSound();
    });
    body.appendChild(mute);

    [['music', '🎵 Nhạc nền'], ['amb', '🌿 Tiếng thiên nhiên'],
     ['sfx', '🔨 Tiếng động']].forEach(function (row) {
      var wrap = el('div', 'sdv-sndrow');
      wrap.appendChild(el('span', 'sdv-sndlabel', row[1]));
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '100';
      inp.value = String(Math.round(AU.settings[row[0]] * 100));
      inp.className = 'sdv-slider';
      var val = el('span', 'sdv-sndval', inp.value + '%');
      inp.addEventListener('input', function () {
        AU.setLevel(row[0], +inp.value / 100);
        val.textContent = inp.value + '%';
        if (row[0] === 'sfx') AU.play('tap');
      });
      wrap.appendChild(inp);
      wrap.appendChild(val);
      body.appendChild(wrap);
    });

    var test = el('button', 'sdv-mbtn', '▶ Nghe thử tiếng động');
    test.addEventListener('click', function () {
      ['chop', 'smash', 'water', 'coin', 'levelup'].forEach(function (n, i) {
        setTimeout(function () { AU.play(n); }, i * 320);
      });
    });
    body.appendChild(test);
    this.openPanel('Âm thanh', body);
  };

  // ---- tv / sleep --------------------------------------------------------
  UI.prototype.openTv = function () {
    var self = this, s = this.sim;
    var body = el('div', 'sdv-body');
    var wx = { sun: 'nắng', rain: 'mưa', storm: 'bão', snow: 'tuyết', wind: 'gió' };
    body.appendChild(el('div', 'sdv-speech',
      'Dự báo: mai trời ' + (wx[s.tomorrowWeather] || 'nắng') + '.'));
    body.appendChild(el('div', 'sdv-speech', 'Vận may hôm nay: ' + s.luckText() + '.'));

    /* The Queen of Sauce. Thirty-four of the eighty-one cooking recipes are
     * learned from this programme and there was no way to learn any of them,
     * because the television only ever read out the weather. One episode a
     * week, on Sunday, and the player has to be in front of it - which is the
     * point: it is a reason to walk home. */
    var show = self.tvToday();
    var store = self.recipeStore();
    var showKey = show ? 'cook:' + show.name : '';
    if (show && !store[showKey]) {
      var btn = el('button', 'sdv-mbtn',
        '📺 Nữ hoàng Nước sốt — xem tập hôm nay');
      btn.appendChild(el('small', 'sdv-cost', 'Học được món ' + show.name));
      btn.addEventListener('click', function () {
        store[showKey] = 1;
        self.game.toast('📖 Học được món ' + show.name + '!');
        self.close();
      });
      body.appendChild(btn);
    } else if (show) {
      body.appendChild(el('div', 'sdv-speech',
        'Nữ hoàng Nước sốt: hôm nay chiếu lại món ' + show.name
        + ', bạn đã biết làm rồi.'));
    } else {
      /* Say when it is on. A weekly programme nobody is told the day of is a
       * mechanic the player finds by accident or never. */
      var order = self.tvSchedule();
      var next = order.length
        ? order[Math.floor((s.dayIndex() + (7 - ((s.day - 1) % 7) - 1)) / 7) % order.length]
        : null;
      body.appendChild(el('div', 'sdv-speech',
        'Nữ hoàng Nước sốt chiếu vào chủ nhật hằng tuần.'
        + (next ? ' Chủ nhật này: ' + next.name + '.' : '')));
    }
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
    /* Everything else the night produced.
     *
     * WHY it is here: the night already counted all of this and handed it over,
     * and this screen threw every number on the floor. A player who had built a
     * coop, set a crab pot and started a keg was told none of it had happened
     * and had to walk round the farm checking by hand - and the morning summary
     * is the reward screen of a farming game. Only non-zero lines are shown, so
     * a quiet night still reads as a quiet night rather than a wall of zeros.
     * report.today is deliberately not touched here: the festival / post /
     * cart / train notes are added by the panels layer on top of this. */
    [['\ud83e\udd5a', report.animalProduce, 'con vật cho sản phẩm'],
     ['\u2699\ufe0f', report.machines, 'máy làm xong đồ, ra lấy được'],
     ['\ud83e\udd90', report.pots, 'lồng cua có đồ'],
     ['\ud83c\udf3f', report.forage, 'chỗ mọc đồ hái mới ngoài đồ']
    ].forEach(function (row) {
      if (!row[1]) return;
      body.appendChild(el('div', 'sdv-sub', row[0] + ' ' + row[1] + ' ' + row[2]));
    });
    body.appendChild(el('div', 'sdv-sub', 'Vận may: ' + this.sim.luckText()));
    var b = el('button', 'sdv-mbtn', 'Bắt đầu ngày mới');
    b.addEventListener('click', function () { self.close(); });
    body.appendChild(b);
    this.openPanel(this.sim.seasonVN() + ' ' + this.sim.day + ' · Năm ' + this.sim.year, body);
  };

  // ---- fishing -----------------------------------------------------------
  /* Rewritten 2026-08-23 against the game's own bobber-bar, because the
   * version before it reproduced almost none of the original.
   *
   * WHAT WAS MEASURED FIRST, in a real browser on a 430x860 screen, sampling
   * the fish marker's position for five seconds per run:
   *
   *     difficulty  15  ->  26.6 pixels of travel per second
   *     difficulty  50  ->  27.7
   *     difficulty  80  ->  27.5
   *     difficulty 110  ->  29.2
   *     dart 27.4 · floater 27.7 · sinker 27.0 · smooth 27.7
   *
   * The entire 15..110 difficulty range - every fish in the valley, from Carp
   * to Legend - changed the fish's movement by ten percent, and the five
   * behaviours were indistinguishable from one another. A floater and a
   * sinker both sat in the middle of the track (median height 124 and 132 out
   * of 260) when the whole point of those two words is that one rides up and
   * the other drags down. The two numbers the data carries for every fish
   * were, in practice, decoration.
   *
   * The progress meter was the other half of it: it rose 0.011 per sixtieth
   * of a second and fell 0.0085, so it FILLED FASTER THAN IT DRAINED, and
   * starting from 0.4 a catch was over in about nine tenths of a second. The
   * original fills at 0.002 and drains at 0.003 from a start of 0.3 - it
   * drains half again as fast as it fills, and an uninterrupted catch takes
   * five and a half seconds. That inversion is the whole "feel" complaint.
   *
   * SOURCES, all read 2026-08-23:
   *  - Fishing, official wiki, via the MediaWiki API (the HTML page 403s):
   *    "The total number of pixels of the entire rectangle is 568. At Fishing
   *    level 0, the bar size has a length of 96 pixels ... increased by 8
   *    pixels for every increase in fishing level"; bite time is "a random
   *    number between 0.6 and 30 seconds", each level takes 0.25s off the
   *    maximum, the first bite of a cast takes 25% off both ends, bait halves
   *    both ends, and the minimum can never fall below 0.5s; a Perfect catch
   *    (the fish never left the rectangle) raises silver/gold by one grade
   *    and multiplies experience by 2.4; experience is
   *    (quality + 1) * 3 + difficulty / 3; a treasure chest appears "between
   *    1 and 3 seconds after it starts" with a base chance of 15% adjusted by
   *    half of daily luck, and "losing the fish also loses the treasure
   *    chest".
   *  - Modding:Fish data, official wiki: field 1 is "chance to dart ... How
   *    often the fish darts in the fishing minigame; between 15 (carp) and
   *    100 (glacierfish)", field 2 is "darting randomness ... one of mixed,
   *    smooth, floater, sinker, or dart". So `difficulty` is not an abstract
   *    hardness score - it is literally how often and how far the fish jumps,
   *    and it also decides where the fish starts out on the track.
   *  - StardewValley/Menus/BobberBar.cs, the decompiled game source, for the
   *    motion itself. Every constant in fishTick below is copied from its
   *    update(), which is why that function runs on a fixed 60 Hz clock: the
   *    numbers are per-tick, not per-second, and rewriting them as rates
   *    would quietly change the game at any other frame rate.
   */

  // The bobber bar's track is 568 units tall in the original and everything
  // below is in those units, scaled to whatever height the CSS gives us.
  var FISH_TRACK = 568;
  /* The fish is 28 units tall and the collision test reaches 12 units past
   * the bottom of the track, so the drawing space is a little taller than the
   * track itself. Drawing and collision must use the same space or the player
   * is told a lie about where the fish is. */
  var FISH_VIEW = 580;
  var FISH_MOTION = { mixed: 0, dart: 1, smooth: 2, sinker: 3, floater: 4 };

  // Game1.random.Next(lo, hi) is inclusive of lo and exclusive of hi.
  function fishRand(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo)); }
  /* Collision happens in the original's coordinates, where the bar's top is
   * `barPos - 32` and can be negative; drawing needs those same numbers
   * shifted so nothing lands outside the box. One function, used by both, so
   * the two can never drift apart and draw the player a fish that is not
   * where the meter thinks it is. */
  function fishView(v) { return v + 32; }

  /* One tick of the original's update(), at 60 Hz. `s` is the whole minigame
   * state; it is mutated in place and returns nothing. Kept as a free
   * function so the regression tests can step it without a browser. */
  function fishTick(s) {
    var difficulty = s.difficulty, motion = s.motion;

    /* Pick a new place to swim to. The rate is difficulty/4000 per tick, so a
     * Carp re-aims about once every four and a half seconds and a Legend
     * about once every 0.6s - this single line is most of what the difficulty
     * number is FOR. `smooth` fish re-aim twenty times as often but only when
     * they have arrived, which is what makes them glide instead of jitter. */
    if (Math.random() < difficulty * (motion !== 2 ? 1 : 20) / 4000
        && (motion !== 2 || s.target === -1)) {
      var spaceBelow = 548 - s.pos, spaceAbove = s.pos;
      var percent = Math.min(99, difficulty + fishRand(10, 45)) / 100;
      s.target = s.pos + fishRand(-Math.floor(spaceAbove), Math.floor(spaceBelow)) * percent;
    }

    /* A floater builds upward drift and a sinker builds downward drift, both
     * capped at 1.5 units per tick. This is the entire difference between
     * those two words and the previous version had neither. */
    if (motion === 4) s.drift = Math.max(s.drift - 0.01, -1.5);
    else if (motion === 3) s.drift = Math.min(s.drift + 0.01, 1.5);

    if (Math.abs(s.pos - s.target) > 3 && s.target !== -1) {
      /* Harder fish accelerate harder toward their target: the divisor falls
       * from about 110 at difficulty 15 to about 20 at difficulty 100. */
      var a = (s.target - s.pos) / (fishRand(10, 30) + (100 - Math.min(100, difficulty)));
      s.speed += (a - s.speed) / 5;
    } else if (motion !== 2 && Math.random() < difficulty / 2000) {
      s.target = s.pos + (Math.random() < 0.5 ? fishRand(-100, -51) : fishRand(50, 101));
    } else {
      s.target = -1;
    }

    /* A darter gets a second, much wider jump on top of everything else, and
     * the width of that jump scales with its own difficulty. */
    if (motion === 1 && Math.random() < difficulty / 1000) {
      s.target = s.pos + (Math.random() < 0.5
        ? fishRand(-100 - difficulty * 2, -51)
        : fishRand(50, 101 + difficulty * 2));
    }

    s.target = Math.max(-1, Math.min(s.target, 548));
    s.pos += s.speed + s.drift;
    if (s.pos > 532) s.pos = 532; else if (s.pos < 0) s.pos = 0;

    /* The original's containment test, offsets and all: the fish occupies
     * [pos-16, pos+12] and the bar occupies [barPos-32, barPos-32+barH]. We
     * draw both from exactly these numbers below, so what the player sees is
     * what is actually being tested. */
    var barTop = s.barPos - 32;
    s.inBar = (s.pos + 12 <= barTop + s.barH) && (s.pos - 16 >= barTop);
    // both pinned to the floor counts as caught, or the last unit is unwinnable
    if (s.pos >= 548 - s.barH && s.barPos >= FISH_TRACK - s.barH - 4) s.inBar = true;

    /* Gravity flips sign while the button is held - that is the whole control
     * scheme, and it is why the bar overshoots: the speed it built up on the
     * way has to be paid back before it turns around. */
    var gravity = s.held ? -0.25 : 0.25;
    if (s.held && (s.barPos === 0 || s.barPos === FISH_TRACK - s.barH)) s.barSpeed = 0;
    if (s.inBar) gravity *= 0.6;   // the bar is easier to hold once it is on
    s.barSpeed += gravity;
    s.barPos += s.barSpeed;
    if (s.barPos + s.barH > FISH_TRACK) {
      s.barPos = FISH_TRACK - s.barH;
      s.barSpeed = -s.barSpeed * 2 / 3;
    } else if (s.barPos < 0) {
      s.barPos = 0;
      s.barSpeed = -s.barSpeed * 2 / 3;
    }

    // treasure chest: its own meter, filled by parking the bar over it
    s.chestInBar = false;
    if (s.treasure) {
      s.chestTimer -= 1000 / 60;
      if (s.chestTimer <= 0) {
        if (s.chestPos == null) {
          s.chestPos = s.barPos > 274
            ? fishRand(8, Math.max(9, Math.floor(s.barPos) - 20))
            : fishRand(Math.min(499, Math.floor(s.barPos + s.barH)), 500);
        }
        s.chestInBar = (s.chestPos + 12 <= barTop + s.barH) && (s.chestPos - 16 >= barTop);
        if (s.chestInBar && !s.chestCaught) {
          s.chestLevel += 0.0135;
          if (s.chestLevel >= 1) s.chestCaught = true;
        } else if (!s.chestCaught) {
          s.chestLevel = Math.max(0, s.chestLevel - 0.01);
        }
      }
    }

    if (s.inBar) {
      s.progress += 0.002;
    } else {
      /* Leaving the bar even once costs the Perfect bonus. The chest is
       * exempt only while it is being reeled in, same as the original. */
      if (!(s.chestInBar && !s.chestCaught)) s.perfect = false;
      s.progress -= 0.003;
    }
    s.progress = Math.max(0, Math.min(1, s.progress));
    s.ticks++;
  }
  // exported so the regression suite can measure the model without a browser
  UI.fishTick = fishTick;
  UI.newFishState = function (difficulty, behavior, level, treasure) {
    var motion = FISH_MOTION[String(behavior || 'mixed').toLowerCase()];
    if (motion == null) motion = 0;
    var d = Math.max(15, Math.min(110, difficulty || 50));
    var barH = Math.min(FISH_TRACK - 8, 96 + (level || 0) * 8);
    return {
      difficulty: d, motion: motion, barH: barH,
      barPos: FISH_TRACK - barH, barSpeed: 0,
      /* The fish starts at the bottom and is pulled toward a height set by its
       * difficulty, so a hard fish is already running for the top of the track
       * before the player has touched anything. */
      pos: 508, speed: 0, drift: 0, target: (100 - d) / 100 * 548,
      progress: 0.3, perfect: true, held: false, inBar: false, ticks: 0,
      treasure: !!treasure, chestTimer: fishRand(1000, 3000), chestPos: null,
      chestLevel: 0, chestCaught: false, chestInBar: false
    };
  };

  UI.prototype.openFishing = function () {
    var self = this, g = this.game, sim = this.sim;
    if (sim.exhausted) return g.toast('Kiệt sức, không quăng cần được');
    var pool = this.fishPool();
    if (!pool.length) return g.toast('Chỗ này giờ không có cá');
    var target = pool[Math.floor(Math.random() * pool.length)];
    /* A legendary is a once-in-a-while event, not a 1-in-12 cast.
     *
     * The hour and weather gates are deliberately NOT applied here, unlike the
     * ordinary pool below. Each of these can be caught once per save, behind
     * the right season, the right water and fishing level 6, at a 2% roll; also
     * demanding that the weather and the clock line up on the same visit makes
     * the rarest fish in the game a matter of luck about luck. Season and
     * location still hold, so each one still belongs to its own place. */
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
    var sub = el('div', 'sdv-hint',
      'Khi chữ đỏ hiện lên thì chạm vào màn hình để giật cần.');
    body.appendChild(sub);
    /* A float that bobs while nothing is happening. The wait can genuinely run
     * to twenty seconds at level 0 with no bait - that is the original's own
     * number - and a completely still screen for that long reads as a hang. */
    var pond = el('div', 'sdv-pond');
    pond.appendChild(el('i', 'sdv-bob'));
    body.appendChild(pond);
    var p = this.openPanel('Câu cá', body);
    var st = { phase: 'wait' };

    /* The wiki's bite formula, followed exactly. Base 600..30000 ms; each
     * fishing level takes 250 ms off the top; this is always the first bite of
     * a cast here (one cast, one fish) so both ends lose 25%; a Bait in the bag
     * is consumed and halves both ends; the floor is 500 ms. */
    var lo = 600, hi = 30000;
    hi -= 250 * (sim.skills.fishing || 0);
    lo *= 0.75; hi *= 0.75;
    var usedBait = false;
    if (sim.count && sim.count('Bait') > 0 && sim.take) {
      usedBait = !!sim.take('Bait', 1);
      if (usedBait) { lo *= 0.5; hi *= 0.5; }
    }
    lo = Math.max(500, lo); hi = Math.max(lo + 1, hi);
    var biteAt = lo + Math.random() * (hi - lo);
    st.biteAt = biteAt;
    if (usedBait) sub.textContent = 'Đã dùng 1 Bait — cá cắn nhanh gấp đôi.';

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
      /* The `w[0] + 60` floor is a guard, not a widening: the clock moves in
       * 10-minute steps, so a window narrower than one step could be stepped
       * clean over and the fish would never be catchable at all. Measured on
       * the shipped table (2026-08-23): 66 windows, the narrowest 240 minutes,
       * so the floor changes nothing today and only protects a future entry.
       * Do not "simplify" it away. */
      if (f.windows && f.windows.length && !f.windows.some(function (w) {
        return sim.time >= w[0] && sim.time <= Math.max(w[1], w[0] + 60);
      })) return false;
      if (f.minLevel && sim.skills.fishing < f.minLevel) return false;
      return true;
    });
  };

  /* The catching minigame. Hold anywhere to raise the lit band, let go to let
   * it fall; keep the band over the fish until the meter on the right fills.
   * One thumb, which is the original's control and the only one that works on
   * a phone held in one hand. */
  UI.prototype.fishMinigame = function (panel, body, fish) {
    var self = this, sim = this.sim, g = this.game;
    panel.classList.remove('sdv-flash');
    body.innerHTML = '';
    body.appendChild(el('div', 'sdv-castmsg', fish.name));
    var diffTxt = (fish.difficulty || 50) >= 80 ? 'rất khỏe'
                : (fish.difficulty || 50) >= 55 ? 'khỏe'
                : (fish.difficulty || 50) >= 30 ? 'vừa' : 'hiền';
    var behTxt = { dart: 'giật cục', floater: 'nổi lên', sinker: 'chìm xuống',
                   smooth: 'bơi mượt', mixed: 'thất thường'
                 }[String(fish.behavior || 'mixed').toLowerCase()] || 'thất thường';
    body.appendChild(el('div', 'sdv-sub',
      'Sức ' + diffTxt + ' (' + (fish.difficulty || 50) + ') · ' + behTxt
      + ' · GIỮ để kéo ô sáng lên'));

    var stage = el('div', 'sdv-fstage');
    var track = el('div', 'sdv-track');
    var bar = el('div', 'sdv-fbar');
    var mark = el('div', 'sdv-fmark');
    var chest = el('div', 'sdv-fchest', '🎁');
    chest.style.display = 'none';
    track.appendChild(bar);
    track.appendChild(mark);
    track.appendChild(chest);
    var prog = el('div', 'sdv-fprogv');
    var progFill = el('i');
    prog.appendChild(progFill);
    stage.appendChild(track);
    stage.appendChild(prog);
    body.appendChild(stage);
    var pad = el('div', 'sdv-fishpad', '👆 GIỮ để kéo lên');
    body.appendChild(pad);

    /* A treasure chest is a 15% roll adjusted by half of daily luck, and only
     * once the player has caught a fish before - both the original's rules. */
    var caught = (sim.flags && sim.flags.fishCaught) || 0;
    var treasure = caught > 1
      && Math.random() < 0.15 + (sim.luck || 0) / 2;

    /* Exposed for the browser suite. It drives a catch by pushing this
     * state's progress the way holding the button would, so the finish path,
     * the panel closing and the catch screen are all exercised for real - a
     * test that called showCatch() directly was green while the screen was
     * being destroyed a tick after it opened. */
    var s = UI.newFishState(fish.difficulty, fish.behavior,
                            sim.skills.fishing || 0, treasure);
    this._fishModel = s;

    // the track's height in CSS pixels decides the scale; CSS stays in charge
    var px = track.clientHeight || 320;
    var K = px / FISH_VIEW;
    bar.style.height = (s.barH * K) + 'px';
    mark.style.height = (28 * K) + 'px';

    function down(ev) {
      s.held = true;
      pad.classList.add('sdv-padon');
      if (ev && ev.cancelable) ev.preventDefault();
    }
    function up() { s.held = false; pad.classList.remove('sdv-padon'); }
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('touchstart', down, { capture: true, passive: false });
    window.addEventListener('touchend', up, true);

    var raf = 0, over = false;
    function stop() {
      if (over) return;
      over = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('touchstart', down, true);
      window.removeEventListener('touchend', up, true);
    }
    this._fishStop = stop;

    /* Fixed 60 Hz with an accumulator. The constants above are per-tick values
     * lifted straight from the original, so running them once per animation
     * frame would make the whole game easier on a 30 Hz phone and harder on a
     * 120 Hz one. The catch-up is capped at 5 ticks so a backgrounded tab does
     * not resume by fast-forwarding the fish into the floor. */
    var last = performance.now(), acc = 0, t0 = last;
    function frame() {
      if (over) return;
      var now = performance.now();
      acc += now - last;
      last = now;
      var n = 0;
      while (acc >= 1000 / 60 && n < 5) { fishTick(s); acc -= 1000 / 60; n++; }
      if (acc > 200) acc = 0;

      // draw straight from the model, in the model's own coordinates
      bar.style.top = (fishView(s.barPos - 32) * K) + 'px';
      mark.style.top = (fishView(s.pos - 16) * K) + 'px';
      mark.className = 'sdv-fmark' + (s.inBar ? ' sdv-fin' : '');
      if (s.treasure && s.chestPos != null) {
        chest.style.display = '';
        chest.style.top = (fishView(s.chestPos - 16) * K) + 'px';
        chest.style.opacity = s.chestCaught ? '0.35' : String(0.5 + s.chestLevel * 0.5);
      }
      progFill.style.height = (s.progress * 100) + '%';
      progFill.style.background = s.inBar
        ? 'linear-gradient(0deg,#4e9c2e,#8fd44a)'
        : 'linear-gradient(0deg,#c0453b,#e8a13c)';

      if (s.progress >= 1) return finish(true);
      if (s.progress <= 0) return finish(false);
      // a fish that has neither been caught nor lost in two minutes is a bug
      if (now - t0 > 120000) return finish(false);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function finish(win) {
      stop();
      var show = null;
      if (win) {
        /* WHY the skill is named: rollQuality defaults to FARMING, so the
         * grade of a fish came off the player's farming level - a level-10
         * angler who had never planted anything pulled up plain fish for ever,
         * and a farmer who had never cast a line pulled up gold ones. */
        var q = sim.rollQuality(0, 'fishing');
        /* A perfect catch - the fish never once left the band - raises a
         * silver or gold fish by one grade, per the wiki. */
        if (s.perfect && q >= 1 && q < 3) q = q === 2 ? 3 : 2;
        if (sim.give(fish.name, 1, q)) {
          if (fish._legend) {
            sim.caughtLegend = sim.caughtLegend || {};
            sim.caughtLegend[fish.name] = true;   // one of each, ever
          }
          sim.flags = sim.flags || {};
          sim.flags.fishCaught = (sim.flags.fishCaught || 0) + 1;
          /* The wiki's own formula: (quality + 1) * 3 + difficulty / 3, times
           * 2.4 for a perfect catch. The old flat difficulty/2 paid a Carp and
           * a Legend almost the same and ignored the catch entirely. */
          var xp = Math.floor((q + 1) * 3 + (fish.difficulty || 20) / 3);
          if (s.perfect) xp = Math.floor(xp * 2.4);
          var lvl = sim.addXp('fishing', xp);
          /* The screen is REMEMBERED here and raised after the panel below
           * closes, not opened here.
           *
           * WHY: `self.close()` at the end of this function shuts whatever
           * panel is open, and it does not care that the panel is now the
           * catch screen rather than the fishing minigame. Opened in place, it
           * appeared and was destroyed in the same tick - the owner's report
           * was "cá lên nhưng vẫn không show nhận đc cá gì cả", and they were
           * exactly right. */
          show = { size: self.rollFishSize(fish, s.perfect), q: q,
                   perfect: s.perfect, xp: xp, chest: s.chestCaught };
          if (s.chestCaught) self.fishTreasure();
          if (lvl) g.toast('Câu cá lên cấp ' + lvl + '!');
        } else g.toast('Túi đầy!');
      } else {
        // losing the fish loses the chest with it, same as the original
        g.toast(s.chestCaught ? 'Cá sổng mất — mất luôn rương!' : 'Cá sổng mất');
      }
      self.close();
      if (show) {
        self.showCatch(fish, show.size, show.q, show.perfect, show.xp, show.chest);
      }
    }
  };

  /* How long the fish is, by the original's own formula.
   *
   * The wiki: a size factor is rolled from how far the bobber landed, the
   * angler's level and a random roll, and the length is
   *     floor(minSize + (maxSize - minSize) * factor + 1)   inches
   * There is no distance-from-land in this build - casting is a panel, not an
   * arc across the water - so that term is replaced by how well the catch
   * itself went, which is the thing the player actually controls here. A
   * perfect catch is worth a real amount of it, which is what makes hanging on
   * to the bar mean something beyond the grade.
   *
   * NOTE ON WEIGHT: the owner asked for weight. The original does not have
   * one - it tracks LENGTH, in inches, and keeps a record per species. That is
   * the number with real data behind it, so that is what this shows.
   */
  UI.prototype.rollFishSize = function (fish, perfect) {
    var T = global.SDV_FISH_SIZE || {};
    var d = T[fish.name];
    if (!d) return null;
    var lvl = this.sim.skills.fishing || 0;
    var factor = ((lvl + 2) / 12) * (0.55 + Math.random() * 0.45);
    if (perfect) factor = Math.min(1, factor + 0.28);
    factor = Math.max(0, Math.min(1, factor));
    var inches = Math.floor(d.min + (d.max - d.min) * factor + 1);
    inches = Math.max(d.min, Math.min(d.max, inches));

    /* The record is the point. A number on its own is trivia; the same number
     * next to "your best was 31" is a reason to cast again - and the original
     * keeps exactly this, per species, in the collections screen. */
    this.sim.fishRecord = this.sim.fishRecord || {};
    var prev = this.sim.fishRecord[fish.name] || 0;
    var best = inches > prev;
    if (best) this.sim.fishRecord[fish.name] = inches;
    return { inches: inches, prev: prev, best: best,
             tier: d.t, colour: d.c, rarity: d.r, min: d.min, max: d.max };
  };

  var QUALITY_VN = ['Thường', 'Bạc', 'Vàng', 'Iridi'];
  var QUALITY_COL = ['#cfc3ad', '#c9d4de', '#ffd45c', '#b98cff'];

  /* The screen that makes a catch land.
   *
   * It used to be one line of toast that scrolled away in two seconds. What is
   * on it is all real: the length comes from the original's formula, the tier
   * comes from how restricted the fish actually is (season, weather, time
   * window, how many places it lives, difficulty - see
   * docs/research/stardew/tools/build_fish_size.py), and the record is the
   * player's own previous best for that species. */
  UI.prototype.showCatch = function (fish, size, q, perfect, xp, chest) {
    var self = this;
    var body = el('div', 'sdv-body sdv-catch');

    if (perfect) {
      var pf = el('div', 'sdv-perfect', 'HOÀN HẢO');
      body.appendChild(pf);
    }
    var art = el('div', 'sdv-catchart');
    art.appendChild(icon(fish.name, 'fish', 96));
    body.appendChild(art);

    var nm = el('div', 'sdv-catchname', fish.name);
    body.appendChild(nm);

    if (size) {
      var tag = el('div', 'sdv-catchtier', size.tier);
      tag.style.color = size.colour;
      tag.style.borderColor = size.colour;
      body.appendChild(tag);
    }

    var rows = el('div', 'sdv-catchrows');
    function row(k, v, col) {
      var r = el('div', 'sdv-catchrow');
      r.appendChild(el('span', null, k));
      var val = el('b', null, v);
      if (col) val.style.color = col;
      r.appendChild(val);
      rows.appendChild(r);
    }
    if (size) {
      row('Chiều dài', size.inches + '"',
          size.best ? '#8ede76' : null);
      row(size.best ? 'Kỷ lục cũ' : 'Kỷ lục của bạn',
          (size.prev ? size.prev + '"' : 'chưa có'), null);
    }
    row('Chất lượng', QUALITY_VN[q] || QUALITY_VN[0], QUALITY_COL[q]);
    row('Kinh nghiệm', '+' + xp);
    row('Bán được', this.sim.sellPrice(fish.name, q) + 'g');
    body.appendChild(rows);

    if (size && size.best) {
      body.appendChild(el('div', 'sdv-catchrec',
        size.prev ? '🏆 Kỷ lục mới!' : '🏆 Con đầu tiên!'));
    }
    if (chest) body.appendChild(el('div', 'sdv-sub', '🎁 Kèm một rương kho báu'));

    var ok = el('button', 'sdv-mbtn', 'Tuyệt!');
    ok.addEventListener('click', function () { self.close(); });
    body.appendChild(ok);
    this.openPanel('Câu được!', body);
  };

  /* Treasure-chest loot. The wiki's contents table is long and half of it is
   * items this build has no concept of, so this is the subset that exists
   * here: ore, coal, wood/stone, quartz and geodes, plus a little gold. */
  UI.prototype.fishTreasure = function () {
    var sim = this.sim, g = this.game;
    var pool = ['Copper Ore', 'Iron Ore', 'Coal', 'Wood', 'Stone',
                'Quartz', 'Geode', 'Frozen Geode'];
    var picked = [];
    var n = 1 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) {
      var name = pool[Math.floor(Math.random() * pool.length)];
      var qty = 2 + Math.floor(Math.random() * 5);
      if (sim.itemInfo && !sim.itemInfo(name)) continue;
      if (sim.give(name, qty)) picked.push(name + ' ×' + qty);
    }
    var gold = 50 + Math.floor(Math.random() * 200);
    sim.gold += gold;
    g.toast('🎁 Rương kho báu: ' + (picked.join(', ') || 'trống')
            + ' + ' + gold + 'g');
  };

  global.SDV_UI = { UI: UI, el: el, icon: icon };
})(window);
