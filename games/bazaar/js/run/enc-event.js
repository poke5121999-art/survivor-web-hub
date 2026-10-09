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
    if (e.Kind === 'instant') { St.resolve(ctx, e, after); return; }
    if (e.Kind === 'pile') {
      R.gainXp(ctx, e.Xp || 0, 'select');
      St.runAbilities(ctx, e); // "Get {ability.0} Gold and a Bronze-tier Loot item": phần vàng
      if (run.phase.kind === 'end') return;
      var f = R.parseFilter(e.Desc || '', {}), n = limitOf(run, e.Limit, 1);
      if (f.names.length > 1 && n >= f.names.length) { // "Sharpening Stone, Extract and Cinders": mỗi tên một thẻ
        var cards = [];
        f.names.forEach(function (nm) { cards = cards.concat(R.deal(run, Object.assign({}, f, { names: [nm] }), 1, { tierMode: 'band' })); });
        R.enterLoot(ctx, cards, e.Rules && e.Rules.CanSelectMultiple ? cards.length : 1, after, e.Id);
      } else {
        var picks = R.deal(run, f, n, { tierMode: f.kind === 'skill' ? 'band' : 'day' });
        R.enterLoot(ctx, picks, e.Rules && e.Rules.CanSelectMultiple ? picks.length : 1, after, e.Id);
      }
      R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
      return;
    }
    R.gainXp(ctx, e.Xp || 0, 'select');
    var choices;
    if (e.Kind === 'choice') {
      var steps = (e.Steps || []).filter(function (id) { return heroOk(R.enc().steps[id], run); });
      var n2 = Math.min(steps.length, limitOf(run, e.Limit, 3)), pool = steps.slice(), pickIds = [];
      while (pickIds.length < n2) pickIds.push(pool.splice(R.randInt(run, pool.length), 1)[0]);
      pickIds.sort(function (a, b) { return steps.indexOf(a) - steps.indexOf(b); });
      choices = pickIds.map(function (id) { var s = R.enc().steps[id]; return { kind: 'step', id: id, name: s.Title || s.InternalName, desc: s.Desc || '' }; });
    }
    if (!choices || !choices.length) { // [ĐỀ XUẤT] sự kiện không đọc được nội dung: ba phần thưởng chung
      choices = [{ kind: 'generic', key: 'gold', name: 'Vàng', desc: '+' + (T().GENERIC_GOLD_BY_BAND[R.bandTier(run)] || 3) + ' Gold' },
        { kind: 'generic', key: 'xp', name: 'Kinh nghiệm', desc: '+' + T().GENERIC_XP + ' XP' },
        { kind: 'generic', key: 'item', name: 'Vật phẩm', desc: R.bandTier(run) + ' item' }];
    }
    run.phase = { kind: 'event', eventId: e.Id, name: e.Title || e.InternalName, desc: e.Desc || '', choices: choices,
      canExit: !e.Rules || e.Rules.CanExit !== false, after: after };
    R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
  };

  // Mở màn [WIKI §1.1 start-of-run guide]: nền 8 vàng + 5 thu nhập; chọn +12 vàng/+2 thu nhập, hoặc 1 vật phẩm Small
  // bậc Đồng yểm bùa ngẫu nhiên, hoặc 1 kỹ năng ngẫu nhiên (bậc Đồng [ĐỀ XUẤT]).
  Ev.enterStart = function (ctx) {
    var run = ctx.run, o = T().START_INCOME_OPTION;
    var item = R.deal(run, { kind: 'item', tiers: ['Bronze'], sizes: [T().START_ITEM_SIZE], any: [], not: [], names: [], enchanted: true }, 1, {})[0];
    var skill = R.deal(run, { kind: 'skill', tiers: ['Bronze'], any: [], not: [], names: [] }, 1, {})[0];
    var choices = [{ kind: 'start', key: 'income', name: 'Thu nhập', desc: '+' + o.gold + ' Gold, +' + o.income + ' Income', gold: o.gold, income: o.income }];
    if (item) choices.push({ kind: 'start', key: 'item', name: 'Vật phẩm yểm bùa', card: item });
    if (skill) choices.push({ kind: 'start', key: 'skill', name: 'Kỹ năng', card: skill });
    run.phase = { kind: 'event', eventId: 'start', name: 'Khởi đầu', desc: '', choices: choices, canExit: false, after: 'beginHour' };
  };

  Ev.choose = function (ctx, cmd) {
    var run = ctx.run, ph = run.phase, c = ph.choices[cmd.i];
    if (!c) return 'choice ' + cmd.i + ' does not exist';
    if (c.kind === 'start') {
      if (c.card && !R.gainCard(ctx, c.card, null, null, 'start')) return 'no space for ' + c.card.id;
      R.gold(ctx, c.gold || 0, 'start'); R.income(ctx, c.income || 0);
      R.log(ctx, { t: 'start', key: c.key, id: c.card ? c.card.id : null });
      R.finish(ctx, ph.after);
      return;
    }
    if (c.kind === 'step') { R.ENCOUNTERS.step.resolve(ctx, R.enc().steps[c.id], ph.after); return; }
    if (c.kind === 'generic') { R.genericReward(ctx, c.key); R.finish(ctx, ph.after); return; }
    return 'choice kind ' + c.kind + ' has no handler';
  };
  Ev.leave = function (ctx) {
    if (!ctx.run.phase.canExit) return 'this event cannot be left';
    R.finish(ctx, ctx.run.phase.after);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
