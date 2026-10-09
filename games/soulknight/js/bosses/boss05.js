// Trùm boss05 — Thủ Lĩnh Wackern (Varkolyn Leader), vùng Căn Cứ Ngoài Hành Tinh, trùm cuối ải 3-5.
// Nguồn: clip boss05_atk1..4 (sự kiện InAtk01..04, EndAtk03) + trường BossAI05 (bullet01..04, Gas_boss5, tentacle) trong data/sk-bosses86.js.
// Nhãn: [ĐO ...] đọc từ dữ liệu, [WIKI], [ƯỚC LƯỢNG]. Thứ tự đòn theo thứ tự trường bullet01..04 [ƯỚC LƯỢNG — mã IL2CPP chưa dịch].
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, BUL, fire, aimAt, point, beam, spawnMinion } = K;
  const MUZZLE = 'img/h1/point_1';

  // Vũng khí tím Gas_boss5: VFX thật (gas_start); số sát thương theo Gas thường: bán kính 3 đơn vị, 1 sát thương mỗi 0.5 s
  // [ĐO BulletGas của Gas; VioletGas_PrefabPool chỉ có duration 6 → bán kính/nhịp là ƯỚC LƯỢNG]
  function violetGas(G, e, x, y) {
    const gs = BUL.Gas && BUL.Gas.mbs.BulletGas || {}, VP = BUL.Gas_boss5 && BUL.Gas_boss5.mbs.VioletGas_PrefabPool || {};
    const dur = VP.duration || 6, rad = (gs.damage_radius || 3) * U;
    const h = SK.vfx && SK.vfx.spawn(G, 'Gas_boss5', x, y - 4, { state: 'gas_start', dur });
    let tickT = 0;
    e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
      tickT -= dt;
      const p = G2.player;
      if (tickT <= 0 && Math.hypot(p.x - x, p.y - y + 4) < rad) { tickT = gs.hit_invert || 0.5; SK.hurtPlayer(G2, K.dmgOf(gs.damage || 1)); }
      if (e.deathDone || o.t >= o.dur) { if (h) h.stop(); return false; }
      return true;
    } });
  }

  const def = {
    atks: ['boss05_atk1', 'boss05_atk2', 'boss05_atk3', 'boss05_atk4'], idle: 'boss05_ide', run: 'boss05_run',
    hand: 'img/h1', muzzle: MUZZLE, enrageCd: 0.65,
    ev: {
      // atk1: bullet_e_17 xoay (rotate_angle 6), mỗi 0.2 s rải 4 viên bullet_e_1 hình chữ thập, tốc 4, 3 sát thương [ĐO RGSBullet01];
      // 3 quả xoè 18° (nổi giận 5 quả) [ƯỚC LƯỢNG]
      InAtk01(G, e) {
        const [x, y] = point(e, MUZZLE), a = aimAt(G, x, y), n = e.enraged ? 5 : 3;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_17', x, y, a + (k - (n - 1) / 2) * 18 * DEG, { spd: 4, dmg: 3, life: 3.5, h: e.y - y });
      },
      // atk2: bullet_e_18 = RGSBullet02: 9 viên bullet_e_1 cách 20°, tốc 4, 3 sát thương [ĐO count 9, angle 20, child_bullet_speed 4];
      // bắn thẳng tại nòng; nổi giận thêm đợt thứ hai lệch 10° sau 0.35 s [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const wave = off => {
          const [x, y] = point(e, MUZZLE), a = aimAt(G, x, y) + off, I = BUL.bullet_e_18 && BUL.bullet_e_18.mbs.RGSBullet02 || {};
          const n = I.count || 9, step = (I.angle || 20) * DEG;
          for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_1', x, y, a + (k - (n - 1) / 2) * step, { spd: I.child_bullet_speed || 4, dmg: I.child_bullet_damage || 3, h: e.y - y });
        };
        wave(0);
        if (e.enraged) e.arena.objs.push({ t: 0, dur: 0.35, update(G2, o) { if (o.t < o.dur) return true; if (!e.deathDone) wave(10 * DEG); return false; } });
      },
      // atk3 (clip 3.75 s, khí từ 1.25 s tới EndAtk03 ở 3 s): nhả vũng khí tím Gas_boss5 xuống chỗ người chơi mỗi 0.55 s [ƯỚC LƯỢNG nhịp]
      InAtk03(G, e) {
        let cd = 0;
        e.arena.objs.push({ t: 0, dur: 4, update(G2, o, dt) {
          if (e.deathDone || e.atk !== 'boss05_atk3') return false;
          cd -= dt;
          if (cd > 0) return true;
          cd = e.enraged ? 0.4 : 0.55;
          const p = G2.player, a = SK.rand() * TAU, d = SK.randf(0, 14);
          violetGas(G2, e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
          return true;
        } });
      },
      // atk4: tia laser bullet_e_20 quét ~60° quanh hướng người chơi trong 0.75 s còn lại của clip;
      // 3 sát thương mỗi 0.2 s [ĐO RGELaserTrigger damage 1 × damageMult 3, rate 0.2, startDelay 0.4]; tốc quét [ƯỚC LƯỢNG]
      InAtk04(G, e) {
        const dir = SK.chance(0.5) ? 1 : -1, sweep = 80 * DEG;
        let a = aimAt(G, ...point(e, MUZZLE)) - dir * sweep * 0.4;
        beam(G, e, 'bullet_e_20', {
          dmg: 3, alive: () => e.atk === 'boss05_atk4',
          origin: () => point(e, MUZZLE),
          ang(dt) { a += dir * sweep * dt; return a; }
        });
      }
    },
    // Nổi giận [WIKI]: gọi xúc tu e_tentacle (prefab BossAI05.tentacle), tối đa 3 con cùng lúc [ƯỚC LƯỢNG số lượng]
    enrage(G, e) {
      for (let k = 0; k < 2; k++) {
        const a = SK.rand() * TAU;
        spawnMinion(G, e, 'e_tentacle', G.player.x + Math.cos(a) * 36, G.player.y + Math.sin(a) * 36);
      }
    }
  };
  SK.bossRegister('boss05', def);
})();
