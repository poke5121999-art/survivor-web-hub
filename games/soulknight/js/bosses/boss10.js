// Trùm boss10 — Cua Pha Lê (Giant Crystal Crab) và biến thể boss10_2 — Cua Hoàng Kim, Băng Nguyên tầng 1 (ải 1-5).
// Máu 400 × 1.2 = 480; boss10_2 480 × 1.2 = 576 [ĐO enemies.Hp]. Controller có atk1, atk2, atk4, atk5; atk3 dài 0 s (clip rỗng) nên không dùng [ĐO].
// Nguồn: sự kiện InAtkNN [ĐO], MB BossAI10/BossAI10_2 bullet01..05 [ĐO], prefab đạn [ĐO]. Ghép đòn↔đạn theo thứ tự bullet01..05 [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, BUL, fire, blast, aimAt, point, sfx } = K;

  // Gai mọc từ sàn (explode_ice2 / explode_lava2): vòng báo 0.6 s [ƯỚC LƯỢNG] rồi nổ; sát thương lấy ExplodeLcicle.damage [ĐO 4 băng / 2 lửa];
  // bán kính 16 px (cir r 1) [ƯỚC LƯỢNG đơn vị]
  function spike(G, e, x, y, name) {
    const dmg = BUL[name].mbs.ExplodeLcicle.damage, col = name === 'explode_ice2' ? '#9fe8ff' : '#ffb347';
    e.arena.objs.push({ t: 0, dur: 0.6,
      update(G2, o) {
        if (e.deathDone) return false;
        if (o.t < o.dur) return true;
        blast(G2, x, y, 16, dmg, name); G2.shake = Math.max(G2.shake, 1.5);
        return false;
      },
      ground(ctx, G2, o) {
        const k = o.t / o.dur;
        ctx.save(); ctx.globalAlpha = 0.3 + 0.4 * k; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y + 2, 16 * (0.4 + 0.6 * k), 8 * (0.4 + 0.6 * k), 0, 0, TAU); ctx.stroke(); ctx.restore();
      } });
  }

  function make(lava) {
    const ICE = lava ? 'explode_lava2' : 'explode_ice2';
    const claw = e => point(e, SK.chance(0.5) ? 'img/h1' : 'img/h2');
    return {
      atks: ['atk1', 'atk2', 'atk4', 'atk5'], idle: 'ide', run: 'run', firstCd: 0.8, enrageCd: 0.65,
      ev: {
        // atk1: càng bắn bullet_e_25 (bullet01) như súng shotgun [ĐO boss_clip fx_shotgun]: quạt 5 viên cách 12°, nổi giận 7; tốc 9, sát thương 3 [ƯỚC LƯỢNG].
        // Bản vàng clip có 2 sự kiện InAtk02 nên atk2 bắn hai lượt [ĐO]; bản này atk1 chỉ một lượt.
        InAtk01(G, e) {
          const [x, y] = claw(e), a0 = aimAt(G, x, y), n = e.enraged ? 7 : 5;
          for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_25', x, y, a0 + (k - (n - 1) / 2) * 12 * DEG, { spd: 9, dmg: 3, h: e.y - y });
        },
        // atk2: gai băng (bullet02 = explode_ice2; bản vàng explode_lava2 [ĐO]) mọc dưới chân người chơi + 4 điểm quanh (nổi giận 6);
        // bản vàng hai lượt (hai sự kiện InAtk02, tham số 1 là lượt hai [ĐO]): lượt hai mọc quanh vị trí mới
        InAtk02(G, e, arg) {
          const p = G.player, n = e.enraged ? 6 : 4;
          if (!arg || !lava) {
            const [x, y] = K.clampRoom(e, p.x, p.y);
            spike(G, e, x, y, ICE);
          }
          const a0 = SK.rand() * TAU;
          for (let k = 0; k < n; k++) {
            const d = SK.randf(26, 56), [x, y] = K.clampRoom(e, p.x + Math.cos(a0 + k * TAU / n) * d, p.y + Math.sin(a0 + k * TAU / n) * d * 0.7);
            spike(G, e, x, y, ICE);
          }
        },
        // atk4: bullet_e_19 (bullet03) chậm tốc 4 [ĐO RGSBullet02 speed 4], 3 quả; sau 0.9 s [ƯỚC LƯỢNG] nổ ra count 9 bullet_e_1 cách 20°
        // tốc 4 sát thương 3 [ĐO RGSBullet02 count 9 angle 20 child_bullet_speed 4 child_bullet_damage 3]
        InAtk04(G, e) {
          const [x, y] = claw(e), a0 = aimAt(G, x, y), S = BUL.bullet_e_19.mbs.RGSBullet02;
          for (let k = -1; k <= 1; k++) {
            const b = fire(G, e, 'bullet_e_19', x, y, a0 + k * 35 * DEG, { spd: S.speed, dmg: 3, h: e.y - y });
            if (!b) continue;
            b.sprite = 'bullet_37'; b.r = 5;
            b.tick = (G2, bb) => {
              if (bb.age < 0.9 || bb.divided) return;
              bb.divided = true; bb.dead = true;
              for (let j = 0; j < S.count; j++) fire(G2, e, 'bullet_e_1', bb.x, bb.y, bb.dir + (j - (S.count - 1) / 2) * S.angle * DEG, { spd: S.child_bullet_speed, dmg: S.child_bullet_damage, h: bb.h });
            };
          }
        },
        // atk5: vòng đạn nảy tường bullet_e_40 (bullet04; Bullet01 can_rebound 1 [ĐO], tiếng fx_rebound [ĐO boss_clip]) 10 viên, nổi giận 14, nảy 2 lần [ƯỚC LƯỢNG];
        // bản vàng thêm vệt lửa bullet_e_some_lava (bullet05): mỗi 0.2 s để lại explode_lava2 [ĐO RGBTDelayCreate delay 0.2, ExplodeLcicle damage 2]
        InAtk05(G, e) {
          const n = e.enraged ? 14 : 10, a0 = SK.rand() * TAU;
          for (let k = 0; k < n; k++) {
            const b = fire(G, e, 'bullet_e_40', e.x, e.y - 12, a0 + k * TAU / n, { spd: 6, dmg: 3, h: 12, bounce: 2 });
            if (b && lava && k % 3 === 0) {
              const dmg = BUL.explode_lava2.mbs.ExplodeLcicle.damage;
              let nx = 0.2;
              b.tick = (G2, bb) => { while (bb.age >= nx) { nx += 0.2; blast(G2, bb.x, bb.y + bb.h - 4, 14, dmg, 'explode_lava2'); } };
            }
          }
          sfx(G, 'AudioClip:fx_rebound');
        }
      }
    };
  }
  SK.bossRegister('boss10', make(false));
  SK.bossRegister('boss10_2', make(true));
})();
