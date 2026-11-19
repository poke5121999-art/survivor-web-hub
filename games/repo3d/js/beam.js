// The grab beam's look: a glowing tube bent as a cubic bezier from the emitter on the robot's hand to the grip point on
// the item's surface. The tube is one static mesh; its vertices are placed on the curve in the vertex shader from four
// control points (no geometry rebuild per frame). Pulses run along it toward the item, it shivers a little, and its colour
// follows the strain: blue-green light, orange heavy, red over the beam's strength (the item lags its spot).
// Also: a faint dotted arc for a charged throw, and the snap flash when the beam breaks.
import * as THREE from '../vendor/three.module.min.js';

const SEG = 40, SIDES = 8;
const VERT = `uniform vec3 uP0, uP1, uP2, uP3; uniform float uR, uTime, uJit; attribute float aT; attribute float aA; varying float vT; varying float vA;
vec3 bez(float t) { float s = 1.0 - t; return s * s * s * uP0 + 3.0 * s * s * t * uP1 + 3.0 * s * t * t * uP2 + t * t * t * uP3; }
void main() {
  float t = aT; vec3 p = bez(t), q = bez(min(1.0, t + 0.01)), d = normalize(q - bez(max(0.0, t - 0.01)) + 1e-5);
  vec3 up = abs(d.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), n = normalize(cross(d, up)), b = cross(d, n);
  float w = sin(t * 3.14159);   // shiver, zero at both ends
  p += (n * sin(uTime * 37.0 + t * 19.0) + b * cos(uTime * 29.0 + t * 23.0)) * uJit * w;
  float r = uR * (0.65 + 0.35 * w) * (1.0 + 0.25 * sin(t * 40.0 - uTime * 18.0));
  p += (n * cos(aA) + b * sin(aA)) * r;
  vT = t; vA = aA; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const FRAG = `uniform vec3 uCol; uniform float uTime, uK; varying float vT; varying float vA;
void main() {
  float pulse = pow(max(0.0, sin((vT * 9.0 - uTime * 5.5) * 3.14159)), 6.0);
  float core = 0.55 + 0.45 * pow(abs(cos(vA * 0.5)), 2.0);
  float a = (0.35 + 0.65 * core) * (0.75 + 0.9 * pulse) * uK;
  gl_FragColor = vec4(uCol * a * (0.75 + 0.9 * pulse), a); }`;

export class BeamFx {
  constructor(scene) {
    const n = (SEG + 1) * (SIDES + 1), aT = new Float32Array(n), aA = new Float32Array(n), idx = [];
    for (let i = 0; i <= SEG; i++) for (let j = 0; j <= SIDES; j++) { const k = i * (SIDES + 1) + j; aT[k] = i / SEG; aA[k] = (j / SIDES) * Math.PI * 2; }
    for (let i = 0; i < SEG; i++) for (let j = 0; j < SIDES; j++) { const a = i * (SIDES + 1) + j, b = a + SIDES + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // placed in the shader
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1)); g.setAttribute('aA', new THREE.BufferAttribute(aA, 1)); g.setIndex(idx);
    this.u = { uP0: { value: new THREE.Vector3() }, uP1: { value: new THREE.Vector3() }, uP2: { value: new THREE.Vector3() }, uP3: { value: new THREE.Vector3() },
      uR: { value: 0.012 }, uTime: { value: 0 }, uJit: { value: 0.006 }, uCol: { value: new THREE.Color(0x6ff0ff) }, uK: { value: 1 } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.visible = false; scene.add(this.mesh);
    // the light it casts at the grip (small, cheap)
    this.glow = new THREE.PointLight(0x6ff0ff, 0, 2.2, 2); scene.add(this.glow);
    // throw arc: dots
    const D = this.D = 28;
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(D * 3), 3));
    this.arc = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xbff6ff, size: 0.035, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
    this.arc.frustumCulled = false; this.arc.visible = false; scene.add(this.arc);
    this.snapT = 0; this.scene = scene;
    this.cA = new THREE.Color(0x6ff0ff); this.cB = new THREE.Color(0xffa030); this.cC = new THREE.Color(0xff2a20);
  }
  /** from: emitter, to: grip point, sag: how much the curve droops (heavier = more), strain 0..1+ */
  show(from, dir, to, strain, sag, dt) {
    const u = this.u; u.uTime.value += dt; strain = Math.min(1.5, strain);   // the look saturates; the raw strain can be 60+
    const L = from.distanceTo(to);
    u.uP0.value.copy(from); u.uP3.value.copy(to);
    u.uP1.value.copy(from).addScaledVector(dir, L * 0.4);             // leaves the hand straight ahead
    u.uP2.value.copy(to).add(new THREE.Vector3(0, -sag, 0)).lerp(u.uP1.value, 0.25); u.uP2.value.y -= sag * 0.5;
    // colour by strain: under 0.35 blue-green, orange by 0.8, over 0.95 red and shaking
    const c = u.uCol.value; if (strain < 0.35) c.copy(this.cA); else if (strain < 0.95) c.copy(this.cA).lerp(this.cB, Math.min(1, (strain - 0.35) / 0.45)); else c.copy(this.cB).lerp(this.cC, Math.min(1, (strain - 0.95) / 0.2));
    u.uJit.value = 0.004 + 0.012 * Math.max(0, strain - 0.6);
    u.uR.value = 0.011 + 0.005 * Math.min(1.5, strain);
    this.mesh.visible = true;
    this.glow.position.copy(to); this.glow.color.copy(c); this.glow.intensity = 0.6 + 0.4 * Math.sin(u.uTime.value * 20);
  }
  hide() { this.mesh.visible = false; this.glow.intensity = 0; }
  /** dotted arc of a throw: p0 start, v0 velocity, g gravity, floorAt(x,z) */
  showArc(p0, v0, g, floorAt) {
    const a = this.arc.geometry.attributes.position; let n = 0;
    for (let i = 0; i < this.D; i++) {
      const t = i * 0.045, x = p0.x + v0.x * t, y = p0.y + v0.y * t - 0.5 * g * t * t, z = p0.z + v0.z * t;
      a.setXYZ(n++, x, y, z); if (floorAt && y < floorAt(x, z)) break;
    }
    this.arc.geometry.setDrawRange(0, n); a.needsUpdate = true; this.arc.visible = true;
  }
  hideArc() { this.arc.visible = false; }
  dispose() { this.scene.remove(this.mesh, this.glow, this.arc); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.arc.geometry.dispose(); this.arc.material.dispose(); }
}
