// Kỹ năng Lãnh chúa (c30, lớp C31Controller): battle_storm, resolute_rush, dark_sovereign. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số [ĐO] lấy từ config/skills + trường C31Controller (SK_SKILLS86.heroes.warliege.ctrlFields) + mã IL2CPP (tools/sk_method.py).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, I = SK.input;
  const { CTRL, cfg, fx, stopFx, ec, alive, inRadius, nearest, hit, targetAng, aimDir, hurtMods, layer, charges, useCharge, timers, debuff, glow, ripFx } = K;
  const C = (k, d) => CTRL('warliege', k, d);
  const darkOn = p => p.h.skill && p.h.skill.id === 'dark_sovereign';

  // ---------------------------------------------------------------- nội tại Chiến Ý (buff 1011)
  // Đánh trúng gom Chiến Ý (tối đa 20, cách nhau ≥ 0,25 s), trúng đòn cũng gom; đủ 20 thì Sục Sôi 5 s, Chiến Ý tụt dần về 0
  // [ĐO C31Controller: MaxFightSprite 20, GainFightingSpriteMinDuration 0.25, spriteSurgingLastTime(Skill2) 5]. Số Chiến Ý mỗi lần trúng đòn: [ƯỚC LƯỢNG].
  const FS = { max: 20, gap: 0.25, hurt: 2 };
  const fs = p => p._fs || (p._fs = { n: 0, gap: 0, surge: 0, total: 0, h: null, hname: null });
  const surging = p => !!(p._fs && p._fs.surge > 0);
  function addFs(G, p, n) {
    const s = fs(p);
    if (s.surge > 0) return;
    s.n = Math.min(FS.max, s.n + n);
    if (s.n >= FS.max) s.total = s.surge = darkOn(p) ? C('spriteSurgingLastTimeSkill2', 5) : C('spriteSurgingLastTime', 5);
  }
  timers.warliege = (G, p, dt) => {
    if (p.hero !== 'warliege') return;
    const s = fs(p);
    s.gap -= dt;
    if (s.surge > 0) { s.surge -= dt; s.n = Math.max(0, FS.max * s.surge / s.total); if (s.surge <= 0) { s.n = 0; s.surge = 0; } }
    const want = s.n >= 1 ? (darkOn(p) ? 'warliege_fight_sprite_dark' : 'warliege_fight_sprite') : null;
    if (want !== s.hname) { stopFx(s.h); s.h = want ? fx(G, want, p.x, p.y, { follow: p, dy: -4 }) : null; s.hname = want; }
  };
  SK.on('enemyHit', G => { const p = G.player; if (p && p.hero === 'warliege' && fs(p).gap <= 0) { fs(p).gap = FS.gap; addFs(G, p, 1); } });
  SK.on('playerHurt', G => { const p = G.player; if (p && p.hero === 'warliege') addFs(G, p, FS.hurt); });
  SK.on('runStart', G => { const p = G.player; if (p && p.hero === 'warliege') { p._fs = null; p._giant = null; p._dsUse = 0; layer(G); } });

  // ---------------------------------------------------------------- Bão Chiến Ý
  // [ĐO c30/skill 1: cd 12, duration 6; C31Controller: Skill0CastTime 5, skill0Damage 6 / SurgingDamage 7, atk cách 0.33 s / 0.25 s khi Sục Sôi,
  // bulletSize 1.5; WarliegeSwordStorm: bắt đạn quanh bão, nhiễm nguyên tố (lửa/điện/băng/độc) của đạn chạm]. Bán kính bão: [ƯỚC LƯỢNG].
  const STORM = { cast: 5, r: 3 * T, cap: 8, orbit: 4.5 };
  const ELE = { 1: 'fire', 2: 'ice', 3: 'ele', 4: 'poison' };
  // Hình bão: warliege_roll của SK.vfx chưa dựng được hạt gió / lá (chỉ có nhánh tuyết tắt sẵn hiện thành ô trắng) nên vẽ tay vòng gió xoáy +
  // lá + quầng nguyên tố theo đạn đã bắt [ƯỚC LƯỢNG].
  const ELE_COL = { fire: [1, 0.5, 0.15, 0.6], ele: [1, 0.95, 0.4, 0.6], ice: [0.55, 0.9, 1, 0.6], poison: [0.55, 1, 0.4, 0.6] };
  function drawStorm(ctx, p, s) {
    const R = STORM.r, cx = p.x, cy = p.y - 7, fade = s.closed ? Math.max(0, 1 - (s.t - STORM.cast) / 1) : Math.min(1, s.t / 0.2);
    if (fade <= 0) return;
    const ele = Object.keys(s.ele);
    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = s.t * 7 + i * 2.094;
      ctx.strokeStyle = 'rgba(225,240,225,0.55)';
      for (let seg = 0; seg < 9; seg++) {
        const k0 = seg / 9, k1 = (seg + 1) / 9, a = a0 + k0 * 2.4, b = a0 + k1 * 2.4;
        ctx.lineWidth = 1 + k0 * 2.2; ctx.globalAlpha = fade * (0.25 + 0.6 * k0);
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * (0.35 + 0.65 * k0), R * (0.35 + 0.65 * k0) * 0.72, 0, a, b);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = fade;
    for (let i = 0; i < 6; i++) {   // lá cuốn theo gió
      const a = s.t * 5 + i * 1.047, r = R * (0.55 + 0.35 * Math.sin(s.t * 3 + i));
      ctx.fillStyle = i % 2 ? '#8fbf5a' : '#c9d97a';
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.72), 2, 2);
    }
    ele.forEach((k, i) => glow(ctx, cx + Math.cos(s.t * 4 + i * 1.6) * R * 0.75, cy + Math.sin(s.t * 4 + i * 1.6) * R * 0.55, 10, ELE_COL[k], 0.9));
    s.cap.forEach(c => glow(ctx, cx + Math.cos(c.a + s.t * STORM.orbit) * R * 0.7, cy + Math.sin(c.a + s.t * STORM.orbit) * R * 0.5, 6, c.col, 0.8));
    ctx.restore();
  }
  S.battle_storm = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'battle_storm').dur || 6;
      const s = p._storm = { t: 0, atk: 0, ele: {}, cap: [], closed: false };
      G.props.push({
        x: p.x, y: 1e9,
        update(G2, q, dt) { if (p._storm !== s) q.gone = true; },
        draw(ctx) { if (p._storm === s) drawStorm(ctx, p, s); }
      });
    },
    update(G, p, dt) {
      const s = p._storm; if (!s) return;
      s.t += dt;
      if (s.t >= STORM.cast) { s.closed = true; return; }
      const cx = p.x, cy = p.y - 7;
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead || s.cap.length >= STORM.cap) continue;
        if (Math.hypot(b.x - cx, b.y - cy) > STORM.r + b.r) continue;
        b.dead = true;
        const col = [1, 1, 1, 0.5];
        for (const m of Object.values((b.B && b.B.m) || {})) if (m && ELE[m.elementalType]) { s.ele[ELE[m.elementalType]] = 1; col[2] = 0.3; }
        s.cap.push({ a: SK.rand() * 6.283, col });
      }
      s.atk -= dt;
      if (s.atk > 0) return;
      const fast = surging(p);
      s.atk = fast ? 0.25 : 0.33;
      const dmg = fast ? C('skill0SurgingDamage', 7) : C('skill0Damage', 6);
      for (const e of inRadius(G, cx, cy, STORM.r)) {
        hit(G, p, e, dmg, { critChance: p.crit, repel: 1, tag: 'storm' });
        for (const k in s.ele) debuff(G, e, k);
      }
    },
    end(G, p) { p._storm = null; }
  };

  // ---------------------------------------------------------------- Quyết Tâm Xung Phong
  // [ĐO c30/skill 2: cd 4.5 mỗi lượt, maxCount 3, duration 6; C31Controller: dashTime 0.4, dashDamage 6 (dashSize 2.25),
  // hammerDamage 8 (hammerSize 1.75, bullet_hammer_warliege) khi lướt xong; RoleSkill1: ChangeDefenceTemp + WarliegePhantom]. Quãng lướt (dashDistance 65 là lực), giảm sát
  // thương ×0,5 và sức đánh của Người Khổng Lồ (damageFactor nằm trong prefab): [ƯỚC LƯỢNG].
  const RUSH = { dist: 7 * T, r: 1.2 * T, hammerR: 2.5 * T, def: 0.5, atkGap: 0.35, atkMul: 2, range: 8 * T };
  S.resolute_rush = {
    start(G, p) {
      layer(G);
      charges(p, 'resolute_rush'); useCharge(p, 'resolute_rush');
      const tm = C('dashTime', 0.4), ang = aimDir(p);
      p.skillT = tm;
      p._rush = { ang, v: RUSH.dist / tm, hit: [] };
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      const life = surging(p) ? Math.max(p._fs.surge, 0.5) : (cfg(p, 'resolute_rush').dur || 6);
      const g = p._giant;
      if (g) { stopFx(g.h); }
      p._giant = { t: 0, life, gap: 0, h: fx(G, 'warliege_phantom', p.x, p.y, { follow: p, dur: life + 0.2 }), tillSurge: surging(p) };
      hurtMods(p).rush = (G2, pl, dmg) => Math.max(1, Math.ceil(dmg * RUSH.def));
      fx(G, 'warliege_dash', p.x, p.y, { follow: p, dy: -7, dur: tm, ang });
    },
    update(G, p, dt) {
      const s = p._rush; if (!s) return;
      const mv = I.moveVec(), walkPx = p.h.speed * SK.PPU * (p.moveMul || 1) * dt;
      SK.moveBox(G.map, p, Math.cos(s.ang) * s.v * dt - mv.x * walkPx, Math.sin(s.ang) * s.v * dt - mv.y * walkPx, p.h.body.r);
      for (const e of inRadius(G, p.x, p.y - 7, RUSH.r)) if (s.hit.indexOf(e) < 0) { s.hit.push(e); hit(G, p, e, C('dashDamage', 6), { critChance: p.crit, ang: s.ang, repel: 2, fx: 'hit_white_large', tag: 'rush' }); }
    },
    end(G, p) {
      const s = p._rush; p._rush = null;
      if (!s) return;
      fx(G, 'bullet_hammer_warliege', p.x + Math.cos(s.ang) * 14, p.y - 4, { scale: C('hammerSize', 1.75) / 1.75 });
      G.shake = Math.max(G.shake, 3);
      for (const e of inRadius(G, p.x + Math.cos(s.ang) * 14, p.y - 4, RUSH.hammerR)) hit(G, p, e, C('hammerDamage', 8), { critChance: p.crit, ang: s.ang, repel: 3, tag: 'rush' });
    }
  };
  // Người Khổng Lồ: hết hạn (hoặc hết Sục Sôi nếu gọi lúc đó) thì biến mất trả lại sát thương thường; mỗi đòn của người chơi kéo theo một đòn cường hóa.
  timers.warliege_giant = (G, p, dt) => {
    const g = p._giant; if (!g) return;
    g.t += dt; g.gap -= dt;
    if (g.t >= g.life || (g.tillSurge && !surging(p))) { stopFx(g.h); p._giant = null; delete hurtMods(p).rush; }
  };
  SK.on('fire', (G, p, w) => {
    const g = p.hero === 'warliege' && p._giant;
    if (!g || g.gap > 0) return;
    const e = nearest(G, p.x, p.y - 7, RUSH.range, { los: true }); if (!e) return;
    g.gap = RUSH.atkGap;
    const [x, y] = ec(e);
    fx(G, 'bullet_hammer_warliege', x, y, { scale: 0.7 });
    const dmg = Math.max(C('hammerDamage', 8), Math.round(((w && w.def && w.def.dmg) || 4) * RUSH.atkMul));
    for (const t of inRadius(G, x, y, RUSH.hammerR * 0.6)) hit(G, p, t, dmg, { critChance: p.crit, repel: 2, tag: 'giant' });
  });

  // ---------------------------------------------------------------- Lãnh Chúa Hắc Ám
  // [ĐO c30/skill 3: cd 2.5 mỗi lượt, maxCount 3, duration 1; C31Controller: skill2SlashDamage 8 (+ skill2ExtraDamage 1 mỗi lần dùng),
  // skill2CircleDamage 12, sizeNormalSlash 2.5 / sizeNormalRange 2; Sục Sôi: skill2DashDamage 6, skill2FlyDamage 3 (bay flySpeed 20, sizeDarkSlashFly 1.5),
  // skill2JumpSlashDamage 4 (sizeJumpSlash 1), lực lao 60 / nhảy 70]. Tầm chém = kích cỡ × 2 ô, cách nhát 0,25 s, quãng lao / nhảy: [ƯỚC LƯỢNG].
  const DS = { gap: 0.25, half: 1.3, tile: 2 * T, dash: 6 * T, dashT: 0.25, jump: 7 * T, jumpT: 0.5, resetT: 3 };
  function slashHit(G, p, ang, reach, dmg, tag) {
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = x - p.x, dy = y - (p.y - 7), d = Math.hypot(dx, dy);
      if (d > reach + e.r) continue;
      let da = Math.abs(Math.atan2(dy, dx) - ang); if (da > Math.PI) da = 2 * Math.PI - da;
      if (d < 12 || da < DS.half) hit(G, p, e, dmg, { critChance: p.crit, ang, repel: 2, tag, fx: 'hit_white_large' });
    }
  }
  function circleHit(G, p, x, y, r, dmg, tag) {
    for (const e of inRadius(G, x, y, r)) hit(G, p, e, dmg, { critChance: p.crit, repel: 3, tag, fx: 'hit_white_large' });
  }
  const sweep = (G, p, name, ang, size, flipRev) => ripFx(G, name, p.x + Math.cos(ang) * 6, p.y - 7 + Math.sin(ang) * 6, { top: true, rot: Math.cos(ang) < 0 ? ang + Math.PI : ang, flip: Math.cos(ang) < 0 !== !!flipRev, scale: size / 2, dur: 0.35 });
  S.dark_sovereign = {
    start(G, p) {
      layer(G);
      charges(p, 'dark_sovereign'); useCharge(p, 'dark_sovereign');
      const now = G.t || 0;
      p._dsUse = p._dsAt != null && now - p._dsAt < DS.resetT && p._dsUse < 3 ? p._dsUse + 1 : 1;
      p._dsAt = now;
      const use = p._dsUse, { e, ang } = targetAng(G, p, 12 * T);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      if (surging(p)) {
        // Hắc Ám Cuộn Trào: lao tới mục tiêu; lần thứ ba nhảy lên chém; Đại Kiếm tung Trảm Kích xoay tròn ngay trong lúc lao / nhảy.
        const jump = use === 3, tm = jump ? DS.jumpT : DS.dashT, dist = jump ? DS.jump : DS.dash;
        const d = e ? Math.min(dist, Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y)) : dist;
        p.skillT = tm;
        p._ds = { dash: { ang, v: d / tm, tm, t: 0, jump, hit: [] }, q: [] };
        ripFx(G, 'sword_sweep_dash_circle', p.x, p.y - 7, { follow: p, top: true, scale: C('sizeDarkSlashRange', 0.85), dur: tm + 0.2 });
      } else {
        p.skillT = cfg(p, 'dark_sovereign').dur || 1;
        const dmg = C('skill2SlashDamage', 8) + (use - 1) * C('skill2ExtraDamage', 1);
        const q = [];
        for (let i = 0; i < use; i++) q.push({ t: 0.1 + i * DS.gap / (p.rateMul || 1), circle: use === 3 && i === 2, rev: i % 2 === 1, dmg, ang });
        p._ds = { dash: null, q, t: 0 };
      }
    },
    update(G, p, dt) {
      const s = p._ds; if (!s) return;
      const dsh = s.dash;
      if (dsh) {
        dsh.t += dt;
        const mv = I.moveVec(), walkPx = p.h.speed * SK.PPU * (p.moveMul || 1) * dt;
        SK.moveBox(G.map, p, Math.cos(dsh.ang) * dsh.v * dt - mv.x * walkPx, Math.sin(dsh.ang) * dsh.v * dt - mv.y * walkPx, p.h.body.r);
        p._liftY = dsh.jump ? Math.sin(Math.min(1, dsh.t / dsh.tm) * Math.PI) * 22 : 0;
        const r = C('sizeDarkSlashRange', 0.85) * DS.tile;
        for (const e of inRadius(G, p.x, p.y - 7, r)) if (dsh.hit.indexOf(e) < 0) { dsh.hit.push(e); hit(G, p, e, C('skill2DashDamage', 6), { critChance: p.crit, ang: dsh.ang, repel: 2, tag: 'dash', fx: 'hit_white_large' }); }
        return;
      }
      s.t += dt;
      while (s.q.length && s.t >= s.q[0].t) {
        const sl = s.q.shift();
        if (sl.circle) {
          const sz = C('sizeNormalRange', 2);
          ripFx(G, 'sword_sweep_circle', p.x, p.y - 7, { top: true, scale: sz / 2, dur: 0.4 });
          circleHit(G, p, p.x, p.y - 7, sz * DS.tile, C('skill2CircleDamage', 12), 'dark');
        } else {
          const sz = C('sizeNormalSlash', 2.5);
          sweep(G, p, 'sword_sweep', sl.ang, sz, sl.rev);
          slashHit(G, p, sl.ang, sz * DS.tile, sl.dmg, 'dark');
        }
        G.shake = Math.max(G.shake, 2);
      }
    },
    end(G, p) {
      const s = p._ds; p._ds = null; p._liftY = 0;
      if (!s || !s.dash) return;
      // Kết thúc lao: vòng chém xoay Trảm Kích (12); nhảy thì tiếp đòn chém đáp đất (4) [ĐO].
      circleHit(G, p, p.x, p.y - 7, C('sizeDarkSlashRange', 0.85) * DS.tile, C('skill2CircleDamage', 12), 'dark');
      if (s.dash.jump) {
        fx(G, 'bullet_hammer_warliege', p.x, p.y - 4, { scale: 0.8 });
        circleHit(G, p, p.x, p.y - 4, C('sizeJumpSlash', 1) * DS.tile * 1.5, C('skill2JumpSlashDamage', 4), 'dark');
        G.shake = Math.max(G.shake, 3);
      }
    }
  };
  // Hắc Ám Cuộn Trào: mỗi đòn đánh thường triệu hồi Đại Kiếm Hắc Ám tung Trảm Kích bay (skill2FlyDamage 3, bay flySpeed 20) [ĐO].
  SK.on('fire', G => {
    const p = G.player;
    if (!p || p.hero !== 'warliege' || !darkOn(p) || !surging(p)) return;
    const { ang } = targetAng(G, p, 14 * T), sz = C('sizeDarkSlashFly', 1.5), spd = C('flySpeed', 20) * SK.PPU, hits = [];
    const b = { x: p.x, y: p.y - 7, t: 0 };
    G.props.push({
      x: b.x, y: 1e9,
      update(G2, q, dt) {
        b.t += dt; b.x += Math.cos(ang) * spd * dt; b.y += Math.sin(ang) * spd * dt;
        for (const e of inRadius(G2, b.x, b.y, sz * T)) if (hits.indexOf(e) < 0) { hits.push(e); hit(G2, p, e, C('skill2FlyDamage', 3), { critChance: p.crit, ang, repel: 1, tag: 'dark', fx: 'hit_white_large' }); }
        if (b.t > 0.8 || W.solidAt(G2.map, b.x, b.y + 7)) q.gone = true;
      },
      draw(ctx) { const parts = SK.prefab('fly_slash'); if (parts) SK.drawRip(ctx, parts, b.x, b.y, { rot: ang, scale: sz / 1.5 }); }
    });
  });
})();
