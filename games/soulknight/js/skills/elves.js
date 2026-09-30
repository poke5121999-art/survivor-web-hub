// Kỹ năng Tiên Tộc (c08): guardian_elf. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, W = SK.world;
  const { cfg, layer, alive, ec, nearest, inRadius, hit, fx, hasVfx, stopFx, timers } = K;
  const snd = n => { if (n && window.SK_AUDIO && SK_AUDIO.clips[n] && SK.sfx && SK.sfx.play) SK.sfx.play(n, { poly: 2, gap: 0.05, vol: 0.7 }); };

  // Tinh Linh Thủ Hộ [ĐO c08/skill 3: cd 6, args "2"; C09Controller.RoleSkill2 (fairyIndex = (fairyIndex + 1) mod 3, tinh linh cũ bay đi);
  // pet_fairy_fire/wind/water: RoleAttribute speed 8, speed_rate 0.5 (RGPetController.FixedUpdate: vận tốc = speed × (speed_rate + 1) = 12 đơn vị/s),
  // PetFairyController atk_cd 2.5 / 2 / 5, atk_range 8, remoteScoutDistance 12, min/max_follow_distance 2/20; sfx fx_skill_ploy]: bấm để triệu hồi
  // một tinh linh đi theo, bấm lần nữa thì đổi sang tinh linh kế (Lửa → Gió → Nước); tinh linh không bị nhắm và không nhận sát thương [WIKI].
  // Có mục tiêu thì bay tới tới khi trong atk_range, không thì bám người chơi tới khi còn dưới min_follow_distance, quá max_follow_distance thì
  // dịch chuyển tới người chơi [ĐO RGPetController.RunReflection/FlyToMaster]; chỉ tìm mục tiêu khi đang trong trận [ĐO get_ShouldSearchTarget].
  //  - Lửa: mỗi 2.5 s bắn args = 2 bóng lửa [ĐO Gun002 multiCount 2, angle 15, damage 6, critic 30, speed 15]; bóng nổ sau boom_time 0.375 s
  //    [ĐO DelayExplode] để lại Fire2 [ĐO BulletFire damage 2 / 0.5 s, circleCastRadius 3; thời gian tồn tại: BulletFire lấy từ BulletInfo.duration
  //    của đạn, không đọc được ở đây nên giữ 3 s là ƯỚC LƯỢNG].
  //  - Gió: mỗi 2 s bắn một mũi tên [ĐO Gun005 bulletsInfo[0] damage 2, speed 30; bulletsInfo[1] (damage 4, size 0) chưa rõ công dụng]; cung của chính
  //    người chơi tụ đầy lực thì mũi tên trúng kèm sóng năng lượng [ĐO explode_blast_out BulletPolymerization: CircleCastAll bán kính range 12 quanh
  //    chỗ trúng, mỗi quái damage 5 ngay lập tức, power 32; không kéo/đẩy thêm vì is_poly = 0].
  //  - Nước: mỗi 5 s, khi đang trong trận và người chơi trong 12 đơn vị còn thiếu giáp hoặc năng lượng [ĐO PetFairyController.FindTarget], bắn cục
  //    buff_water_shield bay 24 đơn vị/s [ĐO GunBuff bulletsInfo] tới người chơi, chạm thì hồi 2 giáp + 5 năng lượng [ĐO BuffWaterShield armor 2, energy 5].
  const EL = { speed: 12 * U, scout: 12 * U, minFollow: 2 * U, maxFollow: 20 * U, atkRange: 8 * U, healRange: 12 * U,
    fireN: 2, fireAng: 15, fireDmg: 6, fireCrit: 30, fireSpeed: 15 * U, boom: 0.375, pool: 3, poolEvery: 0.5, poolDmg: 2, poolR: 3 * U,
    arrowDmg: 2, arrowSpeed: 30 * U, waveDmg: 5, waveR: 12 * U, buffSpeed: 24 * U, water: { armor: 2, energy: 5 } };
  const KIND = [
    { id: 'fire', key: 'idle_fire', body: 'c09_fairy_0', weapon: 'c09_fairy_12', hand: [7.2, 15.2], cd: 2.5 },
    { id: 'wind', key: 'idle_wind', body: 'c09_fairy_8', weapon: 'c09_fairy_14', hand: [3.79, 14.66], cd: 2 },
    { id: 'water', key: 'idle_water', body: 'c09_fairy_4', weapon: 'c09_fairy_13', hand: [-1.6, 18.4], cd: 5 }
  ];

  S.guardian_elf = {
    start(G, p) {
      layer(G);
      if (p._elf) p._elf.gone = true;
      const kind = p._elfNext || 0;
      p._elfNext = (kind + 1) % KIND.length;
      const a = p._elf = { kind, x: p.x - p.face * EL.minFollow, y: p.y, face: p.face, t: 0, cd: 0.6, tip: 0, gone: false };
      G.props.push({ x: a.x, y: a.y, elf: a,
        update(G2, q, dt) { if (a.gone || p._elf !== a) { q.gone = true; return; } tick(G2, p, a, dt); q.x = a.x; q.y = a.y; },
        draw(ctx) { drawElf(ctx, a); } });
      fx(G, hasVfx('atf_fairy_showupFx') ? 'atf_fairy_showupFx' : 'effect_up', a.x, a.y - 8, { dur: 1 });
      snd('fx_skill_ploy');
    }
  };
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p && p._elf) { p._elf.gone = true; p._elf = null; } });

  function tick(G, p, a, dt) {
    a.t += dt; a.tip = Math.max(0, a.tip - dt);
    const P = KIND[a.kind], busy = G.enemies.some(e => alive(e) && e.room === G.room);
    a.cd -= dt;
    const dm = Math.hypot(p.x - a.x, p.y - a.y);
    if (dm > EL.maxFollow) { a.x = p.x; a.y = p.y; }
    // Mục tiêu: quái gần nhất (Lửa/Gió); tinh linh Nước nhắm người chơi khi thiếu giáp/năng lượng.
    const need = p.armor < p.armorMax || p.energy < p.energyMax;
    const water = a.kind === 2 && busy && need && dm <= EL.healRange;
    const e = a.kind === 2 || !busy ? null : nearest(G, a.x, a.y - 14, EL.scout, { los: true });
    let goal = null, inRange = false;
    if (e) { const [ex, ey] = ec(e); inRange = Math.hypot(ex - a.x, ey - (a.y - 14)) <= EL.atkRange; if (!inRange) goal = [ex, ey + 14]; }
    else if (water) { inRange = dm <= EL.atkRange; if (!inRange) goal = [p.x, p.y]; }
    else if (dm > EL.minFollow) goal = [p.x, p.y];
    if (goal) {
      const gx = goal[0] - a.x, gy = goal[1] - a.y, gd = Math.hypot(gx, gy), st = Math.min(gd, EL.speed * dt);
      if (gd > 0.5) { a.x += gx / gd * st; a.y += gy / gd * st; }
    }
    if (e) { a.face = ec(e)[0] >= a.x ? 1 : -1; a.aim = Math.atan2(ec(e)[1] - (a.y - 14), ec(e)[0] - a.x); } else a.face = p.face, a.aim = a.face > 0 ? 0 : Math.PI;
    if (a.cd > 0) return;
    if (a.kind === 2) {
      if (!water || !inRange) { a.cd = 0.3; return; }
      a.cd = P.cd; a.tip = 0.4;
      buffShot(G, p, a);
      snd('fx_healthpot');
      return;
    }
    if (!inRange) { a.cd = 0.2; return; }
    a.cd = P.cd; a.tip = 0.25;
    const ox = a.x + Math.cos(a.aim) * 10, oy = a.y - 14 + Math.sin(a.aim) * 10;
    if (a.kind === 0) {
      const n = +(cfg(p, 'guardian_elf').args || EL.fireN);
      for (let i = 0; i < n; i++) fireball(G, p, ox, oy, a.aim + SK.deg((i - (n - 1) / 2) * EL.fireAng));
    } else {
      bolt(G, p, ox, oy, a.aim, { speed: EL.arrowSpeed, dmg: EL.arrowDmg, tag: 'elf_wind', life: 1, draw: (ctx, x, y) => SK.draw(ctx, 'bullet_94', x, y, { rot: a.aim + (Math.cos(a.aim) < 0 ? Math.PI : 0), flip: Math.cos(a.aim) < 0 }) });
    }
  }

  // Cục buff_water_shield bay tới người chơi rồi mới hồi giáp và năng lượng.
  function buffShot(G, p, a) {
    const pos = { x: a.x, y: a.y - 12 };
    G.props.push({ x: pos.x, y: 1e9,
      update(G2, q, dt) {
        const dx = p.x - pos.x, dy = p.y - 8 - pos.y, d = Math.hypot(dx, dy), st = EL.buffSpeed * dt;
        if (d > st && d > 6) { pos.x += dx / d * st; pos.y += dy / d * st; return; }
        q.gone = true;
        p.armor = Math.min(p.armorMax, p.armor + EL.water.armor);
        p.energy = Math.min(p.energyMax, p.energy + EL.water.energy);
        SK.num(G2, p.x, p.y - 30, '+' + EL.water.armor, '#c9d2df');
        fx(G2, 'buff_water_shield', p.x, p.y - 8, { follow: p, dy: -8, dur: 1 });
      },
      draw(ctx, G2, q) { SK.draw(ctx, 'bullet_12', pos.x, pos.y, {}); } });
  }

  // Đạn của tinh linh: bay thẳng, dừng khi chạm quái/tường/hết đời; onEnd(x, y, enemy) xử lý va chạm.
  function bolt(G, p, x, y, ang, o) {
    const c1 = Math.cos(ang), s1 = Math.sin(ang), pos = { x, y };
    let t = 0;
    const pr = { x, y: 1e9, follow: pos,
      update(G2, q, dt) {
        t += dt;
        const n = 4;
        for (let i = 0; i < n && !q.gone; i++) {
          pos.x += c1 * o.speed * dt / n; pos.y += s1 * o.speed * dt / n;
          const e = G2.enemies.find(v => alive(v) && Math.hypot(ec(v)[0] - pos.x, ec(v)[1] - pos.y) < v.r + 4);
          if (e || W.solidAt(G2.map, pos.x, pos.y + 6) || t > o.life) {
            q.gone = true;
            if (e) hit(G2, p, e, o.dmg, { critChance: o.crit || 0, ang, repel: 2, fx: 'hit_green', tag: o.tag });
            if (o.onEnd) o.onEnd(G2, pos.x, pos.y, e);
          }
        }
        if (q.gone && o.h) stopFx(o.h);
      },
      draw(ctx) { if (o.draw) o.draw(ctx, pos.x, pos.y); }
    };
    if (o.vfx) o.h = fx(G, o.vfx, x, y, { follow: pos, dur: o.life });
    G.props.push(pr);
    return pr;
  }
  function fireball(G, p, x, y, ang) {
    bolt(G, p, x, y, ang, { speed: EL.fireSpeed, dmg: EL.fireDmg, crit: EL.fireCrit, tag: 'elf_fire', life: EL.boom, vfx: 'fireball_fairy',
      onEnd(G2, bx, by) {
        fx(G2, 'explode_hit_enemy', bx, by, { scale: 0.6 });
        const h = fx(G2, 'Fire2', bx, by, { dur: EL.pool, layer: 'ground', scale: 0.55 });
        G2.props.push({ x: bx, y: -1e9, t: 0, tick: 0, draw() {},
          update(G3, q, dt) {
            q.t += dt; q.tick -= dt;
            if (q.t >= EL.pool) { stopFx(h); q.gone = true; return; }
            if (q.tick > 0) return;
            q.tick = EL.poolEvery;
            for (const v of inRadius(G3, bx, by, EL.poolR, EL.poolR * 0.62)) hit(G3, p, v, EL.poolDmg, { noMul: true, tag: 'elf_pool' });
          } });
      } });
  }

  // Tinh linh Gió: mũi tên tụ đủ lực của người chơi trúng quái thì bung sóng năng lượng.
  SK.on('fire', (G, p, w) => {
    const el = p._elf;
    if (!el || el.kind !== 1 || !w || !w.def || !w.def.w86 || w.def.w86.fam !== 'bow' || !(w.hold >= (w.def.charge || 1) * 0.999)) return;
    for (const b of G.bullets) if (b.side === 'p' && !b._seen) b._wave = true;
  });
  timers.elfWind = G => { for (const b of G.bullets) if (b.side === 'p') b._seen = true; };
  SK.on('enemyHit', (G, e) => {
    const p = G.player, b = G._hitBullet;
    if (!p || !p._elf || p._elf.kind !== 1 || G._skHit || !b || !b._wave || b._waved) return;
    b._waved = true;
    const [cx, cy] = ec(e);
    blast(G, p, cx, cy);
  });
  // BulletPolymerization: mọi quái trong bán kính range quanh chỗ trúng nhận damage 5 ngay lúc đó [ĐO Polymerization].
  function blast(G, p, x, y) {
    fx(G, 'explode_blast_out', x, y - 4, {});
    for (const e of inRadius(G, x, y, EL.waveR)) hit(G, p, e, EL.waveDmg, { repel: 3, tag: 'elf_wave' });
  }

  function drawElf(ctx, a) {
    const P = KIND[a.kind], pop = Math.min(1, a.t / 0.3), bob = Math.sin(a.t * 4) * 1.5, f = a.face < 0;
    SK.draw(ctx, 'shadow3', a.x, a.y, { alpha: 0.5, sx: 0.7 * pop, sy: 0.7 * pop });
    const fr = SK.animFrame('pet_fairy_0/' + P.key, a.t) || P.body;
    SK.draw(ctx, fr, a.x, a.y - 4.8 - bob, { flip: f, sx: pop, sy: pop });
    const hx = a.x + P.hand[0] * (f ? -1 : 1) * pop, hy = a.y - P.hand[1] - bob;
    if (a.kind === 2) { SK.draw(ctx, P.weapon, hx, hy, { flip: f, sx: pop, sy: pop }); return; }
    SK.drawGun(ctx, P.weapon, hx, hy, a.aim || 0, null, { kick: a.tip > 0 ? 2 : 0 });
  }
})();
