/*
 * ui.js - the head-up display and every panel that is not a Pokemon screen.
 *
 * Built for a PHONE HELD IN ONE HAND, and every layout decision here follows
 * from that:
 *   - the stick lives at the bottom centre and owns that band alone
 *   - the one contextual button sits at right, 150px up, inside the arc a
 *     right thumb sweeps without the hand moving
 *   - a panel is full-bleed with a big close target, never a floating dialog
 *   - nothing important is in the top corners, where a notch or a status bar
 *     eats it
 *
 * Panels are a stack, not a singleton. Opening the seed picker over the bag
 * over the shop has to close back down in order, and the `modal` count on the
 * game is what pauses the world for exactly as long as something is open.
 */
(function (global) {
  'use strict';

  var A = global.ISL_ATLAS;
  var IA = global.ISL_ITEMART;
  var SIM = global.SDV_SIM;
  var PK = global.ISL_POKE;
  var ISL = global.ISL_ISLANDS;

  var game = null;
  var layer = null, hud = null, stack = [];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, fn, cls) {
    var b = el('button', cls || 'isl-mbtn', label);
    b.onclick = function (ev) { ev.stopPropagation(); fn(ev); };
    return b;
  }
  function q(id) { return document.getElementById(id); }

  // -------------------------------------------------------------------- HUD
  function build(g) {
    game = g;
    layer = q('layer');
    hud = {
      date: q('hud-date'), day: q('hud-day'), wx: q('hud-wx'),
      gold: q('hud-gold'), rank: q('hud-rank'), rankBar: q('hud-rankbar'),
      energy: q('hud-energy'), health: q('hud-health'),
      energyN: q('hud-energyn'), healthN: q('hud-healthn'),
      hand: q('hud-hand'), handIcon: q('hud-handicon'), handText: q('hud-handtext'),
      toasts: q('hud-toasts'), mini: q('hud-mini'),
      island: q('hud-island')
    };
    bindStick();
    hud.hand.onclick = function () { game.useHand(); };
    q('btn-bag').onclick = function () { openBag(game); };
    q('btn-map').onclick = function () { openMap(game); };
    q('btn-poke').onclick = function () {
      if (global.ISL_POKEUI) global.ISL_POKEUI.openParty(game);
    };
    q('btn-menu').onclick = function () { openMenu(game); };
    document.addEventListener('keydown', onKey);
  }

  /* Keyboard is a convenience for testing on a desktop, not a supported input.
   * It is here because play-testing a farm loop with a mouse-dragged joystick
   * is slow enough that bugs go unfound. */
  var KEYS = {};
  function onKey(e) {
    if (stack.length && e.key === 'Escape') { close(); return; }
    var map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    if (map[e.key]) {
      KEYS[e.key] = 1;
      var dx = 0, dy = 0;
      for (var k in KEYS) if (KEYS[k] && map[k]) { dx += map[k][0]; dy += map[k][1]; }
      game.stick.dx = dx; game.stick.dy = dy;
      window.addEventListener('keyup', function up(ev) {
        if (ev.key === e.key) { delete KEYS[e.key]; window.removeEventListener('keyup', up); }
        var ax = 0, ay = 0;
        for (var k2 in KEYS) if (KEYS[k2] && map[k2]) { ax += map[k2][0]; ay += map[k2][1]; }
        game.stick.dx = ax; game.stick.dy = ay;
      });
      e.preventDefault();
    }
    if (e.key === ' ' || e.key === 'Enter') { game.useHand(); e.preventDefault(); }
  }

  function bindStick() {
    var pad = q('stick'), knob = q('knob');
    var id = null, cx = 0, cy = 0, R = 46;
    function start(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      id = e.changedTouches ? t.identifier : 'mouse';
      var r = pad.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      move(e);
    }
    function move(e) {
      var t = pick(e);
      if (!t) return;
      var dx = t.clientX - cx, dy = t.clientY - cy;
      var m = Math.sqrt(dx * dx + dy * dy);
      if (m > R) { dx = dx / m * R; dy = dy / m * R; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      game.stick.dx = dx / R; game.stick.dy = dy / R;
      e.preventDefault();
    }
    function end(e) {
      if (!pick(e) && e.changedTouches) return;
      id = null;
      knob.style.transform = '';
      game.stick.dx = 0; game.stick.dy = 0;
    }
    function pick(e) {
      if (!e.changedTouches) return id === 'mouse' ? e : null;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === id) return e.changedTouches[i];
      }
      return null;
    }
    pad.addEventListener('touchstart', start, { passive: false });
    pad.addEventListener('touchmove', move, { passive: false });
    pad.addEventListener('touchend', end);
    pad.addEventListener('touchcancel', end);
    pad.addEventListener('mousedown', function (e) {
      start(e);
      var mm = function (ev) { move(ev); };
      var mu = function (ev) {
        end(ev);
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup', mu);
      };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);
    });
  }

  // ------------------------------------------------------------------- tick
  var lastHud = {};
  function tick(g, dt) {
    if (!hud) return;
    var s = g.sim;
    set(hud.date, s.seasonVN() + ' ' + s.day + ' · Năm ' + s.year);
    set(hud.day, s.dayOfWeek() + '  ' + s.clockText());
    set(hud.wx, { sun: '☀', rain: '🌧', storm: '⛈', snow: '❄', wind: '🌬' }[s.weather] || '☀');
    set(hud.gold, s.gold.toLocaleString('vi') + 'v');
    set(hud.rank, 'Cấp ' + s.rank);
    hud.rankBar.style.width = Math.round(s.rankProgress() * 100) + '%';
    hud.energy.style.height = Math.round(s.energy / s.maxEnergy * 100) + '%';
    hud.health.style.height = Math.round(s.health / s.maxHealth * 100) + '%';
    set(hud.energyN, Math.round(s.energy));
    set(hud.healthN, Math.round(s.health));

    var isl = g.currentIsland();
    set(hud.island, isl ? isl.isl.name : 'Ngoài khơi');

    var f = g.focus;
    if (f && f.verb) {
      hud.hand.classList.add('isl-on');
      set(hud.handIcon, f.icon || '✋');
      set(hud.handText, f.verb);
    } else {
      hud.hand.classList.remove('isl-on');
    }
    drawToasts(g);
    drawMini(g);
  }
  function set(node, v) {
    if (!node) return;
    if (lastHud[node.id] === v) return;
    lastHud[node.id] = v;
    node.textContent = v;
  }

  function drawToasts(g) {
    var want = g.toasts.map(function (t) { return t.text; }).join('\n');
    if (want === lastHud._toast) return;
    lastHud._toast = want;
    hud.toasts.innerHTML = '';
    g.toasts.forEach(function (t) {
      hud.toasts.appendChild(el('div', 'isl-toast', t.text));
    });
  }

  /* The minimap is the whole archipelago at one pixel per tile, which is what
   * makes "where is the fish market" answerable without opening anything. It
   * redraws twice a second - the world does not change faster than that and it
   * is a 160x126 canvas. */
  /* Starts far in the past so the FIRST tick paints. At 0 the throttle below
   * compares against a game clock that also starts at 0, so the minimap stayed
   * blank for the first half second of every session - long enough to read as
   * broken on a slow phone. */
  var miniLast = -1e9;
  function drawMini(g) {
    if (g.time - miniLast < 450) return;
    miniLast = g.time;
    var c = hud.mini;
    if (!c.width) { c.width = 104; c.height = 84; }
    var x = c.getContext('2d');
    x.fillStyle = '#0d2b40';
    x.fillRect(0, 0, c.width, c.height);
    var a = g.area();
    if (g.world.current !== 'sea') return;
    var sx = c.width / a.w, sy = c.height / a.h;
    (a.islands || []).forEach(function (r) {
      x.fillStyle = r.owned ? '#57a83e' : '#3a4450';
      x.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy);
      if (!r.owned) return;
      if (r.isl.enc) {
        x.fillStyle = '#2f7a2a';
        x.fillRect(r.x * sx + 1, r.y * sy + 1, 3, 3);
      }
    });
    x.fillStyle = '#a3703f';
    (a._bridges || []).forEach(function (t) {
      x.fillRect(t[0] * sx, t[1] * sy, Math.max(1, sx), Math.max(1, sy));
    });
    (g.world.npcs || []).forEach(function (v) {
      x.fillStyle = '#6fa8ff';
      x.fillRect(v.x * sx - 1, v.y * sy - 1, 2, 2);
    });
    x.fillStyle = '#ffd870';
    x.fillRect(g.player.x * sx - 1.5, g.player.y * sy - 1.5, 3, 3);
  }

  // ----------------------------------------------------------------- panels
  function panel(title, build, opt) {
    var p = el('div', 'isl-panel');
    var head = el('div', 'isl-phead');
    head.appendChild(el('h3', null, title));
    if (opt && opt.sub) head.appendChild(el('span', 'isl-psub', opt.sub));
    var x = btn('✕', function () { close(); }, 'isl-x');
    head.appendChild(x);
    p.appendChild(head);
    var body = el('div', 'isl-pbody');
    p.appendChild(body);
    /* opt.onClose runs however the panel goes away - the ✕, Escape, or
     * closeAll() from somewhere else. Panels that own something outside the
     * DOM (an animation frame, a battle in progress) leaked it when the
     * player used the ✕ instead of the panel's own finish button. */
    if (opt && opt.onClose) p.__onClose = opt.onClose;
    layer.appendChild(p);
    stack.push(p);
    game.modal++;
    build(body, p);
    return { panel: p, body: body };
  }

  function close() {
    var p = stack.pop();
    if (!p) return;
    p.remove();
    game.modal = Math.max(0, game.modal - 1);
    if (p.__onClose) {
      var fn = p.__onClose;
      p.__onClose = null;               // never twice, whatever fn itself does
      try { fn(); } catch (e) {}
    }
  }
  function closeAll() { while (stack.length) close(); }

  function refresh(body, build) {
    body.innerHTML = '';
    build(body);
  }

  // -------------------------------------------------------------------- bag
  function slotFor(item, onTap, extra) {
    var s = el('button', 'isl-slot');
    if (!item) { s.className += ' isl-empty'; return s; }
    s.appendChild(IA.icon(item.name, 40));
    if (item.qty > 1) s.appendChild(el('span', 'isl-qty', item.qty));
    if (item.quality) s.appendChild(el('i', 'isl-q' + item.quality));
    if (extra) s.appendChild(el('span', 'isl-slotx', extra));
    s.onclick = function () { onTap(item); };
    return s;
  }

  function openBag(g) {
    panel('Túi đồ', function (body) {
      draw(body);
    }, { sub: g.sim.inventory.length + '/' + g.sim.invSize });

    function draw(body) {
      body.innerHTML = '';
      var grid = el('div', 'isl-grid');
      var inv = g.sim.inventory;
      for (var i = 0; i < g.sim.invSize; i++) {
        (function (idx) {
          grid.appendChild(slotFor(inv[idx], function (it) { itemMenu(g, it, idx, body, draw); }));
        })(i);
      }
      body.appendChild(grid);
      body.appendChild(el('div', 'isl-hint',
        'Chạm một món để ăn, dùng, đặt xuống hoặc bỏ đi.'));
    }
  }

  function itemMenu(g, item, idx, body, redraw) {
    if (!item) return;
    panel(item.name, function (b) {
      var info = g.sim.itemInfo(item.name) || {};
      var row = el('div', 'isl-inforow');
      row.appendChild(IA.icon(item.name, 56));
      var txt = el('div');
      txt.appendChild(el('div', 'isl-big2', item.name));
      txt.appendChild(el('div', 'isl-sub',
        'Giá bán: ' + g.sim.sellPrice(item.name, item.quality) + 'v' +
        (item.qty > 1 ? '  ×' + item.qty : '')));
      if (info.energy) txt.appendChild(el('div', 'isl-sub', 'Hồi ' + info.energy + ' thể lực'));
      row.appendChild(txt);
      b.appendChild(row);

      var menu = el('div', 'isl-menu');
      if (info.energy) {
        menu.appendChild(btn('Ăn', function () {
          g.sim.eat(idx); close(); redraw(body);
        }));
      }
      if (global.ISL_POKEITEMS && global.ISL_POKEITEMS.ITEMS[item.name]) {
        menu.appendChild(btn('Dùng cho Pokémon', function () {
          /* WHY redraw(body) is here and was not: every other branch in this
           * menu repaints the bag grid, this one did not. The Pokémon picker
           * closed itself and handed control back to the STILL-RENDERED grid,
           * whose slot button holds a closure over the stack that was just
           * consumed. Tapping it again used an item the player no longer had -
           * one Rare Candy was worth infinite levels, one stone evolved the
           * whole box. */
          close();
          if (global.ISL_POKEUI) global.ISL_POKEUI.useItemOn(g, item.name);
          redraw(body);
        }));
      }
      if (PLACEABLE[item.name]) {
        menu.appendChild(btn('Đặt xuống trước mặt', function () {
          if (placeItem(g, item.name)) { close(); redraw(body); }
        }));
      }
      menu.appendChild(btn('Bỏ đi', function () {
        /* takeStack, not take(name, qty): the player tapped THIS stack. By
         * name it removed the last stack with that name, so discarding the
         * plain parsnip threw away the gold-star one sitting behind it. */
        g.sim.takeStack(item, item.qty);
        close(); redraw(body);
      }, 'isl-mbtn isl-bad'));
      b.appendChild(menu);
    });
  }

  var PLACEABLE = {
    'Sprinkler': 'sprinkler', 'Quality Sprinkler': 'sprinkler',
    'Iridium Sprinkler': 'sprinkler', 'Chest': 'chest',
    'Furnace': 'machine', 'Keg': 'machine', 'Preserves Jar': 'machine',
    'Mayonnaise Machine': 'machine', 'Cheese Press': 'machine',
    'Loom': 'machine', 'Seed Maker': 'machine', 'Cask': 'machine',
    'Crab Pot': 'crabPot'
  };

  function placeItem(g, name) {
    var f = g.focus;
    var a = g.area();
    var x, y;
    if (f) { x = f.x; y = f.y; }
    else {
      x = Math.floor(g.player.x); y = Math.floor(g.player.y);
    }
    if (a.objAt(x, y)) { g.toast('Chỗ đó đã có thứ khác.'); return false; }
    var kind = PLACEABLE[name];
    /* `placed: 1` marks this as the PLAYER's, which is what World.deserialize
     * reads to decide whether to keep it. Without it a placed Chest matched
     * FIXTURE.chest and was thrown away on the first reload. */
    var o = { x: x, y: y, kind: kind, item: name, placed: 1 };
    if (kind === 'machine') o.machine = name;
    a.obj(o);
    if (global.SDV_WORLD.SOLID_OBJ[kind]) a.block(x, y, true);
    g.sim.take(name, 1);
    g.toast('Đã đặt ' + name + '.');
    if (global.ISL_TUTORIAL) {
      if (kind === 'machine') global.ISL_TUTORIAL.fire('firstMachine');
      if (kind === 'sprinkler') global.ISL_TUTORIAL.fire('sprinkler');
    }
    return true;
  }

  // ------------------------------------------------------------ seed picker
  function openSeedPicker(g, x, y) {
    var seeds = g.sim.inventory.filter(function (it) {
      return /Seeds|Starter|Bulb|Sapling|Shoot|Tuber|Rice/i.test(it.name);
    });
    if (!seeds.length) { g.toast('Bạn không có hạt nào. Mua ở Đảo Chợ.'); return; }
    panel('Gieo hạt', function (b) {
      var menu = el('div', 'isl-menu');
      seeds.forEach(function (it) {
        var row = el('button', 'isl-mbtn isl-inline');
        row.appendChild(IA.icon(it.name, 30));
        var t = el('div');
        t.appendChild(el('div', null, it.name + ' ×' + it.qty));
        var crop = cropOf(g, it.name);
        if (crop) {
          t.appendChild(el('div', 'isl-cost',
            crop.seasons.map(vnSeason).join('/') + ' · ' + crop.growth + ' ngày · bán ' + crop.sell + 'v'));
        }
        row.appendChild(t);
        row.onclick = function () {
          if (g.plantAt(x, y, it.name)) { close(); }
        };
        menu.appendChild(row);
      });
      b.appendChild(menu);
      b.appendChild(el('div', 'isl-hint',
        'Mẹo: Pokémon hệ Cỏ có thể gieo cả luống cùng lúc.'));
    });
  }
  function vnSeason(s) {
    return { Spring: 'Xuân', Summer: 'Hạ', Fall: 'Thu', Winter: 'Đông' }[s] || s;
  }
  function cropOf(g, seedName) {
    var list = g.data.crops || [];
    for (var i = 0; i < list.length; i++) if (list[i].seed === seedName) return list[i];
    return null;
  }

  // ------------------------------------------------------------------- shop
  /* Stock is per shop id, drawn from data/gamedata.js prices where the item
   * exists there and hand-priced where it does not (balls, potions, the
   * sprinklers). Everything is filtered by season and by rank, so a shop's
   * list is a progression readout as much as a menu. */
  var SHOPS = {
    seeds: { title: 'Sạp Hạt Giống', stock: seedStock },
    general: { title: 'Sạp Tạp Hoá', stock: generalStock },
    lumber: { title: 'Trại Gỗ', stock: fixed([
      ['Wood', 10], ['Hardwood', 100], ['Chest', 200], ['Tapper', 800] ]) },
    /* Priced from farmlife's own ANIMAL_KINDS rather than restated here, so a
     * change to what a cow costs cannot end up disagreeing with what the shop
     * charges for one. */
    animals: { title: 'Trại Giống', stock: animalStock },
    fish: { title: 'Chợ Cá', stock: fixed([
      ['Bait', 5], ['Crab Pot', 1500], ['Fiber', 20] ]) },
    smith: { title: 'Lò Rèn', stock: fixed([
      ['Sprinkler', 1000], ['Quality Sprinkler', 4000], ['Iridium Sprinkler', 15000],
      ['Furnace', 900], ['Copper Bar', 150], ['Iron Bar', 300] ]) },
    tavern: { title: 'Quán Ăn', stock: fixed([
      ['Bread', 120], ['Fried Egg', 130], ['Pizza', 600], ['Salad', 220],
      ['Coffee', 300] ]) },
    pokemart: { title: 'Poké Mart', stock: pokeStock },
    adventure: { title: 'Hội Thám Hiểm', stock: fixed([
      ['Bomb', 600], ['Cherry Bomb', 300], ['Life Elixir', 500] ]) },
    beach: { title: 'Quầy Ven Biển', stock: fixed([
      ['Bait', 5], ['Coconut', 200], ['Rainbow Shell', 300] ]) }
  };

  function fixed(rows) {
    return function () {
      return rows.map(function (r) { return { name: r[0], price: r[1] }; });
    };
  }
  function animalStock(g) {
    var out = [{ name: 'Hay', price: 50 }];
    var kinds = g.farm && g.farm.kinds ? g.farm.kinds() : {};
    for (var k in kinds) {
      if (!kinds[k].cost) continue;              // Dinosaur hatches, never sells
      out.push({ name: k, price: kinds[k].cost, animal: true });
    }
    return out;
  }

  function seedStock(g) {
    var season = g.sim.season();
    var out = [];
    (g.data.crops || []).forEach(function (c) {
      if (c.seasons.indexOf(season) < 0) return;
      out.push({ name: c.seed, price: Math.round(c.seedPrice * 2) });
    });
    out.push({ name: 'Basic Fertilizer', price: 100 });
    out.push({ name: 'Quality Fertilizer', price: 150 });
    return out;
  }
  function generalStock(g) {
    var out = [{ name: 'Bread', price: 100 }];
    if (g.sim.invSize < 24) out.push({ name: 'Túi 24 ô', price: 2000, special: 'bag24' });
    else if (g.sim.invSize < 36) out.push({ name: 'Túi 36 ô', price: 10000, special: 'bag36' });
    out.push({ name: 'Chest', price: 200 });
    out.push({ name: 'Basic Fertilizer', price: 100 });
    return out;
  }
  function pokeStock(g) {
    var out = [
      { name: 'Poké Ball', price: 200 }, { name: 'Potion', price: 300 },
      { name: 'Antidote', price: 200 }, { name: 'Paralyze Heal', price: 250 }
    ];
    if (g.sim.rank >= 10) out.push({ name: 'Great Ball', price: 600 },
                                    { name: 'Super Potion', price: 700 },
                                    { name: 'Revive', price: 1500 });
    if (g.sim.rank >= 16) out.push({ name: 'Ultra Ball', price: 1200 },
                                    { name: 'Net Ball', price: 1000 },
                                    { name: 'Dusk Ball', price: 1000 },
                                    { name: 'Quick Ball', price: 1000 },
                                    { name: 'Hyper Potion', price: 1500 },
                                    { name: 'Full Heal', price: 600 });
    if (g.sim.rank >= 22) out.push({ name: 'Timer Ball', price: 1000 },
                                    { name: 'Max Potion', price: 2500 },
                                    { name: 'Max Revive', price: 4000 },
                                    { name: 'Rare Candy', price: 8000 },
                                    { name: 'Fire Stone', price: 2500 },
                                    { name: 'Water Stone', price: 2500 },
                                    { name: 'Thunder Stone', price: 2500 },
                                    { name: 'Leaf Stone', price: 2500 },
                                    { name: 'Moon Stone', price: 3500 });
    return out;
  }

  function openShop(g, id) {
    var def = SHOPS[id];
    if (!def) { g.toast('Cửa hàng đóng cửa.'); return; }
    /* Shops keep hours. Turning up at midnight and finding the counter dark is
     * information - it teaches that the clock is a real constraint - so long
     * as the sign says so, which is what the toast is for. */
    if (g.sim.time >= 17 * 60 || g.sim.time < 6 * 60) {
      g.toast(def.title + ' đã đóng cửa (6h–17h).');
      return;
    }
    panel(def.title, function (b) { render(b); }, { sub: g.sim.gold.toLocaleString('vi') + 'v' });
    function render(b) {
      b.innerHTML = '';
      var tabs = el('div', 'isl-tabs');
      var buying = true;
      var listWrap = el('div');
      var tb = btn('MUA', function () { buying = true; paint(); }, 'isl-tab isl-on');
      var ts = btn('BÁN', function () { buying = false; paint(); }, 'isl-tab');
      tabs.appendChild(tb); tabs.appendChild(ts);
      b.appendChild(tabs); b.appendChild(listWrap);
      paint();
      function paint() {
        tb.className = 'isl-tab' + (buying ? ' isl-on' : '');
        ts.className = 'isl-tab' + (buying ? '' : ' isl-on');
        listWrap.innerHTML = '';
        var menu = el('div', 'isl-menu');
        if (buying) {
          def.stock(g).forEach(function (row) {
            var r = el('button', 'isl-mbtn isl-inline');
            r.appendChild(IA.icon(row.name, 30));
            var t = el('div');
            t.appendChild(el('div', null, row.name));
            t.appendChild(el('div', 'isl-cost', row.price.toLocaleString('vi') + 'v'));
            r.appendChild(t);
            if (g.sim.gold < row.price) r.className += ' isl-off';
            r.onclick = function () { buy(row); };
            menu.appendChild(r);
          });
        } else {
          if (!g.sim.inventory.length) {
            menu.appendChild(el('div', 'isl-hint', 'Túi trống.'));
          }
          g.sim.inventory.slice().forEach(function (it) {
            var price = g.sim.sellPrice(it.name, it.quality);
            var r = el('button', 'isl-mbtn isl-inline');
            r.appendChild(IA.icon(it.name, 30));
            var t = el('div');
            t.appendChild(el('div', null, it.name + ' ×' + it.qty));
            t.appendChild(el('div', 'isl-cost', price + 'v mỗi cái'));
            r.appendChild(t);
            r.onclick = function () {
              /* Remove FIRST, from the exact stack that was tapped, and pay
               * for what actually left. Paying `price * it.qty` and then
               * take(name, qty) matched by name only: an iridium starfruit
               * row paid the iridium price and deleted a plain one, so the
               * good item stayed in the bag and the difference was gold out
               * of nothing, once per tap. */
              var sold = g.sim.takeStack(it, it.qty);
              if (!sold) { paint(); return; }
              g.sim.gold += price * sold;
              g.sim.totalEarnings += price * sold;
              g.addRank(Math.ceil(price * sold / 40));
              paint();
            };
            menu.appendChild(r);
          });
        }
        listWrap.appendChild(menu);
      }
      function buy(row) {
        /* Refuse BEFORE taking the money. sim.give returns false on a full bag
         * and the first version ignored it, so a player with twelve full slots
         * could buy seeds all afternoon and receive nothing. */
        if (!row.special && !row.animal && !g.sim.canGive(row.name, 0)) {
          g.toast('Túi đầy — không mua thêm được.');
          if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('bagFull');
          return;
        }
        if (!g.sim.spendGold(row.price)) { g.toast('Không đủ vàng.'); return; }
        if (row.special === 'bag24') { g.sim.invSize = 24; g.toast('Túi lên 24 ô!'); }
        else if (row.special === 'bag36') { g.sim.invSize = 36; g.toast('Túi lên 36 ô!'); }
        else if (row.animal && g.farm) {
          /* farm.buy charges the gold itself, so the price already taken above
           * has to go back before it does - otherwise every animal costs
           * double and the failure path keeps the money. */
          g.sim.gold += row.price;
          var err = g.farm.buy(row.name);
          if (err) { g.toast(err); return; }
        } else {
          g.sim.give(row.name, 1);
        }
        g.toast('Đã mua ' + row.name + '.');
        paint();
      }
    }
  }

  // -------------------------------------------------------------------- map
  /* The map is also the shop for LAND, and that is deliberate: buying an
   * island is the single most important decision in the game and it should
   * happen while looking at where it is. */
  function openMap(g) {
    panel('Bản đồ quần đảo', function (b) { paint(b); },
          { sub: 'Cấp ' + g.sim.rank + ' · ' + g.sim.gold.toLocaleString('vi') + 'v' });
    function paint(b) {
      b.innerHTML = '';
      var wrap = el('div', 'isl-mapwrap');
      var c = el('canvas', 'isl-mapcanvas');
      c.width = 250; c.height = 200;
      wrap.appendChild(c);
      b.appendChild(wrap);
      var a = g.area();
      var x = c.getContext('2d');
      x.fillStyle = '#0d2b40'; x.fillRect(0, 0, c.width, c.height);
      var sx = c.width / a.w, sy = c.height / a.h;
      x.fillStyle = '#a3703f';
      (a._bridges || []).forEach(function (t) {
        x.fillRect(t[0] * sx, t[1] * sy, Math.max(1, sx * 1.5), Math.max(1, sy * 1.5));
      });
      var buyable = {};
      g.buyableIslands().forEach(function (r) { buyable[r.rec.id] = r; });
      (a.islands || []).forEach(function (r) {
        var bx = r.x * sx, by = r.y * sy, bw = r.w * sx, bh = r.h * sy;
        x.fillStyle = r.owned ? '#57a83e' : (buyable[r.id] ? '#7a6a3a' : '#2f3742');
        x.fillRect(bx, by, bw, bh);
        if (buyable[r.id] && buyable[r.id].rankOk && buyable[r.id].goldOk) {
          x.strokeStyle = '#ffd870'; x.lineWidth = 2;
          x.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
        }
        x.fillStyle = r.owned ? '#0d2b40' : '#c9b48c';
        x.font = '7px system-ui'; x.textAlign = 'center';
        x.fillText(shortName(r.isl.name), bx + bw / 2, by + bh / 2 + 2);
      });
      x.fillStyle = '#fff';
      x.fillRect(g.player.x * sx - 2, g.player.y * sy - 2, 4, 4);
      x.textAlign = 'left';

      var menu = el('div', 'isl-menu');
      var list = g.buyableIslands();
      if (!list.length) {
        menu.appendChild(el('div', 'isl-hint',
          'Chưa có đảo mới nào sát đất của bạn. Mở rộng dần từ Đảo Nhà.'));
      }
      list.sort(function (p, q2) { return p.rec.isl.unlock.rank - q2.rec.isl.unlock.rank; });
      list.forEach(function (row) {
        var r = el('button', 'isl-mbtn');
        var head = el('div', 'isl-mrow');
        head.appendChild(el('b', null, row.rec.isl.name));
        head.appendChild(el('span', 'isl-cost',
          'Cấp ' + row.rec.isl.unlock.rank + ' · ' +
          row.rec.isl.unlock.gold.toLocaleString('vi') + 'v'));
        r.appendChild(head);
        r.appendChild(el('div', 'isl-sub', row.rec.isl.blurb || ''));
        var why = !row.rankOk ? 'Cần Cấp Đảo Trưởng ' + row.rec.isl.unlock.rank
                : !row.goldOk ? 'Còn thiếu ' +
                    (row.rec.isl.unlock.gold - g.sim.gold).toLocaleString('vi') + 'v'
                : null;
        if (why) { r.className += ' isl-off'; r.appendChild(el('div', 'isl-cost', why)); }
        else r.appendChild(el('div', 'isl-good', 'Mua ngay'));
        r.onclick = function () {
          if (why) { g.toast(why); return; }
          if (g.buyIsland(row.rec.id)) { paint(b); }
        };
        menu.appendChild(r);
      });
      b.appendChild(menu);

      var owned = (a.islands || []).filter(function (r) { return r.owned; });
      b.appendChild(el('div', 'isl-sub', 'ĐI TỚI ĐẢO ĐÃ CÓ'));
      var go = el('div', 'isl-chips');
      owned.forEach(function (r) {
        go.appendChild(btn(r.isl.name, function () {
          /* Walking is the default; free teleport from a menu would make the
           * bridges - and every Flying Pokemon - pointless. Only a villager's
           * boat, at a price, or a Pokemon that can fly gets you there. */
          var cost = 60;
          if (r.id === (g.currentIsland() && g.currentIsland().id)) { g.toast('Bạn đang ở đây.'); return; }
          if (!g.sim.spendGold(cost)) { g.toast('Cần ' + cost + 'v tiền đò.'); return; }
          g.travelTo(r); closeAll();
        }, 'isl-chip'));
      });
      b.appendChild(go);
      b.appendChild(el('div', 'isl-hint',
        'Đi đò tốn 60v. Pokémon hệ Bay hoặc Rồng đưa bạn đi miễn phí.'));
    }
  }
  function shortName(n) { return n.replace(/^Đảo\s*/, ''); }

  // ------------------------------------------------------------------- NPCs
  function openNpc(g, v) {
    var res = global.ISL_NPC.talk(g, v);
    panel(v.name, function (b) { paint(b); }, { sub: v.def.role });
    function paint(b) {
      b.innerHTML = '';
      var row = el('div', 'isl-inforow');
      row.appendChild(A.icon(global.ISL_NPC.portrait(v), 64));
      var t = el('div');
      t.appendChild(el('div', 'isl-hearts', hearts(g.sim.hearts(v.name))));
      t.appendChild(el('div', 'isl-sub', v.def.bio));
      row.appendChild(t);
      b.appendChild(row);
      b.appendChild(el('div', 'isl-say', res.line));

      if (g.sim.isBirthday(v.name)) {
        b.appendChild(el('div', 'isl-tip', '🎂 Hôm nay là sinh nhật ' + v.name +
                                           ' — quà hôm nay tính điểm gấp 8 lần!'));
      }
      var menu = el('div', 'isl-menu');
      menu.appendChild(btn('Tặng quà', function () { giftPicker(g, v, b, paint); }));
      menu.appendChild(btn('Sở thích', function () { tastes(g, v); }));
      var shop = shopOnIsland(g, v);
      if (shop) menu.appendChild(btn(shop.label || 'Xem hàng', function () {
        close(); openShop(g, shop.shop);
      }));
      b.appendChild(menu);
    }
  }
  function hearts(n) {
    var s = '';
    for (var i = 0; i < 10; i++) s += i < n ? '❤' : '·';
    return s;
  }
  function shopOnIsland(g, v) {
    var rec = g.islandRec(v.def.home);
    if (!rec) return null;
    var found = null;
    g.area().objs.forEach(function (o) {
      if (found || o.kind !== 'shop') return;
      if (o.x >= rec.x && o.x < rec.x + rec.w && o.y >= rec.y && o.y < rec.y + rec.h) found = o;
    });
    return found;
  }

  function giftPicker(g, v, parentBody, repaint) {
    panel('Tặng ' + v.name, function (b) {
      if (!g.sim.inventory.length) {
        b.appendChild(el('div', 'isl-hint', 'Túi trống.'));
        return;
      }
      var menu = el('div', 'isl-menu');
      g.sim.inventory.forEach(function (it) {
        var t = global.ISL_NPC.taste(g, v, it.name);
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(IA.icon(it.name, 28));
        var box = el('div');
        box.appendChild(el('div', null, it.name));
        box.appendChild(el('div', 'isl-cost isl-t-' + t, TASTE_VN[t]));
        r.appendChild(box);
        r.onclick = function () {
          var res = global.ISL_NPC.gift(g, v, it.name);
          close();
          g.toast(res.line);
          if (res.ok) repaint(parentBody);
        };
        menu.appendChild(r);
      });
      b.appendChild(menu);
    });
  }
  var TASTE_VN = { love: 'RẤT THÍCH +80', like: 'Thích +45', neutral: 'Bình thường +20',
                   dislike: 'Không thích −20', hate: 'GHÉT −40' };

  function tastes(g, v) {
    panel(v.name + ' thích gì', function (b) {
      [['love', 'RẤT THÍCH'], ['like', 'Thích'], ['hate', 'Ghét']].forEach(function (pair) {
        var list = v.def[pair[0]] || [];
        if (!list.length) return;
        b.appendChild(el('div', 'isl-sub', pair[1]));
        var chips = el('div', 'isl-chips');
        list.forEach(function (n) { chips.appendChild(el('span', 'isl-chip', n)); });
        b.appendChild(chips);
      });
      b.appendChild(el('div', 'isl-hint',
        'Mỗi người chỉ nhận một món quà mỗi ngày. Quà đúng sở thích ăn điểm gấp bốn lần.'));
    });
  }

  // ------------------------------------------------------------------ sleep
  function confirmSleep(g) {
    panel('Đi ngủ', function (b) {
      b.appendChild(el('div', 'isl-say',
        'Kết thúc ngày ' + g.sim.day + ' mùa ' + g.sim.seasonVN() + '?\n' +
        'Hàng trong hòm giao sẽ được bán và bạn nhận tiền.'));
      var pend = g.sim.shipped.reduce(function (s, it) {
        return s + g.sim.sellPrice(it.name, it.quality) * it.qty;
      }, 0);
      if (pend) b.appendChild(el('div', 'isl-tip', 'Sắp nhận: ' + pend.toLocaleString('vi') + 'v'));
      var menu = el('div', 'isl-menu');
      menu.appendChild(btn('Ngủ tới sáng mai', function () {
        closeAll();
        var report = g.sleep();
        showDayReport(g, report, false);
      }));
      menu.appendChild(btn('Chưa ngủ', function () { close(); }));
      b.appendChild(menu);
    });
  }

  function showDayReport(g, report, collapsed) {
    panel(collapsed ? 'Bạn đã ngất' : 'Sang ngày mới', function (b) {
      b.appendChild(el('div', 'isl-big',
        (report.earned > 0 ? '+' : '') + report.earned.toLocaleString('vi') + 'v'));
      if (report.items.length) {
        var list = el('div', 'isl-menu');
        report.items.forEach(function (it) {
          var r = el('div', 'isl-mbtn isl-inline');
          r.appendChild(IA.icon(it.name, 26));
          r.appendChild(el('div', null, it.name + ' ×' + it.qty + ' — ' +
            (g.sim.sellPrice(it.name, it.quality) * it.qty) + 'v'));
          list.appendChild(r);
        });
        b.appendChild(list);
      }
      var lines = [];
      if (report.grew) lines.push(report.grew + ' cây lớn thêm');
      if (report.died) lines.push(report.died + ' cây chết vì trái mùa');
      lines.push('Vận may hôm nay: ' + g.sim.luckText());
      lines.push('Thời tiết: ' + WX_VN[g.sim.weather]);
      b.appendChild(el('div', 'isl-sub', lines.join(' · ')));
      var menu = el('div', 'isl-menu');
      menu.appendChild(btn('Bắt đầu ngày mới', function () { closeAll(); }));
      b.appendChild(menu);
    });
  }
  var WX_VN = { sun: 'Nắng', rain: 'Mưa', storm: 'Bão', snow: 'Tuyết', wind: 'Gió' };

  // ------------------------------------------------------------------ chest
  function openChest(g, o) {
    panel('Rương', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      b.appendChild(el('div', 'isl-sub', 'TRONG RƯƠNG — chạm để lấy ra'));
      var g1 = el('div', 'isl-grid');
      for (var i = 0; i < g.sim.chestSize; i++) {
        (function (idx) {
          g1.appendChild(slotFor(g.sim.chest[idx], function (it) {
            /* canGive, not hasSpace()+count(): give() merges only into a stack
             * of the same name AND quality, so a full bag holding a plain
             * parsnip passed the old guard, refused the gold-star one, and
             * the take below deleted it out of the chest anyway. */
            if (!g.sim.canGive(it.name, it.quality)) { g.toast('Túi đầy.'); return; }
            var moved = g.sim.takeStack(it, it.qty, g.sim.chest);
            if (moved) g.sim.give(it.name, moved, it.quality);
            paint(b);
          }));
        })(i);
      }
      b.appendChild(g1);
      b.appendChild(el('div', 'isl-sub', 'TÚI CỦA BẠN — chạm để cất vào'));
      var g2 = el('div', 'isl-grid');
      for (var j = 0; j < g.sim.invSize; j++) {
        (function (idx) {
          g2.appendChild(slotFor(g.sim.inventory[idx], function (it) {
            if (!g.sim.canGive(it.name, it.quality, g.sim.chest)) {
              g.toast('Rương đầy.'); return;
            }
            /* Remove the tapped stack first, then deposit exactly what left.
             * give(name,qty,quality)/take(name,qty) laundered quality: five
             * plain starfruit went in and five IRIDIUM came out, because the
             * deposit copied the tapped stack's quality while the withdrawal
             * matched by name. Take them back out and you owned six iridium
             * where you had one. */
            var moved = g.sim.takeStack(it, it.qty);
            if (moved) g.sim.give(it.name, moved, it.quality, g.sim.chest);
            paint(b);
          }));
        })(j);
      }
      b.appendChild(g2);
    }
  }
  function hasStack(list, it) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === it.name && list[i].quality === it.quality) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------- bin
  function openBin(g) {
    panel('Hòm giao hàng', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      var pend = g.sim.shipped.reduce(function (s, it) {
        return s + g.sim.sellPrice(it.name, it.quality) * it.qty;
      }, 0);
      b.appendChild(el('div', 'isl-big', pend.toLocaleString('vi') + 'v'));
      b.appendChild(el('div', 'isl-sub', 'Sẽ nhận khi bạn đi ngủ. Chạm món trong túi để bỏ vào.'));
      var grid = el('div', 'isl-grid');
      for (var i = 0; i < g.sim.invSize; i++) {
        (function (idx) {
          grid.appendChild(slotFor(g.sim.inventory[idx], function (it) {
            var qty = it.qty, q = it.quality;
            /* Take the exact stack, then ship exactly that. The old pair
             * shipped a copy at the tapped stack's quality and deleted a plain
             * one by name, so the good item stayed in the bag AND was paid
             * for. */
            var moved = g.sim.takeStack(it, qty);
            if (!moved) { paint(b); return; }
            g.sim.give(it.name, moved, q, g.sim.shipped);
            g.addRank(Math.ceil(g.sim.sellPrice(it.name, q) * moved / 40));
            paint(b);
          }));
        })(i);
      }
      b.appendChild(grid);
    }
  }

  // ---------------------------------------------------------------- fishing
  /* A one-tap timing bar rather than the original's held-bar minigame. On a
   * phone the held bar fights the joystick for the same thumb; this asks for
   * one well-timed tap and reads the same as "you have to pay attention". */
  function openFishing(g, x, y) {
    /* Check BEFORE charging. sim.spend returns `energy > 0`, so arriving with
     * four energy or less paid the four, set sluggish, opened nothing, and
     * said nothing. */
    if (g.sim.energy < 5) { g.toast('Hết sức để câu. Ăn gì đó hoặc đi ngủ.'); return; }
    g.spend(4);
    var isl = g.currentIsland();
    var poolId = isl && isl.isl.fish;
    var pool = (poolId && ISL.FISH_POOL[poolId]) || ISL.FISH_POOL.coast;
    var target = 0.5, pos = 0, dir = 1, speed = 0.9 + Math.random() * 0.7;
    var band = Math.max(0.09, 0.24 - g.sim.skills.fishing * 0.012);
    var done = false, raf = null;
    panel('Câu cá', function (b, pel) {
      b.appendChild(el('div', 'isl-sub', 'Bấm khi con trỏ nằm trong vùng vàng.'));
      var track = el('div', 'isl-fishtrack');
      var zone = el('div', 'isl-fishzone');
      var mark = el('div', 'isl-fishmark');
      track.appendChild(zone); track.appendChild(mark);
      b.appendChild(track);
      zone.style.left = ((target - band / 2) * 100) + '%';
      zone.style.width = (band * 100) + '%';
      var out = el('div', 'isl-say', 'Đang chờ cá cắn...');
      b.appendChild(out);
      var hit = btn('KÉO!', function () { resolve(); }, 'isl-mbtn isl-primary');
      b.appendChild(hit);
      var last = 0;
      function loop(t) {
        if (done) return;
        var dt = (t - (last || t)) / 1000; last = t;
        pos += dir * speed * dt;
        if (pos > 1) { pos = 1; dir = -1; }
        if (pos < 0) { pos = 0; dir = 1; }
        mark.style.left = (pos * 100) + '%';
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
      /* WHY this is wired to the panel and not only to resolve(): `done` was
       * set inside resolve() alone, so closing with the ✕ left loop()
       * re-arming requestAnimationFrame forever against a node that is no
       * longer in the document - one abandoned loop per abandoned cast. */
      pel.__onClose = function () { done = true; cancelAnimationFrame(raf); };
      function resolve() {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        var ok = Math.abs(pos - target) <= band / 2;
        if (!ok) { out.textContent = 'Nó sổng mất!'; hit.textContent = 'Thôi'; hit.onclick = close; return; }
        var name = pool[Math.floor(Math.random() * pool.length)];
        var qual = g.sim.rollQuality(0, 'fishing');
        g.sim.give(name, 1, qual);
        g.sim.addXp('fishing', 12);
        g.addRank(7);
        out.textContent = 'Bắt được ' + name + '!';
        hit.textContent = 'Xong';
        hit.onclick = function () { close(); };
        if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('fish');
      }
    });
  }

  // ------------------------------------------------------------------- menu
  /* A row that reads its own state, because a switch that does not show
   * whether it is on is not a switch. */
  function toggleRow(g, key, label, hint) {
    var r = el('button', 'isl-mbtn');
    function paint() {
      r.innerHTML = '';
      var on = g.sim[key] !== false;
      var h = el('div', 'isl-mrow');
      h.appendChild(el('b', null, label));
      h.appendChild(el('span', on ? 'isl-good' : 'isl-cost', on ? 'BẬT' : 'TẮT'));
      r.appendChild(h);
      r.appendChild(el('div', 'isl-cost', hint));
      r.className = 'isl-mbtn' + (on ? '' : ' isl-off');
    }
    r.onclick = function () {
      g.sim[key] = g.sim[key] === false;
      paint();
      g.toast(label + (g.sim[key] ? ': BẬT' : ': TẮT'));
    };
    paint();
    return r;
  }

  function openMenu(g) {
    panel('Bảng điều khiển', function (b) {
      var m = el('div', 'isl-menu');
      m.appendChild(btn('📖 Sổ tay hướng dẫn', function () { close(); openHandbook(g); }));
      m.appendChild(btn('🧑‍🌾 Kỹ năng & Nghề', function () { close(); openSkills(g); }));
      m.appendChild(btn('👥 Dân đảo', function () { close(); openPeople(g); }));
      m.appendChild(btn('🌾 Bảng nông trại', function () {
        close();
        if (global.ISL_FARMQOL) global.ISL_FARMQOL.openPanel(g);
      }));
      /* WHY these sit in the menu and not in a settings screen nobody opens:
       * they change how the game FEELS more than anything else here, and a
       * player who dislikes them needs to find the switch on the first day. */
      m.appendChild(toggleRow(g, 'autoWork', '🪓 Tự động chặt/đập',
        'Đứng yên cạnh cây hoặc đá là tự làm. Đi ngang qua thì không.'));
      m.appendChild(toggleRow(g, 'autoLoot', '🧲 Tự động nhặt',
        'Đồ rơi quanh bạn tự vào túi.'));
      m.appendChild(btn('💾 Lưu game', function () {
        g.sim.save(g.world) ? g.toast('Đã lưu.') : g.toast('Không lưu được.');
      }));
      m.appendChild(btn('🗑 Xoá save và chơi lại', function () {
        if (confirm('Xoá toàn bộ tiến trình?')) {
          SIM.Sim.clearSave(); global.location.reload();
        }
      }, 'isl-mbtn isl-bad'));
      b.appendChild(m);
      b.appendChild(el('div', 'isl-hint',
        'Game tự lưu mỗi khi bạn ngủ. Đóng tab không mất tiến trình.'));
    });
  }

  function openHandbook(g) {
    panel('Sổ tay', function (b) {
      var pages = global.ISL_TUTORIAL ? global.ISL_TUTORIAL.handbook() : [];
      if (!pages.length) {
        b.appendChild(el('div', 'isl-hint', 'Chưa có trang nào. Cứ chơi, sổ tay sẽ tự dày lên.'));
        return;
      }
      var m = el('div', 'isl-menu');
      pages.forEach(function (s) {
        m.appendChild(btn(s.title, function () {
          close(); global.ISL_TUTORIAL.replay(s.id);
        }));
      });
      b.appendChild(m);
    });
  }

  function openSkills(g) {
    panel('Kỹ năng', function (b) {
      var VN = { farming: 'Nông nghiệp', mining: 'Khai thác', foraging: 'Hái lượm',
                 fishing: 'Câu cá', combat: 'Chiến đấu' };
      for (var k in g.sim.skills) {
        var row = el('div', 'isl-skillrow');
        row.appendChild(el('b', null, VN[k]));
        row.appendChild(el('span', null, 'Cấp ' + g.sim.skills[k]));
        var bar = el('div', 'isl-bar2');
        var need = SIM.SKILL_XP[g.sim.skills[k]] || SIM.SKILL_XP[9];
        var prev = g.sim.skills[k] ? SIM.SKILL_XP[g.sim.skills[k] - 1] : 0;
        var pct = Math.min(1, (g.sim.skillXp[k] - prev) / Math.max(1, need - prev));
        var fill = el('i'); fill.style.width = Math.round(pct * 100) + '%';
        bar.appendChild(fill);
        row.appendChild(bar);
        b.appendChild(row);
      }
      b.appendChild(el('div', 'isl-sub', 'CẤP ĐẢO TRƯỞNG ' + g.sim.rank));
      b.appendChild(el('div', 'isl-hint',
        g.sim.rankXp.toLocaleString('vi') + ' / ' +
        g.sim.rankNeed(g.sim.rank).toLocaleString('vi') + ' điểm.\n' +
        'Mọi việc có ích đều cộng điểm cấp: trồng, bán, câu, đào, bắt Pokémon, giao đơn hàng.'));
    });
  }

  function openPeople(g) {
    panel('Dân đảo', function (b) {
      var b2 = global.ISL_NPCS;
      var m = el('div', 'isl-menu');
      b2.order.forEach(function (id) {
        var def = b2.npcs[id];
        var known = g.sim.owned[def.home];
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(A.icon(known ? (def.portrait || def.art) : 'Guest', 34));
        var t = el('div');
        t.appendChild(el('div', null, known ? def.name : '???'));
        t.appendChild(el('div', 'isl-cost', known
          ? hearts(g.sim.hearts(def.name)) + '  ·  ' + def.role
          : 'Chưa mở ' + (ISL.byId(def.home) || {}).name));
        if (known) {
          t.appendChild(el('div', 'isl-cost',
            'Sinh nhật: ' + vnSeason(def.birthday.season) + ' ' + def.birthday.day));
        }
        r.appendChild(t);
        if (!known) r.className += ' isl-off';
        m.appendChild(r);
      });
      b.appendChild(m);
    });
  }

  // ------------------------------------------------------------- dispatcher
  /* Everything the hand button can open that does not have its own verb in
   * game.js. Keeping the mapping here rather than in the engine means a new
   * panel is one line in one file. */
  function P() { return global.ISL_PLACES; }

  function openFor(g, f) {
    switch (f.kind) {
      case 'chest':   return openChest(g, f.obj);
      case 'bin':     return openBin(g);
      case 'shop':    return openShop(g, f.obj.shop);
      case 'orders':  return global.ISL_FARMQOL && global.ISL_FARMQOL.openOrders(g);
      case 'workshop':return P().openWorkshop(g);
      case 'calendar':return openCalendar(g);
      case 'box':     return global.ISL_POKEUI && global.ISL_POKEUI.openBox(g);
      case 'dex':     return global.ISL_POKEUI && global.ISL_POKEUI.openDex(g);
      case 'ivJudge': return global.ISL_POKEUI && global.ISL_POKEUI.openJudge(g);
      case 'evTrainer': return global.ISL_POKEUI && global.ISL_POKEUI.openEvTrainer(g);
      case 'mint':    return global.ISL_POKEUI && global.ISL_POKEUI.openMint(g);
      case 'machine': return P().openMachine(g, f.obj);
      case 'cook':    return P().openKitchen(g);
      case 'museum':  return P().openMuseum(g);
      case 'bundles': return P().openBundles(g);
      case 'toolUpgrade': return P().openToolUpgrade(g);
      case 'shrine':  return P().openShrine(g, f.obj);
      case 'daycare': return P().openDaycare(g);
      case 'mail':    return P().openMail(g);
      case 'geode':   return P().openGeode(g);
      case 'fossil':  return P().openFossil(g);
      case 'bait':    return P().openBait(g);
      case 'tapper':  return g.toast('Ống nhựa cây. Đặt Tapper lên gốc cây trong túi đồ ' +
                                     'để lấy nhựa và si-rô.');
      case 'trough':  return g.toast('Máng ăn — cỏ khô: ' + (g.sim.hay || 0) +
                                     '. Cho ăn ở trong chuồng.');
      case 'crabRack':return g.toast('Giá lồng cua. Đặt Crab Pot xuống mặt nước, ' +
                                     'sáng hôm sau ra lấy.');
      case 'inspect': return g.toast(f.obj.item || 'Không có gì đặc biệt.');
      case 'mine':    return global.ISL_MINE
                             ? global.ISL_MINE.enter(g)
                             : g.toast('Hầm mỏ chưa mở.');
      case 'animalHouse': return openAnimalHouse(g, f.obj);
      case 'silo':    return g.toast('Cỏ khô: ' + (g.sim.hay || 0) + '/' +
                                     (g.farm ? g.farm.hayCap() : 0));
      default:        return g.toast('Chưa dùng được.');
    }
  }

  /* One coop or barn, its occupants, and the two things you do to them every
   * morning. The bulk buttons at the top are the point - a barn of eight
   * animals is sixteen taps otherwise, every single day. */
  function openAnimalHouse(g, o) {
    if (!g.farm) { g.toast('Chưa có chuồng.'); return; }
    UI_openHouse(g, o);
  }
  function UI_openHouse(g, o) {
    panel(o.farmBuilding === 'Coop' ? 'Chuồng gà' : 'Chuồng gia súc',
          function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      var list = g.farm.occupants(o.buildingId);
      if (!list.length) {
        b.appendChild(el('div', 'isl-hint',
          'Chuồng trống. Mua thú ở Trại Giống trên cùng đảo này.'));
        return;
      }
      var m = el('div', 'isl-menu');
      m.appendChild(btn('🌾  Cho ăn + vuốt ve tất cả', function () {
        var n = g.farm.feedAll();
        g.toast(n ? 'Đã chăm ' + n + ' con.' : 'Cả đàn đã được chăm hôm nay.');
        paint(b);
      }, 'isl-mbtn isl-primary'));
      m.appendChild(btn('🥚  Thu hết sản phẩm', function () {
        var got = g.farm.collectAll();
        g.toast(got.length ? 'Nhận: ' + got.join(', ') : 'Chưa có gì để thu.');
        paint(b);
      }));
      b.appendChild(m);

      var rows = el('div', 'isl-menu');
      list.forEach(function (a) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(IA.icon(a.kind, 32));
        var t = el('div', 'isl-grow');
        var h = el('div', 'isl-mrow');
        h.appendChild(el('b', null, a.name));
        h.appendChild(el('span', 'isl-cost', a.ready ? 'CÓ SẢN PHẨM' : ''));
        t.appendChild(h);
        var bar = el('div', 'isl-bar2');
        var f = el('i'); f.style.width = Math.round(a.friendship / 10) + '%';
        bar.appendChild(f); t.appendChild(bar);
        t.appendChild(el('div', 'isl-cost',
          (a.fed ? 'đã ăn' : 'chưa ăn') + ' · ' +
          (a.petted ? 'đã vuốt ve' : 'chưa vuốt ve') + ' · ' + a.age + ' ngày tuổi'));
        r.appendChild(t);
        r.onclick = function () {
          if (a.ready) { var got = g.farm.collect(a); if (got) g.toast('+1 ' + got); }
          else if (g.farm.pet(a)) g.toast(a.name + ' vui lắm!');
          else g.toast(a.name + ' đã được vuốt ve hôm nay.');
          paint(b);
        };
        rows.appendChild(r);
      });
      b.appendChild(rows);
      b.appendChild(el('div', 'isl-hint',
        'Pokémon hệ Thường, Cỏ hoặc Nước có thể chăm cả đàn thay bạn.'));
    }
  }

  function openCalendar(g) {
    panel('Lịch mùa ' + g.sim.seasonVN(), function (b) {
      var grid = el('div', 'isl-cal');
      var bdays = {};
      var bundle = global.ISL_NPCS;
      bundle.order.forEach(function (id) {
        var d = bundle.npcs[id];
        if (d.birthday.season === g.sim.season()) bdays[d.birthday.day] = d;
      });
      for (var day = 1; day <= 28; day++) {
        var cell = el('div', 'isl-calday');
        if (day === g.sim.day) cell.className += ' isl-today';
        cell.appendChild(el('b', null, day));
        if (bdays[day]) {
          var ic = A.icon(bdays[day].portrait || bdays[day].art, 18);
          cell.appendChild(ic);
        }
        grid.appendChild(cell);
      }
      b.appendChild(grid);
      b.appendChild(el('div', 'isl-hint',
        'Mặt người là sinh nhật. Tặng quà đúng ngày sinh ăn điểm gấp 8 lần.'));
    });
  }

  global.ISL_UI = {
    build: build, tick: tick, panel: panel, close: close, closeAll: closeAll,
    el: el, btn: btn, slotFor: slotFor,
    openBag: openBag, openShop: openShop, openSeedPicker: openSeedPicker,
    openMap: openMap, openNpc: openNpc, openChest: openChest, openBin: openBin,
    confirmSleep: confirmSleep, showDayReport: showDayReport,
    openFishing: openFishing, openFor: openFor, openMenu: openMenu,
    openHandbook: openHandbook, hearts: hearts, TASTE_VN: TASTE_VN
  };
  global.SDV_UI = { UI: null, el: el, icon: function (n, s) { return IA.icon(n, s); } };
})(window);
