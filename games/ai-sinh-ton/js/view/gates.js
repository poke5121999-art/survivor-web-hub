// Spawn gates: where every monster that is not already standing in its room comes from (rooms.js puts two to four of them
// at the frame's corners of each fight pad; the sim walks each later pack out of one). A standing gate at a far corner, a
// gate laid in the floor (a hatch, a crack) at a near corner, so nothing stands in front of the fight. One structure per gate in the theme's own
// blocks, baked into the pad mesh with the pad's light, and one animated mesh per pad for what moves: the gate's mouth
// (a sheet of churning energy in the opening, never a flat disc), streaks of its light spilling over the floor in front,
// glowing seams up the posts and sparks that rise through the mouth.
// A gate idles faintly; about a second before it releases a pack it charges (brighter, faster, the spill reaching further);
// the release is a flash and then it settles back. world.js feeds the levels from the sim's queue each frame.
import { rngOf, liftCoplanar } from './pad.js?v=20261122a';
const THREE = window.THREE;

// per theme: the look of the standing structure (`kind`) and of the one in the floor (`floor`), block tiles, and the energy's
// colours (deep, bright)
export const GATE_LOOK = {
  street: { kind: 'breach', floor: 'manhole', name: 'lỗ tường nứt', post: 'brick', cap: 'concrete', back: 'concrete_dark', deep: 0x1a6a3a, hot: 0x9cff6a, tint: [0.82, 0.8, 0.8] },
  parking: { kind: 'shutter', floor: 'drain', name: 'cửa cuốn gara', post: 'concrete_dark', cap: 'metal_dark', back: 'metal_dark', deep: 0x7a2208, hot: 0xff8a3a, tint: [0.8, 0.78, 0.76] },
  factory: { kind: 'rift', floor: 'icecrack', name: 'khe băng', post: 'ice', cap: 'frost_metal', back: 'metal_dark', deep: 0x1a5a8a, hot: 0xb8f4ff, tint: [0.9, 0.95, 1.05] },
  crypt: { kind: 'tomb', floor: 'crypt', name: 'cửa mộ', post: 'sandstone_big', cap: 'sandstone', back: 'obsidian', deep: 0x6a3a08, hot: 0xffc860, tint: [0.92, 0.86, 0.78] },
  landing: { kind: 'monolith', floor: 'crater', name: 'cổng đá lạ', post: 'obsidian', cap: 'void_stone', back: 'obsidian', deep: 0x2a2a8a, hot: 0x9ae8ff, tint: [0.85, 0.85, 0.95] },
  forest: { kind: 'hollow', floor: 'burrow', name: 'gốc cổ thụ rỗng', post: 'bark_old', cap: 'leaves_old', back: 'obsidian', deep: 0x0a4a30, hot: 0xb8ff80, tint: [0.86, 0.92, 0.84] },
  swamp: { kind: 'hollow', floor: 'bog', name: 'rễ đước chìm', post: 'bark_wet', cap: 'algae', back: 'obsidian', deep: 0x0a4a40, hot: 0x80fff0, tint: [0.84, 0.9, 0.78] },
  void: { kind: 'shard', floor: 'fissure', name: 'cổng hư không', post: 'void_brick', cap: 'obsidian', back: 'obsidian', deep: 0x4a0a6a, hot: 0xf080ff, tint: [0.9, 0.86, 1.0] },
};
const lookOf = (th) => GATE_LOOK[th.name] || GATE_LOOK.street;

// where each gate of a room stands in its pad's frame: the mouth (where a monster first shows, on the spawn rim) and the
// structure behind it, turned to face the pad's centre; A is the sim's arena ellipse, k the pad's size factor
export function gateSpots(room, A) {
  return room.gates.map((g, gi) => {
    const nx0 = g.x / (A.x * A.x); const nz0 = g.z / (A.z * A.z); const l = Math.hypot(nx0, nz0) || 1; const nx = nx0 / l; const nz = nz0 / l;
    if (g.low) {
      // in the floor just past the rim: an opening OW across and D deep; monsters climb out of its middle
      const OW = 2.1; const D = 1.3; const m = 0.15 + D / 2; const cx = g.x + nx * m; const cz = g.z + nz * m;
      return { gi, main: !!g.main, big: false, low: true, s: 1, OW, OH: 0, P: 0.35, D, nx, nz, rot: Math.atan2(-nx, -nz), x: cx, z: cz, cx, cz, rimX: g.x, rimZ: g.z, r: OW / 2 + 0.8 };
    }
    const big = !!g.big; const s = big ? 1.45 : 1;
    const OW = 2.3 * s; const OH = 2.6 * s; const P = 0.7 * s; const D = 0.9 * s;
    // the front of the posts stands 0.45 m behind the rim the sim walks monsters onto
    const front = 0.45 + 0.05 * s; const cx = g.x + nx * (front + D / 2); const cz = g.z + nz * (front + D / 2);
    // x, z: the mouth, where an arriving monster is first drawn (just in front of the sheet of energy in the opening)
    const m = front + D - 0.4;
    return { gi, main: !!g.main, big, s, OW, OH, P, D, nx, nz, rot: Math.atan2(-nx, -nz), x: g.x + nx * m, z: g.z + nz * m, cx, cz, rimX: g.x, rimZ: g.z, r: OW / 2 + P + 0.4 };
  });
}

// the structure's boxes, local frame: x across the mouth, y up, z toward the pad (the front face at z = D / 2)
function frameBoxes(look, G, r) {
  const out = []; const B = (x, y, z, sx, sy, sz, tile, t, e) => out.push({ x, y, z, sx, sy, sz, tiles: typeof tile === 'string' ? { side: tile } : tile, t: t || look.tint, e: !!e });
  const { OW, OH, P, D } = G; const hx = OW / 2 + P / 2; const dk = [look.tint[0] * 0.25, look.tint[1] * 0.25, look.tint[2] * 0.28];
  if (G.low) {
    // the opening: a near-black plate (the floor it covers hides whatever climbs out below it) inside a raised lip
    const blk = [0.06, 0.06, 0.07]; const L = 0.22; const lw = 0.32;
    B(0, 0, 0, OW, 0.04, D, look.back, blk);
    B(0, -0.05, D / 2 + lw / 2, OW + lw * 2, L, lw, look.cap); B(0, -0.05, -D / 2 - lw / 2, OW + lw * 2, L, lw, look.cap);
    for (const sd of [-1, 1]) B(sd * (OW / 2 + lw / 2), -0.05, 0, lw, L, D, look.cap);
    const f = look.floor;
    if (f === 'manhole') { B(OW / 2 + 1.0, 0, 0.3, 1.1, 0.08, 1.1, { side: 'metal_dark', top: 'metal_dark' }, [0.55, 0.55, 0.6]); B(OW / 2 + 1.0, 0.08, 0.3, 0.7, 0.04, 0.7, 'metal', [0.5, 0.52, 0.56]); for (let i = 0; i < 3; i++) B(r.range(-OW / 2, OW / 2), 0, D / 2 + r.range(0.4, 0.8), r.range(0.2, 0.35), 0.15, r.range(0.2, 0.35), 'rubble', [0.7, 0.68, 0.66]); }
    else if (f === 'drain') { for (let k = 0; k < 5; k++) B(-OW / 2 - 1.1, 0, -0.6 + k * 0.3, 1.0, 0.06, 0.1, 'metal_dark', [0.6, 0.6, 0.64]); B(OW / 2 + 0.6, 0, 0.5, 0.5, 0.5, 0.5, 'concrete', [0.8, 0.78, 0.76]); }
    else if (f === 'icecrack') { for (let i = 0; i < 5; i++) { const sd = i % 2 ? 1 : -1; B(sd * (OW / 2 + r.range(0.4, 0.9)), 0, r.range(-0.6, 0.6), r.range(0.3, 0.5), r.range(0.3, 0.8), r.range(0.3, 0.5), 'ice', [0.95, 1.0, 1.1]); } }
    else if (f === 'crypt') { B(OW / 2 + 0.95, 0, 0, 1.2, 0.22, D + 0.2, look.post, [0.85, 0.8, 0.72]); B(-OW / 2 - 0.7, 0, -0.3, 0.45, 0.45, 0.45, 'sand_tile', [0.9, 0.7, 0.55]); }
    else if (f === 'burrow' || f === 'bog') { const bk = look.post; for (let i = 0; i < 6; i++) { const sd = i % 2 ? 1 : -1; B(sd * (OW / 2 + r.range(0.3, 0.9)), 0, r.range(-0.7, 0.7), r.range(0.5, 0.9), r.range(0.2, 0.45), r.range(0.25, 0.4), bk, [0.9, 0.95, 0.85]); } B(OW / 2 + 0.7, 0, -0.5, 0.25, 0.22, 0.25, f === 'bog' ? 'wisp' : 'glowcap', f === 'bog' ? [1.6, 2.4, 2.2] : [0.6, 2.0, 1.7], true); }
    else if (f === 'crater') { for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + r.range(-0.3, 0.3); B(Math.cos(a) * (OW / 2 + 0.7), 0, Math.sin(a) * (D / 2 + 0.6), r.range(0.3, 0.5), r.range(0.2, 0.4), r.range(0.3, 0.5), 'burnt', [0.6, 0.55, 0.55]); } B(OW / 2 + 0.5, 0, -0.4, 0.2, 0.6, 0.2, 'crystal', [0.9, 0.8, 1.5], true); }
    else { for (let i = 0; i < 4; i++) { const sd = i % 2 ? 1 : -1; B(sd * (OW / 2 + r.range(0.4, 0.8)), 0, r.range(-0.5, 0.5), 0.22, r.range(0.4, 0.9), 0.22, i < 2 ? 'crystal' : look.cap, i < 2 ? [1.3, 0.7, 1.8] : look.tint, i < 2); } }
    return out;
  }
  const FOOT = -4; // posts run down into the island so a gate on a ragged rim never floats
  // the dark hollow behind the mouth
  B(0, FOOT, -D / 2 + 0.12, OW + 0.1, OH - FOOT, 0.24, look.back, dk);
  if (look.kind === 'breach') {
    // a broken brick wall with a hole punched through it: ragged posts of uneven courses, a cracked slab across
    for (const sd of [-1, 1]) {
      B(sd * hx, FOOT, 0, P, OH - FOOT + 0.2 * r.next(), D, look.post);
      B(sd * (hx + P * 0.55), FOOT, -0.05, P * 0.6, OH * r.range(0.45, 0.7) - FOOT, D * 0.8, look.post);
      B(sd * (hx - 0.1), OH + 0.5, 0, P * 0.8, r.range(0.3, 0.6), D * 0.9, look.post);
    }
    B(-0.3, OH, 0, OW * 0.75 + P, 0.5, D * 0.95, look.cap); B(0.55, OH + 0.45, 0.02, OW * 0.55, 0.35, D * 0.85, look.cap, [0.7, 0.7, 0.72]);
    for (let i = 0; i < 4; i++) B(r.range(-OW / 2 - 0.6, OW / 2 + 0.6), 0, D / 2 + r.range(0.1, 0.5), r.range(0.25, 0.45), r.range(0.15, 0.3), r.range(0.25, 0.4), 'rubble', [0.7, 0.68, 0.66]);
  } else if (look.kind === 'shutter') {
    // a garage bay: concrete posts and beam, a metal shutter rolled up under the beam, hazard paint on the posts
    for (const sd of [-1, 1]) { B(sd * hx, FOOT, 0, P, OH + 0.6 - FOOT, D, look.post); for (let k = 0; k < 4; k++) B(sd * hx, 0.15 + k * 0.42, D / 2 + 0.01, P * 0.9, 0.2, 0.02, 'white', k % 2 ? [0.15, 0.14, 0.12] : [1.1, 0.8, 0.15]); }
    B(0, OH, 0, OW + P * 2, 0.6, D, look.post);
    B(0, OH - 0.42, 0.05, OW + 0.1, 0.42, 0.42, { side: 'corrugated', top: 'metal' }, [0.62, 0.6, 0.6]);
    for (let k = 0; k < 3; k++) B(-OW / 2 + 0.25 + k * 0.32, OH - 0.62, 0.22, 0.05, 0.22, 0.05, 'metal_dark', [0.5, 0.5, 0.52]);
  } else if (look.kind === 'rift') {
    // a split in an ice wall: jagged slabs leaning in over the mouth, frost on top
    for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) {
      const h = OH * (1.15 - k * 0.12) + r.range(-0.2, 0.2); const w = P * (1 - k * 0.12);
      B(sd * (hx - 0.05 + k * 0.16), FOOT, -0.06 * k, w, h - FOOT, D * (1 - k * 0.08), k % 2 ? look.cap : look.post);
    }
    B(-0.35, OH + 0.1, 0, OW * 0.5, 0.5, D * 0.8, look.post); B(0.3, OH + 0.35, 0, OW * 0.45, 0.45, D * 0.7, 'snow');
    for (let i = 0; i < 3; i++) B(r.range(-OW / 2 - 0.8, OW / 2 + 0.8), 0, D / 2 + r.range(0.2, 0.6), r.range(0.3, 0.5), r.range(0.2, 0.45), r.range(0.3, 0.5), 'ice', [0.95, 1.0, 1.1]);
  } else if (look.kind === 'tomb') {
    // a tomb door: stepped sandstone posts, a heavy lintel with a stepped crown, the stone door slid aside
    for (const sd of [-1, 1]) {
      B(sd * hx, FOOT, 0, P, OH - FOOT, D, look.post); B(sd * hx, OH - 0.3, 0, P + 0.2, 0.3, D + 0.15, look.cap);
      B(sd * (hx + P * 0.4), FOOT, -0.1, P * 0.5, 1.0 - FOOT, D * 1.1, look.cap);
    }
    B(0, OH, 0, OW + P * 2 + 0.4, 0.55, D + 0.2, look.cap); B(0, OH + 0.55, 0, OW * 0.7, 0.4, D * 0.8, look.post); B(0, OH + 0.95, 0, OW * 0.3, 0.35, D * 0.6, look.cap);
    B(OW / 2 + P + 0.55, 0, D / 2 - 0.35, OW * 0.55, OH * 0.85, 0.3, look.post, [0.8, 0.74, 0.66]);
  } else if (look.kind === 'hollow') {
    // a hollow giant stump / root arch: fat bark posts, roots splaying out of their feet, a mossy crown across, glow cap shelves
    for (const sd of [-1, 1]) {
      B(sd * hx, FOOT, 0, P * 1.2, OH + 0.3 - FOOT, D, look.post); B(sd * (hx + P * 0.7), FOOT, 0.05, P * 0.7, 0.8 - FOOT, D * 1.1, look.post);
      B(sd * (hx + P * 0.9), 0.6, D / 2 + 0.2, P * 0.6, 0.22, 0.7, look.post); B(sd * hx, OH + 0.3, 0, P * 1.1, 0.4, D * 0.9, look.cap);
      B(sd * (hx - 0.05), OH * 0.5, D / 2 + 0.05, 0.4, 0.14, 0.14, 'glowcap', [0.6, 2.0, 1.7], true);
    }
    B(0, OH + 0.1, 0, OW + P * 2.2, 0.6, D, look.post); B(0.1, OH + 0.7, 0, OW * 0.8, 0.5, D * 0.9, look.cap);
    for (let i = 0; i < 3; i++) B(r.range(-OW / 2 - 0.4, OW / 2 + 0.4), OH * 0.8 - r.range(0, 0.5), D / 2 + 0.03, 0.08, r.range(0.4, 0.9), 0.08, look.cap);
  } else if (look.kind === 'monolith') {
    // two dark standing stones with a third laid across, glowing shards set into them
    for (const sd of [-1, 1]) { B(sd * hx, FOOT, 0, P * 1.1, OH + 0.5 - FOOT, D * 0.9, look.post); B(sd * hx, OH + 0.5, 0, P * 0.8, 0.4, D * 0.7, look.post); B(sd * (hx + 0.15), OH * 0.55, D * 0.48, 0.18, 0.5, 0.06, 'crystal', [1.0, 0.9, 1.6], true); }
    B(0, OH + 0.25, 0, OW + P * 2.6, 0.55, D * 0.8, look.cap);
    for (let i = 0; i < 3; i++) { const x = r.range(-OW / 2 - 1, OW / 2 + 1); B(x, 0, D / 2 + r.range(0.3, 0.7), 0.22, r.range(0.35, 0.7), 0.22, 'crystal', [0.9, 0.8, 1.5], true); }
  } else {
    // a torn frame of void brick, tapering posts and crystal spikes leaning off its corners
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) B(sd * (hx - k * 0.06), FOOT + (k ? OH * 0.25 * k - FOOT : 0), 0, P * (1 - k * 0.15), (k ? OH * 0.25 : OH * 0.25 - FOOT), D * (1 - k * 0.1), k % 2 ? look.cap : look.post);
      B(sd * (hx + 0.2), OH * 0.9, 0, 0.3, 0.9, 0.3, 'crystal', [1.3, 0.7, 1.8], true); B(sd * (hx + 0.45), OH * 1.05, -0.1, 0.2, 0.6, 0.2, 'crystal', [1.3, 0.7, 1.8], true);
    }
    B(0, OH, 0, OW + P * 1.6, 0.45, D * 0.9, look.post); B(0.2, OH + 0.45, 0, OW * 0.4, 0.35, D * 0.6, look.cap);
  }
  return out;
}

// emit the structures of a room's gates into a pad's mesher (pad.build's `extra` hook); y is the pad floor
export function emitGates(M, spots, th, y = 0) {
  const look = lookOf(th);
  for (const G of spots) {
    const r = rngOf(Math.round(G.cx * 100) * 7 + Math.round(G.cz * 100));
    const c = Math.cos(G.rot); const s = Math.sin(G.rot);
    // boxes laid over one another with a face in the same plane are lifted clear of it (pad.js liftCoplanar), so none z-fights
    const L = frameBoxes(look, G, r).map((q) => [[q.x - q.sx / 2, q.y, q.z - q.sz / 2], [q.x + q.sx / 2, q.y + q.sy, q.z + q.sz / 2], q.tiles, q.t, q.e]);
    for (const [lo, hi, tiles, t, e] of liftCoplanar(L)) {
      const lx = (lo[0] + hi[0]) / 2; const lz = (lo[2] + hi[2]) / 2;
      M.box(G.cx + lx * c + lz * s, y + lo[1], G.cz - lx * s + lz * c, hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], G.rot, tiles, t, e);
    }
  }
}
// the light each gate throws on the floor and its own posts (baked; no halo sprite, the mouth is the glow)
export function gateLights(spots, th) {
  const look = lookOf(th); const c = new THREE.Color(look.hot);
  return spots.map((G) => ({ kind: 'gate', x: G.cx + G.nx * -0.2, y: G.low ? 0.7 : 1.1 * G.s, z: G.cz + G.nz * -0.2, ground: 0, color: [c.r * 0.9, c.g * 0.9, c.b * 0.9], r: 4.5 * G.s, k: 0.7, warm: 0, glow: 0, gate: 1 }));
}

const FX_V = `attribute vec4 aG; varying vec2 vUv; varying float vKind; varying float vCh; varying float vFl; varying float vSeed; varying float vH;
uniform float uTime; uniform vec4 uCharge; uniform vec4 uFlash;
float pick(vec4 v, float i) { return i < 0.5 ? v.x : i < 1.5 ? v.y : i < 2.5 ? v.z : v.w; }
void main() {
  vUv = uv; vKind = aG.y; vSeed = aG.z; vH = aG.w; float gi = aG.x; vCh = pick(uCharge, gi); vFl = pick(uFlash, gi);
  vec3 p = position;
  if (vKind > 2.5) {
    // a spark: a thin streak rising through the mouth, faster and more of them as the gate charges; billboarded sideways
    float sp = 0.5 + vCh * 1.6 + vFl * 2.0; float h = fract(uTime * 0.35 * sp + vSeed);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    p += vec3(0.0, h * vH * 1.15, 0.0) + right * (uv.x - 0.5) * 0.06 + vec3(0.0, (uv.y - 0.5) * 0.28, 0.0) + right * sin(uTime * 3.0 + vSeed * 40.0) * 0.12 * h;
    vUv = vec2(uv.x, h);
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FX_F = `varying vec2 vUv; varying float vKind; varying float vCh; varying float vFl; varying float vSeed; varying float vH;
uniform float uTime; uniform vec3 uDeep; uniform vec3 uHot;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main() {
  float lvl = 0.22 + vCh * 0.95 + vFl * 1.4; float t = uTime * (0.6 + vCh * 1.4 + vFl);
  vec3 col; float a;
  if (vKind < 0.5) {
    // the mouth: tongues of energy pulled upward and twisted, brightest at the edges where they lick the posts, a darker core
    vec2 q = vec2(vUv.x * 2.2, vUv.y * 2.6 - t * 0.9);
    vec2 w = vec2(fbm(q + vec2(0.0, t * 0.3)), fbm(q + vec2(5.2, 1.3) - t * 0.2));
    float n = fbm(q * 1.4 + w * 2.2 + vSeed * 7.0);
    float edge = pow(abs(vUv.x - 0.5) * 2.0, 3.0) * 0.8 + smoothstep(0.75, 1.0, vUv.y) * 0.5;
    float streak = smoothstep(0.55, 0.95, vn(vec2(vUv.x * 9.0 + vSeed * 3.0, vUv.y * 1.2 - t * 1.6)));
    float v = clamp(n * 1.25 + edge * (0.6 + n) + streak * 0.5 * (0.4 + vCh), 0.0, 2.2);
    float m = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    col = mix(uDeep, uHot, clamp(v - 0.35, 0.0, 1.0)) * v; a = m * lvl;
  } else if (vKind < 1.5) {
    // the spill over the floor: streaks fanning out of the doorway and broken up by noise, fading with distance
    float d = vUv.y; float fan = (vUv.x - 0.5) / (0.35 + d * 0.65);
    float rays = vn(vec2(fan * 7.0 + vSeed * 5.0, d * 1.5 - t * 1.2)) * 0.7 + vn(vec2(fan * 17.0, d * 3.0 - t * 2.0)) * 0.3;
    float reach = 0.35 + vCh * 0.35 + vFl * 0.45;
    float m = smoothstep(reach, 0.0, d) * smoothstep(0.5, 0.1, abs(fan)) * smoothstep(0.0, 0.12, d + 0.02);
    col = mix(uDeep, uHot, rays) * (0.4 + rays); a = m * lvl * 0.32 * smoothstep(0.3, 0.75, rays);
  } else if (vKind < 2.5) {
    // seams up the posts: a crack line that flickers and climbs with the charge
    float y = vUv.y; float fill = 0.25 + vCh * 0.75 + vFl;
    float crack = smoothstep(0.35, 0.0, abs(vUv.x - 0.5 - (vn(vec2(y * 6.0, vSeed * 9.0)) - 0.5) * 0.6));
    float fl = 0.6 + 0.4 * vn(vec2(y * 4.0 - t * 2.0, vSeed));
    col = uHot * fl; a = crack * smoothstep(fill + 0.05, fill - 0.15, y) * lvl * 0.9;
  } else if (vKind < 3.5) {
    float k = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * (1.0 - abs(vUv.x - 0.5) * 2.0);
    col = uHot * 1.3; a = k * (0.15 + vCh * 0.9 + vFl * 1.2);
  } else {
    // wisps rising out of a floor gate: torn strands scrolling up, thinning with height
    float n = fbm(vec2(vUv.x * 3.0 + vSeed * 4.0, vUv.y * 2.0 - t * 1.3));
    float strand = smoothstep(0.5, 0.85, n) * smoothstep(1.0, 0.25, vUv.y) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
    col = mix(uDeep, uHot, n); a = strand * (0.05 + vCh * 0.6 + vFl * 0.9);
  }
  gl_FragColor = vec4(col * a, 1.0);
  #include <colorspace_fragment>
}`;

// the moving parts of one pad's gates: one mesh, one draw call
export function buildGateFx(spots, th, y = 0) {
  const look = lookOf(th);
  const pos = []; const uv = []; const ag = []; const idx = [];
  const quad = (P, gi, kind, seed, h) => { const b = pos.length / 3; for (let k = 0; k < 4; k++) { pos.push(...P[k]); ag.push(gi, kind, seed, h); } uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  for (const G of spots) {
    const c = Math.cos(G.rot); const s = Math.sin(G.rot); const W = (lx, ly, lz) => [G.cx + lx * c + lz * s, y + ly, G.cz - lx * s + lz * c];
    const hw = G.OW / 2; const zf = -G.D / 2 + 0.3; const r = rngOf(G.gi * 31 + 7);
    if (G.low) {
      const hd = G.D / 2; const yy = 0.055;
      quad([W(-hw, yy, hd), W(hw, yy, hd), W(hw, yy, -hd), W(-hw, yy, -hd)], G.gi, 0, r.next(), 1);
      // seams along the tops of the lips
      for (const sd of [-1, 1]) quad([W(-hw - 0.3, 0.18, sd * (hd + 0.16) - 0.08), W(hw + 0.3, 0.18, sd * (hd + 0.16) - 0.08), W(hw + 0.3, 0.18, sd * (hd + 0.16) + 0.08), W(-hw - 0.3, 0.18, sd * (hd + 0.16) + 0.08)], G.gi, 2, r.next(), 0);
      // two crossed sheets of wisps standing over the opening
      quad([W(-hw * 0.9, 0.05, 0), W(hw * 0.9, 0.05, 0), W(hw * 0.9, 2.2, 0), W(-hw * 0.9, 2.2, 0)], G.gi, 4, r.next(), 0);
      quad([W(0, 0.05, -hd * 0.9), W(0, 0.05, hd * 0.9), W(0, 2.2, hd * 0.9), W(0, 2.2, -hd * 0.9)], G.gi, 4, r.next(), 0);
      for (let k = 0; k < 9; k++) { const p = W(r.range(-hw * 0.8, hw * 0.8), 0.1, r.range(-hd * 0.7, hd * 0.7)); quad([p, p, p, p], G.gi, 3, r.next(), 1.8); }
      continue;
    }
    // the mouth, in the opening just in front of the hollow
    quad([W(-hw, 0, zf), W(hw, 0, zf), W(hw, G.OH, zf), W(-hw, G.OH, zf)], G.gi, 0, r.next(), G.OH);
    // the spill: a fan on the floor from the doorway toward the pad
    const z0 = G.D / 2; const L = 3.2 * G.s;
    quad([W(-hw * 0.9, 0.03, z0), W(hw * 0.9, 0.03, z0), W(hw * 2.2, 0.03, z0 + L), W(-hw * 2.2, 0.03, z0 + L)], G.gi, 1, r.next(), 0);
    // seams on the front faces of both posts
    for (const sd of [-1, 1]) { const x = sd * (hw + G.P / 2); quad([W(x - 0.2, 0.05, G.D / 2 + 0.02), W(x + 0.2, 0.05, G.D / 2 + 0.02), W(x + 0.2, G.OH * 0.95, G.D / 2 + 0.02), W(x - 0.2, G.OH * 0.95, G.D / 2 + 0.02)], G.gi, 2, r.next(), 0); }
    // sparks
    for (let k = 0; k < 9; k++) { const p = W(r.range(-hw * 0.8, hw * 0.8), 0.1, zf + 0.15); quad([p, p, p, p], G.gi, 3, r.next(), G.OH); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aG', new THREE.Float32BufferAttribute(ag, 4)); g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({
    vertexShader: FX_V, fragmentShader: FX_F, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { uTime: { value: 0 }, uCharge: { value: new THREE.Vector4() }, uFlash: { value: new THREE.Vector4() }, uDeep: { value: new THREE.Color(look.deep) }, uHot: { value: new THREE.Color(look.hot) } },
  });
  const mesh = new THREE.Mesh(g, m); mesh.name = 'gatefx'; mesh.renderOrder = 6; mesh.frustumCulled = false;
  return mesh;
}
