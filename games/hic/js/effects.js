/* Bảng hiệu ứng — mỗi vật phẩm / quái / lưỡi mài / bộ đồ có chữ mô tả trong
 * data/gamedata.js, và ở đây là phần chạy thật của chữ đó.
 *
 * WHY: chữ mô tả và luật chạy phải là HAI thứ tách nhau nhưng khớp nhau. Nếu
 * viết luật thẳng vào bảng dữ liệu thì không ai đối chiếu được với bản gốc nữa.
 * ROOT-CAUSE: bảng số lấy từ bản datamine, còn luật thì phải viết tay — trộn
 * chung một chỗ là mất đường truy ngược.
 * SEE: docs/proposals/he-is-coming-clone.md
 *
 * Vật phẩm Golden / Diamond dùng CHUNG luật với bản thường, chỉ khác hệ số
 * (c.m = 1 / 2 / 4). Đó là lý do tra hiệu ứng luôn cắt tiền tố tên trước.
 */
(function (global) {
  'use strict';

  var T = global.HIC_T;

  function on(trigger, fn) { var t = {}; t[trigger] = fn; return { triggers: t }; }
  function multi(triggers, fn) {
    var t = {};
    triggers.forEach(function (k) { t[k] = fn; });
    return { triggers: t };
  }
  function combine() {
    var out = { triggers: {} };
    for (var i = 0; i < arguments.length; i++) {
      var e = arguments[i];
      for (var k in (e.triggers || {})) out.triggers[k] = e.triggers[k];
      for (var p in e) if (p !== 'triggers') out[p] = e[p];
    }
    return out;
  }
  var onBattle = function (f) { return on(T.onBattle, f); };
  var onInitiative = function (f) { return on(T.onInitiative, f); };
  var onTurn = function (f) { return on(T.onTurn, f); };
  var onEndTurn = function (f) { return on(T.onEndTurn, f); };
  var onHit = function (f) { return on(T.onHit, f); };
  var onTakeDamage = function (f) { return on(T.onTakeDamage, f); };
  var onExposed = function (f) { return on(T.onExposed, f); };
  var onWounded = function (f) { return on(T.onWounded, f); };
  var onRestoreHealth = function (f) { return on(T.onRestoreHealth, f); };
  var onGainArmor = function (f) { return on(T.onGainArmor, f); };
  var onLoseArmor = function (f) { return on(T.onLoseArmor, f); };
  var onGainThorns = function (f) { return on(T.onGainThorns, f); };
  var onOverheal = function (f) { return on(T.onOverheal, f); };
  var onExposedAndWounded = function (f) { return multi([T.onExposed, T.onWounded], f); };
  var dynamicStats = function (f) { return { dynamicStats: f }; };
  var overrideStats = function (f) { return { overrideStats: f }; };

  function times(n, fn) { for (var i = 0; i < n; i++) fn(); }

  /* Một vài chỉ số là "có điều kiện": bật lên khi điều kiện đúng, tắt đi khi
     điều kiện sai, và KHÔNG cộng dồn.
     WHY: mỗi hiệu ứng tự ghi một cờ riêng thay vì đoán qua giá trị công hiện
     tại. Cách đoán chỉ đúng khi công gốc đã biết trước — nó sai ngay với người
     chơi, vì công của người chơi phụ thuộc vào cả túi đồ. */
  function conditionalAttack(bonus, cond) {
    return function (c) {
      var key = 'condAtk:' + c.src;
      var has = !!c.my.flags[key];
      var should = cond(c);
      if (has && !should) { c.loseAttack(bonus); c.my.flags[key] = false; }
      else if (!has && should) { c.gainAttack(bonus); c.my.flags[key] = true; }
    };
  }

  /* ------------------------------------------------------------------ items */

  var item = {
    /* --- phòng thủ / giáp --- */
    'Stone Steak': onBattle(function (c) { if (c.isHealthFull()) c.gainArmor(4); }),
    'Granite Gauntlet': onBattle(function (c) { c.gainArmor(5 * c.m); }),
    'Granite Cherry': combine(
      onBattle(function (c) { c.gainArmor(6); }),
      onExposed(function (c) { c.dealDamage(6); })),
    'Emergency Shield': onInitiative(function (c) { if (c.my.speed < c.enemy.speed) c.gainArmor(4 * c.m); }),
    'Cracked Bouldershield': onExposed(function (c) { c.gainArmor(5 * c.m); }),
    'Double-plated Armor': onExposed(function (c) { c.gainArmor(3 * c.m); }),
    // Chữ trên món là "giáp bằng giáp gốc"; bản mô phỏng cắm cứng số 3, và ở
    // đây chữ mới là luật — người chơi đọc chữ để quyết định, không đọc code.
    'Chain Mail': onWounded(function (c) { c.gainArmor(c.baseArmor()); }),
    'Marble Mirror': onBattle(function (c) { if (c.enemy.armor > 0) c.gainArmor(c.enemy.armor); }),
    'Ore Heart': onBattle(function (c) { c.gainArmor(c.tagCount('stone') * 2); }),
    'Ironskin Potion': onBattle(function (c) { if (c.lostHp() > 0) c.gainArmor(c.lostHp()); }),
    'Fortified Gauntlet': onTurn(function (c) { if (c.my.armor > 0) c.gainArmor(1); }),
    'Iron Transfusion': onTurn(function (c) { c.gainArmor(2); c.loseHealth(1); }),
    'Iron Rose': onRestoreHealth(function (c) { c.gainArmor(1); }),
    'Shield Talisman': onGainArmor(function (c) { c.gainArmor(1); }),
    'Sapphire Earring': onTurn(function (c) { if (c.isEveryOtherTurn) c.gainArmor(1 * c.m); }),
    'Sapphire Ring': onBattle(function (c) { c.stealArmor(2 * c.m); }),
    'Sapphire Gemstone': onLoseArmor(function (c) { c.restoreHealth(-c.armorDelta); }),
    'Plated Helmet': onTurn(function (c) { if (c.belowHalf()) c.gainArmor(2); }),
    'Plated Greaves': onExposed(function (c) {
      if (c.my.speed >= 3) { c.loseSpeed(3); c.gainArmor(9); }
    }),
    'Bloody Steak': onWounded(function (c) { c.gainArmor(Math.floor(c.my.maxHp / 2)); }),
    'Petrifying Flask': onWounded(function (c) { c.gainArmor(10 * c.m); c.stunSelf(2 * c.m); }),
    'Steelbond Curse': onBattle(function (c) { c.giveArmorToEnemy(8); }),
    'Featherweight Coat': onBattle(function (c) {
      if (c.my.armor > 0) { c.loseArmor(1); c.gainSpeed(3); }
    }),
    'Tempest Plate': onExposed(function (c) { if (c.baseArmor() > 0) c.gainSpeed(c.baseArmor()); }),
    'Brittlebark Armor': onTakeDamage(function (c) { c.takeDamage(1); }),
    'Brittlebark Buckler': on(T.onAfterEnemyStrike, function (c) {
      if (c.once('firstStrike')) c.loseArmor(c.my.armor);
    }),

    /* --- máu --- */
    'Redwood Cloak': onBattle(function (c) { if (!c.isHealthFull()) c.restoreHealth(1 * c.m); }),
    'Redwood Helmet': onExposed(function (c) { c.restoreHealth(3 * c.m); }),
    'Emerald Ring': onBattle(function (c) { c.restoreHealth(2 * c.m); }),
    'Emerald Earring': onTurn(function (c) { if (c.isEveryOtherTurn) c.restoreHealth(1 * c.m); }),
    'Emerald Gemstone': onOverheal(function (c) { c.dealDamage(c.overhealValue); }),
    'Vampiric Wine': onWounded(function (c) { c.restoreHealth(4 * c.m); }),
    'Tree Sap': onWounded(function (c) { times(5, function () { c.restoreHealth(1); }); }),
    'Crimson Cloak': onTakeDamage(function (c) { c.restoreHealth(1); }),
    'Sanguine Rose': onRestoreHealth(function (c) { c.restoreHealth(1); }),
    'Heart Drinker': onHit(function (c) { c.restoreHealth(1); }),
    'Heart-shaped Acorn': onBattle(function (c) { if (c.baseArmor() === 0) c.healToFull(); }),
    'Heart-shaped Potion': on(T.onHpChanged, function (c) {
      if (c.my.hp === 1 && c.once('atOne')) c.healToFull();
    }),
    'Saffron Feather': onTurn(function (c) {
      if (c.my.speed > 0) { c.loseSpeed(1 * c.m); c.restoreHealth(1 * c.m); }
    }),
    'Lifethread Pendant': on(T.onLethal, function (c) {
      // Resilience: một lần duy nhất, và chỉ 50% cơ hội.
      if (c.rng() < 0.5) { c.my.hp = 1; }
    }),

    /* --- gai --- */
    'Horned Helmet': onBattle(function (c) { c.gainThorns(2 * c.m); }),
    'Thorn Ring': onBattle(function (c) { c.gainThorns(6); }),
    'Briar Rose': onRestoreHealth(function (c) { c.gainThorns(2); }),
    'Razorvine Talisman': onGainThorns(function (c) { c.gainThorns(1); }),
    'Bramble Buckler': onTurn(function (c) {
      if (c.my.armor > 0) { c.loseArmor(1); c.gainThorns(2); }
    }),
    'Pinecone Plate': onTurn(function (c) { if (c.healthWasFullAtStart()) c.gainThorns(1); }),
    'Bloodmoon Ritual': onWounded(function (c) { c.gainThorns(10); c.takeDamage(2); }),
    'Razor Scales': onLoseArmor(function (c) { if (c.hasBeenExposed()) c.dealDamage(-c.armorDelta); }),
    'Blackbriar Blade': {
      triggers: (function () {
        var t = {};
        t[T.onGainThorns] = function (c) { c.gainAttack(c.thornsDelta * 2); };
        t[T.onLoseThorns] = function (c) { c.loseAttack(-c.thornsDelta * 2); };
        return t;
      })()
    },

    /* --- sát thương thẳng --- */
    'Ruby Earring': onTurn(function (c) { if (c.isEveryOtherTurn) c.dealDamage(1 * c.m); }),
    'Ruby Ring': onBattle(function (c) { c.gainAttack(1 * c.m); c.takeDamage(2 * c.m); }),
    'Ruby Gemstone': onHit(function (c) { if (c.my.attack === 1) c.dealDamage(4); }),
    'Citrine Ring': onBattle(function (c) { if (c.my.speed > 0) c.dealDamage(c.my.speed); }),
    'Citrine Earring': onTurn(function (c) { if (c.isEveryOtherTurn) c.gainSpeed(1 * c.m); }),
    'Citrine Gemstone': overrideStats(function (s) { return Object.assign({}, s, { speed: -s.speed }); }),
    'Cherry Bomb': onBattle(function (c) { c.dealDamage(2 * c.m); }),
    'Cherry Cocktail': multi([T.onBattle, T.onWounded], function (c) {
      c.dealDamage(3); c.restoreHealth(3);
    }),
    'Sugar Bomb': onTurn(function (c) { c.dealDamage(2); }),
    'Charcoal Roast': onBattle(function (c) { if (!c.isHealthFull()) c.dealDamage(4); }),
    'Firecracker Belt': onExposed(function (c) { times(3 * c.m, function () { c.dealDamage(1); }); }),
    'Explosive Surprise': onExposed(function (c) { c.dealDamage(5); }),
    'Explosive Sword': onExposedAndWounded(function (c) { c.dealDamage(3); }),
    'Lifeblood Burst': onWounded(function (c) { c.dealDamage(Math.floor(c.my.maxHp / 2)); }),
    'Assault Greaves': onTakeDamage(function (c) { c.dealDamage(1); }),
    'Time Bomb': onEndTurn(function (c) { if (c.b.turnNumber() === 5) c.dealDamage(15); }),
    'Sword Talisman': { nonWeaponBonus: 1 },

    /* --- công / tốc --- */
    'Leather Boots': onBattle(function (c) { if (c.my.speed > c.enemy.speed) c.gainAttack(2); }),
    'Granite Hammer': onHit(function (c) {
      if (c.my.armor > 0) { c.loseArmor(1); c.gainAttack(2); }
    }),
    'Stoneslab Sword': onHit(function (c) { c.gainArmor(2); }),
    'Melting Iceblade': onHit(function (c) { c.loseAttack(1); }),
    'Double-edged Sword': onHit(function (c) { c.takeDamage(1); }),
    'Mortal Edge': onWounded(function (c) { c.gainAttack(5); c.takeDamage(2); }),
    'Brittlebark Bow': onHit(function (c) { if (c.my.strikesMade === 2) c.loseAttack(2); }),
    'Brittlebark Club': onExposedAndWounded(function (c) { c.loseAttack(2); }),
    'Cracked Whetstone': {
      triggers: (function () {
        var t = {};
        t[T.onTurn] = function (c) { if (c.isFirstTurn) c.gainAttack(2 * c.m); };
        t[T.onEndTurn] = function (c) { if (c.isFirstTurn) c.loseAttack(2 * c.m); };
        return t;
      })()
    },
    'Ironstone Sandals': multi([T.onBattle, T.onGainArmor, T.onLoseArmor],
      conditionalAttack(3, function (c) { return c.my.armor > 0; })),
    'Battle Axe': { strikeMod: function () { return { doubleVsArmor: true }; } },
    'Haymaker': { strikeMod: function (c) { return c.everyNStrikes(3) ? { mult: 3 } : {}; } },
    'Hook Blade': on(T.onEnemyArmorChanged, function (c) {
      if (c.armorDelta < 0) c.gainArmor(-c.armorDelta);
    }),
    'Lifesteal Scythe': onHit(function (c) { c.restoreHealth(c.lastStrikeHpDamage); }),
    'Protecting Charm': {
      defendMod: function (c) {
        return c.my.flags['Protecting Charm:used'] ? {} : { mult: 0.5, firstOnly: true };
      },
      triggers: (function () {
        var t = {};
        t[T.onAfterEnemyStrike] = function (c) { c.my.flags['Protecting Charm:used'] = true; };
        return t;
      })()
    },
    'Titan’s Edge': {},

    /* --- choáng / nhát đánh thêm --- */
    'Sticky Web': onInitiative(function (c) { if (c.my.speed < c.enemy.speed) c.stunEnemy(1); }),
    'Impressive Physique': onExposed(function (c) { c.stunEnemy(1); }),
    'Stormcloud Spear': onHit(function (c) { if (c.everyNStrikes(5)) c.stunEnemy(2); }),
    'Swiftstrike Rapier': onInitiative(function (c) {
      if (c.my.speed > c.enemy.speed) { c.queueExtraStrike(); c.queueExtraStrike(); }
    }),
    'Swiftstrike Gauntlet': onWounded(function (c) { c.queueExtraStrike(); }),
    'Swiftstrike Cloak': onInitiative(function (c) {
      if (c.my.speed >= c.enemy.speed * 2) c.queueExtraStrike();
    }),
    'Bonespine Whip': onTurn(function (c) { c.queueExtraStrike(1); c.queueExtraStrike(1); }),
    'Energy Crystal': onInitiative(function (c) {
      if (c.my.speed > c.enemy.speed && c.once('spent')) { c.loseSpeed(2); c.triggerInitiative(); }
    }),
    'Rabbit Doll': onWounded(function (c) { c.triggerInitiative(); }),

    /* --- khác --- */
    'Gold Ring': onBattle(function (c) { c.gainGold(1); }),
    'Blacksmith Bond': onBattle(function (c) { c.addExtraExposed(1); }),
    'Blood Bond': on(T.onEnemyHpChanged, function (c) {
      if (c.enemyAtOrBelowHalf() && c.once('bond')) c.triggerWounded();
    }),
    'Bloodthief Needle': onInitiative(function (c) {
      if (c.my.speed > c.enemy.speed) c.stealMaxHealth(5);
    }),
    'Gemstone Scepter': {
      triggers: (function () {
        var t = {};
        t[T.onHit] = function (c) {
          times(c.gemCount('emerald'), function () { c.restoreHealth(1); });
          times(c.gemCount('ruby'), function () { c.dealDamage(1); });
          times(c.gemCount('sapphire'), function () { c.gainArmor(1); });
        };
        t[T.onBattle] = function (c) {
          times(c.gemCount('citrine'), function () { c.queueExtraStrike(); });
        };
        return t;
      })()
    },

    /* --- chỉ số động (tính lại mỗi khi mở túi đồ) --- */
    'Oak Heart': dynamicStats(function (inv) { return { maxHp: inv.tagCount('wood') * 2 }; }),
    'Woodcutter’s Axe': dynamicStats(function (inv) { return { attack: inv.emptySlots * 2 }; }),
    'Bejeweled Blade': dynamicStats(function (inv) { return { attack: inv.tagCount('jewelry') * 2 }; }),
    'Honey Ham': overrideStats(function (s) { return Object.assign({}, s, { maxHp: s.maxHp * 2 }); }),
    'Tempest Blade': overrideStats(function (s) { return Object.assign({}, s, { attack: s.speed }); }),
    'Bearclaw Blade': combine(
      { dynamicStats: function (inv) { return { attack: inv.lostHp }; } },
      on(T.onHpChanged, function (c) { c.adjustAttack(-c.hpDelta); }))
  };

  // Tên trong bảng dữ liệu dùng dấu nháy thẳng; hai dòng dưới nối lại cho khớp.
  item["Woodcutter's Axe"] = item['Woodcutter’s Axe'];
  item["Titan's Edge"] = item['Titan’s Edge'];

  // "Chỉ đánh cách lượt, nhưng sát thương gấp đôi."
  item["Titan's Edge"] = {
    skipStrike: function (c) { return !c.isEveryOtherTurn; },
    strikeMod: function () { return { mult: 2 }; }
  };

  /* --------------------------------------------------------------- creatures */

  function spider(dmg) {
    return onBattle(function (c) { if (c.my.speed > c.enemy.speed) c.dealDamage(dmg); });
  }
  function bat(hp) {
    return onHit(function (c) { if (c.isEveryOtherTurn) c.restoreHealth(hp); });
  }
  function hedgehog(t) { return onBattle(function (c) { c.gainThorns(t); }); }
  function wolf(bonus) {
    return multi([T.onBattle, T.onEnemyHpChanged],
      conditionalAttack(bonus, function (c) { return c.enemy.hp <= 5; }));
  }
  function bear(bonus) {
    return multi([T.onBattle, T.onEnemyArmorChanged],
      conditionalAttack(bonus, function (c) { return c.enemy.armor > 0; }));
  }

  var creature = {
    'Spider Level 1': spider(3), 'Spider Level 2': spider(4), 'Spider Level 3': spider(5),
    'Bat Level 1': bat(1), 'Bat Level 2': bat(2), 'Bat Level 3': bat(3),
    'Hedgehog Level 1': hedgehog(3), 'Hedgehog Level 2': hedgehog(4), 'Hedgehog Level 3': hedgehog(5),
    'Wolf Level 1': wolf(2), 'Wolf Level 2': wolf(3), 'Wolf Level 3': wolf(4),
    'Bear Level 1': bear(3), 'Bear Level 2': bear(5), 'Bear Level 3': bear(7),
    'Crazed Honeybear Level 2': bear(4), 'Crazed Honeybear Level 3': bear(5),
    'Raven Level 2': { strikeMod: function () { return { stealGold: true }; } },
    'Woodland Abomination': onTurn(function (c) { if (!c.isFirstTurn) c.gainAttack(1); }),
    'Black Knight': onBattle(function (c) { if (c.enemy.attack > 0) c.gainAttack(c.enemy.attack); }),
    'Ironstone Golem': onExposed(function (c) { c.loseAttack(3); }),
    'Granite Griffin': onWounded(function (c) { c.gainArmor(30); c.stunSelf(2); }),
    'Razortusk Hog': onTurn(function (c) { if (c.hadMoreSpeedAtStart()) c.queueExtraStrike(); }),
    'Gentle Giant': onTakeDamage(function (c) { c.gainThorns(c.atOrBelowHalf() ? 4 : 2); }),
    'Bloodmoon Werewolf': onTurn(function (c) { if (c.enemyAtOrBelowHalf()) c.executeEnemy(); }),
    'Brittlebark Beast': onTakeDamage(function (c) { c.takeDamage(3); }),
    'Bearserker': { strikeMod: function () { return { ignoreArmor: true }; } },
    'Redwood Treant': { strikeMod: function () { return { halveVsArmor: true }; } },
    'Mountain Troll': { skipStrike: function (c) { return !c.isEveryOtherTurn; } },
    /* "Nhát đánh ĐẦU TIÊN gây thêm 10" — nên nó phải bám vào nhát đánh, không
       phải vào lượt. Gắn vào lượt thì hắn còn giữ nguyên phần cộng thêm sang
       nhát thứ hai, vì cuối lượt đầu của hắn thì vẫn đang là lượt thứ nhất. */
    'Hothead': {
      strikeMod: function (c) {
        return (c.my.strikesMade === 0 && c.my.speed > c.enemy.speed) ? { bonus: 10 } : {};
      }
    },
    'Stormcloud Druid': onTakeDamage(function (c) {
      if (c.my.damageThisTurn > 1 && c.once('turn' + c.b.turnNumber())) c.stunEnemy(1);
    })
  };

  /* ------------------------------------------------------------------ edges */

  var edge = {
    'Bleeding Edge': onHit(function (c) { c.restoreHealth(1); }),
    'Blunt Edge': onHit(function (c) { c.gainArmor(1); }),
    'Lightning Edge': onBattle(function (c) { c.stunEnemy(1); }),
    'Thieving Edge': onHit(function (c) { if (c.my.gold < 10) c.gainGold(1); }),
    'Jagged Edge': onHit(function (c) { c.gainThorns(2); c.takeDamage(1); }),
    'Cutting Edge': onHit(function (c) { c.dealDamage(1); }),
    'Agile Edge': onBattle(function (c) { c.queueExtraStrike(); }),
    'Featherweight Edge': onHit(function (c) {
      if (c.my.speed > 0) { c.loseSpeed(1); c.gainAttack(1); }
    }),
    "Titan's Edge": {
      skipStrike: function (c) { return !c.isEveryOtherTurn; },
      strikeMod: function () { return { mult: 2 }; }
    }
  };

  /* ------------------------------------------------------------------- sets */

  var set = {
    'Redwood Crown': onWounded(function (c) { c.healToFull(); }),
    'Raw Hide': onTurn(function (c) { if (c.isEveryOtherTurn) c.gainAttack(1); }),
    'Briar Greaves': onTakeDamage(function (c) { c.gainThorns(1); }),
    'Stone Scales': onWounded(function (c) { c.gainArmor(10); }),
    'Elderwood Mask': onBattle(function (c) {
      var b = c.baseStats(), v = b.attack || 0;
      if (v === (b.armor || 0) && v === (b.speed || 0) && v > 0) {
        c.gainAttack(v); c.gainArmor(v); c.gainSpeed(v);
      }
    })
  };

  global.HIC_EFFECTS = { item: item, creature: creature, edge: edge, set: set };

  global.HIC_gemOf = function (it) {
    var parts = it.name.toLowerCase().split(' ');
    var gems = ['ruby', 'sapphire', 'emerald', 'citrine'];
    for (var i = 0; i < gems.length; i++) if (parts.indexOf(gems[i]) >= 0) return gems[i];
    return null;
  };
})(window);
