/*
 * art.js - everything the player looks at, drawn as SHAPES.
 *
 * This replaces the pixel-grid sprites the game shipped with. The owner's words
 * were "sạch sẽ như rừng đen - không pixel nữa", "nhân vật kiểu tròn tròn",
 * "nhà thì bạn gen nguyên cái nhà rõ ràng không pixel", and they pointed at a
 * hyper-casual low-poly farming pack for the register. Both of the games they
 * keep comparing this one to draw the same way: Ca Trực Đêm's player is three
 * `arc` calls and REPO's whole world is gradients - between them there are more
 * curves than rectangles. Not one of them owns a sprite sheet.
 *
 * So the rules here, and they are the whole style:
 *   1. NO pixel grids. Nothing is drawn on a 16x16 lattice any more.
 *   2. Round first. Heads are circles, bodies are capsules, canopies are lobes.
 *   3. Volume comes from a gradient with one lit side, never from dithering.
 *   4. Every shape carries a thin darker outline. That is what separates
 *      "clean vector" from "soft mush" - the reference games both do it.
 *   5. A building is drawn as ONE BUILDING, at building scale, not as a grid of
 *      tile-sized shingles. That was the single most pixel-ish thing left.
 *
 * Everything still generated in code. No image files, same as always.
 */
(function (global) {
  'use strict';

  var OUTLINE = 'rgba(28,24,32,0.55)';

  function shade(hex, mul) {
    if (!hex || hex[0] !== '#') return hex;
    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    function f(v) { return Math.max(0, Math.min(255, Math.round(v * mul))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  /* A rounded rectangle that works on every browser this game targets -
   * ctx.roundRect is recent enough that a hand-rolled path is the safe call. */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* Fill a path with a top-left-lit gradient and outline it. The three lines
   * every solid object in this game is made of. */
  function solid(ctx, colour, x, y, w, h, lw) {
    var g = ctx.createLinearGradient(x, y, x + w * 0.65, y + h);
    g.addColorStop(0, shade(colour, 1.28));
    g.addColorStop(0.45, colour);
    g.addColorStop(1, shade(colour, 0.66));
    ctx.fillStyle = g;
    ctx.fill();
    if (lw > 0) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  function ballGradient(ctx, cx, cy, r, colour) {
    var g = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.1,
                                     cx, cy, r * 1.05);
    g.addColorStop(0, shade(colour, 1.42));
    g.addColorStop(0.5, colour);
    g.addColorStop(1, shade(colour, 0.62));
    return g;
  }

  // ---------------------------------------------------------------- people
  /* A villager or the farmer.
   *
   * Round head, capsule body, stubby arms and legs, no outline pixels. `face`
   * is 'down' | 'up' | 'left' | 'right'; `frame` alternates 0/1 for the walk.
   * `pal` is the four colours read out of that character's own sprite in the
   * game files (hair / skin / shirt / pants), so everyone stays recognisable
   * even though nothing is drawn from a sheet any more.
   */
  function person(ctx, cx, cy, ts, pal, face, frame, opts) {
    opts = opts || {};
    pal = pal || {};
    var hair = pal.hair || '#7a4a2b';
    var skin = pal.skin || '#e8b08a';
    var shirt = pal.shirt || '#3f6fb5';
    var pants = pal.pants || '#3a3f52';
    var shoes = pal.shoes || '#2b2129';

    var H = ts * 1.55;                       // total height
    var headR = ts * 0.32;
    var bodyW = ts * 0.52, bodyH = ts * 0.52;
    var bob = frame ? ts * 0.045 : 0;        // the walk lift
    var lw = Math.max(1, ts * 0.035);

    var footY = cy;
    var bodyY = footY - ts * 0.30 - bodyH - bob;
    var headY = bodyY - headR * 0.78 - bob * 0.3;

    ctx.save();
    ctx.lineJoin = 'round';

    // legs — two little capsules, swinging with the frame
    var legSwing = frame ? ts * 0.10 : 0;
    for (var l = 0; l < 2; l++) {
      var lx = cx + (l ? 1 : -1) * ts * 0.14 + (l ? legSwing : -legSwing) * 0.5;
      roundRect(ctx, lx - ts * 0.085, bodyY + bodyH - ts * 0.04,
                ts * 0.17, ts * 0.36, ts * 0.085);
      solid(ctx, pants, lx - ts * 0.085, bodyY + bodyH, ts * 0.17, ts * 0.36, lw);
      // shoe
      roundRect(ctx, lx - ts * 0.10, footY - ts * 0.10, ts * 0.20, ts * 0.11,
                ts * 0.05);
      solid(ctx, shoes, lx - ts * 0.10, footY - ts * 0.10, ts * 0.20,
            ts * 0.11, lw);
    }

    // body — a capsule, slightly wider at the shoulders
    roundRect(ctx, cx - bodyW / 2, bodyY, bodyW, bodyH, ts * 0.20);
    solid(ctx, shirt, cx - bodyW / 2, bodyY, bodyW, bodyH, lw);

    // arms
    var armSwing = frame ? ts * 0.07 : 0;
    for (var a = 0; a < 2; a++) {
      var side = a ? 1 : -1;
      if (face === 'left' && side > 0) continue;    // the far arm hides
      if (face === 'right' && side < 0) continue;
      var ax = cx + side * (bodyW / 2 + ts * 0.02);
      var ay = bodyY + ts * 0.10 + (a ? armSwing : -armSwing);
      roundRect(ctx, ax - ts * 0.075, ay, ts * 0.15, ts * 0.30, ts * 0.075);
      solid(ctx, shade(shirt, 0.88), ax - ts * 0.075, ay, ts * 0.15,
            ts * 0.30, lw);
      // hand
      ctx.beginPath();
      ctx.arc(ax, ay + ts * 0.30, ts * 0.075, 0, 6.3);
      ctx.fillStyle = ballGradient(ctx, ax, ay + ts * 0.30, ts * 0.075, skin);
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke();
    }

    // head — the roundest thing on screen, on purpose
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, 6.3);
    ctx.fillStyle = ballGradient(ctx, cx, headY, headR, skin);
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke();

    // hair — a cap over the skull; how much of the face it leaves depends on
    // which way they are looking
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, headY, headR * 1.02, 0, 6.3);
    ctx.clip();
    ctx.beginPath();
    if (face === 'up') {
      ctx.arc(cx, headY, headR * 1.02, 0, 6.3);          // all hair
    } else if (face === 'left' || face === 'right') {
      var dir = face === 'left' ? -1 : 1;
      ctx.arc(cx - dir * headR * 0.22, headY - headR * 0.10,
              headR * 1.02, 0, 6.3);
    } else {
      ctx.ellipse(cx, headY - headR * 0.42, headR * 1.05, headR * 0.85,
                  0, 0, 6.3);
    }
    ctx.fillStyle = ballGradient(ctx, cx, headY - headR * 0.4, headR, hair);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, 6.3);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke();

    // eyes, only when there is a face to see
    if (face !== 'up') {
      ctx.fillStyle = '#20161c';
      var eyeY = headY + headR * 0.14;
      var er = Math.max(1, headR * 0.115);
      if (face === 'left' || face === 'right') {
        var ex = cx + (face === 'right' ? headR * 0.36 : -headR * 0.36);
        ctx.beginPath(); ctx.arc(ex, eyeY, er, 0, 6.3); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx - headR * 0.28, eyeY, er, 0, 6.3); ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + headR * 0.28, eyeY, er, 0, 6.3); ctx.fill();
      }
    }
    ctx.restore();
    return { headY: headY - headR, height: H };
  }

  // ------------------------------------------------------------- buildings
  /* A whole building, drawn at building scale.
   *
   * This is the change the owner asked for most directly - "gen nguyên cái nhà
   * rõ ràng". The previous version painted a building one 16-pixel tile at a
   * time, with a shingle pattern per tile and a plank pattern per tile, which
   * is exactly what made it read as pixel art no matter what colours it used.
   * Here the roof is one shape, the wall is one shape, and the windows and the
   * door are placed by proportion rather than by tile.
   */
  function building(ctx, b, sx, sy, ts, night, sunk) {
    var w = b.w * ts, h = b.h * ts;
    var wallH = Math.min(h * 0.52, ts * 2.6);
    var roofH = h - wallH;
    var wall = b.wall || '#6b4a30';
    var roof = b.roof || '#8a4a3a';
    var lw = Math.max(1.2, ts * 0.055);
    var eave = ts * 0.30;                      // the roof overhangs the wall

    ctx.save();
    ctx.lineJoin = 'round';

    // ---- wall
    roundRect(ctx, sx, sy + roofH, w, wallH, ts * 0.10);
    solid(ctx, wall, sx, sy + roofH, w, wallH, lw);

    // a horizontal band near the foot, so a big blank wall has a waistline
    ctx.save();
    roundRect(ctx, sx, sy + roofH, w, wallH, ts * 0.10);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(sx, sy + h - ts * 0.34, w, ts * 0.34);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx, sy + roofH, w, ts * 0.12);
    ctx.restore();

    // ---- roof: one shape, hipped, overhanging both sides
    var rTop = sy + ts * 0.10;
    var ridgeInset = Math.min(w * 0.28, ts * 2.2);
    ctx.beginPath();
    ctx.moveTo(sx - eave, sy + roofH + ts * 0.06);
    ctx.lineTo(sx + ridgeInset, rTop);
    ctx.lineTo(sx + w - ridgeInset, rTop);
    ctx.lineTo(sx + w + eave, sy + roofH + ts * 0.06);
    ctx.closePath();
    var rg = ctx.createLinearGradient(sx, rTop, sx + w * 0.4, sy + roofH);
    rg.addColorStop(0, shade(roof, 1.30));
    rg.addColorStop(0.5, roof);
    rg.addColorStop(1, shade(roof, 0.70));
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw; ctx.stroke();

    // ridge highlight
    ctx.beginPath();
    ctx.moveTo(sx + ridgeInset, rTop);
    ctx.lineTo(sx + w - ridgeInset, rTop);
    ctx.strokeStyle = shade(roof, 1.5);
    ctx.lineWidth = Math.max(1.5, ts * 0.09);
    ctx.stroke();

    // ---- chimney, on anything tall enough to deserve one
    if (b.h >= 4 && b.w >= 4) {
      var chx = sx + w * 0.74, chw = ts * 0.5, chh = ts * 0.85;
      roundRect(ctx, chx, rTop - chh * 0.55, chw, chh, ts * 0.07);
      solid(ctx, shade(wall, 0.85), chx, rTop - chh * 0.55, chw, chh, lw);
      if (night) {
        ctx.fillStyle = 'rgba(210,205,200,0.14)';
        for (var s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.arc(chx + chw / 2 + Math.sin(Date.now() / 900 + s) * ts * 0.16,
                  rTop - chh * 0.55 - ts * (0.25 + s * 0.32),
                  ts * (0.13 + s * 0.06), 0, 6.3);
          ctx.fill();
        }
      }
    }

    // ---- windows, spaced by proportion
    var winCount = Math.max(1, Math.min(4, Math.round(b.w / 3.2)));
    var winW = ts * 0.78, winH = ts * 0.66;
    var winY = sy + roofH + wallH * 0.34 - winH / 2;
    var doorX = b.door ? (b.door.x - b.x + 0.5) * ts : w * 0.5;
    for (var i = 0; i < winCount; i++) {
      var frac = (i + 0.5) / winCount;
      var wx = sx + w * frac - winW / 2;
      // never put a window where the door is
      if (Math.abs((wx + winW / 2) - (sx + doorX)) < ts * 1.0) continue;
      roundRect(ctx, wx, winY, winW, winH, ts * 0.09);
      var lit = night ? '#ffd98a' : '#a8c6d8';
      var wg = ctx.createLinearGradient(wx, winY, wx + winW, winY + winH);
      wg.addColorStop(0, shade(lit, 1.15));
      wg.addColorStop(1, shade(lit, 0.78));
      ctx.fillStyle = wg;
      ctx.fill();
      ctx.strokeStyle = shade(wall, 0.55);
      ctx.lineWidth = Math.max(1.5, ts * 0.07);
      ctx.stroke();
      // one mullion, not a grid of pixels
      ctx.beginPath();
      ctx.moveTo(wx + winW / 2, winY);
      ctx.lineTo(wx + winW / 2, winY + winH);
      ctx.lineWidth = Math.max(1, ts * 0.045);
      ctx.stroke();
    }
    ctx.restore();
    return { wallTop: sy + roofH, wallH: wallH };
  }

  /* The door, and the sign over it. Drawn after the building so nothing
   * paints across them. */
  function door(ctx, b, sx, sy, ts, open, night) {
    var dw = ts * 0.86, dh = ts * 1.30;
    var x = sx + (ts - dw) / 2, y = sy + ts - dh;
    var lw = Math.max(1.2, ts * 0.055);
    ctx.save();
    ctx.lineJoin = 'round';
    // frame
    roundRect(ctx, x - ts * 0.07, y - ts * 0.07, dw + ts * 0.14,
              dh + ts * 0.07, ts * 0.10);
    solid(ctx, shade(b.wall || '#6b4a30', 0.6), x - ts * 0.07, y - ts * 0.07,
          dw + ts * 0.14, dh + ts * 0.07, lw);
    // leaf
    roundRect(ctx, x, y, dw, dh, ts * 0.08);
    solid(ctx, open ? '#7a5330' : '#4a3320', x, y, dw, dh, lw);
    // handle
    ctx.beginPath();
    ctx.arc(x + dw * 0.78, y + dh * 0.55, ts * 0.055, 0, 6.3);
    ctx.fillStyle = '#e0c069';
    ctx.fill();
    // lantern
    var lx = sx + ts * 1.02, ly = y - ts * 0.12;
    roundRect(ctx, lx, ly, ts * 0.26, ts * 0.30, ts * 0.06);
    ctx.fillStyle = open ? (night ? '#ffd98a' : '#e8c357') : '#4a4038';
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(1, ts * 0.04);
    ctx.stroke();
    ctx.restore();
  }

  function sign(ctx, text, cx, baseY, ts, open) {
    var f = Math.max(9, ts * 0.40);
    ctx.save();
    ctx.font = '600 ' + f + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(text).width + ts * 0.7;
    var h = f + ts * 0.34;
    var x = cx - w / 2, y = baseY - h - ts * 0.42;
    // two little chains
    ctx.strokeStyle = 'rgba(40,32,26,0.7)';
    ctx.lineWidth = Math.max(1, ts * 0.035);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y); ctx.lineTo(x + w * 0.2, y - ts * 0.22);
    ctx.moveTo(x + w * 0.8, y); ctx.lineTo(x + w * 0.8, y - ts * 0.22);
    ctx.stroke();
    roundRect(ctx, x, y, w, h, ts * 0.12);
    solid(ctx, open ? '#5b4227' : '#3e3428', x, y, w, h,
          Math.max(1, ts * 0.045));
    ctx.fillStyle = open ? '#f5e7c6' : '#9d9285';
    ctx.fillText(text, cx, y + f * 0.92 + ts * 0.06);
    ctx.restore();
  }

  // ------------------------------------------------------------------ flora
  function tree(ctx, cx, groundY, ts, seed, opt) {
    opt = opt || {};
    var lw = Math.max(1, ts * 0.045);
    var trunkH = ts * 0.95, trunkW = ts * 0.30;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - trunkW * 0.62, groundY);
    ctx.quadraticCurveTo(cx - trunkW * 0.36, groundY - trunkH * 0.6,
                         cx - trunkW * 0.30, groundY - trunkH);
    ctx.lineTo(cx + trunkW * 0.30, groundY - trunkH);
    ctx.quadraticCurveTo(cx + trunkW * 0.36, groundY - trunkH * 0.6,
                         cx + trunkW * 0.62, groundY);
    ctx.closePath();
    solid(ctx, opt.trunk || '#5b3d24', cx - trunkW, groundY - trunkH,
          trunkW * 2, trunkH, lw);

    var cy = groundY - trunkH - ts * 0.62, cr = ts * 0.92;
    var leaf = opt.leaf || '#3f7f38';
    var lobes = [[0, 0, 1], [-0.58, 0.20, 0.70], [0.58, 0.20, 0.70],
                 [-0.30, -0.36, 0.62], [0.32, -0.32, 0.60]];
    ctx.beginPath();
    for (var i = 0; i < lobes.length; i++) {
      ctx.moveTo(cx + lobes[i][0] * cr + cr * lobes[i][2], cy + lobes[i][1] * cr);
      ctx.arc(cx + lobes[i][0] * cr, cy + lobes[i][1] * cr,
              cr * lobes[i][2], 0, 6.3);
    }
    /* Outline the SILHOUETTE, not every lobe.
     *
     * Stroking this path traces all five arcs, including the ones buried inside
     * the canopy - the tree came out looking like five circles in a bag. Fill a
     * slightly larger copy in the outline colour underneath instead, and the
     * only edge that survives is the outside one. */
    ctx.fillStyle = OUTLINE;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.045, 1.045);
    ctx.translate(-cx, -cy);
    ctx.fill();
    ctx.restore();

    var g = ctx.createRadialGradient(cx - cr * 0.4, cy - cr * 0.5, cr * 0.12,
                                     cx, cy, cr * 1.4);
    g.addColorStop(0, shade(leaf, 1.42));
    g.addColorStop(0.5, leaf);
    g.addColorStop(1, shade(leaf, 0.58));
    ctx.fillStyle = g;
    ctx.fill();

    if (opt.fruit) {
      ctx.fillStyle = opt.fruitColour || '#e0603c';
      for (var f = 0; f < Math.min(4, opt.fruit); f++) {
        var fa = 1.0 + f * 1.45;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(fa) * cr * 0.66, cy + Math.sin(fa) * cr * 0.58,
                ts * 0.14, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.8; ctx.stroke();
      }
    }
    ctx.restore();
  }

  function rock(ctx, cx, groundY, ts, oreColour) {
    var r = ts * 0.44, lw = Math.max(1, ts * 0.045);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var pts = [[-1, 0.06], [-0.66, -0.72], [0.10, -1.00],
               [0.88, -0.46], [0.82, 0.30]];
    ctx.moveTo(cx + pts[0][0] * r, groundY + pts[0][1] * r);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i], p = pts[i - 1];
      ctx.quadraticCurveTo(cx + (p[0] + a[0]) / 2 * r * 1.08,
                           groundY + (p[1] + a[1]) / 2 * r * 1.08,
                           cx + a[0] * r, groundY + a[1] * r);
    }
    ctx.closePath();
    solid(ctx, '#6d6d79', cx - r, groundY - r, r * 2, r * 1.2, lw);
    if (oreColour) {
      ctx.fillStyle = oreColour;
      for (var o = 0; o < 3; o++) {
        ctx.beginPath();
        ctx.arc(cx + (o - 1) * r * 0.40, groundY - r * (0.30 + (o % 2) * 0.32),
                ts * 0.075, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.7; ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ props
  /* Furniture and machines. One rounded body, a face, a couple of details -
   * enough for a thing to be recognisable at a glance without a pixel in it. */
  function prop(ctx, kind, sx, sy, ts, opt) {
    opt = opt || {};
    var lw = Math.max(1, ts * 0.05);
    var W = ts * 0.86, H = ts * 0.80;
    var x = sx + (ts - W) / 2, y = sy + ts - H - ts * 0.06;
    ctx.save();
    ctx.lineJoin = 'round';

    function body(colour, r) {
      roundRect(ctx, x, y, W, H, r == null ? ts * 0.14 : r);
      solid(ctx, colour, x, y, W, H, lw);
    }
    function panel(colour, px, py, pw, ph, r) {
      roundRect(ctx, x + W * px, y + H * py, W * pw, H * ph,
                r == null ? ts * 0.06 : r);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = lw * 0.7;
      ctx.stroke();
    }

    switch (kind) {
      case 'chest':
        body('#a8712f', ts * 0.10);
        panel('rgba(0,0,0,0.18)', 0.04, 0.30, 0.92, 0.16, ts * 0.03);
        panel('#e0c069', 0.42, 0.34, 0.16, 0.30, ts * 0.04);
        break;
      case 'machine': case 'furnace': {
        body(opt.colour || '#7a7a86', ts * 0.12);
        // the mouth, lit when it is working
        var mouth = opt.busy ? '#ff9a3c' : (opt.ready ? '#9fe07a' : '#3a3038');
        panel(mouth, 0.20, 0.34, 0.60, 0.42, ts * 0.07);
        if (opt.busy) {
          ctx.fillStyle = 'rgba(255,170,80,0.30)';
          ctx.beginPath();
          ctx.arc(x + W * 0.5, y + H * 0.55, ts * 0.42, 0, 6.3);
          ctx.fill();
        }
        panel('rgba(255,255,255,0.14)', 0.10, 0.08, 0.80, 0.14, ts * 0.05);
        break;
      }
      case 'kitchen':
        body('#8c8f97', ts * 0.10);
        panel('#2c2c33', 0.14, 0.36, 0.32, 0.44, ts * 0.06);
        panel('#ff9a3c', 0.56, 0.30, 0.30, 0.24, ts * 0.10);
        break;
      case 'workshop':
        body('#8a6438', ts * 0.08);
        panel('rgba(0,0,0,0.20)', 0.04, 0.16, 0.92, 0.14, ts * 0.03);
        panel('#b8b8c2', 0.16, 0.42, 0.24, 0.16, ts * 0.04);
        panel('#b8b8c2', 0.58, 0.42, 0.24, 0.16, ts * 0.04);
        break;
      case 'bed':
        roundRect(ctx, sx + ts * 0.06, sy + ts * 0.10, ts * 1.7, ts * 0.94,
                  ts * 0.16);
        solid(ctx, '#8a4750', sx + ts * 0.06, sy + ts * 0.10, ts * 1.7,
              ts * 0.94, lw);
        roundRect(ctx, sx + ts * 0.14, sy + ts * 0.18, ts * 0.52, ts * 0.44,
                  ts * 0.12);
        ctx.fillStyle = '#f0ead8'; ctx.fill();
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = lw * 0.8; ctx.stroke();
        break;
      case 'tv':
        body('#33333c', ts * 0.10);
        panel(opt.night ? '#8fd0ee' : '#5f8fa8', 0.10, 0.14, 0.80, 0.54,
              ts * 0.05);
        break;
      case 'counter':
        roundRect(ctx, sx - ts * 0.10, sy + ts * 0.24, ts * 1.2, ts * 0.72,
                  ts * 0.12);
        solid(ctx, '#8a6438', sx - ts * 0.10, sy + ts * 0.24, ts * 1.2,
              ts * 0.72, lw);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(sx - ts * 0.10, sy + ts * 0.24, ts * 1.2, ts * 0.13);
        break;
      case 'mailbox':
        roundRect(ctx, x + W * 0.42, y + H * 0.30, W * 0.16, H * 0.86,
                  ts * 0.03);
        solid(ctx, '#6b4a30', x + W * 0.42, y + H * 0.30, W * 0.16,
              H * 0.86, lw);
        roundRect(ctx, x + W * 0.06, y - H * 0.10, W * 0.88, H * 0.46,
                  ts * 0.14);
        solid(ctx, opt.mail ? '#d8623c' : '#3f6fb5', x + W * 0.06,
              y - H * 0.10, W * 0.88, H * 0.46, lw);
        break;
      case 'calendarBoard':
        body('#f0e8d4', ts * 0.06);
        panel('#c0453b', 0.06, 0.06, 0.88, 0.22, ts * 0.03);
        for (var d = 0; d < 6; d++) {
          panel('rgba(60,50,44,0.30)',
                0.10 + (d % 3) * 0.28, 0.42 + Math.floor(d / 3) * 0.26,
                0.18, 0.18, ts * 0.02);
        }
        break;
      case 'bin':
        roundRect(ctx, sx - ts * 0.05, sy + ts * 0.16, ts * 1.1, ts * 0.80,
                  ts * 0.10);
        solid(ctx, '#6b4a30', sx - ts * 0.05, sy + ts * 0.16, ts * 1.1,
              ts * 0.80, lw);
        roundRect(ctx, sx + ts * 0.02, sy + ts * 0.10, ts * 0.96, ts * 0.20,
                  ts * 0.08);
        solid(ctx, '#8a6438', sx + ts * 0.02, sy + ts * 0.10, ts * 0.96,
              ts * 0.20, lw);
        break;
      case 'sign':
        roundRect(ctx, x + W * 0.44, y + H * 0.44, W * 0.12, H * 0.60,
                  ts * 0.03);
        solid(ctx, '#6b4a30', x + W * 0.44, y + H * 0.44, W * 0.12,
              H * 0.60, lw);
        roundRect(ctx, x, y - H * 0.06, W, H * 0.52, ts * 0.08);
        solid(ctx, '#c9a45e', x, y - H * 0.06, W, H * 0.52, lw);
        break;
      default:
        body(opt.colour || '#8a7a5e', ts * 0.12);
        break;
    }
    ctx.restore();
  }

  /* The little name plate under a machine, so a bank of them reads. */
  function label(ctx, text, cx, y, ts) {
    var f = Math.max(8, ts * 0.30);
    ctx.save();
    ctx.font = '600 ' + f + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(text).width + ts * 0.28;
    roundRect(ctx, cx - w / 2, y, w, f + ts * 0.16, ts * 0.08);
    ctx.fillStyle = 'rgba(22,18,24,0.62)';
    ctx.fill();
    ctx.fillStyle = 'rgba(240,230,210,0.94)';
    ctx.fillText(text, cx, y + f * 0.92);
    ctx.restore();
  }

  global.SDV_ART = {
    person: person, building: building, door: door, sign: sign,
    tree: tree, rock: rock, prop: prop, label: label,
    roundRect: roundRect, shade: shade, solid: solid, OUTLINE: OUTLINE
  };
})(window);
