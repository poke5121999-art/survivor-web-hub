// Kỹ năng Thợ Mỏ (c24): underground_operations, cart_delivery, sandworm_storm. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS;
  const { cfg, CTRL, fx, hit, inRadius, nearest, ec, alive, setMul, hurtMods, ghost, layer, timers, DUR_UI, debuff, aimDir } = K;
  const W = SK.world, U = SK.PPU, T = SK.TILE, I = SK.input;
  const C = (f, d) => CTRL('miner', f, d);   // ctrlFields của C25Controller [ĐO hero.json]

  // Sóng xung kích của ExplodeHammer explode_miner_skill0/1/2 [ĐO common.ab]: damage 15, repel 10, critic 50, buff_ele (choáng điện).
  // Bán kính: vòng nổ scale_factor 1.5 [ĐO]; đo trên vòng vẽ được ~2,5 ô [ƯỚC LƯỢNG].
  const EXP = { dmg: 15, repel: 10, crit: 50, r: 2.5 * T };
  function shock(G, p, x, y, name, r, dmg, o) {
    const e0 = EXP;
    fx(G, name || 'explode_miner_skill0', x, y - 2, {});
    G.shake = Math.max(G.shake, 2);
    for (const e of inRadius(G, x, y - 4, r || e0.r)) {
      hit(G, p, e, dmg != null ? dmg : e0.dmg, { critChance: e0.crit, repel: e0.repel * 0.3, ang: Math.atan2(e.y - y, e.x - x), tag: (o && o.tag) || 'skill' });
      debuff(G, e, 'ele');
      if (o && o.onHit) o.onHit(e);
    }
  }
  const kill = h => { if (h) { if (h.stop) h.stop(); if (h.kill) h.kill(); } };
  const dirt = (G, x, y, n) => { for (let i = 0; i < n; i++) SK.fx(G, 'dust', x + SK.randf(-6, 6), y + SK.randf(-3, 3), { dur: 0.35 }); };
  const dirs = () => { const m = I.moveVec(); return Math.hypot(m.x, m.y) > 0.1 ? Math.atan2(m.y, m.x) : null; };
  const wallAt = (G, x, y) => W.solidAt(G.map, x, y);

  // ================================================================ HÀNH ĐỘNG DƯỚI ĐÂY (skill 0)
  // [ĐO c24/skill 1: cd 8, dur 1,25; C25Controller extraSkill0Time 1,5 (giữ nút kéo dài), maxTunnelNumber 2; hole_miner_skill0
  // MinerHoleItem coolDuration 3] + [WIKI]: chui xuống đất, di chuyển tự do và bất tử, gõ kỹ năng / đánh để lên sớm; xuống và lên
  // đều tạo sóng xung kích; để lại hố ở chỗ xuống và chỗ lên, ấn E ở hố thì sang hố cặp (mỗi hố nguội 3 s).
  const UG = { move: 1.25, tap: 0.25 };   // hệ số tốc chạy dưới đất [ƯỚC LƯỢNG], thời gian tối thiểu trước khi "đánh" thoát [ƯỚC LƯỢNG]
  const HOLE_CD = 3;   // MinerHoleItem.coolDuration [ĐO hole_miner_skill0]
  SK.on('stageEnter', G => { G._minerHoles = []; });
  const holes = G => (G._minerHoles = (G._minerHoles || []).filter(h => !h.gone));
  function makeHole(G, x, y) {
    const h = { gone: false, x, y, cd: 0, partner: null, h: fx(G, 'hole_miner_skill0', x, y, { layer: 'ground', dur: 1e6 }) };
    G._minerHoles = holes(G); G._minerHoles.push(h);
    let was = false;
    G.props.push({ x, y: y + 1, t: 0,
      update(G2, q, dt) {
        if (h.gone) { q.gone = true; return; }
        h.cd = Math.max(0, h.cd - dt);
        const p = G2.player, down = I.down('interact'), edge = down && !was; was = down;
        h.near = p && p.st !== 'dead' && h.partner && !h.partner.gone && Math.hypot(p.x - x, p.y - y) < 14 && !(p.skillT > 0 && p.hero === 'miner' && p._ug);
        if (edge && h.near && h.cd <= 0 && !G2.interactTarget) {
          const to = h.partner;
          h.cd = to.cd = HOLE_CD;
          p.x = to.x; p.y = to.y; p.invulT = Math.max(p.invulT, 0.3);
          fx(G2, 'explode_miner_skill0', to.x, to.y - 2, { layer: 'ground', scale: 0.5 });
          fx(G2, 'explode_miner_skill0', x, y - 2, { layer: 'ground', scale: 0.5 });
        }
      },
      draw(ctx) { if (h.near && h.cd <= 0) SK.text(ctx, 'E', x, y - 10, 8, '#ffe06a', 'center', '#000'); } });
    return h;
  }
  function linkHoles(G, a, b) {
    a.partner = b; b.partner = a;
    // Tối đa maxTunnelNumber cặp hố cùng lúc [ĐO]: cặp cũ nhất bị lấp.
    const max = C('maxTunnelNumber', 2) * 2, hs = holes(G);
    while (hs.length > max) { const o = hs.shift(); o.gone = true; kill(o.h); if (o.partner) o.partner.partner = null; }
  }
  S.underground_operations = {
    start(G, p) {
      layer(G);
      const c = cfg(p, 'underground_operations');
      p.skillT = c.dur || 1.25;
      const st = p._ug = { t: 0, held: true, extra: C('extraSkill0Time', 1.5), hole: makeHole(G, p.x, p.y) };
      p.hidden = true;
      hurtMods(p).ug = () => 0;
      setMul(p, 'moveMul', 'ug', UG.move);
      shock(G, p, p.x, p.y, 'explode_miner_skill0');
      dirt(G, p.x, p.y, 8);
      for (const w of p.weapons) if (w) w.cd = Math.max(w.cd, 0.3);
    },
    update(G, p, dt) {
      const st = p._ug; if (!st) return;
      st.t += dt;
      // Giữ nút kỹ năng thì nán lại tối đa extraSkill0Time [ĐO] sau thời lượng gốc; nhả nút là lên.
      if (!I.down('skill')) st.held = false;
      if (st.held && p.skillT <= dt * 1.5 && st.extra > 0) { p.skillT += dt; st.extra -= dt; }
      for (const w of p.weapons) if (w) w.cd = Math.max(w.cd, 0.15);
      if (st.t > UG.tap && I.down('attack')) p.skillT = Math.min(p.skillT, 1e-4);
      if (Math.random() < dt * 14) SK.fx(G, 'dust', p.x + SK.randf(-4, 4), p.y, { dur: 0.25 });
    },
    press(G, p) { if (p._ug && p._ug.t > 0.1) p.skillT = 1e-4; },
    end(G, p) {
      const st = p._ug; p._ug = null;
      p.hidden = false; delete hurtMods(p).ug; setMul(p, 'moveMul', 'ug', 1);
      p.invulT = Math.max(p.invulT, 0.15);
      for (const w of p.weapons) if (w) w.cd = Math.max(w.cd, 0.3);
      shock(G, p, p.x, p.y, 'explode_miner_skill0');
      dirt(G, p.x, p.y, 8);
      if (!st) return;
      // Lên cách chỗ xuống quá gần thì không có "hố kia" để sang: bỏ hố lẻ.
      if (Math.hypot(p.x - st.hole.x, p.y - st.hole.y) > 12) linkHoles(G, st.hole, makeHole(G, p.x, p.y));
      else { st.hole.gone = true; kill(st.hole.h); }
    }
  };
  DUR_UI.underground_operations = 1.25;

  // ================================================================ GIAO HÀNG XE KHOÁNG (skill 1)
  // [ĐO c24/skill 2: cd 10; C25Controller skill1StartSpeed 15, skill1SpeedAdd 5, maxSpeed 30, skill1CastTime 6, carRepel 10,
  // armorRestoreSpeed 1,5, defenceAddSpeed 2; explode_miner_skill1 damage 15; miner_car_bullet MinerCarCollision critical 100 + buff_ele]:
  // nhảy lên xe chạy tự động (hướng chọn lúc lên), tăng tốc dần, tông quái; bấm lại thì nhảy xuống và xe nổ; tới tốc độ tối đa mới
  // nhảy xuống thì hồi nửa giáp đã mất [WIKI]. Tốc độ xe tính theo đơn vị Unity × 16 px [ĐO].
  const CAR = { dmg: 5, every: 0.35, r: 12, defMax: 2, hop: 2 * T, hopT: 0.2 };   // sát thương một lần tông, nhịp, tầm chạm, phòng thủ tối đa (= defenceAddSpeed), quãng nhảy xuống [ƯỚC LƯỢNG]
  const CAR_SPR = [2, 1, 0, 7, 6, 5, 4, 3];   // MinerCar.carSprites: thứ tự khung theo 8 hướng bắt đầu từ +X quay xuống [ĐO]
  const carFrame = ang => {
    const i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    return 'miner_car_' + CAR_SPR[i];
  };
  const speedFrac = st => st ? (st.v / U - C('skill1StartSpeed', 15)) / (C('maxSpeed', 30) - C('skill1StartSpeed', 15)) : 0;
  S.cart_delivery = {
    start(G, p) {
      layer(G);
      const dir = dirs();
      const st = p._cart = { ang: dir != null ? dir : aimDir(p), v: C('skill1StartSpeed', 15) * U, t: 0, hits: new Map(), max: C('maxSpeed', 30) * U, hop: 0 };
      p.skillT = C('skill1CastTime', 6);
      setMul(p, 'moveMul', 'cart', 0.001);
      hurtMods(p).cart = (G2, pl, dmg) => Math.max(1, dmg - Math.floor(CAR.defMax * speedFrac(pl._cart)));
      dirt(G, p.x, p.y, 5);
    },
    update(G, p, dt) {
      const st = p._cart; if (!st) return;
      st.t += dt;
      st.v = Math.min(st.max, st.v + C('skill1SpeedAdd', 5) * U * dt);
      const frac = speedFrac(st);
      // Xe chỉ đổi hướng khi chạm tường (bật lại) [ĐO TurnDirectionOnCollide].
      const dx = Math.cos(st.ang) * st.v * dt, dy = Math.sin(st.ang) * st.v * dt;
      const bx = SK.moveBox(G.map, p, dx, 0, p.h.body.r), by = SK.moveBox(G.map, p, 0, dy, p.h.body.r);
      if (bx) st.ang = Math.PI - st.ang;
      if (by) st.ang = -st.ang;
      if (bx || by) { G.shake = Math.max(G.shake, 1.5); SK.fx(G, 'dust', p.x, p.y, { dur: 0.3 }); }
      // Giáp hồi nhanh theo tốc độ xe [ĐO armorRestoreSpeed 1,5 = hệ số ở tốc tối đa].
      if (p.armorT <= 0 && p.armor < p.armorMax) p.armorTick -= dt * frac * C('armorRestoreSpeed', 1.5);
      for (const e of inRadius(G, p.x, p.y - 6, CAR.r)) {
        if ((st.hits.get(e) || 0) > G.t) continue;
        st.hits.set(e, G.t + CAR.every);
        hit(G, p, e, CAR.dmg, { critChance: 100, repel: C('carRepel', 10) * 0.3, ang: st.ang, tag: 'cart', fx: 'hit_grey' });
        debuff(G, e, 'ele');
      }
      p._liftY = 3;
      if (Math.random() < dt * 30) SK.fx(G, 'dust', p.x - Math.cos(st.ang) * 8, p.y, { dur: 0.25 });
      st.atMax = st.v >= st.max - 1;
    },
    press(G, p) { p.skillT = Math.min(p.skillT, 1e-4); },
    end(G, p) {
      const st = p._cart; p._cart = null;
      delete hurtMods(p).cart; setMul(p, 'moveMul', 'cart', 1); p._liftY = 0;
      if (!st) return;
      // Nhảy xuống: xe nổ tại chỗ; hướng nhảy theo phím đang giữ [ĐO endSkill1Force 30 → trượt ngắn].
      shock(G, p, p.x, p.y, 'explode_miner_skill1');
      const d = dirs(); const a = d != null ? d : st.ang;
      SK.moveBox(G.map, p, Math.cos(a) * CAR.hop, Math.sin(a) * CAR.hop, p.h.body.r);
      if (st.atMax) {
        const lost = p.armorMax - p.armor, n = Math.ceil(lost / 2);
        if (n > 0) { p.armor += n; SK.num(G, p.x, p.y - 30, '+' + n, '#7fd3ff'); K.healFx(G, p); }
      }
      p.invulT = Math.max(p.invulT, 0.2);
    }
  };
  DUR_UI.cart_delivery = 6;

  // ================================================================ SÂU CÁT TẤN CÔNG (skill 2)
  // [ĐO C25Controller: sandWormCreateStartDuration 1,25, sandWormMinDuration 0,0875, sandWormStartRange 4, sandWormMaxRange 8,
  // sandWormRangeAddSpeed 0,25, sandWormEnergyStartCost 0 / AddCost 1 / tối đa 20, sandWormFocusInterval 5, wormAtkAddPassiveEnergy 3,
  // skill2MaxPassiveEnergy 200, giantWormDamage 19 (+5 mỗi lần), giantWormDamageRangeScale 3, giantWormLaunchDelay 0,5,
  // jumpEndDamage 10 trong 2 đơn vị, giantWormFlightSmallWormCount 2–4; explode_miner_skill2 damage 15 + buff_ele].
  // Đơn vị "mỗi giây" của các tốc độ tăng là [ƯỚC LƯỢNG] (mã không cho thấy): chu kỳ giảm 0,1 s mỗi giây, tầm tăng 0,25 đơn vị mỗi giây.
  const SW = { worm: 2 * T, wormT: 0.3, tick: 1, giantR: 6 * T, drain: 200 / 12, hyperGap: 1, flyMin: 5 * T, flyMax: 9 * T, flyT: 0.8, shrink: 0.1 };   // bán kính nổ sâu nhỏ (ô), độ trễ nổ, nhịp tính năng lượng, bán kính sâu khổng lồ = 3 × sâu nhỏ [ĐO], tốc xả thanh Khổng Lồ, giãn cách, quãng lao, thời gian bay
  const swMax = () => C('skill2MaxPassiveEnergy', 200);
  S.sandworm_storm = {
    start(G, p) {
      layer(G);
      p.skillT = 3600;   // bật tắt bằng tay [ĐO info]
      p._sw = { t: 0, spawnT: 0.4, n: 0, tickT: SW.tick, cost: C('sandWormEnergyStartCost', 0), gauge: 0, hyper: false, rel: 0, gap: 0, fly: null };
      dirt(G, p.x, p.y, 5);
    },
    update(G, p, dt) {
      const st = p._sw; if (!st) return;
      st.t += dt; st.gap -= dt;
      if (st.fly) return flight(G, p, st, dt);
      // Tiêu năng lượng mỗi nhịp, mức tiêu tăng dần tới 20 [ĐO]; hết năng lượng thì tắt.
      st.tickT -= dt;
      if (st.tickT <= 0) {
        st.tickT += SW.tick;
        const cost = Math.min(20, C('sandWormEnergyStartCost', 0) + C('sandWormEnergyAddCost', 1) * Math.floor(st.t / SW.tick));
        if (p.energy < cost) { p.skillT = 1e-4; SK.num(G, p.x, p.y - 30, 'Hết năng lượng', '#8a95a8'); return; }
        p.energy -= cost;
      }
      st.spawnT -= dt;
      if (st.spawnT <= 0) {
        st.n++;
        st.spawnT = Math.max(C('sandWormMinDuration', 0.0875), C('sandWormCreateStartDuration', 1.25) - SW.shrink * st.t);
        const range = Math.min(C('sandWormMaxRange', 8), C('sandWormStartRange', 4) + C('sandWormRangeAddSpeed', 0.25) * st.t) * U;
        let x, y;
        const focus = st.n % C('sandWormFocusInterval', 5) === 0 ? nearest(G, p.x, p.y - 6, range + 4 * U) : null;   // cứ 5 con thì một con nhắm quái [ĐO]
        if (focus) [x, y] = ec(focus);
        else for (let k = 0; k < 10; k++) {
          const a = SK.rand() * Math.PI * 2, d = SK.randf(1.5 * T, range);
          x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d;
          if (!wallAt(G, x, y)) break;
        }
        if (x != null && !wallAt(G, x, y)) worm(G, p, st, x, y + 4, false);
      }
      if (st.hyper) { st.gauge -= SW.drain * dt; if (st.gauge <= 0) { st.gauge = 0; st.hyper = false; } }
    },
    // Đủ 200 năng lượng (hoặc đang ở chế độ Khổng Lồ) thì bấm = gọi Sâu Cát Khổng Lồ; không thì bấm để tắt.
    press(G, p) {
      const st = p._sw; if (!st || st.fly) return;
      if (st.hyper || st.gauge >= swMax()) {
        if (st.gap > 0) return;
        st.hyper = true; st.gap = SW.hyperGap; giant(G, p, st);
      } else p.skillT = Math.min(p.skillT, 1e-4);
    },
    end(G, p) {
      const st = p._sw; p._sw = null;
      if (st && st.fly) { st.fly = null; landed(G, p); }
      p._liftY = 0; ghost(p, false); delete hurtMods(p).worm;
    }
  };
  // Sâu cát: chui lên, cắn (nổ) sau SW.wormT, sát thương tích năng lượng cho thanh Khổng Lồ.
  function worm(G, p, st, x, y, big, dmg, r) {
    fx(G, big ? 'miner_sandworm_giant' : 'miner_sandworm', x, y, { layer: 'ground' });
    dirt(G, x, y, big ? 12 : 6);
    G.props.push({ x, y: -1e9, t: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt;
        if (q.t < SW.wormT) return;
        q.gone = true;
        shock(G2, p, x, y - 4, 'explode_miner_skill2', r || SW.worm, dmg != null ? dmg : 15, {
          tag: big ? 'giant' : 'worm',
          onHit() { const s = p._sw; if (s && !s.hyper) s.gauge = Math.min(swMax(), s.gauge + C('wormAtkAddPassiveEnergy', 3)); }
        });
      } });
  }
  // Sâu Khổng Lồ [ĐO giantWormDamage 19 + 5 mỗi lần, trễ 0,5 s, bán kính = 3 × sâu nhỏ]: chỗ trồi lên là dưới chân nếu đang giữ phím
  // hướng (rồi Thợ Mỏ bị hất bay theo hướng đó nếu còn trong vòng), không thì ở quái gần nhất [ƯỚC LƯỢNG].
  function giant(G, p, st) {
    const d = dirs(), tgt = d == null ? nearest(G, p.x, p.y - 6, 14 * U) : null;
    const [x, y] = tgt ? ec(tgt) : [p.x, p.y];
    const dmg = C('giantWormDamage', 19) + C('giantWormDamageAddPerRelease', 5) * st.rel; st.rel++;
    const delay = C('giantWormLaunchDelay', 0.5), r = SW.giantR;
    G.props.push({ x, y: y + 1, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        if (q.t < delay) return;
        q.gone = true;
        worm(G2, p, st, x, y, true, dmg, r);
        if (p._sw === st && !st.fly && Math.hypot(p.x - x, p.y - y) < r) launch(G2, p, st, d != null ? d : aimDir(p));
      },
      draw(ctx, G2, q) {
        const k = Math.min(1, q.t / delay), a = 0.25 + 0.25 * Math.sin(q.t * 24);
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y, r * (0.6 + 0.4 * k), r * (0.6 + 0.4 * k) * 0.7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      } });
  }
  // Bay theo cung: bất tử, sâu nhỏ mọc theo đường bay, đáp xuống nổ jumpEndDamage [ĐO].
  function launch(G, p, st, ang) {
    let d = SW.flyMax;
    while (d > SW.flyMin && wallAt(G, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d)) d -= T / 2;
    const to = [p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d];
    st.fly = { t: 0, from: [p.x, p.y], to, n: 0, want: SK.randi(C('giantWormFlightSmallWormCountMin', 2), C('giantWormFlightSmallWormCountMax', 4)) };
    ghost(p, true); hurtMods(p).worm = () => 0;
  }
  function flight(G, p, st, dt) {
    const f = st.fly; f.t += dt;
    const k = Math.min(1, f.t / SW.flyT);
    p.x = f.from[0] + (f.to[0] - f.from[0]) * k; p.y = f.from[1] + (f.to[1] - f.from[1]) * k;
    p._liftY = Math.sin(k * Math.PI) * 26;
    if (f.n < f.want && k >= (f.n + 1) / (f.want + 1)) { f.n++; worm(G, p, st, p.x + SK.randf(-10, 10), p.y + SK.randf(-6, 6), false); }
    if (k >= 1) { st.fly = null; landed(G, p); }
  }
  function landed(G, p) {
    p._liftY = 0; ghost(p, false); delete hurtMods(p).worm;
    if (p.invulT < 0.3) p.invulT = 0.3;
    shock(G, p, p.x, p.y, 'explode_miner_skill1', C('jumpEndDamageRange', 2) * U, C('jumpEndDamage', 10), { tag: 'skill' });
  }

  // ---------------------------------------------------------------- vẽ thêm lên Thợ Mỏ: xe khoáng, gò đất dưới đất, thanh Sâu Khổng Lồ
  const drawPlayer0 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player;
    if (!p || p.hero !== 'miner') return drawPlayer0(ctx, G);
    if (p._ug) {
      // Dưới đất: chỉ thấy đất phồng chạy theo [ĐO SK: nhân vật ẩn, để lại vệt đất].
      ctx.save(); ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a6238'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 2, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return;
    }
    if (p._cart) {
      const f = carFrame(p._cart.ang);
      if (SK.frame(f)) SK.draw(ctx, f, p.x, p.y + 4);
      }
    drawPlayer0(ctx, G);
    const st = p._sw;
    if (st && p.skillT > 0) {
      const w = 18, x = Math.round(p.x - w / 2), y = Math.round(p.y - 30 - (p._liftY || 0)), max = swMax();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = st.hyper || st.gauge >= max ? '#ffb43c' : '#c9a15a'; ctx.fillRect(x, y, Math.round(w * st.gauge / max), 2);
    }
  };
})();
