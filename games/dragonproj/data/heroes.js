/* ============================================================================
 * DANH SÁCH NHÂN VẬT (NPC)
 *
 * Game đổi trục: gacha không quay ra VŨ KHÍ nữa mà quay ra NGƯỜI. Mỗi nhân vật
 * gắn cứng một LỚP VŨ KHÍ — tức là gắn cứng một bộ move set và hai kỹ năng của
 * lớp đó — cộng một HỆ riêng. Chọn nhân vật = chọn lối đánh, đúng kiểu White Cat
 * Project (Shironeko), nơi bạn mang ba người vào màn và đổi qua lại giữa trận.
 *
 * Vì sao gắn lớp vũ khí vào nhân vật thay vì cho tự chọn: nếu ai cũng cầm được
 * mọi thứ thì nhân vật chỉ còn là một bộ chỉ số và một tấm ảnh. Gắn cứng thì mỗi
 * người có một dáng đánh không lẫn được, và đội hình ba người thành một quyết
 * định thật — ba lối đánh nào bù cho nhau.
 *
 * TRANG BỊ VẪN CÒN, và của RIÊNG từng người: mỗi nhân vật có ô vũ khí (phải đúng
 * lớp của mình) và bốn ô giáp. Một món chỉ nằm ở một người tại một thời điểm.
 *
 * Lớp vũ khí bám theo vũ khí canon trong HoloCure ở những chỗ biết chắc — Calli
 * lưỡi hái, Kaela búa, Anya dao keris, Noel kiếm-khiên, Ayame katana, Pekora
 * bắn cà rốt — còn lại chia theo hình tượng nhân vật.
 * Ảnh: `spr_<Tên>_idle` / `_run` trong kho HoloCure, đều 64x64, 4 khung đứng và
 * 6 khung chạy. Xem assets/ASSETS.md.
 * ========================================================================== */
(function (G) {
  'use strict';

  function h(id, n, rank, wclass, el, spr, d) {
    return { id: id, n: n, rank: rank, wclass: wclass, el: el, spr: spr, d: d };
  }

  G.HEROES = [
    /* ---------------------------------------------------------------- SS -- */
    h('calli', 'Mori Calliope', 'SS', 'great', 'dark', 'Calli',
      'Lưỡi hái của thần chết. Bổ chậm, đau, và nhát cuối thì không ai đỡ nổi.'),
    h('fubuki', 'Shirakami Fubuki', 'SS', 'dual', 'water', 'Fubuki',
      'Cáo tuyết. Hai lưỡi băng, đi nhanh tới mức đối phương chỉ kịp thấy vệt.'),
    h('kiara', 'Takanashi Kiara', 'SS', 'sword', 'fire', 'Kiara',
      'Phượng hoàng. Gục rồi vẫn đứng dậy, và đứng dậy là cháy.'),
    h('noel', 'Shirogane Noel', 'SS', 'sword', 'light', 'Noel',
      'Hiệp sĩ trắng. Người duy nhất đỡ được mọi thứ ném vào mặt.'),

    /* ----------------------------------------------------------------- S -- */
    h('ayame', 'Nakiri Ayame', 'S', 'sword', 'dark', 'Ayame',
      'Quỷ đỏ cầm katana. Cười trước, chém sau.'),
    h('marine', 'Houshou Marine', 'S', 'dual', 'fire', 'Marine',
      'Thuyền trưởng. Song đao, và một cái miệng còn sắc hơn.'),
    h('pekora', 'Usada Pekora', 'S', 'bow', 'light', 'Pekora',
      'Thỏ. Bắn cà rốt, và cà rốt thì nổ.'),
    h('kaela', 'Kaela Kovalskia', 'S', 'great', 'earth', 'Kaela',
      'Thợ rèn. Búa nặng tới mức mặt đất nứt trước cả con quái.'),
    h('coco', 'Kiryu Coco', 'S', 'great', 'fire', 'Coco',
      'Rồng. Một nhát bổ là một luồng lửa.'),
    h('suisei', 'Hoshimachi Suisei', 'S', 'great', 'thunder', 'Suisei',
      'Sao chổi. Gậy bóng chày, và mọi thứ trước mặt đều là bóng.'),
    h('ina', 'Ninomae Inanis', 'S', 'spear', 'dark', 'Ina',
      'Xúc tu vươn dài. Chạm tới trước khi bạn kịp thấy nó vươn.'),
    h('mio', 'Ookami Mio', 'S', 'bow', 'earth', 'Mio',
      'Bài tarot bay theo vòng cung. Rút lá nào ra lá đó.'),
    h('irys', 'IRyS', 'S', 'great', 'light', 'Irys',
      'Nephilim. Nửa quỷ nửa thiên thần, và đánh bằng cả hai nửa.'),

    /* ----------------------------------------------------------------- A -- */
    h('aqua', 'Minato Aqua', 'A', 'dual', 'water', 'Aqua',
      'Hầu gái. Dao bếp, và tay nghề dao bếp.'),
    h('korone', 'Inugami Korone', 'A', 'dual', 'earth', 'Korone',
      'Chó. Cắn là không nhả.'),
    h('watame', 'Tsunomaki Watame', 'A', 'bow', 'light', 'Watame',
      'Cừu. Bắn xong rồi bảo watame did nothing wrong.'),
    h('flare', 'Shiranui Flare', 'A', 'spear', 'fire', 'Flare',
      'Elf. Phép lửa gắn thẳng vào đầu thương.'),
    h('shion', 'Murasaki Shion', 'A', 'spear', 'water', 'Shion',
      'Phù thuỷ nhỏ. Gậy phép dài hơn cả người.'),
    h('towa', 'Tokoyami Towa', 'A', 'spear', 'dark', 'Towa',
      'Quỷ. Ba chiếc sừng và một cây kích.'),
    h('subaru', 'Oozora Subaru', 'A', 'bow', 'water', 'Subaru',
      'Vịt. Súng săn: bắn gần, bắn mạnh.'),
    h('ame', 'Watson Amelia', 'A', 'bow', 'thunder', 'Ame',
      'Thám tử. Súng lục và một cái đồng hồ tua ngược được.'),
    h('mumei', 'Nanashi Mumei', 'A', 'bow', 'light', 'Mumei',
      'Cú. Bắn từ chỗ không ai nhìn.'),
    h('bae', 'Hakos Baelz', 'A', 'dual', 'dark', 'Bae',
      'Chuột hỗn loạn. Xúc xắc quyết định bạn ăn mấy nhát.'),
    h('anya', 'Anya Melfissa', 'A', 'dual', 'earth', 'Anya',
      'Keris. Dao cong, đâm rồi xoáy.'),
    h('kanata', 'Amane Kanata', 'A', 'sword', 'light', 'Kanata',
      'Thiên thần. Hôm nào chán kiếm thì đấm.'),
    h('sana', 'Tsukumo Sana', 'A', 'great', 'earth', 'Sana',
      'Không gian. Vung một cái là cả hệ mặt trời đi theo.'),
    h('fauna', 'Ceres Fauna', 'A', 'spear', 'earth', 'Fauna',
      'Mẹ thiên nhiên. Rễ cây mọc ra từ đầu thương.'),
    h('reine', 'Pavolia Reine', 'A', 'bow', 'light', 'Reine',
      'Công. Mũi tên xoè ra như cái đuôi.'),
    h('haato', 'Akai Haato', 'A', 'great', 'fire', 'Haato',
      'Thớt. Đừng hỏi, cứ né.'),

    /* ----------------------------------------------------------------- B -- */
    h('sora', 'Tokino Sora', 'B', 'sword', 'light', 'Sora',
      'Người đầu tiên. Kiếm cơ bản, chuẩn từng nhát.'),
    h('roboco', 'Roboco-san', 'B', 'bow', 'thunder', 'Roboco',
      'Robot. Chùm tia, ngắm tự động.'),
    h('mel', 'Yozora Mel', 'B', 'great', 'dark', 'Mel',
      'Ma cà rồng. Búa to, và hút máu.'),
    h('matsuri', 'Natsuiro Matsuri', 'B', 'dual', 'fire', 'Matsuri',
      'Lễ hội. Hai cây quạt, nóng.'),
    h('aki', 'Aki Rosenthal', 'B', 'sword', 'none', 'Aki',
      'Elf múa. Thương xoay tròn theo nhịp.'),
    h('choco', 'Yuzuki Choco', 'B', 'spear', 'thunder', 'Choco',
      'Bác sĩ. Kim tiêm dài một mét.'),
    h('luna', 'Himemori Luna', 'B', 'sword', 'none', 'Luna',
      'Công chúa. Vương trượng, nhưng đập rất đau.'),
    h('miko', 'Sakura Miko', 'B', 'bow', 'thunder', 'Miko',
      'Miko. Tia laser từ mắt, phát qua cung.'),
    h('azki', 'AZKi', 'B', 'spear', 'light', 'AZKi',
      'Diva. Sóng âm chạy dọc cán thương.'),
    h('iofi', 'Airani Iofifteen', 'B', 'spear', 'thunder', 'Iofi',
      'Hoạ sĩ ngoài hành tinh. Cọ vẽ ra tia.'),
    h('risu', 'Ayunda Risu', 'B', 'bow', 'earth', 'Risu',
      'Sóc. Bắn hạt dẻ, nhiều và nhanh.'),
    h('moona', 'Moona Hoshinova', 'B', 'sword', 'water', 'Moona',
      'Trăng. Phép nước lên xuống theo con nước.'),
    h('kobo', 'Kobo Kanaeru', 'B', 'spear', 'water', 'Kobo',
      'Gọi mưa. Mưa xuống là trơn.'),
    h('zeta', 'Vestia Zeta', 'B', 'dual', 'water', 'Zeta',
      'Điệp viên. Hai lưỡi, một cái bóng.')
  ];

  G.heroById = function (id) {
    for (var i = 0; i < G.HEROES.length; i++) if (G.HEROES[i].id === id) return G.HEROES[i];
    return null;
  };

  /* Cùng thang tỉ lệ với gacha cũ — con số này CÓ NGUỒN (wiki Dragon Project),
     nên đổi trục quay từ đồ sang người thì giữ nguyên tỉ lệ, không bịa lại. */
  G.HERO_RATES = { SS: 0.03, S: 0.15, A: 0.55, B: 0.27 };

  G.heroesOfRank = function (rank) {
    return G.HEROES.filter(function (x) { return x.rank === rank; });
  };

  /* Đội hình tối đa ba người — đúng số khe vũ khí cũ, nên cơ chế ĐỔI GIỮA TRẬN
     có sẵn dùng lại được nguyên vẹn: đổi khe giờ là đổi NGƯỜI. */
  G.PARTY_MAX = 3;

})(window.DP = window.DP || {});
