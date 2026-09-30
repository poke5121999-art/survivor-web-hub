// Kỹ năng Sứ Giả (c18): elemental_affinity. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world, U = SK.PPU, I = SK.input;
  const C = (f, d) => K.CTRL('envoy', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;

  // Thân Hoà Nguyên Tố [ĐO c18Controller + config]: cd 8, dur 5, 2 lượt. Số từng nguyên tố (ctrlFields, MB buff_envoy_*):
  //  lửa  fireInfo: firstDamage 6, radius 6 ô, dot 2 / 1 s trong 5 s, cầu lửa cách nhau fireBulletInterval 0,2 s;
  //  băng iceInfo: 50% mỗi đòn, 2–4 cầu tuyết iceBalls[3 cỡ: tốc 9,5/12/15, sát thương 10/7/3, xuyên 0/1/0], đóng băng 2,75 s;
  //  độc  poisonInfo: radius 5 ô, dot 1 / 0,33 s trong 6,5 s;   sét: lightningDamage 2 × lightningCount 3 chuỗi, choáng điện.
  // Chọn nguyên tố: giữ hướng lúc bấm (lên lửa, phải băng, xuống độc, trái sét), không giữ thì xoay vòng — vòng quay kéo phím
  // (ui_roulette) chưa dựng. Đòn vũ khí trong thời gian duy trì kích hoạt hiệu ứng của nguyên tố đã chọn, coi như vũ khí được
  // gán nguyên tố đó [info: "ngẫu nhiên gán một loại nguyên tố"]. Chưa làm: hiệu ứng tương tác giữa các nguyên tố (poisonCombine*, iceCombine*).
  const fi = C('fireInfo', {}), ii = C('iceInfo', {}), pi = C('poisonInfo', {});
  const EL = {
    fire: { tint: [1, 0.45, 0.1], first: fi.firstDamage || 6, r: (fi.radius || 6) * T, dot: fi.dotDamage || 2, every: fi.dotInterval || 1, buff: fi.buffTime || 5, gap: C('fireBulletInterval', 0.2), speed: 14 * U, max: 3 },
    ice: { tint: [0.5, 0.85, 1], chance: ii.atkProbability || 50, min: ii.minCount || 2, max: ii.maxCount || 4, balls: C('iceBalls', [{ speed: 9.5, damage: 10, throughCount: 0 }, { speed: 12, damage: 7, throughCount: 1 }, { speed: 15, damage: 3, throughCount: 0 }]), gap: C('iceBulletInterval', 0.3) },
    poison: { tint: [0.5, 1, 0.3], r: (pi.radius || 5) * T, dot: pi.dotDamage || 1, every: pi.dotInterval || 0.33, buff: pi.buffTime || 6.5, spread: 2 * T },   // bán kính lan [ƯỚC LƯỢNG]
    lightning: { tint: [0.5, 0.6, 1], dmg: C('lightningDamage', 2), n: C('lightningCount', 3), range: 8 * T, gap: 0.2, strike: K.MB('bullet_envoy_lighting', 'BulletEnvoyLightning', 'bulletsInfo', [{ damage: 12 }])[0].damage }
  };
  const ORDER = ['fire', 'ice', 'poison', 'lightning'];

  function proj(G, p, o) {   // đạn của kỹ năng: tự tính va chạm để gắn hiệu ứng lên quái trúng
    const b = { x: o.x, y: o.y, ang: o.ang, life: o.life || 1.6, gone: false, hit: new Set(o.skip || []), left: o.pierce || 0 };
    b.h = fx(G, o.vfx, b.x, b.y, { follow: b, ang: o.ang, dur: b.life });
    G.props.push({ x: b.x, y: 1e9, draw() {},
      update(G2, q, dt) {
        b.life -= dt;
        b.x += Math.cos(b.ang) * o.speed * dt; b.y += Math.sin(b.ang) * o.speed * dt;
        let done = b.life <= 0 || W.solidAt(G2.map, b.x, b.y + 6);
        if (!done) for (const e of G2.enemies) {
          if (!K.alive(e) || b.hit.has(e)) continue;
          const [cx, cy] = K.ec(e);
          if (Math.hypot(cx - b.x, cy - b.y) < e.r + (o.r || 4)) { b.hit.add(e); o.onHit(G2, e, b); if (b.left-- <= 0) { done = true; break; } }
        }
        if (done) { q.gone = true; K.stopFx(b.h); }
      } });
  }

  function burn(G, e, el) { K.debuff(G, e, 'fire', { t: el.buff, dmg: el.dot, every: el.every }); }
  function fireball(G, p, from, e) {
    const el = EL.fire, [cx, cy] = K.ec(e);
    proj(G, p, { x: from.x, y: from.y, ang: Math.atan2(cy - from.y, cx - from.x), speed: el.speed, vfx: 'bullet_envoy_fireball', skip: [from.e],
      onHit(G2, t) { K.hit(G2, p, t, el.first, { ang: 0, repel: 1, fx: 'hit_red', tag: 'fireball', noMul: true, crit: false }); burn(G2, t, el); } });
  }
  function snowball(G, p, x, y, ang, skip) {
    const el = EL.ice, tier = el.balls[Math.floor(SK.rand() * el.balls.length)];
    proj(G, p, { x, y, ang, speed: tier.speed * U, vfx: 'bullet_envoy_snowball', skip, pierce: tier.throughCount || 0,
      onHit(G2, t) { K.hit(G2, p, t, tier.damage, { ang, repel: 1, fx: 'hit_blue', tag: 'snowball', noMul: true, crit: false }); K.debuff(G2, t, 'ice'); } });
  }
  function chain(G, p, e0) {
    const el = EL.lightning, seen = new Set([e0]);
    let from = K.ec(e0), src = e0;
    for (let i = 0; i < el.n; i++) {
      const nx = K.nearest(G, from[0], from[1], el.range, { skip: q => seen.has(q) });
      if (!nx) break;
      seen.add(nx);
      const a = from, b = K.ec(nx);
      K.boltProp(G, () => [a[0], a[1]], () => [b[0], b[1]], 0.2);
      K.hit(G, p, nx, el.dmg, { repel: 0, fx: 'hit_blue', tag: 'chain', noMul: true, crit: false });
      K.debuff(G, nx, 'ele');
      from = b; src = nx;
    }
  }

  // Hiệu ứng chủ động lúc kích hoạt.
  function activate(G, p, kind) {
    const near = (r) => K.inRadius(G, p.x, p.y - 6, r);
    if (kind === 'fire') {
      const el = EL.fire;
      for (const e of near(el.r)) { K.hit(G, p, e, el.first, { repel: 2, fx: 'hit_red', tag: 'activate', noMul: true, crit: false }); burn(G, e, el); }
    } else if (kind === 'ice') {
      const el = EL.ice;
      for (let i = 0; i < el.max; i++) snowball(G, p, p.x, p.y - 7, (i / el.max) * Math.PI * 2, []);
    } else if (kind === 'poison') {
      const el = EL.poison;
      for (const e of near(el.r)) K.debuff(G, e, 'poison', { t: el.buff, dmg: el.dot, every: el.every });
    } else {
      const el = EL.lightning;
      const seen = new Set();
      for (let i = 0; i < el.n; i++) {
        const e = K.nearest(G, p.x, p.y - 6, 14 * T, { skip: q => seen.has(q) });
        if (!e) break;
        seen.add(e);
        const [cx, cy] = K.ec(e);
        fx(G, 'lightning_0', cx, cy, {});
        K.hit(G, p, e, el.strike, { repel: 0, fx: 'hit_blue', tag: 'activate', noMul: true, crit: false });
        K.debuff(G, e, 'ele');
      }
    }
  }

  S.elemental_affinity = {
    start(G, p) {
      K.layer(G);
      K.charges(p, 'elemental_affinity'); K.useCharge(p, 'elemental_affinity');
      let kind = I.down('up') ? 'fire' : I.down('right') ? 'ice' : I.down('down') ? 'poison' : I.down('left') ? 'lightning' : null;
      if (!kind) { kind = ORDER[(p._envIdx || 0) % ORDER.length]; p._envIdx = (p._envIdx || 0) + 1; }
      p.skillT = K.cfg(p, 'elemental_affinity').dur || 5;
      p._env = { kind, t: 0, last: -1e9 };
      p._env.h = fx(G, 'envoy_skill0_effect', p.x, p.y, { follow: p, tint: EL[kind].tint, dur: p.skillT });
      activate(G, p, kind);
    },
    end(G, p) { if (p._env) K.stopFx(p._env.h); p._env = null; }
  };

  // Đòn vũ khí trúng quái trong thời gian duy trì kích hoạt hiệu ứng nguyên tố.
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player, s = p && p._env;
    if (!s || !(p.skillT > 0) || G._skHit || !K.alive(e)) return;
    const kind = s.kind, el = EL[kind];
    if (kind === 'poison') {
      K.debuff(G, e, 'poison', { t: el.buff, dmg: el.dot, every: el.every });
      e._envSpread = 1;
      return;
    }
    if (G.t - s.last < el.gap) return;
    if (kind === 'ice' && SK.rand() * 100 >= el.chance) return;
    s.last = G.t;
    const [cx, cy] = K.ec(e);
    if (kind === 'fire') {
      const list = K.inRadius(G, e.x, e.y, el.r).filter(q => q !== e).slice(0, el.max);
      list.forEach((q, i) => G.props.push({ x: 0, y: 1e9, t: 0, draw() {}, update(G2, o, dt) { o.t += dt; if (o.t >= i * el.gap) { o.gone = true; if (K.alive(q)) fireball(G2, p, { x: cx, y: cy, e }, q); } } }));
    } else if (kind === 'ice') {
      const n = el.min + Math.floor(SK.rand() * (el.max - el.min + 1)), a0 = SK.rand() * Math.PI * 2;
      for (let i = 0; i < n; i++) snowball(G, p, cx, cy, a0 + i * Math.PI * 2 / n, [e]);
    } else chain(G, p, e);
  });
  // Độc lan: quái đang nhiễm độc từ đòn vũ khí lây cho quái đứng gần mỗi giây.
  K.timers.envoyPoison = (G, p, dt) => {
    const el = EL.poison;
    for (const e of G.enemies) {
      if (!e._envSpread) continue;
      if (!K.alive(e) || !(e._db && e._db.poison)) { e._envSpread = 0; continue; }
      e._envT = (e._envT || 0) - dt;
      if (e._envT > 0) continue;
      e._envT = 1;
      for (const q of K.inRadius(G, e.x, e.y, el.spread)) if (q !== e && !(q._db && q._db.poison)) { K.debuff(G, q, 'poison', { t: el.buff, dmg: el.dot, every: el.every }); q._envSpread = 1; }
    }
  };
  S.elemental_affinity.EL = EL;
})();
