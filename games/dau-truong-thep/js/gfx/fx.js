// Effects: projectiles, particles, debris, ground decals and telegraphs, zones, beams, deaths and respawns, airdrop crates, flashes, camera shake.
// Reads match state and sim events. Never writes to the match.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { TEAMS, PICKUPS, RULES } from '../data.js';
import { visibleTo, orbPos } from '../sim.js';
import { makePoints, makeStreaks, makeDebris, premul, additive, K } from './fxkit.js';
import { makeTowers } from './towers.js';
import { LOOKS, lookRow, lookOf } from './looks.js';
import { burst } from './lookkit.js';

const TEAM_HDR = [new THREE.Color(0.3, 0.88, 1.85), new THREE.Color(1.95, 0.6, 0.2)];
const C = (r, g, b) => new THREE.Color(r, g, b);
const FIRE_N = C(1, 0.62, 0.3), FIRE = C(2.2, 1.0, 0.25), EMBER = C(1.9, 0.55, 0.1), WHITE = C(2, 2, 2), SMOKE = C(0.16, 0.15, 0.14), SOOT = C(0.07, 0.065, 0.06), DUST = C(0.42, 0.36, 0.27),
  HEAL = C(0.35, 1.9, 0.5), ICE = C(0.9, 1.6, 2.2), FOG = C(0.62, 0.64, 0.66), ARC = C(0.5, 1.2, 2.4), VIOLET = C(1.2, 0.5, 2.2), WOOD = C(0.4, 0.26, 0.12), CLAY = C(0.55, 0.3, 0.18), STONE = C(0.5, 0.47, 0.4),
  METAL = C(0.22, 0.23, 0.25), ICECHUNK = C(0.75, 0.9, 1.0), GOLD = C(2.2, 1.9, 0.4), SHOCK = C(2.2, 1.6, 1.0), FIREFLY = C(1.6, 2.2, 0.5), DANGER = C(2.2, 0.4, 0.2), VENT = C(2.2, 0.5, 0.1),
  HOLO = C(0.5, 1.7, 2.3), RED = C(2.4, 0.22, 0.12), RALLY = C(1.5, 2.1, 0.45), CAGE = C(1.0, 1.5, 1.2);
const FX_TIME = { value: 0 };
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
  howitzer: { k: 10, len: 3.4, wid: 2.1, trail: 'smoke' },
  sabot: { k: 11, len: 9, wid: 0.8, trail: 'sabot' },
  slug: { k: 12, len: 2.0, wid: 1.1, trail: 'spark' },
  hook: { k: 13, len: 2.6, wid: 1.6, chain: true },
  wave: { k: 14, len: 3.2, wid: 2.8, trail: 'wave' },
  flame: { k: 15, len: 1, wid: 1, skip: true },
  dart: { k: 16, len: 2.2, wid: 0.5, trail: 'dart' },
  disc: { k: 17, len: 2.4, wid: 1.1, trail: 'disc' },
};
const IMPACT_COLOR = { frost: ICE, pulse: ARC, rail: WHITE, tower: WHITE, flame: FIRE };

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
    } else if (k > 9.5) {
      float kk = k - 10.0; vec2 o = q - vec2(hx, 0.0); d = length(o);
      if (kk < 0.5) {
        float bx = hx - 1.0; d = seg(q, vec2(bx, 0.0), vec2(hx - 0.22, 0.0));
        float body = 1.0 - smoothstep(0.22, 0.26, d), nose = exp(-dot(o + vec2(0.1, 0.0), o + vec2(0.1, 0.0)) / 0.03);
        float band = step(abs(q.x - (bx + 0.3)), 0.07) * body, band2 = step(abs(q.x - (bx + 0.5)), 0.04) * body;
        float fx = clamp((bx - q.x) / 1.4, 0.0, 1.0), fl = 0.8 + 0.2 * sin(t * 1.1 + q.x * 9.0);
        float flame = exp(-q.y * q.y / (0.01 + 0.07 * fx)) * (1.0 - fx) * step(q.x, bx + 0.05) * fl;
        vec3 metal = vec3(0.22, 0.23, 0.2) * (1.4 - abs(q.y) * 3.5);
        rgb = metal * body * (1.0 - band) + c * band * 1.5 + vec3(2.4, 1.8, 0.8) * band2 + c * nose * 1.2 + mix(vec3(3.0, 2.2, 1.0), vec3(2.4, 0.7, 0.1), fx) * flame * 1.8;
        occ = body + smoothstep(0.3, 0.0, d) * 0.3;
      } else if (kk < 1.5) {
        float L = step(0.15, q.x) * step(q.x, hx);
        float core = exp(-q.y * q.y / 0.0007) * L * (0.25 + 0.75 * tail * tail), halo = exp(-q.y * q.y / 0.02) * L * tail * tail;
        float tip = exp(-dot(o, o) / 0.03), sh = 0.85 + 0.15 * sin(q.x * 14.0 - t * 2.0);
        rgb = W * (core * 1.6 * sh + tip * 1.5) + c * (halo * 1.4 + exp(-q.y * q.y / 0.003) * L * tail * 0.8); occ = core * 0.2;
      } else if (kk < 2.5) {
        float bx = hx - 0.5; d = seg(q, vec2(bx, 0.0), vec2(hx - 0.12, 0.0));
        float body = 1.0 - smoothstep(0.2, 0.24, d), nose = exp(-dot(o, o) / 0.04), ring = step(abs(q.x - (bx + 0.12)), 0.05) * body;
        float tr = exp(-q.y * q.y / (0.01 + 0.03 * tail)) * pow(tail, 2.0) * step(q.x, bx) * 0.8;
        vec3 cu = vec3(0.7, 0.4, 0.2) * (1.3 - abs(q.y) * 3.5);
        rgb = cu * body * (1.0 - ring) + c * ring * 1.6 + vec3(3.0, 2.0, 1.0) * nose * 0.9 + c * (tr * 1.2 + exp(-d * d / 0.05) * 0.5); occ = body + smoothstep(0.3, 0.0, d) * 0.25;
      } else if (kk < 3.5) {
        float shaft = 1.0 - smoothstep(0.04, 0.06, seg(q, vec2(hx - 1.0, 0.0), vec2(hx - 0.35, 0.0))), claws = 0.0;
        for (int i = 0; i < 2; i++) {
          float sg = i == 0 ? 1.0 : -1.0;
          float d1 = seg(q, vec2(hx - 0.4, 0.0), vec2(hx - 0.2, 0.34 * sg)), d2 = seg(q, vec2(hx - 0.2, 0.34 * sg), vec2(hx + 0.25, 0.2 * sg));
          claws = max(claws, 1.0 - smoothstep(0.055, 0.08, min(d1, d2)));
        }
        float spike = 1.0 - smoothstep(0.06, 0.09, seg(q, vec2(hx - 0.4, 0.0), vec2(hx + 0.3, 0.0)));
        float solid = max(max(shaft, claws), spike);
        vec3 steel = vec3(0.55, 0.58, 0.62) * (1.2 - abs(q.y) * 0.8);
        rgb = steel * solid + c * exp(-dot(o, o) / 0.15) * 0.9 + vec3(3.0, 2.4, 1.2) * exp(-dot(o - vec2(0.3, 0.0), o - vec2(0.3, 0.0)) / 0.01); occ = solid * 0.9;
      } else if (kk < 4.5) {
        float acc = 0.0, gl = 0.0;
        for (int i = 0; i < 2; i++) {
          float fi = float(i); vec2 p2 = q - vec2(hx - 1.0 - fi * 0.75, 0.0); float R = 1.0 - fi * 0.18 + 0.05 * sin(t * 0.6 + fi * 2.0), dd = length(p2);
          float arcm = 1.0 - smoothstep(0.7, 1.0, abs(atan(p2.y, p2.x)));
          acc += exp(-pow(dd - R, 2.0) / 0.004) * arcm * (1.0 - fi * 0.45); gl += exp(-pow(dd - R, 2.0) / 0.05) * arcm * (1.0 - fi * 0.4);
        }
        rgb = W * acc * 0.4 + c * (acc * 2.0 + gl * 0.5); occ = acc * 0.25;
      } else if (kk < 5.5) {
        rgb = vec3(0.0);
      } else if (kk < 6.5) {
        d = seg(q, vec2(hx - 0.45, 0.0), vec2(hx, 0.0));
        float core = exp(-d * d / 0.0009), halo = exp(-d * d / 0.015), tr = exp(-q.y * q.y / 0.002) * pow(tail, 2.5) * step(q.x, hx);
        rgb = W * core * 1.3 + c * (halo + tr * 1.2); occ = smoothstep(0.1, 0.0, d) * 0.3;
      } else {
        float dd = length(o), an = atan(o.y, o.x) + t * 0.45;
        float R = 0.34 + 0.04 * step(0.5, fract(an * 5.0 / 6.2832)), body = 1.0 - smoothstep(R - 0.03, R, dd);
        float rim = exp(-pow(dd - R + 0.04, 2.0) / 0.0012), hub = 1.0 - smoothstep(0.08, 0.12, dd);
        float spoke = pow(abs(sin(an * 3.0)), 12.0) * step(dd, R * 0.9) * step(0.1, dd);
        float tr = exp(-q.y * q.y / (0.01 + 0.03 * tail)) * pow(tail, 2.0) * step(q.x, hx - R) * 0.6;
        rgb = vec3(0.5, 0.52, 0.56) * (0.8 + 0.4 * sin(an * 2.0)) * body * 0.6 + c * (rim * 2.0 + spoke * 0.8 + exp(-dd * dd / 0.12) * 0.7 + tr) + W * hub * 0.6; occ = body * 0.7;
      }
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


// Skill aim indicator (touch drag): one flat quad per piece, shape picked by uMode. 0 disc, 1 dashed range ring, 2 strip, 3 cone, 4 point.
const HINT_FRAG = `
  uniform vec3 uColor; uniform float uTime, uA, uHalf, uM; uniform int uMode; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = 0.0, w = min(0.3, 0.32 / uM);
    if (uMode == 0) {
      if (r > 1.0) discard;
      a = 0.26 + (1.0 - smoothstep(0.0, w, 1.0 - r)) * 0.7;
    } else if (uMode == 1) {
      if (r > 1.0) discard;
      float dash = step(0.5, fract(atan(p.y, p.x) * 12.0 / 3.14159 + uTime * 0.15));
      a = (1.0 - smoothstep(0.0, w * 0.5, 1.0 - r)) * (0.3 + 0.55 * dash);
    } else if (uMode == 2) {
      float edge = 1.0 - smoothstep(0.0, w * 1.4, 1.0 - abs(p.y));
      float flow = step(0.5, fract(p.x * uHalf * 0.25 - uTime * 0.8)) * 0.12;
      a = 0.24 + edge * 0.6 + flow;
    } else if (uMode == 3) {
      if (r > 1.0) discard;
      float an = abs(atan(p.y, p.x));
      if (an > uHalf) discard;
      float edge = (1.0 - smoothstep(0.0, 0.06, uHalf - an)) * 0.5 + (1.0 - smoothstep(0.0, w * 0.6, 1.0 - r)) * 0.6;
      a = 0.22 + edge * 0.7;
    } else if (uMode == 5) {
      // Target bracket: four short arcs on a thin ring.
      if (r > 1.0 || r < 0.8) discard;
      float turn = fract(atan(p.y, p.x) / 6.28318 * 4.0 + uTime * 0.12);
      a = step(turn, 0.58) * (1.0 - smoothstep(0.9, 1.0, r)) * 0.95;
      if (a < 0.01) discard;
    } else {
      if (r > 1.0) discard;
      float cross = (1.0 - smoothstep(0.0, 0.08, min(abs(p.x), abs(p.y)))) * step(r, 0.6) * step(0.15, r);
      a = 0.2 + (1.0 - smoothstep(0.0, w, 1.0 - r)) * 0.75 + cross * 0.7;
    }
    gl_FragColor = vec4(uColor * a, a * uA);
  }`;

// Flash table, one column per mode: [normal, calm]. "Giảm chớp sáng" picks the second column; nothing else in this file branches on it.
//   power  scales every flash light (they were tuned for a 2.2x HDR colour on a 2 m high point light)  life  their duration
//   tint   how far a near-white flash colour moves towards the fire colour          dist  reach of a flash light in metres
//   budget caps the summed intensity of all flash lights in one frame               glow  alpha of additive glow quads (white ones also drop to SOFT_WHITE)
//   ground alpha of additive ground discs and rings (decals untouched)
//   core   width and whiteness of the beam core (shader uniform)                    bloom scale of the bloom gain      peak  where the highlight shoulder tops out (post.js)
export const FLASH = { power: [0.18, 0.08], life: [0.7, 0.5], tint: [0.55, 0.85], dist: [11, 8], budget: [18, 8], glow: [0.7, 0.5], ground: [0.75, 0.55], core: [0.6, 0.4], bloom: [1, 0.55], peak: [0.84, 0.76] };
const SOFT_WHITE = C(1.5, 1.42, 1.3);

export function makeFx(G, mechs) {
  const Q = G.quality, low = Q.name === 'low', group = new THREE.Group();
  const QK = Math.min(1.5, Q.particles / 800), N = (x) => Math.max(1, Math.round(x * QK));
  const add = makePoints(Q.particles, false, low), ovr = makePoints(Math.round(Q.particles * 0.6), true, low), str = makeStreaks(Math.round(Q.particles * 0.3));
  const debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.35, flatShading: true });
  const deb = makeDebris(low ? 24 : Q.name === 'medium' ? 60 : 110, debrisMat, Q.name === 'high', (x, y, z, left) => ovr.emit(x, y + 0.2, z, rnd(-0.3, 0.3), 1.2, rnd(-0.3, 0.3), SMOKE, 1.1, 0.45, 2.6, 1.2, -0.8, Math.min(0.5, left * 0.4), K.SMOKE));
  group.add(ovr.pts, add.pts, str.mesh, deb.mesh);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let shake = 0, time = 0, frame = 0, dust = DUST, fcol = 0;
  const BEAM_CORE = { value: FLASH.core[0] };
  const V = new THREE.Vector3();

  // Bursts. glow/spark go to the additive pools, puff to the premultiplied pool.
  const glow = (x, y, z, c, life, size, a = 1, k = K.GLOW, grow = 1.3, vx = 0, vy = 0, vz = 0) => add.emit(x, y, z, vx, vy, vz, c === WHITE ? SOFT_WHITE : c, life, size, grow, 0, 0, a * FLASH.glow[fcol], k);
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
    g.u.uMode.value = mode; g.u.uColor.value.copy(color); g.u.uT.value = opts.heat ? 1 : 0; g.alpha = opts.alpha ?? 1; g.u.uA.value = g.alpha * (mode === 3 || mode === 7 ? 1 : FLASH.ground[fcol]); g.u.uSeed.value = Math.random() * 50;
    g.age = 0; g.life = opts.life ?? 0; g.fade = opts.fade ?? 0; g.sweep = !!opts.sweep; g.heat = opts.heat || 0; g.r = r;
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
  for (let i = 0; i < Q.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, FLASH.dist[0], 1.6); l.userData.t = 0; group.add(l); lights.push(l); }
  function flash(x, y, z, color, power, life = 0.22) {
    let best = null;
    for (const l of lights) if (!best || l.userData.t < best.userData.t) best = l;
    if (!best) return;
    const mx = Math.max(color.r, color.g, color.b, 1e-3), life2 = life * FLASH.life[fcol];
    best.position.set(x, y, z); best.color.copy(color).multiplyScalar(1 / mx);
    if (Math.min(color.r, color.g, color.b) > mx * 0.75) best.color.lerp(FIRE_N, FLASH.tint[fcol]);
    best.distance = FLASH.dist[fcol]; best.userData.t = life2; best.userData.life = life2; best.userData.p = power * FLASH.power[fcol];
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
        uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 1 }, uTime: { value: 0 }, uLen: { value: 1 }, uKind: { value: 0 }, uSeed: { value: 0 }, uCore: BEAM_CORE },
        fragmentShader: `uniform vec3 uColor; uniform float uA, uTime, uLen, uKind, uSeed, uCore; varying vec2 vUv;
          float h1(float x) { return fract(sin(x * 127.1 + uSeed) * 43758.5); }
          float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
          void main() {
            float y = vUv.y * 2.0 - 1.0, x = vUv.x * uLen, ends = smoothstep(0.0, 0.4, x) * (1.0 - smoothstep(uLen - 0.4, uLen, x));
            vec3 c; float a;
            if (uKind < 0.5) {
              float core = 1.0 - smoothstep(0.0, 0.16 * uCore, abs(y)), halo = pow(1.0 - smoothstep(0.0, 1.0, abs(y)), 2.0);
              float arcs = 0.0;
              for (int i = 0; i < 3; i++) { float fi = float(i);
                float off = (n1(x * 0.9 + uTime * (14.0 + fi * 9.0) + fi * 31.0) - 0.5) * 1.3 + (n1(x * 3.5 - uTime * 25.0 + fi * 13.0) - 0.5) * 0.45;
                arcs += 1.0 - smoothstep(0.0, 0.05, abs(y - off)); }
              float fl = 0.8 + 0.2 * sin(x * 2.0 - uTime * 70.0);
              c = uColor * halo * 0.8 * fl + mix(uColor * 1.4, vec3(2.6), 0.5 * uCore) * core + mix(uColor * 1.3, vec3(2.2), 0.3) * arcs; a = 1.0;
            } else if (uKind < 1.5) {
              float line = 1.0 - smoothstep(0.0, 0.3, abs(y)), dash = step(0.4, fract(x * 0.8 - uTime * 3.0));
              c = uColor * (line * (0.5 + 0.5 * dash) + (1.0 - abs(y)) * 0.15); a = 1.0;
            } else if (uKind < 2.5) {
              float line = 1.0 - smoothstep(0.0, 0.5, abs(y)), flow = pow(0.5 + 0.5 * sin(x * 2.5 - uTime * 6.0), 6.0);
              c = uColor * line * (0.25 + flow * 0.9); a = 1.0;
            } else if (uKind < 3.5) {
              float u = x * 2.6, lk = fract(u), alt = mod(floor(u), 2.0);
              float ring = 1.0 - smoothstep(0.0, 0.14, abs(length(vec2((lk - 0.5) / 0.52, y / mix(0.85, 0.35, alt))) - 1.0));
              c = (mix(vec3(0.8, 0.82, 0.85), uColor, 0.4) * ring * 1.3 + uColor * (1.0 - abs(y)) * 0.12); a = 1.0;
            } else if (uKind < 4.5) {
              float core = 1.0 - smoothstep(0.0, 0.12 * uCore, abs(y)), halo = exp(-y * y * 7.0), fl = 0.82 + 0.18 * sin(uTime * 90.0 + x * 3.0);
              c = (uColor * halo * 1.3 + mix(uColor, vec3(2.4), 0.6 * uCore) * core * 1.7) * fl; a = 1.0;
            } else if (uKind < 5.5) {
              float s1 = 0.4 * sin(x * 2.4 - uTime * 9.0), s2 = -s1;
              float st = (1.0 - smoothstep(0.0, 0.1, abs(y - s1))) + (1.0 - smoothstep(0.0, 0.1, abs(y - s2)));
              float pulse = pow(0.5 + 0.5 * sin(x * 1.3 - uTime * 8.0), 7.0), core = 1.0 - smoothstep(0.0, 0.14, abs(y));
              c = uColor * (st * 0.9 + core * 0.6 + pulse * 1.3 * (1.0 - abs(y)) + exp(-y * y * 6.0) * 0.25); a = 1.0;
            } else if (uKind < 6.5) {
              c = uColor * (1.0 - smoothstep(0.0, 0.3, abs(y))) * 0.3; a = 1.0;
            } else {
              float core = 1.0 - smoothstep(0.0, 0.1 * uCore, abs(y)), arcs = 0.0;
              for (int i = 0; i < 2; i++) { float fi = float(i);
                float off = (n1(x * 1.3 + uTime * (16.0 + fi * 7.0) + fi * 31.0) - 0.5) * 1.1;
                arcs += 1.0 - smoothstep(0.0, 0.07, abs(y - off)); }
              c = mix(uColor, vec3(2.2), 0.4 * uCore) * core + uColor * (arcs * 1.1 + exp(-y * y * 5.0) * 0.3); a = 1.0;
            }
            gl_FragColor = vec4(c * uA * ends * a, 0.0);
          }` }));
      b = { mesh: new THREE.Mesh(beamGeo, mat), u: mat.uniforms };
      b.mesh.renderOrder = 9; group.add(b.mesh);
    }
    const len = Math.max(0.01, Math.hypot(x1 - x0, z1 - z0));
    b.mesh.visible = true; b.mesh.position.set(x0, y, z0); b.mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0); b.mesh.scale.set(len, 1, width);
    b.u.uColor.value.copy(color); b.u.uA.value = 1; b.u.uLen.value = len; b.u.uKind.value = kind; b.u.uSeed.value = Math.random() * 100;
    b.age = 0; b.life = life; b.power = kind === 0; b.width = width; b.rayOwner = -1; b.fade = false; b.kind = kind;
    beams.push(b);
    return b;
  }
  function endBeam(b) { b.rayOwner = -1; b.mesh.visible = false; const i = beams.indexOf(b); if (i >= 0) beams.splice(i, 1); beamPool.push(b); }
  function aimBeam(b, x0, z0, x1, z1, y = b.mesh.position.y) {
    const len = Math.max(0.01, Math.hypot(x1 - x0, z1 - z0));
    b.mesh.position.set(x0, y, z0); b.mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0); b.mesh.scale.x = len; b.u.uLen.value = len;
  }

  // A held ray weapon fires four times a second: one beam per unit is re-aimed and kept alive between hits so it reads as one line.
  const rayBeams = new Map(), hookBeams = new Map(), sweepLen = new Map();
  const plus = (x, y, z, c, s = 0.3) => { str.emit(x + s, y, z, 2 * s, 0, 0, c, 0.45, 0.07, 0, 0, 0, 1); str.emit(x, y + s * 1.3, z, 0, 2.6 * s, 0, c, 0.45, 0.07, 0, 0, 0, 1); };
  function rayLine(u, e) {
    const heal = e.on === 'ally', kind = heal ? 5 : e.on === 'none' ? 6 : 4, c = heal ? HEAL : TEAM_HDR[u.color], w = heal ? 1.3 : kind === 6 ? 0.5 : 0.9;
    let b = rayBeams.get(u.id);
    if (!b || b.rayOwner !== u.id || !b.mesh.visible) { b = beam(e.x0, e.z0, e.x1, e.z1, w, c, 0.32, kind, 1.5); b.rayOwner = u.id; rayBeams.set(u.id, b); }
    b.age = 0; b.life = 0.32; b.fade = true; b.power = false; b.kind = kind; b.u.uKind.value = kind; b.u.uColor.value.copy(c); b.mesh.scale.z = b.width = w;
    b.ex = e.x1 - u.x; b.ez = e.z1 - u.z;
    mechs.muzzle(u, 0, V);
    glow(V.x, V.y, V.z, c, 0.08, 0.7, 0.8, K.GLOW);
    if (heal) { plus(e.x1, 1.9, e.z1, HEAL); for (let i = 0; i < N(3); i++) glow(e.x1 + rnd(-0.6, 0.6), rnd(0.5, 1.4), e.z1 + rnd(-0.6, 0.6), HEAL, 0.6, 0.26, 1, K.SPARK, 0.4, 0, rnd(1.5, 3), 0); }
    else if (kind === 4) { glow(e.x1, 1.5, e.z1, WHITE, 0.08, 1.0, 1, K.STAR, 1.3); sparks(e.x1, 1.5, e.z1, N(3), c, 6, 0.25, 0.04, 0.4, 8); }
  }
  function hookChain(m, s, x, z) {
    const o = m.units[s.owner]; if (!o) return;
    mechs.muzzle(o, 0, V);
    let b = hookBeams.get(s.id);
    if (!b) { b = beam(V.x, V.z, x, z, 0.6, TEAM_HDR[s.color], 1e9, 3, 1.4); hookBeams.set(s.id, b); }
    b.seenF = frame; aimBeam(b, V.x, V.z, x, z, 1.4);
  }

  // Cage and bastion shells, and the light screen: additive bands drawn on an open cylinder or a vertical plane.
  const bandGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0);
  const screenGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
  const postGeo = new THREE.CylinderGeometry(0.1, 0.15, 2.6, 6).translate(0, 1.3, 0), capGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.5, metalness: 0.7 });
  const droneBody = new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.7, 1), droneRing = new THREE.TorusGeometry(0.36, 0.03, 6, 20).rotateX(Math.PI / 2), droneBlade = new THREE.BoxGeometry(0.95, 0.015, 0.07);
  function bandMat(color, mode) {
    return additive(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: color.clone() }, uA: { value: 1 }, uMode: { value: mode }, uTime: FX_TIME },
      vertexShader: 'varying vec2 vUv; varying float vF; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uColor; uniform float uA, uMode, uTime; varying vec2 vUv; varying float vF;
        void main() {
          float ang = vUv.x * 6.2832, v = vUv.y, a;
          if (uMode < 0.5) {
            float bar = pow(abs(cos(ang * 7.0)), 14.0);
            float link = (1.0 - smoothstep(0.0, 0.035, abs(v - 0.33))) + (1.0 - smoothstep(0.0, 0.035, abs(v - 0.72))) + (1.0 - smoothstep(0.0, 0.03, abs(v - 0.98)));
            float flow = pow(0.5 + 0.5 * sin(v * 14.0 - uTime * 6.0 + ang * 3.0), 6.0), rim = pow(1.0 - vF, 2.0);
            a = bar * (1.0 + flow * 0.5) + link * 0.7 + rim * 0.25 + 0.05;
            a *= 1.0 - v * 0.35;
          } else {
            float rim = pow(1.0 - vF, 2.0), base = 1.0 - smoothstep(0.0, 0.15, v), top = 1.0 - smoothstep(0.0, 0.07, 1.0 - v);
            float chev = pow(0.5 + 0.5 * sin(ang * 10.0 + v * 12.0 - uTime * 6.0), 8.0);
            a = rim * 0.8 + base * 1.0 + top * 0.7 + chev * 0.3 * (1.0 - v * 0.5) + 0.05;
          }
          gl_FragColor = vec4(uColor * a * uA, 0.0);
        }` }));
  }
  // The camera looks along the depth axis, so a screen across the aim line can be edge-on: a floor strip keeps it readable.
  const stripGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  function stripMat(color) {
    return additive(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: color.clone() }, uA: { value: 1 }, uLen: { value: 1 }, uTime: FX_TIME }, vertexShader: QUAD_VERT,
      fragmentShader: `uniform vec3 uColor; uniform float uA, uLen, uTime; varying vec2 vUv;
        void main() {
          float x = vUv.x * uLen, y = abs(vUv.y * 2.0 - 1.0);
          float core = 1.0 - smoothstep(0.0, 0.3, y), dash = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(x * 5.0 - uTime * 4.0), 3.0);
          float edge = 1.0 - smoothstep(0.0, 0.12, min(x, uLen - x));
          float a = core * dash * 1.3 + (1.0 - smoothstep(0.4, 1.0, y)) * 0.3 + edge * 0.6;
          gl_FragColor = vec4(uColor * a * uA, 0.0);
        }` }));
  }
  function screenMat(color) {
    return additive(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: color.clone() }, uA: { value: 1 }, uLen: { value: 1 }, uHitX: { value: 0 }, uHitT: { value: 0 }, uTime: FX_TIME },
      vertexShader: QUAD_VERT,
      fragmentShader: `uniform vec3 uColor; uniform float uA, uLen, uHitX, uHitT, uTime; varying vec2 vUv;
        void main() {
          float xm = vUv.x * uLen, v = vUv.y;
          float vline = pow(abs(cos(xm * 4.7)), 30.0), scan = pow(0.5 + 0.5 * sin(v * 6.0 - uTime * 2.5), 10.0);
          float edge = 1.0 - smoothstep(0.0, 0.2, min(xm, uLen - xm)), base = 1.0 - smoothstep(0.0, 0.08, v), top = 1.0 - smoothstep(0.0, 0.05, 1.0 - v);
          float hit = uHitT * exp(-pow(xm - uHitX, 2.0) / 0.8) * (0.5 + 0.5 * sin(v * 18.0 - uTime * 30.0));
          float a = (0.2 + vline * 0.4 + scan * 0.3 + edge * 0.8 + base * 1.0 + top * 0.7) * (1.0 - v * 0.4) + hit * 1.6;
          gl_FragColor = vec4(uColor * a * uA, 0.0);
        }` }));
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
    // Every shell lands here, the player's own included, so this is kept small: shake marks hits taken and big blasts, not shooting.
    kick(x, z, big ? 0.15 : 0.08);
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
    if (e.splash) { if (e.vis === 'howitzer') explosion(x, z, e.splash * 1.3, FIRE, true); else explosion(x, z, e.splash, e.vis === 'frost' ? ICE : FIRE, e.splash > 2.5); return; }
    let tc = IMPACT_COLOR[e.vis];
    if (!tc) { const team = shotTeamNear(x, z, look.k); tc = team >= 0 ? TEAM_HDR[team] : FIRE; }
    const heavy = look.k === 2 || look.k === 8 || look.k === 10 || look.k === 11 || look.k === 12, bx = -(e.dx || 0), bz = -(e.dz || 0);
    if (e.vis === 'flame') {
      if (e.on !== 'end') { glow(x, y, z, FIRE, 0.2, 1.3, 0.7, K.FLAME, 1.5, 0, 1, 0); if (Math.random() < 0.5) sparks(x, y, z, 1, EMBER, 5, 0.3, 0.04, 0.6, 12, bx, bz, 0.9); }
      return;
    }
    if (e.on === 'bounce') { glow(x, y, z, WHITE, 0.07, 1.0, 1, K.STAR, 1.4); glow(x, y, z, tc, 0.14, 1.2, 0.7); sparks(x, y, z, N(4), tc, 7, 0.22, 0.04, 0.4, 10, e.dx, e.dz, 0.6); return; }
    if (e.on === 'screen') {
      let best = null, bd = 9;
      for (const [, v] of zoneViews) if (v.screen) { const d = Math.hypot(x - v.cx, z - v.cz); if (d < bd + v.half) { bd = d - v.half; best = v; } }
      if (best) { const un = best.mat.uniforms, ax = best.dx, az = best.dz; un.uHitX.value = (x - best.x0) * ax + (z - best.z0) * az; un.uHitT.value = 1; }
      glow(x, 1.2, z, tc, 0.18, 1.8, 0.9); glow(x, 1.3, z, WHITE, 0.07, 1.1, 1, K.STAR, 1.4);
      sparks(x, 1.2, z, N(6), tc, 8, 0.3, 0.05, 0.5, 8, bx, bz, 0.9); return;
    }
    if (e.on === 'orbit') { glow(x, y, z, WHITE, 0.07, 1.0, 1, K.STAR, 1.4); sparks(x, y, z, N(5), tc, 7, 0.25, 0.05, 0.5, 8, bx, bz, 0.9); return; }
    if (e.on === 'decoy') { glow(x, y, z, HOLO, 0.15, 1.6, 0.9); glow(x, y, z, WHITE, 0.07, 1.0, 1, K.STAR, 1.4); sparks(x, y, z, N(7), HOLO, 8, 0.3, 0.05, 0.5, 8, bx, bz, 0.9); return; }
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
    else if (e.vis === 'sabot') { flash(x, y, z, WHITE, 30, 0.14); ring(x, z, 1.5, tc, 0.22); sparks(x, y, z, N(7), WHITE, 16, 0.3, 0.05, 0.3, 6, e.dx, e.dz, 0.25); }
    else if (e.vis === 'slug') { puffs(x, y - 0.3, z, 1, dust, 0.2, 1, 0.6, 0.5, 2.2, 0.4, 0.35, K.DUST); kick(x, z, 0.02); }
    else if (e.vis === 'tower') { ring(x, z, 2.4, tc, 0.3); sparks(x, y, z, N(10), tc, 10, 0.4, 0.08, 0.7, 10); flash(x, y, z, tc, 30, 0.2); kick(x, z, 0.25); }
  }

  // What a skill's own look (looks.js) draws with: the same pools and helpers as everything here.
  const anims = [];
  // follow(u, dur, fn(t, dt, u), drop): a per-frame step tied to a unit for dur seconds of drawn time (it stops when u dies).
  const follow = (u, dur, fn, drop) => anims.push({ t: 0, step(dt) { this.t += dt; if (!u.alive) return false; fn(this.t, dt, u); return this.t < dur; }, drop() { if (drop) drop(); } });
  const kit = { group, glow, sparks, puffs, chips, ring, ground, release, beam, aimBeam, endBeam, flash, kick, scorch, str, add, ovr, rnd, N, K, anims, follow, column: (...a) => column(...a),
    team: (u) => TEAM_HDR[u.color], foe: (team) => !!G.match && team !== G.match.units[G.me].team, get time() { return time; }, get match() { return G.match; }, muzzle: (u, side, out) => mechs.muzzle(u, side, out) };
  // The last skill row each unit pressed: events the sim does not tag with a skill (leap, hook, mark, ...) and zones, shots of a
  // kind that two rows of one mech share are put down to the row pressed last.
  const pressed = new Map(), hitAt = new Map();
  const UNIT_ROW = { hook: ['hook'], swap: ['swap'], stance: ['stance'], bless: ['bless'], rally: ['rally'], leap: ['leap'], mark: ['mark'], parry: ['counter'],
    flurry: ['flurry'], form: ['form'], rewind: ['rewind'], transform: ['transform'], warp: ['warp', 'portal'] };
  const ZONE_ROW = { strike: ['barrage'], mine: ['mine', 'minefield'], field: ['zone'], dome: ['dome'], wall: ['wall'], turret: ['turret'], decoy: ['decoy', 'warp'], drone: ['drone'], wire: ['wire'], orbit: ['orbit'], portal: ['portal'], totem: ['totem'] };
  function rowFor(u, kinds) {
    if (!u || !u.def) return null;
    let one = null, n = 0;
    for (const s of u.def.skills) for (const r of s.next ? [s, s.next.row] : [s]) if (kinds.includes(r.do)) { if (!one) one = r; n++; }
    if (n > 1) { const p = pressed.get(u.id); if (p && kinds.includes(p.row.do)) return p.row; }
    return one;
  }
  // The look that draws zone z, and its row: a field whose vis names a look, or the owner's row that made a zone of this kind
  // when that look lists the kind in `zones` (default: fields whose vis is the row's).
  function zoneLook(m, z) {
    if (z.kind === 'field' && LOOKS[z.vis] && LOOKS[z.vis].zoneMake) return { L: LOOKS[z.vis], row: null };
    const o = m.units[z.owner], row = o && ZONE_ROW[z.kind] ? rowFor(o, ZONE_ROW[z.kind]) : null, L = lookOf(row);
    if (!L || !L.zoneMake) return null;
    const kinds = L.zones || ['field'];
    if (!kinds.includes(z.kind) || (z.kind === 'field' && row.vis && z.vis !== row.vis)) return null;
    return { L, row };
  }
  // The look that draws shot s: a volley row (or the weapon) of its owner with a look, the same vis and, when the mech has two
  // rows of that vis, the one pressed last (the weapon unless a volley was pressed in the last burst time + 0.3 s).
  function shotLook(m, s) {
    const u = m.units[s.owner];
    if (!u || !u.def) return null;
    const rows = u.def.skills.filter((r) => r.do === 'volley' && r.vis === s.vis && (s.speed === undefined || r.speed === undefined || r.speed === s.speed));
    const w = u.def.weapon, wSame = w && w.vis === s.vis;
    const p = pressed.get(u.id), recent = p && rows.includes(p.row) && time - p.t < (p.row.burst ? p.row.burst.gap * p.row.burst.n : 0) + 0.3 + (p.row.windup || 0);
    let row = null;
    if (recent) row = p.row; else if (rows.length && !wSame) row = rows[0]; else if (wSame && w.look) row = w;
    const L = lookOf(row);
    return L && (L.shot || L.shotEnd) ? { L, row } : null;
  }
  const GUARD_C = C(2.2, 0.9, 1.6), HUSH_C = C(1.3, 1.25, 1.6);

  const SKILL_FX = {
    shield: (u) => { ring(u.x, u.z, 2.4, TEAM_HDR[u.color], 0.4); sparks(u.x, 1, u.z, N(8), TEAM_HDR[u.color], 4, 0.4, 0.05, 1, 2); },
    dash: (u) => puffs(u.x, 0.3, u.z, N(6), dust, 0.6, 3, 0.7, 0.9, 2.2, 0.6, 0.5, K.DUST, 3),
    blink: (u) => { for (let i = 0; i < N(14); i++) glow(u.x + rnd(-0.8, 0.8), rnd(0.3, 2), u.z + rnd(-0.8, 0.8), VIOLET, 0.45, 0.4, 1, K.SPARK, 0.3, 0, rnd(0, 2), 0); ring(u.x, u.z, 1.8, VIOLET, 0.35); },
    buff: (u, s) => {
      if (s.armor) { ring(u.x, u.z, 2.8, GOLD, 0.5); ground(9, u.x, u.z, 2.2, GOLD, { life: 0.9, sweep: true }); sparks(u.x, 0.8, u.z, N(14), GOLD, 5, 0.5, 0.05, 1, 4); }
      else if (s.lifesteal) { ring(u.x, u.z, 2.4, RED, 0.45); sparks(u.x, 0.6, u.z, N(16), RED, 5, 0.55, 0.05, 1.6, -2); }
      else if (s.prime) { ring(u.x, u.z, 2.0, WHITE, 0.3); glow(u.x, 1.4, u.z, WHITE, 0.2, 3, 1, K.STAR, 1.3); sparks(u.x, 1, u.z, N(10), FIRE, 6, 0.4, 0.05, 1, -2); }
      else { sparks(u.x, 0.6, u.z, N(12), FIRE, 4, 0.5, 0.05, 1.5, -2); ring(u.x, u.z, 2.2, FIRE, 0.4); }
    },
    decoy: (u) => { ring(u.x, u.z, 2.4, HOLO, 0.4); sparks(u.x, 1, u.z, N(12), HOLO, 5, 0.45, 0.05, 1, -1); glow(u.x, 1.3, u.z, HOLO, 0.25, 3, 0.8, K.STAR, 1.3); },
    drone: (u) => { ring(u.x, u.z, 1.8, HEAL, 0.4); for (let i = 0; i < N(8); i++) glow(u.x + rnd(-0.7, 0.7), rnd(1, 2.4), u.z + rnd(-0.7, 0.7), HEAL, 0.6, 0.3, 1, K.SPARK, 0.4, 0, rnd(1, 2), 0); },
    wall: (u, sk) => { if (sk.screen) ring(u.x, u.z, 2.2, TEAM_HDR[u.color], 0.35); },
    nova: (u) => puffs(u.x, 0.3, u.z, N(5), dust, 0.8, 2.5, 0.8, 0.9, 2.2, 0.4, 0.4, K.DUST),
    beam: (u) => ring(u.x, u.z, 1.8, TEAM_HDR[u.color], 0.5),
    dome: (u) => ring(u.x, u.z, 6.2, TEAM_HDR[u.color], 0.6),
    zone: (u) => ring(u.x, u.z, 2.0, HEAL, 0.4),
  };

  function event(e, m) {
    const u = e.id !== undefined ? m.units[e.id] : null;
    // a skill row with a look draws its own press, nova, beam and warp; a strike zone whose vis is a look draws what falls;
    // a passive with a look draws its stacks burst. A hook that returns true replaces the generic picture.
    if (u && e.t === 'skill') { const r = u.def.skills[e.slot]; if (r) pressed.set(u.id, { row: lookRow(u, e.skill) || r, t: time }); }
    if (u && e.skill && (e.t === 'skill' || e.t === 'nova' || e.t === 'beam' || e.t === 'warp')) {
      const row = lookRow(u, e.skill), L = lookOf(row);
      if (L && L[e.t]) { if (e.t === 'skill' && !visibleTo(m, u, m.units[G.me].team)) return; if (L[e.t](kit, e, u, row)) return; }
    } else if (u && UNIT_ROW[e.t]) {
      const row = rowFor(u, UNIT_ROW[e.t]), L = lookOf(row);
      if (L && L[e.t] && L[e.t](kit, e, u, row)) return;
    }
    if (e.t === 'explode' && e.vis && LOOKS[e.vis] && LOOKS[e.vis].strike) return;   // the look's falling piece draws its own landing
    if (e.t === 'explode' && (e.why === 'strike' || e.why === 'decoy' || e.why === 'mine')) {   // a zone drawn by a look goes off as that look says
      for (const [, v] of zoneViews) if (v.look && v.z && Math.abs(v.z.x - e.x) < 0.6 && Math.abs(v.z.z - e.z) < 0.6) { v.landed = true; if (v.look.land && v.look.land(kit, e, v.lv, v.z, v.row)) return; break; }
    }
    // a blow from a look's skill lands: that look's burst on the victim (its `hit` hook, or `pal` [rim, core] through burst),
    // at most one per victim per 0.35 s so a field ticking does not pile them up
    if (e.t === 'hit' && e.by !== undefined && e.amt > 0) {
      const by = m.units[e.by], p = by && pressed.get(by.id), L = p && lookOf(p.row);
      if (L && (L.hit || L.pal) && time - p.t < 1.2 + (p.row.dur || 0) && time - (hitAt.get(e.id) || -9) > 0.35) {
        hitAt.set(e.id, time);
        if (L.hit) L.hit(kit, e, by, p.row); else burst(kit, e.x, e.z, L.hitR || 2.2, L.pal[0], L.pal[1], { life: 0.4 });
      }
    }
    if (e.t === 'impact' && e.vis) { for (const [, v] of shotViews) if (v.sl && frame - v.seen <= 1 && Math.abs(v.x - e.x) < 2.5 && Math.abs(v.z - e.z) < 2.5 && v.sl.L.impact) { if (v.sl.L.impact(kit, e, v.lv, v.sl.row)) return; break; } }
    if (e.t === 'zone' && e.kind === 'strike' && LOOKS[e.vis] && LOOKS[e.vis].strike && LOOKS[e.vis].strike(kit, e)) return;
    if (e.t === 'stacks') { const by = m.units[e.by], L = by && lookOf(by.def.passive); if (L && L.stacks && L.stacks(kit, e, by)) return; }
    if (e.t === 'k7' && u) { const L = lookOf(u.def.passive); if (L && L.k7) L.k7(kit, e, u); return; }   // kit lane K7: passive states (Serious Mode, ice block, aim)
    switch (e.t) {
      case 'fire': {
        mechs.muzzle(u, e.side || 0, V);
        const c = TEAM_HDR[u.color], look = SHOT_LOOK[e.vis] || SHOT_LOOK.bullet, heavy = look.k === 1 || look.k === 2 || look.k === 4 || look.k === 9 || look.k === 5 || look.k === 10 || look.k === 12;
        const dx = Math.cos(e.a), dz = Math.sin(e.a);
        if (e.vis === 'flame') { glow(V.x + dx * 0.4, V.y, V.z + dz * 0.4, FIRE, 0.09, 1.2, 0.8, K.FLAME, 1.4, dx * 4, 0.3, dz * 4); break; }
        glow(V.x, V.y, V.z, WHITE, 0.06, heavy ? 1.5 : 0.9, 1, K.STAR, 1.2);
        glow(V.x + dx * 0.3, V.y, V.z + dz * 0.3, c, 0.1, heavy ? 1.6 : 0.8, 0.9, K.GLOW, 1.3);
        for (let i = 0; i < (heavy ? 5 : 2); i++) str.emit(V.x, V.y, V.z, dx * rnd(6, 14) + rnd(-2, 2), rnd(-0.5, 1), dz * rnd(6, 14) + rnd(-2, 2), c, rnd(0.06, 0.12), 0.06, 0.02, 0, 4, 1);
        if (heavy) { ovr.emit(V.x, V.y, V.z, dx * 2, 0.8, dz * 2, SMOKE, 0.6, 0.5, 2.6, 2, -0.5, 0.3, K.SMOKE); flash(V.x, V.y, V.z, c, 14, 0.1); }
        if (e.vis === 'rail') { ring(V.x, V.z, 1.2, c, 0.2); }
        else if (e.vis === 'howitzer') { puffs(V.x + dx * 0.8, V.y - 0.3, V.z + dz * 0.8, N(4), SMOKE, 0.5, 3, 1.6, 0.9, 3, 0.8, 0.45, K.SMOKE, 1.6, -0.3); ring(V.x, V.z, 2.2, SHOCK, 0.25, 0.6); flash(V.x, V.y, V.z, FIRE, 40, 0.14); }
        else if (e.vis === 'sabot') { str.emit(V.x + dx * 9, V.y, V.z + dz * 9, dx * 9, 0, dz * 9, WHITE, 0.14, 0.14, 0, 0, 0, 1); ring(V.x, V.z, 1.6, WHITE, 0.2); }
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
        } else if (e.why === 'decoy') {
          const PINK = C(2.0, 0.7, 1.2);
          ring(e.x, e.z, e.r * 1.3, HOLO, 0.45); ring(e.x, e.z, e.r * 0.7, WHITE, 0.3, 0.7); ground(9, e.x, e.z, e.r * 1.1, HOLO, { life: 0.7, sweep: true });
          glow(e.x, 1.4, e.z, HOLO, 0.25, e.r * 1.6, 0.8, K.GLOW, 1.4); glow(e.x, 1.4, e.z, WHITE, 0.12, e.r * 1.4, 1, K.STAR, 1.5);
          for (let i = 0, n = N(20); i < n; i++) { const a = Math.random() * 6.283, sp = rnd(2, e.r * 3); glow(e.x + Math.cos(a) * 0.5, rnd(0.6, 2), e.z + Math.sin(a) * 0.5, i % 3 ? HOLO : PINK, rnd(0.4, 0.7), 0.22, 1, K.SPARK, 0.3, Math.cos(a) * sp, rnd(0, 3), Math.sin(a) * sp); }
          sparks(e.x, 1.2, e.z, N(12), PINK, e.r * 3, 0.4, 0.05, 0.6, 10); flash(e.x, 2, e.z, HOLO, 40, 0.25); kick(e.x, e.z, 0.2);
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
        if (u.cast && u.cast.skill.do === 'sweep') { // one pulse of a continuous sweep: the beam itself is drawn by syncCasts
          sweepLen.set(u.id, L);
          for (let i = 0, n = Math.round(L / (low ? 4 : 2.2)); i <= n; i++) {
            const t = i / Math.max(1, n), px = e.x0 + dx * t, pz = e.z0 + dz * t;
            sparks(px, 1.5, pz, 1, i % 2 ? EMBER : tc, 5, 0.35, 0.05, 0.5, 6, -dz / L * (i % 2 ? 1 : -1), dx / L * (i % 2 ? 1 : -1), 0.4);
            if (!low && i % 2 === 1 && Math.random() < 0.6) scorch(px, pz, 1.0, 3, 1.1, tc);
          }
          glow(e.x1, 1.5, e.z1, WHITE, 0.25, 4.5, 1, K.STAR, 1.3); flash(e.x1, 1.6, e.z1, tc, 36, 0.25); kick(e.x0, e.z0, 0.1);
          break;
        }
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
      case 'ray': rayLine(u, e); break;
      case 'hook': {
        const tc = TEAM_HDR[u.color];
        mechs.muzzle(u, 0, V);
        const b = beam(V.x, V.z, e.x, e.z, 0.6, tc, 0.35, 3, 1.4); b.fade = true;
        glow(e.x, 1.4, e.z, WHITE, 0.1, 2.4, 1, K.STAR, 1.5); glow(e.x, 1.4, e.z, tc, 0.25, 2.8, 0.8);
        sparks(e.x, 1.4, e.z, N(12), GOLD, 11, 0.4, 0.07, 0.7, 12); sparks(e.x, 1.4, e.z, N(6), WHITE, 8, 0.3, 0.05, 0.5, 12);
        chips(e.x, 1.2, e.z, N(4), METAL, 5, 0.6, 0.14); ring(e.x, e.z, 2.2, WHITE, 0.3);
        flash(e.x, 1.6, e.z, GOLD, 40, 0.2); kick(e.x, e.z, 0.4);
        break;
      }
      case 'swap': {
        const o = m.units[e.other], c0 = TEAM_HDR[u.color], c1 = TEAM_HDR[o ? o.color : u.color];
        column(e.x0, e.z0, c0, 0.6, 9, 0.9); column(e.x1, e.z1, c1, 0.6, 9, 0.9);
        ring(e.x0, e.z0, 2.4, c0, 0.4); ring(e.x1, e.z1, 2.4, c1, 0.4);
        const b = beam(e.x0, e.z0, e.x1, e.z1, 0.9, WHITE, 0.4, 2, 1.3); b.fade = true;
        glow(e.x0, 1.3, e.z0, WHITE, 0.2, 3, 1, K.STAR, 1.3); glow(e.x1, 1.3, e.z1, WHITE, 0.2, 3, 1, K.STAR, 1.3);
        for (let i = 0, n = N(14); i < n; i++) { const t = Math.random(); glow(e.x0 + (e.x1 - e.x0) * t, rnd(0.4, 2), e.z0 + (e.z1 - e.z0) * t, i % 2 ? c0 : c1, 0.45, 0.35, 1, K.SPARK, 0.3, 0, rnd(0.5, 2), 0); }
        sparks(e.x0, 1, e.z0, N(8), c0, 5, 0.4, 0.05, 1.5, -2); sparks(e.x1, 1, e.z1, N(8), c1, 5, 0.4, 0.05, 1.5, -2);
        flash(e.x0, 2, e.z0, c0, 30, 0.25); flash(e.x1, 2, e.z1, c1, 30, 0.25);
        break;
      }
      case 'stance': {
        const R = u.radius * 1.3;
        if (e.on) {
          ring(e.x, e.z, 4.5, SHOCK, 0.45, 0.8); ring(e.x, e.z, 2.6, WHITE, 0.3, 0.5);
          puffs(e.x, 0.3, e.z, N(9), dust, 1.2, 5, 0.9, 1.1, 2.4, 0.5, 0.55, K.DUST, 3);
          for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785; str.emit(e.x + Math.cos(a) * R, 0.05, e.z + Math.sin(a) * R, 0, -1.7, 0, C(2, 1.8, 1.4), 0.7, 0.14, 0, 0, 0, 1); }
          chips(e.x, 0.3, e.z, N(8), STONE, 5, 0.8, 0.16); sparks(e.x, 0.4, e.z, N(10), EMBER, 6, 0.4, 0.05, 0.6, 14);
          flash(e.x, 1.2, e.z, SHOCK, 30, 0.2); kick(e.x, e.z, 0.45);
        } else { puffs(e.x, 0.3, e.z, N(5), dust, 0.9, 3, 0.7, 0.9, 2.2, 0.5, 0.45, K.DUST, 3); ring(e.x, e.z, 2.6, SHOCK, 0.3, 0.5); sparks(e.x, 0.4, e.z, N(6), EMBER, 4, 0.35, 0.05, 1, 6); }
        break;
      }
      case 'bless': {
        const o = m.units[e.to]; if (!o) break;
        const sk = u && u.def.skills.find((k) => k.id === e.skill), c = sk && sk.shield ? C(0.9, 1.7, 2.4) : C(1.4, 2.2, 0.5);
        if (u && u !== o) { const b = beam(u.x, u.z, o.x, o.z, 0.8, c, 0.35, 2, 1.5); b.fade = true; }
        column(o.x, o.z, c, 0.7, 6, 1.0); ring(o.x, o.z, 2.6, c, 0.5); ring(o.x, o.z, 1.4, WHITE, 0.3);
        if (sk && sk.shield) ground(9, o.x, o.z, 2.2, c, { life: 0.9, sweep: true });
        for (let i = 0, n = N(16); i < n; i++) { const a = Math.random() * 6.283, d = rnd(0.3, 1.2); str.emit(o.x + Math.cos(a) * d, rnd(0.2, 1), o.z + Math.sin(a) * d, 0, rnd(3, 7), 0, c, rnd(0.4, 0.7), 0.06, 0.05, -2, 0.5, 1); }
        glow(o.x, 1.3, o.z, WHITE, 0.2, 3, 1, K.STAR, 1.3); flash(o.x, 2, o.z, c, 24, 0.3);
        break;
      }
      case 'rally': {
        ring(e.x, e.z, e.r, RALLY, 0.7); ring(e.x, e.z, e.r * 0.7, GOLD, 0.55, 0.7); ring(e.x, e.z, e.r * 0.4, WHITE, 0.4, 0.6);
        ground(9, e.x, e.z, e.r * 0.8, RALLY, { life: 1.2, sweep: true });
        for (let i = 0, n = N(36); i < n; i++) { const a = Math.random() * 6.283, d = rnd(0, e.r); str.emit(e.x + Math.cos(a) * d, 0.2, e.z + Math.sin(a) * d, 0, rnd(4, 8), 0, i % 2 ? RALLY : GOLD, rnd(0.6, 1), 0.07, 0.05, -2, 0.4, 1); }
        column(e.x, e.z, RALLY.clone().multiplyScalar(0.5), 0.8, 8, 1.2); glow(e.x, 1.2, e.z, WHITE, 0.2, 3.5, 0.6, K.STAR, 1.3); flash(e.x, 3, e.z, RALLY, 30, 0.4);
        break;
      }
      case 'transform': {
        // a transform starts or ends: a gold ring and a pillar going on (scaled by the skill's size), a plain ring going off
        if (!e.on) { ring(e.x, e.z, 2.2, WHITE, 0.3, 0.6); break; }
        const sz = e.size || 1;
        ring(e.x, e.z, 3.4 * sz, GOLD, 0.6); ring(e.x, e.z, 1.9 * sz, WHITE, 0.4, 0.6);
        column(e.x, e.z, GOLD.clone().multiplyScalar(0.5), 0.7, 7, 1.0); glow(e.x, 1.2, e.z, WHITE, 0.2, 3, 0.6, K.STAR, 1.3); flash(e.x, 3, e.z, GOLD, 26, 0.35);
        break;
      }
      case 'leap': {
        puffs(e.x0, 0.3, e.z0, N(9), dust, 1, 5, 0.8, 1.1, 2.4, 0.6, 0.55, K.DUST, 3); ring(e.x0, e.z0, 2.6, WHITE, 0.3);
        chips(e.x0, 0.3, e.z0, N(6), dust, 5, 0.7, 0.14); sparks(e.x0, 0.4, e.z0, N(8), EMBER, 6, 0.35, 0.05, 1, 12); kick(e.x0, e.z0, 0.3);
        const sk = u.def.skills.find((k) => k.do === 'leap'), foe = u.team !== m.units[G.me].team;
        ground(1, e.x, e.z, sk ? sk.radius : 3.2, foe ? C(2.2, 0.3, 0.12) : C(1.8, 1.2, 0.3), { life: e.dur + 0.05, sweep: true });
        break;
      }
      case 'mark': {
        ground(1, e.x, e.z, 2.4, RED, { life: 0.6, sweep: true }); ring(e.x, e.z, 3.4, RED, 0.4); ring(e.x, e.z, 1.6, WHITE, 0.25);
        for (let i = 0; i < 4; i++) { const a = i * 1.5708; str.emit(e.x + Math.cos(a) * 5, 1.5, e.z + Math.sin(a) * 5, -Math.cos(a) * 40, 0, -Math.sin(a) * 40, RED, 0.14, 0.12, 0.03, 0, 0, 1); }
        glow(e.x, 1.6, e.z, RED, 0.3, 4, 1, K.STAR, 1.4); glow(e.x, 1.6, e.z, WHITE, 0.1, 2, 1, K.GLOW, 1.2);
        sparks(e.x, 1.4, e.z, N(12), RED, 9, 0.4, 0.06, 0.6, 10); flash(e.x, 2, e.z, RED, 50, 0.25); kick(e.x, e.z, 0.3);
        break;
      }
      case 'warp': {
        for (let i = 0, n = N(18); i < n; i++) { const a = Math.random() * 6.283, d = rnd(1.5, 3); str.emit(e.x0 + Math.cos(a) * d, rnd(0.3, 2), e.z0 + Math.sin(a) * d, -Math.cos(a) * d * 5, rnd(-0.5, 1), -Math.sin(a) * d * 5, VIOLET, 0.3, 0.05, 0.04, 0, 0, 1); }
        glow(e.x0, 1.3, e.z0, VIOLET, 0.25, 3.4, 1, K.STAR, 0.2); ring(e.x0, e.z0, 2.2, VIOLET, 0.3); column(e.x0, e.z0, VIOLET, 0.35, 8, 0.7);
        ring(e.x, e.z, 3, VIOLET, 0.45); ring(e.x, e.z, 1.6, WHITE, 0.3); sparks(e.x, 1.2, e.z, N(16), VIOLET, 9, 0.45, 0.06, 0.7, 8);
        glow(e.x, 1.3, e.z, WHITE, 0.2, 4, 1, K.STAR, 1.4); column(e.x, e.z, VIOLET, 0.45, 10, 0.9); flash(e.x, 2, e.z, VIOLET, 40, 0.3);
        break;
      }
      case 'zap': {
        sparks(e.x, 1.4, e.z, N(16), ARC, 11, 0.35, 0.06, 0.8, 10); glow(e.x, 1.4, e.z, WHITE, 0.1, 2.4, 1, K.STAR, 1.5); glow(e.x, 1.4, e.z, ARC, 0.2, 2.6, 0.9);
        for (let i = 0, n = N(5); i < n; i++) { const a = Math.random() * 6.283; str.emit(e.x, rnd(0.2, 2.2), e.z, Math.cos(a) * rnd(3, 7), rnd(-2, 3), Math.sin(a) * rnd(3, 7), ARC, 0.12, 0.04, 0.05, 0, 3, 1); }
        ring(e.x, e.z, 1.8, ARC, 0.25); flash(e.x, 1.5, e.z, ARC, 40, 0.18); kick(e.x, e.z, 0.15);
        break;
      }
      case 'execute': {
        const x = e.x, z = e.z;
        flash(x, 2.5, z, RED, 200, 0.5); glow(x, 1.5, z, WHITE, 0.2, 9, 1, K.STAR, 1.5); glow(x, 1.5, z, RED, 0.45, 9, 0.9, K.GLOW, 1.3);
        ring(x, z, 8, RED, 0.55); ring(x, z, 5, WHITE, 0.3); ring(x, z, 3, RED, 0.35);
        for (let i = 0, n = N(16); i < n; i++) { const a = (i / n) * 6.283; str.emit(x, 1.4, z, Math.cos(a) * 22, rnd(-0.5, 1.5), Math.sin(a) * 22, RED, 0.35, 0.12, 0.05, 0, 1, 1); }
        str.emit(x + 3, 3.6, z, 6, 3, 0, WHITE, 0.3, 0.35, 0, 0, 0, 1); str.emit(x + 3, 3.6, z + 0.01, 6, 3, 0, RED, 0.35, 0.6, 0, 0, 0, 0.7);
        sparks(x, 1.4, z, N(20), RED, 14, 0.5, 0.07, 0.8, 10); kick(x, z, 1.0);
        break;
      }
      case 'death': death(e, u); break;
      case 'respawn': respawn(e, u); break;
      case 'heal': for (let i = 0; i < 3; i++) glow(e.x + rnd(-0.8, 0.8), rnd(0.5, 1.6), e.z + rnd(-0.8, 0.8), HEAL, 0.8, 0.3, 1, K.SPARK, 0.6, 0, rnd(1.5, 3), 0); break;
      case 'item': ring(u.x, u.z, 2, HEAL, 0.5); break;
      case 'turretFire': glow(e.x + Math.cos(e.a) * 0.9, 1.1, e.z + Math.sin(e.a) * 0.9, WHITE, 0.06, 0.7, 1, K.STAR); for (let i = 0; i < 2; i++) str.emit(e.x + Math.cos(e.a), 1.1, e.z + Math.sin(e.a), Math.cos(e.a) * rnd(5, 10), rnd(0, 1), Math.sin(e.a) * rnd(5, 10), TEAM_HDR[u.color], 0.08, 0.05, 0.02, 0, 4, 1); break;
      case 'chain': {
        // hitfx chain: an arc from the mech just hit to each one it jumps to
        for (let i = 0; i + 1 < e.pts.length; i++) {
          const p = e.pts[i], q = e.pts[i + 1], b = beam(p[0], p[1], q[0], q[1], 0.5, ARC, 0.3, 3, 1.2); b.fade = true;
          sparks(q[0], 1.3, q[1], N(10), ARC, 9, 0.35, 0.06, 0.7, 10); glow(q[0], 1.3, q[1], WHITE, 0.1, 2.2, 1, K.STAR, 1.4); ring(q[0], q[1], 1.6, ARC, 0.25);
        }
        break;
      }
      case 'stacks': {
        // the last mark goes off: a frost-white burst on the marked mech
        const t = m.units[e.id];
        if (t) { ring(t.x, t.z, 2, WHITE, 0.3); glow(t.x, 1.4, t.z, ARC, 0.25, 2.4, 0.9, K.STAR, 1.2); sparks(t.x, 1.4, t.z, N(10), ARC, 8, 0.4, 0.06, 0.8, 10); }
        break;
      }
      case 'parry': {
        // a counter catches a blow: a gold flash on the one who turned it away
        ring(e.x, e.z, 2.4, GOLD, 0.35); ring(e.x, e.z, 1.2, WHITE, 0.2); glow(e.x, 1.4, e.z, GOLD, 0.2, 2.8, 1, K.STAR, 1.3);
        sparks(e.x, 1.3, e.z, N(12), GOLD, 10, 0.35, 0.05, 0.6, 10); flash(e.x, 1.8, e.z, GOLD, 40, 0.15);
        break;
      }
      case 'flurry': ring(e.x, e.z, 1.8, WHITE, 0.2); glow(e.x, 1.3, e.z, WHITE, 0.1, 2, 1, K.STAR, 1.4); sparks(e.x, 1.3, e.z, N(8), ARC, 9, 0.3, 0.05, 0.5, 10); break;
      case 'form': {
        ring(e.x, e.z, 3, e.on ? GOLD : ARC, 0.45); ring(e.x, e.z, 1.6, WHITE, 0.3);
        column(e.x, e.z, (e.on ? GOLD : ARC).clone().multiplyScalar(0.4), 0.5, 6, 0.7); sparks(e.x, 1.2, e.z, N(10), e.on ? GOLD : ARC, 8, 0.4, 0.05, 0.7, 8);
        break;
      }
      case 'thrift': if (u) { ring(u.x, u.z, 1.6, GOLD, 0.25); glow(u.x, 2.6, u.z, GOLD, 0.25, 1.8, 1, K.STAR, 1.3); } break;
      case 'rewind': {
        ring(e.x, e.z, e.r, VIOLET, 0.7); ring(e.x, e.z, e.r * 0.6, WHITE, 0.4, 0.6); ground(9, e.x, e.z, e.r * 0.8, VIOLET, { life: 1, sweep: true });
        glow(e.x, 1.3, e.z, WHITE, 0.2, 3.5, 0.7, K.STAR, 1.3); flash(e.x, 2.5, e.z, VIOLET, 40, 0.3);
        break;
      }
      case 'meter': {
        // a meter fills (gold ring and glow) or is spent (a plain ring)
        if (!u) break;
        if (e.on) { ring(u.x, u.z, 2.4, GOLD, 0.4); glow(u.x, 1.3, u.z, GOLD, 0.25, 2.8, 0.9, K.STAR, 1.2); }
        else ring(u.x, u.z, 1.6, WHITE, 0.25);
        break;
      }
      case 'zoneEnd': {
        const info = zoneInfo.get(e.id); zoneInfo.delete(e.id);
        if (e.kind === 'wall' && info === 'screen') { sparks(e.x, 1.2, e.z, N(18), TEAM_HDR[0].clone().lerp(TEAM_HDR[1], 0.5), 6, 0.5, 0.05, 1.2, 4); glow(e.x, 1.2, e.z, WHITE, 0.2, 3, 0.8, K.STAR, 1.2); }
        else if (e.kind === 'wall') { sparks(e.x, 1.0, e.z, N(18), ICE, 7, 0.6, 0.07, 1, 12); chips(e.x, 1, e.z, N(10), ICECHUNK, 5, 0.9, 0.2); }
        else if (e.kind === 'turret') explosion(e.x, e.z, 1.4, FIRE, false);
        else if (e.kind === 'field' && info === 'cage') { sparks(e.x, 1.2, e.z, N(24), CAGE, 9, 0.6, 0.07, 1, 12); chips(e.x, 1.2, e.z, N(10), METAL, 5, 0.9, 0.2); ring(e.x, e.z, 6, CAGE, 0.4, 0.7); flash(e.x, 1.5, e.z, CAGE, 30, 0.25); }
        else if (e.kind === 'field' && info === 'bastion') { ring(e.x, e.z, 6.5, GOLD, 0.5, 0.8); sparks(e.x, 1.2, e.z, N(18), GOLD, 8, 0.5, 0.05, 1, 4); }
        else if (e.kind === 'decoy') { for (let i = 0, n = N(10); i < n; i++) glow(e.x + rnd(-0.6, 0.6), rnd(0.3, 1.6), e.z + rnd(-0.6, 0.6), HOLO, 0.7, 0.3, 1, K.SPARK, 0.3, 0, rnd(1.5, 3.5), 0); }
        else if (e.kind === 'drone') { glow(e.x, 2.5, e.z, HEAL, 0.25, 2.4, 1, K.STAR, 1.3); sparks(e.x, 2.5, e.z, N(8), HEAL, 4, 0.5, 0.05, 0.5, 8); }
        else if (e.kind === 'wire') { sparks(e.x, 1, e.z, N(14), ARC, 8, 0.4, 0.05, 0.8, 8); glow(e.x, 1, e.z, ARC, 0.2, 2.5, 0.9, K.STAR, 1.3); }
        break;
      }
      case 'skill': { const sk = u.def.skills[e.slot], fn = SKILL_FX[sk.do]; if (fn && visibleTo(m, u, m.units[G.me].team)) fn(u, sk); break; }
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

  // shot id -> { sl: {L, row} | null, lv, seen, x, z }: a shot a look draws (looks.js shot/shotEnd/impact hooks)
  const shotViews = new Map();
  function syncShots(m, alpha, dt) {
    for (const s of m.shots) {
      const look = SHOT_LOOK[s.vis] || SHOT_LOOK.bullet, x = s.px + (s.x - s.px) * alpha, z = s.pz + (s.z - s.pz) * alpha;
      let y = 1.5, tc = TEAM_HDR[s.color];
      if (s.vis === 'tower') { const t = m.towers[s.tower]; y = t ? Math.max(2, towers.crystalY(t) - Math.hypot(x - t.x, z - t.z) * 0.45) : 2.4; }
      let sv = shotViews.get(s.id);
      if (!sv) { const sl = s.vis === 'tower' ? null : shotLook(m, s); sv = { sl, lv: sl && sl.L.shotMake ? sl.L.shotMake(kit, s, sl.row) : {}, seen: 0, x, z }; shotViews.set(s.id, sv); }
      sv.seen = frame; sv.x = x; sv.z = z; sv.s = s;
      if (sv.sl && sv.sl.L.shot && sv.sl.L.shot(kit, sv.lv, s, x, y, z, dt, sv.sl.row)) continue;
      if (look.skip) { // flamethrower: no quad, additive fire blobs that swell and cool over the 7 m
        const k = Math.min(1, s.flown / 7), f = Math.min(1, dt * 60);
        col.set(1.2, 0.42, 0.05).lerp(C(0.9, 0.1, 0.02), k);
        if (Math.random() < 0.6 * f) glow(x, 1.1 + k * 0.4, z, col, 0.2, 0.6 + k * 1.6, 0.26 * (1 - k * 0.5), K.FLAME, 1.5, rnd(-0.6, 0.6), rnd(0.3, 1.4), rnd(-0.6, 0.6));
        if (k > 0.4 && Math.random() < 0.35 * f) ovr.emit(x, 1.4, z, rnd(-0.4, 0.4), 0.8, rnd(-0.4, 0.4), SMOKE, 0.7, 0.6, 2.6, 1, -0.6, 0.18, K.SMOKE);
        continue;
      }
      if (nShots < SHOT_MAX) { lastX[nShots] = x; lastZ[nShots] = z; lastK[nShots] = look.k; lastT[nShots] = s.color; }
      drawShot(look, x, y, z, s.dx, s.dz, tc, s.id);
      if (look.chain) hookChain(m, s, x, z);
      const bx = x - s.dx * 0.6, bz = z - s.dz * 0.6, f = Math.min(1, dt * 60);
      switch (look.trail) {
        case 'smoke':
          glow(bx, y, bz, EMBER, 0.14, 0.4, 0.7, K.FLAME, 0.4, rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3));
          if (Math.random() < 0.9 * f) ovr.emit(bx - s.dx * 0.5, y, bz - s.dz * 0.5, rnd(-0.3, 0.3), 0.3, rnd(-0.3, 0.3), SMOKE, 1.2, 0.5, 3.4, 1, -0.4, 0.5, K.SMOKE);
          break;
        case 'sabot': str.emit(x, y, z, s.dx * s.speed * dt * 1.2, 0, s.dz * s.speed * dt * 1.2, WHITE, 0.5, 0.12, 0, 0, 0, 0.9); break;
        case 'dart': str.emit(x, y, z, s.dx * s.speed * dt * 1.2, 0, s.dz * s.speed * dt * 1.2, tc, 0.2, 0.05, 0, 0, 0, 0.9); break;
        case 'wave': if (Math.random() < 0.5 * f) glow(x - s.dz * rnd(-1, 1), y, z + s.dx * rnd(-1, 1), tc, 0.18, 0.2, 1, K.SPARK, 0.3); break;
        case 'disc': if (Math.random() < 0.5 * f) glow(bx, y, bz, tc, 0.25, 0.24, 1, K.SPARK, 0.3, rnd(-0.5, 0.5), rnd(-0.2, 0.4), rnd(-0.5, 0.5)); break;
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
    for (const [id, sv] of shotViews) if (sv.seen !== frame) { if (sv.sl && sv.sl.L.shotEnd) sv.sl.L.shotEnd(kit, sv.lv, sv.s, sv.x, sv.z, sv.sl.row); shotViews.delete(id); }
  }

  function sweepHooks() { for (const [id, b] of hookBeams) if (b.seenF !== frame) { endBeam(b); hookBeams.delete(id); } }

  const zoneInfo = new Map();
  function dropZone(v, ended) {
    if (v.look && v.look.zoneDrop) v.look.zoneDrop(kit, v.lv, v.z, !!ended, v.row);
    if (v.g) release(v.g);
    if (v.g2) release(v.g2);
    if (v.dome) { group.remove(v.dome); v.dome.material.dispose(); }
    if (v.obj) group.remove(v.obj);
    if (v.link) endBeam(v.link);
    if (v.wire) endBeam(v.wire);
    if (v.mats) for (const mt of v.mats) mt.dispose();
  }
  function syncZones(m, dt, alpha) {
    const myTeam = m.units[G.me].team;
    for (const z of m.zones) {
      let v = zoneViews.get(z.id);
      const foe = z.team !== myTeam, tc = TEAM_HDR[z.color];
      if (!v) {
        v = { seen: 0, z };
        const zl = zoneLook(m, z);
        if (zl) {
          // a strike keeps its warning disc unless the look draws its own (ownDisc); an `overlay` look draws on top of the generic view
          v.look = zl.L; v.row = zl.row; v.lv = zl.L.zoneMake(kit, z, zl.row, foe);
          if (z.kind === 'strike' && !zl.L.ownDisc) v.g = ground(1, z.x, z.z, z.r, foe ? C(2.2, 0.25, 0.12) : C(0.3, 1.0, 1.8), { alpha: foe ? 1 : 0.5 });
        }
        if (zl && !zl.L.overlay) { /* drawn by the look */ }
        else if (z.kind === 'strike') v.g = ground(1, z.x, z.z, z.r, foe ? C(2.2, 0.25, 0.12) : C(0.3, 1.0, 1.8), { alpha: foe ? 1 : 0.5 });
        else if (z.kind === 'mine') v.g = ground(4, z.x, z.z, z.r, foe ? C(2.2, 0.4, 0.2) : ARC, { alpha: foe ? 0.55 : 1 });
        else if (z.kind === 'field' && z.vis === 'cage') {
          zoneInfo.set(z.id, 'cage'); v.mats = []; v.obj = new THREE.Group(); v.obj.position.set(z.x, 0, z.z);
          const mat = bandMat(tc.clone().lerp(CAGE, 0.2).multiplyScalar(1.4), 0), cap = new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(1.6), toneMapped: false });
          v.mats.push(mat, cap);
          const bars = new THREE.Mesh(bandGeo, mat); bars.scale.set(z.r, 2.6, z.r); bars.renderOrder = 7; v.obj.add(bars); v.bars = mat;
          for (let i = 0; i < 14; i++) {
            const a = i * Math.PI / 7, px = Math.sin(a) * z.r, pz = Math.cos(a) * z.r;
            const post = new THREE.Mesh(postGeo, postMat); post.position.set(px, 0, pz); post.castShadow = true;
            const top = new THREE.Mesh(capGeo, cap); top.position.set(px, 2.7, pz); v.obj.add(post, top);
          }
          group.add(v.obj); v.g = ground(2, z.x, z.z, z.r, tc, { alpha: 0.9 });
        } else if (z.kind === 'field' && z.vis === 'bastion') {
          zoneInfo.set(z.id, 'bastion'); v.mats = []; v.obj = new THREE.Group();
          const mat = bandMat(tc.clone().lerp(GOLD, 0.55).multiplyScalar(1.3), 1); v.mats.push(mat);
          const shell = new THREE.Mesh(bandGeo, mat); shell.scale.set(z.r, 1.8, z.r); shell.renderOrder = 7; v.obj.add(shell); v.bars = mat;
          group.add(v.obj); v.g = ground(2, z.x, z.z, z.r, tc.clone().lerp(GOLD, 0.45), { alpha: 0.8 });
        } else if (z.kind === 'field' && LOOKS[z.vis] && LOOKS[z.vis].zoneMake) { v.look = LOOKS[z.vis]; v.lv = v.look.zoneMake(kit, z); }
        else if (z.kind === 'field') v.g = ground(2, z.x, z.z, z.r, FIELD_COLOR[z.vis] || VIOLET, { alpha: z.vis === 'smoke' ? 0.35 : 1 });
        else if (z.kind === 'wall' && z.screen) {
          zoneInfo.set(z.id, 'screen'); v.screen = true; v.mats = []; v.obj = new THREE.Group();
          const p0 = z.pts[0], p1 = z.pts[z.pts.length - 1], L0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
          v.dx = (p1[0] - p0[0]) / L0; v.dz = (p1[1] - p0[1]) / L0; v.x0 = p0[0] - v.dx * z.r * 0.6; v.z0 = p0[1] - v.dz * z.r * 0.6;
          const len = L0 + z.r * 1.2; v.half = len / 2; v.cx = v.x0 + v.dx * v.half; v.cz = v.z0 + v.dz * v.half;
          v.mat = screenMat(tc); v.mat.uniforms.uLen.value = len; v.mats.push(v.mat);
          const sheet = new THREE.Mesh(screenGeo, v.mat); sheet.position.set(v.x0, 0, v.z0); sheet.rotation.y = -Math.atan2(v.dz, v.dx); sheet.scale.set(len, 2.4, 1); sheet.renderOrder = 7;
          const cap = new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(2), toneMapped: false }); v.mats.push(cap);
          v.strip = stripMat(tc); v.strip.uniforms.uLen.value = len; v.mats.push(v.strip);
          const floor = new THREE.Mesh(stripGeo, v.strip); floor.position.set(v.x0, 0.12, v.z0); floor.rotation.y = -Math.atan2(v.dz, v.dx); floor.scale.set(len, 1, 1.5); floor.renderOrder = 3;
          v.obj.add(sheet, floor);
          for (const [px, pz] of [[v.x0, v.z0], [v.x0 + v.dx * len, v.z0 + v.dz * len]]) { const post = new THREE.Mesh(postGeo, postMat); post.scale.set(0.8, 0.95, 0.8); post.position.set(px, 0, pz); const top = new THREE.Mesh(capGeo, cap); top.position.set(px, 2.5, pz); v.obj.add(post, top); }
          group.add(v.obj);
        } else if (z.kind === 'wall') { v.obj = iceWall(z); group.add(v.obj); }
        else if (z.kind === 'drone') {
          v.mats = []; v.obj = new THREE.Group();
          const core = new THREE.MeshBasicMaterial({ color: HEAL.clone().multiplyScalar(1.3), toneMapped: false }), rim = new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(1.6), toneMapped: false }), blade = new THREE.MeshBasicMaterial({ color: 0xcfd8e0, toneMapped: false });
          v.mats.push(core, rim, blade);
          v.ring = new THREE.Mesh(droneRing, rim); v.blades = new THREE.Group();
          v.blades.add(new THREE.Mesh(droneBlade, blade), new THREE.Mesh(droneBlade, blade)); v.blades.children[1].rotation.y = Math.PI / 2; v.blades.position.y = 0.2;
          v.obj.add(new THREE.Mesh(droneBody, core), v.ring, v.blades); group.add(v.obj);
        } else if (z.kind === 'wire') {
          v.mats = []; v.obj = new THREE.Group();
          const cap = new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(2), toneMapped: false }); v.mats.push(cap);
          for (const [px, pz] of z.pts) { const post = new THREE.Mesh(postGeo, postMat); post.scale.set(0.9, 0.55, 0.9); post.position.set(px, 0, pz); post.castShadow = true; const top = new THREE.Mesh(capGeo, cap); top.position.set(px, 1.5, pz); v.obj.add(post, top); }
          group.add(v.obj); v.wire = beam(z.pts[0][0], z.pts[0][1], z.pts[1][0], z.pts[1][1], 1.5, tc, 1e9, 7, 1.0);
          v.armed = z.delay <= 0;
        }
        else if (z.kind === 'portal') { v.g = ground(2, z.x, z.z, z.r, tc, { alpha: 0.9 }); v.g2 = ground(2, z.x2, z.z2, z.r, tc, { alpha: 0.9 }); }
        else if (z.kind === 'turret') { v.obj = turretModel(z.color); v.obj.position.set(z.x, 0, z.z); group.add(v.obj); v.g = ground(6, z.x, z.z, 1.6, tc); }
        else if (z.kind === 'dome') {
          v.dome = new THREE.Mesh(domeGeo, domeMaterial(tc.clone()));
          v.dome.position.set(z.x, 0, z.z); v.dome.scale.setScalar(0.01); v.dome.renderOrder = 6; group.add(v.dome);
          v.g = ground(2, z.x, z.z, z.r, tc);
        }
        zoneViews.set(z.id, v);
      }
      v.seen = frame;
      if (v.look) { if (v.g && z.kind === 'strike') v.g.u.uT.value = 1 - z.delay / z.total; if (v.look.zone) v.look.zone(kit, v.lv, z, dt, v.row); if (!v.look.overlay) continue; }
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
      } else if (z.kind === 'field' && (z.vis === 'cage' || z.vis === 'bastion')) {
        const out = Math.min(1, z.age * 4, (z.dur - z.age) * 3), cage = z.vis === 'cage', o = m.units[z.owner];
        let cx = z.x, cz = z.z;
        if (z.follow && o) { cx = o.px + (o.x - o.px) * alpha; cz = o.pz + (o.z - o.pz) * alpha; v.g.mesh.position.x = cx; v.g.mesh.position.z = cz; }
        v.obj.position.set(cx, 0, cz);
        v.g.u.uA.value = out * (cage ? 0.9 : 0.8); v.bars.uniforms.uA.value = out;
        const rise = Math.min(1, z.age * 5); v.obj.scale.y = Math.max(0.01, rise * (2 - rise));
        if (cage) {
          if (Math.random() < dt * (low ? 8 : 16)) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * z.r * 0.9; glow(cx + Math.cos(a) * d, 0.3, cz + Math.sin(a) * d, DANGER, 0.7, 0.22, 1, K.SPARK, 0.3, 0, rnd(1, 2.5), 0); }
        } else {
          col2.copy(tc).lerp(GOLD, 0.5);
          for (let i = 0, n = low ? 1 : 2; i < n; i++) if (Math.random() < dt * 22) { const a = Math.random() * 6.283, r0 = z.r * rnd(0.45, 0.65); str.emit(cx + Math.cos(a) * r0, rnd(0.3, 1.5), cz + Math.sin(a) * r0, Math.cos(a) * 11, 0, Math.sin(a) * 11, col2, 0.28, 0.06, 0.06, 0, 1.2, 1); }
        }
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
        if (v.screen) {
          v.mat.uniforms.uA.value = out; v.strip.uniforms.uA.value = out; v.mat.uniforms.uHitT.value = Math.max(0, v.mat.uniforms.uHitT.value - dt * 3);
          if (Math.random() < dt * (low ? 4 : 9)) { const t = Math.random() * 2 * v.half; glow(v.x0 + v.dx * t, rnd(0.2, 2.2), v.z0 + v.dz * t, tc, 0.6, 0.2, 1, K.SPARK, 0.3, 0, rnd(0.3, 1), 0); }
        }
      } else if (z.kind === 'drone') {
        const o = m.units[z.owner];
        let px = z.x, pz = z.z;
        if (o) { const ox = o.px + (o.x - o.px) * alpha, oz = o.pz + (o.z - o.pz) * alpha, ang = (z.age - (1 - alpha) / 30) * 2.2; px = ox + Math.cos(ang) * 1.5; pz = oz + Math.sin(ang) * 1.5; }
        const py = 2.5 + Math.sin(time * 3 + z.id) * 0.12;
        v.obj.position.set(px, py, pz); v.ring.rotation.y = time * 5; v.blades.rotation.y = time * 40; v.obj.scale.setScalar(1.6 * Math.min(1, z.age * 4) * Math.min(1, (z.dur - z.age) * 3));
        glow(px, py, pz, HEAL, 0.06, 1.9, 0.6, K.GLOW, 1);
        if (Math.random() < dt * 8) glow(px + rnd(-0.2, 0.2), py - 0.1, pz + rnd(-0.2, 0.2), HEAL, 0.7, 0.16, 1, K.SPARK, 0.3, 0, -1.2, 0);
        const tg = z.target >= 0 ? m.units[z.target] : null;
        if (tg && tg.alive) {
          const tx = tg.px + (tg.x - tg.px) * alpha, tz = tg.pz + (tg.z - tg.pz) * alpha;
          if (!v.link) v.link = beam(px, pz, tx, tz, 1.1, HEAL, 1e9, 5, 1.9);
          aimBeam(v.link, px, pz, tx, tz, 1.9);
        } else if (v.link) { endBeam(v.link); v.link = null; }
      } else if (z.kind === 'wire') {
        const live = z.delay <= 0, fl = live ? 1 + 0.25 * Math.sin(time * 50) : 0.2 + 0.05 * Math.sin(time * 8), out = Math.min(1, (z.dur - z.age) * 2);
        v.wire.u.uA.value = fl * out;
        if (live && !v.armed) { v.armed = true; for (const [px, pz] of z.pts) { glow(px, 1.5, pz, WHITE, 0.15, 1.8, 1, K.STAR, 1.3); sparks(px, 1.5, pz, N(6), ARC, 5, 0.3, 0.05, 0.6, 8); } }
        if (live && Math.random() < dt * (low ? 6 : 14)) { const t = Math.random(); glow(z.pts[0][0] + (z.pts[1][0] - z.pts[0][0]) * t, 1.0 + rnd(-0.2, 0.3), z.pts[0][1] + (z.pts[1][1] - z.pts[0][1]) * t, ARC, 0.15, 0.3, 1, K.SPARK, 0.3, rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1)); }
      } else if (z.kind === 'portal') {
        // two rings with a glow rising from each end
        const out = Math.min(1, z.age * 4, (z.dur - z.age) * 3);
        v.g.u.uA.value = out * 0.9; v.g2.u.uA.value = out * 0.9;
        if (Math.random() < dt * 16) { const e2 = Math.random() < 0.5, px = e2 ? z.x2 : z.x, pz = e2 ? z.z2 : z.z, a = Math.random() * 6.283; glow(px + Math.cos(a) * z.r * 0.8, rnd(0.2, 1.6), pz + Math.sin(a) * z.r * 0.8, tc, 0.5, 0.3, 1, K.SPARK, 0.3, 0, rnd(1, 2.5), 0); }
      } else if (z.kind === 'orbit') {
        // orbs circle the owner: a small glow per live orb, bigger ones for a guard blade
        const o = m.units[z.owner];
        if (o) {
          const oo = { x: o.px + (o.x - o.px) * alpha, z: o.pz + (o.z - o.pz) * alpha }, zz = { age: z.age - (1 - alpha) / 30, spin: z.spin, n: z.n, ring: z.ring };
          for (let i = 0; i < z.n; i++) {
            if (!((z.live >> i) & 1)) continue;
            const [px, pz] = orbPos(zz, oo, i);
            glow(px, 1.3, pz, tc, 0.06, z.mode === 'guard' ? 1.1 : 0.8, 1, K.GLOW, 1);
            glow(px, 1.3, pz, WHITE, 0.05, z.mode === 'guard' ? 0.55 : 0.4, 1, K.STAR, 1);
          }
        }
      } else if (z.kind === 'turret') {
        v.obj.children[1].rotation.y = -z.aim;
        v.obj.scale.setScalar(Math.min(1, 0.2 + z.age * 4));
      }
    }
    for (const [id, v] of zoneViews) if (v.seen !== frame) { dropZone(v, true); zoneViews.delete(id); }
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
  // The sweep fires a pulse every 0.2 s; the beam is drawn here every frame as one steady quad that follows the turret.
  function sweepBeam(u, v, s) {
    const tc = TEAM_HDR[u.color];
    mechs.muzzle(u, 0, V);
    const mx = V.x, my = V.y, mz = V.z, dx = Math.cos(u.aim), dz = Math.sin(u.aim), len = sweepLen.get(u.id) ?? s.range;
    if (!v.act) {
      v.act = true; if (v.b) endBeam(v.b);
      v.b = beam(mx, mz, mx + dx * len, mz + dz * len, s.width * 2.8, tc, 1e9, 0, 1.5); v.b.power = false;
    }
    const ex = u.x + dx * len, ez = u.z + dz * len;
    aimBeam(v.b, mx, mz, ex, ez, 1.5);
    v.b.u.uA.value = 0.95 + 0.12 * Math.sin(time * 61); v.b.mesh.scale.z = s.width * 2.8 * (0.94 + 0.06 * Math.sin(time * 47));
    glow(mx, my, mz, WHITE, 0.06, 1.6, 1, K.STAR, 1); glow(mx + dx, my, mz + dz, tc, 0.07, 2.2, 0.8);
    glow(ex, 1.5, ez, WHITE, 0.06, 2.6, 0.9, K.STAR, 1); glow(ex, 1.4, ez, FIRE, 0.1, 3.2, 0.6);
    for (let i = 0, n = low ? 1 : 3; i < n; i++) { const t = Math.random(); sparks(mx + dx * len * t, 1.5, mz + dz * len * t, 1, i % 2 ? EMBER : tc, 5, 0.3, 0.05, 0.6, 6, -dz * (i % 2 ? 1 : -1), dx * (i % 2 ? 1 : -1), 0.4); }
    if (Math.random() < 0.4) puffs(ex, 0.6, ez, 1, SMOKE, 0.4, 1.5, 0.8, 0.7, 2.6, 0.8, 0.3, K.SMOKE, 1.6, -0.5);
  }
  function syncCasts(m, dt) {
    const myTeam = m.units[G.me].team;
    for (const u of m.units) {
      if (!u.alive || !u.cast || !visibleTo(m, u, myTeam)) continue;
      const s = u.cast.skill, k = 1 - u.cast.t / u.cast.total, foe = u.team !== myTeam;
      let v = casts.get(u.id);
      if (!v) {
        v = { seen: 0 };
        const L = lookOf(s);
        if (L && L.castMake) { v.look = L; v.lv = L.castMake(kit, u, s); }
        else if (s.do === 'nova') v.g = ground(1, u.x, u.z, s.radius, foe ? C(2.2, 0.3, 0.1) : C(1.8, 1.1, 0.3));
        else if (s.do === 'stance') v.g = ground(1, u.x, u.z, 2.4, C(1.8, 1.4, 0.7));
        else v.b = beam(u.x, u.z, u.x + Math.cos(u.cast.aim) * s.range, u.z + Math.sin(u.cast.aim) * s.range, 0.6, foe ? C(2.2, 0.3, 0.2) : TEAM_HDR[u.color], 99, 1);
        casts.set(u.id, v);
      }
      v.seen = frame;
      if (v.look) { if (v.look.cast) v.look.cast(kit, v.lv, u, s, k, dt); continue; }
      if (s.do === 'sweep' && u.cast.t <= s.dur) { sweepBeam(u, v, s); continue; }
      if (v.g) { v.g.mesh.position.x = u.x; v.g.mesh.position.z = u.z; v.g.u.uT.value = k; }
      if (v.b) {
        aimBeam(v.b, u.x, u.z, u.x + Math.cos(u.cast.aim) * s.range, u.z + Math.sin(u.cast.aim) * s.range, 1.5);
        v.b.mesh.scale.z = 0.3 + k * 1.2; v.b.u.uA.value = 0.4 + k * 0.9;
        if (Math.random() < 0.7) { const a = Math.random() * 6.283; str.emit(u.x + Math.cos(a) * 2.4, 1.5 + rnd(-0.6, 0.8), u.z + Math.sin(a) * 2.4, -Math.cos(a) * 7, 0, -Math.sin(a) * 7, TEAM_HDR[u.color], 0.3, 0.05, 0.04, 0, 0, 1); }
        if (Math.random() < 0.5) glow(u.x + Math.cos(u.cast.aim) * 1.5, 1.5, u.z + Math.sin(u.cast.aim) * 1.5, TEAM_HDR[u.color], 0.1, 0.6 + k * 1.6, 0.8, K.GLOW);
      }
    }
    for (const [id, v] of casts) if (v.seen !== frame) { if (v.look && v.look.castDrop) v.look.castDrop(kit, v.lv); if (v.g) release(v.g); if (v.b) endBeam(v.b); casts.delete(id); sweepLen.delete(id); }
  }

  function unitTrails(m, dt) {
    const myTeam = m.units[G.me].team;
    for (const u of m.units) {
      if (!u.alive || !visibleTo(m, u, myTeam)) continue;
      const sp = Math.hypot(u.x - u.px, u.z - u.pz) * 30;
      if (!u.def.hover && sp > 2 && Math.random() < dt * sp * 1.6) ovr.emit(u.x + rnd(-0.5, 0.5), 0.2, u.z + rnd(-0.5, 0.5), rnd(-0.5, 0.5), 0.7, rnd(-0.5, 0.5), dust, 0.8, 0.7, 2.2, 0, 0, 0.3, K.DUST);
      if (u.dash) glow(u.x, 1.0, u.z, TEAM_HDR[u.color], 0.25, 1.6, 0.5, K.GLOW, 0.2);
      if (u.dash && u.dash.fly && Math.random() < dt * 30) ovr.emit(u.x, 0.9, u.z, rnd(-0.5, 0.5), 0.3, rnd(-0.5, 0.5), dust, 0.6, 0.9, 2.2, 1, 0, 0.35, K.DUST);
      // guard (a skill's or a passive's): a pink-gold shimmer; silence: a pale glint over the turret
      if (u.guardT > 0 && Math.random() < dt * 24) glow(u.x + rnd(-0.6, 0.6), rnd(0.6, 1.8), u.z + rnd(-0.6, 0.6), GUARD_C, 0.35, 0.5, 0.8, K.SPARK, 0.4, 0, rnd(0.5, 1.5), 0);
      if (u.silenceT > 0 && Math.random() < dt * 8) glow(u.x, 2.7, u.z, HUSH_C, 0.25, 0.7, 0.9, K.STAR, 1);
      const ch = u.def.weapon.charge;
      if (ch && (u.charge > 0 || u.primeT > 0)) { // charge lance: the muzzle swells as it fills, white-hot while primed
        const k = Math.min(1, u.charge / ch.max), pr = u.primeT > 0 ? 1 : 0, tc = TEAM_HDR[u.color];
        mechs.muzzle(u, 0, V);
        const sz = 0.35 + k * 1.5 + pr * 0.5, fl = 0.85 + 0.15 * Math.sin(time * 40);
        glow(V.x, V.y, V.z, pr ? WHITE : tc, 0.07, sz * fl, 0.45 + k * 0.5 + pr * 0.3, K.GLOW, 1);
        if (k > 0.3 || pr) glow(V.x, V.y, V.z, WHITE, 0.06, (0.3 + k * 1.1) * fl, 0.5 + k * 0.5, K.STAR, 1);
        if (Math.random() < dt * (12 + k * 40 + pr * 12)) { const a = Math.random() * 6.283, d = 0.9 + k * 1.2; glow(V.x + Math.cos(a) * d, V.y + rnd(-0.4, 0.4), V.z + Math.sin(a) * d, tc, 0.2, 0.18, 1, K.SPARK, 0.3, -Math.cos(a) * d / 0.2, 0, -Math.sin(a) * d / 0.2); }
      }
      if (u.armorT > 0 && Math.random() < dt * 14) { const a = time * 5 + Math.random(); glow(u.x + Math.cos(a) * 1.1, rnd(0.4, 1.8), u.z + Math.sin(a) * 1.1, GOLD, 0.45, 0.24, 1, K.SPARK, 0.3, 0, 0.4, 0); }
      if (u.rageT > 0 && Math.random() < dt * 22) glow(u.x + rnd(-0.7, 0.7), rnd(0.5, 1.8), u.z + rnd(-0.7, 0.7), DANGER, 0.5, 0.34, 1, K.FLAME, 0.3, 0, 2.2, 0);
      if (u.stkN > 0) for (let i = 0; i < u.stkN; i++) glow(u.x + (i - (u.stkN - 1) / 2) * 0.5, 3.6, u.z, ARC, 0.06, 0.55, 1, K.STAR, 1);
      if (u.markT > 0) glow(u.x, 3.2, u.z, RED, 0.06, 0.9 + 0.25 * Math.sin(time * 14), 1, K.STAR, 1);
      if (u.stance && Math.random() < dt * 2) ovr.emit(u.x + rnd(-1, 1), 0.2, u.z + rnd(-1, 1), 0, 0.2, 0, dust, 0.9, 0.7, 2.2, 1, 0, 0.18, K.DUST);
      if (u.hasteT > 0 && Math.random() < dt * 20) glow(u.x + rnd(-0.6, 0.6), 0.4, u.z + rnd(-0.6, 0.6), ARC, 0.4, 0.28, 1, K.SPARK, 0.3, 0, 1, 0);
      if (u.dmgT > 0 && Math.random() < dt * 20) glow(u.x + rnd(-0.7, 0.7), rnd(0.6, 1.8), u.z + rnd(-0.7, 0.7), FIRE, 0.45, 0.26, 1, K.FLAME, 0.3, 0, 2, 0);
      if (u.slowT > 0 && Math.random() < dt * 14) glow(u.x + rnd(-0.8, 0.8), 0.3, u.z + rnd(-0.8, 0.8), VIOLET, 0.5, 0.3, 1, K.SPARK, 0.3, 0, 0.5, 0);
      if (u.stunT > 0 && Math.random() < dt * 30) { const a = time * 9 + Math.random(); glow(u.x + Math.cos(a) * 0.9, 2.5, u.z + Math.sin(a) * 0.9, GOLD, 0.3, 0.28, 1, K.STAR, 0.3, 0, 0.2, 0); }
      if (u.healT > 0 && Math.random() < dt * 16) glow(u.x + rnd(-0.7, 0.7), 0.5, u.z + rnd(-0.7, 0.7), HEAL, 0.7, 0.28, 1, K.SPARK, 0.3, 0, 2.6, 0);
      // A badly damaged mech smokes, so low health reads without looking at bars.
      if (u.hp < u.maxHp * 0.3 && Math.random() < dt * (low ? 3 : 7)) ovr.emit(u.x + rnd(-0.4, 0.4), 1.6, u.z + rnd(-0.4, 0.4), 0.2, 1.6, -0.1, SMOKE, 1.0, 0.45, 2.6, 1, -0.4, 0.4, K.SMOKE);
    }
  }


  // Touch skill aim: drawn on the ground in the team colour, red inside the cancel zone. Nothing exists until the first hint and nothing runs while G.input.aimHint is null.
  const HINT_TEAM = [new THREE.Color(0.25, 0.75, 1), new THREE.Color(1, 0.45, 0.2)], HINT_CANCEL = new THREE.Color(1, 0.18, 0.15);
  let hintParts = null, hintShown = false;
  function hintPart() {
    const mat = premul(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: QUAD_VERT, fragmentShader: HINT_FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uA: { value: 1 }, uHalf: { value: 1 }, uM: { value: 1 }, uMode: { value: 0 } } }));
    mat.depthTest = false;
    const mesh = new THREE.Mesh(flat, mat);
    mesh.renderOrder = 4; mesh.frustumCulled = false; mesh.visible = false; group.add(mesh);
    return { mesh, u: mat.uniforms };
  }
  function placeHint(part, mode, x, z, sx, sz, rot, color, a, half = 1) {
    part.mesh.visible = true; part.mesh.position.set(x, 0.16, z); part.mesh.scale.set(sx, 1, sz); part.mesh.rotation.y = rot;
    part.u.uMode.value = mode; part.u.uColor.value.copy(color); part.u.uA.value = a; part.u.uHalf.value = half; part.u.uM.value = Math.max(0.3, Math.min(sx, sz)); part.u.uTime.value = time;
  }
  function drawHint(h, myColor) {
    if (!hintParts) hintParts = [hintPart(), hintPart()];
    const col = h.cancel ? HINT_CANCEL : HINT_TEAM[myColor] || HINT_TEAM[0], a = h.cancel ? 0.75 : 1;
    const [shape, ring] = hintParts, dx = h.tx - h.x, dz = h.tz - h.z, len = Math.hypot(dx, dz), rot = -Math.atan2(dz, dx);
    hintShown = true; ring.mesh.visible = false;
    if (h.kind === 'line') {
      const l = Math.max(0.2, len), w = Math.max(0.5, h.width) / 2;
      placeHint(shape, 2, (h.x + h.tx) / 2, (h.z + h.tz) / 2, l / 2, w, rot, col, a, l);
      if (h.range > l + 0.5) placeHint(ring, 1, h.x, h.z, h.range, h.range, 0, col, a * 0.6);
    } else if (h.kind === 'cone') {
      const half = Math.atan2(h.width / 2, h.range);
      placeHint(shape, 3, h.x, h.z, h.range, h.range, rot, col, a, half);
    } else {
      const r = Math.max(0.6, h.radius);
      placeHint(shape, h.kind === 'point' ? 4 : 0, h.tx, h.tz, r, r, 0, col, a);
      if (h.range > 1) placeHint(ring, 1, h.x, h.z, h.range, h.range, 0, col, a * 0.7);
    }
  }
  function updateHint(m) {
    const h = G.input && G.input.aimHint;
    if (h) { const me = m && m.units[G.me]; drawHint(h, me ? me.color | 0 : 0); }
    else if (hintShown) { hintShown = false; for (const p of hintParts) p.mesh.visible = false; }
  }

  // Auto-aim target: a bracket on the locked enemy in my team colour, and a small arrow at the screen edge while it is off-screen.
  // Nothing is created until the first lock and nothing runs while G.input.lock is null.
  let lockPart = null, lockArrow = null, lockShown = false;
  function updateLock(m) {
    const k = G.input && G.input.lock;
    if (!k) {
      if (lockShown) { lockShown = false; if (lockPart) lockPart.mesh.visible = false; if (lockArrow) lockArrow.style.display = 'none'; }
      return;
    }
    if (!lockPart) lockPart = hintPart();
    lockShown = true;
    const me = m && m.units[G.me], col = HINT_TEAM[me ? me.color | 0 : 0] || HINT_TEAM[0];
    const r = Math.max(1.0, k.r + 0.55) * (1 + 0.04 * Math.sin(time * 6));
    placeHint(lockPart, 5, k.x, k.z, r, r, 0, col, 0.95);
    const p = G.project(k.x, 0.6, k.z), W = innerWidth, H = innerHeight, pad = 26;
    const off = !p.visible || p.x < pad || p.x > W - pad || p.y < pad || p.y > H - pad;
    if (!off) { if (lockArrow) lockArrow.style.display = 'none'; return; }
    if (!lockArrow) { lockArrow = document.createElement('i'); lockArrow.className = 'tc-lockarrow'; lockArrow.setAttribute('aria-hidden', 'true'); document.body.appendChild(lockArrow); }
    let dx = p.x - W / 2, dy = p.y - H / 2;
    if (!p.visible) { dx = -dx; dy = -dy; }
    const k2 = Math.min((W / 2 - pad) / (Math.abs(dx) || 1e-3), (H / 2 - pad) / (Math.abs(dy) || 1e-3));
    lockArrow.style.display = 'block';
    lockArrow.style.transform = `translate3d(${(W / 2 + dx * k2).toFixed(1)}px,${(H / 2 + dy * k2).toFixed(1)}px,0) rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
    lockArrow.dataset.team = me ? me.color | 0 : 0;
  }

  function update(m, alpha, dt, t) {
    time = t; frame++; FX_TIME.value = t;
    updateHint(m); updateLock(m);
    nShots = 0;
    if (m) {
      const th = G.gfx.world && G.gfx.world.theme;
      dust = (th && GROUND_DUST[th.base]) || DUST;
      syncShots(m, alpha, dt); sweepHooks(); syncZones(m, dt, alpha); syncCrates(m, dt); syncCasts(m, dt); unitTrails(m, dt); syncPoints(m); towers.sync(m, dt, time);
      if (th && th.fireflies && Math.random() < dt * 14) { const f = G.camera.position; add.emit(f.x + rnd(-22, 22), rnd(0.6, 2.6), f.z + (G.cam ? G.cam.sign : 1) * (-22 + rnd(-16, 14)), rnd(-0.6, 0.6), rnd(-0.1, 0.3), rnd(-0.6, 0.6), FIREFLY, rnd(1.5, 3), 0.16, 1, 0, 0, 0.9, K.SPARK); }
      for (const h of m.map.hazards) if (h.kind === 'lava' && Math.random() < dt * 3) { const a = Math.random() * 6.283, d = Math.random() * h.r; glow(h.x + Math.cos(a) * d, 0.2, h.z + Math.sin(a) * d, EMBER, 1.2, 0.2, 1, K.SPARK, 0.3, rnd(-0.3, 0.3), rnd(1, 3), rnd(-0.3, 0.3)); }
    }
    for (let i = anims.length - 1; i >= 0; i--) if (!anims[i].step(dt)) { anims[i].drop(); anims.splice(i, 1); }
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
      if (b.rayOwner >= 0 && m) {
        const u = m.units[b.rayOwner];
        if (u) { mechs.muzzle(u, 0, V); const ex = u.x + b.ex, ez = u.z + b.ez; aimBeam(b, V.x, V.z, ex, ez, 1.5); if (b.kind !== 6) glow(ex, 1.4, ez, b.kind === 5 ? HEAL : TEAM_HDR[u.color], 0.06, b.kind === 5 ? 1.2 : 0.8, 0.7, K.GLOW, 1); }
      }
      if (b.fade) b.u.uA.value = Math.min(1, (b.life - b.age) / Math.min(0.06, b.life));
      if (b.power) { const k = 1 - b.age / b.life, pop = Math.min(1, b.age * 25); b.u.uA.value = Math.min(1.6, k * 2) * pop; b.mesh.scale.z = b.width * (0.3 + 0.7 * k) * (0.6 + 0.4 * pop); }
      if (b.age >= b.life) endBeam(b);
    }
    for (let i = cols.length - 1; i >= 0; i--) {
      const c = cols[i]; c.age += dt;
      const k = c.age / c.life, slam = Math.min(1, c.age / 0.12);
      c.mesh.scale.set(c.r * (0.3 + 0.9 * Math.min(1, k * 3)) * (1 - k * 0.4), c.h * slam, c.r * (0.3 + 0.9 * Math.min(1, k * 3)) * (1 - k * 0.4));
      c.mesh.position.y = c.h * (1 - slam) * 0.6;
      c.u.uA.value = (1 - k) * (1 - k) * 1.6 * FLASH.glow[fcol]; c.u.uTime.value = t;
      const sy = Math.min(1, k * 2.2);
      c.scan.position.y = 0.1 + sy * 2.6; c.scan.scale.setScalar(1.6 - sy * 0.5); c.scan.material.opacity = (1 - sy) * 1.0;
      if (c.age >= c.life) { c.mesh.visible = c.scan.visible = false; cols.splice(i, 1); colPool.push(c); }
    }
    let lit = 0;
    for (const l of lights) { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = l.userData.p * Math.max(0, l.userData.t / l.userData.life); lit += l.intensity; } else l.intensity = 0; }
    if (lit > FLASH.budget[fcol]) { const k = FLASH.budget[fcol] / lit; for (const l of lights) l.intensity *= k; }
    stepEmitters(dt);
    add.update(dt); ovr.update(dt); str.update(dt); deb.update(dt);
    shake = Math.max(0, shake - dt * 2.6);
  }

  function clear() {
    for (const [, v] of zoneViews) dropZone(v);
    zoneViews.clear(); zoneInfo.clear(); rayBeams.clear(); hookBeams.clear(); sweepLen.clear(); shotViews.clear(); pressed.clear(); hitAt.clear();
    for (const [, v] of crateViews) { group.remove(v.root); release(v.mark); }
    crateViews.clear();
    for (const [, v] of casts) { if (v.look && v.look.castDrop) v.look.castDrop(kit, v.lv); if (v.g) release(v.g); if (v.b) endBeam(v.b); }
    casts.clear();
    for (const a of anims) a.drop(); anims.length = 0;
    clearPoints(); towers.clear();
    while (groundLive.length) release(groundLive[0]);
    while (beams.length) endBeam(beams[0]);
    for (const e of emitters) e.on = false;
    decals = 0; deb.clear();
    shotMesh.count = shadowMesh.count = 0;
  }

  const setPointScale = (h, fovDeg) => { const s = h / (2 * Math.tan(fovDeg * Math.PI / 360)); add.mat.uniforms.uScale.value = s; ovr.mat.uniforms.uScale.value = s; };

  function setCalm(on) {
    fcol = on ? 1 : 0; BEAM_CORE.value = FLASH.core[fcol];
    for (const l of lights) l.distance = FLASH.dist[fcol];
    const p = G.gfx.post; if (p) { p.setBloomScale(FLASH.bloom[fcol]); p.setPeak(FLASH.peak[fcol]); }
  }
  setCalm(false);
  return { group, event, update, clear, setPointScale, setCalm, get shake() { return shake; }, ring, explosion, sparks, flash };
}
