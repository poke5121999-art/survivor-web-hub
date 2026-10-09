// Thú cưng đi theo người chơi: prefab pet0..pet5 trong common.ab (tools/extra/pets.json).
// pet = {id, x, y, face, st: 'ide'|'run'|'atk'|'action', stT, cd, scan, target}
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, W = SK.world, U = SK.PPU;

  // [ĐO Pet0Controller/Pet1Controller, RoleAttributePet]: sát thương 3, atk_cd 2 s, bám chủ ở 2 đv, quá 20 đv thì bay
  // về chủ (shouldFlyToMaster), tốc 8 đv/s, critical 0. scout_rate 0,5 dùng làm nhịp dò mục tiêu (giây) [SUY].
  const SEEK = 8 * U;      // tầm dò quái [ƯỚC LƯỢNG]
  const BITE = 1.2 * U;    // cự li cắn [ƯỚC LƯỢNG]
  const BITE_AT = 0.15;    // giây vào clip atk thì gây sát thương [ƯỚC LƯỢNG]

  function cfg(id) {
    const root = (D.prefabs[id] || [])[0], m = (root && root.mbs) || {};
    const c = Object.keys(m).filter(k => /^Pet\d+Controller$/.test(k)).map(k => m[k])[0] || {};
    const ra = m.RoleAttributePet || {};
    return {
      dmg: c.damage || 3, cd: c.atk_cd || 2, scan: c.scout_rate || 0.5,
      near: (c.min_follow_distance || 2) * U, far: (c.max_follow_distance || 20) * U,
      spd: (ra.speed || 8) * U, action: (c.actionRandom || 0) / 100
    };
  }

  function nearestEnemy(G, a) {
    let best = null, bd = SEEK;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead') continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
    }
    return best;
  }

  function setSt(a, st) { if (a.st !== st) { a.st = st; a.stT = 0; } }

  function walk(G, a, tx, ty, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 1) return false;
    const s = Math.min(d, a.k.spd * dt);
    SK.moveBox(G.map, a, dx / d * s, dy / d * s, 3);
    if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1;
    return true;
  }

  function step(G, a, dt) {
    const p = G.player, k = a.k;
    a.stT += dt; a.cd -= dt; a.scan -= dt;
    if (!p || p.st === 'dead') { setSt(a, 'ide'); return; }
    const dp = Math.hypot(p.x - a.x, p.y - a.y);
    if (dp > k.far) { a.x = p.x - p.face * 10; a.y = p.y + 2; a.target = null; setSt(a, 'ide'); return; }
    if (a.st === 'atk') {
      const e = a.target;
      if (!a.bit && a.stT >= BITE_AT && e && e.st !== 'dead' && Math.hypot(e.x - a.x, e.y - a.y) <= BITE * 1.5) {
        a.bit = true;
        SK.hurtEnemy(G, e, k.dmg, false, Math.atan2(e.y - a.y, e.x - a.x), 1);
      }
      if (a.stT < SK.animLen(a.anim.atk)) return;
      a.target = null; setSt(a, 'ide');
    }
    if (a.scan <= 0) { a.scan = k.scan; if (a.cd <= 0 && !a.target) a.target = nearestEnemy(G, a); }
    const e = a.target;
    if (e && (e.st === 'dead' || dp > k.far * 0.5)) a.target = null;
    else if (e) {
      if (Math.hypot(e.x - a.x, e.y - a.y) <= BITE) {
        a.face = e.x >= a.x ? 1 : -1; a.cd = k.cd; a.bit = false; setSt(a, 'atk'); return;
      }
      walk(G, a, e.x, e.y, dt); setSt(a, 'run'); return;
    }
    if (dp > k.near) { walk(G, a, p.x - p.face * 6, p.y + 2, dt); setSt(a, 'run'); return; }
    if (a.st === 'action' && a.stT < SK.animLen(a.anim.action)) return;
    if (a.st !== 'ide') setSt(a, 'ide');
    else if (a.stT > 3 && SK.rand() < k.action * dt) setSt(a, 'action');   // [ƯỚC LƯỢNG] nhịp động tác rảnh
  }

  function spawn(G) {
    const id = SK.profile && SK.profile.pet ? SK.profile.pet() : 'pet0', parts = D.prefabs[id], p = G.player;
    if (G.mods && G.mods.noPet) { G.pet = null; return; }   // Dũng Sĩ Cô Độc
    if (!parts || !p || G.petOff) return;
    const anim = parts[0].a || {};
    const a = { id, parts, anim, k: cfg(id), x: p.x - 10, y: p.y + 2, face: 1, st: 'ide', stT: 0, cd: 1, scan: 0, target: null };
    G.pet = a;
    G.props.push({
      x: a.x, y: a.y, pet: a,
      update(G2, q, dt) {
        if (G2.petOff) { q.gone = true; G2.pet = null; return; }
        step(G2, a, dt); q.x = a.x; q.y = a.y;
      },
      draw(ctx) { SK.drawPrefab(ctx, a.parts, a.x, a.y, { state: a.st, t: a.stT, flip: a.face < 0 }); }
    });
  }

  SK.on('stageEnter', G => spawn(G));
})();
