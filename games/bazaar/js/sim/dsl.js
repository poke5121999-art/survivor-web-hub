/* Chợ Phiên — DSL dùng chung: VALUES (giá trị), CONDS (điều kiện thẻ/người chơi/run), PREREQS (tiền đề), TARGETS (chọn đích).
   Bám code thật của BazaarGameShared (CODE-COMBAT §3.5, §3.7-3.9). ctx = {S, card (thẻ đang nhắm), ev (sự kiện kích), candidate}. */
(function (root) {
  'use strict';
  var BZ = root.BZSim = root.BZSim || {};
  var V = BZ.VALUES, C = BZ.CONDS, P = BZ.PREREQS, T = BZ.TARGETS;

  // ---------- truy cập trạng thái ----------
  BZ.cattr = function (S, card, name) {          // thuộc tính hiện tại (đã cộng aura); undefined nếu thẻ không có
    if (!card) return undefined;
    if (name in card.rt) return card.rt[name];   // Haste/Slow/Freeze/Ammo/Flying: trạng thái chạy, aura không chạm
    if (S && S.dirty && !S.computing) BZ.recompute(S);
    return card.attrs[name];
  };
  BZ.cunscaled = function (S, card, name) {      // trước bước nhân của aura [ĐỀ XUẤT §3.11]
    if (!card) return undefined;
    if (name in card.rt) return card.rt[name];
    if (S && S.dirty && !S.computing) BZ.recompute(S);
    return card.un[name];
  };
  BZ.pattr = function (S, pl, name) {
    if (!pl) return undefined;
    if (S && S.dirty && !S.computing) BZ.recompute(S);
    return pl.touched && pl.touched[name] ? pl.attrs[name] : pl.base[name]; // aura không chạm → đọc thẳng giá trị gốc
  };
  BZ.hasTag = function (S, card, tag) { if (S && S.dirty && !S.computing) BZ.recompute(S); return !!card.tags[tag]; };
  BZ.hasHidden = function (S, card, tag) { if (S && S.dirty && !S.computing) BZ.recompute(S); return !!card.hidden[tag]; };

  function alive(card, filter) { return filter ? filter.indexOf(card.state) >= 0 : card.state === 'Alive'; }
  BZ.stateOk = alive;
  function list(arr, filter) { var o = []; for (var i = 0; i < arr.length; i++) if (alive(arr[i], filter)) o.push(arr[i]); return o; }

  // TargetSystem.cs:444-664. owner = chủ thẻ đang nhắm; người chơi tuyệt đối = bàn 0, đối thủ tuyệt đối = bàn 1.
  BZ.section = function (S, name, card, ev, filter) {
    var me = card ? card.owner : 0, P0 = S.players[me], P1 = S.players[1 - me], A = S.players[0], B = S.players[1];
    switch (name) {
      case 'SelfHand': return list(P0.hand, filter);
      case 'SelfStash': return list(P0.stash, filter);
      case 'SelfHandAndStash': return list(P0.hand.concat(P0.stash), filter);
      case 'SelfSkills': return list(P0.skills, filter);
      case 'SelfBoard': return list(P0.hand.concat(P0.stash, P0.skills), filter);
      case 'OpponentHand': return list(P1.hand, filter);
      case 'OpponentStash': return list(P1.stash, filter);
      case 'OpponentHandAndStash': return list(P1.hand.concat(P1.stash), filter);
      case 'OpponentSkills': return list(P1.skills, filter);
      case 'OpponentBoard': return list(P1.hand.concat(P1.stash, P1.skills), filter);
      case 'AllHands': return list(B.hand.concat(A.hand), filter);            // đối thủ trước (:444-448)
      case 'AllStashes': return list(B.stash.concat(A.stash), filter);
      case 'AllHandsAndStashes': return list(B.hand.concat(A.hand, B.stash, A.stash), filter);
      case 'AllBoards': return list(A.hand.concat(A.stash, A.skills, B.hand, B.stash, B.skills), filter);
      case 'AllHandsAndSkills': return list(A.hand.concat(A.skills, B.hand, B.skills), filter);
      case 'AbsolutePlayerHand': return list(A.hand, filter);
      case 'AbsolutePlayerStash': return list(A.stash, filter);
      case 'AbsolutePlayerHandAndStash': return list(A.hand.concat(A.stash), filter);
      case 'AbsolutePlayerSkills': return list(A.skills, filter);
      case 'AbsoluteOpponentHand': return list(B.hand, filter);
      case 'AbsoluteOpponentStash': return list(B.stash, filter);
      case 'AbsoluteOpponentHandAndStash': return list(B.hand.concat(B.stash), filter);
      case 'SelfNeighbors': return card ? BZ.neighbors(S, card, filter) : [];
      case 'TriggerSourceNeighbors': return ev && ev.src ? BZ.neighbors(S, ev.src, filter) : [];
      // Ô hiệu ứng (TargetSystem.cs:473-507): All = đối thủ của người chơi tuyệt đối trước, rồi người chơi
      case 'SelfSocketEffects': return list(P0.sockets || [], filter);
      case 'OpponentSocketEffects': return list(P1.sockets || [], filter);
      case 'AllSocketEffects': return list((B.sockets || []).concat(A.sockets || []), filter);
      case 'AbsolutePlayerSocketEffects': return list(A.sockets || [], filter);
      case 'SelectionSet': return []; // món đang bày bán: ngoài trận
    }
    BZ.noteUnknown(name, 'section');
    return [];
  };
  function container(S, card) { var pl = S.players[card.owner]; return pl[card.section] || []; }
  function covering(S, card, socket) {
    var arr = container(S, card);
    for (var i = 0; i < arr.length; i++) { var o = arr[i]; if (socket >= o.socket && socket < o.socket + o.size) return o; }
    return null;
  }
  BZ.leftCard = function (S, card, filter) {
    if (card.section === 'skills') return [];
    var o = covering(S, card, card.socket - 1); return o && alive(o, filter) ? [o] : [];
  };
  BZ.rightCard = function (S, card, filter) {
    if (card.section === 'skills') return [];
    var o = covering(S, card, card.socket + card.size); return o && alive(o, filter) ? [o] : [];
  };
  BZ.neighbors = function (S, card, filter) { return BZ.leftCard(S, card, filter).concat(BZ.rightCard(S, card, filter)); };

  // ---------- VALUES ----------
  BZ.value = function (v, ctx, raw) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    var f = V[v.$type];
    if (!f) { BZ.noteUnknown(v.$type, 'value'); return 0; }
    var r = f(v, ctx, raw);
    return (typeof r === 'number' && isFinite(r)) ? r : 0;
  };
  BZ.applyMod = function (m, x, ctx) { // TValueModifier.cs:16-40
    if (!m) return x;
    var y = BZ.value(m.Value, ctx), round = m.ShouldRound !== false;
    switch (m.ModifyMode || 'Add') {
      case 'Add': return x + y;
      case 'Subtract': return x - y;
      case 'Multiply': return round ? BZ.roundMod(x * y) : x * y;
      case 'Divide': return y === 0 ? x : (round ? BZ.roundMod(x / y) : x / y);
    }
    BZ.noteUnknown(m.ModifyMode, 'modifier');
    return x;
  };
  function fin(v, x, ctx, raw) { return raw ? x : BZ.applyMod(v.Modifier, x, ctx); }
  function cardRefTargets(v, ctx) {
    if (v.Target) return BZ.targets(v.Target, ctx);
    return ctx.candidate ? [ctx.candidate] : []; // Target null trong điều kiện = chính thẻ ứng viên (TCardConditionalAttribute.cs:23-35)
  }
  V.TFixedValue = function (v) { return v.Value || 0; };
  V.TRangeValue = function (v, ctx) { // TRangeValue.cs:21-30, GetNumber(min, max+1) → số nguyên
    var lo = v.MinValue || 0, hi = (v.MaxValue == null ? 1 : v.MaxValue) + 1;
    if (!ctx.S || !ctx.S.rng) return v.DefaultValue || 0;
    var x = Math.floor(lo + ctx.S.rng() * (hi - lo));
    return BZ.applyMod(v.Modifier, x, ctx);
  };
  V.TReferenceValueCardAttribute = function (v, ctx, raw) {
    var ts = cardRefTargets(v, ctx), d = v.DefaultValue || 0;
    if (!ts.length) return fin(v, d, ctx, raw);
    var x = BZ.cattr(ctx.S, ts[0], v.AttributeType);
    return fin(v, x == null ? d : x, ctx, raw);
  };
  V.TReferenceValueCardAttributeUnscaled = function (v, ctx, raw) {
    var ts = cardRefTargets(v, ctx), d = v.DefaultValue || 0;
    if (!ts.length) return fin(v, d, ctx, raw);
    var x = BZ.cunscaled(ctx.S, ts[0], v.AttributeType);
    return fin(v, x == null ? d : x, ctx, raw);
  };
  V.TReferenceValueCardAttributeAggregate = function (v, ctx, raw) {
    var ts = cardRefTargets(v, ctx), d = v.DefaultValue || 0;
    if (!ts.length) return fin(v, d, ctx, raw);
    var s = 0;
    for (var i = 0; i < ts.length; i++) s += BZ.cattr(ctx.S, ts[i], v.AttributeType) || 0;
    return fin(v, s, ctx, raw);
  };
  V.TReferenceValueCardCount = function (v, ctx, raw) {
    var ts = v.Target ? BZ.targets(v.Target, ctx) : [];
    return fin(v, ts.length, ctx, raw);
  };
  V.TReferenceValueCardTagCount = function (v, ctx, raw) {
    var ts = cardRefTargets(v, ctx);
    if (!ts.length) return fin(v, v.DefaultValue || 0, ctx, raw);
    var seen = {}, n = 0, total = 0;
    for (var i = 0; i < ts.length; i++) for (var t in ts[i].tags) { total++; if (!seen[t]) { seen[t] = 1; n++; } }
    return fin(v, v.Distinct === false ? total : n, ctx, raw);
  };
  function playerRef(v, ctx, raw, unscaled) {
    var ps = v.Target ? BZ.targets(v.Target, ctx) : [], d = v.DefaultValue || 0;
    if (!ps.length) return fin(v, d, ctx, raw);
    var pl = ps[0];
    if (ctx.S && ctx.S.dirty && !ctx.S.computing) BZ.recompute(ctx.S);
    var x = unscaled ? (pl.touched && pl.touched[v.AttributeType] ? pl.un[v.AttributeType] : pl.base[v.AttributeType]) : BZ.pattr(ctx.S, pl, v.AttributeType);
    return fin(v, x == null ? d : x, ctx, raw);
  }
  V.TReferenceValuePlayerAttribute = function (v, ctx, raw) { return playerRef(v, ctx, raw, false); };
  V.TReferenceValuePlayerAttributeUnscaled = function (v, ctx, raw) { return playerRef(v, ctx, raw, true); };
  V.TReferenceValueAttributeChange = function (v, ctx, raw) { // TReferenceValueAttributeChange.cs:10-18
    var ev = ctx.ev;
    if (!ev || ev.delta == null) return fin(v, v.DefaultValue || 0, ctx, raw);
    return fin(v, Math.abs(ev.delta), ctx, raw);
  };

  // ---------- CONDS ----------
  // Mỗi mục: test(cond, x, ctx) → bool, hoặc filter(cond, list, ctx) → list (Highest/Lowest/Largest/And/Or).
  BZ.condTest = function (cond, x, ctx) {
    var e = C[cond.$type];
    if (!e) { BZ.noteUnknown(cond.$type, 'cond'); return true; }
    if (e.test) return e.test(cond, x, ctx);
    return e.filter(cond, ctx.all && ctx.all.length ? ctx.all : [x], ctx).indexOf(x) >= 0;
  };
  BZ.condFilter = function (cond, arr, ctx) {
    var e = C[cond.$type];
    if (!e) { BZ.noteUnknown(cond.$type, 'cond'); return arr; }
    if (e.filter) return e.filter(cond, arr, ctx);
    var c2 = Object.create(ctx); c2.all = arr;
    var out = [];
    for (var i = 0; i < arr.length; i++) if (e.test(cond, arr[i], c2)) out.push(arr[i]);
    return out;
  };
  function bySocket(a, b) { return a.socket - b.socket; }
  // FilterByConditions: lọc rồi xếp theo LeftSocketId (TTargetCardBase.cs:15-30)
  BZ.filterCards = function (cond, arr, ctx) {
    if (!cond || !arr.length) return arr;
    var out = BZ.condFilter(cond, arr, ctx).slice();
    return out.sort(bySocket);
  };
  function pass(cond) { // SortedCardConditionalSet.cs:13-36
    var t = cond.$type;
    if (t === 'TCardConditionalAnd' || t === 'TCardConditionalOr') return 1;
    if (t === 'TCardConditionalAttributeHighest' || t === 'TCardConditionalAttributeLowest') return 2;
    return 0;
  }
  function sorted(conds) { return (conds || []).slice().sort(function (a, b) { return pass(a) - pass(b); }); }
  function isNot(cond, b) { return cond.IsNot ? !b : b; }
  function cardCond(cond, x, ctx, f) { var S = ctx.S; return f(S, x); }

  C.TCardConditionalAnd = {
    test: function (c, x, ctx) { var cs = c.Conditions || []; for (var i = 0; i < cs.length; i++) if (!BZ.condTest(cs[i], x, ctx)) return false; return true; },
    filter: function (c, arr, ctx) { var cs = sorted(c.Conditions), cur = arr; for (var i = 0; i < cs.length && cur.length; i++) cur = BZ.condFilter(cs[i], cur, ctx); return cur; }
  };
  C.TCardConditionalOr = {
    test: function (c, x, ctx) { var cs = c.Conditions || []; for (var i = 0; i < cs.length; i++) if (BZ.condTest(cs[i], x, ctx)) return true; return false; },
    filter: function (c, arr, ctx) {
      var cs = sorted(c.Conditions), seen = [], i, j;
      for (i = 0; i < cs.length; i++) { var r = BZ.condFilter(cs[i], arr, ctx); for (j = 0; j < r.length; j++) if (seen.indexOf(r[j]) < 0) seen.push(r[j]); }
      return arr.filter(function (x) { return seen.indexOf(x) >= 0; });
    }
  };
  C.TCardConditionalAttribute = { test: function (c, x, ctx) { // TCardConditionalAttribute.cs:23-35
    var a = BZ.cattr(ctx.S, x, c.Attribute || 'Ammo');
    if (a == null) return false;
    var cv = c.ComparisonValue, b;
    if (cv && cv.$type && /^TReferenceValueCard/.test(cv.$type) && !cv.Target) { var c2 = Object.create(ctx); c2.candidate = x; b = BZ.value(cv, c2); }
    else b = cv == null ? 0 : BZ.value(cv, ctx);
    return BZ.compare(c.ComparisonOperator, a, b);
  } };
  function tagOp(op, want, has) {
    var i;
    switch (op || 'Any') {
      case 'Any': for (i = 0; i < want.length; i++) if (has[want[i]]) return true; return false;
      case 'All': for (i = 0; i < want.length; i++) if (!has[want[i]]) return false; return true;
      case 'None': for (i = 0; i < want.length; i++) if (has[want[i]]) return false; return true;
    }
    BZ.noteUnknown(op, 'tagop'); return false;
  }
  C.TCardConditionalTag = { test: function (c, x, ctx) { if (ctx.S.dirty && !ctx.S.computing) BZ.recompute(ctx.S); return tagOp(c.Operator, c.Tags || [], x.tags); } };
  C.TCardConditionalHiddenTag = { test: function (c, x, ctx) { if (ctx.S.dirty && !ctx.S.computing) BZ.recompute(ctx.S); return tagOp(c.Operator, c.Tags || [], x.hidden); } };
  C.TCardConditionalCanCrit = { test: function (c, x, ctx) { return isNot(c, BZ.canCrit(ctx.S, x)); } };
  // Thẻ đã xong quest mang id mẫu dẫn xuất `<id gốc>~q…` (js/run/core.js R.baseId): so theo id gốc, không thì
  // điều kiện "đúng thẻ X" bỏ sót thẻ đó.
  C.TCardConditionalId = { test: function (c, x) { var id = String(x.id || ''), k = id.indexOf('~q'); return isNot(c, (k < 0 ? id : id.slice(0, k)) === c.Id); } };
  C.TCardConditionalSize = { test: function (c, x) { return isNot(c, (c.Sizes || []).indexOf(x.sizeName) >= 0); } };
  C.TCardConditionalTier = { test: function (c, x) { return isNot(c, (c.Tiers || []).indexOf(x.tier) >= 0); } };
  C.TCardConditionalType = { test: function (c, x) { return isNot(c, x.type === (c.CardType || 'Item')); } };
  C.TCardConditionalHasEnchantment = { test: function (c, x) { return isNot(c, (x.ench || null) === (c.Enchantment == null ? null : c.Enchantment)); } };
  C.TCardConditionalEnchantmentEligible = { test: function (c, x) { return !!(x.tpl.Enchantments && x.tpl.Enchantments[c.Enchantment]); } };
  C.TCardConditionalPlayerHero = { test: function (c, x, ctx) { // TCardConditionalPlayerHero.cs:15-23
    var tc = ctx.card; var hero = tc ? ctx.S.players[tc.owner].hero : null;
    if (!hero) return false;
    var has = (x.tpl.Heroes || []).indexOf(hero) >= 0;
    return c.IsSameAsPlayerHero ? has : !has;
  } };
  C.TCardConditionalTriggerSource = { test: function (c, x, ctx) { return isNot(c, !!ctx.ev && x === ctx.ev.src); } };
  function extreme(c, arr, ctx, highest) { // TCardConditionalAttributeHighest.cs:13-66 / Lowest.cs:13-78
    var best = null, val = 0;
    for (var i = 0; i < arr.length; i++) {
      var a = BZ.cattr(ctx.S, arr[i], c.AttributeType || 'Ammo');
      if (a == null) continue;
      if (highest ? a > val : (best === null || a < val)) { val = a; best = arr[i]; }
    }
    return best ? [best] : [];
  }
  C.TCardConditionalAttributeHighest = { filter: function (c, arr, ctx) { return extreme(c, arr, ctx, true); } };
  C.TCardConditionalAttributeLowest = { filter: function (c, arr, ctx) { return extreme(c, arr, ctx, false); } };
  C.TCardConditionalSizeLargest = { filter: function (c, arr) {
    var m = 0; arr.forEach(function (x) { if (x.size > m) m = x.size; }); return arr.filter(function (x) { return x.size === m; });
  } };
  C.TCardConditionalSizeSmallest = { filter: function (c, arr) {
    var m = 9; arr.forEach(function (x) { if (x.size < m) m = x.size; }); return arr.filter(function (x) { return x.size === m; });
  } };
  // Điều kiện người chơi (TPlayerConditionalAttribute.cs:22-30): x là đối tượng người chơi
  C.TPlayerConditionalAttribute = { test: function (c, pl, ctx) {
    var a = BZ.pattr(ctx.S, pl, c.Attribute);
    if (a == null) a = 0;
    return BZ.compare(c.ComparisonOperator, a, BZ.value(c.ComparisonValue, ctx));
  } };
  // Điều kiện run: trong trận dùng day/hour truyền vào BZSim.run (mặc định 1)
  C.TRunConditionalCurrentDay = { test: function (c, x, ctx) { return BZ.compare(c.ComparisonOperator, ctx.S.day || 1, c.CurrentDay || 0); } };
  C.TRunConditionalCurrentHour = { test: function (c, x, ctx) { return BZ.compare(c.ComparisonOperator, ctx.S.hour || 1, c.CurrentHour || 0); } };
  C.TRunConditionalSandstorm = { test: function (c, x, ctx) { var on = !!(ctx.S.storm && ctx.S.storm.active); return c.IsActive === false ? !on : on; } };

  // ---------- PREREQS (tất cả phải đúng) ----------
  BZ.prereqsOk = function (prs, ctx) {
    if (!prs || !prs.length) return true;
    for (var i = 0; i < prs.length; i++) {
      var p = prs[i], f = P[p.$type];
      if (!f) { BZ.noteUnknown(p.$type, 'prereq'); continue; }
      if (!f(p, ctx)) return false;
    }
    return true;
  };
  var SELF = { $type: 'TTargetCardSelf' };
  P.TPrerequisiteCardCount = function (p, ctx) { return BZ.compare(p.Comparison, BZ.targets(p.Subject || SELF, ctx).length, p.Amount || 0); };
  P.TPrerequisitePlayer = function (p, ctx) { return BZ.targets(p.Subject || { $type: 'TTargetPlayerRelative', TargetMode: 'Self' }, ctx).length > 0; };
  P.TPrerequisiteRun = function (p, ctx) { return !p.Conditions || BZ.condTest(p.Conditions, null, ctx); };
  P.TPrerequisiteCardAttributeComparator = function (p, ctx) { // TPrerequisiteCardAttributeComparator.cs:24-36
    if (!p.SubjectOther && !p.AttributeOther) { var op = p.Comparison || 'Equal'; return op === 'Equal' || op === 'GreaterThanOrEqual' || op === 'LessThanOrEqual'; }
    var a = BZ.targets(p.Subject || SELF, ctx), b = p.SubjectOther ? BZ.targets(p.SubjectOther, ctx) : a;
    var an = p.Attribute || 'Ammo', bn = p.AttributeOther || an;
    for (var i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++)
      if (!BZ.compare(p.Comparison, BZ.cattr(ctx.S, a[i], an) || 0, BZ.cattr(ctx.S, b[j], bn) || 0)) return false;
    return true;
  };

  // ---------- TARGETS ----------
  // BZ.targets(t, ctx, count, prios, stateFilter) → thẻ (đích thẻ) hoặc người chơi (đích người chơi)
  BZ.targets = function (t, ctx, count, prios, filter) {
    if (!t) return [];
    var f = T[t.$type];
    if (!f) { BZ.noteUnknown(t.$type, 'target'); return []; }
    return f(t, ctx, count == null ? null : count, prios || null, filter || null);
  };
  // SelectByTargetingPriorities mặc định (TTargetCardBase.cs:32-71)
  function select(ctx, count, prios, arr) {
    if (!arr.length || !count) return arr;
    if (!prios || !prios.length) return arr.slice(0, count);
    var got = [];
    for (var i = 0; i < prios.length && got.length < count; i++) {
      var l = BZ.filterCards(prios[i], arr, ctx);
      for (var j = 0; j < l.length && got.length < count; j++) if (got.indexOf(l[j]) < 0) got.push(l[j]);
    }
    return got.length ? got : arr.slice(0, count);
  }
  function randomPick(ctx, arr, n) { // TTargetCardRandom.SelectRandomCards: GetNumber(count) mỗi lần, không hoàn lại
    if (!n || n >= arr.length) return arr;
    var pool = arr.slice(), out = [];
    for (var i = 0; i < n; i++) out.push(pool.splice(ctx.S.rng.int(pool.length), 1)[0]);
    return out;
  }
  function excl(arr, card, flag) { if (!flag || !card) return arr; var i = arr.indexOf(card); if (i < 0) return arr; arr = arr.slice(); arr.splice(i, 1); return arr; }

  T.TTargetCardSelf = function (t, ctx, count, prios, filter) {
    var c = ctx.card; if (!c || !alive(c, filter)) return [];
    return select(ctx, count, prios, BZ.filterCards(t.Conditions, [c], ctx));
  };
  T.TTargetCardSection = function (t, ctx, count, prios, filter) {
    var arr = excl(BZ.section(ctx.S, t.TargetSection || 'SelfHand', ctx.card, ctx.ev, filter), ctx.card, t.ExcludeSelf);
    return select(ctx, count, prios, BZ.filterCards(t.Conditions, arr, ctx));
  };
  T.TTargetCardRandom = function (t, ctx, count, prios, filter) { // TTargetCardRandom.cs:21-180
    if (!ctx.card) return [];
    var arr = excl(BZ.section(ctx.S, t.TargetSection || 'SelfHand', ctx.card, ctx.ev, filter), ctx.card, t.ExcludeSelf);
    arr = BZ.filterCards(t.Conditions, arr, ctx);
    if (!prios || !count) return randomPick(ctx, arr, count);
    var got = [], left = count;
    for (var i = 0; i < prios.length && left > 0; i++) {
      var sub = BZ.filterCards(prios[i], arr, ctx).filter(function (x) { return got.indexOf(x) < 0; });
      var pick = randomPick(ctx, sub, left);
      got = got.concat(pick); left -= pick.length;
    }
    return got.length ? got : randomPick(ctx, arr, count);
  };
  T.TTargetCardPositional = function (t, ctx, count, prios, filter) { // TTargetCardPositional.cs:24-86
    if (!ctx.card) return [];
    var o = (t.Origin === 'TriggerSource') ? (ctx.ev && ctx.ev.src) : ctx.card, arr = [];
    if (o) {
      switch (t.TargetMode || 'Neighbor') {
        case 'Neighbor': arr = BZ.neighbors(ctx.S, o, filter); break;
        case 'LeftCard': arr = BZ.leftCard(ctx.S, o, filter); break;
        case 'RightCard': arr = BZ.rightCard(ctx.S, o, filter); break;
        case 'AllLeftCards': arr = list(containerOf(ctx.S, o).filter(function (x) { return x.socket < o.socket; }), filter); break;
        case 'AllRightCards': arr = list(containerOf(ctx.S, o).filter(function (x) { return x.socket >= o.socket + o.size; }), filter); break;
        default: BZ.noteUnknown(t.TargetMode, 'positional');
      }
    }
    if (t.IncludeOrigin && arr.indexOf(ctx.card) < 0) arr = arr.concat([ctx.card]);
    return select(ctx, count, prios, BZ.filterCards(t.Conditions, arr, ctx));
  };
  function containerOf(S, card) { return card.section === 'skills' ? [] : container(S, card); }
  T.TTargetCardXMost = function (t, ctx, count, prios, filter) { // TTargetCardXMost.cs:23-100
    var arr = excl(BZ.section(ctx.S, t.TargetSection || 'SelfHand', ctx.card, ctx.ev, filter), ctx.card, t.ExcludeSelf);
    arr = BZ.filterCards(t.Conditions, arr, ctx);
    if (arr.length && count && prios && prios.length) {
      var app = [];
      for (var i = 0; i < prios.length; i++) app = app.concat(BZ.filterCards(prios[i], arr, ctx));
      if (app.length) arr = app;
    }
    if (!arr.length) return [];
    return (t.TargetMode === 'RightMostCard') ? [arr[arr.length - 1]] : [arr[0]];
  };
  T.TTargetCardTriggerSource = function (t, ctx, count, prios, filter) {
    var s = ctx.ev && ctx.ev.src; if (!s || !alive(s, filter)) return [];
    if (t.ExcludeSelf && s === ctx.card) return [];
    return select(ctx, count, prios, BZ.filterCards(t.Conditions, [s], ctx));
  };
  T.TTargetCardTriggerTarget = function (t, ctx, count, prios, filter) {
    var s = ctx.ev && ctx.ev.tcard; if (!s || !alive(s, filter)) return [];
    if (t.ExcludeSelf && s === ctx.card) return [];
    return select(ctx, count, prios, BZ.filterCards(t.Conditions, [s], ctx));
  };
  // TTargetCardOccupying.cs:15-33: chỉ cho thẻ ô hiệu ứng; các thẻ trên tay chủ nó phủ ô [LeftSocketId, LeftSocketId+Size)
  T.TTargetCardOccupying = function (t, ctx, count, prios, filter) {
    var c = ctx.card;
    if (!c || c.type !== 'SocketEffect' || !alive(c, filter)) return [];
    var hand = ctx.S.players[c.owner].hand, out = [];
    for (var s = c.socket; s < c.socket + (c.size || 1); s++) {
      for (var i = 0; i < hand.length; i++) {
        var o = hand[i];
        if (s >= o.socket && s < o.socket + o.size && out.indexOf(o) < 0) out.push(o);
      }
    }
    // Sockets.Skip().Take().Distinct().OfType<ICard>(): bộ lọc trạng thái chỉ xét thẻ ô, không xét thẻ phủ ô
    return select(ctx, count, prios, BZ.filterCards(t.Conditions, out, ctx));
  };
  function pfilter(t, pls, ctx) {
    if (!t.Conditions) return pls;
    return pls.filter(function (pl) { return BZ.condTest(t.Conditions, pl, ctx); });
  }
  T.TTargetPlayerRelative = function (t, ctx) { // TTargetPlayerRelative.cs:15-46
    if (!ctx.card) return [];
    var me = ctx.card.owner;
    var idx = (t.TargetMode === 'Opponent') ? 1 - me : me;
    return pfilter(t, [ctx.S.players[idx]], ctx);
  };
  T.TTargetPlayerAbsolute = function (t, ctx) { // TTargetPlayerAbsolute.cs:14-27: Player = bàn 0, Encounter = bàn 1
    return pfilter(t, [ctx.S.players[t.TargetMode === 'Encounter' ? 1 : 0]], ctx);
  };
  T.TTargetPlayer = function (t, ctx) { // TTargetPlayer.cs:147-180
    var me = ctx.card ? ctx.card.owner : 0, S = ctx.S, r;
    switch (t.TargetMode || 'Self') {
      case 'Self': r = [S.players[me]]; break;
      case 'Opponent': r = [S.players[1 - me]]; break;
      case 'Both': r = [S.players[me], S.players[1 - me]]; break;
      case 'AbsolutePlayer': r = [S.players[0]]; break;
      default: BZ.noteUnknown(t.TargetMode, 'targetplayer'); r = [];
    }
    return pfilter(t, r, ctx);
  };

  // Ưu tiên chọn đích tĩnh (Conditionals.cs:9-104)
  var HAS_CD = { $type: 'TCardConditionalAttribute', Attribute: 'CooldownMax', ComparisonOperator: 'GreaterThan', ComparisonValue: 0 };
  var NO_CD = { $type: 'TCardConditionalAttribute', Attribute: 'CooldownMax', ComparisonOperator: 'Equal', ComparisonValue: 0 };
  var HAS_AMMO = { $type: 'TCardConditionalAttribute', Attribute: 'Ammo', ComparisonOperator: 'GreaterThan', ComparisonValue: 0 };
  var USES_AMMO = { $type: 'TCardConditionalAttribute', Attribute: 'AmmoMax', ComparisonOperator: 'GreaterThan', ComparisonValue: 0 };
  var NOT_AMMO = { $type: 'TCardConditionalAttribute', Attribute: 'AmmoMax', ComparisonOperator: 'Equal', ComparisonValue: 0 };
  BZ.PRIO = {
    Status: [HAS_CD, NO_CD],
    Charge: [{ $type: 'TCardConditionalAnd', Conditions: [HAS_CD, { $type: 'TCardConditionalOr', Conditions: [NOT_AMMO, { $type: 'TCardConditionalAnd', Conditions: [HAS_AMMO, USES_AMMO] }] }] }, HAS_CD],
    ForceUse: [{ $type: 'TCardConditionalAttribute', Attribute: 'Freeze', ComparisonOperator: 'LessThanOrEqual', ComparisonValue: 0 }],
    Reload: [{ $type: 'TCardConditionalAttribute', Attribute: 'Ammo', ComparisonOperator: 'LessThan', ComparisonValue: { $type: 'TReferenceValueCardAttribute', AttributeType: 'AmmoMax' } }],
    Upgrade: [{ $type: 'TCardConditionalTier', Tiers: ['Diamond'], IsNot: true }]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BZ;
})(typeof window !== 'undefined' ? window : globalThis);
