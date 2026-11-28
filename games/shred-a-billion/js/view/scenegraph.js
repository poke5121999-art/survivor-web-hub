// Loads an exported Unity scene slice (art/<name>/scene.glb + scene.json) into a THREE.Group.
import { V } from '../rev.js';
// Geometry is in three.js space already (z flipped by tools/export_scene.py); one node per Unity renderer.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

const texLoader = new THREE.TextureLoader();
const texCache = new Map();

function loadTex(base, info, srgb) {
  const key = base + info.file + (srgb ? 's' : 'l');
  if (texCache.has(key)) return texCache.get(key);
  const t = texLoader.load(base + 'tex/' + info.file + V);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = false;   // exporter writes glTF-style UVs (v flipped)
  t.wrapS = info.wrap && info.wrap[0] === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapT = info.wrap && info.wrap[1] === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (info.scale) t.repeat.set(info.scale[0], info.scale[1]);
  if (info.offset) t.offset.set(info.offset[0], 1 - info.offset[1] - (info.scale ? info.scale[1] : 1));
  texCache.set(key, t);
  return t;
}

export function buildMaterial(base, m, opts = {}) {
  const transparent = m.Surface === 1;
  const params = {
    color: new THREE.Color(m.color[0], m.color[1], m.color[2]),
    metalness: m.Metallic ?? 0,
    roughness: 1 - (m.Smoothness ?? 0.5),
    transparent,
    opacity: transparent ? m.color[3] : 1,
    side: m.Cull === 0 ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: false,
  };
  if (m._BaseMap) params.map = loadTex(base, m._BaseMap, true);
  if (m.AlphaClip === 1) params.alphaTest = m.Cutoff ?? 0.5;
  const e = m.emission || [0, 0, 0];
  if (e[0] + e[1] + e[2] > 0) {
    params.emissive = new THREE.Color(e[0], e[1], e[2]);
    if (m._EmissionMap) params.emissiveMap = loadTex(base, m._EmissionMap, true);
  }
  if (transparent) params.depthWrite = false;
  const mat = opts.unlit ? new THREE.MeshBasicMaterial({ color: params.color, map: params.map, transparent, opacity: params.opacity, side: params.side })
    : new THREE.MeshStandardMaterial(params);
  mat.name = m.name;
  mat.userData.src = m;
  return mat;
}

export async function loadSlice(base, opts = {}) {
  const [meta, gltf] = await Promise.all([
    fetch(base + 'scene.json' + V).then(r => r.json()),
    new GLTFLoader().loadAsync(base + 'scene.glb' + V),
  ]);
  const geoms = {};   // unity mesh index -> [BufferGeometry per primitive with .userData.sub]
  gltf.scene.traverse(o => {
    if (o.isMesh) {
      // GLTFLoader puts multi-primitive meshes under a Group named m<i>; single prims are the Mesh itself
    }
  });
  for (const child of gltf.scene.children) {
    const idx = +child.name.slice(1);
    const list = [];
    const collect = (o) => { if (o.isMesh) list.push(o); };
    if (child.isMesh) collect(child); else child.children.forEach(collect);
    geoms[idx] = list.map((m, k) => {
      const g = m.geometry;
      if (g.userData.sub == null) g.userData.sub = k;
      return g;
    });
  }
  const mats = meta.materials.map(m => buildMaterial(base, m, opts));
  const group = new THREE.Group();
  const byPath = new Map();
  const tmp = new THREE.Matrix4();
  for (const n of meta.nodes) {
    const gl = geoms[n.mesh];
    if (!gl) continue;
    tmp.fromArray(n.m);
    for (const g of gl) {
      const sub = g.userData.sub;
      const mi = n.mats[Math.min(sub, n.mats.length - 1)];
      if (sub >= n.mats.length) continue;   // Unity skips submeshes without a material
      const mesh = new THREE.Mesh(g, mi >= 0 ? mats[mi] : new THREE.MeshStandardMaterial({ color: 0xff00ff }));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(tmp);
      mesh.name = n.path;
      mesh.userData.path = n.path;
      group.add(mesh);
      if (!byPath.has(n.path)) byPath.set(n.path, []);
      byPath.get(n.path).push(mesh);
    }
  }
  return { meta, group, mats, byPath };
}
