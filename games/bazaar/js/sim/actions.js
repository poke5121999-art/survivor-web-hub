/* Chợ Phiên — ACTIONS (hành động của ability) và AURAS (tác dụng liên tục). CODE-COMBAT §3.10-3.12.
   Hành động: (act, ctx) với ctx = {S, card, ev, crit, fired, cache, cast}. Lượng lấy từ `ReferenceValue`/`Value` nếu có,
   không thì từ thuộc tính hiện tại của thẻ nguồn (TooltipComponentAbility.cs:222-244). */
(function (root) {
  'use strict';
  var BZ = root.BZSim = root.BZSim || {};
  var A = BZ.ACTIONS, AU = BZ.AURAS;
  var OPP = { $type: 'TTargetPlayerRelative', TargetMode: 'Opponent' };
  var ME = { $type: 'TTargetPlayerRelative', TargetMode: 'Self' };

  // Lượng của một hành động: tính một lần cho mọi lượt multicast (§1.5: cùng giá trị, cùng lần chí mạng)
  function amount(act, ctx, attr) {
    if (ctx.cache.has(act)) return ctx.cache.get(act);
    var v;
    if (act.ReferenceValue) v = BZ.value(act.ReferenceValue, ctx);
    else if (act.Value && typeof act.Value === 'object') v = BZ.value(act.Value, ctx);
    else v = attr ? (BZ.cattr(ctx.S, ctx.card, attr) || 0) : 0;
    if (ctx.crit && BZ.CRIT_ACTIONS[act.$type] && attr) { // [ĐỀ XUẤT] ×CritPercentMultiplier% (+ thuộc tính *Crit, vd DamageCrit)
      var bonus = BZ.cattr(ctx.S, ctx.card, attr.replace(/(Apply)?Amount$/, '') + 'Crit') || 0;
      v = v * (BZ.CRIT_PCT + bonus) / 100;
    }
    v = Math.round(v);
    ctx.cache.set(act, v);
    return v;
  }
  function count(act, ctx, attr) {
    if (act.TargetCount) return Math.max(0, Math.round(BZ.value(act.TargetCount, ctx)));
    if (!attr) return null;
    var n = BZ.cattr(ctx.S, ctx.card, attr);
    return n == null ? null : Math.max(0, Math.round(n));
  }
  function cards(act, ctx, attr, prios, filter) { return BZ.targets(act.Target, ctx, count(act, ctx, attr), prios, filter); }
  function players(act, ctx, def) { return BZ.targets(act.Target || def, ctx); }
  function uid(c) { return c ? c.uid : null; }
  function performed(ctx, kind, extra) {
    var ev = { card: ctx.card, src: ctx.card, side: ctx.card.owner };
    for (var k in extra) ev[k] = extra[k];
    BZ.emit(ctx.S, kind, ev);
  }
  function timed(ctx, act, undo) { // TCombatDuration: hết hạn thì hoàn lại (§3.12)
    var d = act.Duration;
    if (d && d.$type === 'TCombatDuration') BZ.addTimed(ctx.S, d.DurationInMs || 1000, undo);
  }

  // ---------- người chơi ----------
  A.TActionPlayerDamage = function (act, ctx) {
    var S = ctx.S, C = ctx.card, v = amount(act, ctx, 'DamageAmount');
    if (v <= 0) return;
    var crit = ctx.crit && ctx.fired;
    players(act, ctx, OPP).forEach(function (P) {
      BZ.hit(S, P, v, 'Damage', C, crit);
      var ls = BZ.cattr(S, C, 'Lifesteal') || 0; // dữ liệu: Lifesteal = 100 (%) — hồi theo sát thương trước khiên [ĐỀ XUẤT §1.7]
      if (ls > 0) BZ.heal(S, S.players[C.owner], v * Math.min(ls, 100) / 100, C, 'Lifesteal');
      performed(ctx, 'TTriggerOnCardPerformedDamage', { tplayer: P });
    });
  };
  A.TActionPlayerHeal = function (act, ctx) {
    var S = ctx.S, C = ctx.card, v = amount(act, ctx, 'HealAmount');
    if (v <= 0) return;
    players(act, ctx, ME).forEach(function (P) {
      var miss = Math.max(0, (BZ.pattr(S, P, 'HealthMax') || 0) - P.base.Health);
      BZ.heal(S, P, v, C, 'Heal', ctx.crit && ctx.fired);
      // tooltip Heal: "Cleanses 5% Poison and Burn" [ĐỀ XUẤT: làm tròn lên]
      var po = P.base.Poison || 0, bu = P.base.Burn || 0;
      if (po > 0) BZ.changePlayer(S, P, 'Poison', -Math.ceil(po * BZ.HEAL_CLEANSE), C);
      if (bu > 0) BZ.changePlayer(S, P, 'Burn', -Math.ceil(bu * BZ.HEAL_CLEANSE), C);
      performed(ctx, 'TTriggerOnCardPerformedHeal', { tplayer: P });
      if (v > miss) performed(ctx, 'TTriggerOnCardPerformedOverHeal', { tplayer: P });
    });
  };
  function statusApply(attr, amountAttr, kind, evType, def) {
    return function (act, ctx) {
      var S = ctx.S, C = ctx.card, v = amount(act, ctx, amountAttr);
      if (v <= 0) return;
      players(act, ctx, def).forEach(function (P) {
        BZ.log(S, { type: evType, src: uid(C), target: BZ.pid(P), amt: v, crit: !!(ctx.crit && ctx.fired) });
        BZ.changePlayer(S, P, attr, v, C);
        if (attr === 'HealthRegen') timed(ctx, act, function () { BZ.changePlayer(S, P, attr, -v, C); });
        performed(ctx, kind, { tplayer: P });
      });
    };
  }
  A.TActionPlayerShieldApply = statusApply('Shield', 'ShieldApplyAmount', 'TTriggerOnCardPerformedShield', 'shield', ME);
  A.TActionPlayerBurnApply = statusApply('Burn', 'BurnApplyAmount', 'TTriggerOnCardPerformedBurn', 'burn', OPP);
  A.TActionPlayerPoisonApply = statusApply('Poison', 'PoisonApplyAmount', 'TTriggerOnCardPerformedPoison', 'poison', OPP);
  A.TActionPlayerRegenApply = statusApply('HealthRegen', 'RegenApplyAmount', 'TTriggerOnCardPerformedRegen', 'regen', ME);
  function statusRemove(attr, amountAttr, evType) {
    return function (act, ctx) {
      var S = ctx.S, v = amount(act, ctx, amountAttr);
      if (v <= 0) return;
      players(act, ctx, ME).forEach(function (P) {
        var got = Math.min(P.base[attr] || 0, v);
        if (!got) return;
        BZ.log(S, { type: evType, attr: attr, src: uid(ctx.card), target: BZ.pid(P), amt: got });
        BZ.changePlayer(S, P, attr, -got, ctx.card);
      });
    };
  }
  A.TActionPlayerBurnRemove = statusRemove('Burn', 'BurnRemoveAmount', 'cleanse');
  A.TActionPlayerPoisonRemove = statusRemove('Poison', 'PoisonRemoveAmount', 'cleanse');
  A.TActionPlayerShieldRemove = statusRemove('Shield', 'ShieldRemoveAmount', 'cleanse');
  A.TActionPlayerRegenRemove = statusRemove('HealthRegen', 'RegenRemoveAmount', 'cleanse');
  A.TActionPlayerRageRemove = statusRemove('Rage', 'RageRemoveAmount', 'cleanse');
  A.TActionPlayerRageApply = function (act, ctx) {
    var v = amount(act, ctx, 'RageApplyAmount');
    if (v <= 0) return;
    players(act, ctx, ME).forEach(function (P) { BZ.addRage(ctx.S, P, v, ctx.card); });
  };
  A.TActionPlayerReviveHeal = function (act, ctx) { // "Heal to full" [ĐỀ XUẤT §1.12]
    var S = ctx.S;
    players(act, ctx, ME).forEach(function (P) {
      var mx = BZ.pattr(S, P, 'HealthMax') || 0, got = mx - P.base.Health;
      if (got <= 0) return;
      BZ.log(S, { type: 'heal', kind: 'Revive', src: uid(ctx.card), target: BZ.pid(P), amt: got });
      BZ.changePlayer(S, P, 'Health', got, ctx.card);
    });
  };
  A.TActionPlayerModifyAttribute = function (act, ctx) { // TActionPlayerModifyAttribute.cs:9-19
    var S = ctx.S, n = act.AttributeType, v = BZ.value(act.Value, ctx);
    players(act, ctx, ME).forEach(function (P) {
      var cur = P.base[n] || 0, d;
      switch (act.Operation || 'Add') {
        case 'Add': d = v; break;
        case 'Subtract': d = -v; break;
        case 'Multiply': d = BZ.roundAway(cur * v) - cur; break;
        default: BZ.noteUnknown(act.Operation, 'playerop'); return;
      }
      d = Math.round(d);
      if (!d) return;
      if (n === 'Rage') { if (d > 0) BZ.addRage(S, P, d, ctx.card); else BZ.changePlayer(S, P, n, d, ctx.card); return; }
      BZ.log(S, { type: 'attr', src: uid(ctx.card), target: BZ.pid(P), attr: n, amt: d, perm: !act.Duration });
      BZ.changePlayer(S, P, n, d, ctx.card);
      if (n === 'HealthMax' && d > 0) BZ.changePlayer(S, P, 'Health', d, ctx.card); // [ĐỀ XUẤT] tăng máu tối đa thì máu tăng theo
      timed(ctx, act, function () { BZ.changePlayer(S, P, n, -d, ctx.card); });
    });
  };

  // ---------- thẻ: trạng thái thời gian ----------
  function cardStatus(n, amountAttr, targetsAttr, redAttr, kind, evType) {
    return function (act, ctx) {
      var S = ctx.S, C = ctx.card, v = amount(act, ctx, amountAttr);
      if (v <= 0) return;
      cards(act, ctx, targetsAttr, BZ.PRIO.Status).forEach(function (T) {
        var pct = BZ.cattr(S, T, redAttr) || 0;
        var fly = (n !== 'Haste' && T.rt.Flying) ? 0.5 : 1; // tooltip Flying: Freeze/Slow chỉ còn một nửa
        var got = Math.round(v * Math.max(0, 1 - pct / 100) * fly);
        if (got <= 0) return;
        BZ.log(S, { type: evType, src: uid(C), target: T.uid, amt: got });
        BZ.setRt(S, T, n, (T.rt[n] || 0) + got, C); // cộng dồn [ĐỀ XUẤT §1.8]
        performed(ctx, kind, { tcard: T });
      });
    };
  }
  A.TActionCardHaste = cardStatus('Haste', 'HasteAmount', 'HasteTargets', 'PercentHasteReduction', 'TTriggerOnCardPerformedHaste', 'haste');
  A.TActionCardSlow = cardStatus('Slow', 'SlowAmount', 'SlowTargets', 'PercentSlowReduction', 'TTriggerOnCardPerformedSlow', 'slow');
  A.TActionCardFreeze = cardStatus('Freeze', 'FreezeAmount', 'FreezeTargets', 'PercentFreezeReduction', 'TTriggerOnCardPerformedFreeze', 'freeze');
  A.TActionCardCharge = function (act, ctx) { // tooltip Charge: "Immediately advances an item's Cooldown"
    var S = ctx.S, C = ctx.card, v = amount(act, ctx, 'ChargeAmount');
    if (v <= 0) return;
    cards(act, ctx, 'ChargeTargets', BZ.PRIO.Charge).forEach(function (T) {
      var max = BZ.effCooldown(S, T);
      if (max <= 0 || T.section !== 'hand') return;
      var got = Math.round(v * Math.max(0, 1 - (BZ.cattr(S, T, 'PercentChargeReduction') || 0) / 100));
      var before = T.cd;
      T.cd = Math.min(max, T.cd + got); // đủ thì bắn ở lượt thẻ kế tiếp
      BZ.log(S, { type: 'charge', src: uid(C), target: T.uid, amt: T.cd - before });
    });
  };
  A.TActionCardReload = function (act, ctx) {
    var S = ctx.S, C = ctx.card;
    var v = (act.Value && typeof act.Value === 'object') ? BZ.value(act.Value, ctx) : BZ.cattr(S, C, 'ReloadAmount');
    cards(act, ctx, 'ReloadTargets', BZ.PRIO.Reload).forEach(function (T) {
      if (!('Ammo' in T.rt)) return;
      var mx = BZ.cattr(S, T, 'AmmoMax') || 0, add = v == null ? mx : v; // thiếu ReloadAmount = nạp đầy [ĐỀ XUẤT]
      var nv = Math.min(mx, T.rt.Ammo + Math.round(add));
      if (nv <= T.rt.Ammo) return;
      BZ.log(S, { type: 'reload', src: uid(C), target: T.uid, amt: nv - T.rt.Ammo });
      BZ.setRt(S, T, 'Ammo', nv, C);
      performed(ctx, 'TTriggerOnCardPerformedReload', { tcard: T });
    });
  };
  A.TActionCardModifyAttribute = function (act, ctx) { // TActionCardModifyAttribute.cs:9-20
    var S = ctx.S, C = ctx.card, n = act.AttributeType, v = BZ.value(act.Value, ctx);
    if (!n) return;
    cards(act, ctx, null).forEach(function (T) {
      var d = BZ.changeCard(S, T, n, act.Operation || 'Add', v, C);
      if (!d) return;
      BZ.log(S, { type: 'attr', src: uid(C), target: T.uid, attr: n, amt: d, cur: BZ.cattr(S, T, n), perm: !act.Duration });
      timed(ctx, act, function () { BZ.changeCard(S, T, n, 'Add', -d, C); });
    });
  };
  function flying(mode) {
    return function (act, ctx) {
      var S = ctx.S, C = ctx.card;
      cards(act, ctx, 'FlyingTargets', null).forEach(function (T) {
        var on = mode === 'start' ? 1 : mode === 'stop' ? 0 : (T.rt.Flying ? 0 : 1);
        if ((T.rt.Flying ? 1 : 0) === on) return;
        BZ.log(S, { type: 'flying', on: !!on, src: uid(C), target: T.uid });
        BZ.setRt(S, T, 'Flying', on, C);
        BZ.emit(S, on ? 'TTriggerOnCardStartedFlying' : 'TTriggerOnCardStoppedFlying', { card: T, src: T, causer: C, side: T.owner });
        if (on) performed(ctx, 'TTriggerOnCardStartsFlying', { tcard: T });
      });
    };
  }
  A.TActionCardFlyingStart = flying('start');
  A.TActionCardFlyingStop = flying('stop');
  A.TActionCardFlyingToggle = flying('toggle');

  // ---------- thẻ: phá, sửa, dùng hộ, nâng bậc, yểm ----------
  function destroy(targetsAttr) { // Destroy và Disable như nhau (HintService.cs:1163+, Drone Crusher dùng Disable + OnBeforeCardDestroyed)
    return function (act, ctx) {
      var S = ctx.S, C = ctx.card;
      cards(act, ctx, targetsAttr, null).forEach(function (T) {
        if ((BZ.cattr(S, T, 'DestroyImmunity') || 0) > 0) { BZ.log(S, { type: 'immune', src: uid(C), target: T.uid }); return; }
        BZ.emit(S, 'TTriggerOnBeforeCardDestroyed', { card: T, src: C, tcard: T, causer: C, side: T.owner });
        if (T.state !== 'Alive') return;
        T.state = 'Destroyed'; T.cd = 0; S.dirty = true;
        BZ.log(S, { type: 'destroy', src: uid(C), target: T.uid });
        BZ.emit(S, 'TTriggerOnCardDisabled', { card: T, src: C, tcard: T, causer: C, side: T.owner });
        performed(ctx, 'TTriggerOnCardPerformedDestruction', { tcard: T });
      });
    };
  }
  A.TActionCardDestroy = destroy('DestroyTargets');
  A.TActionCardDisable = destroy('DisableTargets');
  A.TActionCardRepair = function (act, ctx) { // tooltip Repair: "Returns a destroyed item to normal"
    var S = ctx.S, C = ctx.card;
    cards(act, ctx, 'RepairTargets', null, ['Destroyed']).forEach(function (T) {
      T.state = 'Alive'; S.dirty = true;
      BZ.log(S, { type: 'repair', src: uid(C), target: T.uid });
      BZ.emit(S, 'TTriggerOnCardRepaired', { card: T, src: C, tcard: T, causer: C, side: T.owner });
    });
  };
  A.TActionCardForceUse = function (act, ctx) { // dùng ngay, không đụng cooldown; bỏ qua nếu đóng băng / không cooldown / hết đạn (:1087-1121)
    var S = ctx.S;
    cards(act, ctx, 'ForceUseTargets', BZ.PRIO.ForceUse).forEach(function (T) {
      if (T.rt.Freeze > 0 || BZ.effCooldown(S, T) <= 0) return;
      BZ.fire(S, T, true);
    });
  };
  A.TActionCardUpgrade = function (act, ctx) { // TActionCardUpgrade.cs:13-21
    var S = ctx.S, C = ctx.card;
    cards(act, ctx, 'UpgradeTargets', BZ.PRIO.Upgrade).forEach(function (T) {
      var nt = act.UpgradeToTier ? (BZ.tierIndex(act.UpgradeToTier) > BZ.tierIndex(T.tier) && T.tpl.Tiers[act.UpgradeToTier] ? act.UpgradeToTier : null) : BZ.nextTier(T.tpl, T.tier);
      if (!nt) return;
      var from = T.tier; T.tier = nt; BZ.rebuildCard(S, T);
      BZ.log(S, { type: 'upgrade', src: uid(C), target: T.uid, from: from, to: nt });
      BZ.emit(S, 'TTriggerOnCardUpgraded', { card: T, src: T, causer: C, side: T.owner });
    });
  };
  function enchant(T, E, ctx, act) {
    if (!E || !T.tpl.Enchantments || !T.tpl.Enchantments[E]) return false;
    if (act.PreventOverride && T.ench) return false;
    var from = T.ench; T.ench = E; BZ.rebuildCard(ctx.S, T);
    BZ.log(ctx.S, { type: 'enchant', src: uid(ctx.card), target: T.uid, from: from, to: E });
    return true;
  }
  A.TActionCardEnchant = function (act, ctx) {
    cards(act, ctx, 'EnchantTargets', null).forEach(function (T) { enchant(T, act.Enchantment, ctx, act); });
  };
  A.TActionCardEnchantRandom = function (act, ctx) { // chọn theo trọng số trong `Enchantments` (chỉ loại thẻ có)
    cards(act, ctx, 'EnchantTargets', null).forEach(function (T) {
      var opts = (act.Enchantments || []).filter(function (e) { return T.tpl.Enchantments && T.tpl.Enchantments[e.Enchantment] && e.Enchantment !== T.ench; });
      var tot = 0; opts.forEach(function (e) { tot += e.Weight || 0; });
      if (!opts.length || tot <= 0) return;
      var r = ctx.S.rng() * tot;
      for (var i = 0; i < opts.length; i++) { r -= opts[i].Weight || 0; if (r < 0 || i === opts.length - 1) { enchant(T, opts[i].Enchantment, ctx, act); break; } }
    });
  };
  A.TActionCardEnchantRemove = function (act, ctx) {
    cards(act, ctx, 'EnchantRemoveTargets', null).forEach(function (T) {
      if (!T.ench) return;
      var from = T.ench; T.ench = null; BZ.rebuildCard(ctx.S, T);
      BZ.log(ctx.S, { type: 'enchant', src: uid(ctx.card), target: T.uid, from: from, to: null });
    });
  };
  function transform(filter) { // SpawnContext (thẻ biến thành gì) bị máy chủ xoá → chỉ ghi sự kiện, thẻ giữ nguyên [ĐỀ XUẤT]
    return function (act, ctx) {
      BZ.noteApprox(act.$type);
      cards(act, ctx, 'TransformTargets', null, filter).forEach(function (T) {
        if (T.tier === 'Legendary') return; // "Legendaries cannot be transformed"
        BZ.log(ctx.S, { type: 'transform', src: uid(ctx.card), target: T.uid, into: null });
        BZ.emit(ctx.S, 'TTriggerOnCardTransformed', { card: T, src: T, causer: ctx.card, side: T.owner });
      });
    };
  }
  A.TActionCardTransform = transform(null);
  A.TActionCardTransformDestroyed = transform(['Destroyed']);
  A.TActionCardAddTagsList = function (act, ctx) {
    cards(act, ctx, null).forEach(function (T) { (act.Tags || []).forEach(function (t) { T.addTags[t] = 1; }); ctx.S.dirty = true; });
  };
  A.TActionCardAddTagsBySource = function (act, ctx) {
    var src = act.Source ? BZ.targets(act.Source, ctx) : [];
    cards(act, ctx, null).forEach(function (T) { src.forEach(function (s) { for (var t in s.tags) T.addTags[t] = 1; }); ctx.S.dirty = true; });
  };
  A.TActionCardAddTagsRandom = function (act, ctx) {
    var n = Math.round(BZ.value(act.Value, ctx)) || 1;
    cards(act, ctx, null).forEach(function (T) {
      var pool = (act.Tags || []).filter(function (t) { return !T.tags[t]; });
      for (var i = 0; i < n && pool.length; i++) T.addTags[pool.splice(ctx.S.rng.int(pool.length), 1)[0]] = 1;
      ctx.S.dirty = true;
    });
  };
  A.TActionCardRemoveTags = A.TActionCardRemoveTagsList = function (act, ctx) {
    cards(act, ctx, null).forEach(function (T) { (act.Tags || []).forEach(function (t) { delete T.addTags[t]; }); ctx.S.dirty = true; });
  };
  A.TActionCardBeginSandstorm = function (act, ctx) { if (!ctx.S.storm.active) ctx.S.storm.force = true; }; // "The Sandstorm Begins!"
  A.TActionAnd = function (act, ctx) { (act.Actions || []).forEach(function (a) { BZ.runAction(a, ctx); }); };
  A.TActionCardHeat = function (act, ctx) { cards(act, ctx, null).forEach(function (T) { BZ.changeCard(ctx.S, T, 'Heated', 'Add', 1, ctx.card); }); };
  A.TActionCardChill = function (act, ctx) { cards(act, ctx, null).forEach(function (T) { BZ.changeCard(ctx.S, T, 'Chilled', 'Add', 1, ctx.card); }); };
  // Hành động của vòng chơi / cửa hàng: không có nghĩa trong trận (CODE-COMBAT §3.10)
  ['TActionGameSpawnCards', 'TActionGameDealCards', 'TActionGameReroll', 'TActionExitReplacementSet',
    'TActionPlayerPortraitNext', 'TActionPlayerPortraitReset', 'TActionGameAddToExclusionSet',
    'TActionGameRemoveFromExclusionSet', 'TActionGameSetNextHourSpawnContext', 'TActionPlayerTempoApply',
    'TActionPlayerTempoRemove'].forEach(function (k) { A[k] = function () {}; });

  // ---------- AURAS ----------
  AU.TAuraActionCardModifyAttribute = function (a, ctx, acc) {
    var ts = BZ.targets(a.Target, ctx);
    if (!ts.length || !a.AttributeType) return;
    var v = BZ.value(a.Value, ctx);
    for (var i = 0; i < ts.length; i++) BZ.auraAcc(acc, ts[i], a.AttributeType, a.Operation, v);
  };
  AU.TAuraActionPlayerModifyAttribute = function (a, ctx, acc) {
    var ps = BZ.targets(a.Target || ME, ctx);
    if (!ps.length || !a.AttributeType) return;
    var v = BZ.value(a.Value, ctx);
    for (var i = 0; i < ps.length; i++) BZ.auraAcc(acc, ps[i], a.AttributeType, a.Operation, v);
  };
  function addTags(acc, T, tags) { var m = acc.tags[T.uid] || (acc.tags[T.uid] = {}); for (var t in tags) m[t] = 1; }
  AU.TAuraActionCardAddTagsList = function (a, ctx, acc) {
    var tg = {}; (a.Tags || []).forEach(function (t) { tg[t] = 1; });
    BZ.targets(a.Target, ctx).forEach(function (T) { addTags(acc, T, tg); });
  };
  AU.TAuraActionCardAddTagsBySource = function (a, ctx, acc) {
    var tg = {};
    (a.Source ? BZ.targets(a.Source, ctx) : []).forEach(function (s) { for (var t in s.tags) tg[t] = 1; });
    BZ.targets(a.Target, ctx).forEach(function (T) { addTags(acc, T, tg); });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BZ;
})(typeof window !== 'undefined' ? window : globalThis);
