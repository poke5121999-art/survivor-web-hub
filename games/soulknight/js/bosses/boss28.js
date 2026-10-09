// Trùm boss28: Cướp Biển Sắt "Cấp Vua" (Đảo Đất Sét, tầng 3). AI dựng từ MB BossAI25 + Boss28Skill [ĐO] (sk-bosses86.js).
// Logic đòn nằm trong IL2CPP nên thứ tự/thời gian lấy từ trường Boss28Skill; chỗ nào không có trường thì ghi [ƯỚC LƯỢNG].
// Ba đòn: 'hook' (móc xích kéo người chơi), 'punch' (đấm cận chiến), 'cannon' (pháo rơi + quả đạn pháo phá khiên).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, BUL, dmgOf, aimAt, point, rigPlay, rigState, sfx, explode, bossProp, beamLen, goRef } = K;
  const S = (K.B86.bosses.boss28.mbs.Boss28Skill) || {}, H = S.emitHookModel || {}, C = S.fireCannonModel || {};

  // [ĐO emitHookModel] aimTime 2.5 s, emitDelay 0.8 s, hookSpeed 60, flyTime 0.4 → tầm 60×0.4 = 24 đơn vị
  const AIM = H.aimTime || 2.5, DELAY = H.emitDelay || 0.8, HOOK_SPD = (H.hookSpeed || 60) * U, RANGE = HOOK_SPD * (H.flyTime || 0.4);
  const DRAG_MIN = (H.dragPlayerMinDistance || 2) * U;           // [ĐO] kéo tới cách thân 2 đơn vị
  const MELEE = H.meleeAtkBullet || {};
  const PUNCH_DMG = MELEE.damage || 5;                           // [ĐO meleeAtkBullet.damage]
  const SHIELD_CUT = S.shieldDamageReduction != null ? S.shieldDamageReduction : 0.8;   // [ĐO] giảm 80% sát thương
  const SHIELD_OFF = S.shieldDisableDuration || 20;              // [ĐO] khiên tắt 20 s sau khi trúng nổ đạn pháo
  const BALL = (BUL.boss28_cannonball && BUL.boss28_cannonball.mbs.Boss28CannonBall) || {};
  const N_HAND = 'img/hands/right/rotate', N_THREAD = N_HAND + '/thread', N_HOOK = N_THREAD + '/hook';
  const N_MUZZLE = 'img/hands/left/cannon/gun_point', N_SHIELD = 'img/shield';
  const RAD = 3 * U;   // [ĐO cir r 3 của explode_e_boss28_cannonball_hit + boss28_FireArea.circleCastRadius 3]

  // Khiên: 80% sát thương bị hoàn lại (hook enemyHit chạy trước khi core kiểm hp <= 0).
  SK.on('enemyHit', (G, e, dmg) => {
    if (e.bossKey === 'boss28' && e.shield > 0) e.hp = Math.min(e.hpMax, e.hp + dmg * SHIELD_CUT);
  });

  // ---- hook: ngắm 2.5 s (1.7 s bám + 0.8 s khoá [ƯỚC LƯỢNG cách chia]) → bay 0.4 s → trúng thì kéo về → đấm
  function startHook(G, e) {
    const p = G.player, st = { ph: 'aim', t: 0, d: 0, a: 0 };
    e.hookOn = st; e.hooked = false;
    const tg = SK.vfx && SK.vfx.spawn(G, 'boss28_hook_target', p.x, p.y - 7, { follow: p, dy: -7, state: 'lock_target', dur: AIM });
    const iH = e.nodes[N_HAND];
    const orig = () => point(e, N_THREAD);
    const finish = () => { e.hookOn = null; e.atkEnd = true; return false; };
    e.arena.objs.push({
      t: 0, dur: 30,
      update(G2, o, dt) {
        if (e.deathDone) { e.hookOn = null; return false; }
        const fl = e.face < 0 ? -1 : 1, [ox, oy] = orig();
        st.t += dt;
        if (st.ph === 'aim') {
          if (st.t < AIM - DELAY) st.a = aimAt(G2, ox, oy);
          // [ĐO] nút rotate gốc r = -45° nên cộng 45 để góc hiệu dụng đúng bằng hướng ngắm
          e.R.ov[iH] = { r: Math.atan2(-Math.sin(st.a), fl * Math.cos(st.a)) / DEG + 45 };
          if (st.t >= AIM) { st.ph = 'fly'; st.d = 0; st.max = beamLen(G2, ox, oy, st.a, RANGE); if (tg) tg.stop(); sfx(G2, H.hookEmitAudioClip); }
          return true;
        }
        const p2 = G2.player, c = Math.cos(st.a), s = Math.sin(st.a);
        if (st.ph === 'fly') {
          const step = HOOK_SPD * dt, n = Math.max(1, Math.ceil(step / 4));
          for (let k = 0; k < n && st.ph === 'fly'; k++) {
            st.d += step / n;
            const tx = ox + c * (st.d + 9), ty = oy + s * (st.d + 9);
            // [ĐO hook.col cir r 0.7 đơn vị] + nửa thân người chơi
            if (p2.st !== 'dead' && Math.hypot(tx - p2.x, ty - (p2.y - 7)) < 0.7 * U + 6) { st.ph = 'drag'; e.hooked = true; }
            else if (st.d >= st.max) st.ph = 'back';
          }
        } else if (st.ph === 'back') {
          st.d -= HOOK_SPD * dt;
          if (st.d <= 0) return finish();
        } else if (st.ph === 'drag') {
          const dx = e.x - p2.x, dy = e.y - 4 - p2.y, dist = Math.hypot(dx, dy);
          if (dist <= DRAG_MIN + 1) return finish();
          const mv = Math.min(HOOK_SPD * dt, dist - DRAG_MIN);
          if (SK.moveBox(G2.map, p2, dx / dist * mv, dy / dist * mv, 4)) return finish();
          st.d = Math.max(4, Math.hypot(p2.x - ox, p2.y - 7 - oy) - 9);
        }
        return true;
      },
      ground(ctx, G2) {
        if (st.ph !== 'aim') return;
        // aim_boss28: vạch đỏ từ tay tới tường, nhấp nháy khi khoá [ĐO RGAim prefab texture_c7 đỏ]
        const [ox, oy] = orig(), len = beamLen(G2, ox, oy, st.a, RANGE), lock = st.t >= AIM - DELAY;
        ctx.save();
        ctx.globalAlpha = lock ? 0.35 + 0.3 * Math.abs(Math.sin(st.t * 24)) : 0.35;
        ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(st.a) * len, oy + Math.sin(st.a) * len); ctx.stroke();
        ctx.restore();
      }
    });
  }
  // Dây (boss_28_14, 7 px, gốc bên trái) kéo dài theo tầm, móc ở đầu dây; ngoài đòn móc thì ẩn.
  function hookPose(e) {
    const iT = e.nodes[N_THREAD], iK = e.nodes[N_HOOK], iH = e.nodes[N_HAND], st = e.hookOn;
    if (!st) { delete e.R.ov[iH]; }
    if (!st || st.ph === 'aim') { e.R.ov[iT] = { on: false }; e.R.ov[iK] = { on: false }; return; }
    const sx = Math.max(0.05, st.d / 7);
    e.R.ov[iT] = { on: true, sx, sy: 1 };
    e.R.ov[iK] = { on: true, x: 7 / U, sx: 1 / sx, sy: 1 };
    const fl = e.face < 0 ? -1 : 1;
    e.R.ov[iH] = { r: Math.atan2(-Math.sin(st.a), fl * Math.cos(st.a)) / DEG + 45 };
  }

  // ---- punch: sự kiện clip boss25_atk1 ở 0.1833 s sinh punch_spear: hộp x [-0.5..1.5], y ±0.5 nhân size 3 đơn vị [ĐO prefab]
  function punch(G, e) {
    // punch_spear hướng theo súng tới người chơi (useGunpointAngle 1 [ĐO]): hộp dài 4.5 đơn vị, ngang ±1.5 [ĐO prefab × size 3];
    // gộp thành khoảng cách tới điểm phát đòn ≤ 60 px [ƯỚC LƯỢNG]
    const p = G.player, [mx, my] = point(e, 'img/meleeAttackBulletPoint');
    if (Math.hypot(p.x - mx, (p.y - 7) - my) < 60) {
      SK.hurtPlayer(G, dmgOf(PUNCH_DMG));
      // repel 20 [ĐO]: hất người chơi ra xa ~30 px trong 0.15 s [ƯỚC LƯỢNG]
      const a = Math.atan2(p.y - 7 - my, p.x - mx);
      e.arena.objs.push({ t: 0, dur: 0.15, update(G2, o, dt) { SK.moveBox(G2.map, G2.player, Math.cos(a) * 200 * dt, Math.sin(a) * 200 * dt, 4); return o.t < o.dur; } });
    }
    sfx(G, H.meleeAttackAudioClip);
    G.shake = Math.max(G.shake, 2);
  }

  // ---- cannon: tay trái chĩa lên, bắn 1 phát; đạn rơi sau dropDuration 1.5 s xuống chỗ người chơi (cảnh báo bán kính 3 đơn vị)
  function startCannon(G, e) {
    e.cannonCd = C.cd || 18; e.nSince = 0;
    e.shield = 10;   // [ƯỚC LƯỢNG] bật khiên lúc nạp pháo, tự hạ sau 10 s nếu quả đạn không nổ gần trùm
    e.arena.objs.push({ t: 0, ph: 0, update(G2, ob) {
      if (e.deathDone) return false;
      if (ob.t >= 0.7) { rigPlay(e.R, 'boss25_atk2_fire'); e.atk = 'boss25_atk2_fire'; return false; }
      return true;
    } });
  }
  function fireCannon(G, e) {
    const [mx, my] = point(e, N_MUZZLE), p = G.player;
    if (SK.vfx) SK.vfx.spawn(G, 'effect_gun_fire_shockwave', mx, my, { ang: -Math.PI / 2 });
    sfx(G, C.fireClip);
    const n = e.enraged ? 2 : 1;   // [ƯỚC LƯỢNG] nổi giận bắn thêm một phát lệch ngẫu nhiên quanh người chơi
    for (let i = 0; i < n; i++) {
      const [lx, ly] = K.clampRoom(e, p.x + (i ? SK.randf(-40, 40) : 0), p.y + (i ? SK.randf(-30, 30) : 0));
      shell(G, e, lx, ly);
    }
  }
  function shell(G, e, x, y) {
    const drop = C.dropDuration || 1.5;
    e.arena.objs.push({
      t: 0, dur: drop,
      ground(ctx, G2, o) {
        // alertEfx: vòng đỏ bán kính alertSizeUnit/2 = 3 đơn vị, đặc dần khi gần rơi [ĐO alertSizeUnit 6]
        const k = Math.min(1, o.t / drop);
        ctx.save(); ctx.fillStyle = 'rgba(255,40,40,' + (0.16 + 0.2 * k) + ')'; ctx.strokeStyle = 'rgba(255,70,70,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, RAD, RAD * 0.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,90,60,0.45)';
        ctx.beginPath(); ctx.ellipse(x, y, RAD * k, RAD * k * 0.8, 0, 0, TAU); ctx.fill();
        ctx.restore();
      },
      air(ctx, G2, o) {
        const k = o.t / drop, sp = K.frameOf('boss_28_animation_0');
        if (sp) SK.draw(ctx, sp, x, y - 150 * (1 - k * k), {});
      },
      update(G2, o) {
        if (e.deathDone) return false;
        if (o.t < o.dur) return true;
        explode(G2, x, y, goRef(C.hitExplode) || 'explode_e_boss28_cannonball_hit', 'explode_big', 6);   // [ĐO Explode.damage 6]
        firePool(G2, e, x, y);
        ball(G2, e, x, y);
        return false;
      }
    });
  }
  // boss28_FireArea: BulletFire damage 1 mỗi hitInterval 0.5 s trong bán kính 3 đơn vị [ĐO]; sống 5 s [ƯỚC LƯỢNG theo particle life]
  function firePool(G, e, x, y) {
    const F = (BUL.boss28_FireArea && BUL.boss28_FireArea.mbs.BulletFire) || {}, dur = 5;
    const h = SK.vfx && SK.vfx.spawn(G, 'boss28_FireArea', x, y, { state: 'gas_start', dur });
    let tk = 0;
    e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
      tk -= dt;
      const p = G2.player;
      if (tk <= 0 && Math.hypot(p.x - x, (p.y - 4 - y) / 0.8) < RAD) { tk = F.hitInterval || 0.5; SK.hurtPlayer(G2, dmgOf(F.damage || 1)); }
      if (e.deathDone || o.t >= o.dur) { if (h) h.stop(); return false; }
      return true;
    } });
  }
  // boss28_cannonball: 4 máu, nổ sau explodeCountdown 6 s hoặc khi bị bắn; nổ to hit_enemy 20 sát thương, không đụng người chơi [ĐO].
  // Bò về phía trùm 24 px/s [ƯỚC LƯỢNG] cho tới lockDistance 1.5 đơn vị [ĐO trường] thì nổ.
  function ball(G, e, x, y) {
    const rig = BUL.boss28_cannonball && BUL.boss28_cannonball.rig;
    if (!rig) return;
    bossProp(G, e, null, x, y, {
      rig, hp: BALL.hp || 4, life: BALL.explodeCountdown || 6, hb: { size: [14, 14], off: [0, 7] },
      tick(G2, pr, dt) {
        const dx = e.x - pr.x, dy = e.y - 6 - pr.y, d = Math.hypot(dx, dy);
        if (d <= (BALL.lockDistance || 1.5) * U) { pr.hp = 0; pr.st = 'dead'; return; }
        SK.moveBox(G2.map, pr, dx / d * 24 * dt, dy / d * 24 * dt, 3);
      },
      onEnd(G2, pr) {
        if (SK.vfx) SK.vfx.spawn(G2, goRef(BALL.bigExplosion) || 'explode_e_boss28_cannonball_big', pr.x, pr.y - 4, { state: 'explode_big' });
        sfx(G2, 'AudioClip:fx_explode_big');
        G2.shake = Math.max(G2.shake, 4);
        if (e.deathDone) return;
        if (Math.hypot(e.x - pr.x, (e.y - 14) - (pr.y - 4)) < RAD + 8) {
          e.shield = 0; e.shieldCd = SHIELD_OFF;
          SK.hurtEnemy(G2, e, 20, false, 0, 0);    // [ĐO Explode.damage 20, hit_enemy 1]
        }
      }
    });
  }

  const boss28 = {
    atks: ['hook', 'punch', 'cannon'], idle: 'ide', run: 'run',
    state: { hook: 'ide', punch: 'boss25_atk1', cannon: 'boss25_atk2' },
    enrageCd: 0.7, firstCd: 1.2,
    pick(G, e) {
      // Boss28Skill: pháo có cd 18 s và minAttackCount 5, trọng số 0 nên chỉ chen vào khi đủ điều kiện [ĐO]
      if ((e.cannonCd || 0) <= 0 && (e.nSince || 0) >= (C.minAttackCount || 5) && !(e.shieldCd > 0)) return ['cannon'];
      const p = G.player;
      // [ƯỚC LƯỢNG] đấm chỉ khi người chơi trong tầm gần; móc có trọng số 1 [ĐO normalWeight/angryWeight 1]
      return Math.hypot(p.x - e.x, p.y - e.y) < 64 ? ['punch', 'hook'] : ['hook'];
    },
    start: {
      hook: (G, e) => { e.nSince = (e.nSince || 0) + 1; startHook(G, e); },
      punch: (G, e) => { e.nSince = (e.nSince || 0) + 1; },
      cannon: (G, e) => startCannon(G, e)
    },
    // Móc trúng thì kéo về rồi đấm ngay (meleeAttackDistance 1.2) [ĐO; nối đòn ƯỚC LƯỢNG]. Khoá 'ide' vì móc dùng state ide.
    after: { ide: (G, e) => { const h = e.hooked; e.hooked = false; return h ? 'punch' : null; } },
    ev: {
      Boss28Skill_OnSkillAnimEvent(G, e, arg, st) {
        if (st === 'boss25_atk1' && arg == null) punch(G, e);
        else if (st === 'boss25_atk2_fire' && arg === 1) fireCannon(G, e);
      }
    },
    tick(G, e, dt) {
      e.cannonCd = (e.cannonCd == null ? 12 : e.cannonCd) - dt;   // [ƯỚC LƯỢNG] phát pháo đầu sau 12 s; sau đó cd 18 s [ĐO]
      if (e.shieldCd > 0) e.shieldCd -= dt;
      if (e.shield > 0) { e.shield -= dt; if (e.shield <= 0) e.shield = 0; }
      e.R.ov[e.nodes[N_SHIELD]] = { on: e.shield > 0 };
      hookPose(e);
      if (!e.atk && !e.deathDone) {
        // pháo kết thúc ở state boss25_atk2 (clip 0.067 s lặp): về tư thế đứng/chạy
        const s = rigState(e.R);
        if (s !== 'ide' && s !== 'run') rigPlay(e.R, e.moving ? 'run' : 'ide');
      }
    },
    dead(G, e) {
      e.shield = 0; e.hookOn = null;
      for (const k of [N_HAND, N_THREAD, N_HOOK, N_SHIELD]) delete e.R.ov[e.nodes[k]];
    }
  };
  SK.bossRegister('boss28', boss28);
})();
