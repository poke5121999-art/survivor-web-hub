// Every tunable of the game lives here as a table. Units: metres, seconds, hit points.
// The simulation (sim.js) reads these rows; nothing in this file touches three.js.

export const TICK = 1 / 30;

export const TEAMS = [
  { id: 0, name: 'Lam', color: 0x35b8ff, css: '#35b8ff' },
  { id: 1, name: 'Hỏa', color: 0xff5a36, css: '#ff5a36' },
];

// Mechs per side. A match is 1v1, 2v2 or 3v3; bots fill each side to the chosen size.
export const TEAM_SIZES = [1, 2, 3];
export const TEAM_SIZE = 3;
export const cleanSize = (n) => (TEAM_SIZES.includes(n) ? n : TEAM_SIZE);

export const RULES = {
  target: 25, duration: 300, respawn: 5, spawnGuard: 2.5,
  baseRadius: 6.5, baseRegen: 0.12, baseBurn: 420,
  regenDelay: 7, regen: 0.025,
  moveRadius: 0.72, assistWindow: 7, revealOnFire: 1.2, bushSight: 3.4,
  healItem: { cd: 24, frac: 0.32, dur: 2.2 },
  // A healer's own zone and drone heal its owner at this fraction: strong on allies, weak on self (Addendum 13). armorCap: total damage reduction never passes it.
  selfHealMul: 0.3, armorCap: 0.6,
  // Wounded: a single hit of at least `frac` of the victim's max hp halves the healing it receives for `dur` seconds, so a burst hit is not healed through.
  wound: { frac: 0.12, dur: 3, mul: 0.5 },
  lava: { dps: 380 }, ice: { grip: 2.2 }, mud: { slow: 0.4 }, vent: { period: 6, warn: 1.3, dmg: 520 },
  crate: { first: 12, every: [15, 22], fall: 3.2, max: 3, life: 40, radius: 1.5 },
  // Airdrops per team size: the 5v5 row above is `crate`; fewer mechs a side get fewer, slower drops so a crate stays worth a detour.
  crateBySize: { 1: { every: [30, 42], max: 1 }, 2: { every: [24, 34], max: 2 }, 3: { every: [20, 28], max: 2 } },
};

// Airdrop pickups. `w` is the draw weight.
export const PICKUPS = {
  heal:    { name: 'Hồi máu',      w: 3, color: 0x54e36b, heal: 0.45 },
  power:   { name: 'Tăng sát thương', w: 2, color: 0xff7a3d, dmgUp: 1.35, dur: 12 },
  haste:   { name: 'Tăng tốc',     w: 2, color: 0x5fe0ff, haste: 1.3, dur: 12 },
  refresh: { name: 'Hồi chiêu',    w: 2, color: 0xc48bff, refresh: true },
  shield:  { name: 'Khiên năng lượng', w: 2, color: 0xffd94a, shield: 800, dur: 15 },
};

// Skill effects are rows interpreted by the registry in sim.js (CAST). `do` picks the primitive.
// Slots: weapon (left mouse), skills[0] = Q, skills[1] = E, skills[2] = SPACE (ultimate).
export const MECHS = {
  trau: {
    name: 'Trâu Sắt', role: 'Trụ', roleKey: 'tank', price: 0, tint: 0x8fa3b5,
    blurb: 'Giáp dày, pháo nặng. Đi đầu, húc choáng và che đạn cho đồng đội.',
    hp: 2850, speed: 5.1, radius: 0.96,
    armor: 0.13, accel: 0.7, turn: 7, towerMul: 0.5,
    passive: { do: 'steady', name: 'Lì Đòn', desc: 'Đẩy lùi và làm chậm lên Trâu Sắt chỉ còn một nửa.' },
    weapon: { name: 'Pháo Búa', cd: 0.95, dmg: 250, speed: 27, range: 15, splash: 2.2, knock: 2.5, r: 0.34, vis: 'shell' },
    skills: [
      { id: 'giap', name: 'Giáp Phản Lực', cd: 14, do: 'shield', amount: 700, dur: 4.5, icon: 'shield',
        desc: 'Bật khiên năng lượng hấp thụ 700 sát thương trong 4,5 giây.' },
      { id: 'huc', name: 'Húc Thép', cd: 12, do: 'dash', dist: 8.5, speed: 27, dmg: 240, stun: 0.9, knock: 4, icon: 'dash',
        desc: 'Lao thẳng theo hướng ngắm, húc trúng ai thì gây sát thương và làm choáng.' },
      { id: 'diachan', name: 'Địa Chấn', cd: 38, do: 'nova', windup: 0.75, radius: 6.5, dmg: 520, slow: 0.5, slowDur: 3, knock: 3, icon: 'quake',
        desc: 'Dậm nát mặt đất: sau một nhịp lấy đà, mọi kẻ địch quanh bạn chịu sát thương lớn và bị làm chậm.' },
    ],
  },
  soi: {
    name: 'Sói Lửa', role: 'Xung kích', roleKey: 'assault', price: 0, tint: 0xd9843a,
    blurb: 'Hai nòng liên thanh, cơ động. Áp sát, xả đạn rồi rút.',
    hp: 2450, speed: 6.5, radius: 0.8,
    armor: 0.05, accel: 1.2, turn: 14, towerMul: 1.0,
    passive: { do: 'frenzy', name: 'Máu Nóng', desc: 'Hạ gục hoặc trợ công thì chạy nhanh hơn 25% trong 3 giây.', haste: 1.25, dur: 3 },
    weapon: { name: 'Liên Thanh Đôi', cd: 0.16, dmg: 63, speed: 34, range: 13.5, spread: 0.05, r: 0.2, vis: 'bullet', alt: 0.42 },
    skills: [
      { id: 'rocket', name: 'Rocket Chùm', cd: 8, do: 'volley', n: 3, fan: 0.22, dmg: 190, speed: 24, range: 15, splash: 2.4, r: 0.3, vis: 'rocket', icon: 'rocket',
        desc: 'Phóng ba quả rocket toả hình quạt, nổ lan khi chạm.' },
      { id: 'tangap', name: 'Tăng Áp', cd: 14, do: 'buff', haste: 1.45, rapid: 1.35, dur: 4, icon: 'boost',
        desc: 'Trong 4 giây chạy nhanh hơn 45% và bắn nhanh hơn 35%.' },
      { id: 'muahoa', name: 'Mưa Hỏa Tiễn', cd: 42, do: 'barrage', n: 9, radius: 5.5, blast: 2.6, dmg: 230, delay: 0.9, span: 1.8, cast: 16, icon: 'barrage',
        desc: 'Gọi chín quả hỏa tiễn dội xuống vùng con trỏ. Vòng đỏ báo trước chỗ rơi.' },
    ],
  },
  ung: {
    name: 'Ưng Nhãn', role: 'Bắn tỉa', roleKey: 'sniper', price: 0, tint: 0x7c6bd6,
    blurb: 'Súng ray tầm xa, máu mỏng. Giữ khoảng cách, bẫy kẻ lao vào.',
    hp: 1700, speed: 6.0, radius: 0.76,
    armor: 0, accel: 1.0, turn: 9, towerMul: 0.7,
    passive: { do: 'pierce', name: 'Xuyên Giáp', desc: 'Sát thương bỏ qua giáp. Đạn ray bay quá 14 m mạnh thêm 20%.' },
    weapon: { name: 'Súng Ray', cd: 1.5, dmg: 390, speed: 62, range: 23, r: 0.2, far: { after: 14, mul: 1.2 }, vis: 'rail' },
    skills: [
      { id: 'min', name: 'Mìn Xung Điện', cd: 11, do: 'mine', trigger: 2.1, blast: 3, dmg: 260, stun: 1.2, arm: 0.8, life: 35, cast: 9, icon: 'mine',
        desc: 'Ném một quả mìn tới con trỏ. Địch chạm vào bị giật choáng.' },
      { id: 'luot', name: 'Lướt Bóng', cd: 11, do: 'blink', dist: 7, speed: 30, stealth: 2.2, icon: 'blink',
        desc: 'Lướt nhanh theo hướng đang đi (hoặc lùi lại) rồi tàng hình 2,2 giây.' },
      { id: 'tia', name: 'Tia Xuyên Phá', cd: 60, do: 'beam', windup: 0.9, range: 30, width: 1.1, dmg: 1850, icon: 'beam',
        desc: 'Nạp năng lượng rồi bắn một tia xuyên qua mọi kẻ địch trên đường thẳng. Tường vẫn chặn được.' },
    ],
  },
  hac: {
    name: 'Bạch Hạc', role: 'Hỗ trợ', roleKey: 'support', price: 0, tint: 0x59c9a5,
    blurb: 'Hồi máu, làm chậm và dựng vòm chắn đạn cho cả đội.',
    hp: 1750, speed: 7.0, radius: 0.8,
    armor: 0.05, accel: 1.1, turn: 14, towerMul: 0.8,
    passive: { do: 'aura', name: 'Hào Quang', desc: 'Đồng đội trong 6 m hồi 60 máu mỗi giây.', radius: 6, hps: 60 },
    weapon: { name: 'Xung Quang', cd: 0.32, dmg: 115, speed: 30, range: 14, r: 0.26, vis: 'pulse' },
    skills: [
      { id: 'hoiphuc', name: 'Suối Hồi Phục', cd: 13, do: 'zone', at: 'self', radius: 5, dur: 4.5, hps: 230, vis: 'heal', icon: 'heal',
        desc: 'Tạo vùng hồi 230 máu mỗi giây cho đồng đội đứng trong, kéo dài 4,5 giây.' },
      { id: 'truongcham', name: 'Trường Trì Trệ', cd: 12, do: 'zone', at: 'target', cast: 13, radius: 4.5, dur: 4, dps: 45, slow: 0.45, vis: 'slow', icon: 'slow',
        desc: 'Ném một trường năng lượng tới con trỏ: địch bên trong bị chậm 45% và mất máu dần.' },
      { id: 'vom', name: 'Vòm Bảo Hộ', cd: 48, do: 'dome', radius: 6, dur: 5.5, shield: 600, heal: 450, icon: 'dome',
        desc: 'Dựng vòm chặn mọi đạn địch bay vào trong 5,5 giây, đồng đội trong vòm được hồi máu và nhận khiên.' },
    ],
  },
  loi: {
    name: 'Lôi Công', role: 'Pháo kích', roleKey: 'artillery', price: 900, tint: 0x9aa03a,
    blurb: 'Cối bắn vòng qua tường. Đứng sau đồng đội, dội đạn vào chỗ địch tụ lại.',
    hp: 2300, speed: 5.8, radius: 0.84,
    armor: 0.05, accel: 0.8, turn: 8, towerMul: 1.6,
    passive: { do: 'trait', name: 'Chấn Động', desc: 'Đạn cối làm chậm 30% trong 1,2 giây.' },
    weapon: { name: 'Cối Sấm', cd: 1.45, dmg: 340, lob: true, flight: 0.85, range: 17, splash: 2.7, slow: 0.3, slowDur: 1.2, vis: 'mortar' },
    skills: [
      { id: 'khoi', name: 'Màn Khói', cd: 14, do: 'zone', at: 'target', cast: 12, radius: 4.6, dur: 5.5, hide: true, vis: 'smoke', icon: 'smoke',
        desc: 'Ném bom khói tới con trỏ. Ai đứng trong khói đều ẩn mình như nấp bụi.' },
      { id: 'giatlui', name: 'Giật Lùi', cd: 10, do: 'recoil', dist: 7, speed: 26, radius: 3.5, dmg: 160, knock: 4, icon: 'recoil',
        desc: 'Nổ một phát dưới chân hất văng địch ở gần, còn bạn bật lùi ra xa.' },
      { id: 'thienloi', name: 'Thiên Lôi', cd: 45, do: 'barrage', line: true, n: 5, gap: 3.2, radius: 7, blast: 3.2, dmg: 560, delay: 0.8, span: 1.2, cast: 20, icon: 'storm',
        desc: 'Năm quả đạn lớn rơi thành một hàng dọc theo hướng ngắm, tâm ở con trỏ.' },
    ],
  },
  bocap: {
    name: 'Bọ Cạp', role: 'Thọc sườn', roleKey: 'flanker', price: 900, tint: 0x6a5acd,
    blurb: 'Nhanh nhất đấu trường, súng chùm tầm ngắn. Vòng ra sau, kết liễu kẻ yếu máu rồi biến mất.',
    hp: 2350, speed: 7.3, radius: 0.76,
    armor: 0, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'ambush', name: 'Phục Kích', desc: 'Đòn đầu tiên sau khi ẩn mình (bụi, khói, tàng hình) mạnh thêm 50%.', mul: 1.5, linger: 1 },
    weapon: { name: 'Súng Chùm', cd: 0.72, dmg: 64, n: 5, fan: 0.09, speed: 30, range: 9, r: 0.18, vis: 'pellet' },
    skills: [
      { id: 'vomoi', name: 'Vồ Mồi', cd: 8, do: 'dash', dist: 9, speed: 32, dmg: 170, stun: 0.4, knock: 1, icon: 'dash',
        desc: 'Lao nhanh theo hướng ngắm, gây sát thương và làm khựng kẻ bị vồ trúng.' },
      { id: 'nguytrang', name: 'Ngụy Trang', cd: 14, do: 'buff', stealth: 4, haste: 1.3, dur: 4, icon: 'cloak',
        desc: 'Tàng hình 4 giây và chạy nhanh hơn 30%. Bắn hoặc dùng chiêu sẽ lộ diện.' },
      { id: 'locthep', name: 'Lốc Thép', cd: 40, do: 'nova', windup: 0.25, repeat: 4, gap: 0.3, move: 1, radius: 3.6, dmg: 230, icon: 'spin',
        desc: 'Xoay tròn chém bốn nhát liên tiếp vào mọi kẻ địch quanh mình, vẫn di chuyển được.' },
    ],
  },
  bang: {
    name: 'Băng Nha', role: 'Khống chế', roleKey: 'control', price: 1200, tint: 0x9fd8ff,
    blurb: 'Mỗi phát bắn làm chậm. Dựng tường băng chia cắt đội hình, gọi bão tuyết giữ chân cả nhóm.',
    hp: 2750, speed: 5.8, radius: 0.84,
    armor: 0.15, accel: 0.9, turn: 11, towerMul: 2.2,
    passive: { do: 'brittle', name: 'Tê Cóng', desc: 'Gây thêm 20% sát thương lên kẻ đang bị làm chậm.', mul: 1.2 },
    weapon: { name: 'Gai Băng', cd: 0.36, dmg: 78, speed: 28, range: 13, r: 0.24, slow: 0.2, slowDur: 1.2, vis: 'frost' },
    skills: [
      { id: 'tuongbang', name: 'Tường Băng', cd: 14, do: 'wall', cast: 4, n: 5, r: 0.75, gap: 1.35, dur: 4.5, icon: 'wall',
        desc: 'Dựng bức tường băng chắn ngang trước mặt trong 4,5 giây. Tường chặn cả đường đi lẫn đạn của hai phe.' },
      { id: 'xungbang', name: 'Xung Băng', cd: 10, do: 'nova', windup: 0.3, radius: 5, dmg: 140, slow: 0.6, slowDur: 2.5, icon: 'frost',
        desc: 'Tỏa một vòng băng quanh mình: địch dính phải bị chậm 60% trong 2,5 giây.' },
      { id: 'baotuyet', name: 'Bão Tuyết', cd: 46, do: 'zone', at: 'target', cast: 14, radius: 6.5, dur: 5, dps: 150, slow: 0.5, vis: 'blizzard', icon: 'blizzard',
        desc: 'Gọi bão tuyết xuống vùng con trỏ trong 5 giây: địch bên trong mất máu liên tục và bị chậm một nửa.' },
    ],
  },
  tho: {
    name: 'Thợ Rèn', role: 'Công binh', roleKey: 'engineer', price: 1200, tint: 0xc9762b,
    blurb: 'Đặt ụ súng tự bắn, hút địch vào hố từ rồi rải mìn giữ đất.',
    hp: 2300, speed: 5.6, radius: 0.88,
    armor: 0.10, accel: 0.9, turn: 12, towerMul: 1.5,
    passive: { do: 'mechanic', name: 'Tay Nghề', desc: 'Ụ súng và mìn bền thêm 30% máu và thời gian.', mul: 1.3 },
    weapon: { name: 'Súng Đinh', cd: 0.45, dmg: 98, speed: 32, range: 12.5, r: 0.22, vis: 'rivet' },
    skills: [
      { id: 'usung', name: 'Ụ Súng', cd: 15, do: 'turret', cast: 5, hp: 800, dur: 18, range: 11, dmg: 44, rate: 0.3, icon: 'turret',
        desc: 'Đặt một ụ súng tự ngắm bắn kẻ địch trong tầm suốt 18 giây. Địch bắn vỡ được.' },
      { id: 'hotu', name: 'Hố Từ', cd: 13, do: 'zone', at: 'target', cast: 12, radius: 4.5, dur: 3, pull: 5, dps: 40, vis: 'magnet', icon: 'magnet',
        desc: 'Mở một hố từ trường ở con trỏ, kéo mọi kẻ địch trong vùng về tâm trong 3 giây.' },
      { id: 'baimin', name: 'Bãi Mìn', cd: 42, do: 'minefield', n: 5, radius: 4.5, cast: 13, trigger: 2.0, blast: 3, dmg: 300, stun: 1.0, arm: 0.7, life: 30, icon: 'mines',
        desc: 'Rải năm quả mìn quanh con trỏ. Địch chạm vào bị nổ và choáng 1 giây.' },
    ],
  },
  thancong: {
    name: 'Thần Công', role: 'Công thành', roleKey: 'siege', price: 1500, tint: 0x7d8a5a,
    blurb: 'Lựu pháo phá trụ. Cắm chốt để bắn rất xa, nhưng tháp xoay chậm: bị áp sát là nguy.',
    hp: 2400, speed: 4.6, radius: 0.92,
    armor: 0.15, accel: 0.7, turn: 3.5, towerMul: 1.0,
    passive: { do: 'trait', name: 'Phá Thành', desc: 'Gây gấp đôi sát thương lên trụ.' },
    weapon: { name: 'Đại Bác', cd: 1.4, dmg: 300, speed: 30, range: 15, splash: 1.8, knock: 1.5, r: 0.34, vis: 'howitzer' },
    skills: [
      { id: 'camchot', name: 'Cắm Chốt', cd: 3, do: 'stance', setup: 0.7, range: 1.6, dmg: 1.35, armor: 0.2, turn: 1.6, icon: 'anchor',
        desc: 'Hạ chân chống: đứng yên, tầm bắn xa gấp 1,6, sát thương +35%, giáp +20%, nhưng tháp xoay rất chậm. Bấm lại để nhổ chốt.' },
      { id: 'danxuyen', name: 'Đạn Xuyên', cd: 12, do: 'volley', n: 1, fan: 0, dmg: 830, speed: 52, range: 26, r: 0.3, pierce: true, vis: 'sabot', icon: 'pierce',
        desc: 'Bắn một viên đạn lõi cứng xuyên qua mọi cỗ máy địch trên đường bay.' },
      { id: 'oanhtac', name: 'Oanh Tạc', cd: 44, do: 'barrage', n: 8, radius: 6.5, blast: 3, dmg: 400, delay: 1.2, span: 2, cast: 24, icon: 'barrage',
        desc: 'Dội tám quả đạn xuống một vùng xa tới 24 m. Vòng đỏ báo trước chỗ rơi.' },
    ],
  },
  mangxa: {
    name: 'Mãng Xà', role: 'Bắt giữ', roleKey: 'hooker', price: 1500, tint: 0x4f8f6a,
    blurb: 'Móc kéo địch về, đổi chỗ với bất kỳ ai, nhốt cả nhóm trong lồng xích.',
    hp: 3200, speed: 5.7, radius: 0.88,
    armor: 0.15, accel: 0.9, turn: 10, towerMul: 1.9,
    passive: { do: 'trophy', name: 'Chiến Tích', desc: 'Hạ gục hoặc trợ công thì hồi 10% máu.', heal: 0.1 },
    weapon: { name: 'Nanh Thép', cd: 0.7, dmg: 178, speed: 30, range: 10.5, r: 0.28, vis: 'slug' },
    skills: [
      { id: 'mocxich', name: 'Móc Xích', cd: 11, do: 'hook', speed: 30, range: 13, r: 0.4, dmg: 120, stun: 0.4, vis: 'hook', icon: 'hook',
        desc: 'Phóng móc theo hướng ngắm. Trúng kẻ địch nào thì kéo nó về trước mặt bạn và làm choáng.' },
      { id: 'hoanvi', name: 'Hoán Vị', cd: 13, do: 'swap', cast: 12, pick: 3, slow: 0.4, slowDur: 1.5, icon: 'swap',
        desc: 'Đổi chỗ với cỗ máy ở con trỏ, bạn hay địch đều được. Địch bị đổi chỗ sẽ chậm 40%.' },
      { id: 'longxich', name: 'Lồng Xích', cd: 40, do: 'zone', at: 'self', radius: 5.5, dur: 3.5, dps: 110, cage: true, vis: 'cage', icon: 'cage',
        desc: 'Dựng vòng xích quanh mình 3,5 giây: kẻ địch đang ở trong không thoát ra được và mất máu dần.' },
    ],
  },
  kimquy: {
    name: 'Kim Quy', role: 'Hộ vệ', roleKey: 'guardian', price: 1500, tint: 0xc9a23a,
    blurb: 'Tặng khiên cho một đồng đội, co mai phản đòn, đẩy địch khỏi vùng mình giữ.',
    hp: 2700, speed: 5.0, radius: 0.92,
    armor: 0.2, accel: 0.8, turn: 9, towerMul: 1.0,
    passive: { do: 'ward', name: 'Che Chở', desc: 'Đồng đội trong 5 m nhận ít hơn 15% sát thương.', radius: 5, armor: 0.15 },
    weapon: { name: 'Súng Sóng', cd: 0.6, dmg: 63, n: 3, fan: 0.12, speed: 26, range: 9, knock: 0.8, r: 0.26, vis: 'wave' },
    skills: [
      { id: 'khientang', name: 'Khiên Tặng', cd: 9, do: 'bless', cast: 12, pick: 3.5, shield: 700, dur: 4, icon: 'shield',
        desc: 'Phủ khiên 700 trong 4 giây cho đồng đội ở con trỏ. Không có ai ở đó thì khiên về mình.' },
      { id: 'mairua', name: 'Mai Rùa', cd: 13, do: 'buff', armor: 0.5, reflect: 0.3, dur: 3, icon: 'shell',
        desc: 'Co mai 3 giây: giáp +50% và phản 30% sát thương nhận vào về kẻ bắn.' },
      { id: 'thanhdong', name: 'Thành Đồng', cd: 42, do: 'zone', at: 'self', follow: true, radius: 5.5, dur: 5, pull: -9, armor: 0.3, vis: 'bastion', icon: 'dome',
        desc: 'Mở trường lực đi theo mình 5 giây: địch bị đẩy ra ngoài, đồng đội bên trong được +30% giáp.' },
    ],
  },
  hacho: {
    name: 'Hắc Hổ', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0x3b3f4a,
    blurb: 'Phun lửa sát mặt và hút máu từ sát thương. Vồ qua tường, đánh dấu con mồi rồi kết liễu.',
    hp: 3100, speed: 6.0, radius: 0.88,
    armor: 0.1, accel: 1.1, turn: 12, towerMul: 2.0,
    passive: { do: 'lifesteal', name: 'Hút Máu', desc: 'Hồi máu bằng 18% sát thương gây ra.', frac: 0.18 },
    weapon: { name: 'Phun Lửa', cd: 0.12, dmg: 46, speed: 22, range: 7, spread: 0.14, r: 0.34, pierce: true, vis: 'flame' },
    skills: [
      { id: 'vo', name: 'Vồ', cd: 9, do: 'leap', cast: 8.5, flight: 0.4, radius: 3.2, dmg: 200, slow: 0.4, slowDur: 1.5, icon: 'leap',
        desc: 'Nhảy tới con trỏ, qua được tường và vật cản. Đáp xuống gây sát thương và làm chậm kẻ địch quanh đó.' },
      { id: 'cuongno', name: 'Cuồng Nộ', cd: 14, do: 'buff', rapid: 1.5, lifesteal: 0.45, dur: 4, cost: 0.08, icon: 'rage',
        desc: 'Trả 8% máu để trong 4 giây bắn nhanh hơn 50% và hút máu 45%.' },
      { id: 'dautu', name: 'Dấu Tử', cd: 36, do: 'mark', cast: 13, pick: 3.5, dur: 5, amp: 0.25, execute: 0.22, haste: 1.3, icon: 'mark',
        desc: 'Đánh dấu kẻ địch ở con trỏ 5 giây: nó nhận thêm 25% sát thương từ mọi người, và bị kết liễu ngay khi máu xuống dưới 22%.' },
    ],
  },
  holy: {
    name: 'Hồ Ly', role: 'Ảo thuật', roleKey: 'trickster', price: 1600, tint: 0xe07a9a, hover: true,
    blurb: 'Thả bản sao đánh lừa địch, dịch chuyển xuyên tường. Máu mỏng, sống bằng mưu.',
    hp: 2600, speed: 7.0, radius: 0.76,
    armor: 0, accel: 1.4, turn: 16, towerMul: 1.4,
    passive: { do: 'trait', name: 'Đệm Khí', desc: 'Bùn không làm chậm và băng không làm trượt.' },
    weapon: { name: 'Phi Tiêu', cd: 0.22, dmg: 84, speed: 36, range: 14, r: 0.18, vis: 'dart' },
    skills: [
      { id: 'phanthan', name: 'Phân Thân', cd: 12, do: 'decoy', n: 1, fan: 0, hp: 500, dur: 6, blast: 3, dmg: 160, stealth: 1.5, icon: 'decoy',
        desc: 'Thả một bản sao chạy theo hướng ngắm 6 giây còn bạn tàng hình 1,5 giây. Bản sao vỡ thì nổ.' },
      { id: 'xuyentuong', name: 'Xuyên Tường', cd: 10, do: 'warp', dist: 7, icon: 'warp',
        desc: 'Dịch chuyển tức thì tới con trỏ, xa nhất 7 m, qua được tường.' },
      { id: 'vudieu', name: 'Vũ Điệu Ảo Ảnh', cd: 40, do: 'decoy', n: 3, fan: 0.6, hp: 500, dur: 6, blast: 3, dmg: 160, stealth: 3, haste: 1.35, icon: 'mirage',
        desc: 'Ba bản sao tỏa ra hình quạt, bạn tàng hình 3 giây và chạy nhanh hơn 35%.' },
    ],
  },
  domdom: {
    name: 'Đom Đóm', role: 'Quân y', roleKey: 'medic', price: 1600, tint: 0xd8e05a, hover: true,
    blurb: 'Ngắm tia vào đồng đội để hồi máu, vào địch để gây sát thương. Drone hồi máu bay theo.',
    hp: 1700, speed: 7.4, radius: 0.76,
    armor: 0, accel: 1.2, turn: 14, towerMul: 2.2,
    passive: { do: 'overheal', name: 'Tràn Máu', desc: 'Hồi máu cho đồng đội đã đầy máu thì thành khiên, tối đa 300.', cap: 300, dur: 3 },
    weapon: { name: 'Tia Nối', cd: 0.25, ray: true, range: 11, width: 0.7, dmg: 80, heal: 90, vis: 'link' },
    skills: [
      { id: 'ongtho', name: 'Ong Thợ', cd: 16, do: 'drone', dur: 12, range: 7, hps: 120, icon: 'drone',
        desc: 'Thả drone bay theo bạn 12 giây, hồi 120 máu mỗi giây cho đồng đội yếu nhất trong 7 m.' },
      { id: 'tiepsuc', name: 'Tiếp Sức', cd: 11, do: 'bless', cast: 12, pick: 3.5, haste: 1.3, rapid: 1.25, dur: 4, icon: 'boost',
        desc: 'Đồng đội ở con trỏ chạy nhanh hơn 30% và bắn nhanh hơn 25% trong 4 giây.' },
      { id: 'vongsang', name: 'Vòng Sáng', cd: 44, do: 'rally', radius: 8, heal: 1100, haste: 1.25, dur: 3, icon: 'rally',
        desc: 'Mọi đồng đội trong 8 m hồi 1100 máu, hết bị chậm, choáng và dấu tử, rồi chạy nhanh hơn 3 giây.' },
    ],
  },
  tacke: {
    name: 'Tắc Kè', role: 'Xạ thủ nảy', roleKey: 'trickshot', price: 1750, tint: 0x3fb5a0,
    blurb: 'Đĩa thép nảy tường: bắn vòng qua góc. Căng dây điện chặn lối.',
    hp: 2250, speed: 6.6, radius: 0.8,
    armor: 0.05, accel: 1.2, turn: 13, towerMul: 0.9,
    passive: { do: 'rebound', name: 'Dội Tường', desc: 'Mỗi lần nảy tường đĩa mạnh thêm 30%.', mul: 0.3 },
    weapon: { name: 'Đĩa Nảy', cd: 0.5, dmg: 158, speed: 30, range: 21, r: 0.24, bounce: 2, vis: 'disc' },
    skills: [
      { id: 'daydien', name: 'Dây Điện', cd: 12, do: 'wire', cast: 10, width: 6, dur: 14, dmg: 200, slow: 0.5, slowDur: 2, charges: 3, arm: 0.5, icon: 'wire',
        desc: 'Căng một dây điện dài 6 m ở con trỏ trong 14 giây. Địch băng qua mất 200 máu và chậm 50%. Dùng được 3 lần.' },
      { id: 'chumnay', name: 'Chùm Nảy', cd: 9, do: 'volley', n: 5, fan: 0.14, dmg: 85, speed: 30, range: 18, r: 0.2, bounce: 3, vis: 'disc', icon: 'ricochet',
        desc: 'Bắn năm đĩa nhỏ tỏa hình quạt, mỗi đĩa nảy tường ba lần.' },
      { id: 'baodia', name: 'Bão Đĩa', cd: 42, do: 'volley', n: 14, fan: 0.4488, dmg: 170, speed: 28, range: 22, r: 0.24, bounce: 3, vis: 'disc', icon: 'spin',
        desc: 'Mười bốn đĩa bắn ra mọi hướng quanh bạn, mỗi đĩa nảy tường ba lần.' },
    ],
  },
  hoalong: {
    name: 'Hỏa Long', role: 'Pháo tia', roleKey: 'lancer', price: 1750, tint: 0xe0502a,
    blurb: 'Giữ nút bắn để nạp, thả ra phóng tia xuyên giáp. Diệt xe giáp dày, đuối khi đánh trụ.',
    hp: 1750, speed: 5.6, radius: 0.84,
    armor: 0.08, accel: 0.9, turn: 8, towerMul: 0.6,
    passive: { do: 'pierce', name: 'Xuyên Giáp', desc: 'Sát thương bỏ qua giáp.' },
    weapon: { name: 'Tia Tụ', cd: 1.1, charge: { min: 0.25, max: 1.3, hold: 0.6, dmg: [100, 740], range: [13, 22], width: [0.5, 0.9], move: 0.7 }, range: 22, vis: 'lance' },
    skills: [
      { id: 'quatai', name: 'Quá Tải', cd: 9, do: 'buff', prime: 4, icon: 'charge',
        desc: 'Trong 4 giây tới, phát Tia Tụ kế tiếp nạp đầy ngay lập tức.' },
      { id: 'mansang', name: 'Màn Sáng', cd: 14, do: 'wall', screen: true, cast: 3.5, n: 5, r: 0.75, gap: 1.35, dur: 5, icon: 'screen',
        desc: 'Dựng màn chắn trước mặt 5 giây. Màn chỉ chặn đạn địch: cỗ máy và đạn phe mình đi qua được.' },
      { id: 'thienhoa', name: 'Thiên Hỏa Tuyến', cd: 46, do: 'sweep', windup: 0.5, dur: 2.6, range: 20, width: 1.2, dps: 520, turn: 1.4, move: 0.3, icon: 'beam',
        desc: 'Phóng một tia liên tục 2,6 giây gây 520 sát thương mỗi giây lên mọi kẻ địch trên đường. Tháp xoay rất chậm khi đang bắn.' },
    ],
  },
};

export const MECH_ORDER = ['trau', 'soi', 'ung', 'hac', 'loi', 'bocap', 'bang', 'tho', 'thancong', 'mangxa', 'kimquy', 'hacho', 'holy', 'domdom', 'tacke', 'hoalong'];

// Bot tuning. aimErr: radians of aim noise; react: seconds before a new target is engaged;
// skill: chance per second to use a ready skill when it makes sense; lead: how well shots lead a moving target (0..1).
export const DIFFICULTY = {
  easy:   { name: 'Dễ',   aimErr: 0.30, react: 0.75, skill: 0.25, lead: 0.2, focus: 0.3, retreat: 0.18, dodge: 0.0, fireDuty: 0.55 },
  normal: { name: 'Vừa',  aimErr: 0.14, react: 0.40, skill: 0.6,  lead: 0.6, focus: 0.6, retreat: 0.28, dodge: 0.35, fireDuty: 0.8 },
  hard:   { name: 'Khó',  aimErr: 0.05, react: 0.18, skill: 1.0,  lead: 0.95, focus: 1.0, retreat: 0.35, dodge: 0.8, fireDuty: 1 },
};

export const BOT_NAMES = ['Tí Sắt', 'Mèo Mun', 'Cò Lả', 'Bão Số 9', 'Ông Kẹ', 'Chuồn Kim', 'Gió Chướng', 'Nắp Chai', 'Bánh Tét', 'Sấm Rền',
  'Lúa Non', 'Đá Cuội', 'Chớp Bể', 'Mưa Nguồn', 'Cua Đồng', 'Tre Già', 'Bụi Đời', 'Sao Hôm', 'Kiến Lửa', 'Vịt Bầu'];

export const REWARDS = { win: 145, lose: 72, draw: 96, perKill: 10, perAssist: 5, mvp: 48, xpWin: 100, xpLose: 60, xpPerKill: 5 };
export const levelXp = (level) => 200 + (level - 1) * 120;

// Destructible props. Barrels explode when destroyed and hurt the destroyer's enemies.
export const PROPS = {
  crate:  { hp: 320, r: 0.8 },
  barrel: { hp: 110, r: 0.6, blast: { radius: 3.6, dmg: 360, knock: 3 } },
  pot:    { hp: 50,  r: 0.5 },
};

// Garage upgrades. Five tracks per mech, UPGRADE.max levels each; lv = [giap, dongco, hoaluc, napdan, chieu].
// cost(level) is the price in coins of going from level to level + 1 on one track.
export const UPGRADE = { max: 5, cost: (level) => 120 + level * 90, perkAt: [6, 12, 18] };
export const TRACKS = [
  { key: 'giap',   name: 'Vỏ giáp',   desc: 'Máu +4%, giáp +1,2% mỗi cấp',        hp: 0.04, armor: 0.012 },
  { key: 'dongco', name: 'Động cơ',   desc: 'Tốc độ +2%, gia tốc +5% mỗi cấp',    speed: 0.02, accel: 0.05 },
  { key: 'hoaluc', name: 'Hỏa lực',   desc: 'Sát thương +4% mỗi cấp',             dmg: 0.04 },
  { key: 'napdan', name: 'Nạp đạn',   desc: 'Bắn nhanh +3%, tầm bắn +2% mỗi cấp', rate: 0.03, range: 0.02 },
  { key: 'chieu',  name: 'Lõi chiêu', desc: 'Hồi chiêu nhanh hơn 3% mỗi cấp',     cd: 0.03 },
];
export const NO_LV = [0, 0, 0, 0, 0];
// What a room with humans on both teams plays at, whatever each player owns.
export const FAIR_LV = [3, 3, 3, 3, 3];
export const cleanLv = (lv) => NO_LV.map((_, i) => Math.max(0, Math.min(UPGRADE.max, Math.floor(Array.isArray(lv) ? Number(lv[i]) || 0 : 0))));
export const perkCount = (lv) => { const n = lv.reduce((a, b) => a + b, 0); return UPGRADE.perkAt.filter((at) => n >= at).length; };

// Skill milestones: PERKS[mech][i] unlocks when the mech's total upgrade level reaches UPGRADE.perkAt[i].
// slot: 'weapon' or the skill index; patch: fields written over that row.
const perk = (name, desc, slot, patch) => ({ name, desc, slot, patch });
export const PERKS = {
  trau: [perk('Đà Húc', 'Húc Thép lao xa 10,5 m và choáng 1,2 giây.', 1, { dist: 10.5, stun: 1.2 }), perk('Giáp Dày', 'Giáp Phản Lực hấp thụ 1200.', 0, { amount: 1200 }), perk('Dư Chấn', 'Địa Chấn rộng 7,5 m, làm chậm 4 giây.', 2, { radius: 7.5, slowDur: 4 })],
  soi: [perk('Rocket Thứ Tư', 'Rocket Chùm bắn bốn quả.', 0, { n: 4 }), perk('Bền Hơi', 'Tăng Áp kéo dài 5,5 giây.', 1, { dur: 5.5 }), perk('Mưa Dày', 'Mưa Hỏa Tiễn dội 12 quả.', 2, { n: 12 })],
  ung: [perk('Xung Mạnh', 'Mìn Xung Điện choáng 1,8 giây.', 0, { stun: 1.8 }), perk('Bóng Dài', 'Lướt Bóng tàng hình 3,2 giây.', 1, { stealth: 3.2 }), perk('Tia Lớn', 'Tia Xuyên Phá rộng 1,6 m, gây 2100.', 2, { width: 1.6, dmg: 2100 })],
  hac: [perk('Suối Đầy', 'Suối Hồi Phục hồi 310 mỗi giây.', 0, { hps: 310 }), perk('Trì Trệ Sâu', 'Trường Trì Trệ làm chậm 60%.', 1, { slow: 0.6 }), perk('Vòm Bền', 'Vòm Bảo Hộ kéo dài 7 giây.', 2, { dur: 7 })],
  loi: [perk('Khói Đặc', 'Màn Khói kéo dài 7,5 giây.', 0, { dur: 7.5 }), perk('Thuốc Nổ', 'Giật Lùi gây 260.', 1, { dmg: 260 }), perk('Bảy Tiếng Sấm', 'Thiên Lôi rơi bảy quả.', 2, { n: 7 })],
  bocap: [perk('Vồ Liên Hồi', 'Vồ Mồi hồi trong 6,5 giây.', 0, { cd: 6.5 }), perk('Ẩn Sâu', 'Ngụy Trang kéo dài 5,5 giây.', 1, { stealth: 5.5, dur: 5.5 }), perk('Sáu Nhát', 'Lốc Thép chém sáu nhát.', 2, { repeat: 6 })],
  bang: [perk('Gai Buốt', 'Gai Băng làm chậm 30%.', 'weapon', { slow: 0.3 }), perk('Tường Dài', 'Tường Băng dài bảy khối.', 0, { n: 7 }), perk('Bão Dai', 'Bão Tuyết kéo dài 6,5 giây.', 2, { dur: 6.5 })],
  tho: [perk('Nòng Lớn', 'Ụ Súng bắn 66 mỗi phát.', 0, { dmg: 66 }), perk('Hố Rộng', 'Hố Từ rộng 5,5 m.', 1, { radius: 5.5 }), perk('Bảy Quả Mìn', 'Bãi Mìn rải bảy quả.', 2, { n: 7 })],
  thancong: [perk('Lõi Vonfram', 'Đạn Xuyên gây 1000.', 1, { dmg: 1000 }), perk('Chốt Nhanh', 'Cắm Chốt chỉ mất 0,35 giây.', 0, { setup: 0.35 }), perk('Mười Một Quả', 'Oanh Tạc dội 11 quả.', 2, { n: 11 })],
  mangxa: [perk('Xích Dài', 'Móc Xích vươn tới 16 m.', 0, { range: 16 }), perk('Choáng Váng', 'Hoán Vị với xa 15 m, địch chậm 2,5 giây.', 1, { cast: 15, slowDur: 2.5 }), perk('Lồng Chắc', 'Lồng Xích giữ 4,5 giây.', 2, { dur: 4.5 })],
  kimquy: [perk('Khiên Dày', 'Khiên Tặng hấp thụ 1000.', 0, { amount: 1000, shield: 1000 }), perk('Gai Mai', 'Mai Rùa phản 50%.', 1, { reflect: 0.5 }), perk('Thành Vững', 'Thành Đồng kéo dài 6,5 giây.', 2, { dur: 6.5 })],
  hacho: [perk('Móng Sắc', 'Vồ gây 300.', 0, { dmg: 300 }), perk('Nộ Dai', 'Cuồng Nộ kéo dài 5,5 giây.', 1, { dur: 5.5 }), perk('Án Tử', 'Dấu Tử kết liễu dưới 28% máu.', 2, { execute: 0.28 })],
  holy: [perk('Bom Ảnh', 'Bản sao nổ 260.', 0, { dmg: 260 }), perk('Bước Xa', 'Xuyên Tường xa 9,5 m.', 1, { dist: 9.5 }), perk('Bốn Bóng', 'Vũ Điệu Ảo Ảnh thả bốn bản sao.', 2, { n: 4 })],
  domdom: [perk('Ong Bền', 'Ong Thợ bay 16 giây.', 0, { dur: 16 }), perk('Tiếp Khiên', 'Tiếp Sức kèm khiên 300.', 1, { shield: 300 }), perk('Sáng Rực', 'Vòng Sáng hồi 1500.', 2, { heal: 1500 })],
  tacke: [perk('Dây Bền', 'Dây Điện dùng được 5 lần.', 0, { charges: 5 }), perk('Bảy Đĩa', 'Chùm Nảy bắn bảy đĩa.', 1, { n: 7 }), perk('Nảy Ba', 'Đĩa Nảy nảy tường ba lần.', 'weapon', { bounce: 3 })],
  hoalong: [perk('Tụ Nhanh', 'Quá Tải hồi trong 6,5 giây.', 0, { cd: 6.5 }), perk('Màn Rộng', 'Màn Sáng dài bảy tấm.', 1, { n: 7 }), perk('Tuyến Dài', 'Thiên Hỏa Tuyến kéo dài 3,4 giây.', 2, { dur: 3.4 })],
};

// The row a unit actually plays: the MECHS row with its upgrade levels and unlocked perks applied.
// Both ends of an online match build it from the same (key, lv), so nothing of it travels.
const DEF_CACHE = new Map();
export function buildDef(key, lv) {
  const base = MECHS[key];
  lv = cleanLv(lv);
  const id = key + ':' + lv.join('');
  if (DEF_CACHE.has(id)) return DEF_CACHE.get(id);
  const [g, d, h, n, c] = lv;
  const weapon = { ...base.weapon }, skills = base.skills.map((s) => ({ ...s }));
  (PERKS[key] || []).slice(0, perkCount(lv)).forEach((p) => Object.assign(p.slot === 'weapon' ? weapon : skills[p.slot], p.patch));
  weapon.cd /= 1 + 0.03 * n;
  weapon.range *= 1 + 0.02 * n;
  if (weapon.charge) weapon.charge = { ...weapon.charge, range: weapon.charge.range.map((r) => r * (1 + 0.02 * n)) };
  for (const s of skills) s.cd *= 1 - 0.03 * c;
  const def = { ...base, base, lv, weapon, skills, hp: Math.round(base.hp * (1 + 0.04 * g)), armor: (base.armor || 0) + 0.012 * g,
    speed: base.speed * (1 + 0.02 * d), accel: (base.accel || 1) * (1 + 0.05 * d), dmgUp: 1 + 0.04 * h };
  DEF_CACHE.set(id, def);
  return def;
}
export const upgradeCost = (lv) => lv.reduce((sum, l) => { for (let i = 0; i < l; i++) sum += UPGRADE.cost(i); return sum; }, 0);

// Cosmetic trim paints. The armour stays in the team colour so teams always read; paint recolours the trim parts.
export const PAINTS = {
  goc:   { name: 'Nguyên bản', price: 0, color: null },
  vang:  { name: 'Vàng Hổ Phách', price: 200, color: 0xf2b632 },
  trang: { name: 'Trắng Sứ', price: 200, color: 0xf1f4f7 },
  den:   { name: 'Đen Nhám', price: 250, color: 0x22252b },
  tim:   { name: 'Tím Điện', price: 300, color: 0x9b5cff },
  luc:   { name: 'Lục Bảo', price: 300, color: 0x2fd27a },
  hong:  { name: 'Hồng Neon', price: 350, color: 0xff4fa3 },
};

// More cosmetics, shown on the model. Glow recolours the emissive lamps of your own mech (the team ring and
// HP bar stay in team colours); a decal is a marking painted on the hull.
export const GLOWS = {
  goc:  { name: 'Mặc định', price: 0, color: null },
  vang: { name: 'Hoàng Kim', price: 250, color: 0xffc83a },
  tim:  { name: 'Tử Quang', price: 250, color: 0xb070ff },
  luc:  { name: 'Lân Tinh', price: 250, color: 0x5cff9a },
  hong: { name: 'Anh Đào', price: 300, color: 0xff6fb0 },
};
export const DECALS = {
  goc:   { name: 'Không', price: 0 },
  soc:   { name: 'Sọc Đua', price: 150 },
  vuot:  { name: 'Vuốt Hổ', price: 200 },
  sao:   { name: 'Ngôi Sao', price: 200 },
  caro:  { name: 'Ca-rô', price: 250 },
};

// Premium currency. Earned by playing (GEMS) or handed out by the pretend shop (SHOP). One gem pays for GEM_RATE coins of any price.
export const GEM_RATE = 10;
export const GEMS = { levelUp: 20, mvp: 2, firstWin: 10 };
// The pretend shop: no payment of any kind happens. `vnd` is only a label. grants: gems, coins, mech, paint, glow, decal, pass (days).
export const SHOP = [
  { id: 'khoidau', kind: 'starter', name: 'Gói Khởi Đầu', vnd: 29000, once: true, grants: { gems: 300, coins: 1000, mech: 'thancong', paint: 'vang' }, note: 'Mua một lần' },
  { id: 'thethang', kind: 'pass', name: 'Thẻ Tháng', vnd: 99000, grants: { gems: 200, pass: 30 }, note: '30 ngày: xu sau trận +50%, mỗi ngày nhận 30 Tinh Thể' },
  { id: 'goi_hacho', kind: 'bundle', name: 'Gói Hắc Hổ', vnd: 79000, grants: { mech: 'hacho', paint: 'den', glow: 'hong', gems: 150 } },
  { id: 'goi_hoalong', kind: 'bundle', name: 'Gói Hỏa Long', vnd: 79000, grants: { mech: 'hoalong', paint: 'vang', decal: 'vuot', gems: 150 } },
  { id: 'goi_holy', kind: 'bundle', name: 'Gói Hồ Ly', vnd: 79000, grants: { mech: 'holy', paint: 'hong', glow: 'tim', gems: 150 } },
  { id: 'tt1', kind: 'gems', name: 'Túi Tinh Thể', vnd: 20000, grants: { gems: 100 } },
  { id: 'tt2', kind: 'gems', name: 'Hộp Tinh Thể', vnd: 50000, grants: { gems: 280 }, note: '+12%' },
  { id: 'tt3', kind: 'gems', name: 'Rương Tinh Thể', vnd: 100000, grants: { gems: 600 }, note: '+20%' },
  { id: 'tt4', kind: 'gems', name: 'Kho Tinh Thể', vnd: 200000, grants: { gems: 1300 }, note: '+30%' },
  { id: 'tt5', kind: 'gems', name: 'Núi Tinh Thể', vnd: 500000, grants: { gems: 3500 }, note: '+40%' },
];
export const PASS = { coinMul: 1.5, daily: 30 };

// Rank by trophies: a win gives trophies.win, a loss takes trophies.lose (never below 0).
export const TROPHIES = { win: 22, lose: 12, draw: 4 };
export const RANKS = [
  { name: 'Sắt', min: 0, color: '#8d98a6' }, { name: 'Đồng', min: 100, color: '#c98a52' }, { name: 'Bạc', min: 250, color: '#cfd8e2' },
  { name: 'Vàng', min: 450, color: '#f2b632' }, { name: 'Bạch Kim', min: 700, color: '#7ee0d2' }, { name: 'Kim Cương', min: 1000, color: '#7fb8ff' },
];

// Game modes. tdm: team kills. chiem: hold control points for score. tudo: free-for-all, every mech is its own team.
// trum: the hunters against one boss, with a shared pool of lives.
// Each row is the 5v5 baseline (also used for any size above 3). `sizes[n]` overrides it for a match of n mechs a side
// (tudo: 2n mechs in all, trum: n hunters); nested objects (tower, respawn, crate) are merged field by field. See ruleFor.
export const MODES = {
  tdm:   { name: 'Đấu đội', blurb: 'Đội nào hạ gục đủ chỉ tiêu trước thì thắng.', target: 25, duration: 300, mission: 'Hạ gục đối thủ, đội nào chạm {target} điểm trước sẽ thắng',
           sizes: { 1: { target: 3, respawn: { base: 3 } }, 2: { target: 8, respawn: { base: 4 } }, 3: { target: 14, respawn: { base: 4 } } } },
  chiem: { name: 'Chiếm điểm', blurb: 'Giữ các cứ điểm để tích điểm. Hạ gục không tính điểm, chỉ mở đường.', target: 200, duration: 360, mission: 'Đứng trong vòng để chiếm cứ điểm, đội nào đủ {target} điểm trước sẽ thắng',
           radius: 4.6, captureTime: 4, every: 2.5,
           sizes: { 1: { target: 60 }, 2: { target: 180 }, 3: {} } },
  // Two-sided base mode. The main tower cannot be hurt while a secondary tower of its team stands. Respawns get longer as the match goes on.
  nha:   { name: 'Thủ nhà', blurb: 'Mỗi căn cứ có 2 trụ phụ và 1 trụ chính. Phá trụ chính của địch trước khi nhà mình sập.', target: 3, duration: 480, mission: 'Hạ hai trụ phụ rồi phá trụ chính của địch, đồng thời giữ trụ nhà',
           tower: { sub: 7000, main: 11000, radius: 1.7, range: 13, dmg: 270, cd: 1.0, windup: 0.4, speed: 32, aggro: 2 }, respawn: { base: 5, perMin: 1, max: 12 },
           sizes: {
             1: { tower: { sub: 3600, main: 5800 }, respawn: { base: 3.5, perMin: 0.6, max: 8 } },
             2: { tower: { sub: 5000, main: 8000 }, respawn: { base: 4, perMin: 0.8, max: 10 } },
             3: { tower: { sub: 5600, main: 9000 }, respawn: { base: 4, perMin: 0.8, max: 10 } } } },
  tudo:  { name: 'Hỗn chiến', blurb: 'Không đồng đội, mỗi cỗ máy tự đánh. Ai hạ gục đủ chỉ tiêu trước thì thắng.', target: 10, duration: 300, mission: 'Không có đồng đội: hạ gục {target} lần trước mọi người',
           sizes: { 1: { target: 3, respawn: { base: 3 } }, 2: { target: 6, respawn: { base: 3.5 } }, 3: { target: 8, respawn: { base: 4 } } } },
  trum:  { name: 'Săn trùm', blurb: 'Cả đội hợp sức hạ Cự Thần trước khi dùng hết số mạng.', target: 1, duration: 360, mission: 'Hạ Cự Thần trước khi cả đội dùng hết {lives} mạng', lives: 12,
           sizes: { 1: { bossHp: 0.17, lives: 4 }, 2: { bossHp: 0.33, lives: 6 }, 3: { bossHp: 0.5, lives: 9 } } },
};
// Mechs a side in a match: the larger team (tudo: half of all mechs; trum: the hunters, the boss does not count).
export function matchSize(mode, roster) {
  if (mode === 'tudo') return Math.max(1, Math.round(roster.length / 2));
  const n = [0, 0];
  for (const r of roster) if (!(BOSSES[r.mech])) n[r.team ? 1 : 0]++;
  return Math.max(1, n[0], mode === 'trum' ? 0 : n[1]);
}
// The rules of one mode at one team size: the mode row, the size override on top, `crate` (airdrops) from RULES.crate.
export function ruleFor(mode, size) {
  const base = MODES[mode], over = (base.sizes && base.sizes[size]) || {};
  const out = { ...base, ...over, size };
  if (base.tower) out.tower = { ...base.tower, ...(over.tower || {}) };
  out.respawn = { base: RULES.respawn, perMin: 0, max: RULES.respawn, ...(base.respawn || {}), ...(over.respawn || {}) };
  out.crate = { ...RULES.crate, ...(RULES.crateBySize[size] || {}), ...(over.crate || {}) };
  return out;
}
export const MODE_ORDER = ['tdm', 'nha', 'chiem', 'tudo', 'trum'];

// Bosses use the same row shape as MECHS and the same skill primitives. heavy: shrugs off most stuns, knockback and pulls.
export const BOSSES = {
  titan: {
    name: 'Cự Thần', role: 'Trùm', roleKey: 'boss', boss: true, heavy: true, tint: 0xb02a2a,
    hp: 100000, speed: 3.4, radius: 2.5,
    weapon: { name: 'Tam Pháo', cd: 0.9, dmg: 420, n: 3, fan: 0.16, speed: 24, range: 18, splash: 2.2, r: 0.36, vis: 'shell' },
    skills: [
      { id: 'trum_dam', name: 'Dậm Đất', cd: 7.2, do: 'nova', windup: 1.1, radius: 8.5, dmg: 1240, slow: 0.5, slowDur: 2.5, knock: 4, icon: 'quake', desc: '' },
      { id: 'trum_lao', name: 'Xung Phong', cd: 9.6, do: 'dash', dist: 15, speed: 22, dmg: 1040, stun: 1.1, knock: 5, icon: 'dash', desc: '' },
      { id: 'trum_mua', name: 'Hỏa Vũ', cd: 12.8, do: 'barrage', n: 14, radius: 9, blast: 2.8, dmg: 660, delay: 1.1, span: 2.4, cast: 22, icon: 'barrage', desc: '' },
    ],
  },
};
