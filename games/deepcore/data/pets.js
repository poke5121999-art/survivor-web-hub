/*
 * data/pets.js — MƯỜI LINH THÚ. Đây chính là "vũ khí" của game này.
 *
 * Người chơi không tự đánh. Mỗi món mang theo là một con vật tự đi, tự chọn
 * mục tiêu, tự đánh — nên cái phân biệt món này với món kia KHÔNG phải con số
 * sát thương, mà là ba thứ:
 *
 *   bam   nó bám chủ kiểu gì   (trước mặt / xoay quanh / dính cứng / thả rông)
 *   ngam  nó chọn đánh con nào (gần chủ / gần nó / máu thấp / đám đông / …)
 *   nhip  bao lâu ra một đòn
 *
 * Ba dòng đó ĐƯỢC IN THẲNG LÊN THẺ trong game. Deep Rock Galactic: Survivor làm
 * đúng thế với luật auto-aim của từng khẩu ("targets closest enemy", "targets
 * groups"), và đó là lý do người chơi phân biệt được vũ khí dù chẳng bấm bắn
 * bao giờ. Giấu luật ngắm đi thì mười con này chỉ còn là mười cái ảnh.
 *
 * Bậc 3 và bậc 5 CỐ Ý KHÔNG cộng sát thương — chúng đổi cách hoạt động. Người
 * chơi nhớ bậc 3 và bậc 5; bậc 2 và 4 chỉ để đường cong khỏi giật.
 * (Chép hình dạng của Astral Forge trong Survivor.io: 1-2 sao cộng chỉ số,
 * 3 sao đổi cơ chế.)
 */
(function (G) {
  'use strict';

  // Hệ số chung cho 5 bậc, áp cho mọi linh thú.
  var TIER = [
    { dmg: 1.00, hp: 1.00 },
    { dmg: 1.25, hp: 1.20 },
    { dmg: 1.25, hp: 1.45 },   // mở chức năng phụ 1
    { dmg: 1.60, hp: 1.75 },
    { dmg: 1.60, hp: 2.10 }    // mở chức năng phụ 2 + đủ điều kiện tiến hoá
  ];

  var UP_COST = [
    null,
    { frag: 20,  gold: 300 },
    { frag: 45,  gold: 900 },
    { frag: 100, gold: 2700 },
    { frag: 220, gold: 8100 }
  ];
  var EVO_COST = { frag: 500, gold: 20000 };

  /* ngam: luật chọn mục tiêu. Tên nào cũng phải nói được thành MỘT CÂU TIẾNG VIỆT
   * để in lên thẻ — nếu không nói gọn được thì luật đó quá rắc rối. */
  var AIM = {
    nearOwner: 'đánh con gần NGƯỜI nhất',
    nearSelf: 'đánh con gần NÓ nhất',
    lowHp: 'kết liễu con máu thấp nhất',
    highHp: 'nhè con máu dày nhất',
    crowd: 'nhắm vào chỗ ĐÔNG quái nhất',
    ahead: 'bắn theo hướng người đang đi',
    ore: 'đục vỉa quặng gần nhất'
  };

  var FOLLOW = {
    front: 'chen ra TRƯỚC mặt người',
    orbit: 'xoay quanh người',
    stick: 'dính sát bên người',
    free: 'thả rông, tự đi'
  };

  var P = [
    {
      id: 'rua', name: 'Rùa Đá', role: 'Chặn', rare: 1,
      art: 'pet.turtle', scale: 1,
      desc: 'Một tảng mai đi được. Không nhanh, nhưng quái muốn tới chỗ bạn thì phải qua nó.',
      bam: 'front', ngam: 'nearOwner', nhip: 1.2,
      dmg: 6, range: 40, hold: 75, leash: 220, hp: 120, spd: 34,
      kb: 20, taunt: 0.25,
      t3: 'Chắn được cả ĐẠN — đứng trước bạn thì đạn trúng nó thay vì bạn.',
      t5: 'Máu về 0 thì vỡ thành BỨC TƯỜNG ĐÁ chắn 4 giây rồi mới hồi.',
      evo: { name: 'Vách Lõi', need: 'đào 30 ô tường trong một ván' }
    },
    {
      id: 'cho', name: 'Chó Mỏ', role: 'Cận chiến', rare: 1,
      art: 'pet.dog', scale: 1,
      desc: 'Nuôi trong trạm khoan từ bé. Nó không sủa, nó lao.',
      bam: 'orbit', ngam: 'lowHp', nhip: 0.75,
      dmg: 9, range: 36, hold: 90, leash: 260, hp: 45, spd: 88,
      kb: 8,
      t3: 'Kết liễu xong thì LAO NGAY sang con kế, không phải chạy về.',
      t5: 'Mỗi lần kết liễu cộng +6% tốc đánh, cộng dồn tới 10 lần, hết khi ra khỏi trận.',
      evo: { name: 'Chó Đầu Đàn', need: '150 đòn kết liễu' }
    },
    {
      id: 'khoan', name: 'Trụ Khoan Bay', role: 'Tầm xa', rare: 2,
      art: 'pet.orbitalTurret', scale: 1,
      desc: 'Mảnh vỡ của một cỗ máy cũ. Nó vẫn nhớ nhiệm vụ: khoan mọi thứ trước mặt.',
      bam: 'stick', ngam: 'nearSelf', nhip: 1.0,
      dmg: 11, range: 240, hold: 60, leash: 0, hp: 30, spd: 96,
      proj: { spd: 240, col: '#7ad8ff', r: 3, pierce: 0 },
      t3: 'Đạn XUYÊN qua một con nữa.',
      t5: 'Bật khiên khi bạn máu dưới 40%: chặn một đòn cho bạn mỗi 8 giây.',
      evo: { name: 'Khoan Xuyên Tầng', need: 'bắn trúng 3 quái tinh nhuệ khác nhau' }
    },
    {
      id: 'mot', name: 'Mọt Lửa', role: 'Nổ diện', rare: 2,
      art: 'pet.summonFireMite', scale: 1,
      desc: 'Đẻ ra đã cháy. Nó không biết đau, chỉ biết chỗ nào đông thì tới.',
      bam: 'orbit', ngam: 'crowd', nhip: 2.5,
      dmg: 22, range: 150, hold: 50, leash: 150, hp: 25, spd: 105,
      aoe: 70, burn: 3,
      t3: 'Chỗ nổ để lại VỆT LỬA cháy 3 giây.',
      t5: 'Nổ dây chuyền: quái chết vì lửa thì nổ tiếp một lần nhỏ.',
      evo: { name: 'Ruộng Lân Tinh', need: '80 quái chết vì mìn' }
    },
    {
      id: 'doi', name: 'Dơi Máu', role: 'Hồi máu', rare: 3,
      art: 'pet.bat', scale: 1,
      desc: 'Nó hút của quái rồi nhả lại cho bạn. Đừng hỏi bằng cách nào.',
      bam: 'stick', ngam: 'nearSelf', nhip: 1.4,
      dmg: 5, range: 120, hold: 45, leash: 0, hp: 60, spd: 110,
      leech: 0.7,
      t3: 'Cứ 3 giây hồi 8 máu cho MỌI linh thú quanh bạn.',
      t5: 'Bạn xuống dưới 25% máu thì nó tự lao vào hồi 25 máu ngay, mỗi 20 giây.',
      evo: { name: 'Dơi Mẹ', need: 'hồi tổng 1000 máu' }
    },
    {
      id: 'hoangtu', name: 'Slime Hoàng Tử', role: 'Tăng sức', rare: 3,
      art: 'pet.petslimePrince', scale: 1,
      desc: 'Đội vương miện, không thèm đánh. Nhưng đứng gần nó thì cả bầy hăng hẳn.',
      bam: 'stick', ngam: 'nearOwner', nhip: 0,
      dmg: 0, range: 0, hold: 40, leash: 0, hp: 50, spd: 100,
      aura: 160, auraAtk: 0.20, auraDr: 0.25,
      t3: 'Vòng hào quang cộng thêm +12% tốc chạy cho BẠN.',
      t5: 'Cứ 12 giây phát một nhịp: mọi linh thú ra một đòn miễn phí ngay lập tức.',
      evo: { name: 'Slime Vương', need: 'giữ đủ mỗi nhịp ≥ 60 giây' }
    },
    {
      id: 'gaunuoc', name: 'Gấu Nước Khoan', role: 'Đào hộ', rare: 2,
      art: 'pet.tardigrade', scale: 1,
      desc: 'Cuộn tròn rồi lăn thẳng vào vách. Đá thua.',
      bam: 'free', ngam: 'ore', nhip: 0.9,
      dmg: 3, range: 30, hold: 0, leash: 340, hp: 40, spd: 74,
      mine: 9,
      t3: 'Quặng nó đào được TỰ BAY về túi bạn.',
      t5: 'Lăn qua quái thì hất văng và gây sát thương bằng 200% tốc đào.',
      evo: { name: 'Gấu Chúa', need: 'đào 100 ô' }
    },
    {
      id: 'den', name: 'Slime Đèn', role: 'Soi sáng', rare: 1,
      art: 'pet.petslime', scale: 1,
      desc: 'Sáng như một cái đèn bão nhỏ. Quái bị soi thì mỏng giáp hẳn.',
      bam: 'stick', ngam: 'nearOwner', nhip: 0,
      dmg: 0, range: 0, hold: 35, leash: 0, hp: 20, spd: 108,
      light: 180, shred: 0.12,
      t3: 'Soi lộ vỉa quặng quanh bạn trên bản đồ nhỏ.',
      t5: 'Vùng sáng của nó làm quái đứng trong đó chậm 20%.',
      evo: { name: 'Mắt Lõi', need: 'soi lộ 40 ô quặng' }
    },
    {
      id: 'meo', name: 'Mèo Hang', role: 'Khống chế', rare: 2,
      art: 'pet.cat', scale: 1,
      desc: 'Nhả tơ vào chân quái. Nó không giết ai, nó chỉ làm cả đám đi chậm lại.',
      bam: 'orbit', ngam: 'crowd', nhip: 2.0,
      dmg: 2, range: 220, hold: 110, leash: 240, hp: 35, spd: 100,
      proj: { spd: 190, col: '#d8e8ff', r: 3 },
      web: { r: 80, slow: 0.35, time: 3 },
      t3: 'Quái dính tơ thì nhận thêm 15% sát thương từ mọi nguồn.',
      t5: 'Lưới nổ khi hết giờ, gây sát thương bằng 3 lần sát thương đòn thường.',
      evo: { name: 'Tơ Lõi', need: 'làm chậm 400 lượt quái' }
    },
    {
      id: 'hon', name: 'Hồn Quặng', role: 'Dây chuyền', rare: 4,
      art: 'pet.summonSkeleton', scale: 1,
      desc: 'Thứ còn lại của một người thợ nào đó. Nó chỉ nhớ mỗi việc: nối mạch.',
      bam: 'stick', ngam: 'nearSelf', nhip: 1.4,
      dmg: 7, range: 200, hold: 70, leash: 0, hp: 25, spd: 112,
      chain: { hops: 3, falloff: 0.2, range: 120, col: '#9affd8' },
      wallPass: true,
      t3: 'Tia nảy XUYÊN TƯỜNG, đánh được cả con nấp sau vách.',
      t5: 'Mỗi vỉa quặng bạn đào cộng +1 lần nảy cho 10 giây tới.',
      evo: { name: 'Mạch Lõi', need: 'nhặt 200 mảnh quặng' }
    }
  ];

  var byId = {};
  P.forEach(function (p, i) { p.idx = i; byId[p.id] = p; });

  /* Chỉ số thật của một linh thú ở bậc t (1..5). */
  function statsOf(def, tier) {
    var m = TIER[Math.max(0, Math.min(4, tier - 1))];
    return {
      dmg: def.dmg * m.dmg,
      hp: def.hp * m.hp,
      nhip: def.nhip,
      range: def.range,
      t3: tier >= 3,
      t5: tier >= 5
    };
  }

  G.PETS = P;
  G.PET = byId;
  G.PET_TIER = TIER;
  G.PET_UP_COST = UP_COST;
  G.PET_EVO_COST = EVO_COST;
  G.PET_AIM = AIM;
  G.PET_FOLLOW = FOLLOW;
  G.petStats = statsOf;

  /* Trần linh thú HIỆN HÌNH. Con thứ 5 trở đi vẫn tính hào quang/buff nhưng
   * không vẽ ra — màn hình dọc mà bốn con vật cộng bầy quái cộng vách đá là đã
   * kín rồi. Survivor.io giải đúng bài này bằng "1 hiện hình + 2 trợ chiến". */
  G.PET_VISIBLE_MAX = 4;
})(window.DC = window.DC || {});
