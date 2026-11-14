// Lighting rig: low storm sun with soft shadows that follow the player, a pool of real spot lights
// handed to the nearest lamp heads, fake volumetric cones, and the muzzle light.
import * as THREE from '../vendor/three.module.min.js';
import { SUN_DIR, SUN_COLOR } from './sky.js';
import { keepAlpha } from './mats.js';
import { NOISE } from './glsl.js';

const CONE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime, uPower; varying vec3 vL; varying vec3 vN; varying vec3 vV; varying vec3 vW;
${NOISE}
void main(){
  float along = clamp(vL.y, 0.0, 1.0);
  float fres = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float n = 0.65 + 0.35 * vn3(vW * 0.9 + vec3(0.0, uTime * 1.4, 0.0));
  float a = fres * pow(1.0 - along, 1.4) * smoothstep(0.0, 0.08, along) * n * uPower;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const CONE_VERT = /* glsl */`
uniform float uLen; varying vec3 vL; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vL = vec3(0.0, -position.y / uLen, 0.0);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Contact-hardening soft shadows (Saltline render.md §2): replaces getShadow in the stock chunk so every
// MeshStandardMaterial gets blocker search + Vogel-disc PCF. Needs PCFShadowMap (RGBA-packed depth).
let stockShadowChunk = null;
export function installPCSS(fr, { taps = 16, searchTaps = 8 } = {}) {
  if (stockShadowChunk === null) stockShadowChunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const s = stockShadowChunk;
  const o = s.indexOf('float getShadow('); const r = s.indexOf('vec2 cubeToUV');
  let a = s.lastIndexOf('// cubeToUV()', r); if (a < o) a = r;
  if (o < 0 || r < 0 || r < o) { console.warn('[lights] soft shadows: unexpected shader chunk layout, keeping stock PCF'); return false; }
  const body = `
const vec2 SL_FRUSTUM = vec2(${fr.width.toFixed(3)}, ${fr.height.toFixed(3)});
const float SL_DEPTH = ${fr.depth.toFixed(3)};
float slIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec2 slVogel(int i, int n, float phi){ float r = sqrt((float(i) + 0.5) / float(n)); float th = float(i) * 2.39996323 + phi; return r * vec2(cos(th), sin(th)); }
float getShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord){
  shadowCoord.xyz /= shadowCoord.w;
  vec3 sc = shadowCoord.xyz;
  vec3 dx = dFdx(sc), dy = dFdy(sc);
  bool inFrustum = sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0;
  if (!(inFrustum && sc.z <= 1.0)) return 1.0;
  float det = dx.x * dy.y - dx.y * dy.x;
  vec2 dz = vec2(0.0);
  if (abs(det) > 1e-12) dz = vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / det;
  vec2 texel = 1.0 / shadowMapSize;
  float maxSlope = 0.0030 / max(texel.x, texel.y);
  dz = clamp(dz, vec2(-maxSlope), vec2(maxSlope));
  float zr = sc.z + shadowBias - (abs(dz.x) * texel.x + abs(dz.y) * texel.y) * 0.35;
  float phi = slIGN(gl_FragCoord.xy) * 6.2831853;
  vec2 searchR = (0.55 * shadowRadius) / SL_FRUSTUM;
  float blk = 0.0, nb = 0.0;
  for (int i = 0; i < ${searchTaps}; i++) {
    vec2 o = slVogel(i, ${searchTaps}, phi) * searchR;
    float d = unpackRGBAToDepth(texture2D(shadowMap, sc.xy + o));
    if (d < zr + dot(o, dz)) { blk += d; nb += 1.0; }
  }
  if (nb < 0.5) return 1.0;
  float avg = blk / nb;
  float distM = max(zr - avg, 0.0) * SL_DEPTH;
  float penM = clamp(distM * 0.022 * shadowRadius, 0.012 * shadowRadius, 0.60 * shadowRadius);
  vec2 filtR = max(vec2(penM) / SL_FRUSTUM, texel * 1.25);
  float lit = 0.0;
  for (int i = 0; i < ${taps}; i++) {
    vec2 o = slVogel(i, ${taps}, phi + 1.7) * filtR;
    float d = unpackRGBAToDepth(texture2D(shadowMap, sc.xy + o));
    lit += step(zr + dot(o, dz), d);
  }
  lit /= float(${taps});
  vec2 e = min(sc.xy, 1.0 - sc.xy);
  lit = mix(1.0, lit, smoothstep(0.0, 0.02, min(e.x, e.y)));
  return mix(1.0, lit, shadowIntensity);
}
`;
  THREE.ShaderChunk.shadowmap_pars_fragment = s.slice(0, o) + body + s.slice(a);
  return true;
}

export class Lights {
  constructor(G, lamps) {
    this.G = G; this.lamps = lamps;
    const q = G.quality;
    // sun (Saltline rig: one warm directional at 9, no hemi or ambient; ambient comes from the sky PMREM at 2)
    const S = 46;
    if (!G.params.nopcss) installPCSS({ width: 2 * S, height: 2 * S, depth: 259 }, { taps: q.name === 'low' ? 10 : 16, searchTaps: 8 });
    const sun = new THREE.DirectionalLight(SUN_COLOR, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
    sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.02; sun.shadow.radius = 1;
    sun.layers.enableAll(); G.scene.add(sun); G.scene.add(sun.target);
    this.sun = sun;
    // spot pool
    this.pool = [];
    for (let i = 0; i < q.lights; i++) {
      const s = new THREE.SpotLight(0xffa040, 0, 50, 0.8, 0.6, 2);
      s.castShadow = i < q.spotShadows;
      if (s.castShadow) { s.shadow.mapSize.set(512, 512); s.shadow.bias = -0.0008; s.shadow.camera.far = 60; }
      s.layers.enableAll(); G.scene.add(s); G.scene.add(s.target);
      this.pool.push(s);
    }
    // muzzle light
    this.muzzle = new THREE.PointLight(0xffb060, 0, 9, 2);
    this.muzzle.layers.enableAll(); G.scene.add(this.muzzle);
    // volumetric cones
    this.cones = new THREE.Group();
    for (const L of lamps) {
      if (!L.cone) continue;
      const len = L.coneLen || 8; const rad = Math.tan((L.angle || 0.8) * 0.75) * len;
      const g = new THREE.CylinderGeometry(0.15, rad, len, 24, 1, true);
      g.translate(0, -len / 2, 0);
      const m = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(L.color).multiplyScalar(L.inside ? 0.05 : 0.085) }, uTime: G.U.uTime, uPower: { value: L.power }, uLen: { value: len } },
        vertexShader: CONE_VERT,
        fragmentShader: CONE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      m.userData.additive = true; m.userData.premul = true; keepAlpha(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(L.pos);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), L.dir.clone().normalize());
      mesh.renderOrder = 5; mesh.frustumCulled = true;
      L.coneMesh = mesh;
      this.cones.add(mesh);
    }
    G.scene.add(this.cones);
    this.tAssign = 0;
  }
  setLampPower(L, p) { L.power = p; if (L.coneMesh) L.coneMesh.material.uniforms.uPower.value = p; }
  update(dt, camPos) {
    const sun = this.sun;
    // shadow frustum follows the camera, snapped to texels to stop shimmering
    const S = 46; const texel = (2 * S) / sun.shadow.mapSize.x;
    const c = camPos.clone(); const fwd = new THREE.Vector3(); this.G.camera.getWorldDirection(fwd);
    c.addScaledVector(fwd.setY(0).normalize(), S * 0.45);
    c.x = Math.round(c.x / texel) * texel; c.z = Math.round(c.z / texel) * texel; c.y = 0;
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(SUN_DIR, 140);
    sun.target.updateMatrixWorld();
    // reassign the spot pool to the nearest powered lamps
    this.tAssign -= dt;
    if (this.tAssign <= 0) {
      this.tAssign = 0.2;
      const list = this.lamps.filter((L) => L.power > 0.01).map((L) => [L, L.pos.distanceToSquared(camPos) / (L.kind === 'flood' ? 4 : 1)]);
      list.sort((a, b) => a[1] - b[1]);
      this.pool.forEach((s, i) => {
        const e = list[i];
        if (!e) { s.intensity = 0; s.visible = false; return; }
        const L = e[0]; s.visible = true;
        s.position.copy(L.pos);
        s.target.position.copy(L.pos).addScaledVector(L.dir, 10);
        s.target.updateMatrixWorld();
        s.color.set(L.color);
        s.angle = L.angle || 0.8; s.penumbra = 0.65;
        s.distance = L.range || 40;
        const base = L.kind === 'flood' ? 650 : L.kind === 'hang' ? 70 : L.kind === 'head' ? 900 : L.kind === 'cabin' ? 30 : 140;
        s.intensity = base * L.power;
      });
    }
  }
}
