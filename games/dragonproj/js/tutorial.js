/* ============================================================================
 * HƯỚNG DẪN CHO NGƯỜI MỚI
 *
 * VẤN ĐỀ. Game này có mười bốn lớp vũ khí, bốn mươi ba nhân vật, ba banner quay,
 * năm bậc nâng cấp khác nhau và một cử chỉ điều khiển mà không ai từng thấy ở
 * đâu (giữ ngón trên sân để xả ulti). Ném một người mới vào màn hình chính rồi
 * để họ tự mò thì họ sẽ bấm hai nút, không hiểu gì, và tắt.
 *
 * CÁCH LÀM. Một chuỗi bước. Mỗi bước làm đúng ba việc:
 *   1. KHOÉT SÁNG đúng chỗ cần bấm, tối hết phần còn lại
 *   2. Nói MỘT câu — làm gì, và vì sao nó đáng làm
 *   3. Chờ người chơi tự bấm vào đúng chỗ đó, rồi mới sang bước kế
 *
 * BA LUẬT TỰ ĐẶT:
 *
 *   KHÔNG BAO GIỜ BẤM HỘ. Bước nào cũng chờ NGƯỜI CHƠI chạm. Tự động chuyển màn
 *   rồi báo "xong rồi đấy" thì họ xem xong một đoạn phim, không học được gì —
 *   ngón tay mới là thứ nhớ, không phải mắt.
 *
 *   KHOÉT SÁNG BẰNG LỖ CẮT THẬT (clip-path), không phải bằng bóng đổ. Bóng đổ
 *   chỉ VẼ ra vùng tối — phần tử che vẫn nằm nguyên trên cái nút và nuốt sạch cú
 *   chạm, nên người chơi bấm đúng chỗ sáng mà không có gì xảy ra. clip-path thì
 *   cắt thật: chỗ bị cắt không còn thuộc phần tử nữa, chạm đi thẳng xuống nút.
 *   (Đây là lỗi đã mắc ở bản đầu, và nó im lặng hoàn toàn — không lỗi, không
 *   cảnh báo, chỉ là một cái nút không bấm được.)
 *
 *   BỎ QUA ĐƯỢC BẤT CỨ LÚC NÀO, và nút bỏ qua phải thấy ngay từ bước một. Một
 *   hướng dẫn không thoát ra được là một cái bẫy, kể cả khi nó viết hay.
 *
 * TRẠNG THÁI nằm trong save (`s.tut`), không nằm trong biến tạm: tải lại trang
 * giữa chừng thì phải tiếp đúng chỗ đang dở, chứ không quay về bước một.
 * ========================================================================== */
(function (G) {
  'use strict';

  /* Mỗi bước:
   *   id      — khoá, ghi vào save khi xong
   *   scr     — màn phải đang mở thì bước này mới chạy ('battle' = đang trong ải)
   *   sel     — CSS selector của chỗ cần khoét sáng. Hàm cũng được.
   *   t       — chữ hướng dẫn
   *   tip     — dòng phụ nhỏ hơn, nói VÌ SAO
   *   next    — điều kiện sang bước sau: 'tap' (chạm đúng chỗ sáng) hoặc một hàm
   *   place   — 'auto' | 'top' | 'bottom': đặt bảng chữ ở đâu so với lỗ sáng
   */
  G.TUT = [
    { id: 'welcome', scr: 'home', sel: null,
      t: 'Chào. Đây là hướng dẫn ba phút.',
      tip: 'Bấm tiếp để đi từng bước: đánh một ải, quay một nhân vật, rồi nâng cấp. Bỏ qua lúc nào cũng được.',
      next: 'ok' },

    /* ---------------------------------------------------- VÀO ẢI ------- */
    { id: 'go-quest', scr: 'home', sel: '[data-nav="quest"]',
      t: 'Bấm ẢI để chọn nơi đánh.',
      tip: 'Mọi thứ trong game đều đi ra từ đây: gold để nâng cấp, gem để quay.',
      next: 'tap' },

    { id: 'pick-stage', scr: 'quest', sel: '#body-quest [data-stage]',
      t: 'Chọn ải đầu tiên.',
      tip: 'Nửa đầu ải là quái thường, dọn đủ số thì Behemoth ra.',
      next: 'tap' },

    /* -------------------------------------------------- ĐIỀU KHIỂN ----- */
    { id: 'move', scr: 'battle', sel: null, place: 'top',
      t: 'KÉO ngón bất kỳ đâu trên sân để đi.',
      tip: 'Cần gạt mọc ra ngay tại chỗ bạn đặt ngón — không có nút cố định nào ở góc, nên ngón cái không bao giờ che mất nhân vật.',
      next: function (b) { return b && b.player.usedMove; } },

    { id: 'attack', scr: 'battle', sel: null, place: 'top',
      t: 'CHẠM nhanh để bắn. Bấm liên tục thì bắn liên tục.',
      tip: 'Không phải ngắm: nòng tự quay về con gần nhất.',
      next: function (b) { return b && b.player.usedAttack; } },

    { id: 'dodge', scr: 'battle', sel: null, place: 'top',
      t: 'VẨY nhanh một cái để né.',
      tip: 'Trong lúc lăn thì không ai chạm được vào bạn. Đây là thứ giữ bạn sống, không phải máu.',
      next: function (b) { return b && b.player.usedDodge; } },

    { id: 'ulti', scr: 'battle', sel: null, place: 'top',
      t: 'Đánh trúng đủ nhiều thì thanh vàng TRÊN ĐẦU đầy lên.',
      tip: 'Đầy rồi thì GIỮ ngón trên sân → KÉO chỉ hướng → THẢ là xả đòn lớn. Chữ "GIỮ ĐỂ XẢ" hiện ngay trên đầu nhân vật khi sẵn sàng.',
      next: function (b) { return b && b.player.usedSkill; } },

    /* ---------------------------------------------------- QUAY --------- */
    { id: 'go-gacha', scr: 'home', sel: '[data-nav="gacha"]',
      t: 'Giờ đi quay. Bấm TRIỆU HỒI.',
      tip: 'Gem kiếm được từ phá ải. Quay ra nhân vật, vũ khí và trang bị.',
      next: 'tap' },

    { id: 'pull', scr: 'gacha', sel: '#body-gacha [data-pull="10"]',
      t: 'Quay 10 lượt một lần.',
      tip: 'Quay hụt không mất trắng: mỗi lượt trượt đẩy tỉ lệ SS lên, và tới một mốc thì chắc chắn ra. Đó là "pity".',
      next: 'tap' },

    /* ------------------------------------------------- LẮP & NÂNG ----- */
    { id: 'go-armory', scr: 'home', sel: '[data-nav="armory"]',
      t: 'Vào KHO ĐỒ để lắp thứ vừa quay được.',
      tip: 'Mỗi nhân vật giữ trang bị của riêng mình, và chỉ cầm được đúng lớp vũ khí của mình.',
      next: 'tap' },

    { id: 'open-gear', scr: 'armory', sel: '#body-armory [data-gear]',
      t: 'Bấm vào một món để mở bảng chi tiết.',
      tip: 'Trong đó có bốn bậc nâng cấp: Nâng cấp, Đột phá, Tinh luyện, và đổi ability.',
      next: 'tap' },

    { id: 'enhance', scr: 'gear', sel: '#body-gear [data-act="enh"]',
      t: 'NÂNG CẤP bằng gold. Đây là bậc rẻ nhất và làm trước tiên.',
      tip: 'Lên cấp vũ khí tới 8 thì mở luôn đòn thứ hai của lớp.',
      next: 'tap' },

    /* ---------------------------------------------------- TIẾN HOÁ ----- */
    { id: 'go-evol', scr: 'home', sel: '[data-go="evol"]',
      t: 'Cuối cùng: TIẾN HOÁ.',
      tip: 'Khác mọi thứ khác — nó cộng chỉ số nền cho TẤT CẢ nhân vật cùng lúc, kể cả người chưa quay ra.',
      next: 'tap' },

    { id: 'evol-up', scr: 'evol', sel: '#body-evol [data-evol]',
      t: 'Nâng một nhánh bất kỳ.',
      tip: 'Bốn nhánh: máu, công, thủ, kháng hệ. Cứ năm cấp thì cần thêm Lõi Rồng.',
      next: 'tap' },

    { id: 'done', scr: null, sel: null,
      t: 'Xong. Đủ để tự đi tiếp rồi.',
      tip: 'Vòng lặp là: phá ải lấy gem và gold → quay ra người và đồ → nâng cấp → phá ải khó hơn. Mở lại hướng dẫn này ở mục Khác.',
      next: 'ok' }
  ];

  G.tutIndex = function (s) {
    if (!s.tut) return 0;
    if (s.tut.done) return -1;
    return s.tut.i || 0;
  };

  G.tutStep = function (s) {
    var i = G.tutIndex(s);
    return i < 0 ? null : (G.TUT[i] || null);
  };

  G.tutAdvance = function (s) {
    s.tut = s.tut || { i: 0 };
    s.tut.i = (s.tut.i || 0) + 1;
    if (s.tut.i >= G.TUT.length) { s.tut.done = 1; s.tut.i = G.TUT.length; }
    return G.tutStep(s);
  };

  G.tutSkip = function (s) { s.tut = { i: G.TUT.length, done: 1 }; };
  G.tutRestart = function (s) { s.tut = { i: 0 }; };

})(window.DP = window.DP || {});
