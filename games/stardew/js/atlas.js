/*
 * atlas.js - every pixel the game draws comes from here.
 *
 * The old build drew its world from code: a painter per tile texture, a
 * procedural villager, a hand-mixed palette. That was the right call when
 * there was no art. There is art now - art/pki/pki_*.png, one packed atlas of
 * 1145 frames - so the painters are gone and this file is the whole art layer.
 *
 * WHY an atlas and not 1145 loose PNGs: a phone opening a page over a slow
 * connection pays a round trip per file. One 330 KB sheet is one request and
 * one decode, and it means `drawImage` never switches source texture, which is
 * what lets the renderer stay at 60fps while it paints a few hundred objects.
 *
 * The index in pki.json stores each frame ALPHA-TRIMMED plus the offset it was
 * trimmed from, so `draw` still positions a sprite as if the transparent
 * margin were there. Without that every sprite would jump when its art changed
 * by a pixel of padding.
 *
 * Frame record: [page, sx, sy, sw, sh, offX, offY, srcW, srcH]
 */
(function (global) {
  'use strict';

  var PAGES = [];          // HTMLImageElement per atlas page
  var F = {};              // name -> frame record
  var READY = false;
  var WAITING = [];

  var P = 0, SX = 1, SY = 2, SW = 3, SH = 4, OX = 5, OY = 6, W = 7, H = 8;

  /* ------------------------------------------------------------------ load */
  function load(base, done) {
    base = base || 'art/pki/';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', base + 'pki.json?v=1', true);
    xhr.onload = function () {
      var meta;
      try { meta = JSON.parse(xhr.responseText); }
      catch (e) { return fail('atlas json unreadable'); }
      F = meta.f || {};
      var left = meta.pages.length;
      if (!left) return fail('atlas has no pages');
      meta.pages.forEach(function (p, i) {
        var img = new Image();
        img.onload = function () { if (--left === 0) finish(); };
        img.onerror = function () { fail('atlas page missing: ' + p.file); };
        img.src = base + p.file + '?v=1';
        PAGES[i] = img;
      });
    };
    xhr.onerror = function () { fail('atlas json unreachable'); };
    xhr.send();

    function finish() {
      READY = true;
      WAITING.splice(0).forEach(function (fn) { fn(); });
      if (done) done(null);
    }
    /* A missing atlas must not leave a black screen with nothing said. The
     * game boots anyway - every draw becomes a magenta box, which is loud
     * enough to be reported and quiet enough to still be playable. */
    function fail(msg) {
      READY = true;
      if (global.console) console.error('[atlas]', msg);
      WAITING.splice(0).forEach(function (fn) { fn(); });
      if (done) done(msg);
    }
  }

  function onReady(fn) { if (READY) fn(); else WAITING.push(fn); }

  /* ------------------------------------------------------------------ query */
  function has(name) { return !!F[name]; }
  function frame(name) { return F[name] || null; }
  function width(name) { var f = F[name]; return f ? f[W] : 0; }
  function height(name) { var f = F[name]; return f ? f[H] : 0; }

  /* First name in the list that actually exists. Lets a caller ask for the
   * specific art and fall back to a generic one in a single expression. */
  function pick(names) {
    for (var i = 0; i < names.length; i++) if (F[names[i]]) return names[i];
    return null;
  }

  /* Every frame whose name starts with prefix, in atlas order. Used to build
   * animation strips ('Idle_0', 'Idle_1', ...) without hardcoding counts. */
  function series(prefix) {
    var out = [];
    for (var k in F) if (k.indexOf(prefix) === 0) out.push(k);
    out.sort(function (a, b) {
      var na = parseInt(a.slice(prefix.length).replace(/^_/, ''), 10);
      var nb = parseInt(b.slice(prefix.length).replace(/^_/, ''), 10);
      if (isNaN(na) || isNaN(nb)) return a < b ? -1 : 1;
      return na - nb;
    });
    return out;
  }

  /* ------------------------------------------------------------------ draw */
  var MISSING = {};

  function miss(ctx, name, x, y, w, h) {
    if (!MISSING[name]) { MISSING[name] = 1; if (global.console) console.warn('[atlas] no frame:', name); }
    ctx.fillStyle = '#ff00c8';
    ctx.fillRect(x, y, w || 8, h || 8);
  }

  /* Draw at (x,y) = top-left of the sprite's ORIGINAL (untrimmed) box.
   * opt.scale  - uniform scale, default 1
   * opt.flip   - mirror horizontally about the sprite's own centre
   * opt.alpha  - 0..1
   * opt.tint   - CSS colour composited over the sprite (used for locked land,
   *              night-blue villagers, damage flashes) */
  function draw(ctx, name, x, y, opt) {
    var f = F[name];
    if (!f) return miss(ctx, name, x, y, 8, 8);
    var s = (opt && opt.scale) || 1;
    var a = opt && opt.alpha != null ? opt.alpha : 1;
    var dw = f[SW] * s, dh = f[SH] * s;
    var dx = x + f[OX] * s, dy = y + f[OY] * s;
    var oldA = ctx.globalAlpha;
    if (a !== 1) ctx.globalAlpha = oldA * a;
    if (opt && opt.flip) {
      ctx.save();
      ctx.translate(x + f[W] * s, y);
      ctx.scale(-1, 1);
      ctx.drawImage(PAGES[f[P]], f[SX], f[SY], f[SW], f[SH], f[OX] * s, f[OY] * s, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(PAGES[f[P]], f[SX], f[SY], f[SW], f[SH], dx, dy, dw, dh);
    }
    if (opt && opt.tint) tint(ctx, name, dx, dy, dw, dh, opt.tint, opt.tintA == null ? 1 : opt.tintA);
    if (a !== 1) ctx.globalAlpha = oldA;
  }

  /* Bottom-centre anchored - the registration every world object uses, so a
   * 38px rock and a 20px villager both stand ON the tile they occupy rather
   * than hanging off the top of it. */
  function drawAt(ctx, name, cx, by, opt) {
    var f = F[name];
    if (!f) return miss(ctx, name, cx - 4, by - 8, 8, 8);
    var s = (opt && opt.scale) || 1;
    draw(ctx, name, cx - (f[W] * s) / 2, by - f[H] * s, opt);
  }

  /* Colour wash over the shape of a sprite. Costs an offscreen composite, so
   * it is only ever used for a handful of things a frame. */
  var _tc = null, _tx = null;
  function tint(ctx, name, dx, dy, dw, dh, colour, alpha) {
    var f = F[name];
    if (!f) return;
    if (!_tc) { _tc = document.createElement('canvas'); _tx = _tc.getContext('2d'); }
    if (_tc.width < f[SW] || _tc.height < f[SH]) { _tc.width = f[SW]; _tc.height = f[SH]; }
    _tx.clearRect(0, 0, _tc.width, _tc.height);
    _tx.globalCompositeOperation = 'source-over';
    _tx.drawImage(PAGES[f[P]], f[SX], f[SY], f[SW], f[SH], 0, 0, f[SW], f[SH]);
    _tx.globalCompositeOperation = 'source-in';
    _tx.fillStyle = colour;
    _tx.fillRect(0, 0, f[SW], f[SH]);
    var old = ctx.globalAlpha;
    ctx.globalAlpha = old * alpha;
    ctx.drawImage(_tc, 0, 0, f[SW], f[SH], dx, dy, dw, dh);
    ctx.globalAlpha = old;
  }

  /* ------------------------------------------------------------- nine-slice
   * The island ground panels (BaseGround*_forSliced, 48x48) are built to be
   * stretched: a 16px corner ring around a 16px middle. Every island in the
   * game is one call to this, which is why land can be any size without a
   * tileset for it. */
  function nine(ctx, name, x, y, w, h, inset) {
    var f = F[name];
    if (!f) return miss(ctx, name, x, y, w, h);
    /* The frame was alpha-trimmed; nine-slicing needs the untrimmed square,
     * so draw through a scratch canvas that restores the margin. */
    var src = untrimmed(name);
    var c = inset == null ? Math.floor(Math.min(src.width, src.height) / 3) : inset;
    var mw = src.width - c * 2, mh = src.height - c * 2;
    var iw = Math.max(1, w - c * 2), ih = Math.max(1, h - c * 2);
    // corners
    ctx.drawImage(src, 0, 0, c, c, x, y, c, c);
    ctx.drawImage(src, src.width - c, 0, c, c, x + w - c, y, c, c);
    ctx.drawImage(src, 0, src.height - c, c, c, x, y + h - c, c, c);
    ctx.drawImage(src, src.width - c, src.height - c, c, c, x + w - c, y + h - c, c, c);
    // edges
    ctx.drawImage(src, c, 0, mw, c, x + c, y, iw, c);
    ctx.drawImage(src, c, src.height - c, mw, c, x + c, y + h - c, iw, c);
    ctx.drawImage(src, 0, c, c, mh, x, y + c, c, ih);
    ctx.drawImage(src, src.width - c, c, c, mh, x + w - c, y + c, c, ih);
    // middle
    ctx.drawImage(src, c, c, mw, mh, x + c, y + c, iw, ih);
  }

  var _un = {};
  function untrimmed(name) {
    if (_un[name]) return _un[name];
    var f = F[name];
    var c = document.createElement('canvas');
    c.width = f[W]; c.height = f[H];
    var g = c.getContext('2d');
    g.drawImage(PAGES[f[P]], f[SX], f[SY], f[SW], f[SH], f[OX], f[OY], f[SW], f[SH]);
    _un[name] = c;
    return c;
  }

  /* ------------------------------------------------------------------- icons
   * The interface is DOM, not canvas, so a panel row needs a real element for
   * its picture. One small canvas per distinct (name,size) is built once and
   * cloned after that - a shop list of forty rows was allocating forty
   * canvases per open before this cache existed. */
  var _icons = {};
  function iconCanvas(name, size) {
    size = size || 32;
    var key = name + '@' + size;
    if (_icons[key]) return copyOf(_icons[key]);
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    var f = F[name];
    if (f) {
      var s = Math.min(size / f[W], size / f[H]);
      // whole pixels only below 1x, or the art shimmers
      if (s > 1) s = Math.max(1, Math.floor(s));
      var w = f[W] * s, h = f[H] * s;
      draw(g, name, (size - w) / 2, (size - h) / 2, { scale: s });
    } else {
      g.fillStyle = '#ff00c8'; g.fillRect(0, 0, size, size);
    }
    _icons[key] = c;
    return copyOf(c);
  }
  function copyOf(c) {
    var d = document.createElement('canvas');
    d.width = c.width; d.height = c.height;
    d.getContext('2d').drawImage(c, 0, 0);
    return d;
  }

  /* A data URL of a frame, for the few places CSS needs the picture
   * (background-image on a button) rather than an element. */
  var _urls = {};
  function url(name, size) {
    var key = name + '@' + (size || 32);
    if (!_urls[key]) _urls[key] = iconCanvas(name, size).toDataURL();
    return _urls[key];
  }

  global.ISL_ATLAS = {
    load: load, onReady: onReady, ready: function () { return READY; },
    has: has, frame: frame, width: width, height: height,
    pick: pick, series: series,
    draw: draw, drawAt: drawAt, nine: nine, tint: tint,
    icon: iconCanvas, url: url
  };
})(window);
