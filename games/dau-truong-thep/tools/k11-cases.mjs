// Kit lane K11 (tho = Iron Man p73, trau = Optimus Prime p45).
// Test fixtures: the starter kits of Trâu Sắt and Thợ Rèn as they were before the remake, under their own keys.
//   'dummy'  = the old Trâu Sắt (2850 hp, armour 0.13, steady, Pháo Búa 250 + splash + knock-back, shield / ram / quake):
//              the plain target of the generic tests in sim-test, netstate-test, bots-test, k1-cases and k4-cases.
//   'oldtho' = the old Thợ Rèn (Súng Đinh 98, turret / magnet zone / minefield): the plain shooter of the generic
//              arithmetic tests (THO_D) and the only kit that uses the turret and minefield rows.
// Importing this module registers both in MECHS and PERKS. Import it FIRST in a test file: netstate.js reads the shot kinds
// of every MECHS row when it loads, so the fixtures must be there before it.
import { MECHS, PERKS } from '../js/data.js';

export const OLD_TRAU = {
  name: 'Trâu Sắt', role: 'Trụ', roleKey: 'tank', price: 0, tint: 0x8fa3b5,
  blurb: 'Giáp dày, pháo nặng. Đi đầu, húc choáng và che đạn cho đồng đội.',
  hp: 2850, speed: 5.1, radius: 0.96,
  armor: 0.13, accel: 0.7, turn: 7, towerMul: 0.5,
  passive: { do: 'steady', name: 'Lì Đòn', desc: 'Đẩy lùi và làm chậm lên Trâu Sắt chỉ còn một nửa.' },
  weapon: { name: 'Pháo Búa', cd: 0.95, dmg: 250, speed: 27, range: 15, splash: 2.2, knock: 2.5, r: 0.34, vis: 'shell' },
  skills: [
    { id: 'giap', look: 'trGuard', name: 'Giáp Phản Lực', cd: 14, do: 'shield', amount: 700, dur: 4.5, icon: 'shield',
      desc: 'Bật khiên năng lượng hấp thụ 700 sát thương trong 4,5 giây.' },
    { id: 'huc', look: 'trRam', name: 'Húc Thép', cd: 12, do: 'dash', dist: 8.5, speed: 27, dmg: 240, stun: 0.9, knock: 4, icon: 'dash',
      desc: 'Lao thẳng theo hướng ngắm, húc trúng ai thì gây sát thương và làm choáng.' },
    { id: 'diachan', look: 'trQuake', name: 'Địa Chấn', cd: 38, do: 'nova', windup: 0.75, radius: 6.5, dmg: 520, slow: 0.5, slowDur: 3, knock: 3, icon: 'quake',
      desc: 'Dậm nát mặt đất: sau một nhịp lấy đà, mọi kẻ địch quanh bạn chịu sát thương lớn và bị làm chậm.' },
  ],
};
export const OLD_TRAU_PERKS = [
  { name: 'Đà Húc', desc: 'Húc Thép lao xa 10,5 m và choáng 1,2 giây.', slot: 1, patch: { dist: 10.5, stun: 1.2 } },
  { name: 'Giáp Dày', desc: 'Giáp Phản Lực hấp thụ 1200.', slot: 0, patch: { amount: 1200 } },
  { name: 'Dư Chấn', desc: 'Địa Chấn rộng 7,5 m, làm chậm 4 giây.', slot: 2, patch: { radius: 7.5, slowDur: 4 } },
];

export const OLD_THO = {
  name: 'Thợ Rèn', role: 'Công binh', roleKey: 'engineer', price: 1200, tint: 0xc9762b,
  blurb: 'Đặt ụ súng tự bắn, hút địch vào hố từ rồi rải mìn giữ đất.',
  hp: 2300, speed: 5.6, radius: 0.88,
  armor: 0.10, accel: 0.9, turn: 12, towerMul: 1.5,
  passive: { do: 'mechanic', name: 'Tay Nghề', desc: 'Ụ súng và mìn bền thêm 30% máu và thời gian.', mul: 1.3 },
  weapon: { name: 'Súng Đinh', cd: 0.45, dmg: 98, speed: 32, range: 12.5, r: 0.22, vis: 'rivet' },
  skills: [
    { id: 'usung', look: 'thTurret', name: 'Ụ Súng', cd: 15, do: 'turret', cast: 5, hp: 800, dur: 18, range: 11, dmg: 44, rate: 0.3, icon: 'turret',
      desc: 'Đặt một ụ súng tự ngắm bắn kẻ địch trong tầm suốt 18 giây. Địch bắn vỡ được.' },
    { id: 'hotu', look: 'thMagnet', name: 'Hố Từ', cd: 13, do: 'zone', at: 'target', cast: 12, radius: 4.5, dur: 3, pull: 5, dps: 40, vis: 'magnet', icon: 'magnet',
      desc: 'Mở một hố từ trường ở con trỏ, kéo mọi kẻ địch trong vùng về tâm trong 3 giây.' },
    { id: 'baimin', look: 'thMines', name: 'Bãi Mìn', cd: 42, do: 'minefield', n: 5, radius: 4.5, cast: 13, trigger: 2.0, blast: 3, dmg: 300, stun: 1.0, arm: 0.7, life: 30, icon: 'mines',
      desc: 'Rải năm quả mìn quanh con trỏ. Địch chạm vào bị nổ và choáng 1 giây.' },
  ],
};
export const OLD_THO_PERKS = [
  { name: 'Nòng Lớn', desc: 'Ụ Súng bắn 66 mỗi phát.', slot: 0, patch: { dmg: 66 } },
  { name: 'Hố Rộng', desc: 'Hố Từ rộng 5,5 m.', slot: 1, patch: { radius: 5.5 } },
  { name: 'Bảy Quả Mìn', desc: 'Bãi Mìn rải bảy quả.', slot: 2, patch: { n: 7 } },
];

// Registered for the whole test process (no test lists Object.keys(MECHS); the roster tools read MECH_ORDER, which leaves them out).
MECHS.dummy = OLD_TRAU; PERKS.dummy = OLD_TRAU_PERKS;
MECHS.oldtho = OLD_THO; PERKS.oldtho = OLD_THO_PERKS;
