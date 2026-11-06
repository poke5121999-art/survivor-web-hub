/*
 * Xuôi Dòng — vẽ một khung hình.
 * Thứ tự lớp: đáy sông → mặt nước → vật nổi dưới thuyền → bờ trên → vật thể + thuyền (xếp theo y)
 * → bờ dưới → mây, tia nắng, chim → bộ đệm ánh sáng (nhân) → quầng sáng (cộng) → viền tối → chữ nổi.
 * Canvas có độ phân giải thật của màn hình; mọi thứ vẽ qua setTransform(S) với S nguyên, nên pixel
 * art giữ đúng lưới còn chữ vẫn nét.
 */
(function (XD) {
  'use strict';
  var AT = window.XD_ATLAS, T = XD.TUNE, U = XD.util;
  var R = XD.render = {};
  var IMG = R.IMG = {}, light, lctx, buf, bctx, front, fctx, fmask, fmctx, boatC, boatX, boatM, boatMX, vign, pat, TINT = {}, SIL = {}, FOAMF = [];
  var STARS = [];
  (function () {
    var s = 7;
    function r() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    for (var i = 0; i < 110; i++) STARS.push({ x: r(), y: r(), p: r() * 6, b: 0.4 + r() * 0.6 });
  })();

  R.load = function (done) {
    var list = [['atlas', 'art/atlas.png'], ['floor', 'art/floor.png']];
    Object.keys(AT.banks).forEach(function (k) {
      list.push(['bank_' + k + '_top', 'art/bank_' + k + '_top.png'], ['bank_' + k + '_bot', 'art/bank_' + k + '_bot.png']);
    });
    var left = list.length;
    list.forEach(function (it) {
      var im = new Image();
      im.onload = function () { if (--left === 0) { prep(); done(); } };
      im.onerror = function () { throw new Error('image not loaded: ' + it[1]); };
      im.src = it[1] + '?v=20260924b';
      IMG[it[0]] = im;
    });
  };

  function prep() {
    var f = AT.frames.WaterLines, c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    c.getContext('2d').drawImage(IMG.atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    IMG.lines = c;
    TINT.warm = radial('255,196,107');
    TINT.soft = radial('255,226,176');
    TINT.green = radial('201,255,142');
    // Hạt bọt gốc có startRotation = π: xoay nửa vòng, tức lật cả hai trục.
    XD.FOAM.frames.forEach(function (n) {
      var f = AT.frames[n], c2 = document.createElement('canvas'), x = c2.getContext('2d');
      c2.width = f.w; c2.height = f.h;
      x.translate(f.w, f.h); x.scale(-1, -1);
      x.drawImage(IMG.atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      FOAMF.push(c2);
    });
  }

  function radial(rgb) {
    var c = document.createElement('canvas'), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    c.width = c.height = 128;
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(0.3, 'rgba(' + rgb + ',0.62)');
    g.addColorStop(0.65, 'rgba(' + rgb + ',0.18)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return c;
  }
  function tinted(name, color) {
    var f = AT.frames[name], c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = f.w; c.height = f.h;
    x.drawImage(IMG.atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color; x.fillRect(0, 0, f.w, f.h);
    return c;
  }
  function silhouette(name, color) {
    var k = name + color;
    if (!SIL[k]) SIL[k] = tinted(name, color);
    return SIL[k];
  }

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  R.resize = function (v) {
    buf = canvas(v.w, v.h); bctx = buf.getContext('2d');
    front = canvas(v.w, v.h); fctx = front.getContext('2d');
    fmask = canvas(BB[2] - BB[0] + 4, BB[3] - BB[1] + 4); fmctx = fmask.getContext('2d');
    boatC = canvas(BB[2] - BB[0], BB[3] - BB[1]); boatX = boatC.getContext('2d');
    boatM = canvas(boatC.width, boatC.height); boatMX = boatM.getContext('2d');
    light = document.createElement('canvas');
    light.width = v.w; light.height = v.h;
    lctx = light.getContext('2d');
    vign = document.createElement('canvas');
    vign.width = v.w; vign.height = v.h;
    var g = vign.getContext('2d'), grd = g.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(4,10,24,0.5)');
    g.fillStyle = grd; g.fillRect(0, 0, v.w, v.h);
    pat = null;
  };

  // ---------------------------------------------------------------- tiện ích vẽ
  function spr(ctx, name, x, y, flip) {
    var f = AT.frames[name];
    if (!f) return;
    if (flip) {
      ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1);
      ctx.drawImage(IMG.atlas, f.x, f.y, f.w, f.h, -f.px, Math.round(y - f.py), f.w, f.h);
      ctx.restore();
      return;
    }
    ctx.drawImage(IMG.atlas, f.x, f.y, f.w, f.h, Math.round(x - f.px), Math.round(y - f.py), f.w, f.h);
  }
  function sil(ctx, name, x, y, color) {
    var f = AT.frames[name];
    ctx.drawImage(silhouette(name, color), Math.round(x - f.px), Math.round(y - f.py));
  }
  function glow(c, tint, x, y, r, a) {
    if (a <= 0.003) return;
    c.globalAlpha = Math.min(1, a);
    c.drawImage(TINT[tint], x - r, y - r, r * 2, r * 2);
    c.globalAlpha = 1;
  }
  // Vẽ các cột [u, u+w) của một ảnh cuộn vòng.
  function strip(ctx, im, u, dx, dy, w) {
    var W = im.width;
    u = U.mod(u, W);
    while (w > 0) {
      var take = Math.min(w, W - u);
      ctx.drawImage(im, u, 0, take, im.height, dx, dy, take, im.height);
      dx += take; w -= take; u = 0;
    }
  }

  function segments(G, v) {
    var out = [], sx = 0;
    while (sx < v.w) {
      var b = XD.bandAt(G.x + sx), w;
      w = b.blendIn ? 6 : Math.max(1, Math.ceil(b.rem - T.blend));
      w = Math.min(w, v.w - sx);
      out.push({ sx: sx, w: w, b: b, open: XD.mixNum(b, 'open', 0) });
      sx += w;
    }
    return out;
  }

  // ---------------------------------------------------------------- lớp nước
  function drawWater(ctx, G, v, segs, day, ox, oy) {
    var FH = IMG.floor.height, swell = XD.mixNum(XD.bandAt(G.x + v.bx), 'swell', 0);
    var fy = Math.round(v.cy - FH / 2 + Math.sin(G.time * 0.5) * 3 * swell) + oy;
    segs.forEach(function (s) {
      var A = XD.BIOMES[s.b.a], B = XD.BIOMES[s.b.b], t = s.b.t;
      strip(ctx, IMG.floor, G.x + s.sx - ox, s.sx, fy, s.w);
      var c = [0, 1, 2].map(function (i) { return Math.round(255 * Math.min(1, U.lerp(A.floor[i], B.floor[i], t))); });
      if (c[0] < 255 || c[1] < 255 || c[2] < 255) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgb(' + c.join(',') + ')';
        ctx.fillRect(s.sx, 0, s.w, v.h);
        ctx.globalCompositeOperation = 'source-over';
      }
      var deep = U.lerp(A.deep, B.deep, t);
      if (deep > 0) { ctx.fillStyle = 'rgba(6,26,54,' + deep.toFixed(3) + ')'; ctx.fillRect(s.sx, 0, s.w, v.h); }
    });
    if (!pat) pat = ctx.createPattern(IMG.lines, 'repeat');
    var px = -U.mod(G.x * 1.0 + G.time * 10, 96), py = U.mod(G.time * 3, 96) - 96;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.translate(px, py);
    ctx.fillStyle = pat;
    ctx.fillRect(-px, -py, v.w, v.h);
    ctx.restore();
    // Sao và trăng in bóng trên mặt nước: đứng yên so với người nhìn, không trôi theo bờ.
    if (day.stars > 0.02) {
      var a = day.stars * (1 - G.wp.clouds * 0.7);
      ctx.fillStyle = '#e6f0ff';
      STARS.forEach(function (s) {
        var tw = 0.5 + 0.5 * Math.sin(G.time * 2 + s.p);
        ctx.globalAlpha = a * s.b * tw * 0.8;
        ctx.fillRect(Math.round(s.x * v.w), Math.round(v.cy - T.riverHalf + 10 + s.y * (T.riverHalf * 2 - 16)), 1, 1);
      });
      var mx = Math.round(v.w * 0.74);
      ctx.fillStyle = '#cfe0ff';
      for (var i = 0; i < 26; i++) {
        var yy = v.cy - T.riverHalf + 16 + i * 8, ww = 3 + Math.round(4 * (0.5 + 0.5 * Math.sin(G.time * 1.6 + i * 1.3)));
        ctx.globalAlpha = a * 0.28 * (1 - i / 30);
        ctx.fillRect(mx - ww + Math.round(Math.sin(G.time + i) * 3), yy, ww * 2, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawBanks(ctx, G, v, segs, side, ox, oy) {
    segs.forEach(function (s) {
      var A = XD.BIOMES[s.b.a], B = XD.BIOMES[s.b.b], t = s.b.t;
      var layers = A.bank === B.bank ? [[A.bank, 1]] : [[A.bank, 1 - t], [B.bank, t]];
      layers.forEach(function (L) {
        if (!L[0] || L[1] <= 0.01) return;
        var meta = AT.banks[L[0]], im = IMG['bank_' + L[0] + '_' + side];
        var dy = side === 'top' ? v.cy - T.riverHalf - s.open * v.K - meta.topEdge : v.cy + T.riverHalf + s.open * v.K - meta.botEdge;
        ctx.globalAlpha = L[1];
        strip(ctx, im, G.x + s.sx - ox, s.sx, Math.round(dy) + oy, s.w);
      });
      ctx.globalAlpha = 1;
    });
  }

  // ---------------------------------------------------------------- vật thể
  function sx(G, x) { return x - G.x; }

  function drawUnder(ctx, G, v, oy) {
    G.ents.forEach(function (e) {
      var K = XD.KINDS[e.kind];
      if (!K.under) return;
      var x = sx(G, e.x), y = v.cy + e.y + oy;
      if (x < -80 || x > v.w + 80) return;
      if (e.state === 'dive') ctx.globalAlpha = Math.max(0, 1 - e.t / 1.2);
      spr(ctx, XD.entFrame(e), x, y + Math.round(Math.sin(e.t * 1.5) * (K.bob || 0.6)));
      ctx.globalAlpha = 1;
    });
    G.ents.forEach(function (e) {
      if (e.kind !== 'fish' || e.jt >= 0) return;
      var x = sx(G, e.x), y = v.cy + e.y + oy;
      ctx.globalAlpha = 0.75;
      spr(ctx, 'FishA_0', x, y, e.vx < 0);
      ctx.globalAlpha = 1;
    });
    G.fx.forEach(function (p) {
      if (p.delay > 0) return;
      var x = sx(G, p.x), y = v.cy + p.y + oy, k = p.t / p.life;
      if (p.kind === 'ring') {
        ctx.globalAlpha = 1 - k; spr(ctx, 'SplashAnim_' + (4 + Math.min(1, (k * 2) | 0)), x, y);
      } else if (p.kind === 'ripple') {
        ctx.globalAlpha = 0.7 * (1 - k); spr(ctx, 'Raindrops_' + (1 + Math.min(3, (k * 4) | 0)), x, y);
      } else if (p.kind === 'glint') {
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9; spr(ctx, 'VFX_Sparkles_' + p.f, x, y);
      } else if (p.kind === 'bubble') {
        ctx.globalAlpha = 0.8 * (1 - k); spr(ctx, 'VFX_Bubbles_' + p.f, x, y);
      }
      ctx.globalAlpha = 1;
    });
  }

  // Khung bao quanh mốc neo thuyền (px ảo): thân 180×153, bóng lệch (+6,+8), bọt mũi khi tăng tốc.
  var BB = [-100, -156, 124, 54];
  R.BB = BB;

  // Tư thế thuyền, số thực (px ảo). Khung đổi theo đồng hồ 30 Hz như clip gốc, gốc thuyền trôi
  // theo đường cong drift của clip, cộng nhấp nhô sóng và độ chúi khi lái.
  function boatPose(G, v, ox, oy) {
    var B = XD.BOATS[G.boatKey], fr = XD.animFrames(B.anim), ticks = B.ticks;
    var total = 0, i = 0, acc = 0;
    ticks.forEach(function (t) { total += t; });
    var tick = (G.time * 30) % total;
    while (i < ticks.length - 1 && tick >= acc + ticks[i]) { acc += ticks[i]; i++; }
    var d = B.drift, k = 0;
    while (k < d.length - 2 && tick >= d[k + 1][0]) k++;
    var a = d[k], b = d[k + 1], f = U.smooth(U.clamp((tick - a[0]) / (b[0] - a[0]), 0, 1));
    var swell = XD.mixNum(XD.bandAt(G.x + v.bx), 'swell', 0);
    var bob = Math.sin(G.time * 1.4) * 0.8 + Math.sin(G.time * 0.8) * 3 * swell;
    var jolt = G.bumpT > 0 ? Math.sin(G.time * 70) * 1.5 * G.bumpT / 0.6 : 0;
    return {
      name: fr[i], lean: U.clamp(G.boatVY / T.steer, -1, 1) * 2.5,
      x: v.bx + ox + U.lerp(a[1], b[1], f) + jolt,
      y: v.cy + G.boatY + oy + U.lerp(a[2], b[2], f) + bob,
    };
  }
  R.boatPose = boatPose;

  // Thuyền đi hai bước. (1) Dựng và chiếu sáng ở độ phân giải ẢO trong một canvas nhỏ đúng khung
  // bao BB (mốc neo ở toạ độ nguyên), nên mọi lượt nhân sáng/tông màu chỉ tốn ~47 nghìn pixel.
  // (2) Dán lên canvas hiển thị SAU khi phóng cảnh, vị trí làm tròn tới pixel THẬT chứ không tới
  // pixel ảo: nhấp nhô 1 px ảo và đoạn lái chậm dần trượt mượt thay vì nhảy từng S px. Dán theo
  // cột 12 px để chúi mũi khi lái (lệch dọc theo khoảng cách tới mốc neo) mà không phải xoay ảnh.
  function drawBoatLayer(out, G, v, pose, L) {
    var S = v.S, P = XD.BOAT_PTS, c = boatX, W = boatC.width, H = boatC.height;
    var px0 = -BB[0], py0 = -BB[1];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, W, H);
    var sp = G.speed / T.cruise;
    if (G.boostT > 0 || sp > 1.5) {
      c.globalAlpha = Math.min(1, Math.max(G.boostT, sp - 1.5));
      spr(c, 'SplashAnim_' + (1 + (Math.floor(G.time * 12) % 3)), px0 + P.net[0] + 14, py0 + 8);
      c.globalAlpha = 1;
    }
    c.globalAlpha = 0.32;
    sil(c, pose.name, px0 + 6, py0 + 8, '#061a33');
    c.globalAlpha = 1;
    spr(c, pose.name, px0, py0);
    var wf = XD.animFrames('BoatWhistle');
    var wi = G.hornT >= 0 ? Math.min(wf.length - 1, Math.floor(G.hornT / 0.75 * wf.length)) : 0;
    spr(c, wf[wi], px0 + P.chimney[0], py0 + P.chimney[1]);
    var ax = Math.round(pose.x), ay = Math.round(pose.y);
    litInPlace(c, boatMX, boatM, 0, 0, W, H, ax + BB[0], ay + BB[1], W, H, L);

    var X0 = Math.round((pose.x + BB[0]) * S), Y0 = Math.round((pose.y + BB[1]) * S);
    out.imageSmoothingEnabled = false;
    pasteBoat(out, pose, S, 1);
    out.imageSmoothingEnabled = true;
    out.globalCompositeOperation = 'lighter';
    glow(out, 'warm', (pose.x + P.window[0]) * S, (pose.y + P.window[1]) * S, 26 * S, 0.55 * L.lamp);
    glow(out, 'warm', (pose.x + P.deckLamp[0]) * S, (pose.y + P.deckLamp[1] + 6) * S, 40 * S, 0.18 * L.lamp);
    out.globalCompositeOperation = 'source-over';
    out.imageSmoothingEnabled = false;
    return { X0: X0, Y0: Y0 };
  }
  function pasteBoat(out, pose, S, alpha) {
    var W = boatC.width, H = boatC.height;
    out.globalAlpha = alpha;
    if (Math.abs(pose.lean) < 0.15) {
      out.drawImage(boatC, Math.round((pose.x + BB[0]) * S), Math.round((pose.y + BB[1]) * S), W * S, H * S);
      out.globalAlpha = 1;
      return;
    }
    for (var sx0 = 0; sx0 < W; sx0 += 12) {
      var sw = Math.min(12, W - sx0), rel = sx0 + sw / 2 + BB[0];
      out.drawImage(boatC, sx0, 0, sw, H,
        Math.round((pose.x + BB[0] + sx0) * S), Math.round((pose.y + BB[1] + pose.lean * rel / 90) * S), sw * S, H * S);
    }
    out.globalAlpha = 1;
  }

  // Nhân mảnh bộ đệm sáng (lx,ly,lw,lh px ảo) lên vùng (x,y,w,h) của c, phủ tông màu, rồi cắt lại
  // theo hình đã vẽ (mask = bản sao trước khi nhân) để phần trong suốt vẫn trong suốt.
  function litInPlace(c, mx, mcv, x, y, w, h, lx, ly, lw, lh, L) {
    mx.setTransform(1, 0, 0, 1, 0, 0);
    mx.globalCompositeOperation = 'copy';
    mx.drawImage(c.canvas, x, y, w, h, 0, 0, w, h);
    c.imageSmoothingEnabled = true;
    c.globalCompositeOperation = 'multiply';
    c.drawImage(light, lx, ly, lw, lh, x, y, w, h);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(mcv, 0, 0, w, h, x, y, w, h);
    if (L.tone) {
      c.globalCompositeOperation = 'screen';
      c.fillStyle = L.tone;
      c.fillRect(x, y, w, h);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(mcv, 0, 0, w, h, x, y, w, h);
    }
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
  }

  // Bọt sau thuyền (XD.FOAM, chép từ hai ParticleSystem gốc): nằm dưới thân thuyền.
  function drawFoam(ctx, G, v, oy) {
    var F = XD.FOAM;
    G.foam.forEach(function (p) {
      var k = p.t / p.life, i = Math.min(3, (k * 4) | 0), f = AT.frames[F.frames[i]];
      var nx = Math.sin(p.t * 9 + p.ph) * F.noise, ny = Math.cos(p.t * 7 + p.ph * 1.7) * F.noise;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(FOAMF[i], Math.round(p.sx + nx - (f.w - f.px)), Math.round(v.cy + p.y + oy + ny - (f.h - f.py)));
    });
    ctx.globalAlpha = 1;
  }

  function drawThing(ctx, G, v, e, oy) {
    var K = XD.KINDS[e.kind], x = sx(G, e.x), y = v.cy + e.y + oy;
    if (x < -120 || x > v.w + 120) return;
    if (e.kind === 'fish') {
      var F = XD.FISH[e.sp], fr = XD.animFrames(F.jump);
      var i = Math.min(fr.length - 1, Math.floor(e.jt / 1.0 * fr.length));
      spr(ctx, fr[i], x, y - Math.round(Math.sin(Math.min(1, e.jt) * Math.PI) * 10));
      return;
    }
    if (e.kind === 'bird') {
      if (e.state === 'fly') return;
      var B = XD.BIRDS[e.sp], seq = (Math.floor(e.t / 3) % 3 === 2) ? B.sing : B.idle;
      spr(ctx, seq[Math.floor(e.t * 6) % seq.length], x, y, e.dx < 0);
      return;
    }
    if (e.kind === 'frog') {
      var fr2 = XD.animFrames('Frog');
      if (e.state === 'leap') spr(ctx, fr2[6 + Math.min(2, Math.floor(e.t / 0.15))], x, y - Math.round(Math.sin(e.t / 0.45 * Math.PI) * 16));
      else spr(ctx, fr2[Math.floor(e.t * 5) % 6], x, y);
      return;
    }
    var name = XD.entFrame(e), bob = Math.round(Math.sin(e.t * 2.1) * (K.bob || 0));
    ctx.globalAlpha = 0.28;
    sil(ctx, name, x + 3, y + 5, '#061a33');
    ctx.globalAlpha = 1;
    spr(ctx, name, x, y + bob);
  }

  function drawAir(ctx, G, v, day, oy, overBoat) {
    var sun = (1 - day.stars) * (1 - G.wp.dim * 1.2);
    // Bóng mây lướt trên mặt nước và bờ.
    var cl = ['Cloud_vfx_sheet_0', 'Cloud_vfx_sheet_2', 'Cloud_vfx_sheet_5', 'Cloud_vfx_sheet_8'];
    var ca = overBoat ? 0 : 0.13 * G.wp.clouds * Math.max(0.2, sun);
    if (ca > 0.01) {
      var span = 820, base = Math.floor((G.x + G.time * 9) / span);
      for (var i = -1; i < v.w / span + 2; i++) {
        var n = base + i, h = Math.abs(Math.sin(n * 91.7)) ;
        var cx = n * span - (G.x + G.time * 9) + h * 300, cy = v.cy - 170 + h * 260 + oy;
        ctx.globalAlpha = ca;
        sil(ctx, cl[n & 3], cx, cy, '#000a18');
      }
      ctx.globalAlpha = 1;
    }
    // Tia nắng trôi chậm, cộng sáng.
    var gr = overBoat ? 0 : day.godray * (1 - G.wp.dim * 2.2) * (1 - XD.mixNum(XD.bandAt(G.x + v.bx), 'dark', 0) * 2);
    if (gr > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      var gs = 560, gb = Math.floor(G.x * 0.6 / gs);
      for (var j = -1; j < v.w / gs + 2; j++) {
        var m = gb + j, hh = Math.abs(Math.sin(m * 12.9898));
        var gx = m * gs - G.x * 0.6 + hh * 200 + Math.sin(G.time * 0.07 + m) * 40;
        ctx.globalAlpha = gr * (0.14 + 0.12 * hh) * (0.75 + 0.25 * Math.sin(G.time * 0.3 + m * 2));
        spr(ctx, m & 1 ? 'GodrayA' : 'GodrayB', gx, v.cy - 40 + oy);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Chim bay (bầy ngang trời và chim đậu bị còi làm giật mình).
    function bird(band, x, y, alt, t) {
      var f = Math.floor(t * 10) % 4;
      ctx.globalAlpha = 0.3;
      spr(ctx, 'BirdFly' + (band + 1) + '_' + f, x + alt * 0.35, y);
      ctx.globalAlpha = 1;
      spr(ctx, 'BirdFly' + band + '_' + f, x, y - alt);
    }
    G.fx.forEach(function (p) {
      if (p.kind === 'flock') bird(p.band, sx(G, p.x), v.cy + p.y + oy + Math.sin(p.t * 2 + p.ph) * 3, p.alt, p.t + p.ph);
    });
    G.ents.forEach(function (e) {
      if (e.kind === 'bird' && e.state === 'fly') bird(XD.BIRDS[e.sp].fly, sx(G, e.x), v.cy + e.y + oy, 10 + e.alt, e.t);
    });
    G.fx.forEach(function (p) {
      if (p.delay > 0) return;
      var x = sx(G, p.x), y = v.cy + p.y + oy, k = p.t / p.life;
      if (p.kind === 'butterfly') {
        var fl = Math.floor(p.t * 12) % 2;
        spr(ctx, 'Butterfly' + p.row + '_' + fl, x + Math.sin(p.t * 1.7 + p.ph) * 14, y + Math.sin(p.t * 2.9 + p.ph) * 8 - 6);
      } else if (p.kind === 'splash') {
        ctx.globalAlpha = 1 - k * 0.5;
        spr(ctx, 'SplashAnim_' + (1 + Math.min(4, (k * 5) | 0)), x, y);
      } else if (p.kind === 'drop') {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = '#bff4ff';
        ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
      } else if (p.kind === 'sparkle') {
        ctx.globalAlpha = 1 - k; spr(ctx, 'VFX_Sparkles_' + p.f, x, y);
      } else if (p.kind === 'puff') {
        ctx.globalAlpha = 1 - k; spr(ctx, 'VFX_Puff_' + (k < 0.5 ? 0 : 1), x, y - k * 10);
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = 0.8 * (1 - k); sil(ctx, 'VFX_Puff_' + (k < 0.4 ? 0 : 1), x, y, '#eef3f6');
      } else if (p.kind === 'slip') {
        var F = XD.FISH[p.sp], fr = XD.animFrames(F.jump);
        spr(ctx, fr[1 + Math.min(2, (k * 3) | 0)], x, y);
      }
      ctx.globalAlpha = 1;
    });
    // Mưa: vệt chéo theo gió.
    if (G.wp.rain > 0.02) {
      var nr = Math.round(90 * Math.min(1.6, G.wp.rain));
      ctx.globalAlpha = 0.45;
      for (var r = 0; r < nr; r++) {
        var s = r * 7919.13, rx = U.mod(s * 0.37 - G.time * (70 + G.wp.wind * 60) - G.x * 0.2, v.w + 40) - 20;
        var ry = U.mod(s * 0.61 + G.time * 330, v.h + 40) - 20;
        spr(ctx, r & 1 ? 'Raindrops_6' : 'Raindrops_0', rx, ry);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- ánh sáng
  // Bộ đệm sáng (px ảo): màu giờ trong ngày × thời tiết, cộng đèn cabin + đom đóm, nhân viền tối.
  function buildLight(G, v, day, pose) {
    var dark = XD.mixNum(XD.bandAt(G.x + v.bx), 'dark', 0), dim = G.wp.dim;
    var g = day.grade.map(function (c) { return c; });
    var avg = (g[0] + g[1] + g[2]) / 3;
    g = g.map(function (c) { return U.lerp(c, avg * 0.92, dim) * (1 - dim * 0.3) * (1 - dark); });
    g = g.map(function (c) { return Math.min(1, c + G.flash * 0.9); });
    var lamp = Math.max(day.lamp, dark * 1.4, dim > 0.3 ? (dim - 0.3) * 2 : 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = 'rgb(' + g.map(function (c) { return Math.round(c * 255); }).join(',') + ')';
    lctx.fillRect(0, 0, v.w, v.h);
    lctx.globalCompositeOperation = 'lighter';
    var P = XD.BOAT_PTS;
    glow(lctx, 'warm', pose.x + P.window[0], pose.y + P.window[1], 95, 0.75 * lamp);
    glow(lctx, 'soft', pose.x + P.deckLamp[0], pose.y + P.deckLamp[1], 120, 0.45 * lamp);
    G.fx.forEach(function (p) {
      if (p.kind !== 'firefly') return;
      glow(lctx, 'green', sx(G, p.x), v.cy + p.y, 16, ffA(p, G) * 0.6);
    });
    lctx.globalCompositeOperation = 'source-over';
    lctx.drawImage(vign, 0, 0);
    var tn = day.tone, ta = tn[3] * (1 - dim * 0.6);
    return {
      lamp: lamp,
      tone: ta > 0.004 ? 'rgba(' + Math.round(tn[0]) + ',' + Math.round(tn[1]) + ',' + Math.round(tn[2]) + ',' + ta.toFixed(3) + ')' : null,
    };
  }

  function drawLight(ctx, G, v, L) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(light, 0, 0);
    if (L.tone) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = L.tone;
      ctx.fillRect(0, 0, v.w, v.h);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    G.fx.forEach(function (p) {
      if (p.kind !== 'firefly') return;
      var a = ffA(p, G);
      ctx.globalAlpha = a;
      spr(ctx, 'VFX_Firefly', sx(G, p.x) + Math.sin(p.t * 1.3 + p.ph) * 6, v.cy + p.y + Math.sin(p.t * 1.9 + p.ph) * 4);
      glow(ctx, 'green', sx(G, p.x), v.cy + p.y, 7, a * 0.5);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
  }
  function ffA(p, G) {
    var k = p.t / p.life;
    return Math.min(1, k * 4, (1 - k) * 4) * (0.55 + 0.45 * Math.sin(p.t * 3 + p.ph)) * XD.dayAt(G.t).fireflies;
  }

  // ---------------------------------------------------------------- chữ nổi
  function drawPopups(ctx, G, v, boat) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 10px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
    ctx.lineJoin = 'round';
    // Xếp chồng lúc vẽ, mới nhất ở dưới cùng: bắt hai con liền nhau thì chữ không đè lên nhau.
    var n = G.popups.length;
    G.popups.forEach(function (p, idx) {
      var k = p.t / p.life, a = Math.min(1, p.t * 6, (1 - k) * 4);
      var x = U.clamp(boat.x + 10, 70, v.w - 70), y = Math.max(46 + (n - 1) * 13, boat.y - 138) - (n - 1 - idx) * 13 - Math.min(1, p.t * 5) * 4;
      ctx.globalAlpha = a;
      var w = ctx.measureText(p.text).width;
      if (p.icon) spr(ctx, p.icon, x - w / 2 - 12, y + 2);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,24,40,0.9)';
      ctx.strokeText(p.text, x + (p.icon ? 6 : 0), y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x + (p.icon ? 6 : 0), y);
    });
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- khung hình
  // Cảnh (trừ thuyền) vẽ ở độ phân giải ảo vào buf rồi phóng một lần với hệ số nguyên: mọi lượt
  // phủ toàn màn tốn theo số pixel ảo. Thuyền vẽ riêng ở pixel thật (drawBoatLayer). Những thứ
  // đứng TRƯỚC thuyền (vật thể thấp hơn, bờ dưới, mây, chim, mưa) được vẽ lại một lần nữa, chỉ
  // trong khung bao thuyền, rồi đè lên thuyền: thứ tự trước/sau giữ đúng như khi còn một lớp.
  function drawFront(ctx, G, v, day, segs, list, i, oy, overBoat) {
    for (; i < list.length; i++) drawThing(ctx, G, v, list[i], oy);
    drawBanks(ctx, G, v, segs, 'bot', 0, oy);
    drawAir(ctx, G, v, day, oy, overBoat);
  }

  // Có thứ gì của lớp trước chạm khung bao thuyền không? Không thì khỏi vẽ lại lớp trước.
  function frontTouches(G, v, list, i, box) {
    function hit(x, y, w, h) { return x + w > box[0] && x - w < box[2] && y + h > box[1] && y - h < box[3]; }
    if (G.wp.rain > 0.02) return true;
    if (v.cy + XD.edges(G.x + v.bx).bot - 48 < G.boatY + v.cy + 40) return true;
    for (; i < list.length; i++) if (hit(list[i].x - G.x, v.cy + list[i].y, 60, 60)) return true;
    for (var k = 0; k < G.ents.length; k++) {
      var e = G.ents[k];
      if (e.kind === 'bird' && e.state === 'fly' && hit(e.x - G.x, v.cy + e.y - 10 - e.alt, 30, 30)) return true;
    }
    for (var j = 0; j < G.fx.length; j++) {
      var p = G.fx[j];
      if (p.kind === 'firefly' || p.kind === 'ripple' || p.kind === 'bubble' || p.kind === 'ring' || p.kind === 'glint') continue;
      if (hit(p.x - G.x, v.cy + p.y - (p.alt || 0), 40, 40)) return true;
    }
    return false;
  }

  R.draw = function (out, G) {
    var v = G.view, day = XD.dayAt(G.t), ctx = bctx, S = v.S;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var ox = 0, oy = 0;
    if (G.shake > 0) { ox = Math.round((Math.random() - 0.5) * 6 * G.shake / 0.4); oy = Math.round((Math.random() - 0.5) * 4 * G.shake / 0.4); }
    var pose = boatPose(G, v, ox, oy);
    R.pose = pose;
    ctx.translate(ox, 0);
    var segs = segments(G, v);
    drawWater(ctx, G, v, segs, day, 0, oy);
    drawUnder(ctx, G, v, oy);
    drawBanks(ctx, G, v, segs, 'top', 0, oy);
    var list = G.ents.filter(function (e) { var K = XD.KINDS[e.kind]; return !K.under && !(e.kind === 'fish' && e.jt < 0) && !(e.kind === 'bird' && e.state === 'fly'); });
    list.sort(function (a, b) { return a.y - b.y; });
    var i = 0;
    for (; i < list.length && list[i].y < G.boatY; i++) drawThing(ctx, G, v, list[i], oy);
    drawFoam(ctx, G, v, oy);
    var firstFront = i;
    drawFront(ctx, G, v, day, segs, list, firstFront, oy, false);
    ctx.translate(-ox, 0);
    var L = buildLight(G, v, day, pose);
    drawLight(ctx, G, v, L);
    if (G.flash > 0) { ctx.fillStyle = 'rgba(230,240,255,' + (G.flash * 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.imageSmoothingEnabled = false;
    out.drawImage(buf, 0, 0, v.w * S, v.h * S);

    var b = drawBoatLayer(out, G, v, pose, L);
    R.boatPx = b;
    var fx0 = Math.max(0, Math.floor(pose.x + BB[0]) - 1), fy0 = Math.max(0, Math.floor(pose.y + BB[1]) - 1);
    var fw = Math.min(v.w - fx0, BB[2] - BB[0] + 3), fh = Math.min(v.h - fy0, BB[3] - BB[1] + 3);
    if (fw > 0 && fh > 0 && frontTouches(G, v, list, firstFront, [fx0, fy0, fx0 + fw, fy0 + fh])) {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.imageSmoothingEnabled = false;
      fctx.clearRect(fx0, fy0, fw, fh);
      fctx.save();
      fctx.beginPath(); fctx.rect(fx0, fy0, fw, fh); fctx.clip();
      fctx.translate(ox, 0);
      drawFront(fctx, G, v, day, segs, list, firstFront, oy, true);
      fctx.restore();
      litInPlace(fctx, fmctx, fmask, fx0, fy0, fw, fh, fx0, fy0, fw, fh, L);
      out.drawImage(front, fx0, fy0, fw, fh, fx0 * S, fy0 * S, fw * S, fh * S);
    }
    // Lái sát bờ dưới thì cây gần che thuyền: hiện lại thuyền mờ lên trên để vẫn thấy lưới.
    var near = G.boatY - (XD.edges(G.x + v.bx).bot - 100);
    if (near > 0) pasteBoat(out, pose, S, Math.min(0.4, near / 100));
    if (G.mode === 'play') {
      out.setTransform(S, 0, 0, S, 0, 0);
      drawPopups(out, G, v, pose);
    }
  };
})(window.XD = window.XD || {});
