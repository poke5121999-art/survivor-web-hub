// Skins: whole looks per tank, after the old game's "坦克皮肤" panel. Each tank has a set of complete skins, each
// with a grade: A (the tank's own look, free and owned from the start), S (a premium recolour with a richer finish)
// and SS (a premium recolour plus a signature flair: a glowing sigil disc under the tank, a lamp colour that pulses
// between two colours and its own aura ramp at form III). Pure data, no THREE, so the save, the lobby and Node tests
// can read it.
//
// A row: { id, name, grade, price, pal, finish?, aura?, flair?, variant? }
//   pal: { body, deep, trim, glow } replaces the tank's STYLES colours (gfx/styles.js), null for the tank's own look.
//   finish: 'gloss' | 'chrome' | 'satin' | 'pearl', how polished the whole model reads (gfx/mechs.js FINISHES).
//   aura: a key of AURAS, the colour ramp of the form III flame aura.
//   flair: { sigil: 'sun' | 'lotus' | 'rune' | 'star' | 'wave', pulse: hex, disc?: hex (the sigil's main colour, else glow) } (SS only).
//   variant: a design variant name the tank's model builder reads as st.variant (gfx/mechs.js build), for an SS skin that
//     is a different model, not only a recolour (moclan 'phoenix'), or a finish rule of the design (moclan 'gold': the gold body keeps its full colour at every form, no form I greying); a
//     design that knows no variant ignores it.
// A later per-skin stat bonus (the reference panel's collection bonuses) would be one more field here, read nowhere yet.
//
// To give a tank its own skins, set SKINS[key] after the generated rows (as moclan does); ids only have to be unique
// within the tank and 'goc' stays the free one.

export const GRADES = {
  A: { name: 'A', color: '#62e07a' },
  S: { name: 'S', color: '#3fd8ff' },
  SS: { name: 'SS', color: '#ff5ae0' },
};
export const GRADE_ORDER = ['A', 'S', 'SS'];
// In coins, the currency the paints used; Tinh Thể pays GEM_RATE coins each, as everywhere else.
export const SKIN_PRICE = { A: 0, S: 800, SS: 2000 };
export const BASE_SKIN = 'goc';

// Aura ramps: root, middle, tip of a flame card, linear RGB 0..1 (gfx/ornate.js fireAura).
export const AURAS = {
  gold: [[0.95, 0.85, 0.5], [0.85, 0.55, 0.08], [0.35, 0.15, 0.0]],
  frost: [[0.8, 0.92, 1.0], [0.3, 0.65, 0.95], [0.04, 0.12, 0.4]],
  venom: [[0.85, 1.0, 0.5], [0.35, 0.85, 0.1], [0.04, 0.25, 0.02]],
  void: [[0.85, 0.7, 1.0], [0.5, 0.2, 0.9], [0.12, 0.02, 0.3]],
  sakura: [[1.0, 0.85, 0.92], [0.95, 0.45, 0.7], [0.4, 0.06, 0.25]],
  inferno: [[0.95, 0.8, 0.4], [0.9, 0.3, 0.04], [0.35, 0.02, 0.0]],
  storm: [[0.9, 0.95, 1.0], [0.45, 0.6, 1.0], [0.1, 0.1, 0.45]],
  jade: [[0.8, 1.0, 0.88], [0.2, 0.85, 0.55], [0.02, 0.3, 0.18]],
  blood: [[1.0, 0.6, 0.55], [0.85, 0.08, 0.12], [0.25, 0.0, 0.04]],
  abyss: [[0.7, 1.0, 0.95], [0.1, 0.6, 0.75], [0.04, 0.06, 0.3]],
  phoenix: [[1.0, 0.95, 0.6], [0.95, 0.45, 0.08], [0.6, 0.05, 0.05]],
};
export const SIGILS = ['sun', 'lotus', 'rune', 'star', 'wave'];

// Per tank: [S name, [body, deep, trim, glow], finish, SS name, [body, deep, trim, glow, pulse], sigil, aura].
// Chosen by hand per tank: S is a luxury or opposite scheme of the same creature, SS its mythic form.
const T = {
  trau: ['Trâu Vàng Ròng', [0xc8962a, 0x3a2810, 0x1c1a18, 0xffd060], 'gloss', 'Thanh Ngưu Thần', [0x1e5a6a, 0x0a1e26, 0xd8b050, 0x60f0ff, 0xffe080], 'rune', 'frost'],
  soi: ['Sói Bạc Tuyết', [0xdfe6ee, 0x3a4a5a, 0x2a8ad8, 0x8ad8ff], 'chrome', 'Sói Địa Ngục', [0x1a1418, 0x080406, 0xff3a1a, 0xff4a10, 0xffc040], 'sun', 'inferno'],
  ung: ['Ưng Hoàng Kim', [0xe0b040, 0x4a3010, 0x1c1c22, 0xffe080], 'gloss', 'Ưng Bão Tố', [0x1a2a5a, 0x080c22, 0x7ad8ff, 0x60c8ff, 0xe0f8ff], 'star', 'storm'],
  hac: ['Hạc Đỏ Son', [0xf2eee6, 0x7a1a1a, 0xd8302a, 0xff8060], 'pearl', 'Hạc Ngọc Bích', [0xe8fff4, 0x1a5a4a, 0x30d8a0, 0x60ffd0, 0xffffff], 'lotus', 'jade'],
  loi: ['Lôi Công Hắc Kim', [0x22232a, 0x0a0a0e, 0xf2c21a, 0xffd040], 'gloss', 'Lôi Thần Tử Điện', [0x4a2a9a, 0x140a30, 0xe8e0ff, 0xb080ff, 0x80e0ff], 'star', 'storm'],
  bocap: ['Bọ Cạp Sa Mạc', [0xd8a860, 0x5a3a1a, 0x2a2018, 0xffb040], 'satin', 'Bọ Cạp Độc Lục', [0x123a1a, 0x040e06, 0x60ff40, 0x80ff30, 0xe0ff80], 'rune', 'venom'],
  bang: ['Băng Nha Hắc Băng', [0x2a3a5a, 0x0a1020, 0x9ad8ff, 0x60c0ff], 'chrome', 'Băng Hoàng', [0xf4fbff, 0x5a8ab8, 0x9ff0ff, 0xb0f8ff, 0xffffff], 'star', 'frost'],
  tho: ['Thợ Rèn Đồng Thau', [0xc89a3a, 0x4a3010, 0x6a3a1a, 0xffc060], 'gloss', 'Lò Rèn Dung Nham', [0x2a1a14, 0x0a0604, 0xff6a1a, 0xff5010, 0xffd040], 'sun', 'inferno'],
  thancong: ['Thần Công Ngự Lâm', [0x8a1a1a, 0x2a0606, 0xe8b840, 0xffd060], 'gloss', 'Thần Công Ngọc Lục', [0x0e5a4a, 0x02201a, 0xf2d070, 0x60ffc0, 0xfff0a0], 'rune', 'jade'],
  mangxa: ['Mãng Xà Hoàng Kim', [0xd8a830, 0x3a2808, 0x1a1a1a, 0xffe060], 'gloss', 'Xà Vương U Minh', [0x2a1a4a, 0x0a0618, 0x8a40ff, 0xc060ff, 0x60ffd0], 'wave', 'void'],
  kimquy: ['Kim Quy Hắc Ngọc', [0x1e2a2a, 0x080e0e, 0xd8a82a, 0x60ffd0], 'satin', 'Thần Quy Lam Hải', [0x1a5aa8, 0x08204a, 0xf2d070, 0x60e8ff, 0xfff0a0], 'wave', 'frost'],
  hacho: ['Bạch Hổ', [0xeef0f2, 0x3a3e48, 0x1a1a20, 0x80d8ff], 'pearl', 'Hổ Vương Hỏa Ngục', [0x1a0a0a, 0x080202, 0xffb020, 0xff4010, 0xffe060], 'sun', 'inferno'],
  holy: ['Hồ Ly Tuyết', [0xf4f6fa, 0x6a7a9a, 0x9ad0ff, 0xb0e8ff], 'pearl', 'Hồ Ly Huyết Nguyệt', [0x6a0a2a, 0x1a0208, 0xffd060, 0xff3060, 0xffc0e0], 'lotus', 'blood'],
  domdom: ['Đom Đóm Ngân Hà', [0x1a2a5a, 0x080c22, 0xd8e8ff, 0x80c8ff], 'satin', 'Đom Đóm Lân Tinh', [0x0e2a1a, 0x020a06, 0xa0ff60, 0xc0ff40, 0x60ffe0], 'star', 'jade'],
  tacke: ['Tắc Kè Hồng Ngọc', [0xd83a6a, 0x4a0a1e, 0xffd060, 0xff80b0], 'gloss', 'Tắc Kè Cầu Vồng', [0x2a1a5a, 0x0a0620, 0x40ffd0, 0x60ffe0, 0xff60e0], 'wave', 'void'],
  hoalong: ['Hắc Long', [0x1a1a22, 0x060608, 0xd8a030, 0xff6020], 'gloss', 'Thanh Long', [0x1a6a8a, 0x062030, 0xf2d070, 0x60f0ff, 0xffffff], 'wave', 'frost'],
  khiphao: ['Khỉ Pháo Kim Cang', [0xd8a830, 0x5a3a10, 0xc82a2a, 0xffe060], 'gloss', 'Tề Thiên Hỏa Nhãn', [0xc8241a, 0x3a0606, 0xffd040, 0xffa020, 0xffffff], 'sun', 'gold'],
  quancong: ['Quan Công Hắc Giáp', [0x1e1e24, 0x08080a, 0xc8302a, 0xffd040], 'satin', 'Thanh Long Yển Nguyệt', [0x0e6a4a, 0x02281a, 0xf2c040, 0x60ffc0, 0xffe080], 'wave', 'jade'],
  natra: ['Na Tra Bạch Liên', [0xf4f0ea, 0x8a6a6a, 0xff6a8a, 0xff9ab0], 'pearl', 'Na Tra Phong Hỏa Luân', [0xd81a1a, 0x4a0404, 0xffd040, 0xff7020, 0xffffa0], 'sun', 'inferno'],
  duongtien: ['Dương Tiễn Hắc Kim', [0x24242c, 0x0a0a0e, 0xd9a63a, 0xffd060], 'gloss', 'Nhị Lang Thiên Nhãn', [0xf2f4f8, 0x5a6a8a, 0x6fe3ff, 0x80f0ff, 0xffe080], 'star', 'storm'],
  athena: ['Athena Đồng Đỏ', [0xb85a3a, 0x4a1a10, 0xe8c060, 0xffb060], 'gloss', 'Athena Thánh Chiến', [0xf8f8ff, 0x6a7aa8, 0xf2c040, 0xffe080, 0x9ff0ff], 'sun', 'gold'],
  hades: ['Hades Lửa Lam', [0x1a2240, 0x080a18, 0x3a8aff, 0x40a0ff], 'satin', 'Hades Minh Vương', [0x0a0a10, 0x020204, 0xc0ff40, 0x60ff80, 0x8a40ff], 'rune', 'void'],
  lubo: ['Lữ Bố Bạch Giáp', [0xeef0f2, 0x5a5e6a, 0xd8302a, 0xff6a40], 'pearl', 'Lữ Bố Xích Thố', [0x2a0a0a, 0x0a0202, 0xffb020, 0xff3010, 0xffd060], 'sun', 'inferno'],
  mucma: ['Mực Ma Lam Thẳm', [0x0e2a5a, 0x040a1e, 0x40c0ff, 0x40d0ff], 'satin', 'Mực Ma Tím Độc', [0x3a0a4a, 0x10021a, 0xff40c0, 0xff40e0, 0x60ffd0], 'wave', 'void'],
  kynhong: ['Kỳ Nhông Băng Lam', [0x2a8ad8, 0x0a2a4a, 0xe0f4ff, 0x80e0ff], 'gloss', 'Kỳ Nhông Dung Nham', [0x1a1010, 0x060202, 0xff5a10, 0xff7020, 0xffe040], 'sun', 'inferno'],
  nguma: ['Ngưu Ma Hắc Thiết', [0x2a2a30, 0x0a0a0e, 0xc8a040, 0xff8a20], 'satin', 'Ngưu Ma Hỏa Diệm', [0x8a1010, 0x2a0202, 0xffc030, 0xff4010, 0xffff80], 'sun', 'inferno'],
  sontinh: ['Sơn Tinh Ngọc Thạch', [0x2a7a5a, 0x0a2a1e, 0xe8d8a0, 0x80ffc0], 'gloss', 'Sơn Tinh Hoàng Sơn', [0xc89a3a, 0x4a3010, 0x2a5a2a, 0xffe060, 0x9cff6a], 'rune', 'gold'],
  enbac: ['Én Vàng', [0xe0b040, 0x5a3a10, 0x1a1a20, 0xffe080], 'gloss', 'Én Phong Lôi', [0x1a1a3a, 0x060612, 0x60d0ff, 0x60c8ff, 0xffffff], 'star', 'storm'],
  boica: ['Bói Cá Ngọc Lam', [0x1a8ab0, 0x06304a, 0xffd060, 0x80f0ff], 'gloss', 'Bói Cá Hoàng Hôn', [0xe8602a, 0x5a1a08, 0x2a2a3a, 0xffa040, 0xffe0a0], 'sun', 'gold'],
  bohung: ['Bọ Hung Lục Bảo', [0x1a6a3a, 0x06261a, 0xd8b040, 0x80ff80], 'gloss', 'Thánh Giáp Ai Cập', [0xd8a830, 0x4a3008, 0x1a3a8a, 0x5ab8ff, 0xffe080], 'sun', 'gold'],
  cakiem: ['Cá Kiếm Lam Biển', [0x1a4a9a, 0x081a3a, 0xe0e8f0, 0x60d0ff], 'chrome', 'Cá Kiếm Hải Vương', [0x0a2a3a, 0x020a10, 0xf2c040, 0x40ffe0, 0xffe080], 'wave', 'abyss'],
  gilgamesh: ['Anh Hùng Vương Hắc Kim', [0x1e1e24, 0x0a0a0c, 0xd9b23a, 0xffe060], 'gloss', 'Vương Khố Hoàng Kim', [0xf2d060, 0x8a6010, 0x2a6ad8, 0xfff0a0, 0x80c0ff], 'sun', 'gold'],
  buomdem: ['Bướm Đêm Lam Nguyệt', [0x1a3a8a, 0x08143a, 0xd8e8ff, 0x80d0ff], 'satin', 'Bướm U Linh', [0x0a0a14, 0x020206, 0xc060ff, 0xc080ff, 0x60ffd0], 'lotus', 'void'],
  laclong: ['Lạc Long Hồng Ngọc', [0x9a1a2a, 0x3a0610, 0xf2d070, 0xff6070], 'gloss', 'Long Quân Thủy Tổ', [0xe8c040, 0x6a4a10, 0x1a6a8a, 0x60f0ff, 0xfff0a0], 'wave', 'gold'],
  baogam: ['Báo Gấm Hoàng Kim', [0xd8a030, 0x5a3808, 0x1a1418, 0xffd060], 'gloss', 'Báo Đêm Tinh Vân', [0x14143a, 0x04040e, 0x60ffd0, 0x7affe0, 0xb48cff], 'star', 'void'],
  luondien: ['Lươn Điện Hắc Lôi', [0x1a1a22, 0x060608, 0xf2e03a, 0xffe040], 'gloss', 'Lươn Điện Huyết Lôi', [0x5a0a1a, 0x1a0206, 0xff6a6a, 0xff3a4a, 0xffe0e0], 'star', 'blood'],
  tegiac: ['Tê Giác Thép Xám', [0x5a626e, 0x1e2228, 0xe8a030, 0xffc060], 'satin', 'Tê Giác Kim Cương', [0xe8f4ff, 0x5a7aa8, 0x80d8ff, 0xa0f0ff, 0xffffff], 'star', 'frost'],
  quaset: ['Quạ Sét Bạch Kim', [0xd8dce4, 0x4a5060, 0x2a2a40, 0x9fd8ff], 'chrome', 'Quạ Huyết Lôi', [0x1a0a0e, 0x060204, 0xff3a3a, 0xff4040, 0xffc060], 'rune', 'blood'],
  tumay: ['Tư Mã Ý Tử Kim', [0x4a1a6a, 0x18062a, 0xe8c060, 0xffd080], 'gloss', 'Tư Mã Thiên Cơ', [0x0e1a3a, 0x040810, 0x80d0ff, 0x60c0ff, 0xc07aff], 'rune', 'storm'],
  dieuthuyen: ['Điêu Thuyền Hồng Y', [0xd8305a, 0x5a0a20, 0xf2d070, 0xffa0c0], 'gloss', 'Bế Nguyệt Tiên Tử', [0xf4f0ff, 0x6a5aa8, 0xc0b0ff, 0xb0d8ff, 0xffc0e0], 'lotus', 'sakura'],
  thuytinh: ['Thủy Tinh Hắc Thủy', [0x14203a, 0x040810, 0x40e0d0, 0x40f0e0], 'satin', 'Thủy Tinh Nộ Hải', [0x0a4a8a, 0x021830, 0xf2c040, 0x60f0ff, 0xffffff], 'wave', 'frost'],
  samthep: ['Sam Thép Đồng Cổ', [0xb87a3a, 0x4a2a10, 0x2a5a4a, 0x80ffd0], 'satin', 'Sam Thép Huyền Thiết', [0x14141c, 0x040406, 0xc07aff, 0xc07aff, 0x60ffd0], 'rune', 'void'],
  cuuvi: ['Cửu Vĩ Huyền Hồ', [0x1a1a24, 0x08080c, 0xd8a030, 0xff7a2a], 'gloss', 'Cửu Vĩ Thiên Hồ', [0xfff8f0, 0xa86a3a, 0xffb040, 0xff6a3a, 0xffe0a0], 'lotus', 'inferno'],
  kiemthan: ['Kiếm Thần Hắc Kiếm', [0x22242c, 0x08080c, 0xc8302a, 0xff4a4a], 'satin', 'Kiếm Thánh Thiên Quang', [0xf8f8ff, 0x6a7aa8, 0xf2c040, 0xfff0a0, 0x80e0ff], 'sun', 'gold'],
  suatrang: ['Sứa Hồng Ngọc', [0xffb0d0, 0x8a3a6a, 0xffffff, 0xff9ad8], 'pearl', 'Sứa Thâm Uyên', [0x0a1a3a, 0x020610, 0x60ffe0, 0x40ffe0, 0xc07aff], 'wave', 'abyss'],
  khidot: ['Khỉ Đột Bạc Lưng', [0x5a626e, 0x1e2228, 0xd8dce4, 0x9ad8ff], 'satin', 'Kong Hỏa Sơn', [0x2a1410, 0x0a0402, 0xff6a1a, 0xff5010, 0xffd040], 'sun', 'inferno'],
  retdo: ['Rết Vàng', [0xd8a830, 0x4a3008, 0x1a1a1e, 0xffe060], 'gloss', 'Rết Độc Lục Diệm', [0x0e2a14, 0x020a04, 0x80ff40, 0x80ff30, 0xe0ff60], 'rune', 'venom'],
  nhenthep: ['Nhện Thép Góa Phụ', [0x14141a, 0x040406, 0xd8202a, 0xff3040], 'gloss', 'Nhện Tơ Bạc', [0xe8eef4, 0x5a6a7a, 0x8ad8ff, 0xb0f0ff, 0xffffff], 'star', 'frost'],
  taothao: ['Tào Tháo Ngụy Vương', [0x1a2a6a, 0x060c26, 0xd9b23a, 0xffd060], 'gloss', 'Tào Tháo Bá Đồ', [0x3a0a0a, 0x100202, 0xf2c040, 0xff4a2a, 0xffe080], 'sun', 'blood'],
  bongua: ['Bọ Ngựa Hoa Lan', [0xf0c8e0, 0x8a4a7a, 0x9aff6a, 0xff9ad8], 'pearl', 'Bọ Ngựa Phỉ Thúy', [0x0e4a2a, 0x021a0e, 0xf2d070, 0x60ffa0, 0xe0ff80], 'lotus', 'jade'],
  anduong: ['An Dương Thần Nỏ', [0x1a5a4a, 0x062018, 0xd8b040, 0x80ffd0], 'gloss', 'Kim Quy Thần Nỏ', [0xe8c040, 0x6a4a10, 0x2aa080, 0x60ffd0, 0xfff0a0], 'rune', 'gold'],
  chuottui: ['Chuột Túi Sa Mạc Đỏ', [0xb84a2a, 0x4a1a0a, 0xf2e0c0, 0xffa060], 'satin', 'Chuột Túi Tinh Không', [0x1a1a4a, 0x060614, 0xd8e0ff, 0x80c0ff, 0xffe0ff], 'star', 'storm'],
  vesau: ['Ve Sầu Hổ Phách', [0xd89a2a, 0x5a3808, 0x3a1a10, 0xffc040], 'gloss', 'Ve Sầu Kim Thiền', [0x0e3a2a, 0x02140e, 0xf2d070, 0x80ffc0, 0xfff0a0], 'lotus', 'jade'],
};

const pal4 = (a) => ({ body: a[0], deep: a[1], trim: a[2], glow: a[3] });
export const SKINS = {};
for (const [k, [sn, sp, sf, xn, xp, sig, aura]] of Object.entries(T)) {
  SKINS[k] = [
    { id: BASE_SKIN, name: 'Nguyên Bản', grade: 'A', price: SKIN_PRICE.A, pal: null },
    { id: 's', name: sn, grade: 'S', price: SKIN_PRICE.S, pal: pal4(sp), finish: sf },
    { id: 'ss', name: xn, grade: 'SS', price: SKIN_PRICE.SS, pal: pal4(xp), finish: 'chrome', aura, flair: { sigil: sig, pulse: xp[4] } },
  ];
}

// Hoa Mộc Lan: the three skins of the owner's old game (坦克皮肤 panel): A 花木兰II pink (the tank's own look), S 花木兰III
// gold and black with red accents, SS 凰兮凤舞 a different model: the phoenix variant of the design (gfx/ornate-b5.js).
SKINS.moclan = [
  { id: BASE_SKIN, name: 'Hoa Mộc Lan II', grade: 'A', price: SKIN_PRICE.A, pal: null },
  { id: 's', name: 'Hoa Mộc Lan III', grade: 'S', price: SKIN_PRICE.S, pal: pal4([0xf0a828, 0x16161a, 0xd02830, 0xffd060]), finish: 'gloss', variant: 'gold' },
  { id: 'ss', name: 'Hoàng Hề Phượng Vũ', grade: 'SS', price: SKIN_PRICE.SS, pal: pal4([0xc81a1a, 0x3a0404, 0xffc030, 0xff7020]), finish: 'chrome', aura: 'phoenix', flair: { sigil: 'sun', pulse: 0xffe080, disc: 0x30a8ff }, variant: 'phoenix' },
];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// The row a tank wears for `id`; an unknown id (or a tank with no skins) is its own look. null for bosses and unknown keys.
export function skinOf(mech, id) {
  const list = has(SKINS, mech) ? SKINS[mech] : null;
  if (!list) return null;
  return (typeof id === 'string' && list.find((s) => s.id === id)) || list[0];
}
// The id to keep for a tank: a known non-base id, else null (the tank's own look). Used on every input that crosses a
// trust line (save, lobby message, roster), so a bad id never reaches the renderer.
export function cleanSkin(mech, id) {
  const list = has(SKINS, mech) ? SKINS[mech] : null;
  return list && typeof id === 'string' && id !== BASE_SKIN && list.some((s) => s.id === id) ? id : null;
}
// A save key for an owned skin: 'mech:id'.
export const skinKey = (mech, id) => mech + ':' + id;
