// Đại Đại Chỉ Huy (G.mode === 'troopgc', Great Commander, Troop2/*): Đạo Diễn Tiêu Đen (người chơi, là mèo) thuê diễn viên ở chợ
// bằng vàng, 15 vòng, diễn viên TỰ ĐÁNH; hết thời gian hoặc diễn viên chết hết thì thua vòng và mất 1 điểm nổi tiếng (8 điểm),
// hạ Vua Ti Vi ở vòng 15 là thắng. Số liệu: wiki Great_Commander + 7 mẫu GC_* (tools/polish/MODES.md mục 2j) [WIKI GC]; chỗ wiki
// không có số ghi [ƯỚC LƯỢNG]. Chưa làm: xem tools/polish/GAPS.md mục "Đại Đại Chỉ Huy".
//   G.tgc = {diff, round, pop, coins, level, market:[4], bag:[], recs:[{uid,id,star,on,wid,buffs,drinks,paid,hp,armor,e}], phase, ...}
// Kỹ năng riêng của diễn viên nằm ở js/troopgc2.js (đăng ký vào SK.tgc.SKILL).
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, W = SK.world, T = SK.TILE, U = SK.PPU;
  const K = () => SK.skillKit || {};
  const Tg = SK.tgc = { SKILL: {}, drawn: {} };

  const RAR = ['Trắng', 'Lục', 'Lam', 'Tím', 'Cam'], RCOL = ['#e8e8e8', '#5fd068', '#4a8ae8', '#b05cf0', '#f0983a'];
  const C = SK.TROOPGC = {
    pop: 8, energy: 100, orb: 10,                    // 8 điểm nổi tiếng, 100 NL, mỗi cầu NL +10 [WIKI GC "General"]
    rounds: 15, diffs: 5, bossRounds: [5, 10], finalRound: 15,   // 15 vòng; trùm ở vòng 5, 10; Vua Ti Vi ở vòng 15 [WIKI GC "Bosses"]
    price: [1, 2, 3, 4, 5],                          // giá theo phẩm trắng/lục/lam/tím/cam [WIKI GC "Market"]
    marketCost: [0, 0, 2, 6, 10, 24, 36],            // giá nâng chợ lên cấp n (cấp 1 mặc định) [WIKI GC_Market_Levels]
    marketMax: 6, slots: 4, refresh: 1,              // chợ 4 ô, làm mới 1 xu, tối đa cấp 6 (ra sân tối đa 6 diễn viên) [WIKI GC]
    unlockLv: [1, 2, 2, 3, 4],                       // cấp chợ mở phẩm trắng / lục / lam / tím / cam [WIKI GC_Market_Levels]
    // trọng số phẩm theo cấp chợ: cấp cao ra phẩm cao nhiều hơn [WIKI GC: "makes high rarity items appear more often"]; con số [ƯỚC LƯỢNG]
    rarW: [null, [1, 0, 0, 0, 0], [5, 4, 3, 0, 0], [4, 4, 4, 2, 0], [3, 3, 4, 3, 2], [2, 3, 4, 4, 3], [1, 2, 4, 5, 4]],
    kindW: { perf: 45, weapon: 20, buff: 15, drink: 20 },   // [ƯỚC LƯỢNG] tỉ lệ loại hàng từ cấp chợ 2 (cấp 1 chỉ bán diễn viên [WIKI GC])
    // vàng cuối vòng 1..14 theo độ khó: độ 1, 4, 5 từ wiki; độ 2 và 3 wiki để trống nên [ƯỚC LƯỢNG] (độ 2 = độ 1, độ 3 = giữa độ 1 và 4)
    coins: {
      1: [4, 5, 6, 7, 10, 10, 10, 10, 10, 12, 10, 10, 10, 10],
      2: [4, 5, 6, 7, 10, 10, 10, 10, 10, 12, 10, 10, 10, 10],
      3: [4, 5, 6, 7, 10, 10, 11, 11, 11, 14, 11, 11, 11, 11],
      4: [4, 5, 6, 7, 10, 10, 12, 12, 12, 16, 12, 12, 12, 12],
      5: [4, 5, 6, 7, 12, 12, 12, 12, 12, 16, 12, 12, 12, 12]
    },
    startCoins: 2,                                   // [ƯỚC LƯỢNG] đủ thuê 1 diễn viên phẩm trắng (1 xu) và còn dư
    maxOwn: 9, bagMax: 12,                           // [ƯỚC LƯỢNG] số diễn viên giữ được (6 ra sân + 3 dự bị) và sức chứa túi
    timer: 75, timerBoss: 120,                       // thời gian mỗi vòng, vòng trùm [ƯỚC LƯỢNG: wiki có đồng hồ nhưng không ghi số]
    champRounds: [3, 8, 13],                         // vòng có cờ: làn cuối là quái Tinh Anh [WIKI GC "Enemies"; vòng nào là ƯỚC LƯỢNG]
    waveAt: [0, 14, 28], waveSplit: [0.3, 0.35, 0.35],   // 3 làn quái, giờ tới làn và tỉ lệ ngân sách [ƯỚC LƯỢNG]
    pts0: 12, ptsGrow: 5, hpGrow: 0.5, hpDiff: 0.35, atkGrow: 0.12, atkDiff: 0.15,   // ngân sách quái vòng r = 12 + 5(r-1); máu x(1+0,5(r-1))x(1+0,35(độ-1)); sát thương quái lên diễn viên x(1+0,12(r-1)+0,15(độ-1)) [ƯỚC LƯỢNG]
    bossHpDiff: 0.25, tyrantDrain: 1,                // hết giờ trận Vua Ti Vi: trừ 1 điểm nổi tiếng mỗi giây tới 0 [WIKI GC: "fast rate"; nhịp ƯỚC LƯỢNG]
    dropCoin: 0.22, dropOrb: 0.2,                    // tỉ lệ quái rơi vàng / cầu NL [ƯỚC LƯỢNG: wiki chỉ nói "có thể rơi"]
    armorDelay: 3, armorFill: 6,                     // hồi giáp sau 3 s không bị đánh, đầy trong 6 s [ƯỚC LƯỢNG]
    cmd: {                                           // kỹ năng chỉ huy [WIKI GC "Commander Skill"; LOC Troop2/mercenaries/skill_*]
      heal: { name: 'Túi Chữa Trị', cost: 80, v: 0.3 },        // gần đó +30% máu tối đa
      haste: { name: 'Adrenalin', cost: 40, v: 0.3, t: 3 },    // công tốc +30% trong 3 s
      brute: { name: 'Đại Lực', cost: 40, v: 0.3, t: 3 },      // công +30% trong 3 s
      frost: { name: 'Pha Lê Đóng Băng', cost: 60 },           // gai băng đánh địch: sát thương/số gai [ƯỚC LƯỢNG]
      packet: { name: 'Lì Xì', cost: 100, min: 1, max: 4 },    // 1 đến 4 vàng
      shield: { name: 'Máy Tạo Giáp', cost: 60, t: 5 }         // khiên bảo vệ 1 diễn viên trong 5 s
    },
    cmdOrder: ['heal', 'haste', 'brute', 'frost', 'packet', 'shield'],
    cmdUnlockBy: [null, 1, 2, 3, 4, 5],             // [ƯỚC LƯỢNG] mua bằng 2000 Xu Mùa Giải ở gốc; bản web mở khi thắng độ 1..5
    frostHit: 10, frostN: 6, healR: 8 * U, shieldMax: 1
  };
  C.ids = [];

  // ============================================================ 18 diễn viên có bảng chỉ số trên wiki (3 diễn viên Nhà Thờ Ether không có bảng nên chưa làm)
  // st[sao] = [HP, giáp, NL đầu, NL hồi mỗi giây, NL tối đa, %DMG, nhịp đánh (s), %DMG kỹ năng, phòng thủ, bạo %, tốc di chuyển] [WIKI GC_Performers_Stats]
  // w = vũ khí đầu {tên, d:[sát thương ★1, ★3], c:[bạo ★1, ★3], k: 'r' tầm xa / 'm' cận chiến} [WIKI GC_Performers]; syn = liên kết; sk = mã kỹ năng
  const PERF = {
    taotie: { hero: 'knight', en: "Glutton Taotie", vi: "Thao Thiết", r: 0, w: { n: "Súng Ngắn Mới", d: [4, 4], c: [0, 0], k: 'r' }, syn: ["ancient", "speed"], sk: 'dual',
      st: [[21,10,0,10,40,1.25,0.66,1,0,15,5.5],[32,16,0,10,40,1.35,0.72,1,0,15,5.5],[50,26,0,10,40,1.45,0.72,1,0,15,5.5]] },
    bifang: { hero: 'elves', en: "Bifang Bird", vi: "Tất Phương", r: 1, w: { n: "Cung Cổ Xưa", d: [6, 12], c: [0, 50], k: 'r' }, syn: ["ancient", "combo", "amplify"], sk: 'arrow',
      st: [[20,10,0,10,60,1,0.5,1.25,0,10,5],[29,14,0,10,60,1,0.5,1.25,0,10,5],[43,20,0,10,60,1,0.5,1.25,0,10,5]] },
    aoyin: { hero: 'alchemist', en: "Ogre Aoyin", vi: "Ngao Nhân", r: 3, w: { n: "Máy Bơm Bóng Độc Ngủ Đông", d: [2, 2], c: [15, 15], k: 'r' }, syn: ["ancient", "amplify", "energy"], sk: 'potion',
      st: [[18,10,0,10,50,1,0.4,1,1,0,5],[24,16,0,10,50,1,0.4,1,1,0,5],[32,26,0,10,50,1,0.4,1,1,0,5]] },
    baize: { hero: 'druid', en: "Baize the Wise", vi: "Bạch Trạch", r: 4, w: { n: "Xương Giòn", d: [8, 8], c: [14, 14], k: 'r' }, syn: ["ancient", "control", "skill"], sk: 'wolf',
      st: [[23,10,0,8,100,1,0.55,1,0,0,5],[37,16,0,8,100,1.1,0.55,1,0,0,5],[61,26,0,8,100,1.2,0.55,1,0,0,5]] },
    moai: { hero: 'robot', en: "Moai", vi: "Tượng Moai", r: 0, w: { n: "Đá Năng Lượng", d: [6, 6], c: [0, 0], k: 'r' }, syn: ["brilliant", "skill"], sk: 'emp',
      st: [[8,20,0,10,40,1,0.5,1,0,0,5.5],[13,32,0,10,40,1,0.5,1,0,0,5.5],[21,52,0,10,40,1,0.5,1,0,0,5.5]] },
    feitian: { hero: 'priest', en: "Fei Tian", vi: "Phi Thiên", r: 1, w: { n: "Nhất Thiên Thu", d: [6, 8], c: [10, 10], k: 'r' }, syn: ["brilliant", "energy"], sk: 'pray',
      st: [[24,10,30,10,50,1,0.5,1,0,0,5.5],[32,13,30,10,50,1,0.5,1,0,0,5.5],[43,17,30,10,50,1,0.5,1,0,0,5.5]] },
    boreas: { hero: 'werewolf', en: "Boreas Bear Spirit", vi: "Thần Gấu Gió Bắc", r: 2, w: { n: "Sức Mạnh Gió Bắc", d: [7, 7], c: [25, 25], k: 'm' }, syn: ["brilliant", "speed"], sk: 'devour',
      st: [[25,10,0,10,70,1,0.9,1,1,0,6],[41,16,0,10,70,1.1,0.9,1,1,0,6],[67,26,0,10,70,1.25,0.9,1,1,0,6]] },
    makisenro: { hero: 'taoist', en: "Ink Wash - Miao Xian Lang", vi: "Makisenro", r: 4, w: { n: "Vẽ Mắt Rồng", d: [8, 4], c: [0, 0], k: 'r' }, syn: ["brilliant", "skill", "energy"], sk: 'swords',
      st: [[25,10,0,10,50,1,0.5,1,1,0,5.5],[41,16,0,10,50,1.25,0.5,1,2,0,5.5],[67,26,0,10,50,1.5,0.5,1,2,0,5.5]] },
    pigsy: { hero: 'paladin', en: "Monk Pigsy", vi: "Trư Ngộ Năng", r: 0, w: { n: "Bồ Cào 9 Răng", d: [8, 14], c: [5, 40], k: 'm' }, syn: ["celestial", "energy"], sk: 'shield',
      st: [[10,18,30,10,80,0.8,0.3,1,1,0,6],[18,29,30,10,80,0.8,0.3,1,2,0,6],[32,47,30,10,80,0.8,0.3,1,2,0,6]] },
    peafowl: { hero: 'mage', en: "Peafowl Princess", vi: "Khổng Tước Công Chúa", r: 1, w: { n: "Quạt Phi Hoa", d: [3, 3], c: [10, 10], k: 'r' }, syn: ["celestial", "combo"], sk: 'fire',
      st: [[14,6,0,12,60,0.75,0.23,1.2,0,0,5],[23,9,10,12,60,0.75,0.23,1.25,0,0,5],[37,14,20,12,60,0.75,0.23,1.35,0,0,5]] },
    yulong: { hero: 'ranger', en: "Yulong, Prince of the Western Sea", vi: "Ngọc Long Tam Thái Tử", r: 2, w: { n: "Kiếm Mưa Và Thương Lôi", d: [5, 5], c: [0, 0], k: 'm' }, syn: ["celestial", "combo", "split"], sk: 'iaido',
      st: [[27,12,10,10,40,1,1.08,1,0,0,7.5],[44,14,10,10,40,1,1.08,1,0,0,7.5],[72,17,10,10,40,1,1.08,1,0,0,7.5]] },
    macaque: { hero: 'assassin', en: "Six- Eared Macaque", vi: "Lục Nhĩ Mị Hầu", r: 2, w: { n: "Lính Tin Cậy", d: [8, 8], c: [20, 20], k: 'm' }, syn: ["celestial", "speed"], sk: 'stealth',
      st: [[18,12,0,7,60,1,0.33,1,0,25,7.5],[29,19,0,7,60,1.1,0.44,1,0,25,7.5],[47,31,0,7,60,1.25,0.55,1,0,25,7.5]] },
    rabbit: { hero: 'miner', en: "Moon Rabbit", vi: "Thỏ Ngọc", r: 3, w: { n: "Cuốc Cà Rốt", d: [7, 7], c: [25, 25], k: 'm' }, syn: ["celestial", "skill", "split"], sk: 'rabbits',
      st: [[20,15,0,10,50,1,0.5,1,0,0,5.5],[36,27,0,10,50,1,0.5,1,1,0,5.5],[53,40,0,10,50,1,0.5,1,1,0,5.5]] },
    simayi: { hero: 'vampire', en: "Sima Yi - Zhongda", vi: "Tư Mã Ý", r: 0, w: { n: "Quạt Bóng Sói", d: [5, 5], c: [25, 25], k: 'r' }, syn: ["war", "split"], sk: 'bats',
      st: [[20,5,25,10,60,1,0.6,1,0,0,5.5],[36,5,25,10,60,1,0.6,1.2,0,0,5.5],[65,5,25,10,60,1,0.6,1.3,0,0,5.5]] },
    sun: { hero: 'swordmaster', en: "Sun Shangxiang", vi: "Tôn Thượng Hương", r: 1, w: { n: "Kiếm Phượng Minh", d: [6, 6], c: [0, 0], k: 'm' }, syn: ["war", "combo"], sk: 'tempest',
      st: [[15,8,0,10,80,1,0.3,1,0,0,6.5],[24,13,0,10,80,1.1,0.3,1.1,0,0,6.5],[39,21,0,10,80,1.2,0.3,1.2,0,0,6.5]] },
    zhaoyun: { hero: 'lancer', en: "Zhao Yun - Zilong", vi: "Triệu Vân", r: 2, w: { n: "Long Đảm Lượng Ngân Thương", d: [6, 6], c: [15, 15], k: 'm' }, syn: ["war", "amplify"], sk: 'lance',
      st: [[25,10,0,10,40,1,0.38,1,1,0,7],[37,14,0,10,40,1.1,0.38,1,1,0,7],[55,20,0,10,40,1.2,0.38,1,1,0,7]] },
    guanyu: { hero: 'viking', en: "Guan Yu - Yunchang", vi: "Quan Vũ", r: 3, w: { n: "Chân - Thanh Long Yển Nguyệt Đao", d: [6, 6], c: [5, 5], k: 'm' }, syn: ["war", "split", "speed"], sk: 'scatter',
      st: [[32,14,0,10,40,1.2,0.9,1,0,0,7.5],[47,23,0,10,40,1.2,0.9,1,0,0,7.5],[70,37,0,10,40,1.2,0.9,1,0,0,7.5]] },
    diaochan: { hero: 'necromancer', en: "Diao Chan", vi: "Điêu Thuyền", r: 4, w: { n: "Quạt Hoa Bay", d: [1, 1], c: [10, 10], k: 'r' }, syn: ["war", "amplify", "control"], sk: 'omen',
      st: [[20,12,20,10,80,1,0.5,1.1,0,0,5],[32,19,20,10,80,1,0.5,1.25,0,0,5],[52,31,20,10,80,1,0.5,1.5,0,0,5]] }
  };
  for (const k in PERF) PERF[k].id = k;
  C.ids = Object.keys(PERF);
  Tg.PERF = PERF;

  // ============================================================ liên kết [WIKI GC_Synergies; LOC troop2/trait_*]
  const SYN = {
    ancient: { name: 'Thần Thoại Viễn Cổ', tiers: [2, 4] },
    brilliant: { name: 'Nền Văn Minh Rực Rỡ', tiers: [2, 4] },
    celestial: { name: 'Quái Tiên', tiers: [2, 4, 5] },
    war: { name: 'Quần Hùng Trục Lộc', tiers: [2, 4, 5] },
    amplify: { name: 'Tinh Thông Khuếch Tán', tiers: [2, 4] },
    combo: { name: 'Tinh Thông Liên Kích', tiers: [2, 4] },
    control: { name: 'Tinh Thông Khống Chế', tiers: [2, 4] },
    energy: { name: 'Tinh Thông N.Lượng', tiers: [2, 4] },
    skill: { name: 'Tinh Thông Kỹ Năng', tiers: [2, 4] },
    speed: { name: 'Tinh Thông Tốc Độ', tiers: [2, 4] },
    split: { name: 'Tinh Thông Đạn', tiers: [2, 4] }
  };
  C.SYN = SYN;
  // số theo bậc [self, other] ([WIKI GC_Synergies])
  const PROF = {
    amplify: [[0.2, 0.1], [1, 0.3]], combo: [[1, 0], [3, 1]], control: [[0.2, 0.1], [0.5, 0.2]], energy: [[3, 2], [8, 4]],
    skill: [[0.2, 0.1], [0.8, 0.2]], speed: [[0.15, 0.1], [0.5, 0.3]], split: [[1, 0], [3, 1]]
  };
  C.PROF = PROF;
  C.ANCIENT = [{ base: 0.05, gain: 0.03, cap: 0.15 }, { base: 0.12, gain: 0.06, cap: 0.36 }];
  C.WAR = { 2: { n: 1, def: 2, regen: 1, armor: 8 }, 4: { n: 2, def: 3, regen: 1.5, armor: 12 }, 5: { all: 1, def: 5, regen: 2, armor: 20 } };

  // ============================================================ vũ khí chợ [WIKI GC_Weapons: tên, phẩm 0..4, sát thương, bạo %]; ngoặc dạng "a~b" lấy trung bình
  // m = 1: có bán trong chợ ở cấp mở phẩm của nó [WIKI GC_Market_Levels]
  const WLIST = [
    ["Green Essence",0,2.0,0.0],
    ["Retouch-free Camera",0,1.0,0.0],
    ["Wooden Hammer",0,12.0,8.0],
    ["Chu Ko Nu",1,7.0,30.0],
    ["Electric Therapy",1,3.0,0.0],
    ["Green Basin",1,4.5,100.0],
    ["Grenade Pistol",1,4.0,0.0],
    ["Guardian Rifle",1,3.0,12.0],
    ["Horn",1,2.0,0.0],
    ["Shotgun Galaxy",1,3.0,0.0],
    ["Sidewinder Green",1,3.0,40.0],
    ["40m Long Blade",2,14.0,0.0],
    ["Blowpipe",2,16.0,60.0],
    ["Buckler",2,20.0,15.0],
    ["Cherry Blossom",2,6.0,25.0],
    ["Giant Axe",2,8.0,25.0],
    ["Glacier",2,8.0,50.0],
    ["Jade Bow",2,8.0,50.0],
    ["Octopus",2,2.0,15.0],
    ["Plunger",2,5.0,20.0],
    ["Salamander",2,4.0,40.0],
    ["Snow Fox XXL",2,2.0,5.0],
    ["Splash Railgun",2,8.0,15.0],
    ["Webber",2,3.0,22.0],
    ["Aurora",3,16.0,50.0],
    ["Bubble Gun",3,2.0,5.0],
    ["Deadly Frisbee",3,4.0,35.0],
    ["Electric Ninja Stars",3,3.0,0.0],
    ["Face-Sized Momiji",3,15.0,10.0],
    ["Firebolt",3,2.0,22.0],
    ["Flame Axe",3,5.0,30.0],
    ["Flame Sword",3,8.0,30.0],
    ["Hammerhead Shark",3,22.0,50.0],
    ["Knight Spear",3,12.0,30.0],
    ["Rainbow",3,5.0,20.0],
    ["Thunder Warhammer",3,6.0,10.0],
    ["Toxic Webber",3,3.0,20.0],
    ["Verbal Fire",3,3.0,10.0],
    ["Breath of Hades",4,10.0,49.0],
    ["Buccaneer Captain's Naval Cannon",4,10.0,10.0],
    ["Explosive Crossbow",4,13.0,30.0],
    ["Fist of Heaven",4,2.5,15.0],
    ["Frontier Crossbow",4,14.0,30.0],
    ["Meteo Laser Gun",4,8.5,25.0],
    ["Quantum Ninja Stars",4,10.0,30.0],
    ["Rainbow Horse",4,3.0,0.0],
    ["Ranger's Revolver",4,7.0,30.0],
    ["Shuddering Thunder",4,7.5,30.0],
    ["Soul Calibre",4,20.0,50.0],
    ["Star Bow",4,10.0,30.0],
    ["Tome of Darkness",4,4.0,10.0],
    ["Tome of Light",4,2.0,10.0],
    ["Xuan Ming",4,8.0,10.0],
    ["Zeus Thunderbolt",4,12.0,0.0]
  ];
  const MARKET_W = new Set(['Green Essence', 'Retouch-free Camera', 'Chu Ko Nu', 'Electric Therapy', 'Green Basin', 'Grenade Pistol', 'Guardian Rifle', 'Shotgun Galaxy', 'Sidewinder Green',
    '40m Long Blade', 'Blowpipe', 'Cherry Blossom', 'Giant Axe', 'Glacier', 'Jade Bow', 'Octopus', 'Plunger', 'Salamander', 'Splash Railgun', 'Webber',
    'Aurora', 'Bubble Gun', 'Deadly Frisbee', 'Electric Ninja Stars', 'Face-Sized Momiji', 'Firebolt', 'Flame Axe', 'Hammerhead Shark', 'Knight Spear', 'Thunder Warhammer', 'Toxic Webber', 'Verbal Fire',
    'Breath of Hades', 'Explosive Crossbow', 'Fist of Heaven', 'Frontier Crossbow', 'Meteo Laser Gun', 'Rainbow Horse', "Ranger's Revolver", 'Shuddering Thunder', 'Soul Calibre', 'Star Bow', 'Xuan Ming', 'Zeus Thunderbolt']);
  const WEAP = {};   // khoá = tên en thường
  (function () {
    const by = {};
    for (const id in DS.weapons) { const q = DS.weapons[id]; if (q && q.nameEn) by[String(q.nameEn).toLowerCase()] = id; }
    for (const [en, r, d, c] of WLIST) {
      const id = by[en.toLowerCase()], def = id && DS.weapons[id];
      WEAP[en] = { en, r, d, c, id: id || null, n: (def && def.name) || en, k: def && def.kind === 'melee' ? 'm' : 'r', m: MARKET_W.has(en) ? 1 : 0, sprite: def ? def.sprite : null };
    }
  })();
  Tg.WEAP = WEAP;

  // ============================================================ thức uống [WIKI GC_Drinks; tên LOC drink_*, cooking/*]
  const DRINK = {
    coconut: { n: 'Nước Dừa', r: 0, d: 'Giáp tối đa +5', mod: o => { o.armor += 5; } },
    wine: { n: 'Rượu Vang', r: 0, d: 'Máu tối đa +8', mod: o => { o.hp += 8; } },
    clam: { n: 'Trai Ngọc', r: 1, d: 'Tốc di chuyển +20%', mod: o => { o.mspd += 0.2; } },
    dumpling: { n: 'Trôi Nước', r: 1, d: 'Cỡ đạn +20%', mod: o => { o.bsize += 0.2; } },
    bloody: { n: 'Mary Khát Máu', r: 2, d: 'Tỉ lệ bạo kích +20%', mod: o => { o.crit += 20; } },
    steak: { n: 'Sườn Nướng', r: 2, d: 'Sát thương vũ khí +25%', mod: o => { o.wDmg += 0.25; } },
    coffee: { n: 'Cà Phê', r: 3, d: 'Công tốc +10%', mod: o => { o.aspd += 0.1; } },
    noodle: { n: 'Mì Râu Rồng', r: 3, d: 'Sát thương kỹ năng +25%', mod: o => { o.skDmg += 0.25; } },
    milk: { n: 'Sữa Bò', r: 4, d: 'Phòng thủ +1', mod: o => { o.def += 1; } },
    juice: { n: 'Nước Ép', r: 4, d: 'Hồi N.Lượng +4', mod: o => { o.regen += 4; } }
  };
  Tg.DRINK = DRINK;

  // ============================================================ thiên phú (bong bóng) [WIKI GC_Buffs; tên LOC Troop2/Talent/Name/*]
  // m = 1: có bán ở chợ theo cấp mở phẩm [WIKI GC_Market_Levels: 16 loại]; 22 loại gồm cả loại không bán
  const BUFF = {
    ace: { n: 'Thiên Giáng Thần Binh', r: 1, m: 1, d: 'Đầu trận đổi vũ khí thành vũ khí ngẫu nhiên phẩm cao hơn' },
    raw: { n: 'Đá Nguồn Điện Thoại', r: 1, d: 'Sát thương vũ khí +10% (1 trong 3 bộ phận Tiếng Gọi Tổ Tiên)', mod: o => { o.wDmg += 0.1; } },
    regen: { n: 'Hồi HP', r: 1, m: 1, d: 'Máu tối đa +15, mỗi giây hồi 1% máu khi chiến đấu', mod: o => { o.hp += 15; o.hpRegen += 0.01; } },
    precision: { n: 'Bạo Chuẩn', r: 1, m: 1, d: 'Bạo kích +25%, sát thương bạo +35%', mod: o => { o.crit += 25; o.critDmg += 0.35; } },
    reflect: { n: 'Phản Đòn Cận Chiến', r: 1, m: 1, d: 'Cỡ đạn +30%, đòn cận chiến bắn trả đạn địch', mod: o => { o.bsize += 0.3; } },
    antenna: { n: 'Ăng-ten Điện Thoại', r: 2, d: 'Sát thương vũ khí +20% (1 trong 3 bộ phận Tiếng Gọi Tổ Tiên)', mod: o => { o.wDmg += 0.2; } },
    armorRes: { n: 'Bảo Hộ Phá Giáp', r: 2, m: 1, d: 'Thời gian hồi giáp giảm 50%; giáp vỡ không chịu thêm sát thương' },
    comboB: { n: 'Cường Hóa Liên Kích', r: 2, m: 1, d: 'Lượt tấn công liên tục +1', mod: o => { o.combo += 1; } },
    fray: { n: 'Ý Chí Xông Trận', r: 2, m: 1, d: 'Tìm thấy địch mới thì xông tới, làm choáng 0,5 s và hồi 5 NL' },
    pierce: { n: 'Xuyên Thấu Đạn', r: 2, m: 1, d: 'Sát thương vũ khí +25%, đạn xuyên thêm 1 địch', mod: o => { o.wDmg += 0.25; o.pierce += 1; } },
    sorc: { n: 'Cơn Giận Pháp Sư', r: 2, d: 'Mỗi 10% máu đã mất trong vòng, sát thương kỹ năng +5%' },
    warr: { n: 'Cơn Giận Chiến Binh', r: 2, d: 'Mỗi 10% máu đã mất trong vòng, công tốc +5%' },
    chunk: { n: 'Điện Thoại Của Điện Thoại', r: 3, d: 'Sát thương vũ khí +20% (1 trong 3 bộ phận Tiếng Gọi Tổ Tiên)', mod: o => { o.wDmg += 0.2; } },
    armorBlast: { n: 'Phá Giáp Xung Kích', r: 3, m: 1, d: 'Giáp tối đa +12, giáp bị đánh thì tung sóng xung kích', mod: o => { o.armor += 12; } },
    energyRegen: { n: 'Hồi N.Lượng', r: 3, m: 1, d: 'Hồi N.Lượng +4, tiêu hao NL thi triển kỹ năng giảm 5', mod: o => { o.regen += 4; o.skillCost += 5; } },
    homing: { n: 'Đạn Theo Vết', r: 3, m: 1, d: 'Đòn đánh có 25% tỉ lệ bắn nhiều đạn theo vết vào các địch khác nhau, mỗi đạn 3 sát thương vũ khí' },
    laser: { n: 'Mưa Laze', r: 3, m: 1, d: 'Sát thương kỹ năng +50%, thi triển kỹ năng gây mưa laze quanh địch, mỗi tia 31 sát thương kỹ năng', mod: o => { o.skDmg += 0.5; } },
    leech: { n: 'Uống Máu', r: 4, m: 1, d: 'Đòn trúng có 8% tỉ lệ hồi 1 HP' },
    mom: { n: 'Tăng Nhanh Công Tốc', r: 4, m: 1, d: 'Mỗi địch hạ gục, công tốc +5%, tối đa +40%' },
    splitB: { n: 'Tăng Súng Ngắn', r: 4, m: 1, d: 'Số Đạn Tán +1', mod: o => { o.split += 1; } },
    unfail: { n: 'Kiên Cố', r: 4, m: 1, d: 'Thủ +2; mỗi lần bị đánh Thủ tăng thêm 1, tối đa +4', mod: o => { o.def += 2; } },
    unyield: { n: 'Bất Khuất', r: 4, d: 'Còn diễn viên khác không có thiên phú này đang đánh thì giữ lại 1 HP dù chịu sát thương nào' }
  };
  Tg.BUFF = BUFF;
  const BUFF_MAX = 3;   // mỗi diễn viên tối đa 3 thiên phú, không cộng dồn cùng loại [WIKI GC "Buffs"]

  // di sản văn minh [WIKI GC "Legacy of Civilization"; LOC troop2/item_*]
  const LEGACY = {
    brush: { n: 'Cọ Tiên', d: 'Sao chép 1 sao diễn viên gần nhất' },
    codex: { n: 'Pháp Điển Hammurabi', d: 'Làm mới chợ miễn phí 1 lần' },
    gem: { n: 'Đá Ba Tư', d: 'Nhận ngẫu nhiên 1 đến 6 vàng' },
    spring: { n: 'Suối Nhật Nguyệt', d: 'Tăng độ nổi tiếng của đạo diễn' }
  };
  Tg.LEGACY = LEGACY;

  // ============================================================ hồ sơ (localStorage)
  const KEY = 'sk.tgc.v1';
  const P = Tg.prof = { won: 0, diff: 1, cmd: 'heal', best: 0, runs: 0 };
  function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && typeof o === 'object') for (const k in P) if (o[k] != null) P[k] = o[k]; } catch (e) { /* hồ sơ hỏng thì bỏ */ } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* không có kho thì thôi */ } }
  Tg.profSave = save;
  Tg.profReset = () => { P.won = 0; P.diff = 1; P.cmd = 'heal'; P.best = 0; P.runs = 0; try { localStorage.removeItem(KEY); } catch (e) { /* bỏ */ } };
  load();
  const cmdOpen = id => { const i = C.cmdOrder.indexOf(id), by = C.cmdUnlockBy[i]; return by == null || P.won >= by; };
  Tg.cmdOpen = cmdOpen;

  const on = G => G && G.mode === 'troopgc' && G.tgc;
  const say = (G, m, t) => { G.toast(m, t || 2.2); return m; };
  const rnd = () => SK.rand();
  const lerp3 = (a, b, star) => a + (b - a) * (star - 1) / 2;
  const r1 = v => Math.round(v * 10) / 10;
  Tg.on = on; Tg.say = say;

  // ============================================================ khởi tạo ván
  Tg.init = function (G) {
    G.petOff = true;   // người chơi LÀ mèo: không có thú cưng đi theo
    const diff = Math.max(1, Math.min(P.diff || 1, P.won + 1, C.diffs));
    const t = { lines: [], diff, round: 1, pop: C.pop, coins: C.startCoins, level: 1, market: [], bag: [], recs: [], uid: 0, phase: 'market', gather: false,
      cmd: cmdOpen(P.cmd) ? P.cmd : 'heal', timer: 0, bt: 0, queue: [], waveI: 0, boss: false, bossSpawned: false, drops: [], syn: {}, ver: 0,
      stats: { rounds: 0, lost: 0, kills: 0, hired: 0, merged: 0, bought: 0 }, ancWins: 0, loseRun: 0, freeRefresh: 0, won: false, lost: false, allies: new Map() };
    return t;
  };
  SK.on('runStart', G => { if (G.mode !== 'troopgc' && G._tgcOff) { G.petOff = false; G._tgcOff = false; } });

  // ============================================================ bảng chỉ số của một diễn viên
  Tg.weaponOf = function (rec) {
    if (rec.bw) return rec.bw;
    if (rec.wid && WEAP[rec.wid]) { const w = WEAP[rec.wid]; return { n: w.n, d: w.d, c: w.c, k: w.k, en: w.en }; }
    const P0 = PERF[rec.id], w = P0.w;
    return { n: w.n, d: lerp3(w.d[0], w.d[1], rec.star), c: lerp3(w.c[0], w.c[1], rec.star), k: w.k, en: null };
  };
  const hasBuff = (rec, b) => rec.buffs.indexOf(b) >= 0;
  // số đếm liên kết trên sân: đếm DIỄN VIÊN KHÁC LOẠI có liên kết đó [WIKI GC "Synergies"]
  Tg.refreshSyn = function (G) {
    const t = G.tgc, seen = {};
    for (const rec of t.recs) if (rec.on) for (const s of PERF[rec.id].syn) (seen[s] = seen[s] || new Set()).add(rec.id);
    t.syn = {};
    for (const s in SYN) {
      const n = seen[s] ? seen[s].size : 0; let tier = 0;
      SYN[s].tiers.forEach((th, i) => { if (n >= th) tier = i + 1; });
      t.syn[s] = { n, tier, th: tier ? SYN[s].tiers[tier - 1] : 0 };
    }
    t.ver++;
    for (const rec of t.recs) rec.warPick = null;
  };
  Tg.synTier = (G, s) => (G.tgc.syn[s] && G.tgc.syn[s].tier) || 0;
  Tg.derive = function (G, rec) {
    const t = G.tgc, P0 = PERF[rec.id], s = P0.st[rec.star - 1], w = Tg.weaponOf(rec);
    const o = { hp: s[0], armor: s[1], e0: s[2], regen: s[3], eMax: s[4], dmgP: s[5], rate: s[6], skP: s[7], def: s[8], crit: s[9] + w.c, spd: s[10],
      wDmg: 1, skDmg: 1, hpMul: 1, aspd: 0, mspd: 0, bsize: 0, split: 0, combo: 0, ctrl: 0, critDmg: 0, pierce: 0, hpRegen: 0, hpRegenFlat: 0, skillCost: 0 };
    for (const k of rec.drinks) DRINK[k].mod(o);
    for (const k of rec.buffs) if (BUFF[k].mod) BUFF[k].mod(o);
    // liên kết [WIKI GC_Synergies]
    const syn = t.syn || {};
    const anc = syn.ancient;
    if (anc && anc.tier && P0.syn.indexOf('ancient') >= 0) {
      const a = C.ANCIENT[anc.tier - 1], b = Math.min(a.cap, a.base + a.gain * t.ancWins);
      o.wDmg += b; o.skDmg += b; o.hpMul += b;
    }
    // Quần Hùng Trục Lộc bậc 2 / 4: mỗi diễn viên có liên kết nhận ngẫu nhiên 1 / 2 trong 3 hiệu ứng (chốt theo diễn viên tới khi đội hình đổi);
    // bậc 5: mọi diễn viên nhận đủ cả 3
    const war = syn.war;
    if (war && war.tier) {
      const cf = C.WAR[war.th], mine = P0.syn.indexOf('war') >= 0;
      if (war.th === 5) { o.def += cf.def; o.hpRegenFlat += cf.regen; o.armor += cf.armor; }
      else if (mine) {
        if (!rec.warPick) rec.warPick = SK.shuffle(['def', 'regen', 'armor']).slice(0, cf.n);
        for (const k of rec.warPick) { if (k === 'def') o.def += cf.def; else if (k === 'regen') o.hpRegenFlat += cf.regen; else o.armor += cf.armor; }
      }
    }
    if (rec.devour) { const k = rec.devour, i = rec.star - 1; o.hpMul += k * [0.03, 0.05, 0.05][i]; o.bsize += k * [0.03, 0.05, 0.1][i]; }
    for (const s2 in PROF) {
      const e = syn[s2]; if (!e || !e.tier) continue;
      const v = PROF[s2][e.tier - 1], mine = P0.syn.indexOf(s2) >= 0, x = mine ? v[0] : v[1];
      if (s2 === 'amplify') o.bsize += x; else if (s2 === 'combo') o.combo += x; else if (s2 === 'control') o.ctrl += x; else if (s2 === 'energy') o.regen += x;
      else if (s2 === 'skill') o.skDmg += x; else if (s2 === 'speed') { o.aspd += x; o.mspd += x; } else if (s2 === 'split') o.split += x;
    }
    o.hp = Math.round(o.hp * o.hpMul); o.armor = Math.round(o.armor);
    o.eMax = Math.max(10, o.eMax - o.skillCost);
    return o;
  };
  Tg.stat = (G, rec) => { if (!rec.d || rec.dv !== G.tgc.ver) { rec.d = Tg.derive(G, rec); rec.dv = G.tgc.ver; } return rec.d; };
  Tg.stage = G => G.tgc.recs.filter(r => r.on);
  Tg.maxStage = G => G.tgc.level;

  // ============================================================ diễn viên: thân xác (ally) + AI
  const nearestFoe = (G, x, y, r) => K().nearest(G, x, y, r);
  const foesIn = (G, x, y, r) => K().inRadius(G, x, y, r);
  function mkRec(G, id) {
    const t = G.tgc, P0 = PERF[id], r = { uid: ++t.uid, id, star: 1, on: false, wid: null, buffs: [], drinks: [], paid: C.price[P0.r], hp: 1, armor: 0, e: 0, dead: false };
    return r;
  }
  Tg.newRec = mkRec;
  function resetRec(G, rec) {
    rec.d = null; const d = Tg.stat(G, rec);
    rec.hp = d.hp; rec.armor = d.armor; rec.e = d.e0; rec.dead = false; rec.bw = null; rec.devour = 0; rec.hits = 0; rec.mom = 0; rec.lost = 0;
  }
  const homeOf = (G, i) => { const b = G.tgc.base; return { x: b.x + (i - 2.5) * 22, y: b.y + 2 + (i % 2) * 10 }; };
  function drawHero(ctx, hero, x, y, t, flip, sc, flash, run) {
    const hd = SK.heroSkin(hero, 0) || {}, key = run ? hd.run : hd.idle, fr = key && SK.animFrame(key, t);
    if (!fr || !SK.draw(ctx, fr, x, y, { flip, sx: sc, sy: sc, pages: flash ? SK.pagesWhite : null })) { ctx.fillStyle = '#9fd2ff'; ctx.fillRect(x - 4, y - 12, 8, 12); }
  }
  Tg.drawHero = drawHero;
  function spawnPerf(G, rec, x, y) {
    const t = G.tgc, P0 = PERF[rec.id];
    const a = SK.addWeaponAlly(G, {
      tg: rec, x, y, cd: 0.6, owner: G.player, face: 1,
      get hp() { return rec.hp; },
      set hp(v) { if (v >= rec.hp) { rec.hp = Math.min(v, Tg.stat(G, rec).hp); return; } Tg.hurt(G, a, rec, (rec.hp - v) * Tg.atkMul(t.round, t.diff)); },
      get hpMax() { return Tg.stat(G, rec).hp; },
      update(G2, a2, dt) { if (on(G2)) tickPerf(G2, a2, rec, dt); },
      onDie(G2, a2) { a2.gone = true; rec.dead = true; rec.hp = 0; t.allies.delete(rec); SK.emit('tgcDie', G2, rec); },
      draw(ctx, G2, a2) { drawPerf(ctx, G2, a2, rec); }
    });
    a.home = { x, y };
    t.allies.set(rec, a);
    return a;
  }
  Tg.allyOf = (G, rec) => G.tgc.allies.get(rec) || null;
  function respawnAll(G) {
    const t = G.tgc;
    for (const a of t.allies.values()) a.gone = true;
    t.allies.clear();
    let i = 0, j = 0;
    for (const rec of t.recs) {
      if (rec.on) { const h = homeOf(G, i++); spawnPerf(G, rec, h.x, h.y); }
      else { const b = t.base; spawnPerf(G, rec, b.x - 100 + (j++) * 16, b.y + 44); }
    }
  }
  Tg.respawn = respawnAll;

  // sát thương nhận vào: khiên, bất tử ngắn, phòng thủ, giáp rồi máu [WIKI GC "Stats"; giáp hồi sau 3 s [ƯỚC LƯỢNG]]
  Tg.hurt = function (G, a, rec, dmg) {
    const d = Tg.stat(G, rec);
    if (dmg <= 0 || rec.dead) return 0;
    if (a.invT > 0) return 0;
    if (a.shieldT > 0) { SK.num(G, a.x, a.y - 22, 'Chặn', '#9fd2ff'); if (a.shieldGain) for (const q of Tg.stage(G)) if (q !== rec) q.e = Math.min(Tg.stat(G, q).eMax, q.e + a.shieldGain); return 0; }
    let df = d.def + (hasBuff(rec, 'unfail') ? Math.min(2, rec.hits || 0) : 0);
    if (df) dmg = Math.max(1, dmg - df);
    a.sinceHit = 0; a.flash = 0.1;
    const ab = Math.min(rec.armor, dmg);
    rec.armor -= ab; let rest = dmg - ab;
    if (ab > 0 && hasBuff(rec, 'armorBlast') && G.t - (a.blastAt || -9) > 1) { a.blastAt = G.t; for (const e of foesIn(G, a.x, a.y - 6, 30)) K().hit(G, a, e, 5, { noMul: true, repel: 3, fx: 'hit_white' }); SK.fx(G, 'ring', a.x, a.y - 6, { dur: 0.3, color: '#ffd84a' }); }
    if (ab > 0 && rec.armor <= 0 && hasBuff(rec, 'armorRes')) rest = 0;   // giáp vỡ không chịu thêm sát thương [WIKI GC_Buffs]
    rec.hits = (rec.hits || 0) + 1;
    if (rest > 0) {
      rec.hp -= rest; rec.lost = (rec.lost || 0) + rest;
      if (rec.hp <= 0 && hasBuff(rec, 'unyield') && Tg.stage(G).some(q => q !== rec && !q.dead && !hasBuff(q, 'unyield'))) rec.hp = 1;
    }
    SK.num(G, a.x, a.y - 22, Math.round(dmg), '#ff4a4a');
    return dmg;
  };

  function wanderTo(G, a, dt) {
    a.wT = (a.wT || 0) - dt;
    if (a.wT <= 0 || !a.wp) { const b = G.tgc.base; a.wT = 1.5 + rnd() * 2; a.wp = { x: b.x + (rnd() - 0.5) * 150, y: b.y + (rnd() - 0.5) * 120 }; }
    return a.wp;
  }
  function walk(G, a, tx, ty, spd, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy); if (d < 1) return false;
    const s = Math.min(d, spd * dt); SK.moveBox(G.map, a, dx / d * s, dy / d * s, 4);
    if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1; a.moving = true; return true;
  }
  Tg.walk = walk;
  // chỉ số tạm thời đang hiệu lực (Adrenalin, Đại Lực, nổi giận, đà hạ gục...)
  Tg.rt = function (G, a, rec, d) {
    const o = { aspd: 0, dmg: 1, sk: 1, crit: 0, mspd: 0 };
    if (a.hasteT > 0) o.aspd += C.cmd.haste.v;
    if (a.bruteT > 0) o.dmg += C.cmd.brute.v;
    if (hasBuff(rec, 'mom')) o.aspd += Math.min(0.4, 0.05 * (rec.mom || 0));
    const lostPct = Math.floor(Math.min(1, (rec.lost || 0) / Math.max(1, d.hp)) * 10);
    if (hasBuff(rec, 'warr')) o.aspd += 0.05 * lostPct;
    if (hasBuff(rec, 'sorc')) o.sk += 0.05 * lostPct;
    if (rec.devour) o.aspd += rec.devour * (rec.star === 3 ? 0.075 : rec.star === 2 ? 0.05 : 0.03);
    if (a.critT > 0) o.crit += 100;
    if (a.praiseT > 0) o.mspd += a.praiseV || 0.15;
    return o;
  };
  const ranged = w => w.k !== 'm';
  function reach(rec, w, d) { return ranged(w) ? 11 * U : (2.4 + d.bsize * 1.2) * U; }
  function tickPerf(G, a, rec, dt) {
    const t = G.tgc, p = G.player, d = Tg.stat(G, rec);
    a.moving = false;
    for (const k of ['hasteT', 'bruteT', 'invT', 'shieldT', 'critT', 'praiseT', 'dualT', 'scatterT', 'wolfT', 'celT']) if (a[k] > 0) a[k] = Math.max(0, a[k] - dt);
    a.sinceHit = (a.sinceHit == null ? 9 : a.sinceHit) + dt;
    if (t.phase !== 'battle') {
      if (!rec.on) return;
      const h = a.home; if (h && Math.hypot(h.x - a.x, h.y - a.y) > 2) walk(G, a, h.x, h.y, 8 * U, dt);
      return;
    }
    if (!rec.on) return;
    // hồi máu / giáp
    const rg = d.hpRegen * d.hp + d.hpRegenFlat;
    if (rg > 0) rec.hp = Math.min(d.hp, rec.hp + rg * dt);
    const delay = hasBuff(rec, 'armorRes') ? C.armorDelay * 0.5 : C.armorDelay;
    if (a.sinceHit > delay && rec.armor < d.armor) rec.armor = Math.min(d.armor, rec.armor + d.armor / C.armorFill * dt);
    // hàng đợi liên kích / kỹ năng nhiều nhịp
    if (a.vq && a.vq.length) { for (const q of a.vq) q.t -= dt; while (a.vq.length && a.vq[0].t <= 0) a.vq.shift().fn(); }
    const rt = Tg.rt(G, a, rec, d);
    // kỹ năng: NL hồi mỗi giây, đầy thì thi triển; đang thi triển thì NL không hồi, hết thì về 0 [WIKI GC "Performers"]
    const S = Tg.SKILL[PERF[rec.id].sk];
    if (a.cast) {
      a.cast.t -= dt; a.cast.el = (a.cast.el || 0) + dt;
      if (S && S.upd) S.upd(G, a, rec, d, dt, a.cast);
      if (a.cast.t <= 0) { if (S && S.end) S.end(G, a, rec, d); rec.e = a.refill ? d.eMax : 0; a.refill = false; a.cast = null; }
      if (a.cast && a.cast.lock) return;   // đang lao đi chém: không tự di chuyển/đánh
    } else {
      rec.e = Math.min(d.eMax, rec.e + d.regen * dt);
      if (S && rec.e >= d.eMax - 0.001) {
        const tg = nearestFoe(G, a.x, a.y - 7, 16 * U) || (S.any ? nearestFoe(G, a.x, a.y - 7, 60 * U) : null);
        if (tg) {
          const dur = S.fn(G, a, rec, d, tg, rt);
          if (dur) {
            a.cast = { t: dur === true ? 1 : dur, lock: !!(S.lockMove) }; Tg.stats.casts = (Tg.stats.casts || 0) + 1;
            SK.fx(G, 'ring', a.x, a.y - 8, { dur: 0.3, color: '#ffd84a' }); rec.skUsed = (rec.skUsed || 0) + 1;
            if (hasBuff(rec, 'laser')) laserRain(G, a, rec, d, tg);
            const ct = Tg.synTier(G, 'celestial'); if (ct) a.celT = ct >= 3 ? 2 : 99;   // Quái Tiên: đòn đầu sau kỹ năng (bậc 5: trong 2 s)
            SK.emit('tgcSkill', G, rec);
            return;
          }
        }
      }
    }
    // chuyển động + đánh
    const w = Tg.weaponOf(rec), rch = reach(rec, w, d);
    const e = nearestFoe(G, a.x, a.y - 7, 60 * U);
    if (e && a.tgtE !== e && hasBuff(rec, 'fray') && e !== a.tgtE) { a.tgtE = e; rec.e = Math.min(d.eMax, rec.e + 5); K().stun(e, 0.5); }
    a.tgtE = e || a.tgtE;
    const spd = d.spd * U * (1 + d.mspd + rt.mspd);
    const dp = Math.hypot(p.x - a.x, p.y - a.y);
    a.cd -= dt;
    if (a.cd < 0 && a.cd < -1) a.cd = 0;
    if (!e) {
      if (t.gather) { if (dp > 3 * U) walk(G, a, p.x, p.y, spd, dt); }
      else { const wp = wanderTo(G, a, dt); walk(G, a, wp.x, wp.y, spd * 0.5, dt); }
      return;
    }
    const [ex, ey] = K().ec(e), dist = Math.hypot(ex - a.x, ey - (a.y - 7));
    if (t.gather && dp > 3 * U) { walk(G, a, p.x, p.y, spd, dt); if (!(ranged(w) && dist <= rch)) return; }
    else if (!t.gather) {
      if (ranged(w)) { if (dist > rch * 0.85) walk(G, a, ex, e.y, spd, dt); }
      else if (dist > rch * 0.8) walk(G, a, ex, e.y, spd, dt);
    }
    a.face = ex >= a.x ? 1 : -1;
    if (dist > rch * (ranged(w) ? 1 : 1.15) || a.cd > 0) return;
    a.cd = Math.max(0.12, d.rate / (1 + d.aspd + rt.aspd));
    attack(G, a, rec, d, w, e, rt);
  }
  const critRoll = (d, rt, extra) => rnd() * 100 < d.crit + (rt.crit || 0) + (extra || 0);
  Tg.dmgOf = (rec, d, w, rt) => Math.max(1, (w.d * d.dmgP * d.wDmg * (rt.dmg || 1)));
  function attack(G, a, rec, d, w, e, rt) {
    const [ex, ey] = K().ec(e), ox = a.x, oy = a.y - 7, ang = Math.atan2(ey - oy, ex - ox);
    const base = Tg.dmgOf(rec, d, w, rt), vol = 1 + Math.floor(d.combo);
    const burst = () => {
      if (rec.dead || !G.tgc || e.st === 'dead') return;
      const crit = critRoll(d, rt), cm = 2 + d.critDmg, dmg = Math.max(1, Math.round(base * (crit ? cm : 1)));
      const dual = a.dualT > 0 ? Math.max(1, Math.round(base * (a.dualMul || 1) * (crit ? cm : 1))) : 0;
      if (ranged(w)) {
        const n = 1 + Math.floor(d.split) + (a.scatterT > 0 ? (a.scatterN || 1) : 0), sp = 0.16;
        for (let i = 0; i < n; i++) {
          const o = (i - (n - 1) / 2) * sp;
          SK.spawnBullet86(G, 'p', 'bullet_1', ox + Math.cos(ang) * 6, oy + Math.sin(ang) * 6, ang + o + (rnd() - 0.5) * 0.06, { dmg, crit, repel: 1, owner: a, h: 7, spd: 30, size: 1 + d.bsize, thr: Math.floor(d.pierce) });
        }
        if (dual) SK.spawnBullet86(G, 'p', 'bullet_1', ox + Math.cos(ang) * 6, oy + 3 + Math.sin(ang) * 6, ang + 0.05, { dmg: dual, crit, repel: 1, owner: a, h: 7, spd: 30, size: 1 + d.bsize });
      } else {
        const R = (2.6 + d.bsize * 1.2) * U + 4;
        for (const q of foesIn(G, a.x, a.y - 6, R)) { const [qx] = K().ec(q); if ((qx - a.x) * a.face >= -6) hitFoe(G, a, rec, d, q, dmg + dual, crit, ang); }
        if (a.scatterT > 0) for (let i = 0; i < (a.scatterN || 1) + 1; i++) SK.spawnBullet86(G, 'p', 'bullet_1', ox + Math.cos(ang) * 6, oy + Math.sin(ang) * 6, ang + (i - (a.scatterN || 1) / 2) * 0.22, { dmg, crit, repel: 1, owner: a, h: 7, spd: 30, size: 1 + d.bsize });
        if (hasBuff(rec, 'reflect')) for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - a.x, b.y - a.y) < R + 6) b.dead = true;
        K().fx(G, 'hit_white', a.x + a.face * 10, a.y - 8, { scale: 0.8 });
      }
      if (hasBuff(rec, 'homing') && rnd() < 0.25) {
        const hit = new Set([e]);
        for (let i = 0; i < 3; i++) { const q = foesIn(G, a.x, a.y - 6, 22 * U).find(z => !hit.has(z)); if (!q) break; hit.add(q); hitFoe(G, a, rec, d, q, Math.max(1, Math.round(3 * d.dmgP * d.wDmg)), false, ang, true); const [qx, qy] = K().ec(q); Tg.line(G, ox, oy, qx, qy, '#ffb04a', 0.15); }
      }
    };
    burst();
    for (let i = 1; i < vol; i++) (a.vq = a.vq || []).push({ t: 0.12 * i, fn: burst });
  }
  // đánh trúng: bạo, hút máu, liên kết Quái Tiên (hiệu ứng sau khi dùng kỹ năng)
  function hitFoe(G, a, rec, d, q, dmg, crit, ang, quiet) {
    K().hit(G, a, q, dmg, { crit, noMul: true, repel: 2, ang, fx: quiet ? null : 'hit_white' });
    if (hasBuff(rec, 'leech') && rnd() < 0.08) { rec.hp = Math.min(d.hp, rec.hp + 1); SK.num(G, a.x, a.y - 24, '+1', '#6cff8a'); }
    if (a.celT > 0 && Tg.synTier(G, 'celestial')) celestial(G, a, rec, d, q);
  }
  Tg.hitFoe = hitFoe;
  // Quái Tiên: bậc 2 trạng thái nguyên tố ngẫu nhiên; bậc 4 và 5 là nổ / vòng băng / vòng độc / gió xoáy [WIKI GC_Synergies]
  function celestial(G, a, rec, d, q) {
    const tier = Tg.synTier(G, 'celestial'); const k = K();
    if (tier <= 1) { try { k.debuff(G, q, SK.pick(['fire', 'ice', 'poison', 'ele'])); } catch (er) { /* thiếu hiệu ứng thì bỏ */ } }
    else {
      const m = SK.pick(['boom', 'ice', 'poison', 'wind']), [qx, qy] = k.ec(q), r = 26 * (1 + d.bsize);
      for (const z of foesIn(G, qx, qy, r)) {
        if (m === 'boom') k.hit(G, a, z, 6, { noMul: true, repel: 4, fx: 'hit_white' });
        else if (m === 'ice') { try { k.debuff(G, z, 'ice', { t: 1 * (1 + d.ctrl) }); } catch (er) { /* bỏ */ } }
        else if (m === 'poison') { try { k.debuff(G, z, 'poison'); } catch (er) { /* bỏ */ } }
        else { z.kx += (qx - z.x) * 2; z.ky += (qy - z.y) * 2; k.hit(G, a, z, 3, { noMul: true }); }
      }
      SK.fx(G, 'ring', qx, qy, { dur: 0.3, color: m === 'ice' ? '#7fd3ff' : m === 'poison' ? '#7bd36a' : m === 'wind' ? '#cfe8ff' : '#ff8a3a' });
    }
    if (tier < 3) a.celT = 0;
  }
  function laserRain(G, a, rec, d, tg) {
    const [ex, ey] = K().ec(tg), n = 6;
    for (let i = 0; i < n; i++) {
      const x = ex + (rnd() - 0.5) * 40, y = ey + (rnd() - 0.5) * 24;
      G.props.push({ tg2: 1, x, y, born: G.t + i * 0.08, update(G2, pr) {
        if (G2.t < pr.born) return; pr.gone = true;
        for (const q of foesIn(G2, x, y, 12)) K().hit(G2, a, q, Math.round(31 * d.skP * d.skDmg), { noMul: true, fx: 'hit_blue' });
        Tg.line(G2, x, y - 60, x, y, '#ff5a7a', 0.2);
      }, draw() {} });
    }
  }
  Tg.laserRain = laserRain;
  Tg.skillDmg = (G, a, rec, d, v) => Math.max(1, Math.round(v * d.skP * d.skDmg * (Tg.rt(G, a, rec, d).sk || 1)));
  // sát thương kỹ năng lên 1 địch
  Tg.skHit = (G, a, rec, d, q, v, fxn) => K().hit(G, a, q, Tg.skillDmg(G, a, rec, d, v), { noMul: true, repel: 3, fx: fxn === undefined ? 'hit_white' : fxn });
  Tg.foesIn = foesIn; Tg.nearestFoe = nearestFoe; Tg.hasBuff = hasBuff; Tg.K = K;

  function drawPerf(ctx, G, a, rec) {
    const t = G.tgc, P0 = PERF[rec.id], d = Tg.stat(G, rec);
    if (!rec.on && t.phase === 'battle') return;
    const sc = 1 + 0.07 * (rec.star - 1), dim = !rec.on;
    ctx.save(); if (dim) ctx.globalAlpha = 0.55;
    if (a.invT > 0 && !(a.cast && a.cast.vis)) ctx.globalAlpha *= 0.5 + 0.3 * Math.sin(G.t * 30);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, 6 * sc, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = RCOL[P0.r]; ctx.globalAlpha *= 0.9; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(a.x, a.y, 8 * sc, 3, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = dim ? 0.55 : 1;
    drawHero(ctx, P0.hero, a.x, a.y, a.t, a.face < 0, sc, a.flash > 0, a.moving);
    if (a.shieldT > 0) { ctx.strokeStyle = '#9fd2ff'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(a.x, a.y - 8, 12, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
    SK.text(ctx, '★'.repeat(rec.star), a.x, a.y - 22 * sc, 6, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
    if (rec.on && t.phase === 'battle' && !rec.dead) {
      const w = 18, x = a.x - w / 2, y = a.y + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, 5);
      ctx.fillStyle = '#e0453a'; ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, rec.hp) / d.hp, 1.5);
      ctx.fillStyle = '#9aa4b5'; ctx.fillRect(x + 1, y + 2.5, (w - 2) * Math.max(0, rec.armor) / Math.max(1, d.armor), 1);
      ctx.fillStyle = a.cast ? '#ffe44a' : '#4ab8ff'; ctx.fillRect(x + 1, y + 3.7, (w - 2) * Math.min(1, rec.e / d.eMax), 0.9);
    }
  }

  // ============================================================ chợ
  const poolPerf = lv => C.ids.filter(id => C.unlockLv[PERF[id].r] <= lv);
  function poolOf(kind, r, lv) {
    if (C.unlockLv[r] > lv) return [];
    if (kind === 'perf') return C.ids.filter(id => PERF[id].r === r);
    if (kind === 'weapon') return Object.keys(WEAP).filter(k => WEAP[k].m && WEAP[k].r === r);
    if (kind === 'buff') return Object.keys(BUFF).filter(k => BUFF[k].m && BUFF[k].r === r);
    return Object.keys(DRINK).filter(k => DRINK[k].r === r);
  }
  function pickWeighted(list, w) { let tot = 0; for (const x of list) tot += w(x); if (tot <= 0) return null; let r = rnd() * tot; for (const x of list) { r -= w(x); if (r <= 0) return x; } return list[list.length - 1]; }
  function rollItem(G, forcePerf) {
    const t = G.tgc, lv = t.level, rw = C.rarW[lv];
    const kinds = lv <= 1 || forcePerf ? ['perf'] : ['perf', 'weapon', 'buff', 'drink'];
    for (let tries = 0; tries < 20; tries++) {
      const kind = kinds.length === 1 ? 'perf' : pickWeighted(kinds, k => C.kindW[k]);
      const r = pickWeighted([0, 1, 2, 3, 4], x => (poolOf(kind, x, lv).length ? rw[x] : 0));
      if (r == null) continue;
      const list = poolOf(kind, r, lv); if (!list.length) continue;
      return { kind, id: SK.pick(list), r, price: C.price[r], sold: false, locked: false };
    }
    return { kind: 'perf', id: SK.pick(poolPerf(lv)), r: 0, price: 1, sold: false, locked: false };
  }
  Tg.rollMarket = function (G, keepLocked) {
    const t = G.tgc, old = t.market.slice(); t.market = [];
    const brill = Tg.synTier(G, 'brilliant') >= 2;
    for (let i = 0; i < C.slots; i++) {
      const o = old[i];
      if (o && o.locked && !o.sold && keepLocked) { t.market.push(o); continue; }
      let it = rollItem(G, false);
      if (i === 0 && brill && t.level >= 2) { const l = C.ids.filter(id => PERF[id].syn.indexOf('brilliant') >= 0 && C.unlockLv[PERF[id].r] <= t.level); if (l.length) { const id = SK.pick(l); it = { kind: 'perf', id, r: PERF[id].r, price: C.price[PERF[id].r], sold: false, locked: false }; } }
      t.market.push(it);
    }
    if (!keepLocked) for (const it of t.market) it.locked = false;
  };
  const itemName = it => it.kind === 'perf' ? PERF[it.id].vi : it.kind === 'weapon' ? WEAP[it.id].n : it.kind === 'buff' ? BUFF[it.id].n : it.kind === 'drink' ? DRINK[it.id].n : LEGACY[it.id].n;
  Tg.itemName = itemName;
  Tg.say = say;
  // tìm diễn viên gần mèo nhất (đối tượng của trang bị / bán / đổi chỗ)
  Tg.target = function (G, onlyStage) {
    const p = G.player; let best = null, bd = 1e9;
    for (const rec of G.tgc.recs) {
      if (onlyStage && !rec.on) continue;
      const a = Tg.allyOf(G, rec); if (!a) continue;
      const dd = Math.hypot(a.x - p.x, a.y - p.y); if (dd < bd) { bd = dd; best = rec; }
    }
    return best;
  };
  function afterChange(G) { Tg.refreshSyn(G); for (const rec of G.tgc.recs) rec.d = null; Tg.rebuild(G); }
  Tg.afterChange = afterChange;
  // ghép 3 diễn viên cùng loại và cùng sao thành 1 diễn viên sao cao hơn; trang bị trả về túi, giá cộng dồn [WIKI GC "Performers"]
  function mergeAll(G) {
    const t = G.tgc; let did = false;
    for (let guard = 0; guard < 10; guard++) {
      let hit = null;
      for (const id of C.ids) for (const star of [1, 2]) {
        const l = t.recs.filter(r => r.id === id && r.star === star);
        if (l.length >= 3) { hit = l.slice(0, 3); break; }
      }
      if (!hit) break;
      const keep = hit.find(r => r.on) || hit[0];
      for (const r of hit) {
        if (r !== keep) {
          if (r.wid) t.bag.push({ kind: 'weapon', id: r.wid, r: WEAP[r.wid].r, price: C.price[WEAP[r.wid].r] });
          for (const b of r.buffs) t.bag.push({ kind: 'buff', id: b, r: BUFF[b].r, price: C.price[BUFF[b].r] });
          for (const dr of r.drinks) t.bag.push({ kind: 'drink', id: dr, r: DRINK[dr].r, price: C.price[DRINK[dr].r] });
          t.recs.splice(t.recs.indexOf(r), 1);
        }
      }
      keep.star++; keep.paid = hit.reduce((s, r) => s + r.paid, 0); keep.on = hit.some(r => r.on);
      t.stats.merged++; did = true;
      say(G, PERF[keep.id].vi + ' lên ' + keep.star + ' sao!');
      SK.emit('tgcMerge', G, keep);
    }
    return did;
  }
  Tg.mergeAll = mergeAll;
  Tg.hire = function (G, id, price, silent) {
    const t = G.tgc, P0 = PERF[id]; if (!P0) return { ok: false, why: 'unknown' };
    const pr = price == null ? C.price[P0.r] : price;
    if (t.coins < pr) return { ok: false, why: say(G, 'Không đủ vàng') };
    const same = t.recs.filter(r => r.id === id && r.star === 1).length;
    if (t.recs.length >= C.maxOwn && same < 2) return { ok: false, why: say(G, 'Không thuê diễn viên được nữa') };
    t.coins -= pr; const rec = mkRec(G, id); rec.paid = pr;
    rec.on = Tg.stage(G).length < Tg.maxStage(G);
    t.recs.push(rec); t.stats.hired++;
    if (!silent) say(G, 'Đã thuê ' + P0.vi);
    mergeAll(G);
    afterChange(G);
    for (const r of t.recs) resetRec(G, r);
    respawnAll(G); Tg.rebuild(G);
    SK.emit('tgcHire', G, rec);
    return { ok: true, rec };
  };
  Tg.buy = function (G, i) {
    const t = G.tgc, it = t.market[i];
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    if (!it || it.sold) return { ok: false, why: 'sold' };
    if (t.coins < it.price) return { ok: false, why: say(G, 'Không đủ vàng') };
    if (it.kind === 'perf') {
      const r = Tg.hire(G, it.id, it.price); if (!r.ok) return r;
      it.sold = true; t.stats.bought++; Tg.rebuild(G); return { ok: true, rec: r.rec };
    }
    if (t.bag.length >= C.bagMax) return { ok: false, why: say(G, 'Túi đầy') };
    t.coins -= it.price; it.sold = true; t.stats.bought++;
    t.bag.push({ kind: it.kind, id: it.id, r: it.r, price: it.price });
    P.buys = (P.buys || 0) + 1;
    say(G, 'Đã mua ' + itemName(it)); Tg.rebuild(G); SK.emit('tgcBuy', G, it);
    return { ok: true };
  };
  Tg.refresh = function (G) {
    const t = G.tgc;
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    if (t.freeRefresh > 0) { t.freeRefresh--; say(G, 'Làm mới chợ miễn phí'); }
    else if (t.coins < C.refresh) return { ok: false, why: say(G, 'Không đủ vàng') };
    else { t.coins -= C.refresh; say(G, 'Đã làm mới chợ'); }
    Tg.rollMarket(G, true); Tg.rebuild(G); SK.emit('tgcRefresh', G);
    return { ok: true };
  };
  Tg.lock = function (G) {
    const t = G.tgc; if (t.phase !== 'market') return { ok: false };
    const live = t.market.filter(it => !it.sold), all = live.every(it => it.locked);
    for (const it of live) it.locked = !all;
    say(G, all ? 'Đã mở khoá chợ' : 'Đã khoá chợ cho vòng sau', 1.6); Tg.rebuild(G); return { ok: true, locked: !all };
  };
  Tg.upgradeMarket = function (G) {
    const t = G.tgc;
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    if (t.level >= C.marketMax) return { ok: false, why: say(G, 'Chợ đã ở cấp cao nhất') };
    const cost = C.marketCost[t.level + 1];
    if (t.coins < cost) return { ok: false, why: say(G, 'Không đủ vàng') };
    t.coins -= cost; t.level++;
    say(G, 'Chợ lên cấp ' + t.level + ': ra sân tối đa ' + t.level + ' diễn viên');
    // diễn viên dự bị tự lên sân khi có chỗ
    for (const rec of t.recs) if (!rec.on && Tg.stage(G).length < t.level) rec.on = true;
    afterChange(G); respawnAll(G);
    for (const r of t.recs) resetRec(G, r);
    SK.emit('tgcMarketUp', G, t.level);
    return { ok: true, level: t.level };
  };
  // bán: trả đúng giá đã mua (diễn viên nâng sao thì cộng dồn); trang bị trả về túi [WIKI GC "Market"]
  Tg.sellPerf = function (G, rec) {
    const t = G.tgc; rec = rec || Tg.target(G);
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    if (!rec) return { ok: false, why: say(G, 'Không có diễn viên nào') };
    if (t.recs.length <= 1 && false) return { ok: false };
    if (rec.wid) t.bag.push({ kind: 'weapon', id: rec.wid, r: WEAP[rec.wid].r, price: C.price[WEAP[rec.wid].r] });
    for (const b of rec.buffs) t.bag.push({ kind: 'buff', id: b, r: BUFF[b].r, price: C.price[BUFF[b].r] });
    for (const dr of rec.drinks) t.bag.push({ kind: 'drink', id: dr, r: DRINK[dr].r, price: C.price[DRINK[dr].r] });
    t.coins += rec.paid; t.recs.splice(t.recs.indexOf(rec), 1);
    say(G, 'Sa thải ' + PERF[rec.id].vi + ', hoàn ' + rec.paid + ' vàng');
    for (const r of t.recs) if (!r.on && Tg.stage(G).length < t.level) r.on = true;
    afterChange(G); respawnAll(G); for (const r of t.recs) resetRec(G, r);
    SK.emit('tgcSell', G, rec);
    return { ok: true, refund: rec.paid };
  };
  Tg.trash = function (G) {
    const t = G.tgc;
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    if (!t.bag.length) return { ok: false, why: say(G, 'Túi trống') };
    const it = t.bag.shift(); t.coins += it.price;
    say(G, 'Bán ' + itemName(it) + ', nhận ' + it.price + ' vàng'); Tg.rebuild(G); SK.emit('tgcTrash', G, it);
    return { ok: true, it };
  };
  Tg.bagNext = function (G) { const t = G.tgc; if (t.bag.length > 1) t.bag.push(t.bag.shift()); Tg.rebuild(G); return t.bag[0] || null; };
  // dùng món đầu túi: vũ khí thay cho diễn viên gần nhất (vũ khí cũ vào túi), thiên phú tối đa 3, thức uống cộng dồn, di sản dùng ngay
  Tg.useBag = function (G) {
    const t = G.tgc;
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    const it = t.bag[0]; if (!it) return { ok: false, why: say(G, 'Túi trống') };
    if (it.kind === 'legacy') return useLegacy(G, it);
    const rec = Tg.target(G); if (!rec) return { ok: false, why: say(G, 'Không có diễn viên nào') };
    if (it.kind === 'weapon') {
      if (rec.wid) t.bag.push({ kind: 'weapon', id: rec.wid, r: WEAP[rec.wid].r, price: C.price[WEAP[rec.wid].r] });
      rec.wid = it.id;
    } else if (it.kind === 'buff') {
      if (rec.buffs.indexOf(it.id) >= 0) { Tg.bagNext(G); return { ok: false, why: say(G, PERF[rec.id].vi + ' đã có ' + itemName(it)) }; }
      if (rec.buffs.length >= BUFF_MAX) { Tg.bagNext(G); return { ok: false, why: say(G, PERF[rec.id].vi + ' đã đủ ' + BUFF_MAX + ' thiên phú') }; }
      rec.buffs.push(it.id);
    } else rec.drinks.push(it.id);
    t.bag.shift(); P.equips = (P.equips || 0) + 1;
    say(G, PERF[rec.id].vi + ' nhận ' + itemName(it));
    afterChange(G); resetRec(G, rec); SK.emit('tgcEquip', G, rec, it);
    return { ok: true, rec, it };
  };
  function useLegacy(G, it) {
    const t = G.tgc;
    if (it.id === 'gem') { const n = 1 + Math.floor(rnd() * 6); t.coins += n; say(G, 'Đá Ba Tư: +' + n + ' vàng'); }
    else if (it.id === 'codex') { t.freeRefresh++; say(G, 'Pháp Điển Hammurabi: 1 lần làm mới miễn phí'); }
    else if (it.id === 'spring') { if (t.pop >= C.pop) return { ok: false, why: say(G, 'Độ nổi tiếng đã đầy') }; t.pop++; setPop(G); say(G, 'Suối Nhật Nguyệt: +1 nổi tiếng'); }
    else if (it.id === 'brush') {
      const rec = Tg.target(G); if (!rec) return { ok: false, why: say(G, 'Không có diễn viên nào') };
      if (t.recs.length >= C.maxOwn) return { ok: false, why: say(G, 'Không thuê diễn viên được nữa') };
      t.bag.shift(); const c = mkRec(G, rec.id); c.paid = 0; c.on = Tg.stage(G).length < t.level; t.recs.push(c);
      mergeAll(G); afterChange(G); respawnAll(G); for (const r of t.recs) resetRec(G, r);
      say(G, 'Cọ Tiên: sao chép ' + PERF[rec.id].vi); return { ok: true };
    }
    t.bag.shift(); Tg.rebuild(G); SK.emit('tgcLegacy', G, it); return { ok: true };
  }
  Tg.legacy = function (G, id) { G.tgc.bag.push({ kind: 'legacy', id, r: 1, price: 0 }); say(G, 'Nhận Di Sản Văn Minh: ' + LEGACY[id].n); Tg.rebuild(G); };
  // đổi chỗ: diễn viên gần nhất ra sân / về dự bị
  Tg.toggleStage = function (G) {
    const t = G.tgc;
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    const rec = Tg.target(G); if (!rec) return { ok: false, why: say(G, 'Không có diễn viên nào') };
    if (!rec.on) { if (Tg.stage(G).length >= t.level) return { ok: false, why: say(G, 'Sân đã đủ ' + t.level + ' diễn viên, nâng chợ để thêm chỗ') }; rec.on = true; }
    else rec.on = false;
    say(G, PERF[rec.id].vi + (rec.on ? ' ra sân' : ' về dự bị'));
    afterChange(G); respawnAll(G); for (const r of t.recs) resetRec(G, r);
    return { ok: true, rec };
  };
  Tg.cycleCmd = function (G) {
    const t = G.tgc, l = C.cmdOrder.filter(cmdOpen); if (!l.length) return null;
    t.cmd = l[(l.indexOf(t.cmd) + 1) % l.length]; P.cmd = t.cmd; save(); say(G, 'Kỹ năng chỉ huy: ' + C.cmd[t.cmd].name + ' (' + C.cmd[t.cmd].cost + ' NL)', 1.6); Tg.rebuild(G); return t.cmd;
  };
  Tg.cycleDiff = function (G) {
    const t = G.tgc;
    if (t.round > 1 || t.phase !== 'market' || t.stats.rounds > 0) return { ok: false, why: say(G, 'Chỉ đổi độ khó trước vòng 1') };
    const mx = Math.min(C.diffs, P.won + 1);
    t.diff = t.diff % mx + 1; P.diff = t.diff; save(); say(G, 'Độ khó ' + t.diff + (t.diff > 1 ? ' (đã mở)' : ''), 1.6); Tg.rebuild(G);
    return { ok: true, diff: t.diff };
  };
  Tg.toggleWhistle = function (G) {
    const t = G.tgc; t.gather = !t.gather; say(G, t.gather ? 'Tập hợp!' : 'Xuất kích!', 1.4); SK.emit('tgcWhistle', G, t.gather); return t.gather;
  };

  // ============================================================ mèo: chỉ huy
  Tg.cast = function (G) {
    const t = G.tgc, p = G.player, c = C.cmd[t.cmd];
    if (p.energy < c.cost) { G.toast('Chưa đủ năng lượng (' + c.cost + ')'); return false; }
    const stage = Tg.stage(G).filter(r => !r.dead);
    const al = r => Tg.allyOf(G, r);
    if (t.cmd === 'heal') {
      let n = 0;
      for (const r of stage) { const a = al(r); if (!a || Math.hypot(a.x - p.x, a.y - p.y) > C.healR) continue; const d = Tg.stat(G, r); r.hp = Math.min(d.hp, r.hp + d.hp * c.v); n++; K().fx(G, 'effect_health_skill', a.x, a.y - 8, { scale: 0.6 }); SK.num(G, a.x, a.y - 24, '+' + Math.round(d.hp * c.v), '#6cff8a'); }
      if (!n) { G.toast('Không có diễn viên nào ở gần'); return false; }
    } else if (t.cmd === 'haste') { for (const r of stage) { const a = al(r); if (a) a.hasteT = c.t; } }
    else if (t.cmd === 'brute') { for (const r of stage) { const a = al(r); if (a) a.bruteT = c.t; } }
    else if (t.cmd === 'frost') {
      const es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn' && e.hp > 0).slice(0, C.frostN);
      if (!es.length) { G.toast('Chưa có địch'); return false; }
      for (const e of es) { K().hit(G, p, e, C.frostHit, { noMul: true, repel: 1, fx: 'hit_blue' }); try { K().debuff(G, e, 'ice'); } catch (er) { /* bỏ */ } }
    } else if (t.cmd === 'packet') { const n = C.cmd.packet.min + Math.floor(rnd() * (C.cmd.packet.max - C.cmd.packet.min + 1)); t.coins += n; SK.num(G, p.x, p.y - 28, '+' + n + ' vàng', '#ffd84a'); }
    else if (t.cmd === 'shield') {
      let best = null, bd = 1e9; for (const r of stage) { const a = al(r); if (!a) continue; const dd = Math.hypot(a.x - p.x, a.y - p.y); if (dd < bd) { bd = dd; best = a; } }
      if (!best) { G.toast('Không có diễn viên nào'); return false; }
      best.shieldT = c.t; best.shieldGain = 0;
    }
    p.energy -= c.cost; SK.fx(G, 'ring', p.x, p.y - 8, { dur: 0.4, color: '#ffd84a' });
    Tg.pf(null, 'commander_ability_start');
    SK.emit('tgcCmd', G, t.cmd); Tg.stats.cmds = (Tg.stats.cmds || 0) + 1;
    return true;
  };
  Tg.stats = {};
  SK.SKILLS.tgc_cmd = { start(G) { if (on(G)) Tg.cast(G); }, special(G) { if (on(G)) Tg.toggleWhistle(G); }, pressCd() {} };

  // vũ khí vô hình của mèo (nút đánh không làm gì); không liệt kê để khỏi rơi vào bể đồ
  Object.defineProperty(DS.weapons, 'tgc_pet', { configurable: true, writable: true, enumerable: false, value: {
    name: 'Đạo Diễn', nameEn: 'Director', kind: 'tgcpet', dmg: 0, crit: 0, rps: 1, cost: 0, grade: 1, rarity: 'White', sprite: null, moveMod: 0 } });
  SK.WEAPON_KINDS.tgcpet = { fire() { /* mèo không đánh */ } };

  // ============================================================ vào ván: mèo, tiền, đội hình
  SK.on('runStart', G => {
    if (!on(G)) return;
    const p = G.player, t = G.tgc;
    p.hpMax = C.pop; p.hp = t.pop; p.armorMax = 0; p.armor = 0; p.energyMax = C.energy; p.energy = C.energy;   // thanh máu của mèo = độ nổi tiếng
    p.weapons = [SK.makeWeapon('tgc_pet'), null]; p.cur = 0; p.hideHeld = true;
    p.petId = D.prefabs.pet42 ? 'pet42' : 'pet0';   // Đạo Diễn Tiêu Đen [LOC Pet_name_42]
    const h2 = {}; for (const k in p.h) h2[k] = p.h[k];
    h2.skill = Object.assign({}, p.h.skill, { id: 'tgc_cmd', cd: 0.3 }); p.h = h2;
    G._tgcOff = true; P.runs++; save();
    Tg.rollMarket(G, false); Tg.rebuild(G);
  });
  function setPop(G) { const t = G.tgc, p = G.player; if (p) { p.hpMax = C.pop; p.hp = Math.max(0, t.pop); } }
  // mèo không nhận sát thương; đạn/đòn trúng mèo đổ lên diễn viên gần nhất (như js/troop.js)
  const hurtPlayer0 = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, x, y, ...rest) {
    if (!on(G)) return hurtPlayer0(G, dmg, x, y, ...rest);
    if (dmg > 0 && G.tgc.phase === 'battle') {
      const p = G.player, rx = x != null ? x : p.x, ry = y != null ? y : p.y;
      let best = null, bd = 1e9;
      for (const r of Tg.stage(G)) { const a = Tg.allyOf(G, r); if (!a || r.dead || a.dead || a.gone) continue; const dd = Math.hypot(a.x - rx, a.y - ry); if (dd < bd) { bd = dd; best = [r, a]; } }
      if (best) { Tg.hurt(G, best[1], best[0], dmg * Tg.atkMul(G.tgc.round, G.tgc.diff)); if (best[0].hp <= 0 && !best[1].dead) { best[1].dead = true; best[1].onDie(G, best[1]); } }
    }
    return false;
  };
  const drawPlayer0 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    if (!on(G) || !G.player || !G.player.petId) return drawPlayer0(ctx, G);
    const p = G.player, parts = D.prefabs[p.petId];
    const st = p.moving ? 'run' : 'ide';
    ctx.save(); ctx.globalAlpha = G.phase === 'portal' ? Math.max(0, 1 - G.phaseT / 0.6) : 1;
    if (!parts || !SK.drawPrefab(ctx, parts, p.x, p.y, { state: st, t: p.t, flip: p.face < 0 })) { ctx.fillStyle = '#e8b45a'; ctx.fillRect(p.x - 6, p.y - 12, 12, 12); }
    else Tg.drawn[p.petId] = (Tg.drawn[p.petId] || 0) + 1;
    ctx.restore();
  };
  // vẽ một prefab gốc, ghi khoá đã vẽ (bộ kiểm đọc Tg.drawn); ctx null = chỉ đăng ký hiệu ứng nổi
  Tg.pf = function (ctx, name, x, y, o) {
    const parts = SK.prefab(name); if (!parts) return false;
    if (!ctx) { const G = SK.G; if (G && G.player) { try { K().fx(G, name, G.player.x, G.player.y - 8, { scale: 0.7 }); Tg.drawn[name] = (Tg.drawn[name] || 0) + 1; } catch (e) { /* bỏ */ } } return true; }
    const ok = SK.drawPrefab(ctx, parts, x, y, o || {}); if (ok) Tg.drawn[name] = (Tg.drawn[name] || 0) + 1; return ok;
  };

  // ============================================================ sân khấu: quầy hàng, chợ, nút bắt đầu
  function clearBase(G) {
    for (const o of G.interactables) if (o.tg) o.gone = true;
    G.interactables = G.interactables.filter(o => !o.tg);
    G.props = G.props.filter(pr => !pr.tg);
  }
  function stand(G, x, y, label, use, draw) {
    G.interactables.push({ tg: 1, x, y: y + 4, r: 14, labelY: 34, get label() { return typeof label === 'function' ? label() : label; }, use: () => use(G) });
    G.props.push({ tg: 1, x, y, draw: (ctx, G2) => draw(ctx, G2, x, y) });
  }
  const BOTTLE = { coconut: '#f4f0e0', wine: '#a83a5a', clam: '#cfd6e8', dumpling: '#fff3c8', bloody: '#d02a2a', steak: '#8a4a2a', coffee: '#6a4a2a', noodle: '#e8d89a', milk: '#ffffff', juice: '#ff9a3a' };
  function drawItem(ctx, G, it, X, Y) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X, Y, 8, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    if (it.sold) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(X - 5, Y - 2, 10, 3); return; }
    ctx.strokeStyle = RCOL[it.r]; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(X, Y, 10, 3.4, 0, 0, Math.PI * 2); ctx.stroke();
    if (it.kind === 'perf') drawHero(ctx, PERF[it.id].hero, X, Y, G.t, false, 1, false, false);
    else if (it.kind === 'weapon') { const w = WEAP[it.id]; if (w && w.sprite) SK.drawGun(ctx, w.sprite, X - 6, Y - 8, 0, null, {}); else { ctx.fillStyle = RCOL[it.r]; ctx.fillRect(X - 5, Y - 9, 10, 6); } }
    else if (it.kind === 'buff') { ctx.fillStyle = RCOL[it.r]; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(X, Y - 8, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; SK.text(ctx, '+', X, Y - 5, 7, '#fff', 'center', 'rgba(0,0,0,0.8)'); }
    else if (it.kind === 'drink') { ctx.fillStyle = BOTTLE[it.id] || '#fff'; ctx.fillRect(X - 3, Y - 12, 6, 12); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(X - 3, Y - 12, 6, 2); }
    else { ctx.fillStyle = '#ffd84a'; ctx.fillRect(X - 5, Y - 10, 10, 10); SK.text(ctx, 'o', X, Y - 3, 7, '#7a4a10', 'center'); }
  }
  const infoOf = it => {
    if (it.kind === 'perf') { const P0 = PERF[it.id]; return P0.vi + ' (' + RAR[P0.r] + ')'; }
    if (it.kind === 'weapon') return 'Vũ khí ' + itemName(it) + ' (' + RAR[it.r] + ')';
    if (it.kind === 'buff') return 'Thiên phú ' + itemName(it) + ': ' + BUFF[it.id].d;
    if (it.kind === 'drink') return 'Thức uống ' + itemName(it) + ': ' + DRINK[it.id].d;
    return 'Di sản ' + itemName(it) + ': ' + LEGACY[it.id].d;
  };
  Tg.infoOf = infoOf;
  Tg.rebuild = function (G) {
    if (!on(G) || !G.tgc.base) return;
    clearBase(G);
    const t = G.tgc, b = t.base, bx = b.x, by = b.y;
    if (t.phase !== 'market') return;
    // hàng chợ phía trên
    t.market.forEach((it, i) => {
      const x = bx + (i - 1.5) * 38, y = by - 62;
      stand(G, x, y, () => it.sold ? 'Đã bán' : (it.kind === 'perf' ? 'Thuê ' : 'Mua ') + infoOf(it) + ' (' + it.price + ' vàng)' + (it.locked ? ' [khoá]' : ''), g => Tg.buy(g, i),
        (ctx, G2, X, Y) => { drawItem(ctx, G2, it, X, Y); if (!it.sold) { SK.text(ctx, String(it.price), X, Y - 22, 7, '#ffd84a', 'center', 'rgba(0,0,0,0.9)'); if (it.locked) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(X + 6, Y - 14, 5, 4); } } });
    });
    const nc = t.level < C.marketMax ? C.marketCost[t.level + 1] : 0;
    stand(G, bx + 92, by - 32, () => t.level < C.marketMax ? 'Nâng chợ lên cấp ' + (t.level + 1) + ' (' + nc + ' vàng): thêm 1 chỗ ra sân' : 'Chợ cấp cao nhất', g => Tg.upgradeMarket(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#7a5a3a'; ctx.fillRect(X - 7, Y - 12, 14, 12); ctx.fillStyle = '#e0453a'; ctx.fillRect(X - 9, Y - 16, 18, 5); SK.text(ctx, String(t.level), X, Y - 3, 8, '#fff', 'center', 'rgba(0,0,0,0.9)'); });
    stand(G, bx + 92, by - 4, () => (t.freeRefresh > 0 ? 'Làm mới chợ (miễn phí)' : 'Làm mới chợ (' + C.refresh + ' vàng)'), g => Tg.refresh(g),
      (ctx, G2, X, Y) => { ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, Y - 6, 5, 0.4, 5.6); ctx.stroke(); ctx.fillStyle = '#7fe0ff'; ctx.fillRect(X + 2, Y - 13, 4, 3); });
    stand(G, bx + 92, by + 24, () => 'Khoá / mở khoá hàng trong chợ cho vòng sau', g => Tg.lock(g),
      (ctx, G2, X, Y) => { const lk = t.market.some(it => it.locked && !it.sold); ctx.fillStyle = lk ? '#ffd84a' : '#8a93a3'; ctx.fillRect(X - 5, Y - 8, 10, 8); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, Y - 9, 3.5, Math.PI, 0); ctx.stroke(); });
    // bên trái: túi, thùng rác, sa thải, đổi chỗ
    const bg = t.bag[0], tg = Tg.target(G);
    stand(G, bx - 92, by - 32, () => bg ? 'Túi: dùng ' + infoOf(bg) + (bg.kind !== 'legacy' && tg ? ' cho ' + PERF[tg.id].vi : '') : 'Túi trống', g => Tg.useBag(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#7a5a3a'; ctx.fillRect(X - 7, Y - 10, 14, 10); ctx.fillStyle = '#c8a050'; ctx.fillRect(X - 7, Y - 10, 14, 3); SK.text(ctx, String(t.bag.length), X, Y - 2, 7, '#fff', 'center', 'rgba(0,0,0,0.9)'); });
    stand(G, bx - 92, by - 4, () => 'Túi: xem món kế tiếp', g => { Tg.bagNext(g); },
      (ctx, G2, X, Y) => { ctx.fillStyle = '#c8a050'; ctx.fillRect(X - 5, Y - 7, 10, 7); ctx.fillStyle = '#fff'; ctx.fillRect(X - 3, Y - 5, 6, 1); });
    stand(G, bx - 92, by + 24, () => bg ? 'Thùng rác: bán ' + itemName(bg) + ' (nhận ' + bg.price + ' vàng)' : 'Thùng rác (túi trống)', g => Tg.trash(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#5a6a7a'; ctx.fillRect(X - 5, Y - 10, 10, 10); ctx.fillStyle = '#7a8a9a'; ctx.fillRect(X - 6, Y - 12, 12, 2); });
    stand(G, bx - 92, by + 50, () => tg ? 'Sa thải ' + PERF[tg.id].vi + ' (hoàn ' + tg.paid + ' vàng, trang bị về túi)' : 'Sa thải diễn viên gần nhất', g => Tg.sellPerf(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#d86a8a'; ctx.fillRect(X - 5, Y - 7, 10, 5); ctx.fillRect(X - 4, Y - 11, 2, 4); ctx.fillRect(X + 1, Y - 11, 2, 4); });
    stand(G, bx + 92, by + 50, () => tg ? (tg.on ? 'Đưa ' + PERF[tg.id].vi + ' về dự bị' : 'Đưa ' + PERF[tg.id].vi + ' ra sân') + ' (sân ' + Tg.stage(G).length + '/' + t.level + ')' : 'Đổi chỗ diễn viên gần nhất', g => Tg.toggleStage(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#4a8ae8'; ctx.fillRect(X - 6, Y - 6, 12, 5); ctx.fillStyle = '#fff'; ctx.fillRect(X - 4, Y - 11, 3, 4); ctx.fillRect(X + 1, Y - 11, 3, 4); });
    // hàng dưới: độ khó, bắt đầu vòng, kỹ năng chỉ huy
    stand(G, bx - 62, by + 72, () => t.stats.rounds === 0 && t.round === 1 ? 'Độ khó ' + t.diff + ' (bấm để đổi; mở tới độ ' + Math.min(C.diffs, P.won + 1) + ')' : 'Độ khó ' + t.diff, g => Tg.cycleDiff(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#5a4a8a'; ctx.fillRect(X - 6, Y - 10, 12, 10); SK.text(ctx, String(t.diff), X, Y - 2, 8, '#fff', 'center', 'rgba(0,0,0,0.9)'); });
    stand(G, bx, by + 72, () => 'Bắt đầu vòng ' + t.round + '/' + C.rounds + (C.bossRounds.indexOf(t.round) >= 0 ? ' (trùm)' : t.round === C.finalRound ? ' (Vua Ti Vi)' : '') + ' (' + Tg.stage(G).length + ' diễn viên ra sân)', g => Tg.startRound(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#2f8a4a'; ctx.fillRect(X - 9, Y - 10, 18, 10); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(X - 3, Y - 8); ctx.lineTo(X + 4, Y - 5); ctx.lineTo(X - 3, Y - 2); ctx.fill(); });
    stand(G, bx + 62, by + 72, () => 'Kỹ năng chỉ huy: ' + C.cmd[t.cmd].name + ' (' + C.cmd[t.cmd].cost + ' NL), bấm để đổi', g => Tg.cycleCmd(g),
      (ctx, G2, X, Y) => { ctx.fillStyle = '#e8a43a'; ctx.fillRect(X - 6, Y - 10, 12, 10); SK.text(ctx, '★', X, Y - 2, 8, '#fff', 'center', 'rgba(0,0,0,0.9)'); });
  };

  // ============================================================ vòng đấu
  const pts = (round, diff) => C.pts0 + C.ptsGrow * (round - 1);
  Tg.pts = pts;
  Tg.hpMul = (round, diff) => (1 + C.hpGrow * (round - 1)) * (1 + C.hpDiff * (diff - 1));
  Tg.atkMul = (round, diff) => 1 + C.atkGrow * (round - 1) + C.atkDiff * (diff - 1);
  const consume = id => { const a = D.enemies[id] && D.enemies[id].ai && D.enemies[id].ai[0]; return (a && a.p && a.p.consume) || 1; };
  function tierThemes(round) {
    const lv = round <= 5 ? 1 : round <= 10 ? 2 : 3;
    return Object.keys(D.themes).filter(k => D.themes[k].level === lv);
  }
  function rosterOf(round) {
    const ids = [];
    for (const th of tierThemes(round)) for (const id of (D.themes[th].enemies || [])) if (D.enemies[id] && !/^ex_/.test(id) && !D.enemies[id].boss && ids.indexOf(id) < 0) ids.push(id);
    return ids;
  }
  Tg.waveList = function (G, round, diff) {
    const roster = rosterOf(round), total = pts(round, diff), waves = [];
    C.waveSplit.forEach((f, wi) => {
      let budget = total * f; const list = [];
      while (budget > 0) { const cand = roster.filter(id => consume(id) <= budget); if (!cand.length) break; const id = SK.pick(cand); budget -= consume(id); list.push(id); }
      if (!list.length) list.push(roster[0]);
      waves.push(list);
    });
    // vòng có cờ: làn cuối là Tinh Anh [WIKI GC "Enemies"]
    if (C.champRounds.indexOf(round) >= 0) {
      const th = D.themes[tierThemes(round)[0]], ex = (th && th.elites) || {};
      waves[waves.length - 1] = waves[waves.length - 1].map(id => (ex[id] && D.enemies[ex[id]] ? ex[id] : id));
    }
    return waves;
  };
  function bossIds(G, round, diff) {
    const th = tierThemes(round)[0], g2 = Object.create(G); g2.stage = { theme: th, level: D.themes[th].level, label: 'GC', boss: true };
    let ids = [];
    try { ids = (SK.bossWaves(g2, G.map.rooms[0])[0] || []).slice(0, 1); } catch (er) { ids = []; }
    if (round === C.finalRound) { /* Vua Ti Vi: chưa có Spine, dùng trùm tầng 3 thay (GAPS) */ }
    else if (diff >= 3) {   // độ 3 trở lên: 2 trùm khác nhau trừ Vua Ti Vi [WIKI GC]
      for (let k = 0; k < 12 && ids.length < 2; k++) { try { const b = (SK.bossWaves(g2, G.map.rooms[0])[0] || [])[0]; if (b && ids.indexOf(b) < 0) ids.push(b); } catch (er) { /* bỏ */ } }
    }
    return ids.filter(Boolean);
  }
  function spawnAt(G, id, i, tag) {
    const r = G.map.rooms[0], pts0 = (r.spawnPts || []).map(([x, y]) => [x * T + 8, y * T + 12]), p = G.player;
    let list = SK.shuffle(pts0.filter(([x, y]) => !W.solidAt(G.map, x, y)));
    const far = list.filter(([x, y]) => Math.hypot(x - p.x, y - p.y) > 56); if (far.length) list = far;
    const [x, y] = list.length ? list[i % list.length] : [G.tgc.base.x, G.tgc.base.y - 60];
    const e = SK.makeEnemy(G, id, x, y, r);
    if (!e) return null;
    e.tg = tag || 1; G.enemies.push(e); return e;
  }
  Tg.startRound = function (G) {
    const t = G.tgc;
    if (t.phase !== 'market') return { ok: false, why: 'phase' };
    const stage = Tg.stage(G);
    if (!stage.length) return { ok: false, why: say(G, 'Chưa có diễn viên ra sân') };
    t.phase = 'battle'; t.bt = 0; t.waveI = 0; t.bossSpawned = false; t.drops = [];
    t.boss = C.bossRounds.indexOf(t.round) >= 0 || t.round === C.finalRound;
    t.timer = t.boss ? C.timerBoss : C.timer; t.timerMax = t.timer;
    t.waves = Tg.waveList(G, t.round, t.diff); t.queue = [];
    for (const r of t.recs) resetRec(G, r);
    for (const r of stage) if (hasBuff(r, 'ace')) { const w0 = Tg.weaponOf(r); const cur = r.wid ? WEAP[r.wid].r : 0; const l = Object.keys(WEAP).filter(k => WEAP[k].r >= cur && WEAP[k].r > 0); if (l.length) { const w = WEAP[SK.pick(l)]; r.bw = { n: w.n, d: w.d, c: w.c, k: w.k, en: w.en }; } void w0; }
    // dựng lại thân xác ở vị trí đứng
    respawnAll(G);
    for (const a of t.allies.values()) { a.cd = 0.4; a.cast = null; }
    clearBase(G);
    G.player.energy = Math.min(C.energy, G.player.energy);
    say(G, 'Vòng ' + t.round + '/' + C.rounds + ' bắt đầu!', 2);
    SK.emit('tgcRound', G, t.round);
    return { ok: true };
  };
  function aliveFoes(G) { return G.enemies.filter(e => e.tg && e.st !== 'dead'); }
  Tg.aliveFoes = aliveFoes;
  function spawnWave(G, wi) {
    const t = G.tgc, ids = t.waves[wi]; if (!ids) return;
    const hm = Tg.hpMul(t.round, t.diff);
    ids.forEach((id, i) => { const e = spawnAt(G, id, i); if (e) { e.hpMax = e.hp = Math.max(1, Math.round(e.hp * hm)); e.tgPts = consume(id); } });
    SK.emit('tgcWave', G, wi);
    if (wi > 0) say(G, 'Làn quái ' + (wi + 1) + '/' + t.waves.length, 1.6);
  }
  function spawnBosses(G) {
    const t = G.tgc, ids = bossIds(G, t.round, t.diff); t.bossSpawned = true;
    const bm = 1 + C.bossHpDiff * (t.diff - 1);
    ids.forEach((id, i) => { const e = spawnAt(G, id, i * 3); if (e) { e.tgBoss = true; e.hpMax = e.hp = Math.round(e.hp * bm); } });
    say(G, t.round === C.finalRound ? 'Vua Ti Vi xuất hiện!' : 'Trùm xuất hiện!', 2.5);
    SK.emit('tgcBoss', G, ids);
  }
  SK.on('enemyKill', (G, e) => {
    if (!on(G) || !e.tg) return;
    const t = G.tgc; t.stats.kills++;
    for (const rec of Tg.stage(G)) if (hasBuff(rec, 'mom')) rec.mom = (rec.mom || 0) + 1;
    if (e.tgBoss) return;
    const r = rnd();
    if (r < C.dropCoin) t.drops.push({ k: 'coin', x: e.x, y: e.y - 2, t: 0 });
    else if (r < C.dropCoin + C.dropOrb) t.drops.push({ k: 'orb', x: e.x, y: e.y - 2, t: 0 });
  });
  function updateDrops(G, dt) {
    const t = G.tgc, p = G.player;
    for (const c of t.drops) {
      c.t += dt; const dist = Math.hypot(p.x - c.x, p.y - 4 - c.y);
      if (c.t > 0.3 && dist < 36) { c.x += (p.x - c.x) / dist * 110 * dt; c.y += (p.y - 4 - c.y) / dist * 110 * dt; }
      if (c.t > 0.3 && dist < 8) collect(G, c);
    }
    t.drops = t.drops.filter(c => !c.got);
  }
  function collect(G, c) {
    if (c.got) return; c.got = true; const t = G.tgc, p = G.player;
    if (c.k === 'coin') { t.coins++; t.coinsGot = (t.coinsGot || 0) + 1; SK.num(G, p.x, p.y - 28, '+1', '#ffd84a'); }
    else { p.energy = Math.min(C.energy, p.energy + C.orb); SK.num(G, p.x, p.y - 28, '+' + C.orb + ' NL', '#4ab8ff'); }
  }
  function endRound(G, won, why) {
    const t = G.tgc, p = G.player;
    if (t.phase !== 'battle') return;
    // dọn: địch còn lại, đạn địch; nhặt hết rơi vãi
    for (const e of G.enemies) if (e.st !== 'dead') { e.st = 'dead'; e.hp = 0; e.stT = 9; }
    for (const b of G.bullets) if (b.side === 'e') b.dead = true;
    for (const c of t.drops) collect(G, c); t.drops = [];
    t.stats.rounds++;
    t.lastRound = { won, round: t.round, sec: Math.round(t.bt), deaths: Tg.stage(G).filter(r => r.dead).length, lost: Math.round(Tg.stage(G).reduce((q, r) => q + (r.lost || 0), 0)), team: Tg.stage(G).length };
    for (const rec of Tg.stage(G)) { rec.mom = 0; }
    const lastRound = t.round === C.finalRound;
    if (won && lastRound) { finishWin(G); return; }
    // vàng cuối vòng, kể cả vòng thua [WIKI GC: "after each round ends"]
    const gain = C.coins[t.diff][t.round - 1] || 0;
    t.coins += gain; t.lastGain = gain;
    const brill = Tg.synTier(G, 'brilliant');   // bậc 1 (2 diễn viên): thua có 50% nhận di sản, thua liên tiếp tăng tới 100%; bậc 2 (4): hết trận nào cũng nhận
    if (won) {
      t.loseRun = 0; t.round++;
      if (Tg.synTier(G, 'ancient') >= 1) t.ancWins++;
      if (brill >= 2) Tg.legacy(G, SK.pick(Object.keys(LEGACY)));
      say(G, 'Qua vòng ' + (t.round - 1) + '! +' + gain + ' vàng', 2.5);
    } else {
      t.loseRun++; t.stats.lost++;
      const loss = why === 'bosses2' ? 2 : 1;
      t.pop = Math.max(0, t.pop - loss); setPop(G);
      if (brill >= 1 && (brill >= 2 || rnd() < Math.min(1, 0.5 + 0.25 * (t.loseRun - 1)))) Tg.legacy(G, SK.pick(Object.keys(LEGACY)));
      say(G, (why === 'time' || why === 'bosses2' ? 'Hết giờ!' : 'Diễn viên gục hết!') + ' -' + loss + ' nổi tiếng, +' + gain + ' vàng', 3);
      if (t.pop <= 0) { loseGame(G); return; }
    }
    // hồi sinh và về đội hình
    t.phase = 'market';
    for (const r of t.recs) resetRec(G, r);
    respawnAll(G); Tg.rollMarket(G, true); for (const it of t.market) it.locked = false;
    G.player.x = t.base.x; G.player.y = t.base.y + 34; Tg.refreshSyn(G); Tg.rebuild(G);
    SK.emit('tgcRoundEnd', G, won);
  }
  Tg.endRound = endRound;
  function loseGame(G) {
    const t = G.tgc, p = G.player; t.lost = true; t.phase = 'over';
    say(G, 'Hết độ nổi tiếng: chương trình bị huỷ', 3);
    p.hp = 0; p.st = 'dead'; p.stT = 0;   // đường chết của engine: sau 1,3 s hiện màn thua và phát runEnd
    if (G.onPlayerDead) G.onPlayerDead();
  }
  function finishWin(G) {
    const t = G.tgc, p = G.player; t.won = true; t.phase = 'over';
    say(G, 'Hạ Vua Ti Vi! Chương trình thành công!', 3);
    G.portal = { x: p.x, y: p.y + 8, t: 0 };   // đường thắng của engine: bước vào cổng, hết ải cuối thì victory + runEnd
  }
  // vòng lặp mỗi khung: làn quái, đồng hồ, thắng/thua vòng, rơi vãi
  Tg.line = (G, x, y, x2, y2, color, dur) => { G.tgc.lines.push({ x, y, x2, y2, color, t: 0, dur: dur || 0.2 }); };
  function tickRound(G, dt) {
    const t = G.tgc, p = G.player;
    for (const f of t.lines) f.t += dt;
    t.lines = t.lines.filter(f => f.t < f.dur);
    // mèo không ra khỏi sân
    const r = G.map.rooms[0], x0 = r.x0 * T + 10, x1 = (r.x1 + 1) * T - 10, y0 = r.y0 * T + 14, y1 = (r.y1 + 1) * T - 6;
    p.x = Math.max(x0, Math.min(x1, p.x)); p.y = Math.max(y0, Math.min(y1, p.y));
    if (t.phase !== 'battle') return;
    t.bt += dt; t.timer -= dt;
    p.energy = Math.min(C.energy, p.energy);
    updateDrops(G, dt);
    while (t.waveI < t.waves.length && t.bt >= C.waveAt[t.waveI]) { spawnWave(G, t.waveI); t.waveI++; }
    const alive = aliveFoes(G);
    // làn kế tới sớm nếu đã quét sạch làn trước
    if (t.waveI < t.waves.length && !alive.length && t.bt > 2) { spawnWave(G, t.waveI); t.waveI++; }
    // thua: diễn viên ra sân chết hết
    const stage = Tg.stage(G);
    if (stage.length && stage.every(r2 => r2.dead || r2.hp <= 0)) { endRound(G, false, 'wipe'); return; }
    if (t.waveI >= t.waves.length && !alive.length) {
      if (t.boss && !t.bossSpawned) { spawnBosses(G); return; }
      endRound(G, true); return;
    }
    if (t.timer <= 0) {
      if (t.round === C.finalRound && t.bossSpawned) {   // trận Vua Ti Vi: hết giờ thì điểm nổi tiếng tụt nhanh tới 0 [WIKI GC]
        t.drain = (t.drain || 0) + dt;
        if (t.drain >= 1 / C.tyrantDrain) { t.drain = 0; t.pop = Math.max(0, t.pop - 1); setPop(G); if (t.pop <= 0) { for (const e of G.enemies) if (e.st !== 'dead') { e.st = 'dead'; e.hp = 0; } t.phase = 'battle'; loseGame(G); } }
        return;
      }
      endRound(G, false, t.bossSpawned && aliveFoes(G).filter(e => e.tgBoss).length >= 2 ? 'bosses2' : 'time');
    }
  }

  // ============================================================ dựng sân khi vào ván
  SK.on('stageEnter', G => {
    if (!on(G)) return;
    const t = G.tgc, r = G.map.rooms[0], [cx, cy] = W.roomCenter(r);
    G.portal = null;
    for (const rm of G.map.rooms) if (rm !== r) rm.state = 'cleared';   // các phòng khác không khoá cửa hay sinh quái
    t.base = { x: cx, y: cy }; t.phase = 'market';
    G.player.x = cx; G.player.y = cy + 34;
    Tg.refreshSyn(G);
    // diễn viên đầu tiên: nhân vật chọn ở sảnh KHÔNG dùng; bắt đầu tay trắng và C.startCoins vàng
    G.props.push({ tgw: 1, x: 0, y: 1e9, draw() {}, update(G2, pr, dt) { if (!on(G2) || G2.state !== 'stage') return; tickRound(G2, dt); } });
    G.props.push({ tgw: 1, x: cx, y: cy + 100, draw(ctx, G2) { drawLayer(ctx, G2); } });
    Tg.rebuild(G);
    say(G, 'Đạo Diễn Tiêu Đen online! Thuê diễn viên ở chợ rồi bắt đầu vòng 1', 4);
  });
  function drawLayer(ctx, G) {
    const t = G.tgc;
    for (const c of t.drops) {
      const b = Math.sin(c.t * 6) * 1.2;
      if (c.k === 'coin') { if (!Tg.pf(ctx, 'coin_1', c.x, c.y + b, { t: c.t })) { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(c.x, c.y - 3 + b, 3, 0, Math.PI * 2); ctx.fill(); } }
      else if (!Tg.pf(ctx, 'energy', c.x, c.y + b, { t: c.t })) { ctx.fillStyle = '#4ab8ff'; ctx.beginPath(); ctx.arc(c.x, c.y - 3 + b, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const f of t.lines) { ctx.strokeStyle = f.color || '#fff'; ctx.lineWidth = 1; ctx.globalAlpha = Math.max(0, 1 - f.t / f.dur); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.globalAlpha = 1; }
  }

  // ============================================================ kết thúc ván: cập nhật hồ sơ, chữ ở màn kết
  SK.on('runEnd', (G, info) => {
    if (!on(G)) return;
    const t = G.tgc;
    P.best = Math.max(P.best || 0, t.round - (info.won ? 0 : 1));
    if (info.won) { P.won = Math.max(P.won, t.diff); const nx = C.cmdOrder[P.won]; if (nx) { /* kỹ năng chỉ huy mở theo độ đã thắng */ } }
    save();
    t.end = { won: !!info.won, round: t.round, diff: t.diff, pop: t.pop };
    Promise.resolve().then(() => {
      const e = document.getElementById(info.won ? 'sk-win-info' : 'sk-over-info'); if (!e) return;
      e.textContent = (info.won ? 'Đại Đại Chỉ Huy độ ' + t.diff + ': hạ Vua Ti Vi, hoàn tất 15 vòng' : 'Đại Đại Chỉ Huy độ ' + t.diff + ': dừng ở vòng ' + t.round + '/15') +
        ' · Nổi tiếng ' + t.pop + '/' + C.pop + ' · Hạ ' + G.kills + ' quái';
    });
  });

  // ============================================================ HUD
  SK.on('hud', (ctx, G) => {
    if (!on(G) || !G.map) return;
    const t = G.tgc, v = SK.view, stage = Tg.stage(G);
    const head = t.phase === 'battle'
      ? 'Vòng ' + t.round + '/' + C.rounds + ' · độ ' + t.diff + ' · còn ' + Math.max(0, Math.ceil(t.timer)) + ' giây · quái ' + aliveFoes(G).length
      : 'Vòng ' + t.round + '/' + C.rounds + ' · độ ' + t.diff + ' · chuẩn bị';
    SK.text(ctx, head, v.w / 2, 14, 9, '#fff', 'center', 'rgba(0,0,0,0.9)');
    SK.text(ctx, 'Vàng ' + t.coins + '   Nổi tiếng ' + t.pop + '/' + C.pop + '   Chợ ' + t.level + '   Ra sân ' + stage.length + '/' + t.level + '   Còi: ' + (t.gather ? 'Tập hợp' : 'Xuất kích'), v.w / 2, 26, 8, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
    if (t.phase === 'battle') {
      // thanh tiến độ: các làn quái đã hạ [WIKI GC "Enemies": thanh Tiêu Đen]
      const total = t.waves.reduce((s, w) => s + w.length, 0) + (t.boss ? 1 : 0), left = aliveFoes(G).length + t.waves.slice(t.waveI).reduce((s, w) => s + w.length, 0) + (t.boss && !t.bossSpawned ? 1 : 0);
      const bw = 120, bx = v.w / 2 - bw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, 32, bw, 5);
      ctx.fillStyle = '#e0453a'; ctx.fillRect(bx + 1, 33, (bw - 2) * (1 - left / Math.max(1, total)), 3);
    }
    // danh sách diễn viên ở dưới
    t.recs.forEach((rec, i) => {
      const d = Tg.stat(G, rec), x = 6 + i * 46, y = v.h - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, 44, 18);
      ctx.fillStyle = rec.dead ? '#555' : '#e0453a'; ctx.fillRect(x + 1, y + 1, 42 * Math.max(0, rec.hp) / d.hp, 3);
      ctx.fillStyle = '#9aa4b5'; ctx.fillRect(x + 1, y + 4, 42 * Math.max(0, rec.armor) / Math.max(1, d.armor), 2);
      ctx.fillStyle = '#4ab8ff'; ctx.fillRect(x + 1, y + 6, 42 * Math.min(1, rec.e / d.eMax), 2);
      SK.text(ctx, Array.from(PERF[rec.id].vi).slice(0, 8).join('').trim() + (rec.on ? '' : ' (dự bị)'), x + 22, y + 15, 5, RCOL[PERF[rec.id].r], 'center', 'rgba(0,0,0,0.9)');
      SK.text(ctx, '★'.repeat(rec.star), x + 22, y + 11.5, 4, '#ffd84a', 'center');
    });
    const act = Object.keys(t.syn).filter(k => t.syn[k].tier).map(k => SYN[k].name + ' ' + t.syn[k].th);
    if (act.length) SK.text(ctx, 'Liên kết: ' + act.join(' · '), v.w / 2, v.h - 28 - 24, 6, '#cfe8ff', 'center', 'rgba(0,0,0,0.9)');
    if (t.bag.length) SK.text(ctx, 'Túi ' + t.bag.length + ': ' + t.bag.slice(0, 3).map(itemName).join(', '), v.w / 2, v.h - 28 - 14, 6, '#c8a050', 'center', 'rgba(0,0,0,0.9)');
    SK.text(ctx, 'Kỹ năng chỉ huy: ' + C.cmd[t.cmd].name + ' (' + C.cmd[t.cmd].cost + ' NL)', v.w - 8, v.h - 8, 6, '#ffd84a', 'right', 'rgba(0,0,0,0.9)');
  });

  Tg.start = () => SK.startRun('knight', 'troopgc', []);
  if (window.SK_GAME && SK_GAME.debug) SK_GAME.debug.troopgc = () => { Tg.start(); return true; };
})();
