// Xâm Nhập Hư Không, độ 1 "Lần Đầu Vào Hư Không" (G.mode === 'void'): Chế độ Ải 15 ải với Tinh Anh Hư Không.
// Số lấy từ tools/polish/MODES.md mục 2e; nhãn [WIKI VI] trang Void_Invasion, [WIKI Void] trang The_Void, [LOC] chuỗi gốc.
// enemies.json Hp = 0 cho quái Hư Không nên mọi số máu lấy từ wiki. AI gốc nằm trong IL2CPP: viết lại theo tên state,
// mô tả [LOC ui/void_invasion_enemy_short_guide_N] và wiki; số thời gian/tốc độ ghi [ƯỚC LƯỢNG].
//   Tinh Anh (Thủ Vệ 250 / Ảnh Vệ 200 / Linh Vệ 200 HP): 3 tầng Khiên Hư Không × 80 HP; khi khiên còn, MỌI đòn chỉ tính 1 vào khiên.
//   Mỗi loại có cách phá riêng (cả tầng một lúc): Thủ Vệ trúng đúng lúc khiên biến mất lúc lao; Ảnh Vệ trúng đúng lúc khiên biến
//   mất trước khi lao (bản thật); Linh Vệ dẫn Cầu Lửa về chính nó hoặc thiên thạch trúng nó.
//   Phá 1 tầng: rút lui + 30 Xu Ám Tinh (tầng còn lại giữ cho lần gặp sau; tầng cuối vỡ thì ở lại đánh); hạ hết quái nhỏ mà khiên
//   còn: bỏ chạy + 5 Xu; hết khiên rồi hạ: 50 Xu + 1 Mắt Hư Không. Đạo Tặc (100 HP, không khiên, 20 giây): hạ rơi 100 Xu + 1 Mắt.
//   Trùm Hư Không: 600 (1-5) / 1200 (2-5) cạnh trùm chính; chính chết trước thì bỏ chạy +40 Xu; hạ rơi 120 Xu. 3-5: xuất hiện sau
//   khi trùm chính chết, 1800 HP, hạ rơi 1 Mắt + Xu. Hai Lãnh Chúa nhân 0,75 máu (450/900/1350).
//   Rãnh Nứt [LOC tip_11; WIKI VI "Void Rift"]: xuất hiện ngẫu nhiên khi đang đánh rồi đóng; không đánh được, không chặn đạn;
//   bước vào mất 1 máu ở độ 1 (2 ở độ 2). Nhịp xuất hiện/tồn tại là [ƯỚC LƯỢNG] (wiki không ghi).
//   NPC tiêu Xu Ám Tinh / Mắt Hư Không [WIKI VI "NPCs"]: Thương Nhân Hư Không (30 Xu bốc 3 thiên phú chọn 1, ở x-3 và x-5),
//   Nhà Ngân Hàng (55 vàng = 25 Xu; 25 Xu = 50 vàng; 1 Mắt = 100 vàng; 110 vàng = 1 Mắt; 55 Xu = 1 Mắt; 1 Mắt = 50 Xu),
//   Nhà Sưu Tầm (3 món, mỗi món 1 Mắt; làm mới 1 Mắt). Hình NPC vẽ bằng canvas (prefab NPC Hư Không chưa dựng).
// Chưa làm (tools/polish/GAPS.md): Thương Nhân Rãnh Nứt, Con Thoi, Tiên Tri, dòng thuộc tính vũ khí, thiên phú 3001-3007, khung bạc hồ sơ.
(function () {
  'use strict';
  const SK = window.SK, G = SK.G;
  const K = SK.BOSS_KIT;
  const C = {
    tier: 1, shieldHp: 80, shieldHps: { 1: 80, 2: 120, 3: 160 }, stacks: 3, dmgToShield: 1,   // 80/120/160 mỗi tầng theo độ [WIKI VI "Void Enemies"]
    xuFlee: 5, xuShatter: 30, xuKill: 50, xuThief: 100, xuBossFlee: 40, xuBossKill: 120, xuFinal: 200,   // xuFinal: wiki chỉ ghi "nhiều" [ƯỚC LƯỢNG]
    bossHp: { 1: 600, 2: 1200, 3: 1800 }, bossTierMul: { 1: 1, 2: 4 / 3, 3: 5 / 3 },   // 3-5: 1800/2400/3000 [WIKI Void]; hệ số này áp cho 1-5/2-5 ở độ 2-3 [ƯỚC LƯỢNG]
    meleeR: 42, redMul: 10, bareBonus: 1,   // khiên đỏ: đòn cận chiến gấp 10 [WIKI VI Sentinel]; cận chiến = người chơi cách quái <42 px [ƯỚC LƯỢNG]
    doubleLord: 0.75, thiefLife: 20, cloneHp: 30,
    riftDmg: 1, riftR: 13, riftLife: 6, riftEvery: [5, 9], riftMax: 2,   // [ƯỚC LƯỢNG] nhịp và tuổi Rãnh Nứt
    merchantXu: 30, bank: { goldToXu: [55, 25], xuToGold: [25, 50], eyeToGold: [1, 100], goldToEye: [110, 1], xuToEye: [55, 1], eyeToXu: [1, 50] },
    collectorEye: 1, collectorSlots: 3,
    eliteRate: 0.5, thiefRate: 0.18      // [ƯỚC LƯỢNG] xác suất một phòng quái có Tinh Anh / Đạo Tặc (wiki không ghi)
  };
  // id config, máu [WIKI VI]; hình hộp trúng lấy từ prefab
  const KINDS = {
    guard: { id: 'e_void_guard', hp: [250, 350], name: 'Hư Không Thủ Vệ' },   // máu theo độ 1/2/3 [WIKI VI]; mảng ngắn hơn 3 thì giữ số cuối
    assassin: { id: 'e_void_assassin', hp: [200, 300], name: 'Hư Không Ảnh Vệ' },   // độ 3 wiki ghi "???": giữ 300 [ƯỚC LƯỢNG]
    mage: { id: 'e_void_mage', hp: [200, 300], name: 'Hư Không Linh Vệ' },
    thief: { id: 'e_void_thief', hp: 100, name: 'Hư Không Đạo Tặc' },
    voidboss: { id: 'boss_void', hp: 600, name: 'Hư Không' }
  };
  const ELITES = ['guard', 'assassin', 'mage'];   // danh sách Tinh Anh độ 1; độ 2-3 thêm loại mới ở js/void2.js
  const V = SK.voidMode = { C, KINDS, ELITES, pendTier: 0 };
  const hpOf = (K0, t) => { const a = [].concat(K0.hp); return a[Math.min(t || 1, a.length) - 1]; };
  V.hpOf = hpOf;
  V.members = k => (V.GROUPS && V.GROUPS[k]) || [k];   // Thiền Vệ Trượng + Châu chung một ô Tinh Anh
  V.has = (g, id) => !!(g && g.player && g.player.buffs && g.player.buffs.indexOf(id) >= 0);
  V.shieldHp = g => C.shieldHps[(g && g.void && g.void.tier) || 1] || C.shieldHp;
  const on = g => g && g.mode === 'void' && g.void;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  // tier: độ khó 1..3 (Lần Đầu / Hỗn Độn / Hủy Diệt); lấy từ V.pendTier do lối vào đặt (lobby.js hoặc V.start)
  V.init = function () {
    const tier = Math.max(1, Math.min(3, V.pendTier || C.tier)); V.pendTier = 0;
    return { tier, roster: V.pickRoster ? V.pickRoster(tier) : ELITES.slice(), defeated: [], keep: {}, thiefSeen: false, xu: 0, eyes: 0, xuTotal: 0, kills: 0, fled: 0, finalSpawned: false, rifts: [], riftT: 6, xuSpent: 0, eyesSpent: 0, collector: null };
  };
  V.start = (hero, tier) => { V.pendTier = tier || 1; return SK.startRun(hero || 'knight', 'void', []); };
  V.endText = g => ' · Xu Ám Tinh nhận được ' + g.void.xuTotal + ' · Hạ ' + g.void.kills + ' kẻ địch Hư Không';

  V.addXu = function (g, n, x, y) {
    const v = g.void; v.xu += n; v.xuTotal += n;
    SK.num(g, x, y - 14, '+' + n, '#b57bff', false);
  };
  V.addEye = function (g, x, y) { g.void.eyes++; SK.num(g, x, y - 24, '+1 Mắt', '#ff7ad9', false); };

  // ---------------------------------------------------------------- dựng quái
  function make(g, kind, x, y, room, o) {
    o = o || {};
    const K0 = KINDS[kind], pf = SK.prefab(K0.id), box = pf[0].col.box;
    const v = g.void;
    const hp = o.hp != null ? o.hp : hpOf(K0, v && v.tier);
    const e = {
      id: K0.id, voidKind: kind, isVoid: true, clone: !!o.clone, hb: { size: [box.size[0], box.size[1]], off: [box.off[0], box.off[1]] },
      d: { shadow: null, shadowOff: [0, 1e5], speed: 3 }, p: { kinematic: 1, reward_rate: 0, reward_value: [0, 0, 0, 0] },
      cls: 'SKVoid', rawCls: 'SKVoid', x, y, kx: 0, ky: 0, hp, hpMax: hp, face: 1, aim: 0, st: 'spawn', stT: 0.7, t: 0, cd: 1.2, room,
      elite: false, flash: 0, w: null, anims: { dead: true }, r: Math.max(5, Math.min(9, box.size[0] / 3)), scale: 1, burst: 0,
      arena: { objs: [], tracked: [], done: false },   // K.fire ghi đạn vào e.arena.tracked
      draw: drawVoid, as: 'idle', at: 0, age: 0, act: null, actT: 0, fx: [], noReward: !!o.clone
    };
    if (K0.elite !== false && (ELITES.indexOf(kind) >= 0 || K0.elite) && !o.clone) {
      const st = v && v.keep[kind] != null ? v.keep[kind] : C.stacks;   // số tầng khiên giữ qua các lần gặp [WIKI VI]
      e.vs = { stacks: st, hp: V.shieldHp(g), hpMax: V.shieldHp(g), open: false, max: C.stacks, red: false };
    }
    if (kind === 'thief') e.life = C.thiefLife;
    return e;
  }
  for (const k of ['guard', 'assassin', 'mage', 'thief']) SK.CUSTOM_ENEMIES[KINDS[k].id] = (g, x, y, room) => make(g, k, x, y, room);
  SK.CUSTOM_ENEMIES.boss_void = (g, x, y, room) => {
    const lvl = (g.stage && g.stage.level) || 1;
    let hp = Math.round((C.bossHp[lvl] || C.bossHp[1]) * (C.bossTierMul[g.void && g.void.tier] || 1));
    if (g.mods && g.mods.doubleBoss) hp = Math.round(hp * C.doubleLord);
    const e = make(g, 'voidboss', x, y, room, { hp });
    e.final = lvl === 3;
    e.p.kinematic = 0;
    return e;
  };

  // ---------------------------------------------------------------- khiên
  // Đòn thường: chỉ 1 vào khiên. Hết 80 thì vỡ một tầng như phá riêng.
  V.hitShield = function (g, e) {
    const s = e.vs, p = g.player;
    e.flash = 0.08;
    if (s.open) { SK.num(g, e.x, e.y - e.hb.off[1] - e.hb.size[1] * 0.5 - 4, '!', '#e8d4ff', false); return V.breakLayer(g, e, 'open') || true; }
    let d = C.dmgToShield;
    const bare = !!p && !p.weapons[p.cur];   // tay không (không cầm vũ khí)
    if (bare && V.has && V.has(g, 3001)) d += C.bareBonus;   // Tay Hư Không 3001: tay không gây 2 lên khiên [WIKI buff 3001]
    if (s.red && p && (bare || dist(p, e) < C.meleeR)) d *= C.redMul;   // khiên đỏ: cận chiến gấp 10 (20 với 3001)
    SK.num(g, e.x, e.y - e.hb.off[1] - e.hb.size[1] * 0.5 - 4, d, s.red ? '#ff6a5a' : '#b57bff', false);
    s.hp -= d;
    if (s.hp <= 0) V.breakLayer(g, e, 'wear');
    return true;
  };
  V.breakLayer = function (g, e, how) {
    const s = e.vs, v = g.void;
    if (!s || s.stacks <= 0) return false;
    s.stacks--; s.hp = s.hpMax || C.shieldHp; s.open = false; s.openT = 0; s.red = false; s.redT = 0;
    e.flash = 0.2; g.shake = Math.max(g.shake, 3);
    V.addXu(g, C.xuShatter, e.x, e.y);
    v.keep[e.voidKind] = s.stacks;
    SK.emit('voidShieldBreak', g, e, how);
    if (s.stacks > 0) V.leave(g, e);   // mở cổng rút lui; tầng cuối vỡ thì ở lại đánh [SUY]
    else g.toast('Khiên Hư Không đã vỡ', 1.6);
    return true;
  };
  V.leave = function (g, e) {
    if (e.st === 'dead') return;
    e.st = 'dead'; e.stT = 0; e.leave = true; e.as = 'leave'; e.fx = [];
    if (e.vs) g.void.keep[e.voidKind] = e.vs.stacks;
    g.void.fled++;
    for (const c of g.enemies) if (c.clone && c.owner === e && c.st !== 'dead') { c.st = 'dead'; c.stT = 9; c.leave = true; }
  };

  const hurt0 = SK.hurtEnemy;
  SK.hurtEnemy = function (g, e, dmg, ...rest) {
    if (e && e.isVoid && e.vs && e.vs.stacks > 0 && e.st !== 'spawn' && e.st !== 'dead') return V.hitShield(g, e);
    return hurt0(g, e, dmg, ...rest);
  };

  // ---------------------------------------------------------------- phần thưởng
  SK.on('enemyKill', (g, e) => {
    if (!on(g)) return;
    const v = g.void;
    if (e.isVoid) {
      if (e.clone) return;
      v.kills++; e.deadByKill = true;
      if (e.voidKind === 'thief') { V.addXu(g, C.xuThief, e.x, e.y); V.addEye(g, e.x, e.y); }
      else if (e.voidKind === 'voidboss') { V.addXu(g, e.final ? C.xuFinal : C.xuBossKill, e.x, e.y); V.addEye(g, e.x, e.y); }
      else {
        V.addXu(g, C.xuKill, e.x, e.y); V.addEye(g, e.x, e.y);
        if (v.defeated.indexOf(e.voidKind) < 0) v.defeated.push(e.voidKind);   // chết là không xuất hiện lại cả ván
      }
      for (const c of g.enemies) if (c.clone && c.owner === e && c.st !== 'dead') { c.st = 'dead'; c.stT = 9; c.leave = true; }
      return;
    }
    if (!e.bossKey || !g.stage || !g.stage.boss) return;
    if (g.enemies.some(o => o !== e && o.bossKey && o.st !== 'dead' && o.room === e.room)) return;
    if (g.stage.level < 3) {
      // trùm chính chết trước: Hư Không bỏ chạy, rơi 40 Xu [WIKI Void]
      // (bosses.js đã đánh dấu mọi quái còn lại của phòng là chết trước khi tới đây: nhận ra bằng st dead mà không phải bị hạ)
      for (const o of g.enemies) {
        if (!o.isVoid || o.voidKind !== 'voidboss' || o.deadByKill || o.leave) continue;
        if (o.st === 'dead') { o.leave = true; o.as = 'leave'; o.stT = 0; o.hp = o.hpMax; o.fx = []; g.void.fled++; } else V.leave(g, o);
        V.addXu(g, C.xuBossFlee, o.x, o.y);
      }
    } else if (!v.finalSpawned) {
      // 3-5: Hư Không chỉ xuất hiện sau khi trùm chính chết, thêm vào ngay trong lúc phòng còn khoá
      v.finalSpawned = true;
      const o = SK.makeEnemy(g, 'boss_void', e.x, e.y, e.room);
      g.enemies.push(o);
      g.toast('Hư Không giáng lâm', 3);
    }
  });
  SK.on('stageEnter', g => { if (on(g)) g.void.finalSpawned = false; });

  // ---------------------------------------------------------------- bốc quái vào phòng
  const buildWaves0 = G.buildWaves;
  G.buildWaves = function (r) {
    const waves = buildWaves0.call(G, r);
    const v = on(G); if (!v || !waves.length) return waves;
    const st = G.stage;
    if (r.type === 'boss') {
      if (st.level < 3) waves[0].push('boss_void');   // cạnh trùm chính ở 1-5 và 2-5 [WIKI Void]
      return waves;
    }
    if (r.type !== 'battle' || st.label === '1-1') return waves;   // tinh anh sinh từ ải 1-2 tới 3-5 [WIKI VI]
    const free = v.roster.filter(k => V.members(k).some(m => v.defeated.indexOf(m) < 0));
    if (free.length && SK.chance(C.eliteRate)) for (const m of V.members(SK.pick(free))) if (v.defeated.indexOf(m) < 0) waves[waves.length - 1].push(KINDS[m].id);
    if (!v.thiefSeen && SK.chance(C.thiefRate)) { v.thiefSeen = true; waves[0].push(KINDS.thief.id); }
    return waves;
  };

  // ---------------------------------------------------------------- AI
  const others = (g, e) => g.enemies.some(o => o !== e && o.room === e.room && o.st !== 'dead' && !o.isVoid && !o.bossKey);
  const move = (g, e, dx, dy, spd, dt) => {
    const d = Math.hypot(dx, dy) || 1;
    return SK.moveBox(g.map, e, dx / d * spd * dt, dy / d * spd * dt, e.r);
  };
  const shoot = (g, e, ang, o) => {
    if (!K || !K.fire) return;
    K.fire(g, e, 'bullet_e_3', e.x + Math.cos(ang) * 8, e.y - 10 + Math.sin(ang) * 8, ang, Object.assign({ spd: 8, dmg: 2, h: 8 }, o));
  };
  const setAct = (e, a, t, as) => { e.act = a; e.actT = t; if (as) { e.as = as; e.at = 0; } };

  // Lao tới theo hướng đã khoá: dùng chung cho Thủ Vệ, Ảnh Vệ và phân thân.
  function dash(g, e, dt, spd, dmg, next) {
    e.actT -= dt;
    const hit = move(g, e, Math.cos(e.dir), Math.sin(e.dir), spd, dt);
    const p = g.player;
    if (!e.hit && p.st !== 'dead' && dist(e, p) < 15) { e.hit = true; SK.hurtPlayer(g, dmg, e.x, e.y); }
    if (e.actT <= 0 || hit) next();
  }
  function lockDir(g, e) { e.dir = angTo(e, g.player); e.face = Math.cos(e.dir) >= 0 ? 1 : -1; e.hit = false; }

  const AI = {
    guard(g, e, dt) {
      const p = g.player, d = dist(e, p), s = e.vs;
      if (e.act === 'wind') {
        e.actT -= dt; e.face = p.x >= e.x ? 1 : -1;
        if (e.actT <= 0) { lockDir(g, e); setAct(e, 'dash', 0.45, 'skill_1_1'); if (s) s.open = true; }   // khiên tím biến mất lúc lao [LOC guide_2]
      } else if (e.act === 'dash') {
        dash(g, e, dt, 190, 4, () => { if (s) s.open = false; setAct(e, 'rest', 0.9, 'idle'); });   // 4 sát thương mỗi đòn [WIKI VI]
      } else if (e.act === 'punch') {
        e.actT -= dt;
        if (e.actT <= 0.55 && !e.p1) { e.p1 = true; if (dist(e, p) < 30) SK.hurtPlayer(g, 4, e.x, e.y); }
        if (e.actT <= 0.15 && !e.p2) { e.p2 = true; if (dist(e, p) < 30) SK.hurtPlayer(g, 4, e.x, e.y); }
        if (e.actT <= 0) setAct(e, 'rest', 0.7, 'idle');
      } else if (e.act === 'rest') {
        e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.2; }
      } else {
        e.cd -= dt;
        if (d > 36 && p.st !== 'dead') { move(g, e, p.x - e.x, p.y - e.y, 34, dt); e.face = p.x >= e.x ? 1 : -1; e.as = 'run'; } else e.as = 'idle';
        if (e.cd <= 0 && d < 170 && p.st !== 'dead') {
          if (d < 34 && SK.chance(0.4)) { e.p1 = e.p2 = false; setAct(e, 'punch', 0.9, 'skill_2'); }
          else setAct(e, 'wind', 0.7, 'skill_1_0');
        }
      }
    },
    assassin(g, e, dt) {
      const p = g.player, s = e.vs;
      if (e.act === 'wind') {
        e.actT -= dt; e.face = p.x >= e.x ? 1 : -1;
        if (s) s.open = e.actT < 0.5;   // khiên biến mất ở 0,5 giây cuối trước khi lao [LOC guide_1; ƯỚC LƯỢNG 0,5 s]
        if (e.actT <= 0) { lockDir(g, e); setAct(e, 'dash', 0.4, 'skill_2'); if (s) s.open = false; }
      } else if (e.act === 'dash') {
        dash(g, e, dt, 175, 3, () => setAct(e, 'rest', 1, 'idle'));
      } else if (e.act === 'rest') {
        e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.5; }
      } else {
        e.cd -= dt; e.as = 'idle';
        if (e.cd <= 0 && p.st !== 'dead') {
          setAct(e, 'wind', 1.1, 'skill_1');
          for (let i = -1; i <= 1; i += 2) {   // gọi 2 phân thân 30 HP, cả 3 lao theo vệt; chỉ bản thật tính là hạ [WIKI VI]
            const c = make(g, 'assassin', e.x + i * 22, e.y, e.room, { hp: C.cloneHp, clone: true });
            c.owner = e; c.st = 'idle'; c.stT = 0; setAct(c, 'wind', 1.1, 'skill_1'); c.cd = 99;
            g.enemies.push(c);
          }
        }
      }
    },
    mage(g, e, dt) {
      const p = g.player;
      if (e.act === 'cast') {
        e.actT -= dt;
        if (e.cast && e.actT <= e.cast.at) { const f = e.cast; e.cast = null; f.go(); }
        if (e.actT <= 0) setAct(e, 'rest', 0.8, 'idle');
      } else if (e.act === 'rest') {
        e.actT -= dt; if (e.actT <= 0) { e.act = null; e.cd = 1.6; }
      } else {
        e.cd -= dt; e.as = 'idle'; e.face = p.x >= e.x ? 1 : -1;
        if (dist(e, p) < 70) move(g, e, e.x - p.x, e.y - p.y, 30, dt);   // giữ khoảng cách
        if (e.cd <= 0 && p.st !== 'dead') {
          const r = SK.rand();
          if (r < 0.34) { setAct(e, 'cast', 0.9, 'skill_2'); e.cast = { at: 0.3, go: () => V.spawnMeteor(g, e, p.x, p.y) }; }
          else if (r < 0.67) { setAct(e, 'cast', 0.9, 'skill_2'); e.cast = { at: 0.3, go: () => V.spawnOrb(g, e) }; }
          else { setAct(e, 'cast', 1.1, 'skill_1_start'); e.cast = { at: 0.7, go: () => { for (let i = 0; i < 4; i++) shoot(g, e, i * Math.PI / 2 + 0.4, { spd: 7 }); } }; }   // súng hình chữ thập
        }
      }
    },
    thief(g, e, dt) {
      const p = g.player;
      e.life -= dt;
      if (e.life <= 0) { V.leave(g, e); return; }   // biến mất sau 20 giây [WIKI VI]
      const d = dist(e, p);
      e.face = p.x >= e.x ? 1 : -1; e.as = 'idle';
      if (d < 90) { move(g, e, e.x - p.x, e.y - p.y, 40, dt); e.as = 'run'; }
      e.cd -= dt;
      if (e.cd <= 0 && d < 160 && p.st !== 'dead') {
        e.cd = 2.2; const a = angTo(e, p);
        for (let i = -1; i <= 1; i++) shoot(g, e, a + i * 0.28, { spd: 7, dmg: 2 });   // phi tiêu hình quạt
      }
    },
    voidboss(g, e, dt) {
      const p = g.player, d = dist(e, p);
      e.face = p.x >= e.x ? 1 : -1;
      if (d > 60 && p.st !== 'dead') { move(g, e, p.x - e.x, p.y - e.y, 22, dt); e.as = 'run'; } else e.as = 'idle';
      e.cd -= dt;
      if (e.cd <= 0 && p.st !== 'dead') {
        e.n = (e.n || 0) + 1; e.cd = 2.2;
        const a = angTo(e, p);
        if (e.n % 3 === 0) { for (let i = 0; i < 14; i++) shoot(g, e, i / 14 * Math.PI * 2, { spd: 6, dmg: 2 }); e.as = 'skill_3'; e.at = 0; }
        else for (let i = -3; i <= 3; i++) shoot(g, e, a + i * 0.2, { spd: 7, dmg: 2 });
      }
    }
  };
  Object.assign(V, { AI, make, move, shoot, setAct, dash, lockDir, others, dist, angTo, on });
  SK.AI.SKVoid = function (g, e, dt) {
    e.age += dt; e.at += dt;
    if (e.arena.tracked.length > 40) e.arena.tracked = e.arena.tracked.filter(b => !b.dead);
    if (g.player.st === 'dead') return;
    if (e.grasp) { AI.grasp(g, e, dt); return; }
    if (e.clone) {
      if (!e.owner || e.owner.st === 'dead' || e.act === 'rest') { e.st = 'dead'; e.stT = 0; e.leave = true; return; }   // phân thân tan sau cú lao
      AI.assassin(g, e, dt); return;
    }
    if (e.vs && e.vs.stacks > 0 && e.age > 2 && !others(g, e) && !V.has(g, 3003)) {   // Lệnh Truy Sát 3003: không bỏ chạy   // hạ hết quái nhỏ mà khiên còn: bỏ chạy, rơi 5 Xu [WIKI VI]
      V.leave(g, e); V.addXu(g, C.xuFlee, e.x, e.y); return;
    }
    const s = e.vs;
    if (s) {   // cửa sổ khiên mở / khiên đỏ có hạn giờ (loại mới ở void2.js)
      if (s.openT > 0) { s.openT -= dt; s.open = s.openT > 0; }
      if (s.redT > 0) { s.redT -= dt; s.red = s.redT > 0; }
    }
    for (const f of e.fx) f.update(g, e, f, dt);
    e.fx = e.fx.filter(f => !f.done);
    AI[e.voidKind](g, e, dt);
  };

  // ---------------------------------------------------------------- Linh Vệ: thiên thạch và Cầu Lửa Hư Không
  // Thiên thạch: vòng đỏ bám người chơi 1,2 giây rồi đứng yên 0,6 giây, nổ bán kính 22 px [LOC guide_0; ƯỚC LƯỢNG số]; trúng Linh Vệ thì vỡ khiên.
  V.spawnMeteor = function (g, mage, x, y) {
    mage.fx.push({
      kind: 'meteor', x, y, t: 0, track: 1.2, wait: 0.6, rad: 22, done: false,
      update(g2, e, f, dt) {
        f.t += dt;
        const p = g2.player;
        if (f.t < f.track && p.st !== 'dead') { f.x += (p.x - f.x) * Math.min(1, dt * 4); f.y += (p.y - f.y) * Math.min(1, dt * 4); }
        if (f.t >= f.track + f.wait) {
          f.done = true;
          g2.shake = Math.max(g2.shake, 2);
          if (p.st !== 'dead' && Math.hypot(p.x - f.x, p.y - f.y) < f.rad) SK.hurtPlayer(g2, 3, f.x, f.y);
          if (e.st !== 'dead' && e.vs && e.vs.stacks > 0 && Math.hypot(e.x - f.x, e.y - e.hb.off[1] * 0.5 - f.y) < f.rad + e.r) V.breakLayer(g2, e, 'meteor');
        }
      }
    });
  };
  // Cầu Lửa Hư Không: đuổi người chơi chậm; trúng người thì 2 sát thương, dẫn nó đụng Linh Vệ thì vỡ khiên.
  V.spawnOrb = function (g, mage, x, y) {
    mage.fx.push({
      kind: 'orb', x: x != null ? x : mage.x, y: y != null ? y : mage.y - 12, t: 0, done: false, spd: 40,
      update(g2, e, f, dt) {
        f.t += dt;
        const p = g2.player;
        if (p.st !== 'dead') { const a = Math.atan2(p.y - 8 - f.y, p.x - f.x); f.x += Math.cos(a) * f.spd * dt; f.y += Math.sin(a) * f.spd * dt; }
        if (f.t > 9) { f.done = true; return; }
        if (p.st !== 'dead' && Math.hypot(p.x - f.x, p.y - 8 - f.y) < 8) { f.done = true; SK.hurtPlayer(g2, 2, f.x, f.y); return; }
        if (f.t > 0.8 && e.st !== 'dead' && e.vs && e.vs.stacks > 0 && Math.hypot(e.x - f.x, e.y - e.hb.off[1] - f.y) < e.r + 5) { f.done = true; V.breakLayer(g2, e, 'orb'); }
      }
    });
  };

  // ---------------------------------------------------------------- vẽ
  function drawVoid(ctx, g, e) {
    if (e.st === 'spawn') return;
    if (e.hidden) { drawFx(ctx, g, e); return; }   // Đao Phủ ẩn: chỉ vẽ dấu săn
    const dead = e.st === 'dead';
    let alpha = 1;
    if (dead && e.leave) { alpha = 1 - e.stT / 0.8; if (alpha <= 0) return; }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.hb.size[0] * 0.4, 3, 0, 0, Math.PI * 2); ctx.fill();
    const ok = SK.drawPrefab(ctx, SK.prefab(e.id), e.x, e.y, { t: dead ? e.stT : e.at, state: dead && !e.leave ? 'dead' : e.as, flip: e.face < 0, alpha: e.flash > 0 ? 1 : alpha, pages: e.flash > 0 ? SK.pagesWhite : null });
    if (!ok) { ctx.fillStyle = '#6a2fb0'; ctx.fillRect(e.x - 6, e.y - 18, 12, 18); }
    if (dead) return;
    const cy = e.y - e.hb.off[1];
    if (e.vs && e.vs.stacks > 0) {
      const s = e.vs, pulse = 0.5 + 0.5 * Math.sin(g.t * 5);
      ctx.save();
      for (let i = 0; i < s.stacks; i++) {
        ctx.globalAlpha = s.open ? 0.25 : 0.45 + 0.2 * pulse - i * 0.08;
        ctx.strokeStyle = s.open ? '#e8d4ff' : s.red ? '#ff3a3a' : '#8a3cff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(e.x, cy, e.hb.size[0] * 0.75 + i * 2.5, e.hb.size[1] * 0.62 + i * 2.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const bw = 22, bx = e.x - bw / 2, by = e.y - e.hb.size[1] - 10;   // thanh khiên: tầng hiện tại + số tầng
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#9a4dff'; ctx.fillRect(bx, by, bw * Math.max(0, s.hp) / (s.hpMax || C.shieldHp), 3);
      for (let i = 0; i < s.max; i++) { ctx.fillStyle = i < s.stacks ? '#cfa8ff' : '#3a2a55'; ctx.fillRect(bx + i * 8, by + 5, 6, 2); }
      ctx.restore();
    } else if (!e.clone) {
      const bw = e.voidKind === 'voidboss' ? 40 : 20, bx = e.x - bw / 2, by = e.y - e.hb.size[1] - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#e0453a'; ctx.fillRect(bx, by, bw * Math.max(0, e.hp) / e.hpMax, 2);
    }
    if (e.act === 'wind' && (e.voidKind === 'guard' || e.voidKind === 'assassin')) {   // vệt lao tím báo trước
      const a = angTo(e, g.player);
      ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#b06bff'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(e.x, e.y - 6); ctx.lineTo(e.x + Math.cos(a) * 80, e.y - 6 + Math.sin(a) * 80); ctx.stroke(); ctx.restore();
    }
    drawFx(ctx, g, e);
  }
  function drawFx(ctx, g, e) {
    for (const f of e.fx) {
      ctx.save();
      if (f.draw) f.draw(ctx, g, f, e);
      else if (f.kind === 'meteor') {
        ctx.globalAlpha = 0.55; ctx.strokeStyle = f.t >= f.track ? '#ff3030' : '#ff8080'; ctx.fillStyle = 'rgba(255,40,40,0.18)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.rad, f.rad * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = '#c070ff'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + Math.sin(g.t * 12), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- Rãnh Nứt Hư Không
  V.spawnRift = function (g, x, y, life) {
    const v = g.void;
    const r = { x, y, age: 0, life: life != null ? life : C.riftLife, inside: false, gone: false, hits: 0 };
    v.rifts.push(r);
    return r;
  };
  V.riftDmg = g => C.riftDmg * (g.void && g.void.tier >= 2 ? 2 : 1);
  function riftTick(g, dt) {
    const v = g.void, p = g.player;
    v.rifts = v.rifts.filter(r => !r.gone);
    for (const r of v.rifts) {
      r.age += dt;
      if (r.age >= r.life + 0.5) { r.gone = true; continue; }
      const open = r.age >= 0.5 && r.age < r.life;   // 0,5 s mở ra, 0,5 s đóng lại: lúc đó chưa/hết gây hại
      const near = open && p && p.st !== 'dead' && !V.has(g, 3002) &&   // Thể Chất Hư Không 3002: miễn Rãnh Nứt
         Math.hypot(p.x - r.x, p.y - r.y) < C.riftR;
      v.riftHit = true;
      const hurt = near && !r.inside && SK.hurtPlayer(g, V.riftDmg(g), r.x, r.y);
      v.riftHit = false;
      if (hurt) { r.inside = true; r.hits++; SK.emit('voidRiftHit', g, r); }
      else if (!near && r.inside) r.inside = false;
    }
    const room = g.room;
    if (!room || room.state !== 'locked' || !p || p.st === 'dead') return;
    v.riftT -= dt;
    if (v.riftT > 0) return;
    v.riftT = SK.randf(C.riftEvery[0], C.riftEvery[1]);
    if (v.rifts.length >= C.riftMax) return;
    const a = SK.rand() * Math.PI * 2, d = SK.randf(30, 90);
    const [x, y] = SK.freeNear([p.x + Math.cos(a) * d, p.y + Math.sin(a) * d]);
    V.spawnRift(g, x, y - 4);
  }
  function drawRift(ctx, g, r) {
    const open = Math.min(1, r.age / 0.5, Math.max(0, (r.life + 0.5 - r.age) / 0.5));
    if (open <= 0) return;
    const rx = C.riftR * open, ry = rx * 0.55, t = g.t;
    ctx.save();
    ctx.globalAlpha = 0.85 * open;
    ctx.fillStyle = '#12001f'; ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b06bff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#e8d4ff'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + t * 0.6; ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + Math.cos(a) * rx * 0.9, r.y + Math.sin(a) * ry * 0.9); }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- NPC tiêu Xu Ám Tinh / Mắt Hư Không
  const robe = (ctx, x, y, c1, c2, g) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 4, y - 16); ctx.lineTo(x + 4, y - 16); ctx.lineTo(x + 7, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9c8f0'; ctx.beginPath(); ctx.arc(x, y - 20 + Math.sin(g.t * 2 + x) * 0.6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c2; ctx.fillRect(x - 3, y - 21, 6, 2);
  };
  const SAY = { poor: 'Xu Ám Tinh không đủ.', eyePoor: 'Mắt Hư Không không đủ.', goldPoor: 'Vàng không đủ.', full: 'Hết ô thiên phú.' };
  function npc(g, o) {
    g.props.push({ x: o.x, y: o.y, npc: o.kind, draw(ctx, g2, pr) { robe(ctx, o.x, o.y, o.c1, o.c2, g2); } });
    for (const it of o.acts) {
      const ia = Object.assign({ x: o.x + (it.dx || 0), y: o.y + 6 + (it.py || 0), r: 22, labelY: 44 + (it.dy || 0), npcKind: o.kind }, it), use = ia.use;
      ia.use = function (...a) { if (V.supportUse) V.supportUse(g, o.kind); return use.apply(this, a); };   // 3006: tương tác Nhân Vật hỗ trợ hồi 1 tầng khiên (void2.js)
      g.interactables.push(ia);
    }
  }
  V.price = () => C.merchantXu;
  // Thương Nhân Hư Không: 30 Xu Ám Tinh bốc 3 thiên phú ngẫu nhiên, chọn 1 [LOC tip_1-3; WIKI VI].
  // Danh sách "nâng cấp được" do mã gốc sinh nên bể là bể thiên phú thường của ải kế [SUY]; nhận thẳng bản thường, chưa có bản nâng cấp riêng.
  V.merchantBuy = function (g) {
    const v = g.void, R = SK.ROOMS;
    if (v.xu < C.merchantXu) { g.toast(SAY.poor, 1.6); return false; }
    if ((g.player.buffs || []).length >= R.buffSlots()) { g.toast(SAY.full, 1.6); return false; }
    if (R.choice.open || !R.openChoice(V.offerIds ? V.offerIds(g) : undefined)) return false;
    g.hold = true;
    v.xu -= C.merchantXu; v.xuSpent += C.merchantXu;
    return true;
  };
  V.placeMerchant = (g, x, y) => npc(g, { kind: 'merchant', x, y, c1: '#4b2b86', c2: '#ff7ad9', acts: [{
    get label() { return 'Thương Nhân Hư Không — ' + C.merchantXu + ' Xu Ám Tinh: chọn 1 trong 3 thiên phú'; },
    use() { V.merchantBuy(g); } }] });
  // Nhà Ngân Hàng: sáu phép đổi [WIKI VI "NPCs"]
  V.exchange = function (g, key) {
    const v = g.void, p = g.player, b = C.bank[key];
    const [from, to] = key.split(/To/).map(s => s.toLowerCase());
    const have = { gold: p.gold, xu: v.xu, eye: v.eyes };
    const set = (k, d) => { if (k === 'gold') p.gold += d; else if (k === 'xu') { v.xu += d; if (d < 0) v.xuSpent -= d; } else v.eyes += d; };
    if (have[from] < b[0]) { g.toast(from === 'gold' ? SAY.goldPoor : from === 'xu' ? SAY.poor : SAY.eyePoor, 1.6); return false; }
    set(from, -b[0]); set(to, b[1]);
    SK.num(g, p.x, p.y - 30, '+' + b[1], '#b57bff', false);
    return true;
  };
  const BANK_ROWS = [['goldToXu', '55 vàng = 25 Xu Ám Tinh'], ['xuToGold', '25 Xu Ám Tinh = 50 vàng'], ['eyeToGold', '1 Mắt Hư Không = 100 vàng'],
    ['goldToEye', '110 vàng = 1 Mắt Hư Không'], ['xuToEye', '55 Xu Ám Tinh = 1 Mắt Hư Không'], ['eyeToXu', '1 Mắt Hư Không = 50 Xu Ám Tinh']];
  V.placeBanker = (g, x, y) => npc(g, { kind: 'banker', x, y, c1: '#1f5a6b', c2: '#ffd24a',
    acts: BANK_ROWS.map((r, i) => ({ dx: (i % 3 - 1) * 24, py: Math.floor(i / 3) * 16, dy: Math.floor(i / 3) * -0, label: 'Nhà Ngân Hàng Hư Không — ' + r[1], use() { V.exchange(g, r[0]); } })) });
  // Nhà Sưu Tầm: 3 món mỗi món 1 Mắt; làm mới 1 Mắt. Bản vẽ / mảnh tiến hóa / hạt giống chưa có ở web nên bể là vũ khí, đá quý, bình [SUY].
  V.collectorStock = function (g) {
    const out = [], lvl = (g.stage && g.stage.level) || 1, DS = SK.DS || {};
    let pool = [];
    try { pool = (SK.weaponPool ? SK.weaponPool(lvl, 'shop') : []) || []; } catch (e) { pool = []; }
    pool = pool.map(x => typeof x === 'string' ? x : x && x.id).filter(id => id && (!DS.weapons || DS.weapons[id]));
    const own = g.player.weapons.filter(Boolean).map(w => w.id);
    const wl = pool.filter(id => own.indexOf(id) < 0);
    const kinds = ['weapon', 'gems', 'potion'];
    for (let i = 0; i < C.collectorSlots; i++) {
      const k = i === 0 && wl.length ? 'weapon' : SK.pick(kinds.filter(q => q !== 'weapon' || wl.length));
      if (k === 'weapon') { const id = SK.pick(wl.filter(w => !out.some(o => o.id === w))) || wl[0]; out.push({ kind: 'weapon', id, name: DS.weapons && DS.weapons[id] ? DS.weapons[id].name : id }); }
      else if (k === 'gems') out.push({ kind: 'gems', n: 20, name: '20 đá quý' });
      else out.push({ kind: 'potion', name: 'Bình máu và bình năng lượng' });
    }
    return out;
  };
  V.collectorBuy = function (g, i) {
    const v = g.void, c = v.collector, it = c && c.stock[i], p = g.player;
    if (!it || it.sold) return false;
    if (v.eyes < C.collectorEye) { g.toast(SAY.eyePoor, 1.6); return false; }
    v.eyes -= C.collectorEye; v.eyesSpent += C.collectorEye; it.sold = true;
    if (it.kind === 'weapon') g.items.push({ id: it.id, x: p.x, y: p.y + 6, t: 0 });
    else if (it.kind === 'gems') { if (SK.profile && SK.profile.addGems) SK.profile.addGems(it.n); }
    else { SK.dropPickup(g, 'hp_pot', p.x - 8, p.y + 8); SK.dropPickup(g, 'en_pot', p.x + 8, p.y + 8); }
    SK.emit('voidCollectorBuy', g, it);
    return true;
  };
  V.collectorRefresh = function (g) {
    const v = g.void;
    if (v.eyes < C.collectorEye) { g.toast(SAY.eyePoor, 1.6); return false; }
    v.eyes -= C.collectorEye; v.eyesSpent += C.collectorEye;
    v.collector.stock = V.collectorStock(g);
    return true;
  };
  V.placeCollector = function (g, x, y) {
    const v = g.void;
    v.collector = { stock: V.collectorStock(g) };
    const acts = [];
    for (let i = 0; i < C.collectorSlots; i++) acts.push({ dx: (i - 1) * 22, dy: 0,
      get gone() { return !v.collector.stock[i] || v.collector.stock[i].sold; },
      get label() { const it = v.collector.stock[i]; return it ? 'Nhà Sưu Tầm — ' + it.name + ' (' + C.collectorEye + ' Mắt Hư Không)' : ''; },
      use() { V.collectorBuy(g, i); } });
    acts.push({ dx: 0, py: 14, label: 'Nhà Sưu Tầm — làm mới (' + C.collectorEye + ' Mắt Hư Không)', use() { V.collectorRefresh(g); } });
    npc(g, { kind: 'collector', x, y, c1: '#6b2b5a', c2: '#7dffd0', acts });
  };

  // Đặt NPC khi vào ải: Thương Nhân ở góc dưới-trái phòng khởi đầu của x-3 và x-5; Nhà Sưu Tầm ở 3-5 (web chưa có 4-6 nên dời về cuối ải 3 [SUY]);
  // Nhà Ngân Hàng ở phòng đặc biệt còn trống.
  const corner = (g, r, sx) => {
    const T = 16, cx = r.cx * T + 8, cy = r.cy * T + 8;
    return SK.freeNear([cx + sx * (r.w / 2 - 2) * T, cy + (r.h / 2 - 2) * T]);
  };
  SK.on('stageEnter', (g, st) => {
    if (!on(g)) return;
    const v = g.void; v.rifts = []; v.riftT = SK.randf(C.riftEvery[0], C.riftEvery[1]); v.collector = null;
    g.props.push({ x: 0, y: 0, ctl: true, update: (g2, pr, dt) => riftTick(g2, dt), draw() {} });
    g.props.push({ x: 0, y: 1e5, rifts: true, draw: ctx => { for (const r of v.rifts) drawRift(ctx, g, r); } });
    const r0 = g.map.rooms[0], m = /^(\d+)-(\d+)$/.exec(st.label || '');
    if (!m) return;
    if (m[2] === '3' || m[2] === '5') { const [x, y] = corner(g, r0, -1); V.placeMerchant(g, x, y); }
    if (st.label === '3-5') { const [x, y] = corner(g, r0, 1); V.placeCollector(g, x, y); }
    const sp = g.map.rooms.find(r => r.type === 'special' && !r.fill);
    if (sp) { const c = [sp.cx * 16 + 8, sp.cy * 16 + 8]; const [x, y] = SK.freeNear([c[0], c[1] - 10]); V.placeBanker(g, x, y); sp.fill = 'void_bank'; }
  });

  // ---------------------------------------------------------------- HUD: Xu Ám Tinh và Mắt Hư Không
  const render0 = SK.hud.render;
  SK.hud.render = function (g) {
    render0(g);
    if (!on(g) || !g.player || !g.map) return;
    const ctx = SK.hudCtx, v = SK.view, k = v.scale * v.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    SK.text(ctx, 'Xu Ám Tinh ' + g.void.xu + '   Mắt Hư Không ' + g.void.eyes, v.w - 6, 46, 9, '#d3b0ff', 'right', 'rgba(0,0,0,0.9)');
  };
})();
