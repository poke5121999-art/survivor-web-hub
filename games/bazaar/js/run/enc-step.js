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
  // opts (tuỳ chọn) cho thầy có RerollRules: {rr: RerollRules, filter, n, tierMode} → pha mang rerolls / rerollCost / rerollStep / rerollMax
  // (cùng tên với pha thương nhân), `dealt` = id đã bày (không chia lại), `redeal` = bộ lọc để chia lại. [RUN-05]
  R.enterLoot = function (ctx, picks, take, after, source, opts) {
    if (!picks.length) { R.finish(ctx, after); return; }
    var ph = { kind: 'loot', source: source || null, picks: picks.map(function (c) { return { card: c }; }),
      take: take || 1, taken: 0, after: after || 'endHour', rerolls: 0, rerollCost: 0, rerollStep: 0, rerollMax: null };
    var rr = opts && opts.rr;
    if (rr && rr.TotalAllowedRerolls) {
      ph.rerolls = rr.TotalAllowedRerolls; ph.rerollCost = rr.StartingCost || 0; ph.rerollStep = rr.CostIncrease || 0;
      ph.rerollMax = rr.CostMax != null ? rr.CostMax : null;
      ph.dealt = picks.map(function (c) { return c.id; });
      ph.redeal = { filter: opts.filter, n: opts.n, tierMode: opts.tierMode, enc: opts.enc || null };
    }
    ctx.run.phase = ph;
    R.emit(ctx, { type: 'loot', n: picks.length });
  };
  // reroll: chia lại bằng cùng bộ lọc, loại các thẻ đã bày, trừ vàng [RUN-05]
  R.lootReroll = function (ctx) {
    var run = ctx.run, ph = run.phase;
    if (!ph.redeal || ph.rerolls <= 0) return 'no rerolls left';
    if (ph.taken > 0) return 'cannot reroll after taking a card';
    if (run.gold < ph.rerollCost) return 'not enough gold for reroll (' + run.gold + ' < ' + ph.rerollCost + ')';
    var ex = {}; ph.dealt.forEach(function (id) { ex[id] = 1; });
    var cards = R.dealFor(run, ph.redeal.enc, ph.redeal.filter, ph.redeal.n, { tierMode: ph.redeal.tierMode, exclude: ex, shop: !!(ph.redeal.enc && R.shopRec(ph.redeal.enc)) });
    if (!cards.length) return 'no other cards to deal';
    R.gold(ctx, -ph.rerollCost, 'reroll');
    ph.rerolls--;
    ph.picks = cards.map(function (c) { return { card: c }; });
    ph.dealt = ph.dealt.concat(cards.map(function (c) { return c.id; }));
    ph.rerollCost = ph.rerollCost + ph.rerollStep;
    if (ph.rerollMax != null) ph.rerollCost = Math.min(ph.rerollMax, ph.rerollCost);
    R.emit(ctx, { type: 'reroll' });
    R.log(ctx, { t: 'reroll', source: ph.source });
  };
  R.lootChoose = function (ctx, cmd) {
    var ph = ctx.run.phase, p = ph.picks[cmd.i];
    if (!p) return 'loot slot ' + cmd.i + ' is empty';
    var ci = R.gainCard(ctx, p.card, cmd.section || null, cmd.socket == null ? null : cmd.socket, 'loot');
    if (!ci) return R.noSpaceReason(ctx.run, p.card);
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

  // ---------- lựa chọn có điều kiện "(if you have a X)" / "(if you are Hero)" [RUN-03] ----------
  // SelectionRequirements bị xoá khỏi DB: điều kiện nằm ở đầu mô tả. have → thẻ trên tay + kho khớp TÊN hoặc TAG; are → hero.
  var COND_RE = /^\(if you (have|are) (?:an? )?(.+?)\)/i;
  St.conditionOf = function (e) {
    var m = COND_RE.exec((e && e.Desc) || '');
    return m ? { kind: m[1].toLowerCase(), terms: m[2].split(/\s*,\s*|\s+or\s+/i).map(function (t) { return t.replace(/^(an?|the)\s+/i, '').trim(); }).filter(Boolean) } : null;
  };
  function hasTerm(run, term) {
    var t = term.toLowerCase();
    return run.board.hand.concat(run.board.stash).some(function (ci) {
      var tp = R.tpl(ci.id);
      if (!tp) return false;
      return R.title(tp).toLowerCase() === t || String(tp.InternalName || '').toLowerCase() === t
        || (tp.Tags || []).concat(tp.HiddenTags || []).some(function (g) { return String(g).toLowerCase() === t; });
    });
  }
  // null nếu đủ điều kiện (hoặc không có điều kiện); chuỗi mô tả thiếu gì nếu không
  St.conditionMissing = function (run, e) {
    var c = St.conditionOf(e);
    if (!c) return null;
    var ok = c.kind === 'are' ? c.terms.some(function (h) { return h.toLowerCase() === String(run.hero).toLowerCase(); })
      : c.terms.some(function (t) { return hasTerm(run, t); });
    return ok ? null : (c.kind === 'are' ? 'hero is not ' : 'no ') + c.terms.join(' or ') + (c.kind === 'are' ? '' : ' in hand or stash');
  };

  // Bước đặc biệt theo tên (không đọc ra từ ability): [RUN-04] Fate's Crossroads = chọn địa điểm enchant ngẫu nhiên hoặc The Artist
  var SPECIAL = {
    "Fate's Crossroads": function (ctx, e, after) {
      var run = ctx.run, taken = {}, K = R.LEVEL_SLOT_KINDS, out = [];
      ['enchantRandom', 'artist'].forEach(function (k) {
        var c = K[k](run, null, taken);
        if (!c) return;
        taken[c.rec.Id] = 1;
        out.push({ kind: 'pedestal', id: c.rec.Id, name: c.rec.Title || c.rec.InternalName, desc: R.encText(run, c.rec, c.rec.Desc || ''), tier: c.rec.StartingTier, slot: k });
      });
      if (!out.length) return false;
      run.phase = { kind: 'event', eventId: null, stepId: e.Id, name: e.Title || e.InternalName, desc: R.encText(run, e, e.Desc || ''), choices: out, canExit: false, after: after };
      return true;
    }
  };

  // Chọn một bước / sự kiện tức thì: XP khi chọn (ExperienceAwardUponSelection), ability, rồi loot hoặc kết thúc
  St.resolve = function (ctx, e, after) {
    R.gainXp(ctx, e.Xp || 0, 'select');
    R.log(ctx, { t: 'step', id: e.Id, name: e.InternalName });
    if (SPECIAL[e.InternalName] && SPECIAL[e.InternalName](ctx, e, after)) return;
    var res = St.runAbilities(ctx, e);
    if (!res.ran && !textReward(ctx, e.Desc)) R.genericReward(ctx, 'gold');
    if (ctx.run.phase.kind === 'end') return;
    // Bước dẫn tiếp (encounters.js Then: chuỗi Gumball, ba điều ước của Rit): Deal của bước chính là bày bộ kế tiếp này
    // (SpawnContext bị xoá) → bày Then thay cho Deal; được rời [ĐỀ XUẤT]
    var Ev = R.ENCOUNTERS.event, then = (e.Then || []).filter(function (o) { return Ev.optionOk(o, ctx.run); });
    if (then.length) {
      ctx.run.phase = { kind: 'event', eventId: null, stepId: e.Id, name: e.Title || e.InternalName, desc: R.encText(ctx.run, e, e.Desc || ''),
        choices: then.map(function (o) { return Ev.optionChoice(o, ctx.run, e); }), canExit: true, after: after };
      return;
    }
    var d = res.deals[0]; // một bước chỉ bày một lựa chọn (bước có nhiều Deal: lấy cái đầu) [ĐỀ XUẤT]
    if (d) { R.enterLoot(ctx, R.deal(ctx.run, d.filter, Math.max(1, d.n), { tierMode: 'band' }), 1, after, e.Id); return; }
    R.finish(ctx, after);
  };
  St.enter = function (ctx, r, after) { St.resolve(ctx, R.enc().steps[r.id], after); };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
