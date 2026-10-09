// Trùm boss_dead_cell_giant — Người Khổng Lồ (1-5 Di Tích, quái từ Dead Cells). Máu 512 × 1.2, Speed 0 = đứng yên [ĐO].
// BossDeadCellGiantSkill trống trong dữ liệu (logic ở IL2CPP), nên bộ đòn dựng từ tên state + sự kiện clip OnSkillAnimationEvent
// và các nút đạn nằm trong rig (bullet_e_shock_wave, bullet_eye_laser, bullet_e_44, bullet_crystal, meteor_explode: explode_small/big/nuclear).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { U, TAU, DEG, aimAt, fire, point, blast, explode, beam, clampRoom, rigPlay, sfx } = K;
  const W = SK.world;
  const HAND_L = 'img/arm_l/root_arm_l/forearm_l/hand_l/fire_point';
  const HAND_R = 'img/arm_r/root_arm_r/forearm_r/hand_r/fire_point';
  const MOUTH = 'img/head/mouth/firepos';
  const EYES = ['img/head/eye0', 'img/head/eye1'];

  // Dải sóng chấn bay thẳng, mỗi 0.2 s một effect_shock3 (bullet_e_shock_wave) — số theo effect_shock3 [ĐO ExplodeEnergy damage 4]
  function shockLine(G, e, x, y, ang) {
    const sp = 10 * U, c = Math.cos(ang), s = Math.sin(ang);
    let next = 0.15;
    e.arena.objs.push({ t: 0, dur: 4, update(G2, o) {
      if (e.deathDone) return false;
      while (o.t >= next) {
        const d = next * sp;
        next += 0.15;
        const px = x + c * d, py = y + s * d;
        if (W.solidAt(G2.map, px, py)) return false;
        blast(G2, px, py, 15, 4, 'effect_shock3');
      }
      return o.t < o.dur;
    } });
  }
  // Thiên thạch pha lê (bullet_crystal → meteor_explode): báo 1 s rồi nổ. small 3 / big 6 [ĐO Explode.damage] / nuclear 8 bán kính rộng [ƯỚC LƯỢNG]
  function crystal(G, e, x, y, kind) {
    const h = SK.vfx && SK.vfx.spawn(G, 'e_fireball', x, y, {});
    e.arena.objs.push({ t: 0, dur: 1, update(G2, o) {
      if (o.t < o.dur) return true;
      if (h) h.kill();
      if (e.deathDone) return false;
      if (kind === 'nuclear') {
        if (SK.vfx) SK.vfx.spawn(G2, 'explode_nuclear', x, y, {});
        G2.shake = Math.max(G2.shake, 6);
        K.hurtIn(G2, x, y, 34, 8);
      } else explode(G2, x, y, 'explode_hit_player', kind === 'small' ? 'explode_small' : 'explode_big', kind === 'small' ? 3 : 6);
      return false;
    } });
  }
  function slam(G, e, hand) {
    const [x, y] = point(e, hand);
    blast(G, x, y, 26, 4, 'effect_shock3');
    G.shake = Math.max(G.shake, 5);
    shockLine(G, e, x, y, aimAt(G, x, y));
    return [x, y];
  }

  const giant = {
    atks: ['roar', 'eye_laser', 'atk1', 'L_hand_atk', 'R_hand_atk', 'two_hands_atk'], idle: 'ide', walk: false, enrageCd: 0.7,
    start: {
      // eye_laser: giữ tư thế mắt (clip 0.25 s không lặp), laser quét bám người chơi 3 s [ƯỚC LƯỢNG] rồi eye_laser_end
      eye_laser(G, e) {
        e.laserOn = true; e.busy = 4;
        let a = aimAt(G, e.x, e.y - 40);
        const dur = e.enraged ? 4 : 3, sweep = (e.enraged ? 55 : 40) * DEG;
        e.arena.objs.push({ t: 0, dur: 0.25, update(G2, o) {
          if (e.deathDone) { e.laserOn = false; return false; }
          if (o.t < o.dur) return true;
          const org = () => { const p0 = point(e, EYES[0]), p1 = point(e, EYES[1]); return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]; };
          beam(G2, e, 'bullet_e_8', {
            dmg: 4, alive: () => e.laserOn, origin: org,
            ang(dt) {
              const [ox, oy] = org(), want = aimAt(G2, ox, oy);
              let d = Math.atan2(Math.sin(want - a), Math.cos(want - a));
              a += SK.clamp(d, -sweep * dt, sweep * dt);
              return a;
            }
          });
          e.arena.objs.push({ t: 0, dur, update(G3, o2) {
            if (e.deathDone) { e.laserOn = false; return false; }
            if (o2.t < o2.dur) return true;
            e.laserOn = false; e.busy = 0;
            rigPlay(e.R, 'eye_laser_end'); e.atk = 'eye_laser_end'; e.atkEnd = false;
            return false;
          } });
          return false;
        } });
      }
    },
    // Clip eye_laser 0.25 s hết là brain coi đòn xong: giữ thời gian clip dưới độ dài để tư thế không rơi về idle
    tick(G, e) {
      if (!e.laserOn || e.atk !== 'eye_laser') return;
      const ly = e.R.anims[0].layers[0];
      if (ly.st === 'eye_laser' && ly.t > 0.2) ly.t = 0.2;
    },
    ev: {
      OnSkillAnimationEnd(G, e, arg, st) { if (st === e.atk) e.atkEnd = true; },
      OnSkillAnimationEvent(G, e, arg, st) {
        if (st === 'roar') {
          // roar (0.8 s): gầm rồi mưa thiên thạch pha lê quanh người chơi; 6 quả (nổi giận 9, thêm một quả nuclear) [ƯỚC LƯỢNG]
          const n = e.enraged ? 9 : 6;
          sfx(G, e.ai.angry_clip);
          for (let i = 0; i < n; i++) {
            e.arena.objs.push({ t: 0, dur: i * 0.2, update(G2, o) {
              if (o.t < o.dur) return true;
              if (e.deathDone) return false;
              const p = G2.player, a = SK.rand() * TAU, d = i % 3 ? SK.randf(1.5, 5) * U : 0;
              const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
              crystal(G2, e, x, y, e.enraged && i === n - 1 ? 'nuclear' : i % 2 ? 'big' : 'small');
              return false;
            } });
          }
        } else if (st === 'atk1') {
          // atk1 (0.8 s): đầu há miệng bắn bullet_e_44 (nảy tường tối đa 3 lần [ĐO RGBTRebound]); quạt 5 viên cách 18°, nổi giận 7 [ƯỚC LƯỢNG]
          const [x, y] = point(e, MOUTH), a = aimAt(G, x, y), n = e.enraged ? 7 : 5;
          for (let i = 0; i < n; i++) fire(G, e, 'bullet_e_44', x, y, a + (i - (n - 1) / 2) * 18 * DEG, { spd: 7, dmg: 3, h: Math.max(4, e.y - y) });
        } else if (st === 'L_hand_atk') slam(G, e, HAND_L);
        else if (st === 'R_hand_atk') slam(G, e, HAND_R);
        else if (st === 'two_hands_atk') {
          // đập hai tay: hai dải sóng + nổi giận thêm một quả pha lê lớn vào người chơi [ƯỚC LƯỢNG]
          slam(G, e, HAND_L); slam(G, e, HAND_R);
          if (e.enraged) crystal(G, e, G.player.x, G.player.y, 'big');
        }
      }
    }
  };
  SK.bossRegister('boss_dead_cell_giant', giant);
})();
