/* Chợ Phiên — thương nhân (TCardEncounterEvent gắn Merchant hoặc "Sells ..."). CODE-RUN §2.1-2.3, §3.2:
   hàng = Limit thẻ chia theo bộ lọc đọc từ mô tả; giá = StandardPrices (ghi đè theo bậc); 20 % một thẻ ×0,75;
   reroll theo RerollRules của chính thương nhân (TotalAllowedRerolls, StartingCost, CostIncrease, CostMax);
   mua nhiều món rồi rời đi (CanSelectMultiple), mua/đổi hàng không tốn giờ (Dealer:1863-1867). */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };
  var M = {};
  R.ENCOUNTERS = R.ENCOUNTERS || {};
  R.ENCOUNTERS.merchant = M;

  function limitOf(run, e) {
    var l = e.Limit;
    if (Array.isArray(l)) return l[0] + R.randInt(run, l[1] - l[0] + 1);
    return l || 3;
  }
  function heroOfName(name) { var m = /^(\w+) \(Hero Merchant\)/.exec(name || ''); return m ? m[1] : null; }
  M.filter = function (e) {
    return R.parseFilter(e.Desc, { hero: heroOfName(e.InternalName) });
  };
  M.dealStock = function (run, e, exclude) {
    var free = !!(e.Rules && e.Rules.SelectionIsFree);
    var cards = R.deal(run, M.filter(e), limitOf(run, e), { exclude: exclude || {} });
    var stock = cards.map(function (c) { return { card: c, price: free ? 0 : R.price(c, c.tier).buy }; });
    var always = /always sells discounted/i.test(e.Desc || '');
    var hasRoll = JSON.stringify(e.Abilities || {}).indexOf('"BuyPrice"') >= 0;
    if (!free && stock.length && (hasRoll || always) && R.rand(run) < (always ? T().ALWAYS_DISCOUNT_CHANCE : T().DISCOUNT_CHANCE)) {
      var s = stock[R.randInt(run, stock.length)];
      s.price = root.BZSim.roundAway(s.price * T().DISCOUNT_MULT); s.discount = true;
    }
    return stock;
  };

  M.enter = function (ctx, r, after) {
    var run = ctx.run, e = R.enc().events[r.id], rr = (e.Rules && e.Rules.RerollRules) || null;
    var stock = M.dealStock(run, e);
    run.phase = {
      kind: 'merchant', merchantId: e.Id, name: e.Title || e.InternalName, desc: e.Desc || '', stock: stock,
      rerolls: rr ? rr.TotalAllowedRerolls || 0 : T().DEFAULT_REROLLS, rerollCost: rr ? rr.StartingCost || 0 : 0,
      rerollStep: rr ? rr.CostIncrease || 0 : 0, rerollMax: rr && rr.CostMax != null ? rr.CostMax : null,
      dealt: stock.map(function (s) { return s.card.id; }), after: after || 'endHour'
    };
    R.ooc.fire(ctx, 'TTriggerOnEncounterCardsDealt', { enc: e }); // Lucky Clover, Galactic Translator (đích SelectionSet = hàng vừa bày)
  };

  // "Buys your Large items at +3 Value" (Quixel/Midsworth/Barkun): aura SellPrice của thẻ thương nhân. Đọc e.Auras nếu dữ liệu
  // có, không thì TUNING.MERCHANT_SELL_AURAS (chép từ cards.json). Trả về phần cộng thêm khi bán thẻ C (sim) ở thương nhân này.
  M.sellBonus = function (e, S, C) {
    if (!e) return 0;
    var sim = root.BZSim, add = 0, list = [];
    if (e.Auras) {
      Object.keys(e.Auras).forEach(function (k) {
        var a = e.Auras[k].Action || {};
        if (a.AttributeType === 'SellPrice' && (a.Operation || 'Add') === 'Add') list.push({ value: sim.value(a.Value, { S: S, card: C, ev: null }), cond: a.Target && a.Target.Conditions });
      });
    } else {
      (T().MERCHANT_SELL_AURAS[e.InternalName] || []).forEach(function (a) {
        list.push({ value: a.Value, cond: { $type: 'TCardConditionalSize', Sizes: a.Sizes, IsNot: false } });
      });
    }
    list.forEach(function (a) { if (!a.cond || sim.filterCards(a.cond, [C], { S: S, card: C, ev: null }).length) add += a.value || 0; });
    return Math.round(add);
  };

  M.buy = function (ctx, cmd) {
    var run = ctx.run, ph = run.phase, s = ph.stock[cmd.i];
    if (!s) return 'stock slot ' + cmd.i + ' is empty';
    if (run.gold < s.price) return 'not enough gold (' + run.gold + ' < ' + s.price + ')';
    var ci = R.gainCard(ctx, s.card, cmd.section || null, cmd.socket == null ? null : cmd.socket, 'buy');
    if (!ci) return 'no space for ' + s.card.id + (cmd.section ? ' at ' + cmd.section + ':' + cmd.socket : '');
    ph.stock.splice(cmd.i, 1);
    R.gold(ctx, -s.price, 'buy');
    R.emit(ctx, { type: 'buy', uid: ci.uid, id: ci.id, price: s.price });
    R.log(ctx, { t: 'buy', id: s.card.id, tier: s.card.tier, price: s.price });
    R.ooc.fire(ctx, 'TTriggerOnCardPurchased', { uid: ci.uid });
  };
  M.reroll = function (ctx) {
    var run = ctx.run, ph = run.phase, e = R.enc().events[ph.merchantId];
    if (ph.rerolls <= 0) return 'no rerolls left';
    if (run.gold < ph.rerollCost) return 'not enough gold for reroll (' + run.gold + ' < ' + ph.rerollCost + ')';
    R.gold(ctx, -ph.rerollCost, 'reroll');
    ph.rerolls--;
    var ex = {}; ph.dealt.forEach(function (id) { ex[id] = 1; }); // không chia lại thẻ vừa bày (Dealer:3494-3505)
    ph.stock = M.dealStock(run, e, ex);
    ph.dealt = ph.dealt.concat(ph.stock.map(function (s) { return s.card.id; }));
    ph.rerollCost = ph.rerollCost + ph.rerollStep;
    if (ph.rerollMax != null) ph.rerollCost = Math.min(ph.rerollMax, ph.rerollCost);
    R.emit(ctx, { type: 'reroll' });
    R.log(ctx, { t: 'reroll' });
    R.ooc.fire(ctx, 'TTriggerOnEncounterCardsDealt', { enc: e });
  };
  M.leave = function (ctx) { R.finish(ctx, ctx.run.phase.after); };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
