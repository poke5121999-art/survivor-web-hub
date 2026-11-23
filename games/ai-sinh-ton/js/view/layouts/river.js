// River: the banks and an islet of a wide river, all at water level, joined by rafts and by bridges that fall once crossed
// (world.js drops a 'collapse' link's deck behind the team). The water is raised to just under the floors whatever the
// theme's abyss was, so a mist world gets a dark river of its own colours. The ford across each fight pad is a hazard
// (layouts/hazards.js 'current').
import { mesher, voxMaterial } from '../pad.js?v=20261122a';

export const RAFT_Y = -0.5;     // the raft's deck under the floors (the water is at -0.9)
const DOCK = 1.4;               // metres from the bank to where the raft lies at either end
const RAFT = { L: 3.2, W: 2.8 };

export const RIVER = {
  gap: 9, sats: true,
  yRange: () => [0, 0],
  abyss: (th) => ({ ...th.abyss, type: 'water', y: -0.9 }),
  extras: () => null,
  // the walk over the water from bank point a to bank point b (both at floor height): down onto the raft, across, up again.
  // The raft is a mesh of its own that the run moves under the group (carry).
  raft(a, b, th) {
    const dx = b.x - a.x; const dz = b.z - a.z; const L = Math.hypot(dx, dz); const ux = dx / L; const uz = dz / L;
    const q0 = { x: a.x + ux * DOCK, y: RAFT_Y, z: a.z + uz * DOCK }; const q1 = { x: b.x - ux * DOCK, y: RAFT_Y, z: b.z - uz * DOCK };
    const M = mesher(); const rot = -Math.atan2(uz, ux);
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6 - 0.5; M.box(ux * t * RAFT.L, -0.32, uz * t * RAFT.L, 0.5, 0.32, RAFT.W, rot, { side: 'log', top: 'log' }, [0.66, 0.54, 0.44]); }
    for (const s of [-1, 1]) M.box(-uz * s * RAFT.W * 0.35, 0, ux * s * RAFT.W * 0.35, RAFT.L * 0.95, 0.1, 0.16, rot, { side: 'plank_dark' }, [0.55, 0.45, 0.38]);
    M.box(ux * RAFT.L * 0.38 - uz * 1.0, 0, uz * RAFT.L * 0.38 + ux * 1.0, 0.12, 1.4, 0.12, 0, { side: 'log' }, [0.6, 0.5, 0.42]);
    M.box(ux * RAFT.L * 0.38 - uz * 1.0, 1.25, uz * RAFT.L * 0.38 + ux * 1.0, 0.24, 0.24, 0.24, 0, { side: 'flame' }, [2.2, 1.3, 0.5], true);
    const mesh = M.bake(th, [], voxMaterial(), null); mesh.name = 'raft'; mesh.matrixAutoUpdate = true; mesh.position.set(q0.x + ux * RAFT.L / 2, RAFT_Y, q0.z + uz * RAFT.L / 2);
    const span = Math.hypot(q1.x - q0.x, q1.z - q0.z);
    return {
      a, b, dir: [ux, uz], raft: true, halfW: RAFT.W / 2, lights: [], path: [a, q0, q1, b], mesh,
      deckY(t) { if (t < DOCK) return (RAFT_Y * t) / DOCK; if (t > L - DOCK) return RAFT_Y + ((b.y - RAFT_Y) * (t - (L - DOCK))) / DOCK; return RAFT_Y; },
      // put the raft under (x, z) of this pad's frame, held between its two moorings, bobbing a little
      carry(x, z, time) {
        const t = Math.max(RAFT.L / 2, Math.min(span - RAFT.L / 2, (x - q0.x) * ux + (z - q0.z) * uz));
        mesh.position.set(q0.x + ux * t, RAFT_Y + Math.sin(time * 2.1) * 0.03, q0.z + uz * t); mesh.rotation.z = Math.sin(time * 1.3) * 0.02;
      },
    };
  },
};
