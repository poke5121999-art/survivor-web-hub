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
  // Ba quái: một Đồng, một Bạc, một Vàng trở lên (WIKI §1.5), cấp mẫu quanh số ngày (TUNING.PVE_SLOTS)
  Cb.options = function (run) {
    var out = [], usedMon = {};
    T().PVE_SLOTS.forEach(function (slot) {
      var cands = [];
      for (var w = 0; w <= T().PVE_MAX_LEVEL_WIDEN && !cands.length; w++) {
        var lo = run.day + slot.lo - w, hi = run.day + slot.hi + w;
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

  // Bóng PvP [ĐỀ XUẤT TUNING.GHOST_*]
  Cb.ghost = function (run) {
    var level = run.day + T().GHOST_LEVEL_OFFSET, G = T().GHOST_HERO_BOARDS, mons = root.BZ_MONSTERS || [], m = null, name;
    if (G.days.indexOf(run.day) >= 0) {
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
    R.ooc.fire(ctx, 'TTriggerOnFightEnded', { combatType: ph.combatType, outcome: won ? 'Win' : 'Loss' });
  };

  Cb.next = function (ctx) {
    var run = ctx.run, ph = run.phase;
    if (ph.combatType === 'PVP') {
      if (ph.won) { run.wins++; R.emit(ctx, { type: 'win', wins: run.wins }); }
      else {
        run.losses++;
        R.prestige(ctx, -run.day); // mất uy tín = ngày (BazaarDeckTools.cs:2024-2035 RemovePrestige)
        R.emit(ctx, { type: 'loss', losses: run.losses });
      }
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
