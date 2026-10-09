/* Chợ Phiên — BZFX: MỘT canvas phủ cả sân khấu cho đạn, hạt, số bay. Đồng hồ = thời gian phát lại (ms) nên
   tua 2×/3× hay tạm dừng tự áp lên hiệu ứng; tua đi/lùi thì clear().
   Texture: window.BZ_VFX (tools/vfx.py) là mặt nạ trắng + alpha → tô màu bằng `source-in`, vẽ cộng (`lighter`)
   như blend additive/premultiplied của Unity (VISUAL.md §18).
   Số bay: font Bazaar Numbers dựng lại từ atlas SDF; đường cong khoảng cách/tỉ lệ/màu theo ScrollingTextTypeConfig (VISUAL.md §6).
   Đạn: thời gian bay + đường cong tốc độ theo bảng projectile (VISUAL.md §7). */
(function (root) {
  'use strict';
  var F = root.BZFX = {};
  var cv = null, g = null, W = 1920, H = 1080, scale = 1;
  var T = 0;                                 // thời gian phát lại hiện tại (ms)
  var parts = [], nums = [], projs = [], calls = [], ambient = {};
  var texImg = {}, tintCache = {}, fontImg = null;
  var MAX_PARTS = 900;
  var U = 46;                                // 1 đơn vị thế giới Unity ≈ 46 px trên sân 1920 (chân dung ~4 đơn vị) [ĐỀ XUẤT]
  F.stats = { projectiles: 0, numbers: 0, numbersAux: 0, bursts: 0, particles: 0, byKind: {} };
  F.resetStats = function () { F.stats = { projectiles: 0, numbers: 0, numbersAux: 0, bursts: 0, particles: 0, byKind: {} }; };

  // ---------- nạp texture ----------
  F.init = function (canvas) {
    cv = canvas; g = cv.getContext('2d');
    var V = root.BZ_VFX || { tex: {} };
    Object.keys(V.tex).forEach(function (k) {
      var im = new Image(); im.decoding = 'async'; im.src = V.tex[k].src + '?v=' + (root.BZ_REV || '');
      texImg[k] = { img: im, meta: V.tex[k] };
    });
    if (V.font) { fontImg = new Image(); fontImg.src = V.font.src + '?v=' + (root.BZ_REV || ''); }
    if (root.BZView && root.BZView.scale) F.resize(root.BZView.scale, Math.min(2, root.devicePixelRatio || 1));
  };
  F.resize = function (s, dpr) {
    if (!cv) return;
    scale = s; var k = Math.max(0.35, Math.min(2, s * (dpr || 1)));
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    g.setTransform(k, 0, 0, k, 0, 0);
    F.k = k;
  };
  // sprite riêng của từng prefab (BZ_VFXMAP.sprites, tools/vfxmap.py): nạp lười, khoá 'm:<tên>'; thiếu thì trả null, không bao giờ ném lỗi
  F.mapSprite = function (key) {
    if (!key) return null;
    var id = 'm:' + key;
    if (texImg[id]) return id;
    var M = root.BZ_VFXMAP, sp = M && M.sprites && M.sprites[key];
    if (!sp || !sp.src) return null;
    var im = new Image(); im.decoding = 'async'; im.src = sp.src + '?v=' + (root.BZ_REV || '');
    texImg[id] = { img: im, meta: sp };
    return id;
  };
  function ready(name) { var t = texImg[name]; return t && t.img.complete && t.img.naturalWidth > 0 ? t : null; }
  function tinted(name, color) {
    var key = name + '|' + color, c = tintCache[key];
    if (c) return c;
    var t = ready(name);
    if (!t) return null;
    if (t.meta.kind === 'color' || !color) { tintCache[key] = t.img; return t.img; }
    c = document.createElement('canvas'); c.width = t.img.naturalWidth; c.height = t.img.naturalHeight;
    var x = c.getContext('2d');
    x.drawImage(t.img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    tintCache[key] = c;
    return c;
  }

  // ---------- đường cong Hermite (AnimationCurve của Unity: [t, v, slope]) ----------
  function curve(keys) {
    var n = keys.length;
    for (var i = 0; i < n; i++) {
      if (keys[i][2] == null) {
        var a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)];
        keys[i][2] = b[0] === a[0] ? 0 : (b[1] - a[1]) / (b[0] - a[0]);
      }
    }
    return function (t) {
      if (t <= keys[0][0]) return keys[0][1];
      if (t >= keys[n - 1][0]) return keys[n - 1][1];
      for (var j = 0; j < n - 1; j++) {
        var k0 = keys[j], k1 = keys[j + 1];
        if (t <= k1[0]) {
          var d = k1[0] - k0[0], u = (t - k0[0]) / d, u2 = u * u, u3 = u2 * u;
          return (2 * u3 - 3 * u2 + 1) * k0[1] + (u3 - 2 * u2 + u) * k0[2] * d + (-2 * u3 + 3 * u2) * k1[1] + (u3 - u2) * k1[2] * d;
        }
      }
      return keys[n - 1][1];
    };
  }
  function lin(keys) { // tuyến tính từng đoạn [t, v]
    return function (t) {
      if (t <= keys[0][0]) return keys[0][1];
      for (var j = 0; j < keys.length - 1; j++) {
        var a = keys[j], b = keys[j + 1];
        if (t <= b[0]) return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
      }
      return keys[keys.length - 1][1];
    };
  }
  F.curve = curve;

  // ---------- kiểu số bay (ScrollingTextTypeConfig, VISUAL.md §6) ----------
  // off/travel tính bằng đơn vị thế giới (x ngang chân dung, y lên, z về phía camera → cả hai đẩy lên trên màn hình)
  var NT = {
    damage: { neg: true, face: '#ffffff', tint: '#ff0000', amt: lin([[0, 1], [0.126, 0], [0.779, 0], [1, 1]]), outline: '#820003', glow: 'rgba(130,0,4,.45)', gs: [3, 1.5],
      off: [-1, 0, 1], offL: [-1, 0, 0.8], offC: [-1, 0, 0.6], travel: [-3, 0, 0], jitter: [2, 0, 0], total: 1000, fin: 50, fout: 250, s: 1.3, sL: 2.0, sC: 2.6,
      dist: curve([[0, 0, 4.9], [0.138, 0.491, 0.6], [0.697, 0.741, 1], [1, 1, 0.02]]), sc: curve([[0.006, 1, -0.13], [1, 0.498, -1.4]]) },
    heal: { face: '#ffffff', tint: '#00ff00', amt: lin([[0, 1], [0.235, 0], [0.779, 0], [1, 1]]), outline: '#375802', glow: 'rgba(2,103,0,.58)', gs: [3, 1.25],
      off: [0.5, 0, 0], travel: [0.2, 0, 0], travelL: [0.3, 0, 0], total: 800, fin: 25, fout: 250, s: 1.0, sL: 1.2, plus: true,
      dist: curve([[0, 0, 2.3], [0.247, 0.557, 1.3], [1, 1, 0.4]]), sc: curve([[0, 0.818, 1.2], [0.133, 1, 0], [0.246, 1, 0], [1, 0.691, -0.66]]) },
    shield: { face: '#fcfc2c', tint: '#fcfc2c', amt: lin([[0, 0], [1, 0]]), outline: '#3c0c52', glow: 'rgba(160,80,210,.55)', gs: [3.4, 2], pill: '#742c8c', pillEdge: '#a45cc8',
      off: [1, 0.5, 0.4], offL: [1, 0.5, 0.2], offC: [1, 0.5, 0], travel: [1.2, 0, 0], total: 1200, fin: 60, fout: 300, s: 1.25, sL: 1.7, sC: 2.0, plus: true,
      dist: curve([[0, 0], [0.138, 0.505], [0.697, 0.741], [1, 1]]), sc: curve([[0, 0.818], [0.133, 1], [0.299, 1], [0.622, 0.553], [1, 0.553]]) },
    shieldLoss: { neg: true, face: '#ffe96d', tint: '#fe0700', amt: lin([[0, 1], [0.224, 0], [0.6, 0], [1, 1]]), outline: '#820003', glow: 'rgba(188,58,75,.5)', gs: [3, 1.5],
      off: [-1, 0.5, 0.4], travel: [-2, 0, 0], total: 800, fin: 25, fout: 200, s: 1.2, sL: 2.0,
      dist: curve([[0, 0], [0.138, 0.505], [0.697, 0.741], [1, 1]]), sc: curve([[0, 0.818], [0.133, 1], [0.299, 1], [0.622, 0.553], [1, 0.553]]) },
    burn: { neg: true, face: '#f03020', tint: '#ff8a30', amt: lin([[0, 0], [0.232, 0], [0.624, 0.45], [1, 1]]), outline: '#5a0800', glow: 'rgba(152,20,0,.55)', gs: [2, 2.5],
      off: [-0.25, 0.25, 0], travel: [0, 0, 1], total: 750, fin: 50, fout: 400, s: 1.0, sL: 1.3,
      dist: function (t) { return t; }, sc: curve([[0, 0, 11], [0.087, 0.986, 0], [0.986, 0.007, -1]]) },
    poison: { neg: true, face: '#ffffff', tint: '#009876', amt: lin([[0, 1], [0.241, 0], [0.632, 0], [1, 1]]), outline: '#035951', glow: 'rgba(0,123,114,.5)', gs: [3, 1.25],
      off: [-0.5, 0, 0], travel: [-0.3, 0, 0], travelL: [-0.4, 0, 0], total: 800, totalL: 1000, fin: 25, fout: 250, s: 1.0, sL: 1.2,
      dist: curve([[0, 0, 4.7], [0.119, 0.563, 1.5], [1, 1, 0.09]]), sc: curve([[0, 0.689], [0.075, 1], [0.262, 1], [0.986, 0.498]]) }
  };
  // CRIT -294 (REF-combat-core: đỏ đặc #e44434 bật ra → trắng #fcf4f4 viền/quầng đỏ, vệt đỏ-cam kéo sang trái, tổng ~1,1 s)
  NT.crit = { neg: true, crit: true, face: '#fcf4f4', tint: '#e44434', amt: lin([[0, 1], [0.1, 1], [0.24, 0], [1, 0]]), outline: '#b01818', glow: 'rgba(228,52,40,.65)', gs: [3.2, 1.9],
    off: [-0.5, 0.3, 0.9], offC: [-0.5, 0.3, 0.9], travel: [-0.9, 0, 0.3], total: 1100, fin: 30, fout: 320, s: 4.0, sL: 4.0, sC: 4.0, streak: true,
    dist: curve([[0, 0, 3], [0.15, 0.5, 0.6], [1, 1, 0.1]]), sc: curve([[0, 1.35, -3], [0.09, 1, 0], [0.7, 1, 0], [1, 0.7, -0.8]]) };
  NT.sand = Object.assign({}, NT.damage, { face: '#ff5a48', tint: '#ff1a10', outline: '#5a0000', glow: 'rgba(200,30,20,.55)', total: 900 });
  NT.regen = Object.assign({}, NT.heal);
  NT.burnGain = Object.assign({}, NT.burn, { plus: true, off: [-0.9, 0.6, 0], travel: [-0.4, 0, 0.6] });
  NT.poisonGain = Object.assign({}, NT.poison, { plus: true, off: [-1.1, 0.4, 0], travel: [-0.5, 0, 0.3] });
  NT.regenGain = Object.assign({}, NT.heal, { plus: true, off: [1.1, 0.4, 0] });
  F.NUMBER_TYPES = NT;

  // dựng sprite số: base = viền (màu viền) + mặt chữ (màu mặt); tint = mặt chữ tô màu chuyển (đỏ ở hai đầu đời số);
  // label "Crit!" vẽ riêng, không bị tô màu (OLD_NotoSans_Bold_SDF_Damage_M)
  function glyphSprite(text, face, outline, tintCol, critLabel) {
    var V = root.BZ_VFX && root.BZ_VFX.font;
    if (!V || !fontImg || !fontImg.complete || !fontImg.naturalWidth) return null;
    var G = V.glyphs, Us = V.scale, i, gl, w = 0, top = 0, bot = 0;
    for (i = 0; i < text.length; i++) {
      gl = G[text[i]]; if (!gl) continue;
      w += gl.adv;
      if (gl.w) { top = Math.max(top, gl.by); bot = Math.max(bot, gl.h / Us - gl.by); }
    }
    var pad = 12, cw = Math.ceil((w + 2 * pad) * Us), chh = Math.ceil((top + bot) * Us) + 4;
    function layer(row, color) {
      var c = document.createElement('canvas'); c.width = cw; c.height = chh;
      var x = c.getContext('2d'), pen = pad;
      for (var j = 0; j < text.length; j++) {
        var q = G[text[j]]; if (!q) continue;
        if (q.w) x.drawImage(fontImg, q.x, row, q.w, q.h, Math.round((pen + q.bx) * Us), Math.round((top - q.by) * Us), q.w, q.h);
        pen += q.adv;
      }
      x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
      return c;
    }
    var base = layer(V.outlineY, outline);
    base.getContext('2d').drawImage(layer(0, face), 0, 0);
    var tint = layer(0, tintCol);
    var label = null;
    if (critLabel) {
      label = document.createElement('canvas');
      var lx = label.getContext('2d'), lf = '900 ' + (30 * Us) + 'px "Noto Sans", sans-serif';
      lx.font = lf; label.width = Math.ceil(lx.measureText(critLabel).width + 18 * Us); label.height = Math.ceil(44 * Us);
      lx.font = lf; lx.textAlign = 'center'; lx.textBaseline = 'middle';
      lx.lineJoin = 'round'; lx.lineWidth = 9 * Us; lx.strokeStyle = '#a01010'; lx.strokeText(critLabel, label.width / 2, label.height / 2);
      lx.fillStyle = '#fcf4f4'; lx.fillText(critLabel, label.width / 2, label.height / 2);
    }
    return { base: base, tint: tint, label: label, w: cw / Us, h: chh / Us, Us: Us };
  }

  // number({x, y, kind, value, crit, t0, frac, side, aux})
  F.number = function (o) {
    var ty = NT[o.kind] || NT.damage;
    if (o.crit && (o.kind === 'damage' || !o.kind)) ty = NT.crit;
    var big = Math.max(0, Math.min(1, (o.frac || 0) * 100 / 50));
    var crit = !!o.crit && (ty.sC != null);
    var off = crit ? (ty.offC || ty.off) : (big > 0.5 && ty.offL ? ty.offL : ty.off);
    var tr = (big > 0.5 && ty.travelL) ? ty.travelL : ty.travel;
    var jx = ty.jitter ? (Math.random() * 2 - 1) * ty.jitter[0] : 0;
    var s = crit ? ty.sC : ty.s + (((ty.sL || ty.s) - ty.s) * big);
    var flip = 1; // cùng hướng cho hai bên (ảnh gốc: số bay sang trái màn hình)
    // ScrollingTextController.cs:534: thử lại tối đa 15 lần cho khỏi đè số cùng loại đang bay → ở đây xếp chồng lên trên
    var t0n = o.t0 == null ? T : o.t0, oy = 0, ox = 0;
    for (var tries = 0; tries < 6; tries++) {
      var clash = false;
      for (var q = 0; q < nums.length; q++) {
        var m = nums[q];
        if (m.ty !== ty || t0n - m.t0 > m.life * 0.55 || t0n < m.t0) continue;
        if (Math.abs(m.y0 - m.oy - (o.y + oy)) < 40 && Math.abs(m.ox - ox) < 50 && m.bx === o.x) { clash = true; break; }
      }
      if (!clash) break;
      if (tries % 2 === 0) oy -= 44; else { oy += 44; ox += (tries < 3 ? 1 : -1) * 70; }
    }
    var n = { bx: o.x, ox: ox, oy: oy,
      t0: o.t0 == null ? T : o.t0, life: (big > 0.5 && ty.totalL) ? ty.totalL : ty.total, ty: ty, crit: crit,
      x0: o.x + ox + off[0] * U * flip, y0: o.y + oy - off[1] * 30 - off[2] * 30 + (Math.random() * 2 - 1) * 8,
      dx: (tr[0] + jx) * U * flip, dy: -(tr[1] * 30 + tr[2] * 34),
      s: s * 0.82, text: (ty.plus ? '+' : ty.neg ? '-' : '') + String(Math.round(o.value)), sprite: null, tint: null
    };
    nums.push(n);
    if (o.aux) F.stats.numbersAux++; else F.stats.numbers++;
    F.stats.byKind[o.kind] = (F.stats.byKind[o.kind] || 0) + 1;
    if (nums.length > 72) nums.shift();
    return n;
  };
  function drawNumber(n) {
    var lt = (T - n.t0) / n.life;
    if (lt < 0) return true;
    if (lt >= 1) return false;
    if (!n.sprite) {
      n.sprite = glyphSprite(n.text, n.ty.face, n.ty.outline, n.ty.tint, n.crit ? 'CRIT' : null);
      if (!n.sprite) return true;
    }
    var ty = n.ty, d = ty.dist(lt), sc = Math.max(0, ty.sc(lt)) * n.s;
    var a = Math.min(1, lt / (ty.fin / n.life)) * Math.min(1, (1 - lt) / (ty.fout / n.life));
    if (a <= 0 || sc <= 0.01) return true;
    var px = n.x0 + n.dx * d, py = n.y0 + n.dy * d;
    var sp = n.sprite, w = sp.w * sc, h = sp.h * sc;
    // quầng nền (FX_Glow_03 tô màu)
    var gl = tinted('glow', ty.glow.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)'));
    if (gl) {
      var ga = parseFloat((/,\s*([\d.]+)\)$/.exec(ty.glow) || [0, 0.5])[1]);
      g.globalAlpha = a * ga; g.globalCompositeOperation = 'source-over';
      var gw = ty.gs[0] * 34 * sc, gh = ty.gs[1] * 34 * sc;
      g.drawImage(gl, px - gw / 2, py - gh / 2, gw, gh);
    }
    g.globalAlpha = a; g.globalCompositeOperation = 'source-over';
    if (ty.pill) { // viên thuốc tím của khiên (#742c8c) quanh chữ vàng
      var pw = w * 1.18, ph = h * 1.02, pr = ph / 2, pxl = px - pw / 2, pyl = py - ph / 2;
      g.beginPath(); g.moveTo(pxl + pr, pyl); g.lineTo(pxl + pw - pr, pyl); g.arc(pxl + pw - pr, py, pr, -Math.PI / 2, Math.PI / 2);
      g.lineTo(pxl + pr, pyl + ph); g.arc(pxl + pr, py, pr, Math.PI / 2, Math.PI * 1.5); g.closePath();
      g.fillStyle = ty.pill; g.fill(); g.lineWidth = Math.max(2, ph * 0.06); g.strokeStyle = ty.pillEdge; g.stroke();
    }
    if (ty.streak && lt < 0.6) { // vệt đỏ-cam sang trái
      var sl = w * (0.9 + lt), sa = a * (1 - lt / 0.6) * 0.9, sx0 = px - w * 0.35;
      var gr = g.createLinearGradient(sx0, 0, sx0 - sl, 0);
      gr.addColorStop(0, 'rgba(255,170,60,' + sa.toFixed(3) + ')'); gr.addColorStop(0.4, 'rgba(240,60,30,' + (sa * 0.8).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(200,20,20,0)');
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; g.fillStyle = gr;
      g.beginPath(); g.moveTo(sx0, py - h * 0.12); g.lineTo(sx0 - sl, py - h * 0.02); g.lineTo(sx0 - sl, py + h * 0.02); g.lineTo(sx0, py + h * 0.12); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = a;
    }
    g.drawImage(sp.base, px - w / 2, py - h / 2, w, h);
    var ta = ty.amt(lt);
    if (ta > 0.01) { g.globalAlpha = a * ta; g.drawImage(sp.tint, px - w / 2, py - h / 2, w, h); }
    if (sp.label) { var lh = h * 0.42, lw = lh * sp.label.width / sp.label.height; g.globalAlpha = a; g.drawImage(sp.label, px - w / 2 + w * 0.05, py - h / 2 - lh * 0.6, lw, lh); }
    return true;
  }

  // ---------- hạt ----------
  // p: {tex, color, add, x, y, vx, vy, ax, ay, drag, life, s0, s1, a0, a1, rot, vr, cols, frame, anim, stretch, t0, fin}
  function spawn(p) {
    if (parts.length >= MAX_PARTS) parts.shift();
    if (p.t0 == null) p.t0 = T;
    p.px = p.x; p.py = p.y; p.lastT = p.t0;
    parts.push(p);
    F.stats.particles++;
    return p;
  }
  F.spawn = spawn;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function drawPart(p, dtS) {
    var lt = (T - p.t0) / p.life;
    if (lt < 0) return true;
    if (lt >= 1) return false;
    var step = Math.max(0, (T - p.lastT) / 1000); p.lastT = T;
    if (step > 0) {
      if (p.drag) { var k = Math.max(0, 1 - p.drag * step); p.vx *= k; p.vy *= k; }
      p.vx += (p.ax || 0) * step; p.vy += (p.ay || 0) * step;
      p.x += p.vx * step; p.y += p.vy * step;
      if (p.vr) p.rot = (p.rot || 0) + p.vr * step;
    }
    var im = tinted(p.tex, p.color);
    if (!im) return true;
    var meta = texImg[p.tex].meta, cols = meta.cols || 1, rows = meta.rows || 1;
    var s = p.s0 + (p.s1 - p.s0) * (p.ease ? p.ease(lt) : lt);
    var a = (p.a0 == null ? 1 : p.a0) + ((p.a1 == null ? 0 : p.a1) - (p.a0 == null ? 1 : p.a0)) * lt;
    if (p.fin && lt < p.fin) a *= lt / p.fin;
    if (a <= 0.003 || s <= 0.3) return true;
    g.globalAlpha = Math.min(1, a);
    g.globalCompositeOperation = p.add === false ? 'source-over' : 'lighter';
    var fw = im.width / cols, fh = im.height / rows, fi = 0;
    if (cols * rows > 1) fi = p.anim ? Math.min(cols * rows - 1, Math.floor(lt * cols * rows)) : (p.frame || 0);
    var sx = (fi % cols) * fw, sy = Math.floor(fi / cols) * fh;
    var w = s * (p.ar || 1), h = s;
    if (p.stretch) {
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx));
      var L = Math.max(w, sp * p.stretch);
      g.drawImage(im, sx, sy, fw, fh, -L / 2, -h / 2, L, h); g.restore();
    } else if (p.rot) {
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(im, sx, sy, fw, fh, -w / 2, -h / 2, w, h); g.restore();
    } else {
      g.drawImage(im, sx, sy, fw, fh, p.x - w / 2, p.y - h / 2, w, h);
    }
    return true;
  }

  // ---------- đạn ----------
  var PK = { // màu, thời gian bay (ms), đường cong tiến độ — VISUAL.md §7
    damage: { c: '#ff3b12', c2: '#ffd27a', travel: 350, ease: curve([[0, 0, 1.3], [1, 0.999, 0.24]]), size: 1 },
    burn: { c: '#ff7100', c2: '#ffe896', travel: 200, ease: curve([[0, 0, 0.4], [1, 1, 2]]), size: 0.9 },
    poison: { c: '#00be81', c2: '#b8ffd8', travel: 300, ease: curve([[0, 0, 0.3], [0.24, 0.129], [1, 1, 1.6]]), size: 0.9 },
    heal: { c: '#7ad21a', c2: '#ddff8e', travel: 420, ease: curve([[0, 0, 0.36], [0.992, 1, 1.4]]), size: 0.95 },
    lifesteal: { c: '#bd3e7a', c2: '#ffb3d2', travel: 350, ease: curve([[0, 0, 0.6], [1, 1, 1.3]]), size: 0.7 },
    shield: { c: '#fed800', c2: '#fff6b0', travel: 400, ease: function (t) { return t; }, size: 1 },
    regen: { c: '#8fe930', c2: '#eaffc0', travel: 200, ease: curve([[0, 0, 0.4], [1, 1, 2]]), size: 0.8 },
    freeze: { c: '#3ec8f8', c2: '#e6fbff', travel: 300, ease: function (t) { return t; }, size: 0.9 },
    slow: { c: '#cca06e', c2: '#ffe2b8', travel: 400, ease: curve([[0, 0, 0.4], [1, 1, 2]]), size: 0.85 },
    haste: { c: '#00eac2', c2: '#d0fff6', travel: 200, ease: function (t) { return t; }, size: 0.85 },
    charge: { c: '#00eac2', c2: '#ffffff', travel: 200, ease: curve([[0, 0, 0.4], [1, 1, 2]]), size: 0.8 },
    reload: { c: '#fe8e00', c2: '#ffe0a0', travel: 200, ease: curve([[0, 0, 0.4], [1, 1, 2]]), size: 0.8 },
    destroy: { c: '#c52c41', c2: '#ffb0b0', travel: 160, ease: curve([[0, 0, 0.4], [1, 1, 2]]), size: 1 },
    buff: { c: '#b3e4e5', c2: '#ffffff', travel: 250, ease: function (t) { return t; }, size: 0.7 }
  };
  F.PROJ = PK;
  F.travel = function (kind) { return (PK[kind] || PK.damage).travel; };
  // projectile({from:{x,y}, to:{x,y}, kind, t0, travel, crit, count})
  function entryKit(E, base) { // đổi entry vfxmap thành bộ thông số đạn (màu, đường cong tiến độ, kích thước)
    var k = Object.assign({}, base);
    if (E.color) k.c = E.color;
    if (E.curve && E.curve.length > 1) k.ease = lin(E.curve);
    k.c2 = base.c2;
    return k;
  }
  F.projectile = function (o) {
    var k = PK[o.kind] || PK.damage, E = o.entry || null;
    if (E) k = entryKit(E, k);
    var dx = o.to.x - o.from.x, dy = o.to.y - o.from.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var p = { k: k, kind: o.kind, x0: o.from.x, y0: o.from.y, x1: o.to.x, y1: o.to.y, t0: o.t0 == null ? T : o.t0,
      travel: o.travel || k.travel, crit: !!o.crit, entry: E, body: E ? F.mapSprite(E.projectile) : null, trailTex: E ? F.mapSprite(E.trail) : null,
      melee: !!(E && !E.projectile),
      nx: -dy / L, ny: dx / L, arc: (Math.random() < 0.5 ? -1 : 1) * Math.min(90, L * 0.12) * (o.arc == null ? 1 : o.arc), lastEmit: -1 };
    projs.push(p);
    if (o.count !== false) F.stats.projectiles++;
    // tụ lực ở thẻ (Slot_BuildUp ~0,2 s)
    if (!p.melee) {
      spawn({ tex: 'glow', color: k.c, x: p.x0, y: p.y0, vx: 0, vy: 0, life: 260, s0: 70 * k.size, s1: 120 * k.size, a0: 0.9, a1: 0, t0: p.t0 });
      spawn({ tex: 'flash', color: k.c2, x: p.x0, y: p.y0, vx: 0, vy: 0, life: 180, s0: 40, s1: 90 * k.size, a0: 1, a1: 0, t0: p.t0, rot: Math.random() * 6 });
    }
    var bu = E && F.mapSprite(E.buildup);
    if (bu) spawn(mapPart(bu, E.color, p.x0, p.y0, Math.min(200, Math.max(60, (E.size && E.size.p || 2) * 28)), 360, p.t0));
    return p;
  };
  function projPos(p, u) {
    var e = p.k.ease(Math.max(0, Math.min(1, u)));
    var arc = Math.sin(Math.PI * e) * p.arc;
    return { x: p.x0 + (p.x1 - p.x0) * e + p.nx * arc, y: p.y0 + (p.y1 - p.y0) * e + p.ny * arc };
  }
  // hạt từ sprite vfxmap: add/premul → cộng sáng, alpha → vẽ thường; anim 'life' chạy hết các ô trong đời hạt
  function mapPart(id, color, x, y, size, life, t0, grow) {
    var m = texImg[id].meta, add = m.blend !== 'alpha';
    return { tex: id, color: color, x: x, y: y, vx: 0, vy: 0, life: life, s0: size, s1: size * (grow || 1.25), a0: 1, a1: 0, t0: t0, add: add, anim: (m.cols || 1) * (m.rows || 1) > 1,
      rot: Math.random() * 6.28, ar: (m.cols && m.rows && m.cols !== m.rows) ? m.cols / m.rows : 1 };
  }
  F.mapPart = mapPart;
  function drawProj(p) {
    var u = (T - p.t0) / p.travel;
    if (u < 0) return true;
    if (u >= 1) return false;
    var k = p.k, s = k.size * (p.crit ? 1.35 : 1);
    var head = projPos(p, u), prev = projPos(p, u - 0.06);
    var ang = Math.atan2(head.y - prev.y, head.x - prev.x);
    if (p.melee) return true; // đòn cận chiến: không có đạn, chỉ có chớp trúng
    g.globalCompositeOperation = 'lighter';
    // vệt đuôi: dập nhiều quầng nhỏ dọc đường đã bay
    var gl = tinted('glow', k.c);
    if (gl) {
      for (var i = 7; i >= 1; i--) {
        var q = projPos(p, u - i * 0.035);
        if (u - i * 0.035 < 0) continue;
        g.globalAlpha = 0.55 * (1 - i / 8);
        var r = (70 - i * 6) * s;
        g.drawImage(gl, q.x - r / 2, q.y - r / 2, r, r);
      }
      g.globalAlpha = 1; g.drawImage(gl, head.x - 70 * s, head.y - 70 * s, 140 * s, 140 * s);
      var gw2 = tinted('glow', k.c2); if (gw2) { g.globalAlpha = 0.9; g.drawImage(gw2, head.x - 30 * s, head.y - 30 * s, 60 * s, 60 * s); }
    }
    var bt = p.body && ready(p.body);
    if (bt) { // thân đạn theo sprite của prefab
      var bm = bt.meta, bs = Math.min(170, Math.max(34, (p.entry.size && p.entry.size.p || 1) * 22)) * (p.crit ? 1.25 : 1);
      var bimg = tinted(p.body, p.entry.color && bm.kind === 'mask' ? p.entry.color : null), bc = bm.cols || 1, br = bm.rows || 1, bf = 0;
      if (bc * br > 1) bf = Math.min(bc * br - 1, Math.floor(u * bc * br));
      var bw = bimg.width / bc, bh = bimg.height / br;
      g.save(); g.translate(head.x, head.y); g.rotate(ang);
      g.globalCompositeOperation = bm.blend === 'alpha' ? 'source-over' : 'lighter'; g.globalAlpha = 1;
      g.drawImage(bimg, (bf % bc) * bw, Math.floor(bf / bc) * bh, bw, bh, -bs / 2, -bs / 2 * (bh / bw), bs, bs * (bh / bw));
      g.restore(); g.globalCompositeOperation = 'lighter';
    }
    var ar = bt ? null : tinted('arrow', k.c2);
    if (ar) {
      g.save(); g.translate(head.x, head.y); g.rotate(ang + Math.PI);
      g.globalAlpha = 1; g.drawImage(ar, -14 * s, -30 * s, 110 * s, 60 * s); g.restore();
    }
    var core = tinted('dot', '#ffffff');
    if (core) { g.globalAlpha = 1; g.drawImage(core, head.x - 20 * s, head.y - 20 * s, 40 * s, 40 * s); }
    // hạt lấp lánh dọc đường (Sparkles của Slot_Projectile)
    if (T - p.lastEmit > 28) {
      p.lastEmit = T;
      spawn({ tex: p.kind === 'poison' ? 'bubble' : p.kind === 'heal' || p.kind === 'regen' ? 'dots' : 'star', color: k.c2, x: head.x, y: head.y,
        vx: rnd(-60, 60), vy: rnd(-60, 60), drag: 2, life: rnd(220, 420), s0: rnd(10, 18) * s, s1: 2, a0: 0.9, a1: 0, frame: Math.floor(Math.random() * 4) });
    }
    return true;
  }

  // ---------- chùm hạt khi trúng / khi bắn ----------
  F.burst = function (kind, x, y, o) {
    o = o || {};
    var t0 = o.t0 == null ? T : o.t0, big = o.big || 1, i;
    F.stats.bursts++;
    if (o.entry && o.entry.impact) { // chớp trúng riêng của prefab (cộng thêm lên chùm hạt chung)
      var im = F.mapSprite(o.entry.impact);
      if (im) { var isz = Math.min(150, Math.max(50, (o.entry.size && o.entry.size.i || 4) * 14)); var mp = mapPart(im, o.entry.impactColor || o.entry.color, x, y, isz * (o.crit ? 1.3 : 1), Math.min(380, o.entry.impactMs || 500), t0, 1.35); mp.add = true; mp.a0 = 0.55; spawn(mp); }
    }
    switch (kind) {
      case 'damage': case 'sandstorm': {
        var crit = !!o.crit, m = crit ? 1.6 : 1;
        spawn({ tex: 'glow', color: '#870a0a', x: x, y: y, vx: 0, vy: 0, life: 480, s0: 150 * m, s1: 240 * m, a0: 0.9, a1: 0, t0: t0, add: false });
        spawn({ tex: 'flash', color: '#ffe896', x: x, y: y, vx: 0, vy: 0, life: 150, s0: 120 * m, s1: 170 * m, a0: 1, a1: 0, t0: t0, rot: Math.random() * 6 });
        spawn({ tex: 'flash', color: '#dd1c1c', x: x, y: y, vx: 0, vy: 0, life: 190, s0: 150 * m, s1: 200 * m, a0: 0.9, a1: 0, t0: t0, rot: Math.random() * 6 });
        spawn({ tex: 'slash', color: '#ff4a2a', x: x, y: y, vx: 0, vy: 0, life: 260, s0: 180 * m, s1: 230 * m, a0: 0.8, a1: 0, t0: t0, anim: true, ar: 1, rot: Math.random() * 6 });
        for (i = 0; i < 3; i++) spawn({ tex: 'spikes', color: '#ff3b12', x: x, y: y, vx: 0, vy: 0, life: rnd(500, 700), s0: rnd(120, 170) * m, s1: rnd(170, 230) * m, a0: 0.9, a1: 0, anim: true, rot: rnd(0, 6.28), t0: t0 });
        for (i = 0; i < (crit ? 22 : 12); i++) {
          var an = rnd(0, 6.28), sp = rnd(380, 560) * m;
          spawn({ tex: 'dot', color: i % 2 ? '#fdb851' : '#ff572a', x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 3.2, life: rnd(300, 650),
            s0: rnd(10, 16), s1: 3, a0: 1, a1: 0, stretch: 0.09, t0: t0 });
        }
        if (crit) {
          spawn({ tex: 'shock', color: '#ea2a1c', x: x, y: y, vx: 0, vy: 0, life: 550, s0: 60, s1: 360, a0: 0.9, a1: 0, t0: t0 });
          spawn({ tex: 'glow', color: '#ffffff', x: x, y: y, vx: 0, vy: 0, life: 160, s0: 220, s1: 260, a0: 0.9, a1: 0, t0: t0 });
        }
        break;
      }
      case 'burn':
        spawn({ tex: 'glow', color: '#ff7100', x: x, y: y, vx: 0, vy: 0, life: 420, s0: 110 * big, s1: 170 * big, a0: 0.85, a1: 0, t0: t0 });
        for (i = 0; i < 10; i++) spawn({ tex: i % 2 ? 'glowdots' : 'dot', color: i % 3 ? '#ff7a1a' : '#ffe08a', x: x + rnd(-30, 30), y: y + rnd(-20, 20),
          vx: rnd(-140, 140), vy: rnd(-260, -80), drag: 1.5, life: rnd(350, 700), s0: rnd(14, 30), s1: 3, a0: 1, a1: 0, anim: true, t0: t0 });
        break;
      case 'poison':
        spawn({ tex: 'glow', color: '#00be81', x: x, y: y, vx: 0, vy: 0, life: 520, s0: 110 * big, s1: 170 * big, a0: 0.75, a1: 0, t0: t0 });
        for (i = 0; i < 9; i++) spawn({ tex: 'bubble', color: '#56f0a8', x: x + rnd(-40, 40), y: y + rnd(-20, 30), vx: rnd(-40, 40), vy: rnd(-160, -60),
          drag: 1, life: rnd(500, 900), s0: rnd(10, 26), s1: rnd(18, 32), a0: 0.95, a1: 0, t0: t0 });
        break;
      case 'heal': case 'regen': case 'lifesteal': {
        var hc = kind === 'lifesteal' ? '#ff7ab0' : '#2cdc24';
        spawn({ tex: 'glow', color: kind === 'lifesteal' ? '#bd3e7a' : '#2cdc24', x: x, y: y, vx: 0, vy: 0, life: 500, s0: 120 * big, s1: 190 * big, a0: 0.6, a1: 0, t0: t0 });
        for (i = 0; i < (kind === 'regen' ? 6 : 14); i++) spawn({ tex: i % 4 === 0 ? 'heart' : 'dots', color: hc, x: x + rnd(-70, 70), y: y + rnd(-30, 40),
          vx: rnd(-30, 30), vy: rnd(-180, -60), drag: 1.2, life: rnd(500, 900), s0: rnd(12, 24), s1: 4, a0: 1, a1: 0, frame: i % 4, t0: t0 });
        break;
      }
      case 'shield':
        spawn({ tex: 'heroWave', color: '#fed800', x: x, y: y, vx: 0, vy: 0, life: 540, s0: 200, s1: 250, a0: 1, a1: 0, t0: t0 });
        spawn({ tex: 'tri', color: '#ffe96d', x: x, y: y, vx: 0, vy: 0, life: 600, s0: 120, s1: 230, a0: 0.75, a1: 0, t0: t0 });
        spawn({ tex: 'shield', color: '#f4cf21', x: x, y: y, vx: 0, vy: 0, life: 420, s0: 60, s1: 110, a0: 0.8, a1: 0, t0: t0 });
        for (i = 0; i < 10; i++) { var a2 = rnd(0, 6.28); spawn({ tex: 'star', color: '#fff3a0', x: x, y: y, vx: Math.cos(a2) * 260, vy: Math.sin(a2) * 260, drag: 3,
          life: rnd(300, 600), s0: 18, s1: 4, a0: 1, a1: 0, t0: t0 }); }
        break;
      case 'freeze':
        spawn({ tex: 'glow', color: '#3ec8f8', x: x, y: y, vx: 0, vy: 0, life: 420, s0: 120, s1: 180, a0: 0.9, a1: 0, t0: t0 });
        spawn({ tex: 'ring', color: '#bfefff', x: x, y: y, vx: 0, vy: 0, life: 400, s0: 40, s1: 220, a0: 0.6, a1: 0, t0: t0 });
        for (i = 0; i < 10; i++) { var a3 = rnd(0, 6.28), s3 = rnd(140, 300); spawn({ tex: 'ice', x: x, y: y, vx: Math.cos(a3) * s3, vy: Math.sin(a3) * s3, drag: 2.5,
          life: rnd(250, 500), s0: rnd(18, 34), s1: 6, a0: 1, a1: 0, frame: Math.floor(Math.random() * 12), add: false, rot: rnd(0, 6), vr: rnd(-6, 6), t0: t0 }); }
        break;
      case 'unfreeze':
        spawn({ tex: 'crack', color: '#dff7ff', x: x, y: y, vx: 0, vy: 0, life: 160, s0: 150, s1: 170, a0: 1, a1: 0, t0: t0 });
        spawn({ tex: 'flash', color: '#bfefff', x: x, y: y, vx: 0, vy: 0, life: 150, s0: 120, s1: 160, a0: 0.9, a1: 0, t0: t0 });
        for (i = 0; i < 8; i++) { var a4 = rnd(0, 6.28); spawn({ tex: 'ice', x: x, y: y, vx: Math.cos(a4) * 220, vy: Math.sin(a4) * 220 - 60, ay: 500,
          life: rnd(250, 450), s0: rnd(14, 26), s1: 4, a0: 1, a1: 0, frame: Math.floor(Math.random() * 12), add: false, rot: rnd(0, 6), vr: rnd(-8, 8), t0: t0 }); }
        break;
      case 'slow':
        for (i = 0; i < 10; i++) spawn({ tex: 'dot', color: '#e8b070', x: x + rnd(-40, 40), y: y + rnd(0, 60), vx: rnd(-30, 30), vy: rnd(10, 80), drag: 0.5,
          life: rnd(400, 900), s0: rnd(8, 14), s1: 2, a0: 0.9, a1: 0, stretch: 0.25, t0: t0 });
        spawn({ tex: 'glow', color: '#cca06e', x: x, y: y, vx: 0, vy: 0, life: 380, s0: 90, s1: 140, a0: 0.7, a1: 0, t0: t0 });
        break;
      case 'haste': case 'charge':
        spawn({ tex: 'glow', color: '#00eac2', x: x, y: y, vx: 0, vy: 0, life: 320, s0: 90, s1: 150, a0: 0.8, a1: 0, t0: t0 });
        for (i = 0; i < 8; i++) spawn({ tex: 'spark', color: '#7dfff0', x: x + rnd(-40, 40), y: y + rnd(-60, 0), vx: rnd(-60, 60), vy: rnd(-260, -120),
          drag: 1.5, life: rnd(250, 450), s0: rnd(24, 40), s1: 8, a0: 1, a1: 0, anim: true, t0: t0 });
        if (kind === 'charge') spawn({ tex: 'ring', color: '#00ffce', x: x, y: y, vx: 0, vy: 0, life: 350, s0: 30, s1: 180, a0: 0.8, a1: 0, t0: t0 });
        break;
      case 'reload':
        for (i = 0; i < 8; i++) spawn({ tex: 'star', color: '#ffb84a', x: x + rnd(-40, 40), y: y + rnd(20, 70), vx: rnd(-80, 80), vy: rnd(-140, -40), drag: 2,
          life: rnd(250, 450), s0: 18, s1: 4, a0: 1, a1: 0, t0: t0 });
        break;
      case 'fire': { // nạp đầy rồi bắn: chớp khung FrameGlow #00FFA8 + vài tia ở mép trên
        for (i = 0; i < 5; i++) spawn({ tex: 'star', color: '#94ffc4', x: x + rnd(-o.w / 2, o.w / 2), y: y - o.h * 0.38, vx: rnd(-40, 40), vy: rnd(-120, -40),
          drag: 2, life: rnd(250, 450), s0: 14, s1: 3, a0: 1, a1: 0, t0: t0 });
        break;
      }
      case 'land': // CardBumps: tia trắng → cam ở hai mép dưới
        for (i = 0; i < 10; i++) spawn({ tex: 'dot', color: i % 2 ? '#ffffff' : '#ff8f00', x: x + (i % 2 ? -1 : 1) * o.w / 2, y: y + o.h * 0.35,
          vx: rnd(-200, 200), vy: rnd(-200, 60), drag: 3, life: rnd(300, 700), s0: rnd(10, 22), s1: 0, a0: 1, a1: 0, stretch: 0.06, t0: t0 });
        break;
      case 'destroy':
        spawn({ tex: 'crack', color: '#ffb0a0', x: x, y: y, vx: 0, vy: 0, life: 500, s0: 160, s1: 180, a0: 1, a1: 0, t0: t0 });
        for (i = 0; i < 6; i++) spawn({ tex: 'puff', color: '#5a4a44', x: x + rnd(-40, 40), y: y + rnd(-50, 50), vx: rnd(-50, 50), vy: rnd(-90, -20),
          life: rnd(700, 1200), s0: rnd(60, 90), s1: rnd(120, 170), a0: 0.85, a1: 0, anim: true, add: false, t0: t0 });
        spawn({ tex: 'glow', color: '#c52c41', x: x, y: y, vx: 0, vy: 0, life: 420, s0: 120, s1: 200, a0: 0.9, a1: 0, t0: t0 });
        break;
      case 'buff':
        spawn({ tex: 'glow', color: '#b3e4e5', x: x, y: y, vx: 0, vy: 0, life: 360, s0: 80, s1: 140, a0: 0.7, a1: 0, t0: t0 });
        for (i = 0; i < 6; i++) spawn({ tex: 'star', color: '#e8ffff', x: x + rnd(-30, 30), y: y + rnd(-40, 40), vx: rnd(-40, 40), vy: rnd(-160, -60), drag: 1.5,
          life: rnd(300, 600), s0: 16, s1: 3, a0: 1, a1: 0, t0: t0 });
        break;
      case 'death':
        spawn({ tex: 'shock', color: '#ffb36b', x: x, y: y, vx: 0, vy: 0, life: 900, s0: 80, s1: 620, a0: 0.9, a1: 0, t0: t0 });
        spawn({ tex: 'glow', color: '#ffffff', x: x, y: y, vx: 0, vy: 0, life: 260, s0: 260, s1: 380, a0: 1, a1: 0, t0: t0 });
        for (i = 0; i < 14; i++) spawn({ tex: 'puff', color: '#3a2a22', x: x + rnd(-80, 80), y: y + rnd(-60, 60), vx: rnd(-160, 160), vy: rnd(-160, 60), drag: 1,
          life: rnd(900, 1600), s0: rnd(80, 120), s1: rnd(180, 260), a0: 0.8, a1: 0, anim: true, add: false, t0: t0 });
        for (i = 0; i < 24; i++) { var a5 = rnd(0, 6.28), s5 = rnd(300, 700); spawn({ tex: 'dot', color: i % 2 ? '#ffd27a' : '#ff6a2a', x: x, y: y,
          vx: Math.cos(a5) * s5, vy: Math.sin(a5) * s5, drag: 2.5, life: rnd(500, 1000), s0: rnd(10, 18), s1: 2, a0: 1, a1: 0, stretch: 0.08, t0: t0 }); }
        break;
      case 'victory':
        for (i = 0; i < 40; i++) { var a6 = rnd(-3.0, -0.14), s6 = rnd(300, 800); spawn({ tex: i % 3 ? 'star' : 'dot', color: i % 2 ? '#ffd36b' : '#fff3c8', x: x, y: y,
          vx: Math.cos(a6) * s6, vy: Math.sin(a6) * s6, ay: 600, drag: 0.6, life: rnd(900, 1700), s0: rnd(14, 26), s1: 4, a0: 1, a1: 0, t0: t0 }); }
        spawn({ tex: 'ring', color: '#ffd36b', x: x, y: y, vx: 0, vy: 0, life: 700, s0: 60, s1: 420, a0: 0.8, a1: 0, t0: t0 });
        break;
    }
  };

  // ---------- trạng thái kéo dài trên chân dung (bỏng / độc / hồi / khiên / nộ), cường độ 0..1 (StatusEffectControllerVFX) ----------
  F.ambient = function (key, kind, rect, intensity) { ambient[key] = { kind: kind, r: rect, k: intensity, acc: ambient[key] ? ambient[key].acc : 0 }; };
  function runAmbient(dt) {
    for (var key in ambient) {
      var A = ambient[key];
      if (!(A.k > 0.001) || dt <= 0) continue;
      var rate = { burn: 26, poison: 12, regen: 8, shield: 7, rage: 16, sand: 40 }[A.kind] * (0.25 + A.k);
      A.acc += rate * dt / 1000;
      var r = A.r;
      while (A.acc >= 1) {
        A.acc -= 1;
        var x = r.x + Math.random() * r.w, y = r.y + r.h * (0.25 + Math.random() * 0.75);
        if (A.kind === 'burn') spawn({ tex: Math.random() < 0.5 ? 'glowdots' : 'dot', color: Math.random() < 0.6 ? '#ff7a1a' : '#ffd27a', x: x, y: y, vx: rnd(-20, 20), vy: rnd(-120, -50),
          drag: 0.5, life: rnd(500, 1000), s0: rnd(10, 22), s1: 2, a0: 0.95, a1: 0, anim: true, fin: 0.15 });
        else if (A.kind === 'poison') spawn({ tex: 'bubble', color: '#3fe39a', x: x, y: y, vx: rnd(-10, 10), vy: rnd(-70, -30), life: rnd(800, 1400), s0: rnd(6, 12), s1: rnd(12, 20), a0: 0.9, a1: 0, fin: 0.2 });
        else if (A.kind === 'regen') spawn({ tex: 'dots', color: '#b8f56a', x: x, y: y, vx: rnd(-10, 10), vy: rnd(-60, -30), life: rnd(700, 1100), s0: rnd(8, 14), s1: 2, a0: 0.9, a1: 0, frame: 1, fin: 0.2 });
        else if (A.kind === 'shield') spawn({ tex: 'star', color: '#ffe36d', x: x, y: r.y + Math.random() * r.h, vx: 0, vy: rnd(-20, -5), life: rnd(500, 900), s0: rnd(10, 18), s1: 2, a0: 0.9, a1: 0, fin: 0.3 });
        else if (A.kind === 'rage') spawn({ tex: 'glowdots', color: '#ff2a4a', x: x, y: y, vx: rnd(-30, 30), vy: rnd(-160, -60), life: rnd(400, 800), s0: rnd(14, 26), s1: 3, a0: 1, a1: 0, anim: true });
        else if (A.kind === 'sand') {
          if (Math.random() < 0.55) spawn({ tex: 'dust', color: '#d99a52', x: r.x - 160, y: r.y + Math.random() * r.h, vx: rnd(520, 950), vy: rnd(-50, 70), life: rnd(1800, 2800),
            s0: rnd(160, 260), s1: rnd(280, 420), a0: 0.5 + A.k * 0.4, a1: 0, add: false, rot: rnd(0, 6), vr: rnd(-1, 1), fin: 0.12 });
          else spawn({ tex: 'dot', color: '#ffd9a0', x: r.x - 40, y: r.y + Math.random() * r.h, vx: rnd(1100, 1700), vy: rnd(-60, 80), life: rnd(900, 1500),
            s0: rnd(4, 8), s1: 3, a0: 0.8, a1: 0.2, stretch: 0.03 });
        }
      }
    }
  }

  // ---------- lịch gọi lại theo thời gian phát lại ----------
  F.at = function (t, fn) { calls.push({ t: t, fn: fn }); };

  F.clear = function () { parts.length = 0; nums.length = 0; projs.length = 0; calls.length = 0; ambient = {}; if (g) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.restore(); } };
  F.counts = function () { return { parts: parts.length, nums: nums.length, projs: projs.length, calls: calls.length }; };

  // frame(t, dt): chạy lịch, cập nhật, vẽ
  F.frame = function (t, dt) {
    T = t;
    if (calls.length) {
      var due = [], keep = [];
      for (var i = 0; i < calls.length; i++) (calls[i].t <= T ? due : keep).push(calls[i]);
      if (due.length) {
        calls = keep;
        due.sort(function (a, b) { return a.t - b.t; });
        due.forEach(function (c) { try { c.fn(c.t); } catch (e) { if (root.console) console.warn('BZFX call failed', e); } });
      }
    }
    runAmbient(dt);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.restore();
    var j, out;
    out = []; for (j = 0; j < parts.length; j++) if (drawPart(parts[j])) out.push(parts[j]); parts = out;
    out = []; for (j = 0; j < projs.length; j++) if (drawProj(projs[j])) out.push(projs[j]); projs = out;
    out = []; for (j = 0; j < nums.length; j++) if (drawNumber(nums[j])) out.push(nums[j]); nums = out;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  };
})(window);
