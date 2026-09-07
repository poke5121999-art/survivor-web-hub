/*
 * data/missions.js — nhiệm vụ và NHỊP của một ván 10 phút.
 *
 * Một ván = MỘT TẦNG (giống Deep Rock Galactic gốc, không leo tầng như bản
 * Survivor). Vì thế cả ván chỉ có một đường cong duy nhất, và nó phải có chỗ
 * thở. Bốn "hố thở" đặt ở phút 2, 4, 8 và 9:20 — đó là câu trả lời cho chuyện
 * chơi 10 phút trên điện thoại mà không mệt.
 *
 * Ngân sách sự kiện: 17 mốc trong khoảng 490 giây, tức trung bình một mốc mỗi
 * ~29 giây. Mốc CỐ Ý dồn vào 8 phút đầu chứ không trải đều 10 phút: đo trong
 * máy, một ván thật kết thúc ở khoảng phút 5-7 (làm xong nhiệm vụ là gọi khoang
 * ngay), nên nếu rải đều tới phút 10 thì mini-boss và hai đợt bầy cuối gần như
 * không bao giờ được thấy. 600 giây là TRẦN, không phải độ dài mong đợi.
 *
 * Nhịp swarm mượn của DRG: có CẢNH BÁO TRƯỚC (3,5 giây), quái ra sau đó, và
 * giữa hai đợt có khoảng lặng thật sự — DRG để 350-500 giây ở Hiểm 1. Ở đây nén
 * xuống còn ~150 giây vì cả ván chỉ có 600 giây.
 */
(function (G) {
  'use strict';

  var RUN_TIME = 600;          // 10 phút

  var TYPES = {
    mine: {
      id: 'mine', name: 'KHAI THÁC',
      icon: 534,
      short: function (n) { return 'Đào ' + n + ' Morkite'; },
      brief: 'Trạm cần Morkite. Đào đủ chỉ tiêu rồi lên khoang.',
      // Con số này đã đo đi đo lại. Hai cái bẫy ở hai đầu:
      //   quá ít  -> xong ở phút 2-4, cả nửa sau của ván (mini-boss, hai đợt bầy
      //             lớn) không bao giờ diễn ra;
      //   quá nhiều + vỉa thưa -> phải băng ngang bản đồ để gom, mà đi bộ đường
      //             dài chính là lúc chết nhiều nhất.
      // Lời giải là VỈA DÀY + CHỈ TIÊU CAO: quặng gặp ngay trên đường đang đi,
      // nhưng phải đào nhiều. Đo được: xong ở khoảng phút 6-7.
      // Chỉ tiêu buộc phải đi cùng tốc đào. Khi đục một vỉa còn 0,8 giây thay
      // vì 2,9 giây, chỉ tiêu 27 xong ở giây 140 và cả cái vòng cung boss –
      // chạy thoát ập xuống trước khi người chơi kịp ngồi vào ván. Ải một giờ
      // là 56, để pha làm việc dài ra lại đúng bảy phút như trước.
      amount: function (lv) { return 62 + lv * 5; },
      hint: 'Morkite là vỉa màu xanh ngọc. Bản đồ nhỏ có chấm xanh.'
    },
    eggs: {
      id: 'eggs', name: 'DIỆT TỔ',
      icon: 111,
      short: function (n) { return 'Phá ' + n + ' ổ trứng'; },
      brief: 'Ổ trứng đang nở. Phá hết trước khi cả hang thành tổ.',
      amount: function (lv) { return 4 + Math.min(3, (lv / 3) | 0); },
      hint: 'Ổ trứng phát sáng cam. Phá là quái quanh đó nổi giận.'
    },
    salvage: {
      id: 'salvage', name: 'THU HỒI',
      icon: 279,
      short: function (n) { return 'Sửa ' + n + ' trụ khoan'; },
      brief: 'Ba trụ khoan hỏng. Đứng gần để sửa, và ráng sống trong lúc sửa.',
      amount: function () { return 3; },
      hint: 'Đứng trong vòng sáng để sửa. Rời ra là dừng.'
    }
  };

  /* Nhiệm vụ PHỤ, luôn có, luôn giống nhau: đào Nitra để gọi tiếp tế.
   * Của DRG: Nitra là tài nguyên DUY NHẤT có giá trị chiến thuật trong màn —
   * mọi khoáng khác chỉ là điểm. Chính chỗ đó đẻ ra căng thẳng "tham hay không". */
  var SUPPLY_COST = 24;

  /*
   * Mốc thời gian. `t` tính bằng giây.
   *   swarm   một đợt quái theo ngân sách điểm
   *   elite   thả một con tinh nhuệ
   *   calm    hố thở: đạo diễn ngừng thả quái lẻ một lúc
   *   mini    mini-boss
   *   note    chỉ hiện chữ
   * Boss và pha chạy thoát KHÔNG nằm ở đây — chúng do tiến độ nhiệm vụ kích
   * hoạt, không do đồng hồ. Xong sớm thì được đánh boss sớm; đó là phần thưởng
   * thật cho việc chơi giỏi, và nó cũng giữ cho ván không dài quá 10 phút.
   */
  var BEATS = [
    { t: 10,  k: 'note',  text: 'Hang này chưa ai xuống. Đào đi.' },
    { t: 40,  k: 'trickle', rate: 0.22 },
    { t: 70,  k: 'swarm', dp: 55,  warn: 'BẦY NHỎ ĐANG TỚI' },
    { t: 92,  k: 'calm',  time: 20 },
    { t: 122, k: 'elite', n: 1 },
    { t: 145, k: 'trickle', rate: 0.32 },
    { t: 172, k: 'swarm', dp: 95,  warn: 'BẦY LỚN — TÌM CHỖ HẸP' },
    { t: 196, k: 'calm',  time: 18 },
    { t: 222, k: 'mini',  warn: 'CÓ THỨ GÌ TO ĐANG ĐÀO TỚI' },
    { t: 258, k: 'trickle', rate: 0.44 },
    { t: 284, k: 'elite', n: 2 },
    { t: 310, k: 'swarm', dp: 140, warn: 'BẦY DÀY — CHẠY ĐI' },
    { t: 336, k: 'calm',  time: 16 },
    { t: 372, k: 'trickle', rate: 0.58 },
    { t: 400, k: 'swarm', dp: 170, warn: 'HANG ĐANG THỨC DẬY' },
    { t: 450, k: 'trickle', rate: 0.72 },
    { t: 490, k: 'swarm', dp: 190, warn: 'CHÚNG BIẾT BẠN Ở ĐÂY' }
  ];

  /* Pha kết. Xong nhiệm vụ -> gọi khoang -> boss -> chạy về.
   * Đường chạy về là ĐƯỜNG CŨ: khoang thoát hạ xuống ĐÚNG CHỖ VÀO. Người chơi
   * đã tự tay đục con đường đó, nên lúc hoảng không phải học lại bản đồ. */
  var END = {
    callDelay: 4,          // giây từ lúc xong nhiệm vụ tới lúc boss trồi lên
    // 80 giây, không phải 60. Đo trong máy: từ chỗ làm xong nhiệm vụ về tới ô
    // vào thường xa 60-100 ô, và người chơi hay phải đục lối tắt giữa chừng.
    // 60 giây thì gần như luôn hụt, mà hụt vì ĐƯỜNG XA chứ không vì đánh dở —
    // đó là kiểu thua không dạy được gì.
    escapeTime: 80,        // giây chạy thoát
    escapeDp: 70,          // điểm quái mỗi nhịp
    escapeEvery: 18,       // nhịp thả, tính bằng giây
    bossWarn: 'CHỦ HANG ĐÃ THỨC'
  };

  function pickType(rng, level) {
    var ids = ['mine', 'eggs', 'salvage'];
    if (level < 2) return TYPES.mine;         // ải đầu luôn là loại dễ hiểu nhất
    return TYPES[rng.pick(ids)];
  }

  G.MISSIONS = TYPES;
  G.MISSION_BEATS = BEATS;
  G.MISSION_END = END;
  G.RUN_TIME = RUN_TIME;
  G.SUPPLY_COST = SUPPLY_COST;
  G.pickMission = pickType;
})(window.DC = window.DC || {});
