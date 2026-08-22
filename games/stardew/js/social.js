/*
 * social.js - the parts of the town that are about people and gear rather than
 * dirt: courtship and marriage, buying weapons at the guild, and crab pots.
 *
 * Marriage follows the wiki's gating exactly: the heart meter of a candidate
 * stops at 8 until you hand them a bouquet, and a proposal needs a pendant.
 */
(function (global) {
  'use strict';

  var UI = global.SDV_UI.UI, el = global.SDV_UI.el, icon = global.SDV_UI.icon;
  var SIM = global.SDV_SIM;

  var BOUQUET_COST = 200;
  var PENDANT_COST = 5000;

  var WEAPONS = [
    { name: 'Rusty Sword',      dmg: 5,  gold: 0 },
    { name: 'Wooden Blade',     dmg: 8,  gold: 250 },
    { name: 'Steel Smallsword', dmg: 14, gold: 1000 },
    { name: 'Silver Saber',     dmg: 22, gold: 3000 },
    { name: 'Claymore',         dmg: 32, gold: 8000 },
    { name: 'Obsidian Edge',    dmg: 45, gold: 18000 },
    { name: 'Lava Katana',      dmg: 65, gold: 35000 },
    { name: 'Galaxy Sword',     dmg: 90, gold: 90000 }
  ];
  var BOOTS = [
    { name: 'Sneakers',      armor: 1, gold: 200 },
    { name: 'Rubber Boots',  armor: 2, gold: 700 },
    { name: 'Combat Boots',  armor: 4, gold: 2500 },
    { name: 'Space Boots',   armor: 7, gold: 12000 }
  ];

  /* The cap now lives in Sim.friendCap / Sim.addFriendship, which every write
   * goes through - a gift-only wrapper let talking and quests walk past it. */

  UI.prototype.openRomance = function (npc) {
    var self = this, s = this.sim, g = this.game;
    var v = npc.data;
    var body = el('div', 'sdv-body');
    s.dating = s.dating || {};
    var hearts = s.hearts(npc.name);
    if (!v.marriable) {
      body.appendChild(el('div', 'sdv-sub', npc.name + ' không phải người có thể cưới.'));
      return this.openPanel('Tình cảm', body);
    }
    body.appendChild(el('div', 'sdv-sub',
      'Thân thiết: ' + hearts + '/10 tim' +
      (s.dating[npc.name] ? ' · đang hẹn hò' : '') +
      (s.spouse === npc.name ? ' · đã cưới' : '')));

    if (s.spouse === npc.name) {
      body.appendChild(el('div', 'sdv-speech',
        'Hai người đã là vợ chồng. ' + npc.name + ' ở nhà với bạn mỗi ngày.'));
    } else if (!s.dating[npc.name]) {
      body.appendChild(el('div', 'sdv-sub',
        'Thanh tim của người có thể cưới dừng ở 8 cho tới khi bạn tặng một bó hoa.'));
      var bq = el('button', 'sdv-mbtn' + (hearts >= 8 ? '' : ' sdv-off'));
      bq.appendChild(el('span', null, '💐 Tặng bó hoa'));
      bq.appendChild(el('small', 'sdv-cost',
        hearts >= 8 ? 'Có sẵn trong túi hoặc mua ' + BOUQUET_COST + 'g ở tiệm Pierre'
                    : 'Cần đủ 8 tim trước'));
      bq.addEventListener('click', function () {
        if (hearts < 8) return g.toast('Chưa đủ 8 tim');
        if (!s.take('Bouquet', 1)) {
          if (s.gold < BOUQUET_COST) return g.toast('Không có bó hoa và không đủ tiền');
          s.gold -= BOUQUET_COST;
        }
        s.dating[npc.name] = true;
        g.toast(npc.name + ' nhận bó hoa. Hai người bắt đầu hẹn hò!');
        self.openRomance(npc);
      });
      body.appendChild(bq);
    } else {
      var can = hearts >= 10;
      var pd = el('button', 'sdv-mbtn' + (can ? '' : ' sdv-off'));
      pd.appendChild(el('span', null, '💍 Cầu hôn'));
      pd.appendChild(el('small', 'sdv-cost',
        can ? 'Cần Mermaid\'s Pendant (mua ' + PENDANT_COST + 'g)' : 'Cần đủ 10 tim'));
      pd.addEventListener('click', function () {
        /* WHY the order changed: payment used to happen BEFORE the
         * already-married check, and the failure branch left the button live -
         * so tapping it four times burned 20,000g and married nobody. */
        if (s.spouse) return g.toast('Bạn đã có gia đình rồi.');
        if (!can) return g.toast('Chưa đủ 10 tim');
        if (!s.take("Mermaid's Pendant", 1)) {
          if (s.gold < PENDANT_COST) return g.toast('Cần vòng cổ hoặc ' + PENDANT_COST + 'g');
          s.gold -= PENDANT_COST;
        }
        s.spouse = npc.name;
        // 10 hearts is the ceiling everywhere else; 14 drew a 14-heart meter
        // into a 10-slot row and printed "14/10".
        s.friend(npc.name).points = Math.max(s.friend(npc.name).points, 10 * 250);
        g.toast('🎉 ' + npc.name + ' đồng ý! Hai người đã cưới.');
        self.openRomance(npc);
      });
      body.appendChild(pd);
    }
    this.openPanel('Tình cảm — ' + npc.name, body);
  };

  /* The villager panel gains a romance button when it is relevant. */
  var baseNpc = UI.prototype.openNpc;
  UI.prototype.openNpc = function (npc) {
    baseNpc.call(this, npc);
    if (!npc.data || !npc.data.marriable || !this.panel) return;
    var body = this.panel.querySelector('.sdv-body');
    if (!body) return;
    var self = this;
    var b = el('button', 'sdv-mbtn', '💗 Tình cảm');
    b.addEventListener('click', function () { self.openRomance(npc); });
    body.insertBefore(b, body.children[2] || null);
  };

  // ------------------------------------------------------------------ weapons
  UI.prototype.openWeaponShop = function () {
    var self = this, s = this.sim, g = this.game;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      'Vũ khí đang dùng: ' + (s.weapon ? s.weapon.name + ' (' + s.weapon.dmg + ' sát thương)' : 'tay không')
      + ' · giáp ' + (s.armor || 0)));
    body.appendChild(el('div', 'sdv-sub', 'Vũ khí'));
    WEAPONS.forEach(function (w) {
      if (!w.gold) return;
      var owned = s.weapon && s.weapon.name === w.name;
      var row = el('div', 'sdv-row sdv-buy' + (owned ? ' sdv-off' : ''));
      row.appendChild(icon(w.name, 'tool', 26));
      var col = el('div', 'sdv-col');
      col.appendChild(el('span', 'sdv-name', w.name));
      col.appendChild(el('small', 'sdv-cost', w.dmg + ' sát thương'));
      row.appendChild(col);
      row.appendChild(el('span', 'sdv-price', owned ? 'đang dùng' : w.gold + 'g'));
      row.addEventListener('click', function () {
        if (owned) return;
        if (s.gold < w.gold) return g.toast('Không đủ tiền');
        s.gold -= w.gold;
        s.weapon = { name: w.name, dmg: w.dmg };
        g.toast('Trang bị ' + w.name);
        self.openWeaponShop();
      });
      body.appendChild(row);
    });
    body.appendChild(el('div', 'sdv-sub', 'Giày (giảm sát thương nhận vào)'));
    BOOTS.forEach(function (bt) {
      var row = el('div', 'sdv-row sdv-buy');
      row.appendChild(icon(bt.name, 'crafted', 26));
      var col = el('div', 'sdv-col');
      col.appendChild(el('span', 'sdv-name', bt.name));
      col.appendChild(el('small', 'sdv-cost', 'giáp ' + bt.armor));
      row.appendChild(col);
      row.appendChild(el('span', 'sdv-price', bt.gold + 'g'));
      row.addEventListener('click', function () {
        if (s.gold < bt.gold) return g.toast('Không đủ tiền');
        if ((s.armor || 0) >= bt.armor) return g.toast('Giày đang dùng đã tốt hơn');
        s.gold -= bt.gold;
        s.armor = bt.armor;
        g.toast('Mang ' + bt.name);
        self.openWeaponShop();
      });
      body.appendChild(row);
    });
    this.openPanel('Hội thợ săn', body);
  };

  // ------------------------------------------------------------------ crab pots
  /* A crab pot is placed IN water and checked the next morning. */
  UI.prototype.placeCrabPot = function (x, y) {
    var g = this.game, s = this.sim, a = g.world.area();
    var t = a.name_of(x, y);
    if (t !== 'water' && t !== 'deep') return 'Lồng cua phải đặt xuống nước';
    if (g.world.objAt(x, y, a)) return 'Chỗ này đã có lồng';
    if (!s.take('Crab Pot', 1)) return 'Không có lồng cua trong túi';
    a.objs.push({ x: x, y: y, kind: 'crabPot', baited: false, catch: null });
    return null;
  };

  UI.prototype.openCrabPot = function (o) {
    var self = this, s = this.sim, g = this.game;
    var body = el('div', 'sdv-body');
    if (o.catch) {
      var b = el('button', 'sdv-mbtn', '🦀 Lấy ' + o.catch);
      b.addEventListener('click', function () {
        if (!s.give(o.catch, 1)) return g.toast('Túi đầy');
        s.addXp('fishing', 5);
        g.toast('Được ' + o.catch);
        o.catch = null; o.baited = false;
        self.close();
      });
      body.appendChild(b);
    } else if (o.baited) {
      body.appendChild(el('div', 'sdv-sub', 'Đã bỏ mồi — sáng mai quay lại.'));
    } else {
      var bb = el('button', 'sdv-mbtn', '🪱 Bỏ mồi');
      bb.addEventListener('click', function () {
        if (!s.take('Bait', 1) && !s.professions.Luremaster) {
          return g.toast('Không có mồi');
        }
        o.baited = true;
        g.toast('Đã bỏ mồi');
        self.close();
      });
      body.appendChild(bb);
    }
    var rm = el('button', 'sdv-mbtn', '🗑 Nhặt lồng về');
    rm.addEventListener('click', function () {
      s.give('Crab Pot', 1);
      g.world.removeObj(o);
      self.close();
    });
    body.appendChild(rm);
    this.openPanel('Lồng cua', body);
  };

  var CRAB_POT_CATCH = null;
  function crabPotOvernight(game) {
    var s = game.sim;
    if (!CRAB_POT_CATCH) {
      CRAB_POT_CATCH = (game.data.fish || [])
        .filter(function (f) { return f.kind === 'crab_pot'; })
        .map(function (f) { return f.name; });
    }
    var n = 0;
    game.world.forEachArea(function (a) {
      a.objs.forEach(function (o) {
        if (o.kind !== 'crabPot' || !o.baited || o.catch) return;
        var pool = CRAB_POT_CATCH;
        if (!pool.length) return;
        if (!s.professions.Mariner && Math.random() < 0.2) {
          o.catch = 'Fiber';                 // junk, unless you took Mariner
        } else {
          o.catch = pool[Math.floor(Math.random() * pool.length)];
        }
        n++;
      });
    });
    return n;
  }

  var baseOpenObject2 = UI.prototype.openObject;
  UI.prototype.openObject = function (o, x, y) {
    if (o.kind === 'crabPot') return this.openCrabPot(o);
    if (o.kind === 'counter' && o.keeper === 'Marlon') return this.openWeaponShop();
    return baseOpenObject2.call(this, o, x, y);
  };

  /* Tapping open water with a crab pot in the bag places it there. */
  var baseTap2 = UI.prototype.tapTile;
  UI.prototype.tapTile = function (x, y) {
    var g = this.game, a = g.world.area();
    var t = a.name_of(x, y);
    if ((t === 'water' || t === 'deep') && this.sim.count('Crab Pot') > 0
        && !g.world.objAt(x, y, a)) {
      var err = this.placeCrabPot(x, y);
      if (err) g.toast(err);
      else g.toast('Đã đặt lồng cua');
      return;
    }
    return baseTap2.call(this, x, y);
  };

  global.SDV_SOCIAL = {
    WEAPONS: WEAPONS, BOOTS: BOOTS, crabPotOvernight: crabPotOvernight,
    BOUQUET_COST: BOUQUET_COST, PENDANT_COST: PENDANT_COST
  };
})(window);
