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
  var ANY_STATE = ['Alive', 'Destroyed'];
  var PLAYER_ATTRS = ['Gold', 'Income', 'Experience', 'HealthMax', 'Prestige'];
  O.approx = {};   // đếm hành động/trigger ngoài trận chưa làm được (để báo cáo, giống BZSim.approx)
  function note(k) { O.approx[k] = (O.approx[k] || 0) + 1; }

  // Bàn người chơi cho sim (cũng là bàn 0 của trận đấu)
  R.playerBoard = function (run) {
    var attrs = { Gold: run.gold, Income: run.income, Experience: run.xp, Prestige: run.prestige };
    for (var k in (run.pattrs || {})) attrs[k] = run.pattrs[k];
    return { name: run.hero, hero: run.hero, level: run.level, healthMax: run.healthMax, attrs: attrs,
      cards: R.allCards(run).map(R.simCard) };
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
    TActionGameReroll: function () { note('TActionGameReroll ngoài cửa hàng'); }
  };
  // Hành động không làm ngoài trận [ĐỀ XUẤT]: Transform (SpawnContext đích bị xoá) → thẻ gặp gỡ trả phần thưởng chung;
  // Destroy ("Join the Cult", vé thám hiểm), ExitReplacementSet, bảng loại trừ / giờ sau: bỏ qua.
  var FALLBACK = { TActionCardTransform: 'gold', TActionCardTransformDestroyed: 'gold', TActionExitReplacementSet: null,
    TActionCardDestroy: null, TActionGameSetNextHourSpawnContext: null, TActionGameAddToExclusionSet: null,
    TActionGameRemoveFromExclusionSet: null };
  O.runAction = function (act, rc, x) {
    if (!act) return;
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
    TTriggerOnEncounterSelected: function (tr, C, ev, S) {
      if (!tr.Conditions) return true;
      return BZ().filterCards(tr.Conditions, [ev.src], { S: S, card: C, ev: ev }).length > 0;
    }
  };
  // kind: tên trigger; info: {uid (thẻ chủ thể), combatType, outcome, enc (thẻ gặp gỡ)}
  O.fire = function (ctx, kind, info) {
    info = info || {};
    var run = ctx.run, any = false;
    // lọc nhanh: có thẻ nào nghe trigger này không (tránh dựng trạng thái sim mỗi giờ)
    R.allCards(run).forEach(function (ci) {
      var tpl = R.tpl(ci.id);
      for (var k in (tpl && tpl.Abilities) || {}) { var tr = tpl.Abilities[k].Trigger; if (tr && JSON.stringify(tr).indexOf(kind) >= 0) any = true; }
      var E = ci.ench && tpl && tpl.Enchantments ? tpl.Enchantments[ci.ench] : null;
      for (var j in (E && E.Abilities) || {}) { var tr2 = E.Abilities[j].Trigger; if (tr2 && JSON.stringify(tr2).indexOf(kind) >= 0) any = true; }
    });
    if (!any) return;
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
            // mô tả của chính ability trong tooltip (thường "Get a Chocolate Bar") làm bộ lọc
            var text = (sim.cardText({ uid: C.uid, id: C.id, tier: C.tier, ench: C.ench, socket: C.socket, size: C.size, section: C.section }) || [])
              .map(function (l) { return l.text; }).join(' ');
            x.filter = R.parseFilter(text);
            if (!x.filter.names.length && !x.filter.any.length) { note('Spawn/Deal của vật phẩm: ' + C.tpl.InternalName); return; }
          }
          R.emit(ctx, { type: 'trigger', kind: kind, uid: C.uid });
          O.runAction(act, ctx, x);
          x.out.deals.forEach(function (d) { // Deal từ vật phẩm: chia ngay vào bàn như Spawn [ĐỀ XUẤT: không ngắt pha hiện tại]
            R.deal(run, d.filter, 1, { tierMode: 'band' }).forEach(function (card) { R.gainCard(ctx, card, null, null, 'deal'); });
          });
        });
      });
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
