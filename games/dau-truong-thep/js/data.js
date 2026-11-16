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
  khiphao: {
    name: 'Khỉ Pháo', role: 'Ảo thuật', roleKey: 'trickster', price: 1600, tint: 0x7a3fb0,
    blurb: 'Bắn pháo tép làm chậm bừa, thả bẫy lúc chuồn, mở hội pháo hoa chụp cả nhóm.',
    hp: 2300, speed: 6.8, radius: 0.78,
    armor: 0.03, accel: 1.3, turn: 14, towerMul: 1.2,
    passive: { do: 'trait', name: 'Trò Đùa', desc: 'Mỗi quả pháo tép có 30% làm chậm 35% trong 1,5 giây hoặc làm yếu địch 20% sát thương trong 2 giây.' },
    weapon: { name: 'Pháo Tép', cd: 0.5, dmg: 150, speed: 26, range: 12, splash: 1.4, r: 0.24, vis: 'rocket', fx: { chance: 0.3, pick: [{ slow: 0.35, slowDur: 1.5 }, { weaken: { mul: 0.8, dur: 2 } }] } },
    skills: [
      { id: 'bomcuoi', name: 'Bom Cười', cd: 8, do: 'barrage', n: 1, radius: 0, blast: 3, dmg: 450, delay: 0.8, span: 0, cast: 12, icon: 'barrage',
        desc: 'Ném một quả bom tới con trỏ, nổ sau 0,8 giây. Vòng đỏ báo trước chỗ rơi.' },
      { id: 'chuonle', name: 'Chuồn Lẹ', cd: 12, do: 'dash', dist: 8, speed: 30, dmg: 0, icon: 'dash',
        onStart: { mine: { trigger: 2, blast: 3, dmg: 260, arm: 0.4, life: 8, fx: { slow: 0.4, slowDur: 1.5 } } },
        desc: 'Lao nhanh theo hướng ngắm và thả lại một quả mìn ở chỗ xuất phát: địch giẫm phải bị chậm.' },
      { id: 'hoiphaohoa', name: 'Hội Pháo Hoa', cd: 44, do: 'barrage', n: 12, radius: 7, blast: 2.6, dmg: 260, delay: 0.9, span: 2.2, cast: 16, icon: 'storm',
        fx: { slow: 0.4, slowDur: 1.5, weaken: { mul: 0.8, dur: 2 } },
        desc: 'Mười hai quả pháo hoa dội xuống vùng con trỏ, kẻ trúng bị chậm 40% và yếu đi 20% sát thương.' },
    ],
  },
  quancong: {
    name: 'Quan Công', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0x2f7d4a,
    blurb: 'Đao khí xuyên hàng, xung phong chém tướng. Hạ gục là hồi sạch chiêu, trợ công giảm một nửa.',
    hp: 3000, speed: 5.9, radius: 0.9,
    armor: 0.12, accel: 1.0, turn: 11, towerMul: 1.6,
    passive: { do: 'trait', name: 'Thanh Long Hồi Phong', desc: 'Hạ gục hồi sạch thời gian hồi ba chiêu. Trợ công giảm một nửa thời gian hồi còn lại.',
      mods: { onKill: { reset: { slots: ['s1', 's2', 'ult'], frac: 1 }, assist: { reset: 0.5 } } } },
    weapon: { name: 'Đao Khí', cd: 0.6, dmg: 70, n: 3, fan: 0.18, speed: 24, range: 6.5, r: 0.4, pierce: true, vis: 'wave' },
    skills: [
      { id: 'xungphong', name: 'Xung Phong', cd: 9, do: 'dash', dist: 9, speed: 30, dmg: 190, stun: 0.5, knock: 1, icon: 'dash',
        desc: 'Phi ngựa lao tới theo hướng ngắm, gây sát thương và làm choáng kẻ bị húc.' },
      { id: 'yennguyet', name: 'Yển Nguyệt', cd: 7, do: 'volley', n: 5, fan: 0.2, dmg: 140, speed: 26, range: 5.5, r: 0.5, pierce: true, knock: 1.5, vis: 'wave', icon: 'spin',
        desc: 'Vung đao trăng khuyết quét một hình quạt năm đường, xuyên qua mọi kẻ địch.' },
      { id: 'tramtuong', name: 'Trảm Tướng', cd: 32, do: 'nova', windup: 0.35, radius: 5, dmg: 500, fx: { execute: 0.25 }, icon: 'quake',
        desc: 'Chém một nhát quanh mình: kẻ địch trúng đòn mà máu còn dưới 25% bị kết liễu ngay.' },
    ],
  },
  natra: {
    name: 'Na Tra', role: 'Thọc sườn', roleKey: 'flanker', price: 1500, tint: 0xe8562e,
    blurb: 'Bánh xe lửa lao nhanh, vòng càn khôn bay đi rồi quay về. Máu xuống thấp thì chạy nhanh, cứng cáp hơn.',
    hp: 2400, speed: 7.1, radius: 0.76,
    armor: 0.03, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'trait', name: 'Liên Hoa Thân', desc: 'Khi máu dưới 35%, chạy nhanh hơn 25% và thêm 20% giáp.',
      mods: { lowHp: { below: 0.35, haste: 1.25, armor: 0.2 } } },
    weapon: { name: 'Hỏa Tiêm Thương', cd: 0.3, dmg: 95, speed: 34, range: 11, r: 0.2, vis: 'dart' },
    skills: [
      { id: 'cankhon', name: 'Càn Khôn Quyển', cd: 8, do: 'volley', n: 1, dmg: 210, speed: 26, range: 13, r: 0.45, pierce: true, ret: true, slow: 0.35, slowDur: 1.5, vis: 'disc', icon: 'ricochet',
        desc: 'Ném vòng càn khôn xuyên qua địch, tới cuối tầm thì quay về tay: trúng được hai lượt, làm chậm.' },
      { id: 'phonghoaluan', name: 'Phong Hỏa Luân', cd: 10, do: 'dash', dist: 9, speed: 32, dmg: 180, knock: 1.5, stun: 0, icon: 'dash',
        desc: 'Đạp bánh xe lửa lao đi theo hướng ngắm, hất văng kẻ chắn đường.' },
      { id: 'thiengiang', name: 'Thiên Giáng', cd: 40, do: 'leap', to: 'foe', cast: 14, pick: 4, flight: 0.55, radius: 3.2, dmg: 620, stun: 1, icon: 'leap',
        desc: 'Khóa một kẻ địch ở con trỏ rồi bay tới giáng xuống: sát thương lớn và choáng 1 giây. Không có ai ở đó thì không phóng.' },
    ],
  },
  duongtien: {
    name: 'Dương Tiễn', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0xc8ccd6,
    blurb: 'Thiên nhãn nhìn thấu kẻ yếu máu, Hao Thiên Khuyển đuổi cắn, tia thần nhãn bám mục tiêu xuyên tường.',
    hp: 2700, speed: 6.4, radius: 0.82,
    armor: 0.08, accel: 1.1, turn: 12, towerMul: 1.2,
    passive: { do: 'brittle', name: 'Thiên Nhãn', desc: 'Kẻ địch dưới 40% máu trong 12 m bị lộ diện, và chịu thêm 25% sát thương từ bạn.', mul: 1.25, when: 'low', below: 0.4, reveal: { r: 12, below: 0.4 } },
    weapon: { name: 'Tam Tiêm', cd: 0.45, dmg: 110, speed: 32, range: 12.5, r: 0.22, vis: 'slug' },
    skills: [
      { id: 'tamtiendao', name: 'Tam Tiêm Đao', cd: 9, do: 'volley', n: 1, dmg: 260, speed: 36, range: 15, r: 0.3, pierce: true, vis: 'sabot', fx: { amp: { amp: 0.15, dur: 4 } }, icon: 'pierce',
        desc: 'Phóng lưỡi tam tiêm xuyên qua địch; kẻ trúng nhận thêm 15% sát thương từ mọi người trong 4 giây.' },
      { id: 'haothien', name: 'Hao Thiên Khuyển', cd: 14, do: 'decoy', n: 1, fan: 0, hp: 450, dur: 6, blast: 2.5, dmg: 240, stealth: 0, seek: { speed: 8.5, range: 14 }, fx: { reveal: 4 }, icon: 'decoy',
        desc: 'Thả chó săn đuổi theo địch gần nhất trong 14 m. Chạm là nổ, kẻ trúng bị lộ diện 4 giây.' },
      { id: 'thannhan', name: 'Thần Nhãn Truy Kích', cd: 45, do: 'beam', windup: 0.8, range: 24, width: 0.9, dmg: 1200, thru: true, track: { cast: 22, pick: 5 }, icon: 'beam',
        desc: 'Khóa kẻ địch ở con trỏ, lấy đà 0,8 giây rồi bắn tia bám theo nó, xuyên cả tường.' },
    ],
  },
  athena: {
    name: 'Athena', role: 'Hộ vệ', roleKey: 'guardian', price: 1500, tint: 0xe9e4d4,
    blurb: 'Giáo sáng và khiên bay quay về tay. Tặng khiên cho đồng đội, dựng kết giới chắn đạn.',
    hp: 2500, speed: 5.4, radius: 0.92,
    armor: 0.15, accel: 0.8, turn: 9, towerMul: 1.0,
    passive: { do: 'ward', name: 'Thần Hộ', desc: 'Đồng đội trong 5 m nhận ít hơn 12% sát thương.', radius: 5, armor: 0.12 },
    weapon: { name: 'Giáo Sáng', cd: 0.5, dmg: 168, speed: 30, range: 11, r: 0.24, vis: 'pulse' },
    skills: [
      { id: 'khienbay', name: 'Khiên Bay', cd: 8, do: 'volley', n: 1, dmg: 250, speed: 22, range: 11, r: 0.5, pierce: true, ret: true, vis: 'disc', icon: 'ricochet',
        desc: 'Ném khiên xuyên qua địch rồi quay về tay: trúng được hai lượt.' },
      { id: 'khienthan', name: 'Khiên Thần', cd: 10, do: 'bless', cast: 12, pick: 3.5, shield: 500, dur: 4, icon: 'shield',
        desc: 'Phủ khiên 500 trong 4 giây cho đồng đội ở con trỏ. Không có ai ở đó thì khiên về mình.' },
      { id: 'ketgioi', name: 'Kết Giới', cd: 46, do: 'dome', radius: 6.5, dur: 5, shield: 300, heal: 200, icon: 'dome',
        desc: 'Dựng vòm kết giới 5 giây chắn đạn địch; đồng đội bên trong được hồi 200 máu và khiên 300.' },
    ],
  },
  hades: {
    name: 'Hades', role: 'Khống chế', roleKey: 'control', price: 1400, tint: 0x2b2540,
    blurb: 'Hồn hỏa làm chậm, bàn tay âm giới trói chân, cửa âm phủ hút cả nhóm. Mỗi mạng hạ được để lại vùng hồn thiêu đốt.',
    hp: 2500, speed: 5.9, radius: 0.84,
    armor: 0.08, accel: 0.9, turn: 11, towerMul: 0.8,
    passive: { do: 'souls', name: 'Thu Hồn', desc: 'Đòn của bạn đánh dấu hồn: kẻ bị đánh dấu nhận thêm 10% sát thương trong 4 giây. Hạ gục hoặc trợ công thì nơi đó nổi vùng hồn gây 180 sát thương mỗi giây trong 3 giây.',
      mark: { amp: 0.1, dur: 4 }, zone: { radius: 3, dur: 3, dps: 180 } },
    weapon: { name: 'Hồn Hỏa', cd: 0.4, dmg: 115, speed: 28, range: 13, r: 0.24, vis: 'frost' },
    skills: [
      { id: 'amluu', name: 'Ám Lưu', cd: 7, do: 'volley', n: 1, dmg: 260, speed: 28, range: 14, r: 0.35, slow: 0.35, slowDur: 1.6, vis: 'frost', icon: 'frost',
        desc: 'Bắn dòng hồn lạnh, làm chậm 35% trong 1,6 giây.' },
      { id: 'bantay', name: 'Bàn Tay Âm Giới', cd: 12, do: 'barrage', n: 1, radius: 0, blast: 3, dmg: 200, delay: 0.6, span: 0, cast: 13, fx: { root: 1.4 }, icon: 'cage',
        desc: 'Một bàn tay trồi lên ở con trỏ sau 0,6 giây, giữ chân kẻ trúng đòn 1,4 giây (vẫn bắn được).' },
      { id: 'cuaamphu', name: 'Cửa Âm Phủ', cd: 44, do: 'zone', at: 'target', cast: 14, radius: 6, dur: 4, pull: 6, dps: 220, vis: 'magnet', icon: 'magnet',
        desc: 'Mở cửa âm phủ ở con trỏ trong 4 giây: kéo địch vào tâm và thiêu 220 sát thương mỗi giây.' },
    ],
  },
  lubo: {
    name: 'Lữ Bố', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1700, tint: 0xb3262b,
    blurb: 'Kích dài quét hai đường, bắn càng lâu càng nhanh. Xung phong hai lần liền, hóa Chiến Thần hồi máu và bất chấp khống chế.',
    hp: 2700, speed: 6.3, radius: 0.88,
    armor: 0.1, accel: 1.1, turn: 11, towerMul: 1.3,
    passive: { do: 'ramp', name: 'Chiến Ý', desc: 'Mỗi lần trúng đòn bắn nhanh thêm 6%, cộng dồn tối đa 5 lần, mất dần sau 3 giây không trúng.', on: 'hit', stat: 'rapid', step: 0.06, max: 5, dur: 3 },
    weapon: { name: 'Phương Thiên Kích', cd: 0.5, dmg: 75, n: 2, fan: 0.12, speed: 26, range: 7.5, r: 0.36, pierce: true, vis: 'wave' },
    skills: [
      { id: 'dotkich', name: 'Đột Kích', cd: 10, do: 'dash', dist: 7, speed: 30, dmg: 150, stun: 0.2, knock: 1, recast: { n: 2, window: 3 }, icon: 'dash',
        desc: 'Lao tới theo hướng ngắm, húc sát thương và choáng nhẹ. Trong 3 giây sau bấm lại để lao thêm một lần nữa.' },
      { id: 'kichchan', name: 'Kích Chấn', cd: 9, do: 'volley', n: 1, dmg: 260, speed: 22, range: 7, r: 1.3, pierce: true, knock: 3, vis: 'wave', icon: 'quake',
        desc: 'Vung kích tạo sóng rộng xuyên qua mọi kẻ địch phía trước, hất văng chúng.' },
      { id: 'chienthan', name: 'Chiến Thần', cd: 45, do: 'transform', dur: 6, cleanse: true, ccImmune: 2, heal: 0.3, dmg: 1.2, rapid: 1.2, icon: 'rage',
        desc: 'Hóa Chiến Thần 6 giây: xóa mọi hiệu ứng xấu, miễn choáng và làm chậm trong 2 giây đầu, hồi 30% máu đã mất, gây thêm 30% sát thương và bắn nhanh hơn 20%.' },
    ],
  },
  mucma: {
    name: 'Mực Ma', role: 'Thọc sườn', roleKey: 'flanker', price: 1600, tint: 0x1d1d24,
    blurb: 'Xúc tu đỏ quất ba đường, xuyên thân đánh dấu mục tiêu. Hạ gục hồi máu, Hóa Ma hút máu và chạy nhanh.',
    hp: 2300, speed: 7.0, radius: 0.76,
    armor: 0.03, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'lifesteal', name: 'Đói Khát', desc: 'Hồi máu bằng 10% sát thương gây ra. Hạ gục hồi thêm 10% máu tối đa, trợ công hồi 5%.', frac: 0.1,
      mods: { onKill: { heal: 0.1, assist: { heal: 0.05 } } } },
    weapon: { name: 'Xúc Tu', cd: 0.35, dmg: 45, n: 3, fan: 0.14, speed: 28, range: 8, r: 0.24, vis: 'pellet' },
    skills: [
      { id: 'quatxuctu', name: 'Quất Xúc Tu', cd: 7, do: 'volley', n: 5, fan: 0.22, dmg: 120, speed: 26, range: 7, r: 0.4, pierce: true, vis: 'wave', icon: 'spin',
        desc: 'Quất năm xúc tu hình quạt, xuyên qua mọi kẻ địch.' },
      { id: 'xuyenthan', name: 'Xuyên Thân', cd: 10, do: 'dash', dist: 8, speed: 34, dmg: 200, fx: { amp: { amp: 0.2, dur: 4 } }, icon: 'dash',
        desc: 'Lao xuyên qua kẻ địch, gây sát thương và khiến chúng nhận thêm 20% sát thương từ mọi người trong 4 giây.' },
      { id: 'hoama', name: 'Hóa Ma', cd: 40, do: 'transform', dur: 6, haste: 1.3, rapid: 1.4, lifesteal: 0.35, icon: 'rage',
        desc: 'Hóa Ma 6 giây: chạy nhanh hơn 30%, bắn nhanh hơn 40% và hút máu 35%.' },
    ],
  },
  kynhong: {
    name: 'Kỳ Nhông', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0xe2401c,
    blurb: 'Quyền lửa liên hồi đốt cháy cộng dồn, kẻ đang cháy chịu thêm sát thương. Long Hóa phun lửa dài, cứng và nhanh hơn.',
    hp: 2800, speed: 6.1, radius: 0.86,
    armor: 0.08, accel: 1.1, turn: 12, towerMul: 1.8,
    passive: { do: 'brittle', name: 'Lửa Rồng', desc: 'Gây thêm 20% sát thương lên kẻ đang cháy.', mul: 1.2, when: 'burn' },
    weapon: { name: 'Hỏa Quyền', cd: 0.12, dmg: 25, speed: 22, range: 6.5, spread: 0.14, r: 0.34, pierce: true, vis: 'flame', fx: { burn: { dps: 20, dur: 3, max: 4 } } },
    skills: [
      { id: 'hoalongkhieu', name: 'Hỏa Long Khiếu', cd: 8, do: 'volley', n: 5, fan: 0.16, dmg: 100, speed: 24, range: 8, r: 0.4, pierce: true, vis: 'flame', fx: { burn: { dps: 20, dur: 3, max: 4 } }, icon: 'rocket',
        desc: 'Phun năm luồng lửa hình quạt, xuyên qua địch và thiêu đốt.' },
      { id: 'hoaquyendot', name: 'Hỏa Quyền Đột', cd: 10, do: 'dash', dist: 7, speed: 32, dmg: 360, stun: 0.3, knock: 3, stop: true, fx: { burn: { dps: 20, dur: 3, max: 4 } }, icon: 'dash',
        desc: 'Lao tới và dừng ngay ở kẻ địch đầu tiên, giáng cú đấm lửa 360 sát thương, choáng và thiêu đốt.' },
      { id: 'longhoa', name: 'Long Hóa', cd: 44, do: 'transform', dur: 5, armor: 0.15, haste: 1.15, weapon: { range: 11, dmg: 36, r: 0.5 }, icon: 'boost',
        desc: 'Long Hóa 5 giây: thêm 15% giáp, chạy nhanh hơn 15%, hơi thở lửa phun xa 11 m và mạnh hơn.' },
    ],
  },
  nguma: {
    name: 'Ngưu Ma Vương', role: 'Trụ', roleKey: 'tank', price: 1800, tint: 0x5a1e1e,
    blurb: 'Rìu chấn nặng nề, càng bị đánh dồn càng cứng. Pháp Tướng hóa khổng lồ, hồi máu và giáng một đòn chấn động.',
    hp: 3100, speed: 5.0, radius: 1.0,
    armor: 0.14, accel: 0.8, turn: 9, towerMul: 1.5,
    passive: { do: 'ramp', name: 'Da Trâu', desc: 'Mỗi lần bị trúng đòn thêm 2% giáp, cộng dồn tối đa 6 lần, mất dần sau 3 giây không bị đánh.', on: 'hurt', stat: 'armor', step: 0.02, max: 6, dur: 3 },
    weapon: { name: 'Rìu Chấn', cd: 0.9, dmg: 200, speed: 24, range: 8, r: 0.6, pierce: true, knock: 1.5, vis: 'wave' },
    skills: [
      { id: 'songriu', name: 'Sóng Rìu', cd: 8, do: 'volley', n: 3, fan: 0.08, dmg: 220, speed: 24, range: 8, r: 0.45, pierce: true, vis: 'wave', icon: 'spin',
        desc: 'Tung ba sóng rìu liền nhau, xuyên qua mọi kẻ địch.' },
      { id: 'humma', name: 'Húc Ma', cd: 12, do: 'dash', dist: 9, speed: 26, dmg: 200, stun: 0.4, knock: 4.5, icon: 'dash',
        desc: 'Cúi sừng húc tới, gây sát thương, choáng và hất văng kẻ chắn đường.' },
      { id: 'phaptuong', name: 'Pháp Tướng', cd: 46, do: 'transform', dur: 6, size: 1.35, armor: 0.2, heal: 0.25, nova: { windup: 0.3, radius: 6, dmg: 320, stun: 1.1 }, icon: 'quake',
        desc: 'Hóa Pháp Tướng 6 giây: to hơn 35%, thêm 20% giáp, hồi 25% máu đã mất và giáng một đòn chấn động 320 sát thương, choáng 1,1 giây.' },
    ],
  },
  sontinh: {
    name: 'Sơn Tinh', role: 'Trụ', roleKey: 'tank', price: 1800, tint: 0x6b7a3a,
    blurb: 'Đứng vững như núi: đứng yên càng lâu giáp càng dày. Dựng vách đá, chấn địa, dời non đè cả vùng.',
    hp: 3300, speed: 4.9, radius: 0.96,
    armor: 0.15, accel: 0.8, turn: 9, towerMul: 1.4,
    passive: { do: 'ramp', name: 'Núi Vững', desc: 'Đứng yên mỗi nửa giây thêm 4% giáp, tối đa 5 lần. Di chuyển là mất hết.', on: 'still', stat: 'armor', step: 0.04, max: 5, every: 0.5, reset: 'move' },
    weapon: { name: 'Đá Lăn', cd: 1.0, dmg: 285, speed: 22, range: 13, splash: 2, knock: 2, r: 0.4, vis: 'shell' },
    skills: [
      { id: 'vachda', name: 'Vách Đá', cd: 14, do: 'wall', cast: 5, n: 5, r: 0.8, gap: 1.35, dur: 5, icon: 'wall',
        desc: 'Dựng một vách đá năm khối trước mặt trong 5 giây, chặn đường và đạn.' },
      { id: 'chandia', name: 'Chấn Địa', cd: 10, do: 'nova', windup: 0.35, radius: 5.5, dmg: 260, slow: 0.45, slowDur: 2, icon: 'quake',
        desc: 'Giậm đất quanh mình, gây 260 sát thương và làm chậm 45% trong 2 giây.' },
      { id: 'doinon', name: 'Dời Non', cd: 46, do: 'barrage', line: true, n: 6, gap: 2.6, radius: 7, blast: 2.8, dmg: 480, delay: 0.7, span: 1.2, cast: 16, fx: { stun: 0.7, knock: 3 }, icon: 'barrage',
        desc: 'Sáu tảng đá rơi thành một hàng dọc theo hướng ngắm, mỗi tảng 480 sát thương, choáng 0,7 giây và hất văng.' },
    ],
  },
  enbac: {
    name: 'Én Bạc', role: 'Xung kích', roleKey: 'assault', price: 1700, tint: 0x8a96a8,
    blurb: 'Song thương nhanh, ghim một mục tiêu thì sát thương tăng dần. Phản lực bắn trả khi lùi, mưa đạn trời dội vừa đi vừa bắn.',
    hp: 2450, speed: 6.8, radius: 0.8,
    armor: 0.04, accel: 1.3, turn: 14, towerMul: 1.0,
    passive: { do: 'ramp', name: 'Chốt Mục Tiêu', desc: 'Mỗi phát trúng cùng một mục tiêu tăng 4% sát thương đạn, tối đa 8 lần. Đổi mục tiêu là về lại từ đầu.', on: 'hit', stat: 'dmg', step: 0.04, max: 8, dur: 2, reset: 'switch' },
    weapon: { name: 'Song Thương', cd: 0.18, dmg: 76, speed: 34, range: 13, spread: 0.04, r: 0.2, alt: 0.4, vis: 'bullet' },
    skills: [
      { id: 'loatkep', name: 'Loạt Kép', cd: 6, do: 'volley', n: 2, fan: 0.05, dmg: 210, speed: 34, range: 15, r: 0.24, splash: 1.6, vis: 'rocket', icon: 'rocket',
        desc: 'Bắn hai quả tên lửa nhỏ nổ lan 1,6 m.' },
      { id: 'phanluc', name: 'Phản Lực', cd: 10, do: 'dash', dist: 8, speed: 34, dmg: 0, onStart: { volley: { n: 3, fan: 0.25, dmg: 110, speed: 30, range: 10, r: 0.2, vis: 'bullet', back: true } }, icon: 'boost',
        desc: 'Lao nhanh theo hướng ngắm; lúc bật đi, ba phát đạn bắn ngược về phía sau tỏa hình quạt.' },
      { id: 'muadan', name: 'Mưa Đạn Trời', cd: 42, do: 'barrage', radius: 4, blast: 2.2, dmg: 180, delay: 0.5, cast: 14, channel: { dur: 3, every: 0.2, move: 0.8 }, icon: 'storm',
        desc: 'Trong 3 giây vừa đi vừa dội đạn liên tục quanh con trỏ, mỗi 0,2 giây một quả nổ 180 sát thương.' },
    ],
  },
  boica: {
    name: 'Bói Cá', role: 'Bắn tỉa', roleKey: 'sniper', price: 1800, tint: 0x2f7fa6,
    blurb: 'Nín thở đứng yên để mỗi phát bắn thêm mạnh. Đạn xuyên dài, bẫy cảnh giới lộ diện, khóa mục tiêu rồi bắn tia chí mạng.',
    hp: 1700, speed: 5.9, radius: 0.76,
    armor: 0, accel: 1.0, turn: 10, towerMul: 0.4,
    passive: { do: 'ramp', name: 'Nín Thở', desc: 'Đứng yên mỗi 0,4 giây thêm 8% sát thương đạn, tối đa 5 lần. Di chuyển là mất hết.', on: 'still', stat: 'dmg', step: 0.08, max: 5, every: 0.4, reset: 'move' },
    weapon: { name: 'Súng Lặn', cd: 1.4, dmg: 330, speed: 62, range: 22, r: 0.2, vis: 'rail' },
    skills: [
      { id: 'danxuyen', name: 'Đạn Xuyên Dài', cd: 10, do: 'volley', n: 1, dmg: 560, speed: 60, range: 27, r: 0.22, pierce: true, vis: 'sabot', icon: 'pierce',
        desc: 'Bắn một viên đạn xuyên giáp tầm 27 m, xuyên qua mọi kẻ địch trên đường.' },
      { id: 'bancanhgioi', name: 'Bẫy Cảnh Giới', cd: 12, do: 'mine', cast: 9, trigger: 2.4, blast: 3, dmg: 120, stun: 0, arm: 0.6, life: 30, fx: { slow: 0.5, slowDur: 2, reveal: 5 }, icon: 'mine',
        desc: 'Đặt một quả mìn cảnh giới: kẻ giẫm phải bị chậm 50% trong 2 giây và bị lộ diện 5 giây.' },
      { id: 'khoamuctieu', name: 'Khóa Mục Tiêu', cd: 55, do: 'beam', windup: 1.1, range: 34, width: 0.6, dmg: 1800, track: { cast: 32, pick: 6 }, icon: 'beam',
        desc: 'Khóa kẻ địch ở con trỏ, lấy đà 1,1 giây rồi bắn tia 1800 sát thương bám theo mục tiêu.' },
    ],
  },
  bohung: {
    name: 'Bọ Hung', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1700, tint: 0x3c3f8f,
    blurb: 'Mỗi chiêu dùng ra là nạp một nấc lõi; đủ ba nấc, phát pháo kế tiếp nặng gấp đôi và choáng. Khiên tự nổ, Thăng Hóa phình to cứng cáp.',
    hp: 2750, speed: 5.6, radius: 0.92,
    armor: 0.12, accel: 1.0, turn: 10, towerMul: 1.3,
    passive: { do: 'meter', name: 'Tích Lực', desc: 'Mỗi chiêu dùng ra nạp một nấc, đủ 3 nấc thì phát pháo thường kế tiếp gây gấp đôi sát thương và choáng 0,4 giây.',
      max: 3, gain: { cast: 1 }, spend: { kind: 'shot', mul: 2.0, stun: 0.4 } },
    weapon: { name: 'Pháo Lõi', cd: 0.7, dmg: 150, speed: 28, range: 11, splash: 1.2, r: 0.28, vis: 'slug' },
    skills: [
      { id: 'luonghuydiet', name: 'Luồng Hủy Diệt', cd: 9, do: 'beam', windup: 0.35, range: 16, width: 0.8, dmg: 400, icon: 'beam',
        desc: 'Lấy đà 0,35 giây rồi bắn tia năng lượng dài 16 m, xuyên mọi kẻ địch trên đường, gây 400 sát thương.' },
      { id: 'lachanno', name: 'Lá Chắn Nổ', cd: 13, do: 'shield', amount: 650, dur: 4, burst: { radius: 4.5, dmg: 300, knock: 2 }, icon: 'shield',
        desc: 'Dựng khiên hấp thụ 650 sát thương trong 4 giây. Khiên vỡ hoặc hết giờ thì nổ ra quanh bạn, gây 300 sát thương và hất văng.' },
      { id: 'thangoa', name: 'Thăng Hóa', cd: 42, do: 'transform', dur: 7, size: 1.2, armor: 0.2, dmg: 1.25, icon: 'rage',
        desc: 'Thăng Hóa 7 giây: to hơn 20%, thêm 20% giáp và gây thêm 25% sát thương.' },
    ],
  },
  cakiem: {
    name: 'Cá Kiếm', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0x2e6b4f,
    blurb: 'Ba đường đao liền tay, mỗi chiêu dùng ra mài sắc nhát chém kế tiếp. Lướt xuyên đối thủ, lốc kiếm hai vòng, Nhất Đao chỉ choáng kẻ trúng giữa tia.',
    hp: 2650, speed: 6.4, radius: 0.86,
    armor: 0.08, accel: 1.2, turn: 13, towerMul: 1.3,
    passive: { do: 'meter', name: 'Kiếm Ý', desc: 'Mỗi chiêu dùng ra làm loạt đao thường kế tiếp mạnh thêm 80%.',
      max: 1, gain: { cast: 1 }, spend: { kind: 'shot', mul: 1.8 } },
    weapon: { name: 'Tam Đao', cd: 0.45, dmg: 66, n: 3, fan: 0.15, speed: 26, range: 7, r: 0.3, pierce: true, vis: 'wave' },
    skills: [
      { id: 'luottram', name: 'Lướt Trảm', cd: 8, do: 'dash', dist: 8, speed: 34, dmg: 220, knock: 0.5, icon: 'dash',
        desc: 'Lướt tới theo hướng ngắm, chém xuyên mọi kẻ địch trên đường, gây 220 sát thương.' },
      { id: 'lockiem', name: 'Lốc Kiếm', cd: 11, do: 'nova', windup: 0.15, repeat: 2, gap: 0.3, move: 1, radius: 3.8, dmg: 170, knock: 2, icon: 'spin',
        desc: 'Xoay kiếm hai vòng liền quanh mình, mỗi vòng 170 sát thương và hất văng, vừa xoay vừa chạy được.' },
      { id: 'nhatdao', name: 'Nhất Đao', cd: 40, do: 'beam', windup: 0.5, range: 14, width: 1.6, dmg: 1000, fx: { stun: { dur: 1.0, core: 0.35 } }, icon: 'pierce',
        desc: 'Lấy đà 0,5 giây rồi chém một đường rộng 1,6 m dài 14 m, 1000 sát thương. Kẻ trúng giữa tia bị choáng 1 giây.' },
    ],
  },
  gilgamesh: {
    name: 'Gilgamesh', role: 'Trụ', roleKey: 'tank', price: 1900, tint: 0xd9b23a,
    blurb: 'Càng chịu đòn càng uy nghi: đủ 1500 máu mất, phát bảo khí kế tiếp nặng hơn và choáng. Giam địch trong lồng vàng, mở cổng kho báu dội mưa vũ khí.',
    hp: 2900, speed: 5.3, radius: 0.96,
    armor: 0.15, accel: 0.8, turn: 9, towerMul: 1.4,
    passive: { do: 'meter', name: 'Vương Uy', desc: 'Mỗi điểm máu mất nạp một điểm uy, đủ 1500 thì bảo khí kế tiếp gây thêm 60% sát thương và choáng 0,6 giây.',
      max: 1500, gain: { hurt: 1 }, spend: { kind: 'shot', mul: 1.6, stun: 0.6 } },
    weapon: { name: 'Bảo Khí', cd: 0.8, dmg: 175, speed: 30, range: 12, r: 0.3, vis: 'sabot' },
    skills: [
      { id: 'phongbaokhi', name: 'Phóng Bảo Khí', cd: 8, do: 'volley', n: 3, fan: 0.1, dmg: 160, speed: 32, range: 13, r: 0.3, slow: 0.3, slowDur: 1.5, vis: 'sabot', icon: 'ricochet',
        desc: 'Phóng ba bảo khí hình quạt, mỗi cái 160 sát thương và làm chậm 30% trong 1,5 giây.' },
      { id: 'phongtoa', name: 'Phong Tỏa', cd: 15, do: 'zone', at: 'target', cast: 12, radius: 4.5, dur: 3, dps: 60, cage: true, vis: 'cage', icon: 'cage',
        desc: 'Dựng lồng vàng ở con trỏ trong 3 giây: kẻ địch đang đứng trong đó không ra được, mất 60 máu mỗi giây.' },
      { id: 'congkhobau', name: 'Cổng Kho Báu', cd: 46, do: 'barrage', n: 10, radius: 6.5, blast: 2.4, dmg: 360, delay: 0.9, span: 1.8, cast: 18, fx: { stun: 0.5, knock: 2 }, icon: 'storm',
        desc: 'Mở cổng kho báu: mười thanh vũ khí rơi rải trong vùng 6,5 m, mỗi quả 360 sát thương, choáng 0,5 giây và hất văng.' },
    ],
  },
  buomdem: {
    name: 'Bướm Đêm', role: 'Ảo thuật', roleKey: 'trickster', price: 1700, tint: 0x5a2a8a, hover: true,
    blurb: 'Mỗi chiêu dùng ra khoác thêm một lớp bùa hộ thân. Tia bùa xuyên thấu, cổng ảo nổ ở chỗ hạ cánh, kết giới đa chiều làm chậm và thiêu cả một vùng.',
    hp: 2350, speed: 6.6, radius: 0.78,
    armor: 0.03, accel: 1.4, turn: 15, towerMul: 1.0,
    passive: { do: 'meter', name: 'Bùa Hộ Thân', desc: 'Mỗi chiêu dùng ra cộng ngay 180 khiên trong 6 giây, cộng dồn tới 540.',
      max: 1, gain: { cast: 1 }, spend: { kind: 'shield', amount: 180, cap: 540, dur: 6 } },
    weapon: { name: 'Ấn Phép', cd: 0.3, dmg: 92, speed: 32, range: 13, r: 0.22, vis: 'pulse' },
    skills: [
      { id: 'tiabua', name: 'Tia Bùa', cd: 7, do: 'volley', n: 1, dmg: 340, speed: 34, range: 16, r: 0.3, pierce: true, vis: 'lance', icon: 'pierce',
        desc: 'Bắn một tia bùa xuyên thấu dài 16 m, gây 340 sát thương cho mọi kẻ địch nó đi qua.' },
      { id: 'congao', name: 'Cổng Ảo', cd: 11, do: 'warp', dist: 8, land: { radius: 3, dmg: 220, slow: 0.3, slowDur: 1.5 }, icon: 'warp',
        desc: 'Dịch chuyển tức thì tới con trỏ, xa nhất 8 m, qua được tường. Chỗ hạ cánh nổ 220 sát thương và làm chậm 30% trong 1,5 giây.' },
      { id: 'ketgioi', name: 'Kết Giới Đa Chiều', cd: 44, do: 'zone', at: 'target', cast: 14, radius: 6, dur: 5, dps: 190, slow: 0.4, vis: 'blizzard', icon: 'blizzard',
        desc: 'Mở kết giới ở con trỏ trong 5 giây: địch trong đó bị chậm 40% và mất 190 máu mỗi giây.' },
    ],
  },
  laclong: {
    name: 'Lạc Long Quân', role: 'Trụ', roleKey: 'tank', price: 1800, tint: 0x1f6f8f,
    blurb: 'Máu mất hóa thành giáp thủy: đủ 1200 là tự khoác khiên 450. Xoáy nước làm chậm địch và tiếp sức đồng đội, Long Quân Giá Lâm húc xuyên nửa sân.',
    hp: 2800, speed: 5.4, radius: 0.96,
    armor: 0.12, accel: 0.8, turn: 9, towerMul: 1.4,
    passive: { do: 'meter', name: 'Giáp Thủy', desc: 'Mỗi điểm máu mất nạp một điểm, đủ 1200 thì tự khoác khiên 450 trong 5 giây.',
      max: 1200, gain: { hurt: 1 }, spend: { kind: 'shield', amount: 450, dur: 5 } },
    weapon: { name: 'Thủy Pháo', cd: 0.7, dmg: 180, speed: 26, range: 12, splash: 1.8, knock: 1.5, r: 0.32, vis: 'shell' },
    skills: [
      { id: 'voirong', name: 'Vòi Rồng', cd: 8, do: 'volley', n: 1, dmg: 240, speed: 26, range: 12, r: 0.6, pierce: true, knock: 3, vis: 'wave', icon: 'quake',
        desc: 'Tung một cột sóng rộng xuyên qua mọi kẻ địch phía trước, 240 sát thương và hất văng.' },
      { id: 'xoaynuoc', name: 'Xoáy Nước', cd: 13, do: 'zone', at: 'target', cast: 12, radius: 5, dur: 4, slow: 0.4, haste: 1.25, vis: 'slow', icon: 'slow',
        desc: 'Mở xoáy nước ở con trỏ trong 4 giây: địch trong đó chậm 40%, đồng đội trong đó chạy nhanh hơn 25%.' },
      { id: 'longquan', name: 'Long Quân Giá Lâm', cd: 42, do: 'dash', dist: 15, speed: 30, dmg: 380, stun: 0.8, knock: 3, icon: 'dash',
        desc: 'Hóa rồng lao thẳng 15 m, mọi kẻ địch trên đường chịu 380 sát thương, choáng 0,8 giây và bị hất văng.' },
    ],
  },
  baogam: {
    name: 'Báo Gấm', role: 'Thọc sườn', roleKey: 'flanker', price: 1600, tint: 0x23262e,
    blurb: 'Hứng đòn nào cũng tích rung động, đầy là tự nổ hất văng. Giáp Rung chặn đòn mà vẫn nạp, Bung Năng Lượng dồn hết rung động vào một cú nổ.',
    hp: 2350, speed: 7.1, radius: 0.78,
    armor: 0.06, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'meter', name: 'Rung Động', desc: 'Máu mất và sát thương bị giáp chặn đều nạp rung động; đủ 1000 thì tự nổ quanh mình gây 380 sát thương và hất văng.',
      max: 1000, gain: { hurt: 1, absorbed: 1 }, spend: { kind: 'nova', radius: 4, dmg: 380, knock: 2.5 } },
    weapon: { name: 'Vuốt Rung', cd: 0.25, dmg: 58, n: 2, fan: 0.1, speed: 30, range: 7, r: 0.26, vis: 'pellet' },
    skills: [
      { id: 'vocao', name: 'Vồ Cào', cd: 7, do: 'dash', dist: 7, speed: 34, dmg: 200, stun: 0.2, icon: 'dash',
        desc: 'Vồ tới theo hướng ngắm, cào 200 sát thương và choáng nhẹ kẻ đầu tiên chạm phải.' },
      { id: 'giaprung', name: 'Giáp Rung', cd: 12, do: 'buff', armor: 0.4, dur: 3, icon: 'shell',
        desc: 'Thêm 40% giáp trong 3 giây. Sát thương giáp chặn được vẫn nạp rung động.' },
      { id: 'bungnangluong', name: 'Bung Năng Lượng', cd: 40, do: 'nova', windup: 0.4, radius: 6, dmg: 600, knock: 4, meterMul: true, icon: 'quake',
        desc: 'Lấy đà 0,4 giây rồi bung năng lượng quanh mình 600 sát thương và hất văng. Dồn hết rung động đang có: mỗi đầy thêm một lần sát thương.' },
    ],
  },
  luondien: {
    name: 'Lươn Điện', role: 'Xung kích', roleKey: 'assault', price: 1700, tint: 0x1d4f6b,
    blurb: 'Roi điện tích dần: đủ năm phát trúng, phát kế tiếp nhảy sang ba mục tiêu. Vùng điện bám người, Sấm Sét ưu tiên kẻ đã dính roi.',
    hp: 2500, speed: 6.3, radius: 0.8,
    armor: 0.05, accel: 1.3, turn: 14, towerMul: 1.0,
    passive: { do: 'meter', name: 'Tích Điện', desc: 'Mỗi phát roi trúng nạp một nấc, đủ 5 nấc thì phát trúng kế tiếp nhảy sang tối đa 3 địch gần đó (trong 6 m), mỗi kẻ chịu 70% sát thương.',
      max: 5, gain: { weapon: 1 }, spend: { kind: 'chain', n: 3, r: 6, mul: 0.7 } },
    weapon: { name: 'Roi Điện', cd: 0.25, dmg: 85, speed: 36, range: 12, r: 0.2, vis: 'bullet' },
    skills: [
      { id: 'luongdien', name: 'Luồng Điện', cd: 7, do: 'volley', n: 1, dmg: 260, speed: 40, range: 14, r: 0.3, pierce: true, slow: 0.25, slowDur: 1, vis: 'lance', icon: 'pierce',
        desc: 'Phóng luồng điện xuyên thấu 260 sát thương, làm chậm 25% trong 1 giây.' },
      { id: 'vungdien', name: 'Vùng Điện', cd: 13, do: 'zone', at: 'self', follow: true, radius: 4, dur: 4, dps: 180, vis: 'bastion', icon: 'storm',
        desc: 'Tỏa vùng điện bám theo bạn trong 4 giây: địch trong vòng 4 m mất 180 máu mỗi giây.' },
      { id: 'samset', name: 'Sấm Sét', cd: 42, do: 'barrage', n: 8, radius: 5, blast: 2, dmg: 330, delay: 0.4, span: 2, cast: 12, seek: { radius: 9, prefer: 'meterMark' }, fx: { chain: { n: 2, r: 5, mul: 0.5 } }, icon: 'barrage',
        desc: 'Tám tia sét giáng xuống kẻ địch quanh con trỏ (ưu tiên kẻ vừa dính roi điện, dư thì rải ngẫu nhiên), mỗi tia 330 sát thương và nhảy sang 2 địch gần đó.' },
    ],
  },
  tegiac: {
    name: 'Tê Giác', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1700, tint: 0xe8e2d0,
    blurb: 'Càng đánh càng bị đánh càng nóng; đầy thì chiêu kế tiếp nặng thêm 60%, máu thấp nóng nhanh gấp đôi. Đấm liên hoàn, nhảy dậm, rồi một cú đấm nghiêm túc.',
    hp: 3000, speed: 6.0, radius: 0.92,
    armor: 0.1, accel: 1.1, turn: 12, towerMul: 1.5,
    passive: { do: 'meter', name: 'Nổi Nóng', desc: 'Mỗi đòn trúng nạp 4 điểm, mỗi 1 máu mất nạp 0,03 điểm; đủ 100 thì chiêu gây sát thương kế tiếp mạnh thêm 60%. Dưới 40% máu nạp nhanh gấp đôi.',
      max: 100, gain: { hit: 4, hurt: 0.03 }, spend: { kind: 'skill', mul: 1.6 }, mods: { lowHp: { below: 0.4, gain: 2 } } },
    weapon: { name: 'Đấm Thẳng', cd: 0.6, dmg: 150, speed: 28, range: 6, r: 0.45, knock: 1, vis: 'slug' },
    skills: [
      { id: 'damlienhoan', name: 'Đấm Liên Hoàn', cd: 7, do: 'dash', dist: 5, speed: 34, dmg: 380, knock: 3, stop: true, icon: 'dash',
        desc: 'Lao tới và dừng ngay ở kẻ địch đầu tiên, giáng 380 sát thương và hất văng.' },
      { id: 'nhaydam', name: 'Nhảy Dậm', cd: 11, do: 'leap', cast: 9, flight: 0.5, radius: 3.5, dmg: 280, knock: 3, stun: 0.4, icon: 'leap',
        desc: 'Nhảy tới con trỏ (xa nhất 9 m), đáp xuống gây 280 sát thương, choáng 0,4 giây và hất văng.' },
      { id: 'cudamnghiemtuc', name: 'Cú Đấm Nghiêm Túc', cd: 50, do: 'beam', windup: 0.6, range: 18, width: 2.0, dmg: 1600, icon: 'beam',
        desc: 'Lấy đà 0,6 giây rồi tung cú đấm tạo luồng chấn động rộng 2 m dài 18 m, 1600 sát thương.' },
    ],
  },
  quaset: {
    name: 'Quạ Sét', role: 'Thọc sườn', roleKey: 'flanker', price: 1600, tint: 0x2a2350,
    blurb: 'Hai chiêu khác nhau trúng liền nhau hai lần là phát phi tiêu kế tiếp nặng gấp hơn hai lần và choáng. Lôi thiết, ảnh hoán ra sau lưng, giáp hộ mệnh biến phi tiêu thành ba mũi lao.',
    hp: 2150, speed: 7.2, radius: 0.76,
    armor: 0.03, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'meter', name: 'Liên Thuật', desc: 'Mỗi lần một đòn trúng khác nguồn với đòn trúng trước nạp một nấc (phi tiêu thường rồi chiêu, hay ngược lại). Đủ 2 nấc thì phi tiêu kế tiếp gây gấp 2,2 lần sát thương và choáng 0,5 giây.',
      max: 2, gain: { distinct: 1 }, spend: { kind: 'shot', mul: 2.2, stun: 0.5 } },
    weapon: { name: 'Phi Tiêu Sét', cd: 0.24, dmg: 56, speed: 36, range: 13, r: 0.18, vis: 'dart' },
    skills: [
      { id: 'loithiet', name: 'Lôi Thiết', cd: 9, do: 'dash', dist: 9, speed: 36, dmg: 340, stun: 0.5, stop: true, icon: 'dash',
        desc: 'Phóng như chớp tới kẻ địch đầu tiên trên đường và dừng ngay đó, 340 sát thương và choáng 0,5 giây.' },
      { id: 'anhhoan', name: 'Ảnh Hoán', cd: 10, do: 'warp', dist: 8, behind: { pick: 4 }, icon: 'warp',
        desc: 'Dịch chuyển tức thì tới con trỏ, xa nhất 8 m, qua được tường. Có địch gần con trỏ (trong 4 m) thì hiện ra ngay sau lưng nó.' },
      { id: 'giaphomenh', name: 'Giáp Hộ Mệnh', cd: 45, do: 'transform', dur: 6, shield: 900, weapon: { cd: 0.5, dmg: 220, n: 3, fan: 0.12, speed: 30, range: 15, r: 0.32, vis: 'lance' }, icon: 'shield',
        desc: 'Trong 6 giây khoác khiên 900 và phi tiêu hóa ba mũi lao xa 15 m, mỗi mũi 220 sát thương.' },
    ],
  },
  tumay: {
    name: 'Tư Mã Ý', role: 'Khống chế', roleKey: 'control', price: 1800, tint: 0x3a3550,
    blurb: 'Nhẫn nhịn: mỗi giây không bị đánh là thêm một nấc, đủ bốn nấc chiêu sát thương kế tiếp nặng thêm một nửa. Kim thiền thoát xác, màn đêm làm địch mù đường.',
    hp: 2550, speed: 5.9, radius: 0.82,
    armor: 0.06, accel: 1.0, turn: 11, towerMul: 1.0,
    passive: { do: 'meter', name: 'Ẩn Nhẫn', desc: 'Mỗi giây sau 2 giây không bị đánh nạp một nấc, đủ 4 nấc thì chiêu gây sát thương kế tiếp mạnh thêm 50%. Bị đánh là mất hết.',
      max: 4, gain: { calm: 1 }, spend: { kind: 'skill', mul: 1.5 }, resetOnHurt: true },
    weapon: { name: 'Hắc Cầu', cd: 0.45, dmg: 115, speed: 28, range: 13.5, r: 0.26, vis: 'pulse' },
    skills: [
      { id: 'amcau', name: 'Ám Cầu', cd: 7, do: 'volley', n: 1, dmg: 300, speed: 26, range: 14, r: 0.4, splash: 1.5, vis: 'pulse', fx: { reveal: 4 }, icon: 'magnet',
        desc: 'Ném quả cầu bóng tối nổ lan 1,5 m, 300 sát thương, kẻ trúng lộ diện 4 giây.' },
      { id: 'kimthien', name: 'Kim Thiền Thoát Xác', cd: 12, do: 'warp', dist: 7, leave: { hp: 500, dur: 5, blast: 3, dmg: 260 }, icon: 'mirage',
        desc: 'Dịch chuyển tức thì tới con trỏ, xa nhất 7 m, để lại một bản sao đứng yên 5 giây; bản sao vỡ hoặc hết giờ thì nổ 260 sát thương.' },
      { id: 'mandem', name: 'Màn Đêm', cd: 44, do: 'zone', at: 'target', cast: 14, radius: 6.5, dur: 5, dps: 190, blind: { range: 0.5, spread: 0.15 }, vis: 'smoke', icon: 'smoke',
        desc: 'Phủ màn đêm ở con trỏ trong 5 giây: địch trong đó mất 190 máu mỗi giây, đạn bắn ngắn đi một nửa và lệch hướng.' },
    ],
  },
};

export const MECH_ORDER = ['trau', 'soi', 'ung', 'hac', 'loi', 'bocap', 'bang', 'tho', 'thancong', 'mangxa', 'kimquy', 'hacho', 'holy', 'domdom', 'tacke', 'hoalong', 'khiphao', 'quancong', 'natra', 'duongtien', 'athena', 'hades', 'lubo', 'mucma', 'kynhong', 'nguma', 'sontinh', 'enbac', 'boica', 'bohung', 'cakiem', 'gilgamesh', 'buomdem', 'laclong', 'baogam', 'luondien', 'tegiac', 'quaset', 'tumay'];

// Bot tuning. aimErr: radians of aim noise; react: seconds before a new target is engaged;
// skill: chance per second to use a ready skill when it makes sense; lead: how well shots lead a moving target (0..1).
export const DIFFICULTY = {
  // foeDmg: damage multiplier of enemy bots in a solo match; foeLv: the share of the player's garage levels they get.
  easy:   { name: 'Dễ',   foeDmg: 0.65, foeLv: 0,   aimErr: 0.30, react: 0.75, skill: 0.25, lead: 0.2, focus: 0.3, retreat: 0.18, dodge: 0.0, fireDuty: 0.55 },
  normal: { name: 'Vừa',  foeDmg: 0.85, foeLv: 0.5, aimErr: 0.14, react: 0.40, skill: 0.6,  lead: 0.6, focus: 0.6, retreat: 0.28, dodge: 0.35, fireDuty: 0.8 },
  hard:   { name: 'Khó',  foeDmg: 1,    foeLv: 1,   aimErr: 0.05, react: 0.18, skill: 1.0,  lead: 0.95, focus: 1.0, retreat: 0.35, dodge: 0.8, fireDuty: 1 },
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
  { key: 'giap',   name: 'Vỏ giáp',   desc: 'Máu +13%, giáp +2,4% mỗi cấp',       hp: 0.13, armor: 0.024 },
  { key: 'dongco', name: 'Động cơ',   desc: 'Tốc độ +3%, gia tốc +6% mỗi cấp',    speed: 0.03, accel: 0.06 },
  { key: 'hoaluc', name: 'Hỏa lực',   desc: 'Sát thương +14% mỗi cấp',            dmg: 0.14 },
  { key: 'napdan', name: 'Nạp đạn',   desc: 'Bắn nhanh +5%, tầm bắn +2% mỗi cấp', rate: 0.05, range: 0.02 },
  { key: 'chieu',  name: 'Lõi chiêu', desc: 'Hồi chiêu nhanh hơn 5% mỗi cấp',     cd: 0.05 },
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
  khiphao: [perk('Pháo Đằm', 'Pháo Tép làm chậm hoặc làm yếu với 45% quả.', 'weapon', { fx: { chance: 0.45, pick: [{ slow: 0.35, slowDur: 1.5 }, { weaken: { mul: 0.8, dur: 2 } }] } }), perk('Bẫy Dày', 'Mìn của Chuồn Lẹ nổ 360.', 1, { onStart: { mine: { trigger: 2, blast: 3, dmg: 360, arm: 0.4, life: 8, fx: { slow: 0.4, slowDur: 1.5 } } } }), perk('Mười Sáu Quả', 'Hội Pháo Hoa dội 16 quả.', 2, { n: 16 })],
  quancong: [perk('Đao Dài', 'Đao Khí bay xa 8 m.', 'weapon', { range: 8 }), perk('Xung Mạnh', 'Xung Phong gây 260 và choáng 0,8 giây.', 0, { dmg: 260, stun: 0.8 }), perk('Án Trảm', 'Trảm Tướng kết liễu dưới 32% máu.', 2, { fx: { execute: 0.32 } })],
  natra: [perk('Vòng Lớn', 'Càn Khôn Quyển gây 260.', 0, { dmg: 260 }), perk('Bánh Xe Dài', 'Phong Hỏa Luân lao xa 11 m.', 1, { dist: 11 }), perk('Giáng Mạnh', 'Thiên Giáng rộng 4 m, gây 760.', 2, { radius: 4, dmg: 760 })],
  duongtien: [perk('Tiêm Sâu', 'Tam Tiêm Đao làm lộ điểm yếu 22% trong 5 giây.', 0, { fx: { amp: { amp: 0.22, dur: 5 } } }), perk('Khuyển Nhanh', 'Hao Thiên Khuyển chạy nhanh hơn, nổ 320.', 1, { seek: { speed: 10.5, range: 16 }, dmg: 320 }), perk('Mắt Tinh', 'Thần Nhãn Truy Kích gây 1500, lấy đà 0,65 giây.', 2, { dmg: 1500, windup: 0.65 })],
  athena: [perk('Khiên Nặng', 'Khiên Bay gây 300.', 0, { dmg: 300 }), perk('Khiên Dày', 'Khiên Thần hấp thụ 750.', 1, { shield: 750 }), perk('Kết Giới Bền', 'Kết Giới kéo dài 6,5 giây, hồi 350.', 2, { dur: 6.5, heal: 350 })],
  hades: [perk('Ám Lưu Sâu', 'Ám Lưu làm chậm 50% trong 2,2 giây.', 0, { slow: 0.5, slowDur: 2.2 }), perk('Tay Dài', 'Bàn Tay Âm Giới giữ chân 2 giây, rộng 3,6 m.', 1, { blast: 3.6, fx: { root: 2 } }), perk('Cửa Rộng', 'Cửa Âm Phủ rộng 7,5 m, kéo dài 5 giây.', 2, { radius: 7.5, dur: 5 })],
  lubo: [perk('Kích Dài', 'Phương Thiên Kích với xa 9 m.', 'weapon', { range: 9 }), perk('Tam Đột', 'Đột Kích lao được ba lần liền, trong 3,5 giây.', 0, { recast: { n: 3, window: 3.5 } }), perk('Thần Uy', 'Chiến Thần kéo dài 8 giây, hồi 40% máu đã mất.', 2, { dur: 8, heal: 0.4 })],
  mucma: [perk('Bốn Xúc Tu', 'Xúc Tu bắn bốn đường.', 'weapon', { n: 4, fan: 0.12 }), perk('Xuyên Sâu', 'Xuyên Thân lao xa 9,5 m, gây 260.', 1, { dist: 9.5, dmg: 260 }), perk('Ma Dài', 'Hóa Ma kéo dài 8 giây, hút máu 45%.', 2, { dur: 8, lifesteal: 0.45 })],
  kynhong: [perk('Lửa Dai', 'Hỏa Quyền thiêu 26 mỗi giây mỗi tầng.', 'weapon', { fx: { burn: { dps: 26, dur: 3, max: 4 } } }), perk('Bảy Luồng Lửa', 'Hỏa Long Khiếu phun bảy luồng.', 0, { n: 7 }), perk('Long Uy', 'Long Hóa kéo dài 6,5 giây.', 2, { dur: 6.5 })],
  nguma: [perk('Rìu Nặng', 'Rìu Chấn gây 290.', 'weapon', { dmg: 290 }), perk('Húc Xa', 'Húc Ma lao xa 11 m và choáng 0,7 giây.', 1, { dist: 11, stun: 0.7 }), perk('Pháp Tướng Lớn', 'Pháp Tướng to hơn 50%, chấn động rộng 7 m gây 500.', 2, { size: 1.5, nova: { windup: 0.3, radius: 7, dmg: 500, stun: 1.3 } })],
  sontinh: [perk('Đá Nặng', 'Đá Lăn gây 300, nổ lan 2,6 m.', 'weapon', { dmg: 300, splash: 2.6 }), perk('Bảy Khối Đá', 'Vách Đá dựng bảy khối.', 0, { n: 7 }), perk('Tám Tảng Non', 'Dời Non rơi tám tảng, mỗi tảng 560.', 2, { n: 8, dmg: 560 })],
  enbac: [perk('Thương Xa', 'Song Thương bắn xa 15 m.', 'weapon', { range: 15 }), perk('Ba Tên Lửa', 'Loạt Kép bắn ba quả.', 0, { n: 3 }), perk('Mưa Dài', 'Mưa Đạn Trời kéo dài 4 giây.', 2, { channel: { dur: 4, every: 0.2, move: 0.8 } })],
  boica: [perk('Nòng Sắc', 'Súng Lặn gây 390.', 'weapon', { dmg: 390 }), perk('Bẫy Bền', 'Bẫy Cảnh Giới làm chậm 60% trong 3 giây, lộ diện 7 giây, tồn tại 45 giây.', 1, { fx: { slow: 0.6, slowDur: 3, reveal: 7 }, life: 45 }), perk('Tia Chí Mạng', 'Khóa Mục Tiêu gây 2400, lấy đà 0,9 giây.', 2, { dmg: 2400, windup: 0.9 })],
  bohung: [perk('Lõi Nặng', 'Pháo Lõi gây 180.', 'weapon', { dmg: 180 }), perk('Khiên Dội', 'Lá Chắn Nổ nổ rộng 5,5 m, gây 420.', 1, { burst: { radius: 5.5, dmg: 420, knock: 2 } }), perk('Hóa Thân Lớn', 'Thăng Hóa kéo dài 9 giây, to hơn 30%.', 2, { dur: 9, size: 1.3 })],
  cakiem: [perk('Đao Dài', 'Tam Đao bay xa 8,5 m.', 'weapon', { range: 8.5 }), perk('Ba Vòng Lốc', 'Lốc Kiếm xoay ba vòng.', 1, { repeat: 3 }), perk('Tia Rộng', 'Nhất Đao rộng 2 m, gây 1200.', 2, { width: 2, dmg: 1200 })],
  gilgamesh: [perk('Bảo Khí Nặng', 'Bảo Khí gây 210.', 'weapon', { dmg: 210 }), perk('Lồng Vững', 'Phong Tỏa rộng 5,2 m, kéo dài 4 giây, mất 90 máu mỗi giây.', 1, { radius: 5.2, dur: 4, dps: 90 }), perk('Mười Bốn Cổng', 'Cổng Kho Báu dội 14 quả, mỗi quả 400.', 2, { n: 14, dmg: 400 })],
  buomdem: [perk('Tia Dài', 'Tia Bùa gây 420, bay xa 19 m.', 0, { dmg: 420, range: 19 }), perk('Cổng Nổ', 'Cổng Ảo xa 10 m, nổ rộng 3,6 m gây 300.', 1, { dist: 10, land: { radius: 3.6, dmg: 300, slow: 0.3, slowDur: 1.5 } }), perk('Kết Giới Rộng', 'Kết Giới Đa Chiều rộng 7 m, kéo dài 7 giây.', 2, { radius: 7, dur: 7 })],
  laclong: [perk('Thủy Pháo Nặng', 'Thủy Pháo gây 210, nổ lan 2,4 m.', 'weapon', { dmg: 210, splash: 2.4 }), perk('Xoáy Mạnh', 'Xoáy Nước rộng 6 m, làm chậm 50%, đồng đội nhanh thêm 40%.', 1, { radius: 6, slow: 0.5, haste: 1.4 }), perk('Giá Lâm Xa', 'Long Quân Giá Lâm lao xa 18 m, gây 480.', 2, { dist: 18, dmg: 480 })],
  baogam: [perk('Ba Vuốt', 'Vuốt Rung bắn ba đường.', 'weapon', { n: 3, fan: 0.08 }), perk('Giáp Dày', 'Giáp Rung thêm 50% giáp, kéo dài 4 giây.', 1, { armor: 0.5, dur: 4 }), perk('Bung Rộng', 'Bung Năng Lượng rộng 7 m, gây 720.', 2, { radius: 7, dmg: 720 })],
  luondien: [perk('Roi Dài', 'Roi Điện bắn xa 14 m.', 'weapon', { range: 14 }), perk('Vùng Mạnh', 'Vùng Điện rộng 4,8 m, thiêu 230 mỗi giây.', 1, { radius: 4.8, dps: 230 }), perk('Mười Một Tia Sét', 'Sấm Sét giáng 11 tia, mỗi tia 380.', 2, { n: 11, dmg: 380 })],
  tegiac: [perk('Nắm Đấm Nặng', 'Đấm Thẳng gây 190.', 'weapon', { dmg: 190 }), perk('Dậm Mạnh', 'Nhảy Dậm rộng 4,2 m, gây 340, choáng 0,7 giây.', 1, { radius: 4.2, dmg: 340, stun: 0.7 }), perk('Chấn Động Rộng', 'Cú Đấm Nghiêm Túc rộng 2,6 m, gây 2000.', 2, { width: 2.6, dmg: 2000 })],
  quaset: [perk('Tiêu Xa', 'Phi Tiêu Sét bay xa 15 m.', 'weapon', { range: 15 }), perk('Lôi Xa', 'Lôi Thiết lao xa 11 m, gây 420.', 0, { dist: 11, dmg: 420 }), perk('Giáp Dày', 'Giáp Hộ Mệnh khiên 1200, kéo dài 8 giây.', 2, { shield: 1200, dur: 8 })],
  tumay: [perk('Cầu Nặng', 'Hắc Cầu gây 135.', 'weapon', { dmg: 135 }), perk('Xác Bền', 'Bản sao của Kim Thiền Thoát Xác 700 máu, nổ 360 rộng 3,6 m, ở lại 6 giây.', 1, { leave: { hp: 700, dur: 6, blast: 3.6, dmg: 360 } }), perk('Đêm Dài', 'Màn Đêm rộng 7,5 m, kéo dài 7 giây, đạn lệch nhiều hơn.', 2, { radius: 7.5, dur: 7, blind: { range: 0.4, spread: 0.2 } })],
};

// The row a unit actually plays: the MECHS row with its upgrade levels and unlocked perks applied.
// Both ends of an online match build it from the same (key, lv), so nothing of it travels.
const DEF_CACHE = new Map();
export function buildDef(key, lv) {
  const base = MECHS[key];
  lv = cleanLv(lv);
  const id = key + ':' + lv.join('');
  if (DEF_CACHE.has(id)) return DEF_CACHE.get(id);
  const [g, d, h, n, c] = lv, [TG, TD, TH, TN, TC] = TRACKS;
  const weapon = { ...base.weapon }, skills = base.skills.map((s) => ({ ...s }));
  (PERKS[key] || []).slice(0, perkCount(lv)).forEach((p) => Object.assign(p.slot === 'weapon' ? weapon : skills[p.slot], p.patch));
  weapon.cd /= 1 + TN.rate * n;
  weapon.range *= 1 + TN.range * n;
  if (weapon.charge) weapon.charge = { ...weapon.charge, range: weapon.charge.range.map((r) => r * (1 + TN.range * n)) };
  for (const s of skills) s.cd *= 1 - TC.cd * c;
  // transform.weapon: the weapon row a transform swaps in, built here so both ends of an online match agree
  const tfWeapon = {};
  skills.forEach((s, i) => { if (s.do === 'transform' && s.weapon) tfWeapon[i] = { ...weapon, ...s.weapon }; });
  const def = { ...base, base, lv, weapon, skills, tfWeapon, hp: Math.round(base.hp * (1 + TG.hp * g)), armor: (base.armor || 0) + TG.armor * g,
    speed: base.speed * (1 + TD.speed * d), accel: (base.accel || 1) * (1 + TD.accel * d), dmgUp: 1 + TH.dmg * h };
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
