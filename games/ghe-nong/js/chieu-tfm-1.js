/* chieu-tfm-1.js — chiêu viết tay đúng mô tả cho nhóm tướng số 1 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   VÍ DỤ MẪU (agent lõi viết): Fighter — cả ba chiêu viết tay từ mô tả tiếng Việt của TFM2.
     skill  "Xung Phong":  lao tới mục tiêu trong {Range} với tốc độ {Speed}, gây {Damage}+{Coef}% SMCK,
                            Làm Choáng {Stun} giây.
     skill2 "Dậm Đất":     {Damage}+{Coef}% SMCK lên mọi kẻ địch trong {Range} xung quanh, Làm Chậm {Slow}% {SlowTime} giây.
     ult    "Nghiền Nát Địa Chấn": {Damage}+{Coef}% SMCK lên mọi kẻ địch trong {Range} xung quanh, Hất Tung {Time} giây.
   Mọi số lấy từ S.p (tham số TFM2 của chính chiêu ấy), KHÔNG chép số vào mã: vá số ở data-tfm.js
   là chiêu đổi theo.
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  G.CHIEU_TFM.fighter = {
    skill: function (S) {
      var m = S.muc, p = S.p;
      if (!m || m.doi === S.n.doi) return false;
      /* lao tới sát mục tiêu (dừng cách hai bán kính người), tới nơi mới ra đòn */
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range)), dung = Math.max(0, xa - S.BK * 2);
      S.lao(S.n.x + dx / d * dung, S.n.y + dy / d * dung, p.speed, function () {
        var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
        S.dich(S.n.x, S.n.y, p.attack_range, {}).forEach(function (bi) {
          S.sat(bi, luong, 'vl');
          if (bi.tuong) S.choang(bi, p.stun);
        });
        S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.attack_range) });
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dich(S.n.x, S.n.y, p.attack_range, {}).forEach(function (bi) {
        S.sat(bi, luong, 'vl');
        if (bi.tuong) S.cham(bi, p.slow_speed, p.slow_duration);
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.attack_range) });
      return true;
    },
    ult: function (S) {
      var p = S.p, luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dich(S.n.x, S.n.y, p.attack_range, {}).forEach(function (bi) {
        S.sat(bi, luong, 'vl');
        if (bi.tuong) S.hat(bi, p.airborne);
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.attack_range) });
      return true;
    }
  };

})(window);
