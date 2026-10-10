// Thú cưng pet3 (Slime Lam), kỹ năng "Chia Nhau Hành Động" [LOC pet_3_skill_0_desc]: bị tấn công thì phân tách (tối đa 2 lần),
// sau khi phân tách sát thương còn 1. [ĐO Pet3Controller.splitLevel 1, splitCount 2]
// "Bị tấn công" = đạn quái (side 'e') lọt vào 5 px quanh con slime (đạn không bị chặn). Mỗi con trúng đạn mà còn lượt tách
// (lvl < 2) thì lvl++ và sinh thêm một con cùng lvl, tối đa 4 con. Con thật (a) chạy AI mặc định; con tách là phần thân tự chứa
// ở đây (đi theo chủ, dò quái trong 8 đv, cắn 1 sát thương mỗi 2 s). Miễn nhiễm 0,8 s sau mỗi lần tách [ƯỚC LƯỢNG]; thu nhỏ
// 0,8 / 0,65 lần theo lvl [ƯỚC LƯỢNG]. Sang ải mới thì làm lại từ một con.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world, MAXSPLIT = 2, R = 5, SEEK = 8 * U, BITE = 1.2 * U, SCALE = [1, 0.8, 0.65];

  function hitBy(G, u) {
    for (const b of G.bullets) {
      if (b.side !== 'e' || b.dead || (b._p3 && b._p3.has(u))) continue;
      if (Math.abs(b.x - u.x) > R || Math.abs(b.y - (u.y - 4)) > R) continue;
      (b._p3 = b._p3 || new Set()).add(u);
      return true;
    }
    return false;
  }

  function split(G, a, u) {
    if (u.lvl >= MAXSPLIT || a.units.length >= 4) return;
    u.lvl++; u.inv = 0.8;
    if (u === a) { a.scale = SCALE[u.lvl]; a.k.dmg = 1; }
    const c = { x: u.x + 6, y: u.y, face: u.face, st: 'ide', stT: 0, cd: 1, lvl: u.lvl, inv: 0.8, target: null, bit: false, clone: true };
    a.units.push(c);
    G.props.push({
      x: c.x, y: c.y, pet: a,
      update(G2, q, dt) { if (G2.pet !== a || G2.petOff) { q.gone = true; return; } clone(G2, a, c, dt); q.x = c.x; q.y = c.y; },
      draw(ctx) { SK.drawPrefab(ctx, a.parts, c.x, c.y, { state: c.st, t: c.stT, flip: c.face < 0, scale: SCALE[c.lvl] }); }
    });
  }

  function setSt(c, st) { if (c.st !== st) { c.st = st; c.stT = 0; } }
  function walk(G, a, c, tx, ty, dt) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < 1) return;
    const s = Math.min(d, a.k.spd * dt);
    SK.moveBox(G.map, c, dx / d * s, dy / d * s, 3);
    if (Math.abs(dx) > 1) c.face = dx > 0 ? 1 : -1;
  }
  function clone(G, a, c, dt) {
    const p = G.player;
    c.stT += dt; c.cd -= dt; c.inv -= dt;
    if (!p || p.st === 'dead') return;
    if (c.inv <= 0 && hitBy(G, c)) split(G, a, c);
    const dp = Math.hypot(p.x - c.x, p.y - c.y);
    if (dp > a.k.far) { c.x = p.x - p.face * 10; c.y = p.y + 2; c.target = null; setSt(c, 'ide'); return; }
    if (c.st === 'atk') {
      const e = c.target;
      if (!c.bit && c.stT >= 0.15 && e && e.st !== 'dead' && Math.hypot(e.x - c.x, e.y - c.y) <= BITE * 1.5) {
        c.bit = true; SK.hurtEnemy(G, e, 1, false, Math.atan2(e.y - c.y, e.x - c.x), 1);
      }
      if (c.stT < SK.animLen(a.anim.atk)) return;
      c.target = null; setSt(c, 'ide');
    }
    let e = c.target;
    if (!e || e.st === 'dead' || e.st === 'spawn') {
      e = null;
      if (c.cd <= 0) {
        let bd = SEEK;
        for (const q of G.enemies) {
          if (q.st === 'spawn' || q.st === 'dead') continue;
          const d = Math.hypot(q.x - c.x, q.y - c.y);
          if (d < bd && W.los(G.map, c.x, c.y - 4, q.x, q.y - 4)) { e = q; bd = d; }
        }
      }
      c.target = e;
    }
    if (e) {
      if (Math.hypot(e.x - c.x, e.y - c.y) <= BITE) { c.face = e.x >= c.x ? 1 : -1; c.cd = a.k.cd; c.bit = false; setSt(c, 'atk'); return; }
      walk(G, a, c, e.x, e.y, dt); setSt(c, 'run'); return;
    }
    if (dp > a.k.near) { walk(G, a, c, p.x - p.face * 6 + (a.units.indexOf(c) * 5), p.y + 2, dt); setSt(c, 'run'); return; }
    setSt(c, 'ide');
  }

  SK.petRegister('pet3', {
    init(G, a) { a.lvl = 0; a.inv = 0; a.units = [a]; },
    tick(G, a, dt) {
      a.inv -= dt;
      if (a.inv <= 0 && hitBy(G, a)) split(G, a, a);
      return false;
    },
    bite(G, a, e, dmg) { return a.lvl > 0 ? 1 : dmg; }   // [LOC] sau khi tách còn 1 sát thương
  });
})();
