// Thú cưng pet34 (Tiêu Đen / Pepper): "Thú Khổng Lồ" — thỉnh thoảng bổ nhào về trước tạo sóng chấn động
// [LOC pet_34_skill_0_desc]. Sóng gây skillDamage 6 [ĐO Pet34Controller.skillDamage] cho quái quanh điểm hạ cánh, đẩy lùi.
// Cứ 5 s (atk_rate 5 [ĐO]; WIKI Pets ghi hồi 7 s, mâu thuẫn nên giữ ĐO) nếu có quái trong 8 đv thì bổ nhào 4 đv trong 0,35 s rồi nổ sóng bán kính 3 đv [ƯỚC LƯỢNG].
// Vẫn cắn thường (damage 3) ở giữa các lần bổ nhào.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world;
  const RANGE = 8 * U, LEAP = 4 * U, T_LEAP = 0.35, RAD = 3 * U, WAVE_T = 0.4;

  SK.petRegister('pet34', {
    init(G, a) {
      const m = ((a.parts[0] || {}).mbs || {}).Pet34Controller || {};
      a.skillDmg = m.skillDamage || 6; a.leapCd = (m.atk_rate || 5); a.leapT = 0; a.waves = 0; a.waveHit = 0; a.wave = null;
    },
    tick(G, a, dt) {
      const p = G.player;
      if (a.wave) { a.wave.t += dt; if (a.wave.t >= WAVE_T) a.wave = null; }
      if (!p || p.st === 'dead') return false;
      if (a.leapT > 0) {
        a.leapT -= dt; a.stT += dt; a.st = 'run';
        SK.moveBox(G.map, a, a.lx * dt / T_LEAP, a.ly * dt / T_LEAP, 3);
        if (a.leapT <= 0) {
          a.wave = { x: a.x, y: a.y, t: 0 }; a.waves++; G.shake = Math.max(G.shake, 2);
          for (const e of G.enemies) {
            if (e.st === 'spawn' || e.st === 'dead') continue;
            if (Math.hypot(e.x - a.x, e.y - a.y) <= RAD) { if (SK.hurtEnemy(G, e, a.skillDmg, false, Math.atan2(e.y - a.y, e.x - a.x), 4)) a.waveHit++; }
          }
          a.st = 'ide'; a.stT = 0; a.cd = 1; a.target = null;
        }
        return true;
      }
      a.leapCd -= dt;
      if (a.leapCd <= 0) {
        let best = null, bd = RANGE;
        for (const e of G.enemies) {
          if (e.st === 'spawn' || e.st === 'dead') continue;
          const d = Math.hypot(e.x - a.x, e.y - a.y);
          if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
        }
        if (best) {
          const d = Math.max(1, bd), L = Math.min(LEAP, d);
          a.lx = (best.x - a.x) / d * L; a.ly = (best.y - a.y) / d * L; a.face = a.lx >= 0 ? 1 : -1;
          a.leapT = T_LEAP; a.leapCd = 5; a.st = 'run'; a.stT = 0;
          return true;
        }
        a.leapCd = 0.3;
      }
      return false;
    },
    draw(ctx, G, a) {
      const w = a.wave; if (!w) return;
      const k = w.t / WAVE_T;
      ctx.save(); ctx.globalAlpha = 0.7 * (1 - k); ctx.strokeStyle = '#ffd37a'; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, RAD * k, RAD * k * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  });
})();
