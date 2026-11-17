// Steel style: the shared vocabulary of the refitted tanks, after the owner's "Sci-Fi Tanks Bundle" sheet
// (~/handoff/dtt-ref/8.webp). What it is made of:
//   - two-tone matte paint: gunmetal steel carries the hull, the tank's own colour sits only on top panels and
//     panel inserts, the undercarriage and track pods are darker (steelPalette, Kit.plate with an insert);
//   - chunky chamfered plates, octagonal turret rings, sloped glacis, stacked armour (Kit.plate, Kit.oct, Kit.prism);
//   - separate track pods with heavy skirts and simple decals (Kit.trackPod, Kit.decal);
//   - small emissive light squares in their own colour, lit strips, thin whip antennas (Kit.light, Kit.strip, Kit.antenna);
//   - readable weapon modules: ribbed heat-sink barrels, missile boxes with red tips, gatlings, sensor pods
//     (Kit.cannon, Kit.missileBox, Kit.gatling, Kit.sensor).
// A tank opts in by having a design in STEEL_DESIGNS (steel-tanks.js); buildModel then uses that design for every
// form and skips the role kit of styles.js (the design grows its own form II and III hardware). Its STYLES row still
// gives the colours: body becomes the panel colour, trim the accent, glow the lit strips.
// Same contract as the designs in mechs.js: models face +x, +z is the right side, the ground is y = 0.
import * as THREE from '../../vendor/three.module.min.js';

export const PI = Math.PI, X = -PI / 2, TAU = PI * 2;
// Lamps that keep their own colour (the light squares of the sheet), not the mech's glow.
// Light squares are drawn this many times the size a design asks for, so they read from the match camera (~100 px a tank).
const LIGHT_K = 1.9, EDGE = 2.1;
export const LAMP = { green: 0x38ff6a, red: 0xff2a1e, blue: 0x3a8cff, amber: 0xffb22a, white: 0xdff0ff };
// Roughness and metalness multipliers on the baked metal set (rough 0.4..0.8, metal 0.25..0.6): matte paint,
// oiled gunmetal, dull undercarriage. The other designs use paint [0.75, 1.4], which reads as glossy plastic.
const SURF = { panel: [1.55, 0.4], gun: [1.3, 0.85], under: [1.7, 0.6], steel: [1.0, 1.35], rubber: [1.9, 0] };
const KIND = { haz: 'panel', panel: 'panel', panelDeep: 'panel', trim: 'panel', decal: 'panel', gun: 'gun', gunLite: 'gun', under: 'under', dark: 'under', steel: 'steel', rubber: 'rubber' };

// Colours of one tank at one form. The STYLES body colour becomes the panel colour, desaturated and pulled into a
// mid lightness so it reads on gunmetal; form I is greyer, form III a little richer.
export function steelPalette(st, trim, form, o = {}) {
  const f = Math.max(1, Math.min(3, form | 0 || 2));
  const tone = (hex, s0, s1, sat, l0, l1, dh = 0) => { const h = {}; new THREE.Color(hex).getHSL(h); return new THREE.Color().setHSL((h.h + dh + 1) % 1, Math.max(s0, Math.min(s1, h.s)) * sat, Math.max(l0, Math.min(l1, h.l))); };
  // Keeps the hue of the STYLES body colour; saturation is pulled into 0.45..0.66 and lightness into 0.42..0.52 (o.hue nudges the hue) so a
  // dark brown body comes out a clear orange panel and a pale one still reads against the gunmetal.
  const panel = tone(st.body, 0.45, 0.66, [0.78, 0.9, 1][f - 1], 0.42, 0.52, o.hue || 0);
  return {
    f, panel, panelDeep: panel.clone().multiplyScalar(0.68), trim: tone(trim, 0, 1, 0.8, 0.3, 0.6),
    gun: new THREE.Color(0x3a3f47), gunLite: new THREE.Color(0x5a616b), under: new THREE.Color(0x24272c), dark: new THREE.Color(0x17191d),
    steel: new THREE.Color(0x9aa2ab), haz: new THREE.Color(0xc39a2e), rubber: new THREE.Color(0x1b1c1f), decal: new THREE.Color(0xc9cdc4), glow: new THREE.Color(st.glow),
  };
}

const ORIENT = {
  '+y': (b) => b, '-y': (b) => b.rotX(PI), '+x': (b) => b.rotZ(-PI / 2), '-x': (b) => b.rotZ(PI / 2),
  '+z': (b) => b.rotX(PI / 2), '-z': (b) => b.rotX(-PI / 2),
};

export class Kit {
  constructor(b, st, trim, form, o = {}) {
    this.b = b; this.c = steelPalette(st, trim, form, o); this.F = this.c.f; this.parts = []; this.gi = 0;
    // Chamfers facing up catch the light: this builder's chamfered boxes and prisms brighten their upward bevels, the
    // edge highlight of the sheet's hard-surface plates. Only this Builder instance is patched.
    // Also grime: darker toward the ground; and scuffs: a few bevel vertices lighter still.
    const P = new THREE.Vector3();
    const shade = (p, n) => {
      P.copy(p).applyMatrix4(b.m);
      const grime = 0.7 + 0.3 * Math.min(1, Math.max(0, P.y / 0.9));
      if (!(n.y > 0.25 && n.y < 0.98)) return grime;
      return grime * (Math.abs(Math.sin(P.x * 41.3 + P.z * 27.1 + P.y * 13.7)) > 0.92 ? EDGE * 1.4 : EDGE);
    };
    b.chamfer = (w, h, d, c = 0.05) => {
      c = Math.min(c, w * 0.45, h * 0.45, d * 0.45);
      const sh = new THREE.Shape([new THREE.Vector2(-w / 2 + c, -h / 2 + c), new THREE.Vector2(w / 2 - c, -h / 2 + c), new THREE.Vector2(w / 2 - c, h / 2 - c), new THREE.Vector2(-w / 2 + c, h / 2 - c)]);
      const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelSegments: 1 });
      g.translate(0, 0, -(d - 2 * c) / 2); b.geo(g, shade); g.dispose(); return b;
    };
    b.prism = (pts, y0, y1, bevel = 0) => {
      const sh = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], -q[1]))), c = Math.min(bevel, (y1 - y0) * 0.45);
      const g = new THREE.ExtrudeGeometry(sh, c > 0
        ? { depth: y1 - y0 - 2 * c, bevelEnabled: true, bevelThickness: c, bevelSize: c, bevelOffset: -c, bevelSegments: 1 }
        : { depth: y1 - y0, bevelEnabled: false });
      g.rotateX(-PI / 2); g.translate(0, y0 + c, 0); b.geo(g, shade); g.dispose(); return b;
    };
  }
  col(name) { return typeof name === 'string' ? this.c[name] : name; }
  // Paint by colour name: the surface follows the colour (panel paint is matte, gunmetal a little sheen).
  use(name) { const s = SURF[KIND[name] || 'gun']; this.b.surface(s[0], s[1]); this.b.tint(this.c[name]); return this; }
  // A lamp in its own colour (surf.y = 1 tells the mech shader to emit the vertex colour), or the mech's glow ('glow').
  lamp(col, f) {
    const b = this.b, s = b.surf, c = b.color.clone();
    if (col === 'glow') b.surface(-1, 0); else { b.surface(-1, 1); b.tint(this.col(col)); }
    f(); b.surf = s; b.color.copy(c); return this;
  }
  blk(x, y, z, w, h, d, col = 'gun', ch = 0.04) {
    this.use(col); this.b.push().move(x, y, z).chamfer(w, h, d, Math.min(ch, w * 0.4, h * 0.4, d * 0.4)).pop(); return this;
  }
  // Armour plate: a chamfered block with an optional inset panel of another colour on its top face.
  plate(x, y, z, w, h, d, o = {}) {
    const b = this.b, ins = o.insert === undefined ? 'panel' : o.insert, ch = o.ch ?? 0.035, inset = o.inset ?? Math.min(0.06, w * 0.12, d * 0.12);
    b.push().move(x, y, z); if (o.ry) b.rotY(o.ry); if (o.rz) b.rotZ(o.rz); if (o.rx) b.rotX(o.rx);
    this.use(o.col || 'gun'); b.chamfer(w, h, d, Math.min(ch, w * 0.4, h * 0.4, d * 0.4));
    if (ins) {
      // The inset panel is cut into 2-4 pieces along its long side with grooves between them; a big flat one also
      // gets a greeble (hatch, grille, bolt row or hazard stripe).
      this.use(ins);
      const iw = w - 2 * inset, id = d - 2 * inset, along = iw >= id, L = along ? iw : id, gr = 0.035;
      const n = o.split ?? Math.max(1, Math.min(4, Math.round(L / 0.42))), seg = (L - gr * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const off = -L / 2 + seg / 2 + i * (seg + gr);
        b.push().move((o.ix || 0) + (along ? off : 0), h / 2 + 0.008, (o.iz || 0) + (along ? 0 : off)).chamfer(along ? seg : iw, 0.03, along ? id : seg, 0.012).pop();
      }
      if (o.greeble !== false && iw * id > 0.22 && !o.rz && !o.rx) { b.push().move(o.ix || 0, h / 2 + 0.024, o.iz || 0); this.greeble(along ? iw : id, along ? id : iw, along); b.pop(); }
    }
    b.pop(); return this;
  }
  // Small surface detail lying on a top face (current origin), on an area L long and D wide; `along` true when L runs
  // along x. Cycles hatch, vent grille, bolt row, hazard stripe so neighbouring plates differ.
  greeble(L, D, along) {
    const b = this.b, kind = this.gi++ % 4;
    b.push(); if (!along) b.rotY(PI / 2);
    if (kind === 0) {
      const r = Math.min(D * 0.28, 0.13);
      this.oct(-L * 0.28, 0.012, 0, r, 0.025, 'gunLite', 0.008);
      this.use('dark'); b.push().move(-L * 0.28, 0.03, 0).box(r * 1.1, 0.015, 0.025).pop();
    } else if (kind === 1) {
      this.use('dark'); b.push().move(L * 0.22, 0.006, 0).box(L * 0.3, 0.012, D * 0.55).pop();
      this.use('gunLite'); for (let i = 0; i < 4; i++) b.push().move(L * 0.22 - L * 0.11 + i * L * 0.075, 0.016, 0).box(L * 0.025, 0.012, D * 0.5).pop();
    } else if (kind === 2) {
      this.use('steel'); for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.push().move(-L * 0.36 + i * L * 0.18, 0.008, s * D * 0.38).cyl(0.018, 0.018, 0.016, 6).pop();
    } else {
      for (let i = 0; i < 5; i++) { this.use(i % 2 ? 'dark' : 'haz'); b.push().move(-L * 0.3 + i * 0.055, 0.008, 0).rotY(0.6).box(0.045, 0.014, D * 0.5).pop(); }
    }
    b.pop(); return this;
  }
  // Polygon in the XZ plane ([x, z] points) extruded from y0 to y1 with chamfered edges.
  prism(pts, y0, y1, col = 'gun', bevel = 0.04) { this.use(col); this.b.prism(pts, y0, y1, bevel); return this; }
  // Polygon in the XY plane ([x, y] points) extruded along z from z0 to z1 (side profiles).
  profile(pts, z0, z1, col = 'gun', bevel = 0.03) { this.use(col); this.b.push().rotX(PI / 2).prism(pts.map((p) => [p[0], -p[1]]), Math.min(z0, z1), Math.max(z0, z1), bevel).pop(); return this; }
  // Octagonal slab (turret rings, cupolas); sx stretches it along x.
  oct(x, y, z, r, h, col = 'gun', bevel = 0.03, sx = 1) {
    const pts = []; for (let i = 0; i < 8; i++) { const a = (i + 0.5) * PI / 4; pts.push([x + Math.cos(a) * r * sx, z + Math.sin(a) * r]); }
    return this.prism(pts, y - h / 2, y + h / 2, col, bevel);
  }
  // Chamfered beam between two points (struts, arms, tail segments).
  beam(a, c, w, h, col = 'gun', ch = 0.03) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], hz = Math.hypot(dx, dz), len = Math.hypot(hz, dy);
    this.use(col);
    this.b.push().move((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2).rotY(Math.atan2(-dz, dx)).rotZ(Math.atan2(dy, hz)).chamfer(len, h, w, Math.min(ch, h * 0.4, w * 0.4)).pop();
    return this;
  }
  // Light square in a dark bezel on the face whose normal is `face` ('+x', '-z', ...), centred at x, y, z on that face.
  light(x, y, z, s, col, face = '+x', k = LIGHT_K) {
    const b = this.b; s *= k; b.push().move(x, y, z); ORIENT[face](b);
    this.use('dark'); b.push().move(0, 0.008, 0).box(s * 1.45, 0.018, s * 1.45).pop();
    this.lamp(col, () => b.push().move(0, 0.02, 0).box(s, 0.014, s).pop());
    b.pop(); return this;
  }
  // Lit strip along an axis.
  strip(x, y, z, len, axis = 'x', col = 'glow', t = 0.024) {
    const d = { x: [len, t, t], y: [t, len, t], z: [t, t, len] }[axis];
    return this.lamp(col, () => this.b.push().move(x, y, z).box(d[0], d[1], d[2]).pop());
  }
  // Thin whip antenna with a red tip.
  antenna(x, y, z, h, lean = 0.06) {
    this.use('dark'); this.b.push().move(x, y + 0.03, z).cyl(0.035, 0.045, 0.06, 6).pop();
    this.use('steel'); this.b.rod([x, y + 0.05, z], [x - lean, y + h, z], 0.011, 4);
    return this.lamp(LAMP.red, () => this.b.push().move(x - lean, y + h, z).box(0.03, 0.03, 0.03).pop());
  }
  // Decal on a face: a light square with a dark X ('x'), a chevron pointing +x ('chev') or diagonal hazard stripes ('stripe').
  decal(kind, x, y, z, s, face = '+z') {
    const b = this.b; b.push().move(x, y, z); ORIENT[face](b);
    if (kind === 'x') {
      this.use('decal'); b.push().move(0, 0.006, 0).box(s, 0.012, s).pop();
      this.use('dark'); for (const a of [PI / 4, -PI / 4]) b.push().move(0, 0.014, 0).rotY(a).box(s * 1.1, 0.008, s * 0.13).pop();
    } else if (kind === 'chev') {
      this.use('decal'); for (const sg of [-1, 1]) b.push().move(-s * 0.15, 0.008, sg * s * 0.22).rotY(-sg * 0.75).box(s * 0.62, 0.012, s * 0.16).pop();
    } else {
      for (let i = 0; i < 3; i++) { this.use(i % 2 ? 'dark' : 'decal'); b.push().move((i - 1) * s * 0.3, 0.008, 0).rotY(0.6).box(s * 0.18, 0.012, s * 0.9).pop(); }
    }
    b.pop(); return this;
  }
  // Track pod: rubber belt with road wheels on its outer face, a top cover plate (optional panel insert), a sloped
  // front guard, tread lugs (part 'tread', step 0.2) visible past the ends of the cover, an optional armour skirt with
  // a decal on its outer face and a light square on its nose. o.out: the outer side (+1 / -1), default the sign of z.
  trackPod(x, z, len, w, h, o = {}) {
    const b = this.b, s = o.out || Math.sign(z) || 1, l = len / 2, r = Math.min(h * 0.42, 0.2), zo = z + s * w / 2;
    this.profile([[x - l, h * 0.42], [x - l + r, 0.02], [x + l - r, 0.02], [x + l, h * 0.42], [x + l - r * 0.6, h * 0.9], [x - l + r * 0.6, h * 0.9]], z - w / 2, z + w / 2, 'rubber', 0.025);
    const n = Math.max(2, Math.round((len - 2 * r) / 0.34) + 1), wr = h * 0.25;
    for (let i = 0; i < n; i++) {
      const wx = x - l + r + i * (len - 2 * r) / (n - 1);
      this.use('steel'); b.push().move(wx, wr + 0.04, zo + s * 0.012).rotX(X).cyl(wr, wr, 0.03, 8).pop();
      this.use('dark'); b.push().move(wx, wr + 0.04, zo + s * 0.03).rotX(X).cyl(wr * 0.4, wr * 0.4, 0.02, 6).pop();
    }
    if (o.cover !== false) {
      this.plate(x - 0.02, h * 0.9 + 0.04, z, len * 0.8, 0.08, w + 0.08, { col: o.coverCol || 'gun', insert: o.insert === undefined ? null : o.insert });
      this.plate(x + l * 0.86, h * 0.72, z, 0.26, 0.07, w + 0.06, { col: o.coverCol || 'gun', insert: null, rz: -0.75 });
    }
    b.use('tread'); this.use('dark');
    for (let tx = x - l + 0.1; tx <= x + l - 0.1 + 1e-6; tx += 0.2) b.push().move(tx, h * 0.9 + 0.012, z).box(0.07, 0.025, w * 0.86).pop();
    b.use(o.batch || 'hull');
    if (!this.parts.some((p) => p.name === 'tread')) this.parts.push({ name: 'tread', on: 'hull', kind: 'tread', step: 0.2 });
    if (o.skirt) {
      const sh = o.skirtH ?? h * 0.46, sy = h * 0.92 - sh / 2;
      this.plate(x, sy, zo + s * 0.05, len * 0.84, sh, 0.07, { insert: null, rx: s * 0.1 });
      this.use('panel'); b.push().move(x, sy + sh / 2 - 0.02, zo + s * 0.09).box(len * 0.8, 0.04, 0.02).pop();
      if (o.decal) this.decal(o.decal, x + len * 0.22, sy - 0.02, zo + s * 0.092, sh * 0.5, s > 0 ? '+z' : '-z');
    }
    if (o.light) this.light(x + l + 0.01, h * 0.5, z, 0.075, o.light, '+x');
    return this;
  }
  // Barrel along +x from x: steel tube, ribbed heat-sink section (every other rib lit in `stripe`), muzzle brake.
  // Returns the x of the tip.
  cannon(x, y, z, len, r, o = {}) {
    const b = this.b, ribs = o.ribs ?? 4;
    b.push().move(x, y, z).rotZ(X);
    this.use(o.col || 'steel'); b.lathe([[r * 1.4, 0], [r * 1.4, 0.14], [r, 0.2], [r, len], [r * 0.85, len]], 10);
    b.pop();
    for (let i = 0; i < ribs; i++) {
      const rx = x + len * 0.24 + i * 0.075;
      if (o.stripe && i % 2) this.lamp(o.stripe, () => b.push().move(rx, y, z).rotZ(X).cyl(r * 1.42, r * 1.42, 0.03, 10).pop());
      else { this.use('gun'); b.push().move(rx, y, z).rotZ(X).cyl(r * 1.5, r * 1.5, 0.04, 10).pop(); }
    }
    if (o.brake !== false) { this.blk(x + len - 0.05, y, z, 0.17, r * 2.1, r * 2.7, 'dark', 0.025); this.use('dark'); b.push().move(x + len + 0.04, y, z).rotZ(X).cyl(r * 0.75, r * 0.75, 0.02, 8).pop(); }
    return x + len + 0.04;
  }
  // Box of rows x cols missile tubes facing +x, tilted up by elev, with panel cheeks and red tips. Returns the tip point.
  missileBox(x, y, z, rows, cols, cell, o = {}) {
    const b = this.b, dep = o.depth ?? cell * 2.2, hh = rows * cell + 0.07, ww = cols * cell + 0.07;
    b.push().move(x, y, z).rotZ(o.elev || 0);
    this.use(o.col || 'gun'); b.chamfer(dep, hh, ww, 0.03);
    if (o.cheeks !== false) { this.use(o.cheek || 'panel'); for (const s of [-1, 1]) b.push().move(-dep * 0.05, 0, s * (ww / 2 + 0.012)).chamfer(dep * 0.8, hh * 0.8, 0.03, 0.01).pop(); }
    this.use(o.cheek || 'panel'); b.push().move(-dep * 0.05, hh / 2 + 0.01, 0).chamfer(dep * 0.8, 0.025, ww * 0.82, 0.01).pop();
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const ty = (i - (rows - 1) / 2) * cell, tz = (j - (cols - 1) / 2) * cell;
      this.use('dark'); b.push().move(dep / 2, ty, tz).rotZ(X).cyl(cell * 0.38, cell * 0.38, 0.03, 8).pop();
      this.lamp(o.tip || LAMP.red, () => b.push().move(dep / 2 + 0.02, ty, tz).rotZ(X).cyl(cell * 0.24, cell * 0.3, 0.05, 6).pop());
    }
    b.pop();
    const e = o.elev || 0;
    return [x + Math.cos(e) * dep / 2, y + Math.sin(e) * dep / 2, z];
  }
  // Rotary cannon along +x: n barrels round a spindle, two housing rings (the front one lit) and a drive block.
  gatling(x, y, z, len, r, n = 6, o = {}) {
    const b = this.b;
    this.blk(x - 0.08, y, z, 0.22, r * 2.6, r * 2.6, 'gun', 0.03);
    this.use('steel'); for (let i = 0; i < n; i++) { const a = i / n * TAU; b.rod([x, y + Math.cos(a) * r, z + Math.sin(a) * r], [x + len, y + Math.cos(a) * r, z + Math.sin(a) * r], r * 0.28, 5); }
    this.use('gun'); b.push().move(x + len * 0.3, y, z).rotZ(X).cyl(r * 1.45, r * 1.45, 0.06, 10).pop();
    this.lamp(o.stripe || 'glow', () => b.push().move(x + len * 0.85, y, z).rotZ(X).cyl(r * 1.35, r * 1.35, 0.035, 10).pop());
    return x + len;
  }
  // Sensor pod: a gunmetal block with n light squares (2 or 4) on its front face.
  sensor(x, y, z, s, col = LAMP.green, n = 4) {
    this.plate(x, y, z, s * 0.9, s, s * (n === 4 ? 1.1 : 1.5), { insert: 'panel', inset: s * 0.15 });
    const pts = n === 4 ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[0, -1], [0, 1]];
    for (const [a, c] of pts) this.light(x + s * 0.45 + 0.005, y + a * s * 0.22, z + c * s * 0.26, s * 0.3, col, '+x', 1);
    return this;
  }
}
