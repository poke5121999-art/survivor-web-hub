/* Chợ Phiên — chữ tooltip và thuộc tính cho giao diện. Bám bộ giải `{ability.x}` của client (CODE-COMBAT §4.4,
   TooltipComponent.cs:82-122, TooltipComponentAbility.cs:124-244, TooltipComponentAura.cs:123-157). */
(function (root) {
  'use strict';
  var BZ = root.BZSim = root.BZSim || {};

  var TARGETS_ATTR = { TActionCardCharge: 'ChargeTargets', TActionCardDestroy: 'DestroyTargets', TActionCardDisable: 'DisableTargets',
    TActionCardForceUse: 'ForceUseTargets', TActionCardFreeze: 'FreezeTargets', TActionCardHaste: 'HasteTargets',
    TActionCardReload: 'ReloadTargets', TActionCardRepair: 'RepairTargets', TActionCardSlow: 'SlowTargets',
    TActionCardTransform: 'TransformTargets', TActionCardTransformDestroyed: 'TransformTargets', TActionCardUpgrade: 'UpgradeTargets',
    TActionCardFlyingStart: 'FlyingTargets', TActionCardFlyingStop: 'FlyingTargets', TActionCardFlyingToggle: 'FlyingTargets' };
  var AMOUNT_ATTR = { TActionCardCharge: 'ChargeAmount', TActionCardFreeze: 'FreezeAmount', TActionCardHaste: 'HasteAmount',
    TActionCardReload: 'ReloadAmount', TActionCardSlow: 'SlowAmount', TActionPlayerBurnApply: 'BurnApplyAmount',
    TActionPlayerBurnRemove: 'BurnRemoveAmount', TActionPlayerDamage: 'DamageAmount', TActionPlayerHeal: 'HealAmount',
    TActionPlayerPoisonApply: 'PoisonApplyAmount', TActionPlayerPoisonRemove: 'PoisonRemoveAmount', TActionPlayerRegenApply: 'RegenApplyAmount',
    TActionPlayerRegenRemove: 'RegenRemoveAmount', TActionPlayerRageApply: 'RageApplyAmount', TActionPlayerRageRemove: 'RageRemoveAmount',
    TActionPlayerShieldApply: 'ShieldApplyAmount', TActionPlayerShieldRemove: 'ShieldRemoveAmount' };
  BZ.AMOUNT_ATTR = AMOUNT_ATTR; BZ.TARGETS_ATTR = TARGETS_ATTR;

  // Trạng thái chỉ có một thẻ (hoặc thẻ nằm trong bàn ctx.board) để tính aura như lúc vào trận
  function stateFor(ci, ctx) {
    var boards = [{ name: 'tip', healthMax: 100, cards: [] }, { name: 'tip2', healthMax: 100, cards: [] }];
    if (ctx && ctx.boards) boards = ctx.boards;
    else if (ctx && ctx.board) boards = [ctx.board, { name: 'opp', healthMax: 100, cards: [] }];
    else boards[0].cards = [ci];
    var S = BZ.makeState({ boards: boards, seed: 1, sandstorm: false });
    BZ.initState(S);
    var C = null;
    S.cards.forEach(function (c) { if (c.uid === ci.uid) C = c; });
    if (!C) { // thẻ không nằm trong bàn ctx: đặt riêng
      S = BZ.makeState({ boards: [{ name: 'tip', healthMax: 100, cards: [ci] }, { cards: [] }], seed: 1, sandstorm: false });
      BZ.initState(S); C = S.cards[0];
    }
    return { S: S, C: C };
  }
  // Thuộc tính đã tính (bậc + enchantment + aura) của một thẻ: {CooldownMax, DamageAmount, ...}
  BZ.attrs = function (ci, ctx) {
    var x = stateFor(ci, ctx);
    if (!x.C) return {};
    var out = {}, k;
    for (k in x.C.attrs) out[k] = x.C.attrs[k];
    for (k in x.C.rt) out[k] = x.C.rt[k];
    out.CooldownEffective = BZ.effCooldown(x.S, x.C);
    return out;
  };

  function findIn(maps, id) { for (var i = 0; i < maps.length; i++) if (maps[i] && maps[i][id]) return maps[i][id]; return null; }
  function questMaps(tpl, key) {
    var o = [];
    (tpl.Quests || []).forEach(function (g) { (g.Entries || []).forEach(function (e) { if (e.Reward) o.push(e.Reward[key]); if (key === 'Abilities') o.push(e.CompletionEffects); }); });
    return o;
  }
  function modifyValue(act) {
    if (!act) return null;
    if (act.$type === 'TActionCardModifyAttribute' || act.$type === 'TActionPlayerModifyAttribute' ||
      act.$type === 'TAuraActionCardModifyAttribute' || act.$type === 'TAuraActionPlayerModifyAttribute') return act.Value || null;
    return null;
  }
  function refAttr(v) { return v && /^TReferenceValueCardAttribute/.test(v.$type || '') ? v.AttributeType : null; }
  function fmt(n, attr) {
    if (n == null || !isFinite(n)) return null;
    if (attr && BZ.MS_ATTRS[attr]) n = n / 1000;
    var r = Math.round(n * 100) / 100;
    return String(r);
  }
  function resolveAbility(S, C, id, acc) {
    var E = C.ench && C.tpl.Enchantments ? C.tpl.Enchantments[C.ench] : null;
    var A = findIn([E && E.Abilities].concat(questMaps(C.tpl, 'Abilities'), [C.tpl.Abilities]), id);
    if (!A || !A.Action) return null;
    var act = A.Action, ctx = { S: S, card: C, ev: null }, mv = modifyValue(act), ra;
    if (acc === 'targets') { ra = TARGETS_ATTR[act.$type]; return fmt(ra ? BZ.cattr(S, C, ra) || 0 : 0); }
    if (acc === 'mod') return mv && mv.Modifier ? fmt(BZ.value(mv.Modifier.Value, ctx)) : null;
    if (acc === 'ref') return mv ? fmt(BZ.value(mv, ctx, true), refAttr(mv)) : null;
    if (mv) return fmt(BZ.value(mv, ctx), refAttr(mv));
    if (act.$type === 'TActionGameDealCards' || act.$type === 'TActionGameSpawnCards') {
      var sc = act.SpawnContext; return fmt(sc && sc.Limit ? BZ.value(sc.Limit, ctx) : 0);
    }
    if (act.$type === 'TActionGameReroll') return fmt(act.SpawnCount || 0);
    ra = AMOUNT_ATTR[act.$type];
    return fmt(ra ? BZ.cattr(S, C, ra) || 0 : 0, ra);
  }
  function resolveAura(S, C, id, acc) {
    var E = C.ench && C.tpl.Enchantments ? C.tpl.Enchantments[C.ench] : null;
    var Au = findIn([E && E.Auras].concat(questMaps(C.tpl, 'Auras'), [C.tpl.Auras]), id);
    if (!Au || !Au.Action) return null;
    var ctx = { S: S, card: C, ev: null }, mv = modifyValue(Au.Action);
    if (acc === 'targets') return null;
    if (acc === 'mod') return mv && mv.Modifier ? fmt(BZ.value(mv.Modifier.Value, ctx)) : null;
    if (acc === 'ref') return mv ? fmt(BZ.value(mv, ctx, true), refAttr(mv)) : null;
    return mv ? fmt(BZ.value(mv, ctx), refAttr(mv)) : '0';
  }
  function resolveToken(S, C, tok) {
    var alts = tok.split('??');
    for (var i = 0; i < alts.length; i++) {
      var p = alts[i].trim().split('.'), r = null;
      if (p[0] === 'ability') r = resolveAbility(S, C, p[1], p[2]);
      else if (p[0] === 'aura') r = resolveAura(S, C, p[1], p[2]);
      else if (p.length === 1 && p[0]) { var v = BZ.cattr(S, C, p[0]); r = v == null ? null : fmt(v, p[0]); }
      if (r != null) return r;
    }
    return '';
  }
  BZ.resolveText = function (S, C, text) {
    return String(text || '').replace(/\{([^{}]+)\}/g, function (m, tok) { return resolveToken(S, C, tok); }).replace(/ {2,}/g, ' ');
  };
  // Dòng tooltip của thẻ: [{text, type ('Active'|'Passive'), raw}] — bậc hiện tại (TooltipIds) + enchantment
  BZ.cardText = function (ci, ctx) {
    var x = stateFor(ci, ctx), C = x.C;
    if (!C) return [];
    var tips = (C.tpl.Localization && C.tpl.Localization.Tooltips) || [], out = [];
    var block = BZ.tierBlock(C.tpl, C.tier);
    (block.TooltipIds || tips.map(function (_, i) { return i; })).forEach(function (i) {
      var t = tips[i]; if (!t || !t.Content) return;
      out.push({ text: BZ.resolveText(x.S, C, t.Content.Text), type: t.TooltipType || 'Active', raw: t.Content.Text });
    });
    var E = C.ench && C.tpl.Enchantments ? C.tpl.Enchantments[C.ench] : null;
    ((E && E.Localization && E.Localization.Tooltips) || []).forEach(function (t) {
      if (!t.Content) return;
      out.push({ text: BZ.resolveText(x.S, C, t.Content.Text), type: t.TooltipType || 'Active', raw: t.Content.Text, ench: C.ench });
    });
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BZ;
})(typeof window !== 'undefined' ? window : globalThis);
