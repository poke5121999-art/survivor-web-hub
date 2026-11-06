/*
 * pokeart.js - the 604 FireRed/LeafGreen sprites, packed and drawn.
 *
 * A second atlas rather than a bigger first one, and that is deliberate: the
 * island art is 330 KB and needed on the very first frame; the Pokemon art is
 * 900 KB and not needed until the player buys Đảo Cỏ Xanh, which is several
 * hours in. Splitting them means the game opens on a phone without waiting for
 * a megabyte of Charizards.
 *
 * Frame keys are f<id> front, b<id> back, sf<id> shiny front, sb<id> shiny
 * back. Which one a Pokemon uses is decided here, from its own `shiny` flag,
 * so no caller ever has to remember to check.
 *
 * These are placeholder art. They are the real GBA sprites so the game can be
 * FELT - so a Geodude reads as a Geodude while the systems are being judged -
 * and they are the one part of the build meant to be replaced wholesale by a
 * hand-drawn set that matches the island style.
 */
(function (global) {
  'use strict';

  var PAGES = [], F = {}, READY = false, LOADING = false, WAIT = [];
  var P = 0, SX = 1, SY = 2, SW = 3, SH = 4, OX = 5, OY = 6, W = 7, H = 8;

  /* Lazy. Called the first time anything asks to draw a Pokemon, which in
   * practice is the moment the first encounter starts or the party panel is
   * opened. Everything before that never touches the file. */
  function load(done) {
    if (READY) { if (done) done(); return; }
    if (done) WAIT.push(done);
    if (LOADING) return;
    LOADING = true;
    var base = 'art/poke/';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', base + 'poke.json?v=1', true);
    xhr.onload = function () {
      var meta;
      try { meta = JSON.parse(xhr.responseText); } catch (e) { return fail(); }
      F = meta.f || {};
      var left = meta.pages.length;
      if (!left) return fail();
      meta.pages.forEach(function (p, i) {
        var img = new Image();
        img.onload = function () { if (--left === 0) finish(); };
        img.onerror = fail;
        img.src = base + p.file + '?v=1';
        PAGES[i] = img;
      });
    };
    xhr.onerror = fail;
    xhr.send();
    function finish() { READY = true; WAIT.splice(0).forEach(function (f) { f(); }); }
    function fail() {
      if (global.console) console.error('[pokeart] atlas unavailable');
      READY = true; WAIT.splice(0).forEach(function (f) { f(); });
    }
  }

  function ready() { return READY; }
  function has(key) { return !!F[key]; }

  function keyFor(p, back) {
    var pre = (p.shiny ? 's' : '') + (back ? 'b' : 'f');
    var k = pre + p.id;
    /* Every shiny back sprite should exist, but a missing one must degrade to
     * the normal sprite rather than to a magenta box - a shiny is a once-in-
     * five-hundred moment and it cannot be the thing that breaks. */
    if (F[k]) return k;
    var plain = (back ? 'b' : 'f') + p.id;
    return F[plain] ? plain : null;
  }

  /* Draw into a box of `size`, scaled to fit and pixel-snapped. Pokemon
   * sprites are 64x64 with wildly different content sizes, so fitting to the
   * TRIMMED art rather than the nominal box is what stops a Diglett from
   * rendering the size of an Onix. */
  function drawInto(ctx, p, x, y, size, back) {
    if (!READY) { load(); return false; }
    var k = keyFor(p, back);
    if (!k) {
      ctx.fillStyle = '#ff00c8';
      ctx.fillRect(x, y, size, size);
      return false;
    }
    var f = F[k];
    var s = Math.min(size / f[SW], size / f[SH]);
    var dw = Math.round(f[SW] * s), dh = Math.round(f[SH] * s);
    ctx.drawImage(PAGES[f[P]], f[SX], f[SY], f[SW], f[SH],
                  Math.round(x + (size - dw) / 2), Math.round(y + (size - dh) / 2), dw, dh);
    return true;
  }

  /* Same, but positioned by the sprite's FEET, for the battle scene where the
   * two combatants have to stand on their platforms rather than float in
   * boxes of different heights. */
  function drawStanding(ctx, p, cx, by, scale, back) {
    if (!READY) { load(); return false; }
    var k = keyFor(p, back);
    if (!k) return false;
    var f = F[k];
    var dw = f[SW] * scale, dh = f[SH] * scale;
    ctx.drawImage(PAGES[f[P]], f[SX], f[SY], f[SW], f[SH],
                  Math.round(cx - dw / 2), Math.round(by - dh), Math.round(dw), Math.round(dh));
    return true;
  }

  var _icons = {};
  function icon(p, size) {
    size = size || 40;
    var key = (p.shiny ? 's' : '') + p.id + '@' + size;
    if (_icons[key]) return copy(_icons[key]);
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    drawInto(x, p, 0, 0, size);
    /* Do not cache before the atlas is up, or the first party screen caches a
     * grid of empty canvases and never repaints them. */
    if (READY) _icons[key] = c;
    return copy(c);
  }
  function copy(c) {
    var d = document.createElement('canvas');
    d.width = c.width; d.height = c.height;
    d.getContext('2d').drawImage(c, 0, 0);
    return d;
  }

  /* A dex silhouette: the sprite filled flat black, for species the player has
   * seen but not caught. */
  function silhouette(id, size) {
    size = size || 40;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    if (!READY || !F['f' + id]) { load(); return c; }
    drawInto(x, { id: id, shiny: false }, 0, 0, size);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#2b3340';
    x.fillRect(0, 0, size, size);
    return c;
  }

  global.ISL_POKEART = {
    load: load, ready: ready, has: has, keyFor: keyFor,
    drawInto: drawInto, drawStanding: drawStanding,
    icon: icon, silhouette: silhouette
  };
})(window);
