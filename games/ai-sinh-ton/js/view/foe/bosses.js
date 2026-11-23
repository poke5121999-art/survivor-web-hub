// Boss shells: a new code-built body hung on the joints of the boss's pool body. The pool keeps driving the joints (its
// walk, its skill poses from bossacts.js, the entrance in bossintro.js), so the shell moves with every pose for free; the
// pool's own meshes are taken off the camera's layer, not removed, so the pool can keep toggling them as it likes.
// SHELLS[kind] = { burst, parts: { <joint>: (g) => void } }: one FoeGeo per joint, in that joint's local space (pool units,
// before T.scale). A part with ph: 1 shows only in phase 2 (under half life), ph: 2 only in phase 1.
// The geometry is built once per kind and joint and shared; materials are per shell (flash, phase and dissolve per boss).
import { FoeGeo, shellMaterials } from './kit.js?v=20261122a';
import { KIT_SHELLS } from './bosses-kit.js?v=20261122a';

const THREE = window.THREE;
const LAVA = 0xff6a20;

// ---- the five first bosses: joints of the humanoid pool body (zombies.js: hips y 0.75; torso 0..0.7 up from the hips;
// head 0..0.5 up from y 0.7; arms hang 0.34 from the shoulder (±0.36, 0.64), forearms 0.34 more from the elbow; legs 0.4
// down from the hips, shins 0.38 more). The spider rig: abdomen group at (0, 0.6, 0), head mesh at (0, 0.5, 0.28).
const ogreLimbs = (P) => ({
  armL: (g) => arm(g, -1, P), armR: (g) => arm(g, 1, P), elbowL: (g) => fore(g, -1, P), elbowR: (g) => fore(g, 1, P),
  legL: (g) => thigh(g, P), legR: (g) => thigh(g, P), kneeL: (g) => shin(g, P), kneeR: (g) => shin(g, P),
});
function arm(g, s, P) {
  g.ball(P.sh, P.sh * 0.9, P.sh, [0, 0, 0], { col: P.skin });
  g.limb([0, 0, 0], [0, -0.34, 0.01], P.ua, P.ua * 0.85, { col: P.skin });
  if (P.pad) P.pad(g, s);
}
function fore(g, s, P) {
  g.limb([0, 0, 0], [0, -0.3, 0.02], P.fa, P.fa * 1.1, { col: P.skin });
  g.ball(P.fist, P.fist, P.fist * 0.95, [0, -0.36, 0.03], { col: P.hand ?? P.skin });
  if (P.wrist) P.wrist(g, s);
}
function thigh(g, P) { g.limb([0, 0.02, 0], [0, -0.38, 0.02], P.th, P.th * 0.85, { col: P.pants }); }
function shin(g, P) { g.limb([0, 0, 0.02], [0, -0.32, 0], P.th * 0.82, P.th * 0.7, { col: P.skin }); g.box(P.th * 2.2, 0.1, P.th * 3, [0, -0.33, 0.06], { col: P.foot ?? 0x3a2e28 }); }
const eyes = (g, y, z, dx, col, r = 0.045, ph = 0) => g.pair((s) => g.ball(r, r * 0.8, r * 0.6, [s * dx, y, z], { col, glow: 1, ph, lo: true }));

const GIANT = { skin: 0x7f9a6c, pants: 0x5a4632, sh: 0.24, ua: 0.17, fa: 0.16, fist: 0.19, th: 0.16, hand: 0x6f8a5c,
  pad: (g, s) => { g.gem(0.2, 0.14, 0.2, [s * 0.04, 0.12, 0], { col: 0x7a7068 }, [0, 0, s * 0.4]); g.gem(0.1, 0.12, 0.1, [s * 0.1, 0.24, -0.06], { col: 0x8a8078 }); },
  wrist: (g) => { g.limb([0, -0.22, 0.02], [0, -0.28, 0.02], 0.19, 0.19, { col: 0x4a4a52 }); g.box(0.06, 0.12, 0.06, [0.1, -0.34, -0.12], { col: 0x5a5a62 }); g.box(0.06, 0.12, 0.06, [0.1, -0.46, -0.16], { col: 0x5a5a62 }); } };
const THROWER = { skin: 0x9aa080, pants: 0x4a4038, sh: 0.15, ua: 0.1, fa: 0.09, fist: 0.12, th: 0.11 };

export const SHELLS = {
  giant: {
    burst: LAVA,
    parts: {
      torso: (g) => {
        g.box(0.86, 0.5, 0.52, [0, 0.46, 0.02], { col: 0x7f9a6c });
        g.ball(0.34, 0.26, 0.3, [0, 0.16, 0.08], { col: 0x8aa676 });
        for (let i = 0; i < 3; i++) g.box(0.5 - i * 0.08, 0.03, 0.02, [0, 0.36 + i * 0.1, 0.29], { col: 0x5a7048 });
        // rocks grown out of the back; in phase 2 lava runs between them
        for (const [x, y, r] of [[0, 0.58, 0.2], [-0.22, 0.48, 0.15], [0.24, 0.5, 0.16], [0.1, 0.72, 0.12], [-0.12, 0.7, 0.11]]) g.gem(r, r * 1.2, r, [x, y, -0.3], { col: 0x6e645a }, [0.4, x, 0]);
        for (const [x, y, rz] of [[-0.1, 0.55, 0.6], [0.12, 0.6, -0.5], [0, 0.42, 0.1]]) g.box(0.26, 0.035, 0.05, [x, y, -0.33], { col: LAVA, glow: 1, ph: 1 }, [0, 0, rz]);
        g.box(0.6, 0.06, 0.4, [0, 0.02, 0.02], { col: 0x4a3a2a });
        for (const [x, y, rz] of [[-0.18, 0.5, 0.7], [0.16, 0.42, -0.6], [0.02, 0.62, 0.1], [-0.05, 0.28, -0.3]]) g.box(0.3, 0.035, 0.03, [x, y, 0.28], { col: LAVA, glow: 1, ph: 1 }, [0, 0, rz]);
      },
      hips: (g) => { g.box(0.5, 0.36, 0.06, [0, -0.12, 0.26], { col: 0x6a4a30 }); g.box(0.5, 0.3, 0.06, [0, -0.1, -0.24], { col: 0x5a3a24 }); },
      head: (g) => {
        g.ball(0.2, 0.19, 0.2, [0, 0.14, 0.12], { col: 0x86a272 });
        g.box(0.3, 0.12, 0.2, [0, 0.02, 0.2], { col: 0x76925f });
        g.pair((s) => { g.spike([s * 0.08, 0.04, 0.28], [s * 0.1, 0.16, 0.3], 0.035, { col: 0xf0e8d0 }); g.spike([s * 0.14, 0.26, 0.06], [s * 0.3, 0.42, -0.04], 0.06, { col: 0xe0d8c0 }); });
        g.box(0.3, 0.05, 0.06, [0, 0.21, 0.29], { col: 0x4a5a3a });
        eyes(g, 0.17, 0.3, 0.07, 0xffe050, 0.04, 2); eyes(g, 0.17, 0.3, 0.07, 0xff3020, 0.05, 1);
      },
      ...ogreLimbs(GIANT),
    },
  },
  thrower: {
    burst: 0xffa040,
    parts: {
      torso: (g) => {
        g.box(0.5, 0.56, 0.34, [0, 0.36, 0.03], { col: 0x8a9478 });
        g.box(0.54, 0.16, 0.36, [0, 0.62, 0], { col: 0x6a5a48 });
        // a sack of boulders on the back, rope across the chest
        g.ball(0.3, 0.34, 0.24, [0.04, 0.5, -0.34], { col: 0x8a7458 });
        for (const [x, y, r] of [[0.0, 0.84, 0.14], [0.14, 0.8, 0.12], [-0.12, 0.78, 0.11]]) g.gem(r, r, r, [x, y, -0.34], { col: 0x8a8278 });
        for (const [x, y] of [[0.0, 0.84], [0.14, 0.8], [-0.12, 0.78]]) g.box(0.12, 0.025, 0.03, [x, y, -0.22], { col: LAVA, glow: 1, ph: 1 });
        g.box(0.06, 0.66, 0.04, [0, 0.36, 0.2], { col: 0x5a4430 }, [0, 0, 0.7]);
        for (const [x, y, rz] of [[-0.12, 0.44, 0.6], [0.12, 0.3, -0.5]]) g.box(0.22, 0.03, 0.03, [x, y, 0.2], { col: LAVA, glow: 1, ph: 1 }, [0, 0, rz]);
      },
      head: (g) => {
        g.ball(0.17, 0.18, 0.17, [0, 0.17, 0.05], { col: 0x9aa080 });
        g.box(0.36, 0.06, 0.36, [0, 0.24, 0.04], { col: 0xb03a2a });
        g.box(0.06, 0.22, 0.04, [-0.12, 0.12, -0.14], { col: 0xb03a2a }, [0.3, 0, 0.3]);
        g.box(0.2, 0.08, 0.12, [0, 0.02, 0.17], { col: 0x7a8060 });
        eyes(g, 0.17, 0.2, 0.06, 0xffe050, 0.035, 2); eyes(g, 0.17, 0.2, 0.06, 0xff3020, 0.045, 1);
      },
      ...ogreLimbs(THROWER),
      // the throwing arm: twice the other, in a stone gauntlet that cracks open in phase 2
      armR: (g) => { g.ball(0.22, 0.2, 0.22, [0, 0, 0], { col: 0x8a8278 }); g.limb([0, 0, 0], [0, -0.34, 0.01], 0.15, 0.13, { col: 0x9aa080 }); g.gem(0.16, 0.12, 0.16, [0.04, 0.12, 0], { col: 0x7a7268 }); },
      elbowR: (g) => {
        g.limb([0, 0, 0], [0, -0.3, 0.02], 0.15, 0.2, { col: 0x8a8278 }); g.ball(0.24, 0.22, 0.24, [0, -0.38, 0.03], { col: 0x7a7268 });
        for (const [y, rz] of [[-0.14, 0.4], [-0.32, -0.5], [-0.44, 0.2]]) g.box(0.3, 0.03, 0.05, [0, y, 0.19], { col: LAVA, glow: 1, ph: 1 }, [0, 0, rz]);
      },
    },
  },
  phantom: {
    burst: 0x9a6aff,
    parts: {
      // a hooded wraith: the cloak hangs from the hips to the floor; there are no legs under it, only wisps
      hips: (g) => {
        g.limb([0, 0.75, 0], [0, -0.72, 0], 0.32, 0.55, { col: 0x2a2840 }, 'cone');
        g.limb([0, 0.75, 0], [0, -0.72, 0], 0.3, 0.52, { col: 0x3a3658 });
        for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; g.spike([Math.cos(a) * 0.46, -0.55, Math.sin(a) * 0.46], [Math.cos(a) * 0.62, -0.78, Math.sin(a) * 0.62], 0.1, { col: 0x2a2840 }); }
        for (let i = 0; i < 7; i++) { const a = (i + 0.5) / 7 * 6.283; g.spike([Math.cos(a) * 0.44, -0.6, Math.sin(a) * 0.44], [Math.cos(a) * 0.58, -0.25, Math.sin(a) * 0.58], 0.09, { col: 0xa070ff, glow: 1, ph: 1 }); }
      },
      torso: (g) => {
        g.box(0.5, 0.5, 0.3, [0, 0.4, 0], { col: 0x2e2c48 });
        g.limb([0, 0.7, 0], [0, 0.3, 0.16], 0.05, 0.03, { col: 0x8ad8ff, glow: 1 });
        for (let i = 0; i < 3; i++) g.box(0.36 - i * 0.06, 0.025, 0.02, [0, 0.5 - i * 0.08, 0.155], { col: 0xd8d0c0 });
      },
      head: (g) => {
        g.ball(0.27, 0.3, 0.27, [0, 0.2, -0.02], { col: 0x2a2840 });
        g.ball(0.17, 0.2, 0.08, [0, 0.16, 0.18], { col: 0x0a0812 });
        g.ball(0.11, 0.13, 0.1, [0, 0.14, 0.16], { col: 0xe0dccc });
        eyes(g, 0.17, 0.25, 0.045, 0x7ae0ff, 0.03, 2); eyes(g, 0.17, 0.25, 0.045, 0xc080ff, 0.04, 1);
        g.spike([0, 0.44, -0.08], [0, 0.6, -0.3], 0.1, { col: 0x2a2840 });
      },
      armL: (g) => { g.limb([0, 0.02, 0], [0, -0.34, 0.01], 0.1, 0.15, { col: 0x2e2c48 }, 'cyl'); },
      armR: (g) => { g.limb([0, 0.02, 0], [0, -0.34, 0.01], 0.1, 0.15, { col: 0x2e2c48 }, 'cyl'); },
      elbowL: (g) => {
        g.limb([0, 0, 0], [0, -0.22, 0.02], 0.15, 0.18, { col: 0x2e2c48 });
        for (let i = -1; i <= 1; i++) g.spike([i * 0.04, -0.26, 0.04], [i * 0.06, -0.46, 0.08], 0.02, { col: 0xe0dccc });
        // the soul lantern
        g.limb([0, -0.3, 0.06], [0, -0.5, 0.08], 0.012, 0.012, { col: 0x5a5a6a });
        g.box(0.16, 0.2, 0.16, [0, -0.6, 0.08], { col: 0x4a4a5a }); g.ball(0.07, 0.09, 0.07, [0, -0.6, 0.08], { col: 0x8ae0ff, glow: 1 });
      },
      elbowR: (g) => { g.limb([0, 0, 0], [0, -0.22, 0.02], 0.15, 0.18, { col: 0x2e2c48 }); for (let i = -1; i <= 1; i++) g.spike([i * 0.04, -0.26, 0.04], [i * 0.07, -0.5, 0.1], 0.02, { col: 0xe0dccc }); },
    },
    hideLegs: true,
  },
  queen: {
    burst: 0xff4a8a,
    parts: {
      torso: (g) => {
        g.box(0.44, 0.48, 0.3, [0, 0.38, 0], { col: 0x4a2e5a });
        g.ball(0.28, 0.14, 0.2, [0, 0.62, 0.02], { col: 0x6a4a7a });
        g.box(0.3, 0.3, 0.04, [0, 0.36, 0.16], { col: 0x8a2a4a });
        g.pair((s) => g.spike([s * 0.22, 0.66, -0.05], [s * 0.42, 0.95, -0.1], 0.06, { col: 0x2a1a3a }));
      },
      hips: (g) => { g.limb([0, 0.05, 0], [0, -0.5, 0], 0.24, 0.34, { col: 0x3a2048 }, 'cone'); },
      head: (g) => {
        g.ball(0.2, 0.21, 0.2, [0, 0.2, 0.02], { col: 0x5a3e6a });
        g.box(0.14, 0.1, 0.1, [0, 0.1, 0.2], { col: 0x4a2e5a });
        g.pair((s) => { g.spike([s * 0.12, 0.32, 0], [s * 0.26, 0.66, -0.06], 0.08, { col: 0x5a3e6a }); g.spike([s * 0.04, 0.06, 0.22], [s * 0.04, -0.04, 0.24], 0.02, { col: 0xf0f0e0 }); });
        eyes(g, 0.22, 0.2, 0.07, 0xff3a5a, 0.04);
        // crown: gold band and points, the gems light in phase 2
        g.limb([0, 0.36, 0], [0, 0.44, 0], 0.17, 0.19, { col: 0xd8a830 });
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; g.spike([Math.cos(a) * 0.17, 0.43, Math.sin(a) * 0.17], [Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2], 0.04, { col: 0xf0c040 }); }
        g.gem(0.05, 0.07, 0.05, [0, 0.42, 0.19], { col: 0xff3a6a, glow: 0.6 });
        g.gem(0.07, 0.1, 0.07, [0, 0.42, 0.2], { col: 0xff5a8a, glow: 1, ph: 1 });
      },
      wingL: (g) => wing(g, -1), wingR: (g) => wing(g, 1),
      armL: (g) => g.limb([0, 0, 0], [0, -0.34, 0.01], 0.08, 0.07, { col: 0x4a2e5a }),
      armR: (g) => g.limb([0, 0, 0], [0, -0.34, 0.01], 0.08, 0.07, { col: 0x4a2e5a }),
      elbowL: (g) => { g.limb([0, 0, 0], [0, -0.3, 0.02], 0.07, 0.05, { col: 0x5a3e6a }); for (let i = -1; i <= 1; i++) g.spike([i * 0.03, -0.3, 0.03], [i * 0.05, -0.46, 0.08], 0.018, { col: 0xf0e0f0 }); },
      elbowR: (g) => { g.limb([0, 0, 0], [0, -0.3, 0.02], 0.07, 0.05, { col: 0x5a3e6a }); for (let i = -1; i <= 1; i++) g.spike([i * 0.03, -0.3, 0.03], [i * 0.05, -0.46, 0.08], 0.018, { col: 0xf0e0f0 }); },
    },
    hideLegs: true,
  },
  brood: {
    burst: 0x9aff40,
    // the spider rig: the abdomen group and the head mesh get the shell, the pool's eight legs stay
    parts: {
      abd: (g) => {
        g.ball(0.5, 0.42, 0.6, [0, 0.12, -0.6], { col: 0x4a3462 });
        for (let i = 0; i < 4; i++) g.box(0.46 - i * 0.08, 0.035, 0.05, [0, 0.52 - i * 0.03, -0.36 - i * 0.18], { col: 0x9aff40, glow: 0.4 }, [-0.3 - i * 0.15, 0, 0]);
        for (const [x, y, z] of [[0.3, 0.38, -0.72], [-0.3, 0.36, -0.68], [0.16, 0.44, -0.95], [-0.16, 0.42, -0.98], [0, 0.5, -0.55], [0.42, 0.16, -0.9], [-0.42, 0.14, -0.86]]) {
          g.ball(0.12, 0.11, 0.12, [x, y, z], { col: 0xa8d870, glow: 0.5, lo: true });
          g.ball(0.15, 0.14, 0.15, [x, y, z], { col: 0xc8ff60, glow: 1, ph: 1, lo: true });
        }
        g.ball(0.16, 0.14, 0.12, [0, 0.04, -1.16], { col: 0x5a4070 });
      },
      ceph: (g) => {
        g.ball(0.3, 0.24, 0.34, [0, 0.04, 0], { col: 0x3a2c48 });
        for (let i = 0; i < 4; i++) g.pair((s) => g.ball(0.035, 0.035, 0.03, [s * (0.05 + i * 0.05), 0.16 - i * 0.02, 0.28 - i * 0.04], { col: 0xff3a3a, glow: 1, lo: true }));
        g.pair((s) => { g.spike([s * 0.08, -0.1, 0.26], [s * 0.05, -0.36, 0.34], 0.05, { col: 0xe8e0c8 }); g.spike([s * 0.16, 0.2, 0.02], [s * 0.26, 0.48, -0.1], 0.06, { col: 0x5a3a6a }); });
        g.spike([0, 0.22, 0.04], [0, 0.52, -0.12], 0.07, { col: 0x5a3a6a });
      },
    },
    keep: ['legU', 'legL'],
  },
};
Object.assign(SHELLS, KIT_SHELLS);
function wing(g, s) {
  // a bat wing along -x (left) or +x (right) from the joint: three fingers, membrane panels, veins that glow in phase 2
  const tip = [[s * 1.0, 0.36, -0.1], [s * 1.5, 0.0, -0.12], [s * 1.15, -0.5, -0.1]];
  g.limb([0, 0, 0], [s * 0.55, 0.3, -0.06], 0.05, 0.04, { col: 0x2a1a3a });
  for (const t of tip) g.limb([s * 0.55, 0.3, -0.06], t, 0.035, 0.012, { col: 0x2a1a3a });
  for (let i = 0; i < 4; i++) g.box(0.5, 0.02, 0.5, [s * (0.45 + i * 0.25), 0.15 - i * 0.18, -0.1], { col: 0x5a2e6a }, [0, 0, s * (0.35 - i * 0.25)]);
  for (const t of tip) g.limb([s * 0.55, 0.3, -0.05], [t[0] * 0.8, t[1] * 0.8, -0.05], 0.012, 0.008, { col: 0xff4a8a, glow: 1, ph: 1 });
}

const geoCache = new Map();
function geoOf(kind, joint, fn) {
  const key = kind + ':' + joint; let g = geoCache.get(key);
  if (!g) { const f = new FoeGeo(); fn(f); g = f.geometry(); geoCache.set(key, g); }
  return g;
}

// a joint of a pool body (or the diorama's copy of one) by the name SHELLS uses: a humanoid joint ('torso'), a spider rig
// part ('abd', 'ceph'), or a node of a kit boss's own rig by its path in the rig's node table ('n.chest', 'n.arms.0')
function jointOf(b, kind, key) {
  const X = b.x || {};
  if (key.startsWith('n.')) { let o = X[kind] && X[kind].n; for (const k of key.slice(2).split('.')) o = o ? o[k] : null; return o && o.isObject3D ? o : null; }
  if (key === 'abd' || key === 'ceph') return X[key] || null;
  return b[key] || null;
}
export const hasShell = (kind) => !!SHELLS[kind];
// the shared geometries of kind's shell built so far (tools: the stage diorama draws the battle model)
export const shellGeos = (kind) => [...geoCache.entries()].filter(([k]) => k.startsWith(kind + ':')).map(([, g]) => g);
export function addShells(more) { Object.assign(SHELLS, more); }

// Hang kind's shell on body b ({ root, hips, ..., x }); returns { U, setPhase, flash, die, tick, dispose } or null.
export function dressBoss(b, kind) {
  const def = SHELLS[kind]; if (!def) return null;
  const keep = new Set((def.keep || []).map((k) => jointOf(b, kind, k) || (b.x && b.x[k])).filter(Boolean));
  // the pool's own meshes leave the camera's layer (restored by dispose)
  const hidden = [];
  // (a kept node keeps its whole subtree: a kit boss's skill effects, glows and auras hang under its rig)
  const hide = (o) => { if (keep.has(o) || o.userData.shell) return; if ((o.isMesh || o.isSprite || o.isPoints) && o.layers.mask !== 0) { hidden.push([o, o.layers.mask]); o.layers.disableAll(); } for (const c of o.children) hide(c); };
  hide(b.root);
  const mats = shellMaterials(); mats.U.uBurst.value.setHex(def.burst);
  const added = [];
  for (const [joint, fn] of Object.entries(def.parts)) {
    const parent = jointOf(b, kind, joint); if (!parent) { console.warn('[foe] ' + kind + ': no joint ' + joint); continue; }
    const geo = geoOf(kind, joint, fn);
    const body = new THREE.Mesh(geo, mats.toon); const line = new THREE.Mesh(geo, mats.line);
    for (const m of [body, line]) { m.userData.shell = true; m.castShadow = false; m.frustumCulled = false; parent.add(m); added.push(m); }
  }
  let phase = 0; let flashT = 0; let dieT = -1; let pulse = 0;
  return {
    U: mats.U, kind, burst: def.burst,
    get phase() { return phase; },
    setPhase(p) { phase = p; mats.U.uP2.value = p; },
    flash() { flashT = 0.16; },
    die() { if (dieT < 0) dieT = 0; },
    tick(dt) {
      pulse += dt; flashT = Math.max(0, flashT - dt); mats.U.uFlash.value = flashT / 0.16;
      mats.U.uPulse.value = 0.6 + 0.6 * Math.sin(pulse * 6);
      if (dieT >= 0) { dieT += dt; mats.U.uDie.value = Math.min(1, Math.max(0, (dieT - 0.6) / 1.4)); }
    },
    dispose() {
      for (const m of added) m.parent && m.parent.remove(m);
      for (const [o, mask] of hidden) o.layers.mask = mask;
      mats.toon.dispose(); mats.line.dispose();
    },
  };
}
