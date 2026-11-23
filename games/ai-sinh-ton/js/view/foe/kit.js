// The foe kit: zombie bodies written as primitives in model space (metres, +z forward, y up, feet at 0), merged into one
// geometry per kind. Every vertex carries the bone that moves it (aBone) and that bone's pivot (aPiv), so the vertex
// shader animates a whole horde of one kind in one instanced draw: legs and arms swing about their own joint, the upper
// body pitches about the hip, the whole body falls about the feet. aMat.x makes a vertex glow, aMat.y marks cloth the
// instance may recolour.
// Bones: 0 upper body, 1 head, 2/3 arms L/R, 4/5 legs (set A/B), 6/7 wings L/R, 8 tail, 9 hips (still).
const THREE = window.THREE;

export const BONE = { body: 0, head: 1, armL: 2, armR: 3, legA: 4, legB: 5, wingL: 6, wingR: 7, tail: 8, hips: 9 };
const V = (a) => (a ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3());
const PRIM = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  ball: () => new THREE.SphereGeometry(0.5, 8, 6),
  ball4: () => new THREE.SphereGeometry(0.5, 6, 4),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: () => new THREE.ConeGeometry(0.5, 1, 6),
  tet: () => new THREE.OctahedronGeometry(0.5, 0),
};
const protos = {};
const proto = (k) => { if (protos[k]) return protos[k]; const g = PRIM[k](); if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return (protos[k] = g); };

export class FoeGeo {
  constructor() { this.P = []; this.N = []; this.C = []; this.B = []; this.Pv = []; this.M = []; this.I = []; this.top = 0; }
  // one primitive: unit shape k scaled by scl, turned by rot (euler xyz), placed at `at`; o: { col, bone, piv, glow, cloth }
  put(k, scl, at, rot, o) {
    const g = proto(k);
    const m = new THREE.Matrix4().compose(V(at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))), V(scl));
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const p = g.attributes.position; const n = g.attributes.normal; const base = this.P.length / 3;
    const c = new THREE.Color(o.col ?? 0x888888); const bone = BONE[o.bone || 'body']; const piv = o.piv || [0, 0, 0];
    const v = new THREE.Vector3(); const w = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); w.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.P.push(v.x, v.y, v.z); this.N.push(w.x, w.y, w.z); this.C.push(c.r, c.g, c.b);
      this.B.push(bone); this.Pv.push(piv[0], piv[1], piv[2]); this.M.push(o.glow || 0, o.ph ?? (o.cloth ? 1 : 0));
      if (v.y > this.top && bone !== BONE.wingL && bone !== BONE.wingR) this.top = v.y;
    }
    for (let i = 0; i < g.index.count; i++) this.I.push(g.index.array[i] + base);
    return this;
  }
  box(w, h, d, at, o, rot) { return this.put('box', [w, h, d], at, rot, o); }
  ball(rx, ry, rz, at, o, rot) { return this.put(o.lo ? 'ball4' : 'ball', [rx * 2, ry * 2, rz * 2], at, rot, o); }
  gem(rx, ry, rz, at, o, rot) { return this.put('tet', [rx * 2, ry * 2, rz * 2], at, rot, o); }
  // a round bar from a to b, radius r0 at a and r1 at b (the cylinder's +y runs a -> b)
  limb(a, b, r0, r1, o, k = 'cyl') {
    const A = V(a); const Bv = V(b); const d = Bv.clone().sub(A); const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const g = k === 'cone' ? proto('cone') : null;
    const m = new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
    // taper by hand: scale the ring at each end
    const src = g || proto('cyl'); const p = src.attributes.position; const n = src.attributes.normal; const base = this.P.length / 3;
    const c = new THREE.Color(o.col ?? 0x888888); const bone = BONE[o.bone || 'body']; const piv = o.piv || a;
    const v = new THREE.Vector3(); const w = new THREE.Vector3(); const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const t = v.y + 0.5; const r = (r0 + (r1 - r0) * t) * 2; v.x *= r; v.z *= r; v.applyMatrix4(m);
      w.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.P.push(v.x, v.y, v.z); this.N.push(w.x, w.y, w.z); this.C.push(c.r, c.g, c.b);
      this.B.push(bone); this.Pv.push(piv[0], piv[1], piv[2]); this.M.push(o.glow || 0, o.ph ?? (o.cloth ? 1 : 0));
      if (v.y > this.top) this.top = v.y;
    }
    for (let i = 0; i < src.index.count; i++) this.I.push(src.index.array[i] + base);
    return this;
  }
  spike(a, b, r, o) { return this.limb(a, b, r, 0.001, o, 'cone'); }
  // the same parts mirrored left/right: fn(side) with side -1 (left, -x) and +1 (right, +x)
  pair(fn) { fn(-1); fn(1); return this; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aBone', new THREE.Float32BufferAttribute(this.B, 1));
    g.setAttribute('aPiv', new THREE.Float32BufferAttribute(this.Pv, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.M, 2));
    g.setIndex(this.I); g.computeBoundingSphere(); return g;
  }
}

// ---- the shader: one program for every kind, the gait in uniforms, the moment in instance attributes ----
// iA = (phase, swing 0..1 or -1, hit 0..1, dissolve 0..1); iB = (fall rad, flash 0..1, extra lean rad, launch spin rad)
// iC = cloth tint. uG = (leg amp, arm rest pitch, arm swing, mode 0 walk 1 quad 2 spider 3 fly); uH = (lean, hip y, attack
// style 0 claw 1 smash 2 spit 3 bite 4 shield 5 shriek, bob)
const ANIM = /* glsl */`
attribute float aBone; attribute vec3 aPiv; attribute vec2 aMat;
attribute vec4 iA; attribute vec4 iB; attribute vec3 iC;
uniform vec4 uG; uniform vec4 uH;
varying vec3 vLoc; varying float vDie; varying float vFlash; varying float vGlow;
mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
void foeAnim(inout vec3 p, inout vec3 n) {
  float b = aBone; float ph = iA.x; float sw = iA.y; float hit = iA.z; float mode = uG.w; float st = uH.z;
  float s = sin(ph); float lunge = sw >= 0. ? sin(3.14159 * sw) : 0.;
  float side = (b == 2. || b == 4. || b == 6.) ? -1. : 1.;
  if (mode > 1.5 && mode < 2.5 && (b == 4. || b == 5.)) side = b == 4. ? 1. : -1.;
  mat3 L = mat3(1.);
  if (b == 4. || b == 5.) {
    float a = s * side * uG.x;
    if (mode > 2.5) a = 0.6 + sin(ph * 0.5 + side) * 0.12;
    if (mode > 1.5 && mode < 2.5) L = rY(s * side * uG.x) * rX(-max(0., s * side) * 0.25);
    else L = rX(a);
  } else if (b == 2. || b == 3.) {
    float a = uG.y + (uG.z > 0. ? s * side * uG.z : s * side * 0.1);
    if (mode > 0.5 && mode < 1.5) a = -s * side * uG.x;
    if (sw >= 0.) {
      if (st < 0.5 || st > 2.5 && st < 3.5) a -= 1.4 * lunge;
      else if (st < 1.5) a = sw < 0.55 ? mix(uG.y, -2.9, sw / 0.55) : mix(-2.9, 0.1, min(1., (sw - 0.55) / 0.25));
      else if (st > 3.5 && st < 4.5) a -= 0.6 * lunge;
      else if (st > 4.5) a = mix(a, -2.6, lunge);
    }
    a -= hit * 0.5;
    L = rX(a) * rZ(side * (mode > 2.5 ? 0.6 : 0.08) + (st > 4.5 && sw >= 0. ? side * 0.6 * lunge : 0.));
  } else if (b == 1.) {
    float a = -hit * 0.35 + (mode < 0.5 ? sin(ph * 0.5) * 0.06 : 0.);
    if (sw >= 0. && st > 1.5 && st < 2.5) a += sw < 0.5 ? -0.7 * sin(3.14159 * sw * 2.) : 0.5 * sin(3.14159 * (sw - 0.5) * 2.);
    if (sw >= 0. && st > 4.5) a -= 0.9 * lunge;
    if (sw >= 0. && st > 2.5 && st < 3.5) a += 0.35 * lunge;
    L = rX(a);
  } else if (b == 6. || b == 7.) {
    L = rZ(side * (sin(ph * 3.2) * 0.75 + 0.15));
  } else if (b == 8.) {
    L = rY(sin(ph * 1.4) * 0.45) * rX(-hit * 0.4);
  }
  p = aPiv + L * (p - aPiv); n = L * n;
  if (b < 3.5 || b > 5.5 && b < 8.5) {
    float lean = uH.x + iB.z - hit * 0.32;
    if (sw >= 0. && (st < 0.5 || st > 2.5 && st < 4.5)) lean += 0.32 * lunge;
    if (sw >= 0. && st > 0.5 && st < 1.5) lean += sw < 0.55 ? -0.25 * sw / 0.55 : 0.5 * min(1., (sw - 0.55) / 0.25);
    vec3 hp = vec3(0., uH.y, 0.); mat3 T = rX(lean); p = hp + T * (p - hp); n = T * n;
  }
  float bob = mode > 2.5 ? sin(ph * 0.5) * 0.12 : abs(s) * uH.w;
  p.y += bob;
  if (iB.w != 0.) { vec3 c = vec3(0., uH.y, 0.); mat3 S = rY(iB.w) * rZ(iB.w * 0.35); p = c + S * (p - c); n = S * n; }
  if (iB.x != 0.) { mat3 F = rX(-iB.x); p = F * p; n = F * n; }
}
`;
const ANIM_FRAG = /* glsl */`
uniform vec3 uBurst; uniform float uSelf;
varying vec3 vLoc; varying float vDie; varying float vFlash; varying float vGlow;
float foeCut() {
  if (vDie <= 0.) return 0.;
  float h = fract(sin(dot(floor(vLoc * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float th = vDie * 1.25 - 0.12 + vLoc.y * 0.08;
  if (h < th) discard;
  return h < th + 0.12 ? 1. : 0.;
}
`;
const vShare = (sh) => {
  sh.vertexShader = ANIM + sh.vertexShader;
  sh.fragmentShader = ANIM_FRAG + sh.fragmentShader;
};
const setVary = 'vLoc = position; vDie = iA.w; vFlash = iB.y; vGlow = aMat.x;';

// The gradient MeshToonMaterial shades with: three bands, the dark band light enough for night maps
let grad = null;
export function gradient() {
  if (grad) return grad;
  const d = new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
  return grad;
}

// the toon body and its inverted-hull outline for one kind; uniforms are the kind's gait
export function foeMaterials(gait) {
  const U = {
    uG: { value: new THREE.Vector4(gait.amp, gait.arm, gait.swingArm || 0, gait.mode) },
    uH: { value: new THREE.Vector4(gait.lean, gait.hip, gait.atk || 0, gait.bob ?? 0.05) },
    uBurst: { value: new THREE.Color(gait.burst) }, uSelf: { value: 0.3 }, uOutline: { value: gait.outline ?? 0.035 },
  };
  const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient() });
  toon.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U); vShare(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normal; vec3 fP = position; foeAnim(fP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = fP; ' + setVary)
      .replace('#include <color_vertex>', '#include <color_vertex>\n if (aMat.y > 0.5) vColor.rgb *= iC;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'void main() { float edge = foeCut();')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * (uSelf + vGlow * 1.6) + vec3(vFlash * 0.9) + uBurst * edge * 2.;');
  };
  toon.customProgramCacheKey = () => 'foeToon';
  const line = new THREE.MeshBasicMaterial({ color: 0x1c1418, side: THREE.BackSide });
  line.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U); vShare(sh);
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uOutline;\nvoid main() {')
      .replace('#include <begin_vertex>', 'vec3 fP = position; vec3 fN = normal; foeAnim(fP, fN); vec3 transformed = fP + normalize(fN) * uOutline; ' + setVary);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() { float edge = foeCut();')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, uBurst, edge) + vec3(vFlash * 0.5);');
  };
  line.customProgramCacheKey = () => 'foeLine';
  return { toon, line, U };
}

// An InstancedMesh pair (body + outline) for one kind, with the per-instance attributes the shader reads.
export function foeMesh(geo, gait, cap) {
  const g = geo.clone();
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); iA.setUsage(THREE.DynamicDrawUsage);
  const iB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); iB.setUsage(THREE.DynamicDrawUsage);
  const iC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); iC.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iA', iA); g.setAttribute('iB', iB); g.setAttribute('iC', iC);
  const mats = foeMaterials(gait);
  const mk = (mat) => {
    const m = new THREE.InstancedMesh(g, mat, cap); m.frustumCulled = false; m.count = 0; m.castShadow = false; m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    return m;
  };
  const body = mk(mats.toon); const line = mk(mats.line); line.instanceColor = body.instanceColor; line.instanceMatrix = body.instanceMatrix;
  return { body, line, geo: g, iA: iA.array, iB: iB.array, iC: iC.array, attrs: [iA, iB, iC], mats };
}

// ---- boss shells: static parts hung on the pool body's joints (foe/bosses.js) ----
// aMat.y here is the phase a part belongs to: 0 always, 1 only after the boss drops under half its life, 2 only before.
// uP2 the phase (0/1), uPulse the phase-2 glow throb, uFlash a hit flash, uDie the dissolve after death.
export function shellMaterials() {
  const U = { uP2: { value: 0 }, uPulse: { value: 0 }, uFlash: { value: 0 }, uDie: { value: 0 }, uSelf: { value: 0.3 }, uOutline: { value: 0.035 }, uBurst: { value: new THREE.Color(0xffa040) } };
  const pre = /* glsl */`attribute vec2 aMat; varying vec2 vMat; varying vec3 vLoc;
`;
  const fpre = /* glsl */`uniform float uP2; uniform float uPulse; uniform float uFlash; uniform float uDie; uniform float uSelf; uniform vec3 uBurst; varying vec2 vMat; varying vec3 vLoc;
float shellCut() {
  if (vMat.y > 0.5 && vMat.y < 1.5 && uP2 < 0.5) discard;
  if (vMat.y > 1.5 && uP2 > 0.5) discard;
  if (uDie <= 0.) return 0.;
  float h = fract(sin(dot(floor(vLoc * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float th = uDie * 1.25 - 0.12;
  if (h < th) discard;
  return h < th + 0.1 ? 1. : 0.;
}
`;
  const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient() });
  toon.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = pre + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMat = aMat; vLoc = position;');
    sh.fragmentShader = fpre + sh.fragmentShader.replace('void main() {', 'void main() { float edge = shellCut();')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * (uSelf + vMat.x * (1.4 + uPulse * uP2)) + vec3(uFlash * 0.8) + uBurst * edge * 2. + uBurst * uP2 * (0.12 + 0.16 * uPulse);');
  };
  toon.customProgramCacheKey = () => 'foeShell';
  const line = new THREE.MeshBasicMaterial({ color: 0x1c1418, side: THREE.BackSide });
  line.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = pre + 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uOutline; vMat = aMat; vLoc = position;');
    sh.fragmentShader = fpre + sh.fragmentShader.replace('void main() {', 'void main() { float edge = shellCut();')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(mix(diffuseColor.rgb, uBurst * 0.8, uP2 * 0.55 * (0.5 + 0.5 * uPulse)), uBurst, edge) + vec3(uFlash * 0.4);');
  };
  line.customProgramCacheKey = () => 'foeShellLine';
  return { toon, line, U };
}
