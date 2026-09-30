// Kỹ năng Ninja Xuyên Không (c20): time_space_shuriken, chrono_hunt. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world, U = SK.PPU;
  const C = (f, d) => K.CTRL('ninja', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;

  // ---------------------------------------------------------------- Shuriken Không-Thời Gian
  // [ĐO c20Controller + prefab] cd 6, dur 3. bullet_skill_ninja_jump (Bullet04 tốc 40, quay 1440°/s, đạn phụ bullet_81_ninja
  // mỗi 0,1 s: tốc 33, sát thương 4, bạo kích 40, đẩy 3), dừng khi chạm tường; TimeStopCircleNinja sống 3 s; buff_speed_down_ninja:
  // tốc chạy −50%, tốc đánh −50%, 6 s. Sát thương Shuriken skill0ShurikenDmg 4; chém xuyên skill0SlashDmg 4 (bạo kích 50, choáng
  // điện 1 s [ĐO RGSwordBuffTrigger]); nhát vũ trụ tại Shuriken skill0SwordDmg 4, tầm phantomSlashRange 4 ô.
  const TS = {
    dmg: C('skill0ShurikenDmg', 4), slash: C('skill0SlashDmg', 4), sword: C('skill0SwordDmg', 4), swordR: C('phantomSlashRange', 4) * T,
    speed: 40 * U, decay: 5,        // tốc đầu 40 ô/s, giảm dần tới lơ lửng [ƯỚC LƯỢNG: Bullet04 rate 0,1, speed_value 0,4]
    spin: 1440 * Math.PI / 180, every: 0.1, needle: { speed: 33 * U, dmg: 4, crit: 40, repel: 3, life: 1.6 },
    zoneR: 6 * T,                   // bán kính vùng ngưng đọng, khớp vòng TimeStopCircleNinja đo trên ảnh [ƯỚC LƯỢNG]
    slow: 0.5, slowT: 6, dashT: 0.16, pathW: 14   // giảm 50% / 6 s [ĐO buff_speed_down_ninja]; thời gian tốc biến, bề rộng chém [ƯỚC LƯỢNG]
  };
  const slowed = e => e._nzT > 0;
  function slowEnemy(e, t) {
    if (!K.alive(e)) return;
    if (!slowed(e)) { e._nzMul0 = e.moveMul || 1; e.moveMul = e._nzMul0 * (1 - TS.slow); }
    e._nzT = Math.max(e._nzT || 0, t);
  }
  // Mỗi khung: đếm buff của quái, trả tốc chạy khi hết; hãm tốc đánh bằng cách hoàn lại nửa nhịp hồi chiêu.
  K.timers.ninjaSlow = (G, p, dt) => {
    for (const e of G.enemies) {
      if (!slowed(e)) continue;
      e._nzT -= dt;
      if (K.alive(e) && e.cd > 0) e.cd += dt * TS.slow;
      if (e._nzT <= 0 || !K.alive(e)) { e.moveMul = e._nzMul0 || 1; e._nzT = 0; }
    }
  };

  function needle(G, x, y, ang, st) {
    const n = { x, y, ang, life: TS.needle.life, gone: false, hit: new Set() };
    n.h = fx(G, 'bullet_81_ninja', x, y, { follow: n, ang, dur: TS.needle.life });
    st.needles.push(n);
  }
  function stepNeedle(G, p, n, dt) {
    n.life -= dt;
    const d = TS.needle.speed * dt;
    n.x += Math.cos(n.ang) * d; n.y += Math.sin(n.ang) * d;
    if (n.life <= 0 || W.solidAt(G.map, n.x, n.y + 6)) { n.gone = true; K.stopFx(n.h); return; }
    for (const e of G.enemies) {
      if (!K.alive(e) || n.hit.has(e)) continue;
      const [cx, cy] = K.ec(e);
      if (Math.hypot(cx - n.x, cy - n.y) < e.r + 3) {
        n.hit.add(e); n.gone = true; K.stopFx(n.h);
        K.hit(G, p, e, TS.needle.dmg, { critChance: TS.needle.crit, ang: n.ang, repel: TS.needle.repel, fx: 'hit_blue2', tag: 'needle' });
        slowEnemy(e, TS.slowT);
        return;
      }
    }
  }

  S.time_space_shuriken = {
    start(G, p) {
      K.layer(G);
      const dur = K.cfg(p, 'time_space_shuriken').dur || 3;
      p.skillT = dur;
      const { ang } = K.targetAng(G, p, 14 * T);
      const sh = { x: p.x + Math.cos(ang) * 8, y: p.y - 7 + Math.sin(ang) * 8, ang, v: TS.speed, spin: 0, t: 0, tick: 0, phase: 'fly', hit: new Set(), needles: [], bullets: new Map() };
      sh.h = fx(G, 'bullet_skill_ninja_jump', sh.x, sh.y, { follow: sh, dur });
      p._shu = sh;
      G.props.push({ x: p.x, y: 1e9, draw() {},
        update(G2, q, dt) { if (p._shu !== sh) { q.gone = true; return; } stepShuriken(G2, p, sh, dt); } });
    },
    // Bấm lần nữa: phát động lại sớm (chém xuyên + tốc biến tới Shuriken).
    press(G, p) { if (p._shu) p.skillT = 1e-4; },
    end(G, p) { if (p._shu) recall(G, p, p._shu); }
  };

  function stepShuriken(G, p, sh, dt) {
    sh.t += dt; sh.spin += TS.spin * dt;
    for (const n of sh.needles) stepNeedle(G, p, n, dt);
    sh.needles = sh.needles.filter(n => !n.gone);
    if (sh.phase === 'fly') {
      sh.tick -= dt;
      if (sh.tick <= 0) { sh.tick += TS.every; needle(G, sh.x, sh.y, sh.spin, sh); }
      const d = sh.v * dt;
      sh.x += Math.cos(sh.ang) * d; sh.y += Math.sin(sh.ang) * d;
      sh.v *= Math.exp(-TS.decay * dt);
      for (const e of G.enemies) {
        if (!K.alive(e) || sh.hit.has(e)) continue;
        const [cx, cy] = K.ec(e);
        if (Math.hypot(cx - sh.x, cy - sh.y) < e.r + 6) { sh.hit.add(e); K.hit(G, p, e, TS.dmg, { ang: sh.ang, repel: 2, fx: 'hit_blue2', tag: 'shuriken' }); slowEnemy(e, TS.slowT); }
      }
      const wall = W.solidAt(G.map, sh.x, sh.y + 6);
      if (sh.v < 24 || wall) {
        if (wall) { sh.x -= Math.cos(sh.ang) * 8; sh.y -= Math.sin(sh.ang) * 8; }
        sh.phase = 'zone';
        K.stopFx(sh.h);
        const life = Math.max(0.3, p.skillT);
        sh.h = fx(G, 'TimeStopCircleNinja', sh.x, sh.y, { dur: life });
        sh.h2 = fx(G, 'bullet_skill_ninja_jump', sh.x, sh.y, { dur: life });
      }
    } else {
      zoneTick(G, sh);
    }
  }
  // Vùng ngưng đọng: quái trong vùng bị buff chậm, đạn địch đi qua bị giảm tốc và trả lại khi ra khỏi vùng.
  function zoneTick(G, sh) {
    for (const e of G.enemies) {
      if (!K.alive(e)) continue;
      const [cx, cy] = K.ec(e);
      if (Math.hypot(cx - sh.x, cy - sh.y) < TS.zoneR + e.r) slowEnemy(e, 0.3);
    }
    for (const b of G.bullets) {
      if (b.side !== 'e' || b.dead) continue;
      const inside = Math.hypot(b.x - sh.x, b.y - sh.y) < TS.zoneR, has = sh.bullets.has(b);
      if (inside && !has) { sh.bullets.set(b, 1); b.vx *= 1 - TS.slow; b.vy *= 1 - TS.slow; }
      else if (!inside && has) { sh.bullets.delete(b); b.vx /= 1 - TS.slow; b.vy /= 1 - TS.slow; }
    }
  }
  // Phát động lại: lướt tới Shuriken (không nhận sát thương), chém mọi quái nằm trên đường và nhát cuối quanh Shuriken.
  function recall(G, p, sh) {
    p._shu = null;
    K.stopFx(sh.h); K.stopFx(sh.h2);
    for (const [b] of sh.bullets) if (!b.dead) { b.vx /= 1 - TS.slow; b.vy /= 1 - TS.slow; }
    for (const n of sh.needles) K.stopFx(n.h);
    const x0 = p.x, y0 = p.y, tx = sh.x, ty = sh.y + 7;
    const ang = Math.atan2(ty - y0, tx - x0), dist = Math.hypot(tx - x0, ty - y0);
    let t = 0;
    K.ghost(p, true); K.hurtMods(p).ninja_dash = () => 0;
    if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
    G.props.push({ x: p.x, y: 1e9, draw() {},
      update(G2, q, dt) {
        t += dt;
        const k = Math.min(1, t / TS.dashT), nx = x0 + (tx - x0) * k, ny = y0 + (ty - y0) * k;
        if (!W.boxHits(G2.map, nx - p.h.body.r, ny - p.h.body.r, nx + p.h.body.r, ny)) { p.x = nx; p.y = ny; }
        if (k < 1) return;
        q.gone = true;
        K.ghost(p, false); delete K.hurtMods(p).ninja_dash;
        finish(G2, p, x0, y0, ang, dist, tx, ty);
      } });
  }
  function finish(G, p, x0, y0, ang, dist, tx, ty) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (const e of G.enemies) {
      if (!K.alive(e)) continue;
      const [ex, ey] = K.ec(e), dx = ex - x0, dy = ey - (y0 - 7), u = dx * c + dy * s, v = -dx * s + dy * c;
      if (u > -8 && u < dist + 8 && Math.abs(v) < TS.pathW / 2 + e.r) {
        K.hit(G, p, e, TS.slash, { critChance: 50, ang, repel: 2, fx: 'hit_blue2', tag: 'slash' });
        K.debuff(G, e, 'ele');
      }
    }
    for (const e of K.inRadius(G, tx, ty - 7, TS.swordR)) {
      K.hit(G, p, e, TS.sword, { critChance: 50, ang, repel: 3, fx: 'hit_blue2', tag: 'void_slash' });
      K.debuff(G, e, 'ele');
    }
    fx(G, 'skill_ninja_phantom', (x0 + tx) / 2, (y0 + ty) / 2 - 7, { ang, dur: 0.35 });
    G.shake = Math.max(G.shake, 3);
  }

  // ---------------------------------------------------------------- Săn Giết Siêu Thời Không
  // [ĐO c20Controller + config] cd 8, dur 3 (skill1HyperSpaceDuration): miễn mọi sát thương; mỗi lần bấm chém mục tiêu hiện tại
  // trong tầm skill1SlashTargetRange 14 ô, sát thương skill1SlashDamage 10, cách nhau tối thiểu skill1SlashMinInterval 0,25 s.
  // Chưa làm: phantom triệu hồi (skill1Phantom*, cần thẻ mở rộng) và cộng thêm thời gian theo cấp (skill1ModeDurationBonusPerStep).
  const CH = { dmg: C('skill1SlashDamage', 10), gap: C('skill1SlashMinInterval', 0.25), range: C('skill1SlashTargetRange', 14) * T, alpha: 0.35 };
  S.chrono_hunt = {
    start(G, p) {
      K.layer(G);
      p.skillT = K.cfg(p, 'chrono_hunt').dur || C('skill1HyperSpaceDuration', 3);
      p._chr = { last: -1e9 };
      K.ghost(p, true); K.hurtMods(p).chrono = () => 0;
      p._alpha = CH.alpha;
      fx(G, 'ninja_0_skill_1_effect', p.x, p.y, { follow: p, dur: 0.8 });
    },
    press(G, p) {
      const s = p._chr; if (!s || G.t - s.last < CH.gap) return;
      const e = (p.target && K.alive(p.target) && p.target) || K.nearest(G, p.x, p.y - 6, CH.range);
      if (!e) return;
      s.last = G.t;
      const [cx, cy] = K.ec(e), ang = Math.atan2(cy - (p.y - 6), cx - p.x);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      fx(G, 'ninja_0_skill_1_slash', cx, cy, { ang, dur: 0.4 });
      fx(G, 'skill_ninja_phantom', cx - Math.cos(ang) * 2 * T, cy - Math.sin(ang) * 2 * T, { ang, dur: 0.35 });
      K.hit(G, p, e, CH.dmg, { critChance: p.crit, ang, repel: 2, fx: 'hit_blue2', tag: 'chrono' });
      G.shake = Math.max(G.shake, 2);
    },
    end(G, p) {
      p._chr = null; p._alpha = null; K.ghost(p, false); delete K.hurtMods(p).chrono;
      fx(G, 'ninja_0_skill_1_effect_1', p.x, p.y, { follow: p, dur: 0.6 });
    }
  };
  S.time_space_shuriken.TS = TS; S.chrono_hunt.CH = CH;
})();
