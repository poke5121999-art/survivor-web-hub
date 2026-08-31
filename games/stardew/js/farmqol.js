/*
 * farmqol.js - the quality-of-life layer, lifted from what Harvest Town does
 * well and the previous build did not do at all.
 *
 * Three things live here, and all three exist because of the same observation:
 * a farming game is a game about a FIELD, and a game about a field that makes
 * you touch every tile individually stops being fun somewhere around the
 * fortieth square.
 *
 *  1. THE FARM PANEL - one screen that says how the field is doing (how many
 *     tiles are dry, how many crops are ready, how many days to the next
 *     harvest) and gives you a button for each of those in bulk. It costs the
 *     same energy per tile as doing it by hand; what it saves is the walking
 *     and the forty taps.
 *
 *  2. SPRINKLERS - three tiers, watering a plus, a 5x5 and a 7x7 at dawn.
 *     (The watering itself lives in game.js `growSprinklers`, next to the rest
 *     of the overnight pass.)
 *
 *  3. THE ORDER BOARD - a handful of daily requests for a quantity of
 *     something. They pay well above the shipping price and they pay Island
 *     Rank, which makes them the fastest road to the next island in the first
 *     season. They are also the only thing in the game that tells a new player
 *     what to go and do next.
 *
 * The bulk buttons are deliberately NOT free. Free bulk farming is what
 * Pokemon labour is for, and if the menu did the same thing for nothing there
 * would be no reason to catch anything.
 */
(function (global) {
  'use strict';

  var UI = global.ISL_UI;
  var IA = global.ISL_ITEMART;
  var PK = global.ISL_POKE;

  function el(t, c, x) { return UI.el(t, c, x); }
  function btn(l, f, c) { return UI.btn(l, f, c); }

  // ------------------------------------------------------------------ survey
  /* Walk the current island once and count everything the panel wants to say.
   * One pass, because doing it per stat was four passes over 500 tiles and the
   * panel visibly hitched opening. */
  function survey(g) {
    var isl = g.currentIsland();
    var out = { isl: isl, dirt: 0, tilled: 0, watered: 0, dry: 0, ready: 0,
                growing: 0, dead: 0, soon: 99, crops: [] };
    if (!isl) return out;
    var a = g.area();
    for (var y = isl.y; y < isl.y + isl.h; y++) {
      for (var x = isl.x; x < isl.x + isl.w; x++) {
        var n = a.name_of(x, y);
        if (n === 'dirt') out.dirt++;
        else if (n === 'tilled') out.tilled++;
        else if (n === 'watered') out.watered++;
      }
    }
    a.objs.forEach(function (o) {
      if (o.kind !== 'crop') return;
      if (o.x < isl.x || o.x >= isl.x + isl.w) return;
      if (o.y < isl.y || o.y >= isl.y + isl.h) return;
      out.crops.push(o);
      if (o.dead) { out.dead++; return; }
      if (o.stage >= o.maxStage && !o.harvested) out.ready++;
      else {
        out.growing++;
        if (!o.watered) out.dry++;
        var left = daysLeft(o);
        if (left < out.soon) out.soon = left;
      }
    });
    if (out.soon === 99) out.soon = null;
    return out;
  }

  function daysLeft(o) {
    var need = 0, i;
    for (i = 0; i < (o.stageDays || []).length; i++) need += o.stageDays[i];
    return Math.max(1, need - (o.days || 0));
  }

  // -------------------------------------------------------------- bulk verbs
  /* Each returns how many tiles it acted on. They stop the moment energy runs
   * out rather than refusing up front, so a half-done field is still half
   * done - which is what a player who is nearly out of energy actually wants. */
  function bulkTill(g) {
    var isl = g.currentIsland(); if (!isl) return 0;
    var a = g.area(), n = 0;
    for (var y = isl.y; y < isl.y + isl.h; y++) {
      for (var x = isl.x; x < isl.x + isl.w; x++) {
        if (g.sim.energy < 2) return n;
        if (a.name_of(x, y) !== 'dirt' || a.objAt(x, y)) continue;
        if (g.till(x, y)) n++;
      }
    }
    return n;
  }
  function bulkWater(g) {
    var isl = g.currentIsland(); if (!isl) return 0;
    var a = g.area(), n = 0;
    for (var y = isl.y; y < isl.y + isl.h; y++) {
      for (var x = isl.x; x < isl.x + isl.w; x++) {
        if (g.sim.energy < 2) return n;
        if (g.waterTile(x, y)) n++;
      }
    }
    return n;
  }
  function bulkPlant(g, seedName) {
    var isl = g.currentIsland(); if (!isl) return 0;
    var a = g.area(), n = 0;
    for (var y = isl.y; y < isl.y + isl.h; y++) {
      for (var x = isl.x; x < isl.x + isl.w; x++) {
        if (g.sim.count(seedName) <= 0) return n;
        var t = a.name_of(x, y);
        if (t !== 'tilled' && t !== 'watered') continue;
        if (a.objAt(x, y)) continue;
        /* Skip a tile that refuses, do not abandon the field. One out-of-season
         * or blocked tile used to end the sweep, so a single bad square left
         * the rest of the island unsown. silent keeps it from spamming. */
        if (g.plantAt(x, y, seedName, { silent: true })) n++;
      }
    }
    return n;
  }
  function bulkHarvest(g) {
    var s = survey(g), n = 0;
    for (var i = 0; i < s.crops.length; i++) {
      var r = g.harvestCrop(s.crops[i], { silent: true });
      if (r === 'full') break;
      if (r) n++;
    }
    return n;
  }
  function bulkShip(g) {
    /* Everything in the bag that is a crop, a fish, a forage or an artisan
     * good goes to the bin. Deliberately NOT seeds, tools, ore or anything
     * craftable - shipping a player's last copper bar because they tapped a
     * bulk button is unrecoverable. */
    var keep = /Seeds|Starter|Sapling|Bulb|Tuber|Bar$|Ore$|Ball$|Potion|Revive|Heal|Sprinkler|Chest|Fertilizer|Bomb|Bait|Hay|Wood|Stone|Fiber|Coal/i;
    var n = 0, moved = [];
    g.sim.inventory.slice().forEach(function (it) {
      if (keep.test(it.name)) return;
      moved.push(it);
    });
    moved.forEach(function (it) {
      g.sim.give(it.name, it.qty, it.quality, g.sim.shipped);
      g.addRank(Math.ceil(g.sim.sellPrice(it.name, it.quality) * it.qty / 40));
      g.sim.take(it.name, it.qty);
      n += it.qty;
    });
    return n;
  }

  // ------------------------------------------------------------------ panel
  function openPanel(g) {
    UI.panel('Bảng nông trại', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      var s = survey(g);
      if (!s.isl) {
        b.appendChild(el('div', 'isl-hint', 'Bạn đang không đứng trên đảo nào.'));
        return;
      }
      b.appendChild(el('div', 'isl-sub', s.isl.isl.name.toUpperCase()));
      var stats = el('div', 'isl-stats');
      stat(stats, s.ready, 'Chín, hái được', s.ready ? 'good' : '');
      stat(stats, s.dry, 'Chưa tưới', s.dry ? 'warn' : '');
      stat(stats, s.growing, 'Đang lớn', '');
      stat(stats, s.dirt, 'Đất chưa cuốc', '');
      stat(stats, s.tilled, 'Luống trống', '');
      if (s.dead) stat(stats, s.dead, 'Cây chết', 'bad');
      b.appendChild(stats);
      if (s.soon) {
        b.appendChild(el('div', 'isl-tip', 'Lứa gần nhất chín sau ' + s.soon + ' ngày.'));
      }
      if (g.sim.weather === 'rain' || g.sim.tomorrowWeather === 'rain') {
        b.appendChild(el('div', 'isl-tip',
          g.sim.weather === 'rain' ? 'Trời đang mưa — khỏi tưới hôm nay.'
                                   : 'Mai trời mưa — tối nay khỏi tưới cũng được.'));
      }

      var m = el('div', 'isl-menu');
      m.appendChild(act('⛏  Cuốc hết đất trống', s.dirt, s.dirt * 2, function () {
        var n = bulkTill(g); g.toast('Đã cuốc ' + n + ' ô.'); paint(b);
      }));
      m.appendChild(act('💧  Tưới hết luống', s.dry + s.tilled, (s.dry + s.tilled) * 2, function () {
        var n = bulkWater(g); g.toast('Đã tưới ' + n + ' ô.'); paint(b);
      }));
      m.appendChild(act('🌱  Gieo kín luống trống', s.tilled + s.watered, 0, function () {
        seedPick(g, function (name) { var n = bulkPlant(g, name); g.toast('Đã gieo ' + n + ' hạt.'); paint(b); });
      }));
      m.appendChild(act('🌾  Hái hết cây chín', s.ready, 0, function () {
        var n = bulkHarvest(g); g.toast('Đã hái ' + n + ' cây.'); paint(b);
      }));
      m.appendChild(act('📮  Bỏ hết nông sản vào hòm giao', 1, 0, function () {
        var n = bulkShip(g); g.toast('Đã giao ' + n + ' món.'); paint(b);
      }));
      b.appendChild(m);

      /* The Pokemon shortcut sits right here, next to the buttons it makes
       * free. Making the player leave this panel to find it was the first
       * layout and nobody found it. */
      var jobs = global.ISL_POKEWORK
        ? global.ISL_POKEWORK.partySkills(g.sim.party).filter(function (r) {
            return r.ok && /water|till|harvest|plant|fert|weed|gather/.test(r.skill.id);
          })
        : [];
      if (jobs.length) {
        b.appendChild(el('div', 'isl-sub', 'SAI POKÉMON LÀM (không tốn thể lực)'));
        var pm = el('div', 'isl-menu');
        jobs.forEach(function (row) {
          var r = el('button', 'isl-mbtn isl-inline');
          r.appendChild(pokeIcon(row.poke, 30));
          var t = el('div');
          t.appendChild(el('div', null, row.skill.name));
          t.appendChild(el('div', 'isl-cost',
            PK.nameOf(row.poke) + ' · còn ' + PK.workLeft(row.poke) + ' sức làm'));
          r.appendChild(t);
          r.onclick = function () {
            var res = global.ISL_POKEWORK.cast(g, row.poke, row.skill.id);
            g.toast(res.msg);
            paint(b);
          };
          pm.appendChild(r);
        });
        b.appendChild(pm);
      } else if (g.sim.party.length) {
        b.appendChild(el('div', 'isl-hint',
          'Pokémon trong đội chưa làm được việc đồng áng nào — hoặc đã hết sức làm hôm nay.'));
      }
    }

    function stat(wrap, n, label, tone) {
      var d = el('div', 'isl-stat' + (tone ? ' isl-' + tone : ''));
      d.appendChild(el('b', null, n));
      d.appendChild(el('span', null, label));
      wrap.appendChild(d);
    }
    function act(label, avail, cost, fn) {
      var r = el('button', 'isl-mbtn');
      r.appendChild(el('div', null, label));
      if (cost) r.appendChild(el('div', 'isl-cost', 'khoảng ' + cost + ' thể lực'));
      if (!avail) { r.className += ' isl-off'; }
      r.onclick = function () { if (avail) fn(); };
      return r;
    }
  }

  function pokeIcon(p, size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    var A = global.ISL_POKEART;
    if (A) A.drawInto(x, p, 0, 0, size);
    return c;
  }

  function seedPick(g, fn) {
    var seeds = g.sim.inventory.filter(function (it) {
      return /Seeds|Starter|Bulb|Sapling|Shoot|Tuber|Rice/i.test(it.name);
    });
    if (!seeds.length) { g.toast('Bạn không có hạt nào.'); return; }
    UI.panel('Chọn hạt', function (b) {
      var m = el('div', 'isl-menu');
      seeds.forEach(function (it) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(IA.icon(it.name, 28));
        r.appendChild(el('div', null, it.name + ' ×' + it.qty));
        r.onclick = function () { UI.close(); fn(it.name); };
        m.appendChild(r);
      });
      b.appendChild(m);
    });
  }

  // ------------------------------------------------------------------ orders
  /* Three requests a day, drawn from what the player could plausibly have:
   * crops of the current season, fish, forage and artisan goods, scaled to
   * rank. The reward is roughly 2.2x the shipping value plus a rank bonus -
   * enough that filling one is always the best thing to do with a stack. */
  var ORDER_KINDS = [
    { id: 'crop', label: 'Nông sản', pick: function (g) {
        var season = g.sim.season();
        return (g.data.crops || []).filter(function (c) {
          return c.seasons.indexOf(season) >= 0;
        }).map(function (c) { return c.name; });
      } },
    { id: 'fish', label: 'Cá', pick: function (g) {
        var pools = global.ISL_ISLANDS.FISH_POOL, out = [];
        for (var k in pools) {
          var rec = g.islandRec(fishIsland(k));
          if (k !== 'coast' && (!rec || !rec.owned)) continue;
          out = out.concat(pools[k]);
        }
        return out;
      } },
    { id: 'resource', label: 'Nguyên liệu', pick: function () {
        return ['Wood', 'Stone', 'Fiber', 'Clay', 'Copper Ore', 'Iron Ore', 'Coal'];
      } },
    { id: 'artisan', label: 'Hàng thủ công', pick: function () {
        return ['Cheese', 'Mayonnaise', 'Wine', 'Juice', 'Pickles', 'Jelly',
                'Cloth', 'Truffle Oil', 'Beer'];
      } }
  ];
  function fishIsland(pool) {
    return { ocean: 'harbor', forest: 'forest', jungle: 'jungle',
             ice: 'frost', lava: 'volcano', coast: 'home' }[pool] || 'home';
  }

  function rollOrders(sim) {
    var g = sim._game;
    if (!g) return;
    var out = [];
    var kinds = ORDER_KINDS.slice();
    /* Artisan orders only once there is somewhere to make artisan goods. An
     * order for Wine on day three is not a goal, it is noise. */
    if (!sim.owned.workshop) kinds = kinds.filter(function (k) { return k.id !== 'artisan'; });
    for (var i = 0; i < 3 && kinds.length; i++) {
      var k = kinds.splice(Math.floor(Math.random() * kinds.length), 1)[0];
      var pool = k.pick(g).filter(Boolean);
      if (!pool.length) continue;
      var name = pool[Math.floor(Math.random() * pool.length)];
      var unit = sim.sellPrice(name, 0) || 30;
      var qty = Math.max(2, Math.min(20, Math.round((60 + sim.rank * 22) / Math.max(8, unit))));
      out.push({
        id: 'o' + sim.dayIndex() + '_' + i,
        kind: k.id, kindLabel: k.label,
        item: name, qty: qty,
        gold: Math.round(unit * qty * 2.2) + 60 * sim.rank,
        rank: 25 + sim.rank * 6,
        done: false
      });
    }
    sim.orders = out;
  }

  function openOrders(g) {
    UI.panel('Bảng đơn hàng', function (b) { paint(b); },
             { sub: 'Đổi mỗi sáng' });
    function paint(b) {
      b.innerHTML = '';
      if (!g.sim.orders || !g.sim.orders.length) {
        rollOrders(g.sim);
      }
      var any = false;
      var m = el('div', 'isl-menu');
      (g.sim.orders || []).forEach(function (o) {
        var have = g.sim.count(o.item);
        var r = el('button', 'isl-mbtn');
        var head = el('div', 'isl-mrow');
        head.appendChild(el('b', null, o.item + '  ×' + o.qty));
        head.appendChild(el('span', 'isl-cost', o.kindLabel));
        r.appendChild(head);
        r.appendChild(el('div', 'isl-cost',
          'Thưởng: ' + o.gold.toLocaleString('vi') + 'v  ·  +' + o.rank + ' điểm cấp'));
        if (o.done) {
          r.className += ' isl-off';
          r.appendChild(el('div', 'isl-good', '✔ Đã giao'));
        } else {
          any = true;
          r.appendChild(el('div', have >= o.qty ? 'isl-good' : 'isl-cost',
            'Bạn có ' + have + '/' + o.qty));
          r.onclick = function () {
            if (g.sim.count(o.item) < o.qty) { g.toast('Chưa đủ ' + o.item + '.'); return; }
            g.sim.take(o.item, o.qty);
            g.sim.gold += o.gold;
            g.sim.totalEarnings += o.gold;
            g.addRank(o.rank);
            o.done = true;
            g.toast('Giao xong! +' + o.gold.toLocaleString('vi') + 'v');
            paint(b);
          };
        }
        m.appendChild(r);
      });
      b.appendChild(m);
      if (!any) {
        b.appendChild(el('div', 'isl-hint', 'Hết đơn hôm nay. Sáng mai có đơn mới.'));
      } else {
        b.appendChild(el('div', 'isl-hint',
          'Đơn hàng trả cao hơn bán lẻ nhiều, và cộng điểm cấp gấp mấy lần. ' +
          'Đây là cách nhanh nhất để mua đảo mới.'));
      }
    }
  }

  global.ISL_FARMQOL = {
    survey: survey, openPanel: openPanel, openOrders: openOrders,
    rollOrders: rollOrders,
    bulkTill: bulkTill, bulkWater: bulkWater, bulkPlant: bulkPlant,
    bulkHarvest: bulkHarvest, bulkShip: bulkShip
  };
})(window);
