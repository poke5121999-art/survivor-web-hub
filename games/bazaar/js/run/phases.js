/* Chợ Phiên — máy trạng thái của run: bảng PHASES[kind].commands[t] = handler(ctx, cmd) → undefined (xong) | chuỗi lỗi.
   BZRun.apply(run, cmd) sao chép run rồi chạy handler; lỗi thì trả lại run cũ + sự kiện {type:'rejected'}.
   Lệnh: pickHero, pick (chọn gặp gỡ), buy, sell, move, reroll, leave, choose (sự kiện/lên cấp/loot/bệ), fight, next. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };
  var E = function (k) { return R.ENCOUNTERS[k]; };

  // ---------- lệnh dùng chung: bán, xếp chỗ ----------
  R.sellPrice = function (run, uid) {
    var S = R.readState(run), C = null;
    S.cards.forEach(function (c) { if (c.uid === uid) C = c; });
    return C ? Math.max(0, root.BZSim.cattr(S, C, 'SellPrice') || 0) : 0;
  };
  function sell(ctx, cmd) {
    var run = ctx.run, ci = R.findCard(run, cmd.uid);
    if (!ci) return 'card ' + cmd.uid + ' not found';
    if (ci.section === 'skills') return 'skills cannot be sold';
    var gold = R.sellPrice(run, ci.uid);
    R.ooc.fire(ctx, 'TTriggerOnCardSold', { uid: ci.uid }); // thẻ còn trên bàn lúc trigger chạy ("khi bán thẻ này...")
    R.removeCard(run, ci.uid);
    R.gold(ctx, gold, 'sell');
    R.emit(ctx, { type: 'sell', uid: ci.uid, id: ci.id, gold: gold });
    R.log(ctx, { t: 'sell', id: ci.id, gold: gold });
  }
  function move(ctx, cmd) {
    var run = ctx.run, ci = R.findCard(run, cmd.uid);
    if (!ci) return 'card ' + cmd.uid + ' not found';
    if (ci.section === 'skills' || cmd.section === 'skills') return 'skills cannot be moved';
    if (!R.canPlace(run, cmd.section, cmd.socket, ci.size, ci.uid)) return 'sockets ' + cmd.section + ':' + cmd.socket + '+' + ci.size + ' are locked or occupied';
    var from = { section: ci.section, socket: ci.socket };
    R.removeCard(run, ci.uid);
    R.placeAt(run, ci, cmd.section, cmd.socket);
    R.emit(ctx, { type: 'move', uid: ci.uid, from: from, to: { section: cmd.section, socket: cmd.socket } });
  }
  var BOARD = { sell: sell, move: move };
  function withBoard(cmds) { var o = {}, k; for (k in BOARD) o[k] = BOARD[k]; for (k in cmds) o[k] = cmds[k]; return o; }

  // ---------- chọn gặp gỡ ----------
  function pick(ctx, cmd) {
    var run = ctx.run, r = run.phase.options[cmd.i];
    if (!r) return 'option ' + cmd.i + ' does not exist';
    var h = E(r.type);
    if (!h) return 'encounter type ' + r.type + ' has no handler';
    R.emit(ctx, { type: 'pick', ref: r });
    R.log(ctx, { t: 'pick', type: r.type, id: r.id, name: r.name });
    var rec = r.type === 'combat' ? R.enc().combats[r.id] : r.type === 'pedestal' ? R.enc().pedestals[r.id] : R.enc().events[r.id];
    if (rec) R.ooc.fire(ctx, 'TTriggerOnEncounterSelected', { enc: rec });
    if (r.type === 'merchant') R.gainXp(ctx, rec.Xp || 0, 'select'); // ExperienceAwardUponSelection (sự kiện tự cộng khi vào)
    h.enter(ctx, r, 'endHour');
  }
  function levelUpChoose(ctx, cmd) {
    var run = ctx.run, r = run.phase.choices[cmd.i];
    if (!r) return 'choice ' + cmd.i + ' does not exist';
    run.pendingLevelUps--;
    R.log(ctx, { t: 'levelUpPick', id: r.id, name: r.name });
    E(r.type).enter(ctx, r, 'beginHour');
  }

  R.PHASES = {
    heroSelect: { commands: {
      pickHero: function (ctx, cmd) {
        if (R.HEROES_PLAYABLE.indexOf(cmd.hero) < 0) return 'hero ' + cmd.hero + ' is not playable (have: ' + R.HEROES_PLAYABLE.join(', ') + ')';
        ctx.run.hero = cmd.hero;
        R.log(ctx, { t: 'hero', hero: cmd.hero });
        E('event').enterStart(ctx);
      }
    } },
    choose: { commands: withBoard({ pick: pick }) },
    merchant: { commands: withBoard({ buy: function (c, x) { return E('merchant').buy(c, x); }, reroll: function (c) { return E('merchant').reroll(c); },
      leave: function (c) { return E('merchant').leave(c); } }) },
    event: { commands: withBoard({ choose: function (c, x) { return E('event').choose(c, x); }, leave: function (c) { return E('event').leave(c); } }) },
    pedestal: { commands: withBoard({ choose: function (c, x) { return E('pedestal').choose(c, x); }, leave: function (c) { return E('pedestal').leave(c); } }) },
    loot: { commands: withBoard({ choose: function (c, x) { return R.lootChoose(c, x); }, leave: function (c) { return R.lootLeave(c); } }) },
    levelUp: { commands: withBoard({ choose: levelUpChoose }) },
    fight: { commands: { fight: function (c) { return E('combat').fight(c); } } },
    fightResult: { commands: { next: function (c) { return E('combat').next(c); } } },
    end: { commands: {} }
  };

  // ---------- API ----------
  R.newRun = function (opts) {
    opts = opts || {};
    var seed = (opts.seed == null ? 1 : opts.seed) >>> 0, m = R.mode();
    var run = { v: 1, seed: seed, rng: seed || 1, hero: null, day: 1, hour: 0, gold: T().START_GOLD, income: T().START_INCOME,
      level: 1, xp: 0, prestige: m.Prestige.PrestigeInitial, wins: 0, losses: 0, healthMax: T().START_HP,
      board: { hand: [], skills: [], stash: [] }, phase: { kind: 'heroSelect' }, log: [],
      uidN: 0, pendingLevelUps: 0, pattrs: {}, prev: [] };
    if (opts.hero) {
      var r = R.apply(run, { t: 'pickHero', hero: opts.hero });
      if (!r.ok) throw new Error(r.events[0].reason);
      run = r.run;
    }
    return run;
  };

  R.apply = function (run, cmd) {
    var kind = run && run.phase && run.phase.kind, ph = R.PHASES[kind];
    var h = ph && cmd && ph.commands[cmd.t];
    if (!h) return { run: run, ok: false, events: [{ type: 'rejected', reason: 'command ' + (cmd && cmd.t) + ' is not valid in phase ' + kind }] };
    var ctx = { run: R.clone(run), events: [] };
    var err = h(ctx, cmd);
    if (err) return { run: run, ok: false, events: [{ type: 'rejected', reason: err }] };
    return { run: ctx.run, ok: true, events: ctx.events };
  };

  // Lệnh hợp lệ ở pha hiện tại (mẫu lệnh). Buy/choose chỉ liệt kê những ô làm được ngay (đủ vàng, có chỗ).
  R.legal = function (run) {
    var ph = run.phase, out = [], i;
    var boardCmds = function () {
      R.allCards(run).forEach(function (c) { if (c.section !== 'skills') out.push({ t: 'sell', uid: c.uid }); });
      out.push({ t: 'move' }); // {uid, section, socket}: kiểm bằng BZRun.canPlace
    };
    switch (ph.kind) {
      case 'heroSelect': R.HEROES_PLAYABLE.forEach(function (h) { out.push({ t: 'pickHero', hero: h }); }); break;
      case 'choose': ph.options.forEach(function (o, k) { out.push({ t: 'pick', i: k }); }); boardCmds(); break;
      case 'merchant':
        ph.stock.forEach(function (s, k) { if (run.gold >= s.price && R.canGain(run, s.card)) out.push({ t: 'buy', i: k }); });
        if (ph.rerolls > 0 && run.gold >= ph.rerollCost) out.push({ t: 'reroll' });
        out.push({ t: 'leave' }); boardCmds(); break;
      case 'event':
        for (i = 0; i < ph.choices.length; i++) { var c = ph.choices[i]; if (!c.card || R.canGain(run, c.card)) out.push({ t: 'choose', i: i }); }
        if (ph.canExit) out.push({ t: 'leave' });
        boardCmds(); break;
      case 'loot':
        ph.picks.forEach(function (p, k) { if (R.canGain(run, p.card)) out.push({ t: 'choose', i: k }); });
        out.push({ t: 'leave' }); boardCmds(); break;
      case 'pedestal': ph.eligible.forEach(function (u, k) { out.push({ t: 'choose', i: k }); }); out.push({ t: 'leave' }); boardCmds(); break;
      case 'levelUp': ph.choices.forEach(function (c, k) { out.push({ t: 'choose', i: k }); }); boardCmds(); break;
      case 'fight': out.push({ t: 'fight' }); break;
      case 'fightResult': out.push({ t: 'next' }); break;
    }
    return out;
  };

  R.serialize = function (run) { return JSON.stringify(run); };
  R.deserialize = function (s) {
    var run = typeof s === 'string' ? JSON.parse(s) : s;
    if (!run || run.v !== 1) throw new Error('run save version ' + (run && run.v) + ' is not supported (want 1)');
    return run;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
