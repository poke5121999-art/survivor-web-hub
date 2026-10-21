/* Chợ Phiên — đồng hồ ngày/giờ và các ngắt (lên cấp, PvP, hết run). CODE-RUN §1.2-1.5:
   - giờ 0..5 mỗi ngày; giờ PVE_HOUR chọn 1 trong 3 quái, giờ PVP_HOUR đấu bóng (TUNING, theo WIKI §1.2);
   - hết mỗi giờ +ExperiencePerHour XP (Dealer:2516-2520), sang ngày mới +Income vàng (Dealer:2491) rồi OnDayStarted;
   - phần thưởng lên cấp chen vào đầu giờ kế (DayManagerOverrideQueue, Dealer:4720-4757), không tốn giờ;
   - hết run: đủ VictoriesToWin trận PvP thắng, uy tín về 0, hoặc hết uy tín. KHÔNG có hạn ngày: NumberOfDays chỉ là số ngày có dữ liệu riêng, qua ngày đó dùng dữ liệu ngày cuối (CODE-RUN §0, Dealer:2329-2332). */
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
      R.emit(ctx, { type: 'day', day: run.day });
      R.gold(ctx, run.income, 'income');
      R.ooc.fire(ctx, 'TTriggerOnDayStarted', {});
    }
    R.ooc.fire(ctx, 'TTriggerOnHourStarted', {});
    R.beginHour(ctx);
  };

  // ---------- bày thẻ gặp gỡ cho giờ tự do ----------
  function heroOk(e, run) { var h = e.Heroes || []; return !h.length || h.indexOf('Common') >= 0 || h.indexOf(run.hero) >= 0; }
  // gặp gỡ không có art trong chính game (ArtKey rỗng: Claw Game, Big Bad Wolf) thì không bày, như HIDDEN_CARDS với vật phẩm; không vẽ thay
  function artOk(e) { return e.ArtKey !== ''; }
  function dayOk(e, run) {
    var d = R.dataDay(run.day), S = root.BZ_SHOPS, sr = S && !e.LevelUp && (S.merchants[e.Id] || S.trainers[e.Id] || S.events[e.Id]);
    // ngày thật có thẻ này (bazaardb days_active, 10 = "10+") thay cho Days của bản demo khi có
    if (sr && sr.days && sr.days.length) { if (sr.days.indexOf(Math.min(10, run.day)) < 0) return false; }
    else if (e.Days && (d < e.Days[0] || d > e.Days[1])) return false;
    // Sự kiện kết thúc bằng một trận cố định ("Treasure Chest (Mimic)" = Mimic cấp 11, mô tả chỉ ghi "Get an item"): chỉ bày khi quái
    // không quá sức so với ngày (cấp mẫu ≤ ngày + EVENT_FIGHT_LEVEL_SLACK) [FLOW-10]
    if (e.Kind === 'fight' && e.Options && e.Options.length && e.Options.every(function (o) { return o.t === 'combat'; })) {
      var lv = Math.min.apply(null, e.Options.map(function (o) { return R.ENCOUNTERS.combat.levelOf(o.id); }));
      if (lv > d + T().EVENT_FIGHT_LEVEL_SLACK) return false;
    }
    return true;
  }
  function ref(type, e) {
    return { type: type, id: e.Id, name: e.Title || e.InternalName, tier: e.StartingTier, desc: e.Desc || '', kind: e.Kind || type };
  }
  R.encounterRef = ref;
  // Bản sao thẻ gặp gỡ đưa cho người chơi: chữ mô tả đã thay `{ability.N}` / `{aura.N}` bằng số thật
  function dealt(run, r) {
    var c = R.clone(r), e = r.type === 'pedestal' ? R.enc().pedestals[r.id] : r.type === 'step' ? R.enc().steps[r.id] : R.enc().events[r.id];
    if (e && c.desc) c.desc = R.encText(run, e, c.desc);
    return c;
  }
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
    var tier = R.rollTier(run, T().ENCOUNTER_TIER_ODDS_WITH_LEGENDARY), ti = R.tierIndex(tier), order = [ti];
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
      var ok = function (r) { var e = recOf(r); return !taken[r.id] && artOk(e) && heroOk(e, run) && dayOk(e, run); };
      var cands = base.filter(function (r) { return ok(r) && !prev[r.id]; });
      if (!cands.length) cands = base.filter(ok); // "not dealt last hour unless that empties the list" (Dealer:4938-4949)
      var r = pickByTier(run, cands);
      if (r) { taken[r.id] = 1; out.push(dealt(run, r)); }
    });
    return out;
  };

  // ---------- lên cấp: bảng phần thưởng theo CẤP (TUNING.LEVEL_REWARDS), mỗi ô giải bởi bảng LEVEL_SLOT_KINDS ----------
  function recAny(r) { var E = R.enc(); return r.type === 'pedestal' ? E.pedestals[r.id] : r.type === 'step' ? E.steps[r.id] : E.events[r.id]; }
  function byName(table, name) {
    var m = R.enc()[table], id;
    for (id in m) if (m[id].InternalName === name) return m[id];
    return null;
  }
  // Mọi thẻ "(Level Up)" gom một lần: events / steps / pedestals
  var luCache = null;
  function levelUpCards() {
    if (luCache) return luCache;
    var E = R.enc(), out = [], id;
    [['events', 'event'], ['steps', 'step'], ['pedestals', 'pedestal']].forEach(function (p) {
      for (id in E[p[0]]) if (E[p[0]][id].LevelUp) out.push({ rec: E[p[0]][id], type: p[1] });
    });
    luCache = out;
    return out;
  }
  function tierSet(arg) { return (arg || '').split('|'); }
  // cands: [{rec,type}] đã lọc; chọn đúng bậc trước, không có thì lùi xuống rồi đi lên (như bản cũ)
  function pickNearTier(run, cands, tiers) {
    if (!cands.length) return null;
    var idx = tiers.map(R.tierIndex), lo = Math.min.apply(null, idx), hi = Math.max.apply(null, idx), groups = [idx], d, u;
    for (d = lo - 1; d >= 0; d--) groups.push([d]);
    for (u = hi + 1; u < R.TIERS.length; u++) groups.push([u]);
    for (var k = 0; k < groups.length; k++) {
      var sub = cands.filter(function (c) { return groups[k].indexOf(R.tierIndex(c.rec.StartingTier)) >= 0; });
      if (sub.length) return sub[R.randInt(run, sub.length)];
    }
    return null;
  }
  function usable(run, c, taken) { return !taken[c.rec.Id] && c.rec.Kind !== 'unknown' && c.rec.Kind !== 'merchant' && artOk(c.rec) && heroOk(c.rec, run) && dayOk(c.rec, run); }
  function isCommon(e) { var h = e.Heroes || []; return !h.length || h.indexOf('Common') >= 0; }
  function fixedSlot(key) {
    return function (run, arg, taken) {
      var spec = T().LEVEL_SLOT_EVENTS[arg ? key + ':' + arg : key], e = spec && byName(spec[0], spec[1]);
      return e && !taken[e.Id] ? { rec: e, type: spec[0] === 'pedestals' ? 'pedestal' : 'event' } : null;
    };
  }
  function namedByTier(suffix) { // "<Bậc> item (Level Up)" / "<Bậc> Loot (Level Up)"
    return function (run, arg, taken) {
      var e = byName('events', tierSet(arg).join(' or ') + ' ' + suffix + ' (Level Up)');
      return e && !taken[e.Id] ? { rec: e, type: 'event' } : null;
    };
  }
  // Registry: loại ô → (run, tham số, đã bày) → {rec, type} | null
  R.LEVEL_SLOT_KINDS = {
    pip: fixedSlot('pip'), argenta: fixedSlot('argenta'), orlin: fixedSlot('orlin'), adira: fixedSlot('adira'),
    artist: fixedSlot('artist'), upgrade: fixedSlot('upgrade'),
    item: namedByTier('item'), loot: namedByTier('Loot'),
    trainer: function (run, arg, taken) { // thầy chủ đề: "Teaches X skills", không nêu bậc, không phải thầy riêng hero
      var c = levelUpCards().filter(function (x) {
        var d = x.rec.Desc || '';
        return x.type === 'event' && x.rec.Kind === 'pile' && /teaches/i.test(d) && !/tier/i.test(d) && !/unique to/i.test(d) && usable(run, x, taken);
      });
      return c.length ? c[R.randInt(run, c.length)] : null;
    },
    heroTeacher: function (run, arg, taken) {
      var c = levelUpCards().filter(function (x) {
        return x.type === 'event' && /unique to/i.test(x.rec.Desc || '') && !isCommon(x.rec) && usable(run, x, taken);
      });
      return c.length ? c[R.randInt(run, c.length)] : null;
    },
    heroReward: function (run, arg, taken) { // "Random Character Reward": thẻ lên cấp riêng của hero (không Common), không phải thầy / bệ
      var c = levelUpCards().filter(function (x) {
        var d = x.rec.Desc || '';
        return x.type !== 'pedestal' && !isCommon(x.rec) && !/teaches/i.test(d) && usable(run, x, taken);
      });
      return pickNearTier(run, c, tierSet(arg));
    },
    enchantRandom: function (run, arg, taken) {
      var c = levelUpCards().filter(function (x) {
        return x.type === 'pedestal' && /^Enchant an item with/i.test(x.rec.Desc || '') && T().LEVEL_ENCHANT_TIERS.indexOf(x.rec.StartingTier) >= 0 && usable(run, x, taken);
      });
      return c.length ? c[R.randInt(run, c.length)] : null;
    }
  };
  // Hàng phần thưởng của một cấp: cấp > 29 lặp mẫu LEVEL_REWARDS_LOOP
  R.levelRewardRow = function (level) {
    var t = T(), lp = t.LEVEL_REWARDS_LOOP, L = level;
    if (!t.LEVEL_REWARDS[L]) L = level > lp[1] ? lp[0] + ((level - lp[0]) % (lp[1] - lp[0] + 1)) : Math.max(2, level);
    return t.LEVEL_REWARDS[L] || [];
  };
  R.levelUpOptions = function (run, level) {
    if (level == null) level = run.pendingLevelUps > 0 ? run.level - run.pendingLevelUps + 1 : run.level;
    var out = [], taken = {};
    R.levelRewardRow(level).forEach(function (slot) {
      var kv = slot.split(':'), fn = R.LEVEL_SLOT_KINDS[kv[0]], c = fn && fn(run, kv[1], taken);
      if (!c && kv[0] === 'heroTeacher') c = R.LEVEL_SLOT_KINDS.trainer(run, null, taken); // hero không có thầy riêng (Jules): thêm một thầy chủ đề
      if (!c) return;
      taken[c.rec.Id] = 1;
      var d = dealt(run, ref(c.type, c.rec));
      d.slot = slot; // loại ô trong LEVEL_REWARDS (giao diện có thể hiện nhãn "Random Skill Trainer", "Random Enchant Option"...)
      out.push(d);
    });
    return out;
  };
  R.enterLevelUp = function (ctx) {
    var run = ctx.run, level = run.level - run.pendingLevelUps + 1, choices = R.levelUpOptions(run, level);
    if (!choices.length) { run.pendingLevelUps--; R.beginHour(ctx); return; } // dữ liệu không có thẻ nào cho cấp này: bỏ qua
    run.phase = { kind: 'levelUp', level: level, choices: choices };
    R.emit(ctx, { type: 'levelUpChoice', level: level });
  };

  // ---------- Fates: bước thật của sự kiện Futura (TUNING.FATES_EVENT), cùng hình với lựa chọn lên cấp ----------
  // choice = {type:'fate', id: khoá giao diện, stepId, name, tier, kind:'fate', desc, artKey}
  R.fatesChoices = function (run) {
    var fe = byName('events', T().FATES_EVENT), E = R.enc();
    return ((fe && fe.Steps) || []).map(function (sid) {
      var s = E.steps[sid];
      if (!s) return null;
      return { type: 'fate', id: T().FATES_KEYS[s.InternalName] || sid, stepId: sid, name: s.Title || s.InternalName, tier: 'Legendary', kind: 'fate',
        desc: R.encText(run, s, s.Desc || ''), artKey: s.ArtKey || null };
    }).filter(Boolean);
  };
  R.enterFates = function (ctx) {
    var run = ctx.run, all = R.fatesChoices(run), choices = [];
    while (choices.length < T().FATES_PICKS && all.length) choices.push(all.splice(R.randInt(run, all.length), 1)[0]);
    run.fatesPending = false;
    run.phase = { kind: 'fates', level: run.level, choices: choices };
    R.emit(ctx, { type: 'fates' });
    R.log(ctx, { t: 'fates' });
  };
  R.fatesChoose = function (ctx, cmd) {
    var run = ctx.run, c = run.phase.choices[cmd.i];
    if (!c) return 'choice ' + cmd.i + ' does not exist';
    R.log(ctx, { t: 'fatesPick', id: c.id });
    R.ENCOUNTERS.step.resolve(ctx, R.enc().steps[c.stepId], 'beginHour'); // ability của bước chạy qua DSL; sau đó vào giờ kế (không tốn giờ)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
