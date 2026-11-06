// Free models (art/models, credits in theme.js) redrawn with the game's toon shader and set round Store 1's yard, plus
// the market sign and the flags drawn on canvases. Every prop inside the walkable area also blocks like the original's
// NavMeshObstacle boxes (OBSTACLES, added to the navmesh before the grid is built), so nobody walks through a palm.
import * as THREE from 'three';
import { makeMaterial, addSmoothNormals } from '../../casual-farm/js/view/toon.js';

const TOON = { h: [1, 1, 1, 1], s: [0, 0, 0, 1], thr: 0.767, smooth: 0.594 };
const MODELS = new URL('../art/models/', import.meta.url).href;

// m: model file, at: [x, z] in Store 1's world, h: height in game units (the player is about 3.2), ry: yaw in degrees,
// block: [w, d] footprint that blocks walking (none outside the navmesh), clip: looping animation.
// Customers walk in from the back (spawns at z -76, doors at z -43) and the left door (x -24); those lanes stay clear.
export const PROPS = [
  // back corners and the strip between the two back doors (seen over the shop from inside it)
  { m: 'dua', at: [-62, -60], h: 11, block: [2, 2] },
  { m: 'tre', at: [-72, -46], h: 9, block: [3, 3] },
  { m: 'tre', at: [-56, -70], h: 8, ry: 70, block: [3, 3] },
  { m: 'choi', at: [37, -66], h: 7, ry: 180, block: [9, 9] },
  { m: 'dua', at: [24, -58], h: 10, ry: 160, block: [2, 2] },
  { m: 'dua', at: [124, -50], h: 10, ry: 40, block: [2, 2] },
  // right yard, inside the fence, seen from the cow and the right-hand shelves
  { m: 'sap', at: [108, -22], h: 5.5, ry: -90, block: [7, 5] },
  { m: 'dua', at: [112, 4], h: 10, ry: 120, block: [2, 2] },
  { m: 'rom', at: [104, 22], h: 2.6, block: [3, 3] },
  { m: 'trau', at: [104, 40], h: 3.4, ry: -60, block: [6, 3], clip: 'Eating', tint: { Main: '#8a8f98', Main_Light: '#a9aeb6', Muzzle: '#6b6f76' } },
  { m: 'tre', at: [124, 50], h: 9, block: [3, 3] },
  { m: 'xe-dap', at: [100, 15], h: 2.4, ry: 75, block: [4, 1.5] },
  // below the farm, inside the bottom fence
  { m: 'xe-day', at: [-28, 52], h: 3.4, ry: 20, block: [5, 3] },
  { m: 'rom', at: [38, 50], h: 2.4, block: [3, 3] },
  { m: 'rom', at: [66, 50], h: 2.8, ry: 50, block: [3, 3] },
  { m: 'dua', at: [-38, 56], h: 10, block: [2, 2] },
  { m: 'tre', at: [6, 55], h: 8, ry: 30, block: [3, 3] },
  // left of the left fence, clear of the spawn at (-49, 28) and the exit at (-76, 8)
  { m: 'sap', at: [-60, 44], h: 5.5, ry: 90, block: [7, 5] },
  { m: 'dua', at: [-58, 58], h: 11, ry: 200, block: [2, 2] },
  // by the front of the shop
  { m: 'vespa', at: [-14, 18], h: 2.6, ry: 100, block: [4, 2] },
  // red lanterns under the door awnings (no block: they hang)
  { m: 'long-den', at: [-14, -50], y: 5.2, h: 1.6 },
  { m: 'long-den', at: [2, -50], y: 5.2, h: 1.6 },
  { m: 'long-den', at: [83, -50], y: 5.2, h: 1.6 },
  { m: 'long-den', at: [99, -50], y: 5.2, h: 1.6 },
];

// NavMeshObstacle-shaped boxes for the props that block; names match no scene node, so the store's gates leave them
// always solid.
export function obstacles() {
  const out = PROPS.filter(p => p.block).map((p, i) => {
    const a = (p.ry || 0) * Math.PI / 360;
    return { name: `ChoViet_${i}_${p.m}`, shape: 'box', carve: true, center: [p.at[0], 0.5, p.at[1]], size: [p.block[0], 1, p.block[1]], rot: [0, Math.sin(a), 0, Math.cos(a)] };
  });
  out.push(...SIGNS.map((s, i) => ({ name: `ChoViet_sign${i}`, shape: 'box', carve: true, center: [s.at[0], 0.5, s.at[1]], size: [s.block[0], 1, s.block[1]], rot: [0, Math.sin(FACE / 2), 0, Math.cos(FACE / 2)] })));
  return out;
}

// Colours here are display (sRGB) values, as the toon shader takes them.
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).concat(1);

// The game's toon material for one glTF material: base colour (linear in glTF, so gamma-corrected) or texture kept.
function toon(src, tint, skinned) {
  const c = tint[src.name] ? hex(tint[src.name])
    : src.color ? [src.color.r, src.color.g, src.color.b].map(v => Math.pow(v, 1 / 2.2)).concat(1) : [1, 1, 1, 1];
  const t = makeMaterial({ color: c, toon: TOON, outline: { w: 2, color: [0, 0, 0, 1] } }, '', [], { skinned });
  if (src.map) { t.mat.uniforms.map.value = src.map; t.mat.uniforms.hasMap.value = true; }
  if (src.transparent || src.alphaTest > 0) t.mat.uniforms.cutoff.value = 0.5;
  return t;
}

// Swap each mesh's materials for toon ones (one per group on multi-material meshes, vertex colours dropped), with the
// black inverted-hull outline; skinned meshes get a skinned outline on the same skeleton.
function toonify(root, tint = {}) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    m.geometry.deleteAttribute('color');
    const ts = [].concat(m.material).map(src => toon(src, tint, !!m.isSkinnedMesh));
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    addSmoothNormals(geo);
    m.geometry = geo;
    const many = Array.isArray(m.material);
    m.material = many ? ts.map(t => t.mat) : ts[0].mat;
    const outline = many ? ts.map(t => t.outline) : ts[0].outline;
    if (m.isSkinnedMesh) {
      const ol = new THREE.SkinnedMesh(geo, outline);
      ol.bind(m.skeleton, m.bindMatrix);
      ol.frustumCulled = false;
      m.frustumCulled = false;
      m.parent.add(ol);
    } else m.add(new THREE.Mesh(geo, outline));
  }
}

// A model scaled to `h` tall, its base centred on the origin.
async function model(loader, p) {
  const gltf = await loader.loadAsync(`${MODELS}${p.m}.glb`);
  const obj = gltf.scene;
  toonify(obj, p.tint);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const wrap = new THREE.Group();
  wrap.name = `ChoViet_${p.m}`;
  wrap.add(obj);
  wrap.scale.setScalar(p.h / Math.max(size.y, 1e-3));
  let mixer = null;
  const clip = p.clip && gltf.animations.find(a => a.name === p.clip);
  if (clip) {
    mixer = new THREE.AnimationMixer(obj);
    mixer.clipAction(clip).play();
    // Herds out of step.
    mixer.update(Math.random() * clip.duration);
  }
  return { wrap, mixer };
}

// Loads and places every prop under `parent`. Returns the animation mixers to tick.
export async function placeProps(loader, parent) {
  const made = await Promise.all(PROPS.map(p => model(loader, p).catch(e => { console.error(`prop ${p.m}: ${e.message}`); return null; })));
  const mixers = [];
  made.forEach((r, i) => {
    if (!r) return;
    const p = PROPS[i];
    r.wrap.position.set(p.at[0], p.y || 0, p.at[1]);
    r.wrap.rotation.y = (p.ry || 0) * Math.PI / 180;
    parent.add(r.wrap);
    if (r.mixer) mixers.push(r.mixer);
  });
  for (const s of SIGNS) parent.add(s.make());
  return mixers;
}

// --- canvas props -------------------------------------------------------------------------------------------------
function toonPart(geo, color, map = null) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  addSmoothNormals(geo);
  const t = makeMaterial({ color: hex(color), toon: TOON, outline: { w: 2, color: [0, 0, 0, 1] } }, '', []);
  if (map) { t.mat.uniforms.map.value = map; t.mat.uniforms.hasMap.value = true; }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, t.mat));
  g.add(new THREE.Mesh(geo, t.outline));
  return g;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Cờ đỏ sao vàng on a bamboo pole.
function flag() {
  const g = new THREE.Group();
  g.add(toonPart(new THREE.CylinderGeometry(0.18, 0.22, 11, 8), '#c9a25a').translateY(5.5));
  const tex = canvasTexture(192, 128, (x, w, h) => {
    x.fillStyle = '#da251d'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffde00'; x.beginPath();
    const R = h * 0.3, cx = w / 2, cy = h / 2;
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? R * 0.382 : R, a = -Math.PI / 2 + k * Math.PI / 5;
      x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    x.fill();
  });
  const cloth = toonPart(new THREE.BoxGeometry(4.2, 2.8, 0.08), '#ffffff', tex);
  cloth.position.set(2.25, 9.4, 0);
  g.add(cloth);
  return g;
}

// The shop sign: red board, yellow letters, on two poles, facing the camera.
function sign() {
  const g = new THREE.Group();
  const tex = canvasTexture(1024, 224, (x, w, h) => {
    x.fillStyle = '#c8261e'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#ffd23d'; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28);
    x.fillStyle = '#ffd23d'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 112px "Baloo 2", "Segoe UI", sans-serif';
    x.fillText('TẠP HÓA CHỢ VIỆT', w / 2, h / 2 + 8);
  });
  const board = toonPart(new THREE.BoxGeometry(23, 5, 0.4), '#ffffff', tex);
  board.position.y = 13.5;
  g.add(board);
  for (const x of [-9, 9]) g.add(toonPart(new THREE.CylinderGeometry(0.3, 0.3, 13, 8), '#8a5a2b').translateX(x).translateY(6.5));
  return g;
}

// The camera looks from (+77, +254, +311): facing yaw 14 degrees turns a board square to it.
const FACE = Math.atan2(77.38, 310.62);
const SIGNS = [
  { at: [40, -48], block: [19, 1.2], make() { const s = sign(); s.position.set(40, 0, -48); s.rotation.y = FACE; return s; } },
  { at: [-52, -48], block: [1, 1], make() { const f = flag(); f.position.set(-52, 0, -48); f.rotation.y = FACE; return f; } },
  { at: [118, -42], block: [1, 1], make() { const f = flag(); f.position.set(118, 0, -42); f.rotation.y = FACE; return f; } },
];
