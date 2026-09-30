// Kỹ năng Chiêm Tinh Sư (c32, lớp C33Controller): starfall_surge, rota_fortunae. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số [ĐO] lấy từ config/skills + trường C33Controller (SK_SKILLS86.heroes.astrologist.ctrlFields) + mã IL2CPP (tools/sk_method.py).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, U = SK.PPU;
  const { CTRL, cfg, fx, stopFx, ec, alive, inRadius, nearest, hit, aimDir, hurtMods, layer, timers, setMul } = K;
  const C = (k, d) => CTRL('astrologist', k, d);
  const passiveOn = p => (SK.passiveOn ? SK.passiveOn(p) : true);
  const isSkill1 = p => p.h.skill && p.h.skill.id === 'rota_fortunae';

  // ---------------------------------------------------------------- Tinh Năng + Lời Nguyền Ngôi Sao (nội tại, buff 1014; cần c_level ≥ 6 = SK.passiveOn)
  // Lời Nguyền [ĐO prefab buff_astrologist: buff_time 6, maxCount 3, interval 0,033; BuffAstrologist.OnBuffStart/OnOverlap/TryCreateExplodeAndStar]: mỗi lần Sao (skill 1) hoặc
  // Bánh Xe (skill 2) trúng quái là một lượt nguyền (cách nhau ≥ 0,033 s), làm mới 6 s; đủ 3 lượt thì bỏ Lời Nguyền và tạo sao rơi (Sao) hoặc đòn thêm của bánh (Bánh Xe).
  // Tinh Năng [ĐO C33Controller.AddPassiveEnergy/CreateStar/CreateAstrolabeBullet/Skill2HitEnemy]: +1 mỗi sao rơi và mỗi đòn thêm của bánh, và +1 mỗi lần thân/kim Bánh Xe
  // trúng quái (đang thi triển skill 2); không có trần khi cộng, thanh chỉ hiện tới passiveMax 33 (66 khi mang Bánh Xe Vận Mệnh) [RefreshPassiveStateBarUI]; đòn đánh thường không cộng.
  const CURSE = { t: 6, max: 3, gap: 0.033 };
  const as = p => p._as || (p._as = { en: 0 });
  const cap = p => isSkill1(p) ? C('passiveMaxSkill1', 66) : C('passiveMax', 33);
  const full = p => as(p).en >= cap(p);
  const addEn = (p, n) => { if (passiveOn(p)) as(p).en += n; };
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'astrologist' || !passiveOn(p)) return;
    if (G._skHit === 'star' || G._skHit === 'wheel') curse(G, p, e, G._skHit === 'wheel' ? 1 : 0);
  });
  function curse(G, p, e, idx) {
    if (!alive(e)) return;
    let c = e._curse;
    if (!c) c = e._curse = { n: 0, t: CURSE.t, gap: 0, h: fx(G, 'buff_astrologist', e.x, e.y, { follow: e, dy: -(e.hb.off[1]) * e.scale, dur: CURSE.t }) };
    c.t = CURSE.t;
    if (c.gap > 0) return;
    c.gap = CURSE.gap; c.n++;
    if (c.n < CURSE.max) return;
    stopFx(c.h); e._curse = null;
    if (idx) wheelBonus(G, p); else fallStar(G, p, e);
  }
  timers.astrologist = (G, p, dt) => {
    if (p.hero !== 'astrologist') return;
    for (const e of G.enemies) {
      const c = e._curse; if (!c) continue;
      c.t -= dt; c.gap -= dt;
      if (c.t <= 0 || !alive(e)) { stopFx(c.h); e._curse = null; }
    }
  };
  SK.on('runStart', G => { const p = G.player; if (p && p.hero === 'astrologist') { p._as = { en: 0 }; layer(G); } });

  // Sao băng: một ngôi sao bay từ (x, y) tới quái, xuyên tối đa starThroughCount 12 quái, mỗi quái một lần [ĐO C33Controller.StarDash: starThroughCount 12, starDashDamage];
  // starReflectionCount 12 (nảy tường) chưa làm: gặp tường là tan [ƯỚC LƯỢNG].
  function star(G, p, x, y, target, dmg, spd, ang0) {
    const s = { x, y, t: 0, ang: ang0 }, hits = [];
    s.h = fx(G, 'astrologist_star', x, y, { follow: s, dur: 3, dy: 0 });
    G.props.push({
      x, y: 1e9,
      update(G2, q, dt) {
        s.t += dt;
        if (target && alive(target) && !hits.length) { const [cx, cy] = ec(target); s.ang = Math.atan2(cy - s.y, cx - s.x); }
        s.x += Math.cos(s.ang) * spd * dt; s.y += Math.sin(s.ang) * spd * dt;
        for (const t of G2.enemies) {
          if (!alive(t) || hits.indexOf(t) >= 0 || Math.hypot(ec(t)[0] - s.x, ec(t)[1] - s.y) >= t.r + 4) continue;
          hits.push(t);
          hit(G2, p, t, dmg, { critChance: p.crit, ang: s.ang, repel: 1, fx: 'hit_blue', tag: 'star' });
        }
        if (hits.length >= C('starThroughCount', 12) || s.t > 2 || W.solidAt(G2.map, s.x, s.y + 7)) { q.gone = true; stopFx(s.h); }
      },
      draw() {}
    });
  }
  // Sao rơi [ĐO prefab astrologist_fall_star: boom_time 0,44 → explode_energy_astrologist damage starFallDamage 5, scaleFactor 1,5]: cộng 1 Tinh Năng lúc tạo.
  // Bán kính nổ (scaleFactor 1,5 nhân bán kính gốc chưa bóc): [ƯỚC LƯỢNG 1,5 đơn vị].
  const FALL = { boom: 0.44, r: 1.5 * U };
  function fallStar(G, p, e) {
    addEn(p, 1);
    const [cx, cy] = ec(e), s = { x: cx, y: cy - 150, t: 0 };
    s.h = fx(G, 'astrologist_fall_star', s.x, s.y, { follow: s, dur: FALL.boom + 0.1 });
    G.props.push({
      x: cx, y: 1e9,
      update(G2, q, dt) {
        s.t += dt; s.y += 150 / FALL.boom * dt;
        if (s.t >= FALL.boom) {
          q.gone = true; stopFx(s.h);
          const [x, y] = alive(e) ? ec(e) : [cx, cy];
          fx(G2, 'hit_blue', x, y, {});
          for (const t of inRadius(G2, x, y, FALL.r)) hit(G2, p, t, C('starFallDamage', 5), { critChance: p.crit, repel: 1, tag: 'fall' });
        }
      },
      draw() {}
    });
  }

  // ---------------------------------------------------------------- Mưa Sao Băng
  // [ĐO c32/skill 1: cd 6, duration 0.66; C33Controller: addSpeedRate 1 (tốc độ ×2), StartHitTrigger 99 (miễn sát thương), starDashDamage 3, starSpeed 25,
  // StarDash: số sao = countMax (sao đang bay quanh người, web không có: 0) + extraStarCount 9 + 3 khi có nâng cấp, tìm quái trong 25 đơn vị (FindEnemies(25));
  // Skill0PassiveEffect: blastOutPrefab + explode_energy_astrologist_plus starPassiveDamage 66, FindEnemies(33) → mỗi quái bị nguyền nhận một sao rơi (starFallDamage 5)].
  // Bán kính vùng chiêm tinh (chưa đọc prefab explode_blast_out_astrologist), thời điểm mỗi sao trong 0,66 s: [ƯỚC LƯỢNG].
  const SF = { blastR: 6 * T, range: 25 * U, curseRange: 33 * U };
  S.starfall_surge = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'starfall_surge').dur || 0.66;
      const n = C('extraStarCount', 9) + (passiveOn(p) ? 3 : 0);
      p._sf = { t: 0, made: 0, n, h: fx(G, 'astrologist_star_follow', p.x, p.y, { follow: p, dy: -6 }), fullAtStart: passiveOn(p) && full(p) };
      hurtMods(p).starfall = () => 0;
      setMul(p, 'moveMul', 'starfall', 1 + C('addSpeedRate', 1));
      fx(G, 'buff_astrologist', p.x, p.y, { follow: p, dy: -8, dur: p.skillT });
      if (p._sf.fullAtStart) astrologyArea(G, p);
    },
    update(G, p, dt) {
      const s = p._sf; if (!s) return;
      s.t += dt;
      const dur = cfg(p, 'starfall_surge').dur || 0.66;
      while (s.made < s.n && s.t >= s.made * dur / s.n) {
        s.made++;
        const e = nearest(G, p.x, p.y - 7, SF.range);
        const a = e ? Math.atan2(ec(e)[1] - (p.y - 7), ec(e)[0] - p.x) : SK.rand() * 6.283;
        star(G, p, p.x, p.y - 12, e, C('starDashDamage', 3), C('starSpeed', 25) * U, a);
      }
    },
    end(G, p) { const s = p._sf; p._sf = null; if (s) stopFx(s.h); delete hurtMods(p).starfall; setMul(p, 'moveMul', 'starfall', 1); }
  };
  // Thuật Chiêm Tinh: tiêu hết Tinh Năng, vụ nổ xóa đạn địch + gây sát thương phạm vi, sao rơi xuống mọi quái mang Lời Nguyền trong 33 đơn vị [ĐO Skill0PassiveEffect].
  function astrologyArea(G, p) {
    as(p).en = 0;
    fx(G, 'explode_blast_out_astrologist', p.x, p.y - 6, {});
    fx(G, 'explode_energy_astrologist_plus', p.x, p.y - 6, {});
    for (const b of G.bullets) if (b.side === 'e' && Math.hypot(b.x - p.x, b.y - (p.y - 6)) < SF.blastR) b.dead = true;
    for (const e of inRadius(G, p.x, p.y - 6, SF.blastR)) hit(G, p, e, C('starPassiveDamage', 66), { critChance: p.crit, repel: 3, fx: 'hit_blue', tag: 'area' });
    for (const e of G.enemies) if (alive(e) && e._curse && Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y) < SF.curseRange) { stopFx(e._curse.h); e._curse = null; fallStar(G, p, e); }
    G.shake = Math.max(G.shake, 4);
  }

  // ---------------------------------------------------------------- Bánh Xe Vận Mệnh
  // [ĐO c32/skill 2: cd 7, duration 5; C33Controller: skill1Damage 12, skill1PointDamage 10, skill1RotateSpeed 540, skill1FlyTime 0.5, astrolabeAddSizeFactor 1.1,
  // skill1MaxScale 1.5, astrolabeSpeed 5 (đơn vị/s, tốc trôi tới quái); prefab astrologist_astrolabe: BulletAstrolabe speed 10, thân /b tròn bán kính 62.9 × 0.75, kim /point
  // (astrologist_astrolabe_point) quay quanh; TryEnlargeAstrolabe: mỗi lần Lời Nguyền của Bánh Xe đủ 3 lượt thì bánh thêm ×1,1 (tới skill1MaxScale), quay +skill1RotateAddSpeed 60,
  // bay thêm skill1FlyTimeAdd 0,125 s và gây thêm skill1Damage 12 một lần (astrologist_astrolabe_damage, 0,5 s)].
  // Bay ra 0.5 s theo hướng ngắm rồi trôi tới quái gần nhất; bấm K lần nữa thì thu hồi. Đủ Tinh Năng (passiveMaxSkill1 66) thì phóng bánh to (skill1MaxScale 1,5) và tiêu hết Tinh Năng.
  // Nhịp trúng 0.5 s / quái, tốc thu hồi, bán kính vùng đòn thêm: [ƯỚC LƯỢNG].
  const WH = { r: 62.92 * 0.75 * 0.8, every: 0.5, drift: 5 * U, pointR: 0.9, back: 22 * U };
  S.rota_fortunae = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'rota_fortunae').dur || 5;
      const ang = aimDir(p), big = passiveOn(p) && full(p);
      if (big) as(p).en = 0;
      const w = p._wheel = { x: p.x, y: p.y - 8, ang, t: 0, spin: 0, pa: 0, rot: C('skill1RotateSpeed', 540), fly: C('skill1FlyTime', 0.5), scale: big ? C('skill1MaxScale', 1.5) : 1, back: false, lock: new Map() };
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
      w.t += dt; w.spin += dt * 360; w.pa += dt * w.rot * Math.PI / 180;
      let tx = null, ty = null, spd = 0;
      if (w.back) { tx = p.x; ty = p.y - 8; spd = WH.back; }
      else if (w.t < w.fly) { spd = 10 * U * (1 - w.t / w.fly * 0.6); w.x += Math.cos(w.ang) * spd * dt; w.y += Math.sin(w.ang) * spd * dt; }
      else { const e = nearest(G, w.x, w.y, 12 * T); if (e) { [tx, ty] = ec(e); spd = WH.drift; } }
      if (tx != null) {
        const d = Math.hypot(tx - w.x, ty - w.y);
        if (d > 1) { const st = Math.min(d, spd * dt); w.x += (tx - w.x) / d * st; w.y += (ty - w.y) / d * st; }
        if (w.back && d < 8) p.skillT = Math.min(p.skillT, 1e-4);
      }
      if (W.solidAt(G.map, w.x, w.y + 8)) { w.x -= Math.cos(w.ang) * 2; w.y -= Math.sin(w.ang) * 2; }
      // trúng: thân 12, kim 10; mỗi quái cách nhau 0.5 s; mỗi lần trúng +1 Tinh Năng [ĐO Skill2HitEnemy]
      const R = WH.r * w.scale, a = w.pa, px = w.x + Math.cos(a) * R * WH.pointR, py = w.y + Math.sin(a) * R * WH.pointR;
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [cx, cy] = ec(e), lk = w.lock.get(e) || 0;
        if (w.t < lk) continue;
        const pointHit = Math.hypot(cx - px, cy - py) < e.r + 5;
        if (pointHit || Math.hypot(cx - w.x, cy - w.y) < R + e.r) {
          w.lock.set(e, w.t + WH.every);
          hit(G, p, e, pointHit ? C('skill1PointDamage', 10) : C('skill1Damage', 12), { critChance: p.crit, repel: 1, fx: 'hit_blue', tag: 'wheel' });
          addEn(p, 1);
        }
      }
    },
    press(G, p) { const w = p._wheel; if (w) w.back = true; },
    end(G, p) { p._wheel = null; }
  };
  // Đòn thêm của Bánh Xe khi Lời Nguyền đủ lượt [ĐO C33Controller.CreateAstrolabeBullet/TryEnlargeAstrolabe].
  function wheelBonus(G, p) {
    const w = p._wheel; if (!w || w.back) return;
    addEn(p, 1);
    const top = C('skill1MaxScale', 1.5);
    if (w.scale < top - 1e-6) w.scale = Math.min(top, w.scale * C('astrolabeAddSizeFactor', 1.1));
    w.rot += C('skill1RotateAddSpeed', 60); w.fly += C('skill1FlyTimeAdd', 0.125);
    fx(G, 'explode_energy_astrologist_plus', w.x, w.y, { scale: 0.5 });
    for (const e of inRadius(G, w.x, w.y, WH.r * w.scale)) hit(G, p, e, C('skill1Damage', 12), { critChance: p.crit, repel: 1, fx: 'hit_blue', tag: 'wheelx' });
  }
})();
