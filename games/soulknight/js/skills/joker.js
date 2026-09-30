// Kỹ năng Nhà Ảo Thuật (c34): shadow_crescendo, mirage_masque. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, I = SK.input;
  const C = (f, d) => K.CTRL('joker', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const ec = K.ec, alive = K.alive;

  // ---------------------------------------------------------------- ảo ảnh (bản sao đi theo, nội tại Ảo Ảnh Vạn Trạng)
  // [ĐO C35Controller] cứ passivePhantomCreatTime 5 s có thêm một ảo ảnh, tối đa maxPassivePhantomCount 2; ảo ảnh tạm của chiêu
  // cuối sống timeLimitPhantomTime 15 s. Mọi ảo ảnh làm lại đúng động tác của người chơi khi dùng kỹ năng.
  const PH = {
    every: () => C('passivePhantomCreatTime', 5), max: () => C('maxPassivePhantomCount', 2), life: () => C('timeLimitPhantomTime', 15),
    follow: 150, alpha: 0.55   // tốc đi theo, độ mờ [ƯỚC LƯỢNG]
  };
  const st = p => p._jk || (p._jk = { ph: [], pt: 0, e: 0, dash: [], ult: null, m: null });
  const drawPlayer0 = SK.drawPlayer;
  // Vẽ bản sao: gọi lại drawPlayer với toạ độ của ảo ảnh, độ mờ nhân vào (drawPlayer gán globalAlpha nên chắn thuộc tính).
  function drawClone(ctx, G, a) {
    const p = G.player, ox = p.x, oy = p.y, of = p.face, oa = p.aim, oh = p.hidden, oal = p._alpha, olift = p._liftY;
    p.x = a.x; p.y = a.y; p.face = a.face; p.hidden = false; p._liftY = 0; p._alpha = null;
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'globalAlpha'), k = PH.alpha * (a.fade == null ? 1 : a.fade);
    Object.defineProperty(ctx, 'globalAlpha', { configurable: true, get() { return d.get.call(this) / k; }, set(v) { d.set.call(this, v * k); } });
    ctx.globalAlpha = 1;
    try { drawPlayer0(ctx, G); } finally { delete ctx.globalAlpha; p.x = ox; p.y = oy; p.face = of; p.aim = oa; p.hidden = oh; p._alpha = oal; p._liftY = olift; }
  }
  function addPhantom(G, p, x, y, temp) {
    const s = st(p);
    const a = { x, y, face: p.face, phantom: true, temp: !!temp, ttl: temp ? PH.life() : 0, atk: 0, off: s.ph.length,
      update(G2, q, dt) { phantomTick(G2, p, q, dt); },
      draw(ctx, G2, q) { drawClone(ctx, G2, q); } };
    K.addAlly(G, a);
    s.ph.push(a);
    fx(G, 'phantom', x, y - 6, { dur: 0.4 });
    return a;
  }
  const phantoms = (G, p) => (st(p).ph = st(p).ph.filter(a => !a.gone));
  function phantomTick(G, p, a, dt) {
    if (a.temp && (a.ttl -= dt) <= 0) { a.gone = true; return; }
    if (a.dashing) return;
    if (a.fight) {
      // Ảo ảnh chiêu Màn Ảo Thuật: xông vào quái gần nhất và chém bằng kiếm ảo ảnh.
      const e = K.nearest(G, a.x, a.y - 6, 9 * T, {});
      if (e) {
        const [ex, ey] = ec(e), d = K.walk(G, a, ex, ey + 6, 100, dt);
        if ((a.atk -= dt) <= 0 && d < 2 * T) {
          a.atk = 1 / MM.atkSpeed();
          for (const q of K.inRadius(G, a.x, a.y - 6, 2 * T)) K.hit(G, p, q, MM.phantomDmg, { critChance: MM.phantomCrit, repel: 2, fx: 'hit_red', tag: 'phantom' });
          fx(G, 'sword_joker_skill_phantom_1', a.x, a.y - 7, { ang: a.face > 0 ? 0 : Math.PI, dur: 0.4 });
        }
        return;
      }
    }
    // Đi theo người chơi, đứng lệch phía sau theo thứ tự.
    const i = phantoms(G, p).indexOf(a), tx = p.x - p.face * (16 + 12 * i), ty = p.y + (i % 2 ? 6 : -4);
    if (Math.hypot(tx - a.x, ty - a.y) > 12 * T) { a.x = tx; a.y = ty; }
    else if (K.walk(G, a, tx, ty, PH.follow, dt) > 3) a.moving = true;
    a.face = p.face;
  }
  K.timers.joker = (G, p, dt) => {
    if (p.hero !== 'joker') return;
    const s = st(p);
    if (!(s.pt >= 0)) s.pt = 0;
    if (phantoms(G, p).filter(a => !a.temp).length < PH.max()) { s.pt += dt; if (s.pt >= PH.every()) { s.pt = 0; addPhantom(G, p, p.x - p.face * 14, p.y, false); } }
    else s.pt = 0;
    dashTick(G, p, s, dt);
    ultTick(G, p, s, dt);
  };
  SK.on('stageEnter', (G, p0) => { const p = G.player; if (p && p._jk) { p._jk.ph = []; p._jk.dash = []; p._jk.ult = null; } });

  // ---------------------------------------------------------------- Ảnh Kiếm Vũ
  // [ĐO C35Controller + config] cd 4, maxCount 2, args 3. Lao 5 ô [WIKI] (skill0DashForce 50 ô/s), bất tử khi lao, đâm
  // (skill0SwordDamage 8, swordScale 2,35) rồi chém vòng (skill0SlashDamage 16, slashScale 3,85) sau skill0SwordDelay 0,125 s.
  // Mỗi lần dùng cộng skill0DeltaPassiveEnergy 5 vào thanh bùng nổ (tối đa skill0MaxPassiveEnergy 100); đầy thì lần bấm kế
  // là Kiếm Vũ: tạo KageBunshinCount 3 ảo ảnh tạm rồi tất cả lao tới tầm hyperRange 15 ô (hyperRangeNoEnemy 3 ô nếu không có quái).
  const SC = {
    dist: 5 * T, speed: () => C('skill0DashForce', 50) * U, sword: () => C('skill0SwordDamage', 8), slash: () => C('skill0SlashDamage', 16),
    delay: () => C('skill0SwordDelay', 0.125), slashR: () => C('slashScale', 3.85) * T * 0.5, swordR: () => C('swordScale', 2.35) * T * 0.5,
    gain: () => C('skill0DeltaPassiveEnergy', 5), full: () => C('skill0MaxPassiveEnergy', 100), clones: () => C('KageBunshinCount', 3),
    hyper: () => C('hyperRange', 15) * T, hyperNone: () => C('hyperRangeNoEnemy', 3) * T, hyperMul: 1.5, w: 14   // hệ số vùng chém Kiếm Vũ, bề rộng đường lao [ƯỚC LƯỢNG]
  };
  // Một lượt lao của người chơi hoặc ảo ảnh: đâm dọc đường, chém vòng ở điểm tới.
  function startDash(G, p, act, ang, dist, o) {
    const d = { act, ang, left: dist, v: SC.speed(), hit: new Set(), t: 0, slashed: false, t0: 0, mul: (o && o.mul) || 1, dmg: (o && o.dmg) || 1, self: act === p, phantom: act !== p, cx: act.x, cy: act.y };
    act.dashing = true; act.face = Math.cos(ang) >= 0 ? 1 : -1;
    st(p).dash.push(d);
    fx(G, act === p ? 'sword_joker_skill_1' : 'sword_joker_skill_phantom_1', act.x, act.y - 7, { ang: Math.cos(ang) < 0 ? ang + Math.PI : ang, flip: Math.cos(ang) < 0, dur: 0.5 });
    return d;
  }
  function dashTick(G, p, s, dt) {
    for (const d of s.dash) {
      const a = d.act; d.t += dt;
      if (d.left > 0) {
        const step = Math.min(d.left, d.v * dt);
        let mx = Math.cos(d.ang) * step, my = Math.sin(d.ang) * step;
        if (d.self) { const mv = I.moveVec(), w = p.h.speed * U * (p.moveMul || 1) * dt; mx -= mv.x * w; my -= mv.y * w; }
        const x0 = a.x, y0 = a.y;
        SK.moveBox(G.map, a, mx, my, 4);
        d.left = Math.max(0, d.left - step);
        if (Math.hypot(a.x - x0, a.y - y0) < step * 0.2) d.left = 0;   // chạm tường thì dừng
        stab(G, p, d, x0, y0);
        if (d.left <= 0) d.t0 = d.t;
      } else if (!d.slashed) {
        if (d.t >= d.t0 + SC.delay()) { d.slashed = true; d.t1 = d.t; slash(G, p, d); }
      } else if (d.t >= d.t1 + 0.2) { d.done = true; a.dashing = false; }
    }
    s.dash = s.dash.filter(d => !d.done);
    K.ghost(p, !!p.dashing);
  }
  function stab(G, p, d, x0, y0) {
    const a = d.act, c = Math.cos(d.ang), sn = Math.sin(d.ang), L = Math.hypot(a.x - x0, a.y - y0);
    for (const e of G.enemies) {
      if (!alive(e) || d.hit.has(e)) continue;
      const [x, y] = ec(e), dx = x - x0, dy = y - (y0 - 7), u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (u > -8 && u < L + SC.swordR() && Math.abs(v) < SC.w / 2 + e.r) {
        d.hit.add(e);
        K.hit(G, p, e, SC.sword() * d.dmg, { critChance: p.crit, ang: d.ang, repel: 2, fx: 'hit_red', tag: 'stab' });
      }
    }
  }
  function slash(G, p, d) {
    const a = d.act, r = SC.slashR() * d.mul;
    fx(G, d.self ? 'sword_joker_skill' : 'sword_joker_skill_phantom', a.x, a.y - 7, { scale: d.mul, dur: 0.5 });
    for (const e of K.inRadius(G, a.x, a.y - 6, r)) K.hit(G, p, e, SC.slash() * d.dmg, { critChance: p.crit, ang: Math.atan2(ec(e)[1] - a.y, ec(e)[0] - a.x), repel: 3, fx: 'hit_red', tag: 'slash' });
    G.shake = Math.max(G.shake, d.mul > 1 ? 4 : 2);
  }
  const full = p => st(p).e >= SC.full();
  function crescendo(G, p, ult) {
    const s = st(p);
    const { e, ang } = K.targetAng(G, p, ult ? SC.hyper() : SC.dist + 2 * T);
    let dist = SC.dist;
    if (ult) dist = e ? Math.min(SC.hyper(), Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y)) : SC.hyperNone();
    if (ult) {
      s.e = 0;
      for (let i = 0; i < SC.clones(); i++) addPhantom(G, p, p.x - p.face * 8 + (i - 1) * 10, p.y + (i - 1) * 6, true);
    } else s.e = Math.min(SC.full(), s.e + SC.gain());
    const o = ult ? { mul: SC.hyperMul } : {};
    startDash(G, p, p, ang, dist, o);
    for (const a of phantoms(G, p)) startDash(G, p, a, ang, dist, o);
    const total = dist / SC.speed() + SC.delay() + 0.3;
    p.skillT = total;
    K.hurtMods(p).jdash = (G2, pl, dmg) => (pl.dashing ? 0 : dmg);
  }
  S.shadow_crescendo = {
    start(G, p) {
      K.layer(G);
      if (full(p)) { p._cdAfter = 0; crescendo(G, p, true); return; }
      K.charges(p, 'shadow_crescendo'); K.useCharge(p, 'shadow_crescendo');
      crescendo(G, p, false);
    },
    pressCd(G, p) { if (full(p)) crescendo(G, p, true); },
    end(G, p) { delete K.hurtMods(p).jdash; }
  };

  // ---------------------------------------------------------------- Màn Ảo Thuật
  // [ĐO C35Controller + config] cd 5, maxCount 2, dur 1,5, args 3. Ném áo choàng: vòng chém slashDamage 12 (slashSize 2),
  // tàng hình (mờ 0,297 [ĐO buff_stealth]), chạy nhanh, giảm sát thương; áo choàng quay quanh người gây slashFlyDamage 12 mỗi
  // nhịp cho quái gần. Bấm lại hoặc hết giờ: thu áo, hiện hình, vòng chém mở rộng (slashSizeEnd 2,5) slashDamage 12.
  // Mỗi lần dùng cộng skill1PassiveEnergy 10; đầy thì bấm kỹ năng kế là Chiêu Cuối: KageBunshinCount 3 ảo ảnh tạm (15 s) áp sát
  // quái cùng đánh, bấm lại hoặc hết giờ thì mỗi ảo ảnh thành áo choàng bay về người gây 12 sát thương diện rộng.
  const MM = {
    dmg: () => C('slashDamage', 12), fly: () => C('slashFlyDamage', 12), r0: () => C('slashSize', 2) * T * 1.5, r1: () => C('slashSizeEnd', 2.5) * T * 1.5,
    gain: () => C('skill1PassiveEnergy', 10), atkSpeed: () => C('atkSpeed', 1.25),
    move: 1.5, take: 0.5, orbitR: 2.5 * T, tick: 0.3,        // tốc chạy, hệ số sát thương nhận, bán kính và nhịp áo choàng [ƯỚC LƯỢNG]
    phantomDmg: 6, phantomCrit: 20, cloakSpeed: 240, cloakR: 3 * T   // đòn kiếm ảo ảnh [ĐO weapon_init_joker đạn 6, bạo kích 20], áo choàng bay [ƯỚC LƯỢNG]
  };
  function maskEnd(G, p) {
    const m = st(p).m; if (!m) return;
    st(p).m = null;
    p.hidden = false; p._alpha = null; K.setMul(p, 'moveMul', 'mirage', 1); delete K.hurtMods(p).mirage;
    K.stopFx(m.fx);
    circle(G, p, MM.r1(), 'circle_slash');
  }
  function circle(G, p, r, name) {
    fx(G, name, p.x, p.y - 6, { scale: r / (2 * T * 1.5), dur: 0.5 });
    for (const e of K.inRadius(G, p.x, p.y - 6, r)) K.hit(G, p, e, MM.dmg(), { critChance: p.crit, ang: Math.atan2(ec(e)[1] - p.y, ec(e)[0] - p.x), repel: 3, fx: 'hit_red', tag: 'circle' });
    // Vòng chém cũng phá đạn địch trong vùng [ĐO mô tả nâng cấp: "trúng đạn địch"].
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - p.x, b.y - (p.y - 6)) < r) b.dead = true;
    G.shake = Math.max(G.shake, 3);
  }
  function maskStart(G, p) {
    const s = st(p);
    K.charges(p, 'mirage_masque'); K.useCharge(p, 'mirage_masque');
    s.e = Math.min(SC.full(), s.e + MM.gain());
    const dur = K.cfg(p, 'mirage_masque').dur || 1.5;
    p.skillT = dur;
    s.m = { t: 0, tick: 0 };
    circle(G, p, MM.r0(), 'circle_slash');
    p.hidden = true; p._alpha = 0.297;
    K.setMul(p, 'moveMul', 'mirage', MM.move);
    K.hurtMods(p).mirage = (G2, pl, dmg) => Math.max(1, Math.round(dmg * MM.take));
    s.m.fx = fx(G, 'joker_fly_slash', p.x, p.y - 7, { follow: p, dy: -7, dur });
  }
  function ultStart(G, p) {
    const s = st(p);
    s.e = 0;
    const near = G.enemies.filter(e => alive(e) && K.inRoom(G, e)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    for (let i = 0; i < SC.clones(); i++) {
      const e = near[i % Math.max(1, near.length)];
      const bx = e ? e.x : p.x, by = e ? e.y : p.y, ang = i * 2.1;
      const a = addPhantom(G, p, bx + Math.cos(ang) * 22, by + Math.sin(ang) * 14, true);
      a.fight = true; a.ttl = PH.life() + 1;
    }
    s.ult = { t: 0 };
  }
  // Chiêu Cuối kết thúc: ảo ảnh tạm hoá áo choàng bay về người chơi, đi tới đâu chém tới đó, tới nơi thì nổ diện rộng.
  function ultEnd(G, p) {
    const s = st(p); if (!s.ult) return;
    s.ult = null;
    for (const a of phantoms(G, p)) {
      if (!a.fight) continue;
      a.gone = true;
      const c = { x: a.x, y: a.y, t: 0, hit: new Set() };
      c.h = fx(G, 'joker_fly_slash_phantom', c.x, c.y - 7, { follow: c, dy: -7, dur: 3 });
      s.cloaks = (s.cloaks || []).concat(c);
    }
  }
  function ultTick(G, p, s, dt) {
    if (s.ult && (s.ult.t += dt) >= PH.life()) ultEnd(G, p);
    if (!s.cloaks) return;
    for (const c of s.cloaks) {
      const dx = p.x - c.x, dy = (p.y - 6) - c.y, d = Math.hypot(dx, dy), k = Math.min(d, MM.cloakSpeed * dt);
      if (d > 0) { c.x += dx / d * k; c.y += dy / d * k; }
      for (const e of K.inRadius(G, c.x, c.y, 10)) if (!c.hit.has(e)) { c.hit.add(e); K.hit(G, p, e, MM.fly(), { critChance: p.crit, repel: 2, fx: 'hit_red', tag: 'cloak' }); }
      if (d - k < 4) {
        c.done = true; K.stopFx(c.h);
        for (const e of K.inRadius(G, p.x, p.y - 6, MM.cloakR)) if (!c.hit.has(e)) K.hit(G, p, e, MM.fly(), { critChance: p.crit, repel: 3, fx: 'hit_red', tag: 'cloak' });
      }
    }
    s.cloaks = s.cloaks.filter(c => !c.done);
  }
  S.mirage_masque = {
    start(G, p) {
      K.layer(G);
      if (st(p).ult) { p._cdAfter = 0; ultEnd(G, p); return; }
      if (full(p)) { p._cdAfter = 0; ultStart(G, p); return; }
      maskStart(G, p);
    },
    pressCd(G, p) { if (st(p).ult) ultEnd(G, p); else if (full(p)) ultStart(G, p); },
    press(G, p) { p.skillT = Math.min(p.skillT, 1e-4); },
    update(G, p, dt) {
      const m = st(p).m; if (!m) return;
      m.tick -= dt;
      if (m.tick <= 0) {
        m.tick += MM.tick;
        for (const e of K.inRadius(G, p.x, p.y - 6, MM.orbitR)) K.hit(G, p, e, MM.fly(), { critChance: p.crit, repel: 1, fx: 'hit_red', tag: 'cloak' });
      }
    },
    end(G, p) { maskEnd(G, p); }
  };

  // Thanh bùng nổ nhỏ trên nút kỹ năng.
  SK.on('hud', (ctx, G) => {
    const p = G.player, id = p && p.h.skill && p.h.skill.id;
    if (!p || G.state !== 'stage' || p.hero !== 'joker' || (id !== 'shadow_crescendo' && id !== 'mirage_masque')) return;
    const s = st(p), v = SK.view, cx = v.w - 16, cy = v.h - 17, k = Math.min(1, s.e / SC.full());
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 14, cy - 12, 28, 3);
    ctx.fillStyle = k >= 1 ? '#ffe06a' : '#b48cff'; ctx.fillRect(cx - 14, cy - 12, Math.round(28 * k), 3);
  });
})();
