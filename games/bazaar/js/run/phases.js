/* Chợ Phiên — máy trạng thái của run: bảng PHASES[kind].commands[t] = handler(ctx, cmd) → undefined (xong) | chuỗi lỗi.
   BZRun.apply(run, cmd) sao chép run rồi chạy handler; lỗi thì trả lại run cũ + sự kiện {type:'rejected'}.
   Lệnh: pickHero, pick (chọn gặp gỡ), buy, sell, move, swap, reroll, leave, choose (sự kiện/lên cấp/loot/bệ/rương), fight, next.
   sell/move/swap dùng được ở mọi pha có bàn, kể cả `fight` (xếp lại sau khi xem bàn đối thủ, trước lệnh fight). */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };
  var E = function (k) { return R.ENCOUNTERS[k]; };

  // ---------- lệnh dùng chung: bán, xếp chỗ ----------
  R.sellPrice = function (run, uid) {
    var S = R.readState(run), C = null;
    S.cards.forEach(function (c) { if (c.uid === uid) C = c; });
    if (!C) return 0;
    var bonus = run.phase.kind === 'merchant' ? E('merchant').sellBonus(R.enc().events[run.phase.merchantId], S, C) : 0;
    return Math.max(0, (root.BZSim.cattr(S, C, 'SellPrice') || 0) + bonus);
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
  // ---------- xếp chỗ: đặt nhiều thẻ một lúc (đẩy / đổi chỗ) ----------
  // plan = [{ci, section, socket}]: hợp lệ khi mọi thẻ nằm trong ô mở (tay theo cấp), không chồng nhau và không chồng thẻ đứng yên.
  function sectionLen(section) { return section === 'hand' ? R.HAND_SLOTS : section === 'stash' ? T().STASH_SLOTS : 0; }
  R.layoutOk = function (run, plan) {
    var moving = {}, occ = { hand: [], stash: [] }, lock = R.unlockedSockets(run.level), i, k;
    plan.forEach(function (p) { moving[p.ci.uid] = 1; });
    ['hand', 'stash'].forEach(function (s) {
      run.board[s].forEach(function (c) { if (!moving[c.uid]) for (k = 0; k < c.size; k++) occ[s][c.socket + k] = 1; });
    });
    for (i = 0; i < plan.length; i++) {
      var p = plan[i], len = sectionLen(p.section);
      if (!len || p.socket == null || p.socket < 0 || p.socket !== Math.floor(p.socket) || p.socket + p.ci.size > len) return false;
      for (k = 0; k < p.ci.size; k++) {
        var s = p.socket + k;
        if (occ[p.section][s] || (p.section === 'hand' && !lock[s])) return false;
        occ[p.section][s] = 1;
      }
    }
    return true;
  };
  function applyPlan(ctx, plan) {
    var run = ctx.run;
    plan.forEach(function (p) { p.from = { section: p.ci.section, socket: p.ci.socket }; R.removeCard(run, p.ci.uid); });
    plan.forEach(function (p) { R.placeAt(run, p.ci, p.section, p.socket); });
    plan.forEach(function (p) {
      if (p.from.section !== p.section || p.from.socket !== p.socket)
        R.emit(ctx, { type: 'move', uid: p.ci.uid, from: p.from, to: { section: p.section, socket: p.socket }, pushed: !!p.pushed });
    });
  }
  // Đẩy thẻ đang chắn sang hai bên để thẻ `ci` vào ô (section, socket). mode: 'split' (thẻ bắt đầu bên trái ô đích sang trái,
  // còn lại sang phải), 'right', 'left'. Trả về plan hoặc null.
  function pushPlan(run, ci, section, socket, mode) {
    var others = run.board[section].filter(function (c) { return c.uid !== ci.uid; }).sort(function (a, b) { return a.socket - b.socket; });
    var plan = [{ ci: ci, section: section, socket: socket }], end = socket + ci.size, cur, i, c, ns;
    var goesLeft = function (c2) { return mode === 'left' ? c2.socket < end : mode === 'split' ? c2.socket < socket : false; };
    cur = end;
    for (i = 0; i < others.length; i++) {
      c = others[i];
      if (goesLeft(c) || c.socket + c.size <= socket) continue;
      ns = Math.max(c.socket, cur);
      if (ns !== c.socket) plan.push({ ci: c, section: section, socket: ns, pushed: true });
      cur = ns + c.size;
    }
    cur = socket;
    for (i = others.length - 1; i >= 0; i--) {
      c = others[i];
      if (!goesLeft(c)) continue;
      ns = Math.min(c.socket + c.size, cur) - c.size;
      if (ns !== c.socket) plan.push({ ci: c, section: section, socket: ns, pushed: true });
      cur = ns;
    }
    return R.layoutOk(run, plan) ? plan : null;
  }
  // Đổi chỗ a ↔ b (khác cỡ: thử canh trái / canh phải ô cũ của nhau)
  function swapPlan(run, a, b, aSocket) {
    var aTo = aSocket != null ? [aSocket] : [b.socket, b.socket + b.size - a.size];
    var bTo = [a.socket, a.socket + a.size - b.size];
    if (aSocket != null && a.section === b.section) bTo = bTo.concat([aSocket - b.size, aSocket + a.size]);
    for (var i = 0; i < aTo.length; i++) for (var j = 0; j < bTo.length; j++) {
      var plan = [{ ci: a, section: b.section, socket: aTo[i] }, { ci: b, section: a.section, socket: bTo[j], pushed: true }];
      if (R.layoutOk(run, plan)) return plan;
    }
    return null;
  }
  // move {uid, section, socket}: ô trống → chuyển; có thẻ chắn → đẩy thẻ chắn sang bên (tách đôi, rồi cả sang phải, rồi cả sang trái);
  // không đủ chỗ đẩy mà chỉ chắn đúng một thẻ → đổi chỗ với thẻ đó. Mỗi thẻ đổi ô phát một sự kiện move (pushed: true nếu bị đẩy).
  function move(ctx, cmd) {
    var run = ctx.run, ci = R.findCard(run, cmd.uid);
    if (!ci) return 'card ' + cmd.uid + ' not found';
    if (ci.section === 'skills' || cmd.section === 'skills') return 'skills cannot be moved';
    var plan = R.layoutOk(run, [{ ci: ci, section: cmd.section, socket: cmd.socket }]) ? [{ ci: ci, section: cmd.section, socket: cmd.socket }] : null;
    if (!plan && sectionLen(cmd.section) && cmd.socket >= 0 && cmd.socket + ci.size <= sectionLen(cmd.section)) {
      ['split', 'right', 'left'].some(function (m) { plan = pushPlan(run, ci, cmd.section, cmd.socket, m); return !!plan; });
      if (!plan) {
        var hit = run.board[cmd.section].filter(function (c) { return c.uid !== ci.uid && c.socket < cmd.socket + ci.size && c.socket + c.size > cmd.socket; });
        if (hit.length === 1) plan = swapPlan(run, ci, hit[0], cmd.socket);
      }
    }
    if (!plan) return 'sockets ' + cmd.section + ':' + cmd.socket + '+' + ci.size + ' are locked or occupied (no room to push or swap)';
    applyPlan(ctx, plan);
  }
  // swap {a, b}: đổi chỗ hai vật phẩm (cùng hoặc khác khu tay/kho), không cần ô trống
  function swap(ctx, cmd) {
    var run = ctx.run, a = R.findCard(run, cmd.a), b = R.findCard(run, cmd.b);
    if (!a || !b) return 'card ' + (!a ? cmd.a : cmd.b) + ' not found';
    if (a.uid === b.uid) return 'cannot swap a card with itself';
    if (a.section === 'skills' || b.section === 'skills') return 'skills cannot be moved';
    var plan = swapPlan(run, a, b, null);
    if (!plan) return 'cannot swap ' + a.uid + ' (' + a.size + ') with ' + b.uid + ' (' + b.size + '): sizes do not fit';
    applyPlan(ctx, plan);
    R.emit(ctx, { type: 'swap', a: a.uid, b: b.uid });
  }
  var BOARD = { sell: sell, move: move, swap: swap };
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
    if (rec) R.ooc.fire(ctx, 'TTriggerOnEncounterEntered', { enc: rec }); // trước khi bày hàng (Coupon: Custom_0 += 1 rồi mới CardsDealt)
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
        // Khởi đầu riêng của hero (data/heroes.js start: baseGold/baseIncome, fixedSkills — Karnok's Rage —, playerEffects)
        var st = (R.heroData(cmd.hero) || {}).start;
        if (st) {
          if (st.baseGold != null) ctx.run.gold = st.baseGold;
          if (st.baseIncome != null) ctx.run.income = st.baseIncome;
          (st.fixedSkills || []).forEach(function (id) { if (R.tpl(id)) R.gainCard(ctx, { id: id, tier: R.tpl(id).StartingTier, ench: null }, null, null, 'hero'); });
          // TCardPlayerEffect (Base Rage Effect...): giữ id trong run.effects, R.playerBoard chuyển vào board.effects (sim đọc)
          if ((st.playerEffects || []).length) ctx.run.effects = st.playerEffects.slice();
        }
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
    fates: { commands: withBoard({ choose: function (c, x) { return R.fatesChoose(c, x); } }) },
    chest: { commands: withBoard({ choose: function (c, x) { return R.chestChoose(c, x); }, leave: function (c) { return R.chestLeave(c); } }) },
    fight: { commands: withBoard({ fight: function (c) { return E('combat').fight(c); } }) },
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
      uidN: 0, pendingLevelUps: 0, fatesUsed: false, fatesPending: false, pattrs: {}, prev: [] };
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
      out.push({ t: 'move' }); // {uid, section, socket}: ô trống, hoặc đẩy / đổi chỗ thẻ đang chắn (BZRun.layoutOk)
      out.push({ t: 'swap' }); // {a, b}: đổi chỗ hai vật phẩm
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
      case 'loot': case 'chest':
        ph.picks.forEach(function (p, k) { if (R.canGain(run, p.card)) out.push({ t: 'choose', i: k }); });
        out.push({ t: 'leave' }); boardCmds(); break;
      case 'pedestal': ph.eligible.forEach(function (u, k) { out.push({ t: 'choose', i: k }); }); out.push({ t: 'leave' }); boardCmds(); break;
      case 'levelUp': case 'fates': ph.choices.forEach(function (c, k) { out.push({ t: 'choose', i: k }); }); boardCmds(); break;
      case 'fight': out.push({ t: 'fight' }); boardCmds(); break;
      case 'fightResult': out.push({ t: 'next' }); break;
    }
    return out;
  };

  R.serialize = function (run) { return JSON.stringify(run); };
  R.deserialize = function (s) {
    var run = typeof s === 'string' ? JSON.parse(s) : s;
    if (!run || run.v !== 1) throw new Error('run save version ' + (run && run.v) + ' is not supported (want 1)');
    // mẫu dẫn xuất của thẻ đã xong quest không lưu trong run: đăng ký lại cho bàn đã đấu (phase.boards) và bàn tốt nhất
    (((run.phase && run.phase.boards) || []).concat(run.phase && run.phase.opponent && run.phase.opponent.board ? [run.phase.opponent.board] : []))
      .forEach(function (b) { ((b && b.cards) || []).forEach(function (c) { R.ensureTpl(c.id); }); });
    R.allCards(run).forEach(function (ci) { R.questTplId(ci); });
    return run;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
