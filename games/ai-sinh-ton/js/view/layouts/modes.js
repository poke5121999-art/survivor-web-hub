// How a special stage's rule looks (maprules.js MODES, read through modeState):
//   defend   the Seed Egg in its nest in the middle of the fight pad: a speckled shell whose veins glow, cracks that burn
//            gold as its health drops, a health bar over it; broken, it bursts into shards
//   chase    a spinning crystal Core over the carrier's head with a beam down to it, and chevrons on the floor running from
//            the carrier to the gate it heads for
//   survive  nothing in the scene: the HUD calls the time (hud.js)
// Everything is placed each frame in the scene's frame through world.roomOffset (the egg) and actors.headPos (the carrier).
import { modeState } from '../../sim/maprules.js?v=20261124b';
const THREE = window.THREE;

const EGG_V = `varying vec3 vP; varying vec3 vN; void main() { vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const EGG_F = `uniform float uTime; uniform float uHp; uniform float uHit; varying vec3 vP; varying vec3 vN;
float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 L = normalize(vec3(-0.4, 0.8, 0.5)); float d = 0.45 + 0.55 * max(0.0, dot(vN, L));
  vec3 shell = mix(vec3(0.78, 0.86, 0.62), vec3(0.95, 0.93, 0.78), smoothstep(0.0, 1.0, vP.y));
  vec3 q = floor(vP * 9.0); float spk = step(0.82, h(q));
  float vein = smoothstep(0.9, 1.0, sin(vP.y * 14.0 + sin(atan(vP.z, vP.x) * 3.0) * 2.0)) * (0.6 + 0.4 * sin(uTime * 2.2));
  vec3 c = shell * d * (1.0 - spk * 0.35) + vec3(0.25, 1.0, 0.7) * vein * 0.55;
  // cracks: lines on a coarse cell grid of the shell, more of them and hotter as the health drops
  vec3 g = vP * vec3(7.0, 5.0, 7.0); vec3 f = abs(fract(g) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.05, min(f.x, f.y));
  float show = step(uHp, 0.15 + 0.85 * h(floor(g)));
  float hurt = 1.0 - uHp;
  c = mix(c, vec3(1.9, 1.1, 0.3) * (0.7 + 0.3 * sin(uTime * 9.0)), line * show * smoothstep(0.05, 0.5, hurt));
  c += vec3(1.0, 0.4, 0.3) * uHit * 0.6;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
const CORE_F = `uniform float uTime; varying vec3 vP; varying vec3 vN;
void main() { float f = pow(1.0 - abs(vN.z), 1.6); vec3 c = mix(vec3(0.5, 0.9, 1.6), vec3(1.6, 0.6, 1.7), 0.5 + 0.5 * sin(uTime * 3.0 + vP.y * 6.0)); gl_FragColor = vec4(c * (0.55 + f), 1.0);
  #include <colorspace_fragment>
}`;
const BEAM_F = `uniform float uTime; varying vec2 vUv; void main() { float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * (1.0 - vUv.y) * (0.5 + 0.5 * sin(vUv.y * 20.0 - uTime * 8.0)); gl_FragColor = vec4(vec3(0.6, 0.9, 1.6) * a * 0.7, 1.0);
  #include <colorspace_fragment>
}`;
const UV_V = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// chevrons along a strip laid on the floor (uv.x along it, in metres through uLen), running toward its far end; painted in a
// saturated violet over the floor, not added: added light burns to white on the snow and sand floors
const CHEV_F = `uniform float uTime; uniform float uLen; varying vec2 vUv;
void main() { float s = vUv.x * uLen; float y = abs(vUv.y - 0.5) * 2.0; float k = fract(s * 0.8 - uTime * 1.6 - y * 0.35); float on = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.3, 0.38, k));
  float a = on * (1.0 - y * 0.8) * smoothstep(0.0, 1.2, s) * (1.0 - smoothstep(uLen - 1.2, uLen, s)); gl_FragColor = vec4(0.82, 0.3, 1.0, a * 0.9);
  #include <colorspace_fragment>
}`;

function eggGeometry() {
  const pts = []; const N = 14;
  for (let i = 0; i <= N; i++) { const t = i / N; const y = t * 1.05; const u = t * 2 - 1; const r = 0.42 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.16 * u); pts.push(new THREE.Vector2(Math.max(0.001, r), y)); }
  return new THREE.LatheGeometry(pts, 18);
}
const add = (blend) => new THREE.ShaderMaterial({ vertexShader: UV_V, fragmentShader: blend, uniforms: { uTime: { value: 0 }, uLen: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

export function createModes(H) {
  const g = new THREE.Group(); g.name = 'mode'; H.scene.add(g);
  const time = { value: 0 };
  // the egg in its nest
  const eggMat = new THREE.ShaderMaterial({ vertexShader: EGG_V, fragmentShader: EGG_F, uniforms: { uTime: time, uHp: { value: 1 }, uHit: { value: 0 } } });
  const egg = new THREE.Mesh(eggGeometry(), eggMat); egg.name = 'egg';
  const nest = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 5, 14), new THREE.MeshLambertMaterial({ color: 0x6a4a2c })); nest.rotation.x = Math.PI / 2; nest.position.y = 0.08; nest.name = 'nest';
  // the health bar: a dark back and a fill scaled from its left end, facing the camera
  const bar = new THREE.Group(); bar.name = 'eggbar'; bar.position.y = 2.0; bar.renderOrder = 9;
  const barBack = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.18), new THREE.MeshBasicMaterial({ color: 0x0a0814, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
  const fillGeo = new THREE.PlaneGeometry(1.08, 0.11); fillGeo.translate(0.54, 0, 0);
  const barFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x66ff8c, depthTest: false, depthWrite: false, transparent: true }));
  barFill.position.set(-0.54, 0, 0.001); barBack.renderOrder = 9; barFill.renderOrder = 10; bar.add(barBack, barFill);
  egg.scale.setScalar(1.35); nest.scale.setScalar(1.35);
  const eggG = new THREE.Group(); eggG.add(egg, nest, bar); eggG.visible = false; g.add(eggG);
  // the core
  const coreMat = new THREE.ShaderMaterial({ vertexShader: EGG_V, fragmentShader: CORE_F, uniforms: { uTime: time } });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), coreMat); core.scale.y = 1.5; core.name = 'core';
  const beamMat = add(BEAM_F); beamMat.uniforms.uTime = time; beamMat.vertexShader = UV_V;
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.8), beamMat); beam.name = 'corebeam';
  const coreG = new THREE.Group(); coreG.add(core, beam); coreG.visible = false; g.add(coreG);
  const chevMat = add(CHEV_F); chevMat.uniforms.uTime = time; chevMat.blending = THREE.NormalBlending;
  const chev = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), chevMat); chev.rotation.order = 'YXZ'; chev.visible = false; chev.renderOrder = 2; chev.name = 'corepath'; g.add(chev);
  const V = new THREE.Vector3(); let hit = 0; let lastHp = 1; let broke = 0; let lastB = null;

  return {
    update(dt, B, W, actors) {
      time.value = (time.value + dt) % 4000;
      const M = modeState(B); if (B !== lastB) { lastB = B; broke = 0; lastHp = 1; }
      eggG.visible = false; coreG.visible = false; chev.visible = false;
      if (!M || !W) return;
      const fight = B.phase === 'fight' || B.phase === 'pick';
      if (M.kind === 'defend' && M.uid && fight) {
        if (!M.alive) { if (!broke) { broke = 1; const o = W.roomOffset(B.wave - 1); if (o && W.debris) W.debris(o.x + M.x, o.z + M.z, 14, 4); } return; }
        // between waves the egg waits in the room the team is about to fight in
        const o = W.roomOffset(B.phase === 'pick' ? B.wave : B.wave - 1); if (!o) return;
        eggG.visible = true; eggG.position.set(o.x + M.x, (o.y || 0), o.z + M.z);
        if (M.hp < lastHp - 1e-4) hit = 1; lastHp = M.hp; hit = Math.max(0, hit - dt * 4);
        eggMat.uniforms.uHp.value = M.hp; eggMat.uniforms.uHit.value = hit; barFill.scale.x = Math.max(0.001, M.hp); barFill.material.color.setHex(M.hp > 0.5 ? 0x66ff8c : M.hp > 0.25 ? 0xffc040 : 0xff5040);
        egg.scale.setScalar(1.35 * (1 + Math.sin(time.value * 2.4) * 0.015 + hit * 0.05)); egg.rotation.z = Math.sin(time.value * 23) * 0.04 * hit;
        bar.quaternion.copy(H.camera.quaternion);
      }
      if (M.kind === 'chase' && M.uid && !M.down && !M.out && B.phase === 'fight' && actors && actors.headPos(M.uid, V)) {
        coreG.visible = true; coreG.position.set(V.x, V.y + 0.9, V.z); core.rotation.y = time.value * 2.6; core.position.y = 0.25 + Math.sin(time.value * 3) * 0.08;
        beam.position.y = -0.6; beam.quaternion.copy(H.camera.quaternion);
        const o = W.roomOffset(B.wave - 1);
        if (M.to && o) {
          const tx = o.x + M.to.x; const tz = o.z + M.to.z; const dx = tx - V.x; const dz = tz - V.z; const L = Math.hypot(dx, dz);
          if (L > 1) {
            chev.visible = true; chev.position.set((V.x + tx) / 2, (o.y || 0) + 0.04, (V.z + tz) / 2);
            chev.rotation.set(-Math.PI / 2, -Math.atan2(dz, dx), 0, 'YXZ');
            chev.scale.set(L, 1.2, 1); chevMat.uniforms.uLen.value = L;
          }
        }
      }
    },
    dispose() { H.scene.remove(g); },
  };
}
