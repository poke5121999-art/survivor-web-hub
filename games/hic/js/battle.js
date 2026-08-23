/* Combat engine — a faithful port of the original's resolution order.
 *
 * WHY: mọi thứ khác trong game chỉ là cái khung quanh 30 giây này. Nếu thứ tự
 * nổ hiệu ứng sai một bước thì mọi con số cân bằng lấy từ bản gốc đều vô nghĩa.
 * ROOT-CAUSE: một auto-battler không có thao tác trong trận, nên người chơi chỉ
 * tin được vào bộ đồ mình lắp khi luật giải quyết trận đúng từng bước.
 * SEE: docs/proposals/he-is-coming-clone.md — mục "Combat"
 *
 * Thứ tự một trận (giữ nguyên bản gốc):
 *   Battle Start -> Initiative -> chốt ai đi trước (tốc độ cao hơn, hoà thì
 *   người chơi) -> lặp: Turn Start / đánh / các nhát đánh thêm / Turn End ->
 *   đổi lượt (bỏ lượt nếu đang choáng).
 * Sát thương luôn ăn giáp trước, phần thừa mới vào máu.
 */
(function (global) {
  'use strict';

  var T = {
    onBattle: 'onBattle', onInitiative: 'onInitiative',
    onTurn: 'onTurn', onEndTurn: 'onEndTurn',
    onHit: 'onHit', onTakeDamage: 'onTakeDamage',
    onExposed: 'onExposed', onWounded: 'onWounded',
    onRestoreHealth: 'onRestoreHealth', onHpChanged: 'onHpChanged',
    onOverheal: 'onOverheal',
    onGainArmor: 'onGainArmor', onLoseArmor: 'onLoseArmor',
    onGainThorns: 'onGainThorns', onLoseThorns: 'onLoseThorns',
    onEnemyHpChanged: 'onEnemyHpChanged', onEnemyArmorChanged: 'onEnemyArmorChanged',
    onAfterEnemyStrike: 'onAfterEnemyStrike', onLethal: 'onLethal'
  };

  function Death(index) { this.index = index; }

  function statsFrom(creature) {
    var b = creature.base;
    return {
      maxHp: b.maxHp, hp: creature.hp != null ? creature.hp : b.maxHp,
      armor: b.armor || 0, attack: b.attack || 0, speed: b.speed || 0,
      thorns: 0, stunCount: 0, strikesMade: 0, extraStrikes: [],
      exposedCount: 0, exposedLimit: 1, hasBeenWounded: false,
      gold: creature.gold || 0, damageThisTurn: 0, flags: {}
    };
  }

  /* ---------------------------------------------------------------- context */

  function Ctx(battle, trigger, meIndex, sourceName, mult, value) {
    this.b = battle; this.trigger = trigger; this.i = meIndex;
    this.e = meIndex === 0 ? 1 : 0;
    this.src = sourceName; this.m = mult; this.value = value;
  }
  Object.defineProperty(Ctx.prototype, 'my', { get: function () { return this.b.stats[this.i]; } });
  Object.defineProperty(Ctx.prototype, 'enemy', { get: function () { return this.b.stats[this.e]; } });
  Object.defineProperty(Ctx.prototype, 'isFirstTurn', { get: function () { return this.b.turnNumber() === 1; } });
  Object.defineProperty(Ctx.prototype, 'isEveryOtherTurn', { get: function () { return this.b.turnNumber() % 2 === 1; } });
  Object.defineProperty(Ctx.prototype, 'strikeCount', { get: function () { return this.my.strikesMade; } });
  Object.defineProperty(Ctx.prototype, 'overhealValue', { get: function () { return this.value; } });
  Object.defineProperty(Ctx.prototype, 'armorDelta', { get: function () { return this.value; } });
  Object.defineProperty(Ctx.prototype, 'thornsDelta', { get: function () { return this.value; } });
  Object.defineProperty(Ctx.prototype, 'hpDelta', { get: function () { return this.value; } });
  Object.defineProperty(Ctx.prototype, 'lastStrikeHpDamage', { get: function () { return this.b.lastStrikeHpDamage; } });

  Ctx.prototype.everyNStrikes = function (n) { return this.my.strikesMade % n === n - 1; };
  Ctx.prototype.healthWasFullAtStart = function () { return this.b.startFull[this.i]; };
  Ctx.prototype.hadMoreSpeedAtStart = function () { return this.b.startSpeed[this.i] > this.enemy.speed; };
  Ctx.prototype.isHealthFull = function () { return this.my.hp >= this.my.maxHp; };
  Ctx.prototype.belowHalf = function () { return this.my.hp < this.my.maxHp / 2; };
  Ctx.prototype.atOrBelowHalf = function () { return this.my.hp <= this.my.maxHp / 2; };
  Ctx.prototype.enemyAtOrBelowHalf = function () { return this.enemy.hp <= this.enemy.maxHp / 2; };
  Ctx.prototype.lostHp = function () { return this.my.maxHp - this.my.hp; };
  Ctx.prototype.hasBeenExposed = function () { return this.my.exposedCount > 0; };
  Ctx.prototype.baseArmor = function () { return this.b.baseStats[this.i].armor || 0; };
  Ctx.prototype.baseStats = function () { return this.b.baseStats[this.i]; };
  Ctx.prototype.tagCount = function (tag) { return this.b.tagCount(this.i, tag); };
  Ctx.prototype.gemCount = function (gem) { return this.b.gemCount(this.i, gem); };
  Ctx.prototype.emptySlots = function () { return this.b.emptySlots(this.i); };
  Ctx.prototype.rng = function () { return this.b.rng(); };
  Ctx.prototype.once = function (key) {
    var f = this.my.flags, k = this.src + ':' + key;
    if (f[k]) return false;
    f[k] = true;
    return true;
  };

  Ctx.prototype.addExtraExposed = function (n) { this.my.exposedLimit += n; };
  Ctx.prototype.queueExtraStrike = function (damage) {
    this.my.extraStrikes.push({ source: this.src, damage: damage == null ? null : damage });
  };
  Ctx.prototype.gainGold = function (g) { this.my.gold += g; };
  Ctx.prototype.gainArmor = function (a) { if (a > 0) this.b.adjustArmor(a, this.i, this.src); };
  Ctx.prototype.loseArmor = function (a) { if (a > 0) this.b.adjustArmor(-Math.min(a, this.my.armor), this.i, this.src); };
  Ctx.prototype.giveArmorToEnemy = function (a) { if (a > 0) this.b.adjustArmor(a, this.e, this.src); };
  Ctx.prototype.stealArmor = function (a) {
    var stolen = Math.min(this.enemy.armor, a);
    if (stolen <= 0) return;
    this.b.adjustArmor(-stolen, this.e, this.src);
    this.b.adjustArmor(stolen, this.i, this.src);
  };
  Ctx.prototype.gainThorns = function (t) { if (t > 0) this.b.adjustThorns(t, this.i, this.src); };
  Ctx.prototype.gainSpeed = function (s) { if (s > 0) this.b.adjustSpeed(s, this.i, this.src); };
  Ctx.prototype.loseSpeed = function (s) { if (s > 0) this.b.adjustSpeed(-s, this.i, this.src); };
  Ctx.prototype.gainAttack = function (a) { if (a > 0) this.b.adjustAttack(a, this.i, this.src); };
  Ctx.prototype.loseAttack = function (a) { if (a > 0) this.b.adjustAttack(-a, this.i, this.src); };
  Ctx.prototype.adjustAttack = function (a) { if (a !== 0) this.b.adjustAttack(a, this.i, this.src); };
  Ctx.prototype.gainMaxHealth = function (h) { this.my.maxHp += h; this.my.hp += h; };
  Ctx.prototype.stealMaxHealth = function (h) {
    var take = Math.min(this.enemy.maxHp - 1, h);
    if (take <= 0) return;
    this.enemy.maxHp -= take;
    this.enemy.hp = Math.min(this.enemy.hp, this.enemy.maxHp);
    this.gainMaxHealth(take);
  };
  Ctx.prototype.stunEnemy = function (n) { this.enemy.stunCount += n; };
  Ctx.prototype.stunSelf = function (n) { this.my.stunCount += n; };
  Ctx.prototype.restoreHealth = function (hp) { if (hp > 0) this.b.restoreHealth(hp, this.i, this.src); };
  Ctx.prototype.healToFull = function () { this.restoreHealth(this.lostHp()); };
  Ctx.prototype.loseHealth = function (hp) {
    this.my.hp -= hp;
    this.b.log(this.b.disp(this.src) + ': ' + this.b.name(this.i) + ' -' + hp + ' máu',
      { k: 'dmg', i: this.i, v: hp, hp: hp, ar: 0 });
    this.b.checkDeath();
  };
  Ctx.prototype.dealDamage = function (d) { this.b.dealDamage(d, this.e, this.src, { dealer: this.i, weapon: false }); };
  Ctx.prototype.takeDamage = function (d) { this.b.dealDamage(d, this.i, this.src, { dealer: this.e, weapon: false }); };
  Ctx.prototype.executeEnemy = function () { this.dealDamage(this.enemy.hp); };
  Ctx.prototype.triggerInitiative = function () { this.b.retriggerInitiative(this.i); };
  Ctx.prototype.triggerWounded = function () { this.b.fire(T.onWounded, this.i, null, null); };

  /* ----------------------------------------------------------------- battle */

  function Battle(player, foe, opts) {
    opts = opts || {};
    this.creatures = [player, foe];
    this.baseStats = [player.base, foe.base];
    this.stats = [statsFrom(player), statsFrom(foe)];
    this.startFull = [this.stats[0].hp >= this.stats[0].maxHp, this.stats[1].hp >= this.stats[1].maxHp];
    this.startSpeed = [this.stats[0].speed, this.stats[1].speed];
    this.startGold = [this.stats[0].gold, this.stats[1].gold];
    this.turnsTaken = 0;
    this.attackerIndex = 0;
    this.lastStrikeHpDamage = 0;
    this.lines = [];
    this.verbose = opts.verbose !== false;
    this.initiativeDepth = 0;
    this._seed = (opts.seed == null ? 12345 : opts.seed) >>> 0 || 1;
    this.effects = global.HIC_EFFECTS;
  }

  Battle.prototype.rng = function () {
    // xorshift — phát lại cùng một hạt phải ra cùng một trận.
    var x = this._seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this._seed = x || 1;
    return this._seed / 4294967296;
  };

  /* Mỗi dòng nhật ký kèm luôn ảnh chụp chỉ số ngay lúc đó.
     WHY: màn hình trận đánh phát lại từng dòng một; nếu chỉ có chữ thì thanh
     máu sẽ nhảy thẳng tới kết quả cuối và người chơi không thấy trận diễn ra. */
  /* Nhật ký trận là thứ NGƯỜI CHƠI đọc, nên tên nguồn phải là tên tiếng Việt.
     Bên trong bộ máy thì vẫn dùng tên gốc tiếng Anh, vì đó là khoá tra hiệu ứng
     và là thứ chặn một hiệu ứng tự kích lại chính nó. */
  Battle.prototype.disp = function (name) {
    return global.HIC_vnName ? global.HIC_vnName(name) : name;
  };

  Battle.prototype.log = function (m, meta) {
    if (!this.verbose) return;
    var a = this.stats[0], b = this.stats[1];
    this.lines.push({
      t: m,
      k: (meta && meta.k) || 'info',      // loai su kien, cho man hinh tran danh
      i: meta && meta.i,                  // ai chiu
      by: meta && meta.by,                // ai gay ra
      v: meta && meta.v,                  // bao nhieu
      hp: meta && meta.hp, ar: meta && meta.ar, strike: meta && meta.strike,
      a: { hp: Math.max(0, a.hp), maxHp: a.maxHp, armor: a.armor, attack: a.attack, speed: a.speed, thorns: a.thorns, stun: a.stunCount },
      b: { hp: Math.max(0, b.hp), maxHp: b.maxHp, armor: b.armor, attack: b.attack, speed: b.speed, thorns: b.thorns, stun: b.stunCount }
    });
  };
  Battle.prototype.turnNumber = function () { return ((this.turnsTaken / 2) | 0) + 1; };
  Battle.prototype.name = function (i) { return this.creatures[i].name; };

  function mult(name) {
    if (name.indexOf('Golden ') === 0) return 2;
    if (name.indexOf('Diamond ') === 0) return 4;
    return 1;
  }
  function baseName(name) {
    if (name.indexOf('Golden ') === 0) return name.slice(7);
    if (name.indexOf('Diamond ') === 0) return name.slice(8);
    return name;
  }

  Battle.prototype.sources = function (i) {
    // Thứ tự nổ hiệu ứng: bản thân sinh vật -> vũ khí -> lưỡi mài -> đồ khác -> bộ.
    var c = this.creatures[i], out = [];
    if (c.effectName) out.push({ name: c.effectName, m: 1, table: 'creature' });
    var inv = c.inventory;
    if (inv) {
      if (inv.items[0]) out.push({ name: inv.items[0].name, m: mult(inv.items[0].name), table: 'item' });
      if (inv.edge) out.push({ name: inv.edge.name, m: 1, table: 'edge' });
      for (var k = 1; k < inv.items.length; k++) {
        out.push({ name: inv.items[k].name, m: mult(inv.items[k].name), table: 'item' });
      }
      for (var s = 0; s < (inv.sets || []).length; s++) {
        out.push({ name: inv.sets[s].name, m: 1, table: 'set' });
      }
    }
    return out;
  };

  Battle.prototype.lookup = function (src) {
    var tbl = this.effects[src.table];
    return tbl ? tbl[baseName(src.name)] : null;
  };

  Battle.prototype.tagCount = function (i, tag) {
    var inv = this.creatures[i].inventory;
    if (!inv) return 0;
    return inv.items.filter(function (it) { return (it.tags || []).indexOf(tag) >= 0; }).length;
  };
  Battle.prototype.gemCount = function (i, gem) {
    var inv = this.creatures[i].inventory;
    if (!inv) return 0;
    return inv.items.filter(function (it) { return global.HIC_gemOf(it) === gem; }).length;
  };
  Battle.prototype.emptySlots = function (i) {
    var inv = this.creatures[i].inventory;
    return inv ? Math.max(0, inv.maxItems - inv.items.length) : 0;
  };

  /* ------------------------------------------------------------- primitives */

  Battle.prototype.adjustArmor = function (delta, i, src) {
    if (delta === 0) return;
    this.stats[i].armor += delta;
    this.log(this.name(i) + ' ' + (delta > 0 ? '+' : '') + delta + ' giáp (' + this.disp(src) + ')',
      { k: delta > 0 ? 'armor' : 'armorloss', i: i, v: delta });
    if (delta > 0) this.fire(T.onGainArmor, i, src, delta);
  };
  Battle.prototype.adjustThorns = function (delta, i, src) {
    if (delta === 0) return;
    this.stats[i].thorns = Math.max(0, this.stats[i].thorns + delta);
    this.log(this.name(i) + ' ' + (delta > 0 ? '+' : '') + delta + ' gai (' + this.disp(src) + ')',
      { k: 'thorns', i: i, v: delta });
    this.fire(delta > 0 ? T.onGainThorns : T.onLoseThorns, i, src, delta);
  };
  Battle.prototype.adjustAttack = function (delta, i, src) {
    this.stats[i].attack = Math.max(0, this.stats[i].attack + delta);
    this.log(this.name(i) + ' ' + (delta > 0 ? '+' : '') + delta + ' công (' + this.disp(src) + ')',
      { k: 'atk', i: i, v: delta });
  };
  Battle.prototype.adjustSpeed = function (delta, i, src) {
    this.stats[i].speed += delta;
    this.log(this.name(i) + ' ' + (delta > 0 ? '+' : '') + delta + ' tốc (' + this.disp(src) + ')',
      { k: 'spd', i: i, v: delta });
  };

  Battle.prototype.restoreHealth = function (hp, i, src) {
    var s = this.stats[i];
    var newHp = Math.min(s.hp + hp, s.maxHp);
    var restored = newHp - s.hp, over = hp - restored;
    s.hp = newHp;
    if (restored > 0) {
      this.log(this.disp(src) + ': ' + this.name(i) + ' hồi ' + restored + ' máu',
        { k: 'heal', i: i, v: restored });
      this.fire(T.onRestoreHealth, i, src, restored);
      this.fire(T.onHpChanged, i, src, restored);
    }
    if (over > 0) this.fire(T.onOverheal, i, src, over);
  };

  /* Sát thương: giáp trước, máu sau. Các cờ ignoreArmor / doubleVsArmor /
     halveVsArmor là biến thể mà vài con trùm và vũ khí mang theo. */
  Battle.prototype.dealDamage = function (damage, target, src, opts) {
    opts = opts || {};
    var s = this.stats[target], foe = target === 0 ? 1 : 0;
    var dealer = opts.dealer != null ? opts.dealer : foe;

    if (!opts.weapon && dealer != null) damage += this.nonWeaponBonus(dealer);
    if (damage <= 0) return { armor: 0, hp: 0 };

    var armorHit, hpHit;
    if (opts.ignoreArmor) {
      armorHit = 0;
      hpHit = damage;
    } else {
      var vsArmor = damage;
      if (opts.doubleVsArmor) vsArmor = damage * 2;
      if (opts.halveVsArmor) vsArmor = Math.floor(damage / 2);
      armorHit = Math.min(s.armor, vsArmor);
      // Phần đã tiêu để phá giáp quy về hệ số gốc, phần còn lại mới vào máu.
      var used = opts.doubleVsArmor ? Math.ceil(armorHit / 2)
        : opts.halveVsArmor ? armorHit * 2 : armorHit;
      hpHit = Math.max(0, damage - used);
    }

    var armorBefore = s.armor;
    var wasAboveHalf = s.hp > s.maxHp / 2;
    s.armor -= armorHit;
    s.hp -= hpHit;
    this.log(this.disp(src) + ' gây ' + damage + ' lên ' + this.name(target) +
      ' (' + Math.max(0, s.hp) + '/' + s.maxHp + ' máu, ' + s.armor + ' giáp)',
      { k: 'dmg', i: target, by: dealer, v: damage, hp: hpHit, ar: armorHit,
        strike: !!opts.weapon });
    s.damageThisTurn++;
    this.checkDeath();

    this.fire(T.onTakeDamage, target, src, damage);
    if (armorHit > 0) this.fire(T.onLoseArmor, target, src, -armorHit);
    if (hpHit !== 0) this.fire(T.onHpChanged, target, src, -hpHit);

    if (armorBefore > 0 && s.armor === 0 && s.exposedCount < s.exposedLimit) {
      s.exposedCount++;
      this.fire(T.onExposed, target, src, null);
    }
    if (wasAboveHalf && s.hp <= s.maxHp / 2 && !s.hasBeenWounded) {
      s.hasBeenWounded = true;
      this.fire(T.onWounded, target, src, null);
    }
    if (hpHit !== 0) this.fire(T.onEnemyHpChanged, foe, src, -hpHit);
    if (armorHit !== 0) this.fire(T.onEnemyArmorChanged, foe, src, -armorHit);
    return { armor: armorHit, hp: hpHit };
  };

  Battle.prototype.nonWeaponBonus = function (i) {
    var bonus = 0, self = this;
    this.sources(i).forEach(function (s) {
      var e = self.lookup(s);
      if (e && e.nonWeaponBonus) bonus += e.nonWeaponBonus * s.m;
    });
    return bonus;
  };

  Battle.prototype.checkDeath = function () {
    for (var i = 0; i < 2; i++) {
      if (this.stats[i].hp <= 0) {
        if (this.tryResilience(i)) continue;
        this.stats[i].hp = 0;
        throw new Death(i);
      }
    }
  };

  Battle.prototype.tryResilience = function (i) {
    var self = this, saved = false;
    this.sources(i).forEach(function (s) {
      if (saved) return;
      var e = self.lookup(s);
      if (!e || !e.triggers || !e.triggers[T.onLethal]) return;
      var st = self.stats[i];
      if (st.flags['lethal:' + s.name]) return;
      st.flags['lethal:' + s.name] = true;
      e.triggers[T.onLethal](new Ctx(self, T.onLethal, i, s.name, s.m, null));
      if (self.stats[i].hp > 0) saved = true;
    });
    return saved;
  };

  /* ------------------------------------------------------------- triggering */

  Battle.prototype.fire = function (trigger, i, parentSource, value) {
    var srcs = this.sources(i);
    for (var k = 0; k < srcs.length; k++) {
      var s = srcs[k];
      if (parentSource === s.name) continue;   // chặn hiệu ứng tự kích lại chính nó
      var e = this.lookup(s);
      if (!e || !e.triggers || !e.triggers[trigger]) continue;
      e.triggers[trigger](new Ctx(this, trigger, i, s.name, s.m, value));
      this.checkDeath();
    }
  };

  Battle.prototype.retriggerInitiative = function (i) {
    if (this.initiativeDepth > 3) return;
    this.initiativeDepth++;
    this.fire(T.onInitiative, i, null, null);
    this.initiativeDepth--;
  };

  /* ----------------------------------------------------------------- strike */

  function collectMods(battle, i, key) {
    var mods = {};
    battle.sources(i).forEach(function (s) {
      var e = battle.lookup(s);
      if (!e || !e[key]) return;
      var m = e[key](new Ctx(battle, key, i, s.name, s.m, null)) || {};
      for (var k in m) {
        if (k === 'mult') mods.mult = (mods.mult || 1) * m.mult;
        else if (k === 'bonus') mods.bonus = (mods.bonus || 0) + m.bonus;
        else mods[k] = m[k];
      }
    });
    return mods;
  }

  Battle.prototype.skipsStrike = function (i) {
    var skip = false, self = this;
    this.sources(i).forEach(function (s) {
      var e = self.lookup(s);
      if (!e || !e.skipStrike) return;
      if (e.skipStrike(new Ctx(self, 'skipStrike', i, s.name, s.m, null))) skip = true;
    });
    return skip;
  };

  Battle.prototype.strike = function (explicit) {
    var a = this.attackerIndex, d = a === 0 ? 1 : 0;
    var atk = this.stats[a], def = this.stats[d];

    // Gai được thu và xoá TRƯỚC khi tính sát thương, đúng như bản gốc.
    var thorns = def.thorns;
    if (thorns > 0) this.adjustThorns(-thorns, d, this.name(a) + ' đánh');

    var mods = explicit == null ? collectMods(this, a, 'strikeMod') : {};
    var dmods = explicit == null ? collectMods(this, d, 'defendMod') : {};
    var damage = explicit != null ? explicit : Math.max(0, atk.attack);
    if (mods.bonus) damage += mods.bonus;
    if (mods.mult) damage = Math.floor(damage * mods.mult);
    if (dmods.mult) damage = Math.floor(damage * dmods.mult);

    if (mods.stealGold) {
      var take = Math.min(def.gold, damage);
      def.gold -= take;
      atk.gold += take;
      this.log(this.name(a) + ' cướp ' + take + ' vàng thay vì gây sát thương',
        { k: 'strike', by: a, i: d });
    } else if (damage <= 0) {
      // Vung mà không gây gì vẫn phải có một dòng, nếu không màn hình trận đánh
      // sẽ đứng im trong khi nhân vật đang thật sự đánh.
      this.log(this.name(a) + ' vung hụt', { k: 'strike', by: a, i: d });
      this.lastStrikeHpDamage = 0;
    } else {
      var res = this.dealDamage(damage, d, this.name(a) + ' đánh', {
        dealer: a, weapon: true,
        ignoreArmor: mods.ignoreArmor,
        doubleVsArmor: mods.doubleVsArmor,
        halveVsArmor: mods.halveVsArmor
      });
      this.lastStrikeHpDamage = res.hp;
    }

    this.fire(T.onHit, a, null, null);
    if (thorns > 0) this.dealDamage(thorns, a, this.name(d) + ' gai', { dealer: d, weapon: false });
    this.fire(T.onAfterEnemyStrike, d, null, null);
    atk.strikesMade++;
  };

  Battle.prototype.nextAttacker = function () {
    while (this.stats[0].hp > 0 && this.stats[1].hp > 0) {
      this.attackerIndex = this.attackerIndex === 0 ? 1 : 0;
      this.turnsTaken++;
      this.stats[this.attackerIndex].damageThisTurn = 0;
      if (this.stats[this.attackerIndex].stunCount < 1) break;
      this.stats[this.attackerIndex].stunCount--;
      this.log(this.name(this.attackerIndex) + ' đang choáng, bỏ lượt',
        { k: 'stun', i: this.attackerIndex });
    }
  };

  Battle.prototype.run = function () {
    var winner = null;
    try {
      this.fire(T.onBattle, 0, null, null);
      this.fire(T.onBattle, 1, null, null);
      this.fire(T.onInitiative, 0, null, null);
      this.fire(T.onInitiative, 1, null, null);
      // Ai nhanh hơn đi trước; hoà thì người chơi đi trước.
      this.attackerIndex = this.stats[0].speed >= this.stats[1].speed ? 0 : 1;
      this.stats[this.attackerIndex].damageThisTurn = 0;

      while (this.stats[0].hp > 0 && this.stats[1].hp > 0) {
        this.fire(T.onTurn, this.attackerIndex, null, null);
        if (!this.skipsStrike(this.attackerIndex)) this.strike();
        var extras = this.stats[this.attackerIndex].extraStrikes;
        this.stats[this.attackerIndex].extraStrikes = [];
        for (var k = 0; k < extras.length; k++) this.strike(extras[k].damage);
        this.fire(T.onEndTurn, this.attackerIndex, null, null);
        this.nextAttacker();
        if (this.turnNumber() > 100) {
          // Cùng một luật chống trận bất tận như bản gốc.
          this.dealDamage(10, this.attackerIndex, 'Hết giờ', { weapon: false });
        }
      }
    } catch (err) {
      if (!(err instanceof Death)) throw err;
      winner = err.index === 0 ? 1 : 0;
      this.log(this.name(err.index) + ' gục ngã', { k: 'death', i: err.index });
    }
    if (winner == null) winner = this.stats[0].hp > 0 ? 0 : 1;
    return {
      winner: winner,
      playerWon: winner === 0,
      playerHp: Math.max(0, this.stats[0].hp),
      playerMaxHp: this.stats[0].maxHp,
      goldDelta: this.stats[0].gold - this.startGold[0],
      turns: this.turnNumber(),
      log: this.lines,
      stats: this.stats
    };
  };

  global.HIC_T = T;
  global.HIC_Battle = Battle;
  global.HIC_resolveBattle = function (player, foe, opts) { return new Battle(player, foe, opts).run(); };
})(window);
