// Shared pieces for per-skill looks (looks*.js), render only: shaped meshes and shaders that a look composes with its own
// colours and timing. Every piece adds itself to kit.group, runs as a kit anim and disposes what it made when it ends.
//   crescent  a moon-shaped band revealed along its arc (a blade sweep)
//   sigil     a ground magic circle: rings, an {n/m} star polygon, rune ticks, turning and revealed by a sweep
//   shell     a fresnel bubble or sphere of light, optionally riding a unit
//   pillar    a column of light with rings climbing it
//   trail     a flat ribbon drawn behind a moving point (dash streaks, tails, tentacles)
//   weapon    glowing silhouettes: halberd, scythe, round shield, skeletal hand, straight sword
//   spikes    a ring of cones bursting up out of the ground and sinking back
import * as THREE from '../../vendor/three.module.min.js';

export const C = (r, g, b) => new THREE.Color(r, g, b);
const norm = (c) => c.clone().multiplyScalar(1 / Math.max(c.r, c.g, c.b, 1e-3));
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
// Pieces draw "over" the scene by default (premultiplied alpha): their colour survives on light stone and sand, where adding
// light would wash every hue to white. opts.add switches a piece to additive light (sparks, cores, dark maps).
const OVER = { transparent: true, depthWrite: false, blending: THREE.NormalBlending, premultipliedAlpha: true, toneMapped: false };
const blend = (opts) => (opts.add ? ADD : OVER);
const col = (c, opts) => (opts.add || Math.max(c.r, c.g, c.b) <= 1 ? c.clone() : norm(c));   // a dark colour stays dark

// one anim that owns meshes: step(t, dt) returns false to end early; everything in `own` is removed and disposed at the end
export function own(kit, objs, life, step) {
  for (const o of objs) { o.frustumCulled = false; kit.group.add(o); }
  kit.anims.push({ t: 0, step(dt) { this.t += dt; if (objs[0].userData.end) return false; const r = step ? step(this.t, dt) : true; return r !== false && this.t < life; },
    drop() { for (const o of objs) { kit.group.remove(o); o.traverse((m) => { if (m.geometry && !m.geometry.userData.keep) m.geometry.dispose(); if (m.material) [].concat(m.material).forEach((x) => x.dispose()); }); } } });
}
const keep = (g) => { g.userData.keep = true; return g; };
// ends a piece made with life 1e9 (a shot's or a zone's lifetime is the sim's): it is removed on the next frame
export const stop = (m) => { if (m) m.userData.end = true; };

// ---- crescent --------------------------------------------------------------------------------------------------
const CRES_VERT = 'attribute vec2 aFE; varying vec2 vFE; void main() { vFE = aFE; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const CRES_FRAG = `uniform vec3 uColor, uEdge; uniform float uHead, uFade; varying vec2 vFE;
  void main() {
    float f = vFE.x, e = vFE.y;
    float th = 0.08 + 0.92 * pow(sin(3.14159 * f), 0.8);
    float inner = 1.0 - th;
    float body = smoothstep(inner, inner + 0.05, e) * (1.0 - smoothstep(0.97, 1.0, e));
    float core = smoothstep(0.78, 0.9, e) * (1.0 - smoothstep(0.95, 1.0, e)) * smoothstep(0.0, 0.25, th);
    float shown = 1.0 - smoothstep(uHead - 0.02, uHead + 0.02, f);
    float lead = smoothstep(uHead - 0.25, uHead, f) * shown;
    float a = body * shown * uFade;
    vec3 c = mix(uColor * (0.75 + 0.35 * e), uEdge, clamp(core * 0.9 + lead * 0.35 * body, 0.0, 1.0));
    gl_FragColor = vec4(c, a * 0.92);
  }`;
// x, z centre; a aim; r outer radius; y height; dir +1/-1 sweep sense; band thickest width; span half-angle; travel m/s along a;
// SW sweep time. opts.edge the colour of the outer edge (white by default), opts.tilt rolls the band about the aim (a vertical slash)
export function crescent(kit, x, z, a, r, y, dir, color, life, band = r * 0.42, span = 1.25, travel = 0, SW = 0.22, opts = {}) {
  const n = 40, r0 = r - band, pos = [], fe = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, la = span - 2 * span * f;
    for (const [rr, e] of [[r0, 0], [r, 1]]) { pos.push(Math.cos(la) * rr, 0, -Math.sin(la) * rr); fe.push(f, e); }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFE', new THREE.Float32BufferAttribute(fe, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ vertexShader: CRES_VERT, fragmentShader: CRES_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uColor: { value: norm(color) }, uEdge: { value: opts.edge ? norm(opts.edge) : new THREE.Color(1, 0.96, 1) }, uHead: { value: 0 }, uFade: { value: 1 } } });
  const mesh = new THREE.Mesh(g, mat), pivot = new THREE.Group();
  pivot.position.set(x, y, z); pivot.rotation.y = -a; mesh.rotation.x = opts.tilt || 0; mesh.scale.z = dir; mesh.renderOrder = 6; pivot.add(mesh);
  own(kit, [pivot], life, (t, dt) => {
    if (travel) { x += Math.cos(a) * travel * dt; z += Math.sin(a) * travel * dt; pivot.position.set(x, y, z); }
    const u = mat.uniforms, sw = Math.min(1, t / SW);
    u.uHead.value = 1.02 * (1 - (1 - sw) ** 2);
    u.uFade.value = t < SW + 0.08 ? 1 : Math.max(0, 1 - (t - SW - 0.08) / (life - SW - 0.08));
    if (sw < 1 && opts.sparks !== false) { const la = span - 2 * span * u.uHead.value, wa = a - dir * la; kit.sparks(x + Math.cos(wa) * r, y, z + Math.sin(wa) * r, 2, opts.spark || color, 9, 0.25, 0.05, 0.3, 6, -Math.sin(wa) * dir, Math.cos(wa) * dir, 0.4); }
  });
  return pivot;
}

// ---- sigil -----------------------------------------------------------------------------------------------------
const FLAT_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SIGIL_FRAG = `uniform vec3 uC, uC2; uniform float uA, uRot, uRev, uN, uM, uTicks, uInner, uFill, uW;
  varying vec2 vUv;
  float ln(float d, float w) { return 1.0 - smoothstep(0.0, w, abs(d)); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float rev = step(fract((a + 3.14159) / 6.28318 - 0.25), uRev);
    float w = uW;
    float rings = ln(r - 0.97, w * 1.6) + ln(r - 0.88, w) * 0.8 + ln(r - uInner, w) * step(0.01, uInner);
    float ra = a + uRot, tick = step(0.5, fract(ra * uTicks / 6.28318)) * step(0.885, r) * step(r, 0.965) * step(0.5, uTicks) * 0.55;
    float star = 0.0;
    if (uN > 2.5) { float D = 0.86 * cos(3.14159 * uM / uN);
      for (int i = 0; i < 12; i++) { if (float(i) >= uN) break; float th = float(i) * 6.28318 / uN - uRot; star = max(star, ln(p.x * cos(th) + p.y * sin(th) - D, w)); }
      star *= step(r, 0.87); }
    float fill = uFill * (0.25 + 0.75 * r * r) * step(r, 0.97);
    vec3 c = uC * (rings + tick + fill) + uC2 * star;
    float al = clamp(rings + tick + star + fill, 0.0, 1.0) * uA * rev;
    gl_FragColor = vec4(c * al, al);
  }`;
const flatGeo = keep(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
// opts: c2 (star colour), n, m (star {n/m}; n < 3 none), ticks, inner (radius of an inner ring, 0 none), fill, spin (rad/s),
// life, rev (reveal time), y, follow (unit), w (line width), alpha, fade (fade-out time)
export function sigil(kit, x, z, R, c, opts = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: FLAT_VERT, fragmentShader: SIGIL_FRAG, ...blend(opts), side: THREE.DoubleSide,
    uniforms: { uC: { value: col(c, opts) }, uC2: { value: col(opts.c2 || c, opts) }, uA: { value: 0 }, uRot: { value: opts.rot || 0 }, uRev: { value: 0 }, uN: { value: opts.n ?? 6 }, uM: { value: opts.m ?? 2 },
      uTicks: { value: opts.ticks ?? 24 }, uInner: { value: opts.inner ?? 0.45 }, uFill: { value: opts.fill ?? 0.06 }, uW: { value: opts.w ?? 0.06 } } });
  const mesh = new THREE.Mesh(flatGeo, mat), life = opts.life ?? 1, rev = opts.rev ?? 0.25, fade = opts.fade ?? Math.min(0.4, life * 0.4), al = opts.alpha ?? 1;
  mesh.position.set(x, opts.y ?? 0.15, z); mesh.scale.setScalar(R); mesh.renderOrder = 4;
  own(kit, [mesh], life, (t) => {
    if (opts.follow) { if (!opts.follow.alive) return false; mesh.position.x = opts.follow.x; mesh.position.z = opts.follow.z; }
    const u = mat.uniforms; u.uRev.value = Math.min(1, t / rev); u.uRot.value += (opts.spin ?? 0.6) / 60;
    u.uA.value = al * Math.min(1, (life - t) / fade) * (opts.pulse ? 0.75 + 0.25 * Math.sin(t * opts.pulse) : 1);
    if (opts.grow) mesh.scale.setScalar(R * (1 - Math.exp(-t * opts.grow)));
  });
  return mesh;
}

// ---- shell -----------------------------------------------------------------------------------------------------
const FRES_VERT = 'varying vec3 vN, vV; varying float vY; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }';
const FRES_FRAG = `uniform vec3 uC, uC2; uniform float uA, uP, uCore, uBands, uT, uInv; varying vec3 vN, vV; varying float vY;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float b = uBands > 0.0 ? 0.6 + 0.4 * sin(vY * uBands * 6.28 - uT * 4.0) : 1.0;
    if (uInv > 0.0) { float d = pow(1.0 - f, uInv); float a2 = clamp(d * uCore * 1.6, 0.0, 1.0) * uA; vec3 cc = mix(uC * 0.72, mix(uC2, vec3(1.0), 0.12), smoothstep(0.45, 0.95, d)); gl_FragColor = vec4(cc * a2, a2); return; }
    float a = (pow(f, uP) + uCore) * uA * b;
    gl_FragColor = vec4(mix(uC2, uC, pow(f, 1.5)) * a, a);
  }`;
const sphGeo = keep(new THREE.SphereGeometry(1, 28, 18)), domeGeo = keep(new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2));
// opts: c2 (core colour), p (fresnel power), core (flat glow added), bands (stripes per metre), r, y, follow, life, grow (s to
// reach full size), dome (a half sphere sitting on the ground), squash (y scale), pulse (Hz), alpha, fade
export function shell(kit, x, y, z, r, c, opts = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: FRES_VERT, fragmentShader: FRES_FRAG, ...blend(opts), side: THREE.FrontSide,
    uniforms: { uC: { value: col(c, opts) }, uC2: { value: col(opts.c2 || c, opts) }, uA: { value: 1 }, uP: { value: opts.p ?? 2.2 }, uCore: { value: opts.core ?? 0.05 }, uBands: { value: opts.bands ?? 0 }, uT: { value: 0 }, uInv: { value: opts.inv ?? 0 } } });
  const mesh = new THREE.Mesh(opts.dome ? domeGeo : sphGeo, mat), life = opts.life ?? 1, fade = opts.fade ?? Math.min(0.35, life * 0.4), al = opts.alpha ?? 1;
  mesh.position.set(x, y, z); mesh.renderOrder = 7;
  const sq = opts.squash ?? 1;
  own(kit, [mesh], life, (t) => {
    if (opts.follow) { if (!opts.follow.alive) return false; mesh.position.x = opts.follow.x; mesh.position.z = opts.follow.z; }
    const k = opts.grow ? 1 - Math.exp(-t / opts.grow * 3) : 1, s = r * k * (opts.pulse ? 1 + 0.05 * Math.sin(t * opts.pulse * 6.28) : 1);
    mesh.scale.set(s, s * sq, s);
    mat.uniforms.uT.value = t; mat.uniforms.uA.value = al * Math.min(1, (life - t) / fade);
    if (opts.step && opts.step(t, mesh, mat) === false) return false;
  });
  return mesh;
}

// ---- pillar ----------------------------------------------------------------------------------------------------
const PIL_VERT = 'varying vec2 vUv; varying vec3 vN, vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const PIL_FRAG = `uniform vec3 uC, uC2; uniform float uA, uT, uRings; varying vec2 vUv; varying vec3 vN, vV;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float h = vUv.y, fall = pow(1.0 - h, 1.4);
    float rings = uRings > 0.0 ? pow(0.5 + 0.5 * sin((h * uRings - uT * 2.0) * 6.28), 8.0) : 0.0;
    float a = (0.35 + 0.65 * f) * fall * uA + rings * uA * 0.6 * (1.0 - h);
    gl_FragColor = vec4(mix(uC2, uC, f) * a, a);
  }`;
const cylGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0));
// opts: c2, h, rings (bands climbing per unit height), life, grow (s to drop in from above), follow, alpha, fade
export function pillar(kit, x, z, r, c, opts = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: PIL_VERT, fragmentShader: PIL_FRAG, ...blend(opts), side: THREE.DoubleSide,
    uniforms: { uC: { value: col(c, opts) }, uC2: { value: col(opts.c2 || c, opts) }, uA: { value: 1 }, uT: { value: 0 }, uRings: { value: opts.rings ?? 0 } } });
  const mesh = new THREE.Mesh(cylGeo, mat), life = opts.life ?? 0.8, h = opts.h ?? 10, fade = opts.fade ?? Math.min(0.4, life * 0.5), al = opts.alpha ?? 1;
  mesh.position.set(x, 0, z); mesh.renderOrder = 7;
  own(kit, [mesh], life, (t) => {
    if (opts.follow) { if (!opts.follow.alive) return false; mesh.position.x = opts.follow.x; mesh.position.z = opts.follow.z; }
    const k = opts.grow ? Math.min(1, t / opts.grow) : 1, w = r * (opts.narrow ? 1 - 0.7 * Math.min(1, t / life) : 1);
    mesh.scale.set(w, h * k, w); mesh.position.y = h * (1 - k) * (opts.drop ? 1 : 0);
    mat.uniforms.uT.value = t; mat.uniforms.uA.value = al * Math.min(1, (life - t) / fade);
  });
  return mesh;
}

// ---- trail -----------------------------------------------------------------------------------------------------
const TRAIL_VERT = 'attribute float aK; attribute float aS; varying float vK, vS; void main() { vK = aK; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const TRAIL_FRAG = `uniform vec3 uC, uC2; uniform float uA; varying float vK, vS;
  void main() { float edge = 1.0 - abs(vS); float a = pow(vK, 0.8) * smoothstep(0.0, 0.3, edge) * uA; vec3 c = mix(uC2, uC, smoothstep(0.1, 0.7, edge)); c = mix(c, vec3(1.0), smoothstep(0.75, 1.0, edge) * 0.35 * vK); gl_FragColor = vec4(c * a, a); }`;
// A ribbon behind pos(t) -> [x, y, z] (or null when the point is gone): the last `len` samples, width w (tapering to the tail),
// lying flat (the ribbon spans across the motion in the ground plane) or standing (opts.up). Lives `life` s, fading at the end.
export function trail(kit, pos, w, c, life, opts = {}) {
  const n = opts.len ?? 16, P = new Float32Array((n + 1) * 2 * 3), K = new Float32Array((n + 1) * 2), S = new Float32Array((n + 1) * 2), idx = [];
  for (let i = 0; i <= n; i++) { K[i * 2] = K[i * 2 + 1] = 1 - i / n; S[i * 2] = -1; S[i * 2 + 1] = 1; if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aK', new THREE.BufferAttribute(K, 1)); g.setAttribute('aS', new THREE.BufferAttribute(S, 1)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, ...blend(opts), side: THREE.DoubleSide,
    uniforms: { uC: { value: col(c, opts) }, uC2: { value: col(opts.c2 || c, opts) }, uA: { value: 1 } } });
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 6;
  const hist = [], fade = opts.fade ?? 0.25, every = opts.every ?? 0;
  let acc = 0, dead = false;
  own(kit, [mesh], life, (t, dt) => {
    const p = dead ? null : pos(t);
    acc += dt;
    if (p && acc >= every) { acc = 0; hist.unshift(p); if (hist.length > n + 1) hist.pop(); }
    else if (!p) { dead = true; if (hist.length > 1) hist.pop(); }
    for (let i = 0; i <= n; i++) {
      const h = hist[Math.min(i, hist.length - 1)] || [0, -50, 0], q = hist[Math.min(i + 1, hist.length - 1)] || h, o = i ? hist[i - 1] || h : h;
      let dx = (i ? o[0] - h[0] : h[0] - q[0]), dz = (i ? o[2] - h[2] : h[2] - q[2]); const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const ww = w * 1.6 * (opts.taper === false ? 1 : 0.35 + 0.65 * (1 - i / n));
      if (opts.up) { P.set([h[0], h[1] - ww, h[2], h[0], h[1] + ww, h[2]], i * 6); }
      else P.set([h[0] - dz * ww, h[1], h[2] + dx * ww, h[0] + dz * ww, h[1], h[2] - dx * ww], i * 6);
    }
    g.attributes.position.needsUpdate = true;
    mat.uniforms.uA.value = (opts.alpha ?? 1) * Math.min(1, (life - t) / fade);
    if (dead && hist.length <= 1) return false;
  });
  return mesh;
}

// ---- weapons ---------------------------------------------------------------------------------------------------
// Built once (geometry kept), coloured per use. Each lies along +x (the point at +x), centred on the grip unless noted.
let W = null;
function parts() {
  if (W) return W;
  W = {};
  // Phương Thiên Kích (方天画戟): shaft, spear point, a crescent blade on each side of the head, a tassel ring
  const shaft = new THREE.CylinderGeometry(0.06, 0.07, 4.2, 6).rotateZ(Math.PI / 2);
  const point = new THREE.ConeGeometry(0.16, 1.0, 4).rotateZ(-Math.PI / 2).translate(2.6, 0, 0);
  const moon = (s) => { const sh = new THREE.Shape(); sh.absarc(0, 0, 0.62, -Math.PI / 2, Math.PI / 2, false); sh.absarc(-0.18, 0, 0.42, Math.PI / 2, -Math.PI / 2, true);
    return new THREE.ShapeGeometry(sh, 12).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).scale(1, 1, s).translate(1.75, 0, 0.12 * s); };
  W.halberd = { core: [shaft, point], blade: [moon(1), moon(-1)] };
  // scythe: long shaft, a curved blade at the head sweeping back
  const sb = new THREE.Shape(); sb.moveTo(0, 0); sb.quadraticCurveTo(-0.6, 1.4, -2.2, 1.5); sb.quadraticCurveTo(-0.9, 1.0, -0.15, 0.0); sb.lineTo(0, 0);
  W.scythe = { core: [new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6).rotateZ(Math.PI / 2)], blade: [new THREE.ShapeGeometry(sb, 16).rotateX(-Math.PI / 2).translate(1.8, 0, 0)] };
  // round shield (aegis): a flat disc with a raised rim and a boss
  W.shield = { core: [new THREE.CylinderGeometry(0.9, 0.9, 0.12, 28), new THREE.SphereGeometry(0.28, 12, 8).scale(1, 0.5, 1).translate(0, 0.08, 0)], blade: [new THREE.TorusGeometry(0.88, 0.09, 6, 32).rotateX(Math.PI / 2)] };
  // skeletal hand, palm up, fingers along +y
  const bones = [new THREE.BoxGeometry(0.9, 0.7, 0.25).translate(0, 0.35, 0)];
  for (let i = 0; i < 4; i++) { const x = -0.33 + i * 0.22; bones.push(new THREE.CylinderGeometry(0.07, 0.05, 0.55, 5).translate(x, 0.95, 0), new THREE.CylinderGeometry(0.05, 0.02, 0.45, 5).rotateX(0.5).translate(x, 1.38, 0.1)); }
  bones.push(new THREE.CylinderGeometry(0.08, 0.05, 0.5, 5).rotateZ(0.7).translate(-0.62, 0.55, 0));
  W.hand = { core: bones, blade: [new THREE.CylinderGeometry(0.22, 0.3, 0.9, 6).translate(0, -0.4, 0)] };
  // straight sword: blade, guard, grip
  W.sword = { core: [new THREE.BoxGeometry(0.5, 0.06, 0.12).translate(-0.25, 0, 0), new THREE.BoxGeometry(0.08, 0.1, 0.7)], blade: [new THREE.CylinderGeometry(0.16, 0.01, 2.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.3).rotateZ(-Math.PI / 2).translate(1.35, 0, 0)] };
  for (const k in W) for (const g of [...W[k].core, ...W[k].blade]) keep(g);
  return W;
}
// A weapon group: `core` parts drawn solid in `metal` colour, `blade` parts glowing in `glow`. Caller places it; own() it.
export function weapon(kind, metal, glow, opts = {}) {
  const P = parts()[kind], g = new THREE.Group();
  const m1 = new THREE.MeshBasicMaterial({ color: metal, toneMapped: false, transparent: true, opacity: opts.opacity ?? 1, side: THREE.DoubleSide });
  const m2 = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: opts.glowOpacity ?? 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  for (const p of P.core) g.add(new THREE.Mesh(p, m1));
  for (const p of P.blade) g.add(new THREE.Mesh(p, m2));
  g.userData.mats = [m1, m2];
  g.traverse((m) => { m.frustumCulled = false; m.renderOrder = 7; });
  return g;
}
export function fadeWeapon(g, k) { g.userData.mats[0].opacity = k; g.userData.mats[1].opacity = 0.9 * k; }

// ---- spikes ----------------------------------------------------------------------------------------------------
const coneGeo = keep(new THREE.ConeGeometry(0.22, 1, 5).translate(0, 0.5, 0));
// n cones in a ring of radius r around (x, z), height h, rising in `up` s, standing, then sinking by `life`. Glow colour c.
export function spikes(kit, x, z, n, r, h, c, life, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const core = new THREE.MeshBasicMaterial({ color: opts.core || 0x2a0806, toneMapped: false });
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + (opts.twist || 0), rr = r * (0.8 + 0.4 * ((i * 7) % 5) / 4), hh = h * (0.6 + 0.5 * ((i * 3) % 4) / 3);
    const s = new THREE.Mesh(coneGeo, mat), k = new THREE.Mesh(coneGeo, core);
    s.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); s.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    k.position.copy(s.position); k.rotation.copy(s.rotation);
    g.add(s, k); list.push([s, k, hh]);
  }
  const up = opts.up ?? 0.15;
  own(kit, [g], life, (t) => {
    if (opts.follow) { if (!opts.follow.alive) return false; g.position.set(opts.follow.x, 0, opts.follow.z); }
    const k = t < up ? t / up : t > life - 0.3 ? Math.max(0, (life - t) / 0.3) : 1;
    for (const [s, kk, hh] of list) { s.scale.set(1.3, hh * k, 1.3); kk.scale.set(0.7, hh * k * 0.8, 0.7); }
    mat.opacity = 0.9 * Math.min(1, (life - t) / 0.3);
  });
  return g;
}

// ---- strands ---------------------------------------------------------------------------------------------------
// n hanging ribbons (tentacles, chains, light threads) from a ring of radius r round at(t) -> [x, y, z] (null ends them), each
// `len` long, swaying; c at the top fading to c2 at the tip.
export function strands(kit, at, r, n, len, c, life, opts = {}) {
  const seg = 8, P = new Float32Array(n * (seg + 1) * 2 * 3), K = new Float32Array(n * (seg + 1) * 2), S = new Float32Array(n * (seg + 1) * 2), idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i <= seg; i++) { const b = (j * (seg + 1) + i) * 2; K[b] = K[b + 1] = 1 - i / seg * 0.85; S[b] = -1; S[b + 1] = 1; if (i < seg) idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aK', new THREE.BufferAttribute(K, 1)); g.setAttribute('aS', new THREE.BufferAttribute(S, 1)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, ...blend(opts), side: THREE.DoubleSide,
    uniforms: { uC: { value: col(c, opts) }, uC2: { value: col(opts.c2 || c, opts) }, uA: { value: 1 } } });
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 6;
  const w = (opts.w ?? 0.08) * 2, sway = opts.sway ?? 0.35;
  own(kit, [mesh], life, (t) => {
    const p = at(t); if (!p) return false;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * 6.283, x0 = p[0] + Math.cos(a) * r, z0 = p[2] + Math.sin(a) * r;
      for (let i = 0; i <= seg; i++) {
        const f = i / seg, sw = Math.sin(t * 3 + j * 1.7 + f * 3) * sway * f, y = p[1] - len * f;
        const x = x0 + Math.cos(a) * sw + Math.cos(a + 1.57) * sw * 0.5, z = z0 + Math.sin(a) * sw + Math.sin(a + 1.57) * sw * 0.5, ww = w * (1 - 0.7 * f);
        const b = (j * (seg + 1) + i) * 6;
        P[b] = x - Math.sin(a) * ww; P[b + 1] = y; P[b + 2] = z + Math.cos(a) * ww; P[b + 3] = x + Math.sin(a) * ww; P[b + 4] = y; P[b + 5] = z - Math.cos(a) * ww;
      }
    }
    g.attributes.position.needsUpdate = true;
    mat.uniforms.uA.value = (opts.alpha ?? 1) * Math.min(1, (life - t) / 0.3);
  });
  return mesh;
}

// ---- burst --------------------------------------------------------------------------------------------------------
// A filled hit: a near-opaque core (c2 in the middle, c at the rim) swelling for the first 0.12 s, a soft halo twice as wide,
// a filled ground disc, sparks and a light. r is the halo radius: 2-3 tank widths for a real blow.
export function burst(kit, x, z, r, c, c2 = c, opts = {}) {
  // r is about the width across of the blow (2-3 tank widths for a real one): a white-hot centre fading out through c2 to a
  // soft c edge, near-opaque for the first 0.12 s, a wider soft halo, a dark soft rim on the floor for contrast on light stone
  // secondary to a look's own shape: a brief flash where a blow lands, not the look itself
  const life = Math.min(opts.life ?? 0.3, 0.35), y = opts.y ?? 1.1, rc = r * 0.32, rh = r * 0.5;
  shell(kit, x, y, z, rc, c, { c2, inv: 1.2, core: 1, life, fade: life - 0.12, step: (t, m) => { m.scale.setScalar(rc * (0.55 + 0.6 * Math.min(1, t / 0.12))); } });
  shell(kit, x, y, z, rh, c, { c2: c, inv: 2.2, core: 0.55, life: life * 1.2, alpha: 0.8, step: (t, m) => { m.scale.setScalar(rc + (rh - rc) * Math.min(1, t / 0.2)); } });
  sigil(kit, x, z, rh * 1.15, c.clone().multiplyScalar(0.18 / Math.max(c.r, c.g, c.b)), { n: 0, ticks: 0, inner: 0, fill: 0.7, life: life * 1.3, rev: 0.04, alpha: 0.35, fade: life, y: 0.12, w: 0.0 });
  kit.sparks(x, y, z, kit.N(14), c2, 6 + r * 2.5, 0.4, 0.07, 0.7, 8);
  kit.flash(x, y + 0.6, z, c, 30 + r * 12, 0.25);
}

// ---- standing ring -------------------------------------------------------------------------------------------
// A ring standing upright (a gate, a portal) facing the camera, its lower edge on the floor: glowing rim, dark or tinted pane.
const torGeo = keep(new THREE.TorusGeometry(1, 0.14, 8, 48)), paneGeo = keep(new THREE.CircleGeometry(0.95, 40));
export function gate(kit, x, z, r, c, opts = {}) {
  const g = new THREE.Group(); g.position.set(x, r, z);
  const rim = new THREE.Mesh(torGeo, new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1 / Math.max(c.r, c.g, c.b, 1)), toneMapped: false, transparent: true, opacity: 0.95 }));
  const pane = new THREE.Mesh(paneGeo, new THREE.MeshBasicMaterial({ color: opts.pane ?? 0x02060f, toneMapped: false, transparent: true, opacity: opts.paneA ?? 0.75, depthWrite: false, side: THREE.DoubleSide }));
  g.add(pane, rim); g.scale.setScalar(0.01); g.rotation.x = -0.35;
  const life = opts.life ?? 1;
  own(kit, [g], life, (t) => { const k = Math.min(1, t / (opts.grow ?? 0.2), (life - t) / 0.25); g.scale.setScalar(r * Math.max(0.01, k)); g.rotation.z += opts.spin ?? 0; if (opts.step) opts.step(t, g); });
  return g;
}

// A unit's skill press was seen by this client: run fn per frame for dur seconds while it is alive (render-only aura).
export const aura = (kit, u, dur, fn, drop) => kit.follow(u, dur, fn, drop);
