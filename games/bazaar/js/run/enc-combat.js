/* Chợ Phiên — đấu: quái giờ PvE (TCardEncounterCombat + monsters.json) và bóng PvP giờ cuối ngày. CODE-RUN §1.4, §3.5.
   Lệnh `fight`: reducer tự gọi BZSim.run với seed rút từ run.rng (đã ghi sẵn trong pha), lưu tóm tắt + hai bàn đã đấu
   để giao diện phát lại đúng trận đó (BZSim.run({boards: phase.boards, seed: phase.seed})).
   Thưởng quái thắng: RewardCombatGold / RewardCombatXp của thẻ quái + chọn 1 trong 3 thẻ trên bàn quái [ĐỀ XUẤT §3.5];
   thua quái: không mất gì (PrestigeLossFromMonsters = 0). Thua PvP: mất uy tín = số ngày (BazaarDeckTools.cs:2024-2035). */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };
  var Cb = {};
  R.ENCOUNTERS = R.ENCOUNTERS || {};
  R.ENCOUNTERS.combat = Cb;

  var monById = null;
  function monster(id) {
    if (!monById) { monById = {}; (root.BZ_MONSTERS || []).forEach(function (m) { monById[m.Id] = m; }); }
    return monById[id];
  }
  function tplLevel(m) { return ((m.Player || {}).Attributes || {}).Level || 1; }
  var combatPool = null;
  function pool() {
    if (combatPool) return combatPool;
    var E = R.enc().combats, out = [];
    for (var id in E) {
      var c = E[id], m = monster(c.Monster);
      if (!m || !c.Gold || T().PVE_EXCLUDE.test(c.InternalName || '')) continue;
      out.push(c);
    }
    combatPool = out;
    return out;
  }
  function ref(c) {
    var m = monster(c.Monster);
    return { type: 'combat', id: c.Id, name: c.Title || c.InternalName, tier: c.StartingTier, desc: '', kind: 'combat',
      level: tplLevel(m), health: ((m.Player || {}).Attributes || {}).HealthMax || 0, gold: c.Gold, xp: c.XpReward };
  }
  // Một quái theo bậc + khoảng cấp mẫu quanh ngày (nới dần TUNING.PVE_MAX_LEVEL_WIDEN), bỏ quái đã dùng
  Cb.pickFor = function (run, slot, usedMon) {
    usedMon = usedMon || {};
    var cands = [];
    for (var w = 0; w <= T().PVE_MAX_LEVEL_WIDEN && !cands.length; w++) {
      var lo = R.dataDay(run.day) + slot.lo - w, hi = R.dataDay(run.day) + slot.hi + w;
      cands = pool().filter(function (c) {
        var L = tplLevel(monster(c.Monster));
        return slot.tiers.indexOf(c.StartingTier) >= 0 && L >= lo && L <= hi && !usedMon[c.Monster];
      });
    }
    if (!cands.length) cands = pool().filter(function (c) { return !usedMon[c.Monster]; });
    return cands[R.randInt(run, cands.length)] || null;
  };
  Cb.ref = function (c) { return ref(c); };
  // Cấp mẫu của quái mà thẻ trận dẫn tới (để chặn sự kiện "Fight" quá sức so với ngày)
  Cb.levelOf = function (combatId) { var c = R.enc().combats[combatId], m = c && monster(c.Monster); return m ? tplLevel(m) : 0; };
  // Ba quái: một Đồng, một Bạc, một Vàng trở lên (WIKI §1.5), cấp mẫu quanh số ngày (TUNING.PVE_SLOTS)
  Cb.options = function (run) {
    var out = [], usedMon = {};
    T().PVE_SLOTS.forEach(function (slot) {
      var cands = [];
      for (var w = 0; w <= T().PVE_MAX_LEVEL_WIDEN && !cands.length; w++) {
        var lo = R.dataDay(run.day) + slot.lo - w, hi = R.dataDay(run.day) + slot.hi + w;
        cands = pool().filter(function (c) {
          var L = tplLevel(monster(c.Monster));
          return slot.tiers.indexOf(c.StartingTier) >= 0 && L >= lo && L <= hi && !usedMon[c.Monster];
        });
      }
      if (!cands.length) cands = pool().filter(function (c) { return !usedMon[c.Monster]; });
      var c = cands[R.randInt(run, cands.length)];
      if (c) { usedMon[c.Monster] = 1; out.push(ref(c)); }
    });
    return out;
  };

  function fightPhase(ctx, combatType, opponent, after) {
    ctx.run.phase = { kind: 'fight', combatType: combatType, opponent: opponent, seed: R.seedInt(ctx.run), after: after || 'endHour' };
    R.emit(ctx, { type: 'fightReady', combatType: combatType, name: opponent.name });
  }
  Cb.enter = function (ctx, r, after) {
    var c = R.enc().combats[r.id], m = monster(c.Monster), board = root.BZSim.boardFromMonster(m, 'm');
    board.name = c.Title || board.name;
    fightPhase(ctx, 'PVE', { kind: 'monster', name: board.name, board: board, combatId: c.Id, monsterId: m.Id, tier: c.StartingTier,
      rewards: { gold: c.Gold, xp: c.XpReward } }, after);
  };

  // Bóng từ bộ dữ liệu "người chơi khác" (data/ghosts.js: BZ_GHOSTS = {v:1, byDay: {"1": [ghost...], ...}},
  // ghost = {name, hero, level, day, wins, healthMax, cards:[{id, tier, ench, socket, size, section}]}): lấy danh sách của ngày
  // hiện tại, không có thì ngày thấp gần nhất; ưu tiên hero khác hero người chơi; chọn bằng run.rng. Máu vẫn theo đường cong
  // GHOST_HP_BY_DAY. Không có bộ dữ liệu / rỗng → null (dùng bóng dựng từ quái bên dưới).
  Cb.datasetGhost = function (run) {
    var G = root.BZ_GHOSTS, by = G && G.byDay, d, list = null, day = null;
    if (!by) return null;
    for (d = Math.floor(run.day); d >= 1 && !list; d--) { // ngày > 10 không có bóng riêng: đi xuống tới ngày gần nhất có dữ liệu
      var l = (by[String(d)] || []).filter(function (g) { return g && g.cards && g.cards.length; });
      if (l.length) { list = l; day = d; }
    }
    if (!list) return null;
    var other = list.filter(function (g) { return g.hero !== run.hero; });
    var g = (other.length ? other : list)[R.randInt(run, (other.length ? other : list).length)];
    var cards = [];
    g.cards.forEach(function (c, i) {
      var id = R.ensureTpl(c.id), tpl = R.tpl(id);
      if (!tpl) return; // thẻ của hero chưa nạp
      cards.push({ uid: 'g-' + i, id: id, tier: c.tier || tpl.StartingTier, ench: c.ench || null, socket: c.socket || 0,
        size: c.size || (R.isSkill(tpl) ? 1 : R.SIZE[tpl.Size] || 1), section: c.section || (R.isSkill(tpl) ? 'skills' : 'hand'), attrs: c.attrs });
    });
    var board = { name: g.name, hero: g.hero || null, level: g.level || R.dataDay(run.day), healthMax: R.ghostHp(run.day), cards: cards };
    return { kind: 'ghost', source: 'dataset', name: g.name, hero: g.hero || null, board: board, monsterId: null, level: board.level,
      wins: g.wins || 0, day: day, rewards: {} };
  };

  // Bóng PvP [ĐỀ XUẤT TUNING.GHOST_*]
  Cb.ghost = function (run) {
    var fromData = Cb.datasetGhost(run);
    if (fromData) return fromData;
    var level = R.dataDay(run.day) + T().GHOST_LEVEL_OFFSET, G = T().GHOST_HERO_BOARDS, mons = root.BZ_MONSTERS || [], m = null, name;
    if (G.days.indexOf(R.dataDay(run.day)) >= 0) {
      var heroes = mons.filter(function (x) { return G.match.test(x.InternalName || ''); });
      if (heroes.length) m = heroes[R.randInt(run, heroes.length)];
    }
    var board;
    if (m) {
      board = root.BZSim.boardFromMonster(m, 'g');
      name = 'Ghost of ' + G.match.exec(m.InternalName)[1];
    } else {
      var all = pool().map(function (c) { return monster(c.Monster); }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      var best = Infinity;
      all.forEach(function (x) { best = Math.min(best, Math.abs(tplLevel(x) - level)); });
      var near = all.filter(function (x) { return Math.abs(tplLevel(x) - level) === best; });
      m = near[R.randInt(run, near.length)];
      board = root.BZSim.boardFromMonster(m, 'g');
      name = 'Ghost of ' + board.name;
      board.level = level;
    }
    board.healthMax = R.ghostHp(run.day); // đường cong máu bóng đo từ clip (TUNING.GHOST_HP_BY_DAY)
    board.name = name;
    return { kind: 'ghost', name: name, board: board, monsterId: m.Id, level: board.level, rewards: {} };
  };
  Cb.enterPvp = function (ctx) { fightPhase(ctx, 'PVP', Cb.ghost(ctx.run), 'endHour'); };

  R.fightBoards = function (run) {
    var ph = run.phase;
    if (ph.boards) return R.clone(ph.boards);
    if (ph.kind !== 'fight') return null;
    return [R.playerBoard(run), R.clone(ph.opponent.board)];
  };

  // Thua quái vẫn giữ vàng theo phần máu đã làm mất: mỗi HealthMax/(vàng+1) máu quái bị trừ = +1 vàng (luật legacy, CODE-COMBAT §1.12,
  // BazaarCardDealer.cs:4044-4048, 4297-4311); Kripp "kept even if you lose" https://youtu.be/oVtvrCdqHEE?t=297. XP chỉ khi thắng.
  R.lossGold = function (gold, healthMax, health) {
    if (!gold || !(healthMax > 0)) return 0;
    var step = healthMax / (gold + 1), n = Math.floor((healthMax - Math.max(0, health)) / step + 1e-9);
    return Math.max(0, Math.min(gold, n));
  };
  function lossRewards(ph, r) {
    if (ph.combatType === 'PVP' || !ph.opponent.rewards) return {};
    var o = r.players && r.players[1];
    return o ? { gold: R.lossGold(ph.opponent.rewards.gold, o.healthMax, o.health) } : {};
  }

  Cb.fight = function (ctx) {
    var run = ctx.run, ph = run.phase, boards = R.fightBoards(run);
    // simOpts + boards: giao diện gọi BZSim.run(Object.assign({boards: phase.boards}, phase.simOpts)) để phát lại đúng trận
    var simOpts = { seed: ph.seed, combatType: ph.combatType, day: run.day, hour: run.hour + 1 };
    var r = root.BZSim.run(Object.assign({ boards: R.clone(boards), frames: false }, simOpts));
    var won = r.winner === 0 || (r.winner === 'draw' && !T().DRAW_IS_LOSS);
    run.phase = { kind: 'fightResult', combatType: ph.combatType, winner: r.winner === 0 ? 'player' : r.winner === 1 ? 'opponent' : 'draw',
      won: won, endMs: r.endMs, seed: ph.seed, simOpts: simOpts, boards: boards, opponent: { kind: ph.opponent.kind, name: ph.opponent.name,
        monsterId: ph.opponent.monsterId, combatId: ph.opponent.combatId || null },
      rewards: won ? ph.opponent.rewards : lossRewards(ph, r), after: ph.after };
    R.emit(ctx, { type: 'fight', won: won, winner: run.phase.winner, endMs: r.endMs, seed: ph.seed, combatType: ph.combatType });
    R.log(ctx, { t: 'fight', type: ph.combatType, vs: ph.opponent.name, won: won, ms: r.endMs });
    R.quests.fromFight(ctx, boards, r); // quest đếm trong trận (OnItemUsed, OnCardPerformedSlow...)
    R.ooc.fire(ctx, 'TTriggerOnFightEnded', { combatType: ph.combatType, outcome: won ? 'Win' : 'Loss' });
  };

  // ---------- rương mốc thắng (TUNING.CHESTS: 4 Đồng, 7 Bạc, 10 Vàng) ----------
  // Pha {kind:'chest', tier, wins, name, picks:[{card}], take:1, taken:0, gold, after}: mở rương = ability của sự kiện
  // "<Bậc> Loot (Level Up)" (vàng) + chọn 1 trong CHEST_PICKS thẻ Loot bậc đó. Rương 10 thắng mở trước màn hết run.
  R.chestFor = function (wins) { return T().CHESTS.filter(function (c) { return c.wins === wins; })[0] || null; };
  R.enterChest = function (ctx, chest, after) {
    var run = ctx.run, E2 = R.enc().events, e = null, id;
    for (id in E2) if (E2[id].InternalName === chest.loot) { e = E2[id]; break; }
    var f = e ? R.parseFilter(e.Desc || '') : { kind: 'item', tiers: [chest.tier], any: ['Loot'], not: [], names: [], hero: null, sizes: null };
    f.tiers = [chest.tier]; f.hero = 'any';
    var picks = R.deal(run, f, T().CHEST_PICKS, {});
    run.phase = { kind: 'chest', tier: chest.tier, wins: chest.wins, name: e ? (e.Title || e.InternalName) : chest.tier + ' Chest', eventId: null,
      picks: picks.map(function (c) { return { card: c }; }), take: 1, taken: 0, gold: 0, after: after || 'endHour' };
    R.emit(ctx, { type: 'chest', tier: chest.tier, wins: chest.wins, picks: picks.length });
    R.log(ctx, { t: 'chest', tier: chest.tier, wins: chest.wins });
    var g0 = run.gold;
    if (e) R.ENCOUNTERS.step.runAbilities(ctx, e); // "Get {ability.0} Gold": +2 / +? vàng theo dữ liệu
    run.phase.gold = run.gold - g0;
  };
  function chestDone(ctx) {
    if (R.checkEnd(ctx)) return;
    R.finish(ctx, ctx.run.phase.after);
  }
  R.chestChoose = function (ctx, cmd) {
    var ph = ctx.run.phase, p = ph.picks[cmd.i];
    if (!p) return 'chest slot ' + cmd.i + ' is empty';
    var ci = R.gainCard(ctx, p.card, cmd.section || null, cmd.socket == null ? null : cmd.socket, 'chest');
    if (!ci) return R.noSpaceReason(ctx.run, p.card);
    R.log(ctx, { t: 'chestPick', id: p.card.id, tier: p.card.tier });
    ph.picks.splice(cmd.i, 1);
    ph.taken++;
    if (ph.taken >= ph.take || !ph.picks.length) chestDone(ctx);
  };
  R.chestLeave = function (ctx) { chestDone(ctx); };

  Cb.next = function (ctx) {
    var run = ctx.run, ph = run.phase;
    if (ph.combatType === 'PVP') {
      if (ph.won) { run.wins++; R.emit(ctx, { type: 'win', wins: run.wins }); R.updateBest(ctx); }
      else {
        run.losses++;
        R.prestige(ctx, -run.day); // mất uy tín = ngày (BazaarDeckTools.cs:2024-2035 RemovePrestige)
        R.emit(ctx, { type: 'loss', losses: run.losses });
      }
      var chest = ph.won ? R.chestFor(run.wins) : null;
      if (chest) { R.enterChest(ctx, chest, ph.after); return; }
      if (R.checkEnd(ctx)) return;
      R.finish(ctx, ph.after);
      return;
    }
    R.gold(ctx, ph.rewards.gold || 0, 'combat'); // thắng: đủ vàng; thua: phần theo máu quái đã trừ (lossRewards)
    if (!ph.won) { R.finish(ctx, ph.after); return; }
    R.gainXp(ctx, ph.rewards.xp || 0, 'combat');
    var m = monster(ph.opponent.monsterId), picks = [];
    if (m) {
      var cards = root.BZSim.boardFromMonster(m, 'l').cards.filter(function (c) {
        var tpl = R.tpl(c.id);
        return tpl && !/^\[|TEMPLATE|DEBUG/.test(tpl.InternalName || '') && !(R.isSkill(tpl) && R.ownedSkill(run, c.id));
      });
      var seen = {}; cards = cards.filter(function (c) { if (seen[c.id]) return false; seen[c.id] = 1; return true; });
      while (picks.length < T().LOOT_PICKS && cards.length) {
        var c = cards.splice(R.randInt(run, cards.length), 1)[0];
        picks.push({ id: c.id, tier: c.tier, ench: c.ench || null });
      }
    }
    R.enterLoot(ctx, picks, 1, ph.after, ph.opponent.combatId);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
