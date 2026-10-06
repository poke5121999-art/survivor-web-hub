// Thực thể: người trốn / người tìm. life là enum, hiệu ứng là danh sách, tốc độ chỉ tính ở speedOf (gameplay.md 3.2).
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, D = SK.D, MU = TT.mapUtil, KIND = TT.KIND;

  // số gốc: gameplay.md mục dẫn trong ngoặc
  const C = TT.C = {
    SPEED: { hide: 2.875, seek: 3.575 },        // 3.2
    RADIUS: 0.3,                                // nửa hộp va chạm (đơn vị ô)
    HP: { human: 5, bot: 6 },                   // 4.4
    ATTACK_CD: { human: 1.5, bot: 2 },          // 4.1
    LUNGE: 0.6, ATTACK_RANGE: 1.2, ATTACK_ARC: 80 * Math.PI / 180,
    REVIVE_TIME: 3, REVIVE_WINDOW: 60, REVIVE_RADIUS: 1.5,   // 4.2
    GRASS_REVEAL: 1.5,                          // 2.4: bot chỉ thấy người trong cỏ khi kề sát
    JUMP: { dur: 0.5, reach: 3.5 },             // 5.7
    SLIDE: { dur: 1, speed: 4, stun: 3 },       // 5.6 (thời gian trượt không có số trong mã, chọn 1 s)
    SEEK_DISGUISE: 5, SEEK_TRANSFORM: 1.5       // 1.3
  };

  // ---------------------------------------------------------------- bus sự kiện
  const subs = {};
  TT.onEvent = (name, fn) => { (subs[name] = subs[name] || []).push(fn); };
  TT.emit = (name, data) => { for (const fn of subs[name] || []) fn(data); };

  // ---------------------------------------------------------------- hiệu ứng
  // speed: add = cộng vào tốc độ gốc (+1/-1/+1.5), mul = nhân (slow 0.6, vùng +30%), zero = đứng yên. Còn lại không đụng tốc độ.
  const EFFECT = {
    speedAdd: { add: 1 }, lastHider: { add: 1 }, slow: { mul: 1 }, zoneBoost: { mul: 1 },
    stun: { zero: 1 }, lunge: { zero: 1 }, freeze: { zero: 1 }, gateWatch: { zero: 1 },
    invisible: {}, reveal: {}, shield: {}, slideImmune: {}, fastRevive: {}, haste: { mul: 1 }   // haste: kỹ năng (cầu nguyện, dịch chuyển) nhân tốc
  };
  TT.addEffect = (a, kind, until, mag) => {
    if (!EFFECT[kind]) throw new Error('unknown effect ' + kind);
    a.effects.push({ kind, until, mag: mag == null ? 1 : mag });
  };
  TT.removeEffect = (a, kind) => { a.effects = a.effects.filter(e => e.kind !== kind); };
  TT.hasEffect = (a, kind, now) => a.effects.some(e => e.kind === kind && e.until > now);
  TT.pruneEffects = (a, now) => { if (a.effects.some(e => e.until <= now)) a.effects = a.effects.filter(e => e.until > now); };

  TT.baseSpeed = a => C.SPEED[a.form];
  // Player.cs:379-383: (gốc + cộng) * nhân; âm mà không bị choáng thì kẹp 0.5
  TT.speedOf = a => {
    let add = 0, mul = 1;
    for (const e of a.effects) {
      const d = EFFECT[e.kind];
      if (d.zero) return 0;
      if (d.add) add += e.mag;
      if (d.mul) mul *= e.mag;
    }
    const s = (TT.baseSpeed(a) + add) * mul;
    return s < 0.5 ? 0.5 : s;
  };

  // ---------------------------------------------------------------- tạo
  TT.makeActor = (id, isBot, name, hero, role, disguise) => ({
    id, isBot, name, hero, role, disguise,
    form: 'hide',            // hành vi hiện tại (người tìm là 'hide' cho tới hết biến hình)
    look: 'hide',            // 'hide' dùng sprite disguise, 'seek' dùng sprite thật
    life: 'alive', x: 0, y: 0, face: 1, aim: 0, moving: false, animT: 0, deadT: 0,
    hp: isBot ? C.HP.bot : C.HP.human, zoneT: 0,
    downedAt: 0, revive: { by: null, t: 0 },
    effects: [], skill: { id: null, cd: 0, t: 0 }, attackCd: 0,
    inGrass: false, inWater: false, trail: null, motion: null, swing: null, hitFlash: 0, ai: null
  });

  // ---------------------------------------------------------------- di chuyển
  const isHider = a => a.role === 'hide';
  const tableAhead = (m, a, dx, dy) => MU.kindAt(m.map, Math.floor(a.x + dx * (C.RADIUS + 0.15)), Math.floor(a.y + dy * (C.RADIUS + 0.15))) === KIND.TABLE;

  function tryAxis(m, a, dx, dy) {
    const nx = a.x + dx, ny = a.y + dy;
    if (MU.boxBlocked(m.map, nx, ny, C.RADIUS, true)) return false;
    a.x = nx; a.y = ny; return true;
  }

  // điểm hạ cánh sau bàn: bước dọc hướng nhảy tới ô trống đầu tiên, phải đi qua ít nhất một ô bàn
  function landingSpot(m, a, ux, uy) {
    let crossed = false;
    for (let d = 0.5; d <= C.JUMP.reach; d += 0.25) {
      const x = a.x + ux * d, y = a.y + uy * d;
      if (MU.kindAt(m.map, Math.floor(x), Math.floor(y)) === KIND.TABLE) crossed = true;
      else if (crossed && !MU.boxBlocked(m.map, x, y, C.RADIUS, true)) return { x, y };
    }
    return null;
  }

  function startJump(m, a, ux, uy) {
    const to = landingSpot(m, a, ux, uy);
    if (!to) return false;
    a.motion = { kind: 'jump', t: 0, x0: a.x, y0: a.y, x1: to.x, y1: to.y };
    return true;
  }

  // Bước đi một nhịp theo hướng (ux,uy) đơn vị với tốc độ speed. Va tường thì trượt từng trục; hướng tới bàn thì người trốn nhảy.
  TT.moveActor = (m, a, ux, uy, speed, dt) => {
    const dx = ux * speed * dt, dy = uy * speed * dt;
    const bx = !tryAxis(m, a, dx, 0), by = !tryAxis(m, a, 0, dy);
    if (isHider(a) && !a.motion && (bx || by) && TT.speedOf(a) > 0 && ((bx && tableAhead(m, a, Math.sign(ux), 0)) || (by && tableAhead(m, a, 0, Math.sign(uy)))))
      startJump(m, a, ux / Math.hypot(ux, uy), uy / Math.hypot(ux, uy));
    return bx || by;
  };

  function stepMotion(m, a, dt) {
    const mo = a.motion;
    mo.t += dt;
    if (mo.kind === 'jump') {
      const k = Math.min(1, mo.t / C.JUMP.dur);
      a.x = mo.x0 + (mo.x1 - mo.x0) * k; a.y = mo.y0 + (mo.y1 - mo.y0) * k;
      if (k >= 1) a.motion = null;
    } else if (mo.kind === 'slide') {
      const hit = TT.moveActor(m, a, mo.ux, mo.uy, C.SLIDE.speed, dt);
      if (hit) { a.motion = null; TT.addEffect(a, 'stun', m.now + C.SLIDE.stun); }   // 5.6: đâm tường/bàn -> choáng 3 s
      else if (mo.t >= C.SLIDE.dur) a.motion = null;
    }
  }

  // ---------------------------------------------------------------- vòng đời
  TT.downHider = (m, h, cause, byId) => {
    if (h.life !== 'alive' || h.role !== 'hide' || TT.hasEffect(h, 'shield', m.now)) return false;
    h.life = 'downed'; h.downedAt = m.now; h.revive = { by: null, t: 0 }; h.motion = null; h.deadT = 0; h.hitFlash = 0.1;
    TT.removeEffect(h, 'invisible');
    if (cause === 'zone') h.hp = 3;               // SimpleHealth.cs:91-117
    TT.emit('down', { id: h.id, cause, by: byId });
    return true;
  };
  TT.reviveHider = (m, h, byId) => {
    h.life = 'alive'; h.revive = { by: null, t: 0 }; h.hp = C.HP[h.isBot ? 'bot' : 'human'] + (m.zone ? m.zone.step : 0); h.zoneT = 0;
    TT.emit('revive', { id: h.id, by: byId });
  };
  TT.killHider = (m, h) => { h.life = 'dead'; TT.emit('dead', { id: h.id }); };

  // ---------------------------------------------------------------- tấn công của người tìm (gameplay.md 4.1)
  TT.canAttack = a => a.role === 'seek' && a.form === 'seek' && a.life === 'alive' && a.attackCd <= 0 && TT.speedOf(a) > 0;

  function inArc(a, t, ang) {
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
    if (d > C.ATTACK_RANGE) return false;
    if (d < 0.6) return true;
    let da = Math.abs(Math.atan2(dy, dx) - ang);
    if (da > Math.PI) da = 2 * Math.PI - da;
    return da <= C.ATTACK_ARC;
  }

  TT.attack = (m, a, ang) => {
    if (!TT.canAttack(a)) return false;
    a.aim = ang; a.face = Math.cos(ang) < -0.01 ? -1 : 1;
    a.attackCd = C.ATTACK_CD[a.isBot ? 'bot' : 'human'];
    TT.addEffect(a, 'lunge', m.now + C.LUNGE);
    a.swing = { t: 0, ang };
    TT.emit('attack', { id: a.id, ang });
    let hits = 0;
    for (const h of m.actors) {
      if (h.role !== 'hide' || h.life !== 'alive' || TT.hasEffect(h, 'invisible', m.now) || !inArc(a, h, ang)) continue;
      if (TT.downHider(m, h, 'seeker', a.id)) { hits++; TT.emit('catch', { id: h.id, by: a.id }); }
    }
    if (!hits) TT.emit('miss', { id: a.id, x: a.x, y: a.y });
    return true;
  };

  // ---------------------------------------------------------------- cập nhật mỗi bước
  function updateTrail(m, a) {
    const wasIn = a.inWater;
    a.inWater = !!m.map.water[MU.idx(m.map, Math.floor(a.x), Math.floor(a.y))];
    if (a.inWater) a.trail = null;
    else if (wasIn) a.trail = { left: 15, next: 0 };   // 5.5: rời vũng thì bắt đầu để lại tối đa 15 dấu chân
    if (a.trail && a.moving && m.now >= a.trail.next && a.trail.left > 0) {
      m.prints.push({ x: a.x, y: a.y, at: m.now, face: a.face });
      a.trail.left--; a.trail.next = m.now + 0.3;
    }
  }

  function inPuddle(m, a) {
    for (const p of m.puddles) if (Math.abs(a.x - p.x) <= p.w / 2 && Math.abs(a.y - p.y) <= p.h / 2) return true;
    return false;
  }

  function maybeSlide(m, a, ux, uy) {
    if (a.life !== 'alive' || a.motion || TT.hasEffect(a, 'slideImmune', m.now) || !inPuddle(m, a)) return;
    const len = Math.hypot(ux, uy);
    const dx = len > 0 ? ux / len : a.face, dy = len > 0 ? uy / len : 0;
    a.motion = { kind: 'slide', t: 0, ux: dx, uy: dy };
    TT.addEffect(a, 'slideImmune', m.now + C.SLIDE.dur + C.SLIDE.stun + 1);
  }

  // intent = {ux, uy} hướng mong muốn đã chuẩn hoá (0 nếu đứng yên)
  TT.updateActor = (m, a, intent, dt) => {
    TT.pruneEffects(a, m.now);
    a.animT += dt; a.attackCd = Math.max(0, a.attackCd - dt); a.hitFlash = Math.max(0, a.hitFlash - dt);
    if (a.swing && (a.swing.t += dt) > 0.3) a.swing = null;
    if (a.life === 'downed' || a.life === 'dead') { a.deadT += dt; a.moving = false; return; }
    if (a.life !== 'alive') return;
    const speed = TT.speedOf(a), ux = intent.ux, uy = intent.uy;
    a.moving = false;
    if (a.motion) stepMotion(m, a, dt);
    else if (speed > 0 && (ux || uy)) {
      a.moving = true; a.aim = Math.atan2(uy, ux);
      if (Math.abs(ux) > 0.05) a.face = ux < 0 ? -1 : 1;
      TT.moveActor(m, a, ux, uy, speed, dt);
    }
    a.inGrass = !!m.map.grass[MU.idx(m.map, Math.floor(a.x), Math.floor(a.y))];
    updateTrail(m, a);
    maybeSlide(m, a, ux, uy);
  };

  // ---------------------------------------------------------------- nhìn thấy nhau
  const isRevealed = (a, now) => TT.hasEffect(a, 'reveal', now);
  // người trốn nhìn người tìm chưa biến hình thấy như đồng đội
  TT.looksFriend = (viewer, a) => a.role === viewer.role || (viewer.role === 'hide' && a.look === 'hide');
  // alpha vẽ a trong mắt viewer: 0 = không thấy
  TT.alphaFor = (m, viewer, a) => {
    if (a.life === 'escaped') return 0;
    const dead = a.life === 'dead' ? 0.35 : 1;
    if (a === viewer) return (a.inGrass ? 0.6 : 1) * (TT.hasEffect(a, 'invisible', m.now) ? 0.297 : 1) * dead;
    const friend = a.role === viewer.role;
    if (friend) return (a.inGrass || TT.hasEffect(a, 'invisible', m.now) ? 0.5 : 1) * dead;
    if (isRevealed(a, m.now) || a.life === 'downed') return dead;
    if (TT.hasEffect(a, 'invisible', m.now)) return 0;
    if (a.inGrass && Math.hypot(a.x - viewer.x, a.y - viewer.y) > C.GRASS_REVEAL) return 0;
    return dead;
  };

  // ---------------------------------------------------------------- vẽ nhân vật (công thức SK.drawPlayer, actors.js SK)
  TT.drawActor = (ctx, m, viewer, a, alpha) => {
    const heroId = a.look === 'seek' ? a.hero : a.disguise, s0 = D.heroes[heroId].s0;
    const dead = a.life === 'downed' || a.life === 'dead';
    const key = dead || (a.motion && a.motion.kind === 'slide') ? s0.dead : a.moving ? s0.run : s0.idle;
    const t = dead ? a.deadT : a.motion && a.motion.kind === 'slide' ? a.motion.t : a.animT;
    const fr = SK.animFrame(key, t), xf = SK.animPose(key, t, s0.bodyPath), fs = a.face < 0 ? -1 : 1;
    let px = Math.round(a.x * 16), py = Math.round(a.y * 16) + 5, lift = 0;
    if (a.motion && a.motion.kind === 'jump') lift = Math.sin(Math.min(1, a.motion.t / C.JUMP.dur) * Math.PI) * 10;
    if (a.lift) lift = a.lift;   // kỹ năng (nhảy vồ) đặt a.lift (px) và a.spin (rad, lộn)
    ctx.save();
    ctx.globalAlpha *= alpha;
    SK.draw(ctx, 'shadow2', px, py);
    SK.draw(ctx, fr, px + xf.dx * fs, py + xf.dy - lift, { flip: a.face < 0, sx: xf.sx, sy: xf.sy, rot: xf.rot * fs + (a.spin || 0) * fs, pages: a.hitFlash > 0 ? SK.pagesWhite : null });
    ctx.restore();
  };

  TT.nameTag = (ctx, m, viewer, a, alpha) => {
    const friend = TT.looksFriend(viewer, a);
    const px = Math.round(a.x * 16), py = Math.round(a.y * 16) + 5;
    ctx.save(); ctx.globalAlpha *= Math.min(1, alpha + 0.2);
    SK.text(ctx, a.name, px, py - 36, 8, friend ? '#7dff7d' : '#ff6a5a', 'center', '#000');
    ctx.restore();
  };
})();
