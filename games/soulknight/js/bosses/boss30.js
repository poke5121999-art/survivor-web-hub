// Trùm boss30 — Di Tích Zulan (Zulan in Ruins), vùng 1G Di Tích Máy Móc, tầng 1. Bản di tích của Zulan The Colossus (boss06).
// Nguồn: BossAI30 (shoot_cd 3, bullet01..04 = bullet_e_2/11/22/34, bulletAttrInfos 3 mục {dmg,spd}, angry_body/circle/child1/child2, body_dead),
// 5 bi img/ball_group/b1..b5 + 5 thế xếp bi (state boss30_c0..c4), BossAI30Child (bullet_e_15 laser ngắn, bullet_e_25, bullet_e_21) trong data/sk-bosses86.js.
// Clip thân chỉ có ide/run/dead: các đòn chạy trên state ide, AI tự kết thúc đòn (e.atkEnd). Mã IL2CPP chưa dịch nên thứ tự bullet ↔ đòn là [ƯỚC LƯỢNG].
// Nhãn: [ĐO ...], [WIKI], [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, fire, aimAt, point, rigPlay, frameOf, shortLaser } = K;
  const BALLS = ['img/ball_group/b1', 'img/ball_group/b2', 'img/ball_group/b3', 'img/ball_group/b4', 'img/ball_group/b5'];
  const IDE = 'boss30_ide';
  const A = (e, k) => (e.ai && e.ai[k] != null ? e.ai[k] : 0);

  const orbs = (e) => BALLS.map(n => point(e, n));
  // Hết đòn sau `t` giây (nếu đòn còn là đòn hiện tại).
  function endAfter(G, e, name, t) {
    e.arena.objs.push({ t: 0, dur: t, update(G2, o) { if (o.t < o.dur) return !e.deathDone; if (e.atk && e.lastAtk === name) e.atkEnd = true; return false; } });
  }
  function form(e, k) { e.form = k; rigPlay(e.R, 'boss30_c' + k); }
  function later(e, t, fn) {
    e.arena.objs.push({ t: 0, dur: t, update(G2, o) { if (o.t < o.dur) return !e.deathDone; if (!e.deathDone) fn(G2); return false; } });
  }

  const def = {
    atks: ['spray', 'ring', 'storm', 'laser'], idle: IDE, run: 'boss30_run', hand: 'img/h1', muzzle: 'img/ball_group',
    state: { spray: IDE, ring: IDE, storm: IDE, laser: IDE }, enrageCd: 0.7,
    // Đòn 'laser' chỉ dùng khi nổi giận (BossAI30Child có bullet_e_15 laser) [ƯỚC LƯỢNG lúc dùng]
    pick(G, e) { return e.enraged ? ['spray', 'ring', 'storm', 'laser'] : ['spray', 'ring', 'storm']; },
    start: {
      // Atk1: mỗi bi bắn bullet_e_2 vào người chơi, tốc 12, 3 sát thương [ĐO bulletAttrInfos[0]]; bullet_e_2 cho đòn 1 [ƯỚC LƯỢNG]; 3 loạt cách 0.4 s [ƯỚC LƯỢNG]
      spray(G, e) {
        form(e, 0);
        for (let v = 0; v < 3; v++) later(e, 0.6 + v * 0.4, G2 => orbs(e).forEach(([x, y]) => fire(G2, e, 'bullet_e_2', x, y, aimAt(G2, x, y), { spd: 12, dmg: 3, h: 10 })));
        endAfter(G, e, 'spray', 2.2);
      },
      // Atk2: bi xếp ngũ giác (c1), bắn bullet_e_11 toả ra ngoài tốc 4, 3 sát thương [ĐO bulletAttrInfos[1]]; 2 đợt lệch 36° [ƯỚC LƯỢNG]
      ring(G, e) {
        form(e, 1);
        for (let w = 0; w < 2; w++) later(e, 0.7 + w * 0.9, G2 => {
          const [cx, cy] = point(e, 'img/ball_group');
          orbs(e).forEach(([x, y], i) => {
            const a = Math.atan2(y - cy, x - cx);
            for (let s = -1; s <= 1; s++) fire(G2, e, 'bullet_e_11', x, y, a + s * 14 * DEG + w * 18 * DEG, { spd: 4, dmg: 3, h: 10 });
            void i;
          });
        });
        endAfter(G, e, 'ring', 2.6);
      },
      // Atk3: 3 s, cứ 0.25 s một bi bắn bullet_e_22 / bullet_e_34 xen kẽ, tốc 8, 2 sát thương [ĐO bulletAttrInfos[2]]; thời lượng và nhịp [ƯỚC LƯỢNG, mượn boss06];
      // đạn mẹ chỉ sống 1.5 s để khỏi ngập đạn con [ƯỚC LƯỢNG]
      storm(G, e) {
        form(e, 2);
        let n = 0, cd = 0.5;
        const t3 = 3, dt3 = 0.25;
        e.arena.objs.push({ t: 0, dur: t3 + 0.5, update(G2, o, dt) {
          if (e.deathDone || e.atk !== 'storm') return false;
          cd -= dt;
          while (cd <= 0) {
            cd += dt3;
            const [x, y] = point(e, BALLS[n % 5]), a = aimAt(G2, x, y) + SK.randf(-18, 18) * DEG, big = n % 2 === 0;
            fire(G2, e, big ? 'bullet_e_22' : 'bullet_e_34', x, y, a, big ? { spd: 8, dmg: 2, life: 1.5, h: 10 } : { spd: 8, dmg: 2, life: 1.5, h: 10 });
            n++;
          }
          return o.t < o.dur;
        } });
        endAfter(G, e, 'storm', t3 + 0.7);
      },
      // Laser (nổi giận): mỗi bi bắn tia ngắn bullet_e_15 vào người chơi, 3 sát thương [ƯỚC LƯỢNG; bullet01 của BossAI30Child là ĐO]; 2 loạt [ƯỚC LƯỢNG]
      laser(G, e) {
        form(e, 3);
        for (let v = 0; v < 2; v++) later(e, 0.8 + v * 0.7, G2 => orbs(e).forEach(([x, y]) => shortLaser(G2, e, x, y, aimAt(G2, x, y), 3)));
        endAfter(G, e, 'laser', 2.2);
      }
    },
    ev: {},
    tick(G, e, dt) {
      // Nhóm bi quay: 3.6 s/vòng ở chế độ ngồi yên [ƯỚC LƯỢNG, mượn boss06]; nổi giận quay nhanh hơn
      e.orbA = (e.orbA || 0) + (e.atk === 'storm' ? 150 : 360 / (3.6)) * (e.enraged ? 1.4 : 1) * dt;
      const gi = e.nodes['img/ball_group'];
      if (gi != null && !e.deathDone) e.R.ov[gi] = Object.assign(e.R.ov[gi] || {}, { r: e.orbA });
      if (!e.atk && e.form && !e.deathDone) form(e, 0), e.form = 0;
    },
    // Nổi giận: đổi sang thân/vòng giận (angry_body boss30_super, angry_circle boss30_enhance_ring) [ĐO trường]
    enrage(G, e) {
      const b = e.nodes['img/body'], c = e.nodes['img/circle'];
      if (b != null) e.R.ov[b] = { f: 'boss30_super' };
      if (c != null) e.R.ov[c] = { f: 'boss30_enhance_ring' };
    },
    dead(G, e) { const b = e.nodes['img/body']; if (b != null) e.R.ov[b] = { f: 'boss30_die' }; },   // body_dead [ĐO trường]
    // 5 bi là prefab boss30_c riêng (sprite boss30_5 [ĐO]; nổi giận boss30_7 [ĐO angry_child1]): vẽ tại các nút b1..b5
    drawOver(ctx, G, e) {
      if (e.deathDone) return;
      const fn = frameOf(e.enraged ? 'boss30_7' : 'boss30_5') || frameOf('boss30_5'), f = fn && window.SK_ATLAS.f[fn], img = f && SK.pages[f[0]];
      if (!img) return;
      orbs(e).forEach(([x, y]) => ctx.drawImage(img, f[1], f[2], f[3], f[4], Math.round(x - f[5]), Math.round(y - f[6]), f[3], f[4]));
    }
  };
  SK.bossRegister('boss30', def);
})();
