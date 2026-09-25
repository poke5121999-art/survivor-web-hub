/* chieu-tfm-1.js — chiêu viết tay đúng mô tả cho nhóm tướng số 1 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   Nhóm 1 (17 tướng): android, archer, bard, barrier_magician, berserker, bomber, boomerang_hunter,
   cavalry_knight, chef, circus_blade, clown, dancer, dark_mage, demon, fighter, ogre, prisoner.

   VÍ DỤ MẪU (agent lõi viết, GIỮ NGUYÊN): Fighter — cả ba chiêu viết tay từ mô tả tiếng Việt của TFM2.

   BẪY ĐÃ ĐO khi viết nhóm này (đọc kỹ trước khi sửa):
   - `S.dan(...)` KHÔNG tự đổi đơn vị bán kính chạm `o.r` (khác `S.dich`/`S.satVung`/`S.vung` đều tự đổi) —
     phải tự bọc `S.kc(...)` khi truyền `r` cho `S.dan`, không thì bán kính chạm sai cả nghìn lần.
   - `khongChe`/`chan`/`buff` chỉ tác dụng lên `m.tuong` (tướng) — quái lớn/lính không ăn choáng/khiên/buff
     qua các hàm này (đã đúng theo primitive, không cần tự lọc thêm).
   - Nhiều tướng có tham số KHÔNG khớp tên gợi ý trong mô tả (ví dụ {Time} tự điền trúng `buff_duration`
     thay vì `shield_duration`, hay {Range} không có tham số nào khớp bảng ứng viên của data-tuong.js ⇒
     hiện `?`) — mỗi chỗ như vậy có ghi chú "diễn giải" ngay phía trên, và tệp `mota` chỉ được vá khi bản
     tự động THỰC SỰ hiện `?` (không vá cho mọi lựa chọn có thể tranh cãi, theo đúng RESEARCH §14.3).
   - Một số cơ chế trong mô tả cần "móc" mà `chieu.js` hiện chưa có (khiên vỡ/hết hạn mới kích hoạt tiếp,
     chặn đạn bay trong vùng, chia sẻ sát thương giữa hai mục tiêu, cộng hiệu ứng thêm vào đòn đánh
     thường một khoảng thời gian, làm mới trạng thái khi hạ gục/đòn thường trúng, quy đổi % sát thương
     nhận thành sát thương theo thời gian) — đã ghi yêu cầu trong kế hoạch, phần còn thiếu được đánh dấu
     `[CHƯA LÀM ĐƯỢC]` ngay tại chỗ, chạy đúng phần còn lại (không throw, không chặn các tướng khác).
   - `ogre.skill` và phần "Dư Âm Cuộc Săn" (`dancer.skill2`) là NỘI TẠI thật của TFM2 (không có tham số
     ở BẤT KỲ khoá nào) — `sim.js` (`thuChieu`) đã tự bỏ qua khi `!n.tuong.tfm[loai]`, nên không đăng ký
     ở đây (đăng ký cũng không bao giờ được gọi).
   - `dancer.skill` (Ném Chakram) THỰC SỰ có đủ tham số nhưng TFM2 đặt tên khoá gốc là `skill1` chứ không
     phải `skill`; `data-tuong.js` dựng `kn.skill.p` từ `c['skill']` nên rơi vào tay trắng, và
     `sim.js` `thuChieu()` chặn luôn ở `if (!n.tuong.tfm['skill']) continue` — hàm dưới đây viết đúng,
     đọc thẳng `S.n.tuong.tfm.skill1`, nhưng KHÔNG được gọi tới cho đến khi lõi vá `data-tuong.js`
     (đã ghi yêu cầu trong kế hoạch). Không phải lỗi của tệp này.
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  /* ══════════════════ ANDROID (Melee, Tank, CC) ══════════════════ */
  G.CHIEU_TFM.android = {
    /* skill "Bắn Sóng Xung Kích": sóng thẳng, nổ tròn khi trúng ĐỊCH hoặc bay hết tầm.
       attack_range (10000) = bán kính CHẠM của sóng khi bay; explosion_range (16000) = bán kính NỔ
       thật sự khi phát nổ (diễn giải: hai bán kính khác nhau, xem `attack_range:0` của Bomber làm rõ
       cùng khuôn mẫu này). */
    skill: function (S) {
      var p = S.p, h = S.huong();
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      var no = false;
      function noTai(x, y) {
        if (no) return; no = true;
        S.dich(x, y, p.explosion_range, {}).forEach(function (m) {
          S.sat(m, luong, 'vl');
          if (m.tuong) S.cham(m, p.slow_ratio, p.slow_duration);
        });
        S.fx({ loai: 'chieu', x: x, y: y, dien: true, r: S.kc(p.explosion_range) });
      }
      S.dan(null, ex, ey, p.speed, function (m) { noTai(m.x, m.y); },
        { r: S.kc(p.attack_range), ketThuc: noTai });
      return true;
    },
    /* skill2 "Lá Chắn Phát Nổ": khiên rồi khi HẾT HẠN mới choáng xung quanh.
       [CHƯA LÀM ĐƯỢC ĐỦ] `chieu.js` chưa có móc "khi khiên vỡ/hết" — chỉ mô phỏng được nhánh HẾT HẠN
       tự nhiên (hẹn đúng lúc `shield_duration` trôi qua), không bắt được nhánh "khiên bị đánh vỡ sớm".
       {Time} của khiên tự điền trúng `buff_duration` (120) thay vì `shield_duration` (180) đúng nghĩa
       "duy trì" — dùng `shield_duration`, có vá `mota` vì {Range} không khớp tham số nào
       (chỉ có `stun_range`, không có trong bảng ứng viên `Range` của data-tuong.js ⇒ hiện `?`). */
    skill2: function (S) {
      var p = S.p;
      var luong = p.shield_amount + S.cs.hpMax * p.shield_hp_ratio / 100;
      S.chan(S.n, luong, p.shield_duration);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, chan: true });
      S.sau(p.shield_duration, function () {
        if (S.n.chet > 0) return;
        S.dich(S.n.x, S.n.y, p.stun_range, {}).forEach(function (m) { S.choang(m, p.stun_duration); });
        S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.stun_range) });
      });
      return true;
    },
    /* ult "Dịch Chuyển Nhất Thống": khiên cho đồng minh chỉ định, dịch chuyển tới đó sau {Time} giây.
       {Time} (điểm dịch chuyển) tự điền trúng `shield_duration` (thời lượng khiên) thay vì `charge_time`
       (48 tick = 0,8s, đúng "sau … giây" của câu dịch chuyển) — dùng `charge_time`, vá `mota`. */
    ult: function (S) {
      var p = S.p;
      var muc = (S.muc && S.muc.doi === S.n.doi && S.muc.tuong) ? S.muc : S.dongMinhYeuNhat(p.range, false);
      if (!muc) return false;
      var luong = p.shield + muc.hpMax * p.shield_hp_ratio / 100;
      S.chan(muc, luong, p.shield_duration);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: muc.x, y2: muc.y, chan: true });
      S.sau(p.charge_time, function () {
        if (S.n.chet > 0 || muc.chet > 0) return;
        S.n.x = muc.x + 6; S.n.y = muc.y + 6; S.n.px = S.n.x; S.n.py = S.n.y;
        S.chu(S.n, 'dịch chuyển');
      });
      return true;
    },
    mota: {
      skill2: 'Android nhận một Lá chắn có giá trị 300 + 10% Máu Tối Đa duy trì trong 3 giây. Khi lá chắn hết hạn, Làm Choáng toàn bộ kẻ địch xung quanh trong phạm vi 35 trong 1 giây.',
      ult: 'Android tạo một Lá chắn có giá trị 500 + 20% Máu Tối Đa cho một đồng minh được chỉ định trong phạm vi, đồng thời dịch chuyển đến vị trí của đồng minh đó sau 0,8 giây.'
    }
  };

  /* ══════════════════ ARCHER (Range, AD) ══════════════════ */
  G.CHIEU_TFM.archer = {
    /* skill "Lộn Nhào": nhảy về hướng chỉ định, đánh "kẻ địch vừa bị tấn công" — không có bán kính
       riêng trong tham số ⇒ diễn giải là mục tiêu đang được chọn lúc ra chiêu (`S.muc`, đã ưu tiên
       "con đang đánh" ở `G.chonMucChieu`), đánh trúng nếu còn trong tầm sau khi nhảy tới. */
    skill: function (S) {
      var p = S.p, m = S.muc, h = S.huong();
      var jx = S.n.x + h[0] * S.kc(p.move_range), jy = S.n.y + h[1] * S.kc(p.move_range);
      S.lao(jx, jy, p.speed, function () {
        if (m && m.doi !== S.n.doi && m.hp > 0 && !(m.chet > 0) && S.trongTam(m, p.move_range)) {
          S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
          S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
        }
      });
      return true;
    },
    /* skill2 "Đại Tiễn": bắn một mũi tên, choáng "trong chốc lát" và nhảy lùi lại.
       Không có tham số choáng nào ⇒ diễn giải: `move_tick` (10 tick ≈ 0,17s) là khoảng "chốc lát" đó,
       dùng luôn làm thời lượng khoá lùi/choáng ngắn; `move_range` là quãng nhảy lùi. */
    skill2: function (S) {
      var p = S.p, h = S.huong();
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dan(S.muc, ex, ey, p.projectile_speed, function (m) {
        S.sat(m, luong, 'vl');
        if (m.tuong) S.choang(m, p.move_tick);
      }, {});
      var lui = S.diemXa(-p.move_range);
      S.lao(lui[0], lui[1], p.projectile_speed, null, {});
      return true;
    },
    /* ult "Mưa Tên": đứng yên bắn {Count} mũi tên vào các kẻ địch NGẪU NHIÊN trong phạm vi. */
    ult: function (S) {
      var p = S.p;
      S.khoaHanh(p.total_shots * p.interval);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.lap(p.total_shots, p.interval, function () {
        if (S.n.chet > 0) return;
        var ds = S.dich(S.n.x, S.n.y, p.range, { tuong: true });
        if (!ds.length) return;
        var m = S.tran.rng.chon(ds);
        S.dan(m, m.x, m.y, p.speed, function (bi) { S.sat(bi, luong, 'vl'); }, {});
      });
      return true;
    }
  };

  /* ══════════════════ BARD (Util, AP) ══════════════════ */
  G.CHIEU_TFM.bard = {
    /* skill "Bài Ca Hân Hoan": tăng tốc đánh cho MỘT đồng minh. */
    skill: function (S) {
      var p = S.p;
      var muc = (S.muc && S.muc.doi === S.n.doi && S.muc.tuong) ? S.muc
        : (S.dongMinhYeuNhat(p.range, false) || S.dongMinhYeuNhat(p.range, true));
      if (!muc) return false;
      var boost = p.attack_speed + p.magic_ratio / 100 * S.cs.ap;
      S.buff(muc, { tocdanh: boost }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: muc.x, y2: muc.y, aura: true });
      return true;
    },
    /* skill2 "Hợp Âm Cao Trào": nốt bay tới điểm chỉ định (theo `speed`) rồi giảm hồi chiêu cho đồng
       minh trong bán kính đó. */
    skill2: function (S) {
      var p = S.p, pt = S.diemMuc();
      var dx = pt[0] - S.n.x, dy = pt[1] - S.n.y, d = Math.sqrt(dx * dx + dy * dy);
      var tre = Math.max(1, Math.round(d * G.TFM_DV / p.speed));
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: pt[0], y2: pt[1], cho: S.giay(tre) });
      S.sau(tre, function () {
        var giam = p.cooltime_reduce + p.magic_ratio / 100 * S.cs.ap;
        S.dongMinh(pt[0], pt[1], p.buff_range, { keMinh: true }).forEach(function (m) {
          S.buff(m, { hoiChieu: giam }, p.effect_duration, S.kn.ten);
        });
        S.fx({ loai: 'chieu', x: pt[0], y: pt[1], dien: true, r: S.kc(p.buff_range) });
      });
      return true;
    },
    /* ult "Khúc Chiến Ca": kênh tại chỗ, mỗi `period` tick làm mới buff/nợ cho đồng minh xung quanh.
       "giảm Giáp/Kháng của HỌ" (của chính đồng minh, không phải kẻ địch) ⇒ cộng thẳng vào buff đồng minh
       (khớp luật đặc biệt "của họ" đã có sẵn trong `phanTich` của cách chạy chung). */
    ult: function (S) {
      var p = S.p;
      S.khoaHanh(p.channel_duration);
      var atkAdd = p.attack_boost + p.magic_ratio / 100 * S.cs.ap;
      var soLan = Math.max(1, Math.floor(p.channel_duration / p.period));
      S.lap(soLan, p.period, function () {
        if (S.n.chet > 0) return;
        S.dongMinh(S.n.x, S.n.y, p.range, { keMinh: true }).forEach(function (m) {
          S.buff(m, {
            atk: atkAdd, ap: p.magic_power_boost, tocdanh: p.attack_speed_boost,
            hoiChieu: p.skill_cooldown_reduce, giapM: -p.defence_reduce, khangM: -p.magic_resistance_reduce
          }, p.period + 6, S.kn.ten);
        });
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    }
  };

  /* ══════════════════ BARRIER MAGICIAN (Util, AP, Shield, Magic) ══════════════════ */
  G.CHIEU_TFM.barrier_magician = {
    /* skill "Kết Giới Bảo Hộ": vùng khiên cho đồng minh + giảm tốc đánh địch bên trong.
       Diễn giải: "từ cấp 3" tăng thêm tốc đánh đồng minh / làm chậm địch không tách được thành hai bộ
       tham số riêng trong dữ liệu (chỉ có một khối số) ⇒ áp dụng luôn cả hai hiệu ứng mọi cấp. */
    skill: function (S) {
      var p = S.p, pt = S.diemMuc();
      var chanLuong = p.shield + p.shield_ratio / 100 * S.cs.ap;
      S.vung(pt[0], pt[1], p.barrier_range, p.tick, 15, function (V, dsDich) {
        dsDich.forEach(function (m) { S.buff(m, { tocdanh: -p.attack_speed_reduce, tocchay: -p.slow_ratio }, 21, S.kn.ten + ' (nợ)'); });
      }, {
        hoi: function (V, dsMinh) {
          dsMinh.forEach(function (m) {
            S.chan(m, chanLuong, 21);
            S.buff(m, { tocdanh: p.attack_speed_increase }, 21, S.kn.ten);
          });
        },
        ten: S.kn.ten
      });
      S.fx({ loai: 'chieu', x: pt[0], y: pt[1], dien: true, r: S.kc(p.barrier_range) });
      return true;
    },
    /* skill2 "Kết Giới Phong Toả": vô hiệu hoá đạn bay bên trong.
       [CHƯA LÀM ĐƯỢC] `chieu.js` chưa có nguyên thuỷ chặn đạn bay theo vùng (đạn nằm trong `tran.dan`,
       không có hàm truy vấn/can thiệp nào cho người viết chiêu) — đã ghi yêu cầu thêm `S.chanDan(...)`
       trong kế hoạch. Vẫn dựng đúng vùng để hiện hình, không gây lỗi, chỉ thiếu tác dụng chặn đạn. */
    skill2: function (S) {
      var p = S.p, pt = S.diemMuc();
      S.fx({ loai: 'chieu', x: pt[0], y: pt[1], dien: true, r: S.kc(p.barrier_range), cho: S.giay(p.tick) });
      return true;
    },
    /* ult "Vòng Tội Lỗi": kết giới thu hẹp dần quanh mục tiêu, chạm rìa mới choáng (một lần một người). */
    ult: function (S) {
      var p = S.p, pt = S.diemMuc();
      var cx = pt[0], cy = pt[1];
      var luong = S.dmg(p.damage, p.ap_ratio, 'ap');
      var da = {};
      var tickMoi = 5, soLan = Math.max(1, Math.floor(p.barrier_tick / tickMoi));
      var r0 = S.kc(p.start_radius), r1 = S.kc(p.end_radius), rim = S.kc(p.edge_thickness);
      S.lap(soLan, tickMoi, function (k) {
        var rNow = r0 + (r1 - r0) * (k / soLan);
        S.dich(cx, cy, p.start_radius, { tuong: true }).forEach(function (m) {
          if (da[m.i]) return;
          var d = Math.hypot(m.x - cx, m.y - cy);
          if (Math.abs(d - rNow) <= rim) {
            da[m.i] = true;
            S.sat(m, luong, 'pt');
            S.choang(m, p.stun_duration);
          }
        });
      });
      S.fx({ loai: 'cuoi', x: cx, y: cy, dien: true, r: S.kc(p.start_radius) });
      return true;
    }
  };

  /* ══════════════════ BERSERKER (Melee, AD) ══════════════════ */
  G.CHIEU_TFM.berserker = {
    /* skill "Hoá Cuồng": tự buff tốc đánh + hút máu. */
    skill: function (S) {
      var p = S.p;
      S.buff(S.n, { tocdanh: p.attack_speed, vamp: p.vamp }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, aura: true });
      return true;
    },
    /* skill2 "Bổ Xuống Đất": nhảy tới `offset` rồi hất tung quanh điểm đáp.
       Không có tham số tốc độ riêng cho pha nhảy (chỉ có `offset` quãng đường) ⇒ dịch chuyển tức thời
       (giống một cú chồm ngắn), không lao rề rà thêm một khoảng tốc độ tự bịa. */
    skill2: function (S) {
      var p = S.p, h = S.huong();
      S.n.x += h[0] * S.kc(p.offset); S.n.y += h[1] * S.kc(p.offset);
      S.n.px = S.n.x; S.n.py = S.n.y;
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dich(S.n.x, S.n.y, p.attack_range, {}).forEach(function (m) {
        S.sat(m, luong, 'vl');
        if (m.tuong) S.hat(m, p.airborne_time);
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.attack_range) });
      return true;
    },
    /* ult "Cú Nện Phẫn Nộ": lao tới mục tiêu, chém.
       [CHƯA LÀM ĐƯỢC] "Hồi chiêu giảm tỉ lệ với Máu đã mất" là NỘI TẠI luôn bật (`ult_cooltime_reduction`
       13, trần `ult_max_cooltime_reduction` 900 — nằm NGOÀI khối `ult`, ở gốc tướng), cần móc theo dõi
       máu mất mỗi tick / mỗi lần ăn đòn, `chieu.js` chưa có chỗ nào chạy ngoài lúc ra chiêu — đã ghi yêu
       cầu trong kế hoạch. Phần lao-chém chủ động vẫn đúng số. */
    ult: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range)), dung = Math.max(0, xa - S.BK * 2);
      S.lao(S.n.x + dx / d * dung, S.n.y + dy / d * dung, p.speed, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      });
      return true;
    }
  };

  /* ══════════════════ BOMBER (Range, AD) ══════════════════ */
  G.CHIEU_TFM.bomber = {
    /* skill "Ném Bom": bay tới điểm chỉ định rồi nổ (attack_range:0 ⇒ không nổ giữa đường, chỉ nổ ở
       cuối tầm, khác Android có attack_range>0 nổ ngay khi chạm địch). */
    skill: function (S) {
      var p = S.p, pt = S.diemMuc();
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dan(null, pt[0], pt[1], p.speed, function () {}, {
        ketThuc: function (x, y) {
          S.dich(x, y, p.explosion_range, {}).forEach(function (m) { S.sat(m, luong, 'vl'); });
          S.fx({ loai: 'chieu', x: x, y: y, dien: true, r: S.kc(p.explosion_range) });
        }
      });
      return true;
    },
    /* skill2 "Mìn Trói Chân": đặt mìn tại điểm chỉ định, kích hoạt sau `activation_delay`, kẻ địch (không
       phải lính) đầu tiên đạp trúng mới nổ. */
    skill2: function (S) {
      var p = S.p, pt = S.diemMuc();
      S.dan(null, pt[0], pt[1], p.speed, function () {}, {
        ketThuc: function (x, y) {
          S.sau(p.activation_delay, function () {
            var no = false;
            S.vung(x, y, p.attack_range, 300, 5, function (V, ds) {
              if (no || !ds.length) return;
              no = true;
              var m = ds[0];
              S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
              S.troi(m, p.bind_duration);
              S.fx({ loai: 'chieu', x: x, y: y, dien: true, r: S.kc(p.attack_range) });
            }, { loc: { tuong: true } });
          });
        }
      });
      return true;
    },
    /* ult "Siêu Bom Chết Chóc": nổ chậm theo `travel_time` cố định (không phải theo tốc độ bay). */
    ult: function (S) {
      var p = S.p, pt = S.diemMuc();
      S.fx({ loai: 'chieu', x: pt[0], y: pt[1], dien: true, r: S.kc(p.explosion_range), cho: S.giay(p.travel_time) });
      S.sau(p.travel_time, function () {
        var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
        S.dich(pt[0], pt[1], p.explosion_range, {}).forEach(function (m) {
          S.sat(m, luong, 'vl');
          if (m.tuong) S.cham(m, p.slow, p.slow_duration);
        });
        S.fx({ loai: 'cuoi', x: pt[0], y: pt[1], dien: true, r: S.kc(p.explosion_range) });
      });
      return true;
    }
  };

  /* ══════════════════ BOOMERANG HUNTER (Range, AD) ══════════════════ */
  G.CHIEU_TFM.boomerang_hunter = {
    /* skill "Ném Boomerang": bay thẳng xuyên địch tới hết tầm rồi xoay tại chỗ gây sát thương theo
       thời gian (`dot_*`). */
    skill: function (S) {
      var p = S.p, h = S.huong();
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dan(null, ex, ey, p.speed, function (m) { S.sat(m, luong, 'vl'); },
        {
          r: S.kc(p.attack_range), xuyen: true, ketThuc: function (x, y) {
            var moiLan = S.dmg(p.dot_damage, p.dot_attack_ratio, 'atk');
            S.vung(x, y, p.dot_range, p.dot_duration, p.attack_period, function (V, ds) {
              ds.forEach(function (m) { S.sat(m, moiLan, 'vl'); });
            }, {});
            S.fx({ loai: 'chieu', x: x, y: y, dien: true, r: S.kc(p.dot_range) });
          }
        });
      return true;
    },
    /* skill2 "Boomerang Tán Xạ": 3 chiếc toả hình quạt (số 3 là cố định trong mô tả TFM2, không phải
       tham số dữ liệu), bay đi rồi quay lại đúng đường cũ, đánh cả hai lượt. */
    skill2: function (S) {
      var p = S.p, h = S.huong();
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      var goc = Math.atan2(h[1], h[0]);
      [-0.15, 0, 0.15].forEach(function (lech) {
        var gg = goc + lech;
        var ex = S.n.x + Math.cos(gg) * S.kc(p.range), ey = S.n.y + Math.sin(gg) * S.kc(p.range);
        var trung = {};
        function danh(m) { if (trung[m.i]) return; trung[m.i] = 1; S.sat(m, luong, 'vl'); }
        var ox = S.n.x, oy = S.n.y;
        S.dan(null, ex, ey, p.speed, danh, {
          r: S.kc(p.attack_range), xuyen: true, ketThuc: function () {
            S.dan(null, ox, oy, p.speed, danh, { r: S.kc(p.attack_range), xuyen: true });
          }
        });
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: S.n.x + h[0] * S.kc(p.range), y2: S.n.y + h[1] * S.kc(p.range) });
      return true;
    },
    /* ult "Nảy Bật": trúng tướng địch thì nảy sang tướng địch khác gần nhất còn lại, sát thương cộng
       dồn mỗi lần nảy, tối đa `max_bounce` lần. */
    ult: function (S) {
      var p = S.p, h = S.huong();
      var luong0 = S.dmg(p.attack, p.attack_ratio, 'atk');
      var trung = {};
      function ban(tx, ty, lanThu) {
        S.dan(null, tx, ty, p.speed, function (m) {
          if (trung[m.i]) return;
          trung[m.i] = 1;
          S.sat(m, luong0 * (1 + p.damage_increase_per_bounce / 100 * lanThu), 'vl');
          if (lanThu >= p.max_bounce) return;
          var ke = null, gd = 1e9;
          S.dich(m.x, m.y, p.bounce_range, { tuong: true }).forEach(function (k) {
            if (trung[k.i]) return;
            var d = Math.hypot(k.x - m.x, k.y - m.y);
            if (d < gd) { gd = d; ke = k; }
          });
          if (ke) ban(ke.x, ke.y, lanThu + 1);
        }, { r: S.kc(p.attack_range) });
      }
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      ban(ex, ey, 0);
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: ex, y2: ey });
      return true;
    }
  };

  /* ══════════════════ CAVALRY KNIGHT (Melee, AD, CC) ══════════════════ */
  G.CHIEU_TFM.cavalry_knight = {
    /* skill "Thiết Kỵ Xung Kích": lướt xuyên trúng người ĐẦU TIÊN, trói + chảy máu.
       "Tốc độ lướt tỉ lệ thuận Tốc Độ Di Chuyển" (move_speed_ratio) không mô phỏng vì đổi đơn vị
       sim/TFM2 qua lại cho một hệ số tỉ lệ tốc là không đáng — dùng thẳng `speed` gốc của chiêu. */
    skill: function (S) {
      var p = S.p, h = S.huong();
      var d = S.kc(p.range);
      var tx = S.n.x + h[0] * d, ty = S.n.y + h[1] * d;
      var trung = null, luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      var docLuong = S.dmg(p.bleed, p.bleed_ratio, 'atk') * S.TPS / p.bleed_tick;
      S.lao(tx, ty, p.speed, null, {
        moiBuoc: function () {
          if (trung) return;
          var ds = S.dich(S.n.x, S.n.y, p.attack_range, { tuong: true });
          if (!ds.length) return;
          var m = ds[0];
          trung = m;
          S.sat(m, luong, 'vl');
          S.troi(m, p.bind);
          S.doc(m, docLuong, p.tick, 'vl', S.kn.ten);
        }
      });
      return true;
    },
    /* skill2 "Ngọn Thương Rực Lửa": tự buff tốc chạy.
       [CHƯA LÀM ĐƯỢC] phần "đòn đánh thường gây thêm sát thương thiêu đốt" trong `{BurnTime}` giây cần
       một khoá buff kiểu "cộng hiệu ứng cháy vào đòn đánh kế tiếp" mà bảng buff của `chieu.js`
       (`atk ap hp giap khang…`) chưa có — đã ghi yêu cầu trong kế hoạch. */
    skill2: function (S) {
      var p = S.p;
      S.buff(S.n, { tocchay: p.move_speed }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, aura: true });
      return true;
    },
    /* ult "Anh Em Xông Lên Nào!": tự buff tốc chạy theo SMCK.
       [CHƯA LÀM ĐƯỢC] "con đường" tăng tốc đồng minh không có tham số khoảng cách/bán kính nào trong dữ
       liệu (không phải bị bỏ sót — TFM2 xử lý bằng hình học vệt đường trong exe) nên không bịa số; chỉ
       làm đúng phần tự buff, có vá `mota` vì {SpeedCoef} không nằm trong bảng ứng viên (hiện `?`). */
    ult: function (S) {
      var p = S.p;
      var tocBuff = p.move_speed + p.move_speed_attack_ratio / 100 * S.cs.atk;
      S.buff(S.n, { tocchay: tocBuff }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true });
      return true;
    },
    mota: {
      ult: 'Cavalry tăng Tốc Độ Di Chuyển bằng 50% + 10% SMCK trong 4 giây, đồng thời tạo ra một con đường hướng về vị trí của bản thân. Đồng minh đứng trên con đường khi di chuyển về phía Cavalry sẽ được tăng Tốc Độ Di Chuyển bằng 50% + 10% SMCK. (Cơ chế "con đường" chưa mô phỏng: dữ liệu TFM2 không có tham số khoảng cách cho phần này.)'
    }
  };

  /* ══════════════════ CHEF (Util, AP, Heal, Tank, Magic) ══════════════════ */
  G.CHIEU_TFM.chef = {
    /* skill "Ném Dao Phay": skillshot làm chậm. */
    skill: function (S) {
      var p = S.p, h = S.huong();
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.dan(null, ex, ey, p.speed, function (m) {
        S.sat(m, luong, 'pt');
        if (m.tuong) S.cham(m, p.slow_speed, p.slow_duration);
      }, { r: S.kc(p.attack_range) });
      return true;
    },
    /* skill2 "Suất Ăn Nóng Hổi": vùng hồi quanh mình; hồi nhiều hơn khi chỉ có một mình trong vùng. */
    skill2: function (S) {
      var p = S.p;
      S.vung(S.n.x, S.n.y, p.range, p.dot_tick, p.dot_period, null, {
        hoi: function (V, dsMinh) {
          var chiMinh = dsMinh.length === 1 && dsMinh[0] === S.n;
          dsMinh.forEach(function (m) {
            var luong = chiMinh ? S.dmg(p.heal_self, p.heal_self_ratio, 'ap') : S.dmg(p.heal, p.heal_ratio, 'ap');
            S.hoi(m, luong);
          });
        }, ten: S.kn.ten
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    /* ult "Bữa Tối Năm Sao": tăng máu tối đa cho một đồng minh.
       [CHƯA LÀM ĐƯỢC] "phân tán 30% sát thương nhận thành sát thương theo thời gian" là kiểu chuyển hoá
       sát thương (khác giảm % thường) — `satThuong` hiện chỉ có `giamNhan`/`tangNhan` (nhân thẳng vào
       lượng nhận), không có chỗ tách một phần ra thành DOT — đã ghi yêu cầu trong kế hoạch. */
    ult: function (S) {
      var p = S.p, muc = (S.muc && S.muc.doi === S.n.doi && S.muc.tuong) ? S.muc : (S.dongMinhYeuNhat(p.range, true) || S.n);
      S.buff(muc, { hpM: p.max_hp_ratio }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: muc.x, y2: muc.y, hoi: true });
      return true;
    }
  };

  /* ══════════════════ CIRCUS BLADE (Assassin, AD) ══════════════════ */
  G.CHIEU_TFM.circus_blade = {
    /* skill "Phi Đao": skillshot làm chậm.
       [CHƯA LÀM ĐƯỢC] "tích trữ tối đa 2 lần, hồi khi đòn thường trúng tướng" là hệ thống ĐIỂM TÍCH LUỸ
       ngoài hồi chiêu thường (`n.cd`), cần móc vào lúc đòn đánh thường trúng — chưa có trong `chieu.js`,
       đã ghi yêu cầu. Vẫn dùng hồi chiêu một-lần thường như mọi chiêu khác (yếu hơn bản gốc nhưng không
       gãy trận). */
    skill: function (S) {
      var p = S.p, h = S.huong();
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dan(null, ex, ey, p.speed, function (m) {
        S.sat(m, luong, 'vl');
        if (m.tuong) S.cham(m, p.slow, p.slow_duration);
      }, { r: S.kc(p.attack_range) });
      return true;
    },
    /* skill2 "Bộ Hành Xuyên Vật Thể": tự buff tốc chạy + tốc đánh (bỏ qua "đi xuyên địa hình" vì sim
       không có va chạm địa hình cho tướng). */
    skill2: function (S) {
      var p = S.p;
      S.buff(S.n, { tocchay: p.move_speed, tocdanh: p.attack_speed }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, aura: true });
      return true;
    },
    /* ult "Lời Cáo Chung Sau Cùng": không có tham số tốc độ lao ⇒ dịch chuyển tức thời tới cạnh mục
       tiêu (đúng khoảng cách `range`), đánh + nổ diện rộng + đẩy lùi, biến mất sau `vanish_delay`. */
    ult: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi || m.chet > 0) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range)), dung = Math.max(0, xa - S.BK * 2);
      S.n.x += dx / d * dung; S.n.y += dy / d * dung; S.n.px = S.n.x; S.n.py = S.n.y;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      var splash = S.dmg(p.splash_attack, p.splash_attack_ratio, 'atk');
      S.dich(S.n.x, S.n.y, p.splash_range, {}).forEach(function (bi) {
        if (bi !== m) S.sat(bi, splash, 'vl');
        S.day(bi, p.knockback_speed, p.knockback_tick);
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.splash_range) });
      S.sau(p.vanish_delay, function () { S.anMinh(p.invisible_duration); });
      return true;
    }
  };

  /* ══════════════════ CLOWN (Assassin, AD) ══════════════════ */
  G.CHIEU_TFM.clown = {
    /* skill "Bí Thuật Ám Sát": dịch chuyển cạnh mục tiêu (địch hay đồng minh đều dịch được), chỉ gây
       sát thương nếu mục tiêu là địch. */
    skill: function (S) {
      var p = S.p, m = S.muc;
      if (!m) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var dung = Math.max(0, Math.min(d, S.kc(p.range)) - S.BK * 2);
      S.n.x += dx / d * dung; S.n.y += dy / d * dung; S.n.px = S.n.x; S.n.py = S.n.y;
      if (m.doi !== S.n.doi && m.chet <= 0) S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      S.buff(S.n, { tocchay: p.move_speed }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    /* skill2 "Cơn Lốc Dao Găm": ném liên tục vào địch ngẫu nhiên trong tầm; khi đang "Cuồng Loạn"
       (đã dùng ult, còn hiệu lực) mỗi dao nảy sang địch khác gần nhất, giống Nảy Bật của Boomerang
       Hunter — đúng nghĩa "cường hoá toàn bộ dao găm có khả năng nảy" của ult. */
    skill2: function (S) {
      var p = S.p;
      var cuong = S.n.buff.some(function (b) { return b.ten === 'clown:cuong_loan' && b.den > S.tran.t; });
      var rBounce = p.ult_splash_range || p.range;
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      var soLan = Math.max(1, Math.floor(p.duration / p.projectile_interval));
      S.lap(soLan, p.projectile_interval, function () {
        if (S.n.chet > 0) return;
        var ds = S.dich(S.n.x, S.n.y, p.range, { tuong: true });
        if (!ds.length) return;
        var trung = {};
        function banToi(m0) {
          if (trung[m0.i]) return;
          trung[m0.i] = 1;
          S.dan(m0, m0.x, m0.y, p.projectile_speed, function (bi) {
            S.sat(bi, luong, 'vl');
            if (!cuong) return;
            var ke = null, gd = 1e9;
            S.dich(bi.x, bi.y, rBounce, { tuong: true }).forEach(function (k) {
              if (trung[k.i]) return;
              var d = Math.hypot(k.x - bi.x, k.y - bi.y);
              if (d < gd) { gd = d; ke = k; }
            });
            if (ke) banToi(ke);
          }, {});
        }
        banToi(S.tran.rng.chon(ds));
      });
      return true;
    },
    /* ult "Gánh Xiếc Cuồng Loạn": tự đánh dấu "Cuồng Loạn" trong `buff_duration` để `skill2` đọc được. */
    ult: function (S) {
      var p = S.p;
      S.buff(S.n, {}, p.buff_duration, 'clown:cuong_loan');
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true });
      return true;
    }
  };

  /* ══════════════════ DANCER (Range, AD) ══════════════════ */
  G.CHIEU_TFM.dancer = {
    /* skill "Ném Chakram" — xem BẪY DỮ LIỆU ở đầu tệp: TFM2 đặt tên tham số là `skill1` chứ không
       phải `skill`, nên `S.p`/`S.a` rỗng và sim còn chưa BAO GIỜ gọi tới hàm này (`thuChieu` chặn ở
       `!n.tuong.tfm['skill']`). Đọc thẳng dữ liệu gốc để khi lõi vá `data-tuong.js` xong là chạy đúng
       ngay, không cần sửa lại tệp này. Không mô phỏng được phần "cộng dồn theo lượng Chakram" của
       `stack_damage_ratio` vì đó là nội tại `skill2` (không có tham số, không được gọi — xem đầu tệp). */
    skill: function (S) {
      var raw = S.n.tuong.tfm.skill1;
      if (!raw) return false;
      var m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var luong = raw.attack + raw.attack_ratio / 100 * S.cs.atk;
      S.dan(m, m.x, m.y, raw.speed, function (bi) { S.sat(bi, luong, 'vl'); }, {});
      return true;
    },
    /* ult "Bão Chakram": quạt xuyên phá rồi mỗi tia quay lại đúng đường cũ.
       Không mô phỏng phần "(+Cộng dồn)" của `base_count` (cộng dồn từ nội tại `skill2` không chạy được,
       như trên) — bắn đúng `base_count` tia gốc. */
    ult: function (S) {
      var p = S.p, h = S.huong();
      var goc = Math.atan2(h[1], h[0]);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      var luongVe = S.dmg(p.return_attack, p.return_attack_ratio, 'atk');
      var n = p.base_count, giua = (n - 1) / 2;
      for (var i = 0; i < n; i++) {
        var gg = goc + (i - giua) * 0.12;
        var ex = S.n.x + Math.cos(gg) * S.kc(p.range), ey = S.n.y + Math.sin(gg) * S.kc(p.range);
        var ox = S.n.x, oy = S.n.y;
        S.dan(null, ex, ey, p.speed, function (m) { S.sat(m, luong, 'vl'); }, {
          r: S.kc(p.attack_range), xuyen: true, ketThuc: (function (ox2, oy2) {
            return function () { S.dan(null, ox2, oy2, p.speed, function (m) { S.sat(m, luongVe, 'vl'); }, { r: S.kc(p.attack_range), xuyen: true }); };
          })(ox, oy)
        });
      }
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y });
      return true;
    }
  };

  /* ══════════════════ DARK MAGE (Magician, AP, CC, Magic) ══════════════════ */
  G.CHIEU_TFM.dark_mage = {
    /* skill "Mũi Tên Hắc Ám": skillshot trói chân. */
    skill: function (S) {
      var p = S.p, h = S.huong();
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.dan(null, ex, ey, p.speed, function (m) {
        S.sat(m, luong, 'pt');
        if (m.tuong) S.troi(m, p.bind_duration);
      }, { r: S.kc(p.attack_range) });
      return true;
    },
    /* skill2 "Vùng Đất Chết": trễ `delayed` tick rồi nổ diện; `applyed` chỉ là mốc hiện hình báo trước. */
    skill2: function (S) {
      var p = S.p, pt = S.diemMuc();
      S.fx({ loai: 'chieu', x: pt[0], y: pt[1], dien: true, r: S.kc(p.attack_range), cho: S.giay(p.applyed) });
      S.sau(p.delayed, function () {
        var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
        S.dich(pt[0], pt[1], p.attack_range, {}).forEach(function (m) { S.sat(m, luong, 'pt'); });
        S.fx({ loai: 'cuoi', x: pt[0], y: pt[1], dien: true, r: S.kc(p.attack_range) });
      });
      return true;
    },
    /* ult "Xiềng Xích Thống Khổ": liên kết mục tiêu với đồng minh gần nhất trong phạm vi `link_range`.
       [CHƯA LÀM ĐƯỢC] phần "san sẻ sát thương" giữa hai mục tiêu liên kết cần móc vào `satThuong` để
       chuyển tiếp % sang bên còn lại — `chieu.js` chưa có nguyên thuỷ nào làm việc đó, đã ghi yêu cầu.
       Vẫn chọn đúng cặp mục tiêu và đánh dấu liên kết (`buff` rỗng, chỉ để nhận biết còn hiệu lực). */
    ult: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var minh = null, gd = 1e9;
      S.tran.nguoi.forEach(function (a) {
        if (a.doi !== S.n.doi || a.chet > 0) return;
        var d = Math.hypot(a.x - m.x, a.y - m.y);
        if (d <= S.kc(p.link_range) && d < gd) { gd = d; minh = a; }
      });
      if (!minh) return false;
      S.buff(m, {}, p.debuff_duration, 'dark_mage:xiengxich');
      S.buff(minh, {}, p.debuff_duration, 'dark_mage:xiengxich');
      S.fx({ loai: 'cuoi', x: m.x, y: m.y, x2: minh.x, y2: minh.y });
      return true;
    }
  };

  /* ══════════════════ DEMON (Assassin, AD, CC) ══════════════════ */
  G.CHIEU_TFM.demon = {
    /* skill "Bàn Tay Quỷ Dị": trễ `effect_delay` rồi tóm người GẦN TÂM NHẤT trong vùng, đánh + hoán vị
       trí. */
    skill: function (S) {
      var p = S.p, pt = S.diemMuc();
      S.fx({ loai: 'chieu', x: pt[0], y: pt[1], dien: true, r: S.kc(p.attack_range), cho: S.giay(p.effect_delay) });
      S.sau(p.effect_delay, function () {
        var m = null, gd = 1e9;
        S.dich(pt[0], pt[1], p.attack_range, { tuong: true }).forEach(function (k) {
          var d = Math.hypot(k.x - pt[0], k.y - pt[1]);
          if (d < gd) { gd = d; m = k; }
        });
        if (!m) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        var mx = m.x, my = m.y;
        m.x = S.n.x; m.y = S.n.y; m.px = m.x; m.py = m.y;
        S.n.x = mx; S.n.y = my; S.n.px = S.n.x; S.n.py = S.n.y;
        S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      });
      return true;
    },
    /* skill2 "Hoá Quỷ": tự buff toàn diện. */
    skill2: function (S) {
      var p = S.p;
      S.buff(S.n, { atk: p.attack, giap: p.defence, tocchay: p.move_speed, tocdanh: p.attack_speed }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, aura: true });
      return true;
    },
    /* ult "Lửa Quỷ": mô tả ghi "Sát thương Vật lý" + "SMCK" nhưng tham số hệ số CHỈ có `magic_ratio`
       (không có `attack_ratio`) ⇒ vẫn sát thương vật lý (đúng chữ trong mô tả) nhưng hệ số quy theo AP
       (đúng tham số duy nhất có trong dữ liệu — một chiêu lai kiểu TFM2, không phải lỗi đọc số). */
    ult: function (S) {
      var p = S.p;
      var luong = S.dmg(p.attack, p.magic_ratio, 'ap');
      S.dich(S.n.x, S.n.y, p.range, {}).forEach(function (m) {
        S.sat(m, luong, 'vl');
        if (m.tuong) S.so(m, p.fear_tick);
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    }
  };

  /* ══════════════════ FIGHTER (Melee, Tank, CC) — VÍ DỤ MẪU, GIỮ NGUYÊN ══════════════════ */
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

  /* ══════════════════ OGRE (Melee, Tank, CC) ══════════════════ */
  G.CHIEU_TFM.ogre = {
    /* `skill` ("Vỏ Bọc Chiến Trận") là NỘI TẠI thật, không có tham số ở bất kỳ khoá nào — không đăng
       ký (xem ghi chú đầu tệp). */
    /* skill2 "Một Chày Từ Ta": đánh + choáng, sát thương cộng thêm theo máu tối đa CHÍNH MÌNH. */
    skill2: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk') + S.cs.hpMax * p.max_hp_ratio / 100;
      S.sat(m, luong, 'vl');
      S.choang(m, p.stun);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    /* ult "Khổng Lồ Hoá": tăng máu tối đa. {Buff} không có trong bảng ứng viên mô tả (hiện `?`) — vá
       `mota`; `max_hp_hp_ratio` (1%) cộng thẳng thêm vào phần trăm buff chính vì không rõ cơ số khác. */
    ult: function (S) {
      var p = S.p;
      var pctBuff = p.max_hp_ratio + (p.max_hp_hp_ratio || 0);
      S.buff(S.n, { hpM: pctBuff }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true });
      return true;
    },
    mota: {
      ult: 'Ogre hóa khổng lồ trong 6 giây, tăng Máu Tối Đa bằng 100% + 1% Máu Tối Đa.'
    }
  };

  /* ══════════════════ PRISONER (Melee, Tank, CC) ══════════════════ */
  G.CHIEU_TFM.prisoner = {
    /* skill "Thiết Cầu Công Phá": xuyên toàn bộ kẻ địch trên đường bay. */
    skill: function (S) {
      var p = S.p, h = S.huong();
      var ex = S.n.x + h[0] * S.kc(p.range), ey = S.n.y + h[1] * S.kc(p.range);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dan(null, ex, ey, p.speed, function (m) { S.sat(m, luong, 'vl'); }, { r: S.kc(p.attack_range), xuyen: true });
      return true;
    },
    /* skill2 "Gầm Thét": khiên tự thân + khiêu khích xung quanh. Không có tham số thời lượng khiên
       riêng (thiếu hẳn trong dữ liệu, không phải bỏ sót đọc) ⇒ dùng chung `taunt_duration` — cùng một
       tiếng gầm, khiên tồn tại đúng lúc đang khiêu khích. */
    skill2: function (S) {
      var p = S.p;
      var luong = p.shield_amount + S.cs.hpMax * p.shield_hp_ratio / 100;
      S.chan(S.n, luong, p.taunt_duration);
      S.dich(S.n.x, S.n.y, p.attack_range, { tuong: true }).forEach(function (m) { S.khieu(m, p.taunt_duration); });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.attack_range), chan: true });
      return true;
    },
    /* ult "Tử Tù Giáng Kích": lao tới mục tiêu rồi choáng+đánh diện quanh điểm đáp. */
    ult: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range)), dung = Math.max(0, xa - S.BK * 2);
      S.lao(S.n.x + dx / d * dung, S.n.y + dy / d * dung, p.speed, function () {
        var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
        S.dich(S.n.x, S.n.y, p.attack_range, {}).forEach(function (bi) {
          S.sat(bi, luong, 'vl');
          if (bi.tuong) S.choang(bi, p.stun_duration);
        });
        S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.attack_range) });
      });
      return true;
    }
  };

})(window);
