/* Chợ Phiên — bước sự kiện (TCardEncounterStep) và sự kiện tức thì: chạy ability `TTriggerOnCardSelected` của thẻ gặp gỡ
   qua bộ DSL của sim (js/run/ooc.js). Spawn → thẻ vào thẳng bàn; Deal → pha loot (chọn miễn phí). Bộ lọc của Spawn/Deal
   đọc từ mô tả thẻ (SpawnContext bị xoá). Ability có tiền đề ngày (TRunConditionalCurrentDay) do sim xét theo run.day.
   Không có ability nào chạy được → đọc "Gain N XP / Gold / Income" trong mô tả, không nữa thì phần thưởng chung [ĐỀ XUẤT]. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };
  var St = {};
  R.ENCOUNTERS = R.ENCOUNTERS || {};
  R.ENCOUNTERS.step = St;

  // Phần thưởng dự phòng theo dải ngày [ĐỀ XUẤT TUNING.GENERIC_*]
  R.genericReward = function (ctx, kind) {
    var run = ctx.run, band = R.bandTier(run);
    if (kind === 'xp') { R.gainXp(ctx, T().GENERIC_XP, 'generic'); return; }
    if (kind === 'item') {
      var c = R.deal(run, { kind: 'item', tiers: [band], any: [], not: [], names: [] }, 1, {})[0];
      if (c && R.gainCard(ctx, c, null, null, 'generic')) return;
    }
    R.gold(ctx, T().GENERIC_GOLD_BY_BAND[band] || 3, 'generic');
  };

  // Pha loot: chọn miễn phí trong `picks`; take = số được lấy (1, hoặc tất cả nếu CanSelectMultiple)
  R.enterLoot = function (ctx, picks, take, after, source) {
    if (!picks.length) { R.finish(ctx, after); return; }
    ctx.run.phase = { kind: 'loot', source: source || null, picks: picks.map(function (c) { return { card: c }; }),
      take: take || 1, taken: 0, after: after || 'endHour' };
    R.emit(ctx, { type: 'loot', n: picks.length });
  };
  R.lootChoose = function (ctx, cmd) {
    var ph = ctx.run.phase, p = ph.picks[cmd.i];
    if (!p) return 'loot slot ' + cmd.i + ' is empty';
    var ci = R.gainCard(ctx, p.card, cmd.section || null, cmd.socket == null ? null : cmd.socket, 'loot');
    if (!ci) return 'no space for ' + p.card.id;
    R.log(ctx, { t: 'loot', id: p.card.id, tier: p.card.tier });
    ph.picks.splice(cmd.i, 1);
    ph.taken++;
    if (ph.taken >= ph.take || !ph.picks.length) R.finish(ctx, ph.after);
  };
  R.lootLeave = function (ctx) { R.finish(ctx, ctx.run.phase.after); };

  function selectedAbilities(e) {
    var out = [];
    for (var k in (e.Abilities || {})) {
      var A = e.Abilities[k], tt = A.Trigger && A.Trigger.$type;
      if (!tt || tt === 'TTriggerOnCardSelected') out.push(A);
    }
    return out;
  }
  // Chạy ability "khi chọn" của thẻ gặp gỡ e. Trả về danh sách Deal cần bày ({filter, n}).
  St.runAbilities = function (ctx, e) {
    var abs = selectedAbilities(e), deals = [], ran = 0;
    if (!abs.length) return { deals: deals, ran: 0 };
    var filter = R.parseFilter(e.Desc || e.Title || '');
    if (R.filterEmpty(filter)) filter = R.phraseFilter(e.Desc || '', null) || filter; // "Get a Gumball" → Red/Blue/... Gumball
    R.ooc.withState(ctx, function (S) {
      var sim = root.BZSim, card = R.ooc.encounterCard(S, e), ev = { kind: 'TTriggerOnCardSelected', side: 0, src: card, card: card };
      abs.forEach(function (A) {
        if (!sim.prereqsOk(A.Prerequisites, { S: S, card: card, ev: ev })) return;
        var x = { S: S, card: card, ev: ev, source: { name: e.InternalName, desc: e.Desc || '' }, out: { deals: deals }, filter: filter, isEncounter: true };
        R.ooc.runAction(A.Action, ctx, x);
        ran++;
      });
    });
    return { deals: deals, ran: ran };
  };
  // Mô tả không kèm ability ("Study (Default Option): Gain 2 XP")
  function textReward(ctx, desc) {
    var m, hit = false;
    if ((m = /Gain (\d+) XP/i.exec(desc || ''))) { R.gainXp(ctx, +m[1], 'event'); hit = true; }
    if ((m = /Gain (\d+) Gold/i.exec(desc || ''))) { R.gold(ctx, +m[1], 'event'); hit = true; }
    if ((m = /Gain (\d+) Income/i.exec(desc || ''))) { R.income(ctx, +m[1]); hit = true; }
    return hit;
  }

  // Chọn một bước / sự kiện tức thì: XP khi chọn (ExperienceAwardUponSelection), ability, rồi loot hoặc kết thúc
  St.resolve = function (ctx, e, after) {
    R.gainXp(ctx, e.Xp || 0, 'select');
    R.log(ctx, { t: 'step', id: e.Id, name: e.InternalName });
    var res = St.runAbilities(ctx, e);
    if (!res.ran && !textReward(ctx, e.Desc)) R.genericReward(ctx, 'gold');
    if (ctx.run.phase.kind === 'end') return;
    // Bước dẫn tiếp (encounters.js Then: chuỗi Gumball, ba điều ước của Rit): Deal của bước chính là bày bộ kế tiếp này
    // (SpawnContext bị xoá) → bày Then thay cho Deal; được rời [ĐỀ XUẤT]
    var Ev = R.ENCOUNTERS.event, then = (e.Then || []).filter(function (o) { return Ev.optionOk(o, ctx.run); });
    if (then.length) {
      ctx.run.phase = { kind: 'event', eventId: null, stepId: e.Id, name: e.Title || e.InternalName, desc: e.Desc || '',
        choices: then.map(Ev.optionChoice), canExit: true, after: after };
      return;
    }
    var d = res.deals[0]; // một bước chỉ bày một lựa chọn (bước có nhiều Deal: lấy cái đầu) [ĐỀ XUẤT]
    if (d) { R.enterLoot(ctx, R.deal(ctx.run, d.filter, Math.max(1, d.n), { tierMode: 'band' }), 1, after, e.Id); return; }
    R.finish(ctx, after);
  };
  St.enter = function (ctx, r, after) { St.resolve(ctx, R.enc().steps[r.id], after); };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
