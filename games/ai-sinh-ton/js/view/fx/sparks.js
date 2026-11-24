// Particles drawn as one instanced mesh (one draw call): every particle is a quad stretched along its screen-space
// velocity, so a fast one reads as a streak of light rather than a round blob. Kinds: 0 streak (a ray with a hot head
// and a fading tail), 1 shard (an angular glint that flickers), 2 ember (a small hot point), 3 wisp (a torn ribbon of
// glow eaten by noise as it ages). A particle runs on the view clock (it freezes with a hit-stop and slows with the
// game) or on the real clock (the wind-up of an ultimate plays while the world stands still). The pool is fixed:
// nothing is allocated per effect, the oldest particle is reused when it is full.
const THREE = window.THREE;

const VS = `
attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aCol; attribute vec3 aShape;
varying vec2 vUv; varying vec4 vCol; varying vec3 vShape; varying float vNear;
void main() {
  vUv = uv; vCol = aCol; vShape = aShape;
  vec4 c = viewMatrix * vec4(aPos, 1.0);
  // a particle at arm's length from the lens (a close-up in the crowd) thins out instead of painting the frame white
  vNear = clamp((-c.z - 2.0) / 12.0, 0.2, 1.0);
  vec3 d = (viewMatrix * vec4(aVel, 0.0)).xyz; vec2 dir = d.xy; float sp = length(dir);
  vec2 ax = sp > 1e-4 ? dir / sp : vec2(0.0, 1.0); vec2 px = vec2(-ax.y, ax.x);
  float len = aShape.y + sp * aShape.z; float w = aShape.x;
  vec2 o = px * (position.x * w) + ax * ((position.y - 0.4) * len);
  c.xy += o;
  gl_Position = projectionMatrix * c;
}`;
const FRAG = `
varying vec2 vUv; varying vec4 vCol; varying vec3 vShape; varying float vNear;
uniform float uFlash;
varying float vKind;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  // every kind is drawn on a coarse grid of effect pixels: a streak 3 cells across, a shard and an ember a few cells, a
  // wisp a torn ribbon of cells; the brightness steps in quarters, so a particle reads as pixels, never a soft dot
  float kind = vKind; float A = vCol.a; float a = 0.0;
  vec2 cells = kind < 0.5 ? vec2(3.0, 8.0) : kind < 1.5 ? vec2(5.0, 5.0) : kind < 2.5 ? vec2(4.0, 4.0) : vec2(5.0, 9.0);
  vec2 q = (floor(vUv * cells) + 0.5) / cells;
  float u = abs(q.x - 0.5) * 2.0; float v = q.y;
  if (kind < 0.5) {            // streak: hot head at v ~ 0.8, tail fading to v = 0
    float head = smoothstep(0.0, 0.8, v) * (1.0 - smoothstep(0.85, 1.0, v));
    a = head * (1.0 - smoothstep(0.5, 1.0, u)) * (0.55 + 0.45 * (1.0 - u));
  } else if (kind < 1.5) {     // shard: a stepped diamond glint
    float d = u + abs(v - 0.5) * 2.0;
    a = step(d, 1.0) * (0.45 + 0.55 * (1.0 - d));
  } else if (kind < 2.5) {     // ember: a square block, a hot 2 x 2 core in a dimmer ring
    float d = max(u, abs(v - 0.5) * 2.0);
    a = d < 0.5 ? 1.0 : 0.45;
  } else {                     // wisp: a ribbon torn by noise, more of it gone as it ages
    float n = vnoise(vec2(q.x * 3.0 + vShape.y * 3.7, v * 5.0 - vShape.y * 2.3));
    float body = (1.0 - smoothstep(0.3, 1.0, u)) * smoothstep(0.0, 0.35, v) * (1.0 - smoothstep(0.7, 1.0, v));
    a = body * smoothstep(1.0 - A * 0.9, 1.0, n + 0.35);
  }
  a = floor(a * 4.0 + 0.3) / 4.0;
  a *= A * uFlash * vNear;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * a, 1.0);
}`;
const VERT = VS.replace('varying vec3 vShape;', 'varying vec3 vShape; attribute float aKind; varying float vKind;').replace('vUv = uv;', 'vUv = uv; vKind = aKind;');

export function createSparks(H) {
  const { scene, G } = H;
  const N = Math.round(700 * Math.max(0.45, H.quality.particles));
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aVel = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aShape = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aKind = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos); geo.setAttribute('aVel', aVel); geo.setAttribute('aCol', aCol); geo.setAttribute('aShape', aShape); geo.setAttribute('aKind', aKind);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uFlash: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'fx-sparks'; scene.add(mesh);

  // particle store, struct of arrays; F fields per particle
  const F = 20; const S = new Float32Array(N * F); let live = 0; let victim = 0;
  // fields
  const X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, W = 8, L0 = 9, LV = 10, R = 11, GG = 12, B = 13, A0 = 14, GRAV = 15, DRAG = 16, KIND = 17, RT = 18, SEED = 19;
  const col = new THREE.Color();

  const reduce = () => !!(window.__G && window.__G.settings && window.__G.settings.reduceFlash);
  // in the ultimate's close-up everything is several times bigger on screen and overlaps more: dimmer, so it does not clip white
  const closeK = () => { const J = window.__G && window.__G.juice; return J && J.ult && J.ult.active ? 0.35 : 1; };

  // o: { x y z vx vy vz life w len stretch color a grav drag kind real delay }
  function emit(o) {
    const i = live < N ? live++ : victim++ % N;
    const b = i * F;
    S[b + X] = o.x; S[b + Y] = o.y; S[b + Z] = o.z; S[b + VX] = o.vx || 0; S[b + VY] = o.vy || 0; S[b + VZ] = o.vz || 0;
    S[b + AGE] = -(o.delay || 0); S[b + LIFE] = o.life || 0.5; S[b + W] = o.w || 0.12; S[b + L0] = o.len ?? 0.2; S[b + LV] = o.stretch ?? 0.05;
    col.setHex(o.color ?? 0xffffff); S[b + R] = col.r; S[b + GG] = col.g; S[b + B] = col.b; S[b + A0] = o.a ?? 1;
    S[b + GRAV] = o.grav || 0; S[b + DRAG] = o.drag || 0; S[b + KIND] = o.kind || 0; S[b + RT] = o.real ? 1 : 0; S[b + SEED] = Math.random();
  }
  const rnd = (a, b) => a + (b - a) * G.rng.next();
  const pick = (c) => (Array.isArray(c) ? c[Math.floor(G.rng.next() * c.length) % c.length] : c);
  const q = () => Math.max(0.45, H.quality.particles);

  // n streaks thrown out from a point, biased up by `up` (0 flat, 1 a fountain); o: speed [lo, hi], colors, w, len, life, grav
  function burst(x, y, z, n, o = {}) {
    const m = Math.max(1, Math.round(n * q())); const [s0, s1] = o.speed || [4, 10]; const up = o.up ?? 0.4;
    for (let k = 0; k < m; k++) {
      const a = rnd(0, 6.2832); const e = Math.asin(rnd(-0.2, 1) * up + (o.flat ? 0 : 0.05)); const s = rnd(s0, s1);
      emit({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + (o.lift || 0), vz: Math.sin(a) * Math.cos(e) * s, life: rnd(0.6, 1) * (o.life || 0.5), w: (o.w || 0.1) * rnd(0.7, 1.3), len: o.len ?? 0.15, stretch: o.stretch ?? 0.06, color: pick(o.colors || 0xffffff), a: o.a ?? 1, grav: o.grav ?? 9, drag: o.drag ?? 1.2, kind: o.kind || 0, real: o.real, delay: (o.spread || 0) * G.rng.next() });
    }
  }
  // n particles from a shell of radius r falling into the point, arriving together at `life`
  function converge(x, y, z, n, r, o = {}) {
    const m = Math.max(1, Math.round(n * q())); const life = o.life || 0.4;
    for (let k = 0; k < m; k++) {
      const a = rnd(0, 6.2832); const e = rnd(-0.15, 1) * (o.up ?? 0.9); const rr = r * rnd(0.6, 1.1); const lf = life * rnd(0.7, 1);
      const dx = Math.cos(a) * Math.cos(e) * rr; const dy = Math.sin(e) * rr; const dz = Math.sin(a) * Math.cos(e) * rr;
      emit({ x: x + dx, y: y + dy, z: z + dz, vx: -dx / lf, vy: -dy / lf, vz: -dz / lf, life: lf, w: (o.w || 0.08) * rnd(0.7, 1.3), len: o.len ?? 0.1, stretch: o.stretch ?? 0.08, color: pick(o.colors || 0xffffff), a: o.a ?? 0.9, kind: o.kind || 0, real: o.real, delay: (o.spread || 0) * G.rng.next() });
    }
  }
  // a crown of rays: n long streaks sweeping out in a ring on the floor plane (a shock front made of light, not a ring mesh)
  function rays(x, y, z, n, r, o = {}) {
    const m = Math.max(3, Math.round(n * Math.min(1, q() + 0.2))); const life = o.life || 0.35;
    for (let k = 0; k < m; k++) {
      const a = (k / m) * 6.2832 + rnd(-0.25, 0.25); const s = (r / life) * rnd(0.75, 1.15);
      emit({ x, y: y + rnd(0, 0.2), z, vx: Math.cos(a) * s, vy: rnd(0, 0.6) * (o.up || 0), vz: Math.sin(a) * s, life: life * rnd(0.8, 1.1), w: (o.w || 0.18) * rnd(0.6, 1.4), len: o.len ?? 0.3, stretch: o.stretch ?? 0.09, color: pick(o.colors || 0xffffff), a: o.a ?? 0.9, drag: o.drag ?? 2.2, kind: 0, real: o.real });
    }
  }
  // a column of wisps rising (a pillar of torn light), or drifting smoke of glow
  function wisps(x, y, z, n, o = {}) {
    const m = Math.max(1, Math.round(n * q()));
    for (let k = 0; k < m; k++) {
      const a = rnd(0, 6.2832); const d = rnd(0, o.r || 0.5);
      emit({ x: x + Math.cos(a) * d, y: y + rnd(0, o.h0 || 0.3), z: z + Math.sin(a) * d, vx: Math.cos(a) * (o.out || 0.4), vy: rnd(0.7, 1.1) * (o.rise || 3), vz: Math.sin(a) * (o.out || 0.4), life: rnd(0.7, 1.1) * (o.life || 0.8), w: (o.w || 0.5) * rnd(0.7, 1.3), len: o.len ?? 0.8, stretch: o.stretch ?? 0.15, color: pick(o.colors || 0xffffff), a: o.a ?? 0.6, drag: o.drag ?? 0.8, kind: 3, real: o.real, delay: (o.spread || 0) * G.rng.next() });
    }
  }
  // the head of a beam that drops from the sky to the point: k streaks stacked along the drop
  function drop(x, z, h, o = {}) {
    for (let k = 0; k < (o.n || 3); k++) emit({ x: x + rnd(-0.15, 0.15), y: h * (0.4 + k * 0.2), z: z + rnd(-0.15, 0.15), vx: 0, vy: -h / 0.12, vz: 0, life: 0.12 + k * 0.02, w: (o.w || 0.4) * (1 - k * 0.2), len: h * 0.5, stretch: 0.01, color: pick(o.colors || 0xffffff), a: o.a ?? 1, kind: 0, real: o.real });
  }

  function kill(i) { live--; if (i !== live) S.copyWithin(i * F, live * F, live * F + F); }
  function update(dt, real) {
    mat.uniforms.uFlash.value = (reduce() ? 0.5 : 1) * closeK();
    const P = aPos.array; const Vv = aVel.array; const Cc = aCol.array; const Sh = aShape.array; const Kk = aKind.array;
    let n = 0;
    for (let i = 0; i < live; i++) {
      const b = i * F; const d = S[b + RT] ? real : dt;
      S[b + AGE] += d;
      if (S[b + AGE] >= S[b + LIFE]) { kill(i); i--; continue; }
      if (S[b + AGE] < 0) continue;
      if (S[b + DRAG]) { const f = Math.max(0, 1 - S[b + DRAG] * d); S[b + VX] *= f; S[b + VY] *= f; S[b + VZ] *= f; }
      S[b + VY] -= S[b + GRAV] * d; S[b + X] += S[b + VX] * d; S[b + Y] += S[b + VY] * d; S[b + Z] += S[b + VZ] * d;
      if (S[b + Y] < 0.02 && S[b + GRAV] > 0) { S[b + Y] = 0.02; S[b + VY] *= -0.25; S[b + VX] *= 0.6; S[b + VZ] *= 0.6; }
      const k = S[b + AGE] / S[b + LIFE]; const kind = S[b + KIND]; const wisp = kind === 3;
      const fade = wisp ? Math.sin(Math.PI * Math.min(1, k * 1.15)) : (k < 0.08 ? k / 0.08 : Math.pow(1 - (k - 0.08) / 0.92, 1.3));
      const flick = kind === 1 ? 0.55 + 0.45 * Math.abs(Math.sin(S[b + AGE] * 38 + S[b + SEED] * 20)) : 1;
      P[n * 3] = S[b + X]; P[n * 3 + 1] = S[b + Y]; P[n * 3 + 2] = S[b + Z];
      Vv[n * 3] = S[b + VX]; Vv[n * 3 + 1] = S[b + VY]; Vv[n * 3 + 2] = S[b + VZ];
      Cc[n * 4] = S[b + R]; Cc[n * 4 + 1] = S[b + GG]; Cc[n * 4 + 2] = S[b + B]; Cc[n * 4 + 3] = S[b + A0] * fade * flick;
      Sh[n * 3] = S[b + W] * (wisp ? 1 + k * 0.8 : 1); Sh[n * 3 + 1] = S[b + L0] * (wisp ? 1 + k * 0.5 : 1); Sh[n * 3 + 2] = wisp ? 0 : S[b + LV];
      Kk[n] = kind; n++;
    }
    geo.instanceCount = n;
    if (n) { aPos.needsUpdate = true; aVel.needsUpdate = true; aCol.needsUpdate = true; aShape.needsUpdate = true; aKind.needsUpdate = true; }
    mesh.visible = n > 0;
  }
  function clear() { live = 0; geo.instanceCount = 0; mesh.visible = false; }
  return { emit, burst, converge, rays, wisps, drop, update, clear, mesh, stats: () => ({ live, drawn: geo.instanceCount, cap: N }) };
}
