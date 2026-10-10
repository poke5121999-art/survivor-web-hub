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
    if (e.Kind === 'fight' && !(e.Options && e.Options.length)) { // "Fight a Monster": quái bậc FightTier theo ngày
      R.gainXp(ctx, e.Xp || 0, 'select');
      var fl = T().FIGHT_EVENT_LEVEL, mc = R.ENCOUNTERS.combat.pickFor(run, { tiers: [e.FightTier || e.StartingTier || 'Gold'], lo: fl.lo, hi: fl.hi });
      R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
      if (mc) { R.ENCOUNTERS.combat.enter(ctx, { id: mc.Id }, after); return; }
    }
    R.gainXp(ctx, e.Xp || 0, 'select');
    var choices;
    if (e.Kind === 'choice' || e.Kind === 'chain' || e.Kind === 'fight') {
      // Options (bước / sự kiện con / trận, theo thứ tự dữ liệu) nếu có, không thì Steps; bày Limit cái lọc theo hero
      var opts = (e.Options || (e.Steps || []).map(function (id) { return { t: 'step', id: id }; })).filter(function (o) { return Ev.optionOk(o, run); });
      var n2 = Math.min(opts.length, limitOf(run, e.Limit, 3)), pool = opts.slice(), picked = [];
      while (picked.length < n2) picked.push(pool.splice(R.randInt(run, pool.length), 1)[0]);
      picked.sort(function (a, b) { return opts.indexOf(a) - opts.indexOf(b); });
      choices = picked.map(function (o) { return Ev.optionChoice(o, run); });
      if (picked.length === 1 && picked[0].t === 'combat' && e.Kind === 'fight') { // "Treasure Chest (Mimic)": vào trận luôn
        R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
        R.ENCOUNTERS.combat.enter(ctx, { id: picked[0].id }, after);
        return;
      }
    }
    if (!choices || !choices.length) { // [ĐỀ XUẤT] sự kiện không đọc được nội dung: ba phần thưởng chung
      choices = [{ kind: 'generic', key: 'gold', name: 'Vàng', desc: '+' + (T().GENERIC_GOLD_BY_BAND[R.bandTier(run)] || 3) + ' Gold' },
        { kind: 'generic', key: 'xp', name: 'Kinh nghiệm', desc: '+' + T().GENERIC_XP + ' XP' },
        { kind: 'generic', key: 'item', name: 'Vật phẩm', desc: R.bandTier(run) + ' item' }];
    }
    run.phase = { kind: 'event', eventId: e.Id, name: e.Title || e.InternalName, desc: R.encText(run, e, e.Desc || ''), choices: choices,
      canExit: !e.Rules || e.Rules.CanExit !== false, after: after };
    R.log(ctx, { t: 'event', id: e.Id, name: e.InternalName });
  };

  // Lựa chọn trỏ tới bước / sự kiện con / trận (encounters.js Options, Then)
  function recOf(o) { var E = R.enc(); return o.t === 'step' ? E.steps[o.id] : o.t === 'combat' ? E.combats[o.id] : E.events[o.id]; }
  Ev.optionOk = function (o, run) { var x = recOf(o); return !!x && (o.t === 'combat' || heroOk(x, run)); };
  Ev.optionChoice = function (o, run) {
    var x = recOf(o);
    return { kind: o.t, id: o.id, name: x.Title || x.InternalName, desc: run ? R.encText(run, x, x.Desc || '') : (x.Desc || '') };
  };

  // Mở màn [WIKI §1.1 start-of-run guide]: nền 8 vàng + 5 thu nhập; chọn +12 vàng/+2 thu nhập, hoặc 1 vật phẩm Small
  // bậc Đồng yểm bùa ngẫu nhiên, hoặc 1 kỹ năng ngẫu nhiên (bậc Đồng [ĐỀ XUẤT]).
  // Có data/heroes.js: dùng start.options của hero ({key:'income', gold, income} / {key:'item', size, tier, enchanted} /
  // {key:'skill', tier}); lựa chọn kỹ năng thành một bước "(Start Skill)" thật của hero nếu có start.skillSteps ("Burn Training:
  // Choose a free Burn Skill" → bày 3-4 kỹ năng Burn để chọn 1), gieo một bước bằng run.rng.
  Ev.enterStart = function (ctx) {
    var run = ctx.run, o = T().START_INCOME_OPTION, st = (R.heroData(run.hero) || {}).start || {};
    var opts = st.options || [{ key: 'income', gold: o.gold, income: o.income }, { key: 'item', size: T().START_ITEM_SIZE, tier: 'Bronze', enchanted: true },
      { key: 'skill', tier: 'Bronze' }];
    var choices = [];
    opts.forEach(function (op) {
      if (op.key === 'income') { choices.push({ kind: 'start', key: 'income', name: 'Thu nhập', desc: '+' + (op.gold || 0) + ' Gold, +' + (op.income || 0) + ' Income', gold: op.gold || 0, income: op.income || 0 }); return; }
      if (op.key === 'item') {
        var item = R.deal(run, { kind: 'item', tiers: [op.tier || 'Bronze'], sizes: op.size ? [op.size] : null, any: [], not: [], names: [], enchanted: !!op.enchanted }, 1, {})[0];
        if (item) choices.push({ kind: 'start', key: 'item', name: 'Vật phẩm yểm bùa', card: item });
        return;
      }
      if (op.key === 'skill') {
        var steps = (st.skillSteps || []).filter(function (id) { return R.enc().steps[id]; });
        if (steps.length) {
          var sid = steps[R.randInt(run, steps.length)], s = R.enc().steps[sid];
          choices.push({ kind: 'start', key: 'skill', name: s.Title || s.InternalName, desc: R.encText(run, s, s.Desc || ''), stepId: sid });
          return;
        }
        var skill = R.deal(run, { kind: 'skill', tiers: [op.tier || 'Bronze'], any: [], not: [], names: [] }, 1, {})[0];
        if (skill) choices.push({ kind: 'start', key: 'skill', name: 'Kỹ năng', card: skill });
      }
    });
    // Thẻ mở màn của hero (BZ_ENCOUNTERS.starts, vai 'run'): tên + ArtKey cho màn; lựa chọn bên trong bị xoá nên dùng options
    var SS = R.enc().starts || {}, sev = (st.events || []).map(function (id) { return SS[id]; }).filter(function (x) { return x && x.Role !== 'skill'; })[0];
    run.phase = { kind: 'event', eventId: 'start', startId: sev ? sev.Id : null, name: sev ? (sev.Title || sev.InternalName) : 'Khởi đầu',
      desc: sev ? sev.Desc || '' : '', artKey: sev ? sev.ArtKey || null : null, choices: choices, canExit: false, after: 'beginHour' };
  };

  Ev.choose = function (ctx, cmd) {
    var run = ctx.run, ph = run.phase, c = ph.choices[cmd.i];
    if (!c) return 'choice ' + cmd.i + ' does not exist';
    if (c.kind === 'start' && c.stepId) {
      R.log(ctx, { t: 'start', key: c.key, step: c.stepId });
      R.ENCOUNTERS.step.resolve(ctx, R.enc().steps[c.stepId], ph.after); // Deal → pha loot (chọn 1 kỹ năng), rồi vào giờ 0
      return;
    }
    if (c.kind === 'start') {
      if (c.card && !R.gainCard(ctx, c.card, null, null, 'start')) return R.noSpaceReason(run, c.card);
      R.gold(ctx, c.gold || 0, 'start'); R.income(ctx, c.income || 0);
      R.log(ctx, { t: 'start', key: c.key, id: c.card ? c.card.id : null });
      R.finish(ctx, ph.after);
      return;
    }
    if (c.kind === 'step') { R.ENCOUNTERS.step.resolve(ctx, R.enc().steps[c.id], ph.after); return; }
    if (c.kind === 'event') { R.log(ctx, { t: 'eventPick', id: c.id }); Ev.enter(ctx, { id: c.id }, ph.after); return; }
    if (c.kind === 'combat') { R.ENCOUNTERS.combat.enter(ctx, { id: c.id }, ph.after); return; }
    if (c.kind === 'generic') { R.genericReward(ctx, c.key); R.finish(ctx, ph.after); return; }
    return 'choice kind ' + c.kind + ' has no handler';
  };
  Ev.leave = function (ctx) {
    if (!ctx.run.phase.canExit) return 'this event cannot be left';
    R.finish(ctx, ctx.run.phase.after);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
