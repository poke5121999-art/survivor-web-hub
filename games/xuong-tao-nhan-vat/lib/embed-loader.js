// Decode a hero module made by tools/embed.mjs into three.js pieces, and assemble a character from parts of several
// heroes on one skeleton (the base hero's), with a hue-window recolour in the toon shader.
import * as THREE from '../vendor/three.module.min.js';

const b64 = (s, T) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
const grad = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;

export function rgb2hsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-6) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
  return [h, mx > 0 ? d / mx : 0, mx];
}
export const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const rgb2hex = (c) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');

// rest world matrices of a skeleton def
function restWorld(skel) {
  const W = []; const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  skel.trs.forEach((t, i) => { m.compose(p.fromArray(t, 0), q.fromArray(t, 3), s.fromArray(t, 7)); W[i] = skel.parent[i] < 0 ? m.clone() : W[skel.parent[i]].clone().multiply(m); });
  return W;
}

export async function decodeHero(E) {
  const t0 = performance.now();
  const tex = {};
  await Promise.all(Object.entries(E.tex).map(async ([k, t]) => {
    const blob = new Blob([b64(t.data, Uint8Array)], { type: 'image/webp' });
    const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const tx = new THREE.Texture(bmp); tx.flipY = false; tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4; tx.needsUpdate = true; tex[k] = tx;
  }));
  const parts = E.parts.map((p) => {
    const n = p.nv, q = b64(p.pos, Uint16Array), pos = new Float32Array(n * 3), bb = p.bbox;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = bb[c] + (q[i * 3 + c] / 65535) * (bb[c + 3] - bb[c]);
    const on = b64(p.nrm, Int8Array), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { let x = on[i * 2] / 127, y = on[i * 2 + 1] / 127; const z = 1 - Math.abs(x) - Math.abs(y); if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); } const l = Math.hypot(x, y, z) || 1; nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (p.uv) { const qu = b64(p.uv, Uint16Array), uv = new Float32Array(n * 2), r = p.uvr; for (let i = 0; i < n; i++) { uv[i * 2] = r[0] + (qu[i * 2] / 65535) * r[2]; uv[i * 2 + 1] = r[1] + (qu[i * 2 + 1] / 65535) * r[3]; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
    g.setAttribute('skinWeight', new THREE.BufferAttribute(b64(p.sw, Uint8Array), 4, true));
    g.setIndex(new THREE.BufferAttribute(p.i32 ? b64(p.idx, Uint32Array) : b64(p.idx, Uint16Array), 1));
    g.computeBoundingSphere();
    return { def: p, geo: g, si: b64(p.si, Uint8Array) };
  });
  const clips = {};
  for (const [key, c] of Object.entries(E.clips)) {
    const tracks = [];
    for (const [bi, path, step, ts, vs] of c.tr) {
      const times = Float32Array.from(b64(ts, Uint16Array), (x) => x / 1000); const name = THREE.PropertyBinding.sanitizeNodeName(bi === 0 ? '__root__' : E.skel.names[bi]);
      if (path === 'r') { const v = Float32Array.from(b64(vs, Int16Array), (x) => x / 32767); for (let i = 0; i < v.length; i += 4) { const l = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]) || 1; for (let k = 0; k < 4; k++) v[i + k] /= l; }
        tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, v, step ? THREE.InterpolateDiscrete : undefined)); }
      else tracks.push(new THREE.VectorKeyframeTrack(name + (path === 't' ? '.position' : '.scale'), times, b64(vs, Float32Array), step ? THREE.InterpolateDiscrete : undefined));
    }
    clips[key] = new THREE.AnimationClip(key, c.d, tracks);
  }
  const H = { hero: E.hero, family: E.family, skel: E.skel, W: restWorld(E.skel), tex, parts, clips, ms: performance.now() - t0 };
  H.index = new Map(E.skel.names.map((n, i) => [i === 0 ? '__root__' : n, i]));
  return H;
}

const RC_VERT = '';
const RC_FRAG_HEAD = `uniform vec4 uRc; uniform vec3 uDom; uniform vec3 uTgt;
vec3 rc_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
vec3 rc_hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
`;
const RC_FRAG = `#include <map_fragment>
if (uRc.x > 0.5) {
  vec3 srgb = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)); vec3 h = rc_rgb2hsv(srgb);
  float dh = abs(h.x - uDom.x); dh = min(dh, 1.0 - dh); float w; vec3 n;
  if (uRc.w > 0.5) { w = 1.0 - smoothstep(0.2, 0.34, h.y); n = vec3(uTgt.x, uTgt.y, h.z * uTgt.z / max(uDom.z, 0.04)); }
  else { w = (1.0 - smoothstep(uRc.y, uRc.y + 0.06, dh)) * smoothstep(uRc.z, uRc.z + 0.08, h.y); n = vec3(fract(h.x + uTgt.x - uDom.x), h.y * uTgt.y / max(uDom.y, 0.04), h.z * uTgt.z / max(uDom.z, 0.04)); }
  n = clamp(n, vec3(0.0), vec3(1.0)); srgb = mix(srgb, rc_hsv2rgb(n), w);
  diffuseColor.rgb = pow(srgb, vec3(2.2));
}`;

function partMaterial(H, d) {
  const map = d.tex !== null && d.uv ? H.tex[d.tex] : null;
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color().setRGB(d.color[0], d.color[1], d.color[2], THREE.SRGBColorSpace), map, gradientMap: grad,
    side: d.double ? THREE.DoubleSide : THREE.FrontSide, transparent: !!map && d.alpha === 'BLEND', alphaTest: map && d.alpha !== 'OPAQUE' ? 0.3 : 0, depthWrite: !(map && d.alpha === 'BLEND' && d.cat === 'facedetail') });
  const dom = d.dom || [0.5, 0.5, 0.5], dh = rgb2hsv(dom);
  const g = groupOf(d), win = g === 'hair' ? 0.22 : g === 'skin' ? 0.07 : 0.09, satLo = g === 'skin' ? 0.04 : g === 'hair' ? 0.06 : 0.1;
  m.userData.rc = { uRc: { value: new THREE.Vector4(0, win, satLo, dh[1] < 0.15 && g !== 'skin' ? 1 : 0) }, uDom: { value: new THREE.Vector3(...dh) }, uTgt: { value: new THREE.Vector3(...dh) } };
  m.onBeforeCompile = (s) => { Object.assign(s.uniforms, m.userData.rc); s.fragmentShader = RC_FRAG_HEAD + s.fragmentShader.replace('#include <map_fragment>', RC_FRAG); };
  m.customProgramCacheKey = () => 'rc';
  return m;
}
export function setRecolor(mat, hex) {
  const rc = mat.userData.rc; if (!rc) return;
  if (!hex) { rc.uRc.value.x = 0; return; }
  rc.uRc.value.x = 1; rc.uTgt.value.set(...rgb2hsv(hex2rgb(hex)));
}

function outlineMat(w) {
  const m = new THREE.MeshBasicMaterial({ color: 0x24181a, side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${w.toFixed(5)};`); };
  return m;
}

// the recolour group a part belongs to (one picker per group)
export function groupOf(d) {
  if (d.slot === 'body') return 'skin';
  if (d.slot === 'face') return /face/i.test(d.mat) && !/line|lash|last|brow/i.test(d.mat) && !/^(Brow|Lash|Eye_base|EB_|BLW|EL_)/.test(d.node) ? 'skin' : null;
  return d.slot;
}

// Build a character: base hero H (skeleton + clips) and a list of [heroDecoded, part] to wear.
export function assemble(H, wear, opts = {}) {
  const group = new THREE.Group(); group.name = 'char';
  const bones = [], byName = new Map(), names = [], restW = [];
  const addBone = (name, trs, parentIdx) => {
    const b = new THREE.Bone(); b.name = THREE.PropertyBinding.sanitizeNodeName(name);
    b.position.fromArray(trs, 0); b.quaternion.fromArray(trs, 3); b.scale.fromArray(trs, 7);
    (parentIdx < 0 ? group : bones[parentIdx]).add(b); bones.push(b); byName.set(name, bones.length - 1); names.push(name); return bones.length - 1;
  };
  H.skel.names.forEach((n, i) => addBone(i === 0 ? '__root__' : n, H.skel.trs[i], H.skel.parent[i]));
  // bones a donor needs that the base lacks: attach under the nearest ancestor the base has
  const mapDonor = (D) => {
    const m = new Int32Array(D.skel.names.length);
    D.skel.names.forEach((n0, i) => {
      const n = i === 0 ? '__root__' : n0;
      if (byName.has(n)) { m[i] = byName.get(n); return; }
      const p = D.skel.parent[i]; m[i] = addBone(n, D.skel.trs[i], p < 0 ? -1 : m[p]);
    });
    return m;
  };
  const maps = new Map(); for (const [D] of wear) if (!maps.has(D)) maps.set(D, D === H ? null : mapDonor(D));
  group.updateMatrixWorld(true);
  const unionW = bones.map((b) => b.matrixWorld.clone());
  const meshes = [];
  const ow = opts.outline ?? 0.0035;
  for (const [D, P] of wear) {
    const m = maps.get(D); const nv = P.def.nv; const si = new Uint16Array(nv * 4);
    for (let i = 0; i < nv * 4; i++) si[i] = m ? m[P.si[i]] : P.si[i];
    const geo = P.geo.clone(); geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    // inverse bind: the donor's own rest world for bones it has, else the union rest
    const inv = bones.map((b, k) => { const di = D.index.get(names[k]); return (di !== undefined ? D.W[di] : unionW[k]).clone().invert(); });
    const skeleton = new THREE.Skeleton(bones, inv);
    const mat = partMaterial(D, P.def);
    const sm = new THREE.SkinnedMesh(geo, mat); sm.bind(skeleton, new THREE.Matrix4()); sm.frustumCulled = false;
    sm.userData = { def: P.def, hero: D.hero, group: groupOf(P.def) };
    if (P.def.cat === 'facedetail') sm.renderOrder = 2;
    group.add(sm); meshes.push(sm);
    if (ow > 0 && P.def.cat !== 'facedetail' && P.def.cat !== 'face' && P.def.slot !== 'glasses') {
      const o = new THREE.SkinnedMesh(geo, outlineMat(P.def.cat === 'hair' ? ow * 0.7 : ow)); o.bind(skeleton, new THREE.Matrix4()); o.frustumCulled = false; group.add(o); sm.userData.outline = o;
    }
  }
  return { group, bones, meshes, byName };
}
