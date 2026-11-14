// Rain: one instanced streak quad wrapped in a box around the camera, lit by nearby lamps and the
// sun gap (forward scattering); ground splashes as instanced crowns. Dry zones (roofs) discard rain.
import * as THREE from '../vendor/three.module.min.js';
import { keepAlpha } from './mats.js';
import { SUN_DIR } from './sky.js';

const RAIN_VS = /* glsl */`
attribute vec4 aSeed;
uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec2 uWind;
uniform vec3 uLampP[8]; uniform vec3 uLampC[8]; uniform vec3 uLampD[8];
uniform vec4 uDry[4]; uniform float uDryH[4];
uniform vec3 uSun; uniform float uFlash;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){
  float speed = 9.0 + aSeed.w * 4.0;
  vec3 fall = normalize(vec3(uWind.x, -speed, uWind.y));
  vec3 base = aSeed.xyz * uBox + fall * speed * uTime;
  vec3 p = mod(base - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  // dry zones
  float dry = 0.0;
  for (int i = 0; i < 4; i++) { vec4 z = uDry[i]; if (abs(p.x - z.x) < z.z && abs(p.z - z.y) < z.w && p.y < uDryH[i]) dry = 1.0; }
  if (p.y < 0.0) dry = 1.0;
  vec3 toCam = normalize(uCam - p);
  vec3 side = normalize(cross(fall, toCam));
  float len = 0.35 + aSeed.w * 0.25; float wid = 0.005 + aSeed.w * 0.003;
  vec3 wp = p + side * position.x * wid + fall * position.y * len;
  vUv = position.xy + 0.5;
  vec3 col = vec3(0.05, 0.06, 0.075);
  for (int i = 0; i < 8; i++) {
    vec3 d = p - uLampP[i]; float r2 = dot(d, d);
    float cone = smoothstep(0.35, 0.75, dot(normalize(d), uLampD[i]));
    col += uLampC[i] * cone / (1.0 + r2 * 0.06);
  }
  float fwd = pow(max(dot(-toCam, uSun), 0.0), 6.0);
  col += vec3(1.0, 0.55, 0.28) * fwd * 1.2 + vec3(0.6, 0.65, 0.9) * uFlash;
  vCol = col;
  float dist = length(uCam - p);
  vA = (1.0 - dry) * smoothstep(0.8, 3.0, dist) * (0.5 + 0.5 * smoothstep(3.0, 8.0, dist)) * smoothstep(uBox.x * 0.5, uBox.x * 0.25, dist);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const RAIN_FS = /* glsl */`
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){
  float a = smoothstep(0.5, 0.0, abs(vUv.x - 0.5)) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol * a * 1.6, a * 0.5);
}`;

const SPL_VS = /* glsl */`
attribute vec4 aSeed;
uniform float uTime; uniform vec3 uCam; uniform vec4 uDry[4]; uniform float uDryH[4];
varying vec2 vUv; varying float vPh; varying float vA;
void main(){
  float period = 0.55 + aSeed.w * 0.4;
  float t = uTime / period + aSeed.z * 7.0;
  float cyc = floor(t); vPh = fract(t);
  vec2 rnd = fract(sin(vec2(cyc * 12.9898 + aSeed.x * 78.233, cyc * 39.346 + aSeed.y * 11.135)) * 43758.5453);
  vec3 p = vec3(uCam.x + (rnd.x - 0.5) * 22.0, 0.03, uCam.z + (rnd.y - 0.5) * 22.0);
  float dry = 0.0;
  for (int i = 0; i < 4; i++) { vec4 z = uDry[i]; if (abs(p.x - z.x) < z.z && abs(p.z - z.y) < z.w) dry = 1.0; }
  float s = 0.05 + vPh * 0.16;
  vec3 wp = p + vec3(position.x * s, 0.0, position.y * s);
  vUv = position.xy + 0.5; vA = (1.0 - dry) * smoothstep(13.0, 4.0, length(p.xz - uCam.xz));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SPL_FS = /* glsl */`
varying vec2 vUv; varying float vPh; varying float vA; uniform vec3 uTint;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.25, 0.0, abs(r - 0.8)) * (1.0 - vPh);
  float a = ring * vA * 0.6;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uTint * a, a * 0.4);
}`;

export class Rain {
  constructor(G, lamps, dryZones) {
    this.G = G; const q = G.quality;
    const n = q.rain;
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seeds[i] = Math.random();
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    quad.instanceCount = n;
    const lampP = Array.from({ length: 8 }, () => new THREE.Vector3(0, -999, 0));
    const lampC = Array.from({ length: 8 }, () => new THREE.Vector3());
    const lampD = Array.from({ length: 8 }, () => new THREE.Vector3(0, -1, 0));
    const dry = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0));
    const dryH = [0, 0, 0, 0];
    dryZones.slice(0, 4).forEach((z, i) => {
      const p = new THREE.Vector3().setFromMatrixPosition(z.m);
      const e = new THREE.Euler().setFromRotationMatrix(z.m);
      const rot = Math.abs(Math.sin(e.y)) > 0.7;
      dry[i].set(p.x, p.z, (rot ? z.l : z.w) / 2 + 0.3, (rot ? z.w : z.l) / 2 + 0.3); dryH[i] = z.h;
    });
    this.u = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(26, 18, 26) }, uWind: { value: new THREE.Vector2(1.2, 0.6) },
      uLampP: { value: lampP }, uLampC: { value: lampC }, uLampD: { value: lampD }, uDry: { value: dry }, uDryH: { value: dryH },
      uSun: { value: SUN_DIR }, uFlash: { value: 0 },
    };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false });
    m.userData.premul = true; keepAlpha(m);
    this.mesh = new THREE.Mesh(quad, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8;
    G.scene.add(this.mesh);
    // splashes
    const sn = q.splashes;
    const sq = new THREE.InstancedBufferGeometry();
    sq.setAttribute('position', quad.getAttribute('position')); sq.setIndex([0, 1, 2, 0, 2, 3]);
    const ss = new Float32Array(sn * 4); for (let i = 0; i < sn * 4; i++) ss[i] = Math.random();
    sq.setAttribute('aSeed', new THREE.InstancedBufferAttribute(ss, 4)); sq.instanceCount = sn;
    this.su = { uTime: this.u.uTime, uCam: this.u.uCam, uDry: this.u.uDry, uDryH: this.u.uDryH, uTint: { value: new THREE.Color(0.35, 0.3, 0.26) } };
    const sm = new THREE.ShaderMaterial({ uniforms: this.su, vertexShader: SPL_VS, fragmentShader: SPL_FS, transparent: true, depthWrite: false });
    sm.userData.premul = true; keepAlpha(sm);
    this.splash = new THREE.Mesh(sq, sm); this.splash.frustumCulled = false; this.splash.renderOrder = 7;
    G.scene.add(this.splash);
    this.lamps = lamps; this.tLamp = 0;
  }
  update(dt, t, cam) {
    this.u.uTime.value = t; this.u.uCam.value.copy(cam.position);
    this.u.uFlash.value = (this.G.postFx && this.G.postFx.flash) || 0;
    this.tLamp -= dt;
    if (this.tLamp <= 0) {
      this.tLamp = 0.25;
      const L = this.lamps.filter((l) => l.power > 0.01).map((l) => [l, l.pos.distanceToSquared(cam.position)]).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < 8; i++) {
        const e = L[i];
        if (!e) { this.u.uLampP.value[i].set(0, -999, 0); this.u.uLampC.value[i].set(0, 0, 0); continue; }
        const l = e[0]; const c = new THREE.Color(l.color);
        this.u.uLampP.value[i].copy(l.pos); this.u.uLampD.value[i].copy(l.dir);
        const k = (l.kind === 'flood' ? 2.5 : 1.2) * l.power;
        this.u.uLampC.value[i].set(c.r * k, c.g * k, c.b * k);
      }
    }
  }
}
