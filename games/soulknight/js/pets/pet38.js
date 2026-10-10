// Thú cưng pet38 (Sacasaca): "Torpedo" — va vào kẻ địch với tốc độ như Torpedo và phản đòn 3 lần [LOC pet_38_skill_0_desc].
// Mỗi 15 s [WIKI Pets] (trước đây 6 s ước lượng) nếu có quái trong 9 đv thì lao tới 22 đv/s; mỗi cú va gây skillDamage 5 [ĐO Pet38Controller.skillDamage],
// bật ngược rồi lao sang quái gần nhất khác (không có thì bật phản xạ ngược lại). Tổng 1 cú va đầu + 3 lần phản đòn = 4 cú
// [LOC: cách đếm ƯỚC LƯỢNG], tối đa 3 s. Không cắn thường (atk 0 [ĐO RoleAttributePet]).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world;
  const RANGE = 9 * U, SPD = 22 * U, T_MAX = 3, CD = 15, HIT_R = 10, REB = 3;

  function pick(G, a, skip, range) {
    let best = null, bd = range;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead' || e === skip) continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd) { best = e; bd = d; }
    }
    return best;
  }

  SK.petRegister('pet38', {
    init(G, a) {
      const m = ((a.parts[0] || {}).mbs || {}).Pet38Controller || {};
      a.skillDmg = m.skillDamage || 5; a.tT = 0; a.tCd = 2; a.imp = 0; a.runs = 0; a.hits = 0; a.tg = null; a.last = null;
    },
    bite() { return 0; },
    tick(G, a, dt) {
      const p = G.player;
      a.target = null;
      if (!p || p.st === 'dead') return false;
      if (a.tT > 0) {
        a.tT -= dt; a.stT += dt; a.st = 'run';
        if (a.rebT > 0) {                       // đang bật ngược
          a.rebT -= dt;
          SK.moveBox(G.map, a, -Math.cos(a.ang) * SPD * 0.4 * dt, -Math.sin(a.ang) * SPD * 0.4 * dt, 3);
          if (a.rebT <= 0) {
            const nx = pick(G, a, a.last, RANGE) || (a.last && a.last.st !== 'dead' ? a.last : null);
            if (nx) { a.tg = nx; a.ang = Math.atan2(nx.y - a.y, nx.x - a.x); }
            else a.ang += Math.PI;
          }
        } else {
          if (a.tg && a.tg.st !== 'dead') a.ang = Math.atan2(a.tg.y - a.y, a.tg.x - a.x);
          const x0 = a.x, y0 = a.y;
          SK.moveBox(G.map, a, Math.cos(a.ang) * SPD * dt, Math.sin(a.ang) * SPD * dt, 3);
          const stuck = Math.abs(a.x - x0) + Math.abs(a.y - y0) < 0.2;
          a.face = Math.cos(a.ang) >= 0 ? 1 : -1;
          const e = pick(G, a, null, HIT_R + 6);
          if (e && Math.hypot(e.x - a.x, e.y - a.y) <= HIT_R + (e.r || 0)) {
            if (SK.hurtEnemy(G, e, a.skillDmg, false, a.ang, 3)) a.hits++;
            a.imp++; a.last = e; a.tg = null; G.shake = Math.max(G.shake, 1);
            if (a.imp > REB) a.tT = 0; else a.rebT = 0.2;
          } else if (stuck) { a.tT = 0; }   // đâm vào tường/vật cản: dừng lượt lao
        }
        if (a.tT <= 0) { a.st = 'ide'; a.stT = 0; a.tCd = a.imp ? CD : 1.5; a.cd = 1; }
        return true;
      }
      a.tCd -= dt;
      if (a.tCd <= 0) {
        const e = pick(G, a, null, RANGE);
        if (e && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) {
          a.tg = e; a.ang = Math.atan2(e.y - a.y, e.x - a.x); a.tT = T_MAX; a.rebT = 0; a.imp = 0; a.last = null; a.runs++;
          return true;
        }
        a.tCd = 0.3;
      }
      return false;
    }
  });
})();
