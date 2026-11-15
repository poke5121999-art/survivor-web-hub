// Seeded crew generation: colour schemes, names, part picks.
import { TORSO_KEYS, HEAD_KEYS, EAR_KEYS, ANT_KEYS, HAND_KEYS, FOOT_KEYS, LIMB_KEYS } from './parts.js';
import { HAT_TOP, HAT_BODY } from './hats.js';

export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];

// A main, B secondary, C sticker accent, glow, eye colour, dark metal tint, vi name
export const SCHEMES = [
  { vi: 'Cà chua kem', A: 0xd9483b, B: 0xf1e3c6, C: 0x2f4858, glow: 0xffb347, eye: 0x9dffb0, dark: 0x30302f },
  { vi: 'Bạc hà than', A: 0x7fd1b9, B: 0x3a3f44, C: 0xff6f59, glow: 0x7cf7ff, eye: 0x8ff7ff, dark: 0x2c2f33 },
  { vi: 'Mù tạt xanh đêm', A: 0xe3b23c, B: 0x24366b, C: 0xffffff, glow: 0xffe08a, eye: 0xfff07a, dark: 0x2a2c33 },
  { vi: 'Trời trong', A: 0x7ab8e8, B: 0xf3f1ea, C: 0xf25c54, glow: 0x9fe3ff, eye: 0xbaf2ff, dark: 0x30343a },
  { vi: 'Tím bơ', A: 0xb69de0, B: 0xf8e79a, C: 0x463a6b, glow: 0xffd6ff, eye: 0xffc8ff, dark: 0x2e2a35 },
  { vi: 'Cam mòng két', A: 0xf28c38, B: 0x1f6f78, C: 0xfff3d6, glow: 0x6fffe9, eye: 0x7dffe1, dark: 0x2b2d30 },
  { vi: 'Hồng bạc hà', A: 0xf4a6b8, B: 0x9be3c8, C: 0x5a3d55, glow: 0xff9ecf, eye: 0xb2ffdf, dark: 0x332c31 },
  { vi: 'Rừng cát', A: 0x4f7d4a, B: 0xd9c49b, C: 0xffd23f, glow: 0xc7ff6b, eye: 0xd4ff8a, dark: 0x2a2d28 },
  { vi: 'Lửa', A: 0xcc2936, B: 0xf6c12c, C: 0x1b1b1e, glow: 0xffa62b, eye: 0xffd36b, dark: 0x2c2929 },
  { vi: 'Lam cô-ban', A: 0x2c5cc5, B: 0xf09a3e, C: 0xffffff, glow: 0x7ab6ff, eye: 0x9cd3ff, dark: 0x262a33 },
  { vi: 'Than chanh', A: 0x4a4e57, B: 0xb5e33b, C: 0xffffff, glow: 0xc9ff4a, eye: 0xd8ff5c, dark: 0x25272b },
  { vi: 'Ngà san hô', A: 0xefe7d6, B: 0xf2786b, C: 0x3b4a6b, glow: 0xffa38f, eye: 0x88f0ff, dark: 0x34322f },
  { vi: 'Gỉ sét xô thơm', A: 0xb5532f, B: 0xa7b89a, C: 0xf5e6c8, glow: 0xffb27a, eye: 0xffcf8a, dark: 0x2f2a27 },
  { vi: 'Đen vàng', A: 0x24252a, B: 0xd8a62c, C: 0xf2f2f2, glow: 0xffd75e, eye: 0xffe27a, dark: 0x1c1d20 },
  { vi: 'Kẹo bông', A: 0xff8fc7, B: 0x8fd3ff, C: 0xffffff, glow: 0xfff07a, eye: 0xfff3a1, dark: 0x302c33 },
  { vi: 'Ô liu gạch', A: 0x7d7a3a, B: 0xb8492f, C: 0xf2e3bc, glow: 0xffc06b, eye: 0xc8ff9a, dark: 0x2b2a24 },
];
const N1 = ['Bu', 'Tí', 'Lon', 'Ốc', 'Bin', 'Tủn', 'Mít', 'Kẹo', 'Cốm', 'Đậu', 'Bơ', 'Na', 'Xu', 'Bi', 'Khoai', 'Sò', 'Chíp', 'Mận', 'Tôm', 'Nấm', 'Gấc', 'Bột', 'Cúc', 'Vít', 'Pin', 'Tép', 'Hến', 'Lu', 'Ken', 'Mõ'];
const N2 = ['Lông', 'Nhôm', 'Thiếc', 'Vít', 'Ti', 'Xẹt', 'Tròn', 'Lắc', 'Nhí', 'Bông', 'Rỉ', 'Còi', 'Sắt', 'Kêu', 'Lùn', 'Nhỏ', 'Đen', 'Tèo', 'Lì', 'Lóc'];
export const PART_VI = {
  torso: { bean: 'Hạt đậu', capsule: 'Con nhộng', tincan: 'Lon thiếc', egg: 'Quả trứng', barrel: 'Thùng tròn', lanky: 'Lêu nghêu', cube: 'Hộp vuông', tank: 'Nồi hơi' },
  head: { crt: 'TV cũ (màn LED)', orb: 'Quả cầu 2 ống kính', monocle: 'Một mắt', pill: 'Viên thuốc (dải màn)', bucket: 'Xô úp', dome: 'Mái vòm (màn tròn)', bino: 'Ống nhòm' },
  ears: { none: 'Không', bolts: 'Bu lông', cups: 'Loa tai', fins: 'Vây tản nhiệt' },
  ant: { none: 'Không', whip: 'Cần dài', twin: 'Đôi râu', coil: 'Lò xo', dish: 'Chảo thu', bunny: 'Tai thỏ', bulb: 'Bóng đèn' },
  hand: { mitt: 'Găng', claw: 'Kẹp', ball: 'Tay tròn', tri: 'Ba ngón' },
  foot: { boot: 'Ủng', pad: 'Đế vuông', cup: 'Cốc', flipper: 'Chân vịt' },
  limb: { rod: 'Thanh', coil: 'Lò xo', piston: 'Pít-tông' },
};

export function makeSpec(seed) {
  const r = rng(seed * 7919 + 13);
  const torso = pick(r, TORSO_KEYS), headK = pick(r, HEAD_KEYS);
  const limb = r() < 0.45 ? 'rod' : r() < 0.6 ? 'coil' : 'piston';
  const hatTop = r() < 0.85 ? pick(r, HAT_TOP) : null, hatBody = r() < 0.45 ? pick(r, HAT_BODY) : null;
  const sch = Math.floor(r() * SCHEMES.length);
  return {
    seed, name: pick(r, N1) + ' ' + pick(r, N2), num: 1 + Math.floor(r() * 98), scheme: sch, torso, head: headK,
    ears: r() < 0.5 ? 'none' : pick(r, EAR_KEYS), ant: r() < 0.25 ? 'none' : pick(r, ANT_KEYS), hand: pick(r, HAND_KEYS), foot: pick(r, FOOT_KEYS), limb,
    hat: hatTop, acc: hatBody, legLen: 0.16 + r() * 0.14, armLen: 0.2 + r() * 0.1, limbR: 0.011 + r() * 0.006, headScale: 1.1 + r() * 0.25,
    sticker: Math.floor(r() * 8), wear: 0.15 + r() * 0.45, swapAB: r() < 0.3, hatCol: r() < 0.35, personality: r(),
  };
}
