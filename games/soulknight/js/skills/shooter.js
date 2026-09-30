// Kỹ năng Tay Súng (c36): marksman_s_mastery, deadeye_domain. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số lấy từ ctrlFields của SK_SKILLS86.heroes.shooter (controller C37Controller trong dump.cs) và MonoBehaviour của prefab *_ShooterAim; emWeaponType [ĐO dump.cs]: 1 Gun (súng máy),
// 2 ShotGun, 12 Rocket, 14 Pistol, 15 Rifle (bắn tỉa). Logic nằm trong mã IL2CPP (chưa đọc được) nên cách áp số là [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, DS = SK.DS, I = SK.input;
  const { alive, ec, nearest, inRadius, hit, fx, stopFx, cfg, CTRL, layer, setMul, debuff } = K;
  const C = (k, d) => CTRL('shooter', k, d);
  const catOf = w => {
    const t = w && w.def && w.def.type;
    return t === 14 ? 'pistol' : t === 1 ? 'gun' : t === 15 ? 'rifle' : t === 2 ? 'shotgun' : 'other';
  };
  const hy = e => e.hb.off[1] * e.scale;
  // Ống ngắm bay nhanh từ điểm a tới b (đạn bắn tỉa nối tiếp): đường sáng tắt sau 0.12 s.
  function tracer(G, a, b, col) {
    G.props.push({
      x: 0, y: 1e9, t: 0,
      update(G2, q, dt) { q.t += dt; if (q.t > 0.12) q.gone = true; },
      draw(ctx, G2, q) {
        ctx.save(); ctx.globalAlpha = 1 - q.t / 0.12; ctx.strokeStyle = col || '#ffe98a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
      }
    });
  }

  // ================================================================ Thần Súng Giáng Lâm
  // [ĐO c36/skill 1: cd 10, duration 5, args "50;3;50"; C36 ctrl: PistolExplodeDmgValue 6, GunStackCount 3,
  // GunStackBulletDmgMultiple 3, RifleDefaultAutoLockCount 3, RifleMaxAutoLockRadius 10, ShotGunMaxMult 2.5, ShotGunMaxMultPos 2.4,
  // CommonAtkSpeedAddition 0.5]: hiệu ứng theo loại vũ khí đang cầm; vũ khí phụ chỉ ăn args[0] = 50% (dùng làm hệ số s).
  const MM = { boomR: 1.6 * T, rifleFall: 0.7, farPos: 8 * T };   // bán kính nổ, hệ số giảm mỗi mắt xích, tầm hết cộng [ƯỚC LƯỢNG]
  function mmMods(p) {
    const k = cfg(p, 'marksman_s_mastery'), sec = (+String(k.args || '50;3;50').split(';')[0] || 50) / 100;
    const m = {}, add = (w, s) => { const c = catOf(w); if (w) m[c] = (m[c] || 0) + s; };
    add(p.weapons[p.cur], 1); add(p.weapons[1 - p.cur], sec);
    return m;
  }
  function markFx(G, e) {
    if (!e._mmFx || e._mmFx.dead || e._mmFx.stopped) e._mmFx = fx(G, 'mark', e.x, e.y, { follow: e, dy: -hy(e), dur: 4 });
  }
  S.marksman_s_mastery = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'marksman_s_mastery').dur || 5;
      p._mm = { mods: mmMods(p) };
      fx(G, 'skill_effect', p.x, p.y, { follow: p, dur: 0.6 });
    },
    update(G, p) {
      const m = p._mm.mods = mmMods(p);
      setMul(p, 'rateMul', 'mm', 1 + (m.other || 0) * C('CommonAtkSpeedAddition', 0.5));   // "Khác: công tốc +50%"
    },
    end(G, p) { setMul(p, 'rateMul', 'mm', 1); p._mm = null; for (const e of G.enemies) e._mmStack = 0; }
  };
  SK.on('enemyHit', (G, e, d) => {
    const p = G.player, s = p && p._mm;
    if (!s || G._skHit || !alive(e)) return;
    const [cx, cy] = ec(e), m = s.mods;
    if (m.pistol) {   // Súng ngắn: đạn kèm nổ 6
      fx(G, 'pistol_explode', cx, cy, { scale: 0.8 });
      for (const q of inRadius(G, cx, cy, MM.boomR)) hit(G, p, q, Math.round(C('PistolExplodeDmgValue', 6) * m.pistol), { tag: 'mm', repel: 2, noMul: true });
    }
    if (m.gun) {      // Súng máy: đánh dấu, đủ GunStackCount tầng thì nổ thêm gấp GunStackBulletDmgMultiple lần đòn
      e._mmStack = (e._mmStack || 0) + 1; markFx(G, e);
      if (e._mmStack >= C('GunStackCount', 3)) {
        e._mmStack = 0; if (e._mmFx) stopFx(e._mmFx);
        fx(G, 'buff_stack_spatter', cx, cy, {});
        hit(G, p, e, Math.max(1, Math.round(d * C('GunStackBulletDmgMultiple', 3) * m.gun)), { tag: 'mm', noMul: true });
      }
    }
    if (m.shotgun) {  // Súng săn: càng gần càng đau, tối đa ×ShotGunMaxMult ở ShotGunMaxMultPos ô
      const dist = Math.hypot(cx - p.x, cy - (p.y - 6)), near = C('ShotGunMaxMultPos', 2.4) * T, mx = C('ShotGunMaxMult', 2.5);
      const mult = 1 + (mx - 1) * Math.max(0, Math.min(1, (MM.farPos - dist) / (MM.farPos - near)));
      if (mult > 1.01) hit(G, p, e, Math.max(1, Math.round(d * (mult - 1) * m.shotgun)), { tag: 'mm', noMul: true });
    }
    if (m.rifle && !G._mmChain) {   // Bắn tỉa: đạn nhảy sang quái kế tiếp, sát thương giảm dần
      G._mmChain = true;
      let cur = e, dmg = d;
      const seen = [e], n = Math.max(1, Math.round(C('RifleDefaultAutoLockCount', 3) * Math.min(1, m.rifle)));
      for (let i = 0; i < n; i++) {
        const [ax, ay] = ec(cur), nx = nearest(G, ax, ay, C('RifleMaxAutoLockRadius', 10) * T, { skip: q => seen.indexOf(q) >= 0 });
        if (!nx) break;
        seen.push(nx); dmg = Math.max(1, Math.round(dmg * MM.rifleFall));
        const [bx, by] = ec(nx);
        tracer(G, [ax, ay], [bx, by]);
        hit(G, p, nx, dmg, { tag: 'mm', noMul: true, fx: 'hit_yellow' });
        cur = nx;
      }
      G._mmChain = false;
    }
  });

  // ================================================================ Lĩnh Vực Săn Bắn
  // [ĐO c36/skill 2: cd 6, duration 8; ctrl: rifleDamageProfile {20, 0.2}, shotGunDamageProfile {4, 0}, gunDamageProfile {2, 0.3},
  // rocketDamageProfile {8, 0}, WhirlWindSlashDmgValue 8, GunSpatterBulletCount 2, GunSpatterBulletDmgValue 10,
  // GunSpatterBulletLockRadius 10, screenSize 10; prefab *_ShooterAim: AimAreaDamage.radius 1.57 / 3.7 / 1.6 / 2.04 ô,
  // ShooterAimController.moveSpeed 17 / 12 / 12 / 12 ô/s, recoil lên+xuống 0.4 / 0.4 / — / 0.55 s (không bắn trong lúc giật),
  // súng máy fireRate 15/s, maxHeat 100, heatPerShot 4, coolRate 50, coolDelay 0.1, enhancedDuration 5; bắn tỉa consecutiveBonus
  // +5 mỗi lần trúng cùng mục tiêu, tối đa 4 tầng; ShooterRifleKillEnemy.lockRange 15]: ẩn thân + đứng yên, cần điều khiển dời tâm
  // ngắm, bấm bắn = phá ẩn thân, bắn theo loại tâm, mỗi lần bắn quét gió xoáy 8 sát thương và huỷ đạn địch quanh người.
  // Đổi loại tâm bằng phím đổi súng (Q) thay cho các vùng của nút bắn; tâm mở màn theo vũ khí đang cầm. [ƯỚC LƯỢNG: bán kính gió xoáy,
  // tầm dời tâm (màn không zoom-out như screenSize 10), điểm hết cộng dồn của tên lửa]
  const AIM = {
    rifle: { pf: 'Rifle_ShooterAim', prof: 'rifleDamageProfile', cyc: 0.4, r: 1.57, spd: 17, stack: 5, maxStack: 4 },
    shotgun: { pf: 'ShotGun_ShooterAim', prof: 'shotGunDamageProfile', cyc: 0.4, r: 3.7, spd: 12, stun: 1 },
    gun: { pf: 'Gun_ShooterAim', prof: 'gunDamageProfile', cyc: 1 / 15, r: 1.6, spd: 12, heat: 4, cool: 50, coolDelay: 0.1, enhanced: 5 },
    rocket: { pf: 'Rocket_ShooterAim', prof: 'rocketDamageProfile', cyc: 0.55, r: 2.04, spd: 12, ring: 3 }
  };
  const ORDER = ['rifle', 'shotgun', 'gun', 'rocket'];
  const DD = { reach: 8 * T, spin: 4 * T };
  const aimOf = w => { const t = w && w.def && w.def.type; return t === 15 ? 'rifle' : t === 2 ? 'shotgun' : t === 12 ? 'rocket' : 'gun'; };
  SK.WEAPON_KINDS.shooter_aim = { fire(G, p) { if (p._dd) ddShot(G, p, p._dd); } };
  function aimDef(sprite) {
    Object.defineProperty(DS.weapons, '_shooter_aim', { configurable: true, writable: true, enumerable: false,
      value: { name: 'Tâm Ngắm', kind: 'shooter_aim', dmg: 1, cost: 0, crit: 0, rps: 1.5, sprite } });
  }
  function setType(G, s, t) {
    s.type = t; s.hits.clear(); s.heat = 0; s.enhanced = 0;
    if (s.fxh) stopFx(s.fxh);
    s.fxh = K.ripFx(G, AIM[t].pf, s.cross.x, s.cross.y, { follow: s.cross, dur: 999, top: true });
    DS.weapons._shooter_aim.rps = 1 / AIM[t].cyc;
  }
  S.deadeye_domain = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'deadeye_domain').dur || 8;
      const main = p.weapons[p.cur], first = nearest(G, p.x, p.y - 6, DD.reach);
      const [ex, ey] = first ? ec(first) : [p.x + p.face * 5 * T, p.y - 6];
      const s = p._dd = { cross: { x: ex, y: ey }, orig: p.weapons.slice(), cur: p.cur, type: null, fxh: null, broke: false, hits: new Map(), heat: 0, heatT: 0, enhanced: 0, rings: [] };
      aimDef(main && main.def.sprite);
      p.weapons = p.weapons.map(w => w && SK.makeWeapon('_shooter_aim'));
      p.hidden = true; p._alpha = 0.297;
      setMul(p, 'moveMul', 'deadeye', 1e-6);   // actors.js đọc (moveMul || 1) nên 0 thành 1
      setType(G, s, aimOf(main));
      fx(G, 'skill_effect', p.x, p.y, { follow: p, dur: 0.6 });
    },
    update(G, p, dt) {
      const s = p._dd; if (!s) return;
      const mv = I.moveVec(), sp = AIM[s.type].spd * U * dt;
      s.cross.x += mv.x * sp; s.cross.y += mv.y * sp;
      const dx = s.cross.x - p.x, dy = s.cross.y - (p.y - 6), d = Math.hypot(dx, dy);
      if (d > DD.reach) { s.cross.x = p.x + dx / d * DD.reach; s.cross.y = p.y - 6 + dy / d * DD.reach; }
      if (I.hit('swap')) setType(G, s, ORDER[(ORDER.indexOf(s.type) + 1) % ORDER.length]);
      p.aim = Math.atan2(s.cross.y - (p.y - 6), s.cross.x - p.x); p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
      s.heatT += dt;
      if (s.heatT > AIM.gun.coolDelay) s.heat = Math.max(0, s.heat - AIM.gun.cool * dt);
      s.enhanced = Math.max(0, s.enhanced - dt);
      for (const r of s.rings) r.t += dt;
      s.rings = s.rings.filter(r => r.t < r.life);
      for (const r of s.rings) {   // vòng lửa của tên lửa: đốt quái đứng trong vòng
        r.tick -= dt;
        if (r.tick <= 0) { r.tick = 0.5; for (const e of inRadius(G, r.x, r.y, r.r)) debuff(G, e, 'fire'); }
      }
    },
    press(G, p) { p.skillT = Math.min(p.skillT, 1e-4); },
    end(G, p) {
      const s = p._dd; if (!s) return;
      p._dd = null;
      p.weapons = s.orig; p.cur = s.cur;
      p.hidden = false; p._alpha = null;
      setMul(p, 'moveMul', 'deadeye', 1);
      if (s.fxh) stopFx(s.fxh);
    }
  };
  // Mỗi phát bắn: phá ẩn thân, gió xoáy huỷ đạn địch, rồi bắn theo loại tâm.
  function ddShot(G, p, s) {
    if (!s.broke) { s.broke = true; p.hidden = false; p._alpha = null; }
    const A = AIM[s.type], prof = C(A.prof, { damage: 2, critChance: 0 }), cx = s.cross.x, cy = s.cross.y, R = A.r * U;
    fx(G, 'gunEffect', p.x, p.y - 8, { follow: p, dy: -8, dur: 0.5 });
    K.ripFx(G, 'whirl_wind', p.x, p.y - 8, { follow: p, top: true, dur: 0.4 });
    for (const e of inRadius(G, p.x, p.y - 8, DD.spin)) hit(G, p, e, C('WhirlWindSlashDmgValue', 8), { tag: 'dd_whirl', repel: 2 });
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - p.x, b.y - (p.y - 8)) < DD.spin) b.dead = true;
    const crit = (prof.critChance || 0) * 100, inside = inRadius(G, cx, cy, R);
    const near = inside.slice().sort((a, b) => Math.hypot(ec(a)[0] - cx, ec(a)[1] - cy) - Math.hypot(ec(b)[0] - cx, ec(b)[1] - cy))[0];
    if (s.type === 'rifle') {   // cộng dồn +5 mỗi lần trúng cùng mục tiêu, tối đa 4 tầng
      if (!near) return;
      const n = Math.min(A.maxStack, s.hits.get(near) || 0);
      s.hits.set(near, n + 1);
      const [ex, ey] = ec(near);
      tracer(G, [p.x, p.y - 8], [ex, ey]);
      hit(G, p, near, prof.damage + A.stack * n, { tag: 'dd', critChance: crit, repel: 3, fx: 'hit_yellow' });
      if (near.hp <= 0) {   // hạ mục tiêu: khoá quái gần đó nhất trong lockRange 15 ô
        const nx = nearest(G, ex, ey, 15 * U);
        if (nx) { const [nx1, ny1] = ec(nx); s.cross.x = nx1; s.cross.y = ny1; }
      }
    } else if (s.type === 'shotgun') {   // bắn choáng mọi quái trong vùng (buff_ele 1 s)
      fx(G, 'hit_yellow', cx, cy, { scale: 1.6 });
      for (const e of inside) { hit(G, p, e, prof.damage, { tag: 'dd', critChance: crit, repel: 3 }); debuff(G, e, 'ele'); }
    } else if (s.type === 'gun') {   // nóng dần: đủ maxHeat thì bật đạn thiêu 5 s
      s.heat = Math.min(100, s.heat + A.heat); s.heatT = 0;
      if (s.heat >= 100 && s.enhanced <= 0) s.enhanced = A.enhanced;
      if (!near) return;
      const [ex, ey] = ec(near);
      tracer(G, [p.x, p.y - 8], [ex, ey], '#ff9a4a');
      hit(G, p, near, prof.damage, { tag: 'dd', critChance: crit, repel: 1, fx: 'hit_orange' });
      if (s.enhanced > 0) debuff(G, near, 'fire');
      if (near.hp <= 0) {   // hạ mục tiêu: bắn đạn văng ra quanh, khoá quái gần nhất
        const seen = [near];
        for (let i = 0; i < C('GunSpatterBulletCount', 2); i++) {
          const q = nearest(G, ex, ey, C('GunSpatterBulletLockRadius', 10) * U, { skip: u => seen.indexOf(u) >= 0 });
          if (!q) break;
          seen.push(q); tracer(G, [ex, ey], ec(q), '#ff9a4a');
          hit(G, p, q, C('GunSpatterBulletDmgValue', 10), { tag: 'dd_spatter', repel: 1, fx: 'hit_orange' });
        }
      }
    } else {   // tên lửa: dội bom vùng ngắm rồi để lại vòng lửa
      fx(G, 'explode_fire_scale', cx, cy, { state: 'explode_small' });
      for (const e of inside) hit(G, p, e, prof.damage, { tag: 'dd', repel: 4 });
      s.rings.push({ x: cx, y: cy, r: R, t: 0, life: A.ring, tick: 0 });
      for (let i = 0; i < 6; i++) fx(G, 'fire_small', cx + Math.cos(i * Math.PI / 3) * R * 0.8, cy + Math.sin(i * Math.PI / 3) * R * 0.8 * 0.8, { dur: A.ring, layer: 'ground' });
      G.shake = Math.max(G.shake, 3);
    }
  }
  SK.on('runStart', G => { const p = G.player; if (p && p.hero === 'shooter') p._ch = null; });   // max 3 trong config không phải số lượt
})();
