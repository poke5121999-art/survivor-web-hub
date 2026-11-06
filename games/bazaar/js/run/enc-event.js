/* Chợ Phiên — sự kiện (TCardEncounterEvent không phải thương nhân). Loại suy ra ở tools/data.py (encounters.js `Kind`):
   - instant: không có SelectionContext → chạy ability khi chọn (Cache of Riches: +vàng, Candy Stash: Spawn) rồi xong;
   - pile:    chọn miễn phí (SelectionIsFree) → chia `Limit` thẻ theo mô tả ("Get a Silver-tier Weapon", "Teaches Freeze skills"),
              lấy 1 (hoặc tất cả nếu CanSelectMultiple); ability đi kèm (vd "+N Gold") chạy trước;
   - choice:  bày `Limit` bước con (nối theo tên vì NextEncounterOnSelection bị xoá), chọn 1 → enc-step;
   - start:   lựa chọn mở màn của hero [WIKI §1.1]: Thu nhập / Vật phẩm yểm bùa / Kỹ năng. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };
  var Ev = {};
  R.ENCOUNTERS = R.ENCOUNTERS || {};
  R.ENCOUNTERS.event = Ev;

  function limitOf(run, l, dflt) {
    if (Array.isArray(l)) return l[0] + R.randInt(run, l[1] - l[0] + 1);
    return l || dflt;
  }
  function heroOk(e, run) { var h = e.Heroes || []; return !h.length || h.indexOf('Common') >= 0 || h.indexOf(run.hero) >= 0; }

  Ev.enter = function (ctx, r, after) {
    var run = ctx.run, e = R.enc().events[r.id], St = R.ENCOUNTERS.step;
    after = after || 'endHour';
    if (e.Kind === 'merchant') { R.ENCOUNTERS.merchant.enter(ctx, r, after); return; } // tham chiếu kiểu 'event' trỏ tới thương nhân
    var fx = St.fxOf(e);
    // instant, hoặc pile mà St.FX biết hiệu ứng thật (rương của Shrouded Figure, Mountain Pass): chạy như một bước
    if (e.Kind === 'instant' || (e.Kind === 'pile' && fx && (fx.fx || fx.then))) { St.resolve(ctx, e, after); return; }
    if (e.Kind === 'pile') {
      St.runAbilities(ctx, e); // "Get {ability.0} Gold and a Bronze-tier Loot item": phần vàng
      if (run.phase.kind === 'end') return;
      var f = St.encTier(R.parseFilter(St.filterText(e), {}), e), n = limitOf(run, e.Limit, 1); // chữ không nêu bậc: bậc của sự kiện
      if (f.names.length > 1 && n >= f.names.length) { // "Sharpening Stone, Extract and Cinders": mỗi tên một thẻ
        var cards = [];
        f.names.forEach(function (nm) { cards = cards.concat(R.deal(run, Object.assign({}, f, { names: [nm] }), 1, { tierMode: 'band' })); });
        R.enterLoot(ctx, cards, e.Rules && e.Rules.CanSelectMultiple ? cards.length : 1, after, e.Id);
      } else {
        var tm = f.kind === 'skill' ? 'band' : 'day', sh = R.shopRec(e), pr = T().EVENT_PILE_RULES[e.InternalName] || null;
        if (pr && pr.hero) f.hero = pr.hero; // Pearl's Dig Site: "items from any hero and from the Monster pool" [WIKI2 E9]
        // chữ không nêu thẻ ("Choose this Chest", "Enter the Thieves Guild", Farai không mô tả) và không có bể bazaardb: không chia bừa
        var picks = !sh && R.filterEmpty(f) && !f.kind ? [] : R.dealFor(run, e, f, n, { tierMode: tm, shop: !!sh, allowLoot: !!(pr && pr.monsterLoot) });
        var rr = e.Rules && e.Rules.RerollRules; // thầy kỹ năng: reroll theo RerollRules [RUN-05], bazaardb ghi đè (1 lần, giá theo bậc)
        if (sh && sh.reroll && sh.reroll.cost != null) rr = { TotalAllowedRerolls: sh.reroll.n, StartingCost: sh.reroll.cost, CostIncrease: 0 };
        if (pr && pr.rr) rr = pr.rr; // Pearl's Dig Site: reroll vô hạn 1, 2, 3... vàng
        R.enterLoot(ctx, picks, e.Rules && e.Rules.CanSelectMultiple ? picks.length : 1, after, e.Id,
          { rr: rr, filter: f, n: n, tierMode: tm, enc: e, allowLoot: !!(pr && pr.monsterLoot) });
      }
      R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
      return;
    }
    // Deadly Duel / Epic Battle (2025-03-05): "Fight a random Monster from your current day or the next day, of any rarity" [WIKI2 E10]
    if (e.Kind === 'fight' && !(e.Options && e.Options.length)) {
      var mr = R.ENCOUNTERS.combat.pickDayRef(run, [run.day, run.day + 1]);
      R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
      if (mr) { R.ENCOUNTERS.combat.enter(ctx, mr, after); return; }
    }
    var choices;
    if (e.Kind === 'choice' || e.Kind === 'chain' || e.Kind === 'fight') {
      // Options (bước / sự kiện con / trận, theo thứ tự dữ liệu) nếu có, không thì Steps; bày Limit cái lọc theo hero
      var only = T().EVENT_ONLY_STEPS[e.InternalName]; // Haddy: chỉ "Spin the Wheel" (giải rút ngẫu nhiên) [WIKI2 E2]
      var opts = (e.Options || (e.Steps || []).map(function (id) { return { t: 'step', id: id }; })).filter(function (o) {
        return Ev.optionOk(o, run) && (!only || only.indexOf((recOf(o) || {}).InternalName) >= 0);
      });
      var n2 = Math.min(opts.length, limitOf(run, e.Limit, 3)), picked = Ev.pickByOdds(run, e, opts, n2);
      if (!picked) {
        var pool = opts.slice(); picked = [];
        while (picked.length < n2) picked.push(pool.splice(R.randInt(run, pool.length), 1)[0]);
        picked.sort(function (a, b) { return opts.indexOf(a) - opts.indexOf(b); });
      }
      choices = picked.map(function (o) { return Ev.optionChoice(o, run, e); });
      if (picked.length === 1 && picked[0].t === 'combat' && e.Kind === 'fight') { // "Treasure Chest (Mimic)": vào trận luôn
        R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
        R.ENCOUNTERS.combat.enter(ctx, { id: picked[0].id }, after);
        return;
      }
    }
    var extra = T().EVENT_EXTRA_CHOICES[e.InternalName]; // Finn's Big Bite: ba món của wiki [WIKI2 E12]
    if (extra && (e.Kind === 'choice' || e.Kind === 'chain')) choices = (choices || []).concat(extra.map(function (x) { return { kind: 'generic', key: x.key, id: x.key, name: x.name, desc: x.desc }; }));
    if (!choices || !choices.length) { // mọi lựa chọn đều thiếu điều kiện (bày từ trước khi bán thẻ): chỉ XP khi chọn, không bịa phần thưởng
      R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
      R.finish(ctx, after);
      return;
    }
    run.phase = { kind: 'event', eventId: e.Id, name: e.Title || e.InternalName, desc: R.encText(run, e, e.Desc || ''), choices: choices,
      canExit: !e.Rules || e.Rules.CanExit !== false, after: after };
    R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
  };

  // Sự kiện lựa chọn có ít nhất một lựa chọn người chơi này được chọn (clock.js không bày Praeteria cho Stelle, Aerodrome khi thiếu
  // Billboard / Gatling Gun...); loại khác luôn true
  Ev.hasChoices = function (e, run) {
    if (!e || !(e.Kind === 'choice' || e.Kind === 'chain' || (e.Kind === 'fight' && e.Options && e.Options.length))) return true;
    if (T().EVENT_EXTRA_CHOICES[e.InternalName]) return true;
    var opts = e.Options || (e.Steps || []).map(function (id) { return { t: 'step', id: id }; });
    return opts.some(function (o) { return Ev.optionOk(o, run); });
  };
  // Lựa chọn trỏ tới bước / sự kiện con / trận (encounters.js Options, Then)
  function recOf(o) { var E = R.enc(); return o.t === 'step' ? E.steps[o.id] : o.t === 'combat' ? E.combats[o.id] : E.events[o.id]; }
  Ev.optionOk = function (o, run) {
    var x = recOf(o);
    if (!x) return false;
    if (o.t === 'combat') return true;
    if (R.isPlaceholderEnc(x)) return false; // lựa chọn nháp của bản demo ("Charged Up: Gain 5 Speed")
    return heroOk(x, run) && (o.t !== 'step' || !R.ENCOUNTERS.step.conditionMissing(run, x)); // "(if you have a Food)": ẩn khi thiếu [RUN-03]
  };
  // Huy hiệu cam trên quả cầu (`stamp`): số bazaardb ghi cho lựa chọn (giá vàng: D'flek 5/10/20, Hire a Teacher 20; hay số lượng), không thì
  // "[Gumballs Remaining: N]" trong chữ của bước
  Ev.stampOf = function (e, o, x) {
    var S = root.BZ_SHOPS, rec = S && e && S.events[e.Id], c = rec && rec.choices.filter(function (k) { return k.stepId === o.id; })[0];
    if (c && c.stamp != null) return c.stamp;
    var m = /\[Gumballs Remaining: (\d+)\]/.exec((x && x.Desc) || '');
    return m ? +m[1] : null;
  };
  // Giá vàng của một lựa chọn theo wiki (TUNING.EVENT_COSTS / EVENT_COSTS_RE, WIKI2 E1); null = dữ liệu không nói
  Ev.costOf = function (x) {
    if (!x) return null;
    var t = T(), n = x.InternalName || '', c = t.EVENT_COSTS[n];
    if (c != null) return c;
    for (var i = 0; i < t.EVENT_COSTS_RE.length; i++) if (t.EVENT_COSTS_RE[i][0].test(n)) return t.EVENT_COSTS_RE[i][1];
    return null;
  };
  // c.cost = giá vàng (trừ khi chọn, thiếu thì từ chối); huy hiệu `stamp` hiện đúng giá wiki (giá 0: bỏ huy hiệu bazaardb đặt nhầm chỗ)
  Ev.optionChoice = function (o, run, e) {
    var x = recOf(o), c = { kind: o.t, id: o.id, name: x.Title || x.InternalName, desc: run ? R.encText(run, x, x.Desc || '') : (x.Desc || '') };
    var st = Ev.stampOf(e, o, x), cost = Ev.costOf(x);
    if (cost != null) { c.cost = cost; st = cost > 0 ? cost : null; }
    if (st != null) c.stamp = st;
    return c;
  };
  // Chọn lựa chọn hiện ra theo tỉ lệ ngày của bazaardb (events[id].choices[].odds["<ngày 1..10>"], "all" khi ngày đó thiếu mẫu).
  // Lựa chọn có điều kiện "(if you ...)" hay riêng hero thì tỉ lệ chỉ phản ánh số người chơi đủ điều kiện: điều kiện đã xét ở optionOk, nên
  // luôn hiện. Lựa chọn không điều kiện mà tỉ lệ < 100 là ô ngẫu nhiên: nếu tổng tỉ lệ ≈ số nguyên k (Aerodrome 21+55+17+6,4 ≈ 1) thì rút
  // đúng k theo trọng số, không thì mỗi ô tung riêng. Trả về null nếu sự kiện không có dữ liệu (bộ chọn cũ làm tiếp).
  Ev.pickByOdds = function (run, e, opts, limit) {
    var S = root.BZ_SHOPS, rec = S && S.events[e.Id];
    if (!rec) return null;
    var day = String(Math.min(10, Math.max(1, Math.floor(run.day)))), by = {};
    rec.choices.forEach(function (c) { by[c.stepId] = c; });
    // lựa chọn của demo mà bản live không còn (A Strange Mushroom: "Suprise Mushroom - Stronger" không có art, "Keep it for Luck") thì bỏ
    opts = opts.filter(function (o) { return by[o.id]; });
    if (!opts.length) return null;
    var sure = [], part = [];
    opts.forEach(function (o) {
      var c = by[o.id], p = c && (c.odds[day] != null ? c.odds[day] : c.odds.all);
      if (p == null || p >= 99 || c.cond || (c.heroes && c.heroes.length)) sure.push(o); else part.push({ o: o, p: p });
    });
    var tot = part.reduce(function (a, x) { return a + x.p; }, 0) / 100, k = Math.round(tot), got = [];
    if (k >= 1 && Math.abs(tot - k) < 0.15) {
      var bag = part.slice();
      while (got.length < k && bag.length) {
        var i = R.rollWeights(run, bag.map(function (x) { return x.p; }));
        got.push(bag.splice(i < 0 ? 0 : i, 1)[0].o);
      }
    } else part.forEach(function (x) { if (R.rand(run) * 100 < x.p) got.push(x.o); });
    var cap = Math.max(limit, sure.length), all = sure.concat(got);
    if (!all.length) return null;
    while (all.length > cap) all.splice(sure.length + R.randInt(run, all.length - sure.length), 1);
    return all.sort(function (a, b) { return opts.indexOf(a) - opts.indexOf(b); });
  };

  // Mở màn [WIKI §1.1 start-of-run guide]: nền 8 vàng + 5 thu nhập; chọn +12 vàng/+2 thu nhập, hoặc 1 vật phẩm Small
  // bậc Đồng yểm bùa ngẫu nhiên, hoặc 1 kỹ năng ngẫu nhiên (bậc Đồng [ĐỀ XUẤT]).
  // Có data/heroes.js: dùng start.options của hero ({key:'income', gold, income} / {key:'item', size, tier, enchanted} /
  // {key:'skill', tier}); lựa chọn kỹ năng thành một bước "(Start Skill)" thật của hero nếu có start.skillSteps ("Burn Training:
  // Choose a free Burn Skill" → bày 3-4 kỹ năng Burn để chọn 1), gieo một bước bằng run.rng.
  // [WIKI2 R7/S1/R13] wiki Start of Run (2025-05-24): "+12 Gold and +2 Income" / "Choose an Enchanted (Non-Golden, Non-Radiant) Item
  // (Choose 1 from 3) and + 6 Gold" / "Choose a Gold-tier Skill (Choose 1 from 3)"; mở màn "counts as one of the six hours" (after
  // 'endHour': chọn xong là hết giờ 0, +1 XP giờ). Ba món / ba kỹ năng chia sẵn lúc vào (tất định), chọn lựa chọn thì vào pha loot
  // (giao diện nhặt sẵn có) để lấy 1. Lựa chọn mang `picks` (thẻ sẽ bày) và `desc`; không còn `card` (trừ dữ liệu cũ picks 1).
  Ev.enterStart = function (ctx) {
    var run = ctx.run, t = T(), o = t.START_INCOME_OPTION, st = (R.heroData(run.hero) || {}).start || {};
    var opts = st.options || [{ key: 'income', gold: o.gold, income: o.income },
      { key: 'item', size: t.START_ITEM_SIZE, tier: 'Bronze', enchanted: true, picks: t.START_ITEM_PICKS, gold: t.START_ITEM_GOLD, notEnchant: t.START_ITEM_NOT_ENCHANT },
      { key: 'skill', tier: t.START_SKILL_TIER, picks: t.START_SKILL_PICKS }];
    var choices = [];
    opts.forEach(function (op) {
      if (op.key === 'income') { choices.push({ kind: 'start', key: 'income', name: 'Thu nhập', desc: '+' + (op.gold || 0) + ' Gold, +' + (op.income || 0) + ' Income', gold: op.gold || 0, income: op.income || 0 }); return; }
      var n = op.picks || 1, picks, c;
      if (op.key === 'item') {
        picks = R.deal(run, { kind: 'item', tiers: [op.tier || 'Bronze'], sizes: op.size ? [op.size] : null, any: [], not: [], names: [], enchanted: !!op.enchanted }, n,
          { notEnchant: op.notEnchant || t.START_ITEM_NOT_ENCHANT });
        if (!picks.length) return;
        c = { kind: 'start', key: 'item', name: 'Vật phẩm yểm bùa', gold: op.gold || 0, picks: picks,
          desc: 'Choose 1 of ' + picks.length + ' Enchanted ' + (op.size || '') + ' ' + (op.tier || 'Bronze') + '-tier items (non-Golden, non-Radiant)' + (op.gold ? ' and gain ' + op.gold + ' Gold' : '') };
        if (picks.length === 1) c.card = picks[0];
        choices.push(c);
        return;
      }
      if (op.key === 'skill') {
        picks = R.deal(run, { kind: 'skill', tiers: [op.tier || t.START_SKILL_TIER], any: [], not: [], names: [] }, n, {});
        if (!picks.length) return;
        c = { kind: 'start', key: 'skill', name: 'Kỹ năng', picks: picks, desc: 'Choose 1 of ' + picks.length + ' ' + (op.tier || t.START_SKILL_TIER) + '-tier skills' };
        if (picks.length === 1) c.card = picks[0];
        choices.push(c);
      }
    });
    // Thẻ mở màn của hero (BZ_ENCOUNTERS.starts, vai 'run'): tên + ArtKey cho màn; lựa chọn bên trong bị xoá nên dùng options
    var SS = R.enc().starts || {}, sev = (st.events || []).map(function (id) { return SS[id]; }).filter(function (x) { return x && x.Role !== 'skill'; })[0];
    run.phase = { kind: 'event', eventId: 'start', startId: sev ? sev.Id : null, name: sev ? (sev.Title || sev.InternalName) : 'Khởi đầu',
      desc: sev ? sev.Desc || '' : '', artKey: sev ? sev.ArtKey || null : null, choices: choices, canExit: false, after: 'endHour' };
  };

  Ev.choose = function (ctx, cmd) {
    var run = ctx.run, ph = run.phase, c = ph.choices[cmd.i];
    if (!c) return 'choice ' + cmd.i + ' does not exist';
    if (c.kind === 'start' && c.stepId) {
      R.log(ctx, { t: 'start', key: c.key, step: c.stepId });
      R.ENCOUNTERS.step.resolve(ctx, R.enc().steps[c.stepId], ph.after); // Deal → pha loot (chọn 1 kỹ năng), rồi vào giờ 0
      return;
    }
    if (c.kind === 'start' && c.picks && c.picks.length > 1) { // chọn 1 trong N (pha loot), vàng kèm theo cộng ngay
      R.gold(ctx, c.gold || 0, 'start');
      R.log(ctx, { t: 'start', key: c.key, picks: c.picks.length });
      R.enterLoot(ctx, c.picks.slice(), 1, ph.after, 'start');
      return;
    }
    if (c.kind === 'start') {
      if (c.card && !R.gainCard(ctx, c.card, null, null, 'start')) return R.noSpaceReason(run, c.card);
      R.gold(ctx, c.gold || 0, 'start'); R.income(ctx, c.income || 0);
      R.log(ctx, { t: 'start', key: c.key, id: c.card ? c.card.id : null });
      R.finish(ctx, ph.after);
      return;
    }
    if (c.kind === 'step') {
      var miss = R.ENCOUNTERS.step.conditionMissing(run, R.enc().steps[c.id]);
      if (miss) return 'step condition not met: ' + miss;
      if (c.cost > 0) { // lựa chọn trả vàng [WIKI2 E1]
        if (run.gold < c.cost) return 'not enough gold (' + run.gold + ' < ' + c.cost + ')';
        R.gold(ctx, -c.cost, 'event');
      }
      R.ENCOUNTERS.step.resolve(ctx, R.enc().steps[c.id], ph.after); return;
    }
    if (c.kind === 'pedestal') { R.log(ctx, { t: 'eventPick', id: c.id }); R.ENCOUNTERS.pedestal.enter(ctx, { id: c.id }, ph.after); return; }
    if (c.kind === 'event') { R.log(ctx, { t: 'eventPick', id: c.id }); Ev.enter(ctx, { id: c.id }, ph.after); return; }
    if (c.kind === 'combat') { R.ENCOUNTERS.combat.enter(ctx, { id: c.id }, ph.after); return; }
    if (c.kind === 'generic') { var gx = R.genericReward(ctx, c.key, ph.after); if (gx !== 'phase') R.finish(ctx, ph.after); return; }
    return 'choice kind ' + c.kind + ' has no handler';
  };
  Ev.leave = function (ctx) {
    if (!ctx.run.phase.canExit) return 'this event cannot be left';
    R.finish(ctx, ctx.run.phase.after);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
