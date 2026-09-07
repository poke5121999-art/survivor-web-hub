/*
 * data/biomes.js — mỗi quần thể là một "ải".
 *
 * Một ván CHỈ CÓ MỘT TẦNG (khác Deep Rock Galactic: Survivor, giống DRG gốc),
 * nên quần thể chính quyết định gần như toàn bộ cảm giác của ván: màu, độ cứng
 * đá, loại quặng, bể quái, mối nguy. Một mảng "quần thể phụ" được vá vào giữa
 * bản đồ để hang không đơn điệu — đó là mẹo của Core Keeper: biome này ăn sang
 * biome kia bằng những mảng loang, không có đường kẻ.
 *
 * hard  = độ cứng đá, nhân vào máu ô tường. Cuốc xịn thì đào tuốt, cuốc dỏm thì
 *         ải sau đứng đục cả buổi — đó là chỗ để "nâng ngoài ván" phát huy.
 * dp    = ngân sách quái mỗi đợt (Difficulty Point, mượn thẳng của DRG).
 */
(function (G) {
  'use strict';

  // Bảng màu ánh sáng/sương của từng quần thể. Ánh sáng ấm giữa hang tối là
  // chữ ký thị giác của Core Keeper, nên mọi quần thể đều tối nền + sáng cục bộ.
  //
  // `dark` là độ phủ của lớp tối, 0..1. Đặt 0,6-0,8 như bản đầu thì nhìn thấy
  // cả hang kể cả ngoài vùng đèn — và thế là ô trang bị "đèn" chẳng còn nghĩa
  // gì, mà bóng tối cũng thôi làm người chơi thấy bất an. Từ 0,86 trở lên thì
  // ngoài quầng đèn gần như đen đặc, đúng như bản gốc.
  var B = [
    {
      id: 'dirt', name: 'Tầng Đất', sub: 'clay',
      desc: 'Lớp đất mềm ngay dưới trạm khoan. Đá dễ đào, quái thưa.',
      hard: 1.0, dark: 0.93, fog: '#0d0a10', glow: '#ffcf8a',
      ores: ['nitra', 'morkite', 'redsugar', 'copper'],
      pool: ['swarmer', 'grunt', 'caveling', 'exploder', 'spearman'],
      elite: ['brute', 'hunter'],
      hazards: ['spore', 'pit'],
      boss: 'glurch', mini: 'shrooman'
    },
    {
      id: 'clay', name: 'Hang Sét', sub: 'dirt',
      desc: 'Vách sét nung đỏ. Ấu trùng làm tổ trong các hốc.',
      hard: 1.15, dark: 0.94, fog: '#120a0a', glow: '#ffb070',
      ores: ['nitra', 'morkite', 'redsugar', 'copper', 'tin'],
      pool: ['swarmer', 'swarmerRed', 'grunt', 'caveling', 'exploder', 'skirmisher'],
      elite: ['brute', 'shaman'],
      hazards: ['spore', 'pit', 'geyser'],
      boss: 'glurch', mini: 'shrooman'
    },
    {
      id: 'nature', name: 'Rừng Ngầm', sub: 'mold',
      desc: 'Rễ cây khổng lồ xuyên qua đá. Có thứ săn mồi trong đám lá.',
      hard: 1.25, dark: 0.9, fog: '#08120c', glow: '#b8ff9a',
      ores: ['nitra', 'morkite', 'redsugar', 'tin', 'iron'],
      pool: ['swarmer', 'grunt', 'caveling', 'hunter', 'flyer', 'skirmisher'],
      elite: ['brute', 'shaman', 'charger'],
      hazards: ['spore', 'vine', 'pit'],
      boss: 'glurch', mini: 'shrooman'
    },
    {
      id: 'mold', name: 'Ổ Nấm Mốc', sub: 'nature',
      desc: 'Bào tử dày tới mức đèn không xuyên nổi. Mọi thứ ở đây đều nhiễm.',
      hard: 1.3, dark: 0.96, fog: '#0a1210', glow: '#8fe6c8',
      ores: ['nitra', 'morkite', 'redsugar', 'iron'],
      pool: ['swarmer', 'grunt', 'infected', 'exploder', 'flyer', 'assassin'],
      elite: ['brute', 'scholar', 'charger'],
      hazards: ['spore', 'gas', 'vine'],
      boss: 'glurch', mini: 'shrooman'
    },
    {
      id: 'hive', name: 'Tổ Ấu Trùng', sub: 'clay',
      desc: 'Sàn mềm và ấm. Không nên hỏi vì sao nó ấm.',
      hard: 1.2, dark: 0.94, fog: '#140c08', glow: '#ffbc6a',
      ores: ['nitra', 'morkite', 'redsugar', 'iron', 'scarlet'],
      pool: ['swarmer', 'swarmerRed', 'grunt', 'gruntVamp', 'exploder', 'acid'],
      elite: ['brute', 'shaman', 'roller'],
      hazards: ['egg', 'spore', 'pit'],
      boss: 'hive', mini: 'shrooman'
    },
    {
      id: 'desert', name: 'Sa Mạc Ngầm', sub: 'clay',
      desc: 'Cát chảy qua trần hang. Bọ ẩn dưới mặt cát.',
      hard: 1.35, dark: 0.88, fog: '#141008', glow: '#ffe0a0',
      ores: ['nitra', 'morkite', 'redsugar', 'iron', 'scarlet'],
      pool: ['swarmer', 'grunt', 'acid', 'skirmisher', 'hunter', 'exploder'],
      elite: ['brute', 'golem', 'charger'],
      hazards: ['quicksand', 'pit', 'geyser'],
      boss: 'scarab', mini: 'shrooman'
    },
    {
      id: 'sea', name: 'Biển Chìm', sub: 'crystal',
      desc: 'Nước ngập tới mắt cá. Cái gì bơi được ở đây thì đừng lại gần.',
      hard: 1.4, dark: 0.91, fog: '#08101a', glow: '#9fd8ff',
      ores: ['nitra', 'morkite', 'redsugar', 'scarlet', 'octarine'],
      pool: ['swarmer', 'grunt', 'flyer', 'hunter', 'roller', 'pest'],
      elite: ['brute', 'golem', 'shaman'],
      hazards: ['water', 'pit', 'vine'],
      boss: 'kingslime', mini: 'shrooman'
    },
    {
      id: 'crystal', name: 'Hang Pha Lê', sub: 'sea',
      desc: 'Tinh thể tự phát sáng — và tự nổ khi bị chạm.',
      hard: 1.5, dark: 0.86, fog: '#0a0c1c', glow: '#a0e8ff',
      ores: ['nitra', 'morkite', 'redsugar', 'octarine', 'galaxite'],
      pool: ['swarmer', 'grunt', 'charger', 'pest', 'hunter', 'golem'],
      elite: ['brute', 'golem', 'roller'],
      hazards: ['crystal', 'pit', 'geyser'],
      boss: 'kingslime', mini: 'shrooman'
    },
    {
      id: 'lava', name: 'Mỏ Nham', sub: 'crystal',
      desc: 'Đá nóng tới mức cuốc kêu. Dưới sàn là thứ không nên rơi xuống.',
      hard: 1.7, dark: 0.9, fog: '#180806', glow: '#ff9a5a',
      ores: ['nitra', 'morkite', 'redsugar', 'galaxite', 'solarite'],
      pool: ['grunt', 'charger', 'exploder', 'golem', 'roller', 'pest'],
      elite: ['brute', 'golem', 'shaman'],
      hazards: ['lava', 'geyser', 'crystal'],
      boss: 'glurch', mini: 'shrooman'
    }
  ];

  /* Các loại quặng. `xp` là kinh nghiệm cộng THẲNG khi đào xong — trong game này
   * quái KHÔNG rơi viên kinh nghiệm để nhặt, nên cây cuốc mới là nguồn lên cấp
   * chính. Đó cũng là lý do đào không bao giờ là việc phụ. */
  var ORE = {
    nitra:    { name: 'Nitra',      col: '#ff7a3c', xp: 7,  hp: 1.6, icon: 47, use: 'tiếp tế' },
    morkite:  { name: 'Morkite',    col: '#57e8c8', xp: 9,  hp: 1.9, icon: 534, use: 'nhiệm vụ' },
    redsugar: { name: 'Đường Đỏ',   col: '#ff5a72', xp: 5,  hp: 1.2, icon: 733, use: 'hồi máu' },
    copper:   { name: 'Đồng',       col: '#e08a4a', xp: 6,  hp: 1.7, gold: 4,  icon: 266 },
    tin:      { name: 'Thiếc',      col: '#cfd8e8', xp: 7,  hp: 1.9, gold: 6,  icon: 267 },
    iron:     { name: 'Sắt',        col: '#b8bfcc', xp: 9,  hp: 2.3, gold: 9,  icon: 268 },
    scarlet:  { name: 'Chu Sa',     col: '#ff5a4a', xp: 12, hp: 2.8, gold: 14, icon: 113 },
    octarine: { name: 'Bát Sắc',    col: '#b06aff', xp: 15, hp: 3.4, gold: 20, icon: 152 },
    galaxite: { name: 'Thiên Hà',   col: '#5aa8ff', xp: 19, hp: 4.0, gold: 28, icon: 532 },
    solarite: { name: 'Nhật Diệu',  col: '#ffd24a', xp: 24, hp: 4.8, gold: 40, icon: 153 }
  };

  var byId = {};
  B.forEach(function (b) { byId[b.id] = b; });

  G.BIOMES = B;
  G.BIOME = byId;
  G.ORE = ORE;
})(window.DC = window.DC || {});
