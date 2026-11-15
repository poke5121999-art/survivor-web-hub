// Blocky character builder: a roster spec (lib/roster/*.js) -> a few big boxes wrapped in low-res pixel textures.
// Body plan (in "px", 32 px tall, 1 px = PX metres): head 8x8x8, torso 8x12x4, arms 4x12x4 (3 wide when slim),
// legs 4x12x4, plus an outer layer of the same boxes blown up by half a pixel (head) or a quarter (body) that carries
// hats, hoods, hair volume, jackets and armour with see-through texels. Held props, hat brims, backpacks and dogs are
// extra small boxes. Every box gets its own net on one per-character canvas (2 texels per px: a 16x16 face on the head),
// painted pixel by pixel, NearestFilter. All boxes go into one skinned geometry (one bone per box), so a character is a
// single draw call; animation rotates the bones at neck, shoulders and hips (block/actor.js).
import { THREE } from '../lib/lf-host.js';

export const PX = 1.85 / 32;      // metres per model pixel
export const S = 2;               // texels per model pixel
export const BONES = ['root', 'body', 'head', 'armR', 'armL', 'legR', 'legL', 'dog', 'dogHead', 'dogLegFR', 'dogLegFL', 'dogLegBR', 'dogLegBL', 'dogTail'];
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));

/* ---------------- colour + rng ---------------- */
const rgb = (h) => Array.isArray(h) ? (h[0] <= 1 && h[1] <= 1 && h[2] <= 1 ? h.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)) : h) : [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const sh = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lum = (c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
function rngOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/* ---------------- boxes + atlas ---------------- */
// face order and how each face's picture lies (u to the right, image up), see README "Box UV layout"
const FACES = {
  F: { n: [0, 0, 1], p: (a, b, m, M) => [m[0] + a * (M[0] - m[0]), m[1] + b * (M[1] - m[1]), M[2]], wh: (s) => [s[0], s[1]] },
  B: { n: [0, 0, -1], p: (a, b, m, M) => [M[0] - a * (M[0] - m[0]), m[1] + b * (M[1] - m[1]), m[2]], wh: (s) => [s[0], s[1]] },
  L: { n: [1, 0, 0], p: (a, b, m, M) => [M[0], m[1] + b * (M[1] - m[1]), M[2] - a * (M[2] - m[2])], wh: (s) => [s[2], s[1]] },
  R: { n: [-1, 0, 0], p: (a, b, m, M) => [m[0], m[1] + b * (M[1] - m[1]), m[2] + a * (M[2] - m[2])], wh: (s) => [s[2], s[1]] },
  T: { n: [0, 1, 0], p: (a, b, m, M) => [m[0] + a * (M[0] - m[0]), M[1], M[2] - b * (M[2] - m[2])], wh: (s) => [s[0], s[2]] },
  D: { n: [0, -1, 0], p: (a, b, m, M) => [m[0] + a * (M[0] - m[0]), m[1], m[2] + b * (M[2] - m[2])], wh: (s) => [s[0], s[2]] },
};
const tx = (v) => Math.max(1, Math.round(v * S));

class Kit {
  constructor(id) { this.id = id; this.boxes = []; this.mstack = [null]; this.rng = rngOf('blk:' + id); this.glow = false; }
  get m() { return this.mstack[this.mstack.length - 1]; }
  push(m) { const cur = this.m; this.mstack.push(cur ? cur.clone().multiply(m) : m.clone()); }
  pop() { this.mstack.pop(); }
  // min corner + size in px; o: { inf (inflate geometry, texture keeps base size), alpha (see-through texels), fill (base colour) }
  box(name, bone, min, size, o = {}) {
    const b = { name, bone: BI[bone], min, size, inf: o.inf || 0, alpha: !!o.alpha, ops: [], m: this.m, skip: o.skip };
    const t = size.map(tx); b.tw = 2 * t[2] + 2 * t[0]; b.th = t[2] + t[1]; b.t = t;
    if (o.fill !== undefined) b.ops.push((P) => { for (const f of 'FBLRTD') P[f].fill(o.fill, o.jit === undefined ? 0.05 : o.jit); });
    this.boxes.push(b); return b;
  }
  paint(b, fn) { b.ops.push(fn); return b; }
  // a solid box with light top, dark bottom edge rows: props, brims, pouches
  solid(name, bone, min, size, col, o = {}) { const b = this.box(name, bone, min, size, Object.assign({ fill: col }, o)); if (o.edge !== false) b.ops.push((P) => { for (const f of 'FBLR') { const F = P[f]; for (let x = 0; x < F.w; x++) { F.set(x, F.h - 1, sh(rgb(col), 0.72)); if (F.h > 2) F.set(x, 0, sh(rgb(col), 1.1)); } } }); return b; }
  pack() {
    const W = 128; let x = 0, y = 0, rowH = 0;
    const order = this.boxes.slice().sort((a, b) => b.th - a.th);
    for (const b of order) { if (x + b.tw > W) { x = 0; y += rowH; rowH = 0; } b.ax = x; b.ay = y; x += b.tw; rowH = Math.max(rowH, b.th); }
    let H = 32; while (H < y + rowH) H *= 2;
    this.W = W; this.H = H;
  }
  render() {
    this.pack();
    const W = this.W, H = this.H, col = new Uint8ClampedArray(W * H * 4), glo = new Uint8ClampedArray(W * H * 4);
    for (let i = 3; i < glo.length; i += 4) glo[i] = 255;
    const rng = this.rng;
    for (const b of this.boxes) {
      const t = b.t, X = b.ax, Y = b.ay;
      const rect = { T: [X + t[2], Y, t[0], t[2]], D: [X + t[2] + t[0], Y, t[0], t[2]], R: [X, Y + t[2], t[2], t[1]], F: [X + t[2], Y + t[2], t[0], t[1]], L: [X + 2 * t[2] + t[0], Y + t[2], t[2], t[1]], B: [X + 2 * t[2] + 2 * t[0], Y + t[2], t[0], t[1]] };
      b.rect = rect;
      const P = {};
      for (const f in rect) {
        const [fx, fy, fw, fh] = rect[f];
        const set = (x, y, c, g) => {
          x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= fw || y >= fh || !c) return;
          const i = ((fy + y) * W + fx + x) * 4; col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2]; col[i + 3] = 255;
          if (g) { const gc = Array.isArray(g) ? g : c; glo[i] = gc[0]; glo[i + 1] = gc[1]; glo[i + 2] = gc[2]; this.glow = true; } else { glo[i] = glo[i + 1] = glo[i + 2] = 0; }
        };
        const clear = (x, y) => { if (x < 0 || y < 0 || x >= fw || y >= fh) return; const i = ((fy + y) * W + fx + x) * 4; col[i + 3] = 0; };
        const get = (x, y) => { const i = ((fy + Math.min(fh - 1, Math.max(0, y))) * W + fx + Math.min(fw - 1, Math.max(0, x))) * 4; return col[i + 3] ? [col[i], col[i + 1], col[i + 2]] : null; };
        const F = P[f] = { w: fw, h: fh, f, set, get, clear,
          fill(c, jit = 0.05) { const cc = rgb(c); for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) set(x, y, sh(cc, 1 + (rng() - 0.5) * jit * 2)); },
          rect(x0, y0, w, h, c, jit = 0.04) { const cc = typeof c === 'function' ? null : rgb(c); for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, cc ? sh(cc, 1 + (rng() - 0.5) * jit * 2) : c(x, y)); },
          row(y, x0, x1, c) { for (let x = x0; x <= x1; x++) set(x, y, rgb(c)); },
        };
      }
      for (const op of b.ops) op(P, rng);
    }
    const mk = (data) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0); return cv; };
    return { map: mk(col), emissive: this.glow ? mk(glo) : null };
  }
  geometry() {
    const pos = [], nor = [], uv = [], si = [], sw = [], idx = []; const W = this.W, H = this.H;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3(), n = new THREE.Vector3();
    for (const b of this.boxes) {
      const m = [b.min[0] - b.inf, b.min[1] - b.inf, b.min[2] - b.inf], M = [b.min[0] + b.size[0] + b.inf, b.min[1] + b.size[1] + b.inf, b.min[2] + b.size[2] + b.inf];
      if (b.m) nm.getNormalMatrix(b.m);
      for (const f of 'FBLRTD') {
        if (b.skip && b.skip.includes(f)) continue;
        const F = FACES[f], [rx, ry, rw, rh] = b.rect[f], base = pos.length / 3;
        n.set(...F.n); if (b.m) n.applyMatrix3(nm).normalize();
        for (const [a, c] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          v.set(...F.p(a, c, m, M)); if (b.m) v.applyMatrix4(b.m);
          pos.push(v.x * PX, v.y * PX, v.z * PX); nor.push(n.x, n.y, n.z);
          uv.push((rx + a * rw) / W, 1 - (ry + (1 - c) * rh) / H);
          si.push(b.bone, 0, 0, 0); sw.push(1, 0, 0, 0);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx); g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData = { boxes: this.boxes.length, tris: idx.length / 3 };
    return g;
  }
}

/* ---------------- cloth patterns ---------------- */
function cloth(base, pat, seed) {
  const c = rgb(base);
  if (!pat) return (x, y, r) => sh(c, 0.96 + r() * 0.08);
  if (pat === 'check') { const d = sh(c, 0.62), l = mix(c, [255, 255, 255], 0.25); return (x, y, r) => { const a = (x % 6) < 2, b = (y % 6) < 2; return a && b ? sh(d, 0.85) : a || b ? d : ((x + y) % 6 === 3 ? l : sh(c, 0.97 + r() * 0.06)); }; }
  if (pat === 'camo') { const t = [c, sh(mix(c, [60, 70, 30], 0.35), 0.62), mix(c, [230, 220, 180], 0.3), sh(c, 0.4)]; return (x, y) => { const v = hash2(x >> 2, y >> 2, seed) * 0.6 + hash2(x >> 1, y >> 1, seed + 7) * 0.4; return t[v < 0.3 ? 1 : v < 0.55 ? 0 : v < 0.75 ? 2 : 3]; }; }
  if (pat === 'floral') { const w = [250, 245, 230], ye = [255, 214, 60], d = sh(c, 0.75); return (x, y, r) => { const cx = x % 6, cy = y % 6, cell = hash2(Math.floor(x / 6), Math.floor(y / 6), seed); if (cell < 0.55 && ((cx === 2 && cy >= 1 && cy <= 3) || (cy === 2 && cx >= 1 && cx <= 3))) return cx === 2 && cy === 2 ? ye : w; if (cell > 0.8 && cx === 4 && cy === 4) return d; return sh(c, 0.96 + r() * 0.08); }; }
  if (pat === 'leather') return (x, y, r) => { const v = hash2(x, y, seed); return v > 0.93 ? sh(c, 1.35) : sh(c, 0.9 + r() * 0.16); };
  if (pat === 'denim') return (x, y, r) => ((x + y) % 3 === 0 ? sh(mix(c, [200, 210, 230], 0.18), 1) : sh(c, 0.92 + r() * 0.1));
  if (pat === 'knit') return (x, y) => (x % 2 ? sh(c, 0.84) : c);
  if (pat === 'plastic') return (x, y, r) => sh(c, 1.02 + r() * 0.04);
  return (x, y, r) => sh(c, 0.96 + r() * 0.08);
}
const SIDES = 'FLBR';

// held poses: arm rotations [x, y, z] (x < 0 lifts the arm forward, z opens it sideways: armR negative, armL positive)
export const HOLD = {
  none: { R: [0, 0, -0.06], L: [0, 0, 0.06] },
  shoulder: { R: [-2.75, 0, -0.25], L: [0, 0, 0.08] },
  crossed: { R: [-1.0, 0.25, 0.62], L: [-0.85, -0.25, -0.62] },
  hips: { R: [0.12, 0, -0.62], L: [0.12, 0, 0.62] },
  shield: { R: [-0.3, 0, -0.1], L: [-0.55, 0.2, 0.05] },
  pistol: { R: [-1.5, -0.08, 0], L: [-1.2, 0, -0.42] },
  shrug: { R: [-0.35, 0, -0.5], L: [-0.35, 0, 0.5] },
  twohand: { R: [-0.75, 0.2, 0.3], L: [-0.8, -0.2, -0.38] },
  rifle: { R: [-0.95, 0.25, 0.38], L: [-1.25, -0.2, -0.55] },
  carry: { R: [-0.7, 0, 0.12], L: [-0.7, 0, -0.12] },
  drink: { R: [-2.05, 0, 0.45], L: [0, 0, 0.06] },
  syringe: { R: [-1.4, 0, 0.3], L: [-0.9, 0, -0.35] },
  radio: { R: [-0.1, 0, -0.06], L: [-2.6, 0.2, -0.75] },
  map: { R: [-1.15, 0, 0.12], L: [-1.15, 0, -0.12] },
  binoc: { R: [-2.4, 0, 0.55], L: [-2.4, 0, -0.55] },
  'zombie-forward': { R: [-1.45, 0, 0.05], L: [-1.45, 0, -0.05] },
  'zombie-one': { R: [-0.2, 0, -0.1], L: [-1.45, 0, -0.05] },
  'zombie-dangle': { R: [-0.35, 0, -0.12], L: [-0.25, 0, 0.12] },
  'zombie-limp': { R: [-0.25, 0, -0.08], L: [-1.4, 0, 0] },
};
export const GUNS = new Set(['rifle', 'shotgun', 'smg', 'flamer']);
export function holdOf(meta, sp) {
  const p = sp.pose, pr = meta.props;
  if (meta.zombie) return HOLD[p] || HOLD['zombie-forward'];
  if (pr.includes('binoculars')) return HOLD.binoc;
  if (pr.includes('map')) return HOLD.map;
  if (pr.some((k) => GUNS.has(k)) && p !== 'pistol' && p !== 'shoulder') return HOLD.rifle;
  if (p && HOLD[p]) return HOLD[p];
  if (pr.includes('shoulderSword') || pr.includes('log')) return HOLD.shoulder;
  if (pr.includes('mug')) return HOLD.drink;
  if (pr.includes('radio')) return HOLD.radio;
  return HOLD.none;
}


/* ---------------- the character ---------------- */
// rows: chibi heights -> texel rows of each body box (top = 0)
const legRow = (y) => Math.round(Math.max(0, Math.min(24, (0.99 - y) / 0.99 * 24)));
const torRow = (y) => Math.round(Math.max(0, Math.min(24, (1.66 - y) / 0.66 * 24)));
const armRow = (y) => Math.round(Math.max(0, Math.min(24, (1.69 - y) / 0.705 * 24)));

export function buildBlock(sp) {
  const K = new Kit(sp.id), rng = K.rng;
  const items = (list) => (list || []).map(([k, o]) => ({ k, o: o || {} }));
  const wear = items(sp.wear), head = items(sp.head), props = items(sp.props);
  const has = (list, k) => list.find((w) => w.k === k);
  const zombie = sp.zombie || null;
  const skin = rgb(sp.skin || 0xe9b58f);
  const body = sp.body || {};
  const slim = (body.bust || 0) > 0 || (body.k || 1) < 0.96;
  const aw = slim ? 3 : 4;
  const top = sp.top || { kind: 'tee', col: 0xcccccc }, bot = sp.bottom || { kind: 'pants', col: 0x333338 };
  const shoes = sp.shoes || { col: 0x2a2a2e };
  const glove = has(wear, 'gloves'), gloveCol = glove ? rgb(glove.o.col || 0x1c1c20) : null;
  const hairCol = sp.hair ? rgb(sp.hair.col) : null;
  const dirt = sp.dirt || 0;
  const seed = (rng() * 1e6) | 0;
  const meta = { aw, pose: sp.pose || null, zombie: !!zombie, props: props.map((p) => p.k), slim };

  /* ---- legs ---- */
  const overalls = has(wear, 'overalls');
  const legBox = {}, legOv = {};
  for (const s of [-1, 1]) {
    const bone = s < 0 ? 'legR' : 'legL', x0 = s < 0 ? -4 : 0;
    const L = legBox[s] = K.box('leg', bone, [x0, 0, -2], [4, 12, 4], { fill: skin });
    legOv[s] = K.box('legOv', bone, [x0, 0, -2], [4, 12, 4], { inf: 0.25, alpha: true });
    K.paint(L, (P, r) => {
      const k = bot.kind || 'pants', skirt = k === 'skirt' || k === 'dress';
      const end = legRow(bot.end || (k === 'shorts' ? 0.6 : k === 'capri' ? 0.36 : 0.15));
      const lc = overalls ? overalls.o.col : bot.legs ? bot.legs[s > 0 ? 0 : 1] : bot.col;
      const cf = cloth(lc, bot.pat, seed + s);
      // skin first: darker toward the bottom and on the inner face
      for (const f of 'FLBRT') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, sh(skin, 0.98 - y * 0.004 + (r() - 0.5) * 0.04)); }
      if (!skirt) {
        for (const f of 'FLBRT') { const F = P[f], yEnd = f === 'T' ? F.h : end; for (let y = 0; y < yEnd; y++) for (let x = 0; x < F.w; x++) F.set(x, y, sh(cf(x + (f === 'L' ? 8 : f === 'B' ? 16 : f === 'R' ? 24 : 0), y, r), 1 - y * 0.006)); }
        if (bot.stripes) { const [a, b, n] = bot.stripes; const step = Math.max(2, Math.round(end / (n || 7))); for (const f of SIDES) for (let y = 0; y < end; y++) if (Math.floor(y / step) % 2) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, rgb(b)); else for (let x = 0; x < P[f].w; x++) P[f].set(x, y, rgb(a)); }
        // hem: a darker fold just above the end (or the cuff colour)
        if (end < 23) for (const f of SIDES) { const F = P[f]; for (let x = 0; x < F.w; x++) { F.set(x, end - 1, bot.cuff ? rgb(bot.cuff) : sh(rgb(lc), 0.78)); if (bot.cuff) F.set(x, end - 2, rgb(bot.cuff)); } }
        // the crease down the front, pocket line on the side
        if (end > 6) { for (let y = 2; y < end - 1; y++) P.F.set(s < 0 ? 5 : 2, y, sh(rgb(lc), 0.86)); P[s < 0 ? 'R' : 'L'].row(3, 1, 6, sh(rgb(lc), 0.8)); }
        if (bot.rip && (bot.rip === 2 || bot.rip === s)) P.F.rect(2, 11, 4, 3, skin);
      }
      // socks
      if (sp.socks) { const sy = legRow(sp.socksY || 0.42); for (const f of SIDES) for (let y = Math.min(sy, 20); y < 24; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, sh(rgb(sp.socks), 0.97 + (y % 3 === 0 ? -0.08 : 0))); }
      // shoes
      const so = s < 0 && shoes.right ? Object.assign({}, shoes, shoes.right) : shoes;
      const kind = so.kind || 'shoe', sc = rgb(so.col || 0x2a2a2e), sole = rgb(so.sole || (kind === 'boot' ? 0x151515 : sh(sc, 0.6)));
      const hgt = kind === 'welly' ? 9 : kind === 'boot' ? 7 : 4;
      for (const f of SIDES) { const F = P[f]; for (let y = 24 - hgt; y < 24; y++) for (let x = 0; x < F.w; x++) F.set(x, y, y >= 23 ? sole : sh(sc, (y === 24 - hgt ? 1.18 : 1) * (0.95 + r() * 0.08))); }
      P.D.fill(sole, 0.04);
      if (kind === 'boot' || kind === 'welly') for (const f of SIDES) for (let x = 0; x < P[f].w; x++) P[f].set(x, 24 - hgt + 1, sh(sc, 0.75));
      if (so.lace || kind === 'sneaker' || kind === 'shoe') { const lc2 = rgb(so.lace || mix(sc, [255, 255, 255], 0.45)); P.F.set(3, 20, lc2); P.F.set(4, 20, lc2); P.F.set(3, 21, lc2); P.F.set(4, 21, lc2); }
      if (kind === 'boot') { P.F.set(2, 18, sh(sc, 1.3)); P.F.set(5, 18, sh(sc, 1.3)); }
      // grime toward the shoes
      if (dirt > 0) for (const f of SIDES) { const F = P[f]; for (let i = 0; i < dirt * 30; i++) { const x = Math.floor(r() * F.w), y = 12 + Math.floor(r() * 12); const c = F.get(x, y); if (c) F.set(x, y, sh(mix(c, [70, 55, 40], 0.4), 0.85)); } }
    });
    // skirt / dress, apron and coat tails hang on the leg's outer layer
    K.paint(legOv[s], (P) => {
      const k = bot.kind;
      if (k === 'skirt' || k === 'dress') { const end = legRow(bot.end || 0.5), cf = cloth(bot.col, bot.pat, seed); for (const f of 'FLBR') for (let y = 0; y < end; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, sh(cf(x, y, rng), y === end - 1 ? 0.8 : 1)); }
      const coat = has(wear, 'coat');
      if (coat) { const end = legRow(coat.o.end || 0.52), cc = cloth(coat.o.col, coat.o.pat, seed); for (const f of 'LBR') for (let y = 0; y < end; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, sh(cc(x, y, rng), y === end - 1 ? 0.75 : 1)); const fx = s < 0 ? [0, 1, 2] : [5, 6, 7]; for (let y = 0; y < end; y++) for (const x of fx) P.F.set(x, y, sh(cc(x, y, rng), y === end - 1 ? 0.75 : 1)); }
      const ap = has(wear, 'apron');
      if (ap) { const end = legRow(ap.o.end || 0.5), ac = cloth(ap.o.col, ap.o.pat, seed); for (let y = 0; y < end; y++) for (let x = 0; x < 8; x++) P.F.set(x, y, sh(ac(x, y, rng), y === end - 1 ? 0.78 : 1)); }
      // knee pads, bandages, leg bands, wounds
      for (const w of wear) {
        const o = w.o;
        if (w.k === 'kneepad' && (o.side || 1) === s) { P.F.rect(1, 9, 6, 5, o.col || 0x2a2a2e); P.F.row(9, 1, 6, sh(rgb(o.col || 0x2a2a2e), 1.25)); for (const f of 'LRB') P[f].row(11, 0, 7, o.strap || 0x1c1c20); }
        if ((w.k === 'bandage' && o.on !== 'arm' && (o.side || 1) === s) || (w.k === 'legband' && (o.side || 1) === s)) {
          const y0 = legRow(o.y1 || (w.k === 'bandage' ? 0.58 : 0.36)), y1 = Math.max(y0 + 2, legRow(o.y0 || (w.k === 'bandage' ? 0.42 : 0.3)));
          const c = rgb(o.col || (w.k === 'bandage' ? 0xdcd6c6 : 0xd02a2a));
          for (const f of SIDES) for (let y = y0; y < y1; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, w.k === 'bandage' && (x + y) % 4 === 0 ? sh(c, 0.82) : c);
        }
      }
      if (zombie && zombie.wounds) for (const wd of zombie.wounds) if ((wd.at === 'knee' || wd.at === 'shin') && wd.side === s) { const y = wd.at === 'knee' ? 11 : 16; P.F.rect(2, y, 4, 3, 0x8a1010); P.F.set(3, y + 1, [255, 90, 50], [200, 40, 20]); P.F.set(4, y + 1, [255, 140, 70], [220, 60, 20]); }
    });
  }
  for (const w of wear) if ((w.k === 'holster' || w.k === 'pouch')) { const s = w.o.side || (w.k === 'holster' ? -1 : 1); const x0 = s < 0 ? -5.2 : 4.2; const c = w.o.col || (w.k === 'holster' ? 0x2a2018 : 0x3a3a40); K.solid(w.k, s < 0 ? 'legR' : 'legL', [x0, 7, -1.2], [1, 3, 2.4], c); if (w.k === 'holster') K.solid('grip', s < 0 ? 'legR' : 'legL', [x0 + 0.1, 9.6, -0.8], [0.8, 1.4, 1], 0x1a1a1c); }

  /* ---- torso ---- */
  const T = K.box('torso', 'body', [-4, 12, -2], [8, 12, 4], { fill: skin });
  const TO = K.box('torsoOv', 'body', [-4, 12, -2], [8, 12, 4], { inf: 0.25, alpha: true });
  K.paint(T, (P, r) => {
    const k = top.kind || 'tee';
    for (const f of 'FLBRTD') P[f].fill(skin, 0.03);
    const y0 = torRow(top.y0 || (k === 'crop' ? 1.24 : 0.95));
    const cf = top.stripes ? null : cloth(top.col || 0xcccccc, top.pat, seed + 3);
    if (k !== 'bare') {
      for (const f of 'FLBRT') { const F = P[f]; for (let y = 0; y < (f === 'T' ? F.h : Math.min(24, y0)); y++) for (let x = 0; x < F.w; x++) {
        let c = top.stripes ? rgb(Math.floor(y / Math.max(2, Math.round(24 / (top.stripes[2] || 8)))) % 2 ? top.stripes[1] : top.stripes[0]) : cf(x + (f === 'L' ? 16 : f === 'B' ? 24 : f === 'R' ? 40 : 0), y, r);
        if (k === 'tank' && (f === 'F' || f === 'B') && y < 5 && (x < 3 || x > 12)) continue; // shoulders bare
        if (k === 'tank' && (f === 'L' || f === 'R') && y < 6) continue;
        if (k === 'tank' && f === 'T' && (x < 3 || x > 12)) continue;
        F.set(x, y, sh(c, 1.02 - y * 0.006));
      } }
      if (k === 'tee' || k === 'crop' || k === 'tank') { P.F.set(7, 0, skin); P.F.set(8, 0, skin); if (k !== 'crop') { P.F.set(6, 0, skin); P.F.set(9, 0, skin); P.F.set(7, 1, skin); P.F.set(8, 1, skin); } }
      if (k === 'long' || k === 'rolled') { const c = rgb(top.col || 0xcccccc); P.F.row(0, 5, 10, sh(c, 0.8)); }
      // hem shadow
      if (y0 < 24) for (const f of SIDES) for (let x = 0; x < P[f].w; x++) P[f].set(x, y0 - 1, sh(P[f].get(x, y0 - 1) || skin, 0.82));
    } else { P.F.set(5, 6, sh(skin, 0.85)); P.F.set(10, 6, sh(skin, 0.85)); for (let y = 12; y < 19; y += 3) { P.F.row(y, 5, 6, sh(skin, 0.9)); P.F.row(y, 9, 10, sh(skin, 0.9)); } }
    // trousers waistband (or overall bib base)
    const wb = torRow(bot.y1 || 1.08), pc = rgb(overalls ? overalls.o.col : (bot.legs ? bot.legs[0] : bot.col) || 0x333338);
    for (const f of 'FLBRD') { const F = P[f]; for (let y = f === 'D' ? 0 : wb; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, sh(pc, 0.95 + r() * 0.06)); }
    if (bot.kind === 'dress') for (const f of 'FLBR') for (let y = 0; y < 24; y++) for (let x = 0; x < P[f].w; x++) if (!(k === 'tank' && y < 4 && (x < 3 || x > 12))) P[f].set(x, y, cloth(bot.col, bot.pat, seed)(x, y, r));
    if (top.collar) { const cc = rgb(top.collarCol || top.col); P.F.rect(4, 0, 3, 2, sh(cc, 1.1)); P.F.rect(9, 0, 3, 2, sh(cc, 1.1)); }
    // flat items on the shirt
    for (const w of wear) {
      const o = w.o;
      if (w.k === 'tie') { const c = rgb(o.col || 0xd02a2a); P.F.rect(7, 0, 2, 2, sh(c, 0.85)); for (let y = 2; y < 15; y++) { P.F.set(7, y, c); P.F.set(8, y, sh(c, 0.9)); } P.F.set(7, 15, sh(c, 0.8)); }
      if (w.k === 'bowtie') { const c = rgb(o.col || 0x111111); P.F.rect(5, 0, 2, 2, c); P.F.rect(9, 0, 2, 2, c); P.F.rect(7, 0, 2, 2, sh(c, 1.4)); }
      if (w.k === 'braces') { const c = rgb(o.col); for (let y = 0; y < wb; y++) { P.F.set(4, y, c); P.F.set(11, y, c); P.B.set(5 + Math.floor(y / 6), y, c); P.B.set(10 - Math.floor(y / 6), y, c); } P.T.row(1, 3, 4, c); P.T.row(1, 11, 12, c); }
      if (w.k === 'stethoscope') { const c = rgb(o.col || 0x1a1a1e); for (let y = 0; y < 9; y++) { P.F.set(4 + (y > 6 ? 1 : 0), y, c); P.F.set(11, y, c); } P.F.rect(4, 9, 2, 2, [190, 194, 200]); }
      if (w.k === 'collar') { const c = rgb(o.col); P.F.rect(4, 0, 3, o.open ? 3 : 2, sh(c, 1.08)); P.F.rect(9, 0, 3, o.open ? 3 : 2, sh(c, 1.08)); for (const f of 'LRB') P[f].row(0, 0, P[f].w - 1, c); }
    }
    if (body.belly >= 0.06) { for (let y = 12; y < 19; y++) P.F.set(2 + (y - 12 > 3 ? 0 : 1), y, sh(P.F.get(2, y) || skin, 0.86)); }
    if (dirt > 0) for (const f of SIDES) { const F = P[f]; for (let i = 0; i < dirt * 18; i++) { const x = Math.floor(r() * F.w), y = Math.floor(r() * 24); const c = F.get(x, y); if (c) F.set(x, y, sh(mix(c, [80, 64, 48], 0.35), 0.9)); } }
  });
  K.paint(TO, (P, r) => {
    for (const w of wear) {
      const o = w.o;
      if (w.k === 'vest' || w.k === 'coat') {
        const y0 = torRow(o.y1 || 1.66), y1 = torRow(o.y0 || 0.98), gap = o.open ? Math.max(1, Math.round(o.open * 7)) : 0, cf = cloth(o.col, o.pat, seed + 9);
        const cx0 = 8 - gap, cx1 = 8 + gap - 1;
        for (const f of 'FLBR') { const F = P[f]; for (let y = y0; y < Math.min(24, y1 + (o.flare ? 1 : 0)); y++) for (let x = 0; x < F.w; x++) { if (f === 'F' && gap && x >= cx0 && x <= cx1 && !(o.collar && y < 2)) continue; F.set(x, y, sh(cf(x, y, r), y === y1 - 1 ? 0.82 : 1)); } }
        if (y0 === 0) P.T.fill(o.col, 0.04);
        if (gap) for (let y = y0; y < y1; y++) { P.F.set(cx0 - 1, y, sh(rgb(o.col), 0.75)); P.F.set(cx1 + 1, y, sh(rgb(o.col), 0.75)); }
        if (o.collar || w.k === 'coat') { const c = sh(rgb(o.col), 1.15); for (let y = 0; y < 5; y++) { P.F.set(cx0 - 1 - Math.max(0, 2 - y), y, c); P.F.set(cx1 + 1 + Math.max(0, 2 - y), y, c); } }
        if (o.buttons) { const c = rgb(o.buttons); for (let i = 0; i < 4; i++) { const y = y0 + 3 + i * 4; if (y >= y1) break; for (const x of o.double ? [cx0 - 3, cx1 + 3] : [cx0 - 2]) P.F.set(x, y, c); } }
        if (o.pocket) { const c = rgb(o.pocket); P.F.rect(2, 6, 3, 3, c); P.F.rect(11, 6, 3, 3, c); P.F.row(6, 2, 4, sh(c, 0.75)); P.F.row(6, 11, 13, sh(c, 0.75)); }
        if (o.stripes) for (const ys of o.stripes.ys) { const y = torRow(ys + 0.04); for (const f of 'FLBR') for (let x = 0; x < P[f].w; x++) if (!(f === 'F' && gap && x >= cx0 && x <= cx1)) { P[f].set(x, y, rgb(o.stripes.col), sh(rgb(o.stripes.col), 0.25)); P[f].set(x, y + 1, rgb(o.stripes.col), sh(rgb(o.stripes.col), 0.25)); } }
      }
      if (w.k === 'apron') { const y0 = torRow(o.y1 || 1.5), cf = cloth(o.col, o.pat, seed + 11), wd = Math.round((o.w || 1.05) * 6); for (let y = y0; y < 24; y++) for (let x = 8 - wd; x < 8 + wd; x++) P.F.set(x, y, cf(x, y, r)); const sc = rgb(o.strap || o.col); for (let y = 0; y < y0; y++) { P.F.set(8 - wd + 1, y, sc); P.F.set(8 + wd - 2, y, sc); } P.T.row(1, 4, 5, sc); P.T.row(1, 10, 11, sc); const yb = torRow(1.06); for (const f of 'LBR') P[f].row(yb, 0, P[f].w - 1, sc); }
      if (w.k === 'overalls') { const c = rgb(o.col), y0 = torRow(1.4); for (let y = y0; y < 24; y++) for (let x = 2; x < 14; x++) P.F.set(x, y, sh(c, 0.97 + r() * 0.06)); for (let y = 0; y < y0; y++) { P.F.set(3, y, c); P.F.set(12, y, c); P.B.set(4 + Math.floor(y / 5), y, c); P.B.set(11 - Math.floor(y / 5), y, c); } for (const f of 'LBR') for (let y = torRow(1.14); y < 24; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, c); P.F.set(3, y0, rgb(o.button || 0xd8b040)); P.F.set(12, y0, rgb(o.button || 0xd8b040)); if (o.pocket) P.F.rect(6, y0 + 3, 4, 3, o.pocket); P.T.row(1, 3, 3, c); P.T.row(1, 12, 12, c); }
      if (w.k === 'carrier') { const c = rgb(o.col), y0 = torRow(1.56), y1 = torRow(1.06); for (const f of 'FB') for (let y = y0; y < y1; y++) for (let x = 1; x < 15; x++) P[f].set(x, y, sh(c, 0.95 + r() * 0.08)); for (const f of 'LR') for (let y = torRow(1.18); y < y1; y++) for (let x = 0; x < 8; x++) P[f].set(x, y, sh(c, 0.85)); for (let y = 0; y < y0; y++) { P.F.set(3, y, c); P.F.set(12, y, c); P.B.set(3, y, c); P.B.set(12, y, c); } P.T.row(1, 3, 3, c); P.T.row(1, 12, 12, c); if (o.patch) P.F.rect(9, y0 + 2, 4, 2, o.patch); }
      if (w.k === 'belt') { const y = torRow((o.y || 1.0) + 0.02), c = rgb(o.col || 0x1a1410); for (const f of 'FLBR') for (let x = 0; x < P[f].w; x++) { P[f].set(x, y, c); P[f].set(x, y + 1, sh(c, 0.85)); } if (o.buckle !== false) { const bc = rgb(o.buckle || 0xc89a30); P.F.rect(7, y, 2, 2, bc); P.F.set(7, y, sh(bc, 1.25)); } }
      if (w.k === 'strap') { const c = rgb(o.col || 0x4a3020), s = o.side || 1, wd = o.w && o.w < 0.015 ? 1 : 2; for (let y = 0; y < 22; y++) { const x = s > 0 ? Math.round(13 - y * 0.55) : Math.round(2 + y * 0.55); for (let k = 0; k < wd; k++) { P.F.set(x + k, y, c); P.B.set(15 - x - k, y, c); } if (o.shells && y % 3 === 1) P.F.set(x + wd, y, [200, 40, 30]); } if (o.pouch) P.F.rect(s > 0 ? 3 : 10, 16, 3, 3, o.pouch); P.T.row(1, s > 0 ? 12 : 3, s > 0 ? 13 : 4, c); }
      if (w.k === 'badge' || w.k === 'number') {
        const x = w.k === 'number' ? 0 : (o.x === undefined ? 0.11 : o.x), y = torRow(w.k === 'number' ? (o.y || 1.15) : (o.y || 1.44));
        const c = rgb(w.k === 'number' ? 0xf2f2f2 : (o.col || 0xd8a830)), cx = Math.round(8 + x * 30), ww = w.k === 'number' ? 6 : Math.max(2, Math.round((o.w || 0.05) * 40)), hh = w.k === 'number' ? 5 : Math.max(2, Math.round((o.h || 0.05) * 40));
        P.F.rect(cx - (ww >> 1), y - (hh >> 1), ww, hh, c); if (o.metal !== false && w.k === 'badge') P.F.set(cx - (ww >> 1), y - (hh >> 1), sh(c, 1.3));
        if (w.k === 'number') { const d = [40, 40, 44]; for (let i = 0; i < 3; i++) P.F.set(cx - 1 + i, y - 2, d); P.F.set(cx + 1, y - 1, d); P.F.set(cx, y, d); P.F.set(cx, y + 1, d); const bk = [3, 4, 5, 6, 7, 8, 9]; for (const i of bk.slice(0, 4)) P.B.set(6 + (i % 4), 6, c); for (let yy = 6; yy < 13; yy++) { P.B.set(9, yy, c); } }
      }
      if (w.k === 'scarf') { const c = rgb(o.col); for (const f of 'FLBR') for (let y = 0; y < 3; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, sh(c, y === 2 ? 0.85 : 1)); P.T.fill(o.col); if (o.tail !== false) for (let y = 3; y < 10; y++) { P.F.set(10, y, c); P.F.set(11, y, sh(c, 0.9)); } }
    }
  });
  if (body.belly >= 0.05) { const d = body.belly >= 0.1 ? 1.5 : 1; K.paint(K.box('belly', 'body', [-3.5, 13, 2], [7, 6, d], {}), (P, r) => { const k = top.kind; const below = torRow(1.08); for (const f of 'FBLRTD') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) { const ty = 10 + y; const c = k === 'bare' || (k === 'crop' && ty < 20) ? skin : ty * 1 + 2 >= below + 1 ? rgb(bot.col || 0x333338) : rgb(top.stripes ? top.stripes[Math.floor(ty / 3) % 2] : top.col || 0xcccccc); F.set(x, y, sh(c, 0.97 + r() * 0.05)); } } const v = has(wear, 'vest') || has(wear, 'apron') || has(wear, 'overalls'); if (v && (v.k !== 'vest' || !v.o.open)) for (const f of 'FTD') P[f].fill(v.o.col); else if (v && v.k === 'vest') for (const f of 'FTD') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (x < 4 || x > F.w - 5) F.set(x, y, rgb(v.o.col)); } }); }

  /* ---- arms ---- */
  const sleeveEnd = (k) => k === 'tank' || k === 'bare' ? 0 : k === 'tee' || k === 'crop' ? armRow(1.42) : k === 'rolled' ? armRow(1.2) : 19;
  for (const s of [-1, 1]) {
    const bone = s < 0 ? 'armR' : 'armL', x0 = s < 0 ? -4 - aw : 4;
    const A = K.box('arm', bone, [x0, 12, -2], [aw, 12, 4], { fill: skin });
    const AO = K.box('armOv', bone, [x0, 12, -2], [aw, 12, 4], { inf: 0.25, alpha: true });
    K.paint(A, (P, r) => {
      const k = top.kind || 'tee', se = sleeveEnd(k);
      for (const f of 'FLBRTD') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, sh(skin, 1 - y * 0.004 + (r() - 0.5) * 0.04)); }
      const sc = top.stripes ? null : cloth(top.sleeve || top.col || 0xcccccc, top.pat, seed + 5);
      if (se) {
        for (const f of 'FLBR') for (let y = 0; y < se; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, top.stripes ? rgb(Math.floor(y / 3) % 2 ? top.stripes[1] : top.stripes[0]) : sc(x, y, r));
        P.T.rect(0, 0, P.T.w, P.T.h, (x, y) => (top.stripes ? rgb(top.stripes[0]) : sc(x, y, r)));
        const cc = top.cuff ? rgb(top.cuff) : sh(rgb(top.sleeve || top.col || 0xcccccc), 0.8);
        for (const f of 'FLBR') for (let x = 0; x < P[f].w; x++) { P[f].set(x, se - 1, cc); if (k === 'rolled') P[f].set(x, se - 2, cc); }
      }
      if (gloveCol) { for (const f of 'FLBR') for (let y = 19; y < 24; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, sh(gloveCol, y === 19 ? 1.2 : 0.95 + r() * 0.08)); P.D.fill(gloveCol); }
      else { P.D.fill(sh(skin, 0.95)); for (const f of 'FLBR') for (let x = 0; x < P[f].w; x++) P[f].set(x, 23, sh(skin, 0.86)); }
      if (dirt > 0) for (const f of SIDES) { const F = P[f]; for (let i = 0; i < dirt * 8; i++) { const x = Math.floor(r() * F.w), y = Math.floor(r() * 24); const c = F.get(x, y); if (c) F.set(x, y, sh(c, 0.85)); } }
    });
    K.paint(AO, (P) => {
      for (const w of wear) {
        const o = w.o;
        const sl = w.k === 'vest' ? o.sleeves : w.k === 'coat' ? (o.sleeves === undefined ? 1.0 : o.sleeves) : 0;
        if (sl) { const se = sl <= 1.02 ? 19 : armRow(sl), cf = cloth(o.sleeveCol || o.col, o.pat, seed + 13); for (const f of 'FLBR') for (let y = 0; y < se; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, sh(cf(x, y, rng), y === se - 1 ? 0.8 : 1)); P.T.fill(o.sleeveCol || o.col); if (o.stripes && o.stripes.arms) for (const f of 'FLBR') for (let x = 0; x < P[f].w; x++) P[f].set(x, 9, rgb(o.stripes.col), sh(rgb(o.stripes.col), 0.25)); }
        if (w.k === 'armband' && (o.side || 1) === s) { const y = armRow((o.y0 || 1.4) + 0.06), c = rgb(o.col); for (const f of 'FLBR') for (let x = 0; x < P[f].w; x++) { P[f].set(x, y, c); P[f].set(x, y + 1, sh(c, 0.85)); } }
        if (w.k === 'bandage' && o.on === 'arm' && (o.side || 1) === s) { const y0 = armRow(o.y1 || 1.18), y1 = Math.max(y0 + 2, armRow(o.y0 || 1.08)); for (const f of 'FLBR') for (let y = y0; y < y1; y++) for (let x = 0; x < P[f].w; x++) P[f].set(x, y, (x + y) % 4 ? [220, 214, 198] : [180, 174, 160]); }
        if (w.k === 'carrier' || w.k === 'tank' || w.k === 'backpack') P.T.row(1, 0, P.T.w - 1, w.o.strap || (w.k === 'carrier' ? w.o.col : 0x1a1a1c));
      }
      if (glove && glove.o.cuff) for (const f of 'FLBR') for (let x = 0; x < P[f].w; x++) P[f].set(x, 18, rgb(glove.o.cuff));
      if (zombie && zombie.wounds) for (const wd of zombie.wounds) if (wd.at === 'arm' && wd.side === s) { P.F.rect(0, 12, aw * 2, 3, 0x8a1010); P.F.set(1, 13, [255, 110, 60], [210, 50, 20]); P.F.set(2, 13, [255, 150, 80], [220, 70, 20]); }
    });
  }

  /* ---- head ---- */
  const H = K.box('head', 'head', [-4, 24, -4], [8, 8, 8], { fill: skin });
  const HO = K.box('headOv', 'head', [-4, 24, -4], [8, 8, 8], { inf: 0.5, alpha: true });
  const brow = rgb((sp.face && sp.face.brow) || (hairCol ? sh(hairCol, 0.8) : sh(skin, 0.55)));
  const covers = (k) => head.some((h) => h.k === k);
  const fullMask = covers('balaclava') || covers('welding') || head.some((h) => h.k === 'gasmask' && h.o.kind === 'full') || head.some((h) => h.k === 'helmet' && h.o.kind === 'bike');
  K.paint(H, (P, r) => {
    for (const f of 'FLBRTD') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, sh(skin, 1.02 - (f === 'D' ? 0.15 : 0) - (y > 13 && f !== 'T' ? 0.05 : 0) + (r() - 0.5) * 0.035)); }
    const F = P.F;
    // ears
    for (const f of 'LR') { P[f].rect(6, 7, 3, 4, sh(skin, 0.88)); P[f].rect(7, 8, 1, 2, sh(skin, 0.74)); }
    // face: brows, eyes (white + pupil), nose shadow, mouth
    if (zombie) {
      const ec = { white: [245, 245, 235], orange: [255, 150, 30], red: [255, 50, 40], pink: [255, 120, 200] }[zombie.eyes || 'white'];
      const glow = zombie.eyes && zombie.eyes !== 'white';
      for (const [x0, side] of [[2, -1], [9, 1]]) { const big = zombie.big === side ? 1 : 0; F.rect(x0 - big, 6 - big, 5 + big, 4 + big, sh(skin, 0.55)); F.rect(x0 + 1 - big, 7 - big, 3 + big, 2 + big, ec); for (let y = 7 - big; y < 9; y++) for (let x = x0 + 1 - big; x < x0 + 4; x++) F.set(x, y, ec, glow ? sh(ec, 0.9) : 0); F.set(x0 + 2, 8, [20, 16, 16]); }
      F.rect(4, 11, 8, 4, [50, 16, 18]); for (let x = 4; x < 12; x++) { if (x % 2 === 0) F.set(x, 11, [235, 230, 200]); if (x % 3 === 0) F.set(x, 14, [225, 220, 190]); }
      F.row(10, 3, 12, sh(skin, 0.78));
      if (zombie.brain) { P.T.rect(1, 1, 9, 9, (x, y) => ((x * 3 + y * 5) % 7 < 2 ? [190, 80, 110] : [235, 140, 165])); }
    } else {
      F.row(6, 3, 5, brow); F.row(6, 10, 12, brow);
      const eye = [36, 26, 22], wh = [246, 244, 240];
      F.set(3, 8, wh); F.set(3, 9, wh); F.set(4, 8, eye); F.set(5, 8, eye); F.set(4, 9, sh(eye, 1.6)); F.set(5, 9, eye);
      F.set(12, 8, wh); F.set(12, 9, wh); F.set(10, 8, eye); F.set(11, 8, eye); F.set(10, 9, eye); F.set(11, 9, sh(eye, 1.6));
      F.set(7, 11, sh(skin, 0.82)); F.set(8, 11, sh(skin, 0.82)); F.row(10, 7, 8, sh(skin, 0.93));
      F.row(13, 6, 9, sh(skin, 0.6)); F.set(5, 12, sh(skin, 0.85)); F.set(10, 12, sh(skin, 0.85));
      if (lum(skin) < 0.35) { F.row(13, 6, 9, sh(skin, 0.5)); }
    }
    // hair on the base head
    if (sp.hair) {
      const st = sp.hair.style || 'short', c = hairCol, hc = (x, y) => sh(c, 0.92 + ((x * 7 + y * 3) % 5) * 0.035);
      const paintF = (rows) => { for (let x = 0; x < 16; x++) for (let y = 0; y < rows(x); y++) F.set(x, y, hc(x, y)); };
      P.T.rect(0, 0, 16, 16, hc);
      const fr = { short: 3, buzz: 2, quiff: 3, bob: 4, long: 3, pony: 3, side: 3, spiky: 3, flattop: 3 }[st] || 3;
      const sideRows = { buzz: 5, short: 6, quiff: 6, side: 6, spiky: 6, flattop: 6, pony: 7, bob: 14, long: 16 }[st] || 6;
      const back = { buzz: 10, short: 12, quiff: 12, side: 12, spiky: 12, flattop: 12, pony: 13, bob: 15, long: 16 }[st] || 12;
      if (st === 'side') paintF((x) => (x < 10 ? 5 - (x > 7 ? 1 : 0) : 3));
      else if (st === 'bob' || st === 'long') paintF((x) => (x < 2 || x > 13 ? (st === 'long' ? 16 : 13) : x === 2 || x === 13 ? 6 : fr + ((x + 1) % 4 === 0 ? 1 : 0)));
      else paintF((x) => fr + ((x * 5) % 7 === 0 ? 1 : 0));
      for (const f of 'LR') { const S2 = P[f]; for (let x = 0; x < 16; x++) { const front = f === 'L' ? x : 15 - x; const rows = front < 2 && sideRows < 10 ? sideRows + 3 : front < 6 && sideRows < 10 ? sideRows - 1 : sideRows; for (let y = 0; y < rows; y++) S2.set(x, y, hc(x, y)); } if (sideRows < 10) S2.rect(6, 7, 3, 4, sh(skin, 0.88)); }
      for (let x = 0; x < 16; x++) for (let y = 0; y < back; y++) P.B.set(x, y, hc(x, y));
      if (st === 'buzz') for (const f of 'FLBRT') { const Fh = P[f]; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const cc = Fh.get(x, y); if (cc && Math.abs(cc[0] - c[0]) < 40 && (x + y * 3) % 3 === 0) Fh.set(x, y, mix(cc, skin, 0.45)); } }
    } else if (!fullMask) { for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) P.T.set(x, y, sh(skin, 1.05 + (x === 0 || y === 0 ? 0 : (hash2(x, y, seed) - 0.5) * 0.06))); }
    // beards
    if (sp.beard) {
      const st = sp.beard.style, c = rgb(sp.beard.col), bc = (x, y) => sh(c, 0.9 + ((x * 3 + y * 7) % 5) * 0.04);
      if (st === 'full') { for (let y = 10; y < 16; y++) for (let x = 0; x < 16; x++) if (!(y === 13 && x >= 6 && x <= 9) && !(y === 10 && x > 4 && x < 11) && !(y === 10 && (x < 1 || x > 14))) F.set(x, y, bc(x, y)); for (let y = 8; y < 10; y++) { F.set(0, y, bc(0, y)); F.set(15, y, bc(15, y)); } F.row(13, 6, 9, [70, 30, 30]); for (const f of 'LR') for (let y = 8; y < 16; y++) for (let x = 0; x < 6; x++) P[f].set(f === 'L' ? x : 15 - x, y, bc(x, y)); P.D.rect(0, 8, 16, 8, bc); }
      if (st === 'short') { for (let y = 12; y < 16; y++) for (let x = 1; x < 15; x++) if (!(y === 13 && x >= 6 && x <= 9)) F.set(x, y, bc(x, y)); F.row(11, 5, 10, bc(5, 11)); for (const f of 'LR') for (let y = 10; y < 16; y++) for (let x = 0; x < 4; x++) P[f].set(f === 'L' ? x : 15 - x, y, bc(x, y)); }
      if (st === 'stache') { F.row(12, 4, 11, c); F.row(11, 5, 10, sh(c, 1.1)); F.set(4, 13, c); F.set(11, 13, c); }
      if (st === 'stubble') { for (let y = 10; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y * 2) % 3 === 0 && !(y === 13 && x >= 6 && x <= 9)) F.set(x, y, mix(skin, c, 0.6)); }
    }
  });

  // outer head layer: hair volume, hats, helmets, masks, glasses
  K.paint(HO, (P) => {
    const F = P.F;
    if (sp.hair && !head.some((h) => ['helmet', 'hood', 'balaclava', 'chef', 'beanie', 'hat', 'santa', 'welding'].includes(h.k))) {
      const st = sp.hair.style, c = hairCol, hc = (x, y) => sh(c, 1.0 + ((x * 5 + y * 3) % 4) * 0.04);
      if (st === 'quiff') { for (let x = 3; x < 13; x++) { F.set(x, 0, hc(x, 0)); F.set(x, 1, hc(x, 1)); } P.T.rect(2, 9, 12, 7, hc); }
      if (st === 'spiky' || st === 'flattop') { for (let x = 0; x < 16; x++) if (st === 'flattop' || x % 3 !== 1) F.set(x, 0, hc(x, 0)); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (st === 'flattop' || (x + y) % 3 !== 0) P.T.set(x, y, hc(x, y)); for (const f of 'LRB') for (let x = 0; x < 16; x++) if (st === 'flattop' || x % 3 !== 1) P[f].set(x, 0, hc(x, 0)); }
      if (st === 'bob' || st === 'long') { for (const f of 'LR') for (let y = 2; y < (st === 'long' ? 16 : 13); y++) for (let x = 0; x < 16; x++) { const front = f === 'L' ? x : 15 - x; if (front > 1) P[f].set(x, y, hc(x, y)); } for (let y = 1; y < (st === 'long' ? 16 : 14); y++) for (let x = 0; x < 16; x++) P.B.set(x, y, hc(x, y)); for (let x = 0; x < 16; x++) if (x < 7 || x > 9) F.set(x, 0, hc(x, 0)); }
    }
    for (const { k, o } of head) {
      const c = rgb(o.col || 0x3a3a40), cc = (x, y) => sh(c, 0.94 + ((x * 3 + y * 5) % 4) * 0.03);
      const crown = (rows, col = cc) => { P.T.rect(0, 0, 16, 16, col); for (const f of 'FLBR') for (let y = 0; y < rows; y++) for (let x = 0; x < 16; x++) P[f].set(x, y, col(x, y)); };
      if (k === 'cap') { crown(5); if (o.pat === 'camo') crown(5, (x, y) => cloth(o.col, 'camo', seed)(x, y, rng)); F.row(4, 0, 15, sh(c, 0.8)); P.B.rect(6, 3, 4, 2, sh(c, 0.6)); }
      if (k === 'beanie') { crown(7, (x, y) => sh(c, x % 2 ? 0.9 : 1)); const bc = rgb(o.band || o.col); for (const f of 'FLBR') for (let y = 5; y < 8; y++) for (let x = 0; x < 16; x++) P[f].set(x, y, sh(bc, x % 2 ? 0.78 : 0.92)); }
      if (k === 'beret') crown(3);
      if (k === 'helmet') {
        const kind = o.kind || 'army';
        const rows = kind === 'football' ? 6 : kind === 'bike' ? 16 : kind === 'police' ? 6 : 7;
        crown(rows, (x, y) => sh(c, (y === 0 ? 1.12 : 1) * (0.95 + ((x * 3 + y) % 3) * 0.03)));
        if (kind === 'army' || kind === 'ballistic') for (const f of 'LR') { for (let y = 7; y < 15; y++) P[f].set(f === 'L' ? 4 : 11, y, [30, 30, 30]); if (kind === 'ballistic') P[f].rect(4, 6, 8, 6, sh(c, 0.85)); }
        if (kind === 'football') { for (const f of 'LR') P[f].rect(2, 0, 14, 15, (x, y) => cc(x, y)); P.B.rect(0, 0, 16, 13, cc); for (let x = 0; x < 16; x++) F.set(x, 0, sh(c, 1.15)); const st = [235, 235, 235]; for (let y = 0; y < 9; y++) { P.T.set(7, y, st); P.T.set(8, y, st); } }
        if (kind === 'bike') { for (let y = 5; y < 13; y++) for (let x = 2; x < 14; x++) F.clear(x, y); }
        if (kind === 'fire' || kind === 'police') { const bd = rgb(o.badge || 0xe0b030); F.rect(6, 1, 4, 4, bd); F.set(6, 1, sh(bd, 1.3)); }
        if (kind === 'hard' || kind === 'miner') { for (let y = 0; y < 16; y++) { P.T.set(7, y, sh(c, 1.15)); P.T.set(8, y, sh(c, 1.15)); } }
        if (kind === 'riot') for (const f of 'LR') P[f].rect(2, 6, 12, 8, cc);
      }
      if (k === 'hat' && (o.kind === 'bucket')) crown(4, (x, y) => (o.pat ? cloth(o.col, o.pat, seed)(x, y, rng) : cc(x, y)));
      if (k === 'chef') crown(3, () => [244, 244, 240]);
      if (k === 'hood') { const vc = o.visor; for (const f of 'LRB') for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P[f].set(x, y, cc(x, y)); P.T.rect(0, 0, 16, 16, cc); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (y < 3 || x < 2 || x > 13) F.set(x, y, cc(x, y)); for (let x = 2; x < 14; x++) F.set(x, 3, sh(c, 0.75)); if (vc) { const v = rgb(vc); for (let y = 4; y < 15; y++) for (let x = 2; x < 14; x++) F.set(x, y, (x - y === -1 || x - y === 0) && y < 10 ? mix(v, [200, 240, 230], 0.5) : sh(v, 1 + (y - 4) * 0.02)); } }
      if (k === 'balaclava') { for (const f of 'LRBT') P[f].rect(0, 0, 16, 16, cc); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!(y >= 7 && y <= 10 && x >= 2 && x <= 13)) F.set(x, y, cc(x, y)); }
      if (k === 'welding') { for (const f of 'LRBT') P[f].rect(0, 0, 16, f === 'B' ? 8 : 16, cc); F.rect(0, 0, 16, 16, cc); const v = rgb(o.visor || 0x203028); F.rect(2, 7, 12, 3, v); if (o.glow) for (let x = 2; x < 14; x++) for (let y = 7; y < 10; y++) F.set(x, y, v, v); }
      if (k === 'gasmask') {
        const full = o.kind === 'full', mc = rgb(o.col || 0x4a4a4e), lens = o.redEyes ? [255, 40, 30] : rgb(o.lens || 0x2a3a40);
        const y0 = full ? 3 : 10;
        for (let y = y0; y < 16; y++) for (let x = 1; x < 15; x++) F.set(x, y, sh(mc, 0.95 + ((x + y) % 3) * 0.03));
        for (const f of 'LR') for (let y = y0; y < 16; y++) for (let x = 0; x < 4; x++) P[f].set(f === 'L' ? x : 15 - x, y, mc);
        if (full) { for (const [x0] of [[2], [9]]) { F.rect(x0, 6, 5, 4, [30, 30, 32]); F.rect(x0 + 1, 7, 3, 2, lens); if (o.redEyes) for (let x = x0 + 1; x < x0 + 4; x++) { F.set(x, 7, lens, lens); F.set(x, 8, lens, lens); } } for (const f of 'LRB') P[f].row(7, 0, 15, [24, 24, 24]); }
        else for (const f of 'LRB') P[f].row(10, 0, 15, [24, 24, 24]);
      }
      if (k === 'mask') { for (let y = 10; y < 16; y++) for (let x = 1; x < 15; x++) F.set(x, y, sh(c, y === 10 ? 1.1 : 0.96 + ((y) % 2) * 0.05)); for (const f of 'LR') for (let x = 0; x < 7; x++) P[f].set(f === 'L' ? x : 15 - x, 10, [235, 235, 235]); }
      if (k === 'bandana' || k === 'headband') { const r0 = k === 'headband' ? 3 : (o.full ? 0 : 2), r1 = k === 'headband' ? 5 : 5; if (o.full) P.T.rect(0, 0, 16, 16, cc); for (const f of 'FLBR') for (let y = r0; y < r1; y++) for (let x = 0; x < 16; x++) P[f].set(x, y, cc(x, y)); if (k === 'bandana' && (o.pat || true)) for (const f of 'FLBR') for (let x = 1; x < 16; x += 4) P[f].set(x, r0 + 1, [240, 240, 240]); }
      if (k === 'goggles') {
        const lens = rgb(o.lens || 0x2a2f36), fr = rgb(o.frame || 0x2a2a2e), y = o.up ? 2 : 7;
        for (const f of 'LRB') for (let x = 0; x < 16; x++) { P[f].set(x, y + 1, [26, 26, 28]); P[f].set(x, y + 2, [26, 26, 28]); }
        for (const x0 of [1, 9]) { F.rect(x0, y, 6, 4, fr); F.rect(x0 + 1, y + 1, 4, 2, lens); F.set(x0 + 1, y + 1, mix(lens, [255, 255, 255], 0.5)); }
        F.row(y + 1, 7, 8, fr);
      }
      if (k === 'glasses') {
        const fr = rgb(o.frame || 0x1c1c20), lens = rgb(o.lens || 0x9ac8e0);
        for (const x0 of [2, 9]) { F.row(7, x0, x0 + 4, fr); F.row(10, x0, x0 + 4, fr); for (let y = 7; y <= 10; y++) { F.set(x0, y, fr); F.set(x0 + 4, y, fr); } if (o.shades) { F.rect(x0 + 1, 8, 3, 2, lens); F.set(x0 + 1, 8, mix(lens, [255, 255, 255], 0.55)); } }
        F.row(8, 7, 8, fr); for (const f of 'LR') for (let x = 0; x < 7; x++) P[f].set(f === 'L' ? x : 15 - x, 8, fr);
      }
      if (k === 'eyepatch') { const s = o.side || 1, x0 = s > 0 ? 9 : 2; F.rect(x0, 6, 5, 5, [16, 16, 16]); for (let i = 0; i < 9; i++) F.set(s > 0 ? 9 - i : 6 + i, 6 - Math.floor(i / 2), [16, 16, 16]); for (const f of 'LRB') P[f].row(5, 0, 15, [20, 20, 20]); }
      if (k === 'earmuffs') { for (const f of 'LR') P[f].rect(5, 6, 6, 6, c); }
      if (k === 'santa') { crown(5, () => [200, 30, 34]); for (const f of 'FLBR') for (let y = 4; y < 7; y++) for (let x = 0; x < 16; x++) P[f].set(x, y, [246, 244, 238]); }
    }
  });

  /* ---- extra headgear boxes ---- */
  for (const { k, o } of head) {
    const c = o.col || 0x3a3a40;
    if (k === 'cap') { K.solid('brim', 'head', [-4.5, 29.4, 4], [9, 0.8, 4], o.brim || c); }
    if (k === 'beret') { K.solid('beret', 'head', [-4.2 + (o.side ? 1 : 0), 31.6, -4.6], [9.4, 1.6, 9.2], c); K.solid('stalk', 'head', [-0.5, 33.2, -0.5], [1, 0.8, 1], c); }
    if (k === 'beanie' && o.pom) K.solid('pom', 'head', [-1.5, 32.5, -1.5], [3, 2, 3], o.pom);
    if (k === 'helmet') {
      const kind = o.kind || 'army';
      if (kind === 'army') K.solid('rim', 'head', [-5, 28.2, -5], [10, 0.8, 10], sh(rgb(c), 0.9));
      if (kind === 'ballistic') { K.solid('visor', 'head', [-4.2, 28.4, 4.4], [8.4, 1.6, 0.8], o.visor || 0x2a2a30); K.solid('mount', 'head', [-1, 30.5, 4.4], [2, 1.5, 0.8], 0x1c1c20); }
      if (kind === 'hard' || kind === 'miner') { K.solid('brim', 'head', [-4.6, 28.6, 4.3], [9.2, 0.7, 1.8], c); K.solid('rim', 'head', [-4.8, 28.6, -4.8], [9.6, 0.7, 9.6], c, { skip: 'FB' }); }
      if (kind === 'miner') { const l = K.box('lamp', 'head', [-1.2, 29.6, 4.4], [2.4, 2, 1], {}); K.paint(l, (P) => { for (const f of 'FBLRTD') P[f].fill(0x3a3a3c); P.F.rect(1, 1, 3, 2, [255, 240, 170]); for (let x = 1; x < 4; x++) for (let y = 1; y < 3; y++) P.F.set(x, y, [255, 240, 170], [255, 230, 140]); }); }
      if (kind === 'fire') { K.solid('brim', 'head', [-5, 28.2, -6.5], [10, 0.8, 11.5], c); }
      if (kind === 'police') { K.solid('peak', 'head', [-4.4, 28.8, 4.2], [8.8, 0.8, 2.4], 0x18181c); }
      if (kind === 'riot' || kind === 'bike' || kind === 'football') {
        const v = K.box(kind === 'football' ? 'cage' : 'visor', 'head', [-4.6, kind === 'football' ? 24 : 25, 4.6], [9.2, kind === 'football' ? 5 : 6.5, 0.6], { alpha: kind !== 'bike' });
        K.paint(v, (P) => {
          const vc = rgb(o.visor || (kind === 'bike' ? 0x1c2228 : 0x9ab8cc));
          for (const f of 'FBLRTD') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
            if (kind === 'bike') F.set(x, y, (x - y > 3 && x - y < 6) ? mix(vc, [255, 255, 255], 0.35) : vc);
            else if (kind === 'football') { if (y === 1 || y === 5 || x === 9 || x === 4 || x === 14 || f !== 'F') F.set(x, y, [225, 225, 230]); }
            else if (y === 0 || y === F.h - 1 || x === 0 || x === F.w - 1 || f !== 'F' || (x - y === 2 && y < 6)) F.set(x, y, f === 'F' && x - y === 2 ? [230, 240, 250] : sh(vc, 0.8));
          } }
        });
      }
    }
    if (k === 'chef') { const b = K.box('toque', 'head', [-4.5, 31, -4.5], [9, 6, 9], { fill: 0xf4f4f0, jit: 0.02 }); K.paint(b, (P) => { for (const f of 'FLBR') { P[f].row(0, 0, 17, [250, 250, 248]); for (let x = 2; x < 18; x += 4) for (let y = 3; y < 12; y++) P[f].set(x, y, [222, 222, 218]); } }); }
    if (k === 'hat') {
      const kind = o.kind || 'bucket', base = o.pat ? null : rgb(c);
      const fillPat = (P) => { const cf = cloth(c, o.pat, seed); for (const f of 'FBLRTD') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, kind === 'straw' ? sh(rgb(c || 0xe0c070), (x + y) % 3 ? 1 : 0.82) : sh(cf(x, y, rng), f === 'D' ? 0.8 : 1)); } };
      const brimW = kind === 'straw' ? 14 : kind === 'bucket' ? 10 : 12;
      K.paint(K.box('brim', 'head', [-brimW / 2, kind === 'bucket' ? 29 : 30, -brimW / 2], [brimW, 0.8, brimW], {}), fillPat);
      if (kind !== 'bucket') { const cr = K.box('crown', 'head', [-4.2, 30.8, -4.2], [8.4, kind === 'straw' ? 2.6 : 3, 8.4], {}); K.paint(cr, fillPat); if (o.band || kind === 'fedora' || kind === 'straw') K.paint(cr, (P) => { const bc = rgb(o.band || (kind === 'straw' ? 0x8a2a1a : 0x1a1a1a)); for (const f of 'FLBR') { P[f].row(P[f].h - 2, 0, P[f].w - 1, bc); P[f].row(P[f].h - 1, 0, P[f].w - 1, sh(bc, 0.8)); } if (kind === 'fedora') P.T.rect(7, 2, 3, 13, sh(rgb(c), 0.75)); }); }
      else if (o.band) K.paint(HO, (P) => { for (const f of 'FLBR') P[f].row(3, 0, 15, o.band); });
    }
    if (k === 'bandana' || k === 'headband') { K.solid('knot', 'head', [-1, 27.5, -5.2], [2, 2, 1], c); K.solid('tail', 'head', [-0.5, 25, -5], [1, 2.5, 0.6], c, { edge: false }); }
    if (k === 'earmuffs') { K.solid('muffL', 'head', [4.3, 26.5, -1.5], [1.4, 3, 3], c); K.solid('muffR', 'head', [-5.7, 26.5, -1.5], [1.4, 3, 3], c); K.solid('band', 'head', [-4.8, 32.3, -0.5], [9.6, 0.7, 1], o.band || 0x1c1c20); }
    if (k === 'santa') { K.push(new THREE.Matrix4().makeTranslation(0, 32, -1).multiply(new THREE.Matrix4().makeRotationX(-0.6))); K.solid('sock', 'head', [-2.5, 0, -2.5], [5, 3, 5], 0xc81e22); K.solid('tip', 'head', [-1.5, 3, -1.5], [3, 2, 3], 0xc81e22); K.solid('pom', 'head', [-1.2, 5, -1.2], [2.4, 2.2, 2.4], 0xf6f4ee, { edge: false }); K.pop(); }
    if (k === 'welding') { const w = K.box('shield', 'head', [-4.6, 24.4, 4.5], [9.2, 7.6, 1], {}); K.paint(w, (P) => { for (const f of 'FBLRTD') P[f].fill(c, 0.04); const v = rgb(o.visor || 0x203028); P.F.rect(2, 5, 15, 4, v); if (o.glow) for (let x = 2; x < 17; x++) for (let y = 5; y < 9; y++) P.F.set(x, y, v, v); }); }
    if (k === 'gasmask') { const n = o.filters || 1, fc = o.filter || 0x5a5a5e; for (let i = 0; i < n; i++) { const x = n === 1 ? -1.2 : (i ? 1.2 : -3.6); K.solid('filter', 'head', [x, 24.4, 4.5], [2.4, 2.4, 1.8], fc); } }
    if (k === 'goggles' && !o.up) { /* painted on the outer layer */ }
  }
  // hair boxes: long hair down the back, pony tail, flat top
  if (sp.hair) {
    const st = sp.hair.style, c = sp.hair.col, hidden = head.some((h) => ['hood', 'balaclava'].includes(h.k));
    if (!hidden && st === 'long') K.solid('hairBack', 'head', [-4, 19.5, -4.8], [8, 5, 1.2], c, { edge: false });
    if (!hidden && st === 'pony') { K.solid('pony', 'head', [-1, 23, -6], [2, 5, 2], c); K.solid('tie', 'head', [-1.1, 27.6, -5.3], [2.2, 0.8, 1.2], 0xd02a5a, { edge: false }); }
    if (!hidden && st === 'flattop' && !head.some((h) => ['helmet', 'cap', 'hat', 'beanie', 'chef'].includes(h.k))) K.solid('flattop', 'head', [-4.25, 32, -4.25], [8.5, 1.5, 8.5], c, { edge: false });
  }
  if (zombie && zombie.brain) K.solid('brain', 'head', [-3, 32, -2.5], [4.5, 1.2, 4.5], 0xe88aa6);
  if (has(wear, 'cigarette') || props.some((p) => p.k === 'cig')) { const s = (has(wear, 'cigarette') || {}).o?.side || 1; const cb = K.box('cig', 'head', [s > 0 ? 1 : -3, 25.5, 4], [2, 0.5, 0.5], {}); K.paint(cb, (P) => { for (const f of 'FBLRTD') P[f].fill(0xf0eee6); for (const f of 'FBTD') P[f].set(s > 0 ? 3 : 0, 0, [255, 110, 40], [255, 90, 30]); }); }

  /* ---- back items ---- */
  for (const { k, o } of wear) {
    if (k === 'backpack') {
      const kk = o.k || 1, w = Math.round(7 * kk), h = Math.round(9 * kk), c = o.col;
      const b = K.box('pack', 'body', [-w / 2, 13, -2 - 3.2 * kk], [w, h, 3 * kk], { fill: c });
      K.paint(b, (P) => { const c2 = rgb(o.col2 || sh(rgb(c), 0.62)); P.B.rect(2, Math.round(P.B.h * 0.55), P.B.w - 4, Math.round(P.B.h * 0.35), c2); P.B.row(Math.round(P.B.h * 0.55), 2, P.B.w - 3, sh(c2, 0.7)); P.T.fill(sh(rgb(c), 1.1)); for (const f of 'LR') P[f].row(4, 0, P[f].w - 1, sh(rgb(c), 0.8)); });
      if (o.roll) K.solid('roll', 'body', [-w / 2 - 0.5, 13 + h, -2 - 3 * kk], [w + 1, 2, 2], o.roll);
    }
    if (k === 'tank') for (const x of (o.twin ? [-2.6, 0.6] : [-1.2])) { K.solid('tank', 'body', [x, 13, -5], [o.twin ? 2 : 2.4, 9, 2.6], o.col); K.solid('valve', 'body', [x + 0.4, 22, -4.5], [1.2, 1.2, 1.4], 0x2a2a2c); }
    if (k === 'carrier' && o.pouches !== false) for (let i = -1; i <= 1; i++) K.solid('mag', 'body', [i * 2.2 - 0.9, 13.2, 2.2], [1.8, 3, 1], o.pouch || sh(rgb(o.col), 0.8));
    if (k === 'belt' && o.pouches) for (const a of o.pouchAt || [-0.7, 0.7]) { const x = Math.max(-4.5, Math.min(3, Math.sin(a) * 4.5 - 0.6)); K.solid('pouch', 'body', [x, 11.4, Math.cos(a) * 2 > 0 ? 2 : -3], [1.6, 2, 1], o.pouches); }
  }

  /* ---- held props ---- */
  const hand = (s) => new THREE.Matrix4().makeTranslation(s < 0 ? -4 - aw / 2 : 4 + aw / 2, 13, 0);
  // grip frames inside the hand: 'blade' points forward-down beside the leg, 'gun' along the forearm (forward when aimed), 'hang' below, 'up' above
  const GRIP = {
    blade: (s) => new THREE.Matrix4().makeRotationX(0.95).premultiply(new THREE.Matrix4().makeRotationZ(-s * 0.2)),
    gun: () => new THREE.Matrix4().makeRotationX(Math.PI / 2),
    up: () => new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.25),
    hang: () => new THREE.Matrix4(),
  };
  // aim a prop's +z along a direction D given in body space, undoing the held arm rotation (gun 'up' stays up)
  const hold = holdOf(meta, sp);
  const aim = (s, D, upW = [0, 1, 0]) => {
    const r = s < 0 ? hold.R : hold.L, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])).invert();
    const z = new THREE.Vector3(...D).normalize().applyQuaternion(q), up = new THREE.Vector3(...upW).applyQuaternion(q);
    const x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const tool = (s, mode, fn) => {
    const bone = s < 0 ? 'armR' : 'armL'; let g = GRIP[mode](s);
    if (mode === 'gun' && hold === HOLD.rifle && s < 0) g = aim(s, [0.72, 0.5, 0.48]);
    else if (mode === 'blade' && hold === HOLD.shoulder && s < 0) g = aim(s, [0.85, 0.32, -0.42], [0, 0, 1]);
    else if (mode === 'blade' && (hold === HOLD.twohand || hold === HOLD.crossed) && s < 0) g = aim(s, [0.6, 0.75, 0.3], [0, 0, 1]);
    K.push(hand(s).multiply(g)); fn(bone); K.pop();
  };
  // along +z from the fist: segments [z0, len, w, h, col]
  const shaft = (bone, z0, len, w, h, col, name = 'shaft') => K.solid(name, bone, [-w / 2, -h / 2, z0], [w, h, len], col);
  for (const { k, o } of props) {
    const side = o.side || (['torch', 'dynamite', 'toolbox', 'medkit', 'bucket', 'lantern', 'can', 'mug', 'radio', 'crutch', 'riotshield', 'scrapshield', 'board', 'extinguisher', 'sign', 'flare'].includes(k) ? 1 : -1);
    const s = side;
    switch (k) {
      case 'bat': tool(s, 'blade', (b) => { shaft(b, -1, 5, 1, 1, 0x1c1c1c, 'grip'); shaft(b, 4, 8, 1.6, 1.6, o.col || 0x9a6a3a); if (o.spiked || o.nails) for (let i = 0; i < 4; i++) K.solid('nail', b, [i % 2 ? 0.8 : -1.4, -0.3, 8 + i * 1.2], [0.6, 0.6, 0.6], 0xb0b0b8, { edge: false }); }); break;
      case 'axe': tool(s, 'blade', (b) => { const L = o.two ? 15 : 11; shaft(b, -2, L, 1, 1, o.handle || 0x7a5030); K.solid('axeHead', b, [-0.4, -0.5, L - 4], [0.8, 4, 3], o.head || 0x8a8a90); K.solid('edge', b, [-0.3, 3.5, L - 4], [0.6, 0.6, 3], 0xd0d0d8, { edge: false }); }); break;
      case 'crowbar': case 'pipe': tool(s, 'blade', (b) => { shaft(b, -1, 12, 0.9, 0.9, o.col || (k === 'pipe' ? 0x74747a : 0xb81a14)); if (k === 'crowbar') K.solid('hook', b, [-0.45, 0, 10.4], [0.9, 2, 0.9], o.col || 0xb81a14); }); break;
      case 'wrench': tool(s, 'blade', (b) => { shaft(b, -1, 6, 1, 0.6, o.col || 0xb81a14); shaft(b, 5, 3, 1, 0.7, 0x9a9aa0); K.solid('jaw', b, [-1.5, -0.4, 7.6], [3, 0.8, 1.4], 0x9a9aa0); }); break;
      case 'machete': case 'knife': case 'cleaver': tool(s, 'blade', (b) => { shaft(b, -1, 3, 1, 1, k === 'cleaver' ? 0x5a3a20 : 0x161616, 'grip'); if (k === 'cleaver') K.solid('blade', b, [-0.25, -0.5, 2], [0.5, 4, 4], 0xc8ccd0); else { const L = k === 'knife' ? 4 : 8; K.solid('blade', b, [-0.25, -0.5, 2], [0.5, k === 'knife' ? 1.2 : 2, L], 0xc8ccd0); K.solid('edge', b, [-0.2, -0.6, 2], [0.4, 0.4, L], 0xeef0f2, { edge: false }); } }); break;
      case 'sword': case 'shoulderSword': tool(s, 'blade', (b) => { const L = Math.round((o.len || (k === 'shoulderSword' ? 0.9 : 0.75)) * 16); shaft(b, -2, 4, 1, 1, o.wrap || 0x2a2028, 'grip'); K.solid('guard', b, [-0.6, -1.8, 1.8], [1.2, 3.6, 0.8], 0x8a6a3a); K.solid('blade', b, [-0.25, -0.8, 2.6], [0.5, 1.6, L], 0xd8dce2); }); break;
      case 'sickle': tool(s, 'blade', (b) => { shaft(b, -1, 4, 1, 1, 0x7a5030); K.solid('blade', b, [-0.25, 0, 3], [0.5, 1, 4], 0xb8bcc0); K.solid('blade2', b, [-0.25, 1, 6], [0.5, 3, 1], 0xb8bcc0); K.solid('blade3', b, [-0.25, 3.5, 3.5], [0.5, 1, 3], 0xb8bcc0); }); break;
      case 'shovel': tool(s, 'blade', (b) => { shaft(b, -3, 13, 1, 1, 0x8a5a2a); K.solid('handle', b, [-1.5, -0.5, -4], [3, 1, 1], 0x1c1c1c); K.solid('spade', b, [-2, -0.3, 10], [4, 0.6, 5], 0x9a9aa2); }); break;
      case 'sledge': tool(s, 'blade', (b) => { shaft(b, -2, 13, 1, 1, o.handle || 0xd8d8d0); K.solid('hammer', b, [-1.5, -2.5, 10], [3, 5, 3], o.head || 0x38383c); }); break;
      case 'pickaxe': tool(s, 'blade', (b) => { shaft(b, -2, 11, 1, 1, 0x8a5a2a); K.solid('pick', b, [-0.5, -4.5, 8], [1, 9, 1.2], 0x707074); }); break;
      case 'chainsaw': tool(s, 'blade', (b) => { K.solid('motor', b, [-1.5, -1.5, -2], [3, 3.5, 5], o.col || 0xe07a1a); K.paint(K.box('bar', b, [-0.4, -1, 3], [0.8, 2, 9], { fill: 0xa0a0a8 }), (P) => { for (const f of 'TD') for (let y = 0; y < P[f].h; y += 2) { P[f].set(0, y, [40, 40, 40]); P[f].set(1, y, [40, 40, 40]); } for (const f of 'LR') { P[f].row(0, 0, P[f].w - 1, [40, 40, 44]); P[f].row(P[f].h - 1, 0, P[f].w - 1, [40, 40, 44]); } }); K.solid('handle', b, [-1, 2, -1], [2, 1, 3], 0x1c1c1c); }); break;
      case 'rifle': case 'shotgun': case 'smg': case 'flamer': tool(s, 'gun', (b) => {
        const L = k === 'smg' ? 9 : k === 'flamer' ? 11 : 15, body = o.col || (k === 'flamer' ? 0x2a2a2c : 0x26262a), wood = k === 'shotgun' ? 0x6a3a18 : (o.ak ? 0x7a4018 : null);
        K.solid('stock', b, [-0.6, -0.5, -4], [1.2, 2.2, 4], wood || body);
        K.solid('receiver', b, [-0.7, -0.2, 0], [1.4, 2.2, L * 0.45], body);
        K.solid('barrel', b, [-0.4, 0.8, L * 0.45], [0.8, 0.8, L * 0.55], k === 'shotgun' ? 0x3a3a3c : 0x1a1a1c);
        if (wood) K.solid('hguard', b, [-0.6, 0, L * 0.45], [1.2, 1, L * 0.3], wood);
        if (k !== 'shotgun' && k !== 'flamer') K.solid('mag', b, [-0.45, -2.6, 1.4], [0.9, 2.6, 1.2], 0x161618);
        K.solid('grip', b, [-0.45, -1.8, -0.6], [0.9, 2, 0.9], 0x161618);
        if (k === 'flamer') { const f = K.box('flame', b, [-0.5, 0.7, L + 0.2], [1, 1, 1], {}); K.paint(f, (P) => { for (const q of 'FBLRTD') { const F = P[q]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, [255, 150, 40], [255, 120, 20]); } }); }
      }); break;
      case 'pistol': tool(s, 'gun', (b) => { K.solid('slide', b, [-0.5, 0.2, -0.5], [1, 1.3, 4.5], o.col || 0x1c1c20); K.solid('grip', b, [-0.45, -1.4, -0.4], [0.9, 2, 1.2], 0x111114); }); break;
      case 'torch': case 'flare': case 'blowtorch': tool(s, 'up', (b) => {
        const hc = o.col || (k === 'torch' ? 0x1a1a1c : 0xd01a14), fc = rgb(o.flame || (k === 'blowtorch' ? 0x4a8aff : k === 'flare' ? 0xff4a40 : 0xfff0b0));
        shaft(b, -1, 4.5, 1.1, 1.1, hc);
        const f = K.box('flame', b, [-0.8, -0.8, 3.5], [1.6, 1.6, 2], {}); K.paint(f, (P) => { for (const q of 'FBLRTD') { const F = P[q]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, mix(fc, [255, 255, 255], (x + y) % 3 ? 0.2 : 0.55), fc); } });
      }); break;
      case 'dynamite': tool(s, 'hang', (b) => { for (const x of [-1, 0, 1]) K.solid('stick', b, [x - 0.45, -3, 0.6 + (x === 0 ? 0.6 : 0)], [0.9, 3.5, 0.9], 0xc81a14); K.solid('fuse', b, [-0.1, 0.5, 1.2], [0.2, 1, 0.2], 0x222222, { edge: false }); }); break;
      case 'toolbox': case 'medkit': tool(s, 'hang', (b) => {
        const med = k === 'medkit', w = med ? 5 : 6, h = med ? 4 : 3.5, c = o.col || (med ? 0xd01a14 : 0xb81a14);
        K.solid('handle', b, [-0.5, -1.2, -1.5], [1, 1, 3], 0x1a1a1a);
        const bx = K.box(k, b, [-1.2, -1.2 - h, -w / 2], [2.4, h, w], { fill: c });
        K.paint(bx, (P) => { for (const f of 'LR') { const F = P[f]; if (med) { const cx = F.w >> 1, cy = F.h >> 1; F.rect(cx - 1, cy - 3, 2, 6, [250, 250, 250]); F.rect(cx - 3, cy - 1, 6, 2, [250, 250, 250]); } else { F.row(2, 0, F.w - 1, sh(rgb(c), 0.7)); F.rect((F.w >> 1) - 1, 2, 2, 2, [200, 200, 200]); } } });
      }); break;
      case 'bucket': tool(s, 'hang', (b) => { K.solid('bail', b, [-0.2, -1.5, -2], [0.4, 1.5, 4], 0x707074, { edge: false }); K.solid('bucket', b, [-2, -6, -2], [4, 4.5, 4], o.col || 0x8aa0a8); }); break;
      case 'lantern': tool(s, 'hang', (b) => { K.solid('top', b, [-1.5, -1.5, -1.5], [3, 1, 3], o.col || 0xc0c030); const l = K.box('glass', b, [-1.2, -4.5, -1.2], [2.4, 3, 2.4], {}); K.paint(l, (P) => { for (const q of 'FBLRTD') { const F = P[q]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, x === 0 || x === F.w - 1 ? rgb(o.col || 0xc0c030) : [255, 220, 120], x === 0 || x === F.w - 1 ? 0 : [255, 190, 80]); } }); K.solid('base', b, [-1.5, -5.5, -1.5], [3, 1, 3], o.col || 0xc0c030); }); break;
      case 'can': case 'mug': tool(s, 'hang', (b) => { K.solid(k, b, [-1, -1.5, 0.8], [2, 2.6, 2], o.col || (k === 'can' ? 0xc81a14 : 0x5aa030)); if (k === 'can') K.solid('lid', b, [-1, 1.1, 0.8], [2, 0.3, 2], 0xc8c8cc, { edge: false }); }); break;
      case 'radio': tool(s, 'hang', (b) => { K.solid('radio', b, [-0.7, -1, 0.6], [1.4, 3, 1], 0x18181a); K.solid('ant', b, [0, 2, 0.8], [0.4, 2, 0.4], 0x222222, { edge: false }); }); break;
      case 'syringe': tool(s, 'up', (b) => { K.solid('barrel', b, [-0.5, -0.5, 0], [1, 1, 3], 0xd8eef8); K.solid('needle', b, [-0.15, -0.15, 3], [0.3, 0.3, 1.5], 0xb0b0b8, { edge: false }); }); break;
      case 'extinguisher': tool(s, 'hang', (b) => { K.solid('tank', b, [-1.4, -8, -1.4], [2.8, 7.5, 2.8], o.col || 0xd01a14); K.solid('head', b, [-0.6, -0.5, -0.6], [1.2, 1.2, 1.2], 0x1a1a1a); K.solid('hose', b, [-0.3, -3, 1.3], [0.6, 3, 0.6], 0x1a1a1a, { edge: false }); }); break;
      case 'crutch': tool(s, 'hang', (b) => { K.solid('pole', b, [-0.45, -12.5, -0.45], [0.9, 14, 0.9], o.col || 0x8a96a0); K.solid('pad', b, [-0.6, 1, -1.5], [1.2, 0.8, 3], 0x1a1a1a); }); break;
      case 'sign': tool(s, 'hang', (b) => { K.solid('pole', b, [-0.4, -5, -0.4], [0.8, 5.5, 0.8], 0x8a8a90); const sg = K.box('sign', b, [-3, -10.5, 0.6], [6, 6, 0.6], {}); K.paint(sg, (P) => { for (const q of 'FBLRTD') P[q].fill(o.col || 0x2a5ad0, 0.02); for (const q of 'FB') { const F = P[q]; for (let y = 2; y < 10; y++) { const hw = Math.floor((y - 2) * 0.6); for (let x = 6 - hw - 1; x <= 6 + hw; x++) F.set(x, y, (y > 6 && x > 4 && x < 7) || y === 9 || x === 6 - hw - 1 || x === 6 + hw ? [250, 250, 250] : rgb(o.col || 0x2a5ad0)); } } }); }); break;
      case 'riotshield': case 'scrapshield': case 'board': {
        const bone = s < 0 ? 'armR' : 'armL', hx = s < 0 ? -4 - aw / 2 : 4 + aw / 2;
        const sb = K.box(k, bone, [hx - 5.5 + s * 0.5, 7, 2.6], [11, 15, 1], {});
        K.paint(sb, (P) => {
          const c = rgb(o.col || (k === 'riotshield' ? 0x5a5a60 : k === 'board' ? 0xb8b8c0 : 0x7a4a30));
          for (const q of 'FBLRTD') { const F = P[q]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, sh(c, (k === 'scrapshield' ? 0.85 + hash2(x >> 2, y >> 2, seed) * 0.3 : 0.95 + rng() * 0.06))); }
          const F = P.F;
          if (k === 'riotshield') { for (let x = 0; x < F.w; x++) { F.set(x, 0, sh(c, 0.7)); F.set(x, F.h - 1, sh(c, 0.7)); } if (o.hazard) for (const y0 of [3, 24]) for (let y = y0; y < y0 + 3; y++) for (let x = 0; x < F.w; x++) F.set(x, y, ((x + y) >> 1) % 2 ? [240, 200, 20] : [24, 24, 24]); if (o.window !== false) F.rect(5, 6, 12, 5, [150, 180, 200]); }
          else { for (let y = 4; y < F.h; y += 9) for (let x = 2; x < F.w; x += 9) F.set(x, y, [190, 190, 196]); for (let x = 0; x < F.w; x++) F.set(x, 14, sh(c, 0.7)); }
        });
        break;
      }
      case 'binoculars': { K.solid('binoL', 'head', [-3.2, 27.2, 4.2], [2.6, 2.2, 2.2], 0x1c1c20); K.solid('binoR', 'head', [0.6, 27.2, 4.2], [2.6, 2.2, 2.2], 0x1c1c20); break; }
      case 'camera': { const cb = K.box('camera', 'body', [-1.8, 19, 2.1], [3.6, 2.2, 1.4], { fill: 0x26262a }); K.paint(cb, (P) => { P.F.rect(2, 1, 3, 3, [10, 10, 12]); P.F.set(3, 2, [120, 160, 200]); }); for (let y = 21; y < 24; y++) K.solid('camStrap', 'body', [y % 2 ? -2.5 : 1.8, y, 2.05], [0.6, 1, 0.2], 0x1a1a1a, { edge: false }); break; }
      case 'guitar': { K.push(new THREE.Matrix4().makeTranslation(0, 16.5, 2.4).multiply(new THREE.Matrix4().makeRotationZ(-0.9))); const gb = K.box('guitar', 'body', [-3, -3.5, 0], [6, 7, 1.6], { fill: o.col || 0x8a4a1a }); K.paint(gb, (P) => { P.F.rect(4, 4, 4, 4, [40, 22, 10]); P.F.row(10, 3, 8, [50, 30, 14]); }); K.solid('neck', 'body', [-0.6, 3.5, 0.3], [1.2, 9, 1], 0x5a3014); K.solid('head', 'body', [-0.9, 12.5, 0.3], [1.8, 2, 1], 0x3a200c); K.pop(); break; }
      case 'map': { const mb = K.box('map', 'body', [-6, 14, 7.6], [12, 8, 0.4], {}); K.paint(mb, (P) => { for (const q of 'FBLRTD') P[q].fill(0x2a8a3a, 0.08); const F = P.F; for (let x = 0; x < F.w; x++) { F.set(x, 0, [230, 230, 220]); F.set(x, F.h - 1, [230, 230, 220]); } for (let i = 0; i < 20; i++) { F.set(2 + i, 6 + Math.round(Math.sin(i * 0.5) * 3), [120, 200, 240]); F.set(2 + i, 7 + Math.round(Math.sin(i * 0.5) * 3), [120, 200, 240]); } F.rect(15, 4, 2, 2, [220, 40, 30]); F.rect(5, 11, 3, 2, [240, 220, 120]); }); break; }
      case 'log': { K.solid('log', 'body', [-10, 24.2, -2.8], [20, 2.6, 2.6], 0x6a4020); for (let i = -8; i <= 8; i += 3) K.solid('spike', 'body', [i, 26.6, -1.9], [0.7, 1.2, 0.7], 0xb0b0b8, { edge: false }); break; }
      default: break; // cig is drawn on the head
    }
  }

  /* ---- dog ---- */
  if (sp.pet && sp.pet.kind === 'dog') {
    const d = sp.pet, c = d.col || 0x8a5a2a, c2 = d.col2 || 0xd0b080;
    const bodyB = K.box('dogBody', 'dog', [-2.5, 5, -5], [5, 5, 10], {});
    K.paint(bodyB, (P, r) => { const a = rgb(c), b2 = rgb(c2); for (const f of 'FBLRTD') { const F = P[f]; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.set(x, y, f === 'D' ? b2 : (f === 'L' || f === 'R') && y > 6 ? mix(a, b2, 0.6) : sh(a, 0.95 + r() * 0.1)); } if (d.vest) { const v = rgb(d.vest); for (const f of 'LRT') { const F = P[f]; for (let y = 0; y < (f === 'T' ? F.h : 8); y++) for (let x = 4; x < F.w - 4; x++) if (f !== 'T' || (y > 3 && y < F.h - 4)) F.set(x, y, v); } } });
    const hd = K.box('dogHead', 'dogHead', [-2.5, 7, 4], [5, 5, 4.5], {});
    K.paint(hd, (P) => { const a = rgb(c), b2 = rgb(c2); for (const f of 'FBLRTD') P[f].fill(c, 0.06); const F = P.F; F.rect(0, 3, 3, 2, [20, 16, 14]); F.rect(7, 3, 3, 2, [20, 16, 14]); F.set(1, 3, [240, 240, 240]); F.set(8, 3, [240, 240, 240]); F.rect(2, 6, 6, 4, b2); if (d.goggles) { const g = rgb(d.goggles); F.rect(0, 2, 10, 4, [30, 30, 30]); F.rect(1, 3, 3, 2, g); F.rect(6, 3, 3, 2, g); } if (d.collar) for (const f of 'LRD') { const Fc = P[f]; for (let x = 0; x < Fc.w; x++) Fc.set(x, Fc.h - 1, rgb(d.collar)); } void a; });
    K.paint(K.box('snout', 'dogHead', [-1.5, 7, 8.5], [3, 2.4, 2.2], { fill: c2 }), (P) => { P.F.rect(1, 2, 4, 2, [24, 18, 16]); P.F.rect(1, 0, 4, 1, sh(rgb(c2), 0.6)); });
    for (const x of [-2.4, 1.4]) { if (d.ears === 'flop') K.solid('ear', 'dogHead', [x < 0 ? -3.2 : 2.5, 9, 5.5], [0.8, 3, 2], sh(rgb(c), 0.7)); else K.solid('ear', 'dogHead', [x, 12, 6], [1, 2, 1.2], sh(rgb(c), 0.8)); }
    const legs = [['dogLegFR', -2.4, 3], ['dogLegFL', 0.8, 3], ['dogLegBR', -2.4, -4.5], ['dogLegBL', 0.8, -4.5]];
    for (const [bn, x, z] of legs) K.paint(K.box('dogLeg', bn, [x, 0, z], [1.6, 5.2, 1.6], { fill: c }), (P) => { for (const f of 'FBLR') for (let y = 6; y < P[f].h; y++) for (let xx = 0; xx < P[f].w; xx++) P[f].set(xx, y, rgb(c2)); });
    K.solid('tail', 'dogTail', [-0.5, 8.5, -8.5], [1, 1, 4], c);
    meta.dog = { k: (d.k || 1) * 0.85, x: d.x, yaw: d.yaw };
  }

  const tex = K.render();
  const geo = K.geometry();
  return { geo, tex, meta, boxes: K.boxes.length };
}

// Bind-pose pivots (px) of every bone, matching the box layout above (dog bones are relative to the dog root).
export function pivots(meta) {
  const aw = meta.aw;
  return {
    root: [0, 0, 0], body: [0, 12, 0], head: [0, 24, 0], armR: [-4 - aw / 2, 22, 0], armL: [4 + aw / 2, 22, 0], legR: [-2, 12, 0], legL: [2, 12, 0],
    dog: [0, 0, 0], dogHead: [0, 9, 4], dogLegFR: [-1.6, 5, 3.8], dogLegFL: [1.6, 5, 3.8], dogLegBR: [-1.6, 5, -3.7], dogLegBL: [1.6, 5, -3.7], dogTail: [0, 9, -5],
  };
}
