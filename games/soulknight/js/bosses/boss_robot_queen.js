// Hoàng Hậu Robot (boss_robot_queen, Thành phố robot). Đòn gốc không có bản dịch: dựng từ sự kiện clip
// (SkillEffectiveStart/End = cửa sổ tấn công), bullets[] của BossCtrlRobotQueen [ĐO], hiểu biết về trùm [WIKI/ƯỚC LƯỢNG].
(function () {
  'use strict';
  const K = window.SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, fire, blast, aimAt, point, beam } = K;
  const HANDS = ['img/hands/boss_robot_queen_hand1L/img/FirePoint', 'img/hands/boss_robot_queen_hand1R/img/FirePoint',
    'img/hands/boss_robot_queen_hand2L/img/FirePoint', 'img/hands/boss_robot_queen_hand2R/img/FirePoint'];
  const ST = { atk1: 'atk_1', atk2: 'atk_2', atk3: 'atk_3', atk5: 'atk5' };
  const run = (e, st, fn) => {
    // Cửa sổ đòn: chạy fn(dt) mỗi khung tới khi hết SkillEffectiveEnd hoặc rời state
    e.arena.objs.push({ t: 0, dur: 9, update(G, o, dt) { if (e.deathDone || e.atk !== st || !e.win) return false; fn(G, dt, o.t); return true; } });
  };
  const hp = (e, i) => point(e, HANDS[i % 4]);

  const def = {
    atks: ['atk1', 'atk2', 'atk3', 'atk5'], idle: 'ide', run: 'run', enrageCd: 0.7, state: ST,
    ev: {
      anim_onSkillEffectiveStart(G, e, arg, st) {
        e.win = true;
        const rate = e.enraged ? 0.75 : 1;
        if (st === ST.atk1) {
          // bullet_e_3 (bullets[1], tốc 16, sát thương 3 [ĐO]) bắn xen kẽ bốn tay, nhịp 0.14 s [ƯỚC LƯỢNG]
          let cd = 0, i = 0;
          run(e, st, (G2, dt) => { cd -= dt; if (cd > 0) return; cd = 0.14 * rate; const [x, y] = hp(e, i++); fire(G2, e, 'bullet_e_3', x, y, aimAt(G2, x, y) + SK.randf(-8, 8) * DEG, { spd: 16, dmg: 3, h: e.y - y }); });
        } else if (st === ST.atk2) {
          // Hai tia bullet_e_8 (bullets[0], 2 sát thương [ĐO]) từ hai tay trên, quét ngược chiều 50°/giây [ƯỚC LƯỢNG]
          for (let s = -1; s <= 1; s += 2) {
            let a = aimAt(G, e.x, e.y - 14) - s * 40 * DEG;
            beam(G, e, 'bullet_e_8', { dmg: 2, alive: () => e.win && e.atk === st, origin: () => hp(e, s < 0 ? 0 : 1), ang(dt) { a += s * 50 * DEG * dt; return a; } });
          }
        } else if (st === ST.atk3) {
          // bullet_e_45 (bullets[3], đạn tự dẫn tốc 12, kích thước 2, nổ khi chạm [ĐO]) phóng từ tay dưới mỗi 0.5 s
          let cd = 0, i = 2;
          run(e, st, (G2, dt) => { cd -= dt; if (cd > 0) return; cd = 0.5 * rate; const [x, y] = hp(e, i++ % 2 + 2); fire(G2, e, 'bullet_e_45', x, y, aimAt(G2, x, y), { spd: 12, dmg: 2, h: e.y - y }); });
        } else if (st === ST.atk5) {
          // Chuỗi nổ robotQueen_explode (SerialExplode, 2 sát thương [ĐO]) chạy từ trùm tới người chơi mỗi 0.4 s + bullet_e_50_robotQueen (bullets[2], tốc 8, 5 sát thương)
          let cd = 0, n = 0;
          run(e, st, (G2, dt) => {
            cd -= dt; if (cd > 0) return; cd = 0.4 * rate;
            const p = G2.player, f = Math.min(1, (++n) / 8);
            const x = e.x + (p.x - e.x) * f + SK.randf(-18, 18), y = e.y + (p.y - e.y) * f + SK.randf(-18, 18);
            blast(G2, x, y, 20, 2, 'robotQueen_explode');
            if (n % 3 === 0) { const [hx, hy] = hp(e, n); fire(G2, e, 'bullet_e_50_robotQueen', hx, hy, aimAt(G2, hx, hy), { spd: 8, dmg: 5, h: e.y - hy }); }
          });
        }
      },
      anim_onSkillEffectiveEnd(G, e) { e.win = false; }
    }
  };
  SK.bossRegister('boss_robot_queen', def);
})();
