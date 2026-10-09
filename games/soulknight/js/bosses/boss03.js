// Vua Xương (boss03) - Lâu Đài Dưới Đất. Nhãn: [ĐO] đọc từ dữ liệu, [WIKI], [ƯỚC LƯỢNG].
(function () {
  'use strict';
  if (!window.SK || !SK.BOSS_KIT) return;
  const K = SK.BOSS_KIT, { TAU, DEG, U, fire, point, aimAt, spawnMinion, BUL } = K;
  const M = 'img/h1/weapon/point_1';   // [ĐO rig] nòng tay phải

  const boss03 = {
    atks: ['boss03_atk1', 'boss03_atk2', 'boss03_atk3', 'boss03_atk4', 'boss03_atk5'],
    idle: 'boss03_ide', run: 'boss03_run', hand: 'img/h1', muzzle: M,
    aimDuring: ['boss03_atk1', 'boss03_atk3'], enrageCd: 0.7,
    ev: {
      // Vung gậy hai nhịp (InAtk01 lúc 0.47 s và 0.63 s [ĐO clip]): quạt đạn xương bullet_e_1;
      // nhịp đầu 5 viên, nhịp hai 7 viên lệch nửa bước; góc 15°, tốc 8, sát thương 3 [ƯỚC LƯỢNG]
      InAtk01(G, e, arg) {
        const [x, y] = point(e, M), a = aimAt(G, x, y);
        const n = (arg ? 7 : 5) + (e.enraged ? 2 : 0);
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_1', x, y, a + (k - (n - 1) / 2) * 15 * DEG, { spd: 8, dmg: 3, h: e.y - y });
      },
      // Mắt đỏ mở 1.13 s rồi bắn vòng bullet_e_14 (OpenRedEye..CloseRedEye [ĐO clip]); 16 viên, tốc 6, sát thương 3 [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const a0 = SK.rand() * TAU, n = e.enraged ? 20 : 16;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_14', e.x, e.y - 18, a0 + k * TAU / n, { spd: 6, dmg: 3, h: 18 });
      },
      // Xương bám đuổi bullet_boss_03_atk3: Bullet02 xoay 15° mỗi 0.1 s, bám tới 24 s [ĐO]; 3 viên (nổi giận 5), tốc 5, sát thương 3 [ƯỚC LƯỢNG]
      InAtk03(G, e) {
        const [x, y] = point(e, M), a = aimAt(G, x, y), n = e.enraged ? 5 : 3;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_boss_03_atk3', x, y, a + (k - (n - 1) / 2) * 30 * DEG, { spd: 5, dmg: 3, h: e.y - y });
      },
      // Gọi lính xương (bullet04 = e_skeleton02_temp [ĐO BossAI03]; dữ liệu chỉ có e_skeleton02); tối đa 4 con cùng lúc [ƯỚC LƯỢNG]
      InAtk04(G, e) {
        const alive = G.enemies.filter(m => m.bossMinion === e && m.st !== 'dead').length;
        for (let k = 0; k < 2 && alive + k < 4; k++) {
          const a = SK.rand() * TAU;
          spawnMinion(G, e, 'e_skeleton02', e.x + Math.cos(a) * 28, e.y + Math.sin(a) * 20);
        }
      },
      // Mắt đỏ rồi bắn nhanh bullet_e_26 (OpenRedEye 0 s, InAtk05 0.47 s [ĐO clip]): chùm 3 ngắm thẳng tốc 12 + vòng 8 tốc 7, sát thương 3 [ƯỚC LƯỢNG]
      InAtk05(G, e) {
        const [x, y] = point(e, M), a = aimAt(G, x, y);
        for (let k = -1; k <= 1; k++) fire(G, e, 'bullet_e_26', x, y, a + k * 8 * DEG, { spd: 12, dmg: 3, h: e.y - y });
        for (let k = 0; k < 8; k++) fire(G, e, 'bullet_e_26', e.x, e.y - 18, a + k * TAU / 8, { spd: 7, dmg: 3, h: 18 });
      }
    }
  };
  void U; void BUL;
  SK.bossRegister('boss03', boss03);
})();
