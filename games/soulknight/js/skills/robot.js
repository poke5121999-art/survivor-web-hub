// Kỹ năng Người Máy (c12): drone_swarm. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, W = SK.world;
  const { fx, hit, nearest, alive, ec, inRadius, layer, timers, glow } = K;

  // Drone Tấn Công [ĐO c13/skill 2: cd 8, args "4" = 4 drone; C13Controller.skill1Radius 1.5, funnelMoveSpeed 15; prefab funnel_robot_3
  // (Gun009 laser, bullet_41 dmg 2 crit 10), funnel_robot_4 (Gun002, bullet_17 speed 42 dmg 3), funnel_robot_skill1_melee (FunnelRobotMelee:
  // robot_whirl_wind dmg 10, robot_skill1_melee_bullet dmg 15)]: drone bay quanh người tới khi vào cổng, đạn địch không chạm được; bấm lại
  // thì drone hiện đòn riêng rồi thu về, sau đó triệu hồi bộ mới theo loại vũ khí đang cầm; hồi chiêu chạy từ lúc bấm.
  const DR = {
    n: 4, orbit: 1.5 * U, speed: 15 * U, spin: 1.6,      // số drone, bán kính quỹ đạo, tốc bay [ĐO]; tốc xoay rad/s [ƯỚC LƯỢNG]
    hover: 12,                                            // độ nổi so với mặt đất, px [ƯỚC LƯỢNG]
    range: 16 * U, every: 1.5,                            // tầm dò súng/laser 16 ô, nhịp bắn 1.5 s [WIKI] (prefab FunnelWeaponContainer.atk_cd ghi 2.0)
    gun: { dmg: 3, spd: 42, shots: 2, spread: 0.12, bullet: 'bullet_17' },   // [ĐO Gun002 bullet_17 damage 3 speed 42]; 2 viên mỗi lần [WIKI]
    laser: { dmg: 2, crit: 10, len: 16 * U, bullet: 'bullet_41' },           // [ĐO Gun009 bullet_41 damage 2 critic 10]
    melee: { dmg: 10, r: 1.5 * U, blast: 15, blastR: 2 * U, burn: 0.3 },     // [ĐO robot_whirl_wind 10, robot_skill1_melee_bullet 15]; vòng quét 1.5 ô [WIKI]; tầm nổ, xác suất cháy [ƯỚC LƯỢNG]
    volleys: 3, gap: 0.3, ring: 7,                        // đòn riêng súng/laser: 3 loạt, súng 7 viên mỗi loạt [WIKI]; nhịp loạt [ƯỚC LƯỢNG]
    blastT: 2                                             // trần thời gian đòn riêng của drone cận chiến [ƯỚC LƯỢNG]
  };
  K.DUR_UI.drone_swarm = 1.5;   // vòng HUD chỉ tính giai đoạn đòn riêng

  const mine = p => p.hero === 'robot' && p.h.skill && p.h.skill.id === 'drone_swarm';
  // Loại drone theo vũ khí chính: cận chiến / súng (súng ngắn, trường, bắn tỉa, shotgun) / còn lại là laser [WIKI].
  function typeOf(p) { const w = p.weapons[p.cur], k = w && w.def && w.def.kind; return k === 'melee' ? 'melee' : k === 'gun' ? 'gun' : 'laser'; }

  function deploy(G, p, type) {
    const m = p._drones = { type, list: [], spin: 0, mode: 'orbit', t: 0, vol: 0 };
    for (let i = 0; i < DR.n; i++) {
      const a = Math.PI * 2 * i / DR.n;
      const d = { x: p.x + Math.cos(a) * 6, y: p.y - 8, ang: a, cd: DR.every * (0.4 + 0.15 * i), i, aim: 0, spinA: 0, gone: false };
      m.list.push(d);
      fx(G, 'effect_shock1', d.x, d.y, { scale: 0.5 });
    }
    if (!m.prop) G.props.push(m.prop = propOf(p));
    return m;
  }
  function clear(p) { if (p._drones) { p._drones.list = []; p._drones.prop = null; } p._drones = null; }

  // Tia: quét dọc hướng bắn tới tường (tối đa len), trúng mọi quái trên đường; hình = prefab đạn thật kéo dài như tia của vũ khí.
  function beam(G, p, x, y, ang) {
    const L = DR.laser, c = Math.cos(ang), s = Math.sin(ang), hits = [];
    let len = 0;
    while (len < L.len) {
      len += 2;
      const bx = x + c * len, by = y + s * len;
      if (W.solidAt(G.map, bx, by + 6)) break;
      for (const e of G.enemies) {
        if (!alive(e) || hits.indexOf(e) >= 0) continue;
        const [cx, cy] = ec(e);
        if (Math.hypot(cx - bx, cy - by) < e.r + 3) { hits.push(e); hit(G, p, e, L.dmg, { critChance: L.crit, ang, repel: 1, fx: (SK.vfx && SK.vfx.hitFor(L.bullet)) || 'hit_white', tag: 'drone' }); }
      }
    }
    const w = SK.w86, h = w && w.ensureFx() && SK.vfx.spawn(G, 'W:' + L.bullet, x, y, { ang, dur: 0.15 });
    if (h) {
      const bi = h.nodes.findIndex(nd => nd.d.n === 'img'), ei = h.nodes.findIndex(nd => nd.d.n === 'end');
      if (h.def.anims) h.def = strip(L.bullet, h.def, bi, ei);
      if (ei >= 0) { h.nodes[ei].T[0] = len / U; h.nodes[ei].dirty = true; }
      if (bi >= 0) { h.nodes[bi].T[7] = len / U; h.nodes[bi].dirty = true; }
    } else K.boltProp(G, [x, y], [x + c * len, y + s * len], 0.15);
  }
  const stripped = {};
  function strip(pf, def, bodyI, endI) {   // clip của tia đặt lại cỡ thân / đầu cuối mỗi khung: bản def riêng bỏ hai đường đó (như beam86 của actors.js)
    return stripped[pf] || (stripped[pf] = Object.assign({}, def, { anims: def.anims.map(a => Object.assign({}, a, { clips: a.clips.map(c => Object.assign({}, c, {
      curves: c.curves.filter(cv => !((cv.n === bodyI && cv.k === 'sx') || (cv.n === endI && cv.k === 'px'))) })) })) }));
  }
  function bullet(G, p, x, y, ang, extraH) {
    const g = DR.gun;
    SK.spawnBullet86(G, 'p', g.bullet, x, y, ang, { spd: g.spd, dmg: Math.max(1, Math.round(g.dmg * (p.dmgMul || 1))), repel: 3, h: 8 + (extraH || 0), owner: p });
  }
  const target = (G, x, y, skip) => nearest(G, x, y, DR.range, { skip });

  function orbitPos(p, m, d, r) {
    const a = m.spin + Math.PI * 2 * d.i / DR.n;
    return [p.x + Math.cos(a) * r, p.y - 8 - DR.hover * 0.4 + Math.sin(a) * r * 0.6];
  }
  function fly(d, tx, ty, dt, spd) {
    const dx = tx - d.x, dy = ty - d.y, l = Math.hypot(dx, dy), s = Math.min(l, (spd || DR.speed) * dt);
    if (l > 0.01) { d.x += dx / l * s; d.y += dy / l * s; }
    return l;
  }

  function tick(G, p, dt) {
    const m = p._drones;
    if (!m) return;
    if (!mine(p) || p.st === 'dead') { clear(p); return; }
    m.spin += DR.spin * dt;
    m.t += dt;
    const special = m.mode === 'special';
    for (const d of m.list) {
      if (d.gone) continue;
      let tgt = null;
      if (special && m.type === 'melee') {
        // Đòn riêng cận chiến: lao vào quái gần nhất rồi tự nổ.
        tgt = d.tg && alive(d.tg) ? d.tg : (d.tg = target(G, d.x, d.y, e => m.list.some(o => o !== d && o.tg === e)) || target(G, d.x, d.y));
        if (tgt) {
          const [cx, cy] = ec(tgt), l = fly(d, cx, cy, dt, DR.speed);
          d.ang = Math.atan2(cy - d.y, cx - d.x);
          if (l < 5) blast(G, p, d);
        } else if (m.t > 0.6) blast(G, p, d);
        continue;
      }
      const home = orbitPos(p, m, d, special ? DR.orbit * 0.5 : DR.orbit);
      fly(d, home[0], home[1], dt, special ? 1e4 : DR.speed);
      d.cd -= dt;
      tgt = m.type === 'melee' ? nearest(G, d.x, d.y, 14 * U) : target(G, d.x, d.y);
      if (tgt) { const [cx, cy] = ec(tgt); d.ang = Math.atan2(cy - d.y, cx - d.x); } else d.ang = m.spin + Math.PI * 2 * d.i / DR.n + Math.PI / 2;
      if (m.type === 'melee') d.spinA += dt * 14;
      if (special || d.cd > 0 || !tgt) continue;
      d.cd = DR.every;
      if (m.type === 'gun') for (let k = 0; k < DR.gun.shots; k++) bullet(G, p, d.x, d.y, d.ang + (k - (DR.gun.shots - 1) / 2) * DR.gun.spread, DR.hover);
      else if (m.type === 'laser') beam(G, p, d.x, d.y, d.ang);
      else whirl(G, p, d);
    }
    if (special) special_(G, p, m);
  }
  // Quét vòng quanh drone cận chiến: gây sát thương và phá đạn địch trong bán kính [ĐO robot_whirl_wind dmg 10; WIKI bán kính 1.5 ô].
  function whirl(G, p, d) {
    fx(G, 'robot_whirl_wind', d.x, d.y + DR.hover * 0.4, { scale: 0.5 });
    for (const e of inRadius(G, d.x, d.y, DR.melee.r)) hit(G, p, e, DR.melee.dmg, { repel: 2, fx: 'hit_blue', tag: 'drone' });
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - d.x, b.y - d.y) < DR.melee.r + b.r) b.dead = true;
  }
  function blast(G, p, d) {
    d.gone = true;
    fx(G, 'robot_skill1_melee_bullet', d.x, d.y, {});
    for (const e of inRadius(G, d.x, d.y, DR.melee.blastR)) { hit(G, p, e, DR.melee.blast, { repel: 3, tag: 'drone_blast' }); if (SK.rand() < DR.melee.burn) K.debuff(G, e, 'fire'); }
    G.shake = Math.max(G.shake, 2);
  }
  // Đòn riêng súng / laser: thu drone về sát người rồi bắn 3 loạt cùng lúc.
  function special_(G, p, m) {
    if (m.type !== 'melee') {
      if (m.vol < DR.volleys && m.t >= 0.15 + m.vol * DR.gap) {
        m.vol++;
        const aim = nearest(G, p.x, p.y - 8, DR.range);
        for (const d of m.list) {
          if (m.type === 'gun') { const a0 = SK.rand() * Math.PI * 2; for (let k = 0; k < DR.ring; k++) bullet(G, p, d.x, d.y, a0 + Math.PI * 2 * k / DR.ring, DR.hover); }
          else { const ang = aim ? Math.atan2(ec(aim)[1] - d.y, ec(aim)[0] - d.x) : d.ang; d.ang = ang; beam(G, p, d.x, d.y, ang); }
        }
      }
      if (m.vol >= DR.volleys && m.t >= 0.15 + (DR.volleys - 1) * DR.gap + 0.3) m.done = true;
    } else if (m.list.every(d => d.gone) || m.t > DR.blastT) { for (const d of m.list) if (!d.gone) blast(G, p, d); m.done = true; }
    if (m.done) p.skillT = 0.0001;
  }
  timers.drone_swarm = tick;

  function propOf(p) {
    return { x: 0, y: 1e9, t: 0,
      update(G, q) { if (!p._drones || p._drones.prop !== q) q.gone = true; },
      draw(ctx) {
        const m = p._drones; if (!m) return;
        for (const d of m.list) {
          if (d.gone) continue;
          SK.drawShadow(ctx, 'shadow3', d.x, d.y + DR.hover * 0.9, null, 0.5);
          const left = Math.cos(d.ang) < 0, bob = Math.sin(m.t * 6 + d.i * 1.7) * 1.2;
          if (m.type === 'melee') { SK.draw(ctx, 'skill_effect_2', d.x, d.y + bob, { rot: d.spinA }); glow(ctx, d.x, d.y + bob, 9, [1, 0.35, 0.3, 0.3]); }
          else SK.draw(ctx, 'skill_effect_2', d.x, d.y + bob, { rot: left ? d.ang - Math.PI : d.ang, flip: left });
        }
      } };
  }

  S.drone_swarm = {
    DR,
    start(G, p) {
      layer(G);
      const m = p._drones, type = typeOf(p);
      p._droneNext = type;
      if (!m || !m.list.length) { deploy(G, p, type); return; }   // chưa có drone: chỉ triệu hồi, hồi chiêu chạy ngay
      m.mode = 'special'; m.t = 0; m.vol = 0; m.done = false;
      p.skillT = m.type === 'melee' ? DR.blastT : 0.15 + (DR.volleys - 1) * DR.gap + 0.3 + 0.5;   // trần; xong sớm thì m.done cắt
    },
    end(G, p) { clear(p); deploy(G, p, p._droneNext || typeOf(p)); }   // đòn riêng xong: thu hết drone cũ, triệu hồi bộ mới theo vũ khí lúc bấm
  };
  // Vào cổng thì drone mất (bấm kỹ năng để gọi lại) [WIKI].
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p && p._drones) clear(p); });
})();
