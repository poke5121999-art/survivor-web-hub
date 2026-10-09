// Vua Sâu Giữ Mộ (boss27, Huyệt Mộ). Mã đòn gốc (Boss27Skill) không có bản dịch: hành vi dựng từ trường MB [ĐO Boss27Skill],
// tên state boss27_atk1..5 và độ dài clip (clip không có sự kiện, nên mốc thời gian lấy từ initDelay của từng model).
(function () {
  'use strict';
  const K = window.SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, blast, aimAt, spawnMinion } = K;
  const S = (K.B86.bosses.boss27.mbs.Boss27Skill) || {};
  const H = S.heavyAttackModel || {}, F = S.fastSlashModel || {}, J = S.jumpSlashModel || {}, M = S.summonScarabModel || {};

  const later = (e, t, fn) => e.arena.objs.push({ t: 0, dur: t, update(G, o) { if (e.deathDone) return false; if (o.t < o.dur) return true; fn(G); return false; } });
  // Lao tới mục tiêu: dist đơn vị trong dur giây [ĐO moveAmount/moveDuration]; dừng ở tường.
  function dash(G, e, a, distU, dur) {
    const sp = distU * U / dur;
    e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
      if (e.deathDone) return false;
      SK.moveBox(G2.map, e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, e.r);
      return o.t < o.dur;
    } });
  }
  const ring = (G, e, name, n, a0, o) => { for (let k = 0; k < n; k++) fire(G, e, name, e.x, e.y - 14, a0 + k * TAU / n, Object.assign({ h: 14 }, o)); };

  const def = {
    atks: ['atk1', 'atk2', 'atk3', 'atk5'], idle: 'boss23_ide', run: 'boss23_run', enrageCd: 0.7,
    state: { atk1: 'boss27_atk1', atk2: 'boss27_atk2', atk3: 'boss27_atk3', atk5: 'boss27_atk5' },
    // Trọng số thường/nổi giận [ĐO normalWeight/angryWeight]: nhảy chém chỉ khi nổi giận
    pick(G, e) {
      const w = e.enraged ? { atk1: H.angryWeight, atk2: J.angryWeight, atk3: F.angryWeight, atk5: M.angryWeight }
        : { atk1: H.normalWeight, atk2: J.normalWeight, atk3: F.normalWeight, atk5: M.normalWeight };
      const out = [];
      for (const k of Object.keys(w)) for (let i = 0; i < (w[k] || 0); i++) out.push(k);
      return out;
    },
    start: {
      // Đòn nặng: sau initDelay 0.75 s đập búa (sóng effect_shock1 quanh trùm) và toả 6 viên bullet_e_94 tốc 8 sát thương 3 [ĐO heavyAttackModel]
      atk1(G, e) {
        later(e, H.initDelay || 0.75, G2 => {
          const a = aimAt(G2, e.x, e.y - 14), n = H.bulletCount || 6;
          blast(G2, e.x + Math.cos(a) * 28, e.y + Math.sin(a) * 28, (H.radius || 2) * U + 6, 3, 'effect_shock1');
          G2.shake = Math.max(G2.shake, 4);
          for (let k = 0; k < n; k++) fire(G2, e, 'bullet_e_94', e.x, e.y - 14, a + (k - (n - 1) / 2) * 24 * DEG, { spd: H.bulletInfo.speed || 8, dmg: 3, h: 14 });   // quạt 24°/viên [ƯỚC LƯỢNG]
        });
      },
      // Nhảy chém (chỉ nổi giận): đợi 1 s rồi bay 7 đơn vị trong 0.75 s, tới initDelay 1.9583 s nổ sóng + 8 viên bullet_e_shock_red tốc 6 [ĐO jumpSlashModel]
      atk2(G, e) {
        later(e, J.moveInitDelay || 1, G2 => dash(G2, e, aimAt(G2, e.x, e.y), J.moveAmount || 7, J.moveDuration || 0.75));
        later(e, J.initDelay || 1.9583, G2 => {
          blast(G2, e.x, e.y, 30, 3, 'effect_shock1');
          G2.shake = Math.max(G2.shake, 6);
          ring(G2, e, 'bullet_e_shock_red', J.bulletCount || 8, SK.rand() * TAU, { spd: J.bullet.speed || 6, dmg: 3 });
        });
      },
      // Chém nhanh: lao 2.5 đơn vị trong 0.4 s ở 1.1667 s, sóng đỏ effect_shock_red 6 sát thương cách 4 đơn vị phía trước, 5 viên bullet_e_24 tốc 5 [ĐO fastSlashModel]
      atk3(G, e) {
        later(e, F.initDelay || 1.1667, G2 => {
          const a = aimAt(G2, e.x, e.y - 14);
          dash(G2, e, a, F.moveAmount || 2.5, F.duration || 0.4);
          later(e, F.duration || 0.4, G3 => {
            const a2 = aimAt(G3, e.x, e.y - 14), d = (F.shockOffset.x || 4) * U;
            blast(G3, e.x + Math.cos(a2) * d, e.y + Math.sin(a2) * d, 28, 6, 'effect_shock_red');
            const n = F.extraBulletCount || 5;
            for (let k = 0; k < n; k++) fire(G3, e, 'bullet_e_24', e.x, e.y - 14, a2 + (k - (n - 1) / 2) * 20 * DEG, { spd: F.extraBullet.speed || 5, dmg: 3, h: 14 });   // quạt 20° [ƯỚC LƯỢNG]
          });
        });
      },
      // Gọi bọ: 4–8 con trong ScarabFire/Ice/Poison (quái e_relicScarab*), tối đa 10 con cùng lúc [ĐO summonScarabModel]
      atk5(G, e) {
        later(e, M.initDelay || 0.125, G2 => {
          const alive = G2.enemies.filter(m => m.bossMinion === e && m.hp > 0).length;
          const n = Math.min(SK.randi ? SK.randi(M.countRange.x, M.countRange.y + 1) : 4 + Math.floor(SK.rand() * 5), (M.maxCount || 10) - alive);
          const kinds = ['e_relicScarabFire', 'e_relicScarabIce', 'e_relicScarabPoison'];
          for (let i = 0; i < n; i++) {
            const a = SK.rand() * TAU, d = SK.randf(1.5, 3) * U;
            spawnMinion(G2, e, SK.pick(kinds), e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
          }
        });
      }
    },
    ev: {}
  };
  SK.bossRegister('boss27', def);
})();
