/* chieu-tfm-3.js — chiêu viết tay đúng mô tả cho nhóm tướng số 3 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   VÍ DỤ MẪU (agent lõi viết): Nightmare (tướng mod) — kiểu THAY MỘT NÚT Native của cây hiệu ứng.
   skill và skill2 của nó là cây khai báo (LinearProjectile, MoveTo → RangeEffect) nên sim tự chạy
   đúng; riêng ult là nút `Native` (mã trong exe) mà mô tả nói: lao tới mục tiêu, gây {Damage}+{Coef}%
   SMCK; nếu đòn ấy hạ gục thì dịch chuyển tới cạnh một Tướng đồng minh còn sống. Tham số Native nằm
   ở S.a.effect (speed, range, damage, attack_ratio, teleport_offset).
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  G.CHIEU_TFM.nightmare = {
    ult: function (S) {
      var m = S.muc, e = S.a.effect;
      if (!m || !m.tuong || m.doi === S.n.doi) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var dung = Math.max(0, Math.min(d, S.kc(e.range)) - S.BK * 2);
      S.lao(S.n.x + dx / d * dung, S.n.y + dy / d * dung, e.speed, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(e.damage, e.attack_ratio, 'atk'), 'vl');
        S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
        if (m.chet > 0) {
          /* hạ gục → về cạnh đồng minh còn sống gần nhất, bất kể khoảng cách */
          var ban = null, gd = 1e9;
          S.tran.nguoi.forEach(function (a) {
            if (a.doi !== S.n.doi || a === S.n || a.chet > 0) return;
            var da = Math.hypot(a.x - S.n.x, a.y - S.n.y);
            if (da < gd) { gd = da; ban = a; }
          });
          if (ban) {
            var lech = S.kc(e.teleport_offset || 2000);
            S.n.x = ban.x + lech; S.n.y = ban.y + lech; S.n.px = S.n.x; S.n.py = S.n.y;
            S.chu(S.n, 'hồi quy');
          }
        }
      });
      return true;
    }
  };

})(window);
