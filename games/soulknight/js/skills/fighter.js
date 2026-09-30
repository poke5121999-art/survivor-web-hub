// Kỹ năng Võ Đấu Gia (c33): tiger_punch, whirlwind_kick. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, R = SK.DS.rules, I = SK.input;
  const C = (f, d) => K.CTRL('fighter', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const ec = K.ec, alive = K.alive;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- Mãnh Hổ Quyền
  // [ĐO C34Controller] cd 10, args 50. Đếm đòn đánh thường (HeroAttackEvent "A" vào CommandCache, xoá sau maxWaitAttackTime 1 s
  // không đánh): bấm skill khi chưa đánh = Uy Hổ Khiếu (AddCriticDamage 0,5 trong CriticDuration 10 s, chỉ thức này vào hồi
  // chiêu); 1 đòn = Hổ Chấn Địa (PushOffDmgValue 4); 2 đòn = Bách Liệt Quyền; 3 đòn = Hổ Khí Công (chỉ khi nâng cấp nhân vật
  // cấp 5: Skill1_Init bật mẫu "A,A,A" khi get_skill_strengthen; wiki: "Tiger Blast is available once the player upgrades
  // Fighter to level 5"). Ba thức sau RefreshSkillCd nên không đụng hồi chiêu.
  const TP = {
    crit: () => C('AddCriticDamage', 0.5), roarT: () => C('CriticDuration', 10), wait: () => C('maxWaitAttackTime', 1),
    // Hổ Chấn Địa: vòng tròn r 1 ô của prefab fighter_0_0_bullet_hammer, nhân scale_factor 1,5 của ExplodeHammer; tâm cao
    // hơn điểm sinh đạn 0,9 ô, điểm sinh PushOffBulletOffset (0; -0,6) [ĐO prefab + hero.json]. Chỉ choáng khi đòn bạo kích
    // (ExplodeHammer.OnTriggerEnter2D: get_Critic -> AddBuff, alwaysAddBuff 0); choáng 2 s theo wiki, buff_ele có biến thể 2 s.
    stompDmg: () => C('PushOffDmgValue', 4), stompR: 1.0 * 1.5 * T, stompDy: 0.3 * T, stompStun: 2,
    // Bách Liệt Quyền: PolygonCollider2D của fighter_0_0_continus_boxing, hộp bao x 0..3,43 ô, y -2,10..1,83 ô [ĐO prefab],
    // gốc lệch BoxingBulletOffset (0,16; 0,42). Sát thương mỗi nhịp nhân clamp(3 / khoảng cách ô, 0,25, 5) và +10 tỉ lệ bạo
    // [ĐO C34Controller.OnPlayerBulletPreHitEnemyEvent].
    boxDmg: () => C('ContinuousBoxingDmgValue', 3), boxEvery: () => C('ContinuousBoxingDmgInterval', 0.2), boxT: () => C('ContinuousBoxingDuration', 2),
    boxX0: 0, boxX1: 3.43 * T, boxY0: -2.10 * T, boxY1: 1.83 * T, boxCrit: 10,
    // Hổ Khí Công: giữ nút nạp tối đa multiDuration[3] = 1 s (skills.csv c33/skill 1 + ExplosionStateTrigger đọc phần tử 3);
    // sát thương Short/Medium/Long 12/24/48 theo bulletLength 0..2; hộp BoxCollider2D 3,61 x 1,76 ô lệch 3,13 ô của
    // fighter_0_0_explosion_bullet [ĐO prefab]; clip explosion dài 0,4545 s; cháy buff_fire (alwaysAddBuff 1).
    blastCharge: 1.0, blastLen: 3.61 * T, blastOff: 3.13 * T, blastW: 1.76 * T, blastAnim: 0.4545,
    blastDmg: () => [C('ShortExplosionDmgValue', 12), C('MediumExplosionDmgValue', 24), C('LongExplosionDmgValue', 48)]
    // [ƯỚC LƯỢNG] ngưỡng chia ba mức nạp đều nhau; mỗi mức thêm một đoạn hộp dọc đường (mã sinh chuỗi đạn theo bulletLength).
  };
  const tp = p => p._fTp || (p._fTp = { n: 0, t: 0, roar: 0, box: null, blast: null });
  const blastOk = () => !!(SK.profile && SK.profile.level('fighter') >= 5);

  // Mỗi đòn đánh thường (sự kiện 'fire') cộng một nhịp vào chuỗi; không có nâng cấp thì mẫu dài nhất là 2 đòn.
  SK.on('fire', (G, p) => {
    if (p.hero !== 'fighter' || !p.h.skill || p.h.skill.id !== 'tiger_punch') return;
    const s = tp(p); s.n = Math.min(blastOk() ? 3 : 2, s.n + 1); s.t = TP.wait();
  });
  // Uy Hổ Khiếu: đòn bạo kích nhận thêm (0,5 / critMult) phần sát thương gốc, tức hệ số bạo từ critMult lên critMult + 0,5.
  SK.on('enemyHit', (G, e, dmg, crit) => {
    const p = G.player;
    if (!p || !crit || !(p._fTp && p._fTp.roar > 0) || G._skHit === 'roar') return;
    const extra = Math.max(1, Math.round(dmg * TP.crit() / R.critMult));
    G._skHit = 'roar'; SK.hurtEnemy(G, e, extra, true, 0, 0); G._skHit = null;
  });
  K.timers.tigerPunch = (G, p, dt) => {
    const s = p._fTp; if (!s) return;
    if (s.t > 0) { s.t -= dt; if (s.t <= 0) s.n = 0; }
    if (s.roar > 0) s.roar -= dt;
    const b = s.box; if (!b) return;
    b.t -= dt; b.tick -= dt;
    if (b.tick <= 0) { b.tick += TP.boxEvery(); punch(G, p, b); }
    if (b.t <= 0) { s.box = null; p.noFire = false; }
  };
  function roar(G, p) {
    tp(p).roar = TP.roarT(); tp(p).n = 0;
    fx(G, 'fighter_0_angry_effect', p.x, p.y, { follow: p, dur: 1 });
  }
  function stomp(G, p) {
    const s = tp(p); s.n = 0; s.t = 0;
    const x = p.x, y = p.y - TP.stompDy;
    fx(G, 'fighter_0_0_bullet_hammer', x, y, { layer: 'ground' });
    for (const e of K.inRadius(G, x, y, TP.stompR)) {
      const crit = SK.rand() * 100 < p.crit;
      K.hit(G, p, e, TP.stompDmg(), { crit, repel: 4, fx: 'hit_white' });
      if (crit) K.stun(e, TP.stompStun);
    }
    G.shake = Math.max(G.shake, 3);
  }
  function flurry(G, p) {
    const s = tp(p); s.n = 0; s.t = 0;
    s.box = { t: TP.boxT(), tick: 0, ang: 0 };
    p.noFire = true;   // DealBackWeapon: tay cầm vũ khí thu về trong lúc đấm
    fx(G, 'fighter_0_0_continus_boxing', p.x, p.y, { follow: p, dy: -7, dur: TP.boxT(), layer: 'ground' });
  }
  // Một loạt đấm: hộp bao của đa giác trước mặt theo hướng ngắm.
  function punch(G, p, b) {
    const { ang } = K.targetAng(G, p, TP.boxX1 + 2 * T);
    if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
    const c = Math.cos(ang), sn = Math.sin(ang), oy = p.y - 0.42 * T;
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = x - (p.x + 0.16 * T * p.face), dy = y - oy;
      const u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (u > TP.boxX0 - e.r && u < TP.boxX1 + e.r && v > TP.boxY0 - e.r && v < TP.boxY1 + e.r) {
        const d = Math.hypot(x - p.x, y - (p.y - 7)) / T;
        K.hit(G, p, e, TP.boxDmg() * clamp(3 / Math.max(d, 1e-3), 0.25, 5), { critChance: p.crit + TP.boxCrit, ang, repel: 1, fx: 'hit_white', tag: 'flurry' });
      }
    }
  }
  // Hổ Khí Công: giữ nút kỹ năng để nạp, nhả (hoặc đầy 1 s) thì phóng một dải nổ thẳng hướng ngắm.
  function blastStart(G, p) {
    const s = tp(p); s.n = 0; s.t = 0;
    s.blast = { t: 0, fired: false, anim: 0 };
    if (p._cdAfter == null) p._cdAfter = p.skillCd;   // dùng lúc đang hồi chiêu Uy Hổ Khiếu: endSkill rồi trả lại phần còn lại
    p.noFire = true;
    p.skillT = TP.blastCharge + 5;   // giữ chỗ; kết thúc bằng blastFire
    fx(G, 'fighter_0_0_pre_explosion', p.x, p.y, { follow: p, dy: -10, dur: TP.blastCharge });
  }
  function blastFire(G, p, b) {
    b.fired = true; b.anim = TP.blastAnim;
    const tier = Math.min(2, Math.floor(b.t / TP.blastCharge * 3)), dmg = TP.blastDmg()[tier];
    const { ang } = K.targetAng(G, p, 12 * T);
    if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
    const c = Math.cos(ang), sn = Math.sin(ang), oy = p.y - 0.61 * T;
    const reach = TP.blastOff - TP.blastLen / 2 + TP.blastLen * (tier + 1);
    fx(G, 'fighter_0_0_explosion_bullet', p.x, p.y - 8, { ang, dur: TP.blastAnim });
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = x - p.x, dy = y - oy, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (u > TP.blastOff - TP.blastLen / 2 - e.r && u < reach + e.r && Math.abs(v) < TP.blastW / 2 + e.r) {
        K.hit(G, p, e, dmg, { critChance: p.crit, ang, repel: 2, fx: 'hit_red', tag: 'blast' });
        K.debuff(G, e, 'fire');
      }
    }
    G.shake = Math.max(G.shake, 4);
    b.tier = tier;
  }
  function pattern(G, p) {
    const n = tp(p).n;
    if (n >= 3 && blastOk()) blastStart(G, p);
    else if (n >= 2) flurry(G, p);
    else if (n === 1) stomp(G, p);
    else return false;
    return true;
  }
  S.tiger_punch = {
    start(G, p) {
      K.layer(G);
      if (tp(p).n >= 1) { p._cdAfter = 0; pattern(G, p); }
      else roar(G, p);
    },
    // Đang hồi chiêu Uy Hổ Khiếu vẫn tung được ba thức đánh-rồi-kỹ-năng.
    pressCd(G, p) { pattern(G, p); },
    update(G, p, dt) {
      const b = tp(p).blast; if (!b) return;
      if (!b.fired) {
        b.t += dt;
        if (!I.down('skill') || b.t >= TP.blastCharge) blastFire(G, p, b);
      } else if ((b.anim -= dt) <= 0) { tp(p).blast = null; p.skillT = 0; }
    },
    end(G, p) { tp(p).blast = null; p.noFire = !!tp(p).box; }
  };

  // ---------------------------------------------------------------- Cú Đá Lốc Xoáy
  // [ĐO C34Controller + config] cd 5, maxCount 3 (mỗi lượt một thức, ConsumeSkillCount ở Skill2KickNStateStart), args 20;1
  // (nâng cấp: đoạn 2 thêm 20% sát thương, đoạn 1 choáng thêm 1 s: chỉ khi nâng cấp cấp 5, chưa làm). Cửa sổ chờ đoạn kế
  // multiDuration [5, 5, 5] s (skills.csv c33/skill 2). Lao Dash(kickDistance 5 ô, tốc 12/12/15 ô/s) bằng DOTween MoveTo
  // ease EasyMode = 10 (InOutCubic) dừng ở tường (raycast StaticWallMask), tổng thời gian dash + 0,2 s; hướng lao tới quái
  // gần nhất trong TargetKickDistance 8 ô (GetSkill2DashDirection), không thì hướng đang nhìn. Đoạn 1: 8 sát thương +
  // choáng Skill2Kick1DizzyTime 1 s; đoạn 2: 16; đoạn 3: trễ 0,2 s rồi lao, đá quét 24 (chỉ đoạn 3 có RGSwordTriggerBeheadedSkill
  // hất địch bay). Gió whirl_wind (WindDmgValue 8) chỉ sinh khi có buff 2101 "Trảm Lốc Xoáy" (TryGenerateWind: HasBuff(0x835)),
  // là tài năng chứ không thuộc kỹ năng nên không làm.
  const WK = {
    find: () => C('TargetKickDistance', 8) * T, window: 5,
    dmg: [C('Skill2Kick1DmgValue', 8), C('Skill2Kick2DmgValue', 16), C('Skill2Kick3DmgValue', 24)],
    dist: [C('Skill2Kick1Distance', 5) * T, C('Skill2Kick2Distance', 5) * T, C('Skill2Kick3Distance', 5) * T],
    speed: [C('Kick1and2MovingSpeed', 12) * T, C('Kick1and2MovingSpeed', 12) * T, C('Kick3MovingSpeed', 15) * T],
    stun: C('Skill2Kick1DizzyTime', 1), delay3: C('Skill2Kick3Delay', 0.2), tail: 0.2,
    // Đa giác kick1/kick2_bullet: hộp bao x -2,06..2,31, y ±1,28 (con /b scale 1,75), bám người ở (1; 0,4) ô và lật theo hướng nhìn;
    // kick3_bullet: x -0,01..2,82, y ±2,78 nhân 1,75 = nửa đĩa bán kính 4,9 ô, bám ở (0; 0,8) ô [ĐO prefab common.ab].
    k: { x0: -2.06 * 1.75 * T, x1: 2.31 * 1.75 * T, hy: 1.28 * 1.75 * T, fx: 1.0 * T, fy: 0.4 * T },
    k3: { r: 2.82 * 1.75 * T, fy: 0.8 * T }
  };
  const inOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  K.timers.whirlwind = (G, p, dt) => { if (p._wk && p._wk.t > 0) p._wk.t -= dt; };
  const KFX = ['kick1_bullet', 'kick2_bullet', 'kick3_bullet'];
  S.whirlwind_kick = {
    start(G, p) {
      K.layer(G);
      K.charges(p, 'whirlwind_kick'); K.useCharge(p, 'whirlwind_kick');
      const s = p._wk && p._wk.t > 0 ? p._wk : (p._wk = { step: 0, t: 0 });
      const step = s.step;
      s.step = (step + 1) % 3; s.t = WK.window;
      const q = K.nearest(G, p.x, p.y - 6, WK.find(), { los: true });
      const ang = q ? Math.atan2(ec(q)[1] - (p.y - 6), ec(q)[0] - p.x) : K.aimDir(p);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      const wait = step === 2 ? WK.delay3 : 0, run = WK.dist[step] / WK.speed[step];
      p.skillT = wait + run + WK.tail;
      p._fKick = { step, ang, wait, run, t: 0, hit: new Set(), done: false, f: 0 };
      fx(G, KFX[step], p.x, p.y - 7, { follow: p, dy: -7, ang, flip: false, dur: 0.5 });
    },
    update(G, p, dt) {
      const k = p._fKick; if (!k) return;
      const t0 = k.t; k.t += dt;
      if (k.t > k.wait && t0 < k.wait + k.run) {
        // Huỷ phần đi bộ của khung này để cú lao giữ đúng hướng; đi theo đường cong InOutCubic.
        const f1 = inOutCubic(clamp((k.t - k.wait) / k.run, 0, 1)), d = WK.dist[k.step] * (f1 - k.f);
        k.f = f1;
        const mv = I.moveVec(), walkPx = p.h.speed * SK.PPU * (p.speedMul || 1) * (p.moveMul || 1) * dt;
        SK.moveBox(G.map, p, Math.cos(k.ang) * d - mv.x * walkPx, Math.sin(k.ang) * d - mv.y * walkPx, p.h.body.r);
      }
      if (k.step < 2 && k.t > k.wait) kickHit(G, p, k);
      else if (k.step === 2 && !k.done && k.t > k.wait + k.run) sweep(G, p, k);
    },
    end(G, p) { const k = p._fKick; if (k && k.step === 2 && !k.done) sweep(G, p, k); p._fKick = null; }
  };
  // Kick 1 và 2: hộp bao bám người, mỗi quái trúng một lần.
  function kickHit(G, p, k) {
    const w = WK.k;
    for (const e of G.enemies) {
      if (!alive(e) || k.hit.has(e)) continue;
      const [x, y] = ec(e), dx = (x - (p.x + p.face * w.fx)) * p.face, dy = y - (p.y - w.fy);
      if (dx < w.x0 - e.r || dx > w.x1 + e.r || Math.abs(dy) > w.hy + e.r) continue;
      k.hit.add(e);
      K.hit(G, p, e, WK.dmg[k.step], { critChance: p.crit, ang: k.ang, repel: 3, fx: 'hit_red', tag: 'kick' });
      if (k.step === 0) K.stun(e, WK.stun);
    }
  }
  // Đoạn 3: đá quét nửa đĩa phía trước, đánh bay.
  function sweep(G, p, k) {
    k.done = true;
    const w = WK.k3, y0 = p.y - w.fy;
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = (x - p.x) * p.face;
      if (dx < -e.r || Math.hypot(x - p.x, y - y0) > w.r + e.r) continue;
      K.hit(G, p, e, WK.dmg[2], { critChance: p.crit, ang: Math.atan2(y - y0, x - p.x), repel: 8, fx: 'hit_red', tag: 'kick' });
    }
    G.shake = Math.max(G.shake, 3);
  }
})();
