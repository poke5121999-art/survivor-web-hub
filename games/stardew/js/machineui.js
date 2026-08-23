/*
 * machineui.js - the panels for machines, storage and crafting-then-placing.
 *
 * Replaces the recipe-list panel the first version shipped, which the player
 * quite reasonably could not use: a furnace showed a list of outputs and no
 * inventory, so there was no way to put ore in. The brief's model is the one
 * implemented here - open the thing, see ITS SLOTS and YOUR BAG side by side,
 * and drop an item in.
 *
 * Also here:
 *   - "có sẵn 1 cái lò trong nhà... mỗi lần nâng cấp thì thêm 1 ô"
 *   - "chest... cũng cần nâng cấp để thêm slot (thêm nhiều slot 1 lần nâng)"
 *   - "máy ấp trứng + máy tái chế + máy dệt + cột điện + máy duplicate quặng
 *      cũng tương tự nhưng cần phải craft trước (show require xong nếu trong
 *      người có đủ click vào sẽ craft - áp dụng cho cả cầu gãy)"
 */
(function (global) {
  'use strict';

  var UI = global.SDV_UI.UI, el = global.SDV_UI.el, icon = global.SDV_UI.icon;
  var M = global.SDV_MACHINES;

  function costLine(sim, mats) {
    return Object.keys(mats).map(function (k) {
      return k + ' ' + sim.count(k) + '/' + mats[k];
    }).join(' · ');
  }
  function canPay(sim, mats, gold) {
    if (gold && sim.gold < gold) return false;
    for (var k in mats) if (sim.count(k) < mats[k]) return false;
    return true;
  }
  function pay(sim, mats, gold) {
    if (gold) sim.gold -= gold;
    for (var k in mats) sim.take(k, mats[k]);
  }

  /* A reusable "here is what it costs, tap when you can afford it" block -
   * the brief asks for exactly this shape, for machines AND for the bridge. */
  UI.prototype.requirementButton = function (label, mats, gold, onOk) {
    var self = this, s = this.sim;
    var ok = canPay(s, mats, gold);
    var b = el('button', 'sdv-mbtn' + (ok ? '' : ' sdv-off'));
    b.appendChild(el('span', null, label));
    b.appendChild(el('small', 'sdv-cost',
      (gold ? gold.toLocaleString('vi-VN') + 'g · ' : '') + costLine(s, mats)));
    b.addEventListener('click', function () {
      /* The click that ends a press-and-hold lands here too, and it used to
       * spend the materials the player was only trying to carry past. */
      if (self.swallowClick && self.swallowClick()) return;
      if (!canPay(s, mats, gold)) return self.game.toast('Chưa đủ nguyên liệu');
      pay(s, mats, gold);
      onOk();
    });
    return b;
  };

  /* Every machine's state in one place, so it saves with everything else and
   * the workbench can list them without hunting the map for objects. */
  function stateOf(sim, name) {
    sim.machines = sim.machines || {};
    if (!sim.machines[name]) {
      var d = M.def(name) || {};
      sim.machines[name] = {
        machine: name,
        built: name === 'Furnace',       // the house furnace works from day one
        slots: d.slotsAtStart || 1,
        jobs: []
      };
    }
    return sim.machines[name];
  }

  /* WHY every machine standing in the world is only a MARKER: a machine used
   * to exist twice - once as `sim.machines[name]` behind the workbench, once
   * as an object on the floor with its own jobs array - so the furnace you
   * tapped and the furnace in the list were different furnaces, and the
   * overnight pass ticked both. The object now carries nothing but the name;
   * the one copy of the state lives in the save. */
  function resolve(sim, o) {
    if (!o) return null;
    if (o.kind === 'machine' || o.kind === 'furnace') {
      return stateOf(sim, o.machine || 'Furnace');
    }
    return o;
  }
  UI.prototype.machineState = function (o) { return resolve(this.sim, o); };

  /* The workbench: one tap, then every machine with its state. */
  UI.prototype.openMachineList = function () {
    var self = this, s = this.sim;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      'Máy nào chưa dựng thì hiện nguyên liệu cần. Đủ thì bấm là dựng.'));
    M.CRAFTABLE.forEach(function (name) {
      var st = stateOf(s, name);
      var d = M.def(name) || {};
      var row = el('button', 'sdv-mbtn');
      var busy = (st.jobs || []).filter(Boolean).length;
      var ready = (st.jobs || []).filter(function (j) { return j && j.ready; }).length;
      row.appendChild(el('span', null, M.label(name)
        + (st.built ? (ready ? '  ✅ có đồ lấy ra' : (busy ? '  ⏳ đang chạy' : ''))
                    : '  🔨 chưa dựng')));
      row.appendChild(el('small', 'sdv-cost',
        st.built ? (d.hint || '') : costLine(s, d.craft || {})));
      row.addEventListener('click', function () { self.openMachine(st); });
      body.appendChild(row);
    });
    this.openPanel('Xưởng', body);
  };

  // ------------------------------------------------------------------ machine
  UI.prototype.openMachine = function (o) {
    var self = this, s = this.sim, g = this.game;
    o = resolve(s, o);
    var name = o.machine || 'Furnace';
    var d = M.def(name);
    var body = el('div', 'sdv-body');
    o.slots = o.slots || (d && d.slotsAtStart) || 1;
    o.jobs = o.jobs || [];

    body.appendChild(el('div', 'sdv-sub', (d ? d.hint : '')));

    /* Not built yet: show what it needs, exactly like the broken bridge.
     * WHY: these machines are placed in the world from the start; the player
     * repairs/erects them in place rather than crafting a portable copy. */
    if (o.built === false && d && d.craft) {
      body.appendChild(el('div', 'sdv-speech',
        'Cái này chưa dựng xong. Gom đủ nguyên liệu rồi bấm để dựng.'));
      body.appendChild(this.requirementButton(
        '🔨 Dựng ' + M.label(name), d.craft, 0, function () {
          o.built = true;
          /* WHY it is put in the room: with everything behind one bench the
             house never changed however much you built, and the owner read
             that as "cảm giác không phát triển". A built machine now stands
             on its own tile, spread across the cottage. */
          var W2 = global.SDV_WORLD;
          if (W2 && W2.placeMachine) {
            W2.placeMachine(g.world.areas.house, name);
          }
          g.toast('Đã dựng xong ' + M.label(name) + ' — đặt trong nhà');
          self.openMachine(o);
        }));
      var back0 = el('button', 'sdv-mbtn', '\u2190 Về danh sách máy');
      back0.addEventListener('click', function () { self.openMachineList(); });
      body.appendChild(back0);
      var bag0 = el('div', 'sdv-grid');
      for (var bi = 0; bi < s.invSize; bi++) {
        bag0.appendChild(self.slotEl(s.inventory[bi], s.inventory, bi, {}));
      }
      body.appendChild(el('div', 'sdv-sub', 'Túi đồ'));
      body.appendChild(bag0);
      return this.openPanel(M.label(name), body);
    }

    // ---- the slots ----
    var slotRow = el('div', 'sdv-slotrow');
    for (var i = 0; i < M.slotCount(o); i++) {
      (function (idx) {
        var job = o.jobs[idx];
        var cell = el('div', 'sdv-mslot' + (job ? (job.ready ? ' ready' : ' busy') : ''));
        if (job && job.ready && (M.def(name) || {}).hatchOnly) {
          cell.appendChild(el('span', 'sdv-mwait', '🐣'));
          cell.appendChild(el('small', null, job.out));
          cell.addEventListener('click', function () {
            if (self.swallowClick()) return;
            g.toast(job.out + ' đã vào chuồng rồi');
            o.jobs[idx] = null;
            self.openMachine(o);
          });
        } else if (job && job.ready) {
          cell.appendChild(icon(job.out, job.cat || 'artisan', 34));
          cell.appendChild(el('span', 'sdv-qty', '✓'));
          cell.addEventListener('click', function () {
            if (self.swallowClick()) return;
            if (!s.give(job.out, job.qty || 1, job.quality || 0)) {
              return g.toast('Túi đầy');
            }
            if (job.price) {
              // an artisan good the item table has never seen gets its price now
              s.data.items[job.out.toLowerCase()] = s.data.items[job.out.toLowerCase()]
                || { name: job.out, sell: job.price, cat: job.cat || 'artisan' };
            }
            g.toast('Lấy ra ' + job.out);
            /* A crystalarium keeps going forever - its own hint says so, and
             * the repeat flag was stored and never read. */
            if (job.repeat) {
              o.jobs[idx] = { out: job.out, qty: job.qty, mins: job.mins,
                              left: job.mins, cat: job.cat, repeat: true,
                              source: job.source, ready: false };
            } else {
              o.jobs[idx] = null;
            }
            self.openMachine(o);
          });
        } else if (job) {
          cell.appendChild(el('span', 'sdv-mwait', '⏳'));
          cell.appendChild(el('small', null, job.out));
        } else {
          cell.appendChild(el('span', 'sdv-mempty', '+'));
          cell.addEventListener('click', function () {
            if (self.swallowClick()) return;
            var d = self.heldItem();
            if (d) self.feedMachine(o, d.it, idx, d.list);
            else g.toast('Chạm một món trong túi để bỏ vào máy');
          });
        }
        /* A machine slot is a drop target for touch too. WHY __sdvDrop: the
         * HTML5 drop event below never fires on a phone, so "kéo hoặc chạm đồ
         * để bỏ vào" only ever half worked - the drag half did nothing at all. */
        cell.classList.add('sdv-dz');
        cell.__sdvDrop = function (d) { self.feedMachine(o, d.it, idx, d.list); };
        cell.addEventListener('dragover', function (e) {
          e.preventDefault(); cell.classList.add('sdv-dzover');
        });
        cell.addEventListener('dragleave', function () {
          cell.classList.remove('sdv-dzover');
        });
        cell.addEventListener('drop', function (e) {
          e.preventDefault();
          cell.classList.remove('sdv-dzover');
          var d = self.heldItem();
          /* By identity, not by `dragging.it` straight off a stale record:
           * the held stack may have left the bag since it was picked up. */
          if (d) self.feedMachine(o, d.it, idx, d.list);
          else g.toast('Chưa cầm món nào');
        });
        slotRow.appendChild(cell);
      })(i);
    }
    body.appendChild(el('div', 'sdv-sub',
      'Ô của máy — chạm một món trong túi, hoặc chạm giữ rồi kéo thả vào ô'));
    body.appendChild(slotRow);

    // ---- upgrade ----
    if (!d || d.upgradable !== false) {
      var cost = M.upgradeCost(o);
      body.appendChild(this.requirementButton(
        '⬆ Nâng cấp — thêm 1 ô (đang có ' + M.slotCount(o) + ')',
        cost.mats, cost.gold, function () {
          o.slots = M.slotCount(o) + 1;
          g.toast('Đã nâng cấp, giờ có ' + o.slots + ' ô');
          self.openMachine(o);
        }));
    }

    // ---- the bag ----
    var grid = el('div', 'sdv-grid');
    for (var k = 0; k < s.invSize; k++) {
      grid.appendChild(this.slotEl(s.inventory[k], s.inventory, k, {
        onClick: function (it) {
          if (!it) return g.toast('Ô này trống');
          self.feedMachine(o, it, null, s.inventory);
        }
      }));
    }
    body.appendChild(el('div', 'sdv-sub', 'Túi đồ — chạm một món để bỏ vào máy'));
    body.appendChild(grid);
    var back = el('button', 'sdv-mbtn', '\u2190 Về danh sách máy');
    back.addEventListener('click', function () {
      if (self.swallowClick()) return;
      self.openMachineList();
    });
    body.appendChild(back);
    this.openPanel(M.label(name), body);
    /* Without a refresh hook, dropping a stack between the bag and a machine
     * slot redrew nothing: the panel kept showing the item in both places. */
    this.refreshPanel = function () { self.openMachine(o); };
  };

  UI.prototype.feedMachine = function (o, item, slotIdx, list) {
    var self = this, s = this.sim, g = this.game;
    // an empty bag slot is a tap on nothing, not a crash
    if (!item || !item.name) { this.clearHeld(); return; }
    list = list || s.inventory;
    var name = o.machine || 'Furnace';
    o.jobs = o.jobs || [];
    var free = slotIdx;
    if (free == null || o.jobs[free]) {
      free = -1;
      for (var i = 0; i < M.slotCount(o); i++) {
        if (!o.jobs[i]) { free = i; break; }
      }
    }
    var res = M.tryAccept(name, item, s, free >= 0);
    if (res.error) { this.clearHeld(); return g.toast(res.error); }
    var r = res.recipe;
    /* WHY the exact stack is consumed rather than sim.take(name, n): take()
     * matches on NAME alone and works from the end of the bag, so tapping a
     * plain Copper Ore fed the iridium-grade stack sitting further down - the
     * good ore vanished and the plain one stayed put. tryAccept counts across
     * grades for the same reason, so the amount is re-checked here on the one
     * stack the player actually pointed at. */
    var idx = list.indexOf(item);
    if (idx < 0 || item.qty < r.need) {
      this.clearHeld();
      return g.toast('Cần ' + r.need + ' ' + item.name + ' cùng loại trong một ô');
    }
    if (r.fuel && s.count(r.fuel) < (r.fuelQty || 1)) {
      this.clearHeld();
      return g.toast('Thiếu ' + r.fuel);
    }
    item.qty -= r.need;
    if (item.qty <= 0) list.splice(idx, 1);
    if (r.fuel) s.take(r.fuel, r.fuelQty || 1);
    o.jobs[free] = {
      out: r.out, qty: r.qty || 1, mins: r.mins, left: r.mins,
      price: r.price, cat: r.cat, quality: r.quality, hatch: r.hatch,
      repeat: r.repeat, source: item.name, ready: false
    };
    this.clearHeld();
    g.toast('Đã bỏ ' + r.need + ' ' + item.name + ' vào ' + M.label(name));
    this.openMachine(o);
  };

  // ------------------------------------------------------------------ storage
  var baseChest = UI.prototype.openChest;
  UI.prototype.openChest = function () {
    baseChest.call(this);
    var self = this, s = this.sim;
    if (!this.panel) return;
    var body = this.panel.querySelector('.sdv-body');
    if (!body) return;
    /* "cũng cần nâng cấp để thêm slot (thêm nhiều slot 1 lần nâng)" - the chest
     * grows in blocks of 12, unlike the furnace's one-at-a-time. */
    /* Floor, not round: a chest grown by anything other than a clean multiple
     * of 12 (an older save, a future bonus) rounded UP a tier and quietly
     * charged for an upgrade the player had not reached. */
    var tier = Math.max(0, Math.floor((s.chestSize - 18) / 12));
    var mats = { Wood: 100 + tier * 100, 'Iron Bar': 2 + tier * 2 };
    var gold = 1000 * (tier + 1);
    var btn = this.requirementButton(
      '⬆ Nâng rương — thêm 12 ô (đang có ' + s.chestSize + ')', mats, gold,
      function () {
        s.chestSize += 12;
        self.game.toast('Rương giờ có ' + s.chestSize + ' ô');
        self.openChest();
      });
    body.insertBefore(btn, body.firstChild);
  };

  // ------------------------------------------------------------------ craft+place
  /* The five the brief names, plus the rest, all through one requirement list. */
  UI.prototype.openMachineCraft = function () {
    var self = this, s = this.sim, g = this.game;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      'Chế xong rồi chạm vào một ô trống trên nông trại để đặt máy.'));
    M.CRAFTABLE.forEach(function (name) {
      var d = M.def(name);
      if (!d || !d.craft) return;
      var owned = s.crafted[name] || 0;
      var row = self.requirementButton(
        M.label(name) + (owned ? '  (có sẵn ' + owned + ')' : ''),
        d.craft, 0, function () {
          s.crafted[name] = (s.crafted[name] || 0) + 1;
          g.toast('Đã chế ' + M.label(name) + ' — chạm ô trống để đặt');
          self.placeMode = name;
          self.close();
        });
      row.appendChild(el('small', 'sdv-cost', d.hint || ''));
      body.appendChild(row);
    });
    var owned = Object.keys(s.crafted).filter(function (k) { return s.crafted[k] > 0; });
    if (owned.length) {
      body.appendChild(el('div', 'sdv-sub', 'Đã chế, chưa đặt — chạm để đặt'));
      owned.forEach(function (name) {
        var b = el('button', 'sdv-mbtn', '📦 Đặt ' + M.label(name)
                   + ' (' + s.crafted[name] + ')');
        b.addEventListener('click', function () {
          self.placeMode = name;
          g.toast('Chạm vào một ô trống trên nông trại');
          self.close();
        });
        body.appendChild(b);
      });
    }
    this.openPanel('Chế tạo máy móc', body);
  };

  /* Machines finish overnight; passive ones (bee house, lightning rod) produce
   * on their own terms. */
  /* WHY this exists: jobs only ever advanced at bedtime, so every processing
   * time in machines.js (30 min for a copper bar, 120 for coffee) was
   * decorative and nothing could finish inside a day. */
  function machinesTick(game, minutes) {
    var s = game.sim, made = 0;
    var list = [];
    for (var mn in (s.machines || {})) list.push(s.machines[mn]);
    list.forEach(function (o) {
      if (o.built === false) return;
      (o.jobs || []).forEach(function (j) {
        if (!j || j.ready) return;
        j.left -= minutes;
        if (j.left <= 0) { j.left = 0; j.ready = true; made++; }
      });
    });
    return made;
  }

  function machinesOvernight(game) {
    var s = game.sim, made = 0;
    var stormy = s.weather === 'storm';
    var list = [];
    for (var mn in (s.machines || {})) list.push(s.machines[mn]);
    (function (objs) {
      objs.forEach(function (o) {
        if (o.built === false) return;
        var d = M.def(o.machine) || {};
        o.jobs = o.jobs || [];
        for (var i = 0; i < o.jobs.length; i++) {
          var j = o.jobs[i];
          if (!j || j.ready) continue;
          j.left -= 24 * 60;
          if (j.left <= 0) {
            j.ready = true;
            made++;
            if (j.hatch && game.farm) {
              /* Incubation must not charge the shop price, and a failure has to
               * be visible: it used to swallow the egg, bill 800g and hand the
               * player an unsellable item literally named "Chicken". */
              var err = game.farm.hatch(j.hatch);
              j.hatchFailed = err || null;
              j.ready = !err;
              if (err) { j.left = 24 * 60; j.hatchFailed = err; }
            }
          }
        }
        if (d.passive) {
          o.passiveDays = (o.passiveDays || 0) + 1;
          var due = d.passiveDays || 1;
          var fire = d.passive === 'storm' ? stormy : o.passiveDays >= due;
          if (fire) {
            o.jobs[0] = { out: d.passiveOut, qty: 1, ready: true, mins: 0, left: 0 };
            o.passiveDays = 0;
            made++;
          }
        }
      });
    })(list);
    return made;
  }

  global.SDV_MACHINEUI = { machinesOvernight: machinesOvernight,
                           machinesTick: machinesTick, stateOf: stateOf };
})(window);
