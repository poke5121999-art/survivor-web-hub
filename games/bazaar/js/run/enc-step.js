/* Chợ Phiên — bước sự kiện (TCardEncounterStep) và sự kiện tức thì: chạy ability `TTriggerOnCardSelected` của thẻ gặp gỡ
   qua bộ DSL của sim (js/run/ooc.js). Spawn → thẻ vào thẳng bàn; Deal → pha loot (chọn miễn phí). Bộ lọc của Spawn/Deal
   đọc từ mô tả thẻ (SpawnContext bị xoá). Ability có tiền đề ngày (TRunConditionalCurrentDay) do sim xét theo run.day.
   Không có ability nào chạy được → đọc "Gain N XP / Gold / Income" trong mô tả; không đọc được thì không bày phần thưởng bịa.
   Bước mà dữ liệu không nói đủ (Spawn/Deal mất SpawnContext, chữ không nêu thẻ) tra bảng St.FX theo InternalName. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };
  var St = {};
  R.ENCOUNTERS = R.ENCOUNTERS || {};
  R.ENCOUNTERS.step = St;

  // Phần thưởng chung theo dải ngày [ĐỀ XUẤT TUNING.GENERIC_*]: chỉ còn cho chữ "Gain Gold and XP" không số (St.FX) và lưu cũ
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
    var text = St.filterText(e), filter = R.parseFilter(text || e.Title || '');
    if (R.filterEmpty(filter)) filter = R.phraseFilter(text, null) || filter; // "Get a Gumball" → Red/Blue/... Gumball
    R.ooc.withState(ctx, function (S) {
      var sim = root.BZSim, card = R.ooc.encounterCard(S, e), ev = { kind: 'TTriggerOnCardSelected', side: 0, src: card, card: card };
      abs.forEach(function (A) {
        if (!sim.prereqsOk(A.Prerequisites, { S: S, card: card, ev: ev })) return;
        var x = { S: S, card: card, ev: ev, source: { name: e.InternalName, desc: text }, out: { deals: deals }, filter: filter, isEncounter: true,
          hasThen: !!((e.Then && e.Then.length) || (St.fxOf(e) && St.fxOf(e).then)) };
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
        || (tp.Tags || []).concat(tp.HiddenTags || [], ci.tags || []).some(function (g) { return String(g).toLowerCase() === t; });
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

  // ---------- hiệu ứng thật của bước / sự kiện mà dữ liệu không nói đủ, khoá InternalName ('InternalName|Title' khi trùng tên) ----------
  // Spawn/Deal của thẻ gặp gỡ mất SpawnContext; nhiều bước Deal là bày THẺ GẶP GỠ kế tiếp chứ không phải vật phẩm. Nguồn: thẻ anh em
  // trong BZ_ENCOUNTERS (Steps của sự kiện cha), bazaardb D:\bazaar-ref\bazaardb\events.json (choices[].reward).
  //   filter: chữ làm bộ lọc Spawn/Deal (và bộ lọc đống đồ của sự kiện pile) thay cho Desc
  //   then:   bước kế tiếp ['InternalName bước' | 'event:InternalName'] hoặc fn(run) → danh sách đó; n = số được bày (mặc định hết)
  //   fx:     fn(ctx, e, after) → true nếu đã tự đặt pha
  // Không có trong bảng và chữ không nêu thẻ → không cho gì ngoài XP khi chọn (Investment Payout, Add Stove/Cooler, Thieves Guild,
  // The Cult, Farai): không bịa vật phẩm ngẫu nhiên.
  var BEX = function (n) { return '[Bex] ' + n; }, HADDY = function (n) { return 'Haddy - ' + n; };
  function upTo(kind, max) { // "Pick a Chest containing up to 30 Gold / 3 XP" (bazaardb Shrouded Figure): rương 1..max [ĐỀ XUẤT: chia đều]
    return function (ctx, e, after) {
      var v = 1 + R.randInt(ctx.run, max);
      if (kind === 'gold') R.gold(ctx, v, 'event'); else R.gainXp(ctx, v, 'event');
      R.finish(ctx, after);
      return true;
    };
  }
  var LEGENDARY = { filter: 'Get a Legendary-tier item' }; // "Pick a Chest containing a Legendary item"
  var FX = St.FX = {};
  // [RUN-04] chọn địa điểm enchant ngẫu nhiên hoặc The Artist
  FX["Fate's Crossroads"] = { fx: function (ctx, e, after) {
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
  } };
  // "Visit the Artist": bệ The Artist (người chơi chọn thẻ rồi chọn enchant)
  FX['Self Portrait'] = FX["[Laurel's Night Terrors] Check Out the Night Market"] = { fx: artist };
  // "Return to the previous options": giữ nguyên các lựa chọn đang bày
  FX["[Jules' Cafe] Nevermind"] = FX['[Likit] Nevermind'] = { fx: back };
  // "Gain 2 Medkit (Healing)" / "Get a Medkit (+Heal)": thẻ Med Kit
  FX['Med Kit (Level Up)'] = FX['Procure Medkit'] = { filter: 'Get a Med Kit' };
  FX['[Shrouded Figure] Choose Wealth'] = FX['[Shrouded Figure] Gold Chest'] = { fx: upTo('gold', 30) };
  FX['[Shrouded Figure] Choose Knowledge'] = FX['[Shrouded Figure] XP Only Chest'] = { fx: upTo('xp', 3) };
  FX['[Shrouded Figure] Legendary Chest'] = FX['[Shrouded Figure] Cult Member Legendary Chest'] = LEGENDARY;
  // Haddy: vòng quay ra MỘT giải trong các bước anh em; "Claim your prize!" = Magician's Top Hat (bazaardb Haddy)
  FX[HADDY('Spin the Wheel')] = { then: ['Bag of Gold', "Haddy's Hat Reward", 'Diamond Skill', 'Enchanted Item', 'Mystery Bundle', 'Gold Skill'].map(HADDY), n: 1 };
  FX[HADDY("Haddy's Hat Reward")] = { filter: "Get a Magician's Top Hat" };
  // "Run away!": Deal 1 trong hai sự kiện con "Run" (Gain Gold / Gain Speed)
  FX['Greenheart Ambush Run'] = { then: ['event:Greenheart Ambush Run Gold', 'event:Greenheart Ambush Run Speed'], n: 1 };
  // Bazball của Bex: Watch / Bet → hiệp 1 → 2 → 3 (mỗi hiệp cộng điểm ngẫu nhiên vào Custom_0 Kyvers / Custom_1 Rogues của người chơi,
  // Bet đặt Custom_2) → thắng / thua theo điểm, có cược hay không
  FX[BEX('Watch the Game')] = FX[BEX('Bet on the Game')] = { then: [BEX('1st Quarter')] };
  FX[BEX('1st Quarter')] = { then: [BEX('2nd Quarter')] };
  FX[BEX('2nd Quarter')] = { then: [BEX('3rd Quarter')] };
  FX[BEX('3rd Quarter')] = { then: function (run) {
    var p = run.pattrs || {}, win = (p.Custom_0 || 0) > (p.Custom_1 || 0), bet = (p.Custom_2 || 0) > 0;
    return [BEX(win ? (bet ? 'Wins - Bet' : 'Wins - No Bet') : (bet ? 'Lose - Bet' : 'Lose No Bet'))];
  } };
  FX[BEX('Wins - Bet')] = { filter: 'Get an Apparel item' }; // "... and some free merch" (= Get some Team Merch: "Get an Apparel item")
  FX[BEX('Lose No Bet')] = { filter: 'Get a Food item' };    // "But at least you got something to eat"
  // [ĐỀ XUẤT] "Try one of Likit's new treats": bày Food, chọn 1
  FX['[Likit] Test New Treats'] = { filter: 'Get a Food item' };
  // Statia "Gain 100 Max Health" (Desc chỉ ghi "This is not the end", không có ability): đúng như tên
  FX['Gain 100 Max Health Statia Free'] = { fx: function (ctx, e, after) { R.addHealthMax(ctx, 100); R.finish(ctx, after); return true; } };
  // [ĐỀ XUẤT] "Gain Gold and XP" không nêu số: vàng + XP chung theo dải ngày
  FX['The Lost Crate (Return It)|Return the Crate to Its Owner'] = { fx: function (ctx, e, after) {
    R.genericReward(ctx, 'gold'); R.genericReward(ctx, 'xp'); R.finish(ctx, after); return true;
  } };
  // Mountain Pass (bazaardb "DEALS 1"): trong bảy lựa chọn bazaardb chỉ hai cái có bước trong dữ liệu
  FX['Mountain Pass'] = { then: ['Lost Treasure', '[Jungle Ruins] Grab the Loot'], n: 1 };
  function artist(ctx, e, after) {
    var c = R.LEVEL_SLOT_KINDS.artist(ctx.run, null, {});
    if (!c) return false;
    R.ENCOUNTERS.pedestal.enter(ctx, { id: c.rec.Id }, after);
    return true;
  }
  function back(ctx, e, after) {
    if (ctx.run.phase.kind !== 'event') R.finish(ctx, after);
    return true;
  }
  St.fxOf = function (e) { return e ? FX[e.InternalName + '|' + e.Title] || FX[e.InternalName] || null : null; };
  St.filterText = function (e) { var fx = St.fxOf(e); return (fx && fx.filter) || (e && e.Desc) || ''; };
  // Bước kế tiếp: Then của dữ liệu (chuỗi Gumball, ba điều ước của Rit) hoặc St.FX.then; trả về [{t, id}] đủ điều kiện
  function nextOf(run, e) {
    var fx = St.fxOf(e), list = e.Then || [];
    if (!list.length && fx && fx.then) {
      var E = R.enc(), names = typeof fx.then === 'function' ? fx.then(run) : fx.then;
      list = names.map(function (nm) {
        var ev = /^event:/.test(nm), key = ev ? nm.slice(6) : nm, src = ev ? E.events : E.steps;
        for (var id in src) if (src[id].InternalName === key) return { t: ev ? 'event' : 'step', id: id };
        return null;
      }).filter(Boolean);
    }
    list = list.filter(function (o) { return R.ENCOUNTERS.event.optionOk(o, run); });
    if (fx && fx.then && fx.n && list.length > fx.n) {
      var pool = list.slice(); list = [];
      while (list.length < fx.n) list.push(pool.splice(R.randInt(run, pool.length), 1)[0]);
    }
    return list;
  }

  // Chọn một bước / sự kiện tức thì: XP khi chọn (ExperienceAwardUponSelection), ability, rồi loot hoặc kết thúc
  St.resolve = function (ctx, e, after) {
    R.gainXp(ctx, e.Xp || 0, 'select');
    R.log(ctx, { t: 'step', id: e.Id, name: e.InternalName });
    var fx = St.fxOf(e);
    if (fx && fx.fx && fx.fx(ctx, e, after)) return;
    var res = St.runAbilities(ctx, e);
    if (!res.ran) textReward(ctx, e.Desc); // không đọc được gì: chỉ XP khi chọn, không phần thưởng bịa
    if (ctx.run.phase.kind === 'end') return;
    // Bước dẫn tiếp (encounters.js Then, St.FX.then): Deal của bước chính là bày bộ kế tiếp này
    // (SpawnContext bị xoá) → bày Then thay cho Deal; được rời [ĐỀ XUẤT]
    var Ev = R.ENCOUNTERS.event, then = nextOf(ctx.run, e);
    if (then.length) {
      ctx.run.phase = { kind: 'event', eventId: null, stepId: e.Id, name: e.Title || e.InternalName, desc: R.encText(ctx.run, e, e.Desc || ''),
        choices: then.map(function (o) { return Ev.optionChoice(o, ctx.run, e); }), canExit: true, after: after };
      return;
    }
    var d = res.deals[0]; // một bước chỉ bày một lựa chọn (bước có nhiều Deal: lấy cái đầu) [ĐỀ XUẤT]
    if (d) {
      // "Get 3 Loot items" / "Get 2 Economic items": chữ nói lấy cả N thẻ đã bày (không phải chọn 1 trong N)
      var gm = /\bGet (\d+)\b/i.exec(R.encText(ctx.run, e, e.Desc || '')), n = Math.max(1, d.n);
      R.enterLoot(ctx, R.deal(ctx.run, d.filter, n, { tierMode: 'band' }), gm && +gm[1] === n ? n : 1, after, e.Id);
      return;
    }
    R.finish(ctx, after);
  };
  St.enter = function (ctx, r, after) { St.resolve(ctx, R.enc().steps[r.id], after); };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
