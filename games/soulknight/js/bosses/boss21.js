// Trùm boss21 — Đĩa Nổi Laser (Floating Laser UFO), vùng Căn Cứ Ngoài Hành Tinh, trùm cuối ải 3-5.
// Nguồn: clip boss21_atk1..3 (InAtk01..03, EndAtk03), 7 điểm nòng img/h1/point1..7, trường BossAI21 (bullet01..03, laser_bullet*) trong data/sk-bosses86.js.
// Nhãn: [ĐO ...], [WIKI], [ƯỚC LƯỢNG]. Gán bullet01..03 cho atk1..3 theo thứ tự trường [ƯỚC LƯỢNG — mã IL2CPP chưa dịch].
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, aimAt, point } = K;
  const PTS = [1, 2, 3, 4, 5, 6, 7].map(i => 'img/h1/point' + i);

  const def = {
    atks: ['boss21_atk1', 'boss21_atk2', 'boss21_atk3'], idle: 'boss21_ide', run: 'boss21_run',
    muzzle: PTS[3], enrageCd: 0.7, contact: 2,   // chạm thân: CollisionDamage [ĐO]; 2 sát thương [ƯỚC LƯỢNG]
    ev: {
      // atk1: 7 nòng cùng bắn bullet_e_72 (RGTaskBullet tốc 10) vào người chơi, 3 loạt cách 0.35 s; 2 sát thương [ƯỚC LƯỢNG]
      InAtk01(G, e) {
        for (let v = 0; v < 3; v++) {
          e.arena.objs.push({ t: 0, dur: v * 0.35, update(G2, o) {
            if (o.t < o.dur) return true;
            if (e.deathDone) return false;
            PTS.forEach(nm => {
              const [x, y] = point(e, nm), a = aimAt(G2, x, y) + (v - 1) * 6 * DEG;
              fire(G2, e, 'bullet_e_72', x, y, a, { spd: 10, dmg: 2, h: Math.max(6, e.y - y) });
            });
            // Nổi giận: thêm đạn laser_bullet (bullet_e_25) từ col_shoot_point [ƯỚC LƯỢNG]
            if (e.enraged) { const [x, y] = point(e, 'img/h1/col_shoot_point'); fire(G2, e, 'bullet_e_25', x, y, aimAt(G2, x, y), { spd: 12, dmg: 3, h: 8 }); }
            return false;
          } });
        }
      },
      // atk2: hai tên lửa bullet_e_75 từ nòng ngoài cùng, bay theo người chơi (Bullet02: tốc 9.3, xoay 15° mỗi 0.15 s, tới 16 s) [ĐO]; 3 sát thương [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        for (const nm of [PTS[0], PTS[6]]) {
          const [x, y] = point(e, nm);
          fire(G, e, 'bullet_e_75', x, y, aimAt(G, x, y) + (nm === PTS[0] ? 1 : -1) * 40 * DEG, { dmg: 3, life: 6, h: Math.max(6, e.y - y) });
        }
      },
      // atk3 (dash_big bật): đĩa lao tới chỗ người chơi tới EndAtk03 (2.13 s), để lại cứ 0.45 s một trụ bullet_e_76 đứng yên
      // phun bullet_e_73 hướng ngẫu nhiên mỗi 0.08 s (tốc 8, 2 sát thương) [ĐO RGSBullet01]; tốc lao 10 đơn vị/s, trụ sống 1.6 s [ƯỚC LƯỢNG]
      InAtk03(G, e) {
        const a = aimAt(G, e.x, e.y);
        e.dashing = { vx: Math.cos(a) * 10 * U, vy: Math.sin(a) * 10 * U, drop: 0 };
      }
    },
    tick(G, e, dt) {
      const d = e.dashing;
      if (!d) return;
      if (e.atk !== 'boss21_atk3' || e.deathDone) { e.dashing = null; return; }
      if (SK.moveBox(G.map, e, d.vx * dt, d.vy * dt, e.r)) { e.dashing = null; return; }
      d.drop -= dt;
      if (d.drop <= 0) { d.drop = 0.45; fire(G, e, 'bullet_e_76', e.x, e.y - 8, 0, { spd: 0, dmg: 2, life: 1.6, h: 8 }); }
    }
  };
  SK.bossRegister('boss21', def);
})();
