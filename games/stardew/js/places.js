/*
 * places.js - everything an island has that is not a shop and not a Pokemon.
 *
 * Machines, cooking, the museum, the bundle board, tool upgrades, the shrine,
 * the day-care and the mailbox. They are together in one file because they
 * share exactly one shape - "an object on an island opens a panel that spends
 * items and gives something back" - and splitting them into eight files would
 * mean eight copies of that shape.
 *
 * The recipe data all comes from data/gamedata.js, which was read out of the
 * original game's own files: 25 machines with their real inputs and timings,
 * 81 cooking recipes, 31 bundles. None of it is invented here, which is why
 * a Keg takes 1,750 minutes to make Beer and not "one night".
 *
 * ------------------------------------------------------------------ the rule
 * A machine started today is ready TOMORROW MORNING, regardless of its real
 * duration, unless the duration is longer than a day - in which case it takes
 * as many nights as it takes. Running the real minute clock inside a day that
 * is only twenty hours long would mean a Keg is never collectable at all.
 */
(function (global) {
  'use strict';

  var UI = global.ISL_UI;
  var IA = global.ISL_ITEMART;
  var PK = global.ISL_POKE;
  var MC = global.SDV_MACHINES;

  function el(t, c, x) { return UI.el(t, c, x); }
  function btn(l, f, c) { return UI.btn(l, f, c); }
  function data() { return global.SDV_DATA; }

  function machineDef(name) {
    var list = data().machines || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* A recipe is usable when the bag holds every input. `in` can be empty in the
   * extracted data for a few entries - those are recipes whose ingredient
   * column the wiki left blank - and an input-less recipe would be free money,
   * so they are filtered out rather than shown as "craftable from nothing". */
  function canMake(sim, r) {
    if (!r.in || !r.in.length) return false;
    if (r.alts) return !!pickAlt(sim, r);
    for (var i = 0; i < r.in.length; i++) {
      if (sim.count(r.in[i].item) < r.in[i].qty) return false;
    }
    return true;
  }

  /* Which of an ALTERNATIVES row the player can actually pay with, best first -
   * a Large Milk makes better cheese than a Milk, so the bigger one is offered
   * when both are on hand. */
  function pickAlt(sim, r) {
    var best = null;
    for (var i = 0; i < r.in.length; i++) {
      if (sim.count(r.in[i].item) >= r.in[i].qty) best = r.in[i];
    }
    return best;
  }

  function ingredientText(r) {
    if (r.alts) {
      return (r.in || []).map(function (i) { return i.item; }).join(' hoặc ');
    }
    return (r.in || []).map(function (i) { return i.item + ' ×' + i.qty; }).join(', ');
  }

  /* --------------------------------------------------- reading the raw table
   * data/gamedata.js `machines[].recipes` is an extraction of a wiki table and
   * carries three different kinds of row under one key. Sorting them out here
   * rather than at every call site is the whole reason this function exists:
   *
   *   1. PRICE rows - `out` is "230g". Not a recipe at all; dropped.
   *   2. CRAFTING rows - `out` is the name of a machine ("Heavy Furnace",
   *      "Tapper"). Those belong to the workbench, not to the machine, and
   *      showing them here offers to turn a Furnace into a Furnace.
   *   3. ALTERNATIVES - several inputs, each qty 1, e.g. Cheese from
   *      "Milk, Large Milk". The wiki means Milk OR Large Milk; read as a
   *      conjunction it demands both, which is why a player with four Milk and
   *      no Large Milk could not press a single wedge of cheese.
   *
   * Rule 3 is safe because every machine in the game takes exactly ONE input
   * at a time. Multi-ingredient recipes are cooking, and cooking is a
   * different table entirely.
   */
  var PRICE_ROW = /^[\d,]+g$/;
  function machineRecipes(def) {
    if (!def || !def.recipes) return [];
    var craftables = {};
    (data().machines || []).forEach(function (m) { craftables[m.name] = 1; });
    (EXTRA_CRAFT || []).forEach(function (m) { craftables[m.name] = 1; });
    var out = [];
    def.recipes.forEach(function (r) {
      if (!r.in || !r.in.length) return;
      if (PRICE_ROW.test(r.out)) return;
      if (craftables[r.out]) return;
      var allSingle = r.in.every(function (i) { return i.qty === 1; });
      var copy = { out: r.out, in: r.in, mins: r.mins, sell: r.sell,
                   alts: r.in.length > 1 && allSingle };
      out.push(copy);
    });
    return out;
  }

  // --------------------------------------------------------------- machines
  function openMachine(g, o) {
    var def = machineDef(o.machine);
    UI.panel(o.machine, function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      if (o.ready) {
        b.appendChild(el('div', 'isl-say', 'Đã xong: ' + o.out + ' ×' + (o.outQty || 1)));
        var take = el('div', 'isl-menu');
        take.appendChild(btn('Lấy ra', function () {
          if (!g.sim.give(o.out, o.outQty || 1, o.quality || 0)) {
            g.toast('Túi đầy.'); return;
          }
          g.toast('+' + (o.outQty || 1) + ' ' + o.out);
          g.sim.addXp('farming', 4);
          g.addRank(6);
          o.ready = false; o.out = null; o.busy = false;
          paint(b);
        }, 'isl-mbtn isl-primary'));
        b.appendChild(take);
        return;
      }
      if (o.busy) {
        b.appendChild(el('div', 'isl-say',
          'Đang làm ' + o.out + '. Còn ' + o.nights + ' đêm nữa.'));
        return;
      }
      var recipes = machineRecipes(def);
      if (!recipes.length) {
        b.appendChild(el('div', 'isl-hint', 'Máy này chưa có công thức nào.'));
        return;
      }
      b.appendChild(el('div', 'isl-sub', 'BỎ NGUYÊN LIỆU VÀO'));
      var m = el('div', 'isl-menu');
      var any = false;
      recipes.forEach(function (r) {
        var ok = canMake(g.sim, r);
        any = any || ok;
        var row = el('button', 'isl-mbtn isl-inline');
        row.appendChild(IA.icon(r.out, 30));
        var t = el('div', 'isl-grow');
        t.appendChild(el('div', null, r.out));
        t.appendChild(el('div', 'isl-cost', 'Cần: ' + ingredientText(r) +
          (r.sell ? '  ·  bán ' + r.sell + 'v' : '')));
        t.appendChild(el('div', 'isl-cost', nightsFor(r) + ' đêm'));
        row.appendChild(t);
        if (!ok) row.className += ' isl-off';
        row.onclick = function () {
          if (!ok) { g.toast('Thiếu nguyên liệu.'); return; }
          if (r.alts) {
            var use = pickAlt(g.sim, r);
            g.sim.take(use.item, use.qty);
          } else {
            r.in.forEach(function (i) { g.sim.take(i.item, i.qty); });
          }
          o.busy = true; o.ready = false;
          o.out = r.out; o.outQty = 1;
          o.nights = nightsFor(r);
          g.toast('Đã bỏ nguyên liệu vào ' + o.machine + '.');
          paint(b);
        };
        m.appendChild(row);
      });
      b.appendChild(m);
      if (!any) {
        b.appendChild(el('div', 'isl-hint',
          'Chưa có nguyên liệu cho công thức nào. Trồng, vắt sữa hoặc đào thêm đã.'));
      }
      b.appendChild(el('div', 'isl-hint',
        'Pokémon hệ Lửa có thể "Ủ Lò" để xong ngay, không cần đợi qua đêm.'));
    }
  }

  /* Real durations, floored to whole nights. Anything under a day is one
   * night, which is what makes a machine worth placing at all. */
  function nightsFor(r) {
    if (!r.mins) return 1;
    return Math.max(1, Math.ceil(r.mins / (20 * 60)));
  }

  /* Called from game.sleep. Every busy machine loses a night; the ones that
   * hit zero are ready in the morning. */
  function machinesOvernight(g) {
    var n = 0;
    g.world.forEachArea(function (a) {
      a.objs.forEach(function (o) {
        if (o.kind !== 'machine' || !o.busy) return;
        o.nights = (o.nights || 1) - 1;
        if (o.nights <= 0) { o.busy = false; o.ready = true; n++; }
      });
    });
    return n;
  }

  // ---------------------------------------------------------------- crafting
  /* The workbench. Machines and sprinklers are crafted, not bought, which is
   * what makes the wood and stone a player chops actually worth something. */
  var EXTRA_CRAFT = [
    { name: 'Sprinkler', craft: [{ item: 'Copper Bar', qty: 1 }, { item: 'Iron Bar', qty: 1 }] },
    { name: 'Quality Sprinkler', craft: [{ item: 'Iron Bar', qty: 1 }, { item: 'Gold Bar', qty: 1 }, { item: 'Refined Quartz', qty: 1 }] },
    { name: 'Iridium Sprinkler', craft: [{ item: 'Gold Bar', qty: 1 }, { item: 'Iridium Bar', qty: 1 }, { item: 'Battery Pack', qty: 1 }] },
    { name: 'Chest', craft: [{ item: 'Wood', qty: 50 }] },
    { name: 'Crab Pot', craft: [{ item: 'Wood', qty: 40 }, { item: 'Iron Bar', qty: 3 }] },
    { name: 'Bomb', craft: [{ item: 'Iron Ore', qty: 4 }, { item: 'Coal', qty: 1 }] },
    { name: 'Basic Fertilizer', craft: [{ item: 'Sap', qty: 2 }] }
  ];

  /* data/recipes_unlock.js has always been loaded and never read. It carries a
   * real condition per recipe; of its ~150 entries the skill / heart / have
   * shapes (85 of them) map straight onto state this game already keeps. The
   * `buy` and `special` shapes name Stardew Valley shops and one-offs that do
   * not exist here and have NO other way in, so those stay unlocked rather
   * than becoming unreachable content. */
  function recipeKnown(sim, name) {
    var u = global.SDV_RECIPE_UNLOCK && global.SDV_RECIPE_UNLOCK[name];
    if (!u) return true;
    if (u.k === 'skill') return (sim.skills[u.s] || 0) >= u.n;
    if (u.k === 'heart') return sim.hearts(u.who) >= u.n;
    if (u.k === 'have') return !!(sim.flags.held && sim.flags.held[u.item]);
    return true;                       // start, buy, special
  }

  function openWorkshop(g) {
    UI.panel('Bàn chế tạo', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      var all = EXTRA_CRAFT.concat((data().machines || []).filter(function (m) {
        return m.craft && m.craft.length;
      }));
      var rows = all.filter(function (r) { return recipeKnown(g.sim, r.name); });
      var locked = all.length - rows.length;
      b.appendChild(el('div', 'isl-hint',
        'Chế xong thì món đồ vào túi. Mở túi, chạm nó rồi chọn "Đặt xuống trước mặt".'));
      if (locked) {
        b.appendChild(el('div', 'isl-cost',
          'Còn ' + locked + ' công thức chưa mở — lên kỹ năng để học thêm.'));
      }
      var m = el('div', 'isl-menu');
      rows.forEach(function (r) {
        var ok = true;
        (r.craft || []).forEach(function (i) {
          if (g.sim.count(i.item) < i.qty) ok = false;
        });
        var row = el('button', 'isl-mbtn isl-inline');
        row.appendChild(IA.icon(r.name, 30));
        var t = el('div', 'isl-grow');
        t.appendChild(el('div', null, r.name));
        t.appendChild(el('div', 'isl-cost', (r.craft || []).map(function (i) {
          return i.item + ' ' + g.sim.count(i.item) + '/' + i.qty;
        }).join('  ·  ')));
        row.appendChild(t);
        if (!ok) row.className += ' isl-off';
        row.onclick = function () {
          if (!ok) { g.toast('Thiếu nguyên liệu.'); return; }
          r.craft.forEach(function (i) { g.sim.take(i.item, i.qty); });
          if (!g.sim.give(r.name, 1)) { g.toast('Túi đầy.'); return; }
          g.sim.crafted[r.name] = (g.sim.crafted[r.name] || 0) + 1;
          g.addRank(8);
          g.toast('Chế được ' + r.name + '.');
          paint(b);
        };
        m.appendChild(row);
      });
      b.appendChild(m);
    }
  }

  // ----------------------------------------------------------------- cooking
  function openKitchen(g) {
    UI.panel('Bếp', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      var list = (data().recipes.cooking || []).filter(function (r) {
        return r.in && r.in.length;
      });
      var ready = list.filter(function (r) { return canMake(g.sim, r); });
      b.appendChild(el('div', 'isl-sub',
        'NẤU ĐƯỢC NGAY (' + ready.length + '/' + list.length + ')'));
      if (!ready.length) {
        b.appendChild(el('div', 'isl-hint',
          'Chưa đủ nguyên liệu cho món nào. Trồng thêm, hoặc mua ở Sạp Tạp Hoá.'));
      }
      var m = el('div', 'isl-menu');
      ready.forEach(function (r) { m.appendChild(row(r, true)); });
      b.appendChild(m);
      /* Only what is ACTUALLY within reach - a recipe the player already holds
       * at least one ingredient for. Listing thirty unmakeable dishes from the
       * first morning, on a kitchen that stands in the starting house, was the
       * biggest wall of dead text in the game. */
      var close_ = list.filter(function (r) {
        if (canMake(g.sim, r)) return false;
        return r.in.some(function (i) { return g.sim.count(i.item || i.name) > 0; });
      });
      if (close_.length) {
        b.appendChild(el('div', 'isl-sub', 'CÒN THIẾU NGUYÊN LIỆU'));
        var m2 = el('div', 'isl-menu');
        close_.slice(0, 20).forEach(function (r) { m2.appendChild(row(r, false)); });
        b.appendChild(m2);
      }
      b.appendChild(el('div', 'isl-hint',
        'Còn ' + (list.length - ready.length - close_.length) +
        ' món nữa sẽ hiện ra khi bạn có nguyên liệu đầu tiên của chúng.'));

      function row(r, ok) {
        var e = el('button', 'isl-mbtn isl-inline');
        e.appendChild(IA.icon(r.name, 30));
        var t = el('div', 'isl-grow');
        t.appendChild(el('div', null, r.name));
        t.appendChild(el('div', 'isl-cost', ingredientText(r)));
        t.appendChild(el('div', 'isl-cost',
          '+' + r.energy + ' thể lực  ·  bán ' + r.sell + 'v' +
          (r.buff ? '  ·  ' + r.buff : '')));
        e.appendChild(t);
        if (!ok) e.className += ' isl-off';
        e.onclick = function () {
          if (!ok) { g.toast('Thiếu nguyên liệu.'); return; }
          r.in.forEach(function (i) { g.sim.take(i.item, i.qty); });
          if (!g.sim.give(r.name, 1)) { g.toast('Túi đầy.'); return; }
          g.sim.addXp('foraging', 6);
          g.addRank(10);
          g.toast('Nấu xong ' + r.name + '!');
          paint(b);
        };
        return e;
      }
    }
  }

  // ------------------------------------------------------------------ museum
  var MUSEUM_CATS = { mineral: 1, artifact: 1 };
  function openMuseum(g) {
    UI.panel('Bảo tàng', function (b) { paint(b); },
             { sub: g.sim.museum.length + ' hiện vật' });
    function paint(b) {
      b.innerHTML = '';
      var donatable = g.sim.inventory.filter(function (it) {
        var cat = IA.catOf(it.name);
        return MUSEUM_CATS[cat] && g.sim.museum.indexOf(it.name) < 0;
      });
      b.appendChild(el('div', 'isl-big', g.sim.museum.length + ' / 95'));
      b.appendChild(el('div', 'isl-sub', 'NỘP ĐƯỢC'));
      if (!donatable.length) {
        b.appendChild(el('div', 'isl-hint',
          'Không có khoáng vật hay cổ vật mới nào trong túi. Đào ở Đảo Mỏ và Đảo Cổ.'));
      }
      var m = el('div', 'isl-menu');
      donatable.forEach(function (it) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(IA.icon(it.name, 28));
        r.appendChild(el('div', null, it.name));
        r.onclick = function () {
          g.sim.take(it.name, 1);
          g.sim.museum.push(it.name);
          g.addRank(20);
          var n = g.sim.museum.length;
          g.toast('Đã nộp ' + it.name + '. (' + n + ' hiện vật)');
          /* Milestones pay, because a museum that only counts is a checklist.
           * The numbers are the original's own reward tiers. */
          var prize = { 5: 200, 15: 800, 30: 2500, 45: 6000, 60: 12000, 95: 40000 }[n];
          if (prize) {
            g.sim.gold += prize;
            g.toast('Thưởng mốc ' + n + ' hiện vật: +' + prize.toLocaleString('vi') + 'v!');
          }
          paint(b);
        };
        m.appendChild(r);
      });
      b.appendChild(m);
      if (g.sim.museum.length) {
        b.appendChild(el('div', 'isl-sub', 'ĐÃ TRƯNG BÀY'));
        var chips = el('div', 'isl-chips');
        g.sim.museum.forEach(function (n) { chips.appendChild(el('span', 'isl-chip', n)); });
        b.appendChild(chips);
      }
    }
  }

  // ----------------------------------------------------------------- bundles
  var ROOM_VN = {
    'Pantry': 'Kho Nông Sản', 'Crafts Room': 'Phòng Thủ Công',
    'Fish Tank': 'Bể Cá', 'Boiler Room': 'Phòng Lò Hơi', 'Vault': 'Hầm Vàng',
    'Bulletin Board': 'Bảng Tin', 'Abandoned JojaMart': 'Siêu Thị Bỏ Hoang'
  };
  /* "2,500g Bundle" -> 2500. Returns 0 when the name carries no price, which
   * means the DATA is wrong, not that the bundle is free.
   *
   * Read by hand rather than with a regex: the separator varies across the
   * extracted names ("2,500g", "2.500g", "2500 g"), and a character walk
   * needs no escape sequence. The regex form of this shipped once with a
   * literal backspace byte where a word boundary was meant - it matched
   * nothing, returned 0, and handed the player all four Vault bundles free. */
  function bundleFee(name) {
    var s = String(name || ''), digits = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c >= '0' && c <= '9') { digits += c; continue; }
      if (c === ',' || c === '.' || c === ' ') continue;
      if ((c === 'g' || c === 'G') && digits) break;
      digits = '';                    // a letter before the price: start over
    }
    var n = parseInt(digits, 10);
    return isNaN(n) ? 0 : n;
  }

  function openBundles(g) {
    UI.panel('Bảng gói hàng', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      var all = data().bundles || [];
      var done = all.filter(function (x) { return g.sim.bundlesDone[x.name]; }).length;
      b.appendChild(el('div', 'isl-big', done + ' / ' + all.length));
      b.appendChild(el('div', 'isl-hint',
        'Nộp đủ một gói là cả quần đảo được thưởng. Giữ lại mỗi loại một món ' +
        'thay vì bán sạch.'));
      var rooms = {};
      all.forEach(function (x) { (rooms[x.room] = rooms[x.room] || []).push(x); });
      for (var room in rooms) {
        b.appendChild(el('div', 'isl-sub', (ROOM_VN[room] || room).toUpperCase()));
        var m = el('div', 'isl-menu');
        rooms[room].forEach(function (bd) {
          var finished = !!g.sim.bundlesDone[bd.name];
          var have = (bd.items || []).filter(function (i) {
            return g.sim.count(i.item) >= i.qty;
          }).length;
          var need = (bd.items || []).length;
          /* A bundle with no items is a money bundle and its price is in its
           * name - "2,500g Bundle". Reading it from the name rather than
           * hardcoding four numbers keeps it right if the data changes. */
          var fee = need ? 0 : bundleFee(bd.name);
          var r = el('button', 'isl-mbtn');
          var h = el('div', 'isl-mrow');
          h.appendChild(el('b', null, bd.name));
          h.appendChild(el('span', 'isl-cost', finished ? '✔'
            : fee ? (g.sim.gold >= fee ? 'đủ tiền' : 'thiếu tiền')
            : have + '/' + need));
          r.appendChild(h);
          r.appendChild(el('div', 'isl-cost', fee
            ? 'Nộp ' + fee.toLocaleString('vi') + 'v'
            : (bd.items || []).map(function (i) {
                return i.item + (i.qty > 1 ? ' ×' + i.qty : '');
              }).join(', ')));
          if (bd.reward) r.appendChild(el('div', 'isl-cost', 'Thưởng: ' + bd.reward));
          if (finished) r.className += ' isl-off';
          r.onclick = function () {
            if (finished) return;
            if (fee) {
              /* The four Vault bundles are PAID, not filled - their item list
               * is empty by design. `have < need` is 0 < 0, which is false, so
               * all four completed on the first tap of the first day and paid
               * out 2,000v and 120 rank EACH for nothing. */
              if (!g.sim.spendGold(fee)) {
                g.toast('Cần ' + fee.toLocaleString('vi') + 'v để nộp gói này.');
                return;
              }
            } else {
              if (have < need) { g.toast('Chưa đủ món. Còn thiếu ' + (need - have) + '.'); return; }
              bd.items.forEach(function (i) { g.sim.take(i.item, i.qty); });
            }
            g.sim.bundlesDone[bd.name] = 1;
            g.addRank(120);
            g.sim.gold += 2000;
            g.toast('Hoàn thành ' + bd.name + '! +2.000v và ' + (bd.reward || 'phần thưởng'));
            paint(b);
          };
          m.appendChild(r);
        });
        b.appendChild(m);
      }
    }
  }

  // ------------------------------------------------------------ tool upgrade
  /* Five tiers, each one swing stronger and one point cheaper in energy. The
   * ore requirement is what ties the mine to the farm: you cannot farm faster
   * without digging, and you cannot dig deeper without farming for the gold. */
  var TOOL_TIERS = [
    { name: 'Đồng', ore: 'Copper Bar', qty: 5, gold: 2000, power: 2 },
    { name: 'Sắt', ore: 'Iron Bar', qty: 5, gold: 5000, power: 3 },
    { name: 'Vàng', ore: 'Gold Bar', qty: 5, gold: 10000, power: 4 },
    { name: 'Iridium', ore: 'Iridium Bar', qty: 5, gold: 25000, power: 5 }
  ];
  function openToolUpgrade(g) {
    UI.panel('Nâng cấp dụng cụ', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      var tier = g.sim.toolTier || 0;
      b.appendChild(el('div', 'isl-say',
        'Dụng cụ hiện tại: ' + (tier ? TOOL_TIERS[tier - 1].name : 'Gỗ') +
        '  ·  sức mạnh ' + (g.sim.toolPower || 1)));
      if (tier >= TOOL_TIERS.length) {
        b.appendChild(el('div', 'isl-hint', 'Đã nâng hết cỡ.'));
        return;
      }
      var next = TOOL_TIERS[tier];
      var m = el('div', 'isl-menu');
      var r = el('button', 'isl-mbtn');
      r.appendChild(el('div', null, 'Nâng lên ' + next.name));
      r.appendChild(el('div', 'isl-cost',
        next.ore + ' ' + g.sim.count(next.ore) + '/' + next.qty +
        '  ·  ' + next.gold.toLocaleString('vi') + 'v'));
      r.appendChild(el('div', 'isl-cost',
        'Chặt/đập mạnh hơn, và mỗi nhát bớt tốn thể lực.'));
      var ok = g.sim.count(next.ore) >= next.qty && g.sim.gold >= next.gold;
      if (!ok) r.className += ' isl-off';
      r.onclick = function () {
        if (!ok) { g.toast('Chưa đủ quặng hoặc vàng.'); return; }
        g.sim.take(next.ore, next.qty);
        g.sim.spendGold(next.gold);
        g.sim.toolTier = tier + 1;
        g.sim.toolPower = next.power;
        g.addRank(60);
        g.toast('Dụng cụ đã lên ' + next.name + '!');
        paint(b);
      };
      m.appendChild(r);
      b.appendChild(m);
    }
  }

  // ------------------------------------------------------------------ shrine
  /* One offering a day for a blessing. It is the only place daily luck can be
   * bought, and it is deliberately expensive - luck is what decides rare
   * encounters and mine drops. */
  function openShrine(g, o) {
    UI.panel('Đền cổ', function (b) {
      var key = 'shrine:' + g.sim.dayIndex();
      if (g.sim.flags[key]) {
        b.appendChild(el('div', 'isl-say', 'Hôm nay bạn đã khấn rồi. Mai quay lại.'));
        return;
      }
      b.appendChild(el('div', 'isl-say',
        'Đặt một lễ vật lên bàn đá. Thứ bạn dâng càng quý, ngày mai càng may.'));
      var m = el('div', 'isl-menu');
      [['Vàng 5.000', 5000, 0.04], ['Vàng 20.000', 20000, 0.07],
       ['Vàng 60.000', 60000, 0.1]].forEach(function (opt) {
        var r = el('button', 'isl-mbtn');
        r.appendChild(el('div', null, opt[0]));
        r.appendChild(el('div', 'isl-cost', 'Vận may +' + opt[2].toFixed(2)));
        if (g.sim.gold < opt[1]) r.className += ' isl-off';
        r.onclick = function () {
          if (!g.sim.spendGold(opt[1])) { g.toast('Không đủ vàng.'); return; }
          g.sim.flags[key] = 1;
          g.sim.luck = Math.min(0.1, g.sim.luck + opt[2]);
          g.toast('Thần đảo mỉm cười. Vận may hôm nay: ' + g.sim.luckText());
          UI.close();
        };
        m.appendChild(r);
      });
      b.appendChild(m);
      b.appendChild(el('div', 'isl-hint',
        'Vận may cao làm Pokémon hiếm và quặng quý xuất hiện nhiều hơn.'));
    });
  }

  // ---------------------------------------------------------------- day care
  /* Two Pokemon left behind gain experience while you play. It is the answer
   * to "I want that Magikarp at level 20 but I am not fighting with it", and
   * it is capped so it never beats actually using one. */
  function openDaycare(g) {
    UI.panel('Nhà gửi Pokémon', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      g.sim.daycare = g.sim.daycare || [];
      b.appendChild(el('div', 'isl-hint',
        'Mỗi đêm con gửi ở đây nhận kinh nghiệm bằng khoảng một trận đánh. ' +
        'Tối đa hai con.'));
      b.appendChild(el('div', 'isl-sub', 'ĐANG GỬI'));
      if (!g.sim.daycare.length) {
        b.appendChild(el('div', 'isl-hint', 'Chưa gửi con nào.'));
      }
      var m = el('div', 'isl-menu');
      g.sim.daycare.forEach(function (p, i) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(global.ISL_POKEART.icon(p, 30));
        var t = el('div');
        t.appendChild(el('div', null, PK.nameOf(p) + '  Cv' + p.lv));
        t.appendChild(el('div', 'isl-cost', 'Chạm để đón về'));
        r.appendChild(t);
        r.onclick = function () {
          if (g.sim.party.length >= 6) { g.toast('Đội đã đủ 6 con.'); return; }
          g.sim.daycare.splice(i, 1);
          g.sim.party.push(p);
          g.toast(PK.nameOf(p) + ' đã về đội.');
          paint(b);
        };
        m.appendChild(r);
      });
      b.appendChild(m);
      b.appendChild(el('div', 'isl-sub', 'GỬI THÊM'));
      var m2 = el('div', 'isl-menu');
      g.sim.party.forEach(function (p) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(global.ISL_POKEART.icon(p, 30));
        r.appendChild(el('div', null, PK.nameOf(p) + '  Cv' + p.lv));
        if (g.sim.daycare.length >= 2 || g.sim.party.length <= 1) r.className += ' isl-off';
        r.onclick = function () {
          if (g.sim.daycare.length >= 2) { g.toast('Nhà gửi đã đầy.'); return; }
          if (g.sim.party.length <= 1) { g.toast('Phải giữ ít nhất một con trong đội.'); return; }
          g.sim.party.splice(g.sim.party.indexOf(p), 1);
          g.sim.daycare.push(p);
          paint(b);
        };
        m2.appendChild(r);
      });
      b.appendChild(m2);
    }
  }

  function daycareOvernight(g) {
    (g.sim.daycare || []).forEach(function (p) {
      PK.gainExp(p, Math.max(20, p.lv * 8));
      PK.addHappy(p, 1);
      p.wp = 0;
    });
  }

  // ------------------------------------------------------------------ mail
  /* The mailbox is where the game tells you something that is not urgent
   * enough for a tutorial card - a seasonal reminder, a nudge toward an island
   * you can afford, a birthday tomorrow. */
  function openMail(g) {
    UI.panel('Hộp thư', function (b) {
      var notes = [];
      var buyable = g.buyableIslands().filter(function (r) { return r.rankOk && r.goldOk; });
      if (buyable.length) {
        notes.push({ from: 'Văn phòng Đảo Trưởng',
          body: 'Bạn đã đủ điều kiện mua ' + buyable.map(function (r) {
            return r.rec.isl.name;
          }).join(', ') + '. Mở BẢN ĐỒ để xem.' });
      }
      if (g.sim.day >= 25) {
        notes.push({ from: 'Bác Nông',
          body: 'Sắp hết mùa ' + g.sim.seasonVN() + ' rồi. Cây trái mùa sẽ chết hết ' +
                'vào đêm chuyển mùa — thu hoạch sớm đi.' });
      }
      var bundle = global.ISL_NPCS;
      bundle.order.forEach(function (id) {
        var d = bundle.npcs[id];
        if (!g.sim.owned[d.home]) return;
        if (d.birthday.season !== g.sim.season()) return;
        var days = d.birthday.day - g.sim.day;
        if (days > 0 && days <= 2) {
          notes.push({ from: d.name,
            body: 'Còn ' + days + ' ngày nữa là sinh nhật mình đấy!' });
        }
      });
      if (g.sim.pokeCaught >= 1 && g.sim.pokeCaught < 151) {
        notes.push({ from: 'Giáo Sư Vân',
          body: 'Bạn đã bắt được ' + g.sim.pokeCaught + '/151 loài. ' +
                'Mỗi hòn đảo có đàn riêng — đừng săn mãi một chỗ.' });
      }
      if (!notes.length) {
        b.appendChild(el('div', 'isl-hint', 'Hộp thư trống.'));
        return;
      }
      notes.forEach(function (n) {
        var c = el('div', 'isl-mbtn');
        c.appendChild(el('b', null, n.from));
        c.appendChild(el('div', 'isl-cost', n.body));
        b.appendChild(c);
      });
    });
  }


  // ------------------------------------------------------- the small stations
  /* Four props that stood on four islands doing nothing. Each of them had a
   * sprite, a footprint the player walks around, and no verb - so the action
   * button went blank in front of them. A prop the player can reach is a
   * promise; these are the smallest honest things to put behind them. */

  var GEODE_KIND = {
    'Geode':        ['Quartz', 'Earth Crystal', 'Copper Ore', 'Iron Ore', 'Coal',
                     'Clay', 'Amethyst', 'Topaz', 'Alamite', 'Calcite'],
    'Frozen Geode': ['Frozen Tear', 'Aquamarine', 'Iron Ore', 'Coal', 'Clay',
                     'Jade', 'Malachite', 'Marble', 'Ghost Crystal'],
    'Magma Geode':  ['Fire Quartz', 'Ruby', 'Gold Ore', 'Iron Ore', 'Basalt',
                     'Obsidian', 'Fire Opal', 'Mudstone'],
    'Omni Geode':   ['Diamond', 'Emerald', 'Ruby', 'Jade', 'Amethyst', 'Topaz',
                     'Aquamarine', 'Iridium Ore', 'Gold Ore', 'Prismatic Shard']
  };

  function openGeode(g) {
    UI.panel('Máy đập đá quý', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      b.appendChild(el('div', 'isl-sub',
        'Đá quý chưa đập thì không nộp bảo tàng được. Đập ra mới biết bên trong có gì.'));
      var have = g.sim.inventory.filter(function (it) { return GEODE_KIND[it.name]; });
      if (!have.length) {
        b.appendChild(el('div', 'isl-hint',
          'Trong túi không có viên nào. Đập đá ở Đảo Mỏ để tìm.'));
        return;
      }
      var m = el('div', 'isl-menu');
      have.forEach(function (it) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(IA.icon(it.name, 28));
        var t = el('div');
        t.appendChild(el('div', null, it.name + ' ×' + it.qty));
        t.appendChild(el('div', 'isl-cost', 'Đập 1 viên — 25v tiền công'));
        r.appendChild(t);
        r.onclick = function () {
          if (g.sim.gold < 25) { g.toast('Không đủ 25v tiền công.'); return; }
          var pool = GEODE_KIND[it.name];
          var got = pool[Math.floor(Math.random() * pool.length)];
          var qty = it.name === 'Omni Geode' ? 1 : (Math.random() < 0.25 ? 3 : 1);
          /* Pay and consume only if the result can actually land in the bag,
           * so a full bag cannot eat the geode and the fee together. */
          if (!g.sim.canGive(got, 0)) { g.toast('Túi đầy.'); return; }
          if (!g.sim.takeStack(it, 1)) { paint(b); return; }
          g.sim.spendGold(25);
          g.sim.give(got, qty, 0);
          g.sim.addXp('mining', 5);
          g.addRank(4);
          g.toast('Bên trong là ' + got + (qty > 1 ? ' ×' + qty : '') + '!');
          paint(b);
        };
        m.appendChild(r);
      });
      b.appendChild(m);
    }
  }

  var FOSSIL_POOL = ['Bone Fragment', 'Fossilized Spine', 'Fossilized Rib',
                     'Fossilized Skull', 'Fossilized Leg', 'Fossilized Tail',
                     'Amphibian Fossil', 'Snake Skull', 'Snake Vertebrae',
                     'Nautilus Fossil', 'Trilobite', 'Ancient Doll',
                     'Elvish Jewelry', 'Chewing Stick', 'Ancient Drum'];

  function openFossil(g) {
    var day = g.sim.dayIndex();
    g.sim.flags = g.sim.flags || {};
    if (g.sim.flags.fossilDay === day) {
      g.toast('Hôm nay đào hết chỗ rồi. Mai lớp đất mới lộ ra.');
      return;
    }
    if (g.sim.energy < 8) { g.toast('Không đủ sức để đào.'); return; }
    var name = FOSSIL_POOL[Math.floor(Math.random() * FOSSIL_POOL.length)];
    if (!g.sim.canGive(name, 0)) { g.toast('Túi đầy.'); return; }
    g.spend(8);
    g.sim.flags.fossilDay = day;
    g.sim.give(name, 1, 0);
    g.sim.addXp('foraging', 10);
    g.addRank(8);
    g.toast('Đào được ' + name + '. Nộp cho Cụ Hiền ở bàn bảo tàng.');
  }

  function openBait(g) {
    UI.panel('Bàn làm mồi', function (b) {
      b.appendChild(el('div', 'isl-sub', 'Sợi thành mồi. Mồi làm cá cắn nhanh hơn.'));
      var m = el('div', 'isl-menu');
      m.appendChild(UI.btn('1 Fiber → 5 Bait', function () {
        if (g.sim.count('Fiber') < 1) { g.toast('Cần 1 Fiber.'); return; }
        if (!g.sim.canGive('Bait', 0)) { g.toast('Túi đầy.'); return; }
        g.sim.take('Fiber', 1);
        g.sim.give('Bait', 5, 0);
        g.toast('+5 Bait');
      }));
      m.appendChild(UI.btn('10 Fiber → 1 Crab Pot', function () {
        if (g.sim.count('Fiber') < 10) { g.toast('Cần 10 Fiber.'); return; }
        if (!g.sim.canGive('Crab Pot', 0)) { g.toast('Túi đầy.'); return; }
        g.sim.take('Fiber', 10);
        g.sim.give('Crab Pot', 1, 0);
        g.toast('+1 Crab Pot');
      }));
      b.appendChild(m);
      b.appendChild(el('div', 'isl-hint',
        'Đang có ' + g.sim.count('Fiber') + ' Fiber và ' + g.sim.count('Bait') + ' Bait.'));
    });
  }

  global.ISL_PLACES = {
    machineRecipes: machineRecipes, canMake: canMake, pickAlt: pickAlt,
    openMachine: openMachine, machinesOvernight: machinesOvernight,
    openWorkshop: openWorkshop, openKitchen: openKitchen,
    openMuseum: openMuseum, openBundles: openBundles,
    openToolUpgrade: openToolUpgrade, openShrine: openShrine,
    openDaycare: openDaycare, daycareOvernight: daycareOvernight,
    openMail: openMail, nightsFor: nightsFor, EXTRA_CRAFT: EXTRA_CRAFT,
    openGeode: openGeode, openFossil: openFossil, openBait: openBait
  };
})(window);
