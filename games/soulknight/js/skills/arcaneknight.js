// Kỹ năng Kỵ Sĩ Bùa Chú (c31, lớp C32Controller): power_burst, aegis_circle. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Số [ĐO] lấy từ config/skills + trường C32Controller (SK_SKILLS86.heroes.arcaneknight.ctrlFields) + mã IL2CPP (tools/sk_method.py).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, T = SK.TILE, U = SK.PPU;
  const { CTRL, cfg, fx, stopFx, ec, alive, inRadius, hit, targetAng, aimDir, hurtMods, ghost, layer, glow } = K;
  const C = (k, d) => CTRL('arcaneknight', k, d);

  // Đạn phép bay thẳng (prop riêng): trúng quái đầu tiên thì nổ, gặp tường thì tan; hình thật bám theo qua SK.vfx.
  function bolt(G, p, x, y, ang, o) {
    const b = { x, y, t: 0, spd: o.speed * U };
    b.h = fx(G, o.fx, x, y, { follow: b, ang, dur: o.life });
    G.props.push({
      x, y: 1e9,
      update(G2, q, dt) {
        b.t += dt; b.x += Math.cos(ang) * b.spd * dt; b.y += Math.sin(ang) * b.spd * dt;
        const e = G2.enemies.find(t => alive(t) && Math.hypot(ec(t)[0] - b.x, ec(t)[1] - b.y) < t.r + o.r);
        if (e) hit(G2, p, e, o.dmg, { critChance: o.crit, ang, repel: o.repel, fx: 'hit_purple', tag: 'burst' });
        if (e || b.t > o.life || W.solidAt(G2.map, b.x, b.y + 7)) { q.gone = true; stopFx(b.h); if (o.boom) fx(G2, o.boom, b.x, b.y, {}); }
      },
      draw() {}
    });
  }

  // ---------------------------------------------------------------- Năng Lượng Tuôn Trào
  // [ĐO c31/skill 1: cd 5, duration 1.3; C32Controller: skill0UnleashDelay 0.4, Skill0SizeFactor/DamageFactor = 0.6 + 0.4 × mức tụ;
  // skill0MeleeInfo {speed 16, size 2.25, damage 20, repel 3}, skill0ProjectileInfo {14, 1, 10, repel 2}, skill0BeamInfo {16, 1, 8, repel 1}].
  // Tụ lực tối đa 1.3 s rồi thả sau 0.4 s; bấm K lần nữa hoặc đánh bằng vũ khí thì thả ngay (UnleashSkill0WhenWeaponAttack).
  // Số đạn / số tia theo mức tụ, độ rộng và vệt quét của tia: [ƯỚC LƯỢNG] (_skill0ProjectileCount, _skill0BeamCount nằm trong mã).
  const PB = { fan: 0.22, beamLife: 0.5, beamLen: 10 * T, beamW: 7, beamGap: 0.1, meleeLife: 0.7 };
  const kindOf = w => { const d = w && w.def; return !d || d.kind === 'melee' ? 'melee' : d.kind === 'laser' ? 'beam' : 'proj'; };
  function unleash(G, p, k) {
    const w = p.weapons[p.cur], kind = kindOf(w), f = 0.6 + 0.4 * k, sync = w && w.def && (w.def.fam === 'charge' || w.def.charge > 0);
    const { ang } = targetAng(G, p, 14 * T), x = p.x + Math.cos(ang) * 8, y = p.y - 7 + Math.sin(ang) * 8;
    fx(G, 'arcaneknight_0_skill_0_unleash_fx', p.x, p.y, { follow: p, dy: -6, ang });
    if (kind === 'melee') {
      const mi = C('skill0MeleeInfo', {}), size = mi.size * f, name = sync ? 'arcaneknight_0_skill_0_energy_melee' : 'arcaneknight_0_skill_0_melee';
      const parts = SK.prefab(name), b = { x, y, t: 0 };
      G.props.push({
        x, y: 1e9,
        update(G2, q, dt) {
          b.t += dt; b.x += Math.cos(ang) * mi.speed * U * dt; b.y += Math.sin(ang) * mi.speed * U * dt;
          const e = G2.enemies.find(t => alive(t) && Math.hypot(ec(t)[0] - b.x, ec(t)[1] - b.y) < t.r + size * 5);
          if (e) hit(G2, p, e, Math.round(mi.damage * f), { critChance: p.crit, ang, repel: mi.repel, fx: 'hit_purple', tag: 'burst' });
          if (e || b.t > PB.meleeLife || W.solidAt(G2.map, b.x, b.y + 7)) q.gone = true;
        },
        draw(ctx) { if (parts) SK.drawRip(ctx, parts, b.x, b.y, { t: b.t, rot: ang, scale: size, flip: Math.cos(ang) < 0 }); }
      });
    } else if (kind === 'proj') {
      const pi = C('skill0ProjectileInfo', {}), n = 1 + Math.round(k * 2), name = sync ? 'arcaneknight_0_skill_0_energy_bullet' : 'arcaneknight_0_skill_0_bullet';
      for (let i = 0; i < n; i++) bolt(G, p, x, y, ang + (i - (n - 1) / 2) * PB.fan, { speed: pi.speed, dmg: Math.round(pi.damage * f), repel: pi.repel, r: 2 + 2 * pi.size * f, life: 1.4, fx: name, crit: p.crit, boom: 'hit_purple' });
    } else {
      const bi = C('skill0BeamInfo', {}), n = 1 + Math.round(k * 2);
      for (let i = 0; i < n; i++) beam(G, p, ang, (i - (n - 1) / 2) * PB.fan * 1.4, { dmg: Math.round(bi.damage * f), repel: bi.repel });
    }
    G.shake = Math.max(G.shake, 2);
  }
  // Tia quét từ ngoài vào giữa (wipe): mỗi 0.1 s trúng mọi quái nằm trên đường tia.
  function beam(G, p, ang, off, o) {
    const s = { t: 0, tick: 0, hit: [] };
    const anchor = { x: p.x, y: p.y - 7 };
    s.h = fx(G, 'arcaneknight_0_skill_0_beam', anchor.x, anchor.y, { follow: anchor, ang: ang + off });
    G.props.push({
      x: p.x, y: 1e9,
      update(G2, q, dt) {
        s.t += dt; s.tick -= dt; anchor.x = p.x; anchor.y = p.y - 7;
        const a = ang + off * (1 - s.t / PB.beamLife), c = Math.cos(a), sn = Math.sin(a);
        if (s.tick <= 0) {
          s.tick = PB.beamGap;
          for (const e of G2.enemies) {
            if (!alive(e)) continue;
            const [x, y] = ec(e), dx = x - anchor.x, dy = y - anchor.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
            if (u > 0 && u < PB.beamLen && Math.abs(v) < PB.beamW + e.r && s.hit.indexOf(e) < 0) { s.hit.push(e); hit(G2, p, e, o.dmg, { critChance: p.crit, ang: a, repel: o.repel, fx: 'hit_purple', tag: 'burst' }); }
          }
        }
        if (s.t > PB.beamLife) { q.gone = true; stopFx(s.h); }
      },
      draw() {}
    });
  }
  function release(G, p) {
    const s = p._pb; if (!s || s.done) return;
    s.done = true; stopFx(s.h);
    unleash(G, p, Math.min(1, s.t / (cfg(p, 'power_burst').dur || 1.3)));
    p.skillT = Math.min(p.skillT, 1e-4);
  }
  S.power_burst = {
    start(G, p) {
      layer(G);
      const dur = cfg(p, 'power_burst').dur || 1.3;
      p.skillT = dur + C('skill0UnleashDelay', 0.4);
      p._pb = { t: 0, done: false, h: fx(G, 'arcaneknight_0_skill_0_charge_fx', p.x, p.y, { follow: p, dy: -4 }) };
    },
    update(G, p, dt) { if (p._pb) p._pb.t += dt; },
    press(G, p) { release(G, p); },
    end(G, p) { release(G, p); p._pb = null; }
  };
  SK.on('fire', (G, p) => { if (p.hero === 'arcaneknight' && p._pb && !p._pb.done && p.skillT > 0) release(G, p); });

  // ---------------------------------------------------------------- Pháp Trận Bảo Hộ
  // [ĐO c31/skill 2: cd 7, args 6;1;3.5;10;24; C32Controller: skill1MaxTeleportDistance 4, skill1TeleportDuration 0.8, skill1MaxAddArmor 6,
  // skill1AddArmorInterval 0.33, skill1RegularDamageBullet.damage 7; prefab magic_circle: vòng ring_big 116 px × 0.286 → đường kính = skill1MagicCircleRadius 7.5 ô].
  // Nhấn K: đánh dấu điểm cách tối đa 4 ô (theo hướng đi / ngắm), biến mất 0.8 s rồi hiện ở đó dựng pháp trận; pháp trận gây sát thương cho quái
  // trong vòng và cấp giáp tạm cho tới khi rời vòng. Nhịp gây sát thương, giữ vòng khi rời (skill1StrengthenSelfRetain 3.5, chỉ khi nâng cấp) và
  // đòn dịch chuyển 24 (tutor) chưa làm: [ƯỚC LƯỢNG].
  const AC = { r: C('skill1MagicCircleRadius', 7.5) * T / 2, dist: C('skill1MaxTeleportDistance', 4) * T, every: 1 };
  S.aegis_circle = {
    start(G, p) {
      layer(G);
      const ang = aimDir(p), tm = C('skill1TeleportDuration', 0.8);
      let d = AC.dist;
      while (d > 0 && (W.solidAt(G.map, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d) || W.solidAt(G.map, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d - 5))) d -= 4;
      const tx = p.x + Math.cos(ang) * d, ty = p.y + Math.sin(ang) * d;
      p.skillT = tm;
      p._tp = { x0: p.x, y0: p.y, tx, ty, t: 0, moved: false };
      ghost(p, true); hurtMods(p).aegis_tp = () => 0; K.setMul(p, 'moveMul', 'aegis', 0);
      fx(G, 'arcaneknight_0_skill1_teleport_fx', p.x, p.y, { layer: 'ground' });
      const mark = SK.prefab('arcaneknight_0_skill1_teleport_mark');
      G.props.push({
        x: tx, y: -1e9 + ty, t: 0,
        update(G2, q, dt) { q.t += dt; if (q.t > tm) q.gone = true; },
        draw(ctx, G2, q) { if (mark) SK.drawRip(ctx, mark, tx, ty, { alpha: 0.6 + 0.4 * Math.sin(q.t * 12) }); }
      });
    },
    update(G, p, dt) {
      const s = p._tp; if (!s) return;
      const tm = C('skill1TeleportDuration', 0.8);
      s.t += dt;
      const half = tm / 2;
      p._alpha = s.t < half ? Math.max(0.02, 1 - s.t / half) : Math.min(1, (s.t - half) / half + 0.02);
      if (!s.moved && s.t >= half) { s.moved = true; p.x = s.tx; p.y = s.ty; fx(G, 'arcaneknight_0_skill1_teleport_fx', p.x, p.y, { layer: 'ground' }); }
    },
    end(G, p) {
      const s = p._tp; p._tp = null; p._alpha = null;
      ghost(p, false); delete hurtMods(p).aegis_tp; K.setMul(p, 'moveMul', 'aegis', 1);
      if (!s) return;
      if (!s.moved) { p.x = s.tx; p.y = s.ty; }
      circle(G, p);
    }
  };
  // Quầng sáng xanh mỗi lần được cộng giáp (add_armor_fx của SK.vfx hiện thành ô trắng nên tự vẽ bằng quầng cộng sáng).
  function flare(G, p) {
    G.props.push({ x: p.x, y: 1e9, t: 0, update(G2, q, dt) { q.t += dt; if (q.t > 0.3) q.gone = true; }, draw(ctx, G2, q) { glow(ctx, p.x, p.y - 8, 14 + q.t * 30, [0.5, 0.75, 1, 0.5], 1 - q.t / 0.3); } });
  }
  // prefab_parts chỉ ghi tỉ lệ riêng từng nút: nút con (ring_small/glow) phải nhân thêm tỉ lệ của nút cha.
  function flat(parts) {
    return (parts || []).map(q => {
      let sx = q.sc ? q.sc[0] : 1, sy = q.sc ? q.sc[1] : 1;
      for (const a of parts) if (a !== q && a.sc && q.n.indexOf(a.n + '/') === 0) { sx *= a.sc[0]; sy *= a.sc[1]; }
      return Object.assign({}, q, { sc: [sx, sy] });
    });
  }
  function circle(G, p) {
    if (p._akCircle) p._akCircle.gone = true;
    const parts = flat(SK.prefab('arcaneknight_0_skill1_magic_circle')), k = AC.r / (116 * 0.286 / 2);
    const max = C('skill1MaxAddArmor', 6), gap = C('skill1AddArmorInterval', 0.33), dmg = C('skill1RegularDamageBullet', {}).damage || 7;
    const c = p._akCircle = { x: p.x, y: p.y, t: 0, given: 0, tick: 0, dtick: 0.15, gone: false };
    function drop() {
      if (c.given && p.armor > p.armorMax) p.armor = Math.max(p.armorMax, p.armor - c.given);
      c.given = 0;
    }
    G.props.push({
      x: c.x, y: -1e9 + c.y,
      update(G2, q, dt) {
        c.t += dt;
        const inside = p.st !== 'dead' && Math.hypot(p.x - c.x, (p.y - c.y) * 1.3) < AC.r;
        if (c.gone || !inside) { drop(); q.gone = true; if (p._akCircle === c) p._akCircle = null; return; }
        c.tick -= dt; c.dtick -= dt;
        if (c.tick <= 0 && c.given < max) {
          c.tick = gap; c.given++; p.armor++;
          flare(G2, p);
        }
        if (c.dtick <= 0) {
          c.dtick = AC.every;
          for (const e of inRadius(G2, c.x, c.y, AC.r, AC.r / 1.3)) hit(G2, p, e, dmg, { critChance: p.crit, repel: 0, fx: 'hit_purple', tag: 'circle' });
        }
      },
      draw(ctx, G2, q) {
        if (!parts) return;
        const a = Math.min(1, c.t / 0.25);
        SK.drawRip(ctx, parts, c.x, c.y, { scale: k, rot: c.t * 1.57, alpha: a * 0.9 });
      }
    });
  }
})();
