// Shared geometry and material helpers for the UI kit. Geometry is cached by size so a grid of identical tiles
// reuses one buffer. Everything is built with its top-left corner at the origin (x right, y DOWN in the node,
// stored as negative world y), because every node of the kit is laid out like CSS.

export function makeGeo(THREE) {
  const cache = new Map();
  const memo = (key, make) => { let g = cache.get(key); if (!g) { g = make(); g.userData.shared = true; cache.set(key, g); } return g; };
  const k = (v) => Math.round(v * 100) / 100;

  function rrShape(w, h, r) {
    r = Math.max(0.01, Math.min(r, w / 2, h / 2));
    const s = new THREE.Shape(); const x = -w / 2, y = -h / 2, P = Math.PI;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -P / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, P / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, P / 2, P, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, P, P * 1.5, false);
    return s;
  }

  // bevelled rounded slab: the side wall sits exactly on w x h, the front face is inset by `bevel`
  function slab(w, h, r, depth, bevel) {
    return memo(`s${k(w)}|${k(h)}|${k(r)}|${depth}|${bevel}`, () => {
      const g = new THREE.ExtrudeGeometry(rrShape(w, h, Math.max(r, bevel + 0.5)), {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 7, steps: 1,
      });
      g.translate(w / 2, -h / 2, 0); return g;
    });
  }
  function plate(w, h, r) {
    return memo(`p${k(w)}|${k(h)}|${k(r)}`, () => { const g = new THREE.ShapeGeometry(rrShape(w, h, r), 8); g.translate(w / 2, -h / 2, 0); return g; });
  }
  // a plate whose UV spans 0..1, for textured quads with rounded corners
  function plateUV(w, h, r) {
    return memo(`u${k(w)}|${k(h)}|${k(r)}`, () => {
      const g = new THREE.ShapeGeometry(rrShape(w, h, r), 8); const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
      g.translate(w / 2, -h / 2, 0); return g;
    });
  }
  const quad = (w, h) => memo(`q${k(w)}|${k(h)}`, () => { const g = new THREE.PlaneGeometry(w, h); return g; });

  // flat tube along a circle, built in segment order so setDrawRange can reveal an arc from the top, clockwise
  function arcTube(r, width, N = 72, M = 10) {
    return memo(`t${k(r)}|${k(width)}`, () => {
      const pos = [], nor = [], idx = [], rx = width / 2, ry = width * 0.34;
      for (let s = 0; s <= N; s++) {
        const a = (s / N) * Math.PI * 2, dx = Math.sin(a), dy = Math.cos(a);
        for (let p = 0; p < M; p++) {
          const f = (p / M) * Math.PI * 2, c = Math.cos(f), sn = Math.sin(f);
          pos.push(dx * (r + rx * c), dy * (r + rx * c), ry * sn);
          const nx = c / rx, nz = sn / ry, l = Math.hypot(nx, nz);
          nor.push(dx * nx / l, dy * nx / l, nz / l);
        }
      }
      for (let s = 0; s < N; s++) for (let p = 0; p < M; p++) {
        const a = s * M + p, b = s * M + (p + 1) % M, c = (s + 1) * M + p, d = (s + 1) * M + (p + 1) % M;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
      g.userData.perSeg = M * 6; g.userData.N = N; return g;
    });
  }

  // blurred rounded-rect shadow texture, cached by size
  const shadowTex = new Map();
  function shadow(w, h, r, blur) {
    const key = `${k(w)}|${k(h)}|${k(r)}|${blur}`; let t = shadowTex.get(key); if (t) return t;
    const sc = 2, pad = blur * 2, cw = Math.ceil((w + pad * 2) * sc), ch = Math.ceil((h + pad * 2) * sc);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    x.filter = `blur(${blur * sc * 0.55}px)`; x.fillStyle = '#000';
    x.beginPath(); x.roundRect(pad * sc, pad * sc, w * sc, h * sc, r * sc); x.fill();
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData = { pad, shared: true };
    shadowTex.set(key, t); return t;
  }

  const mats = new Map();
  function std(color, o = {}) {
    const key = 's' + color + (o.rough ?? '') + (o.vc ? 'v' : ''); let m = mats.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.42, metalness: 0, vertexColors: !!o.vc }); m.userData.shared = true; mats.set(key, m); }
    return m;
  }
  function basic(color, opacity = 1) {
    const key = 'b' + color + '|' + opacity; let m = mats.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }); m.userData.shared = true; mats.set(key, m); }
    return m;
  }

  const _c = new THREE.Color();
  const shade = (hex, f) => { _c.set(hex); if (f < 0) _c.lerp(new THREE.Color(0x120a1c), -f); else _c.lerp(new THREE.Color(0xffffff), f); return _c.getHex(); };
  const mix = (a, b, t) => { _c.set(a).lerp(new THREE.Color(b), t); return _c.getHex(); };

  // concatenate non-indexed geometries, with an optional per-geometry vertex colour
  function merge(list) {
    let n = 0; for (const { g } of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const { g, color } of list) {
      const geo = g.index ? g.toNonIndexed() : g; const p = geo.attributes.position, nm = geo.attributes.normal;
      _c.set(color);
      for (let i = 0; i < p.count; i++, o++) {
        pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3); nor.set([nm.getX(i), nm.getY(i), nm.getZ(i)], o * 3); col.set([_c.r, _c.g, _c.b], o * 3);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }

  // a panel's static layers as one vertex-coloured geometry: the ink outline behind the slab, the slab, and its top gloss
  // (the gloss is the panel colour lifted toward white, lit like the face it sits on)
  function panelBody(w, h, r, depth, bevel, color, ow, outline, gloss) {
    return memo(`pb${k(w)}|${k(h)}|${k(r)}|${depth}|${bevel}|${color}|${ow}|${outline}|${gloss}`, () => {
      const list = [{ g: slab(w, h, r, depth, bevel), color }];
      const moved = (g, dx, dy, dz) => { const c = g.index ? g.toNonIndexed() : g.clone(); c.translate(dx, dy, dz); return c; };
      if (outline != null) list.unshift({ g: moved(plate(w + ow * 2, h + ow * 2, r + ow), -ow, ow, -bevel - 0.6), color: outline });
      if (gloss) { const ins = bevel + 2.5, gw = w - ins * 2, gh = Math.max(5, (h - ins * 2) * 0.32); list.push({ g: moved(plate(gw, gh, Math.max(2, r - ins)), ins, -ins, depth + bevel + 0.15), color: mix(color, 0xffffff, 0.09) }); }
      return merge(list);
    });
  }
  // the static underside of a button: its ink outline and its darker base slab
  function buttonBack(w, h, lip, r, color) {
    return memo(`bb${k(w)}|${k(h)}|${lip}|${k(r)}|${color}`, () => {
      const ro = 1.6, o = plate(w + ro * 2, h + lip + ro * 2, r + ro).clone().toNonIndexed(); o.translate(-ro, ro, -4);
      const b = slab(w, h, r, 3, 2).clone(); b.translate(0, -lip, 0);
      return merge([{ g: o, color: shade(color, -0.68) }, { g: b, color: shade(color, -0.4) }]);
    });
  }

  // a button face: the bevelled slab with its colour running from a lifted top to a slightly deeper bottom (lit material,
  // no white stripe)
  function buttonFace(w, h, r, color) {
    return memo(`bf${k(w)}|${k(h)}|${k(r)}|${color}`, () => {
      const g = slab(w, h, r, 6, 3).clone(), p = g.attributes.position, col = new Float32Array(p.count * 3), top = new THREE.Color(shade(color, 0.16)), bot = new THREE.Color(shade(color, -0.14)), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, -p.getY(i) / h)); c.copy(top).lerp(bot, t * t * (3 - 2 * t)); col.set([c.r, c.g, c.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
    });
  }
  // a soft sheen across the upper part of a face: white whose alpha fades from the top edge to nothing at 55% height
  function sheen(w, h, r) {
    return memo(`sh${k(w)}|${k(h)}|${k(r)}`, () => {
      const g = new THREE.ShapeGeometry(rrShape(w, h, r), 8); const p = g.attributes.position, col = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) { const t = (h / 2 - p.getY(i)) / h, a = Math.max(0, 1 - t / 0.55); col.set([1, 1, 1, 0.26 * a * a], i * 4); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.translate(w / 2, -h / 2, 0); return g;
    });
  }

  return { rrShape, slab, plate, plateUV, quad, arcTube, shadow, std, basic, shade, mix, merge, panelBody, buttonBack, buttonFace, sheen };
}
