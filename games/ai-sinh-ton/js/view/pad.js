// One combat pad of the battle world: a floating block island whose flat top (y = centre.y) is the fight floor, with stepped
// terraces into the abyss, rim props and their lights. Pure builder: buildPad() returns data (outline, rim anchors, bridge
// anchors, lights, decor boxes) and a build(lights) that bakes the lighting into vertex colours and returns one Mesh.
// The block grid is turned 45 degrees about Y from the sim axes so block edges run diagonally on screen.
// Lighting is baked once per stage: cool ambient by normal, a soft key direction, warm falloff from every light,
// ambient occlusion under steps and at the foot of props. One atlas material (voxtex.js), MeshBasic, so q=low pays nothing
// per light.
import { voxAtlas } from './voxtex.js?v=20261122a';
import { LIGHTS } from './themes.js?v=20261122a';
const THREE = window.THREE;

const R2 = Math.SQRT1_2;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const GATE_W = 4.2;
const GATE_STRIP = 1.9; // half-width of the solid strip along a gate: the bridge deck plus the heroes' formation
export function rngOf(seed) {
  let s = (typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0;
  const next = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)), chance: (p) => next() < p, pick: (l) => l[Math.floor(next() * l.length)], weighted: (l) => { let t = 0; for (const x of l) t += x[1]; let r = next() * t; for (const x of l) { r -= x[1]; if (r < 0) return x[0]; } return l[0][0]; } };
}
const hash2 = (a, b, s) => { let h = (a * 374761393 + b * 668265263 + s * 974634581) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, z, s) {
  const i = Math.floor(x); const j = Math.floor(z); let fx = x - i; let fz = z - j; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, s); const b = hash2(i + 1, j, s); const c = hash2(i, j + 1, s); const d = hash2(i + 1, j + 1, s);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

// Boxes [min, max, ...rest] laid in order: where a later box shares a face plane with an earlier one it overlaps (a crate on a
// crate, a cap on a post), that face of the later box moves LIFT out of the plane, so the two never z-fight. Copies; the input stays.
const LIFT = 0.004;
export function liftCoplanar(list) {
  const out = list.map(([a, b, ...rest]) => [a.slice(), b.slice(), ...rest]);
  for (let i = 1; i < out.length; i++) for (let j = 0; j < i; j++) for (let ax = 0; ax < 3; ax++) {
    const p = out[i]; const q = out[j]; const u = (ax + 1) % 3; const v = (ax + 2) % 3;
    if (!(p[0][u] < q[1][u] && q[0][u] < p[1][u] && p[0][v] < q[1][v] && q[0][v] < p[1][v])) continue;
    if (Math.abs(p[1][ax] - q[1][ax]) < LIFT / 2) p[1][ax] = Math.max(p[1][ax], q[1][ax]) + LIFT;
    if (Math.abs(p[0][ax] - q[0][ax]) < LIFT / 2) p[0][ax] = Math.min(p[0][ax], q[0][ax]) - LIFT;
  }
  return out;
}

// ---- the mesher: quads with atlas uvs, a tint, an AO value per corner and an emissive flag; lit in bake() ----
export function mesher() {
  const A = voxAtlas();
  const pos = []; const nor = []; const uv = []; const tint = []; const ao = []; const emi = []; const idx = [];
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const n = new THREE.Vector3();
  // p: four [x,y,z] corners; along the face, (fu, fv) is the share of the tile each covers (<= 1); flips to face `nrm`
  function quad(p, nrm, key, fu, fv, t, aoq, e) {
    a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]); b.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]); n.crossVectors(a, b);
    const flip = n.x * nrm[0] + n.y * nrm[1] + n.z * nrm[2] < 0;
    const r = A.uv(key); const u1 = r[0] + (r[2] - r[0]) * fu; const v1 = r[1] + (r[3] - r[1]) * fv;
    const uvs = [[r[0], r[1]], [u1, r[1]], [u1, v1], [r[0], v1]];
    const base = pos.length / 3;
    for (let k = 0; k < 4; k++) { pos.push(p[k][0], p[k][1], p[k][2]); nor.push(nrm[0], nrm[1], nrm[2]); uv.push(uvs[k][0], uvs[k][1]); tint.push(t[0], t[1], t[2]); ao.push(aoq ? aoq[k] : 1); emi.push(e ? 1 : 0); }
    if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2); else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // a rectangle split into tile-sized pieces: origin o, edge vectors eu (width), ev (height), lengths in metres
  function face(o, eu, ev, nrm, key, t, e, aoFn) {
    const lu = Math.hypot(...eu); const lv = Math.hypot(...ev); const nu = Math.max(1, Math.ceil(lu - 0.02)); const nv = Math.max(1, Math.ceil(lv - 0.02));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const s0 = i / nu; const s1 = (i + 1) / nu; const t0 = j / nv; const t1 = (j + 1) / nv;
      const P = (s, q) => [o[0] + eu[0] * s + ev[0] * q, o[1] + eu[1] * s + ev[1] * q, o[2] + eu[2] * s + ev[2] * q];
      const pts = [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
      quad(pts, nrm, key, Math.min(1, lu / nu), Math.min(1, lv / nv), t, aoFn ? pts.map(aoFn) : null, e);
    }
  }
  // an oriented box: centre x z, bottom y, size, turned rot about Y; tiles {top, side}; returns its world AABB
  function box(cx, y, cz, sx, sy, sz, rot, tiles, t, e) {
    const c = Math.cos(rot); const s = Math.sin(rot);
    const W = (lx, ly, lz) => [cx + lx * c + lz * s, y + ly, cz - lx * s + lz * c];
    const hx = sx / 2; const hz = sz / 2; const N = (x, z) => [x * c + z * s, 0, -x * s + z * c];
    const foot = (p) => 0.62 + 0.38 * Math.min(1, (p[1] - y) / 0.5 + (y > 0.2 ? 0.6 : 0));
    face(W(-hx, sy, -hz), [sx * c, 0, -sx * s], [sz * s, 0, sz * c], [0, 1, 0], tiles.top || tiles.side, t, e);
    face(W(-hx, 0, hz), [sx * c, 0, -sx * s], [0, sy, 0], N(0, 1), tiles.side, t, e, e ? null : foot);
    face(W(hx, 0, -hz), [-sx * c, 0, sx * s], [0, sy, 0], N(0, -1), tiles.side, t, e, e ? null : foot);
    face(W(hx, 0, hz), [-sz * s, 0, -sz * c], [0, sy, 0], N(1, 0), tiles.side, t, e, e ? null : foot);
    face(W(-hx, 0, -hz), [sz * s, 0, sz * c], [0, sy, 0], N(-1, 0), tiles.side, t, e, e ? null : foot);
    const xs = []; const zs = []; for (const [lx, lz] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) { const p = W(lx, 0, lz); xs.push(p[0]); zs.push(p[2]); }
    return [Math.min(...xs), y, Math.min(...zs), Math.max(...xs), y + sy, Math.max(...zs)];
  }
  // light every vertex: ambient by normal (times AO), the key direction, warm falloff from each light
  function bake(theme, lights, mat, C0) {
    const LK = theme.lightK || 1; const LW = theme.lightWhite || 0; // lightWhite: how far the baked torch light is pulled toward white (a theme whose stone must not read orange)
    const col = new Float32Array(pos.length); const kd = theme.key.dir; const kl = Math.hypot(...kd); const K = [kd[0] / kl, kd[1] / kl, kd[2] / kl];
    for (let i = 0; i < pos.length / 3; i++) {
      const x = pos[i * 3]; const y = pos[i * 3 + 1]; const z = pos[i * 3 + 2];
      if (emi[i]) { col[i * 3] = tint[i * 3]; col[i * 3 + 1] = tint[i * 3 + 1]; col[i * 3 + 2] = tint[i * 3 + 2]; continue; }
      const nx = nor[i * 3]; const ny = nor[i * 3 + 1]; const nz = nor[i * 3 + 2]; const o = ao[i];
      const h = 0.5 + 0.5 * ny; let r = (theme.amb.ground[0] + (theme.amb.sky[0] - theme.amb.ground[0]) * h) * o; let g = (theme.amb.ground[1] + (theme.amb.sky[1] - theme.amb.ground[1]) * h) * o; let bl = (theme.amb.ground[2] + (theme.amb.sky[2] - theme.amb.ground[2]) * h) * o;
      const d = Math.max(0, nx * K[0] + ny * K[1] + nz * K[2]) * (0.5 + 0.5 * o); r += theme.key.color[0] * d; g += theme.key.color[1] * d; bl += theme.key.color[2] * d;
      if (C0) { const n2 = ((x - C0.x) / C0.rx) ** 2 + ((z - C0.z) / C0.rz) ** 2; if (n2 < 1) { const f = (1 - n2) * (1 - n2) * Math.max(0, ny) * C0.k; r += C0.c[0] * f; g += C0.c[1] * f; bl += C0.c[2] * f; } }
      for (const L of lights) {
        const dx = L.x - x; const dy = L.y - y; const dz = L.z - z; const dd = Math.hypot(dx, dy, dz); if (dd >= L.r) continue;
        const f = (1 - dd / L.r) ** 2 * L.k * LK * (0.3 + 0.7 * Math.max(0, (dx * nx + dy * ny + dz * nz) / Math.max(0.01, dd))) * (0.55 + 0.45 * o);
        r += (L.color[0] + (1 - L.color[0]) * LW) * f; g += (L.color[1] + (1 - L.color[1]) * LW) * f; bl += (L.color[2] + (1 - L.color[2]) * LW) * f;
      }
      col[i * 3] = tint[i * 3] * r; col[i * 3 + 1] = tint[i * 3 + 1] * g; col[i * 3 + 2] = tint[i * 3 + 2] * bl;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; return m;
  }
  return { quad, face, box, bake, get verts() { return pos.length / 3; } };
}

let MAT = null;
export function voxMaterial() { if (!MAT) { MAT = new THREE.MeshBasicMaterial({ map: voxAtlas().tex, vertexColors: true }); MAT.name = 'vox'; } return MAT; }

// ---- props: each a list of boxes in its local frame (base at y 0); lights come from LIGHTS by kind ----
const C = { wood: [0.62, 0.5, 0.42], dark: [0.42, 0.42, 0.46], stone: [0.82, 0.8, 0.78], iron: [0.36, 0.36, 0.4], rust: [0.9, 0.62, 0.5], leaf: [0.8, 0.95, 0.8], white: [1, 1, 1], moss: [0.8, 0.95, 0.75], cap: [2.0, 1.9, 0.6], teal: [0.6, 2.0, 1.7], wisp: [1.6, 2.4, 2.2] };
const FLAME = [2.4, 1.35, 0.5]; const GLASS = [2.2, 1.6, 0.9];
function flame(B, x, y, z, s) { B(x, y, z, 0.26 * s, 0.34 * s, 0.26 * s, { side: 'flame' }, FLAME, 1); B(x, y + 0.2 * s, z, 0.14 * s, 0.28 * s, 0.14 * s, { side: 'flame' }, [2.6, 1.9, 1.0], 1); }
const PROPS = {
  lamp: { h: 3.6, b(B, th) { B(0, 0, 0, 0.5, 0.3, 0.5, { side: 'stone' }, C.dark); B(0, 0.3, 0, 0.16, 3.1, 0.16, { side: 'metal_dark' }, C.iron); B(0.35, 3.3, 0, 0.9, 0.12, 0.12, { side: 'metal_dark' }, C.iron); B(0.7, 2.95, 0, 0.32, 0.36, 0.32, { side: 'glass' }, th.cold ? [1.1, 1.7, 2.4] : GLASS, 1); }, light: [0.7, 3.0, 0] },
  coldlamp: { h: 3.6, b(B) { B(0, 0, 0, 0.5, 0.3, 0.5, { side: 'metal_dark' }, C.dark); B(0, 0.3, 0, 0.18, 3.1, 0.18, { side: 'metal_dark' }, C.iron); B(0, 3.3, 0, 0.7, 0.18, 0.4, { side: 'metal' }, C.iron); B(0, 3.18, 0, 0.56, 0.12, 0.3, { side: 'white' }, [0.75, 0.95, 1.15], 1); }, light: [0, 3.1, 0] },
  barrelfire: { h: 1.15, b(B) { B(0, 0, 0, 0.62, 0.82, 0.62, { side: 'rust', top: 'burnt' }, C.rust); flame(B, 0, 0.82, 0, 1); }, light: [0, 1.1, 0] },
  wreckfire: { h: 1.6, b(B, th, r) { PROPS.car.b(B, th, r); flame(B, 0.5, 1.15, 0, 1.4); flame(B, -0.6, 0.7, 0.3, 1.0); }, light: [0.3, 1.4, 0] },
  campfire: { h: 0.75, b(B) { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; B(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, 0.28, 0.22, 0.28, { side: 'rock' }, C.stone); } B(0, 0, 0, 0.9, 0.16, 0.2, { side: 'log', top: 'log_top' }, C.wood); B(0, 0.12, 0, 0.2, 0.16, 0.9, { side: 'log', top: 'log_top' }, C.wood); flame(B, 0, 0.2, 0, 1.5); }, light: [0, 0.6, 0] },
  torch: { h: 1.2, b(B) { B(0, 0, 0, 0.12, 0.95, 0.12, { side: 'log' }, C.wood); B(0, 0.85, 0, 0.2, 0.14, 0.2, { side: 'metal_dark' }, C.iron); flame(B, 0, 0.97, 0, 0.7); }, light: [0, 1.15, 0] },
  brazier: { h: 1.15, b(B) { B(0, 0, 0, 0.6, 0.55, 0.6, { side: 'stone' }, C.stone); B(0, 0.55, 0, 0.82, 0.26, 0.82, { side: 'metal_dark' }, C.iron); flame(B, 0, 0.8, 0, 1.2); }, light: [0, 1.1, 0] },
  mushrooms: { h: 0.65, b(B, th, r) { for (let i = 0; i < 5; i++) { const x = r.range(-0.5, 0.5); const z = r.range(-0.5, 0.5); const s = r.range(0.6, 1.1); B(x, 0, z, 0.08 * s, 0.32 * s, 0.08 * s, { side: 'white' }, [0.8, 0.75, 0.6]); B(x, 0.32 * s, z, 0.3 * s, 0.14 * s, 0.3 * s, { side: 'white' }, [2.2, 1.6, 0.5], 1); } }, light: [0, 0.5, 0] },
  crystal: { h: 2.4, b(B, th, r) { const n = r.int(2, 4); for (let i = 0; i < n; i++) { const x = r.range(-0.4, 0.4); const z = r.range(-0.4, 0.4); const hh = r.range(0.8, 2.3) * (i ? 0.7 : 1); B(x, 0, z, 0.36, hh, 0.36, { side: 'crystal' }, [1.1, 0.7, 1.7], 1); B(x, hh, z, 0.2, 0.2, 0.2, { side: 'crystal' }, [1.4, 1.0, 2.0], 1); } }, light: [0, 1.4, 0] },
  shard: { h: 0.9, b(B, th, r) { for (let i = 0; i < 3; i++) B(r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3), 0.22, r.range(0.4, 0.85), 0.22, { side: 'crystal' }, [0.9, 0.6, 1.4], 1); } },
  car: { h: 1.5, b(B, th, r) { const t = r.chance(0.5) ? 'hull' : 'hull_red'; B(0, 0.2, 0, 2.6, 0.7, 1.3, { side: t, top: t }, [0.85, 0.85, 0.85]); B(-0.15, 0.9, 0, 1.4, 0.5, 1.15, { side: 'metal_dark', top: t }, [0.7, 0.7, 0.74]); for (const sx of [-0.85, 0.85]) for (const sz of [-0.58, 0.58]) B(sx, 0, sz, 0.5, 0.42, 0.22, { side: 'tire' }, C.dark); } },
  hull: { h: 1.4, b(B) { B(0, 0.1, 0, 2.8, 0.5, 2.8, { side: 'metal', top: 'metal' }, [0.8, 0.85, 0.9]); B(0, 0.6, 0, 1.4, 0.6, 1.4, { side: 'metal_dark' }, [0.7, 0.75, 0.8]); for (const [x, z] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) B(x, 0.35, z, 0.22, 0.16, 0.22, { side: 'white' }, [0.6, 2.2, 1.4], 1); } },
  wall: { h: 3, b(B, th, r) { const t = th.wall || 'brick'; let x = -1.2; for (let i = 0; i < 4; i++) { const hh = r.range(0.8, 2.8); B(x + 0.4, 0, 0, 0.8, hh, 0.5, { side: t }, [0.85, 0.85, 0.85]); x += 0.8; } B(r.range(-1, 1), 0, 0.6, 0.5, 0.35, 0.5, { side: t }, [0.75, 0.75, 0.75]); } },
  pillar: { h: 3.6, b(B, th) { const t = th.wall || 'concrete'; B(0, 0, 0, 1.0, 0.3, 1.0, { side: t }, C.stone); B(0, 0.3, 0, 0.7, 3.0, 0.7, { side: t }, C.stone); B(0, 3.3, 0, 1.0, 0.3, 1.0, { side: t }, C.stone); } },
  obelisk: { h: 4.2, b(B, th) { const t = th.wall || 'sandstone'; B(0, 0, 0, 1.2, 0.4, 1.2, { side: t }, C.stone); B(0, 0.4, 0, 0.75, 2.6, 0.75, { side: t }, C.stone); B(0, 3.0, 0, 0.5, 0.9, 0.5, { side: t }, C.stone); B(0, 3.9, 0, 0.26, 0.3, 0.26, { side: t }, C.stone); } },
  tree: { h: 4.4, b(B, th, r) { const lf = th.day ? 'leaves' : 'leaves_teal'; B(0, 0, 0, 0.42, 2.2, 0.42, { side: 'log', top: 'log_top' }, C.wood); B(0, 1.8, 0, 2.0, 1.2, 2.0, { side: lf }, C.leaf); B(r.range(-0.2, 0.2), 3.0, r.range(-0.2, 0.2), 1.4, 0.9, 1.4, { side: lf }, C.leaf); B(0, 3.9, 0, 0.7, 0.5, 0.7, { side: lf }, C.leaf); } },
  deadtree: { h: 3.6, b(B, th, r) { B(0, 0, 0, 0.36, 2.6, 0.36, { side: 'bark_dark' }, C.wood); B(0.45, 1.6, 0, 0.8, 0.18, 0.18, { side: 'bark_dark' }, C.wood); B(0.8, 1.6, 0, 0.18, 0.9, 0.18, { side: 'bark_dark' }, C.wood); B(-0.35, 2.1, 0.1, 0.6, 0.16, 0.16, { side: 'bark_dark' }, C.wood); B(-0.6, 2.1, 0.1, 0.16, 0.7, 0.16, { side: 'bark_dark' }, C.wood); B(0, 2.6, 0, 0.2, 0.9, 0.2, { side: 'bark_dark' }, C.wood); void r; } },
  palm: { h: 4, b(B) { for (let i = 0; i < 5; i++) B(i * 0.08, i * 0.7, 0, 0.3, 0.7, 0.3, { side: 'log' }, C.wood); for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) B(0.32 + x * 0.7, 3.5 - Math.abs(x + z) * 0.25, z * 0.7, 1.4 * Math.abs(x) + 0.4, 0.14, 1.4 * Math.abs(z) + 0.4, { side: 'leaves_dark' }, [0.9, 1.0, 0.8]); } },
  tank: { h: 3.6, b(B) { B(0, 0, 0, 2.2, 3.0, 2.2, { side: 'frost_metal', top: 'snow' }, [0.85, 0.9, 1]); B(0, 3.0, 0, 1.4, 0.5, 1.4, { side: 'metal' }, [0.8, 0.85, 0.9]); B(1.3, 0, 0, 0.3, 2.4, 0.3, { side: 'metal_dark' }, C.iron); } },
  pipes: { h: 2.8, b(B) { B(0, 2.2, 0, 3.6, 0.42, 0.42, { side: 'metal' }, [0.8, 0.85, 0.9]); B(0, 1.5, 0.7, 3.6, 0.34, 0.34, { side: 'rust' }, C.rust); for (const x of [-1.5, 0, 1.5]) B(x, 0, 0.35, 0.3, 2.4, 0.3, { side: 'metal_dark' }, C.iron); } },
  crate: { h: 1.3, b(B, th, r) { B(0, 0, 0, 0.8, 0.8, 0.8, { side: 'crate' }, C.wood); if (r.chance(0.6)) B(0.75, 0, 0.2, 0.6, 0.6, 0.6, { side: 'crate' }, C.wood); if (r.chance(0.4)) B(0.05, 0.8, 0.05, 0.55, 0.45, 0.55, { side: 'crate' }, C.wood); } },
  barrel: { h: 0.9, b(B, th, r) { B(0, 0, 0, 0.55, 0.85, 0.55, { side: 'rust', top: 'metal_dark' }, C.rust); if (r.chance(0.5)) B(0.62, 0, 0.1, 0.55, 0.85, 0.55, { side: 'metal_dark' }, [0.6, 0.66, 0.6]); } },
  rocks: { h: 0.9, b(B, th, r) { for (let i = 0; i < 3; i++) { const s = r.range(0.35, 0.8); B(r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5), s, s * r.range(0.6, 1.1), s * r.range(0.8, 1.2), { side: th.rock || 'rock', top: th.rock || 'rock' }, C.stone); } } },
  icerock: { h: 0.9, b(B, th, r) { for (let i = 0; i < 3; i++) { const s = r.range(0.4, 0.8); B(r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5), s, s, s, { side: 'ice', top: 'snow' }, [0.9, 1, 1.1]); } } },
  sandbags: { h: 0.65, b(B) { for (let i = 0; i < 3; i++) B(-0.7 + i * 0.7, 0, 0, 0.66, 0.3, 0.45, { side: 'sandbag' }, C.white); for (let i = 0; i < 2; i++) B(-0.35 + i * 0.7, 0.3, 0, 0.66, 0.3, 0.45, { side: 'sandbag' }, C.white); } },
  cone: { h: 0.7, b(B) { B(0, 0, 0, 0.4, 0.08, 0.4, { side: 'white' }, [0.9, 0.35, 0.12]); B(0, 0.08, 0, 0.24, 0.3, 0.24, { side: 'white' }, [1.0, 0.45, 0.15]); B(0, 0.38, 0, 0.14, 0.24, 0.14, { side: 'white' }, [1, 1, 1]); } },
  tire: { h: 0.6, b(B, th, r) { const n = r.int(1, 3); for (let i = 0; i < n; i++) B(0, i * 0.22, 0, 0.7, 0.22, 0.7, { side: 'tire', top: 'tire' }, C.dark); } },
  fence: { h: 1.0, b(B) { for (const x of [-1.1, 0, 1.1]) B(x, 0, 0, 0.14, 1.0, 0.14, { side: 'plank' }, C.wood); B(0, 0.4, 0, 2.4, 0.12, 0.08, { side: 'plank' }, C.wood); B(0, 0.75, 0, 2.4, 0.12, 0.08, { side: 'plank' }, C.wood); } },
  bush: { h: 0.9, b(B, th, r) { const lf = th.day ? 'leaves' : 'leaves_teal'; B(0, 0, 0, 0.9, 0.7, 0.9, { side: lf }, C.leaf); if (r.chance(0.6)) B(0.5, 0, 0.3, 0.6, 0.5, 0.6, { side: lf }, C.leaf); } },
  urn: { h: 0.85, b(B) { B(0, 0, 0, 0.4, 0.12, 0.4, { side: 'sandstone' }, C.stone); B(0, 0.12, 0, 0.55, 0.5, 0.55, { side: 'sand_tile' }, [0.9, 0.7, 0.55]); B(0, 0.62, 0, 0.3, 0.2, 0.3, { side: 'sand_tile' }, [0.9, 0.7, 0.55]); } },
  // forest: a giant trunk on flared roots under a wide stepped canopy
  // canopy: the crown overhangs the rim terraces; only the trunk and roots count for where it may stand
  oldtree: { h: 8, canopy: true, b(B, th, r) {
    B(0, 0, 0, 1.3, 0.6, 1.3, { side: 'bark_old', top: 'moss_floor' }, C.wood); B(0, 0.6, 0, 1.1, 4.0, 1.1, { side: 'bark_old', top: 'bark_old' }, C.wood);
    for (const [x, z, sx, sz] of [[0.6, 0.1, 0.5, 0.36], [-0.6, -0.1, 0.5, 0.36], [0.1, 0.6, 0.36, 0.5], [-0.1, -0.6, 0.36, 0.5]]) { B(x, 0, z, sx, 0.4, sz, { side: 'roots', top: 'bark_old' }, C.wood); B(x * 1.3, 0, z * 1.3, sx * 0.6, 0.22, sz * 0.6, { side: 'roots', top: 'moss_floor' }, C.moss); }
    B(0.9, 3.2, 0, 1.0, 0.4, 0.5, { side: 'bark_old', top: 'bark_old' }, C.wood); B(-0.9, 3.7, 0.1, 1.0, 0.4, 0.5, { side: 'bark_old', top: 'bark_old' }, C.wood);
    // canopy heights jitter per tree so two trees side by side never put leaf tops in one plane
    const j = r.range(0, 0.35); B(0, 4.4 + j, 0, 3.8, 1.4, 3.8, { side: 'leaves_old' }, C.leaf); B(r.range(-0.2, 0.2), 5.7 + j, r.range(-0.2, 0.2), 3.0, 1.4, 3.0, { side: 'leaves_old' }, C.leaf); B(0, 7.0 + j, 0, 1.8, 1.1, 1.8, { side: 'leaves_old' }, C.leaf);
    B(1.5, 4.0, 1.1, 1.2, 0.7, 1.2, { side: 'leaves_old' }, C.leaf); B(-1.5, 4.0, -1.0, 1.2, 0.7, 1.2, { side: 'leaves_old' }, C.leaf);
    B(0.66, 1.9, 0.0, 0.1, 0.3, 0.4, { side: 'glowcap' }, C.teal, 1);
  } },
  roots: { h: 0.8, b(B, th, r) { let x = -0.9; for (let i = 0; i < 4; i++) { const hh = 0.35 + 0.25 * Math.sin(i * 1.3 + r.range(0, 1)); B(x + 0.25, 0, r.range(-0.1, 0.1), 0.55, hh, 0.36, { side: 'roots', top: 'bark_old' }, C.wood); x += 0.52; } B(-0.3, 0, 0.4, 0.28, 0.3, 0.6, { side: 'roots', top: 'bark_old' }, C.wood); B(0.4, 0, -0.4, 0.28, 0.26, 0.6, { side: 'roots', top: 'moss_floor' }, C.moss); } },
  glowshroom: { h: 0.9, b(B, th, r) { for (let i = 0; i < 4; i++) { const x = r.range(-0.45, 0.45); const z = r.range(-0.45, 0.45); const s = r.range(0.7, 1.3); B(x, 0, z, 0.1 * s, 0.4 * s, 0.1 * s, { side: 'white' }, [0.75, 0.7, 0.55]); B(x, 0.4 * s, z, 0.42 * s, 0.16 * s, 0.42 * s, { side: 'white' }, C.cap, 1); B(x, 0.56 * s, z, 0.24 * s, 0.1 * s, 0.24 * s, { side: 'white' }, [2.4, 2.2, 0.9], 1); } }, light: [0, 0.6, 0] },
  bluecap: { h: 0.9, b(B, th, r) { for (let i = 0; i < 4; i++) { const x = r.range(-0.45, 0.45); const z = r.range(-0.45, 0.45); const s = r.range(0.7, 1.3); B(x, 0, z, 0.1 * s, 0.4 * s, 0.1 * s, { side: 'white' }, [0.6, 0.8, 0.75]); B(x, 0.4 * s, z, 0.42 * s, 0.16 * s, 0.42 * s, { side: 'glowcap', top: 'glowcap' }, C.teal, 1); } }, light: [0, 0.6, 0] },
  mossrock: { h: 1.3, b(B, th, r) { for (let i = 0; i < 3; i++) { const s = r.range(0.6, 1.2); const x = r.range(-0.5, 0.5); const z = r.range(-0.5, 0.5); B(x, 0, z, s, s * r.range(0.6, 1.0), s * r.range(0.8, 1.2), { side: 'moss_stone', top: 'moss_floor' }, C.moss); } } },
  fern: { h: 0.7, b(B, th, r) { for (let i = 0; i < 4; i++) B(r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4), r.range(0.5, 0.8), r.range(0.3, 0.6), r.range(0.5, 0.8), { side: 'leaves_old' }, [0.9, 1.1, 0.8]); } },
  stump: { h: 1.2, b(B, th, r) { for (const [x, z, sx, sz] of [[0.6, 0, 0.5, 1.4], [-0.6, 0, 0.5, 1.4], [0, 0.6, 1.0, 0.5], [0, -0.6, 1.0, 0.5]]) B(x, 0, z, sx, 0.8 + r.range(0, 0.4), sz, { side: 'bark_old', top: 'bark_old' }, C.wood); B(0, 0, 0, 0.7, 0.2, 0.7, { side: 'moss_floor', top: 'moss_floor' }, C.moss); } },
  // swamp: stilt roots arching over the water under a flat crown, reeds, rotten logs, wisps
  mangrove: { h: 5.4, canopy: true, b(B, th, r) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { B(sx * 0.65, 0, sz * 0.65, 0.34, 0.9, 0.34, { side: 'bark_wet' }, C.wood); B(sx * 0.55, 0.9, sz * 0.55, 0.34, 0.7, 0.34, { side: 'bark_wet' }, C.wood); B(sx * 0.42, 1.6, sz * 0.42, 0.42, 0.55, 0.42, { side: 'bark_wet' }, C.wood); }
    B(0, 1.9, 0, 1.0, 0.5, 1.0, { side: 'bark_wet', top: 'bark_wet' }, C.wood); B(0, 2.4, 0, 0.8, 1.6, 0.8, { side: 'bark_wet', top: 'bark_wet' }, C.wood);
    B(0, 3.8, 0, 4.2, 0.9, 4.2, { side: 'leaves_dark' }, [0.7, 0.85, 0.5]); B(r.range(-0.3, 0.3), 4.6, r.range(-0.3, 0.3), 3.0, 0.8, 3.0, { side: 'leaves_dark' }, [0.7, 0.85, 0.5]);
    for (const [x, z] of [[1.6, 1.2], [-1.5, -1.3], [0.5, -1.8]]) B(x, 2.4, z, 0.08, 1.4, 0.08, { side: 'leaves_dark' }, [0.6, 0.75, 0.4]);
    B(0.0, 0.0, 0.0, 0.3, 0.1, 0.3, { side: 'algae', top: 'algae' }, [0.9, 1, 0.8]);
  } },
  reeds: { h: 1.9, b(B, th, r) { for (let i = 0; i < 9; i++) { const hh = r.range(1.0, 1.8); const x = r.range(-0.45, 0.45); const z = r.range(-0.45, 0.45); B(x, 0, z, 0.1, hh, 0.1, { side: 'reed' }, [0.9, 1, 0.8]); if (i % 3 === 0) B(x, hh, z, 0.14, 0.26, 0.14, { side: 'bark_wet' }, [0.8, 0.7, 0.6]); } } },
  log: { h: 0.8, b(B, th, r) { B(0, 0, 0, 1.8, 0.6, 0.6, { side: 'rotten', top: 'algae' }, [0.9, 0.95, 0.85]); B(-1.0, 0, 0.05, 0.3, 0.5, 0.5, { side: 'rotten', top: 'rotten' }, C.wood); if (r.chance(0.7)) B(0.3, 0.6, 0, 0.25, 0.14, 0.25, { side: 'cap_red', top: 'cap_red' }, [0.8, 0.8, 0.7]); B(0.4, 0.0, 0.45, 0.6, 0.3, 0.4, { side: 'rotten' }, C.wood); } },
  wisp: { h: 2.0, b(B) { B(0, 0, 0, 0.5, 0.5, 0.5, { side: 'bark_wet', top: 'algae' }, C.wood); B(0, 0.5, 0, 0.3, 0.45, 0.3, { side: 'bark_wet' }, C.wood); B(0, 1.15, 0, 0.3, 0.42, 0.3, { side: 'wisp' }, C.wisp, 1); B(0, 1.5, 0, 0.16, 0.34, 0.16, { side: 'wisp' }, [2.6, 3.0, 2.8], 1); B(0.35, 1.0, 0.1, 0.12, 0.12, 0.12, { side: 'wisp' }, C.wisp, 1); B(-0.3, 1.3, -0.2, 0.1, 0.1, 0.1, { side: 'wisp' }, C.wisp, 1); }, light: [0, 1.3, 0] },
  // volcano: clusters of basalt columns, smoking vents with a magma throat, obsidian shards, ash heaps, charred trunks
  basaltcol: { h: 4.2, b(B, th, r) {
    const n = r.int(4, 6); for (let i = 0; i < n; i++) { const a = i / n * 6.283 + r.range(-0.3, 0.3); const d = i ? r.range(0.35, 0.75) : 0; const hh = (i ? r.range(1.2, 3.2) : r.range(3.2, 4.2)); B(Math.cos(a) * d, 0, Math.sin(a) * d, 0.5, hh, 0.5, { side: 'basalt_col', top: 'basalt' }, [0.85, 0.82, 0.84]); }
    B(r.range(-0.6, 0.6), 0, 0.7, 0.5, 0.4, 0.5, { side: 'basalt_col', top: 'ash' }, [0.8, 0.78, 0.8]);
  } },
  vent: { h: 1.6, b(B, th, r) {
    for (const [x, z, s, h] of [[0.5, 0, 0.6, 0.7], [-0.5, 0.1, 0.6, 0.8], [0, 0.5, 0.7, 0.6], [0, -0.5, 0.7, 0.75]]) B(x, 0, z, s, h, s, { side: 'lava_rock', top: 'cinder' }, [0.9, 0.85, 0.85]);
    B(0, 0, 0, 0.5, 0.62, 0.5, { side: 'magma' }, [1.6, 0.9, 0.5], 1);
    // smoke: grey puffs stacked and drifting off the throat
    B(0.05, 0.9, 0, 0.5, 0.35, 0.5, { side: 'ash' }, [0.75, 0.72, 0.72]); B(0.2, 1.3, 0.1, 0.4, 0.3, 0.4, { side: 'ash' }, [0.68, 0.66, 0.66]); B(0.4, 1.65, 0.15, 0.3, 0.25, 0.3, { side: 'ash' }, [0.6, 0.58, 0.58]);
  }, light: [0, 0.7, 0] },
  obshard: { h: 1.0, b(B, th, r) { for (let i = 0; i < 3; i++) B(r.range(-0.35, 0.35), 0, r.range(-0.35, 0.35), 0.26, r.range(0.4, 1.0), 0.26, { side: 'obsidian' }, [0.9, 0.8, 0.85]); B(0, 0, 0, 0.6, 0.18, 0.6, { side: 'cinder' }, [0.9, 0.9, 0.9]); } },
  ashrock: { h: 1.1, b(B, th, r) { for (let i = 0; i < 3; i++) { const s = r.range(0.5, 1.0); B(r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5), s, s * r.range(0.5, 0.9), s, { side: 'lava_rock', top: 'ash' }, [0.85, 0.82, 0.82]); } } },
  charred: { h: 3.2, b(B, th, r) { B(0, 0, 0, 0.4, 2.4, 0.4, { side: 'burnt' }, [0.7, 0.66, 0.66]); B(0.4, 1.5, 0, 0.7, 0.16, 0.16, { side: 'burnt' }, [0.7, 0.66, 0.66]); B(0.7, 1.5, 0, 0.16, 0.8, 0.16, { side: 'burnt' }, [0.7, 0.66, 0.66]); B(-0.3, 2.0, 0.1, 0.5, 0.14, 0.14, { side: 'burnt' }, [0.7, 0.66, 0.66]); B(0.1, 0, 0.1, 0.12, 0.12, 0.12, { side: 'magma' }, [1.4, 0.7, 0.4], 1); } },
  // snow: tiered snowy pines, clear ice blocks, snow-capped rocks, a frost crystal giving cold light
  pine: { h: 5.4, b(B, th, r) {
    B(0, 0, 0, 0.36, 1.4, 0.36, { side: 'bark_dark' }, C.wood);
    let y = 1.0; for (const s of [2.4, 1.9, 1.4, 0.9]) { B(0, y, 0, s, 0.7, s, { side: 'pine', top: 'pine_snow' }, [0.95, 1.0, 1.0]); B(0, y + 0.7, 0, s * 0.7, 0.35, s * 0.7, { side: 'pine', top: 'pine_snow' }, [0.95, 1.0, 1.0]); y += 1.0; }
    B(0, y, 0, 0.3, 0.5, 0.3, { side: 'pine_snow' }, [1, 1, 1]);
  } },
  iceblock: { h: 1.4, b(B, th, r) { for (let i = 0; i < 3; i++) { const s = r.range(0.5, 0.95); B(r.range(-0.45, 0.45), 0, r.range(-0.45, 0.45), s, s * r.range(0.9, 1.5), s, { side: 'ice_clear', top: 'ice_clear' }, [0.95, 1.05, 1.15]); } } },
  snowrock: { h: 1.0, b(B, th, r) { for (let i = 0; i < 3; i++) { const s = r.range(0.45, 0.9); B(r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5), s, s * r.range(0.6, 1.0), s, { side: 'snow_rock', top: 'pine_snow' }, [0.9, 0.95, 1.0]); } } },
  frostcrystal: { h: 1.8, b(B, th, r) { B(0, 0, 0, 0.7, 0.3, 0.7, { side: 'snow_rock', top: 'pine_snow' }, C.stone); for (let i = 0; i < 3; i++) { const hh = r.range(0.6, 1.4) * (i ? 0.7 : 1); B(r.range(-0.2, 0.2), 0.3, r.range(-0.2, 0.2), 0.24, hh, 0.24, { side: 'ice_clear' }, [0.8, 1.1, 1.4], 1); } }, light: [0, 1.0, 0] },
  // coast: a wreck's hull ribs, a broken mast with a torn sail, driftwood, sea stacks, a ship's lantern on a post, seaweed
  ribs: { h: 2.6, b(B, th, r) {
    B(0, 0, 0, 3.0, 0.3, 0.5, { side: 'wreck', top: 'wreck' }, [0.9, 0.86, 0.8]);
    for (const x of [-1.2, -0.4, 0.4, 1.2]) { const hh = r.range(1.4, 2.4); for (const sd of [-1, 1]) { B(x, 0.2, sd * 0.5, 0.18, hh * 0.5, 0.18, { side: 'wreck' }, [0.8, 0.76, 0.7]); B(x, 0.2 + hh * 0.5, sd * 0.68, 0.18, hh * 0.5, 0.18, { side: 'wreck' }, [0.8, 0.76, 0.7]); } }
    B(-0.8, 0.2, -0.7, 1.4, 0.6, 0.12, { side: 'wreck' }, [0.75, 0.72, 0.66]);
  } },
  mast: { h: 4.6, b(B, th, r) { B(0, 0, 0, 0.8, 0.3, 0.8, { side: 'wreck' }, C.wood); B(0, 0.3, 0, 0.3, 4.0, 0.3, { side: 'log' }, C.wood); B(0, 3.2, 0, 2.2, 0.16, 0.16, { side: 'log' }, C.wood); B(0.5, 2.0, 0.05, 1.0, 1.1, 0.06, { side: 'white' }, [0.72, 0.68, 0.6]); B(0.9, 0.0, 0.4, 0.5, 0.1, 0.08, { side: 'log' }, C.wood); } },
  driftwood: { h: 0.6, b(B, th, r) { B(0, 0, 0, 1.8, 0.3, 0.3, { side: 'wreck', top: 'wreck' }, [0.85, 0.82, 0.76]); B(0.4, 0, 0.35, 0.9, 0.24, 0.24, { side: 'wreck' }, [0.8, 0.78, 0.72]); if (r.chance(0.6)) B(-0.5, 0, -0.35, 0.5, 0.2, 0.5, { side: 'seaweed', top: 'seaweed' }, [0.9, 1, 0.8]); } },
  seastack: { h: 3.4, b(B, th, r) { B(0, 0, 0, 1.4, 1.4, 1.3, { side: 'cliff', top: 'cliff' }, C.stone); B(0.1, 1.4, 0, 1.0, 1.2, 1.0, { side: 'cliff', top: 'cliff' }, C.stone); B(-0.1, 2.6, 0.05, 0.6, 0.8, 0.6, { side: 'cliff', top: 'seaweed' }, C.stone); B(0.7, 0, 0.5, 0.6, 0.5, 0.6, { side: 'cliff', top: 'seaweed' }, C.stone); } },
  lantern: { h: 2.2, b(B) { B(0, 0, 0, 0.5, 0.25, 0.5, { side: 'cliff' }, C.stone); B(0, 0.25, 0, 0.16, 1.7, 0.16, { side: 'wreck' }, C.wood); B(0.25, 1.85, 0, 0.6, 0.1, 0.1, { side: 'wreck' }, C.wood); B(0.45, 1.4, 0, 0.3, 0.38, 0.3, { side: 'glass' }, GLASS, 1); B(0.45, 1.78, 0, 0.2, 0.08, 0.2, { side: 'metal_dark' }, C.iron); }, light: [0.45, 1.55, 0] },
  seaweed: { h: 0.6, b(B, th, r) { for (let i = 0; i < 4; i++) B(r.range(-0.45, 0.45), 0, r.range(-0.45, 0.45), r.range(0.3, 0.6), r.range(0.1, 0.25), r.range(0.3, 0.6), { side: 'seaweed', top: 'seaweed' }, [0.9, 1, 0.85]); B(0.3, 0, -0.3, 0.3, 0.2, 0.3, { side: 'cliff' }, C.stone); } },
  // sky: round blossom trees, floating boulders over the meadow, cloud puffs on the rim, stone lanterns
  skytree: { h: 4.8, b(B, th, r) { B(0, 0, 0, 0.4, 2.6, 0.4, { side: 'log', top: 'log_top' }, C.wood); B(0.3, 1.6, 0, 0.6, 0.14, 0.14, { side: 'log' }, C.wood); B(0, 2.3, 0, 2.4, 1.2, 2.4, { side: 'leaves' }, [0.85, 1.0, 0.8]); B(r.range(-0.2, 0.2), 3.5, r.range(-0.2, 0.2), 1.7, 0.9, 1.7, { side: 'leaves' }, [0.9, 1.05, 0.85]); B(0.9, 2.6, 0.9, 0.4, 0.3, 0.4, { side: 'white' }, [1.0, 0.78, 0.86]); B(-0.8, 3.2, -0.6, 0.35, 0.3, 0.35, { side: 'white' }, [1.0, 0.8, 0.9]); } },
  floatrock: { h: 3.4, b(B, th, r) { B(0, 0, 0, 0.9, 0.25, 0.9, { side: 'skystone', top: 'meadow' }, C.stone); const y = r.range(1.5, 2.2); B(0, y, 0, 1.2, 0.6, 1.1, { side: 'skystone', top: 'meadow' }, C.stone); B(0.05, y - 0.4, 0, 0.8, 0.4, 0.7, { side: 'skystone' }, [0.7, 0.7, 0.72]); B(0.1, y - 0.7, 0, 0.4, 0.3, 0.4, { side: 'skystone' }, [0.6, 0.6, 0.64]); } },
  cloudpuff: { h: 1.0, b(B, th, r) { for (let i = 0; i < 4; i++) { const s = r.range(0.5, 0.9); B(r.range(-0.6, 0.6), r.range(0, 0.25), r.range(-0.5, 0.5), s * 1.3, s * 0.6, s, { side: 'cloud', top: 'cloud' }, [0.9, 0.92, 0.96]); } } },
  stonelamp: { h: 1.5, b(B) { B(0, 0, 0, 0.6, 0.2, 0.6, { side: 'skystone' }, C.stone); B(0, 0.2, 0, 0.26, 0.7, 0.26, { side: 'skystone' }, C.stone); B(0, 0.9, 0, 0.5, 0.36, 0.5, { side: 'glass' }, GLASS, 1); B(0, 1.26, 0, 0.7, 0.14, 0.7, { side: 'skystone' }, C.stone); B(0, 1.4, 0, 0.3, 0.12, 0.3, { side: 'skystone' }, C.stone); }, light: [0, 1.1, 0] },
  bones: { h: 0.3, b(B, th, r) { for (let i = 0; i < 4; i++) B(r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4), r.range(0.3, 0.6), 0.1, 0.1, { side: 'white' }, [0.9, 0.88, 0.8]); B(0, 0, 0, 0.25, 0.22, 0.25, { side: 'white' }, [0.9, 0.88, 0.8]); } },
};

// ---- the pad ----
// theme: a THEMES entry; seed: number; centre {x,y,z}: the floor's centre; ellipse {x,z}: the fight ellipse (or a small one
// for a satellite); fight: true for a pad heroes fight on (its floor covers 1.12 of the ellipse, props stay outside 1.1);
// boss: true for a boss arena (more lights); keep: [{x, z, r}] spots no prop may cover (the spawn gates); embers: [{x, z}] camp
// spots on the floor that glow with the embers of a fire (light only, no box); solid: [{x, z, r}] floor that must be there.
// Returns data plus build(lights) -> Mesh.
export function buildPad({ theme, seed, centre = { x: 0, y: 0, z: 0 }, ellipse, boss = false, fight = true, decor = true, avoid = null, gates = [], keep = [], embers = [], solid = [] }) {
  const t0 = performance.now();
  const rng = rngOf(seed * 7919 + 101); const E = ellipse; const cx = centre.x; const cy = centre.y; const cz = centre.z;
  const water = theme.abyss.type === 'water'; const waterY = theme.abyss.y;
  const norm = (x, z) => Math.hypot((x - cx) / E.x, (z - cz) / E.z);
  const ang = (x, z) => Math.atan2((z - cz) / E.z, (x - cx) / E.x);
  const W = (u, v) => [cx + (u - v) * R2, cz + (u + v) * R2];
  const G = (x, z) => { const dx = x - cx; const dz = z - cz; return [(dx + dz) * R2, (dz - dx) * R2]; };
  // boundary noise around the rim: a smooth wobble of a few lobes plus per-cell jitter
  const ph = [rng.range(0, 6.3), rng.range(0, 6.3), rng.range(0, 6.3)];
  const wob = (a) => 0.5 + 0.5 * (0.5 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(9 * a + ph[2]));
  const k0 = fight ? 1.12 : 0.75; const k1 = fight ? 1.42 : 1.15;
  const R = Math.ceil(Math.max(E.x, E.z) * (k1 + 0.2)) + 6;
  const cells = new Map(); const key = (i, j) => i + ',' + j;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const [x, z] = W(i + 0.5, j + 0.5); const n = norm(x, z);
    let inside = n < k0 + (k1 - k0) * wob(ang(x, z)) + (hash2(i, j, seed) - 0.5) * 0.12;
    if (fight && !inside) for (const [du, dv] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]]) { const p = W(i + du, j + dv); if (norm(p[0], p[1]) < 1.13) { inside = true; break; } }
    if (inside && avoid && avoid(x, z)) inside = false;
    if (inside) cells.set(key(i, j), { i, j, top: cy, lvl: 0 });
  }
  // the walking strip of a gate is solid out to the farthest floor along it: a ragged rim must not leave holes where a bridge lands
  for (const a of gates) {
    const ux = Math.cos(a); const uz = Math.sin(a); let sMax = 0;
    for (let s = 0; s < 40; s += 0.1) { const [u, v] = G(cx + ux * s, cz + uz * s); if (cells.has(key(Math.floor(u), Math.floor(v)))) sMax = s; }
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const [x, z] = W(i + 0.5, j + 0.5); const t = (x - cx) * ux + (z - cz) * uz; const o = Math.abs(-(x - cx) * uz + (z - cz) * ux);
      if (t > 0 && t < sMax + 0.4 && o < GATE_STRIP) { const k = key(i, j); if (!cells.has(k)) cells.set(k, { i, j, top: cy, lvl: 0 }); }
    }
  }
  // solid ground under the spawn gates past the rim, so a gate never hangs over a terrace
  for (const q of solid) for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const [x, z] = W(i + 0.5, j + 0.5); if (Math.hypot(x - q.x, z - q.z) > q.r) continue; const k = key(i, j); if (!cells.has(k)) cells.set(k, { i, j, top: cy, lvl: 0 });
  }
  // keep the piece connected to the centre
  { const keep = new Set(); const st = [[...G(cx, cz)].map(Math.floor)]; while (st.length) { const [i, j] = st.pop(); const k = key(i, j); if (keep.has(k) || !cells.has(k)) continue; keep.add(k); for (const [a, b] of DIRS) st.push([i + a, j + b]); } for (const k of [...cells.keys()]) if (!keep.has(k)) cells.delete(k); }
  const plateau = new Set(cells.keys());
  // terraces: rings outward, each a drop of 1 or 2 blocks, 1 to 3 rings by angle; notched at the outermost ring
  const steps = water ? [1, 2] : [1, 3]; let ring = [...plateau];
  const maxD = (a) => steps[0] + Math.floor(wob(a + 1.7) * (steps[1] - steps[0] + 0.99));
  for (let d = 1; d <= steps[1]; d++) {
    const next = [];
    for (const k of ring) {
      const c = cells.get(k);
      for (const [a, b] of DIRS) {
        const i = c.i + a; const j = c.j + b; const kk = key(i, j); if (cells.has(kk)) continue;
        const [x, z] = W(i + 0.5, j + 0.5); const D = maxD(ang(x, z)); if (d > D) continue;
        if (d === D && hash2(i, j, seed + 5) < 0.3) continue;
        const drop = hash2(Math.floor(ang(x, z) * 3), d, seed + 9) < 0.4 ? 2 : 1;
        let lvl = c.lvl - drop; if (water) lvl = Math.max(lvl, Math.floor(waterY - cy) + 1);
        if (avoid && avoid(x, z)) continue;
        if (water && cy + lvl <= waterY + 0.3) continue;
        cells.set(kk, { i, j, top: cy + lvl, lvl, d }); next.push(kk);
      }
    }
    ring = next;
  }
  const bottomOf = (c) => (water ? Math.min(c.top - 1, Math.floor(waterY) - 1) : cy - 5 - Math.floor(hash2(c.i, c.j, seed + 3) * 5 + vnoise(c.i * 0.3, c.j * 0.3, seed) * 4));
  for (const c of cells.values()) c.bot = bottomOf(c);

  // ---- outline of the floor (plateau) in world coordinates ----
  const outline = [];
  {
    const edges = new Map();
    for (const k of plateau) {
      const { i, j } = cells.get(k);
      if (!plateau.has(key(i, j - 1))) edges.set(key(i, j), [i + 1, j]);
      if (!plateau.has(key(i + 1, j))) edges.set(key(i + 1, j) + 'r', [i + 1, j + 1]);
      if (!plateau.has(key(i, j + 1))) edges.set(key(i + 1, j + 1) + 't', [i, j + 1]);
      if (!plateau.has(key(i - 1, j))) edges.set(key(i, j + 1) + 'l', [i, j]);
    }
    const from = new Map(); for (const [k, to] of edges) { const p = k.replace(/[rtl]$/, ''); if (!from.has(p)) from.set(p, []); from.get(p).push(to); }
    let best = [];
    const used = new Set();
    for (const start of from.keys()) {
      if (used.has(start)) continue; const loop = []; let cur = start; let guard = 0;
      while (guard++ < 20000) { if (used.has(cur) && cur === start && loop.length) break; const outs = from.get(cur); if (!outs || !outs.length) break; const nx = outs.pop(); used.add(cur); loop.push(cur.split(',').map(Number)); cur = key(nx[0], nx[1]); if (cur === start) break; }
      if (loop.length > best.length) best = loop;
    }
    for (let k = 0; k < best.length; k++) {
      const a = best[(k + best.length - 1) % best.length]; const b = best[k]; const c = best[(k + 1) % best.length];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) outline.push(W(b[0], b[1]));
    }
  }

  // ---- props on the rim, lights first ----
  const props = []; const lights = []; const boxes = [];
  const free = (x, z, r) => props.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 0.3);
  // 0.9 of the half width, not the 0.8 the look test measures: a tall prop just outside could lean its arm or crown in
  const near = (x, z) => z - cz > 0 && Math.abs(x - cx) < E.x * 0.9;
  // the corridors heroes run through to the neighbouring pads stay free of props
  const inGate = (x, z, r) => gates.some((a) => { const ux = Math.cos(a); const uz = Math.sin(a); return (x - cx) * ux + (z - cz) * uz > 0 && Math.abs(-(x - cx) * uz + (z - cz) * ux) < GATE_W / 2 + r; });
  const cellAt = (x, z) => { const [u, v] = G(x, z); return cells.get(key(Math.floor(u), Math.floor(v))); };
  // a spot for a prop of radius r: on a cell whose 3 x 3 neighbourhood is the same height, outside 1.1 of the ellipse
  // a spot for a prop: the ground under most of it is one height, and its whole extent stays outside 1.12 of the ellipse
  const spotOk = (x, z, r, ext) => {
    const c = cellAt(x, z); if (!c) return null;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2; const q = cellAt(x + Math.cos(a) * r * 0.55, z + Math.sin(a) * r * 0.55); if (!q || q.top !== c.top) return null;
      if (fight && norm(x + Math.cos(a) * ext, z + Math.sin(a) * ext) < 1.12) return null;
    }
    return c;
  };
  const th2 = { ...theme, wall: theme.side.rows[0][0], rock: theme.name === 'crypt' ? 'sandstone' : 'rock' };
  const propRng = (x, z) => rngOf(Math.round(x * 100) * 31 + Math.round(z * 100) + seed);
  // a dry run of the prop's boxes: its radius about the origin and its height
  const extent = (kind, x, z) => { let r = 0; let h = 0; PROPS[kind].b((lx, ly, lz, sx, sy, sz) => { if (ly < 2.6 || !PROPS[kind].canopy) r = Math.max(r, Math.hypot(Math.abs(lx) + sx / 2, Math.abs(lz) + sz / 2)); h = Math.max(h, ly + sy); }, th2, propRng(x, z)); return { r, h }; };
  const place = (kind, x, z, rot) => {
    const X = extent(kind, x, z); const r = Math.max(0.5, X.r);
    if (!free(x, z, r)) return false; const c = spotOk(x, z, r, X.r + 0.05); if (!c) return false;
    if (inGate(x, z, r)) return false;
    if (keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + r)) return false;
    if (fight && near(x, z) && c.top - cy + X.h > 1.2) return false;
    props.push({ kind, x, z, y: c.top, rot, r, h: X.h }); return true;
  };
  if (decor) {
    const th = theme; const want = fight ? (boss ? 8 : 7) : 2;
    // lights spread around the rim: try angles in order, each on the outer band of the floor or a terrace
    const tries = fight ? 40 : 10;
    for (let k = 0; k < want; k++) {
      const a0 = (k / want) * Math.PI * 2 + rng.range(-0.25, 0.25) + ph[0];
      for (let t = 0; t < tries; t++) {
        const a = a0 + rng.range(-0.35, 0.35); const kk = fight ? rng.range(1.17, 1.42) : rng.range(0.2, 0.8);
        const x = cx + Math.cos(a) * E.x * kk; const z = cz + Math.sin(a) * E.z * kk;
        const warmL = th.lights.filter((l) => LIGHTS[l[0]] && LIGHTS[l[0]].warm);
        let kind = rng.weighted(k < 5 && warmL.length ? warmL : th.lights);
        if (fight && near(x, z) && extent(kind, x, z).h > 1.2) kind = rng.pick(['torch', 'brazier', 'campfire', 'barrelfire'].filter((q) => th.lights.some((l) => l[0] === q)).concat(['torch']));
        if (place(kind, x, z, Math.PI / 4 + rng.int(0, 3) * Math.PI / 2)) break;
      }
    }
    // two more warm lights on the near rim between its gates and the flanks: the fight framing (camera.js) leaves the flanks
    // out of the frame and the far rim behind the top bar, so this arc is where the rim lights show
    const warmK = th.lights.filter((l) => LIGHTS[l[0]] && LIGHTS[l[0]].warm && LIGHTS[l[0]].h <= 1.2 && PROPS[l[0]] && PROPS[l[0]].light);
    if (fight && warmK.length) for (const side of [-1, 1]) for (let t = 0; t < 14; t++) {
      const a = Math.PI / 2 + side * (0.85 + rng.range(-0.12, 0.12)); const kk = rng.range(1.17, 1.3);
      if (place(rng.weighted(warmK), cx + Math.cos(a) * E.x * kk, cz + Math.sin(a) * E.z * kk, Math.PI / 4 + rng.int(0, 3) * Math.PI / 2)) break;
    }
    // the boss pad: braziers all along the far rim and flanks, and tall pillars there too (the near side stays low and open)
    if (boss && fight) {
      const brz = LIGHTS.brazier ? 'brazier' : 'torch';
      for (let k = 0; k < 6; k++) { const a = Math.PI + 0.35 + (k / 5) * (Math.PI - 0.7) + ph[1] * 0.02; for (let t = 0; t < 14; t++) { const kk = rng.range(1.18, 1.4); if (place(brz, cx + Math.cos(a + rng.range(-0.15, 0.15)) * E.x * kk, cz + Math.sin(a + rng.range(-0.15, 0.15)) * E.z * kk, 0)) break; } }
      for (const a0 of [-0.05, 0.4, 0.9, 1.4, 1.75, 2.2, 2.7, 3.2].map((v) => v + Math.PI)) for (let t = 0; t < 20; t++) { const a = a0 + rng.range(-0.12, 0.12); const kk = rng.range(1.2, 1.5); if (place('pillar', cx + Math.cos(a) * E.x * kk, cz + Math.sin(a) * E.z * kk, 0)) break; }
    }
    const nOther = fight ? 26 : rng.int(2, 4);
    for (let k = 0, t = 0; k < nOther && t < nOther * 25; t++) {
      const a = rng.range(0, Math.PI * 2); const kk = fight ? rng.range(1.15, 1.55) : rng.range(0, 0.9);
      const x = cx + Math.cos(a) * E.x * kk; const z = cz + Math.sin(a) * E.z * kk;
      const lowOnly = fight && near(x, z);
      const kind = lowOnly || rng.chance(0.55) ? rng.weighted(th.low) : rng.weighted(th.tall);
      const rot = kind === 'fence' || kind === 'wall' || kind === 'sandbags' ? -ang(x, z) + Math.PI / 2 : Math.PI / 4 + rng.int(0, 3) * Math.PI / 2 + (rng.chance(0.3) ? rng.range(-0.3, 0.3) : 0);
      if (place(kind, x, z, rot)) k++;
    }
  }

  // ---- anchors: spawn rim points every 30 degrees, and 3 bridge points on the floor's edge ----
  const anchors = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; anchors.push({ a, x: cx + Math.cos(a) * E.x * 1.04, z: cz + Math.sin(a) * E.z * 1.04 }); }
  const edgeAt = (a) => { let lastIn = 0; for (let s = 0; s < 40; s += 0.1) { const x = cx + Math.cos(a) * s; const z = cz + Math.sin(a) * s; const c = cellAt(x, z); if (c && plateau.has(key(c.i, c.j))) lastIn = s; } return { x: cx + Math.cos(a) * lastIn, z: cz + Math.sin(a) * lastIn, d: lastIn }; };

  const pad = {
    theme: theme.name, seed, centre: { x: cx, y: cy, z: cz }, ellipse: { x: E.x, z: E.z, cx, cz }, boss, fight, outline, anchors, props, lights, boxes, cells, plateau,
    edgeAt, cellAt, isFloor: (x, z) => { const c = cellAt(x, z); return !!c && plateau.has(key(c.i, c.j)); },
    bridges: [], buildMs: 0,
    // lights of this pad from its props (filled before build so neighbours can share them)
    build(allLights, extra) {
      const t1 = performance.now(); const M = mesher(); const th = theme;
      const pick = (list, i, j, s) => { let t = 0; for (const x of list) t += x[1]; let r = hash2(i, j, s) * t; for (const x of list) { r -= x[1]; if (r < 0) return x[0]; } return list[0][0]; };
      const tintT = th.top.tint || [1, 1, 1]; const rimT = th.rimTint || [1, 1, 1]; // rimTint: the theme's own multiplier for the terraces, satellites and cliff faces
      // tops
      for (const c of cells.values()) {
        const [x, z] = W(c.i + 0.5, c.j + 0.5); const onFloor = plateau.has(key(c.i, c.j));
        let tile; let tn;
        if (onFloor && fight) {
          // contiguous regions, never a per-cell checker: patches where a low-frequency noise is high, a second base tile
          // where another one is, the main tile elsewhere
          const pn = vnoise(x * 0.14 + seed, z * 0.14, seed + 17) * 0.75 + vnoise(x * 0.45, z * 0.45, seed + 19) * 0.25;
          const pn2 = vnoise(x * 0.2 - seed, z * 0.2, seed + 23);
          const pk = th.top.patch; const bk = th.top.base;
          tile = pn > 1 - th.top.patchK ? pk[Math.min(pk.length - 1, Math.floor(vnoise(x * 0.09, z * 0.09, seed + 29) * pk.length))][0] : (bk.length > 1 && pn2 > 0.68 ? bk[1][0] : bk[0][0]);
          const v = 1 + (hash2(c.i, c.j, seed + 4) - 0.5) * 0.04; tn = [tintT[0] * v, tintT[1] * v, tintT[2] * v];
        } else { tile = onFloor ? pick(th.sat.top, c.i, c.j, seed + 2) : pick(th.edge, c.i, c.j, seed + 6); const v = 0.95 + hash2(c.i, c.j, seed + 4) * 0.1; tn = [v * rimT[0], v * rimT[1], v * rimT[2]]; }
        // AO at a top corner: lower when a neighbouring column stands higher
        const aoC = (u, v) => { let hi = 0; for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const q = cells.get(key(u + a, v + b)); if (q && q.top > c.top + 0.01) hi++; } return hi ? 0.62 : 1; };
        const P = [[c.i, c.j], [c.i + 1, c.j], [c.i + 1, c.j + 1], [c.i, c.j + 1]];
        M.quad(P.map(([u, v]) => { const w = W(u, v); return [w[0], c.top, w[1]]; }), [0, 1, 0], tile, 1, 1, tn, P.map(([u, v]) => aoC(u, v)));
        // sides: one quad per block row where the neighbour does not cover it
        for (let s = 0; s < 4; s++) {
          const [a, b] = DIRS[s]; const nb = cells.get(key(c.i + a, c.j + b));
          const e0 = [[c.i, c.j], [c.i + 1, c.j], [c.i + 1, c.j + 1], [c.i, c.j + 1]][s]; const e1 = [[c.i + 1, c.j], [c.i + 1, c.j + 1], [c.i, c.j + 1], [c.i, c.j]][s];
          const w0 = W(...e0); const w1 = W(...e1); const nrm = [(a - b) * R2, 0, (a + b) * R2];
          for (let y = c.top; y > c.bot; y -= 1) {
            const y0 = Math.max(c.bot, y - 1); if (nb && nb.top >= y - 0.01 && nb.bot <= y0 + 0.01) continue;
            const row = Math.round(c.top - y);
            const tile2 = row === 0 ? (onFloor && !fight ? th.sat.side : pick(th.side.top.map((q) => [q, 1]), c.i + s, c.j, seed + 7)) : pick(th.side.rows, c.i * 3 + s, Math.round(y), seed + 8);
            const dk = Math.max(0.22, 1 - row * 0.16); const ao0 = Math.max(0.2, dk - 0.16); const sh = water && y0 < waterY + 0.8 ? 0.55 : 1;
            M.quad([[w0[0], y, w0[1]], [w1[0], y, w1[1]], [w1[0], y0, w1[1]], [w0[0], y0, w0[1]]], nrm, tile2, 1, y - y0, rimT, [dk, dk, ao0 * sh, ao0 * sh]);
          }
          // theme.falls: now and then a rim face pours a waterfall down past the cliff into the abyss (emissive streaks, a foam lip)
          if (th.falls && !nb && hash2(c.i * 7 + s, c.j, seed + 41) < th.falls) {
            const o = 0.06; const ox = nrm[0] * o; const oz = nrm[2] * o; const len = th.falls_len || 12;
            M.face([w0[0] + ox, c.top - len, w0[1] + oz], [w1[0] - w0[0], 0, w1[1] - w0[1]], [0, len, 0], nrm, 'falls', [0.78, 0.86, 0.95], true);
            M.box((w0[0] + w1[0]) / 2 + nrm[0] * 0.12, c.top - 0.08, (w0[1] + w1[1]) / 2 + nrm[2] * 0.12, 0.9, 0.16, 0.3, Math.atan2(nrm[0], nrm[2]), { side: 'cloud', top: 'cloud' }, [0.85, 0.9, 0.95], true);
          }
        }
      }
      // props
      for (const p of props) {
        const r = propRng(p.x, p.z);
        // the prop's boxes are gathered first: one laid over another with a face in the same plane is lifted clear of it
        const L = []; PROPS[p.kind].b((lx, ly, lz, sx, sy, sz, tiles, t, e) => L.push([[lx - sx / 2, ly, lz - sz / 2], [lx + sx / 2, ly + sy, lz + sz / 2], tiles, t, e]), th2, r);
        const c = Math.cos(p.rot); const s = Math.sin(p.rot);
        for (const [a, b, tiles, t, e] of liftCoplanar(L)) {
          const lx = (a[0] + b[0]) / 2; const lz = (a[2] + b[2]) / 2;
          boxes.push(M.box(p.x + lx * c + lz * s, p.y + a[1], p.z - lx * s + lz * c, b[0] - a[0], b[1] - a[1], b[2] - a[2], p.rot, tiles, t, e));
        }
      }
      for (const b of this.bridges) b.emit(M);
      if (extra) extra(M);
      const mesh = M.bake(th, allLights, voxMaterial(), fight && th.centre ? { x: cx, z: cz, rx: E.x * 1.25, rz: E.z * 1.35, c: th.centre, k: 1 } : null); mesh.name = 'pad'; this.buildMs += performance.now() - t1; this.verts = M.verts; return mesh;
    },
  };
  // the lights of the props, in world space
  for (const p of props) {
    const P = PROPS[p.kind]; const L = LIGHTS[p.kind]; if (!L || !P.light) continue;
    const c = Math.cos(p.rot); const s = Math.sin(p.rot); const [lx, ly, lz] = P.light;
    lights.push({ kind: p.kind, x: p.x + lx * c + lz * s, y: p.y + ly, z: p.z - lx * s + lz * c, ground: p.y, color: boss && L.warm ? [L.color[0], L.color[1] * 0.72, L.color[2] * 0.5] : L.color, r: L.r * (boss ? 1.15 : 1), k: L.k * (boss ? 1.5 : 1), warm: L.warm, glow: L.glow, glowC: L.glowC });
  }
  // a camp's fire burnt down to embers: warm light on the floor where the pack stood, no prop in the fight area
  for (const e of embers) lights.push({ kind: 'embers', x: e.x, y: cy + 0.35, z: e.z, ground: cy, color: [1.0, 0.5, 0.18], r: 4.2, k: 0.85, warm: 1, glow: 0 });
  pad.buildMs = performance.now() - t0;
  return pad;
}

// a plank bridge (or a ramp of planks) from a to b ({x,y,z}); posts with torches at both ends. Returns data with emit(M).
// the planks lie this far above the line from a to b: where the deck runs onto a pad its top sat in the pad floor's plane and
// z-fought with it (the end tread of every step bridge, the ends of a level bridge)
const DECK = 0.03;
export function buildBridge(a, b, theme, { width = 1.3, steps = false } = {}) {
  const dx = b.x - a.x; const dz = b.z - a.z; const L = Math.hypot(dx, dz); const rot = -Math.atan2(dz, dx); const ux = dx / L; const uz = dz / L;
  const lights = []; const tLight = LIGHTS.torch; const HW = width / 2 + 0.15;
  for (const [p, k] of [[a, 0.5], [b, L - 0.5]]) for (const side of [-1, 1]) {
    if (side === 1 && p === b) continue;
    lights.push({ kind: 'torch', x: a.x + ux * k - uz * side * HW, y: p.y + 1.25, z: a.z + uz * k + ux * side * HW, ground: p.y, color: tLight.color, r: tLight.r, k: tLight.k, warm: 1, glow: tLight.glow });
  }
  return {
    a, b, lights, dir: [ux, uz], theme: theme.name,
    // height of the deck's top at distance t along it: the tread the mesh really has (same rule as emit)
    deckY(t) {
      const n = steps ? Math.max(2, Math.round(Math.abs(b.y - a.y) / 0.25)) : Math.ceil(L / 0.5); const f = Math.max(0, Math.min(n - 1, Math.floor(t / L * n)));
      return DECK + (steps ? a.y + (b.y - a.y) * ((f + (b.y > a.y ? 1 : 0)) / n) : a.y + (b.y - a.y) * (f + 0.5) / n);
    },
    emit(M) {
      // planks on a slope, or (steps) flat treads one block deep that climb in equal risers
      const n = steps ? Math.max(2, Math.round(Math.abs(b.y - a.y) / 0.25)) : Math.ceil(L / 0.5);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n; const y = steps ? a.y + (b.y - a.y) * ((i + (b.y > a.y ? 1 : 0)) / n) : a.y + (b.y - a.y) * t;
        M.box(a.x + dx * t, y - 0.2 + DECK, a.z + dz * t, L / n * (steps ? 1.02 : 0.92), 0.2, width, rot, { side: 'plank_dark', top: 'plank' }, [0.7, 0.62, 0.56]);
      }
      for (const k of [0.5, L / 2, L - 0.5]) for (const side of [-1, 1]) {
        const t = k / L; const y = a.y + (b.y - a.y) * t; const px = a.x + ux * k - uz * side * HW; const pz = a.z + uz * k + ux * side * HW;
        M.box(px, y - 0.4, pz, 0.14, 1.4, 0.14, 0, { side: 'log' }, [0.6, 0.5, 0.42]);
      }
      const nr = Math.ceil(L / 0.5);
      for (const side of [-1, 1]) for (let i = 0; i < nr; i++) { const t = (i + 0.5) / nr; const y = a.y + (b.y - a.y) * t; M.box(a.x + dx * t - uz * side * HW, y + 0.75, a.z + dz * t + ux * side * HW, L / nr, 0.07, 0.07, rot, { side: 'log' }, [0.55, 0.45, 0.38]); }
      for (const Lt of lights) { M.box(Lt.x, Lt.y - 0.3, Lt.z, 0.2, 0.18, 0.2, { side: 'flame' }, FLAME, true); }
    },
  };
}
