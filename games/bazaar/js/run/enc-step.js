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

  // Thuộc tính người chơi vĩnh viễn (vào trận qua R.playerBoard: HealthRegen...)
  R.addPattr = function (ctx, attr, v) {
    if (!v) return;
    var run = ctx.run;
    run.pattrs = run.pattrs || {};
    run.pattrs[attr] = (run.pattrs[attr] || 0) + v;
    R.emit(ctx, { type: 'playerAttr', attr: attr, delta: v });
  };
  // Mọi vật phẩm (tay + kho) mang loại `tag` được cộng vĩnh viễn `v` vào thuộc tính `attr` (inst.mods, như ooc readBack)
  R.buffItems = function (ctx, tag, attr, v) {
    var run = ctx.run;
    run.board.hand.concat(run.board.stash).forEach(function (ci) {
      var tp = R.tpl(ci.id), tags = ((tp && tp.Tags) || []).concat(ci.tags || []);
      if (tags.indexOf(tag) < 0) return;
      ci.mods = ci.mods || {};
      ci.mods[attr] = (ci.mods[attr] || 0) + v;
      R.emit(ctx, { type: 'cardAttr', uid: ci.uid, attr: attr, delta: v });
    });
  };
  // Lựa chọn tự dựng (kind 'generic', key 'tên:biến thể') cho sự kiện mà bản demo mất bước [WIKI2 E12]. fn(ctx, after) → 'phase' nếu tự đặt pha.
  // Finn's Big Bite (2025-03-24): "Guardian's Gravy Plate: You gain 5% max Health and your Shield items gain +10 Shield; Restorative
  // Risotto: ... Heal items gain +10 Heal; Vitality Stew: ... 5 Regeneration".
  function maxHpPct(ctx, pct) { R.addHealthMax(ctx, Math.round(ctx.run.healthMax * pct / 100)); }
  R.GENERIC_FX = {
    'finn:gravy': function (ctx) { maxHpPct(ctx, 5); R.buffItems(ctx, 'Shield', 'ShieldApplyAmount', 10); },
    'finn:risotto': function (ctx) { maxHpPct(ctx, 5); R.buffItems(ctx, 'Heal', 'HealAmount', 10); },
    'finn:stew': function (ctx) { maxHpPct(ctx, 5); R.addPattr(ctx, 'HealthRegen', 5); }
  };
  // Phần thưởng chung theo dải ngày [ĐỀ XUẤT TUNING.GENERIC_*]: chỉ còn cho chữ "Gain Gold and XP" không số (St.FX) và lưu cũ
  R.genericReward = function (ctx, kind, after) {
    var run = ctx.run, band = R.bandTier(run);
    if (R.GENERIC_FX[kind]) return R.GENERIC_FX[kind](ctx, after);
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
  // opts.next = {id, deals} (thẻ sinh ra không vừa chỗ, St.resolve): nhặt xong / bỏ qua thì đi tiếp phần còn lại của bước đó
  // (Then, Deal) thay vì kết thúc gặp gỡ; opts.spawned: thẻ là quà sinh ra (không nhập bậc, không tính là "chọn lấy")
  R.enterLoot = function (ctx, picks, take, after, source, opts) {
    if (!picks.length) { R.finish(ctx, after); return; }
    var ph = { kind: 'loot', source: source || null, picks: picks.map(function (c) { return { card: c }; }),
      take: take || 1, taken: 0, after: after || 'endHour', rerolls: 0, rerollCost: 0, rerollStep: 0, rerollMax: null };
    if (opts && opts.next) ph.next = opts.next;
    if (opts && opts.spawned) ph.spawned = true;
    var rr = opts && opts.rr;
    if (rr && rr.TotalAllowedRerolls) {
      ph.rerolls = rr.TotalAllowedRerolls; ph.rerollCost = rr.StartingCost || 0; ph.rerollStep = rr.CostIncrease || 0;
      ph.rerollMax = rr.CostMax != null ? rr.CostMax : null;
      ph.dealt = picks.map(function (c) { return c.id; });
      ph.redeal = { filter: opts.filter, n: opts.n, tierMode: opts.tierMode, enc: opts.enc || null, allowLoot: !!opts.allowLoot };
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
    var cards = R.dealFor(run, ph.redeal.enc, ph.redeal.filter, ph.redeal.n, { tierMode: ph.redeal.tierMode, exclude: ex, shop: !!(ph.redeal.enc && R.shopRec(ph.redeal.enc)), allowLoot: !!ph.redeal.allowLoot });
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
    var ci = R.gainCard(ctx, p.card, cmd.section || null, cmd.socket == null ? null : cmd.socket, ph.spawned ? 'spawn' : 'loot', !!ph.spawned);
    if (!ci) return R.noSpaceReason(ctx.run, p.card);
    R.log(ctx, { t: 'loot', id: p.card.id, tier: p.card.tier });
    ph.picks.splice(cmd.i, 1);
    ph.taken++;
    if (ph.taken >= ph.take || !ph.picks.length) lootDone(ctx);
  };
  R.lootLeave = function (ctx) { lootDone(ctx); };
  function lootDone(ctx) {
    var ph = ctx.run.phase, nx = ph.next, E = R.enc(), e = nx && (E.steps[nx.id] || E.events[nx.id]);
    if (e) St.afterAbilities(ctx, e, nx.deals || [], ph.after); else R.finish(ctx, ph.after);
  }

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
    var abs = selectedAbilities(e), deals = [], overflow = [], ran = 0;
    if (!abs.length) return { deals: deals, overflow: overflow, ran: 0 };
    var ph = ctx.run.phase, parent = ph && ph.kind === 'event' && ph.eventId ? R.enc().events[ph.eventId] : null;
    var text = St.filterText(e), filter = St.encTier(R.parseFilter(text || e.Title || ''), e, parent);
    if (R.filterEmpty(filter)) filter = R.phraseFilter(text, null) || filter; // "Get a Gumball" → Red/Blue/... Gumball
    (T().EVENT_REWARD_TIER_RE || []).forEach(function (rt) { if (rt[0].test(e.InternalName || '')) filter.tiers = [rt[1]]; }); // Gumball: Đồng [WIKI2 E7]
    R.ooc.withState(ctx, function (S) {
      var sim = root.BZSim, card = R.ooc.encounterCard(S, e), ev = { kind: 'TTriggerOnCardSelected', side: 0, src: card, card: card };
      abs.forEach(function (A) {
        if (!sim.prereqsOk(A.Prerequisites, { S: S, card: card, ev: ev })) return;
        var x = { S: S, card: card, ev: ev, source: { name: e.InternalName, desc: text }, out: { deals: deals, overflow: overflow }, filter: filter,
          isEncounter: true, hasThen: !!((e.Then && e.Then.length) || (St.fxOf(e) && St.fxOf(e).then)) };
        R.ooc.runAction(A.Action, ctx, x);
        ran++;
      });
    });
    return { deals: deals, overflow: overflow, ran: ran };
  };
  // Bậc của phần thưởng mà chữ không nêu bậc ("Get a Small Tool" của Utility Box Bạc): bậc của chính thẻ sự kiện (bazaardb ghi mỗi bậc
  // một bản "Get a Silver-tier ..."), không phải bậc gieo theo ngày. Chỉ vật phẩm (thầy dạy kỹ năng theo dải bậc), không đụng "copy of any item".
  // Bước con chọn từ màn sự kiện (đợt 9e, R1-3): bậc của chính bước, không cao hơn sự kiện cha đang bày nó (lên cấp, Fates, bước nối tiếp: như cũ): bazaardb events.json ghi bậc từng lựa chọn và khớp
  // StartingTier của bước (The Lost Crate Bạc / "Open It" SILVER; Likit Bạc / "Test New Treats" BRONZE; mọi bước Đồng của Finn's Vàng BRONZE).
  // Bộ lọc chỉ có "non-X" ("Get a non-Weapon item" của Recycling Center) cũng là lọc vật phẩm (trước bị coi là rỗng nên chia theo dải ngày).
  St.encTier = function (f, e, parent) {
    if (!f || f.kind === 'skill' || (f.tiers && f.tiers.length) || f.copy || !e || !e.StartingTier) return f;
    if (R.filterEmpty(f) && !(f.kind === 'item' && f.not && f.not.length)) return f;
    var E = R.enc();
    if (E.events[e.Id] === e) f.tiers = [e.StartingTier];
    else if (parent && parent.StartingTier && E.steps[e.Id] === e) f.tiers = [R.tierIndex(parent.StartingTier) < R.tierIndex(e.StartingTier) ? parent.StartingTier : e.StartingTier];
    return f;
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
    if (!c) return St.noTarget(run, e);
    var ok = c.kind === 'are' ? c.terms.some(function (h) { return h.toLowerCase() === String(run.hero).toLowerCase(); })
      : c.terms.some(function (t) { return hasTerm(run, t); });
    return ok ? null : (c.kind === 'are' ? 'hero is not ' : 'no ') + c.terms.join(' or ') + (c.kind === 'are' ? '' : ' in hand or stash');
  };
  // Bước mà mọi ability chỉ tác động lên thẻ của người chơi ("Upgrade your leftmost Poison item", "Your items gain 3 Poison") và đích
  // (chấm bằng sim trên bàn hiện tại) rỗng thì không làm được gì: ẩn như "(if you have ...)" thay vì để chọn rồi trôi giờ. null = làm được.
  var CARD_ACTS = { TActionCardUpgrade: 1, TActionCardEnchant: 1, TActionCardEnchantRandom: 1, TActionCardModifyAttribute: 1, TActionCardTransform: 1 };
  St.noTarget = function (run, e) {
    var abs = selectedAbilities(e);
    if (!abs.length || St.fxOf(e) || !abs.every(function (A) { var a = A.Action; return a && CARD_ACTS[a.$type] && a.Target && a.Target.TargetSection !== 'SelectionSet'; })) return null;
    var sim = root.BZSim, S = R.readState(run), card = R.ooc.encounterCard(S, e), ev = { kind: 'TTriggerOnCardSelected', side: 0, src: card, card: card };
    var hit = abs.some(function (A) {
      return sim.targets(A.Action.Target, { S: S, card: card, ev: ev }).some(function (T) { return T.owner === 0; });
    });
    return hit ? null : 'no item this choice can act on';
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
  // Wink: bản demo mất vế cuối; bazaardb "Transform and Upgrade all your non-Legendary items into items from any Hero, then gain 10 Prestige"
  //   desc: chữ hiện thay Desc (R.encText);  also: fn(ctx, e) chạy sau ability của bước
  FX["Pay Wink's Toll"] = { desc: 'Transform and upgrade all your non-Legendary items into items from any Hero, then gain 10 Prestige',
    also: function (ctx) { R.prestige(ctx, 10); } };
  // Mountain Pass [WIKI2 E3] Version 2.0.0 + trang (2025-05-24): "25% Chance: Fight a monster from same day; 25%: monster from next day;
  // 40%: Positive Outcome (Get 3 Loot Items / Gain 5 Regen / Generous Tip: 10 Gold / Invest in the Convoy: 1 Income / A Routine Job:
  // 1 XP and 5 Gold / Escape to the Sea: 5 XP); 10%: Negative Outcome (Gain the Skill Valley Fever / Insect Bite)". Sáu kết quả tốt
  // chia đều, hai kỹ năng xấu chia đều [ĐỀ XUẤT: trang không ghi tỉ lệ con]. Gieo khi chọn; kết quả ghi log {t:'mountainPass', outcome}.
  var MOUNTAIN_GOOD = [
    ['loot', function (ctx, e, after) {
      var picks = R.deal(ctx.run, { kind: 'item', tiers: null, sizes: null, any: ['Loot'], not: [], hero: 'any', names: [], enchanted: false, copy: false }, 3, { tierMode: 'day' });
      R.enterLoot(ctx, picks, picks.length, after, e.Id); return true;
    }],
    ['regen', function (ctx) { R.addPattr(ctx, 'HealthRegen', 5); }],
    ['tip', function (ctx) { R.gold(ctx, 10, 'event'); }],
    ['invest', function (ctx) { R.income(ctx, 1); }],
    ['routine', function (ctx) { R.gainXp(ctx, 1, 'event'); R.gold(ctx, 5, 'event'); }],
    ['sea', function (ctx) { R.gainXp(ctx, 5, 'event'); }]
  ];
  St.MOUNTAIN_ODDS = [25, 25, 40, 10]; // đấu cùng ngày, đấu ngày sau, tốt, xấu
  FX['Mountain Pass'] = { fx: function (ctx, e, after) {
    var run = ctx.run, k = R.rollWeights(run, St.MOUNTAIN_ODDS), Cb = R.ENCOUNTERS.combat;
    if (k === 0 || k === 1) {
      var r = Cb.pickDayRef(run, [run.day + k]);
      R.log(ctx, { t: 'mountainPass', outcome: k ? 'fightNextDay' : 'fightSameDay' });
      if (r) { Cb.enter(ctx, r, after); return true; }
      R.finish(ctx, after); return true;
    }
    if (k === 2) {
      var g = MOUNTAIN_GOOD[R.randInt(run, MOUNTAIN_GOOD.length)];
      R.log(ctx, { t: 'mountainPass', outcome: g[0] });
      if (g[1](ctx, e, after) === true) return true;
      R.finish(ctx, after); return true;
    }
    var bad = ['Valley Fever', 'Insect Bite'][R.randInt(run, 2)], C = root.BZ_CARDS, id = null;
    for (var cid in C) if (R.title(C[cid]) === bad && R.isSkill(C[cid])) { id = cid; break; }
    R.log(ctx, { t: 'mountainPass', outcome: 'skill:' + bad });
    if (id) R.gainCard(ctx, { id: id, tier: R.tpl(id).StartingTier || 'Bronze', ench: null }, null, null, 'event');
    R.finish(ctx, after); return true;
  } };
  // Study (2024-11-29): "Gain 1 Additional XP" [WIKI2 E6] (bản demo: Xp 2 + chữ "Gain 2 XP" = 4 XP)
  FX['Study (Default Option)'] = { desc: 'Gain 1 XP', fx: function (ctx, e, after) { R.gainXp(ctx, 1, 'event'); R.finish(ctx, after); return true; } };
  // Relax (2025-06-01) = Rest của bản demo: "Start your next fight with 100 Shield per Level" [WIKI2 E8]: khiên giữ trong run.nextFightShield
  // tới trận kế (R.fightBoards cộng vào bàn, Cb.fight xoá)
  FX.Rest = { fx: function (ctx, e, after) {
    var run = ctx.run;
    run.nextFightShield = (run.nextFightShield || 0) + 100 * run.level;
    R.emit(ctx, { type: 'playerAttr', attr: 'NextFightShield', delta: 100 * run.level });
    R.finish(ctx, after); return true;
  } };
  // Regenerative Tincture (2025-02-25): "Gain Regeneration equal to your level" [WIKI2 E15] (bản demo: 2 x cấp)
  FX['Regenerative Tincture'] = { desc: 'Permanently gain Regen equal to your level', fx: function (ctx, e, after) {
    R.addPattr(ctx, 'HealthRegen', ctx.run.level); R.finish(ctx, after); return true;
  } };
  // Borrow (2025-05-18): "Lose 1 Income and gain 8 / 7 / 6 gold" ngày 1-2 / 3-4 / 5-6 [WIKI2 E15] (bản demo 9 / 8 / 7)
  [['Borrow (Day 1-2)', 8], ['Borrow (Day 3-4)', 7], ['Borrow (Day 5-6)', 6]].forEach(function (b) {
    FX[b[0]] = { desc: 'Lose 1 Income and gain ' + b[1] + ' Gold', fx: function (ctx, e, after) {
      R.income(ctx, -1); R.gold(ctx, b[1], 'event'); R.finish(ctx, after); return true;
    } };
  });
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

  // Chọn một bước / sự kiện tức thì: ability, rồi loot hoặc kết thúc (KHÔNG cộng ExperienceAwardUponSelection: WIKI2 R1, xem clock.js endHour)
  St.resolve = function (ctx, e, after) {
    R.log(ctx, { t: 'step', id: e.Id, name: e.InternalName });
    var fx = St.fxOf(e);
    if (fx && fx.fx && fx.fx(ctx, e, after)) return;
    var res = St.runAbilities(ctx, e);
    if (!res.ran) textReward(ctx, e.Desc); // không đọc được gì: chỉ XP khi chọn, không phần thưởng bịa
    if (fx && fx.also) fx.also(ctx, e);
    if (ctx.run.phase.kind === 'end') return;
    // Thẻ sinh ra không vừa tay + kho: bày thành pha nhặt (lấy hết, bán bớt cho có chỗ, hoặc bỏ qua) rồi mới đi tiếp [FLOW-9]
    if (res.overflow.length) {
      R.emit(ctx, { type: 'overflow', n: res.overflow.length, source: e.Id });
      R.enterLoot(ctx, res.overflow, res.overflow.length, after, e.Id, { next: { id: e.Id, deals: res.deals }, spawned: true });
      return;
    }
    St.afterAbilities(ctx, e, res.deals, after);
  };
  // Phần sau ability của một bước: bước kế (Then) / Deal thành pha loot / kết thúc
  St.afterAbilities = function (ctx, e, deals, after) {
    // Bước dẫn tiếp (encounters.js Then, St.FX.then): Deal của bước chính là bày bộ kế tiếp này
    // (SpawnContext bị xoá) → bày Then thay cho Deal; được rời [ĐỀ XUẤT]
    var Ev = R.ENCOUNTERS.event, then = nextOf(ctx.run, e);
    if (then.length) {
      ctx.run.phase = { kind: 'event', eventId: null, stepId: e.Id, name: e.Title || e.InternalName, desc: R.encText(ctx.run, e, e.Desc || ''),
        choices: then.map(function (o) { return Ev.optionChoice(o, ctx.run, e); }), canExit: true, after: after };
      return;
    }
    var d = deals[0]; // một bước chỉ bày một lựa chọn (bước có nhiều Deal: lấy cái đầu) [ĐỀ XUẤT]
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
