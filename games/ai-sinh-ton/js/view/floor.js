// The arena floor, built the way Blockade Z builds its ground (games/blockade-z/js/world.js, "ground"): flat boxes merged
// by BZ.Builder, one mesh per texture, each wearing one of art.js's 16 px pixel textures at one tile per metre (asphalt,
// concrete, tile, stone, cobble, dirt, burnt, metal, road_line, hazard, scorch), lit by Lambert with the builder's vertex
// shade. Blockade Z has no wet ground and no arena paint: this file adds, in the same material, grime and chapter cover
// (frost, sand, soot), the worn arena ring painted into the surface, and rain wetness with small puddles and ripples.
import { ARENA } from '../sim/battle.js?v=20261120b';
const THREE = window.THREE;
const BZ = window.BZ;

const E = 24;                 // half size of the built square; past the fog rim nothing is seen
const AX = ARENA.x / ARENA.z; // the arena is an ellipse: random placements are squeezed across the screen by this
const TOP = ['ny', 'px', 'nx', 'pz', 'nz'];

// One recipe per chapter (stageDef.chapter). cover: what settles on the floor (colour, amount); wet: how much rain shows.
const RECIPES = [
  { name: 'street', cover: [0x2a2a2e, 0.25], grime: 0.32, wet: 1, paint: 0xf2c43a, build: street },
  { name: 'parking', cover: [0x2c2620, 0.3], grime: 0.3, wet: 0.9, paint: 0xf2c43a, build: parking },
  { name: 'factory', cover: [0xdcecf6, 0.55], grime: 0.26, wet: 0.7, paint: 0xf2c43a, build: factory },
  { name: 'crypt', cover: [0xd8bf8a, 1.05], grime: 0.22, wet: 0.35, paint: 0xe8a23a, build: crypt },
  { name: 'landing', cover: [0x1c1a18, 0.5], grime: 0.3, wet: 0.8, paint: 0xf0b83a, build: landing },
  { name: 'void', cover: [0x2a1e3a, 0.45], grime: 0.34, wet: 0.85, paint: 0xc89aff, build: rim },
];

// ---- the builders: world.js style boxes (top faces only), y steps of 0.004 keep the layers apart ----
function kit(B, rng) {
  let y = 0;
  const lift = () => (y += 0.004);
  const rect = (x0, z0, x1, z1, key, o = {}) => B.box([x0, -0.05, z0], [x1, o.y || lift(), z1], key, { vary: o.vary == null ? 0.05 : o.vary, skip: TOP, uvScale: o.s || 1, tint: o.tint, uv: o.uv });
  const fill = (key, o) => rect(-E, -E, E, E, key, o);
  // a strip of given width from (x0,z0) to (x1,z1), turned with the builder's matrix stack
  const strip = (x0, z0, x1, z1, w, key, o = {}) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const a = Math.atan2(z1 - z0, x1 - x0);
    B.push(new THREE.Matrix4().makeTranslation((x0 + x1) / 2, 0, (z0 + z1) / 2).multiply(new THREE.Matrix4().makeRotationY(-a)));
    rect(-len / 2, -w / 2, len / 2, w / 2, key, o); B.pop();
  };
  // worn lane dashes as world.js paints its roads: 1.5 m dashes every 3 m, a quarter of them gone
  const dashes = (x0, z0, x1, z1, key, w = 0.18, dash = 1.5, gap = 1.5) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const dx = (x1 - x0) / len; const dz = (z1 - z0) / len; const yy = lift();
    for (let t = 0.75; t < len - dash; t += dash + gap) { if (rng.chance(0.25)) continue; strip(x0 + dx * t, z0 + dz * t, x0 + dx * (t + dash), z0 + dz * (t + dash), w, key, { y: yy, vary: 0.15 }); }
  };
  const blob = (cx, cz, r, key, o = {}) => { // an irregular patch from a few overlapping boxes
    const yy = lift();
    for (let i = 0; i < 6; i++) { const a = rng.range(0, 6.283); const d = rng.range(0, r * 0.55); const w = rng.range(r * 0.45, r * 0.9); const h = rng.range(r * 0.35, r * 0.8); rect(cx + Math.cos(a) * d - w, cz + Math.sin(a) * d - h, cx + Math.cos(a) * d + w, cz + Math.sin(a) * d + h, key, { ...o, y: yy }); }
  };
  const decals = (n, key, s0, s1, rmax, o = {}) => {
    const yy = lift();
    for (let i = 0; i < n; i++) { const a = rng.range(0, 6.283); const d = Math.sqrt(rng.next()) * rmax; const s = rng.range(s0, s1); const x = Math.cos(a) * d * AX; const z = Math.sin(a) * d; rect(x - s, z - s * rng.range(0.6, 1), x + s, z + s * rng.range(0.6, 1), key, { ...o, y: yy, uv: 'fit', vary: 0.1 }); }
  };
  return { rect, fill, strip, dashes, blob, decals, lift };
}

// the old Blockade Z plaza (world.js: concrete to the walls, a 24 m tiled square, 6 m asphalt roads with dashed centre
// lines), with the road run past the side of the fight and a zebra crossing over it
function street(K, rng) {
  K.fill('concrete');
  K.rect(-12, -12, 12, 12, 'tile', { y: 0.006, tint: [0.78, 0.78, 0.8] }); // a touch darker than the town's: additive casts need headroom
  const x0 = 1.2; const x1 = 7.2;
  K.rect(x0, -E, x1, E, 'asphalt', { y: 0.01 });
  K.rect(x0 - 0.3, -E, x0, E, 'concrete_dark', { y: 0.011 }); K.rect(x1, -E, x1 + 0.3, E, 'concrete_dark', { y: 0.011 });
  K.dashes((x0 + x1) / 2, -E, (x0 + x1) / 2, -2, 'road_line'); K.dashes((x0 + x1) / 2, 4, (x0 + x1) / 2, E, 'road_line');
  for (let k = 0; k < 5; k++) { if (rng.chance(0.25)) continue; K.rect(x0 + 0.4 + k * 1.1, -1.2, x0 + 0.9 + k * 1.1, 2.6, 'road_line', { y: 0.03, vary: 0.2 }); }
  K.decals(8, 'scorch', 0.5, 1.3, 11);
}
function parking(K, rng) {
  K.fill('concrete');
  K.rect(-E, -3.2, E, 3.2, 'asphalt', { y: 0.006 });
  for (let x = -E; x < E; x += 6) K.rect(x, -E, x + 0.08, E, 'concrete_dark', { y: 0.007, vary: 0 });
  const yy = K.lift();
  for (const z0 of [3.6, -8.6, 13, -18]) for (let x = -E; x <= E; x += 2.7) { // bay lines, some faded out
    if (rng.chance(0.15)) continue; K.rect(x - 0.06, z0, x + 0.06, z0 + 5, 'road_line', { y: yy, vary: 0.25 });
  }
  K.dashes(-E, 0, E, 0, 'road_line', 0.15, 2, 2);
  K.decals(10, 'scorch', 0.25, 0.6, 11); // oil stains
  K.blob(3.5, -5, 1.2, 'concrete_dark'); K.blob(-3.5, 6, 1, 'asphalt');
}
function factory(K, rng) {
  K.fill('tile', { tint: [0.78, 0.86, 0.95] });
  K.rect(-2, -E, 2, E, 'metal', { y: 0.006, s: 0.5, tint: [0.82, 0.88, 0.95] }); K.rect(-E, -2, E, 2, 'metal', { y: 0.007, s: 0.5, tint: [0.82, 0.88, 0.95] });
  for (const s of [-1, 1]) { K.rect(s * 2 - 0.15, -E, s * 2 + 0.15, E, 'hazard', { y: 0.009, s: 2, vary: 0.1 }); K.rect(-E, s * 2 - 0.15, E, s * 2 + 0.15, 'hazard', { y: 0.0095, s: 2, vary: 0.1 }); }
  for (let i = 0; i < 6; i++) K.blob(rng.range(-6, 6), rng.range(-11, 11), rng.range(0.7, 1.3), 'concrete_dark', { tint: [0.85, 0.9, 1] });
  K.decals(6, 'scorch', 0.4, 0.9, 10);
}
function crypt(K, rng) {
  K.fill('stone', { tint: [1.12, 1.0, 0.82] });
  K.rect(-1.6, -E, 1.6, E, 'cobble', { y: 0.006, tint: [1.05, 0.95, 0.78] });
  for (let i = 0; i < 4; i++) K.blob(rng.range(-7, 7), rng.range(-12, 12), rng.range(0.7, 1.3), 'dirt', { tint: [1.55, 1.32, 0.98] }); // sand heaps; the drifts are the cover noise
  K.decals(5, 'scorch', 0.4, 0.9, 10);
}
function landing(K, rng) {
  K.fill('dirt');
  for (let i = 0; i < 10; i++) K.blob(rng.range(-8, 8), rng.range(-13, 13), rng.range(1, 2), 'dirt', { tint: [0.7, 1.12, 0.5] }); // grass
  for (let i = 0; i < 4; i++) K.blob(rng.range(-6, 6), rng.range(-11, 11), rng.range(0.6, 1.2), 'burnt');
  K.decals(8, 'scorch', 0.5, 1.2, 11);
}
function rim(K, rng) {
  K.fill('stone', { tint: [0.6, 0.56, 0.72] });
  for (let i = 0; i < 7; i++) K.blob(rng.range(-7, 7), rng.range(-12, 12), rng.range(0.9, 2), 'cobble', { tint: [0.5, 0.46, 0.62] });
  for (let i = 0; i < 14; i++) { // cracks: jagged chains of burnt strips
    let x = rng.range(-7, 7); let z = rng.range(-12, 12); let a = rng.range(0, 6.283);
    for (let k = 0; k < 4; k++) { const l = rng.range(0.8, 2); const x2 = x + Math.cos(a) * l; const z2 = z + Math.sin(a) * l; K.strip(x, z, x2, z2, rng.range(0.07, 0.16), 'burnt', { vary: 0.2 }); x = x2; z = z2; a += rng.range(-0.8, 0.8); }
  }
  K.decals(8, 'scorch', 0.5, 1.3, 11);
}

// ---- the surface shader, patched into each Lambert material ----
const GLSL_COMMON = `
varying vec3 vWP; uniform vec3 uFogC; uniform float uR0; uniform float uR1; uniform vec2 uArena; uniform float uWet; uniform float uTime;
uniform vec3 uCover; uniform float uCoverK; uniform float uGrime; uniform vec3 uPaint; uniform vec3 uSky; uniform float uPud;
float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < FLOOR_OCT; i++) { s += vn(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s / (1.0 - 2.0 * a); }
float fPud = 0.0; float fRip = 0.0; vec2 fRipN = vec2(0.0);
`;
const GLSL_SURFACE = `
{
  vec2 p = vWP.xz;   float n1 = fbm(p * 0.16); float n2 = vn(p * 1.3 + 5.0);
  // grime: broad blotches, streaks along the old traffic direction, and fine mottling
  float streak = vn(vec2(p.x * 0.3, p.y * 2.4) + 9.0);
  float g = smoothstep(0.5, 0.85, n1) * 0.55 + smoothstep(0.7, 0.95, streak) * 0.3;
  diffuseColor.rgb *= 1.0 - uGrime * g + 0.05 * (n2 - 0.5);
  float cover = smoothstep(0.5, 0.78, fbm(p * 0.22 + 3.7)) * uCoverK;
  diffuseColor.rgb = mix(diffuseColor.rgb, uCover * (0.9 + 0.2 * n2), cover * 0.6);
  // the arena ring, painted into the surface and worn through where feet and wheels went
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
  float wear = smoothstep(0.3, 0.62, fbm(p * 1.6 + 21.0)) * (0.7 + 0.3 * n2);
  // ellipse norm (1 at the rim) and the distance to the rim in metres (negative inside)
  vec2 q = p / uArena; float an = length(q);
  float sd = (an - 1.0) / max(length(vec2(p.x / (uArena.x * uArena.x), p.y / (uArena.y * uArena.y))) / max(an, 0.001), 0.001);
  float th = atan(q.y, q.x); float arc = (uArena.x + uArena.y) * 0.5 * th + (uArena.y - uArena.x) * 0.25 * sin(2.0 * th);
  float s = arc + sd;
  float band = step(-0.75, sd) * step(sd, -0.2);
  vec3 stripe = mod(floor(s / 0.55), 2.0) < 0.5 ? uPaint : vec3(0.07, 0.07, 0.08);
  float line = step(-0.07, sd) * step(sd, 0.07) + step(-0.88, sd) * step(sd, -0.8);
  vec3 tex = vec3(0.55 + 0.9 * lum);
  diffuseColor.rgb = mix(diffuseColor.rgb, stripe * tex, band * wear * 0.92);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.9, 0.84) * tex, line * wear * 0.85);
  // rain: darker wet ground, and small puddles where the surface dips
  fPud = smoothstep(0.7, 0.75, fbm(p * 0.95 + 11.0)) * uWet * uPud;
  diffuseColor.rgb *= 1.0 - uWet * 0.12 - fPud * 0.5;
#ifdef FLOOR_RIPPLES
  vec2 cell = floor(p / 0.7); vec2 o = p - (cell + 0.5) * 0.7 - (vec2(fh(cell), fh(cell + 3.1)) - 0.5) * 0.35;
  float ph = fract(uTime * 0.8 + fh(cell + 7.7)); float d = length(o);
  fRip = (1.0 - smoothstep(0.0, 0.018, abs(d - ph * 0.16))) * (1.0 - ph) * uWet * (0.25 + 0.75 * step(0.05, fPud));
  fRipN = o / max(d, 0.001) * fRip;
#endif
}
`;
const GLSL_LIGHT = `
{
  vec3 V = normalize(cameraPosition - vWP);
  vec3 N = normalize(vec3(fRipN.x * 0.5, 1.0, fRipN.y * 0.5));
  float fres = 0.12 + 0.88 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
  // a puddle mirrors the overcast sky, darker than the sky itself
  float gloss = uWet * 0.06 + fPud * 0.6;
  outgoingLight = mix(outgoingLight, uSky * 0.62, fres * gloss) + uSky * fRip * 0.08;
  outgoingLight = mix(outgoingLight, uFogC, smoothstep(uR0, uR1, length(vWP.xz / uArena)));
}
`;

export function createFloor(H) {
  const { scene, quality } = H; const low = quality.name === 'low';
  const U = {
    uFogC: { value: new THREE.Color(0xa9b6c4) }, uR0: { value: 1.0 }, uR1: { value: 1.15 }, uArena: { value: new THREE.Vector2(ARENA.x, ARENA.z) }, uWet: { value: 1 }, uTime: { value: 0 },
    uCover: { value: new THREE.Color() }, uCoverK: { value: 0 }, uGrime: { value: 0.3 }, uPaint: { value: new THREE.Color(0xf2c43a) },
    uSky: { value: new THREE.Color(0xb8c6d6) }, uPud: { value: 1 },
  };
  const mats = new Map();
  function matOf(key) {
    if (mats.has(key)) return mats.get(key);
    const m = new THREE.MeshLambertMaterial({ map: BZ.tex(key), vertexColors: true, dithering: true });
    if (key === 'scorch') { m.transparent = true; m.alphaTest = 0.5; m.depthWrite = false; }
    m.defines = { FLOOR_OCT: low ? 2 : 3 }; if (!low) m.defines.FLOOR_RIPPLES = '';
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_SURFACE)
        .replace('#include <opaque_fragment>', GLSL_LIGHT + '\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => 'aisfloor' + (low ? 'L' : 'H');
    mats.set(key, m); return m;
  }

  const group = new THREE.Group(); group.name = 'floor'; scene.add(group);
  let built = -1;
  function build(ch) {
    for (const o of [...group.children]) { group.remove(o); o.geometry.dispose(); }
    const R = RECIPES[ch] || RECIPES[0]; const rng = BZ.rng('floor' + ch);
    const B = new BZ.Builder('floor' + ch); R.build(kit(B, rng), rng);
    const g = B.build({ recv: true });
    for (const m of [...g.children]) { m.material = matOf(m.name); m.receiveShadow = true; m.matrixAutoUpdate = false; m.renderOrder = m.name === 'scorch' ? 1 : 0; group.add(m); }
    U.uCover.value.setHex(R.cover[0]); U.uCoverK.value = R.cover[1]; U.uGrime.value = R.grime; U.uPaint.value.setHex(R.paint); U.uPud.value = R.wet;
    built = ch;
  }

  return {
    group, uniforms: U,
    get meshes() { return group.children.length; },
    setStage(def) {
      const ch = Math.max(0, Math.min(RECIPES.length - 1, def.chapter | 0));
      if (ch !== built) build(ch);
      U.uFogC.value.set(def.fog);
      U.uSky.value.set(def.fog).lerp(new THREE.Color(0xe8f0fa), 0.35);
    },
    setWet(k) { U.uWet.value = k; },
    update(dt) { U.uTime.value = (U.uTime.value + dt) % 1000; },
  };
}
