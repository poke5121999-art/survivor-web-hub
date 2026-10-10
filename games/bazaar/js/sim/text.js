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
    if (mv) return fmt(BZ.value(mv, ctx), refAttr(mv) || act.AttributeType);
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
    return mv ? fmt(BZ.value(mv, ctx), refAttr(mv) || Au.Action.AttributeType) : '0';
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
  // Chữ gốc "Your Medium items have +{aura.0}" kết thúc ngay sau con số: client vẽ biểu tượng của chỉ số sau số (Shield...);
  // bản web không có biểu tượng trong chữ nên thêm tên chỉ số để câu không cụt [FLOW-4]. Chỉ khi số đứng cuối dòng sau "+" / "gain".
  var ATTR_WORD = { ShieldApplyAmount: 'Shield', DamageAmount: 'Damage', HealAmount: 'Heal', BurnApplyAmount: 'Burn',
    PoisonApplyAmount: 'Poison', RegenApplyAmount: 'Regen', CritChance: 'Crit Chance' };
  function tokenAttr(C, tok) {
    var p = tok.trim().split('.'), E = C.ench && C.tpl.Enchantments ? C.tpl.Enchantments[C.ench] : null, X;
    if (p.length !== 2) return null;
    if (p[0] === 'aura') X = findIn([E && E.Auras].concat(questMaps(C.tpl, 'Auras'), [C.tpl.Auras]), p[1]);
    else if (p[0] === 'ability') X = findIn([E && E.Abilities].concat(questMaps(C.tpl, 'Abilities'), [C.tpl.Abilities]), p[1]);
    return X && X.Action && ATTR_WORD[X.Action.AttributeType] || null;
  }
  BZ.resolveText = function (S, C, text) {
    return String(text || '').replace(/\{([^{}]+)\}/g, function (m, tok, off, str) {
      var r = resolveToken(S, C, tok), w;
      if (r && /(\+|gains?\s)$/i.test(str.slice(0, off)) && /^\s*($|\n)/.test(str.slice(off + m.length)) && (w = tokenAttr(C, tok))) r += ' ' + w;
      return r;
    }).replace(/ {2,}/g, ' ').replace(/\b(\d+) ((?:random )?)type\(s\)/g, function (m, n, mid) { return n + ' ' + mid + (+n === 1 ? 'type' : 'types'); }); // chỉ "type(s)" của Mysterious Crystal (các "second(s)" khác giữ nguyên chữ gốc)
  };
  // ---------- chữ của thẻ GẶP GỠ (sự kiện / bước / thương nhân / bệ): "Gain {ability.0} XP", "+{aura.3} Value" ----------
  // e = bản ghi BZ_ENCOUNTERS (Abilities); S, card = trạng thái sim và thẻ giả của gặp gỡ (để đọc số tham chiếu như "số thẻ Weapon");
  // auras = {chỉ số: số} do vòng chơi cấp (data/encounters.js chưa chở Auras). Không tính ra được thì "?" chứ không để thô dấu ngoặc.
  // Hành động trừ ("Lose {ability.0} Income") lưu số âm → hiện trị tuyệt đối.
  function encRange(v) {
    if (v && v.$type === 'TRangeValue') {
      var a = Math.round(v.MinValue || 0), b = Math.round(v.MaxValue || 0);
      return a === b ? String(a) : a + '-' + b;
    }
    return null;
  }
  function encAbilityNumber(S, card, e, id, acc) {
    var A = e && e.Abilities && e.Abilities[id], act = A && A.Action;
    if (!act || acc === 'targets') return null;
    var ctx = { S: S, card: card, ev: null }, v = modifyValue(act), r;
    if (act.$type === 'TActionGameDealCards' || act.$type === 'TActionGameSpawnCards') {
      var sc = act.SpawnContext && act.SpawnContext.Limit;
      return sc ? (encRange(sc) || fmt(BZ.value(sc, ctx))) : null;
    }
    if (act.$type === 'TActionGameReroll') return fmt(act.SpawnCount || 0);
    if (!v) return null;
    if (acc === 'mod') return v.Modifier ? fmt(Math.abs(BZ.value(v.Modifier.Value, ctx))) : null; // "{ability.0.mod} Gold for each ..."
    r = encRange(v);
    if (r) return r;
    return fmt(Math.abs(BZ.value(v, ctx)), refAttr(v) || act.AttributeType);
  }
  BZ.encounterText = function (S, card, e, text, auras) {
    return String(text == null ? '' : text).replace(/\{([^{}]+)\}/g, function (m, tok) {
      var p = tok.trim().split('.'), r = null;
      if (p[0] === 'ability') r = encAbilityNumber(S, card, e, p[1], p[2]);
      else if (p[0] === 'aura' && auras && auras[p[1]] != null) r = String(auras[p[1]]);
      return r == null ? '?' : r;
    }).replace(/ {2,}/g, ' ');
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
