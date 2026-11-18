// Menace pass (owner rule): foes and bosses read as hostile and unsettling, not as toys.
// Every foe/boss gets, from robots.js: grime baked into the vertex colours (fx: rust, dark red oil streaks, soot) and the
// creep motion layer (stop-motion stutter, sudden head snaps, eye drop-outs, predatory hunch). This file adds the per-kind
// pieces on top of each design without touching its silhouette: halos around the glowing eyes, teeth and fangs where a face
// has a mouth, oil tears under the eyes, a more stooped rest pose. Joint-local positions match the build code of each kind.
// The crew never goes through here (they stay friendly), nor does the impostor (it has to pass for crew until revealed).
import { teeth, spike } from './parts.js';

const PI = Math.PI;
const SIDES = [1, -1];

// dark mouth slot with an upper and a lower row of teeth, facing +z at (y, z)
function maw(B, j, w, y, z, n, L, o = {}) {
  B.box(j, 'dark', w, L * 1.9, 0.02, { p: [0, y, z - 0.008], b: 0.004, c: 0x0a0303 });
  teeth(B, j, -w * 0.42, w * 0.42, y + L * 0.9, z, n, L, { dir: -1, fang: o.fang, s: 1, oil: 0.8, curve: o.curve });
  if (!o.noLower) teeth(B, j, -w * 0.38, w * 0.38, y - L * 0.9, z - 0.003, n - 1, L * 0.8, { dir: 1, s: 2, oil: 0.8, curve: o.curve });
}

// oil tear running down from an eye: thin dark red streak, wider at the bottom
function tear(B, j, x, y, z, L, rz = 0) {
  B.box(j, 'dark', 0.006, L, 0.004, { p: [x, y - L / 2, z], r: [0, 0, rz], c: 0x2a0503, b: 0, taper: [0.5, 1] });
  B.sphere(j, 'dark', 0.006, { p: [x - Math.sin(rz) * L, y - L, z], s: [1, 1.6, 0.6], seg: 6, rows: 4, c: 0x2a0503 });
}

export const MENACE = {
  gunner(B) {
    B.J.torso.rotation.x = 0.42; B.J.neck.rotation.x = -0.38;
    B.halo('head', [0, 0.24, 0.18], 0.32);
    maw(B, 'head', 0.1, 0.1, 0.082, 7, 0.022, { fang: true });
    return { creep: { spasm: ['elR', 'x', 0.35], hunch: 0.25 } };
  },
  rook(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.09, 0.08, 0.2], 0.22);
    B.box('head', 'dark', 0.62, 0.06, 0.03, { p: [0, -0.21, 0.17], b: 0.008, c: 0x0a0303 });
    teeth(B, 'head', -0.3, 0.3, -0.19, 0.18, 11, 0.07, { dir: -1, fang: true, oil: 0.9 });
    return { creep: { head: 'head', snap: 0.25, tilt: 0.08, stutter: 0.25 } };
  },
  banger(B) {
    B.halo('body', [0, 0.03, 0.22], 0.36);
    maw(B, 'body', 0.13, -0.045, 0.2, 7, 0.018, { curve: 0.012 });
    return { creep: { head: 'body', snap: 0.2, tilt: 0.1, stutter: 0.4, flicker: 0.8 } };
  },
  gnome(B) {
    B.halo('head', [0, 0.07, 0.125], 0.2);
    maw(B, 'head', 0.08, 0.025, 0.1, 6, 0.014, { fang: true });
    return { creep: { spasm: ['haR', 'x', 0.6], snapHz: 1.6 } };
  },
  mimic(B) {
    for (const sg of SIDES) B.halo('eyes', [sg * 0.12, 0, 0.02], 0.2);
    // two long fangs at the lid corners
    for (const sg of SIDES) spike(B, 'lid', [sg * 0.31, -0.005, 0.43], 0.022, 0.11, [PI, 0, 0], { c: 0xd8cfb8 });
    return { creep: { head: 'lid', snap: 0.15, tilt: 0.05, stutter: 0.35 } };
  },
  ghost(B) {
    B.halo('head', [0.064, 0.035, 0.12], 0.22); B.halo('head', [-0.064, 0.048, 0.12], 0.16);
    tear(B, 'head', 0.064, 0.0, 0.112, 0.12, 0.08); tear(B, 'head', -0.066, 0.02, 0.112, 0.09, -0.05);
    return { creep: { snap: 0.5, stutter: 0.3, flicker: 0.8 } };
  },
  wallhand(B) {
    B.halo('hand', [0, -0.07, 0.14], 0.3);
    return { creep: { head: 'hand', snap: 0.3, tilt: 0.1, spasm: ['a1', 'y', 0.4] } };
  },
  mummy(B) {
    B.halo('head', [0, 0.035, 0.14], 0.26);
    maw(B, 'head', 0.09, -0.005, 0.1, 7, 0.02, { fang: true, curve: 0.01 });
    tear(B, 'head', 0.012, 0.01, 0.135, 0.06);
    return { creep: { hunch: 0.15, spasm: ['haR', 'z', 0.4] } };
  },
  brat(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.07, 0.125, 0.155], 0.16);
    maw(B, 'head', 0.09, 0.0, 0.212, 6, 0.018, { fang: true });
    return { creep: { snapHz: 1.4, spasm: ['tail2', 'y', 0.6] } };
  },
  headthrower(B) {
    B.halo('fire', [0, 0.1, 0], 0.55, 'glow2');
    for (const sg of SIDES) B.halo('haR', [sg * 0.03, -0.1, 0.11], 0.1, 'glow2');
    teeth(B, 'haR', -0.04, 0.04, -0.15, 0.085, 6, 0.022, { dir: 1, fang: true, oil: 0.9 });
    return { creep: { head: 'fire', snap: 0.3, spasm: ['elL', 'x', 0.4], hunch: 0.25 } };
  },
  minelayer(B) {
    for (const sg of SIDES) { B.halo('head', [sg * 0.05, 0.02, 0.1], 0.12); B.halo('head', [sg * 0.085, -0.01, 0.1], 0.08); }
    for (const sg of SIDES) spike(B, 'head', [sg * 0.06, -0.035, 0.08], 0.016, 0.13, [PI / 2 + 0.35, 0, -sg * 0.5], { c: 0xb0aa9c });
    return { creep: { snap: 0.35, snapHz: 1.8, tilt: 0.06 } };
  },
  gacha(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.08, 0.14, 0.145], 0.18);
    maw(B, 'head', 0.13, 0.075, 0.134, 9, 0.017, { curve: 0.015 });
    tear(B, 'head', 0.08, 0.115, 0.138, 0.05); tear(B, 'head', -0.08, 0.115, 0.138, 0.03);
    return { creep: { snap: 0.6, tilt: 0.3, stutter: 0.35 } };
  },
  hunter(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.05, 0.04, 0.245], 0.24);
    maw(B, 'head', 0.16, -0.01, 0.222, 9, 0.028, { fang: true });
    return { creep: { hunch: 0.2, crouch: 0.12, lunge: 0.3 } };
  },
  angel(B) {
    B.halo('head', [0, 0.13, 0.11], 0.3);
    tear(B, 'head', 0.0, 0.06, 0.104, 0.1);
    return { creep: { stutter: 0.5, snap: 0.35, tilt: 0.1, flicker: 0.3 } };
  },
  mirror(B) {
    B.J.torso.rotation.x = 0.45;
    B.halo('head', [0.02, 0.12, 0.105], 0.26);
    return { creep: { snap: 0.55, tilt: 0.35, spasm: ['shL', 'z', 0.5], hunch: 0.2 } };
  },
  // ---- bosses
  vampire(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.04, 0.142, 0.115], 0.2);
    maw(B, 'head', 0.1, 0.075, 0.098, 8, 0.016, { fang: true, noLower: true });
    for (const sg of SIDES) teeth(B, 'head', sg * 0.03, sg * 0.03, 0.07, 0.1, 1, 0.05, { dir: -1, oil: 1 });
    return { creep: { hunch: 0.15, spasm: ['haL', 'x', 0.4] } };
  },
  pharaoh(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.037, 0.115, 0.125], 0.18);
    tear(B, 'head', 0.037, 0.105, 0.121, 0.08); tear(B, 'head', -0.037, 0.105, 0.121, 0.11);
    return { creep: { stutter: 0.25, tilt: 0.12 } };   // no maw: the pharaoh sits at the 25k triangle cap
  },
  joker(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.045, 0.15, 0.115], 0.2);
    B.halo('head', [0, 0.07, 0.12], 0.22, 'glow2');
    teeth(B, 'head', -0.055, 0.055, 0.045, 0.112, 9, 0.018, { dir: 1, fang: true, oil: 0.9, curve: 0.012 });
    return { creep: { snap: 0.7, tilt: 0.35, snapHz: 1.5, stutter: 0.3 } };
  },
  alien(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.05, 0.1, 0.12], 0.2);
    maw(B, 'head', 0.07, 0.0, 0.118, 7, 0.018, { fang: true });
    return { creep: { snap: 0.5, spasm: ['ten0', 'x', 0.5] } };
  },
  nurse(B) {
    for (const sg of SIDES) B.halo('head', [sg * 0.035, 0.16, 0.11], 0.14);
    for (const sg of SIDES) tear(B, 'head', sg * 0.035, 0.15, 0.104, 0.07);
    return { creep: { stutter: 0.45, snap: 0.6, tilt: 0.4, spasm: ['shR', 'z', 0.5] } };
  },
};
