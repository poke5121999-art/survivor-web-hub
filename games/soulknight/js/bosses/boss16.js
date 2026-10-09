// Trùm boss16 (Kỵ Sĩ Không Đầu, Rừng Phù Thủy): 6 đòn atk1..atk6 theo clip + MB BossAI16.
// Nhãn: [ĐO] đọc từ dữ liệu, [WIKI], [ƯỚC LƯỢNG]. Logic từng đòn nằm trong IL2CPP nên số đếm/góc phần lớn là ước lượng.
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, point, aimAt, shortLaser, beam, beamLen, throwEgg, blast, hurtIn, clampRoom, dmgOf } = K;
  const MUZ = 'img/h1/weapon/point_1';   // [ĐO nút prefab] đầu vũ khí; horse có thêm gun_point
  const from = e => point(e, MUZ);
  const N = e => (e.enraged ? 1 : 0);

  const boss16 = {
    atks: ['boss16_atk1', 'boss16_atk2', 'boss16_atk3', 'boss16_atk4', 'boss16_atk5', 'boss16_atk6'],
    idle: 'boss16_ide', run: 'boss16_run', hand: 'img/h1', muzzle: MUZ, enrageCd: 0.65,
    ev: {
      // atk1: bullet01 = bullet_e_15 (tia ngắn RGShortLaser) [ĐO BossAI16.bullet01]; 3 sự kiện InAtk01 (0.9/1.1/1.3 s) = 3 tia
      // [ĐO clip]; quạt ±22° quanh mục tiêu, nổi giận thêm 2 tia [ƯỚC LƯỢNG]
      InAtk01(G, e, arg) {
        const [x, y] = from(e), a = aimAt(G, x, y), k = arg || 0;
        shortLaser(G, e, x, y, a + (k - 1) * 22 * DEG, 4);
        if (e.enraged) shortLaser(G, e, x, y, a + (k - 1) * 22 * DEG + (k % 2 ? 11 : -11) * DEG, 4);
      },
      // atk2: bullet02_2 = bullet_e_57 (RGSBullet01 rải bullet_e_33 mỗi 0.4 s) ở lần 1; bullet02_1 = bullet_e_33 quạt 5 viên ở lần 2
      // [ĐO BossAI16.bullet02_1/2 + RGSBullet01; thứ tự hai lần ƯỚC LƯỢNG]
      InAtk02(G, e, arg) {
        const [x, y] = from(e), a = aimAt(G, x, y), h = e.y - y;
        if (!arg) fire(G, e, 'bullet_e_57', x, y, a, { spd: 8, dmg: 3, h });
        else { const n = e.enraged ? 7 : 5; for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_33', x, y, a + (k - (n - 1) / 2) * 16 * DEG, { spd: 10, dmg: 3, h }); }
      },
      // atk3: bullet03 = bullet_e_1, hai nhịp InAtk03 (0.5/0.9 s) [ĐO]: vòng 12 viên, nhịp 2 lệch nửa bước; 14/ nổi giận 16 [ƯỚC LƯỢNG]
      InAtk03(G, e, arg) {
        const [x, y] = from(e), n = e.enraged ? 16 : 12, h = e.y - y, a0 = SK.rand() * TAU;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_1', x, y, a0 + (arg ? TAU / n / 2 : 0) + k * TAU / n, { spd: 7, dmg: 3, h });
      },
      // atk4: bullet04 = bullet_e_26 [ĐO], hai nhịp InAtk04 (0.5/1.17 s): quạt 3 viên (5 khi nổi giận) vào người chơi [ƯỚC LƯỢNG]
      InAtk04(G, e) {
        const [x, y] = from(e), a = aimAt(G, x, y), n = e.enraged ? 5 : 3;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_26', x, y, a + (k - (n - 1) / 2) * 14 * DEG, { spd: 9, dmg: 4, h: e.y - y });
      },
      // atk5: bullet05 = bullet_e_58 (BulletParabola y_speed 12, gravity 35 → ném cầu rơi) [ĐO]; nổ lúc chạm đất, 1 quả ở chỗ người chơi
      // + 2 quả (nổi giận 4) quanh đó [ƯỚC LƯỢNG]
      InAttack05(G, e) {
        const [x, y] = from(e), p = G.player, n = 1 + (e.enraged ? 3 : 2);
        for (let k = 0; k < n; k++) {
          const a = SK.rand() * TAU, d = k ? SK.randf(1.5, 3.5) * U : 0;
          const [tx, ty] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
          throwEgg(G, e, 'bullet_e_58', x, y, tx, ty, (G2, lx, ly) => blast(G2, lx, ly, 22, 4, 'explode_hit_player'));
        }
      },
      // atk6: bullet06 = bullet_e_8 (laser RGELaser, tia dài tới tường, trúng mỗi 0.2 s sau startDelay 0.4 s) [ĐO]; InAtk06 ở 0.67 s,
      // EndAttack06 ở 3 s [ĐO clip]: tia quét ±70° quanh hướng nhắm 90°/s [ƯỚC LƯỢNG]
      InAtk06(G, e) {
        const [x0, y0] = from(e), base = aimAt(G, x0, y0), dir = SK.chance(0.5) ? 1 : -1, sp = (e.enraged ? 110 : 85) * DEG;
        const st = { t: 0, a: base - dir * 60 * DEG };
        beam(G, e, 'bullet_e_8', {
          origin: () => from(e),
          ang: dt => { st.t += dt; st.a += dir * sp * dt; return st.a; },
          alive: () => e.atk === 'boss16_atk6' && !e.deathDone && st.t < 2.3,
          dmg: 4, len: 420
        });
      }
    }
  };
  void N; void beamLen; void hurtIn; void dmgOf;
  SK.bossRegister('boss16', boss16);
})();
