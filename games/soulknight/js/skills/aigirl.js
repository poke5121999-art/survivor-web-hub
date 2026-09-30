// Kỹ năng Nữ Hoàng Cơ Giới (c37): iridescent_resonance. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ ctrlFields của SK_SKILLS86.heroes.aigirl (controller C38Controller trong dump.cs: C38Skill0State Empty/One/Laser,
// coroutine CreateMissile có bezierX/bezierY, UpdateLaser) và MonoBehaviour skill1_missile / skill1_laser / battery_item [ĐO];
// logic nằm trong mã IL2CPP nên cách áp số là [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, W = SK.world, I = SK.input;
  const { alive, ec, nearest, hit, fx, cfg, CTRL, layer } = K;
  const C = (k, d) => CTRL('aigirl', k, d);
  const CELL = 25;   // một ô điện lượng: 100 / 4 ô [WIKI: "dưới 25 điểm = dưới 1 ô"]
  const AI = {
    fly: 0.7, missileR: 1.5 * T, pop: 0.35, gap: 0.08,   // thời gian bay theo đường Bézier, bán kính nổ, độ trễ giữa các quả [ƯỚC LƯỢNG]
    shortLen: 20 * U, shortT: 0.25,                       // tia ngắn dài laserBaseLength ô [ĐO], hiện 0.25 s [ƯỚC LƯỢNG]
    dropRate: 0.25, gainEnergy: 5                         // xác suất rơi pin, điện lượng cộng mỗi viên năng lượng nhặt [ƯỚC LƯỢNG]; battery_item.value 5 [ĐO]
  };
  const st = p => p._ai || (p._ai = { bat: 0, ph: null, beam: null, n: 0 });
  const maxBat = p => C('currentMaxBattery', 100);
  const addBat = (p, v) => { const s = st(p); s.bat = Math.max(0, Math.min(maxBat(p), s.bat + v)); };
  const isAi = p => p && p.hero === 'aigirl';

  // ---------------------------------------------------------------- tên lửa chiến thuật
  // BulletAiGirlMissile [ĐO speed 10, destroy_time 5; ExplodeEffectTrigger explode_s_hit_enemy_sweet_talk useParentInfo]: bay vòng
  // cung (Bézier) tới quái, xuyên tường, nổ bằng sát thương của chính nó = missileDamage.
  function launchMissiles(G, p, n, dmg) {
    const en = G.enemies.filter(alive).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const frame = SK.frame('aigirl_missile');
    for (let i = 0; i < n; i++) {
      const tgt = en.length ? en[i % en.length] : null;
      const m = { t: -i * AI.gap, x: p.x, y: p.y - 10, x0: p.x, y0: p.y - 10, e: tgt, ang: 0,
        bx: SK.randf(-3, 3) * T * (i % 2 ? 1 : -1), by: -SK.randf(3, 6) * T, fallback: [p.x + Math.cos(p.aim) * 8 * T, p.y - 6 + Math.sin(p.aim) * 8 * T] };
      G.props.push({
        x: 0, y: 1e9, t: 0,
        update(G2, q, dt) {
          m.t += dt; if (m.t < 0) return;
          const [tx, ty] = m.e && alive(m.e) ? ec(m.e) : (m.e = nearest(G2, m.x, m.y, 12 * T)) ? ec(m.e) : m.fallback;
          const k = Math.min(1, m.t / AI.fly), cx = (m.x0 + tx) / 2 + m.bx, cy = Math.min(m.y0, ty) + m.by;
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
    s.ph = { mode: 'laser', t: 0, tick: 0, base: p.aim, add: 0, absorbed: 0, left: cfg(p, 'iridescent_resonance').dur || 5 };
    p.skillT = s.ph.left;
    launchMissiles(G, p, C('laserMissileCount', 5), C('missileDamage', 5));
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
    addBat(p, -C('laserBatteryCost', 12) * dt);
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
      const dmg = C('laserBaseDamage', 5) + C('laserMaxAddDamage', 15) * b.add / C('laserMaxAddWidth', 2.5);
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [cx, cy] = ec(e), [u, v] = rel(cx, cy);
        if (u > -4 && u < b.len + 4 && Math.abs(v) < wdt / 2 + e.r) hit(G, p, e, Math.round(dmg), { tag: 'laser', ang: o.ang, repel: 1, fx: 'hit_white', critChance: p.crit });
      }
    }
    b.left -= dt;
    if (st(p).bat <= 0 || b.left <= 0) p.skillT = Math.min(p.skillT, 1e-4);   // hết điện lượng thì dừng
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

  // ---------------------------------------------------------------- điện lượng: pin rơi từ quái + viên năng lượng nhặt được
  const batteryFrame = () => (SK.prefab('battery_item') || []).map(q => q.f).find(f => f && SK.frame(f));
  SK.on('enemyKill', (G, e) => {
    const p = G.player; if (!isAi(p) || SK.rand() > AI.dropRate) return;
    const val = K.MB('battery_item', 'BatteryItem', 'value', 5), spr = batteryFrame();
    G.props.push({
      x: e.x, y: e.y, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (q.t > 0.3 && d < 5 * U) { q.x += (p.x - q.x) * Math.min(1, dt * 8); q.y += (p.y - q.y) * Math.min(1, dt * 8); }
        if (q.t > 0.3 && d < 8) { q.gone = true; addBat(p, val); SK.num(G2, p.x, p.y - 26, '+' + val, '#ff8ae8'); }
        if (q.t > 20) q.gone = true;
      },
      draw(ctx, G2, q) { if (spr) SK.draw(ctx, spr, q.x, q.y - 4 - Math.sin(q.t * 4) * 1.5); }
    });
  });
  SK.on('pickup', (G, kind) => { const p = G.player; if (isAi(p) && kind === 'energy') addBat(p, AI.gainEnergy * C('energyConvertRatio', 1)); });
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
  SK.on('runStart', G => { const p = G.player; if (isAi(p)) { p._ch = null; p._ai = null; } });   // max 3 trong config không phải số lượt
  SK.on('stageEnter', G => { const p = G.player; if (isAi(p) && p._ai) p._ai.beam = null; });
})();
