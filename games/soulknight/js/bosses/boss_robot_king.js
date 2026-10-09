// Hoàng Đế Robot (boss_robot_king, Thành phố robot). Đòn gốc không có bản dịch: hành vi dựng từ sự kiện clip
// (anim_onSkillEffectiveStart/End), danh sách đạn bullets[] của BossCtrlRobotKing [ĐO] và hiểu biết về trùm [WIKI/ƯỚC LƯỢNG].
(function () {
  'use strict';
  const K = window.SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, blast, aimAt, point, beam, spawnMinion } = K;
  const MUZ = 'img/body/firePoint';
  const ST = { atk1: 'atk1', atk2: 'atk2', atk3: 'boss_robot_king_atk3', atk4: 'atk4', atk5: 'atk5', atk7: 'boss_robot_king_atk7' };

  const def = {
    atks: ['atk1', 'atk2', 'atk3', 'atk4', 'atk5', 'atk7'], idle: 'ide', run: 'run', muzzle: MUZ, enrageCd: 0.7, state: ST,
    // Triệu hồi lính gác (guardUnit 4 loại robot_knight [ĐO]) chỉ khi còn dưới 2 con [ƯỚC LƯỢNG]
    pick(G, e) {
      const g = G.enemies.filter(m => m.bossMinion === e && m.hp > 0).length;
      return g < 2 ? ['atk1', 'atk2', 'atk3', 'atk4', 'atk5', 'atk7'] : ['atk1', 'atk2', 'atk3', 'atk4', 'atk5'];
    },
    start: {
      atk4(G, e) { e.lock = null; e.n = 0; },
      atk1(G, e) { e.n = 0; }, atk3(G, e) { e.n = 0; }, atk5(G, e) { e.n = 0; }, atk7(G, e) { e.n = 0; },
      // Tia laser bullet_e_robot_king_laser (4 sát thương [ĐO bullets[4]]) từ Start (0.67 s) tới End (2.42 s), bám mục tiêu 55°/giây [ƯỚC LƯỢNG]
      atk2(G, e) { e.laser = false; e.la = null; }
    },
    ev: {
      anim_onSkillEffectiveStart(G, e, arg, st) {
        const [x, y] = point(e, MUZ), a = aimAt(G, x, y), h = e.y - y;
        if (st === ST.atk1) {
          // bullet_e_shock_yellow (bullets[0], tốc 10, sát thương 1) để lại vệt sóng; quạt 5 tia [ƯỚC LƯỢNG]
          for (let k = -2; k <= 2; k++) fire(G, e, 'bullet_e_shock_yellow', x, y, a + k * 18 * DEG, { spd: 10, dmg: 2, h });
        } else if (st === ST.atk2) {
          e.laser = true; e.la = a;
          beam(G, e, 'bullet_e_robot_king_laser', {
            dmg: 4, alive: () => e.laser && e.atk === ST.atk2, origin: () => point(e, MUZ),
            ang(dt) {
              const w = aimAt(G, e.x, e.y - 14); let d = Math.atan2(Math.sin(w - e.la), Math.cos(w - e.la));
              e.la += Math.max(-55 * DEG * dt, Math.min(55 * DEG * dt, d)); return e.la;
            }
          });
        } else if (st === ST.atk3) {
          // 4 loạt atf_boss2_bullet_e_25 (bullets[3], tốc 10, sát thương 3): 8 tia xoay lệch mỗi loạt [ĐO số mốc clip; ƯỚC LƯỢNG số tia]
          const a0 = a + e.n++ * 11 * DEG;
          for (let k = 0; k < 8; k++) fire(G, e, 'atf_boss2_bullet_e_25', x, y, a0 + k * TAU / 8, { spd: 10, dmg: 3, h });
        } else if (st === ST.atk5) {
          // 9 mốc bắn liên thanh cách 0.083 s: bullet_e_24 (bullets[2], tốc 8) lệch ngẫu nhiên ±10° [ĐO mốc; ƯỚC LƯỢNG lệch]
          fire(G, e, 'bullet_e_24', x, y, a + SK.randf(-10, 10) * DEG, { spd: 8, dmg: 3, h });
        } else if (st === ST.atk4) {
          if (e.n++ === 0) { e.lock = [G.player.x, G.player.y]; return; }
          // Mốc 2 (2.67 s): lao xuống chỗ đã khoá, nổ + vòng bullet_e_50_robotKing (bullets[1]) [ƯỚC LƯỢNG hành vi]
          const t = e.lock || [G.player.x, G.player.y];
          const [nx, ny] = SK.freeNear(t);
          e.x = nx; e.y = ny;
          blast(G, e.x, e.y, 36, 4, 'robot_king_4_crashFX2');
          G.shake = Math.max(G.shake, 8);
          for (let k = 0; k < 8; k++) fire(G, e, 'bullet_e_50_robotKing', e.x, e.y - 14, k * TAU / 8, { spd: 8, dmg: 3, h: 14 });
        } else if (st === ST.atk7) {
          // Gọi lính gác: 2 con ngẫu nhiên trong robot_knight_1..4 [ĐO guardUnit]
          for (let i = 0; i < 2; i++) {
            const an = SK.rand() * TAU;
            spawnMinion(G, e, 'e_robot_knight_' + (1 + Math.floor(SK.rand() * 4)), e.x + Math.cos(an) * 40, e.y + Math.sin(an) * 40);
          }
        }
      },
      anim_onSkillEffectiveEnd(G, e, arg, st) { if (st === ST.atk2) e.laser = false; }
    }
  };
  SK.bossRegister('boss_robot_king', def);
})();
