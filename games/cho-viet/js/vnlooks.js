// Vietnamese outfits for the game's own rigged stickmen: rigid toon parts hung on Mixamo bones so they follow the
// original Idle/Walking clips. Built in the character's rest frame (local -z is the face), then bone.attach keeps
// the world transform.
import * as THREE from 'three';
import { makeMaterial, addSmoothNormals } from '../../casual-farm/js/view/toon.js';

const TOON = { h: [1, 1, 1, 1], s: [0, 0, 0, 1], thr: 0.767, smooth: 0.594 };
const hex = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b, 1]; };
const mats = new Map();
function mat(color, outline = true) {
  const k = `${color}|${outline}`;
  if (!mats.has(k)) mats.set(k, makeMaterial({ color: hex(color), toon: TOON, outline: outline ? { w: 2, color: [0, 0, 0, 1] } : null }, '', []));
  return mats.get(k);
}
function texMat(canvas) {
  const m = makeMaterial({ color: [1, 1, 1, 1], toon: TOON, outline: { w: 2, color: [0, 0, 0, 1] } }, '', []);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  m.mat.uniforms.map.value = t;
  m.mat.uniforms.hasMap.value = true;
  return m;
}
function part(geo, m, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  addSmoothNormals(geo);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m.mat));
  if (m.outline) g.add(new THREE.Mesh(geo, m.outline));
  g.position.set(...pos);
  g.rotation.set(...rot);
  g.scale.set(...scale);
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, ws = 16, hs = 10, t0 = 0, tl = Math.PI, p0 = 0, pl = Math.PI * 2) => new THREE.SphereGeometry(r, ws, hs, p0, pl, t0, tl);

function check(a, b, n = 8) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d'), s = 128 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? a : b; x.fillRect(i * s, j * s, s, s); }
  return c;
}

// --- pieces (origin at the anchor point, -z is the face) ------------------------------------------------------
const P = {
  nonLa(r = 1.55) {
    const g = new THREE.Group();
    g.add(part(new THREE.ConeGeometry(r, r * 0.62, 24), mat('#efd9a2'), [0, r * 0.31, 0]));
    for (const [y, k] of [[0.12, 0.8], [0.3, 0.55], [0.46, 0.3]]) g.add(part(new THREE.TorusGeometry(r * k, 0.03, 4, 28), mat('#c49a52', false), [0, y * r, 0], [Math.PI / 2, 0, 0]));
    return g;
  },
  // Quai nón: the chin ribbon, two thin strips down the cheeks.
  quai(color = '#e8574d') {
    const g = new THREE.Group();
    for (const x of [-0.72, 0.72]) g.add(part(box(0.09, 1.1, 0.09), mat(color, false), [x, -0.5, -0.1], [0, 0, x > 0 ? 0.25 : -0.25]));
    return g;
  },
  // Quang gánh: bamboo pole across the shoulder with two round baskets of fruit on strings.
  ganh() {
    const g = new THREE.Group();
    g.add(part(cyl(0.08, 0.08, 5.4, 8), mat('#b98a3e'), [0, 0, 0], [0, 0, 0], [1, 1, 1]));
    g.children[0].rotation.x = Math.PI / 2;
    for (const z of [-2.4, 2.4]) {
      for (const x of [-0.55, 0.55]) g.add(part(box(0.04, 1.6, 0.04), mat('#5a3b1c', false), [x * 0.7, -0.8, z + x * 0.0]));
      g.add(part(cyl(0.75, 0.55, 0.55, 18), mat('#c9944e'), [0, -1.75, z]));
      g.add(part(new THREE.TorusGeometry(0.75, 0.06, 6, 20), mat('#8a5a2b', false), [0, -1.48, z], [Math.PI / 2, 0, 0]));
      const fruit = z < 0 ? ['#ffd23d', '#ffd23d', '#7fd36b'] : ['#ff7a3d', '#e8574d', '#ff7a3d'];
      fruit.forEach((c, k) => g.add(part(sph(0.28, 10, 8), mat(c), [(k - 1) * 0.36, -1.35 + (k % 2) * 0.12, z + (k % 2 ? 0.2 : -0.15)])));
    }
    return g;
  },
  // Thân áo dài: two long panels (front and back) from the waist to below the knees, split at the sides.
  aoDai(color = '#ffffff', len = 1.7) {
    const g = new THREE.Group(), m = mat(color);
    const sh = new THREE.Shape();
    sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0.7, -len); sh.quadraticCurveTo(0, -len - 0.12, -0.7, -len); sh.closePath();
    const geo = () => new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false, curveSegments: 6 });
    g.add(part(geo(), m, [0, 0, -0.62], [-0.12, 0, 0]));
    g.add(part(geo(), m, [0, 0, 0.55], [0.12, 0, 0]));
    return g;
  },
  // Cổ áo dài: the stand-up collar.
  coAo(color = '#ffffff') {
    return part(cyl(0.3, 0.34, 0.32, 16), mat(color), [0, 0, 0]);
  },
  // Mũ bảo hiểm nửa đầu: half dome, a short brim and the chin strap.
  muBaoHiem(color = '#2f7fe0', r = 1.0) {
    const g = new THREE.Group();
    g.add(part(sph(r, 18, 10, 0, Math.PI / 2), mat(color), [0, 0, 0]));
    g.add(part(cyl(r * 1.02, r * 1.02, 0.12, 20), mat('#222222'), [0, 0.02, 0]));
    g.add(part(box(r * 1.1, 0.08, 0.5), mat('#222222'), [0, 0.05, -r * 0.95], [0.2, 0, 0]));
    g.add(part(box(0.2, 0.2, 0.06), mat('#ffffff', false), [0, r * 0.7, -r * 0.72], [-0.75, 0, 0]));
    return g;
  },
  // Khẩu trang: the cloth face mask over the lower face.
  khauTrang(color = '#7fb7ff', r = 1.0) {
    const g = new THREE.Group();
    g.add(part(sph(r * 1.03, 18, 8, Math.PI * 0.5, Math.PI * 0.22, Math.PI * 1.2, Math.PI * 0.6), mat(color), [0, 0, 0], [0, 0, 0], [0.85, 1, 1]));
    return g;
  },
  // Mũ cối: the pith helmet, olive dome with a wide flat brim and a red star.
  muCoi(r = 1.05) {
    const g = new THREE.Group();
    g.add(part(sph(r, 18, 10, 0, Math.PI / 2), mat('#9bb455'), [0, 0, 0], [0, 0, 0], [1, 0.95, 1.08]));
    g.add(part(cyl(r * 1.45, r * 1.45, 0.1, 22), mat('#9bb455'), [0, 0.02, 0], [0, 0, 0], [1, 1, 1.1]));
    g.add(part(new THREE.CircleGeometry(0.2, 5), mat('#ffd23d', false), [0, r * 0.55, -r * 0.88], [-0.6, 0, Math.PI / 2]));
    g.add(part(cyl(0.3, 0.3, 0.05, 14), mat('#e8574d'), [0, r * 0.55, -r * 0.86], [Math.PI / 2 - 0.6, 0, 0]));
    return g;
  },
  // Khăn đóng: the stiff black turban band of the old scholars.
  khanDong(r = 0.98) {
    const g = new THREE.Group();
    for (const y of [0.42, 0.24, 0.06]) g.add(part(new THREE.TorusGeometry(Math.sqrt(r * r - y * y) + 0.04, 0.12, 8, 28), mat('#222222'), [0, y, 0], [Math.PI / 2, 0, 0]));
    return g;
  },
  // Râu: a white goatee.
  rau() {
    return part(new THREE.ConeGeometry(0.25, 0.7, 10), mat('#f5f5f5'), [0, -0.3, 0], [Math.PI, 0, 0]);
  },
  // Khăn quàng đỏ: the red neckerchief, a band round the neck and the knot with two tails.
  khanQuang() {
    const g = new THREE.Group(), m = mat('#e8392f');
    g.add(part(new THREE.TorusGeometry(0.42, 0.1, 6, 18), m, [0, 0, 0], [Math.PI / 2, 0, 0]));
    g.add(part(new THREE.ConeGeometry(0.22, 0.6, 3), m, [0.1, -0.35, -0.42], [0.25, 0, Math.PI + 0.25]));
    g.add(part(new THREE.ConeGeometry(0.22, 0.6, 3), m, [-0.1, -0.35, -0.42], [0.25, 0, Math.PI - 0.25]));
    return g;
  },
  // Cặp sách: the school backpack.
  cap() {
    const g = new THREE.Group();
    g.add(part(box(1.0, 1.1, 0.45), mat('#2f7fe0'), [0, 0, 0]));
    g.add(part(box(0.8, 0.45, 0.12), mat('#ffd23d'), [0, -0.2, 0.26]));
    return g;
  },
  // Khăn rằn: the black-and-white checked scarf of the southern delta, knotted round the neck.
  khanRan() {
    const g = new THREE.Group(), m = texMat(check('#1d1d1d', '#f4f4f4'));
    g.add(part(new THREE.TorusGeometry(0.42, 0.13, 6, 18), m, [0, 0, 0], [Math.PI / 2, 0, 0]));
    g.add(part(box(0.24, 0.8, 0.06), m, [0.18, -0.45, -0.45], [0.15, 0, 0.12]));
    return g;
  },
  // Áo bà ba: a loose hip-length tunic hem with the curved front opening.
  baBa(color = '#8a4fd0') {
    const g = new THREE.Group(), m = mat(color);
    g.add(part(cyl(0.72, 0.85, 0.5, 18, 1), m, [0, 0, 0]));
    for (const y of [0.15, -0.05]) g.add(part(sph(0.06, 6, 4), mat('#ffffff', false), [0, y, -0.78]));
    return g;
  },
  // Gói xôi / ly trà đá held in the hand.
  traDa() {
    const g = new THREE.Group();
    g.add(part(cyl(0.26, 0.2, 0.6, 12), mat('#e6a04a'), [0, 0, 0]));
    g.add(part(cyl(0.27, 0.27, 0.05, 12), mat('#ffffff', false), [0, 0.3, 0]));
    return g;
  },
  // Cuộn thư pháp: the calligraphy scroll the scholar holds.
  thuPhap() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 192;
    const x = c.getContext('2d'); x.fillStyle = '#e8392f'; x.fillRect(0, 0, 64, 192);
    x.fillStyle = '#ffd23d'; x.font = '900 44px serif'; x.textAlign = 'center';
    ['P', 'H', 'Ú', 'C'].forEach((ch, k) => x.fillText(ch, 32, 44 + k * 44));
    const g = new THREE.Group();
    g.add(part(box(0.55, 1.5, 0.05), texMat(c), [0, 0, 0]));
    for (const y of [-0.8, 0.8]) g.add(part(cyl(0.06, 0.06, 0.75, 8), mat('#8a5a2b'), [0, y, 0], [0, 0, Math.PI / 2]));
    return g;
  },
};

// --- characters ----------------------------------------------------------------------------------------------
// A look is a base outfit from the game (cosmetics.glb, recoloured by palette swatch) plus rigid pieces hung on
// bones: [bone, piece, offset from the bone's rest position in the character frame, rotation].
// HEAD_C is the head ball's centre above the Head bone, HEAD_R its radius (eyeballed on stickman_Customer01).
const HEAD_C = 0.85, HEAD_R = 0.92;
// Swatches of the shared palette each base outfit samples (measured from the outfit UVs, palette-04da571a).
const SHIRT = ['#ff5d5d', '#d53d3d'], PANTS = ['#d8b06b', '#e7c28a'];      // Skin_CasualShirt
const TEE = ['#ffffff'], TEE2 = ['#579aed'], SHORTS = ['#63c141'];        // Skin_TShirtSuit
const swap = (from, to) => Object.fromEntries(from.map((f, k) => [f, Array.isArray(to) ? to[k] || to[0] : to]));

export const LOOKS = {
  'Nông dân áo xanh': {
    outfit: ['Skin_CasualShirt', { ...swap(SHIRT, ['#3f7fe0', '#2f62b8']), ...swap(PANTS, ['#2b3f78', '#34508c']) }],
    parts: [['Head', () => P.nonLa(1.65), [0, HEAD_C + 0.3, 0]]],
  },
  'Cô áo tím': {
    outfit: ['Skin_CasualShirt', { ...swap(SHIRT, ['#b05ae0', '#8f45c0']), ...swap(PANTS, ['#b05ae0', '#8f45c0']) }],
    parts: [['Head', () => P.nonLa(1.65), [0, HEAD_C + 0.3, 0]]],
  },
  'Bà chủ sạp': {
    outfit: ['Skin_CasualShirt', { ...swap(SHIRT, ['#8a4a2a', '#6e3a20']), ...swap(PANTS, ['#2b2b2b', '#3a3a3a']) }],
    parts: [['Head', () => P.nonLa(1.65), [0, HEAD_C + 0.3, 0]]],
  },
  'Cô bán hàng rong': {
    outfit: ['Skin_CasualShirt', { ...swap(SHIRT, ['#8a5ad8', '#6a3fb8']), ...swap(PANTS, ['#2b2b2b', '#3a3a3a']) }],
    parts: [
      ['Head', () => P.nonLa(1.7), [0, HEAD_C + 0.3, 0]],
      ['Head', () => P.quai(), [0, HEAD_C, 0]],
      ['Spine2', () => P.ganh(), [0.6, 0.5, 0]],
    ],
  },
  'Cô gái áo dài': {
    outfit: ['Skin_TShirtSuit', { ...swap(TEE2, '#ffffff'), ...swap(SHORTS, '#ffffff') }],
    parts: [
      ['Head', () => P.nonLa(1.65), [0, HEAD_C + 0.3, 0], [-0.2, 0, 0]],
      ['Neck', () => P.coAo('#ffffff'), [0, 0.05, 0]],
      ['Hips', () => P.aoDai('#ffffff', 1.5), [0, 0.3, 0]],
    ],
  },
  'Chú xe ôm': {
    outfit: ['Skin_CasualShirt', { ...swap(SHIRT, ['#4f9a3e', '#3b7a2e']), ...swap(PANTS, ['#34507a', '#3f5f8c']) }],
    parts: [
      ['Head', () => P.muBaoHiem('#2f7fe0', HEAD_R * 1.06), [0, HEAD_C + 0.05, 0]],
      ['Head', () => P.khauTrang('#7fb7ff', HEAD_R), [0, HEAD_C, 0]],
    ],
  },
  'Bác bảo vệ': {
    outfit: ['Skin_CasualShirt', { ...swap(SHIRT, ['#7d9a46', '#64803a']), ...swap(PANTS, ['#56702e', '#63803a']) }],
    parts: [
      ['Head', () => P.muCoi(HEAD_R * 1.08), [0, HEAD_C + 0.02, 0]],
      ['RightHand', () => P.traDa(), [0, -0.15, 0]],
    ],
  },
  'Ông đồ': {
    outfit: ['Skin_TShirtSuit', { ...swap(TEE, '#2b2b6e'), ...swap(TEE2, '#2b2b6e'), ...swap(SHORTS, '#f1f1f1') }],
    parts: [
      ['Head', () => P.khanDong(HEAD_R), [0, HEAD_C, 0]],
      ['Neck', () => P.coAo('#2b2b6e'), [0, 0.05, 0]],
      ['Hips', () => P.aoDai('#2b2b6e', 1.6), [0, 0.3, 0]],
      ['LeftHand', () => P.thuPhap(), [0, -0.6, -0.15]],
    ],
  },
  'Bé đi học': {
    outfit: ['Skin_TShirtSuit', { ...swap(TEE2, '#ffffff'), ...swap(SHORTS, '#25407e') }],
    parts: [
      ['Neck', () => P.khanQuang(), [0, 0.05, 0]],
      ['Spine2', () => P.cap(), [0, -0.2, 0.7]],
    ],
  },
  'Chủ tiệm (người chơi)': {
    outfit: ['Skin_CasualShirt', { ...swap(SHIRT, ['#a8622f', '#8a4f24']), ...swap(PANTS, ['#2b2b2b', '#3a3a3a']) }],
    parts: [
      ['Head', () => P.nonLa(1.65), [0, HEAD_C + 0.3, 0], [0.15, 0, 0]],
      ['Neck', () => P.khanRan(), [0, 0.05, 0]],
    ],
  },
};

const FRAMED = new Set(['Hips', 'Spine2', 'Neck', 'Head']);

function bone(root, n) {
  let b = null;
  root.traverse(x => { if (!b && x.name === 'mixamorig:' + n) b = x; });
  return b;
}

// The palette with some swatches replaced, as a toon material like the outfit's own (aToon_Palette_Outline).
const paletteCache = new Map();
function recolour(looks, map) {
  const key = JSON.stringify(map);
  if (paletteCache.has(key)) return paletteCache.get(key);
  const src = looks.mats[0], img = src.mat.uniforms.map.value.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const pairs = Object.entries(map).map(([f, t]) => [rgb(f), rgb(t)]);
  for (let k = 0; k < px.length; k += 4) {
    for (const [f, t] of pairs) if (Math.abs(px[k] - f[0]) + Math.abs(px[k + 1] - f[1]) + Math.abs(px[k + 2] - f[2]) < 6) { px[k] = t[0]; px[k + 1] = t[1]; px[k + 2] = t[2]; break; }
  }
  x.putImageData(d, 0, 0);
  const m = makeMaterial({ color: [1, 1, 1, 1], toon: TOON, outline: { w: 2, color: [0, 0, 0, 1] } }, '', []);
  const t = new THREE.CanvasTexture(c);
  const o = src.mat.uniforms.map.value;
  t.colorSpace = o.colorSpace; t.flipY = o.flipY; t.magFilter = o.magFilter; t.minFilter = o.minFilter; t.generateMipmaps = o.generateMipmaps;
  m.mat.uniforms.map.value = t;
  m.mat.uniforms.hasMap.value = true;
  paletteCache.set(key, m);
  return m;
}

// Hide the original hats, put on the recoloured base outfit, then hang every piece on its bone. root must have
// rotation 0 (its local -z is the face) and be in the world so its bones have world matrices.
// look: a LOOKS name or a look object; without `looks` the outfit is left as it is.
export function dress(root, look, looks = null) {
  const L = typeof look === 'string' ? LOOKS[look] : look;
  root.traverse(x => { if (x !== root && /^(hat_|Santa Hat|Reindeer|stickman_Player_Hat)/.test(x.name)) x.visible = false; });
  root.updateMatrixWorld(true);
  if (L.outfit && looks) wearOutfit(root, looks, L.outfit[0], recolour(looks, L.outfit[1]));
  const v = new THREE.Vector3(), rootQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const [bn, make, off, rot] of L.parts) {
    const b = bone(root, bn);
    if (!b) continue;
    const piece = make();
    piece.name = `vn_${bn}`;
    b.getWorldPosition(v);
    // Spine, neck, head and hips bones point up their local y with the face down -z, so pieces there sit in the
    // bone's own frame and stay square to a tilted head or a twisted pelvis. Hands keep the body frame.
    const q = FRAMED.has(bn) ? rootQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Quaternion();
    piece.position.copy(root.worldToLocal(v.clone()).add(new THREE.Vector3(...off).applyQuaternion(q)));
    piece.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))));
    root.add(piece);
    piece.updateMatrixWorld(true);
    b.attach(piece);
  }
}

// Wear one of the game's own outfit meshes (cosmetics.glb, skinned on the same 22 Mixamo bones) on any rig: the
// player's bone order from Looks, looked up by name on root. m: a makeMaterial result or null for the original.
export function wearOutfit(root, looks, outfitName, m = null) {
  const row = looks.data.outfits.find(o => o.name === outfitName);
  if (!row || row.mesh == null) return null;
  const byName = new Map();
  root.traverse(x => { if (/^mixamorig:/.test(x.name) && !byName.has(x.name)) byName.set(x.name, x); });
  const bones = looks.bones.map(b => byName.get(b.name));
  if (bones.some(b => !b)) return null;
  const info = looks.data.meshes[row.mesh], g = looks.geo[row.mesh];
  const sk = new THREE.Skeleton(bones, info.bind.map(a => new THREE.Matrix4().fromArray(a).multiply(g.q)));
  const mm = m || looks.mats[(row.mats || [0])[0]] || looks.mats[0];
  let host = null;
  root.traverse(x => { if (!host && x.isSkinnedMesh && /stickman/.test(x.parent.name)) host = x.parent; });
  const out = [];
  for (const mat of [mm.mat, mm.outline]) {
    if (!mat) continue;
    const mesh = new THREE.SkinnedMesh(g.geometry, mat);
    mesh.bind(sk, new THREE.Matrix4());
    mesh.frustumCulled = false;
    (host || root).add(mesh);
    out.push(mesh);
  }
  return out;
}
