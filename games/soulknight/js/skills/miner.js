// Kỹ năng Thợ Mỏ (c24): underground_operations, cart_delivery, sandworm_storm. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số đo từ C25Controller (sk_method.py) và ctrlFields; chiêu phụ của sâu cát (gọi Sâu Khổng Lồ) ở nút special (L).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS;
  const { cfg, CTRL, fx, hit, inRadius, nearest, ec, alive, setMul, hurtMods, ghost, layer, timers, DUR_UI, debuff, aimDir } = K;
  const W = SK.world, U = SK.PPU, T = SK.TILE, I = SK.input;
  const C = (f, d) => CTRL('miner', f, d);   // ctrlFields của C25Controller [ĐO hero.json]
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Sóng xung kích của ExplodeHammer explode_miner_skill0/1/2 [ĐO common.ab]: damage 15, repel 10, critic 50, buff_ele (choáng điện).
  // Bán kính theo hệ số scale của prefab nổ [ĐO RoleSkill0/RoleSkill0End/CreateMinerCarExplode]; đổi ra px: k px cho mỗi đơn vị scale
  // và r mặc định của sâu nhỏ là [ƯỚC LƯỢNG]: vòng nổ của ExplodeHammer không có bán kính trong dữ liệu đã bóc (collider nở theo clip).
  const EXP = { dmg: 15, repel: 10, crit: 50, k: 2.5 * T / 1.5, r: 2.5 * T };
  function shock(G, p, x, y, name, r, dmg, o) {
    fx(G, name || 'explode_miner_skill0', x, y - 2, { scale: (o && o.scale) || 1 });
    G.shake = Math.max(G.shake, 2);
    for (const e of inRadius(G, x, y - 4, r || EXP.r)) {
      hit(G, p, e, dmg != null ? dmg : EXP.dmg, { critChance: EXP.crit, repel: EXP.repel * 0.3, ang: Math.atan2(e.y - y, e.x - x), tag: (o && o.tag) || 'skill' });
      debuff(G, e, 'ele');
      if (o && o.onHit) o.onHit(e);
    }
  }
  const kill = h => { if (h) { if (h.stop) h.stop(); if (h.kill) h.kill(); } };
  const dirt = (G, x, y, n) => { for (let i = 0; i < n; i++) SK.fx(G, 'dust', x + SK.randf(-6, 6), y + SK.randf(-3, 3), { dur: 0.35 }); };
  const dirs = () => { const m = I.moveVec(); return Math.hypot(m.x, m.y) > 0.1 ? Math.atan2(m.y, m.x) : null; };
  const wallAt = (G, x, y) => W.solidAt(G.map, x, y);

  // ================================================================ HÀNH ĐỘNG DƯỚI ĐÂY (skill 0)
  // [ĐO c24/skill 1: loại Prepare (type 2): giữ nút kỹ năng tới maxTime = dur 1,25 s rồi nhả mới chui (SkillInfo.time / maxTime);
  // C25Controller.RoleSkill0: thời gian dưới đất = basicSkill0CastTime 1,5 + extraSkill0Time 1,5 × min(1, giữ/maxTime) (+ 0,2 mỗi cấp,
  // bỏ qua); RoleSkill0 / RoleSkill0End tạo sóng nổ scale basicSizeEnter 0,8 lúc xuống và (basicSizeExit 1,5 + 0,5 × thời gian dưới đất)
  // lúc lên; AttackDig: bấm đánh (cạnh lên của nút) thì lên ngay và nuốt phát bắn đó; không đổi tốc chạy; hole_miner_skill0
  // MinerHoleItem coolDuration 3; maxTunnelNumber 2] + [WIKI]: bất tử dưới đất, để lại hố ở chỗ xuống và chỗ lên, ấn E ở hố thì sang
  // hố cặp. Gốc còn cho quái đang nhắm mình mất mục tiêu (RGEController.LoseTarget, trong 28 đơn vị): chưa làm.
  const HOLE_CD = 3;   // MinerHoleItem.coolDuration [ĐO hole_miner_skill0]
  SK.on('stageEnter', G => { G._minerHoles = []; });
  const holes = G => (G._minerHoles = (G._minerHoles || []).filter(h => !h.gone));
  function makeHole(G, x, y) {
    const h = { gone: false, x, y, cd: 0, partner: null, h: fx(G, 'hole_miner_skill0', x, y, { layer: 'ground', dur: 1e6 }) };
    G._minerHoles = holes(G); G._minerHoles.push(h);
    let was = false;
    G.props.push({ x, y: y + 1, t: 0,
      update(G2, q, dt) {
        if (h.gone) { q.gone = true; return; }
        h.cd = Math.max(0, h.cd - dt);
        const p = G2.player, down = I.down('interact'), edge = down && !was; was = down;
        h.near = p && p.st !== 'dead' && h.partner && !h.partner.gone && Math.hypot(p.x - x, p.y - y) < 14 && !(p.skillT > 0 && p.hero === 'miner' && p._ug && p._ug.phase === 'dig');
        if (edge && h.near && h.cd <= 0 && !G2.interactTarget) {
          const to = h.partner;
          h.cd = to.cd = HOLE_CD;
          p.x = to.x; p.y = to.y; p.invulT = Math.max(p.invulT, 0.3);
          fx(G2, 'explode_miner_skill0', to.x, to.y - 2, { layer: 'ground', scale: 0.5 });
          fx(G2, 'explode_miner_skill0', x, y - 2, { layer: 'ground', scale: 0.5 });
        }
      },
      draw(ctx) { if (h.near && h.cd <= 0) SK.text(ctx, 'E', x, y - 10, 8, '#ffe06a', 'center', '#000'); } });
    return h;
  }
  function linkHoles(G, a, b) {
    a.partner = b; b.partner = a;
    // Tối đa maxTunnelNumber cặp hố cùng lúc [ĐO]: cặp cũ nhất bị lấp.
    const max = C('maxTunnelNumber', 2) * 2, hs = holes(G);
    while (hs.length > max) { const o = hs.shift(); o.gone = true; kill(o.h); if (o.partner) o.partner.partner = null; }
  }
  // Nhả nút (hoặc giữ đủ maxTime) thì chui xuống.
  function dig(G, p, st) {
    st.phase = 'dig'; st.t = 0;
    st.cast = C('basicSkill0CastTime', 1.5) + C('extraSkill0Time', 1.5) * Math.min(1, st.held / st.max);
    st.atk = I.down('attack');
    p.skillT = st.cast;
    p.hidden = true; p.noFire = true;
    hurtMods(p).ug = () => 0;
    st.hole = makeHole(G, p.x, p.y);
    const s = C('basicSizeEnter', 0.8);
    shock(G, p, p.x, p.y, 'explode_miner_skill0', EXP.k * s, null, { scale: s });
    dirt(G, p.x, p.y, 8);
  }
  S.underground_operations = {
    start(G, p) {
      layer(G);
      const st = p._ug = { phase: 'prep', held: 0, t: 0, max: cfg(p, 'underground_operations').dur || 1.25 };
      p.skillT = st.max;
    },
    update(G, p, dt) {
      const st = p._ug; if (!st) return;
      if (st.phase === 'prep') {
        if (I.down('skill') && st.held < st.max) { st.held = Math.min(st.max, st.held + dt); p.skillT = st.max; return; }
        dig(G, p, st);
        return;
      }
      st.t += dt;
      const atk = I.down('attack');
      if (atk && !st.atk) { p._ugHold = true; p.skillT = 1e-4; }
      st.atk = atk;
      if (Math.random() < dt * 14) SK.fx(G, 'dust', p.x + SK.randf(-4, 4), p.y, { dur: 0.25 });
    },
    press(G, p) { const st = p._ug; if (st && st.phase === 'dig' && st.t > 0.1) p.skillT = 1e-4; },   // [WIKI] gõ kỹ năng để lên sớm
    end(G, p) {
      const st = p._ug; p._ug = null;
      if (!st || st.phase !== 'dig') return;
      p.hidden = false; delete hurtMods(p).ug;
      if (!p._ugHold) p.noFire = false;   // lên vì bấm đánh thì giữ khoá tới khi nhả nút (timers.minerFire)
      p.invulT = Math.max(p.invulT, 0.15);
      const s = C('basicSizeExit', 1.5) + 0.5 * st.cast;
      shock(G, p, p.x, p.y, 'explode_miner_skill0', EXP.k * s, null, { scale: s });
      dirt(G, p.x, p.y, 8);
      // Lên cách chỗ xuống quá gần thì không có "hố kia" để sang: bỏ hố lẻ.
      if (Math.hypot(p.x - st.hole.x, p.y - st.hole.y) > 12) linkHoles(G, st.hole, makeHole(G, p.x, p.y));
      else { st.hole.gone = true; kill(st.hole.h); }
    }
  };
  DUR_UI.underground_operations = 3;   // 1,5 + 1,5 khi giữ đủ
  timers.minerFire = (G, p) => { if (p._ugHold && !I.down('attack')) { p._ugHold = false; p.noFire = false; } };

  // ================================================================ GIAO HÀNG XE KHOÁNG (skill 1)
  // [ĐO c24/skill 2: cd 10; C25Controller.Skill1Update: tốc xe skill1StartSpeed 15 đơn vị/s, +skill1SpeedAdd 5 mỗi giây, tối đa maxSpeed 30;
  // sát thương tông = clamp(ProcessSkillDamage((tốc − 15) / 15 × 15), 5, 20) cập nhật mỗi khung; giáp hồi 1 mỗi khi tích
  // Δt × (tốc / maxSpeed) × armorRestoreSpeed 1,5 đạt 0,5; Phòng Thủ +1 mỗi defenceAddSpeed 2 s (gỡ khi xuống xe); TurnDirectionOnCollide:
  // đâm tường thì bật lại, xe nổ (CreateMinerCarExplode, scale = clamp(tốc / maxSpeed × 1,5, 1, 1,5), damage 15 của explode_miner_skill1) và
  // bỏ qua va chạm 0,1 s; GetHurt lúc đang lái cũng làm xe nổ; RoleSkill1End: tốc ≥ maxSpeed thì hồi nửa giáp đã mất (RestoreHalfLostArmor),
  // nhảy xuống khi còn thời gian thì xe tiếp tục chạy tự động (InitAutoMinerCar, carAutoStopTime = thời gian còn lại) rồi biến mất, không nổ;
  // miner_car_bullet MinerCarCollision critical 100 + buff_ele]. Tốc xe tính theo đơn vị Unity × 16 px.
  // Nhịp tông trên cùng một quái, tầm chạm, quãng nhảy xuống (endSkill1Force 30 là lực, không đo được ra px) là [ƯỚC LƯỢNG].
  const CAR = { every: 0.35, r: 12, hop: 2 * T, ign: 0.1, dmgMin: 5, dmgMax: 20, dmgK: 15, defWait: 2 };
  const CAR_SPR = [2, 1, 0, 7, 6, 5, 4, 3];   // MinerCar.carSprites: thứ tự khung theo 8 hướng bắt đầu từ +X quay xuống [ĐO]
  const carFrame = ang => {
    const i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    return 'miner_car_' + CAR_SPR[i];
  };
  const carDmg = spd => clamp(Math.round((spd - C('skill1StartSpeed', 15)) / C('skill1StartSpeed', 15) * CAR.dmgK), CAR.dmgMin, CAR.dmgMax);
  // Xe nổ: sóng 15 quanh xe, bán kính theo scale [ĐO]; đổi ra px bằng EXP.k.
  function carBlast(G, p, x, y, v) {
    const s = clamp(v / U / C('maxSpeed', 30) * 1.5, 1, 1.5);
    shock(G, p, x, y, 'explode_miner_skill1', EXP.k * s, null, { scale: s });
  }
  // Va tường: bật lại theo trục bị chặn. Trả true nếu chạm.
  function carMove(G, obj, ang, v, dt, r) {
    const bx = SK.moveBox(G.map, obj, Math.cos(ang) * v * dt, 0, r), by = SK.moveBox(G.map, obj, 0, Math.sin(ang) * v * dt, r);
    let a = ang;
    if (bx) a = Math.PI - a;
    if (by) a = -a;
    return { bx, by, ang: a };
  }
  function carHit(G, p, c, dmg, ang) {
    for (const e of inRadius(G, c.x, c.y - 6, CAR.r)) {
      if ((c.hits.get(e) || 0) > G.t) continue;
      c.hits.set(e, G.t + CAR.every);
      hit(G, p, e, dmg, { critChance: 100, repel: C('carRepel', 10) * 0.3, ang, tag: 'cart', fx: 'hit_grey' });
      debuff(G, e, 'ele');
    }
  }
  S.cart_delivery = {
    start(G, p) {
      layer(G);
      const dir = I.moveVec(), a = Math.hypot(dir.x, dir.y) > 0.1 ? Math.atan2(dir.y, dir.x) : aimDir(p);
      const st = p._cart = { ang: a, v: C('skill1StartSpeed', 15) * U, max: C('maxSpeed', 30) * U, hits: new Map(), arm: 0, defT: 0, def: 0, ign: 0, dmg: CAR.dmgMin, blasts: 0, left: 0, x: p.x, y: p.y };
      p.skillT = C('skill1CastTime', 6);
      setMul(p, 'moveMul', 'cart', 0.001);
      hurtMods(p).cart = (G2, pl, dmg) => {
        const s = pl._cart;
        if (!s) return dmg;
        s.blasts++; carBlast(G2, pl, pl.x, pl.y, s.v);
        return Math.max(1, dmg - s.def);
      };
      dirt(G, p.x, p.y, 5);
    },
    update(G, p, dt) {
      const st = p._cart; if (!st) return;
      if (p.skillT > 1e-3) st.left = p.skillT;   // press() đặt 1e-4: giữ thời gian còn lại của khung trước
      st.v = Math.min(st.max, st.v + C('skill1SpeedAdd', 5) * U * dt);
      const spd = st.v / U;
      st.dmg = carDmg(spd);
      st.ign -= dt;
      const m = carMove(G, p, st.ang, st.v, dt, p.h.body.r);
      if ((m.bx || m.by) && st.ign <= 0) {
        st.ang = m.ang; st.ign = CAR.ign; st.blasts++;
        carBlast(G, p, p.x, p.y, st.v);
        SK.fx(G, 'dust', p.x, p.y, { dur: 0.3 });
      }
      st.arm += dt * (spd / C('maxSpeed', 30)) * C('armorRestoreSpeed', 1.5);
      if (st.arm >= 0.5) { st.arm = 0; if (p.armor < p.armorMax) p.armor++; }
      st.defT += dt;
      if (st.defT > C('defenceAddSpeed', 2)) { st.defT = 0; st.def++; }
      st.x = p.x; st.y = p.y;
      carHit(G, p, st, st.dmg, st.ang);
      p._liftY = 3;
      if (Math.random() < dt * 30) SK.fx(G, 'dust', p.x - Math.cos(st.ang) * 8, p.y, { dur: 0.25 });
    },
    press(G, p) { p.skillT = Math.min(p.skillT, 1e-4); },
    end(G, p) {
      const st = p._cart; p._cart = null;
      delete hurtMods(p).cart; setMul(p, 'moveMul', 'cart', 1); p._liftY = 0;
      if (!st) return;
      if (st.v >= st.max) {
        const n = Math.ceil((p.armorMax - p.armor) / 2);
        if (n > 0) { p.armor += n; SK.num(G, p.x, p.y - 30, '+' + n, '#7fd3ff'); K.healFx(G, p); }
      }
      if (st.left > 0.05) autoCar(G, p, st);
      // Nhảy xuống theo phím đang giữ [ĐO endSkill1Force 30 → trượt ngắn].
      const d = dirs(); const a = d != null ? d : st.ang;
      SK.moveBox(G.map, p, Math.cos(a) * CAR.hop, Math.sin(a) * CAR.hop, p.h.body.r);
      p.invulT = Math.max(p.invulT, 0.2);
    }
  };
  DUR_UI.cart_delivery = 6;
  // Xe tự chạy sau khi nhảy xuống (MinerCar.isAuto): tăng tốc tới maxSpeed, đâm tường thì bật + nổ, hết thời gian thì biến mất.
  function autoCar(G, p, st) {
    const c = { x: p.x, y: p.y, ang: st.ang, v: st.v, t: st.left, hits: new Map(), ign: 0, auto: true };
    (G._minerCars = (G._minerCars || []).filter(q => !q.gone)).push(c);
    G.props.push({ x: c.x, y: c.y + 1, t: 0,
      update(G2, q, dt) {
        c.t -= dt;
        if (c.t <= 0) { q.gone = c.gone = true; return; }
        c.v = Math.min(st.max, c.v + C('skill1SpeedAdd', 5) * U * dt);
        c.ign -= dt;
        const m = carMove(G2, c, c.ang, c.v, dt, p.h.body.r);
        if ((m.bx || m.by) && c.ign <= 0) { c.ang = m.ang; c.ign = CAR.ign; carBlast(G2, p, c.x, c.y, c.v); }
        carHit(G2, p, c, carDmg(c.v / U), c.ang);
        q.x = c.x; q.y = c.y + 1;
      },
      draw(ctx) { const f = carFrame(c.ang); if (SK.frame(f)) SK.draw(ctx, f, c.x, c.y + 4); } });
  }

  // ================================================================ SÂU CÁT TẤN CÔNG (skill 2)
  // [ĐO C25Controller.RoleSkill2 / TakeSandWorm / Skill2Limit: mỗi lần sâu = một vòng lặp chờ _sandWormCreateDuration (bắt đầu
  // sandWormCreateStartDuration 1,25, sàn sandWormMinDuration 0,0875); mỗi 1 s: thời gian chờ −sandWormNumberAddSpeed 0,02 và tầm
  // +sandWormRangeAddSpeed 0,25 (trần sandWormMaxRange 8, bắt đầu sandWormStartRange 4); vị trí sâu ngẫu nhiên trong đĩa bán kính "tầm"
  // quanh Thợ Mỏ, con thứ sandWormFocusInterval 5, 10... nhắm vào một quái; năng lượng: mỗi 1,5 s trừ mức tiêu hiện tại (bắt đầu
  // sandWormEnergyStartCost 0), mỗi 2 s mức tiêu +sandWormEnergyAddCost 1 tới 20; thiếu năng lượng cho mức tiêu thì tắt;
  // sâu cắn ghi wormAtkAddPassiveEnergy 3 vào thanh (tối đa skill2MaxPassiveEnergy 200), không ghi khi đang ở chế độ Khổng Lồ.
  // Nút special (HyperSkill2 → StartHyperPassiveEnergyCost) khi thanh đầy: vào chế độ Khổng Lồ skill1GiantWormTime 6 s, thanh xả đều
  // về 0, tốc chạy +skill3HyperMoveSpeedAdd 2 (trên speed 6,5 của RoleAttributePlayer), gọi Sâu Khổng Lồ ngay rồi lặp mỗi 1,25 s
  // (_hyperGiantWormInterval trong .ctor); sát thương = giantWormDamage 19 + 5 × (số lần vào chế độ Khổng Lồ − 1) trong cả ván
  // (BattleData minerSkill2GiantWormReleaseCount); Sâu Khổng Lồ luôn trồi ngay tại chỗ Thợ Mỏ đứng lúc gọi, nổ sau giantWormLaunchDelay 0,5 s
  // với bán kính = 3 × sâu nhỏ (_giantWormDamageRangeScale = MinerSandWorm 3); người trong _giantWormLaunchRange 4 đơn vị quanh tâm bị hất
  // ra xa tâm theo hướng từ tâm tới họ (đứng ngay tâm thì theo hướng phím/ngắm [ƯỚC LƯỢNG]), quãng 4 + 4 × (khoảng cách / 4) đơn vị,
  // bay 0,5 s, 2-4 sâu nhỏ dọc đường bay, đáp xuống nổ jumpEndDamage 10 trong jumpEndDamageRange 2].
  // [ƯỚC LƯỢNG]: bán kính sâu nhỏ (nổ ExplodeHammer), độ trễ cắn sau khi trồi (sự kiện anim của prefab sâu), độ cao vòng bay.
  const SW = { worm: 2 * T, wormT: 0.3, giantK: 3, flyT: 0.5, lift: 26, hyperGap: 1.25, launchR: 4 * U, flyMin: 4 * U, flyMax: 8 * U,
    addT: 1, costT: 1.5, costAddT: 2, costMax: 20, speed: 6.5 };
  const swMax = () => C('skill2MaxPassiveEnergy', 200);
  function endHyper(p, st) {
    st.hyper = false; st.gauge = 0;
    setMul(p, 'moveMul', 'swHyper', 1);
  }
  // Sâu nhỏ mới: chỗ trồi ngẫu nhiên trong đĩa bán kính `range`, hoặc ở một quái (mỗi sandWormFocusInterval con).
  function take(G, p, st) {
    st.n++;
    const range = st.range * U;
    let x = null, y = null;
    if (st.n % C('sandWormFocusInterval', 5) === 0) {
      const es = inRadius(G, p.x, p.y - 6, range);
      if (es.length) [x, y] = ec(es[SK.randi(0, es.length - 1)]);
    }
    if (x == null) for (let k = 0; k < 10; k++) {
      const a = SK.rand() * Math.PI * 2, d = Math.sqrt(SK.rand()) * range;
      x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d;
      if (!wallAt(G, x, y)) break;
    }
    if (!wallAt(G, x, y)) worm(G, p, st, x, y + 4, false);
  }
  S.sandworm_storm = {
    start(G, p) {
      layer(G);
      p.skillT = 3600;   // bật tắt bằng tay [ĐO info]
      p._sw = { t: 0, n: 0, spawnT: 0, addT: SW.addT, costT: SW.costT, costAddT: SW.costAddT, gauge: 0, hyper: false, hyperT: 0, giantT: 0, dmg: 0, fly: null,
        dur: C('sandWormCreateStartDuration', 1.25), range: C('sandWormStartRange', 4), cost: C('sandWormEnergyStartCost', 0) };
      dirt(G, p.x, p.y, 5);
    },
    update(G, p, dt) {
      const st = p._sw; if (!st) return;
      st.t += dt;
      st.addT -= dt;
      if (st.addT <= 0) { st.addT += SW.addT; st.dur -= C('sandWormNumberAddSpeed', 0.02); st.range += C('sandWormRangeAddSpeed', 0.25); }
      st.costT -= dt;
      if (st.costT <= 0) { st.costT += SW.costT; p.energy = Math.max(0, p.energy - st.cost); }
      st.costAddT -= dt;
      if (st.costAddT <= 0) { st.costAddT += SW.costAddT; st.cost = clamp(st.cost + C('sandWormEnergyAddCost', 1), 0, SW.costMax); }
      st.spawnT -= dt;
      if (st.spawnT <= 0) {
        take(G, p, st);
        st.range = Math.min(C('sandWormMaxRange', 8), st.range);
        st.dur = Math.max(C('sandWormMinDuration', 0.0875), st.dur);
        if (p.energy < st.cost) { p.skillT = 1e-4; SK.num(G, p.x, p.y - 30, 'Hết năng lượng', '#8a95a8'); return; }
        st.spawnT = st.dur;
      }
      if (st.hyper) {
        st.hyperT -= dt;
        st.gauge = swMax() * Math.max(0, st.hyperT) / C('skill1GiantWormTime', 6);
        st.giantT -= dt;
        if (st.giantT <= 0) { st.giantT += SW.hyperGap; giant(G, p, st); }
        if (st.hyperT <= 0) endHyper(p, st);
      }
      p._ultReady = st.hyper || st.gauge >= swMax();
      if (st.fly) flight(G, p, st, dt);
    },
    // Nút special: thanh đầy thì vào chế độ Khổng Lồ.
    special(G, p) {
      const st = p._sw;
      if (!st || st.hyper || st.gauge < swMax()) return;
      st.hyper = true; st.hyperT = C('skill1GiantWormTime', 6); st.giantT = 0;
      G._minerRel = (G._minerRel || 0) + 1;
      st.dmg = C('giantWormDamage', 19) + C('giantWormDamageAddPerRelease', 5) * (G._minerRel - 1);
      setMul(p, 'moveMul', 'swHyper', 1 + C('skill3HyperMoveSpeedAdd', 2) / SW.speed);
    },
    press(G, p) { p.skillT = Math.min(p.skillT, 1e-4); },
    end(G, p) {
      const st = p._sw; p._sw = null;
      p._ultReady = false;
      if (st) { setMul(p, 'moveMul', 'swHyper', 1); if (st.fly) { st.fly = null; landed(G, p); } }
      p._liftY = 0; ghost(p, false); delete hurtMods(p).worm;
    }
  };
  // Sâu cát: chui lên, cắn (nổ) sau SW.wormT, sát thương tích năng lượng cho thanh Khổng Lồ.
  function worm(G, p, st, x, y, big, dmg, r) {
    fx(G, big ? 'miner_sandworm_giant' : 'miner_sandworm', x, y, { layer: 'ground' });
    dirt(G, x, y, big ? 12 : 6);
    G.props.push({ x, y: -1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt;
        if (q.t < SW.wormT) return;
        q.gone = true;
        shock(G2, p, x, y - 4, 'explode_miner_skill2', r || SW.worm, dmg != null ? dmg : EXP.dmg, {
          tag: big ? 'giant' : 'worm',
          onHit() { const s = p._sw; if (s && !s.hyper) s.gauge = Math.min(swMax(), s.gauge + C('wormAtkAddPassiveEnergy', 3)); }
        });
      } });
  }
  // Sâu Khổng Lồ tại chỗ Thợ Mỏ đứng lúc gọi; sau giantWormLaunchDelay nổ và hất bay người trong tầm.
  function giant(G, p, st) {
    const x = p.x, y = p.y, dmg = st.dmg, delay = C('giantWormLaunchDelay', 0.5), r = SW.worm * SW.giantK;
    G.props.push({ x, y: y + 1, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        if (q.t < delay) return;
        q.gone = true;
        worm(G2, p, st, x, y, true, dmg, r);
        if (p._sw === st && !st.fly && Math.hypot(p.x - x, p.y - y) <= SW.launchR) launch(G2, p, st, x, y);
      },
      draw(ctx, G2, q) {
        // WarnArea giantWormLaunchRange: vòng báo vùng hất bay.
        const k = Math.min(1, q.t / delay), a = 0.25 + 0.25 * Math.sin(q.t * 24);
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y, SW.launchR * (0.6 + 0.4 * k), SW.launchR * (0.6 + 0.4 * k) * 0.7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      } });
  }
  // Bay theo cung: bất tử, sâu nhỏ mọc theo đường bay, đáp xuống nổ jumpEndDamage [ĐO BuildGiantWormLaunchPlans].
  function launch(G, p, st, cx, cy) {
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    const ang = d > 0.001 * U ? Math.atan2(dy, dx) : aimDir(p);
    let dist = SW.flyMin + (SW.flyMax - SW.flyMin) * Math.min(1, d / SW.launchR);
    while (dist > 0 && wallAt(G, p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist)) dist -= T / 2;
    st.fly = { t: 0, from: [p.x, p.y], to: [p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist], n: 0, want: SK.randi(C('giantWormFlightSmallWormCountMin', 2), C('giantWormFlightSmallWormCountMax', 4)) };
    ghost(p, true); hurtMods(p).worm = () => 0;
  }
  function flight(G, p, st, dt) {
    const f = st.fly; f.t += dt;
    const k = Math.min(1, f.t / SW.flyT);
    p.x = f.from[0] + (f.to[0] - f.from[0]) * k; p.y = f.from[1] + (f.to[1] - f.from[1]) * k;
    p._liftY = Math.sin(k * Math.PI) * SW.lift;
    if (f.n < f.want && k >= (f.n + 1) / (f.want + 1)) { f.n++; worm(G, p, st, p.x + SK.randf(-10, 10), p.y + SK.randf(-6, 6), false); }
    if (k >= 1) { st.fly = null; landed(G, p); }
  }
  function landed(G, p) {
    p._liftY = 0; ghost(p, false); delete hurtMods(p).worm;
    if (p.invulT < 0.3) p.invulT = 0.3;
    shock(G, p, p.x, p.y, 'explode_miner_skill1', C('jumpEndDamageRange', 2) * U, C('jumpEndDamage', 10), { tag: 'skill' });
  }

  // ---------------------------------------------------------------- vẽ thêm lên Thợ Mỏ: xe khoáng, gò đất dưới đất, thanh Sâu Khổng Lồ
  const drawPlayer0 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player;
    if (!p || p.hero !== 'miner') return drawPlayer0(ctx, G);
    if (p._ug && p._ug.phase === 'dig') {
      // Dưới đất: chỉ thấy đất phồng chạy theo [ĐO SK: nhân vật ẩn, để lại vệt đất].
      ctx.save(); ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a6238'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 2, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return;
    }
    if (p._cart) {
      const f = carFrame(p._cart.ang);
      if (SK.frame(f)) SK.draw(ctx, f, p.x, p.y + 4);
    }
    drawPlayer0(ctx, G);
    const st = p._sw;
    if (st && p.skillT > 0) {
      const w = 18, x = Math.round(p.x - w / 2), y = Math.round(p.y - 30 - (p._liftY || 0)), max = swMax();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = st.hyper || st.gauge >= max ? '#ffb43c' : '#c9a15a'; ctx.fillRect(x, y, Math.round(w * st.gauge / max), 2);
    }
  };
})();
