// Effects: projectiles, particles, debris, ground decals and telegraphs, zones, beams, deaths and respawns, airdrop crates, flashes, camera shake.
// Reads match state and sim events. Never writes to the match.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { TEAMS, PICKUPS, RULES } from '../data.js';
import { visibleTo } from '../sim.js';
import { makePoints, makeStreaks, makeDebris, premul, additive, K } from './fxkit.js';
import { makeTowers } from './towers.js';

const TEAM_HDR = [new THREE.Color(0.25, 0.85, 2.0), new THREE.Color(2.1, 0.55, 0.16)];
const C = (r, g, b) => new THREE.Color(r, g, b);
const FIRE = C(2.2, 1.0, 0.25), EMBER = C(1.9, 0.55, 0.1), WHITE = C(2, 2, 2), SMOKE = C(0.16, 0.15, 0.14), SOOT = C(0.07, 0.065, 0.06), DUST = C(0.42, 0.36, 0.27),
  HEAL = C(0.35, 1.9, 0.5), ICE = C(0.9, 1.6, 2.2), FOG = C(0.62, 0.64, 0.66), ARC = C(0.5, 1.2, 2.4), VIOLET = C(1.2, 0.5, 2.2), WOOD = C(0.4, 0.26, 0.12), CLAY = C(0.55, 0.3, 0.18), STONE = C(0.5, 0.47, 0.4),
  METAL = C(0.22, 0.23, 0.25), ICECHUNK = C(0.75, 0.9, 1.0), GOLD = C(2.2, 1.9, 0.4), SHOCK = C(2.2, 1.6, 1.0), FIREFLY = C(1.6, 2.2, 0.5), DANGER = C(2.2, 0.4, 0.2), VENT = C(2.2, 0.5, 0.1);
const TEAM_PAINT = TEAMS.map((t) => new THREE.Color(t.color).multiplyScalar(0.75));
const GROUND_DUST = { grass: C(0.4, 0.34, 0.24), sand: C(0.78, 0.64, 0.45), snow: C(0.86, 0.9, 0.96), basalt: C(0.26, 0.23, 0.23), asphalt: C(0.36, 0.34, 0.33) };

// Projectile looks: shader shape (k), quad length and width in metres, and what they trail.
const SHOT_LOOK = {
  bullet: { k: 0, len: 3.1, wid: 0.8 },
  shell: { k: 1, len: 3.0, wid: 1.75, trail: 'spark' },
  rail: { k: 2, len: 7.5, wid: 0.9, trail: 'line' },
  pulse: { k: 3, len: 2.4, wid: 1.65, trail: 'arc' },
  rocket: { k: 4, len: 3.7, wid: 1.3, trail: 'fire' },
  pellet: { k: 5, len: 1.9, wid: 0.72 },
  frost: { k: 6, len: 2.9, wid: 1.25, trail: 'ice' },
  rivet: { k: 7, len: 2.7, wid: 0.8 },
  tower: { k: 8, len: 4.4, wid: 2.7, trail: 'tower' },
  mortar: { k: 9, len: 1.3, wid: 1.3 },
};
const IMPACT_COLOR = { frost: ICE, pulse: ARC, rail: WHITE, tower: WHITE };

const GROUND_FRAG = `
  uniform vec3 uColor; uniform float uT, uA, uTime, uSeed; uniform int uMode; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = 0.0, ang = atan(p.y, p.x); vec3 c = uColor;
    if (r > 1.0) discard;
    if (uMode == 0) {
      float w = 0.1 * (1.0 - uT) + 0.025;
      a = (1.0 - smoothstep(0.0, w * 0.8, abs(r - uT))) * (1.0 - uT) * 1.0 + (1.0 - smoothstep(0.0, max(uT, 0.01), r)) * 0.22 * (1.0 - uT) * smoothstep(0.0, uT, r);
    } else if (uMode == 1) {
      float rim = 1.0 - smoothstep(0.0, 0.035, abs(r - 0.95));
      float ticks = step(0.86, r) * step(r, 0.95) * step(0.82, fract(ang * 12.0 / 6.2832 + uTime * 0.25));
      float fill = step(r, uT * 0.95) * (0.2 + 0.1 * sin(uTime * 16.0)) * (0.4 + 0.6 * uT);
      float edge = (1.0 - smoothstep(0.0, 0.04, abs(r - uT * 0.95))) * 0.9;
      float cross = (1.0 - smoothstep(0.0, 0.03, min(abs(p.x), abs(p.y)))) * step(r, 0.22) * step(0.07, r);
      float blink = uT > 0.75 ? 0.75 + 0.25 * sin(uTime * 40.0) : 1.0;
      a = (rim * 1.0 + ticks * 0.7 + fill + edge + cross * 0.9 + 0.06) * blink;
    } else if (uMode == 2) {
      float swirl = 0.5 + 0.5 * sin(ang * 6.0 + r * 9.0 - uTime * 2.5);
      float rim = 1.0 - smoothstep(0.0, 0.06, abs(r - 0.95));
      float pulse = 1.0 - smoothstep(0.0, 0.08, abs(r - fract(uTime * 0.45)));
      a = rim * 0.9 + (1.0 - r) * 0.14 + swirl * 0.14 * (1.0 - smoothstep(0.3, 1.0, r)) + pulse * 0.25 * (1.0 - r);
    } else if (uMode == 3 || uMode == 7) {
      vec2 q = p + uSeed;
      float n = vn(q * 5.0) * 0.6 + vn(q * 13.0) * 0.4;
      float rays = vn(vec2(ang * 5.0 + uSeed * 7.0, 0.5)) * 0.45;
      float body = 1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.5 - rays * step(0.3, r));
      float cracks = 0.0;
      if (uMode == 7) { float s = abs(fract(ang * 9.0 / 6.2832 + vn(p * 3.0 + uSeed) * 0.5) - 0.5); cracks = (1.0 - smoothstep(0.0, 0.05 + r * 0.03, s)) * (1.0 - smoothstep(0.5, 1.0, r)); body *= 0.6; }
      float dark = clamp(body * 0.85 + cracks * 0.9, 0.0, 1.0) * uA;
      float heat = uT * (1.0 - smoothstep(0.0, 0.55, r)) * (0.5 + n) + uT * cracks * 1.5;
      gl_FragColor = vec4(vec3(0.015, 0.012, 0.01) * dark + c * heat * uA * 1.5, dark); return;
    } else if (uMode == 4) {
      float core = 1.0 - smoothstep(0.1, 0.17, r), blink = 0.5 + 0.5 * sin(uTime * 9.0);
      a = core * (0.5 + blink) + (1.0 - smoothstep(0.0, 0.035, abs(r - 0.95))) * 0.28 * uT;
    } else if (uMode == 9) {
      float spin = ang + uTime * 1.5, k = 1.0 - uT;
      float runes = step(0.5, fract(spin * 16.0 / 6.2832)) * step(0.72, r) * step(r, 0.84);
      float rim = 1.0 - smoothstep(0.0, 0.03, abs(r - 0.9));
      float hex = 1.0 - smoothstep(0.0, 0.03, abs(cos(floor((ang - uTime * 0.8) / 1.0472 + 0.5) * 1.0472 - ang + uTime * 0.8) * r - 0.5));
      a = (runes * 0.7 + rim + hex * 0.8 + (1.0 - r) * 0.25) * k;
    } else {
      float dash = step(0.5, fract((ang + uTime * 0.8) * 8.0 / 6.2832));
      a = (1.0 - smoothstep(0.0, 0.06, abs(r - 0.86))) * dash * 0.85 + (1.0 - smoothstep(0.0, 0.03, abs(r - 0.6))) * 0.3;
    }
    a *= uA;
    gl_FragColor = vec4(c * a, 0.0);
  }`;

const QUAD_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

// Projectile shapes, drawn in metres along the quad (q.x: 0 tail → len head, q.y across). Premultiplied: rgb glows, alpha darkens
// what is behind, so every shot carries a faint dark rim that keeps it readable on snow and sand as well as on night grass.
const SHOT_FRAG = `
  uniform float uTime; varying vec2 vUv; varying vec3 vC; varying vec4 vI;
  float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
  float h11(float x) { return fract(sin(x * 91.7) * 43758.5); }
  void main() {
    float k = vI.x, len = vI.y, wid = vI.z, seed = vI.w;
    vec2 q = vec2(vUv.x * len, (vUv.y - 0.5) * wid);
    float hx = len - wid * 0.5, t = uTime * 30.0 + seed * 40.0;
    vec3 c = vC, W = mix(vec3(3.0, 2.9, 2.7), vC * 1.5, 0.3), rgb = vec3(0.0); float occ = 0.0, d, tail = clamp(q.x / hx, 0.0, 1.0);
    if (k < 0.5) {
      d = seg(q, vec2(hx - 0.35, 0.0), vec2(hx, 0.0));
      float core = exp(-d * d / 0.004), halo = exp(-d * d / 0.035);
      float tr = exp(-q.y * q.y / (0.0015 + 0.006 * tail)) * tail * tail * step(q.x, hx);
      rgb = W * core + c * (halo * 0.9 + tr * 0.9); occ = smoothstep(0.2, 0.0, d) * 0.35 + tr * 0.15;
    } else if (k < 1.5 || k > 8.5) {
      vec2 o = q - vec2(hx, 0.0); d = length(o);
      float rad = k > 8.5 ? 0.26 : 0.24, ball = 1.0 - smoothstep(rad * 0.75, rad, d), core = 1.0 - smoothstep(0.0, rad * 0.4, d);
      float halo = exp(-d * d / 0.14), fl = 0.85 + 0.15 * sin(t + q.x * 9.0);
      float tr = exp(-q.y * q.y / (0.004 + 0.03 * tail)) * pow(tail, 1.6) * step(q.x, hx) * fl;
      vec3 hot = mix(c, vec3(2.6, 1.2, 0.35), 0.45);
      rgb = W * core + hot * ball * 1.4 + c * halo * 0.9 + hot * tr * 1.1; occ = smoothstep(rad + 0.1, rad, d) * 0.45;
    } else if (k < 2.5) {
      float body = step(0.3, q.x);
      float core = exp(-q.y * q.y / 0.0025) * body, halo = exp(-q.y * q.y / 0.04) * body * (0.4 + 0.6 * tail);
      float h1 = sin(q.x * 5.0 - t * 1.6) * 0.17 * tail, h2 = sin(q.x * 5.0 - t * 1.6 + 3.14) * 0.17 * tail;
      float hel = (exp(-pow(q.y - h1, 2.0) / 0.0016) + exp(-pow(q.y - h2, 2.0) / 0.0016)) * body * tail;
      vec2 o = q - vec2(hx, 0.0); float flare = exp(-dot(o, o) / 0.05);
      rgb = W * (core + flare) + c * (halo * 1.2 + hel * 1.4); occ = core * 0.3 * tail;
    } else if (k < 3.5) {
      vec2 o = q - vec2(hx, 0.0); d = length(o);
      float ring = exp(-pow(d - 0.4 - 0.05 * sin(t * 0.7), 2.0) / 0.003), core = 1.0 - smoothstep(0.0, 0.2, d), halo = exp(-d * d / 0.18);
      float an = atan(o.y, o.x), arcs = pow(max(0.0, sin(an * 5.0 + t * 0.9 + sin(t * 0.37) * 3.0)), 24.0) * exp(-pow(d - 0.32, 2.0) / 0.01);
      float tr = exp(-q.y * q.y / 0.01) * pow(tail, 3.0) * step(q.x, hx) * 0.6;
      rgb = W * core + c * (ring * 1.4 + halo * 0.8 + arcs * 2.0 + tr); occ = smoothstep(0.5, 0.42, d) * 0.3;
    } else if (k < 4.5) {
      float bx = hx - 0.85; d = seg(q, vec2(bx, 0.0), vec2(hx - 0.05, 0.0));
      float body = 1.0 - smoothstep(0.14, 0.17, d), nose = exp(-dot(q - vec2(hx, 0.0), q - vec2(hx, 0.0)) / 0.02);
      float stripe = step(abs(q.x - (bx + 0.3)), 0.08) * body, fin = step(abs(q.x - bx - 0.08), 0.1) * step(abs(q.y), 0.3) * step(0.12, abs(q.y));
      float fl = 0.8 + 0.2 * sin(t * 1.3 + q.x * 13.0);
      float fx = clamp((bx - q.x) / 1.3, 0.0, 1.0), flame = exp(-q.y * q.y / (0.006 + 0.04 * fx)) * (1.0 - fx) * step(q.x, bx + 0.05) * fl;
      float plume = exp(-q.y * q.y / 0.06) * step(q.x, bx) * smoothstep(0.0, 1.0, q.x) * 0.6;
      vec3 metal = vec3(0.2, 0.21, 0.24) * (1.3 - q.y * 4.0);
      float solid = max(body, fin);
      rgb = metal * solid * (1.0 - stripe) + c * stripe * 1.4 + c * nose * 1.6 + mix(vec3(3.2, 2.4, 1.1), vec3(2.6, 0.8, 0.12), fx) * flame * 2.0 + c * plume * 0.6;
      occ = solid + smoothstep(0.25, 0.0, d) * 0.3;
    } else if (k < 5.5) {
      d = seg(q, vec2(hx - 0.22, 0.0), vec2(hx, 0.0));
      float core = exp(-d * d / 0.003), halo = exp(-d * d / 0.03);
      float tr = exp(-q.y * q.y / 0.004) * pow(tail, 2.5) * step(q.x, hx);
      vec3 hot = mix(c, vec3(2.8, 1.6, 0.6), 0.5);
      rgb = W * core * 0.9 + hot * (halo + tr * 0.8); occ = smoothstep(0.14, 0.0, d) * 0.35;
    } else if (k < 6.5) {
      vec2 o = q - vec2(hx - 0.25, 0.0);
      float dia = abs(o.x) / 0.48 + abs(o.y) / 0.17, body = 1.0 - smoothstep(0.9, 1.0, dia);
      float facet = o.y > 0.0 ? 1.0 : 0.62, edge = smoothstep(0.7, 0.95, dia) * body;
      float halo = exp(-dot(o, o) / 0.09);
      float spark = step(0.93, h11(floor(q.x * 9.0 - t * 0.1) + seed * 7.0)) * exp(-q.y * q.y / 0.01) * tail * step(q.x, hx - 0.6);
      vec3 ice = vec3(1.7, 2.3, 2.8);
      rgb = mix(ice * 0.55, ice, 1.0 - dia) * facet * body + c * edge * 1.6 + c * halo * 0.7 + ice * spark * 1.5;
      occ = body * 0.7;
    } else if (k < 7.5) {
      float sx = hx - 0.55; d = seg(q, vec2(sx, 0.0), vec2(hx - 0.12, 0.0));
      float shaft = 1.0 - smoothstep(0.045, 0.06, d), capd = length(vec2((q.x - sx) * 2.5, q.y)), cap = 1.0 - smoothstep(0.12, 0.14, capd);
      float tipx = (q.x - (hx - 0.14)) / 0.16, tip = step(0.0, tipx) * step(tipx, 1.0) * step(abs(q.y), 0.055 * (1.0 - tipx));
      float hot = exp(-dot(q - vec2(hx - 0.1, 0.0), q - vec2(hx - 0.1, 0.0)) / 0.02);
      float tr = exp(-q.y * q.y / 0.003) * pow(clamp(q.x / sx, 0.0, 1.0), 2.0) * step(q.x, sx);
      vec3 steel = vec3(0.5, 0.52, 0.56) * (1.25 - q.y * 7.0);
      float solid = max(shaft, max(cap, tip));
      rgb = steel * solid * (1.0 - tip) + vec3(3.0, 1.7, 0.6) * (tip + hot * 0.8) + c * tr * 1.1;
      occ = solid + smoothstep(0.16, 0.0, d) * 0.25;
    } else {
      vec2 o = q - vec2(hx, 0.0); d = length(o);
      float an = atan(o.y, o.x), rays = pow(abs(sin(an * 3.0 + t * 0.15)), 10.0) * exp(-d * d / 0.4) * 0.6;
      float core = 1.0 - smoothstep(0.0, 0.14, d), ball = 1.0 - smoothstep(0.36, 0.44, d), halo = exp(-d * d / 0.25);
      ball *= 0.75 + 0.25 * sin(d * 30.0 - t * 0.6);
      float tr = exp(-q.y * q.y / (0.01 + 0.06 * tail)) * pow(tail, 1.4) * step(q.x, hx) * (0.85 + 0.15 * sin(t + q.x * 6.0));
      rgb = W * core + c * (ball * 2.0 + halo * 0.9 + rays + tr * 1.3); occ = smoothstep(0.55, 0.42, d) * 0.5;
    }
    // Bright glow also hides what is behind it, so a shot keeps its team colour over sand and snow instead of washing out to white.
    rgb *= 0.6;
    occ = max(occ, clamp(dot(rgb, vec3(0.3, 0.5, 0.2)) * 0.9, 0.0, 0.7));
    float win = smoothstep(0.0, 0.22, vUv.y) * smoothstep(0.0, 0.22, 1.0 - vUv.y) * smoothstep(0.0, 0.06, vUv.x) * smoothstep(0.0, 0.1, 1.0 - vUv.x);
    gl_FragColor = vec4(rgb, clamp(occ, 0.0, 1.0)) * win;
  }`;

export function makeFx(G, mechs) {
  const Q = G.quality, low = Q.name === 'low', group = new THREE.Group();
  const QK = Math.min(1.5, Q.particles / 800), N = (x) => Math.max(1, Math.round(x * QK));
  const add = makePoints(Q.particles, false, low), ovr = makePoints(Math.round(Q.particles * 0.6), true, low), str = makeStreaks(Math.round(Q.particles * 0.3));
  const debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.35, flatShading: true });
  const deb = makeDebris(low ? 24 : Q.name === 'medium' ? 60 : 110, debrisMat, Q.name === 'high', (x, y, z, left) => ovr.emit(x, y + 0.2, z, rnd(-0.3, 0.3), 1.2, rnd(-0.3, 0.3), SMOKE, 1.1, 0.45, 2.6, 1.2, -0.8, Math.min(0.5, left * 0.4), K.SMOKE));
  group.add(ovr.pts, add.pts, str.mesh, deb.mesh);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let shake = 0, time = 0, frame = 0, dust = DUST;
  const V = new THREE.Vector3();

  // Bursts. glow/spark go to the additive pools, puff to the premultiplied pool.
  const glow = (x, y, z, c, life, size, a = 1, k = K.GLOW, grow = 1.3, vx = 0, vy = 0, vz = 0) => add.emit(x, y, z, vx, vy, vz, c, life, size, grow, 0, 0, a, k);
  function sparks(x, y, z, n, c, speed, life, width = 0.06, up = 0.6, grav = 16, dx = 0, dz = 0, spread = 1) {
    for (let i = 0; i < n; i++) {
      let a = Math.random() * 6.283;
      if (dx || dz) a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 3.2 * spread;
      const s = speed * rnd(0.35, 1);
      str.emit(x, y, z, Math.cos(a) * s, rnd(-0.1, 1) * up * speed, Math.sin(a) * s, c, life * rnd(0.6, 1.1), width * rnd(0.7, 1.2), 0.03, grav, 1.5, 1);
    }
  }
  function puffs(x, y, z, n, c, spread, speed, life, size, grow, lift, a, k = K.SMOKE, drag = 2, grav = 0) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * 6.283, d = Math.sqrt(Math.random()) * spread, s = speed * rnd(0.4, 1);
      ovr.emit(x + Math.cos(ang) * d, y + rnd(-0.2, 0.3), z + Math.sin(ang) * d, Math.cos(ang) * s, lift * rnd(0.6, 1.2), Math.sin(ang) * s, c, life * rnd(0.75, 1.15), size * rnd(0.75, 1.2), grow, drag, grav, a, k);
    }
  }
  function chips(x, y, z, n, c, speed, life, size, up = 1) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = speed * rnd(0.3, 1); ovr.emit(x, y, z, Math.cos(a) * s, rnd(0.3, 1.2) * speed * up, Math.sin(a) * s, c, life * rnd(0.7, 1.1), size * rnd(0.6, 1.3), 1, 0.6, 18, 1, K.CHIP); }
  }
  function chunks(x, y, z, n, c, speed, up, size, life, smoke, c2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * rnd(0.35, 1), sz = size * rnd(0.6, 1.3);
      deb.emit(x + rnd(-0.4, 0.4), y + rnd(-0.2, 0.4), z + rnd(-0.4, 0.4), Math.cos(a) * s, up * rnd(0.6, 1.2), Math.sin(a) * s, c2 && i % 2 ? c2 : c, sz * rnd(0.7, 1.4), sz * rnd(0.5, 1), sz * rnd(0.7, 1.4), life * rnd(0.8, 1.2), smoke && i % 2 === 0 ? smoke : 0);
    }
  }

  const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const groundPool = [], groundLive = [];
  function ground(mode, x, z, r, color, opts = {}) {
    let g = groundPool.pop();
    if (!g) {
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: QUAD_VERT, fragmentShader: GROUND_FRAG,
        uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 }, uA: { value: 1 }, uTime: { value: 0 }, uMode: { value: 0 }, uSeed: { value: 0 } } });
      g = { mesh: new THREE.Mesh(flat, mat), u: mat.uniforms };
      g.mesh.renderOrder = 3; group.add(g.mesh);
    }
    if (mode === 3 || mode === 7) premul(g.mesh.material); else additive(g.mesh.material);
    g.mesh.visible = true; g.mesh.position.set(x, mode === 3 || mode === 7 ? 0.07 + groundLive.length * 0.0004 : 0.13, z); g.mesh.scale.set(r, 1, r);
    g.mesh.rotation.y = opts.rot || 0; g.mesh.renderOrder = mode === 3 || mode === 7 ? 2 : 3;
    g.u.uMode.value = mode; g.u.uColor.value.copy(color); g.u.uT.value = opts.heat ? 1 : 0; g.u.uA.value = opts.alpha ?? 1; g.u.uSeed.value = Math.random() * 50;
    g.age = 0; g.life = opts.life ?? 0; g.fade = opts.fade ?? 0; g.sweep = !!opts.sweep; g.alpha = opts.alpha ?? 1; g.heat = opts.heat || 0; g.r = r;
    groundLive.push(g);
    return g;
  }
  function release(g) { g.mesh.visible = false; const i = groundLive.indexOf(g); if (i >= 0) groundLive.splice(i, 1); groundPool.push(g); }
  const ring = (x, z, r, color, life = 0.45, alpha = 1) => ground(0, x, z, r, color, { life, sweep: true, alpha });
  // Old decals give way first so a long fight never piles up more than a few dozen.
  let decals = 0;
  function scorch(x, z, r, mode = 3, heat = 1.4, color = EMBER) {
    if (decals >= (low ? 8 : 24)) { const old = groundLive.find((g) => (g.u.uMode.value === 3 || g.u.uMode.value === 7) && g.life); if (old) { release(old); decals--; } }
    decals++;
    return ground(mode, x, z, r, color, { life: low ? 6 : 10, fade: 5, alpha: 0.55, heat, rot: Math.random() * 6.28 });
  }

  const lights = [];
  for (let i = 0; i < Q.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 18, 1.6); l.userData.t = 0; group.add(l); lights.push(l); }
  function flash(x, y, z, color, power, life = 0.22) {
    let best = null;
    for (const l of lights) if (!best || l.userData.t < best.userData.t) best = l;
    if (!best) return;
    best.position.set(x, y, z); best.color.copy(color); best.userData.t = life; best.userData.life = life; best.userData.p = power;
  }

  // Projectiles: one instanced quad per shot plus a soft shadow under it, so height reads on any ground.
  const SHOT_MAX = 220;
  const shotGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-0.5, 0, 0);
  const shotInfo = new THREE.InstancedBufferAttribute(new Float32Array(SHOT_MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  shotGeo.setAttribute('aShot', shotInfo);
  const shotMat = premul(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
    vertexShader: 'attribute vec4 aShot; varying vec2 vUv; varying vec3 vC; varying vec4 vI; void main() { vUv = vec2(uv.x, uv.y); vC = instanceColor; vI = aShot; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: SHOT_FRAG }));
  const shotMesh = new THREE.InstancedMesh(shotGeo, shotMat, SHOT_MAX);
  shotMesh.frustumCulled = false; shotMesh.renderOrder = 9; shotMesh.count = 0; shotMesh.setColorAt(0, WHITE);
  const shadowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), premul(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: QUAD_VERT,
    fragmentShader: 'varying vec2 vUv; void main() { vec2 p = vUv * 2.0 - 1.0; float a = (1.0 - smoothstep(0.0, 1.0, dot(p, p))) * 0.22; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }' })), SHOT_MAX);
  shadowMesh.frustumCulled = false; shadowMesh.renderOrder = 2; shadowMesh.count = 0;
  group.add(shadowMesh, shotMesh);
  const M = new THREE.Matrix4(), QT = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), col = new THREE.Color(), col2 = new THREE.Color();
  let nShots = 0, nLast = 0;
  // Impacts do not say whose shot it was; the shot drawn last frame nearest the impact does.
  const lastX = new Float32Array(SHOT_MAX), lastZ = new Float32Array(SHOT_MAX), lastK = new Int8Array(SHOT_MAX), lastT = new Int8Array(SHOT_MAX);
  function shotTeamNear(x, z, k) {
    let best = -1, bd = 25;
    for (let i = 0; i < nLast; i++) { if (lastK[i] !== k) continue; const d = (lastX[i] - x) ** 2 + (lastZ[i] - z) ** 2; if (d < bd) { bd = d; best = lastT[i]; } }
    return best;
  }
  function drawShot(look, x, y, z, dx, dz, color, seed, scale = 1) {
    if (nShots >= SHOT_MAX) return;
    const n = nShots++;
    QT.setFromAxisAngle(UP, -Math.atan2(dz, dx));
    S.set(look.len * scale, 1, look.wid * scale); P.set(x + dx * look.wid * 0.5 * scale, y, z + dz * look.wid * 0.5 * scale);
    shotMesh.setMatrixAt(n, M.compose(P, QT, S));
    shotMesh.setColorAt(n, color);
    shotInfo.setXYZW(n, look.k, look.len * scale, look.wid * scale, seed % 7);
    S.set(Math.min(1.6, look.len * 0.45) * scale, 1, look.wid * 0.45 * scale); P.set(x - dx * look.len * 0.15, 0.06, z - dz * look.len * 0.15);
    shadowMesh.setMatrixAt(n, M.compose(P, QT, S));
  }

  // Beams: pooled quads. kind 0 a power beam with lightning, 1 a charging telegraph, 2 a flowing tether.
  const beamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  const beamPool = [], beams = [];
  function beam(x0, z0, x1, z1, width, color, life, kind = 0, y = 1.5) {
    let b = beamPool.pop();
    if (!b) {
      const mat = additive(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: QUAD_VERT,
        uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 }, uTime: { value: 0 }, uLen: { value: 1 }, uKind: { value: 0 }, uSeed: { value: 0 } },
        fragmentShader: `uniform vec3 uColor; uniform float uA, uTime, uLen, uKind, uSeed; varying vec2 vUv;
          float h1(float x) { return fract(sin(x * 127.1 + uSeed) * 43758.5); }
          float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
          void main() {
            float y = vUv.y * 2.0 - 1.0, x = vUv.x * uLen, ends = smoothstep(0.0, 0.4, x) * (1.0 - smoothstep(uLen - 0.4, uLen, x));
            vec3 c; float a;
            if (uKind < 0.5) {
              float core = 1.0 - smoothstep(0.0, 0.16, abs(y)), halo = pow(1.0 - smoothstep(0.0, 1.0, abs(y)), 2.0);
              float arcs = 0.0;
              for (int i = 0; i < 3; i++) { float fi = float(i);
                float off = (n1(x * 0.9 + uTime * (14.0 + fi * 9.0) + fi * 31.0) - 0.5) * 1.3 + (n1(x * 3.5 - uTime * 25.0 + fi * 13.0) - 0.5) * 0.45;
                arcs += 1.0 - smoothstep(0.0, 0.05, abs(y - off)); }
              float fl = 0.8 + 0.2 * sin(x * 2.0 - uTime * 70.0);
              c = uColor * halo * 0.8 * fl + mix(uColor * 1.4, vec3(2.6), 0.5) * core + mix(uColor * 1.3, vec3(2.2), 0.3) * arcs; a = 1.0;
            } else if (uKind < 1.5) {
              float line = 1.0 - smoothstep(0.0, 0.3, abs(y)), dash = step(0.4, fract(x * 0.8 - uTime * 3.0));
              c = uColor * (line * (0.5 + 0.5 * dash) + (1.0 - abs(y)) * 0.15); a = 1.0;
            } else {
              float line = 1.0 - smoothstep(0.0, 0.5, abs(y)), flow = pow(0.5 + 0.5 * sin(x * 2.5 - uTime * 6.0), 6.0);
              c = uColor * line * (0.25 + flow * 0.9); a = 1.0;
            }
            gl_FragColor = vec4(c * uA * ends * a, 0.0);
          }` }));
      b = { mesh: new THREE.Mesh(beamGeo, mat), u: mat.uniforms };
      b.mesh.renderOrder = 9; group.add(b.mesh);
    }
    const len = Math.max(0.01, Math.hypot(x1 - x0, z1 - z0));
    b.mesh.visible = true; b.mesh.position.set(x0, y, z0); b.mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0); b.mesh.scale.set(len, 1, width);
    b.u.uColor.value.copy(color); b.u.uA.value = 1; b.u.uLen.value = len; b.u.uKind.value = kind; b.u.uSeed.value = Math.random() * 100;
    b.age = 0; b.life = life; b.power = kind === 0; b.width = width;
    beams.push(b);
    return b;
  }
  function endBeam(b) { b.mesh.visible = false; const i = beams.indexOf(b); if (i >= 0) beams.splice(i, 1); beamPool.push(b); }
  function aimBeam(b, x0, z0, x1, z1, y = b.mesh.position.y) {
    const len = Math.max(0.01, Math.hypot(x1 - x0, z1 - z0));
    b.mesh.position.set(x0, y, z0); b.mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0); b.mesh.scale.x = len; b.u.uLen.value = len;
  }

  // Respawn beam-in: a column of light that slams down, a scan ring rising through the mech, and a rune glyph.
  const colGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  const scanGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  const colPool = [], cols = [];
  function column(x, z, color, life, h = 14, r = 1.1) {
    let c = colPool.pop();
    if (!c) {
      const mat = additive(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 }, uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; varying float vF; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uColor; uniform float uA, uTime; varying vec2 vUv; varying float vF; void main() { float core = pow(vF, 3.0), edge = pow(1.0 - vF, 2.0) * 0.6; float scan = 0.75 + 0.25 * sin(vUv.y * 60.0 - uTime * 30.0); float fade = (1.0 - vUv.y) * smoothstep(0.0, 0.04, vUv.y + 0.02); gl_FragColor = vec4((uColor * (core * 1.8 + edge * 1.4) + vec3(0.8) * core * core) * scan * fade * uA, 0.0); }' }));
      const scan = new THREE.Mesh(scanGeo, additive(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, premultipliedAlpha: true })));
      c = { mesh: new THREE.Mesh(colGeo, mat), scan, u: mat.uniforms };
      c.mesh.renderOrder = 7; c.scan.renderOrder = 7; group.add(c.mesh, c.scan);
    }
    c.mesh.visible = c.scan.visible = true; c.mesh.position.set(x, 0, z); c.scan.position.set(x, 0, z);
    c.u.uColor.value.copy(color); c.scan.material.color.copy(color).multiplyScalar(1.2);
    c.age = 0; c.life = life; c.h = h; c.r = r;
    cols.push(c);
  }

  const domeGeo = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  function domeMaterial(color) {
    return additive(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: color }, uTime: { value: 0 }, uA: { value: 1 }, uHit: { value: new THREE.Vector3(1, 0, 0) }, uHitT: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uColor, uHit; uniform float uTime, uA, uHitT; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vV)), 1.8);
          vec2 h = vec2(atan(vP.z, vP.x) * 4.0, vP.y * 7.0 - uTime * 0.4);
          vec2 g = vec2(h.x * 1.1547, h.y + h.x * 0.57735);
          vec2 cell = fract(g) - 0.5, cell2 = fract(g + 0.5) - 0.5;
          float hex = 1.0 - smoothstep(0.0, 0.08, 0.5 - max(abs(cell.x), abs(cell.y)));
          float flowB = pow(0.5 + 0.5 * sin(vP.y * 10.0 - uTime * 3.0), 8.0);
          float base = 1.0 - smoothstep(0.0, 0.12, vP.y);
          float hd = distance(normalize(vP), normalize(uHit)), rip = uHitT * (1.0 - smoothstep(0.0, 0.12, abs(hd - (1.0 - uHitT) * 1.2))) + uHitT * (1.0 - smoothstep(0.0, 0.35, hd)) * 0.8;
          float a = (f * 0.75 + hex * 0.2 * (0.6 + f) + flowB * 0.08 + base * 0.8 + 0.04 + rip * 1.6) * uA;
          gl_FragColor = vec4((uColor * 0.95 + vec3(1.2) * rip) * a, 0.0);
        }` }));
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
    const glowM = new THREE.Mesh(g.glow, new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.6), toneMapped: false }));
    const chute = new THREE.Mesh(g.chute, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x333333 }));
    root.add(box, glowM, chute);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 9, 12, 1, true).translate(0, 4.5, 0), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: c.clone().multiplyScalar(1.4) }, uTime: { value: 0 } }, vertexShader: QUAD_VERT,
      fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main() { float a = (1.0 - vUv.y) * (1.0 - vUv.y) * (0.42 + 0.18 * pow(0.5 + 0.5 * sin(vUv.y * 18.0 - uTime * 5.0), 4.0)); gl_FragColor = vec4(uColor, a); }' }));
    pillar.visible = false; pillar.renderOrder = 7; root.add(pillar);
    return { root, chute, pillar, color: c, glow: glowM };
  }

  function explosion(x, z, r, tint, big, opts = {}) {
    const hot = tint === FIRE || tint === EMBER;
    glow(x, 1.2, z, WHITE, 0.1, r * 1.6, 0.6, K.GLOW, 1.4);
    glow(x, 1.0, z, tint, 0.3, r * 2.3, 0.5, K.GLOW, 1.2);
    glow(x, 1.3, z, WHITE, 0.09, r * 2.2, 1, K.STAR, 1.6);
    const nf = N((big ? 9 : 5) * Math.min(1.6, r / 2.2 + 0.4));
    if (hot) for (let i = 0; i < nf; i++) {
      const a = Math.random() * 6.283, d = Math.random() * r * 0.45, s = rnd(1, r * 1.7);
      ovr.emit(x + Math.cos(a) * d, rnd(0.6, 1.6), z + Math.sin(a) * d, Math.cos(a) * s, rnd(1.5, 4.5), Math.sin(a) * s, SMOKE, rnd(0.6, 0.95), r * rnd(0.45, 0.72), 2.0, 3.2, -2.2, 1, K.FIREBALL);
    } else for (let i = 0; i < nf; i++) { const a = Math.random() * 6.283; glow(x + Math.cos(a) * r * 0.3, rnd(0.6, 1.4), z + Math.sin(a) * r * 0.3, tint, rnd(0.3, 0.5), r * 0.7, 0.7, K.FLAME, 1.6, Math.cos(a) * r, rnd(1, 3), Math.sin(a) * r); }
    puffs(x, 1.1, z, N(big ? 5 : 3), hot ? SMOKE : FOG, r * 0.5, r * 0.9, big ? 2.4 : 1.7, r * 0.7, 2.6, 2.4, hot ? 0.6 : 0.35, K.SMOKE, 1.6, -0.5);
    sparks(x, 0.9, z, N(big ? 18 : 10), hot ? EMBER : tint, r * 7, 0.65, 0.07, 0.8, 18);
    if (!low || big) chunks(x, 0.6, z, N(big ? 4 : 2), METAL, r * 2.2, 8, 0.28, 2.6, 1.2, SOOT);
    for (let i = 0, n = N(10); i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.3; ovr.emit(x + Math.cos(a) * r * 0.35, 0.35, z + Math.sin(a) * r * 0.35, Math.cos(a) * r * 4, 0.6, Math.sin(a) * r * 4, dust, 0.8, r * 0.42, 2.6, 3.4, 0, 0.5, K.DUST); }
    ring(x, z, r * 1.4, hot ? SHOCK : tint, 0.32, 0.55);
    if (opts.scorch !== false) scorch(x, z, r * 0.95, 3, hot ? 1.3 : 0.6, hot ? EMBER : tint);
    flash(x, 1.8, z, hot ? FIRE : tint, big ? 70 : 38, 0.32);
    kick(x, z, big ? 0.6 : 0.32);
  }

  function kick(x, z, amount) {
    const m = G.match, me = m && m.units[G.me];
    const d = me ? Math.hypot(me.x - x, me.z - z) : 10;
    shake = Math.min(1.2, shake + amount * Math.max(0, 1 - d / 26));
  }

  // Lingering emitters: wreck smoke columns, burning ground. Fixed pool; the oldest is reused.
  const EMIT_MAX = 24, emitters = [];
  for (let i = 0; i < EMIT_MAX; i++) emitters.push({ on: false, x: 0, z: 0, y: 0, age: 0, life: 0, kind: 0, acc: 0, c: WHITE, r: 1 });
  function emitter(kind, x, z, life, y = 0.5, c = WHITE, r = 1) {
    let e = emitters[0];
    for (const o of emitters) { if (!o.on) { e = o; break; } if (o.age / o.life > e.age / e.life) e = o; }
    e.on = true; e.kind = kind; e.x = x; e.z = z; e.y = y; e.age = 0; e.life = life; e.acc = 0; e.c = c; e.r = r;
    return e;
  }
  function stepEmitters(dt) {
    for (const e of emitters) {
      if (!e.on) continue;
      e.age += dt; if (e.age >= e.life) { e.on = false; continue; }
      const k = 1 - e.age / e.life;
      e.acc += dt * (low ? 0.5 : 1);
      if (e.kind === 0) { // mech wreck: fire at the base early, a dark column of smoke that thins out
        while (e.acc > 0.06) {
          e.acc -= 0.06;
          ovr.emit(e.x + rnd(-0.5, 0.5), e.y + 0.4, e.z + rnd(-0.5, 0.5), rnd(-0.3, 0.3) + 0.4, rnd(2, 3.2), rnd(-0.3, 0.3) - 0.2, SOOT, rnd(1.8, 2.6), 0.8, 3.2, 0.9, -0.6, 0.42 * k + 0.08, K.SMOKE);
          if (e.age < 1.6) glow(e.x + rnd(-0.6, 0.6), e.y + rnd(0.1, 0.6), e.z + rnd(-0.6, 0.6), FIRE, rnd(0.3, 0.5), rnd(0.7, 1.1), 0.9 * (1 - e.age / 1.6), K.FLAME, 0.6, 0, rnd(1.5, 3), 0);
          if (Math.random() < 0.3 * k) str.emit(e.x + rnd(-0.5, 0.5), e.y + 0.4, e.z + rnd(-0.5, 0.5), rnd(-1, 1), rnd(3, 6), rnd(-1, 1), EMBER, rnd(0.6, 1.1), 0.04, 0.05, -1, 0.5, 1);
        }
      } else if (e.kind === 1) { // ruin: slow grey smoke and the odd ember
        while (e.acc > 0.16) {
          e.acc -= 0.16;
          const a = Math.random() * 6.283, d = Math.random() * e.r;
          ovr.emit(e.x + Math.cos(a) * d, e.y, e.z + Math.sin(a) * d, 0.3, rnd(1.2, 2.2), -0.15, SMOKE, rnd(2.2, 3.2), rnd(0.9, 1.4), 3, 0.6, -0.3, 0.35 * Math.min(1, k * 3), K.SMOKE);
          if (Math.random() < 0.25) glow(e.x + Math.cos(a) * d, e.y, e.z + Math.sin(a) * d, EMBER, 0.8, 0.18, 1, K.SPARK, 0.3, rnd(-0.2, 0.2), rnd(1, 2), rnd(-0.2, 0.2));
        }
      } else if (e.kind === 3) { // beam-in motes spiralling up
        while (e.acc > 0.03) { e.acc -= 0.03; const a = e.age * 9 + Math.random() * 0.6, d = e.r * (0.5 + 0.5 * k); str.emit(e.x + Math.cos(a) * d, rnd(0.1, 2.4), e.z + Math.sin(a) * d, -Math.sin(a) * 2, rnd(3, 6), Math.cos(a) * 2, e.c, rnd(0.3, 0.5), 0.06, 0.05, -1, 0.5, k); }
      } else if (e.kind === 2) { // burning patch
        while (e.acc > 0.05) { e.acc -= 0.05; const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * e.r; glow(e.x + Math.cos(a) * d, e.y, e.z + Math.sin(a) * d, e.c, rnd(0.35, 0.6), rnd(0.5, 0.9) * Math.min(1, k * 2 + 0.2), 0.8, K.FLAME, 0.4, 0, rnd(1.5, 3), 0); }
      }
    }
  }

  const towers = makeTowers(G, { group, chips, column, dustColor: () => dust, add, ovr, str, deb, glow, sparks, puffs, chunks, ground, release, ring, scorch, explosion, flash, kick, beam, endBeam, aimBeam, emitter, domeMaterial, domeGeo, rnd, N, low, TEAM_HDR, colors: { FIRE, EMBER, WHITE, SMOKE, SOOT, STONE, ARC, METAL } });

  function death(e, u) {
    const tc = TEAM_HDR[u.color], x = e.x, z = e.z;
    glow(x, 1.4, z, WHITE, 0.14, 5, 0.9, K.GLOW, 1.2);
    glow(x, 1.4, z, tc, 0.35, 6, 0.9, K.STAR, 1.4);
    explosion(x, z, 2.5, FIRE, true, { scorch: false });
    sparks(x, 1.4, z, N(14), tc, 13, 0.6, 0.08, 0.9, 12);
    chunks(x, 1.2, z, N(7), TEAM_PAINT[u.color], 6, 11, 0.42, 3.4, 1.4, METAL);
    deb.emit(x, 0.5, z, rnd(-1, 1), 3, rnd(-1, 1), SOOT, 1.4 * u.radius, 0.55, 1.2 * u.radius, 4.5, 3.5);
    for (let i = 0; i < N(12); i++) { const a = Math.random() * 6.283, s = rnd(4, 9); ovr.emit(x, 1.2, z, Math.cos(a) * s, rnd(4, 10), Math.sin(a) * s, METAL, rnd(0.8, 1.3), rnd(0.12, 0.22), 1, 0.4, 20, 1, K.CHIP); }
    ring(x, z, 5.5, tc, 0.55); ring(x, z, 3.2, WHITE, 0.3);
    scorch(x, z, 2.0, 3, 1.6);
    emitter(0, x, z, low ? 2.5 : 4);
    flash(x, 2, z, FIRE, 90, 0.45);
    kick(x, z, 0.8);
  }

  function respawn(e, u) {
    const tc = TEAM_HDR[u.color];
    column(e.x, e.z, tc.clone().multiplyScalar(0.5), 0.9, 13, 0.75);
    ground(9, e.x, e.z, 2.6, tc, { life: 1.8, sweep: true });
    emitter(3, e.x, e.z, 1.4, 0.1, tc, 1.3);
    ring(e.x, e.z, 3.4, tc, 0.5); ring(e.x, e.z, 1.8, WHITE, 0.25);
    glow(e.x, 1.2, e.z, WHITE, 0.25, 4, 1, K.STAR, 1.3);
    for (let i = 0; i < N(16); i++) { const a = Math.random() * 6.283, d = rnd(0.4, 1.6); str.emit(e.x + Math.cos(a) * d, rnd(0.1, 0.6), e.z + Math.sin(a) * d, 0, rnd(4, 9), 0, tc, rnd(0.4, 0.8), 0.06, 0.06, -2, 0.5, 1); }
    puffs(e.x, 0.3, e.z, N(6), dust, 0.8, 4, 0.7, 0.8, 2.4, 0.5, 0.45, K.DUST, 3.2);
    flash(e.x, 3, e.z, tc, 22, 0.4);
  }

  function impact(e, m) {
    const look = SHOT_LOOK[e.vis] || SHOT_LOOK.bullet, x = e.x, z = e.z, y = e.vis === 'tower' ? 2 : 1.5;
    if (e.splash) { explosion(x, z, e.splash, e.vis === 'frost' ? ICE : FIRE, e.splash > 2.5); return; }
    let tc = IMPACT_COLOR[e.vis];
    if (!tc) { const team = shotTeamNear(x, z, look.k); tc = team >= 0 ? TEAM_HDR[team] : FIRE; }
    const heavy = look.k === 2 || look.k === 8, bx = -(e.dx || 0), bz = -(e.dz || 0);
    if (e.on === 'end') { glow(x, y, z, tc, 0.14, 0.5, 0.8); sparks(x, y, z, 2, tc, 3, 0.25, 0.04, 0.3, 6, -bx, -bz, 0.4); return; }
    glow(x, y, z, WHITE, 0.08, heavy ? 2.4 : 1.1, 1, K.STAR, 1.5);
    glow(x, y, z, tc, 0.18, heavy ? 3 : 1.4, 0.8, K.GLOW, 1.3);
    if (e.on === 'unit') sparks(x, y, z, N(heavy ? 10 : 5), tc === WHITE ? GOLD : tc, heavy ? 12 : 8, 0.35, 0.06, 0.6, 14, bx, bz, 0.8);
    else if (e.on === 'wall') {
      sparks(x, y, z, N(4), EMBER, 7, 0.3, 0.05, 0.5, 16, bx, bz, 0.7);
      chips(x, y, z, N(4), STONE, 4, 0.7, 0.14);
      puffs(x + bx * 0.3, y - 0.2, z + bz * 0.3, N(2), STONE, 0.2, 1.2, 0.8, 0.5, 2.2, 0.8, 0.45, K.DUST, 2.5);
    } else if (e.on === 'prop') { chips(x, 1.0, z, N(5), WOOD, 4.5, 0.8, 0.16); puffs(x, 0.9, z, 1, dust, 0.2, 1, 0.7, 0.5, 2.2, 0.5, 0.4, K.DUST); }
    else if (e.on === 'dome') {
      sparks(x, y, z, N(6), ARC, 7, 0.3, 0.05, 0.4, 6, bx, bz, 0.9); ring(x, z, 1.1, ARC, 0.25);
      for (const [, v] of zoneViews) if (v.dome) { const dx = x - v.dome.position.x, dz = z - v.dome.position.z; if (Math.abs(Math.hypot(dx, dz) - v.dome.scale.x) < 1.5) { const un = v.dome.material.uniforms; un.uHit.value.set(dx, y, dz); un.uHitT.value = 1; } }
    }
    if (e.vis === 'frost') { for (let i = 0; i < N(6); i++) { const a = Math.random() * 6.283, s = rnd(3, 7); str.emit(x, y, z, Math.cos(a) * s, rnd(1, 4), Math.sin(a) * s, ICE, 0.4, 0.07, 0.04, 14, 1, 1); } chips(x, y, z, N(3), ICECHUNK, 3, 0.6, 0.12); }
    else if (e.vis === 'pulse') { ring(x, z, 1.4, ARC, 0.22); for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283; str.emit(x, y, z, Math.cos(a) * 1.2, rnd(-0.3, 0.3), Math.sin(a) * 1.2, ARC, 0.12, 0.05, 0, 0, 0, 1); } }
    else if (e.vis === 'rail') { flash(x, y, z, ARC, 24, 0.14); ring(x, z, 1.6, tc, 0.25); }
    else if (e.vis === 'tower') { ring(x, z, 2.4, tc, 0.3); sparks(x, y, z, N(10), tc, 10, 0.4, 0.08, 0.7, 10); flash(x, y, z, tc, 30, 0.2); kick(x, z, 0.25); }
  }

  const SKILL_FX = {
    shield: (u) => { ring(u.x, u.z, 2.4, TEAM_HDR[u.color], 0.4); sparks(u.x, 1, u.z, N(8), TEAM_HDR[u.color], 4, 0.4, 0.05, 1, 2); },
    dash: (u) => puffs(u.x, 0.3, u.z, N(6), dust, 0.6, 3, 0.7, 0.9, 2.2, 0.6, 0.5, K.DUST, 3),
    blink: (u) => { for (let i = 0; i < N(14); i++) glow(u.x + rnd(-0.8, 0.8), rnd(0.3, 2), u.z + rnd(-0.8, 0.8), VIOLET, 0.45, 0.4, 1, K.SPARK, 0.3, 0, rnd(0, 2), 0); ring(u.x, u.z, 1.8, VIOLET, 0.35); },
    buff: (u) => { sparks(u.x, 0.6, u.z, N(12), FIRE, 4, 0.5, 0.05, 1.5, -2); ring(u.x, u.z, 2.2, FIRE, 0.4); },
    nova: (u) => puffs(u.x, 0.3, u.z, N(5), dust, 0.8, 2.5, 0.8, 0.9, 2.2, 0.4, 0.4, K.DUST),
    beam: (u) => ring(u.x, u.z, 1.8, TEAM_HDR[u.color], 0.5),
    dome: (u) => ring(u.x, u.z, 6.2, TEAM_HDR[u.color], 0.6),
    zone: (u) => ring(u.x, u.z, 2.0, HEAL, 0.4),
  };

  function event(e, m) {
    const u = e.id !== undefined ? m.units[e.id] : null;
    switch (e.t) {
      case 'fire': {
        mechs.muzzle(u, e.side || 0, V);
        const c = TEAM_HDR[u.color], look = SHOT_LOOK[e.vis] || SHOT_LOOK.bullet, heavy = look.k === 1 || look.k === 2 || look.k === 4 || look.k === 9 || look.k === 5;
        const dx = Math.cos(e.a), dz = Math.sin(e.a);
        glow(V.x, V.y, V.z, WHITE, 0.06, heavy ? 1.5 : 0.9, 1, K.STAR, 1.2);
        glow(V.x + dx * 0.3, V.y, V.z + dz * 0.3, c, 0.1, heavy ? 1.6 : 0.8, 0.9, K.GLOW, 1.3);
        for (let i = 0; i < (heavy ? 5 : 2); i++) str.emit(V.x, V.y, V.z, dx * rnd(6, 14) + rnd(-2, 2), rnd(-0.5, 1), dz * rnd(6, 14) + rnd(-2, 2), c, rnd(0.06, 0.12), 0.06, 0.02, 0, 4, 1);
        if (heavy) { ovr.emit(V.x, V.y, V.z, dx * 2, 0.8, dz * 2, SMOKE, 0.6, 0.5, 2.6, 2, -0.5, 0.3, K.SMOKE); flash(V.x, V.y, V.z, c, 14, 0.1); }
        if (e.vis === 'rail') { ring(V.x, V.z, 1.2, c, 0.2); }
        if (e.id === G.me) shake = Math.min(1.2, shake + (heavy ? 0.16 : 0.035));
        break;
      }
      case 'impact': impact(e, m); break;
      case 'hit':
        if (e.absorbed > 0 && e.amt <= 0) sparks(e.x, 1.4, e.z, 4, ARC, 4, 0.25, 0.05, 0.5, 4);
        if (e.id === G.me) shake = Math.min(1.2, shake + Math.min(0.3, e.amt / 900));
        break;
      case 'explode':
        if (e.why === 'vent') {
          for (let i = 0; i < N(18); i++) { const a = Math.random() * 6.283, d = Math.random() * e.r * 0.5; ovr.emit(e.x + Math.cos(a) * d, 0.4, e.z + Math.sin(a) * d, Math.cos(a) * 1.2, rnd(7, 14), Math.sin(a) * 1.2, SMOKE, rnd(0.6, 1.0), rnd(0.9, 1.5), 2, 1.2, 2, 1, K.FIREBALL); }
          sparks(e.x, 0.5, e.z, N(12), EMBER, 6, 0.9, 0.06, 2.5, 8);
          ring(e.x, e.z, e.r * 1.2, FIRE, 0.4); scorch(e.x, e.z, e.r * 0.8, 3, 1.5); flash(e.x, 2, e.z, FIRE, 50, 0.4); kick(e.x, e.z, 0.35);
        } else explosion(e.x, e.z, e.r, e.why === 'mine' ? ARC : FIRE, e.why !== 'mine');
        break;
      case 'capture': if (e.team >= 0) { ring(e.x, e.z, 7, TEAM_HDR[e.team], 0.7); for (let i = 0; i < N(26); i++) { const a = Math.random() * 6.283, d = rnd(0, 6); str.emit(e.x + Math.cos(a) * d, 0.2, e.z + Math.sin(a) * d, 0, rnd(5, 10), 0, TEAM_HDR[e.team], rnd(0.6, 1), 0.07, 0.05, -2, 0.4, 1); } column(e.x, e.z, TEAM_HDR[e.team], 1.2, 12, 1.6); } break;
      case 'towerFire': case 'towerHit': case 'towerBlock': case 'towerDown': towers.event(e, m); break;
      case 'ventWarn': ground(1, e.x, e.z, e.r, VENT, { life: RULES.vent.warn, sweep: true }); break;
      case 'nova': {
        const ice = u && u.def.weapon.vis === 'frost', spin = u && u.def.weapon.vis === 'pellet', c = ice ? ICE : spin ? TEAM_HDR[u.color] : FIRE;
        ring(e.x, e.z, e.r, c, 0.5); ring(e.x, e.z, e.r * 0.65, c, 0.3, 0.5);
        if (spin) {
          for (let i = 0, n = N(16); i < n; i++) { const a = (i / n) * 6.283, rr = rnd(1, e.r); str.emit(e.x + Math.cos(a) * rr, 1.1, e.z + Math.sin(a) * rr, -Math.sin(a) * 1.4, 0, Math.cos(a) * 1.4, c, 0.18, 0.08, 0, 0, 0, 1); }
          sparks(e.x, 1.1, e.z, N(10), GOLD, 11, 0.35, 0.05, 0.3, 12);
        } else {
          scorch(e.x, e.z, e.r * 0.8, 7, ice ? 0.9 : 1.2, ice ? ICE : EMBER);
          for (let i = 0, n = N(22); i < n; i++) { const a = (i / n) * 6.283; ovr.emit(e.x + Math.cos(a) * 1.2, 0.4, e.z + Math.sin(a) * 1.2, Math.cos(a) * e.r * 1.6, 1.2, Math.sin(a) * e.r * 1.6, ice ? ICECHUNK : dust, 0.9, 1.2, 2.4, 3, 0, 0.55, K.DUST); }
          chunks(e.x, 0.4, e.z, N(4), ice ? ICECHUNK : STONE, 5, 9, 0.3, 2.5, 0);
          chips(e.x, 0.5, e.z, N(10), ice ? ICECHUNK : STONE, 7, 0.9, 0.16);
          if (ice) for (let i = 0; i < N(12); i++) { const a = Math.random() * 6.283, d = rnd(0.5, e.r); str.emit(e.x + Math.cos(a) * d, 0.1, e.z + Math.sin(a) * d, 0, rnd(4, 7), 0, ICE, 0.4, 0.09, 0.05, 10, 0.5, 1); }
        }
        flash(e.x, 2, e.z, c, 70, 0.3); kick(e.x, e.z, spin ? 0.35 : 0.9);
        break;
      }
      case 'beam': {
        const tc = TEAM_HDR[u.color], dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1;
        beam(e.x0, e.z0, e.x1, e.z1, e.w * 3, tc, 0.55, 0);
        const n = Math.round(L / (low ? 2.5 : 1.3));
        for (let i = 0; i <= n; i++) {
          const t = i / Math.max(1, n), px = e.x0 + dx * t, pz = e.z0 + dz * t;
          sparks(px, 1.5, pz, 1, tc, 6, 0.45, 0.06, 0.6, 6, -dz / L * (i % 2 ? 1 : -1), dx / L * (i % 2 ? 1 : -1), 0.4);
          if (!low && i % 3 === 1) scorch(px, pz, 1.1, 3, 1.2, tc);
        }
        glow(e.x1, 1.5, e.z1, WHITE, 0.3, 5, 1, K.STAR, 1.4); glow(e.x0, 1.5, e.z0, tc, 0.3, 3, 1, K.STAR, 1.3);
        ring(e.x1, e.z1, 3, tc, 0.4);
        flash(e.x1, 1.6, e.z1, tc, 60, 0.35); flash(e.x0, 1.6, e.z0, WHITE, 30, 0.2); kick(e.x0, e.z0, 0.7);
        break;
      }
      case 'death': death(e, u); break;
      case 'respawn': respawn(e, u); break;
      case 'heal': for (let i = 0; i < 3; i++) glow(e.x + rnd(-0.8, 0.8), rnd(0.5, 1.6), e.z + rnd(-0.8, 0.8), HEAL, 0.8, 0.3, 1, K.SPARK, 0.6, 0, rnd(1.5, 3), 0); break;
      case 'item': ring(u.x, u.z, 2, HEAL, 0.5); break;
      case 'turretFire': glow(e.x + Math.cos(e.a) * 0.9, 1.1, e.z + Math.sin(e.a) * 0.9, WHITE, 0.06, 0.7, 1, K.STAR); for (let i = 0; i < 2; i++) str.emit(e.x + Math.cos(e.a), 1.1, e.z + Math.sin(e.a), Math.cos(e.a) * rnd(5, 10), rnd(0, 1), Math.sin(e.a) * rnd(5, 10), TEAM_HDR[u.color], 0.08, 0.05, 0.02, 0, 4, 1); break;
      case 'zoneEnd':
        if (e.kind === 'wall') { sparks(e.x, 1.0, e.z, N(18), ICE, 7, 0.6, 0.07, 1, 12); chips(e.x, 1, e.z, N(10), ICECHUNK, 5, 0.9, 0.2); }
        else if (e.kind === 'turret') explosion(e.x, e.z, 1.4, FIRE, false);
        break;
      case 'skill': { const fn = SKILL_FX[u.def.skills[e.slot].do]; if (fn && visibleTo(m, u, m.units[G.me].team)) fn(u); break; }
      case 'ram': sparks(e.x, 1.2, e.z, N(14), FIRE, 9, 0.35, 0.07, 0.8, 12); glow(e.x, 1.2, e.z, WHITE, 0.08, 2, 1, K.STAR); ring(e.x, e.z, 2.4, WHITE, 0.3); kick(e.x, e.z, 0.5); break;
      case 'shieldBreak': sparks(e.x, 1.3, e.z, N(18), ARC, 8, 0.5, 0.06, 1, 8); ring(e.x, e.z, 2.6, ARC, 0.35); glow(e.x, 1.3, e.z, ARC, 0.2, 3, 1, K.STAR); break;
      case 'propHit': chips(e.x, 0.9, e.z, 3, WOOD, 3, 0.6, 0.14); break;
      case 'propBreak': {
        const c = e.kind === 'pot' ? CLAY : e.kind === 'crate' ? WOOD : STONE;
        chunks(e.x, 0.6, e.z, N(5), c, 4, 6, 0.3, 2.4, 0);
        chips(e.x, 0.8, e.z, N(12), c, 6, 0.9, 0.2);
        puffs(e.x, 0.6, e.z, N(4), dust, 0.6, 2.5, 0.9, 0.9, 2.2, 0.4, 0.5, K.DUST);
        break;
      }
      case 'crateLand': puffs(e.x, 0.3, e.z, N(10), dust, 0.6, 5, 0.9, 1.0, 2.2, 0.4, 0.55, K.DUST, 3); ring(e.x, e.z, 3.4, WHITE, 0.4, 0.7); chips(e.x, 0.3, e.z, N(6), dust, 4, 0.7, 0.14); kick(e.x, e.z, 0.2); break;
      case 'pickup': {
        const c = col.set(PICKUPS[e.type].color).multiplyScalar(2);
        ring(e.x, e.z, 3, c, 0.5); glow(e.x, 1, e.z, c, 0.3, 3, 1, K.STAR, 1.3);
        for (let i = 0; i < N(18); i++) { const a = Math.random() * 6.283, d = rnd(0.2, 1.2); str.emit(e.x + Math.cos(a) * d, rnd(0.2, 1), e.z + Math.sin(a) * d, Math.cos(a) * 0.5, rnd(3, 7), Math.sin(a) * 0.5, c, rnd(0.4, 0.8), 0.06, 0.05, -1, 1, 1); }
        column(e.x, e.z, c, 0.6, 8, 0.8);
        break;
      }
    }
  }

  function syncShots(m, alpha, dt) {
    for (const s of m.shots) {
      const look = SHOT_LOOK[s.vis] || SHOT_LOOK.bullet, x = s.px + (s.x - s.px) * alpha, z = s.pz + (s.z - s.pz) * alpha;
      let y = 1.5, tc = TEAM_HDR[s.color];
      if (s.vis === 'tower') { const t = m.towers[s.tower]; y = t ? Math.max(2, towers.crystalY(t) - Math.hypot(x - t.x, z - t.z) * 0.45) : 2.4; }
      if (nShots < SHOT_MAX) { lastX[nShots] = x; lastZ[nShots] = z; lastK[nShots] = look.k; lastT[nShots] = s.color; }
      drawShot(look, x, y, z, s.dx, s.dz, tc, s.id);
      const bx = x - s.dx * 0.6, bz = z - s.dz * 0.6, f = Math.min(1, dt * 60);
      switch (look.trail) {
        case 'fire':
          glow(bx, y, bz, FIRE, 0.18, 0.5, 0.9, K.FLAME, 0.4, rnd(-0.4, 0.4), rnd(-0.2, 0.5), rnd(-0.4, 0.4));
          if (Math.random() < 0.7 * f) ovr.emit(bx - s.dx * 0.4, y, bz - s.dz * 0.4, rnd(-0.3, 0.3), 0.5, rnd(-0.3, 0.3), SMOKE, 0.7, 0.35, 3, 1, -0.6, 0.35, K.SMOKE);
          break;
        case 'spark': if (Math.random() < 0.8 * f) glow(bx, y, bz, tc, 0.22, 0.4, 0.8, K.SPARK, 0.3, rnd(-0.6, 0.6), rnd(-0.2, 0.5), rnd(-0.6, 0.6)); break;
        case 'ice': if (Math.random() < 0.7 * f) glow(bx + rnd(-0.2, 0.2), y + rnd(-0.2, 0.2), bz + rnd(-0.2, 0.2), ICE, 0.35, 0.18, 1, K.SPARK, 0.4, 0, -0.5, 0); break;
        case 'arc': if (Math.random() < 0.3 * f) { const a = Math.random() * 6.283; str.emit(x, y, z, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, tc, 0.08, 0.035, 0, 0, 0, 1); } break;
        case 'line': str.emit(x, y, z, s.dx * s.speed * dt * 1.2, 0, s.dz * s.speed * dt * 1.2, tc, 0.32, 0.1, 0, 0, 0, 0.8); break;
        case 'tower':
          str.emit(x, y, z, s.dx * s.speed * dt * 1.2, 0, s.dz * s.speed * dt * 1.2, tc, 0.25, 0.22, 0, 0, 0, 0.8);
          if (Math.random() < 0.8 * f) glow(bx, y, bz, tc, 0.3, 0.7, 0.8, K.SPARK, 0.2, rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1));
          break;
      }
    }
  }

  function syncZones(m, dt) {
    const myTeam = m.units[G.me].team;
    for (const z of m.zones) {
      let v = zoneViews.get(z.id);
      const foe = z.team !== myTeam, tc = TEAM_HDR[z.color];
      if (!v) {
        v = { seen: 0 };
        if (z.kind === 'strike') v.g = ground(1, z.x, z.z, z.r, foe ? C(2.2, 0.25, 0.12) : C(0.3, 1.0, 1.8), { alpha: foe ? 1 : 0.5 });
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
      v.seen = frame;
      if (z.kind === 'strike') {
        const k = 1 - z.delay / z.total;
        v.g.u.uT.value = k;
        if (z.lob) {
          const px = z.x0 + (z.x - z.x0) * k, pz = z.z0 + (z.z - z.z0) * k, py = 1.6 + Math.sin(k * Math.PI) * 8, ddx = z.x - z.x0, ddz = z.z - z.z0, L = Math.hypot(ddx, ddz) || 1;
          drawShot(SHOT_LOOK.mortar, px, py, pz, ddx / L, ddz / L, col.copy(TEAM_HDR[z.color]).lerp(FIRE, 0.4), z.id, 1);
          glow(px, py, pz, FIRE, 0.25, 0.6, 0.7, K.FLAME, 0.4);
          if (Math.random() < 0.5) ovr.emit(px, py, pz, 0, 0.3, 0, SMOKE, 0.6, 0.3, 2.5, 1, 0, 0.3, K.SMOKE);
        } else if (z.delay < 0.4) {
          const d = z.delay, hx = z.x + d * 6, hy = 0.8 + d * 55, hz = z.z - d * 8;
          glow(hx, hy, hz, WHITE, 0.04, 0.9, 1, K.GLOW, 1);
          str.emit(hx, hy, hz, -0.7, -6.5, 0.95, FIRE, 0.05, 0.16, 0, 0, 0, 0.8);
          str.emit(hx, hy, hz, -0.3, -2.5, 0.4, foe ? DANGER : tc, 0.05, 0.35, 0, 0, 0, 0.5);
        }
      } else if (z.kind === 'mine') {
        v.g.u.uT.value = z.delay > 0 ? 0 : 1;
        if (!foe && Math.sin(time * 9 + z.id) > 0.97) glow(z.x, 0.25, z.z, ARC, 0.08, 0.5, 0.8, K.STAR);
      } else if (z.kind === 'field') {
        v.g.u.uA.value = Math.min(1, z.age * 4, (z.dur - z.age) * 3);
        const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * z.r, px = z.x + Math.cos(a) * d, pz = z.z + Math.sin(a) * d;
        if (z.vis === 'smoke') { for (let i = 0; i < 2; i++) if (z.dur - z.age > 0.8) ovr.emit(px, rnd(0.6, 2.2), pz, rnd(-0.4, 0.4), 0.3, rnd(-0.4, 0.4), FOG, 1.6, 2.6, 1.5, 0, 0, 0.32, K.SMOKE); }
        else if (z.vis === 'blizzard') { for (let i = 0; i < (low ? 2 : 4); i++) str.emit(px + 2, rnd(3, 6), pz - 1, -5, -9, 2.5, ICE, 0.55, 0.05, 0.03, 0, 0, 0.9); if (Math.random() < 0.3) ovr.emit(px, 0.4, pz, -1, 0.2, 0.5, ICECHUNK, 1, 1.2, 2, 1, 0, 0.25, K.DUST); }
        else if (z.vis === 'magnet') { const t = 0.4; str.emit(px, 0.8, pz, (z.x - px) * 2.2 + (pz - z.z) * 1.4, 0.4, (z.z - pz) * 2.2 - (px - z.x) * 1.4, VIOLET, t, 0.05, 0.05, 0, 0, 1); }
        else if (Math.random() < dt * 18) glow(px, 0.2, pz, z.vis === 'heal' ? HEAL : VIOLET, 0.9, 0.26, 1, K.SPARK, 0.4, 0, z.vis === 'heal' ? 2.4 : 0.8, 0);
      } else if (z.kind === 'dome') {
        const k = Math.min(1, z.age * 3.5), out = Math.min(1, (z.dur - z.age) * 3), un = v.dome.material.uniforms;
        v.dome.scale.setScalar(z.r * (0.2 + 0.8 * k * (2 - k)));
        un.uTime.value = time; un.uA.value = out; un.uHitT.value = Math.max(0, un.uHitT.value - dt * 3);
        v.g.u.uA.value = out * 0.7;
      } else if (z.kind === 'wall') {
        const k = Math.min(1, z.age * 5), out = Math.min(1, (z.dur - z.age) * 4);
        v.obj.scale.y = Math.max(0.01, k * (2 - k) * out);
      } else if (z.kind === 'turret') {
        v.obj.children[1].rotation.y = -z.aim;
        v.obj.scale.setScalar(Math.min(1, 0.2 + z.age * 4));
      }
    }
    for (const [id, v] of zoneViews) if (v.seen !== frame) { if (v.g) release(v.g); if (v.dome) { group.remove(v.dome); v.dome.material.dispose(); } if (v.obj) group.remove(v.obj); zoneViews.delete(id); }
  }

  function syncCrates(m, dt) {
    for (const c of m.crates) {
      let v = crateViews.get(c.id);
      if (!v) { v = crateModel(c.type); v.mark = ground(1, c.x, c.z, 2.2, v.color.clone().multiplyScalar(1.6), { alpha: 0.6 }); v.fold = 1; group.add(v.root); crateViews.set(c.id, v); }
      v.seen = frame;
      const k = Math.max(0, c.fall) / RULES.crate.fall;
      v.root.position.set(c.x + Math.sin(time * 1.3 + c.id) * 0.5 * k, k * 24, c.z);
      v.root.rotation.z = Math.sin(time * 1.7 + c.id) * 0.12 * k;
      if (c.fall <= 0) {
        if (v.mark.u.uMode.value !== 6) { v.mark.u.uMode.value = 6; }
        v.fold = Math.max(0, v.fold - dt * 2.5);
        v.root.rotation.y += dt * 0.6;
        v.root.position.y = 0.12 + Math.sin(time * 2.4 + c.id) * 0.1;
        v.pillar.visible = true; v.pillar.material.uniforms.uTime.value = time;
        v.glow.material.color.copy(v.color).multiplyScalar(2.2 + Math.sin(time * 4 + c.id) * 0.8);
        if (Math.random() < dt * 8) glow(c.x + rnd(-0.8, 0.8), 0.3, c.z + rnd(-0.8, 0.8), v.color, 1, 0.22, 1, K.SPARK, 0.4, 0, rnd(1.5, 3), 0);
      } else v.mark.u.uT.value = 1 - k;
      v.chute.visible = v.fold > 0.02; v.chute.scale.set(v.fold, 0.4 + 0.6 * v.fold, v.fold);
      v.mark.u.uA.value = c.fall > 0 ? 0.6 : 0.45;
    }
    for (const [id, v] of crateViews) if (v.seen !== frame) { group.remove(v.root); release(v.mark); crateViews.delete(id); }
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
      if (Math.abs(p.prog) > 0.01 && Math.abs(p.prog) < 1 && Math.random() < 0.3) { const a = Math.random() * 6.283; glow(p.x + Math.cos(a) * p.r * 0.95, 0.2, p.z + Math.sin(a) * p.r * 0.95, p.prog < 0 ? TEAM_HDR[0] : TEAM_HDR[1], 0.6, 0.25, 1, K.SPARK, 0.3, 0, 2.5, 0); }
    });
  }
  function clearPoints() { for (const v of pointViews) { release(v.rim); release(v.fill); group.remove(v.beacon); v.beacon.material.dispose(); } pointViews.length = 0; }

  const casts = new Map();
  function syncCasts(m) {
    const myTeam = m.units[G.me].team;
    for (const u of m.units) {
      if (!u.alive || !u.cast || !visibleTo(m, u, myTeam)) continue;
      const s = u.cast.skill, k = 1 - u.cast.t / u.cast.total, foe = u.team !== myTeam;
      let v = casts.get(u.id);
      if (!v) {
        v = { seen: 0 };
        if (s.do === 'nova') v.g = ground(1, u.x, u.z, s.radius, foe ? C(2.2, 0.3, 0.1) : C(1.8, 1.1, 0.3));
        else v.b = beam(u.x, u.z, u.x + Math.cos(u.cast.aim) * s.range, u.z + Math.sin(u.cast.aim) * s.range, 0.6, foe ? C(2.2, 0.3, 0.2) : TEAM_HDR[u.color], 99, 1);
        casts.set(u.id, v);
      }
      v.seen = frame;
      if (v.g) { v.g.mesh.position.x = u.x; v.g.mesh.position.z = u.z; v.g.u.uT.value = k; }
      if (v.b) {
        aimBeam(v.b, u.x, u.z, u.x + Math.cos(u.cast.aim) * s.range, u.z + Math.sin(u.cast.aim) * s.range, 1.5);
        v.b.mesh.scale.z = 0.3 + k * 1.2; v.b.u.uA.value = 0.4 + k * 0.9;
        if (Math.random() < 0.7) { const a = Math.random() * 6.283; str.emit(u.x + Math.cos(a) * 2.4, 1.5 + rnd(-0.6, 0.8), u.z + Math.sin(a) * 2.4, -Math.cos(a) * 7, 0, -Math.sin(a) * 7, TEAM_HDR[u.color], 0.3, 0.05, 0.04, 0, 0, 1); }
        if (Math.random() < 0.5) glow(u.x + Math.cos(u.cast.aim) * 1.5, 1.5, u.z + Math.sin(u.cast.aim) * 1.5, TEAM_HDR[u.color], 0.1, 0.6 + k * 1.6, 0.8, K.GLOW);
      }
    }
    for (const [id, v] of casts) if (v.seen !== frame) { if (v.g) release(v.g); if (v.b) endBeam(v.b); casts.delete(id); }
  }

  function unitTrails(m, dt) {
    const myTeam = m.units[G.me].team;
    for (const u of m.units) {
      if (!u.alive || !visibleTo(m, u, myTeam)) continue;
      const sp = Math.hypot(u.x - u.px, u.z - u.pz) * 30;
      if (!u.def.hover && sp > 2 && Math.random() < dt * sp * 1.6) ovr.emit(u.x + rnd(-0.5, 0.5), 0.2, u.z + rnd(-0.5, 0.5), rnd(-0.5, 0.5), 0.7, rnd(-0.5, 0.5), dust, 0.8, 0.7, 2.2, 0, 0, 0.3, K.DUST);
      if (u.dash) glow(u.x, 1.0, u.z, TEAM_HDR[u.color], 0.25, 1.6, 0.5, K.GLOW, 0.2);
      if (u.hasteT > 0 && Math.random() < dt * 20) glow(u.x + rnd(-0.6, 0.6), 0.4, u.z + rnd(-0.6, 0.6), ARC, 0.4, 0.28, 1, K.SPARK, 0.3, 0, 1, 0);
      if (u.dmgT > 0 && Math.random() < dt * 20) glow(u.x + rnd(-0.7, 0.7), rnd(0.6, 1.8), u.z + rnd(-0.7, 0.7), FIRE, 0.45, 0.26, 1, K.FLAME, 0.3, 0, 2, 0);
      if (u.slowT > 0 && Math.random() < dt * 14) glow(u.x + rnd(-0.8, 0.8), 0.3, u.z + rnd(-0.8, 0.8), VIOLET, 0.5, 0.3, 1, K.SPARK, 0.3, 0, 0.5, 0);
      if (u.stunT > 0 && Math.random() < dt * 30) { const a = time * 9 + Math.random(); glow(u.x + Math.cos(a) * 0.9, 2.5, u.z + Math.sin(a) * 0.9, GOLD, 0.3, 0.28, 1, K.STAR, 0.3, 0, 0.2, 0); }
      if (u.healT > 0 && Math.random() < dt * 16) glow(u.x + rnd(-0.7, 0.7), 0.5, u.z + rnd(-0.7, 0.7), HEAL, 0.7, 0.28, 1, K.SPARK, 0.3, 0, 2.6, 0);
      // A badly damaged mech smokes, so low health reads without looking at bars.
      if (u.hp < u.maxHp * 0.3 && Math.random() < dt * (low ? 3 : 7)) ovr.emit(u.x + rnd(-0.4, 0.4), 1.6, u.z + rnd(-0.4, 0.4), 0.2, 1.6, -0.1, SMOKE, 1.0, 0.45, 2.6, 1, -0.4, 0.4, K.SMOKE);
    }
  }

  function update(m, alpha, dt, t) {
    time = t; frame++;
    nShots = 0;
    if (m) {
      const th = G.gfx.world && G.gfx.world.theme;
      dust = (th && GROUND_DUST[th.base]) || DUST;
      syncShots(m, alpha, dt); syncZones(m, dt); syncCrates(m, dt); syncCasts(m); unitTrails(m, dt); syncPoints(m); towers.sync(m, dt, time);
      if (th && th.fireflies && Math.random() < dt * 14) { const f = G.camera.position; add.emit(f.x + rnd(-22, 22), rnd(0.6, 2.6), f.z - 22 + rnd(-16, 14), rnd(-0.6, 0.6), rnd(-0.1, 0.3), rnd(-0.6, 0.6), FIREFLY, rnd(1.5, 3), 0.16, 1, 0, 0, 0.9, K.SPARK); }
      for (const h of m.map.hazards) if (h.kind === 'lava' && Math.random() < dt * 3) { const a = Math.random() * 6.283, d = Math.random() * h.r; glow(h.x + Math.cos(a) * d, 0.2, h.z + Math.sin(a) * d, EMBER, 1.2, 0.2, 1, K.SPARK, 0.3, rnd(-0.3, 0.3), rnd(1, 3), rnd(-0.3, 0.3)); }
    }
    shotMesh.count = shadowMesh.count = nShots; nLast = Math.min(nShots, m ? m.shots.length : 0);
    shotMesh.instanceMatrix.needsUpdate = true; shadowMesh.instanceMatrix.needsUpdate = true; shotInfo.needsUpdate = true;
    if (shotMesh.instanceColor) shotMesh.instanceColor.needsUpdate = true;
    shotMat.uniforms.uTime.value = t;
    for (let i = groundLive.length - 1; i >= 0; i--) {
      const g = groundLive[i];
      g.u.uTime.value = t;
      if (!g.life) continue;
      g.age += dt;
      if (g.sweep) g.u.uT.value = 1 - Math.pow(1 - Math.min(1, g.age / g.life), 2.2);
      if (g.heat) g.u.uT.value = g.heat * Math.max(0, 1 - g.age / 2.2);
      if (g.fade) g.u.uA.value = g.alpha * Math.min(1, (g.life - g.age) / g.fade);
      if (g.age >= g.life) { if (g.u.uMode.value === 3 || g.u.uMode.value === 7) decals--; release(g); }
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i]; b.age += dt;
      b.u.uTime.value = t;
      if (b.power) { const k = 1 - b.age / b.life, pop = Math.min(1, b.age * 25); b.u.uA.value = Math.min(1.6, k * 2) * pop; b.mesh.scale.z = b.width * (0.3 + 0.7 * k) * (0.6 + 0.4 * pop); }
      if (b.age >= b.life) endBeam(b);
    }
    for (let i = cols.length - 1; i >= 0; i--) {
      const c = cols[i]; c.age += dt;
      const k = c.age / c.life, slam = Math.min(1, c.age / 0.12);
      c.mesh.scale.set(c.r * (0.3 + 0.9 * Math.min(1, k * 3)) * (1 - k * 0.4), c.h * slam, c.r * (0.3 + 0.9 * Math.min(1, k * 3)) * (1 - k * 0.4));
      c.mesh.position.y = c.h * (1 - slam) * 0.6;
      c.u.uA.value = (1 - k) * (1 - k) * 1.6; c.u.uTime.value = t;
      const sy = Math.min(1, k * 2.2);
      c.scan.position.y = 0.1 + sy * 2.6; c.scan.scale.setScalar(1.6 - sy * 0.5); c.scan.material.opacity = (1 - sy) * 1.0;
      if (c.age >= c.life) { c.mesh.visible = c.scan.visible = false; cols.splice(i, 1); colPool.push(c); }
    }
    for (const l of lights) { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = l.userData.p * Math.max(0, l.userData.t / l.userData.life); } else l.intensity = 0; }
    stepEmitters(dt);
    add.update(dt); ovr.update(dt); str.update(dt); deb.update(dt);
    shake = Math.max(0, shake - dt * 2.6);
  }

  function clear() {
    for (const [, v] of zoneViews) { if (v.g) release(v.g); if (v.dome) group.remove(v.dome); if (v.obj) group.remove(v.obj); }
    zoneViews.clear();
    for (const [, v] of crateViews) { group.remove(v.root); release(v.mark); }
    crateViews.clear();
    for (const [, v] of casts) { if (v.g) release(v.g); if (v.b) endBeam(v.b); }
    casts.clear();
    clearPoints(); towers.clear();
    while (groundLive.length) release(groundLive[0]);
    while (beams.length) endBeam(beams[0]);
    for (const e of emitters) e.on = false;
    decals = 0; deb.clear();
    shotMesh.count = shadowMesh.count = 0;
  }

  const setPointScale = (h, fovDeg) => { const s = h / (2 * Math.tan(fovDeg * Math.PI / 360)); add.mat.uniforms.uScale.value = s; ovr.mat.uniforms.uScale.value = s; };

  return { group, event, update, clear, setPointScale, get shake() { return shake; }, ring, explosion };
}
