// Kỹ năng Nữ Hoàng Cơ Giới (c37): iridescent_resonance. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ ctrlFields của SK_SKILLS86.heroes.aigirl và mã C38Controller (sk_method.py): DoSkill0 / RoleSkill0 / BtnSkillDown (ba trạng thái
// Empty/One/Laser), CreateMissile.MoveNext, UpdateLaser.MoveNext, LaserOnEliminate, RestoreEnergy, OnPlayerBulletHitEnemy, BatteryItem.GetItem [ĐO].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, W = SK.world, I = SK.input;
  const { alive, ec, hit, fx, CTRL, layer } = K;
  const C = (k, d) => CTRL('aigirl', k, d);
  const CELL = 25;   // một ô = currentMaxBattery / MaxBatteryCount(4) [ĐO C38Controller.get_CurrentBatteryCount: floor(pin / (max / 4))]
  const AI = {
    speed: 10 * U, gap: 0.02, lockR: 14 * U,   // bezierSpeed 10 ô/s, WaitForSeconds(0.02) giữa hai quả, FindEnemies(14) [ĐO CreateMissile.MoveNext]
    jitter: 10, curve: 1.15,                   // lệch hướng ban đầu ±10° (RGRandom.Range(-10,10)) [ĐO]; đường cong dài hơn dây cung ~15% [ƯỚC LƯỢNG]
    shortLen: 20 * U, shortT: 0.25,            // tia ngắn dài laserBaseLength ô [ĐO], hiện 0.25 s [ƯỚC LƯỢNG: hiệu ứng prefab]
    dropP: 0.1, dropLife: 20,                  // rơi pin: RGRandom.Range(0,10) <= 0 [ĐO OnPlayerBulletHitEnemy]; tồn tại 20 s [ƯỚC LƯỢNG]
    addEvery: 15, addMax: 16                   // laser +1 sát thương mỗi laserAddDamage=15 điện tiêu; dừng khi đếm > laserMaxAddDamage(15) [ĐO UpdateLaser.MoveNext]
  };
  const st = p => p._ai || (p._ai = { bat: 0, ph: null, beam: null, n: 0 });
  const maxBat = p => C('currentMaxBattery', 100);
  const addBat = (p, v) => { const s = st(p); s.bat = Math.max(0, Math.min(maxBat(p), s.bat + v)); };
  const isAi = p => p && p.hero === 'aigirl';

  // ---------------------------------------------------------------- tên lửa chiến thuật
  // BulletAiGirlMissile [ĐO speed 10, destroy_time 5; ExplodeEffectTrigger explode_s_hit_enemy_sweet_talk useParentInfo]: bay vòng
  // cung (Bézier, bezierSpeed 10) tới quái, xuyên tường, nổ bằng sát thương của chính nó = missileDamage. Mỗi quả lấy một quái trong
  // FindEnemies(14) theo thứ tự; hết quái thì bay ra điểm mặc định BezierDefaultLen 10 ô [ĐO CreateMissile.MoveNext].
  function launchMissiles(G, p, n, dmg) {
    const en = G.enemies.filter(alive).filter(e => Math.hypot(e.x - p.x, e.y - p.y) <= AI.lockR).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const frame = SK.frame('aigirl_missile');
    for (let i = 0; i < n; i++) {
      const tgt = en[i] || null, dir = p.aim + SK.randf(-AI.jitter, AI.jitter) * Math.PI / 180;
      const m = { t: -i * AI.gap, x: p.x, y: p.y - 10, x0: p.x, y0: p.y - 10, e: tgt, ang: dir, k: 0,
        bx: SK.randf(0.25, 0.75) * (i % 2 ? 1 : -1), by: -SK.randf(0.25, 0.75),   // hệ số Range(0.25,0.75) / (-0.75,-0.25) [ĐO], nhân dây cung [ƯỚC LƯỢNG]
        fallback: [p.x + Math.cos(dir) * 10 * U, p.y - 6 + Math.sin(dir) * 10 * U] };
      G.props.push({
        x: 0, y: 1e9, t: 0,
        update(G2, q, dt) {
          m.t += dt; if (m.t < 0) return;
          const [tx, ty] = m.e && alive(m.e) ? ec(m.e) : m.fallback;
          m.k = Math.min(1, m.k + AI.speed * dt / Math.max(8, Math.hypot(tx - m.x0, ty - m.y0) * AI.curve));
          const k = m.k, ch = Math.hypot(tx - m.x0, ty - m.y0), cx = (m.x0 + tx) / 2 + m.bx * ch, cy = Math.min(m.y0, ty) + m.by * ch;
          const nx = (1 - k) * (1 - k) * m.x0 + 2 * (1 - k) * k * cx + k * k * tx, ny = (1 - k) * (1 - k) * m.y0 + 2 * (1 - k) * k * cy + k * k * ty;
          m.ang = Math.atan2(ny - m.y, nx - m.x); m.x = nx; m.y = ny;
          if (k >= 1) {
            q.gone = true;
            G2._skHit = 'skill';
            SK.explode86(G2, 'explode_s_hit_enemy_sweet_talk', m.x, m.y, { side: 'p', dmg: Math.max(1, Math.round(dmg * (p.dmgMul || 1))), size: 1 });
            G2._skHit = null;
          }
        },
        draw(ctx) { if (m.t >= 0 && frame) SK.draw(ctx, 'aigirl_missile', m.x, m.y, { rot: m.ang }); }
      });
    }
  }

  // ---------------------------------------------------------------- tia laser
  // [ĐO ctrl: laserBaseWidth 1, laserBaseLength 20, laserAddWidth [1, 0.1], laserMaxAddWidth 2.5, laserAbsorbRange 4, laserBaseDamage 5,
  // laserDamageInterval 0.2, laserAddDamage 15 / laserMaxAddDamage 15, laserRotateSpeed 40, laserRotateAngle 30, laserMissileCountPerBullet
  // [5, 2], laserBatteryCost 12 (tutor 5), laserMissileCount 5]: quét ±30° với 40°/s, hút đạn địch trong 4 ô để nở rộng thêm 0.1 ô mỗi
  // viên (tối đa +2.5), cứ 5 viên hút được thì bắn thêm 2 tên lửa; sát thương 5 + 15 × (độ nở / 2.5) mỗi 0.2 s; tốn 12 điện lượng/s.
  function beamEnd(G, x, y, ang, len) {
    const c = Math.cos(ang), s = Math.sin(ang);
    let L = 0;
    while (L < len) { L += 4; if (W.solidAt(G.map, x + c * L, y + s * L + 6)) { L -= 4; break; } }
    return L;
  }
  function startLaser(G, p) {
    const s = st(p);
    s.ph = { mode: 'laser', t: 0, tick: 0, base: p.aim, add: 0, absorbed: 0, spent: 0, addDmg: 0, missT: 0 };
    p.skillT = s.bat / C('laserBatteryCost', 12);   // chạy tới khi hết điện; skillT là thời gian điện còn đủ
    s.beam = s.ph;
    const b = s.ph;
    G.props.push({
      x: 0, y: 1e9 - 1, t: 0,
      update(G2, q) { if (st(p).beam !== b) q.gone = true; },
      draw(ctx) { drawBeam(ctx, beamPose(p, b), b.len || 0, b.add); }
    });
  }
  function beamPose(p, b) {
    const amp = C('laserRotateAngle', 30) * Math.PI / 180, w = C('laserRotateSpeed', 40) * Math.PI / 180;
    const ph = (b.t * w + amp) % (4 * amp), tri = ph < 2 * amp ? ph - amp : 3 * amp - ph;   // sóng tam giác −amp..amp, bắt đầu ở 0
    return { x: p.x + Math.cos(p.aim) * 6, y: p.y - 8, ang: b.base + tri };
  }
  function drawBeam(ctx, o, L, add) {
    const wdt = (C('laserBaseWidth', 1) + add) * U;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.ang);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,70,200,0.35)'; ctx.fillRect(0, -wdt / 2 - 2, L, wdt + 4);
    ctx.fillStyle = 'rgba(255,150,230,0.7)'; ctx.fillRect(0, -wdt / 2, L, wdt);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, -wdt / 5, L, wdt * 0.4);
    ctx.restore();
    K.glow(ctx, o.x, o.y, 18, [1, 0.5, 0.9, 0.5]); K.glow(ctx, o.x + Math.cos(o.ang) * L, o.y + Math.sin(o.ang) * L, 14, [1, 0.5, 0.9, 0.4]);
  }
  function laserTick(G, p, dt) {
    const s = st(p), b = s.ph;
    b.t += dt; b.tick -= dt;
    const cost = C('laserBatteryCost', 12) * dt, lm = C('laserMissile', [2.5, 4]);
    addBat(p, -cost);
    b.spent += cost; b.missT += dt;
    if (b.spent >= AI.addEvery && b.addDmg < AI.addMax) { b.spent -= AI.addEvery; b.addDmg++; }
    if (b.missT >= lm[0]) { b.missT -= lm[0]; launchMissiles(G, p, lm[1], C('missileDamage', 5)); G.shake = Math.max(G.shake, 1); }
    const o = beamPose(p, b);
    b.len = beamEnd(G, o.x, o.y, o.ang, C('laserBaseLength', 20) * U);
    const c = Math.cos(o.ang), sn = Math.sin(o.ang), wdt = (C('laserBaseWidth', 1) + b.add) * U;
    const rel = (x, y) => { const dx = x - o.x, dy = y - o.y; return [dx * c + dy * sn, -dx * sn + dy * c]; };
    // Hút đạn địch nằm trong laserAbsorbRange ô quanh tia.
    for (const q of G.bullets) {
      if (q.side !== 'e' || q.dead) continue;
      const [u, v] = rel(q.x, q.y);
      if (u < 0 || u > b.len || Math.abs(v) > C('laserAbsorbRange', 4) * U) continue;
      q.dead = true; b.absorbed++;
      b.add = Math.min(C('laserMaxAddWidth', 2.5), b.add + C('laserAddWidth', [1, 0.1])[1]);
      const mc = C('laserMissileCountPerBullet', [5, 2]);
      if (b.absorbed % mc[0] === 0) launchMissiles(G, p, mc[1], C('missileDamage', 5));
    }
    if (b.tick <= 0) {
      b.tick = C('laserDamageInterval', 0.2);
      const dmg = C('laserBaseDamage', 5) + b.addDmg;
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [cx, cy] = ec(e), [u, v] = rel(cx, cy);
        if (u > -4 && u < b.len + 4 && Math.abs(v) < wdt / 2 + e.r) hit(G, p, e, Math.round(dmg), { tag: 'laser', ang: o.ang, repel: 1, fx: 'hit_white', critChance: p.crit });
      }
    }
    p.skillT = st(p).bat > 0 ? st(p).bat / C('laserBatteryCost', 12) : 1e-4;   // hết điện lượng thì dừng
  }
  // Nhấn nhanh: hết ô điện thì chỉ tên lửa; còn ≥ 1 ô thì tốn 1 ô, tên lửa nhiều hơn + tia ngắn.
  function tap(G, p) {
    const s = st(p);
    if (s.bat >= CELL) {
      addBat(p, -CELL);
      launchMissiles(G, p, C('batteryMissileCount', 5), C('missileDamage', 5));
      const { ang } = K.targetAng(G, p, 14 * T), o = { x: p.x + Math.cos(ang) * 6, y: p.y - 8 }, L = beamEnd(G, o.x, o.y, ang, AI.shortLen);
      G.props.push({ x: 0, y: 1e9 - 1, t: 0, update(G2, q, dt) { q.t += dt; if (q.t > AI.shortT) q.gone = true; },
        draw(ctx, G2, q) { ctx.save(); ctx.globalAlpha = 1 - q.t / AI.shortT; drawBeam(ctx, { x: o.x, y: o.y, ang }, L, 0); ctx.restore(); } });
      const c = Math.cos(ang), sn = Math.sin(ang);
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [cx, cy] = ec(e), dx = cx - o.x, dy = cy - o.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
        if (u > -4 && u < L + 4 && Math.abs(v) < C('laserBaseWidth', 1) * U / 2 + e.r) hit(G, p, e, C('batteryDamage', 4), { tag: 'laser', ang, repel: 1, fx: 'hit_white', critChance: p.crit });
      }
    } else launchMissiles(G, p, C('missileCount', 3), C('missileDamage', 5));
    s.ph = null; p.skillT = Math.min(p.skillT, 1e-4);
  }

  S.iridescent_resonance = {
    start(G, p) {
      layer(G);
      const s = st(p);
      s.ph = { mode: 'hold', t: 0, charged: false };
      p.skillT = 30;   // chờ nhả phím; hết pha thì đặt lại về 0
    },
    update(G, p, dt) {
      const s = st(p), b = s.ph; if (!b) { p.skillT = Math.min(p.skillT, 1e-4); return; }
      if (b.mode === 'laser') { laserTick(G, p, dt); return; }
      if (I.down('skill')) {   // giữ đủ pressTime thì tụ lực xong
        b.t += dt;
        if (!b.charged && b.t >= C('pressTime', 1) && s.bat >= CELL) { b.charged = true; fx(G, 'battery_item', p.x, p.y - 14, { dur: 0.4 }); }
        return;
      }
      if (b.charged) startLaser(G, p); else tap(G, p);
    },
    end(G, p) { const s = st(p); s.ph = null; s.beam = null; }
  };

  // ---------------------------------------------------------------- điện lượng
  // Hai nguồn [ĐO]: (1) RestoreEnergy: mỗi lần năng lượng bị TRỪ (EnergyChangedEvent.value <= 0) pin += energyConvertRatio × số năng lượng tiêu;
  // (2) OnPlayerBulletHitEnemy: đạn của mình hạ quái (HP <= 0) khi pin < 1 ô thì 10% rơi một battery_item, nhặt cộng BatteryItem.value.
  const batteryFrame = () => (SK.prefab('battery_item') || []).map(q => q.f).find(f => f && SK.frame(f));
  K.timers.aigirl = (G, p) => {
    if (!isAi(p)) return;
    const s = st(p);
    if (s.en != null && p.energy < s.en) addBat(p, (s.en - p.energy) * C('energyConvertRatio', 1));
    s.en = p.energy;
  };
  SK.on('enemyHit', (G, e) => {
    const p = G.player; if (!isAi(p) || !G._hitBullet || e.hp > 0 || st(p).bat >= maxBat(p) / 4 || SK.rand() >= AI.dropP) return;
    const val = K.MB('battery_item', 'BatteryItem', 'value', 5), spr = batteryFrame();
    G.props.push({
      x: e.x, y: e.y, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (q.t > 0.3 && d < 5 * U) { q.x += (p.x - q.x) * Math.min(1, dt * 8); q.y += (p.y - q.y) * Math.min(1, dt * 8); }
        if (q.t > 0.3 && d < 8) { q.gone = true; addBat(p, val); SK.num(G2, p.x, p.y - 26, '+' + val, '#ff8ae8'); }
        if (q.t > AI.dropLife) q.gone = true;
      },
      draw(ctx, G2, q) { if (spr) SK.draw(ctx, spr, q.x, q.y - 4 - Math.sin(q.t * 4) * 1.5); }
    });
  });
  // Vị trí nút kỹ năng trên HUD uGUI (đơn vị khung nhìn); không có thì góc phải dưới.
  function skillBtn() {
    const v = SK.view, r = SK.hud && SK.hud.rect && SK.hud.rect('control/btn_skill');
    return r ? { x: r.x / v.scale, y: r.y / v.scale, w: r.w / v.scale } : { x: v.w - 46, y: v.h - 40, w: 32 };
  }
  // Thanh điện lượng 4 ô trên nút kỹ năng.
  SK.on('hud', (ctx, G) => {
    const p = G.player; if (!isAi(p) || !p._ai || G.state !== 'stage') return;
    const b = skillBtn(), w = Math.floor((b.w - 3) / 4), s = p._ai;
    for (let i = 0; i < 4; i++) {
      const x = Math.round(b.x) + i * (w + 1), y = Math.round(b.y) - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, 5);
      const f = Math.max(0, Math.min(1, (s.bat - i * CELL) / CELL));
      ctx.fillStyle = s.bat >= maxBat(p) ? '#ffe36a' : '#ff8ae8'; ctx.fillRect(x, y, Math.round(w * f), 5);
    }
  });
  SK.on('runStart', G => { const p = G.player; if (isAi(p)) { p._ai = null; layer(G); } });
  SK.on('stageEnter', G => { const p = G.player; if (isAi(p) && p._ai) p._ai.beam = null; });
})();
