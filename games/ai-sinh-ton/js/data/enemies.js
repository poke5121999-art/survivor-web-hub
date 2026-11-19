// Enemies and bosses of the sim. `model` names the Blockade Z zombie type the page draws; `move` on a boss
// skill names the Blockade Z boss move it plays. Stats are for stage 1; stages.js scales them.
// Skills use the same op vocabulary as heroes (see heroes.js); `delay` on an op is the warning the heroes get.
const st = (k, dur, v) => ({ k, dur, v });
const melee = (range, fx = 'claw') => ({ kind: 'melee', range, deg: 80, cleave: 1, fx });

export const ENEMIES = [
  { id: 'walker', name: 'Xác Sống', cost: 1, hp: 210, atk: 13, aspd: 0.9, speed: 2.5, r: 0.45, attack: melee(1.3) },
  { id: 'runner', name: 'Kẻ Chạy', cost: 1, hp: 120, atk: 10, aspd: 1.2, speed: 4.6, r: 0.42, attack: melee(1.2) },
  { id: 'spider', name: 'Nhện Độc', cost: 0.5, hp: 70, atk: 7, aspd: 1.4, speed: 5.6, r: 0.3, attack: { ...melee(1.1, 'bite'), status: st('slow', 1.5, 0.25) } },
  { id: 'flyer', name: 'Dơi Xác', cost: 1, hp: 95, atk: 11, aspd: 1.1, speed: 6, r: 0.4, fly: true, attack: melee(1.3) },
  { id: 'hound', name: 'Chó Xác', cost: 1, hp: 110, atk: 12, aspd: 1.3, speed: 6, r: 0.42, attack: melee(1.2, 'bite'),
    skills: [{ name: 'Vồ', cd: 6, when: { targetWithin: 6 }, ops: [{ op: 'dash', to: 'target', dmg: 1.5, w: 1, jump: true }], fx: 'leap', lock: 0.3 }] },
  { id: 'spitter', name: 'Kẻ Phun', cost: 1.5, hp: 140, atk: 16, aspd: 0.5, speed: 2.2, r: 0.45, ranged: true,
    attack: { kind: 'proj', range: 9, aoe: 1.3, speed: 11, fx: 'acid', status: st('poison', 3, 0.3) } },
  { id: 'bloater', name: 'Kẻ Phình', cost: 1.5, hp: 300, atk: 22, aspd: 0, speed: 2.1, r: 0.55, attack: melee(1.2),
    skills: [{ name: 'Nổ', cd: 99, first: 0, when: { enemyWithin: 1.9 }, ops: [{ op: 'aoe', at: 'self', r: 2.6, dmg: 2.4, delay: 0.7, status: st('poison', 3, 0.3) }, { op: 'die', delay: 0.72 }], fx: 'bloat', lock: 0.8 }] },
  { id: 'shielder', name: 'Kẻ Khiên', cost: 2, hp: 380, atk: 16, aspd: 0.8, speed: 2.2, r: 0.5, dr: 0.45, attack: melee(1.4) },
  { id: 'brute', name: 'Đồ Tể', cost: 4, hp: 1100, atk: 34, aspd: 0.55, speed: 1.9, r: 0.75, kbRes: 1, attack: { ...melee(1.9, 'smash'), cleave: 2, deg: 100 } },
  { id: 'shrieker', name: 'Kẻ Thét', cost: 2.5, hp: 200, atk: 9, aspd: 0.8, speed: 2.6, r: 0.45, attack: melee(1.3),
    skills: [{ name: 'Thét', cd: 11, first: 3, when: { targetWithin: 12 }, ops: [{ op: 'buff', who: 'all', dur: 5, mods: { aspd: 0.4, speed: 0.3 } }, { op: 'spawn', kind: 'runner', n: 2 }], fx: 'shriek', lock: 0.9 }] },
  { id: 'armored', name: 'Kẻ Giáp', cost: 3, hp: 560, atk: 24, aspd: 0.7, speed: 1.9, r: 0.55, dr: 0.6, attack: melee(1.5) },
  { id: 'burner', name: 'Xác Cháy', cost: 1.5, hp: 260, atk: 14, aspd: 0.9, speed: 2.8, r: 0.47, attack: { ...melee(1.3), status: st('burn', 3, 0.35) },
    onDeath: [{ op: 'zone', at: 'self', r: 2.2, dur: 4, every: 0.5, dmg: 0.5 }], deathFx: 'fire_pool' },
  { id: 'frost', name: 'Xác Băng', cost: 1.5, hp: 300, atk: 13, aspd: 0.9, speed: 2.3, r: 0.48, attack: { ...melee(1.3), status: st('slow', 2, 0.3) },
    onDeath: [{ op: 'aoe', at: 'self', r: 3, dmg: 0.8, status: st('freeze', 1.5) }], deathFx: 'frost_nova' },

  // ---- bosses: `tier` on a skill is the boss tier (1..3) that unlocks it ----
  { id: 'giant', name: 'Khổng Lồ', boss: true, hp: 9000, atk: 60, aspd: 0.5, speed: 2.3, r: 1.3, attack: { ...melee(2.8, 'smash'), cleave: 3, deg: 120 },
    skills: [
      { name: 'Nhảy Nện', move: 'slam', cd: 9, first: 4, when: { targetWithin: 14 }, ops: [{ op: 'dash', to: 'cluster', jump: true }, { op: 'aoe', at: 'self', r: 4.5, dmg: 1.8, delay: 0.9, status: st('stun', 0.8), kb: 2 }], fx: 'boss_slam', lock: 1.2 },
      { name: 'Gầm', tier: 2, cd: 16, first: 8, ops: [{ op: 'buff', who: 'self', dur: 6, mods: { aspd: 0.6, speed: 0.4 } }, { op: 'spawn', kind: 'runner', n: 4 }], fx: 'roar', lock: 0.8 },
      { name: 'Địa Chấn', tier: 3, cd: 14, first: 10, ops: [{ op: 'rain', at: 'self', r: 8, n: 6, over: 1.5, hitR: 2.4, dmg: 1.4, delay: 0.5, seek: true }], fx: 'rockfall', lock: 0.8 },
    ] },
  { id: 'thrower', name: 'Kẻ Ném Đá', boss: true, hp: 7500, atk: 70, aspd: 0.45, speed: 2, r: 1.1, ranged: true, attack: { kind: 'proj', range: 12, aoe: 2.2, speed: 13, fx: 'boulder' },
    skills: [
      { name: 'Mưa Đá', move: 'throw', cd: 8, first: 3, when: { targetWithin: 16 }, ops: [{ op: 'rain', at: 'cluster', r: 5, n: 3, over: 0.8, hitR: 2.6, dmg: 1.6, delay: 0.5, seek: true }], fx: 'rockfall', lock: 0.9 },
      { name: 'Gọi Kẻ Phun', tier: 2, cd: 15, first: 6, ops: [{ op: 'spawn', kind: 'spitter', n: 3 }], fx: 'roar', lock: 0.6 },
      { name: 'Tảng Lăn', tier: 3, cd: 11, first: 9, when: { targetWithin: 16 }, ops: [{ op: 'line', len: 16, w: 2.4, dmg: 2.2, delay: 1, status: st('stun', 0.8) }], fx: 'boulder_roll', lock: 1.1 },
    ] },
  { id: 'phantom', name: 'Bóng Ma', boss: true, hp: 6800, atk: 55, aspd: 0.9, speed: 3.8, r: 0.9, attack: melee(2, 'claw'),
    skills: [
      { name: 'Dịch Chuyển', move: 'blink', cd: 7, first: 3, ops: [{ op: 'dash', to: 'far', jump: true }, { op: 'aoe', at: 'self', r: 3, dmg: 1.4, delay: 0.6 }], fx: 'phase', lock: 0.8 },
      { name: 'Mảnh Hồn', cd: 9, first: 5, when: { targetWithin: 16 }, ops: [{ op: 'bolts', n: 5, every: 0.25, dmg: 0.9, pick: 'random', delay: 0.5 }], fx: 'shards', lock: 0.9 },
      { name: 'Phân Thân', tier: 2, cd: 18, first: 9, ops: [{ op: 'spawn', kind: 'runner', n: 3, near: true }, { op: 'state', who: 'self', key: 'stealth', dur: 2.5 }], fx: 'phase', lock: 0.5 },
      { name: 'Hú Hồn', tier: 3, cd: 13, first: 11, ops: [{ op: 'aoe', at: 'self', r: 7, dmg: 1.2, delay: 1.1, status: st('slow', 3, 0.5) }], fx: 'wail', lock: 1.2 },
    ] },
  { id: 'queen', name: 'Chúa Dơi', boss: true, fly: true, hp: 7200, atk: 50, aspd: 1, speed: 5.5, r: 1, attack: melee(2.2, 'claw'),
    skills: [
      { name: 'Gọi Bầy', move: 'summon', cd: 8, first: 2, ops: [{ op: 'spawn', kind: 'flyer', n: 3, near: true }], fx: 'screech', lock: 0.6 },
      { name: 'Bổ Nhào', cd: 7, first: 5, when: { targetWithin: 16 }, ops: [{ op: 'line', len: 14, w: 2.2, dmg: 1.7, delay: 0.8 }, { op: 'dash', to: 'through', delay: 0.8 }], fx: 'dive', lock: 1 },
      { name: 'Sóng Âm', tier: 2, cd: 12, first: 8, ops: [{ op: 'cone', r: 9, deg: 70, dmg: 1.5, delay: 0.9, status: st('stun', 1) }], fx: 'sonic', lock: 1 },
      { name: 'Hút Máu', tier: 3, cd: 10, first: 10, ops: [{ op: 'bolts', n: 4, every: 0.3, dmg: 0.8, pick: 'weak', drain: 6 }], fx: 'drain', lock: 1.2 },
    ] },
  { id: 'brood', name: 'Nhện Chúa', boss: true, hp: 10500, atk: 58, aspd: 0.7, speed: 3, r: 1.3, attack: { ...melee(2.6, 'bite'), cleave: 2, status: st('poison', 3, 0.3) },
    skills: [
      { name: 'Đẻ Trứng', move: 'eggs', cd: 9, first: 3, ops: [{ op: 'spawn', kind: 'spider', n: 4, near: true }], fx: 'eggs', lock: 0.7 },
      { name: 'Phun Tơ', cd: 8, first: 5, when: { targetWithin: 14 }, ops: [{ op: 'aoe', at: 'cluster', r: 3.2, dmg: 1, delay: 0.8, status: st('root', 1.8) }], fx: 'web_spit', lock: 0.8 },
      { name: 'Vồ Xa', tier: 2, cd: 11, first: 8, ops: [{ op: 'dash', to: 'far', jump: true }, { op: 'aoe', at: 'self', r: 3.6, dmg: 1.8, delay: 0.5, status: st('poison', 4, 0.4) }], fx: 'boss_slam', lock: 1 },
      { name: 'Biển Độc', tier: 3, cd: 14, first: 10, ops: [{ op: 'zone', at: 'cluster', r: 4.5, dur: 6, every: 0.5, dmg: 0.45, delay: 0.8, status: st('slow', 1, 0.3) }], fx: 'acid_sea', lock: 0.8 },
    ] },
  { id: 'vampire', name: 'Bá Tước Máu', boss: true, hp: 11000, atk: 66, aspd: 0.9, speed: 3.6, r: 1.1, lifesteal: 0.15, attack: { ...melee(2.4, 'claw'), cleave: 2 },
    skills: [
      { name: 'Bầy Dơi Máu', move: 'bats', cd: 8, first: 3, when: { targetWithin: 16 }, ops: [{ op: 'bolts', n: 6, every: 0.2, dmg: 0.7, pick: 'random', delay: 0.5 }], fx: 'bats', lock: 1 },
      { name: 'Lao Huyết', move: 'blooddash', cd: 9, first: 6, when: { targetWithin: 14 }, ops: [{ op: 'line', len: 13, w: 2.4, dmg: 1.9, delay: 0.9 }, { op: 'dash', to: 'through', delay: 0.9 }, { op: 'heal', who: 'self', amt: 0.03 }], fx: 'blooddash', lock: 1.1 },
      { name: 'Bão Huyết', move: 'bloodnova', tier: 2, cd: 13, first: 9, ops: [{ op: 'aoe', at: 'self', r: 6.5, dmg: 1.8, delay: 1.2, kb: 2 }], fx: 'bloodnova', lock: 1.3 },
      { name: 'Mưa Máu', move: 'bloodrain', tier: 3, cd: 14, first: 11, ops: [{ op: 'rain', at: 'cluster', r: 8, n: 8, over: 2.5, hitR: 2.4, dmg: 1.3, delay: 0.4, seek: true }], fx: 'bloodrain', lock: 0.9 },
    ] },
  { id: 'alien', name: 'Kẻ Xâm Lăng', boss: true, hp: 11500, atk: 48, aspd: 1.6, speed: 3.2, r: 1.1, ranged: true, attack: { kind: 'shot', range: 11, fx: 'plasma' },
    skills: [
      { name: 'Loạt Plasma', move: 'plasma', cd: 7, first: 3, when: { targetWithin: 16 }, ops: [{ op: 'bolts', n: 8, every: 0.14, dmg: 0.6, pick: 'random', delay: 0.4 }], fx: 'plasma_volley', lock: 1.2 },
      { name: 'Tia Laser', move: 'laser', cd: 10, first: 6, when: { targetWithin: 18 }, ops: [{ op: 'line', len: 18, w: 2, dmg: 2.4, delay: 1.2 }], fx: 'laser', lock: 1.4 },
      { name: 'Gọi Trinh Sát', move: 'summon', tier: 2, cd: 14, first: 8, ops: [{ op: 'spawn', kind: 'runner', n: 4, near: true }], fx: 'beam_in', lock: 0.6 },
      { name: 'Mìn Axit', move: 'mines', tier: 3, cd: 12, first: 10, ops: [{ op: 'rain', at: 'cluster', r: 6, n: 6, over: 1, hitR: 2.3, dmg: 1.4, delay: 1.2, status: st('poison', 3, 0.3) }], fx: 'acid_mines', lock: 0.9 },
    ] },
  { id: 'pharaoh', name: 'Pharaoh Xác Ướp', boss: true, hp: 12500, atk: 62, aspd: 0.7, speed: 2.6, r: 1.2, ranged: true, attack: { kind: 'proj', range: 10, aoe: 1.8, speed: 12, fx: 'scarab' },
    skills: [
      { name: 'Trụ Cát', move: 'pillars', cd: 8, first: 3, when: { targetWithin: 16 }, ops: [{ op: 'line', len: 15, w: 2.6, dmg: 1.8, delay: 1 }], fx: 'pillars', lock: 1.1 },
      { name: 'Gọi Xác Ướp', move: 'mummies', cd: 12, first: 5, ops: [{ op: 'spawn', kind: 'walker', n: 4, near: true }], fx: 'mummies', lock: 0.8 },
      { name: 'Lời Nguyền Vàng', move: 'curse', tier: 2, cd: 12, first: 8, ops: [{ op: 'cone', r: 11, deg: 60, dmg: 2, delay: 1.1, status: st('slow', 3, 0.4) }], fx: 'curse', lock: 1.3 },
      { name: 'Vòng Cầu Cát', move: 'orbring', tier: 3, cd: 13, first: 10, ops: [{ op: 'aoe', at: 'self', r: 7.5, dmg: 1.7, delay: 1.3, kb: 2.5 }], fx: 'orbring', lock: 1.3 },
    ] },
  { id: 'ufo', name: 'Đĩa Bay', boss: true, fly: true, hp: 13000, atk: 44, aspd: 1.4, speed: 3.4, r: 1.5, ranged: true, attack: { kind: 'shot', range: 12, fx: 'plasma' },
    skills: [
      { name: 'Ong Bom', move: 'bomb', cd: 8, first: 3, when: { targetWithin: 18 }, ops: [{ op: 'rain', at: 'cluster', r: 6, n: 5, over: 1, hitR: 2.4, dmg: 1.5, delay: 0.6 }], fx: 'bombrun', lock: 0.8 },
      { name: 'Tia Hút', move: 'tractor', cd: 11, first: 6, ops: [{ op: 'zone', at: 'cluster', r: 3, dur: 3.5, every: 0.5, dmg: 0.5, delay: 0.8, status: st('slow', 1, 0.5) }], fx: 'tractor', lock: 0.7 },
      { name: 'Đội Xâm Lăng', move: 'invade', tier: 2, cd: 15, first: 8, ops: [{ op: 'spawn', kind: 'runner', n: 5, near: true }], fx: 'beam_in', lock: 0.6 },
      { name: 'Sóng Xung Điện', move: 'emp', tier: 3, cd: 13, first: 10, ops: [{ op: 'aoe', at: 'self', r: 9, dmg: 1.5, delay: 1.3, status: st('stun', 1.2) }], fx: 'emp', lock: 1.3 },
    ] },
  { id: 'guardian', name: 'Hộ Vệ Cổ Đại', boss: true, hp: 12500, atk: 66, aspd: 0.5, speed: 2.1, r: 1.5, dr: 0.2, attack: { ...melee(3, 'smash'), cleave: 4, deg: 130 },
    skills: [
      { name: 'Đập Đôi', move: 'slam', cd: 8, first: 3, when: { targetWithin: 8 }, ops: [{ op: 'aoe', at: 'self', r: 5, dmg: 1.6, delay: 0.9, status: st('stun', 0.8) }, { op: 'aoe', at: 'self', r: 7, dmg: 1.2, delay: 1.7, kb: 2 }], fx: 'boss_slam', lock: 1.8 },
      { name: 'Tia Mắt Cổ', move: 'eyebeam', cd: 10, first: 6, when: { targetWithin: 18 }, ops: [{ op: 'line', len: 18, w: 2.2, dmg: 2.2, delay: 1.1 }], fx: 'laser', lock: 1.3 },
      { name: 'Mưa Đá', move: 'rockrain', tier: 2, cd: 12, first: 8, ops: [{ op: 'rain', at: 'cluster', r: 8, n: 8, over: 2, hitR: 2.4, dmg: 1.3, delay: 0.5, seek: true }], fx: 'rockfall', lock: 0.9 },
      { name: 'Xung Kích', move: 'charge', tier: 3, cd: 11, first: 10, when: { targetWithin: 16 }, ops: [{ op: 'line', len: 14, w: 3, dmg: 2.4, delay: 1, status: st('stun', 1) }, { op: 'dash', to: 'through', delay: 1 }], fx: 'charge', lock: 1.2 },
    ] },
  { id: 'dragon', name: 'Rồng Hư Không', boss: true, fly: true, hp: 11500, atk: 58, aspd: 0.7, speed: 4, r: 1.6, ranged: true, attack: { kind: 'proj', range: 12, aoe: 2, speed: 14, fx: 'void_ball' },
    skills: [
      { name: 'Hơi Thở Hư Không', move: 'breath', cd: 9, first: 3, when: { targetWithin: 14 }, ops: [{ op: 'cone', r: 12, deg: 50, dmg: 2.2, delay: 1.1, status: st('burn', 3, 0.3) }], fx: 'void_breath', lock: 1.4 },
      { name: 'Bổ Nhào', move: 'dive', cd: 10, first: 6, when: { targetWithin: 18 }, ops: [{ op: 'line', len: 16, w: 3, dmg: 2, delay: 1 }, { op: 'dash', to: 'through', delay: 1 }], fx: 'dive', lock: 1.2 },
      { name: 'Sao Băng', move: 'meteor', tier: 2, cd: 12, first: 8, ops: [{ op: 'rain', at: 'cluster', r: 9, n: 9, over: 2.5, hitR: 2.6, dmg: 1.5, delay: 0.5, seek: true }], fx: 'meteor', lock: 0.9 },
      { name: 'Quật Đuôi', move: 'tailspin', tier: 3, cd: 9, first: 10, when: { enemyWithin: 5 }, ops: [{ op: 'aoe', at: 'self', r: 5.5, dmg: 1.8, delay: 0.6, kb: 3 }], fx: 'tailspin', lock: 0.9 },
    ] },
];

export const ENEMY = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
