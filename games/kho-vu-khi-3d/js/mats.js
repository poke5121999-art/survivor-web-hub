// Material access for the kit. Every surface is a Saltline material (js/sl/mats-sl.js, generated from the
// [mats] module): GPU-baked albedo/ORM/height sets, triplanar in object space (mats.md §3.2), macro variation,
// wetness model. Guns' anodised/phosphate/polymer parts use the PAC-9 materials with the Bf micro-detail patch.
// On top of both sits one small overlay of ours: blood (fresh and dried) painted per vertex through uv.x,
// extra grime through uv.y. Weight 0 compiles to the same look as Saltline's own material.
import * as THREE from '../vendor/three.module.min.js';
import { createMats, MATERIALS, TEXTURE_SETS } from './sl/mats-sl.js';
import { microDetail, GUN_WET } from './sl/gun-sl.js';

// Higher-resolution weapon variants of Saltline's sets: same generator, size 1 (= quality.tex px), own wear seed.
// uP.x of 'metal' is the rust amount, of 'paint' the damage amount (mats.md §2.4).
const SETS = {
  wpn_wood: { fn: 'wood', size: 1, tile: 1.2, bump: 2.6 },
  wpn_brushed: { fn: 'brushed', size: 1, tile: 0.5, bump: 0.4 },
  wpn_metal: { fn: 'metal', size: 1, tile: 1, bump: 0.5, p: [0.25] },
  wpn_blade: { fn: 'metal', size: 1, tile: 1, bump: 0.35, p: [0.04], seed: 17 },
  wpn_metal_rust: { fn: 'metal', size: 1, tile: 1, bump: 0.7, p: [1], seed: 5 },
  wpn_rust: { fn: 'rust', size: 1, tile: 1.2, bump: 3 },
  wpn_paint: { fn: 'paint', size: 1, tile: 2.5, bump: 2.5, p: [0.5] },
  wpn_paint_worn: { fn: 'paint', size: 1, tile: 2.5, bump: 2.5, p: [1.3], seed: 3 },
  wpn_hazard: { fn: 'hazard', size: 1, tile: 1, bump: 2.5 },
  wpn_plastic: { fn: 'plastic', size: 0.5, tile: 1, bump: 1 },
  wpn_polymer: { fn: 'polymer', size: 0.5, tile: 0.1, bump: 0.4 },
  wpn_fabric: { fn: 'fabric', size: 0.5, tile: 0.05, bump: 0.4 },
  wpn_tarp: { fn: 'tarp', size: 0.5, tile: 1.5, bump: 20 },
  wpn_galv: { fn: 'galv', size: 1, tile: 1, bump: 0.8 },
  wpn_gunmetal: { fn: 'gunmetal', size: 0.5, tile: 0.25, bump: 0.3, p: [0.6] },
  wpn_rope: { fn: 'rope', size: 0.25, tile: 0.1, bump: 4 },
  wpn_armor: { fn: 'armor', size: 1, tile: 0.5, bump: 0.8 },
  wpn_wallpaint: { fn: 'paint', size: 1, tile: 2.5, bump: 2.5, p: [0.12], seed: 9 },
};
const kc = [0.05, 0.62, 0.65, 0.7], aa = [0, 0.7, 0.55, 0.5], uA = [0.3, 0.6, 0.55, 0], i1 = [0.08, 0.62, 0.6, 0.5], u3 = [0.4, 0.5, 0.6, 0];
const Nt = (set, e = {}) => Object.assign({ set, tint: 0, color: 0xffffff, rough: 1, metal: 1, wet: [0.42, 0.38, 0.5, 0], macro: [0.14, 0.1, 0.8, 0.2], nrm: 1 }, e);
// kit material kinds -> Saltline material rows (same field meaning as mats.md §4); `scale` = triplanar scale
export const KINDS = {
  steel: { row: Nt('wpn_blade', { tint: 1, color: 0x98a8b4, rough: 0.62, wet: aa, macro: [0.05, 0.08, 6, 0] }), scale: 3 },          // blade steel
  steel_brushed: { row: Nt('wpn_brushed', { tint: 1, color: 0xb4b8bb, wet: aa, macro: [0.07, 0.06, 3, 0] }), scale: 4 },
  steel_satin: { row: Nt('wpn_metal', { tint: 1, color: 0x8e9ba6, rough: 0.8, wet: aa }), scale: 3 },
  steel_worn: { row: Nt('wpn_metal', { tint: 1, color: 0x8a8e92, rough: 0.9, wet: aa }), scale: 2.5 },
  steel_dark: { row: Nt('wpn_metal', { tint: 1, color: 0x3d4146, rough: 1.15, wet: aa }), scale: 2.5 },
  steel_rusty: { row: Nt('wpn_metal_rust', { tint: 1, color: 0x7a7e82, wet: uA }), scale: 2.5 },
  rust: { row: Nt('wpn_rust', { wet: uA }), scale: 2 },
  galv: { row: Nt('wpn_galv', { color: 0x8a96a0, wet: aa }), scale: 2 },
  alu: { row: Nt('wpn_brushed', { tint: 1, color: 0xc4c8cb, rough: 1.15, wet: aa, macro: [0.07, 0.06, 3, 0] }), scale: 1 },
  brass: { row: Nt('wpn_brushed', { tint: 1, color: 0xc29a45, rough: 0.9, wet: aa }), scale: 4 },
  wood: { row: Nt('wpn_wood', { wet: u3, macro: [0.2, 0.1, 0.9, 0.4] }), scale: 1 },
  paint: { row: Nt('wpn_paint', { tint: 1, wet: kc, macro: [0.2, 0.16, 0.4, 0.45] }), scale: 4 },
  paint_worn: { row: Nt('wpn_paint_worn', { tint: 1, wet: kc, macro: [0.2, 0.16, 0.4, 0.45] }), scale: 4 },
  armor: { row: Nt('wpn_armor', { tint: 1, wet: kc, macro: [0.08, 0.08, 2.5, 0.15] }), scale: 2 },
  hazard: { row: Nt('wpn_hazard', { wet: kc }), scale: 6 },
  plastic: { row: Nt('wpn_plastic', { tint: 1, wet: i1 }), scale: 2 },
  polymer: { row: Nt('wpn_polymer', { tint: 1, wet: [0, 0.7, 0.6, 0.5], macro: [0.06, 0.06, 6, 0] }), scale: 1 },
  rubber: { row: Nt('wpn_polymer', { tint: 1, color: 0x101010, rough: 1.4, wet: [0.05, 0.6, 0.6, 0.4], macro: [0.06, 0.06, 6, 0] }), scale: 1 },
  fabric: { row: Nt('wpn_fabric', { tint: 1, wet: [0.3, 0.7, 0.6, 0], macro: [0.08, 0.04, 8, 0] }), scale: 1 },
  tape: { row: Nt('wpn_plastic', { tint: 1, rough: 1.25, wet: i1, macro: [0.12, 0.1, 6, 0.3] }), scale: 3 },
  tarp: { row: Nt('wpn_tarp', { tint: 1, wet: i1, macro: [0.1, 0.1, 1.2, 0.2] }), scale: 6 },
  leather: { row: Nt('wpn_polymer', { tint: 1, rough: 1.2, wet: u3, macro: [0.18, 0.12, 9, 0.3] }), scale: 0.5 },
  rope: { row: Nt('wpn_rope', { macro: [0.07, 0.06, 3, 0] }), scale: 1 },
  gunmetal: { row: Nt('wpn_gunmetal', { tint: 1, color: 0x2a2d31, wet: [0, 0.75, 0.6, 0.5], macro: [0.08, 0.06, 6, 0] }), scale: 2 },
};
// PAC-9 viewmodel materials (Saltline 47009-47043): plain colours, vertex colours carry wear, Bf adds micro detail
export const GUNMATS = {
  ano: { color: [0.0085, 0.009, 0.0105], rough: 0.4, metal: 0.45, kind: 0 },
  gun: { color: [0.016, 0.016, 0.0165], rough: 0.5, metal: 0.7, kind: 1 },
  poly: { color: [0.0125, 0.0128, 0.0135], rough: 0.62, metal: 0, kind: 2 },
  tan: { color: [0.105, 0.08, 0.05], rough: 0.62, metal: 0, kind: 2 },
  plain: { color: [1, 1, 1], rough: 0.92, metal: 0, kind: -1 },
};

const OV_VERT_HEAD = 'varying vec2 vOvW; varying vec3 vOvP;';
const OV_FRAG_HEAD = /* glsl */`
varying vec2 vOvW; varying vec3 vOvP; uniform float uOvSeed;
float ovH(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ovN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ovH(i), ovH(i + vec3(1,0,0)), f.x), mix(ovH(i + vec3(0,1,0)), ovH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ovH(i + vec3(0,0,1)), ovH(i + vec3(1,0,1)), f.x), mix(ovH(i + vec3(0,1,1)), ovH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float ovF(vec3 p){ return ovN(p) * 0.5 + ovN(p * 2.07 + 3.1) * 0.27 + ovN(p * 4.3 + 7.7) * 0.15 + ovN(p * 9.1 + 1.3) * 0.08; }
// spatter: sparse round drops on a 3D cell grid (6 mm and 2.5 mm cells)
float ovDrops(vec3 p, float cell, float keep){ vec3 g = p / cell, i = floor(g), f = fract(g); float best = 0.0;
  for (int a = 0; a <= 1; a++) for (int b = 0; b <= 1; b++) for (int c = 0; c <= 1; c++) {
    vec3 o = vec3(float(a), float(b), float(c)) - step(0.5, f) + 0.0; vec3 id = i + o;
    float h = ovH(id * 1.37 + uOvSeed); if (h > keep) continue;
    vec3 ctr = o + 0.25 + 0.5 * vec3(ovH(id + 3.1), ovH(id + 7.3), ovH(id + 1.9));
    float rad = 0.12 + 0.3 * ovH(id + 5.5); best = max(best, smoothstep(rad, rad * 0.6, length(f - ctr))); }
  return best; }
`;
const OV_FRAG = /* glsl */`
{
  float bw = clamp((fract(vOvW.x) - 0.25) * 2.0, 0.0, 1.0), gw = vOvW.y;   // uv.x = seed + 0.25 + blood * 0.5
  vec3 P = vOvP + (floor(vOvW.x) + uOvSeed) * 0.731;
  if (gw > 0.001) {      // grime: dark film in crevices and patches
    float gm = smoothstep(0.45, 0.75, ovF(P * 38.0)) * gw;
    diffuseColor.rgb *= 1.0 - 0.45 * gm; roughnessFactor = mix(roughnessFactor, 0.95, gm * 0.6);
  }
  if (bw > 0.001) {
    float body = ovF(P * vec3(22.0, 9.0, 22.0)) + (ovF(P * 90.0) - 0.5) * 0.35;      // smears stretched along the length
    float th = mix(0.82, 0.36, sqrt(clamp(bw, 0.0, 1.0)));
    float smear = smoothstep(th, th + 0.05, body);
    float drops = max(ovDrops(P, 0.006, 0.18 * bw + 0.02), ovDrops(P + 1.7, 0.0025, 0.22 * bw)) * step(0.05, bw);
    float b = clamp(max(smear, drops), 0.0, 1.0);
    float dried = smoothstep(0.35, 0.8, ovN(P * 55.0 + 4.0));
    float edge = smear * (1.0 - smoothstep(th + 0.05, th + 0.16, body));                // darker rim where it dried first
    vec3 fresh = vec3(0.16, 0.006, 0.004), old = vec3(0.045, 0.008, 0.005);
    vec3 bc = mix(fresh, old, clamp(dried * 0.7 + edge * 0.8, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, bc, b * 0.96);
    roughnessFactor = mix(roughnessFactor, mix(0.16, 0.55, dried), b);
    metalnessFactor = mix(metalnessFactor, 0.0, b);
    #ifdef OV_BUMP
    normal = dBumpOv(normal, b * 0.00012);
    #endif
  }
}
`;
const OV_BUMP_FN = /* glsl */`
vec3 dBumpOv(vec3 N, float h){ vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition); float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx); float det = dot(dpdx, r1); vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - g); }
#define OV_BUMP 1
`;

function addOverlay(mat, seedU) {
  if (mat.userData.ov) return mat;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev.call(mat, s, r);
    s.uniforms.uOvSeed = seedU;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + OV_VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOvW = uv; vOvP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + OV_FRAG_HEAD + OV_BUMP_FN)
      .replace('#include <emissivemap_fragment>', OV_FRAG + '\n#include <emissivemap_fragment>');
  };
  const base = prevKey ? prevKey.call(mat) : '';
  mat.customProgramCacheKey = () => base + '|wov1';
  mat.userData.ov = true;
  return mat;
}

export class Mats {
  constructor(renderer, tex = 1024) {
    for (const k in SETS) TEXTURE_SETS[k] = SETS[k];
    for (const k in KINDS) MATERIALS['wpn_' + k] = KINDS[k].row;
    MATERIALS.wpn_wall = Nt('wpn_wallpaint', { tint: 1, wet: kc, macro: [0.2, 0.16, 0.4, 0.45] });
    this.ready = createMats({ renderer, params: { tex }, quality: { tex } }).then((m) => { this.sl = m; m.uniforms.wet.value = 0; return this; });
    this.cache = new Map();
    this.seedU = { value: 0 };
    GUN_WET.value = 0;
  }
  /** Saltline material of `kind`, tinted `color` (tint-1 kinds), triplanar `scale` override. */
  get(kind, color, scale) {
    const K = KINDS[kind]; if (!K) throw new Error('material kind not found: ' + kind);
    const sc = scale || K.scale;
    const key = kind + '|' + (color ?? '') + '|' + sc;
    let m = this.cache.get(key);
    if (m) return m;
    const o = { triplanar: true, vertexColors: true, scale: sc };
    if (color !== undefined && color !== null) o.color = color;
    m = addOverlay(this.sl.get('wpn_' + kind, o), this.seedU);
    this.cache.set(key, m);
    return m;
  }
  gun(name) {
    const key = 'gun|' + name; let m = this.cache.get(key); if (m) return m;
    const g = GUNMATS[name];
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...g.color), roughness: g.rough, metalness: g.metal, vertexColors: true });
    m.name = 'pac9_' + name;
    if (g.kind >= 0) microDetail(m, g.kind);
    addOverlay(m, this.seedU);
    this.cache.set(key, m);
    return m;
  }
  setWet(v) { if (this.sl) this.sl.uniforms.wet.value = v; GUN_WET.value = v; }
  stats() { return this.sl ? this.sl.stats() : null; }
}
