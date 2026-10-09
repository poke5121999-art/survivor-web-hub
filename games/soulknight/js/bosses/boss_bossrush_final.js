// Trùm boss_bossrush_final: Tước Sĩ Đỏ (Sir Sangria), trận cuối Khu Thí Luyện. AI dựng từ MB BossAI25 + BossRushFinal_Skill [ĐO] (sk-bosses86.js).
// Logic đòn nằm trong IL2CPP: thứ tự/thời gian lấy từ trường BossRushFinal_Skill và clip; chỗ nào không có trường ghi [ƯỚC LƯỢNG].
// Năm đòn: skill1 tia ngắm khoá, skill2 tia quét 240°, skill3 tia quét + vòng đạn, skill4 chém cận chiến, skill5 cầu ma thuật quay quanh người chơi.
// Bỏ qua: skillSummon (gọi e_bossrush_minion_a..d, không có trong SK_DATA.enemies; strengthenFactor 0.07 chỉ áp cho lính gọi).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { DEG, TAU, U, dmgOf, aimAt, point, fire, beamLen, rigPlay, rigState, frameOf, sfx } = K;
  const PID = 'boss_bossrush_final';
  const S = (K.B86.bosses[PID].mbs.BossRushFinal_Skill) || {};
  const S1 = S.skill1Data || {}, S2 = S.skill2Data || {}, S3 = S.skill3Data || {}, S3B = S.skill3bData || {}, S4 = S.skill4Data || {}, S5 = S.skill5Data || {};
  const N_HAND = 'img/hands/hand_grip', N_MUZ = 'img/hands/hand_grip/emitPos';
  const INTERVALS = S.useSkillInterval || [2, 1.5, 1, 0.5];   // [ĐO] chia theo 4 mốc máu [ƯỚC LƯỢNG]
  const cfg = c => (c && c.bulletConfig) || c || {};
  // LineDamageCarrier.width 0.5 đơn vị × size của bulletConfig [ĐO]; nửa bề rộng tính bằng px
  const hwOf = c => 0.5 * (c.size || 1) * U / 2;

  const orig = e => point(e, N_MUZ);
  function handTo(e, a) {
    const i = e.nodes[N_HAND];
    if (i != null) e.R.ov[i] = { r: Math.atan2(-Math.sin(a), (e.face < 0 ? -1 : 1) * Math.cos(a)) / DEG };
  }

  // Tia LineDamageCarrier: vạch cảnh báo mảnh (prefab alert sy 0.12) → tia dài tới tường, trúng mỗi damageInterval 0.5 s [ĐO]
  // s: {a() rad, hw px, dmg, warn s, dur s (có thể Infinity), live()}
  function line(G, e, s) {
    let hitT = 0;
    e.arena.objs.push({
      t: 0, ox: 0, oy: 0, a: 0, len: 0,
      update(G2, o, dt) {
        if (!s.live()) return false;
        [o.ox, o.oy] = orig(e);
        o.a = s.a(o.t);
        o.len = beamLen(G2, o.ox, o.oy, o.a, 520);
        if (o.t < s.warn) return true;
        if (o.t - dt < s.warn) sfx(G2, 'AudioClip:fx_laser_bullet');
        hitT -= dt;
        const p = G2.player;
        if (hitT <= 0 && p.st !== 'dead') {
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
          ctx.fillStyle = 'rgba(255,40,40,' + flash + ')';
          ctx.fillRect(0, -1, o.len, 2);
        } else {
          const fade = Math.min(1, (s.warn + s.dur - o.t) / 0.1);
          ctx.globalAlpha = Math.max(0, fade);
          ctx.fillStyle = 'rgba(255,60,60,0.5)'; ctx.fillRect(0, -s.hw, o.len, s.hw * 2);
          ctx.fillStyle = 'rgba(255,235,235,0.95)'; ctx.fillRect(0, -Math.max(1.5, s.hw * 0.45), o.len, Math.max(3, s.hw * 0.9));
        }
        ctx.restore();
        if (o.t >= s.warn) {
          const sp = frameOf('bullet_37');
          if (sp) SK.draw(ctx, sp, o.ox, o.oy, { sx: 1.2, sy: 1.2, alpha: 0.9 });
        }
      }
    });
  }

  // Một đòn = một vật sàn đấu chạy tới khi trả false; e.skill là thẻ để đòn bị huỷ (nổi giận/chết) thì mọi tia/viên dừng theo.
  function begin(G, e, fn) {
    const tok = e.skill = {};
    const live = () => e.skill === tok && !e.deathDone;
    const fin = () => { if (e.skill === tok) { e.skill = null; e.atkEnd = true; } };
    e.arena.objs.push({ t: 0, update(G2, o, dt) {
      if (!live()) return false;
      if (fn(G2, o, dt, live) === false) { fin(); return false; }
      return true;
    } });
    return live;
  }

  // ---- skill1: nhắm bám người chơi aimDuration 1 s, khoá emitDelay 0.5 s rồi bắn tia; nổi giận bắn 2 lần liên tiếp [ĐO 1 s/0.5 s; số lần ƯỚC LƯỢNG]
  function skill1(G, e) {
    const b = cfg(S1), shots = e.enraged ? 2 : 1, aim = S1.aimDuration || 1, lockT = S1.emitDelay || 0.5, dur = 0.15;
    let n = 0, a = aimAt(G, ...orig(e)), lineT = 0;
    const spawn = live => {
      line(G, e, { live, hw: hwOf(b), dmg: b.damage || 5, warn: aim + lockT, dur, a(t) { if (t < aim) a = aimAt(G, ...orig(e)); handTo(e, a); return a; } });
    };
    let live;
    live = begin(G, e, (G2, o, dt) => {
      if (n === 0 && lineT === 0 && o.t >= 0) { spawn(live); lineT = 1; }
      const cycle = aim + lockT + dur + 0.35;
      const k = Math.floor(o.t / cycle);
      if (k > n && k < shots) { n = k; spawn(live); }
      if (o.t >= shots * cycle) { rigPlay(e.R, 'atk1_end'); return false; }
      return true;
    });
  }

  // ---- skill2: tia beam_wipe size 5 quét rotateAngle 240°, tốc đầu 25°/s tăng ×1.12 mỗi giây [ĐO rotateAngle/rotateSpeed; cách hiểu ƯỚC LƯỢNG]
  function wipe(G, e, c, extra) {
    const b = c.beamWipeConfig || c.bulletConfig || {}, total = (c.rotateAngle || 240) * DEG, v0 = (c.rotateSpeed || 25) * DEG, acc = c.rotateSpeedAccelerate || 1.12;
    const dir = SK.chance(0.5) ? 1 : -1, warn = 0.6;
    const a0 = aimAt(G, ...orig(e)) - dir * total / 2;
    let rot = 0, a = a0;
    const live = begin(G, e, (G2, o, dt, lv) => {
      if (o.t >= warn) {
        const t = o.t - warn;
        rot += v0 * Math.pow(acc, t) * dt;
        a = a0 + dir * Math.min(rot, total);
        if (extra) extra(G2, o, t - dt, t, lv);
        if (rot >= total) return false;
      }
      handTo(e, a);
      return true;
    });
    line(G, e, { live, hw: hwOf(b), dmg: b.damage || 5, warn, dur: 1e9, a: () => a });
  }
  function skill2(G, e) { wipe(G, e, S2); }

  // ---- skill3: tia quét + vòng emitCount viên mỗi emitInterval, viên đầu sau emitDelay [ĐO]; nổi giận dùng skill3b (bullet_e_45, tăng tốc 1.15) [ƯỚC LƯỢNG: 3b = nổi giận]
  function skill3(G, e) {
    const c = e.enraged ? S3B : S3, bc = c.barrageConfig || {};
    const name = String(bc.bulletProto || 'bullet_e_1').replace(/^GameObject:/, ''), n = c.emitCount || 12, every = c.emitInterval || 1, d0 = c.emitDelay || 0.25;
    let next = 0.6 + d0;
    wipe(G, e, c, (G2, o, t0, t, lv) => {
      const abs = t + 0.6;
      if (abs < next) return;
      next += every;
      const [x, y] = point(e, 'img/body/bodycenter'), a0 = SK.rand() * TAU;
      for (let i = 0; i < n; i++) fire(G2, e, name, x, y, a0 + i * TAU / n, { spd: bc.speed || 16, dmg: bc.damage || 3, h: 12 });
    });
  }

  // ---- skill4: chém cận chiến sword_0 khi người chơi trong minDistance 3 đơn vị, repel 40, sát thương 2 [ĐO]; thời điểm chém theo clip atk2 (0.25 s) [ƯỚC LƯỢNG]
  function skill4(G, e) {
    const b = cfg(S4), reach = (S4.minDistance || 3) * U + 14;
    begin(G, e, (G2, o) => {
      if (!o.hit && o.t >= 0.25) {
        o.hit = 1;
        const p = G2.player;
        if (p.st !== 'dead' && Math.hypot(p.x - e.x, (p.y - 7) - (e.y - 14)) < reach) {
          SK.hurtPlayer(G2, dmgOf(b.damage || 2));
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          e.arena.objs.push({ t: 0, update(G3, ob, dt) { SK.moveBox(G3.map, G3.player, Math.cos(a) * 300 * dt, Math.sin(a) * 300 * dt, 4); return ob.t < 0.15; } });
        }
        G2.shake = Math.max(G2.shake, 3);
      }
      return o.t < 0.8;
    });
  }

  // ---- skill5: magicStarPrefab bay tới quỹ đạo bán kính followOrbitRadius 5 quanh người chơi, quay 75°/s trong followDuration 4 s,
  // cứ emitInterval 0.1 s bắn một viên tốc 6 sát thương 2 về người chơi [ĐO]; vẽ viên bằng đạn bullet_e_1 thay shortBeamPrefab [ƯỚC LƯỢNG]
  function skill5(G, e) {
    const b = cfg(S5), R = (S5.followOrbitRadius || 5) * U, w = (S5.followAngleSpeed || 75) * DEG, dur = S5.followDuration || 4, gap = S5.emitInterval || 0.1;
    const orb = { x: e.x, y: e.y - 20 };
    let ang = Math.atan2(orb.y - G.player.y, orb.x - G.player.x), cd = 0.3;
    e.arena.objs.push({
      t: 0, update(G2, o, dt) {
        if (e.deathDone) return false;
        const p = G2.player, live = e.skill && e.atk;
        if (!live && o.t < dur + 0.5) o.t = dur + 0.5;
        ang += w * dt * (o.dir || (o.dir = SK.chance(0.5) ? 1 : -1));
        const tx = p.x + Math.cos(ang) * R, ty = p.y - 7 + Math.sin(ang) * R * 0.8, k = Math.min(1, dt * 5);
        const [cx, cy] = K.clampRoom(e, tx, ty);
        orb.x += (cx - orb.x) * k; orb.y += (cy - orb.y) * k;
        if (o.t < dur) {
          cd -= dt;
          if (cd <= 0 && o.t > 0.4) { cd += gap; fire(G2, e, 'bullet_e_1', orb.x, orb.y, aimAt(G2, orb.x, orb.y), { spd: b.speed || 6, dmg: b.damage || 2, h: 8, life: 4 }); }
        }
        return o.t < dur + 0.4;
      },
      air(ctx, G2, o) {
        const sp = frameOf('bullet_37');
        if (!sp) return;
        const k = Math.min(1, o.t / 0.3, Math.max(0, (dur + 0.4 - o.t) / 0.3));
        SK.draw(ctx, sp, orb.x, orb.y, { sx: 1.5 + 0.3 * Math.sin(o.t * 14), sy: 1.5 + 0.3 * Math.sin(o.t * 14), alpha: k });
      }
    });
    begin(G, e, (G2, o) => {
      if (o.t >= dur + 0.5) { rigPlay(e.R, 'idle'); return false; }
      return true;
    });
  }

  const def = {
    atks: ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'],
    state: { skill1: 'atk1', skill2: 'atk2', skill3: 'atk3', skill4: 'atk2', skill5: 'atk3' },   // atk1..3 + summon là các clip có thật; ghép đòn-clip [ƯỚC LƯỢNG]
    idle: 'idle', run: 'run', hand: N_HAND, muzzle: N_MUZ, aimDuring: ['skill1'], enrageCd: 1,
    skipNode: n => /^(magicStarPrefab|shortBeamPrefab)/.test(n.n),
    start: { skill1: skill1, skill2: skill2, skill3: skill3, skill4: skill4, skill5: skill5 },
    pick(G, e) {
      const p = G.player, near = Math.hypot(p.x - e.x, p.y - e.y) < (S4.minDistance || 3) * U + 12;
      if (near && SK.chance(0.6)) return ['skill4'];
      const l = ['skill1', 'skill2', 'skill5'];
      if (e.hp < e.hpMax * 0.8) l.push('skill3');
      return l;
    },
    tick(G, e) {
      if (e.deathDone) return;
      if (!e.aiOwn) { e.ai = Object.assign({}, e.ai); e.aiOwn = true; }
      // useSkillInterval [2, 1.5, 1, 0.5] [ĐO]: mốc máu 75/50/25% [ƯỚC LƯỢNG]
      const tier = Math.min(INTERVALS.length - 1, Math.floor((1 - e.hp / e.hpMax) * INTERVALS.length));
      e.ai.shoot_cd = INTERVALS[Math.max(0, tier)];
      if (e.skill && e.atk) e.atk = rigState(e.R);
    },
    enrage(G, e) { if (e.skill) { e.skill = null; e.atkEnd = true; } }
  };
  SK.bossRegister(PID, def);
})();
