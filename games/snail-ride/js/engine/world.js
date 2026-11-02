// Mini Unity-like world runtime on three.js (orthographic, 2D).
// Unity (x, y, z) maps to three (x, y, -z); camera looks down three -z like Unity's +z.
import * as THREE from '../../vendor/three.module.min.js?v=20261102a';
import { A, texImage, spriteInfo, refKey } from './assets.js?v=20261102a';

export { THREE };

const texCache = new Map();
export function threeTexture(key, { repeat = false } = {}) {
  const ck = key + (repeat ? ':r' : '');
  if (!texCache.has(ck)) {
    const t = new THREE.Texture();
    t.colorSpace = THREE.NoColorSpace; // Unity build uses Gamma color space: sample raw values
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texImage(key).then(im => { t.image = im; t.needsUpdate = true; }).catch(e => console.warn(e.message));
    texCache.set(ck, t);
  }
  return texCache.get(ck);
}

// ---------- materials (fragment logic copied from the game's compiled GLSL) ----------
const VS = `
attribute vec4 color;
varying vec2 vUv; varying vec2 vUv2; varying vec4 vCol;
uniform vec4 uST; uniform vec4 uST2;
void main(){ vUv = uv * uST.xy + uST.zw; vUv2 = uv * uST2.xy + uST2.zw; vCol = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FS = {
  flash: `uniform sampler2D map; uniform vec4 uTint; uniform vec4 uFlashColor; uniform float uFlash;
    varying vec2 vUv; varying vec4 vCol;
    void main(){ vec4 c = texture2D(map, vUv) * vCol * uTint; vec3 rgb = mix(c.rgb, uFlashColor.rgb, uFlash); gl_FragColor = vec4(rgb * c.a, c.a); }`,
  alphamask: `uniform sampler2D map; uniform sampler2D alphaMap; uniform vec4 uTint; uniform float uFlash;
    varying vec2 vUv; varying vec2 vUv2; varying vec4 vCol;
    void main(){ vec4 c = texture2D(map, vUv); float a = texture2D(alphaMap, vUv2).r * c.a; gl_FragColor = vec4((c.rgb + vec3(uFlash)) * uTint.rgb * vCol.rgb, a * uTint.a * vCol.a); }`,
  tint: `uniform sampler2D map; uniform vec4 uTint; varying vec2 vUv; varying vec4 vCol;
    void main(){ gl_FragColor = texture2D(map, vUv) * uTint * vCol; }`,
  texture: `uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }`,
  gradient: `uniform vec4 uTop; uniform vec4 uBottom; varying vec2 vUv; void main(){ gl_FragColor = mix(uBottom, uTop, vUv.y); }`,
  particle: `uniform sampler2D map; uniform vec4 uTint; uniform float uMul; varying vec2 vUv; varying vec4 vCol;
    void main(){ gl_FragColor = texture2D(map, vUv) * vCol * uTint * uMul; }`,
};

function col(c, def = [1, 1, 1, 1]) {
  if (!c) return new THREE.Vector4(...def);
  if (Array.isArray(c)) return new THREE.Vector4(c[0], c[1], c[2], c[3] ?? 1);
  return new THREE.Vector4(c.r, c.g, c.b, c.a ?? 1);
}
// Unity colors are authored in gamma space; renderer output is not color managed (ColorSpace Gamma build).
const WHITE = new THREE.Texture();

export function makeMaterial(matKey, { spriteTex = null } = {}) {
  const m = matKey ? A.scene.materials[matKey] : null;
  const shader = m ? m.shader : 'Sprites/Default';
  const u = { uST: { value: new THREE.Vector4(1, 1, 0, 0) }, uST2: { value: new THREE.Vector4(1, 1, 0, 0) }, uTint: { value: col(m && m.col._Color) } };
  const texOf = name => { const k = m && refKey(m.tex[name]); return k ? threeTexture(k, { repeat: true }) : null; };
  let fs = FS.tint, blend = { src: THREE.SrcAlphaFactor, dst: THREE.OneMinusSrcAlphaFactor }, transparent = true;
  switch (shader) {
    case 'Sprites/Flash':
      fs = FS.flash; blend = { src: THREE.OneFactor, dst: THREE.OneMinusSrcAlphaFactor };
      u.uFlashColor = { value: col(m.col._FlashColor) }; u.uFlash = { value: m.fl._FlashAmount || 0 }; u.uTint.value.set(1, 1, 1, 1);
      break;
    case 'Unlit/AlphaMask':
      fs = FS.alphamask; u.alphaMap = { value: texOf('_AlphaTex') || WHITE }; u.uFlash = { value: m.fl._FlashAmount || 0 };
      break;
    case 'Unlit/AdditiveTint': blend = { src: THREE.SrcAlphaFactor, dst: THREE.OneFactor }; break;
    case 'Unlit/Tint': break;
    case 'Unlit/Texture': fs = FS.texture; transparent = false; blend = null; break;
    case 'Custom/BasicGradient': fs = FS.gradient; transparent = false; blend = null;
      u.uTop = { value: col(m.col._TopColor) }; u.uBottom = { value: col(m.col._BottomColor) }; break;
    case 'Mobile/Particles/Additive': fs = FS.particle; blend = { src: THREE.SrcAlphaFactor, dst: THREE.OneFactor }; u.uMul = { value: 1 }; u.uTint.value.set(1, 1, 1, 1); break;
    case 'Mobile/Particles/Alpha Blended': fs = FS.particle; u.uMul = { value: 1 }; u.uTint.value.set(1, 1, 1, 1); break;
    case 'Particles/AlphaBlend': fs = FS.particle; blend = { src: THREE.SrcAlphaFactor, dst: THREE.OneFactor };
      u.uMul = { value: 1 }; break;
    default: // Sprites/Default and built-in sprite material: premultiplied alpha
      fs = FS.flash; blend = { src: THREE.OneFactor, dst: THREE.OneMinusSrcAlphaFactor };
      u.uFlashColor = { value: new THREE.Vector4(1, 1, 1, 1) }; u.uFlash = { value: 0 }; u.uTint.value.set(1, 1, 1, 1);
  }
  u.map = { value: spriteTex || texOf('_MainTex') || WHITE };
  if (m && m.st._MainTex && !spriteTex) u.uST.value.set(...m.st._MainTex);
  if (m && m.st._AlphaTex) u.uST2.value.set(...m.st._AlphaTex);
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, transparent, depthWrite: !transparent, depthTest: true, side: THREE.DoubleSide });
  if (blend) { mat.blending = THREE.CustomBlending; mat.blendSrc = blend.src; mat.blendDst = blend.dst; mat.blendSrcAlpha = blend.src; mat.blendDstAlpha = blend.dst; }
  mat.userData = { shader, matKey };
  if (matKey) { if (!matInstances.has(matKey)) matInstances.set(matKey, new Set()); matInstances.get(matKey).add(mat); }
  return mat;
}

// Every material instance per material asset (Unity sharedMaterial edits must reach all renderers using it).
export const matInstances = new Map();
export function forMaterial(matKey, fn) { const s = matInstances.get(matKey); if (s) for (const m of s) fn(m); }
export function releaseMaterial(m) { const s = matInstances.get(m.userData.matKey); if (s) s.delete(m); m.dispose(); }

// Shared materials (Unity sharedMaterial semantics: one instance per material asset).
const sharedMats = new Map();
export function sharedMaterial(matKey, spriteTexKey) {
  const k = matKey + '|' + (spriteTexKey || '');
  if (!sharedMats.has(k)) sharedMats.set(k, makeMaterial(matKey, { spriteTex: spriteTexKey ? threeTexture(spriteTexKey) : null }));
  return sharedMats.get(k);
}
export function allSharedMaterials(matKey) { return [...sharedMats.entries()].filter(([k]) => k.startsWith(matKey + '|')).map(e => e[1]); }

// ---------- sprite geometry ----------
const geoCache = new Map();
export function spriteGeometry(key) {
  if (!geoCache.has(key)) {
    const s = spriteInfo(key), t = A.art.textures[s.tex];
    const w = s.w / s.ppu, h = s.h / s.ppu;
    const x0 = (s.ox - s.px * s.rw) / s.ppu, y0 = (s.oy - s.py * s.rh) / s.ppu;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x0 + w, y0, 0, x0 + w, y0 + h, 0, x0, y0 + h, 0], 3));
    const u0 = s.x / t.w, v0 = s.y / t.h, u1 = (s.x + s.w) / t.w, v1 = (s.y + s.h) / t.h;
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(16).fill(1), 4));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

// ---------- GameObject runtime ----------
let uid = 1;
export class GO {
  constructor(name) {
    this.name = name; this.uid = uid++;
    this.obj = new THREE.Group(); this.obj.userData.go = this;
    this.children = []; this.parent = null; this.comps = []; this.activeSelf = true; this.tag = 0; this.srcId = null;
    this.behaviours = []; this.destroyed = false;
  }
  get transform() { return this.obj; }
  add(child) { child.parent = this; this.children.push(child); this.obj.add(child.obj); return child; }
  setActive(b) { b = !!b; if (this.activeSelf === b) return; this.activeSelf = b; this.obj.visible = b; this._activeChanged(); }
  _activeChanged() { const a = this.activeInHierarchy; for (const bh of this.behaviours) { if (a && bh.onEnable) bh.onEnable(); if (!a && bh.onDisable) bh.onDisable(); } for (const c of this.children) c._activeChanged(); }
  get activeInHierarchy() { let g = this; while (g) { if (!g.activeSelf) return false; g = g.parent; } return true; }
  find(path) { let g = this; for (const p of path.split('/')) { g = g.children.find(c => c.name === p); if (!g) return null; } return g; }
  findDeep(name) { if (this.name === name) return this; for (const c of this.children) { const r = c.findDeep(name); if (r) return r; } return null; }
  comp(type) { return this.comps.find(c => c.type === type) || null; }
  compDeep(type) { const c = this.comp(type); if (c) return c; for (const ch of this.children) { const r = ch.compDeep(type); if (r) return r; } return null; }
  walk(fn) { fn(this); for (const c of this.children) c.walk(fn); }
  destroy() {
    this.destroyed = true;
    for (const bh of this.behaviours) bh.onDestroy && bh.onDestroy();
    this.walk(g => { g.destroyed = true; });
    if (this.parent) { this.parent.children = this.parent.children.filter(c => c !== this); }
    this.obj.removeFromParent();
    this.obj.traverse(o => { if (o.material && o.material.userData.own) releaseMaterial(o.material); });
  }
  // Unity-space helpers
  get pos() { return { x: this.obj.position.x, y: this.obj.position.y, z: -this.obj.position.z }; }
  setPos(x, y, z) { this.obj.position.set(x, y, z === undefined ? this.obj.position.z : -z); }
  setEulerZ(deg) { this.obj.rotation.set(0, 0, deg * Math.PI / 180); }
  worldPos() { const v = new THREE.Vector3(); this.obj.getWorldPosition(v); return { x: v.x, y: v.y, z: -v.z }; }
}

// Build a GameObject tree from an exported node. ids: map original id -> GO (for refs inside the prefab).
export function buildNode(node, ids = new Map(), hooks = {}) {
  const g = new GO(node.name);
  g.srcId = node.id; g.tag = node.tag; g.layer = node.layer;
  ids.set(node.id, g);
  for (const c of node.c) {
    const comp = { ...c, go: g };
    g.comps.push(comp); ids.set(c.id, comp);
    if (c.type === 'Transform') applyTransform(g, c);
    else if (c.type === 'SpriteRenderer') attachSprite(g, comp);
    hooks[c.type] && hooks[c.type](g, comp);
  }
  for (const ch of node.ch) g.add(buildNode(ch, ids, hooks));
  g.activeSelf = node.active; g.obj.visible = node.active;
  return g;
}

export function applyTransform(g, t) {
  const p = t.m_LocalPosition, r = t.m_LocalRotation, s = t.m_LocalScale;
  g.obj.position.set(p.x, p.y, -p.z);
  g.obj.quaternion.set(-r.x, -r.y, r.z, r.w);
  g.obj.scale.set(s.x, s.y, s.z);
}

export function attachSprite(g, comp) {
  const sk = refKey(comp.m_Sprite);
  const matKey = refKey(comp.m_Materials && comp.m_Materials[0]);
  comp.setSprite = key => {
    if (comp.mesh) { comp.mesh.removeFromParent(); comp.mesh = null; }
    comp.spriteKey = key;
    if (!key || !spriteInfo(key)) return;
    const s = spriteInfo(key);
    const geo = spriteGeometry(key).clone();
    const mat = makeMaterial(matKey, { spriteTex: threeTexture(s.tex) }); mat.userData.own = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(comp.m_FlipX ? -1 : 1, comp.m_FlipY ? -1 : 1, 1);
    mesh.renderOrder = (comp.m_SortingOrder || 0);
    mesh.visible = comp.m_Enabled !== 0;
    comp.mesh = mesh; g.obj.add(mesh);
    comp.applyColor();
  };
  const c = comp.m_Color || { r: 1, g: 1, b: 1, a: 1 };
  comp.color = [c.r, c.g, c.b, c.a];
  comp.applyColor = () => {
    if (!comp.mesh) return;
    const a = comp.mesh.geometry.attributes.color;
    for (let i = 0; i < 4; i++) a.setXYZW(i, comp.color[0], comp.color[1], comp.color[2], comp.color[3]);
    a.needsUpdate = true;
  };
  comp.setColor = (r, gg, b, a) => { comp.color = [r, gg, b, a]; comp.applyColor(); };
  comp.setEnabled = b => { comp.m_Enabled = b ? 1 : 0; if (comp.mesh) comp.mesh.visible = !!b; };
  comp.setSprite(sk);
}

export function prefab(key) { return A.scene.prefabs[key]; }
export function sceneRoots(level) { return A.scene.scenes[level]; }

// ---------- 2D colliders (trigger overlap only) ----------
function worldMatrix(g) { g.obj.updateWorldMatrix(true, false); return g.obj.matrixWorld; }
const _v = new THREE.Vector3();
function tp(m, x, y) { _v.set(x, y, 0).applyMatrix4(m); return { x: _v.x, y: _v.y }; }
export function colliderShape(comp) {
  const g = comp.go, m = worldMatrix(g);
  const off = comp.m_Offset || { x: 0, y: 0 };
  switch (comp.type) {
    case 'CircleCollider2D': {
      const c = tp(m, off.x, off.y); const e = tp(m, off.x + comp.m_Radius, off.y);
      return { kind: 'circle', c, r: Math.hypot(e.x - c.x, e.y - c.y) };
    }
    case 'BoxCollider2D': {
      const hx = comp.m_Size.x / 2, hy = comp.m_Size.y / 2;
      return { kind: 'poly', pts: [tp(m, off.x - hx, off.y - hy), tp(m, off.x + hx, off.y - hy), tp(m, off.x + hx, off.y + hy), tp(m, off.x - hx, off.y + hy)] };
    }
    case 'CapsuleCollider2D': {
      const sx = comp.m_Size.x, sy = comp.m_Size.y;
      // m_Direction: 0 vertical, 1 horizontal
      const horiz = comp.m_Direction === 1;
      const r = (horiz ? sy : sx) / 2, half = Math.max(0, (horiz ? sx : sy) / 2 - r);
      const a = horiz ? tp(m, off.x - half, off.y) : tp(m, off.x, off.y - half);
      const b = horiz ? tp(m, off.x + half, off.y) : tp(m, off.x, off.y + half);
      const e = tp(m, off.x + r, off.y), c0 = tp(m, off.x, off.y);
      return { kind: 'capsule', a, b, r: Math.hypot(e.x - c0.x, e.y - c0.y) };
    }
    case 'PolygonCollider2D': {
      const paths = comp.m_Points.m_Paths.map(p => p.map(q => tp(m, q.x + off.x, q.y + off.y)));
      return { kind: 'polys', paths };
    }
  }
  return null;
}
function segDist2(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx - p.x, y = a.y + t * dy - p.y; return x * x + y * y;
}
function pointInPoly(p, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}
function polyDist2(p, pts) { let d = Infinity; for (let i = 0; i < pts.length; i++) d = Math.min(d, segDist2(p, pts[i], pts[(i + 1) % pts.length])); return d; }
function segSeg2(a, b, c, d) { return Math.min(segDist2(a, c, d), segDist2(b, c, d), segDist2(c, a, b), segDist2(d, a, b)); }
function polyPoly(p, q) {
  for (const v of p) if (pointInPoly(v, q)) return true;
  for (const v of q) if (pointInPoly(v, p)) return true;
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) {
    const a = p[i], b = p[(i + 1) % p.length], c = q[j], d = q[(j + 1) % q.length];
    const s = (x, y, z) => (y.x - x.x) * (z.y - x.y) - (y.y - x.y) * (z.x - x.x);
    if (s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0) return true;
  }
  return false;
}
// Round shapes as segment + radius: circle = degenerate segment.
function asRound(s) { return s.kind === 'circle' ? { a: s.c, b: s.c, r: s.r } : s.kind === 'capsule' ? s : null; }
export function overlap(s1, s2) {
  if (!s1 || !s2) return false;
  if (s1.kind === 'polys') return s1.paths.some(p => overlap({ kind: 'poly', pts: p }, s2));
  if (s2.kind === 'polys') return s2.paths.some(p => overlap(s1, { kind: 'poly', pts: p }));
  const r1 = asRound(s1), r2 = asRound(s2);
  if (r1 && r2) { const rr = r1.r + r2.r; return segSeg2(r1.a, r1.b, r2.a, r2.b) <= rr * rr; }
  if (r1 || r2) {
    const r = r1 || r2, poly = (r1 ? s2 : s1).pts;
    if (pointInPoly(r.a, poly) || pointInPoly(r.b, poly)) return true;
    let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, segSeg2(r.a, r.b, poly[i], poly[(i + 1) % poly.length]));
    return d <= r.r * r.r;
  }
  return polyPoly(s1.pts, s2.pts);
}
export const COLLIDERS = new Set(['CircleCollider2D', 'BoxCollider2D', 'CapsuleCollider2D', 'PolygonCollider2D']);

// ---------- animation adapter for world GameObjects ----------
const DEG = Math.PI / 180;
export const worldAdapter = {
  resolve(root, path) { return path ? root.find(path) : root; },
  get(g, type, prop, comp) {
    const o = g.obj;
    switch (type) {
      case 'Transform':
        if (prop === 'position') return [o.position.x, o.position.y, -o.position.z][comp];
        if (prop === 'scale') return [o.scale.x, o.scale.y, o.scale.z][comp];
        if (prop === 'euler') return [-o.rotation.x / DEG, -o.rotation.y / DEG, o.rotation.z / DEG][comp];
        if (prop === 'rotation') return [-o.quaternion.x, -o.quaternion.y, o.quaternion.z, o.quaternion.w][comp];
        return undefined;
      case 'GameObject': return g.activeSelf ? 1 : 0;
      default: {
        const c = g.comp(type);
        if (!c) return undefined;
        if (prop === 'm_Enabled') return c.m_Enabled ?? 1;
        if (prop.startsWith('m_Color.')) return c.color ? c.color['rgba'.indexOf(prop.slice(-1))] : 1;
        if (prop === 'm_Sprite') return c.spriteKey;
        if (prop.startsWith('material.')) { const u = c.mesh && c.mesh.material.uniforms; return prop === 'material._FlashAmount' && u && u.uFlash ? u.uFlash.value : 0; }
        if (c.behaviour && prop in c.behaviour) return c.behaviour[prop];
        return c[prop];
      }
    }
  },
  set(g, type, prop, comp, v) {
    const o = g.obj;
    switch (type) {
      case 'Transform':
        if (prop === 'position') { if (comp === 2) o.position.z = -v; else o.position.setComponent(comp, v); }
        else if (prop === 'scale') o.scale.setComponent(comp, v);
        else if (prop === 'euler') { if (comp === 2) o.rotation.z = v * DEG; else o.rotation[comp ? 'y' : 'x'] = -v * DEG; }
        else if (prop === 'rotation') { const q = o.quaternion; if (comp === 0) q.x = -v; else if (comp === 1) q.y = -v; else if (comp === 2) q.z = v; else q.w = v; }
        return;
      case 'GameObject': g.setActive(v > 0.5); return;
      default: {
        const c = g.comp(type);
        if (!c) return;
        if (prop === 'm_Enabled') { c.setEnabled ? c.setEnabled(v > 0.5) : (c.m_Enabled = v > 0.5 ? 1 : 0); return; }
        if (prop.startsWith('m_Color.')) { if (c.color) { c.color['rgba'.indexOf(prop.slice(-1))] = v; c.applyColor && c.applyColor(); } return; }
        if (prop === 'm_Sprite') { const k = spriteKeyFromRef(v); if (c.setSprite && c.spriteKey !== k) c.setSprite(k); return; }
        if (prop.startsWith('material.')) {
          const meshes = c.mesh ? [c.mesh] : (c.meshes || []);
          for (const m of meshes) { const u = m.material.uniforms; if (prop === 'material._FlashAmount' && u.uFlash) u.uFlash.value = v; else if (prop.startsWith('material._Color.') && u.uTint) u.uTint.value.setComponent('rgba'.indexOf(prop.slice(-1)), v); }
          return;
        }
        if (c.behaviour) c.behaviour[prop] = v; else c[prop] = v;
      }
    }
  },
};
const CODEMAP = { 'sharedassets0.assets': 'a0', 'sharedassets1.assets': 'a1', 'sharedassets2.assets': 'a2' };
export function spriteKeyFromRef(v) {
  const m = /@(.*):(\d+)$/.exec(v); if (!m) return v;
  return (CODEMAP[m[1]] || ('r' + m[1].slice(0, 6))) + '_' + m[2];
}

// ---------- built-in meshes + MeshRenderer ----------
// Unity built-in Plane (10x10 in XZ, 11x11 verts, normal +Y) and Quad (1x1 in XY). Vertices in Unity space, z flipped for three.
export function builtinMesh(key) {
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], col = [], idx = [];
  if (key === 'ud_10209') { // Plane: uv u = 1 - (x+5)/10, v = 1 - (z+5)/10 (Unity's plane UVs run opposite to its axes)
    for (let j = 0; j <= 10; j++) for (let i = 0; i <= 10; i++) {
      const x = 5 - i, z = 5 - j; pos.push(x, 0, -z); uv.push(i / 10, j / 10); col.push(1, 1, 1, 1);
    }
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { const a = j * 11 + i; idx.push(a, a + 11, a + 1, a + 1, a + 11, a + 12); }
  } else { // Quad
    pos.push(-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0); uv.push(0, 0, 1, 0, 1, 1, 0, 1); col.push(...new Array(16).fill(1)); idx.push(0, 1, 2, 0, 2, 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}
export function attachMeshRenderer(g, comp, geometry, { own = true } = {}) {
  const matKey = refKey(comp.m_Materials && comp.m_Materials[0]);
  const mat = own ? makeMaterial(matKey) : sharedMaterial(matKey);
  if (own) mat.userData.own = true;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.visible = comp.m_Enabled !== 0;
  mesh.frustumCulled = false;
  comp.mesh = mesh; g.obj.add(mesh);
  comp.setEnabled = b => { comp.m_Enabled = b ? 1 : 0; mesh.visible = !!b; };
  return mesh;
}
