/*
 * npcs.js - the people of the archipelago.
 *
 * The build this replaces carried the thirty-one Stardew villagers with their
 * real schedule files, and every one of those schedules named a MAP - "leaves
 * SamHouse at 8:00, arrives JojaMart at 9:00". There are no houses here and no
 * Joja Mart, so that data could not survive the redesign in any honest form.
 * This is a new cast, written for the islands that exist, drawn from the art
 * that shipped with them.
 *
 * WHAT DID SURVIVE is the mechanism, which is the part that matters: every
 * person has a birthday, a set of things they love and hate being given, a
 * heart track that caps until you court them, and a schedule that moves them
 * around the world by the hour and by the weekday. npc.js walks them; sim.js
 * holds the friendship. None of that changed.
 *
 * ------------------------------------------------------------------ schedule
 * A schedule is a list of blocks, earliest first:
 *   { at: 900, isl: 'market', x: 8, y: 7, face: 'down', say: '...' }
 * `at` is HHMM. `isl` is an island id and (x,y) are LOCAL to that island, the
 * same convention data/islands.js uses. A villager walks there and waits.
 *
 * Keys on the schedule object select which list runs today, most specific
 * first: a weekday ('T2'..'CN'), then a season, then 'rain', then 'default'.
 * An island the player does not own yet is skipped - its resident simply is
 * not in the world, which is the honest reading of "you have not found them".
 *
 * ------------------------------------------------------------------- gifts
 * `love` +80, `like` +45, neutral +20, `dislike` -20, `hate` -40, and eight
 * times that on a birthday. Item names index data/gamedata.js `items`, so a
 * name that does not exist there is dead data - there is a check for that at
 * the bottom of this file that runs on load in the dev console.
 */
(function (global) {
  'use strict';

  var NPCS = {

    bacnong: {
      id: 'bacnong', name: 'Bác Nông', role: 'Chủ sạp hạt giống',
      art: 'Farmer_Idle0', portrait: 'Farmer_Idle0', home: 'market',
      birthday: { season: 'Spring', day: 12 }, marriable: false,
      bio: 'Bán hạt ở chợ đảo từ hồi ông ngoại bạn còn trẻ. Nhớ giá của bốn mươi loại hạt và không nhớ nổi tên ai.',
      love: ['Parsnip', 'Cauliflower', 'Melon', 'Pumpkin', 'Starfruit'],
      like: ['Wheat', 'Potato', 'Corn', 'Coffee', 'Maple Syrup'],
      hate: ['Weeds', 'Trash', 'Slime'],
      lines: {
        default: ['Hạt mùa này về rồi đấy, ghé xem đi.',
                  'Đất trên đảo cháu tốt hơn đảo tôi nhiều.',
                  'Trồng gì cũng được, miễn đúng mùa. Sai mùa là mất trắng.'],
        rain: ['Mưa thế này khỏi tưới, sướng nhé.'],
        night: ['Sạp đóng rồi. Mai ghé.'],
        friend: ['Cháu làm ăn khá lên trông thấy đấy.',
                 'Để tôi để dành cho cháu ít hạt tốt.']
      },
      schedule: {
        CN: [{ at: 600, isl: 'market', x: 10, y: 12, face: 'down', say: 'Chủ Nhật tôi nghỉ, nhưng vẫn ra ngồi cho quen.' },
             { at: 1900, isl: 'tavern', x: 7, y: 11, face: 'down' }],
        rain: [{ at: 700, isl: 'market', x: 6, y: 9, face: 'up' },
               { at: 1800, isl: 'tavern', x: 6, y: 11, face: 'down' }],
        default: [
          { at: 600, isl: 'market', x: 6, y: 9, face: 'up', say: 'Sáng sớm, hạt còn tươi.' },
          { at: 1200, isl: 'market', x: 14, y: 9, face: 'up' },
          { at: 1700, isl: 'market', x: 10, y: 13, face: 'down', say: 'Dọn sạp đây.' },
          { at: 1900, isl: 'tavern', x: 6, y: 11, face: 'down' },
          { at: 2200, isl: 'market', x: 3, y: 4, face: 'down' }
        ]
      }
    },

    gaumoc: {
      id: 'gaumoc', name: 'Gấu Mộc', role: 'Thợ rừng',
      art: 'WoodCutterBear_Idle_0', portrait: 'Friend_25', home: 'forest',
      birthday: { season: 'Winter', day: 4 }, marriable: false,
      bio: 'To như cái tủ, nói câu nào cũng cụt. Đốn cây từ tinh mơ và ngủ ngay khi mặt trời lặn.',
      love: ['Maple Syrup', 'Oak Resin', 'Pine Tar', 'Hardwood', 'Blackberry Cobbler'],
      like: ['Wood', 'Honey', 'Hazelnut', 'Blackberry', 'Salmonberry'],
      hate: ['Trash', 'Slime', 'Sap'],
      lines: {
        default: ['Gỗ tốt. Cây già.', 'Chặt xong ba mươi cây rồi.',
                  'Đảo này còn nhiều gỗ. Đừng chặt sạch.'],
        rain: ['Mưa. Nhựa cây chảy nhiều.'],
        night: ['Ngủ. Mai chặt tiếp.'],
        friend: ['Cần gỗ, cứ lấy.', 'Cậu chặt cây khá đấy.']
      },
      schedule: {
        default: [
          { at: 600, isl: 'forest', x: 4, y: 4, face: 'right' },
          { at: 1000, isl: 'forest', x: 12, y: 9, face: 'down' },
          { at: 1400, isl: 'forest', x: 17, y: 9, face: 'up', say: 'Trại gỗ mở. Mua đi.' },
          { at: 1900, isl: 'forest', x: 6, y: 14, face: 'down' }
        ],
        rain: [{ at: 700, isl: 'forest', x: 17, y: 9, face: 'up' },
               { at: 1900, isl: 'forest', x: 6, y: 14, face: 'down' }]
      }
    },

    cosua: {
      id: 'cosua', name: 'Cô Sữa', role: 'Chủ trại giống',
      art: 'CowElf_Idle0', portrait: 'Friend_18', home: 'ranch',
      birthday: { season: 'Summer', day: 20 }, marriable: true,
      bio: 'Biết tên từng con bò trong chuồng và giận thật sự nếu bạn quên cho chúng ăn.',
      love: ['Milk', 'Cheese', 'Goat Cheese', 'Cloth', 'Pink Cake'],
      like: ['Egg', 'Wool', 'Mayonnaise', 'Hay', 'Sunflower'],
      hate: ['Trash', 'Slime', 'Void Egg'],
      lines: {
        default: ['Con Hoa hôm nay cho nhiều sữa lắm.',
                  'Cho ăn xong nhớ vuốt ve. Chúng biết hết đấy.',
                  'Chuồng trống thì buồn, cậu mua thêm một con đi.'],
        rain: ['Mưa thì lùa hết vào chuồng, không được thả ra.'],
        night: ['Đàn ngủ rồi. Nói khẽ thôi.'],
        friend: ['Cậu chăm thú khéo hơn tôi tưởng.',
                 'Ghé chơi hoài đi, tôi để dành phô mai cho.']
      },
      schedule: {
        T7: [{ at: 600, isl: 'ranch', x: 10, y: 12, face: 'down' },
             { at: 1300, isl: 'market', x: 13, y: 9, face: 'up', say: 'Đi chợ mua đồ chút.' },
             { at: 1800, isl: 'ranch', x: 4, y: 6, face: 'down' }],
        default: [
          { at: 600, isl: 'ranch', x: 4, y: 8, face: 'down', say: 'Cho gà ăn cái đã.' },
          { at: 900, isl: 'ranch', x: 15, y: 8, face: 'down' },
          { at: 1200, isl: 'ranch', x: 10, y: 12, face: 'down', say: 'Trại giống mở cửa.' },
          { at: 1800, isl: 'ranch', x: 10, y: 13, face: 'down' },
          { at: 2100, isl: 'ranch', x: 4, y: 6, face: 'down' }
        ]
      }
    },

    thuythu: {
      id: 'thuythu', name: 'Thuỷ Thủ Bảy', role: 'Chủ chợ cá',
      art: 'Sailor_Idle_0', portrait: 'Friend_2', home: 'harbor',
      birthday: { season: 'Fall', day: 9 }, marriable: true,
      bio: 'Đi biển hai mươi năm rồi về mở chợ cá. Kể chuyện nào cũng có một con cá to hơn lần trước.',
      love: ['Tuna', 'Super Cucumber', 'Octopus', 'Lobster', 'Crab Cakes'],
      like: ['Sardine', 'Anchovy', 'Crab', 'Sashimi', 'Beer'],
      hate: ['Trash', 'Seaweed', 'Green Algae'],
      lines: {
        default: ['Nước hôm nay lặng. Cá cắn đấy.',
                  'Ra cầu tàu mà câu, chỗ đó sâu.',
                  'Con to nhất tôi bắt được dài bằng cánh tay này.'],
        rain: ['Mưa là ngày vàng của dân câu. Ra đi!'],
        night: ['Đêm có loài chỉ ăn mồi sau nửa đêm đấy.'],
        friend: ['Bao giờ rảnh tôi dẫn cậu ra chỗ cá to.',
                 'Cần mồi cứ lấy, khỏi trả tiền.']
      },
      schedule: {
        default: [
          { at: 600, isl: 'harbor', x: 10, y: 17, face: 'down', say: 'Ra sớm mới có cá.' },
          { at: 1000, isl: 'harbor', x: 15, y: 8, face: 'up', say: 'Chợ cá mở rồi.' },
          { at: 1800, isl: 'tavern', x: 13, y: 11, face: 'down' },
          { at: 2300, isl: 'harbor', x: 4, y: 8, face: 'down' }
        ],
        rain: [{ at: 600, isl: 'harbor', x: 10, y: 18, face: 'down' },
               { at: 1900, isl: 'tavern', x: 13, y: 11, face: 'down' }]
      }
    },

    kysu: {
      id: 'kysu', name: 'Kỹ Sư Lam', role: 'Thợ rèn',
      art: 'Enginear2_Idle0', portrait: 'Friend_9', home: 'smith',
      birthday: { season: 'Winter', day: 17 }, marriable: true,
      bio: 'Nâng cấp được mọi thứ có cán. Tay lúc nào cũng dính dầu và không bao giờ ngẩng lên trước khi xong việc.',
      love: ['Iridium Bar', 'Gold Bar', 'Diamond', 'Iron Bar', 'Amethyst'],
      like: ['Copper Bar', 'Coal', 'Quartz', 'Copper Ore', 'Iron Ore'],
      hate: ['Trash', 'Weeds', 'Clay'],
      lines: {
        default: ['Đưa cuốc đây, mai lấy. Nhanh hơn được đâu.',
                  'Quặng dưới hầm sâu tốt hơn nhiều.',
                  'Cái gì cũng nâng cấp được, trừ tính người.'],
        rain: ['Lò vẫn đỏ. Mưa không tắt được lò tôi.'],
        night: ['Còn một mẻ nữa là xong.'],
        friend: ['Lần này tôi lấy rẻ cho cậu.',
                 'Cậu biết dùng đồ. Tôi quý người biết dùng đồ.']
      },
      schedule: {
        default: [
          { at: 700, isl: 'smith', x: 12, y: 12, face: 'down' },
          { at: 900, isl: 'smith', x: 15, y: 8, face: 'up', say: 'Lò rèn mở.' },
          { at: 1700, isl: 'smith', x: 8, y: 8, face: 'up' },
          { at: 2000, isl: 'tavern', x: 5, y: 11, face: 'down' },
          { at: 2300, isl: 'smith', x: 3, y: 9, face: 'down' }
        ]
      }
    },

    cauboong: {
      id: 'cauboong', name: 'Bé Bóng', role: 'Chủ Poké Mart',
      art: 'Student1_Idle0', portrait: 'Friend_15', home: 'pokemart',
      birthday: { season: 'Summer', day: 3 }, marriable: false,
      bio: 'Mười hai tuổi, thuộc lòng bảng giá bốn mươi loại bóng, và tin chắc mình sẽ bắt được Mew trước bạn.',
      love: ['Chocolate Cake', 'Ice Cream', 'Cookie', 'Pink Cake', 'Pancakes'],
      like: ['Sugar', 'Honey', 'Blueberry', 'Melon', 'Rare Candy'],
      hate: ['Trash', 'Slime', 'Bug Meat'],
      lines: {
        default: ['Bóng Nhanh mạnh nhất ở lượt đầu tiên đó anh!',
                  'Em bắt được 12 loài rồi. Anh được mấy?',
                  'Con nào còn đầy máu thì đừng phí bóng.'],
        night: ['Mẹ em kêu đóng cửa rồi...'],
        friend: ['Em để dành cho anh mấy quả Bóng Lưới nè.',
                 'Anh là người bắt giỏi nhất em từng gặp!']
      },
      schedule: {
        default: [
          { at: 700, isl: 'pokemart', x: 8, y: 9, face: 'up', say: 'Mở cửa rồi!' },
          { at: 1300, isl: 'meadow', x: 12, y: 10, face: 'down', say: 'Em ra cỏ tí thôi, đừng nói mẹ em.' },
          { at: 1500, isl: 'pokemart', x: 8, y: 9, face: 'up' },
          { at: 2000, isl: 'pokemart', x: 3, y: 11, face: 'down' }
        ]
      }
    },

    hiepsicao: {
      id: 'hiepsicao', name: 'Hiệp Sĩ Cáo', role: 'Trưởng hội thám hiểm',
      art: 'FoxNight_0', portrait: 'Friend_3', home: 'mine',
      birthday: { season: 'Fall', day: 26 }, marriable: false,
      bio: 'Xuống tới tầng chín mươi rồi quay lên, và không chịu kể vì sao quay lên.',
      love: ['Diamond', 'Prismatic Shard', 'Ancient Sword', 'Dwarf Gadget', 'Void Essence'],
      like: ['Ruby', 'Emerald', 'Topaz', 'Bomb', 'Cave Carrot'],
      hate: ['Trash', 'Weeds'],
      lines: {
        default: ['Mang theo đồ ăn. Ai không mang đều phải quay lên.',
                  'Tầng nào chia hết cho năm thì có thang máy.',
                  'Quái dưới sâu không dọa. Chúng ăn thật.'],
        night: ['Đêm là lúc thứ dưới đó ngoi lên gần miệng hang.'],
        friend: ['Cậu xuống sâu hơn tôi nghĩ đấy.',
                 'Cầm lấy cái này. Đừng hỏi tôi lấy ở đâu.']
      },
      schedule: {
        default: [
          { at: 800, isl: 'mine', x: 16, y: 11, face: 'up', say: 'Hội mở cửa.' },
          { at: 1600, isl: 'mine', x: 10, y: 8, face: 'down' },
          { at: 2000, isl: 'tavern', x: 14, y: 12, face: 'down' },
          { at: 2400, isl: 'mine', x: 3, y: 9, face: 'down' }
        ]
      }
    },

    thothucong: {
      id: 'thothucong', name: 'Thợ Cả Tí', role: 'Chủ xưởng',
      art: 'Crafter_0', portrait: 'Friend_0', home: 'workshop',
      birthday: { season: 'Spring', day: 25 }, marriable: false,
      bio: 'Dựng được mọi cái máy trong quyển sổ tay, và một hai cái không có trong đó.',
      love: ['Cheese', 'Wine', 'Truffle Oil', 'Cloth', 'Jelly'],
      like: ['Wood', 'Stone', 'Copper Bar', 'Oak Resin', 'Beer'],
      hate: ['Trash', 'Slime'],
      lines: {
        default: ['Bỏ đồ vào tối nay, sáng mai có hàng.',
                  'Rượu để càng lâu càng đắt. Đừng vội bán.',
                  'Máy nào cũng cần chỗ. Đảo này còn rộng.'],
        night: ['Máy chạy suốt đêm, tôi thì không.'],
        friend: ['Bản vẽ này cho cậu. Đừng bán lại đấy.']
      },
      schedule: {
        default: [
          { at: 700, isl: 'workshop', x: 10, y: 13, face: 'down' },
          { at: 1200, isl: 'workshop', x: 6, y: 8, face: 'down' },
          { at: 1900, isl: 'tavern', x: 4, y: 11, face: 'down' },
          { at: 2200, isl: 'workshop', x: 19, y: 6, face: 'down' }
        ]
      }
    },

    daubep: {
      id: 'daubep', name: 'Đầu Bếp Cam', role: 'Chủ quán',
      art: 'CookingElf_0', portrait: 'Friend_20', home: 'tavern',
      birthday: { season: 'Fall', day: 14 }, marriable: true,
      bio: 'Nấu cho cả quần đảo và nhớ món ruột của từng người. Chưa từng viết công thức nào ra giấy.',
      love: ['Truffle', 'Lobster', 'Pomegranate', 'Crab Cakes', 'Pizza'],
      like: ['Egg', 'Milk', 'Cheese', 'Tomato', 'Wheat Flour'],
      hate: ['Trash', 'Slime', 'Rotten Plant'],
      lines: {
        default: ['Bếp đỏ cả ngày. Ăn gì tôi làm.',
                  'Món tự nấu hồi sức tốt hơn ăn sống nhiều.',
                  'Mang nguyên liệu tới, tôi chỉ cách nấu.'],
        rain: ['Ngày mưa quán đông hơn hẳn.'],
        night: ['Tới giờ đông rồi đây.'],
        friend: ['Ngồi đi, tôi làm cho cậu món đặc biệt.',
                 'Công thức này tôi chỉ nói với người tôi quý.']
      },
      schedule: {
        default: [
          { at: 900, isl: 'tavern', x: 14, y: 8, face: 'down' },
          { at: 1200, isl: 'tavern', x: 9, y: 8, face: 'up', say: 'Quán mở!' },
          { at: 2400, isl: 'tavern', x: 18, y: 10, face: 'down' }
        ],
        T2: [{ at: 1000, isl: 'market', x: 14, y: 9, face: 'up', say: 'Đi chợ mua nguyên liệu.' },
             { at: 1300, isl: 'tavern', x: 9, y: 8, face: 'up' },
             { at: 2400, isl: 'tavern', x: 18, y: 10, face: 'down' }]
      }
    },

    nangtao: {
      id: 'nangtao', name: 'Nàng Táo', role: 'Trông vườn kính',
      art: 'EppleElfIdle_0', portrait: 'Friend_27', home: 'greenhouse',
      birthday: { season: 'Spring', day: 6 }, marriable: true,
      bio: 'Nói chuyện với cây nhiều hơn với người, và cây có vẻ hợp tác hơn.',
      love: ['Starfruit', 'Ancient Fruit', 'Sweet Gem Berry', 'Fairy Rose', 'Apple'],
      like: ['Melon', 'Peach', 'Rhubarb', 'Tulip', 'Sunflower'],
      hate: ['Trash', 'Weeds', 'Slime'],
      lines: {
        default: ['Trong kính không có mùa. Trồng gì cũng sống.',
                  'Cây nào cũng có nhịp riêng. Đừng giục.',
                  'Bạn tưới nhiều quá cũng không tốt đâu.'],
        night: ['Ban đêm cây thở đấy, bạn có biết không?'],
        friend: ['Mình để dành cho bạn một hạt hiếm.',
                 'Vườn này lúc nào cũng mở cho bạn.']
      },
      schedule: {
        default: [
          { at: 700, isl: 'greenhouse', x: 5, y: 6, face: 'down' },
          { at: 1200, isl: 'greenhouse', x: 14, y: 9, face: 'down' },
          { at: 1800, isl: 'market', x: 10, y: 12, face: 'down' },
          { at: 2100, isl: 'greenhouse', x: 10, y: 3, face: 'down' }
        ]
      }
    },

    cuhien: {
      id: 'cuhien', name: 'Cụ Hiền', role: 'Người trông bảo tàng',
      art: 'MinotarusManager_Idle0', portrait: 'Friend_5', home: 'museum',
      birthday: { season: 'Winter', day: 26 }, marriable: false,
      bio: 'Đọc được chữ khắc trên Đảo Cổ nhưng bảo rằng dịch ra thì mất hay.',
      love: ['Prismatic Shard', 'Ancient Doll', 'Dinosaur Egg', 'Rare Disc', 'Elvish Jewelry'],
      like: ['Quartz', 'Earth Crystal', 'Frozen Tear', 'Fire Quartz', 'Amethyst'],
      hate: ['Trash', 'Slime'],
      lines: {
        default: ['Mỗi món cậu nộp là một mảnh câu chuyện.',
                  'Tủ kính còn trống nhiều lắm.',
                  'Đá quý đẹp, nhưng hoá thạch mới kể được chuyện.'],
        night: ['Ban đêm bảo tàng yên. Tôi thích thế.'],
        friend: ['Cậu là người đầu tiên chịu nghe tôi nói hết câu.']
      },
      schedule: {
        default: [
          { at: 800, isl: 'museum', x: 9, y: 9, face: 'up' },
          { at: 1500, isl: 'museum', x: 3, y: 8, face: 'right' },
          { at: 1900, isl: 'museum', x: 15, y: 8, face: 'left' },
          { at: 2200, isl: 'museum', x: 9, y: 12, face: 'down' }
        ]
      }
    },

    congchua: {
      id: 'congchua', name: 'Công Chúa Mây', role: 'Trưởng ban lễ hội',
      art: 'Princess_Idle_0', portrait: 'Friend_13', home: 'festival',
      birthday: { season: 'Summer', day: 28 }, marriable: true,
      bio: 'Tổ chức lễ hội bốn mùa một mình và vẫn nhớ hết ai thích ăn gì.',
      love: ['Pink Cake', 'Fairy Rose', 'Rabbit\'s Foot', 'Pearl', 'Diamond'],
      like: ['Tulip', 'Sunflower', 'Poppy', 'Wine', 'Chocolate Cake'],
      hate: ['Trash', 'Slime', 'Bug Meat'],
      lines: {
        default: ['Mùa này sắp có hội. Bạn nhớ tới nhé.',
                  'Bảng gói hàng cần thêm vài thứ nữa thôi.',
                  'Cả quần đảo góp một tay thì việc gì cũng xong.'],
        night: ['Đèn lồng đẹp nhất là lúc này.'],
        friend: ['Có bạn thì hội nào cũng vui hơn.']
      },
      schedule: {
        default: [
          { at: 800, isl: 'festival', x: 12, y: 8, face: 'up' },
          { at: 1300, isl: 'festival', x: 6, y: 12, face: 'down' },
          { at: 1800, isl: 'tavern', x: 12, y: 12, face: 'down' },
          { at: 2200, isl: 'festival', x: 18, y: 11, face: 'down' }
        ]
      }
    },

    giaosu: {
      id: 'giaosu', name: 'Giáo Sư Vân', role: 'Nhà nghiên cứu Pokémon',
      art: 'Enginear_Idle0', portrait: 'Friend_23', home: 'lab',
      birthday: { season: 'Fall', day: 2 }, marriable: false,
      bio: 'Đo được cả tiềm năng bẩm sinh của một con Pokémon và vẫn không đo được vì sao chúng thích ai.',
      love: ['Rare Candy', 'Prismatic Shard', 'Diamond', 'Ancient Fruit', 'Coffee'],
      like: ['Quartz', 'Battery Pack', 'Iridium Bar', 'Solar Essence'],
      hate: ['Trash', 'Slime'],
      lines: {
        default: ['Hai con cùng loài, cùng cấp, vẫn khác nhau. Là do IV.',
                  'Nỗ lực thì luyện được. Cá thể thì không.',
                  'Đưa con nào đây tôi soi cho.'],
        night: ['Máy chạy cả đêm. Tôi cũng vậy.'],
        friend: ['Dữ liệu của cậu quý hơn cả bộ máy này.']
      },
      schedule: {
        default: [
          { at: 800, isl: 'lab', x: 9, y: 9, face: 'up' },
          { at: 1400, isl: 'lab', x: 16, y: 9, face: 'up' },
          { at: 2000, isl: 'lab', x: 12, y: 14, face: 'down' }
        ]
      }
    }
  };

  /* Gifts anybody is glad to get, and anybody would rather not. Checked before
   * the personal lists, exactly as the original does, so one shiny stone works
   * on everyone. */
  var UNIVERSAL = {
    love: ['Prismatic Shard', 'Rabbit\'s Foot', 'Pearl', 'Magic Rock Candy'],
    like: ['Diamond', 'Coffee', 'Apple', 'Wine', 'Maple Syrup', 'Truffle'],
    dislike: ['Salmonberry', 'Seaweed', 'Green Algae', 'White Algae', 'Sap'],
    hate: ['Trash', 'Weeds', 'Slime', 'Bug Meat', 'Rotten Plant', 'Driftwood',
           'Broken CD', 'Broken Glasses', 'Soggy Newspaper', 'Joja Cola']
  };

  var ORDER = ['bacnong', 'gaumoc', 'cosua', 'thuythu', 'kysu', 'cauboong',
               'hiepsicao', 'thothucong', 'daubep', 'nangtao', 'cuhien',
               'congchua', 'giaosu'];

  global.ISL_NPCS = { npcs: NPCS, universal: UNIVERSAL, order: ORDER };

  /* Dead-gift check. A love list naming an item that does not exist is
   * silently un-giftable and there is nothing on screen to notice it by, so it
   * is reported once, loudly, in development.
   *
   * Deferred to a task rather than run inline: the item namespace is the UNION
   * of gamedata and the Pokemon items in pokebattle.js, and that file loads
   * after this one. Running inline flagged every Poké item as missing, which
   * is a warning that trains you to ignore warnings. */
  /* On DOMContentLoaded, not on a zero timeout: each <script src> is its own
   * task, so a timeout scheduled while this file runs fires BEFORE the later
   * files have executed, and pokebattle.js - which owns half the item names
   * checked here - is one of those. The zero-timeout version warned about
   * every Pokemon item on every single load. */
  if (global.console && global.document) {
    if (global.document.readyState === 'complete') checkGifts();
    else global.document.addEventListener('DOMContentLoaded', checkGifts);
  }
  function checkGifts() {
    if (!global.SDV_DATA || !global.SDV_DATA.items) return;
    var known = {}, k;
    for (k in global.SDV_DATA.items) known[global.SDV_DATA.items[k].name] = 1;
    if (global.ISL_POKEITEMS) for (k in global.ISL_POKEITEMS.ITEMS) known[k] = 1;
    if (global.ISL_POKE) for (k in global.ISL_POKE.BALLS) known[k] = 1;
    var bad = [];
    ORDER.forEach(function (id) {
      ['love', 'like', 'hate'].forEach(function (list) {
        (NPCS[id][list] || []).forEach(function (item) {
          if (!known[item]) bad.push(id + '.' + list + ': ' + item);
        });
      });
    });
    ['love', 'like', 'dislike', 'hate'].forEach(function (list) {
      UNIVERSAL[list].forEach(function (item) {
        if (!known[item]) bad.push('universal.' + list + ': ' + item);
      });
    });
    if (bad.length) console.warn('[npcs] gift names not in gamedata:', bad);
  }
})(window);
