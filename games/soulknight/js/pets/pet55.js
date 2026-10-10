// Thú cưng pet55 (Cơ Giáp Chilly), kỹ năng "Cơ Giáp Hợp Thể" [LOC pet_55_skill_0_desc]: hợp thể với cơ giáp, tăng mạnh tốc độ, sát
// thương và kích thước. Con số [ĐO Pet55Controller]: sát thương 5 (baseDamage), tốc 8 (baseSpeed), tầm dò xung phong 10 đv
// (chargeSearchRange), tốc xung phong ×2,2 (chargeSpeedFactor), hồi trúng 0,2 s (chargeHitCooldown) / cùng mục tiêu 0,25 s, chạy tiếp
// 0,25 s sau trúng (postHitRunDuration), nghỉ 0,35 s cuối đợt (attackRoundEndWaitDuration), hất lùi 3 (chargeRepel); hợp thể: thân ×1,4
// (skillScaleFactor), tốc ×1,35, sát thương ×1,5, tầm trúng ×1,35, nghỉ giữa các lần xung phong 0,08 s (skillChargeInterval).
// [ƯỚC LƯỢNG]: hợp thể 8 s, hồi 40 s [WIKI Pets], nghỉ giữa các đợt thường = atk_cd (2 s). Cắn mặc định được thay bằng xung phong.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world, DUR = 8, CD = 40;

  const alive = e => e.st !== 'spawn' && e.st !== 'dead';
  function fuse(G, a, on) {
    const c = a.info.ctl;
    a.fuse = on ? DUR : 0; a.scale = on ? c.skillScaleFactor : undefined;
    a.k.spd = a.base.spd * (on ? c.skillSpeedFactor : 1);
    a.dmg = a.base.dmg * (on ? c.skillDamageFactor : 1);
    a.hitR = 8 * (on ? c.skillHitRangeFactor : 1);
    if (on) a.fuses++; else a.fCd = CD;
  }

  SK.petRegister('pet55', {
    init(G, a) {
      const c = a.info.ctl;
      a.base = { spd: a.k.spd, dmg: c.baseDamage || 5 }; a.fuse = 0; a.fCd = 5; a.fuses = 0; a.chg = 0; a.hitsDone = 0;
      a.mode = 'free'; a.wait = 0; a.dirX = 1; a.dirY = 0; a.tgt = null; a.hitCd = new Map();
      fuse(G, a, false); a.fCd = 5;
    },
    stage(G, a) { if (a.fuse > 0) fuse(G, a, false); a.mode = 'free'; a.wait = 0; },
    tick(G, a, dt) {
      const p = G.player, c = a.info.ctl;
      if (!p || p.st === 'dead') return false;
      a.stT += dt;
      if (a.fuse > 0) { a.fuse -= dt; if (a.fuse <= 0) fuse(G, a, false); } else a.fCd -= dt;
      for (const [q, t] of Array.from(a.hitCd)) { if (t - dt <= 0) a.hitCd.delete(q); else a.hitCd.set(q, t - dt); }
      if (Math.hypot(p.x - a.x, p.y - a.y) > a.k.far * 0.5) { a.mode = 'free'; return false; }
      const range = (a.fuse > 0 ? c.skillChargeSearchRange : c.chargeSearchRange) * U;
      if (a.mode === 'wait') { a.wait -= dt; if (a.st !== 'ide') { a.st = 'ide'; a.stT = 0; } if (a.wait <= 0) a.mode = 'free'; return true; }
      if (a.mode === 'free') {
        a.cd -= dt;
        let best = null, bd = range;
        for (const e of G.enemies) {
          if (!alive(e)) continue;
          const d = Math.hypot(e.x - a.x, e.y - a.y);
          if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
        }
        if (!best) return false;
        if (a.cd > 0) return false;
        if (a.fuse <= 0 && a.fCd <= 0) { fuse(G, a, true); SK.num(G, a.x, a.y - 34, 'Hợp thể!', '#6ac8ff'); }
        a.mode = 'charge'; a.tgt = best; a.chg++; a.hitAny = false; a.post = 0;
        a.st = 'atk'; a.stT = 0;
      }
      // mode 'charge': lao vào mục tiêu, trúng thì chạy tiếp postHitRunDuration rồi nghỉ
      const spd = a.k.spd * c.chargeSpeedFactor;
      const e = a.tgt;
      if (a.post <= 0) {
        if (!e || !alive(e)) { a.mode = 'wait'; a.wait = 0.1; return true; }
        const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
        a.dirX = dx / d; a.dirY = dy / d; a.face = dx >= 0 ? 1 : -1;
      } else { a.post -= dt; if (a.post <= 0) { a.mode = 'wait'; a.wait = c.attackRoundEndWaitDuration; a.cd = a.fuse > 0 ? c.skillChargeInterval : a.k.cd; return true; } }
      const ox = a.x, oy = a.y;
      SK.moveBox(G.map, a, a.dirX * spd * dt, a.dirY * spd * dt, 3);
      if (Math.hypot(a.x - ox, a.y - oy) < spd * dt * 0.3 && a.post <= 0) { a.mode = 'wait'; a.wait = 0.2; a.cd = a.k.cd; return true; }   // kẹt tường
      for (const q of G.enemies) {
        if (!alive(q) || a.hitCd.has(q)) continue;
        if (Math.hypot(q.x - a.x, q.y - a.y) > (q.r || 6) + a.hitR) continue;
        a.hitCd.set(q, c.sameTargetHitCooldown);
        if (SK.hurtEnemy(G, q, a.dmg, false, Math.atan2(a.dirY, a.dirX), c.chargeRepel)) { a.hitsDone++; a.hitAny = true; }
        if (a.post <= 0) a.post = c.postHitRunDuration;
      }
      return true;
    },
    draw(ctx, G, a) {
      if (a.fuse <= 0) return;
      ctx.save(); ctx.strokeStyle = 'rgba(106,200,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(a.x, a.y - 10, 14 * a.scale, 15 * a.scale, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
  });
})();
