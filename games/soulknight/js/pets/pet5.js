// Thú cưng pet5 (Gấu Trúc), kỹ năng "Dễ Thương Bùng Nổ" [LOC pet_5_skill_0_desc]: quái không nỡ tấn công thú cưng, quay sang đánh chủ.
// Bản web: quái vốn chỉ nhắm vào người chơi và không bao giờ nhắm thú cưng (actors.js), nên hiệu ứng "quái chỉ đánh chủ" đã
// sẵn có; thú cưng không có HP bị trúng đạn. Tệp chỉ đánh dấu a.decoy và để hành vi mặc định (đi theo + cắn, damage 2 [ĐO ctl]).
// Phần "kéo hết hoả lực về phía chủ" không thêm gì vì chưa có AI quái nào chọn mục tiêu khác chủ.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  SK.petRegister('pet5', { init(G, a) { a.decoy = true; } });
})();
