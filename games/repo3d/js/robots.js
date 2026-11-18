// Robot cast of Ca Trực Đêm 3D in the style of the hub game "Xưởng Robot Lóc Cóc" (games/robot-loc-coc, same owner):
// the crew are Lóc Cóc worker robots, foes and bosses are Lóc Cóc zombie robots. Parts, palettes, animator and the
// instanced renderer are the ported twt modules in ./loc (robo-cast, robo-rig, robo-crowd, ...); this file only maps the
// game ids to looks and keeps the old API so foes.js / run.js do not change:
//   buildRobot({ kind: 'crew' | 'foe' | 'boss', id }) -> { root, height, animate(dt, state), joints, kind, id, dispose() }
//   state: { speed m/s, carrying, attack 0..1, hurt 0..1, down, look, reveal 0..1 (impostor) }
// root is an empty THREE.Group placed by the caller (feet at y = 0, facing +Z); the robot itself is drawn by one shared
// Crowd (one instanced draw call per look) that robotsFrame(scene, camera, dt) refreshes once per rendered frame.
import * as THREE from '../vendor/three.module.min.js';
import { RX, SCHEMES, palette, baseSpec, zBase, rng, mix32 } from './loc/robo-cast.js';
import { RoboBody, B } from './loc/robo-rig.js';
import { Crowd } from './loc/robo-crowd.js';
import { WeaponLayer } from './loc/robo-weapons.js';

export const CREW_IDS = ['bao', 'hue', 'tam', 'ky', 'linh', 'dung', 'mai', 'phuc', 'son', 'nga', 'khoi', 'van', 'hai', 'tuyet'];
const FOE_IDS = ['gunner', 'rook', 'banger', 'gnome', 'mimic', 'ghost', 'wallhand', 'mummy', 'brat', 'headthrower', 'minelayer', 'impostor', 'gacha', 'hunter', 'angel', 'mirror'];
const BOSS_IDS = ['vampire', 'pharaoh', 'joker', 'alien', 'nurse'];
export const ROBOT_IDS = { crew: CREW_IDS.slice(), foe: FOE_IDS.slice(), boss: BOSS_IDS.slice() };
export const robotStats = {};

const EYE_RED = 0xff3020, EYE_AMBER = 0xffa020;
const dirty = (h, k = 0.5, dim = 0.8) => { // towards rust brown and darker (the Lóc Cóc zombie RUSTY recipe)
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const m = (a, c) => Math.round((a + (c - a) * k) * dim);
  return (m(r, 0x6b) << 16) | (m(g, 0x52) << 8) | m(b, 0x40);
};
const sch = (o) => ({ A: o.A, B: o.B, C: o.C, glow: o.glow, eye: o.eye, dark: o.dark ?? 0x2a2a2c });

/* ---------------------------------------------------------------- crew: 14 worker robots, one scheme + a skill accessory */
// m main, s second, a accent, g glow, e eye (the old crew palettes, so the lobby colours still match); o: part picks
const CREW = {
  bao: { m: 0xe07a1f, s: 0x30343a, a: 0xf2c230, e: 0xffd27a, g: 0xffb040, o: { torso: 'tincan', head: 'bino', ant: 'bulb', hat: 'lamp', sticker: 'star', hand: 'mitt' } }, // Flare: lamp
  hue: { m: 0xe6e9ec, s: 0x23897d, a: 0x9fe3d8, e: 0x7dfff0, g: 0x7dfff0, o: { torso: 'capsule', head: 'dome', ant: 'none', hat: 'cap', sticker: 'cross', hand: 'tri', props: { toolbelt: true } } }, // Halo: medic
  tam: { m: 0x2b4a7a, s: 0xd9a521, a: 0xe8e2d0, e: 0xa8d8ff, g: 0xffc040, o: { torso: 'tank', head: 'bucket', ant: 'none', hat: 'hardhat', acc: 'backpack', hand: 'mitt', limb: 'piston', sticker: 'shield' } }, // Atlas: carrier
  ky: { m: 0x5e7d3a, s: 0x6b4a2e, a: 0xe0b040, e: 0xc8ff80, g: 0xffd060, o: { torso: 'cube', head: 'monocle', ant: 'whip', hat: 'goggles', sticker: 'wrench', hand: 'claw', props: { toolbelt: true } } }, // Pick: locks
  linh: { m: 0x2c2836, s: 0x4a3b66, a: 0x9a6bd6, e: 0xc890ff, g: 0xb070ff, o: { torso: 'lanky', head: 'pill', ant: 'none', hat: 'beanie', acc: 'scarf', foot: 'pad', sticker: null } }, // Shade: stealth
  dung: { m: 0xb3332b, s: 0x4a4d52, a: 0xf0c040, e: 0xff8a50, g: 0xff6030, o: { torso: 'barrel', head: 'crt', ant: 'coil', hat: 'viking', sticker: 'bolt', limb: 'piston', hand: 'ball' } }, // Quake: shock
  mai: { m: 0xe58aa8, s: 0xefe3cf, a: 0x7a3550, e: 0xffa0d0, g: 0xff80c0, o: { torso: 'egg', head: 'crt', ears: 'cups', ant: 'twin', hat: 'headphones', sticker: 'heart' } }, // Lure: noise
  phuc: { m: 0x2f6fb5, s: 0xe8892b, a: 0xf5f0e0, e: 0x9fd4ff, g: 0xffa040, o: { torso: 'cube', head: 'orb', ant: 'whip', hat: 'hardhat', hand: 'claw', sticker: 'cross' } }, // Hook: rescue
  son: { m: 0x6f7a46, s: 0xb8a27a, a: 0x3a3d2a, e: 0xffe08a, g: 0xffd060, o: { torso: 'tank', head: 'bucket', ears: 'bolts', ant: 'none', hat: 'cap', sticker: 'shield', limb: 'piston' } }, // Barb: shields
  nga: { m: 0x6a4fc2, s: 0xc9ccd4, a: 0x37e0ff, e: 0x80e8ff, g: 0x40e8ff, o: { torso: 'egg', head: 'orb', ant: 'twin', hat: 'propeller', sticker: 'star', limb: 'coil' } }, // Blink: teleport
  khoi: { m: 0x1f7f84, s: 0xc9a54a, a: 0x153b3e, e: 0x9effe0, g: 0x60ffd0, o: { torso: 'capsule', head: 'bino', ant: 'dish', face: 'glasses', sticker: 'question' } }, // Oracle: reveal
  van: { m: 0x9cc8e6, s: 0xf2f5f8, a: 0x3b6e99, e: 0xbff4ff, g: 0x90f0ff, o: { torso: 'capsule', head: 'dome', ant: 'coil', hat: 'beanie', acc: 'scarf', sticker: 'flower' } }, // Frost
  hai: { m: 0xc43a3a, s: 0xbfc4ca, a: 0x2b2d33, e: 0xffd0a0, g: 0x80c0ff, o: { torso: 'barrel', head: 'monocle', ant: 'coil', ears: 'fins', hat: 'cap', sticker: 'coin', hand: 'ball' } }, // Magnet
  tuyet: { m: 0xf1efe8, s: 0xcfa94a, a: 0x8fb7d8, e: 0xfff1b0, g: 0xffe080, o: { torso: 'bean', head: 'dome', ant: 'none', hat: 'halo', acc: 'cape', sticker: 'star' } }, // Seraph: angel
};
function crewDef(id) {
  const c = CREW[id], i = CREW_IDS.indexOf(id), seed = 4100 + i * 97;
  const spec = baseSpec(rng(seed), seed, {
    ears: 'none', foot: 'boot', limb: 'rod', wear: 0.3, swapAB: false, num: i + 1, heightM: 1.62 + (i % 4) * 0.04,
    pal: palette(sch({ A: c.m, B: c.s, C: c.a, glow: c.g, eye: c.e }), { ha: c.a, hb: c.s, hc: 0x2b2b2e }), props: {}, ...c.o,
  });
  spec.eye = c.e; spec.key = 'crew:' + id;
  return { key: spec.key, spec, scale: 1, kind: 'human', zombie: false };
}

/* ---------------------------------------------------------------- foes: Lóc Cóc zombie robots, each keeps its tell */
// o: zBase overrides; kind: animator style (Base Tumour Hulk Brute Birther Baby Sweaty TwinBuff TwinHeal); scale: size x;
// atk: clip on the attack phase; weapon: twt weapon in the right hand; hide: bones; lift: hover (m); glide: no steps
const FOE = {
  gunner: { kind: 'Base', scale: 1.08, atk: 'attack', weapon: 'rifle', I: { arms: 2, hunch: 0.18 },
    o: { torso: 'lanky', head: 'monocle', ears: 'fins', ant: 'whip', hand: 'claw', limb: 'rod', legLen: 0.38, rust: 0.7, eye: EYE_RED,
      pal: palette(sch({ A: 0x4a3a32, B: 0x6a2a22, C: 0xc9b88a, glow: 0xff4020 }), { chrome: 0x7a7670 }), zx: { wires: true, hole: true, brow: true } } },
  rook: { kind: 'Hulk', big: true, scale: 0.95, atk: 'slam', I: { hunch: 0.32 },
    o: { torsoDef: 'hulk', head: 'bino', headScale: 0.85, ears: 'none', ant: 'none', hand: 'claw', handScale: 2.0, foot: 'pad', footScale: 1.5, limb: 'piston', limbR: 0.03, armK: 1.3, legK: 1.3, legLen: 0.27, armLen: 0.48, rust: 0.8, dents: 0.03, eye: EYE_AMBER,
      pal: palette(SCHEMES[2], { A: 0x6a5a2a, B: 0x2e2f33, C: 0x1b1b1e, glow: 0xff7a20, chrome: 0x7a7670, haz: 0x8a6a1a }), zx: { wires: true, hole: true, spikes: true, plate: true, brow: true } } },
  banger: { kind: 'Baby', scale: 0.62, atk: 'jump', I: { hunch: 0.1 },
    o: { torso: 'barrel', head: 'orb', headScale: 1.2, ears: 'none', ant: 'bulb', antBend: 0.9, hand: 'ball', foot: 'cup', limb: 'coil', legLen: 0.22, rust: 0.6, eye: EYE_AMBER,
      pal: palette(SCHEMES[13], { A: 0x2a2a2c, B: 0x6a2a1e, C: 0xe8b923, glow: 0xff8a20, haz: 0xb8901e }), zx: { wires: true } } },
  gnome: { kind: 'Baby', scale: 0.5, atk: 'attack', weapon: 'machete', I: { hunch: 0.2 },
    o: { torso: 'egg', head: 'monocle', headScale: 1.25, ears: 'fins', ant: 'none', hat: 'cone', hand: 'claw', foot: 'boot', limb: 'rod', legLen: 0.24, rust: 0.6, eye: EYE_RED,
      pal: palette(SCHEMES[0], { A: 0x5a4a3e, B: 0x3a3d34, C: 0xc9b88a, glow: 0xff4020, ha: 0x7a2018, hb: 0xb0a890, hc: 0x222222 }), zx: { wires: true } } },
  mimic: { kind: 'Baby', scale: 0.95, atk: 'attack', hide: [B.HEAD, B.ANT0, B.ANT0B, B.ANT1, B.ANT1B, B.HAT], I: { hunch: 0.05 },
    o: { torsoDef: 'chest', head: 'pill', headScale: 0.6, ant: 'none', ears: 'none', hand: 'claw', handScale: 1.4, foot: 'pad', limb: 'piston', legLen: 0.2, armLen: 0.34, rust: 0.4, eye: EYE_AMBER,
      pal: palette(SCHEMES[12], { A: 0x5a3a22, B: 0x2e2f33, C: 0xc9b88a, glow: 0xffa020, wood: 0x6a4428, wood2: 0x4a2e1a, white: 0xc8c0a8, chrome: 0x6a6660 }), zx: {} } },
  ghost: { kind: 'Base', scale: 0.95, atk: 'attack', lift: 0.45, hide: [B.LTHIGH, B.LSHIN, B.LFOOT, B.RTHIGH, B.RSHIN, B.RFOOT], I: { arms: 0, hunch: 0.25 },
    o: { torso: 'capsule', head: 'dome', headScale: 1.2, ears: 'none', ant: 'none', hand: 'tri', limb: 'coil', rust: 0.25, eye: EYE_RED,
      pal: palette(SCHEMES[11], { A: 0xc8c2b4, B: 0x2a2c30, C: 0x3a3430, glow: 0xff3a2a, white: 0xd8d2c4 }), zx: { wires: true, hole: true, dangle: true } } },
  wallhand: { kind: 'Base', scale: 1.3, atk: 'attack', hide: [B.PELVIS, B.TORSO, B.HEAD, B.ANT0, B.ANT0B, B.ANT1, B.ANT1B, B.HAT, B.LUP, B.LFORE, B.LHAND, B.LTHIGH, B.LSHIN, B.LFOOT, B.RTHIGH, B.RSHIN, B.RFOOT], I: { arms: 1 },
    o: { torso: 'cube', head: 'pill', hand: 'claw', handScale: 2.4, limb: 'piston', armK: 1.6, rust: 0.7, eye: EYE_RED,
      pal: palette(SCHEMES[15], { A: 0x4a3236, B: 0x6b2626, C: 0x6a625a, glow: 0xff2a40 }), zx: { wires: true } } },
  mummy: { kind: 'Tumour', scale: 1.0, atk: 'throw', I: { hunch: 0.15 },
    o: { torso: 'tank', head: 'bucket', ears: 'bolts', ant: 'none', hat: 'bandage', hand: 'mitt', limb: 'piston', rust: 0.6, eye: 0x9dff70,
      pal: palette(SCHEMES[15], { A: 0x6a6658, B: 0x3d4a3a, C: 0xb8ae92, glow: 0x9dff70, ha: 0xa89e84, hb: 0x8a8070 }), zx: { wires: true, hole: true, tumours: 4 } } },
  brat: { kind: 'Base', scale: 0.72, atk: 'attack', I: { arms: 0, hunch: 0.35 },
    o: { torso: 'bean', head: 'orb', ears: 'cups', ant: 'bunny', antBend: 0.6, hand: 'claw', foot: 'pad', limb: 'coil', legLen: 0.3, rust: 0.55, eye: 0xfff060,
      pal: palette(SCHEMES[1], { A: 0x5a5c62, B: 0x1e1f22, C: 0xd8d6cc, glow: 0xffe040 }), props: { backpack: RX.WOOD2 }, zx: { wires: true, dangle: true } } },
  headthrower: { kind: 'Base', scale: 1.0, atk: 'throw', weapon: 'can', hide: [B.HEAD, B.ANT0, B.ANT0B, B.ANT1, B.ANT1B, B.HAT], I: { arms: 4, hunch: 0.1 },
    o: { torso: 'cube', head: 'crt', hand: 'mitt', limb: 'piston', rust: 0.6, eye: 0x40a0ff,
      pal: palette(SCHEMES[4], { A: 0x4a3e5a, B: 0x2a2630, C: 0xb8b0a0, glow: 0x3a90ff }), zx: { wires: true, hole: true, tumours: 2 } } },
  minelayer: { kind: 'Baby', scale: 0.7, atk: 'attack', I: { hunch: 0.55 },
    o: { torso: 'tank', head: 'bino', ears: 'none', ant: 'twin', antBend: 0.8, hand: 'tri', foot: 'pad', limb: 'coil', legLen: 0.2, rust: 0.7, eye: EYE_RED,
      pal: palette(SCHEMES[13], { A: 0x4a4430, B: 0x2c2f33, C: 0xc23030, glow: 0xff4040, haz: 0x8a6a1a }), zx: { wires: true, mines: true } } },
  gacha: { kind: 'Base', scale: 1.0, atk: 'attack', glide: true, hide: [B.LSHIN, B.LFOOT, B.RSHIN, B.RFOOT], I: { arms: 3, hunch: 0.05 },
    o: { torso: 'egg', head: 'crt', ears: 'cups', ant: 'none', hat: 'party', acc: 'bowtie', hand: 'mitt', foot: 'cup', limb: 'coil', rust: 0.55, eye: EYE_RED,
      pal: palette(SCHEMES[14], { A: dirty(0xe8d8c4, 0.4), B: dirty(0xc8323a, 0.35), C: 0x2f62c8, glow: 0xff4050, ha: dirty(0xc8323a, 0.3), hb: dirty(0x2f62c8, 0.3) }), zx: { wires: true, unicycle: true, hole: true } } },
  hunter: { kind: 'Brute', big: true, scale: 1.12, atk: 'slam', I: { hunch: 0.25 },
    o: { torsoDef: 'brute', head: 'bino', headScale: 0.82, ears: 'none', ant: 'none', hand: 'claw', handScale: 2.3, foot: 'pad', footScale: 1.7, limb: 'piston', limbR: 0.034, armK: 1.35, legK: 1.4, legLen: 0.27, armLen: 0.5, dents: 0.03, rust: 0.8, eye: 0xff2020,
      pal: palette(SCHEMES[12], { A: 0x3a4a3e, B: 0x2e2e2c, C: 0xc8402a, glow: 0xff3020, chrome: 0x7a7670, haz: 0x8a6a1a }), zx: { wires: true, hole: true, spikes: true, plate: true, chain: true, brow: true } } },
  angel: { kind: 'Base', scale: 1.12, atk: 'attack', I: { arms: 3, hunch: 0.15 },
    o: { torso: 'capsule', head: 'pill', ears: 'none', ant: 'none', hat: 'halo', acc: 'cape', hand: 'tri', limb: 'rod', rust: 0.15, eye: 0xd8f0ff,
      pal: palette(SCHEMES[11], { A: 0x8a8880, B: 0x6a6860, C: 0x3a3832, glow: 0xd8f0ff, ha: 0x9a9890, hb: 0x5a5850, chrome: 0x8a8880, white: 0x9a9890 }), zx: { hole: true } } },
  mirror: { kind: 'Base', scale: 1.15, atk: 'attack', I: { arms: 0, hunch: 0.3 },
    o: { torso: 'lanky', head: 'pill', ears: 'none', ant: 'none', hand: 'claw', limb: 'rod', legLen: 0.42, armLen: 0.4, rust: 0.2, eye: 0xbfe0ff,
      pal: palette(SCHEMES[3], { A: 0xb8bec6, B: 0x5a6470, C: 0x1e2228, glow: 0xbfe0ff, chrome: 0xd8dde4 }), zx: { wires: true, dangle: true } } },
  // bosses: as big as the Lóc Cóc Brute / Sweaty
  vampire: { kind: 'TwinBuff', big: true, scale: 1.55, atk: 'attack', I: { hunch: 0.15 },
    o: { torsoDef: 'buff', head: 'crt', headScale: 0.95, ears: 'fins', ant: 'twin', antBend: 0.3, acc: 'cape', hand: 'claw', handScale: 1.6, foot: 'boot', limb: 'piston', limbR: 0.02, armK: 1.2, legK: 1.15, legLen: 0.36, armLen: 0.36, rust: 0.5, eye: 0xff2030,
      pal: palette(SCHEMES[8], { A: 0x5a1a22, B: 0x2a1e26, C: 0x1b1b1e, glow: 0xff2030, hb: 0x6e1424, ha: 0x2a1e26 }), zx: { wires: true, veins: true, brow: true } } },
  pharaoh: { kind: 'Birther', big: true, scale: 1.6, atk: 'roar',
    o: { torsoDef: 'birther', head: 'dome', headScale: 0.95, ears: 'cups', ant: 'twin', hat: 'crown', hand: 'tri', foot: 'cup', limb: 'coil', legLen: 0.3, armLen: 0.3, rust: 0.45, eye: 0x40ffd0,
      pal: palette(SCHEMES[2], { A: dirty(0xc9a03a, 0.3), B: 0x1f3f7a, C: 0x2a2520, glow: 0x40ffd0, ha: 0xb8902a, hb: 0x1f3f7a }), zx: { wires: true, dangle: true } } },
  joker: { kind: 'Sweaty', big: true, scale: 1.45, atk: 'smash', I: { hunch: 0.1 },
    o: { torsoDef: 'boiler', head: 'crt', headScale: 1.0, ears: 'cups', ant: 'coil', hat: 'party', acc: 'bowtie', hand: 'ball', handScale: 1.6, foot: 'pad', footScale: 1.4, limb: 'piston', limbR: 0.028, armK: 1.2, legK: 1.35, legLen: 0.25, armLen: 0.36, rust: 0.45, eye: 0xff40ff,
      pal: palette(SCHEMES[4], { A: 0x4a2a5a, B: 0x2a6a3a, C: 0xe8d040, glow: 0xff40ff, ha: 0x6a2a8a, hb: 0x2a9a4a }), zx: { wires: true, hole: true, drips: true } } },
  alien: { kind: 'TwinHeal', big: true, scale: 1.55, atk: 'attack',
    o: { torso: 'capsule', head: 'dome', headScale: 1.1, ears: 'cups', ant: 'twin', antBend: 0.4, hand: 'tri', foot: 'cup', limb: 'coil', legLen: 0.36, armLen: 0.34, rust: 0.35, eye: 0x80ff90,
      pal: palette(SCHEMES[1], { A: 0x4a5a6a, B: 0x2a2f3a, C: 0x8a3ac8, glow: 0x80ff90 }), zx: { wires: true, pods: true } } },
  nurse: { kind: 'Sweaty', big: true, scale: 1.4, atk: 'smash',
    o: { torsoDef: 'boiler', head: 'bucket', headScale: 0.9, ears: 'bolts', ant: 'none', hat: 'bandage', hand: 'claw', handScale: 1.5, foot: 'pad', footScale: 1.4, limb: 'piston', limbR: 0.028, armK: 1.2, legK: 1.35, legLen: 0.25, armLen: 0.36, rust: 0.4, eye: 0xff4060,
      pal: palette(SCHEMES[11], { A: 0xb8bcb4, B: 0x6f7c78, C: 0xc02a3a, glow: 0xff3050, ha: 0xd8d4c8, hb: 0xc02a3a }), zx: { wires: true, hole: true, drips: true, cross: true } } },
};
function foeDef(id) {
  if (id === 'impostor') { // passes for crew (bao's look, another number) until it reveals: then the angry zombie face
    const d = crewDef('bao'); d.key = d.spec.key = 'foe:impostor'; d.spec.num = 13; return { ...d, impostor: true, atk: 'attack' };
  }
  const f = FOE[id], seed = 7000 + FOE_IDS.concat(BOSS_IDS).indexOf(id) * 131;
  const spec = zBase(seed, { hat: null, heightM: 1.75, ...f.o });
  spec.key = 'foe:' + id;
  return { key: spec.key, spec, scale: f.scale, kind: f.kind, big: !!f.big, zombie: true, atk: f.atk, weapon: f.weapon, hide: f.hide || [], lift: f.lift || 0, glide: !!f.glide, I: f.I || {} };
}

/* ---------------------------------------------------------------- shared renderer */
const L = { holder: new THREE.Group(), crowd: null, weapons: null, live: new Set(), t: 0 };
L.holder.name = 'robots';
function crowd() {
  if (!L.crowd) { L.crowd = new Crowd(L.holder, { shadows: true, cap: 64 }); L.weapons = new WeaponLayer(L.holder, L.crowd.fx); }
  return L.crowd;
}
const _m = new THREE.Matrix4(), _s = new THREE.Matrix4(), _sph = new THREE.Sphere(), _fr = new THREE.Frustum(), _pv = new THREE.Matrix4();
const wl = [];
function attached(o, scene) { let vis = true; while (o) { vis = vis && o.visible; if (o === scene) return vis; o = o.parent; } return false; }
/** Once per rendered frame, before renderer.render: uploads every visible robot of this scene to the crowd. */
export function robotsFrame(scene, camera, dt = 1 / 60) {
  if (!L.crowd) return;
  if (L.holder.parent !== scene) scene.add(L.holder);
  const C = L.crowd; L.t += dt;
  camera.updateMatrixWorld(); _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pv);
  C.beginFrame(); L.weapons.begin();
  for (const r of L.live) {
    if (!attached(r.root, scene)) continue;
    r.root.updateWorldMatrix(true, false);
    const k = r.mpu, e = _m.copy(r.root.matrixWorld);
    if (r.lift) e.multiply(_s.makeTranslation(0, r.lift + 0.05 * Math.sin(L.t * 1.7 + r.seed), 0));
    e.multiply(_s.makeScale(k, k, k));
    _sph.center.setFromMatrixPosition(e); _sph.center.y += r.height * 0.5; _sph.radius = r.height * 0.8 + 0.5;
    if (!_fr.intersectsSphere(_sph)) continue;
    const E = e.elements, o = C.row(r.slot) + 72 * 4, D = C.data;
    D[o] = E[0]; D[o + 1] = E[4]; D[o + 2] = E[8]; D[o + 3] = E[12]; D[o + 4] = E[1]; D[o + 5] = E[5]; D[o + 6] = E[9]; D[o + 7] = E[13]; D[o + 8] = E[2]; D[o + 9] = E[6]; D[o + 10] = E[10]; D[o + 11] = E[14];
    D.set(r.body.params, C.row(r.slot) + 75 * 4);
    C.show(r.proto, r.slot);
    if (r.body.wShown) { wl.length = 0; r.body.weaponDraw(e, wl); for (const [id, M] of wl) L.weapons.add(id, M); }
  }
  C.endFrame(L.t, dt, camera); L.weapons.end(dt);
}

/* ---------------------------------------------------------------- the API */
function design(kind, id) {
  if (kind === 'crew' && CREW[id]) return crewDef(id);
  if ((kind === 'foe' && FOE_IDS.includes(id)) || (kind === 'boss' && BOSS_IDS.includes(id))) return foeDef(id);
  throw new Error(`robot not found: ${kind}/${id}`);
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let serial = 0;

export function buildRobot(spec) {
  const kind = spec.kind || 'crew', id = spec.id, key = kind + ':' + id;
  const t0 = performance.now();
  const def = design(kind, id), C = crowd();
  const pr = C.proto(def);
  const seed = mix32(++serial * 7919 + id.length * 31 + id.charCodeAt(0));
  const body = new RoboBody(pr.P, seed, { zombie: def.zombie, kind: def.zombie ? def.kind : 'human', big: def.big });
  Object.assign(body.I, { gait: 0, arms: 2, splay: 0.12, hunch: 0 }, def.I || {});
  for (const b of def.hide || []) body.setHidden(b, true);
  body.setHidden(B.CRATE, true);
  if (def.weapon) body.setWeapon(def.weapon);
  const mpu = pr.dims.k * def.scale; body.mpu = mpu;
  const slot = C.alloc();
  const root = new THREE.Group(); root.name = 'robot:' + key;
  const height = def.spec.heightM * def.scale + (def.lift || 0);
  const r = { root, body, proto: pr, slot, mpu, height, lift: def.lift || 0, seed: seed % 97 };
  L.live.add(r);
  const st = { d: 0, hurt: 0 };
  const animate = (dt, s = {}) => {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const I = body.I, sp = Math.max(0, s.speed || 0);
    I.sp = def.glide ? 0 : sp / mpu; I.run = sp > 3; I.chase = def.zombie && sp > 1.2 ? 1 : 0;
    st.d += ((s.down ? 1 : 0) - st.d) * (1 - Math.exp(-dt * 4));
    const a = Math.min(1, Math.max(0, s.attack || 0));
    if (st.d > 0.02) body.force(def.zombie ? 'down' : 'collapse', sm(0, 1, st.d));
    else if (a > 0 && a < 1) body.force(def.atk || 'attack', a);
    else body.release();
    const h = s.hurt > 0.5 ? 1 : 0; if (h && !st.hurt) body.stagger(def.big ? 0.6 : 1); st.hurt = h;
    if (def.impostor) { const rv = (s.reveal ?? 0) > 0.5; body.emote = rv ? 'angry' : null; }
    body.update(dt, {});
    body.writeBones(C.data, C.row(slot));
  };
  animate(0, {});
  const old = robotStats[key];
  robotStats[key] = { tris: Math.round(pr.tris), meshes: 1, buildMs: old ? old.buildMs : +(performance.now() - t0).toFixed(2), height: +height.toFixed(2), n: (old?.n || 0) + 1 };
  return {
    root, height, animate, joints: {}, kind, id, body,
    dispose() { if (!L.live.delete(r)) return; C.release(slot); },
  };
}
