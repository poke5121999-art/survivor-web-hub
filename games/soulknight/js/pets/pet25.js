// Thú cưng pet25 (Blarney): "Đất Khô" — chỗ nó đứng lại một lúc thì bốc cháy.
// [LOC pet_25_skill_0_desc] "Nơi mà Blarney dừng lại một thời gian sẽ bốc cháy"; sát thương mỗi nhịp = [ĐO ctl.damage] 3.
// Còn lại [ƯỚC LƯỢNG]: đứng yên 2 s thì châm lửa, lửa bán kính 2,2 đv cháy 4 s, mỗi 0,5 s gây sát thương cho quái trong vùng.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, STAY = 2, LIFE = 4, TICK = 0.5, RAD = 2.2 * U;

  function ignite(G, a) {
    a.fires = (a.fires || 0) + 1;
    const f = { x: a.x, y: a.y, t: 0, tk: 0, fire: true, pet: null,
      update(G2, q, dt) {
        q.t += dt; q.tk -= dt;
        if (q.t >= LIFE) { q.gone = true; return; }
        if (q.tk <= 0) {
          q.tk = TICK;
          for (const e of G2.enemies) {
            if (e.st === 'spawn' || e.st === 'dead') continue;
            if (Math.hypot(e.x - q.x, (e.y - q.y) * 1.6) < RAD) { SK.hurtEnemy(G2, e, a.k.dmg, false, Math.atan2(e.y - q.y, e.x - q.x), 0); a.fireHits = (a.fireHits || 0) + 1; }
          }
        }
      },
      draw(ctx, G2, q) {
        const k = 1 - q.t / LIFE, n = 7;
        ctx.save();
        ctx.fillStyle = 'rgba(255,120,30,' + (0.18 * k) + ')';
        ctx.beginPath(); ctx.ellipse(q.x, q.y, RAD, RAD * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < n; i++) {
          const ang = i / n * Math.PI * 2 + i, r = RAD * 0.7 * ((i % 3) / 3 + 0.25);
          const fx = q.x + Math.cos(ang) * r, fy = q.y + Math.sin(ang) * r * 0.5;
          const h = (5 + 4 * Math.sin(q.t * 11 + i * 2)) * (0.4 + 0.6 * k);
          ctx.fillStyle = i % 2 ? '#ffb02e' : '#ff5a1e';
          ctx.beginPath(); ctx.moveTo(fx - 2.5, fy); ctx.quadraticCurveTo(fx, fy - h * 1.2, fx + 2.5, fy); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      } };
    G.props.push(f);
    return f;
  }

  SK.petRegister('pet25', {
    init(G, a) { a.stay = 0; a.lx = a.x; a.ly = a.y; a.fires = 0; a.fireHits = 0; },
    tick(G, a, dt) {
      if (Math.hypot(a.x - a.lx, a.y - a.ly) < 0.3) a.stay += dt; else a.stay = 0;
      a.lx = a.x; a.ly = a.y;
      if (a.stay >= STAY) { a.stay = 0; ignite(G, a); }
      return false;
    }
  });
})();
