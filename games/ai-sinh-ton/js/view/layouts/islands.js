// Floating islands: pads adrift high over a sea of cloud, joined by bridges of light (a glowing see-through deck between
// crystal pylons, with rails of light on both sides; the panes climb in floating treads where the next island stands two
// metres or more higher or lower). Under every pad its rock tapers down in a rough cone with spikes hanging off the rim and
// a crystal at the tip. The satellite islets bob slowly up and down (world.js, L.bob); the fight pad never moves.
import { voxMaterial } from '../pad.js?v=20261122a';
import { outerAt, bakeBoxes, deckRule, DECK } from './shared.js?v=20261122a';

const LIGHT = [0.42, 1.05, 1.45];   // the deck's panes (emissive tint of the white tile)
const RAIL = [0.9, 1.9, 2.3];       // the rails of light
const PYLON = [1.0, 1.6, 2.2];      // the crystal pylons at both ends
const CLEAR = 0.45;                 // the panes start this far from either end: never over a pad floor
let MAT = null;
const lightMat = () => {
  if (!MAT) { MAT = voxMaterial().clone(); MAT.name = 'lightdeck'; MAT.transparent = true; MAT.opacity = 0.68; MAT.depthWrite = false; }
  return MAT;
};
const mix = (a, b, k) => { const c = (h, s) => (h >> s) & 255; let o = 0; for (const s of [16, 8, 0]) o |= Math.round(c(a, s) + (c(b, s) - c(a, s)) * k) << s; return o; };

// a bridge of light from a to b ({x, y, z}): its own see-through mesh (the panes and rails) and the pylons, emitted into the
// pad's mesh; the deck height follows the plank bridge's rule so the heroes' feet land on the panes
function lightBridge(a, b, th, { width = 2.4, steps = false } = {}) {
  const dx = b.x - a.x; const dz = b.z - a.z; const L = Math.hypot(dx, dz); const ux = dx / L; const uz = dz / L; const rot = -Math.atan2(dz, dx);
  const rule = deckRule(a, b, L, steps); const HW = width / 2 + 0.3; const lights = [];
  const pyl = [];
  for (const [p, k] of [[a, 0.55], [b, L - 0.55]]) for (const side of [-1, 1]) {
    const x = a.x + ux * k - uz * side * HW; const z = a.z + uz * k + ux * side * HW; pyl.push([x, p.y, z]);
    if (side === 1) lights.push({ kind: 'crystal', x, y: p.y + 1.3, z, ground: p.y, color: [0.5, 0.85, 1.0], r: 4.5, k: 0.85, warm: 0, glow: 1.3, glowC: 0x7ad8ff });
  }
  const boxes = [];
  for (let f = 0; f < rule.n; f++) {
    const s0 = Math.max(CLEAR, (f / rule.n) * L); const s1 = Math.min(L - CLEAR, ((f + 1) / rule.n) * L); if (s1 - s0 < 0.05) continue;
    const m = (s0 + s1) / 2; const y = rule.yAt(f) + DECK; const x = a.x + ux * m; const z = a.z + uz * m; const len = s1 - s0;
    boxes.push([x, y - 0.09, z, len * (steps ? 0.96 : 0.9), 0.09, width, rot, { side: 'white' }, LIGHT, true]);
    for (const side of [-1, 1]) {
      const ox = -uz * side * (width / 2 + 0.08); const oz = ux * side * (width / 2 + 0.08);
      boxes.push([x + ox, y - 0.02, z + oz, len, 0.08, 0.1, rot, { side: 'white' }, RAIL, true]);
      boxes.push([x + ox, y + 0.78, z + oz, len, 0.05, 0.05, rot, { side: 'white' }, RAIL, true]);
    }
  }
  const mesh = bakeBoxes(boxes, th, [], 'lightbridge', lightMat()); mesh.renderOrder = 2;
  return {
    a, b, lights, dir: [ux, uz], theme: th.name, light: true, mesh,
    deckY: rule.deckY,
    emit(M) {
      for (const [x, y, z] of pyl) {
        M.box(x, y - 0.3, z, 0.5, 0.5, 0.5, 0.78, { side: 'rock' }, [0.7, 0.72, 0.78]);
        M.box(x, y + 0.2, z, 0.24, 1.15, 0.24, 0.78, { side: 'crystal' }, PYLON, true);
        M.box(x, y + 1.35, z, 0.14, 0.22, 0.14, 0.78, { side: 'crystal' }, [1.6, 2.2, 2.6], true);
      }
    },
  };
}

export const ISLANDS = {
  gap: 7, sats: true, satBridges: false, bob: 0.22,
  yRange: () => [-2, 9],
  // a sea of cloud far below whatever the theme had (a lake under floating islands reads as a hole): the theme's own colours
  // pulled toward pale cloud
  abyss: (th) => ({ ...th.abyss, type: 'mist', y: -24, deep: mix(th.abyss.deep, 0x7484a0, 0.75), shallow: mix(th.abyss.shallow, 0xc8d6e6, 0.55), haze: mix(th.abyss.haze, 0x8a9cb4, 0.5), cloud: 1, mistK: 0.8 }),
  raft: null,
  bridge: lightBridge,
  tick(time) { if (MAT) MAT.opacity = 0.62 + 0.08 * Math.sin(time * 1.7); },
  // the rock under the pad: a rough cone tapering down from the columns' feet, spikes off the rim, a crystal at the tip
  extras({ main, theme: th, rng }) {
    const rockT = th.rock || th.side.rows[th.side.rows.length - 1][0]; const boxes = []; const B = (...a) => boxes.push(a);
    const E = main.ellipse; let y = -9; let k = 0.82; let ox = 0; let oz = 0;
    for (let l = 0; l < 6; l++) {
      const h = rng.range(2.2, 3.0); y -= h; ox += rng.range(-0.6, 0.6); oz += rng.range(-0.4, 0.4);
      B(ox, y, oz, E.x * 2 * k, h + 0.4, E.z * 2 * k * rng.range(0.9, 1.1), rng.range(-0.25, 0.25), { side: rockT, top: rockT }, [0.62 - l * 0.04, 0.62 - l * 0.04, 0.68 - l * 0.03]);
      k *= rng.range(0.62, 0.72);
    }
    B(ox, y - 1.6, oz, 0.6, 1.6, 0.6, 0.78, { side: 'crystal' }, [1.2, 1.7, 2.3], true);
    for (let s = 0; s < 9; s++) {
      const a = (s / 9) * Math.PI * 2 + rng.range(-0.2, 0.2); const r = outerAt(main, a) * rng.range(0.7, 0.9); const len = rng.range(3, 7); const w = rng.range(1.2, 2.2);
      let yy = -6 - rng.range(0, 3); let ww = w;
      for (let q = 0; q < 3; q++) { const hh = len / 3; yy -= hh; B(Math.cos(a) * r, yy, Math.sin(a) * r, ww, hh + 0.05, ww, rng.range(0, 1.5), { side: rockT }, [0.6, 0.6, 0.66]); ww *= 0.62; }
    }
    return { lights: [], build(all) { return [bakeBoxes(boxes, th, all, 'underside')]; } };
  },
};
