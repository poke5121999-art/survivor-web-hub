// Kỹ năng Võ Đấu Gia (c33): tiger_punch, whirlwind_kick. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, R = SK.DS.rules;
  const C = (f, d) => K.CTRL('fighter', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const ec = K.ec, alive = K.alive;

  // ---------------------------------------------------------------- Mãnh Hổ Quyền
  // [ĐO C34Controller + config] cd 10, args 50. Bốn thức chọn theo số đòn đánh thường đã tung trước khi bấm kỹ năng (đếm
  // lại sau maxWaitAttackTime 1 s không đánh): 0 = Uy Hổ Khiếu (+50% DMG Bạo, AddCriticDamage 0,5, CriticDuration 10 s;
  // chỉ thức này vào hồi chiêu), 1 = Hổ Chấn Địa (PushOffDmgValue 4, choáng), 2 = Bách Liệt Quyền (3 sát thương / 0,2 s trong
  // 2 s). Thức 4 Hổ Khí Công cần nâng cấp nhân vật cấp 5 (LongExplosionDmgValue 48...) nên chưa làm.
  const TP = {
    crit: () => C('AddCriticDamage', 0.5), roarT: () => C('CriticDuration', 10), wait: () => C('maxWaitAttackTime', 1),
    stompDmg: () => C('PushOffDmgValue', 4), stompR: () => (2 + C('PushOffSizeOffset', 1.3)) * T, stompStun: 2,   // bán kính, choáng 2 s [ƯỚC LƯỢNG + WIKI]
    boxDmg: () => C('ContinuousBoxingDmgValue', 3), boxEvery: () => C('ContinuousBoxingDmgInterval', 0.2), boxT: () => C('ContinuousBoxingDuration', 2),
    boxLen: 3 * T, boxW: 2 * T    // tầm và bề rộng loạt đấm [ƯỚC LƯỢNG]
  };
  const tp = p => p._fTp || (p._fTp = { n: 0, t: 0, roar: 0, box: null });

  // Mỗi đòn đánh thường (sự kiện 'fire') cộng một nhịp vào chuỗi.
  SK.on('fire', (G, p) => {
    if (p.hero !== 'fighter' || !p.h.skill || p.h.skill.id !== 'tiger_punch') return;
    const s = tp(p); s.n = Math.min(3, s.n + 1); s.t = TP.wait();
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
    if (b.t <= 0) s.box = null;
  };
  function roar(G, p) {
    tp(p).roar = TP.roarT(); tp(p).n = 0;
    fx(G, 'fighter_0_angry_effect', p.x, p.y, { follow: p, dur: 1 });
  }
  function stomp(G, p) {
    const s = tp(p); s.n = 0; s.t = 0;
    const x = p.x, y = p.y - 4;
    fx(G, 'fighter_0_0_bullet_hammer', x, y, { layer: 'ground' });
    for (const e of K.inRadius(G, x, y, TP.stompR())) {
      K.hit(G, p, e, TP.stompDmg(), { critChance: p.crit, repel: 4, fx: 'hit_white' });
      K.stun(e, TP.stompStun);
    }
    G.shake = Math.max(G.shake, 3);
  }
  function flurry(G, p) {
    const s = tp(p); s.n = 0; s.t = 0;
    s.box = { t: TP.boxT(), tick: 0, ang: 0 };
    fx(G, 'fighter_0_0_continus_boxing', p.x, p.y, { follow: p, dy: -7, dur: TP.boxT(), layer: 'ground' });
  }
  // Một loạt đấm: hộp chữ nhật trước mặt theo hướng ngắm.
  function punch(G, p, b) {
    const { ang } = K.targetAng(G, p, TP.boxLen + 2 * T);
    if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
    const c = Math.cos(ang), sn = Math.sin(ang);
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = x - p.x, dy = y - (p.y - 7);
      const u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (u > -4 && u < TP.boxLen + e.r && Math.abs(v) < TP.boxW / 2 + e.r) K.hit(G, p, e, TP.boxDmg(), { critChance: p.crit, ang, repel: 1, fx: 'hit_white', tag: 'flurry' });
    }
  }
  S.tiger_punch = {
    start(G, p) {
      K.layer(G);
      const n = tp(p).n;
      if (n >= 2) { p._cdAfter = 0; flurry(G, p); }      // đánh thường x2 + kỹ năng: không vào hồi chiêu
      else if (n === 1) { p._cdAfter = 0; stomp(G, p); }
      else roar(G, p);
    },
    // Đang hồi chiêu Uy Hổ Khiếu vẫn tung được thức đánh-rồi-kỹ-năng.
    pressCd(G, p) {
      const n = tp(p).n;
      if (n >= 2) flurry(G, p); else if (n === 1) stomp(G, p);
    }
  };

  // ---------------------------------------------------------------- Cú Đá Lốc Xoáy
  // [ĐO C34Controller + config] cd 5, maxCount 3 (mỗi lượt một thức), args 20;1 (nâng cấp: đoạn 2 nhận thêm 20% sát thương,
  // đoạn 1 choáng thêm 1 s — chưa làm vì cần nâng cấp nhân vật). Đoạn 1: đá lao 5 ô tốc 12, 8 sát thương, choáng 1 s;
  // đoạn 2: 16 sát thương; đoạn 3: trễ 0,2 s, tốc 15, 24 sát thương diện rộng, đánh bay, gió whirl_wind 8 sát thương.
  const WK = {
    find: () => C('TargetKickDistance', 8) * T, window: 5,               // cửa sổ 5 s chờ đoạn kế [WIKI]
    dmg: [C('Skill2Kick1DmgValue', 8), C('Skill2Kick2DmgValue', 16), C('Skill2Kick3DmgValue', 24)],
    dist: [C('Skill2Kick1Distance', 5) * T, C('Skill2Kick2Distance', 5) * T, C('Skill2Kick3Distance', 5) * T],
    speed: [C('Kick1and2MovingSpeed', 12) * T, C('Kick1and2MovingSpeed', 12) * T, C('Kick3MovingSpeed', 15) * T],
    stun: C('Skill2Kick1DizzyTime', 1), delay3: C('Skill2Kick3Delay', 0.2), wind: C('WindDmgValue', 8),
    reach: 12, sweepR: 3 * T, windDelay: 0.2   // tầm chạm khi lao, bán kính đá quét, trễ gió [ƯỚC LƯỢNG]
  };
  K.timers.whirlwind = (G, p, dt) => { if (p._wk && p._wk.t > 0) p._wk.t -= dt; };
  const KFX = ['kick1_bullet', 'kick2_bullet', 'kick3_bullet'];
  S.whirlwind_kick = {
    start(G, p) {
      K.layer(G);
      K.charges(p, 'whirlwind_kick'); K.useCharge(p, 'whirlwind_kick');
      const s = p._wk && p._wk.t > 0 ? p._wk : (p._wk = { step: 0, t: 0 });
      const step = s.step;
      s.step = (step + 1) % 3; s.t = step < 2 ? WK.window : 0;
      const q = K.nearest(G, p.x, p.y - 6, WK.find(), { los: true });
      const ang = q ? Math.atan2(ec(q)[1] - (p.y - 6), ec(q)[0] - p.x) : K.aimDir(p);
      let dist = WK.dist[step];
      if (q) dist = Math.max(0, Math.min(dist, Math.hypot(ec(q)[0] - p.x, ec(q)[1] - (p.y - 6)) - WK.reach));
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      const wait = step === 2 ? WK.delay3 : 0, run = dist / WK.speed[step];
      p.skillT = wait + run + 0.15;
      p._fKick = { step, ang, wait, run, t: 0, v: WK.speed[step], hit: new Set(), done: false };
      fx(G, KFX[step], p.x, p.y - 7, { follow: p, dy: -7, ang, flip: false, dur: 0.5 });
    },
    update(G, p, dt) {
      const k = p._fKick; if (!k) return;
      k.t += dt;
      if (k.t > k.wait && k.t <= k.wait + k.run) {
        // Huỷ phần đi bộ của khung này để cú lao giữ đúng hướng.
        const mv = SK.input.moveVec(), walkPx = p.h.speed * SK.PPU * (p.speedMul || 1) * (p.moveMul || 1) * dt;
        SK.moveBox(G.map, p, Math.cos(k.ang) * k.v * dt - mv.x * walkPx, Math.sin(k.ang) * k.v * dt - mv.y * walkPx, p.h.body.r);
        if (k.step < 2) for (const e of K.inRadius(G, p.x + Math.cos(k.ang) * 8, p.y - 6 + Math.sin(k.ang) * 8, WK.reach)) {
          if (k.hit.has(e)) continue;
          k.hit.add(e);
          K.hit(G, p, e, WK.dmg[k.step], { critChance: p.crit, ang: k.ang, repel: 3, fx: 'hit_red', tag: 'kick' });
          if (k.step === 0) K.stun(e, WK.stun);
        }
      } else if (k.step === 2 && !k.done && k.t > k.wait + k.run) sweep(G, p, k);
    },
    end(G, p) { const k = p._fKick; if (k && k.step === 2 && !k.done) sweep(G, p, k); p._fKick = null; }
  };
  // Đoạn 3: đá quét vòng quanh người, đánh bay; gió xoáy gây thêm 8 sát thương sau 0,2 s.
  function sweep(G, p, k) {
    k.done = true;
    const x = p.x, y = p.y - 6, list = K.inRadius(G, x, y, WK.sweepR);
    for (const e of list) K.hit(G, p, e, WK.dmg[2], { critChance: p.crit, ang: Math.atan2(ec(e)[1] - y, ec(e)[0] - x), repel: 8, fx: 'hit_red', tag: 'kick' });
    fx(G, 'whirl_wind', x, y, { follow: p, dy: -6, dur: 0.6 });
    G.shake = Math.max(G.shake, 3);
    let t = 0;
    G.props.push({ x, y: -1e9, draw() {}, update(G2, q, dt) {
      t += dt; if (t < WK.windDelay) return;
      q.gone = true;
      for (const e of K.inRadius(G2, x, y, WK.sweepR)) K.hit(G2, p, e, WK.wind, { critChance: p.crit, repel: 1, fx: 'hit_white', tag: 'wind' });
    } });
  }
})();
