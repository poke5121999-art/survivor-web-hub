// Kỹ năng Khí Tông (c22): pulsating_blow, orbiting_stars, meridian_sword. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, I = SK.input;
  const { cfg, fx, hit, alive, ec, inRadius, setMul, layer, timers, aimDir, glow, shoot, DUR_UI } = K;
  const D = SK.D;

  // Hình quạt sát thương (sóng khí công): tâm (x, y), hướng ang, dài len, nửa góc half (độ).
  function cone(G, p, x, y, ang, len, half, dmg, tag, o) {
    const hs = SK.deg(half);
    for (const e of G.enemies) {
      if (!alive(e) || !K.inRoom(G, e)) continue;
      const [cx, cy] = ec(e), d = Math.hypot(cx - x, cy - y);
      if (d > len + e.r) continue;
      let da = Math.atan2(cy - y, cx - x) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (d < e.r + 6 || Math.abs(da) <= hs) hit(G, p, e, dmg, Object.assign({ tag, repel: 2, ang }, o));
    }
  }

  // ================================================================ Cú Đấm Xung Mạch
  // [ĐO c22 prefab C23Controller: cd 6, dur 1 (thời gian tụ lực = get_Skill0MaxTime); skill0DeltaSpeedRate -0,6; skill0BoxingDamage 8; skill0BallDamage 12;
  //  skill0BallSpeed 16; skill0LaserDamage 16 / Interval 0,15 / PostTime 2,5; QigongDamage 8 (hằng); AirbenderSkill0Laser.laserLength 50]
  // [ĐO <Skill0BallSequence>d__120] thả nút: chờ skill0BallProcTime 0,3 s (đứng yên) -> ném bom + sóng khí công, lao <Skill0BallSequence>g__Displacement
  // = min(SkillInfo.range 10 ô, tới mục tiêu khoá) cắt bởi tường, DOMove 0,2 s ease skill0Ease 6 (OutQuad) -> đứng thêm skill0BallPostTime 0,35 s; cả lúc đó skillCasting (không đánh, không đi).
  // [ĐO <Skill0LaserSequence>d__127] đủ chuỗi: chờ skill0LaserProcTime 0,1 s -> tia; người đứng yên 2,5 s (FixedSkill0 đặt vận tốc 0 khi _skill0LaserCasting).
  // Bán kính nổ, độ dài / góc quạt sóng khí công nằm trong collider prefab (PolygonCollider2D, chưa bóc) [ƯỚC LƯỢNG]; cách bom xuyên / nổ [ƯỚC LƯỢNG].
  const PB = {
    slow: -0.6, windup: 0.3, dashT: 0.2, range: 10 * U, stop: 0.35 * U, post: 0.35, box: 8, ball: 12, ballSpeed: 16 * U, wave: 8,
    laser: 16, every: 0.15, laserProc: 0.1, laserT: 2.5, laserLen: 50 * U, laserW: 1.2 * U,
    boxR: 2.5 * U, ballR: [1.5 * U, 2.5 * U], waveLen: 6 * U, waveHalf: 30,   // 30° = SwordBulletSplitProcessor.exactAngle của airbender_boxing*
    idxMax: 2, idxReset: 3                                               // get__boxingMaxIndex 2 (3 khi có buff 0x1f); Invoke("ResetBoxingIndex", 3) trong Boxing()
  };
  // [ĐO C23Controller.PushSkill0Input / Skill0InputMatchesConfig] mỗi đòn đấm ghi chỉ số nhịp (0,1,2,0,...; về 0 sau 3 s không đấm), mỗi lần bấm kỹ năng ghi -1;
  // cửa sổ trượt 9 số. Khớp skill0LaserInputs [0,1,-1,0,1,2,0,1,2] thì lần bấm kỹ năng kế tiếp là tia (rồi xoá danh sách).
  const LASER_IN = [0, 1, -1, 0, 1, 2, 0, 1, 2];
  const seq = p => p._abSeq || (p._abSeq = { list: [], idx: 0, t: -9 });
  const push = (q, v) => { q.list.push(v); if (q.list.length > LASER_IN.length) q.list.shift(); };
  const laserReady = q => q.list.length === LASER_IN.length && q.list.every((v, i) => v === LASER_IN[i]);
  SK.on('fire', (G, p) => {
    if (p.hero !== 'airbender') return;
    const q = seq(p);
    if (G.t - q.t > PB.idxReset) q.idx = 0;
    else if (q.idx > PB.idxMax) q.idx = 0;
    push(q, q.idx); q.idx++; q.t = G.t;
    if (laserReady(q) && !p._abPb) G.toast('Sóng Phá Không sẵn sàng');
  });

  S.pulsating_blow = {
    start(G, p) {
      layer(G);
      const q = seq(p), s = p._abPb = { t: 0, ang: aimDir(p), laser: laserReady(q), phase: 'charge' };
      if (s.laser) q.list = [];
      push(q, -1);
      p.noFire = true;
      p.skillT = cfg(p, 'pulsating_blow').dur || 1;
      setMul(p, 'moveMul', 'ab_charge', 1 + PB.slow);
      s.fx = fx(G, 'effect_c23_skill_ji', p.x, p.y - 8, { follow: p, dy: -8, dur: p.skillT });
    },
    update(G, p, dt) {
      const s = p._abPb; if (!s) return;
      s.t += dt;
      const mv = I.moveVec();
      if (Math.hypot(mv.x, mv.y) > 0.1) s.ang = Math.atan2(mv.y, mv.x);
      if (Math.abs(Math.cos(s.ang)) > 0.1) p.face = Math.cos(s.ang) > 0 ? 1 : -1;
    },
    // Bấm lần nữa khi đang tụ lực = thả sớm (chưa đủ lực: đòn nhỏ, không xuyên).
    press(G, p) { const s = p._abPb; if (s && s.phase === 'charge') { s.early = true; SK.endSkill(G, p); } },
    end(G, p) {
      const s = p._abPb; if (!s) return;
      if (s.fx && s.fx.stop) s.fx.stop();
      if (p.st === 'dead') { setMul(p, 'moveMul', 'ab_charge', 1); p.noFire = false; p._abPb = null; return; }
      s.full = !s.early; s.phase = 'wind'; s.t = 0;
      // Hướng và quãng lao chốt lúc thả: về phía mục tiêu khoá nếu có, không thì theo hướng đi / mặt quay, dài đúng tầm kỹ năng.
      const tg = p.target && alive(p.target) ? p.target : K.nearest(G, p.x, p.y - 6, PB.range, { los: true });
      s.disp = PB.range;
      if (tg && !s.laser) { const [cx, cy] = ec(tg), d = Math.hypot(cx - p.x, cy - (p.y - 6)); s.ang = Math.atan2(cy - (p.y - 6), cx - p.x); s.disp = Math.max(0, Math.min(PB.range, d - PB.stop)); }
      // Tia và đấm xung kích đứng yên; chỉ bom mới lao.
      setMul(p, 'moveMul', 'ab_charge', 0);
    }
  };
  timers.ab_pb = (G, p, dt) => {
    if (p.hero !== 'airbender') return;
    const s = p._abPb;
    if (!s || s.phase === 'charge') return;
    s.t += dt;
    const ang = s.ang;
    if (s.phase === 'wind') {
      if (s.t < (s.laser ? PB.laserProc : PB.windup)) return;
      s.phase = s.laser ? 'laser' : 'dash'; s.t = 0; s.d = { x0: p.x, y0: p.y, done: 0 };
      // Vừa hết chờ: sóng khí công quạt phía trước (CreateQigongWave) và bom.
      fx(G, 'skill_0_wave1', p.x, p.y - 6, { ang, scale: s.full ? 1.2 : 0.8 });
      cone(G, p, p.x, p.y - 6, ang, PB.waveLen, PB.waveHalf, PB.wave, 'ab_wave');
      if (s.laser) { laser(G, p, ang); return; }
      ball(G, p, p.x + Math.cos(ang) * 10, p.y - 6 + Math.sin(ang) * 10, ang, s.full);
      return;
    }
    if (s.phase === 'dash') {
      // OutQuad: quãng đã đi = 1 - (1 - k)^2. Đi đúng phần tăng thêm, huỷ phần đi bộ của lượt này (moveMul đã về 0 nên không còn).
      const k = Math.min(1, s.t / PB.dashT), want = s.disp * (1 - (1 - k) * (1 - k));
      const step = want - s.d.done; s.d.done = want;
      SK.moveBox(G.map, p, Math.cos(ang) * step, Math.sin(ang) * step, p.h.body.r);
      if (k < 1) return;
      // Cuối đoạn lao: đấm xung kích quanh nắm đấm.
      const fxx = p.x + Math.cos(ang) * 10, fyy = p.y - 6 + Math.sin(ang) * 10;
      fx(G, 'airbender_boxing3', fxx, fyy, { ang });
      for (const e of inRadius(G, fxx, fyy, PB.boxR)) hit(G, p, e, PB.box, { tag: 'ab_box', repel: 8, ang });
      s.phase = 'post'; s.t = 0; return;
    }
    if (s.phase === 'post' && s.t >= PB.post || s.phase === 'laser' && s.t >= PB.laserT) {
      setMul(p, 'moveMul', 'ab_charge', 1); p.noFire = false; p._abPb = null;
    }
  };
  // Bom khí công: bay 16 ô/s, nổ ở quái/tường đầu tiên; đủ lực thì nổ rộng hơn và xuyên thêm một quái.
  function ball(G, p, x, y, ang, full) {
    const b = { x, y, t: 0, pierce: full ? 1 : 0, hits: new Set() };
    b.h = fx(G, 'skill_0_wave2', x, y, { follow: b, ang, dur: 3, scale: full ? 1.2 : 0.8 });
    G.props.push({ x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        b.t += dt;
        b.x += Math.cos(ang) * PB.ballSpeed * dt; b.y += Math.sin(ang) * PB.ballSpeed * dt;
        const wall = SK.world.solidAt(G2.map, b.x, b.y);
        const e = wall ? null : G2.enemies.find(q2 => alive(q2) && K.inRoom(G2, q2) && !b.hits.has(q2) && Math.hypot(ec(q2)[0] - b.x, ec(q2)[1] - b.y) < q2.r + 5);
        if (!wall && !e && b.t < 3) return;
        if (e && b.pierce-- > 0) { b.hits.add(e); hit(G2, p, e, PB.ball, { tag: 'ab_ball', repel: 3, ang }); return; }
        q.gone = true; if (b.h && b.h.stop) b.h.stop();
        fx(G2, 'skill_0_wave1', b.x, b.y, { scale: 0.7 });
        for (const q2 of inRadius(G2, b.x, b.y, PB.ballR[full ? 1 : 0])) if (!b.hits.has(q2)) hit(G2, p, q2, PB.ball, { tag: 'ab_ball', repel: 3, ang });
      } });
  }
  // Sóng Phá Không: tia dài 50 ô dựng theo hướng khoá, mỗi 0,15 s gây 16 cho mọi quái nằm trên tia, kéo dài 2,5 s.
  function laser(G, p, ang) {
    const h = fx(G, 'skill_0_laser', p.x, p.y - 6, { follow: p, dy: -6, ang, dur: PB.laserT });
    let acc = 0;
    G.props.push({ x: p.x, y: 1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; acc += dt;
        if (q.t >= PB.laserT) { q.gone = true; if (h && h.stop) h.stop(); return; }
        while (acc >= PB.every) {
          acc -= PB.every;
          const c = Math.cos(ang), s = Math.sin(ang), ox = p.x, oy = p.y - 6;
          for (const e of G2.enemies) {
            if (!alive(e) || !K.inRoom(G2, e)) continue;
            const [cx, cy] = ec(e), dx = cx - ox, dy = cy - oy, along = dx * c + dy * s, off = Math.abs(-dx * s + dy * c);
            if (along > 0 && along < PB.laserLen && off < PB.laserW / 2 + e.r && SK.world.los(G2.map, ox, oy, cx, cy)) hit(G2, p, e, PB.laser, { tag: 'ab_laser', repel: 1, ang });
          }
        }
      } });
  }

  // ================================================================ Vật Đổi Sao Dời
  // [ĐO object_swirl_0/ObjectSwirl: duration 6, range 8, fixedInterval 0,05, shootInterval 0,02, shootRange 15, bulletSpeed 25, bulletLifetime 5, bulletExtraDamage 1;
  //  FixedUpdate: quét vòng tròn bán kính range mỗi fixedInterval, thấy đạn địch (DamageCarrier.IsEnemyBullet) là hút hết, không xác suất; ShootObj: chọn NGẪU NHIÊN một quái
  //  trong shootRange (RandomUtil.GetRandomObject); Targeting: bay tới đích, sát thương = ProcessSkillDamage(dmg đạn + 1), Bạo Kích theo tỉ lệ bạo kích của người chơi (get_critical)]
  // Chưa có: hút hộp (swirlBoxProb 0,1, boxExtraDamage 10) và quái (swirlEnemyProb 0,06, enemyExtraDamage 25): thông tin kỹ năng không nhắc tới, web chưa có hộp bị ném.
  const OS = { dur: 6, range: 8 * U, scan: 0.05, gap: 0.02, shootRange: 15 * U, speed: 25, life: 5, extra: 1, orbit: 26 };
  DUR_UI.orbiting_stars = OS.dur;
  S.orbiting_stars = {
    start(G, p) {
      layer(G);
      p.skillT = OS.dur;
      const s = p._abOs = { held: [], t: 0, scan: 0 };
      s.fx = fx(G, 'object_swirl_0', p.x, p.y - 8, { follow: p, dy: -8, dur: OS.dur });
      G.props.push({ x: p.x, y: 1e9, t: 0,
        update(G2, q) { if (p._abOs !== s) q.gone = true; },
        draw(ctx, G2, q) {
          if (p._abOs !== s) return;
          s.held.forEach((b, i) => {
            const a = s.t * 3.2 + b.a0, r = OS.orbit * (0.75 + 0.25 * Math.sin(b.a0 * 3 + s.t)), x = p.x + Math.cos(a) * r, y = p.y - 8 + Math.sin(a) * r * 0.6;
            b.x = x; b.y = y;
            glow(ctx, x, y, 7, [1, 0.8, 0.2, 1], 0.8);
            if (b.sprite) SK.drawTinted(ctx, b.sprite, x, y, [1, 0.85, 0.3, 1], { rot: a });
          });
        } });
    },
    update(G, p, dt) {
      const s = p._abOs; if (!s) return;
      s.t += dt; s.scan -= dt;
      if (s.scan > 0) return;
      s.scan += OS.scan;
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead) continue;
        if (Math.hypot(b.x - p.x, b.y - (p.y - 8)) > OS.range) continue;
        b.dead = true; if (b.fxh && b.fxh.kill) b.fxh.kill();
        const eb = D.bullets && D.bullets[b.v86];
        s.held.push({ dmg: b.dmg || 1, sprite: b.sprite || (eb && eb.sprite) || null, a0: SK.rand() * Math.PI * 2, x: p.x, y: p.y });
      }
    },
    end(G, p) {
      const s = p._abOs; if (!s) return;
      const held = s.held; p._abOs = null;
      // Thả từng viên cách 0,02 s về một quái ngẫu nhiên trong 15 ô (chọn lúc thả).
      held.forEach((b, i) => G.props.push({ x: b.x, y: 1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt;
          if (q.t < i * OS.gap) return;
          q.gone = true;
          const ts = G2.enemies.filter(e => alive(e) && K.inRoom(G2, e) && Math.hypot(ec(e)[0] - b.x, ec(e)[1] - b.y) < OS.shootRange), t = ts[Math.floor(SK.rand() * ts.length)];
          if (t) shoot(G2, p, b.x, b.y, Math.atan2(ec(t)[1] - b.y, ec(t)[0] - b.x), { dmg: b.dmg + OS.extra, speed: OS.speed, life: OS.life, critChance: p.crit || 0, sprite: b.sprite, repel: 1 });
        } }));
    }
  };

  // ================================================================ Lục Mạch Thần Kiếm
  // [ĐO c22 skill 3: cd 11, dur 6, range 14 (RoleSkill2: FindPlayers 14 ô, mọi người chơi trong tầm được truyền)]
  // [ĐO <CreateQigongTrigger>b__137_0] mỗi đòn vũ khí trúng địch tạo một sóng khí công gây ceil((0,5 + 0,025 x cấp kỹ năng) x sát thương đòn), cấp 0 => 50 %; không giãn nhịp.
  // [ĐO Skill2OnKill] mỗi quái chết trong lúc kỹ năng chạy hồi 1 giáp (RestoreArmor 1). Nhân vật phe ta trong 14 ô: web không có đồng đội cầm vũ khí.
  // Độ dài / góc quạt là collider PolygonCollider2D của QigongWave1 (chưa bóc) [ƯỚC LƯỢNG].
  const MS = { dur: 6, frac: 0.5, len: 5 * U, half: 30, armor: 1 };
  DUR_UI.meridian_sword = MS.dur;
  S.meridian_sword = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'meridian_sword').dur || MS.dur;
      p._abMs = true;
      fx(G, 'effect_c23_skill', p.x, p.y - 8, { follow: p, dy: -8, dur: 1 });
    },
    end(G, p) { p._abMs = false; }
  };
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player;
    if (!p || p.hero !== 'airbender' || !p._abMs || G._skHit) return;
    const [cx, cy] = ec(e), ang = Math.atan2(cy - (p.y - 6), cx - p.x);
    fx(G, 'QigongWave1', cx, cy, { ang, scale: 0.8 });
    cone(G, p, cx, cy, ang, MS.len, MS.half, Math.ceil(dmg * MS.frac), 'qigong', { noMul: true });
  });
  SK.on('enemyKill', (G) => {
    const p = G.player;
    if (p && p.hero === 'airbender' && p._abMs && p.armor < p.armorMax) p.armor = Math.min(p.armorMax, p.armor + MS.armor);
  });
})();
