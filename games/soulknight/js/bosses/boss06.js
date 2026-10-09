// Trùm boss06 — Zulan The Colossus, vùng Căn Cứ Ngoài Hành Tinh, trùm cuối ải 3-5.
// Nguồn: trường BossAI06 (Atk1/2/3 Damage/BulletSpeed, Atk3Time, Atk3CreateBulletTime, bullet01..04, ballGroupRotation*, angry_*),
// 5 bi trong nhóm img/ball_group/b1..b5 + 5 thế xếp bi (state boss06_c0..c4) của rig, BossAI06Child trong data/sk-bosses86.js.
// Clip thân chỉ có ide/run/dead: các đòn không có clip riêng nên chạy trên state ide, AI tự kết thúc đòn (e.atkEnd).
// Nhãn: [ĐO ...], [WIKI], [ƯỚC LƯỢNG]. Thứ tự bullet01..04 ↔ đòn theo thứ tự trường [ƯỚC LƯỢNG — mã IL2CPP chưa dịch].
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, aimAt, point, rigPlay, frameOf, shortLaser } = K;
  const BALLS = ['img/ball_group/b1', 'img/ball_group/b2', 'img/ball_group/b3', 'img/ball_group/b4', 'img/ball_group/b5'];
  const IDE = 'boss06_ide';
  const A = (e, k) => (e.ai && e.ai[k] != null ? e.ai[k] : 0);

  const orbs = (e) => BALLS.map(n => point(e, n));
  // Hết đòn sau `t` giây (nếu đòn còn là đòn hiện tại).
  function endAfter(G, e, name, t) {
    e.arena.objs.push({ t: 0, dur: t, update(G2, o) { if (o.t < o.dur) return !e.deathDone; if (e.atk && e.lastAtk === name) e.atkEnd = true; return false; } });
  }
  function form(e, k) { e.form = k; rigPlay(e.R, 'boss06_c' + k); }
  function later(e, t, fn) {
    e.arena.objs.push({ t: 0, dur: t, update(G2, o) { if (o.t < o.dur) return !e.deathDone; if (!e.deathDone) fn(G2); return false; } });
  }

  const def = {
    atks: ['spray', 'ring', 'storm', 'laser'], idle: IDE, run: 'boss06_run', hand: 'img/h1', muzzle: 'img/ball_group',
    state: { spray: IDE, ring: IDE, storm: IDE, laser: IDE }, enrageCd: 0.7,
    // Đòn 'laser' chỉ dùng khi nổi giận (BossAI06Child có Atk2/Atk3 laser riêng) [ƯỚC LƯỢNG lúc dùng]
    pick(G, e) { return e.enraged ? ['spray', 'ring', 'storm', 'laser'] : ['spray', 'ring', 'storm']; },
    start: {
      // Atk1: mỗi bi bắn bullet_e_2 vào người chơi, tốc 12, 4 sát thương [ĐO Atk1BulletSpeed/Damage]; 3 loạt cách 0.4 s [ƯỚC LƯỢNG]
      spray(G, e) {
        form(e, 0);
        for (let v = 0; v < 3; v++) later(e, 0.6 + v * 0.4, G2 => orbs(e).forEach(([x, y]) => fire(G2, e, 'bullet_e_2', x, y, aimAt(G2, x, y), { spd: A(e, 'Atk1BulletSpeed') || 12, dmg: A(e, 'Atk1Damage') || 4, h: 10 })));
        endAfter(G, e, 'spray', 2.2);
      },
      // Atk2: bi xếp ngũ giác (c1), bắn bullet_e_11 toả ra ngoài tốc 4, 4 sát thương [ĐO Atk2BulletSpeed/Damage]; 2 đợt lệch 36° [ƯỚC LƯỢNG]
      ring(G, e) {
        form(e, 1);
        for (let w = 0; w < 2; w++) later(e, 0.7 + w * 0.9, G2 => {
          const [cx, cy] = point(e, 'img/ball_group');
          orbs(e).forEach(([x, y], i) => {
            const a = Math.atan2(y - cy, x - cx);
            for (let s = -1; s <= 1; s++) fire(G2, e, 'bullet_e_11', x, y, a + s * 14 * DEG + w * 18 * DEG, { spd: A(e, 'Atk2BulletSpeed') || 4, dmg: A(e, 'Atk2Damage') || 4, h: 10 });
            void i;
          });
        });
        endAfter(G, e, 'ring', 2.6);
      },
      // Atk3: Atk3Time 3 s, cứ 0.2 s (Atk3CreateBulletTime) một bi bắn: bullet_e_22 (tốc 12) và bullet_e_34 (tốc 8) xen kẽ, 3 sát thương [ĐO];
      // đạn mẹ chỉ sống 1.5 s để khỏi ngập đạn con [ƯỚC LƯỢNG]
      storm(G, e) {
        form(e, 2);
        let n = 0, cd = 0.5;
        const t3 = A(e, 'Atk3Time') || 3, dt3 = A(e, 'Atk3CreateBulletTime') || 0.2;
        e.arena.objs.push({ t: 0, dur: t3 + 0.5, update(G2, o, dt) {
          if (e.deathDone || e.atk !== 'storm') return false;
          cd -= dt;
          while (cd <= 0) {
            cd += dt3;
            const [x, y] = point(e, BALLS[n % 5]), a = aimAt(G2, x, y) + SK.randf(-18, 18) * DEG, big = n % 2 === 0;
            fire(G2, e, big ? 'bullet_e_22' : 'bullet_e_34', x, y, a, big ? { spd: A(e, 'Atk3BulletSpeed1') || 12, dmg: A(e, 'Atk3Damage1') || 3, life: 1.5, h: 10 } : { spd: A(e, 'Atk3BulletSpeed2') || 8, dmg: A(e, 'Atk3Damage2') || 3, life: 1.5, h: 10 });
            n++;
          }
          return o.t < o.dur;
        } });
        endAfter(G, e, 'storm', t3 + 0.7);
      },
      // Laser (nổi giận): mỗi bi bắn tia ngắn bullet_e_15 vào người chơi, 4 sát thương [ĐO BossAI06Child.Atk2Damage]; 2 loạt [ƯỚC LƯỢNG]
      laser(G, e) {
        form(e, 3);
        for (let v = 0; v < 2; v++) later(e, 0.8 + v * 0.7, G2 => orbs(e).forEach(([x, y]) => shortLaser(G2, e, x, y, aimAt(G2, x, y), 4)));
        endAfter(G, e, 'laser', 2.2);
      }
    },
    ev: {},
    tick(G, e, dt) {
      // Nhóm bi quay: ballGroupRotationDelta 4 độ mỗi nhịp, 3.6 s/vòng ở chế độ ngồi yên [ƯỚC LƯỢNG đơn vị]; nổi giận quay nhanh hơn
      e.orbA = (e.orbA || 0) + (e.atk === 'storm' ? 150 : 360 / (A(e, 'ballGroupRotationTime') || 3.6)) * (e.enraged ? 1.4 : 1) * dt;
      const gi = e.nodes['img/ball_group'];
      if (gi != null && !e.deathDone) e.R.ov[gi] = Object.assign(e.R.ov[gi] || {}, { r: e.orbA });
      if (!e.atk && e.form && !e.deathDone) form(e, 0), e.form = 0;
    },
    // Nổi giận: đổi sang thân/vòng giận (angry_body boss06_1, angry_circle boss06_4) [ĐO trường]
    enrage(G, e) {
      const b = e.nodes['img/body'], c = e.nodes['img/circle'];
      if (b != null) e.R.ov[b] = { f: 'boss06_1' };
      if (c != null) e.R.ov[c] = { f: 'boss06_4' };
    },
    dead(G, e) { const b = e.nodes['img/body']; if (b != null) e.R.ov[b] = { f: 'boss06_2' }; },   // body_dead [ĐO trường]
    // 5 bi là prefab boss06_c riêng (sprite boss06_5; nổi giận boss06_7/6 theo angry_child1/2): vẽ tại các nút b1..b5
    drawOver(ctx, G, e) {
      if (e.deathDone) return;
      const fn = frameOf(e.enraged ? 'boss06_7' : 'boss06_5') || frameOf('boss06_5'), f = fn && window.SK_ATLAS.f[fn], img = f && SK.pages[f[0]];
      if (!img) return;
      orbs(e).forEach(([x, y]) => ctx.drawImage(img, f[1], f[2], f[3], f[4], Math.round(x - f[5]), Math.round(y - f[6]), f[3], f[4]));
    }
  };
  SK.bossRegister('boss06', def);
})();
