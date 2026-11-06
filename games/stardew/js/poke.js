/*
 * poke.js - what a Pokemon IS. Stats, natures, IVs, EVs, gender, shininess,
 * experience, evolution, and the two formulas the whole feature rests on:
 * damage, and the odds a ball closes.
 *
 * These are the REAL Generation 3 formulas, not an approximation of them. That
 * is a deliberate cost: a simplified "attack minus defence" would have been
 * forty lines and nobody would have noticed for a week. It would fall apart
 * the moment the player did notice - the instant somebody works out that their
 * Adamant Machop hits harder than their Modest one, every number in the game
 * has to be honest or none of them are worth showing. So the stat screen shows
 * IVs, EVs, nature and the modified stat, and every one of those digits is
 * doing real arithmetic underneath.
 *
 * -------------------------------------------------------------- the PID
 * A Pokemon's personality value is one random 32-bit integer, and Gen 3 reads
 * four different things out of it: nature, gender, ability, and - against the
 * trainer's own ID - shininess. Storing the PID rather than the four results
 * is what makes a saved Pokemon reproducible and a traded one consistent, and
 * it is one 4-byte field in the save instead of four.
 *
 * Stat order is [HP, Atk, Def, SpA, SpD, Spe] everywhere, which is Gen 3's own
 * order and the order data/pokedata.js is generated in. Nothing re-sorts it.
 */
(function (global) {
  'use strict';

  var D = global.ISL_POKE_DATA || { mon: {}, moves: {}, nat: [], chart: [] };
  var NT = 17;                       // type count - Gen 3 has no Fairy

  var STAT_VN = ['HP', 'Tấn Công', 'Phòng Thủ', 'Đặc Công', 'Đặc Thủ', 'Tốc Độ'];
  var STAT_SHORT = ['HP', 'ATK', 'DEF', 'SpA', 'SpD', 'SPE'];

  function mon(id) { return D.mon[id] || D.mon[1]; }
  function move(id) { return D.moves[id] || null; }
  function typeName(t) { return D.typeVN[t] || D.types[t] || '?'; }
  function typeColour(t) { return D.typeCol[t] || '#888'; }

  // ------------------------------------------------------------------- rng
  /* A 32-bit PID needs 32 bits of randomness; Math.random() gives 52 bits of
   * mantissa but only ever positive, so it is assembled from two halves. Using
   * `Math.random() * 0x100000000 | 0` directly loses the top bit to the sign. */
  function rand32() {
    return ((Math.random() * 0x10000) & 0xFFFF) * 0x10000 +
           ((Math.random() * 0x10000) & 0xFFFF);
  }
  function randInt(n) { return Math.floor(Math.random() * n); }

  // --------------------------------------------------------------- natures
  /* nat[i] = [name, raisedStat, loweredStat]; 0 in both slots means neutral.
   * The modifier is x1.1 on the raised stat and x0.9 on the lowered one, and
   * HP is never either - which is why the indices run 1..5. */
  function natureMod(natureId, statIndex) {
    var n = D.nat[natureId];
    if (!n || n[1] === n[2]) return 1;
    if (n[1] === statIndex) return 1.1;
    if (n[2] === statIndex) return 0.9;
    return 1;
  }
  function natureName(id) { return (D.natVN && D.natVN[id]) || (D.nat[id] && D.nat[id][0]) || '?'; }
  function natureText(id) {
    var n = D.nat[id];
    if (!n || n[1] === n[2]) return 'Không lệch chỉ số nào';
    return '+' + STAT_VN[n[1]] + ' / −' + STAT_VN[n[2]];
  }

  // ---------------------------------------------------------------- gender
  /* Gen 3's gender thresholds. `g` from the species table is the chance-in-8 of
   * female; -1 is genderless, 0 is always male, 8 always female. The in-between
   * cases compare the low byte of the PID against these exact numbers - they
   * are NOT g*255/8, and using the arithmetic version shifts 12.5%-female
   * species by half a percent. */
  var GENDER_TH = { 1: 31, 2: 63, 3: 95, 4: 127, 5: 159, 6: 191, 7: 225 };
  function genderOf(species, pid) {
    var g = mon(species).g;
    if (g < 0) return 'none';
    if (g === 0) return 'male';
    if (g >= 8) return 'female';
    return (pid & 0xFF) < GENDER_TH[g] ? 'female' : 'male';
  }
  function genderSymbol(gender) {
    return gender === 'male' ? '♂' : gender === 'female' ? '♀' : '';
  }

  // ----------------------------------------------------------------- shiny
  /* Gen 3: shiny when (TID ^ SID ^ PIDhigh ^ PIDlow) < 8, which is 8/65536 -
   * one in 8,192. That is authentic and it is also, for a farming game where
   * you might meet two hundred Pokemon in a season, close to never. The rate
   * is lifted to 1/512 by giving the roll eight chances instead of one, which
   * keeps the mechanism (and the sparkle, and the trade value) while putting a
   * shiny inside a real playthrough rather than a theoretical one. */
  var SHINY_ROLLS = 16;
  function shinyOf(pid, tid, sid) {
    return ((tid ^ sid ^ (pid >>> 16) ^ (pid & 0xFFFF)) & 0xFFFF) < 8;
  }
  function rollShinyPid(tid, sid) {
    var pid = rand32();
    for (var i = 0; i < SHINY_ROLLS; i++) {
      var p = rand32();
      if (shinyOf(p, tid, sid)) return p;
    }
    return pid;
  }

  // ------------------------------------------------------------------- exp
  /* The six Gen 3 experience curves. `expAt(level)` is total experience needed
   * to BE that level; a Pokemon's `exp` field is absolute, not a remainder,
   * which is what makes rare-candy-style jumps and level drops consistent. */
  function expAt(curve, n) {
    if (n <= 1) return 0;
    var c = n * n * n;
    switch (curve) {
      case 0: return Math.floor(5 * c / 4);                       // slow
      case 2: return Math.floor(4 * c / 5);                       // fast
      case 3: return Math.floor(6 * c / 5 - 15 * n * n + 100 * n - 140); // medium slow
      case 4:                                                     // erratic
        if (n < 50) return Math.floor(c * (100 - n) / 50);
        if (n < 68) return Math.floor(c * (150 - n) / 100);
        if (n < 98) return Math.floor(c * Math.floor((1911 - 10 * n) / 3) / 500);
        return Math.floor(c * (160 - n) / 100);
      case 5:                                                     // fluctuating
        if (n < 15) return Math.floor(c * ((Math.floor((n + 1) / 3) + 24) / 50));
        if (n < 36) return Math.floor(c * ((n + 14) / 50));
        return Math.floor(c * ((Math.floor(n / 2) + 32) / 50));
      default: return c;                                          // medium fast
    }
  }
  function levelFromExp(curve, exp) {
    var lv = 1;
    while (lv < 100 && exp >= expAt(curve, lv + 1)) lv++;
    return lv;
  }

  // ----------------------------------------------------------------- stats
  /* Gen 3, exactly:
   *   HP    = floor((2*B + IV + floor(EV/4)) * L / 100) + L + 10
   *   other = floor((floor((2*B + IV + floor(EV/4)) * L / 100) + 5) * nature)
   * The nature multiplier applies to the FLOORED value, not inside it - doing
   * it the other way is off by one on about a third of all stats. */
  function calcStat(base, iv, ev, level, natMod, isHp) {
    var core = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100);
    if (isHp) return core + level + 10;
    return Math.floor((core + 5) * natMod);
  }

  function recalc(p) {
    var sp = mon(p.id);
    var out = [];
    for (var i = 0; i < 6; i++) {
      out[i] = calcStat(sp.b[i], p.iv[i], p.ev[i], p.lv, natureMod(p.nature, i), i === 0);
    }
    var oldMax = p.stats ? p.stats[0] : out[0];
    p.stats = out;
    /* Levelling up must not silently heal, and must not leave a Pokemon on
     * more HP than it now has. Carrying the DIFFERENCE is what the real games
     * do and it is the only version that survives a level drop. */
    if (p.hp == null) p.hp = out[0];
    else if (p.hp <= 0) p.hp = 0;   /* fainted stays fainted */
    else p.hp = Math.max(1, Math.min(out[0], p.hp + (out[0] - oldMax)));
    return p;
  }

  // ---------------------------------------------------------------- create
  /* Everything about a Pokemon that is not chosen by the caller comes out of
   * the PID and six IV rolls. `opt` exists so a scripted gift (the starter
   * Pikachu, a legendary at a shrine) can pin a nature or force a shiny
   * without a special code path. */
  function create(id, level, opt) {
    opt = opt || {};
    var sp = mon(id);
    var tid = opt.tid == null ? (global.ISL_POKE && global.ISL_POKE.trainerId()) : opt.tid;
    var sid = opt.sid == null ? (global.ISL_POKE && global.ISL_POKE.secretId()) : opt.sid;
    /* WHY nature is applied first and shininess second: pidWithNature nudges
     * the PID by up to 24, which is more than enough to break the
     * (TID^SID^hi^lo) < 8 shiny test. Asking for a shiny WITH a nature used to
     * produce a non-shiny about five times out of six - and the nature mint on
     * Đảo Nghiên Cứu does exactly that to a Pokemon the player already owns,
     * so a minted shiny stayed shiny on screen and came back plain on the next
     * load. Rolling for a PID that satisfies both at once is the only version
     * that cannot disagree with itself. */
    var pid;
    if (opt.pid != null) {
      pid = opt.pid;
      if (opt.nature != null) pid = pidWithNature(pid, opt.nature);
    } else if (opt.shiny && opt.nature != null) {
      pid = rollShinyPidWithNature(tid, sid, opt.nature);
    } else if (opt.shiny) {
      pid = rollShinyPidForced(tid, sid);
    } else {
      pid = rand32();
      if (opt.nature != null) pid = pidWithNature(pid, opt.nature);
    }

    var p = {
      id: id,
      pid: pid >>> 0,
      lv: level,
      exp: expAt(sp.gr, level),
      iv: opt.iv || [randInt(32), randInt(32), randInt(32), randInt(32), randInt(32), randInt(32)],
      ev: opt.ev || [0, 0, 0, 0, 0, 0],
      nature: (pid >>> 0) % 25,
      gender: null,
      shiny: false,
      happy: sp.h,
      status: null,           // 'slp' 'par' 'brn' 'psn' 'tox' 'frz'
      statusTurns: 0,
      moves: [],              // [{id, pp, ppMax}]
      nick: null,
      caught: null,           // {day, island}
      ball: 'Poké Ball',
      ot: opt.ot || 'Bạn',
      wp: 0,                  // work points spent today
      hp: null
    };
    p.gender = genderOf(id, p.pid);
    p.shiny = shinyOf(p.pid, tid || 0, sid || 0);
    p.moves = defaultMoves(id, level);
    recalc(p);
    p.hp = p.stats[0];
    return p;
  }

  /* Force a nature without giving up a real PID: nudge the value up until it
   * lands in the right residue class. At most 24 steps, and it leaves the rest
   * of the bits - gender, shininess, ability - genuinely random. */
  function pidWithNature(pid, nature) {
    pid = pid >>> 0;
    while (pid % 25 !== nature) pid = (pid + 1) >>> 0;
    return pid;
  }
  /* Both constraints at once. 1 in 25 PIDs has the wanted nature and 8 in
   * 65536 are shiny, so a rejection loop needs about 200k draws in the worst
   * case; stepping by 25 keeps the nature fixed and only tests shininess,
   * which converges in a few thousand. */
  function rollShinyPidWithNature(tid, sid, nature) {
    var pid = pidWithNature(rand32(), nature);
    for (var i = 0; i < 300000; i++) {
      if (shinyOf(pid, tid || 0, sid || 0)) return pid >>> 0;
      pid = (pid + 25) >>> 0;
      if (pid % 25 !== nature) pid = pidWithNature(pid, nature);
    }
    return pid >>> 0;
  }
  /* Re-roll a LIVE Pokemon's nature. Nature is read from the PID, so changing
   * it means changing the PID - and the PID is also where gender and shininess
   * come from. Stepping by 25 holds the nature and lets the search keep the
   * other two, so a minted shiny is still shiny (and still the same gender)
   * after the save is reloaded. Falls back to whatever it reached rather than
   * looping forever; a genderless species matches immediately. */
  function mintNature(p, nature, tid, sid) {
    tid = tid || 0; sid = sid || 0;
    var wantG = p.gender, wantS = !!p.shiny;
    var pid = pidWithNature(p.pid >>> 0, nature);
    var first = pid;
    for (var i = 0; i < 300000; i++) {
      if (genderOf(p.id, pid) === wantG && shinyOf(pid, tid, sid) === wantS) break;
      pid = (pid + 25) >>> 0;
      if (pid % 25 !== nature) pid = pidWithNature(pid, nature);
      if (pid === first) break;
    }
    p.pid = pid >>> 0;
    p.nature = nature;
    p.gender = genderOf(p.id, p.pid);
    p.shiny = shinyOf(p.pid, tid, sid);
    recalc(p);
    return p;
  }
  function rollShinyPidForced(tid, sid) {
    for (var i = 0; i < 20000; i++) {
      var p = rand32();
      if (shinyOf(p, tid || 0, sid || 0)) return p;
    }
    /* Construct one instead of trusting luck. XORing the low half against the
     * trainer's IDs makes the shiny test come out zero by definition, which is
     * the only way a "guaranteed shiny" gift can actually guarantee it. */
    var low = randInt(0x10000);
    var high = ((tid || 0) ^ (sid || 0) ^ low) & 0xFFFF;
    return ((high * 0x10000) + low) >>> 0;
  }

  /* The four moves a wild Pokemon of this level would have: the last four it
   * would have learned by levelling. That is what the games do, and it means a
   * level 30 Geodude turns up knowing Rock Throw rather than Tackle. */
  function defaultMoves(id, level) {
    var sp = mon(id);
    var known = [];
    (sp.lv || []).forEach(function (e) {
      if (e[0] <= level && known.indexOf(e[1]) < 0) known.push(e[1]);
    });
    var last = known.slice(-4);
    if (!last.length) last = [33];                     // Tackle, so nothing is moveless
    return last.map(function (mid) {
      var m = move(mid);
      return { id: mid, pp: m ? m.pp : 20, ppMax: m ? m.pp : 20 };
    });
  }


  /* Three thin wrappers the battle engine needs. They exist so pokebattle.js
   * never has to reach into the formula itself - a second copy of the Gen 3
   * arithmetic anywhere in this codebase is a second copy to get wrong. */

  /* Type effectiveness of one type against a SPECIES, which is what the
   * fixed-damage moves need: Night Shade still cannot touch a Normal-type
   * with a Ghost body, and Seismic Toss is Fighting. */
  function effectOf(atkType, defSpeciesId) {
    return effect(atkType, mon(defSpeciesId).t);
  }

  /* Damage with the power supplied rather than read from the move, and the
   * accuracy roll already done by the caller. */
  function damageWith(atk, def, m, power) {
    return damage(atk, def, m, { power: power, noAcc: true });
  }

  /* Struggle: 50 power, physical, Normal, through the ordinary formula. The
   * type chart is deliberately NOT applied - Struggle is typeless in Gen 3,
   * which is why it goes through a Ghost. */
  function struggle(from, to) {
    return damage(from, to, -1, { power: 50, noAcc: true, typeless: true });
  }

  /* Confusion self-damage: a 40-power typeless physical hit using the confused
   * Pokemon's own Attack against its own Defence. */
  function confusionHit(p) {
    return Math.max(1, damage(p, p, -1, { power: 40, noAcc: true, typeless: true }).dmg);
  }

  // ------------------------------------------------------------------ name
  function speciesName(id) { return mon(id).n; }
  function nameOf(p) { return p.nick || mon(p.id).n; }

  // ------------------------------------------------------------- type math
  function effect(atkType, defTypes) {
    var m = 1;
    for (var i = 0; i < defTypes.length; i++) {
      /* `|| 10` was here and it was wrong in the one case that matters: an
       * immunity is stored as 0, which is falsy, so Ground took full damage
       * from Electric and Normal hurt Ghost. Missing entries have to be told
       * apart from real zeroes explicitly. */
      var v = D.chart[atkType * NT + defTypes[i]];
      m *= (v === undefined ? 10 : v) / 10;
    }
    return m;
  }
  function effectText(m) {
    if (m === 0) return 'Không ăn thua';
    if (m >= 4) return 'Cực kỳ hiệu quả!';
    if (m > 1) return 'Rất hiệu quả!';
    if (m === 1) return '';
    if (m >= 0.5) return 'Không hiệu quả lắm...';
    return 'Gần như vô hại...';
  }

  // ---------------------------------------------------------------- damage
  /* Gen 3 damage, in the order the hardware does it - every floor matters.
   * Returns {dmg, eff, crit, miss}. Burn halving attack, STAB, the 85-100%
   * spread and criticals ignoring negative stat stages are all in here; what
   * is not is items, abilities and weather, none of which this game has. */
  var STAGE = [2 / 8, 2 / 7, 2 / 6, 2 / 5, 2 / 4, 2 / 3, 1, 3 / 2, 4 / 2, 5 / 2, 6 / 2, 7 / 2, 8 / 2];
  function stageMul(s) { return STAGE[Math.max(-6, Math.min(6, s || 0)) + 6]; }
  /* Accuracy and evasion do NOT use the stat table. Gen 3 gives them their own
   * ladder, and it is gentler at both ends: six Sand Attacks leave a move at
   * 33% accuracy, not the 25% the stat table produces, and +6 accuracy is 3x,
   * not 4x. Same list, different numbers - the mistake is easy to make and
   * only shows up as fights feeling swingier than they should. */
  var ACC_STAGE = [33 / 100, 36 / 100, 43 / 100, 50 / 100, 60 / 100, 75 / 100, 1,
                   133 / 100, 166 / 100, 2, 250 / 100, 266 / 100, 3];
  function accMul(s) { return ACC_STAGE[Math.max(-6, Math.min(6, s || 0)) + 6]; }

  /* A stand-in move record for the two things that deal damage without being
   * moves in the table: Struggle and a confusion self-hit. Both are typeless
   * physical, and damage() takes the power from opt, so one record covers
   * both. Move id -1 is reserved for it. */
  var TYPELESS_HIT = { id: -1, n: 'Vùng vẫy', t: 0, c: 0, p: 50, a: 0, pp: 1 };

  /* `mv` is a move id, a move RECORD, or -1 for the typeless stand-in. The
   * record form matters: the generated tables key moves by id and do not
   * repeat it inside the record, so a caller holding a move object has no id
   * to pass back. */
  function damage(atk, def, mv, opt) {
    opt = opt || {};
    var m = mv === -1 ? TYPELESS_HIT
          : (mv && typeof mv === 'object') ? mv : move(mv);
    if (!m) return { dmg: 0, eff: 1, crit: false, miss: true };
    var aSp = mon(atk.id), dSp = mon(def.id);

    // accuracy - 0 in the table means "never misses"
    if (m.a && !opt.noAcc) {
      var accStage = accMul((atk.stages ? atk.stages[6] : 0) - (def.stages ? def.stages[7] : 0));
      var chance = m.a * accStage;
      if (Math.random() * 100 >= chance) return { dmg: 0, eff: 1, crit: false, miss: true };
    }
    /* opt.power overrides the table for moves whose power is computed at use
     * time (Magnitude, Flail, Low Kick, Struggle). Everything after this point
     * is the ordinary formula, which is the point - those moves are not
     * special-cased damage, they are ordinary damage with a different number
     * on the front. */
    var pow = opt.power != null ? opt.power : m.p;
    if (m.c === 2 || !pow) return { dmg: 0, eff: 1, crit: false, miss: false, status: true };

    var physical = m.c === 0;
    var crit = Math.random() < (m.crit ? 1 / 8 : 1 / 16);

    var aIdx = physical ? 1 : 3, dIdx = physical ? 2 : 4;
    var A = atk.stats[aIdx], Dd = def.stats[dIdx];
    /* A critical hit ignores the defender's boosts and the attacker's drops -
     * it takes whichever set of stages is not helping the defender. */
    var aStage = atk.stages ? atk.stages[aIdx] : 0;
    var dStage = def.stages ? def.stages[dIdx] : 0;
    if (crit) { if (aStage < 0) aStage = 0; if (dStage > 0) dStage = 0; }
    A = Math.floor(A * stageMul(aStage));
    Dd = Math.floor(Dd * stageMul(dStage));
    if (physical && atk.status === 'brn') A = Math.floor(A / 2);
    if (Dd < 1) Dd = 1;

    var base = Math.floor(Math.floor(Math.floor(2 * atk.lv / 5 + 2) * pow * A / Dd) / 50) + 2;
    if (crit) base *= 2;
    /* Struggle is typeless: no same-type bonus and no chart lookup, which is
     * exactly why it goes through a Ghost. */
    var eff = 1;
    if (!opt.typeless) {
      if (aSp.t.indexOf(m.t) >= 0) base = Math.floor(base * 1.5);      // STAB
      eff = effect(m.t, dSp.t);
      base = Math.floor(base * eff);
      if (eff === 0) return { dmg: 0, eff: 0, crit: crit, miss: false };
    }
    base = Math.floor(base * (85 + randInt(16)) / 100);
    return { dmg: Math.max(1, base), eff: eff, crit: crit, miss: false };
  }

  // ------------------------------------------------------------------ ball
  /* Gen 3 capture, exactly. `a` is the catch value, `b` the shake probability;
   * four shakes at b/65536 each is the wobble the animation is showing. */
  var BALLS = {
    'Poké Ball':   { m: 1,   price: 200,  art: 'DropBall_0', vn: 'Bóng Thường' },
    'Great Ball':  { m: 1.5, price: 600,  art: 'DropBall_0', vn: 'Bóng Lớn' },
    'Ultra Ball':  { m: 2,   price: 1200, art: 'DropBall_0', vn: 'Siêu Bóng' },
    'Net Ball':    { m: 1,   price: 1000, art: 'DropBall_0', vn: 'Bóng Lưới',
                     note: 'x3 với hệ Nước và Côn Trùng' },
    'Dusk Ball':   { m: 1,   price: 1000, art: 'DropBall_0', vn: 'Bóng Đêm',
                     note: 'x3.5 vào ban đêm' },
    'Quick Ball':  { m: 1,   price: 1000, art: 'DropBall_0', vn: 'Bóng Nhanh',
                     note: 'x4 ở lượt đầu tiên' },
    'Timer Ball':  { m: 1,   price: 1000, art: 'DropBall_0', vn: 'Bóng Đồng Hồ',
                     note: 'càng đánh lâu càng mạnh' },
    'Master Ball': { m: 255, price: 0,    art: 'DropBall_0', vn: 'Bóng Chúa',
                     note: 'không bao giờ trượt' }
  };
  var STATUS_MUL = { slp: 2, frz: 2, par: 1.5, brn: 1.5, psn: 1.5, tox: 1.5 };

  function ballMultiplier(ball, wild, ctx) {
    var b = BALLS[ball];
    if (!b) return 1;
    var sp = mon(wild.id);
    switch (ball) {
      case 'Net Ball':
        return (sp.t.indexOf(2) >= 0 || sp.t.indexOf(11) >= 0) ? 3 : 1;
      case 'Dusk Ball':  return ctx && ctx.night ? 3.5 : 1;
      case 'Quick Ball': return ctx && ctx.turn <= 1 ? 4 : 1;
      case 'Timer Ball':
        return Math.min(4, 1 + ((ctx && ctx.turn) || 1) * 0.3);
      default: return b.m;
    }
  }

  /* Returns {caught, shakes} - shakes is 0..3 when it fails, which is what the
   * throw animation plays back. */
  function tryCatch(wild, ball, ctx) {
    var sp = mon(wild.id);
    var mult = ballMultiplier(ball, wild, ctx);
    if (mult >= 255) return { caught: true, shakes: 3 };
    var maxHp = wild.stats[0], hp = wild.hp;
    var statusMul = STATUS_MUL[wild.status] || 1;
    var a = Math.floor(Math.floor((3 * maxHp - 2 * hp) * sp.c * mult / (3 * maxHp)) * statusMul);
    if (a >= 255) return { caught: true, shakes: 3 };
    if (a < 1) a = 1;
    var b = Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / a))))));
    var shakes = 0;
    for (var i = 0; i < 4; i++) {
      if (randInt(65536) >= b) return { caught: false, shakes: shakes };
      shakes++;
    }
    return { caught: true, shakes: 4 };
  }

  /* The number the catch panel shows. Players will work this out anyway; being
   * straight about it is better than letting them guess wrong. */
  function catchChance(wild, ball, ctx) {
    var sp = mon(wild.id);
    var mult = ballMultiplier(ball, wild, ctx);
    if (mult >= 255) return 1;
    var maxHp = wild.stats[0];
    var statusMul = STATUS_MUL[wild.status] || 1;
    var a = Math.floor(Math.floor((3 * maxHp - 2 * wild.hp) * sp.c * mult / (3 * maxHp)) * statusMul);
    if (a >= 255) return 1;
    if (a < 1) a = 1;
    var b = Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / a))))));
    var p = b / 65536;
    return Math.min(1, p * p * p * p);
  }

  // -------------------------------------------------------------------- EV
  /* EVs are capped at 255 per stat and 510 in total, and both caps are checked
   * in that order - a Pokemon at 508 total can still take 2 more into a stat
   * that is under 255, and that partial award is what the real games give. */
  function gainEv(p, yieldArr) {
    var total = 0, i;
    for (i = 0; i < 6; i++) total += p.ev[i];
    var gained = false;
    for (i = 0; i < 6; i++) {
      if (!yieldArr[i]) continue;
      var room = Math.min(255 - p.ev[i], 510 - total);
      if (room <= 0) continue;
      var add = Math.min(yieldArr[i], room);
      p.ev[i] += add; total += add; gained = true;
    }
    if (gained) recalc(p);
    return gained;
  }

  /* Gen 3 experience for beating a wild Pokemon:
   *   exp = base * loserLevel / 7, then split by participants.
   * The traded/lucky-egg multipliers do not apply here. */
  function expFor(loser, winnerLevel, participants) {
    var b = mon(loser.id).x || 60;
    var e = Math.floor(b * loser.lv / 7);
    return Math.max(1, Math.floor(e / Math.max(1, participants || 1)));
  }

  /* Award experience and level up as far as it goes, learning every move that
   * falls due on the way. Returns a report the battle log reads back. */
  function gainExp(p, amount) {
    var sp = mon(p.id);
    var out = { exp: amount, levels: [], learned: [], evolve: null };
    if (p.lv >= 100) { out.exp = 0; return out; }
    p.exp += amount;
    var cap = expAt(sp.gr, 100);
    if (p.exp > cap) p.exp = cap;
    var newLv = levelFromExp(sp.gr, p.exp);
    while (p.lv < newLv) {
      p.lv++;
      out.levels.push(p.lv);
      (sp.lv || []).forEach(function (e) {
        if (e[0] === p.lv) out.learned.push(e[1]);
      });
      p.happy = Math.min(255, p.happy + 2);
    }
    if (out.levels.length) recalc(p);
    out.evolve = evolutionFor(p);
    return out;
  }

  /* What this Pokemon would become right now, if anything. Level and happiness
   * evolutions resolve here; stone evolutions are triggered by using the item,
   * and trade evolutions are re-homed onto a level requirement because there is
   * nobody to trade with in a single-player farming game. */
  var TRADE_LEVEL = 37;
  function evolutionFor(p, trigger) {
    var sp = mon(p.id);
    if (!sp.ev) return null;
    for (var i = 0; i < sp.ev.length; i++) {
      var e = sp.ev[i];            // [to, level, trigger, item, happiness]
      if (e[2] === 'level-up') {
        if (e[4] && p.happy < e[4]) continue;
        if (e[1] && p.lv < e[1]) continue;
        if (!e[1] && !e[4]) continue;
        return e[0];
      }
      if (e[2] === 'trade' && (!trigger || trigger === 'level-up')) {
        if (p.lv >= TRADE_LEVEL) return e[0];
      }
      if (e[2] === 'use-item' && trigger === e[3]) return e[0];
    }
    return null;
  }

  function evolve(p, toId) {
    p.id = toId;
    p.moves = mergeLearn(p, toId);
    recalc(p);
    return p;
  }
  function mergeLearn(p, toId) {
    /* Keep what it already knows; only top up if it has fewer than four. An
     * evolution wiping a hand-picked moveset is the kind of thing that makes
     * somebody stop evolving anything. */
    var have = p.moves.slice(0, 4);
    if (have.length >= 4) return have;
    var pool = defaultMoves(toId, p.lv);
    for (var i = 0; i < pool.length && have.length < 4; i++) {
      var dup = false;
      for (var j = 0; j < have.length; j++) if (have[j].id === pool[i].id) dup = true;
      if (!dup) have.push(pool[i]);
    }
    return have;
  }

  function learn(p, moveId) {
    for (var i = 0; i < p.moves.length; i++) if (p.moves[i].id === moveId) return false;
    var m = move(moveId);
    if (!m) return false;
    if (p.moves.length >= 4) return false;
    p.moves.push({ id: moveId, pp: m.pp, ppMax: m.pp });
    return true;
  }
  function replaceMove(p, slot, moveId) {
    var m = move(moveId);
    if (!m || slot < 0 || slot > 3) return false;
    p.moves[slot] = { id: moveId, pp: m.pp, ppMax: m.pp };
    return true;
  }

  // --------------------------------------------------------------- healing
  function heal(p) {
    recalc(p);
    p.hp = p.stats[0];
    p.status = null; p.statusTurns = 0; p.toxCount = 0; p.conf = 0;
    p.moves.forEach(function (m) { m.pp = m.ppMax; });
    return p;
  }
  function fainted(p) { return p.hp <= 0; }

  // ------------------------------------------------------------ work points
  /* How many jobs a Pokemon will do for you before it wants the rest of the
   * day off. This is the number that makes Pokemon a FARMING system rather
   * than a collection: a Pidgey waters the field twice and is done, a
   * Dragonite does most of a morning, and the whole point of raising one is
   * that it eventually replaces your own energy bar.
   *
   * The scale is deliberately readable rather than tuned to a curve:
   *   base by total base stats, which is what "how impressive is it" means
   *   +1 and +2 for a Pokemon that likes you, which is the only stat the
   *      player raises by playing rather than by grinding
   *   +1 shiny, because a shiny should be worth keeping for something
   *   legendaries get a flat, much larger figure - they are meant to trivialise
   *      a morning of chores, which is exactly what the owner asked for. */
  function maxWork(p) {
    var sp = mon(p.id);
    /* The gates come FIRST and apply to everything. They used to sit at the
     * bottom, after the legendary branch had already returned, so a fainted
     * Articuno reported ten work points on the party screen. cast() re-checks
     * for itself so it was not free labour, but the number on screen was a
     * lie and the gate was one refactor from being the only one. */
    if (p.hp <= 0 || p.lv < 5) return 0;
    if (sp.lg) {
      var lgWp = 10;
      if (p.happy >= 150) lgWp += 2;
      if (p.happy >= 220) lgWp += 2;
      if (p.shiny) lgWp += 1;
      return lgWp;
    }
    var bst = 0;
    for (var i = 0; i < 6; i++) bst += sp.b[i];
    var wp = bst < 350 ? 3 : bst < 480 ? 4 : bst < 600 ? 5 : 6;
    if (p.happy >= 150) wp += 1;
    if (p.happy >= 220) wp += 1;
    if (p.shiny) wp += 1;
    return wp;
  }
  function workLeft(p) { return Math.max(0, maxWork(p) - (p.wp || 0)); }

  // ------------------------------------------------------------- happiness
  function addHappy(p, n) {
    p.happy = Math.max(0, Math.min(255, (p.happy || 70) + n));
    return p.happy;
  }
  function happyText(h) {
    if (h >= 250) return 'Yêu bạn hết lòng';
    if (h >= 200) return 'Rất quý bạn';
    if (h >= 150) return 'Thân thiết';
    if (h >= 100) return 'Bắt đầu quen';
    if (h >= 50) return 'Còn dè chừng';
    return 'Chưa tin bạn';
  }

  // --------------------------------------------------------------- ratings
  /* The IV judge on Đảo Nghiên Cứu reads these back. The wording follows the
   * games' own bands so a player who knows them is not being told something
   * different in Vietnamese. */
  function ivTotalText(p) {
    var t = 0;
    for (var i = 0; i < 6; i++) t += p.iv[i];
    if (t >= 151) return 'Tiềm năng phi thường';
    if (t >= 121) return 'Tiềm năng rất tốt';
    if (t >= 91) return 'Tiềm năng khá';
    return 'Tiềm năng bình thường';
  }
  function ivStatText(v) {
    if (v === 31) return 'Hoàn hảo';
    if (v >= 26) return 'Xuất sắc';
    if (v >= 16) return 'Khá tốt';
    if (v >= 1) return 'Tàm tạm';
    return 'Kém';
  }
  function bestIv(p) {
    var best = 0, at = 0;
    for (var i = 0; i < 6; i++) if (p.iv[i] > best) { best = p.iv[i]; at = i; }
    return { stat: at, value: best };
  }

  // ------------------------------------------------------------------ save
  /* Only the fields that cannot be recomputed go to disk. stats, gender and
   * shininess all fall back out of (id, level, pid, iv, ev), so writing them
   * would be three ways for a save to contradict itself. */
  function pack(p) {
    return [p.id, p.lv, p.exp, p.pid, p.iv.join(','), p.ev.join(','), p.hp,
            p.happy, p.status, p.nick, p.ball,
            p.moves.map(function (m) { return m.id + ':' + m.pp; }).join(','),
            p.caught ? (p.caught.day + '|' + p.caught.island) : '',
            p.ot, p.wp || 0, p.statusTurns || 0, p.conf || 0];
  }
  function unpack(a, tid, sid) {
    var p = {
      id: a[0], lv: a[1], exp: a[2], pid: a[3] >>> 0,
      iv: String(a[4]).split(',').map(Number),
      ev: String(a[5]).split(',').map(Number),
      hp: a[6], happy: a[7], status: a[8] || null, statusTurns: a[15] || 0,
      nick: a[9] || null, ball: a[10] || 'Poké Ball',
      moves: String(a[11] || '').split(',').filter(Boolean).map(function (s) {
        var q = s.split(':'), m = move(+q[0]);
        return { id: +q[0], pp: +q[1], ppMax: m ? m.pp : +q[1] };
      }),
      caught: null, ot: a[13] || 'Bạn', wp: a[14] || 0, conf: a[16] || 0
    };
    if (a[12]) {
      var c = String(a[12]).split('|');
      p.caught = { day: +c[0], island: c[1] };
    }
    p.nature = p.pid % 25;
    p.gender = genderOf(p.id, p.pid);
    p.shiny = shinyOf(p.pid, tid || 0, sid || 0);
    if (!p.moves.length) p.moves = defaultMoves(p.id, p.lv);
    recalc(p);
    return p;
  }

  // ------------------------------------------------------------------- ids
  /* One trainer ID pair per save, generated on first run. Every shiny check in
   * the game is against these, which is why they must persist - regenerating
   * them would un-shiny a shiny Pokemon on the next load. */
  var _tid = null, _sid = null;
  function setIds(t, s) { _tid = t; _sid = s; }
  function trainerId() {
    if (_tid == null) _tid = randInt(65536);
    return _tid;
  }
  function secretId() {
    if (_sid == null) _sid = randInt(65536);
    return _sid;
  }

  global.ISL_POKE = {
    DATA: D, BALLS: BALLS, STAT_VN: STAT_VN, STAT_SHORT: STAT_SHORT,
    mon: mon, move: move, speciesName: speciesName, nameOf: nameOf,
    typeName: typeName, typeColour: typeColour,
    natureMod: natureMod, natureName: natureName, natureText: natureText,
    genderOf: genderOf, genderSymbol: genderSymbol,
    shinyOf: shinyOf, rollShinyPid: rollShinyPid,
    expAt: expAt, levelFromExp: levelFromExp,
    calcStat: calcStat, recalc: recalc,
    create: create, mintNature: mintNature,
    effectOf: effectOf, damageWith: damageWith, struggle: struggle,
    confusionHit: confusionHit, defaultMoves: defaultMoves,
    effect: effect, effectText: effectText, stageMul: stageMul,
    damage: damage, tryCatch: tryCatch, catchChance: catchChance,
    ballMultiplier: ballMultiplier,
    gainEv: gainEv, expFor: expFor, gainExp: gainExp,
    evolutionFor: evolutionFor, evolve: evolve,
    learn: learn, replaceMove: replaceMove,
    heal: heal, fainted: fainted,
    maxWork: maxWork, workLeft: workLeft,
    addHappy: addHappy, happyText: happyText,
    ivTotalText: ivTotalText, ivStatText: ivStatText, bestIv: bestIv,
    pack: pack, unpack: unpack,
    setIds: setIds, trainerId: trainerId, secretId: secretId,
    rand32: rand32, randInt: randInt
  };
})(window);
