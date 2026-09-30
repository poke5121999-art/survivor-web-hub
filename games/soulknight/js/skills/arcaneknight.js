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
  // Chuỗi thả [ĐO Skill0AttackPrepare/Skill0AttackUpdate/Skill0AttackStart]: vũ khí cận chiến bắn 4 đợt sóng cách min(1,6; 4 × 0,25)/4 = 0,25 s; vũ khí bắn đạn hoặc tia
  // (IsWeaponRangedType) bắn 6 đạn cách min(1,4; 6 × 0,1)/6 = 0,1 s, mỗi đạn lệch ngẫu nhiên −45..45° (RGRandom.Range); vũ khí tia thêm 2 tia (nhãn Laser) cách nhau 0,15 s,
  // mỗi tia quét trong _beamWipeTime 1,5 s từ mép ngoài (65..85° lệch, hai tia hai phía) vào giữa (tổng góc ±80° khi 2 tia). Vũ khí Phi tiêu (Dart) thêm 4 đạn: không có cờ này ở vũ khí web.
  // Độ rộng và chiều dài tia, nhịp gây sát thương của tia: [ƯỚC LƯỢNG] (LineDamageCarrier nằm trong prefab, chưa đọc).
  const PB = { melee: 4, meleeGap: 0.25, proj: 6, projGap: 0.1, spread: Math.PI / 4, beams: 2, beamDelay: 0.15, wipe: 1.5, beamOut: [65, 85], beamSweep: 80, beamLen: 10 * T, beamW: 7, beamTick: 0.1, meleeLife: 0.7 };
  const rad = d => d * Math.PI / 180;
  const kindOf = w => { const d = w && w.def; return !d || d.kind === 'melee' ? 'melee' : d.kind === 'laser' ? 'beam' : 'proj'; };
  function wave(G, p, ang, f, sync) {
    const mi = C('skill0MeleeInfo', {}), size = mi.size * f, name = sync ? 'arcaneknight_0_skill_0_energy_melee' : 'arcaneknight_0_skill_0_melee';
    const parts = SK.prefab(name), x = p.x + Math.cos(ang) * 8, y = p.y - 7 + Math.sin(ang) * 8, b = { x, y, t: 0 };
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
  }
  // Tia quét từ ngoài vào giữa (wipe): mỗi PB.beamTick giây trúng mọi quái nằm trên đường tia, mỗi quái một lần mỗi tia.
  function beam(G, p, ang0, dir, o) {
    const s = { t: 0, tick: 0, hit: [] };
    const start = ang0 + dir * rad(PB.beamOut[0] + SK.rand() * (PB.beamOut[1] - PB.beamOut[0])), sweep = -dir * rad(PB.beamSweep);
    const anchor = { x: p.x, y: p.y - 7 };
    s.h = fx(G, 'arcaneknight_0_skill_0_beam', anchor.x, anchor.y, { follow: anchor, ang: start });
    G.props.push({
      x: p.x, y: 1e9,
      update(G2, q, dt) {
        s.t += dt; s.tick -= dt; anchor.x = p.x; anchor.y = p.y - 7;
        const a = start + sweep * Math.min(1, s.t / PB.wipe), c = Math.cos(a), sn = Math.sin(a);
        if (s.h) s.h.ang = a;
        if (s.tick <= 0) {
          s.tick = PB.beamTick;
          for (const e of G2.enemies) {
            if (!alive(e)) continue;
            const [x, y] = ec(e), dx = x - anchor.x, dy = y - anchor.y, u = dx * c + dy * sn, v = -dx * sn + dy * c;
            if (u > 0 && u < PB.beamLen && Math.abs(v) < PB.beamW + e.r && s.hit.indexOf(e) < 0) { s.hit.push(e); hit(G2, p, e, o.dmg, { critChance: p.crit, ang: a, repel: o.repel, fx: 'hit_purple', tag: 'burst' }); }
          }
        }
        if (s.t > PB.wipe) { q.gone = true; stopFx(s.h); }
      },
      draw() {}
    });
  }
  // Xả chuỗi đòn theo loại vũ khí; trả về độ dài chuỗi (giây) để kỹ năng còn "đang thi triển" tới hết.
  function unleash(G, p, k) {
    const w = p.weapons[p.cur], kind = kindOf(w), f = 0.6 + 0.4 * k, sync = w && w.def && (w.def.fam === 'charge' || w.def.charge > 0);
    const aim = () => targetAng(G, p, 14 * T).ang, ev = [];
    let total = 0.35;
    fx(G, 'arcaneknight_0_skill_0_unleash_fx', p.x, p.y, { follow: p, dy: -6, ang: aim() });
    if (kind === 'melee') {
      for (let i = 0; i < PB.melee; i++) ev.push({ t: i * PB.meleeGap, fn: () => wave(G, p, aim(), f, sync) });
      total = Math.max(total, PB.melee * PB.meleeGap);
    } else {
      const pi = C('skill0ProjectileInfo', {}), name = sync ? 'arcaneknight_0_skill_0_energy_bullet' : 'arcaneknight_0_skill_0_bullet';
      for (let i = 0; i < PB.proj; i++) ev.push({ t: i * PB.projGap, fn: () => { const a = aim(); bolt(G, p, p.x + Math.cos(a) * 8, p.y - 7 + Math.sin(a) * 8, a + (SK.rand() * 2 - 1) * PB.spread, { speed: pi.speed, dmg: Math.round(pi.damage * f), repel: pi.repel, r: 2 + 2 * pi.size * f, life: 1.4, fx: name, crit: p.crit, boom: 'hit_purple' }); } });
      total = Math.max(total, PB.proj * PB.projGap);
      if (kind === 'beam') {
        const bi = C('skill0BeamInfo', {}), dirs = SK.rand() < 0.5 ? [1, -1] : [-1, 1];
        for (let i = 0; i < PB.beams; i++) ev.push({ t: i * PB.beamDelay, fn: () => beam(G, p, aim(), dirs[i], { dmg: Math.round(bi.damage * f), repel: bi.repel }) });
        total = Math.max(total, (PB.beams - 1) * PB.beamDelay + PB.wipe);
      }
    }
    ev.sort((a, b) => a.t - b.t);
    G.props.push({ x: p.x, y: 1e9, t: 0, update(G2, q, dt) { q.t += dt; while (ev.length && q.t >= ev[0].t) ev.shift().fn(); if (!ev.length) q.gone = true; }, draw() {} });
    G.shake = Math.max(G.shake, 2);
    return total;
  }
  function release(G, p) {
    const s = p._pb; if (!s || s.done) return;
    s.done = true; stopFx(s.h);
    p.skillT = unleash(G, p, Math.min(1, s.t / (cfg(p, 'power_burst').dur || 1.3)));
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
    end(G, p) { const s = p._pb; if (s && !s.done) { release(G, p); return; } p._pb = null; }
  };
  SK.on('fire', (G, p) => { if (p.hero === 'arcaneknight' && p._pb && !p._pb.done && p.skillT > 0) release(G, p); });

  // ---------------------------------------------------------------- Pháp Trận Bảo Hộ
  // [ĐO c31/skill 2: cd 7, args 6;1;3.5;10;24; C32Controller: skill1MaxTeleportDistance 4, skill1TeleportDuration 0.8, skill1MaxAddArmor 6 (GetSkill1MaxAddArmor: 6 ở cấp kỹ năng 1),
  // skill1AddArmorInterval 0.33, skill1RegularDamageBullet.damage 7; prefab magic_circle: vòng ring_big 116 px × 0.286 → đường kính = skill1MagicCircleRadius 7.5 ô].
  // Nhấn K: đánh dấu điểm cách tối đa 4 ô (theo hướng đi / ngắm), biến mất 0.8 s rồi hiện ở đó dựng pháp trận; pháp trận gây sát thương cho quái trong vòng
  // và cấp giáp tạm (+1 mỗi 0,33 s, tối đa 6 mỗi người, cộng vào giáp tối đa tạm) cho tới khi rời vòng [Skill1AddExtraArmor].
  // Có nâng cấp kỹ năng (skill_strengthen / HasSkillExtraUpdate, cùng công tắc SK.passiveOn) [Skill1Teleport]: vòng to ×skill1TutorLevelUpRangeFactor 1,1, sát thương vòng
  // +skill1StrengthenAddDamage 1 (7 → 8), lúc đến nơi nổ một đòn skill1TutorLevelUpTeleportBullet 24 sát thương (bạo 5%, đẩy 3) trong bán kính vòng, và vòng còn tồn tại
  // skill1StrengthenSelfRetain 3,5 s sau khi người dùng rời [selfRetainTime]. Nhịp gây sát thương của vòng (prefab skill1_area_dmg chưa bóc), việc giữ giáp trong 3,5 s đó và tốc chạy
  // tạm skill1TeleportAddSpeed 3 (c32s1tmpspd) chưa làm: [ƯỚC LƯỢNG]. Giữ K để chỉnh điểm đánh dấu (skill1PressDownMaxTime 0,2) chưa làm: bấm là đặt ở xa nhất.
  const upgraded = p => (SK.passiveOn ? SK.passiveOn(p) : true);
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
    const up = upgraded(p), scale = up ? C('skill1TutorLevelUpRangeFactor', 1.1) : 1, R = AC.r * scale;
    const parts = flat(SK.prefab('arcaneknight_0_skill1_magic_circle')), k = R / (116 * 0.286 / 2);
    const max = C('skill1MaxAddArmor', 6), gap = C('skill1AddArmorInterval', 0.33), dmg = (C('skill1RegularDamageBullet', {}).damage || 7) + (up ? C('skill1StrengthenAddDamage', 1) : 0);
    const c = p._akCircle = { x: p.x, y: p.y, t: 0, given: 0, tick: 0, dtick: 0.15, gone: false, out: 0, retain: up ? C('skill1StrengthenSelfRetain', 3.5) : 0 };
    function drop() {
      if (c.given && p.armor > p.armorMax) p.armor = Math.max(p.armorMax, p.armor - c.given);
      c.given = 0;
    }
    if (up) {
      const tb = C('skill1TutorLevelUpTeleportBullet', {});
      for (const e of inRadius(G, c.x, c.y, R, R / 1.3)) hit(G, p, e, tb.damage || 24, { critChance: tb.critic == null ? 5 : tb.critic, repel: tb.repel || 3, fx: 'hit_purple', tag: 'teleport' });
      G.shake = Math.max(G.shake, 3);
    }
    G.props.push({
      x: c.x, y: -1e9 + c.y,
      update(G2, q, dt) {
        c.t += dt;
        const inside = p.st !== 'dead' && Math.hypot(p.x - c.x, (p.y - c.y) * 1.3) < R;
        c.out = inside ? 0 : c.out + dt;
        if (c.gone || c.out > c.retain) { drop(); q.gone = true; if (p._akCircle === c) p._akCircle = null; return; }
        c.tick -= dt; c.dtick -= dt;
        if (inside && c.tick <= 0 && c.given < max) {
          c.tick = gap; c.given++; p.armor++;
          flare(G2, p);
        }
        if (c.dtick <= 0) {
          c.dtick = AC.every;
          for (const e of inRadius(G2, c.x, c.y, R, R / 1.3)) hit(G2, p, e, dmg, { critChance: p.crit, repel: 0, fx: 'hit_purple', tag: 'circle' });
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
