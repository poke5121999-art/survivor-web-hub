/*
 * Sáu minigame câu / nạo vét của DREDGE, vẽ trên canvas phủ toàn màn hình bằng sprite gốc.
 * Luật chép từ D:\dredge-ref\notes\CODE.md mục 4.2-4.3. Chỗ mã gốc để ở prefab (không có số) đánh dấu [ĐOÁN] bên dưới.
 *   DRMinigame.open({ type, cfg, speed, trophy, itemId, onDone({caught, trophy, aborted}) })
 * Góc trong file này đo theo độ, chiều kim đồng hồ, 0 = đỉnh vòng (trừ con lắc: 0 = thẳng xuống).
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  if (!document.querySelector('link[href*="ui.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../css/ui.css', (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }

  const RAD = Math.PI / 180;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wrap = a => ((a % 360) + 360) % 360;
  const angDiff = (a, b) => { const d = wrap(a - b); return d > 180 ? d - 360 : d; };
  const polar = (cx, cy, r, a) => [cx + r * Math.sin(a * RAD), cy - r * Math.cos(a * RAD)];

  // [ĐOÁN] giá trị prefab: phạt khi bấm trượt, ngưỡng kim cương, tốc độ bóng, tốc độ con lắc.
  const PENALTY_SEC = 0.5, DIAMOND_MIN = 0.78, DIAMOND_MAX = 1.0, BALL_BASE_SPEED = 100, PENDULUM_SPEED = 0.75;
  const PENDULUM_ARC = 150, BALL_LAUNCH = 165, PATTERN_GAP = 2, NOTCH_PAD = 0.012, SPIRAL_DEAD = 0.1;
  // Xoắn ốc của sprite 50PercentSpiral, khớp bằng bình phương tối thiểu trên điểm ảnh: r = R0 + B*theta (px, theta radian).
  const SP = { cx: 111.84, cy: 135.48, r0: 28.705, b: -5.18, t0: -3.82, t1: -20.46 };
  const SP_DEG = Math.abs(SP.t1 - SP.t0) / RAD;

  const imgs = {}, tints = {};
  function img(name) {
    if (!imgs[name]) {
      const i = new Image();
      i.src = (root.DR_UI && DR_UI[name]) || ('art/ui/sprites/' + name + '.webp');
      imgs[name] = i;
    }
    return imgs[name];
  }
  function itemImg(id) {
    const d = root.DR_ITEMS && DR_ITEMS[id];
    if (!d) return null;
    if (!imgs[d.sprite]) { const i = new Image(); i.src = d.sprite; imgs[d.sprite] = i; }
    return imgs[d.sprite];
  }
  // Sprite trắng → tô màu (source-in), giữ cache theo tên+màu.
  function tint(name, color) {
    const im = img(name), key = name + '|' + color;
    if (!im.complete || !im.naturalWidth) return null;
    if (!tints[key]) {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
      tints[key] = c;
    }
    return tints[key];
  }
  function sprite(ctx, src, x, y, w, h, rot, alpha) {
    if (!src || (src.complete === false)) return;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot * RAD);
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Vẽ sprite theo bán kính ngoài.
  function ringSprite(ctx, name, color, cx, cy, rOuter, alpha) {
    const s = color ? tint(name, color) : img(name);
    if (!s) return;
    const w = s.width || s.naturalWidth, h = s.height || s.naturalHeight, k = rOuter / (w / 2);
    if (!w) return;
    sprite(ctx, s, cx, cy, w * k, h * k, 0, alpha);
  }
  // Dải cung theo hàm vị trí fx(góc) → [x,y]; bước 2 độ.
  function band(ctx, fx, a0, a1, width, color, cap) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = cap || 'butt'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2));
    for (let i = 0; i <= n; i++) {
      const p = fx(a0 + (a1 - a0) * i / n);
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.stroke(); ctx.restore();
  }
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* audio is optional */ } };

  // ------------------------------------------------------------------ games
  // Mỗi game: update(dt), draw(ctx, cx, cy, U), press(), debug(). M cung cấp M.cfg, M.hit(), M.miss().

  function Radial(M) { // FISHING_RADIAL
    const c = M.cfg, n = randInt(c.minTargets, c.maxTargets), slot = 300 / n, T = [];
    for (let i = 0; i < n; i++) {
      const special = M.trophy && i === 1;
      const w = special ? c.specialTargetWidth : rand(c.minTargetWidth, c.maxTargetWidth);
      const lo = 30 + i * slot + w / 2 + 10, hi = 30 + (i + 1) * slot - w / 2 - 10;
      T.push({ c: hi > lo ? rand(lo, hi) : 30 + (i + 0.5) * slot, w, special, hit: false, gone: false });
    }
    let ang = 0;
    return {
      update(dt) {
        ang += c.rotationSpeed * dt;
        if (ang >= 360) { ang -= 360; for (const t of T) { t.hit = false; if (t.special) t.gone = true; } }
      },
      press() {
        const t = T.find(t => !t.gone && !t.hit && Math.abs(angDiff(ang, t.c)) < t.w / 2);
        if (!t) return M.miss(1);
        t.hit = true; M.hit(1, t.special);
      },
      draw(ctx, cx, cy, U) {
        ringSprite(ctx, 'FishingUICircle', '#1c1613', cx, cy, U * 1.08, 0.92);
        ringSprite(ctx, 'FishingUICircle', M.locked > 0 ? '#dc2c38' : '#8a7a62', cx, cy, U * 1.08, 0.35);
        const fx = a => polar(cx, cy, U, a);
        for (const t of T) {
          if (t.gone) continue;
          band(ctx, fx, t.c - t.w / 2, t.c + t.w / 2, U * 0.17, t.hit ? 'rgba(239,227,200,.25)' : t.special ? '#ffd104' : '#efe3c8');
        }
        // Kim xoay quanh chân dưới (điểm ảnh 53,130); chấm đen ở đầu trên nằm đúng dải vòng.
        const sp = img('FishingUISpinner');
        if (sp.complete && sp.naturalWidth) {
          const k = U * 1.08 / 128;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang * RAD);
          ctx.drawImage(sp, -53.5 * k, -130 * k, sp.naturalWidth * k, sp.naturalHeight * k);
          ctx.restore();
        }
      },
      debug: () => ({ angle: ang, speed: c.rotationSpeed, targets: T.map(t => ({ c: t.c, w: t.w, special: t.special, hit: t.hit, gone: t.gone })) })
    };
  }

  function Pendulum(M) { // FISHING_PENDULUM
    const c = M.cfg, S = clamp(c.numPendulumSegments || 1, 1, 3), W = PENDULUM_ARC / S, sp = c.rotationSpeed * PENDULUM_SPEED;
    const lo = k => -PENDULUM_ARC / 2 + k * W, hi = k => lo(k) + W;
    let notches = 0, trophyLive = false, k = 0, dir = 1, ang = lo(0), used = false;
    const T = [];
    function gen(i) {
      const special = M.trophy && !trophyLive && notches >= 3 && !T.some(t => t && t.special);
      const w = special ? c.specialTargetWidth : rand(c.minTargetWidth, c.maxTargetWidth);
      const a = lo(i) + w / 2 + 3, b = hi(i) - w / 2 - 3;
      T[i] = { c: b > a ? rand(a, b) : (lo(i) + hi(i)) / 2, w, special };
      if (special) trophyLive = true;
    }
    for (let i = 0; i < S; i++) gen(i);
    return {
      update(dt) {
        ang += dir * sp * dt;
        if (dir > 0 && ang >= hi(k)) { ang = hi(k); dir = -1; used = false; }
        else if (dir < 0 && ang <= lo(k)) { ang = lo(k); dir = 1; used = false; }
      },
      press() {
        const t = T[k];
        if (used || Math.abs(ang - t.c) >= t.w / 2) return M.miss(1);
        used = true; notches++;
        const special = t.special;
        if (special) trophyLive = false;
        gen(k);
        let nk = k + dir;                       // đoạn kế tiếp theo chiều đang đu
        if (nk < 0 || nk >= S) { dir = -dir; nk = k + dir; if (nk < 0 || nk >= S) nk = k; }
        k = nk;
        M.hit(1, special);
      },
      draw(ctx, cx, cy, U) {
        const px = cx, py = cy - U * 0.95, L = U * 1.55, fx = a => [px + L * Math.sin(a * RAD), py + L * Math.cos(a * RAD)];
        band(ctx, fx, -PENDULUM_ARC / 2, PENDULUM_ARC / 2, U * 0.3, 'rgba(20,14,11,.92)', 'round');
        for (let i = 0; i < S; i++) {
          band(ctx, fx, lo(i) + 0.8, hi(i) - 0.8, U * 0.26, i === k ? 'rgba(239,227,200,.22)' : 'rgba(239,227,200,.08)');
          const t = T[i];
          band(ctx, fx, t.c - t.w / 2, t.c + t.w / 2, U * 0.2, t.special ? '#ffd104' : i === k ? '#efe3c8' : 'rgba(239,227,200,.4)');
        }
        for (let i = 0; i <= S; i++) {
          const a = i === S ? hi(S - 1) : lo(i), p = fx(a), q = [px + (L - U * 0.18) * Math.sin(a * RAD), py + (L - U * 0.18) * Math.cos(a * RAD)];
          ctx.strokeStyle = '#b89a6a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        }
        const pm = img('Pendulum');
        if (pm.complete) {
          const k2 = (L + U * 0.12) / pm.naturalHeight;
          ctx.save(); ctx.translate(px, py); ctx.rotate(-ang * RAD);
          ctx.drawImage(pm, -pm.naturalWidth * k2 * 0.2, 0, pm.naturalWidth * k2 * 0.4, pm.naturalHeight * k2);
          ctx.restore();
        }
        ctx.fillStyle = '#b89a6a'; ctx.beginPath(); ctx.arc(px, py, U * 0.06, 0, 7); ctx.fill();
      },
      debug: () => ({ angle: ang, dir, active: k, segments: S, targets: T.map(t => ({ c: t.c, w: t.w, special: t.special })), used })
    };
  }

  function BallCatcher(M) { // FISHING_BALL_CATCHER
    const c = M.cfg, pats = c.ballCatcherPatterns || [], sf = c.speedFactor || 1, z = c.targetZoneDegrees || 30;
    const balls = [];
    let queue = [], timer = 1 / sf, trophyDone = !M.trophy, patternsRun = 0;
    function nextPattern() {
      let p = pats[randInt(0, pats.length - 1)].map(b => Object.assign({}, b));
      // [ĐOÁN] mã gốc không nói bóng SPECIAL chen vào đâu; chèn thành bóng giữa của mẫu thứ hai.
      if (!trophyDone && patternsRun >= 1) { p[Math.floor(p.length / 2)].ballType = 'SPECIAL'; trophyDone = true; }
      patternsRun++;
      queue = p;
    }
    return {
      update(dt) {
        timer -= dt;
        if (timer <= 0) {
          if (!queue.length) { nextPattern(); }
          const b = queue.shift(), left = b.direction === 'LEFT';
          const spd = BALL_BASE_SPEED * sf / (b.ballType === 'SPECIAL' ? (c.ballTrophySpeedFactor || 1) : 1);
          balls.push({ type: b.ballType, phi: left ? -BALL_LAUNCH : BALL_LAUNCH, v: (left ? 1 : -1) * spd });
          timer = queue.length ? (b.delayBeforeNextBall || 1) / sf : PATTERN_GAP / sf;
        }
        for (const b of balls) b.phi += b.v * dt;
        for (let i = balls.length - 1; i >= 0; i--) if (Math.abs(balls[i].phi) > BALL_LAUNCH + 2 && balls[i].phi * balls[i].v > 0) balls.splice(i, 1);
      },
      press() {
        const inZone = balls.filter(b => Math.abs(b.phi) < z / 2);
        if (!inZone.length) return M.miss(1);
        for (const b of inZone) balls.splice(balls.indexOf(b), 1);
        if (inZone.some(b => b.type === 'OBSTACLE')) return M.miss(1);
        const sp = inZone.some(b => b.type === 'SPECIAL');
        for (const b of inZone) if (b.type !== 'SPECIAL') M.hit(1, false);
        if (sp) M.hit(1, true);
      },
      draw(ctx, cx, cy, U) {
        const half = U * 1.25, R = U * 0.98;
        ringSprite(ctx, 'BallCatcherBG', '#d8c3a0', cx, cy, half, 0.85);
        const fx = a => polar(cx, cy, R, a);
        band(ctx, fx, -z / 2, z / 2, U * 0.2, 'rgba(226,184,102,.45)');
        const bs = U * 0.3;
        for (const b of balls) {
          const p = fx(b.phi);
          if (b.type === 'OBSTACLE') sprite(ctx, img('BallCatcherNegativeBall'), p[0], p[1], bs, bs);
          else sprite(ctx, tint('BallCatcherBall', b.type === 'SPECIAL' ? '#ffd104' : '#efe3c8'), p[0], p[1], bs, bs);
        }
      },
      debug: () => ({ zone: z, balls: balls.map(b => ({ type: b.type, phi: b.phi, v: b.v })) })
    };
  }

  function Diamond(M) { // FISHING_DIAMOND
    const c = M.cfg, T = [];
    let wait = 0.6, spawned = 0;
    const up = c.diamondScaleUpTimeSec || 1.4;
    return {
      update(dt) {
        wait -= dt;
        if (wait <= 0) {
          spawned++;
          const special = M.trophy && spawned === 3;
          T.push({ s: 0, special, dur: up * (special ? (c.diamondTrophySpeedFactor || 1) : 1) });
          wait = rand(c.timeBetweenDiamondTargetsMin, c.timeBetweenDiamondTargetsMax);
        }
        for (const t of T) t.s += dt / t.dur;
        for (let i = T.length - 1; i >= 0; i--) if (T[i].s >= DIAMOND_MAX) T.splice(i, 1); // đạt giới hạn = trượt, không phạt
      },
      press() {
        const hits = T.filter(t => t.s > DIAMOND_MIN && t.s < DIAMOND_MAX);
        if (!hits.length) return M.miss(c.valueFactor == null ? 1 : c.valueFactor);
        for (const t of hits) { T.splice(T.indexOf(t), 1); M.hit(1, t.special); }
      },
      draw(ctx, cx, cy, U) {
        const R = U * 1.08;
        ringSprite(ctx, 'DiamondMinigame_OuterTargetUI', '#8a7a62', cx, cy, R, 0.9);
        ringSprite(ctx, 'DiamondMinigame_InnerTargetUI', null, cx, cy, R * DIAMOND_MIN, 0.9);
        for (const t of T) {
          const col = t.special ? '#ffd104' : '#efe3c8', k = clamp(t.s, 0, 1);
          ringSprite2(ctx, 'DiamondMinigameDiamond', col, cx, cy, R * k, (c.diamondRotation || 0) * (1 - k), 0.95);
        }
      },
      debug: () => ({ min: DIAMOND_MIN, max: DIAMOND_MAX, targets: T.map(t => ({ s: t.s, special: t.special })) })
    };
  }
  function ringSprite2(ctx, name, color, cx, cy, rOuter, rot, alpha) {
    const s = tint(name, color);
    if (!s || rOuter < 1) return;
    const k = rOuter / (s.width / 2);
    sprite(ctx, s, cx, cy, s.width * k, s.height * k, rot, alpha);
  }

  function Spiral(M) { // FISHING_SPIRAL
    const c = M.cfg, n = clamp(c.spiralNumNotches || 3, 1, 5), rate = (c.spiralRotationSpeed || 90) / SP_DEG;
    const G = [];
    for (let i = 0; i < n; i++) {
      const special = M.trophy && i === 1;
      const w = rand(c.spiralMinNotchWidth, c.spiralMaxNotchWidth) * (special ? 0.8 : 1);
      G.push({ c: SPIRAL_DEAD + (i + 0.5) * (1 - 2 * SPIRAL_DEAD) / n, w, special, open: false });
    }
    let prop = 0, dir = 1;
    const onNotch = g => !g.open && prop >= g.c - g.w / 2 - NOTCH_PAD && prop <= g.c + g.w / 2;
    return {
      update(dt) {
        const prev = prop;
        prop += dir * rate * dt;
        if (dir > 0) {
          for (const g of G) {
            const e = g.c + g.w / 2;
            if (!g.open && prev <= e && prop >= e) { prop = e; dir = -1; break; }   // bóng nảy lại ở cổng đóng kế tiếp
          }
        } else if (prop <= 0) { prop = 0; dir = 1; }
        if (prop >= 1) { prop = 1; M.complete(false); }
      },
      press() {
        const g = G.find(onNotch);
        if (!g) return M.miss(c.spiralValueFactor || 0.2);
        g.open = true;
        M.hit(c.spiralValueFactor || 0.2, g.special);
      },
      draw(ctx, cx, cy, U) {
        const s = U * 1.05 / 135, pos = p => {
          const th = SP.t0 + (SP.t1 - SP.t0) * p, r = SP.r0 + SP.b * th;
          return [cx + r * Math.sin(th) * s, cy - r * Math.cos(th) * s];
        };
        const sp = tint('50PercentSpiral', '#2a201a');
        if (sp) ctx.drawImage(sp, cx - SP.cx * s, cy - SP.cy * s, sp.width * s, sp.height * s);
        const fx = p => pos(p);
        for (const g of G) {
          if (g.open) continue;
          const a = g.c - g.w / 2, b = g.c + g.w / 2;
          // band() chia theo "góc" nên truyền tham số thô: đoạn ngắn, chia nhỏ theo prop.
          ctx.save(); ctx.strokeStyle = g.special ? '#ffd104' : '#efe3c8'; ctx.lineWidth = 17 * s; ctx.lineCap = 'butt'; ctx.beginPath();
          for (let i = 0; i <= 8; i++) { const p = fx(a + (b - a) * i / 8); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
          ctx.stroke(); ctx.restore();
          const e = pos(b), th = SP.t0 + (SP.t1 - SP.t0) * b, gt = tint('gate', '#dc2c38') || img('gate');
          if (gt) sprite(ctx, gt, e[0], e[1], 30 * s, 30 * s * 20 / 64, th / RAD - 90);
        }
        const bp = pos(prop);
        ctx.fillStyle = '#0c0907'; ctx.strokeStyle = '#efe3c8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bp[0], bp[1], 10 * s, 0, 7); ctx.fill(); ctx.stroke();
      },
      debug: () => ({ prop, dir, gates: G.map(g => ({ c: g.c, w: g.w, open: g.open, special: g.special, on: onNotch(g) })) })
    };
  }

  function Dredge(M) { // DREDGE_RADIAL
    const c = M.cfg, n = randInt(c.minTargets, c.maxTargets), slot = 360 / n, O = [];
    let lane = 0, last = randInt(0, 1);
    for (let i = 0; i < n; i++) {
      if (i > 0 && Math.random() < 0.9) last = 1 - last;   // 90% đổi vòng so với vật cản trước
      const w = rand(c.minTargetWidth, c.maxTargetWidth);
      const mid = 45 + i * (315 / n) + (315 / n) / 2;
      O.push({ lane: last, c: wrap(mid + rand(-1, 1) * Math.max(0, 315 / n / 2 - w / 2 - 6)), w, touching: false });
    }
    let ang = 0;
    return {
      update(dt) {
        ang = wrap(ang + c.rotationSpeed * dt);
        for (const o of O) {
          const over = o.lane === lane && Math.abs(angDiff(ang, o.c)) < o.w / 2;
          if (over && !o.touching) { M.obstacle(); }
          o.touching = over;
        }
      },
      press() { lane = 1 - lane; play('fish.dredge.changeLane'); },
      draw(ctx, cx, cy, U) {
        const Ro = U * 1.08, Ri = Ro * 0.66;
        ringSprite(ctx, 'DredgeMinigameOuterRing', '#1c1613', cx, cy, Ro, 0.92);
        ringSprite(ctx, 'DredgeMinigameInnerRing', '#1c1613', cx, cy, Ri, 0.92);
        ringSprite(ctx, 'DredgeMinigameOuterRing', M.locked > 0 ? '#dc2c38' : '#8a7a62', cx, cy, Ro, 0.3);
        ringSprite(ctx, 'DredgeMinigameInnerRing', '#8a7a62', cx, cy, Ri, 0.3);
        const mid = r => r * 0.92;
        for (const o of O) {
          const r = mid(o.lane ? Ri : Ro);
          band(ctx, a => polar(cx, cy, r, a), o.c - o.w / 2, o.c + o.w / 2, (o.lane ? Ri : Ro) * 0.17, '#dc2c38');
        }
        const r = mid(lane ? Ri : Ro), p = polar(cx, cy, r, ang), pt = img('DredgingMinigamePointer');
        if (pt.complete) { const k = U * 0.34 / pt.naturalWidth; sprite(ctx, pt, p[0], p[1], pt.naturalWidth * k * 1.6, pt.naturalHeight * k * 1.6, ang - 90); }
      },
      debug: () => ({ angle: ang, lane, speed: c.rotationSpeed, obstacles: O.map(o => ({ lane: o.lane, c: o.c, w: o.w })) })
    };
  }

  const GAMES = {
    FISHING_RADIAL: Radial, FISHING_PENDULUM: Pendulum, FISHING_BALL_CATCHER: BallCatcher,
    FISHING_DIAMOND: Diamond, FISHING_SPIRAL: Spiral, DREDGE_RADIAL: Dredge
  };

  // ------------------------------------------------------------------ session
  let M = null, host = null, canvas = null, ctx = null, W = 0, H = 0, raf = 0, lastT = 0;

  function ensureDom() {
    if (host) return;
    host = document.createElement('div'); host.id = 'dr-mg'; host.className = 'dr-ui';
    canvas = document.createElement('canvas'); host.appendChild(canvas);
    const ab = document.createElement('button');
    ab.className = 'dr-btn mg-abort'; ab.textContent = 'Bỏ cá (Esc)';
    ab.onpointerdown = e => { e.stopPropagation(); };
    ab.onclick = e => { e.stopPropagation(); finish({ caught: false, trophy: false, aborted: true }); };
    host.appendChild(ab);
    host.addEventListener('pointerdown', e => { if (M && e.button !== 2) { e.preventDefault(); action(); } });
    host.addEventListener('contextmenu', e => e.preventDefault());
    document.body.appendChild(host);
    ctx = canvas.getContext('2d');
  }
  function resize() {
    if (!host) return;
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    W = root.innerWidth; H = root.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function action() {
    if (!M || M.done) return;
    if (M.locked > 0 && M.type !== 'DREDGE_RADIAL') return;
    M.game.press();
  }

  function open(opts) {
    if (M) finish({ caught: false, trophy: false, aborted: true }, true);
    ensureDom();
    const type = GAMES[opts.type] ? opts.type : 'FISHING_RADIAL';
    M = {
      type, cfg: opts.cfg, speed: opts.speed == null ? 1 : opts.speed, trophy: !!opts.trophy && type !== 'DREDGE_RADIAL',
      itemId: opts.itemId, onDone: opts.onDone, p: 0, locked: 0, paused: 0, done: false, doneT: 0, trophyHit: false, flash: 0, t: 0
    };
    const dredge = type === 'DREDGE_RADIAL';
    M.hit = (mult, special) => {
      if (M.done) return;
      play(dredge ? 'fish.dredge.hitNotch' : 'fish.minigame.hit');
      M.flash = 1;
      if (special) { M.trophyHit = true; M.p = 1; } else M.p = Math.min(1, M.p + M.cfg.targetValue * M.speed * (mult == null ? 1 : mult));
      if (M.p >= 1) M.complete(M.trophyHit);
    };
    M.miss = f => {
      if (M.done) return;
      play('fish.minigame.miss');
      M.p = Math.max(0, M.p - M.cfg.targetValue * (f == null ? 1 : f));   // [ĐOÁN] removeProgressOnMiss luôn bật
      M.locked = PENALTY_SEC;
    };
    M.obstacle = () => {
      play('fish.dredge.hitNotch');
      M.p = Math.max(0, M.p - M.cfg.targetValue);
      M.paused = PENALTY_SEC;
    };
    M.complete = trophy => {
      if (M.done) return;
      M.done = true; M.trophyHit = !!trophy; M.p = 1; M.doneT = 0;
      play(dredge ? 'fish.dredge.complete' : 'fish.minigame.success');
    };
    M.game = GAMES[type](M);
    host.classList.add('on');
    resize();
    try { root.DRAudio && DRAudio.loop(dredge ? 'fish.dredge.loop' : 'fish.loop', 0.6); } catch (e) { /* audio optional */ }
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function finish(result, silent) {
    if (!M) return;
    const m = M; M = null;
    cancelAnimationFrame(raf);
    host.classList.remove('on');
    try { root.DRAudio && DRAudio.stopLoop(m.type === 'DREDGE_RADIAL' ? 'fish.dredge.loop' : 'fish.loop'); } catch (e) { /* audio optional */ }
    if (!silent && m.onDone) m.onDone(result);
  }

  function tick(now) {
    if (!M) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!M.done) {
      M.t += dt;
      if (M.locked > 0) M.locked -= dt;
      if (M.paused > 0) M.paused -= dt;
      else {
        const base = M.cfg.secondsToPassivelyCatch || 8;
        M.p += dt / (M.type === 'DREDGE_RADIAL' ? base / M.speed : base);
      }
      M.game.update(dt);
      if (M.p >= 1 && !M.done) M.complete(false);
    } else {
      M.doneT += dt;
      if (M.doneT > 0.7) { finish({ caught: true, trophy: M.trophyHit, aborted: false }); return; }
    }
    M.flash = Math.max(0, M.flash - dt * 4);
    draw();
  }

  function draw() {
    const cx = W / 2, cy = H / 2 + (M.type === 'FISHING_PENDULUM' ? H * 0.04 : 0), U = Math.min(W * 0.34, H * 0.36);
    ctx.clearRect(0, 0, W, H);
    const icon = itemImg(M.itemId), d = root.DR_ITEMS && DR_ITEMS[M.itemId];
    const silhouette = d && String(d.subtype) === 'TRINKET';
    if (icon && icon.complete && icon.naturalWidth) {
      const k = Math.min(U * 0.9 / icon.naturalWidth, U * 0.9 / icon.naturalHeight);
      ctx.save();
      if (silhouette) ctx.filter = 'brightness(0)';
      sprite(ctx, icon, cx, cy + (M.type === 'FISHING_PENDULUM' ? U * 0.3 : 0), icon.naturalWidth * k, icon.naturalHeight * k, 0, 0.18 + 0.5 * M.p);
      ctx.restore();
    }
    M.game.draw(ctx, cx, cy, U);

    // Thanh tiến độ bên trái; cá trượt lên theo tiến độ.
    const bh = Math.min(H * 0.62, U * 1.9), bx = Math.max(34, cx - U * 1.55 - 40), by = cy - bh / 2;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 8, by - 8, 16, bh + 16);
    ctx.strokeStyle = '#b89a6a'; ctx.lineWidth = 2; ctx.strokeRect(bx - 8, by - 8, 16, bh + 16);
    const g = ctx.createLinearGradient(0, by + bh, 0, by); g.addColorStop(0, '#b27d34'); g.addColorStop(1, '#f0cc83');
    ctx.fillStyle = M.trophyHit ? '#ffd104' : g;
    ctx.fillRect(bx - 5, by + bh * (1 - M.p), 10, bh * M.p);
    const fi = img('FishingFishIcon');
    if (fi.complete) sprite(ctx, tint('FishingFishIcon', '#efe3c8') || fi, bx, by + bh * (1 - M.p), 24, 24 * 56 / 33, 0);
    if (M.trophy) sprite(ctx, tint('TrophyIcon', '#ffd104'), bx, by - 26, 24, 24);

    ctx.textAlign = 'center'; ctx.fillStyle = '#b9ab8e'; ctx.font = '14px Signika, sans-serif';
    ctx.fillText('Space / F / chạm màn hình: ' + (M.type === 'DREDGE_RADIAL' ? 'đổi vòng' : 'kéo cá') + '   ·   Esc: bỏ', W / 2, H - 18);
    if (d) { ctx.fillStyle = '#efe3c8'; ctx.font = '600 16px Hahmlet, Georgia, serif'; ctx.fillText(d.name, W / 2, 28); }
    if (M.done) {
      ctx.fillStyle = M.trophyHit ? '#ffd104' : '#efe3c8'; ctx.font = '800 34px Hahmlet, Georgia, serif';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.fillText(M.trophyHit ? 'Cá kỷ lục!' : M.type === 'DREDGE_RADIAL' ? 'Đã vớt lên!' : 'Cá cắn câu!', W / 2, cy + U * 0.1);
      ctx.shadowBlur = 0;
    } else if (M.locked > 0 || M.paused > 0) {
      ctx.fillStyle = '#dc2c38'; ctx.font = '600 15px Signika, sans-serif'; ctx.fillText(M.paused > 0 ? 'Va phải vật cản!' : 'Trượt!', W / 2, H - 42);
    }
    if (M.flash > 0) { ctx.fillStyle = 'rgba(255,230,160,' + (M.flash * 0.12) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // Phím: chặn hẳn để engine không lái thuyền / mở cargo khi đang câu.
  root.addEventListener('keydown', e => {
    if (!M) return;
    if (e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) action(); }
    else if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish({ caught: false, trophy: false, aborted: true }); }
  }, true);
  root.addEventListener('keyup', e => { if (M && (e.code === 'Space' || e.code === 'KeyF')) e.stopImmediatePropagation(); }, true);
  root.addEventListener('resize', resize);

  root.DRMinigame = {
    open, isOpen: () => !!M, close: () => finish({ caught: false, trophy: false, aborted: true }),
    // Cho test: hình học hiện tại của mục tiêu và kim chỉ.
    _debug: () => M && Object.assign({ type: M.type, progress: M.p, locked: M.locked, paused: M.paused, done: M.done, trophy: M.trophy }, M.game.debug()),
    _press: () => action()
  };
})(window);
