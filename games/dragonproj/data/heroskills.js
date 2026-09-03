/* ============================================================================
 * ĐÒN RIÊNG CỦA TỪNG NHÂN VẬT
 *
 * VẤN ĐỀ ĐANG SỬA. Kỹ năng vốn gắn vào LỚP VŨ KHÍ, nên 43 nhân vật chỉ có 14 bộ
 * đòn: IRyS, Fauna và Mel đều xả "Trận Sấm / Khiên Ảo" giống hệt nhau. Chọn ai
 * trong ba người đó là chọn một tấm ảnh và một bảng chỉ số, không phải chọn một
 * lối đánh.
 *
 * CÁCH SỬA. Mỗi nhân vật có MỘT đòn của riêng mình ở khe 1, mở sẵn từ đầu. Khe 2
 * vẫn là đòn của lớp, mở ở cấp vũ khí 8 — nên lớp vẫn còn nghĩa, và hai người
 * cùng lớp vẫn có một điểm chung.
 *
 * BA LUẬT TỰ ĐẶT, và luật thứ ba là chỗ phải thành thật:
 *
 *   1. Đòn riêng KHÔNG được trùng `kind` với chính lớp của người đó. Nếu trùng
 *      thì họ có hai đòn cùng một trình phát, và cả ý nghĩa của "đòn riêng" mất.
 *
 *   2. Tên và mô tả phải bám vào NHÂN VẬT, không phải vào cơ chế. "Xúc tu vươn
 *      dài" của Ina là móc kéo; "cái đồng hồ tua ngược" của Ame là dịch chuyển.
 *      Đọc tên đòn phải đoán ra được đó là ai.
 *
 *   3. CÓ LẶP `kind`, và điều đó là bắt buộc chứ không phải cẩu thả: động cơ có
 *      28 trình phát, mà có 43 nhân vật. Trần tự đặt là HAI người một trình phát,
 *      và hai người đó phải khác hệ, khác con số, khác hẳn nhịp dùng. Cách duy
 *      nhất để không lặp là viết thêm mười lăm trình phát nữa, mà mười lăm cái
 *      đó sẽ phải bịa ra từ hư không chứ không từ một ý tưởng nào — thà lặp có
 *      kiểm soát còn hơn.
 *
 * CÁCH GHI. Mỗi mục nêu `base` (lấy đủ trường từ đòn gốc) rồi ghi đè phần khác.
 * Nhờ vậy không mục nào thiếu trường mà trình phát cần — thiếu một trường là đòn
 * đó nổ giữa trận, và nó chỉ nổ khi đúng người đó xả đúng đòn đó.
 * ========================================================================== */
(function (G) {
  'use strict';

  /* base: id của một đòn đã có, dùng làm khuôn.
   * Mọi trường khác ghi đè lên khuôn đó. */
  G.HERO_SKILLS = {

    /* ------------------------------------------------------------- SS --- */
    calli: { base: 'meteor', n: 'Lưỡi Hái Tử Thần', el: 'dark',
      d: 'Một lưỡi hái khổng lồ rơi từ ngoài khung hình xuống điểm đã chỉ. Có bóng báo trước — cái hẹn nào cũng báo trước.',
      cd: 21000, mul: 236, zoneR: 122, delayMs: 780 },

    fubuki: { base: 'flak', n: 'Bão Băng', el: 'water',
      d: 'Nổ một vòng băng quanh người, mảnh bay ra mọi hướng và làm chậm mọi thứ trúng phải.',
      cd: 17000, mul: 198, pellets: 18, ringR: 210, status: 'slow' },

    kiara: { base: 'aegis', n: 'Tro Tàn Phượng Hoàng', el: 'fire',
      d: 'TỰ XẢ khi thanh đầy. Khiên bằng 70% máu tối đa trong 9 giây; vỡ thì bùng một vòng lửa bán kính 180.',
      cd: 23000, mul: 150, shieldFrac: 0.70, ms: 9000, popR: 180, autoCast: true },

    noel: { base: 'stormfield', n: 'Thánh Vực', el: 'light',
      d: 'Dựng một vùng sáng đứng yên. Đứng trong đó thì không lùi một bước — cái gì bước vào đều bị đánh liên tục.',
      cd: 20000, mul: 218, fieldR: 168, fieldMs: 7000, tickMs: 380, bolts: 2 },

    /* -------------------------------------------------------------- S --- */
    ayame: { base: 'cyclone', n: 'Loạn Vũ', el: 'dark',
      d: 'Quay tròn cả hai lưỡi trong 4,5 giây và VẪN ĐI LẠI ĐƯỢC. Cười trước, xả sau.',
      cd: 20000, mul: 214, ms: 4500, r: 88, tickMs: 240 },

    marine: { base: 'carpet', n: 'Pháo Mạn Thuyền', el: 'fire',
      d: 'Nã cả mạn thuyền về hướng đã chỉ — một loạt đạn nổ rải kín cả một dải dài.',
      cd: 19000, mul: 224 },

    pekora: { base: 'cluster', n: 'Cà Rốt Nổ', el: 'light',
      d: 'Ném một quả cà rốt. Nó nổ, và mảnh của nó cũng là cà rốt, và những quả đó cũng nổ.',
      cd: 18000, mul: 212 },

    kaela: { base: 'bigslash', n: 'Nhát Búa Rèn', el: 'earth',
      d: 'Một nhát búa duy nhất, rộng bằng nửa sân, xuyên hết mọi thứ trên đường. Nặng hơn quy định.',
      cd: 20000, mul: 268 },

    coco: { base: 'prism', n: 'Long Diễm', el: 'fire',
      d: 'Quét một luồng lửa hình quạt trước mặt trong một giây. Cái gì đứng trong quạt thì ở đó suốt.',
      cd: 19000, mul: 246 },

    suisei: { base: 'arrowrain', n: 'Mưa Sao Băng', el: 'thunder',
      d: 'Gọi một trận sao băng xuống vùng đã chỉ. Mỗi ngôi có bóng riêng báo trước chỗ nó sẽ cắm.',
      cd: 20000, mul: 232 },

    ina: { base: 'yank', n: 'Xúc Tu Kéo', el: 'dark',
      d: 'Xúc tu vươn thành một đường thẳng rồi giật ngược. Chạm tới bạn trước khi bạn kịp thấy nó vươn.',
      cd: 15000, mul: 148, len: 340, w: 46, stunMs: 1100 },

    mio: { base: 'endlessring', n: 'Bài Định Mệnh', el: 'earth',
      d: 'Một lá bài bay ra và nảy từ con này sang con khác. Rút lá nào ra lá đó.',
      cd: 18000, mul: 196, bounces: 14, bounceR: 280 },

    irys: { base: 'volley', n: 'Song Diện', el: 'light',
      d: 'Bắn hai loạt cùng lúc — một loạt sáng, một loạt tối. Nửa quỷ nửa thiên thần, và cả hai nửa đều bắn.',
      cd: 17000, mul: 208 },

    /* -------------------------------------------------------------- A --- */
    aqua: { base: 'dash', n: 'Bước Hầu Gái', el: 'water',
      d: 'Lướt xuyên qua cả hàng, không ai chạm được, và mọi thứ đi qua đều bị chém. Cự ly bếp.',
      cd: 14000, mul: 128 },

    korone: { base: 'leadstorm', n: 'Cắn Không Nhả', el: 'earth',
      d: 'TỰ XẢ khi thanh đầy. 7 giây: tốc bắn tối đa, tốc chạy +35%, và không gì đẩy bạn lùi được.',
      cd: 19000, ms: 7000, moveBonus: 0.35, autoCast: true },

    watame: { base: 'flak', n: 'Bão Lông Cừu', el: 'light',
      d: 'Nổ một vòng lông cừu ra mọi hướng. Watame did nothing wrong.',
      cd: 16000, mul: 176, pellets: 24, ringR: 175 },

    flare: { base: 'railshot', n: 'Xuyên Hoả Tuyến', el: 'fire',
      d: 'Một đường lửa xuyên hết chiều dài sân. Xuyên càng nhiều con thì càng nặng đòn, và hàng đó cháy.',
      cd: 18000, mul: 330, status: 'burn' },

    shion: { base: 'heartpierce', n: 'Trượng Xuyên', el: 'water',
      d: 'Phóng cả cây gậy đi như một mũi lao — gậy phép dài hơn cả người, nên nó xuyên rất sâu.',
      cd: 16000, mul: 244 },

    towa: { base: 'drones', n: 'Tam Giác Ma', el: 'dark',
      d: 'Ba chiếc sừng tách ra bay quanh người và tự bắn. Một tầm ngắm không ai thoát.',
      cd: 21000, mul: 202 },

    subaru: { base: 'breach', n: 'Lao Vịt', el: 'water',
      d: 'Lao thẳng vào giữa đám, cày qua tất cả rồi kết bằng một cú vung.',
      cd: 15000, mul: 138 },

    ame: { base: 'blink', n: 'Tua Ngược', el: 'thunder',
      d: 'Vặn đồng hồ và hiện lại ở chỗ đã chỉ. Không ai chạm được trong lúc tua.',
      cd: 13000, mul: 156 },

    mumei: { base: 'trilune', n: 'Vòng Lông Vũ', el: 'light',
      d: 'Ba chiếc lông tách ra bay vòng quanh trong 9 giây, chém mọi thứ lại gần và chặt rụng đạn bay vào.',
      cd: 21000, mul: 196, count: 3, ms: 9000 },

    /* Hai mục dưới đây khai THẲNG `kind` thay vì mượn của base.
     * Lý do: lớp Bẫy Mìn đã bỏ đòn "Bãi Mìn" (nó trùng với chính đòn thường của
     * cây — cả hai đều rải mìn), nên không còn mục nào trong G.SKILLS mang kind
     * 'minefield' để mà mượn. Nhưng TRÌNH PHÁT sk_minefield vẫn còn và vẫn đúng
     * cho hai người này: với Bae và Kobo thì rải một bãi là chuyện MỚI, vì lớp
     * của họ (luân xa, cầu lửa) không làm gì giống thế. */
    bae: { base: 'sticky', kind: 'minefield', n: 'Xúc Xắc Hỗn Loạn', el: 'dark',
      d: 'Rải một vòng 12 con xúc xắc quanh chân. Con nào cũng nổ, chỉ là bạn không biết khi nào.',
      cd: 18000, mul: 190, count: 12, spread: 128, armMs: 120, life: 9000 },

    anya: { base: 'shred', n: 'Keris Xoáy', el: 'earth',
      d: 'Nòng cong, đạn đi xoáy — một nón hẹp bào mòn giáp. Mọi đòn sau đó, của bất kỳ ai, đều đau hơn.',
      cd: 17000, mul: 180 },

    kanata: { base: 'breach', n: 'Cú Đấm Thiên Sứ', el: 'light',
      d: 'Lao thẳng vào giữa đám rồi kết bằng một cú đấm. Hôm nào hết đạn thì đấm.',
      cd: 15000, mul: 142 },

    sana: { base: 'reap', n: 'Vành Đai Tiểu Hành Tinh', el: 'earth',
      d: 'Một vành đá xoay đứng yên tại chỗ đã đặt, cắt liên tục mọi thứ đi vào. Niệm một cái là cả hệ đi theo.',
      cd: 20000, mul: 220 },

    fauna: { base: 'singularity', n: 'Rễ Kéo', el: 'earth',
      d: 'Ném một mầm rễ ra xa. Nó bung ra kéo cả đám vào tâm rồi vỡ một cú.',
      cd: 21000, mul: 262 },

    reine: { base: 'overdrive', n: 'Vũ Điệu Công', el: 'light',
      d: 'TỰ XẢ khi thanh đầy. 6 giây: tốc chạy +75%, tốc bắn +40%, và bắn được TRONG LÚC ĐANG CHẠY.',
      cd: 19000, ms: 6000, spdMul: 1.75, rofMul: 1.40, autoCast: true },

    haato: { base: 'cluster', n: 'Món Ăn Bí Ẩn', el: 'fire',
      d: 'Ném một thứ không nên ăn. Nó nổ, rồi mảnh của nó nổ tiếp. Đừng hỏi, cứ né.',
      cd: 17000, mul: 236 },

    /* -------------------------------------------------------------- B --- */
    sora: { base: 'volley', n: 'Loạt Chuẩn', el: 'light',
      d: 'Sáu phát liên tiếp về hướng đã chỉ, không phát nào lệch. Người đầu tiên, và vẫn chuẩn từng viên.',
      cd: 15000, mul: 186 },

    roboco: { base: 'drones', n: 'Vệ Tinh RBC', el: 'thunder',
      d: 'Bốn vệ tinh tách ra bay quanh và tự khoá mục tiêu. Ngắm tự động, đúng nghĩa đen.',
      cd: 20000, mul: 190, drones: 4 },

    mel: { base: 'prism', n: 'Nanh Hút Máu', el: 'dark',
      d: 'Quét một cung tối trước mặt, và mỗi con trúng phải trả lại cho bạn một phần máu.',
      cd: 18000, mul: 222, lifesteal: 0.16 },

    matsuri: { base: 'carpet', n: 'Pháo Hoa Lễ Hội', el: 'fire',
      d: 'Bắn cả một tràng pháo hoa về hướng đã chỉ. Bắn gần, và nóng.',
      cd: 17000, mul: 214 },

    aki: { base: 'blink', n: 'Bước Nhảy', el: 'none',
      d: 'Nhảy tới chỗ đã chỉ theo đúng nhịp, không lệch một phách. Không ai chạm được trong lúc nhảy.',
      cd: 13000, mul: 162 },

    choco: { base: 'heartpierce', n: 'Mũi Tiêm Trăm Mét', el: 'thunder',
      d: 'Một mũi tiêm bay xuyên cả hàng. Bác sĩ bảo không đau.',
      cd: 16000, mul: 252, status: 'poison' },

    luna: { base: 'trilune', n: 'Vòng Kẹo', el: 'none',
      d: 'Ba viên kẹo tách ra bay vòng quanh người trong 7 giây, chém mọi thứ lại gần và chặt rụng đạn bay vào.',
      cd: 19000, mul: 186, count: 3, ms: 7000, orbitR: 74 },

    miko: { base: 'railshot', n: 'Nhãn Quang', el: 'thunder',
      d: 'Một tia laser thẳng từ mắt, xuyên hết chiều dài sân. Nyaa~',
      cd: 18000, mul: 316 },

    azki: { base: 'stormfield', n: 'Sóng Âm Nén', el: 'light',
      d: 'Nén sóng âm thành một vùng đứng yên. Cái gì bước vào thì rung tới vỡ.',
      cd: 19000, mul: 210, fieldR: 155, fieldMs: 6500, bolts: 2 },

    iofi: { base: 'bigslash', n: 'Nét Cọ', el: 'thunder',
      d: 'Một nét cọ duy nhất quét ngang cả sân, xuyên hết mọi thứ trên đường.',
      cd: 19000, mul: 252 },

    risu: { base: 'endlessring', n: 'Hạt Dẻ Nảy', el: 'earth',
      d: 'Ném một hạt dẻ nảy từ con này sang con khác tới mười lần. Nhiều và nhanh, đúng như quảng cáo.',
      cd: 16000, mul: 172, bounces: 10, bounceR: 240 },

    moona: { base: 'yank', n: 'Triều Kéo', el: 'water',
      d: 'Một luồng nước vươn thẳng rồi giật ngược, lôi cả hàng về sát chân bạn.',
      cd: 15000, mul: 140, len: 310 },

    kobo: { base: 'sticky', kind: 'minefield', n: 'Vũng Mưa', el: 'water',
      d: 'Rải 10 vũng nước quanh chân. Quả nào rơi xuống cũng thành vũng, và vũng thì trơn.',
      cd: 17000, mul: 178, count: 10, spread: 112, armMs: 200, life: 10000, status: 'slow' },

    zeta: { base: 'dash', n: 'Bóng Điệp Viên', el: 'water',
      d: 'Lướt xuyên qua cả hàng và để lại một cái bóng ở mỗi bước. Hai khẩu, một cái bóng.',
      cd: 14000, mul: 134 }
  };

  /* Dựng đòn thật từ khuôn. Gọi một lần lúc nạp, không gọi mỗi khung.
   *
   * `base` trỏ tới một đòn đã có ĐỦ TRƯỜNG cho trình phát của nó. Ghi đè lên
   * khuôn đó thay vì viết lại từ đầu là cách duy nhất bảo đảm không mục nào
   * thiếu một trường mà `sk_<kind>` cần — mà thiếu trường thì đòn ấy nổ giữa
   * trận, và chỉ nổ khi đúng người ấy xả đúng đòn ấy. */
  G.buildHeroSkills = function () {
    var out = {};
    Object.keys(G.HERO_SKILLS).forEach(function (hid) {
      var o = G.HERO_SKILLS[hid];
      var base = G.skillById(o.base2 || o.base);
      if (!base) { return; }
      var sk = {};
      Object.keys(base).forEach(function (k) { sk[k] = base[k]; });
      Object.keys(o).forEach(function (k) {
        if (k === 'base' || k === 'base2') return;
        sk[k] = o[k];
      });
      sk.id = 'sig_' + hid;
      sk.hero = hid;
      out[hid] = sk;
    });
    return out;
  };

  G.SIG = null;
  G.sigSkill = function (heroId) {
    if (!G.SIG) G.SIG = G.buildHeroSkills();
    return G.SIG[heroId] || null;
  };

})(window.DP = window.DP || {});
