// Thú cưng pet37 (Xông Lên / Quacky): "Giữ nguyên đội hình" — Quacky cùng đàn vịt con xếp hàng xông vào kẻ địch gần nhất
// [LOC pet_37_skill_0_desc]. Đàn vịt con (maxDuckOfRoom 5 [ĐO Pet37Controller.maxDuckOfRoom]) nối đuôi sau Quacky, vẽ bằng
// chính prefab pet37 thu nhỏ. Mỗi 7 s [ƯỚC LƯỢNG] nếu có quái trong 10 đv thì cả hàng lao tới ở 16 đv/s, mỗi con (kể cả Quacky)
// gây damage 3 [ĐO ctl.damage] một lần lên mỗi quái chạm phải; kết thúc khi qua quái hoặc sau 1,6 s rồi hàng về lại bên chủ.
// Không cắn thường (atk 0 [ĐO RoleAttributePet]).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world;
  const RANGE = 10 * U, SPD = 16 * U, GAP = 9, T_MAX = 1.6, HIT_R = 11, CD = 7;

  SK.petRegister('pet37', {
    init(G, a) {
      const m = ((a.parts[0] || {}).mbs || {}).Pet37Controller || {};
      a.nDuck = m.maxDuckOfRoom || 5; a.dmg = a.k.dmg;
      a.ducks = []; for (let i = 0; i < a.nDuck; i++) a.ducks.push({ x: a.x - (i + 1) * GAP, y: a.y, face: 1, hit: new Set() });
      a.chT = 0; a.chCd = 2; a.charges = 0; a.duckHits = 0; a.leadHit = new Set();
    },
    bite() { return 0; },
    tick(G, a, dt) {
      const p = G.player;
      a.target = null;
      const chain = [a].concat(a.ducks);
      if (p && p.st !== 'dead') {
        if (a.chT > 0) {
          a.chT -= dt; a.stT += dt; a.st = 'run';
          const dx = Math.cos(a.cAng) * SPD * dt, dy = Math.sin(a.cAng) * SPD * dt;
          const x0 = a.x, y0 = a.y; SK.moveBox(G.map, a, dx, dy, 3);
          if (Math.abs(a.x - x0) + Math.abs(a.y - y0) < 0.2) a.chT = 0;
          for (const u of chain) {
            const hs = u === a ? a.leadHit : u.hit;
            for (const e of G.enemies) {
              if (e.st === 'spawn' || e.st === 'dead' || hs.has(e)) continue;
              if (Math.hypot(e.x - u.x, e.y - u.y) <= HIT_R + (e.r || 0)) {
                hs.add(e); if (SK.hurtEnemy(G, e, a.dmg, false, a.cAng, 2)) a.duckHits++;
              }
            }
          }
          if (a.chT <= 0) { a.st = 'ide'; a.stT = 0; a.chCd = CD; }
        } else {
          a.chCd -= dt;
          if (a.chCd <= 0 && a.st !== 'atk') {
            let best = null, bd = RANGE;
            for (const e of G.enemies) {
              if (e.st === 'spawn' || e.st === 'dead') continue;
              const d = Math.hypot(e.x - a.x, e.y - a.y);
              if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
            }
            if (best) {
              a.cAng = Math.atan2(best.y - a.y, best.x - a.x); a.face = Math.cos(a.cAng) >= 0 ? 1 : -1;
              a.chT = T_MAX; a.charges++; a.leadHit.clear(); for (const d of a.ducks) d.hit.clear();
            } else a.chCd = 0.3;
          }
        }
      }
      // đàn vịt nối đuôi: mỗi con giữ khoảng GAP sau con đứng trước
      let prev = a;
      for (const d of a.ducks) {
        const dx = prev.x - d.x, dy = prev.y - d.y, dist = Math.hypot(dx, dy);
        if (dist > GAP) { const k = (dist - GAP) / dist; d.x += dx * k; d.y += dy * k; }
        if (Math.abs(dx) > 1) d.face = dx > 0 ? 1 : -1;
        prev = d;
      }
      return a.chT > 0;
    },
    draw(ctx, G, a) {
      const st = a.chT > 0 ? 'run' : (Math.hypot(a.ducks[0].x - a.x, a.ducks[0].y - a.y) > GAP + 2 ? 'run' : 'ide');
      for (let i = a.ducks.length - 1; i >= 0; i--) {
        const d = a.ducks[i];
        SK.drawPrefab(ctx, a.parts, d.x, d.y, { state: st, t: a.stT + i * 0.07, flip: d.face < 0, scale: 0.55 });
      }
    }
  });
})();
