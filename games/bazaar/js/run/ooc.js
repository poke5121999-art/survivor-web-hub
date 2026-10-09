/* Chợ Phiên — chạy ability NGOÀI TRẬN bằng chính bộ DSL của sim (BZSim): dựng một trạng thái sim từ bàn người chơi,
   chạy hành động (đích, giá trị, tiền đề, aura đều của sim), rồi đọc lại: bậc / enchantment / chênh lệch thuộc tính thẻ
   (C.d → inst.mods) và thuộc tính người chơi (Gold, Income, Experience, HealthMax, Prestige...).
   Dùng cho: trigger ngoài trận của vật phẩm (bán, mua, đầu ngày, đầu giờ, hết trận, chọn gặp gỡ, nâng bậc) và ability của
   thẻ gặp gỡ (sự kiện tức thì, bước sự kiện). Không sửa js/sim: chỉ gọi hàm nó xuất ra.
   Hành động vòng chơi (TActionGameSpawnCards / DealCards / Reroll) sim để trống → xử lý ở RUN_ACTIONS bên dưới. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var O = R.ooc = {};
  var BZ = function () { return root.BZSim; };
  var T = function () { return R.TUNING; };
  var ANY_STATE = ['Alive', 'Destroyed'];
  var PLAYER_ATTRS = ['Gold', 'Income', 'Experience', 'HealthMax', 'Prestige'];
  O.approx = {};   // đếm hành động/trigger ngoài trận chưa làm được (để báo cáo, giống BZSim.approx)
  function note(k) { O.approx[k] = (O.approx[k] || 0) + 1; }

  // Bàn người chơi cho sim (cũng là bàn 0 của trận đấu)
  R.playerBoard = function (run) {
    var attrs = { Gold: run.gold, Income: run.income, Experience: run.xp, Prestige: run.prestige };
    for (var k in (run.pattrs || {})) attrs[k] = run.pattrs[k];
    var b = { name: run.hero, hero: run.hero, level: run.level, healthMax: run.healthMax, attrs: attrs,
      cards: R.allCards(run).map(R.simCard) };
    if (run.effects && run.effects.length) b.effects = run.effects.slice(); // id TCardPlayerEffect (BZ_HEROES.effects), sim engine boardEffects
    return b;
  };

  // Dựng trạng thái sim từ run; fn(S) chạy hành động; rồi ghi ngược vào ctx.run
  O.withState = function (ctx, fn, extra) {
    var run = ctx.run, sim = BZ();
    var S = sim.makeState({ boards: [R.playerBoard(run), { name: 'encounter', healthMax: 1, cards: [] }],
      seed: R.seedInt(run), day: run.day, hour: run.hour + 1, sandstorm: false, combatType: (extra && extra.combatType) || 'PVE' });
    sim.initState(S);
    var P = S.players[0], before = {};
    for (var n in P.base) before[n] = P.base[n] || 0;
    var res = fn(S);
    readBack(ctx, S, before);
    return res;
  };
  function readBack(ctx, S, before) {
    var run = ctx.run, P = S.players[0];
    S.cards.forEach(function (C) {
      if (C.owner !== 0) return;
      var ci = R.findCard(run, C.uid);
      if (!ci) return;
      if (C.tier !== ci.tier) { var from = ci.tier; ci.tier = C.tier; R.emit(ctx, { type: 'upgrade', uid: ci.uid, from: from, to: C.tier, why: 'effect' }); }
      if ((C.ench || null) !== (ci.ench || null)) { ci.ench = C.ench || null; R.emit(ctx, { type: 'enchant', uid: ci.uid, ench: ci.ench }); }
      for (var k in C.d) {
        if (!C.d[k]) continue;
        ci.mods[k] = (ci.mods[k] || 0) + C.d[k];
        R.emit(ctx, { type: 'cardAttr', uid: ci.uid, attr: k, delta: C.d[k] });
      }
      if (Object.keys(C.addTags || {}).length) note('addTags (sim makeCard không đọc thẻ gắn thêm)');
    });
    var d = function (n) { return (P.base[n] || 0) - (before[n] || 0); };
    R.gold(ctx, d('Gold'), 'effect');
    R.income(ctx, d('Income'));
    R.prestige(ctx, d('Prestige'));
    if (d('HealthMax')) { run.healthMax = Math.max(1, run.healthMax + d('HealthMax')); R.emit(ctx, { type: 'healthMax', delta: d('HealthMax') }); }
    Object.keys(P.base).forEach(function (n) {
      if (PLAYER_ATTRS.indexOf(n) >= 0 || /^(Health|Shield|Burn|Poison|Rage|Enraged|EnragedDuration|Level)$/.test(n)) return;
      var dv = d(n);
      if (!dv) return;
      run.pattrs = run.pattrs || {};
      run.pattrs[n] = (run.pattrs[n] || 0) + dv; // thuộc tính người chơi vĩnh viễn khác (HealthRegen, CritChance...) → vào trận
      R.emit(ctx, { type: 'playerAttr', attr: n, delta: dv });
    });
    if (d('Experience')) R.gainXp(ctx, d('Experience'), 'effect'); // sau cùng: lên cấp dựa trên run đã cập nhật
  }

  // Thẻ giả cho ability của thẻ gặp gỡ (sự kiện/bước): chủ là người chơi (bàn 0), không nằm trên bàn
  O.encounterCard = function (S, e) {
    var tags = {}; (e.Tags || []).forEach(function (t) { tags[t] = 1; });
    return { uid: '__enc', id: e.Id, tpl: { Tiers: {}, Abilities: {}, Enchantments: {} }, owner: 0, section: 'encounter', state: 'Alive',
      tier: e.StartingTier || 'Bronze', socket: -1, size: 2, tb: {}, d: {}, rt: {}, attrs: {}, un: {}, tags: tags, hidden: {},
      baseTags: e.Tags || [], baseHidden: [], addTags: {}, abilities: [], auras: [], inst: null };
  };

  // ---------- chạy một hành động: hành động vòng chơi xử lý ở đây, còn lại giao cho sim ----------
  // ctx2 = {S, card, ev, source: {desc, enc}, out: {deals: []}}
  var RUN_ACTIONS = O.RUN_ACTIONS = {
    TActionAnd: function (act, rc, x) { (act.Actions || []).forEach(function (a) { O.runAction(a, rc, x); }); },
    TActionGameSpawnCards: function (act, rc, x) { // đưa thẳng thẻ vào bàn (Spawn): số = Limit, bộ lọc đọc từ mô tả
      var n = Math.round(BZ().value((act.SpawnContext || {}).Limit, x)) || 1;
      var f = x.filter;
      if (!f) { note('Spawn không có mô tả: ' + (x.source && x.source.name)); R.genericReward(rc, 'gold'); return; }
      R.deal(rc.run, f, n, { tierMode: 'band' }).forEach(function (card) {
        if (!R.gainCard(rc, card, null, null, 'spawn', true)) R.emit(rc, { type: 'lost', id: card.id, why: 'noSpace' });
      });
    },
    TActionGameDealCards: function (act, rc, x) { // bày một lựa chọn miễn phí (Deal) → pha loot
      var n = Math.round(BZ().value((act.SpawnContext || {}).Limit, x)) || 1;
      var f = x.filter;
      if (!f) { note('Deal không có mô tả: ' + (x.source && x.source.name)); R.genericReward(rc, 'item'); return; }
      x.out.deals.push({ filter: f, n: n });
    },
    TActionGameReroll: function () { note('TActionGameReroll ngoài cửa hàng'); },
    // Biến hình (SpawnContext đích bị xoá) [ĐỀ XUẤT]: thẻ đích (chấm bằng sim) đổi thành một vật phẩm khác cùng cỡ, có cùng bậc,
    // thuộc bể hero (mô tả "from any Hero" → mọi hero), giữ tag mô tả nêu ("Transform the Small Reagents" → Reagent khác).
    // Giữ uid/ô/bậc; enchantment giữ nếu thẻ mới có loại đó; mods và quest xoá. Đích là ô hiệu ứng (bếp của Jules): bỏ qua.
    TActionCardTransform: function (act, rc, x) {
      var run = rc.run, sim = BZ(), tg = act.Target || {};
      if (/SocketEffects$/.test(tg.TargetSection || '')) { note('Transform ô hiệu ứng (socket effect) chưa có'); return; }
      var desc = (x.source && x.source.desc) || '', f = R.parseFilter(desc);
      var targets = sim.targets(tg, { S: x.S, card: x.card, ev: x.ev }).filter(function (T) { return T.owner === 0 && T.section !== 'skills'; });
      targets.forEach(function (T) {
        var ci = R.findCard(run, T.uid);
        if (!ci) return;
        var old = R.tpl(ci.id), anyHero = /any Hero/i.test(desc);
        var cands = R.pool('item').filter(function (id) {
          var t = R.tpl(id);
          if (id === ci.id || t.Size !== old.Size || !t.Tiers || !t.Tiers[ci.tier] || R.tierIndex(t.StartingTier) > R.tierIndex(ci.tier)) return false;
          if (!anyHero && (t.Heroes || []).indexOf(run.hero) < 0 && (t.Heroes || []).indexOf('Common') < 0) return false;
          return !f.any.length || f.any.some(function (tag) { return (t.Tags || []).concat(t.HiddenTags || []).indexOf(tag) >= 0; });
        });
        if (!cands.length) { note('Transform: không có thẻ cùng cỡ/bậc cho ' + old.InternalName); return; }
        var nid = cands[R.randInt(run, cands.length)], nt = R.tpl(nid), from = ci.id;
        ci.id = nid; ci.mods = {}; delete ci.qp; delete ci.qd;
        if (ci.ench && !(nt.Enchantments && nt.Enchantments[ci.ench])) ci.ench = null;
        R.emit(rc, { type: 'transform', uid: ci.uid, from: from, to: nid, tier: ci.tier });
        R.log(rc, { t: 'transform', from: from, to: nid });
      });
    }
  };
  // Hành động không làm ngoài trận [ĐỀ XUẤT]: TransformDestroyed (chỉ có nghĩa trong trận) → thẻ gặp gỡ trả phần thưởng chung;
  // Destroy ("Join the Cult", vé thám hiểm), ExitReplacementSet, bảng loại trừ / giờ sau: bỏ qua.
  var FALLBACK = { TActionCardTransformDestroyed: 'gold', TActionExitReplacementSet: null,
    TActionCardDestroy: null, TActionGameSetNextHourSpawnContext: null, TActionGameAddToExclusionSet: null,
    TActionGameRemoveFromExclusionSet: null };
  // ---------- hành động nhắm "SelectionSet" (hàng đang bày của thương nhân) ----------
  // Sim trả rỗng cho SelectionSet (không có hàng trong trận) → làm ở đây trên run.phase.stock: Lucky Clover (nâng bậc ngẫu nhiên),
  // Coupon / Galactic Translator (BuyPrice), Dreampearl (yểm ngẫu nhiên). Điều kiện đích chấm bằng sim trên thẻ tạm có BuyPrice = giá bày.
  function isSelection(act) { var t = act && act.Target; return !!t && t.TargetSection === 'SelectionSet'; }
  O.stockCards = function (S, stock) {
    var sim = BZ(), out = [];
    stock.forEach(function (s, i) {
      var C = sim.makeCard(S, { uid: '__sel' + i, id: s.card.id, tier: s.card.tier, ench: s.card.ench || null, socket: i, section: 'hand',
        attrs: { BuyPrice: s.price } }, 1);
      if (!C) return;
      C.attrs = {}; for (var k in C.tb) C.attrs[k] = C.tb[k];
      C.section = 'selection'; C.stockIndex = i;
      out.push(C);
    });
    return out;
  };
  O.selectionAction = function (act, rc, x) {
    var run = rc.run, ph = run.phase, sim = BZ();
    if (ph.kind !== 'merchant' || !ph.stock || !ph.stock.length) { if (ph.kind !== 'merchant') note('SelectionSet ngoài thương nhân: ' + act.$type); return; }
    var vctx = { S: x.S, card: x.card, ev: x.ev }, tg = act.Target, list = O.stockCards(x.S, ph.stock);
    if (tg.Conditions) list = sim.filterCards(tg.Conditions, list, vctx);
    if (tg.$type === 'TTargetCardRandom') {
      var n = act.TargetCount ? Math.round(sim.value(act.TargetCount, vctx)) : 1, pickd = [];
      while (pickd.length < n && list.length) pickd.push(list.splice(R.randInt(run, list.length), 1)[0]);
      list = pickd;
    }
    list.forEach(function (C) {
      var s = ph.stock[C.stockIndex], tpl = R.tpl(s.card.id), why = null;
      if (act.$type === 'TActionCardUpgrade') {
        var nt = act.UpgradeToTier && tpl.Tiers[act.UpgradeToTier] && R.tierIndex(act.UpgradeToTier) > R.tierIndex(s.card.tier) ? act.UpgradeToTier : sim.nextTier(tpl, s.card.tier);
        if (!nt) return;
        var oldBase = R.price(s.card, s.card.tier).buy, ratio = oldBase > 0 ? s.price / oldBase : 1;
        s.card.tier = nt;
        s.price = s.price === 0 ? 0 : Math.max(0, sim.roundAway(R.price(s.card, nt).buy * ratio)); // giữ mức giảm đã có
        why = 'upgrade';
      } else if (act.$type === 'TActionCardModifyAttribute' && act.AttributeType === 'BuyPrice') {
        var v = sim.value(act.Value, vctx), op = act.Operation || 'Add', p = s.price;
        p = op === 'Multiply' ? p * v : op === 'Subtract' ? p - v : op === 'Set' ? v : p + v;
        p = Math.max(0, sim.roundAway(p));
        if (p === s.price) return;
        if (p < s.price) s.discount = true;
        s.price = p; why = 'price';
      } else if (act.$type === 'TActionCardEnchantRandom' || act.$type === 'TActionCardEnchant') {
        if (act.PreventOverride && s.card.ench) return;
        var have = tpl.Enchantments || {}, E = null;
        if (act.$type === 'TActionCardEnchant') E = have[act.Enchantment] ? act.Enchantment : null;
        else {
          var opts = (act.Enchantments || []).filter(function (o) { return have[o.Enchantment] && o.Enchantment !== s.card.ench; });
          var k = R.rollWeights(run, opts.map(function (o) { return o.Weight || 1; }));
          E = k < 0 ? null : opts[k].Enchantment;
        }
        if (!E) return;
        s.card.ench = E; why = 'enchant';
      } else { note('SelectionSet: ' + act.$type + (act.AttributeType ? ' ' + act.AttributeType : '')); return; }
      R.emit(rc, { type: 'stock', i: C.stockIndex, card: R.clone(s.card), price: s.price, discount: !!s.discount, why: why, src: x.card && x.card.uid });
    });
  };

  O.runAction = function (act, rc, x) {
    if (!act) return;
    if (isSelection(act)) { O.selectionAction(act, rc, x); return; }
    var f = RUN_ACTIONS[act.$type];
    if (f) { f(act, rc, x); return; }
    if (act.$type in FALLBACK) {
      note(act.$type);
      if (x.isEncounter && FALLBACK[act.$type]) R.genericReward(rc, FALLBACK[act.$type]);
      return;
    }
    if (act.$type === 'TActionPlayerModifyAttribute' && act.Duration) { note('PlayerModifyAttribute có Duration (tạm thời)'); return; }
    BZ().runAction(act, { S: x.S, card: x.card, ev: x.ev, crit: false, fired: false, cache: new Map(), cast: 0 });
  };

  // ---------- trigger ngoài trận của vật phẩm ----------
  var srcIn = function (t, C, ev, S) { return !t || BZ().targets(t, { S: S, card: C, ev: ev }, null, null, ANY_STATE).indexOf(ev.src) >= 0; };
  var TRIG = O.TRIGGERS = {
    TTriggerOnCardSold: function (tr, C, ev, S) { return srcIn(tr.Subject || { $type: 'TTargetCardSelf' }, C, ev, S); },
    TTriggerOnCardPurchased: function (tr, C, ev, S) { return srcIn(tr.Subject || { $type: 'TTargetCardSelf' }, C, ev, S); },
    TTriggerOnCardUpgraded: function (tr, C, ev, S) { return srcIn(tr.Subject || { $type: 'TTargetCardSelf' }, C, ev, S); },
    TTriggerOnDayStarted: function () { return true; },
    TTriggerOnHourStarted: function () { return true; },
    TTriggerOnFightEnded: function (tr, C, ev) {
      if (tr.CombatType && tr.CombatType !== ev.combatType) return false;
      if (tr.CombatOutcome && tr.CombatOutcome !== ev.outcome) return false;
      return true;
    },
    TTriggerOnEncounterSelected: encCond,
    // Thương nhân bày hàng (vào + đổi hàng), vào / rời một gặp gỡ (Lucky Clover, Coupon, Galactic Translator, Dreampearl):
    // Conditions chấm trên thẻ gặp gỡ (Tag Merchant, Id...) như OnEncounterSelected
    TTriggerOnEncounterCardsDealt: encCond,
    TTriggerOnEncounterEntered: encCond,
    TTriggerOnEncounterExited: encCond,
    TTriggerOnCardQuestCompleted: function (tr, C, ev, S) { return srcIn(tr.Subject || { $type: 'TTargetCardSelf' }, C, ev, S); }
  };
  function encCond(tr, C, ev, S) {
    if (!tr.Conditions) return true;
    return !!ev.src && BZ().filterCards(tr.Conditions, [ev.src], { S: S, card: C, ev: ev }).length > 0;
  }

  // ---------- "get a ..." của vật phẩm: bộ lọc Spawn/Deal đọc từ chữ tooltip (SpawnContext bị xoá) ----------
  // Ưu tiên câu có "get/gain"; không đọc ra bộ lọc thì tìm tên thẻ chứa mọi từ của cụm sau "get a" ("Premium Piggle" →
  // Premium Green/Red/Orange/Yellow Piggles, trừ chính nó). Bậc = bậc thẻ nguồn (TUNING.SPAWN_INHERIT_TIER).
  O.spawnFilter = function (lines, C) {
    var getLines = lines.filter(function (l) { return /\b(get|gets|gain)\b/i.test(l); });
    var text = (getLines.length ? getLines : lines).join(' ');
    var f = R.parseFilter(text), own = R.title(R.tpl(R.baseId(C.id)));
    f.names = f.names.filter(function (n) { return n !== own; });
    if (R.filterEmpty(f)) f = R.phraseFilter(text, R.baseId(C.id));
    if (!f) return null;
    if (T().SPAWN_INHERIT_TIER && !(f.tiers && f.tiers.length) && !f.copy) f.tiers = [C.tier];
    return f;
  };

  // Chữ tooltip ứng với một ability: ability thưởng quest (khoá 'Q<g.e>:<id>' trong mẫu dẫn xuất) → dòng thưởng của mục đó;
  // ability gốc → các dòng tooltip trừ dòng thưởng quest (Safe: "get 3 Spare Change" không lẫn "...and get a Bag of Jewels").
  function abilityLines(sim, C, A) {
    var all = sim.cardText({ uid: C.uid, id: C.id, tier: C.tier, ench: C.ench, socket: C.socket, size: C.size, section: C.section }) || [];
    var base = R.tpl(R.baseId(C.id)), qkey = null, k, rewardRaw = {};
    for (k in (C.tpl.Abilities || {})) if (C.tpl.Abilities[k] === A && /^Q\d+\.\d+:/.test(k)) qkey = k.slice(1, k.indexOf(':'));
    ((base && base.Quests) || []).forEach(function (g, gi) {
      (g.Entries || []).forEach(function (e, ei) {
        ((e.Reward && e.Reward.Localization && e.Reward.Localization.Tooltips) || []).forEach(function (t) {
          if (t.Content) (rewardRaw[t.Content.Text] = rewardRaw[t.Content.Text] || []).push(gi + '.' + ei);
        });
      });
    });
    return all.filter(function (l) {
      var keys = rewardRaw[l.raw];
      return qkey ? !!keys && keys.indexOf(qkey) >= 0 : !keys;
    }).map(function (l) { return l.text; });
  }

  // ---------- quest ----------
  // TQuestGroup {Prerequisites, Repeatable, Entries[TQuestEntry {AttributeType, Prerequisites, Trigger, Target, Update{Value}, Reward}]}.
  // Mỗi lần trigger của mục khớp: tiến độ += Update.Value; đủ Target → mục xong, cả nhóm xong (IsComplete = mục nào đó xong,
  // TQuestGroup.cs), phần thưởng phủ lên thẻ (R.questTplId), rồi TTriggerOnCardQuestCompleted. Quest chạy khi thẻ ở tay hoặc kho
  // [ĐỀ XUẤT: mục quest không có ActiveIn]. Trigger trong trận (OnItemUsed, OnCardPerformedSlow/Haste...) đếm từ sự kiện của trận
  // vừa đấu (Q.fromFight). OnCardAttributeChanged (thẻ khác cộng thẳng vào Quest_N) chưa làm.
  var Q = R.quests = {};
  function questTpl(ci) { var t = R.tpl(ci.id); return t && t.Quests && t.Quests.length ? t : null; }
  function groupDone(ci, g) { return (ci.qd || []).some(function (k) { return +k.split('.')[0] === g; }); }
  function entryText(o) { var t = o && o.Localization && o.Localization.Tooltips; return t && t[0] && t[0].Content ? t[0].Content.Text : ''; }
  Q.listens = function (ci, kind) { var t = questTpl(ci); return !!t && JSON.stringify(t.Quests).indexOf(kind) >= 0; };
  // Cho giao diện: mọi mục quest của thẻ [{group, entry, key, attr, progress, goal, done, text, reward, icon}]
  Q.status = function (ci) {
    var t = questTpl(ci), out = [];
    if (!t) return out;
    t.Quests.forEach(function (g, gi) {
      (g.Entries || []).forEach(function (e, ei) {
        var key = gi + '.' + ei, done = (ci.qd || []).indexOf(key) >= 0;
        out.push({ group: gi, entry: ei, key: key, attr: e.AttributeType, progress: done ? e.Target : ((ci.qp || {})[key] || 0), goal: e.Target || 1,
          done: done, closed: !done && groupDone(ci, gi) && !(g.Repeatable || g.IsRepeatable), text: entryText(e), reward: entryText(e.Reward),
          icon: e.IconKeyOverride || null });
      });
    });
    return out;
  };
  function trigMatch(tr, C, ev, S) {
    var f = TRIG[tr.$type] || BZ().TRIGGERS[tr.$type];
    return !!f && !!f(tr, C, ev, S);
  }
  // Cộng tiến độ cho mọi thẻ quest của người chơi trong S (bàn 0). Trả về uid các thẻ vừa xong một mục.
  Q.progress = function (ctx, S, kind, ev) {
    var run = ctx.run, sim = BZ(), done = [];
    S.players[0].hand.concat(S.players[0].stash).forEach(function (C) {
      var ci = R.findCard(run, C.uid), t = ci && questTpl(ci);
      if (!t) return;
      t.Quests.forEach(function (g, gi) {
        var rep = !!(g.Repeatable || g.IsRepeatable);
        if (!rep && groupDone(ci, gi)) return;
        var pctx = { S: S, card: C, ev: ev };
        if (g.Prerequisites && g.Prerequisites.length && !sim.prereqsOk(g.Prerequisites, pctx)) return;
        (g.Entries || []).some(function (e, ei) {
          var trs = e.Trigger && e.Trigger.$type === 'TTriggerOr' ? e.Trigger.Triggers || [] : [e.Trigger];
          if (!trs.some(function (tr) { return tr && tr.$type === kind && trigMatch(tr, C, ev, S); })) return false;
          if (e.Prerequisites && e.Prerequisites.length && !sim.prereqsOk(e.Prerequisites, pctx)) return false;
          var key = gi + '.' + ei, goal = e.Target || 1, inc = e.Update && e.Update.Value ? Math.round(sim.value(e.Update.Value, pctx)) : 1;
          ci.qp = ci.qp || {};
          var before = ci.qp[key] || 0, now = Math.min(goal, before + Math.max(0, inc));
          if (now === before) return false;
          ci.qp[key] = now;
          R.emit(ctx, { type: 'quest', uid: ci.uid, group: gi, entry: ei, key: key, progress: now, goal: goal });
          if (now < goal) return false;
          ci.qd = ci.qd || [];
          if (ci.qd.indexOf(key) < 0) ci.qd.push(key);
          if (rep) ci.qp[key] = 0;
          R.emit(ctx, { type: 'questDone', uid: ci.uid, group: gi, entry: ei, key: key, reward: entryText(e.Reward) });
          R.log(ctx, { t: 'quest', id: ci.id, key: key });
          done.push(ci.uid);
          return !rep; // nhóm đã xong: các mục còn lại của nhóm thôi đếm
        });
      });
    });
    return done;
  };
  // Trigger trong trận đếm sau trận từ sự kiện của BZSim.run (frames giữ mọi khung có sự kiện): loại sự kiện → trigger
  var FIGHT_EV = { fire: 'TTriggerOnItemUsed', slow: 'TTriggerOnCardPerformedSlow', haste: 'TTriggerOnCardPerformedHaste',
    freeze: 'TTriggerOnCardPerformedFreeze', crit: 'TTriggerOnCardCritted', destroy: 'TTriggerOnCardPerformedDestruction',
    charge: 'TTriggerOnCardPerformedCharge', reload: 'TTriggerOnCardPerformedReload' };
  Q.fromFight = function (ctx, boards, result) {
    var run = ctx.run, kinds = {}, k;
    R.allCards(run).forEach(function (ci) { for (k in FIGHT_EV) if (Q.listens(ci, FIGHT_EV[k])) kinds[k] = 1; });
    if (!Object.keys(kinds).length) return;
    var sim = BZ(), S = sim.makeState({ boards: R.clone(boards), seed: 1, day: run.day, hour: run.hour + 1, sandstorm: false });
    sim.initState(S);
    var byUid = {}; S.cards.forEach(function (C) { byUid[C.uid] = C; });
    var done = [];
    (result.frames || []).forEach(function (f) {
      (f.ev || []).forEach(function (e) {
        var src = kinds[e.type] && byUid[e.src];
        if (!src) return;
        var tc = typeof e.target === 'string' ? byUid[e.target] || null : null;
        var ev = { kind: FIGHT_EV[e.type], side: src.owner, card: src, src: src, tcard: tc };
        done = done.concat(Q.progress(ctx, S, FIGHT_EV[e.type], ev));
      });
    });
    done.forEach(function (uid) { O.fire(ctx, 'TTriggerOnCardQuestCompleted', { uid: uid }); });
  };

  // kind: tên trigger; info: {uid (thẻ chủ thể), combatType, outcome, enc (thẻ gặp gỡ)}
  O.fire = function (ctx, kind, info) {
    info = info || {};
    var run = ctx.run, any = false, quest = false;
    // lọc nhanh: có thẻ nào nghe trigger này không (tránh dựng trạng thái sim mỗi giờ); mẫu đã phủ thưởng quest nếu có
    R.allCards(run).forEach(function (ci) {
      var tpl = R.tpl(R.questTplId(ci));
      for (var k in (tpl && tpl.Abilities) || {}) { var tr = tpl.Abilities[k].Trigger; if (tr && JSON.stringify(tr).indexOf(kind) >= 0) any = true; }
      var E = ci.ench && tpl && tpl.Enchantments ? tpl.Enchantments[ci.ench] : null;
      for (var j in (E && E.Abilities) || {}) { var tr2 = E.Abilities[j].Trigger; if (tr2 && JSON.stringify(tr2).indexOf(kind) >= 0) any = true; }
      if (ci.section !== 'skills' && Q.listens(ci, kind)) quest = true;
    });
    if (!any && !quest) return;
    var completed = [];
    O.withState(ctx, function (S) {
      var sim = BZ(), ev = { kind: kind, side: 0, combatType: info.combatType, outcome: info.outcome };
      if (info.uid) S.cards.forEach(function (C) { if (C.uid === info.uid) { ev.src = C; ev.card = C; } });
      if (info.enc) { ev.src = O.encounterCard(S, info.enc); ev.card = ev.src; }
      S.players[0].hand.concat(S.players[0].skills, S.players[0].stash).forEach(function (C) {
        C.abilities.forEach(function (A) {
          var trs = A.Trigger && A.Trigger.$type === 'TTriggerOr' ? A.Trigger.Triggers || [] : [A.Trigger];
          var tr = trs.filter(function (t) { return t && t.$type === kind; })[0];
          if (!tr) return;
          if (!sim.activeIn(C, A.ActiveIn) || A.WorksIn === 'InCombatOnly') return;
          if (!TRIG[kind] || !TRIG[kind](tr, C, ev, S)) return;
          if (!sim.prereqsOk(A.Prerequisites, { S: S, card: C, ev: ev })) return;
          var x = { S: S, card: C, ev: ev, source: { name: C.tpl.InternalName }, out: { deals: [] }, filter: null, isEncounter: false };
          var act = A.Action;
          if (act && /^TActionGame(Spawn|Deal)Cards$/.test(act.$type)) {
            // chữ tooltip của thẻ ("When you buy this ..., get a Premium Piggle") làm bộ lọc (O.spawnFilter)
            var lines = abilityLines(sim, C, A);
            x.filter = O.spawnFilter(lines, C);
            if (!x.filter) { note('Spawn/Deal của vật phẩm: ' + C.tpl.InternalName + ' (mô tả không có "get ..." đọc được)'); return; }
          }
          R.emit(ctx, { type: 'trigger', kind: kind, uid: C.uid });
          O.runAction(act, ctx, x);
          x.out.deals.forEach(function (d) { // Deal từ vật phẩm: chia ngay vào bàn như Spawn [ĐỀ XUẤT: không ngắt pha hiện tại]
            R.deal(run, d.filter, 1, { tierMode: 'band' }).forEach(function (card) { R.gainCard(ctx, card, null, null, 'deal'); });
          });
        });
      });
      if (quest) completed = Q.progress(ctx, S, kind, ev);
    });
    completed.forEach(function (uid) { O.fire(ctx, 'TTriggerOnCardQuestCompleted', { uid: uid }); });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
