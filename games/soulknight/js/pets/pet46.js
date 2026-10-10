// Thú cưng pet46 (Slime Nhỏ): kỹ năng "Lớn hơn, mạnh hơn" [LOC pet_46_skill_0_desc]: biến thành Slime Vừa, mở rộng phạm vi tấn
// công và thiêu đốt địch xung quanh. [ĐO ctl]: damage 5, atk_cd 2, max_follow_distance 14, buffFire (@buff_fire; thông số
// BuffFire của skills.js: 3 sát thương mỗi 0,5 s trong 2 s), attr max_hp 15. Thời điểm biến (sau 2 s ở trong trận), to x1,5,
// HP x2, vùng cắn 3 đv, tầm thiêu đốt 3,5 đv mỗi 1 s: [ƯỚC LƯỢNG]. Biến rồi thì giữ tới hết ván (G._p46med).
(function () {
  'use strict';
  if (!window.SK || !SK.petRegister) return;
  const U = SK.PPU, GROW_AT = 2, SIZE = 1.5, SPLASH = 3 * U, AURA = 3.5 * U, AURA_EVERY = 1;
  const alive = e => e.st !== 'dead' && e.st !== 'spawn';

  function burn(G, e) {
    const db = e._db = e._db || {};
    if (db.fire) return false;
    const f = { t: 2, dmg: 3, every: 0.5, fx: 'buff_fire' };
    db.fire = Object.assign({ tick: f.every, kind: 'fire' }, f);
    if (SK.vfx && SK.vfx.spawn) { try { db.fire.h = SK.vfx.spawn(G, f.fx, e.x, e.y, { follow: e, dy: -(e.hb.off[1] * e.scale), dur: f.t }); } catch (_) {} }
    return true;
  }
  function grow(G, a) {
    a.medium = G._p46med = true; a.scale = SIZE;
    a.hpMax = ((a.info && a.info.attr && a.info.attr.max_hp) || 15) * 2; a.hp = a.hpMax;
    if (SK.vfx && SK.vfx.spawn) { try { SK.vfx.spawn(G, 'smoke', a.x, a.y - 6, { state: 'smoke' }); } catch (_) {} }
  }

  SK.petRegister('pet46', {
    init(G, a) {
      a.hpMax = a.hp = (a.info && a.info.attr && a.info.attr.max_hp) || 15; a.medium = false; a.fight = 0; a.auraT = 0; a.splash = 0; a.burned = 0;
      if (G._p46med) grow(G, a);
    },
    tick(G, a, dt) {
      if (!a.medium) {
        if (G.enemies.some(alive)) { a.fight += dt; if (a.fight >= GROW_AT) grow(G, a); }
        return false;
      }
      a.auraT -= dt;
      if (a.auraT <= 0) {
        a.auraT = AURA_EVERY;
        for (const e of G.enemies) if (alive(e) && Math.hypot(e.x - a.x, e.y - a.y) <= AURA && burn(G, e)) a.burned++;
      }
      return false;
    },
    bite(G, a, e, dmg) {
      if (!a.medium) return dmg;
      // Vùng cắn mở rộng: mọi quái trong SPLASH quanh con bị cắn cùng ăn sát thương.
      for (const q of G.enemies) {
        if (q === e || !alive(q) || Math.hypot(q.x - e.x, q.y - e.y) > SPLASH) continue;
        SK.hurtEnemy(G, q, dmg, false, Math.atan2(q.y - a.y, q.x - a.x), 1); a.splash++;
      }
      return dmg;
    },
    stage(G, a) { if (G._p46med) { a.medium = true; a.scale = SIZE; } }
  });
})();
