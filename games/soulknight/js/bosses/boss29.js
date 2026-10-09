// Trùm boss29: Kẻ Phá Sóng (tàu hải tặc, Đảo Đất Sét, tầng 3). Máu 2400 [ĐO RoleAttribute 2000 × 1.2].
// Dữ liệu chỉ có: MB Boss29 (shoot_cd 2, immune_to_dizzy, ImmunSting), rig 130 nút, MỘT state Animator (boss28_board_idle, ở nút
// thuyền trưởng 'img/boss28'), Boss29Skill rỗng. Nên toàn bộ đòn tự dựng bằng tick + nút con thật của rig [ƯỚC LƯỢNG], bám
// bố cục thật: 4 khẩu pháo cannon01..04 (01/02 hướng xuống, 03/04 hướng lên, mỗi khẩu 3 nòng có nút firepos), radar, emitter,
// 19 điểm nổ explodePos, đạn bullet_e_28 (nhỏ, xoay) và bullet_e_29 (to) [ĐO prefab đạn trong bullets].
// Bốn đòn: 'broadside' (loạt pháo mạn tàu), 'sonar' (sóng đạn vòng từ radar, chừa khe), 'bombard' (pháo rơi có cảnh báo), 'ram' (lao tàu).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, BUL, dmgOf, aimAt, point, fire, sfx, explode, goRef } = K;
  const IDLE = 'boss28_board_idle';
  const P = 'img/body/parts/';
  const CANNONS_UP = ['cannon03', 'cannon04'], CANNONS_DOWN = ['cannon01', 'cannon02'];   // [ĐO] firepos y>0 bắn lên, y<0 bắn xuống
  const RAD = 3 * U;   // bán kính nổ/cảnh báo 3 đơn vị (dùng prefab nổ của boss28 [ĐO cir r 3]) [ƯỚC LƯỢNG việc dùng chung]
  const HB = { size: [190, 70], off: [0, 4] };   // thân tàu 232×105 px [ĐO sprite pirateShip_Boss_0]; hộp trúng đạn [ƯỚC LƯỢNG]
  const FIRE_AT = { cannon: 'AudioClip:fx_laser_explode' };

  function barrelNodes(e, c) { return [0, 1, 2].map(k => e.nodes[P + c + '/' + k]); }
  function firepos(e, c, k) { return point(e, P + c + '/' + k + '/firepos'); }

  // ---- broadside: mạn tàu quay về phía người chơi (trên/dưới), 3 loạt cách 0.5 s; mỗi khẩu 3 nòng: nòng giữa bullet_e_29, hai nòng bên bullet_e_28
  function broadside(G, e) {
    const loops = e.enraged ? 4 : 3;   // [ƯỚC LƯỢNG]
    const up = G.player.y < e.y, set = up ? CANNONS_UP : CANNONS_DOWN;
    let n = 0;
    e.arena.objs.push({ t: 0, update(G2, o) {
      if (e.deathDone) return false;
      if (o.t < 0.6 + n * 0.5) return true;   // 0.6 s nạp đạn, rồi 0.5 s một loạt
      n++;
      e.fireT = 0.35; e.fireSet = set;
      for (const c of set) {
        for (let k = 0; k < 3; k++) {
          const [x, y] = firepos(e, c, k);
          const a0 = aimAt(G2, x, y);
          // giới hạn trong nửa trên/dưới của mạn tàu, nòng bên lệch ±10° [ƯỚC LƯỢNG]
          let a = a0 + (k === 0 ? 0 : (k === 1 ? -1 : 1) * 10 * DEG);
          if (up && Math.sin(a) > -0.25) a = a0 < -Math.PI / 2 ? -Math.PI + 0.3 : -0.3;
          if (!up && Math.sin(a) < 0.25) a = Math.cos(a0) < 0 ? Math.PI - 0.3 : 0.3;
          if (SK.vfx) SK.vfx.spawn(G2, 'effect_gun_fire_shockwave', x, y, { ang: a, scale: 0.8 });
          if (k === 0) fire(G2, e, 'bullet_e_29', x, y, a, { spd: 8, dmg: 4, h: 14 });
          else fire(G2, e, 'bullet_e_28', x, y, a, { spd: 9, dmg: 2, h: 14 });
        }
      }
      sfx(G2, FIRE_AT.cannon);
      G2.shake = Math.max(G2.shake, 2);
      if (n >= loops) { e.atkEnd = true; return false; }
      return true;
    } });
  }

  // ---- sonar: radar phát sóng, 3 vòng đạn bullet_e_28 (5 vòng khi nổi giận) cách 0.55 s, mỗi vòng chừa khe 3 viên hướng về người chơi ±40° [ƯỚC LƯỢNG]
  function sonar(G, e) {
    const rings = e.enraged ? 5 : 3, N = 24;
    let n = 0;
    e.arena.objs.push({ t: 0, update(G2, o) {
      if (e.deathDone) return false;
      if (o.t < 0.5 + n * 0.55) return true;
      n++;
      const [x, y] = point(e, P + 'radar'), a0 = aimAt(G2, x, y) + SK.randf(-40, 40) * DEG, off = SK.rand() * TAU / N;
      if (SK.vfx) SK.vfx.spawn(G2, 'effect_gun_fire_shockwave', x, y, { ang: a0, scale: 1.4 });
      for (let k = 0; k < N; k++) {
        const a = off + k * TAU / N;
        if (Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0))) < TAU / N * 1.5) continue;   // khe để lách qua
        fire(G2, e, 'bullet_e_28', x, y, a, { spd: 6, dmg: 2, h: 14 });
      }
      sfx(G2, 'AudioClip:fx_laser_explode');
      if (n >= rings) { e.atkEnd = true; return false; }
      return true;
    } });
  }

  // ---- bombard: pháo rơi xuống chỗ người chơi, cảnh báo 1.5 s [ĐO dropDuration của Boss28Skill, dùng chung ƯỚC LƯỢNG], nổ 6 sát thương bán kính 3 đơn vị
  function bombard(G, e) {
    const cnt = e.enraged ? 6 : 4;
    let n = 0;
    e.arena.objs.push({ t: 0, update(G2, o) {
      if (e.deathDone) return false;
      if (o.t < 0.5 + n * 0.45) return true;
      n++;
      const p = G2.player, [tx, ty] = K.clampRoom(e, p.x + (n > 1 ? SK.randf(-30, 30) : 0), p.y + (n > 1 ? SK.randf(-24, 24) : 0));
      const [mx, my] = point(e, P + 'dota');
      if (SK.vfx) SK.vfx.spawn(G2, 'effect_gun_fire_shockwave', mx, my, { ang: -Math.PI / 2 });
      shell(G2, e, tx, ty);
      if (n >= cnt) { e.arena.objs.push({ t: 0, dur: 1.6, update(G3, o2) { if (o2.t >= o2.dur) e.atkEnd = true; return o2.t < o2.dur; } }); return false; }
      return true;
    } });
  }
  function shell(G, e, x, y) {
    const drop = 1.5;
    e.arena.objs.push({
      t: 0, dur: drop,
      ground(ctx, G2, o) {
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
        explode(G2, x, y, 'explode_e_boss28_cannonball_hit', 'explode_big', 6);
        return false;
      }
    });
  }

  // ---- ram: căn hàng theo người chơi 0.9 s (vạch đỏ báo đường), lao ngang 220 px/s tới khi đụng tường hoặc 1.4 s; chạm thân 4 sát thương [ƯỚC LƯỢNG]
  function ram(G, e) {
    const st = { ph: 'aim', t: 0, dir: G.player.x >= e.x ? 1 : -1, hit: false };
    const len = () => Math.max(40, Math.abs(farX(G, e, st.dir) - e.x));
    e.arena.objs.push({
      t: 0, dur: 6,
      update(G2, o, dt) {
        if (e.deathDone) return false;
        st.t += dt;
        const p = G2.player;
        if (st.ph === 'aim') {
          e.face = st.dir;
          const dy = (p.y - e.y), mv = Math.min(Math.abs(dy), 110 * dt);
          SK.moveBox(G2.map, e, 0, Math.sign(dy) * mv, e.r);
          if (st.t >= 0.9) { st.ph = 'go'; st.t = 0; e.ramming = true; }
        } else {
          const hit = SK.moveBox(G2.map, e, st.dir * 220 * dt, 0, e.r);
          const dx = Math.abs(p.x - e.x), dy = Math.abs((p.y - 7) - (e.y - HB.off[1]));
          if (!st.hit && p.st !== 'dead' && dx < HB.size[0] / 2 + 4 && dy < HB.size[1] / 2 + 4) { st.hit = true; SK.hurtPlayer(G2, dmgOf(4)); }
          G2.shake = Math.max(G2.shake, 1.5);
          if (hit || st.t >= 1.4) { e.ramming = false; e.atkEnd = true; G2.shake = Math.max(G2.shake, 3); return false; }
        }
        return true;
      },
      ground(ctx, G2) {
        if (st.ph !== 'aim') return;
        const x1 = farX(G2, e, st.dir);
        ctx.save(); ctx.globalAlpha = 0.25 + 0.2 * Math.abs(Math.sin(st.t * 14)); ctx.fillStyle = '#ff2a2a';
        ctx.fillRect(Math.min(e.x, x1), e.y - HB.size[1] / 2 + 6, Math.abs(x1 - e.x), HB.size[1] - 12);
        ctx.restore();
        void len;
      }
    });
  }
  function farX(G, e, dir) {
    let x = e.x;
    while (Math.abs(x - e.x) < 600 && !SK.world.solidAt(G.map, x + dir * 8, e.y + 10)) x += dir * 8;
    return x;
  }

  const boss29 = {
    atks: ['broadside', 'sonar', 'bombard', 'ram'], idle: IDLE, run: IDLE, walk: false,
    state: { broadside: IDLE, sonar: IDLE, bombard: IDLE, ram: IDLE },
    enrageCd: 0.7, firstCd: 1.0,
    start: { broadside: broadside, sonar: sonar, bombard: bombard, ram: ram },
    tick(G, e, dt) {
      e.noFace = true;
      if (!e.hbSet) { e.hbSet = true; e.hb = { size: HB.size.slice(), off: HB.off.slice() }; e.r = 12; }
      // nòng pháo: hai nòng phụ ('0','1') chỉ lộ khi khẩu đang bắn [ĐO off mặc định trong prefab]
      if (e.fireT > 0) e.fireT -= dt;
      for (const c of CANNONS_UP.concat(CANNONS_DOWN)) {
        const on = e.fireT > 0 && e.fireSet && e.fireSet.indexOf(c) >= 0;
        for (const i of barrelNodes(e, c)) if (i != null) e.R.ov[i] = { on: i === e.nodes[P + c + '/2'] ? true : on };
      }
      // đi tuần giữa hai đòn: 40 px/s [ƯỚC LƯỢNG 0.5 × speed 5 [ĐO]]
      if (!e.atk && !e.deathDone) {
        if (!e.goal || e.goalT <= 0) { e.goal = K.roomPoint(G, e, 40, 160); e.goalT = SK.randf(1.5, 3); }
        e.goalT -= dt;
        const dx = e.goal[0] - e.x, dy = e.goal[1] - e.y, d = Math.hypot(dx, dy);
        if (d > 3) {
          const s = Math.min(d, e.speed * U * 0.5 * (e.enraged ? 1.25 : 1) * dt);
          if (SK.moveBox(G.map, e, dx / d * s, dy / d * s, e.r)) e.goalT = 0;
          if (Math.abs(dx) > 4) e.face = dx > 0 ? 1 : -1;
        } else e.goalT = Math.min(e.goalT, 0.3);
      }
    },
    dead(G, e) {
      // chìm: 19 điểm nổ explodePos/GameObject* [ĐO nút] nổ lần lượt rồi tàu biến mất
      const pts = Object.keys(e.nodes).filter(n => /^explodePos\/GameObject/.test(n));
      pts.forEach((nm, i) => {
        e.arena.objs.push({ t: 0, dur: 0.1 * i, update(G2, o) {
          if (o.t < o.dur) return true;
          const [x, y] = point(e, nm);
          if (SK.vfx) SK.vfx.spawn(G2, 'explode_hit_player', x, y, { state: i % 3 ? 'explode_small' : 'explode_big' });
          G2.shake = Math.max(G2.shake, 3);
          return false;
        } });
      });
      e.arena.objs.push({ t: 0, dur: 0.1 * pts.length + 0.5, update(G2, o) { if (o.t >= o.dur) e.hidden = true; return o.t < o.dur; } });
    }
  };
  SK.bossRegister('boss29', boss29);
  void goRef; void BUL;
})();
