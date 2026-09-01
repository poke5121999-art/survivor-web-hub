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
    h('calli', 'Mori Calliope', 'SS', 'launcher', 'dark', 'Calli',
      'Thần chết. Mỗi quả rơi xuống là một cái hẹn, và không ai lỡ hẹn.'),
    h('fubuki', 'Shirakami Fubuki', 'SS', 'shotgun', 'water', 'Fubuki',
      'Cáo tuyết. Áp sát trong im lặng rồi nhả cả loạt băng vào mặt.'),
    h('kiara', 'Takanashi Kiara', 'SS', 'rifle', 'fire', 'Kiara',
      'Phượng hoàng. Gục rồi vẫn đứng dậy, và đứng dậy là cò vẫn bóp.'),
    h('noel', 'Shirogane Noel', 'SS', 'rifle', 'light', 'Noel',
      'Hiệp sĩ trắng. Đứng đúng chỗ, bắn đúng nhịp, không lùi một bước.'),

    /* ----------------------------------------------------------------- S -- */
    h('ayame', 'Nakiri Ayame', 'S', 'rifle', 'dark', 'Ayame',
      'Quỷ đỏ. Cười trước, xả sau.'),
    h('marine', 'Houshou Marine', 'S', 'shotgun', 'fire', 'Marine',
      'Thuyền trưởng. Khẩu súng nòng loe, và một cái miệng còn loe hơn.'),
    h('pekora', 'Usada Pekora', 'S', 'bow', 'light', 'Pekora',
      'Thỏ. Bắn cà rốt, và cà rốt thì nổ.'),
    h('kaela', 'Kaela Kovalskia', 'S', 'launcher', 'earth', 'Kaela',
      'Thợ rèn. Đạn tự rèn lấy, nên quả nào cũng nặng hơn quy định.'),
    h('coco', 'Kiryu Coco', 'S', 'launcher', 'fire', 'Coco',
      'Rồng. Một quả bay ra là một luồng lửa.'),
    h('suisei', 'Hoshimachi Suisei', 'S', 'launcher', 'thunder', 'Suisei',
      'Sao chổi. Đạn bay theo vòng cung, và mọi thứ dưới đó đều là bóng.'),
    h('ina', 'Ninomae Inanis', 'S', 'sniper', 'dark', 'Ina',
      'Xúc tu vươn dài. Chạm tới bạn trước khi bạn kịp thấy nó vươn.'),
    h('mio', 'Ookami Mio', 'S', 'bow', 'earth', 'Mio',
      'Bài tarot bay theo vòng cung. Rút lá nào ra lá đó.'),
    h('irys', 'IRyS', 'S', 'staff', 'light', 'Irys',
      'Nephilim. Nửa quỷ nửa thiên thần, và bắn ra bằng cả hai nửa.'),

    /* ----------------------------------------------------------------- A -- */
    h('aqua', 'Minato Aqua', 'A', 'shotgun', 'water', 'Aqua',
      'Hầu gái. Áp sát cự ly bếp, và tay nghề cự ly bếp.'),
    h('korone', 'Inugami Korone', 'A', 'shotgun', 'earth', 'Korone',
      'Chó. Xông vào là không lùi.'),
    h('watame', 'Tsunomaki Watame', 'A', 'bow', 'light', 'Watame',
      'Cừu. Bắn xong rồi bảo watame did nothing wrong.'),
    h('flare', 'Shiranui Flare', 'A', 'sniper', 'fire', 'Flare',
      'Elf. Một phát xuyên hết cả hàng, và hàng đó cháy.'),
    h('shion', 'Murasaki Shion', 'A', 'staff', 'water', 'Shion',
      'Phù thuỷ nhỏ. Gậy phép dài hơn cả người.'),
    h('towa', 'Tokoyami Towa', 'A', 'sniper', 'dark', 'Towa',
      'Quỷ. Ba chiếc sừng và một tầm ngắm không ai thoát.'),
    h('subaru', 'Oozora Subaru', 'A', 'shotgun', 'water', 'Subaru',
      'Vịt. Súng săn: bắn gần, bắn mạnh.'),
    h('ame', 'Watson Amelia', 'A', 'sniper', 'thunder', 'Ame',
      'Thám tử. Một phát ngắm kỹ và một cái đồng hồ tua ngược được.'),
    h('mumei', 'Nanashi Mumei', 'A', 'bow', 'light', 'Mumei',
      'Cú. Bắn từ chỗ không ai nhìn.'),
    h('bae', 'Hakos Baelz', 'A', 'shotgun', 'dark', 'Bae',
      'Chuột hỗn loạn. Xúc xắc quyết định bạn ăn mấy viên.'),
    h('anya', 'Anya Melfissa', 'A', 'shotgun', 'earth', 'Anya',
      'Keris. Nòng cong, đạn đi xoáy.'),
    h('kanata', 'Amane Kanata', 'A', 'rifle', 'light', 'Kanata',
      'Thiên thần. Hôm nào hết đạn thì đấm.'),
    h('sana', 'Tsukumo Sana', 'A', 'staff', 'earth', 'Sana',
      'Không gian. Niệm một cái là cả hệ mặt trời đi theo.'),
    h('fauna', 'Ceres Fauna', 'A', 'staff', 'earth', 'Fauna',
      'Mẹ thiên nhiên. Rễ cây mọc ra từ đầu gậy.'),
    h('reine', 'Pavolia Reine', 'A', 'bow', 'light', 'Reine',
      'Công. Mũi tên xoè ra như cái đuôi.'),
    h('haato', 'Akai Haato', 'A', 'launcher', 'fire', 'Haato',
      'Thớt. Đừng hỏi, cứ né.'),

    /* ----------------------------------------------------------------- B -- */
    h('sora', 'Tokino Sora', 'B', 'rifle', 'light', 'Sora',
      'Người đầu tiên. Khẩu cơ bản, chuẩn từng viên.'),
    h('roboco', 'Roboco-san', 'B', 'staff', 'thunder', 'Roboco',
      'Robot. Chùm tia, ngắm tự động.'),
    h('mel', 'Yozora Mel', 'B', 'staff', 'dark', 'Mel',
      'Ma cà rồng. Phép tối, và hút máu.'),
    h('matsuri', 'Natsuiro Matsuri', 'B', 'shotgun', 'fire', 'Matsuri',
      'Lễ hội. Bắn gần, và nóng.'),
    h('aki', 'Aki Rosenthal', 'B', 'rifle', 'none', 'Aki',
      'Elf múa. Bắn theo nhịp, không lệch một phách.'),
    h('choco', 'Yuzuki Choco', 'B', 'sniper', 'thunder', 'Choco',
      'Bác sĩ. Kim tiêm bắn xa một trăm mét.'),
    h('luna', 'Himemori Luna', 'B', 'rifle', 'none', 'Luna',
      'Công chúa. Khẩu bé xíu, nhưng bắn rất đau.'),
    h('miko', 'Sakura Miko', 'B', 'bow', 'thunder', 'Miko',
      'Miko. Tia laser từ mắt, phát qua cung.'),
    h('azki', 'AZKi', 'B', 'sniper', 'light', 'AZKi',
      'Diva. Sóng âm nén thành một đường thẳng.'),
    h('iofi', 'Airani Iofifteen', 'B', 'staff', 'thunder', 'Iofi',
      'Hoạ sĩ ngoài hành tinh. Cọ vẽ ra tia.'),
    h('risu', 'Ayunda Risu', 'B', 'bow', 'earth', 'Risu',
      'Sóc. Bắn hạt dẻ, nhiều và nhanh.'),
    h('moona', 'Moona Hoshinova', 'B', 'staff', 'water', 'Moona',
      'Trăng. Phép nước lên xuống theo con nước.'),
    h('kobo', 'Kobo Kanaeru', 'B', 'launcher', 'water', 'Kobo',
      'Gọi mưa. Quả nào rơi xuống cũng thành vũng, và vũng thì trơn.'),
    h('zeta', 'Vestia Zeta', 'B', 'rifle', 'water', 'Zeta',
      'Điệp viên. Hai khẩu, một cái bóng.')
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
