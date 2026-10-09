// Trùm boss22 — Tượng Viễn Cổ (1-5 Di Tích). Máu 460 × 1.2, tốc 6 [ĐO sk-bosses86 BossAI22/RoleAttribute].
// Ba đòn có sự kiện clip (atk4/atk5 chỉ là clip 1 s không sự kiện, không dùng). Hành vi dựng từ tên sự kiện + prefab MB
// (stone1/2 = e_fireball, vine_obj = Gas, enemy_obj01/02 = e_malphite01/02, shake_obj = effect_shock3, move_shake_obj = bullet_e_shock_2).
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT;
  if (!K) return;
  const { U, TAU, DEG, aimAt, fire, blast, meteor, gasPool, spawnMinion, clampRoom, sfx } = K;
  const W = SK.world;

  // bullet_e_shock_2: viên vô hình bay thẳng tốc 10, mỗi 0.2 s để lại effect_shock3 [ĐO Bullet01.speed, RGBTDelayCreate.delay]
  // effect_shock3 4 sát thương [ĐO ExplodeEnergy.damage]; bán kính 16 px [ƯỚC LƯỢNG]
  function shockLine(G, e, x, y, ang) {
    const sp = 10 * U, c = Math.cos(ang), s = Math.sin(ang);
    let next = 0.2;
    e.arena.objs.push({ t: 0, dur: 5, update(G2, o) {
      if (e.deathDone) return false;
      while (o.t >= next) {
        const d = next * sp;
        next += 0.2;
        const px = x + c * d, py = y + s * d;
        if (W.solidAt(G2.map, px, py)) return false;
        blast(G2, px, py, 16, 4, 'effect_shock3');
      }
      return o.t < o.dur;
    } });
  }
  const at = (e, dly, fn) => e.arena.objs.push({ t: 0, dur: dly, update(G2, o) { if (o.t < o.dur) return true; if (!e.deathDone) fn(G2); return false; } });
  const minions = (G, e) => G.enemies.filter(m => m.bossMinion === e && m.st !== 'dead' && !m.deathDone).length;

  const boss22 = {
    atks: ['atk1', 'atk2', 'atk3'], idle: 'ide', run: 'run', enrageCd: 0.7,
    ev: {
      // atk1 đập đất (InAtk01 1.6 s): sóng chấn effect_shock3 quanh chân [ĐO shake_obj] + dải sóng bay về phía người chơi;
      // thường 1 dải, nổi giận 3 dải lệch 25° [ƯỚC LƯỢNG số dải]
      InAtk01(G, e) {
        blast(G, e.x, e.y - 4, 22, 4, 'effect_shock3');
        G.shake = Math.max(G.shake, 5);
        const a = aimAt(G, e.x, e.y - 8);
        const n = e.enraged ? 3 : 1;
        for (let i = 0; i < n; i++) shockLine(G, e, e.x, e.y - 4, a + (i - (n - 1) / 2) * 25 * DEG);
      },
      // atk2 triệu hồi (InAtk02_1 1.6 s): e_malphite01 (nổi giận thêm e_malphite02), tối đa 3 con cùng lúc [ƯỚC LƯỢNG]
      InAtk02_1(G, e) {
        if (minions(G, e) >= 3) return;
        const ids = e.enraged ? ['e_malphite01', 'e_malphite02'] : ['e_malphite01', 'e_malphite01'];
        ids.forEach((id, i) => {
          const a = SK.rand() * TAU;
          spawnMinion(G, e, id, e.x + Math.cos(a) * (28 + i * 8), e.y + Math.sin(a) * 18);
        });
      },
      // atk2 dây leo/khí độc (InAtk02 1.867 s): vũng Gas bán kính 3 đơn vị, 1 sát thương mỗi 0.5 s, 6 s [ĐO BulletGas]; 2 vũng, nổi giận 3 [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const p = G.player, n = e.enraged ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = SK.rand() * TAU, d = i ? SK.randf(2, 4) * U : 0;
          const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
          gasPool(G, e, x, y);
        }
      },
      // atk3 ném đá lửa (InAtk03 1.2 s, _1 1.6 s, _2 1.7 s): e_fireball rơi sau 1 s rồi nổ 6 sát thương [ĐO DelayExplode, Explode.damage]
      // ba nhịp: ngay chỗ người chơi, rồi hai nhịp rải quanh; nổi giận mỗi nhịp thêm 1 quả [ƯỚC LƯỢNG số quả]
      InAtk03(G, e) { drop(G, e, 0, 1); },
      InAtk03_1(G, e) { drop(G, e, 3, e.enraged ? 2 : 1); },
      InAtk03_2(G, e) { drop(G, e, 4, e.enraged ? 2 : 1); }
    }
  };
  function drop(G, e, spread, n) {
    for (let i = 0; i < n; i++) {
      const p = G.player, a = SK.rand() * TAU, d = spread * U * SK.randf(0.5, 1);
      const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      meteor(G, e, x, y, 'e_fireball');
    }
  }
  SK.bossRegister('boss22', boss22);
  void fire; void sfx;
})();
