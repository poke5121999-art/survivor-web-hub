// Xâm Nhập Hư Không đợt 4 (tiếp js/void.js, js/void2.js): đi tới tầng 4, Vật Tổ, Thương Nhân Rãnh Nứt + dòng thuộc tính vũ khí,
// Nhà Sưu Tầm theo bể gốc, nước uống / Giáp Vàng / hồi dư của Khiên Hư Không, cận chiến theo loại vũ khí đang cầm.
// Nhãn: [WIKI VI] trang Void_Invasion, [WIKI mod] Template:Void_Mode_Weapon_Modifiers_Table, [WIKI buff 3004] trang Void_Shield,
// [CFG ...] config gốc, [LOC ...] chuỗi gốc, [SUY] suy luận, [ƯỚC LƯỢNG] tự đặt (nguồn không ghi số).
(function () {
  'use strict';
  const SK = window.SK, V = SK.voidMode;
  if (!V || !V.C2) return;
  const { C, KINDS, AI, make, on, dist } = V;
  const C3 = {
    // Vật Tổ [WIKI VI "Void Totem"]: máu theo tầng 1/2/3/4; khiên 50 (Hỗn Độn) / 70 (Hủy Diệt) cho quái gần; rơi 38 / 30 Xu
    totemHp: { 2: [100, 200, 300, 300], 3: [150, 300, 450, 450] }, totemShield: { 2: 50, 3: 70 }, totemXu: { 2: 38, 3: 30 },
    totemRate: 0.3, totemRange: 100,            // xác suất phòng quái có Vật Tổ, tầm phủ khiên [ƯỚC LƯỢNG]
    totemVsh: 1,                                // mỗi khiên Vật Tổ bị phá hồi 1 tầng Khiên Hư Không [WIKI VI]
    // Thương Nhân Rãnh Nứt [WIKI VI "Rift Trader"]
    riftOps: { 1: 2, 2: 4, 3: 6 }, swapXu: 20, moveXu: 20, addXu: 100, addFromLevel: 2, upXu: { 1: 30, 2: 50, 3: 80 }, maxMods: 3,
    // Nước uống: tầng 1/2/3/4 hồi 1/2/3/4 tầng khiên [WIKI VI]; chỗ đặt (x-2, x-4, một lần) [ƯỚC LƯỢNG]
    waterGain: [1, 2, 3, 4], waterNs: [2, 4],
    goldenXu: 100, goldenMax: 3,                // Giáp Vàng (34): +1 tầng khiên tối đa mỗi 100 vàng, tối đa 3 [WIKI buff 3004]
    healInvul: 1.5, healInvulPE: 3,             // hồi HP khi còn khiên: bất tử ngắn thay vì hồi, kéo dài hơn với Hiệu Quả Bình Thuốc (12) [WIKI buff 3004; số giây ƯỚC LƯỢNG]
    modRate: [0.25, 0.25, 0.25, 0.25],          // vũ khí vào ván có 0..3 dòng, đều nhau [ƯỚC LƯỢNG]
    meleeCap: 90                                // tầm với tối đa của đòn cận chiến khi tính khiên đỏ [ƯỚC LƯỢNG]
  };
  V.C3 = C3;
  const R = () => SK.ROOMS;
  const P = () => SK.profile;

  // ---------------------------------------------------------------- cận chiến theo loại vũ khí đang cầm
  // Đòn cận chiến lên khiên đỏ = tay không, hoặc đang cầm vũ khí kind 'melee' và đứng trong tầm với [actors.js: def.kind].
  V.isMelee = function (g, e) {
    const p = g.player, w = p && p.weapons[p.cur];
    if (!w) return true;
    return !!(w.def && w.def.kind === 'melee') && dist(p, e) < C3.meleeCap;
  };

  // ---------------------------------------------------------------- tới tầng 4
  // Hạ Hư Không ở 3-5 thì mở cổng tím miễn phí sang 4-1 [WIKI Void: "spawning the portal to level 4 for free"]. Dùng đúng API của chế độ Ải:
  // đặt G.extGo rồi game.js gọi SK.floor4.extend(STAGES) lúc qua cổng.
  const GATE_TOAST = 'Khe Nứt Thời Không đã mở, hãy tiến về tương lai.';
  V.openGate = function (g, x, y) {
    const F4 = SK.floor4, v = g.void;
    if (!F4 || !F4.extend || v.gate || !g.stage || g.stage.ext) return null;
    const [gx, gy] = SK.freeNear([x, y]);
    const gate = v.gate = { x: gx, y: gy, t: 0, gone: false, voidGate: true, update(G2, o, dt) {
      o.t += dt;
      const p = G2.player;
      if (G2.phase !== 'portal' && p.st !== 'dead' && o.t > 0.5 && Math.hypot(p.x - o.x, p.y - o.y) < 14) {
        G2.phase = 'portal'; G2.phaseT = 0; G2.extGo = true;
        SK.emit('portalEnter', G2, G2.stage);
      }
    }, draw(ctx, G2, o) {
      const pf = SK.prefab('transfer_gate_extendedLevel');
      const gr = ctx.createRadialGradient(o.x, o.y - 20, 2, o.x, o.y - 20, 34);
      gr.addColorStop(0, 'rgba(190,80,255,0.45)'); gr.addColorStop(1, 'rgba(120,40,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(o.x - 40, o.y - 60, 80, 80);
      ctx.save(); ctx.imageSmoothingEnabled = true;
      SK.drawPrefab(ctx, pf, o.x, o.y, { t: o.t, state: o.t < 0.6 ? 'create_gate' : 'transfer_gate', scale: 0.5 });
      ctx.restore();
    } };
    g.props.push(gate);
    g.toast(GATE_TOAST, 3);
    SK.emit('voidGate', g, gate);
    return gate;
  };
  SK.on('enemyKill', (g, e) => {
    if (!on(g) || !e.isVoid || e.voidKind !== 'voidboss' || !e.final || !g.stage || g.stage.label !== '3-5') return;
    V.openGate(g, e.x, e.y);
  });
  // Đao Phủ chỉ có ở 4-x (độ 3): vào ải 4-x thì cho vào danh sách Tinh Anh của ván nếu chưa bị hạ [SUY: wiki chỉ ghi "3 Tinh Anh hợp lệ" từ đầu ván].
  function addKiller(g) {
    const v = on(g), st = g.stage;
    if (v && v.tier >= 3 && st && st.ext && v.roster.indexOf('killer') < 0 && v.defeated.indexOf('killer') < 0) v.roster.push('killer');
  }
  SK.on('stageEnter', (g, st) => {
    if (!on(g)) return;
    const v = g.void;
    v.gate = null;
    addKiller(g);
  });

  // ---------------------------------------------------------------- Vật Tổ Hư Không (độ 2-3)
  KINDS.totem = { id: 'e_void_totem', hp: [1], name: 'Vật Tổ Hư Không', elite: false };
  const totemHp = g => { const v = g.void, lv = Math.max(1, Math.min(4, (g.stage && g.stage.level) || 1)); return (C3.totemHp[v.tier] || C3.totemHp[3])[lv - 1]; };
  V.totemXu = g => C3.totemXu[g.void.tier] || C3.totemXu[3];
  SK.CUSTOM_ENEMIES.e_void_totem = (g, x, y, room) => {
    const e = make(g, 'totem', x, y, room, { hp: totemHp(g) });
    e.p.kinematic = 1; e.draw = drawTotem; e.cd = 0;
    return e;
  };
  AI.totem = function (g, e, dt) {
    e.as = 'idle';
    e.cd -= dt;
    if (e.cd > 0) return;
    e.cd = 0.3;
    const S = C3.totemShield[g.void.tier] || C3.totemShield[3];
    for (const o of g.enemies) {
      if (o === e || o.st === 'dead' || o.st === 'spawn' || o.room !== e.room || o.voidKind === 'totem' || o.clone || o.bossKey || o.voidKind === 'voidboss') continue;
      if (o.tsh || o.tshBroken || dist(o, e) > C3.totemRange) continue;
      o.tsh = { hp: S, hpMax: S, owner: e };
    }
  };
  function drawTotem(ctx, g, e) {
    if (e.st === 'spawn') return;
    const dead = e.st === 'dead';
    ctx.save();
    ctx.globalAlpha = dead ? Math.max(0, 1 - e.stT / 0.8) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#3a1f66'; ctx.fillRect(e.x - 6, e.y - 24, 12, 24);
    ctx.fillStyle = '#7a3fd0'; ctx.fillRect(e.x - 8, e.y - 28, 16, 5); ctx.fillRect(e.x - 4, e.y - 13, 8, 3);
    const pulse = 0.5 + 0.5 * Math.sin(g.t * 4);
    ctx.fillStyle = 'rgba(255,122,217,' + (0.6 + 0.4 * pulse) + ')'; ctx.beginPath(); ctx.arc(e.x, e.y - 19, 2.5, 0, Math.PI * 2); ctx.fill();
    if (!dead) {
      ctx.globalAlpha = 0.18 + 0.1 * pulse; ctx.strokeStyle = '#b57bff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 8, C3.totemRange, C3.totemRange * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      const bw = 24, bx = e.x - bw / 2, by = e.y - 36;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = '#e0453a'; ctx.fillRect(bx, by, bw * Math.max(0, e.hp) / e.hpMax, 2);
    }
    ctx.restore();
  }
  // Khiên Vật Tổ trên quái gần: hấp thụ sát thương, vỡ thì (độ 3) hồi 1 tầng Khiên Hư Không; Vật Tổ chết thì khiên biến mất [WIKI VI].
  const clearTsh = (g, owner) => { for (const o of g.enemies) if (o.tsh && o.tsh.owner === owner) o.tsh = null; };
  SK.on('enemyKill', (g, e) => { if (on(g) && e.voidKind === 'totem') clearTsh(g, e); });
  function totemHit(g, e, dmg) {
    const t = e.tsh;
    t.hp -= dmg; e.flash = 0.08;
    SK.num(g, e.x, e.y - e.hb.off[1] - e.hb.size[1] * 0.5 - 4, Math.round(dmg), '#b57bff', false);
    if (t.hp <= 0) {
      e.tsh = null; e.tshBroken = true;
      if (g.void.tier >= 3 && g.player.vsh) V.vshGain(g, C3.totemVsh);
      SK.emit('voidTotemShieldBreak', g, e);
    }
    return true;
  }
  // Bể phòng quái: thêm Vật Tổ vào đợt đầu (độ 2-3, từ ải 1-2) [ƯỚC LƯỢNG xác suất]
  const buildWaves1 = SK.G.buildWaves;
  SK.G.buildWaves = function (r) {
    addKiller(SK.G);   // phòng được dựng lúc sinh bản đồ, trước sự kiện stageEnter
    const waves = buildWaves1.call(SK.G, r), v = on(SK.G);
    if (!v || v.tier < 2 || !waves.length || r.type !== 'battle' || SK.G.stage.label === '1-1') return waves;
    if (SK.chance(C3.totemRate)) waves[0].push(KINDS.totem.id);
    return waves;
  };

  // ---------------------------------------------------------------- dòng thuộc tính vũ khí [WIKI mod; LOC level/weapon_affix_<id>_name]
  // Giai đoạn 1 chỉ làm 5 dòng cắm gọn vào móc sẵn có (MODES.md 2e): Lan 10010, Nhạy 10030, Bạo 10040, Trảm 10060, Của Trời Rơi 10320.
  // Bậc: 0 xanh lá, 1 lam, 2 tím, 3 cam (Huyền Thoại đỏ không đổi / nâng được: chưa có dòng đỏ nào trong 5 dòng này).
  const RAR = ['xanh lá', 'lam', 'tím', 'cam'];
  const MODS = {
    splash: { name: 'Lan', v: [25, 50, 75, 100], text: v => 'nổ lan ' + v + '% sát thương' },
    agility: { name: 'Nhạy', v: [10, 20, 35, 50], text: v => 'tốc đánh +' + v + '%' },
    crit: { name: 'Bạo', v: [10, 15, 25, 40], text: v => 'bạo kích +' + v + '%' },
    execute: { name: 'Trảm', v: [0, 5, 10, 20], boss: [0, 3, 5, 10], min: 1, text: (v, b) => 'kết liễu thường dưới ' + v + '% máu, trùm dưới ' + b + '%' },
    bonanza: { name: 'Của Trời Rơi', v: [1, 2, 3, 4], text: v => 'quái Hư Không rơi thêm ' + v + ' Xu Ám Tinh' }
  };
  V.MODS = MODS; V.RAR = RAR;
  const modText = m => { const d = MODS[m.k]; return d.name + ' (' + RAR[m.r] + '): ' + d.text(d.v[m.r], d.boss && d.boss[m.r]); };
  V.modText = modText;
  V.modsOf = w => (w && w.mods) || [];
  const modVal = (w, k) => { let s = 0; for (const m of V.modsOf(w)) if (m.k === k) s = Math.max(s, MODS[k].v[m.r]); return s; };
  V.modVal = modVal;
  // bốc một dòng mới (khác các dòng đang có), bậc ngẫu nhiên đều nhau trong bậc cho phép [ƯỚC LƯỢNG]
  V.rollMod = function (have, minR) {
    const keys = Object.keys(MODS).filter(k => !(have || []).some(m => m.k === k));
    if (!keys.length) return null;
    const k = SK.pick(keys), d = MODS[k], lo = Math.max(d.min || 0, minR || 0);
    return { k, r: lo + Math.floor(SK.rand() * (4 - lo)) };
  };
  const makeWeapon0 = SK.makeWeapon;
  SK.makeWeapon = function (...a) {
    const w = makeWeapon0.apply(SK, a), g = SK.G;
    if (w && g && g.mode === 'void' && g.void && !w.mods) {
      let n = 0, x = SK.rand();
      for (let i = 0; i < C3.modRate.length; i++) { x -= C3.modRate[i]; if (x < 0) { n = i; break; } }
      w.mods = [];
      for (let i = 0; i < n; i++) { const m = V.rollMod(w.mods); if (m) w.mods.push(m); }
    }
    return w;
  };

  // móc sát thương: khiên Vật Tổ, Bạo (đổ xúc xắc bạo kích), Lan (nổ lan), Trảm (kết liễu). Mọi nguồn hurtEnemy tính theo vũ khí đang cầm [ƯỚC LƯỢNG].
  const hurt3 = SK.hurtEnemy;
  let inMod = false;
  SK.hurtEnemy = function (g, e, dmg, crit, ang, repel) {
    if (!e || !on(g)) return hurt3(g, e, dmg, crit, ang, repel);
    if (e.tsh && e.tsh.hp > 0 && e.st !== 'dead' && e.st !== 'spawn' && !e.hidden) return totemHit(g, e, dmg);
    const p = g.player, w = p && p.weapons[p.cur];
    if (inMod || !w || !w.mods || !w.mods.length) return hurt3(g, e, dmg, crit, ang, repel);
    const cr = modVal(w, 'crit');
    if (cr && !crit && SK.rand() * 100 < cr) { crit = true; dmg = dmg * ((R() && R().critMult) || 2); }
    const was = e.st;
    const ok = hurt3(g, e, dmg, crit, ang, repel);
    if (!ok || was === 'dead' || was === 'spawn') return ok;
    inMod = true;
    try {
      const sp = modVal(w, 'splash');
      if (sp) for (const o of g.enemies) if (o !== e && o.st !== 'dead' && o.st !== 'spawn' && !o.hidden && !o.clone && dist(o, e) < 40) hurt3(g, o, Math.max(1, Math.round(dmg * sp / 100)), false, ang, 0);
      const ex = V.modsOf(w).find(m => m.k === 'execute');
      if (ex && e.st !== 'dead' && e.hp > 0 && !(e.vs && e.vs.stacks > 0) && e.hpMax > 0) {
        const d = MODS.execute, lim = e.bossKey ? d.boss[ex.r] : d.v[ex.r];
        if (e.hp / e.hpMax * 100 < lim) hurt3(g, e, e.hp + 1, false, ang, 0);
      }
    } finally { inMod = false; }
    return ok;
  };
  // Của Trời Rơi: quái Hư Không bị vũ khí này hạ rơi thêm Xu Ám Tinh
  SK.on('enemyKill', (g, e) => {
    if (!on(g) || !e.isVoid || e.clone) return;
    const p = g.player, w = p && p.weapons[p.cur], n = modVal(w, 'bonanza');
    if (n) V.addXu(g, n, e.x, e.y, true);
  });
  // Nhạy: tốc đánh của vũ khí đang cầm (cd tụt nhanh thêm)
  function modTick(g, dt) {
    const p = g.player, w = p && p.weapons[p.cur], a = modVal(w, 'agility');
    if (a && w.cd > 0) w.cd = Math.max(0, w.cd - dt * a / 100);
  }

  // ---------------------------------------------------------------- Thương Nhân Rãnh Nứt [WIKI VI "Rift Trader"]
  // Góc dưới-phải phòng khởi đầu của x-1, x-3, x-5 trừ 1-1. Số thao tác mỗi lần gặp: 2 / 4 / 6 theo độ, làm mới ở lần gặp sau.
  const heldOf = g => { const p = g.player; return p && p.weapons[p.cur]; };
  const SAYR = { none: 'Vũ khí này chưa có dòng nào.', full: 'Đã đủ ' + C3.maxMods + ' dòng.', max: 'Dòng này đã ở bậc cao nhất.', ops: 'Hết lượt trong lần gặp này.',
    poor: 'Xu Ám Tinh không đủ.', other: 'Không có vũ khí kia để chuyển sang.', dup: 'Vũ khí kia đã có dòng này.', early: 'Chỉ thêm được dòng từ ải 2-1.' };
  const riftSel = (g, w) => { const n = V.modsOf(w).length, v = g.void; if (v.riftSel == null || v.riftSel >= n) v.riftSel = 0; return v.riftSel; };
  V.riftOpsLeft = g => g.void.riftOps || 0;
  function riftPay(g, cost) {
    const v = g.void;
    if (!(v.riftOps > 0)) { g.toast(SAYR.ops, 1.6); return false; }
    if (v.xu < cost) { g.toast(SAYR.poor, 1.6); return false; }
    v.xu -= cost; v.xuSpent += cost; v.riftOps--;
    return true;
  }
  V.riftSelect = function (g) {
    const w = heldOf(g), n = V.modsOf(w).length;
    if (!n) { g.toast(SAYR.none, 1.6); return false; }
    g.void.riftSel = (riftSel(g, w) + 1) % n;
    return true;
  };
  V.riftSwap = function (g) {
    const w = heldOf(g), ms = V.modsOf(w), v = g.void;
    if (!ms.length) { g.toast(SAYR.none, 1.6); return false; }
    const i = riftSel(g, w), others = ms.filter((m, j) => j !== i), nm = V.rollMod(others);
    if (!nm || !riftPay(g, C3.swapXu)) return false;
    ms[i] = nm; SK.emit('voidRiftOp', g, 'swap', nm);
    return true;
  };
  V.riftMove = function (g) {
    const p = g.player, w = heldOf(g), ms = V.modsOf(w), w2 = p.weapons[1 - p.cur];
    if (!ms.length) { g.toast(SAYR.none, 1.6); return false; }
    if (!w2) { g.toast(SAYR.other, 1.6); return false; }
    w2.mods = w2.mods || [];
    const i = riftSel(g, w), m = ms[i];
    if (w2.mods.length >= C3.maxMods) { g.toast(SAYR.full, 1.6); return false; }
    if (w2.mods.some(q => q.k === m.k)) { g.toast(SAYR.dup, 1.6); return false; }
    if (!riftPay(g, C3.moveXu)) return false;
    ms.splice(i, 1); w2.mods.push(m); g.void.riftSel = 0;
    SK.emit('voidRiftOp', g, 'move', m);
    return true;
  };
  V.riftAdd = function (g) {
    const w = heldOf(g);
    if (!w) return false;
    w.mods = w.mods || [];
    if (((g.stage && g.stage.level) || 1) < C3.addFromLevel) { g.toast(SAYR.early, 1.6); return false; }
    if (w.mods.length >= C3.maxMods) { g.toast(SAYR.full, 1.6); return false; }
    const m = V.rollMod(w.mods);
    if (!m || !riftPay(g, C3.addXu)) return false;
    w.mods.push(m); SK.emit('voidRiftOp', g, 'add', m);
    return true;
  };
  V.riftUp = function (g) {
    const w = heldOf(g), ms = V.modsOf(w);
    if (!ms.length) { g.toast(SAYR.none, 1.6); return false; }
    const m = ms[riftSel(g, w)];
    if (m.r >= 3) { g.toast(SAYR.max, 1.6); return false; }
    if (!riftPay(g, C3.upXu[m.r + 1])) return false;
    m.r++; SK.emit('voidRiftOp', g, 'up', m);
    return true;
  };
  V.placeRiftTrader = function (g, x, y) {
    const v = g.void;
    v.riftOps = C3.riftOps[v.tier] || C3.riftOps[1];   // lần gặp mới: làm mới số thao tác
    v.riftSel = 0;
    g.props.push({ x, y, npc: 'rift', draw(ctx, g2) { V.robe(ctx, x, y, '#2b3f86', '#7dd0ff', g2); } });
    const mk = (dx, py, label, fn) => {
      const ia = { x: x + dx, y: y + 6 + py, r: 22, labelY: 44 + py, npcKind: 'rift', get label() { return label(); },
        use() { if (V.supportUse) V.supportUse(g, 'rift'); return fn(g); } };
      g.interactables.push(ia);
    };
    const sel = () => { const w = heldOf(g), ms = V.modsOf(w); return ms.length ? ms[riftSel(g, w)] : null; };
    const left = () => ' (còn ' + (v.riftOps || 0) + ' lượt)';
    mk(-26, 0, () => { const m = sel(); return 'Thương Nhân Rãnh Nứt — chọn dòng: ' + (m ? modText(m) : 'chưa có dòng nào') + left(); }, V.riftSelect);
    mk(0, 0, () => 'Thương Nhân Rãnh Nứt — đổi dòng (' + C3.swapXu + ' Xu Ám Tinh)' + left(), V.riftSwap);
    mk(26, 0, () => 'Thương Nhân Rãnh Nứt — chuyển dòng sang vũ khí kia (' + C3.moveXu + ' Xu Ám Tinh)' + left(), V.riftMove);
    mk(-13, 16, () => 'Thương Nhân Rãnh Nứt — thêm dòng (' + C3.addXu + ' Xu Ám Tinh, từ ải 2-1)' + left(), V.riftAdd);
    mk(13, 16, () => { const m = sel(); return 'Thương Nhân Rãnh Nứt — nâng bậc dòng đã chọn (' + (m && m.r < 3 ? C3.upXu[m.r + 1] : '-') + ' Xu Ám Tinh)' + left(); }, V.riftUp);
  };

  // ---------------------------------------------------------------- Nhà Sưu Tầm theo bể gốc [CFG random_objects.void_collector_0: 51 món weight 100]
  // 17 bản vẽ vũ khí + 4 bản vẽ trang trí phòng, 21 hạt giống, phân bón, Vé, 7 mảnh phép thuật [ĐO config]. Mỗi món 1 Mắt Hư Không.
  // Bảo đảm 1 / 2 / 3 bản vẽ theo độ ("bản vẽ hoặc mảnh tiến hóa") cho tới khi người chơi có hết [WIKI VI "Void Collector"].
  // Vé Dùng Thử (material_ticket): kho web chưa có mục này nên không đưa vào bể [SUY].
  const POOL = ['blueprint_weapon_189', 'blueprint_weapon_195', 'blueprint_weapon_223', 'blueprint_weapon_237', 'blueprint_weapon_238', 'blueprint_weapon_294', 'blueprint_weapon_188',
    'blueprint_weapon_211', 'blueprint_weapon_212', 'blueprint_weapon_213', 'blueprint_weapon_242', 'blueprint_weapon_224', 'blueprint_weapon_321', 'blueprint_room_decorate_fishbowl',
    'blueprint_room_decorate_magic_well', 'blueprint_room_decorate_drink_seller', 'blueprint_room_decorate_mysteriou_statue', 'blueprint_weapon_184', 'blueprint_weapon_217',
    'blueprint_weapon_240', 'blueprint_weapon_252', 'plant_carrot_seed', 'plant_gear_flower_seed', 'plant_gem_flower_seed', 'plant_iron_tree_seed', 'plant_shallot_seed', 'plant_tree_seed',
    'plant_vine_seed', 'plant_trumpet_seed', 'plant_binary_tree_seed', 'plant_defend_flower_seed', 'plant_eator_seed', 'plant_heptacolor_seed', 'plant_fantastic_flower_seed',
    'plant_mirror_plane_flower_seed', 'plant_radar_seed', 'plant_strange_flower_seed', 'plant_watermelon_seed', 'plant_banboo_seed', 'plant_cactus_seed', 'plant_magic_flower_seed',
    'plant_gem_tree_seed', 'material_fertilize', 'material_magic_blue', 'material_magic_green', 'material_magic_purple', 'material_magic_red', 'material_magic_black',
    'material_magic_orange', 'material_magic_cyan'];
  V.COLLECTOR_POOL = POOL;
  const isBp = k => /^blueprint_/.test(k);
  const owned = k => { const P0 = P(); return !!P0 && (P0.item(k) > 0 || (isBp(k) && P0.devd(k))); };
  V.collectorName = function (k) {
    const IT = (window.SK_ITEMS || {}).items || {}, F = (window.SK_FORGE || {}).blueprints || {}, DS = SK.DS || {};
    if (IT[k]) return IT[k].vi;
    if (/^blueprint_weapon_/.test(k)) {
      const t = (F[k] && F[k].target) || k.replace(/^blueprint_/, ''), d = DS.weapons && DS.weapons[t];
      return 'Bản Vẽ ' + ((d && (d.name || d.vi)) || t);
    }
    return k;
  };
  V.collectorStock = function (g) {
    const tier = (g.void && g.void.tier) || 1, out = [], left = POOL.slice();
    const take = k => { left.splice(left.indexOf(k), 1); out.push({ kind: 'item', key: k, name: V.collectorName(k) }); };
    for (let i = 0; i < tier; i++) {   // chắc chắn 1/2/3 bản vẽ chưa có
      const c = left.filter(k => isBp(k) && !owned(k));
      if (!c.length) break;
      take(SK.pick(c));
    }
    while (out.length < C.collectorSlots && left.length) take(SK.pick(left));
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(SK.rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }   // xáo vị trí trên bàn
    return out;
  };
  V.collectorBuy = function (g, i) {
    const v = g.void, c = v.collector, it = c && c.stock[i];
    if (!it || it.sold) return false;
    if (v.eyes < C.collectorEye) { g.toast('Mắt Hư Không không đủ.', 1.6); return false; }
    v.eyes -= C.collectorEye; v.eyesSpent += C.collectorEye; it.sold = true;
    P().addItem(it.key, 1);
    SK.num(g, g.player.x, g.player.y - 30, '+1 ' + it.name, '#8fd2ff', false);
    SK.emit('voidCollectorBuy', g, it);
    return true;
  };
  // 4-6 không có ở web: ở tầng 4 đặt Nhà Sưu Tầm tại 4-5 (cuối ải tầng 4) [SUY]
  SK.on('stageEnter', (g, st) => {
    if (!on(g)) return;
    const r0 = g.map.rooms[0], v = g.void;
    if (st.label === '4-5') { const [x, y] = V.corner(g, r0, 0); V.placeCollector(g, x, y); }
    const m = /^(\d+)-(\d+)$/.exec(st.label || '');
    if (m && (m[2] === '1' || m[2] === '3' || m[2] === '5') && st.label !== '1-1') { const [x, y] = V.corner(g, r0, 1); V.placeRiftTrader(g, x, y); }
    // nước uống hồi Khiên Hư Không (độ 3): một cái ở x-2 và x-4, hồi theo tầng 1/2/3/4 [WIKI VI]
    if (v.tier >= 3 && m && C3.waterNs.indexOf(+m[2]) >= 0) {
      const c = [r0.cx * 16 + 8, r0.cy * 16 + 8], [x, y] = SK.freeNear([c[0], c[1] - (r0.h / 2 - 2) * 16]);
      V.placeWater(g, x, y);
    }
  });

  // ---------------------------------------------------------------- nước uống, Giáp Vàng, hồi dư của Khiên Hư Không (3004)
  V.waterGain = g => C3.waterGain[Math.max(1, Math.min(4, (g.stage && g.stage.level) || 1)) - 1];
  V.drinkWater = function (g, d) {
    if (d.used) { g.toast('Máy nước đã hết.', 1.4); return 0; }
    const s = g.player.vsh;
    if (!s) { g.toast('Bạn không có Khiên Hư Không.', 1.4); return 0; }
    d.used = true;
    const n = V.vshGain(g, V.waterGain(g));
    SK.emit('voidWater', g, n);
    return n;
  };
  V.placeWater = function (g, x, y) {
    const d = { used: false };
    g.props.push({ x, y, water: d, draw(ctx, g2) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.used ? '#5a6572' : '#cfe8ff'; ctx.fillRect(x - 6, y - 22, 12, 22);
      ctx.fillStyle = d.used ? '#3d4650' : '#4aa8ff'; ctx.fillRect(x - 5, y - 28, 10, 7);
      ctx.fillStyle = '#243142'; ctx.fillRect(x - 2, y - 12, 4, 3);
    } });
    g.interactables.push({ x, y: y + 6, r: 20, labelY: 44, npcKind: 'water', get gone() { return false; },
      get label() { return d.used ? 'Máy nước uống (đã dùng)' : 'Máy nước uống — hồi ' + V.waterGain(g) + ' tầng Khiên Hư Không'; },
      use() { return V.drinkWater(g, d); } });
    return d;
  };
  SK.on('pickup', (g, kind) => {   // Hiệu Quả Bình Thuốc (12): bình hồi thêm 1 tầng [WIKI buff 3004]
    if (!on(g) || !g.player.vsh || !V.has(g, 3004) || !V.has(g, 12)) return;
    if (/^(hp|en)_pot/.test(kind)) V.vshGain(g, 1);
  });
  function shieldTick(g, dt) {
    const p = g.player, s = p && p.vsh;
    if (!p || p.st === 'dead') return;
    if (s && V.has(g, 34)) {   // Giáp Vàng: +1 tầng khiên tối đa mỗi 100 vàng (tối đa 3)
      s.base = s.base || s.max; s.max = s.base + Math.min(C3.goldenMax, Math.floor((p.gold || 0) / C3.goldenXu));
    }
    // hồi dư: còn khiên thì hồi HP không có tác dụng mà thay bằng bất tử ngắn
    if (s && V.has(g, 3004) && s.stacks > 0 && p._v3 && p._v3.hpMax === p.hpMax && p.hp > p._v3.hp) {
      p.hp = p._v3.hp;
      p.invulT = Math.max(p.invulT || 0, V.has(g, 12) ? C3.healInvulPE : C3.healInvul);
      SK.emit('voidHealInvul', g, p);
    }
    p._v3 = { hp: p.hp, hpMax: p.hpMax };
  }
  SK.on('stageEnter', g => {
    if (!on(g)) return;
    g.props.push({ x: 0, y: 0, ctl: true, update: (g2, pr, dt) => { modTick(g2, dt); shieldTick(g2, dt); }, draw() {} });
  });

  // ---------------------------------------------------------------- HUD: dòng vũ khí đang cầm, lượt Thương Nhân Rãnh Nứt
  const render3 = SK.hud.render;
  SK.hud.render = function (g) {
    render3(g);
    if (!on(g) || !g.player || !g.map) return;
    const ctx = SK.hudCtx, vw = SK.view, k = vw.scale * vw.dpr, ms = V.modsOf(heldOf(g));
    if (!ms.length) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ms.forEach((m, i) => SK.text(ctx, modText(m), vw.w - 6, 70 + i * 10, 8, ['#9be89b', '#7dc4ff', '#c79bff', '#ffb36b'][m.r], 'right', 'rgba(0,0,0,0.9)'));
  };
})();
