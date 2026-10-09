/* Chợ Phiên — lõi mô phỏng combat: hằng số, RNG có seed, sổ đăng ký theo `$type`, tra thuộc tính theo bậc.
   Nguồn luật: D:\bazaar-ref\notes\CODE-COMBAT.md (trích `File.cs:line` của bản dịch ngược The Bazaar Demo).
   Chạy được cả trên trình duyệt (window.BZSim) lẫn Node (globalThis.BZSim, require). Không build. */
(function (root) {
  'use strict';
  var BZ = root.BZSim = root.BZSim || {};

  // §1.1 Hằng số
  BZ.FRAME_MS = 50;          // BazaarConstants.cs:23 skTimePerFrame
  BZ.MAX_MS = 120000;        // BazaarConstants.cs:25
  BZ.HASTE_MULT = 2;         // BazaarConstants.cs:27
  BZ.SLOW_MULT = 0.5;        // BazaarConstants.cs:29
  BZ.FREEZE_MULT = 0;        // BazaarConstants.cs:31
  BZ.POISON_REGEN_TICK = 1000; // BazaarCardDealer.cs:4214,4225
  BZ.BURN_TICK = 500;        // BazaarCardDealer.cs:4236
  // Số máy chủ đã xoá khỏi dữ liệu (TGameMode [BazaarObfuscate]) — đều là [ĐỀ XUẤT], chỉnh khi chơi thử.
  BZ.CRIT_PCT = 200;         // [ĐỀ XUẤT] CritPercentMultiplier (TGameMode.cs:46): tooltip "doubling"
  BZ.BURN_DECAY = 0.03;      // [ĐỀ XUẤT] BurnDecrementByAsPercentage (TGameMode.cs:64): tooltip "decreases by 3%"
  BZ.HEAL_CLEANSE = 0.05;    // [ĐỀ XUẤT] tooltip Heal "Cleanses 5% Poison and Burn"
  // Enrage giảm 10 % cooldown KHÔNG còn là hằng số ở đây: đến từ aura của hiệu ứng người chơi "Base Rage Effect"
  // (BZ_HEROES.effects, PercentCooldownReduction += Custom_0 = 10 khi Enraged > 0) — xem engine.js boardEffects.
  BZ.MIN_COOLDOWN = 1000;    // [ĐỀ XUẤT] sàn = trần 1/20 CooldownMax mỗi khung của bản legacy (BazaarCardDealer.cs:4414)
  BZ.RAGE_MAX = 100;         // tooltip Rage "Reach 100 Rage"
  BZ.ENRAGE_MS = 5000;       // [ĐỀ XUẤT] EnragedDurationMax mặc định: mọi quái có trường này đều để 5000 (monsters.json)
  BZ.SANDSTORM = {           // [ĐỀ XUẤT] TGameModeConfigSandstorm bị xoá; công thức BazaarCardDealer.cs:4247-4285
    countdownStart: 25000, countdown: 5000, baseDamage: 1, baseTick: 1000, tickDec: 100, tickFloor: 200, addScalar: 1
  };

  BZ.TIERS = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary'];
  BZ.PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest']; // PrioQueue.cs:38 cao → thấp; Immediate chạy đồng bộ
  BZ.SIZE = { Small: 1, Medium: 2, Large: 3 };
  // Thuộc tính tính bằng ms, hiển thị chia 1000 (TooltipExtensions.cs:51-66)
  BZ.MS_ATTRS = { Cooldown: 1, CooldownMax: 1, FlatCooldownReduction: 1, Haste: 1, Freeze: 1, Slow: 1,
    FreezeAmount: 1, SlowAmount: 1, HasteAmount: 1, ChargeAmount: 1 };
  // [ĐỀ XUẤT] Thuộc tính luôn có mặt (mặc định 0) trên mọi thẻ khi vào trận. Bằng chứng: dữ liệu lọc
  // "Flying == 0" (77 lần), "AmmoMax <= 0" (10 lần) để chỉ thẻ thường — chỉ đúng nếu máy chủ điền sẵn 0.
  BZ.DEFAULT_ZERO = { CooldownMax: 0, AmmoMax: 0, Flying: 0, Haste: 0, Slow: 0, Freeze: 0, Heated: 0, Chilled: 0,
    Lifesteal: 0, CritChance: 0, Multicast: 1 };
  // Hành động được nhân khi chí mạng (TCardConditionalCanCrit.cs:29-50)
  BZ.CRIT_ACTIONS = { TActionPlayerDamage: 1, TActionPlayerShieldApply: 1, TActionPlayerHeal: 1,
    TActionPlayerReviveHeal: 1, TActionPlayerBurnApply: 1, TActionPlayerPoisonApply: 1, TActionPlayerRegenApply: 1 };

  // Sổ đăng ký: mỗi `$type` một hàm nhỏ. Thêm loại mới = thêm một dòng.
  BZ.TRIGGERS = BZ.TRIGGERS || {};
  BZ.ACTIONS = BZ.ACTIONS || {};
  BZ.TARGETS = BZ.TARGETS || {};
  BZ.VALUES = BZ.VALUES || {};
  BZ.CONDS = BZ.CONDS || {};
  BZ.PREREQS = BZ.PREREQS || {};
  BZ.AURAS = BZ.AURAS || {};

  BZ.unknownTypes = BZ.unknownTypes || {};   // $type gặp mà chưa có trong sổ: đếm rồi bỏ qua
  BZ.approx = BZ.approx || {};               // $type đã biết nhưng thiếu dữ liệu (vd SpawnContext bị xoá): đếm
  BZ.errors = BZ.errors || [];               // lỗi bắt được giữa trận (không bao giờ ném ra ngoài)
  BZ.ran = BZ.ran || {};                     // số lần mỗi loại hành động đã chạy (để đo độ phủ)
  BZ.noteUnknown = function (type, where) {
    var k = (where ? where + ':' : '') + (type || '(none)');
    BZ.unknownTypes[k] = (BZ.unknownTypes[k] || 0) + 1;
  };
  BZ.noteApprox = function (type) { BZ.approx[type] = (BZ.approx[type] || 0) + 1; };
  BZ.resetStats = function () {
    BZ.unknownTypes = {}; BZ.approx = {}; BZ.errors = []; BZ.ran = {};
  };

  // RNG mulberry32: tất định theo seed; không dùng Math.random trong sim (§5)
  BZ.rng = function (seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    var f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = function (n) { return Math.floor(f() * n); }; // GetNumber(int max) ∈ [0, n)
    return f;
  };

  // EComparisonOperatorExtensions.cs
  BZ.compare = function (op, a, b) {
    switch (op || 'Equal') {
      case 'Equal': return a === b;
      case 'NotEqual': return a !== b;
      case 'GreaterThan': return a > b;
      case 'LessThan': return a < b;
      case 'GreaterThanOrEqual': return a >= b;
      case 'LessThanOrEqual': return a <= b;
    }
    BZ.noteUnknown(op, 'op');
    return false;
  };
  // Math.Round(v, MidpointRounding.AwayFromZero)
  BZ.roundAway = function (v) { return v < 0 ? -Math.round(-v) : Math.round(v); };
  // TValueModifier.GetRounded: (0,1) → 1
  BZ.roundMod = function (v) { return (v > 0 && v < 1) ? 1 : BZ.roundAway(v); };

  BZ.tpl = function (id) {
    var c = BZ.extraCards && BZ.extraCards[id];
    if (c) return c;
    var all = root.BZ_CARDS;
    if (all && all[id]) return all[id];
    // TCardSocketEffect (Stove/Cooler) và TCardPlayerEffect (Base Rage Effect…) nằm trong BZ_HEROES.effects, không ở BZ_CARDS
    var fx = root.BZ_HEROES && root.BZ_HEROES.effects;
    return fx ? fx[id] : undefined;
  };
  BZ.tierIndex = function (t) { var i = BZ.TIERS.indexOf(t); return i < 0 ? 0 : i; };
  // Legendary đọc như Diamond (TCardItem.cs:30) nếu thẻ có khối Diamond
  BZ.tierKey = function (tpl, tier) {
    if (tier === 'Legendary' && tpl.Tiers && tpl.Tiers.Diamond) return 'Diamond';
    return tier;
  };
  // Khối bậc hiện tại (AbilityIds/AuraIds/TooltipIds không kế thừa — TCardItem.cs:50-82).
  // Thiếu khối đúng bậc: lấy khối gần nhất phía dưới [ĐỀ XUẤT, phòng thẻ ghi bậc lạ].
  BZ.tierBlock = function (tpl, tier) {
    var T = tpl.Tiers || {};
    var k = BZ.tierKey(tpl, tier);
    if (T[k]) return T[k];
    for (var i = BZ.tierIndex(k); i >= 0; i--) if (T[BZ.TIERS[i]]) return T[BZ.TIERS[i]];
    for (var j = 0; j < BZ.TIERS.length; j++) if (T[BZ.TIERS[j]]) return T[BZ.TIERS[j]];
    return { Attributes: {}, AbilityIds: [], AuraIds: [], TooltipIds: [] };
  };
  // Thuộc tính kế thừa xuống: đi tier, tier-1, … tới StartingTier, khối thiếu giữa đường thì dừng (TCardItem.cs:33-48)
  BZ.tierAttrs = function (tpl, tier) {
    var T = tpl.Tiers || {}, out = {};
    var k = BZ.tierKey(tpl, tier);
    var start = BZ.tierIndex(BZ.tierKey(tpl, tpl.StartingTier || 'Bronze'));
    if (!T[k]) { // bậc không có trong thẻ: thấp hơn bậc khởi điểm → lấy bậc khởi điểm, cao hơn → bậc cao nhất có
      var have = BZ.TIERS.filter(function (t) { return T[t]; });
      k = BZ.tierIndex(k) < start ? (have[0] || k) : (have.pop() || k);
    }
    for (var i = BZ.tierIndex(k); i >= Math.min(start, BZ.tierIndex(k)); i--) {
      var b = T[BZ.TIERS[i]];
      if (!b) break;
      var a = b.Attributes || {};
      for (var n in a) if (!(n in out)) out[n] = a[n];
    }
    return out;
  };
  BZ.nextTier = function (tpl, tier) {
    var i = BZ.tierIndex(tier);
    if (i >= 3) return null; // GetNextTier dừng ở Diamond (Card.cs:594-597)
    var nt = BZ.TIERS[i + 1];
    return (tpl.Tiers && tpl.Tiers[nt]) ? nt : null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BZ;
})(typeof window !== 'undefined' ? window : globalThis);
