// Trùm boss23 — Vua Khỉ Mặt Vàng (1-5 Di Tích). Máu 530 × 1.2, tốc 7 [ĐO BossAI23/RoleAttribute].
// Bốn đòn khớp bốn clip: atk1/atk3 chạy ở Animator phụ (lặp, sự kiện mỗi vòng), atk2/atk4 ở Animator chính.
// Đạn [ĐO MB]: bullet_e_23 (Bullet01 tốc 10), bullet_e_83 (BulletParabola gravity 35, y_speed 12), bullet_e_84 (RGBTDivision 6 viên
// bullet_e_1 lệch 30°, tốc 10, atk 2), e_fireball_shit (DelayExplode 1 s → Curse: bán kính 3, 1 sát thương/0.5 s, 5 s).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { U, DEG, TAU, aimAt, fire, point, explode, throwEgg, clampRoom, sfx } = K;

  const P1 = ['img/h1/weapon/point_1', 'img/h1/weapon/point_2', 'img/h1/weapon/point_3'];
  const PG = ['img/h2/weapon/grenade1/point1', 'img/h2/weapon/grenade2/point2', 'img/h2/weapon/grenade3/point3'];
  const P3 = 'img/h3/weapon/point_1';
  const P4 = 'img/h4/weapon/point_1';

  // Dừng Animator phụ (atk1/atk3 lặp mãi vì `next` trỏ tới state không có).
  function stopSub(e, name) {
    for (const a of e.R.anims) for (const ly of a.layers) if (ly.L.states[name] && ly.st === name) ly.st = null;
  }
  // Giữ đòn kéo dài `dur` giây rồi kết thúc (e.atkEnd), tắt Animator phụ `sub`.
  function hold(G, e, sub, dur) {
    K.rigPlay(e.R, sub);
    e.arena.objs.push({ t: 0, dur, update(G2, o) {
      if (e.deathDone) { stopSub(e, sub); return false; }
      if (o.t < o.dur) return true;
      stopSub(e, sub); e.atkEnd = true;
      return false;
    } });
  }

  const boss23 = {
    atks: ['atk1', 'atk2', 'atk3', 'atk4'], idle: 'boss23_ide', run: 'boss23_run', enrageCd: 0.7,
    // atk1/atk3 không có clip ở Animator chính: giữ state ide, đòn tự kết thúc bằng hold()
    state: { atk1: 'boss23_ide', atk2: 'boss23_atk2', atk3: 'boss23_ide', atk4: 'boss23_atk4' },
    start: {
      // atk1 súng máy: clip boss23_atk1 dài 0.2 s lặp, InAtk01 ở 0.067 s mỗi vòng [ĐO] → 5 phát/giây; kéo dài 1.6 s, nổi giận 2.2 s [ƯỚC LƯỢNG]
      atk1(G, e) { e.shot = 0; hold(G, e, 'boss23_atk1', e.enraged ? 2.2 : 1.6); },
      // atk3 súng đạn nổ: clip boss23_atk3 dài 0.533 s lặp, InAtk03 ở 0.133 s [ĐO] → 3 lượt trong 1.6 s [ƯỚC LƯỢNG]
      atk3(G, e) { hold(G, e, 'boss23_atk3', 1.6); }
    },
    ev: {
      // bullet_e_23 từ ba nòng h1 luân phiên, nhắm người chơi lệch ±5° [ƯỚC LƯỢNG]; 2 sát thương [ƯỚC LƯỢNG]
      InAtk01(G, e, arg, st) {
        if (st !== 'boss23_atk1') return;
        const [x, y] = point(e, P1[e.shot++ % 3]);
        fire(G, e, 'bullet_e_23', x, y, aimAt(G, x, y) + SK.randf(-5, 5) * DEG, { spd: 10, dmg: 2, h: e.y - y });
        if (e.enraged) fire(G, e, 'bullet_e_23', x, y, aimAt(G, x, y) + SK.randf(-18, 18) * DEG, { spd: 10, dmg: 2, h: e.y - y });
      },
      // lựu đạn bullet_e_83 (parabola 0.69 s [ĐO]) từ ba ống h2, rơi quanh người chơi rồi nổ nhỏ 3 sát thương [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const p = G.player;
        PG.forEach((pn, i) => {
          const [x0, y0] = point(e, pn);
          const a = SK.rand() * TAU, d = i ? SK.randf(1.5, 3.5) * U : 0;
          const [x1, y1] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
          throwEgg(G, e, 'bullet_e_83', x0, y0, x1, y1, (G2, x, y) => explode(G2, x, y, 'explode_hit_player', 'explode_small', 3));
        });
      },
      // bullet_e_84 vỡ thành 6 viên bullet_e_1 khi chạm [ĐO RGBTDivision]; nổi giận thêm hai viên lệch 20° [ƯỚC LƯỢNG]
      InAtk03(G, e, arg, st) {
        if (st !== 'boss23_atk3') return;
        const [x, y] = point(e, P3), a = aimAt(G, x, y);
        const n = e.enraged ? [-20, 0, 20] : [0];
        for (const d of n) fire(G, e, 'bullet_e_84', x, y, a + d * DEG, { spd: 8, dmg: 2, h: e.y - y });
      },
      // e_fireball_shit: 3 quả rơi quanh người chơi (nổi giận 5) sau 1 s [ĐO DelayExplode.boom_time], để lại Curse 5 s [ĐO BulletCurse]
      InAtk04(G, e) {
        const n = e.enraged ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const p = G.player, a = SK.rand() * TAU, d = i ? SK.randf(1.5, 4) * U : 0;
          const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
          curse(G, e, x, y);
        }
        void P4;
      }
    }
  };
  function curse(G, e, x, y) {
    const h = SK.vfx && SK.vfx.spawn(G, 'e_fireball_shit', x, y, {});
    const cs = (K.BUL.Curse && K.BUL.Curse.mbs.BulletCurse) || {}, rad = (cs.damage_radius || 3) * U, dur = cs.duration || 5;
    let ph = 0, tickT = 0, pool = null;
    e.arena.objs.push({ t: 0, dur: 1 + dur, update(G2, o, dt) {
      if (e.deathDone) { if (pool) pool.stop(); return false; }
      if (!ph) {
        if (o.t < 1) return true;
        ph = 1;
        if (h) h.kill();
        pool = SK.vfx && SK.vfx.spawn(G2, 'Curse', x, y - 4, { state: 'gas_start', dur });
        sfx(G2, 'AudioClip:fx_fireball');
      }
      tickT -= dt;
      const p = G2.player;
      if (tickT <= 0 && Math.hypot(p.x - x, p.y - y + 4) < rad) { tickT = cs.hit_invert || 0.5; SK.hurtPlayer(G2, cs.damage || 1); }
      if (o.t >= o.dur) { if (pool) pool.stop(); return false; }
      return true;
    } });
  }
  SK.bossRegister('boss23', boss23);
})();
