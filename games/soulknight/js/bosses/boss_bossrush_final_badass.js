// Trùm boss_bossrush_final_badass: Tước Sĩ Tím (Sir Violet), bản Lợi Hại của trận cuối Khu Thí Luyện. AI dựng từ MB BossAI25 + BossRushFinal_Skill_Badass [ĐO].
// Logic đòn nằm trong IL2CPP: thứ tự/thời gian lấy từ trường BossRushFinal_Skill_Badass và sự kiện clip; chỗ nào không có trường ghi [ƯỚC LƯỢNG].
// Tám đòn: skill1 quạt đạn, skill2 loạt 5 viên, skill3 đập đất + lửa cháy, skill4 lưới tia xoay, skill5 lưỡi quay boomerang,
// skill6 kiếm bay phóng theo vạch, skill7 hàng tia song song, skill8 đấm cận chiến. Máu một nửa thì changeForm sang dạng hai (idle_2/run_2).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { DEG, TAU, U, dmgOf, aimAt, point, fire, beamLen, rigPlay, rigState, frameOf, sfx, clampRoom } = K;
  const PID = 'boss_bossrush_final_badass';
  const S = (K.B86.bosses[PID].mbs.BossRushFinal_Skill_Badass) || {};
  const S1 = S.skill1Data || {}, S2 = S.skill2Data || {}, S3 = S.skill3Data || {}, S4 = S.skill4Data || {}, S5 = S.skill5Data || {}, S6 = S.skill6Data || {}, S7 = S.skill7Data || {}, S8 = S.skill8Data || {};
  const cfg = c => (c && c.bulletConfig) || c || {};
  const protoOf = (c, d) => String((c && c.bulletProto) || d).replace(/^GameObject:/, '');
  const body = e => point(e, 'img/body/bodycenter');
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const CHANGE_LEN = 3.83;   // [ĐO clip changeForm: SkillAnimationEnd 3.8333 s]

  // Sát thương tối đa mỗi phát khi đang đổi dạng: maxTakenDamageWhenAngry 10 [ĐO]; phần vượt được hoàn lại (như khiên boss28)
  SK.on('enemyHit', (G, e, dmg) => {
    if (e.bossKey === PID && e.changing > 0) e.hp = Math.min(e.hpMax, e.hp + Math.max(0, dmg - (S.maxTakenDamageWhenAngry || 10)));
  });

  // Tia LineDamageCarrier (cảnh báo mảnh rồi tia dài tới tường), trúng mỗi damageInterval 0.5 s [ĐO].
  // s: {from() [x,y], a(t) rad, hw px, dmg (0 = chỉ vạch cảnh báo), warn s, dur s, live()}
  function line(G, e, s) {
    let hitT = 0;
    e.arena.objs.push({
      t: 0, ox: 0, oy: 0, a: 0, len: 0,
      update(G2, o, dt) {
        if (!s.live()) return false;
        [o.ox, o.oy] = s.from();
        o.a = s.a(o.t);
        o.len = beamLen(G2, o.ox, o.oy, o.a, s.max || 520);
        if (o.t < s.warn) return true;
        hitT -= dt;
        const p = G2.player;
        if (s.dmg > 0 && hitT <= 0 && p.st !== 'dead') {
          const px = p.x - o.ox, py = p.y - 7 - o.oy, c = Math.cos(o.a), sn = Math.sin(o.a);
          const along = px * c + py * sn, off = Math.abs(-px * sn + py * c);
          if (along > 0 && along < o.len && off < s.hw + 4) { SK.hurtPlayer(G2, dmgOf(s.dmg)); hitT = 0.5; }
        }
        return o.t < s.warn + s.dur;
      },
      air(ctx, G2, o) {
        if (e.deathDone) return;
        ctx.save();
        ctx.translate(o.ox, o.oy); ctx.rotate(o.a);
        if (o.t < s.warn) {
          const flash = s.warn - o.t < 0.5 ? 0.35 + 0.35 * Math.abs(Math.sin(o.t * 26)) : 0.4;
          ctx.fillStyle = 'rgba(255,60,90,' + flash + ')';
          ctx.fillRect(0, -1, o.len, 2);
        } else if (s.dmg > 0) {
          ctx.globalAlpha = Math.max(0, Math.min(1, (s.warn + s.dur - o.t) / 0.1));
          ctx.fillStyle = 'rgba(190,70,255,0.5)'; ctx.fillRect(0, -s.hw, o.len, s.hw * 2);
          ctx.fillStyle = 'rgba(245,225,255,0.95)'; ctx.fillRect(0, -Math.max(1.5, s.hw * 0.45), o.len, Math.max(3, s.hw * 0.9));
        }
        ctx.restore();
      }
    });
  }

  function clearLayers(e) { e.R.anims[0].layers.forEach((ly, i) => { if (i > 0) ly.st = null; }); }
  // Một đòn = một vật sàn đấu; e.skill là thẻ, bị huỷ (đổi dạng/chết) thì mọi tia và viên gắn với đòn dừng theo.
  function begin(G, e, fn) {
    const tok = e.skill = {};
    const live = () => e.skill === tok && !e.deathDone;
    const fin = () => { if (e.skill === tok) { e.skill = null; e.atkEnd = true; clearLayers(e); } };
    e.arena.objs.push({ t: 0, update(G2, o, dt) {
      if (!live()) return false;
      if (fn(G2, o, dt, live) === false) { fin(); return false; }
      return true;
    } });
    return live;
  }
  // Chạy các mốc (giây, hàm) theo dòng thời gian của đòn; trả true khi hết mốc và qua `end`.
  const stepper = (marks, end) => {
    let i = 0;
    return (G2, o) => {
      while (i < marks.length && o.t >= marks[i][0]) marks[i++][1](G2, o);
      return o.t < end;
    };
  };

  // ---- skill1 (atk1): sự kiện clip 0.5167 s bắn bulletCount 7 viên bullet_e_26 rải angleRange 90°, tốc 8, sát thương 4, cách thân 0.7 đơn vị [ĐO]; nổi giận +2 viên [ƯỚC LƯỢNG]
  function skill1(G, e) {
    const b = cfg(S1);
    begin(G, e, stepper([[0.5167, G2 => {
      sfx(G2, S1.sound);
      const n = (S1.bulletCount || 7) + (e.enraged ? 2 : 0), range = (S1.angleRange || 90) * DEG, [x, y] = body(e), a0 = aimAt(G2, x, y);
      for (let i = 0; i < n; i++) {
        const a = a0 - range / 2 + (n > 1 ? range * i / (n - 1) : range / 2), d = (S1.emitDistance || 0.7) * U;
        fire(G2, e, protoOf(b, 'bullet_e_26'), x + Math.cos(a) * d, y + Math.sin(a) * d, a, { spd: b.speed || 8, dmg: b.damage || 4, h: 12 });
      }
    }]], 0.75));
  }

  // ---- skill2 (atk2): từ 0.75 s bắn emitTimes 5 loạt, cách nhau interval 0.8 s, mỗi loạt một viên bullet_e_44 tốc 11 sát thương 2 nhắm người chơi [ĐO]; nổi giận bắn đôi lệch 12° [ƯỚC LƯỢNG]
  function skill2(G, e) {
    const b = cfg(S2), n = S2.emitTimes || 5, gap = S2.interval || 0.8, marks = [];
    for (let i = 0; i < n; i++) marks.push([0.75 + i * gap, G2 => {
      sfx(G2, S2.sound);
      const [x, y] = body(e), a = aimAt(G2, x, y), d = (S2.emitDistance || 0.7) * U;
      const ks = e.enraged ? [-12 * DEG, 12 * DEG] : [0];
      for (const k of ks) fire(G2, e, protoOf(b, 'bullet_e_44'), x + Math.cos(a + k) * d, y + Math.sin(a + k) * d, a + k, { spd: b.speed || 11, dmg: b.damage || 2, h: 12 });
    }]);
    begin(G, e, stepper(marks, 0.75 + (n - 1) * gap + 0.5));
  }

  // ---- skill3 (atk3): đập đất ở 0.55 s (landDamage, sát thương 4), hai mốc 1.2 s và 1.3 s để lại vùng cháy burnEfx (sát thương 1, mỗi 0.5 s);
  // chỉ dùng khi người chơi trong validDistance.x 6 đơn vị [ĐO]; bán kính chấn động 4.5 đơn vị, vùng cháy bán kính 1.8 đơn vị, sống 4 s (nổi giận burnEfxAngry: 6 s, thêm một vùng) [ƯỚC LƯỢNG]
  function burn(G, e, x, y, life, rad, dmg) {
    let hitT = 0;
    e.arena.objs.push({
      t: 0,
      update(G2, o, dt) {
        if (e.deathDone) return false;
        hitT -= dt;
        const p = G2.player;
        if (hitT <= 0 && p.st !== 'dead' && Math.hypot(p.x - x, (p.y - 3) - y) < rad + 4) { SK.hurtPlayer(G2, dmgOf(dmg)); hitT = 0.5; }
        return o.t < life;
      },
      ground(ctx, G2, o) {
        const k = Math.min(1, o.t / 0.3, (life - o.t) / 0.5), fl = 0.75 + 0.25 * Math.sin(o.t * 18);
        ctx.save();
        ctx.globalAlpha = Math.max(0, k) * 0.8;
        const g = ctx.createRadialGradient(x, y, 2, x, y, rad);
        g.addColorStop(0, 'rgba(255,230,120,' + fl + ')'); g.addColorStop(0.55, 'rgba(255,110,40,0.65)'); g.addColorStop(1, 'rgba(160,40,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(x, y, rad, rad * 0.75, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    });
  }
  function skill3(G, e) {
    const b = cfg(S3.landDamage), R = 4.5 * U, ang = e.enraged;
    begin(G, e, stepper([
      [0.55, G2 => {
        const x = e.x, y = e.y;
        sfx(G2, 'AudioClip:fx_laser_explode');
        G2.shake = Math.max(G2.shake, 5);
        const p = G2.player;
        if (p.st !== 'dead' && Math.hypot(p.x - x, (p.y - 5) - y) < R + 4) SK.hurtPlayer(G2, dmgOf(b.damage || 4));
        e.arena.objs.push({ t: 0, update: (G3, o) => o.t < 0.4, air(ctx, G3, o) {
          const k = o.t / 0.4, sp = frameOf('effect_shock2_0');
          if (sp) SK.draw(ctx, sp, x, y, { sx: 2 + k * 3, sy: (2 + k * 3) * 0.75, alpha: 1 - k });
          else { ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#d6a0ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, R * k, R * k * 0.75, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
        } });
      }],
      [1.2, G2 => { const p = G2.player; const [x, y] = clampRoom(e, p.x, p.y); burn(G2, e, x, y, ang ? 6 : 4, 1.8 * U, 1); }],
      [1.3, G2 => {
        const p = G2.player, n = ang ? 2 : 1;
        for (let i = 0; i < n; i++) { const a = SK.rand() * TAU, [x, y] = clampRoom(e, p.x + Math.cos(a) * 3 * U, p.y + Math.sin(a) * 3 * U); burn(G2, e, x, y, ang ? 6 : 4, 1.8 * U, 1); }
      }]
    ], 1.667));
  }

  // ---- skill4 (atk4, lặp): lưới 4 tia beamGrid (chữ thập) — chờ delay 1.7 s (vạch cảnh báo), đứng yên extraDelayRotate 0.7 s, rồi tăng tốc xoay 16.2°/s²,
  // nửa sau tâm trượt về phía người chơi tối đa 5 đơn vị tốc 3.5 đơn vị/s trong lúc xoay đều 50°/s; tổng duration 6.3 s; bề rộng 0.6 × size 3; sát thương 3 [ĐO];
  // cách chia hai pha xoay và hướng trượt [ƯỚC LƯỢNG]
  function skill4(G, e) {
    const D = cfg(S4.damage), delay = S4.delay || 1.7, still = S4.extraDelayRotate || 0.7, dur = S4.duration || 6.3, acc = (S4.rotateSpeedAcceleration || 16.2) * DEG;
    const maxShift = (S4.maxShiftAmount || 5) * U, shiftSp = (S4.shiftSpeed || 3.5) * U, constW = (S4.constantRotateSpeedWhenShifting || 50) * DEG;
    const hw = 0.6 * (S4.size || 3) * U / 2;
    const c = { x: 0, y: 0, a: aimAt(G, ...body(e)), w: 0, mv: 0 };
    [c.x, c.y] = body(e);
    sfx(G, S4.sound);
    const half = delay + still + (dur - still) / 2;
    const live = begin(G, e, (G2, o, dt) => {
      if (o.t >= delay + still) {
        if (o.t < half) c.w += acc * dt;
        else {
          c.w = constW;
          const p = G2.player, d = Math.hypot(p.x - c.x, p.y - 7 - c.y);
          if (c.mv < maxShift && d > 4) {
            const mv = Math.min(shiftSp * dt, maxShift - c.mv);
            const [nx, ny] = clampRoom(e, c.x + (p.x - c.x) / d * mv, c.y + (p.y - 7 - c.y) / d * mv);
            c.mv += mv; c.x = nx; c.y = ny;
          }
        }
        c.a += c.w * dt;
      }
      return o.t < delay + dur;
    });
    for (let k = 0; k < 4; k++) line(G, e, { live, from: () => [c.x, c.y], a: () => c.a + k * TAU / 4, hw, dmg: D.damage || 3, warn: delay, dur, max: 400 });
    // quả cầu sét ở tâm lưới
    e.arena.objs.push({
      t: 0, update: (G2, o) => live() && o.t < delay + dur + 0.2,
      air(ctx, G2, o) {
        const sp = frameOf('bullet_37');
        if (sp) SK.draw(ctx, sp, c.x, c.y, { sx: 2 + 0.3 * Math.sin(o.t * 20), sy: 2 + 0.3 * Math.sin(o.t * 20), alpha: Math.min(1, o.t / 0.5) });
      }
    });
  }

  // ---- skill5 (atk5): lưỡi quay whirl_blade (sát thương 3, tốc 8.2 đơn vị/s, trúng mỗi 2 s, bán kính 2 đơn vị) ném ở 0.5167 s, đổi hướng theo vị trí người chơi lấy mẫu mỗi sampleInterval 0.7 s
  // với tốc xoay 110°/s, thu về ở sự kiện 1.5 s [ĐO]; đường bay boomerang và bán kính trúng 26 px [ƯỚC LƯỢNG]; nổi giận ném hai lưỡi lệch 25°
  function blade(G, e, a0) {
    const b = cfg(S5.damage), sp = (b.speed || 8.2) * U, turn = (S5.angleSpeed || 110) * DEG, samp = S5.sampleInterval || 0.7;
    const [x0, y0] = body(e);
    const st = { x: x0 + Math.cos(a0) * (S5.emitDistance || 1) * U, y: y0 + Math.sin(a0) * (S5.emitDistance || 1) * U, a: a0, back: false, want: a0, next: samp, hit: -9 };
    e.arena.objs.push({
      t: 0,
      update(G2, o, dt) {
        if (e.deathDone) return false;
        const p = G2.player, [bx, by] = body(e);
        if (!st.back && o.t >= 0.98) st.back = true;   // sự kiện clip 1.5 s − 0.5167 s
        if (st.back) st.want = Math.atan2(by - st.y, bx - st.x);
        else if (o.t >= st.next) { st.next += samp; st.want = Math.atan2(p.y - 7 - st.y, p.x - st.x); }
        const d = wrap(st.want - st.a), lim = turn * dt * (st.back ? 3 : 1);
        st.a += Math.max(-lim, Math.min(lim, d));
        const nx = st.x + Math.cos(st.a) * sp * dt, ny = st.y + Math.sin(st.a) * sp * dt;
        [st.x, st.y] = clampRoom(e, nx, ny);
        if (p.st !== 'dead' && o.t - st.hit >= 2 && Math.hypot(p.x - st.x, (p.y - 7) - st.y) < 26 + 4) { SK.hurtPlayer(G2, dmgOf(b.damage || 3)); st.hit = o.t; }
        if (st.back && Math.hypot(bx - st.x, by - st.y) < 14) return false;
        return o.t < 6;
      },
      air(ctx, G2, o) {
        const f = frameOf('weapons_3');
        if (f) SK.draw(ctx, f, st.x, st.y - 6, { rot: -o.t * 1600 * DEG * 0.25, sx: 1.4, sy: 1.4 });
      }
    });
  }
  function skill5(G, e) {
    begin(G, e, stepper([[0.5167, G2 => {
      sfx(G2, S5.sound);
      const [x, y] = body(e), a = aimAt(G2, x, y);
      if (e.enraged) { blade(G2, e, a - 25 * DEG); blade(G2, e, a + 25 * DEG); } else blade(G2, e, a);
    }]], 1.833));
  }

  // ---- skill6 (atk6): vạch cảnh báo alert_line ở 1.333 s, kiếm swordmissile (hộp 4×1.2 đơn vị, sát thương 4, tốc 28 đơn vị/s, khứ hồi flyOneTripDuration 1 s) phóng ở 1.6 s;
  // kiếm thứ hai ở 2.233 s theo vạch mới [ĐO sự kiện clip và trường]; thời gian đi/về chia đôi, thêm kiếm thứ ba lệch khi nổi giận [ƯỚC LƯỢNG]
  function sword(G, e, a, spr) {
    const b = cfg(S6.damage), sp = (b.speed || 28) * U, trip = S6.flyOneTripDuration || 1;
    const [x0, y0] = body(e);
    const st = { x: x0, y: y0, hit: -9 };
    e.arena.objs.push({
      t: 0,
      update(G2, o, dt) {
        if (e.deathDone) return false;
        const out = o.t < trip / 2;
        const [bx, by] = body(e);
        if (out) { st.x += Math.cos(a) * sp * dt; st.y += Math.sin(a) * sp * dt; }
        else { const d = Math.hypot(bx - st.x, by - st.y), mv = Math.min(d, sp * dt); if (d > 1) { st.x += (bx - st.x) / d * mv; st.y += (by - st.y) / d * mv; } }
        st.ang = out ? a : Math.atan2(by - st.y, bx - st.x);
        const p = G2.player, c = Math.cos(st.ang), s = Math.sin(st.ang), dx = p.x - st.x, dy = p.y - 7 - st.y;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        if (p.st !== 'dead' && o.t - st.hit >= 1 && Math.abs(lx) < 2 * U + 4 && Math.abs(ly) < 0.6 * U + 4) { SK.hurtPlayer(G2, dmgOf(b.damage || 4)); st.hit = o.t; }
        return o.t < trip;
      },
      air(ctx, G2, o) {
        const f = frameOf(spr);
        if (f) SK.draw(ctx, f, st.x, st.y - 4, { rot: (st.ang || a) - 45 * DEG, sx: 1.3, sy: 1.3 });
      }
    });
  }
  function skill6(G, e) {
    let a = 0;
    const alertLine = (G2, live, until, track) => line(G2, e, { live, from: () => body(e), a: t => { if (t < track) a = aimAt(G2, ...body(e)); return a; }, hw: 1, dmg: 0, warn: until, dur: 0.02, max: 420 });
    begin(G, e, stepper([
      [1.333, G2 => { a = aimAt(G2, ...body(e)); alertLine(G2, () => e.skill && !e.deathDone, 0.267, 0.2); }],
      [1.6, G2 => {
        sfx(G2, S6.sound);
        sword(G2, e, a, 'weapons_0');
        if (e.enraged) { sword(G2, e, a - 14 * DEG, 'weapons_3'); sword(G2, e, a + 14 * DEG, 'weapons_3'); }
      }],
      [1.9, G2 => { a = aimAt(G2, ...body(e)); alertLine(G2, () => e.skill && !e.deathDone, 0.333, 0.25); }],
      [2.233, G2 => { sfx(G2, S6.sound); sword(G2, e, a, 'weapons_3'); }]
    ], 2.6));
  }

  // ---- skill7 (atk7): hàng count 9 tia song song parallel_beam (rộng 0.3, sát thương 3) cách nhau interval 2.6 đơn vị theo hướng tới người chơi,
  // cảnh báo skillDuration 0.6 s rồi bắn 0.3 s [ĐO]; đợt lặp nhanh hơn repeatSpeedUp 1.2 và lệch nửa khoảng để quét chỗ người chơi vừa đứng; 2 đợt (3 khi nổi giận) [ƯỚC LƯỢNG]
  function skill7(G, e) {
    const n = S7.count || 9, gap = (S7.interval || 2.6) * U;
    const D = cfg(S7.damage), up = S7.repeatSpeedUp || 1.2, waves = e.enraged ? 3 : 2;
    let k = 0, t0 = 0;
    const launch = (G2, live, wi) => {
      const [x, y] = body(e), a = aimAt(G2, x, y), nx = -Math.sin(a), ny = Math.cos(a);
      // toạ độ ngang của người chơi so với trục trùm→người chơi là 0; đợt đầu chừa người chơi ở giữa khe, đợt sau đặt tia lên chỗ đó
      const shift = wi % 2 === 0 ? gap / 2 : 0, warn = (S7.skillDuration || 0.6) / Math.pow(up, wi);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * gap + shift;
        line(G2, e, { live, from: () => [x + nx * off, y + ny * off], a: () => a, hw: 0.3 * U / 2, dmg: D.damage || 3, warn, dur: 0.3, max: 520 });
      }
      return warn + 0.3;
    };
    let live;
    live = begin(G, e, (G2, o) => {
      if (o.t >= t0 && k < waves) { t0 = o.t + launch(G2, live, k) + 0.2; k++; sfx(G2, 'AudioClip:fx_laser_bullet'); }
      return !(k >= waves && o.t >= t0);
    });
  }

  // ---- skill8: đấm punch_spear (size 3, sát thương 3, repel 8) khi người chơi trong minDistance 3 đơn vị, CD 2 s [ĐO]; dùng clip atk1 (sự kiện 0.5167 s) [ƯỚC LƯỢNG]
  function skill8(G, e) {
    const b = cfg(S8.meleeBulletConfig), reach = (S8.minDistance || 3) * U + 18;
    e.cds.skill8 = S8.CD || 2;
    begin(G, e, stepper([[0.5167, G2 => {
      sfx(G2, S8.sound);
      const [mx, my] = point(e, 'img/meleeAttackBulletPoint'), p = G2.player;
      if (p.st !== 'dead' && Math.hypot(p.x - mx, (p.y - 7) - my) < reach) {
        SK.hurtPlayer(G2, dmgOf(b.damage || 3));
        const a = Math.atan2(p.y - 7 - my, p.x - mx);
        e.arena.objs.push({ t: 0, update(G3, o, dt) { SK.moveBox(G3.map, G3.player, Math.cos(a) * 200 * dt, Math.sin(a) * 200 * dt, 4); return o.t < 0.15; } });
      }
      G2.shake = Math.max(G2.shake, 2);
    }]], 0.75));
  }

  const NEAR = (S8.minDistance || 3) * U + 14, SLAM = ((S3.validDistance && S3.validDistance.x) || 6) * U;
  const def = {
    atks: ['skill1', 'skill2', 'skill3', 'skill4', 'skill5', 'skill6', 'skill7', 'skill8'],
    // atk1..atk7 là clip có thật; skill8 (cận chiến) mượn clip atk1 [ƯỚC LƯỢNG]
    state: { skill1: 'atk1', skill2: 'atk2', skill3: 'atk3', skill4: 'atk4', skill5: 'atk5', skill6: 'atk6', skill7: 'atk7', skill8: 'atk1' },
    idle: 'idle', run: 'run', enrageCd: 0.7,
    skipNode: n => /^(burnEfx|burnEfxAngry|landDamage|smokefx|preparefx|sphere_lightning)/.test(n.n),
    start: { skill1, skill2, skill3, skill4, skill5, skill6, skill7, skill8 },
    stillWhileBusy: true,
    pick(G, e) {
      const p = G.player, d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < NEAR && e.cds.skill8 <= 0 && SK.chance(0.7)) return ['skill8'];
      const l = ['skill1', 'skill2', 'skill5'];
      if (d < SLAM) l.push('skill3');
      if (e.enraged) { l.push('skill6', 'skill7'); if (e.cds.skill4 <= 0) l.push('skill4', 'skill4'); }
      else if (e.hp < e.hpMax * 0.8) l.push('skill6');
      return l;
    },
    tick(G, e, dt) {
      if (e.deathDone) return;
      if (!e.cds) e.cds = { skill4: 0, skill8: 0 };
      for (const k of Object.keys(e.cds)) e.cds[k] -= dt;
      if (e.changing > 0) e.changing -= dt;
      if (e.skill && e.atk) e.atk = rigState(e.R);
    },
    enrage(G, e) {
      // changeForm (4 s): SkillAnimationEvent 2.17 s, kết thúc 3.83 s rồi vào idle_2; không đánh trong lúc đổi dạng
      if (e.skill) { e.skill = null; clearLayers(e); }
      if (e.atk) e.atkEnd = true;
      e.def = Object.assign({}, e.def, { idle: 'idle_2', run: 'run_2' });
      e.moving = false; e.goal = null;
      e.busy = CHANGE_LEN; e.changing = CHANGE_LEN;
      rigPlay(e.R, 'changeForm');
      sfx(G, S.angryClip);
      G.shake = Math.max(G.shake, 5);
    }
  };
  // skill4 chỉ gọi khi hết hồi interval 6.5 s [ĐO]
  const origStart4 = def.start.skill4;
  def.start.skill4 = (G, e) => { e.cds.skill4 = S4.interval || 6.5; origStart4(G, e); };
  SK.bossRegister(PID, def);
})();
