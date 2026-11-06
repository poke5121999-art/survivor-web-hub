/* Chợ Phiên — bệ (TCardEncounterPedestal, CODE-RUN §3.4): chọn một vật phẩm của mình để yểm bùa / nâng bậc.
   Thẻ nào hợp lệ = `Criteria` (DSL TCardConditional*, chấm bằng sim: HasEnchantment, EnchantmentEligible, Tier...).
   Behavior (TPedestalBehaviorEnchant/Upgrade...) bị máy chủ xoá → đọc từ mô tả:
   "Enchant an item with X" → yểm X; "Enchant an item" (The Artist) → sau khi chọn thẻ, bày pha `enchantPick` để NGƯỜI CHƠI chọn
   một trong các enchant hợp lệ của thẻ (wiki Futura: "a random Enchantment or The Artist") [RUN-08]; "Upgrade ..." → lên một bậc. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var P = {};
  R.ENCOUNTERS = R.ENCOUNTERS || {};
  R.ENCOUNTERS.pedestal = P;

  P.behavior = function (e) {
    var m = /Enchant an item with (\w+)/i.exec(e.Desc || '');
    if (m) return { type: 'enchant', ench: m[1] };
    if (/^Enchant/i.test(e.Desc || '')) return { type: 'enchantChoose' };
    if (/Upgrade/i.test(e.Desc || '')) return { type: 'upgrade' };
    return { type: 'none' };
  };
  // Trạng thái sim chỉ để đọc (không đụng rng của run)
  R.readState = function (run) {
    var sim = root.BZSim;
    var S = sim.makeState({ boards: [R.playerBoard(run), { name: 'encounter', healthMax: 1, cards: [] }], seed: 1, day: run.day, hour: run.hour + 1, sandstorm: false });
    sim.initState(S);
    return S;
  };
  P.eligible = function (run, e, b) {
    var sim = root.BZSim, S = R.readState(run);
    var items = S.players[0].hand.concat(S.players[0].stash);
    var ok = e.Criteria ? sim.filterCards(e.Criteria, items, { S: S, card: null, ev: null }) : items;
    return ok.filter(function (C) {
      if (b.type === 'upgrade') return !!sim.nextTier(C.tpl, C.tier);
      if (b.type === 'enchant') return !!(C.tpl.Enchantments && C.tpl.Enchantments[b.ench]) && C.ench !== b.ench;
      if (b.type === 'enchantChoose') return Object.keys(C.tpl.Enchantments || {}).filter(function (k) { return k !== C.ench; }).length > 0;
      return false;
    }).map(function (C) { return C.uid; });
  };
  P.enter = function (ctx, r, after) {
    var run = ctx.run, e = R.enc().pedestals[r.id], b = P.behavior(e);
    run.phase = { kind: 'pedestal', pedestalId: e.Id, name: e.Title || e.InternalName, desc: R.encText(run, e, e.Desc || ''), behavior: b,
      eligible: P.eligible(run, e, b), after: after || 'endHour' };
  };
  P.choose = function (ctx, cmd) {
    var run = ctx.run, ph = run.phase, e = R.enc().pedestals[ph.pedestalId];
    // {t:'commit', uid}: kéo một thẻ của mình lên bệ (CommitToPedestalCommand của bản gốc); {t:'choose', i}: theo chỉ số trong `eligible`
    var uid = cmd.uid != null ? cmd.uid : ph.eligible[cmd.i];
    if (cmd.uid != null && ph.eligible.indexOf(cmd.uid) < 0) return 'card ' + cmd.uid + ' is not eligible for this pedestal';
    var ci = uid && R.findCard(run, uid);
    if (!ci) return cmd.uid != null ? 'card ' + cmd.uid + ' not found' : 'eligible slot ' + cmd.i + ' is empty';
    var b = ph.behavior, tpl = R.tpl(ci.id);
    if (b.type === 'enchantChoose') { // The Artist: chọn loại enchant trong pha riêng, XP và kết thúc khi đã chọn
      run.phase = { kind: 'enchantPick', pedestalId: ph.pedestalId, name: ph.name, desc: ph.desc, uid: ci.uid, cardId: ci.id, tier: ci.tier,
        options: Object.keys(tpl.Enchantments || {}).filter(function (k) { return k !== ci.ench; }), after: ph.after };
      return;
    }
    if (b.type === 'upgrade') R.upgradeInst(ctx, ci, 'pedestal');
    else applyEnchant(ctx, ci, b.ench);
    R.finish(ctx, ph.after);
  };
  function applyEnchant(ctx, ci, ench) {
    ci.ench = ench;
    R.emit(ctx, { type: 'enchant', uid: ci.uid, ench: ench });
    R.log(ctx, { t: 'enchant', id: ci.id, ench: ench });
  }
  // Pha enchantPick: {t:'choose', i} (chỉ số trong `options`) hoặc {t:'choose', ench}; {t:'back'} về bệ để chọn thẻ khác
  P.pick = function (ctx, cmd) {
    var run = ctx.run, ph = run.phase, e = R.enc().pedestals[ph.pedestalId], ench = cmd.ench != null ? cmd.ench : ph.options[cmd.i];
    if (ph.options.indexOf(ench) < 0) return 'enchantment ' + (cmd.ench != null ? cmd.ench : '#' + cmd.i) + ' is not available for this card';
    var ci = R.findCard(run, ph.uid);
    if (!ci) return 'card ' + ph.uid + ' not found';
    applyEnchant(ctx, ci, ench);
    R.finish(ctx, ph.after);
  };
  P.back = function (ctx) {
    var run = ctx.run, ph = run.phase, e = R.enc().pedestals[ph.pedestalId];
    P.enter(ctx, { id: e.Id }, ph.after);
  };
  P.leave = function (ctx) { R.finish(ctx, ctx.run.phase.after); };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
