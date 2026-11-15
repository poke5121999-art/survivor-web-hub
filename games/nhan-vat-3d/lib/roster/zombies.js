// Zombie variant of the chibi preset, from the owner's zombie sheet (ref/owner-zombies-sheet.webp, crops
// ref/zcells/z1..z10.png). zombie: { eyes: white | orange | red | pink, brain, wounds: [{ at, side }] } switches the
// face to bulging eyes and an open mouth with teeth, adds glowing wounds, and the pose to a shamble.
import { SKIN } from '../chibi/compose.js';
const Z = (o) => Object.assign({ role: 'zombie', body: Object.assign({ head: 1.34 }, o.body || {}), dirt: 0.5 }, o);
export default [
  Z({ id: 'z1', name: 'Zombie sơ mi cam', skin: SKIN.zteal, top: { kind: 'tee', col: 0xf0f0f0 }, bottom: { kind: 'pants', col: 0x3a3a40, cuff: 0x5a5a60 }, shoes: { col: 0x8a6a5a },
    wear: [['vest', { col: 0xf0a040, open: 0.5, sleeves: 1.2, y0: 0.95, flare: 0.03 }]], zombie: { eyes: 'white', brain: true, wounds: [{ at: 'knee', side: -1 }] }, pose: 'zombie-dangle' }),
  Z({ id: 'z2', name: 'Zombie tóc Frankenstein', skin: SKIN.zgreen, hair: { style: 'spiky', col: 0x1c1c22 }, top: { kind: 'tee', col: 0x2aa8a8 }, bottom: { kind: 'shorts', col: 0x5a5a60, cuff: 0x8a8a90 }, shoes: { col: 0x3a3a40, sole: 0xf0f0f0, lace: 0xf0f0f0 },
    zombie: { eyes: 'orange', wounds: [{ at: 'knee', side: 1 }, { at: 'arm', side: -1 }] }, pose: 'zombie-forward' }),
  Z({ id: 'z3', name: 'Zombie du lịch', skin: SKIN.zgreen, top: { kind: 'tee', col: 0xe04a4a }, bottom: { kind: 'shorts', col: 0x2a2a2e }, shoes: { col: 0xd0503a },
    wear: [['strap', { col: 0x2a2a2e, side: -1, w: 0.012 }]], head: [['hat', { kind: 'bucket', col: 0xe06a2a }]], props: [['camera', {}], ['crowbar', { col: 0x8a8a90 }]], zombie: { eyes: 'white', big: -1, wounds: [{ at: 'knee', side: 1 }] }, pose: 'zombie-one' }),
  Z({ id: 'z4', name: 'Zombie dân văn phòng', skin: SKIN.zlime, hair: { style: 'flattop', col: 0x7ab83a }, top: { kind: 'long', col: 0xe8e6e0 }, bottom: { kind: 'pants', col: 0x3a3a40 }, shoes: { col: 0x3a2a24 },
    wear: [['tie', { col: 0x2a5ab0 }], ['belt', { col: 0x2a2220, y: 1.03 }], ['vest', { col: 0xd8d6d0, open: 0.6, y0: 1.0, sleeves: 1.0 }]], head: [['glasses', { lens: 0xc0e0f0 }]], zombie: { eyes: 'white', wounds: [{ at: 'arm', side: -1 }] }, pose: 'zombie-forward' }),
  Z({ id: 'z5', name: 'Zombie Noel', skin: SKIN.zlime, top: { kind: 'long', col: 0xd8c83a }, bottom: { kind: 'pants', col: 0x2a4ab0 }, shoes: { col: 0xc8d02a, kind: 'welly', right: { kind: 'sneaker', col: 0xc8d02a } },
    wear: [['tie', { col: 0xd05a2a }], ['belt', { col: 0x3a2a1a, y: 1.02 }], ['braces', { col: 0x6a4a2a }]], head: [['santa', {}]], zombie: { eyes: 'white', big: 1, wounds: [{ at: 'shin', side: 1 }] }, pose: 'zombie-limp' }),
  Z({ id: 'z6', name: 'Zombie biker', skin: SKIN.zlime, top: { kind: 'tee', col: 0x2ab0a8 }, bottom: { kind: 'pants', col: 0x2ab0a8, cuff: 0xc8e02a }, shoes: { col: 0x3a3a40, sole: 0xf0f0f0, lace: 0xf0f0f0 },
    head: [['helmet', { kind: 'army', col: 0x3a3a40 }], ['goggles', { up: true, lens: 0x5a5a60 }]], props: [['crowbar', { col: 0xd02a2a }]], zombie: { eyes: 'white', wounds: [{ at: 'arm', side: -1 }] }, pose: 'zombie-one' }),
  Z({ id: 'z7', name: 'Zombie cảnh sát', skin: SKIN.zteal, top: { kind: 'long', col: 0x3a3a40 }, bottom: { kind: 'pants', col: 0x3a3a40 }, shoes: { col: 0x2a2a2e },
    wear: [['vest', { col: 0x3a3a40, y0: 1.0, pocket: 0x34343a }], ['belt', { col: 0x1c1c20, y: 1.03, buckle: 0xb0b0b8 }], ['armband', { side: 1, col: 0xe0a02a, y0: 1.42 }]], head: [['helmet', { kind: 'police', col: 0x3a3a40, badge: 0xe0a02a }]], props: [['pistol', {}]], zombie: { eyes: 'pink' }, pose: 'zombie-dangle' }),
  Z({ id: 'z8', name: 'Zombie áo sọc', skin: SKIN.zteal, top: { kind: 'long', stripes: [0x1c1c22, 0xe8e6e0, 9] }, bottom: { kind: 'pants', col: 0x3a3a40 }, shoes: { col: 0x2a2a2e },
    wear: [['braces', { col: 0x6a4a2a }], ['belt', { col: 0x3a2a1a, y: 1.02, buckle: 0xd8b040 }], ['scarf', { col: 0xd02a2a, tail: false }], ['gloves', { col: 0xf0f0f0 }]], head: [['beret', { col: 0xd04a5a, side: true }]], zombie: { eyes: 'orange' }, pose: 'zombie-forward' }),
  Z({ id: 'z9', name: 'Zombie bóng bầu dục', skin: 0x5a6a78, top: { kind: 'tee', col: 0xe86a6a }, bottom: { kind: 'pants', col: 0xf0f0f0, end: 0.38 }, socks: 0xe86a6a, socksY: 0.4, shoes: { col: 0x1c1c22, sole: 0xf0f0f0 },
    wear: [['vest', { col: 0xf0f0f0, y0: 1.18, y1: 1.6, grow: 0.03 }], ['carrier', { col: 0xe86a6a, pouches: false, grow: 0.06 }], ['gloves', { col: 0x2a2a2e }]], head: [['helmet', { kind: 'football', col: 0xe86a6a }]], zombie: { eyes: 'red' }, pose: 'zombie-forward' }),
  Z({ id: 'z10', name: 'Zombie thợ mỏ', skin: SKIN.zgreen, top: { kind: 'long', col: 0x1a9a8a }, bottom: { kind: 'pants', col: 0x3a3a40 }, shoes: { col: 0x5a5a60 },
    wear: [['vest', { col: 0xf07a2a, y0: 0.98, grow: 0.034, stripes: { col: 0xf0d02a, ys: [1.08, 1.3] } }], ['gloves', { col: 0x3a2a24 }]], head: [['helmet', { kind: 'miner', col: 0xd04a2a }]], zombie: { eyes: 'orange' }, pose: 'zombie-dangle' }),
];
