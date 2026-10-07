/* Ác Quỷ II - game.js
 * Vòng lặp, thực thể (máy trạng thái idle|walk|run|attack|cast|hit|die|dead), AI quái D2, chiến đấu qua D2R,
 * đạn, đồ rơi, XP, nhiệm vụ Den of Evil, chết/hồi sinh, lưu/nạp.
 * Mọi chỗ đọc D2DATA/D2R đều đi qua bộ chuyển D2.DA ở đầu tệp (đổi tên trường chỉ sửa ở đó).
 */
(function () {
  'use strict';
  var D2 = window.D2 = window.D2 || {};
  var E = D2.E, I = D2.Input, UI = D2.UI, OBJ = E.OBJ, SPR = E.SPR;
  var VER = '20261006g';
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
    { id: 'necromancer', name: 'Necromancer', locked: false, gender: 'male', blurb: 'Triệu hồi xác sống, nguyền rủa, xương độc.' },
    { id: 'paladin', name: 'Paladin', locked: false, gender: 'male', blurb: 'Hiệp sĩ thánh với hào quang và khiên.' },
    { id: 'druid', name: 'Druid', locked: false, gender: 'male', blurb: 'Biến hình, gọi thú, phép thiên nhiên.' },
    { id: 'assassin', name: 'Assassin', locked: false, gender: 'female', blurb: 'Bẫy, võ thuật tích lực, ẩn thân.' }
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

  /* Biểu tượng kỹ năng: ô IconCel của skilldesc.txt trong dc6 biểu tượng của lớp (D2_UI.skillIcons[mã lớp]). */
  DA.skillIcon = function (id) {
    var sk = DA.skill(id), cls = sk && D2DATA.classes[sk.cls];
    var list = cls && E.UI.skillIcons && E.UI.skillIcons[cls.code];
    var cel = sk && sk.raw && sk.raw.icon;
    return list && cel != null && list[cel] ? list[cel] : null;
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
  // Hình đồ trong túi: dc6 invfile của D2 (đồ unique/set có hình riêng), đặt giữa khung bw x bh.
  DA.invRect = function (it) {
    var b = DA.base(it) || {}, ic = E.UI.icons || {};
    var f = (it.q === 'unique' && b.uniqueinvfile) || (it.q === 'set' && b.setinvfile) || b.invfile;
    if (DA.isGold(it)) f = 'invgld';
    var e = f && ic[f];
    return e ? e.r || e : null;
  };
  DA.iconBox = function (it, bw, bh) {
    var r = DA.invRect(it); if (!r) return null;
    var k = Math.min(bw / r[2], bh / r[3], 1.5);
    return E.uiSprite(r, k);
  };
  DA.isEquippable = function (it) {
    var b = DA.base(it); if (!b) return true;
    return b.kind === 'weapon' || b.kind === 'armor' || /ring|amul/.test(b.type);
  };
  // Hàng bán của NPC, dựng từ bảng đồ D2 (cấp thấp, loại thường).
  DA.shopStock = function (npcId) {
    var bases = D2DATA.items.bases, out = [], nd = D2DATA.npcs[npcId] || {}, sells = nd.sells || [];
    var act = (S.def && S.def.act) || 1, cap = 6 + act * 8;
    function pickFrom(list, n) { var arr = list.slice(), r = []; while (arr.length && r.length < n) r.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]); return r; }
    var all = Object.keys(bases).map(function (k) { return bases[k]; }).filter(function (b) { return b.spawnable && (b.level || 0) <= cap && b.tier !== 'elite'; });
    function has(x) { return sells.indexOf(x) >= 0; }
    if (has('potions')) POTS.forEach(function (c) { if (bases[c]) out.push(DA.makeItem(c)); });
    if (has('scrolls')) ['tsc', 'isc'].forEach(function (c) { if (bases[c]) out.push(DA.makeItem(c)); });
    var caster = all.filter(function (b) { return (has('staves') && b.type === 'staf') || (has('wands') && b.type === 'wand') || (has('orbs') && b.type === 'orb'); });
    pickFrom(caster, 4).forEach(function (b) { out.push(DA.makeItem(b.code)); });
    if (has('weapons')) pickFrom(all.filter(function (b) { return b.kind === 'weapon' && !/orb|wand|staf|tpot/.test(b.type); }), 8).forEach(function (b) { out.push(DA.makeItem(b.code)); });
    if (has('armor')) pickFrom(all.filter(function (b) { return b.kind === 'armor'; }), 8).forEach(function (b) { out.push(DA.makeItem(b.code)); });
    if (has('misc')) pickFrom(all.filter(function (b) { return /ring|amul/.test(b.type); }), 3).forEach(function (b) { out.push(DA.makeItem(b.code)); });
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
  // Khu chơi được = có trong D2DATA và bộ sinh bản đồ D2G dựng được
  // D2G.supports chỉ trả lời đúng khi nhóm bản đồ của act đã nạp; trước đó, có nhóm bản đồ cho act là đủ
  DA.playable = function (id) {
    var a = DA.area(id); if (!a || !window.D2G) return false;
    var maps = E.index && E.index.maps, grp = maps && maps[a.act];
    if (maps && !grp) return false;
    if (grp && !(window.D2_GROUPS && D2_GROUPS[grp])) return true;
    return !D2G.supports || D2G.supports(id);
  };
  DA.area = function (id) {
    var a = coll(window.D2DATA && D2DATA.areas).filter(function (x) { return x.id === id; })[0];
    return a || null;
  };
  DA.monster = function (id) {
    return (window.D2DATA && D2DATA.monsters && D2DATA.monsters[id]) || null;
  };
  DA.aiKind = function (monId, m) {
    var k = ((m && m.aiKind) || '') + ' ' + monId;
    if (/shaman/.test(k)) return 'shaman';
    if (/archer|ranged|missile/.test(k)) return 'ranged';
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
    var bn = c.bonus || {};
    if (bn.life) d.maxHp += bn.life;
    if (bn.resAll) ['fire', 'cold', 'light', 'poison'].forEach(function (k) { d.res[k] = (d.res[k] || 0) + bn.resAll; });
    if (window.D2S && D2S.modDerived) D2S.modDerived(Game.api, d);
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
  /* Giao diện cho js/skills.js (window.D2S): triệu hồi, lời nguyền, hào quang, biến hình, bẫy, võ thuật.
   * Thực thể đồng minh là kind 'mon' có ally: true; game.js không chạy AI quái cho chúng, D2S.update lo. */
  Game.api = {
    S: S, E: E, UI: UI, DA: DA, mk: mk, dist: dist, rnd: rnd, ri: ri, clamp: clamp, setSt: setSt, restart: restart,
    canStand: canStand, los: los, findPath: findPath, tryMove: tryMove,
    damageMon: function (m, amt, elem, fromHero) { return damageMon(m, amt, elem, fromHero); },
    damageHero: function (amt, src) { return damageHero(amt, src); },
    killMon: function (m) { return killMon(m); },
    spawnMissile: function (owner, tx, ty, o) { return spawnMissile(owner, tx, ty, o); },
    makeMonster: function (id, x, y, rank, pack, rng, name) { return makeMonster(id, x, y, rank, pack, rng, name); },
    floatText: function (x, y, t, c, big) { return floatText(x, y, t, c, big); },
    monArt: function (id) { return monArt(id); }, removeEnt: function (e) { return removeEnt(e); },
    recalc: function () { return recalc(); }, heroLook: function () { return heroLook(); }
  };

  /* ================================================================ lưới & đường đi */
  function blocked(g, x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= g.w || iy >= g.h) return true;
    return g.col[iy * g.w + ix] !== 0;
  }
  function walkable(x, y) { return !blocked(S.grid, x, y); }
  function canStand(x, y, r) {
    var g = S.grid; r = r == null ? 0.3 : r;
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
    for (var i = 1; i < n; i++) { var t = i / n; if (!canStand(ax + (bx - ax) * t, ay + (by - ay) * t, 0.2)) return false; }
    return true;
  }
  // Tìm đường A* 8 hướng, không cắt góc. Trả về mảng điểm [x,y] (tâm ô) hoặc null.
  // Lưới 200x200: không cấp phát lại 3 mảng 40000 phần tử mỗi lần; giới hạn vùng tìm (bbox đầu-cuối + PF_MARGIN ô) và PF_MAX_NODES nút.
  var PF = { N: 0, g: null, from: null, stamp: null, gen: 0 }, PF_MARGIN = 80, PF_MAX_NODES = 60000;
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
  function areaDef(id) { return DA.area(id); }
  // Nhạc: soundenviron của D2 trỏ tới tên trong sounds.txt; D2_UI.music giữ đúng khoá đó khi có, nếu không thì theo loại khu
  function musicFor(def) {
    var m = E.UI.music || {};
    if (def.music && m[def.music]) return def.music;
    var k = def.town ? 'town1' : def.inside ? 'cave' : 'wild';
    return m[k] ? k : Object.keys(m)[0];
  }
  Game.playAreaMusic = function () { var d = areaDef(S.areaId); if (d) E.music(musicFor(d)); };

  // Thực thể đặt sẵn trong DS1: loại 1 là quái/NPC theo monpreset của act, loại 2 là vật thể theo objpreset
  // Chỉ số đối tượng trong DS1 là theo act (monpreset.txt, objpreset.txt có cột Act)
  function curAct() { return (S.def && S.def.act) || 1; }
  function dk() { return (S.char && S.char.diff) || 'n'; }
  function areaLvl(def) { return (def && ((def.lvlByDiff && def.lvlByDiff[dk()]) || def.lvl)) || 1; }
  function areaMons(def) { return (def && ((def.monstersByDiff && def.monstersByDiff[dk()]) || def.monsters)) || []; }
  function presetName(id) { var l = D2DATA.monpreset && D2DATA.monpreset[String(curAct())]; return (l && l[id]) || null; }
  function objPreset(id) { return E.objPresets['act' + curAct() + ':' + id] || null; }
  function monArt(id) {
    var su = D2DATA.superuniques[id], base = su ? su.cls : id, m = DA.monster(base);
    return E.monmap[base] || (m && m.art) || null;
  }
  function sheetsForArea(def, lv) {
    var keys = [];
    areaMons(def).concat(def.bosses || [], def.superuniques || []).forEach(function (id) { var a = monArt(id); if (a) keys.push(a); });
    lv.npcs.forEach(function (n) { var nd = D2DATA.npcs[presetName(n.id)]; if (nd && nd.art) keys.push(nd.art); });
    lv.objects.forEach(function (o) { var p = objPreset(o.id); if (p && p.sprite) keys.push('obj.' + p.token); });
    return keys;
  }

  var SCRIPTED_NPCS = { lut_gholein: [{ npc: 'jerhyn', near: 'harem_level_1' }] };
  function corpseHere(id) { return !!(S.corpse && S.corpse.area === id && (S.corpse.diff || 'n') === dk()); }
  /* Một game là một lần vào nhân vật, như D2: S.gameSeed sinh lúc vào game, bố cục act (D2G.layoutAct) và seed
   * từng khu suy ra từ nó. Khu đã dựng nằm trong S.levels cùng trạng thái lúc rời (quái còn sống, rương đã mở,
   * đồ dưới đất, automap), vào lại thì lấy ra chứ không dựng mới. Chỉ giữ các khu của act đang chơi. */
  function actLayout(act) {
    var k = dk() + ':' + act;
    return S.layouts[k] || (S.layouts[k] = D2G.layoutAct(act, D2G.actSeed(S.gameSeed, dk(), act)));
  }
  function stashLevel() {
    var L = S.levelKey && S.levels[S.levelKey];
    if (!L || L.g !== S.grid) return;
    L.ents = S.ents.filter(function (e) {
      if (e.removed || e === S.hero) return false;
      if (e.kind === 'mon') return !e.ally && e.st !== 'die' && e.st !== 'dead' && e.hp > 0;
      return e.kind === 'obj' || e.kind === 'npc' || (e.kind === 'drop' && !e.corpse);
    });
    L.pendingBoss = S.pendingBoss;
  }
  function keepAct(act) {
    Object.keys(S.levels).forEach(function (k) {
      var p = k.indexOf(':'), d = areaDef(k.slice(p + 1));
      if (k.slice(0, p) !== dk() || !d || (d.act || 1) !== act) delete S.levels[k];
    });
  }
  /* Đi bộ qua mép khu: hai khu chung một hệ toạ độ của act, nên hero ra ở điểm tương ứng ngay trong mép khu mới,
   * giữ độ lệch dọc theo mép, cách mép 3 subtile. Không phải lối đi bộ thì trả null. */
  var OPP_SIDE = { n: 's', s: 'n', e: 'w', w: 'e' };
  function walkArrival(g, lay, id, from, ex, out) {
    var L = lay.links.filter(function (l) { return (l.a === id && l.b === from) || (l.a === from && l.b === id); })[0];
    if (!L) return null;
    var sd = L.a === id ? L.side : OPP_SIDE[L.side], hz = sd === 'n' || sd === 's';
    var ra = lay.levels[from].rect, rb = lay.levels[id].rect;
    var t = hz ? ex.x + 0.5 : ex.y + 0.5;
    if (out) t = hz ? (ra[0] - rb[0]) * 5 + out[0] : (ra[1] - rb[1]) * 5 + out[1];
    var n = sd === 'n' || sd === 'w' ? 3 : (hz ? rb[3] : rb[2]) * 5 - 3;
    return nearestOpen(g, ex, hz ? t : n, hz ? n : t);
  }
  // ô đi được gần (x, y) nhất trong vùng nối với lối ra ex (BFS từ ex, nên luôn tới được)
  function nearestOpen(g, ex, x, y) {
    var w = g.w, start = ex.y * w + ex.x, q = [start], seen = {}, best = start, bd = Infinity;
    seen[start] = 1;
    for (var i = 0; i < q.length && i < 20000; i++) {
      var c = q[i], cx = c % w, cy = (c / w) | 0, d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
      if (d < bd) { bd = d; best = c; }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
        var nx = cx + o[0], ny = cy + o[1], k = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= g.h || seen[k] || g.col[k] !== 0) return;
        seen[k] = 1; q.push(k);
      });
    }
    return [best % w + 0.5, ((best / w) | 0) + 0.5];
  }
  function enterArea(id, from, opts) {
    var prev = S.def;
    return enterArea0(id, from, opts).catch(function (err) { if (S.areaId !== id) S.def = prev; throw err; });
  }
  function enterArea0(id, from, opts) {
    opts = opts || {};
    var def = areaDef(id);
    if (!DA.playable(id)) { UI.msg('Khu vực này chưa mở.'); return Promise.resolve(false); }
    var gate = D2DATA.questGates && D2DATA.questGates[id], gst = gate && S.char.quests[gate];
    if (gate && gst !== 'cleared' && gst !== 'done') { UI.msg('Cần xong ' + questName(D2DATA.quests[gate]) + ' trước.', '#ff9a8a'); return Promise.resolve(false); }
    UI.showLoad(true, 'Đang vào ' + def.name + '...');
    var char = S.char, g = null, act = def.act || 1, lay = null, seed = 0, key = dk() + ':' + id, kept = null;
    S.def = def;   // curAct() đọc act của khu sắp vào khi tra preset trong lúc dựng
    return E.ensureMaps(act).then(function () {
      if (!DA.playable(id)) throw new Error('khu ' + id + ' chưa dựng được');
      lay = actLayout(act);
      seed = D2G.levelSeed(lay.seed, id);
      kept = S.levels[key] || null;
      g = kept ? kept.g : D2G.build(id, seed, null, { layout: lay });
      S.seed = seed;
      return Promise.all([E.ensureTileset(g.tileset), E.ensure(sheetsForArea(def, g)), E.ensureUi(), E.ensureHero(D2DATA.classes[char.cls].code)]);
    }).then(function () {
      // chỗ hero bước ra khỏi khu cũ (khi đang đứng ở lối sang khu này) để ra đúng điểm tương ứng bên kia
      var oldEx = S.grid && S.hero && S.areaId === from && S.grid.exits.filter(function (e) { return e.to === id; })[0];
      var out = oldEx && Math.hypot(oldEx.x + 0.5 - S.hero.x, oldEx.y + 0.5 - S.hero.y) < 6 ? [S.hero.x, S.hero.y] : null;
      stashLevel(); keepAct(act);
      if (!kept) S.levels[key] = { g: g, ents: null };
      S.grid = g; if (!g.seen) g.seen = new Uint8Array(g.w * g.h); S.areaId = id; S.areaName = def.name; S.def = def; S.levelKey = key;
      E.setLevel(g);
      S.ents = []; S.floaters = []; S.target = null; S.hover = null; S.exitArm = null;
      var hx = g.hero[0] + 0.5, hy = g.hero[1] + 0.5;
      if (from) {
        var ex = g.exits.filter(function (e) { return e.to === from; })[0];
        var wa = ex && lay.levels[from] && walkArrival(g, lay, id, from, ex, out);
        if (wa) {
          hx = wa[0]; hy = wa[1];
          S.exitArm = { ex: ex, x: hx, y: hy };   // hero đứng sát lối về: lối đó chỉ mở lại khi hero đã bước đi
          var ra = lay.levels[from].rect, rb = lay.levels[id].rect;
          S.cross = { from: from, to: id, out: out && [ra[0] * 5 + out[0], ra[1] * 5 + out[1]], at: [rb[0] * 5 + hx, rb[1] * 5 + hy] };
        } else if (ex) { var sp = openCellNear(g, ex.x, ex.y, 12); hx = sp[0]; hy = sp[1]; }
      }
      var hero = S.hero = mk('hero', hx, hy, { dir: 5, path: null, goal: null, act: null });
      E.cam.x = hx; E.cam.y = hy;
      if (kept && kept.ents) {
        kept.ents.forEach(function (e) {
          if (e.kind === 'mon') { e.aggro = false; e.act = null; e.flee = 0; e.path = null; restart(e, 'idle', 0); }
          S.ents.push(e);
        });
        S.pendingBoss = kept.pendingBoss || null;
      } else {
        g.objects.forEach(function (o) { placeObj(g, o); });
        g.npcs.forEach(function (n) {
          var name = presetName(n.id), nd = name && D2DATA.npcs[name];
          if (nd && nd.art && E.hasSheet(nd.art)) mk('npc', n.x + 0.5, n.y + 0.5, { npc: name, dir: 6, art: nd.art, home: [n.x + 0.5, n.y + 0.5] });
        });
        // NPC do script của D2 đặt, không có trong DS1 nào: Jerhyn đứng trước cổng cung điện Lut Gholein
        (SCRIPTED_NPCS[id] || []).forEach(function (sn) {
          var nd = D2DATA.npcs[sn.npc], ex = g.exits.filter(function (x) { return x.to === sn.near; })[0];
          if (!nd || !ex || S.ents.some(function (e) { return e.kind === 'npc' && e.npc === sn.npc; })) return;
          var q = openAround(g, ex.x + 0.5, ex.y + 0.5, 5, D2R.rng(seed ^ 0x6a6572));
          mk('npc', q[0], q[1], { npc: sn.npc, dir: 6, art: nd.art, home: [q[0], q[1]] });
        });
        S.pendingBoss = null;
        spawnMonsters(def, g, seed);
        placeQuestItems(id, g);
      }
      // xác của game trước (bản lưu cũ chưa có gameSeed) nằm trong một bản dựng khác, nên đặt cạnh chỗ hero vào
      if (corpseHere(id)) {
        var cp = S.corpse.game === S.gameSeed ? [S.corpse.x, S.corpse.y] : openAround(g, hx, hy, 2, Math.random);
        mk('drop', cp[0], cp[1], { item: null, corpse: S.corpse, born: S.time, label: 'Xác của ' + char.name });
      }
      S.arrive = S.time;
      var clearQ = Object.keys(D2DATA.quests).filter(function (q) { var g = D2DATA.quests[q].goal || {}; return g.type === 'clear_area' && g.area === id; })[0];
      S.denLeft = clearQ ? (char.quests[clearQ] === 'cleared' || char.quests[clearQ] === 'done' ? 0 : S.ents.filter(function (e) { return e.kind === 'mon' && !e.ally; }).length) : null;
      spawnMerc();
      questEvent({ kind: 'enter', area: id });
      E.music(musicFor(def));
      UI.showLoad(false);
      UI.dirty = true; recalc();
      markSeen();
      return true;
    });
  }
  function openCellNear(g, x, y, minD) {
    // BFS từ ô lối ra, lấy ô đi được cách lối ra >= minD
    var q = [[x, y]], seen = {}, best = null; seen[x + ',' + y] = 1;
    for (var i = 0; i < q.length && i < 16000; i++) {
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

  /* Vật thể DS1: waypoint, kho đồ, lửa trại, đuốc, rương... Kích thước theo objects.txt (subtile), vật có
   * va chạm thì chặn các subtile nó chiếm. Lửa trại, đuốc chạy chế độ ON (đang cháy) như trong thị trấn D2. */
  /* Cổng đặt sẵn trong DS1: HellGate cuối Durance sang Act IV (actTravel.via), cổng Ancients lên Worldstone Keep,
   * cổng cuối vào Worldstone Chamber. Cổng chỉ mở khi đã xong nhiệm vụ nó cần. */
  var PORTALS = {
    HellGate: function () {
      var T = D2DATA.actTravel || {}, k = Object.keys(T).filter(function (a) { return T[a].via === S.areaId; })[0];
      return k ? { to: T[k].to, needs: T[k].needs, act: +k + 1 } : null;
    },
    AncientsGateway: function () { return { to: 'worldstone_keep_level_1', needs: 'rite_of_passage' }; },
    FinalPortal: function () { return { to: 'the_worldstone_chamber', needs: null }; }
  };
  function portalOf(o) {
    var d = o.portal && PORTALS[o.portal] && PORTALS[o.portal](); if (!d) return null;
    var st = d.needs && S.char.quests[d.needs];
    d.open = !d.needs || st === 'cleared' || st === 'done';
    return d;
  }
  function objKind(p) {
    var c = (p.cls || '') + ' ' + (p.name || '');
    return /waypoint/i.test(c) ? 'waypoint' : /stash|bank/i.test(c) ? 'stash' : PORTALS[p.cls] ? 'portal'
      : /chest|casket|barrel|urn/i.test(c) && p.selectable ? 'chest' : null;
  }
  function placeObj(lv, o) {
    var p = objPreset(o.id); if (!p || !p.sprite) return;
    var w = p.w || 1, h = p.h || 1;
    if (p.collide) for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var cx = o.x - (w >> 1) + x, cy = o.y - (h >> 1) + y;
      if (cx >= 0 && cy >= 0 && cx < lv.w && cy < lv.h && !lv.col[cy * lv.w + cx]) lv.col[cy * lv.w + cx] = 1;
    }
    var modes = p.modes || ['NU'], kind = objKind(p);
    var mode = kind === 'chest' ? 'NU' : modes.indexOf('ON') >= 0 && p.lit ? 'ON' : modes.indexOf('NU') >= 0 ? 'NU' : modes[0];
    mk('obj', o.x + 0.5, o.y + 0.5, { otype: kind, portal: kind === 'portal' ? p.cls : null, art: 'obj.' + p.token, mode: mode, ow: w, oh: h, cx: o.x - (w >> 1), cy: o.y - (h >> 1), t0: Math.random() * 4000 });
  }

  /* ---------------------------------------------------------------- quái */
  /* Quái theo hai nguồn như D2: đàn rải theo mật độ của khu (spawns của D2G) và điểm đặt sẵn trong DS1
   * (place_fallen, place_fallenshaman, superunique như Corpsefire...). */
  function spawnMonsters(def, g, seed) {
    if (def.town) return;
    var rng = D2R.rng(seed ^ 0x5bd1);
    var types = areaMons(def);
    var pid = 0;
    function pack(id, x, y, n, rank, name) {
      pid++;
      for (var i = 0; i < n; i++) {
        var p = openAround(g, x + 0.5, y + 0.5, i === 0 ? 0 : 4.4, rng);
        makeMonster(i === 0 || rank !== 'unique' ? id : (D2DATA.superuniques[id] ? D2DATA.superuniques[id].cls : id), p[0], p[1], i === 0 ? rank : rank === 'unique' ? 'minion' : rank, pid, rng, i === 0 ? name : null);
      }
    }
    g.spawns.forEach(function (sp) {
      if (!types.length) return;
      var id = DA.monster(sp.kind) ? sp.kind : types[Math.floor(rng() * types.length)];
      var rank = sp.kind === 'special' ? 'champion' : 'normal';
      pack(id, sp.x, sp.y, Math.max(1, sp.n || 1), rank, null);
    });
    var SU = D2DATA.superuniques, areaSu = def.superuniques || [], placed = {}, anchor = null;
    // preset DS1 gọi superunique bằng tên hiện ("Radament") hoặc bằng mã quái gốc ("summoner" = the_summoner)
    function suOf(name) { return Object.keys(SU).filter(function (k) { return SU[k].name === name || (areaSu.indexOf(k) >= 0 && SU[k].cls === name); })[0]; }
    function suPack(su, x, y) { var mn = SU[su].minions || [4, 4]; pack(su, x, y, 1 + ri(mn[0], mn[1]), 'unique', null); placed[su] = placed[SU[su].cls] = 1; }
    function spawnBoss(id, x, y) { var b = makeMonster(id, x + 0.5, y + 0.5, 'normal', ++pid, rng, null); b.rank = 'unique'; b.boss = true; placed[id] = 1; }
    g.npcs.forEach(function (n) {
      var name = presetName(n.id); if (!name) return;
      if (name === 'baalthrone') { anchor = n; return; }   // Baal ngồi ngai không đánh được; năm đợt quân đứng quanh ngai
      var su = suOf(name);
      if (su) { suPack(su, n.x, n.y); return; }
      var boss = name === 'place_bloodraven' ? 'bloodraven' : name;
      if ((def.bosses || []).indexOf(boss) >= 0 && DA.monster(boss)) { spawnBoss(boss, n.x, n.y); return; }
      var m = /^place_(fallen|fallenshaman)$/.exec(name);
      if (m && DA.monster(m[1] + '1')) { pack(m[1] + '1', n.x, n.y, m[1] === 'fallen' ? ri(3, 6) : 1, 'normal', null); return; }
      var any = types.length ? types[Math.floor(rng() * types.length)] : null;
      if (!any) return;
      if (name === 'place_champion') pack(any, n.x, n.y, ri(2, 4), 'champion', null);
      else if (name === 'place_unique_pack') pack(any, n.x, n.y, 1 + ri(2, 4), 'unique', null);
      else if ((m = /^place_group(\d+)$/.exec(name)) && rng() * 100 < +m[1]) pack(any, n.x, n.y, ri(2, 5), 'normal', null);
    });
    /* D2 đặt bằng script những trùm không có trong DS1: Nihlathak, ba trùm giữ ấn ở Chaos Sanctuary, năm đợt
     * quân của Baal. Ở đây chúng đứng ở các điểm sinh quái xa lối vào nhất; Diablo chỉ ra khi ba trùm ấn đã chết. */
    var h0 = g.hero || [0, 0], far = g.spawns.slice().sort(function (a, b) {
      return Math.hypot(b.x - h0[0], b.y - h0[1]) - Math.hypot(a.x - h0[0], a.y - h0[1]);
    }), k = 0;
    var scripted = areaSu.filter(function (su) { return SU[su] && !placed[su]; });
    scripted.forEach(function (su) { var at = anchor || far[k++ % Math.max(1, far.length)]; if (at) suPack(su, at.x, at.y); });
    (def.bosses || []).forEach(function (b) {
      if (placed[b] || !DA.monster(b) || !far.length) return;
      if (areaSu.some(function (su) { return SU[su]; })) {
        var c = g.spawns.slice().sort(function (p1, p2) { return Math.hypot(p1.x - g.w / 2, p1.y - g.h / 2) - Math.hypot(p2.x - g.w / 2, p2.y - g.h / 2); })[0];
        S.pendingBoss = { id: b, after: areaSu.filter(function (su) { return SU[su]; }), x: c.x, y: c.y };
      } else spawnBoss(b, far[0].x, far[0].y);
    });
  }
  function checkPendingBoss() {
    var pb = S.pendingBoss; if (!pb) return;
    var alive = S.ents.some(function (e) { return e.kind === 'mon' && pb.after.indexOf(e.monId) >= 0 && e.st !== 'die' && e.st !== 'dead'; });
    if (alive) return;
    S.pendingBoss = null;
    var p = openAround(S.grid, pb.x + 0.5, pb.y + 0.5, 3, Math.random);
    var b = makeMonster(pb.id, p[0], p[1], 'normal', -2, Math.random, null); b.rank = 'unique'; b.boss = true;
    UI.msg((b.inst.name || pb.id) + ' đã xuất hiện!', '#ff7a5a'); E.sfx(['monster_diablo_taunt1', 'cursor_questdone'], 0.7);
  }
  function openAround(g, x, y, r, rng) {
    for (var t = 0; t < 20; t++) {
      var a = rng() * 6.283, d = rng() * r, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (canStand(px, py, 0.3)) return [px, py];
    }
    return [x, y];
  }
  function makeMonster(id, x, y, rank, pack, rng, nameOverride) {
    var lvl = areaLvl(S.def);
    var inst = safe(function () { return D2R.rollMonster(id, lvl, rng || Math.random, rank, { difficulty: dk() }); }, null) || { id: id, name: id, lvl: lvl, hp: 10 + lvl * 6, xp: 10 * lvl, dmgMin: 1, dmgMax: 4, ar: 20, def: 5 };
    if (nameOverride) inst.name = nameOverride.charAt(0).toUpperCase() + nameOverride.slice(1);
    var m = DA.monster(id) || {};
    inst.name = inst.name || m.name || id;
    var hp = inst.hp != null ? inst.hp : inst.maxHp || 10;
    var spd = inst.run || inst.walk || m.runVel || m.walkVel;
    var e = mk('mon', x, y, {
      monId: id, inst: inst, rank: rank, pack: pack, art: monArt(id), ai: DA.aiKind(id, m), hp: hp, maxHp: hp,
      speed: spd ? clamp(spd, 1, 12) : 4, aggro: false, cd: rnd(0.2, 1.2), act: null, snd: m.snd || {},
      dir: rnd(0, 8), flee: 0, born: S.time, deadAt: 0, rez: 0, wander: 0, stuck: 0, hitFlash: 0
    });
    return e;
  }

  /* ---------------------------------------------------------------- hero look */
  /* Hình nhân vật theo đồ đang mặc, đúng cách D2 chọn DCC: thân/tay/chân/vai theo cột Torso, Legs, rArm, lArm,
   * rSPad, lSPad của armor.txt (0 nhẹ, 1 vừa, 2 nặng), mũ/vũ khí/khiên theo alternategfx, lớp vũ khí theo wclass.
   * Cung, nỏ cầm tay trái (LH) như D2. Thiếu DCC cho token nào thì engine lùi về LIT. */
  var ARMOR_TOK = ['LIT', 'MED', 'HVY'];
  function heroLook() {
    var c = S.char, eq = c.equip, cls = D2DATA.classes[c.cls].code;
    var body = DA.base(eq.body), helm = DA.base(eq.head), wp = DA.base(eq.rhand), sh = DA.base(eq.lhand);
    var tok = {}, wclass = 'HTH';
    if (body) {
      tok.TR = ARMOR_TOK[body.torso || 0]; tok.LG = ARMOR_TOK[body.legs || 0];
      tok.RA = ARMOR_TOK[body.rarm || 0]; tok.LA = ARMOR_TOK[body.larm || 0];
      tok.S1 = ARMOR_TOK[body.rspad || 0]; tok.S2 = ARMOR_TOK[body.lspad || 0];
    }
    if (helm && helm.alternategfx) tok.HD = helm.alternategfx.toUpperCase();
    if (wp) {
      wclass = (wp.wclass || 'hth').toUpperCase();
      tok[/bow/.test(wp.wclass || '') ? 'LH' : 'RH'] = (wp.alternategfx || wp.code).toUpperCase();
    }
    if (sh && sh.alternategfx) tok.SH = sh.alternategfx.toUpperCase();
    var look = { cls: cls, wclass: wclass, tok: tok };
    if (!E.heroCof(look, 'NU')) look.wclass = 'HTH';   // lớp vũ khí này chưa đóng gói cho lớp nhân vật: cầm tay không
    return look;
  }
  // Mode D2 của nhân vật theo trạng thái: trong thị trấn đứng/đi bằng TN/TW như game gốc
  function heroMode(h) {
    var town = S.def && S.def.town;
    switch (h.st) {
      case 'attack': case 'cast': return (h.act && h.act.mode) || 'A1';
      case 'walk': return town ? 'TW' : 'WL';
      case 'run': return 'RN';
      case 'hit': return 'GH';
      case 'die': case 'dead': return 'DT';
      default: return town ? 'TN' : 'NU';
    }
  }
  function heroAnimDur(mode) { var cof = E.heroCof(heroLook(), mode); return cof ? E.animDur(cof) : 0; }

  /* ================================================================ chiến đấu */
  function elemOf(e) { e = String(e || 'phys').toLowerCase(); return /fire/.test(e) ? 'fire' : /cold|ice|frost/.test(e) ? 'cold' : /light|elec/.test(e) ? 'light' : /pois/.test(e) ? 'poison' : 'phys'; }
  function floatText(x, y, text, color, big) { S.floaters.push({ x: x, y: y, text: text, color: color || '#fff', t: 0, big: big }); }
  var ELCOL = { fire: '#ff8a3c', cold: '#7fd0ff', light: '#ffee66', poison: '#7fdf5f', phys: '#fff' };

  function monSfx(m, what) { E.sfx([m.snd[what === 'hit' ? 'HitSound' : 'DeathSound']], 0.5); }
  function damageMon(m, amount, elem, fromHero) {
    if (m.st === 'die' || m.st === 'dead') return;
    if (window.D2S && D2S.onMonDamage) { amount = D2S.onMonDamage(Game.api, m, amount, elem, fromHero); if (amount <= 0) return; }
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
    var dur = Math.max(200, E.animDur(E.animOf(m.art, 'GH')) || 320);
    if (m.rank === 'normal' || Math.random() < 0.4) { m.act = null; restart(m, 'hit', dur); }
  }
  function aggroMon(m) {
    m.aggro = true;
    S.ents.forEach(function (o) { if (o.kind === 'mon' && o.pack === m.pack && !o.aggro && o.st !== 'dead') { o.aggro = true; } });
  }
  function killMon(m) {
    m.hp = 0; m.act = null;
    restart(m, 'die', E.animDur(E.animOf(m.art, 'DT')) || 600);
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
    var bq = m.boss && questOfKill(m.monId), kind = bq && S.char.quests[bq] !== 'done' ? 'quest' : m.rank === 'champion' ? 'champion' : m.rank === 'unique' && !m.boss ? 'unique' : 'normal';
    var items = safe(function () { return D2R.rollDrop(m.monId, m.inst.lvl || 1, Math.random, { difficulty: dk(), kind: kind }); }, []) || [];
    if (!items.some(DA.isGold) && Math.random() < 0.6) items.push({ gold: Math.round((m.inst.lvl || 1) * rnd(4, 12) * (m.rank === 'normal' ? 1 : 3)), base: 'gold', q: 'normal', w: 1, h: 1 });
    items.forEach(function (it, i) { dropItem(it, m.x + rnd(-1.4, 1.4), m.y + rnd(-1.4, 1.4)); });
    questKillDrops(m);
    questEvent({ kind: 'kill', id: m.monId });
    checkPendingBoss();
    if (S.denLeft != null && !m.ally) {   // khu của quest "dọn sạch" (Den of Evil): đếm quái còn lại
      S.denLeft = Math.max(0, S.denLeft - 1);
      if (S.denLeft === 0) questEvent({ kind: 'cleared', area: S.areaId });
      UI.dirty = true;
    }
    // đồng đội Fallen chạy trốn
    S.ents.forEach(function (o) { if (o.kind === 'mon' && o !== m && o.ai === 'fallen' && o.st !== 'dead' && o.st !== 'die' && dist(o, m) < 14 && Math.random() < 0.5) { o.flee = 2.5; o.aggro = true; } });
    if (S.target === m) S.target = null;
  }
  function onLevelUp() {
    var c = S.char; recalc(); c.hp = S.d.maxHp; c.mp = S.d.maxMp;
    E.sfx(['level_up'], 0.6); UI.dirty = true; save();
  }

  function damageHero(amount, srcPos) {
    var c = S.char, h = S.hero;
    if (h.st === 'die' || h.st === 'dead') return;
    if (srcPos && srcPos.dmg && elemOf(srcPos.dmg.elem) === 'poison') h.poisonUntil = S.time + 2;   // HUD đổi cầu máu sang cầu độc
    if (window.D2S && D2S.onHeroDamage) { amount = D2S.onHeroDamage(Game.api, amount, srcPos); if (amount <= 0) return; }
    amount = Math.max(1, Math.round(amount));
    c.hp -= amount; floatText(h.x, h.y, String(amount), '#ff6a6a');
    E.sfx([DA.classInfo(c.cls).gender + '_hit'], 0.6);
    if (c.hp <= 0) { c.hp = 0; killHero(); return; }
    if (amount >= S.d.maxHp * 0.05) {
      h.act = null;
      restart(h, 'hit', Math.max(200, heroAnimDur('GH') || 300));
    }
  }
  function killHero() {
    var h = S.hero, c = S.char;
    h.act = null; h.goal = null; h.path = null; restart(h, 'die', 800);
    E.sfx([DA.classInfo(c.cls).gender + '_die'], 0.7);
    var pen = safe(function () { return D2R.deathPenalty(c); }, null) || { lost: 0, corpseGold: 0 };
    if (!pen.corpseGold && pen.lost === 0 && c.gold) { pen.corpseGold = Math.floor(c.gold * 0.5); c.gold -= pen.corpseGold; }
    S.corpse = { diff: dk(), area: S.areaId, game: S.gameSeed, x: h.x, y: h.y, gold: pen.corpseGold, lost: pen.lost, xpLost: pen.xpLost || 0 };
    setTimeout(function () { if (S.hero === h && h.st === 'dead') UI.showDead(true, respawn); }, 0);
  }
  function townOf(act) {
    var t = Object.keys(D2DATA.areas).filter(function (k) { var a = D2DATA.areas[k]; return a.town && a.act === act; })[0];
    return t || 'rogue_encampment';
  }
  Game.townOf = townOf;
  function respawn() {
    var c = S.char; S.target = null;
    enterArea(townOf(curAct()), null).then(function () {
      recalc(); c.hp = Math.max(1, Math.round(S.d.maxHp * 0.5)); c.mp = 0; S.regen = [];
      UI.msg('Bạn hồi sinh ở ' + S.def.name + '.' + (S.corpse && S.corpse.xpLost ? ' Mất ' + S.corpse.xpLost + ' XP.' : '') +
        (S.corpse && S.corpse.gold ? ' Xác của bạn giữ ' + S.corpse.gold + ' vàng.' : ''), '#ffb0b0'); save();
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
    if (!skillId || skillId === 'attack') return weaponKind() === 'bow' ? 22 : 3.4;
    if (!fx) return 3.4;
    if (fx.kind === 'melee') return 3.8;
    return 24;
  }
  // Mode của đòn: cột anim của skills.txt (SC, A1, TH...); đánh thường xen A1/A2 như D2. Mode chưa đóng gói thì lùi về A1/SC.
  function heroActMode(kind, fx) {
    var want = fx && fx.anim ? fx.anim : kind === 'cast' ? 'SC' : (Math.random() < 0.5 ? 'A1' : 'A2');
    if (/^(SQ|S[1-4]|TH|KK)$/.test(want)) want = kind === 'cast' ? 'SC' : 'A1';
    var look = heroLook();
    if (!E.heroCof(look, want)) want = kind === 'cast' && E.heroCof(look, 'SC') ? 'SC' : 'A1';
    return want;
  }

  // bắt đầu đòn đánh/niệm chú của hero. Trả true nếu bắt đầu được.
  function beginAct(skillId, tx, ty, target) {
    var h = S.hero, c = S.char, fx = fxOf(skillId);
    if (skillId && skillId !== 'attack' && !fx) { UI.msg('Kỹ năng này chưa dùng được.'); return false; }
    var mod = window.D2S && fx && D2S.handles(fx);
    if (fx && NOUSE[fx.kind] && !mod) { UI.msg(NOUSE[fx.kind]); return false; }
    if (mod && D2S.instant && D2S.instant(fx)) return D2S.instantCast(Game.api, skillId, fx, tx, ty, target);
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
    h.act.mode = heroActMode(kind, fx);
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
    if (fx && window.D2S && D2S.handles(fx)) { D2S.apply(Game.api, h.act); return; }
    if (!fx) {   // đòn thường
      if (weaponKind() === 'bow') { spawnMissile(h, a.tx, a.ty, { dmg: { min: d.dmgMin, max: d.dmgMax, elem: 'phys' }, art: 'mis.arrow', speed: 24, pierce: 0, owner: 'hero', ar: d.ar, life: 1.1 }); return; }
      meleeHit(a, d.dmgMin, d.dmgMax, 'phys', d.ar);
      return;
    }
    var ar = d.ar * (100 + (fx.toHitPct || 0)) / 100, el = elemOf(fx.dmg && fx.dmg.elem);
    if (fx.kind === 'melee') { var wd = weaponSkillDmg(fx); meleeHit(a, wd.min, wd.max, wd.elem, ar); return; }
    if (fx.kind === 'nova') {
      var rad = clamp(fx.radius || 10, 5, 16);
      S.ents.forEach(function (m) { if (m.kind === 'mon' && m.st !== 'die' && m.st !== 'dead' && !(window.D2S && D2S.isFriend(m)) && dist(m, h) <= rad) damageMon(m, rollDmg(fx.dmg || { min: 5, max: 8 }), fx.dmg && fx.dmg.elem, true); });
      mk('fx', h.x, h.y, { art: pickArt(fx), t: 0, life: 0.5, ring: rad, color: ELCOL[el] });
      return;
    }
    var isChan = fx.kind === 'channel';
    var dm = fx.weaponPct && fx.requires && fx.requires.weapon.length ? weaponSkillDmg(fx) : fx.dmg || { min: 3, max: 6, elem: 'phys' };
    if (isChan) dm = { min: dm.min / 4, max: dm.max / 4, elem: dm.elem };
    var n = Math.max(1, Math.round(fx.count || 1)), base = Math.atan2(a.ty - h.y, a.tx - h.x);
    var mv = fx.missile || {}, speed = clamp(mv.vel || fx.speed || 16, 14, 26), life = clamp((mv.range || 40) / 25 * 0.6, 0.8, 1.6);
    for (var i = 0; i < n; i++) {
      var ang = base + (n > 1 ? (i - (n - 1) / 2) * 0.22 : 0);
      spawnMissile(h, h.x + Math.cos(ang) * 20, h.y + Math.sin(ang) * 20, { dmg: dm, art: pickArt(fx), boom: boomArt(fx.missile && fx.missile.id), speed: isChan ? 18 : speed, pierce: (fx.pierce || isChan) ? 99 : 0, owner: 'hero', ar: fx.weaponPct && fx.requires.weapon.length ? ar : 9999, life: isChan ? 0.45 : life });
    }
  }
  // Hình đạn: tên missiles.txt của kỹ năng (srvmissile), vụ nổ theo ExplosionMissile
  function pickArt(fx) {
    var id = fx.missile && fx.missile.id;
    return id && E.hasSheet('mis.' + id) ? 'mis.' + id : 'mis.arrow';
  }
  function boomArt(missId) {
    var M = missId && D2DATA.missiles[missId], ex = M && M.ExplosionMissile;
    return ex && E.hasSheet('mis.' + ex) ? 'mis.' + ex : null;
  }
  function meleeHit(a, mn, mx, elem, ar) {
    var h = S.hero, t = a.target;
    if (!t || t.st === 'die' || t.st === 'dead') {  // tìm quái đứng trước mặt trong tầm
      var best = null, bd = 4.2;
      S.ents.forEach(function (m) { if (m.kind === 'mon' && m.st !== 'die' && m.st !== 'dead' && !(window.D2S && D2S.isFriend(m))) { var dd = dist(m, { x: h.x + Math.cos(angOf(h.dir)) * 1.8, y: h.y + Math.sin(angOf(h.dir)) * 1.8 }); if (dd < bd) { bd = dd; best = m; } } });
      t = best;
    }
    if (!t || dist(t, h) > 4.8) return;
    var p = safe(function () { return D2R.hitChance(ar, S.char.lvl, t.inst.def || 0, t.inst.lvl || 1); }, 0.75);
    if (Math.random() < p) { damageMon(t, rnd(mn, mx + 0.999), elem, true); }
    else floatText(t.x, t.y, 'miss', '#aaa');
  }
  function angOf(dir) {   // hướng 0..7 -> góc trong toạ độ ô
    var v = [[-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1]][dir]; return Math.atan2(v[1], v[0]);
  }

  /* ---------------------------------------------------------------- đạn */
  function spawnMissile(owner, tx, ty, o) {
    var dx = tx - owner.x, dy = ty - owner.y, d = Math.hypot(dx, dy) || 1, sp = o.speed || 18;
    var m = mk('missile', owner.x + dx / d * 1, owner.y + dy / d * 1, {
      vx: dx / d * sp, vy: dy / d * sp, dir: E.dirFromTiles(dx, dy), art: o.art, boom: o.boom || null, dmg: o.dmg, owner: o.owner, pierce: o.pierce || 0,
      life: o.life || 1.2, ar: o.ar, hit: {}, t: 0, rad: o.radius ? clamp(o.radius * 0.2, 1.1, 2.8) : 1.1, st: 'run'
    });
    m.y -= 0; return m;
  }
  function updateMissile(m, dt) {
    if (m.st === 'die') { m.t += dt; if (m.t > (m.boomDur || 0.3)) m.st = 'dead'; return; }
    m.t += dt; m.life -= dt;
    var steps = Math.ceil(Math.hypot(m.vx, m.vy) * dt / 0.6), sx = m.vx * dt / steps, sy = m.vy * dt / steps;
    for (var i = 0; i < steps; i++) {
      m.x += sx; m.y += sy;
      var mc = S.grid.col[Math.floor(m.y) * S.grid.w + Math.floor(m.x)];
      if (mc === 1 || mc == null) { explode(m); return; }
      if (m.owner === 'hero') {
        for (var k = 0; k < S.ents.length; k++) {
          var o = S.ents[k];
          if (o.kind !== 'mon' || o.st === 'die' || o.st === 'dead' || m.hit[o.id] || (window.D2S && D2S.isFriend(o))) continue;
          if (dist(o, m) < m.rad + 0.3) {
            m.hit[o.id] = 1;
            var ok = m.ar >= 9000 || Math.random() < safe(function () { return D2R.hitChance(m.ar, S.char.lvl, o.inst.def || 0, o.inst.lvl || 1); }, 0.8);
            if (ok) damageMon(o, rollDmg(m.dmg), m.dmg.elem, true); else floatText(o.x, o.y, 'miss', '#aaa');
            if (m.pierce > 0) m.pierce--; else { explode(m); return; }
          }
        }
      } else {
        var h = S.hero;
        if (h.st !== 'die' && h.st !== 'dead' && dist(h, m) < 1.1) {
          var okh = Math.random() < safe(function () { return D2R.hitChance(m.ar || 30, 1, S.d.def, S.char.lvl); }, 0.7);
          if (okh) damageHero(rollDmg(m.dmg), m); else floatText(h.x, h.y, 'miss', '#aaa');
          explode(m); return;
        }
      }
    }
    if (m.life <= 0) explode(m);
  }
  function explode(m) {
    m.st = 'die'; m.t = 0; m.vx = m.vy = 0;
    var an = m.boom && E.animOf(m.boom, 'NU') || null;
    m.boomDur = an ? E.animDur(an) / 1000 : 0.3;
  }

  /* ---------------------------------------------------------------- đồ rơi */
  // Hình đồ rơi: hoạt ảnh flippyfile của D2 (món đồ lật trên không rồi nằm xuống)
  function lootArt(it) {
    var b = DA.base(it), f = DA.isGold(it) ? 'flpgld' : b && b.flippyfile;
    return f && E.hasSheet('flp.' + f) ? 'flp.' + f : null;
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
  // số ô đai theo cột belt của armor.txt -> hàng của belts.txt (belt, sash, default, girdle, light, heavy, uber)
  var BELT_BOX = [12, 8, 4, 16, 8, 12, 16];
  function beltCap(c) { var b = c.equip && c.equip.belt, bs = b && DA.base(b); return b ? BELT_BOX[(bs && +bs.belt) || 0] || 4 : 4; }
  Game.beltCap = function () { return beltCap(S.char); };
  function beltFree(c) { for (var i = 0, n = beltCap(c); i < n; i++) if (!c.belt[i]) return i; return -1; }
  function pickup(drop) {
    var c = S.char;
    if (drop.item && drop.item.qitem) { giveQuestItem(drop.item.qitem); removeEnt(drop); return true; }
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

  /* ================================================================ NPC, nhiệm vụ, waypoint, lính đánh thuê */
  /* Nhiệm vụ theo D2DATA.quests (27 quest của D2): chưa nhận -> active -> cleared -> done. Đích của quest:
   * kill (quái/superunique), clear_area (dọn sạch khu), còn reach/rescue/collect/destroy được rút gọn thành
   * "tới được khu của quest" vì bản này chưa có vật phẩm nhiệm vụ. Thưởng theo cột reward. */
  function questName(q) { return q.name || q.id; }
  function questGoalHit(q, ev) {
    var g = q.goal || {};
    if (ev.kind === 'kill' && g.type === 'destroy') { var dk2 = D2DATA.questDestroy[g.object]; return !!(dk2 && dk2.kill === ev.id); }
    if (ev.kind === 'kill') {
      var ids = [g.monster, g.superunique].concat(g.superuniques || []).filter(Boolean);
      if (ids.indexOf(ev.id) < 0) return false;
      if (!g.superuniques) return true;
      var done = S.char.quests[q.id + ':k'] = S.char.quests[q.id + ':k'] || {};
      done[ev.id] = 1;
      return g.superuniques.every(function (k) { return done[k]; });
    }
    if (ev.kind === 'item') {
      var held = questItemsHeld();
      if (g.type === 'collect') return (g.items || []).indexOf(ev.name) >= 0 && g.items.every(function (n) { return held[n]; });
      var dd = g.type === 'destroy' && D2DATA.questDestroy[g.object];
      return !!(dd && dd.item === ev.name);
    }
    if (ev.kind === 'enter') return (g.type === 'reach' || g.type === 'rescue') && (g.area || q.area) === ev.area;
    if (ev.kind === 'cleared') return g.type === 'clear_area' && g.area === ev.area;
    return false;
  }
  /* Vật phẩm nhiệm vụ (D2DATA.questItems): nằm trong rương xa lối vào nhất của khu, hoặc rơi từ quái được chỉ
   * định. Chưa có hình trong túi đồ; game giữ cờ theo độ khó trong quests[':items']. */
  function questItemsHeld(write) { var q = S.char.quests; return write ? (q[':items'] = q[':items'] || {}) : q[':items'] || {}; }
  function giveQuestItem(name) {
    var held = questItemsHeld(true); if (held[name]) return;
    held[name] = 1;
    UI.msg('Vật phẩm nhiệm vụ: ' + name, '#ffe27a'); E.sfx(['cursor_questdone'], 0.5);
    var qi = D2DATA.questItems[name];
    ((qi && qi.gives) || []).forEach(giveQuestItem);
    questEvent({ kind: 'item', name: name });
    save();
  }
  function questOfItem(name) {
    var Q = D2DATA.quests;
    return Object.keys(Q).filter(function (q) { return ((Q[q].goal || {}).items || []).indexOf(name) >= 0; })[0] || null;
  }
  function questOfKill(id) {
    var Q = D2DATA.quests;
    return Object.keys(Q).filter(function (q) { var g = Q[q].goal || {}; return g.monster === id || g.superunique === id; })[0] || null;
  }
  function placeQuestItems(id, g) {
    var held = questItemsHeld(), QI = D2DATA.questItems || {}, h = S.hero;
    Object.keys(QI).forEach(function (name) {
      var q = QI[name];
      if (held[name] || q.area !== id || q.from !== 'chest' || S.char.quests[questOfItem(name)] === 'done') return;
      var far = null, fd = -1;
      S.ents.forEach(function (e) { if (e.kind === 'obj' && e.otype === 'chest' && !e.qitem && dist(e, h) > fd) { far = e; fd = dist(e, h); } });
      if (far) { far.qitem = name; return; }
      g.spawns.forEach(function (sp) { var d = Math.hypot(sp.x - h.x, sp.y - h.y); if (d > fd) { far = sp; fd = d; } });
      if (far) dropItem({ qitem: name, base: 'qitem', name: name, q: 'quest', w: 1, h: 1 }, far.x + 0.5, far.y + 0.5);
    });
  }
  function questKillDrops(m) {
    var held = questItemsHeld(), QI = D2DATA.questItems || {};
    Object.keys(QI).forEach(function (name) {
      var q = QI[name], qid = questOfItem(name), st = S.char.quests[qid];
      if (held[name] || st === 'done' || st === 'cleared') return;
      if (S.ents.some(function (e) { return e.kind === 'drop' && !e.removed && e.item && e.item.qitem === name; })) return;
      var hit = (q.mons || []).indexOf(m.monId) >= 0 || (q.anyUnique && st === 'active' && m.rank === 'unique' && !m.ally && curAct() === q.act);
      if (hit) dropItem({ qitem: name, base: 'qitem', name: name, q: 'quest', w: 1, h: 1 }, m.x, m.y);
    });
  }
  /* Rương: bấm thì chạy OP một lần rồi đứng ở khung cuối. TC rương của D2 là một thang trong nhóm 6 của
   * TreasureClassEx (Act 1 Chest A level 0 ... Act 5 (H) Chest C level 85); D2R.rollDrop nâng TC theo cấp khu. */
  function openChest(o) {
    if (o.opened) return;
    o.opened = true; o.otype = null;   // rương đã mở không còn bấm được, như D2
    if (E.animOf(o.art, 'OP')) { o.mode = 'OP'; o.once = true; o.t0 = -S.time * 1000; }
    E.sfx(['object_chest_large', 'object_chest_small'], 0.6);
    var items = safe(function () { return D2R.rollDrop('chest', areaLvl(S.def), Math.random, { tc: 'Act 1 Chest A', difficulty: dk() }); }, []) || [];
    items.forEach(function (it) { dropItem(it, o.x + rnd(-1.2, 1.2), o.y + rnd(0.8, 2)); });
    if (o.qitem) giveQuestItem(o.qitem);
  }
  Game.openChest = openChest;
  function questEvent(ev) {
    var c = S.char, Q = D2DATA.quests;
    Object.keys(Q).forEach(function (id) {
      var st = c.quests[id];
      if (st === 'cleared' || st === 'done') return;
      if (!questGoalHit(Q[id], ev)) return;
      c.quests[id] = 'cleared';
      var who = Q[id].turnIn && D2DATA.npcs[Q[id].turnIn];
      UI.msg(questName(Q[id]) + ': xong.' + (who ? ' Hãy báo cho ' + who.name + '.' : ''), '#ffe27a');
      E.sfx(['cursor_questdone', 'cursor_level_up'], 0.6);
      if (!Q[id].turnIn) giveReward(id);
      save(); UI.dirty = true;
    });
  }
  Game.questEvent = questEvent;
  function giveReward(id) {
    var c = S.char, q = D2DATA.quests[id], rw = q.reward || {};
    D2R.completeQuest(c, id);
    c.bonus = c.bonus || {};
    var got = [];
    if (rw.skillPts) got.push('+' + rw.skillPts + ' điểm kỹ năng');
    if (rw.statPts) got.push('+' + rw.statPts + ' điểm chỉ số');
    if (rw.resistPct) { c.bonus.resAll = (c.bonus.resAll || 0) + rw.resistPct; got.push('+' + rw.resistPct + '% kháng mọi hệ'); }
    if (rw.lifeBonus) { c.bonus.life = (c.bonus.life || 0) + rw.lifeBonus; got.push('+' + rw.lifeBonus + ' máu'); }
    if (rw.actAccess) { c.actAccess = c.actAccess || {}; c.actAccess[rw.actAccess] = true; got.push('mở đường đi tiếp'); }
    if (rw.mercenary) { c.mercFree = true; got.push('được thuê lính miễn phí'); }
    if (rw.unlockDifficulty && DIFFS.indexOf(c.diffMax) <= DIFFS.indexOf(c.diff) && c.diff !== 'h') {
      c.diffMax = DIFFS[DIFFS.indexOf(c.diff) + 1]; got.push('mở độ khó ' + DIFF_NAME[c.diffMax]);
    }
    UI.msg('Hoàn thành ' + questName(q) + (got.length ? ': ' + got.join(', ') : ''), '#ffe27a');
    recalc(); save(); UI.dirty = true;
  }
  // Waypoint của mọi act: thị trấn luôn có, còn lại phải chạm vào waypoint trong khu đó trước
  Game.stashCols = 6; Game.stashRows = 8;
  Game.visitedWaypoints = function () {
    var c = S.char, w = c.waypoints || {}, A = D2DATA.areas, maxAct = 1 + Object.keys(c.actAccess || {}).filter(function (k) { return /^\d$/.test(k); }).length;
    return Object.keys(A).filter(function (k) { var a = A[k]; return a.waypoint && !a.unused && a.act <= maxAct && (a.town || w[k]); })
      .sort(function (a, b) { return (A[a].act - A[b].act) || (A[a].d2id - A[b].d2id); })
      .map(function (k) { return { id: k, name: A[k].name, act: A[k].act }; });
  };
  function useObj(o) {
    var c = S.char;
    if (o.otype === 'stash') { E.sfx(['cursor_button_click'], 0.4); UI.openStash(); }
    else if (o.otype === 'chest') openChest(o);
    else if (o.otype === 'portal') {
      var d = portalOf(o);
      if (!d) return;
      if (!d.open) { UI.msg('Cổng còn đóng. Cần xong ' + questName(D2DATA.quests[d.needs]) + '.', '#ff9a8a'); return; }
      if (d.act) { c.actAccess = c.actAccess || {}; c.actAccess[d.act] = true; }
      E.sfx(['object_portal_enter', 'cursor_button_click'], 0.6);
      Game.travelWaypoint(d.to);
    }
    else if (o.otype === 'waypoint') {
      c.waypoints = c.waypoints || {};
      if (S.areaId && !c.waypoints[S.areaId]) { c.waypoints[S.areaId] = true; UI.msg('Waypoint được kích hoạt.', '#9ec8ff'); save(); }
      E.sfx(['object_waypoint_open', 'cursor_button_click'], 0.5); UI.openWaypoints();
    }
  }
  Game.travelWaypoint = function (id) {
    if (id === S.areaId) { UI.msg('Bạn đang ở đây.'); return; }
    if (!DA.playable(id)) { UI.msg('Nơi này chưa mở.', '#ff9a8a'); return; }
    UI.closeWaypoints(); entering = true;
    enterArea(id, null).then(function () { entering = false; save(); }, function (err) { entering = false; UI.showLoad(false); UI.msg('Lỗi vào khu vực: ' + err); });
  };

  /* Lính đánh thuê: hireling.txt theo act, độ khó Normal, cấp gần cấp nhân vật. Lính là đồng minh (ally),
   * AI do js/skills.js chạy; game lưu loại + cấp để gọi lại khi vào khu mới. */
  function hireOffers(act) {
    var lvl = S.char.lvl;
    var rows = (D2DATA.hirelings || []).filter(function (h) { return h.act === act && h.diff === dk(); });
    var best = {};
    rows.forEach(function (h) {
      var k = h.name + '|' + h.sub;
      if (h.level <= Math.max(lvl, rows.reduce(function (m, r) { return Math.min(m, r.level); }, 99)) && (!best[k] || h.level > best[k].level)) best[k] = h;
    });
    return Object.keys(best).map(function (k) { return best[k]; });
  }
  function hirePrice(h) { return S.char.mercFree ? 0 : Math.round((h.gold || 100) + (h.expPerLvl || 0) * 0 + (h.level || 1) * 50); }
  function spawnMerc() {
    var m = S.char.merc; if (!m || m.dead) return;
    var row = (D2DATA.hirelings || []).filter(function (h) { return h.act === m.act && h.name === m.name && h.sub === m.sub; })[0];
    if (!row) return;
    var p = openAround(S.grid, S.hero.x, S.hero.y, 3, Math.random);
    var e = makeMonster(row.monster, p[0], p[1], 'normal', -1, Math.random, row.name);
    e.ally = true; e.merc = true; e.aggro = false; e.hireRow = row;
    var hp = Math.round((row.hp || 50) + (row.hpPerLvl || 0) * Math.max(0, (m.lvl || row.level) - row.level));
    e.hp = e.maxHp = m.hp && m.hp > 0 ? Math.min(m.hp, hp) : hp;
    S.merc = e;
  }
  function hire(npc, h) {
    var c = S.char, price = hirePrice(h);
    if (c.gold < price) { UI.msg('Không đủ vàng.', '#ff9a8a'); return; }
    c.gold -= price; c.mercFree = false;
    if (S.merc) removeEnt(S.merc);
    c.merc = { act: h.act, name: h.name, sub: h.sub, lvl: h.level };
    spawnMerc(); UI.closeDialog(); UI.msg('Đã thuê ' + h.name + '.', '#9ec8ff'); save(); UI.dirty = true;
  }

  function talk(npc) {
    var c = S.char, id = npc.npc, nd = D2DATA.npcs[id] || { name: id, roles: [] }, Q = D2DATA.quests, act = (S.def && S.def.act) || 1;
    var def = { name: nd.name + (nd.title ? ' - ' + nd.title : ''), text: 'Chào lữ khách.', buttons: [] }, said = false;
    Object.keys(Q).forEach(function (qid) {
      var q = Q[qid], st = c.quests[qid];
      if (q.act !== act) return;
      if (q.giver === id && !st) {
        if (!said) { def.text = 'Ta có việc cần nhờ ngươi: ' + questName(q) + '.'; said = true; }
        def.buttons.push({ label: 'Nhận nhiệm vụ: ' + questName(q), fn: function () { c.quests[qid] = 'active'; UI.msg('Nhiệm vụ mới: ' + questName(q), '#ffe27a'); E.sfx(['cursor_questdone'], 0.4); UI.closeDialog(); save(); UI.dirty = true; } });
      } else if (q.turnIn === id && st === 'cleared') {
        def.text = 'Ngươi đã làm được: ' + questName(q) + '. Hãy nhận phần thưởng.'; said = true;
        def.buttons.push({ label: 'Nhận thưởng: ' + questName(q), fn: function () { giveReward(qid); E.sfx(['cursor_questdone'], 0.5); UI.closeDialog(); } });
      } else if ((q.giver === id || q.turnIn === id) && st === 'active' && !said) { def.text = 'Nhiệm vụ ' + questName(q) + ' vẫn đang chờ ngươi.'; said = true; }
    });
    var roles = nd.roles || [];
    if (roles.indexOf('trade') >= 0 || roles.indexOf('gamble') >= 0) def.buttons.push({ label: 'Mua bán', fn: function () { UI.shopName = nd.name; UI.openShop(DA.shopStock(id)); } });
    if (roles.indexOf('heal') >= 0) def.buttons.push({ label: 'Chữa trị', fn: function () { c.hp = S.d.maxHp; c.mp = S.d.maxMp; S.regen = []; UI.msg(nd.name + ' chữa lành cho bạn.', '#9f9'); UI.closeDialog(); } });
    if (roles.indexOf('hire') >= 0 || nd.hires) hireOffers(act).forEach(function (h) {
      def.buttons.push({ label: 'Thuê ' + h.name + ' (' + h.sub + ', cấp ' + h.level + ') - ' + hirePrice(h) + ' vàng', fn: function () { hire(npc, h); } });
    });
    var trv = D2DATA.actTravel && D2DATA.actTravel[act];
    if (trv && trv.npc === id) {
      var ok = c.quests[trv.needs] === 'done' || c.quests[trv.needs] === 'cleared';
      def.buttons.push({ label: 'Đi tới ' + ((D2DATA.areas[trv.to] || {}).name || trv.to), fn: function () {
        if (!ok) { UI.msg('Hãy hoàn thành ' + questName(Q[trv.needs]) + ' trước.', '#ff9a8a'); return; }
        c.actAccess = c.actAccess || {}; c.actAccess[act + 1] = true;
        UI.closeDialog(); Game.travelWaypoint(trv.to);
      } });
    }
    UI.openDialog(npc, def);
  }

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
    // giữ chuột: quá ngưỡng 0,25 s thì lặp lệnh theo con trỏ (mouseBtnActionsThreshold của OpenDiablo2)
    if (!S.uiHold) { if (I.mouse.left) holdTick('left'); else if (I.mouse.right) holdTick('right'); }
    var g = h.goal;
    if (!g) { if (h.st === 'walk' || h.st === 'run') setSt(h, 'idle'); stamRegen(dt, false); return; }
    var tgt = g.target;
    if (g.type === 'attack' || g.type === 'cast') {
      var sk = g.skill, rng = skillRange(sk);
      // quái chết khi còn giữ nút: đứng yên tới lúc nhả, không tự đi theo con trỏ
      if (tgt && (tgt.st === 'die' || tgt.st === 'dead' || tgt.removed)) { if (btnHeld(g.btn)) S.holdLock = g.btn; h.goal = null; return; }
      // bấm một lần = một đòn; đòn sau chỉ ra khi nút vẫn còn giữ, nhả ra thì dừng sau đòn đang đánh
      if (g.acted && !btnHeld(g.btn)) { h.goal = null; return; }
      if (g.acted && !tgt && g.btn !== 'touch') { var wm = E.toWorld(I.mouse.x, I.mouse.y); g.x = wm[0]; g.y = wm[1]; }
      var tx = tgt ? tgt.x : g.x, ty = tgt ? tgt.y : g.y, dd = Math.hypot(tx - h.x, ty - h.y);
      if (g.inPlace || g.type === 'cast' && dd <= rng + 0.01 || dd <= rng) {
        if (beginAct(sk, tx, ty, tgt)) { h.path = null; g.acted = true; }
        else h.goal = null;
        return;
      }
      goTo(h, tx, ty, dt, g);
    } else if (g.type === 'pickup') {
      if (tgt.removed) { h.goal = null; return; }
      if (dist(h, tgt) < 2.6) { pickup(tgt); h.goal = null; setSt(h, 'idle'); }
      else goTo(h, tgt.x, tgt.y, dt, g);
    } else if (g.type === 'talk') {
      if (dist(h, tgt) < 4.2) { h.dir = E.dirFromTiles(tgt.x - h.x, tgt.y - h.y); h.goal = null; setSt(h, 'idle'); talk(tgt); }
      else goTo(h, tgt.x, tgt.y, dt, g);
    } else if (g.type === 'use') {
      if (tgt.removed) { h.goal = null; return; }
      if (dist(h, tgt) < Math.max(tgt.ow, tgt.oh) / 2 + 4.8) { h.dir = E.dirFromTiles(tgt.x - h.x, tgt.y - h.y); h.goal = null; setSt(h, 'idle'); useObj(tgt); }
      else if (!goTo(h, tgt.x, tgt.y, dt, g)) { if (dist(h, tgt) < Math.max(tgt.ow, tgt.oh) / 2 + 6.4) { h.goal = null; useObj(tgt); } else h.goal = null; }
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
    var base = v > 2 && v < 40 ? v : (running ? 9 : 6);
    return clamp(base, 4, 14);
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
    if (g.type === 'move' && near < 0.5) return false;
    if (!h.path || g.repath === undefined || S.time - g.repath > 0.45 && (g.type !== 'move')) {
      var tgtMoved = !g.pt || Math.hypot(g.pt[0] - tx, g.pt[1] - ty) > 1.6;
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
    if (d < 0.35) { h.path.shift(); if (!h.path.length) { h.path = null; if (g.type === 'move') return false; } return true; }
    moveHero(dx / d, dy / d, dt, false);
    if (h.st === 'idle') { h.path = null; g.repath = undefined; return g.type !== 'move'; }
    return true;
  }
  var seenT = 0;
  function markSeen() {
    var g = S.grid, h = S.hero; if (!g || !g.seen) return;
    var r = 18, hx = Math.floor(h.x), hy = Math.floor(h.y);
    for (var y = Math.max(0, hy - r); y <= Math.min(g.h - 1, hy + r); y++) for (var x = Math.max(0, hx - r); x <= Math.min(g.w - 1, hx + r); x++)
      if ((x - hx) * (x - hx) + (y - hy) * (y - hy) <= r * r) g.seen[y * g.w + x] = 1;
  }
  var exitLock = 0, entering = false;
  function checkExits() {
    if (entering || S.time - S.arrive < 1.5) return;
    var h = S.hero, g = S.grid;
    if (S.exitArm && Math.hypot(S.exitArm.x - h.x, S.exitArm.y - h.y) > 1) S.exitArm = null;
    for (var i = 0; i < g.exits.length; i++) {
      var ex = g.exits[i];
      if (S.exitArm && ex === S.exitArm.ex) continue;
      if (Math.hypot(ex.x + 0.5 - h.x, ex.y + 0.5 - h.y) < 2.8) {
        if (!DA.playable(ex.to)) {
          if (S.time - exitLock > 2) { exitLock = S.time; UI.msg('Lối này chưa mở.'); }
          return;
        }
        entering = true; var from = S.areaId; E.sfx(['env_stairs'], 0.4);
        enterArea(ex.to, from).then(function () { entering = false; save(); }, function (err) { entering = false; UI.showLoad(false); UI.msg('Lỗi vào khu vực: ' + err); });
        return;
      }
    }
  }

  /* ---------------------------------------------------------------- AI quái */
  var MON_LOSE_DIST = 90;   // subtile: quái đang đuổi xa hơn thì mất dấu và ngủ lại
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
    if (dd > 52 && !m.aggro) return;   // ngủ: D2 chỉ cập nhật phòng gần người chơi
    if (dd > MON_LOSE_DIST && m.aggro && m.st !== 'attack' && m.st !== 'cast') { m.aggro = false; if (m.st === 'walk' || m.st === 'run') setSt(m, 'idle'); return; }
    if (m.st === 'hit') { if (m.stT >= m.stDur) setSt(m, 'idle'); return; }
    if (m.spawnT > 0) { m.spawnT -= dt * 1000; return; }
    var alive = h.st !== 'die' && h.st !== 'dead';
    if (!m.aggro && alive && dd < 18 && S.time - S.arrive > 0.6) { aggroMon(m); if (!m.said) { m.said = 1; E.sfx([m.snd.Neutral], 0.4); } }
    if (m.st === 'attack' || m.st === 'cast') {
      var a = m.act;
      if (a && !a.done && m.stT >= m.stDur * (a.hitAt || 0.5)) monStrike(m, a);
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
      if (len > 2.7) { monStep(m, vx / len, vy / len, dt, 1); }
      else if (m.cd <= 0) monAttack(m, 'swing', len);
      else { m.dir = E.dirFromTiles(vx, vy); setSt(m, 'idle'); }
    } else if (m.ai === 'ranged') {
      if (len > 17) monStep(m, vx / len, vy / len, dt, 1);
      else if (len < 7) monStep(m, -vx / len, -vy / len, dt, 0.9);
      else if (m.cd <= 0 && los(m.x, m.y, h.x, h.y)) monAttack(m, 'shoot', len);
      else { m.dir = E.dirFromTiles(vx, vy); setSt(m, 'idle'); }
    } else if (m.ai === 'shaman') {
      // hồi sinh Fallen đã gục nếu có
      var corpse = null;
      S.ents.forEach(function (o) { if (!corpse && o.kind === 'mon' && o.st === 'dead' && o.ai === 'fallen' && !o.rez && dist(o, m) < 18) corpse = o; });
      if (corpse && m.cd <= 0) { m.dir = E.dirFromTiles(corpse.x - m.x, corpse.y - m.y); m.act = { kind: 'rez', corpse: corpse, done: false }; corpse.rez = 1; restart(m, 'cast', Math.max(500, E.animDur(E.animOf(m.art, 'S1') || E.animOf(m.art, 'SC')) || 700)); m.act.mode = E.animOf(m.art, 'S1') ? 'S1' : 'SC'; m.cd = 4; return; }
      if (len > 16) monStep(m, vx / len, vy / len, dt, 1);
      else if (len < 8) monStep(m, -vx / len, -vy / len, dt, 0.9);
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
      if (d < 1.4 && d > 0.001) tryMove(m, dx / d * 2.4 * dt, dy / d * 2.4 * dt);
    }
  }
  function monStep(m, vx, vy, dt, mul) {
    var sp = m.speed * mul * dt, ok = false;
    var ang = Math.atan2(vy, vx), offs = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
    if (m.slideSign) offs = [0, 0.6 * m.slideSign, -0.6 * m.slideSign, 1.2 * m.slideSign, -1.2 * m.slideSign];
    for (var i = 0; i < offs.length; i++) {
      var a2 = ang + offs[i], dx = Math.cos(a2) * sp, dy = Math.sin(a2) * sp;
      if (canStand(m.x + dx, m.y + dy, 0.3)) { m.x += dx; m.y += dy; ok = true; if (i > 0) m.slideSign = offs[i] > 0 ? 1 : -1; else m.slideSign = 0; break; }
    }
    m.dir = E.dirFromTiles(vx, vy);
    setSt(m, ok ? 'run' : 'idle');
  }
  // Đòn của quái: A1/A2 cận chiến, A2/SC/S1 đánh xa theo mode quái có. Thời lượng = số khung / fps của animdata.
  function monAttack(m, anim, len) {
    var h = S.hero, art = m.art;
    var mode = anim === 'swing' ? (E.animOf(art, 'A2') && Math.random() < 0.4 ? 'A2' : 'A1')
      : (E.pickAnim(art, anim === 'cast' ? ['SC', 'S1', 'A2', 'A1'] : ['A2', 'A1']) || 'A1');
    var an = E.animOf(art, mode), dur = clamp(E.animDur(an) || 600, 300, 1600);
    m.dir = E.dirFromTiles(h.x - m.x, h.y - m.y);
    m.act = { kind: anim, done: false, mode: mode, hitAt: an && an.hit > 0 ? an.hit / (an.frames || an.f.length) : 0.5 };
    restart(m, anim === 'shoot' || anim === 'cast' ? 'cast' : 'attack', dur);
    m.cd = dur / 1000 * rnd(1.1, 1.6) + 0.15;
    E.sfx([m.snd.Attack1, m.snd.Weapon1].filter(Boolean), 0.5);
  }
  function monStrike(m, a) {
    a.done = true; var h = S.hero, inst = m.inst;
    if (a.kind === 'rez') {
      var c = a.corpse; if (c && c.st === 'dead') { c.hp = Math.round(c.maxHp * 0.6); c.rez = 0; c.aggro = true; c.deadAt = 0; restart(c, 'idle', 0); c.spawnT = 0; E.sfx([m.snd.Skill1], 0.5); }
      return;
    }
    if (a.kind === 'swing') {
      if (dist(m, h) > 4.0) return;
      var p = safe(function () { return D2R.hitChance((inst.a1 && inst.a1.ar) || inst.ar || 30, inst.lvl || 1, S.d.def, S.char.lvl); }, 0.7);
      var a1 = inst.a1 || inst.dmg || { min: 1, max: 3 };
      if (Math.random() < p) damageHero(rnd(a1.min, a1.max + 0.999), m);
      else floatText(h.x, h.y, 'miss', '#aaa');
    } else {
      var fire = m.ai === 'shaman';
      var ms = inst.missile || {}, md = ms.dmg && (ms.dmg.max > 0) ? ms.dmg : (inst.a2 && inst.a2.max ? inst.a2 : inst.a1 || { min: 1, max: 3 });
      spawnMissile(m, h.x, h.y, { dmg: { min: md.min, max: md.max, elem: ms.elem || (fire ? 'fire' : 'phys') }, art: ms.id && E.hasSheet('mis.' + ms.id) ? 'mis.' + ms.id : 'mis.arrow', boom: boomArt(ms.id), speed: clamp(ms.vel || 12, 10, 18), owner: 'mon', ar: ((inst.a2 && inst.a2.ar) || inst.ar || 30) * 1.5, life: 1.8 });
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
          if (wp[0] >= e.cx - 1 && wp[0] <= e.cx + e.ow + 1 && wp[1] >= e.cy - 1 && wp[1] <= e.cy + e.oh + 1) score = 20 + ly / 20;
        }
      } else if (e.kind === 'mon' || e.kind === 'npc') {
        if (e.st === 'dead' || (window.D2S && D2S.isFriend(e))) return;
        var dx = (sx - p[0]) / 24, dy = (sy - (p[1] - 34)) / 40;
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
      h.goal = { type: isSpell(sk) ? 'cast' : 'attack', skill: sk || 'attack', target: e, btn: btn }; S.target = e; return;
    }
    // mặt đất
    if (isSpell(sk) || (btn === 'right' && sk && sk !== 'attack')) h.goal = { type: 'cast', skill: sk, x: w[0], y: w[1], btn: btn };
    else if (btn === 'right' || shift) h.goal = { type: 'attack', skill: sk || 'attack', x: w[0], y: w[1], inPlace: true, btn: btn };
    else { h.goal = { type: 'move', x: w[0], y: w[1] }; h.path = null; }
    S.target = null;
  }
  function btnHeld(b) { return b === 'left' ? I.mouse.left : b === 'right' ? I.mouse.right : b === 'touch' ? I.atkHeld : false; }
  var holdT = 0;
  function holdTick(btn) {
    if (performance.now() - (I.mouse.downT || 0) < 250 || S.holdLock === btn) return;
    var h = S.hero, g = h.goal; holdT += 1;
    if (g && (g.type !== 'move' || holdT % 4)) return;
    var e = entAt(I.mouse.x, I.mouse.y);
    if (e && e.kind !== 'mon') return;
    command(I.mouse.x, I.mouse.y, btn, I.shift);
  }
  function touchAttack(skill) {
    var h = S.hero, sk = skill || S.leftSkill || 'attack';
    if (h.st === 'die' || h.st === 'dead') return;
    var best = null, bd = 24;
    S.ents.forEach(function (m) { if (m.kind === 'mon' && m.st !== 'die' && m.st !== 'dead' && !(window.D2S && D2S.isFriend(m))) { var d = dist(m, h); if (d < bd) { bd = d; best = m; } } });
    if (best) { h.goal = { type: isSpell(sk) ? 'cast' : 'attack', skill: sk, target: best, btn: 'touch' }; S.target = best; }
    else { var a = angOf(h.dir); h.goal = { type: isSpell(sk) ? 'cast' : 'attack', skill: sk, x: h.x + Math.cos(a) * 12, y: h.y + Math.sin(a) * 12, inPlace: true, btn: 'touch' }; }
  }

  Game.assignSkill = function (which, id) {
    if (which === 'left') S.leftSkill = id; else S.rightSkill = id;
    UI.msg((DA.skill(id) ? DA.skill(id).name : 'Đánh thường') + (which === 'left' ? ' -> chuột trái' : ' -> chuột phải'));
  };
  Game.bindFree = function (id) {
    var i = S.fkeys.indexOf(id); if (i >= 0) { UI.msg(DA.skill(id).name + ' đã ở F' + (i + 1)); return; }
    for (i = 0; i < 8; i++) if (!S.fkeys[i]) { S.fkeys[i] = id; UI.msg(DA.skill(id).name + ' -> F' + (i + 1)); return; }
  };
  // rê lên một kỹ năng trong bảng chọn rồi bấm F1-F8 để gán phím, như D2
  Game.bindKey = function (n, id) {
    if (!id) return;
    var i = S.fkeys.indexOf(id); if (i >= 0) S.fkeys[i] = null;
    S.fkeys[n] = id; UI._last.sig = null; UI.renderPopup();
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
    dropItem(it, S.hero.x + rnd(-1.2, 1.2), S.hero.y + rnd(1, 2.4)); UI.dirty = true;
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
    var p = DA.potionInfo(it); if (!p) return; c.belt[i] = null; beltDrop(c, i); quaff(p); UI.dirty = true; UI._last.sig = null;
  };
  // ô vừa trống: bình ở các hàng trên cùng cột tụt xuống một hàng, như đai D2
  function beltDrop(c, i) {
    for (var k = i; k + 4 < 16; k += 4) { if (c.belt[k]) return; c.belt[k] = c.belt[k + 4]; c.belt[k + 4] = null; }
  }

  /* Đồ trên con trỏ như D2: bấm vào đồ thì đồ rời chỗ cũ, dính con trỏ (c.hand, lưu cùng nhân vật);
   * bấm vào ô lưới / ô trang bị / ô đai để đặt hoặc đổi chỗ, bấm ra thế giới để thả. */
  Game.pickUp = function (it) {
    var c = S.char, i, sl = null; if (c.hand || !it) return false;
    if ((i = c.inv.indexOf(it)) >= 0) c.inv.splice(i, 1);
    else if ((i = (c.stash || []).indexOf(it)) >= 0) c.stash.splice(i, 1);
    else if ((i = c.belt.indexOf(it)) >= 0) { c.belt[i] = null; beltDrop(c, i); }
    else {
      Object.keys(c.equip).forEach(function (k) { if (c.equip[k] === it) sl = k; });
      if (!sl) return false;
      delete c.equip[sl]; recalc();
    }
    c.hand = it; E.sfx(['cursor_pickup', 'inv_metal'], 0.5); UI.dirty = true; UI._last.sig = null;
    return true;
  };
  Game.putGrid = function (where, x, y) {
    var c = S.char, it = c.hand; if (!it) return false;
    var list = where === 'stash' ? (c.stash = c.stash || []) : c.inv, cols = where === 'stash' ? Game.stashCols : 10, rows = where === 'stash' ? Game.stashRows : 4;
    var w = it.w || 1, hh = it.h || 1;
    if (x < 0 || y < 0 || x + w > cols || y + hh > rows) return false;
    var hit = list.filter(function (o) { return o.ix < x + w && o.ix + (o.w || 1) > x && o.iy < y + hh && o.iy + (o.h || 1) > y; });
    if (hit.length > 1) return false;   // đè hai món trở lên thì D2 không cho đặt
    if (hit.length) list.splice(list.indexOf(hit[0]), 1);
    it.ix = x; it.iy = y; list.push(it); c.hand = hit[0] || null;
    E.sfx(['inv_metal', 'inv_leather'], 0.5); UI.dirty = true; save();
    return true;
  };
  Game.putEquip = function (slot) {
    var c = S.char, it = c.hand; if (!it) return false;
    var sl = DA.slotOf(it), ring = /^ring/.test(slot);
    if (!sl || !DA.isEquippable(it) || (ring ? !/^ring/.test(sl) : sl !== slot)) return false;
    var rq = DA.req(it);
    if (rq.lvl > c.lvl || rq.str > c.str || rq.dex > c.dex) { UI.msg('Chưa đủ yêu cầu để trang bị.', '#ff9a8a'); return false; }
    var old = c.equip[slot] || null;
    c.equip[slot] = it; c.hand = old; recalc();
    E.sfx(['inv_metal'], 0.5); UI.dirty = true; UI._last.sig = null; save();
    return true;
  };
  Game.putBelt = function (i) {
    var c = S.char, it = c.hand;
    if (!it || !DA.potionInfo(it) || i >= beltCap(c)) return false;
    var old = c.belt[i] || null; c.belt[i] = it; c.hand = old;
    E.sfx(['inv_potion'], 0.5); UI.dirty = true; UI._last.sig = null;
    return true;
  };
  Game.dropHand = function () {
    var c = S.char, it = c.hand; if (!it || !S.hero) return;
    c.hand = null; dropItem(it, S.hero.x + rnd(-0.6, 0.6), S.hero.y + rnd(0.6, 1.4)); UI.dirty = true; save();
  };
  Game.sellHand = function () {
    var c = S.char, it = c.hand; if (!it) return;
    c.hand = null; c.gold += DA.sellPrice(it); E.sfx(['inv_coins']); UI.dirty = true; save();
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
    var belt = c.belt || []; c.belt = []; for (var bi = 0; bi < 16; bi++) c.belt[bi] = belt[bi] || null;
    c.inv.forEach(function (it) { if (it.ix == null) { var sp = findSpot({ inv: c.inv.filter(function (x) { return x !== it && x.ix != null; }) }, it.w || 1, it.h || 1); it.ix = sp ? sp[0] : 0; it.iy = sp ? sp[1] : 0; } });
    c.statPts = c.statPts || 0; c.skillPts = c.skillPts || 0; c.stash = c.stash || []; c.waypoints = c.waypoints || {};
    var alias = D2DATA.areaAlias || {};
    if (S.corpse && alias[S.corpse.area]) S.corpse.area = alias[S.corpse.area];
    c.diff = c.diff || 'n'; c.diffMax = c.diffMax || 'n';
    c.byDiff = c.byDiff || {};
    c.byDiff.n = c.byDiff.n || { quests: c.quests, waypoints: c.waypoints, actAccess: c.actAccess || {} };
    Object.keys(c.byDiff).forEach(function (d) {
      var w = c.byDiff[d].waypoints || {};
      Object.keys(alias).forEach(function (o) { if (w[o]) { w[alias[o]] = true; delete w[o]; } });
    });
    setDiff(c, c.diff);
  }
  var DIFFS = ['n', 'nm', 'h'], DIFF_NAME = { n: 'Normal', nm: 'Nightmare', h: 'Hell' };
  function setDiff(c, d) {
    var b = c.byDiff[d] = c.byDiff[d] || { quests: {}, waypoints: {}, actAccess: {} };
    c.diff = d; c.quests = b.quests; c.waypoints = b.waypoints; c.actAccess = b.actAccess;
  }
  Game.diffs = function () {
    var c = loadSave(); c = c && c.char;
    var max = DIFFS.indexOf((c && c.diffMax) || 'n');
    return DIFFS.slice(0, max + 1).map(function (d) { return { id: d, name: DIFF_NAME[d] }; });
  };
  function startPlay(ch) {
    S.char = ch; normChar(ch); recalc();
    // game mới, trừ khi xác còn nằm ở game trước: khi đó chơi tiếp game đó để khu có xác dựng y như cũ
    S.gameSeed = (S.corpse && S.corpse.game) || ((Math.random() * 1e9) | 0) + 1;
    S.levels = {}; S.layouts = {}; S.levelKey = null; S.grid = null; S.cross = null;
    ch.hp = ch.hp > 0 ? ch.hp : S.d.maxHp;
    S.stamina = S.stamMax; S.regen = []; S.denLeft = null; S.scene = 'play';
    UI.showHud(true); UI.refreshSkillIcons(); UI.refreshBelt();
    var town = townOf(1 + Object.keys(ch.actAccess || {}).filter(function (k) { return /^\d$/.test(k); }).length);
    return enterArea(town, null).then(function () {
      recalc();
      UI.msg('Chào mừng đến ' + S.def.name + (ch.diff !== 'n' ? ' (' + DIFF_NAME[ch.diff] + ')' : '') + '.');
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
  Game.continueGame = function (diff) {
    var s = loadSave(); if (!s) return;
    normChar(s.char);
    if (diff && diff !== s.char.diff && DIFFS.indexOf(diff) <= DIFFS.indexOf(s.char.diffMax)) setDiff(s.char, diff);
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
    if (window.D2S) D2S.update(Game.api, dt);
    var ents = S.ents;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.kind === 'mon' && !e.ally) updateMon(e, dt);
      else if (e.kind === 'missile') updateMissile(e, dt);
      else if (e.kind === 'fx') { e.t += dt; if (e.t > e.life) e.removed = true; }
      else if (e.kind === 'drop') {
        if (e.gold && !e.removed && dist(e, h) < 2.6 && h.st !== 'die' && h.st !== 'dead') pickup(e);
      } else if (e.kind !== 'hero') e.stT += dt * 1000;
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

  }

  // Hoạt ảnh một lượt (đánh, niệm, trúng đòn) trải đúng lên thời lượng trạng thái do luật tính (tốc độ vũ khí...)
  function actT(e, an) {
    if (an && e.stDur && (e.st === 'attack' || e.st === 'cast' || e.st === 'hit')) return Math.min(e.stT / e.stDur, 0.999) * E.animDur(an);
    return e.stT;
  }
  function shadow(sx, sy, rx, ry) { var c = E.ctx; c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(sx, sy, rx, ry, 0, 0, 7); c.fill(); }
  function oneShot(st) { return st === 'die' || st === 'dead' || st === 'attack' || st === 'cast' || st === 'hit'; }
  function drawHero(sx, sy, d) {
    if (window.D2S && D2S.drawUnit && D2S.drawUnit(Game.api, d.e, sx, sy)) return;
    var h = d.e, look = heroLook(), mode = heroMode(h);
    if (!E.heroCof(look, mode)) mode = 'NU';
    var cof = E.heroCof(look, mode), t = h.st === 'dead' ? 1e7 : actT(h, cof);
    shadow(sx, sy, 18, 8);
    if (!E.drawHero(look, mode, t, h.dir, sx, sy, 1, oneShot(h.st))) E.drawBlob(sx, sy, '#d8b080', 12, h.dir, null);
  }
  function monMode(m) {
    var art = m.art;
    switch (m.st) {
      case 'die': return 'DT';
      case 'dead': return E.animOf(art, 'DD') ? 'DD' : 'DT';
      case 'attack': case 'cast': return (m.act && m.act.mode) || 'A1';
      case 'hit': return 'GH';
      case 'run': case 'walk': return m.aggro && E.animOf(art, 'RN') ? 'RN' : 'WL';
      default: return 'NU';
    }
  }
  function drawMon(sx, sy, d) {
    if (window.D2S && D2S.drawUnit && D2S.drawUnit(Game.api, d.e, sx, sy)) return;
    var m = d.e, mode = monMode(m), an = E.animOf(m.art, mode);
    var t = m.st === 'dead' && mode === 'DT' ? 1e7 : actT(m, an), small = m.rank === 'normal' || m.rank === 'minion';
    if (m.st !== 'dead') shadow(sx, sy, small ? 16 : 22, small ? 7 : 10);
    var glow = m.rank === 'champion' || m.rank === 'unique';
    if (glow) { E.ctx.save(); E.ctx.shadowColor = m.rank === 'unique' ? '#ffe45a' : '#6e7bff'; E.ctx.shadowBlur = 12; }
    var ok = m.art ? E.drawSprite(m.art, mode, t, m.dir, sx, sy, m.hitFlash > 0 ? 0.7 : 1, oneShot(m.st)) : false;
    if (glow) E.ctx.restore();
    if (!ok) E.drawBlob(sx, sy, m.st === 'dead' ? '#442' : '#a44', 11, m.dir, null);
    // quái đang trỏ sáng lên như D2: vẽ lại sprite cộng sáng, không vẽ vòng dưới chân
    if (ok && S.hover === m && m.st !== 'dead') { E.ctx.save(); E.ctx.globalCompositeOperation = 'lighter'; E.drawSprite(m.art, mode, t, m.dir, sx, sy, 0.25, oneShot(m.st)); E.ctx.restore(); }
  }
  var OBJ_USE = { stash: true, waypoint: true, chest: true, portal: true };
  var OBJ_LABEL = { stash: 'Stash', waypoint: 'Waypoint', chest: 'Rương', portal: 'Cổng' };
  function drawObj(sx, sy, d) {
    var o = d.e, mode = o.mode;
    if (o.otype === 'waypoint' && S.char.waypoints && S.char.waypoints[S.areaId] && E.animOf(o.art, 'ON')) mode = 'ON';
    if (o.otype === 'portal') { var pd = portalOf(o); mode = pd && pd.open && E.animOf(o.art, 'ON') ? 'ON' : 'NU'; }
    E.drawSprite(o.art, mode, S.time * 1000 + o.t0, 0, sx, sy, 1, o.once);
    if (S.hover === o && OBJ_LABEL[o.otype]) {
      var c = E.ctx; c.font = '13px Georgia,serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
      c.strokeText(OBJ_LABEL[o.otype], sx, sy - 70); c.fillText(OBJ_LABEL[o.otype], sx, sy - 70);
    }
  }
  function drawNpc(sx, sy, d) {
    var n = d.e;
    shadow(sx, sy, 16, 7);
    if (!E.drawSprite(n.art, 'NU', n.stT, n.dir, sx, sy, 1)) E.drawBlob(sx, sy, '#6a8ac0', 11, n.dir, null);
    if (S.hover === n) {
      var nd = D2DATA.npcs[n.npc], name = nd ? nd.name : n.npc;
      var c = E.ctx; c.font = '13px Georgia,serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
      c.strokeText(name, sx, sy - 90); c.fillText(name, sx, sy - 90);
    }
  }
  function drawDrop(sx, sy, d) {
    var e = d.e;
    if (e.corpse) { E.ctx.fillStyle = '#322'; E.ctx.beginPath(); E.ctx.ellipse(sx, sy, 16, 7, 0, 0, 7); E.ctx.fill(); }
    else if (!e.art || !E.drawSprite(e.art, 'NU', (S.time - e.born) * 1000, 0, sx, sy, 1, true)) { E.ctx.fillStyle = e.gold ? '#ffd24a' : '#bbb'; E.ctx.fillRect(sx - 6, sy - 6, 12, 8); }
    e.sx = sx; e.sy = sy;
  }
  function drawMissile(sx, sy, d) {
    var m = d.e, ok;
    if (m.st === 'die') ok = m.boom ? E.drawSprite(m.boom, 'NU', m.t * 1000, m.dir, sx, sy, 1, true) : E.drawSprite(m.art, 'NU', m.t * 1000, m.dir, sx, sy, Math.max(0, 1 - m.t / 0.3));
    else ok = E.drawSprite(m.art, 'NU', m.t * 1000, m.dir, sx, sy, 1);
    if (!ok) { E.ctx.fillStyle = ELCOL[elemOf(m.dmg && m.dmg.elem)]; E.ctx.beginPath(); E.ctx.arc(sx, sy - 30, m.st === 'die' ? 14 : 6, 0, 7); E.ctx.fill(); }
  }
  function drawFx(sx, sy, d) {
    var e = d.e, f = e.t / e.life, c = E.ctx;
    c.save(); c.globalAlpha = 1 - f; c.strokeStyle = e.color || '#fff'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(sx, sy, e.ring * 16 * f, e.ring * 8 * f, 0, 0, 7); c.stroke(); c.restore();
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
      var fn = e.kind === 'hero' ? drawHero : e.kind === 'mon' ? drawMon : e.kind === 'npc' ? drawNpc : e.kind === 'obj' ? drawObj : e.kind === 'drop' ? drawDrop : e.kind === 'missile' ? drawMissile : e.kind === 'fx' ? drawFx : e.kind === 'd2sfx' && window.D2S ? function (sx, sy, d) { D2S.draw(Game.api, d.e, sx, sy); } : null;
      if (fn) drawables.push({ x: e.x, y: e.y, z: e.kind === 'drop' || (e.kind === 'mon' && e.st === 'dead') ? -1 : 0, e: e, draw: fn });
    });
    E.renderWorld(drawables);
    var c = E.ctx;
    // hầm động tối dần quanh người chơi
    if (S.def && S.def.inside && S.hero) {
      if (!vigCv) {   // vẽ sẵn một lần, kéo theo vị trí hero trên màn hình
        vigCv = document.createElement('canvas'); vigCv.width = 1920; vigCv.height = 1080;
        var vc = vigCv.getContext('2d'), gr = vc.createRadialGradient(960, 540, 120, 960, 540, 520);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)'); vc.fillStyle = gr; vc.fillRect(0, 0, 1920, 1080);
      }
      var p = E.toScreen(S.hero.x, S.hero.y);
      c.drawImage(vigCv, Math.round(p[0] - 960), Math.round(p[1] - 30 - 540));
    }
    // nhãn đồ rơi
    // Nhãn gần đáy màn hình đặt trước; nhãn sau đụng bất kỳ nhãn đã đặt nào thì đẩy lên tới khi hết chồng.
    var show = I.alt || I.touch, rects = [], labs = [];
    c.font = '12px Georgia,serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    S.ents.forEach(function (e) {
      if (e.kind !== 'drop' || e.sx == null || e.removed) return;
      if (!(show || S.hover === e || S.time - e.born < 4 || e.corpse)) { e.labelRect = null; return; }
      labs.push(e);
    });
    labs.sort(function (a, b) { return b.sy - a.sy || a.sx - b.sx; });
    labs.forEach(function (e) {
      var tw = c.measureText(e.label).width + 8, x = Math.round(e.sx - tw / 2), y = e.sy - 30, r;
      for (var n = 0; n < 200; n++) {
        r = null;
        for (var i = 0; i < rects.length; i++) { var q = rects[i]; if (x < q[0] + q[2] && q[0] < x + tw && y < q[1] + q[3] + 1 && q[1] < y + 15) { r = q; break; } }
        if (!r) break;
        y = r[1] - 15;
      }
      e.labelRect = [x, y, tw, 14]; rects.push(e.labelRect);
    });
    labs.sort(function (a, b) { return (S.hover === a) - (S.hover === b); });
    labs.forEach(function (e) {
      var hov = S.hover === e, lr = e.labelRect;
      c.fillStyle = hov ? 'rgba(40,40,110,.95)' : 'rgba(0,0,0,.7)'; c.fillRect(lr[0], lr[1], lr[2], lr[3]);
      c.fillStyle = e.gold ? '#ffd24a' : e.corpse ? '#cc8' : UI.qcol(e.item && e.item.q); c.fillText(e.label, lr[0] + 4, lr[1] + 11);
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
    I.on('click', function (ev) {
      if (S.scene !== 'play' || S.paused) return;
      S.holdLock = null;
      if (S.char.hand) { Game.dropHand(); return; }   // đang cầm đồ: bấm ra thế giới là thả xuống đất
      holdT = 0; command(ev.x, ev.y, 'left', ev.shift);
    });
    I.on('rclick', function (ev) { if (S.scene === 'play' && !S.paused) { S.holdLock = null; command(ev.x, ev.y, 'right', ev.shift); } });
    // lăn chuột chỉ xoay qua các kỹ năng đã gán phím F, như D2
    I.on('wheel', function (ev) {
      if (S.scene !== 'play') return;
      var ids = S.fkeys.filter(Boolean); if (!ids.length) return;
      var i = ids.indexOf(S.rightSkill); i = i < 0 ? 0 : (i + ev.d + ids.length) % ids.length; S.rightSkill = ids[i]; UI.refreshSkillIcons();
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
      if (k === 'KeyI' || k === 'KeyB') UI.toggle('inv'); else if (k === 'KeyC' || k === 'KeyA') UI.toggle('char'); else if (k === 'KeyT') UI.toggle('skill');
      else if (k === 'KeyQ') UI.toggle('quest'); else if (k === 'Tab') UI.toggle('map'); else if (k === 'Escape') UI.toggleMenu();
      else if (k === 'KeyS') UI.skillPopup('right'); else if (k === 'Space') UI.closeAll(); else if (k === 'KeyH') UI.toggleHelp();
      else if (k === 'Backquote') UI.toggleBelt();
      else if (k === 'KeyR') S.runOn = !S.runOn;
      else if (/^Digit[1-4]$/.test(k)) Game.drinkBelt(+k.slice(5) - 1);
      else if (/^F[1-8]$/.test(k)) { if (UI.popHover !== undefined) Game.bindKey(+k.slice(1) - 1, UI.popHover); else fkeyUse(+k.slice(1) - 1); }
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
    E.ensureUi().then(function () {
      UI.rebuildHud(); UI.showLoad(false); S.scene = 'title'; UI.showTitle(Game.hasSave());
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
        cross: S.cross, gameSeed: S.gameSeed,
        mons: S.ents.filter(function (e) { return e.kind === 'mon'; }).map(function (m) { return { id: m.monId, x: m.x, y: m.y, hp: m.hp, st: m.st, ai: m.ai, aggro: m.aggro, rank: m.rank, art: m.art }; }),
        drops: S.ents.filter(function (e) { return e.kind === 'drop' && !e.removed; }).map(function (d) { return { x: d.x, y: d.y, label: d.label, gold: d.gold, rect: d.labelRect || null }; }),
        npcs: S.ents.filter(function (e) { return e.kind === 'npc'; }).map(function (n) { return { id: n.npc, x: n.x, y: n.y }; })
      };
    },
    // vị trí con trỏ (toạ độ client) của một điểm lưới, để bắn sự kiện chuột thật
    client: function (x, y, lift) {
      var p = E.toScreen(x, y), r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.left + p[0] * r.width / 960, y: r.top + (p[1] - (lift || 0)) * r.height / 540, sx: p[0], sy: p[1] };
    },
    // đường A* của game từ hero tới (x, y), để test bấm chuột theo từng chặng thay vì đi thẳng vào hàng rào
    path: function (x, y) { var h = S.hero; return h ? findPath(h.x, h.y, x, y, 1e6) : null; },
    teleport: function (x, y) { if (S.hero) { S.hero.x = x; S.hero.y = y; S.hero.path = null; S.hero.goal = null; E.cam.x = x; E.cam.y = y; markSeen(); } },
    goto: function (id, from) { return enterArea(id, from || null); },
    hurt: function (n) { damageHero(n); },
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
    addNpc: function (id, x, y) { mk('npc', x, y, { npc: id, dir: 6, art: D2DATA.npcs[id] && D2DATA.npcs[id].art }); },
    monIds: function () { return coll(S.def && S.def.monsters).map(function (m) { return typeof m === 'string' ? m : m.id; }); },
    heroLook: function () { return heroLook(); },
    // tờ 8 hướng của hero vẽ bằng E.drawHero thật lên canvas phủ (file:// làm toDataURL lỗi nên gắn canvas vào trang)
    contactSheet: function (mode) {
      var look = heroLook(), cv = document.createElement('canvas'), W = 120, Hh = 140; cv.width = W * 8; cv.height = Hh;
      var c = cv.getContext('2d'), old = E.ctx; c.fillStyle = '#3a4a2c'; c.fillRect(0, 0, cv.width, Hh);
      E.ctx = c; var ok = 0;
      for (var d = 0; d < 8; d++) { if (E.drawHero(look, mode || 'NU', 0, d, W * d + W / 2, Hh - 20, 1)) ok++; c.fillStyle = '#fff'; c.font = '12px sans-serif'; c.fillText('dir ' + d, W * d + 4, 14); }
      E.ctx = old; cv.id = 'd2-sheet'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'; document.body.appendChild(cv); return { ok: ok };
    },
    freeze: function (on) { Game.freeze = !!on; },
    zoom: function (z) { E.view = z || 1; }   // chỉ để chụp ảnh khu rộng: thu nhỏ khung hình quanh tâm, không đụng luật
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
