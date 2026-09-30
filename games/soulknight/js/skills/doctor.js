// Kỹ năng Nhà Vật Lý (c27, C28Controller): em_field_device, he_electric_orb, quantum_translocator. Đồ nghề chung ở SK.skillKit (js/skills.js).
// Nguồn: ctrlFields của data/sk-skills86.js [ĐO], MonoBehaviour trong common.ab (C28Skill1, ThunderShield, ThunderEmitterController),
// tên trường/hằng của C28Controller + C28QuantumField trong dump.cs [ĐO], wiki Physicist [WIKI]. Chưa có sk_method.py nên
// thân hàm ARM chưa đọc: chỗ nào logic chỉ nằm trong mã thì ghi [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, W = SK.world, U = SK.PPU, T = SK.TILE;
  const { fx, hit, alive, ec, inRadius, nearest, targetAng, aimDir, debuff, stun, layer, timers, hurtMods, setMul, cfg, CTRL, charges, useCharge } = K;
  
  // ---------------------------------------------------------------- Thiết Bị Điện Từ
  // [ĐO ctrlFields speed1 10, damages [8, 4]; ThunderShield duration 4.7, fadeTime 0.3; ThunderEmitterController emitterTime 1,
  // maxTarget 2] + [WIKI]: ném quả cầu, nổ khi chạm quái/vật cản hoặc bay đủ 3 ô; nổ 8 sát thương bán kính ~4 ô; từ trường bán kính
  // 4 ô, chớp điện mỗi giây (lần đầu ngay khi dựng) vào con gần nhất 4 sát thương, nảy thêm 1 con; tổng 5 chớp.
  const EM = {
    speed: CTRL('doctor', 'speed1', 10) * U, fly: 3 * T, boom: CTRL('doctor', 'damages', [8, 4])[0], zap: CTRL('doctor', 'damages', [8, 4])[1],
    r: 4 * T, life: 4.7, fade: 0.3, every: 1, targets: 2, zaps: 5, hitR: 8
  };
  const emFields = G => (G._emFields = (G._emFields || []).filter(f => !f.gone));
  const inField = (f, x, y) => Math.hypot(x - f.x, (y - f.y) * 1.25) < f.r;   // đĩa dẹt theo phối cảnh 2D (như inRadius)

  function emBoom(G, p, x, y) {
    fx(G, 'thunder_circle_doctor', x, y - 4, { scale: EM.r / (2 * T), dur: 0.6 });
    for (const e of inRadius(G, x, y - 4, EM.r, EM.r * 0.8)) { hit(G, p, e, EM.boom, { repel: 3, tag: 'skill', ang: Math.atan2(ec(e)[1] - y, ec(e)[0] - x) }); }
    G.shake = Math.max(G.shake, 2);
  }
  function emField(G, p, x, y) {
    const f = { x, y, t: 0, zapN: 0, r: EM.r, gone: false };
    f.h = fx(G, 'shield_thunder_doctor', x, y, { layer: 'ground', dur: EM.life + EM.fade, scale: EM.r / (2 * T) });
    emFields(G).push(f);
    G.props.push({
      x, y: -1e9, t: 0, draw() {},
      update(G2, q, dt) {
        f.t += dt;
        if (f.t >= EM.life + EM.fade) { f.gone = true; q.gone = true; return; }
        while (f.zapN < EM.zaps && f.t >= f.zapN * EM.every) { f.zapN++; zap(G2, p, f); }
        // Đạn phe ta xuyên qua từ trường mang Điện Cảm.
        if (f.t < EM.life) for (const b of G2.bullets) if (b.side === 'p' && !b.dead && inField(f, b.x, b.y)) b._em = true;
      }
    });
    return f;
  }
  function zap(G, p, f) {
    const list = inRadius(G, f.x, f.y - 4, f.r, f.r * 0.8).filter(alive).sort((a, b) => Math.hypot(ec(a)[0] - f.x, ec(a)[1] - f.y) - Math.hypot(ec(b)[0] - f.x, ec(b)[1] - f.y));
    if (!list.length) return;
    let from = [f.x, f.y - 10];
    const first = list[0];
    const chain = [first];
    if (EM.targets > 1) {
      const rest = list.slice(1).sort((a, b) => Math.hypot(ec(a)[0] - ec(first)[0], ec(a)[1] - ec(first)[1]) - Math.hypot(ec(b)[0] - ec(first)[0], ec(b)[1] - ec(first)[1]));
      if (rest[0]) chain.push(rest[0]);
    }
    for (const e of chain) {
      const a = from, b = ec(e);
      K.boltProp(G, () => a, () => (alive(e) ? ec(e) : b), 0.25);
      hit(G, p, e, EM.zap, { noMul: false, crit: false, tag: 'field' });
      fx(G, 'thunder_buff_doctor', b[0], b[1], { scale: 0.8, dur: 0.4 });
      from = b;
    }
  }
  // Điện Cảm: đạn đã xuyên từ trường trúng quái thì quái bị choáng điện (BuffElectric 1 s) [ĐO DEBUFF.ele].
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'doctor' || !emFields(G).length) return;
    const s = e.scale, hw = e.hb.size[0] * s / 2, hh = e.hb.size[1] * s / 2, cx = e.x + e.hb.off[0] * e.face * s, cy = e.y - e.hb.off[1] * s;
    const b = G.bullets.find(q => q.side === 'p' && q._em && !q.dead && Math.abs(q.x - cx) < hw + q.r + 2 && Math.abs(q.y - cy) < hh + q.r + 2);
    if (!b || (b._emHit && b._emHit.has(e))) return;
    (b._emHit = b._emHit || new Set()).add(e);
    debuff(G, e, 'ele');
    fx(G, 'thunder_buff_doctor', cx, cy, { scale: 0.8, dur: 0.5 });
  });

  S.em_field_device = {
    start(G, p) {
      layer(G);
      const { ang } = targetAng(G, p, 14 * T);
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      const b = { x: p.x + Math.cos(ang) * 6, y: p.y, d: 0, ang };
      G.props.push({
        x: b.x, y: 1e9, t: 0,
        update(G2, q, dt) {
          const st = EM.speed * dt, n = Math.max(1, Math.ceil(st / 4)), sx = Math.cos(b.ang) * st / n, sy = Math.sin(b.ang) * st / n;
          for (let i = 0; i < n; i++) {
            const nx = b.x + sx, ny = b.y + sy;
            let boom = W.solidAt(G2.map, nx, ny) || b.d >= EM.fly;
            if (!boom) boom = G2.enemies.some(e => alive(e) && Math.hypot(ec(e)[0] - nx, ec(e)[1] - (ny - 10)) < EM.hitR + e.r);
            if (boom) { emBoom(G2, p, b.x, b.y); emField(G2, p, b.x, b.y); q.gone = true; return; }
            b.x = nx; b.y = ny; b.d += Math.hypot(sx, sy);
          }
          q.x = b.x;
        },
        draw(ctx, G2, q) { drawOrb(ctx, b.x, b.y - 10, G2.t); }
      });
    }
  };

  // ---------------------------------------------------------------- Cầu Điện Cao Năng
  // [ĐO C28Controller.InitSkill1Data ghi skillInfo.duration = 5 (Skill1MaxTime), đè cfg dur 4; C28Skill1 doctor_0_ball: laser doctor_0_laser damage 4, critic 15, repel 3, xuyên; ctrlFields ballAnimMoveTime 0.55,
  // intervalTime 0.15, maxHeight 7] + [WIKI]: 2 cầu + 2 khiên; cầu bắn một tia xuyên ngay khi tới chỗ và mỗi lần bấm bắn; hết giờ
  // thì phóng ra đánh kẻ địch (tia về phía trước và ngược lại). Khiên hao mòn mỗi lần trúng đòn, sát thương chia đôi (GetHurt: curShieldCount--, damage/2, hurtTimer = noHurtTime
  // chặn hết đòn trong khoảng đó) [ĐO mã ARM]; noHurtTime 0.3 s [ƯỚC LƯỢNG].
  const ORB = { dur: 5, n: 2, shields: 2, dmg: 4, crit: 15, repel: 3, fly: 0.55, gap: 0.15, arc: 7 * U * 0.25, side: 15, up: 22, bob: 0.08 * U, period: 1.5, tap: 0.2, endMul: 2, shieldLock: 0.3, beam: 0.22 };   // endMul: [ƯỚC LƯỢNG]
  const LASER_C = [1, 0.286, 0.91, 0.27];   // [ĐO doctor_0_laser light]

  // Quả cầu [ĐO C28Skill1 sprites ball_doctor_0..2] + quầng sáng màu tia.
  function drawOrb(ctx, x, y, t) {
    K.glow(ctx, x, y, 12, LASER_C.slice(0, 3).concat(0.5), 1);
    const f = SK.frame('ball_doctor_' + Math.floor(t * 8) % 3);
    if (f) SK.draw(ctx, 'ball_doctor_' + Math.floor(t * 8) % 3, x, y);
  }
  function beam(G, p, x0, y0, ang, dmg) {
    const c = Math.cos(ang), s = Math.sin(ang);
    let len = 0;
    while (len < 26 * T && !W.solidAt(G.map, x0 + c * len, y0 + s * len + 8)) len += 3;
    const x1 = x0 + c * len, y1 = y0 + s * len;
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [ex, ey] = ec(e), dx = ex - x0, dy = ey - y0, u = dx * c + dy * s;
      if (u < 0 || u > len + e.r) continue;
      if (Math.abs(-dx * s + dy * c) < e.r + 3) hit(G, p, e, dmg, { critChance: ORB.crit, ang, repel: ORB.repel, fx: 'hit_white', tag: 'orb' });
    }
    G.props.push({
      x: 0, y: 1e9, t: 0,
      update(G2, q, dt) { q.t += dt; if (q.t >= ORB.beam) q.gone = true; },
      draw(ctx, G2, q) { drawLaser(ctx, x0, y0, x1, y1, 1 - q.t / ORB.beam); }
    });
    return len;
  }
  function drawLaser(ctx, x0, y0, x1, y1, a) {
    const L = Math.hypot(x1 - x0, y1 - y0), f = SK.frame('laser_doctor');
    ctx.save(); ctx.globalAlpha *= a;
    K.glow(ctx, x0, y0, 10, LASER_C, 1); K.glow(ctx, x1, y1, 10, LASER_C, 1);
    if (f && SK.pages[f[0]]) {
      ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
      ctx.drawImage(SK.pages[f[0]], f[1], f[2], f[3], f[4], 0, -3.5, L, 7);
    } else { ctx.strokeStyle = '#ff90f0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    ctx.restore();
  }
  const orbAng = (G, p, b) => {
    const e = nearest(G, b.x, b.y, 16 * T, { los: true });
    return e ? Math.atan2(ec(e)[1] - b.y, ec(e)[0] - b.x) : (p.target ? p.aim : aimDir(p));
  };

  K.DUR_UI.he_electric_orb = ORB.dur;
  S.he_electric_orb = {
    start(G, p) {
      layer(G);
      p.skillT = ORB.dur;
      const o = p._orb = { t: 0, tap: 0, shields: ORB.shields, lock: 0, balls: [] };
      for (let i = 0; i < ORB.n; i++) {
        const b = { i, side: i % 2 ? 1 : -1, t0: i * ORB.gap, x: p.x, y: p.y - 8, fired: false };
        o.balls.push(b);
      }
      hurtMods(p).orb = (G2, pl, dmg) => {
        const s = pl._orb;
        if (!s || s.shields <= 0) return dmg;
        if (s.lock > 0) return 0;
        s.shields--; s.lock = ORB.shieldLock;
        fx(G2, 'oneshot_shield_blue', pl.x, pl.y - 8, { follow: pl, dy: -8, dur: 0.5 });
        return dmg - Math.ceil(dmg / 2);
      };
      G.props.push({
        x: 0, y: 1e9, t: 0,
        update(G2, q, dt) { if (p._orb !== o) q.gone = true; },
        draw(ctx, G2) {
          if (p._orb !== o) return;
          for (const b of o.balls) if (o.t >= b.t0) drawOrb(ctx, b.x, b.y, G2.t);
          for (let i = 0; i < o.shields; i++) {
            const a = o.t * 2 + i * Math.PI, x = p.x + Math.cos(a) * 11, y = p.y - 8 + Math.sin(a) * 6;
            K.glow(ctx, x, y, 7, [0.35, 0.8, 1, 0.5], 1);
          }
        }
      });
    },
    update(G, p, dt) {
      const o = p._orb; if (!o) return;
      o.t += dt; o.tap -= dt; o.lock -= dt;
      for (const b of o.balls) {
        const u = Math.min(1, Math.max(0, (o.t - b.t0) / ORB.fly));
        const tx = p.x + b.side * ORB.side, ty = p.y - ORB.up + Math.sin((o.t + b.i) / ORB.period * Math.PI * 2) * ORB.bob;
        b.x = p.x + (tx - p.x) * u; b.y = p.y - 8 + (ty - (p.y - 8)) * u - Math.sin(u * Math.PI) * ORB.arc;
        if (u >= 1 && !b.fired) { b.fired = true; beam(G, p, b.x, b.y, orbAng(G, p, b), ORB.dmg); }
      }
    },
    end(G, p) {
      const o = p._orb; p._orb = null;
      delete hurtMods(p).orb;
      if (!o) return;
      const taken = [];
      for (const b of o.balls) {
        const e = nearest(G, b.x, b.y, 16 * T, { skip: q => taken.indexOf(q) >= 0 }) || nearest(G, b.x, b.y, 16 * T);
        if (e) taken.push(e);
        const ang = e ? Math.atan2(ec(e)[1] - b.y, ec(e)[0] - b.x) : aimDir(p);
        beam(G, p, b.x, b.y, ang, ORB.dmg * ORB.endMul);
        beam(G, p, b.x, b.y, ang + Math.PI, ORB.dmg * ORB.endMul);   // [ĐO ExtraEndShoot: hai tia, 0° và 180°]
        fx(G, 'explode_energy_doctor_s4', b.x, b.y, { scale: 0.6 });
      }
    }
  };
  // Mỗi lần bấm bắn, cả hai cầu bắn cùng một tia.
  SK.on('fire', (G, p) => {
    const o = p._orb;
    if (!o || p.hero !== 'doctor' || o.tap > 0) return;
    o.tap = ORB.tap;
    for (const b of o.balls) if (b.fired) beam(G, p, b.x, b.y, orbAng(G, p, b), ORB.dmg);
  });

  // ---------------------------------------------------------------- Bộ Dịch Chuyển Lượng Tử
  // [ĐO cfg cd 8, max 2, args "2;1"; ctrlFields skill2BlinkDistance 5, BaseDuration 6, BaseWidth 6.5, WidthExpandDuration 0.33, MaxLength 15,
  // ControlDuration 1.5, PulseBaseInterval 1, BaseDamageRatio 0.1, BuffMoveSpeedFactor 0.3, BuffAtkSpeed 0.3, FirstEnterInvincibleTime 0.8;
  // dump.cs Skill2MaxFieldCount 3] + [WIKI]: chớp tới chỗ chỉ định 5 ô rồi dựng Lĩnh Vực; kẻ địch trong đó bị dừng thời gian, đạn địch
  // bị xoá; phe ta +30% tốc chạy/đánh và xuyên vật cản; mỗi nhịp phóng Xung Lượng Tử lặp lại DMG + hiệu ứng đồng minh gây từ nhịp trước.
  const Q = {
    blink: CTRL('doctor', 'skill2BlinkDistance', 5) * T, life: CTRL('doctor', 'skill2BaseDuration', 6), w: CTRL('doctor', 'skill2BaseWidth', 6.5) * T,
    grow: CTRL('doctor', 'skill2WidthExpandDuration', 0.33), maxLen: CTRL('doctor', 'skill2MaxLength', 15) * T, control: CTRL('doctor', 'skill2ControlDuration', 1.5),
    every: CTRL('doctor', 'skill2PulseBaseInterval', 1), ratio: CTRL('doctor', 'skill2BaseDamageRatio', 0.1), move: 1 + CTRL('doctor', 'skill2BuffMoveSpeedFactor', 0.3),
    rate: 1 + CTRL('doctor', 'skill2BuffAtkSpeed', 0.3), inv: CTRL('doctor', 'skill2FirstEnterInvincibleTime', 0.8), max: 3, fade: 0.25
  };
  const REPLAY = ['fire', 'poison', 'ice', 'ele', 'plague', 'dizzy'];   // hiệu ứng bất thường lặp lại ở nhịp kế [ƯỚC LƯỢNG: dùng bộ debuff của skills.js]
  const qFields = G => (G._qFields = (G._qFields || []).filter(f => !f.gone));

  // Hình dải: hộp xoay theo hướng chớp, dài dần tới `len`, rộng dần tới Q.w trong Q.grow giây.
  const vpages = {};
  function vframe(name) {
    const V = SK.vfx && SK.vfx.data, fr = V && V.atlas.f[name];
    if (!fr) return null;
    let im = vpages[fr[0]];
    if (!im) { im = vpages[fr[0]] = new Image(); im.src = SK.vfx.base + V.atlas.pages[fr[0]] + (V.v ? '?v=' + V.v : ''); }
    return im.complete && im.naturalWidth ? { im, fr } : null;
  }
  function drawField(ctx, f, fade) {
    const w = f.width, L = f.len, u = f.dir;
    ctx.save(); ctx.globalAlpha *= fade;
    ctx.translate(f.x0, f.y0 - 8); ctx.rotate(u);
    const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    g.addColorStop(0, 'rgba(150,60,255,0.30)'); g.addColorStop(0.5, 'rgba(90,40,200,0.16)'); g.addColorStop(1, 'rgba(150,60,255,0.30)');
    ctx.fillStyle = g; ctx.fillRect(0, -w / 2, L, w);
    ctx.strokeStyle = 'rgba(200,140,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, -w / 2 + 0.5, L - 1, w - 1);
    // Hạt lượng tử trôi dọc dải [ĐO doctor_skin0_quantum_field_particles_0..7, 12 fps].
    const n = Math.round(L * w / 700);
    for (let i = 0; i < n; i++) {
      const k = (i * 0.618 + f.t * 0.05 * (1 + (i % 3) * 0.3)) % 1, px = ((i * 37.7) % L + f.t * 12) % L, py = (((i * 91.3) % w) - w / 2) * (0.6 + 0.4 * k);
      const fr = vframe('doctor_skin0_quantum_field_particles_' + Math.floor((f.t * 12 + i) % 8));
      ctx.globalAlpha = fade * 0.7 * Math.sin(k * Math.PI);
      if (fr) ctx.drawImage(fr.im, fr.fr[1], fr.fr[2], fr.fr[3], fr.fr[4], px - fr.fr[5], py - fr.fr[6], fr.fr[3], fr.fr[4]);
    }
    ctx.globalAlpha = fade;
    // Bốn góc [ĐO quantom_field_fx0_0..3, 8 fps; p0..p3 lật theo trục].
    const fr = vframe('quantom_field_fx0_' + Math.floor(f.t * 8) % 4);
    if (fr) for (const [cx, cy, fx_, fy_] of [[0, -w / 2, 1, 1], [L, -w / 2, -1, 1], [L, w / 2, -1, -1], [0, w / 2, 1, -1]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(fx_, fy_);
      ctx.drawImage(fr.im, fr.fr[1], fr.fr[2], fr.fr[3], fr.fr[4], -fr.fr[5] * 0.6, -fr.fr[6] * 0.6, fr.fr[3] * 0.6, fr.fr[4] * 0.6);
      ctx.restore();
    }
    ctx.restore();
  }
  // Điểm (x, y) (chân) nằm trong dải? Dải trải từ (x0, y0) dọc hướng dir, dài len, rộng width.
  function inStrip(f, x, y) {
    const dx = x - f.x0, dy = y - f.y0, c = Math.cos(f.dir), s = Math.sin(f.dir);
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    return u >= 0 && u <= f.len && Math.abs(v) <= f.width / 2;
  }
  const inStripE = (f, e) => inStrip(f, ec(e)[0], ec(e)[1] + 8);

  function safeBlink(G, x, y, ang, dist) {
    const c = Math.cos(ang), s = Math.sin(ang), r = 4;
    let d = 0, ox = x, oy = y;
    while (d < dist) {
      const nx = x + c * (d + 2), ny = y + s * (d + 2);
      if (W.boxHits(G.map, nx - r, ny - r, nx + r, ny)) break;
      ox = nx; oy = ny; d += 2;
    }
    return [ox, oy];
  }
  function fieldLen(G, x, y, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    let d = 0;
    while (d < Q.maxLen && !W.solidAt(G.map, x + c * d, y + s * d)) d += 4;
    return Math.max(T, d);
  }
  function makeField(G, p, x0, y0, dir) {
    const f = { x0, y0, dir, len: fieldLen(G, x0, y0, dir), width: 0, t: 0, gone: false, rec: 0, recFx: new Set(), pulse: Q.every, stopped: new Set(), entered: new Set() };
    const list = qFields(G);
    while (list.length >= Q.max) { const old = list.shift(); old.t = Math.max(old.t, Q.life); }
    list.push(f);
    G.props.push({
      x: x0, y: -1e9 + 1, t: 0,
      update(G2, q, dt) {
        f.t += dt;
        if (f.t >= Q.life + Q.fade) { f.gone = true; q.gone = true; return; }
        if (f.t < Q.life) qUpdate(G2, p, f, dt);
        f.width = Q.w * Math.min(1, f.t / Q.grow);
      },
      draw(ctx, G2) {
        if (f.t < Q.life) drawField(ctx, f, 1);
        else drawField(ctx, f, 1 - (f.t - Q.life) / Q.fade);
      }
    });
    return f;
  }
  function qUpdate(G, p, f, dt) {
    // Kẻ địch lần đầu vào dải bị dừng thời gian; đạn địch trong dải bị xoá.
    for (const e of G.enemies) {
      if (!alive(e) || !inStripE(f, e)) continue;
      if (!f.stopped.has(e)) {
        f.stopped.add(e);
        stun(e, Q.control);
        fx(G, 'buff_time_stop', e.x, e.y - e.hb.off[1] * e.scale, { follow: e, dy: -e.hb.off[1] * e.scale, dur: Q.control });
      }
    }
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && inStrip(f, b.x, b.y + (b.h || 0))) b.dead = true;
    // Ghi lại hiệu ứng bất thường đang bám trên quái trong dải.
    for (const e of G.enemies) if (alive(e) && e._db && inStripE(f, e)) for (const k of REPLAY) if (e._db[k]) f.recFx.add(k);
    f.pulse -= dt;
    if (f.pulse <= 0) {
      f.pulse += Q.every;
      fx(G, 'doctor_skin0_quantum_wave', f.x0 + Math.cos(f.dir) * f.len / 2, f.y0 - 8 + Math.sin(f.dir) * f.len / 2, { ang: f.dir, scale: f.width / 16 });
      const dmg = Math.round(f.rec * Q.ratio);
      for (const e of G.enemies) {
        if (!alive(e) || !inStripE(f, e)) continue;
        if (dmg > 0) hit(G, p, e, Math.max(1, dmg), { noMul: true, crit: false, tag: 'qpulse' });
        for (const k of f.recFx) debuff(G, e, k);
      }
      f.rec = 0; f.recFx.clear();
    }
  }
  // Sát thương gây ra khi người chơi đứng trong dải được ghi lại cho nhịp kế (xung của chính nó không tự ghi lại: RecursiveFilterTag).
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player;
    if (!p || p.hero !== 'doctor' || G._skHit === 'qpulse') return;
    for (const f of qFields(G)) if (f.t < Q.life && inStrip(f, p.x, p.y)) f.rec += dmg;
  });
  // Trong dải: phe ta +30% tốc chạy và tốc đánh, xuyên vật cản (ô OBST); lần đầu vào được bất tử 0.8 s.
  timers.quantum = (G, p) => {
    if (p.hero !== 'doctor') return;
    const fs = qFields(G).filter(f => f.t < Q.life && inStrip(f, p.x, p.y));
    setMul(p, 'moveMul', 'quantum', fs.length ? Q.move : 1);
    setMul(p, 'rateMul', 'quantum', fs.length ? Q.rate : 1);
    const was = p._qNoclip;
    p._qNoclip = fs.length > 0;
    for (const f of fs) if (!f.entered.has(p)) { f.entered.add(p); p.invulT = Math.max(p.invulT, Q.inv); }
    if (was && !p._qNoclip) pushOut(G, p);
  };
  const OBST = W.OBST;
  function boxBlocked(G, x, y, r) {
    for (let ty = Math.floor((y - r) / T); ty <= Math.floor((y - 0.01) / T); ty++) {
      for (let tx = Math.floor((x - r) / T); tx <= Math.floor((x + r - 0.01) / T); tx++) {
        if (W.solidTile(G.map, tx, ty) && !(tx >= 0 && ty >= 0 && tx < G.map.W && ty < G.map.H && G.map.tiles[ty * G.map.W + tx] === OBST)) return true;
      }
    }
    return false;
  }
  // Ra khỏi dải mà còn kẹt trong vật cản thì đẩy ra ô trống gần nhất.
  function pushOut(G, p) {
    const r = p.h.body.r;
    if (!W.boxHits(G.map, p.x - r, p.y - r, p.x + r, p.y)) return;
    for (let d = 2; d < 4 * T; d += 2) for (let a = 0; a < 16; a++) {
      const x = p.x + Math.cos(a / 16 * Math.PI * 2) * d, y = p.y + Math.sin(a / 16 * Math.PI * 2) * d;
      if (!W.boxHits(G.map, x - r, y - r, x + r, y)) { p.x = x; p.y = y; return; }
    }
  }
  const moveBox0 = SK.moveBox;
  SK.moveBox = function (map, a, dx, dy, r) {
    const G = SK.G;
    if (!(G && a === G.player && a._qNoclip)) return moveBox0(map, a, dx, dy, r);
    let hit_ = false;
    for (const ax of [true, false]) {
      let rem = ax ? dx : dy;
      while (Math.abs(rem) > 1e-6) {
        const s = Math.abs(rem) > 1 ? Math.sign(rem) : rem, nx = ax ? a.x + s : a.x, ny = ax ? a.y : a.y + s;
        if (boxBlocked(G, nx, ny, r)) { hit_ = true; break; }
        a.x = nx; a.y = ny; rem -= s;
      }
    }
    return hit_;
  };

  S.quantum_translocator = {
    start(G, p) {
      layer(G);
      charges(p, 'quantum_translocator'); useCharge(p, 'quantum_translocator');
      const { ang } = targetAng(G, p, 16 * T);
      const x0 = p.x, y0 = p.y;
      fx(G, 'doctor_skin0_teleport_fx_start', x0, y0 - 8, { dur: 0.2 });
      const [nx, ny] = safeBlink(G, x0, y0, ang, Q.blink);
      p.x = nx; p.y = ny;
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      fx(G, 'doctor_skin0_teleport_fx_end', nx, ny - 8, { dur: 0.35 });
      makeField(G, p, x0, y0, ang);
      G.shake = Math.max(G.shake, 2);
    }
  };
})();
