/* Trạng thái một ván: túi đồ, vàng, tuần, và mọi thứ xảy ra khi bạn dẫm lên
 * một ô có sự kiện.
 *
 * WHY: cả ván chơi chỉ là "nhặt gì trong 3 ngày", nên chỗ quyết định độ khó
 * không phải trận đánh mà là bảng vật phẩm rơi ra ở đây.
 * ROOT-CAUSE: một auto-battler mà người chơi không chọn được gì trong trận thì
 * toàn bộ quyền quyết định phải nằm ở khâu chuẩn bị.
 * SEE: docs/proposals/he-is-coming-clone.md
 */
(function (global) {
  'use strict';

  var D = global.HIC_DATA;

  /* ---------------------------------------------------------------- catalog */

  var byName = {};
  D.items.forEach(function (it) { byName[it.name] = it; });
  var edgeByName = {};
  D.edges.forEach(function (e) { edgeByName[e.name] = e; });

  function isBase(it) {
    return it.rarity !== 'golden' && it.rarity !== 'diamond' && it.rarity !== 'cauldron';
  }
  function hasTag(it, t) { return (it.tags || []).indexOf(t) >= 0; }

  var POOL = {
    common: D.items.filter(function (i) { return i.rarity === 'common'; }),
    rare: D.items.filter(function (i) { return i.rarity === 'rare'; }),
    heroic: D.items.filter(function (i) { return i.rarity === 'heroic'; }),
    jewelry: D.items.filter(function (i) { return isBase(i) && hasTag(i, 'jewelry'); }),
    food: D.items.filter(function (i) { return isBase(i) && hasTag(i, 'food'); }),
    cauldron: D.items.filter(function (i) { return i.rarity === 'cauldron'; })
  };

  var MOBS = D.creatures.filter(function (c) { return !c.boss; });
  var BOSSES = D.creatures.filter(function (c) { return c.boss; });

  /* Túi quái để rải lên bản đồ, đã tính độ hiếm.
     WHY: trong cùng một cấp có những con lệch hẳn khỏi phần còn lại — Người Sói
     Trăng Máu có 15 máu trong khi cả cấp 1 chỉ 1-4 máu. Rải đều tay thì một
     phần tư số ô quái là án tử cho người chơi vừa vào ván.
     ROOT-CAUSE: bảng dữ liệu gốc không ghi tần suất xuất hiện, chỉ ghi chỉ số. */
  global.HIC_mobsForLevel = function (level) {
    var out = MOBS.filter(function (c) { return (c.level || 1) === level; });
    if (!out.length) out = MOBS;
    var hp = out.map(function (c) { return c.health; }).sort(function (a, b) { return a - b; });
    var median = hp[hp.length >> 1];
    var bag = [];
    out.forEach(function (c) {
      var weight = c.health > median * 2.5 ? 1 : 6;
      for (var i = 0; i < weight; i++) bag.push(c);
    });
    return bag;
  };
  global.HIC_bossForWeek = function (week, rng) {
    var level = Math.min(4, week);
    var pool = BOSSES.filter(function (c) { return (c.level || 1) === level; });
    if (!pool.length) pool = BOSSES;
    return pool[Math.floor(rng.next() * pool.length)];
  };

  var PRICE = { common: 4, rare: 9, heroic: 16, golden: 14, diamond: 26, cauldron: 12 };

  /* ------------------------------------------------------------- item stats */

  var uidCounter = 1;
  function instance(def) {
    return {
      uid: uidCounter++, name: def.name, rarity: def.rarity,
      weapon: !!def.weapon, unique: !!def.unique, tags: def.tags || [],
      effect: def.effect || '', parts: def.parts || null,
      attack: def.attack || 0, armor: def.armor || 0,
      speed: def.speed || 0, health: def.health || 0,
      bonusAttack: 0
    };
  }
  global.HIC_instance = instance;
  global.HIC_itemDef = function (name) { return byName[name]; };

  function slotCount(week) { return week <= 1 ? 5 : week === 2 ? 7 : 9; }

  /* Bộ đồ: đủ mọi món trong danh sách `parts` thì bộ mới tính.
     Bản Golden/Diamond của một món vẫn tính là món đó. */
  function resolveSets(items, edge) {
    var names = {};
    items.forEach(function (it) {
      var n = it.name;
      if (n.indexOf('Golden ') === 0) n = n.slice(7);
      if (n.indexOf('Diamond ') === 0) n = n.slice(8);
      names[n] = true;
    });
    if (edge) names[edge.name] = true;
    return D.sets.filter(function (s) {
      return s.parts.every(function (p) { return names[p]; });
    });
  }

  function Inventory(week) {
    this.items = [];
    this.edge = null;
    this.oils = [];
    this.sets = [];
    this.maxItems = slotCount(week);
  }
  Inventory.prototype.refreshSets = function () { this.sets = resolveSets(this.items, this.edge); };
  Inventory.prototype.tagCount = function (t) {
    return this.items.filter(function (i) { return hasTag(i, t); }).length;
  };
  Object.defineProperty(Inventory.prototype, 'emptySlots', {
    get: function () { return Math.max(0, this.maxItems - this.items.length); }
  });

  /* Cộng chỉ số: đồ + dầu + bộ, rồi mới tới các món tự tính lấy chỉ số của mình
     (Oak Heart, Woodcutter's Axe...), cuối cùng là các món ghi đè hẳn (Honey Ham). */
  function resolveStats(inv, lostHp) {
    var s = { maxHp: 10, armor: 0, attack: 0, speed: 0 };
    inv.items.forEach(function (it) {
      s.maxHp += it.health || 0;
      s.armor += it.armor || 0;
      s.attack += (it.attack || 0) + (it.bonusAttack || 0);
      s.speed += it.speed || 0;
    });
    inv.oils.forEach(function (o) {
      s.maxHp += o.health || 0;
      s.armor += o.armor || 0;
      s.attack += o.attack || 0;
      s.speed += o.speed || 0;
    });
    inv.sets.forEach(function (st) {
      s.maxHp += st.health || 0;
      s.armor += st.armor || 0;
      s.attack += st.attack || 0;
      s.speed += st.speed || 0;
    });
    var ctx = {
      tagCount: function (t) { return inv.tagCount(t); },
      emptySlots: inv.emptySlots,
      lostHp: lostHp || 0
    };
    inv.items.forEach(function (it) {
      var e = global.HIC_EFFECTS.item[baseName(it.name)];
      if (e && e.dynamicStats) {
        var add = e.dynamicStats(ctx) || {};
        s.maxHp += add.maxHp || 0;
        s.armor += add.armor || 0;
        s.attack += add.attack || 0;
        s.speed += add.speed || 0;
      }
    });
    inv.items.forEach(function (it) {
      var e = global.HIC_EFFECTS.item[baseName(it.name)];
      if (e && e.overrideStats) s = e.overrideStats(s);
    });
    s.maxHp = Math.max(1, s.maxHp);
    s.attack = Math.max(0, s.attack);
    s.armor = Math.max(0, s.armor);
    return s;
  }
  function baseName(n) {
    if (n.indexOf('Golden ') === 0) return n.slice(7);
    if (n.indexOf('Diamond ') === 0) return n.slice(8);
    return n;
  }

  /* -------------------------------------------------------------------- run */

  function Run(seed) {
    this.seed = seed >>> 0 || (Date.now() >>> 0);
    this.rng = new global.HIC_Rng(this.seed);
    this.week = 1;
    this.gold = 0;
    this.lostHp = 0;
    this.inv = new Inventory(this.week);
    this.inv.items.push(instance(byName['Wooden Stick']));
    this.inv.refreshSets();
    this.bossesKilled = 0;
    this.kills = 0;
    this.daggersFound = 0;
    this.over = false;
    this.won = false;
    this.log = [];
    this.world = new global.HIC_World(this.rng.int(1e9), this.week);
    this.boss = global.HIC_bossForWeek(this.week, this.rng);
  }

  Run.prototype.stats = function () { return resolveStats(this.inv, this.lostHp); };
  Run.prototype.maxHp = function () { return this.stats().maxHp; };
  Run.prototype.hp = function () { return Math.max(0, this.maxHp() - this.lostHp); };

  Run.prototype.playerCreature = function () {
    var s = this.stats();
    return {
      name: 'Bạn', base: s, hp: Math.max(1, s.maxHp - this.lostHp),
      gold: this.gold, inventory: this.inv, effectName: null
    };
  };

  Run.prototype.foeCreature = function (def) {
    return {
      name: global.HIC_vnName(def.name),
      base: {
        maxHp: def.health, armor: def.armor || 0,
        attack: def.attack || 0, speed: def.speed || 0
      },
      hp: def.health, gold: def.boss ? 0 : (def.gold || 1),
      inventory: null, effectName: def.name, boss: !!def.boss
    };
  };

  /* Đánh một trận. Giáp hồi lại sau mỗi trận vì nó là chỉ số nền; máu thì không. */
  Run.prototype.fight = function (def) {
    var res = global.HIC_resolveBattle(this.playerCreature(), this.foeCreature(def),
      { seed: this.rng.int(1e9) });
    this.lostHp = this.maxHp() - res.playerHp;
    if (res.playerWon) {
      this.gold += res.goldDelta;
      this.gold += def.boss ? 0 : (def.gold || 1);
      if (def.boss) {
        this.bossesKilled++;
        if (this.hasItem('Boss Contract')) this.gold += 15;
      } else {
        this.kills++;
      }
    } else {
      this.over = true;
    }
    res.foeName = global.HIC_vnName(def.name);
    return res;
  };

  Run.prototype.hasItem = function (name) {
    return this.inv.items.some(function (i) { return baseName(i.name) === name; });
  };

  Run.prototype.nextWeek = function () {
    this.week++;
    this.inv.maxItems = slotCount(this.week);
    if (this.week > 4) { this.over = true; this.won = true; return; }
    this.world = new global.HIC_World(this.rng.int(1e9), this.week);
    this.boss = global.HIC_bossForWeek(this.week, this.rng);
  };

  /* ------------------------------------------------------------- lấy vật phẩm */

  Run.prototype.pickFrom = function (pool, n, filter) {
    var list = pool.slice(), out = [], self = this;
    if (filter) list = list.filter(filter);
    // Không đưa lại món độc nhất mà người chơi đang đeo.
    list = list.filter(function (it) {
      return !(it.unique && self.hasItem(it.name));
    });
    for (var i = 0; i < n && list.length; i++) {
      var k = this.rng.int(list.length);
      out.push(instance(list[k]));
      list.splice(k, 1);
    }
    return out;
  };

  Run.prototype.canEquip = function (it) {
    if (it.weapon) return true;                       // vũ khí luôn thay được
    return this.inv.items.length < this.inv.maxItems;
  };

  Run.prototype.equip = function (it, replaceUid) {
    if (it.weapon) {
      // Chỉ giữ một vũ khí; món cũ bị bỏ lại.
      var oldW = this.inv.items[0];
      if (oldW && oldW.weapon) this.inv.items.shift();
      if (this.hasItem('Grindstone Club')) it.bonusAttack += 2;
      if (baseName(it.name) === 'Hidden Dagger') {
        this.daggersFound++;
        it.bonusAttack += this.daggersFound - 1;
      }
      this.inv.items.unshift(it);
    } else {
      if (replaceUid != null) {
        var idx = this.inv.items.findIndex(function (x) { return x.uid === replaceUid; });
        if (idx > 0) this.inv.items.splice(idx, 1);
      }
      if (this.inv.items.length >= this.inv.maxItems) return false;
      this.inv.items.push(it);
    }
    this.inv.refreshSets();
    return true;
  };

  Run.prototype.drop = function (uid) {
    var idx = this.inv.items.findIndex(function (x) { return x.uid === uid; });
    if (idx <= 0) return false;    // ô 0 là vũ khí, không bỏ trống được
    this.inv.items.splice(idx, 1);
    this.inv.refreshSets();
    return true;
  };

  /* ------------------------------------------------------------- sự kiện ô */

  /* "Đã xem" và "đã dùng hết" là HAI chuyện khác nhau.
     - `seen`  : đã mở bảng một lần. Ô thôi tự bật lên khi đi ngang, nhưng vẫn
                 nằm trên bản đồ (vẽ mờ đi) và chạm vào là mở lại được.
     - `used`  : đã lấy được thứ trong đó. Ô biến mất.
     WHY: gộp hai thứ này làm một khiến lái buôn biến mất chỉ vì người chơi ghé
     qua mà chưa đủ tiền — lấy mất một lựa chọn của họ để sửa một lỗi của tôi.
     Rương, mồ và hộp trang sức thì mở ra là hết, vì mở CHÍNH LÀ lấy. */
  var CONSUMED_ON_OPEN = { chest: 1, jewelrybox: 1, grave: 1, tower: 1 };

  Run.prototype.openEvent = function (ev) {
    var r = this.rng;
    if (ev) {
      ev.seen = true;
      if (CONSUMED_ON_OPEN[ev.id]) ev.used = true;
    }
    switch (ev.id) {
      case 'chest':
        return { type: 'pick', title: 'Rương gỗ', hint: 'Chọn một món', offers: this.pickFrom(POOL.common, 3) };
      case 'jewelrybox':
        return { type: 'pick', title: 'Hộp trang sức', hint: 'Chọn một món trang sức', offers: this.pickFrom(POOL.jewelry, 3) };
      case 'grave':
        return { type: 'pick', title: 'Nấm mồ', hint: 'Đồ anh hùng — chọn một món', offers: this.pickFrom(POOL.heroic, 3) };
      case 'anvil':
        return { type: 'edge', title: 'Đe rèn', hint: 'Mài lưỡi cho vũ khí', offers: this.pickEdges(3) };
      case 'oil':
        return { type: 'oil', title: 'Lọ dầu', hint: 'Bôi lên vũ khí (tối đa 3 lọ)', offers: D.oils.slice() };
      case 'merchant':
        return { type: 'shop', title: 'Lái buôn', hint: 'Mua bằng vàng', offers: this.shopStock(3), rerolls: this.rerolls || 0 };
      /* Nghỉ ngơi phải HỎI, không được tự làm.
         WHY: nghỉ là đẩy thẳng tới sáng hôm sau, tức là ném đi tới 80 bước —
         gần một phần ba cả tuần. Dẫm phải mà tự nghỉ thì người chơi mất một
         ngày vì đi nhầm một ô. Con bot thử nghiệm hết sạch tuần trong 42 bước
         đúng vì lý do này. */
      case 'campfire':
        return {
          type: 'rest', kind: 'campfire', title: 'Đống lửa',
          text: 'Ngồi lại sưởi thì hồi 10 máu, nhưng bạn sẽ ngủ thẳng tới sáng mai — ' +
            'phần thời gian còn lại của hôm nay coi như mất.'
        };
      case 'house':
        return {
          type: 'rest', kind: 'house', title: 'Căn nhà',
          text: 'Ngủ trong nhà thì máu đầy lại, nhưng bạn thức dậy vào sáng mai — ' +
            'phần thời gian còn lại của hôm nay coi như mất.'
        };
      case 'tower':
        this.world.revealAll();
        return { type: 'info', title: 'Chòi canh', text: 'Bạn nhìn thấy toàn bộ vùng này.' };
      case 'golem':
        return { type: 'golem', title: 'Golem thợ rèn', hint: 'Ghép hai món giống hệt nhau thành bản mạ vàng' };
      case 'cauldron':
        return { type: 'cauldron', title: 'Vạc nấu', hint: 'Nấu hai món ăn thành một món mạnh hơn' };
      case 'well':
        return { type: 'well', title: 'Giếng ước', hint: 'Thả 20 vàng xuống giếng', gold: this.gold };
      default:
        return { type: 'info', title: ev.name, text: 'Không có gì ở đây.' };
    }
  };

  Run.prototype.rest = function (kind, ev) {
    if (kind === 'house') this.lostHp = 0;
    else this.lostHp = Math.max(0, this.lostHp - 10);
    this.world.skipToMorning();
    if (ev) ev.used = true;      // nghỉ rồi thì đống lửa tàn / căn nhà đã dùng
  };

  Run.prototype.pickEdges = function (n) {
    var list = D.edges.slice(), out = [];
    for (var i = 0; i < n && list.length; i++) {
      out.push(list.splice(this.rng.int(list.length), 1)[0]);
    }
    return out;
  };

  Run.prototype.shopStock = function (n) {
    var pool = this.week >= 2 ? POOL.rare.concat(POOL.heroic) : POOL.rare;
    return this.pickFrom(pool, n).map(function (it) {
      it.price = PRICE[it.rarity] || 10;
      return it;
    });
  };

  /* Lái buôn chỉ biến mất khi đã bán được hàng. Chưa mua thì ông ta còn đó,
     và người chơi quay lại lúc đủ tiền. */
  Run.prototype.buy = function (it, ev) {
    if (this.gold < it.price) return { ok: false, why: 'Không đủ vàng' };
    if (!this.canEquip(it)) return { ok: false, why: 'Hết ô đồ' };
    this.gold -= it.price;
    this.equip(it);
    if (ev) ev.used = true;
    return { ok: true };
  };

  Run.prototype.applyEdge = function (edgeDef, ev) {
    this.inv.edge = edgeDef;
    this.inv.refreshSets();
    if (ev) ev.used = true;
  };

  Run.prototype.applyOil = function (oilDef, ev) {
    if (this.inv.oils.length >= 3) return false;
    this.inv.oils.push(oilDef);
    if (ev) ev.used = true;
    return true;
  };

  /* Golem: hai món giống hệt -> bản Golden; hai Golden -> Diamond. */
  Run.prototype.golemPairs = function () {
    var count = {}, out = [];
    this.inv.items.forEach(function (it) {
      count[it.name] = (count[it.name] || 0) + 1;
    });
    for (var name in count) {
      if (count[name] < 2) continue;
      var up = name.indexOf('Golden ') === 0 ? 'Diamond ' + name.slice(7) : 'Golden ' + name;
      if (byName[up]) out.push({ from: name, to: up });
    }
    return out;
  };

  Run.prototype.golemCombine = function (pair, ev) {
    var removed = 0;
    for (var i = this.inv.items.length - 1; i >= 0 && removed < 2; i--) {
      if (this.inv.items[i].name === pair.from) { this.inv.items.splice(i, 1); removed++; }
    }
    if (removed < 2) return false;
    var made = instance(byName[pair.to]);
    if (made.weapon) this.inv.items.unshift(made); else this.inv.items.push(made);
    this.inv.refreshSets();
    if (ev) ev.used = true;
    return made;
  };

  /* Vạc nấu: hai món ăn theo công thức có sẵn -> một món ăn nấu chín. */
  Run.prototype.cauldronRecipes = function () {
    var have = {};
    this.inv.items.forEach(function (it) { have[it.name] = (have[it.name] || 0) + 1; });
    return POOL.cauldron.filter(function (dish) {
      if (!dish.parts || dish.parts.length !== 2) return false;
      var a = dish.parts[0], b = dish.parts[1];
      if (a === b) return (have[a] || 0) >= 2;
      return have[a] && have[b];
    });
  };

  Run.prototype.cauldronCook = function (dish, ev) {
    var self = this, ok = true;
    dish.parts.forEach(function (p) {
      var i = self.inv.items.findIndex(function (x) { return x.name === p; });
      if (i < 0) { ok = false; return; }
      self.inv.items.splice(i, 1);
    });
    if (!ok) return false;
    var made = instance(byName[dish.name]);
    this.inv.items.push(made);
    this.inv.refreshSets();
    if (ev) ev.used = true;
    return made;
  };

  Run.prototype.wellWish = function (choice, ev) {
    if (this.gold < 20) return null;
    this.gold -= 20;
    if (ev) ev.used = true;
    if (choice === 'rerolls') {
      this.rerolls = (this.rerolls || 0) + 5;
      return { type: 'info', title: 'Giếng ước', text: 'Bạn được 5 lượt đổi hàng ở lái buôn.' };
    }
    return { type: 'pick', title: 'Rương của giếng', hint: 'Chọn một món hiếm', offers: this.pickFrom(POOL.rare, 3) };
  };

  /* ------------------------------------------------------------------- save */

  var SAVE_KEY = 'hic.save.v1';

  Run.prototype.toJSON = function () {
    return {
      seed: this.seed, week: this.week, gold: this.gold, lostHp: this.lostHp,
      bossesKilled: this.bossesKilled, kills: this.kills, daggersFound: this.daggersFound,
      rerolls: this.rerolls || 0,
      items: this.inv.items.map(function (i) { return { name: i.name, bonusAttack: i.bonusAttack }; }),
      edge: this.inv.edge ? this.inv.edge.name : null,
      oils: this.inv.oils.map(function (o) { return o.name; }),
      boss: this.boss.name,
      world: {
        seed: this.world.seedUsed, phaseIndex: this.world.phaseIndex,
        stepsLeft: this.world.stepsLeft, px: this.world.px, py: this.world.py
      }
    };
  };

  global.HIC_saveMeta = function (meta) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* riêng tư / hết chỗ */ }
    if (global.HubSave && global.HubSave.push) {
      try { global.HubSave.push('hic', meta); } catch (e) { /* hub chưa có tài khoản */ }
    }
  };
  global.HIC_loadMeta = function () {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  };

  global.HIC_Run = Run;
  global.HIC_POOL = POOL;
  global.HIC_PRICE = PRICE;
  global.HIC_BOSSES = BOSSES;
  global.HIC_MOBS = MOBS;
  global.HIC_resolveStats = resolveStats;
  global.HIC_slotCount = slotCount;
  global.HIC_baseName = baseName;
})(window);
