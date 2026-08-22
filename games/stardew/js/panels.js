/*
 * panels.js - the second half of the UI: everything the world gained when the
 * mine, the farm buildings and the calendar arrived.
 *
 * It extends SDV_UI.UI rather than editing ui.js, and it wraps openObject so
 * the original handler stays the fallback. New object kinds land here; the
 * ones ui.js already knew keep working untouched.
 */
(function (global) {
  'use strict';

  var UI = global.SDV_UI.UI, el = global.SDV_UI.el, icon = global.SDV_UI.icon;
  var FL = global.SDV_FARMLIFE, EV = global.SDV_EVENTS, SIM = global.SDV_SIM;

  var baseOpen = UI.prototype.openObject;

  UI.prototype.openObject = function (o, x, y) {
    switch (o.kind) {
      case 'ladder':          return this.game.mine.descend();
      case 'mineExit':        return this.leaveMine(o);
      case 'mineEntrance':    return this.enterMine('mine');
      case 'skullEntrance':   return this.enterMine('skull');
      case 'volcanoEntrance': return this.enterMine('volcano');
      case 'mailbox':         return this.openMail();
      case 'calendarBoard':   return this.openCalendar();
      case 'museumDesk': case 'display': return this.openMuseum();
      case 'toolUpgrade':     return this.openToolUpgrade();
      case 'geodeCrusher':    return this.openGeode();
      case 'animalShop':      return this.openAnimalShop();
      case 'buildMenu':       return this.openCarpenter();
      case 'travelingCart':   return this.openCart();
      case 'islandTrader':    return this.openCart(true);
      case 'kitchen':         return this.openKitchen();
      case 'boat': case 'boatTicket': return this.openBoat();
      case 'caveChoice':      return this.openCaveChoice();
      case 'sign':            return this.openQuestBoard();
      case 'bus':             return this.openBus();
      case 'sewerGrate':      return this.openSewer();
      case 'fruitTree':       return this.openFruitTree(o);
      case 'sprinkler':       return this.game.toast('Vòi tưới sẽ tưới 4 ô quanh nó mỗi đêm');
      case 'greenhouseShell': return this.game.toast('Nhà kính còn hỏng — hoàn thành Pantry để sửa');
      case 'building':
        if (o.farmBuilding) return this.openFarmBuilding(o);
        return baseOpen.call(this, o, x, y);
      default:
        return baseOpen.call(this, o, x, y);
    }
  };

  // ------------------------------------------------------------------ mine
  UI.prototype.enterMine = function (kind) {
    var self = this, g = this.game;
    var deepest = g.sim.deepestMine || 0;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      kind === 'skull' ? 'Hang Sọ — không có đáy, và mỗi tầng nguy hiểm hơn tầng trên.'
      : kind === 'volcano' ? 'Núi lửa trên đảo.'
      : 'Hầm mỏ 120 tầng. Thang máy nhớ mỗi 5 tầng.'));
    var list = el('div', 'sdv-menu');
    var b1 = el('button', 'sdv-mbtn', '⛏ Xuống tầng 1');
    b1.addEventListener('click', function () {
      self.close(); g.mine.enter(1, kind);
    });
    list.appendChild(b1);
    if (kind === 'mine' && deepest >= 5) {
      body.appendChild(el('div', 'sdv-sub', 'Thang máy — tầng đã tới: ' + deepest));
      var lifts = el('div', 'sdv-brow');
      for (var f = 5; f <= Math.min(120, deepest); f += 5) {
        (function (floor) {
          var c = el('button', 'sdv-chip ok', String(floor));
          c.addEventListener('click', function () {
            self.close(); g.mine.enter(floor, 'mine');
          });
          lifts.appendChild(c);
        })(f);
      }
      body.appendChild(lifts);
    }
    body.appendChild(list);
    this.openPanel(kind === 'skull' ? 'Hang Sọ' : kind === 'volcano' ? 'Núi lửa' : 'Hầm mỏ', body);
  };

  /* Walking back up out of a cave. */
  UI.prototype.leaveMine = function (o) {
    var self = this, g = this.game;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub', 'Lối lên khỏi hang.'));
    var b = el('button', 'sdv-mbtn', '⬆ Lên khỏi hang');
    b.addEventListener('click', function () {
      self.close();
      g.mine.leave();
    });
    body.appendChild(b);
    var d = el('button', 'sdv-mbtn', '⛏ Ở lại đào tiếp');
    d.addEventListener('click', function () { self.close(); });
    body.appendChild(d);
    this.openPanel('Tầng ' + (o.depth || '?'), body);
  };

  // ------------------------------------------------------------------ mail
  UI.prototype.openMail = function () {
    var self = this, ev = this.game.events;
    var body = el('div', 'sdv-body');
    if (!ev.pending.length) {
      body.appendChild(el('div', 'sdv-sub', 'Hộp thư trống.'));
    }
    ev.pending.forEach(function (m, i) {
      var box = el('div', 'sdv-bundle');
      box.appendChild(el('h4', null, '✉️ ' + m.from));
      box.appendChild(el('div', 'sdv-speech', m.body));
      if (m.gift) box.appendChild(el('div', 'sdv-sub', 'Kèm quà: ' + m.gift.item + ' ×' + m.gift.qty));
      var b = el('button', 'sdv-mbtn', 'Đọc và nhận');
      b.addEventListener('click', function () { ev.readMail(i); self.openMail(); });
      box.appendChild(b);
      body.appendChild(box);
    });
    if (ev.mail.length) {
      body.appendChild(el('div', 'sdv-sub', 'Đã đọc (' + ev.mail.length + ')'));
      ev.mail.slice(-6).forEach(function (m) {
        body.appendChild(el('div', 'sdv-row', m.from + ' — ' + m.body.slice(0, 48) + '…'));
      });
    }
    this.openPanel('Hộp thư', body);
  };

  // ------------------------------------------------------------------ calendar
  UI.prototype.openCalendar = function () {
    var s = this.sim, data = this.game.data;
    var body = el('div', 'sdv-body');
    var grid = el('div', 'sdv-cal');
    var fests = {};
    EV.FESTIVALS.forEach(function (f) {
      if (f.season === s.season()) fests[f.day] = f;
    });
    var bdays = {};
    data.villagers.forEach(function (v) {
      if (v.birthday && v.birthday.season === s.season()) {
        (bdays[v.birthday.day] = bdays[v.birthday.day] || []).push(v.name);
      }
    });
    for (var d = 1; d <= 28; d++) {
      var cell = el('div', 'sdv-calday' + (d === s.day ? ' today' : ''));
      cell.appendChild(el('b', null, String(d)));
      if (fests[d]) cell.appendChild(el('span', 'sdv-fest', '🎪'));
      if (bdays[d]) cell.appendChild(el('span', 'sdv-bday', '🎂'));
      cell.title = (fests[d] ? fests[d].name + ' · ' : '') + (bdays[d] || []).join(', ');
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    body.appendChild(el('div', 'sdv-sub', 'Sinh nhật trong mùa này'));
    Object.keys(bdays).sort(function (a, b) { return a - b; }).forEach(function (d) {
      body.appendChild(el('div', 'sdv-row', 'Ngày ' + d + ': ' + bdays[d].join(', ')));
    });
    if (Object.keys(fests).length) {
      body.appendChild(el('div', 'sdv-sub', 'Lễ hội'));
      Object.keys(fests).forEach(function (d) {
        body.appendChild(el('div', 'sdv-row', 'Ngày ' + d + ': ' + fests[d].name));
      });
    }
    this.openPanel('Lịch — ' + s.seasonVN() + ', Năm ' + s.year, body);
  };

  // ------------------------------------------------------------------ museum
  UI.prototype.openMuseum = function () {
    var self = this, s = this.sim, ev = this.game.events;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-big',
      s.museum.length + ' / ' + ev.museumTotal()));
    body.appendChild(el('div', 'sdv-sub',
      'Bảo tàng nhận khoáng vật và cổ vật, mỗi món một lần.'));
    var can = s.inventory.filter(function (it) { return ev.canDonate(it.name); });
    if (!can.length) {
      body.appendChild(el('div', 'sdv-sub', 'Trong túi chưa có món nào quyên góp được.'));
    }
    var list = el('div', 'sdv-list');
    can.forEach(function (it) {
      var info = s.itemInfo(it.name);
      var row = el('div', 'sdv-row sdv-buy');
      row.appendChild(icon(it.name, info.cat, 26));
      row.appendChild(el('span', 'sdv-name', it.name));
      row.appendChild(el('span', 'sdv-price', 'Quyên góp'));
      row.addEventListener('click', function () {
        var err = ev.donate(it.name);
        if (err) return self.game.toast(err);
        self.game.toast('Đã quyên góp ' + it.name);
        self.openMuseum();
      });
      list.appendChild(row);
    });
    body.appendChild(list);
    if (s.museum.length) {
      body.appendChild(el('div', 'sdv-sub', 'Đã trưng bày'));
      var chips = el('div', 'sdv-brow');
      s.museum.forEach(function (n) { chips.appendChild(el('div', 'sdv-chip ok', n)); });
      body.appendChild(chips);
    }
    this.openPanel('Bảo tàng', body);
  };

  // ------------------------------------------------------------------ tools
  UI.prototype.openToolUpgrade = function () {
    var self = this, s = this.sim, ev = this.game.events;
    var body = el('div', 'sdv-body');
    var tier = s.toolTier || 0;
    var names = ['Gỗ', 'Đồng', 'Thép', 'Vàng', 'Iridium'];
    body.appendChild(el('div', 'sdv-sub', 'Công cụ hiện tại: ' + names[tier]
      + ' — mỗi bậc làm việc nhanh hơn và tốn ít sức hơn.'));
    if (tier >= EV.TOOL_TIERS.length) {
      body.appendChild(el('div', 'sdv-sub', 'Đã ở mức cao nhất.'));
    } else {
      var t = EV.TOOL_TIERS[tier];
      var b = el('button', 'sdv-mbtn');
      b.appendChild(el('span', null, '🔧 Nâng lên ' + t.name));
      b.appendChild(el('small', 'sdv-cost', t.gold + 'g + ' + t.qty + ' ' + t.bar
        + ' (đang có ' + s.count(t.bar) + ')'));
      b.addEventListener('click', function () {
        var err = ev.upgradeTool();
        if (err) return self.game.toast(err);
        self.game.toast('Công cụ đã nâng cấp!');
        self.openToolUpgrade();
      });
      body.appendChild(b);
    }
    this.openPanel('Nâng cấp công cụ', body);
  };

  UI.prototype.openGeode = function () {
    var self = this, s = this.sim;
    var body = el('div', 'sdv-body');
    var geodes = s.inventory.filter(function (it) { return /geode/i.test(it.name); });
    body.appendChild(el('div', 'sdv-sub', 'Clint đập geode lấy 25g một viên.'));
    if (!geodes.length) body.appendChild(el('div', 'sdv-sub', 'Không có geode nào.'));
    geodes.forEach(function (it) {
      var b = el('button', 'sdv-mbtn', '💎 Đập ' + it.name + ' (×' + it.qty + ')');
      b.addEventListener('click', function () {
        if (s.gold < 25) return self.game.toast('Không đủ 25g');
        s.gold -= 25;
        s.take(it.name, 1);
        var minerals = Object.keys(self.game.data.items).filter(function (k) {
          return self.game.data.items[k].cat === 'mineral';
        });
        var got = self.game.data.items[minerals[Math.floor(Math.random() * minerals.length)]];
        if (got && s.give(got.name, 1)) self.game.toast('Bên trong có ' + got.name + '!');
        self.openGeode();
      });
      body.appendChild(b);
    });
    this.openPanel('Máy đập geode', body);
  };

  // ------------------------------------------------------------------ animals
  UI.prototype.openAnimalShop = function () {
    var self = this, s = this.sim, fl = this.game.farm;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      'Mua xong con vật tự vào chuồng còn trống phù hợp.'));
    Object.keys(FL.ANIMAL_KINDS).forEach(function (k) {
      var def = FL.ANIMAL_KINDS[k];
      if (!def.cost) return;
      var row = el('div', 'sdv-row sdv-buy');
      row.appendChild(icon(k, 'resource', 26));
      var col = el('div', 'sdv-col');
      col.appendChild(el('span', 'sdv-name', k));
      col.appendChild(el('small', 'sdv-cost',
        (def.home === 'coop' ? 'Chuồng gà' : 'Chuồng lớn') + ' · cho ' + def.produce
        + ' mỗi ' + def.days + ' ngày'));
      row.appendChild(col);
      row.appendChild(el('span', 'sdv-price', def.cost + 'g'));
      row.addEventListener('click', function () {
        var err = fl.buy(k);
        if (err) return self.game.toast(err);
        self.game.toast('Đã mua một con ' + k);
        self.updateHud();
      });
      body.appendChild(row);
    });
    this.openPanel('Mua vật nuôi', body);
  };

  UI.prototype.openFarmBuilding = function (o) {
    var self = this, fl = this.game.farm;
    var body = el('div', 'sdv-body');
    var animals = fl.occupants(o.buildingId);
    var cap = (FL.BUILDINGS[o.farmBuilding] || {}).slots || 0;
    body.appendChild(el('div', 'sdv-sub',
      o.farmBuilding + (cap ? ' — ' + animals.length + '/' + cap + ' con' : '')));
    animals.forEach(function (a) {
      var row = el('div', 'sdv-row');
      row.appendChild(icon(a.kind, 'resource', 26));
      var col = el('div', 'sdv-col');
      col.appendChild(el('span', 'sdv-name', a.name + ' (' + a.kind + ')'));
      col.appendChild(el('small', 'sdv-cost',
        'Thân thiết ' + Math.floor(a.friendship / 100) + '/10 · '
        + (a.age < FL.ANIMAL_KINDS[a.kind].matures ? 'còn nhỏ'
           : a.ready ? 'có sản phẩm' : 'chưa tới lứa')));
      row.appendChild(col);
      var pet = el('button', 'sdv-chip' + (a.petted ? ' ok' : ''), '🤚');
      pet.addEventListener('click', function () {
        if (fl.pet(a)) self.game.toast('Đã vuốt ve ' + a.name);
        self.openFarmBuilding(o);
      });
      row.appendChild(pet);
      if (a.ready) {
        var col2 = el('button', 'sdv-chip ok', '🥚');
        col2.addEventListener('click', function () {
          var got = fl.collect(a);
          if (got) self.game.toast('Thu được ' + got);
          else self.game.toast('Túi đầy');
          self.openFarmBuilding(o);
        });
        row.appendChild(col2);
      }
      body.appendChild(row);
    });

    var menu = el('div', 'sdv-menu');
    var feed = el('button', 'sdv-mbtn', '🌾 Cho ăn (dùng cỏ khô)');
    feed.addEventListener('click', function () {
      var n = 0;
      animals.forEach(function (a) {
        if (!a.fed && self.sim.take('Hay', 1)) { a.fed = true; n++; }
      });
      self.game.toast(n ? 'Đã cho ' + n + ' con ăn' : 'Không có cỏ khô');
      self.openFarmBuilding(o);
    });
    menu.appendChild(feed);
    var harvest = el('button', 'sdv-mbtn', '⚡ Thu hoạch nhanh tất cả');
    harvest.addEventListener('click', function () {
      var n = 0;
      animals.forEach(function (a) { if (fl.collect(a)) n++; });
      self.game.toast(n ? 'Thu được ' + n + ' món' : 'Chưa có gì để thu');
      self.openFarmBuilding(o);
    });
    menu.appendChild(harvest);
    if ((FL.BUILDINGS[o.farmBuilding] || {}).upgradeTo) {
      var up = el('button', 'sdv-mbtn');
      var nx = FL.BUILDINGS[o.farmBuilding].upgradeTo;
      var nb = FL.BUILDINGS[nx];
      up.appendChild(el('span', null, '⬆ Nâng lên ' + nx));
      up.appendChild(el('small', 'sdv-cost', nb.gold + 'g + '
        + Object.keys(nb.mats).map(function (m) { return m + ' ' + nb.mats[m]; }).join(', ')));
      up.addEventListener('click', function () {
        var err = fl.upgrade(o);
        if (err) return self.game.toast(err);
        self.game.toast('Đã nâng cấp!');
        self.openFarmBuilding(o);
      });
      menu.appendChild(up);
    }
    var mv = el('button', 'sdv-mbtn', '↔ Dời sang chỗ khác');
    mv.addEventListener('click', function () {
      self.moveMode = o;
      self.close();
      self.game.toast('Chạm vào ô muốn dời tới');
    });
    var dmWarn = self.game.farm.occupants(o.buildingId).length;
    menu.appendChild(mv);
    var dm = el('button', 'sdv-mbtn', '🗑 Phá bỏ');
    dm.addEventListener('click', function () {
      var r = fl.demolish(o) || {};
      var msg = 'Đã phá ' + o.farmBuilding;
      if (r.moved) msg += ' — ' + r.moved + ' con vật dọn sang chuồng khác';
      if (r.lost) msg += ' — mất ' + r.lost + ' con vì hết chỗ';
      self.game.toast(msg);
      self.close();
    });
    menu.appendChild(dm);
    body.appendChild(menu);
    this.openPanel(o.farmBuilding, body);
  };

  // ------------------------------------------------------------------ carpenter
  UI.prototype.openCarpenter = function () {
    var self = this, fl = this.game.farm;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      'Chọn công trình rồi chạm vào ô trống trên nông trại để đặt.'));
    Object.keys(FL.BUILDINGS).forEach(function (name) {
      var b = FL.BUILDINGS[name];
      var ok = fl.canAfford(name);
      var row = el('button', 'sdv-mbtn' + (ok ? '' : ' sdv-off'));
      row.appendChild(el('span', null, name + '  (' + b.w + '×' + b.h + ')'));
      row.appendChild(el('small', 'sdv-cost', b.gold + 'g · '
        + Object.keys(b.mats).map(function (m) {
            return m + ' ' + self.sim.count(m) + '/' + b.mats[m];
          }).join(' · ')));
      row.addEventListener('click', function () {
        if (!ok) return self.game.toast('Chưa đủ tiền hoặc nguyên liệu');
        self.buildMode = name;
        self.close();
        self.game.toast('Chạm vào ô trống trên nông trại để đặt ' + name);
      });
      body.appendChild(row);
    });
    this.openPanel('Xây công trình', body);
  };

  // ------------------------------------------------------------------ cart
  UI.prototype.openCart = function (island) {
    var self = this, s = this.sim, ev = this.game.events;
    var body = el('div', 'sdv-body');
    var stock = island ? (ev.islandStock || []) : ev.cartStock;
    if (!island && !stock.length) {
      body.appendChild(el('div', 'sdv-sub',
        'Xe hàng chỉ ghé vào thứ Sáu và Chủ Nhật.'));
    } else {
      body.appendChild(el('div', 'sdv-sub',
        'Giá cắt cổ, nhưng có thứ không nơi nào khác bán.'));
      stock.forEach(function (it, i) {
        var info = s.itemInfo(it.item);
        var row = el('div', 'sdv-row sdv-buy' + (it.sold ? ' sdv-off' : ''));
        row.appendChild(icon(it.item, info ? info.cat : 'seed', 26));
        var col = el('div', 'sdv-col');
        col.appendChild(el('span', 'sdv-name', it.item + (it.rare ? ' ⭐' : '')));
        col.appendChild(el('small', 'sdv-cost', 'còn ' + it.qty));
        row.appendChild(col);
        row.appendChild(el('span', 'sdv-price', it.price + 'g'));
        row.addEventListener('click', function () {
          if (it.sold || it.qty <= 0) return self.game.toast('Hết hàng rồi');
          if (s.gold < it.price) return self.game.toast('Không đủ tiền');
          if (!s.hasSpace()) return self.game.toast('Túi đầy');
          s.gold -= it.price;
          s.give(it.item, 1);
          it.qty--;
          if (it.qty <= 0) it.sold = true;
          self.game.toast('Mua ' + it.item);
          self.openCart(island);
        });
        body.appendChild(row);
      });
    }
    this.openPanel(island ? 'Lái buôn trên đảo' : 'Xe hàng du mục', body);
  };

  // ------------------------------------------------------------------ kitchen
  UI.prototype.openKitchen = function () {
    var self = this, s = this.sim;
    var body = el('div', 'sdv-body');
    var search = el('input', 'sdv-search');
    search.placeholder = 'Tìm món…';
    body.appendChild(search);
    var list = el('div', 'sdv-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      var q = search.value.toLowerCase();
      self.game.data.recipes.cooking
        .filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0; })
        .slice(0, 70)
        .forEach(function (r) {
          var ok = r['in'].length && r['in'].every(function (i) {
            return s.count(i.item) >= i.qty;
          });
          var row = el('div', 'sdv-row sdv-buy' + (ok ? '' : ' sdv-off'));
          row.appendChild(icon(r.name, 'cooked', 26));
          var col = el('div', 'sdv-col');
          col.appendChild(el('span', 'sdv-name', r.name));
          col.appendChild(el('small', 'sdv-cost', r['in'].map(function (i) {
            return i.item + ' ' + s.count(i.item) + '/' + i.qty;
          }).join(' · ') + (r.energy ? ' · +' + r.energy + ' sức' : '')));
          row.appendChild(col);
          row.addEventListener('click', function () {
            if (!ok) return self.game.toast('Thiếu nguyên liệu');
            if (!s.hasSpace()) return self.game.toast('Túi đầy');
            r['in'].forEach(function (i) { s.take(i.item, i.qty); });
            s.give(r.name, 1);
            self.game.toast('Nấu xong ' + r.name);
            render();
          });
          list.appendChild(row);
        });
    }
    search.addEventListener('input', render);
    render();
    this.openPanel('Bếp', body);
  };

  // ------------------------------------------------------------------ quests
  UI.prototype.openQuestBoard = function () {
    var self = this, ev = this.game.events;
    var body = el('div', 'sdv-body');
    if (!ev.quests.length) {
      body.appendChild(el('div', 'sdv-sub', 'Hôm nay bảng tin trống.'));
    }
    ev.quests.forEach(function (q) {
      var box = el('div', 'sdv-bundle');
      box.appendChild(el('h4', null, q.who));
      box.appendChild(el('div', 'sdv-speech', q.text));
      var have = q.kind === 'gather' ? self.sim.count(q.target) : q.have;
      box.appendChild(el('div', 'sdv-sub',
        'Tiến độ: ' + have + '/' + q.need + ' · thưởng ' + q.gold + 'g + thân thiết'));
      var b = el('button', 'sdv-mbtn', 'Nộp');
      b.addEventListener('click', function () {
        var err = ev.turnIn(q);
        if (err) return self.game.toast(err);
        self.game.toast('Hoàn thành! +' + q.gold + 'g');
        self.openQuestBoard();
      });
      box.appendChild(b);
      body.appendChild(box);
    });
    this.openPanel('Bảng tin nhiệm vụ', body);
  };

  /* Two items the quick-use row already listed but nothing implemented. */
  UI.prototype.useStaircase = function (idx) {
    var g = this.game, s = this.sim;
    var a = g.world.area();
    if (!a.depth) return g.toast('Chỉ dùng được trong hang');
    var it = s.inventory[idx];
    if (!it || !s.take(it.name, 1)) return g.toast('Không có thang');
    g.mine.enter((a.depth || 0) + 1, a.mineKind || 'mine');
    g.toast('Đặt thang, xuống thẳng tầng dưới');
  };

  UI.prototype.useBomb = function (idx, name) {
    var g = this.game, s = this.sim;
    var a = g.world.area();
    if (!a.depth) return g.toast('Chỉ dùng được trong hang');
    var it = s.inventory[idx];
    if (!it || !s.take(it.name, 1)) return g.toast('Không có bom');
    var r = /mega/i.test(name) ? 4 : /cherry/i.test(name) ? 2 : 3;
    var px = Math.floor(g.player.x), py = Math.floor(g.player.y);
    var broke = 0;
    a.objs.slice().forEach(function (o) {
      if (o.kind !== 'rock' && o.kind !== 'oreRock') return;
      if (Math.hypot(o.x - px, o.y - py) > r) return;
      if (o.ore && s.give(o.ore, 1 + Math.floor(Math.random() * 3))) {}
      g.world.removeObj(o, a);
      broke++;
    });
    g.mine.monsters.forEach(function (m) {
      if (Math.hypot(m.x - px, m.y - py) > r) return;
      m.hp -= 30;
      if (m.hp <= 0) g.mine.kill(m);
    });
    for (var i = 0; i < 14; i++) g.spark(px + (Math.random() * r * 2 - r),
                                         py + (Math.random() * r * 2 - r));
    if (broke) g.mine.maybeDropLadder(px, py, false);
    g.toast('Bom nổ — vỡ ' + broke + ' tảng đá');
  };

  /* Two doors the valley needs: the bus out to the desert (repaired by the
   * Vault bundles) and the grate down to the sewer (Krobus keeps the key until
   * the museum has seen enough of the valley). */
  UI.prototype.openBus = function () {
    var self = this, s = this.sim, g = this.game;
    var body = el('div', 'sdv-body');
    if (!s.flags.busFixed) {
      body.appendChild(el('div', 'sdv-speech',
        'Xe buýt hỏng. Hoàn thành phòng Vault ở nhà văn hoá thì Pam sẽ chạy lại tuyến sa mạc.'));
    } else {
      var b = el('button', 'sdv-mbtn', '🚌 Đi sa mạc Calico (500g)');
      b.addEventListener('click', function () {
        if (s.gold < 500) return g.toast('Vé 500g, chưa đủ tiền');
        s.gold -= 500;
        self.close();
        var d = g.world.areas.desert;
        var spot = d.nearestFree(Math.floor(d.w / 2), d.h - 6, 20);
        g.world.current = 'desert';
        g.player.x = spot.x + 0.5; g.player.y = spot.y + 0.5;
        g.cameFrom = null;
        g.toast('→ Sa mạc Calico');
      });
      body.appendChild(b);
    }
    this.openPanel('Bến xe buýt', body);
  };

  UI.prototype.openSewer = function () {
    var self = this, s = this.sim, g = this.game;
    var body = el('div', 'sdv-body');
    var need = 20;
    if ((s.museum || []).length < need) {
      body.appendChild(el('div', 'sdv-speech',
        'Nắp cống khoá. Quyên góp đủ ' + need + ' món cho bảo tàng thì Gunther '
        + 'sẽ đưa bạn chiếc chìa gỉ (đang có ' + (s.museum || []).length + ').'));
    } else {
      var b = el('button', 'sdv-mbtn', '🕳 Xuống cống');
      b.addEventListener('click', function () {
        self.close();
        var d = g.world.areas.sewer;
        var spot = d.nearestFree(Math.floor(d.w / 2), Math.floor(d.h / 2), 20);
        g.world.current = 'sewer';
        g.player.x = spot.x + 0.5; g.player.y = spot.y + 0.5;
        g.cameFrom = null;
        g.toast('→ Cống ngầm');
      });
      body.appendChild(b);
    }
    this.openPanel('Nắp cống', body);
  };

  // ------------------------------------------------------------------ misc
  UI.prototype.openBoat = function () {
    var self = this, s = this.sim, g = this.game;
    var body = el('div', 'sdv-body');
    if (!s.hasBoat) {
      body.appendChild(el('div', 'sdv-sub',
        'Willy có một con thuyền cũ sau cửa hàng. Sửa xong thì ra được đảo Gừng.'));
      var need = { Hardwood: 200, 'Iridium Bar': 5, 'Battery Pack': 5 };
      var b = el('button', 'sdv-mbtn');
      b.appendChild(el('span', null, '⛵ Sửa thuyền'));
      b.appendChild(el('small', 'sdv-cost', Object.keys(need).map(function (k) {
        return k + ' ' + s.count(k) + '/' + need[k];
      }).join(' · ')));
      b.addEventListener('click', function () {
        for (var k in need) {
          if (s.count(k) < need[k]) return self.game.toast('Thiếu ' + k);
        }
        for (var k2 in need) s.take(k2, need[k2]);
        s.hasBoat = true;
        self.game.toast('Thuyền đã sửa xong!');
        self.openBoat();
      });
      body.appendChild(b);
    } else {
      var go = el('button', 'sdv-mbtn', '🏝 Ra đảo Gừng');
      go.addEventListener('click', function () {
        self.close();
        g.world.current = 'island';
        g.player.x = 20.5; g.player.y = 29.5;
        g.toast('→ Đảo Gừng');
      });
      body.appendChild(go);
    }
    this.openPanel('Thuyền của Willy', body);
  };

  UI.prototype.openCaveChoice = function () {
    var self = this, s = this.sim;
    var body = el('div', 'sdv-body');
    if (s.flags.caveChoice) {
      body.appendChild(el('div', 'sdv-sub', 'Bạn đã chọn: '
        + (s.flags.caveChoice === 'fruit' ? 'dơi trái cây' : 'nấm')));
    } else {
      body.appendChild(el('div', 'sdv-sub',
        'Hang này nuôi được một thứ. Chọn một lần, không đổi lại được.'));
      [['fruit', '🦇 Dơi trái cây — thỉnh thoảng có quả rừng'],
       ['mushroom', '🍄 Nấm — thu đều đặn hơn']].forEach(function (c) {
        var b = el('button', 'sdv-mbtn', c[1]);
        b.addEventListener('click', function () {
          s.flags.caveChoice = c[0];
          self.game.toast('Đã chọn.');
          self.openCaveChoice();
        });
        body.appendChild(b);
      });
    }
    this.openPanel('Hang nông trại', body);
  };

  UI.prototype.openFruitTree = function (o) {
    var self = this;
    var body = el('div', 'sdv-body');
    var days = FL.FRUIT_TREE_DAYS - (o.age || 0);
    body.appendChild(el('div', 'sdv-sub', o.fruit + ' — '
      + (days > 0 ? 'còn ' + days + ' ngày nữa mới ra quả' : 'đang có ' + (o.fruits || 0) + ' quả')));
    if (o.fruits > 0) {
      var b = el('button', 'sdv-mbtn', '🍑 Hái ' + o.fruits + ' quả');
      b.addEventListener('click', function () {
        var n = 0;
        while (o.fruits > 0 && self.sim.give(o.fruit, 1, 0)) { o.fruits--; n++; }
        self.sim.addXp('foraging', n * 4);
        self.game.toast('Hái được ' + n + ' ' + o.fruit);
        self.close();
      });
      body.appendChild(b);
    }
    this.openPanel('Cây ăn quả', body);
  };

  // ------------------------------------------------------------------ hooks
  /* Placing a building and moving one both need the NEXT tap on the map, so
   * the tile handler has to know a mode is armed before it does anything else. */
  var baseTap = UI.prototype.tapTile;
  UI.prototype.tapTile = function (x, y) {
    var g = this.game;
    if (this.buildMode && g.world.current === 'farm') {
      var err = g.farm.build(this.buildMode, x, y);
      if (err) { g.toast(err); return; }
      g.toast('Đã xây ' + this.buildMode);
      this.buildMode = null;
      return;
    }
    if (this.moveMode && g.world.current === 'farm') {
      var err2 = g.farm.move(this.moveMode, x, y);
      if (err2) { g.toast(err2); return; }      // keep the mode armed, try again
      g.toast('Đã dời ' + this.moveMode.farmBuilding);
      this.moveMode = null;
      return;
    }
    return baseTap.call(this, x, y);
  };

  /* The day report gains the calendar layer: festivals, mail, the cart. */
  var baseReport = UI.prototype.showDayReport;
  UI.prototype.showDayReport = function (report, collapsed) {
    baseReport.call(this, report, collapsed);
    var t = report.today;
    if (!t || !this.panel) return;
    var body = this.panel.querySelector('.sdv-body');
    if (!body) return;
    var notes = el('div', 'sdv-menu');
    if (t.festival) {
      notes.appendChild(el('div', 'sdv-speech',
        '🎪 Hôm nay có ' + t.festival.name + ': ' + t.festival.blurb));
    }
    if (t.mail) notes.appendChild(el('div', 'sdv-sub', '✉️ Có ' + t.mail + ' lá thư trong hộp thư.'));
    if (t.cart) notes.appendChild(el('div', 'sdv-sub', '🛒 Xe hàng du mục đang ở trong rừng.'));
    if (t.train) notes.appendChild(el('div', 'sdv-sub', '🚂 Nghe nói hôm nay có tàu chạy qua.'));
    body.insertBefore(notes, body.firstChild.nextSibling);
  };

})(window);
