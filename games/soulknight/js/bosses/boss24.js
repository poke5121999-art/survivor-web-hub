// Trùm boss24 (Sâu Băng Hang Động): clip atk1..atk4 + MB BossAI24 (burrow/thorn/iceNail/atk4/bodyBullet).
// Nhãn: [ĐO] dữ liệu, [WIKI], [ƯỚC LƯỢNG]. Thân rắn nhiều đốt (snakeModel), ăn hồi máu (eat), đá băng (iceStone) chưa làm.
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, aimAt, blast, clampRoom } = K;
  const W = SK.world;

  const boss24 = {
    atks: ['atk1', 'atk2', 'atk3', 'atk4'], idle: 'ide', run: 'run', enrageCd: 0.65,
    // Thân sâu nhả vòng đạn: bodyBulletReleaseCount 4 viên bullet_e_24 mỗi 4 s (nổi giận 3 s) [ĐO snakeModel]
    tick(G, e, dt) {
      e.bodyT = (e.bodyT == null ? 2 : e.bodyT) - dt;
      if (e.bodyT > 0) return;
      e.bodyT = e.enraged ? 3 : 4;
      const a0 = SK.rand() * TAU;
      for (let k = 0; k < 4; k++) fire(G, e, 'bullet_e_24', e.x, e.y - 12, a0 + k * TAU / 4, { spd: 8, dmg: 3, h: 12 });
    },
    start: {
      // atk2 không có sự kiện clip: gai băng (thornBullet explode_ice3, thornDuration 0.25 s, sống 0.65 s) trồi dọc đường tới người chơi,
      // cuối đường nở thornEndBullet bullet_e_41 ×4 (nổi giận 6) [ĐO]; bước 2 đơn vị, 0.08 s/gai [ƯỚC LƯỢNG]
      atk2(G, e) {
        const a = aimAt(G, e.x, e.y - 8), n = 7, step = 2 * U;
        for (let i = 1; i <= n; i++) {
          const x = e.x + Math.cos(a) * step * i, y = e.y + Math.sin(a) * step * i;
          e.arena.objs.push({ t: 0, dur: i * 0.08, update(G2, o) {
            if (o.t < o.dur || e.deathDone) return o.t < o.dur;
            if (!W.solidAt(G2.map, x, y)) blast(G2, x, y, 14, 3, 'explode_ice3');
            if (i === n && !e.deathDone) {
              const m = e.enraged ? 6 : 4, a0 = SK.rand() * TAU;
              for (let k = 0; k < m; k++) fire(G2, e, 'bullet_e_41', x, y, a0 + k * TAU / m, { spd: 6, dmg: 3, h: 8 });
            }
            return false;
          } });
        }
      }
    },
    ev: {
      // atk1 = lặn đất: InAtk01 (0 s) đến InAtk01End (0.5 s); burrowDisplacement 4 đơn vị trong burrowDuration 0.3 s hướng người chơi,
      // trồi lên bắn burrowBullet bullet_e_34 ×4 (RGSBullet01 rải bullet_e_24) [ĐO]; bắn chữ thập [ƯỚC LƯỢNG]
      InAtk01(G, e) {
        const a = aimAt(G, e.x, e.y), dist = 4 * U, dur = 0.3;
        let moved = 0;
        e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
          if (e.deathDone) return false;
          const k = Math.min(1, o.t / dur), want = dist * k * (2 - k), s = want - moved;   // đường cong burrowMoveCurve ra dạng ease-out
          moved = want;
          SK.moveBox(G2.map, e, Math.cos(a) * s, Math.sin(a) * s, e.r);
          if (o.t >= dur) {
            const a0 = aimAt(G2, e.x, e.y - 8);
            for (let i = 0; i < 4; i++) fire(G2, e, 'bullet_e_34', e.x, e.y - 8, a0 + i * TAU / 4, { spd: 6, dmg: 5, h: 8 });
            return false;
          }
          return true;
        } });
      },
      // atk3: InAtk03 (0.44 s): effect_shock2 quanh trùm (ExplodeEnergy damage 6, scaleFactor 2) [ĐO atk3Bullet] rồi iceNail:
      // effect_iceNail ×8 (+40% khi nổi giận) giáng quanh người chơi cách nhau 0.02–0.07 s [ĐO iceNailModel; chỗ rơi ƯỚC LƯỢNG]
      InAtk03(G, e) {
        blast(G, e.x, e.y - 8, 28, 6, 'effect_shock2');
        const n = Math.round(8 * (e.enraged ? 1.4 : 1));
        let delay = 0.2;
        for (let i = 0; i < n; i++) {
          delay += SK.randf(0.02, 0.07) + 0.06;
          const d0 = delay;
          e.arena.objs.push({ t: 0, dur: d0, update(G2, o) {
            if (o.t < d0 && !e.deathDone) return true;
            if (e.deathDone) return false;
            const p = G2.player, a = SK.rand() * TAU, d = (i ? SK.randf(0.5, 3.5) : 0) * U;
            const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
            blast(G2, x, y, 12, 6, 'effect_iceNail');
            return false;
          } });
        }
      },
      // atk4: InAtk04 (0.75 s) bắn atk4.bulletInfo bullet_e_85 theo `count` 5 nhịp cách 0.1 s (releaseDelay), mỗi nhịp scatterCount 6 viên
      // trải 180° quanh hướng người chơi; nổi giận 8 nhịp ×12 viên trải 270° [ĐO atk4]
      InAtk04(G, e) {
        const waves = e.enraged ? 8 : 5, n = e.enraged ? 12 : 6, span = (e.enraged ? 270 : 180) * DEG;
        for (let w = 0; w < waves; w++) {
          e.arena.objs.push({ t: 0, dur: w * 0.1, update(G2, o) {
            if (o.t < w * 0.1) return !e.deathDone;
            if (e.deathDone) return false;
            const a = aimAt(G2, e.x, e.y - 12);
            for (let k = 0; k < n; k++) fire(G2, e, 'bullet_e_85', e.x, e.y - 12, a - span / 2 + span * (k + 0.5) / n, { spd: 10, dmg: 3, h: 12 });
            return false;
          } });
        }
      }
    }
  };
  SK.bossRegister('boss24', boss24);
})();
