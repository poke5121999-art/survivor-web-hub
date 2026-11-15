// Characters from the owner's scene images (ref/owner-campfire-scene.webp, ref/owner-workshop-scene.webp).
// Guns in the scenes come from the stylized-weapons kit (held through a HandSocket), so these specs carry no gun prop.
import { SKIN } from '../chibi/compose.js';
export const CAMPFIRE = [
  { id: 'cf-rifleman', name: 'Gã ria mép cầm súng', role: 'survivor', skin: SKIN.tan, hair: { style: 'quiff', col: 0x3a2214 }, beard: { style: 'stache', col: 0x2a1a10 },
    top: { kind: 'tee', col: 0x2a2a30 }, bottom: { kind: 'pants', col: 0x2a2a30, rip: 2 }, shoes: { col: 0x3a3a40, sole: 0xe8e6e0 },
    wear: [['vest', { col: 0xd8402a, open: 0.55, sleeves: 1.42, y0: 1.0, collar: true }], ['collar', { col: 0xd8402a, open: true }], ['kneepad', { side: -1, col: 0x5a5a60, strap: 0x2a2a2e }], ['gloves', { col: 0x2a2a2e }], ['belt', { col: 0x2a2220, y: 1.03 }]],
    pose: 'rifleRelaxed', dirt: 0.4 },
  { id: 'cf-cook', name: 'Đầu bếp ngồi ghế nhựa', role: 'staff', skin: SKIN.tan, top: { kind: 'long', col: 0x26262b }, bottom: { kind: 'pants', col: 0x26262b, rip: 1 }, shoes: { col: 0x1c1c20, sole: 0xd02a2a },
    wear: [['vest', { col: 0x26262b, y0: 1.0, buttons: 0xd02a2a, double: true }], ['collar', { col: 0xd02a2a }], ['belt', { col: 0xd02a2a, buckle: false, y: 1.08, grow: 0.05 }], ['armband', { side: 1, col: 0xd02a2a, y0: 1.0, grow: 0.03 }], ['armband', { side: -1, col: 0x8a8a90, y0: 1.36, grow: 0.03 }], ['badge', { col: 0xe8c02a, x: 0.12, y: 1.46 }]],
    head: [['cap', { col: 0x26262b, brim: 0x26262b }], ['headband', { col: 0xd02a2a }]], props: [['can', { col: 0xd8301a }]], pose: 'sitCross', dirt: 0.4 },
  { id: 'cf-goggles', name: 'Áo liền xanh mũ len đỏ', role: 'survivor', skin: SKIN.brown, top: { kind: 'long', col: 0xa8b830 }, bottom: { kind: 'pants', col: 0xa8b830 }, shoes: { col: 0x8a8a90, sole: 0xe8e6e0 },
    wear: [['belt', { col: 0x5a4a2a, y: 1.03, pouches: 0x8a9a2a, pouchAt: [0.9] }], ['backpack', { col: 0xe0b020, col2: 0x8a6a10, k: 0.85 }], ['kneepad', { side: -1, col: 0xe8e6e0 }]],
    head: [['beanie', { col: 0xd8202a }], ['goggles', { lens: 0x2ad0a0, frame: 0x8a8a90 }]], pose: 'crossed', dirt: 0.55 },
  { id: 'cf-camo', name: 'Cô mũ rằn ri ngồi nệm', role: 'survivor', skin: SKIN.light, body: { bust: 0.025, k: 0.9 }, hair: { style: 'bob', col: 0x5a3a20 },
    top: { kind: 'tank', col: 0xe8e0c8 }, bottom: { kind: 'shorts', col: 0x7a6a40, pat: 'camo', end: 0.66 }, shoes: { kind: 'boot', col: 0x6a6a70 },
    wear: [['strap', { col: 0xc8a030, side: 1 }], ['armband', { side: -1, col: 0x2a5ad0, y0: 1.36, grow: 0.03 }], ['kneepad', { side: 1, col: 0x6a6a70 }], ['bandage', { side: -1, y0: 0.3, y1: 0.42, col: 0x8a8a90 }]],
    head: [['hat', { kind: 'bucket', col: 0x9a8a5a, pat: 'camo', band: 0x5a4a30 }]], pose: 'sitGround', dirt: 0.4 },
];
export const WORKSHOP = [
  { id: 'ws-soldier', name: 'Lính soi khẩu AK', role: 'raider', skin: SKIN.tan, top: { kind: 'long', col: 0x2e3034 }, bottom: { kind: 'pants', col: 0x26282c }, shoes: { kind: 'boot', col: 0x1c1c20 },
    wear: [['collar', { col: 0x2e3034, open: true }], ['strap', { col: 0x4a3020, side: -1, pouch: 0x5a3a24 }], ['belt', { col: 0x3a2618, y: 1.02, buckle: 0xd8b040 }], ['holster', { side: 1, col: 0x4a3020 }], ['armband', { side: 1, col: 0x1c1c20, y0: 1.36, grow: 0.03 }], ['backpack', { col: 0x3a3c40, k: 0.7 }]],
    head: [['helmet', { kind: 'ballistic', col: 0x3a4048, visor: 0x7a4ad8 }]], pose: 'inspect', dirt: 0.35 },
  { id: 'ws-smoker', name: 'Gã râu ngồi bàn thợ', role: 'trader', skin: SKIN.light, beard: { style: 'full', col: 0x2a1c14 },
    top: { kind: 'tank', col: 0xd83a3a, pat: 'check' }, bottom: { kind: 'pants', col: 0x2a3ab0, pat: 'denim' }, shoes: { col: 0x3a3a40, sole: 0xe8e6e0 },
    wear: [['bandage', { side: -1, y0: 0.4, y1: 0.56 }], ['cigarette', { side: 1 }]], head: [['beanie', { col: 0x3a3a40 }]], props: [['cig', {}]], pose: 'deskSit', dirt: 0.45 },
];
