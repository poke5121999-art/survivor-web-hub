// C6H8O6 (boss04) - Lâu Đài Dưới Đất. Nhãn: [ĐO] đọc từ dữ liệu, [WIKI], [ƯỚC LƯỢNG].
(function () {
  'use strict';
  if (!window.SK || !SK.BOSS_KIT) return;
  const K = SK.BOSS_KIT, { DEG, fire, point, aimAt, beam, explode, frameOf } = K;
  const M1 = 'img/h1/weapon/point_1', M2 = 'img/h2/weapon/point_1';   // [ĐO rig] hai nòng

  function later(e, delay, fn) {
    e.arena.objs.push({ t: 0, dur: delay + 0.01, update(G, o) { if (e.deathDone) return false; if (o.t < delay) return true; fn(G); return false; } });
  }
  // Clip lặp (atk2/3/4) không có End*: tự kết thúc đòn sau `dur` giây, gọi step(G, k) mỗi `rate` giây.
  function channel(e, state, dur, rate, step) {
    let cd = 0, k = 0;
    e.arena.objs.push({ t: 0, dur, update(G, o, dt) {
      if (e.deathDone || e.atk !== state) return false;
      cd -= dt;
      if (cd <= 0) { cd = rate; step(G, k++); }
      if (o.t >= o.dur) { e.atkEnd = true; return false; }
      return true;
    } });
  }
  function laser(G, e, node, from, to) {
    // bullet_e_8 (RGELaser, trúng mỗi 0.2 s sau trễ 0.4 s [ĐO]); bám người chơi, quay tối đa 50°/giây [ƯỚC LƯỢNG]; 3 sát thương [ƯỚC LƯỢNG]
    let a = null, t = 0;
    const live = () => !e.deathDone && t < to - from;
    beam(G, e, 'bullet_e_8', {
      dmg: 3, alive: () => { return live(); },
      origin: () => point(e, node),
      ang(dt) {
        t += dt;
        const [x, y] = point(e, node), want = aimAt(G, x, y);
        if (a == null) { a = want; return a; }
        const d = Math.atan2(Math.sin(want - a), Math.cos(want - a)), m = 50 * DEG * dt;
        a += Math.max(-m, Math.min(m, d));
        return a;
      }
    });
  }

  const boss04 = {
    atks: ['boss04_atk1', 'boss04_atk2', 'boss04_atk3', 'boss04_atk4', 'boss04_atk5'], idle: 'boss04_ide', run: 'boss04_run', muzzle: M1, enrageCd: 0.7,
    enrage(G, e) {
      // angry_body = boss04_1, angry_hand = boss04_4 [ĐO BossAI04]
      const ai = e.ai, f = n => frameOf((n || '').replace(/^Sprite:/, ''));
      const b = e.nodes['img/body'], h1 = e.nodes['img/h1/weapon'], h2 = e.nodes['img/h2/weapon'];
      if (b != null && f(ai.angry_body)) e.R.ov[b] = { f: (ai.angry_body || '').replace(/^Sprite:/, '') };
      if (h1 != null && f(ai.angry_hand)) e.R.ov[h1] = { f: (ai.angry_hand || '').replace(/^Sprite:/, '') };
      if (h2 != null && f(ai.angry_hand)) e.R.ov[h2] = { f: (ai.angry_hand || '').replace(/^Sprite:/, '') };
    },
    start: {
      // atk1 (1.67 s, chỉ có EndAtk01 lúc 1.0 s): bullet_e_13 ngắm thẳng, vỡ khi chạm thành 3 viên bullet_e_7 lệch 60° [ĐO RGBTDivision]; sát thương 3 [ĐO atk]
      boss04_atk1(G, e) {
        const shoot = node => G2 => { const [x, y] = point(e, node); fire(G2, e, 'bullet_e_13', x, y, aimAt(G2, x, y), { spd: 7, dmg: 3, h: e.y - y }); };
        later(e, 0.4, shoot(M1));
        later(e, 0.7, shoot(M2));
        if (e.enraged) later(e, 1.0, shoot(M1));
      },
      // atk2 (clip lặp 1 s): dòng bullet_e_1 từ hai tay luân phiên 2.5 s, nhịp 0.12 s, lệch ±8°, tốc 9, sát thương 2 [ƯỚC LƯỢNG]
      boss04_atk2(G, e) {
        channel(e, 'boss04_atk2', 2.5, e.enraged ? 0.09 : 0.12, (G2, k) => {
          const [x, y] = point(e, k % 2 ? M1 : M2);
          fire(G2, e, 'bullet_e_1', x, y, aimAt(G2, x, y) + SK.randf(-8, 8) * DEG, { spd: 9, dmg: 2, h: e.y - y });
        });
      },
      // atk3 (clip lặp 0.73 s): mỗi vòng tay trái InAtk03H2 rồi tay phải InAtk03H1 bắn bullet_e_3 (xoay 6°/khung [ĐO]); lặp 3 s [ƯỚC LƯỢNG]
      boss04_atk3(G, e) { channel(e, 'boss04_atk3', 3, 99, () => {}); },
      // atk4 (clip lặp 0.5 s): mỗi vòng một quả nổ explode_hit_player rơi xuống chỗ người chơi sau 0.6 s [ĐO bullet04]; 6 sát thương [ĐO Explode.damage]
      boss04_atk4(G, e) { channel(e, 'boss04_atk4', 3, 99, () => {}); },
      // atk5 (3 s): tay trái bắn laser bullet_e_8 từ 0.33 s tới 1.58 s, tay phải từ 1.17 s tới 2.42 s [ĐO clip InAtk05H2/EndAtk05H2/InAtk05H1/EndAtk05H1]
      boss04_atk5() {}
    },
    ev: {
      InAtk03H2(G, e) { const [x, y] = point(e, M2); fire(G, e, 'bullet_e_3', x, y, aimAt(G, x, y), { spd: 8, dmg: 3, h: e.y - y }); },
      InAtk03H1(G, e) { const [x, y] = point(e, M1); fire(G, e, 'bullet_e_3', x, y, aimAt(G, x, y), { spd: 8, dmg: 3, h: e.y - y }); },
      InAtk04(G, e) {
        const p = G.player, x = p.x, y = p.y - 2;
        if (e.atk !== 'boss04_atk4') return;
        later(e, 0.6, G2 => explode(G2, x, y, 'explode_hit_player', 'explode_big', 6));
      },
      InAtk05H2(G, e) { laser(G, e, M2, 0.33, 1.58); },
      InAtk05H1(G, e) { laser(G, e, M1, 1.17, 2.42); }
    }
  };
  SK.bossRegister('boss04', boss04);
})();
