// The arena: splat-mapped ground, ruins, rocks, instanced foliage with wind, destructible props, sun and sky light.
// Everything is generated from the compiled map (maps.js) and a seed derived from the map key.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { plantGeos, leafMaterial, instanced } from './flora.js';
import { mulberry } from '../rng.js';
import { solidAt } from '../maps.js';
import { TEAMS, RULES } from '../data.js';

// Everything that changes with the map's theme: ground textures and tints, stone tint, how much of each plant grows, light.
const THEMES = {
  jungle: { growth: 'moss', base: 'grass', path: 'dirt', lo: [0.62, 0.8, 0.55], hi: [1.25, 1.15, 0.8], pave: [1, 1, 1], stone: 0xffffff, grass: 1, leaf: [1, 1, 1], fern: 1, broad: 1, tall: 'palm', tallRate: 0.36, bush: [1, 1, 1],
    sun: [0xfff0d2, 3.1], hemi: [0xcfe8ff, 0x4d6a2e, 0.85], clear: 0x0b1a0d, exposure: 1 },
  desert: { growth: 'sand', base: 'sand', path: 'track', lo: [0.85, 0.85, 0.85], hi: [1.12, 1.08, 1.0], pave: [1.05, 0.95, 0.8], stone: 0xf2d9ae, grass: 0.22, leaf: [1.5, 1.1, 0.5], fern: 0.3, broad: 0.25, tall: 'palm', tallRate: 0.14, bush: [1.0, 0.85, 0.5],
    sun: [0xffe6b8, 3.5], hemi: [0xd9e6ff, 0x8a6a3c, 0.9], clear: 0x2a1f12, exposure: 0.95 },
  ice: { growth: 'snow', base: 'snow', path: 'track', lo: [0.85, 0.9, 0.98], hi: [1.05, 1.05, 1.05], pave: [0.8, 0.9, 1.05], stone: 0xb9d2e8, grass: 0.12, leaf: [1.9, 1.4, 3.2], fern: 0.2, broad: 0, tall: 'pine', tallRate: 0.42, bush: [1.6, 1.25, 3.0],
    sun: [0xe8f2ff, 2.2], hemi: [0xdfeeff, 0x7d93ad, 0.8], clear: 0x0e1722, exposure: 0.85 },
  lava: { growth: 'ash', base: 'basalt', path: 'ash', lo: [0.8, 0.8, 0.8], hi: [1.25, 1.15, 1.1], pave: [0.5, 0.45, 0.45], stone: 0x6e6468, grass: 0.08, leaf: [0.9, 0.35, 0.15], fern: 0.12, broad: 0, tall: 'dead', tallRate: 0.3, bush: [1.1, 0.5, 0.3],
    sun: [0xffc9a0, 2.3], hemi: [0xffb080, 0x40201a, 0.75], clear: 0x120807, exposure: 1.05 },
  city: { growth: 'grime', base: 'asphalt', path: 'concrete', lo: [0.8, 0.8, 0.8], hi: [1.2, 1.2, 1.2], pave: [0.75, 0.75, 0.78], stone: 0xb4b2ae, grass: 0.14, leaf: [0.8, 0.9, 0.6], fern: 0.3, broad: 0, tall: 'dead', tallRate: 0.18, bush: [0.75, 0.85, 0.6],
    sun: [0xffb37a, 2.6], hemi: [0xb9a6d9, 0x3a3540, 0.8], clear: 0x14121a, exposure: 1.05 },
  swamp: { growth: 'moss', base: 'grass', path: 'mud', lo: [0.3, 0.5, 0.5], hi: [0.6, 0.85, 0.7], pave: [0.5, 0.6, 0.6], stone: 0x7e9a96, grass: 1, leaf: [0.45, 0.8, 0.8], fern: 1.2, broad: 1, tall: 'palm', tallRate: 0.3, bush: [0.5, 0.9, 0.85],
    sun: [0x9fc4ff, 1.25], hemi: [0x4a6aa8, 0x12261f, 0.6], clear: 0x050b10, exposure: 1.25, fireflies: true },
  autumn: { growth: 'dry', base: 'grass', path: 'dirt', lo: [1.5, 0.75, 0.3], hi: [2.1, 1.25, 0.45], pave: [1.05, 0.95, 0.85], stone: 0xe6d2b4, grass: 0.8, leaf: [2.6, 1.0, 0.3], fern: 0.8, broad: 0.6, tall: 'dead', tallRate: 0.22, bush: [1.5, 0.8, 0.35],
    sun: [0xffc27a, 3.2], hemi: [0xffd9b0, 0x6a4a2a, 0.8], clear: 0x1a1008, exposure: 0.98 },
  canyon: { growth: 'sand', base: 'sand', path: 'track', lo: [1.15, 0.6, 0.45], hi: [1.35, 0.78, 0.55], pave: [1.1, 0.75, 0.6], stone: 0xe08a62, grass: 0.1, leaf: [1.4, 1.0, 0.5], fern: 0.15, broad: 0.1, tall: 'dead', tallRate: 0.1, bush: [1.0, 0.8, 0.45],
    sun: [0xffd0a0, 3.4], hemi: [0xffe0c8, 0x8a4630, 0.85], clear: 0x24100a, exposure: 0.95 },
};

const MARGIN = 18;
const SPLAT_PPM = 3;
const TILE = 0.21;

function valueNoise(seed) {
  const h = (i, j) => { let n = Math.imul(i * 374761393 + j * 668265263 + seed, 1274126177); n ^= n >>> 13; return ((Math.imul(n, 1274126177) >>> 0) % 65536) / 65535; };
  return (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

// What the ground is at a point: trail, paving, macro tint and contact shade. The splat texture and the plant scatter both read this.
function groundSampler(map) {
  const noise = valueNoise(map.w * 131 + map.d);
  const segs = [];
  for (const line of map.paths) for (let i = 0; i + 1 < line.length; i++) segs.push([line[i], line[i + 1]]);
  const discs = [map.plaza, [map.bases[0][0], map.bases[0][1], RULES.baseRadius + 0.6], [map.bases[1][0], map.bases[1][1], RULES.baseRadius + 0.6]];
  return (x, z) => {
    const wob = (noise(x * 0.35, z * 0.35) - 0.5) * 1.6 + (noise(x * 1.3 + 9, z * 1.3) - 0.5) * 0.6;
    let dPath = 99;
    for (const s of segs) { const d = segDist(x, z, s[0], s[1]); if (d < dPath) dPath = d; }
    const path = 1 - smooth(1.3, 2.9, dPath + wob);
    let pave = 0;
    for (const c of discs) pave = Math.max(pave, 1 - smooth(c[2] - 0.7, c[2] + 0.5, Math.hypot(x - c[0], z - c[1]) + wob * 0.5));
    for (const y of map.yards) pave = Math.max(pave, (1 - smooth(-0.6, 1.0, Math.max(y[0] - x, x - y[1], y[2] - z, z - y[3]) + wob * 0.6)) * 0.92);
    let dark = 0;
    for (const w of map.walls) {
      const d = Math.hypot(Math.max(w.x0 - x, 0, x - w.x1), Math.max(w.z0 - z, 0, z - w.z1));
      dark = Math.max(dark, (1 - smooth(0, 1.5, d)) * 0.5);
      if (w.kind !== 'fence') pave = Math.max(pave, (1 - smooth(0.3, 1.3, d + wob * 0.4)) * 0.8);
    }
    for (const c of map.rounds) dark = Math.max(dark, (1 - smooth(0, 1.2, Math.hypot(x - c.x, z - c.z) - c.r)) * 0.45);
    let scorched = path;
    for (const h of map.hazards) if (h.kind === 'lava' || h.kind === 'vent') { const d = Math.hypot(x - h.x, z - h.z) - h.r; scorched = Math.max(scorched, 1 - smooth(0, 1.8, d + wob * 0.5)); dark = Math.max(dark, (1 - smooth(0, 1.2, d)) * 0.4); }
    const outside = Math.max(Math.abs(x) - map.hw, Math.abs(z) - map.hd);
    dark = Math.max(dark, smooth(-1.5, 7, outside + wob) * 0.62);
    const macro = noise(x * 0.07, z * 0.07) * 0.6 + noise(x * 0.19 + 5, z * 0.19 + 3) * 0.4;
    return { path: scorched, pave, macro, shade: 1 - dark, outside };
  };
}

function splatTexture(map, sample) {
  const W = Math.ceil((map.w + MARGIN * 2) * SPLAT_PPM), H = Math.ceil((map.d + MARGIN * 2) * SPLAT_PPM);
  const data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const s = sample(-map.hw - MARGIN + (i + 0.5) / SPLAT_PPM, -map.hd - MARGIN + (j + 0.5) / SPLAT_PPM), k = (j * W + i) * 4;
    data[k] = s.path * 255; data[k + 1] = s.pave * 255; data[k + 2] = s.macro * 255; data[k + 3] = s.shade * 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

function groundMaterial(tex, splat, map, wind, blendNormals, theme) {
  const grass = tex.bake(theme.base), dirt = tex.bake(theme.path), pave = tex.bake('pave', theme.growth);
  const m = new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normal, roughness: 0.93, metalness: 0, envMapIntensity: 0.35 });
  m.normalScale.setScalar(1.3);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tSplat: { value: splat }, tDirt: { value: dirt.map }, tPave: { value: pave.map }, tDirtO: { value: dirt.orm }, tPaveO: { value: pave.orm },
      tDirtN: { value: dirt.normal }, tPaveN: { value: pave.normal }, uTime: wind.uTime,
      uLo: { value: new THREE.Vector3(...theme.lo) }, uHi: { value: new THREE.Vector3(...theme.hi) }, uPaveTint: { value: new THREE.Vector3(...theme.pave) },
      uSplat: { value: new THREE.Vector2(1 / (TILE * (map.w + MARGIN * 2)), 1 / (TILE * (map.d + MARGIN * 2))) },
    });
    sh.vertexShader = 'uniform vec2 uSplat; varying vec2 vSplatUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vSplatUv = uv * uSplat + 0.5;');
    sh.fragmentShader = `uniform sampler2D tSplat, tDirt, tPave, tDirtO, tPaveO, tDirtN, tPaveN; uniform float uTime; uniform vec3 uLo, uHi, uPaveTint; varying vec2 vSplatUv; float gDirt, gPave;\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec4 sp = texture2D(tSplat, vSplatUv);
        vec3 grassC = mix(texture2D(map, vMapUv).rgb, texture2D(map, vMapUv * 0.31 + 0.37).rgb, 0.45);
        grassC *= mix(uLo, uHi, sp.b);
        vec4 dO = texture2D(tDirtO, vMapUv * 1.3), pO = texture2D(tPaveO, vMapUv * 0.8);
        gDirt = smoothstep(0.32, 0.62, sp.r + (dO.r - 0.5) * 0.55);
        gPave = smoothstep(0.42, 0.58, sp.g + (pO.r - 0.5) * 0.4);
        vec3 gc = mix(grassC, texture2D(tDirt, vMapUv * 1.3).rgb * mix(0.8, 1.15, sp.b), gDirt);
        gc = mix(gc, texture2D(tPave, vMapUv * 0.8).rgb * uPaveTint, gPave);
        float cloud = texture2D(tSplat, vSplatUv * 1.6 + vec2(uTime * 0.006, uTime * 0.0035)).b;
        gc *= sp.a * (0.8 + 0.3 * smoothstep(0.3, 0.7, cloud));
        diffuseColor.rgb *= gc;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(mix(0.93, texture2D(tDirtO, vMapUv * 1.3).g, gDirt), 0.8, gPave);');
    if (blendNormals) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0',
        'mix(mix(texture2D( normalMap, vNormalMapUv ).xyz, texture2D( tDirtN, vMapUv * 1.3 ).xyz, gDirt), texture2D( tPaveN, vMapUv * 0.8 ).xyz, gPave) * 2.0 - 1.0'));
  };
  return m;
}

const shadeBox = (h) => (v) => 0.6 + 0.4 * smooth(-h / 2, h / 2, v.y);

function buildStructures(map, rng) {
  const b = new Builder(0.36);
  for (const w of map.walls) {
    const long = w.w >= w.d, len = long ? w.w : w.d, thick = long ? w.d : w.w;
    b.push().move(w.x, 0, w.z); if (!long) b.rotY(Math.PI / 2);
    if (w.kind === 'ruin') {
      const n = Math.max(2, Math.round(len / 1.15)), seg = len / n;
      for (let i = 0; i < n; i++) {
        const broken = rng() < 0.22, h = w.h * (broken ? rng.range(0.45, 0.65) : rng.range(0.85, 1.08));
        const courses = Math.max(2, Math.round(h / 0.85));
        let y = 0;
        for (let c = 0; c < courses; c++) {
          const ch = h / courses, inset = c ? rng.range(0, 0.12) : -0.08;
          const g = 0.78 + rng() * 0.3;
          b.push().move(-len / 2 + seg * (i + 0.5) + rng.range(-0.03, 0.03), y + ch / 2, rng.range(-0.04, 0.04)).rotY(rng.range(-0.03, 0.03))
            .use('ruin').tint(new THREE.Color(g, g * 0.98, g * 0.92).multiplyScalar(0.62 + 0.38 * (y + ch) / w.h)).box(seg - 0.03, ch - 0.02, thick - inset * 2).pop();
          y += ch;
        }
        if (!broken && rng() < 0.6) b.push().move(-len / 2 + seg * (i + 0.5), y + 0.11, 0).use('ruin', 0xd8d2c0).box(seg + 0.08, 0.22, thick + 0.16).pop();
      }
      for (let k = 0; k < 3; k++) {
        const s = rng.range(0.3, 0.55);
        b.push().move(rng.range(-len / 2, len / 2), s * 0.35, (thick / 2 + rng.range(0.35, 0.9)) * rng.sign()).rotY(rng() * 3).rotX(rng.range(-0.3, 0.3))
          .use('ruin', 0xb8b0a0).box(s * 1.3, s * 0.8, s).pop();
      }
    } else if (w.kind === 'container') {
      const hues = [0xc9a227, 0x6b7a3a, 0xcfd4d6, 0x7a2f2f, 0x4f5f6b];
      for (let y = 0; y + 1 < w.h; y += 2.6) {
        const c = new THREE.Color(rng.pick(hues)), ox = y ? rng.range(-0.3, 0.3) : 0;
        b.use('metal').tint(c).push().move(ox, y + 1.3, 0).box(len, 2.55, thick).pop();
        b.tint(c.clone().multiplyScalar(0.72));
        for (let k = 0; k < Math.round(len / 0.5); k++) for (const sz of [-1, 1]) b.push().move(ox - len / 2 + 0.25 + k * 0.5, y + 1.3, sz * (thick / 2 + 0.03)).box(0.16, 2.3, 0.06).pop();
        for (const sx of [-1, 1]) b.push().move(ox + sx * (len / 2 + 0.03), y + 1.3, 0).box(0.06, 2.3, thick * 0.9).pop();
        b.tint(0x30353b).push().move(ox, y + 2.6, 0).box(len + 0.1, 0.1, thick + 0.1).pop();
      }
    } else if (w.kind === 'rampart') {
      const sh = shadeBox(w.h), team = map.yards.findIndex((y) => w.x > y[0] && w.x < y[1] && w.z > y[2] && w.z < y[3]), glow = team < 0 ? 'glow' : 'glow' + team;
      b.use('ruin', 0xb9b09c).push().move(0, 0.3, 0).box(len + 0.7, 0.6, thick + 0.7).pop();
      b.push().move(0, w.h * 0.5, 0).tint(0xdcd2bb).box(len, w.h, thick, sh).pop();
      b.push().move(0, w.h + 0.13, 0).tint(0xc9c0aa).box(len + 0.36, 0.26, thick + 0.36).pop();
      const nm = Math.max(2, Math.round(len / 1.15));
      for (let i = 0; i < nm; i++) for (const sz of [-1, 1]) b.push().move(-len / 2 + (i + 0.5) * (len / nm), w.h + 0.56, sz * (thick / 2 + 0.02)).tint(0xe4dac4).box(len / nm * 0.56, 0.6, 0.34).pop();
      const nb = Math.max(1, Math.round(len / 4.5));
      for (let i = 0; i < nb; i++) for (const sz of [-1, 1]) b.push().move(-len / 2 + (i + 0.5) * (len / nb), w.h * 0.36, sz * (thick / 2 + 0.16)).tint(0xbdb39e).box(0.7, w.h * 0.72, 0.36, sh).pop();
      for (const sx of [-1, 1]) {
        b.use('ruin', 0xd6ccb6).push().move(sx * len / 2, 0, 0);
        b.push().move(0, (w.h + 0.9) / 2, 0).cyl(thick * 0.72, thick * 0.86, w.h + 0.9, 8, sh).pop();
        b.push().move(0, w.h + 1.05, 0).tint(0xc2b8a2).cyl(thick * 0.9, thick * 0.74, 0.3, 8).pop();
        b.use('metal', 0x4a525c).push().move(0, w.h + 2.5, 0).cyl(0.05, 0.07, 2.7, 6).pop();
        b.use(glow).push().move(0.02, w.h + 3.25, 0.5).box(0.05, 0.95, 0.95).pop().push().move(0, w.h + 1.22, 0).geo(new THREE.RingGeometry(thick * 0.4, thick * 0.54, 8).rotateX(-Math.PI / 2)).pop();
        b.pop();
      }
      b.use(glow);
      for (const sz of [-1, 1]) b.push().move(0, w.h * 0.6, sz * (thick / 2 + 0.01)).box(len * 0.84, 0.11, 0.03).pop();
    } else if (w.kind === 'block') {
      const sh = shadeBox(w.h);
      b.use('ruin', 0xc9c0ac).push().move(0, 0.25, 0).box(len + 0.5, 0.5, thick + 0.5).pop();
      b.push().move(0, w.h * 0.5, 0).tint(0xe0d6bf).box(len, w.h, thick, sh).pop();
      b.push().move(0, w.h + 0.2, 0).tint(0xcfc6b0).box(len * 0.82, 0.4, thick * 0.82).pop();
      b.push().move(0, w.h + 0.55, 0).tint(0xe6dcc6).box(len * 0.55, 0.3, thick * 0.55).pop();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.push().move(sx * (len / 2 - 0.1), w.h * 0.5 + 0.1, sz * (thick / 2 - 0.1)).tint(0xbdb39e).box(0.42, w.h + 0.2, 0.42, sh).pop();
      b.use('glow');
      for (const sz of [-1, 1]) b.push().move(0, w.h * 0.62, sz * (thick / 2 + 0.01)).box(len * 0.6, 0.09, 0.02).pop();
      for (const sx of [-1, 1]) b.push().move(sx * (len / 2 + 0.01), w.h * 0.62, 0).box(0.02, 0.09, thick * 0.6).pop();
    } else {
      const n = Math.round(len / 0.34);
      for (let i = 0; i < n; i++) {
        const h = w.h + rng.range(-0.18, 0.22), x = -len / 2 + (i + 0.5) * (len / n), g = 0.7 + rng() * 0.4;
        b.use('wood').tint(new THREE.Color(g, g * 0.9, g * 0.8));
        b.push().move(x, h / 2, rng.range(-0.04, 0.04)).rotZ(rng.range(-0.04, 0.04)).cyl(0.13, 0.15, h, 6).move(0, h / 2 + 0.14, 0).cyl(0.01, 0.13, 0.28, 6).pop();
      }
      b.use('wood', 0x8a6a48);
      for (const y of [0.45, w.h - 0.4]) b.push().move(0, y, thick * 0.12).box(len + 0.2, 0.14, 0.1).pop();
    }
    b.pop();
  }
  for (const c of map.rounds) {
    b.push().move(c.x, 0, c.z).rotY(rng() * 6.283);
    if (c.kind === 'pillar') {
      b.use('ruin', 0xd2c8b2).push().move(0, 0.2, 0).box(c.r * 2.3, 0.4, c.r * 2.3).pop();
      let y = 0.4; const drums = rng.int(3, 4);
      for (let i = 0; i < drums; i++) {
        const h = rng.range(0.7, 0.95), g = 0.8 + rng() * 0.25;
        b.push().move(rng.range(-0.03, 0.03), y + h / 2, rng.range(-0.03, 0.03)).tint(new THREE.Color(g, g * 0.97, g * 0.9).multiplyScalar(0.7 + 0.1 * i)).cyl(c.r * 0.92, c.r * 0.96, h - 0.03, 12).pop();
        y += h;
      }
      b.push().move(0.06, y + 0.12, 0).rotZ(0.12).tint(0xbfb6a2).cyl(c.r * 0.7, c.r * 0.92, 0.3, 12).pop();
    } else if (c.kind === 'rock') {
      const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), p = g.attributes.position, seen = {};
      for (let i = 0; i < p.count; i++) {
        const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
        const k = seen[key] || (seen[key] = rng.range(0.78, 1.12));
        p.setXYZ(i, p.getX(i) * k * c.r * 1.08, (p.getY(i) * k + 0.25) * c.r * 0.82, p.getZ(i) * k * c.r * 1.08);
      }
      g.computeVertexNormals();
      b.use('ruin').tint(0xffffff).geo(g, (v, n) => (n.y > 0.55 ? 0.75 : 1) * (0.55 + 0.45 * smooth(0, c.r, v.y)));
      g.dispose();
    } else if (c.kind === 'cactus') {
      b.use('plain', 0x4f8a3c).push().move(0, 1.5, 0).cyl(c.r * 0.8, c.r * 0.9, 3.0, 8).pop().push().move(0, 3.05, 0).ball(c.r * 0.8, 1).pop();
      for (const sx of [-1, 1]) b.push().move(sx * 0.62, 1.5 + sx * 0.3, 0).rotZ(sx * 1.57).cyl(0.2, 0.22, 0.7, 7).pop().push().move(sx * 0.9, 2.1 + sx * 0.3, 0).cyl(0.2, 0.22, 1.2, 7).pop();
    } else if (c.kind === 'spire') {
      b.use('ruin', 0x8a8088).push().move(0, 2.2, 0).rotZ(rng.range(-0.12, 0.12)).cyl(0.08, c.r * 1.5, 4.4, 5).pop();
      b.push().move(c.r * 0.8, 0.9, 0.2).rotZ(-0.3).cyl(0.05, c.r * 0.8, 1.8, 5).pop();
    } else if (c.kind === 'lamp') {
      b.use('metal', 0x4a4f57).push().move(0, 0.2, 0).cyl(c.r * 0.7, c.r * 0.9, 0.4, 8).pop().push().move(0, 2.2, 0).cyl(0.09, 0.12, 4.0, 8).pop().push().move(0.45, 4.15, 0).box(1.1, 0.1, 0.16).pop();
      b.use('glow').push().move(0.85, 4.06, 0).box(0.36, 0.06, 0.2).pop();
    } else if (c.kind === 'pine') {
      b.use('wood', 0x6b5038).push().move(0, 0.7, 0).cyl(c.r * 0.6, c.r * 0.8, 1.4, 7).pop();
    } else {
      b.use('wood', 0x7d6142);
      let y = 0, lean = 0;
      for (let i = 0; i < 4; i++) { b.push().move(lean, y + 0.45, 0).cyl(c.r * (0.8 - i * 0.07), c.r * (0.86 - i * 0.07), 0.92, 7).pop(); y += 0.86; lean += 0.05 * i; }
    }
    b.pop();
  }
  for (const t of map.towers) {
    const r = t.kind === 'main' ? 4.6 : 3.3;
    b.push().move(t.x, 0, t.z);
    b.use('pave', 0xcfc7b6).push().move(0, 0.07, 0).cyl(r, r + 0.3, 0.14, 12).pop().push().move(0, 0.2, 0).tint(0xe2dac8).cyl(r - 0.9, r - 0.7, 0.14, 12).pop();
    b.use('glow' + t.team).push().move(0, 0.16, 0).geo(new THREE.RingGeometry(r - 0.5, r - 0.3, 48).rotateX(-Math.PI / 2)).pop();
    if (t.kind === 'main') for (let i = 0; i < 4; i++) {
      const a = i * 1.5708 + 0.785;
      b.use('ruin', 0xd6ccb6).push().move(Math.cos(a) * (r - 0.1), 0.9, Math.sin(a) * (r - 0.1)).cyl(0.3, 0.42, 1.8, 6).pop();
      b.use('glow' + t.team).push().move(Math.cos(a) * (r - 0.1), 2.0, Math.sin(a) * (r - 0.1)).cyl(0.2, 0.26, 0.4, 6).pop();
    }
    b.pop();
  }
  for (let t = 0; t < 2; t++) {
    const [bx, bz] = map.bases[t];
    b.push().move(bx, 0, bz);
    b.use('pave', 0xdcd4c4).push().move(0, 0.04, 0).cyl(RULES.baseRadius, RULES.baseRadius + 0.2, 0.08, 40).pop();
    b.use('glow' + t).push().move(0, 0.09, 0).geo(new THREE.RingGeometry(RULES.baseRadius - 0.45, RULES.baseRadius - 0.2, 64).rotateX(-Math.PI / 2)).pop();
    b.push().move(0, 0.09, 0).geo(new THREE.RingGeometry(1.4, 1.52, 40).rotateX(-Math.PI / 2)).pop();
    for (let i = 0; i < 4; i++) {
      const a = i * 1.5708 + 0.785, px = Math.cos(a) * (RULES.baseRadius - 0.6), pz = Math.sin(a) * (RULES.baseRadius - 0.6);
      b.use('metal', 0x59616b).push().move(px, 0.9, pz).cyl(0.22, 0.34, 1.8, 6).pop();
      b.use('glow' + t).push().move(px, 1.95, pz).cyl(0.16, 0.2, 0.3, 6).pop();
    }
    b.pop();
  }
  return b.build();
}

function buildProps(rng) {
  const out = {};
  let b = new Builder(0.6);
  b.use('main', 0xffffff).push().move(0, 0.62, 0).box(1.24, 1.24, 1.24).pop();
  b.tint(0x8a6238);
  for (const s of [-1, 1]) {
    b.push().move(0, 0.62, s * 0.63).box(1.34, 0.16, 0.06).pop().push().move(s * 0.63, 0.62, 0).box(0.06, 0.16, 1.34).pop();
    b.push().move(0, 0.62, s * 0.63).rotZ(0.78).box(1.6, 0.13, 0.05).pop().push().move(s * 0.63, 0.62, 0).rotX(0.78).box(0.05, 0.13, 1.6).pop();
  }
  b.push().move(0, 1.26, 0).box(1.34, 0.08, 1.34).pop();
  out.crate = b.build().main;
  b = new Builder(0.5);
  b.use('main', 0xd4372a).push().move(0, 0.6, 0).cyl(0.52, 0.52, 1.2, 14).pop();
  b.tint(0x3a3a3e);
  for (const y of [0.08, 0.6, 1.14]) b.push().move(0, y, 0).cyl(0.56, 0.56, 0.1, 14).pop();
  b.tint(0xffc928).push().move(0, 0.86, 0).cyl(0.535, 0.535, 0.18, 14).pop();
  out.barrel = b.build().main;
  b = new Builder(1);
  const prof = [[0.2, 0], [0.4, 0.15], [0.46, 0.4], [0.36, 0.68], [0.22, 0.8], [0.28, 0.9]].map((p) => new THREE.Vector2(p[0], p[1]));
  b.use('main', 0xc8794a).geo(new THREE.LatheGeometry(prof, 12));
  out.pot = b.build().main;
  return out;
}

export function makeWorld(G, map, tex) {
  const Q = G.quality, rng = mulberry('world:' + map.key), theme = THEMES[map.theme] || THEMES.jungle;
  const group = new THREE.Group();
  const wind = { uTime: { value: 0 } };
  const sample = groundSampler(map);
  const splat = splatTexture(map, sample);

  const gw = map.w + MARGIN * 2, gd = map.d + MARGIN * 2;
  const gg = new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI / 2);
  const guv = gg.attributes.uv, gp = gg.attributes.position;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, gp.getX(i) * TILE, gp.getZ(i) * TILE);
  const ground = new THREE.Mesh(gg, groundMaterial(tex, splat, map, wind, Q.name !== 'low', theme));
  ground.receiveShadow = true; group.add(ground);

  const mats = {
    ruin: tex.material('ruin', { growth: theme.growth }).clone(), pave: tex.material('pave', { growth: theme.growth }).clone(), wood: tex.material('wood'), metal: tex.material('metal'),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.15, 0.35), toneMapped: false }),
    glow0: new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAMS[0].color).multiplyScalar(2.2), toneMapped: false }),
    glow1: new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAMS[1].color).multiplyScalar(2.2), toneMapped: false }),
  };
  mats.ruin.color.set(theme.stone); mats.pave.color.setRGB(...theme.pave);
  const st = buildStructures(map, rng);
  for (const k in st) {
    const mesh = new THREE.Mesh(st[k], mats[k]);
    mesh.castShadow = !k.startsWith('glow'); mesh.receiveShadow = true; group.add(mesh);
  }

  const P = plantGeos(mulberry('plants'));
  const leaf = leafMaterial(wind, 0.07), blade = leafMaterial(wind, 0.2, { roughness: 0.8 }), tall = leafMaterial(wind, 0.03);
  const L = theme.leaf;
  const tintOf = (x, z) => { const m = sample(x, z).macro, k = 0.7 + rng() * 0.5; return [k * (0.75 + m * 0.6) * L[0], k * (0.95 + m * 0.15) * L[1], k * (0.7 + m * 0.3) * L[2]]; };
  const free = (x, z, r) => !solidAt(map, x, z, r);

  const grass = [];
  const want = Math.round(12000 * Q.foliage * theme.grass);
  for (let tries = 0; grass.length < want && tries < want * 6; tries++) {
    const x = rng.range(-map.hw - 5, map.hw + 5), z = rng.range(-map.hd - 5, map.hd + 5), s = sample(x, z);
    if (s.path > 0.3 || s.pave > 0.35 || rng() > 0.35 + s.macro * 0.9) continue;
    if (Math.abs(x) < map.hw && Math.abs(z) < map.hd && !free(x, z, 0.25)) continue;
    grass.push({ x, z, yaw: rng() * 6.283, s: rng.range(0.8, 1.7), c: tintOf(x, z) });
  }
  group.add(instanced(P.grass, blade, grass));

  const ferns = [], broads = [];
  const edgeSpots = [];
  for (const w of map.walls) {
    const n = Math.round((w.w + w.d) * 0.9);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3), t = rng();
      const x = side < 2 ? w.x0 + t * w.w : (side === 2 ? w.x0 - 0.5 : w.x1 + 0.5), z = side < 2 ? (side ? w.z1 + 0.5 : w.z0 - 0.5) : w.z0 + t * w.d;
      edgeSpots.push([x + rng.range(-0.3, 0.3), z + rng.range(-0.3, 0.3)]);
    }
  }
  for (const c of map.rounds) if (c.kind !== 'tree') for (let i = 0; i < 4; i++) { const a = rng() * 6.283; edgeSpots.push([c.x + Math.cos(a) * (c.r + 0.5), c.z + Math.sin(a) * (c.r + 0.5)]); }
  for (const [x, z] of edgeSpots) {
    if (rng() > Q.foliage * 0.9 * theme.fern || sample(x, z).path > 0.5) continue;
    if (rng() < 0.22 * theme.broad) broads.push({ x, z, yaw: rng() * 6.283, s: rng.range(0.42, 0.62), c: tintOf(x, z) });
    else ferns.push({ x, z, yaw: rng() * 6.283, s: rng.range(0.55, 0.95), c: tintOf(x, z) });
  }
  for (let i = 0; i < 260 * Q.foliage * theme.fern; i++) {
    const x = rng.range(-map.hw, map.hw), z = rng.range(-map.hd, map.hd), s = sample(x, z);
    if (s.path > 0.15 || s.pave > 0.2 || !free(x, z, 0.3)) continue;
    ferns.push({ x, z, yaw: rng() * 6.283, s: rng.range(0.4, 0.75), c: tintOf(x, z) });
  }

  const palms = [], trunks = new Builder(0.5), crowns = [];
  const per = 2 * (map.w + map.d), steps = Math.round(per / 2.6);
  const rows = Q.name === 'low' ? 2 : 3;
  for (let i = 0; i < steps; i++) for (let row = 0; row < rows; row++) {
    let d = (i / steps) * per + rng.range(-1, 1), x, z;
    const off = 1.2 + row * 3.6 + rng.range(0, 2.4);
    if (d < map.w) { x = -map.hw + d; z = -map.hd - off; } else if ((d -= map.w) < map.d) { x = map.hw + off; z = -map.hd + d; }
    else if ((d -= map.d) < map.w) { x = map.hw - d; z = map.hd + off; } else { x = -map.hw - off; z = map.hd - (d - map.w); }
    const front = z > map.hd;
    const roll = rng();
    // No palms along the camera-side edge: seen from this angle a tall crown there would cover the playfield.
    if (!front && roll < theme.tallRate && row > 0 && (Math.abs(x) < map.hw || row > 1) && theme.tall !== 'palm') {
      palms.push({ x, z, yaw: rng() * 6.283, s: rng.range(1.0, 1.9), c: theme.tall === 'pine' ? [1, 1, 1] : [1, 1, 1] });
    } else if (!front && roll < theme.tallRate && row > 0 && (Math.abs(x) < map.hw || row > 1)) {
      const h = rng.range(5.5, 9), lean = rng.range(-0.6, 0.6), yaw = rng() * 6.283;
      trunks.push().move(x, 0, z).rotY(yaw).use('wood', 0x8f7658);
      for (let k = 0; k < 6; k++) trunks.push().move(lean * (k / 6) * (k / 6) * 2, h * (k + 0.5) / 6, 0).rotZ(-lean * k * 0.07).cyl(0.2 - k * 0.012, 0.23 - k * 0.012, h / 6 + 0.05, 7).pop();
      trunks.pop();
      const ox = Math.cos(-yaw) * lean * 1.4, oz = Math.sin(-yaw) * lean * 1.4;
      palms.push({ x: x + ox, y: h, z: z + oz, yaw: rng() * 6.283, s: rng.range(0.85, 1.25), c: tintOf(x, z) });
    } else if (roll < 0.7 * theme.broad) broads.push({ x, z, yaw: rng() * 6.283, s: rng.range(0.9, 1.6) * (front ? 0.6 : 1), c: tintOf(x, z) });
    else if (rng() < Math.max(0.35, theme.fern)) ferns.push({ x, z, yaw: rng() * 6.283, s: rng.range(1.0, 1.7), c: tintOf(x, z) });
  }
  const pines = [];
  for (const c of map.rounds) if (c.kind === 'pine') pines.push({ x: c.x, y: 0.5, z: c.z, yaw: rng() * 6.283, s: rng.range(0.75, 0.95), c: [1, 1, 1] });
  for (const c of map.rounds) if (c.kind === 'tree') crowns.push({ x: c.x + 0.3, y: 3.35, z: c.z, yaw: rng() * 6.283, s: rng.range(0.8, 1.05), c: tintOf(c.x, c.z) });

  const cast = Q.name !== 'low';
  group.add(instanced(P.fern, leaf, ferns, { cast }));
  group.add(instanced(P.broad, leaf, broads, { cast }));
  group.add(instanced(P.crown, tall, crowns, { cast: true }));
  group.add(instanced(P[theme.tall], tall, palms, { cast }));
  if (pines.length) group.add(instanced(P.pine, tall, pines, { cast: true }));
  const tg = trunks.build();
  if (tg.wood) { const m = new THREE.Mesh(tg.wood, mats.wood); m.castShadow = true; m.receiveShadow = true; group.add(m); }

  const puffs = [];
  for (const bu of map.bushes) {
    puffs.push({ x: bu.x, z: bu.z, yaw: rng() * 6.283, s: bu.r * 0.82, sy: 0.8, c: theme.bush });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rng(), k = 0.75 + rng() * 0.35;
      puffs.push({ x: bu.x + Math.cos(a) * bu.r * 0.58, z: bu.z + Math.sin(a) * bu.r * 0.58, yaw: rng() * 6.283, s: bu.r * rng.range(0.42, 0.55), sy: 0.9, c: [k * theme.bush[0], k * theme.bush[1], k * 0.9 * theme.bush[2]] });
    }
  }
  const bushMat = leafMaterial(wind, 0.05);
  group.add(instanced(P.bush, bushMat, puffs, { cast: true }));

  const pg = buildProps(rng);
  const propMats = { crate: tex.material('wood'), barrel: tex.material('metal', { reflect: 0.6 }), pot: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }) };
  const propMesh = {}, propSlot = [];
  const PM = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const kind in pg) {
    const list = map.props.filter((p) => p.kind === kind);
    const mesh = new THREE.InstancedMesh(pg[kind], propMats[kind], Math.max(1, list.length));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    list.forEach((p, i) => {
      propSlot[p.id] = { mesh, i, m: new THREE.Matrix4().makeRotationY(rng.range(-0.3, 0.3)).setPosition(p.x, 0, p.z), shown: true, bump: 0 };
      mesh.setMatrixAt(i, propSlot[p.id].m);
    });
    if (!list.length) mesh.setMatrixAt(0, ZERO);
    propMesh[kind] = mesh; group.add(mesh);
  }

  const lavaMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: wind.uTime, uR: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      // x: distance to the nearest plate edge, y: a random value per plate
      vec2 plates(vec2 p) {
        vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)), o = vec2(h(i + g), h(i + g + 17.3));
          o = 0.5 + 0.38 * sin(uTime * 0.25 + 6.2832 * o);
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; id = h(i + g + 4.1); } else if (d < d2) d2 = d;
        }
        return vec2(d2 - d1, id);
      }
      void main() {
        float r = length(vP), wob = (n(vP * 7.0) - 0.5) * 0.14;
        vec2 flow = vec2(n(vP * 2.0 + uTime * 0.05), n(vP * 2.0 - uTime * 0.04 + 7.0)) - 0.5;
        vec2 pl = plates(vP * 3.4 + flow * 0.9);
        float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + pl.y * 20.0);
        float crack = 1.0 - smoothstep(0.03, 0.2, pl.x);
        float molten = smoothstep(0.55, 0.9, n(vP * 1.6 + uTime * 0.06) + (pl.y - 0.5) * 0.5);
        vec3 crust = mix(vec3(0.05, 0.022, 0.018), vec3(0.2, 0.05, 0.02), n(vP * 14.0) * (0.4 + pl.y * 0.6));
        vec3 hot = mix(vec3(2.4, 0.42, 0.05), vec3(3.4, 1.5, 0.3), crack * crack) * pulse;
        vec3 c = mix(crust, hot, max(crack, molten * (0.55 + 0.45 * smoothstep(0.0, 0.5, pl.x))));
        float lip = smoothstep(0.74, 0.9, r + wob);
        c = mix(c, vec3(0.045, 0.03, 0.028) + vec3(0.9, 0.16, 0.02) * (1.0 - smoothstep(0.74, 0.86, r + wob)), lip);
        gl_FragColor = vec4(c, 1.0 - smoothstep(0.93, 1.02, r + wob));
      }`,
  });
  for (const h of map.hazards) {
    if (h.kind === 'lava') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), lavaMat);
      m.position.set(h.x, 0.05, h.z); m.scale.setScalar(h.r * 1.08); m.renderOrder = 1; group.add(m);
    } else if (h.kind === 'mud') {
      const mat = tex.material('mud').clone(); mat.vertexColors = false; mat.transparent = true; mat.opacity = 0.95; mat.color.set(map.theme === 'canyon' ? 0xd9a070 : 0x8a8a70);
      const g = new THREE.CircleGeometry(h.r, 40).rotateX(-Math.PI / 2), uv = g.attributes.uv, pp = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + h.x) * 0.2, (pp.getZ(i) + h.z) * 0.2);
      const m = new THREE.Mesh(g, mat);
      m.position.set(h.x, 0.04, h.z); m.receiveShadow = true; group.add(m);
    } else if (h.kind === 'ice') {
      const mat = tex.material('frost').clone(); mat.vertexColors = false; mat.color.set(0x6fa9d6); mat.transparent = true; mat.opacity = 0.92; mat.envMapIntensity = 0.7;
      const g = new THREE.CircleGeometry(h.r, 40).rotateX(-Math.PI / 2), uv = g.attributes.uv, pp = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + h.x) * 0.16, (pp.getZ(i) + h.z) * 0.16);
      const m = new THREE.Mesh(g, mat);
      m.position.set(h.x, 0.04, h.z); m.receiveShadow = true; group.add(m);
    } else {
      const b = new Builder(0.4);
      b.use('main', 0x3a3d42).push().move(0, 0.05, 0).cyl(h.r * 0.55, h.r * 0.62, 0.1, 20).pop();
      for (let i = -2; i <= 2; i++) b.tint(0x22252a).push().move(i * h.r * 0.2, 0.11, 0).box(0.1, 0.04, h.r * 0.95).pop();
      const m = new THREE.Mesh(b.build().main, mats.metal); m.position.set(h.x, 0, h.z); m.receiveShadow = true; group.add(m);
      const ringM = new THREE.Mesh(new THREE.RingGeometry(h.r * 0.94, h.r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb8551a, toneMapped: false }));
      ringM.position.set(h.x, 0.07, h.z); group.add(ringM);
    }
  }

  const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]);
  const sun = new THREE.DirectionalLight(theme.sun[0], theme.sun[1]);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(Q.shadow);
  const sc = sun.shadow.camera;
  sc.left = -30; sc.right = 30; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; sun.shadow.radius = Q.name === 'high' ? 3 : 2;
  const SUN_DIR = new THREE.Vector3(-0.42, 0.78, -0.36).normalize();
  group.add(hemi, sun, sun.target);

  const texel = 60 / Q.shadow;
  function focus(x, z) {
    const fx = Math.round(x / texel) * texel, fz = Math.round(z / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx, 0, fz).addScaledVector(SUN_DIR, 45);
  }
  focus(0, 0);

  function update(time, match) {
    wind.uTime.value = time;
    if (!match) return;
    for (const p of match.props) {
      const s = propSlot[p.id];
      if (s.shown !== p.alive) { s.shown = p.alive; s.mesh.setMatrixAt(s.i, p.alive ? s.m : ZERO); s.mesh.instanceMatrix.needsUpdate = true; }
    }
  }

  return { group, update, focus, sample, sun, hemi, SUN_DIR, theme, dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); splat.dispose(); } };
}

// A small gradient sky rendered once into a PMREM environment, so metal has something to reflect.
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 zen = vec3(0.22, 0.48, 0.95), hor = vec3(0.85, 0.93, 0.98), gnd = vec3(0.10, 0.20, 0.06);
        vec3 c = d.y > 0.0 ? mix(hor, zen, pow(d.y, 0.55)) : mix(hor * 0.55, gnd, 1.0 - pow(1.0 + d.y, 6.0));
        float s = max(0.0, dot(d, normalize(vec3(-0.42, 0.78, -0.36))));
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 60.0) * 6.0 + pow(s, 6.0) * 0.5);
        gl_FragColor = vec4(c * 1.15, 1.0);
      }`,
  }));
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose(); sky.geometry.dispose(); sky.material.dispose();
  return env;
}
