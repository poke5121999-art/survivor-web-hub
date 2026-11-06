/*
 * pokebattle.js - meeting something in the grass, and what happens next.
 *
 * Two halves:
 *   ENCOUNTERS  - rolling a wild Pokemon out of an island's table, weighted,
 *                 filtered by time of day, at a level in the island's band.
 *   BATTLE      - a headless turn engine. It takes actions in and produces a
 *                 list of EVENTS out; it draws nothing and knows nothing about
 *                 the interface. pokeui.js plays the events back.
 *
 * WHY headless: the same engine has to run a full animated fight on screen and
 * an instant off-screen resolution for the "chạy trốn" shortcut and for the
 * bot. Anything that touched the DOM here would need a second copy of the
 * rules for the second caller, and two copies of a damage formula is how you
 * get a game where the numbers disagree with themselves.
 *
 * The turn order, the damage roll, the status rules and the capture maths are
 * all Generation 3 and all live in poke.js. This file is the loop around them.
 */
(function (global) {
  'use strict';

  var P = global.ISL_POKE;
  var ISL = global.ISL_ISLANDS;

  /* Chance of an encounter per NEW tall-grass tile entered. Standing still or
   * walking on the spot must never roll, which is why the caller tracks the
   * last tile rather than sampling per frame - at 60fps a per-frame roll of
   * any size at all makes grass impassable. */
  var ENCOUNTER_RATE = 0.14;

  // -------------------------------------------------------------- encounter
  /* `when` on a row is 'day', 'night' or null. Night is 18:00-06:00, matching
   * sim.isNight, so the two can never drift apart. */
  function rollSpecies(isl, night) {
    var rows = isl.enc || [];
    var pool = [], total = 0, i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r[1]) continue;                       // weight 0 - reserved slot
      if (r[4] === 'day' && night) continue;
      if (r[4] === 'night' && !night) continue;
      pool.push(r); total += r[1];
    }
    if (!total) {
      /* Every row was filtered out by the clock. Rather than refuse the
       * encounter - which reads as "the grass is broken" - fall back to the
       * unfiltered table. An island whose whole cast is nocturnal should still
       * have something in it at noon. */
      for (i = 0; i < rows.length; i++) if (rows[i][1]) { pool.push(rows[i]); total += rows[i][1]; }
    }
    if (!total) return null;
    var roll = Math.random() * total;
    for (i = 0; i < pool.length; i++) {
      roll -= pool[i][1];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /* Build the wild Pokemon. `luck` is the player's daily luck from sim, in
   * [-0.1, +0.1]; a lucky day nudges the level up and gives the shiny roll a
   * few extra tries, which is a small thing that makes the luck stat mean
   * something outside the mine. */
  function spawnWild(isl, opt) {
    opt = opt || {};
    var row = rollSpecies(isl, !!opt.night);
    if (!row) return null;
    var lo = row[2], hi = row[3];
    var lv = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (opt.luck > 0.04 && lv < 100) lv++;
    var pid = null;
    var rolls = 16 + (opt.luck > 0 ? Math.round(opt.luck * 80) : 0);
    for (var i = 0; i < rolls; i++) {
      var cand = P.rand32();
      if (P.shinyOf(cand, P.trainerId(), P.secretId())) { pid = cand; break; }
    }
    var w = P.create(row[0], lv, pid != null ? { pid: pid } : {});
    w.wild = true;
    w.stages = [0, 0, 0, 0, 0, 0, 0, 0];
    return w;
  }

  // ----------------------------------------------------------------- battle
  /* stages index: 0 unused (HP), 1 Atk, 2 Def, 3 SpA, 4 SpD, 5 Spe,
   * 6 accuracy, 7 evasion - matching poke.js `damage`. */
  function freshStages() { return [0, 0, 0, 0, 0, 0, 0, 0]; }

  function Battle(game, wild, opt) {
    opt = opt || {};
    this.game = game;
    this.sim = game.sim;
    this.wild = wild;
    this.island = opt.island || null;
    this.turn = 0;
    this.over = false;
    this.result = null;              // 'caught' | 'won' | 'lost' | 'fled' | 'ranaway'
    this.events = [];
    this.participants = [];
    this.wild.stages = freshStages();
    this.you = this.firstHealthy();
    if (this.you) {
      this.you.stages = freshStages();
      this.participants.push(this.you);
    }
    this.log(P.speciesName(wild.id) + ' hoang dã xuất hiện!' +
             (wild.shiny ? ' ✨ NÓ LẤP LÁNH!' : ''));
    if (this.you) this.log('Đi đi, ' + P.nameOf(this.you) + '!');
  }

  Battle.prototype.party = function () { return this.game.pokeParty(); };

  Battle.prototype.firstHealthy = function () {
    var pt = this.party();
    for (var i = 0; i < pt.length; i++) if (pt[i].hp > 0) return pt[i];
    return null;
  };

  Battle.prototype.log = function (text) { this.events.push({ t: 'msg', text: text }); };
  Battle.prototype.push = function (e) { this.events.push(e); };
  Battle.prototype.drain = function () { var e = this.events; this.events = []; return e; };

  /* -------------------------------------------------------------- one turn
   * The player's action and the wild Pokemon's are resolved in speed order,
   * with move priority ahead of speed. Everything that is not a move - a ball,
   * an item, a switch, running - happens BEFORE the wild Pokemon acts, which
   * is what the real games do and what makes a Quick Ball worth anything. */
  Battle.prototype.act = function (action) {
    if (this.over) return this.drain();
    this.turn++;

    /* An action that FAILED - no ball left, an item that does nothing here, a
     * switch to a fainted Pokemon - does not spend the turn. It used to undo
     * the counter with `this.turn--` and then fall through, so the wild got a
     * free hit for a button press that did nothing, and the Quick Ball's
     * "first turn only" bonus could be held open indefinitely. */
    var ok = true;
    if (action.kind === 'ball')  { ok = this.doBall(action.ball) !== false; }
    else if (action.kind === 'run') { this.doRun(); }
    else if (action.kind === 'item') { ok = this.doItem(action.item) !== false; }
    else if (action.kind === 'switch') { ok = this.doSwitch(action.index) !== false; }
    else if (action.kind === 'move') { return this.doMoveTurn(action.slot); }

    if (!ok) { this.turn--; return this.drain(); }
    if (!this.over && action.kind !== 'move') this.wildTurn();
    if (!this.over) this.endOfTurn();
    return this.drain();
  };

  Battle.prototype.doMoveTurn = function (slot) {
    var mine = this.you.moves[slot];
    var theirs = this.pickWildMove();
    var myMove = mine ? P.move(mine.id) : null;
    var theirMove = theirs ? P.move(theirs.id) : null;
    var myPri = (myMove && myMove.pri) || 0;
    var thPri = (theirMove && theirMove.pri) || 0;
    var mySpd = Math.floor(this.you.stats[5] * P.stageMul(this.you.stages[5])) *
                (this.you.status === 'par' ? 0.25 : 1);
    var thSpd = Math.floor(this.wild.stats[5] * P.stageMul(this.wild.stages[5])) *
                (this.wild.status === 'par' ? 0.25 : 1);
    var meFirst = myPri > thPri || (myPri === thPri &&
      (mySpd > thSpd || (mySpd === thSpd && Math.random() < 0.5)));

    if (meFirst) {
      this.useMove(this.you, this.wild, mine, true);
      if (!this.over && this.wild.hp > 0) this.useMove(this.wild, this.you, theirs, false);
    } else {
      this.useMove(this.wild, this.you, theirs, false);
      if (!this.over && this.you && this.you.hp > 0) this.useMove(this.you, this.wild, mine, true);
    }
    if (!this.over) this.endOfTurn();
    return this.drain();
  };

  Battle.prototype.pickWildMove = function () {
    var usable = this.wild.moves.filter(function (m) { return m.pp > 0; });
    if (!usable.length) return null;                        // Struggle, in effect
    return usable[Math.floor(Math.random() * usable.length)];
  };


  /* Moves whose damage is not "power through the formula". Keyed by name
   * because that is what the generated data carries and it reads like the
   * move list it is. Returns null when the move simply fails. */
  var LEVEL_DMG  = { 'Night Shade': 1, 'Seismic Toss': 1 };
  var FLAT_DMG   = { 'Dragon Rage': 40, 'Sonic Boom': 20 };
  var FIXED_POW  = { 'Low Kick': 50 };      // weight-based only from Gen 4 on
  var OHKO       = { 'Horn Drill': 1, 'Fissure': 1, 'Guillotine': 1, 'Sheer Cold': 1 };

  Battle.prototype.fixedDamage = function (from, to, m) {
    var nm = m.n;

    if (LEVEL_DMG[nm]) {
      /* Typeless in effect, but immunity still applies: Normal cannot touch a
       * Ghost and Seismic Toss is Fighting. */
      if (P.effectOf(m.t, to.id) === 0) return null;
      return from.lv;
    }
    if (FLAT_DMG[nm]) {
      if (P.effectOf(m.t, to.id) === 0) return null;
      return FLAT_DMG[nm];
    }
    if (nm === 'Super Fang') {
      if (P.effectOf(m.t, to.id) === 0) return null;
      return Math.max(1, Math.floor(to.hp / 2));
    }
    if (nm === 'Endeavor') {
      if (P.effectOf(m.t, to.id) === 0) return null;
      if (to.hp <= from.hp) return null;
      return to.hp - from.hp;
    }
    if (OHKO[nm]) {
      /* Gen 3 one-hit KOs: accuracy is 30 plus the level difference, and they
       * cannot touch anything above the user's level at all. */
      if (to.lv > from.lv) return null;
      if (P.effectOf(m.t, to.id) === 0) return null;
      var chance = 30 + (from.lv - to.lv);
      if (Math.random() * 100 >= chance) return null;
      return to.hp;
    }
    if (nm === 'Magnitude') {
      /* One roll on the real Magnitude 4-10 distribution. */
      var r = Math.random() * 100, pow;
      if (r < 5) pow = 10; else if (r < 15) pow = 30; else if (r < 35) pow = 50;
      else if (r < 65) pow = 70; else if (r < 85) pow = 90;
      else if (r < 95) pow = 110; else pow = 150;
      this.log('Cường độ ' + (pow <= 10 ? 4 : pow <= 30 ? 5 : pow <= 50 ? 6 :
                              pow <= 70 ? 7 : pow <= 90 ? 8 : pow <= 110 ? 9 : 10) + '!');
      return P.damageWith(from, to, m, pow).dmg;
    }
    if (nm === 'Flail' || nm === 'Reversal') {
      var ratio = Math.floor(from.hp * 48 / Math.max(1, from.stats[0]));
      var p2 = ratio < 2 ? 200 : ratio < 5 ? 150 : ratio < 10 ? 100
             : ratio < 17 ? 80 : ratio < 33 ? 40 : 20;
      return P.damageWith(from, to, m, p2).dmg;
    }
    if (FIXED_POW[nm]) return P.damageWith(from, to, m, FIXED_POW[nm]).dmg;

    if (nm === 'Counter' || nm === 'Mirror Coat') {
      /* Both need the damage taken THIS turn, which the engine records in
       * `lastHit`. Counter answers physical, Mirror Coat answers special. */
      var want = nm === 'Counter' ? 0 : 1;
      var lh = from.lastHit;
      if (!lh || lh.turn !== this.turn || lh.cls !== want || lh.amount <= 0) return null;
      return lh.amount * 2;
    }
    return null;      // Spit Up without Stockpile, and anything unmodelled
  };

  Battle.prototype.useMove = function (from, to, slot, mine) {
    if (!from || from.hp <= 0 || !to || to.hp <= 0) return;
    if (!this.canAct(from, mine)) return;
    if (!slot) {
      /* Struggle is a 50-power physical Normal move put through the ordinary
       * damage formula, and it costs the user a quarter of the damage DEALT.
       * It used to be a flat quarter of the struggler's own max HP, ignoring
       * defence, level and typing - so it went through a Ghost, and a fat
       * Snorlax got MORE dangerous once it ran out of moves. */
      this.log(P.nameOf(from) + ' không còn chiêu nào — vùng vẫy!');
      var st = P.struggle(from, to);
      to.hp = Math.max(0, to.hp - st.dmg);
      this.push({ t: 'dmg', side: mine ? 'wild' : 'you', amount: st.dmg });
      var back = Math.max(1, Math.floor(st.dmg / 4));
      from.hp = Math.max(0, from.hp - back);
      this.push({ t: 'dmg', side: mine ? 'you' : 'wild', amount: back });
      this.log(P.nameOf(from) + ' bị thương ' + back + ' vì dùng sức.');
      this.checkFaint(to, !mine);
      this.checkFaint(from, mine);
      return;
    }
    var m = P.move(slot.id);
    if (!m) return;
    /* A move at 0 PP cannot be used. Only the UI greyed it out, so anything
     * driving the engine directly - the wild side's own move picker included -
     * could fire an empty move forever and the Struggle branch was
     * unreachable. */
    if (slot.pp <= 0) { this.useMove(from, to, null, mine); return; }
    slot.pp = Math.max(0, slot.pp - 1);
    this.log(P.nameOf(from) + ' dùng ' + m.n + '!');

    var r = P.damage(from, to, slot.id);
    if (r.miss) { this.log('Nhưng trượt mất!'); return; }

    /* A damaging move with no power number is not a status move. Seventeen of
     * them - Night Shade, Seismic Toss, Dragon Rage, Sonic Boom, Super Fang,
     * the OHKOs and the rest - fell into this branch, dealt nothing, had no
     * ailment to apply, and produced no message at all: the turn just went by
     * in silence. A Gastly caught at level 21 could not deal damage AT ALL. */
    if (m.c !== 2 && !m.p) {
      var fixed = this.fixedDamage(from, to, m);
      if (fixed == null) {
        this.log('Nhưng không có tác dụng gì.');
        return;
      }
      to.hp = Math.max(0, to.hp - fixed);
      this.push({ t: 'dmg', side: mine ? 'wild' : 'you', amount: fixed });
      if (m.mc === 'ohko') this.log('Một đòn kết liễu!');
      this.checkFaint(to, !mine);
      return;
    }
    if (m.c === 2) { this.applyStatus(from, to, m, mine); return; }

    var hits = 1;
    if (m.hits) hits = m.hits[0] + Math.floor(Math.random() * (m.hits[1] - m.hits[0] + 1));
    var total = 0;
    for (var i = 0; i < hits && to.hp > 0; i++) {
      var d = i === 0 ? r : P.damage(from, to, slot.id);
      if (d.miss) break;
      to.hp = Math.max(0, to.hp - d.dmg);
      /* Counter and Mirror Coat answer the damage taken THIS turn, so the
       * defender has to remember what class of hit landed and when. */
      to.lastHit = { turn: this.turn, cls: m.c, amount: d.dmg };
      total += d.dmg;
      this.push({ t: 'dmg', side: mine ? 'wild' : 'you', amount: d.dmg,
                  crit: d.crit, eff: d.eff });
    }
    if (r.crit) this.log('Chí mạng!');
    var et = P.effectText(r.eff);
    if (et) this.log(et);
    if (hits > 1) this.log('Trúng ' + hits + ' phát!');

    /* `dr` is drain when positive and RECOIL when negative - Take Down,
     * Double-Edge and Submission all carry a negative percentage. The old code
     * ran Math.max(1, total * dr / 100) and ADDED it, and Math.max(1, -35) is
     * 1, so every recoil move quietly healed its user for one point. They were
     * strictly free. */
    if (m.dr && total > 0) {
      if (m.dr > 0) {
        var healed = Math.max(1, Math.floor(total * m.dr / 100));
        from.hp = Math.min(from.stats[0], from.hp + healed);
        this.push({ t: 'heal', side: mine ? 'you' : 'wild', amount: healed });
        this.log(P.nameOf(from) + ' hút được ' + healed + ' HP.');
      } else {
        var hurt = Math.max(1, Math.floor(total * -m.dr / 100));
        from.hp = Math.max(0, from.hp - hurt);
        this.push({ t: 'dmg', side: mine ? 'you' : 'wild', amount: hurt });
        this.log(P.nameOf(from) + ' dội lại ' + hurt + ' sát thương.');
        this.checkFaint(from, mine);
      }
    }
    if (r.eff > 0) this.applyStatus(from, to, m, mine);
    this.checkFaint(to, !mine);
  };

  /* Sleep, freeze and paralysis can eat a turn outright; burn and poison bite
   * at the end of one. Confusion is its OWN counter, not a status: nine moves
   * inflict it, and storing it in `status` meant a Pokemon hit by Confuse Ray
   * could never be poisoned, burned or paralysed again, kept a catch rate as
   * though it were healthy, never woke out of it, and printed `bị cnf!` in
   * the log and `· undefined` on the party screen. */
  Battle.prototype.canAct = function (p, mine) {
    if (p.conf > 0) {
      p.conf--;
      if (p.conf <= 0) {
        this.log(P.nameOf(p) + ' đã hết lú lẫn.');
      } else if (Math.random() < 0.5) {
        /* Gen 3 self-hit: a 40-power typeless physical attack on itself. */
        var self = P.confusionHit(p);
        p.hp = Math.max(0, p.hp - self);
        this.log(P.nameOf(p) + ' lú lẫn, tự đánh trúng mình!');
        this.push({ t: 'dmg', side: mine ? 'you' : 'wild', amount: self });
        this.checkFaint(p, mine);
        return false;
      } else {
        this.log(P.nameOf(p) + ' đang lú lẫn...');
      }
    }
    if (p.status === 'slp') {
      p.statusTurns--;
      if (p.statusTurns <= 0) { p.status = null; this.log(P.nameOf(p) + ' tỉnh dậy!'); return true; }
      this.log(P.nameOf(p) + ' đang ngủ say...');
      return false;
    }
    if (p.status === 'frz') {
      if (Math.random() < 0.2) { p.status = null; this.log(P.nameOf(p) + ' tan băng!'); return true; }
      this.log(P.nameOf(p) + ' bị đóng băng cứng.');
      return false;
    }
    if (p.status === 'par' && Math.random() < 0.25) {
      this.log(P.nameOf(p) + ' tê liệt, không nhúc nhích được!');
      return false;
    }
    return true;
  };

  var STATUS_VN = { par: 'tê liệt', brn: 'bỏng', psn: 'trúng độc', tox: 'trúng độc nặng',
                    slp: 'ngủ thiếp đi', frz: 'đóng băng' };

  Battle.prototype.applyStatus = function (from, to, m, mine) {
    var did = false;
    if (m.ail === 'cnf') {
      if (Math.random() * 100 < (m.ailc || 100)) {
        if (to.conf > 0) {
          this.log(P.nameOf(to) + ' đã lú lẫn sẵn rồi.');
        } else {
          to.conf = 2 + Math.floor(Math.random() * 4);   // 2-5 turns, Gen 3
          this.log(P.nameOf(to) + ' bị lú lẫn!');
          this.push({ t: 'status', side: mine ? 'wild' : 'you', status: 'cnf' });
        }
        did = true;
      }
    } else if (m.ail && !to.status && Math.random() * 100 < (m.ailc || 100)) {
      /* A type cannot be given the status it is immune to - Fire never burns,
       * Electric is never paralysed, Poison and Steel are never poisoned. */
      var t = P.mon(to.id).t;
      var immune = (m.ail === 'brn' && t.indexOf(1) >= 0) ||
                   (m.ail === 'par' && t.indexOf(3) >= 0) ||
                   (m.ail === 'frz' && t.indexOf(5) >= 0) ||
                   ((m.ail === 'psn' || m.ail === 'tox') &&
                    (t.indexOf(7) >= 0 || t.indexOf(16) >= 0));
      if (!immune) {
        to.status = m.ail;
        to.statusTurns = m.ail === 'slp' ? (1 + Math.floor(Math.random() * 3)) : 0;
        this.log(P.nameOf(to) + ' bị ' + (STATUS_VN[m.ail] || m.ail) + '!');
        this.push({ t: 'status', side: mine ? 'wild' : 'you', status: m.ail });
        did = true;
      }
    }
    if (m.sc && Math.random() * 100 < (m.scc || 100)) {
      for (var i = 0; i < m.sc.length; i++) {
        var idx = m.sc[i][0], delta = m.sc[i][1];
        if (!idx) continue;
        /* WHO the change lands on is now a field in the data (`ss`), derived
         * from the move's own category when the tables were generated.
         * Guessing from the SIGN was wrong for exactly the moves where it
         * matters: Superpower's -1 Atk/-1 Def went to the OPPONENT, making it
         * a drawback-free 120-power hit, and Swagger's +2 Attack went to the
         * USER, making it a free Swords Dance. */
        var who = m.ss ? from : to;
        who.stages[idx] = Math.max(-6, Math.min(6, (who.stages[idx] || 0) + delta));
        this.log(P.nameOf(who) + (delta > 0 ? ' tăng ' : ' giảm ') +
                 (P.STAT_VN[idx] || (idx === 6 ? 'độ chính xác' : 'độ né')) + '!');
        did = true;
      }
    }
    if (m.hl) {
      var amt = Math.max(1, Math.floor(from.stats[0] * m.hl / 100));
      from.hp = Math.min(from.stats[0], from.hp + amt);
      this.push({ t: 'heal', side: mine ? 'you' : 'wild', amount: amt });
      this.log(P.nameOf(from) + ' hồi ' + amt + ' HP.');
      did = true;
    }
    if (!did && m.c === 2) this.log('Nhưng không có tác dụng gì.');
  };

  Battle.prototype.endOfTurn = function () {
    var self = this;
    [[this.you, 'you'], [this.wild, 'wild']].forEach(function (pair) {
      var p = pair[0];
      if (!p || p.hp <= 0) return;
      if (p.status === 'brn' || p.status === 'psn') {
        var d = Math.max(1, Math.floor(p.stats[0] / 8));
        p.hp = Math.max(0, p.hp - d);
        self.push({ t: 'dmg', side: pair[1], amount: d });
        self.log(P.nameOf(p) + ' chịu sát thương do ' + STATUS_VN[p.status] + '.');
        self.checkFaint(p, pair[1] === 'you');
      } else if (p.status === 'tox') {
        p.toxCount = (p.toxCount || 0) + 1;
        var dt = Math.max(1, Math.floor(p.stats[0] * p.toxCount / 16));
        p.hp = Math.max(0, p.hp - dt);
        self.push({ t: 'dmg', side: pair[1], amount: dt });
        self.log(P.nameOf(p) + ' bị độc ăn mòn.');
        self.checkFaint(p, pair[1] === 'you');
      }
    });
  };

  Battle.prototype.checkFaint = function (p, isMine) {
    if (p.hp > 0) return;
    this.log(P.nameOf(p) + ' gục xuống!');
    this.push({ t: 'faint', side: isMine ? 'you' : 'wild' });
    if (isMine) {
      var next = this.firstHealthy();
      if (!next) { this.finish('lost'); return; }
      /* An automatic swap rather than a prompt. A prompt is correct in a real
       * Pokemon game because the opponent gets a free turn either way; here
       * the wild Pokemon is not a trainer and the prompt is just a tap. */
      this.you = next;
      this.you.stages = freshStages();
      if (this.participants.indexOf(next) < 0) this.participants.push(next);
      this.log('Đi, ' + P.nameOf(next) + '!');
      this.push({ t: 'send', poke: next });
    } else {
      this.award();
      this.finish('won');
    }
  };

  /* Experience and EVs to everything that took a turn, exactly as Gen 3 splits
   * them: experience is divided among participants, EVs are NOT. */
  Battle.prototype.award = function () {
    var sp = P.mon(this.wild.id);
    var self = this;
    this.participants.forEach(function (p) {
      if (p.hp <= 0) return;
      var xp = P.expFor(self.wild, p.lv, self.participants.length);
      var rep = P.gainExp(p, xp);
      self.push({ t: 'exp', poke: p, amount: xp });
      self.log(P.nameOf(p) + ' nhận ' + xp + ' EXP.');
      rep.levels.forEach(function (lv) {
        self.log(P.nameOf(p) + ' lên cấp ' + lv + '!');
        self.push({ t: 'level', poke: p, level: lv });
      });
      rep.learned.forEach(function (mid) {
        if (P.learn(p, mid)) {
          self.log(P.nameOf(p) + ' học được ' + P.move(mid).n + '!');
        } else {
          self.push({ t: 'learnFull', poke: p, move: mid });
        }
      });
      P.gainEv(p, sp.e);
      if (rep.evolve) self.push({ t: 'evolve', poke: p, into: rep.evolve });
    });
  };

  // ------------------------------------------------------------------ ball
  Battle.prototype.doBall = function (ball) {
    if (this.sim.count(ball) <= 0) { this.log('Bạn không còn ' + ball + '.'); return false; }
    this.sim.take(ball, 1);
    this.log('Bạn ném ' + ball + '!');
    var ctx = { turn: this.turn, night: this.sim.isNight() };
    var r = P.tryCatch(this.wild, ball, ctx);
    this.push({ t: 'throw', ball: ball, shakes: r.shakes, ok: r.caught });
    if (r.caught) {
      this.wild.ball = ball;
      this.wild.caught = { day: this.sim.dayIndex(), island: this.island ? this.island.id : '?' };
      this.wild.wild = false;
      this.wild.ot = 'Bạn';
      if (ball === 'Luxury Ball') P.addHappy(this.wild, 30);
      this.log('Bắt được ' + P.speciesName(this.wild.id) + '!');
      this.finish('caught');
    } else {
      var says = ['Nó thoát ra ngay!', 'Ối, suýt nữa thì được!',
                  'Gần lắm rồi!', 'Sát nút! Chỉ thiếu một chút thôi!'];
      this.log(says[Math.min(3, r.shakes)]);
    }
  };

  Battle.prototype.doRun = function () {
    /* Gen 3's escape formula: odds scale with the speed gap and rise every
     * time you try. A slower Pokemon can still get away, it just takes a few
     * attempts, which is the right feel for "I do not want this fight". */
    this.runs = (this.runs || 0) + 1;
    var a = this.you ? this.you.stats[5] : 1, b = this.wild.stats[5];
    var odds = b > 0 ? ((a * 128) / b + 30 * this.runs) % 256 : 256;
    if (a > b || Math.random() * 256 < odds) {
      this.log('Bạn chạy thoát!');
      this.finish('fled');
    } else {
      this.log('Không thoát được!');
    }
  };

  Battle.prototype.doItem = function (name) {
    if (this.sim.count(name) <= 0) { this.log('Không còn ' + name + '.'); return false; }
    var r = global.ISL_POKEITEMS && global.ISL_POKEITEMS.use(name, this.you, this);
    if (!r || !r.ok) { this.log(r && r.msg ? r.msg : 'Không dùng được ở đây.'); return false; }
    this.sim.take(name, 1);
    this.log(r.msg);
  };

  Battle.prototype.doSwitch = function (index) {
    var pt = this.party();
    var p = pt[index];
    if (!p || p.hp <= 0 || p === this.you) { this.log('Không đổi được.'); return false; }
    this.log(P.nameOf(this.you) + ', quay về!');
    this.you = p;
    p.stages = freshStages();
    if (this.participants.indexOf(p) < 0) this.participants.push(p);
    this.log('Đi, ' + P.nameOf(p) + '!');
    this.push({ t: 'send', poke: p });
  };

  Battle.prototype.wildTurn = function () {
    if (this.over || this.wild.hp <= 0 || !this.you || this.you.hp <= 0) return;
    this.useMove(this.wild, this.you, this.pickWildMove(), false);
  };

  Battle.prototype.finish = function (result) {
    this.over = true;
    this.result = result;
    /* Stat stages are a battle-only thing and must not survive it. Leaving
     * them on was an early bug that let a player stack Growl on a wild
     * Pokemon, catch it, and keep a permanently weakened one. */
    if (this.you) this.you.stages = freshStages();
    this.wild.stages = freshStages();
    this.push({ t: 'end', result: result, wild: this.wild });
  };

  // -------------------------------------------------------------- items
  /* Potions and status cures, usable in and out of battle. Kept beside the
   * battle rather than in poke.js because their whole effect is on a battle
   * state, and half of them refuse to work outside one. */
  var ITEMS = {
    'Potion':        { hp: 20,  vn: 'Thuốc Thường', price: 300 },
    'Super Potion':  { hp: 50,  vn: 'Siêu Thuốc', price: 700 },
    'Hyper Potion':  { hp: 200, vn: 'Thuốc Cực Mạnh', price: 1500 },
    'Max Potion':    { hp: 999, vn: 'Thuốc Tối Đa', price: 2500 },
    'Revive':        { revive: 0.5, vn: 'Hồi Sinh', price: 1500 },
    'Max Revive':    { revive: 1, vn: 'Hồi Sinh Tối Đa', price: 4000 },
    'Antidote':      { cure: 'psn', vn: 'Thuốc Giải Độc', price: 200 },
    'Burn Heal':     { cure: 'brn', vn: 'Thuốc Trị Bỏng', price: 250 },
    'Ice Heal':      { cure: 'frz', vn: 'Thuốc Tan Băng', price: 250 },
    'Awakening':     { cure: 'slp', vn: 'Thuốc Tỉnh Ngủ', price: 250 },
    'Paralyze Heal': { cure: 'par', vn: 'Thuốc Trị Tê', price: 250 },
    'Full Heal':     { cure: '*',  vn: 'Thuốc Toàn Trị', price: 600 },
    'Ether':         { pp: 10,  vn: 'Thuốc Hồi Chiêu', price: 1200 },
    'Rare Candy':    { candy: 1, vn: 'Kẹo Hiếm', price: 8000 },
    'Fire Stone':    { stone: 'fire-stone', vn: 'Đá Lửa', price: 2500 },
    'Water Stone':   { stone: 'water-stone', vn: 'Đá Nước', price: 2500 },
    'Thunder Stone': { stone: 'thunder-stone', vn: 'Đá Sấm', price: 2500 },
    'Leaf Stone':    { stone: 'leaf-stone', vn: 'Đá Lá', price: 2500 },
    'Moon Stone':    { stone: 'moon-stone', vn: 'Đá Trăng', price: 3500 }
  };

  function useItem(name, target, battle) {
    var it = ITEMS[name];
    if (!it || !target) return { ok: false, msg: 'Không dùng được.' };
    if (it.hp) {
      if (target.hp <= 0) return { ok: false, msg: P.nameOf(target) + ' đã gục — cần Hồi Sinh.' };
      if (target.hp >= target.stats[0]) return { ok: false, msg: P.nameOf(target) + ' còn đầy máu.' };
      var before = target.hp;
      target.hp = Math.min(target.stats[0], target.hp + it.hp);
      return { ok: true, msg: P.nameOf(target) + ' hồi ' + (target.hp - before) + ' HP.' };
    }
    if (it.revive) {
      if (target.hp > 0) return { ok: false, msg: P.nameOf(target) + ' chưa gục.' };
      target.hp = Math.max(1, Math.floor(target.stats[0] * it.revive));
      target.status = null;
      return { ok: true, msg: P.nameOf(target) + ' tỉnh lại!' };
    }
    if (it.cure) {
      if (!target.status) return { ok: false, msg: P.nameOf(target) + ' đang khoẻ.' };
      if (it.cure !== '*' && target.status !== it.cure) {
        return { ok: false, msg: 'Không đúng loại bệnh.' };
      }
      target.status = null; target.statusTurns = 0; target.toxCount = 0;
      return { ok: true, msg: P.nameOf(target) + ' khỏi hẳn.' };
    }
    if (it.pp) {
      var did = false;
      target.moves.forEach(function (m) {
        if (m.pp < m.ppMax) { m.pp = Math.min(m.ppMax, m.pp + it.pp); did = true; }
      });
      return did ? { ok: true, msg: P.nameOf(target) + ' hồi PP.' }
                 : { ok: false, msg: 'PP đang đầy.' };
    }
    if (it.candy) {
      if (target.lv >= 100) return { ok: false, msg: 'Đã đạt cấp tối đa.' };
      var need = P.expAt(P.mon(target.id).gr, target.lv + 1) - target.exp;
      var rep = P.gainExp(target, Math.max(1, need));
      var msg = P.nameOf(target) + ' lên cấp ' + target.lv + '!';
      if (rep.evolve && battle) battle.push({ t: 'evolve', poke: target, into: rep.evolve });
      return { ok: true, msg: msg, report: rep };
    }
    if (it.stone) {
      var into = P.evolutionFor(target, it.stone);
      if (!into) return { ok: false, msg: P.nameOf(target) + ' không phản ứng với viên đá.' };
      var was = P.speciesName(target.id);
      P.evolve(target, into);
      return { ok: true, msg: was + ' tiến hoá thành ' + P.speciesName(into) + '!', evolved: into };
    }
    return { ok: false, msg: 'Không có tác dụng.' };
  }

  global.ISL_POKEITEMS = { ITEMS: ITEMS, use: useItem };
  global.ISL_BATTLE = {
    Battle: Battle, spawnWild: spawnWild, rollSpecies: rollSpecies,
    ENCOUNTER_RATE: ENCOUNTER_RATE
  };
})(window);
