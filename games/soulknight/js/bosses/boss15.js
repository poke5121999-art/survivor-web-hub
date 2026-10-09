// Vua U Linh (boss15) - Rừng Phù Thủy. Nhãn: [ĐO] đọc từ dữ liệu, [WIKI], [ƯỚC LƯỢNG].
(function () {
  'use strict';
  if (!window.SK || !SK.BOSS_KIT) return;
  const K = SK.BOSS_KIT, { TAU, DEG, fire, point, aimAt, spawnMinion } = K;
  const M = 'img/head';   // trùm không có tay cầm vũ khí: bắn từ đầu [ƯỚC LƯỢNG]

  function later(e, delay, fn) {
    e.arena.objs.push({ t: 0, dur: delay + 0.01, update(G, o) { if (e.deathDone) return false; if (o.t < delay) return true; fn(G); return false; } });
  }
  // Kéo dài một đòn lặp (clip loop, không có End*): gọi step mỗi `rate` giây rồi tự kết thúc đòn.
  function channel(e, state, dur, rate, step) {
    let cd = 0;
    e.arena.objs.push({ t: 0, dur, update(G, o, dt) {
      if (e.deathDone || e.atk !== state) return false;
      cd -= dt;
      if (cd <= 0) { cd = rate; step(G, o); }
      if (o.t >= o.dur) { e.atkEnd = true; return false; }
      return true;
    } });
  }

  const boss15 = {
    atks: ['atk1', 'atk2', 'atk3', 'atk4', 'atk5'], idle: 'ide', run: 'run', muzzle: M, enrageCd: 0.7,
    start: {
      // atk3 (clip lặp 0.875 s, không có sự kiện): mưa bullet_e_40 ngắm người chơi 2.4 s, nhịp 0.2 s, lệch ±20°, tốc 8, sát thương 2 [ƯỚC LƯỢNG]
      atk3(G, e) {
        channel(e, 'atk3', 2.4, e.enraged ? 0.15 : 0.2, G2 => {
          const [x, y] = point(e, M);
          fire(G2, e, 'bullet_e_40', x, y, aimAt(G2, x, y) + SK.randf(-20, 20) * DEG, { spd: 8, dmg: 2, h: e.y - y });
        });
      },
      // atk5 (clip lặp 0.2 s): gọi ma e_ghost_temp [ĐO bullet06] (dữ liệu chỉ có e_ghost), tối đa 4 con, rồi vòng bullet_e_25 [ƯỚC LƯỢNG]
      atk5(G, e) {
        channel(e, 'atk5', 0.8, 99, G2 => {
          const alive = G2.enemies.filter(m => m.bossMinion === e && m.st !== 'dead').length;
          for (let k = 0; k < 2 && alive + k < 4; k++) {
            const a = SK.rand() * TAU;
            spawnMinion(G2, e, 'e_ghost', e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 22);
          }
          const a0 = SK.rand() * TAU;
          for (let k = 0; k < 10; k++) fire(G2, e, 'bullet_e_25', e.x, e.y - 20, a0 + k * TAU / 10, { spd: 5, dmg: 2, h: 20 });
        });
      }
    },
    ev: {
      // bullet_e_28 (xoay 6°/khung [ĐO Bullet01.rotate_angle]) quạt 5 viên cách 18°, tốc 8, sát thương 3 [ƯỚC LƯỢNG]
      InAtk01(G, e) {
        const [x, y] = point(e, M), a = aimAt(G, x, y), n = e.enraged ? 7 : 5;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_28', x, y, a + (k - (n - 1) / 2) * 18 * DEG, { spd: 8, dmg: 3, h: e.y - y });
      },
      // bullet_e_44 nảy tường tối đa 3 lần [ĐO RGBTRebound]: vòng 12 viên, 0.5 s sau thêm vòng lệch nửa bước; tốc 5, sát thương 3 [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const a0 = SK.rand() * TAU, n = 12;
        const ring = off => { for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_44', e.x, e.y - 20, a0 + off + k * TAU / n, { spd: 5, dmg: 3, h: 20 }); };
        ring(0);
        later(e, 0.5, () => ring(TAU / n / 2));
      },
      // bullet_e_56: cầu năng lượng bám đuổi (RGSBulletFollow: xoay 13° mỗi 0.15 s, trễ 0.1 s) rải bullet_e_24_2 hai bên mỗi 0.2 s,
      // sống 1.75 s, tốc 9, sát thương 2; vỡ thành nổ explode_energy3 hệ số 0.5 [ĐO]; 3 cầu tốc 5, sát thương 4 [ƯỚC LƯỢNG]
      InAtk04(G, e) {
        const [x, y] = point(e, M), a = aimAt(G, x, y), n = e.enraged ? 4 : 3;
        for (let k = 0; k < n; k++) {
          const b = fire(G, e, 'bullet_e_56', x, y, a + (k - (n - 1) / 2) * 40 * DEG, { spd: 5, dmg: 4, h: e.y - y, home: { interval: 0.15, delay: 0.1, limit: 24, turn: 13 } });
          if (!b) continue;
          const homing = b.tick;
          let nx = 0.2;
          b.tick = (G2, bb, dt) => {
            if (homing) homing(G2, bb, dt);
            while (bb.age >= nx) {
              nx += 0.2;
              for (const s of [-1, 1]) fire(G2, e, 'bullet_e_24_2', bb.x, bb.y, bb.dir + s * Math.PI / 2, { spd: 9, dmg: 2, life: 1.75, h: bb.h });
            }
          };
        }
      }
    }
  };
  SK.bossRegister('boss15', boss15);
})();
