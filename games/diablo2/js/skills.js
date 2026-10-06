/* Ác Quỷ II - skills.js (window.D2S)
 * Chạy các kỹ năng lớp mà game.js không tự làm: triệu hồi, lời nguyền, hào quang, biến hình, bẫy, võ thuật tích lực,
 * chiến hống, nhảy/lao/dịch chuyển, kỹ năng xác, bùa thân và vài phép vùng (tường lửa, thiên thạch, bão tuyết...).
 * Số liệu lấy từ D2R.skillEffect (bảng 3.1); mọi chỗ ước lượng ghi "approx:".
 * Giao diện với game.js: handles, instant, instantCast, apply, update, modDerived (game.js gọi sẵn) và các móc
 * onMonDamage, onHeroDamage, isFriend, draw, drawUnit (game.js cần thêm dòng gọi, xem báo cáo).
 */
(function (g) {
  'use strict';
  var FPS = 25;
  var D2S = {};
  var BEHAVIOUR = {
    summon: 1, wall: 1, curse: 1, aura: 1, warcry: 1, shapeshift: 1, charge: 1, finisher: 1, corpse: 1, bomb: 1,
    leap: 1, teleport: 1, rush: 1, whirlwind: 1, buff: 1, multi: 1, hit: 1, form: 1,
    firewall: 1, meteor: 1, blizzard: 1, chain: 1, fist: 1, fissure: 1, volcano: 1, static: 1, tk: 1, throw2: 1,
  };
  // pettype groups: one summon replaces the oldest when the group is full; these instead refuse (D2 raise/revive)
  var REFUSE_WHEN_FULL = { skeleton: 1, skeletonmage: 1, revive: 1 };
  var STAYS_ON_AREA_CHANGE = { skeleton: 1, skeletonmage: 1, golem: 1, revive: 1, valkyrie: 1, spiritwolf: 1, fenris: 1, grizzly: 1, totem: 1, vine: 1, shadowwarrior: 1 };
  var ARMOR_GROUP = { frozen_armor: 1, shiver_armor: 1, chilling_armor: 1 };   // D2: one cold armor at a time
  var ELCOL = { fire: '#ff8a3c', cold: '#7fd0ff', light: '#ffee66', poison: '#7fdf5f', magic: '#c9a0ff', phys: '#fff' };
  var PASSIVE_STATS = ['penetrate', 'iron_skin', 'natural_resistance', 'increased_speed', 'increased_stamina', 'weapon_block', 'pierce', 'avoid', 'evade'];

  function R() { return g.D2R; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function roll(d) { return d ? rnd(d.min || 0, (d.max || 0) + 0.999) : 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function elemOf(e) { e = String(e || 'phys').toLowerCase(); return /fire/.test(e) ? 'fire' : /cold|ice/.test(e) ? 'cold' : /light|ltng/.test(e) ? 'light' : /pois/.test(e) ? 'poison' : /mag/.test(e) ? 'magic' : 'phys'; }
  function dead(e) { return !e || e.removed || e.st === 'die' || e.st === 'dead' || e.hp <= 0; }
  // hostile to the hero: plain monsters and monsters D2S drives for a while (confused, blinded, lured)
  function isEnemy(e) { return e.kind === 'mon' && (!e.ally || e.hostile) && !dead(e); }
  function isPet(e) { return e.kind === 'mon' && e.ally && !e.hostile; }
  D2S.isFriend = function (e) { return !!(e && e.kind === 'mon' && e.ally && !e.hostile); };

  function st(api) {
    var S = api.S;
    if (!S.d2s || S.d2s.char !== S.char) {
      S.d2s = { char: S.char, aura: null, auraFx: null, auraT: 0, buffs: {}, form: null, charges: {}, rage: null, pets: [], zones: [], fx: [], move: null, grid: S.grid, fxCache: {}, cacheT: -1, pending: [], tickT: 0 };
    }
    return S.d2s;
  }
  function lvlOf(api, id) { var c = api.S.char; return (c && c.skills && c.skills[id]) || 0; }
  function fxOf(api, id, lvl) {
    var s = st(api), k = id + ':' + lvl;
    if (s.cacheT !== api.S.time) { s.cacheT = api.S.time; }
    if (!s.fxCache[k] || s.fxCache[k].t < api.S.time - 1) s.fxCache[k] = { t: api.S.time, fx: R().skillEffect(id, lvl, api.S.char) };
    return s.fxCache[k].fx;
  }
  function msg(api, t, c) { if (api.UI && api.UI.msg) api.UI.msg(t, c); }
  function sfx(api, names, v) { try { if (api.E && api.E.sfx) api.E.sfx(names, v || 0.4); } catch (e) { /* tiếng chỉ là phụ */ } }
  function hasSheet(api, k) { return !!(k && api.E && api.E.hasSheet && api.E.hasSheet(k)); }
  function misArt(api, id) { return id && hasSheet(api, 'mis.' + id) ? 'mis.' + id : null; }

  /* ------------------------------------------------------------------ hiệu ứng hình (kind 'd2sfx', vẽ bằng D2S.draw) */
  function addFx(api, o) {
    var e = api.mk('d2sfx', o.x, o.y, { art: o.art || null, t0: api.S.time, until: api.S.time + (o.life || 0.6), follow: o.follow || null, lift: o.lift || 0, loop: !!o.loop, ring: o.ring || 0, color: o.color || null, pts: o.pts || null, alpha: o.alpha == null ? 1 : o.alpha, owner: o.owner || null, vx: o.vx || 0, vy: o.vy || 0, dir: o.dir || 0 });
    st(api).fx.push(e);
    return e;
  }
  // vòng sáng game.js đã vẽ được sẵn (kind 'fx'), dùng làm phản hồi khi thiếu móc vẽ d2sfx
  function ring(api, x, y, r, color, life) { api.mk('fx', x, y, { t: 0, life: life || 0.45, ring: r, color: color || '#fff' }); }
  function overlay(api, unit, arts, until, lift) {
    (arts || []).forEach(function (a) { if (hasSheet(api, a)) addFx(api, { x: unit.x, y: unit.y, art: a, follow: unit, life: until - api.S.time, loop: true, lift: lift || 0 }); });
  }
  function dropOverlays(api, unit, prefix) {
    st(api).fx.forEach(function (f) { if (f.follow === unit && (!prefix || (f.art && f.art.indexOf(prefix) === 0))) f.until = 0; });
  }

  /* ------------------------------------------------------------------ chọn mục tiêu */
  function enemies(api) { return api.S.ents.filter(isEnemy); }
  function within(api, x, y, r) { return enemies(api).filter(function (m) { return Math.hypot(m.x - x, m.y - y) <= r; }); }
  function nearestEnemy(api, x, y, r, skip) {
    var best = null, bd = r;
    api.S.ents.forEach(function (m) { if (isEnemy(m) && m !== skip) { var d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } } });
    return best;
  }
  function corpses(api) { return api.S.ents.filter(function (m) { return m.kind === 'mon' && m.st === 'dead' && !m.removed && !m.ally && !m.d2sUsed && m.inst; }); }
  function nearestCorpse(api, x, y, r) {
    var best = null, bd = r;
    corpses(api).forEach(function (m) { var d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } });
    return best;
  }
  function openNear(api, x, y, r) {
    if (api.canStand(x, y, 0.3)) return [x, y];
    for (var k = 1; k <= 12; k++) for (var a = 0; a < 8; a++) {
      var px = x + Math.cos(a * 0.785) * k * (r || 0.6), py = y + Math.sin(a * 0.785) * k * (r || 0.6);
      if (api.canStand(px, py, 0.3)) return [px, py];
    }
    return [x, y];
  }
  function meleeTarget(api, act) {
    var h = api.S.hero, t = act.target;
    if (t && !dead(t) && isEnemy(t) && dist(t, h) <= 4.8) return t;
    var a = Math.atan2(act.ty - h.y, act.tx - h.x), p = { x: h.x + Math.cos(a) * 1.8, y: h.y + Math.sin(a) * 1.8 };
    var best = nearestEnemy(api, p.x, p.y, 4.2);
    return best && dist(best, h) <= 4.8 ? best : null;
  }

  /* ------------------------------------------------------------------ trạng thái quái (lời nguyền, hào quang, chiến hống) */
  function cp(o) { return o ? JSON.parse(JSON.stringify(o)) : o; }
  function mstate(m) {
    if (!m.d2s) {
      var i = m.inst || {};
      m.d2s = { base: { speed: m.speed, a1: cp(i.a1), a2: cp(i.a2), dmg: cp(i.dmg), mdmg: i.missile ? cp(i.missile.dmg) : null, def: i.def, ac: i.ac, ar: i.ar, res: cp(i.res) || {} }, curse: null, cry: null, aura: null, ward: null, slowPct: 0, slowUntil: 0 };
    }
    return m.d2s;
  }
  function sumStat(ms, k) {
    var v = 0;
    [ms.curse && ms.curse.stats, ms.cry, ms.aura, ms.ward].forEach(function (s) { if (s && s[k]) v += s[k]; });
    return v;
  }
  function refreshMon(api, m) {
    var ms = m.d2s, b = ms.base, i = m.inst; if (!i) return;
    var slow = ms.slowUntil > api.S.time ? ms.slowPct : 0;
    m.speed = b.speed * Math.max(10, 100 + sumStat(ms, 'velocitypercent') - slow) / 100;
    var dp = sumStat(ms, 'damagepercent'), ap = sumStat(ms, 'item_tohit_percent');
    var sc = function (a) { return a && { min: Math.floor(a.min * (100 + dp) / 100), max: Math.floor(a.max * (100 + dp) / 100), ar: a.ar != null ? Math.floor(a.ar * (100 + ap) / 100) : a.ar }; };
    if (b.a1) i.a1 = sc(b.a1);
    if (b.a2) i.a2 = sc(b.a2);
    if (b.dmg) i.dmg = sc(b.dmg);
    if (i.missile && b.mdmg) i.missile.dmg = sc(b.mdmg);
    if (b.ar != null) i.ar = Math.floor(b.ar * (100 + ap) / 100);
    var defPct = sumStat(ms, 'skill_armor_percent'), defFlat = sumStat(ms, 'armorclass');
    if (b.def != null) i.def = Math.max(0, Math.floor((b.def + defFlat) * (100 + defPct) / 100));
    if (b.ac != null) i.ac = i.def;
    var res = cp(b.res) || {};
    [['fireresist', 'fire'], ['coldresist', 'cold'], ['lightresist', 'light'], ['poisonresist', 'poison']].forEach(function (p) {
      var d = sumStat(ms, p[0]); if (!d) return;
      var r0 = res[p[1]] || 0;
      res[p[1]] = r0 >= 100 && d < 0 ? r0 + d / 5 : r0 + d;   // [AS] Lower Resist/Conviction cut immunities at 1/5 strength
    });
    i.res = res;
  }
  function stun(api, m, sec) { if (sec > 0 && !dead(m)) m.spawnT = Math.max(m.spawnT || 0, sec * 1000); }
  function slow(api, m, pct, sec) { var ms = mstate(m); ms.slowPct = Math.max(pct, ms.slowUntil > api.S.time ? ms.slowPct : 0); ms.slowUntil = api.S.time + sec; }
  // D2S lái AI của quái trong một lúc: game.js bỏ qua AI khi ally = true, hostile giữ nó là địch của hero
  function control(api, m, mode, until, tgt) {
    if (dead(m) || m.boss || (m.inst && m.inst.boss)) return;
    m.ally = true; m.hostile = true; m.ctl = mode; m.ctlUntil = until; m.lureTgt = tgt || null;
  }
  function release(api, m) {
    if (!m.ctl) return;
    m.ctl = null; m.lureTgt = null;
    if (m.converted) { m.converted = false; }
    m.ally = false; m.hostile = false; m.aggro = true; m.act = null;
    if (m.st === 'attack' || m.st === 'cast' || m.st === 'walk' || m.st === 'run') api.setSt(m, 'idle');
  }
  function clearCurse(api, m) {
    var ms = mstate(m); if (!ms.curse) return;
    if (m.ctl === 'confuse' || m.ctl === 'blind') release(api, m);
    dropOverlays(api, m, 'ovl.curse');
    ms.curse = null;
  }

  /* ------------------------------------------------------------------ hero: đánh, hồi máu */
  function hitChance(api, t, arPct) {
    var S = api.S, ar = S.d.ar * (100 + (arPct || 0)) / 100;
    try { return R().hitChance(ar, S.char.lvl, (t.inst && t.inst.def) || 0, (t.inst && t.inst.lvl) || 1); } catch (e) { return 0.75; }
  }
  function heal(api, hp, mp) {
    var c = api.S.char, d = api.S.d;
    if (hp) c.hp = Math.min(d.maxHp, c.hp + hp);
    if (mp) c.mp = Math.min(d.maxMp, c.mp + mp);
  }
  // một đòn vũ khí của hero: o = { dmgPct, addMin, addMax, elem, arPct, always, lifeStealPct, manaStealPct, weaponPct }
  function strike(api, t, o) {
    var S = api.S, d = S.d;
    if (!t || dead(t)) return 0;
    if (!o.always && Math.random() >= hitChance(api, t, o.arPct)) { api.floatText(t.x, t.y, 'miss', '#aaa'); return 0; }
    var phys = roll({ min: d.dmgMin, max: d.dmgMax }) * (o.weaponPct || 100) / 100 * (100 + (o.dmgPct || 0)) / 100 + rnd(o.addMin || 0, (o.addMax || 0) + 0.999);
    var hpBefore = t.hp;
    api.damageMon(t, phys, 'phys', true);
    if (o.elem && o.elem.max > 0 && !dead(t)) api.damageMon(t, roll(o.elem), o.elem.type, true);
    var dealt = Math.max(0, hpBefore - Math.max(0, t.hp));
    if (o.lifeStealPct) heal(api, dealt * o.lifeStealPct / 100, 0);
    if (o.manaStealPct) heal(api, 0, dealt * o.manaStealPct / 100);
    return dealt || phys;
  }
  function actDur(api, kind) {
    var S = api.S, cd = g.D2DATA && D2DATA.classes[S.char.cls];
    var f = (kind === 'cast' ? (S.d.castFrames || (cd && cd.frames && cd.frames.spell) || S.d.atkFrames) : S.d.atkFrames) || 15;
    return clamp(f / FPS * 1000, 280, 1600);
  }
  function heroMode(api, fx, kind) {
    var want = fx && fx.anim ? fx.anim : kind === 'cast' ? 'SC' : 'A1', look = api.heroLook();
    if (want === 'SQ' || /^S[1-4]$/.test(want) || want === 'TH') want = kind === 'cast' ? 'SC' : 'A1';
    if (!api.E.heroCof || !api.E.heroCof(look, want)) want = kind === 'cast' && api.E.heroCof && api.E.heroCof(look, 'SC') ? 'SC' : 'A1';
    return want;
  }
  function beginAnim(api, skillId, fx, tx, ty, target, kind, durMul, done) {
    var h = api.S.hero, dur = actDur(api, kind) * (durMul || 1);
    var dx = tx - h.x, dy = ty - h.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.01) h.dir = api.E.dirFromTiles(dx, dy);
    h.act = { skill: skillId, fx: fx, tx: tx, ty: ty, target: target || null, done: !!done, kind: kind, dur: dur, mode: heroMode(api, fx, kind) };
    api.restart(h, kind, dur);
    return h.act;
  }

  /* ------------------------------------------------------------------ giao diện chính */
  D2S.handles = function (fx) { return !!(fx && fx.d2s && BEHAVIOUR[fx.d2s]); };
  D2S.instant = function (fx) { return D2S.handles(fx); };

  D2S.instantCast = function (api, skillId, fx, tx, ty, target) {
    var S = api.S, c = S.char, s = st(api), h = S.hero, b = fx.d2s;
    // biến hình: kỹ năng sói/gấu tự biến (restrict 2), phép thường không dùng được khi đang biến (restrict 0)
    if (fx.restrict === 2 && fx.needForm && (!s.form || s.form.form !== fx.needForm)) {
      var shiftId = fx.needForm === 'wolf' ? 'werewolf' : 'werebear';
      if (!lvlOf(api, shiftId)) { msg(api, 'Cần học ' + (fx.needForm === 'wolf' ? 'Werewolf' : 'Werebear') + ' trước.'); return false; }
      shapeshift(api, fxOf(api, shiftId, lvlOf(api, shiftId)));
    }
    if (s.form && !fx.restrict && b !== 'shapeshift') { msg(api, 'Không dùng được khi đang biến hình.'); return false; }
    if (b === 'aura') {
      if (s.aura === skillId) return false;
      setAura(api, skillId); return true;
    }
    if (b === 'shapeshift' && s.form && s.form.id === skillId) {
      if (S.time - s.form.since < 1) return false;
      unshift(api); return true;
    }
    if (fx.mana && c.mp < fx.mana) { msg(api, 'Không đủ mana.', '#8ab0ff'); sfx(api, ['no_mana'], 0.5); return false; }
    // kiểm tra trước khi trừ mana: triệu hồi cần xác / đủ số
    if (b === 'summon' && !canSummon(api, fx, tx, ty)) return false;
    if (b === 'corpse' && !nearestCorpse(api, tx, ty, 6) && !nearestCorpse(api, h.x, h.y, 10)) { msg(api, 'Cần một xác quái gần đó.'); return false; }
    if (b === 'finisher' && fx.id !== 'dragon_flight') { /* đá kết liễu vẫn đánh khi không có nạp lực */ }
    c.mp -= fx.mana || 0;
    if (b === 'leap' || b === 'rush' || b === 'whirlwind' || (b === 'finisher' && fx.id === 'dragon_flight')) return startMove(api, skillId, fx, tx, ty, target);
    var kind = fx.kind === 'melee' ? 'attack' : 'cast';
    var mul = fx.hit && fx.hit.hits > 1 ? Math.min(2.2, 0.6 + fx.hit.hits * 0.35) : 1;   // approx: Zeal/Fury play one sequence for all hits
    beginAnim(api, skillId, fx, tx, ty, target, kind, mul, false);
    if (fx.castOverlay && hasSheet(api, fx.castOverlay)) addFx(api, { x: h.x, y: h.y, art: fx.castOverlay, follow: h, life: 0.8 });
    sfx(api, kind === 'attack' ? ['melee_attack', 'melee_attack_2'] : ['power_cast', 'power_shield'], 0.4);
    return true;
  };

  D2S.apply = function (api, act) {
    var fx = act.fx, b = fx && fx.d2s;
    act.done = true;
    switch (b) {
      case 'summon': case 'wall': return doSummon(api, act);
      case 'curse': return doCurse(api, act);
      case 'warcry': return doWarcry(api, act);
      case 'shapeshift': return shapeshift(api, fx);
      case 'charge': return doChargeHit(api, act);
      case 'finisher': return doFinisher(api, act, meleeTarget(api, act));
      case 'corpse': return doCorpse(api, act);
      case 'bomb': return doBomb(api, act);
      case 'teleport': return doTeleport(api, act);
      case 'buff': return doBuff(api, act);
      case 'multi': case 'hit': case 'form': return doHit(api, act);
      default: return doArea(api, act);
    }
  };

  /* ------------------------------------------------------------------ triệu hồi */
  function petGroup(api, pettype) {
    var s = st(api);
    s.pets = s.pets.filter(function (p) { return !p.removed && p.st !== 'dead' && p.st !== 'die'; });
    return s.pets.filter(function (p) { return p.pet && p.pet.pettype === pettype; });
  }
  function canSummon(api, fx, tx, ty) {
    var sm = fx.summon, h = api.S.hero;
    if (sm.needsCorpse && !nearestCorpse(api, tx, ty, 6) && !nearestCorpse(api, h.x, h.y, 10)) { msg(api, 'Cần một xác quái gần đó.'); return false; }
    if (fx.id === 'revive') {
      var cps = nearestCorpse(api, tx, ty, 6) || nearestCorpse(api, h.x, h.y, 10);
      if (cps && (cps.inst.boss || cps.rank === 'unique')) { msg(api, 'Không hồi sinh được trùm.'); return false; }
    }
    if (REFUSE_WHEN_FULL[sm.pettype] && petGroup(api, sm.pettype).length >= sm.max) { msg(api, 'Đã đủ số lượng (' + sm.max + ').'); return false; }
    return true;
  }
  function petArt(api, code, fallbackMon) {
    var k = code && 'mon.' + String(code).toUpperCase();
    // K9 is monstats' 1x1 placeholder (vines, shadows); drawing it would make the summon invisible
    if (k !== 'mon.K9' && hasSheet(api, k)) return k;
    if (fallbackMon) return fallbackMon;
    return null;
  }
  function aiKindOf(fx) {
    var id = fx.id;
    if (/sentry|wake_of/.test(id)) return 'trap';
    if (id === 'blade_sentinel') return 'blade';
    if (id === 'hydra' || id === 'raise_skeletal_mage') return 'ranged';
    if (id === 'raven') return 'raven';
    if (/^(oak_sage|heart_of_wolverine|spirit_of_barbs)$/.test(id)) return 'totem';
    if (id === 'carrion_vine' || id === 'solar_creeper') return 'vine';
    if (id === 'decoy') return 'decoy';
    if (fx.d2s === 'wall') return 'wall';
    return 'melee';
  }
  var VALK_LOOK = { cls: 'AM', wclass: '2HT', tok: { HD: 'GHM', TR: 'HVY', LG: 'HVY', RA: 'HVY', LA: 'HVY', S1: 'HVY', S2: 'HVY', RH: 'SPR' } };
  function makePet(api, fx, monId, x, y, extra) {
    var S = api.S, sm = fx.summon, e = api.makeMonster(monId, x, y, 'normal', -1, Math.random, null);
    e.ally = true; e.hostile = false; e.aggro = false; e.act = null; e.flee = 0; e.spawnT = 0;
    var inst = {
      id: monId, name: fx.name, lvl: sm.lvl || S.char.lvl, hp: sm.hp, maxHp: sm.hp, ac: sm.ac, def: sm.ac, ar: sm.ar,
      a1: { min: (sm.dmg && sm.dmg.min) || 0, max: (sm.dmg && sm.dmg.max) || 0, ar: sm.ar }, a2: sm.a2 ? { min: sm.a2.min, max: sm.a2.max, ar: sm.ar } : null,
      dmg: { min: (sm.dmg && sm.dmg.min) || 0, max: (sm.dmg && sm.dmg.max) || 0 }, res: cp(sm.res) || {}, xp: 0,
    };
    e.inst = inst; e.hp = e.maxHp = Math.max(1, sm.hp || 1);
    e.speed = clamp(sm.vel || 0, 0, 14);
    e.art = petArt(api, sm.code, null);
    e.name = fx.name;
    // monsters/vk của D2R chỉ có DCC giả 65 byte; Valkyrie vẽ bằng thân Amazon giáp nặng cầm giáo, như dáng của nó trong D2
    if (fx.id === 'valkyrie') { e.art = null; api.E.ensureHero('AM'); }
    e.pet = { look: fx.id === 'valkyrie' ? VALK_LOOK : null, skill: fx.id, pettype: sm.pettype, ai: aiKindOf(fx), born: S.time, until: sm.durationSec ? S.time + sm.durationSec : 0, cd: 0.4, sm: sm, shots: sm.shots || 0, hits: sm.hits || 0, retarget: 0, tgt: null };
    if (extra) for (var k in extra) e.pet[k] = extra[k];
    st(api).pets.push(e);
    return e;
  }
  function doSummon(api, act) {
    var S = api.S, fx = act.fx, sm = fx.summon, h = S.hero, s = st(api);
    var group = petGroup(api, sm.pettype);
    // golem/totem/vine dùng chung nhóm: gọi cái mới thì cái cũ biến mất [AS]
    while (group.length >= sm.max) { var old = group.shift(); killPet(api, old, true); }
    if (fx.id === 'revive' || sm.needsCorpse) {
      var corpse = nearestCorpse(api, act.tx, act.ty, 6) || nearestCorpse(api, h.x, h.y, 10);
      if (!corpse) { msg(api, 'Cần một xác quái gần đó.'); return; }
      corpse.d2sUsed = true; corpse.removed = true;
      if (fx.id === 'revive') return revive(api, fx, corpse);
      var p = makePet(api, fx, sm.mon, corpse.x, corpse.y);
      if (fx.id === 'raise_skeletal_mage') p.pet.mage = sm.mageElems[Math.floor(Math.random() * sm.mageElems.length)];
      if (p.pet.mage) p.art = api.monArt('skmage_' + ({ poison: 'pois', cold: 'cold', fire: 'fire', light: 'ltng' })[p.pet.mage.type] + '1') || p.art;
      p.spawnT = 0; api.restart(p, 'idle', 0);
      addFx(api, { x: p.x, y: p.y, art: misArt(api, 'revivesmall') || 'ovl.cast_undead', life: 0.8 });
      return;
    }
    if (fx.d2s === 'wall') return boneWall(api, fx, act);
    var atTarget = /^(trap)$/.test(fx.kind) || fx.id === 'hydra';
    var bx = atTarget ? act.tx : h.x + rnd(-1.5, 1.5), by = atTarget ? act.ty : h.y + rnd(-1.5, 1.5);
    if (atTarget && Math.hypot(bx - h.x, by - h.y) > 20) { var a = Math.atan2(by - h.y, bx - h.x); bx = h.x + Math.cos(a) * 20; by = h.y + Math.sin(a) * 20; }
    var pos = openNear(api, bx, by);
    if (fx.id === 'decoy') {
      var dp = makePet(api, fx, sm.mon, pos[0], pos[1]);
      dp.hp = dp.maxHp = Math.max(1, Math.floor(S.d.maxHp * (sm.hpFromCasterPct || 50) / 100 * (100 + (sm.hpPct || 0)) / 100));
      dp.pet.heroLook = true;
      return;
    }
    var p2 = makePet(api, fx, sm.mon, pos[0], pos[1]);
    if (fx.id === 'blade_sentinel') { p2.pet.ox = h.x; p2.pet.oy = h.y; p2.pet.ex = act.tx; p2.pet.ey = act.ty; p2.pet.dirSign = 1; }
    if (sm.copyHero) { var d = S.d; p2.inst.a1 = { min: d.dmgMin, max: d.dmgMax, ar: d.ar + (sm.ar || 0) }; p2.inst.dmg = { min: d.dmgMin, max: d.dmgMax }; p2.pet.heroLook = true; p2.speed = 9; }
    if (fx.id === 'raven') p2.pet.hitsLeft = sm.hits || 12;
    addFx(api, { x: p2.x, y: p2.y, art: hasSheet(api, 'ovl.dust') ? 'ovl.dust' : null, life: 0.6 });
    if (p2.pet.ai === 'totem') api.recalc();
  }
  function revive(api, fx, corpse) {
    var S = api.S, sm = fx.summon;
    var e = api.makeMonster(corpse.monId, corpse.x, corpse.y, 'normal', -1, Math.random, null);
    e.ally = true; e.hostile = false; e.aggro = false; e.act = null;
    e.hp = e.maxHp = Math.max(1, Math.floor(e.maxHp * (100 + (sm.hpPct || 0)) / 100));
    if (e.inst) {
      var k = (100 + (sm.dmgPct || 0)) / 100;
      ['a1', 'a2', 'dmg'].forEach(function (n) { if (e.inst[n]) { e.inst[n].min = Math.floor(e.inst[n].min * k); e.inst[n].max = Math.floor(e.inst[n].max * k); } });
      e.inst.xp = 0;
    }
    e.speed = clamp(e.speed * (100 + (sm.velPct || 0)) / 100, 1, 14);
    e.art = corpse.art; e.tint = '#9cf';
    e.pet = { skill: fx.id, pettype: 'revive', ai: corpse.ai === 'ranged' || corpse.ai === 'shaman' ? 'ranged' : 'melee', born: S.time, until: S.time + (sm.durationSec || 180), cd: 0.4, sm: sm, retarget: 0, tgt: null, monMissile: e.inst && e.inst.missile };
    st(api).pets.push(e);
    addFx(api, { x: e.x, y: e.y, art: misArt(api, 'revivemedium'), life: 0.9 });
  }
  function boneWall(api, fx, act) {
    var S = api.S, sm = fx.summon, h = S.hero, grid = S.grid, cells = [];
    var target = fx.id === 'bone_prison' ? (act.target && !dead(act.target) ? act.target : nearestEnemy(api, act.tx, act.ty, 5)) : null;
    var pts = [];
    if (target) {
      for (var a = 0; a < 12; a++) pts.push([target.x + Math.cos(a * Math.PI / 6) * 2.2, target.y + Math.sin(a * Math.PI / 6) * 2.2]);
    } else {
      var ang = Math.atan2(act.ty - h.y, act.tx - h.x) + Math.PI / 2, n = sm.segments || 8;
      for (var i = -n; i <= n; i++) pts.push([act.tx + Math.cos(ang) * i * 0.7, act.ty + Math.sin(ang) * i * 0.7]);
    }
    var segs = [];
    pts.forEach(function (p) {
      var cx = Math.floor(p[0]), cy = Math.floor(p[1]);
      if (cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h || grid.col[cy * grid.w + cx] !== 0) return;
      if (Math.hypot(cx + 0.5 - h.x, cy + 0.5 - h.y) < 1.2) return;
      var w = makePet(api, fx, sm.mon, cx + 0.5, cy + 0.5, { cell: cy * grid.w + cx, grid: grid });
      grid.col[w.pet.cell] = 2;   // ô bị chặn tạm (khác 1 = tường thật); trả lại 0 khi tường vỡ
      w.speed = 0; segs.push(w);
    });
    if (!segs.length) msg(api, 'Không đặt được tường ở đây.');
  }
  function killPet(api, p, quiet) {
    if (!p || p.st === 'die' || p.st === 'dead') return;
    p.hp = 0; p.act = null;
    if (p.pet && p.pet.cell != null && p.pet.grid && p.pet.grid.col[p.pet.cell] === 2) p.pet.grid.col[p.pet.cell] = 0;
    var an = p.art && api.E.animOf ? api.E.animOf(p.art, 'DT') : null;
    api.restart(p, 'die', quiet ? 200 : (an ? api.E.animDur(an) : 500));
    p.deadAt = api.S.time;
    if (p.pet && p.pet.skill === 'fire_golem' && !quiet) {   // FireGolem calc2/calc3: death explosion, approx 100% of its hit damage
      within(api, p.x, p.y, 6).forEach(function (m) { api.damageMon(m, roll(p.inst.a1), 'fire', false); });
      ring(api, p.x, p.y, 6, ELCOL.fire);
    }
  }
  function damageAlly(api, p, amount, src) {
    if (!p || dead(p)) return;
    if (p.pet && /^(trap|totem)$/.test(p.pet.ai) && p.pet.skill !== 'blade_sentinel') { /* bẫy và vật tổ vẫn nhận đòn như D2 */ }
    var dmg = Math.max(1, Math.round(amount * (1 - clamp(((p.inst && p.inst.res && p.inst.res.phys) || 0), -100, 95) / 100)));
    p.hp -= dmg; p.hitFlash = 0.12;
    api.floatText(p.x, p.y, String(dmg), '#ffb070');
    if (p.pet && p.pet.sm && p.pet.sm.thorns && src && isEnemy(src)) api.damageMon(src, p.pet.sm.thorns, 'phys', false); // Iron Golem
    if (p.hp <= 0) killPet(api, p);
  }

  /* ------------------------------------------------------------------ AI đồng minh và quái bị điều khiển */
  function stepTo(api, e, tx, ty, dt, mul) {
    var vx = tx - e.x, vy = ty - e.y, len = Math.hypot(vx, vy) || 1, sp = (e.speed || 6) * (mul || 1) * dt, ok = false;
    var ang = Math.atan2(vy, vx), offs = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
    for (var i = 0; i < offs.length; i++) {
      var dx = Math.cos(ang + offs[i]) * sp, dy = Math.sin(ang + offs[i]) * sp;
      if (e.pet && e.pet.sm && e.pet.sm.flying ? true : api.canStand(e.x + dx, e.y + dy, 0.3)) { e.x += dx; e.y += dy; ok = true; break; }
    }
    e.dir = api.E.dirFromTiles(vx / len, vy / len);
    api.setSt(e, ok ? 'run' : 'idle');
    return ok;
  }
  function attackAnim(api, e, tgt, kind) {
    var art = e.art, mode = kind === 'cast' ? ((api.E.pickAnim && api.E.pickAnim(art, ['SC', 'S1', 'A2', 'A1'])) || 'A1') : (api.E.animOf(art, 'A2') && Math.random() < 0.4 ? 'A2' : 'A1');
    var an = art ? api.E.animOf(art, mode) : null, dur = clamp(an ? api.E.animDur(an) : 600, 300, 1400);
    e.dir = api.E.dirFromTiles(tgt.x - e.x, tgt.y - e.y);
    e.act = { kind: kind === 'cast' ? 'shoot' : 'swing', done: true, mode: mode, d2sTgt: tgt, hitAt: an && an.hit > 0 ? an.hit / (an.frames || an.f.length) : 0.5 };
    api.restart(e, kind === 'cast' ? 'cast' : 'attack', dur);
    st(api).pending.push({ e: e, tgt: tgt, at: api.S.time + dur * e.act.hitAt / 1000, act: e.act, kind: kind });
    return dur;
  }
  // đòn của đồng minh/quái bị điều khiển rơi xuống: tới hero, tới đồng minh, hoặc tới quái
  function landHit(api, p) {
    var e = p.e, t = p.tgt, S = api.S;
    if (dead(e) || e.act !== p.act) return;
    if (!t || (t !== S.hero && dead(t))) return;
    if (t === S.hero) {
      if (S.hero.st === 'die' || S.hero.st === 'dead' || dist(e, t) > 4.2) return;
      var ph = hitChance2(e.inst.a1 && e.inst.a1.ar, e.inst.lvl, S.d.def, S.char.lvl);
      if (Math.random() < ph) api.damageHero(roll(e.inst.a1 || e.inst.dmg), e); else api.floatText(t.x, t.y, 'miss', '#aaa');
      return;
    }
    if (p.kind === 'cast') { petShoot(api, e, t); return; }
    if (dist(e, t) > 4.2) return;
    var pc = hitChance2(e.inst.a1 && e.inst.a1.ar, e.inst.lvl, (t.inst && t.inst.def) || 0, (t.inst && t.inst.lvl) || 1);
    if (Math.random() >= pc) { api.floatText(t.x, t.y, 'miss', '#aaa'); return; }
    var a = e.act && e.act.mode === 'A2' && e.inst.a2 ? e.inst.a2 : (e.inst.a1 || e.inst.dmg);
    var amt = roll(a);
    if (D2S.isFriend(t)) { damageAlly(api, t, amt, e); return; }
    // đồng minh của hero đánh quái
    var party = auraParty(api), pct = 100 + (party.damagepercent || 0);
    var before = t.hp;
    api.damageMon(t, amt * pct / 100, 'phys', false);
    var sm = e.pet && e.pet.sm;
    if (sm && sm.elem && sm.elem.max > 0 && !dead(t)) api.damageMon(t, roll(sm.elem), sm.elem.type, false);
    if (sm && sm.el && sm.el.max > 0 && !dead(t)) api.damageMon(t, roll(sm.el), sm.el.type, false);
    if (sm && sm.slowPct && !dead(t)) { slow(api, t, sm.slowPct, 3); refreshMon(api, t); }
    if (sm && sm.lifeStealPct) {   // Blood Golem: hút máu, một phần chuyển cho chủ
      var got = Math.max(0, before - t.hp) * sm.lifeStealPct / 100;
      e.hp = Math.min(e.maxHp, e.hp + got); heal(api, got * (sm.toCasterPct || 0) / 100, 0);
    }
    if (e.pet && e.pet.ai === 'raven') { e.pet.hitsLeft--; if (e.pet.hitsLeft <= 0) killPet(api, e, true); }
  }
  function hitChance2(ar, alvl, def, dlvl) { try { return R().hitChance(ar || 30, alvl || 1, def || 0, dlvl || 1); } catch (x) { return 0.7; } }
  function petShoot(api, e, t) {
    var sm = e.pet && e.pet.sm, S = api.S;
    if (e.pet && e.pet.mage) {
      var m = e.pet.mage;
      api.spawnMissile(e, t.x, t.y, { dmg: { min: m.min, max: m.max, elem: m.type }, art: misArt(api, 'skmage' + ({ poison: 'pois', cold: 'cold', fire: 'fire', light: 'ltng' })[m.type]) || 'mis.arrow', speed: 14, owner: 'hero', ar: 9999, life: 1.4 });
      return;
    }
    if (e.pet && e.pet.monMissile) {
      var mm = e.pet.monMissile, md = mm.dmg || e.inst.a2 || e.inst.a1;
      api.spawnMissile(e, t.x, t.y, { dmg: { min: md.min, max: md.max, elem: mm.elem || 'phys' }, art: misArt(api, mm.id) || 'mis.arrow', speed: clamp(mm.vel || 14, 10, 20), owner: 'hero', ar: 9999, life: 1.6 });
      return;
    }
    if (!sm) return;
    var el = sm.elem || { type: 'phys', min: 1, max: 2 };
    var spec = { dmg: { min: el.min, max: el.max, elem: el.type }, art: misArt(api, sm.missile) || 'mis.firebolt', speed: 16, owner: 'hero', ar: 9999, life: 1.5 };
    if (sm.missile === 'chargedbolt') {
      for (var i = 0; i < (sm.bolts || 5); i++) { var a = Math.atan2(t.y - e.y, t.x - e.x) + rnd(-0.6, 0.6); api.spawnMissile(e, e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, { dmg: spec.dmg, art: misArt(api, 'chargedbolt') || 'mis.arrow', speed: rnd(8, 14), owner: 'hero', ar: 9999, life: 1.6 }); }
    } else if (sm.missile === 'lightningbolt') {
      // sentry lightning: tia đánh ngay theo đường thẳng
      var hit = within(api, (e.x + t.x) / 2, (e.y + t.y) / 2, dist(e, t) / 2 + 1).filter(function (m) { return segDist(m, e, t) < 1.2; });
      hit.forEach(function (m) { api.damageMon(m, roll(el), 'light', false); });
      addFx(api, { x: e.x, y: e.y, pts: [[e.x, e.y], [t.x, t.y]], color: ELCOL.light, life: 0.18 });
      if (sm.corpseExplode) { var c = nearestCorpse(api, t.x, t.y, 8); if (c) corpseBlast(api, c, { minPct: 40, maxPct: 80, elemPct: 50, radius: 5 }); } // mon death sentry Param1/2/5
    } else if (sm.missile === 'firewall' || sm.missile === 'infernoflame1') {
      var base = Math.atan2(t.y - e.y, t.x - e.x);
      for (var k = -1; k <= 1; k++) api.spawnMissile(e, e.x + Math.cos(base + k * 0.25) * 10, e.y + Math.sin(base + k * 0.25) * 10, { dmg: spec.dmg, art: misArt(api, sm.missile) || misArt(api, 'firewall'), speed: 10, owner: 'hero', ar: 9999, life: 1.1, pierce: 99 });
    } else api.spawnMissile(e, t.x, t.y, spec);
  }
  function segDist(p, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1, t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / l2, 0, 1);
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
  }
  function petTarget(api, e, range) {
    var h = api.S.hero, P = e.pet;
    if (P.tgt && !dead(P.tgt) && isEnemy(P.tgt) && dist(P.tgt, h) < 26 && api.S.time < P.retarget) return P.tgt;
    P.retarget = api.S.time + 0.4;
    var best = null, bd = range;
    api.S.ents.forEach(function (m) {
      if (!isEnemy(m) || m === e) return;
      var d = dist(m, e); if (d < bd && dist(m, h) < 22) { bd = d; best = m; }
    });
    P.tgt = best;
    return best;
  }
  function follow(api, e, dt, near) {
    var h = api.S.hero, d = dist(e, h);
    if (d > 40) { var p = openNear(api, h.x + rnd(-2, 2), h.y + rnd(-2, 2)); e.x = p[0]; e.y = p[1]; return; }
    if (d > (near || 4)) stepTo(api, e, h.x, h.y, dt, d > 10 ? 1.3 : 1);
    else if (e.st === 'run' || e.st === 'walk') api.setSt(e, 'idle');
  }
  function petAI(api, e, dt) {
    var S = api.S, P = e.pet, h = S.hero;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.st === 'die') { if (e.stT >= e.stDur) { e.st = 'dead'; e.deadAt = S.time; } return; }
    if (e.st === 'dead') { if (S.time - (e.deadAt || 0) > 1.5) e.removed = true; return; }
    if (P.until && S.time >= P.until) { killPet(api, e, P.ai === 'trap' || P.ai === 'wall'); return; }
    if (e.st === 'attack' || e.st === 'cast') { if (e.stT >= e.stDur) { e.act = null; api.setSt(e, 'idle'); } else return; }
    if (e.st === 'hit') { if (e.stT >= e.stDur) api.setSt(e, 'idle'); else return; }
    P.cd -= dt;
    switch (P.ai) {
      case 'wall': case 'decoy': return;
      case 'totem': follow(api, e, dt, 5); return;
      case 'trap': {
        var tt = P.cd <= 0 && petTarget(api, e, 16);
        if (tt) {
          P.cd = 1.0; e.dir = api.E.dirFromTiles(tt.x - e.x, tt.y - e.y); petShoot(api, e, tt);
          if (P.shots && --P.shots <= 0) killPet(api, e, true);
        }
        return;
      }
      case 'blade': {   // Blade Sentinel: đi lại giữa điểm đặt và điểm nhắm, cắt mọi quái chạm phải
        var tx = P.dirSign > 0 ? P.ex : P.ox, ty = P.dirSign > 0 ? P.ey : P.oy;
        if (Math.hypot(tx - e.x, ty - e.y) < 0.6) P.dirSign = -P.dirSign;
        var vx = tx - e.x, vy = ty - e.y, l = Math.hypot(vx, vy) || 1; e.x += vx / l * 8 * dt; e.y += vy / l * 8 * dt;
        if (P.cd <= 0) {
          P.cd = 0.25;
          var wd = P.sm.weaponPct || 75, d = S.d;
          within(api, e.x, e.y, 1.4).forEach(function (m) { api.damageMon(m, roll(P.sm.dmg) + roll({ min: d.dmgMin, max: d.dmgMax }) * wd / 100, 'phys', true); });
        }
        api.setSt(e, 'run'); return;
      }
      case 'vine': {   // Carrion Vine / Solar Creeper: ăn xác, hồi máu / mana cho chủ
        var c = nearestCorpse(api, e.x, e.y, 14);
        if (!c) { follow(api, e, dt, 5); return; }
        if (dist(c, e) > 1.2) { stepTo(api, e, c.x, c.y, dt, 1); return; }
        if (P.cd <= 0) {
          P.cd = 2.0; c.d2sUsed = true; c.removed = true;
          if (P.sm.corpseHealPct) heal(api, S.d.maxHp * P.sm.corpseHealPct / 100, 0);
          if (P.sm.corpseManaPct) heal(api, 0, S.d.maxMp * P.sm.corpseManaPct / 100);
          addFx(api, { x: c.x, y: c.y, ring: 1.5, color: P.sm.corpseHealPct ? '#f66' : '#68f', life: 0.4 });
        }
        return;
      }
      default: {
        var range = P.ai === 'ranged' ? 14 : 2.7;
        var t = petTarget(api, e, P.ai === 'ranged' ? 16 : 13);
        if (!t) { if (e.speed > 0) follow(api, e, dt, P.ai === 'raven' ? 2 : 4); return; }
        var dd = dist(e, t);
        if (dd > range) { if (e.speed > 0) stepTo(api, e, t.x, t.y, dt, 1); return; }
        if (P.ai === 'ranged' && !api.los(e.x, e.y, t.x, t.y)) { if (e.speed > 0) stepTo(api, e, t.x, t.y, dt, 1); return; }
        if (P.cd <= 0) {
          var dur = attackAnim(api, e, t, P.ai === 'ranged' ? 'cast' : 'swing');
          P.cd = dur / 1000 + (P.ai === 'ranged' ? 0.5 : 0.15);
        } else { e.dir = api.E.dirFromTiles(t.x - e.x, t.y - e.y); if (e.st === 'run') api.setSt(e, 'idle'); }
      }
    }
  }
  // quái bị lời nguyền/hào quang lái: confuse đánh quái gần nhất, blind đứng yên trừ khi hero sát bên, lure đánh mồi
  function ctlAI(api, m, dt) {
    var S = api.S;
    if (m.hitFlash > 0) m.hitFlash -= dt;
    if (dead(m) || S.time >= m.ctlUntil || (m.ctl === 'lure' && (!m.lureTgt || dead(m.lureTgt)))) { release(api, m); return; }
    if (m.spawnT > 0) { m.spawnT -= dt * 1000; return; }
    if (m.st === 'attack' || m.st === 'cast') { if (m.stT >= m.stDur) { m.act = null; api.setSt(m, 'idle'); } else return; }
    if (m.st === 'hit') { if (m.stT >= m.stDur) api.setSt(m, 'idle'); else return; }
    if (m.flee > 0) { m.flee -= dt; var h0 = S.hero; stepTo(api, m, m.x * 2 - h0.x, m.y * 2 - h0.y, dt, 1.2); return; }
    m.cd = (m.cd || 0) - dt;
    var t = null;
    if (m.ctl === 'blind') { t = dist(m, S.hero) < 3 ? S.hero : null; if (!t) { if (m.st === 'run') api.setSt(m, 'idle'); return; } }
    else if (m.ctl === 'lure') t = m.lureTgt;
    else if (m.ctl === 'confuse') { t = nearestEnemy(api, m.x, m.y, 20, m) || (dist(m, S.hero) < 20 ? S.hero : null); }
    else if (m.ctl === 'convert') { t = nearestEnemy(api, m.x, m.y, 14, m); if (!t) { follow(api, m, dt, 4); return; } }
    if (!t) { api.setSt(m, 'idle'); return; }
    if (dist(m, t) > 2.7) { stepTo(api, m, t.x, t.y, dt, 1); return; }
    if (m.cd <= 0) { var dur = attackAnim(api, m, t, 'swing'); m.cd = dur / 1000 * rnd(1.1, 1.5) + 0.15; }
  }
  // quái thường đứng sát đồng minh (gần hơn hero) thì đánh đồng minh; game.js chỉ biết đánh hero
  function enemiesHitAllies(api) {
    var S = api.S, pets = st(api).pets.filter(function (p) { return !dead(p) && p.pet && !p.pet.sm.flying; });
    if (!pets.length) return;
    S.ents.forEach(function (m) {
      if (m.kind !== 'mon' || m.ally || dead(m) || !m.aggro || m.spawnT > 0 || m.flee > 0) return;
      if (m.st === 'attack' || m.st === 'cast' || m.st === 'hit' || (m.cd || 0) > 0 || m.ai === 'ranged' || m.ai === 'shaman') return;
      var best = null, bd = 2.6;
      pets.forEach(function (p) { var d = dist(p, m); if (d < bd) { bd = d; best = p; } });
      if (!best) return;
      var dh = dist(m, S.hero);
      if (dh < bd + 0.4 && best.pet.ai !== 'decoy') return;
      var dur = attackAnim(api, m, best, 'swing');
      m.cd = dur / 1000 * rnd(1.1, 1.6) + 0.15;
    });
  }

  /* ------------------------------------------------------------------ lời nguyền */
  function doCurse(api, act) {
    var S = api.S, fx = act.fx, c = fx.curse, now = S.time, h = S.hero;
    var targets;
    if (c.single) { var t0 = act.target && isEnemy(act.target) ? act.target : nearestEnemy(api, act.tx, act.ty, 5); targets = t0 ? [t0] : []; }
    else if (fx.id === 'cloak_of_shadows') targets = within(api, h.x, h.y, c.radius || 30);
    else targets = within(api, act.tx, act.ty, Math.max(1.5, c.radius || 2));
    if (fx.id === 'cloak_of_shadows' && c.selfStats) addBuff(api, fx.id, fx, { stats: c.selfStats, durationSec: c.durationSec });
    targets.forEach(function (m) {
      var ms = mstate(m);
      if (fx.id !== 'mind_blast') {
        clearCurse(api, m);   // một quái mang một lời nguyền; cái mới thay cái cũ [AS]
        ms.curse = { id: fx.id, until: now + (c.durationSec || 8), c: c, stats: c.stats || {} };
        overlay(api, m, fx.overlay, now + (c.durationSec || 8), 0);
      }
      if (c.fleeDist) { m.flee = c.durationSec; m.aggro = true; }
      if (c.confuse) control(api, m, 'confuse', now + c.durationSec);
      if (c.blind) control(api, m, 'blind', now + c.durationSec);
      if (fx.id === 'taunt') m.aggro = true;
      if (c.attract) {   // quái quanh đó lao vào kẻ bị Attract
        within(api, m.x, m.y, 12).forEach(function (o) { if (o !== m && !o.ally) control(api, o, 'lure', now + c.durationSec, m); });
      }
      if (c.stunSec) stun(api, m, c.stunSec);
      if (c.dmg && c.dmg.max) api.damageMon(m, roll(c.dmg), 'phys', true);
      if (c.convertPct && !dead(m) && Math.random() * 100 < c.convertPct && !(m.inst && m.inst.boss)) convert(api, m, c.convertSec);
      refreshMon(api, m);
    });
    ring(api, act.tx, act.ty, Math.max(1.5, c.radius || 2), '#c080ff', 0.5);
    var cm = misArt(api, 'curse' + String(fx.state || '').replace(/[^a-z]/g, ''));
    if (cm) addFx(api, { x: act.tx, y: act.ty, art: cm, life: 0.8 });
  }
  function convert(api, m, sec) {
    control(api, m, 'convert', api.S.time + (sec || 16));
    m.hostile = false; m.converted = true; m.aggro = false;
    overlay(api, m, ['ovl.conversionaura'], api.S.time + (sec || 16), 0);
  }

  /* ------------------------------------------------------------------ hào quang (Paladin) */
  function setAura(api, id, quiet) {
    var s = st(api), h = api.S.hero;
    s.aura = id; s.auraT = 0;
    dropOverlays(api, h, 'ovl.aura');
    st(api).fx.forEach(function (f) { if (f.follow === h && f.auraFx) f.until = 0; });
    var fx = fxOf(api, id, lvlOf(api, id));
    (fx.overlay || []).forEach(function (a) { if (hasSheet(api, a)) { var e = addFx(api, { x: h.x, y: h.y, art: a, follow: h, life: 1e9, loop: true }); e.auraFx = true; } });
    if (!quiet) { msg(api, fx.name + ' bật.'); sfx(api, ['power_shield'], 0.3); }
    api.recalc();
  }
  function auraFx(api) { var s = st(api); return s.aura && lvlOf(api, s.aura) ? fxOf(api, s.aura, lvlOf(api, s.aura)) : null; }
  // chỉ số nhóm (hero + đồng minh) từ hào quang và vật tổ đang có
  function auraParty(api) {
    var out = {}, fx = auraFx(api);
    if (fx && fx.aura && !fx.aura.enemy) for (var k in fx.aura.stats) out[k] = (out[k] || 0) + fx.aura.stats[k];
    st(api).pets.forEach(function (p) {
      if (dead(p) || !p.pet || p.pet.ai !== 'totem' || !p.pet.sm.aura) return;
      var a = p.pet.sm.aura;
      if (a.lifePct) out.item_maxhp_percent = (out.item_maxhp_percent || 0) + a.lifePct;
      if (a.dmgPct) out.damagepercent = (out.damagepercent || 0) + a.dmgPct;
      if (a.arPct) out.item_tohit_percent = (out.item_tohit_percent || 0) + a.arPct;
    });
    return out;
  }
  function auraTick(api, dt) {
    var S = api.S, s = st(api), fx = auraFx(api), h = S.hero;
    var A = fx && fx.aura;
    if (A && A.monStats && Object.keys(A.monStats).length) {
      within(api, h.x, h.y, A.radius).forEach(function (m) { var ms = mstate(m); ms.aura = A.monStats; ms.auraT = S.time; });
    }
    if (!A) return;
    s.auraT -= dt;
    if (s.auraT > 0) return;
    s.auraT = A.periodSec || 2;
    if (A.dmg && A.dmg.max > 0) {
      within(api, h.x, h.y, A.radius).forEach(function (m) {
        if (A.undeadOnly && !(m.inst && m.inst.undead)) return;
        api.damageMon(m, roll(A.dmg), A.undeadOnly ? 'magic' : A.dmg.type, true);
      });
      ring(api, h.x, h.y, A.radius, ELCOL[A.dmg.type] || '#fff', 0.4);
    }
    if (A.heal) { heal(api, A.heal, 0); st(api).pets.forEach(function (p) { if (!dead(p) && dist(p, h) < A.radius) p.hp = Math.min(p.maxHp, p.hp + A.heal); }); }
    if (A.redeem) {
      corpses(api).forEach(function (c) {
        if (dist(c, h) > A.radius || Math.random() * 100 >= A.redeem.chancePct) return;
        c.d2sUsed = true; c.removed = true; heal(api, A.redeem.hp, A.redeem.mp);
        addFx(api, { x: c.x, y: c.y, art: misArt(api, 'redemption'), ring: 1.2, color: '#fff6a0', life: 0.6 });
      });
    }
  }

  /* ------------------------------------------------------------------ bùa thân, chiến hống, biến hình */
  function addBuff(api, id, fx, b) {
    var s = st(api), h = api.S.hero, now = api.S.time;
    if (ARMOR_GROUP[id]) Object.keys(s.buffs).forEach(function (k) { if (ARMOR_GROUP[k] && k !== id) delete s.buffs[k]; });
    dropOverlays(api, h, null);
    var rec = { id: id, fx: fx, until: now + (b.durationSec || 60), stats: b.stats || {}, b: b, tick: 0 };
    if (b.absorb) rec.pool = b.absorb.amount;
    s.buffs[id] = rec;
    refreshBuffOverlays(api);
    api.recalc();
    return rec;
  }
  function refreshBuffOverlays(api) {
    var s = st(api), h = api.S.hero;
    s.fx.forEach(function (f) { if (f.follow === h && !f.auraFx && f.loop) f.until = 0; });
    Object.keys(s.buffs).forEach(function (k) { var r = s.buffs[k]; overlay(api, h, r.fx.overlay, r.until, 0); });
    if (s.form) overlay(api, h, [], s.form.until, 0);
    var af = auraFx(api);
    if (af) (af.overlay || []).forEach(function (a) { if (hasSheet(api, a)) { var e = addFx(api, { x: h.x, y: h.y, art: a, follow: h, life: 1e9, loop: true }); e.auraFx = true; } });
  }
  function doBuff(api, act) {
    var fx = act.fx, b = fx.buff;
    addBuff(api, fx.id, fx, b);
    msg(api, fx.name + ' kích hoạt.');
    sfx(api, ['power_shield'], 0.4);
  }
  function doWarcry(api, act) {
    var S = api.S, fx = act.fx, w = fx.warcry, h = S.hero, now = S.time;
    if (fx.id === 'shout' || fx.id === 'battle_orders' || fx.id === 'battle_command') {
      addBuff(api, fx.id, fx, { stats: w.stats, durationSec: w.durationSec });
      if (fx.id === 'battle_orders') { var d = S.d; S.char.hp = Math.min(d.maxHp, S.char.hp); }
    } else {
      within(api, h.x, h.y, w.radius).forEach(function (m) {
        if (fx.id === 'howl') { m.flee = w.durationSec; m.aggro = true; }
        if (fx.id === 'battle_cry') { var ms = mstate(m); ms.cry = w.monStats; ms.cryUntil = now + w.durationSec; refreshMon(api, m); overlay(api, m, fx.overlay, now + w.durationSec, 0); }
        if (fx.id === 'war_cry') { api.damageMon(m, roll(w.dmg), 'phys', true); stun(api, m, w.stunSec); }
      });
    }
    ring(api, h.x, h.y, w.radius, '#ffb84a', 0.5);
    var art = misArt(api, String(fx.id).replace(/_/g, ''));
    if (art) addFx(api, { x: h.x, y: h.y, art: art, life: 0.8 });
    sfx(api, ['power_warcry'], 0.5);
  }
  function shapeshift(api, fx) {
    var s = st(api), now = api.S.time, sh = fx.shift;
    s.form = { id: fx.id, form: sh.form, until: now + sh.durationSec, since: now, stats: sh.stats };
    var art = sh.form === 'wolf' ? 'ovl.wolf_into' : 'ovl.bear_into';
    if (hasSheet(api, art)) addFx(api, { x: api.S.hero.x, y: api.S.hero.y, art: art, follow: api.S.hero, life: 0.8 });
    msg(api, (sh.form === 'wolf' ? 'Hóa sói' : 'Hóa gấu') + ' (' + Math.round(sh.durationSec) + ' giây).');
    api.recalc();
  }
  function unshift(api) {
    var s = st(api); if (!s.form) return;
    var art = s.form.form === 'wolf' ? 'ovl.wolf_undo' : 'ovl.bear_undo';
    if (hasSheet(api, art)) addFx(api, { x: api.S.hero.x, y: api.S.hero.y, art: art, follow: api.S.hero, life: 0.8 });
    s.form = null; s.rage = null;
    api.recalc();
  }
  function buffTicks(api, dt) {
    var S = api.S, s = st(api), h = S.hero, now = S.time, changed = false;
    Object.keys(s.buffs).forEach(function (k) {
      var r = s.buffs[k];
      if (now >= r.until || (r.pool != null && r.pool <= 0)) { delete s.buffs[k]; changed = true; return; }
      var b = r.b;
      if (b.periodSec && b.dmg) {
        r.tick -= dt;
        if (r.tick <= 0) {
          r.tick = b.periodSec;
          if (k === 'thunder_storm') {
            var t = nearestEnemy(api, h.x, h.y, b.radius);
            if (t) { api.damageMon(t, roll(b.dmg), 'light', true); addFx(api, { x: t.x, y: t.y, art: misArt(api, 'thunderstorm1'), pts: [[t.x - 3, t.y - 3], [t.x, t.y]], color: ELCOL.light, life: 0.4 }); }
          } else if (k === 'blade_shield') {
            within(api, h.x, h.y, b.radius).forEach(function (m) { api.damageMon(m, roll(b.dmg) + roll({ min: S.d.dmgMin, max: S.d.dmgMax }) * (b.weaponPct || 75) / 100, 'phys', true); });
          } else {   // Armageddon / Hurricane: đá lửa / gió băng rơi quanh hero
            var tg = within(api, h.x, h.y, b.radius); var victim = tg[Math.floor(Math.random() * tg.length)];
            if (victim) {
              api.damageMon(victim, roll(b.dmg), b.dmg.elem, true);
              if (b.dmg.elem === 'cold') slow(api, victim, 50, 2);
              addFx(api, { x: victim.x, y: victim.y, art: misArt(api, k === 'armageddon' ? 'armageddonrock' : 'hurricanerock'), life: 0.6 });
            }
          }
        }
      }
      if (k === 'blaze' && b.trail) {   // Blaze: lửa rơi sau lưng khi hero di chuyển
        r.tick -= dt;
        if (r.tick <= 0 && (h.st === 'run' || h.st === 'walk')) { r.tick = 0.15; zone(api, { type: 'burn', x: h.x, y: h.y, r: 1.3, until: now + 3, dps: b.trail, elem: 'fire', art: misArt(api, 'blaze') }); }
      }
    });
    if (s.form && now >= s.form.until) { unshift(api); changed = true; msg(api, 'Hết thời gian biến hình.'); }
    Object.keys(s.charges).forEach(function (k) { if (now >= s.charges[k].until) { delete s.charges[k]; dropOverlays(api, h, 'ovl.' + chargeOvl(k)); } });
    if (s.rage && now >= s.rage.until) { s.rage = null; changed = true; }
    if (changed) api.recalc();
  }

  /* ------------------------------------------------------------------ đánh cận chiến đặc biệt */
  function doHit(api, act) {
    var S = api.S, fx = act.fx, hh = fx.hit || {}, s = st(api);
    var base = { dmgPct: fx.dmgPct || 0, addMin: fx.addMin, addMax: fx.addMax, arPct: fx.toHitPct || 0, elem: fx.elem && fx.elem.max ? fx.elem : null, weaponPct: 100 };
    if (fx.id === 'shock_wave') {
      within(api, S.hero.x, S.hero.y, hh.radius).forEach(function (m) { api.damageMon(m, rnd(fx.addMin, fx.addMax + 0.999), 'phys', true); stun(api, m, hh.stunSec); });
      ring(api, S.hero.x, S.hero.y, hh.radius, '#d0b080', 0.6); return;
    }
    if (hh.allAround) {   // Fend: đâm mọi quái kề bên
      within(api, S.hero.x, S.hero.y, 3.6).forEach(function (m) { strike(api, m, base); });
      return;
    }
    var t = meleeTarget(api, act);
    if (!t) return;
    if (s.rage && fx.id === 'feral_rage') base.lifeStealPct = s.rage.n * (hh.lifeStealPerCharge || 0);
    if (fx.id === 'maul' && s.rage && s.rage.id === 'maul') base.dmgPct += s.rage.n * (hh.dmgPctPerCharge || 0);
    if (hh.lifeStealPct) base.lifeStealPct = hh.lifeStealPct;
    if (hh.manaStealPct) base.manaStealPct = hh.manaStealPct;
    var n = Math.max(1, hh.hits || 1), landed = false;
    for (var i = 0; i < n; i++) {
      var tg = i === 0 || !dead(t) ? t : nearestEnemy(api, S.hero.x, S.hero.y, 4);
      if (!tg) break;
      if (strike(api, tg, base) > 0) landed = true;
    }
    if (!landed) return;
    if (hh.stunSec) stun(api, t, hh.stunSec);
    if (hh.convertPct && !dead(t) && Math.random() * 100 < hh.convertPct) convert(api, t, hh.convertSec);
    if (hh.spread) within(api, t.x, t.y, 4).forEach(function (m) { if (m !== t && fx.elem) api.damageMon(m, roll(fx.elem) / 2, 'poison', true); }); // approx: Rabies spreads on hit, half strength
    if (hh.maxCharges) {   // Feral Rage / Maul: tích tối đa calc2 lần, mỗi lần kéo dài thời gian
      if (!s.rage || s.rage.id !== fx.id) s.rage = { id: fx.id, n: 0 };
      s.rage.n = Math.min(hh.maxCharges, s.rage.n + 1); s.rage.until = S.time + (hh.chargeSec || 20); s.rage.velPct = hh.velPct || 0;
      api.recalc();
    }
  }
  var CHARGE_OVL = { tiger_strike: 'tigerstrike1', cobra_strike: 'cobrastrike1', fists_of_fire: 'progressive_fire_1', claws_of_thunder: 'progressive_lightning_1', blades_of_ice: 'progressive_cold_1', phoenix_strike: 'progressive_other_1' };
  function chargeOvl(id) { return CHARGE_OVL[id] || 'progressive_damage_1'; }
  function doChargeHit(api, act) {
    var S = api.S, fx = act.fx, s = st(api), t = meleeTarget(api, act), ch = s.charges[fx.id];
    if (!t) return;
    var n = ch ? ch.n : 0;
    var dealt = strike(api, t, { arPct: (fx.toHitPct || 0) + n * (fx.charge.arPctPerCharge || 0), weaponPct: 100 });
    if (dealt <= 0) return;
    if (!ch) ch = s.charges[fx.id] = { n: 0, fx: fx };
    ch.n = Math.min(fx.charge.max, ch.n + 1); ch.until = S.time + fx.charge.durationSec; ch.fx = fx;
    dropOverlays(api, S.hero, 'ovl.' + chargeOvl(fx.id));
    overlay(api, S.hero, ['ovl.' + chargeOvl(fx.id)], ch.until, 0);
    api.floatText(S.hero.x, S.hero.y, fx.name + ' ' + ch.n, '#ffd27a');
  }
  // tung các nạp lực lên mục tiêu: 1 lần = trúng mục tiêu, 2 = nổ vùng, 3 = thêm hiệu ứng lớn
  function releaseCharges(api, t, dealt) {
    var S = api.S, s = st(api), keys = Object.keys(s.charges);
    var extra = { dmgPct: 0, lifeStealPct: 0 };
    keys.forEach(function (k) {
      var ch = s.charges[k], c = ch.fx.charge, n = ch.n, el = c.elem;
      if (k === 'tiger_strike') extra.dmgPct += n * (c.dmgPctPerCharge || 0);
      if (k === 'cobra_strike') extra.lifeStealPct += n * (c.lifeStealPctPerCharge || 0);
      if (k === 'phoenix_strike') {
        var w = { min: S.d.dmgMin * 3, max: S.d.dmgMax * 3 };   // approx: Royal Strike has no damage columns in 3.1 skills.txt
        within(api, t.x, t.y, c.radius3 || 6).forEach(function (m) { api.damageMon(m, roll(w), 'fire', true); });
        if (n >= 2) within(api, t.x, t.y, c.radius2 || 8).slice(0, 5).forEach(function (m) { api.damageMon(m, roll(w), 'light', true); });
        if (n >= 3) within(api, S.hero.x, S.hero.y, 8).forEach(function (m) { api.damageMon(m, roll(w), 'cold', true); slow(api, m, 50, 3); });
        ring(api, t.x, t.y, 6, ELCOL.fire);
      } else if (el && el.max > 0) {
        var r2 = c.radius2 || 4;
        var hitList = n >= 2 ? within(api, t.x, t.y, r2) : [t];
        hitList.forEach(function (m) { api.damageMon(m, roll(el), el.type, true); if (el.type === 'cold') slow(api, m, 50, el.durationSec || 2); });
        if (n >= 3 && c.bolts3) for (var i = 0; i < c.bolts3; i++) { var a = i * Math.PI * 2 / c.bolts3; api.spawnMissile(t, t.x + Math.cos(a) * 10, t.y + Math.sin(a) * 10, { dmg: { min: el.min, max: el.max, elem: 'light' }, art: misArt(api, 'clawsofthunderbolt') || 'mis.arrow', speed: 10, owner: 'hero', ar: 9999, life: 1.2 }); }
        if (n >= 3 && c.radius3 && !c.bolts3) zone(api, { type: 'burn', x: t.x, y: t.y, r: c.radius3, until: S.time + 3, dps: { min: el.min / 3, max: el.max / 3 }, elem: el.type, art: misArt(api, k === 'fists_of_fire' ? 'fistsoffirefirewall' : 'bladesoficecubes') });
        ring(api, t.x, t.y, n >= 2 ? r2 : 1.2, ELCOL[el.type]);
      }
      dropOverlays(api, S.hero, 'ovl.' + chargeOvl(k));
      delete s.charges[k];
    });
    return extra;
  }
  function doFinisher(api, act, t) {
    var S = api.S, fx = act.fx, f = fx.finisher;
    if (!t) return;
    var hadCharges = Object.keys(st(api).charges).length > 0;
    var extra = hadCharges ? releaseCharges(api, t) : { dmgPct: 0, lifeStealPct: 0 };
    // Param8 "Always Hit" khi có nạp lực bị tiêu
    var o = { dmgPct: (f.dmgPct || 0) + extra.dmgPct, lifeStealPct: extra.lifeStealPct, arPct: fx.toHitPct || 0, always: hadCharges };
    var n = f.kicks || f.hits || 1;
    for (var i = 0; i < n && !dead(t); i++) strike(api, t, o);
    if (f.fire) {   // Dragon Tail: cú đá nổ lửa quanh mục tiêu
      var d = S.d, fdm = { min: d.dmgMin * (100 + o.dmgPct) / 100, max: d.dmgMax * (100 + o.dmgPct) / 100 };
      within(api, t.x, t.y, f.radius || 6).forEach(function (m) { api.damageMon(m, roll(fdm), 'fire', true); });
      ring(api, t.x, t.y, f.radius || 6, ELCOL.fire);
    }
  }

  /* ------------------------------------------------------------------ xác */
  function corpseBlast(api, c, cp2) {
    var maxHp = c.maxHp || (c.inst && c.inst.maxHp) || 20, amt = maxHp * rnd(cp2.minPct, cp2.maxPct) / 100;
    c.d2sUsed = true; c.removed = true;
    within(api, c.x, c.y, cp2.radius).forEach(function (m) {
      var ep = (cp2.elemPct || 0) / 100;
      api.damageMon(m, amt * (1 - ep), 'phys', true);
      if (ep && !dead(m)) api.damageMon(m, amt * ep, 'fire', true);
    });
    addFx(api, { x: c.x, y: c.y, art: misArt(api, 'corpseexplosion'), ring: cp2.radius, color: ELCOL.fire, life: 0.7 });
    ring(api, c.x, c.y, cp2.radius, ELCOL.fire, 0.5);
  }
  function makeDrop(api, it, x, y) {
    var b = g.D2DATA && D2DATA.items.bases[it.base], f = b && b.flippyfile;
    var label = String(api.DA.itemName(it) || it.base).replace(/\n/g, ' ');
    api.mk('drop', x + rnd(-1, 1), y + rnd(-1, 1), { item: it, born: api.S.time, art: f && hasSheet(api, 'flp.' + f) ? 'flp.' + f : null, label: label, gold: 0 });
  }
  function doCorpse(api, act) {
    var S = api.S, fx = act.fx, cp2 = fx.corpse, h = S.hero;
    var c = nearestCorpse(api, act.tx, act.ty, 6) || nearestCorpse(api, h.x, h.y, 10);
    if (!c) return;
    switch (fx.id) {
      case 'corpse_explosion': corpseBlast(api, c, cp2); return;
      case 'poison_explosion':
        c.d2sUsed = true; c.removed = true;
        within(api, c.x, c.y, cp2.radius).forEach(function (m) { api.damageMon(m, roll(fx.elem), 'poison', true); });
        addFx(api, { x: c.x, y: c.y, art: misArt(api, 'poisonexplosioncloud'), ring: cp2.radius, color: ELCOL.poison, life: 0.9 });
        ring(api, c.x, c.y, cp2.radius, ELCOL.poison); return;
      case 'find_potion': {
        c.d2sUsed = true;
        if (Math.random() * 100 >= cp2.chancePct) { api.floatText(c.x, c.y, '...', '#aaa'); return; }
        var r = Math.random() * 100, tier = clamp(Math.ceil(S.char.lvl / 12), 1, 5);   // approx: potion grade from character level
        var code = r < cp2.rejuvPct ? 'rvs' : r < cp2.rejuvPct + cp2.manaPct ? 'mp' + tier : 'hp' + tier;
        if (!(g.D2DATA && D2DATA.items.bases[code])) code = 'hp1';
        makeDrop(api, R().makeItem(code, S.char.lvl, 'normal', null), c.x, c.y); return;
      }
      case 'find_item': {
        c.d2sUsed = true;
        if (Math.random() * 100 >= cp2.chancePct) { api.floatText(c.x, c.y, '...', '#aaa'); return; }
        var items = []; try { items = R().rollDrop(c.monId, (c.inst && c.inst.lvl) || 1, Math.random) || []; } catch (e) { items = []; }
        items.forEach(function (it) { if (it.gold != null) api.mk('drop', c.x + rnd(-1, 1), c.y + rnd(-1, 1), { item: it, born: S.time, label: it.gold + ' vàng', gold: it.gold }); else makeDrop(api, it, c.x, c.y); });
        return;
      }
      case 'grim_ward':
        c.d2sUsed = true; c.removed = true;
        zone(api, { type: 'ward', x: c.x, y: c.y, r: cp2.radius, until: S.time + cp2.durationSec, fearSec: cp2.fearSec, monStats: cp2.monStats, art: misArt(api, 'grimwardmedium') });
        return;
    }
  }

  /* ------------------------------------------------------------------ vùng (tường lửa, bão tuyết, thiên thạch...) */
  function zone(api, z) {
    z.t0 = api.S.time; z.next = 0;
    if (z.art) z.vis = addFx(api, { x: z.x, y: z.y, art: z.art, life: z.until - api.S.time, loop: true });
    st(api).zones.push(z); return z;
  }
  function zoneTick(api, dt) {
    var S = api.S, now = S.time, s = st(api);
    s.zones = s.zones.filter(function (z) {
      if (now >= z.until && !(z.type === 'meteor' && !z.done)) { if (z.vis) z.vis.until = 0; return false; }
      switch (z.type) {
        case 'burn':   // sát thương theo giây cho quái đứng trong vùng (tường lửa, lửa đất)
          z.next -= dt;
          if (z.next <= 0) {
            z.next = 0.4;
            enemies(api).forEach(function (m) {
              var inside = z.seg ? segDist(m, z.seg[0], z.seg[1]) <= z.r : Math.hypot(m.x - z.x, m.y - z.y) <= z.r;
              if (inside) api.damageMon(m, roll(z.dps) * 0.4, z.elem, true);
            });
          }
          return true;
        case 'rain':   // Blizzard / Eruption / Volcano: mảnh rơi ngẫu nhiên trong bán kính
          z.next -= dt;
          while (z.next <= 0) {
            z.next += z.rate;
            var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.r, px = z.x + Math.cos(a) * d, py = z.y + Math.sin(a) * d;
            within(api, px, py, z.hitR || 1.6).forEach(function (m) {
              api.damageMon(m, roll(z.dmg), z.elem, true);
              if (z.phys && !dead(m)) api.damageMon(m, roll(z.phys), 'phys', true);
              if (z.elem === 'cold') slow(api, m, 50, z.chill || 2);
            });
            if (z.shard) addFx(api, { x: px, y: py, art: z.shard, life: 0.5 });
            else ring(api, px, py, z.hitR || 1.6, ELCOL[z.elem], 0.3);
          }
          return true;
        case 'meteor':
          if (!z.done && now >= z.hitAt) {
            z.done = true;
            within(api, z.x, z.y, z.r).forEach(function (m) { api.damageMon(m, roll(z.dmg), 'fire', true); });
            addFx(api, { x: z.x, y: z.y, art: misArt(api, 'meteorexplode'), ring: z.r, color: ELCOL.fire, life: 0.8 });
            ring(api, z.x, z.y, z.r, ELCOL.fire, 0.6);
            if (z.fireSec) zone(api, { type: 'burn', x: z.x, y: z.y, r: z.r * 0.7, until: now + z.fireSec, dps: { min: z.dmg.min * 0.1, max: z.dmg.max * 0.1 }, elem: 'fire', art: misArt(api, 'meteorfire') }); // approx: meteorfire damage
          }
          return now < z.until || !z.done;
        case 'ward':   // Grim Ward: quái lại gần thì hoảng chạy và chậm lại
          enemies(api).forEach(function (m) {
            if (Math.hypot(m.x - z.x, m.y - z.y) > z.r) return;
            var ms = mstate(m); ms.ward = z.monStats; ms.wardT = now;
            if (!(m.flee > 0)) m.flee = z.fearSec;
          });
          return true;
        case 'web':
          z.next -= dt;
          if (z.next <= 0) { z.next = 0.5; z.pts.forEach(function (p) { within(api, p[0], p[1], 1.4).forEach(function (m) { api.damageMon(m, roll(z.dmg) * 0.5, 'light', true); }); }); }
          return true;
        case 'bomb':   // quả bom bay vòng rồi nổ
          var k = clamp((now - z.t0) / z.flight, 0, 1);
          if (z.vis) { z.vis.x = z.sx + (z.x - z.sx) * k; z.vis.y = z.sy + (z.y - z.sy) * k; z.vis.lift = Math.sin(k * Math.PI) * 60; }
          if (k >= 1 && !z.done) {
            z.done = true;
            within(api, z.x, z.y, z.r).forEach(function (m) { api.damageMon(m, roll(z.dmg), z.elem, true); });
            addFx(api, { x: z.x, y: z.y, art: misArt(api, z.boom), life: 0.6 });
            ring(api, z.x, z.y, z.r, ELCOL[z.elem], 0.5);
            if (z.then) zone(api, z.then);
            if (z.vis) z.vis.until = 0;
            return false;
          }
          return true;
      }
      return now < z.until;
    });
    // trạng thái vùng/hào quang trên quái chỉ sống khi còn được làm mới trong khung này
    S.ents.forEach(function (m) {
      if (!m.d2s) return;
      var ms = m.d2s, dirty = false;
      if (ms.aura && ms.auraT !== now) { ms.aura = null; dirty = true; }
      if (ms.ward && ms.wardT !== now) { ms.ward = null; dirty = true; }
      if (ms.cry && ms.cryUntil <= now) { ms.cry = null; dirty = true; dropOverlays(api, m, 'ovl.battlecry'); }
      if (ms.curse && ms.curse.until <= now) { clearCurse(api, m); dirty = true; }
      if (ms.slowUntil && ms.slowUntil <= now) { ms.slowUntil = 0; dirty = true; }
      if (dirty || ms.aura || ms.ward || ms.curse || ms.cry || ms.slowUntil) refreshMon(api, m);
    });
  }
  function doBomb(api, act) {
    var S = api.S, fx = act.fx, b = fx.bomb, h = S.hero;
    var d = Math.hypot(act.tx - h.x, act.ty - h.y), flight = clamp(d / 16, 0.25, 1.1);
    var vis = addFx(api, { x: h.x, y: h.y, art: misArt(api, 'bomb in air') || misArt(api, 'shock field in air'), life: flight + 0.2 });
    var z = { type: 'bomb', x: act.tx, y: act.ty, sx: h.x, sy: h.y, flight: flight, until: S.time + flight + 1, r: b.radius, dmg: fx.elem, elem: fx.elem ? fx.elem.type : 'fire', boom: fx.id === 'fire_blast' ? 'bomb explosion' : 'shock field on ground' };
    z.t0 = S.time; z.vis = vis; z.next = 0;
    if (fx.id === 'shock_web') {
      var pts = [];
      for (var i = 0; i < b.count; i++) { var a = i * Math.PI * 2 / b.count; pts.push([act.tx + Math.cos(a) * b.radius, act.ty + Math.sin(a) * b.radius]); }
      z.r = b.radius; z.then = { type: 'web', x: act.tx, y: act.ty, pts: pts, dmg: fx.elem, until: S.time + flight + b.lingerSec, art: misArt(api, 'shock field on ground') };
      z.dmg = { min: 0, max: 0 };
    }
    st(api).zones.push(z);
  }
  function doTeleport(api, act) {
    var S = api.S, h = S.hero, from = { x: h.x, y: h.y };
    var p = openNear(api, act.tx, act.ty, 0.5);
    if (!api.canStand(p[0], p[1], 0.3)) return;
    h.x = p[0]; h.y = p[1]; h.path = null; h.goal = null;
    addFx(api, { x: from.x, y: from.y, art: hasSheet(api, 'ovl.teleport') ? 'ovl.teleport' : null, ring: 1, color: '#9cf', life: 0.5 });
    addFx(api, { x: h.x, y: h.y, art: hasSheet(api, 'ovl.teleport') ? 'ovl.teleport' : null, follow: h, life: 0.5 });
  }
  function doArea(api, act) {
    var S = api.S, fx = act.fx, A = fx.area || {}, h = S.hero, now = S.time, el = fx.elem;
    switch (fx.d2s) {
      case 'firewall': {
        var ang = Math.atan2(act.ty - h.y, act.tx - h.x) + Math.PI / 2, L = A.length || 7;
        var a = { x: act.tx - Math.cos(ang) * L, y: act.ty - Math.sin(ang) * L }, b = { x: act.tx + Math.cos(ang) * L, y: act.ty + Math.sin(ang) * L };
        zone(api, { type: 'burn', x: act.tx, y: act.ty, seg: [a, b], r: 1.2, until: now + A.durationSec, dps: el, elem: 'fire' });
        for (var i = -L; i <= L; i += 2) addFx(api, { x: act.tx + Math.cos(ang) * i, y: act.ty + Math.sin(ang) * i, art: misArt(api, 'firewall'), life: A.durationSec, loop: true });
        return;
      }
      case 'meteor':
        addFx(api, { x: act.tx, y: act.ty, art: misArt(api, 'meteor'), life: A.delaySec });
        zone(api, { type: 'meteor', x: act.tx, y: act.ty, r: A.radius, hitAt: now + A.delaySec, until: now + A.delaySec, dmg: el, fireSec: A.fireSec });
        return;
      case 'blizzard':
        zone(api, { type: 'rain', x: act.tx, y: act.ty, r: A.radius, rate: Math.max(0.12, A.rateSec), until: now + A.durationSec, dmg: el, elem: 'cold', chill: el && el.durationSec, shard: misArt(api, 'blizzard1') });
        return;
      case 'fissure':
        zone(api, { type: 'rain', x: act.tx, y: act.ty, r: A.radius, rate: Math.max(0.15, A.rateSec), until: now + A.durationSec, dmg: el, elem: 'fire', shard: misArt(api, 'erruption crack 1') });
        return;
      case 'volcano':
        zone(api, { type: 'rain', x: act.tx, y: act.ty, r: Math.min(A.radius, 8), rate: Math.max(0.2, A.rateSec), until: now + A.durationSec, dmg: el, phys: A.phys, elem: 'fire', shard: misArt(api, 'volcano debris 2'), art: misArt(api, 'volcano') });
        return;
      case 'chain': {   // Chain Lightning: nhảy calc1 lần, không đánh liền một mục tiêu hai lần
        var t = act.target && isEnemy(act.target) ? act.target : nearestEnemy(api, act.tx, act.ty, 8), prev = h, last = null, pts = [[h.x, h.y]];
        for (var j = 0; j <= (A.jumps || 3) && t; j++) {
          api.damageMon(t, roll(el), 'light', true); pts.push([t.x, t.y]);
          last = t; prev = t;
          var cand = within(api, t.x, t.y, A.jumpRadius || 20).filter(function (m) { return m !== last; });
          t = cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
        }
        addFx(api, { x: h.x, y: h.y, pts: pts, color: ELCOL.light, life: 0.25 });
        return;
      }
      case 'fist': {
        var tf = act.target && isEnemy(act.target) ? act.target : nearestEnemy(api, act.tx, act.ty, 6);
        var fx2 = tf || { x: act.tx, y: act.ty };
        within(api, fx2.x, fx2.y, 2.5).forEach(function (m) { api.damageMon(m, roll(el), 'light', true); });
        addFx(api, { x: fx2.x, y: fx2.y, pts: [[fx2.x - 4, fx2.y - 4], [fx2.x, fx2.y]], color: ELCOL.light, art: misArt(api, 'fistoftheheavensbolt'), life: 0.4 });
        // Holy Bolt tỏa ra: chỉ hại quái undead, hồi máu đồng minh [AS]
        var hb = lvlOf(api, 'holy_bolt') ? fxOf(api, 'holy_bolt', fx.slvl).dmg : { min: 8, max: 16 };
        within(api, fx2.x, fx2.y, 8).forEach(function (m) { if (m.inst && m.inst.undead) api.damageMon(m, roll(hb), 'magic', true); });
        st(api).pets.forEach(function (p) { if (!dead(p) && dist(p, fx2) < 8) p.hp = Math.min(p.maxHp, p.hp + roll(A.heal)); });
        ring(api, fx2.x, fx2.y, 8, '#fff6c0', 0.5);
        return;
      }
      case 'static':
        within(api, h.x, h.y, fx.radius || 6).forEach(function (m) { api.damageMon(m, Math.max(1, m.hp * (A.lifePct || 25) / 100), 'light', true); });
        ring(api, h.x, h.y, fx.radius || 6, ELCOL.light, 0.4);
        return;
      case 'tk': {
        var tk = act.target && isEnemy(act.target) ? act.target : nearestEnemy(api, act.tx, act.ty, 3);
        if (!tk) return;
        var dm = fx.id === 'psychic_hammer' ? { min: (el ? el.min : 0) + fx.addMin, max: (el ? el.max : 0) + fx.addMax } : el;
        api.damageMon(tk, roll(dm), fx.id === 'psychic_hammer' ? 'magic' : 'light', true);
        if (!dead(tk) && Math.random() * 100 < (A.knockPct || 0)) {
          var ka = Math.atan2(tk.y - h.y, tk.x - h.x);
          for (var s2 = 0; s2 < 6; s2++) if (api.canStand(tk.x + Math.cos(ka) * 0.5, tk.y + Math.sin(ka) * 0.5, 0.3)) { tk.x += Math.cos(ka) * 0.5; tk.y += Math.sin(ka) * 0.5; }
          stun(api, tk, 0.4);
        }
        addFx(api, { x: tk.x, y: tk.y, art: hasSheet(api, 'ovl.psychic_hammer_hit') ? 'ovl.psychic_hammer_hit' : null, ring: 1, color: '#c9a0ff', life: 0.4 });
        return;
      }
      case 'throw2': {
        var d = S.d, base = Math.atan2(act.ty - h.y, act.tx - h.x);
        [-0.12, 0.12].forEach(function (o) { api.spawnMissile(h, h.x + Math.cos(base + o) * 20, h.y + Math.sin(base + o) * 20, { dmg: { min: d.dmgMin, max: d.dmgMax, elem: 'phys' }, art: misArt(api, 'throwaxe') || 'mis.arrow', speed: 20, owner: 'hero', ar: d.ar, life: 1.0 }); });
        return;
      }
    }
  }

  /* ------------------------------------------------------------------ nhảy, lao, xoáy, bay */
  function startMove(api, skillId, fx, tx, ty, target) {
    var S = api.S, h = S.hero, b = fx.d2s, m = fx.move || { range: 30 };
    if (b === 'teleport') { beginAnim(api, skillId, fx, tx, ty, target, 'cast', 1, false); return true; }
    var tgt = target && isEnemy(target) ? target : (m.attack || b === 'finisher' ? nearestEnemy(api, tx, ty, 4) : null);
    var ex = tgt ? tgt.x : tx, ey = tgt ? tgt.y : ty, d = Math.hypot(ex - h.x, ey - h.y);
    var range = b === 'finisher' ? (fx.finisher.range || 38) : (m.range || 20);
    if (d > range) { var a = Math.atan2(ey - h.y, ex - h.x); ex = h.x + Math.cos(a) * range; ey = h.y + Math.sin(a) * range; d = range; }
    if (b === 'finisher') {   // Dragon Flight: hiện bên mục tiêu rồi đá
      if (!tgt) { msg(api, 'Không có mục tiêu.'); S.char.mp += fx.mana || 0; return false; }
      var p = openNear(api, tgt.x - Math.cos(Math.atan2(tgt.y - h.y, tgt.x - h.x)) * 1.6, tgt.y - Math.sin(Math.atan2(tgt.y - h.y, tgt.x - h.x)) * 1.6, 0.5);
      addFx(api, { x: h.x, y: h.y, art: hasSheet(api, 'ovl.dragonflight') ? 'ovl.dragonflight' : null, ring: 1, color: '#9cf', life: 0.4 });
      h.x = p[0]; h.y = p[1]; h.path = null;
      var act0 = beginAnim(api, skillId, fx, tgt.x, tgt.y, tgt, 'attack', 1, true);
      act0.mode = api.E.heroCof && api.E.heroCof(api.heroLook(), 'KK') ? 'KK' : act0.mode;
      doFinisher(api, act0, tgt);
      return true;
    }
    var speed = b === 'rush' ? Math.max(8, (S.d.run || 9) * (100 + (m.velPct || 0)) / 100) : b === 'whirlwind' ? Math.max(6, (S.d.walk || 6)) : 18;   // approx: Leap Speed % 175 of ~10 subtiles/s
    var dur = Math.max(0.25, d / speed);
    var act = beginAnim(api, skillId, fx, ex, ey, tgt, 'attack', 1, true);
    act.dur = dur * 1000; api.restart(h, 'attack', act.dur);
    if (b === 'rush') act.mode = api.E.heroCof && api.E.heroCof(api.heroLook(), 'RN') ? 'RN' : act.mode;
    st(api).move = { fx: fx, act: act, sx: h.x, sy: h.y, ex: ex, ey: ey, t: 0, dur: dur, tgt: tgt, hitT: 0, hit: {} };
    sfx(api, ['melee_attack'], 0.4);
    return true;
  }
  function moveTick(api, dt) {
    var S = api.S, h = S.hero, s = st(api), mv = s.move;
    if (!mv) return;
    if (h.st === 'hit' || h.st === 'die' || h.st === 'dead' || (h.act && h.act !== mv.act)) { s.move = null; return; }
    // game.js advances the hero's stT twice per frame (updateHero and the entity loop), so the swing can end
    // before the jump does; keep the hero in the move's act until it lands
    if (!h.act) { h.act = mv.act; api.restart(h, 'attack', Math.max(80, (mv.dur - mv.t) * 2000)); }
    mv.t += dt;
    var k = clamp(mv.t / mv.dur, 0, 1), fx = mv.fx, b = fx.d2s;
    if (b === 'rush' && mv.tgt && !dead(mv.tgt)) { mv.ex = mv.tgt.x; mv.ey = mv.tgt.y; }
    var nx = mv.sx + (mv.ex - mv.sx) * k, ny = mv.sy + (mv.ey - mv.sy) * k;
    // Leap bay qua vật cản (đáp xuống ô trống gần nhất); lao/xoáy dừng khi vướng
    if (b === 'leap' || api.canStand(nx, ny, 0.3)) { h.x = nx; h.y = ny; }
    else { mv.t = mv.dur; k = 1; }
    if (b === 'whirlwind') {
      mv.hitT -= dt;
      if (mv.hitT <= 0) { mv.hitT = 0.3; within(api, h.x, h.y, 2.8).forEach(function (m) { strike(api, m, { dmgPct: fx.dmgPct || 0, arPct: fx.toHitPct || 0 }); }); }
    }
    if (b === 'rush' && mv.tgt && !dead(mv.tgt) && dist(h, mv.tgt) < 2.6) k = 1;
    if (k < 1) return;
    s.move = null;
    if (!api.canStand(h.x, h.y, 0.3)) { var p = openNear(api, h.x, h.y, 0.5); h.x = p[0]; h.y = p[1]; }
    h.path = null; h.goal = null;
    if (fx.id === 'leap') {
      within(api, h.x, h.y, fx.move.knockbackRadius || 4).forEach(function (m) {
        var a = Math.atan2(m.y - h.y, m.x - h.x);
        for (var i = 0; i < 6; i++) if (api.canStand(m.x + Math.cos(a) * 0.5, m.y + Math.sin(a) * 0.5, 0.3)) { m.x += Math.cos(a) * 0.5; m.y += Math.sin(a) * 0.5; }
        stun(api, m, 0.5);
      });
      ring(api, h.x, h.y, fx.move.knockbackRadius || 4, '#d0b080', 0.4);
    }
    if (fx.move && fx.move.attack) {
      var t = mv.tgt && !dead(mv.tgt) && dist(mv.tgt, h) < 4.5 ? mv.tgt : nearestEnemy(api, h.x, h.y, 4);
      var act = beginAnim(api, fx.id, fx, t ? t.x : h.x, t ? t.y : h.y, t, 'attack', 1, true);
      if (t) strike(api, t, { dmgPct: fx.dmgPct || 0, addMin: fx.addMin, addMax: fx.addMax, arPct: fx.toHitPct || 0 });
      if (fx.id === 'leap_attack' && hasSheet(api, 'ovl.bash')) addFx(api, { x: h.x, y: h.y, art: 'ovl.bash', life: 0.4 });
      return act;
    }
  }

  /* ------------------------------------------------------------------ cập nhật mỗi khung */
  D2S.update = function (api, dt) {
    var S = api.S; if (!S.hero || !S.char) return;
    var s = st(api), h = S.hero;
    // đổi khu: thực thể cũ đã mất, đưa đồng minh đi theo (trừ bẫy, tường, hydra, mồi nhử) như D2
    if (s.grid !== S.grid) {
      var keep = s.pets.filter(function (p) { return !dead(p) && p.pet && STAYS_ON_AREA_CHANGE[p.pet.pettype]; });
      s.grid = S.grid; s.zones = []; s.fx = []; s.move = null; s.pending = [];
      keep.forEach(function (p) { var q = openNear(api, h.x + rnd(-2, 2), h.y + rnd(-2, 2)); p.x = q[0]; p.y = q[1]; p.act = null; p.removed = false; api.setSt(p, 'idle'); if (S.ents.indexOf(p) < 0) S.ents.push(p); p.pet.tgt = null; });
      s.pets = keep;
      if (s.aura) setAura(api, s.aura, true);
      refreshBuffOverlays(api);
    }
    if (h.st === 'die' || h.st === 'dead') { s.pets.forEach(function (p) { killPet(api, p, true); }); s.move = null; }
    moveTick(api, dt);
    buffTicks(api, dt);
    auraTick(api, dt);
    zoneTick(api, dt);
    // đòn treo của đồng minh / quái bị lái / quái đánh đồng minh
    var now = S.time;
    s.pending = s.pending.filter(function (p) { if (now < p.at) return true; landHit(api, p); return false; });
    enemiesHitAllies(api);
    for (var i = 0; i < S.ents.length; i++) {
      var e = S.ents[i];
      if (e.kind !== 'mon' || !e.ally || e.removed) continue;
      if (e.hostile || e.converted) ctlAI(api, e, dt);
      else if (e.pet) petAI(api, e, dt);
    }
    // hiệu ứng hình bám theo đơn vị
    s.fx = s.fx.filter(function (f) {
      if (f.removed) return false;
      if (now >= f.until || (f.follow && (f.follow.removed || (f.follow !== h && f.follow.st === 'dead')))) { f.removed = true; return false; }
      if (f.follow) { f.x = f.follow.x; f.y = f.follow.y; }
      return true;
    });
  };

  /* ------------------------------------------------------------------ chỉ số hero */
  function passiveTotals(api, add) {
    var c = api.S.char;
    PASSIVE_STATS.forEach(function (id) { var L = lvlOf(api, id); if (L) add(fxOf(api, id, L).stats); });
    if (c.cls === 'barbarian' && lvlOf(api, 'increased_stamina')) { /* đã cộng ở trên */ }
  }
  D2S.modDerived = function (api, d) {
    var S = api.S; if (!S.char) return;
    var s = st(api), tot = {};
    function add(o) { if (o) for (var k in o) if (typeof o[k] === 'number') tot[k] = (tot[k] || 0) + o[k]; }
    add(auraParty(api));
    Object.keys(s.buffs).forEach(function (k) { add(s.buffs[k].stats); });
    if (s.form) add(s.form.stats);
    if (s.rage) { if (s.rage.id === 'feral_rage') tot.velocitypercent = (tot.velocitypercent || 0) + s.rage.velPct; }
    var weaponAdd = [];
    var af = auraFx(api);
    if (af && af.aura && af.aura.weapon) weaponAdd.push(af.aura.weapon);
    Object.keys(s.buffs).forEach(function (k) { var w = s.buffs[k].b.weapon; if (w) weaponAdd.push(w); });
    try { passiveTotals(api, add); } catch (e) { /* bảng thiếu kỹ năng: bỏ qua */ }
    if (tot.item_maxhp_percent) d.maxHp = Math.floor(d.maxHp * (100 + tot.item_maxhp_percent) / 100);
    if (tot.item_maxmana_percent) d.maxMp = Math.floor(d.maxMp * (100 + tot.item_maxmana_percent) / 100);
    tot.skill_staminapercent = (tot.skill_staminapercent || 0) + (tot.skill_passive_staminapercent || 0);
    if (tot.skill_staminapercent) d.maxStamina = Math.floor((d.maxStamina || 0) * (100 + tot.skill_staminapercent) / 100);
    if (tot.damagepercent) { d.dmgMin = Math.floor(d.dmgMin * (100 + tot.damagepercent) / 100); d.dmgMax = Math.floor(d.dmgMax * (100 + tot.damagepercent) / 100); }
    // approx: elemental damage added to the weapon (Enchant, Venom, Holy Fire/Freeze/Shock) folded into the swing as its average
    weaponAdd.forEach(function (w) { d.dmgMin += Math.floor(w.min); d.dmgMax += Math.floor(w.max); });
    if (tot.item_tohit_percent) d.ar = Math.floor(d.ar * (100 + tot.item_tohit_percent) / 100);
    if (tot.tohit) d.ar += tot.tohit;
    var defPct = (tot.skill_armor_percent || 0) + (tot.item_armor_percent || 0);
    if (defPct || tot.armorclass) d.def = Math.max(0, Math.floor((d.def + (tot.armorclass || 0)) * (100 + defPct) / 100));
    if (d.res) {
      var maxAdd = { fire: tot.maxfireresist || 0, cold: tot.maxcoldresist || 0, light: tot.maxlightresist || 0, poison: tot.maxpoisonresist || 0 };
      [['fireresist', 'fire'], ['coldresist', 'cold'], ['lightresist', 'light'], ['poisonresist', 'poison']].forEach(function (p) {
        if (tot[p[0]]) d.res[p[1]] = Math.min(75 + maxAdd[p[1]], (d.res[p[1]] || 0) + tot[p[0]]);
      });
    }
    if (tot.velocitypercent) { d.walk = d.walk * (100 + tot.velocitypercent) / 100; d.run = d.run * (100 + tot.velocitypercent) / 100; }
    if (tot.attackrate) d.atkFrames = Math.max(5, Math.round(d.atkFrames * 100 / (100 + tot.attackrate))); // approx: IAS from skills scales the frame count
    if (tot.toblock) d.block = Math.min(75, (d.block || 0) + tot.toblock);
    if (tot.passive_weaponblock) d.weaponBlock = tot.passive_weaponblock;
    if (tot.manarecoverybonus && d.mpRegen != null) d.mpRegen = d.mpRegen * (100 + tot.manarecoverybonus) / 100;
    if (tot.damageresist) d.dmgReducePct = (d.dmgReducePct || 0) + tot.damageresist;
    if (tot.curse_resistance) d.curseResPct = tot.curse_resistance;
    d.d2s = tot;
  };

  /* ------------------------------------------------------------------ móc sát thương (game.js gọi) */
  // nhân sát thương quái nhận theo lời nguyền: Amplify Damage -100% kháng vật lý (= x2), Decrepify -50% (= x1.5)
  D2S.dmgTakenMul = function (m, elem) {
    if (!m || !m.d2s) return 1;
    var e = elemOf(elem);
    if (e !== 'phys') return 1;
    var dr = sumStat(m.d2s, 'damageresist');
    return Math.max(0, (100 - dr) / 100);
  };
  D2S.onMonDamage = function (api, m, amount, elem, fromHero) {
    if (D2S.isFriend(m)) return fromHero ? 0 : amount;
    amount *= D2S.dmgTakenMul(m, elem);
    var c = m.d2s && m.d2s.curse;
    if (c && c.c.lifeTapPct && fromHero) heal(api, amount * c.c.lifeTapPct / 100, 0); // approx: D2 heals on melee only
    return amount;
  };
  D2S.onHeroDamage = function (api, amount, src) {
    var S = api.S, s = st(api), d = S.d || {}, h = S.hero;
    var fromMon = src && src.kind === 'mon', fromMis = src && src.kind === 'missile';
    var elem = fromMis && src.dmg ? elemOf(src.dmg.elem) : 'phys';
    // né: Dodge (cận chiến), Avoid (đạn), Evade (khi đang chạy) [TXT passive_dodge/avoid/evade]
    var t = d.d2s || {};
    if (fromMon && d.dodge && Math.random() * 100 < d.dodge && h.st !== 'attack') { api.floatText(h.x, h.y, 'Dodge', '#cfc'); return 0; }
    if (fromMis && t.passive_avoid && Math.random() * 100 < t.passive_avoid) { api.floatText(h.x, h.y, 'Avoid', '#cfc'); return 0; }
    if ((h.st === 'run' || h.st === 'walk') && t.passive_evade && Math.random() * 100 < t.passive_evade) { api.floatText(h.x, h.y, 'Evade', '#cfc'); return 0; }
    if (elem !== 'phys' && d.res && d.res[elem]) amount = amount * (100 - clamp(d.res[elem], -100, 95)) / 100;
    if (d.dmgReducePct) amount = amount * (100 - clamp(d.dmgReducePct, 0, 50)) / 100;
    // phản đòn: Iron Maiden, Thorns aura, Spirit of Barbs; Frozen/Shiver Armor làm lạnh kẻ đánh
    if (fromMon && !dead(src)) {
      var c = src.d2s && src.d2s.curse;
      if (c && c.c.reflectPct) api.damageMon(src, amount * c.c.reflectPct / 100, 'phys', true);
      var af = auraFx(api);
      if (af && af.aura && af.aura.thornsPct) api.damageMon(src, amount * af.aura.thornsPct / 100, 'phys', true);
      s.pets.forEach(function (p) { if (!dead(p) && p.pet.sm.aura && p.pet.sm.aura.thornsPct && dist(p, h) < p.pet.sm.aura.radius) api.damageMon(src, amount * p.pet.sm.aura.thornsPct / 100, 'phys', false); });
      Object.keys(s.buffs).forEach(function (k) {
        var b = s.buffs[k].b;
        if (b.retaliate && (k === 'shiver_armor')) api.damageMon(src, roll(b.retaliate), 'cold', true);
        if (b.freezeSec && k !== 'chilling_armor' && !dead(src)) stun(api, src, b.freezeSec);
      });
    }
    if (fromMis) Object.keys(s.buffs).forEach(function (k) {
      var b = s.buffs[k].b;
      if (k === 'chilling_armor' && b.retaliate) { var t2 = nearestEnemy(api, h.x, h.y, 16); if (t2) api.spawnMissile(h, t2.x, t2.y, { dmg: { min: b.retaliate.min, max: b.retaliate.max, elem: 'cold' }, art: misArt(api, 'chillingarmorbolt') || 'mis.arrow', speed: 18, owner: 'hero', ar: 9999, life: 1.2 }); }
    });
    // hấp thụ: Bone Armor (vật lý), Cyclone Armor (nguyên tố), Energy Shield (đổi mana)
    Object.keys(s.buffs).forEach(function (k) {
      var r = s.buffs[k];
      if (r.pool != null && r.pool > 0 && amount > 0) {
        var want = r.b.absorb.kind === 'phys' ? elem === 'phys' : elem !== 'phys';
        if (!want) return;
        var take = Math.min(r.pool, amount); r.pool -= take; amount -= take;
      }
      if (r.b.manaShield && amount > 0) {
        var part = amount * clamp(r.b.manaShield.pct, 0, 95) / 100, mp = part * r.b.manaShield.manaPerHp;
        var c2 = S.char;
        if (c2.mp >= mp) { c2.mp -= mp; amount -= part; } else { amount -= c2.mp / r.b.manaShield.manaPerHp; c2.mp = 0; }
      }
    });
    return Math.max(0, amount);
  };

  /* ------------------------------------------------------------------ vẽ */
  D2S.draw = function (api, e, sx, sy) {
    var E = api.E, c = E.ctx, t = (api.S.time - e.t0) * 1000, ok = false;
    if (e.pts && e.pts.length > 1) {
      c.save(); c.strokeStyle = e.color || '#fff'; c.lineWidth = 2; c.globalAlpha = 0.9; c.beginPath();
      e.pts.forEach(function (p, i) {
        var q = E.toScreen(p[0], p[1]), jx = i && i < e.pts.length - 1 ? 0 : 0;
        if (i === 0) c.moveTo(q[0], q[1] - 40); else { var pq = E.toScreen(e.pts[i - 1][0], e.pts[i - 1][1]); c.lineTo((pq[0] + q[0]) / 2 + (Math.random() - 0.5) * 18, (pq[1] + q[1]) / 2 - 40 + (Math.random() - 0.5) * 18); c.lineTo(q[0] + jx, q[1] - 40); }
      });
      c.stroke(); c.restore(); ok = true;
    }
    if (e.art) ok = E.drawSprite(e.art, 'NU', t, e.dir || 0, sx, sy - (e.lift || 0), e.alpha, !e.loop) || ok;
    if (!ok && e.ring) {
      var f = clamp(t / 1000 / Math.max(0.1, e.until - e.t0), 0, 1);
      c.save(); c.globalAlpha = 1 - f; c.strokeStyle = e.color || '#fff'; c.lineWidth = 3;
      c.beginPath(); c.ellipse(sx, sy, e.ring * 16 * Math.max(0.2, f), e.ring * 8 * Math.max(0.2, f), 0, 0, 7); c.stroke(); c.restore();
    }
  };
  // druid biến hình: thân sói/gấu là quái 40/TG của D2; chưa nạp xong sheet thì giữ hình người
  var FORM_ART = { wolf: 'mon.40', bear: 'mon.TG' };
  function drawForm(api, h, sx, sy) {
    var E = api.E, s = st(api), art = s.form && FORM_ART[s.form.form];
    if (!art || !E.hasSheet(art)) { if (art) E.ensure([art]); return false; }
    var town = api.S.def && api.S.def.town;
    var mode = { attack: 'A1', cast: 'A1', walk: 'WL', run: 'RN', hit: 'GH', die: 'DT', dead: 'DT' }[h.st] || 'NU';
    if ((h.st === 'attack' || h.st === 'cast') && h.act && E.animOf(art, h.act.mode)) mode = h.act.mode;
    if (h.st === 'walk' && town && E.animOf(art, 'WL')) mode = 'WL';
    if (!E.animOf(art, mode)) mode = 'NU';
    return E.drawSprite(art, mode, h.stT, h.dir, sx, sy, 1, h.st === 'die' || h.st === 'dead');
  }
  // đồng minh không có hình riêng: vẽ bằng hình hero (Decoy, Shadow) hoặc khối xanh thay vì khối đỏ của quái
  D2S.drawUnit = function (api, e, sx, sy) {
    var E = api.E, S = api.S;
    if (e === S.hero) return drawForm(api, e, sx, sy);
    if (!e.ally || e.hostile) return false;
    var mode = e.st === 'attack' || e.st === 'cast' ? (e.act && e.act.mode) || 'A1' : e.st === 'run' ? 'RN' : e.st === 'walk' ? 'WL' : e.st === 'die' || e.st === 'dead' ? 'DT' : 'NU';
    if (e.pet && (e.pet.heroLook || e.pet.look)) {
      var look = e.pet.look || api.heroLook(); if (!E.heroCof(look, mode)) mode = 'NU';
      E.ctx.save(); E.ctx.globalAlpha = e.pet.look ? 1 : e.pet.skill === 'decoy' ? 0.75 : 0.6;
      var ok = E.drawHero(look, mode, e.stT, e.dir, sx, sy, 1, e.st === 'die' || e.st === 'dead');
      E.ctx.restore();
      return ok;
    }
    if (e.art && E.hasSheet(e.art)) return false;
    E.drawBlob(sx, sy, e.st === 'dead' ? '#243' : '#5c9', e.pet && e.pet.ai === 'wall' ? 9 : 11, e.dir, null);
    return true;
  };

  g.D2S = D2S;
  if (typeof module !== 'undefined' && module.exports) module.exports = D2S;
})(typeof window !== 'undefined' ? window : globalThis);
