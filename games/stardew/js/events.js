/*
 * events.js - the calendar layer: festivals, the mailbox, the help-wanted
 * board, museum donations, the traveling cart, the train, and tool upgrades.
 *
 * These are the systems that make a year feel different from a week. Festival
 * dates are the real ones; the cart really does only come on Friday and Sunday;
 * the museum really does take 95 items.
 */
(function (global) {
  'use strict';

  var FESTIVALS = [
    { season: 'Spring', day: 13, name: 'Lễ hội Trứng', where: 'town',
      blurb: 'Săn trứng ở quảng trường. Thắng được mũ dâu.',
      reward: { item: 'Strawberry Seeds', qty: 5 } },
    { season: 'Spring', day: 24, name: 'Vũ hội Hoa', where: 'forest',
      blurb: 'Mời một người bạn quý ra nhảy.', reward: { gold: 300 } },
    { season: 'Summer', day: 11, name: 'Luau', where: 'beach',
      blurb: 'Bỏ một món vào nồi súp chung. Món càng ngon thị trưởng càng khen.',
      reward: { gold: 400 } },
    { season: 'Summer', day: 28, name: 'Đêm Sứa Trăng', where: 'beach',
      blurb: 'Thả đèn xuống biển, chờ đàn sứa trôi vào bờ.', reward: { gold: 250 } },
    { season: 'Fall', day: 16, name: 'Hội chợ Thung Lũng', where: 'town',
      blurb: 'Trưng bày 9 món nông sản để chấm điểm.', reward: { gold: 1000 } },
    { season: 'Fall', day: 27, name: 'Đêm Ma', where: 'town',
      blurb: 'Mê cung bắp. Đi hết thì có thưởng.', reward: { item: 'Pumpkin', qty: 3 } },
    { season: 'Winter', day: 8, name: 'Lễ hội Băng', where: 'mountain',
      blurb: 'Thi câu cá trên hồ băng.', reward: { gold: 500 } },
    { season: 'Winter', day: 25, name: 'Tiệc Sao Đông', where: 'town',
      blurb: 'Tặng quà bí mật cho một người trong làng.', reward: { gold: 600 } }
  ];

  /* Letters arrive when a condition is met; each is delivered exactly once. */
  var LETTERS = [
    { id: 'intro', when: function (s) { return s.dayIndex() >= 1; },
      from: 'Thị trưởng Lewis',
      body: 'Chào mừng cháu đến thung lũng! Ta để sẵn ít hạt giống ở hộp thư. ' +
            'Cứ trồng thử, bán ở thùng giao hàng trước nhà.',
      gift: { item: 'Parsnip Seeds', qty: 5 } },
    { id: 'robin', when: function (s) { return s.dayIndex() >= 2; },
      from: 'Robin',
      body: 'Tôi làm nghề mộc trên núi. Cần chuồng trại hay nhà kho thì ghé nhé.' },
    { id: 'willy', when: function (s) { return s.dayIndex() >= 2; },
      from: 'Willy',
      body: 'Ghé cửa hàng cá ngoài bãi biển, tôi tặng cậu cái cần câu cũ.',
      gift: { item: 'Bamboo Pole', qty: 1 } },
    { id: 'clint', when: function (s) { return s.skills.mining >= 1; },
      from: 'Clint',
      body: 'Đào được quặng rồi à? Mang tới lò rèn, tôi nung thành thanh cho.' },
    { id: 'marnie', when: function (s) { return s.gold >= 3000; },
      from: 'Marnie',
      body: 'Có tiền rồi thì tính chuyện nuôi gà đi. Ghé trại tôi xem thử.' },
    { id: 'cc', when: function (s) { return s.dayIndex() >= 4; },
      from: 'Thị trưởng Lewis',
      body: 'Nhà văn hoá cũ bỏ hoang lâu rồi. Cháu vào xem, có mấy tấm bảng lạ lắm.' },
    { id: 'qi', when: function (s) { return s.deepestMine >= 100; },
      from: 'Mr. Qi',
      body: 'Ngươi xuống được sâu đấy. Hang Sọ ngoài sa mạc còn sâu hơn nhiều.' },
    { id: 'island', when: function (s) { return s.totalEarnings >= 20000; },
      from: 'Willy',
      body: 'Tôi sửa xong con thuyền sau cửa hàng. Muốn ra đảo thì bảo tôi.' }
  ];

  /* Help-wanted board: the item requests the town posts each day. */
  var QUEST_KINDS = ['gather', 'slay', 'deliver'];

  function Events(game) {
    this.game = game;
    this.mail = [];             // delivered letters {id, from, body, read}
    this.pending = [];          // waiting in the mailbox
    this.quests = [];
    this.cartStock = [];
    this.trainToday = false;
    this.festivalToday = null;
  }

  Events.prototype.serialize = function () {
    return { mail: this.mail, pending: this.pending, quests: this.quests,
             cartStock: this.cartStock, islandStock: this.islandStock };
  };
  Events.prototype.deserialize = function (s) {
    if (!s) return;
    this.mail = s.mail || [];
    this.pending = s.pending || [];
    this.quests = s.quests || [];
    this.cartStock = s.cartStock || [];
    this.islandStock = s.islandStock || [];
  };

  // ------------------------------------------------------------------ daily
  Events.prototype.onNewDay = function () {
    var s = this.game.sim, self = this;
    this.festivalToday = FESTIVALS.filter(function (f) {
      return f.season === s.season() && f.day === s.day;
    })[0] || null;

    var seen = {};
    this.mail.concat(this.pending).forEach(function (m) { seen[m.id] = true; });
    LETTERS.forEach(function (l) {
      if (seen[l.id]) return;
      var ok = false;
      try { ok = l.when(s); } catch (e) { ok = false; }
      if (ok) self.pending.push({ id: l.id, from: l.from, body: l.body, gift: l.gift });
    });

    this.rollQuests();
    this.rollIslandStock();
    var dow = s.dayOfWeek();
    if (dow === 'T6' || dow === 'CN') this.rollCart();
    else this.cartStock = [];
    this.trainToday = s.rand() < 0.2;
    return {
      festival: this.festivalToday, mail: this.pending.length,
      cart: this.cartStock.length > 0, train: this.trainToday
    };
  };

  Events.prototype.readMail = function (index) {
    var m = this.pending[index];
    if (!m) return null;
    /* WHY the letter stays in the box when the gift will not fit: it used to be
     * filed away as read regardless, and "Túi đầy - quà chưa lấy được" was a lie
     * - a letter is delivered exactly once, so the parsnip seeds that start the
     * whole game, or Willy's fishing rod, were gone for good with no second
     * chance to collect them. An unopenable letter waits; it is not lost. */
    if (m.gift && !this.game.sim.hasSpace()
        && !this.game.sim.count(m.gift.item)) {
      this.game.toast('Túi đầy — dọn chỗ rồi mở thư');
      return null;
    }
    this.pending.splice(index, 1);
    m.read = true;
    this.mail.push(m);
    if (m.gift) {
      if (this.game.sim.give(m.gift.item, m.gift.qty)) {
        this.game.toast('Nhận ' + m.gift.item + ' ×' + m.gift.qty);
      } else this.game.toast('Túi đầy — quà chưa lấy được');
    }
    return m;
  };

  // ------------------------------------------------------------------ quests
  /* The monsters a player can actually meet by walking into the mine. The
   * table also carries farm critters and island-only monsters, and a slay
   * quest naming one of those can never be turned in. */
  Events.prototype.mineMonsters = function () {
    if (this._mineMonsters) return this._mineMonsters;
    var all = this.game.data.monsters || [];
    var list = all.filter(function (m) { return /mines/i.test(m.spawnsIn || ''); });
    this._mineMonsters = list.length ? list : all;
    return this._mineMonsters;
  };

  Events.prototype.rollQuests = function () {
    var s = this.game.sim, data = this.game.data;
    /* WHY `accepted` finally has something setting it: the filter was already
     * here, but no code path ever raised the flag, so every posting on the board
     * was swept away at six the next morning. A slay request for seven monsters
     * had to be found, fought and handed in inside a single day or it silently
     * vanished. Taking a quest now keeps it for two more days. */
    var today = s.dayIndex();
    this.quests = this.quests.filter(function (q) {
      return q.accepted && !q.done && (q.expires == null || q.expires >= today);
    });
    var n = 1 + Math.floor(s.rand() * 2);
    var villagers = data.villagers.filter(function (v) { return v.birthday; });
    for (var i = 0; i < n; i++) {
      var who = villagers[Math.floor(s.rand() * villagers.length)];
      var kind = QUEST_KINDS[Math.floor(s.rand() * QUEST_KINDS.length)];
      if (kind === 'slay') {
        /* WHY the pool is filtered: the board drew from every monster in the
         * table, including the four that never appear in the mines at all - a
         * Crow, a Cat, a Frog, the volcano's Fireball - and about one slay quest
         * in eleven asked for three kills that the player had no way on earth to
         * make. An unfinishable request sits on the board and pays nothing. */
        var slayable = this.mineMonsters();
        var mon = slayable[Math.floor(s.rand() * slayable.length)];
        if (!mon) continue;
        this.quests.push({
          id: 'q' + s.dayIndex() + '_' + i, kind: 'slay', who: who.name,
          target: mon.name, need: 3 + Math.floor(s.rand() * 5), have: 0,
          gold: 300 + Math.floor(s.rand() * 500),
          text: who.name + ' nhờ diệt quái trong hầm mỏ.'
        });
      } else {
        /* 'resource' also holds rings and equipment, which produced quests
         * like "Jodi needs 1 Soul Sapper Ring". Ask only for things that can
         * actually be grown, caught, foraged or mined. */
        var GATHERABLE = { crop: 1, fish: 1, forage: 1, mineral: 1, fruit: 1 };
        var pool = Object.keys(data.items).filter(function (k) {
          var it = data.items[k];
          if (!GATHERABLE[it.cat]) return false;
          if (/ring|boots|sword|blade|hat |trophy/i.test(it.name)) return false;
          return true;
        });
        var key = pool[Math.floor(s.rand() * pool.length)];
        var item = data.items[key];
        if (!item) continue;
        var need = 1 + Math.floor(s.rand() * 4);
        this.quests.push({
          id: 'q' + s.dayIndex() + '_' + i, kind: 'gather', who: who.name,
          target: item.name, need: need, have: 0,
          gold: Math.max(150, item.sell * need * 3),
          text: who.name + ' cần ' + need + ' ' + item.name + '.'
        });
      }
    }
  };

  /* Taking a request off the board. Two more days to finish it, which is what
   * makes a "kill seven of these" request possible at all. */
  Events.prototype.accept = function (q) {
    if (q.accepted) return;
    q.accepted = true;
    q.expires = this.game.sim.dayIndex() + 2;
  };

  Events.prototype.turnIn = function (q) {
    var s = this.game.sim;
    if (q.kind === 'gather') {
      if (s.count(q.target) < q.need) return 'Chưa đủ ' + q.target;
      s.take(q.target, q.need);
    } else if (q.kind === 'slay') {
      if (q.have < q.need) return 'Chưa diệt đủ';
    }
    s.gold += q.gold;
    /* WHY this goes through addFriendship instead of writing the points itself:
     * a marriage candidate's heart meter is meant to stop at 8 until they have
     * been given a bouquet, and that ceiling lives in Sim.friendCap. Writing
     * `f.points` straight to a flat 2500 walked past it, so handing in a few
     * board quests carried Abigail to 10 hearts with no bouquet ever bought and
     * the courtship step skipped entirely. */
    s.addFriendship(q.who, 150);
    q.done = true;
    this.quests = this.quests.filter(function (x) { return x !== q; });
    return null;
  };

  Events.prototype.onMonsterKilled = function (name) {
    this.quests.forEach(function (q) {
      if (q.kind === 'slay' && q.target === name) q.have++;
    });
  };

  // ------------------------------------------------------------------ cart
  /* The cart's whole appeal is that it sells things you cannot buy anywhere
   * else, at prices that are usually a rip-off. Both halves matter. */
  /* The island trader used to read the mainland cart's stock, so it was empty
   * five days a week and sold identical goods on the other two. */
  Events.prototype.rollIslandStock = function () {
    var s = this.game.sim, data = this.game.data;
    var keys = Object.keys(data.items);
    this.islandStock = [];
    for (var i = 0; i < 8; i++) {
      var it = data.items[keys[Math.floor(s.rand() * keys.length)]];
      if (!it || !it.sell) continue;
      this.islandStock.push({
        item: it.name,
        price: Math.max(200, Math.round(it.sell * (2 + s.rand() * 2) / 10) * 10),
        qty: 1 + Math.floor(s.rand() * 3)
      });
    }
    /* WHY the flat 600g is gone: a Banana Sapling and a Mango Sapling both sell
     * for 850g, so the trader was buying them back for more than she charged.
     * Five of each, every single day, was 2,500g of pure profit for walking to
     * the beach and tapping twice - the shipping bin turned into a money
     * printer. Every price on this stall now sits above what the item fetches,
     * which is the whole point of a rip-off merchant. */
    ['Banana Sapling', 'Mango Sapling', 'Pineapple Seeds', 'Taro Tuber',
     'Cinder Shard'].forEach(function (n) {
      var it = data.items[n.toLowerCase()];
      if (it) {
        this.islandStock.push({
          item: n, qty: 5, rare: true,
          price: Math.max(600, Math.round((it.sell || 0) * 2.5 / 10) * 10)
        });
      }
    }, this);
    return this.islandStock;
  };

  Events.prototype.rollCart = function () {
    var s = this.game.sim, data = this.game.data;
    var keys = Object.keys(data.items);
    this.cartStock = [];
    for (var i = 0; i < 10; i++) {
      var it = data.items[keys[Math.floor(s.rand() * keys.length)]];
      if (!it || !it.sell) continue;
      var mult = 2 + s.rand() * 3;
      this.cartStock.push({
        item: it.name,
        price: Math.max(100, Math.round(it.sell * mult / 10) * 10),
        qty: 1 + Math.floor(s.rand() * 3)
      });
    }
    // one seed the player cannot buy from Pierre - the real reason to come
    var rare = ['Rare Seed', 'Ancient Seeds', 'Red Cabbage Seeds', 'Starfruit Seeds'];
    this.cartStock.push({
      item: rare[Math.floor(s.rand() * rare.length)],
      price: 600 + Math.floor(s.rand() * 400), qty: 1, rare: true
    });
  };

  // ------------------------------------------------------------------ museum
  Events.prototype.canDonate = function (name) {
    var info = this.game.sim.itemInfo(name);
    if (!info) return false;
    if (info.cat !== 'mineral' && info.cat !== 'artifact') return false;
    return this.game.sim.museum.indexOf(name) < 0;
  };

  /* WHY counted rather than hardcoded: the panel asked for 95 and the item
   * table holds 94, so the collection could never be completed and the top
   * reward was unreachable. */
  Events.prototype.museumTotal = function () {
    if (this._museumTotal) return this._museumTotal;
    var items = this.game.data.items || {};
    var n = 0;
    for (var k in items) {
      if (items[k].cat === 'mineral' || items[k].cat === 'artifact') n++;
    }
    this._museumTotal = n;
    return n;
  };

  Events.prototype.donate = function (name) {
    var s = this.game.sim;
    if (!this.canDonate(name)) return 'Bảo tàng không nhận món này';
    if (!s.take(name, 1)) return 'Không có trong túi';
    s.museum.push(name);
    var n = s.museum.length;
    var rewards = { 5: 300, 15: 800, 25: 1500, 35: 2500, 40: 3500,
                    50: 5000, 60: 7000, 70: 9000, 80: 12000, 90: 16000 };
    rewards[this.museumTotal()] = 25000;      // the final one, wherever it lands
    if (rewards[n]) {
      s.gold += rewards[n];
      this.game.toast('Gunther thưởng ' + rewards[n] + 'g cho mốc ' + n + ' món!');
    }
    return null;
  };

  // ------------------------------------------------------------------ tools
  var TOOL_TIERS = [
    { name: 'Đồng', gold: 2000, bar: 'Copper Bar', qty: 5, power: 2 },
    { name: 'Thép', gold: 5000, bar: 'Iron Bar', qty: 5, power: 3 },
    { name: 'Vàng', gold: 10000, bar: 'Gold Bar', qty: 5, power: 4 },
    { name: 'Iridium', gold: 25000, bar: 'Iridium Bar', qty: 5, power: 5 }
  ];

  Events.prototype.upgradeTool = function () {
    var s = this.game.sim;
    var tier = s.toolTier || 0;
    if (tier >= TOOL_TIERS.length) return 'Công cụ đã ở mức cao nhất';
    var t = TOOL_TIERS[tier];
    if (s.gold < t.gold) return 'Cần ' + t.gold + 'g';
    if (s.count(t.bar) < t.qty) return 'Cần ' + t.qty + ' ' + t.bar;
    s.gold -= t.gold;
    s.take(t.bar, t.qty);
    s.toolTier = tier + 1;
    s.toolPower = t.power;
    return null;
  };

  global.SDV_EVENTS = {
    Events: Events, FESTIVALS: FESTIVALS, LETTERS: LETTERS, TOOL_TIERS: TOOL_TIERS
  };
})(window);
