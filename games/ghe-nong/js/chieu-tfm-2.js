/* chieu-tfm-2.js — chiêu viết tay đúng mô tả cho nhóm tướng số 2 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   VÍ DỤ MẪU (agent lõi viết): Pyromancer — kiểu VIẾT MỘT PHẦN. Chỉ skill2 "Rải Thảm Lửa" viết tay
   (vùng đốt tồn tại {Duration} giây, mỗi {Tick} giây gây {Damage}+{Coef}% SMPT trong {Range});
   skill và ult không khai → sim chạy cách chung (đủ đúng: cầu lửa nổ trễ, vụ nổ lớn nổ trễ).
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  G.CHIEU_TFM.pyromancer = {
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      var moiLan = S.dmg(p.damage, p.attack_ratio, 'ap');
      S.vung(diem[0], diem[1], p.attack_range, p.attack_tick, p.attack_period, function (V, ds) {
        ds.forEach(function (bi) { S.sat(bi, moiLan, 'pt'); });
      }, { ten: S.kn.ten });
      return true;
    }
  };

})(window);
