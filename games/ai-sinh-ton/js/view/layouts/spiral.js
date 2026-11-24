// Spiral: a switchback climb up a mountain. Every pad stands higher than the last; crags of stacked rock rise past the far
// rim of each pad (the mountain the path winds up), and behind the summit (the boss pad) a spire with a beacon fire.
import { mesher, voxMaterial } from '../pad.js?v=20261124b';
import { LIGHTS } from '../themes.js?v=20261124b';
import { outerAt, takenDirs, isOpen, FLAME } from './shared.js?v=20261124b';

export const SPIRAL = {
  gap: 5, sats: true,
  yRange: () => [-2, 16],
  // the climb ends far above any water: the mountain rises out of a sea of mist instead (a flat dark lake ten metres down reads as a hole)
  abyss: (th) => (th.abyss.type === 'water' ? { ...th.abyss, type: 'mist', y: -10 } : th.abyss),
  raft: null,
  extras({ room, plan, main, theme: th, rng, R }) {
    const dirs = takenDirs(plan, room); const base = th.abyss.type === 'water' ? th.abyss.y - 0.6 : -10;
    const rockT = th.rock || th.side.rows[th.side.rows.length - 1][0]; const capT = (th.sat && th.sat.top[0][0]) || rockT;
    const boxes = []; const lights = []; const B = (...a) => boxes.push(a);
    const summit = room.i === R - 1;
    const crag = (a, h, w) => {
      const r = outerAt(main, a) + w * 0.6 + 0.4; const x = Math.cos(a) * r; const z = Math.sin(a) * r;
      let y = base; let s = w; const top = h;
      while (y < top - 0.01) { const hh = Math.min(top - y, Math.max(1.2, (top - base) / 4)); B(x + rng.range(-0.2, 0.2), y, z + rng.range(-0.2, 0.2), s, hh, s * rng.range(0.8, 1.1), rng.range(-0.3, 0.3), { side: rockT, top: capT }, [0.82, 0.8, 0.78]); y += hh; s *= rng.range(0.74, 0.86); }
      return { x, z, top };
    };
    const tries = [-2.6, -2.05, -1.1, -0.55, 2.9, 0.25];
    let n = 0;
    for (const a0 of tries) { const a = a0 + rng.range(-0.12, 0.12); if (!isOpen(dirs, a) || n >= (summit ? 2 : 3)) continue; crag(a, rng.range(3, 6.5), rng.range(2.2, 3.4)); n++; }
    if (summit) {
      for (const a0 of [-1.57, -1.25, -1.9]) {
        const a = a0 + rng.range(-0.1, 0.1); if (!isOpen(dirs, a)) continue;
        const s = crag(a, 10.5, 4.6); const L = LIGHTS.brazier;
        B(s.x, s.top, s.z, 1.1, 0.6, 1.1, 0, { side: 'metal_dark' }, [0.5, 0.5, 0.55]); B(s.x, s.top + 0.6, s.z, 0.7, 0.8, 0.7, 0, { side: 'flame' }, FLAME, true);
        lights.push({ kind: 'beacon', x: s.x, y: s.top + 1.4, z: s.z, ground: s.top, color: L.color, r: 9, k: 1.3, warm: 1, glow: 3.2 });
        break;
      }
    }
    if (!boxes.length) return null;
    return {
      lights,
      build(all) { const M = mesher(); for (const b of boxes) M.box(...b); const m = M.bake(th, all, voxMaterial(), null); m.name = 'crags'; m.matrixAutoUpdate = true; return [m]; },
    };
  },
};
