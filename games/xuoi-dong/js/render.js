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
  var IMG = R.IMG = {}, light, lctx, buf, bctx, vign, pat, TINT = {}, SIL = {};
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
      im.src = it[1] + '?v=20260924a';
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

  R.resize = function (v) {
    buf = document.createElement('canvas');
    buf.width = v.w; buf.height = v.h;
    bctx = buf.getContext('2d');
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
      if (p.kind === 'foam') {
        ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = '#c8fbff';
        ctx.fillRect(Math.round(x), Math.round(y), p.s, 1);
      } else if (p.kind === 'blob') {
        ctx.globalAlpha = 0.32 * (1 - k); spr(ctx, 'WaterSplash_' + (1 + p.f), x, y);
      } else if (p.kind === 'ring') {
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

  function boatFrames(G) { return XD.animFrames(XD.BOATS[G.boatKey].anim); }

  function drawBoat(ctx, G, v, oy, swell) {
    var P = XD.BOAT_PTS, fr = boatFrames(G);
    var name = fr[Math.floor(G.time * 6) % fr.length];
    var x = v.bx + (G.bumpT > 0 ? Math.round((Math.random() - 0.5) * 3) : 0);
    var y = v.cy + G.boatY + oy + Math.round(Math.sin(G.time * 1.4) + Math.sin(G.time * 0.8) * 3 * swell);
    ctx.globalAlpha = 0.32;
    sil(ctx, name, x + 6, y + 8, '#061a33');
    ctx.globalAlpha = 1;
    var sp = G.speed / T.cruise;
    if (sp > 1.15) {
      ctx.globalAlpha = Math.min(1, (sp - 1.15) * 1.5);
      spr(ctx, 'SplashAnim_' + (1 + (Math.floor(G.time * 12) % 3)), x + P.net[0] + 12, y + 8);
      ctx.globalAlpha = 1;
    }
    spr(ctx, name, x, y);
    var wf = XD.animFrames('BoatWhistle');
    var wi = G.hornT >= 0 ? Math.min(wf.length - 1, Math.floor(G.hornT / 0.75 * wf.length)) : 0;
    spr(ctx, wf[wi], x + P.chimney[0], y + P.chimney[1]);
    return { x: x, y: y, name: name };
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

  function drawAir(ctx, G, v, day, oy) {
    var sun = (1 - day.stars) * (1 - G.wp.dim * 1.2);
    // Bóng mây lướt trên mặt nước và bờ.
    var cl = ['Cloud_vfx_sheet_0', 'Cloud_vfx_sheet_2', 'Cloud_vfx_sheet_5', 'Cloud_vfx_sheet_8'];
    var ca = 0.13 * G.wp.clouds * Math.max(0.2, sun);
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
    var gr = day.godray * (1 - G.wp.dim * 2.2) * (1 - XD.mixNum(XD.bandAt(G.x + v.bx), 'dark', 0) * 2);
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
  function drawLight(ctx, G, v, day, boat) {
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
    glow(lctx, 'warm', boat.x + P.window[0], boat.y + P.window[1], 95, 0.75 * lamp);
    glow(lctx, 'soft', boat.x + P.deckLamp[0], boat.y + P.deckLamp[1], 120, 0.45 * lamp);
    G.fx.forEach(function (p) {
      if (p.kind !== 'firefly') return;
      glow(lctx, 'green', sx(G, p.x), v.cy + p.y, 16, ffA(p, G) * 0.6);
    });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(light, 0, 0);
    var tn = day.tone, ta = tn[3] * (1 - dim * 0.6);
    if (ta > 0.004) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(' + Math.round(tn[0]) + ',' + Math.round(tn[1]) + ',' + Math.round(tn[2]) + ',' + ta.toFixed(3) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 'warm', boat.x + P.window[0], boat.y + P.window[1], 26, 0.55 * lamp);
    glow(ctx, 'warm', boat.x + P.deckLamp[0], boat.y + P.deckLamp[1] + 6, 40, 0.18 * lamp);
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
    G.popups.forEach(function (p) {
      var k = p.t / p.life, a = Math.min(1, p.t * 6, (1 - k) * 4);
      var x = U.clamp(boat.x + 10, 70, v.w - 70), y = Math.max(46, boat.y - 138) - p.dy - p.t * 12;
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
  // Cả cảnh vẽ ở độ phân giải ảo vào buf rồi phóng một lần với hệ số nguyên: mọi lượt
  // phủ toàn màn (ánh sáng, tông màu, viền tối) tốn theo số pixel ảo chứ không theo pixel thật.
  R.draw = function (out, G) {
    var v = G.view, day = XD.dayAt(G.t), ctx = bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var ox = 0, oy = 0;
    if (G.shake > 0) { ox = Math.round((Math.random() - 0.5) * 6 * G.shake / 0.4); oy = Math.round((Math.random() - 0.5) * 4 * G.shake / 0.4); }
    ctx.translate(ox, 0);
    var segs = segments(G, v), swell = XD.mixNum(XD.bandAt(G.x + v.bx), 'swell', 0);
    drawWater(ctx, G, v, segs, day, 0, oy);
    drawUnder(ctx, G, v, oy);
    drawBanks(ctx, G, v, segs, 'top', 0, oy);
    var list = G.ents.filter(function (e) { var K = XD.KINDS[e.kind]; return !K.under && !(e.kind === 'fish' && e.jt < 0) && !(e.kind === 'bird' && e.state === 'fly'); });
    list.sort(function (a, b) { return a.y - b.y; });
    var boat = null, i = 0;
    for (; i < list.length && list[i].y < G.boatY; i++) drawThing(ctx, G, v, list[i], oy);
    boat = drawBoat(ctx, G, v, oy, swell);
    for (; i < list.length; i++) drawThing(ctx, G, v, list[i], oy);
    drawBanks(ctx, G, v, segs, 'bot', 0, oy);
    // Cây bờ gần che mất thuyền khi lái sát bờ dưới: vẽ lại thuyền mờ lên trên để vẫn thấy lưới.
    var near = G.boatY - (XD.edges(G.x + v.bx).bot - 100);
    if (near > 0) { ctx.globalAlpha = Math.min(0.4, near / 100); spr(ctx, boat.name, boat.x, boat.y); ctx.globalAlpha = 1; }
    drawAir(ctx, G, v, day, oy);
    ctx.translate(-ox, 0);
    drawLight(ctx, G, v, day, boat);
    ctx.drawImage(vign, 0, 0);
    if (G.flash > 0) { ctx.fillStyle = 'rgba(230,240,255,' + (G.flash * 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, v.w, v.h); }
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.imageSmoothingEnabled = false;
    out.drawImage(buf, 0, 0, v.w * v.S, v.h * v.S);
    if (G.mode === 'play') {
      out.setTransform(v.S, 0, 0, v.S, 0, 0);
      drawPopups(out, G, v, boat);
    }
  };
})(window.XD = window.XD || {});
