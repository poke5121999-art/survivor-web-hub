// Trùm boss13 — Vua Người Tuyết (Snowman King), Băng Nguyên tầng 1 (ải 1-5). Máu 400 × 1.2 = 480 [ĐO enemies.Hp].
// Nguồn: state atk1..atk5 + sự kiện (InAtk02 có tham số 1 = tay trái, không tham số = tay phải) [ĐO], MB BossAI13 bullet01..05
// (bullet03_angry, bullet04_snowman) [ĐO], prefab đạn [ĐO]. Ghép đòn↔đạn theo thứ tự bullet01..05 [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, BUL, B86, fire, blast, aimAt, point, bossProp, sfx } = K;
  const W = SK.world;
  const GUN = ['img/h1/gun_point', 'img/h2/gun_point'];   // [ĐO prefab] h1 = tay phải, h2 = tay trái
  const gun = (e, left) => point(e, GUN[left ? 1 : 0]);

  // bullet_nofollow_ice_e: viên băng bay thẳng, mỗi 0.06 s để lại explode_ice3 sát thương 3 [ĐO RGBTDelayCreate delay 0.06, ExplodeLcicle];
  // bán kính 11 px (cir r 0.7) [ƯỚC LƯỢNG đơn vị]; tốc 10 [ĐO Bullet01]; sống rút còn 1.6 s thay vì destroy_time 5 [ƯỚC LƯỢNG, tránh vệt xuyên cả phòng]
  function iceTrail(G, e, x, y, ang) {
    const dl = BUL.bullet_nofollow_ice_e.mbs.RGBTDelayCreate.delay, dmg = BUL.explode_ice3.mbs.ExplodeLcicle.damage;
    let nx = dl;
    const b = fire(G, e, 'bullet_nofollow_ice_e', x, y, ang, { dmg: 3, h: e.y - y, life: 1.6 });
    if (!b) return;
    b.sprite = 'bullet2_8';
    b.tick = (G2, bb) => { while (bb.age >= nx) { nx += dl; blast(G2, bb.x, bb.y + bb.h - 4, 11, dmg, 'explode_ice3'); } };
  }
  // Điểm báo rồi mới nổ effect_shock3 (sát thương 4, scaleFactor 2 [ĐO ExplodeEnergy]); trễ 0.5 s [ƯỚC LƯỢNG]
  function shockBomb(G, e, x, y) {
    const X = BUL.effect_shock3.mbs.ExplodeEnergy;
    e.arena.objs.push({ t: 0, dur: 0.5,
      update(G2, o) {
        if (e.deathDone) return false;
        if (o.t < o.dur) return true;
        blast(G2, x, y, 24, X.damage, 'effect_shock3'); sfx(G2, X.audio_clip); G2.shake = Math.max(G2.shake, 2);
        return false;
      },
      ground(ctx, G2, o) {
        const k = Math.min(1, o.t / o.dur);
        ctx.save(); ctx.globalAlpha = 0.35 + 0.35 * k; ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y + 2, 24 * (0.4 + 0.6 * k), 12 * (0.4 + 0.6 * k), 0, 0, TAU); ctx.stroke(); ctx.restore();
      } });
  }
  // e_snowman_temp: người tuyết nhỏ máu 9, chạy tới người chơi, sau later_time 1.5 s thì tung đòn yeti01_atk (OnAtk ở 0.5 s) [ĐO prefab/MB]
  function snowman(G, e) {
    const ent = BUL.e_snowman_temp, mb = ent.mbs.EnemyAI10, sp = (ent.mbs.RoleAttribute.speed || 6) * U * 0.55;
    const alive = G.enemies.filter(m => m.boss === e && m.st !== 'dead').length;
    if (alive >= 3) return;   // giới hạn 3 con cùng lúc [ƯỚC LƯỢNG]
    const a = SK.rand() * TAU, [x, y] = SK.freeNear([e.x + Math.cos(a) * 28, e.y + Math.sin(a) * 18]);
    let atk = false;
    bossProp(G, e, null, x, y, { rig: ent.rig, state: 'run', hp: ent.mbs.RoleAttribute.max_hp, life: (mb.later_time || 1.5) + 1.2,
      hb: { size: [16, 16], off: [0, 8] },
      tick(G2, pr, dt, ob) {
        if (ob.t >= (mb.later_time || 1.5) && !atk) { atk = true; K.rigPlay(pr.R, 'yeti01_atk'); }
        if (atk) return;
        const p = G2.player, d = Math.hypot(p.x - pr.x, p.y - pr.y) || 1;
        const nx = pr.x + (p.x - pr.x) / d * sp * dt, ny = pr.y + (p.y - pr.y) / d * sp * dt;
        if (!W.solidAt(G2.map, nx, ny)) { pr.x = nx; pr.y = ny; }
        pr.face = p.x > pr.x ? 1 : -1;
      },
      onEv(G2, pr, fn) { if (fn === 'OnAtk') blast(G2, pr.x, pr.y - 6, 20, BUL.effect_shock1.mbs.ExplodeEnergy.damage, 'effect_shock3'); } });
  }

  SK.bossRegister('boss13', {
    atks: ['atk1', 'atk2', 'atk3', 'atk4', 'atk5'], idle: 'ide', run: 'run', firstCd: 0.8, enrageCd: 0.65,
    ev: {
      // atk1: bắn vệt băng (bullet01) 1 đường, nổi giận 3 đường cách 20° [ƯỚC LƯỢNG]
      InAtk01(G, e) {
        const [x, y] = gun(e, false), a0 = aimAt(G, x, y), n = e.enraged ? 3 : 1;
        for (let k = 0; k < n; k++) iceTrail(G, e, x, y, a0 + (k - (n - 1) / 2) * 20 * DEG);
      },
      // atk2: 4 phát luân phiên hai tay (tham số 1 = trái, rỗng = phải) [ĐO sự kiện]; bullet_e_42_less vỡ 5 viên cách 36° khi chạm
      // [ĐO RGBTDivision count 5 angle 36]; tốc 8, sát thương 3 [ƯỚC LƯỢNG]
      InAtk02(G, e, arg) {
        const [x, y] = gun(e, arg === 1), a = aimAt(G, x, y);
        fire(G, e, 'bullet_e_42_less', x, y, a, { spd: 8, dmg: 3, h: e.y - y });
      },
      // atk3: bullet_e_25 (nổi giận bullet_e_40 [ĐO bullet03_angry]) quạt 5 viên cách 14°, nổi giận 7; tốc 10 [ĐO Bullet01]; sát thương 3 [ƯỚC LƯỢNG]
      InAtk03(G, e) {
        const [x, y] = gun(e, SK.chance(0.5)), a0 = aimAt(G, x, y), n = e.enraged ? 7 : 5, nm = e.enraged ? 'bullet_e_40' : 'bullet_e_25';
        for (let k = 0; k < n; k++) fire(G, e, nm, x, y, a0 + (k - (n - 1) / 2) * 14 * DEG, { spd: 10, dmg: 3, h: e.y - y });
      },
      // atk4: clip lặp 0.409 s, InAtk04 mỗi vòng [ĐO]: mỗi vòng một quả sốc effect_shock3 (bullet04) ở chỗ người chơi / gần đó, vòng 1 và 4 triệu hồi
      // người tuyết (bullet04_snowman); 8 vòng (nổi giận 10) rồi nghỉ [ƯỚC LƯỢNG số vòng]
      InAtk04(G, e) {
        e.n4 = (e.n4 || 0) + 1;
        const p = G.player, j = e.n4 === 1 ? 0 : 26;
        const [x, y] = K.clampRoom(e, p.x + SK.randf(-j, j), p.y + SK.randf(-j, j) * 0.6);
        shockBomb(G, e, x, y);
        if (e.n4 === 1 || e.n4 === 4) snowman(G, e);
        if (e.n4 >= (e.enraged ? 10 : 8)) { e.n4 = 0; e.atkEnd = true; }
      },
      // atk5: xoáy đạn băng bullet_e_41 (bullet05, buff băng) trong 1.5 s, hai tia đối nhau xoay 5 rad/s; tốc 6, sát thương 2 [ƯỚC LƯỢNG]
      InAtk05(G, e) {
        let cd = 0, base = SK.rand() * TAU;
        e.arena.objs.push({ t: 0, dur: 1.4, update(G2, o, dt) {
          if (e.deathDone) return false;
          base += 5 * dt; cd -= dt;
          if (cd <= 0) {
            cd = e.enraged ? 0.07 : 0.1;
            for (let k = 0; k < (e.enraged ? 3 : 2); k++) fire(G2, e, 'bullet_e_41', e.x, e.y - 14, base + k * TAU / (e.enraged ? 3 : 2), { spd: 6, dmg: 2, h: 14 });
          }
          return o.t < o.dur;
        } });
      }
    },
    start: { atk4(G, e) { e.n4 = 0; } }
  });
  void B86;
})();
