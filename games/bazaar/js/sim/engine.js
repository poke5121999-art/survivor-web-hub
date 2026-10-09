/* Chợ Phiên — máy mô phỏng: dựng trạng thái từ hai bàn, tính aura, phát sự kiện, hàng đợi ưu tiên, vòng khung 50 ms.
   Thứ tự trong một khung bám bản legacy (CODE-COMBAT §1.2, BazaarCardDealer.cs:4073-4380):
   hạn tác dụng tạm → (t=0: OnFightStarted) → lượt thẻ (đếm lùi Haste/Slow/Freeze, nạp cooldown, bắn) → độc/hồi (1 s)
   → bỏng (0,5 s) → nộ (Enrage) → bão cát → hàng đợi ưu tiên → kiểm chết (đối thủ trước) → chụp khung.
   BZSim.run({boards, seed, maxMs}) chạy trọn trận ngay, trả bản phát lại {winner, endMs, frames, ...}. */
(function (root) {
  'use strict';
  var BZ = root.BZSim = root.BZSim || {};
  var FRAME = BZ.FRAME_MS;
  var FIRED = { $type: 'TTriggerOnCardFired' };
  BZ.RT_KEYS = ['Haste', 'Slow', 'Freeze', 'Flying']; // trạng thái chạy, không qua aura (Ammo thêm cho thẻ có đạn)
  // Bố cục mảng trong mỗi khung (frames[i].c[k] theo thứ tự result.cards, frames[i].p[side])
  BZ.FRAME_LAYOUT = {
    card: ['progress', 'ammo', 'haste', 'slow', 'freeze', 'destroyed', 'flying'],
    player: ['health', 'shield', 'burn', 'poison', 'regen', 'rage', 'enragedMs', 'healthMax']
  };

  // ---------- dựng trạng thái ----------
  function sectionOf(ci, tpl) {
    if (ci.section) return ci.section;
    return (tpl.$type === 'TCardSkill' || tpl.Type === 'Skill') ? 'skills' : 'hand';
  }
  BZ.makeCard = function (S, ci, side) {
    var tpl = BZ.tpl(ci.id);
    if (!tpl) { BZ.noteUnknown(ci.id, 'template'); return null; }
    var C = {
      uid: ci.uid, id: ci.id, tpl: tpl, type: tpl.Type || (tpl.$type === 'TCardSkill' ? 'Skill' : 'Item'),
      tier: ci.tier || tpl.StartingTier || 'Bronze', ench: ci.ench || null, socket: ci.socket || 0,
      size: ci.size || BZ.SIZE[tpl.Size] || 1, sizeName: tpl.Size || 'Small', owner: side, section: sectionOf(ci, tpl),
      state: 'Alive', inst: ci.attrs || null, tb: {}, d: {}, rt: {}, attrs: {}, un: {}, tags: {}, hidden: {},
      addTags: {}, abilities: [], auras: [], cd: 0, critCapable: false
    };
    BZ.rebuildCard(S, C);
    return C;
  };
  // Nạp lại thuộc tính bậc + enchantment + ability/aura của bậc hiện tại (khi tạo, nâng bậc, yểm/bỏ enchantment)
  BZ.rebuildCard = function (S, C) {
    var tpl = C.tpl, tb = BZ.tierAttrs(tpl, C.tier), E = C.ench && tpl.Enchantments ? tpl.Enchantments[C.ench] : null, k;
    if (C.ench && !E) C.ench = null;
    if (E) for (k in (E.Attributes || {})) tb[k] = E.Attributes[k]; // khối enchantment đặt giá trị gốc [ĐỀ XUẤT §4.3]
    if (C.inst) for (k in C.inst) tb[k] = C.inst[k];
    C.tb = tb;
    var block = BZ.tierBlock(tpl, C.tier), ab = [], au = [];
    (block.AbilityIds || []).forEach(function (id) { var a = tpl.Abilities && tpl.Abilities[id]; if (a) ab.push(a); });
    (block.AuraIds || []).forEach(function (id) { var a = tpl.Auras && tpl.Auras[id]; if (a) au.push(a); });
    if (E) {
      for (k in (E.Abilities || {})) ab.push(E.Abilities[k]);
      for (k in (E.Auras || {})) au.push(E.Auras[k]);
    }
    C.abilities = ab; C.auras = au;
    au.forEach(function (a) { if (!BZ.AURAS[a.Action && a.Action.$type]) BZ.noteUnknown(a.Action && a.Action.$type, 'aura'); });
    C.baseTags = (tpl.Tags || []).concat(E && E.Tags || []);
    C.baseHidden = (tpl.HiddenTags || []).concat(E && E.HiddenTags || []);
    BZ.RT_KEYS.forEach(function (n) { if (!(n in C.rt)) C.rt[n] = n === 'Flying' ? (tb.Flying || 0) : 0; });
    C.critCapable = C.baseHidden.indexOf('CanCrit') >= 0 || (C.type === 'Item' && ab.some(function (a) {
      return (!a.Trigger || a.Trigger.$type === 'TTriggerOnCardFired') && BZ.CRIT_ACTIONS[a.Action && a.Action.$type];
    }));
    if (S) { S.dirty = true; S.listeners = null; S.reads = null; }
  };
  // Tên thuộc tính mà aura (giá trị, đích, tiền đề) có đọc: đổi thuộc tính khác thì không cần tính lại aura (chỉ để chạy nhanh)
  var readCache = new WeakMap();
  function auraReadNames(au) {
    var r = readCache.get(au);
    if (r) return r;
    r = {};
    (function walk(o, top) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, false); }); return; }
      for (var k in o) {
        var v = o[k];
        if ((k === 'Attribute' || k === 'AttributeType' || k === 'AttributeOther') && typeof v === 'string' && !top) r[v] = 1;
        else walk(v, false);
      }
    })(au.Action, true);
    (function walk2(o) {
      if (!o || typeof o !== 'object') return;
      for (var k in o) { var v = o[k]; if ((k === 'Attribute' || k === 'AttributeType' || k === 'AttributeOther') && typeof v === 'string') r[v] = 1; else walk2(v); }
    })(au.Prerequisites);
    readCache.set(au, r);
    return r;
  }
  BZ.auraReads = function (S) {
    if (S.reads) return S.reads;
    var r = {};
    S.cards.forEach(function (C) { C.auras.forEach(function (au) { var x = auraReadNames(au); for (var k in x) r[k] = 1; }); });
    S.reads = r;
    return r;
  };
  BZ.canCrit = function (S, C) { return C.critCapable || BZ.hasHidden(S, C, 'CanCrit'); }; // TCardConditionalCanCrit.cs:29-50

  BZ.makeState = function (opts) {
    var S = {
      t: 0, rng: BZ.rng(opts.seed == null ? 1 : opts.seed), players: [], cards: [], dirty: true, computing: false,
      queue: { Highest: [], High: [], Medium: [], Low: [], Lowest: [] }, incoming: [], frameEv: [], depth: 0,
      combatType: opts.combatType || 'PVE', day: opts.day || 1, hour: opts.hour || 1, timed: [], errors: [],
      overflow: 0, listeners: null, reads: null,
      storm: { enabled: opts.sandstorm !== false, active: false, force: false, acc: 0, tick: 0, dmg: 0 }
    };
    var seen = {};
    (opts.boards || []).slice(0, 2).forEach(function (b, side) {
      var base = {
        Health: 0, HealthMax: b.healthMax || 0, Shield: 0, Burn: 0, Poison: 0, HealthRegen: 0, Rage: 0,
        RageMax: BZ.RAGE_MAX, Enraged: 0, EnragedDuration: 0, EnragedDurationMax: BZ.ENRAGE_MS, CritChance: 0,
        PercentDamageReduction: 0, FlatDamageReduction: 0, Gold: 0, Income: 0, Level: b.level || 1
      };
      var k, extra = b.attrs || {};
      for (k in extra) base[k] = extra[k];
      if (b.healthMax) base.HealthMax = b.healthMax;
      var P = { idx: side, name: b.name || ('P' + side), hero: b.hero || null, hand: [], stash: [], skills: [],
        base: base, attrs: {}, un: {}, deathDone: false, prevMax: null };
      (b.cards || []).forEach(function (ci) {
        var C = BZ.makeCard(S, ci, side);
        if (!C) return;
        if (C.uid == null) C.uid = 'c' + side + '_' + S.cards.length;
        if (seen[C.uid]) C.uid = C.uid + '#' + side; // trùng uid giữa hai bàn (vd quái đánh chính nó)
        seen[C.uid] = 1;
        (P[C.section] || P.hand).push(C);
        if (!P[C.section]) C.section = 'hand';
      });
      P.hand.sort(function (a, b2) { return a.socket - b2.socket; });
      P.stash.sort(function (a, b2) { return a.socket - b2.socket; });
      S.players.push(P);
    });
    while (S.players.length < 2) S.players.push({ idx: S.players.length, name: 'empty', hero: null, hand: [], stash: [], skills: [],
      base: { Health: 1, HealthMax: 1 }, attrs: {}, un: {}, deathDone: false, prevMax: null });
    S.players.forEach(function (P) { S.cards = S.cards.concat(P.hand, P.skills, P.stash); });
    return S;
  };

  // ---------- aura: tính lại mọi thuộc tính ----------
  function activeIn(C, ai) { // EEffectActiveIn; kỹ năng (skills) luôn tính như trên tay
    ai = ai || 'HandOnly';
    if (C.section === 'skills') return ai !== 'StashOnly';
    if (C.section === 'hand') return ai === 'HandOnly' || ai === 'HandAndStash';
    if (C.section === 'stash') return ai === 'StashOnly' || ai === 'HandAndStash';
    return false;
  }
  BZ.activeIn = activeIn;
  function baseVal(C, n) {
    var v = C.tb[n];
    if (n in C.d) v = (v || 0) + C.d[n];
    if (v === undefined && n in BZ.DEFAULT_ZERO) v = BZ.DEFAULT_ZERO[n];
    return v;
  }
  function slot(acc, key, n) {
    var m = acc[key] || (acc[key] = {});
    return m[n] || (m[n] = { add: 0, sub: 0, amul: 0, mul: 1 });
  }
  BZ.auraAcc = function (acc, target, n, op, val) { // EAttributeModifierOperation
    var s = slot(acc, target.uid != null && target.tpl ? 'c' + target.uid : 'p' + target.idx, n);
    switch (op || 'Add') {
      case 'Add': s.add += val; break;
      case 'Subtract': s.sub += val; break;
      case 'Multiply': s.mul *= val; break;
      case 'AdditiveMultiply': s.amul += val - 1; break;
      default: BZ.noteUnknown(op, 'auraop');
    }
  };
  function compose(base, m, attrs, un) { // [ĐỀ XUẤT §3.11] round((base + ΣAdd − ΣSub) × (1 + Σ(AddMul−1)) × ΠMul)
    var k;
    for (k in base) if (base[k] !== undefined) { attrs[k] = base[k]; un[k] = base[k]; }
    if (!m) return;
    for (k in m) {
      var s = m[k], b = base[k] === undefined ? 0 : base[k];
      var u = b + s.add - s.sub;
      un[k] = BZ.roundAway(u);
      attrs[k] = BZ.roundAway(u * (1 + s.amul) * s.mul);
    }
  }
  BZ.recompute = function (S) {
    if (S.computing) return;
    S.computing = true;
    try {
      var cards = S.cards, i, j, C, n;
      for (i = 0; i < cards.length; i++) {
        C = cards[i];
        var b = {};
        for (n in C.tb) b[n] = baseVal(C, n);
        for (n in C.d) b[n] = baseVal(C, n);
        for (n in BZ.DEFAULT_ZERO) if (b[n] === undefined) b[n] = BZ.DEFAULT_ZERO[n];
        C._base = b; C.attrs = {}; C.un = {};
        compose(b, null, C.attrs, C.un);
        C.tags = {}; C.hidden = {};
        C.baseTags.forEach(function (t) { C.tags[t] = 1; });
        C.baseHidden.forEach(function (t) { C.hidden[t] = 1; });
        for (n in C.addTags) C.tags[n] = 1;
      }
      S.players.forEach(function (P) { P.attrs = {}; P.un = {}; compose(P.base, null, P.attrs, P.un); });
      // Hai lượt: lượt sau đọc kết quả lượt trước → aura tham chiếu thuộc tính đã được aura khác sửa (vd Shielded = DamageAmount)
      for (var pass = 0; pass < 2; pass++) {
        var acc = {}, tagAdd = {};
        acc.tags = tagAdd;
        for (i = 0; i < cards.length; i++) {
          C = cards[i];
          if (C.state !== 'Alive' || !C.auras.length) continue;
          for (j = 0; j < C.auras.length; j++) {
            var au = C.auras[j];
            if (!activeIn(C, au.ActiveIn) || au.WorksIn === 'OutOfCombatOnly' || !au.Action) continue;
            var f = BZ.AURAS[au.Action.$type];
            if (!f) continue; // đã ghi khi dựng thẻ
            var ctx = { S: S, card: C, ev: null };
            if (!BZ.prereqsOk(au.Prerequisites, ctx)) continue;
            try { f(au.Action, ctx, acc); } catch (e) { BZ.recordError(S, C, au.Action.$type, e); }
          }
        }
        for (i = 0; i < cards.length; i++) {
          C = cards[i];
          var na = {}, nu = {};
          compose(C._base, acc['c' + C.uid], na, nu);
          C.attrs = na; C.un = nu;
          var tg = {}; C.baseTags.forEach(function (t) { tg[t] = 1; });
          for (n in C.addTags) tg[n] = 1;
          var ta = tagAdd[C.uid]; if (ta) for (n in ta) tg[n] = 1;
          C.tags = tg;
        }
        S.players.forEach(function (P) { var m = acc['p' + P.idx], na = {}, nu = {}; compose(P.base, m, na, nu); P.attrs = na; P.un = nu; P.touched = m || {}; });
      }
      S.dirty = false;
      // Máu tối đa đổi giữa trận: tăng thì máu tăng theo, giảm thì kẹp lại [ĐỀ XUẤT]
      S.players.forEach(function (P) {
        var mx = P.attrs.HealthMax || 0;
        if (P.prevMax != null && mx !== P.prevMax) {
          if (mx > P.prevMax) P.base.Health += mx - P.prevMax;
          if (P.base.Health > mx) P.base.Health = mx;
          P.attrs.Health = P.base.Health;
        }
        P.prevMax = mx;
      });
    } finally { S.computing = false; }
  };

  // ---------- nhật ký + lỗi ----------
  BZ.log = function (S, e) { e.t = S.t; S.frameEv.push(e); return e; };
  BZ.recordError = function (S, C, type, e) {
    var msg = (C ? C.id + ' ' : '') + type + ': ' + (e && e.message || e);
    S.errors.push(msg); BZ.errors.push(msg);
  };
  function pid(P) { return 'p' + P.idx; }
  BZ.pid = pid;

  // ---------- phát sự kiện (CODE-COMBAT §3.4) ----------
  function listeners(S) {
    if (S.listeners) return S.listeners;
    var L = [{}, {}];
    S.players.forEach(function (P) {
      P.hand.concat(P.skills, P.stash).forEach(function (C) {
        C.abilities.forEach(function (A) {
          if (A.WorksIn === 'OutOfCombatOnly') return;
          BZ.triggerKinds(A.Trigger).forEach(function (k) {
            if (k === 'TTriggerOnCardFired') return; // bắn do BZ.fire xử lý
            if (!BZ.TRIGGERS[k]) { BZ.noteUnknown(k, 'trigger'); return; }
            (L[P.idx][k] || (L[P.idx][k] = [])).push({ C: C, A: A });
          });
        });
      });
    });
    S.listeners = L;
    return L;
  }
  // sync = chạy mọi ability khớp ngay (OnPlayerDied: BazaarCardDealer.cs:2760-2767). Còn lại: Immediate chạy ngay,
  // mức khác vào hàng đợi, chạy từ khung sau. Tiền đề xét lúc kích [ĐỀ XUẤT: mẫu "lần đầu mỗi trận" của Hard Shell
  // cần vậy — ability bộ đếm Immediate chạy ngay sau trong cùng lần phát].
  BZ.emit = function (S, kind, ev, sync) {
    ev.kind = kind;
    if (S.depth > 40) { S.overflow++; return; }
    S.depth++;
    try {
      var L = listeners(S), side = ev.side || 0, sides = [side, 1 - side];
      for (var s = 0; s < 2; s++) {
        var arr = L[sides[s]][kind];
        if (!arr) continue;
        arr = arr.slice();
        for (var i = 0; i < arr.length; i++) {
          var C = arr[i].C, A = arr[i].A;
          if (C.state !== 'Alive' || !activeIn(C, A.ActiveIn)) continue;
          if (!BZ.matchTrigger(A.Trigger || FIRED, C, ev, S)) continue;
          if (!BZ.prereqsOk(A.Prerequisites, { S: S, card: C, ev: ev })) continue;
          if (sync || A.Priority === 'Immediate') BZ.execAbility(S, C, A, ev, null);
          else S.incoming.push({ C: C, A: A, ev: ev, prio: A.Priority || 'Medium', group: null });
        }
      }
    } finally { S.depth--; }
  };

  BZ.execAbility = function (S, C, A, ev, group) {
    var ctx = { S: S, card: C, ev: ev, crit: group ? group.crit : false, fired: !!group, cache: new Map(), ability: A };
    var n = 1;
    if (group) { n = Math.floor(BZ.cattr(S, C, 'Multicast') || 1); if (n < 1) n = 1; } // §1.5: Multicast chỉ cho hiệu ứng bắn
    for (var k = 0; k < n; k++) { ctx.cast = k; BZ.runAction(A.Action, ctx); }
  };
  BZ.runAction = function (act, ctx) {
    if (!act) return;
    var f = BZ.ACTIONS[act.$type];
    if (!f) { BZ.noteUnknown(act.$type, 'action'); return; }
    BZ.ran[act.$type] = (BZ.ran[act.$type] || 0) + 1; // đếm phủ: hành động nào thật sự đã chạy
    try { f(act, ctx); } catch (e) { BZ.recordError(ctx.S, ctx.card, act.$type, e); }
  };

  // ---------- bắn (CODE-COMBAT §1.4, BazaarCardDealer.cs:1168-1248) ----------
  BZ.isAmmo = function (S, C) { return ('Ammo' in C.rt) && (BZ.cattr(S, C, 'AmmoMax') || 0) > 0; };
  BZ.effCooldown = function (S, C) { // [ĐỀ XUẤT §1.3]
    var m = BZ.cattr(S, C, 'CooldownMax') || 0;
    if (m <= 0) return 0;
    var flat = BZ.cattr(S, C, 'FlatCooldownReduction') || 0, pct = BZ.cattr(S, C, 'PercentCooldownReduction') || 0;
    var enr = (S.players[C.owner].base.Enraged || 0) > 0 ? BZ.ENRAGE_CD : 1;
    return Math.max(BZ.MIN_COOLDOWN, Math.round((m - flat) * (1 - pct / 100) * enr));
  };
  BZ.fire = function (S, C, forced) {
    if (C.section !== 'hand' || C.state !== 'Alive') return false;
    if (BZ.isAmmo(S, C) && C.rt.Ammo <= 0) return false;
    var P = S.players[C.owner];
    var chance = (BZ.cattr(S, C, 'CritChance') || 0) + (BZ.pattr(S, P, 'CritChance') || 0);
    var crit = false;
    if (chance > 0 && BZ.canCrit(S, C)) crit = S.rng() < chance / 100; // một lần tung mỗi lần bắn (:1188-1190)
    BZ.log(S, { type: 'fire', src: C.uid, crit: crit, forced: !!forced });
    if (crit) BZ.log(S, { type: 'crit', src: C.uid, chance: chance });
    BZ.emit(S, 'TTriggerOnBeforeItemUsed', { card: C, src: C, side: C.owner });
    var group = { C: C, crit: crit, left: 0 }, ev = { kind: 'TTriggerOnCardFired', card: C, src: C, side: C.owner };
    var fx = [];
    for (var i = 0; i < C.abilities.length; i++) {
      var A = C.abilities[i];
      if (!activeIn(C, A.ActiveIn) || A.WorksIn === 'OutOfCombatOnly') continue;
      if (BZ.triggerKinds(A.Trigger).indexOf('TTriggerOnCardFired') < 0) continue;
      if (A.Trigger && !BZ.matchTrigger(A.Trigger, C, ev, S)) continue;
      if (!BZ.prereqsOk(A.Prerequisites, { S: S, card: C, ev: ev })) continue;
      fx.push(A);
    }
    fx.forEach(function (A) { if (A.Priority !== 'Immediate') group.left++; });
    fx.forEach(function (A) {
      if (A.Priority === 'Immediate') BZ.execAbility(S, C, A, ev, group);
      else S.incoming.push({ C: C, A: A, ev: ev, prio: A.Priority || 'Medium', group: group });
    });
    if (group.left === 0) finishFire(S, group);
    return true;
  };
  function finishFire(S, g) { // khi hiệu ứng bắn cuối cùng chạy: trừ đạn, OnCrit, OnItemUse (:1219-1245)
    var C = g.C;
    if (BZ.isAmmo(S, C)) BZ.setRt(S, C, 'Ammo', Math.max(0, C.rt.Ammo - 1), C);
    if (g.crit) BZ.emit(S, 'TTriggerOnCardCritted', { card: C, src: C, side: C.owner });
    BZ.emit(S, 'TTriggerOnItemUsed', { card: C, src: C, side: C.owner });
  }

  // ---------- đổi thuộc tính ----------
  BZ.setRt = function (S, T, n, v, causer, quiet) { // trạng thái chạy của thẻ (Haste/Slow/Freeze/Flying/Ammo)
    var prev = T.rt[n] || 0;
    if (v < 0) v = 0;
    if (v === prev) return 0;
    T.rt[n] = v;
    if (BZ.auraReads(S)[n]) S.dirty = true;
    if (!quiet) BZ.emit(S, 'TTriggerOnCardAttributeChanged', { card: T, src: T, causer: causer, side: T.owner, attr: n, delta: v - prev, prev: prev, cur: v });
    return v - prev;
  };
  // Đổi thuộc tính thẻ bằng hành động: op Add/Subtract/Multiply trên giá trị đang thấy; ghi vào phần chênh `d`
  BZ.changeCard = function (S, T, n, op, val, causer) {
    if (n in T.rt) {
      var p0 = T.rt[n] || 0, nv = op === 'Subtract' ? p0 - val : op === 'Multiply' ? BZ.roundAway(p0 * val) : p0 + val;
      return BZ.setRt(S, T, n, nv, causer);
    }
    var prev = BZ.cattr(S, T, n);
    var pv = prev == null ? 0 : prev, delta;
    switch (op || 'Add') {
      case 'Add': delta = val; break;
      case 'Subtract': delta = -val; break;
      case 'Multiply': delta = BZ.roundAway(pv * val) - pv; break;
      default: BZ.noteUnknown(op, 'cardop'); return 0;
    }
    var b = (T.tb[n] || 0) + (T.d[n] || 0);
    if (b + delta < 0) delta = -b; // kẹp ≥ 0 (BazaarDeckTools.cs:1668)
    if (!delta && prev != null) return 0;
    T.d[n] = (T.d[n] || 0) + delta; S.dirty = true;
    var cur = BZ.cattr(S, T, n);
    var dv = (cur || 0) - pv;
    if (dv) BZ.emit(S, 'TTriggerOnCardAttributeChanged', { card: T, src: T, causer: causer, side: T.owner, attr: n, delta: dv, prev: pv, cur: cur });
    return delta;
  };
  BZ.changePlayer = function (S, P, n, delta, causer) {
    if (!delta) return 0;
    var prev = P.base[n] || 0;
    P.base[n] = prev + delta;
    if (n === 'HealthMax' || (P.touched && P.touched[n]) || BZ.auraReads(S)[n]) S.dirty = true;
    BZ.emit(S, 'TTriggerOnPlayerAttributeChanged', { player: P, side: P.idx, src: causer || null, causer: causer || null, attr: n, delta: delta, prev: prev, cur: prev + delta });
    return delta;
  };

  // ---------- máu, khiên, trạng thái người chơi (CODE-COMBAT §2) ----------
  // Sát thương thường / bão cát: giảm % và phẳng [ĐỀ XUẤT] → khiên → máu (BazaarCardDealer.cs:860-906)
  BZ.hit = function (S, P, amount, kind, src, crit) {
    var n = Math.round(Math.abs(amount));
    var pdr = BZ.pattr(S, P, 'PercentDamageReduction') || 0, flat = BZ.pattr(S, P, 'FlatDamageReduction') || 0;
    if (pdr || flat) n = Math.max(0, Math.round(n * (1 - pdr / 100)) - flat);
    var sh = P.base.Shield || 0, ab = Math.min(sh, n), hp = n - ab;
    BZ.log(S, { type: 'damage', kind: kind, src: src ? src.uid : null, target: pid(P), amt: n, shield: ab, hp: hp, crit: !!crit });
    if (ab) BZ.changePlayer(S, P, 'Shield', -ab, src);
    if (hp) BZ.changePlayer(S, P, 'Health', -hp, src);
    return n;
  };
  BZ.heal = function (S, P, amount, src, kind, crit) {
    var n = Math.round(amount); if (n <= 0) return 0;
    var mx = BZ.pattr(S, P, 'HealthMax') || 0, miss = Math.max(0, mx - P.base.Health), got = Math.min(n, miss);
    BZ.log(S, { type: 'heal', kind: kind || 'Heal', src: src ? src.uid : null, target: pid(P), amt: got, over: n - got, crit: !!crit });
    if (got) BZ.changePlayer(S, P, 'Health', got, src);
    return got;
  };
  function poisonTick(S, P) { // mỗi 1 s, bỏ qua khiên (:908-943)
    var p = P.base.Poison || 0; if (p <= 0) return;
    BZ.log(S, { type: 'damage', kind: 'Poison', src: null, target: pid(P), amt: p, shield: 0, hp: p });
    BZ.changePlayer(S, P, 'Health', -p, null);
  }
  function regenTick(S, P) { // mỗi 1 s, bỏ qua khi đầy máu (:984-1004)
    var r = BZ.pattr(S, P, 'HealthRegen') || 0; if (r <= 0) return;
    if (P.base.Health >= (BZ.pattr(S, P, 'HealthMax') || 0)) return;
    BZ.heal(S, P, r, null, 'Regen');
  }
  function burnTick(S, P) { // mỗi 0,5 s; khiên gánh một nửa [ĐỀ XUẤT §2]; rồi giảm 3 % (≥ 1)
    var b = P.base.Burn || 0; if (b <= 0) return;
    var sh = P.base.Shield || 0, ab = 0, hp = b;
    if (sh > 0) { var half = Math.ceil(b / 2); ab = Math.min(sh, half); hp = (half - ab) * 2; }
    BZ.log(S, { type: 'damage', kind: 'Burn', src: null, target: pid(P), amt: b, shield: ab, hp: hp });
    if (ab) BZ.changePlayer(S, P, 'Shield', -ab, null);
    if (hp) BZ.changePlayer(S, P, 'Health', -hp, null);
    BZ.changePlayer(S, P, 'Burn', -Math.min(b, Math.max(1, Math.round(b * BZ.BURN_DECAY))), null);
  }
  BZ.addRage = function (S, P, amt, src) { // [ĐỀ XUẤT §1.10]
    if (!amt) return;
    var mx = BZ.pattr(S, P, 'RageMax') || BZ.RAGE_MAX;
    var room = (P.base.Enraged > 0) ? Math.max(0, mx - (P.base.Rage || 0)) : amt;
    BZ.changePlayer(S, P, 'Rage', Math.min(amt, room), src);
    BZ.log(S, { type: 'rage', src: src ? src.uid : null, target: pid(P), amt: amt, cur: P.base.Rage });
    if (!(P.base.Enraged > 0) && P.base.Rage >= mx) enrage(S, P, src);
  };
  function enrage(S, P, src) {
    P.base.Enraged = 1;
    P.base.EnragedDuration = BZ.pattr(S, P, 'EnragedDurationMax') || BZ.ENRAGE_MS;
    BZ.changePlayer(S, P, 'Rage', -(P.base.Rage || 0), src);
    P.hand.forEach(function (C) { C.rt.Slow = 0; C.rt.Freeze = 0; }); // tooltip Rage: "removing Slow and Freeze"
    S.dirty = true;
    BZ.log(S, { type: 'enrage', on: true, src: src ? src.uid : null, target: pid(P), ms: P.base.EnragedDuration });
    BZ.emit(S, 'TTriggerOnPlayerEnraged', { player: P, side: P.idx, src: src || null, causer: src || null });
  }
  function enrageTick(S, P) {
    if (!(P.base.Enraged > 0)) return;
    P.base.EnragedDuration -= FRAME;
    if (P.base.EnragedDuration > 0) return;
    P.base.Enraged = 0; P.base.EnragedDuration = 0; S.dirty = true;
    BZ.log(S, { type: 'enrage', on: false, target: pid(P) });
    BZ.emit(S, 'TTriggerOnPlayerEnrageEnded', { player: P, side: P.idx });
    if ((P.base.Rage || 0) >= (BZ.pattr(S, P, 'RageMax') || BZ.RAGE_MAX)) enrage(S, P, null);
  }

  // ---------- bão cát (§1.11) ----------
  function stormHit(S) {
    var d = Math.round(S.storm.dmg);
    S.players.forEach(function (P) { BZ.hit(S, P, d, 'Sandstorm', null); });
  }
  function sandstorm(S) {
    var st = S.storm, cfg = BZ.SANDSTORM;
    if (!st.enabled && !st.force) return;
    if (!st.active) {
      if (st.enabled && S.t === cfg.countdownStart) BZ.log(S, { type: 'sandstorm', phase: 'countdown', ms: cfg.countdown });
      if (st.force || (st.enabled && S.t === cfg.countdownStart + cfg.countdown)) {
        st.active = true; st.force = false; st.dmg = cfg.baseDamage; st.acc = 0;
        BZ.log(S, { type: 'sandstorm', phase: 'start' });
        stormHit(S);
        st.tick = cfg.baseTick - cfg.tickDec;
        BZ.emit(S, 'TTriggerOnSandstorm', { side: 0 });
      }
      return;
    }
    st.acc += FRAME;
    if (st.acc >= st.tick) {
      stormHit(S);
      if (st.tick > cfg.tickFloor) st.tick -= cfg.tickDec;
      if (st.tick <= cfg.tickFloor) st.dmg += cfg.addScalar;
      st.acc = 0;
    }
  }

  // ---------- hàng đợi ưu tiên (§3.3, PrioQueue.cs:9-66; CombatSimEffectDelay = 0 [ĐỀ XUẤT]) ----------
  function processQueue(S) {
    for (var i = 0; i < BZ.PRIORITIES.length; i++) {
      var p = BZ.PRIORITIES[i], b = S.queue[p];
      S.queue[p] = [];
      for (var j = 0; j < b.length; j++) {
        var e = b[j];
        if (e.C.state === 'Alive' && activeIn(e.C, e.A.ActiveIn)) BZ.execAbility(S, e.C, e.A, e.ev, e.group);
        if (e.group && --e.group.left === 0) finishFire(S, e.group);
      }
    }
    var inc = S.incoming; S.incoming = [];
    for (var k = 0; k < inc.length; k++) (S.queue[inc[k].prio] || S.queue.Medium).push(inc[k]);
  }

  // ---------- chết (§1.12) ----------
  function checkDeath(S) {
    var order = [1, 0]; // đối thủ trước: cùng chết trong một khung → bàn 0 thắng (:4313-4341)
    for (var i = 0; i < 2; i++) {
      var P = S.players[order[i]];
      if (P.base.Health > 0) continue;
      if (!P.deathDone) {
        P.deathDone = true; P.base.Health = 0; S.dirty = true;
        BZ.emit(S, 'TTriggerOnPlayerDied', { player: P, side: P.idx }, true);
      }
      if (P.base.Health <= 0) { BZ.log(S, { type: 'death', target: pid(P) }); return 1 - P.idx; }
      BZ.log(S, { type: 'revive', target: pid(P), hp: P.base.Health });
    }
    return null;
  }

  // ---------- lượt thẻ (§1.2 bước 2, §1.3) ----------
  function cardPass(S) {
    for (var s = 0; s < 2; s++) {
      var hand = S.players[s].hand.slice();
      for (var i = 0; i < hand.length; i++) {
        var C = hand[i], rt = C.rt;
        if (rt.Haste > 0) { rt.Haste = Math.max(0, rt.Haste - FRAME); if (!rt.Haste && BZ.auraReads(S).Haste) S.dirty = true; }
        if (rt.Slow > 0) { rt.Slow = Math.max(0, rt.Slow - FRAME); if (!rt.Slow && BZ.auraReads(S).Slow) S.dirty = true; }
        if (rt.Freeze > 0) { rt.Freeze = Math.max(0, rt.Freeze - FRAME); if (!rt.Freeze && BZ.auraReads(S).Freeze) S.dirty = true; }
        if (C.state !== 'Alive' || C.section !== 'hand') continue;
        var max = BZ.effCooldown(S, C);
        if (max <= 0) continue;
        if ((BZ.cattr(S, C, 'CooldownDisabled') || 0) > 0) continue;
        if (BZ.isAmmo(S, C) && rt.Ammo <= 0) { C.cd = 0; continue; }
        var mult = (rt.Freeze > 0 ? BZ.FREEZE_MULT : 1) * (rt.Haste > 0 ? BZ.HASTE_MULT : 1) * (rt.Slow > 0 ? BZ.SLOW_MULT : 1);
        var delta = Math.ceil(FRAME * mult), cap = Math.floor(max / 20); // :4413-4418
        if (delta > cap) delta = cap;
        C.cd += delta;
        if (C.cd >= max) { C.cd = 0; BZ.fire(S, C, false); } // phần dư bị bỏ (:4198-4211)
      }
    }
  }

  function snapshot(S) {
    if (S.dirty) BZ.recompute(S);
    var c = new Array(S.cards.length);
    for (var i = 0; i < S.cards.length; i++) {
      var C = S.cards[i], max = C.section === 'hand' ? BZ.effCooldown(S, C) : 0;
      c[i] = [max > 0 ? Math.round(C.cd / max * 1000) / 1000 : 0, ('Ammo' in C.rt) ? C.rt.Ammo : -1,
        C.rt.Haste, C.rt.Slow, C.rt.Freeze, C.state === 'Alive' ? 0 : 1, C.rt.Flying ? 1 : 0];
    }
    var p = S.players.map(function (P) {
      var b = P.base;
      return [b.Health, b.Shield || 0, b.Burn || 0, b.Poison || 0, BZ.pattr(S, P, 'HealthRegen') || 0, b.Rage || 0,
        b.Enraged > 0 ? b.EnragedDuration : 0, BZ.pattr(S, P, 'HealthMax') || 0];
    });
    var f = { t: S.t, c: c, p: p, ev: S.frameEv };
    S.frameEv = [];
    return f;
  }

  // Khởi động: aura lần đầu, máu = máu tối đa, đạn = đạn tối đa
  BZ.initState = function (S) {
    BZ.recompute(S);
    S.players.forEach(function (P) { P.base.Health = P.attrs.HealthMax || P.base.HealthMax || 1; P.prevMax = P.attrs.HealthMax; });
    S.cards.forEach(function (C) { var am = C.attrs.AmmoMax || 0; if (am > 0) C.rt.Ammo = am; });
    S.dirty = true; BZ.recompute(S);
  };

  BZ.run = function (opts) {
    opts = opts || {};
    var S = BZ.makeState(opts), maxMs = opts.maxMs || BZ.MAX_MS, frames = [], winner = null, endMs = maxMs;
    var keepFrames = opts.frames !== false;
    try {
      BZ.initState(S);
      for (var t = 0; t < maxMs; t += FRAME) {
        S.t = t;
        if (S.timed.length) expireTimed(S);
        if (t === 0) BZ.emit(S, 'TTriggerOnFightStarted', { side: 0 }); // chạy ở khung 1 qua hàng đợi (:4076-4093)
        cardPass(S);
        if (t % BZ.POISON_REGEN_TICK === 0) { S.players.forEach(function (P) { poisonTick(S, P); }); S.players.forEach(function (P) { regenTick(S, P); }); }
        if (t % BZ.BURN_TICK === 0) S.players.forEach(function (P) { burnTick(S, P); });
        S.players.forEach(function (P) { enrageTick(S, P); });
        sandstorm(S);
        processQueue(S);
        var w = checkDeath(S);
        var f = snapshot(S);
        if (keepFrames || f.ev.length) frames.push(f);
        if (w !== null) { winner = w; endMs = t; break; }
      }
    } catch (e) {
      BZ.recordError(S, null, 'engine', e);
      S.fatal = String(e && e.stack || e);
    }
    if (winner === null) winner = 'draw'; // hết giờ = hoà [ĐỀ XUẤT §1.12; legacy: bàn 0 thua]
    return {
      winner: winner, endMs: endMs, frames: frames, seed: opts.seed, layout: BZ.FRAME_LAYOUT,
      cards: S.cards.map(function (C) { return { uid: C.uid, id: C.id, tier: C.tier, ench: C.ench, owner: C.owner, section: C.section, socket: C.socket, size: C.size }; }),
      players: S.players.map(function (P) { return { name: P.name, hero: P.hero, healthMax: P.attrs.HealthMax, health: P.base.Health }; }),
      errors: S.errors, fatal: S.fatal || null, overflow: S.overflow
    };
  };
  function expireTimed(S) {
    var keep = [];
    S.timed.forEach(function (x) { if (S.t >= x.until) x.undo(); else keep.push(x); });
    S.timed = keep;
  }
  BZ.addTimed = function (S, ms, undo) { S.timed.push({ until: S.t + ms, undo: undo }); };

  // ---------- quái → bàn (monsters.json, CODE-RUN §3.5) ----------
  BZ.boardFromMonster = function (m, uidPrefix) {
    var p = m.Player || {}, a = p.Attributes || {}, cards = [], pre = uidPrefix || ('m' + String(m.Id || '').slice(0, 4)), n = 0;
    function push(it, section, socket) {
      var tpl = BZ.tpl(it.TemplateId);
      if (!tpl) return;
      cards.push({ uid: pre + '-' + (n++), id: it.TemplateId, tier: it.Tier || tpl.StartingTier, ench: it.EnchantmentType || null,
        socket: socket, size: BZ.SIZE[tpl.Size] || 1, owner: null, section: section,
        attrs: it.Attributes && Object.keys(it.Attributes).length ? it.Attributes : undefined });
    }
    function sock(s) { var x = /(\d+)$/.exec(s || ''); return x ? +x[1] : 0; }
    ((p.Hand || {}).Items || []).forEach(function (it) { push(it, 'hand', sock(it.SocketId)); });
    ((p.Stash || {}).Items || []).forEach(function (it) { push(it, 'stash', sock(it.SocketId)); });
    (p.Skills || []).forEach(function (it, i) { push(it, 'skills', i); });
    var extra = {};
    for (var k in a) if (k !== 'HealthMax' && k !== 'Level' && k !== 'Prestige') extra[k] = a[k];
    var enc = (m.Encounters || [])[0];
    return { name: (enc && enc.Title) || m.InternalName, hero: null, level: a.Level || 1, healthMax: a.HealthMax || 100,
      cards: cards, attrs: extra, monsterId: m.Id };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BZ;
})(typeof window !== 'undefined' ? window : globalThis);
