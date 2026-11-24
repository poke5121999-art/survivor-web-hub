// Cave: dark chambers going down, joined by stairs cut in the rock. The world's own light is dimmed (layout theme: the
// ambient and the key light low, a near-black fog and pit); the light comes from clusters of glowing crystals and
// mushrooms at the foot of the cave walls, the pads' own torches, and a lantern pool on the floor that follows the team
// (world.js, L.lantern). Units keep most of the theme's light (hemisphere and key on the units dimmed only a little), so
// heroes, monsters and the boss stand out bright against the darker rock. Cave walls rise tall behind the far rim, lower on
// the flanks; on the near rim only knee-high stalagmites, so nothing stands between the camera and the fight.
import { outerAt, takenDirs, isOpen, bakeBoxes, deckRule, DECK } from './shared.js?v=20261124b';

const mix = (a, b, k) => { const c = (h, s) => (h >> s) & 255; let o = 0; for (const s of [16, 8, 0]) o |= Math.round(c(a, s) + (c(b, s) - c(a, s)) * k) << s; return o; };
const scale = (v, k) => v.map((x) => x * k);
const GLOW = [
  { tile: 'crystal', tint: [1.5, 1.0, 2.4], color: [0.62, 0.4, 1.0], glowC: 0xb080ff, kind: 'crystal' },
  { tile: 'glowcap', tint: [0.9, 2.0, 1.7], color: [0.35, 1.0, 0.8], glowC: 0x60ffd0, kind: 'bluecap' },
];
const rockOf = (th) => th.rock || th.side.rows[th.side.rows.length - 1][0];

// stairs cut in the rock from a to b: one solid rock step per tread down to the pit, a rough lip of stones on both sides
function rockStairs(a, b, th, { width = 2.4 } = {}) {
  const dx = b.x - a.x; const dz = b.z - a.z; const L = Math.hypot(dx, dz); const ux = dx / L; const uz = dz / L; const rot = -Math.atan2(dz, dx);
  const rule = deckRule(a, b, L, Math.abs(b.y - a.y) >= 0.5); const rockT = rockOf(th); const base = Math.min(a.y, b.y) - 9;
  const G = GLOW[0]; const lights = [];
  { const k = L - 0.7; lights.push({ kind: G.kind, x: a.x + ux * k - uz * (width / 2 + 0.5), y: b.y + 0.6, z: a.z + uz * k + ux * (width / 2 + 0.5), ground: b.y, color: G.color, r: 5, k: 0.9, warm: 0, glow: 1.3, glowC: G.glowC }); }
  return {
    a, b, lights, dir: [ux, uz], theme: th.name, deckY: rule.deckY,
    emit(M) {
      for (let f = 0; f < rule.n; f++) {
        const t = (f + 0.5) / rule.n; const x = a.x + dx * t; const z = a.z + dz * t; const y = rule.yAt(f) + DECK;
        M.box(x, base, z, (L / rule.n), y - base, width + 0.3, rot, { side: rockT, top: 'stone' }, [0.66, 0.64, 0.64]);
        for (const s of [-1, 1]) if ((f + (s > 0 ? 1 : 0)) % 2 === 0) M.box(x - uz * s * (width / 2 + 0.35), y, z + ux * s * (width / 2 + 0.35), (L / rule.n) * 1.1, 0.28, 0.4, rot + 0.3, { side: rockT }, [0.55, 0.54, 0.56]);
      }
      for (const Lt of lights) for (let q = 0; q < 3; q++) M.box(Lt.x + (q - 1) * 0.2, Lt.ground, Lt.z + (q % 2) * 0.18, 0.16, 0.5 + q * 0.2, 0.16, 0.5 + q, { side: G.tile }, G.tint, true);
    },
  };
}

export const CAVE = {
  gap: 4, sats: false, bossDown: true, pitGlow: false,
  yRange: () => [-14, 0],
  // a dark pit whatever the theme had, its cloud rolling so it never reads as one flat tone
  abyss: (th) => ({ ...th.abyss, type: 'mist', y: -12, deep: 0x161a26, foam: 0x24262e, spark: 0x404858, far: { top: 0x545866, side: 0x1c1e26 }, shallow: mix(th.abyss.shallow, 0x1c2030, 0.7), haze: mix(th.abyss.haze, 0x141824, 0.7), mist: 0x2a3040, mistK: 0.75, cloud: 1 }),
  // the theme dimmed: the floor's baked ambient and key low, the fog near black; the units' light only a little lower, and
  // the props' own lights a little stronger
  theme: (th) => ({
    ...th, cave: true, day: false, rain: 0, fog: mix(th.fog, 0x06070a, 0.75),
    amb: { sky: scale(th.amb.sky, 0.5), ground: scale(th.amb.ground, 0.55) }, key: { ...th.key, color: scale(th.key.color, 0.45) },
    hemi: { ...th.hemi, k: th.hemi.k * 0.85 }, sun: { ...th.sun, k: th.sun.k * 0.85 }, lightK: (th.lightK || 1) * 1.2,
  }),
  lantern: { color: [2.2, 1.55, 0.85], r: 9 },
  raft: null,
  bridge: rockStairs,
  extras({ room, plan, main, theme: th, rng }) {
    const dirs = takenDirs(plan, room); const base = -10; const rockT = rockOf(th); const boxes = []; const lights = []; const B = (...a) => boxes.push(a);
    let k = 0; let lastGlow = -9;
    for (let a = 0; a < Math.PI * 2; k++) {
      const r0 = outerAt(main, a) + 0.5; const s = Math.sin(a); const c = Math.cos(a); a += 1.0 / Math.max(6, r0);
      if (!isOpen(dirs, a)) continue;
      const far = s < -0.3; const near = s > 0.3; const x = c * r0; const z = s * r0;
      // the ground under a spot just inside the outermost blocks (a terrace or the floor), or null
      const gAt = (q) => { const cl = main.cellAt(x - c * q, z - s * q); return cl ? cl.top : null; };
      // the pit around the chamber is not empty dark: rock pillars rise out of it, a ring further out (behind the wall on the
      // far side and the flanks, below the floor on the near side so they never stand between the camera and the fight)
      for (const ring of k % 2 === 0 ? [0, 1] : [0]) {
        const rr = r0 + (ring ? rng.range(5.5, 8) : rng.range(2.6, 4.2)); const px = c * rr; const pz = s * rr; const ptop = near ? rng.range(-1.6, -0.7) : far ? rng.range(6, 10) : rng.range(1.5, 3.5);
        let y = base - 2; let w = rng.range(1.8, 2.8); while (y < ptop - 0.01) { const hh = Math.min(ptop - y, rng.range(1.6, 2.6)); B(px + rng.range(-0.3, 0.3), y, pz + rng.range(-0.3, 0.3), w, hh + 0.02, w * rng.range(0.8, 1.1), rng.range(-0.4, 0.4), { side: rockT, top: 'stone' }, [0.7, 0.68, 0.72]); y += hh; w *= rng.range(0.8, 0.95); }
      }
      if (near) {
        // stalagmites on the near rim, never above the knee
        const g = gAt(0.9); if (k % 3 === 0 && g !== null) { const h = rng.range(0.35, 0.6); B(x - c * 0.9, g - 1, z - s * 0.9, 0.5, h + 1, 0.5, rng.range(0, 1.5), { side: rockT }, [0.6, 0.58, 0.6]); B(x - c * 0.9, g + h, z - s * 0.9, 0.26, 0.3, 0.26, 0.4, { side: rockT }, [0.62, 0.6, 0.62]); }
        continue;
      }
      // the cave wall: stacked rock, tall behind the fight, lower on the flanks
      const top = far ? rng.range(4.5, 7.5) : s < 0.1 ? rng.range(1.8, 3.2) : rng.range(0.5, 0.85); let y = base - rng.range(0, 0.3); let w = rng.range(1.6, 2.4);
      while (y < top - 0.01) { const hh = Math.min(top - y, Math.max(1.4, (top - base) / 4)); B(x + rng.range(-0.25, 0.25), y, z + rng.range(-0.25, 0.25), w, hh + 0.02, w * rng.range(0.8, 1.1), rng.range(-0.4, 0.4), { side: rockT, top: rockT }, [0.5, 0.48, 0.5]); y += hh; w *= rng.range(0.78, 0.9); }
      // a stalagmite or two in front of the wall
      const g1 = gAt(1.0); if (k % 4 === 1 && g1 !== null) { const h = far ? rng.range(1.0, 2.2) : rng.range(0.4, 0.7); B(x - c * 1.0, g1 - 1, z - s * 1.0, 0.45, h + 1, 0.45, rng.range(0, 1.5), { side: rockT }, [0.56, 0.54, 0.56]); }
      // crystals and glowing mushrooms at the wall's foot light the rim of the floor
      const g2 = gAt(0.9);
      if (k - lastGlow >= 5 && g2 !== null) {
        lastGlow = k; const G = GLOW[lights.length % 2]; const gx = x - c * 0.9; const gz = z - s * 0.9;
        for (let q = 0; q < 4; q++) { const h = rng.range(0.35, far ? 1.3 : 0.8); B(gx + rng.range(-0.35, 0.35), g2 - 0.2, gz + rng.range(-0.3, 0.3), 0.18 + h * 0.08, h + 0.2, 0.18 + h * 0.08, rng.range(0, 1.5), { side: G.tile }, G.tint, true); }
        lights.push({ kind: G.kind, x: gx, y: g2 + 0.9, z: gz, ground: g2, color: G.color, r: 6.5, k: 1.1, warm: 0, glow: 1.5, glowC: G.glowC });
      }
    }
    return { lights, build(all) { return [bakeBoxes(boxes, th, all, 'cavewall')]; } };
  },
};
