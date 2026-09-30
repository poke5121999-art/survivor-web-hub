// Kỹ năng Nhà Ảo Thuật (c34): shadow_crescendo, mirage_masque. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE, U = SK.PPU, I = SK.input;
  const C = (f, d) => K.CTRL('joker', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const ec = K.ec, alive = K.alive;
  const RAD = Math.PI / 180;

  // ---------------------------------------------------------------- ảo ảnh (bản sao đi theo, nội tại Ảo Ảnh Vạn Trạng)
  // [ĐO C35Controller] cứ passivePhantomCreatTime 5 s có thêm một ảo ảnh, tối đa maxPassivePhantomCount 2; ảo ảnh tạm của chiêu
  // cuối sống timeLimitPhantomTime 15 s. Mọi ảo ảnh làm lại động tác kỹ năng của người chơi (JokerSkillEvent -> PhantomSkill0/1)
  // nhưng sát thương nhân hệ số min(1, 0,25 + 0,1 x BigLevel) cho kỹ năng 0 và min(1, 0,5 + 0,1 x BigLevel) cho kỹ năng 1
  // [ĐO JokerMercenaryController.GetSkill0SlashDamage / GetSkill1SlashDamage; BigLevel = ải 1..3 -> (chỉ số ải / 5) + 1].
  const PH = {
    every: () => C('passivePhantomCreatTime', 5), max: () => C('maxPassivePhantomCount', 2), life: () => C('timeLimitPhantomTime', 15),
    createDura: () => C('createDura', 0.125), cd: () => C('phantomSkillCd', 2.5),
    // Prefab phantom (skin_0): RoleAttribute speed 6, JokerMercenaryController min_follow_distance 2 / max_follow_distance 20 (quá xa thì bay về
    // chủ, shouldFlyToMaster), meleeScoutDistance 12, atk_range 2, cận chiến [ĐO skin/character/joker/skin_0]. Độ mờ chưa đọc được [ƯỚC LƯỢNG].
    follow: 6 * U, near: 2 * T, far: 20 * T, scout: 12 * T, reach: 2 * T, alpha: 0.55
  };
  const big = G => Math.floor((G.stageIdx || 0) / 5) + 1;
  const factor = (G, base) => Math.min(1, base + 0.1 * big(G));
  const st = p => p._jk || (p._jk = { ph: [], pt: 0, e: 0, dash: [], ult: null, m: null, imm: 0, drain: 0, spd: 0 });
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
    if (a.cdT > 0) a.cdT -= dt;
    if (a.dashing) return;
    if (a.fight) {
      // Ảo ảnh chiêu cuối: xông vào quái gần nhất và chém bằng kiếm ảo ảnh.
      const e = K.nearest(G, a.x, a.y - 6, PH.scout, {});
      if (e) {
        const [ex, ey] = ec(e), d = K.walk(G, a, ex, ey + 6, PH.follow, dt);
        if ((a.atk -= dt) <= 0 && d < PH.reach) {
          // weapon_skill_joker_phantom (GunInitJoker): hai đòn kiếm xen kẽ 3 (size 1,75) và 4 (size 2,45), bạo kích 20, đẩy 2, weapon_speed 1,1.
          const k = (a.combo = ((a.combo || 0) + 1) % 2), sz = MM.phantomSize[k];
          a.atk = 1 / MM.phantomRate;
          for (const q of K.inRadius(G, a.x, a.y - 6, sz * T * 1.1)) K.hit(G, p, q, MM.phantomDmg[k], { critChance: MM.phantomCrit, repel: 2, fx: 'hit_red', tag: 'phantom' });
          fx(G, 'sword_joker_skill_phantom_1', a.x, a.y - 7, { ang: a.face > 0 ? 0 : Math.PI, dur: 0.4 });
        }
        return;
      }
    }
    // Đi theo người chơi, đứng lệch phía sau theo thứ tự, dừng khi cách dưới min_follow_distance.
    const i = phantoms(G, p).indexOf(a), tx = p.x - p.face * (PH.near + 12 * i), ty = p.y + (i % 2 ? 6 : -4);
    if (Math.hypot(tx - a.x, ty - a.y) > PH.far) { a.x = tx; a.y = ty; }
    else if (Math.hypot(p.x - a.x, p.y - a.y) > PH.near + 12 * i && K.walk(G, a, tx, ty, PH.follow, dt) > 3) a.moving = true;
    a.face = p.face;
  }
  K.timers.joker = (G, p, dt) => {
    if (p.hero !== 'joker') return;
    const s = st(p);
    if (!(s.pt >= 0)) s.pt = 0;
    if (phantoms(G, p).filter(a => !a.temp).length < PH.max()) { s.pt += dt; if (s.pt >= PH.every()) { s.pt = 0; addPhantom(G, p, p.x - p.face * 14, p.y, false); } }
    else s.pt = 0;
    // Miễn sát thương: StartHitTrigger(gameObject, thời gian) [ĐO Skill0Dash 0,25 s, SetStealthEffect(2) khi tung, RoleSkill1End 0,5 s khi hiện hình].
    if (s.imm > 0) { s.imm -= dt; K.hurtMods(p).jimm = () => 0; } else delete K.hurtMods(p).jimm;
    K.ghost(p, s.imm > 0);
    if (s.spd > 0) { s.spd -= dt; K.setMul(p, 'moveMul', 'mirage', MM.move); } else K.setMul(p, 'moveMul', 'mirage', 1);
    // Thanh bùng nổ tụt đều trong timeLimitPhantomTime khi đang ở trạng thái hyper (PassiveEnergyCosting) rồi về 0 (ResetCanAddEnergy).
    if (s.drain > 0) { s.drain -= dt; s.e = SC.full() * Math.max(0, s.drain) / PH.life(); if (s.drain <= 0) s.e = 0; }
    p._ultReady = p.h.skill.id === 'mirage_masque' && (s.e >= SC.full() || !!s.ult);
    dashTick(G, p, s, dt);
    endSlashTick(G, p, s, dt);
    ultTick(G, p, s, dt);
  };
  SK.on('stageEnter', (G, p0) => { const p = G.player; if (p && p._jk) { p._jk.ph = []; p._jk.dash = []; p._jk.ult = null; p._jk.hy = null; } });
  const addEnergy = (p, n) => { const s = st(p); if (s.drain <= 0) s.e = Math.min(SC.full(), s.e + n); };

  // ---------------------------------------------------------------- Ảnh Kiếm Vũ
  // [ĐO C35Controller.RoleSkill0 + <Skill0Dash>d__81 + config] cd 4, maxCount 2, args 3. Bấm: bất tử 0,25 s, lao 5 ô (skill0DashForce
  // 50 ô/s, wiki 5 ô), tức thì tung "đâm" (skill0SlashDamage 16, slashScale 3,85; prefab sword_joker_skill_1), sau skill0SwordDelay 0,125 s
  // một nhát chém vòng (skill0SwordDamage 8, swordScale 2,35; sword_joker_skill), sau skill0SwordDelayUpdate 0,1 s nhát nữa (đối xứng);
  // buff 31 "Liên Kích Mưa" thêm hai nhát chưa làm (tài năng). Mỗi lần dùng cộng skill0DeltaPassiveEnergy 5 vào thanh bùng nổ, mỗi ảo ảnh
  // tung theo cũng cộng 5 (Skill0Dash của JokerMercenaryController). Thanh đầy (skill0MaxPassiveEnergy 100): CHÍNH nút kỹ năng
  // (không có nút riêng) tung Kiếm Vũ: KageBunshinCount 3 ảo ảnh tạm 15 s dùng cùng động tác, thanh tụt đều về 0 trong 15 s và không cộng thêm.
  const SC = {
    speed: () => C('skill0DashForce', 50) * U, dist: 5 * T, imm: 0.25, thrust: () => C('skill0SlashDamage', 16), sword: () => C('skill0SwordDamage', 8),
    delay: () => C('skill0SwordDelay', 0.125), upd: () => C('skill0SwordDelayUpdate', 0.1), tail: 0.1,
    slashScale: () => C('slashScale', 3.85), swordScale: () => C('swordScale', 2.35),
    gain: () => C('skill0DeltaPassiveEnergy', 5), full: () => C('skill0MaxPassiveEnergy', 100), clones: () => C('KageBunshinCount', 3),
    // Hộp bao PolygonCollider2D của prefab (đơn vị ô, nhân scale của đạn) [ĐO common.ab]: đâm x 0,495..2,937 (ảo ảnh 3,556), y -0,297..0,332;
    // chém vòng elip tâm (-0,18; -0,25) bán trục 1,09 x 1,19 quanh gốc. Gốc đâm cao slashOffset 0,5 ô, gốc chém cao swordOffset 1 ô.
    tx0: 0.495, tx1: 2.937, txp: 3.556, ty0: -0.297, ty1: 0.332, sx: 1.09, sy: 1.19, scx: -0.18, scy: -0.25, oyT: 0.5 * T, oyS: 1.0 * T,
    // [ƯỚC LƯỢNG] hyperRange/hyperRangeNoEnemy không thấy dùng trong C35Controller/JokerMercenaryController nên chỉ giữ cho độ dài lao của ảo ảnh tạm.
    hyper: () => C('hyperRange', 15) * T, hyperNone: () => C('hyperRangeNoEnemy', 3) * T
  };
  // Một lượt lao của người chơi hoặc ảo ảnh: đâm ngay, chém vòng hai nhịp sau.
  function startDash(G, p, act, ang, dist) {
    const self = act === p, f = self ? 1 : factor(G, 0.25);
    const d = { act, ang, left: dist, v: SC.speed(), t: 0, self, f, ph: !self, ev: [0, SC.delay(), SC.delay() + SC.upd()], n: 0, cx: act.x, cy: act.y };
    act.dashing = true; act.face = Math.cos(ang) >= 0 ? 1 : -1;
    if (self) st(p).imm = Math.max(st(p).imm, SC.imm);
    st(p).dash.push(d);
    fx(G, self ? 'sword_joker_skill_1' : 'sword_joker_skill_phantom_1', act.x, act.y - 7, { ang: Math.cos(ang) < 0 ? ang + Math.PI : ang, flip: Math.cos(ang) < 0, dur: 0.5 });
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
      }
      while (d.n < d.ev.length && d.t >= d.ev[d.n]) { d.n === 0 ? thrust(G, p, d) : sword(G, p, d, d.n === 2); d.n++; }
      if (d.n >= d.ev.length && d.t >= d.ev[d.ev.length - 1] + SC.tail && d.left <= 0) { d.done = true; a.dashing = false; }
    }
    s.dash = s.dash.filter(d => !d.done);
  }
  // Đâm: hộp dọc theo hướng lao, cố định tại chỗ tung.
  function thrust(G, p, d) {
    const a = d.act, sc = SC.slashScale(), c = Math.cos(d.ang), sn = Math.sin(d.ang), ox = a.x, oy = a.y - SC.oyT, x1 = d.ph ? SC.txp : SC.tx1;
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = x - ox, dy = y - oy, u = (dx * c + dy * sn) / (sc * T), v = (-dx * sn + dy * c) / (sc * T), r = e.r / (sc * T);
      if (u > SC.tx0 - r && u < x1 + r && v > SC.ty0 - r && v < SC.ty1 + r)
        K.hit(G, p, e, SC.thrust() * d.f, { critChance: p.crit, ang: d.ang, repel: 2, fx: 'hit_red', tag: 'thrust' });
    }
    G.shake = Math.max(G.shake, 2);
  }
  // Chém vòng (hai nhịp): elip quanh vị trí hiện tại của người/ảo ảnh.
  function sword(G, p, d, rev) {
    const a = d.act, sc = SC.swordScale(), cx = a.x + SC.scx * sc * T * (rev ? -1 : 1), cy = a.y - SC.oyS + SC.scy * sc * T;
    fx(G, d.self ? 'sword_joker_skill' : 'sword_joker_skill_phantom', a.x, a.y - 7, { scale: 1, dur: 0.5, flip: rev });
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), k = Math.hypot((x - cx) / (SC.sx * sc * T + e.r), (y - cy) / (SC.sy * sc * T + e.r));
      if (k < 1) K.hit(G, p, e, SC.sword() * d.f, { critChance: p.crit, ang: Math.atan2(y - a.y, x - a.x), repel: 3, fx: 'hit_red', tag: 'sword' });
    }
    G.shake = Math.max(G.shake, 2);
  }
  const full = p => st(p).e >= SC.full();
  function crescendo(G, p, ult) {
    const s = st(p);
    const { e, ang } = K.targetAng(G, p, SC.dist + 2 * T);
    if (ult) {
      s.drain = PH.life(); s.e = SC.full();
      for (let i = 0; i < SC.clones(); i++) addPhantom(G, p, p.x - p.face * 8 + (i - 1) * 10, p.y + (i - 1) * 6, true);
    } else addEnergy(p, SC.gain());
    startDash(G, p, p, ang, SC.dist);
    for (const a of phantoms(G, p)) {
      if ((a.cdT || 0) > 0) continue;   // phantomSkillCd: mỗi ảo ảnh chỉ tung lại sau 2,5 s [ĐO C35Controller.phantomSkillCd]
      a.cdT = PH.cd();
      let dist = SC.dist, pa = ang;
      if (a.temp) { const q = K.nearest(G, a.x, a.y - 6, SC.hyper(), {}); if (q) { pa = Math.atan2(ec(q)[1] - a.y, ec(q)[0] - a.x); dist = Math.min(SC.hyper(), Math.hypot(ec(q)[0] - a.x, ec(q)[1] - a.y)); } else dist = SC.hyperNone(); }
      startDash(G, p, a, pa, dist);
      addEnergy(p, SC.gain());   // mỗi ảo ảnh tung động tác cũng cộng điểm bùng nổ
    }
    p.skillT = SC.delay() + SC.upd() + SC.tail + SC.dist / SC.speed() + 0.1;
  }
  S.shadow_crescendo = {
    start(G, p) {
      K.layer(G);
      if (full(p)) { p._cdAfter = 0; crescendo(G, p, true); return; }
      K.charges(p, 'shadow_crescendo'); K.useCharge(p, 'shadow_crescendo');
      crescendo(G, p, false);
    },
    pressCd(G, p) { if (full(p)) crescendo(G, p, true); }
  };

  // ---------------------------------------------------------------- Màn Ảo Thuật
  // [ĐO C35Controller.RoleSkill1 / CreateCircleSlash / SetStealthEffect / RoleSkill1End + config] cd 5, dur 1,5, args 3. maxCount 2 KHÔNG
  // phải số lượt: SkillInfo.get_hasMultiCount chỉ đúng với skillType 4/6/9/12, mirage_masque là loại 8 nên dùng một lần rồi hồi chiêu 5 s.
  // Tung: vòng chém slashDamage 12 (prefab circle_slash: đĩa r 1,2 ô lệch 0,6 ô quay quanh gốc = vùng r 1,8 ô, nhân slashSize 2), áo
  // choàng joker_fly_slash (BulletCircleExpand: quỹ đạo elip bán kính 4 -> 0 ô trong expandDuration 1,5 s theo InCubic, x2 chiều ngang,
  // 800 độ/s, elip tự quay -180 độ/s; đạn slashSize 2 nên r 2 ô, sát thương slashFlyDamage 12 mỗi lần chạm mới), tàng hình (BuffStealth:
  // quái mất mục tiêu), ChangeSpeed +50% trong 2 s, MIỄN SÁT THƯƠNG StartHitTrigger 2 s (không có giảm sát thương trong mã), cộng
  // skill1PassiveEnergy 10. Bấm lại hoặc hết dur: RoleSkill1End hiện hình ngay, miễn sát thương thêm 0,5 s, áo choàng bay về người trong
  // backTime 0,15 s rồi vòng chém mở rộng (slashSizeEnd 2,5). Thanh đầy: NÚT ĐẶC BIỆT (chuỗi "hyper" của RoleSkill) tung Chiêu Cuối
  // HyperSkill1 (cho phép cả lúc đang tàng hình): KageBunshinCount 3 ảo ảnh tạm cách nhau createDura 0,125 s, thanh tụt về 0 trong
  // 15 s; nhấn lại hoặc hết 15 s: mỗi ảo ảnh thành áo choàng (JokerPhantomSkill1FlySlash tốc 10) bay về người.
  const MM = {
    dmg: () => C('slashDamage', 12), fly: () => C('slashFlyDamage', 12), r0: () => 1.8 * C('slashSize', 2) * T, r1: () => 1.8 * C('slashSizeEnd', 2.5) * T,
    flyR: () => 1.0 * C('slashSize', 2) * T, gain: () => C('skill1PassiveEnergy', 10), back: () => C('backTime', 0.15),
    clones: () => C('KageBunshinCount', 3), move: 1.5, moveT: 2, imm0: 2, imm1: 0.5, r: 4 * T, dur: 1.5, ex: 2, angDeg: 800, orbitDeg: -180,
    cloakSpeed: 10 * U,   // JokerPhantomSkill1FlySlash speed 10 ô/s [ĐO MB bullet.json]
    phantomDmg: [3, 4], phantomSize: [1.75, 2.45], phantomCrit: 20, phantomRate: 1.1   // kiếm ảo ảnh [ĐO weapon.json weapon_skill_joker_phantom]; bán kính chạm = size x 1,1 ô [ƯỚC LƯỢNG]
  };
  const inCubic = u => u * u * u;
  function maskEnd(G, p) {
    const s = st(p), m = s.m; if (!m) return;
    s.m = null;
    p.hidden = false; p._alpha = null; delete K.hurtMods(p).mirage;
    s.imm = MM.imm1;
    K.stopFx(m.fx);
    s.back = { t: 0, x0: m.cx, y0: m.cy, hit: new Set(m.hit) };
    s.endSlash = MM.back();
    phantomSlash(G, p, true);
  }
  // Áo choàng bay về người rồi vòng chém mở rộng.
  function endSlashTick(G, p, s, dt) {
    const b = s.back;
    if (b) {
      b.t += dt;
      const k = Math.min(1, b.t / MM.back()), x = b.x0 + (p.x - b.x0) * k, y = b.y0 + (p.y - 8 - b.y0) * k;
      cloakHit(G, p, b, x, y);
      if (k >= 1) s.back = null;
    }
    if (s.endSlash > 0 && (s.endSlash -= dt) <= 0) circle(G, p, MM.r1(), 'circle_slash', 2.5);
  }
  function circle(G, p, r, name, size) {
    fx(G, name, p.x, p.y - 8, { scale: size, dur: 0.5 });
    for (const e of K.inRadius(G, p.x, p.y - 8, r)) K.hit(G, p, e, MM.dmg(), { critChance: p.crit, ang: Math.atan2(ec(e)[1] - p.y, ec(e)[0] - p.x), repel: 3, fx: 'hit_red', tag: 'circle' });
    // Kiếm RGSword (damageType 131584) phá đạn địch trong vùng [ƯỚC LƯỢNG: cờ phá đạn của loại đạn kiếm].
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - p.x, b.y - (p.y - 8)) < r) b.dead = true;
    G.shake = Math.max(G.shake, 3);
  }
  // Ảo ảnh thường làm lại vòng chém tại chỗ của mình (PhantomSkill1) với hệ số sát thương của ảo ảnh.
  function phantomSlash(G, p, end) {
    const f = factor(G, 0.5), r = 1.8 * C(end ? 'slashSizeEnd' : 'slashSize', end ? 2.5 : 2) * T;
    for (const a of phantoms(G, p)) {
      if (a.fight) continue;
      fx(G, 'circle_slash', a.x, a.y - 8, { scale: end ? 2.5 : 2, dur: 0.5 });
      for (const e of K.inRadius(G, a.x, a.y - 8, r)) K.hit(G, p, e, MM.dmg() * f, { critChance: p.crit, repel: 2, fx: 'hit_red', tag: 'pcircle' });
    }
  }
  // Áo choàng chạm quái: mỗi lần vào vùng (OnTriggerEnter2D) gây slashFlyDamage.
  function cloakHit(G, p, c, x, y) {
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [ex, ey] = ec(e), inside = Math.hypot(ex - x, ey - y) < MM.flyR() + e.r;
      if (inside && !c.hit.has(e)) { c.hit.add(e); K.hit(G, p, e, MM.fly(), { critChance: p.crit, repel: 1, fx: 'hit_red', tag: 'cloak' }); }
      else if (!inside) c.hit.delete(e);
    }
  }
  function maskStart(G, p) {
    const s = st(p);
    addEnergy(p, MM.gain());
    const dur = K.cfg(p, 'mirage_masque').dur || MM.dur;
    p.skillT = dur;
    s.m = { t: 0, hit: new Set(), cx: p.x, cy: p.y, c: { x: p.x, y: p.y } };
    circle(G, p, MM.r0(), 'circle_slash', 2);
    phantomSlash(G, p, false);
    p.hidden = true; p._alpha = 0.297;
    s.imm = MM.imm0; s.spd = MM.moveT;
    s.m.fx = fx(G, 'joker_fly_slash', p.x, p.y, { follow: s.m.c, dy: -7, dur });
  }
  // Vị trí áo choàng tại thời điểm t kể từ lúc tung.
  function cloakPos(p, t) {
    const R = MM.r * (1 - inCubic(Math.min(1, t / MM.dur))), th = MM.angDeg * RAD * t, ph = MM.orbitDeg * RAD * t;
    const lx = R * MM.ex * Math.cos(th), ly = R * Math.sin(th);
    return [p.x + lx * Math.cos(ph) - ly * Math.sin(ph), p.y - 8 + lx * Math.sin(ph) + ly * Math.cos(ph)];
  }
  function ultStart(G, p) {
    const s = st(p);
    s.drain = PH.life(); s.e = SC.full();
    s.ult = { t: 0 };
    s.hy = { n: 0, t: 0 };
  }
  function makeHyper(G, p) {
    const s = st(p), near = G.enemies.filter(e => alive(e) && K.inRoom(G, e)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const i = s.hy.n, e = near[i % Math.max(1, near.length)], bx = e ? e.x : p.x, by = e ? e.y : p.y, ang = i * 2.1;
    const a = addPhantom(G, p, bx + Math.cos(ang) * 22, by + Math.sin(ang) * 14, true);
    a.fight = true; a.ttl = PH.life() + 1;
  }
  // Chiêu Cuối kết thúc: ảo ảnh tạm hoá áo choàng bay về người chơi, đi tới đâu chém tới đó.
  function ultEnd(G, p) {
    const s = st(p); if (!s.ult) return;
    s.ult = null; s.hy = null; s.drain = 0; s.e = 0;
    for (const a of phantoms(G, p)) {
      if (!a.fight) continue;
      a.gone = true;
      const c = { x: a.x, y: a.y, t: 0, hit: new Set() };
      c.h = fx(G, 'joker_fly_slash_phantom', c.x, c.y - 7, { follow: c, dy: -7, dur: 3 });
      s.cloaks = (s.cloaks || []).concat(c);
    }
  }
  function ultTick(G, p, s, dt) {
    if (s.ult) {
      s.ult.t += dt;
      if (s.hy && s.hy.n < MM.clones()) { s.hy.t += dt; while (s.hy.t >= PH.createDura() && s.hy.n < MM.clones()) { s.hy.t -= PH.createDura(); makeHyper(G, p); s.hy.n++; } }
      if (s.ult.t >= PH.life()) ultEnd(G, p);
    }
    if (s.m) {
      s.m.t += dt;
      const [x, y] = cloakPos(p, s.m.t);
      s.m.cx = x; s.m.cy = y;
      s.m.c.x = x; s.m.c.y = y;
      cloakHit(G, p, s.m, x, y);
    }
    if (!s.cloaks) return;
    for (const c of s.cloaks) {
      const dx = p.x - c.x, dy = (p.y - 6) - c.y, d = Math.hypot(dx, dy), k = Math.min(d, MM.cloakSpeed * dt);
      if (d > 0) { c.x += dx / d * k; c.y += dy / d * k; }
      cloakHit(G, p, c, c.x, c.y);
      if (d - k < 4) { c.done = true; K.stopFx(c.h); }
    }
    s.cloaks = s.cloaks.filter(c => !c.done);
  }
  S.mirage_masque = {
    start(G, p) { K.layer(G); maskStart(G, p); },
    // Bấm lại khi đang tàng hình: thu áo, hiện hình (RoleSkill1: đang casting và có áo thì RoleSkillEnd).
    press(G, p) { p.skillT = Math.min(p.skillT, 1e-4); },
    // Nút đặc biệt (L): Chiêu Cuối khi thanh đầy, bấm lại để kết thúc sớm; dùng được cả lúc đang tàng hình [ĐO CanUseSkill "hyper"].
    special(G, p) {
      K.layer(G);
      const s = st(p);
      if (s.ult) ultEnd(G, p); else if (full(p) && s.drain <= 0) ultStart(G, p);
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
