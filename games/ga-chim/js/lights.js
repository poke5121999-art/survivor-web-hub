// Lighting rig: low storm sun with soft shadows that follow the player, a pool of real spot lights
// handed to the nearest lamp heads, fake volumetric cones, and the muzzle light.
import * as THREE from '../vendor/three.module.min.js';
import { SUN_DIR } from './sky.js';
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

export class Lights {
  constructor(G, lamps) {
    this.G = G; this.lamps = lamps;
    const q = G.quality;
    // sun
    const sun = new THREE.DirectionalLight(0xffc49a, 1.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    const S = 46;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    sun.layers.enableAll(); G.scene.add(sun); G.scene.add(sun.target);
    this.sun = sun;
    const hemi = new THREE.HemisphereLight(0x6f80a0, 0x15130f, 0.45);
    hemi.layers.enableAll(); G.scene.add(hemi); this.hemi = hemi;
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
    this.muzzle = new THREE.PointLight(0xffb060, 0, 14, 2);
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
