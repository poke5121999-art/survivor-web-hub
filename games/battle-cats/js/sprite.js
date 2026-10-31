// Battle Cats sprite player: mamodel parts + imgcut cuts + maanim keyframes.
// Model part fields: [parent, sheet, cut, zorder, x, y, pivotX, pivotY, scaleX, scaleY, angle, opacity, glow]
// units: [scaleUnit, angleUnit, opacityUnit]
(function (root) {
  'use strict';

  var P = { PARENT: 0, CUT: 2, Z: 3, X: 4, Y: 5, PX: 6, PY: 7, SX: 8, SY: 9, ANG: 10, OP: 11, GLOW: 12 };

  // maanim modType -> which model field it drives (BCU standard)
  var MOD = { 0: 'x', 1: 'y', 2: 'px', 3: 'py', 4: 'ang', 5: 'ang', 6: 'op', 7: 'sx', 8: 'sy',
              9: 'sx', 10: 'sy', 11: 'op', 12: 'ang', 50: 'scale' };

  function ease(prev, next, frame, kfPrev) {
    // prev,next = [frame,val,ease,easeP]; interpolate val at frame
    var f0 = prev[0], f1 = next[0], v0 = prev[1], v1 = next[1];
    if (f1 === f0) return v1;
    var t = (frame - f0) / (f1 - f0);
    var type = prev[2] | 0, p = prev[3] | 0;
    if (type === 0) { // linear
      return v0 + (v1 - v0) * t;
    } else if (type === 1) { // step/none
      return v0;
    } else if (type === 2) { // ease in-out (sine)
      var tt = (1 - Math.cos(t * Math.PI)) / 2;
      return v0 + (v1 - v0) * tt;
    } else if (type === 3) { // ease by power of p
      var e = p < 0 ? 1 - Math.pow(1 - t, -p) : Math.pow(t, p || 1);
      return v0 + (v1 - v0) * e;
    }
    return v0 + (v1 - v0) * t;
  }

  function sampleKf(kf, frame, loopEnd, loop) {
    if (!kf.length) return null;
    var f = frame;
    if (loop && loopEnd > 0) f = f % loopEnd;
    if (f <= kf[0][0]) return kf[0][1];
    if (f >= kf[kf.length - 1][0]) return kf[kf.length - 1][1];
    for (var i = 0; i < kf.length - 1; i++) {
      if (f >= kf[i][0] && f <= kf[i + 1][0]) return ease(kf[i], kf[i + 1], f, kf[i]);
    }
    return kf[kf.length - 1][1];
  }

  // Compute per-part animated state for a given animation at `frame`.
  function animState(model, anim, frame) {
    var parts = model.parts;
    var st = new Array(parts.length);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      st[i] = { x: p[P.X], y: p[P.Y], px: p[P.PX], py: p[P.PY],
                sx: p[P.SX], sy: p[P.SY], ang: p[P.ANG], op: p[P.OP],
                cut: p[P.CUT], scaleMul: 1 };
    }
    if (anim) {
      var end = anim.end || 0;
      for (var a = 0; a < anim.parts.length; a++) {
        var ap = anim.parts[a];
        if (ap.part < 0 || ap.part >= st.length) continue;
        var v = sampleKf(ap.kf, frame, end, ap.loop);
        if (v == null) continue;
        var field = MOD[ap.mod];
        var s = st[ap.part];
        if (ap.mod === 50) s.scaleMul = v / model.units[0];
        else if (field === 'ang') s.ang = v;
        else if (field === 'op') s.op = v;
        else if (field === 'sx') s.sx = v;
        else if (field === 'sy') s.sy = v;
        else if (field === 'px') s.px = v;
        else if (field === 'py') s.py = v;
        else if (field === 'x') s.x = v;
        else if (field === 'y') s.y = v;
      }
    }
    return st;
  }

  // Draw model into ctx. sheet = Image/canvas. opts: {scale, flip}
  function draw(ctx, model, sheet, st, opts) {
    opts = opts || {};
    var sU = model.units[0], aU = model.units[1], oU = model.units[2];
    var parts = model.parts, cuts = model.cuts;
    var order = [];
    for (var i = 0; i < parts.length; i++) order.push(i);
    order.sort(function (A, B) { return (parts[A][P.Z]) - (parts[B][P.Z]) || A - B; });

    var mats = new Array(parts.length);
    function mat(i) {
      if (mats[i]) return mats[i];
      var p = parts[i], s = st[i];
      var ang = s.ang / aU * 2 * Math.PI;
      var sx = (s.sx / sU) * (s.scaleMul || 1);
      var sy = (s.sy / sU) * (s.scaleMul || 1);
      var local = translate(s.x, s.y);
      local = mul(local, rotate(ang));
      local = mul(local, scale(sx, sy));
      var m;
      if (p[P.PARENT] < 0) m = local;
      else m = mul(mat(p[P.PARENT]), local);
      return mats[i] = m;
    }

    var gscale = opts.scale || 1, flip = opts.flip ? -1 : 1;
    for (var k = 0; k < order.length; k++) {
      var idx = order[k];
      var p = parts[idx], s = st[idx];
      if (p[P.CUT] < 0 || !cuts[p[P.CUT]]) continue;
      var c = cuts[p[P.CUT]];
      var m = mat(idx);
      var op = (s.op / oU);
      if (op <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, op));
      if (p[P.GLOW]) ctx.globalCompositeOperation = 'lighter';
      // apply global + matrix
      ctx.transform(gscale * flip, 0, 0, gscale, 0, 0);
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.drawImage(sheet, c[0], c[1], c[2], c[3], -s.px, -s.py, c[2], c[3]);
      ctx.restore();
    }
  }

  // 2x3 affine helpers {a,b,c,d,e,f} == [[a,c,e],[b,d,f]]
  function translate(x, y) { return { a: 1, b: 0, c: 0, d: 1, e: x, f: y }; }
  function scale(x, y) { return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }; }
  function rotate(r) { var cs = Math.cos(r), sn = Math.sin(r); return { a: cs, b: sn, c: -sn, d: cs, e: 0, f: 0 }; }
  function mul(A, B) {
    return {
      a: A.a * B.a + A.c * B.b,
      b: A.b * B.a + A.d * B.b,
      c: A.a * B.c + A.c * B.d,
      d: A.b * B.c + A.d * B.d,
      e: A.a * B.e + A.c * B.f + A.e,
      f: A.b * B.e + A.d * B.f + A.f
    };
  }

  // Drawn bounding box of the model in model space (gscale=1, no flip), for a given state.
  // Returns {minX,minY,maxX,maxY,w,h} or null if nothing drawable.
  function bounds(model, st) {
    var parts = model.parts, cuts = model.cuts;
    var sU = model.units[0], aU = model.units[1];
    var mats = new Array(parts.length);
    function mat(i) {
      if (mats[i]) return mats[i];
      var p = parts[i], s = st[i];
      var ang = s.ang / aU * 2 * Math.PI;
      var sx = (s.sx / sU) * (s.scaleMul || 1);
      var sy = (s.sy / sU) * (s.scaleMul || 1);
      var local = mul(mul(translate(s.x, s.y), rotate(ang)), scale(sx, sy));
      return mats[i] = p[P.PARENT] < 0 ? local : mul(mat(p[P.PARENT]), local);
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], s = st[i];
      if (p[P.CUT] < 0 || !cuts[p[P.CUT]]) continue;
      if ((s.op | 0) <= 0) continue;
      var c = cuts[p[P.CUT]], m = mat(i);
      var x0 = -s.px, y0 = -s.py, x1 = x0 + c[2], y1 = y0 + c[3];
      var pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
      for (var k = 0; k < 4; k++) {
        var X = m.a * pts[k][0] + m.c * pts[k][1] + m.e;
        var Y = m.b * pts[k][0] + m.d * pts[k][1] + m.f;
        if (X < minX) minX = X; if (X > maxX) maxX = X;
        if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
        any = true;
      }
    }
    if (!any) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  var api = { animState: animState, draw: draw, bounds: bounds, MOD: MOD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BCSprite = api;
})(typeof window !== 'undefined' ? window : this);
