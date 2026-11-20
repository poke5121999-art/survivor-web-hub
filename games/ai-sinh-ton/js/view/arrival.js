// How a monster arrives while the sim holds it in spawnT: one spawned on the rim climbs up over the island's edge from
// the abyss (it starts out past the edge and below the surface, rises and walks in to where the sim has it), or walks in
// along a bridge when one lands near; one a skill spawns inside the arena just rises out of the floor. Shared by the
// instanced horde (horde.js) and the Blockade Z puppets (actors.js). H.arrivalLog (a Map, set by a test) records the
// first two drawn positions of each arrival.
import { arenaNorm } from '../sim/battle.js?v=20261120e';

const SPAWN_T = 0.6;
const paths = new Map();
const out = { ox: 0, oz: 0, y: 0, s: 1, g: 1 };

// e: the sim unit; x, z: where the body is drawn before the offset. Returns the offset, the height and the scale.
export function arrive(H, e, x, z) {
  const g = 1 - Math.pow(Math.max(0, e.spawnT) / SPAWN_T, 2); out.g = g;
  let p = paths.get(e.uid);
  if (!p) {
    if (paths.size > 600) paths.clear();
    p = arenaNorm(e.x, e.z) < 0.98 || !H.world ? { inside: true } : H.world.arrival(e.x, e.z) || { inside: true };
    paths.set(e.uid, p);
  }
  if (p.inside) { out.ox = 0; out.oz = 0; out.y = -(1 - g) * 1.1; out.s = 0.35 + 0.65 * g; }
  else {
    const k = Math.pow(1 - g, 1.3) * p.d;
    out.ox = p.dx * k; out.oz = p.dz * k;
    out.y = p.bridge ? p.slope * k : -Math.min(1.8, 0.4 + p.d * 0.5) * Math.pow(1 - g, 0.8);
    out.s = 0.72 + 0.28 * g;
  }
  const log = H.arrivalLog;
  if (log) {
    const r = log.get(e.uid);
    if (!r) log.set(e.uid, { uid: e.uid, n0: +arenaNorm(x + out.ox, z + out.oz).toFixed(3), y0: +out.y.toFixed(3), y1: null, bridge: !!p.bridge, inside: !!p.inside });
    else if (r.y1 === null) r.y1 = +out.y.toFixed(3);
  }
  return out;
}
