// Mê Trận Tà Vương đợt 3 (G.mode === 'matrix'): Tay Sai Tà Vương (Con Bạc, Thương Nhân, Thầy Bói), thiên phú riêng 2001-2007 + 2117.
// Nguồn: WIKI Matrix "NPCs", LOC mode_loop/npc/*, mode_loop/question/*, Buff_info_2001-2007/2117, WIKI buff 2003/2004/2117,
// config random_objects.start_loop_travel_npc + map_levels.StartRooms (r_start_looptravel_npc trọng số 2), prefab npc_gambler/seller/prophet (tools/extra/matrix.json).
// Chỗ không có số gốc ghi [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, M = SK.matrix;
  if (!M) return;
  const G = SK.G, R = SK.ROOMS, T = 16;
  const on = g => g && g.mode === 'matrix' && g.matrix;
  const C = M.C3 = {
    // Phòng khởi đầu x-1 có NPC: StartRooms trọng số 2 trên tổng 6 (no_event 2, r_start 2, npc 2) [CFG map_levels; tổng suy từ điều kiện loại 0/1] [ƯỚC LƯỢNG]
    npcChance: 1 / 3,
    prophetFromIdx: 15,   // [CFG random_objects] điều kiện loại 0 >= 15: chỉ số ải tính 1-1 = 0, tức từ 4-1 trở đi (điều kiện loại 12 không rõ nghĩa, bỏ qua)
    merchantCost: [1, 3], // [WIKI Matrix] 1~3 Pha Lê; mỗi Thương Nhân bốc sẵn một số khi dựng [ƯỚC LƯỢNG cách bốc]
    prophetCost: 1, banLevels: 5,   // [WIKI Matrix; prefab LoopTravelNpcProphet.banFactorLevelCount = 5]
    gamblerWin: 0.5,      // [WIKI Matrix] 50%
    // thiên phú (số không có nguồn ghi [ƯỚC LƯỢNG])
    healFrac: 0.1, energyFrac: 0.3, energyAdd: 20, energyMax: 10,   // [LOC Buff_info_2001/2002/2007]
    zapChance: 0.2, zapDmg: 3, zapChain: 4, zapReach: 64, zapStunChance: 0.3, zapStun: 2, zapCd: 0.25,   // dmg 3, nảy 4 quái, choáng 2 s [WIKI buff 2003]
    iceChance: 0.2, iceShards: 12, iceDmg: 2, iceFreeze: 0.25, iceCd: 0.4,                                  // 12 gai [WIKI buff 2004]
    blockCd: 8,                                                                                              // [WIKI buff 2117; LOC cd 8]
    exclusiveRate: 0.5     // xác suất một thẻ trong bộ 3 là thiên phú riêng Mê Trận
  };
  M.EXCL = [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2117];
  const pl = () => G.player;
  const has = id => !!(G.player && G.player.buffs && G.player.buffs.indexOf(id) >= 0);
  const say = (t, d) => G.toast(t, d || 2);
  const absIdx = st => ((st.floor || 1) - 1) * 5 + ((st.n || 1) - 1);   // 1-1 = 0
  const kit = () => SK.skillKit || {};

  // ---------------------------------------------------------------- chọn NPC ở phòng khởi đầu x-1
  // rnd(): số ∈ [0,1). Trả 'gambler' | 'seller' | 'prophet' | null. Tầng 1 không có (r_start_looptravel_npc chỉ sau 1-5).
  M.npcPick = function (floor, rnd) {
    rnd = rnd || SK.rand;
    if (M.npcOff || floor < 2 || rnd() >= C.npcChance) return null;   // npcOff: móc kiểm thử, không rút số ngẫu nhiên
    const list = ['gambler', 'seller'];
    if ((floor - 1) * 5 >= C.prophetFromIdx) list.push('prophet');
    return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
  };

  // ---------------------------------------------------------------- hình NPC (prefab gốc)
  // Ba prefab dùng chung tên clip "anim/idle" nên khung hoạt ảnh bị trộn lẫn khi dựng: vẽ khung tĩnh của từng nút (/img, vũ khí, tinh thể).
  function drawNpc(ctx, pf, x, y, t, c1) {
    const nodes = pf ? pf.filter(q => q.f && q.n !== '/collider') : [];
    if (!nodes.length) { ctx.fillStyle = c1; ctx.fillRect(x - 4, y - 14, 8, 14); return; }
    nodes.sort((a, b) => (a.n === '/shadow' ? -1 : 0) - (b.n === '/shadow' ? -1 : 0) || (a.o || 0) - (b.o || 0));
    let ci = 0;
    for (const q of nodes) {
      let ox = q.at ? q.at[0] : 0, oy = q.at ? q.at[1] : 0;
      if (/crystal_\d/.test(q.n)) { const a = t * 1.75 + (ci++) * Math.PI / 3; ox = Math.cos(a) * 16; oy = 14 + Math.sin(a) * 3; }   // Thầy Bói: tinh thể xoay quanh (rotateSpeed 100 độ/s)
      const o = q.sc ? { sx: q.sc[0], sy: q.sc[1] } : undefined;
      SK.draw(ctx, q.f, x + ox, y - oy, o);
    }
  }
  function corner(g, r, sx) {
    const cx = r.cx * T + 8, cy = r.cy * T + 8;
    return SK.freeNear([cx + sx * (r.w / 2 - 2) * T, cy + (r.h / 2 - 2) * T]);
  }

  // ---------------------------------------------------------------- dùng NPC
  const weapon = () => { const p = pl(); return p && p.weapons && p.weapons[p.cur]; };
  M.gamblerCost = g => Math.floor(Math.max(0, g.player.gold) / 2);
  M.gamblerUse = function (g, it, rnd) {
    const p = g.player, m = g.matrix;
    if (it.used) return { ok: false, why: 'used' };
    const cost = M.gamblerCost(g);
    if (cost < 1) { say('Không đủ vàng'); return { ok: false, why: 'poor' }; }
    p.gold -= cost; it.used = true;
    const win = (rnd ? rnd() : SK.rand()) < C.gamblerWin, w = weapon();
    if (win && w) { M.weaponUp(g, w); say('May mắn đấy! Vũ khí lên cấp ' + w.lvl); }
    else {
      SK.dropPickup(g, SK.chance(0.5) ? 'hp_pot' : 'en_pot', p.x + 6, p.y);   // [WIKI Matrix] thất bại: 1 Thuốc viên an ủi (web: bình máu / bình năng lượng)
      say('Thử càng nhiều, cơ hội càng nhiều!');
    }
    m.npcUse = (m.npcUse || 0) + 1;
    SK.emit('matrixNpc', g, 'gambler', { win: !!(win && w), cost });
    return { ok: true, win: !!(win && w), cost };
  };
  M.sellerUse = function (g, it) {
    const m = g.matrix, w = weapon();
    if (it.used) return { ok: false, why: 'used' };
    if (m.crystals < it.cost) { say('Không đủ Pha Lê Tà Vương'); return { ok: false, why: 'poor' }; }
    if (!w) return { ok: false, why: 'noweapon' };
    m.crystals -= it.cost; it.used = true;
    M.weaponUp(g, w);
    say('Vũ khí tốt đấy! Vũ khí lên cấp ' + w.lvl);
    SK.emit('matrixNpc', g, 'seller', { cost: it.cost });
    return { ok: true, cost: it.cost };
  };
  // Thầy Bói: cấm một nhân tố tiêu cực trong banLevels ải kể từ ải kế. Cấm = Tà Vương không bốc được nó ở các phán quyết trong khoảng đó
  // (chưa chặn nhân tố đã mang: web chưa có cách tạm tắt một nhân tố giữa ván).
  M.banned = g => { const b = g.matrix && g.matrix.ban; return b || []; };
  M.isBanned = (g, key, idx) => M.banned(g).some(b => b.key === key && idx > b.from && idx <= b.from + C.banLevels);
  M.prophetUse = function (g, it, st) {
    const m = g.matrix;
    if (it.used) return { ok: false, why: 'used' };
    if (m.crystals < C.prophetCost) { say('Không đủ Pha Lê Tà Vương'); return { ok: false, why: 'poor' }; }
    const idx = absIdx(g.stage || st || { floor: m.floor, n: 1 });
    const cand = M.POOL.neg.filter(k => SK.FACTORS[k] && !M.isBanned(g, k, idx + 1));
    if (!cand.length) { say('Không còn nhân tố nào để cấm'); return { ok: false, why: 'none' }; }
    const key = SK.pick(cand);
    m.crystals -= C.prophetCost; it.used = true;
    (m.ban = m.ban || []).push({ key, from: idx });
    say('Thả lỏng đi nào! Cấm: ' + SK.FACTORS[key].vi);
    SK.emit('matrixNpc', g, 'prophet', { key });
    return { ok: true, key };
  };
  // Phán quyết không bốc nhân tố đang bị cấm (bọc SK.pick là quá rộng: chặn ở bể bằng cách ẩn khỏi SK.FACTORS tạm thời)
  const judge0 = M.judge;
  M.judge = function (g, opts) {
    const m = on(g); if (!m) return null;
    if (m.judged[m.floor]) return m.judged[m.floor];
    const idx = absIdx(g.stage || { floor: m.floor, n: 5 });
    const hide = (m.ban || []).filter(b => M.isBanned(g, b.key, idx)).map(b => b.key);
    const neg0 = M.POOL.neg.slice();
    M.POOL.neg = neg0.filter(k => hide.indexOf(k) < 0);
    try { return judge0.call(this, g, opts); } finally { M.POOL.neg = neg0; }
  };

  // ---------------------------------------------------------------- dựng NPC khi vào ải đầu của tầng
  function place(g, kind, r0, sx) {
    const pf = SK.prefab('npc_' + kind), m = g.matrix;
    const [x, y0] = corner(g, r0, sx), y = y0 + 8;
    const it = { x, y: y + 2, t: SK.rand() * 2, npc: 'matrix_' + kind, used: false };
    if (kind === 'seller') it.cost = SK.randi(C.merchantCost[0], C.merchantCost[1]);
    it.draw = (ctx, g2, pr) => drawNpc(ctx, pf, x, y, g2.t + it.t, kind === 'gambler' ? '#d9a066' : kind === 'seller' ? '#6f9fe0' : '#a07be0');
    g.props.push(it);
    if (R && R.util) R.util.blockRect(g.map, x - 8, y - 12, x + 8, y + 2);
    const name = { gambler: 'Tay Sai Tà Vương - Con Bạc', seller: 'Tay Sai Tà Vương - Thương Nhân', prophet: 'Tay Sai Tà Vương - Thầy Bói' }[kind];
    g.interactables.push({
      x, y: y + 8, r: 28, labelY: 46, npcKind: 'matrix_' + kind, get gone() { return false; },
      get label() {
        if (it.used) return name + ' — đã dùng';
        if (kind === 'gambler') return name + ' — tốn ' + M.gamblerCost(g) + ' vàng thử không?';
        if (kind === 'seller') return name + ' — có ' + g.matrix.crystals + ' Pha Lê Tà Vương, tiêu ' + it.cost + '?';
        return name + ' — có ' + g.matrix.crystals + ' Pha Lê Tà Vương, tiêu ' + C.prophetCost + '?';
      },
      use() { if (kind === 'gambler') M.gamblerUse(g, it); else if (kind === 'seller') M.sellerUse(g, it); else M.prophetUse(g, it); }
    });
    m.npcs = (m.npcs || []); m.npcs.push({ kind, floor: m.floor, item: it });
    return it;
  }
  SK.on('stageEnter', (g, st) => {
    const m = on(g); if (!m || !g.map || st.n !== 1 || !(st.floor >= 2)) return;
    const kind = M.npcForce || M.npcPick(st.floor);
    if (kind) place(g, kind, g.map.rooms[0], 1);
  });

  // ---------------------------------------------------------------- HP trùm theo wiki: Tinh Anh ×1,25, Hai Lãnh Chúa ×0,75
  // [WIKI Matrix] HP trùm = gốc × (1 + 0,15 P) × 1,25 (bản Tinh Anh = Lợi Hại) × 0,75 (nhân tố Hai Lãnh Chúa), ví dụ 1200 → 4500 ở P=20.
  // Web đã nhân sẵn badass.bossHp 1,5 (design.js) và DoubleBoss 0,7 (factors.js), nên ở Mê Trận đổi hai hệ số đó thành 1,25 và 0,75.
  M.bossFix = (badass, duo) => (badass ? 1.25 / ((SK.DS.badass && SK.DS.badass.bossHp) || 1.5) : 1) * (duo ? 0.75 / 0.7 : 1);
  const makeEnemy3 = SK.makeEnemy;
  SK.makeEnemy = function (g, ...args) {
    const e = makeEnemy3.call(this, g, ...args);
    if (e && on(g) && (e.bossKey || e.boss) && !e._m3boss) {
      e._m3boss = true;
      const f = M.bossFix(!!g.badass, !!(g.mods && g.mods.doubleBoss));
      if (f !== 1) { e.hp = Math.max(1, Math.round(e.hp * f)); e.hpMax = Math.max(1, Math.round(e.hpMax * f)); }
    }
    return e;
  };

  // ---------------------------------------------------------------- thiên phú riêng: số liệu hiển thị
  const addDef = (id, o) => { if (R && R.DEF) R.DEF[id] = Object.assign({ active: true }, o); };
  addDef(2001, { note: 'Vào ải kế hồi 10% HP tối đa (tối thiểu 1), không chịu Hiệu Quả Thuốc [LOC Buff_info_2001]' });
  addDef(2002, { note: 'Vào ải kế hồi 30% năng lượng tối đa [LOC Buff_info_2002]' });
  addDef(2003, { note: 'Đánh trúng có xác suất tạo Xích Điện 3 sát thương nảy 4 quái, có xác suất choáng 2 s [WIKI buff 2003]' });
  addDef(2004, { note: 'Đánh trúng có xác suất bắn 12 gai băng xung quanh, gai có xác suất đóng băng [WIKI buff 2004]' });
  addDef(2005, { note: 'Triệt tiêu 1 cấp Uy Áp khỏi kháng khống chế của quái [LOC Buff_info_2005]', apply() { say('Chẳng qua chỉ có thế thôi, haha!'); } });
  addDef(2006, { note: 'Gỡ nhân tố xấu vừa nhận [LOC Buff_info_2006]', apply() { M.begRemove(G); } });
  addDef(2007, { note: 'Năng lượng tối đa +20, cộng dồn 10 lần [LOC Buff_info_2007]', apply(p) { M.energyStack(p); } });
  addDef(2117, { note: 'Mỗi 8 s chống đỡ 1 lần hiệu ứng nguyên tố [LOC Buff_info_2117; WIKI buff 2117]' });

  // 2001, 2002: hồi khi vào ải kế
  SK.on('stageEnter', g => {
    const p = g.player; if (!on(g) || !p) return;
    if (has(2001)) {
      const n = Math.max(1, Math.floor(p.hpMax * C.healFrac)), b = p.hp;
      p.hp = Math.min(p.hpMax, p.hp + n);
      if (p.hp > b) SK.num(g, p.x, p.y - 30, '+' + (p.hp - b), '#ff6b6b');
    }
    if (has(2002)) {
      const n = Math.round(p.energyMax * C.energyFrac), b = p.energy;
      p.energy = Math.min(p.energyMax, p.energy + n);
      if (p.energy > b) SK.num(g, p.x, p.y - 38, '+' + Math.round(p.energy - b), '#5ad0ff');
    }
  });

  // 2007: +20 năng lượng tối đa mỗi lần nhận, tối đa 10 lần (nhận lại được khi đã có, xem inject)
  M.energyStack = function (p) {
    const bm = p.bm || (p.bm = {});
    if ((bm.matEn || 0) >= C.energyMax) return false;
    bm.matEn = (bm.matEn || 0) + 1;
    p.energyMax += C.energyAdd; p.energy = Math.min(p.energyMax, p.energy + C.energyAdd);
    return true;
  };

  // 2005: giảm Uy Áp hiệu dụng của kháng khống chế thêm 1
  const peff0 = M.peff;
  M.peff = g => Math.max(0, peff0(g) - (has(2005) ? 1 : 0));

  // 2006: gỡ nhân tố xấu vừa nhận (phán quyết gần nhất loại 'neg' chưa gỡ; không có thì nhân tố xấu mới nhất đang mang)
  M.begRemove = function (g) {
    const m = on(g); if (!m) return null;
    let key = null;
    for (let i = m.verdicts.length - 1; i >= 0 && !key; i--) { const v = m.verdicts[i]; if (v.kind === 'neg' && v.key && !v.removed) { key = v.key; v.removed = true; } }
    if (!key) { const own = (g.factors || []).filter(k => M.POOL.neg.indexOf(k) >= 0); key = own[own.length - 1]; }
    if (!key) { say('Chẳng có nhân tố xấu để xin tha'); return null; }
    const f = SK.FACTORS[key];
    if (f.stack && SK.factorStack(g, key) > 1) g.factorStack[key]--;
    else { g.factors = g.factors.filter(k => k !== key); if (g.factorStack) delete g.factorStack[key]; }
    SK.factorsOn(g);
    say('Haha, còn tưởng ngươi rất có khí chất chứ! Gỡ: ' + f.vi);
    return key;
  };

  // ---------------------------------------------------------------- 2003 Xích Điện, 2004 Gai Băng (đánh trúng quái)
  const hurtE0 = SK.hurtEnemy;
  let inner = false;
  const alive = e => e && e.st !== 'dead' && e.hp > 0;
  SK.hurtEnemy = function (g, e, dmg, ...rest) {
    const r = hurtE0.call(this, g, e, dmg, ...rest);
    const p = g.player;
    if (r && !inner && on(g) && p && p.buffs && g._skHit !== 'dot' && e && dmg > 0) {
      if (has(2003) && g.t >= (p._m3zap || 0) && SK.rand() < C.zapChance) { p._m3zap = g.t + C.zapCd; inner = true; try { M.zap(g, e); } finally { inner = false; } }
      if (has(2004) && g.t >= (p._m3ice || 0) && SK.rand() < C.iceChance) { p._m3ice = g.t + C.iceCd; M.iceBurst(g, e); }
    }
    return r;
  };
  M.zap = function (g, e) {
    const K = kit(), list = [e], mid = q => [q.x, q.y - 6];
    for (const q of g.enemies) {
      if (list.length > C.zapChain) break;
      if (q === e || !alive(q) || q.noTarget) continue;
      if (Math.hypot(q.x - e.x, q.y - e.y) < C.zapReach) list.push(q);
    }
    for (const q of list) {
      const [qx, qy] = mid(q);
      if (K.boltProp) K.boltProp(g, [qx, qy - 90], [qx, qy], 0.25);
      hurtE0.call(SK, g, q, C.zapDmg, false, Math.atan2(qy - mid(e)[1], qx - mid(e)[0]), 0);
      if (SK.rand() < C.zapStunChance && K.stun) K.stun(q, C.zapStun);
    }
    M.last = { zap: list.length };
    return list;
  };
  M.iceBurst = function (g, e) {
    const K = kit(), a0 = SK.rand() * Math.PI * 2, x = e.x, y = e.y - 6;
    for (let i = 0; i < C.iceShards; i++) {
      const a = a0 + i * Math.PI * 2 / C.iceShards;
      g.props.push({
        x, y, t: 0, shard: true, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, life: 0.7,
        update(g2, pr, dt) {
          pr.t += dt; pr.life -= dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
          if (pr.life <= 0 || SK.world.solidAt(g2.map, pr.x, pr.y)) { pr.gone = true; return; }
          for (const q of g2.enemies) {
            if (!alive(q) || q === e || Math.hypot(q.x - pr.x, (q.y - 6) - pr.y) > 8 * (q.scale || 1) + 2) continue;
            hurtE0.call(SK, g2, q, C.iceDmg, false, Math.atan2(pr.vy, pr.vx), 0);
            if (SK.rand() < C.iceFreeze && K.debuff) K.debuff(g2, q, 'ice');
            pr.gone = true; return;
          }
        },
        draw(ctx, g2, pr) { ctx.fillStyle = '#b9efff'; ctx.fillRect(Math.round(pr.x) - 1, Math.round(pr.y) - 1, 3, 3); }
      });
    }
    M.last = { ice: C.iceShards };
  };

  // ---------------------------------------------------------------- 2117 chống đỡ nguyên tố mỗi 8 s
  const ELEM = /fire|flame|poison|posion|ice|frost|thunder|elec|lightning|plague|gas|burn|shock/i;
  const elemSrc = (g, x, y) => {
    if (x == null || y == null) return null;
    for (const b of g.bullets) if (b.side === 'e' && !b.dead && Math.abs(b.x - x) < 1 && Math.abs(b.y - y) < 1 && (b.elem || ELEM.test(b.v86 || ''))) return b;
    return null;
  };
  const hurtP0 = SK.hurtPlayer;
  SK.hurtPlayer = function (g, dmg, x, y, ...rest) {
    const p = g.player;
    if (on(g) && p && dmg > 0 && has(2117) && g.t >= (p._m3blk || 0) && p.invulT <= 0 && p.st !== 'dead' && elemSrc(g, x, y)) {
      p._m3blk = g.t + C.blockCd;
      SK.num(g, p.x, p.y - 30, 'Chống đỡ', '#9fe6ff', false);
      M.blocked = (M.blocked || 0) + 1;
      return false;
    }
    return hurtP0.call(this, g, dmg, x, y, ...rest);
  };

  // ---------------------------------------------------------------- thẻ thiên phú riêng trong bộ 3 sau x-2 / x-5
  const exOffer = g => {
    const p = g.player, bm = p.bm || {};
    return M.EXCL.filter(id => R.DEF[id] && (id === 2007 ? (bm.matEn || 0) < C.energyMax : !has(id)) &&
      (id !== 2006 || (g.factors || []).some(k => M.POOL.neg.indexOf(k) >= 0)));
  };
  function inject() {
    const ch = R && R.choice;
    if (!ch || !ch.open || !on(G) || !G.player) return false;
    const ex = exOffer(G).filter(id => ch.cards.indexOf(id) < 0);
    if (C.exclusiveRate <= 0 || !ex.length || SK.rand() >= C.exclusiveRate) return false;
    ch.cards[Math.floor(SK.rand() * ch.cards.length)] = SK.pick(ex);
    SK.emit('buffChoice', G, ch.cards.slice());
    return true;
  }
  M.inject = inject;
  SK.on('portalEnter', (g, st) => { if (on(g) && R && R.buffAfter && R.buffAfter(g, st.label)) inject(); });
  if (R && R.reroll) { const rr = R.reroll; R.reroll = function () { const ok = rr.apply(this, arguments); if (ok) inject(); return ok; }; }
  // 2007 đã có mà chọn lại: lõi không nhận lần hai, ta cộng tầng trước khi lõi đóng bảng chọn
  function stackPick(i) {
    const ch = R && R.choice;
    if (!ch || !ch.open || !on(G) || ch.cards[i] !== 2007 || !has(2007)) return;
    if (M.energyStack(G.player)) say('Giới hạn năng lượng +' + C.energyAdd + ' (' + G.player.bm.matEn + '/' + C.energyMax + ')');
  }
  if (R && R.pick) { const pk = R.pick; R.pick = function (i) { stackPick(i); return pk.apply(this, arguments); }; }
  addEventListener('keydown', e => { const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); if (m) stackPick(+m[1] - 1); }, true);

  // đồng hồ chống đỡ trống thì không cần tick: so g.t. Đặt lại khi vào ván mới
  SK.on('runStart', g => { if (g.player) { g.player._m3blk = 0; g.player._m3zap = 0; g.player._m3ice = 0; } });
})();
