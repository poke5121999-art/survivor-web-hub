// Every tunable of the game lives here as a table. Units: metres, seconds, hit points.
// The simulation (sim.js) reads these rows; nothing in this file touches three.js.

export const TICK = 1 / 30;

export const TEAMS = [
  { id: 0, name: 'Lam', color: 0x35b8ff, css: '#35b8ff' },
  { id: 1, name: 'Hỏa', color: 0xff5a36, css: '#ff5a36' },
];

export const RULES = {
  target: 25, duration: 300, respawn: 5, spawnGuard: 2.5,
  baseRadius: 6.5, baseRegen: 0.12, baseBurn: 420,
  regenDelay: 7, regen: 0.025,
  assistWindow: 7, revealOnFire: 1.2, bushSight: 3.4,
  healItem: { cd: 24, frac: 0.38, dur: 2.2 },
  lava: { dps: 380 }, ice: { grip: 2.2 }, vent: { period: 6, warn: 1.3, dmg: 520 },
  crate: { first: 12, every: [15, 22], fall: 3.2, max: 3, life: 40, radius: 1.5 },
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
    hp: 3400, speed: 5.1, radius: 1.2,
    weapon: { name: 'Pháo Búa', cd: 0.95, dmg: 250, speed: 27, range: 15, splash: 2.2, knock: 2.5, r: 0.34, vis: 'shell' },
    skills: [
      { id: 'giap', name: 'Giáp Phản Lực', cd: 12, do: 'shield', amount: 1000, dur: 4.5, icon: 'shield',
        desc: 'Bật khiên năng lượng hấp thụ 1000 sát thương trong 4,5 giây.' },
      { id: 'huc', name: 'Húc Thép', cd: 10, do: 'dash', dist: 8.5, speed: 27, dmg: 240, stun: 0.9, knock: 4, icon: 'dash',
        desc: 'Lao thẳng theo hướng ngắm, húc trúng ai thì gây sát thương và làm choáng.' },
      { id: 'diachan', name: 'Địa Chấn', cd: 38, do: 'nova', windup: 0.75, radius: 6.5, dmg: 520, slow: 0.5, slowDur: 3, knock: 3, icon: 'quake',
        desc: 'Dậm nát mặt đất: sau một nhịp lấy đà, mọi kẻ địch quanh bạn chịu sát thương lớn và bị làm chậm.' },
    ],
  },
  soi: {
    name: 'Sói Lửa', role: 'Xung kích', roleKey: 'assault', price: 0, tint: 0xd9843a,
    blurb: 'Hai nòng liên thanh, cơ động. Áp sát, xả đạn rồi rút.',
    hp: 2500, speed: 6.5, radius: 1.0,
    weapon: { name: 'Liên Thanh Đôi', cd: 0.16, dmg: 60, speed: 34, range: 13.5, spread: 0.05, r: 0.2, vis: 'bullet', alt: 0.42 },
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
    hp: 1700, speed: 6.0, radius: 0.95,
    weapon: { name: 'Súng Ray', cd: 1.5, dmg: 390, speed: 62, range: 23, r: 0.2, vis: 'rail' },
    skills: [
      { id: 'min', name: 'Mìn Xung Điện', cd: 11, do: 'mine', trigger: 2.1, blast: 3, dmg: 260, stun: 1.2, arm: 0.8, life: 35, cast: 9, icon: 'mine',
        desc: 'Ném một quả mìn tới con trỏ. Địch chạm vào bị giật choáng.' },
      { id: 'luot', name: 'Lướt Bóng', cd: 11, do: 'blink', dist: 7, speed: 30, stealth: 2.2, icon: 'blink',
        desc: 'Lướt nhanh theo hướng đang đi (hoặc lùi lại) rồi tàng hình 2,2 giây.' },
      { id: 'tia', name: 'Tia Xuyên Phá', cd: 44, do: 'beam', windup: 0.9, range: 30, width: 1.1, dmg: 950, icon: 'beam',
        desc: 'Nạp năng lượng rồi bắn một tia xuyên qua mọi kẻ địch trên đường thẳng. Tường vẫn chặn được.' },
    ],
  },
  hac: {
    name: 'Bạch Hạc', role: 'Hỗ trợ', roleKey: 'support', price: 0, tint: 0x59c9a5,
    blurb: 'Hồi máu, làm chậm và dựng vòm chắn đạn cho cả đội.',
    hp: 2300, speed: 6.2, radius: 1.0,
    weapon: { name: 'Xung Quang', cd: 0.32, dmg: 100, speed: 30, range: 14, r: 0.26, vis: 'pulse' },
    skills: [
      { id: 'hoiphuc', name: 'Suối Hồi Phục', cd: 13, do: 'zone', at: 'self', radius: 5, dur: 4.5, hps: 150, vis: 'heal', icon: 'heal',
        desc: 'Tạo vùng hồi 150 máu mỗi giây cho đồng đội đứng trong, kéo dài 4,5 giây.' },
      { id: 'truongcham', name: 'Trường Trì Trệ', cd: 12, do: 'zone', at: 'target', cast: 13, radius: 4.5, dur: 4, dps: 45, slow: 0.45, vis: 'slow', icon: 'slow',
        desc: 'Ném một trường năng lượng tới con trỏ: địch bên trong bị chậm 45% và mất máu dần.' },
      { id: 'vom', name: 'Vòm Bảo Hộ', cd: 48, do: 'dome', radius: 6, dur: 5.5, shield: 600, heal: 450, icon: 'dome',
        desc: 'Dựng vòm chặn mọi đạn địch bay vào trong 5,5 giây, đồng đội trong vòm được hồi máu và nhận khiên.' },
    ],
  },
  loi: {
    name: 'Lôi Công', role: 'Pháo kích', roleKey: 'artillery', price: 900, tint: 0x9aa03a,
    blurb: 'Cối bắn vòng qua tường. Đứng sau đồng đội, dội đạn vào chỗ địch tụ lại.',
    hp: 1900, speed: 5.5, radius: 1.05,
    weapon: { name: 'Cối Sấm', cd: 1.6, dmg: 300, lob: true, flight: 0.85, range: 17, splash: 2.7, vis: 'mortar' },
    skills: [
      { id: 'khoi', name: 'Màn Khói', cd: 14, do: 'zone', at: 'target', cast: 12, radius: 4.6, dur: 5.5, hide: true, vis: 'smoke', icon: 'smoke',
        desc: 'Ném bom khói tới con trỏ. Ai đứng trong khói đều ẩn mình như nấp bụi.' },
      { id: 'giatlui', name: 'Giật Lùi', cd: 10, do: 'recoil', dist: 7, speed: 26, radius: 3.5, dmg: 160, knock: 4, icon: 'recoil',
        desc: 'Nổ một phát dưới chân hất văng địch ở gần, còn bạn bật lùi ra xa.' },
      { id: 'thienloi', name: 'Thiên Lôi', cd: 45, do: 'barrage', line: true, n: 5, gap: 3.2, radius: 7, blast: 3.2, dmg: 420, delay: 0.8, span: 1.2, cast: 20, icon: 'storm',
        desc: 'Năm quả đạn lớn rơi thành một hàng dọc theo hướng ngắm, tâm ở con trỏ.' },
    ],
  },
  bocap: {
    name: 'Bọ Cạp', role: 'Thọc sườn', roleKey: 'flanker', price: 900, tint: 0x6a5acd,
    blurb: 'Nhanh nhất đấu trường, súng chùm tầm ngắn. Vòng ra sau, kết liễu kẻ yếu máu rồi biến mất.',
    hp: 2200, speed: 7.3, radius: 0.95,
    weapon: { name: 'Súng Chùm', cd: 0.72, dmg: 62, n: 5, fan: 0.09, speed: 30, range: 9, r: 0.18, vis: 'pellet' },
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
    hp: 2700, speed: 5.8, radius: 1.05,
    weapon: { name: 'Gai Băng', cd: 0.36, dmg: 88, speed: 28, range: 13, r: 0.24, slow: 0.2, slowDur: 1.2, vis: 'frost' },
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
    hp: 2700, speed: 5.6, radius: 1.1,
    weapon: { name: 'Súng Đinh', cd: 0.45, dmg: 118, speed: 32, range: 12.5, r: 0.22, vis: 'rivet' },
    skills: [
      { id: 'usung', name: 'Ụ Súng', cd: 15, do: 'turret', cast: 5, hp: 800, dur: 18, range: 11, dmg: 55, rate: 0.3, icon: 'turret',
        desc: 'Đặt một ụ súng tự ngắm bắn kẻ địch trong tầm suốt 18 giây. Địch bắn vỡ được.' },
      { id: 'hotu', name: 'Hố Từ', cd: 13, do: 'zone', at: 'target', cast: 12, radius: 4.5, dur: 3, pull: 5, dps: 40, vis: 'magnet', icon: 'magnet',
        desc: 'Mở một hố từ trường ở con trỏ, kéo mọi kẻ địch trong vùng về tâm trong 3 giây.' },
      { id: 'baimin', name: 'Bãi Mìn', cd: 42, do: 'minefield', n: 5, radius: 4.5, cast: 13, trigger: 2.0, blast: 3, dmg: 300, stun: 1.0, arm: 0.7, life: 30, icon: 'mines',
        desc: 'Rải năm quả mìn quanh con trỏ. Địch chạm vào bị nổ và choáng 1 giây.' },
    ],
  },
};

export const MECH_ORDER = ['trau', 'soi', 'ung', 'hac', 'loi', 'bocap', 'bang', 'tho'];

// Bot tuning. aimErr: radians of aim noise; react: seconds before a new target is engaged;
// skill: chance per second to use a ready skill when it makes sense; lead: how well shots lead a moving target (0..1).
export const DIFFICULTY = {
  easy:   { name: 'Dễ',   aimErr: 0.30, react: 0.75, skill: 0.25, lead: 0.2, focus: 0.3, retreat: 0.18, dodge: 0.0, fireDuty: 0.55 },
  normal: { name: 'Vừa',  aimErr: 0.14, react: 0.40, skill: 0.6,  lead: 0.6, focus: 0.6, retreat: 0.28, dodge: 0.35, fireDuty: 0.8 },
  hard:   { name: 'Khó',  aimErr: 0.05, react: 0.18, skill: 1.0,  lead: 0.95, focus: 1.0, retreat: 0.35, dodge: 0.8, fireDuty: 1 },
};

export const BOT_NAMES = ['Tí Sắt', 'Mèo Mun', 'Cò Lả', 'Bão Số 9', 'Ông Kẹ', 'Chuồn Kim', 'Gió Chướng', 'Nắp Chai', 'Bánh Tét', 'Sấm Rền',
  'Lúa Non', 'Đá Cuội', 'Chớp Bể', 'Mưa Nguồn', 'Cua Đồng', 'Tre Già', 'Bụi Đời', 'Sao Hôm', 'Kiến Lửa', 'Vịt Bầu'];

export const REWARDS = { win: 120, lose: 60, draw: 80, perKill: 8, perAssist: 4, mvp: 40, xpWin: 100, xpLose: 60, xpPerKill: 5 };
export const levelXp = (level) => 200 + (level - 1) * 120;

// Destructible props. Barrels explode when destroyed and hurt the destroyer's enemies.
export const PROPS = {
  crate:  { hp: 320, r: 0.8 },
  barrel: { hp: 110, r: 0.6, blast: { radius: 3.6, dmg: 360, knock: 3 } },
  pot:    { hp: 50,  r: 0.5 },
};

// Garage. Each upgrade level adds hp and damage to that mech for its owner; cost(level) is the price of going from level to level + 1.
export const UPGRADE = { max: 5, hp: 0.04, dmg: 0.04, cost: (level) => 150 + level * 120 };
export const upgradeMods = (level) => ({ hp: 1 + UPGRADE.hp * level, dmg: 1 + UPGRADE.dmg * level });

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

// Rank by trophies: a win gives trophies.win, a loss takes trophies.lose (never below 0).
export const TROPHIES = { win: 22, lose: 12, draw: 4 };
export const RANKS = [
  { name: 'Sắt', min: 0, color: '#8d98a6' }, { name: 'Đồng', min: 100, color: '#c98a52' }, { name: 'Bạc', min: 250, color: '#cfd8e2' },
  { name: 'Vàng', min: 450, color: '#f2b632' }, { name: 'Bạch Kim', min: 700, color: '#7ee0d2' }, { name: 'Kim Cương', min: 1000, color: '#7fb8ff' },
];

// Game modes. tdm: team kills. chiem: hold control points for score. tudo: free-for-all, every mech is its own team.
// trum: five players against one boss, with a shared pool of lives.
export const MODES = {
  tdm:   { name: 'Đấu đội', blurb: 'Đội nào hạ gục 25 lần trước thì thắng.', target: 25, duration: 300, mission: 'Hạ gục đối thủ, đội nào chạm {target} điểm trước sẽ thắng' },
  chiem: { name: 'Chiếm điểm', blurb: 'Giữ ba cứ điểm để tích điểm. Hạ gục không tính điểm, chỉ mở đường.', target: 200, duration: 360, mission: 'Đứng trong vòng để chiếm cứ điểm, đội nào đủ {target} điểm trước sẽ thắng',
           radius: 4.6, captureTime: 4, every: 2.5 },
  tudo:  { name: 'Hỗn chiến', blurb: 'Mười cỗ máy, không đồng đội. Ai hạ gục 10 lần trước thì thắng.', target: 10, duration: 300, mission: 'Không có đồng đội: hạ gục {target} lần trước mọi người' },
  trum:  { name: 'Săn trùm', blurb: 'Năm người hợp sức hạ Cự Thần trước khi dùng hết 12 mạng.', target: 1, duration: 360, mission: 'Hạ Cự Thần trước khi cả đội dùng hết {lives} mạng', lives: 12 },
};
export const MODE_ORDER = ['tdm', 'chiem', 'tudo', 'trum'];

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
