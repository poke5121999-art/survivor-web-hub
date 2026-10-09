/* Chợ Phiên — đồng hồ ngày/giờ và các ngắt (lên cấp, PvP, hết run). CODE-RUN §1.2-1.5:
   - giờ 0..5 mỗi ngày; giờ PVE_HOUR chọn 1 trong 3 quái, giờ PVP_HOUR đấu bóng (TUNING, theo WIKI §1.2);
   - hết mỗi giờ +ExperiencePerHour XP (Dealer:2516-2520), sang ngày mới +Income vàng (Dealer:2491) rồi OnDayStarted;
   - phần thưởng lên cấp chen vào đầu giờ kế (DayManagerOverrideQueue, Dealer:4720-4757), không tốn giờ;
   - hết run: đủ VictoriesToWin trận PvP thắng, uy tín về 0, hoặc qua ngày NumberOfDays. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };

  // ---------- bàn tốt nhất cho màn hết run: chụp lúc thắng một trận PvP (số trận thắng tăng; cùng số thắng thì cấp cao hơn) ----------
  // Chưa thắng trận nào: chụp lúc hết run.
  // run.best = {wins, level, day, hour, hero, healthMax, prestige, gold, income, board: {hand, stash, skills}} (thẻ dạng run.board)
  R.updateBest = function (ctx) {
    var run = ctx.run, b = run.best;
    if (b && (run.wins < b.wins || (run.wins === b.wins && run.level <= b.level))) return false;
    run.best = { wins: run.wins, level: run.level, day: run.day, hour: run.hour, hero: run.hero, healthMax: run.healthMax,
      prestige: run.prestige, gold: run.gold, income: run.income, board: R.clone(run.board) };
    R.emit(ctx, { type: 'best', wins: run.wins, level: run.level, day: run.day });
    return true;
  };

  R.end = function (ctx, reason) {
    if (!ctx.run.best) R.updateBest(ctx);
    ctx.run.phase = { kind: 'end', reason: reason };
    R.emit(ctx, { type: 'end', reason: reason });
    R.log(ctx, { t: 'end', reason: reason });
  };
  R.checkEnd = function (ctx) {
    var run = ctx.run, m = R.mode();
    if (run.wins >= m.VictoriesToWin) { R.end(ctx, 'victory'); return true; }
    if (run.prestige <= 0) { R.end(ctx, 'prestige'); return true; }
    if (run.day > m.NumberOfDays) { R.end(ctx, 'days'); return true; }
    return false;
  };

  // Kết thúc một gặp gỡ: after = 'endHour' (gặp gỡ thường) hoặc 'beginHour' (lên cấp, mở màn: không tốn giờ)
  R.finish = function (ctx, after) {
    var ph = ctx.run.phase, E = R.enc(), rec = ph.merchantId ? E.events[ph.merchantId] : ph.pedestalId ? E.pedestals[ph.pedestalId]
      : ph.eventId && ph.eventId !== 'start' ? E.events[ph.eventId] : null;
    if (rec) R.ooc.fire(ctx, 'TTriggerOnEncounterExited', { enc: rec }); // Coupon / Dreampearl / Galactic Translator: hết lượt ở thương nhân
    if (after === 'beginHour') R.beginHour(ctx); else R.endHour(ctx);
  };

  R.beginHour = function (ctx) {
    var run = ctx.run;
    if (R.checkEnd(ctx)) return;
    if (run.fatesPending) { R.enterFates(ctx); return; }
    if (run.pendingLevelUps > 0) { R.enterLevelUp(ctx); return; }
    if (run.hour === T().PVP_HOUR) { R.ENCOUNTERS.combat.enterPvp(ctx); return; }
    var options = run.hour === T().PVE_HOUR ? R.ENCOUNTERS.combat.options(ctx.run) : R.hourOptions(ctx.run);
    run.prev = options.map(function (o) { return o.id; });
    run.phase = { kind: 'choose', options: options };
    R.emit(ctx, { type: 'hour', day: run.day, hour: run.hour });
  };

  R.endHour = function (ctx) {
    var run = ctx.run, m = R.mode();
    R.gainXp(ctx, m.ExperiencePerHour, 'hour');
    run.hour++;
    if (run.hour >= m.HoursInADay) {
      run.day++; run.hour = 0;
      if (run.day > m.NumberOfDays) { R.checkEnd(ctx); return; }
      R.emit(ctx, { type: 'day', day: run.day });
      R.gold(ctx, run.income, 'income');
      R.ooc.fire(ctx, 'TTriggerOnDayStarted', {});
    }
    R.ooc.fire(ctx, 'TTriggerOnHourStarted', {});
    R.beginHour(ctx);
  };

  // ---------- bày thẻ gặp gỡ cho giờ tự do ----------
  function heroOk(e, run) { var h = e.Heroes || []; return !h.length || h.indexOf('Common') >= 0 || h.indexOf(run.hero) >= 0; }
  function dayOk(e, run) { return !e.Days || (run.day >= e.Days[0] && run.day <= e.Days[1]); }
  function ref(type, e) {
    return { type: type, id: e.Id, name: e.Title || e.InternalName, tier: e.StartingTier, desc: e.Desc || '', kind: e.Kind || type };
  }
  R.encounterRef = ref;
  var poolCache = null;
  function hourPool() {
    if (poolCache) return poolCache;
    var E = R.enc(), out = { merchant: [], event: [] }, id, e;
    for (id in E.events) {
      e = E.events[id];
      if (e.LevelUp || (e.Parents && e.Parents.length) || T().ENCOUNTER_EXCLUDE.test(e.InternalName || '')) continue;
      if (e.Kind === 'merchant') out.merchant.push(ref('merchant', e));
      else if (T().EVENT_KINDS_IN_POOL[e.Kind]) out.event.push(ref('event', e));
    }
    for (id in E.pedestals) {
      e = E.pedestals[id];
      if (!e.LevelUp) out.event.push(ref('pedestal', e));
    }
    poolCache = out;
    return out;
  }
  function recOf(r) { var E = R.enc(); return r.type === 'pedestal' ? E.pedestals[r.id] : E.events[r.id]; }
  // Gieo bậc theo bảng ngày; rỗng thì đi lên rồi đi xuống (RollEncounterTierAndFilter, Dealer:4975-5041)
  function pickByTier(run, cands) {
    if (!cands.length) return null;
    var tier = R.rollTier(run, T().ENCOUNTER_TIER_ODDS_BY_DAY), ti = R.tierIndex(tier), order = [ti];
    for (var u = ti + 1; u < R.TIERS.length; u++) order.push(u);
    for (var d = ti - 1; d >= 0; d--) order.push(d);
    for (var k = 0; k < order.length; k++) {
      var sub = cands.filter(function (r) { return R.tierIndex(r.tier) === order[k]; });
      if (sub.length) return sub[R.randInt(run, sub.length)];
    }
    return null;
  }
  R.hourOptions = function (run) {
    var P = hourPool(), out = [], taken = {}, prev = {};
    (run.prev || []).forEach(function (id) { prev[id] = 1; });
    T().HOUR_SLOTS.forEach(function (slot) {
      var base = slot === 'merchant' ? P.merchant : slot === 'event' ? P.event : P.merchant.concat(P.event);
      var ok = function (r) { var e = recOf(r); return !taken[r.id] && heroOk(e, run) && dayOk(e, run); };
      var cands = base.filter(function (r) { return ok(r) && !prev[r.id]; });
      if (!cands.length) cands = base.filter(ok); // "not dealt last hour unless that empties the list" (Dealer:4938-4949)
      var r = pickByTier(run, cands);
      if (r) { taken[r.id] = 1; out.push(R.clone(r)); }
    });
    return out;
  };

  // ---------- lên cấp: 3 lựa chọn từ thẻ "(Level Up)" theo dải ngày [ĐỀ XUẤT CODE-RUN §3.6] ----------
  var luCache = null;
  function levelUpPool() {
    if (luCache) return luCache;
    var E = R.enc(), out = { pile: [], teacher: [], other: [] }, id, e;
    for (id in E.events) {
      e = E.events[id];
      if (!e.LevelUp || e.Kind === 'unknown' || e.Kind === 'merchant') continue;
      if (/^Teaches/i.test(e.Desc || '') || /teaches/i.test(e.Desc || '')) out.teacher.push(ref('event', e));
      else if (e.Kind === 'pile') out.pile.push(ref('event', e));
      else out.other.push(ref('event', e));
    }
    for (id in E.steps) { e = E.steps[id]; if (e.LevelUp) out.other.push(ref('step', e)); }
    for (id in E.pedestals) { e = E.pedestals[id]; if (e.LevelUp) out.other.push(ref('pedestal', e)); }
    luCache = out;
    return out;
  }
  function recAny(r) { var E = R.enc(); return r.type === 'pedestal' ? E.pedestals[r.id] : r.type === 'step' ? E.steps[r.id] : E.events[r.id]; }
  // Bể lên cấp theo hero (data/heroes.js levelUp: pile/teacher/step/pedestal [{id, tier}]); không có thì bể chung ở trên
  var luHero = {};
  function heroLevelUpPool(hero) {
    var H = R.heroData(hero), L = H && H.levelUp;
    if (!L) return null;
    if (luHero[hero]) return luHero[hero];
    var E = R.enc(), out = { pile: [], teacher: [], other: [] };
    var add = function (slot, list, type, map) {
      (list || []).forEach(function (x) { var e = map[x.id]; if (e && e.Kind !== 'unknown' && e.Kind !== 'merchant') out[slot].push(ref(type, e)); });
    };
    add('pile', L.pile, 'event', E.events); add('teacher', L.teacher, 'event', E.events);
    add('other', L.step, 'step', E.steps); add('other', L.pedestal, 'pedestal', E.pedestals);
    luHero[hero] = out;
    return out;
  }
  R.levelUpOptions = function (run) {
    var P = heroLevelUpPool(run.hero) || levelUpPool(), band = R.tierIndex(R.bandTier(run)), out = [];
    T().LEVELUP_SLOTS.forEach(function (slot) {
      var cands = P[slot].filter(function (r) { return heroOk(recAny(r), run) && dayOk(recAny(r), run); });
      // đúng dải trước, rồi thấp dần, rồi cao dần
      var order = [band]; for (var d = band - 1; d >= 0; d--) order.push(d); for (var u = band + 1; u < R.TIERS.length; u++) order.push(u);
      for (var k = 0; k < order.length; k++) {
        var sub = cands.filter(function (r) { return R.tierIndex(r.tier) === order[k]; });
        if (sub.length) { out.push(R.clone(sub[R.randInt(run, sub.length)])); break; }
      }
    });
    return out;
  };
  R.enterLevelUp = function (ctx) {
    var run = ctx.run;
    run.phase = { kind: 'levelUp', level: run.level - run.pendingLevelUps + 1, choices: R.levelUpOptions(run) };
    R.emit(ctx, { type: 'levelUpChoice', level: run.phase.level });
  };

  // ---------- Fates: 3 lựa chọn cùng hình với lựa chọn lên cấp ({type,id,name,tier,desc,kind}) để giao diện dùng lại màn đó ----------
  // Nội dung gốc (Futura aef5e7d8) bị xoá khỏi bản demo: Fate's Legacy lấy từ clip PSP75k4R4Pk?t=83, hai lựa chọn còn lại [ĐỀ XUẤT].
  R.enterFates = function (ctx) {
    var run = ctx.run, hp = T().FATES_HP_PER_LEVEL * run.level;
    var card = R.deal(run, { kind: 'item', tiers: ['Gold'], any: [], not: [], names: [] }, 1, {})[0] || null;
    var choices = [
      { type: 'fate', id: 'legacy', name: "Fate's Legacy", tier: 'Legendary', kind: 'fate',
        desc: 'Upgrade your Bronze-tier and Silver-tier items to Gold.' },
      { type: 'fate', id: 'vitality', name: 'Second Wind', tier: 'Legendary', kind: 'fate', hp: hp,
        desc: '+' + hp + ' max Health (' + T().FATES_HP_PER_LEVEL + ' per level).' }
    ];
    choices.push(card ? { type: 'fate', id: 'item', name: 'Golden Gift', tier: 'Legendary', kind: 'fate', card: card,
        desc: 'Get a Gold-tier item: ' + R.title(R.tpl(card.id)) + '.' }
      : { type: 'fate', id: 'income', name: 'Windfall', tier: 'Legendary', kind: 'fate', income: 5, desc: '+5 Income.' });
    run.fatesPending = false;
    run.phase = { kind: 'fates', level: run.level, choices: choices };
    R.emit(ctx, { type: 'fates' });
    R.log(ctx, { t: 'fates' });
  };
  R.fatesChoose = function (ctx, cmd) {
    var run = ctx.run, c = run.phase.choices[cmd.i];
    if (!c) return 'choice ' + cmd.i + ' does not exist';
    if (c.id === 'item' && !R.canGain(run, c.card)) return 'no space for ' + c.card.id;
    if (c.id === 'legacy') {
      run.board.hand.concat(run.board.stash).forEach(function (ci) {
        while (R.tierIndex(ci.tier) < 2 && R.upgradeInst(ctx, ci, 'fates')) { /* Bronze/Silver → Gold */ }
      });
    } else if (c.id === 'vitality') { run.healthMax += c.hp; R.emit(ctx, { type: 'healthMax', delta: c.hp }); }
    else if (c.id === 'item') R.gainCard(ctx, c.card, null, null, 'fates');
    else if (c.id === 'income') R.income(ctx, c.income);
    R.log(ctx, { t: 'fatesPick', id: c.id });
    R.beginHour(ctx);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
