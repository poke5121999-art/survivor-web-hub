/*
 * fx.js - the half second after you swing something.
 *
 * Until now a tool made a sound in the code and nothing on the screen: the axe
 * removed a tree, the pickaxe removed a rock, and both looked like the object
 * simply vanished. The owner's note was exactly that - "cần các fx như chém,
 * chặt cây, đập đá rõ ràng".
 *
 * Everything here is drawn by code like the rest of the game: an arc for a
 * swing, chips that fly and fall for wood and stone, a splash for water, a puff
 * for the hoe. One list, one update, one draw, all in world coordinates so the
 * camera carries them.
 */
(function (global) {
  'use strict';

  function FX() {
    this.bits = [];        // flying chips
    this.arcs = [];        // swing arcs and rings
    this.floats = [];      // rising numbers / words
  }

  FX.prototype.clear = function () {
    this.bits.length = 0; this.arcs.length = 0; this.floats.length = 0;
  };

  // ------------------------------------------------------------------ spawn
  FX.prototype.chips = function (x, y, colors, n, spread, life) {
    n = n || 8;
    spread = spread || 3.4;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 0.6 + Math.random() * spread;
      this.bits.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2.2,
        life: life || (0.45 + Math.random() * 0.35),
        t: 0,
        size: 1 + (Math.random() * 2 | 0),
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
  };

  /* The swing itself: a bright arc sweeping through the tile in front of the
   * player, in the direction they are facing. */
  FX.prototype.swing = function (x, y, face, color, wide) {
    var base = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[face];
    this.arcs.push({
      kind: 'arc', x: x, y: y, a0: base - (wide || 1.1) / 2,
      a1: base + (wide || 1.1) / 2, r: 0.85, t: 0, life: 0.22,
      c: color || 'rgba(255,255,255,0.9)'
    });
  };

  FX.prototype.ring = function (x, y, color, r) {
    this.arcs.push({ kind: 'ring', x: x, y: y, r: r || 0.9, t: 0, life: 0.35,
                     c: color || 'rgba(255,255,255,0.75)' });
  };

  FX.prototype.float = function (x, y, text, color) {
    this.floats.push({ x: x, y: y, text: text, t: 0, life: 0.9,
                       c: color || '#fff' });
  };

  // ------------------------------------------------------------------ presets
  /* One call per action, so game code stays readable and the look of "chopping
   * a tree" is defined in exactly one place. */
  var PRESET = {
    chop:   { chips: ['#8a5a30', '#6b4423', '#c39a63', '#4e2f1c'], n: 10,
              arc: 'rgba(255,236,190,0.95)', sound: 'chop' },
    smash:  { chips: ['#9a9aa4', '#c8c8d2', '#6e6e78', '#e8e8f0'], n: 12,
              arc: 'rgba(220,235,255,0.95)' },
    slash:  { chips: ['#ff6b5a', '#ffd36b'], n: 6,
              arc: 'rgba(255,255,255,0.95)', wide: 1.6 },
    hoe:    { chips: ['#6a4c33', '#8b6b4a', '#4a3524'], n: 7,
              arc: 'rgba(190,160,120,0.6)' },
    water:  { chips: ['#7fc4f0', '#bfe4ff', '#4a9bd4'], n: 9,
              arc: 'rgba(150,215,255,0.8)' },
    weed:   { chips: ['#5fa855', '#3d7a38', '#8fd07f'], n: 8,
              arc: 'rgba(200,255,190,0.85)' },
    harvest:{ chips: ['#ffe08a', '#b6d96a'], n: 6, arc: null },
    fish:   { chips: ['#7fc4f0', '#bfe4ff'], n: 6, arc: null }
  };

  /* The whole point of the file: one line at the call site produces a swing
   * the player can see. */
  FX.prototype.hit = function (kind, tx, ty, face) {
    var p = PRESET[kind];
    if (!p) return;
    if (p.arc && face) this.swing(tx + 0.5, ty + 0.5, face, p.arc, p.wide);
    this.chips(tx + 0.5, ty + 0.5, p.chips, p.n);
  };

  // ------------------------------------------------------------------ tick
  FX.prototype.update = function (dt) {
    var i;
    for (i = this.bits.length - 1; i >= 0; i--) {
      var b = this.bits[i];
      b.t += dt;
      if (b.t >= b.life) { this.bits.splice(i, 1); continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 9 * dt;                 // gravity, so chips arc instead of drift
    }
    for (i = this.arcs.length - 1; i >= 0; i--) {
      var a = this.arcs[i];
      a.t += dt;
      if (a.t >= a.life) this.arcs.splice(i, 1);
    }
    for (i = this.floats.length - 1; i >= 0; i--) {
      var f = this.floats[i];
      f.t += dt;
      if (f.t >= f.life) this.floats.splice(i, 1);
    }
  };

  // ------------------------------------------------------------------ draw
  FX.prototype.draw = function (ctx, camX, camY, ts) {
    var i;
    ctx.save();
    for (i = 0; i < this.arcs.length; i++) {
      var a = this.arcs[i];
      var k = a.t / a.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = a.c;
      ctx.lineWidth = Math.max(2, ts * 0.16 * (1 - k * 0.5));
      ctx.beginPath();
      var cx = a.x * ts - camX, cy = a.y * ts - camY;
      if (a.kind === 'ring') {
        ctx.arc(cx, cy, (a.r + k * 0.6) * ts, 0, Math.PI * 2);
      } else {
        var span = a.a1 - a.a0;
        ctx.arc(cx, cy, (a.r + k * 0.25) * ts, a.a0 + span * k * 0.35,
                a.a1 + span * k * 0.35);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < this.bits.length; i++) {
      var b = this.bits[i];
      var t = 1 - b.t / b.life;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = b.c;
      var s = Math.max(2, b.size * ts / 12);
      ctx.fillRect(Math.round(b.x * ts - camX), Math.round(b.y * ts - camY), s, s);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < this.floats.length; i++) {
      var f = this.floats[i];
      var kf = f.t / f.life;
      ctx.globalAlpha = 1 - kf;
      ctx.font = 'bold ' + Math.max(10, ts * 0.55) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      var fx = f.x * ts - camX, fy = f.y * ts - camY - kf * ts * 1.4;
      ctx.strokeText(f.text, fx, fy);
      ctx.fillStyle = f.c;
      ctx.fillText(f.text, fx, fy);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  global.SDV_FX = { FX: FX, PRESET: PRESET };
})(window);
