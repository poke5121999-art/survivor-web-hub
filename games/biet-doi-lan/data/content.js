/*
 * Biệt Đội Lặn — bảng nội dung của sảnh (BDL.content) và sổ đồ nghề dùng chung với trong ca (BDL.ITEMS).
 *
 * Số lấy từ bản Unity: D:\REPO_Meta\gamespark-config\*.json (xuất 2026-09-29), KHÔNG lấy từ bản web
 * repo-squad (30 cấp, trang bị, tiến hoá, băng gacha trang bị). Chỗ nào lệch Unity thì có chú thích
 * "LỆCH UNITY" ngay tại chỗ.
 *
 * Tệp này là DỮ LIỆU thuần: không đọc DOM, không đụng localStorage.
 */
(function (root) {
  'use strict';

  const BDL = root.BDL = root.BDL || {};

  // ---------------------------------------------------------------------------
  // Ví. Bản Unity chỉ còn ba loại: vàng, ngọc, vé xác (không còn lõi, vé đồ).
  // ---------------------------------------------------------------------------
  const wallet = {
    keys: ['gold', 'gem', 'ticketX'],
    label: { gold: 'Vàng', gem: 'Ngọc', ticketX: 'Vé Xác' },
    icon: { gold: '🪙', gem: '💎', ticketX: '🎫' }
  };
  // wallet_start.json
  const walletStart = { gold: 5000, gem: 1200, ticketX: 3, crew: ['bao'], mateTactics: ['loot', 'thu', 'soi', 'baoke'] };

  // run_reward.json: vàng sảnh = giá trị đã giao trên thuyền x 0,55.
  const runReward = { lootGoldRate: 0.55 };

  // ---------------------------------------------------------------------------
  // Độ hiếm
  // ---------------------------------------------------------------------------
  const rarity = {
    3: { star: 3, name: 'Thường', color: '#7f97ad' },
    4: { star: 4, name: 'Kỳ Cựu', color: '#a678d8' },
    5: { star: 5, name: 'Huyền Thoại', color: '#e0a53c' }
  };

  // ---------------------------------------------------------------------------
  // CREW — 14 người, số chỉ số/kỹ năng lấy y nguyên crew.json. Mã id giữ mã cũ vì tên tệp hình ở
  // games/repo2d/art/crew/<id>.png dùng đúng mã đó.
  // Lời mô tả kỹ năng viết lại cho dưới nước; cd/dur/radius/... giữ nguyên số.
  // atkR/atkCd là tầm và nhịp đánh của bản trên cạn, giữ lại cho đủ cột dữ liệu.
  // ---------------------------------------------------------------------------
  const crew = [
    { id: 'bao', name: 'Flare', epithet: 'Đèn Pin', star: 3, hue: 48,
      hp: 105, atk: 9, spd: 1.00, carry: 32, grit: 0, atkR: 1.9, atkCd: 0.85,
      skill: { id: 'flash', name: 'Chói Loà', cd: 16, dur: 3, radius: 5.5,
        desc: 'Chớp sáng làm lóa cá dữ: mọi con trong 5,5 m đứng yên 3 giây và quên mục tiêu.' } },
    { id: 'hue', name: 'Halo', epithet: 'Y Tá Ca Ba', star: 3, hue: 140,
      hp: 120, atk: 7, spd: 0.97, carry: 28, grit: 0.05, atkR: 1.8, atkCd: 0.95,
      skill: { id: 'healring', name: 'Vòng O₂', cd: 20, dur: 6, radius: 4.2, heal: 9,
        desc: 'Thả vòng bong bóng khí: ai bơi trong 4,2 m hồi 9 O₂ mỗi giây suốt 6 giây.' } },
    { id: 'tam', name: 'Atlas', epithet: 'Cửu Vạn', star: 3, hue: 25,
      hp: 135, atk: 8, spd: 0.94, carry: 46, grit: 0.10, atkR: 1.7, atkCd: 1.0,
      skill: { id: 'gong', name: 'Chiêng Dụ', cd: 18, dur: 8,
        desc: 'Gõ chiêng dưới nước: cá dữ quanh đó bị dụ kéo về một chỗ suốt 8 giây.' } },
    { id: 'ky', name: 'Pick', epithet: 'Thợ Khoá', star: 3, hue: 200,
      hp: 100, atk: 10, spd: 1.02, carry: 30, grit: 0, atkR: 2.0, atkCd: 0.8,
      skill: { id: 'unlock', name: 'Mở Toang', cd: 22, radius: 9,
        desc: 'Mở nhanh mọi rương và két dưới đáy trong 9 m, kể cả cái bạn chưa nhìn thấy.' } },

    { id: 'linh', name: 'Shade', epithet: 'Bóng Đêm', star: 4, hue: 275,
      hp: 96, atk: 12, spd: 1.08, carry: 30, grit: 0, atkR: 1.9, atkCd: 0.7,
      skill: { id: 'vanish', name: 'Tàng Hình', cd: 24, dur: 6,
        desc: 'Tàng hình 6 giây: quái không nhìn thấy, không nghe thấy bạn.' } },
    { id: 'dung', name: 'Quake', epithet: 'Xà Beng', star: 4, hue: 8,
      hp: 150, atk: 16, spd: 0.95, carry: 40, grit: 0.14, atkR: 2.1, atkCd: 1.05,
      skill: { id: 'shock', name: 'Sóng Chấn', cd: 17, radius: 5, dmg: 72, stun: 2.2,
        desc: 'Phát sóng chấn: cá dữ trong 5 m bị đẩy văng, choáng 2,2 giây và ăn 72 sát thương.' } },
    { id: 'mai', name: 'Lure', epithet: 'Tay Nhử', star: 4, hue: 320,
      hp: 104, atk: 11, spd: 1.05, carry: 30, grit: 0, atkR: 2.2, atkCd: 0.75,
      skill: { id: 'decoy', name: 'Mồi Cá Mập', cd: 19, dur: 9, radius: 16,
        desc: 'Thả mồi nhử: cá mập trong 16 m bỏ mục tiêu và bơi về chỗ mồi suốt 9 giây.' } },
    { id: 'phuc', name: 'Hook', epithet: 'Cứu Hộ', star: 4, hue: 96,
      hp: 128, atk: 10, spd: 1.02, carry: 34, grit: 0.08, atkR: 1.8, atkCd: 0.9,
      skill: { id: 'rescue', name: 'Kéo Về', cd: 26,
        desc: 'Giật mọi món đồ đang chìm bay về phía bạn trước khi rơi mất.' } },
    { id: 'son', name: 'Barb', epithet: 'Kẽm Gai', star: 4, hue: 178,
      hp: 140, atk: 9, spd: 0.96, carry: 36, grit: 0.16, atkR: 1.7, atkCd: 1.0,
      skill: { id: 'cage', name: 'Lồng Giam', cd: 21, dur: 9,
        desc: 'Dựng lồng sắt nhốt một con quái trong 9 giây.' } },

    { id: 'nga', name: 'Blink', epithet: 'Chớp Giật', star: 5, hue: 190,
      hp: 112, atk: 18, spd: 1.12, carry: 34, grit: 0.05, atkR: 2.2, atkCd: 0.62,
      skill: { id: 'blink', name: 'Lướt', cd: 12, dist: 6.5,
        desc: 'Lướt tức thời 6,5 m theo hướng đang bơi.' } },
    { id: 'khoi', name: 'Oracle', epithet: 'Mắt Thần', star: 5, hue: 55,
      hp: 108, atk: 15, spd: 1.04, carry: 32, grit: 0.05, atkR: 2.6, atkCd: 0.72,
      skill: { id: 'reveal', name: 'Soi Thấu', cd: 25, dur: 12,
        desc: 'Soi thấy đồ cổ và quái qua vách đá suốt 12 giây.' } },
    { id: 'van', name: 'Frost', epithet: 'Kho Lạnh', star: 5, hue: 205,
      hp: 116, atk: 17, spd: 1.03, carry: 32, grit: 0.06, atkR: 2.4, atkCd: 0.75,
      skill: { id: 'freeze', name: 'Đóng Băng', cd: 23, dur: 4.5, radius: 8,
        desc: 'Đóng băng nước quanh bạn trong 8 m: cá dữ bị giữ đứng yên 4,5 giây.' } },
    { id: 'hai', name: 'Magnet', epithet: 'Từ Trường', star: 5, hue: 285,
      hp: 110, atk: 14, spd: 1.02, carry: 44, grit: 0.05, atkR: 2.3, atkCd: 0.8,
      skill: { id: 'pull', name: 'Nam Châm', cd: 20, radius: 11,
        desc: 'Nam châm kéo mọi món đồ cổ trong 11 m bay về phía bạn.' } },
    { id: 'tuyet', name: 'Seraph', epithet: 'Bất Tử', star: 5, hue: 350,
      hp: 125, atk: 16, spd: 1.05, carry: 34, grit: 0.10, atkR: 2.2, atkCd: 0.78,
      skill: { id: 'angel', name: 'Thiên Thần', cd: 30, dur: 5,
        desc: 'Bất tử 5 giây: đòn nào trúng cũng không trừ O₂.' } }
  ];
  const crewById = {};
  crew.forEach(c => { crewById[c.id] = c; });

  // ---------------------------------------------------------------------------
  // NỘI TẠI — mở ở cấp passiveAtLevel (10). Số lấy từ passives.json, chữ viết lại cho dưới nước.
  // `vals` để game trong ca đọc đúng con số, không phải bóc từ chữ.
  // ---------------------------------------------------------------------------
  const passives = {
    bao:   { name: 'Đèn Bền',   vals: { sang: 0.4 },
             desc: 'Vùng nước đèn đã soi qua giữ sáng lâu hơn 40%.' },
    hue:   { name: 'Băng Gạc',  vals: { heal: 1, range: 1.5 },
             desc: 'Đồng đội trong 1,5 m quanh bạn hồi 1 O₂ mỗi giây.' },
    tam:   { name: 'Vai U',     vals: { phat: 0.7 },
             desc: 'Đồ cổ nặng chỉ ăn 70% mức phạt tốc độ bơi.' },
    ky:    { name: 'Tay Nghề',  vals: { pry: 2 },
             desc: 'Mở rương và két dưới đáy nhanh gấp đôi.' },
    linh:  { name: 'Bơi Êm',    vals: { noise: 0.5, floor: 0.1 },
             desc: 'Tiếng động khi bơi chỉ còn một nửa.' },
    dung:  { name: 'Lì Đòn',    vals: { retain: 1 },
             desc: 'Bị cá dữ đớp thì món đang kéo không mất giá.' },
    mai:   { name: 'Tai Thính', vals: { range: 8 },
             desc: 'Nghe thấy cá dữ ở xa thêm 8 m và chấm lên bản đồ.' },
    phuc:  { name: 'Kéo Lê',    vals: { be: 2 },
             desc: 'Đồ cổ đặt lên boong thuyền được tính giá nhanh gấp đôi.' },
    son:   { name: 'Chắn',      vals: { reduce: 0.08, range: 2, max: 0.5 },
             desc: 'Bớt 8% sát thương cho đồng đội trong 2 m quanh bạn.' },
    nga:   { name: 'Bước Hụt',  vals: { base: 2, bat: 3.5 },
             desc: 'Sau khi Lướt, 3,5 giây đầu không ăn đòn.' },
    khoi:  { name: 'Đo Đạc',    vals: { sight: 0.15 },
             desc: 'Cả đội nhìn xa thêm 15% dưới nước.' },
    van:   { name: 'Hơi Lạnh',  vals: { slow: 0.25, sec: 2, max: 0.8 },
             desc: 'Quái bị bạn đánh bơi chậm đi 25% trong 2 giây.' },
    hai:   { name: 'Hút Nhẹ',   vals: { range: 2, speed: 260 },
             desc: 'Đồ cổ trong 2 m tự trôi về phía bạn.' },
    tuyet: { name: 'Rọi Sáng',  vals: { range: 3, cooldown: 30 },
             desc: 'Đồng đội trong 3 m quanh bạn được cứu khỏi một đòn chí mạng, 30 giây một lần.' }
  };

  // ---------------------------------------------------------------------------
  // CHIẾN THUẬT — tactics.json. Chỉ cộng chỉ số; bot không lặn (xem brain/plans/biet-doi-lan.md).
  // ---------------------------------------------------------------------------
  const tactics = [
    { id: 'loot',  name: 'Khuân đồ',  icon: '📦', bonus: { carry: 0.15, luck: 0.05 }, desc: 'Lo gom đồ cổ về thuyền.' },
    { id: 'thu',   name: 'Thủ thuyền', icon: '🛡️', bonus: { grit: 0.10, atk: 0.10 }, desc: 'Giữ thuyền, chặn cá dữ mò tới.' },
    { id: 'soi',   name: 'Soi đáy',   icon: '🔦', bonus: { eye: 0.30, spd: 0.08 }, desc: 'Bơi xa dò đồ cổ cho cả đội.' },
    { id: 'baoke', name: 'Bảo kê',    icon: '🥊', bonus: { atk: 0.15, grit: 0.08 }, desc: 'Bám sát bạn, cắt đuôi cá đang rượt.' },
    { id: 'cuuho', name: 'Cứu hộ',    icon: '🚑', bonus: { spd: 0.10, grit: 0.06 }, desc: 'Ai hụt hơi là bơi tới đỡ trước.' },
    { id: 'nhu',   name: 'Nhử mồi',   icon: '🔔', bonus: { spd: 0.14 }, desc: 'Gây tiếng ở góc xa để kéo cá dữ đi chỗ khác.' },
    { id: 'san',   name: 'Săn cá',    icon: '⚔️', bonus: { atk: 0.22 }, desc: 'Chủ động đi săn cá dữ.' },
    { id: 'tiepte', name: 'Tiếp tế',  icon: '💉', bonus: { cd: 0.15 }, desc: 'Giữ giữa đội, bấm kỹ năng hỗ trợ sớm.' }
  ];
  const tacticById = {};
  tactics.forEach(t => { tacticById[t.id] = t; });
  const STAT_NAME = { atk: 'Sát thương', hp: 'O₂', spd: 'Tốc bơi', carry: 'Sức kéo', cd: 'Hồi chiêu', luck: 'Giá đồ', eye: 'Tầm nhìn', grit: 'Giáp' };

  // upgrade.json — cấp crew 0..10; giá lên cấp lv -> lv+1 = goldBase x (lv+1) vàng + shard mảnh.
  const upgrade = { maxLevel: 10, goldBase: 200, shard: 1, statPerLevel: 0.038, cdAtLevel: 5, cdReduce: 0.1, passiveAtLevel: 10 };

  // ---------------------------------------------------------------------------
  // GACHA — gacha_banners.json + gacha_rules.json. Ba băng, giá 160 ngọc hoặc 1 vé xác một lượt.
  // `chars` = danh sách 5★ DUY NHẤT của băng đó; 5★ nằm trong danh sách này không ra ở băng khác.
  // ---------------------------------------------------------------------------
  const banners = [
    { id: 'char', name: 'Băng Thường', costGem: 160, ticket: 'ticketX', rate5: 0.006, rate4: 0.051,
      soft: 74, hard: 90, pity4: 10, chars: null, color: '#e0a53c',
      desc: 'Ra crew mới. Trùng crew thì thành mảnh để nâng cấp.' },
    { id: 'lim1', name: 'Giới Hạn: Chớp & Thấu', costGem: 160, ticket: 'ticketX', rate5: 0.006, rate4: 0.051,
      soft: 74, hard: 90, pity4: 10, chars: ['nga', 'khoi'], color: '#4fa0a8',
      desc: '5★ chỉ ra Blink hoặc Oracle, hai crew không có ở băng nào khác.' },
    { id: 'lim2', name: 'Giới Hạn: Lạnh & Từ', costGem: 160, ticket: 'ticketX', rate5: 0.006, rate4: 0.051,
      soft: 74, hard: 90, pity4: 10, chars: ['van', 'hai'], color: '#a678d8',
      desc: '5★ chỉ ra Frost hoặc Magnet, hai crew không có ở băng nào khác.' }
  ];
  const bannerById = {};
  banners.forEach(b => { bannerById[b.id] = b; });
  const gachaRules = { softPityStep: 0.06, duplicateShard: 1, tenPullMin4Star: true };

  // ---------------------------------------------------------------------------
  // CỬA HÀNG — shop_packs.json (nạp GIẢ) + shop_exchange.json (đổi hằng ngày, 3 hàng)
  // ---------------------------------------------------------------------------
  const shopPacks = [
    { id: 'p1', name: 'Gói Tập Sự',     vnd: 22000,   gem: 300,   bonus: 0,     tag: '' },
    { id: 'p2', name: 'Gói Thợ Lặn',    vnd: 109000,  gem: 1600,  bonus: 100,   tag: '' },
    { id: 'p3', name: 'Gói Thuyền Phó', vnd: 249000,  gem: 3800,  bonus: 400,   tag: 'HOT' },
    { id: 'p4', name: 'Gói Chủ Thuyền', vnd: 549000,  gem: 8800,  bonus: 1200,  tag: '' },
    { id: 'p5', name: 'Gói Nhà Đầu Tư', vnd: 999000,  gem: 16800, bonus: 3200,  tag: 'LỜI NHẤT' },
    { id: 'p6', name: 'Gói Ông Trùm',   vnd: 2499000, gem: 45000, bonus: 12000, tag: 'V.I.P' }
  ];
  const shopExchange = [
    { id: 'x1', gem: 50,  reward: { gold: 6000 },   limit: 20 },
    { id: 'x2', gem: 200, reward: { gold: 28000 },  limit: 10 },
    { id: 'x3', gem: 60,  reward: { ticketX: 1 },   limit: 5 }
  ];

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ — quests.json, đặt lại tên số đếm cho đi lặn.
  //   runs=chuyến ra khơi, loot=giá trị đồ cổ, skills=lần dùng kỹ năng, kills=quái hạ,
  //   floors=tầng lặn qua, pulls=lượt gacha, upgrades=lần nâng cấp crew, wins=ca thắng.
  // LỆCH UNITY: d_rev ("đỡ đồng đội dậy") bỏ vì không có đồng đội lặn cùng; thay bằng d_up để
  // vẫn đủ 7 nhiệm vụ ngày cho "bốc 5 trong 7".
  // ---------------------------------------------------------------------------
  const quests = {
    daily: [
      { id: 'd_run',   text: 'Ra khơi 2 chuyến',                 counter: 'runs',     need: 2,     r: { gold: 600, gem: 15 } },
      { id: 'd_loot',  text: 'Mang lên thuyền đồ cổ trị giá 12.000', counter: 'loot', need: 12000, r: { gold: 900 } },
      { id: 'd_skill', text: 'Dùng kỹ năng 15 lần',              counter: 'skills',   need: 15,    r: { gold: 500, gem: 10 } },
      { id: 'd_kill',  text: 'Hạ 8 con quái',                    counter: 'kills',    need: 8,     r: { gold: 700 } },
      { id: 'd_floor', text: 'Lặn qua 4 tầng',                   counter: 'floors',   need: 4,     r: { gold: 800, gem: 20 } },
      { id: 'd_gacha', text: 'Quay gacha 5 lần',                 counter: 'pulls',    need: 5,     r: { gold: 1000 } },
      { id: 'd_up',    text: 'Nâng cấp crew 2 lần',              counter: 'upgrades', need: 2,     r: { gold: 600, gem: 10 } }
    ],
    weekly: [
      { id: 'w_win',  text: 'Thắng 3 ca lặn',                    counter: 'wins',     need: 3,      r: { gold: 6000, gem: 200 } },
      { id: 'w_loot', text: 'Mang lên thuyền đồ cổ trị giá 120.000', counter: 'loot', need: 120000, r: { gold: 8000, ticketX: 1 } },
      { id: 'w_kill', text: 'Hạ 60 con quái',                    counter: 'kills',    need: 60,     r: { gold: 7000, gem: 60 } },
      { id: 'w_up',   text: 'Nâng cấp crew 10 lần',              counter: 'upgrades', need: 10,     r: { gold: 5000, gem: 150 } }
    ],
    ach: [
      { id: 'a_first',  text: 'Thắng ca lặn đầu tiên',           counter: 'wins',      need: 1,       r: { gem: 300 } },
      { id: 'a_all',    text: 'Phá đảo cả 5 chuyến lặn',         counter: 'mapsDone',  need: 5,       r: { gem: 2000, ticketX: 5 } },
      { id: 'a_five',   text: 'Có 1 crew 5★',                    counter: 'own5',      need: 1,       r: { gem: 400 } },
      { id: 'a_squad',  text: 'Đủ 5 crew trong biệt đội',        counter: 'squadFull', need: 5,       r: { gold: 3000 } },
      { id: 'a_kill100', text: 'Hạ 100 con quái',                counter: 'kills',     need: 100,     r: { gold: 12000 } },
      { id: 'a_loot1m', text: 'Mang lên thuyền đồ cổ trị giá 1.000.000', counter: 'loot', need: 1000000, r: { gem: 1500 } }
    ]
  };

  // ---------------------------------------------------------------------------
  // NĂM CHUYẾN LẶN. Một ca là năm chuyến liền, sâu dần. Số tầng 5/7/10/13/16 là số phòng nhà 1..5
  // của REPO; một tầng cao ~13 m. Dữ liệu dựng màn (theme, quái, hệ số) ở data/maps.js (BDL.MAPS) —
  // đây chỉ là phần sảnh cần để vẽ thẻ và trả thưởng.
  // clear = thưởng mỗi lần qua chuyến, first = thưởng lần đầu qua chuyến đó (maps.json).
  // ---------------------------------------------------------------------------
  const FLOOR_M = 13;
  const maps = [
    { id: 'reef',    name: 'Rạn San Hô', floors: 5,  desc: 'Nước trong, cá nhỏ nhiều. Chỗ để làm quen dây móc.' },
    { id: 'kelp',    name: 'Rừng Tảo',   floors: 7,  desc: 'Tảo dày che tầm nhìn, cá dữ nấp sau từng bụi.' },
    { id: 'dusk',    name: 'Hoàng Hôn',  floors: 10, desc: 'Ánh sáng tắt dần, cá mập bắt đầu rượt theo tiếng động.' },
    { id: 'storm',   name: 'Mưa Giông',  floors: 13, desc: 'Dòng chảy xiết, đồ cổ trôi, quái nhanh và đớp mạnh.' },
    { id: 'abyss',   name: 'Vực Đêm',    floors: 16, desc: 'Tối đen, áp suất bóp O₂ từng giây. Đồ cổ đắt nhất nằm ở đây.' }
  ].map(m => Object.assign(m, {
    depthM: m.floors * FLOOR_M,
    clear: { gold: 1800, gem: 30 },
    first: { gold: 3000, gem: 300 }
  }));
  const mapById = {};
  maps.forEach(m => { mapById[m.id] = m; });

  // ---------------------------------------------------------------------------
  // ĐỒ NGHỀ / TRẠM — sổ dùng chung giữa sảnh (loadout) và trạm trong ca (station).
  //   price        giá ở trạm, trả bằng ví của ca
  //   loadoutPrice giá ở sảnh, trả bằng vàng (~37% giá trạm, bảng loadout.json); null = sảnh không bán
  //   uses         số phát/đòn; 0 = vô hạn
  //   ammo         true = đầy lại mỗi chuyến lặn (súng, cận chiến). Đồ ném/thuốc/dụng cụ thì dùng hết là hết.
  //   stock        tối đa mua bao nhiêu lần mỗi ca ở trạm (station_gear.json); upgrade: số lần được bày
  //   icon         đường dẫn ảnh (tính từ tệp HTML trong games/biet-doi-lan/) hoặc một emoji
  // LỆCH UNITY: net/grenade/tool/heal chưa có trong loadout.json; sảnh bán float/shield theo cùng tỉ lệ
  // 37% để chủ dự án đỡ phải đoán, o2s/o2m/o2l không bán ở sảnh (Unity cũng không bán thuốc ở sảnh).
  // ---------------------------------------------------------------------------
  const ICON = '../ho-xanh/art/gear/icon/';
  const ITEMS = [
    // --- súng ---
    { key: 'rifle',   name: 'Súng trường',   kind: 'gun',   price: 9000,  loadoutPrice: 3200, uses: 20, ammo: true, stock: 4, icon: ICON + 'Item_BasicRifle.png',      desc: 'Bắn liên tục, đạn thường.' },
    { key: 'shotgun', name: 'Súng săn',      kind: 'gun',   price: 26000, loadoutPrice: 8800, uses: 6,  ammo: true, stock: 2, icon: ICON + 'Item_ShotGun.png',          desc: 'Chùm đạn toả, cực mạnh ở gần.' },
    { key: 'sniper',  name: 'Súng ngắm',     kind: 'gun',   price: 22000, loadoutPrice: 7600, uses: 5,  ammo: true, stock: 2, icon: ICON + 'Item_Sniper.png',           desc: 'Sạc rồi bắn, đạn xuyên cả hàng.' },
    { key: 'tranq',   name: 'Súng mê',       kind: 'gun',   price: 12000, loadoutPrice: 4200, uses: 3,  ammo: true, stock: 3, icon: ICON + 'Item_SleepGun.png',         desc: 'Gây mê quái 12 giây.' },
    { key: 'net',     name: 'Súng lưới',     kind: 'gun',   price: 8000,  loadoutPrice: 3000, uses: 4,  ammo: true, stock: 2, icon: ICON + 'Item_NetGun.png',           desc: 'Bắn lưới trói cá dữ.' },
    { key: 'grenade', name: 'Súng phóng lựu', kind: 'gun',  price: 16000, loadoutPrice: 5900, uses: 3,  ammo: true, stock: 2, icon: ICON + 'Item_GrenadeLauncher.png',  desc: 'Lựu nổ vùng, hất tung đàn cá.' },
    // --- cận chiến ---
    { key: 'knife',   name: 'Dao lặn',       kind: 'melee', price: 0,     loadoutPrice: null, uses: 0,  ammo: true, stock: 1, icon: '🗡️', desc: 'Món khởi điểm, miễn phí, dùng mãi.' },
    { key: 'bat',     name: 'Gậy',           kind: 'melee', price: 8000,  loadoutPrice: 3000, uses: 12, ammo: true, stock: 2, icon: '🏏', desc: 'Đập mạnh, hất lùi quái.' },
    { key: 'pan',     name: 'Chảo',          kind: 'melee', price: 6000,  loadoutPrice: 2200, uses: 18, ammo: true, stock: 2, icon: '🍳', desc: 'Rẻ, bền, đập đau bất ngờ.' },
    { key: 'sledge',  name: 'Búa tạ',        kind: 'melee', price: 14000, loadoutPrice: 5200, uses: 8,  ammo: true, stock: 2, icon: '🔨', desc: 'Nặng tay, một nhát nát cá nhỏ.' },
    { key: 'machete', name: 'Dao rựa',       kind: 'melee', price: 10000, loadoutPrice: 3800, uses: 20, ammo: true, stock: 2, icon: '🔪', desc: 'Chém nhanh, bền.' },
    { key: 'prodzap', name: 'Gậy điện',      kind: 'melee', price: 12000, loadoutPrice: 4500, uses: 10, ammo: true, stock: 2, icon: '⚡', desc: 'Giật choáng quái chạm phải.' },
    // --- đồ ném ---
    { key: 'bomb',    name: 'Bom',           kind: 'throw', price: 7000,  loadoutPrice: 2400, uses: 2,  ammo: false, stock: 5, icon: '💣', desc: 'Ném đi, nổ vùng.' },
    { key: 'stun',    name: 'Lựu choáng',    kind: 'throw', price: 5500,  loadoutPrice: 1900, uses: 2,  ammo: false, stock: 4, icon: '💫', desc: 'Choáng mọi con quái quanh điểm nổ.' },
    { key: 'mine',    name: 'Mìn',           kind: 'throw', price: 8000,  loadoutPrice: 2800, uses: 2,  ammo: false, stock: 3, icon: '🧨', desc: 'Đặt xuống đáy, nổ khi cá lại gần.' },
    // --- thuốc: bình O₂ ---
    { key: 'o2s',     name: 'Bình O₂ nhỏ',   kind: 'heal',  price: 1800,  loadoutPrice: null, uses: 1,  ammo: false, stock: 6, heal: 25,  icon: ICON + 'Item_SubO2Tank.png', desc: 'Hồi 25 O₂.' },
    { key: 'o2m',     name: 'Bình O₂ vừa',   kind: 'heal',  price: 4000,  loadoutPrice: null, uses: 1,  ammo: false, stock: 6, heal: 50,  icon: ICON + 'Item_SubO2Tank.png', desc: 'Hồi 50 O₂.' },
    { key: 'o2l',     name: 'Bình O₂ lớn',   kind: 'heal',  price: 9000,  loadoutPrice: null, uses: 1,  ammo: false, stock: 6, heal: 100, icon: ICON + 'Item_SubO2Tank.png', desc: 'Hồi 100 O₂.' },
    // --- dụng cụ ---
    { key: 'float',   name: 'Phao nổi',      kind: 'tool',  price: 10000, loadoutPrice: 3700, uses: 2,  ammo: false, stock: 3, dur: 20, icon: '🛟', desc: 'Đồ cổ không trọng lượng trong 20 giây.' },
    { key: 'shield',  name: 'Áo bọc',        kind: 'tool',  price: 11000, loadoutPrice: 4100, uses: 2,  ammo: false, stock: 3, dur: 25, icon: '🛡️', desc: 'Đồ cổ không mất giá trong 25 giây.' },
    // --- nâng cấp (chỉ ở trạm; giá x1,6 mỗi lần mua, mỗi món chỉ được bày tối đa 3 lần mỗi ca) ---
    { key: 'hp',      name: 'O₂ tối đa',     kind: 'upgrade', price: 6000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🫁', desc: 'Thêm O₂ tối đa và hồi đầy.' },
    { key: 'stam',    name: 'Thể lực',       kind: 'upgrade', price: 2000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '💪', desc: 'Thêm thanh sức bền.' },
    { key: 'str',     name: 'Sức kéo dây',   kind: 'upgrade', price: 6000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🪢', desc: 'Đồ cổ nặng nhẹ đi tương đối.' },
    { key: 'range',   name: 'Tầm móc',       kind: 'upgrade', price: 6000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🪝', desc: 'Bắn móc xa hơn.' },
    { key: 'sprint',  name: 'Tốc bơi',       kind: 'upgrade', price: 6000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🏊', desc: 'Bơi nhanh hơn.' },
    { key: 'grip',    name: 'Dây bền',       kind: 'upgrade', price: 7000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🧵', desc: 'Dây căng chịu được lâu hơn trước khi đứt.' },
    { key: 'regen',   name: 'Hồi sức',       kind: 'upgrade', price: 3000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🔋', desc: 'Sức bền hồi nhanh hơn khi đứng yên.' },
    { key: 'light',   name: 'Đèn đội đầu',   kind: 'upgrade', price: 5000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🔦', desc: 'Chùm sáng rộng và xa hơn.' },
    { key: 'cargo',   name: 'Túi cá +kg',    kind: 'upgrade', price: 4000, loadoutPrice: null, uses: 0, ammo: false, stock: 3, icon: '🎒', desc: 'Mang thêm cá mỗi chuyến.' }
  ];
  const itemByKey = {};
  ITEMS.forEach(it => { itemByKey[it.key] = it; });
  const KIND_NAME = { gun: 'Súng', melee: 'Cận chiến', throw: 'Đồ ném', heal: 'Bình O₂', tool: 'Dụng cụ', upgrade: 'Nâng cấp' };

  const station = { upgradePriceGrowth: 1.6, upgradeMaxOffers: 3 };
  // giá nâng cấp ở trạm khi đã mua n lần trong ca: base x 1,6^n
  function upgradePrice(key, n) {
    const it = itemByKey[key];
    if (!it || it.kind !== 'upgrade') return 0;
    return Math.round(it.price * Math.pow(station.upgradePriceGrowth, n || 0));
  }

  BDL.ITEMS = ITEMS;
  BDL.ITEM_BY_KEY = itemByKey;
  BDL.upgradePrice = upgradePrice;

  BDL.content = {
    wallet, walletStart, runReward, rarity,
    crew, crewById, passives, tactics, tacticById, STAT_NAME, upgrade,
    banners, bannerById, gachaRules,
    shopPacks, shopExchange, quests,
    maps, mapById, FLOOR_M,
    items: ITEMS, itemByKey, KIND_NAME, station, upgradePrice
  };

})(window);
