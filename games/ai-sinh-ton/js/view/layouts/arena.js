// Arena: one round arena where all five waves are fought. Stands rise in tiers behind the far rim (a crowd of dark shapes
// on the seats, braziers and banners along the top), two tiers on the flanks, and only a knee-high wall on the near side so
// nothing stands between the camera and the fight. The stands open where the start room's bridge and the gates are.
import { mesher, voxMaterial } from '../pad.js?v=20261122a';
import { LIGHTS } from '../themes.js?v=20261122a';
import { outerAt, takenDirs, isOpen, FLAME } from './shared.js?v=20261122a';

export const ARENA_RING = {
  gap: 5, sats: false,
  yRange: (water) => (water ? [0, 3] : [-4, 4]),
  abyss: (th) => th.abyss,
  raft: null,
  extras({ room, plan, main, theme: th, rng }) {
    const dirs = takenDirs(plan, room); const water = th.abyss.type === 'water'; const base = water ? th.abyss.y - 0.6 : -9;
    const wallT = th.side.rows[0][0]; const seatT = (th.edge[0] || [wallT])[0]; const lights = []; const boxes = [];
    const B = (x, y, z, sx, sy, sz, rot, tiles, t, e) => boxes.push([x, y, z, sx, sy, sz, rot, tiles, t, e]);
    const ring = []; for (let a = 0; a < Math.PI * 2; ) { const r0 = outerAt(main, a) + 0.6; ring.push([a, r0]); a += 1.05 / Math.max(6, r0); }
    let lastFire = -9; let k = 0;
    for (const [a, r0] of ring) {
      if (!isOpen(dirs, a)) continue;
      const s = Math.sin(a); const c = Math.cos(a); const rot = -a + Math.PI / 2;
      const far = s < -0.3; const near = s > 0.35; const tiers = far ? 4 : near ? 0 : 2;
      const P = (r) => [c * r, s * r];
      if (near) { const [x, z] = P(r0 + 0.3); B(x, base, z, 1.1, 0.5 - base, 0.6, rot, { side: wallT, top: seatT }, [0.8, 0.78, 0.76]); continue; }
      for (let t = 0; t < tiers; t++) {
        const [x, z] = P(r0 + 0.5 + t * 1.05); const top = 0.7 + t * 0.85;
        B(x, base, z, 1.12, top - base, 1.05, rot, { side: wallT, top: seatT }, [0.78 - t * 0.04, 0.76 - t * 0.04, 0.74 - t * 0.03]);
        // the crowd: dark blocky figures on the seats, a few with glowing eyes
        if (rng.chance(far ? 0.62 : 0.4)) {
          const ox = rng.range(-0.3, 0.3); const h = rng.range(0.5, 0.75); const tint = rng.chance(0.5) ? [0.35, 0.3, 0.32] : [0.42, 0.38, 0.3];
          B(x + c * 0.1 + -s * ox, top, z + s * 0.1 + c * ox, 0.34, h, 0.3, rot, { side: 'white' }, tint);
          B(x + c * 0.1 + -s * ox, top + h, z + s * 0.1 + c * ox, 0.26, 0.24, 0.26, rot, { side: 'white' }, tint);
          if (rng.chance(0.25)) B(x + c * -0.06 + -s * ox, top + h + 0.1, z + s * -0.06 + c * ox, 0.16, 0.05, 0.02, rot, { side: 'white' }, [2.2, 0.6, 0.3], true);
        }
      }
      // the parapet along the top of the stands, with braziers and banners on the far side
      const [x, z] = P(r0 + 0.5 + tiers * 1.05); const top = 0.7 + tiers * 0.85;
      B(x, base, z, 1.12, top + 0.7 - base, 0.5, rot, { side: wallT, top: wallT }, [0.7, 0.68, 0.66]);
      if (far && k - lastFire >= 5) {
        lastFire = k; const L = LIGHTS.brazier; const y = top + 0.7;
        B(x, y, z, 0.6, 0.5, 0.6, rot, { side: 'metal_dark' }, [0.5, 0.5, 0.55]); B(x, y + 0.5, z, 0.3, 0.36, 0.3, rot, { side: 'flame' }, FLAME, true);
        lights.push({ kind: 'brazier', x, y: y + 0.9, z, ground: top, color: L.color, r: L.r * 1.1, k: L.k, warm: L.warm, glow: L.glow });
      } else if (far && k % 5 === 2) {
        const bc = rng.chance(0.5) ? [0.9, 0.22, 0.16] : [0.85, 0.66, 0.2];
        B(x - c * 0.3, top - 0.6, z - s * 0.3, 0.7, 1.3, 0.06, rot, { side: 'white' }, bc);
      }
      k++;
    }
    return {
      lights,
      build(all) { const M = mesher(); for (const b of boxes) M.box(...b); const m = M.bake(th, all, voxMaterial(), null); m.name = 'stands'; m.matrixAutoUpdate = true; return [m]; },
    };
  },
};
