/* chieu-tfm-2.js — chiêu viết tay đúng mô tả cho nhóm tướng số 2 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   VÍ DỤ MẪU (agent lõi viết): Pyromancer — kiểu VIẾT MỘT PHẦN, giữ nguyên `skill2` gốc.

   NHÓM 2 (17 tướng): pyromancer, dokkaebi, druid, dual_blader, enchanter, executioner, exorcist,
   gambler, ghost, guardian_spirit, gunner, hammerer, hitman, hunter, ice_mage, plague_doctor,
   pole_warrior.

   ═══ BẪY DỮ LIỆU ĐÃ SẬP (báo cho agent lõi ở brain/plans/ghe-nong-tfm2-full.md) ═══
   `data-tuong.js` dựng `kn[loai].p = c[a] || {}` chỉ tra đúng khoá `skill` — nhưng dữ liệu TFM2
   gốc của 8 tướng (trong đó có 5 con của nhóm này: dokkaebi, gambler, ghost, plague_doctor,
   pole_warrior) đặt tên khối tham số đầu là `skill1` chứ không phải `skill`. Kết quả: `S.p` của
   riêng chiêu "skill" (không phải skill2/ult) của năm tướng này RỖNG — sát thương/thời lượng đọc
   ra đều là 0/undefined, mô tả tự động toàn dấu `?`. Cách né trong tệp này: hàm cục bộ `p1(S)`
   đọc thẳng `S.n.tuong.tfm.skill1`. `gunner` còn nặng hơn: không có khối `skill`/`skill1` nào cả
   (chiêu 1 của nó là NỘI TẠI "mỗi lần đánh thường tăng tốc chạy", số nằm ở `move_speed_up` /
   `move_speed_up_duration` cấp tướng) — để trống, đã ghi chú trong `mota`.

   ═══ HẠN CHẾ CHUNG (không có nguyên thuỷ, xin trong kế hoạch) ═══
   Không có móc "khi ra đòn đánh thường" (on-attack hook): xấp xỉ bằng xung lặp theo đúng nhịp
   `attack.cooltime` (dokkaebi.skill, gunner.skill2/ult). Không có móc "tham gia hạ gục" (kill
   participation): bỏ (ghost.skill/ult). Không có bộ đếm cộng dồn theo đòn đánh: coi như đã đủ dồn
   (hunter.skill2). Không có nguyên thuỷ đọc "đang bị khống chế": dual_blader.skill2 không kiểm
   lại mục tiêu có đang Trói Chân hay không. Không có nguyên thuỷ đếm "số buff trên mục tiêu":
   exorcist.ult bỏ số hạng thưởng theo buff. Không có nguyên thuỷ "tổng sát thương nhận trong lúc
   bị đánh dấu": hitman.ult chỉ trả sát thương gốc. Không có nguyên thuỷ "gỡ debuff hiện có":
   exorcist.skill chỉ hồi máu. Không có nguyên thuỷ "phản khống chế": exorcist.skill2 chỉ buff
   chỉ số. Không có nguyên thuỷ điều khiển thú triệu hồi làm việc riêng: druid.skill2 xấp xỉ bằng
   một đòn lao thẳng từ chính Druid.
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  /** năm tướng có khối tham số đầu tên là `skill1` thay vì `skill` trong dữ liệu TFM2 gốc — đọc
      thẳng, không qua S.p (xem ghi chú BẪY DỮ LIỆU ở đầu tệp). */
  function p1(S) { return S.n.tuong.tfm.skill1 || S.p; }

  /** mục tiêu phòng thủ: dùng S.muc nếu còn là địch sống trong tầm, không thì tự tìm địch gần
      nhất — để dù hệ chọn mục tiêu phía trên (G.chonMucChieu) có lỡ chọn sai (vì kn.p rỗng, xem
      trên) thì chiêu vẫn cố tự tìm một mục tiêu hợp lý. */
  function layMuc(S, r) {
    var m = S.muc;
    if (m && m.doi !== S.n.doi && (m.tuong || m.hienRa) && !(m.chet > 0)) return m;
    return S.dichGanNhat(r, { tuong: true });
  }
  function layDongMinh(S, r) {
    var m = S.muc;
    if (m && m.doi === S.n.doi && m.tuong) return m;
    return S.dongMinhYeuNhat(r, true) || S.n;
  }
  /** vụ nổ tại điểm sau một khoảng trễ cố định (không phải đạn bay — pyromancer/exorcist không
      có tham số speed cho hai chiêu này, chỉ có mốc trễ). */
  function noTre(S, tre, x, y, r, luong, loaiSat) {
    S.fx({ loai: 'chieu', x: x, y: y, dien: true, r: S.kc(r), cho: S.giay(tre) });
    S.sau(tre, function () { S.satVung(x, y, r, luong, loaiSat, {}); });
  }
  /** lao thẳng người ra chiêu tới sát mục tiêu rồi ra đòn tại chỗ (fighter-style). */
  function laoToiMuc(S, m, tam, toc, xong) {
    var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var dung = Math.max(0, Math.min(d, S.kc(tam)) - S.BK * 2);
    S.lao(S.n.x + dx / d * dung, S.n.y + dy / d * dung, toc, xong);
  }

  /* ══════════════════════════ PYROMANCER ══════════════════════════
     skill  "Quả Cầu Lửa":  ném xuống điểm chỉ định, nổ trễ {delayed} tick, gây SMPT quanh điểm.
     skill2 "Rải Thảm Lửa": (giữ nguyên bản của agent lõi) vùng đốt.
     ult    "Đại Bộc Phá":  như skill nhưng bán kính lớn hơn, trễ lâu hơn. */
  G.CHIEU_TFM.pyromancer = {
    skill: function (S) {
      var p = S.p, diem = S.diemMuc();
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      noTre(S, p.delayed, diem[0], diem[1], p.attack_range, luong, 'pt');
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      var moiLan = S.dmg(p.damage, p.attack_ratio, 'ap');
      S.vung(diem[0], diem[1], p.attack_range, p.attack_tick, p.attack_period, function (V, ds) {
        ds.forEach(function (bi) { S.sat(bi, moiLan, 'pt'); });
      }, { ten: S.kn.ten });
      return true;
    },
    ult: function (S) {
      var p = S.p, diem = S.diemMuc();
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      noTre(S, p.delayed, diem[0], diem[1], p.attack_range, luong, 'pt');
      return true;
    }
  };

  /* ══════════════════════════ DOKKAEBI ══════════════════════════
     skill  "Chày Gai Xung Kích" (dữ liệu ở `skill1`, xem p1): cường hoá {Duration} giây, đòn đánh
            tạo sóng xung kích hình nón. KHÔNG có móc on-attack — xấp xỉ bằng xung nón lặp lại
            đúng nhịp đánh thường của chính tướng trong suốt thời lượng buff.
     skill2 "Da Dày Của Yêu Tinh": lá chắn + giảm % sát thương nhận, cho bản thân.
     ult    "Cầu Lửa Tinh Linh": đạn thẳng — trúng thì Làm Chậm {SlowTime}s rồi Trói Chân
            {BindTime}s; khi Trói Chân kích hoạt, nổ vật lý quanh mục tiêu và LAN một lần hiệu ứng
            tương tự sang kẻ trúng nổ (không lan vô hạn, chỉ một tầng, để tránh đệ quy vô tận).
            Dữ liệu không có % Làm Chậm cho pha đầu (chỉ có `seal_duration`/`bind_duration` là hai
            mốc thời gian) — dùng 40% làm giả định, ghi rõ ở đây. */
  var DOKKAEBI_SLOW = 40; /* [GIẢ ĐỊNH] không có trường % làm chậm trong dữ liệu ult của dokkaebi */
  G.CHIEU_TFM.dokkaebi = {
    skill: function (S) {
      var p = p1(S);
      var nhip = (S.n.tuong.tfm.attack && S.n.tuong.tfm.attack.cooltime) || 60;
      var soLan = Math.max(1, Math.floor(p.buff_duration / nhip));
      var luong = S.dmg(p.shockwave_damage, p.shockwave_damage_ratio, 'atk');
      S.lap(soLan, nhip, function () {
        if (S.n.chet > 0) return;
        S.satVung(S.n.x, S.n.y, p.shockwave_range, luong, 'vl', { nonNua: 60 });
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p;
      S.chan(S.n, S.dmg(p.shield_amount, p.shield_attack_ratio, 'atk'), p.buff_duration);
      S.buff(S.n, { giamNhan: p.damage_reduction }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: S.n.x, y2: S.n.y, chan: true });
      return true;
    },
    ult: function (S) {
      var p = S.p, diem = S.diemMuc();
      function noTaiDiem(m) {
        if (!m || m.chet > 0) return;
        var luong = S.dmg(p.attack, p.attack_ratio, 'vl');
        S.satVung(m.x, m.y, p.spread_range, luong, 'vl', {}).forEach(function (bi) {
          if (bi === m) return;
          capChuoi(bi, false);
        });
      }
      function capChuoi(m, choLan) {
        if (!m || m.doi === S.n.doi) return;
        S.cham(m, DOKKAEBI_SLOW, p.seal_duration);
        S.sau(p.seal_duration, function () {
          if (m.chet > 0) return;
          S.troi(m, p.bind_duration);
          noTaiDiem(choLan ? m : null);
        });
      }
      S.dan(null, diem[0], diem[1], p.speed, function (m) { capChuoi(m, true); }, { r: S.kc(p.projectile_radius) });
      return true;
    },
    mota: {
      skill: 'Dokkaebi cường hóa cây chày gai của mình trong 3 giây, khiến các đòn tấn công lên kẻ địch tạo ra làn sóng xung kích lan tỏa theo hình nón. Sóng xung kích này gây Sát thương Vật lý bằng 200 + 80% SMCK.',
      skill2: 'Dokkaebi cường hóa lớp da của bản thân trong 3 giây, nhận một Lá chắn có giá trị 200 + 50% SMCK và nhận hiệu ứng Giảm 40% Sát thương.',
      ult: 'Dokkaebi ném quả cầu lửa theo đường thẳng, Làm Chậm trong 1.5 giây, sau đó Trói Chân trong 1 giây. Khi hiệu ứng Trói Chân kích hoạt, gây Sát thương Vật lý bằng 150 + 100% SMCK ra xung quanh, đồng thời hiệu ứng tương tự sẽ lan sang những kẻ địch chịu sát thương (giả định 40% Làm Chậm — dữ liệu gốc không ghi rõ số này).'
    }
  };

  /* ══════════════════════════ DRUID ══════════════════════════
     skill  "Triệu Hồi: Grizzly": chưa có gấu thì triệu hồi (S.trieuHoi); có rồi thì hồi máu.
     skill2 "Triệu Hồi: Harpy": chưa có chim thì triệu hồi; có rồi thì — do KHÔNG có nguyên thuỷ
            ra lệnh cho thú triệu hồi làm việc riêng — xấp xỉ bằng một đòn lao thẳng từ chính Druid
            tới mục tiêu bằng đúng số liệu skill_damage/…/skill_lifesteal_ratio.
     ult    "Liên Xạ Tinh Linh": {Count} viên đạn dàn hàng ngang bắn liên tiếp, đẩy lùi.
     Thời gian tồn tại của gấu/chim không có trong dữ liệu (TFM2 để thú sống tới khi bị giết) —
     game này chưa có "thú như một thực thể có thể bị giết riêng", nên đặt tạm 20 giây, và bỏ vế
     "Grizzly/Harpy bị hạ gục thì Druid chịu sát thương" (không có móc "khi thú triệu hồi chết"). */
  var DRUID_LAU_THU = 1200; /* [GIẢ ĐỊNH] 20 giây — dữ liệu TFM2 không ghi thời hạn thú triệu hồi */
  G.CHIEU_TFM.druid = {
    skill: function (S) {
      var p = S.p, gau = S.n._druidGau;
      if (gau && gau.hp > 0 && !(gau.chet > 0)) {
        S.hoi(gau, S.dmg(p.heal_amount, p.heal_ratio, 'ap'));
        S.chu(gau, 'hồi phục');
        return true;
      }
      S.n._druidGau = S.trieuHoi({ stat: p.stat, theoAP: p.stat_by_spell_power, danh: p.attack, lau: DRUID_LAU_THU, ten: S.kn.ten });
      return true;
    },
    skill2: function (S) {
      var p = S.p, chim = S.n._druidChim;
      if (chim && chim.hp > 0 && !(chim.chet > 0)) {
        var m = layMuc(S, p.skill_range);
        if (!m) return true;
        S.dan(m, m.x, m.y, p.skill_dash_speed, function (bi) {
          var thuc = S.sat(bi, S.dmg(p.skill_damage, p.skill_damage_ratio, 'ap'), 'pt');
          S.hoi(S.n, thuc * p.skill_lifesteal_ratio / 100);
        }, {});
        return true;
      }
      S.n._druidChim = S.trieuHoi({ stat: p.stat, theoAP: p.stat_by_spell_power, danh: p.attack, lau: DRUID_LAU_THU, ten: S.kn.ten });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), vx = -h[1], vy = h[0], giua = (p.projectile_count - 1) / 2;
      S.lap(p.projectile_count, p.delay_per_projectile, function (k) {
        if (S.n.chet > 0) return;
        var lech = (k - giua) * S.kc(p.lateral_spread);
        var bx = S.n.x + vx * lech, by = S.n.y + vy * lech;
        var tx = bx + h[0] * S.kc(p.range), ty = by + h[1] * S.kc(p.range);
        S.dan(null, tx, ty, p.speed, function (m) {
          S.sat(m, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt');
          S.day(m, p.knockback_speed, p.knockback_tick);
        }, { r: S.kc(p.projectile_radius) });
      });
      return true;
    },
    mota: {
      skill: 'Druid triệu hồi chú gấu Grizzly thân thiện. Nếu Grizzly bị hạ gục, cô sẽ phải chịu sát thương bằng 150 + 20% SMPT. Nếu sử dụng kỹ năng này khi Grizzly đang tồn tại, cô hồi Máu cho Grizzly một lượng bằng 100 + 30% SMPT.',
      skill2: 'Druid triệu hồi đại bàng Harpy dũng mãnh. Nếu Harpy bị hạ gục, cô sẽ phải chịu sát thương bằng 120 + 15% SMPT. Nếu sử dụng kỹ năng này khi Harpy đang tồn tại, Harpy sẽ lao tới kẻ địch, gây Sát thương Phép bằng 80 + 60% SMPT và hồi Máu bằng 30% lượng sát thương gây ra.'
    }
  };

  /* ══════════════════════════ DUAL BLADER ══════════════════════════
     skill  "Tụ Kiếm": đạn thẳng, trúng thì Trói Chân.
     skill2 "Lời Phán Quyết": lao tới mục tiêu trong tầm (KHÔNG kiểm mục tiêu có đang Bất Động hay
            không — không có nguyên thuỷ đọc trạng thái khống chế hiện có), Hất Tung + sát thương.
     ult    "Ngàn Nhát Chém": {Count} nhát Sát thương Chuẩn liên tiếp lên một mục tiêu. */
  G.CHIEU_TFM.dual_blader = {
    skill: function (S) {
      var p = S.p, h = S.huong();
      var tx = S.n.x + h[0] * S.kc(p.range), ty = S.n.y + h[1] * S.kc(p.range);
      S.dan(null, tx, ty, p.projectile_speed, function (m) {
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.troi(m, p.bind_duration);
      }, { r: S.kc(p.attack_range) });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      laoToiMuc(S, m, p.range, p.speed, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.hat(m, p.airborne);
      });
      return true;
    },
    ult: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      S.lap(p.hit_count, p.interval, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'thuc');
      });
      return true;
    }
  };

  /* ══════════════════════════ ENCHANTER ══════════════════════════
     skill  "Ngắm Bắn Ma Pháp": +Tầm Đánh cho đồng minh.
     skill2 "Thức Tỉnh Trang Bị": +% chỉ số từ Trang bị — không có nguyên thuỷ khuếch đại riêng
            phần "chỉ số đến từ đồ", xấp xỉ bằng buff % lên mọi chỉ số cộng thêm (atk/ap/hp/giáp/
            kháng), không phân biệt xuất xứ.
     ult    "Phúc Lành Siêu Việt": +SMCK(+%SMPT) +%tốc đánh +%tốc chạy + miễn khống chế. */
  G.CHIEU_TFM.enchanter = {
    skill: function (S) {
      var p = S.p, m = layDongMinh(S, p.range);
      S.buff(m, { tam: p.range_increase }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y, aura: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layDongMinh(S, p.range);
      S.buff(m, { atkM: p.percent, apM: p.percent, hpM: p.percent, giapM: p.percent, khangM: p.percent }, p.buff_duration, S.kn.ten);
      return true;
    },
    ult: function (S) {
      var p = S.p, m = layDongMinh(S, p.range);
      S.buff(m, {
        atk: S.dmg(p.attack_increase, p.attack_ratio, 'ap'),
        tocdanh: p.attack_speed_increase, tocchay: p.move_speed_increase, mienKc: 1
      }, p.buff_duration, S.kn.ten);
      return true;
    },
    mota: {
      skill: 'Enchanter cường hóa một đồng minh trong 5 giây, tăng 20 Tầm Đánh.',
      skill2: 'Enchanter cường hóa Trang bị của đồng minh trong 5 giây, tăng 30% Chỉ số nhận được từ Trang bị.',
      ult: 'Enchanter cường hóa một đồng minh trong 6 giây, tăng 50 Sức Mạnh Công Kích(+70% SMPT), 100% Tốc Độ Đánh, 50% Tốc Độ Di Chuyển và được Miễn nhiễm Khống Chế.'
    }
  };

  /* ══════════════════════════ EXECUTIONER ══════════════════════════
     skill  "Án Tử Hình": móc câu đường thẳng, trúng thì kéo về.
     skill2 "Xuất Huyết": chém + Chảy Máu (độc theo giây) + tăng % sát thương nhận.
     ult    "Lời Tuyên Án": vung bán nguyệt phía trước + Không Thể Hồi Máu. */
  G.CHIEU_TFM.executioner = {
    skill: function (S) {
      var p = S.p, h = S.huong();
      var tx = S.n.x + h[0] * S.kc(p.range), ty = S.n.y + h[1] * S.kc(p.range);
      S.dan(null, tx, ty, p.speed, function (m) {
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.keo(m, p.grab, 20);
      }, { r: S.kc(p.attack_range) });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      var moiGiay = S.dmg(p.bleed, p.bleed_ratio, 'atk') * (S.TPS / p.bleed_tick);
      S.doc(m, moiGiay, p.tick, 'vl', S.kn.ten);
      S.buff(m, { tangNhan: p.damage_amplification }, p.tick, S.kn.ten + ' (nợ)');
      return true;
    },
    ult: function (S) {
      var p = S.p;
      S.satVung(S.n.x, S.n.y, p.range, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl', { nonNua: 60 }).forEach(function (m) {
        S.buff(m, { giamHoi: 100 }, p.unhealable_time, S.kn.ten + ' (nợ)');
      });
      return true;
    },
    mota: {
      skill2: 'Executioner dùng cây móc chém vào một kẻ địch, gây Sát thương Vật lý bằng 50 + 80% SMCK và khiến mục tiêu bị Chảy Máu trong 2 giây. Kẻ địch bị Chảy Máu phải chịu Sát thương Vật lý bằng 20 + 3% SMCK mỗi 0.2 giây, đồng thời sát thương nhận vào tăng 10%.'
    }
  };

  /* ══════════════════════════ EXORCIST ══════════════════════════
     skill  "Thanh Tẩy Tội Lỗi": hồi máu — không có nguyên thuỷ gỡ debuff đang có, chỉ hồi.
     skill2 "Hồng Ân Chúa Trời": +SMCK +%tốc đánh — không có nguyên thuỷ phản khống chế, bỏ vế đó.
     ult    "Lời Phán Xét": nổ tại điểm chỉ định — không có nguyên thuỷ đếm buff trên mục tiêu nên
            bỏ số hạng thưởng theo từng buff, chỉ còn sát thương gốc. */
  G.CHIEU_TFM.exorcist = {
    skill: function (S) {
      var p = S.p, m = layDongMinh(S, p.range || 40000);
      S.hoi(m, S.dmg(p.heal, p.heal_attack_ratio, 'ap'));
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layDongMinh(S, p.range || 40000);
      S.buff(m, { atk: p.attack, tocdanh: p.attack_speed }, p.buff_duration, S.kn.ten);
      return true;
    },
    ult: function (S) {
      var p = S.p, diem = S.diemMuc();
      noTre(S, p.delay, diem[0], diem[1], p.range, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt');
      return true;
    },
    mota: {
      skill: 'Exorcist thanh tẩy hiệu ứng bất lợi cho một đồng minh và hồi Máu theo 200 + 100% SMPT.',
      skill2: 'Exorcist ban phước cho một đồng minh trong 5 giây, tăng 100 Sức Mạnh Công Kích và 100% Tốc Độ Đánh. Trong thời gian hiệu lực, nếu mục tiêu bị trúng kỹ năng khống chế, hiệu ứng khống chế đó sẽ bị phản đòn và áp dụng ngược lại lên kẻ địch.',
      ult: 'Exorcist tạo ra một vụ nổ tại vị trí chỉ định, gây Sát thương Phép bằng 150 + 80% SMPT lên kẻ địch trong phạm vi. Với mỗi bùa lợi trên người mục tiêu, gây thêm sát thương bằng 100 + 10% SMPT.'
    }
  };

  /* ══════════════════════════ GAMBLER ══════════════════════════
     skill  "Xúc Xắc May Rủi" (dữ liệu ở `skill1`, xem p1): gieo xúc xắc 1-6, đánh N lần vào điểm
            chỉ định, hệ số giảm dần theo `attack_ratio_decay` mỗi lần.
     skill2 "Con Chip Phát Nổ": ném chip tới điểm, tạo vùng làm chậm, hết giờ thì nổ.
     ult    "Ma Lực Đồng Tiền": đạn thẳng, trúng thì sát thương + Mê Hoặc. Không có nguyên thuỷ Mê
            Hoặc riêng — cách chạy chung (`chieu.js`) cũng dùng Choáng thay Mê Hoặc, viết tay theo
            đúng quy ước đó. */
  G.CHIEU_TFM.gambler = {
    skill: function (S) {
      var p = p1(S), diem = S.diemMuc();
      var roll = 1 + Math.floor(Math.random() * 6);
      S.chu(S.n, 'x' + roll);
      S.sau(p.attack_delay, function () {
        S.lap(roll, p.attack_interval, function (k) {
          if (S.n.chet > 0) return;
          var ds = S.dich(diem[0], diem[1], p.attack_range, {});
          if (!ds.length) return;
          var he = p.attack_ratio * Math.pow((p.attack_ratio_decay || 100) / 100, k);
          S.sat(ds[0], S.dmg(p.attack, he, 'atk'), 'vl');
        });
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      S.dan(null, diem[0], diem[1], p.speed, null, {
        ketThuc: function (x, y) {
          S.vung(x, y, p.attack_range, p.slow_duration, 10, function (V, ds) {
            ds.forEach(function (m) { S.cham(m, p.slow, 16); });
          }, {
            ketThuc: function () {
              S.dich(x, y, p.attack_range, {}).forEach(function (m) {
                S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
              });
            }
          });
        }
      });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong();
      var tx = S.n.x + h[0] * S.kc(p.range), ty = S.n.y + h[1] * S.kc(p.range);
      S.dan(null, tx, ty, p.speed, function (m) {
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.choang(m, p.charm_duration);
      }, { r: S.kc(p.attack_range) });
      return true;
    },
    mota: {
      skill: 'Gambler tung xúc xắc và tấn công kẻ địch trong phạm vi 10 quanh điểm ném (trong tầm ném 80) với số lần bằng với số điểm gieo được (1-6). Mỗi đòn tấn công gây Sát thương Vật lý bằng 30 + 30% SMCK, giảm dần theo từng đòn.',
      skill2: 'Gambler ném ra một con chip trong phạm vi 75, tạo một vùng có kích thước 35 gây Làm Chậm 30% trong 1 giây. Khi biến mất, vùng này sẽ phát nổ, gây Sát thương Vật lý bằng 100 + 50% SMCK lên kẻ địch trong phạm vi.'
    }
  };

  /* ══════════════════════════ GHOST ══════════════════════════
     skill  "Càn Lướt" (dữ liệu ở `skill1`, xem p1): lao thẳng + Không Thể Bị Chỉ Định. Bỏ vế
            thưởng khi tham gia hạ gục (không có móc kill-participation).
     skill2 "Đột Kích Liên Hoàn": lướt ngắn, gây sát thương lên mục tiêu đầu chạm phải. "Có thể tái
            sử dụng tối đa N lần" do hệ thống chiêu/hồi chiêu bên ngoài xử lý (không phải việc của
            hàm này) — ở đây chỉ viết MỘT lượt lướt.
     ult    "Oán Linh Thức Tỉnh": miễn nhiễm khống chế. Bỏ vế "hạ gục thì làm mới hồi chiêu". */
  G.CHIEU_TFM.ghost = {
    skill: function (S) {
      var p = p1(S), h = S.huong();
      var tx = S.n.x + h[0] * S.kc(p.range), ty = S.n.y + h[1] * S.kc(p.range);
      S.khongChon(p.block_target_tick);
      S.lao(tx, ty, p.speed, null, {});
      return true;
    },
    skill2: function (S) {
      var p = S.p, h = S.huong();
      var tx = S.n.x + h[0] * S.kc(p.attack_range), ty = S.n.y + h[1] * S.kc(p.attack_range);
      var trung = null;
      S.lao(tx, ty, p.speed, function () {
        if (trung) S.sat(trung, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      }, {
        moiBuoc: function () {
          if (trung) return;
          var ds = S.dich(S.n.x, S.n.y, 8000, {});
          if (ds.length) trung = ds[0];
        }
      });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      S.buff(S.n, { mienKc: 1 }, p.buff_duration, S.kn.ten);
      return true;
    },
    mota: {
      skill: 'Ghost lao tới theo đường thẳng, trở nên Không Thể Bị Chỉ Định. Mỗi khi tham gia hạ gục kẻ địch, nó được tăng 5 Sức Mạnh Công Kích, 1% Tốc Độ Đánh và Hồi 200 Máu.'
    }
  };

  /* ══════════════════════════ GUARDIAN SPIRIT ══════════════════════════
     skill  "Chữa Lành Tâm Hồn": hồi máu quanh mình cho đồng minh.
     skill2 "Hào Quang Bảo Hộ": lá chắn + tốc chạy cho một đồng minh.
     ult    "Thánh Vực Linh Thiêng": vùng hồi máu liên tục; nếu có đồng minh CHẾT trong vùng thì
            hồi sinh (dò trực tiếp qua S.tran.nguoi vì không có nguyên thuỷ "tìm người chết gần"). */
  G.CHIEU_TFM.guardian_spirit = {
    skill: function (S) {
      var p = S.p, luong = S.dmg(p.heal, p.ap_ratio, 'ap');
      S.dongMinh(S.n.x, S.n.y, p.range, { keMinh: true }).forEach(function (m) { S.hoi(m, luong); });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range), hoi: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layDongMinh(S, p.range);
      S.chan(m, S.dmg(p.shield, p.shield_ap_ratio, 'ap'), p.shield_tick);
      S.buff(m, { tocchay: p.move_speed }, p.buff_tick, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y, chan: true });
      return true;
    },
    ult: function (S) {
      var p = S.p, diem = S.diemMuc(), luong = S.dmg(p.heal, p.heal_ap_ratio, 'ap'), xong = false;
      S.vung(diem[0], diem[1], p.range, p.tick, p.heal_period, function () {
        if (xong) return;
        var r = S.kc(p.range);
        S.tran.nguoi.forEach(function (m) {
          if (xong || m.doi !== S.n.doi || !(m.chet > 0)) return;
          if (Math.hypot(m.x - diem[0], m.y - diem[1]) > r) return;
          S.hoiSinh(m, p.revive_hp_ratio / 100);
          S.chu(m, 'hồi sinh');
          xong = true;
        });
      }, {
        hoi: function (V, dsMinh) { dsMinh.forEach(function (m) { S.hoi(m, luong); }); },
        ten: S.kn.ten
      });
      return true;
    },
    mota: {
      ult: 'Guardian Spirit tạo ra một thánh vực trong 6 giây, liên tục Hồi Máu bằng 30 + 20% SMPT cho đồng minh trong phạm vi. Nếu có 1 Tướng đồng minh tử trận bên trong thánh vực, Tướng đó sẽ được hồi sinh và thánh vực lập tức kết thúc.'
    }
  };

  /* ══════════════════════════ GUNNER ══════════════════════════
     skill  "Cao Bồi Sải Bước": NỘI TẠI thuần tuý (không có khối skill/skill1 trong dữ liệu, chỉ có
            `move_speed_up`/`move_speed_up_duration` cấp tướng) — cần móc on-attack mà S chưa có,
            không viết được, để trống (sim chạy cách chung — rỗng, không lỗi).
     skill2 "Hoả Lực Tập Trung": +SMCK; "cứ 3 đòn thì làm chậm" cần móc on-attack — xấp xỉ bằng một
            xung chậm ngay lúc tung chiêu, dùng slow_ratio/slow_duration của chính khối đòn đánh.
     ult    "Cơn Mưa Bão Đạn": +SMCK; bắn thêm đạn vào 2 địch cạnh mục tiêu — chỉ bắn MỘT lượt lúc
            tung chiêu (không lặp lại theo từng đòn đánh vì thiếu móc on-attack); bán kính "gần
            mục tiêu" không có trong dữ liệu, dùng tạm 20 (đơn vị TFM2 20000). */
  G.CHIEU_TFM.gunner = {
    skill2: function (S) {
      var p = S.p, atk = S.n.tuong.tfm.attack || {};
      S.buff(S.n, { atk: p.attack_boost }, p.buff_duration, S.kn.ten);
      var m = layMuc(S, 60000);
      if (m && atk.slow_ratio) S.cham(m, atk.slow_ratio, atk.slow_duration || 30);
      return true;
    },
    ult: function (S) {
      var p = S.p;
      S.buff(S.n, { atk: p.attack_boost }, p.buff_duration, S.kn.ten);
      var chinh = layMuc(S, 60000);
      if (chinh) {
        S.dich(chinh.x, chinh.y, 20000, { tuong: true }).filter(function (m) { return m !== chinh; }).slice(0, 2).forEach(function (m) {
          S.sat(m, S.dmg(p.sub_damage, p.sub_damage_ratio, 'atk'), 'vl');
        });
      }
      return true;
    },
    mota: {
      skill: 'Gunner có thể tấn công kẻ địch trong khi di chuyển. Từ cấp 3, mỗi khi tấn công kẻ địch anh sẽ được tăng 1% Tốc Độ Di Chuyển trong 2 giây (nội tại theo đòn đánh — chưa mô phỏng được, thiếu móc "khi đánh trúng").',
      skill2: 'Gunner cường hóa đòn đánh trong 3 giây, tăng 10 Sức Mạnh Công Kích, đồng thời với mỗi 3 đòn đánh, viên đạn sẽ làm kẻ địch bị Làm Chậm 20% trong 0.5 giây.',
      ult: 'Gunner cường hóa đòn đánh trong 10 giây, tăng 30 Sức Mạnh Công Kích, đồng thời anh bắn thêm đạn vào 2 kẻ địch xung quanh mục tiêu. Các viên đạn thêm này gây Sát thương Vật lý bằng 30 + 30% SMCK.'
    }
  };

  /* ══════════════════════════ HAMMERER ══════════════════════════
     skill  "Vung Búa Tạ": đánh một địch gần, Hất Tung.
     skill2 "Búa Chấn Động": vận búa rồi nện xuống điểm hơi lệch phía trước, AOE + Làm Chậm.
     ult    "Phán Quyết Của Người Giữ Búa": vung bán nguyệt, Đẩy Lùi rồi Hất Tung địch va phải
            (không có va chạm vật lý thật — xấp xỉ bằng: sau khi đẩy xong, Hất Tung địch khác đứng
            gần điểm đáp của mục tiêu bị đẩy). */
  G.CHIEU_TFM.hammerer = {
    skill: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      S.hat(m, p.airborne_time);
      return true;
    },
    skill2: function (S) {
      var p = S.p, h = S.huong();
      var x = S.n.x + h[0] * S.kc(p.offset), y = S.n.y + h[1] * S.kc(p.offset);
      S.satVung(x, y, p.attack_range, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl', {}).forEach(function (m) {
        S.cham(m, p.slow_speed, p.slow_duration);
      });
      S.fx({ loai: 'chieu', x: x, y: y, dien: true, r: S.kc(p.attack_range) });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      var tick = Math.max(1, Math.round(p.push_distance / p.push_speed));
      S.satVung(S.n.x, S.n.y, p.range, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl', { nonNua: 60 }).forEach(function (m) {
        S.day(m, p.push_speed, tick);
        S.sau(tick, function () {
          if (m.chet > 0) return;
          S.dich(m.x, m.y, 8000, { tuong: true }).forEach(function (m2) {
            if (m2 !== m) S.hat(m2, p.airborne_time);
          });
        });
      });
      return true;
    },
    mota: {
      skill2: 'Hammerer vận búa lên trong một khoảng thời gian rồi nện xuống đất, gây Sát thương Vật lý bằng 50 + 120% SMCK lên các kẻ địch xung quanh trong phạm vi 60 và Làm Chậm 50% trong 2 giây.',
      ult: 'Hammerer vung mạnh cây búa, gây Sát thương Vật lý bằng 120 + 70% SMCK lên toàn bộ kẻ địch trong vùng hình bán nguyệt phạm vi 80 phía trước. Kẻ địch trúng búa sẽ bị Đẩy Lùi, và các tướng địch va chạm với mục tiêu bị đẩy lùi sẽ bị Hất Tung trong 1.5 giây.'
    }
  };

  /* ══════════════════════════ HITMAN ══════════════════════════
     skill  "Ba Viên Một": phát đầu Choáng, hai phát sau gây sát thương theo mốc thời gian riêng.
     skill2 "Xâm Nhập Bóng Đêm": dịch chuyển ra sau lưng địch gần nhất trong tầm (xấp xỉ "vừa bị
            tấn công gần nhất" bằng "gần nhất", không có sổ theo dõi đòn đánh gần nhất).
     ult    "Dấu Ấn Tử Thần": đánh dấu, sau Duration giây gây sát thương gốc (bỏ số hạng theo % sát
            thương đã nhận trong lúc đánh dấu — không có nguyên thuỷ theo dõi); hạ gục thì tàng hình. */
  G.CHIEU_TFM.hitman = {
    skill: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      S.choang(m, p.stun);
      S.sau(p.shot2_timing, function () { if (!(m.chet > 0)) S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl'); });
      S.sau(p.shot3_timing, function () { if (!(m.chet > 0)) S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl'); });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var lech = S.kc(p.behind_offset || 3000);
      S.n.x = m.x + dx / d * lech; S.n.y = m.y + dy / d * lech;
      S.n.px = S.n.x; S.n.py = S.n.y;
      S.chu(S.n, 'ẩn hiện');
      return true;
    },
    ult: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      S.chu(m, 'đánh dấu');
      S.sau(p.mark_duration, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.damage, 0, 'atk'), 'vl');
        if (m.chet > 0) S.anMinh(p.invisible_duration);
      });
      return true;
    },
    mota: {
      ult: 'Hitman đánh dấu một tướng địch, sau 4 giây gây Sát thương Vật lý bằng 50 + 50% sát thương mục tiêu gánh chịu trong thời gian bị đánh dấu. Nếu hạ gục mục tiêu, Hitman sẽ Tàng Hình trong 2 giây.'
    }
  };

  /* ══════════════════════════ HUNTER ══════════════════════════
     skill  "Chuyển Dạng Mục Tiêu": dịch chuyển tới địch + buff Tầm Đánh (không mô phỏng đổi loại
            đòn đánh cận→xa, chỉ phần cộng tầm).
     skill2 "Đột Kích Dấu Ấn": lao tới địch, Câm Lặng + sát thương (coi như đã đủ 3 cộng dồn — không
            có bộ đếm cộng dồn theo đòn đánh).
     ult    "Đoạt Mệnh Trảo": lướt thẳng, gây sát thương dọc đường đi (không mô phỏng tái thi triển
            / làm mới khi hạ gục). Dữ liệu ult không có `speed` — mượn tốc lướt của skill2. */
  var HUNTER_ULT_TOC = 5000; /* [GIẢ ĐỊNH] ult không có trường speed, mượn tốc gần với skill2 */
  G.CHIEU_TFM.hunter = {
    skill: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var dung = Math.min(d, S.kc(p.range));
      S.n.x += dx / d * dung; S.n.y += dy / d * dung;
      S.n.px = S.n.x; S.n.py = S.n.y;
      S.buff(S.n, { tam: p.ranged_range_bonus }, p.buff_duration, S.kn.ten);
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      laoToiMuc(S, m, p.range, p.speed, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.im(m, p.silence_duration);
      });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong();
      var tx = S.n.x + h[0] * S.kc(p.range), ty = S.n.y + h[1] * S.kc(p.range);
      var trung = {};
      S.lao(tx, ty, HUNTER_ULT_TOC, null, {
        moiBuoc: function () {
          S.dich(S.n.x, S.n.y, S.BK * 2 + S.kc(p.width) / 2, { tuong: true }).forEach(function (m) {
            var key = m.i != null ? 'n' + m.i : m;
            if (trung[key]) return;
            trung[key] = 1;
            S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
          });
        }
      });
      return true;
    },
    mota: {
      skill: 'Hunter dịch chuyển đến kẻ địch và chuyển sang Đánh Xa. Ả được tăng 27 Tầm Đánh.',
      skill2: 'Hunter lao đến kẻ địch đã tích đủ 3 cộng dồn, gây Sát thương Vật lý bằng 60 + 100% SMCK và làm Câm Lặng trong 1 giây. Câm Lặng khiến kẻ địch không thể dùng kỹ năng.'
    }
  };

  /* ══════════════════════════ ICE MAGE ══════════════════════════
     skill  "Đóng Băng": sát thương + Choáng đơn mục tiêu.
     skill2 "Vòng Tròn Lạnh Giá": vùng băng tồn tại, mỗi tick gây sát thương + Làm Chậm; hết giờ nổ
            Choáng toàn vùng.
     ult    "Bão Tuyết": hình nón, sát thương + Đẩy Lùi + Làm Chậm + Sa Lầy (xấp xỉ bằng Câm Lặng —
            không có nguyên thuỷ "chỉ chặn kỹ năng di chuyển" riêng). */
  G.CHIEU_TFM.ice_mage = {
    skill: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt');
      S.choang(m, p.stun_duration);
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      S.vung(diem[0], diem[1], p.attack_range, p.attack_tick, p.attack_period, function (V, ds) {
        ds.forEach(function (m) {
          S.sat(m, S.dmg(p.damage, p.damage_ratio, 'ap'), 'pt');
          S.cham(m, p.slow, p.attack_period + 6);
        });
      }, {
        ketThuc: function (dsCuoi) { dsCuoi.forEach(function (m) { S.choang(m, p.stun); }); }
      });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      S.satVung(S.n.x, S.n.y, p.range, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt', { nonNua: p.half_angle_deg }).forEach(function (m) {
        S.day(m, p.knockback_speed, p.knockback_tick);
        S.cham(m, p.slow, p.slow_duration);
        S.im(m, p.block_skill_tick);
      });
      return true;
    }
  };

  /* ══════════════════════════ PLAGUE DOCTOR ══════════════════════════
     skill  "Làm Liều Kích Thích" (dữ liệu ở `skill1`, xem p1): buff tốc đánh + tốc chạy cho bản
            thân và một đồng minh.
     skill2 "Nghi Thức Đột Kích": buff Tầm Đánh cho một đồng minh (bỏ vế "đòn đánh nhận hiệu ứng
            lướt" — không có nguyên thuỷ gắn hiệu ứng lướt vào đòn đánh người khác).
     ult    "Bí Dược Thất Truyền": trừ % máu hiện tại rồi cho Bất Tử (không tụt dưới 1) + buff chỉ
            số — đặt Bất Tử TRƯỚC khi trừ máu để không giết nhầm mục tiêu máu thấp. */
  G.CHIEU_TFM.plague_doctor = {
    skill: function (S) {
      var p = p1(S), minh2 = layDongMinh(S, p.range);
      var tocDanh = p.attack_speed + (p.attack_speed_ap_ratio || 0) * S.cs.ap / 100;
      [S.n, minh2].forEach(function (m) {
        S.buff(m, { tocdanh: tocDanh, tocchay: p.move_speed }, p.buff_duration, S.kn.ten);
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = layDongMinh(S, p.range);
      S.buff(m, { tam: p.range_increase + (p.range_increase_ap_ratio || 0) * S.cs.ap / 100 }, p.buff_duration, S.kn.ten);
      return true;
    },
    ult: function (S) {
      var p = S.p, m = layDongMinh(S, p.range);
      S.buff(m, {
        batTu: 1, atk: p.attack_increase,
        tocdanh: p.attack_speed_increase + (p.attack_speed_ap_ratio || 0) * S.cs.ap / 100,
        tocchay: p.move_speed_increase
      }, p.buff_duration, S.kn.ten);
      S.sat(m, m.hp * p.current_hp_reduce_ratio / 100, 'thuc');
      return true;
    },
    mota: {
      skill: 'Plague Doctor tiêm thuốc cho bản thân và một đồng minh, trong 3 giây cả hai được tăng Tốc Độ Đánh bằng 100% + 20% SMPT và 50% Tốc Độ Di Chuyển.',
      skill2: 'Plague Doctor thực hiện nghi thức lên một đồng minh, trong 3 giây tăng Tầm Đánh bằng 20 + 10% SMPT, đồng thời đòn đánh được nhận hiệu ứng lướt.',
      ult: 'Plague Doctor tiêm bí dược cho một đồng minh, làm giảm 50% Máu hiện tại. Đổi lại, trong 5 giây, Máu của mục tiêu sẽ không thể giảm xuống dưới 1, đồng thời được tăng 50 Sức Mạnh Công Kích, Tốc Độ Đánh bằng 100% + 20% SMPT và 50% Tốc Độ Di Chuyển.'
    }
  };

  /* ══════════════════════════ POLE WARRIOR ══════════════════════════
     skill  "Nhảy Và Đập" (dữ liệu ở `skill1`, xem p1): nhảy tới địch, đập gậy — sát thương đơn.
     skill2 "Múa Gậy": lướt ngắn, Không Thể Bị Chỉ Định trong lúc lướt, rồi vung AOE quanh mình.
     ult    "Lướt Tới": lao tới địch trong tầm, sát thương + Hất Tung. */
  G.CHIEU_TFM.pole_warrior = {
    skill: function (S) {
      var p = p1(S), m = layMuc(S, p.range);
      if (!m) return false;
      laoToiMuc(S, m, p.range, p.speed, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, h = S.huong();
      var tx = S.n.x + h[0] * S.kc(p.move_distance), ty = S.n.y + h[1] * S.kc(p.move_distance);
      S.khongChon(p.block_target_tick);
      S.lao(tx, ty, p.move_speed, function () {
        S.satVung(S.n.x, S.n.y, p.attack_range, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl', {});
        S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.attack_range) });
      });
      return true;
    },
    ult: function (S) {
      var p = S.p, m = layMuc(S, p.range);
      if (!m) return false;
      laoToiMuc(S, m, p.range, p.speed, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.hat(m, p.airborne);
      });
      return true;
    },
    mota: {
      skill: 'Pole Warrior nhảy tới kẻ địch và đập cây thiết bảng của mình xuống, gây Sát thương Vật lý bằng 60 + 100% SMCK.'
    }
  };

})(window);
