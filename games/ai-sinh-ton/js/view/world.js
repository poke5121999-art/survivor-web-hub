// The battle world around the fight: the current pad (pad.js) at the origin, a few satellite islets and outcrops at the
// frame's corners joined by plank bridges, the water or fog abyss (abyss.js), and the living light: flickering additive
// glows at every source, soft warm pools on the floor, fireflies and embers (one Points draw), dislodged blocks that fall
// when monsters climb over the rim. Lighting of blocks is baked per stage (pad.js); units get the theme's cool hemisphere
// and a warm key from the host's lights.
// Today: one pad per stage at the origin (the boss wave keeps it and only changes the mood). Everything takes a pad as
// input so a map of several pads can reuse it.
import { ARENA } from '../sim/battle.js?v=20261120c';
import { THEMES } from './themes.js?v=20261120c';
import { buildPad, buildBridge, rngOf, voxMaterial } from './pad.js?v=20261120c';
import { createAbyss } from './abyss.js?v=20261120c';
import { voxAtlas } from './voxtex.js?v=20261120c';
const THREE = window.THREE;

// satellites at the frame's corners (world x, z of the pad centre; the frame is about 21 m wide at the fight's depth)
const SATS = [[-11.6, 8.4, 1], [11.8, 8.2, 1], [-12.6, -8.6, 1], [12.4, -8.8, 1], [-17, 1.5, 0.7], [17, 0.5, 0.7]];
const DEBRIS = 48;

const GLOW_V = `attribute vec4 iA; attribute vec4 iB; uniform float uTime; uniform float uK; varying vec2 vUv; varying vec3 vC; varying float vF;
void main() {
  vUv = uv; vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float fl = 0.84 + 0.1 * sin(uTime * 9.0 + iB.w * 7.0) + 0.06 * sin(uTime * 23.0 + iB.w * 13.0); vF = fl * uK; vC = iB.rgb;
  vec3 p = iA.xyz + (right * position.x + up * position.y) * iA.w * (0.94 + 0.06 * fl);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const GLOW_F = `varying vec2 vUv; varying vec3 vC; varying float vF;
void main() { float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.4) * 0.75 + pow(max(0.0, 1.0 - r * 2.6), 2.0) * 0.6; gl_FragColor = vec4(vC * a * vF, 1.0);
#include <colorspace_fragment>
}`;
const POOL_V = `attribute vec4 iA; attribute vec4 iB; uniform float uTime; uniform float uK; varying vec2 vUv; varying vec3 vC; varying float vF;
void main() { vUv = uv; float fl = 0.88 + 0.12 * sin(uTime * 7.0 + iB.w * 5.0); vF = fl * uK; vC = iB.rgb; vec3 p = iA.xyz + vec3(position.x, 0.0, -position.y) * iA.w; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const POOL_F = `varying vec2 vUv; varying vec3 vC; varying float vF;
void main() { float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.0); gl_FragColor = vec4(vC * a * vF * 0.16, 0.0);
#include <colorspace_fragment>
}`;
const MOTE_V = `attribute vec4 aS; uniform float uTime; uniform float uScale; varying float vA; varying vec3 vC; attribute vec3 color;
void main() {
  vec3 p = position; float t = uTime * aS.y + aS.x * 6.283;
  if (aS.z < 0.5) { p += vec3(sin(t) * 1.3 + sin(t * 0.37) * 0.8, sin(t * 0.7 + aS.x * 3.0) * 0.45, cos(t * 0.83) * 1.1); vA = 0.55 + 0.45 * sin(uTime * 2.3 + aS.x * 40.0); }
  else { float h = fract(uTime * aS.y * 0.25 + aS.x); p += vec3(sin(t * 2.0) * 0.25 * h, h * 3.2, cos(t * 1.7) * 0.25 * h); vA = (1.0 - h) * smoothstep(0.0, 0.08, h); }
  vC = color; vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, aS.w * uScale / -mv.z);
}`;
const MOTE_F = `varying float vA; varying vec3 vC;
void main() { vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, 1.0);
#include <colorspace_fragment>
}`;

function instanced(n, vert, frag, blend) {
  const g = new THREE.InstancedBufferGeometry(); const base = new THREE.PlaneGeometry(1, 1);
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const A = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); const B = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  g.setAttribute('iA', A); g.setAttribute('iB', B); g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uTime: { value: 0 }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: blend === 'add' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return { mesh, A, B, g };
}

export function createWorld(H) {
  const { scene, quality } = H; const low = quality.name === 'low';
  const island = new THREE.Group(); island.name = 'island'; scene.add(island);
  const lightG = new THREE.Group(); lightG.name = 'glow'; scene.add(lightG);
  const abyss = createAbyss(H);
  const glows = instanced(40, GLOW_V, GLOW_F, 'add'); glows.mesh.renderOrder = 7; lightG.add(glows.mesh);
  const pools = instanced(40, POOL_V, POOL_F, 'add'); pools.mesh.renderOrder = 1; pools.mesh.material.polygonOffset = true; pools.mesh.material.polygonOffsetFactor = -2; lightG.add(pools.mesh);
  const NM = low ? 72 : quality.name === 'medium' ? 100 : 130;
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NM * 3), 3)); moteGeo.setAttribute('aS', new THREE.Float32BufferAttribute(new Float32Array(NM * 4), 4)); moteGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NM * 3), 3));
  const moteMat = new THREE.ShaderMaterial({ vertexShader: MOTE_V, fragmentShader: MOTE_F, uniforms: { uTime: { value: 0 }, uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; motes.renderOrder = 8; motes.name = 'motes'; scene.add(motes);
  // falling blocks
  const dGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3); const dMat = new THREE.MeshBasicMaterial({ map: voxAtlas().tex, color: 0x888888 });
  const debris = new THREE.InstancedMesh(dGeo, dMat, DEBRIS); debris.count = 0; debris.frustumCulled = false; lightG.add(debris);
  const bits = []; const m4 = new THREE.Matrix4(); const q4 = new THREE.Quaternion(); const e4 = new THREE.Euler(); const v4 = new THREE.Vector3(); const s4 = new THREE.Vector3(1, 1, 1);

  const W = {
    pad: null, pads: [], bridges: [], theme: THEMES[0], all: [], buildMs: 0, spawnTint: new THREE.Color(0x1a2430), boss: 0, key: '',
    lights() { return W.all; },
    motesAlive() {
      const pos = moteGeo.attributes.position; let n = 0; const cam = H.camera;
      for (let i = 0; i < NM; i++) { v4.fromBufferAttribute(pos, i).project(cam); if (v4.z < 1 && Math.abs(v4.x) <= 1 && Math.abs(v4.y) <= 1) n++; }
      return n;
    },
  };

  function setUnitsLight(th, boss) {
    if (!H.hemi) return;
    H.hemi.color.set(th.hemi.sky); H.hemi.groundColor.set(th.hemi.ground); H.hemi.intensity = th.hemi.k;
    H.sun.color.set(th.sun.color); H.sun.intensity = th.sun.k;
    if (boss) { H.hemi.color.lerp(new THREE.Color(0xff6a50), 0.22); H.sun.color.lerp(new THREE.Color(0xff5a30), 0.3); }
  }

  W.setStage = (def) => {
    const ch = Math.max(0, Math.min(THEMES.length - 1, def.chapter | 0)); const n = def.n | 0; const k = ch + ':' + n;
    if (k === W.key) return W.theme; W.key = k;
    const t0 = performance.now(); const th = THEMES[ch]; W.theme = th;
    for (const o of [...island.children]) { island.remove(o); o.geometry.dispose(); }
    const rng = rngOf(n * 131 + 7);
    const main = buildPad({ theme: th, seed: n * 17 + 3, centre: { x: 0, y: 0, z: 0 }, ellipse: { x: ARENA.x, z: ARENA.z }, fight: true });
    const near = (x, z) => { for (const [a, b] of [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]]) if (main.cellAt(x + a, z + b)) return true; return false; };
    const water = th.abyss.type === 'water';
    const sats = [];
    for (const [x, z, sz] of SATS) {
      const sx = x + rng.range(-1, 1); const sz2 = z + rng.range(-0.8, 0.8); const y = water ? -1 : -rng.range(1.5, 3.5);
      const p = buildPad({ theme: th, seed: n * 31 + sats.length * 7 + 1, centre: { x: sx, y, z: sz2 }, ellipse: { x: rng.range(2.4, 3.4) * sz, z: rng.range(1.7, 2.3) * sz }, fight: false, decor: sz >= 1, avoid: near });
      if (p.cells.size) sats.push(p);
    }
    // two bridges from the fight floor's edge to the satellites on a diagonal
    const bridges = [];
    for (const si of [0, 3]) {
      const s = sats[si]; if (!s) continue;
      const a = Math.atan2(s.centre.z, s.centre.x); const e = main.edgeAt(a); const f = s.edgeAt(a + Math.PI);
      if (!e.d || !f.d) continue;
      const b = buildBridge({ x: e.x - Math.cos(a) * 0.3, y: 0, z: e.z - Math.sin(a) * 0.3 }, { x: f.x + Math.cos(a) * 0.3, y: s.centre.y, z: f.z + Math.sin(a) * 0.3 }, th);
      bridges.push(b); main.bridges.push(b);
    }
    const all = [...main.lights, ...sats.flatMap((s) => s.lights), ...bridges.flatMap((b) => b.lights)];
    island.add(main.build(all)); for (const s of sats) island.add(s.build(all));
    W.pad = main; W.pads = [main, ...sats]; W.bridges = bridges; W.all = all; W.spawnTint.set(th.rise);
    abyss.setStage(th, W.pads, all);
    // glows and pools
    const gc = new THREE.Color();
    let gi = 0; let pi = 0;
    for (const L of all) {
      if (gi >= 40) break;
      gc.set(L.glowC || th.glow); if (!L.glowC) gc.setRGB(L.color[0], L.color[1] * 0.8, L.color[2] * 0.6);
      glows.A.setXYZW(gi, L.x, L.y, L.z, L.glow * (th.day ? 0.7 : 1)); glows.B.setXYZW(gi, gc.r * (th.day ? 0.6 : 1), gc.g * (th.day ? 0.6 : 1), gc.b * (th.day ? 0.6 : 1), gi * 0.37); gi++;
      if (pi < 40) { pools.A.setXYZW(pi, L.x, L.ground + 0.03, L.z, L.r * 0.6); const lk = th.lightK || 1; pools.B.setXYZW(pi, L.color[0] * lk, L.color[1] * lk, L.color[2] * lk, pi * 0.61); pi++; }
    }
    glows.g.instanceCount = gi; pools.g.instanceCount = pi; glows.A.needsUpdate = glows.B.needsUpdate = pools.A.needsUpdate = pools.B.needsUpdate = true;
    // motes: embers over fires, fireflies over the rim and the abyss
    const P = moteGeo.attributes.position; const S = moteGeo.attributes.aS; const Cc = moteGeo.attributes.color; const fires = all.filter((L) => L.warm && L.kind !== 'lamp' && L.kind !== 'mushrooms');
    const fly = th.name === 'void' ? [0.8, 0.6, 1.0] : th.day ? [1.0, 0.95, 0.6] : [1.0, 0.85, 0.45];
    for (let i = 0; i < NM; i++) {
      if (i < Math.min(NM * 0.35, fires.length * 5)) { const L = fires[i % fires.length]; P.setXYZ(i, L.x + rng.range(-0.2, 0.2), L.y - 0.1, L.z + rng.range(-0.2, 0.2)); S.setXYZW(i, rng.next(), rng.range(0.6, 1.2), 1, rng.range(0.09, 0.14)); Cc.setXYZ(i, 1.0, 0.55, 0.2); }
      else { const a = rng.range(0, 6.283); const kk = rng.range(0.95, 1.45); P.setXYZ(i, Math.max(-10.5, Math.min(10.5, Math.cos(a) * ARENA.x * kk)), rng.range(0.4, 2.6) - (kk > 1.25 ? rng.range(0, 1.5) : 0), Math.max(-5.5, Math.min(6.5, Math.sin(a) * ARENA.z * kk * 1.15))); S.setXYZW(i, rng.next(), rng.range(0.25, 0.6), 0, rng.range(0.1, 0.16)); Cc.setXYZ(i, fly[0], fly[1], fly[2]); }
    }
    P.needsUpdate = S.needsUpdate = Cc.needsUpdate = true;
    dMat.color.setRGB(th.amb.sky[0] * 0.9, th.amb.sky[1] * 0.9, th.amb.sky[2] * 0.9);
    const uv = voxAtlas().uv(th.side.rows[0][0]); const U = dGeo.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, uv[0] + (uv[2] - uv[0]) * (i % 2), uv[1] + (uv[3] - uv[1]) * ((i >> 1) % 2)); U.needsUpdate = true;
    bits.length = 0; debris.count = 0;
    W.boss = 0; setUnitsLight(th, false); glows.mesh.material.uniforms.uK.value = 1;
    W.buildMs = performance.now() - t0;
    return th;
  };

  // where a monster arriving at (x, z) on the rim starts: out over the edge along the ellipse normal (or along a bridge)
  W.arrival = (x, z) => {
    const pad = W.pad; if (!pad) return null;
    let dx = x / (ARENA.x * ARENA.x); let dz = z / (ARENA.z * ARENA.z); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (const b of W.bridges) {
      const ax = b.a.x - x; const az = b.a.z - z; if (Math.hypot(ax, az) < 2.4) { return { dx: b.dir[0], dz: b.dir[1], d: Math.min(5, Math.hypot(b.b.x - x, b.b.z - z)), bridge: true, slope: (b.b.y - b.a.y) / Math.max(1, Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z)) }; }
    }
    let s = 0; while (s < 6 && pad.isFloor(x + dx * s, z + dz * s)) s += 0.25;
    return { dx, dz, d: s + 0.7, bridge: false, slope: 0 };
  };
  W.debris = (x, z, n, up = 3) => {
    for (let i = 0; i < n; i++) {
      if (bits.length >= DEBRIS) bits.shift();
      bits.push({ x: x + (Math.random() - 0.5) * 0.8, y: -0.1, z: z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * up, vz: (Math.random() - 0.5) * 1.5, r: Math.random() * 6, t: 0, s: 0.6 + Math.random() * 0.7 });
    }
  };
  let quakeT = 0;
  W.quake = (x, z) => {
    quakeT = 0.8; const pad = W.pad; if (!pad) return;
    for (let k = -3; k <= 3; k++) { const a = Math.atan2(z / ARENA.z, x / ARENA.x) + k * 0.12; const e = pad.edgeAt(Math.atan2(Math.sin(a) * ARENA.z, Math.cos(a) * ARENA.x)); W.debris(e.x, e.z, 2, 2); }
  };
  W.setBoss = (on) => {
    const k = on ? 1 : 0; if (k === W.boss) return; W.boss = k;
    setUnitsLight(W.theme, on); glows.mesh.material.uniforms.uK.value = on ? 1.25 : 1; pools.mesh.material.uniforms.uK.value = on ? 1.3 : 1;
  };

  let time = 0;
  W.update = (dt) => {
    time = (time + dt) % 4000;
    for (const m of [glows.mesh.material, pools.mesh.material, moteMat]) m.uniforms.uTime.value = time;
    moteMat.uniforms.uScale.value = H.renderer.domElement.height / (2 * Math.tan(H.camera.fov * Math.PI / 360));
    abyss.update(dt);
    // falling blocks
    let n = 0;
    for (let i = bits.length - 1; i >= 0; i--) { const b = bits[i]; b.t += dt; b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.r += dt * 5; if (b.y < -9 || b.t > 2.5) bits.splice(i, 1); }
    for (const b of bits) { if (n >= DEBRIS) break; e4.set(b.r, b.r * 0.7, 0); q4.setFromEuler(e4); s4.setScalar(b.s); m4.compose(v4.set(b.x, b.y, b.z), q4, s4); debris.setMatrixAt(n++, m4); }
    debris.count = n; debris.instanceMatrix.needsUpdate = true;
    // the boss's arrival shakes the island (visual only)
    if (quakeT > 0) { quakeT = Math.max(0, quakeT - dt); const j = Math.sin(time * 70) * 0.05 * quakeT; for (const m of island.children) { m.position.y = j * (m === island.children[0] ? 0.5 : 1.4); m.updateMatrix(); } }
  };
  W.mat = voxMaterial();
  return W;
}
