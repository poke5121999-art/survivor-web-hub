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
  // [ĐO c22 prefab C23Controller: cd 6, dur 1 (thời gian tụ lực); skill0DeltaSpeedRate -0,6; skill0BoxingDamage 8; skill0BallDamage 12;
  //  skill0BallSpeed 16; skill0BallProcTime 0,3 (đoạn lao); skill0LaserDamage 16 / Interval 0,15 / PostTime 2,5; skill0Ease 6 = OutQuad;
  //  QigongDamage 8 (hằng); AirbenderSkill0Laser.laserLength 50, startHeight ~1,2]. Quãng lao, bán kính nổ [ƯỚC LƯỢNG].
  const PB = {
    slow: -0.6, dashT: 0.3, dash: 5 * U, post: 0.35, box: 8, ball: 12, ballSpeed: 16 * U, wave: 8,
    laser: 16, every: 0.15, laserT: 2.5, laserLen: 50 * U, laserW: 1.2 * U,
    boxR: 2.5 * U, ballR: [1.5 * U, 2.5 * U], waveLen: 6 * U, waveHalf: 30, comboWindow: 8   // 30° = SwordBulletSplitProcessor.exactAngle; cửa sổ chuỗi [ƯỚC LƯỢNG]
  };
  // Sóng Phá Không: đấm 2 đòn -> kỹ năng -> đấm 6 đòn -> kỹ năng = tia sóng [ĐO skill0LaserInputs 0,1,-1,0,1,2,0,1,2; -1 là kỹ năng].
  const seq = p => p._abSeq || (p._abSeq = { stage: 0, n: 0, t: 0 });
  SK.on('fire', (G, p) => {
    if (p.hero !== 'airbender') return;
    const q = seq(p);
    q.t = G.t;
    if (q.stage === 0 && ++q.n >= 2) { q.stage = 1; q.n = 0; }
    else if (q.stage === 2 && ++q.n >= 6) { q.stage = 3; q.n = 0; G.toast('Sóng Phá Không sẵn sàng'); }
  });
  const comboTick = (G, p) => { const q = p._abSeq; if (q && q.stage && G.t - q.t > PB.comboWindow) { q.stage = 0; q.n = 0; } };

  S.pulsating_blow = {
    start(G, p) {
      layer(G);
      const q = seq(p), s = p._abPb = { t: 0, ang: aimDir(p), dash: null };
      comboTick(G, p);
      if (q.stage === 1) { q.stage = 2; q.n = 0; } else if (q.stage === 3) { s.laser = true; q.stage = 0; q.n = 0; } else { q.stage = 0; q.n = 0; }
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
    press(G, p) { const s = p._abPb; if (s && !s.dash) { s.early = true; SK.endSkill(G, p); } },
    end(G, p) {
      const s = p._abPb; if (!s) return;
      setMul(p, 'moveMul', 'ab_charge', 1);
      if (s.fx && s.fx.stop) s.fx.stop();
      if (p.st === 'dead') { p._abPb = null; return; }
      s.full = !s.early; s.dash = { t: 0, x0: p.x, y0: p.y };
      // Vừa thả: sóng khí công quạt phía trước.
      fx(G, 'skill_0_wave1', p.x, p.y - 6, { ang: s.ang, scale: s.full ? 1.2 : 0.8 });
      cone(G, p, p.x, p.y - 6, s.ang, PB.waveLen, PB.waveHalf, PB.wave, 'ab_wave');
    }
  };
  timers.ab_pb = (G, p, dt) => {
    if (p.hero !== 'airbender') return;
    const s = p._abPb;
    if (!s || !s.dash) return;
    const d = s.dash;
    d.t = Math.min(PB.dashT, d.t + dt);
    // OutQuad: tốc độ giảm tuyến tính; huỷ phần đi bộ để giữ đúng hướng, dừng khi chạm quái (cách skill0TargetStopOffset 0,35 ô).
    const k = 2 * (1 - (d.t - dt / 2) / PB.dashT), v = PB.dash / PB.dashT * Math.max(0, k) * dt;
    const mv = I.moveVec(), walkPx = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
    const blocked = inRadius(G, p.x + Math.cos(s.ang) * 6, p.y - 6 + Math.sin(s.ang) * 6, 6).length > 0;
    if (!blocked) SK.moveBox(G.map, p, Math.cos(s.ang) * v - mv.x * walkPx, Math.sin(s.ang) * v - mv.y * walkPx, p.h.body.r);
    if (d.t < PB.dashT && !blocked) return;
    // Cuối đoạn lao: đấm xung kích + bom khí công (hoặc tia sóng nếu đủ chuỗi).
    const ang = s.ang, fxx = p.x + Math.cos(ang) * 10, fyy = p.y - 6 + Math.sin(ang) * 10;
    fx(G, 'airbender_boxing3', fxx, fyy, { ang });
    for (const e of inRadius(G, fxx, fyy, PB.boxR)) hit(G, p, e, PB.box, { tag: 'ab_box', repel: 8, ang });
    if (s.laser) laser(G, p, ang);
    else ball(G, p, fxx, fyy, ang, s.full);
    p._abPb = null;
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
  // [ĐO object_swirl_0/ObjectSwirl: duration 6, range 8, shootInterval 0,02, shootRange 15, bulletSpeed 25, bulletLifetime 5, bulletExtraDamage 1]
  // [WIKI] mỗi viên bay về gây (sát thương gốc + 1) và chắc chắn Bạo Kích. Xác suất giữ đạn "có thể" [ƯỚC LƯỢNG: mọi viên trong tầm].
  const OS = { dur: 6, range: 8 * U, gap: 0.02, shootRange: 15 * U, speed: 25, life: 5, extra: 1, max: 60, orbit: 26 };
  DUR_UI.orbiting_stars = OS.dur;
  S.orbiting_stars = {
    start(G, p) {
      layer(G);
      p.skillT = OS.dur;
      const s = p._abOs = { held: [], t: 0 };
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
      s.t += dt;
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead || s.held.length >= OS.max) continue;
        if (Math.hypot(b.x - p.x, b.y - (p.y - 8)) > OS.range) continue;
        b.dead = true; if (b.fxh && b.fxh.kill) b.fxh.kill();
        const eb = D.bullets && D.bullets[b.v86];
        s.held.push({ dmg: b.dmg || 1, sprite: b.sprite || (eb && eb.sprite) || null, a0: SK.rand() * Math.PI * 2, x: p.x, y: p.y });
      }
    },
    end(G, p) {
      const s = p._abOs; if (!s) return;
      const held = s.held; p._abOs = null;
      // Thả từng viên cách 0,02 s về quái gần nhất trong 15 ô.
      held.forEach((b, i) => G.props.push({ x: b.x, y: 1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt;
          if (q.t < i * OS.gap) return;
          q.gone = true;
          const t = K.nearest(G2, b.x, b.y, OS.shootRange), ang = t ? Math.atan2(ec(t)[1] - b.y, ec(t)[0] - b.x) : SK.rand() * Math.PI * 2;
          if (t) shoot(G2, p, b.x, b.y, ang, { dmg: b.dmg + OS.extra, speed: OS.speed, life: OS.life, critChance: 100, sprite: b.sprite, repel: 1 });
        } }));
    }
  };

  // ================================================================ Lục Mạch Thần Kiếm
  // [ĐO c22 skill 3: cd 11, dur 6, range 14] [WIKI] vũ khí trúng địch thi triển sóng khí công hình quạt bằng 50% sát thương vũ khí (làm tròn lên).
  // Chưa có: truyền nội lực cho nhân vật phe ta (web không có đồng đội cầm vũ khí).
  const MS = { dur: 6, frac: 0.5, len: 5 * U, half: 30, gap: 0.08 };   // độ dài quạt, nhịp tối thiểu [ƯỚC LƯỢNG]
  DUR_UI.meridian_sword = MS.dur;
  S.meridian_sword = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'meridian_sword').dur || MS.dur;
      p._abMs = { last: -9 };
      fx(G, 'effect_c23_skill', p.x, p.y - 8, { follow: p, dy: -8, dur: 1 });
    },
    end(G, p) { p._abMs = null; }
  };
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player, s = p && p._abMs;
    if (!s || p.hero !== 'airbender' || G._skHit || G.t - s.last < MS.gap) return;
    s.last = G.t;
    const [cx, cy] = ec(e), ang = Math.atan2(cy - (p.y - 6), cx - p.x);
    fx(G, 'QigongWave1', cx, cy, { ang, scale: 0.8 });
    cone(G, p, cx, cy, ang, MS.len, MS.half, Math.ceil(dmg * MS.frac), 'qigong', { noMul: true });
  });
})();
