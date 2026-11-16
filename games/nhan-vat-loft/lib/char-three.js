// THREE glue for lib/char.js: skeleton from the table's rest TRS, toon SkinnedMesh + inverted-hull outline, face decal,
// clips (the heroes' own, as JSON) and spring chains.
import * as THREE from '../vendor/three.module.min.js';
import { buildCharacter, normals } from './char.js';
import { drawFace } from './face.js';
import { Springs } from './springs.js';

export const safe = (n) => n.replace(/[^A-Za-z0-9_]/g, '_');
let grad = null;
export function toonGradient() {
  if (grad) return grad;
  grad = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true; return grad;
}
export function outlineMaterial(w = 0.0035, color = 0x2a1a1e) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float olw;').replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${w.toFixed(5)} * olw;`); };
  return m;
}

export function makeCharacter(table, opts = {}) {
  const t0 = performance.now();
  const arr = buildCharacter(table, opts);
  const nrm = normals(arr);
  const msGen = performance.now() - t0;
  // skeleton
  const bones = [], byName = {}, root = new THREE.Group();
  table.skel.names.forEach((n, i) => {
    const b = new THREE.Bone(); b.name = safe(n); const t = table.skel.trs[i];
    b.position.set(t[0], t[1], t[2]); b.quaternion.set(t[3], t[4], t[5], t[6]); b.scale.set(t[7], t[8], t[9]);
    bones.push(b); byName[n] = b; byName[safe(n)] = b;
  });
  table.skel.parent.forEach((p, i) => (p >= 0 ? bones[p].add(bones[i]) : root.add(bones[i])));
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(arr.color.map((c) => Math.pow(c, 2.2)), 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(arr.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(arr.skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(arr.index, 1));
  g.setAttribute('olw', new THREE.BufferAttribute(arr.outlineW || new Float32Array(arr.position.length / 3).fill(1), 1));
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  // soft rim light on top of the 3-step toon ramp (anime look)
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
 float rimF = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
 gl_FragColor.rgb += vec3(0.16) * smoothstep(0.62, 0.95, rimF);`); };
  const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false;
  const group = new THREE.Group(); group.add(root); group.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());
  if (opts.outline !== 0) { const o = new THREE.SkinnedMesh(g, outlineMaterial(opts.outline || 0.0035)); o.frustumCulled = false; o.bind(skeleton, new THREE.Matrix4()); group.add(o); }
  // face decal
  let faceMesh = null;
  if (arr.face && arr.face.index.length) {
    const size = 1024, cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (cv) {
      cv.width = cv.height = size; drawFace(cv.getContext('2d'), size, table.face);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const fg = new THREE.BufferGeometry(); const nv = arr.face.position.length / 3;
      fg.setAttribute('position', new THREE.BufferAttribute(arr.face.position, 3)); fg.setAttribute('uv', new THREE.BufferAttribute(arr.face.uv, 2));
      fg.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(nv * 4).map((_, k) => (k % 4 === 0 ? arr.face.bone : 0)), 4));
      fg.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(nv * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
      fg.setIndex(new THREE.BufferAttribute(arr.face.index, 1));
      { const hc = table.head.center, pp = arr.face.position, nn = new Float32Array(pp.length); for (let i = 0; i < pp.length; i += 3) { const d = [pp[i] - hc[0], pp[i + 1] - hc[1], pp[i + 2] - hc[2]]; const l = Math.hypot(...d) || 1; nn[i] = d[0] / l; nn[i + 1] = d[1] / l; nn[i + 2] = d[2] / l; } fg.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); }
      const fm = new THREE.MeshToonMaterial({ map: tex, transparent: true, gradientMap: toonGradient(), polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
      faceMesh = new THREE.SkinnedMesh(fg, fm); faceMesh.frustumCulled = false; faceMesh.bind(skeleton, new THREE.Matrix4()); faceMesh.renderOrder = 2; group.add(faceMesh);
      faceMesh.userData.canvas = cv;
      let closed = false; faceMesh.userData.setBlink = (c) => { if (c === closed) return; closed = c; drawFace(cv.getContext('2d'), size, table.face, { closed: c }); tex.needsUpdate = true; };
    }
  }
  const springs = opts.springs === false ? null : new Springs(root, byName, table, opts.springOpts);
  return { group, mesh, root, bones: byName, skeleton, arr, springs, faceMesh, stats: { verts: arr.position.length / 3, tris: arr.index.length / 3, msGen, msTotal: performance.now() - t0 } };
}

// clips JSON: { name: { d: duration, tr: [[boneName, 'q'|'t'|'s', 'L'|'S', times[], values[]]] } }
export function makeClips(json, bones) {
  const out = {};
  for (const [name, c] of Object.entries(json)) {
    const tracks = [];
    for (const [bn, p, interp, times, vals] of c.tr) {
      const b = bones[bn]; if (!b) continue;
      const key = `${safe(bn)}.${p === 'q' ? 'quaternion' : p === 't' ? 'position' : 'scale'}`;
      const T = p === 'q' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      tracks.push(new T(key, times, vals, interp === 'S' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear));
    }
    out[name] = new THREE.AnimationClip(name, c.d, tracks);
  }
  return out;
}
