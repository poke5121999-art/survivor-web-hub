// Trùm boss09 — Vua Vượn Núi Tuyết (King Snow Ape), Băng Nguyên tầng 1 (ải 1-5). Máu 450 × 1.2 = 540 [ĐO enemies.Hp].
// Nguồn: state atk1..atk5 + sự kiện InAtk0N của Animator [ĐO], MB BossAI09 bullet01..06 [ĐO], prefab đạn trong SK_BOSSES86.bullets [ĐO].
// Logic đòn gốc nằm trong IL2CPP: ghép đòn↔đạn theo thứ tự bullet01..06 [ƯỚC LƯỢNG], con số lấy từ prefab đạn khi có.
(function () {
  'use strict';
  const SK = window.SK, K = SK && SK.BOSS_KIT;
  if (!K) return;
  const { TAU, DEG, U, BUL, fire, blast, aimAt, point, sfx } = K;
  const W = SK.world;

  // bullet_e_shock: viên vô hình bay thẳng, mỗi 0.2 s để lại effect_shock1 [ĐO RGBTDelayCreate delay 0.2, speed 10];
  // effect_shock1 sát thương 3 [ĐO ExplodeEnergy]; bán kính nổ 14 px [ƯỚC LƯỢNG]
  function shockLine(G, e, x, y, ang) {
    const dc = (BUL.bullet_e_shock.mbs.RGBTDelayCreate || {}).delay || 0.2;
    const sp = (BUL.bullet_e_shock.mbs.Bullet01.speed || 10) * U, c = Math.cos(ang), s = Math.sin(ang);
    let next = 0;
    e.arena.objs.push({ t: 0, dur: 5, update(G2, o) {
      if (e.deathDone) return false;
      while (o.t >= next) {
        const d = next * sp; next += dc;
        const px = x + c * d, py = y + s * d;
        if (W.solidAt(G2.map, px, py)) return false;
        blast(G2, px, py, 14, BUL.effect_shock1.mbs.ExplodeEnergy.damage, 'effect_shock1');
      }
      return o.t < o.dur;
    } });
  }
  // bullet_follow_ice_boss09: bay đuổi (Bullet02 interval 0.2, angle_speed 15°, limit 8 s) [ĐO], để lại explode_ice4 mỗi 0.2 s
  // (RGBTDelayCreate delay 0.2), nổ sát thương 4 [ĐO ExplodeLcicle]; bán kính 11 px [ƯỚC LƯỢNG theo collider cir r 0.7]
  function iceHoming(G, e, x, y, ang) {
    const dl = BUL.bullet_follow_ice_boss09.mbs.RGBTDelayCreate.delay, dmg = BUL.explode_ice4.mbs.ExplodeLcicle.damage;
    let nx = dl;
    const b = fire(G, e, 'bullet_follow_ice_boss09', x, y, ang, { dmg: 3, h: e.y - y, life: 8 });
    if (!b) return;
    b.sprite = 'bullet2_91';
    const hom = b.tick;
    b.tick = (G2, bb, dt) => {
      if (hom) hom(G2, bb, dt);
      while (bb.age >= nx) { nx += dl; blast(G2, bb.x, bb.y + bb.h - 4, 11, dmg, 'explode_ice4'); }
    };
  }
  const hand = e => point(e, SK.chance(0.5) ? 'img/h1' : 'img/h2');

  SK.bossRegister('boss09', {
    atks: ['atk1', 'atk2', 'atk3', 'atk4', 'atk5'], idle: 'ide', run: 'run', firstCd: 0.8, enrageCd: 0.65,
    ev: {
      // atk1: đấm xuống đất, sóng chấn động bay thẳng theo 3 đường (nổi giận 5) cách 22° [WIKI]/[ƯỚC LƯỢNG số đường]
      InAtk01(G, e) {
        const n = e.enraged ? 5 : 3, a0 = aimAt(G, e.x, e.y - 8);
        for (let k = 0; k < n; k++) shockLine(G, e, e.x, e.y - 4, a0 + (k - (n - 1) / 2) * 22 * DEG);
        G.shake = Math.max(G.shake, 3);
      },
      // atk2: ném băng đuổi (bullet02) — 2 viên lệch ±15°, nổi giận 4 viên [ƯỚC LƯỢNG số viên]
      InAtk02(G, e) {
        const [x, y] = hand(e), a0 = aimAt(G, x, y), n = e.enraged ? 4 : 2;
        for (let k = 0; k < n; k++) iceHoming(G, e, x, y, a0 + (k - (n - 1) / 2) * 30 * DEG);
      },
      // atk3: quạt bullet_e_28 (bullet03, xoay 6° mỗi khung) 5 viên cách 18°, nổi giận 7 [ƯỚC LƯỢNG]; tốc 7, sát thương 3 [ƯỚC LƯỢNG]
      InAtk03(G, e) {
        const [x, y] = hand(e), a0 = aimAt(G, x, y), n = e.enraged ? 7 : 5;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_28', x, y, a0 + (k - (n - 1) / 2) * 18 * DEG, { spd: 7, dmg: 3, h: e.y - y });
      },
      // atk4: dậm mạnh — effect_shock2 sát thương 6, scaleFactor 2 [ĐO ExplodeEnergy] (bán kính 32 px [ƯỚC LƯỢNG])
      // rồi vòng 8 bullet_e_41 (bullet06, buff băng) [ĐO bullet06]; tốc 6, sát thương 2 [ƯỚC LƯỢNG]
      InAtk04(G, e) {
        blast(G, e.x, e.y - 4, 32, BUL.effect_shock2.mbs.ExplodeEnergy.damage, 'effect_shock2');
        sfx(G, BUL.effect_shock2.mbs.ExplodeEnergy.audio_clip);
        G.shake = Math.max(G.shake, 5);
        const a0 = SK.rand() * TAU, n = e.enraged ? 12 : 8;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_41', e.x, e.y - 8, a0 + k * TAU / n, { spd: 6, dmg: 2, h: 8 });
      },
      // atk5: bullet_e_42 (bullet05) bay thẳng, chạm thì vỡ 6 viên bullet_e_41 cách 30° [ĐO RGBTDivision count 6 angle 30]; tốc 8 [ƯỚC LƯỢNG]
      InAtk05(G, e) {
        const [x, y] = hand(e), a0 = aimAt(G, x, y), n = e.enraged ? 3 : 1;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_42', x, y, a0 + (k - (n - 1) / 2) * 25 * DEG, { spd: 8, dmg: 3, h: e.y - y });
      }
    }
  });
})();
