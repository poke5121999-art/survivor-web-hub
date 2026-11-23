// The battle world around the fight: the current pad (pad.js) at the origin, a few satellite islets and outcrops at the
// frame's corners joined by plank bridges, the water or fog abyss (abyss.js), and the living light: flickering additive
// glows at every source, soft warm pools on the floor, fireflies and embers (one Points draw), dislodged blocks that fall
// when monsters climb over the rim. Lighting of blocks is baked per stage (pad.js); units get the theme's cool hemisphere
// and a warm key from the host's lights.
// A stage is a map of 1 to 6 sections (rooms.js roomPlan: the layout picks how many and how they are joined), each a pad
// with its own satellites and lights on its own height; a link joins each pad to the next: a bridge or a stair of planks, a
// raft over the river, a bridge that falls once crossed, a bridge of light between floating islands, a walled corridor of
// a maze, a mine cart on a railway, rock stairs down a cave (the layout's own link builders, layouts/*.js). Each wave is fought in the room plan.waveRoom gives it; some rooms
// are only crossed. When a wave is cleared the scene slides along the links to the next wave's pad while the heroes run
// over them (the sim waits). The layout's own pieces (an arena's stands, a mountain flank, a river) come from
// layouts/<kind>.js, the hazards' look from layouts/hazards.js. Two or three sections are meshed at a time.
// Before pad 1 there is a start room (section -1): a smaller empty pad where the team stands when the stage begins and
// from which it runs over a bridge into the first fight. Each fight pad has the spawn gates the sim walks later packs out
// of (gates.js, rooms.js), and the camp spots where the first pack waits are lit by embers. Monsters of a room the team
// has not reached yet are drawn on that room's pad (roomOffset).
import { ARENA } from '../sim/battle.js?v=20261122a';
import { THEMES, themeOf } from './themes.js?v=20261122a';
import { buildPad, buildBridge, rngOf, voxMaterial, mesher } from './pad.js?v=20261122a';
import { LAYOUTS, RAFT_Y } from './layouts/index.js?v=20261122a';
import { createHazards } from './layouts/hazards.js?v=20261122a';
import { createModes } from './layouts/modes.js?v=20261122a';
import { createAbyss } from './abyss.js?v=20261122a';
import { roomPlan } from '../sim/rooms.js?v=20261122a';
import { gateSpots, emitGates, gateLights, buildGateFx } from './gates.js?v=20261122a';
import { voxAtlas } from './voxtex.js?v=20261122a';
const THREE = window.THREE;

// satellites at the frame's corners (world x, z of the pad centre; the frame is about 21 m wide at the fight's depth)
const SATS = [[-11.6, 8.4, 1], [11.8, 8.2, 1], [-12.6, -8.6, 1], [12.4, -8.8, 1], [-17, 1.5, 0.7], [17, 0.5, 0.7]];
const DEBRIS = 48;
const BOSS_K = 1.12;      // the boss pad's floor is this much larger than a wave pad's
const START_K = 0.62;     // the start room is this much smaller than a wave pad
const PASS_K = 0.78;      // and a room the team only crosses
const START_WAIT = 0.55;  // the beat in the start room before the team sets off
const GAP = 5;            // metres of void between two pads at their widest
const NG = 64;            // glow and pool instances
const WALK_W = 2.4;       // width of the bridge heroes run over
const RUN_SPEED = 8;      // metres per second of the run between pads
const RAFT_SPEED = 6.5;   // and of a crossing that takes a raft
const RUN_WAIT = 0.35;    // the beat after a wave is cleared before the run starts
const FORM = [[0.7, -0.5], [0.7, 0.5], [-0.7, -0.5], [-0.7, 0.5]]; // heroes on the bridge: metres ahead of and beside the middle of the group

const GLOW_V = `attribute vec4 iA; attribute vec4 iB; uniform float uTime; uniform float uK; varying vec2 vUv; varying vec3 vC; varying float vF;
void main() {
  vUv = uv; vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float fl = 0.84 + 0.1 * sin(uTime * 9.0 + iB.w * 7.0) + 0.06 * sin(uTime * 23.0 + iB.w * 13.0); vF = fl * uK; vC = iB.rgb;
  vec3 p = iA.xyz + (right * position.x + up * position.y) * iA.w * (0.94 + 0.06 * fl);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;
const GLOW_F = `varying vec2 vUv; varying vec3 vC; varying float vF;
void main() { float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.4) * 0.75 + pow(max(0.0, 1.0 - r * 2.6), 2.0) * 0.6; gl_FragColor = vec4(vC * a * vF, 1.0);
#include <colorspace_fragment>
}`;
const POOL_V = `attribute vec4 iA; attribute vec4 iB; uniform float uTime; uniform float uK; varying vec2 vUv; varying vec3 vC; varying float vF;
void main() { vUv = uv; float fl = 0.88 + 0.12 * sin(uTime * 7.0 + iB.w * 5.0); vF = fl * uK; vC = iB.rgb; vec3 p = iA.xyz + vec3(position.x, 0.0, -position.y) * iA.w; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0); }`;
const POOL_F = `varying vec2 vUv; varying vec3 vC; varying float vF;
void main() { float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.0); gl_FragColor = vec4(vC * a * vF * 0.16, 0.0);
#include <colorspace_fragment>
}`;
const MOTE_V = `attribute vec4 aS; uniform float uTime; uniform float uScale; varying float vA; varying vec3 vC; attribute vec3 color;
void main() {
  vec3 p = position; float t = uTime * aS.y + aS.x * 6.283;
  if (aS.z < 0.5) { p += vec3(sin(t) * 1.3 + sin(t * 0.37) * 0.8, sin(t * 0.7 + aS.x * 3.0) * 0.45, cos(t * 0.83) * 1.1); vA = 0.55 + 0.45 * sin(uTime * 2.3 + aS.x * 40.0); }
  else { float h = fract(uTime * aS.y * 0.25 + aS.x); p += vec3(sin(t * 2.0) * 0.25 * h, h * 3.2, cos(t * 1.7) * 0.25 * h); vA = (1.0 - h) * smoothstep(0.0, 0.08, h); }
  vC = color; vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, aS.w * uScale / -mv.z);
}`;
const MOTE_F = `varying float vA; varying vec3 vC;
void main() { vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, 1.0);
#include <colorspace_fragment>
}`;

function instanced(n, vert, frag, blend) {
  const g = new THREE.InstancedBufferGeometry(); const base = new THREE.PlaneGeometry(1, 1);
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const A = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); const B = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  g.setAttribute('iA', A); g.setAttribute('iB', B); g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uTime: { value: 0 }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: blend === 'add' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return { mesh, A, B, g };
}

// ---- the map: one pad centre per room, each link a step in its direction and up or down, on a different height ----
const ZERO = { x: 0, y: 0, z: 0 };
// the battle being drawn (the world is made before the host object that holds it)
const curB = () => (window.__G && window.__G.B) || null;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const PLATEAU_K = 1.42;
// the size of room i's floor against a wave pad's (-1: the start room)
export function roomK(plan, i) { const r = plan.rooms[i]; return i < 0 ? START_K : r.boss && plan.rooms.length > 1 ? BOSS_K : r.boss ? 1.06 : r.pass ? PASS_K : 1; }
export function layoutMap(theme, n) {
  const plan = roomPlan(n, ARENA); const L = LAYOUTS[plan.layout]; const water = theme.abyss.type === 'water';
  const [yMin, yMax] = L.yRange(water); const R = plan.rooms.length;
  const reach = (k, a) => 1 / Math.hypot(Math.cos(a) / (ARENA.x * PLATEAU_K * k), Math.sin(a) / (ARENA.z * PLATEAU_K * k));
  const cs = [{ x: 0, y: 0, z: 0 }]; const gates = [];
  for (let i = 1; i < R; i++) {
    const p = cs[i - 1]; const boss = i === R - 1;
    const a = plan.exits[i - 1];
    const d = reach(roomK(plan, i - 1), a) + reach(roomK(plan, i), a) + L.gap;
    // the boss pad stands a step higher than the climb so far (a layout that goes down, the cave, takes it a step lower)
    let dy = plan.rises[i - 1]; if (boss && dy) dy = L.bossDown ? -(Math.abs(dy) + 1) : Math.abs(dy) + 1;
    if (p.y + dy > yMax || p.y + dy < yMin) dy = -dy;
    const y = Math.max(yMin, Math.min(yMax, p.y + dy));
    cs.push({ x: p.x + Math.cos(a) * d, y, z: p.z + Math.sin(a) * d }); gates.push(a);
  }
  // the start room behind pad 1, on the far side from pad 2
  const sa = plan.start; const ds = reach(START_K, sa) + reach(roomK(plan, 0), sa) + GAP;
  const start = { x: Math.cos(sa) * ds, y: Math.max(yMin, Math.min(yMax, plan.startRise)), z: Math.sin(sa) * ds };
  return { centres: cs, gates, start, startA: sa, plan, R, L };
}

export function createWorld(H) {
  const { scene, quality } = H; const low = quality.name === 'low';
  const root = new THREE.Group(); root.name = 'island'; scene.add(root);
  const lightG = new THREE.Group(); lightG.name = 'glow'; scene.add(lightG);
  const abyss = createAbyss(H);
  const glows = instanced(NG, GLOW_V, GLOW_F, 'add'); glows.mesh.renderOrder = 7; lightG.add(glows.mesh);
  const pools = instanced(NG, POOL_V, POOL_F, 'add'); pools.mesh.renderOrder = 1; pools.mesh.material.polygonOffset = true; pools.mesh.material.polygonOffsetFactor = -2; lightG.add(pools.mesh);
  const NM = low ? 72 : quality.name === 'medium' ? 100 : 130;
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NM * 3), 3)); moteGeo.setAttribute('aS', new THREE.Float32BufferAttribute(new Float32Array(NM * 4), 4)); moteGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NM * 3), 3));
  const moteMat = new THREE.ShaderMaterial({ vertexShader: MOTE_V, fragmentShader: MOTE_F, uniforms: { uTime: { value: 0 }, uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; motes.renderOrder = 8; motes.name = 'motes'; lightG.add(motes);
  const dGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3); const dMat = new THREE.MeshBasicMaterial({ map: voxAtlas().tex, color: 0x888888 });
  const debris = new THREE.InstancedMesh(dGeo, dMat, DEBRIS); debris.count = 0; debris.frustumCulled = false; lightG.add(debris);
  const hazards = createHazards(H, curB);
  const bits = []; const m4 = new THREE.Matrix4(); const q4 = new THREE.Quaternion(); const e4 = new THREE.Euler(); const v4 = new THREE.Vector3(); const s4 = new THREE.Vector3(1, 1, 1);

  // Coordinates: every section is built in its own frame (its pad's centre is 0, 0, 0), which is the sim's frame while the
  // fight is on that pad. The scene shows the current section's frame moved by -shift; shift is zero at rest and runs
  // along the path to the next pad during a run, then the next section becomes the current one and shift is zero again.
  const W = {
    pad: null, pads: [], bridges: [], theme: THEMES[0], all: [], buildMs: 0, spawnTint: new THREE.Color(0x1a2430), boss: 0, key: '',
    sec: 0, busy: false, map: null, shift: { x: 0, y: 0, z: 0 }, runs: 0,
    // how fast the scene slides under the heroes during a run (m/s, scene frame): the ground moves by -vel, so a hero's speed over
    // the ground is its own motion in the scene plus this (actors.js drives the run cycle from it)
    vel: { x: 0, z: 0 },
    lights() { return W.all; },
    motesAlive() {
      const pos = moteGeo.attributes.position; let n = 0; const cam = H.camera;
      for (let i = 0; i < NM; i++) { v4.fromBufferAttribute(pos, i).project(cam); if (v4.z < 1 && Math.abs(v4.x) <= 1 && Math.abs(v4.y) <= 1) n++; }
      return n;
    },
  };
  // a special stage's rule drawn in the scene (layouts/modes.js): the Seed Egg, the Core over its carrier and its path
  const modes = createModes(H);
  // sections by index, -1 (the start room) to the last room (the boss pad)
  let secs = {}; let stageN = 1; let travel = null; let rng = rngOf(1);
  const N = () => (W.map ? W.map.R : 1);
  const plan = () => W.map.plan;
  // the room a wave (an index, the sim's e.room) is fought in
  const roomOfWave = (w) => { const p = W.map && W.map.plan; if (!p) return w; return p.waveRoom[Math.max(0, Math.min(p.waveRoom.length - 1, w | 0))]; };
  // the room the battle is in now: the wave's own while it is fought, the next wave's once it is cleared
  const roomNow = (B) => roomOfWave(B.phase === 'pick' ? B.wave : B.wave - 1);
  // sections whose bridge fell once the team was over it: the deck drops into the void
  const fallers = [];
  // the sim moves the team to the next room's entry when a wave is cleared (battle.js placeTeam, B.placeN); the run draws
  // the heroes from where they stood (u.from) until it has picked them up
  let placeSeen = 0; const offs = {};
  // the sim moved the team back to the entry of the room it is already in (two waves in one room): the heroes walk there
  let regroup = null;
  // objects drawn in the frame of the section that was current when they were last written (the horde's instances): the
  // scene slides under them with the pads, in the same frame as the pads, so nothing lags a frame behind during a run
  const followers = []; let followSec = 0; const bases = {};

  function setUnitsLight(th, boss) {
    if (!H.hemi) return;
    H.hemi.color.set(th.hemi.sky); H.hemi.groundColor.set(th.hemi.ground); H.hemi.intensity = th.hemi.k;
    H.sun.color.set(th.sun.color); H.sun.intensity = th.sun.k;
    if (boss) { const B = th.boss || {}; H.hemi.color.lerp(new THREE.Color(B.hemi || 0xff6a50), 0.22); H.sun.color.lerp(new THREE.Color(B.sun || 0xff5a30), 0.3); }
  }

  const cen = (i) => (i < 0 ? W.map.start : W.map.centres[i]);
  const delta = (i, j) => { const a = cen(i); const b = cen(j); return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; };
  const themeAt = (i) => { const th = W.theme; const ab = W.abyss || th.abyss; return { ...th, abyss: { ...ab, y: ab.y - cen(i).y } }; };
  // the bridge directions out of section i: on to the next pad, and back to where the team came from
  const exitOf = (i) => (i < 0 ? W.map.startA + Math.PI : i < N() - 1 ? W.map.gates[i] : null);
  const linkOf = (i) => (W.map.plan.links.find((l) => l.from === i) || { kind: 'bridge' }).kind;
  const entryOf = (i) => (i === 0 ? W.map.startA : i > 0 ? W.map.gates[i - 1] + Math.PI : null);
  const roomAt = (i) => (i >= 0 && W.map.plan ? W.map.plan.rooms[i] : null);

  // the boss pad is baked warmer and redder than the wave pads: the climax changes tone, it does not only get brighter
  // a theme's `boss` table overrides any of this (top, centre, amb, key) and sets the glow from below (deep {color, glowC}) and the
  // units' light (hemi, sun); its `pre` table overrides the same fields on pad 4, which leans toward the boss look
  const bossTheme = (t) => ({ ...t, amb: { sky: [t.amb.sky[0] * 1.32, t.amb.sky[1] * 0.8, t.amb.sky[2] * 0.62], ground: [t.amb.ground[0] * 1.9, t.amb.ground[1] * 0.8, t.amb.ground[2] * 0.6] }, key: { ...t.key, color: [t.key.color[0] * 1.4, t.key.color[1] * 0.9, t.key.color[2] * 0.6] }, ...t.boss });
  // a theme's `boss.crack` splits the boss floor in glowing seams of that colour (pad 4 shows the first, fainter ones):
  // emissive strips along block edges, with a few small lights on them so the floor around them catches the glow
  let seamMat = null;
  function seams(main, B, k, n, seed) {
    const r = rngOf(seed); const E = main.ellipse; const segs = []; const lights = []; const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const P = (u, v) => [(u - v) * Math.SQRT1_2, (u + v) * Math.SQRT1_2]; const warm = B.crack[0] > B.crack[2] ? 1 : 0;
    for (let c = 0; c < n; c++) {
      const a = r.range(0, 6.283); const q = r.range(0.05, 0.85); const x0 = Math.cos(a) * E.x * q; const z0 = Math.sin(a) * E.z * q;
      let u = Math.round((x0 + z0) * Math.SQRT1_2); let v = Math.round((z0 - x0) * Math.SQRT1_2); let d = r.int(0, 3); const len = r.int(3, 7);
      for (let s = 0; s < len; s++) {
        if (s && r.chance(0.55)) d = (d + (r.chance(0.5) ? 1 : 3)) % 4;
        const p = P(u, v); const p2 = P(u + D[d][0], v + D[d][1]); const mx = (p[0] + p2[0]) / 2; const mz = (p[1] + p2[1]) / 2; const ox = -(p2[1] - p[1]) * 0.3; const oz = (p2[0] - p[0]) * 0.3;
        if (!main.isFloor(mx + ox, mz + oz) || !main.isFloor(mx - ox, mz - oz)) break;
        segs.push([p, p2, 1 - (s / len) * 0.5]);
        if (s === 1 && lights.length < n * 0.7) lights.push({ kind: 'seam', x: mx, y: 0.4, z: mz, ground: 0, color: B.crack, r: 2.6, k: 0.55 * k, warm, glow: 0.8 * k, glowC: B.crackC });
        u += D[d][0]; v += D[d][1];
      }
    }
    // the strips cross and overlap at their joints: drawn in one mesh of their own that writes no depth (pulled a little toward
    // the camera), overlapping strips resolve by draw order every frame instead of z-fighting in the pad mesh
    const mesh = (th) => {
      if (!segs.length) return null; const M = mesher(); emit(M);
      if (!seamMat) { seamMat = voxMaterial().clone(); seamMat.depthWrite = false; seamMat.polygonOffset = true; seamMat.polygonOffsetFactor = -1; seamMat.polygonOffsetUnits = -2; }
      const m = M.bake(th, [], seamMat, null); m.name = 'seams'; m.renderOrder = 1; return m;
    };
    const emit = (M) => {
      for (const [p, p2, f] of segs) {
        const w = 0.05 + 0.06 * f; const dx = p2[0] - p[0]; const dz = p2[1] - p[1]; const ox = -dz * w; const oz = dx * w; const t = [B.crack[0] * k * f, B.crack[1] * k * f, B.crack[2] * k * f];
        M.quad([[p[0] + ox, 0.015, p[1] + oz], [p2[0] + ox, 0.015, p2[1] + oz], [p2[0] - ox, 0.015, p2[1] - oz], [p[0] - ox, 0.015, p[1] - oz]], [0, 1, 0], 'white', 0.1, 0.1, t, null, true);
      }
    };
    return { lights, mesh };
  }
  // the fight pad of section i (data only; meshed when the section is built)
  function mainOf(i) {
    const S = secs[i]; if (S.main) return S.main;
    const g = []; const ex = exitOf(i); const en = entryOf(i); if (ex !== null) g.push(ex); if (en !== null) g.push(en);
    const R = N(); const boss = i === R - 1; const k = roomK(plan(), i);
    // a standing gate close to a bridge's line could stand between the camera and the heroes on that bridge: it is drawn laid
    // in the floor instead (the sim walks monsters out of the same spot either way)
    const room = roomAt(i); const lines = g.map((a) => [Math.cos(a), Math.sin(a)]);
    // (a gate on the camera's side of the line hides the run from farther off: it stands between the camera and the heroes)
    const near = (q, c) => lines.some(([ux, uz]) => { const o = -q.x * uz + q.z * ux; return q.x * ux + q.z * uz > 0 && Math.abs(o) < (o * ux > 0 ? c + 2.2 : c); });
    S.spots = room ? gateSpots({ ...room, gates: room.gates.map((q) => (q.low || !near(q, q.big ? 5.2 : 4.4) ? q : { ...q, low: true, big: false })) }, ARENA) : [];
    // a one-room arena keeps the stage's own light through every wave: the boss look is for a climax room at the end of a walk
    // a layout whose links leave close by (the maze's short corridors) keeps a wider wedge free of props around each link: a
    // tree beside a corridor's mouth on the camera's side hid the heroes running out
    const lc = W.map.L.linkClear || 0; const clr = [];
    if (lc) for (const a of g) for (const o of [-lc, lc]) { const b = a + o; const rr = 1 / Math.hypot(Math.cos(b) / (ARENA.x * k), Math.sin(b) / (ARENA.z * k)); for (const q of [1.1, 1.3, 1.5]) clr.push({ x: Math.cos(b) * rr * q, z: Math.sin(b) * rr * q, r: 1.8 }); }
    S.main = buildPad({ theme: boss && R > 1 ? bossTheme(themeAt(i)) : i === R - 2 ? { ...themeAt(i), ...W.theme.pre } : themeAt(i), seed: stageN * 17 + 3 + i * 101, centre: { x: 0, y: 0, z: 0 }, ellipse: { x: ARENA.x * k, z: ARENA.z * k }, fight: true, boss, gates: g, keep: [...S.spots.map((p) => ({ x: p.cx, z: p.cz, r: p.r })), ...clr], embers: room ? room.camps : [], solid: S.spots.map((p) => ({ x: p.cx, z: p.cz, r: p.low ? 1.9 : 1.6 * p.s })) });
    return S.main;
  }

  function build(i) {
    const S = secs[i]; if (!S || S.group) return S;
    const t0 = performance.now(); const th = themeAt(i); const main = mainOf(i); const R = N(); const boss = i === R - 1 && R > 1; const water = th.abyss.type === 'water'; const r = rngOf(stageN * 131 + 7 + i * 53);
    const L = W.map.L; const others = []; const own = [];
    for (const j of [i - 1, i + 1]) if (j >= -1 && j < R) { const d = delta(i, j); others.push({ p: mainOf(j), d }); }
    // a section built again (after a retry went back to the start room) must not emit its bridges twice
    S.bridges = []; S.walk = null; main.bridges.length = 0;
    if (exitOf(i) !== null) {
      const a = exitOf(i); const d = delta(i, i + 1); const e = main.edgeAt(a); const f = mainOf(i + 1).edgeAt(a + Math.PI);
      const c = Math.cos(a); const s = Math.sin(a); const kind = linkOf(i);
      const p0 = { x: e.x - c * 0.4, y: 0, z: e.z - s * 0.4 }; const p1 = { x: d.x + f.x + c * 0.4, y: d.y, z: d.z + f.z + s * 0.4 };
      if (kind === 'raft' || kind === 'rail') {
        // no deck to walk: a raft waits at this bank (or a cart at this station) and carries the team over (moved by the run,
        // see update); a rail's track is part of the pad's mesh
        const raft = (kind === 'raft' ? L.raft : L.cart)(p0, p1, th); S.walk = raft; S.bridges.push(raft); own.push(raft.mesh);
        if (raft.emit) main.bridges.push(raft);
      } else {
        // the layout's own link (a bridge of light, a walled corridor, rock stairs) or the plank bridge; a link with a mesh of
        // its own (the light bridge's glowing deck) adds it to the section beside what it emits into the pad's mesh
        const b = (L.bridge || buildBridge)(p0, p1, th, { width: WALK_W, steps: Math.abs(d.y) >= 2 });
        S.walk = b; S.bridges.push(b); if (b.mesh && kind !== 'collapse') own.push(b.mesh);
        // a bridge that falls once crossed is a mesh of its own so it can drop; any other is part of the pad's mesh
        if (kind === 'collapse') { const M = mesher(); b.emit(M); b.mesh = M.bake(th, b.lights, voxMaterial(), null); b.mesh.name = 'bridge'; b.mesh.matrixAutoUpdate = true; b.falls = true; own.push(b.mesh); } else main.bridges.push(b);
      }
    }
    if (i > -1) { const d = delta(i, i - 1); const w = build(i - 1).walk; if (w && !w.raft) S.bridges.push({ a: { x: w.b.x + d.x, y: 0, z: w.b.z + d.z }, b: { x: w.a.x + d.x, y: d.y, z: w.a.z + d.z }, dir: [-w.dir[0], -w.dir[1]], lights: [], back: true }); }
    const near = (x, z) => {
      for (const [a, b] of [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]]) if (main.cellAt(x + a, z + b)) return true;
      for (const o of others) for (const [a, b] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (o.p.cellAt(x + a - o.d.x, z + b - o.d.z)) return true;
      for (const b of S.bridges) { const ux = b.dir[0]; const uz = b.dir[1]; const t = (x - b.a.x) * ux + (z - b.a.z) * uz; const L = Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z); if (t > -3 && t < L + 3 && Math.abs(-(x - b.a.x) * uz + (z - b.a.z) * ux) < 4) return true; }
      return false;
    };
    const sats = [];
    // the start room is a small pad of its own: no satellites crowd its cliffs
    for (const [x, z, sz] of i < 0 || !L.sats ? [] : SATS) {
      const sx = x + r.range(-1, 1); const sz2 = z + r.range(-0.8, 0.8); const y = water ? (th.abyss.y < -1.6 ? -1 : th.abyss.y + 0.5) : -r.range(1.5, 3.5);
      const p = buildPad({ theme: th, seed: stageN * 31 + sats.length * 7 + 1 + i * 211, centre: { x: sx, y, z: sz2 }, ellipse: { x: r.range(2.4, 3.4) * sz, z: r.range(1.7, 2.3) * sz }, fight: false, decor: sz >= 1, avoid: near });
      if (p.cells.size) sats.push(p);
    }
    for (const si of L.satBridges === false ? [] : [0, 3]) {
      const s = sats[si]; if (!s) continue;
      const a = Math.atan2(s.centre.z, s.centre.x); if (S.bridges.some((b) => b.raft || Math.abs(Math.atan2(Math.sin(a - Math.atan2(b.dir[1], b.dir[0])), Math.cos(a - Math.atan2(b.dir[1], b.dir[0])))) < 0.6)) continue;
      // nor across a spawn gate
      if (S.spots.some((p) => Math.abs(Math.atan2(Math.sin(a - Math.atan2(p.cz, p.cx)), Math.cos(a - Math.atan2(p.cz, p.cx)))) < 0.55)) continue;
      const e = main.edgeAt(a); const f = s.edgeAt(a + Math.PI); if (!e.d || !f.d) continue;
      const b = buildBridge({ x: e.x - Math.cos(a) * 0.3, y: 0, z: e.z - Math.sin(a) * 0.3 }, { x: f.x + Math.cos(a) * 0.3, y: s.centre.y, z: f.z + Math.sin(a) * 0.3 }, th);
      S.bridges.push(b); main.bridges.push(b);
    }
    const all = [...main.lights, ...sats.flatMap((s) => s.lights), ...S.bridges.flatMap((b) => b.lights)];
    // the boss pad glows from below: light (warm unless the theme's boss.deep says otherwise) climbing its cliffs on the far side and both flanks
    const deep = (th.boss && th.boss.deep) || { color: [1.0, 0.36, 0.12], glowC: 0xff5a20 };
    if (boss) for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; const e = main.edgeAt(a); all.push({ kind: 'deep', x: e.x + Math.cos(a) * 1.6, y: -2.6, z: e.z + Math.sin(a) * 1.6, ground: -3.2, color: deep.color, r: 7, k: 1.3, warm: deep.color[0] > deep.color[2] ? 1 : 0, glow: 3.0, glowC: deep.glowC }); }
    const B = th.boss || {}; const sm = B.crack && R > 1 && i >= R - 2 ? seams(main, B, boss ? 1 : 0.5, boss ? 14 : 5, stageN * 71 + i) : null; if (sm) all.push(...sm.lights);
    // the layout's own pieces around this pad (stands, the mountain flank, the river banks) and the hazards of the room
    const ex = i >= 0 ? L.extras({ i, room: roomAt(i), plan: plan(), main, theme: th, rng: rngOf(stageN * 61 + i * 17), cen: (j) => delta(i, j), at: cen(i), R, avoid: near, walk: S.walk }) : null;
    if (ex) all.push(...ex.lights);
    if (S.spots.length) all.push(...gateLights(S.spots, th));
    const g = new THREE.Group(); g.name = 'section' + i; g.add(main.build(all, S.spots.length ? (M) => emitGates(M, S.spots, th) : null)); for (const s of sats) { const m = s.build(all); if (L.bob) m.userData.bob = { a: L.bob, w: r.range(0.5, 0.8), p: r.range(0, 6.283) }; g.add(m); }
    if (S.spots.length) { const fx = buildGateFx(S.spots, th); g.add(fx); S.gfx = { mesh: fx, c: [0.12, 0.12, 0.12, 0.12], f: [0, 0, 0, 0] }; }
    const sk = sm && sm.mesh(th); if (sk) g.add(sk);
    if (ex) for (const m of ex.build(all)) g.add(m);
    for (const m of own) g.add(m);
    if (i >= 0) for (const m of hazards.build(i, th, plan())) g.add(m);
    // islands of this section and the next one overlap in places (terraces, satellite islets) with block tops at the same whole-metre
    // heights: sink each pad mesh by its own few millimetres (main pad 0 or 2 mm by section parity, satellites 4 mm and down) so
    // no two overlapping tops share a depth and z-fight; the fight floor moves at most 2 mm
    let np = 0; for (const m of g.children) { m.matrixAutoUpdate = true; if (m.name === 'pad') { m.geometry.translate(0, -0.002 * (np * 2 + (i % 2)), 0); np++; } }
    root.add(g); S.group = g; S.sats = sats; S.lights = all; S.buildMs = performance.now() - t0; W.buildMs += S.buildMs;
    return S;
  }
  function drop(i) { const S = secs[i]; if (!S || !S.group) return; for (const m of S.group.children) { m.geometry.dispose(); if (m.name === 'gatefx' || m.userData.ownMat) m.material.dispose(); } root.remove(S.group); S.group = null; S.gfx = null; hazards.drop(i); }

  function place() {
    const sh = W.shift;
    for (let j = -1; j < N(); j++) {
      const S = secs[j]; if (!S || !S.group) { offs[j] = null; continue; } const d = delta(W.sec, j); S.group.position.set(d.x - sh.x, d.y - sh.y, d.z - sh.z); S.group.updateMatrixWorld(true);
      const o = offs[j] || (offs[j] = { x: 0, y: 0, z: 0 }); o.x = d.x - sh.x; o.y = d.y - sh.y; o.z = d.z - sh.z;
    }
    if (followers.length && W.map) { const fd = delta(W.sec, followSec); for (const f of followers) { f.position.set(fd.x - sh.x, fd.y - sh.y, fd.z - sh.z); f.updateMatrixWorld(true); } }
    lightG.position.set(-sh.x, -sh.y, -sh.z); lightG.updateMatrixWorld(true);
    abyss.setShift(sh.x, sh.y, sh.z);
  }

  // glows, pools, motes and the abyss for the current section (and the lights of the next one, seen across the gap)
  function dress() {
    const th = W.theme; const cur = secs[W.sec]; const nxt = secs[W.sec + 1]; const prv = secs[W.sec - 1];
    const all = [...cur.lights];
    for (const [S, j] of [[nxt, W.sec + 1], [prv, W.sec - 1]]) if (S && S.group) { const d = delta(W.sec, j); for (const L of S.lights) all.push({ ...L, x: L.x + d.x, y: L.y + d.y, z: L.z + d.z, ground: L.ground + d.y, far: 1 }); }
    W.pad = cur.main; W.pads = [cur.main, ...cur.sats]; W.bridges = cur.bridges; W.all = cur.lights; W.spawnTint.set(th.rise);
    const proxies = [{ cellAt: (x, z) => cur.main.cellAt(x, z), centre: cur.main.centre }, ...cur.sats];
    for (const [S, j] of [[nxt, W.sec + 1], [prv, W.sec - 1]]) if (S && S.group) {
      const d = delta(W.sec, j);
      for (const p of [S.main, ...S.sats]) proxies.push({ cellAt: (x, z) => { const c = p.cellAt(x - d.x, z - d.z); return c ? { top: c.top + d.y } : null; }, centre: { y: p.centre.y + d.y } });
    }
    // a dark pit (the cave) does not catch the torches' glow: their warm spill on the mist read as a lit floor far below
    abyss.setStage(themeAt(W.sec), proxies, W.map.L.pitGlow === false ? [] : all);
    const gc = new THREE.Color(); let gi = 0;
    for (const L of all) {
      if (gi >= NG) break; if (L.gate) continue; // a gate's light has no halo or pool: its mouth and spill are the glow
      gc.set(L.glowC || th.glow); if (!L.glowC) gc.setRGB(L.color[0], L.color[1] * 0.8, L.color[2] * 0.6);
      const dk = th.day ? 0.6 : 1;
      glows.A.setXYZW(gi, L.x, L.y, L.z, L.glow * (th.day ? 0.7 : 1)); glows.B.setXYZW(gi, gc.r * dk, gc.g * dk, gc.b * dk, gi * 0.37);
      const lk = th.lightK || 1; pools.A.setXYZW(gi, L.x, L.ground + 0.03, L.z, L.r * 0.6); pools.B.setXYZW(gi, L.color[0] * lk, L.color[1] * lk, L.color[2] * lk, gi * 0.61); gi++;
    }
    // a layout's lantern (the cave): one more floor pool, moved under the team every frame (update)
    lantern = W.map.L.lantern && gi < NG ? { i: gi, x: 0, y: 0, z: 0, ...W.map.L.lantern } : null;
    if (lantern) { pools.A.setXYZW(gi, 0, 0.03, 0, lantern.r); pools.B.setXYZW(gi, lantern.color[0], lantern.color[1], lantern.color[2], 0); }
    glows.g.instanceCount = gi; pools.g.instanceCount = gi + (lantern ? 1 : 0); glows.A.needsUpdate = glows.B.needsUpdate = pools.A.needsUpdate = pools.B.needsUpdate = true;
    const P = moteGeo.attributes.position; const S = moteGeo.attributes.aS; const Cc = moteGeo.attributes.color; const fires = cur.lights.filter((L) => L.warm && L.kind !== 'lamp' && L.kind !== 'mushrooms');
    const fly = th.fly || (th.name === 'void' ? [0.8, 0.6, 1.0] : th.day ? [1.0, 0.95, 0.6] : [1.0, 0.85, 0.45]);
    for (let i = 0; i < NM; i++) {
      if (i < Math.min(NM * 0.35, fires.length * 5)) { const L = fires[i % fires.length]; P.setXYZ(i, L.x + rng.range(-0.2, 0.2), L.y - 0.1, L.z + rng.range(-0.2, 0.2)); S.setXYZW(i, rng.next(), rng.range(0.6, 1.2), 1, rng.range(0.09, 0.14)); Cc.setXYZ(i, 1.0, 0.55, 0.2); }
      else { const a = rng.range(0, 6.283); const kk = rng.range(0.95, 1.45); P.setXYZ(i, Math.max(-10.5, Math.min(10.5, Math.cos(a) * ARENA.x * kk)), rng.range(0.4, 2.6) - (kk > 1.25 ? rng.range(0, 1.5) : 0), Math.max(-5.5, Math.min(6.5, Math.sin(a) * ARENA.z * kk * 1.15))); S.setXYZW(i, rng.next(), rng.range(0.25, 0.6), 0, rng.range(0.1, 0.16)); Cc.setXYZ(i, fly[0], fly[1], fly[2]); }
    }
    P.needsUpdate = S.needsUpdate = Cc.needsUpdate = true;
    bits.length = 0; debris.count = 0;
  }

  // make section i the current one: it and its neighbour ahead are built, what lies two pads back is dropped
  // (arrived: the team walked in, so a bridge behind it that falls once crossed starts falling)
  function enter(i, arrived = false) {
    const from = W.sec;
    W.sec = i; W.shift.x = W.shift.y = W.shift.z = 0; W.vel.x = W.vel.z = 0; travel = null; W.busy = false; regroup = null; placeSeen = curB() ? curB().placeN || 0 : 0;
    build(i); if (i + 1 < N()) build(i + 1);
    for (let j = -1; j < N(); j++) if (j < i - 1 || j > i + 1) drop(j);
    fallers.length = 0;
    if (arrived) for (let j = Math.max(-1, from); j < i; j++) { const w = secs[j] && secs[j].walk; if (w && w.falls && w.mesh && secs[j].group) fallers.push({ j, w, t: 0 }); }
    dress(); place();
  }

  W.setStage = (def, wave = 1) => {
    const n = def.n | 0 || 1; const th = themeOf(def.biome || roomPlan(n, ARENA).biome, n); const k = th.name + ':' + n;
    // a battle that has not begun on its first wave starts in the start room
    const fresh = !!(curB() && curB().stage === def && curB().t === 0 && curB().wave === 1 && (wave | 0) <= 1);
    const secOf = () => (fresh ? -1 : roomOfWave((wave | 0) - 1));
    if (k === W.key) { const sec = secOf(); if (sec !== W.sec || travel) enter(sec); return W.theme; }
    for (let j = -1; j < N(); j++) drop(j);
    W.key = k; stageN = n;
    W.map = layoutMap(th, n); W.theme = W.map.L.theme ? W.map.L.theme(th) : th; W.abyss = W.map.L.abyss(W.theme); rng = rngOf(n * 131 + 7); W.buildMs = 0;
    // the followers' frame was a room of the old map, which may have fewer rooms: write them in the room entered now
    const sec = secOf(); followSec = sec;
    secs = {}; for (let i = -1; i < N(); i++) secs[i] = { i, c: cen(i), main: null, sats: [], lights: [], bridges: [], walk: null, group: null, buildMs: 0, spots: [], gfx: null };
    dMat.color.setRGB(W.theme.amb.sky[0] * 0.9, W.theme.amb.sky[1] * 0.9, W.theme.amb.sky[2] * 0.9);
    const uv = voxAtlas().uv(W.theme.side.rows[0][0]); const U = dGeo.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, uv[0] + (uv[2] - uv[0]) * (i % 2), uv[1] + (uv[3] - uv[1]) * ((i >> 1) % 2)); U.needsUpdate = true;
    enter(sec);
    W.boss = 0; setUnitsLight(W.theme, false); glows.mesh.material.uniforms.uK.value = 1; pools.mesh.material.uniforms.uK.value = 1;
    return W.theme;
  };

  // ---- the run to the next wave's pad ----
  // the walked line in the current section's frame: pad centre, then along every link to room j (over the floor of any room
  // only crossed), to where the team stands in room j
  function pathTo(j) {
    const pts = [{ x: 0, y: 0, z: 0 }];
    for (let k = W.sec; k < j; k++) {
      const d = delta(W.sec, k); const w = secs[k].walk;
      for (const q of w.path || [w.a, w.b]) pts.push({ x: d.x + q.x, y: d.y + q.y, z: d.z + q.z });
      if (k + 1 < j) { const c = delta(W.sec, k + 1); pts.push({ x: c.x, y: c.y, z: c.z }); }
    }
    const R = roomAt(j); const h = R ? R.home : { x: 0, z: 0 }; const d = delta(W.sec, j);
    pts.push({ x: d.x + h.x, y: d.y, z: d.z + h.z });
    const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    return { pts, len, L: len[len.length - 1] };
  }
  function sample(P, s, out) {
    s = Math.max(0, Math.min(P.L, s)); let i = 1; while (i < P.pts.length - 1 && P.len[i] < s) i++;
    const a = P.pts[i - 1]; const b = P.pts[i]; const l = P.len[i] - P.len[i - 1] || 1; const t = (s - P.len[i - 1]) / l;
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t; out.dx = (b.x - a.x) / l; out.dz = (b.z - a.z) / l; return out;
  }
  const smp = { x: 0, y: 0, z: 0, dx: 1, dz: 0 }; const hero = { x: 0, y: 0, z: 0, dx: 1, dz: 0, w: 0 };
  W.travelTo = (j) => {
    j = Math.max(0, Math.min(N() - 1, j | 0)); if (j === W.sec && !travel) return false;
    if (travel && travel.to === j) return true;
    if (travel || j <= W.sec) { enter(j); return false; }
    for (let k = W.sec + 1; k <= j; k++) build(k);
    for (let k = W.sec; k < j; k++) if (!secs[k].walk) { enter(j); return false; }
    const P = pathTo(j); let raft = null; for (let k = W.sec; k < j; k++) if (secs[k].walk.raft) raft = secs[k].walk;
    // where each hero stood when the run began: before the sim moved it to the next room's entry, if it just did
    const B = curB(); const from = []; const moved = !!B && (B.placeN || 0) !== placeSeen;
    if (B) for (const u of B.heroes) from[u.slot] = moved && u.from ? { x: u.from.x, z: u.from.z } : { x: u.x, z: u.z };
    placeSeen = B ? B.placeN || 0 : 0;
    // a ride (raft, cart) takes its own pace: a cart rolls a longer line than a raft poles across
    const T = raft !== null ? Math.max(3.2, Math.min(raft.maxT || 7, P.L / (raft.speed || RAFT_SPEED))) : Math.max(2.4, Math.min(j - W.sec > 1 ? 6.5 : 4.6, P.L / RUN_SPEED));
    travel = { to: j, t: W.sec < 0 ? -START_WAIT : -RUN_WAIT, T, P, s: 0, w: 0, from }; W.busy = true; W.runs++;
    return true;
  };
  // tools: every section built and placed at once (the whole map), in the current section's frame; returns the pad centres
  W.overview = () => { for (let j = -1; j < N(); j++) build(j); place(); return [-1, ...W.map.centres.map((c, j) => j)].map((j) => ({ j, ...delta(W.sec, j) })); };
  W.settle = () => { if (travel) enter(travel.to); regroup = null; };
  // tests: back to the start room of the current stage (the run to pad 1 is then started by travelTo(0))
  W.toStart = () => { if (W.map && W.map.start) enter(-1); return W.sec; };
  // the bridge heroes take to the next pad (tests): its ends, and how far the scene has slid when the group is mid-span
  W.walkBridge = () => { const b = secs[W.sec] && secs[W.sec].walk; if (!b) return null; if (b.midAt === undefined) b.midAt = Math.hypot((b.a.x + b.b.x) / 2, (b.a.z + b.b.z) / 2); return b; };
  // where hero `slot` is drawn during a run, in the scene's frame, given where the sim has it; null when no run is on
  W.heroAt = (slot, x, z) => {
    if (!travel && regroup) {
      const f = regroup.from[slot]; if (!f) return null; const u = smooth(0, 1, regroup.t / regroup.T);
      hero.x = f.x + (x - f.x) * u; hero.z = f.z + (z - f.z) * u; hero.y = 0; const dx = x - f.x; const dz = z - f.z; const l = Math.hypot(dx, dz) || 1; hero.dx = dx / l; hero.dz = dz / l; hero.w = 1; return hero;
    }
    if (!travel) {
      // the wave was just cleared and the sim has already moved the team to the next room's entry, but the run has not
      // started yet: keep the hero where it stood
      const B = curB(); const u = B && (B.placeN || 0) !== placeSeen ? B.heroes[slot] : null;
      if (!u || !u.from) return null;
      hero.x = u.from.x; hero.z = u.from.z; hero.y = 0; hero.dx = Math.cos(u.face); hero.dz = Math.sin(u.face); hero.w = 0; return hero;
    }
    const T = travel; const q = sample(T.P, T.s + FORM[slot % 4][0], smp); const l = FORM[slot % 4][1];
    const px = q.x - q.dz * l - W.shift.x; const pz = q.z + q.dx * l - W.shift.z; const w = T.w;
    // first half: from where the hero stood (on the old pad, which slides away with the scene); second half: to where the sim has it
    const f = T.t < T.T * 0.5 ? T.from[slot] : null; const bx = f ? f.x - W.shift.x : x; const bz = f ? f.z - W.shift.z : z;
    hero.x = bx + (px - bx) * w; hero.z = bz + (pz - bz) * w;
    // feet on whatever is under them (a stair tread, the raft), the path's own height only over the void
    const gy = W.groundAt(hero.x, hero.z); hero.y = gy !== null ? gy : (q.y - W.shift.y) * w; hero.dx = q.dx; hero.dz = q.dz; hero.w = w; return hero;
  };
  // the height of the ground under a point of the scene's frame (pad floors and the walked bridge), or null over the void
  W.groundAt = (x, z) => {
    const mx = x + W.shift.x; const mz = z + W.shift.z;
    const T = travel; const to = T ? T.to : Math.min(N() - 1, W.sec + 1);
    let y = null; let deck = null;
    for (let k = W.sec; k <= to; k++) {
      const S = secs[k]; if (!S || !S.main) continue; const d = delta(W.sec, k);
      if (y === null && S.main.isFloor(mx - d.x, mz - d.z)) y = d.y;
      // over a walked link the deck counts where it stands above the pad floor it overlaps (the first metres of a climb, the last of a descent)
      const b = k < to || !T ? S.walk : null;
      if (b) { const lx = mx - d.x - b.a.x; const lz = mz - d.z - b.a.z; const L = Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z); const t = lx * b.dir[0] + lz * b.dir[1]; const o = Math.abs(-lx * b.dir[1] + lz * b.dir[0]); if (t >= -0.3 && t <= L + 0.3 && o <= (b.halfW || WALK_W / 2) + 0.05) { const dy = d.y + b.deckY(Math.max(0, Math.min(L, t))); if (deck === null || dy > deck) deck = dy; } }
    }
    if (deck !== null && (y === null || deck > y)) y = deck;
    return y === null ? null : y - W.shift.y;
  };

  // where a monster arriving at (x, z) on the rim starts: out over the edge along the ellipse normal (or along a bridge)
  W.arrival = (x, z, e) => {
    const pad = W.pad; if (!pad) return null;
    // out of a spawn gate: from the gate's mouth onto the rim (a standing gate: a walk on the level, drawn like a bridge deck;
    // a gate in the floor: climbing up out of it)
    const G = secs[W.sec]; if (G && G.spots && G.spots.length) {
      // its own gate when the sim says which (the crowd may already have pushed it along the rim), else the nearest
      let best = e && e.gate !== undefined && (e.room === undefined || e.room === W.sec) ? G.spots[e.gate] || null : null; let bd = 3;
      if (!best) for (const p of G.spots) { const d = Math.hypot(p.rimX - x, p.rimZ - z); if (d < bd) { bd = d; best = p; } }
      if (best) { const dx = best.x - x; const dz = best.z - z; const d = Math.hypot(dx, dz) || 1; return { dx: dx / d, dz: dz / d, d, bridge: !best.low, gate: true, low: !!best.low, gi: best.gi, slope: 0 }; }
    }
    let dx = x / (ARENA.x * ARENA.x); let dz = z / (ARENA.z * ARENA.z); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (const b of W.bridges) {
      if (b.raft) continue; const ax = b.a.x - x; const az = b.a.z - z; if (Math.hypot(ax, az) < 2.4) { return { dx: b.dir[0], dz: b.dir[1], d: Math.min(5, Math.hypot(b.b.x - x, b.b.z - z)), bridge: true, slope: (b.b.y - b.a.y) / Math.max(1, Math.hypot(b.b.x - b.a.x, b.b.z - b.a.z)) }; }
    }
    let s = 0; while (s < 6 && pad.isFloor(x + dx * s, z + dz * s)) s += 0.25;
    return { dx, dz, d: s + 0.7, bridge: false, slope: 0 };
  };
  W.debris = (x, z, n, up = 3) => {
    for (let i = 0; i < n; i++) {
      if (bits.length >= DEBRIS) bits.shift();
      bits.push({ x: x + (Math.random() - 0.5) * 0.8, y: -0.1, z: z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * up, vz: (Math.random() - 0.5) * 1.5, r: Math.random() * 6, t: 0, s: 0.6 + Math.random() * 0.7 });
    }
  };
  let quakeT = 0;
  W.quake = (x, z) => {
    quakeT = 0.8; const pad = W.pad; if (!pad) return;
    for (let k = -3; k <= 3; k++) { const a = Math.atan2(z / ARENA.z, x / ARENA.x) + k * 0.12; const e = pad.edgeAt(Math.atan2(Math.sin(a) * ARENA.z, Math.cos(a) * ARENA.x)); W.debris(e.x, e.z, 2, 2); }
  };
  W.setBoss = (on) => {
    const k = on ? 1 : 0; if (k === W.boss) return; W.boss = k;
    setUnitsLight(W.theme, on); glows.mesh.material.uniforms.uK.value = on ? 1.25 : 1; pools.mesh.material.uniforms.uK.value = on ? 1.3 : 1;
  };

  // ---- rooms and gates ----
  // the offset from a room's own frame (the sim's while the fight is there) to the scene's, or null when its pad is not built
  // r is the sim's e.room, a wave index: the pad is that wave's room. A pack of a later wave in a room an earlier wave is
  // fought in is not drawn until its wave begins (it stands at a gate's mouth and shows as that gate flashes)
  const hiddenWave = (w) => { const B = curB(); const p = W.map && W.map.plan; if (!B || !p || w === undefined) return false; return w > B.wave - 1 && w > 0 && p.waveRoom[w] === p.waveRoom[w - 1]; };
  W.roomOffset = (r) => (r === undefined ? ZERO : hiddenWave(r) ? null : offs[roomOfWave(r)] || null);
  // for followers: write positions in the current section's frame (roomBase: a room's origin there, null when not built)
  W.follow = (o) => { followers.push(o); };
  W.syncFrame = () => {
    followSec = W.sec;
    for (let j = -1; j < N(); j++) { const S = secs[j]; if (!S || !S.group) { bases[j] = null; continue; } const d = delta(W.sec, j); const b = bases[j] || (bases[j] = { x: 0, y: 0, z: 0 }); b.x = d.x; b.y = d.y; b.z = d.z; }
    place();
  };
  W.roomBase = (r) => (r === undefined ? ZERO : hiddenWave(r) ? null : bases[roomOfWave(r)] || null);
  // every spawn gate of the built pads in the scene's frame: the mouth, and whether it is charging or releasing now
  W.gateList = () => {
    const out = [];
    for (let j = 0; j < N(); j++) { const S = secs[j]; const o = offs[j]; if (!S || !S.gfx || !o) continue; for (const p of S.spots) out.push({ room: j, gi: p.gi, x: p.x + o.x, z: p.z + o.z, c: S.gfx.c[p.gi], f: S.gfx.f[p.gi], open: S.gfx.c[p.gi] > 0.3 || S.gfx.f[p.gi] > 0.05 }); }
    return out;
  };
  // a pack (or a skill's call) came out of gate gi of the room wave w is fought in
  W.gateFlash = (w, gi) => { const S = secs[roomOfWave(w)]; if (S && S.gfx && gi >= 0 && gi < 4) S.gfx.f[gi] = 1; };
  // is (x, z) of the scene's frame on the start room's floor
  W.onStartFloor = (x, z) => { const S = secs[-1]; const o = offs[-1]; return !!(S && S.main && o) && S.main.isFloor(x - o.x, z - o.z); };
  // charge each built gate from the sim's queue: idle faintly, charge over the second before its pack is due (and hold while
  // the pack waits for room), flash on release, go dark once its room has nothing more to send
  function gateLevels(dt) {
    const B = curB();
    const now = B ? roomOfWave(B.wave - 1) : -1;
    // a wave that begins in the room the last one was fought in: its first pack stands at the standing gates' mouths
    if (B && B.phase === 'fight' && B.wave !== lastWave) { if (lastWave > 0 && hiddenWaveWas(B.wave - 1)) { const S = secs[now]; if (S && S.gfx) for (const p of S.spots) if (!p.low) S.gfx.f[p.gi] = 1; } lastWave = B.wave; }
    for (let j = 0; j < N(); j++) {
      const S = secs[j]; if (!S || !S.gfx) continue; const X = S.gfx;
      const here = !!B && now === j && B.phase === 'fight';
      for (const p of S.spots) {
        let want = 0.12;
        if (B && j < now) want = 0.02;
        if (here) {
          let more = false;
          for (const q of B.queue) { if (q.gate !== p.gi) continue; more = true; const due = q.at - B.waveT; if (due < 1.2) want = Math.max(want, 0.35 + 0.65 * Math.min(1, 1 - due / 1.2)); }
          if (!more) want = 0.05;
        }
        X.c[p.gi] += (want - X.c[p.gi]) * Math.min(1, dt * 6); X.f[p.gi] = Math.max(0, X.f[p.gi] - dt * 1.4);
      }
      const U = X.mesh.material.uniforms; U.uTime.value = time; U.uCharge.value.set(X.c[0], X.c[1], X.c[2], X.c[3]); U.uFlash.value.set(X.f[0], X.f[1], X.f[2], X.f[3]);
    }
  }

  let lastWave = 0;
  const hiddenWaveWas = (w) => { const p = W.map && W.map.plan; return !!p && w > 0 && p.waveRoom[w] === p.waveRoom[w - 1]; };

  let time = 0; let lantern = null;
  // the lantern pool follows the team: the middle of the living heroes (the run's group while it runs), in the current
  // section's frame (the glow group slides with the scene)
  function moveLantern(dt, B) {
    let x = 0; let y = 0; let z = 0; let n = 0;
    if (travel) { x = smp.x; y = smp.y; z = smp.z; n = 1; } else if (B) for (const u of B.heroes) if (u.alive) { x += u.x; z += u.z; n++; }
    if (!n) return; x /= n; z /= n; const k = Math.min(1, dt * 5);
    lantern.x += (x - lantern.x) * k; lantern.y += (y - lantern.y) * k; lantern.z += (z - lantern.z) * k;
    pools.A.setXYZW(lantern.i, lantern.x, lantern.y + 0.03, lantern.z, lantern.r); pools.A.needsUpdate = true;
  }
  W.lantern = () => lantern;
  W.update = (dt) => {
    time = (time + dt) % 4000;
    for (const m of [glows.mesh.material, pools.mesh.material, moteMat]) m.uniforms.uTime.value = time;
    moteMat.uniforms.uScale.value = H.renderer.domElement.height / (2 * Math.tan(H.camera.fov * Math.PI / 360));
    abyss.update(dt); gateLevels(dt);
    const Bn = curB(); const Lw = W.map && W.map.L;
    if (Lw && Lw.tick) Lw.tick(time);
    modes.update(dt, Bn && Bn.plan && Bn.plan.n === stageN ? Bn : null, W, window.__G && window.__G.actors);
    // the floating islands' satellites bob (the fight pad stays still)
    if (Lw && Lw.bob) for (let j = -1; j < N(); j++) { const S = secs[j]; if (S && S.group) for (const m of S.group.children) { const b = m.userData.bob; if (b) m.position.y = b.a * Math.sin(time * b.w + b.p); } }
    if (lantern) moveLantern(dt, Bn && Bn.plan && Bn.plan.n === stageN ? Bn : null);
    hazards.update(dt, Bn && Bn.plan && Bn.plan.n === stageN ? Bn : null, Bn ? roomNow(Bn) : W.sec, (r, h) => { const o = offs[r]; if (o && r === W.sec) W.debris(h.x + o.x, h.z + o.z, 10, 3); });
    // two waves in one room: once the first is cleared the sim puts the team back at the room's entry; walk them there
    if (Bn && !travel && !regroup && (Bn.placeN || 0) !== placeSeen && Bn.phase === 'pick' && roomNow(Bn) === W.sec) {
      const from = []; for (const u of Bn.heroes) from[u.slot] = u.from ? { x: u.from.x, z: u.from.z } : { x: u.x, z: u.z };
      regroup = { from, t: 0, T: 1.1 }; placeSeen = Bn.placeN || 0;
    }
    if (regroup) { regroup.t += dt; if (regroup.t >= regroup.T) regroup = null; }
    for (let k = fallers.length - 1; k >= 0; k--) {
      const F = fallers[k]; const m = F.w.mesh; F.t += dt; if (!secs[F.j] || !secs[F.j].group) { fallers.splice(k, 1); continue; }
      if (F.t < 0.5) { m.position.y = Math.sin(F.t * 60) * 0.04; continue; }
      if (!F.dust) { F.dust = true; const d = delta(W.sec, F.j); const w = F.w; for (let q = 0; q <= 4; q++) { const t = q / 4; W.debris(d.x + w.a.x + (w.b.x - w.a.x) * t, d.z + w.a.z + (w.b.z - w.a.z) * t, 3, 1.5); } }
      const u = F.t - 0.5; m.position.y = -4.5 * u * u; m.rotation.z = u * 0.25;
      if (m.position.y < -12) { m.visible = false; fallers.splice(k, 1); }
    }
    // the team leaves the start room only once the game runs (a battle begun paused waits there)
    const hold = W.sec < 0 && !!(window.__G && window.__G.paused);
    if (travel && !hold) {
      const T = travel; T.t += dt; const u = Math.max(0, T.t / T.T);
      if (u >= 1) enter(T.to, true);
      else {
        const x0 = W.shift.x; const z0 = W.shift.z;
        T.s = T.P.L * smooth(0, 1, u); T.w = smooth(0, 0.2, u) * (1 - smooth(0.82, 1, u)); sample(T.P, T.s, smp); W.shift.x = smp.x; W.shift.y = smp.y; W.shift.z = smp.z; place();
        // a raft on the way carries the group: it sits under the middle of the formation while that is over the water
        for (let k = W.sec; k < T.to; k++) { const w = secs[k].walk; if (w && w.raft) { const d = delta(W.sec, k); w.carry(smp.x - d.x, smp.z - d.z, time); } }
        if (dt > 1e-4) { W.vel.x = (W.shift.x - x0) / dt; W.vel.z = (W.shift.z - z0) / dt; }
      }
    }
    let n = 0;
    for (let i = bits.length - 1; i >= 0; i--) { const b = bits[i]; b.t += dt; b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.r += dt * 5; if (b.y < -9 || b.t > 2.5) bits.splice(i, 1); }
    for (const b of bits) { if (n >= DEBRIS) break; e4.set(b.r, b.r * 0.7, 0); q4.setFromEuler(e4); s4.setScalar(b.s); m4.compose(v4.set(b.x, b.y, b.z), q4, s4); debris.setMatrixAt(n++, m4); }
    debris.count = n; debris.instanceMatrix.needsUpdate = true;
    // the boss's arrival shakes the island (visual only)
    if (quakeT > 0 && !travel) { quakeT = Math.max(0, quakeT - dt); const g = secs[W.sec].group; const j = Math.sin(time * 70) * 0.05 * quakeT; g.children.forEach((m, k) => { m.position.y = j * (k === 0 ? 0.5 : 1.4); }); }
  };
  W.mat = voxMaterial();
  return W;
}
