/* Ác Quỷ II - game.js
 * Vòng lặp, thực thể (máy trạng thái idle|walk|run|attack|cast|hit|die|dead), AI quái D2, chiến đấu qua D2R,
 * đạn, đồ rơi, XP, nhiệm vụ Den of Evil, chết/hồi sinh, lưu/nạp.
 * Mọi chỗ đọc D2DATA/D2R đều đi qua bộ chuyển D2.DA ở đầu tệp (đổi tên trường chỉ sửa ở đó).
 */
(function () {
  'use strict';
  var D2 = window.D2 = window.D2 || {};
  var E = D2.E, I = D2.Input, UI = D2.UI, A = window.D2_ASSETS || {};
  var VER = '20261001c';
  var SAVE_KEY = 'd2web.save.v1';

  function safe(fn, fb) { try { var v = fn(); return v == null ? fb : v; } catch (e) { return fb; } }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* ================================================================ D2.DA: bộ chuyển dữ liệu */
  var DA = D2.DA = {};
  var CLASSES = [
    { id: 'amazon', name: 'Amazon', locked: false, gender: 'female', blurb: 'Cung thủ và giáo thủ nhanh nhẹn.' },
    { id: 'sorceress', name: 'Sorceress', locked: false, gender: 'female', blurb: 'Pháp sư lửa, băng, sét. Mong manh nhưng đau.' },
    { id: 'barbarian', name: 'Barbarian', locked: false, gender: 'male', blurb: 'Chiến binh cận chiến trâu bò.' },
    { id: 'necromancer', name: 'Necromancer', locked: true, gender: 'male' },
    { id: 'paladin', name: 'Paladin', locked: true, gender: 'male' },
    { id: 'druid', name: 'Druid', locked: true, gender: 'male' },
    { id: 'assassin', name: 'Assassin', locked: true, gender: 'female' }
  ];
  var TABS = {
    amazon: ['Bow and Crossbow', 'Passive and Magic', 'Javelin and Spear'],
    sorceress: ['Fire', 'Lightning', 'Cold'], barbarian: ['Warcries', 'Combat Masteries', 'Combat Skills']
  };
  function coll(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    return Object.keys(x).map(function (k) { var v = x[k]; if (v && typeof v === 'object' && v.id == null) v.id = k; return v; });
  }
  DA.classList = function () {
    var dc = window.D2DATA && D2DATA.classes ? coll(D2DATA.classes) : [];
    return CLASSES.map(function (c) {
      var d = dc.filter(function (x) { return x.id === c.id; })[0] || {};
      return { id: c.id, name: d.name || c.name, locked: c.locked, gender: c.gender, blurb: c.blurb };
    });
  };
  DA.classInfo = function (id) { return CLASSES.filter(function (c) { return c.id === id; })[0] || CLASSES[0]; };
  DA.className = function (id) { return DA.classInfo(id).name; };
  DA.tabNames = function (cls) {
    var d = window.D2DATA && D2DATA.classes && (D2DATA.classes[cls] || coll(D2DATA.classes).filter(function (c) { return c.id === cls; })[0]);
    return (d && d.tabs) || TABS[cls] || ['Tab 1', 'Tab 2', 'Tab 3'];
  };

  var skCache = null;
  function buildSkills() {
    skCache = {}; var byCls = {};
    coll(window.D2DATA && D2DATA.skills).forEach(function (s) {
      var cls = s.cls || s.class || s.classId || s.char;
      var tab = s.tab != null ? s.tab - 1 : 0;   // dữ liệu D2: tab/row/col tính từ 1
      var pre = s.prereq || s.requires || s.pre || s.prereqs || [];
      if (typeof pre === 'string') pre = [pre];
      var o = {
        id: s.id, name: s.name || s.id, cls: cls, tab: tab, row: s.row != null ? s.row - 1 : null, col: s.col != null ? s.col - 1 : null,
        req: s.reqlvl != null ? s.reqlvl : 1, prereq: pre.slice(), icon: s.icon, max: s.maxlvl || 20,
        passive: !!(s.t && s.t.passive), desc: s.desc || '', raw: s
      };
      skCache[o.id] = o; (byCls[cls] = byCls[cls] || []).push(o);
    });
    // bố cục: hàng theo độ sâu tiên quyết, cột theo thứ tự
    Object.keys(byCls).forEach(function (cls) {
      [0, 1, 2].forEach(function (tab) {
        var list = byCls[cls].filter(function (k) { return k.tab === tab; });
        function depth(k, seen) {
          if (k._d != null) return k._d;
          var d = 0; k.prereq.forEach(function (q) { var p = skCache[q]; if (p && !(seen && seen[q])) d = Math.max(d, 1 + depth(p, (seen || {}))); });
          return (k._d = d);
        }
        list.forEach(function (k) { depth(k); });
        var used = {};
        list.sort(function (a, b) { return a.req - b.req; });
        list.forEach(function (k) {
          if (k.row == null) k.row = Math.min(5, Math.max(k._d, Math.floor((k.req - 1) / 6)));
          if (k.col == null) { var c = 0; while (used[k.row + ',' + c]) c++; k.col = Math.min(c, 2); }
          used[k.row + ',' + k.col] = 1;
        });
      });
    });
  }
  DA.skillsOf = function (cls) {
    if (!skCache) buildSkills();
    return Object.keys(skCache).map(function (k) { return skCache[k]; }).filter(function (s) { return s.cls === cls; });
  };
  DA.skill = function (id) {
    if (!id) return null;
    if (!skCache) buildSkills();
    return skCache[id] || null;
  };

  /* Biểu tượng kỹ năng: id kỹ năng D2 -> danh sách tên icon quyền năng Flare (lấy tên đầu tiên có trong D2_ASSETS.powerIcons).
   * Thiếu powerIcons hoặc tên -> trả null, UI quay về ô chữ. */
  var SK_ICON_RAW = {   // tên icon theo D2_ASSETS.powerIcons (tên quyền năng Flare)
    // Sorceress
    fire_bolt: 'fireball,ember_shot', fire_ball: 'fireball', fire_wall: 'burn,ember_shot', meteor: 'quake,fireball', inferno: 'burn,ember_shot', blaze: 'burn',
    hydra: 'fireball,summon_skeleton', fire_mastery: 'burn,fireball', enchant: 'enchanted_blade',
    ice_bolt: 'ice_bolt,freeze', ice_blast: 'freeze,ice_bolt', frost_nova: 'freeze', glacial_spike: 'ice_bolt,freeze', blizzard: 'freeze,ice_bolt',
    frozen_orb: 'freeze,ice_bolt', cold_mastery: 'freeze',
    frozen_armor: 'shield,barrier', shiver_armor: 'barrier,shield', chilling_armor: 'shield,barrier', warmth: 'energy_flow,shield', energy_shield: 'barrier,shield',
    charged_bolt: 'shock', static_field: 'shock', telekinesis: 'mystic_blast', nova: 'shock,thunderstrike', lightning: 'thunderstrike,shock',
    chain_lightning: 'thunderstrike,shock', teleport: 'teleport', thunder_storm: 'thunderstrike', lightning_mastery: 'shock,thunderstrike',
    // Amazon
    magic_arrow: 'shoot', fire_arrow: 'ember_shot,shoot', cold_arrow: 'ice_bolt,shoot', multiple_shot: 'multishot', exploding_arrow: 'charged_shot,ember_shot', ice_arrow: 'freeze,ice_bolt',
    guided_arrow: 'piercing_shot', strafe: 'rapid_fire', immolation_arrow: 'burn,ember_shot', freezing_arrow: 'freeze,ice_bolt',
    jab: 'swing', impale: 'piercing_shot', fend: 'cleave', power_strike: 'shield_bash,swing', charged_strike: 'shock', lightning_strike: 'thunderstrike,shock',
    lightning_bolt: 'shock', lightning_fury: 'thunderstrike', poison_javelin: 'poison_shot', plague_javelin: 'poison_shot', slow_missiles: 'freeze',
    inner_sight: 'wolf_s_eye', decoy: 'barrier,turn_invisible', valkyrie: 'summon_skeleton', critical_strike: 'cleave', dodge: 'haste', avoid: 'haste', evade: 'haste', penetrate: 'piercing_shot', pierce: 'piercing_shot',
    // Barbarian
    bash: 'shield_bash', double_swing: 'cleave', stun: 'shield_bash', concentrate: 'cleave', frenzy: 'swing,haste', berserk: 'vampirism,burn', leap: 'quake', leap_attack: 'quake,cleave',
    whirlwind: 'cleave', double_throw: 'throw_axe', howl: 'warcry', taunt: 'warcry', shout: 'warcry', war_cry: 'warcry,quake', battle_cry: 'warcry',
    battle_orders: 'energy_flow', battle_command: 'haste,energy_flow', grim_ward: 'stone_wall', find_item: 'treasure_potion', find_potion: 'health_potion', iron_skin: 'shield,barrier',
    increased_speed: 'haste', increased_stamina: 'stamina_potion', natural_resistance: 'elemental_potion',
    axe_mastery: 'swing', mace_mastery: 'swing', pole_arm_mastery: 'swing', spear_mastery: 'swing', sword_mastery: 'swing', throwing_mastery: 'throw_knife'
  };
  var SK_ICON = {};
  Object.keys(SK_ICON_RAW).forEach(function (k) { SK_ICON[k] = SK_ICON_RAW[k].split(','); });
  DA.skillIcon = function (id) {
    var pi = A.powerIcons, names = SK_ICON[id];
    if (!pi || !names) return null;
    for (var i = 0; i < names.length; i++) { var v = pi[names[i]]; if (v == null) v = pi['power.' + names[i]]; if (typeof v === 'number') return v; }
    return null;
  };

  DA.itemName = function (it) {
    if (!it) return '';
    var nm = it.name || safe(function () { return D2R.itemName(it); }, '');
    if (!nm || nm === it.base) { var b = DA.base(it); nm = (b && b.name) || String(it.base || 'Item'); }
    return nm;
  };
  DA.itemLines = function (it) {
    if (it.potion || DA.potionInfo(it)) {
      var p = DA.potionInfo(it); var out = [];
      if (p.hp) out.push('Hồi ' + p.hp + ' sinh lực trong ' + p.dur + ' giây');
      if (p.mp) out.push('Hồi ' + p.mp + ' mana trong ' + p.dur + ' giây');
      return out;
    }
    var r = safe(function () { return D2R.itemStats(it); }, []);
    if (typeof r === 'string') r = r.split('\n');
    if (!Array.isArray(r)) r = Object.keys(r).map(function (k) { return k + ': ' + r[k]; });
    r = r.map(function (x) { return typeof x === 'string' ? x : (x && (x.text || x.label)) || JSON.stringify(x); });
    return r;
  };
  var POTS = ['hp1', 'hp2', 'hp3', 'mp1', 'mp2', 'mp3'];
  DA.POTS = POTS;
  DA.base = function (it) { return it && window.D2DATA && D2DATA.items && D2DATA.items.bases && D2DATA.items.bases[it.base] || null; };
  DA.makeItem = function (code, q) { return D2R.makeItem(code, (D2DATA.items.bases[code].level || 1), q || 'normal', null); };
  DA.makePotion = DA.makeItem;
  // Bình thuốc: số liệu từ D2R.potionEffect (misc.txt stat/calc/len, nhân hệ số của lớp); hồi dần theo thời gian.
  DA.potionInfo = function (it) {
    if (!it) return null;
    var b = DA.base(it);
    if (!b || !/^(hpot|mpot|rpot)$/.test(b.type || '') || !b.useable) return null;
    var pe = safe(function () { return D2R.potionEffect(it, S.char); }, null); if (!pe) return null;
    if (pe.hpPct) { var d = S.d || { maxHp: 100, maxMp: 50 }; return { hp: Math.round(d.maxHp * pe.hpPct / 100), mp: Math.round(d.maxMp * pe.mpPct / 100), dur: 0.6 }; }
    if (!pe.hp && !pe.mp) return null;
    return { hp: pe.hp || 0, mp: pe.mp || 0, dur: Math.max(0.6, pe.seconds || 4) };
  };
  DA.req = function (it) { var b = DA.base(it) || {}; return { lvl: Math.max(it.reqlvl || 0, b.reqlvl || 0), str: b.reqstr || 0, dex: b.reqdex || 0 }; };
  // Biểu tượng đồ: lấy khung cuối của sheet loot.* (hình món đồ nằm dưới đất) đặt vừa ô túi đồ.
  DA.iconBox = function (it, bw, bh) {
    var key = lootArt(it), sh = A.sheets && A.sheets[key]; if (!sh || !sh.anims) return null;
    var an = sh.anims.power || sh.anims[Object.keys(sh.anims)[0]]; if (!an || !an.f) return null;
    var fr = an.f[an.f.length - 1], r = fr && (fr[0] || fr[4]); if (!r) return null;
    var k = Math.min(bw / r[2], bh / r[3], 1.6), w = Math.round(r[2] * k), h = Math.round(r[3] * k);
    return 'width:' + w + 'px;height:' + h + 'px;background:url(' + sh.img + (E.ver ? '?v=' + E.ver : '') + ') no-repeat -' + Math.round(r[0] * k) + 'px -' + Math.round(r[1] * k) + 'px / ' + Math.round(sh.w * k) + 'px ' + Math.round(sh.h * k) + 'px;';
  };
  DA.isEquippable = function (it) {
    var b = DA.base(it); if (!b) return true;
    return b.kind === 'weapon' || b.kind === 'armor' || /ring|amul/.test(b.type);
  };
  // Hàng bán của NPC, dựng từ bảng đồ D2 (cấp thấp, loại thường).
  DA.shopStock = function (npcId) {
    var bases = D2DATA.items.bases, out = [];
    function pickFrom(list, n) { var arr = list.slice(), r = []; while (arr.length && r.length < n) r.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]); return r; }
    var all = Object.keys(bases).map(function (k) { return bases[k]; }).filter(function (b) { return b.tier === 'normal' && b.spawnable && (b.level || 0) <= 12; });
    if (npcId === 'akara') {
      POTS.forEach(function (c) { if (bases[c]) out.push(DA.makeItem(c)); });
      if (bases.tsc) out.push(DA.makeItem('tsc'));
      pickFrom(all.filter(function (b) { return /^(staf|wand|orb)$/.test(b.type); }), 3).forEach(function (b) { out.push(DA.makeItem(b.code)); });
    } else if (npcId === 'charsi') {
      pickFrom(all.filter(function (b) { return b.kind === 'weapon' && !/bow|jave|spea|aspe|ajav|abow|xbow|orb|wand|staf|tpot|h2h/.test(b.type); }), 6).forEach(function (b) { out.push(DA.makeItem(b.code)); });
      pickFrom(all.filter(function (b) { return b.kind === 'armor'; }), 6).forEach(function (b) { out.push(DA.makeItem(b.code)); });
    } else if (npcId === 'gheed') {
      pickFrom(all.filter(function (b) { return b.kind === 'weapon' || b.kind === 'armor' || /ring|amul/.test(b.type); }), 8).forEach(function (b) { out.push(DA.makeItem(b.code)); });
    }
    return out;
  };
  DA.buyPrice = function (it) { var b = DA.base(it); return it.price || it.value || it.cost || (b && b.cost) || (10 * (it.ilvl || 1)); };
  DA.sellPrice = function (it) { return Math.max(1, Math.floor(DA.buyPrice(it) / 4)); };
  DA.isGold = function (it) { return !!it && (it.gold != null || it.base === 'gold' || it.q === 'gold' || it.kind === 'gold'); };
  DA.goldAmount = function (it) { return Math.round(it.gold != null ? it.gold : it.amount != null ? it.amount : it.qty != null ? it.qty : it.val || it.value || 1); };
  DA.slotOf = function (it) {
    if (it.slot) return it.slot === 'weapon' ? 'rhand' : it.slot === 'armor' ? 'body' : it.slot === 'shield' ? 'lhand' : it.slot;
    var b = DA.base(it), t = (b && b.type) || '';
    var m = { helm: 'head', phlm: 'head', circ: 'head', head: 'head', pelt: 'head', tors: 'body', shie: 'lhand', ashd: 'lhand', glov: 'gloves', boot: 'boots', belt: 'belt', ring: 'ring1', amul: 'amulet' };
    if (m[t]) return m[t];
    if (b && b.kind === 'weapon') return 'rhand';
    var str = ((it.type || '') + ' ' + (it.base || '') + ' ' + (it.name || '')).toLowerCase();
    if (/ring/.test(str)) return 'ring1';
    if (/amulet/.test(str)) return 'amulet';
    return 'rhand';
  };
  var XP = [0, 0, 500, 1500, 3750, 7875, 14175, 22680, 32886, 44396, 57715, 72144, 90180, 112725, 140906, 176132, 220165, 275207, 344008, 430010, 537513, 671891, 839864, 1049830, 1312287, 1640359, 2050449, 2563061, 3203826, 4004782, 5005977];
  DA.xpFor = function (lvl) {
    var t = window.D2DATA && D2DATA.experience && D2DATA.experience.toNext;
    if (t && t[lvl - 1] != null) return t[lvl - 1];
    return XP[Math.min(lvl, XP.length - 1)] || XP[XP.length - 1] * Math.pow(1.25, lvl - XP.length + 1);
  };
  var AREA_FB = {
    rogue_encampment: { id: 'rogue_encampment', name: 'Rogue Encampment', lvl: 1, town: true, music: 'town', tileset: 'grassland', monsters: [] },
    blood_moor: { id: 'blood_moor', name: 'Blood Moor', lvl: 1, tileset: 'grassland', music: 'overworld', monsters: ['fallen'] },
    den_of_evil: { id: 'den_of_evil', name: 'Den of Evil', lvl: 2, tileset: 'cave', music: 'cave', monsters: ['fallen'] }
  };
  DA.area = function (id) {
    var a = coll(window.D2DATA && D2DATA.areas).filter(function (x) { return x.id === id; })[0];
    return a || null;
  };
  DA.monster = function (id) {
    var m = window.D2DATA && D2DATA.monsters && (Array.isArray(D2DATA.monsters) ? D2DATA.monsters.filter(function (x) { return x.id === id; })[0] : D2DATA.monsters[id]);
    return m || null;
  };
  DA.aiKind = function (monId, m) {
    var k = ((m && m.aiKind) || '') + ' ' + monId;
    if (/shaman/.test(k)) return 'shaman';
    if (/ranged/.test(k)) return 'ranged';
    if (/flee/.test(k)) return 'fallen';
    return 'melee';
  };

  /* ================================================================ trạng thái */
  var S = {
    char: null, d: null, grid: null, areaId: null, areaName: '', ents: [], hero: null, hover: null, target: null,
    stamina: 100, stamMax: 100, leftSkill: null, rightSkill: null, fkeys: [null, null, null, null, null, null, null, null],
    runOn: true, time: 0, denLeft: null, paused: false, regen: [], floaters: [], scene: 'boot', seed: 1,
    corpse: null, nextId: 1, shop: null, arrive: 0, kills: 0, buffs: {}, lastSave: 0
  };
  var Game = D2.Game = { S: S };

  function mk(kind, x, y, extra) {
    var e = { id: S.nextId++, kind: kind, x: x, y: y, dir: 5, st: 'idle', stT: 0, stDur: 0 };
    if (extra) for (var k in extra) e[k] = extra[k];
    S.ents.push(e); return e;
  }
  function setSt(e, st, dur) {
    if (e.st !== st) { e.st = st; e.stT = 0; }
    e.stDur = dur || 0;
  }
  function restart(e, st, dur) { e.st = st; e.stT = 0; e.stDur = dur || 0; }

  function dv() {
    var c = S.char;
    var d = safe(function () { return D2R.derived(c); }, null) || {};
    d.maxHp = d.maxHp || 50; d.maxMp = d.maxMp || 20; d.dmgMin = d.dmgMin != null ? d.dmgMin : 2; d.dmgMax = d.dmgMax != null ? d.dmgMax : 5;
    d.ar = d.ar || 20; d.def = d.def || 0; d.atkFrames = d.atkFrames || 15; d.res = d.res || {};
    return d;
  }
  function recalc() {
    var c = S.char; S.d = dv();
    c.hp = Math.min(c.hp, S.d.maxHp); c.mp = Math.min(c.mp, S.d.maxMp);
    S.stamMax = S.d.maxStamina || S.d.stamina || (80 + c.vit * 1.0 + c.lvl * 2);
    S.stamina = Math.min(S.stamina, S.stamMax);
    UI.dirty = true;
  }
  Game.recalc = recalc;

  /* ================================================================ lưới & đường đi */
  function blocked(g, x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= g.w || iy >= g.h) return true;
    return g.col[iy * g.w + ix] !== 0;
  }
  function walkable(x, y) { return !blocked(S.grid, x, y); }
  function canStand(x, y, r) {
    var g = S.grid; r = r == null ? 0.22 : r;
    return !blocked(g, x - r, y - r) && !blocked(g, x + r, y - r) && !blocked(g, x - r, y + r) && !blocked(g, x + r, y + r);
  }
  function tryMove(e, dx, dy) {
    var nx = e.x + dx, ny = e.y + dy;
    if (canStand(nx, ny)) { e.x = nx; e.y = ny; return true; }
    if (canStand(nx, e.y)) { e.x = nx; return true; }
    if (canStand(e.x, ny)) { e.y = ny; return true; }
    return false;
  }
  function los(ax, ay, bx, by) {
    var d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.3);
    for (var i = 1; i < n; i++) { var t = i / n; if (!canStand(ax + (bx - ax) * t, ay + (by - ay) * t, 0.15)) return false; }
    return true;
  }
  // Tìm đường A* 8 hướng, không cắt góc. Trả về mảng điểm [x,y] (tâm ô) hoặc null.
  // Lưới 200x200: không cấp phát lại 3 mảng 40000 phần tử mỗi lần; giới hạn vùng tìm (bbox đầu-cuối + PF_MARGIN ô) và PF_MAX_NODES nút.
  var PF = { N: 0, g: null, from: null, stamp: null, gen: 0 }, PF_MARGIN = 40, PF_MAX_NODES = 14000;
  function findPath(sx, sy, tx, ty, margin) {
    if (margin == null) margin = PF_MARGIN;
    var g = S.grid, w = g.w, h = g.h, col = g.col;
    var s0 = [Math.floor(sx), Math.floor(sy)], t0 = [Math.floor(tx), Math.floor(ty)];
    function open(x, y) { return x >= 0 && y >= 0 && x < w && y < h && col[y * w + x] === 0; }
    if (!open(t0[0], t0[1])) {   // ô đích bị chặn: tìm ô đi được gần nhất
      var best = null, bd = 1e9;
      for (var r = 1; r <= 4 && !best; r++) for (var yy = t0[1] - r; yy <= t0[1] + r; yy++) for (var xx = t0[0] - r; xx <= t0[0] + r; xx++) {
        if (open(xx, yy)) { var dd = Math.hypot(xx - tx, yy - ty); if (dd < bd) { bd = dd; best = [xx, yy]; } }
      }
      if (!best) return null; t0 = best;
    }
    if (!open(s0[0], s0[1])) return null;
    var N = w * h;
    if (PF.N !== N) { PF.N = N; PF.g = new Float32Array(N); PF.from = new Int32Array(N); PF.stamp = new Int32Array(N); PF.gen = 0; }
    var gS = PF.g, from = PF.from, stamp = PF.stamp, gen = ++PF.gen;   // stamp[i] === gen: nút đã chạm trong lượt này; stamp[i] === -gen: đã đóng
    var wx0 = Math.max(0, Math.min(s0[0], t0[0]) - margin), wx1 = Math.min(w - 1, Math.max(s0[0], t0[0]) + margin);
    var wy0 = Math.max(0, Math.min(s0[1], t0[1]) - margin), wy1 = Math.min(h - 1, Math.max(s0[1], t0[1]) + margin);
    var heap = [], si = s0[1] * w + s0[0], ti = t0[1] * w + t0[0];
    function hf(x, y) { var dx = Math.abs(x - t0[0]), dy = Math.abs(y - t0[1]); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); }
    function push(i, f) {
      heap.push([f, i]); var k = heap.length - 1;
      while (k > 0) { var p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; var t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; }
    }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; var k = 0, n = heap.length;
        for (;;) { var l = 2 * k + 1, r2 = l + 1, m = k; if (l < n && heap[l][0] < heap[m][0]) m = l; if (r2 < n && heap[r2][0] < heap[m][0]) m = r2; if (m === k) break; var t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; }
      }
      return top;
    }
    gS[si] = 0; from[si] = -1; stamp[si] = gen; push(si, hf(s0[0], s0[1]));
    var DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1], iter = 0, found = false;
    while (heap.length && iter++ < PF_MAX_NODES) {
      var cur = pop()[1]; if (stamp[cur] === -gen) continue; stamp[cur] = -gen;
      if (cur === ti) { found = true; break; }
      var cx = cur % w, cy = (cur / w) | 0;
      for (var k = 0; k < 8; k++) {
        var nx = cx + DX[k], ny = cy + DY[k];
        if (nx < wx0 || nx > wx1 || ny < wy0 || ny > wy1 || !open(nx, ny)) continue;
        if (k >= 4 && (!open(cx + DX[k], cy) || !open(cx, cy + DY[k]))) continue;
        var ni = ny * w + nx, ng = gS[cur] + (k < 4 ? 1 : 1.414);
        if (stamp[ni] === -gen) continue;
        if (stamp[ni] !== gen || ng < gS[ni]) { stamp[ni] = gen; gS[ni] = ng; from[ni] = cur; push(ni, ng + hf(nx, ny)); }
      }
    }
    if (!found) return margin < 1e6 ? findPath(sx, sy, tx, ty, 1e6) : null;   // vòng đường dài hơn cửa sổ: thử lại toàn bản đồ (vẫn bị trần nút)
    var path = [], c = ti;
    while (c !== si && c >= 0) { path.push([(c % w) + 0.5, ((c / w) | 0) + 0.5]); c = from[c]; }
    path.reverse();
    return path;
  }

  /* ================================================================ vào khu vực */
  function areaDef(id) { return DA.area(id) || AREA_FB[id] || null; }
  function musicFor(def, g) {
    var m = def && def.music; if (m && A.music && A.music[m]) return m;
    if (def && def.town) return 'town';
    return g.tileset === 'cave' ? 'cave' : g.tileset === 'dungeon' ? 'dungeon' : 'overworld';
  }
  Game.playAreaMusic = function () { var d = areaDef(S.areaId); if (d && S.grid) E.music(musicFor(d, S.grid)); };

  function sheetsForArea(def, g) {
    var keys = [];
    coll(def && def.monsters).forEach(function (m) { var id = typeof m === 'string' ? m : m.id; var mm = DA.monster(id); if (mm && mm.art) keys.push(mm.art); });
    g.npcs.forEach(function (n) { keys.push(npcArt(n.id)); });
    (g.objects || []).forEach(function (o) { var t = townObj(o.type); if (t && t.sheet) keys.push(t.sheet); });
    Object.keys(A.sheets || {}).forEach(function (k) { if (k.indexOf('power.') === 0 || k.indexOf('loot.') === 0) keys.push(k); });
    return keys;
  }

  function enterArea(id, from, opts) {
    opts = opts || {};
    var def = areaDef(id);
    if (!def || !window.D2G) { UI.msg('Khu vực này chưa mở trong bản MVP.'); return Promise.resolve(false); }
    UI.showLoad(true, 'Đang vào ' + def.name + '...');
    var seed = (S.corpse && S.corpse.area === id) ? S.corpse.seed : ((Math.random() * 1e9) | 0) + 1;
    if (opts.seed) seed = opts.seed;
    var g = D2G.build(id, seed);
    S.seed = seed;
    var char = S.char;
    var objTs = {}; (g.objects || []).forEach(function (o) { var t = townObj(o.type); if (t && (t.tile != null || t.parts)) objTs[t.tileset || g.tileset] = 1; });
    return Promise.all([E.ensureTileset(g.tileset), E.ensure(sheetsForArea(def, g)), E.ensureIcons(), E.ensure(heroSheetKeys())].concat(Object.keys(objTs).map(E.ensureTileset))).then(function () {
      S.grid = g; g.seen = new Uint8Array(g.w * g.h); S.areaId = id; S.areaName = def.name; S.def = def;
      E.setGrid(g);
      S.ents = []; S.floaters = []; S.target = null; S.hover = null;
      var hx = g.hero[0] + 0.5, hy = g.hero[1] + 0.5;
      if (from) {
        var ex = g.exits.filter(function (e) { return e.to === from; })[0];
        if (ex) { var sp = openCellNear(g, ex.x, ex.y, 3.5); hx = sp[0]; hy = sp[1]; }
      }
      var hero = S.hero = mk('hero', hx, hy, { dir: 5, path: null, goal: null, act: null });
      E.cam.x = hx; E.cam.y = hy;
      (g.objects || []).forEach(function (o) {   // đồ vật của khu: vẽ theo chiều sâu cùng thực thể; chỉ waypoint và kho đồ nhấp được
        var w = o.w || 1, hh = o.h || 1;
        mk('obj', o.x + w / 2, o.y + hh / 2, { otype: o.type, ow: w, oh: hh, cx: o.x, cy: o.y });
      });
      g.npcs.forEach(function (n) { mk('npc', n.x + 0.5, n.y + 0.5, { npc: n.id, dir: 5, art: npcArt(n.id) }); });
      spawnMonsters(def, g, seed);
      if (S.corpse && S.corpse.area === id) mk('drop', S.corpse.x, S.corpse.y, { item: null, corpse: S.corpse, born: S.time, label: 'Xác của ' + char.name });
      S.arrive = S.time;
      if (id === 'den_of_evil') {
        S.denLeft = S.ents.filter(function (e) { return e.kind === 'mon'; }).length;
        if (char.quests.den_of_evil === 'cleared') S.denLeft = 0;
      } else S.denLeft = S.denLeft;
      E.music(musicFor(def, g));
      UI.showLoad(false);
      UI.dirty = true; recalc();
      markSeen();
      return true;
    });
  }
  function openCellNear(g, x, y, minD) {
    // BFS từ ô lối ra, lấy ô đi được cách lối ra >= minD
    var q = [[x, y]], seen = {}, best = null; seen[x + ',' + y] = 1;
    for (var i = 0; i < q.length && i < 4000; i++) {
      var c = q[i]; var d = Math.hypot(c[0] - x, c[1] - y);
      if (d >= minD && g.col[c[1] * g.w + c[0]] === 0) { best = c; break; }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
        var nx = c[0] + o[0], ny = c[1] + o[1], k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || seen[k] || g.col[ny * g.w + nx] !== 0) return;
        seen[k] = 1; q.push([nx, ny]);
      });
    }
    return best ? [best[0] + 0.5, best[1] + 0.5] : [x + 0.5, y + 0.5];
  }

  function npcArt(id) {
    var m = { akara: 'npc.peasant_woman1', charsi: 'npc.peasant_woman2', gheed: 'npc.wandering_trader', kashya: 'npc.knight', warriv: 'npc.peasant_man1', deckard_cain: 'npc.peasant_man2', cain: 'npc.peasant_man2' };
    return m[id] || 'npc.peasant_man1';
  }

  /* ---------------------------------------------------------------- quái */
  function spawnMonsters(def, g, seed) {
    if (def.town) return;
    var rng = safe(function () { return D2R.rng(seed ^ 0x5bd1); }, Math.random);
    var types = coll(def.monsters).map(function (m) { return typeof m === 'string' ? m : m.id; });
    if (!types.length) return;
    var pid = 0;
    g.spawns.forEach(function (sp) {
      pid++;
      var id = types[Math.floor(rng() * types.length)], special = null;
      if (sp.id && DA.monster(sp.id)) id = sp.id; else if (sp.id) special = sp.id;
      var n = Math.max(1, sp.n || 1);
      for (var i = 0; i < n; i++) {
        var p = openAround(g, sp.x + 0.5, sp.y + 0.5, i === 0 ? 0 : 2.2, rng);
        var rank = sp.kind === 'champion' ? 'champion' : (sp.kind === 'unique' && i === 0) ? 'unique' : 'normal';
        var mid = (i > 0 && sp.kind === 'unique' && types.length) ? types[Math.floor(rng() * types.length)] : id;
        makeMonster(mid, p[0], p[1], rank, pid, rng, special && i === 0 ? special : null);
      }
    });
  }
  function openAround(g, x, y, r, rng) {
    for (var t = 0; t < 20; t++) {
      var a = rng() * 6.283, d = rng() * r, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (canStand(px, py, 0.3)) return [px, py];
    }
    return [x, y];
  }
  function makeMonster(id, x, y, rank, pack, rng, nameOverride) {
    var def = S.def, lvl = (def && def.lvl) || 1;
    var inst = safe(function () { return D2R.rollMonster(id, lvl, rng || Math.random, rank); }, null) || { id: id, name: id, lvl: lvl, hp: 10 + lvl * 6, xp: 10 * lvl, dmgMin: 1, dmgMax: 4, ar: 20, def: 5 };
    if (nameOverride) inst.name = nameOverride.charAt(0).toUpperCase() + nameOverride.slice(1);
    var m = DA.monster(id) || {};
    inst.name = inst.name || m.name || id;
    var hp = inst.hp != null ? inst.hp : inst.maxHp || 10;
    var spd = inst.run || inst.walk || m.runVel || m.walkVel;
    var e = mk('mon', x, y, {
      monId: id, inst: inst, rank: rank, pack: pack, art: m.art || inst.art || null, ai: DA.aiKind(id, m), hp: hp, maxHp: hp,
      speed: spd ? clamp(spd * 0.5, 1.2, 4.6) : 2.4, aggro: false, cd: rnd(0.2, 1.2), act: null,
      dir: ri(0, 7), flee: 0, born: S.time, deadAt: 0, rez: 0, wander: 0, stuck: 0, hitFlash: 0
    });
    return e;
  }

  /* ---------------------------------------------------------------- hero look */
  function heroSheetKeys(L0) {
    var keys = []; var L = L0 || heroLayers(); Object.keys(L).forEach(function (k) { keys.push(L[k]); }); return keys;
  }
  var heroLayerCache = null, heroLayerSig = '';

  /* Hình dạng nhân vật theo trang bị (D2: đồ mặc trên người quyết định hình; không có đồ thì lớp vẫn mặc bộ nhẹ gốc).
   * Khoá lớp Flare (không kèm giới tính): xem avatarLayers.slots trong manifest. Bảng, không if-chuỗi. */
  var CLASS_BASE = {   // bộ đồ gốc khi chưa mặc gì: slot -> lớp
    sorceress:   { head: 'head_long',  chest: 'mage_vest',    legs: 'mage_skirt', feet: 'mage_boots', hands: 'default_hands' },
    amazon:      { head: 'head_long',  chest: 'leather_chest', legs: 'leather_pants', feet: 'leather_boots', hands: 'default_hands' },
    barbarian:   { head: 'head_short', chest: 'default_chest', legs: 'cloth_pants', feet: 'leather_boots', hands: 'default_hands' },
    necromancer: { head: 'head_short', chest: 'cloth_shirt',   legs: 'cloth_pants', feet: 'cloth_sandals', hands: 'default_hands' },
    paladin:     { head: 'head_short', chest: 'chain_cuirass', legs: 'cloth_pants', feet: 'leather_boots', hands: 'default_hands' },
    druid:       { head: 'head_short', chest: 'leather_chest', legs: 'leather_pants', feet: 'leather_boots', hands: 'default_hands' },
    assassin:    { head: 'head_long',  chest: 'leather_chest', legs: 'leather_pants', feet: 'leather_boots', hands: 'default_hands' }
  };
  var LOOK_BY_CODE = {   // mã đồ D2 -> lớp Flare (ưu tiên hơn kiểu đồ)
    // giáp thân: nhẹ -> da, vừa -> xích, nặng -> tấm
    qui: 'leather_chest', lea: 'leather_chest', hla: 'leather_chest',
    stu: 'chain_cuirass', rng: 'chain_cuirass', scl: 'chain_cuirass', brs: 'chain_cuirass', chn: 'chain_cuirass',
    spl: 'plate_cuirass', plt: 'plate_cuirass', fld: 'plate_cuirass', gth: 'plate_cuirass', ful: 'plate_cuirass', ltp: 'plate_cuirass', aar: 'plate_cuirass',
    // mũ
    cap: 'leather_hood', skp: 'leather_hood', hlm: 'chain_coif', fhl: 'chain_coif', msk: 'chain_coif',
    bhm: 'plate_helm', ghm: 'plate_helm', crn: 'plate_helm',
    // găng, giày
    lgl: 'leather_gloves', mgl: 'chain_gloves', tgl: 'chain_gloves', hgl: 'plate_gauntlets', vgl: 'plate_gauntlets',
    lbt: 'leather_boots', mbt: 'chain_boots', tbt: 'chain_boots', hbt: 'plate_boots', vbt: 'plate_boots',
    // kiếm / rìu nhỏ và lớn
    ssd: 'shortsword', sbr: 'shortsword', scm: 'shortsword', flc: 'shortsword',
    hax: 'hand_axe', axe: 'hand_axe', mpi: 'hand_axe', wax: 'hand_axe',
    // khiên nhỏ và lớn
    buc: 'buckler', sml: 'buckler', pa1: 'buckler', bsh: 'buckler',
    // cung ngắn / dài
    sbw: 'shortbow', sbb: 'shortbow', swb: 'shortbow', am1: 'shortbow', am2: 'shortbow'
  };
  var LOOK_BY_TYPE = {   // kiểu đồ D2 -> lớp Flare
    swor: 'longsword', axe: 'battle_axe', taxe: 'hand_axe', knif: 'dagger', tkni: 'dagger', h2h: 'dagger',
    mace: 'mace', club: 'mace', hamm: 'mace', scep: 'mace',
    wand: 'wand', orb: 'wand', staf: 'staff',
    jave: 'staff', ajav: 'staff', spea: 'staff', aspe: 'staff', pole: 'staff',   // Flare không có giáo/lao: gậy dài là hình gần nhất
    bow: 'longbow', abow: 'longbow', xbow: 'shortbow',
    shie: 'shield', ashd: 'shield',
    tors: 'chain_cuirass', helm: 'chain_coif', phlm: 'chain_coif', pelt: 'leather_hood', glov: 'chain_gloves', boot: 'chain_boots'
  };
  var LOOK_FEMALE_FALLBACK = {   // Flare chỉ có bộ tấm cho nam
    plate_cuirass: 'chain_cuirass', plate_helm: 'chain_coif', plate_gauntlets: 'chain_gloves', plate_boots: 'chain_boots', plate_greaves: 'chain_greaves'
  };
  DA.lookOf = function (it, gender) {
    var b = DA.base(it) || {}, nm = LOOK_BY_CODE[it.base] || LOOK_BY_TYPE[b.type] || null;
    if (nm && gender === 'female' && LOOK_FEMALE_FALLBACK[nm]) nm = LOOK_FEMALE_FALLBACK[nm];
    return nm;
  };
  DA.heroLookSig = function (c) {
    return c.cls + '|' + Object.keys(c.equip || {}).sort().map(function (k) { var it = c.equip[k]; return it ? k + ':' + it.base : ''; }).join(',');
  };
  function heroLayers() {
    var c = S.char; if (!c) return {};
    var g = DA.classInfo(c.cls).gender, sig = DA.heroLookSig(c);
    if (sig === heroLayerSig && heroLayerCache) return heroLayerCache;
    var slots = (A.avatarLayers && A.avatarLayers.slots) || {}, L = {};
    function put(nm) { var sl = nm && slots[g + '.' + nm]; if (sl) L[sl] = 'avatar.' + g + '.' + nm; }
    var base = CLASS_BASE[c.cls] || CLASS_BASE.barbarian;
    Object.keys(base).forEach(function (sl) { put(base[sl]); });
    Object.keys(c.equip).forEach(function (sl) { var it = c.equip[sl]; if (it) put(DA.lookOf(it, g)); });
    heroLayerCache = L; heroLayerSig = sig;
    E.ensure(heroSheetKeys(L));   // trang bị đổi: nạp sheet mới nếu chưa có
    return L;
  }

  /* ================================================================ chiến đấu */
  function elemOf(e) { e = String(e || 'phys').toLowerCase(); return /fire/.test(e) ? 'fire' : /cold|ice|frost/.test(e) ? 'cold' : /light|elec/.test(e) ? 'light' : /pois/.test(e) ? 'poison' : 'phys'; }
  function floatText(x, y, text, color, big) { S.floaters.push({ x: x, y: y, text: text, color: color || '#fff', t: 0, big: big }); }
  var ELCOL = { fire: '#ff8a3c', cold: '#7fd0ff', light: '#ffee66', poison: '#7fdf5f', phys: '#fff' };

  function monSfx(m, what) {
    var key = (m.art || '').replace('enemy.', '');
    E.sfx([key + '_' + what, 'melee_attack'], 0.5);
  }
  function damageMon(m, amount, elem, fromHero) {
    if (m.st === 'die' || m.st === 'dead') return;
    elem = elemOf(elem);
    var res = (m.inst.res && m.inst.res[elem]) || 0;
    if (elem === 'phys' && m.inst.res && m.inst.res.phys) res = m.inst.res.phys;
    var dmg = Math.max(1, Math.round(amount * (1 - clamp(res, -100, 95) / 100)));
    m.hp -= dmg; m.hitFlash = 0.12;
    floatText(m.x, m.y, String(dmg), ELCOL[elem] || '#fff', dmg > m.maxHp * 0.25);
    if (!m.aggro) aggroMon(m);
    if (m.hp <= 0) { killMon(m); return; }
    monSfx(m, 'hit');
    // hit recovery: ngắt đòn đang đánh
    var an = E.animOf(m.art, 'hit'); var dur = Math.max(260, (an ? an.dur : 200) * 1.6);
    if (m.rank === 'normal' || Math.random() < 0.4) { m.act = null; restart(m, 'hit', dur); }
  }
  function aggroMon(m) {
    m.aggro = true;
    S.ents.forEach(function (o) { if (o.kind === 'mon' && o.pack === m.pack && !o.aggro && o.st !== 'dead') { o.aggro = true; } });
  }
  function killMon(m) {
    m.hp = 0; m.act = null;
    var an = E.animOf(m.art, 'die'); restart(m, 'die', an ? an.dur : 500);
    m.deadAt = S.time; S.kills++;
    monSfx(m, 'die');
    // XP
    var c = S.char, d = S.d;
    var r = safe(function () { return D2R.grantXp(c, m.inst.lvl || 1, m.inst.xp || m.inst.exp || 10); }, null);
    if (r) {
      if (r.gained) floatText(S.hero.x, S.hero.y, '+' + r.gained + ' XP', '#c8d8ff');
      if (r.leveled) onLevelUp();
    }
    // đồ rơi
    var items = safe(function () { return D2R.rollDrop(m.monId, m.inst.lvl || 1, Math.random); }, []) || [];
    if (!items.some(DA.isGold) && Math.random() < 0.6) items.push({ gold: Math.round((m.inst.lvl || 1) * rnd(4, 12) * (m.rank === 'normal' ? 1 : 3)), base: 'gold', q: 'normal', w: 1, h: 1 });
    items.forEach(function (it, i) { dropItem(it, m.x + rnd(-0.7, 0.7), m.y + rnd(-0.7, 0.7)); });
    // nhiệm vụ Den of Evil
    if (S.areaId === 'den_of_evil' && S.denLeft != null) {
      S.denLeft = Math.max(0, S.denLeft - 1);
      if (S.denLeft === 0 && c.quests.den_of_evil === 'active') {
        c.quests.den_of_evil = 'cleared'; UI.msg('Den of Evil đã sạch! Hãy báo cho Akara.', '#ffe27a'); E.sfx(['level_up'], 0.5); save();
      }
      UI.dirty = true;
    }
    // đồng đội Fallen chạy trốn
    S.ents.forEach(function (o) { if (o.kind === 'mon' && o !== m && o.ai === 'fallen' && o.st !== 'dead' && o.st !== 'die' && dist(o, m) < 7 && Math.random() < 0.5) { o.flee = 2.5; o.aggro = true; } });
    if (S.target === m) S.target = null;
  }
  function onLevelUp() {
    var c = S.char; recalc(); c.hp = S.d.maxHp; c.mp = S.d.maxMp;
    UI.msg('Lên cấp ' + c.lvl + '!', '#ffe27a'); floatText(S.hero.x, S.hero.y - 1, 'LÊN CẤP!', '#ffe27a', true);
    E.sfx(['level_up'], 0.6); UI.dirty = true; save();
  }

  function damageHero(amount, srcPos) {
    var c = S.char, h = S.hero;
    if (h.st === 'die' || h.st === 'dead') return;
    amount = Math.max(1, Math.round(amount));
    c.hp -= amount; floatText(h.x, h.y, String(amount), '#ff6a6a');
    E.sfx([DA.classInfo(c.cls).gender + '_hit'], 0.6);
    if (c.hp <= 0) { c.hp = 0; killHero(); return; }
    if (amount >= S.d.maxHp * 0.05) {
      var an = E.animOf('avatar.female.default_chest', 'hit'); h.act = null;
      restart(h, 'hit', Math.max(240, (an ? an.dur : 133) * 1.8));
    }
  }
  function killHero() {
    var h = S.hero, c = S.char;
    h.act = null; h.goal = null; h.path = null; restart(h, 'die', 800);
    E.sfx([DA.classInfo(c.cls).gender + '_die'], 0.7);
    var pen = safe(function () { return D2R.deathPenalty(c); }, null) || { lost: 0, corpseGold: 0 };
    if (!pen.corpseGold && pen.lost === 0 && c.gold) { pen.corpseGold = Math.floor(c.gold * 0.5); c.gold -= pen.corpseGold; }
    S.corpse = { area: S.areaId, seed: S.seed, x: h.x, y: h.y, gold: pen.corpseGold, lost: pen.lost };
    setTimeout(function () { if (S.hero === h && h.st === 'dead') UI.showDead(true, respawn); }, 0);
  }
  function respawn() {
    var c = S.char; S.target = null;
    enterArea('rogue_encampment', null).then(function () {
      recalc(); c.hp = Math.max(1, Math.round(S.d.maxHp * 0.5)); c.mp = 0; S.regen = [];
      UI.msg('Bạn hồi sinh ở Rogue Encampment.' + (S.corpse && S.corpse.gold ? ' Xác của bạn giữ ' + S.corpse.gold + ' vàng.' : ''), '#ffb0b0'); save();
    });
  }

  /* ---------------------------------------------------------------- kỹ năng */
  function fxOf(skillId) {
    if (!skillId || skillId === 'attack') return null;
    var lvl = S.char.skills[skillId] || 1;
    return safe(function () { return D2R.skillEffect(skillId, lvl, S.char); }, null);
  }
  function weaponKind() {
    var w = S.char.equip.rhand, b = w && DA.base(w);
    if (b && b.types && (b.types.indexOf('bow') >= 0 || b.types.indexOf('xbow') >= 0)) return 'bow';
    return 'melee';
  }
  function actDur(kind) {
    var cd = D2DATA.classes[S.char.cls], f = (kind === 'cast' ? (S.d.castFrames || (cd && cd.frames && cd.frames.spell) || S.d.atkFrames) : S.d.atkFrames) || 15;
    return clamp(f / 25 * 1000, 280, 1600);
  }
  var NOUSE = { passive: 'Kỹ năng bị động, luôn có hiệu lực.', curse: 'Lời nguyền chưa có trong bản MVP.', leap: 'Kỹ năng này chưa có trong bản MVP.', corpse: 'Kỹ năng này chưa có trong bản MVP.', utility: 'Kỹ năng này chưa có trong bản MVP.', summon: 'Triệu hồi chưa có trong bản MVP.' };
  function skillRange(skillId) {
    var fx = fxOf(skillId);
    if (!skillId || skillId === 'attack') return weaponKind() === 'bow' ? 11 : 1.7;
    if (!fx) return 1.7;
    if (fx.kind === 'melee') return 1.9;
    return 12;
  }
  function animNameFor(e, kind, skillId) {
    if (kind === 'cast') { var fx = fxOf(skillId); return fx && fx.requires && fx.requires.weapon.indexOf('miss') >= 0 ? 'shoot' : 'cast'; }
    return weaponKind() === 'bow' && (!skillId || skillId === 'attack') ? 'shoot' : 'swing';
  }

  // bắt đầu đòn đánh/niệm chú của hero. Trả true nếu bắt đầu được.
  function beginAct(skillId, tx, ty, target) {
    var h = S.hero, c = S.char, fx = fxOf(skillId);
    if (skillId && skillId !== 'attack' && !fx) { UI.msg('Kỹ năng này chưa dùng được.'); return false; }
    if (fx && NOUSE[fx.kind]) { UI.msg(NOUSE[fx.kind]); return false; }
    var kind = !fx || fx.kind === 'melee' ? 'attack' : 'cast';
    if (fx && fx.requires && fx.requires.weapon.indexOf('miss') >= 0 && weaponKind() !== 'bow') { UI.msg('Cần cầm cung hoặc nỏ.'); return false; }
    if (fx && fx.kind === 'buff') {
      if (fx.mana && c.mp < fx.mana) { noMana(); return false; }
      c.mp -= fx.mana || 0; S.buffs[skillId] = S.time + (fx.duration || 60);
      UI.msg(DA.skill(skillId).name + ' kích hoạt.'); E.sfx(['power_shield', 'power_warcry'], 0.4);
      return true;
    }
    if (fx && fx.mana) { if (c.mp < fx.mana) { noMana(); return false; } c.mp -= fx.mana; }
    var dx = tx - h.x, dy = ty - h.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.01) h.dir = E.dirFromTiles(dx, dy);
    var dur = actDur(kind);
    h.act = { skill: skillId || 'attack', fx: fx, tx: tx, ty: ty, target: target || null, done: false, kind: kind, dur: dur };
    h.act.anim = animNameFor(h, kind, skillId);
    restart(h, kind, dur);
    E.sfx(fx ? fxSound(fx) : ['melee_attack', 'melee_attack_2', 'melee_attack_3'].slice(ri(0, 2)), 0.45);
    return true;
  }
  function fxSound(fx) {
    var el = elemOf(fx.dmg && fx.dmg.elem);
    return el === 'fire' ? ['power_fireball', 'power_burn'] : el === 'cold' ? ['power_freeze'] : el === 'light' ? ['power_shock', 'power_thunder'] : ['power_shoot'];
  }
  function noMana() { if (S.time - (S.noManaT || -9) > 1) { S.noManaT = S.time; UI.msg('Không đủ mana.', '#8ab0ff'); E.sfx(['no_mana'], 0.5); } }

  function rollDmg(d) { return rnd(d.min, d.max + 0.999); }
  // sát thương của kỹ năng dựa trên vũ khí (Jab, Bash, Magic Arrow...): vũ khí * %vũ khí * (100+%sát thương)/100 + cộng thêm
  function weaponSkillDmg(fx) {
    var d = S.d, wp = (fx.weaponPct || 100) / 100, mul = (100 + (fx.dmgPct || 0)) / 100;
    var wd = fx.weaponDmg || { min: d.dmgMin, max: d.dmgMax };
    return { min: wd.min * wp * mul + (fx.addMin || 0), max: wd.max * wp * mul + (fx.addMax || 0), elem: (fx.elem && fx.elem.type) || 'phys' };
  }
  function applyHeroAct(h) {
    var a = h.act, c = S.char, d = S.d; a.done = true;
    var fx = a.fx;
    if (!fx) {   // đòn thường
      if (weaponKind() === 'bow') { spawnMissile(h, a.tx, a.ty, { dmg: { min: d.dmgMin, max: d.dmgMax, elem: 'phys' }, art: 'power.arrows', speed: 12, pierce: 0, owner: 'hero', ar: d.ar, life: 1.1 }); return; }
      meleeHit(a, d.dmgMin, d.dmgMax, 'phys', d.ar);
      return;
    }
    var ar = d.ar * (100 + (fx.toHitPct || 0)) / 100, el = elemOf(fx.dmg && fx.dmg.elem);
    if (fx.kind === 'melee') { var wd = weaponSkillDmg(fx); meleeHit(a, wd.min, wd.max, wd.elem, ar); return; }
    if (fx.kind === 'nova') {
      var rad = clamp(fx.radius || 5, 2.5, 8);
      S.ents.forEach(function (m) { if (m.kind === 'mon' && m.st !== 'die' && m.st !== 'dead' && dist(m, h) <= rad) damageMon(m, rollDmg(fx.dmg || { min: 5, max: 8 }), fx.dmg && fx.dmg.elem, true); });
      mk('fx', h.x, h.y, { art: pickArt(fx), t: 0, life: 0.5, ring: rad, color: ELCOL[el] });
      return;
    }
    var isChan = fx.kind === 'channel';
    var dm = fx.weaponPct && fx.requires && fx.requires.weapon.length ? weaponSkillDmg(fx) : fx.dmg || { min: 3, max: 6, elem: 'phys' };
    if (isChan) dm = { min: dm.min / 4, max: dm.max / 4, elem: dm.elem };
    var n = Math.max(1, Math.round(fx.count || 1)), base = Math.atan2(a.ty - h.y, a.tx - h.x);
    var mv = fx.missile || {}, speed = clamp((mv.vel || fx.speed || 16) * 0.5, 7, 13), life = clamp((mv.range || 40) / 25 * 0.6, 0.8, 1.6);
    for (var i = 0; i < n; i++) {
      var ang = base + (n > 1 ? (i - (n - 1) / 2) * 0.22 : 0);
      spawnMissile(h, h.x + Math.cos(ang) * 10, h.y + Math.sin(ang) * 10, { dmg: dm, art: pickArt(fx), speed: isChan ? 9 : speed, pierce: (fx.pierce || isChan) ? 99 : 0, owner: 'hero', ar: fx.weaponPct && fx.requires.weapon.length ? ar : 9999, life: isChan ? 0.45 : life });
    }
  }
  function pickArt(fx) {
    var el = elemOf(fx.dmg && fx.dmg.elem);
    if (fx.art && E.hasSheet(fx.art)) return fx.art;
    return el === 'fire' ? 'power.fireball' : el === 'cold' ? 'power.icicle' : el === 'light' ? 'power.lightning' : el === 'poison' ? 'power.ember' : 'power.arrows';
  }
  function meleeHit(a, mn, mx, elem, ar) {
    var h = S.hero, t = a.target;
    if (!t || t.st === 'die' || t.st === 'dead') {  // tìm quái đứng trước mặt trong tầm
      var best = null, bd = 2.1;
      S.ents.forEach(function (m) { if (m.kind === 'mon' && m.st !== 'die' && m.st !== 'dead') { var dd = dist(m, { x: h.x + Math.cos(angOf(h.dir)) * 0.9, y: h.y + Math.sin(angOf(h.dir)) * 0.9 }); if (dd < bd) { bd = dd; best = m; } } });
      t = best;
    }
    if (!t || dist(t, h) > 2.4) return;
    var p = safe(function () { return D2R.hitChance(ar, S.char.lvl, t.inst.def || 0, t.inst.lvl || 1); }, 0.75);
    if (Math.random() < p) { damageMon(t, rnd(mn, mx + 0.999), elem, true); }
    else floatText(t.x, t.y, 'miss', '#aaa');
  }
  function angOf(dir) {   // hướng 0..7 -> góc trong toạ độ ô
    var v = [[-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1]][dir]; return Math.atan2(v[1], v[0]);
  }

  /* ---------------------------------------------------------------- đạn */
  function spawnMissile(owner, tx, ty, o) {
    var dx = tx - owner.x, dy = ty - owner.y, d = Math.hypot(dx, dy) || 1, sp = o.speed || 9;
    var m = mk('missile', owner.x + dx / d * 0.5, owner.y + dy / d * 0.5, {
      vx: dx / d * sp, vy: dy / d * sp, dir: E.dirFromTiles(dx, dy), art: o.art, dmg: o.dmg, owner: o.owner, pierce: o.pierce || 0,
      life: o.life || 1.2, ar: o.ar, hit: {}, t: 0, rad: o.radius ? clamp(o.radius * 0.1, 0.55, 1.4) : 0.55, st: 'run'
    });
    m.y -= 0; return m;
  }
  function updateMissile(m, dt) {
    if (m.st === 'die') { m.t += dt; if (m.t > 0.3) m.st = 'dead'; return; }
    m.t += dt; m.life -= dt;
    var steps = Math.ceil(Math.hypot(m.vx, m.vy) * dt / 0.3), sx = m.vx * dt / steps, sy = m.vy * dt / steps;
    for (var i = 0; i < steps; i++) {
      m.x += sx; m.y += sy;
      if (blocked(S.grid, m.x, m.y)) { explode(m); return; }
      if (m.owner === 'hero') {
        for (var k = 0; k < S.ents.length; k++) {
          var o = S.ents[k];
          if (o.kind !== 'mon' || o.st === 'die' || o.st === 'dead' || m.hit[o.id]) continue;
          if (dist(o, m) < m.rad + 0.15) {
            m.hit[o.id] = 1;
            var ok = m.ar >= 9000 || Math.random() < safe(function () { return D2R.hitChance(m.ar, S.char.lvl, o.inst.def || 0, o.inst.lvl || 1); }, 0.8);
            if (ok) damageMon(o, rollDmg(m.dmg), m.dmg.elem, true); else floatText(o.x, o.y, 'miss', '#aaa');
            if (m.pierce > 0) m.pierce--; else { explode(m); return; }
          }
        }
      } else {
        var h = S.hero;
        if (h.st !== 'die' && h.st !== 'dead' && dist(h, m) < 0.55) {
          var okh = Math.random() < safe(function () { return D2R.hitChance(m.ar || 30, 1, S.d.def, S.char.lvl); }, 0.7);
          if (okh) damageHero(rollDmg(m.dmg)); else floatText(h.x, h.y, 'miss', '#aaa');
          explode(m); return;
        }
      }
    }
    if (m.life <= 0) explode(m);
  }
  function explode(m) { m.st = 'die'; m.t = 0; m.vx = m.vy = 0; }

  /* ---------------------------------------------------------------- đồ rơi */
  function lootArt(it) {
    var s = ((it.base || '') + ' ' + (it.name || '') + ' ' + (it.type || '')).toLowerCase().replace(/_/g, ' ');
    var pot = DA.potionInfo(it);
    if (DA.isGold(it)) { var n = DA.goldAmount(it); return n >= 100 ? 'loot.coins100' : n >= 25 ? 'loot.coins25' : 'loot.coins5'; }
    if (pot) return pot.mp && !pot.hp ? 'loot.mp_potion' : 'loot.hp_potion';
    var tbl = [[/ring/, 'loot.ring'], [/amulet|pendant/, 'loot.gem'], [/scroll/, 'loot.scroll'], [/belt/, 'loot.belt'], [/boot|greave/, 'loot.boots'], [/shield|buckler/, 'loot.shield'], [/helm|cap|hood|coif/, 'loot.clothes'],
      [/axe/, 'loot.hand_axe'], [/dagger|knife/, 'loot.dagger'], [/short sword|shortsword|blade|sword/, 'loot.shortsword'], [/staff/, 'loot.staff'], [/wand/, 'loot.wand'], [/mace|club|hammer/, 'loot.mace'], [/bow/, 'loot.longbow'], [/armor|mail|plate|robe|vest/, 'loot.leather_armor']];
    for (var i = 0; i < tbl.length; i++) if (tbl[i][0].test(s)) return tbl[i][1];
    return 'loot.pouch';
  }
  function dropItem(it, x, y) {
    var g = S.grid, px = x, py = y;
    if (!canStand(px, py, 0.1)) { px = S.hero.x; py = S.hero.y; }
    var gold = DA.isGold(it);
    var label = gold ? DA.goldAmount(it) + ' vàng' : DA.itemName(it).replace(/\n/g, ' ');
    mk('drop', px, py, { item: it, born: S.time, art: lootArt(it), label: label, gold: gold ? DA.goldAmount(it) : 0 });
  }
  function findSpot(c, w, hh) {
    var occ = []; for (var i = 0; i < 40; i++) occ[i] = 0;
    c.inv.forEach(function (it) { for (var yy = 0; yy < (it.h || 1); yy++) for (var xx = 0; xx < (it.w || 1); xx++) { var k = (it.iy + yy) * 10 + it.ix + xx; if (k >= 0 && k < 40) occ[k] = 1; } });
    for (var y = 0; y + hh <= 4; y++) for (var x = 0; x + w <= 10; x++) {
      var ok = true;
      for (var yy2 = 0; yy2 < hh && ok; yy2++) for (var xx2 = 0; xx2 < w; xx2++) if (occ[(y + yy2) * 10 + x + xx2]) { ok = false; break; }
      if (ok) return [x, y];
    }
    return null;
  }
  function addToInv(it) {
    var c = S.char, sp = findSpot(c, it.w || 1, it.h || 1);
    if (!sp) return false;
    it.ix = sp[0]; it.iy = sp[1]; c.inv.push(it); return true;
  }
  function beltFree(c) { for (var i = 0; i < 4; i++) if (!c.belt[i]) return i; return -1; }
  function pickup(drop) {
    var c = S.char;
    if (drop.corpse) {
      c.gold += drop.corpse.gold; UI.msg('Lấy lại ' + drop.corpse.gold + ' vàng từ xác.', '#ffd24a'); S.corpse = null; removeEnt(drop); E.sfx(['inv_coins']); return true;
    }
    var it = drop.item;
    if (DA.isGold(it)) { var g = DA.goldAmount(it); c.gold += g; floatText(S.hero.x, S.hero.y, '+' + g + ' vàng', '#ffd24a'); removeEnt(drop); E.sfx(['inv_coins'], 0.5); UI.dirty = true; return true; }
    if (DA.potionInfo(it)) { var bi = beltFree(c); if (bi >= 0) { c.belt[bi] = it; removeEnt(drop); E.sfx(['inv_potion']); UI.dirty = true; return true; } }
    if (!addToInv(it)) { UI.msg('Túi đồ đầy.', '#ff9a8a'); return false; }
    removeEnt(drop); E.sfx(['inv_metal', 'inv_leather']); UI.dirty = true;
    return true;
  }
  function removeEnt(e) { e.removed = true; }

  /* ================================================================ NPC */
  var NPC = {
    akara: { name: 'Akara', title: 'Priestess of Rogue Encampment' },
    charsi: { name: 'Charsi', title: 'Blacksmith' }, gheed: { name: 'Gheed', title: 'Gambler' },
    kashya: { name: 'Kashya', title: 'Captain of the Rogues' }, warriv: { name: 'Warriv', title: 'Caravan Leader' },
    deckard_cain: { name: 'Deckard Cain', title: 'Elder of the Horadrim' }
  };
  /* Kho đồ (D2: 6 cột x 8 hàng) và waypoint. */
  var WAYPOINTS = [   // Act I theo thứ tự D2; chỉ hiện nơi đã kích hoạt, Rogue Encampment luôn có
    { id: 'rogue_encampment', name: 'Rogue Encampment', always: true }, { id: 'cold_plains', name: 'Cold Plains' },
    { id: 'stony_field', name: 'Stony Field' }, { id: 'dark_wood', name: 'Dark Wood' }, { id: 'black_marsh', name: 'Black Marsh' }
  ];
  Game.stashCols = 6; Game.stashRows = 8;
  Game.visitedWaypoints = function () {
    var c = S.char, w = c.waypoints || {};
    return WAYPOINTS.filter(function (x) { return x.always || w[x.id]; });
  };
  function useObj(o) {
    var c = S.char;
    if (o.otype === 'stash') { E.sfx(['inv_metal', 'button'], 0.4); UI.openStash(); }
    else if (o.otype === 'waypoint') {
      c.waypoints = c.waypoints || {};
      if (S.areaId && !c.waypoints[S.areaId]) { c.waypoints[S.areaId] = true; UI.msg('Waypoint được kích hoạt.', '#9ec8ff'); save(); }
      E.sfx(['button', 'power_heal'], 0.4); UI.openWaypoints();
    }
  }
  Game.travelWaypoint = function (id) {
    if (id === S.areaId) { UI.msg('Bạn đang ở đây.'); return; }
    if (!areaDef(id) || !(DA.area(id) || AREA_FB[id])) { UI.msg('Nơi này chưa mở trong bản MVP.', '#ff9a8a'); return; }
    UI.closeWaypoints(); entering = true;
    enterArea(id, null).then(function () { entering = false; save(); }, function (err) { entering = false; UI.showLoad(false); UI.msg('Lỗi vào khu vực: ' + err); });
  };
  function stashSpot(c, w, hh) {
    var occ = [], cols = Game.stashCols, rows = Game.stashRows, i; for (i = 0; i < cols * rows; i++) occ[i] = 0;
    (c.stash || []).forEach(function (it) { for (var yy = 0; yy < (it.h || 1); yy++) for (var xx = 0; xx < (it.w || 1); xx++) { var k = (it.iy + yy) * cols + it.ix + xx; if (k >= 0 && k < occ.length) occ[k] = 1; } });
    for (var y = 0; y + hh <= rows; y++) for (var x = 0; x + w <= cols; x++) {
      var ok = true;
      for (var yy2 = 0; yy2 < hh && ok; yy2++) for (var xx2 = 0; xx2 < w; xx2++) if (occ[(y + yy2) * cols + x + xx2]) { ok = false; break; }
      if (ok) return [x, y];
    }
    return null;
  }
  Game.stashIn = function (it) {
    var c = S.char, i = c.inv.indexOf(it); if (i < 0) return;
    c.stash = c.stash || []; var sp = stashSpot(c, it.w || 1, it.h || 1);
    if (!sp) { UI.msg('Kho đồ đầy.', '#ff9a8a'); return; }
    c.inv.splice(i, 1); it.ix = sp[0]; it.iy = sp[1]; c.stash.push(it); UI.sel = null; UI.dirty = true; E.sfx(['inv_metal']); save();
  };
  Game.stashOut = function (it) {
    var c = S.char, i = (c.stash || []).indexOf(it); if (i < 0) return;
    c.stash.splice(i, 1);
    if (!addToInv(it)) { c.stash.splice(i, 0, it); UI.msg('Túi đồ đầy.', '#ff9a8a'); return; }
    UI.sel = null; UI.dirty = true; E.sfx(['inv_metal']); save();
  };
  function talk(npc) {
    var c = S.char, id = npc.npc, info = NPC[id] || { name: id, title: '' };
    var nd = window.D2DATA && D2DATA.npcs && D2DATA.npcs[id]; if (nd) info = { name: nd.name || info.name, title: nd.title || info.title };
    var def = { name: info.name + ' - ' + info.title, text: '', buttons: [] };
    if (id === 'akara') {
      var q = c.quests.den_of_evil;
      if (!q) {
        def.text = 'Chào mừng đến Rogue Encampment, lữ khách. Quỷ dữ đã làm ô uế hang động gần Blood Moor, mang tên Den of Evil. Hãy dọn sạch chúng và ta sẽ thưởng cho ngươi.';
        def.buttons.push({ label: 'Nhận nhiệm vụ Den of Evil', fn: function () { c.quests.den_of_evil = 'active'; UI.msg('Nhiệm vụ mới: Den of Evil', '#ffe27a'); E.sfx(['level_up'], 0.4); UI.closeDialog(); save(); UI.dirty = true; } });
      } else if (q === 'active') def.text = 'Hãy diệt hết quỷ trong Den of Evil, ở phía hang Blood Moor. Cẩn thận Corpsefire.';
      else if (q === 'cleared') {
        def.text = 'Ngươi làm được rồi! Den of Evil đã yên. Hãy nhận phần thưởng: sức mạnh để học thêm một kỹ năng.';
        def.buttons.push({ label: 'Nhận thưởng (1 điểm kỹ năng)', fn: function () { D2R.completeQuest(c, 'den_of_evil'); UI.msg('Nhận 1 điểm kỹ năng!', '#ffe27a'); E.sfx(['level_up'], 0.5); UI.closeDialog(); save(); UI.dirty = true; } });
      } else def.text = 'Cảm ơn ngươi đã giúp Rogues. Ánh sáng soi đường cho ngươi.';
      def.buttons.push({ label: 'Mua bán', fn: function () { UI.shopName = 'Akara'; UI.openShop(DA.shopStock('akara')); } });
      def.buttons.push({ label: 'Chữa trị (miễn phí)', fn: function () { c.hp = S.d.maxHp; c.mp = S.d.maxMp; S.regen = []; UI.msg('Akara chữa lành cho bạn.', '#9f9'); E.sfx(['power_heal'], 0.6); UI.closeDialog(); } });
    } else if (id === 'kashya') def.text = 'Blood Raven đã chiếm tu viện ở phía Bắc, và cũng là kẻ từng là cung thủ giỏi nhất của ta. Hãy dọn đường qua Cold Plains... khi ngươi đủ mạnh.';
    else if (id === 'charsi') { def.text = 'Ta rèn vũ khí và giáp tốt nhất Act I. Xem hàng của ta đi, lữ khách.'; def.buttons.push({ label: 'Mua bán', fn: function () { UI.shopName = 'Charsi'; UI.openShop(DA.shopStock('charsi')); } }); }
    else if (id === 'gheed') { def.text = 'Chào bạn của ta! Hàng của Gheed toàn đồ tốt, giá phải chăng.'; def.buttons.push({ label: 'Mua bán', fn: function () { UI.shopName = 'Gheed'; UI.openShop(DA.shopStock('gheed')); } }); }
    else if (id === 'warriv') def.text = 'Đoàn xe đi Act II chưa khởi hành. Hãy hoàn thành Act I trước đã.';
    else if (id === 'deckard_cain') def.text = 'Hãy ngồi xuống bên lửa. Các câu chuyện cũ nói rằng một kẻ sẽ chấm dứt cơn ác mộng này. Mẹo: giữ Alt để thấy tên đồ dưới đất.';
    else def.text = 'Chào bạn.';
    UI.openDialog(npc, def);
  }

  /* ================================================================ cập nhật */
  function updateHero(dt) {
    var h = S.hero, c = S.char, d = S.d;
    if (h.st === 'die') { h.stT += dt * 1000; if (h.stT >= h.stDur) { h.st = 'dead'; UI.showDead(true, respawn); } return; }
    if (h.st === 'dead') return;
    h.stT += dt * 1000;
    // hồi phục
    var mpR = d.mpRegen != null ? d.mpRegen : d.maxMp / 120, hpR = d.hpRegen || 0;
    if (S.areaId) { c.mp = Math.min(d.maxMp, c.mp + mpR * dt); c.hp = Math.min(d.maxHp, c.hp + hpR * dt); }
    for (var i = S.regen.length - 1; i >= 0; i--) {
      var r = S.regen[i], k = Math.min(dt, r.left);
      c.hp = Math.min(d.maxHp, c.hp + r.hp * k); c.mp = Math.min(d.maxMp, c.mp + r.mp * k);
      r.left -= k; if (r.left <= 0.001) S.regen.splice(i, 1);
    }
    if (h.st === 'attack' || h.st === 'cast') {
      var a = h.act;
      if (a && !a.done && h.stT >= a.dur * 0.5) applyHeroAct(h);
      if (h.stT >= h.stDur) { h.act = null; setSt(h, 'idle'); } else return;
    }
    if (h.st === 'hit') { if (h.stT >= h.stDur) setSt(h, 'idle'); else return; }

    var joy = I.joyTiles();
    if (I.atkHeld && !joy) touchAttack();
    if (joy) {
      h.goal = null; h.path = null;
      moveHero(joy.x, joy.y, dt, true);
      return;
    }
    // giữ chuột trái: tiếp tục đi / đánh theo con trỏ
    if (I.mouse.left && !S.uiHold) holdTick();
    var g = h.goal;
    if (!g) { if (h.st === 'walk' || h.st === 'run') setSt(h, 'idle'); stamRegen(dt, false); return; }
    var tgt = g.target;
    if (g.type === 'attack' || g.type === 'cast') {
      var sk = g.skill, rng = skillRange(sk);
      if (tgt && (tgt.st === 'die' || tgt.st === 'dead' || tgt.removed)) { h.goal = null; return; }
      var tx = tgt ? tgt.x : g.x, ty = tgt ? tgt.y : g.y, dd = Math.hypot(tx - h.x, ty - h.y);
      if (g.inPlace || g.type === 'cast' && dd <= rng + 0.01 || dd <= rng) {
        if (beginAct(sk, tx, ty, tgt)) { h.path = null; if (!tgt && g.once !== false) h.goal = g.hold ? g : null; else if (g.type === 'cast' && !tgt) h.goal = null; }
        else h.goal = null;
        return;
      }
      goTo(h, tx, ty, dt, g);
    } else if (g.type === 'pickup') {
      if (tgt.removed) { h.goal = null; return; }
      if (dist(h, tgt) < 1.3) { pickup(tgt); h.goal = null; setSt(h, 'idle'); }
      else goTo(h, tgt.x, tgt.y, dt, g);
    } else if (g.type === 'talk') {
      if (dist(h, tgt) < 2.1) { h.dir = E.dirFromTiles(tgt.x - h.x, tgt.y - h.y); h.goal = null; setSt(h, 'idle'); talk(tgt); }
      else goTo(h, tgt.x, tgt.y, dt, g);
    } else if (g.type === 'use') {
      if (tgt.removed) { h.goal = null; return; }
      if (dist(h, tgt) < Math.max(tgt.ow, tgt.oh) / 2 + 2.4) { h.dir = E.dirFromTiles(tgt.x - h.x, tgt.y - h.y); h.goal = null; setSt(h, 'idle'); useObj(tgt); }
      else if (!goTo(h, tgt.x, tgt.y, dt, g)) { if (dist(h, tgt) < Math.max(tgt.ow, tgt.oh) / 2 + 3.2) { h.goal = null; useObj(tgt); } else h.goal = null; }
    } else if (g.type === 'move') {
      if (!goTo(h, g.x, g.y, dt, g)) { h.goal = null; if (h.st === 'walk' || h.st === 'run') setSt(h, 'idle'); }
    }
  }
  function stamRegen(dt, running) {
    if (running) S.stamina = Math.max(0, S.stamina - 6 * dt);
    else S.stamina = Math.min(S.stamMax, S.stamina + 5 * dt);
  }
  function heroSpeed(running) {
    var d = S.d, v = running ? d.run : d.walk;
    var base = v > 2 && v < 40 ? v * 0.5 : (running ? 4.6 : 3);
    return clamp(base, 2.2, 7);
  }
  function wantRun() { return S.runOn && (S.stamina > 2 || (S.hero.st === 'run' && S.stamina > 0)); }
  function moveHero(vx, vy, dt, direct) {
    var h = S.hero, run = wantRun();
    var sp = heroSpeed(run) * dt, ok = tryMove(h, vx * sp, vy * sp);
    h.dir = E.dirFromTiles(vx, vy);
    if (ok) { setSt(h, run ? 'run' : 'walk'); stamRegen(dt, run); } else { setSt(h, 'idle'); stamRegen(dt, false); }
    markSeen(); checkExits();
  }
  // đi tới đích (dùng đường A*); trả false nếu đã tới/không có đường
  function goTo(e, tx, ty, dt, g) {
    var h = e;
    var near = Math.hypot(tx - h.x, ty - h.y);
    if (g.type === 'move' && near < 0.25) return false;
    if (!h.path || g.repath === undefined || S.time - g.repath > 0.45 && (g.type !== 'move')) {
      var tgtMoved = !g.pt || Math.hypot(g.pt[0] - tx, g.pt[1] - ty) > 0.8;
      if (!h.path || tgtMoved || S.time - g.repath > 0.9) {
        if (los(h.x, h.y, tx, ty)) h.path = [[tx, ty]]; else h.path = findPath(h.x, h.y, tx, ty);
        g.pt = [tx, ty]; g.repath = S.time;
        if (!h.path) { return false; }
      }
    }
    var p = h.path && h.path[0];
    if (!p) { h.path = null; return false; }
    // cắt đường: nhảy tới điểm xa nhất nhìn thấy
    for (var k = Math.min(h.path.length - 1, 5); k > 0; k--) if (los(h.x, h.y, h.path[k][0], h.path[k][1])) { h.path.splice(0, k); p = h.path[0]; break; }
    var dx = p[0] - h.x, dy = p[1] - h.y, d = Math.hypot(dx, dy);
    if (d < 0.18) { h.path.shift(); if (!h.path.length) { h.path = null; if (g.type === 'move') return false; } return true; }
    moveHero(dx / d, dy / d, dt, false);
    if (h.st === 'idle') { h.path = null; g.repath = undefined; return g.type !== 'move'; }
    return true;
  }
  var seenT = 0;
  function markSeen() {
    var g = S.grid, h = S.hero; if (!g || !g.seen) return;
    var r = 9, hx = Math.floor(h.x), hy = Math.floor(h.y);
    for (var y = Math.max(0, hy - r); y <= Math.min(g.h - 1, hy + r); y++) for (var x = Math.max(0, hx - r); x <= Math.min(g.w - 1, hx + r); x++)
      if ((x - hx) * (x - hx) + (y - hy) * (y - hy) <= r * r) g.seen[y * g.w + x] = 1;
  }
  var exitLock = 0, entering = false;
  function checkExits() {
    if (entering || S.time - S.arrive < 1.5) return;
    var h = S.hero, g = S.grid;
    for (var i = 0; i < g.exits.length; i++) {
      var ex = g.exits[i];
      if (Math.hypot(ex.x + 0.5 - h.x, ex.y + 0.5 - h.y) < 1.4) {
        if (!areaDef(ex.to) || !(DA.area(ex.to) || AREA_FB[ex.to])) {
          if (S.time - exitLock > 2) { exitLock = S.time; UI.msg('Lối này chưa mở trong bản MVP.'); }
          return;
        }
        entering = true; var from = S.areaId; E.sfx(['env_stairs'], 0.4);
        enterArea(ex.to, from).then(function () { entering = false; save(); }, function (err) { entering = false; UI.showLoad(false); UI.msg('Lỗi vào khu vực: ' + err); });
        return;
      }
    }
  }

  /* ---------------------------------------------------------------- AI quái */
  var MON_LOSE_DIST = 45;   // ô lưới (~22 ô D2): quái đang đuổi xa hơn thì mất dấu và ngủ lại
  function updateMon(m, dt) {
    var h = S.hero;
    if (m.hitFlash > 0) m.hitFlash -= dt;
    if (m.st === 'dead') {
      if (S.time - m.deadAt > 25 && !m.rez) m.removed = true;
      return;
    }
    m.stT += dt * 1000;
    if (m.st === 'die') { if (m.stT >= m.stDur) setSt(m, 'dead'); return; }
    var dd = dist(m, h);
    if (dd > 26 && !m.aggro) return;   // ngủ: D2 chỉ cập nhật phòng gần người chơi
    if (dd > MON_LOSE_DIST && m.aggro && m.st !== 'attack' && m.st !== 'cast') { m.aggro = false; if (m.st === 'walk' || m.st === 'run') setSt(m, 'idle'); return; }
    if (m.st === 'hit') { if (m.stT >= m.stDur) setSt(m, 'idle'); return; }
    if (m.spawnT > 0) { m.spawnT -= dt * 1000; return; }
    var alive = h.st !== 'die' && h.st !== 'dead';
    if (!m.aggro && alive && dd < 9 && S.time - S.arrive > 0.6) { aggroMon(m); if (!m.said) { m.said = 1; E.sfx([(m.art || '').replace('enemy.', '') + '_ment'], 0.35); } }
    if (m.st === 'attack' || m.st === 'cast') {
      var a = m.act;
      if (a && !a.done && m.stT >= m.stDur * 0.5) monStrike(m, a);
      if (m.stT >= m.stDur) { m.act = null; setSt(m, 'idle'); } else return;
    }
    if (!m.aggro || !alive) { if (m.st === 'walk' || m.st === 'run') setSt(m, 'idle'); return; }
    m.cd -= dt;
    var vx = h.x - m.x, vy = h.y - m.y, len = Math.hypot(vx, vy) || 1;
    // chạy trốn
    if (m.flee > 0) {
      m.flee -= dt; monStep(m, -vx / len, -vy / len, dt, 1.25); return;
    }
    if (m.ai === 'melee' || m.ai === 'fallen') {
      if (m.ai === 'fallen' && m.hp < m.maxHp * 0.3 && !m.fled) { m.fled = 1; m.flee = 3; return; }
      if (len > 1.35) { monStep(m, vx / len, vy / len, dt, 1); }
      else if (m.cd <= 0) monAttack(m, 'swing', len);
      else { m.dir = E.dirFromTiles(vx, vy); setSt(m, 'idle'); }
    } else if (m.ai === 'ranged') {
      if (len > 8.5) monStep(m, vx / len, vy / len, dt, 1);
      else if (len < 3.5) monStep(m, -vx / len, -vy / len, dt, 0.9);
      else if (m.cd <= 0 && los(m.x, m.y, h.x, h.y)) monAttack(m, 'shoot', len);
      else { m.dir = E.dirFromTiles(vx, vy); setSt(m, 'idle'); }
    } else if (m.ai === 'shaman') {
      // hồi sinh Fallen đã gục nếu có
      var corpse = null;
      S.ents.forEach(function (o) { if (!corpse && o.kind === 'mon' && o.st === 'dead' && o.ai === 'fallen' && !o.rez && dist(o, m) < 9) corpse = o; });
      if (corpse && m.cd <= 0) { m.dir = E.dirFromTiles(corpse.x - m.x, corpse.y - m.y); m.act = { kind: 'rez', corpse: corpse, done: false }; corpse.rez = 1; var an = E.animOf(m.art, 'cast'); restart(m, 'cast', an ? an.dur * 1.5 : 700); m.cd = 4; return; }
      if (len > 8) monStep(m, vx / len, vy / len, dt, 1);
      else if (len < 4) monStep(m, -vx / len, -vy / len, dt, 0.9);
      else if (m.cd <= 0 && los(m.x, m.y, h.x, h.y)) monAttack(m, 'cast', len);
      else { m.dir = E.dirFromTiles(vx, vy); setSt(m, 'idle'); }
    }
    // tách nhau ra
    if (m.st === 'walk' || m.st === 'run' || m.st === 'idle') separate(m, dt);
  }
  function separate(m, dt) {
    for (var i = 0; i < S.ents.length; i++) {
      var o = S.ents[i];
      if (o === m || o.kind !== 'mon' || o.st === 'dead' || o.st === 'die') continue;
      var dx = m.x - o.x, dy = m.y - o.y, d = Math.hypot(dx, dy);
      if (d < 0.7 && d > 0.001) tryMove(m, dx / d * 1.2 * dt, dy / d * 1.2 * dt);
    }
  }
  function monStep(m, vx, vy, dt, mul) {
    var sp = m.speed * mul * dt, ok = false;
    var ang = Math.atan2(vy, vx), offs = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
    if (m.slideSign) offs = [0, 0.6 * m.slideSign, -0.6 * m.slideSign, 1.2 * m.slideSign, -1.2 * m.slideSign];
    for (var i = 0; i < offs.length; i++) {
      var a2 = ang + offs[i], dx = Math.cos(a2) * sp, dy = Math.sin(a2) * sp;
      if (canStand(m.x + dx, m.y + dy, 0.28)) { m.x += dx; m.y += dy; ok = true; if (i > 0) m.slideSign = offs[i] > 0 ? 1 : -1; else m.slideSign = 0; break; }
    }
    m.dir = E.dirFromTiles(vx, vy);
    setSt(m, ok ? 'run' : 'idle');
  }
  function monAttack(m, anim, len) {
    var h = S.hero, an = E.animOf(m.art, anim) || E.animOf(m.art, 'swing');
    var dur = clamp(m.inst.atkMs || (an ? an.dur : 600) * 1.25, 350, 1400);
    m.dir = E.dirFromTiles(h.x - m.x, h.y - m.y);
    m.act = { kind: anim, done: false, anim: an ? anim : 'swing' };
    restart(m, anim === 'shoot' || anim === 'cast' ? 'cast' : 'attack', dur);
    m.cd = dur / 1000 * rnd(1.1, 1.6) + 0.15;
    E.sfx([(m.art || '').replace('enemy.', '') + '_phys', 'melee_attack'], 0.35);
  }
  function monStrike(m, a) {
    a.done = true; var h = S.hero, inst = m.inst;
    if (a.kind === 'rez') {
      var c = a.corpse; if (c && c.st === 'dead') { c.hp = Math.round(c.maxHp * 0.6); c.rez = 0; c.aggro = true; c.deadAt = 0; var an = E.animOf(c.art, 'spawn'); restart(c, 'idle', 0); c.spawnT = an ? an.dur : 0; c.spawnAnimT = 0; E.sfx(['power_heal'], 0.4); }
      return;
    }
    if (a.kind === 'swing') {
      if (dist(m, h) > 2.0) return;
      var p = safe(function () { return D2R.hitChance((inst.a1 && inst.a1.ar) || inst.ar || 30, inst.lvl || 1, S.d.def, S.char.lvl); }, 0.7);
      var a1 = inst.a1 || inst.dmg || { min: 1, max: 3 };
      if (Math.random() < p) damageHero(rnd(a1.min, a1.max + 0.999));
      else floatText(h.x, h.y, 'miss', '#aaa');
    } else {
      var fire = m.ai === 'shaman';
      var ms = inst.missile || {}, md = ms.dmg && (ms.dmg.max > 0) ? ms.dmg : (inst.a2 && inst.a2.max ? inst.a2 : inst.a1 || { min: 1, max: 3 });
      spawnMissile(m, h.x, h.y, { dmg: { min: md.min, max: md.max, elem: ms.elem || (fire ? 'fire' : 'phys') }, art: fire ? 'power.fireball' : (E.hasSheet('power.arrows') ? 'power.arrows' : 'power.ember'), speed: clamp((ms.vel || 12) * 0.5, 5, 9), owner: 'mon', ar: ((inst.a2 && inst.a2.ar) || inst.ar || 30) * 1.5, life: 1.8 });
    }
  }

  /* ================================================================ lệnh người chơi */
  function heroActionPos(sx, sy) { return E.toWorld(sx, sy); }

  function entAt(sx, sy) {
    var best = null, bd = 1e9;
    S.ents.forEach(function (e) {
      if (e.removed) return;
      var p = E.toScreen(e.x, e.y), score = null;
      if (e.kind === 'drop') {
        var r = e.labelRect;
        if (r && sx >= r[0] && sx <= r[0] + r[2] && sy >= r[1] && sy <= r[1] + r[3]) score = 0;
        else { var dd = Math.hypot(sx - p[0], sy - p[1] + 10); if (dd < 22) score = dd; }
      } else if (e.kind === 'obj') {
        if (!OBJ_USE[e.otype]) return;
        for (var ly = 0; ly <= 40 && score == null; ly += 20) {   // bấm vào phần thân cao của vật cũng trúng
          var wp = E.toWorld(sx, sy + ly);
          if (wp[0] >= e.cx - 0.4 && wp[0] <= e.cx + e.ow + 0.4 && wp[1] >= e.cy - 0.4 && wp[1] <= e.cy + e.oh + 0.4) score = 20 + ly / 20;
        }
      } else if (e.kind === 'mon' || e.kind === 'npc') {
        if (e.st === 'dead') return;
        var dx = (sx - p[0]) / 26, dy = (sy - (p[1] - 36)) / 46;
        if (dx * dx + dy * dy <= 1) score = 10 + dx * dx + dy * dy;
        if (e.kind === 'mon' && e.st === 'die') score = null;
      }
      if (score != null && score < bd) { bd = score; best = e; }
    });
    return best;
  }
  function skillFor(btn) { return btn === 'left' ? S.leftSkill : S.rightSkill; }
  function isSpell(sk) { return !!sk && sk !== 'attack' && !!fxOf(sk) && fxOf(sk).kind !== 'melee'; }
  function command(sx, sy, btn, shift) {
    if (!S.hero || S.scene !== 'play') return;
    var h = S.hero; if (h.st === 'die' || h.st === 'dead') return;
    if (UI.dlg && btn === 'left') { /* nhấp ra ngoài thì giữ nguyên, tránh đóng nhầm */ }
    var sk = skillFor(btn), e = entAt(sx, sy), w = E.toWorld(sx, sy);
    if (e && e.kind === 'drop' && btn === 'left') { h.goal = { type: 'pickup', target: e }; return; }
    if (e && e.kind === 'npc' && btn === 'left') { h.goal = { type: 'talk', target: e }; return; }
    if (e && e.kind === 'obj' && btn === 'left') { h.goal = { type: 'use', target: e }; return; }
    if (e && e.kind === 'mon') {
      h.goal = { type: isSpell(sk) ? 'cast' : 'attack', skill: sk || 'attack', target: e, hold: true }; S.target = e; return;
    }
    // mặt đất
    if (isSpell(sk) || (btn === 'right' && sk && sk !== 'attack')) h.goal = { type: 'cast', skill: sk, x: w[0], y: w[1], hold: true };
    else if (btn === 'right' || shift) h.goal = { type: 'attack', skill: sk || 'attack', x: w[0], y: w[1], inPlace: true, hold: true };
    else { h.goal = { type: 'move', x: w[0], y: w[1] }; h.path = null; }
    S.target = null;
  }
  var holdT = 0;
  function holdTick() {
    var h = S.hero; holdT += 1;
    var btn = 'left', e = entAt(I.mouse.x, I.mouse.y);
    if (e && e.kind !== 'mon') return;
    var g = h.goal;
    if (!g || g.type === 'move' || (g.type === 'cast' && !g.target) || (g.inPlace && !g.target)) {
      var w = E.toWorld(I.mouse.x, I.mouse.y);
      if (!g || holdT % 4 === 0) command(I.mouse.x, I.mouse.y, btn, I.shift);
    }
  }
  function touchAttack(skill) {
    var h = S.hero, sk = skill || S.leftSkill || 'attack';
    if (h.st === 'die' || h.st === 'dead') return;
    var best = null, bd = 12;
    S.ents.forEach(function (m) { if (m.kind === 'mon' && m.st !== 'die' && m.st !== 'dead') { var d = dist(m, h); if (d < bd) { bd = d; best = m; } } });
    if (best) { h.goal = { type: isSpell(sk) ? 'cast' : 'attack', skill: sk, target: best, hold: true }; S.target = best; }
    else { var a = angOf(h.dir); h.goal = { type: isSpell(sk) ? 'cast' : 'attack', skill: sk, x: h.x + Math.cos(a) * 6, y: h.y + Math.sin(a) * 6, inPlace: true }; }
  }

  Game.assignSkill = function (which, id) {
    if (which === 'left') S.leftSkill = id; else S.rightSkill = id;
    UI.msg((DA.skill(id) ? DA.skill(id).name : 'Đánh thường') + (which === 'left' ? ' -> chuột trái' : ' -> chuột phải'));
  };
  Game.bindFree = function (id) {
    var i = S.fkeys.indexOf(id); if (i >= 0) { UI.msg(DA.skill(id).name + ' đã ở F' + (i + 1)); return; }
    for (i = 0; i < 8; i++) if (!S.fkeys[i]) { S.fkeys[i] = id; UI.msg(DA.skill(id).name + ' -> F' + (i + 1)); return; }
  };
  function fkeyUse(n) {
    var id = S.fkeys[n]; if (!id) return;
    S.rightSkill = id; UI.refreshSkillIcons();
  }
  Game.statUp = function (st) {
    if (S.char.statPts <= 0) return;
    if (!safe(function () { return D2R.spendStat(S.char, st); }, false)) return;
    recalc(); E.sfx(['button'], 0.3); UI.dirty = true; save();
  };
  Game.skillUp = function (id) {
    var c = S.char, sk = DA.skill(id); if (!sk) return;
    var r = D2R.learnSkill(c, id);
    if (!r.ok) { UI.msg(String(r.why || 'Chưa học được'), '#ff9a8a'); return; }
    if (c.skills[id] === 1 && !sk.passive) {
      Game.bindFree(id);
      if (!S.rightSkill || S.rightSkill === 'attack') S.rightSkill = id;
    }
    recalc(); E.sfx(['button'], 0.3); UI.dirty = true; UI.refreshSkillIcons(); save();
  };
  Game.equipItem = function (it) {
    var c = S.char, sl = DA.slotOf(it);
    if (sl === 'ring1' && c.equip.ring1 && !c.equip.ring2) sl = 'ring2';
    var rq = DA.req(it);
    if (rq.lvl > c.lvl) { UI.msg('Cần cấp ' + rq.lvl + ' để trang bị.', '#ff9a8a'); return; }
    if (rq.str > c.str) { UI.msg('Cần Sức mạnh ' + rq.str + '.', '#ff9a8a'); return; }
    if (rq.dex > c.dex) { UI.msg('Cần Nhanh nhẹn ' + rq.dex + '.', '#ff9a8a'); return; }
    var idx = c.inv.indexOf(it); if (idx < 0) return;
    c.inv.splice(idx, 1);
    var old = c.equip[sl];
    if (old) { if (!addToInv(old)) { c.inv.push(it); UI.msg('Túi đồ đầy.'); return; } }
    c.equip[sl] = it; recalc(); E.sfx(['inv_metal']); UI.sel = null; UI.dirty = true;
  };
  Game.unequip = function (sl) {
    var c = S.char, it = c.equip[sl]; if (!it) return;
    if (!addToInv(it)) { UI.msg('Túi đồ đầy.'); return; }
    delete c.equip[sl]; recalc(); UI.dirty = true;
  };
  Game.dropItem = function (it) {
    var c = S.char, i = c.inv.indexOf(it); if (i >= 0) c.inv.splice(i, 1);
    dropItem(it, S.hero.x + rnd(-0.6, 0.6), S.hero.y + rnd(0.5, 1.2)); UI.dirty = true;
  };
  Game.toBelt = function (it) {
    var c = S.char, bi = beltFree(c); if (bi < 0) { UI.msg('Đai đã đầy.'); return; }
    var i = c.inv.indexOf(it); if (i >= 0) c.inv.splice(i, 1); c.belt[bi] = it; UI.sel = null; UI.dirty = true;
  };
  Game.useItem = function (it) {
    var c = S.char, p = DA.potionInfo(it); if (!p) return;
    var i = c.inv.indexOf(it); if (i >= 0) c.inv.splice(i, 1); else { var b = c.belt.indexOf(it); if (b >= 0) c.belt[b] = null; }
    quaff(p); UI.sel = null; UI.dirty = true;
  };
  function quaff(p) {
    S.regen.push({ hp: p.hp / p.dur, mp: p.mp / p.dur, left: p.dur });
    E.sfx(['power_potion', 'inv_potion'], 0.5); floatText(S.hero.x, S.hero.y, p.hp ? '+' + p.hp : '+' + p.mp, p.hp ? '#ff7a7a' : '#7aa0ff');
  }
  Game.drinkBelt = function (i) {
    var c = S.char, it = c.belt[i]; if (!it || !S.hero || S.hero.st === 'die' || S.hero.st === 'dead') return;
    var p = DA.potionInfo(it); if (!p) return; c.belt[i] = null; quaff(p); UI.dirty = true; UI._last.sig = null;
  };
  Game.buyItem = function (it) {
    var c = S.char, pr = DA.buyPrice(it);
    if (c.gold < pr) { UI.msg('Không đủ vàng.', '#ff9a8a'); return; }
    var copy = JSON.parse(JSON.stringify(it));
    var bi = DA.potionInfo(copy) ? beltFree(c) : -1;
    if (bi >= 0) c.belt[bi] = copy; else if (!addToInv(copy)) { UI.msg('Túi đồ đầy.'); return; }
    c.gold -= pr; E.sfx(['inv_coins']); UI.dirty = true; UI._last.sig = null;
  };
  Game.sellItem = function (it) {
    var c = S.char, i = c.inv.indexOf(it); if (i < 0) return;
    c.inv.splice(i, 1); c.gold += DA.sellPrice(it); E.sfx(['inv_coins']); UI.dirty = true;
  };

  /* ================================================================ lưu / nạp */
  function save() {
    if (!S.char) return;
    try {
      var c = S.char;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, char: c, left: S.leftSkill, right: S.rightSkill, fkeys: S.fkeys, corpse: S.corpse, at: Date.now() }));
    } catch (e) {}
  }
  Game.save = save;
  function loadSave() {
    try { var s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  Game.hasSave = function () { var s = loadSave(); return !!(s && s.char); };
  function normChar(c) {
    c.skills = c.skills || {}; c.inv = c.inv || []; c.equip = c.equip || {}; c.quests = c.quests || {}; c.gold = c.gold || 0;
    var belt = c.belt || []; c.belt = [null, null, null, null]; belt.forEach(function (b, i) { if (b && i < 4) c.belt[i] = b; });
    c.inv.forEach(function (it) { if (it.ix == null) { var sp = findSpot({ inv: c.inv.filter(function (x) { return x !== it && x.ix != null; }) }, it.w || 1, it.h || 1); it.ix = sp ? sp[0] : 0; it.iy = sp ? sp[1] : 0; } });
    c.statPts = c.statPts || 0; c.skillPts = c.skillPts || 0; c.stash = c.stash || []; c.waypoints = c.waypoints || {};
  }
  function startPlay(ch) {
    S.char = ch; normChar(ch); recalc();
    ch.hp = ch.hp > 0 ? ch.hp : S.d.maxHp;
    S.stamina = S.stamMax; S.regen = []; S.denLeft = null; S.scene = 'play';
    heroLayerCache = null;
    UI.showHud(true); UI.refreshSkillIcons(); UI.refreshBelt();
    return enterArea('rogue_encampment', null).then(function () {
      recalc();
      UI.msg('Chào mừng đến Rogue Encampment.');
      save();
    });
  }
  Game.newGame = function (cls, name) {
    UI.showLoad(true, 'Đang chuẩn bị...');
    var ch = D2R.newCharacter(cls, name);
    S.leftSkill = 'attack'; S.rightSkill = 'attack'; S.fkeys = [null, null, null, null, null, null, null, null]; S.corpse = null;
    normChar(ch);
    // gán sẵn các kỹ năng đã có từ đầu
    Object.keys(ch.skills).forEach(function (id) { if (ch.skills[id] > 0 && DA.skill(id) && !DA.skill(id).passive) { var i = S.fkeys.indexOf(null); if (i >= 0) S.fkeys[i] = id; if (S.rightSkill === 'attack') S.rightSkill = id; } });
    var ss = D2DATA.classes[cls] && D2DATA.classes[cls].startSkill;
    if (ss) {
      var sid = String(ss).toLowerCase().replace(/\s+/g, '_');
      if (D2DATA.skills[sid] && !(ch.skills[sid] > 0)) { ch.skills[sid] = 1; var fi = S.fkeys.indexOf(null); if (fi >= 0) S.fkeys[fi] = sid; S.rightSkill = sid; }
    }
    startPlay(ch);
  };
  Game.continueGame = function () {
    var s = loadSave(); if (!s) return;
    S.leftSkill = s.left || 'attack'; S.rightSkill = s.right || 'attack'; S.fkeys = s.fkeys || S.fkeys; S.corpse = s.corpse || null;
    UI.showLoad(true, 'Đang tải...');
    startPlay(s.char);
  };
  Game.toTitle = function () {
    save(); S.scene = 'title'; UI.showHud(false); UI.closeAll(); UI.showDead(false); E.music('town');
    S.ents = []; S.hero = null; UI.showTitle(Game.hasSave());
  };

  /* ================================================================ vòng lặp & vẽ */
  function updateWorld(dt) {
    S.time += dt;
    var h = S.hero; if (!h) return;
    updateHero(dt);
    var ents = S.ents;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.kind === 'mon') updateMon(e, dt);
      else if (e.kind === 'missile') updateMissile(e, dt);
      else if (e.kind === 'fx') { e.t += dt; if (e.t > e.life) e.removed = true; }
      else if (e.kind === 'drop') {
        if (e.gold && !e.removed && dist(e, h) < 1.3 && h.st !== 'die' && h.st !== 'dead') pickup(e);
      } else e.stT += dt * 1000;
      if (e.kind === 'missile' && e.st === 'dead') e.removed = true;
    }
    for (i = S.floaters.length - 1; i >= 0; i--) { S.floaters[i].t += dt; if (S.floaters[i].t > 1.1) S.floaters.splice(i, 1); }
    if (ents.some(function (e) { return e.removed; })) { S.ents = ents.filter(function (e) { return !e.removed; }); }
    // cam
    var k = 1 - Math.pow(0.0005, dt);
    E.cam.x += (h.x - E.cam.x) * k; E.cam.y += (h.y - E.cam.y) * k;
    // hover
    S.hover = I.mouse.inside && !I.touch ? entAt(I.mouse.x, I.mouse.y) : null;
    if (S.time - S.lastSave > 20) { S.lastSave = S.time; save(); }
    if (S.areaId === 'den_of_evil' && S.denLeft === 0 && S.char.quests.den_of_evil === 'active') { S.char.quests.den_of_evil = 'cleared'; UI.msg('Den of Evil đã sạch! Hãy báo cho Akara.', '#ffe27a'); }
  }

  function heroAnim(h) {
    if (h.st === 'attack' || h.st === 'cast') return h.act ? h.act.anim : 'swing';
    return { idle: 'stance', walk: 'run', run: 'run', hit: 'hit', die: 'die', dead: 'die' }[h.st] || 'stance';
  }
  function scaledT(e, an) {   // trải hoạt ảnh play_once lên đúng thời lượng trạng thái
    if (an && e.stDur && (e.st === 'attack' || e.st === 'cast' || e.st === 'hit')) return e.stT * an.dur / e.stDur;
    return e.stT;
  }
  function drawHero(sx, sy, d) {
    var h = d.e, L = heroLayers(), nm = heroAnim(h);
    var any = false, probe = L.chest || L.head;
    var an = E.animOf(probe, nm); var t = scaledT(h, an);
    if (h.st === 'dead') t = 1e6;
    E.ctx.fillStyle = 'rgba(0,0,0,.3)'; E.ctx.beginPath(); E.ctx.ellipse(sx, sy, 20, 9, 0, 0, 7); E.ctx.fill();
    any = E.drawAvatar(L, nm, t, h.dir, sx, sy, 1);
    if (!any) E.drawBlob(sx, sy, '#d8b080', 12, h.dir, null);
  }
  function drawMon(sx, sy, d) {
    var m = d.e, nm, t = m.stT;
    if (m.spawnT > 0) { nm = 'spawn'; t = (E.animOf(m.art, 'spawn') ? E.animOf(m.art, 'spawn').dur : 800) - m.spawnT; }
    else if (m.st === 'die' || m.st === 'dead') { nm = E.pickAnim(m.art, ['die']) || 'die'; if (m.st === 'dead') t = 1e6; }
    else if (m.st === 'attack') nm = (m.act && m.act.anim) || 'swing';
    else if (m.st === 'cast') nm = (m.act && E.animOf(m.art, m.act.kind) ? m.act.kind : null) || E.pickAnim(m.art, ['cast', 'shoot', 'swing']) || 'swing';
    else if (m.st === 'hit') nm = 'hit';
    else if (m.st === 'run' || m.st === 'walk') nm = 'run';
    else nm = 'stance';
    var an = E.animOf(m.art, nm);
    if (an && (m.st === 'attack' || m.st === 'cast' || m.st === 'hit') && m.stDur) t = m.stT * an.dur / m.stDur;
    var big = m.rank !== 'normal';
    if (m.st !== 'dead') { E.ctx.fillStyle = 'rgba(0,0,0,.3)'; E.ctx.beginPath(); E.ctx.ellipse(sx, sy, big ? 24 : 18, big ? 11 : 8, 0, 0, 7); E.ctx.fill(); }
    if (m.rank === 'champion' || m.rank === 'unique') { E.ctx.save(); E.ctx.shadowColor = m.rank === 'unique' ? '#ffe45a' : '#6e7bff'; E.ctx.shadowBlur = 14; }
    var ok = m.art ? E.drawSprite(m.art, nm, t, m.dir, sx, sy, m.hitFlash > 0 ? 0.7 : 1) : false;
    if (m.rank === 'champion' || m.rank === 'unique') E.ctx.restore();
    if (!ok) E.drawBlob(sx, sy, m.st === 'dead' ? '#442' : '#a44', 11, m.dir, null);
    if (S.hover === m && m.st !== 'dead') { E.ctx.strokeStyle = 'rgba(255,60,60,.8)'; E.ctx.lineWidth = 2; E.ctx.beginPath(); E.ctx.ellipse(sx, sy, 22, 10, 0, 0, 7); E.ctx.stroke(); }
  }
  /* Đồ vật khu: D2_ASSETS.townObjects[type] = { tile, tileset? } hoặc { sheet, anim? }, kèm ox/oy (px, tuỳ chọn).
   * Neo vẽ = tâm chân vật (x + w/2, y + h/2) trên lưới; parts: [{tile, dx, dy}] vẽ như ô bản đồ tại tâm + (dx, dy). Thiếu mục -> không vẽ gì. */
  function townObj(type) { var t = A.townObjects; return (t && t[type]) || null; }
  var OBJ_USE = { stash: true, waypoint: true };
  function drawObj(sx, sy, d) {
    var o = d.e, t = townObj(o.otype); if (!t) return;
    var ts = A.tilesets && A.tilesets[t.tileset || S.grid.tileset], rec = ts && E.images[ts.img];
    if (t.tile != null || t.parts) {
      if (!ts || !rec || !rec.ok) return;
      var parts = t.parts || [{ tile: t.tile, dx: 0, dy: 0 }], i;
      for (i = 0; i < parts.length; i++) {   // mỗi mảnh vẽ như ô bản đồ tại ô (tâm + dx, tâm + dy)
        var pt = parts[i], tr = ts.tiles[pt.tile]; if (!tr) continue;
        var p = E.toScreen(o.x + (pt.dx || 0), o.y + (pt.dy || 0));
        E.ctx.drawImage(rec.img, tr[0], tr[1], tr[2], tr[3], Math.round(p[0] - tr[4] * E.Z + (t.ox || 0)), Math.round(p[1] - tr[5] * E.Z + (t.oy || 0)), Math.round(tr[2] * E.Z), Math.round(tr[3] * E.Z));
      }
    } else if (t.sheet) {
      E.drawSprite(t.sheet, t.anim || 'stance', S.time * 1000, 0, sx - (t.ox || 0), sy - (t.oy || 0), 1);
    }
  }
  function drawNpc(sx, sy, d) {
    var n = d.e;
    E.ctx.fillStyle = 'rgba(0,0,0,.3)'; E.ctx.beginPath(); E.ctx.ellipse(sx, sy, 18, 8, 0, 0, 7); E.ctx.fill();
    if (!E.drawSprite(n.art, 'stance', n.stT, 5, sx, sy, 1)) E.drawBlob(sx, sy, '#6a8ac0', 11, 5, null);
    var info = NPC[n.npc] || { name: n.npc };
    var c = E.ctx; c.font = '12px Georgia,serif'; c.textAlign = 'center'; c.fillStyle = S.hover === n ? '#fff' : '#9ec8ff'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.strokeText(info.name, sx, sy - 100); c.fillText(info.name, sx, sy - 100);
  }
  function drawDrop(sx, sy, d) {
    var e = d.e;
    if (e.corpse) { E.ctx.fillStyle = '#322'; E.ctx.beginPath(); E.ctx.ellipse(sx, sy, 16, 7, 0, 0, 7); E.ctx.fill(); }
    else {
      var t = (S.time - e.born) * 1000;
      var an = E.animOf(e.art, 'power'), tt = an ? Math.min(t, an.dur * 0.999) : 0;
      if (!E.drawSprite(e.art, 'power', tt, 0, sx, sy, 1)) { E.ctx.fillStyle = e.gold ? '#ffd24a' : '#bbb'; E.ctx.fillRect(sx - 6, sy - 6, 12, 8); }
    }
    e.sx = sx; e.sy = sy;
  }
  function drawMissile(sx, sy, d) {
    var m = d.e;
    var ok;
    if (m.st === 'die') { ok = E.drawSprite(m.art, 'power', m.t * 1000, m.dir, sx, sy - 18, Math.max(0, 1 - m.t / 0.3)); }
    else ok = E.drawSprite(m.art, 'power', m.t * 1000, m.dir, sx, sy - 18, 1);
    if (!ok) { E.ctx.fillStyle = ELCOL[elemOf(m.dmg && m.dmg.elem)]; E.ctx.beginPath(); E.ctx.arc(sx, sy - 18, m.st === 'die' ? 14 : 6, 0, 7); E.ctx.fill(); }
  }
  function drawFx(sx, sy, d) {
    var e = d.e, f = e.t / e.life, c = E.ctx;
    c.save(); c.globalAlpha = 1 - f; c.strokeStyle = e.color || '#fff'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(sx, sy, e.ring * (E.tw / 2) * f, e.ring * (E.th / 2) * f, 0, 0, 7); c.stroke(); c.restore();
  }

  var vigCv = null;
  function render() {
    var drawables = [];
    E.updateCam();
    S.ents.forEach(function (e) {
      if (e.kind !== 'obj') {   // vật khu (lều, lò rèn...) to và neo ở tâm: để renderWorld tự cắt; còn lại cắt sớm ở đây
        var ps = E.toScreen(e.x, e.y);
        if (ps[0] < -320 || ps[0] > 960 + 320 || ps[1] < -260 || ps[1] > 540 + 420) return;
      }
      var fn = e.kind === 'hero' ? drawHero : e.kind === 'mon' ? drawMon : e.kind === 'npc' ? drawNpc : e.kind === 'obj' ? drawObj : e.kind === 'drop' ? drawDrop : e.kind === 'missile' ? drawMissile : e.kind === 'fx' ? drawFx : null;
      if (fn) drawables.push({ k: e.x + e.y + (e.kind === 'drop' ? -0.4 : 0), x: e.x, y: e.y, e: e, draw: fn });
    });
    E.renderWorld(drawables);
    var c = E.ctx;
    // hầm động tối dần quanh người chơi
    if (S.grid && S.grid.tileset !== 'grassland' && S.hero) {
      if (!vigCv) {   // vẽ sẵn một lần, kéo theo vị trí hero trên màn hình
        vigCv = document.createElement('canvas'); vigCv.width = 1920; vigCv.height = 1080;
        var vc = vigCv.getContext('2d'), gr = vc.createRadialGradient(960, 540, 120, 960, 540, 520);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)'); vc.fillStyle = gr; vc.fillRect(0, 0, 1920, 1080);
      }
      var p = E.toScreen(S.hero.x, S.hero.y);
      c.drawImage(vigCv, Math.round(p[0] - 960), Math.round(p[1] - 30 - 540));
    }
    // nhãn đồ rơi
    var show = I.alt || I.touch, rects = [];
    c.font = '12px Georgia,serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    S.ents.forEach(function (e) {
      if (e.kind !== 'drop' || e.sx == null) return;
      var hov = S.hover === e;
      if (!(show || hov || S.time - e.born < 4 || e.corpse)) { e.labelRect = null; return; }
      var tw = c.measureText(e.label).width + 8, x = e.sx - tw / 2, y = e.sy - 30;
      for (var i = 0; i < rects.length; i++) if (Math.abs(rects[i][0] - x) < tw && Math.abs(rects[i][1] - y) < 15) y = rects[i][1] - 15;
      rects.push([x, y]); e.labelRect = [x, y, tw, 14];
      c.fillStyle = hov ? 'rgba(60,40,10,.95)' : 'rgba(0,0,0,.7)'; c.fillRect(x, y, tw, 14);
      c.fillStyle = e.gold ? '#ffd24a' : e.corpse ? '#cc8' : UI.qcol(e.item && e.item.q); c.fillText(e.label, x + 4, y + 11);
    });
    // chữ nổi
    c.textAlign = 'center';
    S.floaters.forEach(function (f) {
      var p2 = E.toScreen(f.x, f.y), a = 1 - f.t / 1.1;
      c.globalAlpha = Math.max(0, a); c.font = (f.big ? 'bold 20px' : 'bold 14px') + ' Georgia,serif'; c.fillStyle = '#000'; c.fillText(f.text, p2[0] + 1, p2[1] - 60 - f.t * 40 + 1);
      c.fillStyle = f.color; c.fillText(f.text, p2[0], p2[1] - 60 - f.t * 40);
    });
    c.globalAlpha = 1;
    // con trỏ nhắm (di chuột)
    if (S.scene === 'play' && S.paused) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, 960, 540); }
  }

  /* ---------------------------------------------------------------- vòng lặp chính */
  var last = 0, accum = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts; var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (S.scene === 'play' && S.hero) {
      var portrait = I.touch && window.innerHeight > window.innerWidth;
      S.paused = !!UI.open.menu || portrait;
      if (!S.paused && !Game.freeze) updateWorld(dt);
      render();
      UI.update(ts);
      if (E.shake > 0) E.shake = Math.max(0, E.shake - 40 * dt);
    } else if (S.scene === 'title') {
      E.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /* ---------------------------------------------------------------- nối input */
  function bindInput() {
    I.on('click', function (ev) { if (S.scene === 'play' && !S.paused) { holdT = 0; command(ev.x, ev.y, 'left', ev.shift); } });
    I.on('rclick', function (ev) { if (S.scene === 'play' && !S.paused) command(ev.x, ev.y, 'right', ev.shift); });
    I.on('wheel', function (ev) {
      if (S.scene !== 'play') return;
      var ids = ['attack'].concat(DA.skillsOf(S.char.cls).filter(function (k) { return (S.char.skills[k.id] || 0) > 0 && !k.passive; }).map(function (k) { return k.id; }));
      var i = ids.indexOf(S.rightSkill); i = (i + ev.d + ids.length) % ids.length; S.rightSkill = ids[i]; UI.refreshSkillIcons();
    });
    I.on('skillbtn', function (ev) {
      if (S.scene !== 'play') return;
      var id = S.fkeys[ev.n]; if (!id) { UI.msg('Chưa gán kỹ năng vào ô ' + (ev.n + 1) + '. Mở cây kỹ năng (KN) để học.'); return; }
      touchAttack(id);
    });
    I.on('potionbtn', function (ev) { if (S.scene === 'play') Game.drinkBelt(ev.n); });
    I.on('attackbtn', function () { if (S.scene === 'play') touchAttack(); });
    I.on('key', function (ev) {
      if (S.scene !== 'play') return;
      var k = ev.code;
      if (k === 'KeyI') UI.toggle('inv'); else if (k === 'KeyC') UI.toggle('char'); else if (k === 'KeyT') UI.toggle('skill');
      else if (k === 'KeyQ') UI.toggle('quest'); else if (k === 'Tab') UI.toggle('map'); else if (k === 'Escape') UI.toggleMenu();
      else if (k === 'KeyR') { S.runOn = !S.runOn; UI.msg(S.runOn ? 'Chạy' : 'Đi bộ'); }
      else if (/^Digit[1-4]$/.test(k)) Game.drinkBelt(+k.slice(5) - 1);
      else if (/^F[1-8]$/.test(k)) fkeyUse(+k.slice(1) - 1);
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
    window.addEventListener('beforeunload', save);
  }

  /* ---------------------------------------------------------------- khởi động */
  function boot() {
    var canvas = document.getElementById('view'), stage = document.getElementById('stage');
    E.ver = VER; E.init(canvas); UI.init(stage); I.init(stage, canvas); bindInput();
    if (!window.D2R || !window.D2DATA || !window.D2G) {
      UI.showLoad(true, 'Thiếu tệp dữ liệu (D2DATA/D2R/D2G). Không thể khởi động.'); return;
    }
    UI.showLoad(true, 'Đang tải...');
    E.ensureIcons().then(function () {
      UI.showLoad(false); S.scene = 'title'; UI.showTitle(Game.hasSave());
      requestAnimationFrame(frame);
    });
  }
  window.D2.boot = boot;

  /* ================================================================ D2DBG: móc cho kiểm thử */
  window.D2DBG = {
    S: S,
    getState: function () {
      var h = S.hero, c = S.char;
      return {
        scene: S.scene, area: S.areaId, time: S.time,
        hero: h ? { x: h.x, y: h.y, st: h.st, dir: h.dir, goal: h.goal ? h.goal.type : null } : null,
        hp: c && c.hp, mp: c && c.mp, lvl: c && c.lvl, xp: c && c.xp, gold: c && c.gold, statPts: c && c.statPts, skillPts: c && c.skillPts,
        cls: c && c.cls, skills: c && c.skills, quests: c && c.quests, inv: c ? c.inv.length : 0, belt: c ? c.belt.filter(Boolean).length : 0,
        left: S.leftSkill, right: S.rightSkill, kills: S.kills, denLeft: S.denLeft, exits: S.grid ? S.grid.exits : [], hero0: S.grid && S.grid.hero,
        mons: S.ents.filter(function (e) { return e.kind === 'mon'; }).map(function (m) { return { id: m.monId, x: m.x, y: m.y, hp: m.hp, st: m.st, ai: m.ai, aggro: m.aggro, rank: m.rank, art: m.art }; }),
        drops: S.ents.filter(function (e) { return e.kind === 'drop' && !e.removed; }).map(function (d) { return { x: d.x, y: d.y, label: d.label, gold: d.gold }; }),
        npcs: S.ents.filter(function (e) { return e.kind === 'npc'; }).map(function (n) { return { id: n.npc, x: n.x, y: n.y }; })
      };
    },
    // vị trí con trỏ (toạ độ client) của một điểm lưới, để bắn sự kiện chuột thật
    client: function (x, y, lift) {
      var p = E.toScreen(x, y), r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.left + p[0] * r.width / 960, y: r.top + (p[1] - (lift || 0)) * r.height / 540, sx: p[0], sy: p[1] };
    },
    teleport: function (x, y) { if (S.hero) { S.hero.x = x; S.hero.y = y; S.hero.path = null; S.hero.goal = null; E.cam.x = x; E.cam.y = y; markSeen(); } },
    goto: function (id, from) { return enterArea(id, from || null); },
    spawn: function (monId, n, dx, dy, rank) {
      var out = [], h = S.hero;
      for (var i = 0; i < (n || 1); i++) {
        var x = h.x + (dx != null ? dx : 3) + i * 0.6, y = h.y + (dy != null ? dy : 0);
        out.push(makeMonster(monId, x, y, rank || 'normal', 9000 + i, Math.random, null));
      }
      return out.length;
    },
    give: function (o) {
      var c = S.char; o = o || {};
      ['gold', 'statPts', 'skillPts', 'str', 'dex', 'vit', 'ene'].forEach(function (k) { if (o[k] != null) c[k] = (k === 'gold' || k.slice(-3) === 'Pts') ? c[k] + o[k] : o[k]; });
      if (o.skills) Object.keys(o.skills).forEach(function (id) { c.skills[id] = o.skills[id]; if (!S.fkeys.includes(id)) { var i = S.fkeys.indexOf(null); if (i >= 0) S.fkeys[i] = id; } });
      if (o.xp) { var r = D2R.grantXp(c, 1, 0); c.xp += o.xp; }
      recalc(); UI.refreshSkillIcons(); UI.dirty = true;
    },
    setSkills: function (l, r) { S.leftSkill = l; S.rightSkill = r; UI.refreshSkillIcons(); },
    addXp: function (n) {   // đẩy xp tới ngưỡng cấp kế tiếp qua grantXp
      var c = S.char, before = c.lvl;
      var r = D2R.grantXp(c, c.lvl, n); if (r && r.leveled) onLevelUp(); recalc(); return { lvl: c.lvl, before: before, r: r };
    },
    killAllMons: function () { S.ents.forEach(function (e) { if (e.kind === 'mon' && e.st !== 'dead' && e.st !== 'die') killMon(e); }); },
    sim: function (sec) { var n = Math.round(sec * 30); for (var i = 0; i < n; i++) updateWorld(1 / 30); render(); UI.update(performance.now() + 1000); },
    dropAt: function (it, x, y) { dropItem(it, x, y); },
    makePotion: DA.makePotion, entAt: entAt, render: render, DA: DA,
    addNpc: function (id, x, y) { mk('npc', x, y, { npc: id, dir: 5, art: npcArt(id) }); },
    monIds: function () { return coll(S.def && S.def.monsters).map(function (m) { return typeof m === 'string' ? m : m.id; }); },
    heroLayers: function () { return JSON.parse(JSON.stringify(heroLayers())); },
    // to lien he 8 huong cua hero (canvas #d2-sheet gan vao body; file:// lam toDataURL loi), ve bang E.drawAvatar that len canvas phu
    contactSheet: function (anim) {
      var L = heroLayers(), cv = document.createElement('canvas'), W = 150, Hh = 170; cv.width = W * 8; cv.height = Hh;
      var c = cv.getContext('2d'), old = E.ctx; c.fillStyle = '#3a4a2c'; c.fillRect(0, 0, cv.width, Hh);
      E.ctx = c; var ok = 0;
      for (var d = 0; d < 8; d++) { if (E.drawAvatar(L, anim || 'stance', 0, d, W * d + W / 2, Hh - 30, 1)) ok++; c.fillStyle = '#fff'; c.font = '12px sans-serif'; c.fillText('dir ' + d, W * d + 4, 14); }
      E.ctx = old; cv.id = 'd2-sheet'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'; document.body.appendChild(cv); return { ok: ok };
    },
    freeze: function (on) { Game.freeze = !!on; },
    zoom: function (z) { E.view = z || 1; }   // chỉ để chụp ảnh khu rộng: thu nhỏ khung hình quanh tâm, không đụng luật
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
