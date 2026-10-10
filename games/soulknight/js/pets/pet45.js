// Thú cưng pet45 (Mèo Hỏa Lực): kỹ năng "Thời Khắc Hỏa Lực" [LOC pet_45_skill_0_desc]: tăng tốc đánh, tốc chạy và số đạn bắn
// liên tục. [ĐO ctl]: normalNumber 3 viên/loạt, skillNumber 5 viên, SkillAddMoveSpeedRate 1 (+100% tốc chạy), SkillAddAtkSpeed 1
// (+100% tốc đánh), SkillAddPlayerAtkSpeed 0.1 (chủ +10% tốc bắn), damage 3, atk_cd 2. Thú bắn từ xa (atk_mode 1) bằng bullet_0
// [ƯỚC LƯỢNG prefab đạn]; không cắn. Lúc nào vào "thời khắc" (5 s mỗi 60 s [WIKI Pets] khi có quái), nhịp loạt 0,1 s: [ƯỚC LƯỢNG].
// Chưa làm: lùi ra xa quái (back_min 4 / back_max 10, focus_time 0,6); thú vẫn đứng gần chủ như mặc định.
(function () {
  'use strict';
  if (!window.SK || !SK.petRegister) return;
  const U = SK.PPU, RANGE = 10 * U, GAP = 0.1, DUR = 5, EVERY = 60, FAN = 0.1;
  const fighting = G => G.enemies.some(e => e.st !== 'dead' && e.st !== 'spawn');
  function foe(G, a) {
    let best = null, bd = RANGE;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead') continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd && SK.world.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
    }
    return best;
  }
  function endSkill(G, a) {
    if (!a.on) return;
    a.on = false; a.k.spd = a.spd0;
    if (G.player && a.pBoost) { G.player.rateMul = (G.player.rateMul || 1) / 1.1; a.pBoost = false; }
  }

  SK.petRegister('pet45', {
    init(G, a) {
      // Gỡ buff chủ còn dính từ lần trước (đổi thú giữa trận).
      if (G._p45 && G.player) { G.player.rateMul = (G.player.rateMul || 1) / 1.1; } G._p45 = false;
      const c = (a.info && a.info.ctl) || {};
      a.c = { n: c.normalNumber || 3, ns: c.skillNumber || 5, mv: c.SkillAddMoveSpeedRate || 1, as: c.SkillAddAtkSpeed || 1, pas: c.SkillAddPlayerAtkSpeed || 0.1 };
      a.k = Object.assign({}, a.k); a.spd0 = a.k.spd;
      a.on = false; a.skillT = 0; a.skillIn = 3; a.fireCd = 1; a.burst = 0; a.burstT = 0; a.shots = 0; a.volleys = 0;
    },
    tick(G, a, dt) {
      const p = G.player;
      a.target = null;                                  // không đuổi để cắn
      if (a.on) { a.skillT -= dt; if (a.skillT <= 0) { endSkill(G, a); a.skillIn = EVERY; } }
      else if (fighting(G)) {
        a.skillIn -= dt;
        if (a.skillIn <= 0) {
          a.on = true; a.skillT = DUR; a.k.spd = a.spd0 * (1 + a.c.mv);
          if (p) { p.rateMul = (p.rateMul || 1) * (1 + a.c.pas); a.pBoost = true; G._p45 = true; }
          if (SK.num && p) SK.num(G, a.x, a.y - 24, 'Hỏa lực!', '#ffb040');
        }
      }
      const e = foe(G, a);
      if (a.burst > 0) {
        a.burstT -= dt;
        if (a.burstT <= 0) {
          a.burstT = GAP / (a.on ? 1 + a.c.as : 1); a.burst--;
          const tg = a.burstTarget && a.burstTarget.st !== 'dead' ? a.burstTarget : e;
          if (tg) {
            const ang = Math.atan2(tg.y - tg.hb.off[1] * tg.scale - (a.y - 8), tg.x - a.x), i = a.burstIdx++, n = a.burstN;
            SK.spawnBullet86(G, 'p', 'bullet_0', a.x + a.face * 4, a.y - 8, ang + (i - (n - 1) / 2) * FAN, { dmg: a.k.dmg, repel: 1, spd: 16, h: 8, owner: a });
            a.shots++;
          }
        }
      }
      a.fireCd -= dt;
      if (e && a.fireCd <= 0 && a.burst <= 0) {
        a.fireCd = a.k.cd / (a.on ? 1 + a.c.as : 1);
        a.burstN = a.burst = a.on ? a.c.ns : a.c.n; a.burstIdx = 0; a.burstT = 0; a.burstTarget = e; a.volleys++;
        a.face = e.x >= a.x ? 1 : -1; a.st = 'atk'; a.stT = 0; a.bit = true;
      }
      return false;
    },
    stage(G, a) { endSkill(G, a); a.skillIn = 3; }
  });
})();
