// Kỹ năng Kẻ Vượt Ranh Giới (c17): dimension_jumping, blackhole_refract_blackhole_burst. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, W = SK.world, U = SK.PPU, I = SK.input;
  const C = (f, d) => K.CTRL('transcendent', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const isMe = p => p.hero === 'transcendent';
  const args = (p, id) => String(K.cfg(p, id).args || '').split(';').map(Number);
  const num = (G, p, v, color) => SK.num(G, p.x, p.y - 26, v, color);

  // ================================================================ Bước Nhảy Không Gian
  // [ĐO c17Controller (dump: C18Controller) + config] cd 8, dur 3, args 3 (số lần kéo dài). Đếm ngược Đánh Dấu delayDeadTime 8 s
  // (buff_delay_dead); khe nứt sống crackLifeTime 2,5 s, tối đa 3, mỗi createCrackCd 1,5 s ở bán kính 3–6 ô quanh người;
  // qua khe: +recoverEnergy 5 năng lượng, kéo dài addSkillTime 0,85 s, tăng tốc addMoveSpeedRate 0,75 trong addMoveSpeedTime 0,3 s
  // (0,3 nếu ngoài kỹ năng); trong kỹ năng chạy nhanh thêm addMoveSpeedSkill 0,45.
  // [ƯỚC LƯỢNG, mã chưa đọc được] tầm sóng xung kích 2,5 ô, rút ngắn đếm ngược 2 s mỗi sóng, hết đếm ngược thì quái thường chết
  // ("delay dead"), trùm nhận 30 + 1 mỗi đòn đã đánh. Chưa làm: addHandCutDamage/HandCut (đòn chém tay), tăng ngưỡng theo cấp.
  const DJ = {
    delay: C('delayDeadTime', 8), life: C('crackLifeTime', 2.5), max: C('maxCrackCount', 3), gap: C('createCrackCd', 1.5),
    rmin: (C('radiusRange', [3, 6])[0]) * T, rmax: (C('radiusRange', [3, 6])[1]) * T,
    addT: C('addSkillTime', 0.85), energy: C('recoverEnergy', 5), skillSpeed: 1 + C('addMoveSpeedSkill', 0.45),
    boost: 1 + C('addMoveSpeedRate', 0.75), boostOut: 1 + C('addMoveSpeedRateNoSkill', 0.3), boostT: C('addMoveSpeedTime', 0.3),
    wave: 2.5 * T, cut: 2, bossBase: 30, bossPer: 1, touch: 12, alpha: 0.5
  };

  function mark(G, e) {
    if (!K.alive(e) || e._mark) return false;
    e._mark = { t: DJ.delay, hits: 0 };
    return true;
  }
  function markProp(G) {
    if (G._djProp && G.props.indexOf(G._djProp) >= 0) return;
    G._djProp = { x: 0, y: 1e9 + 2, update() {},
      draw(ctx, G2) {
        for (const e of G2.enemies) {
          if (!e._mark || !K.alive(e)) continue;
          const top = K.enemyTop(e) - 8;
          SK.text(ctx, String(Math.ceil(e._mark.t)), e.x, top, 8, '#ff6b6b', 'center', '#000');
          if (e.boss && e._mark.hits) SK.text(ctx, '×' + e._mark.hits, e.x, top - 9, 7, '#ffe06a', 'center', '#000');
        }
      } };
    G.props.push(G._djProp);
  }

  // Khe nứt: tại chỗ trống cách người 3–6 ô, người chơi chạm vào thì nổ sóng xung kích.
  function spawnCrack(G, x, y) {
    const c = { x, y, life: DJ.life, gone: false };
    c.h = fx(G, 'transcendent_0_crack', x, y, {});
    (G._cracks = G._cracks || []).push(c);
    return c;
  }
  function freeSpot(G, p) {
    for (let i = 0; i < 12; i++) {
      const a = SK.rand() * Math.PI * 2, r = DJ.rmin + SK.rand() * (DJ.rmax - DJ.rmin), x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!W.boxHits(G.map, x - 6, y - 6, x + 6, y)) return [x, y];
    }
    return null;
  }
  function trigger(G, p, c) {
    c.gone = true; K.stopFx(c.h);
    fx(G, 'transcendent_cross_effect', c.x, c.y - 6, {});
    p.energy = Math.min(p.energyMax, p.energy + DJ.energy);
    num(G, p, '+' + DJ.energy, '#7fd3ff');
    for (const e of K.inRadius(G, c.x, c.y - 6, DJ.wave)) {
      if (!mark(G, e) && e._mark) e._mark.t = Math.max(0.05, e._mark.t - DJ.cut);
    }
    const inSkill = p.skillT > 0 && p._dj;
    if (inSkill && p._dj.added < args(p, 'dimension_jumping')[0]) { p._dj.added++; p.skillT += DJ.addT; }
    p._boost = { t: DJ.boostT, f: inSkill ? DJ.boost : DJ.boostOut };
    G.shake = Math.max(G.shake, 1);
    markProp(G);
  }
  function resolve(G, p, e) {
    const m = e._mark; e._mark = null;
    fx(G, 'transcendent_cross_effect', e.x, e.y - 8, {});
    const dmg = e.boss ? DJ.bossBase + DJ.bossPer * m.hits : Math.max(1, e.hp);
    K.hit(G, p, e, dmg, { noMul: true, crit: false, ang: 0, tag: 'mark' });
  }
  K.timers.dimension = (G, p, dt) => {
    if (!isMe(p)) return;
    for (const e of G.enemies) {
      if (!e._mark) continue;
      if (!K.alive(e)) { e._mark = null; continue; }
      e._mark.t -= dt;
      if (e._mark.t <= 0) resolve(G, p, e);
    }
    if (p._boost) { p._boost.t -= dt; K.setMul(p, 'moveMul', 'djb', p._boost.t > 0 ? p._boost.f : 1); if (p._boost.t <= 0) p._boost = null; }
    const cs = G._cracks;
    if (cs && cs.length) {
      for (const c of cs) {
        c.life -= dt;
        if (c.life <= 0) { c.gone = true; K.stopFx(c.h); continue; }
        if (p.st !== 'dead' && Math.hypot(p.x - c.x, p.y - c.y) < T) trigger(G, p, c);
      }
      G._cracks = cs.filter(c => !c.gone);
    }
    if (p.h.skill && p.h.skill.id === 'dimension_jumping' && G.state === 'stage' && G.enemies.some(e => K.alive(e))) {
      G._crackT = (G._crackT == null ? DJ.gap : G._crackT) - dt;
      if (G._crackT <= 0) {
        G._crackT = DJ.gap;
        if ((G._cracks || []).length < DJ.max) { const s = freeSpot(G, p); if (s) spawnCrack(G, s[0], s[1]); }
      }
    }
  };
  // Đòn thường của người chơi lên trùm đang bị đánh dấu: tích số đòn.
  SK.on('enemyHit', (G, e) => { if (e._mark && e.boss && !G._skHit) e._mark.hits++; });

  S.dimension_jumping = {
    start(G, p) {
      K.layer(G); markProp(G);
      p.skillT = K.cfg(p, 'dimension_jumping').dur || 3;
      p._dj = { added: 0, lx: p.x, ly: p.y };
      K.setMul(p, 'moveMul', 'dj', DJ.skillSpeed);
      K.ghost(p, true); K.hurtMods(p).dj = () => 0;
      p._alpha = DJ.alpha;
      fx(G, 'skill_transcendent_shuttle', p.x, p.y - 6, {});
    },
    update(G, p, dt) {
      const s = p._dj; if (!s) return;
      // Xuyên địa hình: bỏ kết quả va chạm của khung này, đi thẳng theo hướng bấm (chỉ giữ trong bản đồ).
      const mv = I.moveVec(), spd = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      p.x = Math.max(8, Math.min(G.map.W * T - 8, s.lx + mv.x * spd));
      p.y = Math.max(T, Math.min(G.map.H * T - 2, s.ly + mv.y * spd));
      s.lx = p.x; s.ly = p.y;
      for (const e of G.enemies) {
        if (!K.alive(e)) continue;
        const [cx, cy] = K.ec(e);
        if (Math.hypot(cx - p.x, cy - (p.y - 6)) < DJ.touch + e.r) mark(G, e);
      }
    },
    end(G, p) {
      const s = p._dj; p._dj = null;
      K.setMul(p, 'moveMul', 'dj', 1); K.ghost(p, false); delete K.hurtMods(p).dj; p._alpha = null;
      if (!s) return;
      // Đang nằm trong tường thì đẩy ra chỗ trống gần nhất.
      const r = p.h.body.r, blocked = (x, y) => W.boxHits(G.map, x - r, y - r, x + r, y);
      if (blocked(p.x, p.y)) {
        outer: for (let d = 2; d <= 8 * T; d += 2) for (let k = 0; k < 16; k++) {
          const a = k * Math.PI / 8, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (!blocked(x, y)) { p.x = x; p.y = y; break outer; }
        }
      }
      fx(G, 'skill_transcendent_shuttle', p.x, p.y - 6, {});
    }
  };
  S.dimension_jumping.DJ = DJ; S.dimension_jumping.spawnCrack = spawnCrack; S.dimension_jumping.mark = mark;

  // ================================================================ Khúc Xạ Hố Đen / Bùng Nổ Hố Đen
  // [ĐO config + c17Controller skill2*] cd 5 (mỗi lượt), 3 lượt, tối đa 3 Hố Đen, args 3;3;5 (lượt; số hố; giây tăng tốc vô địch).
  // Khúc Xạ: đặt hố tại chỗ, tàng hình skill2ShuttleDuration 1 s; shuttleHurtRate 50 = 50% vẫn bị thương; đạn của người chơi
  // bay qua hố thì nhân bản ở các hố khác, sát thương giảm skill2DamageDecayPerExtraRift 0,2 mỗi hố thêm (sàn skill2MinDamageFactor 0,5).
  // Bùng Nổ: mọi hố nổ, skill2ExplodeDamage 20 trong skill2ExplodeRadius 5 ô (trễ 0,1 s), hồi skill2EnergyRestorePerRift 10 mỗi hố,
  // tăng tốc skill2BurstSpeedRate 0,3 và vô địch args[2] s; hồi chiêu Bùng Nổ skill2BurstCooldown 8 s.
  // Bấm K: có lượt thì đặt hố; bấm lần nữa trong lúc tàng hình hoặc khi hết lượt thì Bùng Nổ (nút riêng ButtonGroup chưa dựng).
  // Chưa làm: nhân bản tia laser / khoan / bezier (Skill2Laser*, Skill2DrillCopies), skill2ShotgunAimOffset.
  const BH = {
    shuttle: C('skill2ShuttleDuration', 1), hurt: C('shuttleHurtRate', 50), dmg: C('skill2ExplodeDamage', 20), r: C('skill2ExplodeRadius', 5) * T,
    energy: C('skill2EnergyRestorePerRift', 10), decay: C('skill2DamageDecayPerExtraRift', 0.2), minF: C('skill2MinDamageFactor', 0.5),
    speed: C('skill2BurstSpeedRate', 0.3), cd: C('skill2BurstCooldown', 8), delay: 0.1, pick: T, alpha: 0.3   // bán kính bắt đạn [ƯỚC LƯỢNG]
  };
  const rifts = G => (G._rifts = (G._rifts || []).filter(r => !r.gone));
  function place(G, p, x, y) {
    const list = rifts(G), max = args(p, 'blackhole_refract_blackhole_burst')[1] || 3;
    while (list.length >= max) { const o = list.shift(); o.gone = true; K.stopFx(o.h); }
    const r = { x, y, room: G.room, gone: false };
    r.h = fx(G, 'transcendent_0_rift_visual', x, y, {});
    list.push(r);
    G._rifts = list;
    return r;
  }
  K.timers.rift = (G, p, dt) => {
    if (!isMe(p)) return;
    if (p._bhCd > 0) p._bhCd -= dt;
    const list = rifts(G);
    for (const r of list) if (r.room !== G.room) { r.gone = true; K.stopFx(r.h); }
    if (list.length < 2) return;
    const live = list.filter(r => !r.gone), f = Math.max(BH.minF, 1 - BH.decay * (live.length - 1));
    for (const b of G.bullets) {
      if (b.side !== 'p' || b.dead || b._rc) continue;
      const src = live.find(r => Math.hypot(b.x - r.x, b.y - r.y) < BH.pick);
      if (!src) continue;
      b._rc = 1;
      for (const r of live) {
        if (r === src) continue;
        G.bullets.push(Object.assign({}, b, { x: r.x + (b.x - src.x), y: r.y + (b.y - src.y), dmg: b.dmg * f, hits: null, _rc: 1, dead: false }));
      }
    }
  };
  function burst(G, p) {
    const list = rifts(G);
    if (!list.length || p._bhCd > 0) return false;
    K.layer(G);
    const id = 'blackhole_refract_blackhole_burst', t = args(p, id)[2] || 5;
    for (const r of list) {
      r.gone = true; K.stopFx(r.h);
      fx(G, 'transcendent_0_rift_burst', r.x, r.y - 6, {});
      G.props.push({ x: r.x, y: 1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt; if (q.t < BH.delay) return;
          q.gone = true;
          for (const e of K.inRadius(G2, r.x, r.y - 6, BH.r)) K.hit(G2, p, e, BH.dmg, { noMul: true, crit: false, ang: Math.atan2(e.y - r.y, e.x - r.x), repel: 3, tag: 'rift_burst' });
        } });
    }
    const gain = BH.energy * list.length;
    p.energy = Math.min(p.energyMax, p.energy + gain);
    num(G, p, '+' + gain, '#7fd3ff');
    G._rifts = [];
    p._bhCd = BH.cd;
    cleanStealth(p);
    p._bh = { mode: 'burst' };
    p.skillT = t;
    K.setMul(p, 'moveMul', 'bh', 1 + BH.speed);
    K.hurtMods(p).bh = () => 0;
    p._bh.h = fx(G, 'transcendent_skill_1_trail', p.x, p.y, { follow: p, dur: t });
    G.shake = Math.max(G.shake, 3);
    return true;
  }
  function cleanStealth(p) { p.hidden = false; p._alpha = null; delete K.hurtMods(p).bh; }
  S.blackhole_refract_blackhole_burst = {
    start(G, p) {
      K.layer(G);
      const id = 'blackhole_refract_blackhole_burst';
      K.charges(p, id); K.useCharge(p, id);
      place(G, p, p.x, p.y - 4);
      p.skillT = BH.shuttle;
      p._bh = { mode: 'stealth' };
      p.hidden = true; p._alpha = BH.alpha;
      K.hurtMods(p).bh = (G2, pl, dmg) => (SK.rand() * 100 < BH.hurt ? dmg : 0);
    },
    press(G, p) { if (p._bh && p._bh.mode === 'stealth') burst(G, p); },
    pressCd(G, p) { burst(G, p); },
    end(G, p) {
      const b = p._bh; p._bh = null;
      cleanStealth(p);
      if (b && b.mode === 'burst') { K.setMul(p, 'moveMul', 'bh', 1); K.stopFx(b.h); }
    }
  };
  S.blackhole_refract_blackhole_burst.BH = BH; S.blackhole_refract_blackhole_burst.place = place;
})();
