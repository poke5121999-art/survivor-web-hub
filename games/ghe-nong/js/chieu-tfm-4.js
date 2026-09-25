/* chieu-tfm-4.js — chiêu viết tay đúng mô tả cho nhóm tướng số 4 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   VÍ DỤ MẪU (agent lõi viết): Priest — kiểu HỖ TRỢ (hồi / khiên / kênh chiêu cuối) và có `mota`
   viết tay thay cho bản điền tự động (bản tự động để `?` ở {Tick} của chiêu cuối).
     skill  "Triệu Hồi Thánh Địa": vùng hồi phạm vi {Range}, {Duration} giây, mỗi {Tick} giây hồi {Value}+{Coef}% SMPT.
     skill2 "Khiên Chúc Phúc": lá chắn {Value}+{Coef}% SMPT cho một đồng minh {Time} giây, +{AttackSpeed}% tốc đánh lúc còn chắn.
     ult    "Lời Cầu Nguyện Từ Thiên Đường": Bất Động {Time} giây, mỗi heal_delay tick bắn một viên đạn hồi
            {Value}+{Coef}% SMPT vào đồng minh máu thấp nhất trong tầm.
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  G.CHIEU_TFM.priest = {
    skill: function (S) {
      var p = S.p, muc = (S.muc && S.muc.doi === S.n.doi) ? S.muc : S.n;
      var moiLan = S.dmg(p.heal, p.attack_ratio, 'ap');
      S.vung(muc.x, muc.y, p.heal_range, p.heal_tick, p.heal_period, null,
        { hoi: function (V, dsMinh) { dsMinh.forEach(function (m) { S.hoi(m, moiLan); }); }, ten: S.kn.ten });
      return true;
    },
    skill2: function (S) {
      var p = S.p, muc = (S.muc && S.muc.doi === S.n.doi) ? S.muc : (S.dongMinhYeuNhat(p.range, true) || S.n);
      S.chan(muc, S.dmg(p.shield, p.shield_ratio, 'ap'), p.tick);
      S.buff(muc, { tocdanh: p.attack_speed }, p.tick, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: muc.x, y2: muc.y, chan: true });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      S.khoaHanh(p.tick);                              /* bất động suốt {Time} giây */
      var soLan = Math.max(1, Math.floor(p.tick / p.heal_delay));
      var luong = S.dmg(p.heal, p.heal_ratio, 'ap');
      S.lap(soLan, p.heal_delay, function () {
        if (S.n.chet > 0) return;
        var m = S.dongMinhYeuNhat(p.range, true);
        if (!m || m.hp >= m.hpMax) return;
        S.dan(m, m.x, m.y, p.heal_speed, function (bi) { S.hoi(bi, luong); }, { hinh: 'ho' });
      });
      return true;
    },
    mota: {
      ult: 'Priest bay lên không trung và trở nên Bất Động trong 5 giây, mỗi 0.7 giây cô bắn một viên đạn vào đồng minh có lượng máu thấp nhất trong tầm chiêu cuối, giúp hồi Máu bằng 20 + 70% SMPT.'
    }
  };

})(window);
