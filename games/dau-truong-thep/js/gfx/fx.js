// Effects: projectiles, particles, ground rings and telegraphs, zones, beams, airdrop crates, flashes, camera shake.
// Reads match state and sim events. Never writes to the match.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { TEAMS, PICKUPS, RULES } from '../data.js';
import { visibleTo } from '../sim.js';

const TEAM_HDR = [new THREE.Color(0.25, 0.85, 2.0), new THREE.Color(2.1, 0.55, 0.16)];
const C = (r, g, b) => new THREE.Color(r, g, b);
const FIRE = C(2.2, 1.0, 0.25), EMBER = C(1.6, 0.4, 0.08), WHITE = C(2, 2, 2), SMOKE = C(0.16, 0.15, 0.14), DUST = C(0.42, 0.36, 0.27),
  HEAL = C(0.35, 1.9, 0.5), ICE = C(0.9, 1.6, 2.2), FOG = C(0.62, 0.64, 0.66), ARC = C(0.5, 1.2, 2.4), VIOLET = C(1.2, 0.5, 2.2), WOOD = C(0.4, 0.26, 0.12), CLAY = C(0.55, 0.3, 0.18), STONE = C(0.5, 0.47, 0.4);

// How each projectile looks: length and width of the streak, how much it is tinted by the team colour, and what it trails.
const SHOT_LOOK = {
  bullet: { len: 2.1, wid: 0.5, white: 0.35 },
  shell: { len: 2.2, wid: 1.25, white: 0.2, trail: 'spark' },
  rail: { len: 7, wid: 0.7, white: 0.5 },
  pulse: { len: 1.6, wid: 1.15, white: 0.15 },
  rocket: { len: 2.2, wid: 0.9, white: 0.3, trail: 'fire' },
  pellet: { len: 1.5, wid: 0.42, white: 0.4 },
  frost: { len: 2.0, wid: 0.8, white: 0.6, trail: 'spark' },
  rivet: { len: 1.9, wid: 0.4, white: 0.3 },
};

function particles(max, additive) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), span = new Float32Array(max), base = new Float32Array(max * 2), phys = new Float32Array(max * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 600 } },
    vertexShader: 'attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC; void main() { vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying vec4 vC; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(${additive ? '0.0' : '0.45'}, 1.0, r)) * vC.a; if (a < 0.003) discard; gl_FragColor = vec4(vC.rgb, a * ${additive ? '0.5' : '1.0'}); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = additive ? 8 : 6;
  let head = 0, live = 0;
  // o: { v: [vx, vy, vz], life, size, grow (size multiplier at death), drag, grav, a (alpha) }
  function emit(x, y, z, c, o) {
    const i = head; head = (head + 1) % max;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = o.v[0]; vel[i * 3 + 1] = o.v[1]; vel[i * 3 + 2] = o.v[2];
    col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = o.a ?? 1;
    life[i] = span[i] = o.life; base[i * 2] = o.size; base[i * 2 + 1] = o.grow ?? 1; phys[i * 2] = o.drag ?? 0; phys[i * 2 + 1] = o.grav ?? 0;
    size[i] = o.size; live = Math.max(live, 1);
  }
  const alpha0 = new Float32Array(max);
  function update(dt) {
    let any = 0;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
      if (life[i] === span[i]) alpha0[i] = col[i * 4 + 3];
      life[i] -= dt; any = 1;
      const k = Math.max(0, life[i] / span[i]), d = Math.max(0, 1 - phys[i * 2] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - phys[i * 2 + 1] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.05 && phys[i * 2 + 1] > 0) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.35; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; }
      size[i] = base[i * 2] * (1 + (base[i * 2 + 1] - 1) * (1 - k));
      col[i * 4 + 3] = alpha0[i] * Math.min(1, k * 2.2);
    }
    live = any;
    geo.attributes.position.needsUpdate = true; geo.attributes.aColor.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
  }
  return { pts, emit, update, mat };
}

const GROUND_FRAG = `
  uniform vec3 uColor; uniform float uT, uA, uTime; uniform int uMode; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = 0.0, ang = atan(p.y, p.x); vec3 c = uColor;
    if (r > 1.0) discard;
    if (uMode == 0) {
      float w = 0.12 * (1.0 - uT) + 0.03;
      a = (1.0 - smoothstep(0.0, w, abs(r - uT))) * (1.0 - uT) + (1.0 - smoothstep(0.0, max(uT, 0.01), r)) * 0.18 * (1.0 - uT);
    } else if (uMode == 1) {
      float rim = 1.0 - smoothstep(0.0, 0.05, abs(r - 0.94));
      float fill = step(r, uT * 0.94) * (0.28 + 0.14 * sin(uTime * 16.0));
      float edge = (1.0 - smoothstep(0.0, 0.05, abs(r - uT * 0.94))) * 0.8;
      a = rim * 0.95 + fill + edge + 0.07;
    } else if (uMode == 2) {
      float swirl = 0.5 + 0.5 * sin(ang * 6.0 + r * 9.0 - uTime * 2.5);
      float rim = 1.0 - smoothstep(0.0, 0.06, abs(r - 0.95));
      float pulse = 1.0 - smoothstep(0.0, 0.08, abs(r - fract(uTime * 0.45)));
      a = rim * 0.9 + (1.0 - r) * 0.14 + swirl * 0.14 * (1.0 - smoothstep(0.3, 1.0, r)) + pulse * 0.25 * (1.0 - r);
    } else if (uMode == 3) {
      float n = hash(floor(p * 9.0)) * 0.5 + hash(floor(p * 23.0)) * 0.5;
      a = (1.0 - smoothstep(0.25, 1.0, r + n * 0.35)) * 0.8; c = vec3(0.02, 0.015, 0.01);
    } else if (uMode == 4) {
      float core = 1.0 - smoothstep(0.1, 0.17, r), blink = 0.5 + 0.5 * sin(uTime * 9.0);
      a = core * (0.5 + blink) + (1.0 - smoothstep(0.0, 0.035, abs(r - 0.95))) * 0.28 * uT;
    } else {
      float dash = step(0.5, fract((ang + uTime * 0.8) * 8.0 / 6.2832));
      a = (1.0 - smoothstep(0.0, 0.06, abs(r - 0.86))) * dash * 0.85 + (1.0 - smoothstep(0.0, 0.03, abs(r - 0.6))) * 0.3;
    }
    a *= uA;
    gl_FragColor = vec4(c, a);
  }`;

const QUAD_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function makeFx(G, mechs) {
  const Q = G.quality, group = new THREE.Group();
  const add = particles(Q.particles, true), alp = particles(Math.round(Q.particles * 0.55), false);
  group.add(alp.pts, add.pts);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let shake = 0, time = 0;
  const V = new THREE.Vector3();

  const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const groundPool = [], groundLive = [];
  function ground(mode, x, z, r, color, opts = {}) {
    let g = groundPool.pop();
    if (!g) {
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: QUAD_VERT, fragmentShader: GROUND_FRAG,
        uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uA: { value: 1 }, uTime: { value: 0 }, uMode: { value: 0 } } });
      g = { mesh: new THREE.Mesh(flat, mat), u: mat.uniforms };
      g.mesh.renderOrder = 3; group.add(g.mesh);
    }
    g.mesh.material.blending = mode === 3 ? THREE.NormalBlending : THREE.AdditiveBlending;
    g.mesh.visible = true; g.mesh.position.set(x, mode === 3 ? 0.07 : 0.13, z); g.mesh.scale.set(r, 1, r);
    g.u.uMode.value = mode; g.u.uColor.value.copy(color); g.u.uT.value = 0; g.u.uA.value = opts.alpha ?? 1;
    g.age = 0; g.life = opts.life ?? 0; g.fade = opts.fade ?? 0; g.sweep = !!opts.sweep; g.alpha = opts.alpha ?? 1; g.grow = opts.grow ?? 0; g.r = r;
    groundLive.push(g);
    return g;
  }
  function release(g) { g.mesh.visible = false; const i = groundLive.indexOf(g); if (i >= 0) groundLive.splice(i, 1); groundPool.push(g); }
  const ring = (x, z, r, color, life = 0.45, alpha = 1) => ground(0, x, z, r, color, { life, sweep: true, alpha });
  const scorch = (x, z, r) => { if (Q.name !== 'low') ground(3, x, z, r * 0.8, WHITE, { life: 9, fade: 4, alpha: 0.55 }); };

  const lights = [];
  for (let i = 0; i < Q.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 16, 1.6); l.userData.t = 0; group.add(l); lights.push(l); }
  function flash(x, y, z, color, power, life = 0.22) {
    let best = null;
    for (const l of lights) if (!best || l.userData.t < best.userData.t) best = l;
    if (!best) return;
    best.position.set(x, y, z); best.color.copy(color); best.userData.t = life; best.userData.life = life; best.userData.p = power;
  }

  const SHOT_MAX = 200;
  const shotMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vC; void main() { vUv = uv; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; varying vec3 vC;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float head = 1.0 - smoothstep(0.0, 1.0, length(vec2((p.x - 0.55) * 2.4, p.y)));
        float tail = (1.0 - smoothstep(0.0, 1.0, abs(p.y) * (1.6 + (1.0 - vUv.x) * 3.0))) * smoothstep(0.0, 0.75, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
        float a = head * 1.3 + tail * 0.7;
        gl_FragColor = vec4(mix(vC, vec3(2.4), head * head * 0.8), a);
      }`,
  }), SHOT_MAX);
  shotMesh.frustumCulled = false; shotMesh.renderOrder = 9; shotMesh.count = 0;
  shotMesh.setColorAt(0, WHITE);
  group.add(shotMesh);
  const M = new THREE.Matrix4(), QT = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), col = new THREE.Color();

  const beams = [];
  const beamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  function beam(x0, z0, x1, z1, width, color, life, power) {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: QUAD_VERT,
      uniforms: { uColor: { value: color.clone() }, uA: { value: 1 }, uTime: { value: 0 } },
      fragmentShader: `uniform vec3 uColor; uniform float uA, uTime; varying vec2 vUv;
        void main() { float y = abs(vUv.y * 2.0 - 1.0); float core = 1.0 - smoothstep(0.0, 0.35, y), halo = 1.0 - smoothstep(0.0, 1.0, y);
          float fl = 0.85 + 0.15 * sin(vUv.x * 60.0 - uTime * 50.0);
          float ends = smoothstep(0.0, 0.02, vUv.x) * (1.0 - smoothstep(0.97, 1.0, vUv.x));
          gl_FragColor = vec4(mix(uColor, vec3(3.0), core), (core + halo * 0.5 * fl) * uA * ends); }` });
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.position.set(x0, 1.5, z0); mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0); mesh.scale.set(Math.hypot(x1 - x0, z1 - z0), 1, width);
    mesh.renderOrder = 9; group.add(mesh);
    const b = { mesh, age: 0, life, power, width };
    beams.push(b);
    return b;
  }

  const domeGeo = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  function domeMaterial(color) {
    return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: color }, uTime: { value: 0 }, uA: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime, uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vV)), 1.6);
          vec2 h = vec2(atan(vP.z, vP.x) * 5.0, vP.y * 9.0 - uTime * 0.6);
          vec2 cell = abs(fract(h) - 0.5);
          float grid = 1.0 - smoothstep(0.0, 0.07, 0.5 - max(cell.x, cell.y));
          float base = 1.0 - smoothstep(0.0, 0.1, vP.y);
          float a = (f * 0.7 + grid * 0.22 + base * 0.8 + 0.05) * uA;
          gl_FragColor = vec4(uColor * 1.5, a);
        }` });
  }

  const zoneViews = new Map(), crateViews = new Map();
  const FIELD_COLOR = { heal: HEAL, slow: VIOLET, smoke: FOG, blizzard: ICE, magnet: VIOLET };

  const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x2a6f9a, emissiveIntensity: 0.9, flatShading: true });
  const shardGeo = new THREE.ConeGeometry(0.62, 2.6, 5).translate(0, 1.3, 0);
  function iceWall(z) {
    const g = new THREE.Group();
    for (const [x, zz] of z.pts) for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(shardGeo, iceMat);
      m.position.set(x + rnd(-0.35, 0.35), 0, zz + rnd(-0.35, 0.35)); m.rotation.set(rnd(-0.25, 0.25), rnd(0, 6), rnd(-0.25, 0.25)); m.scale.set(rnd(0.7, 1.15), rnd(0.6, 1.1), rnd(0.7, 1.15));
      m.castShadow = true; g.add(m);
    }
    return g;
  }

  const turretGeos = [null, null];
  function turretModel(team) {
    if (!turretGeos[team]) {
      const b = new Builder(0.5);
      b.use('base', 0x3a424c);
      for (let i = 0; i < 3; i++) b.push().rotY(i * 2.094).move(0.45, 0.3, 0).rotZ(-0.9).box(0.9, 0.12, 0.14).pop();
      b.push().move(0, 0.55, 0).cyl(0.22, 0.3, 0.5, 8).pop();
      b.use('head', TEAMS[team].color).push().move(0, 1.0, 0).box(0.7, 0.4, 0.6).pop();
      b.tint(0x8d98a6).push().move(0.7, 1.0, 0.14).rotZ(-Math.PI / 2).cyl(0.06, 0.07, 0.8, 6).pop().push().move(0.7, 1.0, -0.14).rotZ(-Math.PI / 2).cyl(0.06, 0.07, 0.8, 6).pop();
      b.use('glow').push().move(0, 1.25, 0).box(0.2, 0.06, 0.2).pop();
      turretGeos[team] = b.build();
    }
    const g = turretGeos[team], root = new THREE.Group(), metal = G.gfx.tex.material('metal'), head = new THREE.Group();
    const base = new THREE.Mesh(g.base, metal); base.castShadow = true;
    const hm = new THREE.Mesh(g.head, metal); hm.castShadow = true;
    head.add(hm, new THREE.Mesh(g.glow, new THREE.MeshBasicMaterial({ color: TEAM_HDR[team], toneMapped: false })));
    root.add(base, head);
    return root;
  }

  function crateModel(type) {
    const b = new Builder(0.8), c = new THREE.Color(PICKUPS[type].color);
    b.use('box', 0x97a2ad).push().move(0, 0.55, 0).box(1.3, 1.0, 1.3).pop();
    b.tint(0x3a424c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.push().move(sx * 0.62, 0.55, sz * 0.62).box(0.16, 1.1, 0.16).pop();
    b.push().move(0, 1.08, 0).box(1.4, 0.08, 1.4).pop();
    b.use('glow');
    for (const s of [-1, 1]) b.push().move(0, 0.55, s * 0.66).box(0.9, 0.2, 0.02).pop().push().move(s * 0.66, 0.55, 0).box(0.02, 0.2, 0.9).pop();
    b.push().move(0, 1.13, 0).box(0.5, 0.03, 0.5).pop();
    b.use('chute', 0xffffff);
    const can = new THREE.SphereGeometry(2.1, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.42).toNonIndexed();
    can.computeVertexNormals();
    const cc = [], p = can.attributes.position;
    for (let i = 0; i < p.count; i += 3) { const a = Math.atan2(p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2), p.getX(i) + p.getX(i + 1) + p.getX(i + 2)); const stripe = Math.floor((a + Math.PI) / (Math.PI / 6)) % 2; for (let k = 0; k < 3; k++) cc.push(stripe ? 0.95 : c.r, stripe ? 0.93 : c.g, stripe ? 0.88 : c.b); }
    can.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    b.push().move(0, 2.4, 0).geo(can).pop();
    b.tint(0xddd6c8);
    for (let i = 0; i < 6; i++) { const a = i * 1.047; b.push().move(Math.cos(a) * 0.85, 2.55, Math.sin(a) * 0.85).rotY(-a).rotZ(-0.43).cyl(0.015, 0.015, 3.3, 4).pop(); }
    const g = b.build(), root = new THREE.Group();
    const box = new THREE.Mesh(g.box, G.gfx.tex.material('metal')); box.castShadow = true;
    const glow = new THREE.Mesh(g.glow, new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.6), toneMapped: false }));
    const chute = new THREE.Mesh(g.chute, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x333333 }));
    root.add(box, glow, chute);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 9, 12, 1, true).translate(0, 4.5, 0), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: c.clone().multiplyScalar(1.4) } }, vertexShader: QUAD_VERT,
      fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; void main() { float a = (1.0 - vUv.y) * (1.0 - vUv.y) * 0.5; gl_FragColor = vec4(uColor, a); }' }));
    pillar.visible = false; pillar.renderOrder = 7; root.add(pillar);
    return { root, chute, pillar, color: c };
  }

  function burst(x, y, z, n, color, speed, life, size, up = 0.5, sys = add, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = rnd(-0.2, 1) * up, s = speed * rnd(0.3, 1);
      sys.emit(x, y, z, color, { v: [Math.cos(a) * s, e * speed + (o.lift || 0), Math.sin(a) * s], life: life * rnd(0.6, 1.1), size: size * rnd(0.6, 1.2), grow: o.grow ?? 0.3, drag: o.drag ?? 2.5, grav: o.grav ?? 0, a: o.a ?? 1 });
    }
  }

  function explosion(x, z, r, tint, big) {
    const k = Math.min(1, Q.particles / 800);
    burst(x, 0.9, z, Math.round(10 * k * (big ? 1.5 : 1)), tint, r * 3.0, 0.4, r * 0.55, 0.7, add, { grow: 1.6, drag: 5, a: 0.6 });
    add.emit(x, 0.9, z, WHITE, { v: [0, 0, 0], life: 0.14, size: r * 1.5, grow: 1.5, a: 0.8 });
    burst(x, 0.6, z, Math.round(14 * k), EMBER, r * 6, 0.7, 0.16, 1.2, add, { grav: 14, drag: 0.6 });
    burst(x, 1.0, z, Math.round(5 * k * (big ? 1.5 : 1)), SMOKE, r * 1.4, 0.9, r * 0.6, 0.5, alp, { grow: 2.2, drag: 2.2, lift: 1.8, a: 0.22 });
    ring(x, z, r * 1.25, tint, 0.4);
    scorch(x, z, r * 0.8);
    flash(x, 1.6, z, tint, big ? 60 : 34, 0.28);
    kick(x, z, big ? 0.55 : 0.3);
  }

  function kick(x, z, amount) {
    const m = G.match, me = m && m.units[G.me];
    const d = me ? Math.hypot(me.x - x, me.z - z) : 10;
    shake = Math.min(1.2, shake + amount * Math.max(0, 1 - d / 26));
  }

  const SKILL_FX = {
    shield: (u) => ring(u.x, u.z, 2.4, TEAM_HDR[u.color], 0.4),
    dash: (u) => burst(u.x, 0.4, u.z, 12, DUST, 5, 0.6, 1.0, 0.3, alp, { grow: 2, a: 0.5 }),
    blink: (u) => { burst(u.x, 1.0, u.z, 16, VIOLET, 4, 0.45, 0.5); ring(u.x, u.z, 1.8, VIOLET, 0.35); },
    buff: (u) => { burst(u.x, 1.0, u.z, 18, FIRE, 5, 0.5, 0.4, 1); ring(u.x, u.z, 2.2, FIRE, 0.4); },
    nova: (u) => burst(u.x, 0.4, u.z, 10, DUST, 3, 0.7, 0.9, 0.2, alp, { grow: 2, a: 0.45 }),
    beam: (u) => ring(u.x, u.z, 1.8, TEAM_HDR[u.color], 0.5),
    dome: (u) => ring(u.x, u.z, 6.2, TEAM_HDR[u.color], 0.6),
    zone: (u) => ring(u.x, u.z, 2.0, HEAL, 0.4),
  };

  function event(e, m) {
    const u = e.id !== undefined ? m.units[e.id] : null;
    switch (e.t) {
      case 'fire': {
        mechs.muzzle(u, e.side || 0, V);
        const c = TEAM_HDR[u.color], heavy = e.vis === 'shell' || e.vis === 'rail' || e.vis === 'rocket' || e.vis === 'mortar' || e.vis === 'pellet';
        const dx = Math.cos(e.a), dz = Math.sin(e.a);
        for (let i = 0; i < (heavy ? 7 : 3); i++) add.emit(V.x, V.y, V.z, i ? c : WHITE, { v: [dx * rnd(2, 9) + rnd(-1.5, 1.5), rnd(-0.5, 1.5), dz * rnd(2, 9) + rnd(-1.5, 1.5)], life: rnd(0.06, 0.14), size: heavy ? rnd(0.5, 0.9) : rnd(0.3, 0.5), grow: 0.4, drag: 6 });
        if (heavy) { alp.emit(V.x, V.y, V.z, SMOKE, { v: [dx * 2, 0.8, dz * 2], life: 0.5, size: 0.5, grow: 2.2, drag: 2, a: 0.18 }); flash(V.x, V.y, V.z, c, 14, 0.1); }
        if (e.id === G.me) shake = Math.min(1.2, shake + (heavy ? 0.16 : 0.035));
        break;
      }
      case 'impact': {
        const c = e.vis === 'pulse' ? ARC : FIRE;
        if (e.splash) { explosion(e.x, e.z, e.splash, FIRE, false); break; }
        if (e.on === 'end') { add.emit(e.x, 1.4, e.z, c, { v: [0, 0, 0], life: 0.12, size: 0.4, grow: 0.2 }); break; }
        burst(e.x, 1.4, e.z, 6, e.on === 'dome' ? ARC : c, 6, 0.22, 0.22, 0.8, add, { grav: 9, drag: 1.5 });
        add.emit(e.x, 1.4, e.z, WHITE, { v: [0, 0, 0], life: 0.09, size: e.vis === 'rail' ? 1.6 : 0.8, grow: 1.6 });
        if (e.on === 'wall') burst(e.x, 1.3, e.z, 4, STONE, 2.5, 0.6, 0.45, 0.6, alp, { grow: 1.8, a: 0.5, grav: 2 });
        if (e.on === 'dome') ring(e.x, e.z, 1.0, ARC, 0.25);
        if (e.vis === 'rail') flash(e.x, 1.5, e.z, ARC, 18, 0.12);
        break;
      }
      case 'hit':
        if (e.absorbed > 0 && e.amt <= 0) burst(e.x, 1.4, e.z, 4, ARC, 4, 0.25, 0.25);
        if (e.id === G.me) shake = Math.min(1.2, shake + Math.min(0.3, e.amt / 900));
        break;
      case 'explode':
        if (e.why === 'vent') { for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, d = Math.random() * e.r * 0.6; add.emit(e.x + Math.cos(a) * d, 0.3, e.z + Math.sin(a) * d, i % 3 ? FIRE : EMBER, { v: [Math.cos(a) * 1.5, rnd(6, 16), Math.sin(a) * 1.5], life: rnd(0.4, 0.8), size: rnd(0.8, 1.5), grow: 0.4, drag: 1.2, a: 0.7 }); } ring(e.x, e.z, e.r * 1.2, FIRE, 0.4); flash(e.x, 2, e.z, FIRE, 50, 0.4); kick(e.x, e.z, 0.35); }
        else explosion(e.x, e.z, e.r, e.why === 'mine' ? ARC : FIRE, e.why !== 'mine');
        break;
      case 'capture': if (e.team >= 0) { ring(e.x, e.z, 7, TEAM_HDR[e.team], 0.7); burst(e.x, 0.5, e.z, 30, TEAM_HDR[e.team], 4, 1, 0.3, 0.2, add, { lift: 6, drag: 1 }); } break;
      case 'ventWarn': ground(1, e.x, e.z, e.r, C(2.2, 0.5, 0.1), { life: RULES.vent.warn, sweep: true }); break;
      case 'nova':
        ring(e.x, e.z, e.r, FIRE, 0.55); ring(e.x, e.z, e.r * 0.7, WHITE, 0.35); scorch(e.x, e.z, e.r * 0.75);
        for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.283; alp.emit(e.x + Math.cos(a) * 1.5, 0.4, e.z + Math.sin(a) * 1.5, DUST, { v: [Math.cos(a) * 9, 1.5, Math.sin(a) * 9], life: 0.9, size: 1.3, grow: 2.2, drag: 3, a: 0.5 }); }
        burst(e.x, 0.5, e.z, 20, STONE, 9, 0.8, 0.2, 1.3, alp, { grav: 16, drag: 0.5, a: 0.9 });
        flash(e.x, 2, e.z, FIRE, 70, 0.3); kick(e.x, e.z, 0.9);
        break;
      case 'beam': {
        beam(e.x0, e.z0, e.x1, e.z1, e.w * 1.5, TEAM_HDR[u.color], 0.42, true);
        const n = Math.round(Math.hypot(e.x1 - e.x0, e.z1 - e.z0) / 1.2);
        for (let i = 0; i <= n; i++) { const t = i / Math.max(1, n); burst(e.x0 + (e.x1 - e.x0) * t, 1.5, e.z0 + (e.z1 - e.z0) * t, 2, TEAM_HDR[u.color], 3, 0.5, 0.25, 1); }
        flash(e.x1, 1.6, e.z1, TEAM_HDR[u.color], 50, 0.3); kick(e.x0, e.z0, 0.6);
        break;
      }
      case 'death': {
        explosion(e.x, e.z, 2.6, FIRE, true);
        burst(e.x, 1.0, e.z, 14, SMOKE, 9, 1.0, 0.22, 1.4, alp, { grav: 15, drag: 0.4, a: 0.9, grow: 0.8 });
        burst(e.x, 1.0, e.z, 12, TEAM_HDR[u.color], 7, 0.8, 0.3, 1.2, add, { grav: 9 });
        ring(e.x, e.z, 4.5, TEAM_HDR[u.color], 0.6);
        break;
      }
      case 'respawn': ring(e.x, e.z, 3, TEAM_HDR[u.color], 0.7); burst(e.x, 0.3, e.z, 20, TEAM_HDR[u.color], 2, 0.9, 0.3, 0, add, { lift: 5, drag: 1 }); break;
      case 'heal': for (let i = 0; i < 3; i++) add.emit(e.x + rnd(-0.8, 0.8), rnd(0.5, 1.6), e.z + rnd(-0.8, 0.8), HEAL, { v: [0, rnd(1.5, 3), 0], life: 0.8, size: 0.3, grow: 0.3, drag: 1 }); break;
      case 'item': ring(u.x, u.z, 2, HEAL, 0.5); break;
      case 'turretFire': for (let i = 0; i < 3; i++) add.emit(e.x + Math.cos(e.a), 1.1, e.z + Math.sin(e.a), i ? TEAM_HDR[u.color] : WHITE, { v: [Math.cos(e.a) * rnd(2, 7), rnd(0, 1), Math.sin(e.a) * rnd(2, 7)], life: 0.1, size: 0.4, grow: 0.4, drag: 6 }); break;
      case 'zoneEnd':
        if (e.kind === 'wall') burst(e.x, 1.0, e.z, 26, ICE, 7, 0.6, 0.3, 1, add, { grav: 12 });
        else if (e.kind === 'turret') explosion(e.x, e.z, 1.4, FIRE, false);
        break;
      case 'skill': { const fn = SKILL_FX[u.def.skills[e.slot].do]; if (fn && visibleTo(m, u, m.units[G.me].team)) fn(u); break; }
      case 'ram': burst(e.x, 1.2, e.z, 14, FIRE, 9, 0.35, 0.3, 1, add, { grav: 10 }); ring(e.x, e.z, 2.4, WHITE, 0.3); kick(e.x, e.z, 0.5); break;
      case 'shieldBreak': burst(e.x, 1.3, e.z, 18, ARC, 8, 0.5, 0.3, 1, add, { grav: 8 }); ring(e.x, e.z, 2.6, ARC, 0.35); break;
      case 'propHit': burst(e.x, 0.9, e.z, 2, WOOD, 3, 0.5, 0.2, 1, alp, { grav: 12, a: 1 }); break;
      case 'propBreak': {
        const c = e.kind === 'pot' ? CLAY : e.kind === 'crate' ? WOOD : SMOKE;
        burst(e.x, 0.8, e.z, 16, c, 6, 0.9, 0.3, 1.3, alp, { grav: 15, drag: 0.6, a: 1, grow: 0.8 });
        burst(e.x, 0.6, e.z, 6, DUST, 2.5, 0.8, 0.9, 0.3, alp, { grow: 2.2, a: 0.45 });
        break;
      }
      case 'crateLand': burst(e.x, 0.3, e.z, 14, DUST, 4.5, 0.8, 1.0, 0.2, alp, { grow: 2, a: 0.5 }); ring(e.x, e.z, 3, WHITE, 0.4, 0.6); kick(e.x, e.z, 0.2); break;
      case 'pickup': { const c = col.set(PICKUPS[e.type].color).multiplyScalar(2); ring(e.x, e.z, 3, c, 0.5); burst(e.x, 0.8, e.z, 22, c, 3, 0.9, 0.3, 0.2, add, { lift: 4, drag: 1.2 }); break; }
    }
  }

  function syncShots(m, alpha) {
    let n = 0;
    for (const s of m.shots) {
      if (n >= SHOT_MAX) break;
      const look = SHOT_LOOK[s.vis], x = s.px + (s.x - s.px) * alpha, z = s.pz + (s.z - s.pz) * alpha;
      QT.setFromAxisAngle(UP, -Math.atan2(s.dz, s.dx));
      S.set(look.len, 1, look.wid); P.set(x - s.dx * look.len * 0.25, 1.5, z - s.dz * look.len * 0.25);
      shotMesh.setMatrixAt(n, M.compose(P, QT, S));
      shotMesh.setColorAt(n, col.copy(TEAM_HDR[s.color]).lerp(WHITE, look.white));
      n++;
      if (look.trail === 'fire') { add.emit(x - s.dx * 0.7, 1.5, z - s.dz * 0.7, FIRE, { v: [rnd(-0.5, 0.5), rnd(-0.3, 0.6), rnd(-0.5, 0.5)], life: 0.22, size: 0.42, grow: 0.3 }); if (Math.random() < 0.4) alp.emit(x - s.dx, 1.5, z - s.dz, SMOKE, { v: [0, 0.6, 0], life: 0.5, size: 0.3, grow: 2.2, a: 0.16 }); }
      else if (look.trail === 'spark') add.emit(x - s.dx * 0.8, 1.5, z - s.dz * 0.8, TEAM_HDR[s.color], { v: [rnd(-0.6, 0.6), rnd(-0.2, 0.5), rnd(-0.6, 0.6)], life: 0.2, size: 0.5, grow: 0.2, a: 0.7 });
    }
    shotMesh.count = n;
    shotMesh.instanceMatrix.needsUpdate = true;
    if (shotMesh.instanceColor) shotMesh.instanceColor.needsUpdate = true;
  }

  function syncZones(m, dt) {
    const myTeam = m.units[G.me].team, seen = new Set();
    for (const z of m.zones) {
      seen.add(z.id);
      let v = zoneViews.get(z.id);
      const foe = z.team !== myTeam, tc = TEAM_HDR[z.color];
      if (!v) {
        v = {};
        if (z.kind === 'strike') v.g = ground(1, z.x, z.z, z.r, foe ? C(2.2, 0.25, 0.12) : C(0.3, 1.2, 2.0));
        else if (z.kind === 'mine') v.g = ground(4, z.x, z.z, z.r, foe ? C(2.2, 0.4, 0.2) : ARC, { alpha: foe ? 0.55 : 1 });
        else if (z.kind === 'field') v.g = ground(2, z.x, z.z, z.r, FIELD_COLOR[z.vis] || VIOLET, { alpha: z.vis === 'smoke' ? 0.35 : 1 });
        else if (z.kind === 'wall') { v.obj = iceWall(z); group.add(v.obj); }
        else if (z.kind === 'turret') { v.obj = turretModel(z.color); v.obj.position.set(z.x, 0, z.z); group.add(v.obj); v.g = ground(6, z.x, z.z, 1.6, tc); }
        else if (z.kind === 'dome') {
          v.dome = new THREE.Mesh(domeGeo, domeMaterial(tc.clone()));
          v.dome.position.set(z.x, 0, z.z); v.dome.scale.setScalar(0.01); v.dome.renderOrder = 6; group.add(v.dome);
          v.g = ground(2, z.x, z.z, z.r, tc);
        }
        zoneViews.set(z.id, v);
      }
      if (z.kind === 'strike') {
        v.g.u.uT.value = 1 - z.delay / z.total;
        if (z.lob) { const k = 1 - z.delay / z.total; add.emit(z.x0 + (z.x - z.x0) * k, 1.6 + Math.sin(k * Math.PI) * 8, z.z0 + (z.z - z.z0) * k, FIRE, { v: [0, 0, 0], life: 0.16, size: 0.9, grow: 0.25 }); } else
        if (z.delay < 0.32) for (let i = 0; i < 2; i++) add.emit(z.x + z.delay * 6, 1 + z.delay * 60 + i * 1.5, z.z - z.delay * 8, FIRE, { v: [0, 0, 0], life: 0.12, size: 0.8, grow: 0.3 });
      } else if (z.kind === 'mine') v.g.u.uT.value = z.delay > 0 ? 0 : 1;
      else if (z.kind === 'field') {
        v.g.u.uA.value = Math.min(1, z.age * 4, (z.dur - z.age) * 3);
        const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * z.r, px = z.x + Math.cos(a) * d, pz = z.z + Math.sin(a) * d;
        if (z.vis === 'smoke') { for (let i = 0; i < 2; i++) if (z.dur - z.age > 0.8) alp.emit(px, rnd(0.6, 2.2), pz, FOG, { v: [rnd(-0.4, 0.4), 0.3, rnd(-0.4, 0.4)], life: 1.5, size: 2.6, grow: 1.5, a: 0.34 }); }
        else if (z.vis === 'blizzard') { for (let i = 0; i < 3; i++) add.emit(px + 2, rnd(3, 6), pz - 1, ICE, { v: [-5, -9, 2.5], life: 0.55, size: 0.22, grow: 0.6, a: 0.9 }); }
        else if (z.vis === 'magnet') add.emit(px, 0.8, pz, VIOLET, { v: [(z.x - px) * 2.2, 0.4, (z.z - pz) * 2.2], life: 0.45, size: 0.3, grow: 0.3 });
        else if (Math.random() < dt * 18) add.emit(px, 0.2, pz, z.vis === 'heal' ? HEAL : VIOLET, { v: [0, z.vis === 'heal' ? 2.4 : 0.8, 0], life: 0.9, size: 0.26, grow: 0.3 });
      } else if (z.kind === 'dome') {
        const k = Math.min(1, z.age * 3.5), out = Math.min(1, (z.dur - z.age) * 3);
        v.dome.scale.setScalar(z.r * (0.2 + 0.8 * k * (2 - k)));
        v.dome.material.uniforms.uTime.value = time; v.dome.material.uniforms.uA.value = out;
        v.g.u.uA.value = out * 0.7;
      } else if (z.kind === 'wall') {
        const k = Math.min(1, z.age * 5), out = Math.min(1, (z.dur - z.age) * 4);
        v.obj.scale.y = Math.max(0.01, k * (2 - k) * out);
      } else if (z.kind === 'turret') {
        v.obj.children[1].rotation.y = -z.aim;
        v.obj.scale.setScalar(Math.min(1, 0.2 + z.age * 4));
      }
    }
    for (const [id, v] of zoneViews) if (!seen.has(id)) { if (v.g) release(v.g); if (v.dome) { group.remove(v.dome); v.dome.material.dispose(); } if (v.obj) group.remove(v.obj); zoneViews.delete(id); }
  }

  function syncCrates(m, dt) {
    const seen = new Set();
    for (const c of m.crates) {
      seen.add(c.id);
      let v = crateViews.get(c.id);
      if (!v) { v = crateModel(c.type); v.mark = ground(6, c.x, c.z, 2.2, v.color.clone().multiplyScalar(1.6)); v.fold = 1; group.add(v.root); crateViews.set(c.id, v); }
      const k = Math.max(0, c.fall) / RULES.crate.fall;
      v.root.position.set(c.x + Math.sin(time * 1.3 + c.id) * 0.5 * k, k * 24, c.z);
      v.root.rotation.z = Math.sin(time * 1.7 + c.id) * 0.12 * k;
      if (c.fall <= 0) {
        v.fold = Math.max(0, v.fold - dt * 2.5);
        v.root.rotation.y += dt * 0.6;
        v.root.position.y = 0.12 + Math.sin(time * 2.4 + c.id) * 0.1;
        v.pillar.visible = true;
        if (Math.random() < dt * 8) add.emit(c.x + rnd(-0.8, 0.8), 0.3, c.z + rnd(-0.8, 0.8), v.color, { v: [0, rnd(1.5, 3), 0], life: 1, size: 0.22, grow: 0.3 });
      }
      v.chute.visible = v.fold > 0.02; v.chute.scale.set(v.fold, 0.4 + 0.6 * v.fold, v.fold);
      v.mark.u.uA.value = c.fall > 0 ? 0.9 : 0.45;
    }
    for (const [id, v] of crateViews) if (!seen.has(id)) { group.remove(v.root); release(v.mark); crateViews.delete(id); }
  }

  const NEUTRAL = C(0.7, 0.7, 0.7), pointViews = [];
  const beaconGeo = new THREE.CylinderGeometry(0.35, 0.6, 12, 12, 1, true).translate(0, 6, 0);
  // Control points: a ring that fills with the capturing team's colour and a light beacon in the owner's colour.
  function syncPoints(m) {
    while (pointViews.length < m.points.length) {
      const p = m.points[pointViews.length];
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: QUAD_VERT,
        uniforms: { uColor: { value: new THREE.Color() } }, fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; void main() { float a = (1.0 - vUv.y) * (1.0 - vUv.y) * 0.55; gl_FragColor = vec4(uColor, a); }' });
      const beacon = new THREE.Mesh(beaconGeo, mat); beacon.position.set(p.x, 0, p.z); beacon.renderOrder = 7; group.add(beacon);
      pointViews.push({ rim: ground(2, p.x, p.z, p.r, NEUTRAL), fill: ground(1, p.x, p.z, p.r, NEUTRAL, { alpha: 0.7 }), beacon });
    }
    m.points.forEach((p, i) => {
      const v = pointViews[i], own = p.owner < 0 ? NEUTRAL : TEAM_HDR[p.owner];
      v.rim.u.uColor.value.copy(own); v.beacon.material.uniforms.uColor.value.copy(own);
      v.fill.u.uColor.value.copy(p.prog < 0 ? TEAM_HDR[0] : TEAM_HDR[1]); v.fill.u.uT.value = Math.abs(p.prog);
      v.fill.u.uA.value = Math.abs(p.prog) > 0.01 && Math.abs(p.prog) < 1 ? 0.7 : 0;
    });
  }
  function clearPoints() { for (const v of pointViews) { release(v.rim); release(v.fill); group.remove(v.beacon); v.beacon.material.dispose(); } pointViews.length = 0; }

  const casts = new Map();
  function syncCasts(m) {
    const myTeam = m.units[G.me].team, seen = new Set();
    for (const u of m.units) {
      if (!u.alive || !u.cast || !visibleTo(m, u, myTeam)) continue;
      seen.add(u.id);
      const s = u.cast.skill, k = 1 - u.cast.t / u.cast.total, foe = u.team !== myTeam;
      let v = casts.get(u.id);
      if (!v) {
        v = {};
        if (s.do === 'nova') v.g = ground(1, u.x, u.z, s.radius, foe ? C(2.2, 0.3, 0.1) : C(1.8, 1.1, 0.3));
        else v.b = beam(u.x, u.z, u.x + Math.cos(u.cast.aim) * s.range, u.z + Math.sin(u.cast.aim) * s.range, 0.2, foe ? C(2.2, 0.3, 0.2) : TEAM_HDR[u.color], 99, false);
        casts.set(u.id, v);
      }
      if (v.g) { v.g.mesh.position.x = u.x; v.g.mesh.position.z = u.z; v.g.u.uT.value = k; }
      if (v.b) {
        v.b.mesh.position.set(u.x, 1.5, u.z); v.b.mesh.scale.z = 0.12 + k * 0.5; v.b.mesh.material.uniforms.uA.value = 0.25 + k * 0.5;
        if (Math.random() < 0.6) { const a = Math.random() * 6.283; add.emit(u.x + Math.cos(a) * 2.2, 1.5 + rnd(-0.5, 0.8), u.z + Math.sin(a) * 2.2, TEAM_HDR[u.color], { v: [-Math.cos(a) * 6, 0, -Math.sin(a) * 6], life: 0.3, size: 0.3, grow: 0.3 }); }
      }
    }
    for (const [id, v] of casts) if (!seen.has(id)) { if (v.g) release(v.g); if (v.b) v.b.life = 0; casts.delete(id); }
  }

  function unitTrails(m, dt) {
    const myTeam = m.units[G.me].team;
    for (const u of m.units) {
      if (!u.alive || !visibleTo(m, u, myTeam)) continue;
      const sp = Math.hypot(u.x - u.px, u.z - u.pz) * 30;
      if (!u.def.hover && sp > 2 && Math.random() < dt * sp * 1.6) alp.emit(u.x + rnd(-0.5, 0.5), 0.2, u.z + rnd(-0.5, 0.5), DUST, { v: [rnd(-0.5, 0.5), 0.7, rnd(-0.5, 0.5)], life: 0.8, size: 0.7, grow: 2.2, a: 0.28 });
      if (u.dash) add.emit(u.x, 1.0, u.z, TEAM_HDR[u.color], { v: [0, 0, 0], life: 0.25, size: 1.6, grow: 0.2, a: 0.5 });
      if (u.hasteT > 0 && Math.random() < dt * 20) add.emit(u.x + rnd(-0.6, 0.6), 0.4, u.z + rnd(-0.6, 0.6), ARC, { v: [0, 1, 0], life: 0.4, size: 0.28, grow: 0.3 });
      if (u.dmgT > 0 && Math.random() < dt * 20) add.emit(u.x + rnd(-0.7, 0.7), rnd(0.6, 1.8), u.z + rnd(-0.7, 0.7), FIRE, { v: [0, 2, 0], life: 0.45, size: 0.26, grow: 0.3 });
      if (u.slowT > 0 && Math.random() < dt * 14) add.emit(u.x + rnd(-0.8, 0.8), 0.3, u.z + rnd(-0.8, 0.8), VIOLET, { v: [0, 0.5, 0], life: 0.5, size: 0.3, grow: 0.3 });
      if (u.stunT > 0 && Math.random() < dt * 30) { const a = time * 9 + Math.random(); add.emit(u.x + Math.cos(a) * 0.9, 2.5, u.z + Math.sin(a) * 0.9, C(2.2, 1.9, 0.4), { v: [0, 0.2, 0], life: 0.3, size: 0.28, grow: 0.3 }); }
      if (u.healT > 0 && Math.random() < dt * 16) add.emit(u.x + rnd(-0.7, 0.7), 0.5, u.z + rnd(-0.7, 0.7), HEAL, { v: [0, 2.6, 0], life: 0.7, size: 0.28, grow: 0.3 });
    }
  }

  function update(m, alpha, dt, t) {
    time = t;
    if (m) {
      syncShots(m, alpha); syncZones(m, dt); syncCrates(m, dt); syncCasts(m); unitTrails(m, dt); syncPoints(m);
      for (const h of m.map.hazards) if (h.kind === 'lava' && Math.random() < dt * 3) { const a = Math.random() * 6.283, d = Math.random() * h.r; add.emit(h.x + Math.cos(a) * d, 0.2, h.z + Math.sin(a) * d, EMBER, { v: [rnd(-0.3, 0.3), rnd(1, 3), rnd(-0.3, 0.3)], life: 1.2, size: 0.2, grow: 0.3 }); }
    } else shotMesh.count = 0;
    for (let i = groundLive.length - 1; i >= 0; i--) {
      const g = groundLive[i];
      g.u.uTime.value = t;
      if (!g.life) continue;
      g.age += dt;
      if (g.sweep) g.u.uT.value = 1 - Math.pow(1 - Math.min(1, g.age / g.life), 2.2);
      if (g.fade) g.u.uA.value = g.alpha * Math.min(1, (g.life - g.age) / g.fade);
      if (g.age >= g.life) release(g);
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i]; b.age += dt;
      b.mesh.material.uniforms.uTime.value = t;
      if (b.power) { const k = 1 - b.age / b.life; b.mesh.material.uniforms.uA.value = k * 1.6; b.mesh.scale.z = b.width * (0.4 + 0.6 * k); }
      if (b.age >= b.life) { group.remove(b.mesh); b.mesh.material.dispose(); beams.splice(i, 1); }
    }
    for (const l of lights) { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = l.userData.p * Math.max(0, l.userData.t / l.userData.life); } else l.intensity = 0; }
    add.update(dt); alp.update(dt);
    shake = Math.max(0, shake - dt * 2.6);
  }

  function clear() {
    for (const [, v] of zoneViews) { if (v.g) release(v.g); if (v.dome) group.remove(v.dome); if (v.obj) group.remove(v.obj); }
    zoneViews.clear();
    for (const [, v] of crateViews) { group.remove(v.root); release(v.mark); }
    crateViews.clear();
    for (const [, v] of casts) { if (v.g) release(v.g); if (v.b) v.b.life = 0; }
    casts.clear();
    clearPoints();
    while (groundLive.length) release(groundLive[0]);
    shotMesh.count = 0;
  }

  const setPointScale = (h, fovDeg) => { const s = h / (2 * Math.tan(fovDeg * Math.PI / 360)); add.mat.uniforms.uScale.value = s; alp.mat.uniforms.uScale.value = s; };

  return { group, event, update, clear, setPointScale, get shake() { return shake; }, ring, explosion };
}
