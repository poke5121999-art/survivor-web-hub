// Kỹ năng Người Máy (c12): drone_swarm. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, U = SK.PPU, W = SK.world;
  const { fx, hit, nearest, alive, ec, inRadius, layer, timers, glow } = K;

  // Drone Tấn Công [ĐO c13/skill 2: cd 8, args "4" = 4 drone; C13Controller.CreatingFunnel gán cho vũ khí drone ChangeAtk(Set): gunDamage 2,
  // gunBulletCount 2, laserDamage 3, meleeDamage 5 / explodeDamage 15, nhịp bắn 1,5 s, funnelMoveSpeed 15; prefab funnel_robot_3 (Gun009 laser,
  // bullet_41 RGShortLaser maxDistance 100 crit 10), funnel_robot_4 (Gun002, bullet_17 speed 42), funnel_robot_skill1_melee (GunSwordRobotSkill1:
  // robot_whirl_wind kiếm, robot_skill1_melee_bullet tên lửa Bullet02 tự dẫn)]: drone bay quanh người tới khi vào cổng, đạn địch không chạm
  // được; bấm lại thì drone dồn về chỗ, tung đòn riêng 1,6 s rồi thu về, sau đó triệu hồi bộ mới theo loại vũ khí đang cầm; hồi chiêu chạy từ lúc bấm.
  const DR = {
    n: 4, orbit: 1.5 * 1.5 * U, speed: 15 * U,           // số drone; bán kính quỹ đạo = (1,5 + cấp × 0,1) × skill1Radius 1,5; tốc bay [ĐO GetFunnelRootPos, funnelMoveSpeed]
    spin: 2 * Math.PI / 180 * 60,                         // funnelRoot.Rotate(0,0,2) mỗi khung, tính ở 60 khung/s; laser (loại 2) đứng yên [ĐO FunnelRotating]
    hover: 12,                                            // độ nổi so với mặt đất, px: chiều cao trong prefab [ƯỚC LƯỢNG]
    range: 14 * U, every: 1.5,                            // dò quái trong 14 ô quanh chủ [ĐO FunnelWeaponContainer.FindTarget]; nhịp bắn [ĐO gun/laser/meleeAttackInterval 1,5]
    gun: { dmg: 2, spd: 42, shots: 2, spread: 0.12, bullet: 'bullet_17' },   // [ĐO gunDamage 2, gunBulletCount 2, Gun002 bullet_17 speed 42]; độ loe giữa hai viên [ƯỚC LƯỢNG]
    laser: { dmg: 3, crit: 10, len: 100 * U, bullet: 'bullet_41' },          // [ĐO laserDamage 3, bullet_41 critic 10, RGShortLaser.maxDistance 100]; dừng ở tường
    melee: { dmg: 5, r: 1.5 * U, blast: 15, blastR: 2 * U, burn: 0.5, atkRange: 2 * U, rocket: 20 * U },   // [ĐO meleeDamage 5, explodeDamage 15, Explode.fire_rate 50, atkRange mặc định 2, đạn bay 20]; bán kính quét/nổ: collider prefab không nằm trong MB [ƯỚC LƯỢNG]
    rocketTurn: 30 * Math.PI / 180 / 0.02, rocketDelay: 0.105, rocketLife: 5, rocketRange: 12 * U,   // Bullet02 angle_speed 30°/bước 0,02 s, delay_time 0,105, destroy_time 5, tầm dò 12 [ĐO robot_skill1_melee_bullet]
    ex: { dur: 1.6, gap: 0.5, ring: 7 }                   // đòn riêng: WaitForSeconds(1,6) rồi RoleSkillEnd1; nhịp gunExInterval/laserExInterval 0,5; súng gunBulletCount 2 + gunExBulletCount 5 = 7 viên toả 360° [ĐO Skill1ExAttack]
  };
  DR.ex.volleys = Math.floor(DR.ex.dur / DR.ex.gap) + 1;   // ForceAttack rồi mỗi 0,5 s một loạt: t = 0, 0,5, 1, 1,5
  K.DUR_UI.drone_swarm = DR.ex.dur;   // vòng HUD chỉ tính giai đoạn đòn riêng

  const mine = p => p.hero === 'robot' && p.h.skill && p.h.skill.id === 'drone_swarm';
  // Loại drone theo vũ khí chính [ĐO GetSkill1Type]: is_melee → cận chiến; weapon_type Gun / ShotGun / Pistol / Rifle → súng; còn lại → laser.
  function typeOf(p) {
    const w = p.weapons[p.cur], d = w && w.def, x = d && d.w86;
    if (x) return x.melee ? 'melee' : [1, 2, 14, 15].indexOf(x.type) >= 0 ? 'gun' : 'laser';
    const k = d && d.kind; return k === 'melee' ? 'melee' : k === 'gun' ? 'gun' : 'laser';
  }

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
  const target = (G, p, skip) => nearest(G, p.x, p.y - 8, DR.range, { skip });   // tầm dò tính quanh chủ, không quanh drone

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
    rockets(G, dt);
    const m = p._drones;
    if (!m) return;
    if (!mine(p) || p.st === 'dead') { clear(p); return; }
    const special = m.mode === 'special';
    if (m.type !== 'laser' && !special) m.spin += DR.spin * dt;
    m.t += dt;
    for (const d of m.list) {
      if (d.gone) continue;
      const home = orbitPos(p, m, d, DR.orbit);
      d.cd -= dt;
      const tgt = target(G, p);
      // Cận chiến bay tới quái, đứng cách atkRange rồi vung kiếm; súng/laser bắn từ quỹ đạo [ƯỚC LƯỢNG: gốc cũng bay tới quái theo atkRange của vũ khí, chưa đo được]
      if (!special && m.type === 'melee' && tgt) {
        const [cx, cy] = ec(tgt), l = Math.hypot(cx - d.x, cy - d.y);
        if (l > DR.melee.atkRange * 0.8) fly(d, cx - (cx - d.x) / l * DR.melee.atkRange * 0.6, cy - (cy - d.y) / l * DR.melee.atkRange * 0.6, dt, DR.speed);
        d.ang = Math.atan2(cy - d.y, cx - d.x);
      } else {
        fly(d, home[0], home[1], dt, special ? 1e4 : DR.speed);   // đòn riêng: TransportToParent dời thẳng về chỗ trên quỹ đạo
        if (tgt) { const [cx, cy] = ec(tgt); d.ang = Math.atan2(cy - d.y, cx - d.x); } else d.ang = m.spin + Math.PI * 2 * d.i / DR.n + Math.PI / 2;
      }
      if (m.type === 'melee') d.spinA += dt * 14;
      if (special || d.cd > 0 || !tgt) continue;
      if (m.type === 'melee') { const [cx, cy] = ec(tgt); if (Math.hypot(cx - d.x, cy - d.y) > DR.melee.atkRange) continue; }
      d.cd = DR.every;
      if (m.type === 'gun') for (let k = 0; k < DR.gun.shots; k++) bullet(G, p, d.x, d.y, d.ang + (k - (DR.gun.shots - 1) / 2) * DR.gun.spread, DR.hover);
      else if (m.type === 'laser') beam(G, p, d.x, d.y, d.ang);
      else whirl(G, p, d);
    }
    if (special) special_(G, p, m);
  }
  // Quét vòng quanh drone cận chiến: gây sát thương và phá đạn địch trong bán kính [ĐO meleeDamage 5 đặt lên robot_whirl_wind].
  function whirl(G, p, d) {
    fx(G, 'robot_whirl_wind', d.x, d.y + DR.hover * 0.4, { scale: 0.5 });
    for (const e of inRadius(G, d.x, d.y, DR.melee.r)) hit(G, p, e, DR.melee.dmg, { repel: 2, fx: 'hit_blue', tag: 'drone' });
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - d.x, b.y - d.y) < DR.melee.r + b.r) b.dead = true;
  }
  // Đòn riêng cận chiến: mỗi drone bắn một tên lửa Bullet02 tự dẫn, trúng thì nổ 15 sát thương, 50% gây cháy [ĐO ShootExBullet → CreateBullet].
  function rocket(G, p, d) {
    const ang = d.ang, b = K.shoot(G, p, d.x, d.y, ang, { dmg: DR.melee.blast, speed: DR.melee.rocket / U, sprite: 'nothing', life: DR.rocketLife, repel: 3, r: 4, extra: { _rk: 0 } });
    b.fxh = fx(G, 'robot_skill1_melee_bullet', d.x, d.y, { follow: b, ang });
    G.shake = Math.max(G.shake, 1);
  }
  function rockets(G, dt) {
    for (const b of G.bullets) {
      if (b._rk == null || b.dead) continue;
      b._rk += dt;
      if (b._rk < DR.rocketDelay) continue;
      if (!b._tg || !alive(b._tg)) b._tg = nearest(G, b.x, b.y, DR.rocketRange, { los: true });
      if (!b._tg) continue;
      const [cx, cy] = ec(b._tg);
      let d = Math.atan2(cy - b.y, cx - b.x) - b.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
      b.ang += Math.max(-DR.rocketTurn * dt, Math.min(DR.rocketTurn * dt, d));
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(b.ang) * sp; b.vy = Math.sin(b.ang) * sp;
    }
  }
  // Trúng thì nổ: quái quanh mục tiêu chịu 15 và 50% bén lửa [ĐO explode_hit_enemy_portable_boom_big fire_rate 50; bán kính nổ ƯỚC LƯỢNG].
  SK.on('enemyHit', (G, e) => {
    const b = G._hitBullet;
    if (!b || b._rk == null || b._boom) return;
    b._boom = true;
    const p = G.player, [cx, cy] = ec(e);
    fx(G, 'robot_skill1_melee_bullet', cx, cy, {});
    for (const o of inRadius(G, cx, cy, DR.melee.blastR)) {
      if (o !== e) hit(G, p, o, DR.melee.blast, { repel: 3, tag: 'drone_blast' });
      if (SK.rand() < DR.melee.burn) K.debuff(G, o, 'fire');
    }
    G.shake = Math.max(G.shake, 2);
  });
  // Đòn riêng: súng/laser bắn loạt đầu ngay rồi mỗi 0,5 s một loạt trong 1,6 s; cận chiến phóng tên lửa một lần [ĐO Skill1ExAttack].
  function special_(G, p, m) {
    const X = DR.ex;
    if (m.type === 'melee') {
      if (!m.vol) { m.vol = 1; for (const d of m.list) { const tg = target(G, p); if (tg) d.ang = Math.atan2(ec(tg)[1] - d.y, ec(tg)[0] - d.x); rocket(G, p, d); } }
    } else while (m.vol < X.volleys && m.t >= m.vol * X.gap) {
      m.vol++;
      const aim = target(G, p);
      if (!aim) continue;   // không có quái thì drone không bắn (GetToTarget cần has_target)
      for (const d of m.list) {
        if (m.type === 'gun') { const a0 = SK.rand() * Math.PI * 2; for (let k = 0; k < X.ring; k++) bullet(G, p, d.x, d.y, a0 + Math.PI * 2 * k / X.ring, DR.hover); }
        else { const ang = Math.atan2(ec(aim)[1] - d.y, ec(aim)[0] - d.x); d.ang = ang; beam(G, p, d.x, d.y, ang); }
      }
    }
    if (m.t >= X.dur) { m.done = true; p.skillT = 0.0001; }
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
      p.skillT = DR.ex.dur + 0.5;   // trần; special_ cắt đúng 1,6 s
    },
    end(G, p) { clear(p); deploy(G, p, p._droneNext || typeOf(p)); }   // đòn riêng xong: thu hết drone cũ, triệu hồi bộ mới theo vũ khí lúc bấm
  };
  // Vào cổng thì drone mất (bấm kỹ năng để gọi lại).
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p && p._drones) clear(p); });
})();
