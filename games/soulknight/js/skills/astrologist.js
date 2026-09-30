// Kỹ năng Chiêm Tinh Sư (c32, lớp C33Controller): starfall_surge, rota_fortunae. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số [ĐO] lấy từ config/skills + trường C33Controller (SK_SKILLS86.heroes.astrologist.ctrlFields) + mã IL2CPP (tools/sk_method.py).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, U = SK.PPU;
  const { CTRL, cfg, fx, stopFx, ec, alive, inRadius, nearest, hit, aimDir, hurtMods, layer, timers, setMul, glow } = K;
  const C = (k, d) => CTRL('astrologist', k, d);
  const passiveOn = p => (SK.passiveOn ? SK.passiveOn(p) : true);
  const isSkill1 = p => p.h.skill && p.h.skill.id === 'rota_fortunae';

  // ---------------------------------------------------------------- Tinh Năng + Lời Nguyền Ngôi Sao (nội tại, buff 1014)
  // Mỗi đòn trúng quái cộng 1 Tinh Năng (PlayerBulletHitEnemyEvent → AddPassiveEnergy), đầy ở passiveMax 33 (66 khi mang Bánh Xe Vận Mệnh)
  // [ĐO C33Controller.passiveMax / passiveMaxSkill1]. Lượng cộng mỗi đòn và thời gian giữ Lời Nguyền (BuffAstrologist): [ƯỚC LƯỢNG].
  const CURSE_T = 12;
  const as = p => p._as || (p._as = { en: 0 });
  const cap = p => isSkill1(p) ? C('passiveMaxSkill1', 66) : C('passiveMax', 33);
  const full = p => as(p).en >= cap(p);
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'astrologist' || !passiveOn(p)) return;
    if (!G._skHit) as(p).en = Math.min(cap(p), as(p).en + 1);
    else if (G._skHit === 'star' || G._skHit === 'wheel') curse(G, e);
  });
  function curse(G, e) {
    if (!alive(e)) return;
    if (e._curse && e._curse.h && !e._curse.h.stopped) { e._curse.t = CURSE_T; return; }
    e._curse = { t: CURSE_T, h: fx(G, 'buff_astrologist', e.x, e.y, { follow: e, dy: -(e.hb.off[1]) * e.scale, dur: CURSE_T }) };
  }
  timers.astrologist = (G, p, dt) => {
    if (p.hero !== 'astrologist') return;
    for (const e of G.enemies) if (e._curse) { e._curse.t -= dt; if (e._curse.t <= 0 || !alive(e)) { stopFx(e._curse.h); e._curse = null; } }
  };
  SK.on('runStart', G => { const p = G.player; if (p && p.hero === 'astrologist') { p._as = { en: 0 }; layer(G); } });

  // Sao băng: một ngôi sao bay từ (x, y) tới quái, trúng thì gây sát thương + nguyền; `fall` = rơi từ trên xuống.
  function star(G, p, x, y, target, dmg, spd, ang0) {
    const s = { x, y, t: 0, ang: ang0 };
    s.h = fx(G, 'astrologist_star', x, y, { follow: s, dur: 3, dy: 0 });
    G.props.push({
      x, y: 1e9,
      update(G2, q, dt) {
        s.t += dt;
        if (target && alive(target)) { const [cx, cy] = ec(target); s.ang = Math.atan2(cy - s.y, cx - s.x); }
        s.x += Math.cos(s.ang) * spd * dt; s.y += Math.sin(s.ang) * spd * dt;
        let e = null;
        for (const t of G2.enemies) if (alive(t) && Math.hypot(ec(t)[0] - s.x, ec(t)[1] - s.y) < t.r + 4) { e = t; break; }
        if (e) { hit(G2, p, e, dmg, { critChance: p.crit, ang: s.ang, repel: 1, fx: 'hit_blue', tag: 'star' }); if (passiveOn(p)) curse(G2, e); }
        if (e || s.t > 2 || W.solidAt(G2.map, s.x, s.y + 7)) { q.gone = true; stopFx(s.h); }
      },
      draw() {}
    });
  }
  function fallStar(G, p, e, dmg) {
    const [cx, cy] = ec(e), s = { x: cx, y: cy - 150, t: 0 };
    s.h = fx(G, 'astrologist_fall_star', s.x, s.y, { follow: s, dur: 0.5 });
    G.props.push({
      x: cx, y: 1e9,
      update(G2, q, dt) {
        s.t += dt; s.y += 150 / 0.25 * dt;
        if (s.t >= 0.25) {
          q.gone = true; stopFx(s.h);
          const [x, y] = alive(e) ? ec(e) : [cx, cy];
          fx(G2, 'hit_blue', x, y, {});
          if (alive(e)) hit(G2, p, e, dmg, { critChance: p.crit, repel: 1, tag: 'star' });
        }
      },
      draw() {}
    });
  }

  // ---------------------------------------------------------------- Mưa Sao Băng
  // [ĐO c32/skill 1: cd 6, duration 0.66; C33Controller: addSpeedRate 1 (tốc độ ×2), StartHitTrigger 99 (miễn sát thương), starDashDamage 3,
  // starSpeed 25, tầm bắn StarShootRange 10 ô, starFallDamage 5, starPassiveDamage 66; Skill0PassiveEffect: blastOutPrefab + explode_energy_astrologist_plus,
  // FindEnemies(33) → mỗi quái bị nguyền nhận một sao rơi]. Số sao mỗi bước, bán kính vùng chiêm tinh: [ƯỚC LƯỢNG].
  const SF = { n: 6, blastR: 6 * T, range: 10 * T };
  S.starfall_surge = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'starfall_surge').dur || 0.66;
      p._sf = { t: 0, made: 0, h: fx(G, 'astrologist_star_follow', p.x, p.y, { follow: p, dy: -6 }), fullAtStart: passiveOn(p) && full(p) };
      hurtMods(p).starfall = () => 0;
      setMul(p, 'moveMul', 'starfall', 1 + C('addSpeedRate', 1));
      fx(G, 'buff_astrologist', p.x, p.y, { follow: p, dy: -8, dur: p.skillT });
      if (p._sf.fullAtStart) astrologyArea(G, p);
    },
    update(G, p, dt) {
      const s = p._sf; if (!s) return;
      s.t += dt;
      const dur = cfg(p, 'starfall_surge').dur || 0.66;
      while (s.made < SF.n && s.t >= s.made * dur / SF.n) {
        s.made++;
        const e = nearest(G, p.x, p.y - 7, SF.range);
        const a = e ? Math.atan2(ec(e)[1] - (p.y - 7), ec(e)[0] - p.x) : SK.rand() * 6.283;
        star(G, p, p.x, p.y - 12, e, C('starDashDamage', 3), C('starSpeed', 25) * U, a);
      }
    },
    end(G, p) { const s = p._sf; p._sf = null; if (s) stopFx(s.h); delete hurtMods(p).starfall; setMul(p, 'moveMul', 'starfall', 1); }
  };
  // Thuật Chiêm Tinh: tiêu hết Tinh Năng, vụ nổ xóa đạn địch + gây sát thương phạm vi, sao rơi xuống mọi quái mang Lời Nguyền [ĐO Skill0PassiveEffect].
  function astrologyArea(G, p) {
    as(p).en = 0;
    fx(G, 'explode_blast_out_astrologist', p.x, p.y - 6, {});
    fx(G, 'explode_energy_astrologist_plus', p.x, p.y - 6, {});
    for (const b of G.bullets) if (b.side === 'e' && Math.hypot(b.x - p.x, b.y - (p.y - 6)) < SF.blastR) b.dead = true;
    for (const e of inRadius(G, p.x, p.y - 6, SF.blastR)) hit(G, p, e, C('starPassiveDamage', 66), { critChance: p.crit, repel: 3, fx: 'hit_blue', tag: 'star' });
    for (const e of G.enemies) if (alive(e) && e._curse) fallStar(G, p, e, C('starFallDamage', 5));
    G.shake = Math.max(G.shake, 4);
  }

  // ---------------------------------------------------------------- Bánh Xe Vận Mệnh
  // [ĐO c32/skill 2: cd 7, duration 5; C33Controller: skill1Damage 12, skill1PointDamage 10, skill1RotateSpeed 540, skill1FlyTime 0.5, astrolabeAddSizeFactor 1.1,
  // skill1MaxScale 1.5; prefab astrologist_astrolabe: BulletAstrolabe speed 10, thân /b tròn bán kính 62.9 × 0.75, kim /point (astrologist_astrolabe_point) quay quanh].
  // Bay ra 0.5 s theo hướng ngắm rồi trôi tới quái gần nhất; thân bánh gây 12, kim quay gây 10; bấm K lần nữa thì thu hồi. Đủ Tinh Năng thì phóng bánh to
  // (×1.5) và trong lúc bay mỗi lần Thuật Chiêm Tinh nổ: thêm một lượt sát thương + bánh lớn thêm ×1.1. Nhịp trúng 0.5 s / quái, tốc độ trôi: [ƯỚC LƯỢNG].
  const WH = { r: 62.92 * 0.75 * 0.8, every: 0.5, drift: 5 * U, pointR: 0.9, back: 22 * U };
  S.rota_fortunae = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'rota_fortunae').dur || 5;
      const ang = aimDir(p), big = passiveOn(p) && full(p);
      if (big) as(p).en = 0;
      const w = p._wheel = { x: p.x, y: p.y - 8, ang, t: 0, spin: 0, pa: 0, scale: big ? C('skill1MaxScale', 1.5) : 1, back: false, lock: new Map() };
      const body = SK.prefab('astrologist_astrolabe'), point = SK.prefab('astrologist_astrolabe_point');
      G.props.push({
        x: w.x, y: 1e9,
        update(G2, q, dt) { if (p._wheel !== w) q.gone = true; },
        draw(ctx) {
          if (p._wheel !== w) return;
          SK.drawRip(ctx, body, w.x, w.y, { scale: w.scale, rot: w.spin * 0.05 });
          const a = w.pa;
          if (point) SK.drawRip(ctx, point, w.x + Math.cos(a) * WH.r * w.scale * WH.pointR, w.y + Math.sin(a) * WH.r * w.scale * WH.pointR, { rot: a + Math.PI / 2 });
        }
      });
      if (big) fx(G, 'explode_energy_astrologist_plus', w.x, w.y, { scale: 0.6 });
    },
    update(G, p, dt) {
      const w = p._wheel; if (!w) return;
      w.t += dt; w.spin += dt * 360; w.pa += dt * C('skill1RotateSpeed', 540) * Math.PI / 180;
      const fly = C('skill1FlyTime', 0.5);
      let tx = null, ty = null, spd = 0;
      if (w.back) { tx = p.x; ty = p.y - 8; spd = WH.back; }
      else if (w.t < fly) { spd = 10 * U * (1 - w.t / fly * 0.6); w.x += Math.cos(w.ang) * spd * dt; w.y += Math.sin(w.ang) * spd * dt; }
      else { const e = nearest(G, w.x, w.y, 12 * T); if (e) { [tx, ty] = ec(e); spd = WH.drift; } }
      if (tx != null) {
        const d = Math.hypot(tx - w.x, ty - w.y);
        if (d > 1) { const st = Math.min(d, spd * dt); w.x += (tx - w.x) / d * st; w.y += (ty - w.y) / d * st; }
        if (w.back && d < 8) p.skillT = Math.min(p.skillT, 1e-4);
      }
      if (W.solidAt(G.map, w.x, w.y + 8)) { w.x -= Math.cos(w.ang) * 2; w.y -= Math.sin(w.ang) * 2; }
      // trúng: thân 12, kim 10; mỗi quái cách nhau 0.5 s
      const R = WH.r * w.scale, a = w.pa, px = w.x + Math.cos(a) * R * WH.pointR, py = w.y + Math.sin(a) * R * WH.pointR;
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [cx, cy] = ec(e), lk = w.lock.get(e) || 0;
        if (w.t < lk) continue;
        const pointHit = Math.hypot(cx - px, cy - py) < e.r + 5;
        if (pointHit || Math.hypot(cx - w.x, cy - w.y) < R + e.r) {
          w.lock.set(e, w.t + WH.every);
          hit(G, p, e, pointHit ? C('skill1PointDamage', 10) : C('skill1Damage', 12), { critChance: p.crit, repel: 1, fx: 'hit_blue', tag: 'wheel' });
          if (passiveOn(p)) curse(G, e);
        }
      }
      // Thuật Chiêm Tinh giữa chừng: thêm một lượt sát thương thân bánh và bánh lớn lên
      if (passiveOn(p) && full(p) && w.scale < C('skill1MaxScale', 1.5) - 1e-6 && !w.back) {
        as(p).en = 0;
        w.scale = Math.min(C('skill1MaxScale', 1.5), w.scale * C('astrolabeAddSizeFactor', 1.1));
        fx(G, 'explode_energy_astrologist_plus', w.x, w.y, { scale: 0.5 });
        for (const e of inRadius(G, w.x, w.y, WH.r * w.scale)) hit(G, p, e, C('skill1Damage', 12), { critChance: p.crit, repel: 1, fx: 'hit_blue', tag: 'wheel' });
      }
    },
    press(G, p) { const w = p._wheel; if (w) w.back = true; },
    end(G, p) { p._wheel = null; }
  };
})();
