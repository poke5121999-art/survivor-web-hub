// Prop builder: collect bevelled pieces with paint params into nodes, merge each node
// into one mesh per material (wear / glow / glass / fire), expose parameters + update().
import * as THREE from '../vendor/three.module.min.js';
import { bevelBox, bevelCyl, lathe, torus, extrude, tube, blob, deform } from './geo.js';
import { createWearMaterial, createGlowMaterial, createGlassMaterial } from './wear-material.js';
import { rng } from './rng.js';

// Paint presets: base look per surface. Any field can be overridden per piece.
export const PRESETS = {
  paint:    { color: '#c43b32', under: '#8d9296', rough: 0.62, metal: 0.0, chip: 0.55, rust: 0.25, dirt: 0.45, splat: 0 },
  metal:    { color: '#8b9399', under: '#5d6368', rough: 0.45, metal: 0.65, chip: 0.0, rust: 0.3, dirt: 0.4, splat: 0 },
  steel:    { color: '#6f777d', under: '#a9b0b4', rough: 0.5, metal: 0.55, chip: 0.25, rust: 0.2, dirt: 0.4, splat: 0 },
  rusty:    { color: '#8a4a2a', under: '#5a5550', rough: 0.85, metal: 0.2, chip: 0.2, rust: 0.8, dirt: 0.5, splat: 0 },
  concrete: { color: '#b9bcbc', under: '#8e8f8c', rough: 0.95, metal: 0.0, chip: 0.35, rust: 0.0, dirt: 0.6, splat: 0 },
  wood:     { color: '#9a5a3c', under: '#c08a62', rough: 0.85, metal: 0.0, chip: 0.25, rust: 0.0, dirt: 0.45, splat: 0 },
  plywood:  { color: '#e3a877', under: '#c78a5c', rough: 0.85, metal: 0.0, chip: 0.1, rust: 0.0, dirt: 0.3, splat: 0 },
  plastic:  { color: '#2b5fd9', under: '#d9dde0', rough: 0.55, metal: 0.0, chip: 0.15, rust: 0.0, dirt: 0.45, splat: 0 },
  rubber:   { color: '#2c2d31', under: '#45464b', rough: 0.9, metal: 0.0, chip: 0.0, rust: 0.0, dirt: 0.5, splat: 0 },
  fabric:   { color: '#7d8a5a', under: '#5d6844', rough: 0.95, metal: 0.0, chip: 0.0, rust: 0.0, dirt: 0.5, splat: 0 },
  tarp:     { color: '#6aa832', under: '#4f8a22', rough: 0.75, metal: 0.0, chip: 0.0, rust: 0.0, dirt: 0.4, splat: 0 },
  chrome:   { color: '#c9ced2', under: '#9aa0a5', rough: 0.25, metal: 0.9, chip: 0.0, rust: 0.1, dirt: 0.2, splat: 0 },
  glass:    { color: '#3a7bd5', rough: 0.15, metal: 0.1, mat: 'glass' },
  glow:     { color: '#fff2c4', mat: 'glow' },
};
const PATTERN = { none: 0, stripes: 1, bands: 2, stains: 3, grid: 4, mottle: 5, vstripes: 6, chevron: 7 };

const _c = new THREE.Color();
const lin = (hex) => _c.set(hex).toArray();

let SHARED = null; // shared materials (one wear material serves every prop)
export function sharedMaterials(quality = 1) {
  if (!SHARED || SHARED.q !== quality) {
    if (SHARED) for (const k of ['wear', 'glow', 'glass']) SHARED[k].dispose();
    SHARED = { q: quality, wear: createWearMaterial({ quality }), glow: createGlowMaterial(), glass: createGlassMaterial() };
  }
  return SHARED;
}

export class Prop {
  constructor(id, seed = 1, opts = {}) {
    this.id = id; this.seed = seed | 0; this.opts = opts;
    this.rand = rng(seed * 7919 + hashStr(id));
    // global wear level: 0 new, 0.6 default worn, 1 very worn (opts.wear)
    this.wear = opts.wear ?? 0.6;
    this.root = new THREE.Group(); this.root.name = id;
    this.nodes = new Map([[this.root, []]]);
    this.cur = this.root;
    this.params = {}; this.updaters = []; this.extra = [];
    this.pieceSeed = 0;
  }
  // --- random helpers
  r() { return this.rand(); }
  range(a, b) { return a + (b - a) * this.rand(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length) % arr.length]; }
  chance(p) { return this.rand() < p; }

  // Paint: preset name + overrides -> paint object (pass as {paint} to pieces).
  paint(preset = 'paint', o = {}) {
    const base = PRESETS[preset] || PRESETS.paint;
    const p = { ...base, ...o };
    const w = o.wearScale ?? this.wear / 0.6;
    if (o.chip === undefined) p.chip = base.chip * w;
    if (o.rust === undefined) p.rust = (base.rust || 0) * w;
    if (o.dirt === undefined) p.dirt = (base.dirt || 0) * Math.min(1.4, 0.5 + w * 0.5);
    return p;
  }
  node(name, { at = [0, 0, 0], rot = [0, 0, 0], parent = null } = {}) {
    const n = new THREE.Group(); n.name = name;
    n.position.fromArray(at); n.rotation.set(rot[0], rot[1], rot[2]);
    (parent || this.cur).add(n);
    this.nodes.set(n, []);
    return n;
  }
  in(node, fn) { const prev = this.cur; this.cur = node; try { fn(); } finally { this.cur = prev; } return node; }

  // --- pieces. common opts: at, rot, scale, paint, node, deform:{amp,freq}
  box(size, o = {}) { return this.add(bevelBox(size[0], size[1], size[2], o.bevel ?? Math.min(0.03, Math.min(...size) * 0.18), o.round ? Math.min(2, o.round === true ? 1 : o.round) : 0), o); }
  cyl(r, h, o = {}) { return this.add(bevelCyl(r, h, { r2: o.r2 ?? r, bevel: o.bevel ?? Math.min(0.02, r * 0.2), seg: o.seg ?? 16, open: o.open }), o); }
  lathe(pts, o = {}) { return this.add(lathe(pts, o.seg ?? 18, o.colors || null, o.phiStart ?? 0, o.phiLength ?? Math.PI * 2), o); }
  torus(R, r, o = {}) { return this.add(torus(R, r, o.seg ?? 18, o.tube ?? 8, o.arc ?? Math.PI * 2), o); }
  extrude(pts, depth, o = {}) { return this.add(extrude(pts, depth, { bevel: o.bevel ?? 0.012, holes: o.holes || [], curveSegs: o.curveSegs ?? 6 }), o); }
  tube(points, radius, o = {}) { return this.add(tube(points, radius, o), o); }
  blob(r, o = {}) { return this.add(blob(r, o.detail ?? 1), o); }
  geom(g, o = {}) { if (!g.userData.kind && g.userData.kind !== 0) g.userData.kind = 2; return this.add(g, o); }

  add(g, o) {
    const paint = o.paint || this.paint();
    if (o.deform) deform(g, o.deform.amp ?? 0.01, o.deform.freq ?? 6, this.seed + this.pieceSeed, o.deform.axis || [1, 1, 1]);
    const ud = g.userData || {};
    const pos = g.attributes.position, n = pos.count;
    let kind = ud.kind ?? 2;
    let half = ud.half || [0, 0, 0];
    let yc = ud.yc || 0, xc = 0, zc = 0;
    if (kind === 2 && !ud.edgeZero) { // extrudes / custom: treat edges as those of the piece's bounding box
      g.computeBoundingBox(); const bb = g.boundingBox;
      half = [(bb.max.x - bb.min.x) / 2, (bb.max.y - bb.min.y) / 2, (bb.max.z - bb.min.z) / 2];
      xc = (bb.max.x + bb.min.x) / 2; yc = (bb.max.y + bb.min.y) / 2; zc = (bb.max.z + bb.min.z) / 2; kind = 0;
    }
    const col2 = lin(paint.col2 || paint.color), under = lin(paint.under || paint.color), base = lin(paint.color);
    const pat = (PATTERN[paint.pattern] ?? paint.pattern ?? 0) + Math.min(0.99, paint.patW ?? 0.15);
    const metal = Math.min(0.99, paint.metal ?? 0);
    const seed = (this.seed * 0.137 + (this.pieceSeed++) * 1.618) % 97;
    const A = (k) => new Float32Array(n * k);
    const aCol2 = A(4), aUnder = A(4), aMat = A(4), aLoc = A(4), aHalf = A(4);
    const hasCol = !!g.attributes.color;
    const color = hasCol ? null : A(3);
    const ew = g.attributes.aEdgeW;
    for (let i = 0; i < n; i++) {
      aCol2.set([col2[0], col2[1], col2[2], pat], i * 4);
      aUnder.set([under[0], under[1], under[2], paint.rough ?? 0.7], i * 4);
      aMat.set([paint.chip ?? 0, paint.rust ?? 0, Math.min(0.99, paint.dirt ?? 0), Math.round(Math.max(0.1, paint.splatScale ?? 1) * 10) + 0.05 + 0.9 * Math.min(1, paint.splat ?? 0)], i * 4);
      aLoc.set([pos.getX(i) - xc, pos.getY(i) - yc, pos.getZ(i) - zc, kind * 2 + metal], i * 4);
      if (kind === 2) aHalf.set([0, 0, 0, seed], i * 4); // tubes / blobs: no edges
      else aHalf.set([half[0], half[1], half[2], seed], i * 4);
      if (color) color.set(base, i * 3);
    }
    if (hasCol && paint.tint !== false && paint.colorMul) { /* keep lathe colours */ }
    if (color) g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('aCol2', new THREE.BufferAttribute(aCol2, 4));
    g.setAttribute('aUnder', new THREE.BufferAttribute(aUnder, 4));
    g.setAttribute('aMat', new THREE.BufferAttribute(aMat, 4));
    g.setAttribute('aLoc', new THREE.BufferAttribute(aLoc, 4));
    g.setAttribute('aHalf', new THREE.BufferAttribute(aHalf, 4));
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.aEdgeW) g.deleteAttribute('aEdgeW');
    // transform
    const m = new THREE.Matrix4();
    const s = o.scale === undefined ? [1, 1, 1] : (typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale);
    const r = o.rot || [0, 0, 0];
    m.compose(new THREE.Vector3().fromArray(o.at || [0, 0, 0]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], o.order || 'XYZ')), new THREE.Vector3().fromArray(s));
    g.applyMatrix4(m);
    const node = o.node || this.cur;
    if (!this.nodes.has(node)) this.nodes.set(node, []);
    this.nodes.get(node).push({ g, mat: paint.mat || 'wear' });
    return g;
  }

  // Attach an arbitrary Object3D (e.g. fire) to a node.
  attach(obj, node = null) { (node || this.cur).add(obj); this.extra.push(obj); return obj; }
  // Animated / openable parameter: p.param('doors', 0.8, v => ...) ; applied now and via group.userData.set
  param(name, value, apply, range = [0, 1]) { this.params[name] = { value, apply, range }; }
  onUpdate(fn) { this.updaters.push(fn); }

  done() {
    const mats = sharedMaterials(this.opts.quality ?? 1);
    let tris = 0, draws = 0;
    { // prop height -> aMat.z integer part (units of 5 cm) so dirt height scales with prop size
      let y0 = Infinity, y1 = -Infinity;
      for (const list of this.nodes.values()) for (const it of list) { it.g.computeBoundingBox(); y0 = Math.min(y0, it.g.boundingBox.min.y); y1 = Math.max(y1, it.g.boundingBox.max.y); }
      const code = Math.max(1, Math.min(999, Math.round((y1 - Math.max(0, y0)) / 0.05)));
      for (const list of this.nodes.values()) for (const it of list) { const a = it.g.attributes.aMat; if (!a) continue; for (let i = 0; i < a.count; i++) a.array[i * 4 + 2] = code + 0.05 + 0.9 * Math.min(1, a.array[i * 4 + 2]); }
    }
    for (const [node, list] of this.nodes) {
      const byMat = new Map();
      for (const it of list) { if (!byMat.has(it.mat)) byMat.set(it.mat, []); byMat.get(it.mat).push(it.g); }
      for (const [mk, geoms] of byMat) {
        const g = mergeGeoms(geoms);
        const mesh = new THREE.Mesh(g, mats[mk] || mats.wear);
        mesh.castShadow = mk !== 'glass'; mesh.receiveShadow = true;
        mesh.name = node.name + ':' + mk;
        node.add(mesh);
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3; draws++;
      }
    }
    this.root.traverse((o) => { if (o.userData.fireDraws) { draws += o.userData.fireDraws; tris += o.userData.fireTris || 0; } });
    const params = this.params, updaters = this.updaters;
    for (const k in params) params[k].apply(params[k].value);
    Object.assign(this.root.userData, {
      prop: this.id, seed: this.seed, tris: Math.round(tris), draws,
      params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, { value: v.value, range: v.range }])),
      set: (name, v) => { const p = params[name]; if (p) { p.value = v; p.apply(v); this.root.userData.params[name].value = v; } },
      update: (dt, t) => { for (const f of updaters) f(dt, t); },
    });
    return this.root;
  }
}

const ATTRS = [['position', 3], ['normal', 3], ['color', 3], ['aCol2', 4], ['aUnder', 4], ['aMat', 4], ['aLoc', 4], ['aHalf', 4]];
export function mergeGeoms(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  const bufs = ATTRS.map(([, k]) => new Float32Array(vc * k));
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    ATTRS.forEach(([name, k], a) => {
      const src = g.attributes[name];
      if (src) bufs[a].set(src.array.subarray(0, n * k), vo * k);
      else if (name === 'color') bufs[a].fill(1, vo * k, (vo + n) * k);
    });
    if (g.index) { const s = g.index.array; for (let i = 0; i < s.length; i++) idx[io + i] = s[i] + vo; io += s.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
    g.dispose();
  }
  ATTRS.forEach(([name, k], a) => out.setAttribute(name, new THREE.BufferAttribute(bufs[a], k)));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
