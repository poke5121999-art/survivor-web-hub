// Rail: stations on one level joined by a railway over the water or the mist. The track (two rails on sleepers, carried
// on a timber trestle down into the void) runs from a platform edge, marked by a yellow line, to the next; a buffer stop
// sits at each end under the platform's lip and a lamp beside it (a tall one on the far side, a low lantern on the near
// side, so nothing stands up between the camera and the fight). A mine cart waits at the platform: the team steps in, the
// cart rolls the whole line (world.js moves it under the group, carry) and the team steps out at the next station.
import { mesher, voxMaterial } from '../pad.js?v=20261124a';
import { LIGHTS } from '../themes.js?v=20261124a';
import { DECK } from './shared.js?v=20261124a';

const CART = { L: 3.4, W: 2.5 };
const DOCK = CART.L / 2 + 0.9;  // metres from the platform to the cart's middle where it waits at either end
const RAIL_Y = -0.62;           // the rails' top (the cart's floor is level with the platforms)
const GAUGE = 1.5;              // between the rails
const baseOf = (th) => (th.abyss.type === 'water' ? th.abyss.y - 0.6 : -10);

function cart(a, b, th) {
  const dx = b.x - a.x; const dz = b.z - a.z; const L = Math.hypot(dx, dz); const ux = dx / L; const uz = dz / L; const rot = -Math.atan2(dz, dx);
  const c0 = { x: a.x + ux * DOCK, y: a.y, z: a.z + uz * DOCK }; const c1 = { x: b.x - ux * DOCK, y: b.y, z: b.z - uz * DOCK }; const span = Math.hypot(c1.x - c0.x, c1.z - c0.z);
  const base = baseOf(th); const lights = []; const lamps = [];
  for (const [p, k, back] of [[a, 0.25, 1], [b, L - 0.25, -1]]) {
    // the lamp stands beside the track on the platform; tall only where it is behind the fight (the far half of the pad)
    const side = 1; const lx = a.x + ux * k - uz * side * (CART.W / 2 + 0.75); const lz = a.z + uz * k + ux * side * (CART.W / 2 + 0.75);
    const far = (back > 0 ? uz : -uz) < -0.15; const h = far ? 2.4 : 0.85;
    lamps.push({ x: lx, z: lz, y: p.y, h }); const Lm = LIGHTS.lamp;
    lights.push({ kind: 'lamp', x: lx, y: p.y + h + 0.15, z: lz, ground: p.y, color: Lm.color, r: far ? 7 : 5, k: far ? 0.95 : 0.8, warm: 1, glow: far ? 1.9 : 1.2 });
  }
  // the cart: a riveted iron tub on four wheels, a lantern on a post at one corner
  const M = mesher(); const tub = [0.62, 0.5, 0.42]; const H = 0.55;
  M.box(0, -0.42, 0, CART.L, 0.44, CART.W, 0, { side: 'metal_dark', top: 'plank_dark' }, [0.6, 0.55, 0.5]);
  for (const s of [-1, 1]) {
    M.box(0, 0, s * (CART.W / 2 - 0.06), CART.L, H, 0.12, 0, { side: 'rust', top: 'metal_dark' }, tub);
    M.box(s * (CART.L / 2 - 0.06), 0, 0, 0.12, H, CART.W - 0.24, 0, { side: 'rust', top: 'metal_dark' }, tub);
    for (const q of [-1, 1]) M.box(s * CART.L * 0.32, RAIL_Y + 0.02, q * GAUGE / 2, 0.5, 0.42, 0.16, 0, { side: 'metal_dark' }, [0.42, 0.42, 0.46]);
    M.box(0, H * 0.45, s * (CART.W / 2 + 0.01), CART.L * 0.98, 0.07, 0.03, 0, { side: 'metal' }, [0.7, 0.66, 0.6]);
  }
  M.box(CART.L / 2 - 0.15, H, CART.W / 2 - 0.15, 0.1, 0.9, 0.1, 0, { side: 'metal_dark' }, [0.5, 0.5, 0.55]);
  M.box(CART.L / 2 - 0.15, H + 0.9, CART.W / 2 - 0.15, 0.22, 0.24, 0.22, 0, { side: 'flame' }, [2.4, 1.5, 0.6], true);
  const mesh = M.bake(th, [], voxMaterial(), null); mesh.name = 'cart'; mesh.matrixAutoUpdate = true;
  const put = (s, time) => { mesh.position.set(c0.x + ux * s, a.y + DECK + Math.abs(Math.sin(time * 9)) * 0.015, c0.z + uz * s); mesh.rotation.set(0, rot, Math.sin(time * 5.3) * 0.012); };
  put(0, 0);
  return {
    a, b, dir: [ux, uz], raft: true, cart: true, halfW: CART.W / 2, lights, path: [a, c0, c1, b], mesh, speed: 5.6, maxT: 7.2,
    deckY: (t) => a.y + (b.y - a.y) * Math.max(0, Math.min(1, t / L)) + DECK,
    // put the cart under (x, z) of this pad's frame, held between its two stations
    carry(x, z, time) { put(Math.max(0, Math.min(span, (x - c0.x) * ux + (z - c0.z) * uz)), time); },
    // the track, the trestle, the platform edges, the buffer stops and the lamps: part of the pad's mesh
    emit(M2) {
      const n = Math.ceil(L / 0.7);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n; const x = a.x + dx * t; const z = a.z + dz * t;
        M2.box(x, RAIL_Y - 0.2, z, 0.32, 0.14, GAUGE + 0.8, rot, { side: 'plank_dark' }, [0.62, 0.52, 0.44]);
      }
      for (const s of [-1, 1]) M2.box(a.x + dx / 2 - uz * s * GAUGE / 2, RAIL_Y - 0.08, a.z + dz / 2 + ux * s * GAUGE / 2, L, 0.08, 0.1, rot, { side: 'metal' }, [0.8, 0.78, 0.76]);
      for (let k = 2.2; k < L - 1.5; k += 3.2) {
        const x = a.x + ux * k; const z = a.z + uz * k;
        M2.box(x, RAIL_Y - 0.5, z, 0.3, 0.3, GAUGE + 1.4, rot, { side: 'log' }, [0.55, 0.45, 0.38]);
        for (const s of [-1, 1]) M2.box(x - uz * s * (GAUGE / 2 + 0.55), base, z + ux * s * (GAUGE / 2 + 0.55), 0.26, RAIL_Y - 0.5 - base, 0.26, rot, { side: 'log' }, [0.5, 0.42, 0.36]);
      }
      for (const [p, k, dirk] of [[a, 0.2, 1], [b, L - 0.2, -1]]) {
        const x = a.x + ux * k; const z = a.z + uz * k;
        // the yellow line along the platform's edge, and the buffer stop below the lip (red and white, on the track's end)
        M2.box(x - ux * dirk * 0.35, p.y, z - uz * dirk * 0.35, 0.22, 0.04, CART.W + 1.2, rot, { side: 'white' }, [1.25, 1.0, 0.25]);
        const bx = x + ux * dirk * 0.45; const bz = z + uz * dirk * 0.45;
        M2.box(bx, RAIL_Y - 0.1, bz, 0.35, 0.5, GAUGE + 0.5, rot, { side: 'metal' }, [1.1, 0.3, 0.22]);
        for (const s of [-1, 1]) M2.box(bx + ux * dirk * 0.18 - uz * s * GAUGE * 0.4, RAIL_Y + 0.1, bz + uz * dirk * 0.18 + ux * s * GAUGE * 0.4, 0.14, 0.2, 0.2, rot, { side: 'white' }, [1.0, 0.95, 0.85]);
      }
      for (const Lp of lamps) {
        M2.box(Lp.x, Lp.y, Lp.z, 0.14, Lp.h, 0.14, 0, { side: 'metal_dark' }, [0.5, 0.5, 0.55]);
        M2.box(Lp.x, Lp.y + Lp.h, Lp.z, 0.3, 0.3, 0.3, 0, { side: 'glass' }, [2.2, 1.6, 0.9], true);
        M2.box(Lp.x, Lp.y + Lp.h + 0.3, Lp.z, 0.4, 0.08, 0.4, 0, { side: 'metal_dark' }, [0.5, 0.5, 0.55]);
      }
    },
  };
}

export const RAIL = {
  gap: 12, sats: true, satBridges: false,
  yRange: () => [0, 0],
  // water close under the trestles so its ripples fill the frame's corners (deep water far below reads as one flat haze)
  abyss: (th) => (th.abyss.type === 'water' ? { ...th.abyss, y: Math.max(th.abyss.y, -1.3) } : th.abyss),
  raft: null,
  cart,
  extras: () => null,
};
