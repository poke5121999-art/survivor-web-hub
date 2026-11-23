// Marks left on the floor by a skill, one instanced mesh (one draw call) in premultiplied alpha, so a mark can darken the
// floor and glow at the same time: a scorch with embers cooling in it, a crack with light running along it. No mark is a
// ruled circle: every outline is torn by noise, cracks branch, frost grows in spikes. A mark fades over its life (the
// after-image of a skill), and the pool is fixed: the oldest mark gives its slot to a new one.
//   kind 0 scorch  dark torn blot, embers that cool          kind 3 ink    glossy blot with splatter drops
//   kind 1 crack   branching fissures glowing then dark       kind 4 scar   a long torn streak (line skills, dashes)
//   kind 2 frost   pale spikes growing out, sparkle            kind 5 light  a short glow on the floor (a dynamic light)
const THREE = window.THREE;
export const DECAL = { scorch: 0, crack: 1, frost: 2, ink: 3, scar: 4, light: 5 };

const VS = `
attribute vec4 aP; attribute vec4 aK; attribute vec3 aC; attribute vec3 aG;
varying vec2 vUv; varying vec4 vK; varying vec3 vC; varying vec3 vG; varying vec2 vS;
void main() {
  vUv = uv; vK = aK; vC = aC; vG = aG; vS = aP.zw;
  float c = cos(aK.w); float s = sin(aK.w);
  vec2 l = vec2(position.x * aP.z, position.y * aP.w);
  vec3 w = vec3(aP.x + l.x * c - l.y * s, 0.0, aP.y + l.x * s + l.y * c);
  w.y = 0.045 + fract(aK.y * 9.7) * 0.012;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FS = `
varying vec2 vUv; varying vec4 vK; varying vec3 vC; varying vec3 vG; varying vec2 vS;
uniform float uFlash;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.0) * 0.3 + vnoise(p * 4.3 + 3.0) * 0.15; }
void main() {
  float kind = vK.x; float seed = vK.y * 31.0; float age = vK.z;
  vec2 m = (vUv - 0.5) * 2.0; float d = length(m); float an = atan(m.y, m.x);
  float edgeN = fbm(vec2(an * 2.2 + seed, seed)) * 0.45 + fbm(m * 3.0 + seed) * 0.25;
  float dark = 0.0; vec3 glow = vec3(0.0);
  float hot = 1.0 - smoothstep(0.0, 0.45, age);          // the light in a mark dies in the first half of its life
  float gone = smoothstep(0.55, 1.0, age);                // the mark itself fades over the second half
  if (kind < 0.5) {            // scorch
    float r = 0.62 + edgeN * 0.5; float body = 1.0 - smoothstep(r - 0.25, r, d);
    float streaks = smoothstep(0.55, 0.9, vnoise(vec2(an * 9.0 + seed, d * 1.5))) * (1.0 - smoothstep(0.4, 1.0, d));
    dark = max(body * (0.55 + 0.25 * fbm(m * 5.0 + seed)), streaks * 0.5);
    float embers = smoothstep(0.72, 0.9, fbm(m * 6.0 + seed * 1.7)) * body;
    glow = vG * embers * hot * 1.4;
  } else if (kind < 1.5) {     // crack
    float n = 7.0; float wob = (fbm(vec2(d * 3.0, seed)) - 0.5) * 0.9;
    float s = fract((an / 6.2832) * n + wob + seed * 0.13);
    float w = 0.06 * (1.0 - d * 0.7) + 0.012;
    float line = 1.0 - smoothstep(w * 0.4, w, abs(s - 0.5) / n * 6.2832 * max(d, 0.05));
    float twig = 1.0 - smoothstep(0.01, 0.03, abs(fract((an / 6.2832) * n * 2.0 + wob * 2.0 + 0.25 + seed) - 0.5) / n * 6.2832 * d);
    float reach = 1.0 - smoothstep(0.55 + edgeN * 0.45, 0.95 + edgeN * 0.3, d);
    float twigReach = step(0.35, d) * (1.0 - smoothstep(0.55, 0.85, d + edgeN * 0.3));
    float c = max(line * reach, twig * twigReach * 0.7);
    float pit = 1.0 - smoothstep(0.1, 0.3 + edgeN * 0.2, d);
    dark = max(c * 0.85, pit * 0.6);
    glow = vG * (c * (1.0 - d * 0.6) + pit * 0.6) * hot * 1.6;
  } else if (kind < 2.5) {     // frost
    float sp = pow(abs(sin(an * 6.0 + fbm(vec2(an * 3.0, seed)) * 3.0)), 6.0);
    float r = 0.35 + sp * 0.6 + edgeN * 0.25; float body = 1.0 - smoothstep(r - 0.12, r, d);
    float spark = step(0.985, hash(floor(vUv * vS * 6.0) + seed)) * body;
    dark = body * (0.35 + 0.25 * fbm(m * 7.0 + seed));
    glow = (vC * body * 0.35 + vec3(spark)) * (0.5 + hot * 0.5);
  } else if (kind < 3.5) {     // ink
    float r = 0.55 + edgeN * 0.45; float body = 1.0 - smoothstep(r - 0.06, r, d);
    float drops = step(0.8, vnoise(m * 7.0 + seed)) * step(r, d) * (1.0 - smoothstep(0.8, 1.0, d));
    float gloss = smoothstep(0.65, 0.95, fbm(m * 4.0 + vec2(seed, 0.0))) * body;
    dark = max(body * 0.85, drops * 0.8);
    glow = vG * gloss * 0.5 + vG * body * hot * 0.25;
  } else if (kind < 4.5) {     // scar: a torn streak along x
    float across = abs(m.y) + (fbm(vec2(m.x * 4.0 + seed, seed)) - 0.5) * 0.5;
    float ends = 1.0 - smoothstep(0.7, 1.0, abs(m.x) + fbm(vec2(seed, m.y * 3.0)) * 0.3);
    float body = (1.0 - smoothstep(0.25, 0.55, across)) * ends;
    float core = (1.0 - smoothstep(0.0, 0.12, abs(m.y) + (vnoise(vec2(m.x * 9.0, seed)) - 0.5) * 0.08)) * ends;
    dark = body * 0.6;
    glow = vG * core * hot * 1.5;
  } else {                     // light: a soft pool with a noisy edge and rays
    float rays = 0.75 + 0.25 * vnoise(vec2(an * 7.0 + seed, 0.0));
    float pool = pow(max(0.0, 1.0 - d / (0.75 + edgeN * 0.35)), 2.0) * rays;
    glow = vG * pool * (1.0 - age) * 0.9;
  }
  float fade = 1.0 - gone;
  dark *= fade; glow *= fade * uFlash;
  float a = clamp(dark, 0.0, 0.92);
  if (a < 0.004 && max(glow.r, max(glow.g, glow.b)) < 0.004) discard;
  gl_FragColor = vec4(vC * a * 0.35 + glow, a);
}`;

export function createDecals(H) {
  const { scene } = H;
  const N = 40;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage);
  const aP = mk(4); const aK = mk(4); const aC = mk(3); const aG = mk(3);
  geo.setAttribute('aP', aP); geo.setAttribute('aK', aK); geo.setAttribute('aC', aC); geo.setAttribute('aG', aG); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, uniforms: { uFlash: { value: 1 } }, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.name = 'fx-decals'; scene.add(mesh);
  const recs = []; let next = 0; const col = new THREE.Color();
  const reduce = () => !!(window.__G && window.__G.settings && window.__G.settings.reduceFlash);

  // o: { x z r (half size) | sx sz, rot, kind, color (mark tint), glow (light colour), life, real }
  function add(o) {
    const r = recs.length < N ? (recs.push({}), recs[recs.length - 1]) : recs[next++ % N];
    r.x = o.x; r.z = o.z; r.sx = (o.sx ?? o.r ?? 1) * 2; r.sz = (o.sz ?? o.r ?? 1) * 2; r.rot = o.rot ?? Math.random() * 6.2832;
    r.kind = o.kind || 0; r.seed = Math.random(); r.t = 0; r.life = o.life || 3; r.c = o.color ?? 0x201810; r.g = o.glow ?? 0xff8030; r.real = !!o.real; r.on = true;
    return r;
  }
  function update(dt, real) {
    mat.uniforms.uFlash.value = reduce() ? 0.55 : 1;
    let n = 0;
    for (const r of recs) {
      if (!r.on) continue; r.t += r.real ? real : dt; if (r.t >= r.life) { r.on = false; continue; }
      aP.setXYZW(n, r.x, r.z, r.sx, r.sz); aK.setXYZW(n, r.kind, r.seed, r.t / r.life, r.rot);
      col.setHex(r.c); aC.setXYZ(n, col.r, col.g, col.b); col.setHex(r.g); aG.setXYZ(n, col.r, col.g, col.b); n++;
    }
    geo.instanceCount = n; mesh.visible = n > 0;
    if (n) { aP.needsUpdate = true; aK.needsUpdate = true; aC.needsUpdate = true; aG.needsUpdate = true; }
  }
  function clear() { for (const r of recs) r.on = false; geo.instanceCount = 0; mesh.visible = false; }
  return { add, update, clear, mesh, stats: () => ({ live: recs.filter((r) => r.on).length, cap: N }) };
}
