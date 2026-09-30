// Kỹ năng Thương Khách (c29): dragon_lance, thunder_presence, lance_doctrine. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ ctrlFields của C30Controller (data/sk-skills86.js) và MonoBehaviour của prefab đạn (bullet.json / common.json) [ĐO];
// thứ không có trong dữ liệu (tầm, tốc, thời gian giữa hai đòn) ghi [ƯỚC LƯỢNG]. Đơn vị Unity 1 = 1 ô = 16 px.
// Nội tại Đấu Chí (buff 2145: năng lượng → trạng thái Nổ Giận) nằm trong C30Controller cùng chỗ với các đòn nên dựng ở đây,
// tắt được bằng SK.passiveOn. Chưa làm: chế độ "Master" (MasterContinuousSlash/MasterShotgunSlash) và thanh angry_energy_ui thật.
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, I = SK.input;
  const { alive, ec, hit, fx } = K;
  const BODY = 7;                                     // tâm thân cách chân [ƯỚC LƯỢNG]
  const rad = d => d * Math.PI / 180;
  const C = (f, d) => K.CTRL('lancer', f, d);         // ctrlFields của C30Controller
  const solid = (G, x, y) => W.solidAt(G.map, x, y);
  const setFace = (p, a) => { if (Math.abs(Math.cos(a)) > 0.1) p.face = Math.cos(a) > 0 ? 1 : -1; };
  const on = p => p.hero === 'lancer' && (SK.passiveOn ? SK.passiveOn(p) : true);
  const ln = p => p._ln || (p._ln = { energy: 0, angry: 0, charge: 0, armed: false, state: 0, resetT: 0, lightT: 0, combo: null, spears: [], spirits: [] });

  // ---------------------------------------------------------------- nội tại: năng lượng → Nổ Giận
  // [ĐO ctrlFields] mỗi đòn vũ khí +AttackAddEnergyValue 2, mỗi lần dùng kỹ năng +SkillAddEnergyValue 6; đủ AngryEnergyEnoughToExplode 100
  // thì vào trạng thái AngryStateTime 15 s: chí mạng +30, tốc đánh +0.3, chiêu dùng số sát thương "Angry".
  const AN = { atk: 2, skill: 6, full: 100, t: 15, crit: 30, rate: 0.3 };
  const angry = p => on(p) && ln(p).angry > 0;
  function addEnergy(G, p, n) {
    const s = ln(p);
    if (!on(p) || s.angry > 0) return;
    s.energy = Math.min(AN.full, s.energy + n);
    if (s.energy < AN.full) return;
    s.energy = 0; s.angry = AN.t;
    p.crit = (p.crit || 0) + AN.crit; K.setMul(p, 'rateMul', 'lancer', 1 + AN.rate);
    fx(G, 'angry_effect', p.x, p.y, { follow: p, dur: AN.t });
  }
  K.timers.lancer = (G, p, dt) => {
    if (p.hero !== 'lancer') return;
    const s = ln(p);
    if (s.angry > 0 && (s.angry -= dt) <= 0) { s.angry = 0; p.crit -= AN.crit; K.setMul(p, 'rateMul', 'lancer', 1); }
    if (s.combo && (s.combo.t -= dt) <= 0) s.combo = null;
    thunderTick(G, p, dt);
  };
  SK.on('fire', (G, p) => { if (p && p.hero === 'lancer') { addEnergy(G, p, AN.atk); thunderFire(G, p); } });

  // ---------------------------------------------------------------- tiện ích
  function guard(p, on_) {
    if (on_) { K.ghost(p, true); K.hurtMods(p).ln = () => 0; return; }
    delete K.hurtMods(p).ln; K.ghost(p, false); p._liftY = 0;
  }
  function slide(G, p, ang, spd, dt) {
    const mv = I.moveVec(), w = p.h.speed * SK.PPU * (p.moveMul || 1) * dt;
    SK.moveBox(G.map, p, Math.cos(ang) * spd * dt - mv.x * w, Math.sin(ang) * spd * dt - mv.y * w, p.h.body.r);
  }
  function segHit(G, p, x0, y0, x1, y1, w, dmg, seen, o) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    let n = 0;
    for (const e of G.enemies) {
      if (!alive(e) || (seen && seen.has(e))) continue;
      const [cx, cy] = ec(e), u = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L2));
      if (Math.hypot(cx - (x0 + dx * u), cy - (y0 + dy * u)) < w / 2 + e.r) {
        if (seen) seen.add(e);
        hit(G, p, e, dmg, Object.assign({ critChance: p.crit, ang: Math.atan2(dy, dx), repel: 2, fx: 'hit_blue2' }, o));
        if (o && o.after) o.after(e);
        n++;
      }
    }
    return n;
  }
  function coneHit(G, p, ang, r, half, dmg, seen, o) {
    let n = 0;
    for (const e of G.enemies) {
      if (!alive(e) || (seen && seen.has(e))) continue;
      const [cx, cy] = ec(e), d = Math.hypot(cx - p.x, cy - (p.y - BODY));
      if (d > r + e.r) continue;
      let da = Math.atan2(cy - (p.y - BODY), cx - p.x) - ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d > 8 && Math.abs(da) > half) continue;
      if (seen) seen.add(e);
      hit(G, p, e, dmg, Object.assign({ critChance: p.crit, ang, repel: 2, fx: 'hit_blue2' }, o));
      if (o && o.after) o.after(e);
      n++;
    }
    return n;
  }
  function aimTo(G, p, range) {
    const t = K.targetAng(G, p, range);
    return { ang: t.ang, e: t.e, d: t.e ? Math.hypot(ec(t.e)[0] - p.x, ec(t.e)[1] - (p.y - BODY)) : Infinity };
  }
  // Hướng đi (không thì hướng ngắm): "Lao về phía di chuyển".
  function moveAng(p) {
    const mv = I.moveVec();
    return Math.hypot(mv.x, mv.y) > 0.1 ? Math.atan2(mv.y, mv.x) : (p.target ? p.aim : (p.face > 0 ? 0 : Math.PI));
  }
  const shock = e => { K.debuff(SK.G, e, 'ele'); K.debuff(SK.G, e, 'dizzy'); };   // "cảm điện và choáng"
  // Đạn bay thẳng của kỹ năng: vfx đi theo, trúng mỗi quái một lần (pierce), dừng ở tường / hết tầm.
  function proj(G, p, o) {
    const s = { x: o.x, y: o.y, d: 0, seen: new Set(), h: null };
    if (o.fx) s.h = fx(G, o.fx, s.x, s.y, { follow: s, ang: o.ang, scale: o.scale, dur: 30 });
    G.props.push({ x: s.x, y: s.y, update(G2, q, dt) {
      const step = o.v * dt;
      s.x += Math.cos(o.ang) * step; s.y += Math.sin(o.ang) * step; s.d += step; q.x = s.x; q.y = s.y;
      segHit(G2, p, s.x - Math.cos(o.ang) * step, s.y - Math.sin(o.ang) * step, s.x, s.y, o.w, o.dmg, s.seen, { after: o.after, repel: o.repel == null ? 2 : o.repel });
      if (s.d >= o.range || solid(G2, s.x, s.y)) { q.gone = true; K.stopFx(s.h); }
    }, draw() {} });
    return s;
  }

  // ================================================================ 1. Đấu Trận Thương Thuật (dragon_lance)
  // Ba chiêu theo lượt (config max 3, cd 6, dur 2 = thời gian Loạn Vô Song) [ĐO]:
  //  1 Thiên Long Trụy: nhảy jumpTime 0.25 s tới quái (TargetJumpDistance 9 ô, không có quái NormalJumpDistance 6), hạ xuống gây
  //    JumpDmgValue 4 (nổ giận JumpAngryDmgValue 6) + điện (ExplodeHammer targetbuff buff_ele), bán kính scale_factor 1.5;
  //  2 Loạn Vô Song: dur 2 s chạy nhanh +RotateAddSpeed 0.2, thương xoay (bullet_rotate_spear) RotateDmgValue 3 (nổ giận 4),
  //    cứ WindInterval 1.6 s tung gió xoáy (whirl_wind) WindDmgValue 4;
  //  3 Phi Thương Quyết: sóng chém bay SlashDmgValue 12 (nổ giận 15) tốc SlashBulletSpeed 24 ô/s, kèm ThrowSpearCount 2 thương
  //    lệch ThrowSpearAngle 20° dmg ThrowSpearDmgValue 4 tốc 24 ô/s.
  const DL = { jumpR: 2.4 * T, rotR: 2.6 * T, rotGap: 0.5, windR: 3.2 * T, range: 12 * T, waveW: 1.6 * T, lift: 0.4, liftAt: 0.25 };   // bán kính, nhịp trúng, tầm bay [ƯỚC LƯỢNG]
  const cfgDur = p => K.cfg(p, 'dragon_lance').dur || 2;
  S.dragon_lance = {
    start(G, p) {
      K.layer(G);
      const id = 'dragon_lance', ch = K.charges(p, id), stage = Math.min(3, ch.max - ch.n + 1);
      K.useCharge(p, id);
      addEnergy(G, p, AN.skill);
      const a = aimTo(G, p, C('TargetJumpDistance', 9) * T + 2 * T), s = p._dl = { stage, ang: a.ang, t: 0, seen: new Set(), fired: false };
      setFace(p, a.ang);
      if (stage === 1) {
        const far = a.e ? Math.min(C('TargetJumpDistance', 9) * T, a.d) : C('NormalJumpDistance', 6) * T;
        s.T = C('jumpTime', 0.25); s.v = far / s.T; s.ox = p.x; s.oy = p.y;
        p.skillT = s.T; guard(p, true);
        fx(G, 'jump_mark_fix', p.x + Math.cos(a.ang) * far, p.y + Math.sin(a.ang) * far, { layer: 'ground', dur: s.T });
      } else if (stage === 2) {
        p.skillT = cfgDur(p); s.wind = 0; s.hitT = new Map();
        K.setMul(p, 'moveMul', 'dl', 1 + C('RotateAddSpeed', 0.2));
        s.spear = fx(G, angry(p) ? 'bullet_angry_rotate_spear' : 'bullet_rotate_spear', p.x, p.y, { follow: p, dy: -BODY, dur: p.skillT });
      } else p.skillT = DL.lift;
    },
    update(G, p, dt) {
      const s = p._dl; if (!s) return;
      s.t += dt;
      if (s.stage === 1) {
        slide(G, p, s.ang, s.v, dt);
        p._liftY = Math.sin(Math.min(1, s.t / s.T) * Math.PI) * 22;
      } else if (s.stage === 2) {
        const dmg = angry(p) ? C('RotateAngryDmgValue', 4) : C('RotateDmgValue', 3);
        for (const e of K.inRadius(G, p.x, p.y - BODY, DL.rotR)) if ((s.hitT.get(e) || 0) <= s.t) { s.hitT.set(e, s.t + DL.rotGap); hit(G, p, e, dmg, { critChance: p.crit, repel: 2, fx: 'hit_blue2' }); }
        if (s.t >= s.wind) {
          s.wind += C('WindInterval', 1.6);
          fx(G, 'whirl_wind', p.x, p.y - BODY, { dur: 0.8 });
          for (const e of K.inRadius(G, p.x, p.y - BODY, DL.windR)) hit(G, p, e, C('WindDmgValue', 4), { critChance: p.crit, repel: 3, fx: 'hit_blue2' });
        }
      } else if (!s.fired && s.t >= DL.liftAt) {
        s.fired = true;
        const ag = angry(p), size = ag ? 1 + C('AngryAddSlashBulletSize', 0.25) : 1, cx = p.x, cy = p.y - BODY;
        fx(G, 'c28_buff', cx, cy, { follow: p, dy: -BODY, dur: 0.4, tint: [0.6, 0.8, 1, 1] });
        proj(G, p, { x: cx, y: cy, ang: s.ang, v: C('SlashBulletSpeed', 24) * T, range: DL.range, w: DL.waveW * size, dmg: ag ? C('SlashAngryDmgValue', 15) : C('SlashDmgValue', 12), fx: ag ? 'bullet_angry_slash_throw_spear' : 'bullet_slash_throw_spear' });
        const n = C('ThrowSpearCount', 2), sp = rad(C('ThrowSpearAngle', 20));
        for (let i = 0; i < n; i++) proj(G, p, { x: cx, y: cy, ang: s.ang + (i - (n - 1) / 2) * 2 * sp, v: C('ThrowSpearSpeed', 24) * T, range: DL.range, w: 8, dmg: C('ThrowSpearDmgValue', 4), fx: 'lancer_spear', repel: 1 });
        G.shake = Math.max(G.shake, 2);
      }
    },
    end(G, p) {
      const s = p._dl; p._dl = null;
      K.setMul(p, 'moveMul', 'dl', 1);
      if (!s) return;
      if (s.stage === 1) {
        guard(p, false);
        // Hạ xuống: ExplodeHammer (bullet_hammer_fix_lancer_s0) + dấu chân c30_jump_end; điện làm choáng ngắn.
        fx(G, 'bullet_hammer_fix_lancer_s0', p.x, p.y, { layer: 'ground' });
        fx(G, 'c30_jump_end', p.x, p.y, { layer: 'ground' });
        const dmg = angry(p) ? C('JumpAngryDmgValue', 6) : C('JumpDmgValue', 4);
        for (const e of K.inRadius(G, p.x, p.y - BODY, DL.jumpR)) { hit(G, p, e, dmg, { critChance: p.crit, repel: 3, fx: 'hit_blue3' }); K.debuff(G, e, 'ele'); }
        G.shake = Math.max(G.shake, 3);
      }
    }
  };

  // ================================================================ 2. Long Thương Thánh Lâm (thunder_presence)
  // [ĐO ctrlFields Skill1*, config max 2, cd 3, args "5;2"]: ném thương, thương đâm xuống gây Skill1SpearCrashDamage 10; nhặt lại
  // thương +1 Đấu Chí (tối đa Skill1ThunderChargeMax 5, không thêm sau Skill1ThunderEnergyResetDelay 8 s thì về 0) và đòn vũ khí kế
  // tiếp thêm sét Skill1ThunderChargeLightningDamage 6. Đủ 5 Đấu Chí mà bấm kỹ năng → Lôi Động Skill1ThunderStateTime 8 s: chạy
  // +Skill1MoveSpeedUp 0.3, hồi chiêu ×(1-Skill1CooldownReduction 0.5), mỗi đòn vũ khí kèm sét liên tỏa Skill1ThunderStateLightningDamage
  // 3 × (Skill1ThunderStateLightningDamageCount 3) mục tiêu (chờ Skill1ThunderChargeLightningAtkCD 1 s), thương cắm xuống thêm sét
  // Skill1SpearLightningDamage 24 (bán kính 1.5 ô) và nhặt thương đả kích phạm vi Skill1CleaveLightningDamageRange 5 ô, +Skill1ThunderStateAddTime 1 s.
  const TP = { v: 22 * T, range: 13 * T, crashR: 2 * T, pick: 12, jump: 8 * T, cleaveDmg: 10 };   // tốc ném, bán kính đâm, tầm nhặt, tầm sét, sát thương đả kích [ƯỚC LƯỢNG]
  function thunderTick(G, p, dt) {
    const s = ln(p);
    if (s.lightT > 0) s.lightT -= dt;
    if (s.charge > 0 && !s.state && (s.resetT -= dt) <= 0) s.charge = 0;
    if (s.state > 0 && (s.state -= dt) <= 0) {
      s.state = 0; s.charge = 0;
      K.setMul(p, 'moveMul', 'tp', 1);
      const ch = p._ch; if (ch && ch.id === 'thunder_presence') ch.cd = K.cfg(p, 'thunder_presence').cd || ch.cd * 2;
    }
  }
  function lightning(G, p, from, e, dmg) {
    const [cx, cy] = ec(e);
    K.boltProp(G, from, [cx, cy], 0.2);
    fx(G, 'lancer_s0_skill1_lightning_atk', cx, cy, { scale: 0.8 });
    hit(G, p, e, dmg, { critChance: 0, repel: 1, fx: 'lancer_s0_skill1_hit_fx', tag: 'skill' });
    K.debuff(G, e, 'ele');
  }
  // Đòn vũ khí kế tiếp mang sét (Đấu Chí) / mọi đòn trong Lôi Động (sét liên tỏa).
  function thunderFire(G, p) {
    const s = ln(p);
    if (p.h.skill.id !== 'thunder_presence') return;
    const from = () => [p.x, p.y - BODY];
    if (s.state > 0) {
      if (s.lightT > 0) return;
      s.lightT = C('Skill1ThunderChargeLightningAtkCD', 1);
      const chain = [];
      let cur = K.nearest(G, p.x, p.y - BODY, TP.jump, { los: true });
      for (let i = 0; cur && i < C('Skill1ThunderStateLightningDamageCount', 3); i++) {
        chain.push(cur);
        const [cx, cy] = ec(cur);
        cur = K.nearest(G, cx, cy, 5 * T, { skip: q => chain.indexOf(q) >= 0 });
      }
      let prev = from();
      for (const e of chain) { lightning(G, p, prev, e, C('Skill1ThunderStateLightningDamage', 3)); const c = ec(e); prev = [c[0], c[1]]; }
    } else if (s.armed) {
      const e = K.nearest(G, p.x, p.y - BODY, TP.jump, { los: true });
      if (!e) return;
      s.armed = false;
      lightning(G, p, from(), e, C('Skill1ThunderChargeLightningDamage', 6));
    }
  }
  function pickup(G, p, sp) {
    const s = ln(p);
    K.stopFx(sp.h); sp.gone = true;
    s.spears.splice(s.spears.indexOf(sp), 1);
    if (s.state > 0) {
      s.state += C('Skill1ThunderStateAddTime', 1);
      fx(G, 'lancer_s0_skill1_spear_cleave', p.x, p.y - BODY, { dur: 0.6 });
      for (const e of K.inRadius(G, p.x, p.y - BODY, C('Skill1CleaveLightningDamageRange', 5) * T)) hit(G, p, e, TP.cleaveDmg, { critChance: p.crit, repel: 3, fx: 'lancer_s0_skill1_hit_fx' });
      G.shake = Math.max(G.shake, 2);
    } else {
      s.charge = Math.min(C('Skill1ThunderChargeMax', 5), s.charge + 1);
      s.resetT = C('Skill1ThunderEnergyResetDelay', 8);
      s.armed = true;
      fx(G, 'lancer_s0_skill1_hit_fx', p.x, p.y - BODY, { follow: p, dy: -BODY });
    }
  }
  function throwSpear(G, p, ang) {
    const s = ln(p), sp = { x: p.x, y: p.y - BODY, d: 0, landed: false, t: 0, h: null, gone: false };
    sp.h = fx(G, 'lancer_s0_skill1_spear', sp.x, sp.y, { follow: sp, ang, dur: 60 });
    s.spears.push(sp);
    G.props.push({ x: sp.x, y: sp.y, update(G2, q, dt) {
      sp.t += dt;
      if (sp.gone) { q.gone = true; return; }
      if (!sp.landed) {
        const step = TP.v * dt;
        sp.x += Math.cos(ang) * step; sp.y += Math.sin(ang) * step; sp.d += step;
        const e = K.nearest(G2, sp.x, sp.y, 8, {});
        if (e || sp.d >= TP.range || solid(G2, sp.x, sp.y)) {
          sp.landed = true; sp.t = 0;
          fx(G2, 'lancer_s0_skill1_hit_fx', sp.x, sp.y, { scale: 1.5 });
          const st = s.state > 0;
          for (const q2 of K.inRadius(G2, sp.x, sp.y, st ? C('Skill1SpearLightningDamageRange', 1.5) * T : TP.crashR)) hit(G2, p, q2, st ? C('Skill1SpearLightningDamage', 24) : C('Skill1SpearCrashDamage', 10), { critChance: p.crit, repel: 3, fx: 'lancer_s0_skill1_hit_fx' });
          if (st) fx(G2, 'lancer_s0_skill1_electric_wave', sp.x, sp.y, { layer: 'ground' });
          G2.shake = Math.max(G2.shake, 2);
        }
      } else if (sp.t > 0.25 && Math.hypot(p.x - sp.x, p.y - BODY - sp.y) < TP.pick + 6) pickup(G2, p, sp);
      q.x = sp.x; q.y = sp.y;
    }, draw() {} });
  }
  S.thunder_presence = {
    start(G, p) {
      K.layer(G);
      const s = ln(p), full = C('Skill1ThunderChargeMax', 5);
      if (s.charge >= full && !s.state) {
        // Lôi Động: không tốn lượt ném.
        s.state = C('Skill1ThunderStateTime', 8); s.armed = false;
        K.setMul(p, 'moveMul', 'tp', 1 + C('Skill1MoveSpeedUp', 0.3));
        const ch = K.charges(p, 'thunder_presence'); ch.cd = K.cfg(p, 'thunder_presence').cd * (1 - C('Skill1CooldownReduction', 0.5));
        fx(G, 'angry_effect', p.x, p.y, { follow: p, dur: s.state });
        addEnergy(G, p, AN.skill);
        return;
      }
      K.charges(p, 'thunder_presence'); K.useCharge(p, 'thunder_presence');
      addEnergy(G, p, AN.skill);
      const a = aimTo(G, p, TP.range);
      setFace(p, a.ang);
      throwSpear(G, p, a.ang);
    }
  };
  SK.on('hud', (ctx, G) => {
    const p = G.player;
    if (!p || p.hero !== 'lancer' || G.state !== 'stage' || !p.h.skill || p.h.skill.id !== 'thunder_presence') return;
    const s = ln(p), v = SK.view, cx = v.w - 16, cy = v.h - 17, full = C('Skill1ThunderChargeMax', 5);
    for (let i = 0; i < full; i++) { ctx.fillStyle = s.state > 0 || i < s.charge ? '#7fd8ff' : 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 12 + i * 5, cy - 22, 4, 4); }
    if (s.state > 0) SK.text(ctx, s.state.toFixed(1), cx, cy - 27, 7, '#7fd8ff', 'center', '#000');
  });

  // ================================================================ 3. Thương Pháp Lâm Trận (lance_doctrine)
  // [ĐO ctrlFields, config max 2, cd 3]: hai chiêu cơ bản, nhấn kỹ năng lần 1 = một chiêu, lần 2 (trong combo) = chiêu cuối theo cặp.
  // Web chỉ có một phím kỹ năng nên: nhấn K = Sắc Lạnh; nhấn K khi đang giữ nút tấn công = Vẫy Đuôi.
  //   Sắc Lạnh (stab_lancer): lao ngắn về hướng đi, stabDamage 4, stabScale 1.55;  Vẫy Đuôi (sweep_lancer): quét quạt sweepDamage 5, sweepScale 1.75.
  //   Sắc+Sắc → Lôi Đình Phá Ảnh (ultra_1): lao xa, ultra1Damage 8, ultra1Scale 2, ultra1Force 75, cảm điện + choáng, thêm cd ultra1ExtraCd 1;
  //   Vẫy+Vẫy → Phi Thương Hồi Chuyển (ultra_2): thương xoay nhảy qua tối đa maxDashCount 5 quái (dashTime 0.2), ultra2Damage 8, cảm điện + choáng, +3 cd;
  //   Sắc+Vẫy → Theo Gió Mà Đi (ultra_4): thương linh, ultra4LanceCount 6 mũi mỗi loạt, bắn 5 (bulletInfo) tốc 20, quét 8, +0.5 cd, tồn tại nhiều cái;
  //   Vẫy+Sắc → Trận Thương Mưa Rào (ultra_3): đâm liên tục về hướng đi, ultra3Damage 4/nhịp, đạn ta xuyên trận +deltaDamage 3 và cảm điện, +3.5 cd.
  const LD = { stabD: 3.5 * T, stabT: 0.2, stabR: 1.8 * T, sweepR: 3 * T, sweepHalf: 1.05, window: 2,   // quãng lao, tầm quét, cửa sổ combo [ƯỚC LƯỢNG]
    u1D: 9 * T, u1T: 0.25, u2Range: 12 * T, u2Hop: 6 * T, u2Speed: 26 * T, u2Max: 5, u2Hit: 0.2,
    u3T: 1.6, u3Gap: 0.2, u3Len: 4 * T, u3W: 2.2 * T, u4Life: 12, u4Gap: 1, u4Range: 12 * T, u4Max: 4, u4V: 20 * T, u4Fan: 60, u4Sweep: 3 * T };
  S.lance_doctrine = {
    start(G, p) {
      K.layer(G);
      const id = 'lance_doctrine', s = ln(p), sweep = I.down('attack');
      K.charges(p, id); K.useCharge(p, id);
      addEnergy(G, p, AN.skill);
      const kind = sweep ? 'W' : 'S', first = s.combo && s.combo.t > 0 ? s.combo.k : null;
      s.combo = { k: kind, t: LD.window };
      const ang = moveAng(p), st = p._ld = { ang, t: 0, seen: new Set(), kind: first ? first + kind : kind, fired: false };
      setFace(p, ang);
      if (first) { s.combo = null; p._cdExtra = { SS: 'ultra1ExtraCd', WW: 'ultra2ExtraCd', SW: 'ultra4ExtraCd', WS: 'ultra3ExtraCd' }[st.kind]; }
      const k = st.kind;
      if (k === 'S') { p.skillT = LD.stabT; st.v = LD.stabD / LD.stabT; guard(p, true); }
      else if (k === 'W') p.skillT = 0.3;
      else if (k === 'SS') { p.skillT = LD.u1T; st.v = LD.u1D / LD.u1T; guard(p, true); }
      else if (k === 'WW') p.skillT = 0.3;
      else if (k === 'SW') p.skillT = 0.4;
      else p.skillT = LD.u3T;   // WS
    },
    update(G, p, dt) {
      const st = p._ld; if (!st) return;
      st.t += dt;
      const cx = p.x, cy = p.y - BODY, k = st.kind;
      if (k === 'S' || k === 'SS') {
        // Đâm dọc đường lao: mỗi quái một lần.
        const d = k === 'S' ? C('stabDamage', 4) : C('ultra1Damage', 8), w = (k === 'S' ? C('stabScale', 1.55) : C('ultra1Scale', 2)) * 10;
        if (!st.fx) { st.fx = true; fx(G, k === 'S' ? 'stab_lancer' : 'ultra_1_lancer', cx, cy, { follow: p, dy: -BODY, ang: st.ang, dur: 0.5 }); }
        slide(G, p, st.ang, st.v, dt);
        segHit(G, p, cx, cy, p.x + Math.cos(st.ang) * 6, p.y - BODY + Math.sin(st.ang) * 6, w, d, st.seen, { repel: k === 'S' ? 3 : 5, after: k === 'SS' ? shock : null });
      } else if (k === 'W' && !st.fired) {
        st.fired = true;
        fx(G, 'sweep_lancer', cx, cy, { follow: p, dy: -BODY, ang: st.ang, dur: 0.5 });
        coneHit(G, p, st.ang, LD.sweepR * C('sweepScale', 1.75) / 1.75, LD.sweepHalf, C('sweepDamage', 5), new Set(), {});
      } else if (k === 'WW' && !st.fired) {
        st.fired = true; spinSpear(G, p, st.ang);
      } else if (k === 'SW' && !st.fired) {
        st.fired = true; summonSpirit(G, p);
      } else if (k === 'WS') {
        setFace(p, st.ang);
        // Trận thương: mỗi u3Gap giây đâm một loạt trong dải phía trước, đạn ta xuyên trận mạnh thêm.
        st.rain = (st.rain || 0) + dt;
        if (st.rain >= LD.u3Gap) {
          st.rain = 0;
          // ultra_3_lancer là quầng trắng cỡ lớn khi dựng lại nên dùng nét đâm stab_lancer rải trong dải (mưa thương).
          for (let i = 0; i < 2; i++) {
            const u = (0.25 + SK.rand() * 0.75) * LD.u3Len, off = (SK.rand() - 0.5) * LD.u3W * 0.8;
            fx(G, 'stab_lancer', cx + Math.cos(st.ang) * u - Math.sin(st.ang) * off, cy + Math.sin(st.ang) * u + Math.cos(st.ang) * off, { ang: st.ang, dur: 0.4 });
          }
          segHit(G, p, cx, cy, cx + Math.cos(st.ang) * LD.u3Len, cy + Math.sin(st.ang) * LD.u3Len, LD.u3W, C('ultra3Damage', 4), new Set(), { after: shock, repel: 1 });
        }
        const x1 = cx + Math.cos(st.ang) * LD.u3Len, y1 = cy + Math.sin(st.ang) * LD.u3Len, dx = x1 - cx, dy = y1 - cy, L2 = dx * dx + dy * dy;
        for (const b of G.bullets) {
          if (b.side !== 'p' || b.dead || b._ld3) continue;
          const u = Math.max(0, Math.min(1, ((b.x - cx) * dx + (b.y - cy) * dy) / L2));
          if (Math.hypot(b.x - (cx + dx * u), b.y - (cy + dy * u)) < LD.u3W / 2) { b._ld3 = true; b.dmg += C('deltaDamage', 3); b.r = (b.r || 2) + C('deltaSize', 0.2) * T / 2; }
        }
      }
    },
    end(G, p) {
      const st = p._ld; p._ld = null; guard(p, false);
      if (st && p._cdExtra) {
        const ch = p._ch;
        if (ch && ch.id === 'lance_doctrine') ch.t -= C(p._cdExtra, 0);   // hồi lượt chậm thêm ultraNExtraCd
      }
      p._cdExtra = null;
    }
  };
  // Đạn ta đã xuyên Trận Thương Mưa Rào làm quái trúng đòn bị cảm điện (LancerUltra3Trigger).
  SK.on('enemyHit', (G, e) => {
    if (G._skHit || !G.player || G.player.hero !== 'lancer') return;
    const [cx, cy] = ec(e);
    if (G.bullets.some(b => b._ld3 && Math.hypot(b.x - cx, b.y - cy) < 16 + b.r)) K.debuff(G, e, 'ele');
  });
  // Phi Thương Hồi Chuyển: thương xoay lao tới quái, nhảy sang quái kế (≤ maxDashCount lần); không có quái thì bay thẳng hết tầm.
  function spinSpear(G, p, ang) {
    const s = { x: p.x, y: p.y - BODY, hits: 0, seen: new Set(), tgt: null, d: 0 };
    s.h = fx(G, 'lancer_spear', s.x, s.y, { follow: s, dur: 30, ang });
    const max = C('maxDashCount', LD.u2Max) || LD.u2Max;
    G.props.push({ x: s.x, y: s.y, update(G2, q, dt) {
      const end = () => { q.gone = true; K.stopFx(s.h); };
      if (!s.tgt || !alive(s.tgt)) s.tgt = K.nearest(G2, s.x, s.y, s.hits ? LD.u2Hop : LD.u2Range, { skip: e => s.seen.has(e) });
      if (!s.tgt) {
        if (s.hits) return end();
        const step = LD.u2Speed * dt;
        s.x += Math.cos(ang) * step; s.y += Math.sin(ang) * step; s.d += step; q.x = s.x; q.y = s.y;
        if (s.d >= LD.u2Range || solid(G2, s.x, s.y)) end();
        return;
      }
      const [tx, ty] = ec(s.tgt), d = Math.hypot(tx - s.x, ty - s.y), step = Math.min(d, LD.u2Speed * dt);
      s.x += (tx - s.x) / (d || 1) * step; s.y += (ty - s.y) / (d || 1) * step; q.x = s.x; q.y = s.y;
      if (d < 6 + s.tgt.r) {
        s.seen.add(s.tgt); s.hits++;
        hit(G2, p, s.tgt, C('ultra2Damage', 8), { critChance: p.crit, repel: 3, fx: 'hit_blue3' }); shock(s.tgt);
        fx(G2, 'ultra_2_lancer', tx, ty, { dur: 0.5 });
        s.tgt = null;
        if (s.hits >= max) end();
      }
    }, draw() {} });
  }
  // Theo Gió Mà Đi: thương linh đứng cạnh người, mỗi u4Gap giây bắn loạt ultra4LanceCount mũi (bulletInfo dmg 5, tốc 20) về quái gần.
  function summonSpirit(G, p) {
    const s = ln(p), sp = { x: p.x, y: p.y - 12, t: 0, cd: 0.3, life: LD.u4Life, h: null, phase: SK.rand() * 6 };
    s.spirits = s.spirits.filter(q => !q.gone);
    if (s.spirits.length >= LD.u4Max) { const o = s.spirits.shift(); o.gone = true; K.stopFx(o.h); }
    s.spirits.push(sp);
    sp.h = fx(G, 'ultra_4_lancer', sp.x, sp.y, { follow: sp, dur: LD.u4Life });
    const slot = s.spirits.length - 1;
    G.props.push({ x: sp.x, y: sp.y, update(G2, q, dt) {
      sp.t += dt; sp.cd -= dt;
      const tx = p.x + (slot % 2 ? 18 : -18) * (1 + (slot >> 1) * 0.6), ty = p.y - 20 + Math.sin(sp.t * 3 + sp.phase) * 2;
      sp.x += (tx - sp.x) * Math.min(1, dt * 6); sp.y += (ty - sp.y) * Math.min(1, dt * 6); q.x = sp.x; q.y = sp.y;
      if (sp.cd <= 0) {
        const e = K.nearest(G2, sp.x, sp.y, LD.u4Range, { los: true });
        if (e) {
          sp.cd = LD.u4Gap;
          if (Math.hypot(ec(e)[0] - sp.x, ec(e)[1] - sp.y) < LD.u4Sweep) {   // quét gần: sweepInfo dmg 8, size 1.33
            fx(G2, 'ultra_4_lancer_sweeps', sp.x, sp.y, { ang: Math.atan2(ec(e)[1] - sp.y, ec(e)[0] - sp.x), dur: 0.5 });
            for (const q2 of K.inRadius(G2, sp.x, sp.y, LD.u4Sweep)) hit(G2, p, q2, 8, { critChance: p.crit, repel: 2, fx: 'hit_blue3' });
          }
          const [ex, ey] = ec(e), a0 = Math.atan2(ey - sp.y, ex - sp.x), n = C('ultra4LanceCount', 6), fan = rad(LD.u4Fan);
          for (let i = 0; i < n; i++) proj(G2, p, { x: sp.x, y: sp.y, ang: a0 + (i - (n - 1) / 2) / ((n - 1) / 2 || 1) * fan / 2, v: LD.u4V, range: LD.u4Range, w: 6, dmg: 5, fx: 'ultra_4_lancer_bullet', repel: 1 });
        } else sp.cd = 0.2;
      }
      if (sp.t >= sp.life || sp.gone) { q.gone = true; sp.gone = true; K.stopFx(sp.h); }
    }, draw() {} });
  }
})();
