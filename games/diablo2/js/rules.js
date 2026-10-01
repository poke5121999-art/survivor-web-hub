// D2R: Diablo II (LoD 1.14d) rules for the Act I remake. Pure functions over window.D2DATA, no DOM.
// Contract: brain/plans/diablo2-flare.md ("Hợp đồng D2R").
// Formula sources, cited per function:
//   [AS]    Arreat Summit, http://classic.battle.net/diablo2exp/ (basics, items, monsters pages)
//   [D2MOO] reverse-engineered game code, https://github.com/ThePhrozenKeep/D2MOO (file::function)
//   [TXT]   the 1.14d tables in D2DATA (see data.js header)
// Anything not backed by one of those carries a "// approx:" comment.
(function (g) {
  'use strict';

  function DATA() {
    var d = g.D2DATA;
    if (!d && typeof require === 'function') d = require('./data.js');
    if (!d) throw new Error('D2DATA not loaded (data.js missing)');
    return d;
  }

  var FPS = 25; // D2 runs 25 game frames per second [D2MOO GAME]

  // ------------------------------------------------------------------ RNG
  // mulberry32: small seedable PRNG. D2 itself uses a 64-bit LCG per unit; the stream differs, the
  // distributions (uniform integers) are what matter.
  function rng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // D2's ITEMS_RollLimitedRandomNumber(seed, n): integer in [0, n)
  function rint(r, n) { return n > 0 ? Math.floor(r() * n) : 0; }
  function rrange(r, lo, hi) { return hi > lo ? lo + rint(r, hi - lo + 1) : lo; }
  function idiv(a, b) { return b ? (a / b) | 0 : 0; } // C integer division (truncate)

  // ------------------------------------------------------------------ calc expressions
  // skills.txt calc columns ("ln12+skill('Stun'.blvl)*par8", "min(24,ln12)", "dm56", ...).
  // Variables per skills.txt docs (Phrozen Keep skills.txt guide):
  //   lvl/blvl = skill level, parN, lnXY = parX + (lvl-1)*parY,
  //   dmXY = parX + ((110*lvl)*(parY-parX))/(100*(lvl+6)), clcN = calcN of the same skill,
  //   edmn/edmx = elemental min/max (shifted), skill('Name'.blvl|lvl) = that skill's level on the caster.
  var calcCache = {};
  function tokenize(s) {
    var out = [], i = 0, m;
    var re = /\s*(?:(\d+(?:\.\d+)?)|('([^']*)'\.(\w+))|([A-Za-z_]\w*)|(<=|>=|==|!=|[-+*/(),?:<>]))/y;
    while (i < s.length) {
      re.lastIndex = i;
      m = re.exec(s);
      if (!m) { if (/^\s*$/.test(s.slice(i))) break; throw new Error('calc: cannot parse "' + s + '" at ' + i); }
      i = re.lastIndex;
      if (m[1] !== undefined) out.push({ t: 'n', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) out.push({ t: 'ref', name: m[3], field: m[4] });
      else if (m[5] !== undefined) out.push({ t: 'id', v: m[5] });
      else out.push({ t: 'op', v: m[6] });
    }
    return out;
  }
  function parse(s) {
    if (calcCache[s]) return calcCache[s];
    var toks = tokenize(String(s)), p = 0;
    // a few 1.14d cells are missing a closing paren (Fire Wall EDmgSymPerCalc); the game's parser
    // closes them at end of string, so do the same
    var depth = 0;
    toks.forEach(function (t) { if (t.t === 'op' && t.v === '(') depth++; else if (t.t === 'op' && t.v === ')') depth--; });
    while (depth-- > 0) toks.push({ t: 'op', v: ')' });
    function peek(v) { return toks[p] && toks[p].t === 'op' && toks[p].v === v; }
    function expect(v) { if (!peek(v)) throw new Error('calc: expected ' + v + ' in "' + s + '"'); p++; }
    function primary() {
      var t = toks[p++];
      if (!t) throw new Error('calc: unexpected end in "' + s + '"');
      if (t.t === 'n') return { k: 'n', v: t.v };
      if (t.t === 'op' && t.v === '(') { var e = ternary(); expect(')'); return e; }
      if (t.t === 'op' && t.v === '-') return { k: 'neg', a: primary() };
      if (t.t === 'id') {
        if (peek('(')) {
          p++;
          var args = [];
          if (!peek(')')) { args.push(ternary()); while (peek(',')) { p++; args.push(ternary()); } }
          expect(')');
          if (t.v === 'skill' && args.length === 1 && args[0].k === 'ref') return args[0];
          return { k: 'fn', name: t.v, args: args };
        }
        return { k: 'id', v: t.v };
      }
      if (t.t === 'ref') return { k: 'ref', name: t.name, field: t.field };
      throw new Error('calc: bad token in "' + s + '"');
    }
    function mul() { var a = primary(); while (peek('*') || peek('/')) { var o = toks[p++].v; a = { k: o, a: a, b: primary() }; } return a; }
    function add() { var a = mul(); while (peek('+') || peek('-')) { var o = toks[p++].v; a = { k: o, a: a, b: mul() }; } return a; }
    function cmp() { var a = add(); while (peek('<') || peek('>') || peek('<=') || peek('>=') || peek('==') || peek('!=')) { var o = toks[p++].v; a = { k: o, a: a, b: add() }; } return a; }
    function ternary() { var c = cmp(); if (peek('?')) { p++; var a = ternary(); expect(':'); var b = ternary(); return { k: '?', c: c, a: a, b: b }; } return c; }
    var ast = ternary();
    if (p < toks.length) throw new Error('calc: trailing tokens in "' + s + '"');
    calcCache[s] = ast;
    return ast;
  }
  // ctx: { sk: skill record, lvl, char }
  function evalCalc(expr, ctx) {
    if (expr === undefined || expr === null || expr === '') return 0;
    if (typeof expr === 'number') return expr;
    return ev(parse(expr), ctx);
  }
  function par(ctx, n) { return (ctx.sk.t['Param' + n] || 0); }
  function warn(ctx, msg) { if (ctx.warnings && ctx.warnings.indexOf(msg) < 0) ctx.warnings.push(msg); }
  function ev(n, ctx) {
    switch (n.k) {
      case 'n': return n.v;
      case 'neg': return -ev(n.a, ctx);
      case '+': return ev(n.a, ctx) + ev(n.b, ctx);
      case '-': return ev(n.a, ctx) - ev(n.b, ctx);
      case '*': return ev(n.a, ctx) * ev(n.b, ctx);
      case '/': return idiv(ev(n.a, ctx), ev(n.b, ctx));
      case '<': return +(ev(n.a, ctx) < ev(n.b, ctx));
      case '>': return +(ev(n.a, ctx) > ev(n.b, ctx));
      case '<=': return +(ev(n.a, ctx) <= ev(n.b, ctx));
      case '>=': return +(ev(n.a, ctx) >= ev(n.b, ctx));
      case '==': return +(ev(n.a, ctx) === ev(n.b, ctx));
      case '!=': return +(ev(n.a, ctx) !== ev(n.b, ctx));
      case '?': return ev(n.c, ctx) ? ev(n.a, ctx) : ev(n.b, ctx);
      case 'fn':
        var a = n.args.map(function (x) { return ev(x, ctx); });
        if (n.name === 'min') return Math.min.apply(null, a);
        if (n.name === 'max') return Math.max.apply(null, a);
        warn(ctx, 'function ' + n.name + '() not modelled, used 0'); // e.g. stat('...'.accr) on Hydra
        return 0;
      case 'ref': {
        var sid = skillIdByD2Name(n.name);
        var l = sid && ctx.char && ctx.char.skills ? (ctx.char.skills[sid] || 0) : 0;
        if (n.field === 'blvl' || n.field === 'lvl') return l;
        // other fields (ln12 of another skill etc.) evaluate in that skill's context
        var other = sid && DATA().skills[sid];
        return other ? ev({ k: 'id', v: n.field }, { sk: other, lvl: l, char: ctx.char }) : 0;
      }
      case 'id': {
        var v = n.v, L = ctx.lvl, m;
        if (v === 'lvl' || v === 'blvl' || v === 'slvl') return L;
        if ((m = /^par(\d)$/.exec(v))) return par(ctx, +m[1]);
        if ((m = /^ln(\d)(\d)$/.exec(v))) return par(ctx, +m[1]) + (L - 1) * par(ctx, +m[2]);
        if ((m = /^dm(\d)(\d)$/.exec(v))) {
          var lo = par(ctx, +m[1]), hi = par(ctx, +m[2]);
          return lo + idiv((110 * L) * (hi - lo), 100 * (L + 6));
        }
        if ((m = /^clc(\d)$/.exec(v))) return evalCalc(ctx.sk.t['calc' + m[1]], ctx);
        if (v === 'edmn') return elemRaw(ctx.sk, L, 'EMin');
        if (v === 'edmx') return elemRaw(ctx.sk, L, 'EMax');
        if (v === 'edln') return elemLen(ctx.sk, L);
        if (v === 'toht') return toHitPct(ctx.sk, L, ctx.char);
        // approx: edns/edxs (and the aura variants enms/exms) read as the shifted elemental min/max;
        // the Phrozen Keep skills.txt guide lists them as "elemental damage, shifted" but D2MOO has no
        // table of these codes to confirm. Not used by the Act I skills implemented here.
        if (v === 'edns' || v === 'enms') return Math.floor(shifted(elemRaw(ctx.sk, L, 'EMin'), ctx.sk.t.HitShift));
        if (v === 'edxs' || v === 'exms') return Math.floor(shifted(elemRaw(ctx.sk, L, 'EMax'), ctx.sk.t.HitShift));
        warn(ctx, 'identifier ' + v + ' not modelled, used 0');
        return 0;
      }
    }
    throw new Error('calc: bad node');
  }

  var d2NameIndex = null;
  function skillIdByD2Name(name) {
    if (!d2NameIndex) {
      d2NameIndex = {};
      var S = DATA().skills;
      for (var k in S) d2NameIndex[S[k].d2name] = k;
    }
    return d2NameIndex[name];
  }

  // ------------------------------------------------------------------ skill level scaling [TXT skills.txt]
  // Per-level adders: levels 2-8 use Lev1, 9-16 Lev2, 17-22 Lev3, 23-28 Lev4, 29+ Lev5.
  function lvlSum(t, base, pre, post, L) {
    var v = t[base] || 0;
    for (var i = 2; i <= L; i++) {
      var k = i <= 8 ? 1 : i <= 16 ? 2 : i <= 22 ? 3 : i <= 28 ? 4 : 5;
      v += t[pre + k + post] || 0;
    }
    return v;
  }
  function elemRaw(sk, L, which) { // EMin/EMax summed, before HitShift
    return lvlSum(sk.t, which, which + 'Lev', '', L);
  }
  function elemLen(sk, L) { // frames; ELevLen1 for 2-8, 2 for 9-16, 3 for 17+
    var t = sk.t, v = t.ELen || 0;
    for (var i = 2; i <= L; i++) v += t['ELevLen' + (i <= 8 ? 1 : i <= 16 ? 2 : 3)] || 0;
    return v;
  }
  function shifted(v, hs) { return v * Math.pow(2, hs || 0) / 256; } // (v << HitShift) / 256 in HP
  function toHitPct(sk, L, char) {
    var t = sk.t;
    if (t.ToHitCalc) return evalCalc(t.ToHitCalc, { sk: sk, lvl: L, char: char });
    if (t.ToHit || t.LevToHit) return (t.ToHit || 0) + (L - 1) * (t.LevToHit || 0);
    return 0;
  }
  // mana cost: ((mana + lvlmana*(lvl-1)) << manashift) / 256  [TXT skills.txt; checked vs AS: Fire Bolt 2.5, Jab 2/2.2/2.5]
  function manaCost(sk, L) {
    var t = sk.t;
    if (t.passive) return 0;
    var raw = (t.mana || 0) + (t.lvlmana || 0) * (L - 1);
    return Math.max(0, shifted(raw, t.manashift || 0));
  }

  // per-skill behaviour the tables do not spell out (srvdofunc numbers are code paths).
  // kind: contract kinds + 'passive' | 'curse' | 'channel' | 'leap' | 'corpse' | 'utility'
  var SKILL_KIND = {
    magic_arrow: 'missile', fire_arrow: 'missile', cold_arrow: 'missile', multiple_shot: 'missile',
    jab: 'melee', power_strike: 'melee', poison_javelin: 'missile', inner_sight: 'curse',
    critical_strike: 'passive', dodge: 'passive',
    fire_bolt: 'missile', warmth: 'passive', charged_bolt: 'missile', ice_bolt: 'missile', frozen_armor: 'buff',
    inferno: 'channel', static_field: 'nova', telekinesis: 'utility', frost_nova: 'nova', ice_blast: 'missile',
    bash: 'melee', sword_mastery: 'passive', axe_mastery: 'passive', mace_mastery: 'passive', howl: 'nova',
    find_potion: 'corpse', leap: 'leap', double_swing: 'melee', shout: 'buff', taunt: 'curse', stun: 'melee',
  };
  // Flare power sheet used to draw the effect (assets/manifest.js 'power.<name>').
  var SKILL_ART = {
    magic_arrow: 'power.arrows', fire_arrow: 'power.arrows', cold_arrow: 'power.arrows', multiple_shot: 'power.arrows',
    jab: 'power.spear', power_strike: 'power.lightning', poison_javelin: 'power.spear', inner_sight: 'power.runes',
    fire_bolt: 'power.fireball', charged_bolt: 'power.spark_blue', ice_bolt: 'power.icicle', frozen_armor: 'power.shield',
    inferno: 'power.ember', static_field: 'power.thunderstrike', telekinesis: 'power.channel', frost_nova: 'power.freeze',
    ice_blast: 'power.icicle', bash: 'power.cleave', howl: 'power.quake', find_potion: 'power.sparkle', leap: 'power.blast',
    double_swing: 'power.cleave', shout: 'power.shield_orange', taunt: 'power.runes_orange', stun: 'power.cleave',
  };
  var ELEM = { fire: 'fire', cold: 'cold', ltng: 'light', pois: 'poison', mag: 'magic', stun: 'stun' };

  function findSkill(id) {
    var S = DATA().skills;
    if (S[id]) return S[id];
    var k = skillIdByD2Name(id);
    if (k) return S[k];
    throw new Error('skill not found: ' + id);
  }

  // skillEffect: everything the engine needs to cast skill `skillId` at level `slvl` for `char`.
  function skillEffect(skillId, slvl, char) {
    var sk = findSkill(skillId), t = sk.t, L = Math.max(1, slvl | 0);
    var ctx = { sk: sk, lvl: L, char: char || { skills: {} }, warnings: [] };
    var calc = function (k) { return t[k] !== undefined ? evalCalc(t[k], ctx) : 0; };
    var kind = SKILL_KIND[sk.id] || (t.passive ? 'passive' : (t.srvmissile || t.srvmissilea) ? 'missile' : t.range === 'h2h' ? 'melee' : t.auralencalc ? 'buff' : 'utility');
    var out = {
      id: sk.id, name: sk.name, slvl: L, kind: kind, mana: manaCost(sk, L),
      dmg: { min: 0, max: 0, elem: null }, speed: 0, pierce: false, count: 1, radius: 0, duration: 0,
      art: SKILL_ART[sk.id] || null,
      toHitPct: toHitPct(sk, L, ctx.char), weaponPct: t.SrcDam ? Math.round(t.SrcDam * 100 / 128) : 0,
      dmgPct: 0, addMin: 0, addMax: 0, elem: null, stats: {}, missile: null, passive: !!t.passive,
      requires: { weapon: [t.itypea1, t.itypea2, t.itypea3].filter(Boolean), ammo: !t.noammo && /miss/.test(t.itypea1 || '') },
      warnings: ctx.warnings, // calc terms this port does not model (empty for the Act I skills)
    };
    // physical "+damage" (MinDam/MaxDam with HitShift) [TXT]
    if (t.MinDam || t.MaxDam) {
      out.addMin = Math.floor(shifted(lvlSum(t, 'MinDam', 'MinLevDam', '', L), t.HitShift));
      out.addMax = Math.floor(shifted(lvlSum(t, 'MaxDam', 'MaxLevDam', '', L), t.HitShift));
    }
    // elemental damage incl. synergy %: EDmgSymPerCalc [TXT]; length in frames [TXT]
    if (t.EType && (t.EMin || t.EMax)) {
      var syn = calc('EDmgSymPerCalc');
      var mn = shifted(elemRaw(sk, L, 'EMin'), t.HitShift) * (100 + syn) / 100;
      var mx = shifted(elemRaw(sk, L, 'EMax'), t.HitShift) * (100 + syn) / 100;
      var e = { type: ELEM[t.EType] || t.EType, min: 0, max: 0, synergyPct: syn };
      var len = elemLen(sk, L) + (t.ELenSymPerCalc ? calc('ELenSymPerCalc') : 0);
      if (t.EType === 'pois') {
        // poison: per-frame damage for `len` frames; total = perFrame * len (AS: Poison Javelin 25-37 over 8 s)
        e.min = Math.floor(mn * len); e.max = Math.floor(mx * len); e.perFrame = [mn, mx];
        e.durationSec = len / FPS;
      } else if (kind === 'channel') {
        // channelled (Inferno): table value is per frame; AS shows per second (12-25 at level 1)
        e.min = Math.floor(mn * FPS); e.max = Math.floor(mx * FPS); e.perSecond = true;
      } else {
        e.min = Math.floor(mn); e.max = Math.floor(mx);
        if (len) e.durationSec = len / FPS; // cold = chill length, stun = stun length
      }
      out.elem = e;
    }
    if (t.EType === 'stun' && !out.elem) out.elem = { type: 'stun', min: 0, max: 0, durationSec: (elemLen(sk, L) + calc('ELenSymPerCalc')) / FPS };
    // missile movement [TXT missiles.txt]: Vel in subtiles per frame, Range = lifetime in frames
    var mname = t.srvmissile || t.srvmissilea;
    var M = mname && DATA().missiles[mname];
    if (M) {
      out.missile = { id: mname, vel: M.Vel || 0, range: (M.Range || 0) + (M.LevRange || 0) * (L - 1), pierce: !!M.Pierce, explode: M.ExplosionMissile || null, sub: M.SubMissile1 || null };
      out.speed = M.Vel || 0;
      out.pierce = !!M.Pierce;
    }

    // per-skill semantics of calcN/ParamN (descriptions from skills.txt '*calc desc' columns)
    switch (sk.id) {
      case 'jab': out.dmgPct = calc('calc1'); out.hits = 5; break; // approx: Jab hit count follows the SQ animation; 5 thrusts is the commonly quoted number
      case 'multiple_shot': out.count = calc('calc1'); break;
      case 'charged_bolt': out.count = calc('calc1'); break;
      case 'inner_sight':
        out.stats = { armorclass: -Math.floor(shifted(elemRaw(sk, L, 'EMin'), t.HitShift)) }; // aurastatcalc1 = -edmn
        out.duration = calc('auralencalc') / FPS; out.radius = calc('aurarangecalc');
        out.elem = null; break;
      case 'critical_strike': case 'dodge':
        out.stats[t.passivestat1] = calc('passivecalc1'); break;
      case 'warmth': out.stats.manarecoverybonus = calc('passivecalc1'); out.elem = null; break;
      case 'sword_mastery': case 'axe_mastery': case 'mace_mastery':
        out.stats = { tohitPct: calc('passivecalc1'), damagePct: calc('passivecalc2'), critPct: calc('passivecalc3') };
        out.itype = t.passiveitype; break;
      case 'frozen_armor':
        out.stats = { defensePct: calc('aurastatcalc1') };
        out.duration = calc('auralencalc') / FPS; out.freezeSec = calc('calc1') / FPS; break;
      case 'inferno': out.radius = calc('calc1'); out.startMana = t.startmana || 0; out.manaPerSec = out.mana * FPS / 2; break; // approx: AS lists Inferno at 7 mana/s for level 1 = (36<<2)/256 * 12.5
      case 'static_field': out.lifePct = calc('calc1'); out.radius = calc('aurarangecalc'); out.elem = { type: 'light', min: 0, max: 0, pctOfLife: calc('calc1') }; break;
      case 'telekinesis': out.radius = calc('aurarangecalc'); out.knockbackPct = t.Param2 || 0; break;
      case 'frost_nova': out.radius = (t.Param1 || 0) + (L - 1) * (t.Param2 || 0); break;
      case 'ice_blast': out.freezeSec = (elemLen(sk, L) + calc('ELenSymPerCalc')) / FPS; if (out.elem) out.elem.durationSec = out.freezeSec; break;
      case 'bash': out.dmgPct = calc('calc1'); out.addMin += calc('calc2'); out.addMax += calc('calc2'); out.knockback = true; break;
      case 'stun': out.dmgPct = calc('calc1'); out.stunSec = (elemLen(sk, L) + calc('ELenSymPerCalc')) / FPS; break;
      case 'double_swing': out.dmgPct = calc('calc1'); out.hits = 2; out.dualWield = true; break;
      case 'howl':
        // Param3/4 = distance to retreat, Param5/6 = time to retreat (frames), calc1 = velocity adder
        out.fleeDist = (t.Param3 || 0) + (L - 1) * (t.Param4 || 0);
        out.duration = ((t.Param5 || 0) + (L - 1) * (t.Param6 || 0)) / FPS;
        out.radius = out.fleeDist; out.fleeVelAdd = calc('calc1'); break; // approx: howl radius = its missile spread; flee distance used as radius
      case 'shout': out.stats = { defensePct: calc('aurastatcalc1') }; out.duration = calc('auralencalc') / FPS; break;
      case 'taunt': out.stats = { tohitPct: calc('aurastatcalc1'), damagePct: calc('aurastatcalc2') }; break;
      case 'find_potion':
        out.chancePct = calc('calc1'); out.manaPct = t.Param3 || 0; out.rejuvPct = t.Param4 || 0; break;
      case 'leap': out.radius = calc('aurarangecalc'); out.knockbackRadius = calc('calc1'); break;
      default:
        // generic tables: aura/passive stats evaluated as-is
        for (var i = 1; i <= 5; i++) {
          if (t['passivestat' + i]) out.stats[t['passivestat' + i]] = calc('passivecalc' + i);
          if (t['aurastat' + i]) out.stats[t['aurastat' + i]] = calc('aurastatcalc' + i);
        }
        if (t.auralencalc) out.duration = calc('auralencalc') / FPS;
        if (t.aurarangecalc) out.radius = calc('aurarangecalc');
    }
    if (out.elem) out.dmg = { min: out.elem.min, max: out.elem.max, elem: out.elem.type };
    else if (out.addMin || out.addMax) out.dmg = { min: out.addMin, max: out.addMax, elem: 'phys' };
    if (char && kind === 'melee' || (char && out.weaponPct && kind === 'missile')) {
      var dv = derived(char);
      out.weaponDmg = { min: dv.dmgMin, max: dv.dmgMax };
    }
    return out;
  }

  // ------------------------------------------------------------------ characters
  function classOf(id) {
    var C = DATA().classes;
    if (C[id]) return C[id];
    for (var k in C) if (C[k].code === id || C[k].name.toLowerCase() === String(id).toLowerCase()) return C[k];
    throw new Error('class not found: ' + id);
  }

  function newCharacter(classId, name) {
    var c = classOf(classId);
    var ch = {
      cls: c.id, name: name || c.name, lvl: 1, xp: 0,
      str: c.str, dex: c.dex, vit: c.vit, ene: c.ene, statPts: 0, skillPts: 0,
      skills: {}, basicSkills: c.startSkills.slice(), hp: 0, mp: 0, stamina: 0, gold: 0,
      inv: [], equip: {}, belt: [], quests: {}, stash: [], goldStash: 0,
    };
    var LOC = { rarm: 'rhand', larm: 'lhand' };
    c.startItems.forEach(function (si) {
      var b = DATA().items.bases[si.code];
      if (!b) return;
      var n = Math.max(1, si.count || 1);
      if (si.loc) {
        var it = makeItem(si.code, 1, 'normal', null);
        if (b.stack) it.qty = b.stack; // approx: starting throwing weapons arrive as a full stack
        ch.equip[LOC[si.loc] || si.loc] = it;
      } else if (b.belt && (b.type === 'hpot' || b.type === 'mpot')) {
        for (var i = 0; i < n; i++) ch.belt.push(makeItem(si.code, 1, 'normal', null));
      } else {
        for (var j = 0; j < n; j++) ch.inv.push(makeItem(si.code, 1, 'normal', null));
      }
    });
    var d = derived(ch);
    ch.hp = d.maxHp; ch.mp = d.maxMp; ch.stamina = d.maxStamina;
    return ch;
  }

  // item stat totals from equipped items: { code: value } (affix codes as in magicprefix/properties.txt)
  function equipStats(char) {
    var tot = {};
    var eq = char.equip || {};
    for (var slot in eq) {
      var it = eq[slot];
      if (!it || it.broken) continue;
      (it.affixes || []).forEach(function (a) {
        tot[a.stat] = (tot[a.stat] || 0) + (a.val || 0);
        if (a.val2 !== undefined) tot[a.stat + ':max'] = (tot[a.stat + ':max'] || 0) + a.val2;
      });
    }
    return tot;
  }
  function sumOf(st, keys) { var v = 0; keys.forEach(function (k) { v += st[k] || 0; }); return v; }

  function weaponOf(char) {
    var eq = char.equip || {};
    var w = eq.rhand && baseOf(eq.rhand).kind === 'weapon' ? eq.rhand : eq.lhand && baseOf(eq.lhand).kind === 'weapon' ? eq.lhand : null;
    return w;
  }
  function shieldOf(char) {
    var eq = char.equip || {};
    var s = eq.lhand && baseOf(eq.lhand).types.indexOf('shld') >= 0 ? eq.lhand : eq.rhand && baseOf(eq.rhand).types.indexOf('shld') >= 0 ? eq.rhand : null;
    return s;
  }
  function baseOf(item) { var b = DATA().items.bases[item.base]; if (!b) throw new Error('item base not found: ' + item.base); return b; }

  function passiveStats(char) {
    // passives from learned skills (Critical Strike, Dodge, Warmth, masteries)
    var out = { crit: 0, dodge: 0, manaRegenPct: 0, masteries: [] };
    var S = DATA().skills;
    for (var id in (char.skills || {})) {
      var L = char.skills[id];
      if (!L || !S[id] || !S[id].t.passive) continue;
      var e = skillEffect(id, L, null);
      if (id === 'critical_strike') out.crit = e.stats.passive_critical_strike || 0;
      else if (id === 'dodge') out.dodge = e.stats.passive_dodge || 0;
      else if (id === 'warmth') out.manaRegenPct += e.stats.manarecoverybonus || 0;
      else if (e.itype) out.masteries.push({ itype: e.itype, tohitPct: e.stats.tohitPct, damagePct: e.stats.damagePct, critPct: e.stats.critPct });
    }
    return out;
  }

  // derived: character sheet values.
  function derived(char) {
    var c = classOf(char.cls);
    var st = equipStats(char);
    var str = char.str + (st.str || 0), dex = char.dex + (st.dex || 0);
    var vit = char.vit + (st.vit || 0), ene = char.ene + (st.enr || 0);
    var L = char.lvl;
    // life/mana/stamina [TXT charstats.txt, values in fourths]; base = hpadd + starting vit,
    // every point above the starting value gives LifePerVitality/4 [AS basics/characters]
    var maxHp = c.hpadd + c.vit + (vit - c.vit) * c.lifePerVit4 / 4 + (L - 1) * c.lifePerLvl4 / 4 + (st.hp || 0);
    var maxMp = c.ene + (ene - c.ene) * c.manaPerEne4 / 4 + (L - 1) * c.manaPerLvl4 / 4 + (st.mana || 0);
    var maxSt = c.stamina + (vit - c.vit) * c.stamPerVit4 / 4 + (L - 1) * c.stamPerLvl4 / 4 + (st.stam || 0);
    maxHp = Math.floor(maxHp); maxMp = Math.floor(maxMp); maxSt = Math.floor(maxSt);

    var ps = passiveStats(char);
    var w = weaponOf(char), wb = w ? baseOf(w) : null;
    var mast = wb ? ps.masteries.filter(function (m) { return wb.types.indexOf(m.itype) >= 0; })[0] : null;

    // attack rating [AS basics/attack]: (dex - 7) * 5 + class ToHitFactor, + item AR, then AR% bonuses
    var ar = (dex - 7) * 5 + c.toHitFactor + (st.att || 0);
    ar = Math.floor(ar * (100 + (st['att%'] || 0) + (mast ? mast.tohitPct : 0)) / 100);

    // defense [AS]: dex/4 + armor
    var def = Math.floor(dex / 4);
    var eq = char.equip || {};
    for (var slot in eq) { var it = eq[slot]; if (it && it.def) def += it.def; }
    def += st.ac || 0;

    // damage [AS basics/damage]: weapon min/max (+flat) * (100 + str/dex bonus + ED% + mastery)/100
    var mn = 1, mx = 2, speed = 0, frames = c.frames.swing || 16;
    if (wb) {
      var two = !!wb.twoHanded;
      mn = (two && wb.mindam2h) ? wb.mindam2h : (wb.mindam || 0);
      mx = (two && wb.maxdam2h) ? wb.maxdam2h : (wb.maxdam || 0);
      if (w.dmgMin) { mn = w.dmgMin; mx = w.dmgMax; }
      speed = wb.speed || 0;
      if (wb.types.indexOf('miss') >= 0) frames = c.frames.bow || frames;
    }
    mn += (st['dmg-min'] || 0) + (st['dmg-norm'] || 0);
    mx += (st['dmg-max'] || 0) + (st['dmg-norm:max'] || 0);
    if (mx < mn) mx = mn;
    var statBonus = wb ? (str * (wb.strBonus || 0) + dex * (wb.dexBonus || 0)) / 100 : 0;
    var pct = 100 + statBonus + (st['dmg%'] || 0) + (mast ? mast.damagePct : 0);
    var dmgMin = Math.floor(mn * pct / 100), dmgMax = Math.floor(mx * pct / 100);

    // attack frames [AS basics/speed]: EIAS = 120*IAS/(120+IAS) - WSM; frames = ceil(256*F / floor(256*(100+EIAS)/100)) - 1
    // approx: base F per class from charstats '#swing'/'#bow' comment columns, not the per-weapon animdata.d2
    var ias = sumOf(st, ['swing1', 'swing2', 'swing3']);
    var eias = Math.max(-85, Math.min(75, Math.floor(120 * ias / (120 + ias)) - speed));
    var atkFrames = Math.ceil(256 * frames / Math.floor(256 * (100 + eias) / 100)) - 1;

    // walk/run [TXT charstats WalkVelocity/RunVelocity]; FRW diminishing 150*x/(150+x) [AS]; armor 'speed' penalty
    var frw = sumOf(st, ['move1', 'move2', 'move3']);
    var armorPenalty = 0;
    for (var s2 in eq) { var it2 = eq[s2]; if (it2) { var b2 = baseOf(it2); if (b2.kind === 'armor' && b2.speed) armorPenalty += b2.speed; } }
    var frwEff = Math.floor(150 * frw / (150 + frw)) - armorPenalty;
    var walk = c.walkVel * (100 + frwEff) / 100, run = c.runVel * (100 + frwEff) / 100;

    // block [AS basics/blocking]: (shield block + class BlockFactor) * (dex - 15) / (clvl * 2), max 75; 1/3 while running
    var sh = shieldOf(char), block = 0;
    if (sh) {
      var sb = baseOf(sh);
      block = ((sb.block || 0) + c.blockFactor + (st.block || 0)) * (dex - 15) / (L * 2);
      block = Math.max(0, Math.min(75, Math.floor(block)));
    }
    // resists [AS]: Normal difficulty has no penalty; cap 75 (+max res)
    var all = st['res-all'] || 0;
    function res(k, mk) { return Math.min(75 + (st[mk] || 0), (st[k] || 0) + all); }
    // regen [D2MOO PlrModes.cpp EVENTS_ManaRegen]: per frame maxMana/(25*ManaRegen) * (100+bonus)/100
    var mpRegen = maxMp / c.manaRegenSec * (100 + ps.manaRegenPct + (st['regen-mana'] || 0)) / 100;
    // life regen [D2MOO EVENTS_HpRegen]: STAT_HPREGEN is 1/256 life per frame ('regen' = Replenish Life)
    var hpRegen = (st.regen || 0) * FPS / 256;

    return {
      maxHp: maxHp, maxMp: maxMp, maxStamina: maxSt, str: str, dex: dex, vit: vit, ene: ene,
      ar: ar, def: def, dmgMin: dmgMin, dmgMax: dmgMax, atkFrames: atkFrames, ias: ias,
      walk: walk, run: run, walkUnits: 'charstats velocity (AS: walk ~4, run ~6 yards/s at 6/9)',
      block: block, res: { fire: res('res-fire', 'res-fire-max'), cold: res('res-cold', 'res-cold-max'), light: res('res-ltng', 'res-ltng-max'), poison: res('res-pois', 'res-pois-max') },
      hpRegen: hpRegen, mpRegen: mpRegen, crit: ps.crit + (mast ? mast.critPct : 0), dodge: ps.dodge,
      deadly: st.deadly || 0, lifeSteal: st.lifesteal || 0, manaSteal: st.manasteal || 0,
      mf: st['mag%'] || 0, gf: st['gold%'] || 0, thorns: st.thorns || 0, frw: frw, fhr: sumOf(st, ['balance1', 'balance2', 'balance3']),
      fcr: sumOf(st, ['cast1', 'cast2', 'cast3']), lightRadius: st.light || 0, dmgReduce: st['red-dmg'] || 0, magReduce: st['red-mag'] || 0,
    };
  }

  // ------------------------------------------------------------------ combat
  // [AS basics/combat]: chance = 100 * AR/(AR+DR) * 2 * alvl/(alvl+dlvl), clamped to 5..95%
  function hitChance(ar, alvl, def, dlvl) {
    ar = Math.max(0, ar); def = Math.max(0, def);
    var c = (ar + def > 0 ? ar / (ar + def) : 1) * 2 * (alvl / Math.max(1, alvl + dlvl));
    return Math.max(0.05, Math.min(0.95, c));
  }
  // apply a resist (percent) to damage; immunity at >= 100
  function applyResist(dmg, resPct) { return resPct >= 100 ? 0 : Math.floor(dmg * (100 - resPct) / 100); }

  // ------------------------------------------------------------------ experience
  function xpToReach(level) { // total XP needed to be `level` (experience.txt row level-1)
    var E = DATA().experience;
    if (level <= 1) return 0;
    return E.toNext[Math.min(level - 1, E.maxLevel - 1)];
  }
  function levelForXp(xp) {
    var E = DATA().experience, L = 1;
    while (L < E.maxLevel && xp >= E.toNext[L]) L++;
    return L;
  }
  // [D2MOO SUNITDMG_ComputeExperienceGain] single player
  var XP_LOWER = [256, 256, 256, 256, 256, 256, 207, 159, 110, 61, 13];   // monster below the player
  var XP_HIGHER = [256, 256, 256, 256, 256, 256, 225, 174, 92, 38, 5];    // monster above, clvl < 25
  function xpGain(clvl, mlvl, baseXp) {
    var E = DATA().experience;
    if (baseXp <= 0) return 1;
    if (clvl >= E.maxLevel) return 0;
    var r = baseXp;
    if (mlvl <= clvl) r = idiv(baseXp * XP_LOWER[Math.min(clvl - mlvl, 10)], 256);
    else if (clvl < 25) r = idiv(baseXp * XP_HIGHER[Math.min(mlvl - clvl, 10)], 256);
    else r = idiv(baseXp * clvl, mlvl);
    if (r > 0) r = Math.floor(r * E.ratio[clvl] / Math.pow(2, E.ratioShift));
    return r;
  }
  function grantXp(char, monLvl, baseXp) {
    var gained = xpGain(char.lvl, monLvl, baseXp);
    var E = DATA().experience;
    var cap = E.toNext[E.maxLevel - 1];
    char.xp = Math.min(cap, char.xp + gained);
    var leveled = 0;
    var c = classOf(char.cls);
    while (char.lvl < E.maxLevel && char.xp >= E.toNext[char.lvl]) {
      char.lvl++; leveled++;
      char.statPts += c.statPerLvl;   // 5 stat points [TXT charstats StatPerLevel]
      char.skillPts += 1;             // 1 skill point per level [AS basics/characters]
    }
    if (leveled) { var d = derived(char); char.hp = d.maxHp; char.mp = d.maxMp; char.stamina = d.maxStamina; } // level-up refills life/mana [AS]
    return { gained: gained, leveled: leveled };
  }
  function spendStat(char, stat) {
    if (char.statPts <= 0 || ['str', 'dex', 'vit', 'ene'].indexOf(stat) < 0) return false;
    var before = derived(char);
    char[stat]++; char.statPts--;
    var after = derived(char);
    char.hp += after.maxHp - before.maxHp; char.mp += after.maxMp - before.maxMp;
    return true;
  }
  function canLearn(char, skillId) {
    var sk = findSkill(skillId);
    if (sk.cls !== char.cls) return { ok: false, why: 'skill belongs to ' + sk.cls };
    if (char.skillPts <= 0) return { ok: false, why: 'no skill points' };
    if ((char.skills[sk.id] || 0) >= sk.maxlvl) return { ok: false, why: 'skill at max level' };
    if (char.lvl < sk.reqlvl + (char.skills[sk.id] || 0)) return { ok: false, why: 'requires level ' + (sk.reqlvl + (char.skills[sk.id] || 0)) };
    for (var i = 0; i < sk.prereq.length; i++) if (!char.skills[sk.prereq[i]]) return { ok: false, why: 'requires ' + DATA().skills[sk.prereq[i]].name };
    return { ok: true };
  }
  // In D2 a skill's next point needs clvl >= reqlevel + current slvl (AS skills page: "required level ... +1 per point")
  function learnSkill(char, skillId) {
    var r = canLearn(char, skillId);
    if (!r.ok) return r;
    var sk = findSkill(skillId);
    char.skills[sk.id] = (char.skills[sk.id] || 0) + 1;
    char.skillPts--;
    return { ok: true, slvl: char.skills[sk.id] };
  }
  function skillTree(classId) {
    var c = classOf(classId), S = DATA().skills;
    return c.tabs.map(function (name, i) {
      return { tab: i + 1, name: name, skills: c.skills.filter(function (k) { return S[k].tab === i + 1; }).map(function (k) { return S[k]; }) };
    });
  }

  // death [D2MOO Player.cpp PLAYER_ApplyDeathPenalty]: lose min(clvl,20)% of all gold (inventory+stash);
  // the rest of the inventory gold drops with the corpse. Normal difficulty: no XP loss [AS basics/death].
  function deathPenalty(char) {
    var total = (char.gold || 0) + (char.goldStash || 0);
    var lost = Math.floor(total * Math.min(char.lvl, 20) / 100);
    var corpseGold;
    if (lost > char.gold) { char.goldStash = (char.gold + char.goldStash) - lost; corpseGold = 0; }
    else corpseGold = char.gold - lost;
    char.gold = 0;
    return { lost: lost, corpseGold: corpseGold, xpLost: 0 };
  }
  function goldLimit(char) { return 10000 * char.lvl; } // [D2MOO Units.cpp UNITS_GetInventoryGoldLimit]

  // ------------------------------------------------------------------ quests
  function completeQuest(char, questId) {
    var q = DATA().quests[questId];
    if (!q) throw new Error('quest not found: ' + questId);
    if (char.quests[questId] === 'done') return { ok: false, why: 'quest already completed' };
    char.quests[questId] = 'done';
    var rw = q.reward || {};
    if (rw.skillPts) char.skillPts += rw.skillPts;
    if (rw.statPts) char.statPts += rw.statPts;
    if (rw.respec) char.quests[questId + ':respec'] = 'available';
    return { ok: true, reward: rw };
  }

  // ------------------------------------------------------------------ monsters
  var DIFF = { normal: 'n', n: 'n', nightmare: 'nm', nm: 'nm', hell: 'h', h: 'h' };
  function ratio(a, b) { return idiv(a * b, 100); } // DATATBLS_ApplyRatio(a, b, 100)

  // rollMonster [D2MOO Monster.cpp + MonsterTbls.cpp DATATBLS_CalculateMonsterStatsByLevel + MonsterUnique.cpp]
  //  * Normal: mlvl = monstats Level; Nightmare/Hell: area level (bosses keep their own).
  //  * hp = rand[minHP%, maxHP%] of monlvl L-HP; ac/xp/ar/dmg likewise from L-AC/L-XP/L-TH/L-DM.
  //  * champion: +2 mlvl, hp +monumod[4+diff]% (x3 normal), xp x3, dmg/AR +monumod[11]/[10] * ChampionDamageBonus%.
  //  * unique (and superunique): +3 mlvl, hp +monumod[7+diff]% (x4), xp x5; minions: +3 mlvl, hp +monumod[1+diff]% (x2), xp x5.
  function rollMonster(monId, areaLvl, r, kind, opts) {
    var D = DATA();
    opts = opts || {};
    r = r || rng(1);
    kind = kind || 'normal';
    var su = D.superuniques[monId] || null;
    var mon = D.monsters[su ? su.cls : monId];
    if (!mon) throw new Error('monster not found: ' + monId);
    var dk = DIFF[opts.difficulty || 'normal'] || 'n';
    var dIdx = { n: 0, nm: 1, h: 2 }[dk];
    var md = mon.d[dk];
    if (su) kind = 'unique';
    var baseLvl = md.level;
    if (dk !== 'n' && !mon.boss && !mon.noRatio && areaLvl) baseLvl = areaLvl;
    var C = D.umod.constants, maxRow = D.monlvl[dk].length - 1;
    // HP/AC/XP/AR/damage come from monlvl at the base level (Monster.cpp); the champion/unique level bonus
    // (MonsterUnique.cpp UMod4_LevelBonus / UMod16_Champion) only raises STAT_LEVEL afterwards, which
    // feeds hit chance, enchant damage and the item level of drops.
    var mlvl = baseLvl + (kind === 'champion' ? 2 : (kind === 'unique' || kind === 'minion') ? 3 : 0);
    var baseRow = D.monlvl[dk][Math.max(1, Math.min(baseLvl, maxRow))];
    var row = D.monlvl[dk][Math.max(1, Math.min(mlvl, maxRow))];
    var noRatio = mon.noRatio;
    var hpMin = noRatio ? md.minHP : ratio(baseRow[2], md.minHP), hpMax = noRatio ? md.maxHP : ratio(baseRow[2], md.maxHP);
    var hp = hpMin + rint(r, hpMax - hpMin + 1);
    var xp = noRatio ? md.exp : ratio(baseRow[4], md.exp);
    var ac = noRatio ? md.ac : ratio(baseRow[0], md.ac);
    var a1 = { min: ratio(baseRow[3], md.a1min), max: ratio(baseRow[3], md.a1max), ar: ratio(baseRow[1], md.a1th) };
    var a2 = md.a2max ? { min: ratio(baseRow[3], md.a2min), max: ratio(baseRow[3], md.a2max), ar: ratio(baseRow[1], md.a2th) } : null;
    var dmgPct = 0, arPct = 0, velPct = 0;
    var res = Object.assign({}, md.res);
    var mods = [];
    if (kind === 'champion') {
      hp += idiv(hp * C[4 + dIdx], 100);
      xp = xp * 5; xp = xp - idiv(2 * xp, 5); // LevelBonus x5 then Champion -2/5 => x3
      var cdb = D.difficulty.ChampionDamageBonus || 100;
      dmgPct += idiv(C[11] * cdb, 100); arPct += idiv(C[10] * cdb, 100); velPct += 20;
      mods.push('champion');
    } else if (kind === 'unique') {
      hp += idiv(hp * C[7 + dIdx], 100); xp *= 5;
    } else if (kind === 'minion') {
      hp += idiv(hp * C[1 + dIdx], 100); xp *= 5;
    }
    var extra = { fire: null, cold: null, light: null };
    (su ? su.mods : (opts.mods || [])).forEach(function (m) {
      mods.push(m);
      var dm = row[3];
      switch (m) {
        case 'strong': dmgPct += idiv(C[15] * (D.difficulty.UniqueDamageBonus || 100), 100); arPct += idiv(C[13] * (D.difficulty.UniqueDamageBonus || 100), 100); break; // [D2MOO UMod5_Strong]
        case 'fast': velPct += Math.max(10, Math.min(100, idiv(2048, Math.max(1, mon.walkVel)) - 128)); break; // [D2MOO UMod6_Fast]
        case 'resist': if (res.cold < 100) res.cold += 40; if (res.fire < 100) res.fire += 40; if (res.light < 100) res.light += 40; break; // [D2MOO UMod8_Resistant case 8]
        case 'fire': extra.fire = { min: idiv(dm * C[28 + dIdx], 100), max: idiv(dm * C[31 + dIdx], 100) }; res.fire += 75; break; // [D2MOO UMod9]
        case 'cold': extra.cold = { min: idiv(dm * C[28 + dIdx], 100), max: idiv(dm * C[31 + dIdx], 100), lenFrames: 5 * mlvl + 100 }; res.cold += 75; break;
        case 'lightning': extra.light = { min: idiv(dm * C[28 + dIdx], 100), max: idiv(dm * C[31 + dIdx], 100) }; res.light += 75; break;
        case 'spectralhit': if (res.cold < 75) res.cold += 20; if (res.fire < 75) res.fire += 20; if (res.light < 75) res.light += 20; break; // [D2MOO UMod8 case 27]
        default: break; // approx: other unique mods (cursed, mana burn, ...) are flagged only; engine may add behaviour
      }
    });
    function boost(a) { return a && { min: Math.floor(a.min * (100 + dmgPct) / 100), max: Math.floor(a.max * (100 + dmgPct) / 100), ar: Math.floor(a.ar * (100 + arPct) / 100) }; }
    a1 = boost(a1); a2 = boost(a2);
    var miss = mon.miss.MissA2 || mon.miss.MissA1 || null, M = miss && D.missiles[miss];
    var inst = {
      id: monId, cls: mon.id, name: su ? su.name : mon.name, kind: kind, lvl: mlvl,
      hp: hp, maxHp: hp, ac: ac, def: ac, ar: a1.ar, dmg: { min: a1.min, max: a1.max }, a1: a1, a2: a2,
      extraDmg: extra, res: res, block: md.block, xp: xp, ai: mon.ai, aiKind: mon.aiKind, aip: md.aip.slice(),
      walk: mon.walkVel * (100 + velPct) / 100, run: mon.runVel * (100 + velPct) / 100,
      ranged: mon.ranged || !!(mon.miss.MissA1 && mon.boss), missile: M ? { id: miss, vel: M.Vel, range: M.Range,
        dmg: M.MinDamage || M.MaxDamage ? { min: Math.floor(shifted(M.MinDamage || 0, M.HitShift || 0)), max: Math.floor(shifted(M.MaxDamage || 0, M.HitShift || 0)) } : null } : null,
      el: md.el, skills: mon.skills, mods: mods, art: mon.art, artAlt: mon.artAlt, tint: su ? su.tint : (kind === 'champion' ? '#6a8cff' : mon.tint),
      undead: mon.undead, demon: mon.demon, boss: mon.boss || !!su,
      // [D2MOO Monster.cpp]: hpregen per frame = (hp<<8 * DamageRegen) >> 12 (1/256 HP); UMod2_HealthBonus zeroes it for champions/uniques
      hpRegenPerSec: (kind === 'unique' || kind === 'champion' || su) ? 0 : hp * mon.damageRegen / 4096 * FPS,
      tc: su ? su.tc[dk] : md.tc[kind === 'champion' ? 1 : (kind === 'unique' ? 2 : 0)],
      minions: su ? { id: su.cls === 'fallenshaman1' ? 'fallen1' : (mon.minion || su.cls), count: su.minions }
        : (kind === 'unique' ? { id: mon.minion || mon.id, count: [3, 6] } : (kind === 'champion' ? { id: mon.id, count: [1, 3] } : null)), // [AS monsters/bonus: uniques 3-6 minions, champions in packs of 2-4]
      flee: mon.ai === 'Fallen' ? { onAllyDeath: true } : null,
      resurrects: mon.ai === 'FallenShaman' ? 'fallen' : null,
    };
    // shaman fireball damage from missiles.txt shafire1 (EMin/Emax with MinELev scaling by monster skill level)
    if (mon.ai === 'FallenShaman') {
      var F = D.missiles.shafire1;
      if (F) {
        var sl = (mon.skills.filter(function (s) { return s.id === 'shamanfire'; })[0] || { lvl: 1 }).lvl;
        var mnF = F.EMin || 0, mxF = F.Emax || 0;
        for (var i = 2; i <= sl; i++) { var k = i <= 8 ? 1 : i <= 16 ? 2 : i <= 22 ? 3 : i <= 28 ? 4 : 5; mnF += F['MinELev' + k] || 0; mxF += F['MaxELev' + k] || 0; }
        inst.missile = { id: 'shafire1', vel: F.Vel, range: F.Range, elem: 'fire', dmg: { min: Math.floor(shifted(mnF, F.HitShift)), max: Math.floor(shifted(mxF, F.HitShift)) } };
        inst.ranged = true;
      }
    }
    return inst;
  }

  // ------------------------------------------------------------------ items
  function typeIs(b, t) { return b.types.indexOf(t) >= 0; }

  // base defense roll [AS items/basics]: random in [minac, maxac]
  function makeItem(code, ilvl, q, r, extra) {
    var D = DATA(), b = D.items.bases[code];
    if (!b) throw new Error('item base not found: ' + code);
    r = r || rng(ilvl * 7919 + code.charCodeAt(0));
    var it = { base: code, ilvl: ilvl | 0, q: q || 'normal', affixes: [], w: b.w, h: b.h, icon: b.icon, iconName: b.iconName, name: b.name };
    if (b.kind === 'armor') it.def = rrange(r, b.minac || 0, b.maxac || 0);
    if (b.dur) it.dur = it.maxDur = b.dur;
    if (b.stack && b.kind !== 'misc') it.qty = b.stack;
    if (b.kind === 'misc' && b.spawnStack) it.qty = b.spawnStack;
    if (extra) for (var k in extra) it[k] = extra[k];
    return it;
  }

  // affix level [D2MOO ItemsMagic.cpp ITEMS_ComputeCraftedMagicAffixLevel / AS items/basics "alvl"]
  function affixLevel(ilvl, qlvl, magicLvl) {
    ilvl = Math.max(ilvl, qlvl);
    var a;
    if (magicLvl) a = ilvl + magicLvl;
    else {
      var half = idiv(qlvl, 2), dist = 99 - half;
      a = ilvl >= dist ? 2 * ilvl - half - dist : ilvl - half;
    }
    return Math.max(1, Math.min(99, a));
  }
  function affixFits(a, b, alvl, it, isRare) {
    if (a.level > alvl || (a.maxlevel && alvl > a.maxlevel)) return false;
    if (isRare && !a.rare) return false;
    var ok = (a.itype || []).some(function (t) { return typeIs(b, t); });
    if (!ok) return false;
    if ((a.etype || []).some(function (t) { return typeIs(b, t); })) return false;
    var groups = (it.affixRows || []).map(function (x) { return x.group; });
    if (groups.indexOf(a.group) >= 0) return false;
    if (a.cls && b.types.some(function (t) { var T = DATA().items.types[t]; return T && T.class && T.class !== a.cls; })) return false;
    return true;
  }
  // [D2MOO ITEMS_RollMagicAffixesNew]: weighted by frequency (x affix level when the base has a magic lvl)
  function rollAffix(r, list, b, alvl, it, isRare) {
    var pool = [], tot = 0;
    list.forEach(function (a) {
      if (!affixFits(a, b, alvl, it, isRare)) return;
      var f = b.magicLvl ? a.level * a.freq : a.freq;
      pool.push([a, f]); tot += f;
    });
    if (!pool.length) return null;
    var x = rint(r, tot + 1); // D2 rolls [0, total]
    for (var i = 0; i < pool.length; i++) { x -= pool[i][1]; if (x < 0) return pool[i][0]; }
    return pool[pool.length - 1][0];
  }
  function applyMods(it, mods, r, from) {
    mods.forEach(function (m) {
      var a = { stat: m.code, val: rrange(r, Math.min(m.min, m.max), Math.max(m.min, m.max)) };
      if (m.param !== undefined) a.param = m.param;
      // damage ranges: one property, two numbers (min/max) [TXT properties.txt dmg-fire etc.]
      if (/^dmg-(fire|ltng|cold|pois|mag|norm)$/.test(m.code)) { a.val = m.min; a.val2 = m.max; }
      if (from) a.from = from;
      it.affixes.push(a);
    });
  }
  function finishItem(it, b) {
    // enhanced defense/damage fold into the item's own numbers [AS items/basics]
    var st = {}; it.affixes.forEach(function (a) { st[a.stat] = (st[a.stat] || 0) + a.val; });
    if (b.kind === 'armor' && it.def !== undefined) {
      if (st['ac%']) it.def = Math.floor((b.maxac + 1) * (100 + st['ac%']) / 100); // approx: community rule "items with %ED roll max base defense (+1)"; not verified in D2MOO
    }
    if (b.kind === 'weapon' && st['dmg%']) {
      var mn = b.twoHanded && b.mindam2h ? b.mindam2h : b.mindam, mx = b.twoHanded && b.maxdam2h ? b.maxdam2h : b.maxdam;
      it.dmgMin = Math.floor(mn * (100 + st['dmg%']) / 100); it.dmgMax = Math.floor(mx * (100 + st['dmg%']) / 100);
      it.affixes = it.affixes.filter(function (a) { return a.stat !== 'dmg%'; }).concat([{ stat: 'dmg%', val: 0, onItem: st['dmg%'] }]);
    }
    return it;
  }

  function makeMagic(it, b, r) {
    var D = DATA().items, alvl = affixLevel(it.ilvl, b.level, b.magicLvl || 0);
    it.affixRows = [];
    // [D2MOO Items.cpp sub_6FC4D5E0]: prefix on a coin flip; suffix on a coin flip, forced if no prefix
    var p = null, s = null;
    if (rint(r, 2)) p = rollAffix(r, D.prefixes, b, alvl, it, false);
    if (p) it.affixRows.push(p);
    if (!p || rint(r, 2)) s = rollAffix(r, D.suffixes, b, alvl, it, false);
    if (s) it.affixRows.push(s);
    if (!p && !s) return false;
    it.prefix = p ? p.name : null; it.suffix = s ? s.name : null;
    if (p) applyMods(it, p.mods, r, 'prefix');
    if (s) applyMods(it, s.mods, r, 'suffix');
    it.reqlvl = Math.max(b.reqlvl || 0, p ? p.reqlvl : 0, s ? s.reqlvl : 0);
    delete it.affixRows;
    return true;
  }
  function makeRare(it, b, r) {
    var D = DATA().items, alvl = affixLevel(it.ilvl, b.level, b.magicLvl || 0);
    var fits = function (n) { return (n.itype || []).some(function (t) { return typeIs(b, t); }) && !(n.etype || []).some(function (t) { return typeIs(b, t); }); };
    var rp = D.rareNames.prefix.filter(fits), rs = D.rareNames.suffix.filter(fits);
    if (!rp.length || !rs.length) return false;
    it.rareName = rp[rint(r, rp.length)].name + ' ' + rs[rint(r, rs.length)].name;
    // [D2MOO D2GAME_RollRareItem_6FC53360]: affix count from {3,4,4,5,5,5,6,6}; coin flip prefix/suffix, max 3 each
    var count = [3, 4, 4, 5, 5, 5, 6, 6][rint(r, 8)], np = 0, ns = 0, pDone = false, sDone = false, rows = [];
    it.affixRows = rows;
    for (var n = 0; n < count && !(pDone && sDone); n++) {
      if (!sDone && (pDone || rint(r, 2))) {
        var s = rollAffix(r, D.suffixes, b, alvl, it, true);
        if (s) { rows.push(s); applyMods(it, s.mods, r, 'suffix'); if (++ns >= 3) sDone = true; } else { sDone = true; n--; }
      } else {
        var p = rollAffix(r, D.prefixes, b, alvl, it, true);
        if (p) { rows.push(p); applyMods(it, p.mods, r, 'prefix'); if (++np >= 3) pDone = true; } else { pDone = true; n--; }
      }
    }
    it.reqlvl = Math.max.apply(null, [b.reqlvl || 0].concat(rows.map(function (a) { return a.reqlvl || 0; })));
    delete it.affixRows;
    return np + ns > 0;
  }
  function makeUniqueOrSet(it, b, r, list, q) {
    // [D2MOO ItemsMagic.cpp sub_6FC542C0 (sets) / unique roll]: rows for this base code with lvl <= ilvl, weighted by rarity
    var pool = list.filter(function (u) { return u.code === b.code && u.lvl <= it.ilvl; });
    if (!pool.length) return false;
    var tot = 0; pool.forEach(function (u) { tot += Math.max(1, u.rarity); });
    var x = rint(r, tot), u = pool[0];
    for (var i = 0; i < pool.length; i++) { x -= Math.max(1, pool[i].rarity); if (x < 0) { u = pool[i]; break; } }
    it.uniqueName = u.name; if (u.set) it.setName = u.set;
    applyMods(it, u.props, r, q);
    it.reqlvl = Math.max(b.reqlvl || 0, u.reqlvl || 0);
    return true;
  }
  function makeSuperior(it, b, r) {
    var D = DATA().items, cat = typeIs(b, 'shld') ? 'shield' : typeIs(b, 'tors') ? 'armor' : typeIs(b, 'boot') ? 'boots' : typeIs(b, 'glov') ? 'gloves' : typeIs(b, 'belt') ? 'belt' : typeIs(b, 'helm') ? 'armor' : typeIs(b, 'miss') ? 'bow' : typeIs(b, 'thro') ? 'thrown' : typeIs(b, 'staf') ? 'staff' : typeIs(b, 'wand') ? 'wand' : typeIs(b, 'scep') ? 'scepter' : typeIs(b, 'weap') ? 'weapon' : null;
    var pool = D.superior.filter(function (s) { return cat && s.for.indexOf(cat) >= 0; });
    if (!pool.length) return false;
    applyMods(it, pool[rint(r, pool.length)].mods, r, 'superior');
    return true;
  }

  // quality [D2MOO Items.cpp D2GAME_DropTC_6FC51360, itemratio.txt]:
  //   chance = (Ratio - (ilvl - qlvl)/Divisor) << 7, raised to Min, then reduced by the TC's Unique/Set/Rare/Magic
  //   value: chance - chance*tcVal/1024; success if rand(chance) < 128. Order unique, set, rare, magic, superior, normal, low.
  function rollQuality(b, ilvl, r, tcq, mf) {
    var D = DATA().items, T = function (t) { return D.types[t] || {}; };
    // D2 reads the flags of the item's own type row only (ITEMS_GetItemTypeFromItemId -> wType[0])
    var own = T(b.type), flags = { normal: own.normal || 0, magic: own.magic || 0, rare: own.rare || 0 };
    if (flags.normal || (b.kind === 'misc' && !flags.magic)) return 'normal';
    var classItem = b.types.some(function (t) { return T(t).class; });
    var R = D.ratio[(classItem ? 'class_' : '') + (b.tier === 'normal' ? 'normal' : 'uber')] || D.ratio.normal;
    var diff = ilvl - b.level;
    mf = mf || 0;
    function chance(base, div, min, tcVal, mfDiv) {
      var c = (base - idiv(diff, div)) << 7;
      if (mf) { var md = mfDiv(100 + mf); if (md) c = idiv(12800 * (base - idiv(diff, div)), md); }
      c = Math.max(c, min);
      return c - idiv(c * (tcVal || 0), 1024);
    }
    function hit(c) { return c <= 0 || rint(r, c) < 128; }
    // MF diminishing returns [D2MOO, same function]
    if (hit(chance(R.Unique, R.UniqueDivisor, R.UniqueMin, tcq.unique, function (m) { return m > 110 ? idiv(50 * (5 * m - 500), m + 150) + 100 : m; }))) return 'unique';
    if (hit(chance(R.Set, R.SetDivisor, R.SetMin, tcq.set, function (m) { return m > 110 ? idiv(100 * (5 * m - 500), m + 400) + 100 : m; }))) return 'set';
    if (flags.rare && hit(chance(R.Rare, R.RareDivisor, R.RareMin, tcq.rare, function (m) { return m > 110 ? idiv(200 * (3 * m - 300), m + 500) + 100 : m; }))) return 'rare';
    if (flags.magic) return 'magic';
    if (hit(chance(R.Magic, R.MagicDivisor, R.MagicMin, tcq.magic, function (m) { return m; }))) return 'magic';
    if (hit((R.HiQuality - idiv(diff, R.HiQualityDivisor)) << 7)) return 'superior';
    if (hit((R.Normal - idiv(diff, R.NormalDivisor)) << 7)) return 'normal';
    return 'low';
  }

  // build an item of the rolled quality, with D2's fallbacks [D2MOO ItemMode.cpp]:
  // unique fails -> rare (x3 durability), set fails -> magic (x2 durability), rare fails -> magic, magic fails -> superior -> normal
  function createItem(code, ilvl, q, r) {
    var D = DATA().items, b = D.bases[code], it = makeItem(code, ilvl, 'normal', r);
    if (q === 'unique') {
      if (makeUniqueOrSet(it, b, r, D.uniques, 'unique')) { it.q = 'unique'; return finishItem(it, b); }
      if (it.maxDur) it.dur = it.maxDur = Math.min(255, it.maxDur * 3);
      q = 'rare';
    }
    if (q === 'set') {
      if (makeUniqueOrSet(it, b, r, D.sets, 'set')) { it.q = 'set'; return finishItem(it, b); }
      if (it.maxDur) it.dur = it.maxDur = Math.min(255, it.maxDur * 2);
      q = 'magic';
    }
    if (q === 'rare') { if (makeRare(it, b, r)) { it.q = 'rare'; return finishItem(it, b); } it.affixes = []; q = 'magic'; }
    if (q === 'magic') { if (makeMagic(it, b, r)) { it.q = 'magic'; return finishItem(it, b); } it.affixes = []; q = 'superior'; }
    if (q === 'superior') { if (makeSuperior(it, b, r)) { it.q = 'superior'; return finishItem(it, b); } q = 'normal'; }
    if (q === 'low') {
      it.q = 'low'; it.lowName = (D.lowQuality[rint(r, D.lowQuality.length)] || {}).Name || 'Low Quality';
      // [D2MOO sub_6FC549F0]: 75% damage / defense, 1/3 durability
      if (b.kind === 'weapon') { it.dmgMin = Math.max(1, idiv(75 * b.mindam, 100)); it.dmgMax = Math.max(2, idiv(75 * b.maxdam, 100)); }
      if (it.def !== undefined) it.def = Math.max(1, idiv(75 * it.def, 100));
      if (it.maxDur) it.dur = it.maxDur = Math.max(1, idiv(b.dur, 3));
      return it;
    }
    it.q = 'normal';
    return it;
  }

  // rollDrop [D2MOO Items.cpp D2GAME_DropTC_6FC51360]:
  //  * positive Picks: each pick rolls rand(sum(Prob)+NoDrop); below NoDrop = nothing.
  //  * negative Picks: deterministic, the k-th pick takes the entry whose cumulative Prob covers k.
  //  * nested TCs inherit the larger Unique/Set/Rare/Magic modifiers; at most 6 items per kill.
  //  * single player: NoDrop as in the table (players=1).
  //  * gold = rand(5*ilvl) + ilvl, scaled by "mul" (x/256) [D2MOO D2GAME_InitItemStats_6FC4E520]
  function rollDrop(monId, mlvl, r, opts) {
    var D = DATA();
    opts = opts || {};
    r = r || rng(1);
    var tcName = opts.tc;
    if (!tcName) {
      var su = D.superuniques[monId];
      var m = D.monsters[su ? su.cls : monId];
      if (!m && !su) throw new Error('monster not found: ' + monId);
      var kind = su ? 'unique' : (opts.kind || 'normal');
      tcName = su ? su.tc.n : m.d.n.tc[kind === 'champion' ? 1 : (kind === 'unique' ? 2 : (kind === 'quest' ? 3 : 0))] || m.d.n.tc[0];
    }
    var out = [], maxItems = opts.maxItems || 6, players = Math.max(1, opts.players || 1);
    function walk(name, q) {
      var tc = D.items.tcs[name];
      if (!tc) throw new Error('treasure class not found: ' + name);
      var mq = { unique: Math.max(q.unique, tc.unique || 0), set: Math.max(q.set, tc.set || 0), rare: Math.max(q.rare, tc.rare || 0), magic: Math.max(q.magic, tc.magic || 0) };
      // D2: child gets parent value unless the parent is 0 or the child is larger
      ['unique', 'set', 'rare', 'magic'].forEach(function (k) { mq[k] = (!q[k] || (tc[k] || 0) > q[k]) ? (tc[k] || 0) : q[k]; });
      var total = 0; tc.items.forEach(function (e) { total += e[1]; });
      var picks = tc.picks || 1;
      if (picks < 0) {
        var n = -picks;
        for (var k = 0; k < n && out.length < maxItems; k++) {
          var acc = 0;
          for (var i = 0; i < tc.items.length; i++) { acc += tc.items[i][1]; if (k < acc) { take(tc.items[i], mq); break; } }
        }
        return;
      }
      var nodrop = tc.nodrop || 0;
      if (nodrop && players > 1) {
        var base = nodrop / (total + nodrop), ratioN = Math.pow(base, players);
        nodrop = ratioN >= 1 ? nodrop : Math.floor(total / (1 - ratioN) * ratioN);
      }
      for (var p = 0; p < picks && out.length < maxItems; p++) {
        var x = rint(r, total + nodrop);
        if (x < nodrop) continue;
        x -= nodrop;
        for (var j = 0; j < tc.items.length; j++) { if (x < tc.items[j][1]) { take(tc.items[j], mq); break; } x -= tc.items[j][1]; }
      }
    }
    function take(e, q) {
      var code = e[0];
      if (D.items.tcs[code]) return walk(code, q);
      if (code === 'gld') {
        var amt = Math.max(1, rint(r, 5 * mlvl) + mlvl);
        if (e[2]) amt = (amt * e[2]) >> 8;
        out.push({ base: 'gld', ilvl: mlvl, q: 'normal', affixes: [], gold: amt, w: 1, h: 1, icon: 'gold', name: amt + ' Gold' });
        return;
      }
      var b = D.items.bases[code];
      if (!b) { out.push({ base: code, ilvl: mlvl, q: 'normal', affixes: [], w: 1, h: 1, icon: 'unknown', missing: true }); return; }
      var quality = rollQuality(b, mlvl, r, q, opts.mf || 0);
      out.push(createItem(code, mlvl, quality, r));
    }
    walk(tcName, { unique: 0, set: 0, rare: 0, magic: 0 });
    return out;
  }

  // ------------------------------------------------------------------ item text
  var PROP_TEXT = {
    'ac': '+# Defense', 'ac%': '+#% Enhanced Defense', 'ac-miss': '+# Defense vs. Missile', 'ac-hth': '+# Defense vs. Melee',
    'ac/lvl': '+# Defense (Based on Character Level)', 'att': '+# to Attack Rating', 'att%': '+#% Bonus to Attack Rating',
    'att-demon': '+# to Attack Rating against Demons', 'att-undead': '+# to Attack Rating against Undead',
    'dmg%': '+#% Enhanced Damage', 'dmg-min': '+# to Minimum Damage', 'dmg-max': '+# to Maximum Damage', 'dmg-norm': 'Adds #-$ Damage',
    'dmg-fire': 'Adds #-$ Fire Damage', 'dmg-ltng': 'Adds #-$ Lightning Damage', 'dmg-cold': 'Adds #-$ Cold Damage',
    'dmg-pois': 'Adds #-$ Poison Damage', 'dmg-mag': 'Adds #-$ Magic Damage', 'dmg-demon': '+#% Damage to Demons', 'dmg-undead': '+#% Damage to Undead',
    'fire-min': '+# to Minimum Fire Damage', 'fire-max': '+# to Maximum Fire Damage', 'ltng-min': '+# to Minimum Lightning Damage',
    'ltng-max': '+# to Maximum Lightning Damage', 'cold-min': '+# to Minimum Cold Damage', 'cold-max': '+# to Maximum Cold Damage',
    'cold-len': 'Cold duration # frames', 'pois-min': '+# to Minimum Poison Damage', 'pois-max': '+# to Maximum Poison Damage', 'pois-len': 'Poison duration # frames',
    'str': '+# to Strength', 'dex': '+# to Dexterity', 'vit': '+# to Vitality', 'enr': '+# to Energy', 'hp': '+# to Life', 'mana': '+# to Mana',
    'stam': '+# Maximum Stamina', 'regen': 'Replenish Life +#', 'regen-mana': 'Regenerate Mana #%', 'regen-stam': 'Heal Stamina Plus #%',
    'res-fire': 'Fire Resist +#%', 'res-cold': 'Cold Resist +#%', 'res-ltng': 'Lightning Resist +#%', 'res-pois': 'Poison Resist +#%',
    'res-all': 'All Resistances +#', 'res-fire-max': '+#% to Maximum Fire Resist', 'res-cold-max': '+#% to Maximum Cold Resist',
    'res-pois-max': '+#% to Maximum Poison Resist', 'res-all-max': '+#% to All Maximum Resistances', 'res-pois-len': 'Poison Length Reduced by #%',
    'light': '+# to Light Radius', 'thorns': 'Attacker Takes Damage of #', 'light-thorns': 'Attacker Takes Lightning Damage of #',
    'lifesteal': '#% Life stolen per hit', 'manasteal': '#% Mana stolen per hit', 'gold%': '#% Extra Gold from Monsters',
    'mag%': '#% Better Chance of Getting Magic Items', 'swing1': '+#% Increased Attack Speed', 'swing2': '+#% Increased Attack Speed',
    'swing3': '+#% Increased Attack Speed', 'move1': '+#% Faster Run/Walk', 'move2': '+#% Faster Run/Walk', 'move3': '+#% Faster Run/Walk',
    'balance1': '+#% Faster Hit Recovery', 'balance2': '+#% Faster Hit Recovery', 'balance3': '+#% Faster Hit Recovery',
    'block': '#% Increased Chance of Blocking', 'block2': '+#% Faster Block Rate', 'cast1': '+#% Faster Cast Rate', 'cast2': '+#% Faster Cast Rate',
    'cast3': '+#% Faster Cast Rate', 'red-dmg': 'Damage Reduced by #', 'red-mag': 'Magic Damage Reduced by #', 'knock': 'Knockback',
    'howl': 'Hit Causes Monster to Flee #%', 'stupidity': 'Hit Blinds Target', 'slow': 'Slows Target by #%', 'freeze': 'Freezes Target',
    'half-freeze': 'Half Freeze Duration', 'nofreeze': 'Cannot Be Frozen', 'ease': 'Requirements #%', 'dur': '+# Durability', 'rep-dur': 'Repairs Durability',
    'rep-quant': 'Replenishes Quantity', 'stack': 'Increased Stack Size', 'sock': 'Socketed (#)', 'ignore-ac': 'Ignore Target\'s Defense',
    'crush': '#% Chance of Crushing Blow', 'deadly': '#% Deadly Strike', 'openwounds': '#% Chance of Open Wounds', 'mana-kill': '+# to Mana after each Kill',
    'reduce-ac': '-#% Target Defense', 'noheal': 'Prevent Monster Heal', 'pierce': '#% Pierce', 'bar': '+# to Barbarian Skill Levels',
    'sor': '+# to Sorceress Skill Levels', 'nec': '+# to Necromancer Skill Levels', 'pal': '+# to Paladin Skill Levels', 'allskills': '+# to All Skills',
    'dmg-to-mana': '#% Damage Taken Goes To Mana', 'stamdrain': 'Slower Stamina Drain #%', 'bloody': 'Bloody',
  };
  function itemName(item) {
    var b = DATA().items.bases[item.base];
    var n = b ? b.name : item.base;
    if (item.base === 'gld') return (item.gold || 0) + ' Gold';
    switch (item.q) {
      case 'magic': return [item.prefix, n, item.suffix].filter(Boolean).join(' ');
      case 'rare': return item.rareName ? item.rareName + '\n' + n : n;
      case 'unique': case 'set': return item.uniqueName ? item.uniqueName + '\n' + n : n;
      case 'superior': return 'Superior ' + n;
      case 'low': return (item.lowName || 'Low Quality') + ' ' + n;
      default: return n;
    }
  }
  function itemStats(item) {
    var b = DATA().items.bases[item.base], lines = [];
    if (!b) return lines;
    if (b.kind === 'weapon') {
      var mn = item.dmgMin || (b.twoHanded && b.mindam2h ? b.mindam2h : b.mindam), mx = item.dmgMax || (b.twoHanded && b.maxdam2h ? b.maxdam2h : b.maxdam);
      lines.push((b.twoHanded ? 'Two-Hand' : 'One-Hand') + ' Damage: ' + mn + ' to ' + mx);
      if (b.minmis) lines.push('Throw Damage: ' + b.minmis + ' to ' + b.maxmis);
    }
    if (item.def !== undefined) lines.push('Defense: ' + item.def);
    if (b.block) lines.push('Chance to Block: ' + b.block + '%');
    if (item.maxDur) lines.push('Durability: ' + item.dur + ' of ' + item.maxDur);
    if (item.qty) lines.push('Quantity: ' + item.qty);
    if (b.reqdex) lines.push('Required Dexterity: ' + b.reqdex);
    if (b.reqstr) lines.push('Required Strength: ' + b.reqstr);
    var rl = Math.max(item.reqlvl || 0, b.reqlvl || 0);
    if (rl > 1) lines.push('Required Level: ' + rl);
    if (b.kind === 'misc' && b.stat) {
      var pe = potionEffect(item, null);
      if (pe.hp) lines.push('Heals ' + pe.hp + ' Life over ' + pe.seconds + ' seconds');
      if (pe.mp) lines.push('Restores ' + pe.mp + ' Mana over ' + pe.seconds + ' seconds');
      if (pe.hpPct) lines.push('Heals ' + pe.hpPct + '% Life and Mana');
    }
    (item.affixes || []).forEach(function (a) {
      var v = a.onItem !== undefined ? a.onItem : a.val;
      if (a.stat === 'dmg%' && !v) return;
      var f = PROP_TEXT[a.stat];
      var txt = f ? f.replace('#', v).replace('$', a.val2 !== undefined ? a.val2 : '') : a.stat + ' ' + v;
      if (a.param !== undefined && (a.stat === 'skill' || a.stat === 'hit-skill' || a.stat === 'gethit-skill' || a.stat === 'charged')) txt = a.stat + ' ' + a.param + ' ' + v;
      lines.push(txt);
    });
    return lines;
  }

  // potions [TXT misc.txt stat1/calc1/len; class multiplier AS items/potions]: heal `calc*pct/100` over `len` frames
  function potionEffect(item, char) {
    var b = DATA().items.bases[item.base];
    if (!b || b.kind !== 'misc') return {};
    var c = char ? classOf(char.cls) : { potionPct: { hp: 100, mp: 100 } };
    if (b.type === 'hpot') return { hp: Math.floor(b.calc * c.potionPct.hp / 100), seconds: (b.lenFrames || 0) / FPS, perSecond: b.calc * c.potionPct.hp / 100 / ((b.lenFrames || 1) / FPS) };
    if (b.type === 'mpot') return { mp: Math.floor(b.calc * c.potionPct.mp / 100), seconds: (b.lenFrames || 0) / FPS, perSecond: b.calc * c.potionPct.mp / 100 / ((b.lenFrames || 1) / FPS) };
    if (b.type === 'rpot') return { hpPct: b.calc, mpPct: b.calc2 || b.calc, seconds: 0 };
    return {};
  }

  // ------------------------------------------------------------------ export
  var D2R = {
    FPS: FPS, rng: rng, rint: rint, evalCalc: evalCalc,
    newCharacter: newCharacter, derived: derived, hitChance: hitChance, applyResist: applyResist,
    rollMonster: rollMonster, grantXp: grantXp, xpGain: xpGain, xpToReach: xpToReach, levelForXp: levelForXp,
    spendStat: spendStat, canLearn: canLearn, learnSkill: learnSkill, skillTree: skillTree,
    skillEffect: skillEffect, manaCost: function (id, L) { return manaCost(findSkill(id), L); },
    rollDrop: rollDrop, makeItem: makeItem, createItem: createItem, rollQuality: rollQuality, affixLevel: affixLevel,
    itemName: itemName, itemStats: itemStats, potionEffect: potionEffect,
    completeQuest: completeQuest, deathPenalty: deathPenalty, goldLimit: goldLimit,
  };
  g.D2R = D2R;
  if (typeof module !== 'undefined' && module.exports) module.exports = D2R;
})(typeof window !== 'undefined' ? window : globalThis);
