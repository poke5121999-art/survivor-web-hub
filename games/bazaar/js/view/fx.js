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
  var MAX_PARTS = 480;                       // VFX-23: trận dày (652 hạt) gánh nặng canvas; hạt cũ nhất bị thay trước
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
    // VFX-33: điện thoại ngang (scale 0,36) số chỉ còn ~15 px → phóng số theo 1/scale, tối đa 1,8× [ĐỀ XUẤT: ngưỡng 0,5]
    F.uiK = Math.max(1, Math.min(1.8, 0.5 / (s || 1)));
  };
  F.uiK = 1;
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
  function ready(name) {
    var t = texImg[name];
    if (!t || !t.img.complete || !(t.img.naturalWidth > 0)) return null;
    if (!t.src) bake(t);
    return t;
  }
  // Nướng texture một lần khi ảnh tải xong (VFX-2/7/8: ô vuông đen/đặc màu):
  //  - texture "color" mà alpha đặc (≥ 50 % điểm ảnh alpha ≈ 1) là ảnh vẽ trên nền đen cho blend cộng/premultiplied, hoặc ảnh
  //    gói kênh (R/G/B là ba mặt nạ khác nhau, vd FX_Star_01_T, FX_Heal_Swoosh_Atlas_T). Unity cộng màu nên nền đen vô hình,
  //    còn canvas trong suốt đè lên DOM thì nền đen thành ô vuông đen. → alpha = max(R,G,B)·alpha, màu chia lại cho alpha
  //    (alpha "nướng sẵn"); từ đó texture coi như mặt nạ, tô màu được theo màu prefab.
  //  - ô lưới (flipbook/biến thể) có viền đặc (trung bình alpha mép > 0,25, vd hàng đầu FX_Glow_01_T là dải trắng kín ô) bị
  //    nhân thêm mặt nạ tròn mềm để không bao giờ thành hình chữ nhật; ô gần như trống bị loại khỏi danh sách ô dùng được.
  function bake(t) {
    var im = t.img, m = t.meta, cols = m.cols || 1, rows = m.rows || 1, w = im.naturalWidth, h = im.naturalHeight;
    t.src = im; t.valid = null; t.packed = false;
    var c, x, d;
    try {
      c = document.createElement('canvas'); c.width = w; c.height = h; x = c.getContext('2d');
      x.drawImage(im, 0, 0); d = x.getImageData(0, 0, w, h);
    } catch (e) { return; } // canvas bị khoá (khác nguồn): dùng ảnh gốc
    var px = d.data, n = w * h, i, opaque = 0, changed = false;
    if (m.kind === 'color') {
      for (i = 0; i < n; i += 7) if (px[i * 4 + 3] > 242) opaque++;
      if (opaque * 7 > n * 0.5) {
        for (i = 0; i < n; i++) {
          var o = i * 4, r = px[o], g = px[o + 1], b = px[o + 2], mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
          var a = mx * px[o + 3] / 255;
          if (mx > 0) { px[o] = r * 255 / mx; px[o + 1] = g * 255 / mx; px[o + 2] = b * 255 / mx; }
          px[o + 3] = a;
        }
        t.packed = true; changed = true;
      }
    }
    var fw = Math.floor(w / cols), fh = Math.floor(h / rows), valid = [];
    for (var f = 0; f < cols * rows; f++) {
      var x0 = (f % cols) * fw, y0 = Math.floor(f / cols) * fh, eT = 0, eB = 0, eL = 0, eR = 0, sum = 0, sn = 0, xx, yy;
      for (xx = 0; xx < fw; xx++) { eT += px[((y0) * w + x0 + xx) * 4 + 3]; eB += px[((y0 + fh - 1) * w + x0 + xx) * 4 + 3]; }
      for (yy = 0; yy < fh; yy++) { eL += px[((y0 + yy) * w + x0) * 4 + 3]; eR += px[((y0 + yy) * w + x0 + fw - 1) * 4 + 3]; }
      for (yy = 0; yy < fh; yy += 4) for (xx = 0; xx < fw; xx += 4) { sum += px[((y0 + yy) * w + x0 + xx) * 4 + 3]; sn++; }
      if (sum / sn / 255 < 0.012) continue; // ô trống
      valid.push(f);
      // một mép bất kỳ còn đặc (vd ô có quầng sáng bị cắt phẳng ở đáy) là đủ thành vạch chữ nhật trên màn
      if (Math.max(eT / fw, eB / fw, eL / fh, eR / fh) / 255 > 0.2) { // viền đặc → mặt nạ tròn mềm
        for (yy = 0; yy < fh; yy++) for (xx = 0; xx < fw; xx++) {
          var dx = (xx + 0.5) / fw * 2 - 1, dy = (yy + 0.5) / fh * 2 - 1, rr = Math.sqrt(dx * dx + dy * dy);
          var k = rr <= 0.35 ? 1 : rr >= 0.98 ? 0 : 1 - (rr - 0.35) / 0.63; k = k * k * (3 - 2 * k);
          var q = ((y0 + yy) * w + x0 + xx) * 4 + 3; px[q] = px[q] * k;
        }
        changed = true;
      }
    }
    if (valid.length && valid.length < cols * rows) t.valid = valid;
    if (changed) { x.putImageData(d, 0, 0); t.src = c; }
  }
  F.texInfo = function (name) { var t = ready(name); return t ? { packed: t.packed, valid: t.valid, baked: t.src !== t.img } : null; };
  // ô dùng được thứ u (0..1) trong đời hạt / chuyến bay, hoặc ô cố định theo seed
  function frameOf(t, u, seed) {
    var m = t.meta, N = (m.cols || 1) * (m.rows || 1), V = t.valid;
    if (N <= 1) return 0;
    var L = V ? V.length : N, j = u != null ? Math.min(L - 1, Math.floor(u * L)) : Math.abs(seed | 0) % L;
    return V ? V[j] : j;
  }
  function tinted(name, color) {
    var key = name + '|' + color, c = tintCache[key];
    if (c) return c;
    var t = ready(name);
    if (!t) return null;
    if ((t.meta.kind === 'color' && !t.packed) || !color) { tintCache[key] = t.src; return t.src; }
    c = document.createElement('canvas'); c.width = t.src.width || t.src.naturalWidth; c.height = t.src.height || t.src.naturalHeight;
    var x = c.getContext('2d');
    x.drawImage(t.src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
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
  // VFX-6: chân dung rộng 192 px (±96) nên số đặt NGOÀI chân dung: sát thương/độc/bỏng bên trái (bay tiếp sang trái),
  // hồi máu/khiên/hồi phục bên phải (REF heal 07-10, REF shield 08-12: số ở cạnh phải chân dung, chân dung vẫn thấy rõ) [ĐỀ XUẤT: khoảng cách 150 px].
  var NT = {
    damage: { neg: true, face: '#ffffff', tint: '#ff0000', amt: lin([[0, 1], [0.126, 0], [0.779, 0], [1, 1]]), outline: '#820003', glow: 'rgba(130,0,4,.55)', gs: [3, 1.5],
      off: [-3.3, 0.4, 0.6], offL: [-3.4, 0.4, 0.5], offC: [-3.3, 0.3, 0.4], travel: [-2.2, 0, 0], jitter: [0.6, 0, 0], total: 1000, fin: 50, fout: 250, s: 1.3, sL: 2.0, sC: 2.3,
      dist: curve([[0, 0, 4.9], [0.138, 0.491, 0.6], [0.697, 0.741, 1], [1, 1, 0.02]]), sc: curve([[0.006, 1, -0.13], [1, 0.498, -1.4]]) },
    heal: { face: '#ffffff', tint: '#00ff00', amt: lin([[0, 1], [0.235, 0], [0.779, 0], [1, 1]]), outline: '#375802', glow: 'rgba(2,103,0,.62)', gs: [3, 1.25],
      off: [3.3, 0.3, 0], travel: [0.4, 0, 0], travelL: [0.5, 0, 0], total: 800, fin: 25, fout: 250, s: 1.0, sL: 1.2, plus: true,
      dist: curve([[0, 0, 2.3], [0.247, 0.557, 1.3], [1, 1, 0.4]]), sc: curve([[0, 0.818, 1.2], [0.133, 1], [0.246, 1], [1, 0.691, -0.66]]) },
    shield: { face: '#fcfc2c', tint: '#fcfc2c', amt: lin([[0, 0], [1, 0]]), outline: '#3c0c52', glow: 'rgba(160,80,210,.55)', gs: [3.4, 2], pill: '#742c8c', pillEdge: '#a45cc8',
      off: [3.5, 0.7, 0.4], offL: [3.6, 0.7, 0.2], offC: [3.6, 0.7, 0], travel: [1.2, 0, 0], total: 1200, fin: 60, fout: 300, s: 1.25, sL: 1.7, sC: 2.0, plus: true,
      dist: curve([[0, 0], [0.138, 0.505], [0.697, 0.741], [1, 1]]), sc: curve([[0, 0.818], [0.133, 1], [0.299, 1], [0.622, 0.553], [1, 0.553]]) },
    shieldLoss: { neg: true, face: '#ffe96d', tint: '#fe0700', amt: lin([[0, 1], [0.224, 0], [0.6, 0], [1, 1]]), outline: '#820003', glow: 'rgba(188,58,75,.5)', gs: [3, 1.5],
      off: [-3.3, 1.0, 0.4], travel: [-2, 0, 0], total: 800, fin: 25, fout: 200, s: 1.2, sL: 2.0,
      dist: curve([[0, 0], [0.138, 0.505], [0.697, 0.741], [1, 1]]), sc: curve([[0, 0.818], [0.133, 1], [0.299, 1], [0.622, 0.553], [1, 0.553]]) },
    // bỏng: mặt chữ TRẮNG viền #A40000 (VISUAL §6 SCT_Burn_M) — trước đây đỏ trên chân dung đỏ nên gần như vô hình (VFX-6)
    burn: { neg: true, face: '#ffffff', tint: '#ff8a30', amt: lin([[0, 0], [0.232, 0], [0.624, 0.45], [1, 1]]), outline: '#a40000', glow: 'rgba(152,0,0,.62)', gs: [2, 2.5],
      off: [-2.9, -0.2, 0], travel: [0, 0, 1], total: 750, fin: 50, fout: 400, s: 1.0, sL: 1.3,
      dist: function (t) { return t; }, sc: curve([[0, 0, 11], [0.087, 0.986, 0], [0.986, 0.007, -1]]) },
    poison: { neg: true, face: '#ffffff', tint: '#009876', amt: lin([[0, 1], [0.241, 0], [0.632, 0], [1, 1]]), outline: '#035951', glow: 'rgba(0,123,114,.6)', gs: [3, 1.25],
      off: [-3.1, 0.2, 0], travel: [-0.5, 0, 0], travelL: [-0.6, 0, 0], total: 800, totalL: 1000, fin: 25, fout: 250, s: 1.0, sL: 1.2,
      dist: curve([[0, 0, 4.7], [0.119, 0.563, 1.5], [1, 1, 0.09]]), sc: curve([[0, 0.689], [0.075, 1], [0.262, 1], [0.986, 0.498]]) }
  };
  // CRIT (REF-combat-core: chữ số trắng #fcf4f4 viền/quầng đỏ, nhãn CRIT ở trên, vệt đỏ-cam ngắn, tổng ~1,1 s).
  // VFX-4: cỡ ~0,9 chiều cao chân dung (~85 px ở 1080p) thay vì 1,3× (cũ s 5,85 ≈ 220 px); chỉ đỏ đặc trong ~80 ms đầu.
  NT.crit = { neg: true, crit: true, face: '#fcf4f4', tint: '#e44434', amt: lin([[0, 0.7], [0.08, 0], [1, 0]]), outline: '#b01818', glow: 'rgba(228,52,40,.65)', gs: [3.2, 1.9],
    off: [-3.2, 0.3, 0.5], offC: [-3.2, 0.3, 0.5], travel: [-0.9, 0, 0.3], total: 1100, fin: 30, fout: 320, s: 2.3, sL: 2.3, sC: 2.3, streak: true,
    dist: curve([[0, 0, 3], [0.15, 0.5, 0.6], [1, 1, 0.1]]), sc: curve([[0, 1.25, -2.4], [0.09, 1, 0], [0.7, 1, 0], [1, 0.7, -0.8]]) };
  NT.sand = Object.assign({}, NT.damage, { face: '#ffffff', tint: '#ff1a10', outline: '#7a0000', glow: 'rgba(200,30,20,.6)', total: 900, s: 1.1, sL: 1.4 });
  NT.regen = Object.assign({}, NT.heal, { off: [3.1, 0.1, 0] });
  NT.burnGain = Object.assign({}, NT.burn, { plus: true, off: [-2.7, 1.5, 0], travel: [-0.4, 0, 0.6] });
  NT.poisonGain = Object.assign({}, NT.poison, { plus: true, off: [-3.0, 1.3, 0], travel: [-0.5, 0, 0.3] });
  NT.regenGain = Object.assign({}, NT.heal, { plus: true, off: [3.0, 1.3, 0] });
  Object.keys(NT).forEach(function (k) { // quầng nền: tách rgb + alpha một lần (trước đây regex mỗi khung mỗi số — VFX-23)
    var ty = NT[k], mm = /rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/.exec(ty.glow);
    ty.glowRGB = mm ? 'rgb(' + mm[1] + ',' + mm[2] + ',' + mm[3] + ')' : ty.glow; ty.glowA = mm ? parseFloat(mm[4]) : 0.5; ty.key = k;
  });
  F.NUMBER_TYPES = NT;

  // kích thước (đơn vị px ở s = 1) của chuỗi số theo số đo font Bazaar Numbers, không cần ảnh đã tải
  function measure(text) {
    var V = root.BZ_VFX && root.BZ_VFX.font;
    if (!V) return { w: 26 * text.length + 24, h: 52 };
    var G = V.glyphs, w = 0, top = 0, bot = 0;
    for (var i = 0; i < text.length; i++) { var gl = G[text[i]]; if (!gl) continue; w += gl.adv; if (gl.w) { top = Math.max(top, gl.by); bot = Math.max(bot, gl.h / V.scale - gl.by); } }
    return { w: w + 24, h: top + bot + 4 / V.scale };
  }

  // dựng sprite số: base = viền (màu viền) + mặt chữ (màu mặt); tint = mặt chữ tô màu chuyển (đỏ ở hai đầu đời số);
  // label "Crit!" vẽ riêng, không bị tô màu (OLD_NotoSans_Bold_SDF_Damage_M). Sprite dùng lại theo (chuỗi, kiểu) — VFX-23.
  var glyphCache = {}, glyphCacheN = 0;
  function glyphSprite(text, ty, critLabel) {
    var ck = text + '|' + ty.key + '|' + (critLabel || '');
    if (glyphCache[ck]) return glyphCache[ck];
    var face = ty.face, outline = ty.outline, tintCol = ty.tint;
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
    var sp = { base: base, tint: tint, label: label, w: cw / Us, h: chh / Us, Us: Us };
    if (glyphCacheN > 240) { glyphCache = {}; glyphCacheN = 0; }
    glyphCache[ck] = sp; glyphCacheN++;
    return sp;
  }

  // number({x, y, kind, value, crit, t0, frac, side, aux})
  // VFX-5: chỗ đặt thử tối đa 15 lần (ScrollingTextController.cs:534) theo HỘP CHỮ THẬT, so với mọi số đang bay quanh cùng chân dung
  // (mọi kiểu: sát thương, độc, khiên...), bước = cỡ chữ; cũ chỉ so cùng kiểu, bước 44 px nhỏ hơn số 2 chữ nên dính thành "-2523-2".
  // lưới chỗ thử: (cột ra ngoài 0..3, hàng −3..3), gần trước; cột −1 (lấn vào chân dung) đắt nhất
  var SLOTS = [];
  (function () { for (var cx = -1; cx <= 3; cx++) for (var cy = -3; cy <= 3; cy++) SLOTS.push([cx, cy, (cx < 0 ? 4 : cx * 1.25) + Math.abs(cy) + (cy > 0 ? 0.1 : 0)]);
    SLOTS.sort(function (a, b) { return a[2] - b[2]; }); })();
  F.number = function (o) {
    var ty = NT[o.kind] || NT.damage;
    if (o.crit && (o.kind === 'damage' || !o.kind)) ty = NT.crit;
    var big = Math.max(0, Math.min(1, (o.frac || 0) * 100 / 50));
    var crit = !!o.crit && (ty.sC != null);
    var off = crit ? (ty.offC || ty.off) : (big > 0.5 && ty.offL ? ty.offL : ty.off);
    var tr = (big > 0.5 && ty.travelL) ? ty.travelL : ty.travel;
    var jx = ty.jitter ? (Math.random() * 2 - 1) * ty.jitter[0] : 0;
    var s = (crit ? ty.sC : ty.s + (((ty.sL || ty.s) - ty.s) * big)) * F.uiK;
    var text = (ty.plus ? '+' : ty.neg ? '-' : '') + String(Math.round(o.value));
    var t0n = o.t0 == null ? T : o.t0, sz = measure(text), bw = (sz.w - 14) * s * 0.82 * 0.9, bh = sz.h * s * 0.82 * 0.8 + (crit ? 24 * s : 0);
    var out = off[0] < 0 ? -1 : 1, bx0 = o.x + off[0] * U * F.uiK, by0 = o.y - off[1] * 30 - off[2] * 30;
    var life = (big > 0.5 && ty.totalL) ? ty.totalL : ty.total, ddx = (tr[0] + jx * 0.5) * U * F.uiK, ddy = -(tr[1] * 30 + tr[2] * 34);
    var ox = 0, oy = 0, TAU = [0, 150, 350, 600];
    // so cả QUỸ ĐẠO (4 mốc trong 0,6 s tới), không chỉ chỗ xuất phát: số ra sau (Multicast giãn 300 ms) bay đuổi theo số trước đang chậm lại
    for (var tries = 0; tries < SLOTS.length; tries++) {
      var cx = SLOTS[tries][0] * bw * out, cy = SLOTS[tries][1] * bh, clash = false;
      var px0 = bx0 + cx, py0 = by0 + cy;
      if (tries < SLOTS.length - 1 && (py0 - bh / 2 < 4 || py0 + bh / 2 > H - 4 || px0 - bw / 2 < 4 || px0 + bw / 2 > W - 4)) continue; // ra ngoài sân thì bị kẹp chồng lên nhau
      for (var q = 0; q < nums.length && !clash; q++) {
        var m = nums[q];
        if (m.side !== o.side || t0n - m.t0 > m.life * 0.75 || m.t0 - t0n > 900) continue;
        for (var ti = 0; ti < TAU.length; ti++) {
          var tt = t0n + TAU[ti], lm = (tt - m.t0) / m.life, lc = TAU[ti] / life;
          if (lm < 0 || lm >= 1 || lc >= 1) continue;
          var dm = m.ty.dist(lm), dc = ty.dist(lc);
          if (Math.abs(m.x0 + m.dx * dm - (bx0 + cx + ddx * dc)) < (m.bw + bw) / 2 && Math.abs(m.y0 + m.dy * dm - (by0 + cy + ddy * dc)) < (m.bh + bh) / 2) { clash = true; break; }
        }
      }
      ox = cx; oy = cy;
      if (!clash) break;
    }
    var n = { bx: o.x, ox: ox, oy: oy, side: o.side, cx: bx0 + ox, cy: by0 + oy, bw: bw, bh: bh,
      t0: t0n, life: life, ty: ty, crit: crit,
      x0: bx0 + ox, y0: by0 + oy,
      dx: ddx, dy: ddy,
      s: s * 0.82, text: text, sprite: null, tint: null
    };
    nums.push(n);
    if (o.aux) F.stats.numbersAux++; else F.stats.numbers++;
    F.stats.byKind[o.kind] = (F.stats.byKind[o.kind] || 0) + 1;
    if (nums.length > 48) nums.shift();
    return n;
  };
  function drawNumber(n) {
    var lt = (T - n.t0) / n.life;
    if (lt < 0) return true;
    if (lt >= 1) return false;
    if (!n.sprite) {
      n.sprite = glyphSprite(n.text, n.ty, n.crit ? 'CRIT' : null);
      if (!n.sprite) return true;
    }
    var ty = n.ty, d = ty.dist(lt), sc = Math.max(0, ty.sc(lt)) * n.s;
    var a = Math.min(1, lt / (ty.fin / n.life)) * Math.min(1, (1 - lt) / (ty.fout / n.life));
    if (a <= 0 || sc <= 0.01) return true;
    var sp = n.sprite, w = sp.w * sc, h = sp.h * sc, lh = sp.label ? h * 0.42 : 0;
    // giữ trọn số (cả nhãn CRIT) trong sân 1920×1080 — VFX-4: nhãn từng bị cắt ở mép trên, số bên dưới tụt khỏi sân
    var px = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, n.x0 + n.dx * d)), py = Math.max(h / 2 + lh * 0.75 + 4, Math.min(H - h / 2 - 4, n.y0 + n.dy * d));
    // quầng nền (FX_Glow_03 tô màu)
    var gl = tinted('glow', ty.glowRGB);
    if (gl) {
      g.globalAlpha = a * ty.glowA; g.globalCompositeOperation = 'source-over';
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
    if (ty.streak && lt < 0.45) { // vệt đỏ-cam ngắn sang trái
      var sl = w * (0.45 + 0.6 * lt), sa = a * (1 - lt / 0.45) * 0.75, sx0 = px - w * 0.35;
      var gr = g.createLinearGradient(sx0, 0, sx0 - sl, 0);
      gr.addColorStop(0, 'rgba(255,170,60,' + sa.toFixed(3) + ')'); gr.addColorStop(0.4, 'rgba(240,60,30,' + (sa * 0.8).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(200,20,20,0)');
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; g.fillStyle = gr;
      g.beginPath(); g.moveTo(sx0, py - h * 0.12); g.lineTo(sx0 - sl, py - h * 0.02); g.lineTo(sx0 - sl, py + h * 0.02); g.lineTo(sx0, py + h * 0.12); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = a;
    }
    g.drawImage(sp.base, px - w / 2, py - h / 2, w, h);
    var ta = ty.amt(lt);
    if (ta > 0.01) { g.globalAlpha = a * ta; g.drawImage(sp.tint, px - w / 2, py - h / 2, w, h); }
    if (sp.label) { var lw = lh * sp.label.width / sp.label.height; g.globalAlpha = a; g.drawImage(sp.label, px - w / 2 + w * 0.05, py - h / 2 - lh * 0.6, lw, lh); }
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
    var tx = texImg[p.tex], meta = tx.meta, cols = meta.cols || 1, rows = meta.rows || 1;
    var s = p.s0 + (p.s1 - p.s0) * (p.ease ? p.ease(lt) : lt);
    var a = (p.a0 == null ? 1 : p.a0) + ((p.a1 == null ? 0 : p.a1) - (p.a0 == null ? 1 : p.a0)) * lt;
    if (p.fin && lt < p.fin) a *= lt / p.fin;
    if (a <= 0.003 || s <= 0.3) return true;
    g.globalAlpha = Math.min(1, a);
    g.globalCompositeOperation = p.add === false ? 'source-over' : 'lighter';
    var fw = im.width / cols, fh = im.height / rows, fi = 0;
    if (cols * rows > 1) fi = p.anim ? frameOf(tx, lt) : (tx.valid && tx.valid.indexOf(p.frame || 0) < 0 ? frameOf(tx, null, p.frame || 0) : (p.frame || 0));
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
    slow: { c: '#68f8f8', c2: '#e2ffff', travel: 400, ease: curve([[0, 0, 0.4], [1, 1, 2]]), size: 0.85 },
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
      melee: !!(E && !E.projectile) && (o.kind === 'damage' || o.kind == null), // làm chậm/sạc/nạp đạn/phá huỷ không có sprite đạn: vẫn bay quầng mặc định (VFX-31)
      seed: Math.floor(Math.random() * 1000),
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
  // anim chỉ khi prefab chạy ô theo đời hạt ('life'); 'random'/'' = một ô cố định (ô ngẫu nhiên / ô đầu dùng được)
  function mapPart(id, color, x, y, size, life, t0, grow) {
    var m = texImg[id].meta, add = m.blend !== 'alpha', N = (m.cols || 1) * (m.rows || 1);
    return { tex: id, color: color, x: x, y: y, vx: 0, vy: 0, life: life, s0: size, s1: size * (grow || 1.25), a0: 1, a1: 0, t0: t0, add: add, anim: N > 1 && m.anim === 'life',
      frame: m.anim === 'random' ? Math.floor(Math.random() * N) : 0,
      rot: Math.random() * 6.28, ar: (m.cols && m.rows && m.cols !== m.rows) ? m.cols / m.rows : 1 };
  }
  F.mapPart = mapPart;
  function drawProj(p) {
    var u = (T - p.t0) / p.travel;
    if (u < 0) return true;
    if (u >= 1) return false;
    var k = p.k, s = k.size * (p.crit ? 1.35 : 1) * (p.kind === 'damage' ? 1.35 : 1); // VFX-34: quả cầu sát thương ~ nửa bề rộng thẻ, đuôi rõ
    var head = projPos(p, u), prev = projPos(p, u - 0.06);
    var ang = Math.atan2(head.y - prev.y, head.x - prev.x);
    if (p.melee) return true; // đòn cận chiến: không có đạn, chỉ có chớp trúng
    g.globalCompositeOperation = 'lighter';
    // vệt đuôi: dập nhiều quầng nhỏ dọc đường đã bay
    var gl = tinted('glow', k.c);
    if (gl) {
      for (var i = 7; i >= 1; i--) {
        var q = projPos(p, u - i * 0.045);
        if (u - i * 0.045 < 0) continue;
        g.globalAlpha = 0.55 * (1 - i / 8);
        var r = (70 - i * 6) * s;
        g.drawImage(gl, q.x - r / 2, q.y - r / 2, r, r);
      }
      g.globalAlpha = 1; g.drawImage(gl, head.x - 70 * s, head.y - 70 * s, 140 * s, 140 * s);
      var gw2 = tinted('glow', k.c2); if (gw2) { g.globalAlpha = 0.9; g.drawImage(gw2, head.x - 30 * s, head.y - 30 * s, 60 * s, 60 * s); }
    }
    var bt = p.body && ready(p.body);
    if (bt) { // thân đạn theo sprite của prefab (đã nướng alpha: không còn ô nền đen/đặc màu)
      var bm = bt.meta, bs = Math.min(170, Math.max(34, (p.entry.size && p.entry.size.p || 1) * 22)) * (p.crit ? 1.25 : 1);
      var bimg = tinted(p.body, p.entry.color && (bm.kind === 'mask' || bt.packed) ? p.entry.color : null), bc = bm.cols || 1, br = bm.rows || 1, bf = 0;
      if (bc * br > 1) bf = bm.anim === 'life' ? frameOf(bt, u) : frameOf(bt, null, p.seed);
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
    if (o.entry && o.entry.impact && !(kind === 'shield' && o.entry.impact === 'heroWave')) { // chớp trúng riêng của prefab (cộng thêm lên chùm hạt chung; khiên mặc định đã có heroWave)
      var im = F.mapSprite(o.entry.impact);
      if (im) { var isz = Math.min(150, Math.max(50, (o.entry.size && o.entry.size.i || 4) * 14)) * (o.frac != null ? 0.55 + 0.6 * Math.sqrt(Math.min(1, o.frac)) : 1); var mp = mapPart(im, o.entry.impactColor || o.entry.color, x, y, isz * (o.crit ? 1.3 : 1), Math.min(380, o.entry.impactMs || 500), t0, 1.35); mp.add = true; mp.a0 = 0.55; spawn(mp); }
    }
    switch (kind) {
      case 'damage': {
        // VFX-10: cỡ và độ dài theo phần máu mất (o.frac = máu mất / máu tối đa): đòn nhỏ ~60-80 px trong ~200-300 ms (REF fire-damage),
        // đòn ≥ 25 % máu mới tới cỡ cũ; chí mạng ×1,3. Không che kín chân dung 166 px.
        var crit = !!o.crit, fr = Math.max(0, Math.min(1, o.frac == null ? 0.1 : o.frac));
        var m = (0.42 + 0.75 * Math.sqrt(fr)) * (crit ? 1.3 : 1), lm = 0.55 + 0.45 * Math.min(1, fr * 4);
        spawn({ tex: 'glow', color: '#870a0a', x: x, y: y, vx: 0, vy: 0, life: 380 * lm, s0: 130 * m, s1: 200 * m, a0: 0.8, a1: 0, t0: t0, add: false });
        spawn({ tex: 'flash', color: '#ffe896', x: x, y: y, vx: 0, vy: 0, life: 130, s0: 100 * m, s1: 150 * m, a0: 1, a1: 0, t0: t0, rot: Math.random() * 6 });
        spawn({ tex: 'flash', color: '#dd1c1c', x: x, y: y, vx: 0, vy: 0, life: 170, s0: 120 * m, s1: 170 * m, a0: 0.85, a1: 0, t0: t0, rot: Math.random() * 6 });
        if (fr > 0.06 || crit) spawn({ tex: 'slash', color: '#ff4a2a', x: x, y: y, vx: 0, vy: 0, life: 240 * lm, s0: 160 * m, s1: 210 * m, a0: 0.75, a1: 0, t0: t0, anim: true, ar: 1, rot: Math.random() * 6 });
        var nsp = fr > 0.15 || crit ? 3 : fr > 0.05 ? 2 : 1;
        for (i = 0; i < nsp; i++) spawn({ tex: 'spikes', color: '#ff3b12', x: x, y: y, vx: 0, vy: 0, life: rnd(380, 560) * lm, s0: rnd(110, 150) * m, s1: rnd(150, 200) * m, a0: 0.85, a1: 0, anim: true, rot: rnd(0, 6.28), t0: t0 });
        var nd = crit ? 14 : Math.round(4 + 8 * Math.min(1, fr * 3));
        for (i = 0; i < nd; i++) {
          var an = rnd(0, 6.28), sp = rnd(320, 520) * Math.max(0.7, m);
          spawn({ tex: 'dot', color: i % 2 ? '#fdb851' : '#ff572a', x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 3.2, life: rnd(260, 520) * lm,
            s0: rnd(9, 15), s1: 3, a0: 1, a1: 0, stretch: 0.09, t0: t0 });
        }
        if (crit) {
          spawn({ tex: 'shock', color: '#ea2a1c', x: x, y: y, vx: 0, vy: 0, life: 480, s0: 50, s1: 260, a0: 0.85, a1: 0, t0: t0 });
          spawn({ tex: 'glow', color: '#ffffff', x: x, y: y, vx: 0, vy: 0, life: 150, s0: 150, s1: 190, a0: 0.8, a1: 0, t0: t0 });
        }
        break;
      }
      case 'sandstorm': // nhịp bão cát: chỉ chớp đỏ nhỏ + vài hạt cát, số đỏ mới là thông tin (REF sandstorm)
        spawn({ tex: 'flash', color: '#ff5a2a', x: x, y: y, vx: 0, vy: 0, life: 160, s0: 50, s1: 80, a0: 0.8, a1: 0, t0: t0, rot: Math.random() * 6 });
        for (i = 0; i < 4; i++) spawn({ tex: 'dot', color: '#ffd9a0', x: x + rnd(-30, 30), y: y + rnd(-20, 20), vx: rnd(200, 420), vy: rnd(-40, 40), drag: 2, life: rnd(200, 380),
          s0: rnd(6, 10), s1: 2, a0: 0.9, a1: 0, stretch: 0.05, t0: t0 });
        break;
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
        // BlikFrame (FX_HeroFrameWave_04 + FX_Shield_08, 0,54 s): khung vàng nở quanh chân dung; lõi khiên nhỏ, không loá trắng cả chân dung
        spawn({ tex: 'heroWave', color: '#fed800', x: x, y: y, vx: 0, vy: 0, life: 540, s0: 200, s1: 250, a0: 0.85, a1: 0, t0: t0 });
        spawn({ tex: 'tri', color: '#ffe96d', x: x, y: y, vx: 0, vy: 0, life: 520, s0: 110, s1: 200, a0: 0.45, a1: 0, t0: t0 });
        spawn({ tex: 'shield', color: '#f4cf21', x: x, y: y, vx: 0, vy: 0, life: 380, s0: 50, s1: 95, a0: 0.6, a1: 0, t0: t0 });
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
        for (i = 0; i < 10; i++) spawn({ tex: 'dot', color: '#9cffff', x: x + rnd(-40, 40), y: y + rnd(-60, 0), vx: rnd(-20, 20), vy: rnd(60, 200), drag: 0.5,
          life: rnd(400, 900), s0: rnd(8, 14), s1: 2, a0: 0.9, a1: 0, stretch: 0.25, t0: t0 });
        spawn({ tex: 'glow', color: '#68f8f8', x: x, y: y, vx: 0, vy: 0, life: 380, s0: 90, s1: 140, a0: 0.7, a1: 0, t0: t0 });
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
      case 'fire': { // nạp đầy rồi bắn: chớp khung FrameGlow #00FFA8 + vòng xoáy trắng trên thẻ (REF cooldown-sweep 05-08) + vài tia ở mép trên
        spawn({ tex: 'ring', color: '#ffffff', x: x, y: y, vx: 0, vy: 0, life: 240, s0: o.w * 0.35, s1: o.w * 1.05, a0: 0.75, a1: 0, t0: t0, rot: Math.random() * 6, vr: 9 });
        for (i = 0; i < 5; i++) spawn({ tex: 'star', color: '#94ffc4', x: x + rnd(-o.w / 2, o.w / 2), y: y - o.h * 0.38, vx: rnd(-40, 40), vy: rnd(-120, -40),
          drag: 2, life: rnd(250, 450), s0: 14, s1: 3, a0: 1, a1: 0, t0: t0 });
        break;
      }
      case 'flyStart': { // cất cánh (FlyingStart: chớp + vệt máy bay giấy bốc lên) — VFX-17
        var fw = o.w || 100, fh = o.h || 200;
        spawn({ tex: 'glow', color: '#5fc8ff', x: x, y: y, vx: 0, vy: 0, life: 520, s0: fw * 1.2, s1: fw * 1.9, a0: 0.95, a1: 0, t0: t0 });
        spawn({ tex: 'flash', color: '#ffffff', x: x, y: y + fh * 0.25, vx: 0, vy: 0, life: 220, s0: fw * 0.6, s1: fw * 1.3, a0: 1, a1: 0, t0: t0, rot: Math.random() * 6 });
        spawn({ tex: 'ring', color: '#ffffff', x: x, y: y + fh * 0.3, vx: 0, vy: 0, life: 420, s0: fw * 0.4, s1: fw * 1.8, a0: 0.95, a1: 0, t0: t0 });
        for (i = 0; i < 4; i++) spawn({ tex: 'streak', color: '#d8f4ff', x: x + rnd(-fw / 3, fw / 3), y: y + fh * 0.2, vx: 0, vy: rnd(-700, -450), drag: 2, life: rnd(300, 450), s0: fh * 0.35, s1: fh * 0.15, a0: 0.9, a1: 0, stretch: 0.25, t0: t0 });
        for (i = 0; i < 10; i++) spawn({ tex: i % 2 ? 'star' : 'dot', color: i % 3 ? '#ffffff' : '#9fe8ff', x: x + rnd(-fw / 2, fw / 2), y: y + fh * rnd(0.1, 0.45),
          vx: rnd(-40, 40), vy: rnd(-420, -220), drag: 1.6, life: rnd(350, 650), s0: rnd(10, 18), s1: 2, a0: 1, a1: 0, stretch: i % 2 ? 0 : 0.08, t0: t0 });
        break;
      }
      case 'flyStop': { // hạ cánh (FlyingStop: chớp lớn + bụi hai mép dưới)
        var lw = o.w || 100, lh2 = o.h || 200;
        spawn({ tex: 'flash', color: '#ffffff', x: x, y: y + lh2 * 0.3, vx: 0, vy: 0, life: 200, s0: lw * 0.6, s1: lw * 1.2, a0: 0.9, a1: 0, t0: t0, rot: Math.random() * 6 });
        for (i = 0; i < 10; i++) spawn({ tex: 'dot', color: i % 2 ? '#ffffff' : '#ffd27a', x: x + (i % 2 ? -1 : 1) * lw / 2, y: y + lh2 * 0.4,
          vx: (i % 2 ? -1 : 1) * rnd(60, 220), vy: rnd(-160, 20), drag: 3, life: rnd(300, 600), s0: rnd(10, 18), s1: 0, a0: 1, a1: 0, stretch: 0.06, t0: t0 });
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
      case 'bannerWin': // tia vàng lấp lánh dọc dải băng-rôn (REF victory 13-19)
        for (i = 0; i < 26; i++) { var bx = x + rnd(-460, 460); spawn({ tex: i % 3 ? 'star' : 'dot', color: i % 2 ? '#ffe28a' : '#fff6d0', x: bx, y: y + rnd(-80, 80),
          vx: rnd(-30, 30), vy: rnd(-90, -20), drag: 0.8, life: rnd(700, 1500), s0: rnd(12, 24), s1: 2, a0: 1, a1: 0, t0: t0 + rnd(0, 600) }); }
        spawn({ tex: 'glow', color: '#ffd36b', x: x - 480, y: y, vx: 1500, vy: 0, drag: 2.2, life: 700, s0: 260, s1: 200, a0: 0.7, a1: 0, t0: t0 });
        break;
      case 'bannerLose': case 'bannerDraw': // khói xanh-đen + sương lục quanh dải đỏ (REF defeat 09-19)
        for (i = 0; i < 14; i++) spawn({ tex: 'puff', color: i % 3 ? '#16343a' : '#2d5a3a', x: x + rnd(-520, 520), y: y + rnd(-40, 90), vx: rnd(-40, 40), vy: rnd(-60, -10),
          life: rnd(1400, 2200), s0: rnd(120, 180), s1: rnd(240, 340), a0: kind === 'bannerDraw' ? 0.35 : 0.6, a1: 0, anim: true, add: false, t0: t0 + rnd(0, 500), fin: 0.25 });
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
        else if (A.kind === 'sand') { // VFX-11: khói cát nhạt (trước 0,5-0,9 che mờ hàng đối thủ và số máu)
          if (Math.random() < 0.55) spawn({ tex: 'dust', color: '#d99a52', x: r.x - 160, y: r.y + Math.random() * r.h, vx: rnd(520, 950), vy: rnd(-50, 70), life: rnd(1800, 2800),
            s0: rnd(140, 220), s1: rnd(240, 360), a0: 0.2 + A.k * 0.22, a1: 0, add: false, rot: rnd(0, 6), vr: rnd(-1, 1), fin: 0.12 });
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
